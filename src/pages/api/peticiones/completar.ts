// src/pages/api/peticiones/completar.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';
import {
  COMPLETE_EXPEDIENTE_AUDIT_ACTION,
  separarRespuestaMeta,
} from '@lib/subcarpetas';
import { resolveSessionActor } from '@lib/request-actor';
import {
  isGoogleDriveConfigured,
  respaldarExpedienteLimpioEnDrive,
} from '@lib/google-drive';

function isCheckConstraintError(err: any): boolean {
  const code = String(err?.code || '').trim();
  const msg = String(err?.message || '').toLowerCase();
  return (
    code === '23514' ||
    msg.includes('peticiones_estado_check') ||
    msg.includes('check constraint')
  );
}

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

export const POST: APIRoute = async ({ request, clientAddress, cookies }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const peticionId = String(body.peticion_id || body.id || '').trim();
    const motivo = String(body.motivo || 'Cierre interno oficial de expediente completo desde Secretaría General.').trim();

    if (!peticionId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Se requiere peticion_id para completar el expediente.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: pet, error: fetchErr } = await (supabase
      .from('peticiones' as any)
      .select('id, numero_radicado, asunto, estado, instrucciones_anexos, descripcion')
      .eq('id', peticionId)
      .single() as any);

    if (fetchErr || !pet) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontró el expediente solicitado.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const actor = await resolveSessionActor(cookies, body.actor);
    const closedAtIso = new Date().toISOString();

    const { textoLimpio, respuestaMeta } = separarRespuestaMeta(pet.instrucciones_anexos || '');
    const cleanTextWithoutFlag = textoLimpio.replace(/\[EXPEDIENTE_COMPLETO\]/gi, '').trim();

    const updatedMeta = {
      ...(respuestaMeta || {}),
      expediente_completo: true,
      fecha_cierre: closedAtIso,
      fecha_envio: respuestaMeta?.fecha_envio || closedAtIso,
      cerrado_por: actor.name,
      msg: respuestaMeta?.msg || motivo,
    };

    const packedInstrucciones = [
      cleanTextWithoutFlag,
      '[EXPEDIENTE_COMPLETO]',
      `[RESPUESTA_META]: ${JSON.stringify(updatedMeta)}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const tryUpdatePeticion = async (payload: Record<string, any>) => {
      let res = await (supabase
        .from('peticiones' as any)
        .update(payload)
        .eq('id', peticionId)
        .select()
        .single() as any);

      if (res.error && isMissingColumnError(res.error) && 'fecha_respuesta' in payload) {
        const { fecha_respuesta: _drop, ...withoutFecha } = payload;
        res = await (supabase
          .from('peticiones' as any)
          .update(withoutFecha)
          .eq('id', peticionId)
          .select()
          .single() as any);
      }
      return res;
    };

    const candidateStates = ['Respondida', 'respondida', 'completada', 'cerrada', 'finalizada'];
    let updated: any = null;
    let updateErr: any = null;

    for (const candidate of candidateStates) {
      const res = await tryUpdatePeticion({
        estado: candidate,
        instrucciones_anexos: packedInstrucciones,
        fecha_respuesta: closedAtIso,
      });
      updated = res.data;
      updateErr = res.error;
      if (!updateErr) break;
      if (!isCheckConstraintError(updateErr)) break;
    }

    if (updateErr && isCheckConstraintError(updateErr)) {
      const safeRes = await tryUpdatePeticion({
        instrucciones_anexos: packedInstrucciones,
        fecha_respuesta: closedAtIso,
      });
      updated = safeRes.data;
      updateErr = safeRes.error;
    }

    if (updateErr) {
      return new Response(
        JSON.stringify({ success: false, error: updateErr.message || 'No se pudo completar el expediente.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const radicadoNum = updated?.numero_radicado || pet.numero_radicado || peticionId;

    await logSystemActivity({
      actor,
      action: COMPLETE_EXPEDIENTE_AUDIT_ACTION,
      actionType: 'GESTION',
      entity: 'Módulo Archivos',
      entityId: radicadoNum,
      details: `Expediente ${radicadoNum} marcado como completo internamente por ${actor.name}. ${motivo}`,
      before: { estado: pet.estado },
      after: {
        estado: updated?.estado || pet.estado,
        expediente_completo: true,
        fecha_cierre: closedAtIso,
        cerrado_por: actor.name,
      },
      severity: 'INFO',
      request,
      clientAddress,
      cookies,
    }).catch((err) => console.warn('[COMPLETAR EXPEDIENTE] Error registrando auditoría:', err));

    // Sincronización automática del cierre oficial en Google Drive (no bloqueante)
    let driveSynced = false;
    let driveUrl: string | null = updated?.respuesta_drive_url || null;
    if (isGoogleDriveConfigured()) {
      try {
        const driveRes = await respaldarExpedienteLimpioEnDrive(peticionId);
        driveSynced = true;
        driveUrl = driveRes.webViewLink || driveUrl;
      } catch (driveErr: any) {
        console.warn('[COMPLETAR EXPEDIENTE] Aviso sincronizando cierre en Drive (no fatal):', driveErr?.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        peticion: updated ? { ...updated, respuesta_drive_url: driveUrl || updated.respuesta_drive_url } : updated,
        expediente_completo: true,
        fecha_cierre: closedAtIso,
        driveSynced,
        driveUrl,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Error marcando expediente como completo.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
