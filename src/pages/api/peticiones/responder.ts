// src/pages/api/peticiones/responder.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { generatePin6 } from '@lib/security';
import { sendRespuestaSolicitanteEmail } from '@lib/email';
import { logSystemActivity } from '@lib/audit';

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      peticion_id,
      solicitante_email,
      respuesta_mensaje,
      respuesta_funcionario,
      respuesta_archivos_incluidos = [],
      respuesta_drive_url = '',
    } = body;

    if (!peticion_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Identificador de la petición no suministrado.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!respuesta_mensaje || !String(respuesta_mensaje).trim()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Debe redactar el texto de la respuesta oficial para el solicitante.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Obtener la petición de la base de datos
    const { data: peticion, error: fetchErr } = await (supabase
      .from('peticiones' as any)
      .select('*')
      .eq('id', peticion_id)
      .maybeSingle() as any);

    if (fetchErr || !peticion) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontró el radicado especificado en el sistema.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const effectiveEmail = String(solicitante_email || peticion.solicitante_email || '').trim().toLowerCase();
    if (!effectiveEmail || !effectiveEmail.includes('@')) {
      return new Response(
        JSON.stringify({ success: false, error: 'El solicitante no tiene un correo electrónico válido configurado.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Generar PIN de 6 dígitos y plazo de 10 días calendario
    const pinSolicitante = generatePin6();
    const fechaEnvio = new Date().toISOString();
    const expiraAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const funcionarioResp = String(respuesta_funcionario || 'Oficina de Correspondencia y Gestión Documental').trim();
    const cleanMensaje = String(respuesta_mensaje).trim();
    const cleanDrive = String(respuesta_drive_url || '').trim();

    // 3. Preparar payload de actualización en public.peticiones
    const updatePayload: Record<string, any> = {
      estado: 'respondida',
      updated_at: fechaEnvio,
      solicitante_email: effectiveEmail,
      respuesta_mensaje: cleanMensaje,
      respuesta_funcionario: funcionarioResp,
      respuesta_fecha_envio: fechaEnvio,
      respuesta_expira_at: expiraAt,
      respuesta_pin_solicitante: pinSolicitante,
      respuesta_archivos_incluidos: Array.isArray(respuesta_archivos_incluidos) ? respuesta_archivos_incluidos : [],
      respuesta_drive_url: cleanDrive || null,
    };

    let updateSuccess = false;
    let updateErrorMsg = '';

    const { error: updateErr } = await (supabase
      .from('peticiones' as any)
      .update(updatePayload)
      .eq('id', peticion_id) as any);

    if (!updateErr) {
      updateSuccess = true;
    } else {
      console.warn('[RESPONDER] Error actualizando campos completos, intentando fallback de columnas:', updateErr.message);
      updateErrorMsg = updateErr.message;

      // Fallback si alguna columna no está en el schema cache aún
      const fallbackPayload: Record<string, any> = {
        estado: 'respondida',
        updated_at: fechaEnvio,
        solicitante_email: effectiveEmail,
      };
      const { error: fbErr } = await (supabase
        .from('peticiones' as any)
        .update(fallbackPayload)
        .eq('id', peticion_id) as any);

      if (!fbErr) {
        updateSuccess = true;
      }
    }

    if (!updateSuccess) {
      return new Response(
        JSON.stringify({ success: false, error: 'Error al registrar la respuesta en la base de datos: ' + updateErrorMsg }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Registrar en Auditoría y Trazabilidad
    try {
      await logSystemActivity({
        actor: { id: 'usr-funcionario', name: funcionarioResp, role: 'funcionario' },
        action: 'Envío de Respuesta Oficial al Solicitante',
        actionType: 'RESPUESTA',
        entity: 'Expediente Documental',
        entityId: peticion.numero_radicado || peticion_id,
        details: `Se emitió y despachó la respuesta oficial del radicado ${peticion.numero_radicado} para ${peticion.solicitante_nombre} (${effectiveEmail}). Acceso habilitado por 10 días calendario (Vence: ${expiraAt.split('T')[0]}).`,
        severity: 'INFO',
      });
    } catch (auditErr: any) {
      console.warn('[RESPONDER] Aviso de auditoría:', auditErr.message);
    }

    // 5. Determinar URL pública de consulta
    const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '') || 'https';
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
    const baseUrl = `${proto}://${host}`;
    const consultaUrl = `${baseUrl}/consulta-respuesta?radicado=${encodeURIComponent(peticion.numero_radicado)}&email=${encodeURIComponent(effectiveEmail)}&pin=${encodeURIComponent(pinSolicitante)}`;

    // 6. Enviar Correo Institucional al Solicitante
    const emailResult = await sendRespuestaSolicitanteEmail({
      toEmail: effectiveEmail,
      solicitanteNombre: peticion.solicitante_nombre || 'Ciudadano(a)',
      numeroRadicado: peticion.numero_radicado,
      asunto: peticion.asunto || 'Petición Oficial',
      mensajeRespuesta: cleanMensaje,
      funcionarioNombre: funcionarioResp,
      pinSolicitante,
      fechaExpiracion: expiraAt,
      consultaUrl,
      driveUrl: cleanDrive || null,
      totalArchivos: Array.isArray(respuesta_archivos_incluidos) ? respuesta_archivos_incluidos.length : 0,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Respuesta oficial enviada al solicitante satisfactoriamente.',
        radicado: peticion.numero_radicado,
        pin_solicitante: pinSolicitante,
        expira_at: expiraAt,
        consulta_url: consultaUrl,
        email_sent: emailResult.success,
        email_error: emailResult.error || null,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[RESPONDER] Error crítico despachando respuesta:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error interno en el servidor al enviar la respuesta.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

