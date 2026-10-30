// src/lib/calendar.ts
// Servicio de integración en tiempo real con Google Calendar API y Supabase

import { supabase } from '@lib/supabase';
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
 * Calcula la urgencia y días restantes según la fecha límite respecto a hoy
 */
export function calculateEventUrgency(targetDateStr: string): { diasRestantes: number; urgencia: EventUrgency } {
  if (!targetDateStr) {
    return { diasRestantes: 999, urgencia: 'safe' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parts = targetDateStr.split('-');
  const y = parseInt(parts[0] || '2026', 10);
  const m = parseInt(parts[1] || '1', 10) - 1;
  const d = parseInt(parts[2] || '1', 10);
  const target = new Date(y, m, d);
  target.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let urgencia: EventUrgency = 'safe';
  if (diffDays <= 5) {
    urgencia = 'danger';
  } else if (diffDays <= 15) {
    urgencia = 'warning';
  } else {
    urgencia = 'safe';
  }

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
    // 1. Peticiones pendientes con SLA / fecha límite
    const { data: peticiones } = await supabase
      .from('peticiones')
      .select('id, numero_radicado, asunto, fecha_limite_entrega, fecha_limite_responsable, estado, solicitante_nombre')
      .neq('estado', 'respondida')
      .neq('estado', 'completada');

    if (peticiones && peticiones.length > 0) {
      peticiones.forEach((pet: any) => {
        if (pet.fecha_limite_entrega) {
          const { diasRestantes, urgencia } = calculateEventUrgency(pet.fecha_limite_entrega);
          events.push({
            id: `pet-${pet.id}`,
            titulo: `Vence Radicado ${pet.numero_radicado}: ${pet.asunto}`,
            tipo: 'peticion',
            fecha: pet.fecha_limite_entrega,
            destino: 'Oficinas Responsables',
            responsable: pet.solicitante_nombre || 'SGD Unitrópico',
            urgencia,
            diasRestantes,
            descripcion: `Petición oficial con plazo legal de entrega hasta el ${pet.fecha_limite_entrega}.`,
            link: '/peticiones',
            hora: '17:00 (Cierre de Despacho)',
          });
        }
      });
    }

    // 2. Convenios interinstitucionales con fecha de finalización
    const { data: convenios } = await supabase
      .from('convenios')
      .select('id, numero, entidad, fin, supervisor, objeto')
      .not('fin', 'is', null);

    if (convenios && convenios.length > 0) {
      convenios.forEach((conv: any) => {
        if (conv.fin) {
          const { diasRestantes, urgencia } = calculateEventUrgency(conv.fin);
          events.push({
            id: `conv-${conv.id}`,
            titulo: `Vencimiento Convenio ${conv.numero}: ${conv.entidad}`,
            tipo: 'reporte',
            fecha: conv.fin,
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
        if (col.fecha) {
          const { diasRestantes, urgencia } = calculateEventUrgency(col.fecha);
          events.push({
            id: `col-${col.id}`,
            titulo: `Sesión / Norma ${col.organo}: ${col.numero} - ${col.titulo}`,
            tipo: 'colegiado',
            fecha: col.fecha,
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

  return events;
}

/**
 * Obtiene la lista unificada de eventos (Google Calendar + Base de Datos Real)
 */
export async function getUnifiedCalendarEvents(
  timeMin?: string,
  timeMax?: string
): Promise<{
  events: CalendarioEvent[];
  isGoogleConnected: boolean;
  critCount: number;
  warnCount: number;
  safeCount: number;
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

  // Contadores de Semáforo
  let critCount = 0;
  let warnCount = 0;
  let safeCount = 0;

  allEvents.forEach((ev) => {
    if (ev.urgencia === 'danger') critCount++;
    else if (ev.urgencia === 'warning') warnCount++;
    else safeCount++;
  });

  return {
    events: allEvents,
    isGoogleConnected: googleRes.connected,
    critCount,
    warnCount,
    safeCount,
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
