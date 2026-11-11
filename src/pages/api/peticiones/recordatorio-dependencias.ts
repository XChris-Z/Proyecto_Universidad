// src/pages/api/peticiones/recordatorio-dependencias.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import {
  enviarCorreoRecordatorioDependencia,
  resolvePublicBaseUrl,
  limpiarTextoRequerimiento,
} from '@lib/email';
import { logSystemActivity } from '@lib/audit';
import { getDeterministicPin } from '@lib/security';
import { separarRespuestaMeta, filtrarSubcarpetasValidas } from '@lib/subcarpetas';

const inFlightMarkers = new Set<string>();
let activeRunPromise: Promise<RecordatorioRunResult> | null = null;

interface RecordatorioDetailItem {
  radicado: string;
  asignacionId: string;
  oficina: string;
  email: string;
  diasRestantes: number;
  status: 'sent' | 'error';
  error?: string;
}

interface RecordatorioRunResult {
  success: boolean;
  checked: number;
  remindersSent: number;
  skippedAlreadyDelivered: number;
  skippedAlreadyNotified: number;
  skippedOutOfWindow: number;
  errors: number;
  details: RecordatorioDetailItem[];
}

function getTodayBogotaYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function extractYmd(rawDate: string | null | undefined): string | null {
  if (!rawDate) return null;
  const trimmed = String(rawDate).trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match && match[1]) return match[1];
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function subtractDaysYmd(ymd: string, days: number): string {
  const ms = Date.parse(`${ymd}T12:00:00Z`) - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function diffCalendarDays(targetYmd: string, baseYmd: string): number {
  const tMs = Date.parse(`${targetYmd}T00:00:00Z`);
  const bMs = Date.parse(`${baseYmd}T00:00:00Z`);
  return Math.round((tMs - bMs) / 86_400_000);
}

async function runReminderSweep(originUrl: string): Promise<RecordatorioRunResult> {
  const todayYmd = getTodayBogotaYmd();

  // 1. Consultar peticiones con responsables y anexos
  const { data: dbPeticiones, error: petErr } = await (supabase
    .from('peticiones' as any)
    .select(`
      id,
      numero_radicado,
      asunto,
      categoria,
      prioridad,
      descripcion,
      instrucciones_anexos,
      estado,
      fecha_radicacion,
      created_at,
      fecha_limite_entrega,
      fecha_limite_responsable,
      peticion_anexos (
        id,
        nombre_archivo,
        es_anexo_oficina,
        peticion_responsable_id,
        subido_por_email
      ),
      peticion_responsables (
        id,
        oficina_id,
        codigo_acceso,
        estado_entrega,
        fecha_expiracion_codigo,
        observaciones_entrega,
        oficinas (
          id,
          codigo,
          nombre,
          email_institucional
        )
      )
    `)
    .order('created_at', { ascending: false }) as any);

  if (petErr) {
    throw new Error(petErr.message || 'Error consultando peticiones para recordatorios');
  }

  // 2. Consultar subcarpetas y mapeo subcarpeta_id de forma defensiva
  const subcarpetasPorPeticion: Record<string, any[]> = {};
  try {
    const { data: allSubs } = await (supabase
      .from('peticion_subcarpetas' as any)
      .select('id, peticion_id, nombre, descripcion') as any);
    if (Array.isArray(allSubs)) {
      allSubs.forEach((s: any) => {
        const pid = String(s?.peticion_id || '');
        if (!pid) return;
        if (!subcarpetasPorPeticion[pid]) subcarpetasPorPeticion[pid] = [];
        subcarpetasPorPeticion[pid]!.push(s);
      });
    }
  } catch {}

  const respSubcarpetaMap: Record<string, string> = {};
  try {
    const { data: respSubs } = await (supabase
      .from('peticion_responsables' as any)
      .select('id, subcarpeta_id') as any);
    if (Array.isArray(respSubs)) {
      respSubs.forEach((r: any) => {
        if (r?.id && r?.subcarpeta_id) respSubcarpetaMap[r.id] = r.subcarpeta_id;
      });
    }
  } catch {}

  // 3. Cargar marcadores ya enviados desde audit_logs para evitar duplicados
  const sentMarkers = new Set<string>();
  try {
    const { data: existingLogs } = await supabase
      .from('audit_logs')
      .select('entity_id, details')
      .or('entity_id.like.RECORDATORIO_3DIAS_%,details.ilike.%RECORDATORIO_3DIAS_%');

    if (Array.isArray(existingLogs)) {
      existingLogs.forEach((row: any) => {
        if (row?.entity_id && String(row.entity_id).startsWith('RECORDATORIO_3DIAS_')) {
          sentMarkers.add(String(row.entity_id).trim());
        }
        const matchedTags = String(row?.details || '').match(/RECORDATORIO_3DIAS_[a-zA-Z0-9_-]+/g);
        if (matchedTags) {
          matchedTags.forEach((t) => sentMarkers.add(t.trim()));
        }
      });
    }
  } catch {}

  let checked = 0;
  let remindersSent = 0;
  let skippedAlreadyDelivered = 0;
  let skippedAlreadyNotified = 0;
  let skippedOutOfWindow = 0;
  let errors = 0;
  const details: RecordatorioDetailItem[] = [];

  const peticiones = (dbPeticiones as any[]) || [];

  for (const pet of peticiones) {
    const estadoLower = String(pet?.estado || '').trim().toLowerCase();
    if (['respondida', 'completada', 'cerrada', 'archivada', 'finalizada'].includes(estadoLower)) {
      continue;
    }

    const { textoLimpio: instruccionesLimpias, respuestaMeta } = separarRespuestaMeta(
      pet.instrucciones_anexos || pet.descripcion || ''
    );
    if (respuestaMeta && (respuestaMeta.fecha_envio || respuestaMeta.msg)) {
      continue;
    }

    const responsables = Array.isArray(pet.peticion_responsables) ? pet.peticion_responsables : [];
    const anexos = Array.isArray(pet.peticion_anexos) ? pet.peticion_anexos : [];
    const subcarpetasPet = filtrarSubcarpetasValidas(subcarpetasPorPeticion[pet.id] || []);

    for (const resp of responsables) {
      checked++;

      const ofi = Array.isArray(resp.oficinas) ? resp.oficinas[0] : resp.oficinas;
      const ofiNombre = String(ofi?.nombre || 'Dependencia Asignada').trim();
      const ofiEmail = String(ofi?.email_institucional || '').trim();

      if (!ofiEmail || !ofiEmail.includes('@')) {
        skippedOutOfWindow++;
        continue;
      }

      // Verificar si ya entregó por estado_entrega o por archivo subido en peticion_anexos
      const estadoEntLower = String(resp.estado_entrega || '').trim().toLowerCase();
      const yaEntregadoPorEstado = ['entregado', 'entregada', 'completado', 'completada', 'respondido', 'respondida'].includes(
        estadoEntLower
      );
      const yaTieneAnexo = anexos.some((a: any) => {
        if (a?.peticion_responsable_id && String(a.peticion_responsable_id) === String(resp.id)) {
          return true;
        }
        if (a?.es_anexo_oficina && ofiEmail && String(a.subido_por_email || '').trim().toLowerCase() === ofiEmail.toLowerCase()) {
          return true;
        }
        return false;
      });

      if (yaEntregadoPorEstado || yaTieneAnexo) {
        skippedAlreadyDelivered++;
        continue;
      }

      // Calcular fecha límite de la dependencia y días restantes
      const fechaEntregaYmd = extractYmd(pet.fecha_limite_entrega);
      const deadlineYmd =
        extractYmd(pet.fecha_limite_dependencias) ||
        extractYmd(pet.fecha_limite_responsable) ||
        extractYmd(resp.fecha_expiracion_codigo) ||
        (fechaEntregaYmd ? subtractDaysYmd(fechaEntregaYmd, 5) : null);

      if (!deadlineYmd) {
        skippedOutOfWindow++;
        continue;
      }

      const diasRestantes = diffCalendarDays(deadlineYmd, todayYmd);
      if (diasRestantes > 3 || diasRestantes < 0) {
        skippedOutOfWindow++;
        continue;
      }

      // Deduplicación con marca RECORDATORIO_3DIAS_${asignacionId}
      const markerKey = `RECORDATORIO_3DIAS_${resp.id}`;
      if (sentMarkers.has(markerKey) || inFlightMarkers.has(markerKey)) {
        skippedAlreadyNotified++;
        continue;
      }

      // Resolver subcarpeta asignada e instrucción específica
      const subId = resp.subcarpeta_id || respSubcarpetaMap[resp.id] || null;
      let nombreSubcarpeta = '';
      let instruccionSubcarpeta = '';

      if (subId) {
        const subObj = subcarpetasPet.find((s: any) => String(s.id) === String(subId));
        if (subObj) {
          nombreSubcarpeta = String(subObj.nombre || '').trim();
          instruccionSubcarpeta = subObj.descripcion ? limpiarTextoRequerimiento(subObj.descripcion) : '';
        }
      }

      if (!nombreSubcarpeta) {
        const { textoLimpio: cleanRespObs } = separarRespuestaMeta(resp.observaciones_entrega || '');
        const withoutPin = cleanRespObs.replace(/^PIN:\s*[0-9A-Z]{6}(\s*\|\s*)?/i, '').trim();
        const tagMatches = Array.from(withoutPin.matchAll(/\[([^\]\r\n]+)\]/g))
          .map((m) => String(m?.[1] || '').trim())
          .filter((name) => name && !name.toUpperCase().includes('RESPUESTA_META'));

        if (tagMatches.length > 0) {
          nombreSubcarpeta = tagMatches.join(' / ');
          const matchedObjs = subcarpetasPet.filter((s: any) =>
            tagMatches.some((t) => t.toLowerCase() === String(s.nombre || '').trim().toLowerCase())
          );
          if (matchedObjs.length > 0) {
            instruccionSubcarpeta = matchedObjs
              .map((s: any) => (s.descripcion ? limpiarTextoRequerimiento(s.descripcion) : ''))
              .filter(Boolean)
              .join('\n');
          }
        }
      }

      if (!nombreSubcarpeta) {
        nombreSubcarpeta = subcarpetasPet.length > 0
          ? subcarpetasPet.map((s: any) => s.nombre).join(' / ')
          : 'Subcarpeta de Soportes Asignada';
      }

      if (!instruccionSubcarpeta) {
        instruccionSubcarpeta = limpiarTextoRequerimiento(instruccionesLimpias);
      }

      // Resolver PIN y credenciales de acceso
      const pinMatch = String(resp.observaciones_entrega || '').match(/PIN:\s*([0-9A-Z]{6})/i);
      const storedPin = pinMatch && pinMatch[1] ? pinMatch[1].trim() : null;
      const effectivePin =
        storedPin || pet.pin_acceso || getDeterministicPin(pet.numero_radicado || pet.id);
      const codigoAcceso = String(resp.codigo_acceso || 'UPQ').trim();

      const portalUrl =
        `${originUrl}/portal-responsable?radicado=${encodeURIComponent(pet.numero_radicado)}` +
        `&codigo=${encodeURIComponent(codigoAcceso)}` +
        `&email=${encodeURIComponent(ofiEmail)}` +
        `&pin=${encodeURIComponent(effectivePin)}`;

      inFlightMarkers.add(markerKey);
      try {
        const emailResult = await enviarCorreoRecordatorioDependencia({
          toEmail: ofiEmail,
          oficinaNombre: ofiNombre,
          numeroRadicado: pet.numero_radicado,
          tituloPeticion: pet.asunto || 'Solicitud Institucional',
          categoria: pet.categoria || null,
          prioridad: pet.prioridad || null,
          nombreSubcarpeta,
          instruccionSubcarpeta,
          fechaRadicacion: pet.fecha_radicacion || pet.created_at || null,
          fechaLimiteDependencia: deadlineYmd,
          diasRestantes,
          codigoAccesoDependencia: codigoAcceso,
          pinAcceso: effectivePin,
          portalUrl,
        });

        if (emailResult.success) {
          sentMarkers.add(markerKey);
          remindersSent++;

          await logSystemActivity({
            actor: { id: 'usr-root', name: 'Sistema Automático SGD', role: 'Automatización' },
            action: `Recordatorio 3 días enviado a ${ofiNombre} (${pet.numero_radicado})`,
            actionType: 'GESTION',
            entity: pet.numero_radicado,
            entityId: markerKey,
            details: `[${markerKey}] Recordatorio preventivo automático (${diasRestantes} día(s) restantes, límite ${deadlineYmd}) enviado a ${ofiEmail} para la subcarpeta "${nombreSubcarpeta}".`,
            after: {
              marker: markerKey,
              asignacion_id: resp.id,
              peticion_id: pet.id,
              numero_radicado: pet.numero_radicado,
              oficina: ofiNombre,
              email: ofiEmail,
              dias_restantes: diasRestantes,
              fecha_limite: deadlineYmd,
              message_id: emailResult.messageId || null,
            },
            severity: diasRestantes <= 1 ? 'WARN' : 'INFO',
          }).catch((auditErr) => console.warn('[RECORDATORIO] Error registrando auditoría:', auditErr));

          details.push({
            radicado: pet.numero_radicado,
            asignacionId: resp.id,
            oficina: ofiNombre,
            email: ofiEmail,
            diasRestantes,
            status: 'sent',
          });
        } else {
          errors++;
          details.push({
            radicado: pet.numero_radicado,
            asignacionId: resp.id,
            oficina: ofiNombre,
            email: ofiEmail,
            diasRestantes,
            status: 'error',
            error: emailResult.error || 'Error desconocido al enviar SMTP',
          });
        }
      } finally {
        inFlightMarkers.delete(markerKey);
      }
    }
  }

  return {
    success: true,
    checked,
    remindersSent,
    skippedAlreadyDelivered,
    skippedAlreadyNotified,
    skippedOutOfWindow,
    errors,
    details,
  };
}

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const publicBaseUrl = resolvePublicBaseUrl(request, url);
    if (!activeRunPromise) {
      activeRunPromise = runReminderSweep(publicBaseUrl).finally(() => {
        activeRunPromise = null;
      });
    }

    const result = await activeRunPromise;
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[RECORDATORIO DEPENDENCIAS ERROR]', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || 'Error ejecutando verificación de recordatorios a dependencias.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

