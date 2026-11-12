// src/pages/api/peticiones/prorroga.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';
import { separarRespuestaMeta } from '@lib/subcarpetas';
import { resolveSessionActor } from '@lib/request-actor';

function isMissingColumnError(err: any): boolean {
  const code = String(err?.code || '').trim();
  const msg = String(err?.message || '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    msg.includes('schema cache') ||
    msg.includes('column')
  );
}

function normalizeYmd(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const m = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1] || null;
}

export const POST: APIRoute = async ({ request, clientAddress, cookies }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const peticionId = String(body.peticion_id || body.id || '').trim();
    const nuevaEntregaYmd = normalizeYmd(body.nueva_fecha_entrega || body.nueva_fecha);
    const nuevaRespYmd = normalizeYmd(body.nueva_fecha_responsable);
    const motivo = String(body.motivo || '').trim();

    if (!peticionId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Se requiere peticion_id para registrar la prórroga.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!nuevaEntregaYmd && !nuevaRespYmd) {
      return new Response(
        JSON.stringify({ success: false, error: 'Debe especificar al menos una nueva fecha límite válida.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!motivo || motivo.length < 4) {
      return new Response(
        JSON.stringify({ success: false, error: 'Debe ingresar el motivo de la prórroga para trazabilidad.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: pet, error: fetchErr } = await (supabase
      .from('peticiones' as any)
      .select('id, numero_radicado, asunto, fecha_limite_entrega, fecha_limite_responsable, instrucciones_anexos')
      .eq('id', peticionId)
      .single() as any);

    if (fetchErr || !pet) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontró la petición solicitada.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const actor = await resolveSessionActor(cookies, body.actor);
    const registeredAtIso = new Date().toISOString();

    const beforeState = {
      fecha_limite_entrega: pet.fecha_limite_entrega || null,
      fecha_limite_responsable: pet.fecha_limite_responsable || null,
    };

    const { textoLimpio, respuestaMeta } = separarRespuestaMeta(pet.instrucciones_anexos || '');
    const existingProrrogas = Array.isArray(respuestaMeta?.prorrogas) ? respuestaMeta.prorrogas : [];

    const newProrrogaEntry = {
      fecha_anterior_entrega: normalizeYmd(pet.fecha_limite_entrega),
      fecha_anterior_responsable: normalizeYmd(pet.fecha_limite_responsable),
      fecha_nueva_entrega: nuevaEntregaYmd || normalizeYmd(pet.fecha_limite_entrega),
      fecha_nueva_responsable: nuevaRespYmd || normalizeYmd(pet.fecha_limite_responsable),
      motivo,
      autorizado_por: actor.name,
      fecha_registro: registeredAtIso,
    };

    const nextMeta = {
      ...(respuestaMeta || {}),
      prorrogas: [...existingProrrogas, newProrrogaEntry],
      ultima_prorroga: newProrrogaEntry,
    };

    const packedInstrucciones = [
      textoLimpio.trim(),
      `[RESPUESTA_META]: ${JSON.stringify(nextMeta)}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const updatePayload: Record<string, any> = {
      instrucciones_anexos: packedInstrucciones,
    };
    if (nuevaEntregaYmd) {
      updatePayload.fecha_limite_entrega = `${nuevaEntregaYmd}T23:59:59-05:00`;
    }
    if (nuevaRespYmd) {
      updatePayload.fecha_limite_responsable = `${nuevaRespYmd}T23:59:59-05:00`;
    }

    let res = await (supabase
      .from('peticiones' as any)
      .update(updatePayload)
      .eq('id', peticionId)
      .select()
      .single() as any);

    if (res.error && isMissingColumnError(res.error) && 'fecha_limite_responsable' in updatePayload) {
      const { fecha_limite_responsable: _drop, ...fallbackPayload } = updatePayload;
      res = await (supabase
        .from('peticiones' as any)
        .update(fallbackPayload)
        .eq('id', peticionId)
        .select()
        .single() as any);
    }

    if (res.error) {
      return new Response(
        JSON.stringify({ success: false, error: res.error.message || 'No se pudo actualizar la fecha límite.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Ampliar expiración del portal a dependencias si cambió el plazo de responsables
    const respExpiryYmd = nuevaRespYmd || nuevaEntregaYmd;
    if (respExpiryYmd) {
      await (supabase
        .from('peticion_responsables' as any)
        .update({ fecha_expiracion_codigo: `${respExpiryYmd}T23:59:59-05:00` })
        .eq('peticion_id', peticionId) as any);
    }

    const radicadoNum = res.data?.numero_radicado || pet.numero_radicado || peticionId;
    const afterState = {
      fecha_limite_entrega: updatePayload.fecha_limite_entrega || pet.fecha_limite_entrega || null,
      fecha_limite_responsable: updatePayload.fecha_limite_responsable || pet.fecha_limite_responsable || null,
      motivo,
    };

    await logSystemActivity({
      actor,
      action: `Prórroga de plazo otorgada (${radicadoNum})`,
      actionType: 'MODIFICACION',
      entity: 'Prórroga de Plazo',
      entityId: radicadoNum,
      details: `Prórroga concedida por ${actor.name} para ${radicadoNum}. Límite general: ${newProrrogaEntry.fecha_nueva_entrega || 'Sin cambio'}, límite dependencias: ${newProrrogaEntry.fecha_nueva_responsable || 'Sin cambio'}. Motivo: ${motivo}`,
      before: beforeState,
      after: afterState,
      severity: 'WARN',
      request,
      clientAddress,
      cookies,
    }).catch((err) => console.warn('[PRORROGA] Error registrando auditoría:', err));

    return new Response(
      JSON.stringify({
        success: true,
        peticion: res.data,
        prorroga: newProrrogaEntry,
        total_prorrogas: nextMeta.prorrogas.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Error procesando solicitud de prórroga.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
