// src/lib/calendar.ts
// Servicio de integración en tiempo real con Google Calendar API y Supabase

import { supabase } from '@lib/supabase';
import {
  isPeticionRespondida,
  isAuditLogOfficialResponse,
  getSlaBucket,
  separarRespuestaMeta,
} from '@lib/subcarpetas';
import type { CalendarioEvent, CalendarioEventType, EventUrgency } from '@lib/types';

/**
 * Obtiene el token de acceso de Google OAuth desde sessionStorage o perfil en Supabase
 */
export async function getGoogleAccessToken(userId?: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  // 1. Verificar sessionStorage
  let token = sessionStorage.getItem('google_provider_token');
  if (token) return token;

  // 2. Verificar perfil del usuario en Supabase
  try {
    const rawUser = localStorage.getItem('sgd_current_user');
    let uid = userId;
    if (!uid && rawUser) {
      try { uid = JSON.parse(rawUser).id; } catch(e) {}
    }
    uid = uid || 'usr-root';

    const { data: profile } = await supabase
      .from('profiles')
      .select('google_access_token, google_calendar_connected')
      .eq('id', uid)
      .maybeSingle();

    if (profile?.google_calendar_connected && profile.google_access_token) {
      sessionStorage.setItem('google_provider_token', profile.google_access_token);
      return profile.google_access_token;
    }
  } catch (err) {
    console.warn('No se pudo obtener token de Google del perfil:', err);
  }

  return null;
}

/**
 * Normaliza una fecha o timestamp a formato YYYY-MM-DD
 */
export function normalizeCalendarDate(raw?: string | null): string {
  if (!raw) return '';
  const match = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? '';
}

function subtractCalendarDays(dateStr: string, days: number): string {
  const clean = normalizeCalendarDate(dateStr);
  if (!clean) return '';
  const parts = clean.split('-');
  const y = parseInt(parts[0] || '2026', 10);
  const m = parseInt(parts[1] || '1', 10) - 1;
  const d = parseInt(parts[2] || '1', 10);
  const dt = new Date(y, m, d - days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Calcula la urgencia y días restantes según la fecha límite respecto a hoy
 */
export function calculateEventUrgency(targetDateStr: string): { diasRestantes: number; urgencia: EventUrgency } {
  const cleanDate = normalizeCalendarDate(targetDateStr);
  if (!cleanDate) {
    return { diasRestantes: 999, urgencia: 'safe' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parts = cleanDate.split('-');
  const y = parseInt(parts[0] || '2026', 10);
  const m = parseInt(parts[1] || '1', 10) - 1;
  const d = parseInt(parts[2] || '1', 10);
  const target = new Date(y, m, d);
  target.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const bucket = getSlaBucket(diffDays);
  const urgencia: EventUrgency =
    bucket === 'critical' ? 'danger' : bucket === 'warn' ? 'warning' : 'safe';

  return { diasRestantes: diffDays, urgencia };
}

/**
 * Clasifica la categoría institucional de un evento según palabras clave
 */
export function categorizeEvent(title: string = '', desc: string = ''): CalendarioEventType {
  const text = `${title} ${desc}`.toLowerCase();

  if (text.includes('peticion') || text.includes('pqrs') || text.includes('radicado') || text.includes('tutela')) {
    return 'peticion';
  }
  if (text.includes('consejo') || text.includes('csu') || text.includes('colegiado') || text.includes('acta') || text.includes('academico')) {
    return 'colegiado';
  }
  if (text.includes('reporte') || text.includes('men') || text.includes('saces') || text.includes('snies') || text.includes('spadies') || text.includes('contraloria') || text.includes('control')) {
    return 'reporte';
  }
  if (text.includes('financier') || text.includes('pago') || text.includes('presupuest') || text.includes('dian') || text.includes('contab')) {
    return 'financiero';
  }
  return 'academica';
}

/**
 * Consulta eventos reales directamente desde la API oficial de Google Calendar
 */
export async function fetchGoogleCalendarEvents(
  timeMin?: string,
  timeMax?: string
): Promise<{ events: CalendarioEvent[]; connected: boolean; error?: string }> {
  const token = await getGoogleAccessToken();

  if (!token) {
    return { events: [], connected: false };
  }

  try {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });

    if (timeMin) params.append('timeMin', timeMin);
    if (timeMax) params.append('timeMax', timeMax);

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }
    );

    if (response.status === 401 || response.status === 403) {
      sessionStorage.removeItem('google_provider_token');
      return { events: [], connected: false, error: 'Token de Google expirado o sin alcance de calendario' };
    }

    if (!response.ok) {
      return { events: [], connected: true, error: `Error Google Calendar (${response.status})` };
    }

    const data = await response.json();
    const items = data.items || [];

    const mappedEvents: CalendarioEvent[] = items.map((item: any) => {
      const dateStr = item.start?.dateTime
        ? item.start.dateTime.slice(0, 10)
        : item.start?.date || '';

      const { diasRestantes, urgencia } = calculateEventUrgency(dateStr);
      const tipo = categorizeEvent(item.summary, item.description);

      const hora = item.start?.dateTime
        ? new Date(item.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'Todo el día';

      return {
        id: `gcal-${item.id}`,
        titulo: item.summary || 'Compromiso sin título',
        tipo,
        fecha: dateStr,
        destino: item.location || 'Google Calendar Institucional',
        responsable: item.organizer?.displayName || item.organizer?.email || 'Institucional',
        urgencia,
        diasRestantes,
        descripcion: item.description || '',
        link: item.htmlLink,
        hora,
      };
    });

    return { events: mappedEvents, connected: true };
  } catch (err: any) {
    console.error('Error consultando Google Calendar API:', err);
    return { events: [], connected: false, error: err.message };
  }
}

/**
 * Consulta fechas límites y compromisos oficiales reales registrados en Supabase
 */
export async function fetchSupabaseDeadlines(): Promise<CalendarioEvent[]> {
  const events: CalendarioEvent[] = [];

  try {
    // 1. Peticiones institucionales (activas y completadas) sin joins frágiles ni columnas inexistentes
    const [petRes, anexosRes, auditRes, respRes] = await Promise.all([
      (supabase
        .from('peticiones' as any)
        .select('*')
        .order('fecha_limite_entrega', { ascending: true }) as any),
      (supabase
        .from('peticion_anexos' as any)
        .select('id, peticion_id, nombre_archivo, es_anexo_oficina') as any),
      (supabase
        .from('audit_logs' as any)
        .select('action, action_type, entity_id, details')
        .limit(450) as any),
      (supabase
        .from('peticion_responsables' as any)
        .select('peticion_id, estado') as any),
    ]);

    const peticiones = petRes?.data || [];
    const petError = petRes?.error;
    const anexosByPet = new Map<string, any[]>();
    ((anexosRes?.data || []) as any[]).forEach((ax) => {
      if (!ax?.peticion_id) return;
      const list = anexosByPet.get(ax.peticion_id) || [];
      list.push(ax);
      anexosByPet.set(ax.peticion_id, list);
    });

    const respCountByPet = new Map<string, number>();
    ((respRes?.data || []) as any[]).forEach((rp) => {
      if (!rp?.peticion_id) return;
      respCountByPet.set(rp.peticion_id, (respCountByPet.get(rp.peticion_id) || 0) + 1);
    });

    const auditRespLogs = ((auditRes?.data || []) as any[]).filter((l) => {
      const t = String(l?.action_type || '').toUpperCase();
      return t === 'RESPUESTA' || t === 'GESTION' || String(l?.action || '').includes('EXPEDIENTE_COMPLETO');
    });

    if (petitionsHasActiveRows(peticiones)) {
      (peticiones || []).forEach((pet: any) => {
        const auditMatch = auditRespLogs.some((log: any) =>
          isAuditLogOfficialResponse(log, pet)
        );
        const petAnexos = anexosByPet.get(pet.id) || [];
        const completada = isPeticionRespondida({
          ...pet,
          peticion_anexos: petAnexos,
          tiene_respuesta_audit: auditMatch,
        });

        const { respuestaMeta } = separarRespuestaMeta(pet.instrucciones_anexos || '');
        const prorrogasList = Array.isArray((respuestaMeta as any)?.prorrogas)
          ? (respuestaMeta as any).prorrogas
          : [];
        const ultimaProrroga = prorrogasList.length > 0 ? prorrogasList[prorrogasList.length - 1] : null;

        const entregaFecha =
          normalizeCalendarDate(pet.fecha_limite_entrega) ||
          normalizeCalendarDate(ultimaProrroga?.nueva_fecha_entrega) ||
          normalizeCalendarDate(pet.created_at);
        const radicadoUrl = pet.numero_radicado
          ? `/archivos?radicado=${encodeURIComponent(pet.numero_radicado)}`
          : '/archivos';
        const depCount = respCountByPet.get(pet.id) || 0;
        const destinoTxt = depCount > 0 ? `${depCount} dependencia(s) asignadas` : 'Expediente Institucional';

        if (entregaFecha) {
          const { diasRestantes, urgencia: rawUrgencia } = calculateEventUrgency(entregaFecha);
          const urgencia: EventUrgency = completada ? 'completed' : rawUrgencia;
          events.push({
            id: `pet-${pet.id}`,
            titulo: completada
              ? `Completado ${pet.numero_radicado}: ${pet.asunto}`
              : `Vence Radicado ${pet.numero_radicado}: ${pet.asunto}`,
            tipo: 'peticion',
            fecha: entregaFecha,
            destino: destinoTxt,
            responsable: pet.solicitante_nombre || 'SGD Unitrópico',
            urgencia,
            diasRestantes: completada ? Math.max(diasRestantes, 1) : diasRestantes,
            completada,
            descripcion: completada
              ? `Expediente completado y archivado institucionalmente (límite ${entregaFecha}).`
              : `Petición oficial con plazo de entrega hasta el ${entregaFecha}.`,
            link: radicadoUrl,
            hora: completada ? 'Expediente Completo' : '17:00 (Cierre de Despacho)',
          });
        }

        const depFecha = normalizeCalendarDate(pet.fecha_limite_responsable) ||
          normalizeCalendarDate(ultimaProrroga?.nueva_fecha_responsable);

        if (!completada && depFecha && depFecha !== entregaFecha) {
          const { diasRestantes, urgencia } = calculateEventUrgency(depFecha);
          events.push({
            id: `pet-dep-${pet.id}`,
            titulo: `Límite Dependencias ${pet.numero_radicado}: ${pet.asunto}`,
            tipo: 'peticion',
            fecha: depFecha,
            destino: destinoTxt,
            responsable: pet.solicitante_nombre || 'SGD Unitrópico',
            urgencia,
            diasRestantes,
            completada: false,
            descripcion: `Fecha límite configurada para aportes de dependencias en ${pet.numero_radicado}.`,
            link: radicadoUrl,
            hora: '17:00 (Cierre Dependencias)',
          });
        }
      });
    } else if (petError) {
      console.warn('Aviso consultando peticiones para calendario:', petError.message);
    }

    // 2. Convenios interinstitucionales con fecha de finalización
    const { data: convenios } = await supabase
      .from('convenios')
      .select('id, numero, entidad, fin, supervisor, objeto')
      .not('fin', 'is', null);

    if (convenios && convenios.length > 0) {
      convenios.forEach((conv: any) => {
        const finFecha = normalizeCalendarDate(conv.fin);
        if (finFecha) {
          const { diasRestantes, urgencia } = calculateEventUrgency(finFecha);
          events.push({
            id: `conv-${conv.id}`,
            titulo: `Vencimiento Convenio ${conv.numero}: ${conv.entidad}`,
            tipo: 'reporte',
            fecha: finFecha,
            destino: conv.entidad,
            responsable: conv.supervisor || 'Dirección de Planeación',
            urgencia,
            diasRestantes,
            descripcion: conv.objeto || 'Fecha límite para liquidación o prórroga de convenio.',
            link: '/planeacion',
            hora: 'Todo el día',
          });
        }
      });
    }

    // 3. Cuerpos Colegiados (Normas y Sesiones)
    const { data: colegiados } = await supabase
      .from('colegiados_normas')
      .select('id, numero, organo, fecha, titulo')
      .not('fecha', 'is', null)
      .limit(20);

    if (colegiados && colegiados.length > 0) {
      colegiados.forEach((col: any) => {
        const colFecha = normalizeCalendarDate(col.fecha);
        if (colFecha) {
          const { diasRestantes, urgencia } = calculateEventUrgency(colFecha);
          events.push({
            id: `col-${col.id}`,
            titulo: `Sesión / Norma ${col.organo}: ${col.numero} - ${col.titulo}`,
            tipo: 'colegiado',
            fecha: colFecha,
            destino: col.organo,
            responsable: 'Secretaría General',
            urgencia,
            diasRestantes,
            descripcion: col.titulo,
            link: '/colegiados',
            hora: '09:00',
          });
        }
      });
    }
  } catch (err) {
    console.warn('Error cargando fechas de Supabase:', err);
  }

  // Fallback / mezcla segura con datos SSR incrustados si el navegador tiene restricciones RLS anon
  if (typeof document !== 'undefined') {
    const ssrEl = document.getElementById('calendario-ssr-events');
    if (ssrEl?.textContent) {
      try {
        const ssrList = JSON.parse(ssrEl.textContent) as CalendarioEvent[];
        if (Array.isArray(ssrList) && ssrList.length > 0) {
          const existingIds = new Set(events.map((e) => e.id));
          ssrList.forEach((ev) => {
            if (ev?.id && !existingIds.has(ev.id)) {
              events.push(ev);
              existingIds.add(ev.id);
            }
          });
        }
      } catch {}
    }
  }

  return events;
}

function petitionsHasActiveRows(rows: any[] | null | undefined): boolean {
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Obtiene la lista unificada de eventos (Google Calendar + Base de Datos Real)
 */
/**
 * Calcula los contadores del semáforo SLA sobre peticiones activas únicas,
 * evitando doble conteo entre expiración general (pet-) y límite de oficinas (pet-dep-).
 */
export function computeActivePeticionSlaCounts(events: CalendarioEvent[]): {
  critCount: number;
  warnCount: number;
  safeCount: number;
  completedCount: number;
} {
  const petUrgencies = new Map<string, EventUrgency>();

  (events || []).forEach((ev) => {
    if (!ev || ev.tipo !== 'peticion') return;
    if (String(ev.id || '').startsWith('pet-dep-')) return;
    const key = String(ev.id || '').startsWith('pet-')
      ? String(ev.id).slice(4)
      : String(ev.id || '');
    if (!key) return;
    if (!petUrgencies.has(key)) {
      petUrgencies.set(key, ev.completada ? 'completed' : ev.urgencia);
    }
  });

  // Fallback si existe pet-dep-<id> sin su evento general pet-<id>
  (events || []).forEach((ev) => {
    if (!ev || ev.tipo !== 'peticion') return;
    if (!String(ev.id || '').startsWith('pet-dep-')) return;
    const key = String(ev.id).slice(8);
    if (key && !petUrgencies.has(key)) {
      petUrgencies.set(key, ev.completada ? 'completed' : ev.urgencia);
    }
  });

  let critCount = 0;
  let warnCount = 0;
  let safeCount = 0;
  let completedCount = 0;

  petUrgencies.forEach((urg) => {
    if (urg === 'completed') completedCount++;
    else if (urg === 'danger') critCount++;
    else if (urg === 'warning') warnCount++;
    else safeCount++;
  });

  return { critCount, warnCount, safeCount, completedCount };
}

export async function getUnifiedCalendarEvents(
  timeMin?: string,
  timeMax?: string
): Promise<{
  events: CalendarioEvent[];
  isGoogleConnected: boolean;
  critCount: number;
  warnCount: number;
  safeCount: number;
  completedCount: number;
  error?: string;
}> {
  const [googleRes, supabaseEvents] = await Promise.all([
    fetchGoogleCalendarEvents(timeMin, timeMax),
    fetchSupabaseDeadlines(),
  ]);

  // Unificar eventos
  const allEvents = [...googleRes.events, ...supabaseEvents];

  // Ordenar cronológicamente
  allEvents.sort((a, b) => a.fecha.localeCompare(b.fecha));

  const { critCount, warnCount, safeCount, completedCount } = computeActivePeticionSlaCounts(allEvents);

  return {
    events: allEvents,
    isGoogleConnected: googleRes.connected,
    critCount,
    warnCount,
    safeCount,
    completedCount,
    error: googleRes.error,
  };
}

/**
 * Agendar un nuevo evento en Google Calendar si está autenticado
 */
export async function createGoogleCalendarEvent(eventData: {
  titulo: string;
  tipo: CalendarioEventType;
  fecha: string;
  destino?: string;
  responsable?: string;
  descripcion?: string;
}): Promise<{ success: boolean; eventId?: string; error?: string }> {
  const token = await getGoogleAccessToken();

  if (!token) {
    return { success: false, error: 'No hay sesión conectada con Google Calendar' };
  }

  try {
    const body = {
      summary: eventData.titulo,
      description: `${eventData.descripcion || ''}\n\n[SGD Unitrópico]\nTipo: ${eventData.tipo.toUpperCase()}\nDestino: ${eventData.destino || 'Institucional'}\nResponsable: ${eventData.responsable || 'General'}`,
      start: { date: eventData.fecha },
      end: { date: eventData.fecha },
    };

    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: errData.error?.message || `Error Google (${res.status})` };
    }

    const created = await res.json();
    return { success: true, eventId: created.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Inicia el flujo controlado de conexión con Google Calendar para el usuario actual
 */
export async function connectGoogleCalendar(userId?: string): Promise<void> {
  const rawUser = localStorage.getItem('sgd_current_user');
  let uid = userId;
  if (!uid && rawUser) {
    try { uid = JSON.parse(rawUser).id; } catch(e) {}
  }
  uid = uid || 'usr-root';

  window.location.href = `/api/auth/google-calendar/connect?userId=${encodeURIComponent(uid)}`;
}

/**
 * Desvincula la cuenta de Google Calendar del usuario de forma segura
 */
export async function disconnectGoogleCalendar(userId?: string): Promise<boolean> {
  const rawUser = localStorage.getItem('sgd_current_user');
  let uid = userId;
  if (!uid && rawUser) {
    try { uid = JSON.parse(rawUser).id; } catch(e) {}
  }
  uid = uid || 'usr-root';

  try {
    sessionStorage.removeItem('google_provider_token');
    const res = await fetch('/api/auth/google-calendar/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid }),
    });
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  } catch (err) {
    console.error('Error al desvincular Google Calendar:', err);
    return false;
  }
}
