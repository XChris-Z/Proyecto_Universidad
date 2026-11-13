// src/pages/api/peticiones/anexos/revisar.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';
import { enviarCorreoRechazoAporteDependencia, resolvePublicBaseUrl } from '@lib/email';
import { getDeterministicPin } from '@lib/security';
import { resolveSessionActor } from '@lib/request-actor';
import {
  addApprovedAnexoMarker,
  removeApprovedAnexoMarker,
  setRejectedMarker,
} from '@lib/revision-meta';
import {
  isGoogleDriveConfigured,
  sincronizarAporteAprobadoEnDrive,
  eliminarAporteRechazadoDeDrive,
  eliminarArchivoIndividualDeDrive,
} from '@lib/google-drive';

function extractPinFromObs(obs?: string | null): string | null {
  const match = String(obs || '').match(/PIN:\s*([0-9A-Z]{6})/i);
  return match?.[1] ? match[1].trim() : null;
}

export const POST: APIRoute = async ({ request, url, clientAddress, cookies }) => {
  try {
    const db = (supabaseAdmin || supabase) as any;
    const body = await request.json().catch(() => ({}));
    const accion = String(body.accion || '').trim().toLowerCase();
    const anexoId = String(body.anexo_id || '').trim();
    const motivo = String(body.motivo || '').trim();
    const subcarpetaNombre = String(body.subcarpeta_nombre || '').trim();
    const explicitRespId = String(body.responsable_id || '').trim();

    if (!anexoId || (accion !== 'aprobar' && accion !== 'rechazar')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Parámetros inválidos (se requiere accion y anexo_id).' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (accion === 'rechazar' && !motivo) {
      return new Response(
        JSON.stringify({ success: false, error: 'Debe indicar el motivo del rechazo o devolución.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: anexo, error: anexoErr } = await (db
      .from('peticion_anexos' as any)
      .select('*')
      .eq('id', anexoId)
      .single() as any);

    if (anexoErr || !anexo) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontró el archivo documental seleccionado.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const peticionId = String(body.peticion_id || anexo.peticion_id || '').trim();
    const { data: pet, error: petErr } = await (db
      .from('peticiones' as any)
      .select('id, numero_radicado, asunto, fecha_limite_entrega, fecha_limite_responsable')
      .eq('id', peticionId)
      .single() as any);

    if (petErr || !pet) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontró la petición asociada al anexo.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const actor = await resolveSessionActor(cookies, body.actor);

    // Buscar la asignación de dependencia asociada al aporte
    const { data: allResps } = await (db
      .from('peticion_responsables' as any)
      .select('*, oficinas(id, codigo, nombre, email_institucional)')
      .eq('peticion_id', peticionId) as any);

    const responsables = Array.isArray(allResps) ? allResps : [];
    const targetRespId = explicitRespId || anexo.peticion_responsable_id || '';

    let targetResp = responsables.find((r: any) => targetRespId && String(r.id) === String(targetRespId));
    if (!targetResp && (anexo as any).subcarpeta_id) {
      targetResp = responsables.find(
        (r: any) => r.subcarpeta_id && String(r.subcarpeta_id) === String((anexo as any).subcarpeta_id)
      );
    }
    if (!targetResp && subcarpetaNombre) {
      targetResp = responsables.find((r: any) =>
        String(r.observaciones_entrega || '').toLowerCase().includes(`[${subcarpetaNombre.toLowerCase()}]`)
      );
    }
    if (!targetResp && anexo.subido_por_email) {
      const uploaderEmail = String(anexo.subido_por_email).trim().toLowerCase();
      targetResp = responsables.find((r: any) => {
        const ofi = Array.isArray(r.oficinas) ? r.oficinas[0] : r.oficinas;
        return String(ofi?.email_institucional || '').trim().toLowerCase() === uploaderEmail;
      });
    }

    const effectiveSubName =
      subcarpetaNombre ||
      (() => {
        const m = String(anexo.nombre_archivo || '').match(/^\[([^\]]+)\]/);
        return m?.[1] ? m[1].trim() : 'Soportes Documentales';
      })();

    const cleanFileName = String(anexo.nombre_archivo || 'Soporte.pdf')
      .replace(/^\[[^\]]+\]\s*/, '')
      .trim();

    if (accion === 'aprobar') {
      if (targetResp) {
        const nextObs = addApprovedAnexoMarker(targetResp.observaciones_entrega, anexoId, effectiveSubName);
        await (db
          .from('peticion_responsables' as any)
          .update({
            estado_entrega: 'Entregado',
            observaciones_entrega: nextObs,
          })
          .eq('id', targetResp.id) as any);
      }

      const ofiObj = targetResp
        ? Array.isArray(targetResp.oficinas)
          ? targetResp.oficinas[0]
          : targetResp.oficinas
        : null;

      await logSystemActivity({
        actor,
        action: `Aporte aprobado en ${pet.numero_radicado || peticionId}`,
        actionType: 'GESTION',
        entity: 'Revisión de Aportes',
        entityId: pet.numero_radicado || peticionId,
        details: `Aporte "${cleanFileName}" (${effectiveSubName}) aprobado por ${actor.name}${ofiObj?.nombre ? ` para ${ofiObj.nombre}` : ''}.`,
        after: {
          accion: 'aprobar',
          anexo_id: anexoId,
          nombre_archivo: cleanFileName,
          subcarpeta_nombre: effectiveSubName,
          responsable_id: targetResp?.id || null,
          oficina: ofiObj?.nombre || null,
        },
        severity: 'INFO',
        request,
        clientAddress,
        cookies,
      }).catch((e) => console.warn('[REVISAR ANEXO] Error auditoría aprobar:', e));

      // Sincronización automática en vivo hacia Google Drive del aporte aprobado
      let driveSynced = false;
      let driveUrl: string | null = null;
      if (isGoogleDriveConfigured()) {
        try {
          const driveRes = await sincronizarAporteAprobadoEnDrive(
            peticionId,
            anexoId,
            effectiveSubName,
            targetResp?.id || null
          );
          driveSynced = Boolean(driveRes.synced);
          driveUrl = driveRes.driveUrl || null;
        } catch (driveErr: any) {
          console.warn('[REVISAR ANEXO] Aviso sincronizando aporte aprobado en Drive (no fatal):', driveErr?.message);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          ok: true,
          accion: 'aprobar',
          anexo_id: anexoId,
          responsable_id: targetResp?.id || null,
          estado_entrega: 'Entregado',
          driveSynced,
          driveUrl,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- ACCIÓN: RECHAZAR / DEVOLVER APORTE ---
    let removedOrMarked = false;
    const { error: delErr } = await (db
      .from('peticion_anexos' as any)
      .delete()
      .eq('id', anexoId) as any);

    if (!delErr) {
      removedOrMarked = true;
      if (anexo.storage_path) {
        const cleanPath = anexo.storage_path.replace(/^peticiones\//, '').replace(/^\/+/, '');
        await db.storage.from('peticiones').remove([cleanPath]).catch(() => {});
      }
    } else {
      const markedName = String(anexo.nombre_archivo || '').toUpperCase().includes('[RECHAZADO]')
        ? anexo.nombre_archivo
        : `[RECHAZADO] ${anexo.nombre_archivo}`;
      const { error: markErr } = await (db
        .from('peticion_anexos' as any)
        .update({ nombre_archivo: markedName })
        .eq('id', anexoId) as any);
      removedOrMarked = !markErr;
    }

    if (!removedOrMarked) {
      return new Response(
        JSON.stringify({ success: false, error: delErr?.message || 'No se pudo invalidar el soporte rechazado.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Comprobar si aún quedan anexos válidos para esa asignación/subcarpeta
    let remainingValidForResp = 0;
    if (targetResp) {
      const { data: remAnexos } = await (db
        .from('peticion_anexos' as any)
        .select('id, nombre_archivo, peticion_responsable_id')
        .eq('peticion_id', peticionId) as any);

      const remList = Array.isArray(remAnexos) ? remAnexos : [];
      remainingValidForResp = remList.filter((a: any) => {
        if (String(a.id) === String(anexoId)) return false;
        const name = String(a.nombre_archivo || '');
        if (name.toUpperCase().includes('[RECHAZADO]')) return false;
        if (a.peticion_responsable_id && String(a.peticion_responsable_id) === String(targetResp.id)) {
          return true;
        }
        return name.toLowerCase().includes(`[${effectiveSubName.toLowerCase()}]`);
      }).length;

      const withoutApproved = removeApprovedAnexoMarker(targetResp.observaciones_entrega, anexoId);
      const nextObs = setRejectedMarker(withoutApproved, effectiveSubName, motivo);
      const nextEstado = remainingValidForResp > 0 ? targetResp.estado_entrega || 'Entregado' : 'Pendiente';

      await (db
        .from('peticion_responsables' as any)
        .update({
          estado_entrega: nextEstado,
          observaciones_entrega: nextObs,
        })
        .eq('id', targetResp.id) as any);
    }

    // Enviar notificación por correo electrónico a la dependencia responsable
    const ofiObj = targetResp
      ? Array.isArray(targetResp.oficinas)
        ? targetResp.oficinas[0]
        : targetResp.oficinas
      : null;
    const recipientEmail = String(ofiObj?.email_institucional || anexo.subido_por_email || '').trim();
    const recipientOffice = String(ofiObj?.nombre || 'Dependencia Responsable').trim();

    let emailSent = false;
    let emailError: string | undefined;

    if (recipientEmail && recipientEmail.includes('@') && recipientEmail !== 'despacho@unitropico.edu.co') {
      const publicBaseUrl = resolvePublicBaseUrl(request, url);
      const codigoAcceso = String(targetResp?.codigo_acceso || 'UPQ').trim();
      const effectivePin =
        extractPinFromObs(targetResp?.observaciones_entrega) ||
        getDeterministicPin(pet.numero_radicado || pet.id);

      const portalUrl =
        `${publicBaseUrl}/portal-responsable?radicado=${encodeURIComponent(pet.numero_radicado || pet.id)}` +
        `&codigo=${encodeURIComponent(codigoAcceso)}` +
        `&email=${encodeURIComponent(recipientEmail)}` +
        `&pin=${encodeURIComponent(effectivePin)}`;

      const smtpRes = await enviarCorreoRechazoAporteDependencia({
        toEmail: recipientEmail,
        oficinaNombre: recipientOffice,
        numeroRadicado: pet.numero_radicado || pet.id,
        tituloPeticion: pet.asunto || 'Solicitud Institucional',
        nombreSubcarpeta: effectiveSubName,
        archivoRechazado: cleanFileName,
        motivoRechazo: motivo,
        fechaLimiteDependencia:
          targetResp?.fecha_expiracion_codigo ||
          pet.fecha_limite_responsable ||
          pet.fecha_limite_entrega ||
          null,
        codigoAccesoDependencia: codigoAcceso,
        pinAcceso: effectivePin,
        portalUrl,
        revisadoPor: actor.name,
      });

      emailSent = smtpRes.success;
      emailError = smtpRes.error;
    }

    await logSystemActivity({
      actor,
      action: `Aporte rechazado en ${pet.numero_radicado || peticionId}`,
      actionType: 'MODIFICACION',
      entity: 'Revisión de Aportes',
      entityId: pet.numero_radicado || peticionId,
      details: `Devolución del archivo "${cleanFileName}" (${effectiveSubName}) a ${recipientOffice}. Motivo: ${motivo}. Correo notificado: ${emailSent ? 'Sí' : 'No'}.`,
      before: {
        anexo_id: anexoId,
        nombre_archivo: cleanFileName,
        estado_entrega: targetResp?.estado_entrega || 'Entregado',
      },
      after: {
        accion: 'rechazar',
        motivo,
        subcarpeta_nombre: effectiveSubName,
        estado_entrega: remainingValidForResp > 0 ? targetResp?.estado_entrega : 'Pendiente',
        email_enviado: emailSent,
        email_destino: recipientEmail || null,
      },
      severity: 'WARN',
      request,
      clientAddress,
      cookies,
    }).catch((e) => console.warn('[REVISAR ANEXO] Error auditoría rechazar:', e));

    // Eliminar archivo rechazado de Google Drive si existe carpeta sincronizada (no bloqueante)
    let driveRemoved = false;
    if (isGoogleDriveConfigured()) {
      try {
        const remRes = await eliminarAporteRechazadoDeDrive(
          peticionId,
          cleanFileName,
          recipientOffice,
          effectiveSubName
        );
        const indRes = await eliminarArchivoIndividualDeDrive(
          pet.numero_radicado || pet.id,
          cleanFileName,
          effectiveSubName
        );
        driveRemoved = Boolean(remRes.removed || indRes.success);
      } catch (driveErr: any) {
        console.warn('[REVISAR ANEXO] Aviso eliminando aporte rechazado de Drive (no fatal):', driveErr?.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        ok: true,
        accion: 'rechazar',
        anexo_id: anexoId,
        responsable_id: targetResp?.id || null,
        estado_entrega: remainingValidForResp > 0 ? targetResp?.estado_entrega : 'Pendiente',
        email_sent: emailSent,
        email_error: emailError || null,
        driveRemoved,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Error procesando revisión de aporte.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
