// src/pages/api/juridico/carpetas/crear.ts
import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';
import { resolveSessionActor } from '@lib/request-actor';

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  try {
    const body = await request.json();
    const categoriaRaiz = String(body.categoria_raiz || '').trim();
    const parentId = body.parent_id ? String(body.parent_id) : null;
    const nombre = String(body.nombre || '').trim();
    const tema = body.tema ? String(body.tema).trim() : null;
    const anio = body.anio ? parseInt(String(body.anio), 10) : null;
    const descripcion = body.descripcion ? String(body.descripcion).trim() : null;

    if (!nombre) {
      return new Response(JSON.stringify({ error: 'El nombre de la subcarpeta es obligatorio.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const validCategorias = ['conceptos_internos', 'litigios_judiciales', 'auditoria_entes_control'];
    if (!validCategorias.includes(categoriaRaiz)) {
      return new Response(JSON.stringify({ error: 'Categoría raíz no válida.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = (supabaseAdmin || supabase) as any;
    const { data: nuevaCarpeta, error } = await db
      .from('juridico_carpetas')
      .insert([
        {
          categoria_raiz: categoriaRaiz,
          parent_id: parentId,
          nombre,
          tema,
          anio,
          descripcion,
          created_at: new Date().toISOString(),
        },
      ])
      .select('*')
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
      action: 'Creación de Subcarpeta en Asuntos Jurídicos',
      actionType: 'GESTION',
      entity: 'Asuntos Jurídicos',
      entityId: nuevaCarpeta.id,
      details: `Se creó la subcarpeta "${nombre}" en categoría ${categoriaRaiz} (Tema: ${tema || 'General'}, Año: ${anio || 'N/A'}).`,
      severity: 'INFO',
      request,
      clientAddress,
      cookies,
    }).catch(() => {});

    return new Response(JSON.stringify({ success: true, carpeta: nuevaCarpeta }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Error creando subcarpeta.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
