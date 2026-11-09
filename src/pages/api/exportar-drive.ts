// src/pages/api/exportar-drive.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { google } from 'googleapis';
import { Readable } from 'node:stream';
import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';
import { filtrarSubcarpetasValidas, separarRespuestaMeta } from '@lib/subcarpetas';

/**
 * Limpia y normaliza cadenas de variables de entorno (elimina comillas circundantes y espacios)
 */
function cleanEnv(val: string | undefined | null): string {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '').trim();
}

/**
 * Infiere el MIME type a partir de la extensión del archivo
 */
function getMimeType(fileName: string, defaultType = 'application/octet-stream'): string {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
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
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
  };
  return map[ext] || defaultType;
}

/**
 * Crea una carpeta en Google Drive usando la API oficial v3
 */
async function createDriveFolder(drive: any, name: string, parentId?: string) {
  const cleanName = name.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'Carpeta';
  const fileMetadata: any = {
    name: cleanName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId && parentId !== 'root') {
    fileMetadata.parents = [parentId];
  } else if (parentId === 'root') {
    fileMetadata.parents = ['root'];
  }
  const res = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  });
  return res.data;
}

/**
 * Sube un archivo con buffer en memoria a una carpeta de Google Drive
 */
async function uploadFileToDrive(
  drive: any,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  parentId: string
) {
  const safeName = fileName.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'archivo.bin';
  const safeMime = mimeType && mimeType !== 'application/octet-stream' ? mimeType : getMimeType(safeName);

  const res = await drive.files.create({
    requestBody: {
      name: safeName,
      parents: [parentId],
    },
    media: {
      mimeType: safeMime,
      body: Readable.from(buffer),
    },
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  });
  return res.data;
}

/**
 * Descarga el contenido binario del archivo desde el almacenamiento del sistema
 */
async function downloadFileBuffer(storagePath: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const trimmedPath = (storagePath || '').trim();

  // Si ya es una URL HTTP(S) absoluta, descargarla directamente
  if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
    const res = await fetch(trimmedPath);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} al descargar archivo desde ${trimmedPath}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || getMimeType(trimmedPath);
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: contentType,
    };
  }

  const cleanPath = trimmedPath.replace(/^peticiones\//, '').replace(/^\/+/, '');

  // 1. Intentar descarga autenticada con cliente Supabase Storage
  try {
    const { data, error } = await supabase.storage.from('peticiones').download(cleanPath);
    if (!error && data) {
      const arrayBuffer = await data.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuffer),
        mimeType: data.type || getMimeType(cleanPath, 'application/pdf'),
      };
    }
  } catch (err: any) {
    console.warn('[Exportar Drive] Falló download directo de Supabase, probando URL pública:', err?.message);
  }

  // 2. Fallback: Descarga vía URL pública del bucket
  const publicUrl = `https://irjjpjtvhxoakiazfswn.supabase.co/storage/v1/object/public/peticiones/${cleanPath}`;
  const resp = await fetch(publicUrl);
  if (!resp.ok) {
    throw new Error(`No se pudo descargar el archivo desde ${storagePath} (HTTP ${resp.status})`);
  }
  const arrayBuffer = await resp.arrayBuffer();
  const contentType = resp.headers.get('content-type') || getMimeType(cleanPath, 'application/octet-stream');
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: contentType,
  };
}

/**
 * Infiere subcarpetas del expediente en caso de que la tabla física no contenga registros
 */
function inferSubcarpetasExpediente(p: any): any[] {
  const dbSubs = (p.subcarpetas && Array.isArray(p.subcarpetas)) ? filtrarSubcarpetasValidas(p.subcarpetas) : [];
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
        if (name) {
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
        if (name) {
          const key = name.toLowerCase();
          if (!mapByName[key]) {
            mapByName[key] = {
              id: `sub-resp-${rIdx + 1}`,
              peticion_id: p.id,
              nombre: name,
              descripcion: rawObs.replace(/^\[[^\]]+\]\s*:?\s*/, '').trim(),
            };
          }
        }
      }
    });
  }

  const list = Object.values(mapByName);
  if (list.length === 0) {
    return [{
      id: 'sub-default',
      peticion_id: p.id,
      nombre: 'General',
      descripcion: 'Anexos y soportes generales',
    }];
  }

  return filtrarSubcarpetasValidas(list);
}

/**
 * Asocia un anexo a una subcarpeta específica de forma determinística
 */
function isFileForSubfolder(a: any, sub: any, allSubs: any[]): boolean {
  if (!a) return false;
  if (a.subcarpeta_id && (a.subcarpeta_id === sub.id || String(a.subcarpeta_id) === String(sub.id))) return true;
  const cleanName = (a.nombre_archivo || '').toLowerCase();
  const cleanSub = (sub.nombre || '').toLowerCase().trim();
  if (cleanName.includes(`[${cleanSub}]`) || cleanName.includes(`[subcarpeta ${cleanSub}]`)) return true;
  const slug = cleanSub.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (slug && a.storage_path && a.storage_path.toLowerCase().includes(`/${slug}/`)) return true;
  if (allSubs.length === 1) return true;
  return false;
}

/**
 * Obtiene el nombre de la oficina que aportó un anexo
 */
function getOfficeNameForAnexo(anexo: any, responsibles: any[]): string {
  if (anexo.peticion_responsable_id) {
    const resp = responsibles.find((r) => r.id === anexo.peticion_responsable_id);
    if (resp) {
      if (Array.isArray(resp.oficinas)) return resp.oficinas[0]?.nombre || '';
      if (resp.oficinas?.nombre) return resp.oficinas.nombre;
    }
  }
  if (anexo.subido_por_email) {
    const respByEmail = responsibles.find((r) => {
      const emailOfi = Array.isArray(r.oficinas) ? r.oficinas[0]?.email_institucional : r.oficinas?.email_institucional;
      return emailOfi && emailOfi.toLowerCase() === anexo.subido_por_email.toLowerCase();
    });
    if (respByEmail) {
      if (Array.isArray(respByEmail.oficinas)) return respByEmail.oficinas[0]?.nombre || '';
      if (respByEmail.oficinas?.nombre) return respByEmail.oficinas.nombre;
    }
  }
  return '';
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const { peticionId } = body;

    if (!peticionId || typeof peticionId !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Debe suministrar el identificador (peticionId) del expediente.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Extraer y sanear credenciales de Google Drive
    const clientId = cleanEnv(
      import.meta.env.GOOGLE_DRIVE_CLIENT_ID ||
      process.env.GOOGLE_DRIVE_CLIENT_ID ||
      import.meta.env.GOOGLE_CLIENT_ID ||
      process.env.GOOGLE_CLIENT_ID
    );
    const clientSecret = cleanEnv(
      import.meta.env.GOOGLE_DRIVE_CLIENT_SECRET ||
      process.env.GOOGLE_DRIVE_CLIENT_SECRET ||
      import.meta.env.GOOGLE_CLIENT_SECRET ||
      process.env.GOOGLE_CLIENT_SECRET
    );
    const refreshToken = cleanEnv(
      import.meta.env.GOOGLE_DRIVE_REFRESH_TOKEN ||
      process.env.GOOGLE_DRIVE_REFRESH_TOKEN
    );
    const parentFolderId = cleanEnv(
      import.meta.env.GOOGLE_DRIVE_PARENT_FOLDER_ID ||
      process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID
    );

    if (!clientId || !clientSecret || !refreshToken) {
      return new Response(
        JSON.stringify({
          success: false,
          missingConfig: true,
          error: 'No se han configurado las credenciales de Google Drive en las variables de entorno. Configure GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET y GOOGLE_DRIVE_REFRESH_TOKEN en el archivo .env o en el panel de Vercel.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Inicializar cliente autenticado de Google Drive y verificar token
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'https://developers.google.com/oauthplayground'
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    try {
      await oauth2Client.getAccessToken();
    } catch (authError: any) {
      console.error('[Exportar Drive] Error verificando OAuth token:', authError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Error de autenticación con Google Drive: ${authError?.message || 'Token expirado o revocado'}. Verifique el GOOGLE_DRIVE_REFRESH_TOKEN.`,
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // 3. Consultar expediente completo en la base de datos
    const { data: peticion, error: petErr } = await (supabase
      .from('peticiones' as any)
      .select(`
        id,
        numero_radicado,
        asunto,
        descripcion,
        categoria,
        instrucciones_anexos,
        solicitante_nombre,
        solicitante_email,
        storage_folder_path,
        peticion_anexos (
          id,
          nombre_archivo,
          storage_path,
          tamano_bytes,
          mime_type,
          es_anexo_oficina,
          peticion_responsable_id,
          created_at
        ),
        peticion_responsables (
          id,
          codigo_acceso,
          estado_entrega,
          observaciones_entrega,
          oficinas (
            id,
            codigo,
            nombre,
            email_institucional
          )
        )
      `)
      .eq('id', peticionId)
      .maybeSingle() as any);

    if (petErr || !peticion) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontró el expediente solicitado en el sistema.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Consultar subcarpetas físicas si existen
    const { data: dbSubs } = await (supabase
      .from('peticion_subcarpetas' as any)
      .select('id, peticion_id, nombre, descripcion, created_at')
      .eq('peticion_id', peticionId)
      .order('created_at', { ascending: true }) as any);

    if (dbSubs && dbSubs.length > 0) {
      peticion.subcarpetas = dbSubs;
    }

    const subcarpetas = inferSubcarpetasExpediente(peticion);
    const anexos: any[] = Array.isArray(peticion.peticion_anexos) ? peticion.peticion_anexos : [];
    const responsables: any[] = Array.isArray(peticion.peticion_responsables) ? peticion.peticion_responsables : [];

    // Identificar documento original del expediente (el que no es anexo de oficina o el primero)
    const anexoPrincipal = anexos.find((a: any) => !a.es_anexo_oficina) || anexos[0] || null;
    const anexosDependencias = anexos.filter((a: any) => a !== anexoPrincipal);

    // 4. PASO A: Crear carpeta principal del radicado en Google Drive
    const cleanRadicado = String(peticion.numero_radicado || 'RAD-2026').trim();
    const cleanAsunto = String(peticion.asunto || 'Expediente Documental').replace(/[/\\?%*:|"<>]/g, '-').trim();
    const mainFolderName = `${cleanRadicado} - ${cleanAsunto}`;

    const mainFolder = await createDriveFolder(drive, mainFolderName, parentFolderId || undefined);
    if (!mainFolder?.id) {
      throw new Error('No se pudo crear la carpeta raíz del radicado en Google Drive.');
    }

    let archivosSubidosCount = 0;

    // 5. PASO B: Descargar y subir Documento Original directamente a la carpeta principal
    if (anexoPrincipal && anexoPrincipal.storage_path) {
      try {
        const { buffer, mimeType } = await downloadFileBuffer(anexoPrincipal.storage_path);
        const originalCleanName = (anexoPrincipal.nombre_archivo || 'Documento_Original.pdf').replace(/^\[[^\]]+\]\s*/, '');
        const driveFileName = `[Documento Radicado] - ${originalCleanName}`;
        await uploadFileToDrive(drive, driveFileName, mimeType || anexoPrincipal.mime_type, buffer, mainFolder.id);
        archivosSubidosCount++;
      } catch (origErr: any) {
        console.warn('[Exportar Drive] Advertencia subiendo documento principal:', origErr?.message);
      }
    }

    // 6. PASO C: Crear subcarpeta contenedora "Anexos y Requerimientos de Dependencias"
    const anexosContainerFolder = await createDriveFolder(
      drive,
      'Anexos y Requerimientos de Dependencias',
      mainFolder.id
    );

    // 7. PASO D: Crear cada subcarpeta requerida y subir sus respectivos aportes sin comprimir
    const subcarpetasCreadasCount = subcarpetas.length;
    const uploadedAnexoIds = new Set<string>();

    for (let i = 0; i < subcarpetas.length; i++) {
      const sub = subcarpetas[i];
      const rawSubName = String(sub.nombre || `Subcarpeta_${i + 1}`).trim();
      const subFolderDisplayName = rawSubName.toLowerCase().startsWith('subcarpeta')
        ? rawSubName
        : `Subcarpeta ${rawSubName}`;

      const subFolderDrive = await createDriveFolder(drive, subFolderDisplayName, anexosContainerFolder.id);

      // Filtrar anexos de dependencias asignados a esta subcarpeta
      const subAnexos = anexosDependencias.filter((a) => {
        if (isFileForSubfolder(a, sub, subcarpetas)) return true;
        if (a.peticion_responsable_id && responsables.some((r) => r.id === a.peticion_responsable_id && r.subcarpeta_id === sub.id)) {
          return true;
        }
        return false;
      });

      for (const anexo of subAnexos) {
        if (!anexo.storage_path) continue;
        try {
          const { buffer, mimeType } = await downloadFileBuffer(anexo.storage_path);
          const ofiNombre = getOfficeNameForAnexo(anexo, responsables);
          const cleanFileName = (anexo.nombre_archivo || 'anexo.pdf').replace(/^\[[^\]]+\]\s*/, '');
          const driveFileName = ofiNombre ? `[Aporte de ${ofiNombre}] - ${cleanFileName}` : cleanFileName;

          await uploadFileToDrive(drive, driveFileName, mimeType || anexo.mime_type, buffer, subFolderDrive.id);
          uploadedAnexoIds.add(anexo.id || anexo.storage_path);
          archivosSubidosCount++;
        } catch (uploadErr: any) {
          console.warn(`[Exportar Drive] Advertencia subiendo anexo ${anexo.nombre_archivo}:`, uploadErr?.message);
        }
      }
    }

    // Si existen anexos que no quedaron clasificados en ninguna subcarpeta, subirlos a una carpeta de soportes adicionales
    const unclassifiedAnexos = anexosDependencias.filter((a) => !uploadedAnexoIds.has(a.id || a.storage_path));
    if (unclassifiedAnexos.length > 0) {
      const otrosFolder = await createDriveFolder(drive, 'Subcarpeta Soportes Adicionales', anexosContainerFolder.id);
      for (const anexo of unclassifiedAnexos) {
        if (!anexo.storage_path) continue;
        try {
          const { buffer, mimeType } = await downloadFileBuffer(anexo.storage_path);
          const ofiNombre = getOfficeNameForAnexo(anexo, responsables);
          const cleanFileName = (anexo.nombre_archivo || 'anexo.pdf').replace(/^\[[^\]]+\]\s*/, '');
          const driveFileName = ofiNombre ? `[Aporte de ${ofiNombre}] - ${cleanFileName}` : cleanFileName;

          await uploadFileToDrive(drive, driveFileName, mimeType || anexo.mime_type, buffer, otrosFolder.id);
          archivosSubidosCount++;
        } catch (uploadErr: any) {
          console.warn(`[Exportar Drive] Advertencia subiendo soporte adicional ${anexo.nombre_archivo}:`, uploadErr?.message);
        }
      }
    }

    // 8. PASO E: Configurar permisos de lectura en la carpeta principal de Drive (con fallback institucional)
    try {
      await drive.permissions.create({
        fileId: mainFolder.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
        supportsAllDrives: true,
      });
    } catch (permErr: any) {
      console.warn('[Exportar Drive] Permiso "anyone" no permitido por la política, probando dominio unitropico.edu.co:', permErr?.message);
      try {
        await drive.permissions.create({
          fileId: mainFolder.id,
          requestBody: {
            role: 'reader',
            type: 'domain',
            domain: 'unitropico.edu.co',
          },
          supportsAllDrives: true,
        });
      } catch (domainErr: any) {
        console.warn('[Exportar Drive] Permiso de dominio falló (no fatal):', domainErr?.message);
      }
    }

    // Obtener enlace web compartible actualizado
    let webViewLink = `https://drive.google.com/drive/folders/${mainFolder.id}`;
    try {
      const folderRes = await drive.files.get({
        fileId: mainFolder.id,
        fields: 'id, name, webViewLink',
        supportsAllDrives: true,
      });
      if (folderRes.data.webViewLink) {
        webViewLink = folderRes.data.webViewLink;
      }
    } catch {}

    // 9. Persistir el enlace de Google Drive en public.peticiones (respuesta_drive_url)
    try {
      await (supabase
        .from('peticiones' as any)
        .update({ respuesta_drive_url: webViewLink } as any)
        .eq('id', peticion.id) as any);
    } catch (saveDbErr: any) {
      console.warn('[Exportar Drive] Aviso persistiendo respuesta_drive_url en BD:', saveDbErr?.message);
    }

    // 10. Registrar actividad en la auditoría del sistema
    await logSystemActivity({
      actor: { id: 'usr-sistema', name: 'Gestor Documental', role: 'sistema' },
      action: 'Respaldo de Expediente en Google Drive',
      actionType: 'GESTION',
      entity: 'Expediente Documental',
      entityId: cleanRadicado,
      details: `Expediente ${cleanRadicado} respaldado exitosamente en Google Drive: ${webViewLink} (${archivosSubidosCount} archivos)`,
      severity: 'INFO',
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        folderId: mainFolder.id,
        folderName: mainFolderName,
        webViewLink,
        archivosSubidos: archivosSubidosCount,
        subcarpetasCreadas: subcarpetasCreadasCount,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Error general en endpoint exportar-drive:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Error interno del servidor exportando expediente a Google Drive.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
