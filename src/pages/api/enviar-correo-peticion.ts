// src/pages/api/enviar-correo-peticion.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { sendPeticionAssignmentEmail } from '@lib/email';

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const body = await request.json();
    const { peticion_id, responsable_id } = body;

    if (!peticion_id && !responsable_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Se requiere peticion_id o responsable_id' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let query = supabase
      .from('peticion_responsables' as any)
      .select(`
        id,
        codigo_acceso,
        peticion_id,
        oficina:oficina_id (id, nombre, email_institucional),
        peticion:peticion_id (id, numero_radicado, asunto, categoria, prioridad, instrucciones_anexos, descripcion, fecha_limite_entrega, fecha_limite_responsable)
      `);

    if (responsable_id) {
      query = query.eq('id', responsable_id);
    } else if (peticion_id) {
      query = query.eq('peticion_id', peticion_id);
    }

    const { data: rows, error: queryError } = await (query as any);

    if (queryError || !rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontraron asignaciones para notificar.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = url.origin;
    const results = [];

    for (const item of rows) {
      const ofi = item.oficina;
      const pet = item.peticion;

      if (!ofi || !ofi.email_institucional) continue;

      const portalUrl = `${baseUrl}/portal-responsable?codigo=${encodeURIComponent(item.codigo_acceso)}&email=${encodeURIComponent(ofi.email_institucional)}`;

      const emailRes = await sendPeticionAssignmentEmail({
        toEmail: ofi.email_institucional,
        oficinaNombre: ofi.nombre,
        numeroRadicado: pet.numero_radicado,
        asunto: pet.asunto,
        categoria: pet.categoria,
        prioridad: pet.prioridad,
        instruccionesAnexos: pet.instrucciones_anexos || pet.descripcion,
        fechaLimiteEntrega: pet.fecha_limite_entrega,
        fechaLimiteResponsable: pet.fecha_limite_responsable,
        codigoAcceso: item.codigo_acceso,
        portalUrl,
      });

      results.push({
        oficina: ofi.nombre,
        email: ofi.email_institucional,
        success: emailRes.success,
        simulated: emailRes.simulated,
        messageId: emailRes.messageId,
        error: emailRes.error,
      });
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Error en /api/enviar-correo-peticion:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error interno' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

