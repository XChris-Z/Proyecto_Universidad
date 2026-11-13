// src/pages/api/portal/subir-anexo.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '@lib/supabase';
import { SESSION_COOKIE_KEY } from '@lib/constants';
import { isPeticionRespondida } from '@lib/subcarpetas';
import { logSystemActivity } from '@lib/audit';
import { resolveSessionActor } from '@lib/request-actor';
import { addApprovedAnexoMarker } from '@lib/revision-meta';
import { isGoogleDriveConfigured, sincronizarAporteAprobadoEnDrive } from '@lib/google-drive';

export const POST: APIRoute = async ({ request, clientAddress, cookies }) => {
  try {
    const db = (supabaseAdmin || supabase) as any;
    const isStaffSession = Boolean(cookies.get(SESSION_COOKIE_KEY)?.value);
    const contentType = request.headers.get('content-type') || '';
    let peticionId = '';
    let responsableId = '';
    let dependenciaId = '';
    let oficinaNombre = '';
    let codigoAcceso = '';
    let subcarpetaId = '';
    let subcarpetaNombre = '';
    let numeroRadicado = '';
    let emailInstitucional = '';
    let storageSubfolder = '';
    let observaciones = '';
    let cargaManual = false;
    let fileBuffer: Buffer | null = null;
    let fileName = '';
    let fileMime = 'application/octet-stream';
    let fileSize = 0;

    let directStoragePath: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('archivo') as File | null;
      peticionId = (formData.get('peticion_id') as string) || '';
      responsableId = (formData.get('responsable_id') as string) || (formData.get('asignacion_id') as string) || '';
      dependenciaId = (formData.get('dependencia_id') as string) || (formData.get('oficina_id') as string) || '';
      oficinaNombre = (formData.get('oficina_nombre') as string) || '';
      codigoAcceso = (formData.get('codigo_acceso') as string) || '';
      subcarpetaId = (formData.get('subcarpeta_id') as string) || '';
      subcarpetaNombre = (formData.get('subcarpeta_nombre') as string) || '';
      numeroRadicado = (formData.get('numero_radicado') as string) || (formData.get('radicado') as string) || '';
      emailInstitucional = (formData.get('email_institucional') as string) || '';
      storageSubfolder = (formData.get('storage_subfolder_path') as string) || '';
      observaciones = (formData.get('observaciones') as string) || '';
      cargaManual = String(formData.get('carga_manual') || '') === 'true';

      if (file && typeof file.arrayBuffer === 'function') {
        const arrayBuffer = await file.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuffer);
        fileName = file.name;
        fileMime = file.type || 'application/octet-stream';
        fileSize = file.size;
      }
    } else {
      const body = await request.json().catch(() => ({}));
      peticionId = body.peticion_id || '';
      responsableId = body.responsable_id || body.asignacion_id || '';
      dependenciaId = body.dependencia_id || body.oficina_id || '';
      oficinaNombre = body.oficina_nombre || '';
      codigoAcceso = body.codigo_acceso || '';
      subcarpetaId = body.subcarpeta_id || '';
      subcarpetaNombre = body.subcarpeta_nombre || '';
      numeroRadicado = body.numero_radicado || body.radicado || '';
      emailInstitucional = body.email_institucional || '';
      storageSubfolder = body.storage_subfolder_path || '';
      observaciones = body.observaciones || '';
      cargaManual = Boolean(body.carga_manual);
      directStoragePath = body.storage_path || null;
      if (body.archivo_nombre) fileName = body.archivo_nombre;
      if (body.archivo_mime) fileMime = body.archivo_mime;
      if (body.archivo_tamano) fileSize = Number(body.archivo_tamano) || 0;

      if (body.archivo_base64 && body.archivo_nombre) {
        fileBuffer = Buffer.from(body.archivo_base64, 'base64');
        fileName = body.archivo_nombre;
        fileMime = body.archivo_mime || 'application/octet-stream';
        fileSize = fileBuffer.length;
      }
    }

    const esCargaInterna = isStaffSession || cargaManual;

    if (!fileBuffer && !directStoragePath) {
      return new Response(
        JSON.stringify({ success: false, error: 'Debe seleccionar o adjuntar un archivo para completar la carga.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Resolver petición si solo se suministró radicado o completar número radicado
    let peticionRow: any = null;
    if (peticionId) {
      const { data: pById } = await (db
        .from('peticiones' as any)
        .select('id, numero_radicado, storage_folder_path, estado, instrucciones_anexos, updated_at')
        .eq('id', peticionId)
        .maybeSingle() as any);
      peticionRow = pById;
    } else if (numeroRadicado) {
      const { data: pByRad } = await (db
        .from('peticiones' as any)
        .select('id, numero_radicado, storage_folder_path, estado, instrucciones_anexos, updated_at')
        .eq('numero_radicado', numeroRadicado)
        .maybeSingle() as any);
      peticionRow = pByRad;
      if (peticionRow?.id) peticionId = peticionRow.id;
    }

    if (!peticionId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Parámetros obligatorios faltantes: no se identificó el radicado ni la petición.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!numeroRadicado) {
      numeroRadicado = peticionRow?.numero_radicado || String(peticionId);
    }

    // Resolver responsableId automáticamente si viene por asignación, subcarpeta, dependencia o código
    let respCheck: any = null;
    if (responsableId && !String(responsableId).startsWith('sub-')) {
      const { data: foundResp } = await (db
        .from('peticion_responsables' as any)
        .select('id, fecha_expiracion_codigo, estado_entrega, storage_subfolder_path, codigo_acceso, oficina_id')
        .eq('id', responsableId)
        .maybeSingle() as any);
      respCheck = foundResp;
    }

    if (!respCheck) {
      const { data: petResps } = await (db
        .from('peticion_responsables' as any)
        .select('id, fecha_expiracion_codigo, estado_entrega, storage_subfolder_path, codigo_acceso, oficina_id, subcarpeta_id, oficinas(nombre)')
        .eq('peticion_id', peticionId) as any);

      const listResps: any[] = Array.isArray(petResps) ? petResps : [];
      if (listResps.length > 0) {
        respCheck =
          (codigoAcceso && listResps.find((r) => String(r.codigo_acceso || '').toUpperCase() === codigoAcceso.toUpperCase())) ||
          (subcarpetaId && listResps.find((r) => String(r.subcarpeta_id || '') === String(subcarpetaId))) ||
          (dependenciaId && listResps.find((r) => String(r.oficina_id || '') === String(dependenciaId))) ||
          (oficinaNombre && listResps.find((r) => {
            const nom = Array.isArray(r.oficinas) ? r.oficinas[0]?.nombre : r.oficinas?.nombre;
            return nom && String(nom).toLowerCase() === oficinaNombre.toLowerCase();
          })) ||
          listResps[0];
        if (respCheck?.id) responsableId = respCheck.id;
      }
    }

    if (!esCargaInterna && !respCheck) {
      return new Response(
        JSON.stringify({ success: false, error: 'Asignación o dependencia no encontrada para esta petición.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!esCargaInterna && respCheck?.fecha_expiracion_codigo) {
      const ahora = new Date();
      const expiracion = new Date(respCheck.fecha_expiracion_codigo);
      if (!isNaN(expiracion.getTime()) && ahora > expiracion) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'El plazo límite configurado para su dependencia expiró. Solicite una prórroga a Secretaría General para habilitar nuevas cargas.',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!storageSubfolder) {
      storageSubfolder = respCheck?.storage_subfolder_path || '';
    }
    if (!storageSubfolder) {
      const cleanRad = String(numeroRadicado || peticionId).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      const cleanSubSlug = String(subcarpetaNombre || 'general').toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/^_+|_+$/g, '') || 'general';
      storageSubfolder = `${cleanRad}/${cleanSubSlug}/`;
    }

    // 2. Subir archivo a Supabase Storage bucket 'peticiones' (si no fue subido directo por el cliente)
    let fullStoragePath = directStoragePath;
    if (fullStoragePath && !fullStoragePath.startsWith('peticiones/')) {
      fullStoragePath = `peticiones/${fullStoragePath.replace(/^\/+/, '')}`;
    }

    if (!fullStoragePath && fileBuffer) {
      const cleanFileName = (fileName || 'soporte.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
      const baseFolder = storageSubfolder.replace(/^peticiones\//, '').replace(/\/+$/, '');
      const relativeStoragePath = `${baseFolder}/${Date.now()}_${cleanFileName}`;
      fullStoragePath = `peticiones/${relativeStoragePath}`;

      const { error: uploadError } = await db.storage
        .from('peticiones')
        .upload(relativeStoragePath, fileBuffer, {
          contentType: fileMime,
          upsert: true,
        });

      if (uploadError) {
        console.warn('Advertencia subiendo al repositorio (se registrará anexo):', uploadError.message);
      }
    }

    // 3. Registrar en public.peticion_anexos con subcarpeta_id si está disponible
    const anexoNombre = subcarpetaNombre && !fileName.includes(`[${subcarpetaNombre}]`)
      ? `[${subcarpetaNombre}] ${fileName}`
      : (fileName || 'Soporte.pdf');

    const anexoPayload: any = {
      peticion_id: peticionId,
      nombre_archivo: anexoNombre,
      storage_path: fullStoragePath,
      tamano_bytes: fileSize,
      mime_type: fileMime,
      subido_por_email: emailInstitucional || (esCargaInterna ? 'despacho@unitropico.edu.co' : 'oficina@unitropico.edu.co'),
      es_anexo_oficina: true,
    };

    if (responsableId && !String(responsableId).startsWith('sub-')) {
      anexoPayload.peticion_responsable_id = responsableId;
    }

    if (subcarpetaId && !subcarpetaId.startsWith('sub-')) {
      anexoPayload.subcarpeta_id = subcarpetaId;
    }

    let anexoData: any = null;
    let anexoError: any = null;

    const resAnexo = await (db
      .from('peticion_anexos' as any)
      .insert(anexoPayload as any)
      .select()
      .single() as any);

    if (
      resAnexo.error &&
      (resAnexo.error.message?.includes('subcarpeta_id') ||
       resAnexo.error.message?.includes('schema cache') ||
       resAnexo.error.code === '42703' ||
       resAnexo.error.code === 'PGRST204')
    ) {
      // Reintentar sin subcarpeta_id si la columna física aún no existe
      delete anexoPayload.subcarpeta_id;
      const retryRes = await (db
        .from('peticion_anexos' as any)
        .insert(anexoPayload as any)
        .select()
        .single() as any);
      anexoData = retryRes.data;
      anexoError = retryRes.error;
    } else {
      anexoData = resAnexo.data;
      anexoError = resAnexo.error;
    }

    if (anexoError) {
      console.error('Error insertando registro de anexo:', anexoError);
    }

    // 4. Actualizar estado de entrega en peticion_responsables preservando el PIN y observaciones por subcarpeta
    if (responsableId && !String(responsableId).startsWith('sub-')) {
      const { data: currentResp } = await (db
        .from('peticion_responsables' as any)
        .select('observaciones_entrega')
        .eq('id', responsableId)
        .maybeSingle() as any);

      const rawExisting = currentResp?.observaciones_entrega || '';
      const pinMatch = rawExisting.match(/PIN:\s*([0-9A-Z]{6})/i);
      const pinHeader = pinMatch ? pinMatch[0] : '';
      const cleanUserObs = String(observaciones || '').trim();

      // Actualizar o insertar la observación específica para esta subcarpeta
      let finalObservaciones = '';
      const cleanSubName = String(subcarpetaNombre || '').replace(/^\[+|\]+$/g, '').trim();

      if (cleanSubName) {
        let updatedBody = rawExisting.replace(/^PIN:\s*[0-9A-Z]{6}(\s*\|\s*)?/i, '').trim();
        const escapedSub = cleanSubName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const subRegex = new RegExp(`\\[\\s*${escapedSub}\\s*\\][^|]*`, 'i');

        const newSubNote = cleanUserObs ? `[${cleanSubName}]: ${cleanUserObs}` : `[${cleanSubName}]`;
        if (subRegex.test(updatedBody)) {
          updatedBody = updatedBody.replace(subRegex, newSubNote);
        } else {
          updatedBody = updatedBody ? `${updatedBody} | ${newSubNote}` : newSubNote;
        }
        finalObservaciones = pinHeader ? `${pinHeader} | ${updatedBody}` : updatedBody;
      } else {
        finalObservaciones = pinHeader ? (cleanUserObs ? `${pinHeader} | ${cleanUserObs}` : pinHeader) : cleanUserObs;
      }

      // Si fue carga manual realizada por funcionario/administrador, aprobar automáticamente el soporte
      if (cargaManual && anexoData?.id) {
        finalObservaciones = addApprovedAnexoMarker(finalObservaciones, anexoData.id, cleanSubName || subcarpetaNombre);
      }

      // Actualizar de forma segura sin columnas inexistentes
      const updatePayload: any = {
        estado_entrega: 'Entregado',
        fecha_entrega: new Date().toISOString(),
        observaciones_entrega: finalObservaciones || null,
      };

      const updResult = await (db
        .from('peticion_responsables' as any)
        .update(updatePayload)
        .eq('id', responsableId) as any);

      if (updResult.error) {
        console.warn('Advertencia actualizando peticion_responsables:', updResult.error.message);
      }

      // Si fue carga manual, sincronizar de inmediato el soporte aprobado hacia su subcarpeta en Google Drive
      if (cargaManual && anexoData?.id && isGoogleDriveConfigured()) {
        try {
          await sincronizarAporteAprobadoEnDrive(
            peticionId,
            anexoData.id,
            cleanSubName || subcarpetaNombre,
            responsableId
          );
        } catch (driveErr: any) {
          console.warn('[SUBIR ANEXO MANUAL] Aviso sincronizando en Drive (no fatal):', driveErr?.message);
        }
      }
    }

    // 5. Mantener petición en trámite sin marcar prematuramente como Respondida al solicitante
    try {
      if (peticionRow && !isPeticionRespondida(peticionRow)) {
        await (db
          .from('peticiones' as any)
          .update({ estado: 'en_tramite', updated_at: new Date().toISOString() } as any)
          .eq('id', peticionId) as any);
      }
    } catch (petUpdErr: any) {
      console.warn('Aviso actualizando estado general de petición:', petUpdErr.message);
    }

    const portalActor = isStaffSession
      ? await resolveSessionActor(cookies)
      : {
          id: responsableId || 'usr-external',
          name: oficinaNombre || emailInstitucional || 'Dependencia Asignada',
          role: 'Dependencia Asignada',
        };
    await logSystemActivity({
      actor: portalActor,
      action: `Carga de soporte documental (${numeroRadicado || peticionId})`,
      actionType: 'SUBIDA_ARCHIVO',
      entity: isStaffSession ? 'Módulo Archivos' : 'Portal Entrega Anexos',
      entityId: numeroRadicado || peticionId,
      details: `Archivo "${fileName}" incorporado en "${subcarpetaNombre || 'Soportes Documentales'}".`,
      severity: 'INFO',
      request,
      clientAddress,
      cookies: isStaffSession ? cookies : null,
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        anexo: anexoData || {
          nombre_archivo: fileName,
          storage_path: fullStoragePath,
          tamano_bytes: fileSize,
          subcarpeta_id: subcarpetaId || null,
        },
        message: 'Anexo recibido y registrado correctamente en la subcarpeta del radicado.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Error en /api/portal/subir-anexo:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error interno al procesar el archivo.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
