// src/pages/api/peticiones/eliminar.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';
import { resolveSessionActor } from '@lib/request-actor';
import { eliminarCarpetaRadicadoDeDrive } from '@lib/google-drive';

export const POST: APIRoute = async ({ request, clientAddress, cookies }) => {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID de petición requerido' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Obtener la petición antes de eliminar para auditoría, Drive y Storage
    const { data: peticion, error: fetchErr } = await (supabase
      .from('peticiones' as any)
      .select('id, numero_radicado, asunto, storage_folder_path, respuesta_drive_url, instrucciones_anexos, descripcion')
      .eq('id', id)
      .single() as any);

    if (fetchErr || !peticion) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontró la petición a eliminar' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const driveUrl =
      peticion.respuesta_drive_url ||
      (peticion.instrucciones_anexos?.match(/https:\/\/drive\.google\.com\/[^\s"')]+/i)?.[0]) ||
      null;

    // Paso A: Eliminar carpeta completa del radicado en Google Drive
    let driveEliminado = false;
    try {
      const driveRes = await eliminarCarpetaRadicadoDeDrive(peticion.numero_radicado, driveUrl);
      driveEliminado = driveRes.success;
    } catch (e: any) {
      console.warn('[Eliminar Radicado] Aviso en eliminación de Google Drive:', e?.message);
    }

    // Paso B: Obtener lista de archivos en Supabase Storage y purgarlos
    const { data: anexos } = await (supabase
      .from('peticion_anexos' as any)
      .select('storage_path')
      .eq('peticion_id', id) as any);

    const pathsToDelete = new Set<string>();

    if (anexos && anexos.length > 0) {
      for (const a of anexos) {
        if (a?.storage_path) {
          pathsToDelete.add(a.storage_path.replace(/^peticiones\//, '').replace(/^\/+/, ''));
        }
      }
    }

    const radPrefix = String(peticion.numero_radicado || '').trim();
    if (radPrefix) {
      try {
        const { data: listed } = await supabase.storage.from('peticiones').list(radPrefix);
        if (listed && listed.length > 0) {
          for (const item of listed) {
            if (item?.name) pathsToDelete.add(`${radPrefix}/${item.name}`);
          }
        }
      } catch {}
    }

    if (peticion.storage_folder_path) {
      const cleanPath = peticion.storage_folder_path.replace(/^peticiones\//, '').replace(/^\/+/, '');
      pathsToDelete.add(cleanPath);
      try {
        const { data: listed } = await supabase.storage.from('peticiones').list(cleanPath);
        if (listed && listed.length > 0) {
          for (const item of listed) {
            if (item?.name) pathsToDelete.add(`${cleanPath}/${item.name}`);
          }
        }
      } catch {}
    }

    if (pathsToDelete.size > 0) {
      await supabase.storage.from('peticiones').remove(Array.from(pathsToDelete)).catch((e) => {
        console.warn('Error purgando archivos en storage:', e?.message);
      });
    }

    // Paso C: Borrado en Cascada en Base de Datos + Limpieza de Huérfanos
    await (supabase.from('peticion_anexos' as any).delete().eq('peticion_id', id) as any).catch(() => {});
    await (supabase.from('peticion_responsables' as any).delete().eq('peticion_id', id) as any).catch(() => {});
    await (supabase.from('peticion_subcarpetas' as any).delete().eq('peticion_id', id) as any).catch(() => {});

    // Eliminar la petición principal
    const { error: delErr } = await (supabase
      .from('peticiones' as any)
      .delete()
      .eq('id', id) as any);

    if (delErr) {
      return new Response(
        JSON.stringify({ success: false, error: delErr.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Limpiar automáticamente cualquier fila huérfana en peticion_responsables y peticion_anexos
    try {
      const { data: allCurrentPets } = await (supabase.from('peticiones' as any).select('id') as any);
      const validPetIds = new Set((allCurrentPets || []).map((p: any) => String(p.id)));

      const { data: allResps } = await (supabase.from('peticion_responsables' as any).select('id, peticion_id') as any);
      const orphanRespIds = (allResps || [])
        .filter((r: any) => !r.peticion_id || !validPetIds.has(String(r.peticion_id)))
        .map((r: any) => r.id);
      if (orphanRespIds.length > 0) {
        await (supabase.from('peticion_responsables' as any).delete().in('id', orphanRespIds) as any);
      }

      const { data: allAnexosDb } = await (supabase.from('peticion_anexos' as any).select('id, peticion_id') as any);
      const orphanAnexoIds = (allAnexosDb || [])
        .filter((a: any) => !a.peticion_id || !validPetIds.has(String(a.peticion_id)))
        .map((a: any) => a.id);
      if (orphanAnexoIds.length > 0) {
        await (supabase.from('peticion_anexos' as any).delete().in('id', orphanAnexoIds) as any);
      }

      const { data: allSubsDb } = await (supabase.from('peticion_subcarpetas' as any).select('id, peticion_id') as any);
      const orphanSubIds = (allSubsDb || [])
        .filter((s: any) => !s.peticion_id || !validPetIds.has(String(s.peticion_id)))
        .map((s: any) => s.id);
      if (orphanSubIds.length > 0) {
        await (supabase.from('peticion_subcarpetas' as any).delete().in('id', orphanSubIds) as any);
      }
    } catch (cleanupErr) {
      console.warn('[Eliminar Radicado] Aviso en limpieza de huérfanos:', cleanupErr);
    }

    // Paso D: Registrar en la bitácora inmutable de auditoría
    const actor = await resolveSessionActor(cookies);
    await logSystemActivity({
      actor,
      action: `Eliminación de radicado ${peticion.numero_radicado}`,
      actionType: 'ELIMINACION',
      entity: 'Peticiones Radicadas',
      entityId: peticion.numero_radicado,
      details: `Se eliminó el radicado ${peticion.numero_radicado} en la plataforma y su carpeta de respaldo en Google Drive.`,
      before: peticion,
      severity: 'CRITICAL',
      request,
      clientAddress,
      cookies,
    }).catch((err) => console.warn('Error registrando auditoría de eliminación:', err));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Radicado ${peticion.numero_radicado} eliminado exitosamente.`,
        numero_radicado: peticion.numero_radicado,
        driveEliminado,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error al eliminar petición' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

