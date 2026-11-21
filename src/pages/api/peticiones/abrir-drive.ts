// src/pages/api/peticiones/abrir-drive.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '@lib/supabase';
import {
  isGoogleDriveConfigured,
  getGoogleDriveClient,
  sanitizeDriveName,
} from '@lib/google-drive';

const db: any = supabaseAdmin || supabase;

export const GET: APIRoute = async ({ url }) => {
  try {
    const rawId =
      url.searchParams.get('id') ||
      url.searchParams.get('peticion_id') ||
      url.searchParams.get('peticionId');
    const rawRadicado =
      url.searchParams.get('radicado') ||
      url.searchParams.get('numero_radicado');

    const petId = String(rawId || '').trim();
    const radicadoParam = String(rawRadicado || '').trim();

    if (!petId && !radicadoParam) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Identificador (id o radicado) de petición requerido.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Buscar la petición en Supabase
    let pet: any = null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(petId);

    if (petId && isUuid) {
      const { data } = await db.from('peticiones').select('*').eq('id', petId).maybeSingle();
      if (data) pet = data;
    }

    if (!pet && (radicadoParam || petId)) {
      const searchCode = radicadoParam || petId;
      const { data } = await db
        .from('peticiones')
        .select('*')
        .ilike('numero_radicado', searchCode)
        .maybeSingle();
      if (data) pet = data;
    }

    if (!pet && petId) {
      const { data } = await db
        .from('peticiones')
        .select('*')
        .or(`id.eq.${petId},numero_radicado.eq.${petId}`)
        .maybeSingle();
      if (data) pet = data;
    }

    if (!pet) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Petición no encontrada en el sistema.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const resolvedRadicado = String(pet.numero_radicado || pet.radicado || radicadoParam || '').trim();

    // 2. Si ya tiene drive_folder_url o drive_folder_id o respuesta_drive_url, devolverlo de inmediato
    const existingFolderId = pet.drive_folder_id || null;
    const existingUrl =
      pet.drive_folder_url ||
      pet.respuesta_drive_url ||
      (existingFolderId ? `https://drive.google.com/drive/folders/${existingFolderId}` : null);

    if (existingUrl) {
      return new Response(
        JSON.stringify({
          ok: true,
          url: existingUrl,
          folderId: existingFolderId,
          cached: true,
          radicado: resolvedRadicado,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Si no tiene URL guardada, buscar en Google Drive si está configurado
    if (!isGoogleDriveConfigured()) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Google Drive no está configurado en las variables de entorno del sistema.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { drive, parentFolderId } = await getGoogleDriveClient();
    const cleanRad = sanitizeDriveName(resolvedRadicado, '');
    if (!cleanRad) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'El radicado no tiene un formato válido para búsqueda en Google Drive.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const parentClause =
      parentFolderId && parentFolderId !== 'root'
        ? `'${parentFolderId.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' in parents and `
        : '';
    const safeRad = cleanRad.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = `${parentClause}mimeType = 'application/vnd.google-apps.folder' and trashed = false and name contains '${safeRad}'`;

    const listRes = await drive.files.list({
      q,
      fields: 'files(id, name, webViewLink)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 15,
    });

    const files = listRes.data.files || [];
    const matched = files.find((f: any) =>
      String(f.name || '').toLowerCase().includes(cleanRad.toLowerCase())
    );

    if (matched && matched.id) {
      const folderId = matched.id;
      const folderUrl = matched.webViewLink || `https://drive.google.com/drive/folders/${folderId}`;

      // Actualizar en base de datos de inmediato con supabaseAdmin
      await db
        .from('peticiones')
        .update({
          drive_folder_id: folderId,
          drive_folder_url: folderUrl,
          respuesta_drive_url: folderUrl,
        })
        .eq('id', pet.id)
        .then(() => {})
        .catch((e: any) => console.warn('[ABRIR DRIVE] Error persistiendo enlace en DB:', e?.message));

      return new Response(
        JSON.stringify({
          ok: true,
          url: folderUrl,
          folderId,
          discovered: true,
          radicado: resolvedRadicado,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Si no se encontró la carpeta en Google Drive
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Esta carpeta aún no ha sido sincronizada en Google Drive. Pulse "Respaldar en Drive" primero.',
        radicado: resolvedRadicado,
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[ABRIR DRIVE ERROR]', err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: err?.message || 'Error consultando Google Drive.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
