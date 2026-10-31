// src/pages/api/peticiones/reenviar-correo.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { sendPeticionAssignmentEmail, type EmailAttachment } from '@lib/email';
import { logSystemActivity } from '@lib/audit';

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
    const { data: peticion, error: petErr } = await (supabase
      .from('peticiones' as any)
      .select(`
        id,
        numero_radicado,
        asunto,
        descripcion,
        instrucciones_anexos,
        prioridad,
        categoria,
        fecha_limite_entrega,
        fecha_limite_responsable,
        peticion_anexos (
          id,
          nombre_archivo,
          storage_path,
          mime_type,
          es_anexo_oficina
        ),
        peticion_responsables (
          id,
          codigo_acceso,
          oficina_id,
          oficinas (
            id,
            nombre,
            codigo,
            email_institucional
          )
        )
      `)
      .eq('id', id)
      .single() as any);

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

    // 2. Descargar el archivo original del Storage para adjuntarlo si existe
    let emailAttachments: EmailAttachment[] | undefined = undefined;
    const anexos = peticion.peticion_anexos || [];
    const rootDoc = anexos.find((a: any) => !a.es_anexo_oficina) || anexos[0];

    if (rootDoc && rootDoc.storage_path) {
      try {
        const cleanPath = rootDoc.storage_path.replace(/^peticiones\//, '');
        const { data: fileBlob, error: downloadErr } = await supabase.storage
          .from('peticiones')
          .download(cleanPath);

        if (!downloadErr && fileBlob) {
          const buffer = Buffer.from(await fileBlob.arrayBuffer());
          emailAttachments = [
            {
              filename: rootDoc.nombre_archivo,
              content: buffer,
              contentType: rootDoc.mime_type || 'application/pdf',
            },
          ];
        }
      } catch (err: any) {
        console.warn('[REENVIO CORREO] No se pudo obtener el adjunto para reenviar:', err.message);
      }
    }

    const baseUrl = url.origin;
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

      const portalUrl = `${baseUrl}/portal-responsable?codigo=${encodeURIComponent(resp.codigo_acceso)}&email=${encodeURIComponent(email)}`;

      const emailResult = await sendPeticionAssignmentEmail({
        toEmail: email,
        oficinaNombre: ofi.nombre,
        numeroRadicado: peticion.numero_radicado,
        asunto: peticion.asunto,
        categoria: peticion.categoria,
        prioridad: peticion.prioridad,
        instruccionesAnexos: peticion.instrucciones_anexos || peticion.descripcion,
        fechaLimiteEntrega: peticion.fecha_limite_entrega,
        fechaLimiteResponsable: peticion.fecha_limite_responsable,
        codigoAcceso: resp.codigo_acceso,
        portalUrl,
        attachments: emailAttachments,
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
      entityId: peticion.id,
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
