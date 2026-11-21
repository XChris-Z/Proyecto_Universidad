// src/pages/api/miembros-consejo/eliminar.ts
import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';
import { resolveSessionActor } from '@lib/request-actor';

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: 'ID de miembro obligatorio.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = (supabaseAdmin || supabase) as any;

    // Obtener información antes de eliminar para auditoría
    const { data: member } = await db
      .from('miembros_consejo')
      .select('id, nombre_completo, cuerpo_colegiado')
      .eq('id', id)
      .maybeSingle();

    const { error } = await db.from('miembros_consejo').delete().eq('id', id);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const actor = await resolveSessionActor(cookies, null);
    await logSystemActivity({
      actor,
      action: 'Eliminación de Miembro de Consejo',
      actionType: 'ELIMINACION',
      entity: 'Cuerpos Colegiados',
      entityId: id,
      details: `Se eliminó el miembro de consejo: ${member?.nombre_completo || id} (${member?.cuerpo_colegiado || 'Cuerpo Colegiado'}).`,
      severity: 'CRITICAL',
      request,
      clientAddress,
      cookies,
    }).catch(() => {});

    return new Response(JSON.stringify({ success: true, deletedId: id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Error eliminando miembro de consejo.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
