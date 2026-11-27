// src/pages/api/normas/guardar.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { Buffer } from 'node:buffer';
import { supabase, supabaseAdmin } from '@lib/supabase';
import { SESSION_COOKIE_KEY } from '@lib/constants';
import { resolveUserRbacServer } from '@lib/rbac-server';
import { tienePermiso } from '@lib/permisos';
import { logSystemActivity } from '@lib/audit';
import { extractClientIp, resolveSessionActor } from '@lib/request-actor';

const ORGANO_NAME_MAP: Record<string, string> = {
  csu: 'Consejo Superior Universitario',
  ca: 'Consejo Académico',
  rectoria: 'Rectoría',
  electoral: 'Consejo Electoral',
};

function normalizeVigenciaInput(raw: string | null | undefined): string {
  const lower = String(raw || 'Vigente').toLowerCase().trim();
  if (lower === 'derogado' || lower.includes('derogad') || lower.includes('modificad')) {
    return 'Derogado / Modificado';
  }
  if (lower === 'no_vigente' || lower === 'no vigente' || lower === 'vencido') {
    return 'No Vigente';
  }
  return 'Vigente';
}

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  try {
    const sessionUserId = cookies.get(SESSION_COOKIE_KEY)?.value;
    if (!sessionUserId) {
      return new Response(JSON.stringify({ error: 'Sesión no autenticada.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rbac = await resolveUserRbacServer(sessionUserId);
    if (!rbac.authenticated) {
      return new Response(JSON.stringify({ error: 'Sesión inválida o expirada.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const contentType = request.headers.get('content-type') || '';
    let id = '';
    let organoCode = '';
    let tipo = '';
    let numero = '';
    let titulo = '';
    let fechaExpedicion = '';
    let fechaFinVigencia = '';
    let descriptor = '';
    let vigenciaRaw = 'Vigente';
    let yearRaw = '';
    let fileEntry: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      id = String(formData.get('id') || '').trim();
      organoCode = String(formData.get('organo_code') || '').trim().toLowerCase();
      tipo = String(formData.get('tipo') || '').trim();
      numero = String(formData.get('numero') || '').trim();
      titulo = String(formData.get('titulo') || '').trim();
      fechaExpedicion = String(formData.get('fecha_expedicion') || '').trim();
      fechaFinVigencia = String(formData.get('fecha_fin_vigencia') || '').trim();
      descriptor = String(formData.get('descriptor') || '').trim();
      vigenciaRaw = String(formData.get('vigencia') || 'Vigente').trim();
      yearRaw = String(formData.get('year') || '').trim();
      const rawFile = formData.get('archivo');
      if (rawFile instanceof File && rawFile.size > 0) {
        fileEntry = rawFile;
      }
    } else {
      const body = await request.json().catch(() => ({}));
      id = String(body?.id || '').trim();
      organoCode = String(body?.organo_code || '').trim().toLowerCase();
      tipo = String(body?.tipo || '').trim();
      numero = String(body?.numero || '').trim();
      titulo = String(body?.titulo || '').trim();
      fechaExpedicion = String(body?.fecha_expedicion || body?.fecha || '').trim();
      fechaFinVigencia = String(body?.fecha_fin_vigencia || '').trim();
      descriptor = String(body?.descriptor || '').trim();
      vigenciaRaw = String(body?.vigencia || 'Vigente').trim();
      yearRaw = String(body?.year || body?.anio || '').trim();
    }

    const requiredAction = id ? 'editar' : 'crear';
    if (!rbac.isAdmin && !tienePermiso(rbac, 'cuerpos_colegiados', requiredAction)) {
      return new Response(JSON.stringify({ error: 'No tiene permisos suficientes para esta operación.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!organoCode || !tipo || !numero || !titulo || !fechaExpedicion) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos obligatorios (órgano, tipo, número, título o fecha de expedición).' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (fechaFinVigencia && fechaFinVigencia < fechaExpedicion) {
      return new Response(
        JSON.stringify({ error: 'La fecha fin de vigencia no puede ser anterior a la fecha de expedición.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const db = (supabaseAdmin || supabase) as any;
    const organoName = ORGANO_NAME_MAP[organoCode] || 'Consejo Superior Universitario';
    const yearFromDate = fechaExpedicion.split('-')[0] || '';
    const anioNum = parseInt(yearRaw || yearFromDate, 10) || new Date().getFullYear();
    const vigenciaNorm = normalizeVigenciaInput(vigenciaRaw);

    let uploadedUrl: string | undefined;
    let uploadedName: string | undefined;

    if (fileEntry) {
      uploadedName = fileEntry.name;
      const cleanName = fileEntry.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `colegiados/${anioNum}/${Date.now()}_${cleanName}`;
      const rawBuf = await fileEntry.arrayBuffer();
      const uploadBytes = new Uint8Array(rawBuf.slice(0));

      const { error: uploadErr } = await db.storage
        .from('peticiones')
        .upload(storagePath, Buffer.from(uploadBytes), {
          contentType: fileEntry.type || 'application/pdf',
          upsert: true,
        });

      if (uploadErr) {
        return new Response(
          JSON.stringify({ error: `Error subiendo documento soporte: ${uploadErr.message}` }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const { data: publicData } = db.storage.from('peticiones').getPublicUrl(storagePath);
      uploadedUrl = publicData?.publicUrl || undefined;
    }

    const payload: Record<string, any> = {
      anio: anioNum,
      year: String(anioNum),
      cuerpo_colegiado: organoName,
      organo: organoName,
      organo_code: organoCode,
      tipo_acto: tipo,
      tipo,
      numero_acto: numero,
      numero,
      fecha_expedicion: fechaExpedicion,
      fecha: fechaExpedicion,
      fecha_fin_vigencia: fechaFinVigencia || null,
      asunto: titulo,
      titulo,
      descriptor: descriptor || 'General',
      vigencia: vigenciaNorm,
      resumen: titulo,
    };

    if (uploadedUrl !== undefined) {
      payload.archivo_url = uploadedUrl;
      payload.archivo_nombre = uploadedName || null;
    }

    let savedRecord: any = null;
    let beforeState: any = null;

    if (id) {
      const { data: prevData } = await db
        .from('colegiados_normas')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      beforeState = prevData || null;

      const { data, error } = await db
        .from('colegiados_normas')
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
      savedRecord = data;
    } else {
      const newId = `norma-${Date.now().toString(36)}`;
      payload.id = newId;
      payload.signatarios = 'Secretaría General / Rectoría';
      payload.created_at = new Date().toISOString();

      const { data, error } = await db
        .from('colegiados_normas')
        .insert([payload])
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      savedRecord = data;
    }

    const actor = await resolveSessionActor(cookies);
    const clientIp = extractClientIp(request, clientAddress);

    await logSystemActivity({
      actor,
      ip: clientIp,
      action: id
        ? 'Actualización de Acto / Norma Colegiada'
        : 'Radicación de Acto / Norma Colegiada',
      actionType: id ? 'MODIFICACION' : 'SUBIDA_ARCHIVO',
      entity: 'Cuerpos Colegiados',
      entityId: `${tipo} ${numero}`,
      before: beforeState
        ? {
            vigencia: beforeState.vigencia,
            fecha_fin_vigencia: beforeState.fecha_fin_vigencia || null,
            organo: beforeState.organo,
          }
        : null,
      after: {
        id: savedRecord?.id || id,
        vigencia: vigenciaNorm,
        fecha_fin_vigencia: fechaFinVigencia || null,
        organo: organoName,
      },
      details: id
        ? `Se actualizó el acto "${tipo} ${numero}" (${organoName}) · Vigencia: ${vigenciaNorm}${fechaFinVigencia ? ` · Fin vigencia: ${fechaFinVigencia}` : ''}.`
        : `Se radicó el acto "${tipo} ${numero}" para ${organoName} (Año ${anioNum}) · Vigencia: ${vigenciaNorm}.`,
      severity: 'INFO',
    }).catch(() => {});

    return new Response(JSON.stringify({ success: true, norma: savedRecord }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[API Normas] Error guardando acto:', err);
    return new Response(
      JSON.stringify({ error: err?.message || 'Error interno guardando el acto colegiado.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
