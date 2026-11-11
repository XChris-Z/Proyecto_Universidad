// src/pages/api/peticiones/responder.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { sendRespuestaSolicitanteEmail, resolvePublicBaseUrl } from '@lib/email';
import { logSystemActivity } from '@lib/audit';
import { separarRespuestaMeta } from '@lib/subcarpetas';

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      peticion_id,
      solicitante_email,
      respuesta_mensaje,
      respuesta_funcionario,
      respuesta_archivos_incluidos,
      anexos_opcionales,
      respuesta_drive_url = '',
    } = body;

    const selectedOptionalIds: string[] = Array.isArray(anexos_opcionales)
      ? anexos_opcionales.map((x: any) => String(x || '').trim()).filter(Boolean)
      : Array.isArray(respuesta_archivos_incluidos)
        ? respuesta_archivos_incluidos.map((x: any) => String(x || '').trim()).filter(Boolean)
        : [];

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

    // 2. Generar PIN de 6 dígitos y plazo de 10 días calendario (exactamente 864,000,000 ms)
    const pinSolicitante = String(Math.floor(100000 + Math.random() * 900000));
    const fechaEnvio = new Date();
    const fechaEnvioIso = fechaEnvio.toISOString();
    const fechaExpiracion = new Date(fechaEnvio.getTime() + 10 * 24 * 60 * 60 * 1000);
    const expiraAt = fechaExpiracion.toISOString();
    const funcionarioResp = String(respuesta_funcionario || 'Oficina de Correspondencia y Gestión Documental').trim();
    const cleanMensaje = String(respuesta_mensaje).trim();
    const cleanDrive = String(respuesta_drive_url || '').trim();

    // Limpiar estrictamente cualquier bloque RESPUESTA_META anterior antes de anexar el nuevo, preservando el archivo de respuesta si existía
    const { textoLimpio, respuestaMeta: prevMeta } = separarRespuestaMeta(peticion.instrucciones_anexos || '');
    let finalRespArchivo = body.archivo_respuesta || prevMeta?.archivo_respuesta || prevMeta?.respuesta_archivo || null;

    // Consultar anexos reales en base de datos para validar Respuesta Final y resolver opcionales
    const { data: allDbAnexos } = await (supabase
      .from('peticion_anexos' as any)
      .select('*')
      .eq('peticion_id', peticion_id) as any);
    const dbAnexosList: any[] = Array.isArray(allDbAnexos) ? allDbAnexos : [];

    if (!finalRespArchivo || !finalRespArchivo.storage_path) {
      const respInDb = dbAnexosList.find((a) => a && a.storage_path && String(a.storage_path).includes('/respuesta_final/'));
      if (respInDb) finalRespArchivo = respInDb;
    }

    if (!finalRespArchivo || (!finalRespArchivo.storage_path && !finalRespArchivo.nombre_archivo)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Debe adjuntar el documento obligatorio de Respuesta Final Oficial antes de enviar.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const metaPackage = JSON.stringify({
      pin: pinSolicitante,
      expira: expiraAt,
      msg: cleanMensaje,
      func: funcionarioResp,
      files: selectedOptionalIds,
      has_explicit_selection: true,
      drive: cleanDrive || null,
      fecha_envio: fechaEnvioIso,
      correo: effectiveEmail,
      archivo_respuesta: finalRespArchivo,
      respuesta_archivo: finalRespArchivo,
    });

    const cleanInst = textoLimpio.trim();
    const cleanUpdatedInst = cleanInst
      ? `${cleanInst}\n\n[RESPUESTA_META]: ${metaPackage}`
      : `[RESPUESTA_META]: ${metaPackage}`;

    // 3. Preparar actualización en public.peticiones respetando el constraint CHECK de estado
    const coreTemplate: Record<string, any> = {
      updated_at: fechaEnvioIso,
      solicitante_email: effectiveEmail,
      instrucciones_anexos: cleanUpdatedInst,
    };
    let payloadTemplate: Record<string, any> = {
      ...coreTemplate,
      respuesta_mensaje: cleanMensaje,
      respuesta_funcionario: funcionarioResp,
      respuesta_fecha_envio: fechaEnvioIso,
      respuesta_expira_at: expiraAt,
      respuesta_pin_solicitante: pinSolicitante,
      respuesta_archivos_incluidos: selectedOptionalIds,
      respuesta_drive_url: cleanDrive || null,
    };

    const isCheckConstraintError = (err: any) =>
      err?.code === '23514' ||
      /peticiones_estado_check|check constraint/i.test(String(err?.message || ''));

    const isSchemaColError = (err: any) =>
      err?.code === 'PGRST204' ||
      err?.code === '42703' ||
      /schema cache|column .* does not exist/i.test(String(err?.message || ''));

    const candidateEstados = [
      'Respondida',
      'respondida',
      'resuelta',
      'finalizada',
      'cerrada',
      'completada',
    ];

    let updateSuccess = false;
    let updateErrorMsg = '';

    for (const candidateEstado of candidateEstados) {
      const { error: tryErr } = await (supabase
        .from('peticiones' as any)
        .update({ ...payloadTemplate, estado: candidateEstado })
        .eq('id', peticion_id) as any);

      if (!tryErr) {
        updateSuccess = true;
        break;
      }

      updateErrorMsg = tryErr.message;

      if (isSchemaColError(tryErr)) {
        payloadTemplate = coreTemplate;
        const { error: coreTryErr } = await (supabase
          .from('peticiones' as any)
          .update({ ...payloadTemplate, estado: candidateEstado })
          .eq('id', peticion_id) as any);

        if (!coreTryErr) {
          updateSuccess = true;
          break;
        }
        updateErrorMsg = coreTryErr.message;
        if (!isCheckConstraintError(coreTryErr)) {
          break;
        }
        continue;
      }

      if (!isCheckConstraintError(tryErr)) {
        break;
      }
    }

    // Fallback definitivo: si todos los estados de cierre chocan con peticiones_estado_check,
    // persiste [RESPUESTA_META] y datos de respuesta sin modificar la columna estado.
    if (!updateSuccess) {
      const { error: noEstadoErr } = await (supabase
        .from('peticiones' as any)
        .update(payloadTemplate)
        .eq('id', peticion_id) as any);

      if (!noEstadoErr) {
        updateSuccess = true;
      } else if (isSchemaColError(noEstadoErr)) {
        const { error: noEstadoCoreErr } = await (supabase
          .from('peticiones' as any)
          .update(coreTemplate)
          .eq('id', peticion_id) as any);
        if (!noEstadoCoreErr) {
          updateSuccess = true;
        } else {
          updateErrorMsg = noEstadoCoreErr.message || updateErrorMsg;
        }
      } else {
        updateErrorMsg = noEstadoErr.message || updateErrorMsg;
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

    // 5. Determinar URL pública de consulta directa (apunta exactamente a ?radicado=...&pin=...)
    const baseUrl = resolvePublicBaseUrl(request, url);
    const consultaUrl = `${baseUrl}/consulta-respuesta?radicado=${encodeURIComponent(peticion.numero_radicado)}&pin=${encodeURIComponent(pinSolicitante)}`;

    // 6. Sin adjuntos físicos en el correo: todos los soportes seleccionados se consultan y descargan exclusivamente en el Portal
    // 7. Enviar Correo Institucional al Solicitante
    const emailResult = await sendRespuestaSolicitanteEmail({
      toEmail: effectiveEmail,
      solicitanteNombre: peticion.solicitante_nombre || 'Ciudadano(a)',
      numeroRadicado: peticion.numero_radicado,
      asunto: body.asunto || peticion.asunto || 'Petición Oficial',
      mensajeRespuesta: cleanMensaje,
      funcionarioNombre: funcionarioResp,
      pinSolicitante,
      fechaRadicacion: peticion.fecha_radicacion || peticion.created_at || null,
      fechaExpiracion: expiraAt,
      consultaUrl,
      driveUrl: cleanDrive || null,
      totalArchivos: 1 + selectedOptionalIds.length,
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

