// src/pages/api/enviar-correo-peticion.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import {
  sendPeticionAssignmentEmail,
  resolvePublicBaseUrl,
  limpiarTextoRequerimiento,
} from '@lib/email';
import { separarRespuestaMeta, filtrarSubcarpetasValidas } from '@lib/subcarpetas';
import { getDeterministicPin } from '@lib/security';

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

    const buildRowsQuery = (withSubcarpetaCol: boolean) => {
      const cols = withSubcarpetaCol
        ? `id, subcarpeta_id, codigo_acceso, observaciones_entrega, peticion_id,
           oficina:oficina_id (id, nombre, email_institucional),
           peticion:peticion_id (id, numero_radicado, asunto, categoria, prioridad, instrucciones_anexos, descripcion, fecha_radicacion, fecha_limite_entrega, fecha_limite_responsable, pin_acceso, created_at)`
        : `id, codigo_acceso, observaciones_entrega, peticion_id,
           oficina:oficina_id (id, nombre, email_institucional),
           peticion:peticion_id (id, numero_radicado, asunto, categoria, prioridad, instrucciones_anexos, descripcion, fecha_radicacion, fecha_limite_entrega, fecha_limite_responsable, pin_acceso, created_at)`;
      let q = supabase.from('peticion_responsables' as any).select(cols);
      if (responsable_id) q = q.eq('id', responsable_id);
      else if (peticion_id) q = q.eq('peticion_id', peticion_id);
      return q as any;
    };

    let { data: rows, error: queryError } = await buildRowsQuery(true);
    if (queryError && String(queryError.message || '').includes('subcarpeta_id')) {
      ({ data: rows, error: queryError } = await buildRowsQuery(false));
    }

    if (queryError || !rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontraron asignaciones para notificar.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const peticionIds = Array.from(new Set(rows.map((r: any) => r.peticion_id).filter(Boolean)));
    const subcarpetasByPetId: Record<string, any[]> = {};
    if (peticionIds.length > 0) {
      try {
        const { data: subs } = await (supabase
          .from('peticion_subcarpetas' as any)
          .select('id, peticion_id, nombre, descripcion')
          .in('peticion_id', peticionIds) as any);
        if (Array.isArray(subs)) {
          subs.forEach((s: any) => {
            const pid = String(s?.peticion_id || '');
            if (!pid) return;
            if (!subcarpetasByPetId[pid]) subcarpetasByPetId[pid] = [];
            subcarpetasByPetId[pid]!.push(s);
          });
        }
      } catch {}
    }

    const baseUrl = resolvePublicBaseUrl(request, url);
    const results = [];

    for (const item of rows) {
      const ofi = item.oficina;
      const pet = item.peticion;

      if (!ofi || !ofi.email_institucional) continue;

      const pinMatch = String(item.observaciones_entrega || '').match(/PIN:\s*([0-9A-Z]{6})/i);
      const effectivePin =
        (pinMatch && pinMatch[1] ? pinMatch[1].trim() : null) ||
        pet.pin_acceso ||
        getDeterministicPin(pet.numero_radicado || pet.id);
      if (!pet.pin_acceso && effectivePin) {
        try {
          await (supabase
            .from('peticiones' as any)
            .update({ pin_acceso: effectivePin } as any)
            .eq('id', pet.id) as any);
          pet.pin_acceso = effectivePin;
        } catch {}
      }
      const portalUrl =
        `${baseUrl}/portal-responsable?radicado=${encodeURIComponent(pet.numero_radicado)}` +
        `&codigo=${encodeURIComponent(item.codigo_acceso)}` +
        `&email=${encodeURIComponent(ofi.email_institucional)}` +
        (effectivePin ? `&pin=${encodeURIComponent(effectivePin)}` : '');

      const subcarpetasPet = filtrarSubcarpetasValidas(subcarpetasByPetId[pet.id] || []);
      let assignedSubs: Array<{ nombre: string; descripcion?: string | null }> = [];

      if (item.subcarpeta_id) {
        const matched = subcarpetasPet.find((s: any) => String(s.id) === String(item.subcarpeta_id));
        if (matched) {
          assignedSubs = [{
            nombre: matched.nombre,
            descripcion: matched.descripcion ? limpiarTextoRequerimiento(matched.descripcion) : undefined,
          }];
        }
      }

      if (assignedSubs.length === 0) {
        const { textoLimpio: cleanObs } = separarRespuestaMeta(item.observaciones_entrega || '');
        const obsWithoutPin = cleanObs.replace(/^PIN:\s*[0-9A-Z]{6}(\s*\|\s*)?/i, '').trim();
        const tagNames = Array.from(obsWithoutPin.matchAll(/\[([^\]\r\n]+)\]/g))
          .map((m) => String(m?.[1] || '').trim())
          .filter((name) => name && !name.toUpperCase().includes('RESPUESTA_META'));

        if (tagNames.length > 0 && subcarpetasPet.length > 0) {
          assignedSubs = subcarpetasPet
            .filter((s: any) => tagNames.some((t) => t.toLowerCase() === String(s.nombre || '').trim().toLowerCase()))
            .map((s: any) => ({
              nombre: s.nombre,
              descripcion: s.descripcion ? limpiarTextoRequerimiento(s.descripcion) : undefined,
            }));
        }
      }

      if (assignedSubs.length === 0 && subcarpetasPet.length > 0) {
        assignedSubs = subcarpetasPet.map((s: any) => ({
          nombre: s.nombre,
          descripcion: s.descripcion ? limpiarTextoRequerimiento(s.descripcion) : undefined,
        }));
      }

      const { textoLimpio: rawInstLimpia } = separarRespuestaMeta(pet.instrucciones_anexos || pet.descripcion || '');
      const cleanFallbackInst = limpiarTextoRequerimiento(rawInstLimpia);

      const emailRes = await sendPeticionAssignmentEmail({
        toEmail: ofi.email_institucional,
        oficinaNombre: ofi.nombre,
        numeroRadicado: pet.numero_radicado,
        asunto: pet.asunto,
        categoria: pet.categoria,
        prioridad: pet.prioridad,
        subcarpetas: assignedSubs.length > 0 ? assignedSubs : undefined,
        instruccionesAnexos: cleanFallbackInst,
        fechaRadicacion: pet.fecha_radicacion || pet.created_at || null,
        fechaLimiteEntrega: pet.fecha_limite_entrega,
        fechaLimiteResponsable: pet.fecha_limite_responsable,
        codigoAcceso: item.codigo_acceso,
        pinAcceso: effectivePin || null,
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

