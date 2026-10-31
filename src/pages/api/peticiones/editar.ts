// src/pages/api/peticiones/editar.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { id, asunto, solicitante_nombre, solicitante_tipo, solicitante_email, prioridad, fecha_limite_entrega, estado, descripcion } = body;

    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID de petición requerido' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Calcular fecha límite del responsable (-5 días calendario)
    let fechaLimiteResponsable: string | undefined = undefined;
    if (fecha_limite_entrega) {
      const entregaDate = new Date(fecha_limite_entrega + 'T12:00:00');
      if (!isNaN(entregaDate.getTime())) {
        const respDate = new Date(entregaDate);
        respDate.setDate(respDate.getDate() - 5);
        fechaLimiteResponsable = respDate.toISOString().split('T')[0];
      }
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (asunto !== undefined) updatePayload.asunto = asunto;
    if (solicitante_nombre !== undefined) updatePayload.solicitante_nombre = solicitante_nombre;
    if (solicitante_tipo !== undefined) updatePayload.solicitante_tipo = solicitante_tipo;
    if (solicitante_email !== undefined) updatePayload.solicitante_email = solicitante_email;
    if (prioridad !== undefined) updatePayload.prioridad = prioridad;
    if (estado !== undefined) updatePayload.estado = estado;
    if (descripcion !== undefined) updatePayload.descripcion = descripcion;
    if (fecha_limite_entrega) updatePayload.fecha_limite_entrega = fecha_limite_entrega;
    if (fechaLimiteResponsable) updatePayload.fecha_limite_responsable = fechaLimiteResponsable;

    // Obtener datos antes de actualizar para auditoría
    const { data: previousData } = await (supabase
      .from('peticiones' as any)
      .select('numero_radicado, asunto, estado')
      .eq('id', id)
      .single() as any);

    const { data: updated, error } = await (supabase
      .from('peticiones' as any)
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single() as any);

    if (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const radicadoNum = updated?.numero_radicado || previousData?.numero_radicado || id;

    // Registrar en auditoría institucional
    await logSystemActivity({
      actor: { id: 'usr-root', name: 'Administrador General', role: 'Superadministrador' },
      action: `Edición de radicado ${radicadoNum}`,
      actionType: 'MODIFICACION',
      entity: 'Peticiones',
      entityId: id,
      details: `Actualización de metadatos del radicado ${radicadoNum}: ${asunto || updated?.asunto}`,
      before: previousData,
      after: updatePayload,
      severity: 'INFO',
    }).catch((err) => console.warn('Error registrando auditoría:', err));

    return new Response(
      JSON.stringify({ success: true, peticion: updated }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error al actualizar petición' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
