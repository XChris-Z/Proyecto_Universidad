// src/pages/api/peticiones/eliminar.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';
import { resolveSessionActor } from '@lib/request-actor';
import { eliminarCarpetaRadicadoDeDrive } from '@lib/google-drive';

const db: any = supabaseAdmin || supabase;

async function procesarEliminacion(request: Request, clientAddress: string | undefined, cookies: any) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const url = new URL(request.url);
    const valorId = String(body.id || body.peticionId || url.searchParams.get('id') || url.searchParams.get('peticionId') || '').trim();
    const valorRadicado = String(body.radicado || body.numero_radicado || url.searchParams.get('radicado') || url.searchParams.get('numero_radicado') || '').trim();

    if (!valorId && !valorRadicado) {
      return new Response(
        JSON.stringify({ success: false, ok: false, error: 'ID o código de radicado de la petición requerido' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Búsqueda Dual Infalible con db (supabaseAdmin || supabase)
    let peticionEncontrada: any = null;

    // A. Búsqueda por UUID id si no es código RAD-
    if (valorId && !valorId.toUpperCase().startsWith('RAD-')) {
      const { data } = await (db
        .from('peticiones' as any)
        .select('*')
        .eq('id', valorId)
        .maybeSingle() as any);
      if (data) peticionEncontrada = data;
    }

    // B. Búsqueda por radicado (o si valorId contiene el código RAD-)
    if (!peticionEncontrada && (valorRadicado || valorId.toUpperCase().startsWith('RAD-'))) {
      const codigo = valorRadicado || valorId;
      const { data } = await (db
        .from('peticiones' as any)
        .select('*')
        .eq('numero_radicado', codigo)
        .maybeSingle() as any);
      if (data) {
        peticionEncontrada = data;
      } else {
        const { data: dFallback } = await (db
          .from('peticiones' as any)
          .select('*')
          .eq('radicado' as any, codigo)
          .maybeSingle() as any);
        if (dFallback) peticionEncontrada = dFallback;
      }
    }

    // C. Fallback or search
    if (!peticionEncontrada && valorId) {
      const { data } = await (db
        .from('peticiones' as any)
        .select('*')
        .or(`id.eq.${valorId},numero_radicado.eq.${valorId}`)
        .maybeSingle() as any);
      if (data) peticionEncontrada = data;
    }

    if (!peticionEncontrada) {
      return new Response(
        JSON.stringify({ success: false, ok: false, error: 'No se encontró la petición a eliminar' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const petId = String(peticionEncontrada.id);
    const radicadoCodigo = String(peticionEncontrada.numero_radicado || peticionEncontrada.radicado || '').trim();

    const driveUrl =
      peticionEncontrada.respuesta_drive_url ||
      (peticionEncontrada.instrucciones_anexos?.match(/https:\/\/drive\.google\.com\/[^\s"')]+/i)?.[0]) ||
      null;

    // Paso A: Eliminar carpeta completa del radicado en Google Drive (no bloqueante)
    let driveEliminado = false;
    try {
      if (radicadoCodigo) {
        const driveRes = await eliminarCarpetaRadicadoDeDrive(radicadoCodigo, driveUrl);
        driveEliminado = driveRes.success;
      }
    } catch (e: any) {
      console.warn('[Eliminar Radicado] Aviso en eliminación de Google Drive:', e?.message);
    }

    // Paso B: Purgar archivos en Supabase Storage
    const pathsToDelete = new Set<string>();

    try {
      const { data: anexos } = await (db
        .from('peticion_anexos' as any)
        .select('storage_path')
        .eq('peticion_id', petId) as any);

      if (anexos && anexos.length > 0) {
        for (const a of anexos) {
          if (a?.storage_path) {
            pathsToDelete.add(a.storage_path.replace(/^peticiones\//, '').replace(/^\/+/, ''));
          }
        }
      }

      if (radicadoCodigo) {
        const { data: listed } = await db.storage.from('peticiones').list(radicadoCodigo);
        if (listed && listed.length > 0) {
          for (const item of listed) {
            if (item?.name) pathsToDelete.add(`${radicadoCodigo}/${item.name}`);
          }
        }
      }

      if (peticionEncontrada.storage_folder_path) {
        const cleanPath = peticionEncontrada.storage_folder_path.replace(/^peticiones\//, '').replace(/^\/+/, '');
        pathsToDelete.add(cleanPath);
        const { data: listed } = await db.storage.from('peticiones').list(cleanPath);
        if (listed && listed.length > 0) {
          for (const item of listed) {
            if (item?.name) pathsToDelete.add(`${cleanPath}/${item.name}`);
          }
        }
      }

      if (pathsToDelete.size > 0) {
        await db.storage.from('peticiones').remove(Array.from(pathsToDelete)).catch(() => {});
      }
    } catch (storageErr) {
      console.warn('[Eliminar Radicado] Aviso purgando storage:', storageErr);
    }

    // Paso C: Borrado en Cascada de Hijos y Limpieza de Huérfanos
    try {
      await (db.from('peticion_anexos' as any).delete().eq('peticion_id', petId) as any);
      await (db.from('peticion_responsables' as any).delete().eq('peticion_id', petId) as any);
      await (db.from('peticion_subcarpetas' as any).delete().eq('peticion_id', petId) as any);
    } catch {}

    // Eliminar la petición principal (por id y fallback por radicado)
    const { error: delErr } = await (db
      .from('peticiones' as any)
      .delete()
      .eq('id', petId) as any);

    if (delErr) {
      if (radicadoCodigo) {
        await (db.from('peticiones' as any).delete().eq('numero_radicado', radicadoCodigo) as any);
      }
    }

    // Limpieza de huérfanos adicionales en cascada
    try {
      const { data: allCurrentPets } = await (db.from('peticiones' as any).select('id') as any);
      const validPetIds = new Set((allCurrentPets || []).map((p: any) => String(p.id)));

      const { data: allResps } = await (db.from('peticion_responsables' as any).select('id, peticion_id') as any);
      const orphanRespIds = (allResps || [])
        .filter((r: any) => !r.peticion_id || !validPetIds.has(String(r.peticion_id)))
        .map((r: any) => r.id);
      if (orphanRespIds.length > 0) {
        await (db.from('peticion_responsables' as any).delete().in('id', orphanRespIds) as any);
      }

      const { data: allAnexosDb } = await (db.from('peticion_anexos' as any).select('id, peticion_id') as any);
      const orphanAnexoIds = (allAnexosDb || [])
        .filter((a: any) => !a.peticion_id || !validPetIds.has(String(a.peticion_id)))
        .map((a: any) => a.id);
      if (orphanAnexoIds.length > 0) {
        await (db.from('peticion_anexos' as any).delete().in('id', orphanAnexoIds) as any);
      }

      const { data: allSubsDb } = await (db.from('peticion_subcarpetas' as any).select('id, peticion_id') as any);
      const orphanSubIds = (allSubsDb || [])
        .filter((s: any) => !s.peticion_id || !validPetIds.has(String(s.peticion_id)))
        .map((s: any) => s.id);
      if (orphanSubIds.length > 0) {
        await (db.from('peticion_subcarpetas' as any).delete().in('id', orphanSubIds) as any);
      }
    } catch (cleanupErr) {
      console.warn('[Eliminar Radicado] Aviso en limpieza de huérfanos:', cleanupErr);
    }

    // Paso D: Registrar en auditoría
    try {
      const actor = await resolveSessionActor(cookies);
      await logSystemActivity({
        actor,
        action: `Eliminación de radicado ${radicadoCodigo}`,
        actionType: 'ELIMINACION',
        entity: 'Peticiones Radicadas',
        entityId: radicadoCodigo,
        details: `Se eliminó el radicado ${radicadoCodigo} en la plataforma y su carpeta de respaldo en Google Drive.`,
        before: peticionEncontrada,
        severity: 'CRITICAL',
        request,
        clientAddress,
        cookies,
      });
    } catch (auditErr) {
      console.warn('[Eliminar Radicado] Aviso registrando auditoría:', auditErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        ok: true,
        message: `Radicado ${radicadoCodigo} eliminado exitosamente.`,
        deletedId: petId,
        radicado: radicadoCodigo,
        numero_radicado: radicadoCodigo,
        driveEliminado,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, ok: false, error: err.message || 'Error al eliminar petición' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export const POST: APIRoute = async ({ request, clientAddress, cookies }) => {
  return procesarEliminacion(request, clientAddress, cookies);
};

export const DELETE: APIRoute = async ({ request, clientAddress, cookies }) => {
  return procesarEliminacion(request, clientAddress, cookies);
};
