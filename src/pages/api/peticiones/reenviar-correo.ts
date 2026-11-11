// src/pages/api/peticiones/reenviar-correo.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { sendPeticionAssignmentEmail, type EmailAttachment } from '@lib/email';
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
        fecha_radicacion,
        created_at,
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
          observaciones_entrega,
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

    // 2. Política de cero adjuntos físicos por correo: los soportes documentales se consultan en la plataforma
    const emailAttachments: EmailAttachment[] | undefined = undefined;

    // 3. Consultar subcarpetas asociadas si existen
    let subcarpetasData: any[] = [];
    try {
      const { data: subs } = await (supabase
        .from('peticion_subcarpetas' as any)
        .select('*')
        .eq('peticion_id', peticion.id) as any);
      if (subs) subcarpetasData = subs;
    } catch {}

    const baseUrl = url.origin;
    const resultados: any[] = [];
    let exitosos = 0;
    let fallidos = 0;

    // 4. Reenviar correo a cada oficina asignada que tenga correo institucional configurado
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
          assignedSubs = [{ nombre: matched.nombre, descripcion: matched.descripcion }];
        }
      }
      if (assignedSubs.length === 0 && subcarpetasData.length > 0) {
        assignedSubs = subcarpetasData.map((s: any) => ({ nombre: s.nombre, descripcion: s.descripcion }));
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
        instruccionesAnexos: peticion.instrucciones_anexos || peticion.descripcion,
        fechaLimiteEntrega: peticion.fecha_limite_entrega,
        fechaLimiteResponsable: peticion.fecha_limite_responsable,
        codigoAcceso: resp.codigo_acceso,
        pinAcceso: effectivePin,
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
