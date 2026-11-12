// src/pages/api/peticiones/respaldar-drive.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { logSystemActivity } from '@lib/audit';
import { resolveSessionActor } from '@lib/request-actor';
import {
  isGoogleDriveConfigured,
  respaldarExpedienteLimpioEnDrive,
} from '@lib/google-drive';

export const POST: APIRoute = async ({ request, clientAddress, cookies }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const peticionId = typeof body?.peticionId === 'string' ? body.peticionId.trim() : '';

    if (!peticionId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Debe suministrar el identificador (peticionId) del expediente.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!isGoogleDriveConfigured()) {
      return new Response(
        JSON.stringify({
          success: false,
          missingConfig: true,
          error:
            'No se han configurado las credenciales de Google Drive en las variables de entorno. Configure GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET y GOOGLE_DRIVE_REFRESH_TOKEN.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const actor = await resolveSessionActor(cookies, body?.actor || null);
    const result = await respaldarExpedienteLimpioEnDrive(peticionId);

    await logSystemActivity({
      actor,
      action: `Respaldo / Sincronización Drive en ${result.numeroRadicado}`,
      actionType: 'GESTION',
      entity: 'Expediente Documental',
      entityId: result.numeroRadicado,
      details: `Carpeta limpia sincronizada en Google Drive por ${actor.name}: ${result.webViewLink} (${result.archivosSubidos} archivos, ${result.aprobadosCount} aportes aprobados).`,
      after: {
        folder_id: result.folderId,
        folder_name: result.folderName,
        web_view_link: result.webViewLink,
        archivos_subidos: result.archivosSubidos,
        aprobados_incluidos: result.aprobadosCount,
        subcarpetas_creadas: result.subcarpetasCreadas,
      },
      severity: 'INFO',
      request,
      clientAddress,
      cookies,
    }).catch((e) => console.warn('[RESPALDAR DRIVE] Error auditoría:', e));

    return new Response(
      JSON.stringify({
        success: true,
        folderId: result.folderId,
        folderName: result.folderName,
        webViewLink: result.webViewLink,
        archivosSubidos: result.archivosSubidos,
        subcarpetasCreadas: result.subcarpetasCreadas,
        aprobadosCount: result.aprobadosCount,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const rawMsg = String(err?.message || '');
    const isAuthErr =
      rawMsg.toLowerCase().includes('invalid_grant') ||
      rawMsg.toLowerCase().includes('token') ||
      err?.code === 401;
    console.error('[RESPALDAR DRIVE] Error general:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: isAuthErr
          ? `Error de autenticación con Google Drive: ${rawMsg}. Verifique el GOOGLE_DRIVE_REFRESH_TOKEN.`
          : rawMsg || 'Error interno del servidor exportando expediente a Google Drive.',
      }),
      { status: isAuthErr ? 401 : 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

