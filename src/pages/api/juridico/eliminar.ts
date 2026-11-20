// src/pages/api/juridico/eliminar.ts
import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';
import { resolveSessionActor } from '@lib/request-actor';

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  try {
    const body = await request.json();
    const tipo = body.tipo; // 'carpeta' | 'documento'
    const id = body.id;

    if (!id || (tipo !== 'carpeta' && tipo !== 'documento')) {
      return new Response(JSON.stringify({ error: 'Parámetros inválidos para eliminación.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = (supabaseAdmin || supabase) as any;
    const table = tipo === 'carpeta' ? 'juridico_carpetas' : 'juridico_documentos';

    const { error } = await db.from(table).delete().eq('id', id);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const actor = await resolveSessionActor(cookies, null);
    await logSystemActivity({
      actor,
      action: `Eliminación de ${tipo === 'carpeta' ? 'Subcarpeta' : 'Documento'} en Asuntos Jurídicos`,
      actionType: 'ELIMINACION',
      entity: 'Asuntos Jurídicos',
      entityId: id,
      details: `Se eliminó el registro de ${tipo} ID ${id}.`,
      severity: 'CRITICAL',
      request,
      clientAddress,
      cookies,
    }).catch(() => {});

    return new Response(JSON.stringify({ success: true, deletedId: id, tipo }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Error eliminando registro.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
