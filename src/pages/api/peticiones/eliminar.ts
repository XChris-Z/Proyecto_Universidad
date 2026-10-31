// src/pages/api/peticiones/eliminar.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID de petición requerido' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Obtener la petición antes de eliminar para auditoría y archivos
    const { data: peticion, error: fetchErr } = await (supabase
      .from('peticiones' as any)
      .select('id, numero_radicado, asunto, storage_folder_path')
      .eq('id', id)
      .single() as any);

    if (fetchErr || !peticion) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontró la petición a eliminar' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Obtener lista de archivos en Storage para purgarlos
    const { data: anexos } = await (supabase
      .from('peticion_anexos' as any)
      .select('storage_path')
      .eq('peticion_id', id) as any);

    if (anexos && anexos.length > 0) {
      const pathsToDelete = anexos
        .map((a: any) => a.storage_path.replace(/^peticiones\//, ''))
        .filter(Boolean);

      if (pathsToDelete.length > 0) {
        await supabase.storage.from('peticiones').remove(pathsToDelete).catch((e) => {
          console.warn('Error purgando archivos en storage:', e.message);
        });
      }
    }

    // 3. Eliminar anexos y responsables asociados en base de datos
    await (supabase.from('peticion_anexos' as any).delete().eq('peticion_id', id) as any);
    await (supabase.from('peticion_responsables' as any).delete().eq('peticion_id', id) as any);

    // 4. Eliminar la petición principal
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

    // 5. Registrar en la bitácora inmutable de auditoría
    await logSystemActivity({
      actor: { id: 'usr-root', name: 'Administrador General', role: 'Superadministrador' },
      action: `Eliminación de radicado ${peticion.numero_radicado}`,
      actionType: 'ELIMINACION',
      entity: 'Peticiones Radicadas',
      entityId: peticion.numero_radicado,
      details: `Se eliminó definitivamente el radicado ${peticion.numero_radicado} (${peticion.asunto}) y sus archivos asociados`,
      before: peticion,
      severity: 'CRITICAL',
    }).catch((err) => console.warn('Error registrando auditoría de eliminación:', err));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Radicado ${peticion.numero_radicado} eliminado exitosamente.`,
        numero_radicado: peticion.numero_radicado,
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

