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
import { getDeterministicPin, generatePin6 } from '@lib/security';
import { sanitizeRevisionTokens } from '@lib/revision-meta';
import { logSystemActivity } from '@lib/audit';
import { resolveSessionActor } from '@lib/request-actor';

export const POST: APIRoute = async ({ request, url, clientAddress, cookies }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const peticionIdRaw = String(body.peticion_id || body.peticionId || '').trim();
    const radicadoRaw = String(body.radicado || body.numero_radicado || '').trim();
    const responsableIdRaw = String(body.responsable_id || body.asignacion_id || body.asignacionId || '').trim();
    const depNombreRaw = String(body.dependencia_nombre || body.oficina || '').trim();
    const correoRaw = String(body.correo || '').trim().toLowerCase();

    if (!peticionIdRaw && !radicadoRaw && !responsableIdRaw) {
      return new Response(
        JSON.stringify({ success: false, error: 'Se requiere identificar el radicado o la dependencia.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Cargar peticiones, oficinas y asignaciones sin joins frágiles
    let targetPet: any = null;
    if (peticionIdRaw) {
      const { data } = await (supabase.from('peticiones' as any).select('*').eq('id', peticionIdRaw).maybeSingle() as any);
      targetPet = data || null;
    }
    if (!targetPet && radicadoRaw) {
      const { data } = await (supabase.from('peticiones' as any).select('*').eq('numero_radicado', radicadoRaw).maybeSingle() as any);
      targetPet = data || null;
    }

    let respRows: any[] = [];
    if (responsableIdRaw) {
      const { data } = await (supabase
        .from('peticion_responsables' as any)
        .select('*')
        .eq('id', responsableIdRaw) as any);
      if (Array.isArray(data) && data.length > 0) {
        respRows = data;
      }
    }

    if (respRows.length === 0 && targetPet?.id) {
      const { data } = await (supabase
        .from('peticion_responsables' as any)
        .select('*')
        .eq('peticion_id', targetPet.id) as any);
      if (Array.isArray(data)) {
        respRows = data;
      }
    }

    const { data: allOficinas } = await (supabase
      .from('oficinas' as any)
      .select('id, nombre, email_institucional, codigo') as any);
    const oficinaById = new Map<string, any>();
    const oficinasArr: any[] = Array.isArray(allOficinas) ? allOficinas : [];
    for (const o of oficinasArr) {
      if (o?.id) oficinaById.set(String(o.id), o);
    }

    // Si respRows tiene varias dependencias de una misma petición, filtrar por nombre/correo solicitado si se especificó
    if (respRows.length > 0 && (depNombreRaw || correoRaw)) {
      const targetDepLower = depNombreRaw.toLowerCase();
      const matched = respRows.filter((r: any) => {
        const ofi = oficinaById.get(String(r.oficina_id || ''));
        const ofiName = String(ofi?.nombre || '').trim().toLowerCase();
        const ofiEmail = String(ofi?.email_institucional || '').trim().toLowerCase();
        if (correoRaw && ofiEmail === correoRaw) return true;
        if (targetDepLower && ofiName && (ofiName === targetDepLower || ofiName.includes(targetDepLower) || targetDepLower.includes(ofiName))) return true;
        return false;
      });
      if (matched.length > 0) {
        respRows = matched;
      }
    }

    // Si llegó por radicado/dependencia sin fila previa encontrada, intentar asociar la oficina real
    if (respRows.length === 0 && targetPet?.id && (depNombreRaw || correoRaw)) {
      const targetDepLower = depNombreRaw.toLowerCase();
      const ofiMatch = oficinasArr.find((o: any) => {
        const em = String(o?.email_institucional || '').trim().toLowerCase();
        const nm = String(o?.nombre || '').trim().toLowerCase();
        return (correoRaw && em === correoRaw) || (targetDepLower && (nm === targetDepLower || nm.includes(targetDepLower) || targetDepLower.includes(nm)));
      });
      if (ofiMatch) {
        respRows = [{
          id: responsableIdRaw || `virtual-${ofiMatch.id}`,
          peticion_id: targetPet.id,
          oficina_id: ofiMatch.id,
          codigo_acceso: generatePin6(),
          observaciones_entrega: '',
          estado_entrega: 'pendiente',
        }];
      }
    }

    if (respRows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontraron asignaciones pendientes para notificar en este radicado.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Resolver peticiones faltantes si solo vino responsable_id
    const petMap = new Map<string, any>();
    if (targetPet?.id) petMap.set(String(targetPet.id), targetPet);
    const missingPetIds = Array.from(new Set(respRows.map((r: any) => r.peticion_id).filter((pid: any) => pid && !petMap.has(String(pid)))));
    if (missingPetIds.length > 0) {
      const { data: extraPets } = await (supabase.from('peticiones' as any).select('*').in('id', missingPetIds) as any);
      if (Array.isArray(extraPets)) {
        for (const ep of extraPets) {
          if (ep?.id) petMap.set(String(ep.id), ep);
        }
      }
    }

    const peticionIds = Array.from(petMap.keys());
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

    for (const item of respRows) {
      const ofi = oficinaById.get(String(item.oficina_id || '')) ||
        (correoRaw ? { nombre: depNombreRaw || 'Dependencia Asignada', email_institucional: correoRaw } : null);
      const pet = petMap.get(String(item.peticion_id || '')) || targetPet;

      if (!ofi || !ofi.email_institucional || !pet) continue;

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
        const cleanRevObs = sanitizeRevisionTokens(item.observaciones_entrega || '').replace(/\[RECHAZADO[^\]]*\]:?[^|]*/gi, '').trim();
        const { textoLimpio: cleanObs } = separarRespuestaMeta(cleanRevObs);
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
        simulated: (emailRes as any).simulated,
        messageId: emailRes.messageId,
        error: emailRes.error,
      });

      if (emailRes.success) {
        const actor = await resolveSessionActor(cookies);
        await logSystemActivity({
          actor,
          action: `Reenvío individual a ${ofi.nombre} (${pet.numero_radicado})`,
          actionType: 'GESTION',
          entity: 'Peticiones Radicadas',
          entityId: pet.numero_radicado || pet.id,
          details: `Notificación y credenciales reenviadas manualmente a ${ofi.nombre} (${ofi.email_institucional}).`,
          severity: 'INFO',
          request,
          clientAddress,
          cookies,
        }).catch(() => {});
      }
    }

    const anyFailed = results.length === 0 || results.every((r) => !r.success);
    return new Response(
      JSON.stringify({
        success: !anyFailed,
        results,
        message: !anyFailed ? `Recordatorio y credenciales enviados a ${results.map((r) => r.oficina).join(', ')}.` : undefined,
        error: anyFailed ? (results[0]?.error || 'No se pudo enviar el correo a la dependencia.') : undefined,
      }),
      { status: anyFailed ? 500 : 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Error en /api/enviar-correo-peticion:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error interno' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
