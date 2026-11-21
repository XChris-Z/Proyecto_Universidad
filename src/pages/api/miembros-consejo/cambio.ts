// src/pages/api/miembros-consejo/cambio.ts
import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';
import { resolveSessionActor } from '@lib/request-actor';

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  try {
    const body = await request.json();
    const { id, razon_cambio, acta_cambio_url, acta_cambio_nombre } = body;

    if (!id || !razon_cambio) {
      return new Response(JSON.stringify({ error: 'Faltan parámetros obligatorios (id y motivo de cambio).' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = (supabaseAdmin || supabase) as any;
    const updateData: Record<string, any> = {
      estado: 'inactivo',
      razon_cambio: razon_cambio.trim(),
      updated_at: new Date().toISOString(),
    };

    if (acta_cambio_url) updateData.acta_cambio_url = acta_cambio_url;
    if (acta_cambio_nombre) updateData.acta_cambio_nombre = acta_cambio_nombre;

    const { data, error } = await db
      .from('miembros_consejo')
      .update(updateData)
      .eq('id', id)
      .select('id, nombre_completo, cuerpo_colegiado')
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const actor = await resolveSessionActor(cookies, null);
    await logSystemActivity({
      actor,
      action: 'Reemplazo / Cambio de Miembro de Consejo',
      actionType: 'MODIFICACION',
      entity: 'Cuerpos Colegiados',
      entityId: id,
      details: `Se registró cambio/reemplazo para el miembro ${data?.nombre_completo || id}. Motivo: ${updateData.razon_cambio}.`,
      severity: 'INFO',
      request,
      clientAddress,
      cookies,
    }).catch(() => {});

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Error registrando cambio de miembro.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
