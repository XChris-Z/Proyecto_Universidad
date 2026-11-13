// src/lib/google-drive.ts
import { google, type drive_v3 } from 'googleapis';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { supabase, supabaseAdmin } from '@lib/supabase';
import { esSubcarpetaValida, filtrarSubcarpetasValidas, limpiarNombreCarpeta, separarRespuestaMeta } from '@lib/subcarpetas';
import { extractApprovedAnexoIds } from '@lib/revision-meta';

export const DRIVE_RESPUESTA_FINAL_FOLDER = 'Respuesta al Solicitante (Cierre Oficial)';

function cleanEnv(val: string | undefined | null): string {
  if (!val) return '';
  return String(val)
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/[\r\n]/g, '')
    .replace(/;+$/, '')
    .trim();
}

export function getDriveConfig() {
  const clientId = cleanEnv(
    process.env.GOOGLE_DRIVE_CLIENT_ID ||
      import.meta.env.GOOGLE_DRIVE_CLIENT_ID ||
      process.env.GOOGLE_CLIENT_ID ||
      import.meta.env.GOOGLE_CLIENT_ID ||
      process.env.DRIVE_CLIENT_ID ||
      import.meta.env.DRIVE_CLIENT_ID
  );
  const clientSecret = cleanEnv(
    process.env.GOOGLE_DRIVE_CLIENT_SECRET ||
      import.meta.env.GOOGLE_DRIVE_CLIENT_SECRET ||
      process.env.GOOGLE_CLIENT_SECRET ||
      import.meta.env.GOOGLE_CLIENT_SECRET ||
      process.env.DRIVE_CLIENT_SECRET ||
      import.meta.env.DRIVE_CLIENT_SECRET
  );
  const refreshToken = cleanEnv(
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN ||
      import.meta.env.GOOGLE_DRIVE_REFRESH_TOKEN ||
      process.env.GOOGLE_REFRESH_TOKEN ||
      import.meta.env.GOOGLE_REFRESH_TOKEN ||
      process.env.DRIVE_REFRESH_TOKEN ||
      import.meta.env.DRIVE_REFRESH_TOKEN
  );
  const parentFolderId = cleanEnv(
    process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID ||
      import.meta.env.GOOGLE_DRIVE_PARENT_FOLDER_ID ||
      process.env.GOOGLE_PARENT_FOLDER_ID ||
      import.meta.env.GOOGLE_PARENT_FOLDER_ID ||
      process.env.DRIVE_FOLDER_ID ||
      import.meta.env.DRIVE_FOLDER_ID ||
      process.env.GOOGLE_DRIVE_FOLDER_ID ||
      import.meta.env.GOOGLE_DRIVE_FOLDER_ID
  );

  return { clientId, clientSecret, refreshToken, parentFolderId };
}

export function isGoogleDriveConfigured(): boolean {
  const { clientId, clientSecret, refreshToken } = getDriveConfig();
  return Boolean(clientId && clientSecret && refreshToken);
}

export async function getGoogleDriveClient(): Promise<{
  drive: drive_v3.Drive;
  parentFolderId: string;
}> {
  const { clientId, clientSecret, refreshToken, parentFolderId } = getDriveConfig();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Faltan credenciales de Google Drive (GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN).'
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'https://developers.google.com/oauthplayground'
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  await oauth2Client.getAccessToken();

  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  return { drive, parentFolderId };
}

export function sanitizeDriveName(name: string, fallback = 'Sin Nombre'): string {
  const cleaned = String(name || '')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

export function getMimeType(fileName: string, defaultType = 'application/octet-stream'): string {
  const ext = (String(fileName || '').split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    txt: 'text/plain',
    csv: 'text/csv',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
  };
  return map[ext] || defaultType;
}

function escapeDriveQueryValue(val: string): string {
  return String(val || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function toNodeStream(fileStreamOrBuffer: Buffer | Readable): Readable {
  if (Buffer.isBuffer(fileStreamOrBuffer)) {
    return Readable.from(fileStreamOrBuffer);
  }
  return fileStreamOrBuffer;
}

/**
 * Busca una carpeta por prefijo único (ej. RAD-2026-00022) o nombre exacto dentro de parentFolderId;
 * si existe la reutiliza (y actualiza su nombre si cambió); si no existe la crea.
 */
export async function obtenerOCrearCarpetaDrive(
  drive: drive_v3.Drive,
  nombreCarpeta: string,
  parentFolderId?: string,
  prefijoBusqueda?: string
): Promise<{ id: string; name: string; webViewLink?: string | null }> {
  const cleanTargetName = sanitizeDriveName(nombreCarpeta, 'Carpeta').slice(0, 140);
  const parentClause =
    parentFolderId && parentFolderId !== 'root'
      ? `'${escapeDriveQueryValue(parentFolderId)}' in parents and `
      : parentFolderId === 'root'
        ? `'root' in parents and `
        : '';

  const baseFilter = `${parentClause}mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  let matched: drive_v3.Schema$File | undefined;

  if (prefijoBusqueda && prefijoBusqueda.trim()) {
    const cleanPrefix = sanitizeDriveName(prefijoBusqueda.trim(), '');
    if (cleanPrefix) {
      const q = `${baseFilter} and name contains '${escapeDriveQueryValue(cleanPrefix)}'`;
      const listRes = await drive.files.list({
        q,
        fields: 'files(id, name, webViewLink)',
        spaces: 'drive',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageSize: 25,
      });
      const files = listRes.data.files || [];
      const lowerPrefix = cleanPrefix.toLowerCase();
      matched =
        files.find((f) => String(f.name || '').toLowerCase() === cleanTargetName.toLowerCase()) ||
        files.find((f) => String(f.name || '').toLowerCase().startsWith(lowerPrefix)) ||
        files.find((f) => String(f.name || '').toLowerCase().includes(lowerPrefix));
    }
  }

  if (!matched) {
    const exactQ = `${baseFilter} and name = '${escapeDriveQueryValue(cleanTargetName)}'`;
    const exactRes = await drive.files.list({
      q: exactQ,
      fields: 'files(id, name, webViewLink)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 10,
    });
    matched = (exactRes.data.files || [])[0];
  }

  if (matched?.id) {
    if (matched.name !== cleanTargetName) {
      try {
        const updRes = await drive.files.update({
          fileId: matched.id,
          requestBody: { name: cleanTargetName },
          fields: 'id, name, webViewLink',
          supportsAllDrives: true,
        });
        return {
          id: updRes.data.id || matched.id,
          name: updRes.data.name || cleanTargetName,
          webViewLink: updRes.data.webViewLink || matched.webViewLink,
        };
      } catch {
        // Si no se pudo renombrar, reutilizar ID existente sin fallar
      }
    }
    return {
      id: matched.id,
      name: matched.name || cleanTargetName,
      webViewLink: matched.webViewLink,
    };
  }

  const requestBody: drive_v3.Schema$File = {
    name: cleanTargetName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentFolderId) {
    requestBody.parents = [parentFolderId];
  }

  const created = await drive.files.create({
    requestBody,
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  });

  if (!created.data.id) {
    throw new Error(`No se pudo crear la carpeta "${cleanTargetName}" en Google Drive.`);
  }

  return {
    id: created.data.id,
    name: created.data.name || cleanTargetName,
    webViewLink: created.data.webViewLink,
  };
}

/**
 * Sube o sobrescribe idempotentemente un archivo dentro de una carpeta de Google Drive
 * soportando tanto Buffer como Stream Readable para archivos pesados.
 */
export async function subirOActualizarArchivoEnCarpetaDrive(
  drive: drive_v3.Drive,
  folderId: string,
  nombreArchivo: string,
  fileStreamOrBuffer: Buffer | Readable,
  mimeType?: string
): Promise<{ id: string; name: string; webViewLink?: string | null }> {
  const safeName = sanitizeDriveName(nombreArchivo, 'documento.bin');
  const safeMime =
    mimeType && mimeType !== 'application/octet-stream'
      ? mimeType
      : getMimeType(safeName, 'application/octet-stream');

  const q = `'${escapeDriveQueryValue(folderId)}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder' and name = '${escapeDriveQueryValue(safeName)}'`;
  const existingRes = await drive.files.list({
    q,
    fields: 'files(id, name, webViewLink)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 10,
  });

  const existingFiles = existingRes.data.files || [];
  const primaryMatch = existingFiles[0];
  const bodyStream = toNodeStream(fileStreamOrBuffer);

  if (primaryMatch?.id) {
    const updRes = await drive.files.update({
      fileId: primaryMatch.id,
      requestBody: { name: safeName },
      media: { mimeType: safeMime, body: bodyStream },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    });

    // Limpiar posibles duplicados previos con el mismo nombre
    for (let i = 1; i < existingFiles.length; i++) {
      const dupId = existingFiles[i]?.id;
      if (dupId) {
        await drive.files.delete({ fileId: dupId, supportsAllDrives: true }).catch(() => {});
      }
    }

    return {
      id: updRes.data.id || primaryMatch.id,
      name: updRes.data.name || safeName,
      webViewLink: updRes.data.webViewLink || primaryMatch.webViewLink,
    };
  }

  const created = await drive.files.create({
    requestBody: {
      name: safeName,
      parents: [folderId],
    },
    media: {
      mimeType: safeMime,
      body: bodyStream,
    },
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  });

  return {
    id: created.data.id || '',
    name: created.data.name || safeName,
    webViewLink: created.data.webViewLink,
  };
}

/**
 * Elimina de una carpeta de Google Drive cualquier archivo que coincida con nombreArchivo.
 */
export async function eliminarArchivoDeCarpetaDrive(
  drive: drive_v3.Drive,
  folderId: string,
  nombreArchivo: string
): Promise<number> {
  const safeName = sanitizeDriveName(nombreArchivo, '');
  if (!safeName || !folderId) return 0;

  const q = `'${escapeDriveQueryValue(folderId)}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
  const listRes = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 100,
  });

  const targetLower = safeName.toLowerCase();
  const matches = (listRes.data.files || []).filter((f) => {
    const fName = String(f.name || '').trim().toLowerCase();
    return fName === targetLower || fName.endsWith(` - ${targetLower}`);
  });

  let deleted = 0;
  for (const file of matches) {
    if (!file.id) continue;
    try {
      await drive.files.delete({ fileId: file.id, supportsAllDrives: true });
      deleted++;
    } catch {
      // Silencioso si ya fue eliminado o sin permiso
    }
  }
  return deleted;
}

/**
 * Elimina carpetas previas del mismo radicado (reemplazo limpio sin duplicados).
 */
async function eliminarCarpetasPorRadicadoEnDrive(
  drive: drive_v3.Drive,
  radicadoPrefix: string,
  parentFolderId?: string
): Promise<number> {
  const cleanPrefix = sanitizeDriveName(radicadoPrefix, '');
  if (!cleanPrefix) return 0;

  const parentClause =
    parentFolderId && parentFolderId !== 'root'
      ? `'${escapeDriveQueryValue(parentFolderId)}' in parents and `
      : '';

  const q = `${parentClause}mimeType = 'application/vnd.google-apps.folder' and trashed = false and name contains '${escapeDriveQueryValue(cleanPrefix)}'`;
  const listRes = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 50,
  });

  const prefixUpper = cleanPrefix.toUpperCase();
  const targets = (listRes.data.files || []).filter((f) => {
    const n = String(f.name || '').trim().toUpperCase();
    return n === prefixUpper || n.startsWith(`${prefixUpper} `) || n.startsWith(`${prefixUpper}-`);
  });

  let deleted = 0;
  for (const folder of targets) {
    if (!folder.id) continue;
    try {
      await drive.files.delete({ fileId: folder.id, supportsAllDrives: true });
      deleted++;
    } catch (err: any) {
      console.warn(`[Google Drive] No se pudo eliminar carpeta previa ${folder.name}:`, err?.message);
    }
  }
  return deleted;
}

/**
 * Descarga un archivo desde URL o Supabase Storage entregando Readable (streams pesados) o Buffer.
 */
export async function downloadFileStreamOrBuffer(
  storagePath: string
): Promise<{ data: Buffer | Readable; mimeType: string }> {
  const trimmedPath = (storagePath || '').trim();
  const STREAM_THRESHOLD_BYTES = 20 * 1024 * 1024;

  const readHttpResponse = async (res: Response, fallbackName: string) => {
    const contentType = res.headers.get('content-type') || getMimeType(fallbackName);
    const len = Number(res.headers.get('content-length') || '0');
    if (res.body && len > STREAM_THRESHOLD_BYTES) {
      return {
        data: Readable.fromWeb(res.body as unknown as NodeWebReadableStream),
        mimeType: contentType,
      };
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
      data: Buffer.from(arrayBuffer),
      mimeType: contentType,
    };
  };

  if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
    const res = await fetch(trimmedPath);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} al descargar archivo desde ${trimmedPath}`);
    }
    return readHttpResponse(res, trimmedPath);
  }

  const cleanPath = trimmedPath.replace(/^peticiones\//, '').replace(/^\/+/, '');
  let decodedPath = cleanPath;
  try {
    decodedPath = decodeURIComponent(cleanPath);
  } catch {}

  for (const pathAttempt of Array.from(new Set([cleanPath, decodedPath]))) {
    try {
      const dbStorage = (supabaseAdmin || supabase).storage;
      const { data, error } = await dbStorage.from('peticiones').download(pathAttempt);
      if (!error && data) {
        if (typeof data.stream === 'function' && data.size > STREAM_THRESHOLD_BYTES) {
          return {
            data: Readable.fromWeb(data.stream() as unknown as NodeWebReadableStream),
            mimeType: data.type || getMimeType(cleanPath, 'application/pdf'),
          };
        }
        const arrayBuffer = await data.arrayBuffer();
        return {
          data: Buffer.from(arrayBuffer),
          mimeType: data.type || getMimeType(cleanPath, 'application/pdf'),
        };
      }
    } catch {}
  }

  const { data: publicData } = (supabaseAdmin || supabase).storage.from('peticiones').getPublicUrl(cleanPath);
  const candidateUrls = [
    publicData?.publicUrl,
    `https://irjjpjtvhxoakiazfswn.supabase.co/storage/v1/object/public/peticiones/${cleanPath}`,
    `https://irjjpjtvhxoakiazfswn.supabase.co/storage/v1/object/public/peticiones/${encodeURIComponent(cleanPath)}`,
  ].filter(Boolean) as string[];

  for (const pUrl of candidateUrls) {
    try {
      const resp = await fetch(pUrl);
      if (resp.ok) {
        return readHttpResponse(resp, cleanPath);
      }
    } catch {}
  }

  throw new Error(`No se pudo descargar el archivo desde ${storagePath} en Supabase Storage.`);
}

function inferSubcarpetasExpediente(p: any): any[] {
  const dbSubs = p.subcarpetas && Array.isArray(p.subcarpetas) ? filtrarSubcarpetasValidas(p.subcarpetas) : [];
  if (dbSubs.length > 0) return dbSubs;

  const rawInst = p.instrucciones_anexos || '';
  const { textoLimpio } = separarRespuestaMeta(rawInst);
  const withoutPin = textoLimpio.replace(/^PIN:\s*[0-9A-Z]{6}(\s*\|\s*)?/i, '').trim();

  const mapByName: Record<string, any> = {};
  if (withoutPin) {
    const lines = withoutPin.split(/\r?\n|;/).map((l: string) => l.trim()).filter(Boolean);
    lines.forEach((line: string, idx: number) => {
      const match = line.match(/^\[([^\]]+)\]\s*:?\s*(.*)$/);
      if (match) {
        const name = (match[1] || '').trim();
        const desc = (match[2] || '').trim();
        if (name && esSubcarpetaValida({ nombre: name, descripcion: desc })) {
          const key = name.toLowerCase();
          mapByName[key] = {
            id: `sub-${idx + 1}`,
            peticion_id: p.id,
            nombre: name,
            descripcion: desc,
          };
        }
      }
    });
  }

  if (Array.isArray(p.peticion_responsables)) {
    p.peticion_responsables.forEach((r: any, rIdx: number) => {
      const rawObs = (r.observaciones_entrega || '').trim();
      const match = rawObs.match(/^\[([^\]]+)\]/);
      if (match) {
        const name = (match[1] || '').trim();
        if (name && esSubcarpetaValida({ nombre: name })) {
          const key = name.toLowerCase();
          if (!mapByName[key]) {
            mapByName[key] = {
              id: r.subcarpeta_id || `sub-resp-${rIdx + 1}`,
              peticion_id: p.id,
              nombre: name,
              descripcion: '',
            };
          }
        }
      }
    });
  }

  return filtrarSubcarpetasValidas(Object.values(mapByName));
}

function isFileForSubfolder(anexo: any, sub: any, allSubs: any[]): boolean {
  if (!anexo) return false;
  if (anexo.subcarpeta_id && sub.id && anexo.subcarpeta_id === sub.id) return true;

  const cleanName = (anexo.nombre_archivo || '').toLowerCase();
  const cleanSub = (sub.nombre || '').toLowerCase().trim();
  if (cleanSub && (cleanName.includes(`[${cleanSub}]`) || cleanName.includes(`[subcarpeta ${cleanSub}]`))) {
    return true;
  }

  const slug = cleanSub.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (slug && anexo.storage_path && anexo.storage_path.toLowerCase().includes(`/${slug}/`)) {
    return true;
  }

  if (allSubs.length === 1) return true;
  return false;
}

function getOfficeNameForAnexo(anexo: any, responsables: any[]): string {
  if (anexo.peticion_responsable_id) {
    const resp = responsables.find((r) => r.id === anexo.peticion_responsable_id);
    if (resp) {
      if (Array.isArray(resp.oficinas)) return resp.oficinas[0]?.nombre || '';
      if (resp.oficinas?.nombre) return resp.oficinas.nombre;
    }
  }
  if (anexo.subido_por_email) {
    const respByEmail = responsables.find((r) => {
      const emailOfi = Array.isArray(r.oficinas)
        ? r.oficinas[0]?.email_institucional
        : r.oficinas?.email_institucional;
      return emailOfi && emailOfi.toLowerCase() === anexo.subido_por_email.toLowerCase();
    });
    if (respByEmail) {
      if (Array.isArray(respByEmail.oficinas)) return respByEmail.oficinas[0]?.nombre || '';
      if (respByEmail.oficinas?.nombre) return respByEmail.oficinas.nombre;
    }
  }
  return '';
}

function stripBracketPrefix(name: string): string {
  return String(name || 'Documento.pdf').replace(/^\[[^\]]+\]\s*/, '').trim();
}

function buildBaseDocumentDriveName(originalName: string): string {
  const cleanOriginal = sanitizeDriveName(stripBracketPrefix(originalName), 'Documento.pdf');
  if (cleanOriginal.toLowerCase().startsWith('00_documento_base_')) {
    return cleanOriginal;
  }
  return `00_Documento_Base_${cleanOriginal}`;
}

function getSubfolderDisplayAndPrefix(rawSubName: string, index: number): {
  displayName: string;
  prefix?: string;
} {
  const cleaned = limpiarNombreCarpeta(rawSubName) || `Subcarpeta ${index + 1}`;
  const numMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*[-–]/);
  return {
    displayName: cleaned,
    prefix: numMatch?.[1] ? `${numMatch[1]} -` : undefined,
  };
}

export function isAnexoAprobadoEnExpediente(
  anexo: any,
  approvedIds: Set<string>
): boolean {
  if (!anexo || !anexo.storage_path) return false;
  if (String(anexo.nombre_archivo || '').toUpperCase().includes('[RECHAZADO]')) return false;
  return approvedIds.has(String(anexo.id));
}

export interface FullExpedienteDriveData {
  peticion: any;
  subcarpetas: any[];
  responsables: any[];
  anexoPrincipal: any | null;
  anexoRespuestaFinal: any | null;
  anexosDependencias: any[];
  approvedIds: Set<string>;
  cleanRadicado: string;
  mainFolderName: string;
}

export async function fetchFullExpedienteParaDrive(
  peticionId: string
): Promise<FullExpedienteDriveData | null> {
  const targetId = String(peticionId || '').trim();
  if (!targetId) return null;

  const client = (supabaseAdmin || supabase) as any;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId);
  let peticion: any = null;

  if (isUuid) {
    const { data } = await client
      .from('peticiones')
      .select('*')
      .eq('id', targetId)
      .maybeSingle();
    peticion = data;
  }

  if (!peticion) {
    const { data } = await client
      .from('peticiones')
      .select('*')
      .eq('numero_radicado', targetId)
      .maybeSingle();
    peticion = data;
  }

  if (!peticion) {
    const { data } = await client
      .from('peticiones')
      .select('*')
      .ilike('numero_radicado', `%${targetId}%`)
      .limit(1)
      .maybeSingle();
    peticion = data;
  }

  if (!peticion) {
    const { data: allPets } = await client
      .from('peticiones')
      .select('*')
      .limit(100);
    if (Array.isArray(allPets)) {
      peticion = allPets.find(
        (p: any) =>
          String(p.id) === targetId ||
          String(p.numero_radicado || '').toUpperCase() === targetId.toUpperCase() ||
          String(p.numero_radicado || '').toUpperCase().includes(targetId.toUpperCase())
      );
    }
  }

  if (!peticion) return null;

  const realPeticionUuid = peticion.id;

  const { data: anexosData } = await client
    .from('peticion_anexos')
    .select('*')
    .eq('peticion_id', realPeticionUuid)
    .order('created_at', { ascending: true });

  const { data: respData } = await client
    .from('peticion_responsables')
    .select('*, oficinas ( id, codigo, nombre, email_institucional )')
    .eq('peticion_id', realPeticionUuid)
    .order('created_at', { ascending: true });

  const { data: dbSubs } = await client
    .from('peticion_subcarpetas')
    .select('id, peticion_id, nombre, descripcion, created_at')
    .eq('peticion_id', realPeticionUuid)
    .order('created_at', { ascending: true });

  const anexos: any[] = Array.isArray(anexosData) ? anexosData : [];
  const responsables: any[] = Array.isArray(respData) ? respData : [];
  peticion.peticion_anexos = anexos;
  peticion.peticion_responsables = responsables;
  if (dbSubs && dbSubs.length > 0) {
    peticion.subcarpetas = dbSubs;
  }

  const subcarpetas = inferSubcarpetasExpediente(peticion);

  const { respuestaMeta } = separarRespuestaMeta(peticion.instrucciones_anexos);
  const respMetaObj = respuestaMeta?.archivo_respuesta || respuestaMeta?.respuesta_archivo || null;
  let anexoRespuestaFinal: any = null;
  if (respMetaObj && respMetaObj.storage_path) {
    anexoRespuestaFinal = respMetaObj;
  } else {
    const respAnexo = anexos.find((a: any) => a.storage_path && a.storage_path.includes('/respuesta_final/'));
    if (respAnexo) anexoRespuestaFinal = respAnexo;
  }

  let anexoPrincipal =
    anexos.find(
      (a: any) =>
        !a.es_anexo_oficina &&
        (!anexoRespuestaFinal ||
          (a.id !== anexoRespuestaFinal.id && a.storage_path !== anexoRespuestaFinal.storage_path))
    ) ||
    (anexos[0] &&
    (!anexoRespuestaFinal ||
      (anexos[0].id !== anexoRespuestaFinal.id && anexos[0].storage_path !== anexoRespuestaFinal.storage_path))
      ? anexos[0]
      : null);

  // Si no está en anexos pero la petición tiene archivo_url registrado, construir anexo principal sintético
  if (!anexoPrincipal && peticion.archivo_url) {
    const synthName = sanitizeDriveName(
      peticion.asunto ? `${peticion.asunto}.pdf` : 'Documento_Base.pdf',
      'Documento_Base.pdf'
    );
    anexoPrincipal = {
      id: `principal-${peticion.id}`,
      peticion_id: peticion.id,
      nombre_archivo: synthName,
      storage_path: peticion.archivo_url,
      mime_type: 'application/pdf',
      es_anexo_oficina: false,
    };
  }

  const anexosDependencias = anexos.filter(
    (a: any) =>
      a !== anexoPrincipal &&
      a !== anexoRespuestaFinal &&
      (!anexoRespuestaFinal || a.storage_path !== anexoRespuestaFinal.storage_path)
  );

  const approvedIds = new Set<string>();
  for (const r of responsables) {
    const ids = extractApprovedAnexoIds(r.observaciones_entrega);
    ids.forEach((id) => approvedIds.add(id));
  }

  const cleanRadicado = String(peticion.numero_radicado || 'RAD-2026').trim();
  const cleanAsunto = sanitizeDriveName(peticion.asunto || 'Expediente Documental', 'Expediente Documental').slice(
    0,
    95
  );
  const mainFolderName = `${cleanRadicado} - ${cleanAsunto}`;

  return {
    peticion,
    subcarpetas,
    responsables,
    anexoPrincipal,
    anexoRespuestaFinal,
    anexosDependencias,
    approvedIds,
    cleanRadicado,
    mainFolderName,
  };
}

async function ensureFolderShareAndGetUrl(drive: drive_v3.Drive, folderId: string): Promise<string> {
  try {
    await drive.permissions.create({
      fileId: folderId,
      requestBody: { role: 'reader', type: 'anyone' },
      supportsAllDrives: true,
    });
  } catch {
    try {
      await drive.permissions.create({
        fileId: folderId,
        requestBody: { role: 'reader', type: 'domain', domain: 'unitropico.edu.co' },
        supportsAllDrives: true,
      });
    } catch {}
  }

  let webViewLink = `https://drive.google.com/drive/folders/${folderId}`;
  try {
    const folderRes = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    });
    if (folderRes.data.webViewLink) {
      webViewLink = folderRes.data.webViewLink;
    }
  } catch {}

  return webViewLink;
}

async function persistDriveUrlInDb(peticionId: string, webViewLink: string): Promise<void> {
  try {
    const client = (supabaseAdmin || supabase) as any;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(peticionId);
    if (isUuid) {
      await client
        .from('peticiones')
        .update({ respuesta_drive_url: webViewLink })
        .eq('id', peticionId);
    } else {
      await client
        .from('peticiones')
        .update({ respuesta_drive_url: webViewLink })
        .eq('numero_radicado', peticionId);
    }
  } catch (err: any) {
    console.warn('[Google Drive] Aviso guardando respuesta_drive_url en BD:', err?.message);
  }
}

async function obtenerOCrearCarpetaExpedienteRoot(
  drive: drive_v3.Drive,
  mainFolderName: string,
  cleanRadicado: string,
  parentFolderId?: string
) {
  if (parentFolderId) {
    try {
      return await obtenerOCrearCarpetaDrive(drive, mainFolderName, parentFolderId, cleanRadicado);
    } catch (err: any) {
      console.warn(
        `[Google Drive] Falló acceso a carpeta padre (${parentFolderId}), intentando raíz:`,
        err?.message
      );
    }
  }
  return obtenerOCrearCarpetaDrive(drive, mainFolderName, undefined, cleanRadicado);
}

/**
 * Inicialización incremental (sin borrar carpetas existentes):
 * Crea o actualiza carpeta raíz RAD-..., sube documento base, asegura subcarpetas y carpeta de cierre oficial.
 */
export async function inicializarEstructuraExpedienteDrive(peticionId: string): Promise<{
  synced: boolean;
  folderId?: string;
  webViewLink?: string;
}> {
  if (!isGoogleDriveConfigured()) return { synced: false };

  const data = await fetchFullExpedienteParaDrive(peticionId);
  if (!data) return { synced: false };

  const { drive, parentFolderId } = await getGoogleDriveClient();
  const mainFolder = await obtenerOCrearCarpetaExpedienteRoot(
    drive,
    data.mainFolderName,
    data.cleanRadicado,
    parentFolderId
  );

  if (data.anexoPrincipal?.storage_path) {
    try {
      const { data: fileData, mimeType } = await downloadFileStreamOrBuffer(data.anexoPrincipal.storage_path);
      const baseName = buildBaseDocumentDriveName(data.anexoPrincipal.nombre_archivo || 'Documento_Original.pdf');
      await subirOActualizarArchivoEnCarpetaDrive(
        drive,
        mainFolder.id,
        baseName,
        fileData,
        mimeType || data.anexoPrincipal.mime_type
      );
    } catch (err: any) {
      console.warn('[Google Drive] Error subiendo documento base:', err?.message);
    }
  }

  for (let i = 0; i < data.subcarpetas.length; i++) {
    const sub = data.subcarpetas[i];
    const { displayName, prefix } = getSubfolderDisplayAndPrefix(sub.nombre, i);
    await obtenerOCrearCarpetaDrive(drive, displayName, mainFolder.id, prefix).catch(() => null);
  }

  await obtenerOCrearCarpetaDrive(drive, DRIVE_RESPUESTA_FINAL_FOLDER, mainFolder.id).catch(() => null);

  const webViewLink = await ensureFolderShareAndGetUrl(drive, mainFolder.id);
  await persistDriveUrlInDb(peticionId, webViewLink);

  return { synced: true, folderId: mainFolder.id, webViewLink };
}

/**
 * Sincroniza un único aporte APROBADO (`✓`) hacia su subcarpeta exacta en Google Drive.
 */
export async function sincronizarAporteAprobadoEnDrive(
  peticionId: string,
  anexoId: string,
  subcarpetaNombre?: string | null,
  responsableId?: string | null
): Promise<{ synced: boolean; driveUrl?: string; fileName?: string }> {
  if (!isGoogleDriveConfigured()) return { synced: false };

  const data = await fetchFullExpedienteParaDrive(peticionId);
  if (!data) return { synced: false };

  const targetAnexo = data.anexosDependencias.find((a) => String(a.id) === String(anexoId));
  if (!targetAnexo || !targetAnexo.storage_path) {
    return { synced: false };
  }

  const { drive, parentFolderId } = await getGoogleDriveClient();
  const mainFolder = await obtenerOCrearCarpetaExpedienteRoot(
    drive,
    data.mainFolderName,
    data.cleanRadicado,
    parentFolderId
  );

  // Asegurar documento base si la carpeta recién se crea
  if (data.anexoPrincipal?.storage_path) {
    try {
      const { data: baseData, mimeType } = await downloadFileStreamOrBuffer(data.anexoPrincipal.storage_path);
      const baseName = buildBaseDocumentDriveName(data.anexoPrincipal.nombre_archivo || 'Documento_Original.pdf');
      await subirOActualizarArchivoEnCarpetaDrive(
        drive,
        mainFolder.id,
        baseName,
        baseData,
        mimeType || data.anexoPrincipal.mime_type
      );
    } catch {}
  }

  // Encontrar la subcarpeta exacta del aporte
  let matchedSubIndex = data.subcarpetas.findIndex((s) =>
    isFileForSubfolder(targetAnexo, s, data.subcarpetas)
  );
  if (matchedSubIndex < 0 && subcarpetaNombre) {
    const targetClean = limpiarNombreCarpeta(subcarpetaNombre).toLowerCase();
    matchedSubIndex = data.subcarpetas.findIndex(
      (s) => limpiarNombreCarpeta(s.nombre).toLowerCase() === targetClean
    );
  }
  if (matchedSubIndex < 0 && responsableId) {
    const resp = data.responsables.find((r) => String(r.id) === String(responsableId));
    if (resp?.subcarpeta_id) {
      matchedSubIndex = data.subcarpetas.findIndex((s) => String(s.id) === String(resp.subcarpeta_id));
    }
  }

  let targetSubFolderId = mainFolder.id;
  if (matchedSubIndex >= 0) {
    const sub = data.subcarpetas[matchedSubIndex];
    const { displayName, prefix } = getSubfolderDisplayAndPrefix(sub.nombre, matchedSubIndex);
    const subFolder = await obtenerOCrearCarpetaDrive(drive, displayName, mainFolder.id, prefix);
    targetSubFolderId = subFolder.id;
  } else if (subcarpetaNombre) {
    const { displayName, prefix } = getSubfolderDisplayAndPrefix(subcarpetaNombre, 0);
    const subFolder = await obtenerOCrearCarpetaDrive(drive, displayName, mainFolder.id, prefix);
    targetSubFolderId = subFolder.id;
  } else {
    const fallbackFolder = await obtenerOCrearCarpetaDrive(drive, 'Soportes Adicionales', mainFolder.id);
    targetSubFolderId = fallbackFolder.id;
  }

  const { data: fileData, mimeType } = await downloadFileStreamOrBuffer(targetAnexo.storage_path);
  const ofiNombre = getOfficeNameForAnexo(targetAnexo, data.responsables);
  const cleanFileName = stripBracketPrefix(targetAnexo.nombre_archivo || 'anexo.pdf');
  const driveFileName = ofiNombre ? `[Aporte de ${ofiNombre}] - ${cleanFileName}` : cleanFileName;

  await subirOActualizarArchivoEnCarpetaDrive(
    drive,
    targetSubFolderId,
    driveFileName,
    fileData,
    mimeType || targetAnexo.mime_type
  );

  const driveUrl = await ensureFolderShareAndGetUrl(drive, mainFolder.id);
  await persistDriveUrlInDb(peticionId, driveUrl);

  return { synced: true, driveUrl, fileName: driveFileName };
}

/**
 * Elimina un archivo rechazado (`✕`) de su subcarpeta en Google Drive (si existe).
 */
export async function eliminarAporteRechazadoDeDrive(
  peticionId: string,
  cleanFileName: string,
  oficinaNombre?: string | null,
  subcarpetaNombre?: string | null
): Promise<{ removed: boolean; deletedCount: number }> {
  if (!isGoogleDriveConfigured()) return { removed: false, deletedCount: 0 };

  const data = await fetchFullExpedienteParaDrive(peticionId);
  if (!data) return { removed: false, deletedCount: 0 };

  const { drive, parentFolderId } = await getGoogleDriveClient();
  const cleanPrefix = sanitizeDriveName(data.cleanRadicado, '');
  const parentClause =
    parentFolderId && parentFolderId !== 'root'
      ? `'${escapeDriveQueryValue(parentFolderId)}' in parents and `
      : '';
  const rootSearch = await drive.files.list({
    q: `${parentClause}mimeType = 'application/vnd.google-apps.folder' and trashed = false and name contains '${escapeDriveQueryValue(cleanPrefix)}'`,
    fields: 'files(id, name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 10,
  });

  const mainFolder = (rootSearch.data.files || [])[0];
  if (!mainFolder?.id) return { removed: false, deletedCount: 0 };

  // Buscar en la subcarpeta correspondiente (o en todas las subcarpetas si no se conoce)
  const subFoldersRes = await drive.files.list({
    q: `'${escapeDriveQueryValue(mainFolder.id)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 50,
  });

  const candidateSubFolders = (subFoldersRes.data.files || []).filter((sf) => {
    if (!subcarpetaNombre) return true;
    const targetSub = limpiarNombreCarpeta(subcarpetaNombre).toLowerCase();
    const sfLower = String(sf.name || '').toLowerCase();
    return sfLower === targetSub || sfLower.includes(targetSub);
  });

  const foldersToCheck = candidateSubFolders.length > 0 ? candidateSubFolders : subFoldersRes.data.files || [];
  const candidateNames = [
    oficinaNombre ? `[Aporte de ${oficinaNombre}] - ${cleanFileName}` : '',
    cleanFileName,
  ].filter(Boolean);

  let deletedCount = 0;
  for (const sf of foldersToCheck) {
    if (!sf.id) continue;
    for (const cName of candidateNames) {
      deletedCount += await eliminarArchivoDeCarpetaDrive(drive, sf.id, cName);
    }
  }

  return { removed: deletedCount > 0, deletedCount };
}

/**
 * Extrae el ID de una carpeta de Google Drive a partir de una URL o cadena de ID.
 */
export function extractDriveFolderId(input?: string | null): string | null {
  if (!input) return null;
  const str = String(input).trim();
  const urlMatch = str.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (urlMatch?.[1]) return urlMatch[1];
  const idMatch = str.match(/^([a-zA-Z0-9_-]{20,})$/);
  if (idMatch?.[1]) return idMatch[1];
  return null;
}

/**
 * 1. Elimina la carpeta de un radicado en Google Drive usando su ID o buscando por prefijo de radicado.
 * Nunca bloquea la operación si no está configurado o si no existe en Drive.
 */
export async function eliminarCarpetaRadicadoDeDrive(
  radicado: string,
  driveFolderIdOrUrl?: string | null
): Promise<{ success: boolean; deletedCount: number }> {
  if (!isGoogleDriveConfigured()) return { success: false, deletedCount: 0 };
  const cleanRad = sanitizeDriveName(radicado, '').trim();
  if (!cleanRad) return { success: false, deletedCount: 0 };

  let deletedCount = 0;
  try {
    const { drive, parentFolderId } = await getGoogleDriveClient();

    // 1. Si viene un ID directo o URL, intentar eliminar directamente esa carpeta
    const directId = extractDriveFolderId(driveFolderIdOrUrl);
    if (directId) {
      try {
        await drive.files.delete({ fileId: directId, supportsAllDrives: true });
        deletedCount++;
      } catch (err: any) {
        try {
          await drive.files.update({ fileId: directId, requestBody: { trashed: true }, supportsAllDrives: true });
          deletedCount++;
        } catch {}
      }
    }

    // 2. Buscar en la raíz de Drive todas las carpetas que coincidan con el radicado para no dejar huérfanas
    const parentClause =
      parentFolderId && parentFolderId !== 'root'
        ? `'${escapeDriveQueryValue(parentFolderId)}' in parents and `
        : '';
    const q = `${parentClause}mimeType = 'application/vnd.google-apps.folder' and trashed = false and name contains '${escapeDriveQueryValue(cleanRad)}'`;
    const listRes = await drive.files.list({
      q,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 30,
    });

    const cleanUpper = cleanRad.toUpperCase();
    const matchingFolders = (listRes.data.files || []).filter((f) => {
      const n = String(f.name || '').toUpperCase();
      return n.includes(cleanUpper);
    });

    for (const f of matchingFolders) {
      if (!f.id || f.id === directId) continue;
      try {
        await drive.files.delete({ fileId: f.id, supportsAllDrives: true });
        deletedCount++;
      } catch (err: any) {
        try {
          await drive.files.update({ fileId: f.id, requestBody: { trashed: true }, supportsAllDrives: true });
          deletedCount++;
        } catch {}
      }
    }

    return { success: true, deletedCount };
  } catch (err: any) {
    console.warn(`[Google Drive] Error al eliminar carpeta de radicado ${radicado}:`, err?.message);
    return { success: false, deletedCount };
  }
}

/**
 * 2. Elimina una subcarpeta de dependencia específica dentro de la carpeta del radicado en Google Drive.
 */
export async function eliminarSubcarpetaDependenciaDeDrive(
  radicado: string,
  nombreSubcarpetaODependencia: string
): Promise<{ success: boolean; deletedCount: number }> {
  if (!isGoogleDriveConfigured()) return { success: false, deletedCount: 0 };
  const cleanRad = sanitizeDriveName(radicado, '').trim();
  const cleanSub = sanitizeDriveName(nombreSubcarpetaODependencia, '').trim();
  if (!cleanRad || !cleanSub) return { success: false, deletedCount: 0 };

  let deletedCount = 0;
  try {
    const { drive, parentFolderId } = await getGoogleDriveClient();

    // Ubicar la carpeta principal del radicado
    const parentClause =
      parentFolderId && parentFolderId !== 'root'
        ? `'${escapeDriveQueryValue(parentFolderId)}' in parents and `
        : '';
    const rootSearch = await drive.files.list({
      q: `${parentClause}mimeType = 'application/vnd.google-apps.folder' and trashed = false and name contains '${escapeDriveQueryValue(cleanRad)}'`,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 10,
    });

    const mainFolder = (rootSearch.data.files || []).find((f) =>
      String(f.name || '').toUpperCase().includes(cleanRad.toUpperCase())
    ) || (rootSearch.data.files || [])[0];

    if (!mainFolder?.id) return { success: false, deletedCount: 0 };

    // Buscar la subcarpeta interna
    const subQ = `'${escapeDriveQueryValue(mainFolder.id)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false and name contains '${escapeDriveQueryValue(cleanSub)}'`;
    const subRes = await drive.files.list({
      q: subQ,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 20,
    });

    const targetSubs = subRes.data.files || [];
    for (const sf of targetSubs) {
      if (!sf.id) continue;
      try {
        await drive.files.delete({ fileId: sf.id, supportsAllDrives: true });
        deletedCount++;
      } catch {
        try {
          await drive.files.update({ fileId: sf.id, requestBody: { trashed: true }, supportsAllDrives: true });
          deletedCount++;
        } catch {}
      }
    }

    return { success: true, deletedCount };
  } catch (err: any) {
    console.warn(`[Google Drive] Error al eliminar subcarpeta ${nombreSubcarpetaODependencia} de ${radicado}:`, err?.message);
    return { success: false, deletedCount };
  }
}

/**
 * 3. Elimina un archivo individual dentro de la carpeta del radicado (y su subcarpeta opcional) en Google Drive.
 */
export async function eliminarArchivoIndividualDeDrive(
  radicado: string,
  nombreArchivo: string,
  nombreSubcarpeta?: string
): Promise<{ success: boolean; deletedCount: number }> {
  if (!isGoogleDriveConfigured()) return { success: false, deletedCount: 0 };
  const cleanRad = sanitizeDriveName(radicado, '').trim();
  const cleanFileName = sanitizeDriveName(nombreArchivo, '').trim();
  if (!cleanRad || !cleanFileName) return { success: false, deletedCount: 0 };

  let deletedCount = 0;
  try {
    const { drive, parentFolderId } = await getGoogleDriveClient();

    // Ubicar la carpeta del radicado
    const parentClause =
      parentFolderId && parentFolderId !== 'root'
        ? `'${escapeDriveQueryValue(parentFolderId)}' in parents and `
        : '';
    const rootSearch = await drive.files.list({
      q: `${parentClause}mimeType = 'application/vnd.google-apps.folder' and trashed = false and name contains '${escapeDriveQueryValue(cleanRad)}'`,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 10,
    });

    const mainFolder = (rootSearch.data.files || []).find((f) =>
      String(f.name || '').toUpperCase().includes(cleanRad.toUpperCase())
    ) || (rootSearch.data.files || [])[0];

    if (!mainFolder?.id) return { success: false, deletedCount: 0 };

    // Subcarpetas para búsqueda exhaustiva
    const subRes = await drive.files.list({
      q: `'${escapeDriveQueryValue(mainFolder.id)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 50,
    });

    const subfolders = subRes.data.files || [];
    let foldersToCheck: { id?: string | null; name?: string | null }[] = [mainFolder, ...subfolders];

    if (nombreSubcarpeta && nombreSubcarpeta.trim()) {
      const cleanTargetSub = sanitizeDriveName(nombreSubcarpeta, '').toLowerCase();
      const matchedSubs = subfolders.filter((sf) =>
        String(sf.name || '').toLowerCase().includes(cleanTargetSub)
      );
      if (matchedSubs.length > 0) {
        foldersToCheck = matchedSubs;
      }
    }

    const targetLower = cleanFileName.toLowerCase();
    for (const folder of foldersToCheck) {
      if (!folder.id) continue;
      const fileQ = `'${escapeDriveQueryValue(folder.id)}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
      const fileList = await drive.files.list({
        q: fileQ,
        fields: 'files(id, name)',
        spaces: 'drive',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageSize: 100,
      });

      const matchedFiles = (fileList.data.files || []).filter((f) => {
        const fn = String(f.name || '').trim().toLowerCase();
        return fn === targetLower || fn.endsWith(` - ${targetLower}`) || fn.includes(targetLower);
      });

      for (const mf of matchedFiles) {
        if (!mf.id) continue;
        try {
          await drive.files.delete({ fileId: mf.id, supportsAllDrives: true });
          deletedCount++;
        } catch {
          try {
            await drive.files.update({ fileId: mf.id, requestBody: { trashed: true }, supportsAllDrives: true });
            deletedCount++;
          } catch {}
        }
      }
    }

    return { success: true, deletedCount };
  } catch (err: any) {
    console.warn(`[Google Drive] Error al eliminar archivo ${nombreArchivo} de ${radicado}:`, err?.message);
    return { success: false, deletedCount };
  }
}

/**
 * Sube/actualiza la Respuesta Final Oficial en la subcarpeta dedicada dentro de Google Drive.
 */
export async function sincronizarRespuestaFinalEnDrive(
  peticionId: string
): Promise<{ synced: boolean; driveUrl?: string }> {
  if (!isGoogleDriveConfigured()) return { synced: false };

  const data = await fetchFullExpedienteParaDrive(peticionId);
  if (!data || !data.anexoRespuestaFinal?.storage_path) return { synced: false };

  const { drive, parentFolderId } = await getGoogleDriveClient();
  const mainFolder = await obtenerOCrearCarpetaExpedienteRoot(
    drive,
    data.mainFolderName,
    data.cleanRadicado,
    parentFolderId
  );

  const cierreFolder = await obtenerOCrearCarpetaDrive(
    drive,
    DRIVE_RESPUESTA_FINAL_FOLDER,
    mainFolder.id
  );

  const { data: respData, mimeType } = await downloadFileStreamOrBuffer(
    data.anexoRespuestaFinal.storage_path
  );
  const respuestaCleanName = stripBracketPrefix(
    data.anexoRespuestaFinal.nombre_archivo || 'Respuesta_Oficial.pdf'
  );

  await subirOActualizarArchivoEnCarpetaDrive(
    drive,
    cierreFolder.id,
    respuestaCleanName,
    respData,
    mimeType || data.anexoRespuestaFinal.mime_type
  );

  const driveUrl = await ensureFolderShareAndGetUrl(drive, mainFolder.id);
  await persistDriveUrlInDb(peticionId, driveUrl);

  return { synced: true, driveUrl };
}

/**
 * Respaldo completo con REEMPLAZO LIMPIO ("Actualizar Carpeta en Drive" / "Respaldar en Drive"):
 * Elimina carpetas previas del radicado para evitar duplicados o archivos rechazados residuales,
 * reconstruye jerarquía limpia e incluye ÚNICAMENTE aportes aprobados (`✓`), documento base y respuesta final.
 */
export async function respaldarExpedienteLimpioEnDrive(peticionId: string): Promise<{
  folderId: string;
  folderName: string;
  numeroRadicado: string;
  webViewLink: string;
  archivosSubidos: number;
  subcarpetasCreadas: number;
  aprobadosCount: number;
}> {
  const { drive, parentFolderId } = await getGoogleDriveClient();
  const data = await fetchFullExpedienteParaDrive(peticionId);
  if (!data) {
    throw new Error('No se encontró el expediente solicitado en el sistema.');
  }

  // Reemplazo limpio: eliminar carpetas previas del mismo radicado (en parentFolderId y fallback global)
  await eliminarCarpetasPorRadicadoEnDrive(drive, data.cleanRadicado, parentFolderId || undefined);
  if (parentFolderId) {
    await eliminarCarpetasPorRadicadoEnDrive(drive, data.cleanRadicado, undefined);
  }

  // Crear carpeta raíz limpia
  let effectiveParent: string | undefined = parentFolderId || undefined;
  let mainFolder: { id: string; name: string; webViewLink?: string | null };
  if (effectiveParent) {
    try {
      mainFolder = await obtenerOCrearCarpetaDrive(drive, data.mainFolderName, effectiveParent);
    } catch (err: any) {
      console.warn(`[Respaldo Drive] Falló carpeta padre (${effectiveParent}):`, err?.message);
      effectiveParent = undefined;
      mainFolder = await obtenerOCrearCarpetaDrive(drive, data.mainFolderName, undefined);
    }
  } else {
    mainFolder = await obtenerOCrearCarpetaDrive(drive, data.mainFolderName, undefined);
  }

  let archivosSubidos = 0;
  let aprobadosCount = 0;

  // 1. Documento Base
  if (data.anexoPrincipal?.storage_path) {
    try {
      const { data: baseData, mimeType } = await downloadFileStreamOrBuffer(data.anexoPrincipal.storage_path);
      const baseName = buildBaseDocumentDriveName(data.anexoPrincipal.nombre_archivo || 'Documento_Original.pdf');
      await subirOActualizarArchivoEnCarpetaDrive(
        drive,
        mainFolder.id,
        baseName,
        baseData,
        mimeType || data.anexoPrincipal.mime_type
      );
      archivosSubidos++;
    } catch (err: any) {
      console.warn('[Respaldo Drive] Advertencia subiendo documento base:', err?.message);
    }
  }

  // 2. Subcarpetas numeradas y ÚNICAMENTE aportes aprobados (`✓`)
  const anexosAprobados = data.anexosDependencias.filter((a) =>
    isAnexoAprobadoEnExpediente(a, data.approvedIds)
  );
  const uploadedIds = new Set<string>();

  for (let i = 0; i < data.subcarpetas.length; i++) {
    const sub = data.subcarpetas[i];
    const { displayName, prefix } = getSubfolderDisplayAndPrefix(sub.nombre, i);
    let subFolderDrive: { id: string; name: string } | null = null;
    try {
      subFolderDrive = await obtenerOCrearCarpetaDrive(drive, displayName, mainFolder.id, prefix);
    } catch {
      subFolderDrive = await obtenerOCrearCarpetaDrive(drive, `Subcarpeta ${i + 1}`, mainFolder.id).catch(
        () => null
      );
    }
    if (!subFolderDrive?.id) continue;

    const subAnexos = anexosAprobados.filter((a) => {
      if (isFileForSubfolder(a, sub, data.subcarpetas)) return true;
      if (
        a.peticion_responsable_id &&
        data.responsables.some((r) => r.id === a.peticion_responsable_id && r.subcarpeta_id === sub.id)
      ) {
        return true;
      }
      return false;
    });

    for (const anexo of subAnexos) {
      try {
        const { data: fileData, mimeType } = await downloadFileStreamOrBuffer(anexo.storage_path);
        const ofiNombre = getOfficeNameForAnexo(anexo, data.responsables);
        const cleanFileName = stripBracketPrefix(anexo.nombre_archivo || 'anexo.pdf');
        const driveFileName = ofiNombre ? `[Aporte de ${ofiNombre}] - ${cleanFileName}` : cleanFileName;

        await subirOActualizarArchivoEnCarpetaDrive(
          drive,
          subFolderDrive.id,
          driveFileName,
          fileData,
          mimeType || anexo.mime_type
        );
        uploadedIds.add(String(anexo.id || anexo.storage_path));
        archivosSubidos++;
        aprobadosCount++;
      } catch (err: any) {
        console.warn(`[Respaldo Drive] Error subiendo aporte aprobado ${anexo.nombre_archivo}:`, err?.message);
      }
    }
  }

  // Aportes aprobados sin clasificación explícita
  const unclassifiedApproved = anexosAprobados.filter(
    (a) => !uploadedIds.has(String(a.id || a.storage_path))
  );
  if (unclassifiedApproved.length > 0) {
    const extraFolder = await obtenerOCrearCarpetaDrive(drive, 'Soportes Adicionales', mainFolder.id);
    for (const anexo of unclassifiedApproved) {
      try {
        const { data: fileData, mimeType } = await downloadFileStreamOrBuffer(anexo.storage_path);
        const ofiNombre = getOfficeNameForAnexo(anexo, data.responsables);
        const cleanFileName = stripBracketPrefix(anexo.nombre_archivo || 'anexo.pdf');
        const driveFileName = ofiNombre ? `[Aporte de ${ofiNombre}] - ${cleanFileName}` : cleanFileName;

        await subirOActualizarArchivoEnCarpetaDrive(
          drive,
          extraFolder.id,
          driveFileName,
          fileData,
          mimeType || anexo.mime_type
        );
        archivosSubidos++;
        aprobadosCount++;
      } catch (err: any) {
        console.warn(`[Respaldo Drive] Error subiendo aporte adicional:`, err?.message);
      }
    }
  }

  // 3. Carpeta Respuesta al Solicitante (Cierre Oficial)
  const cierreFolder = await obtenerOCrearCarpetaDrive(drive, DRIVE_RESPUESTA_FINAL_FOLDER, mainFolder.id);
  if (data.anexoRespuestaFinal?.storage_path) {
    try {
      const { data: respData, mimeType } = await downloadFileStreamOrBuffer(
        data.anexoRespuestaFinal.storage_path
      );
      const respuestaCleanName = stripBracketPrefix(
        data.anexoRespuestaFinal.nombre_archivo || 'Respuesta_Oficial.pdf'
      );
      await subirOActualizarArchivoEnCarpetaDrive(
        drive,
        cierreFolder.id,
        respuestaCleanName,
        respData,
        mimeType || data.anexoRespuestaFinal.mime_type
      );
      archivosSubidos++;
    } catch (err: any) {
      console.warn('[Respaldo Drive] Advertencia subiendo respuesta final:', err?.message);
    }
  }

  const webViewLink = await ensureFolderShareAndGetUrl(drive, mainFolder.id);
  await persistDriveUrlInDb(peticionId, webViewLink);

  return {
    folderId: mainFolder.id,
    folderName: mainFolder.name,
    numeroRadicado: data.cleanRadicado,
    webViewLink,
    archivosSubidos,
    subcarpetasCreadas: data.subcarpetas.length,
    aprobadosCount,
  };
}
