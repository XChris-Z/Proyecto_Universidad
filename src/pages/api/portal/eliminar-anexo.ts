// src/pages/api/portal/eliminar-anexo.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';
import { resolveSessionActor } from '@lib/request-actor';
import { SESSION_COOKIE_KEY } from '@lib/constants';
import { extractApprovedAnexoIds } from '@lib/revision-meta';
import {
  isGoogleDriveConfigured,
  eliminarArchivoIndividualDeDrive,
} from '@lib/google-drive';

export const POST: APIRoute = async ({ request, clientAddress, cookies }) => {
  try {
    const db = (supabaseAdmin || supabase) as any;
    const isStaffSession = Boolean(cookies.get(SESSION_COOKIE_KEY)?.value);
    const body = await request.json().catch(() => ({}));
    const anexoId = String(body.anexo_id || body.anexoId || '').trim();

    if (!anexoId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Debe especificar el anexo a eliminar.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: anexo, error: anexoErr } = await (db
      .from('peticion_anexos' as any)
      .select('*')
      .eq('id', anexoId)
      .maybeSingle() as any);

    if (anexoErr || !anexo) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontró el archivo documental solicitado.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const peticionId = anexo.peticion_id;
    const { data: pet } = await (db
      .from('peticiones' as any)
      .select('id, numero_radicado')
      .eq('id', peticionId)
      .maybeSingle() as any);

    const radicado = pet?.numero_radicado || String(peticionId);

    // Verificar si el archivo ya fue aprobado oficialmente por un funcionario
    let targetResp: any = null;
    if (anexo.peticion_responsable_id) {
      const { data: resp } = await (db
        .from('peticion_responsables' as any)
        .select('id, observaciones_entrega, estado_entrega, oficinas(nombre)')
        .eq('id', anexo.peticion_responsable_id)
        .maybeSingle() as any);
      targetResp = resp;
    }

    if (targetResp?.observaciones_entrega) {
      const approvedSet = extractApprovedAnexoIds(targetResp.observaciones_entrega);
      if (approvedSet.has(anexoId) && !isStaffSession) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Este soporte ya fue revisado y aprobado oficialmente por el Despacho. No puede ser eliminado.',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 1. Eliminar de Supabase Storage
    if (anexo.storage_path) {
      const cleanPath = anexo.storage_path.replace(/^peticiones\//, '').replace(/^\/+/, '');
      await db.storage.from('peticiones').remove([cleanPath]).catch(() => {});
    }

    // 2. Eliminar registro de peticion_anexos
    const { error: delErr } = await (db
      .from('peticion_anexos' as any)
      .delete()
      .eq('id', anexoId) as any);

    if (delErr) {
      return new Response(
        JSON.stringify({ success: false, error: delErr.message || 'Error eliminando el registro del anexo.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Comprobar si aún quedan anexos para la dependencia / subcarpeta
    if (targetResp) {
      const { data: remAnexos } = await (db
        .from('peticion_anexos' as any)
        .select('id')
        .eq('peticion_id', peticionId)
        .eq('peticion_responsable_id', targetResp.id) as any);

      const remainingCount = Array.isArray(remAnexos) ? remAnexos.length : 0;
      if (remainingCount === 0) {
        await (db
          .from('peticion_responsables' as any)
          .update({
            estado_entrega: 'Pendiente',
            fecha_entrega: null,
          })
          .eq('id', targetResp.id) as any);
      }
    }

    // 4. Eliminar de Google Drive si existe
    const cleanFileName = String(anexo.nombre_archivo || '')
      .replace(/^\[[^\]]+\]\s*/, '')
      .trim();

    if (isGoogleDriveConfigured() && cleanFileName) {
      try {
        await eliminarArchivoIndividualDeDrive(radicado, cleanFileName);
      } catch (driveErr: any) {
        console.warn('[ELIMINAR ANEXO] Aviso eliminando de Drive (no fatal):', driveErr?.message);
      }
    }

    // 5. Auditoría
    const actor = isStaffSession
      ? await resolveSessionActor(cookies)
      : {
          id: targetResp?.id || 'usr-portal',
          name: targetResp?.oficinas?.nombre || 'Dependencia Asignada',
          role: 'Dependencia Asignada',
        };

    await logSystemActivity({
      actor,
      action: `Eliminación de soporte aportado en ${radicado}`,
      actionType: 'ELIMINACION',
      entity: 'Portal Entrega Anexos',
      entityId: radicado,
      details: `Archivo "${anexo.nombre_archivo}" retirado por ${actor.name}.`,
      severity: 'INFO',
      request,
      clientAddress,
      cookies: isStaffSession ? cookies : null,
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        ok: true,
        message: 'Archivo retirado exitosamente.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Error en /api/portal/eliminar-anexo:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error interno eliminando archivo.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
