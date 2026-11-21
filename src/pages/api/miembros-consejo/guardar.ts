// src/pages/api/miembros-consejo/guardar.ts
import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';
import { resolveSessionActor } from '@lib/request-actor';

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  try {
    const body = await request.json();
    const {
      id,
      cuerpo_colegiado,
      nombre_completo,
      cargo_calidad,
      correo,
      fecha_inicio,
      fecha_fin,
      estado,
      foto_url,
      acta_inicio_url,
      acta_inicio_nombre,
      acta_cambio_url,
      acta_cambio_nombre,
      razon_cambio,
    } = body;

    if (!nombre_completo || !cuerpo_colegiado || !cargo_calidad || !fecha_inicio || !fecha_fin) {
      return new Response(JSON.stringify({ error: 'Faltan campos obligatorios para el registro del miembro.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (fecha_fin < fecha_inicio) {
      return new Response(JSON.stringify({ error: 'La fecha de fin no puede ser anterior a la fecha de inicio.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = (supabaseAdmin || supabase) as any;
    const nowIso = new Date().toISOString();

    // Normalizar estado
    let finalEstado = (estado || 'activo').toLowerCase();
    if (!['activo', 'archivado', 'inactivo'].includes(finalEstado)) {
      finalEstado = 'activo';
    }

    const payload: Record<string, any> = {
      cuerpo_colegiado: cuerpo_colegiado.trim(),
      nombre_completo: nombre_completo.trim(),
      cargo_calidad: cargo_calidad.trim(),
      correo: correo ? correo.trim() : null,
      fecha_inicio,
      fecha_fin,
      estado: finalEstado,
      updated_at: nowIso,
    };

    if (foto_url !== undefined) payload.foto_url = foto_url;
    if (acta_inicio_url !== undefined) payload.acta_inicio_url = acta_inicio_url;
    if (acta_inicio_nombre !== undefined) payload.acta_inicio_nombre = acta_inicio_nombre;
    if (acta_cambio_url !== undefined) payload.acta_cambio_url = acta_cambio_url;
    if (acta_cambio_nombre !== undefined) payload.acta_cambio_nombre = acta_cambio_nombre;
    if (razon_cambio !== undefined) payload.razon_cambio = razon_cambio ? razon_cambio.trim() : null;

    let resultData: any = null;
    let actionType: 'GESTION' | 'MODIFICACION' = 'GESTION';

    if (id) {
      actionType = 'MODIFICACION';
      const { data, error } = await db
        .from('miembros_consejo')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      resultData = data;
    } else {
      payload.created_at = nowIso;
      const { data, error } = await db
        .from('miembros_consejo')
        .insert([payload])
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      resultData = data;
    }

    const actor = await resolveSessionActor(cookies, null);
    await logSystemActivity({
      actor,
      action: actionType === 'GESTION' ? 'Registro de Miembro de Consejo' : 'Actualización de Miembro de Consejo',
      actionType,
      entity: 'Cuerpos Colegiados',
      entityId: resultData?.id || id || 'miembro',
      details: `${actionType === 'GESTION' ? 'Se registró' : 'Se actualizó'} el miembro: ${payload.nombre_completo} (${payload.cuerpo_colegiado} - ${payload.cargo_calidad}). Periodo: ${payload.fecha_inicio} a ${payload.fecha_fin}. Estado: ${payload.estado}.`,
      severity: 'INFO',
      request,
      clientAddress,
      cookies,
    }).catch(() => {});

    return new Response(JSON.stringify({ success: true, data: resultData }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Error guardando miembro de consejo.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
