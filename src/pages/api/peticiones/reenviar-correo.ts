// src/pages/api/peticiones/reenviar-correo.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import {
  sendPeticionAssignmentEmail,
  resolvePublicBaseUrl,
  limpiarTextoRequerimiento,
} from '@lib/email';
import { separarRespuestaMeta, filtrarSubcarpetasValidas } from '@lib/subcarpetas';
import { logSystemActivity } from '@lib/audit';
import { getDeterministicPin } from '@lib/security';

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const id = body.id || body.peticion_id;

    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Se requiere el ID de la petición.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Consultar la petición y sus asignaciones
    const buildPeticionQuery = (withSubcarpetaCol: boolean) => {
      const respFields = withSubcarpetaCol
        ? `id, subcarpeta_id, codigo_acceso, oficina_id, observaciones_entrega, oficinas ( id, nombre, codigo, email_institucional )`
        : `id, codigo_acceso, oficina_id, observaciones_entrega, oficinas ( id, nombre, codigo, email_institucional )`;
      return supabase
        .from('peticiones' as any)
        .select(`
          id,
          numero_radicado,
          asunto,
          descripcion,
          instrucciones_anexos,
          prioridad,
          categoria,
          fecha_radicacion,
          created_at,
          fecha_limite_entrega,
          fecha_limite_responsable,
          peticion_responsables (
            ${respFields}
          )
        `)
        .eq('id', id)
        .single() as any;
    };

    let { data: peticion, error: petErr } = await buildPeticionQuery(true);
    if (petErr && String(petErr.message || '').includes('subcarpeta_id')) {
      ({ data: peticion, error: petErr } = await buildPeticionQuery(false));
    }

    if (petErr || !peticion) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontró la petición con el ID proporcionado.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const responsables = peticion.peticion_responsables || [];
    if (responsables.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Esta petición no tiene oficinas responsables asignadas.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Consultar subcarpetas asociadas si existen
    let subcarpetasData: any[] = [];
    try {
      const { data: subs } = await (supabase
        .from('peticion_subcarpetas' as any)
        .select('id, nombre, descripcion')
        .eq('peticion_id', peticion.id) as any);
      if (subs) subcarpetasData = filtrarSubcarpetasValidas(subs);
    } catch {}

    const baseUrl = resolvePublicBaseUrl(request, url);
    const { textoLimpio: rawInstLimpia } = separarRespuestaMeta(peticion.instrucciones_anexos || peticion.descripcion || '');
    const cleanFallbackInst = limpiarTextoRequerimiento(rawInstLimpia);
    const resultados: any[] = [];
    let exitosos = 0;
    let fallidos = 0;

    // 3. Reenviar correo a cada oficina asignada que tenga correo institucional configurado
    for (const resp of responsables) {
      const ofi = resp.oficinas;
      const email = ofi?.email_institucional?.trim();

      if (!email) {
        resultados.push({
          oficina: ofi?.nombre || 'Oficina',
          email: null,
          status: 'skipped',
          motivo: 'Oficina sin correo institucional configurado.',
        });
        continue;
      }

      let assignedSubs: any[] = [];
      if (resp.subcarpeta_id) {
        const matched = subcarpetasData.find((s: any) => s.id === resp.subcarpeta_id);
        if (matched) {
          assignedSubs = [{
            nombre: matched.nombre,
            descripcion: matched.descripcion ? limpiarTextoRequerimiento(matched.descripcion) : undefined,
          }];
        }
      }
      if (assignedSubs.length === 0) {
        const { textoLimpio: cleanObs } = separarRespuestaMeta(resp.observaciones_entrega || '');
        const obsWithoutPin = cleanObs.replace(/^PIN:\s*[0-9A-Z]{6}(\s*\|\s*)?/i, '').trim();
        const tagNames = Array.from(obsWithoutPin.matchAll(/\[([^\]\r\n]+)\]/g))
          .map((m) => String(m?.[1] || '').trim())
          .filter((name) => name && !name.toUpperCase().includes('RESPUESTA_META'));
        if (tagNames.length > 0 && subcarpetasData.length > 0) {
          assignedSubs = subcarpetasData
            .filter((s: any) => tagNames.some((t) => t.toLowerCase() === String(s.nombre || '').trim().toLowerCase()))
            .map((s: any) => ({
              nombre: s.nombre,
              descripcion: s.descripcion ? limpiarTextoRequerimiento(s.descripcion) : undefined,
            }));
        }
      }
      if (assignedSubs.length === 0 && subcarpetasData.length > 0) {
        assignedSubs = subcarpetasData.map((s: any) => ({
          nombre: s.nombre,
          descripcion: s.descripcion ? limpiarTextoRequerimiento(s.descripcion) : undefined,
        }));
      }

      const pinMatch = resp.observaciones_entrega?.match(/PIN:\s*([0-9A-Z]{6})/i);
      const storedPin = pinMatch ? (pinMatch[1] || '').trim() : null;
      const effectivePin = storedPin || peticion.pin_acceso || getDeterministicPin(peticion.numero_radicado || peticion.id);
      const portalUrl = `${baseUrl}/portal-responsable?radicado=${encodeURIComponent(peticion.numero_radicado)}&codigo=${encodeURIComponent(resp.codigo_acceso)}&email=${encodeURIComponent(email)}&pin=${encodeURIComponent(effectivePin)}`;

      const emailResult = await sendPeticionAssignmentEmail({
        toEmail: email,
        oficinaNombre: ofi.nombre,
        numeroRadicado: peticion.numero_radicado,
        asunto: peticion.asunto,
        categoria: peticion.categoria,
        prioridad: peticion.prioridad,
        fechaRadicacion: peticion.fecha_radicacion || peticion.created_at || null,
        subcarpetas: assignedSubs.length > 0 ? assignedSubs : undefined,
        instruccionesAnexos: cleanFallbackInst,
        fechaLimiteEntrega: peticion.fecha_limite_entrega,
        fechaLimiteResponsable: peticion.fecha_limite_responsable,
        codigoAcceso: resp.codigo_acceso,
        pinAcceso: effectivePin,
        portalUrl,
      });

      if (emailResult.success) {
        exitosos++;
        resultados.push({
          oficina: ofi.nombre,
          email,
          status: 'sent',
          messageId: emailResult.messageId,
        });
      } else {
        fallidos++;
        resultados.push({
          oficina: ofi.nombre,
          email,
          status: 'error',
          error: emailResult.error,
        });
      }
    }

    // 4. Registrar en auditoría
    await logSystemActivity({
      actor: { id: 'usr-root', name: 'Administrador General', role: 'Superadministrador' },
      action: `Reenvío de notificación por correo para radicado ${peticion.numero_radicado}`,
      actionType: 'GESTION',
      entity: 'Peticiones Radicadas',
      entityId: peticion.numero_radicado,
      details: `Reenvío manual de correo para ${peticion.numero_radicado}. Exitosos: ${exitosos}, Fallidos: ${fallidos}`,
      severity: fallidos > 0 ? 'WARN' : 'INFO',
    }).catch(() => {});

    if (exitosos === 0 && fallidos > 0) {
      const primerError = resultados.find((r) => r.status === 'error')?.error || 'Error enviando correo SMTP';
      return new Response(
        JSON.stringify({
          success: false,
          error: primerError,
          resultados,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Notificación procesada para ${peticion.numero_radicado}. ${exitosos} correo(s) enviado(s) exitosamente.`,
        exitosos,
        fallidos,
        resultados,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error al reenviar correos' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
