// src/pages/api/peticiones/crear.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { sendPeticionAssignmentEmail, sendRadicacionSolicitanteEmail } from '@lib/email';
import { logSystemActivity } from '@lib/audit';
import { generatePin6 } from '@lib/security';
import { MAX_FILE_SIZE_BYTES } from '@lib/constants';

export interface SubcarpetaInput {
  nombre: string;
  descripcion?: string;
  oficina_ids: string[];
}

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    let asunto = '';
    let descripcion = '';
    let instrucciones_anexos = '';
    let solicitante_nombre = '';
    let solicitante_email = '';
    let solicitante_tipo = 'Ciudadano';
    let categoria = 'Petición General';
    let prioridad = 'Media';
    let fecha_limite_entrega = '';
    let oficina_ids: string[] = [];
    let subcarpetas: SubcarpetaInput[] = [];
    let primaryFile: File | null = null;
    let directStoragePath: string | null = null;
    let directFileSize: number = 0;
    let directFileName: string = '';
    let directFileMime: string = 'application/pdf';

    let rawBase64File: { buffer: Buffer; name: string; mime: string } | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      asunto = (formData.get('asunto') as string) || '';
      descripcion = (formData.get('descripcion') as string) || '';
      instrucciones_anexos = (formData.get('instrucciones_anexos') as string) || '';
      solicitante_nombre = (formData.get('solicitante_nombre') as string) || '';
      solicitante_email = (formData.get('solicitante_email') as string) || '';
      solicitante_tipo = (formData.get('solicitante_tipo') as string) || 'Ciudadano';
      categoria = (formData.get('categoria') as string) || 'Petición General';
      prioridad = (formData.get('prioridad') as string) || 'Media';
      fecha_limite_entrega = (formData.get('fecha_limite_entrega') as string) || '';
      
      const rawSubcarpetasJson = formData.get('subcarpetas_json') as string;
      if (rawSubcarpetasJson) {
        try { subcarpetas = JSON.parse(rawSubcarpetasJson); } catch (e) {}
      }

      const rawOficinas = formData.getAll('oficina_ids');
      if (rawOficinas.length > 0) {
        oficina_ids = rawOficinas.map(o => String(o));
      } else {
        const rawJsonOficinas = formData.get('oficinas_json') as string;
        if (rawJsonOficinas) {
          try { oficina_ids = JSON.parse(rawJsonOficinas); } catch (e) {}
        }
      }

      primaryFile = formData.get('archivo_peticion') as File | null;
      if (primaryFile && (typeof primaryFile === 'string' || !primaryFile.size || primaryFile.size === 0)) {
        primaryFile = null;
      }
    } else {
      const body = await request.json().catch(() => ({}));
      asunto = body.asunto;
      descripcion = body.descripcion || '';
      instrucciones_anexos = body.instrucciones_anexos || body.descripcion || '';
      solicitante_nombre = body.solicitante_nombre;
      solicitante_email = body.solicitante_email;
      solicitante_tipo = body.solicitante_tipo || 'Ciudadano';
      categoria = body.categoria || 'Petición General';
      prioridad = body.prioridad || 'Media';
      fecha_limite_entrega = body.fecha_limite_entrega;
      oficina_ids = body.oficina_ids || [];
      if (Array.isArray(body.subcarpetas)) {
        subcarpetas = body.subcarpetas;
      }

      directStoragePath = body.archivo_storage_path || null;
      directFileSize = Number(body.archivo_tamano) || 0;
      if (body.archivo_nombre) directFileName = body.archivo_nombre;
      if (body.archivo_mime) directFileMime = body.archivo_mime;

      if (body.archivo_base64 && body.archivo_nombre) {
        try {
          rawBase64File = {
            buffer: Buffer.from(body.archivo_base64, 'base64'),
            name: body.archivo_nombre,
            mime: body.archivo_mime || 'application/pdf',
          };
        } catch (b64Err) {
          console.warn('Error decodificando archivo base64:', b64Err);
        }
      }
    }

    if (!asunto || !solicitante_nombre || !fecha_limite_entrega) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Campos obligatorios faltantes: asunto, solicitante_nombre o fecha_limite_entrega.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const declaredSize = primaryFile?.size || rawBase64File?.buffer.length || directFileSize || 0;
    if (declaredSize > MAX_FILE_SIZE_BYTES) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'El archivo adjunto supera el límite máximo permitido de 500 MB.',
        }),
        { status: 413, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Normalizar Subcarpetas y Oficinas Responsables
    if (!subcarpetas || subcarpetas.length === 0) {
      if (Array.isArray(oficina_ids) && oficina_ids.length > 0) {
        subcarpetas = [{
          nombre: 'Subcarpeta 1',
          descripcion: instrucciones_anexos || descripcion || 'Anexos requeridos para el radicado oficial.',
          oficina_ids: oficina_ids,
        }];
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Debe configurar al menos una subcarpeta con dependencias responsables asignadas.',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Extraer todas las oficinas únicas asignadas
    const allUniqueOfficeIds = Array.from(
      new Set(subcarpetas.flatMap((s) => s.oficina_ids || []).filter(Boolean))
    );

    if (allUniqueOfficeIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Debe asignar al menos una dependencia responsable a las subcarpetas del expediente.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Convertir archivo principal a Buffer para storage y adjunto en correo
    let fileBuffer: Buffer | null = null;
    let fileName = '';
    let fileMime = 'application/pdf';
    if (primaryFile && typeof primaryFile !== 'string' && typeof primaryFile.arrayBuffer === 'function' && primaryFile.size > 0) {
      const arrayBuf = await primaryFile.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuf);
      fileName = primaryFile.name || 'documento_radicado.pdf';
      fileMime = primaryFile.type || 'application/pdf';
    } else if (rawBase64File && rawBase64File.buffer.length > 0) {
      fileBuffer = rawBase64File.buffer;
      fileName = rawBase64File.name;
      fileMime = rawBase64File.mime;
    } else if (directFileName) {
      fileName = directFileName;
      fileMime = directFileMime;
    }

    // 1. Insertar Petición en Base de Datos con su PIN de 6 dígitos oficial
    const finalInstrucciones = instrucciones_anexos || descripcion || null;
    const pinAcceso = generatePin6();

    // Intentar insertar primero con la columna pin_acceso para que coincida 100% con BD y correo
    const payloadWithPin: any = {
      asunto,
      descripcion: finalInstrucciones,
      instrucciones_anexos: finalInstrucciones,
      solicitante_nombre,
      solicitante_email,
      solicitante_tipo,
      categoria,
      prioridad,
      fecha_limite_entrega,
      pin_acceso: pinAcceso,
    };

    let peticionData: any = null;
    let peticionError: any = null;

    const firstInsert = await (supabase
      .from('peticiones' as any)
      .insert(payloadWithPin as any)
      .select()
      .single() as any);

    if (
      firstInsert.error &&
      (String(firstInsert.error.message || '').includes('pin_acceso') ||
       firstInsert.error.code === '42703' ||
       firstInsert.error.code === 'PGRST204')
    ) {
      console.warn('Aviso: Columna pin_acceso no encontrada en schema cache al insertar. Reintentando sin pin_acceso...');
      delete payloadWithPin.pin_acceso;
      const retryInsert = await (supabase
        .from('peticiones' as any)
        .insert(payloadWithPin as any)
        .select()
        .single() as any);
      peticionData = retryInsert.data;
      peticionError = retryInsert.error;
    } else {
      peticionData = firstInsert.data;
      peticionError = firstInsert.error;
    }

    if (peticionError || !peticionData) {
      console.error('Error insertando petición:', peticionError);
      return new Response(
        JSON.stringify({ success: false, error: peticionError?.message || 'Error guardando petición en base de datos.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Si PostgreSQL ya generó un PIN válido mediante trigger o columna, sincronizar con él; de lo contrario usar el generado
    const finalPinAcceso = (peticionData.pin_acceso && /^\d{6}$/.test(String(peticionData.pin_acceso).trim()))
      ? String(peticionData.pin_acceso).trim()
      : pinAcceso;

    peticionData.pin_acceso = finalPinAcceso;

    // Intentar actualizar la columna pin_acceso de forma no bloqueante si ya fue creada en PostgreSQL
    try {
      await (supabase
        .from('peticiones' as any)
        .update({ pin_acceso: finalPinAcceso } as any)
        .eq('id', peticionData.id) as any);
    } catch (pinUpdateErr) {
      // Silencioso si la columna física aún no existe en el schema cache
    }

    // 2. Subir o mover Archivo Principal al Storage y registrar en peticion_anexos (Carpeta del Radicado)
    let savedPrimaryFile = null;
    if (fileName && (directStoragePath || fileBuffer)) {
      const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageRelativePath = `${peticionData.numero_radicado}/${cleanFileName}`;
      let finalStoragePath = storageRelativePath;
      let finalBytes = directFileSize || (fileBuffer ? fileBuffer.length : 0);

      try {
        if (directStoragePath) {
          // El archivo ya fue subido directamente al Storage desde el navegador para evitar 413 Payload Too Large
          const { error: moveErr } = await supabase.storage
            .from('peticiones')
            .move(directStoragePath, storageRelativePath);

          if (moveErr) {
            console.warn('Aviso moviendo archivo temporal (intentando copy):', moveErr.message);
            const { error: copyErr } = await supabase.storage
              .from('peticiones')
              .copy(directStoragePath, storageRelativePath);

            if (!copyErr) {
              await supabase.storage.from('peticiones').remove([directStoragePath]).catch(() => {});
            } else {
              // Si no se puede mover ni copiar, conservar la ruta temporal donde ya quedó
              finalStoragePath = directStoragePath;
            }
          }
        } else if (fileBuffer) {
          const { error: uploadErr } = await supabase.storage
            .from('peticiones')
            .upload(storageRelativePath, bufferOrFallback(fileBuffer), {
              contentType: fileMime,
              upsert: true,
            });

          if (uploadErr) {
            console.warn('Advertencia subiendo archivo principal al storage:', uploadErr.message);
          }
          finalBytes = fileBuffer.length;
        }

        // Descargar buffer si es necesario para el adjunto de Nodemailer (solo si <= 4 MB)
        if (!fileBuffer && finalBytes > 0 && finalBytes <= 4 * 1024 * 1024) {
          try {
            const { data: downloadedBlob } = await supabase.storage
              .from('peticiones')
              .download(finalStoragePath);
            if (downloadedBlob) {
              const arrayBuf = await downloadedBlob.arrayBuffer();
              fileBuffer = Buffer.from(arrayBuf);
            }
          } catch (dlErr: any) {
            console.warn('No se pudo descargar buffer para adjunto:', dlErr.message);
          }
        }

        // Registrar en peticion_anexos como documento raíz inicial del radicado
        const { data: anexoPrincipal, error: anexoErr } = await (supabase
          .from('peticion_anexos' as any)
          .insert({
            peticion_id: peticionData.id,
            nombre_archivo: fileName,
            storage_path: finalStoragePath,
            tamano_bytes: finalBytes,
            mime_type: fileMime,
            subido_por_email: solicitante_email || 'radicacion@unitropico.edu.co',
            es_anexo_oficina: false,
          } as any)
          .select()
          .single() as any);

        if (anexoErr) {
          console.warn('Advertencia registrando anexo principal:', anexoErr.message);
        }

        savedPrimaryFile = anexoPrincipal || {
          nombre_archivo: fileName,
          storage_path: finalStoragePath,
          tamano_bytes: finalBytes,
        };
      } catch (uploadException: any) {
        console.error('Excepción al procesar archivo principal:', uploadException.message);
      }
    }

    // 3. Crear Subcarpetas en public.peticion_subcarpetas
    const createdSubcarpetasMap: Record<number, string> = {}; // índice -> subcarpeta.id
    const createdSubcarpetasInfo: Array<{ id: string; nombre: string; descripcion?: string | null }> = [];

    for (let i = 0; i < subcarpetas.length; i++) {
      const sub = subcarpetas[i]!;
      const cleanSubName = (sub.nombre || `Subcarpeta ${i + 1}`).trim();
      const cleanSubDesc = (sub.descripcion || '').trim();

      try {
        const { data: subData, error: subErr } = await (supabase
          .from('peticion_subcarpetas' as any)
          .insert({
            peticion_id: peticionData.id,
            nombre: cleanSubName,
            descripcion: cleanSubDesc || null,
          } as any)
          .select()
          .single() as any);

        if (!subErr && subData?.id) {
          createdSubcarpetasMap[i] = subData.id;
          createdSubcarpetasInfo.push({ id: subData.id, nombre: cleanSubName, descripcion: cleanSubDesc });
        }
      } catch (subException: any) {
        console.warn('Aviso insertando peticion_subcarpetas (tabla posiblemente no migrada aún):', subException.message);
      }

      if (!createdSubcarpetasMap[i]) {
        const fallbackId = `sub-local-${i + 1}`;
        createdSubcarpetasMap[i] = fallbackId;
        createdSubcarpetasInfo.push({ id: fallbackId, nombre: cleanSubName, descripcion: cleanSubDesc });
      }
    }

    // 4. Obtener información de las dependencias asignadas
    const { data: oficinasData, error: oficinasError } = await (supabase
      .from('oficinas' as any)
      .select('id, codigo, nombre, email_institucional')
      .in('id', allUniqueOfficeIds) as any);

    if (oficinasError || !oficinasData || oficinasData.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontraron las oficinas seleccionadas en el catálogo oficial.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5. Crear asignaciones en peticion_responsables vinculando la subcarpeta
    // 5.1 Detectar si la columna subcarpeta_id existe en el schema cache de peticion_responsables
    let hasSubcarpetaCol = true;
    try {
      const probeRes = await (supabase
        .from('peticion_responsables' as any)
        .select('id, subcarpeta_id')
        .limit(1) as any);
      if (
        probeRes.error &&
        (String(probeRes.error.message || '').includes('subcarpeta_id') ||
         probeRes.error.code === '42703' ||
         probeRes.error.code === 'PGRST204')
      ) {
        hasSubcarpetaCol = false;
      }
    } catch {
      hasSubcarpetaCol = false;
    }

    const asignacionesToInsert: any[] = [];
    for (let i = 0; i < subcarpetas.length; i++) {
      const sub = subcarpetas[i]!;
      const subId = createdSubcarpetasMap[i];
      const validSubUuid = (hasSubcarpetaCol && subId && !subId.startsWith('sub-local-')) ? subId : null;

      for (const ofiId of sub.oficina_ids || []) {
        const item: any = {
          peticion_id: peticionData.id,
          oficina_id: ofiId,
          estado_entrega: 'Pendiente',
          observaciones_entrega: `PIN:${finalPinAcceso} | [${sub.nombre}]`,
        };
        if (hasSubcarpetaCol && validSubUuid) {
          item.subcarpeta_id = validSubUuid;
        }
        asignacionesToInsert.push(item);
      }
    }

    let responsablesData: any = null;
    let respError: any = null;

    // Helper con reintentos inteligentes contra errores de schema cache (subcarpeta_id)
    const tryInsertSafe = async (list: any[]) => {
      let res = await (supabase
        .from('peticion_responsables' as any)
        .insert(list as any)
        .select('id, oficina_id, codigo_acceso, fecha_expiracion_codigo, storage_subfolder_path, estado_entrega') as any);

      if (
        res.error &&
        (String(res.error.message || '').includes('subcarpeta_id') ||
         String(res.error.message || '').includes('schema cache') ||
         res.error.code === '42703' ||
         res.error.code === 'PGRST204')
      ) {
        hasSubcarpetaCol = false;
        console.warn('Aviso: Columna subcarpeta_id no encontrada en schema cache. Reintentando inserción sin subcarpeta_id...');
        const withoutSub = list.map((item) => {
          const c = { ...item };
          delete c.subcarpeta_id;
          return c;
        });
        res = await (supabase
          .from('peticion_responsables' as any)
          .insert(withoutSub as any)
          .select('id, oficina_id, codigo_acceso, fecha_expiracion_codigo, storage_subfolder_path, estado_entrega') as any);
      }
      return res;
    };

    // Intento 1: Inserción directa (asignaciones individuales por subcarpeta)
    let insertAttempt = await tryInsertSafe(asignacionesToInsert);

    // Si falla por restricción única (unique_peticion_oficina o código 23505 duplicate key):
    if (
      insertAttempt.error &&
      (insertAttempt.error.code === '23505' ||
       String(insertAttempt.error.message || '').includes('unique_peticion_oficina') ||
       String(insertAttempt.error.message || '').includes('duplicate key') ||
       String(insertAttempt.error.message || '').includes('peticion_responsables_peticion_id_oficina_id_key'))
    ) {
      console.warn('Restricción única unique_peticion_oficina detectada en PostgreSQL. Consolidando dependencias asignadas a múltiples subcarpetas...');
      const uniqueOfficeMap: Record<string, any> = {};

      for (const ofiId of allUniqueOfficeIds) {
        const matchingSubs = subcarpetas.filter((s) => s.oficina_ids?.includes(ofiId));
        const subNotes = matchingSubs
          .map((s) => `[${s.nombre}]`)
          .join(' | ');

        let singleSubUuid: string | null = null;
        if (hasSubcarpetaCol && matchingSubs.length === 1) {
          const subIdx = subcarpetas.indexOf(matchingSubs[0]!);
          const sId = createdSubcarpetasMap[subIdx];
          if (sId && !sId.startsWith('sub-local-')) singleSubUuid = sId;
        }

        const consolidatedItem: any = {
          peticion_id: peticionData.id,
          oficina_id: ofiId,
          estado_entrega: 'Pendiente',
          observaciones_entrega: `PIN:${finalPinAcceso} | ${subNotes}`,
        };
        if (hasSubcarpetaCol && singleSubUuid) {
          consolidatedItem.subcarpeta_id = singleSubUuid;
        }

        uniqueOfficeMap[ofiId] = consolidatedItem;
      }

      insertAttempt = await tryInsertSafe(Object.values(uniqueOfficeMap));
    }

    responsablesData = insertAttempt.data;
    respError = insertAttempt.error;

    if (respError || !responsablesData) {
      console.error('Error asignando responsables:', respError);
      return new Response(
        JSON.stringify({ success: false, error: respError?.message || 'Error asignando oficinas responsables a las subcarpetas.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 6. Preparar adjunto físico de Nodemailer con el archivo original subido
    const emailAttachments = (fileBuffer && fileName) ? [
      {
        filename: fileName,
        content: fileBuffer,
        contentType: fileMime,
      }
    ] : undefined;

    // 7. Enviar Notificación SMTP Inteligente y Consolidada por Dependencia
    // Si una oficina está asignada a 2 o más subcarpetas, recibe UN SOLO CORREO con el desglose de todas sus subcarpetas
    const baseUrl = url.origin;
    const emailNotifications = [];

    for (const oficina of oficinasData) {
      const isTestOffice = oficina.codigo?.toUpperCase().includes('PRUEBA') || oficina.nombre?.toLowerCase().includes('prueba');
      const targetEmail = isTestOffice ? (oficina.email_institucional || null) : null;

      if (targetEmail) {
        // Encontrar asignación representativa para el código de acceso
        const repAssignment = responsablesData.find((r: any) => r.oficina_id === oficina.id);
        const accessCode = repAssignment?.codigo_acceso || 'UPQ';

        // Obtener la lista de subcarpetas asignadas a esta oficina específica
        const assignedSubcarpetas = subcarpetas
          .filter((s) => s.oficina_ids.includes(oficina.id))
          .map((s) => ({
            nombre: s.nombre,
            descripcion: s.descripcion || 'Entrega de anexos oficiales para esta subcarpeta.',
          }));

        const portalUrl = `${baseUrl}/portal-responsable?radicado=${encodeURIComponent(peticionData.numero_radicado)}&codigo=${encodeURIComponent(accessCode)}&email=${encodeURIComponent(targetEmail)}&pin=${encodeURIComponent(finalPinAcceso)}`;

        const emailPromise = sendPeticionAssignmentEmail({
          toEmail: targetEmail,
          oficinaNombre: oficina.nombre,
          numeroRadicado: peticionData.numero_radicado,
          asunto: peticionData.asunto,
          categoria: peticionData.categoria,
          prioridad: peticionData.prioridad,
          fechaRadicacion: peticionData.fecha_radicacion || peticionData.created_at || null,
          subcarpetas: assignedSubcarpetas,
          instruccionesAnexos: peticionData.instrucciones_anexos || peticionData.descripcion,
          fechaLimiteEntrega: peticionData.fecha_limite_entrega,
          fechaLimiteResponsable: peticionData.fecha_limite_responsable,
          codigoAcceso: accessCode,
          pinAcceso: finalPinAcceso,
          portalUrl,
          attachments: emailAttachments,
        }).catch((err: any) => {
          console.warn(`[EMAIL ERROR NO FATAL] Fallo correo a ${targetEmail}:`, err.message);
          return { success: false, error: err.message };
        });

        emailNotifications.push(emailPromise);
      }
    }

    // Enviar acuse de radicación oficial al correo del solicitante si es válido
    const cleanSolicitanteEmail = String(solicitante_email || '').trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanSolicitanteEmail)) {
      const consultaUrl = `${baseUrl}/consulta-respuesta?radicado=${encodeURIComponent(peticionData.numero_radicado)}&pin=${encodeURIComponent(finalPinAcceso)}&correo=${encodeURIComponent(cleanSolicitanteEmail)}`;
      const solicitanteEmailPromise = sendRadicacionSolicitanteEmail({
        toEmail: cleanSolicitanteEmail,
        solicitanteNombre: solicitante_nombre,
        numeroRadicado: peticionData.numero_radicado,
        asunto: peticionData.asunto,
        categoria: peticionData.categoria,
        prioridad: peticionData.prioridad,
        fechaRadicacion: peticionData.fecha_radicacion || peticionData.created_at || null,
        fechaLimiteEntrega: peticionData.fecha_limite_entrega,
        pinAcceso: finalPinAcceso,
        nombreDocumento: savedPrimaryFile?.nombre_archivo || fileName || null,
        totalDependencias: oficinasData.length,
        consultaUrl,
      }).catch((err: any) => {
        console.warn(`[EMAIL ERROR NO FATAL] Fallo correo de radicación al solicitante ${cleanSolicitanteEmail}:`, err.message);
        return { success: false, error: err.message };
      });
      emailNotifications.push(solicitanteEmailPromise);
    }

    await Promise.allSettled(emailNotifications);
    console.log(`[PETICIÓN CREADA] Radicado: ${peticionData.numero_radicado} - Subcarpetas: ${subcarpetas.length} - Dependencias únicas: ${oficinasData.length} - Notificaciones enviadas: ${emailNotifications.length}`);

    // Registrar en auditoría
    await logSystemActivity({
      actor: { id: 'usr-root', name: solicitante_nombre || 'Funcionario Radicador', role: 'funcionario' },
      action: `Radicación de petición ${peticionData.numero_radicado}`,
      actionType: 'SUBIDA_ARCHIVO',
      entity: 'Peticiones Radicadas',
      entityId: peticionData.numero_radicado,
      details: `Radicación oficial de la solicitud "${asunto}" con ${subcarpetas.length} subcarpeta(s) y ${oficinasData.length} dependencia(s) requerida(s).`,
      severity: 'INFO',
    }).catch((auditErr) => console.warn('Aviso registrando auditoría de radicación:', auditErr));

    return new Response(
      JSON.stringify({
        success: true,
        peticion: {
          id: peticionData.id,
          numero_radicado: peticionData.numero_radicado,
          asunto: peticionData.asunto,
          instrucciones_anexos: peticionData.instrucciones_anexos,
          fecha_limite_entrega: peticionData.fecha_limite_entrega,
          fecha_limite_responsable: peticionData.fecha_limite_responsable,
          storage_folder_path: peticionData.storage_folder_path,
          pin_acceso: finalPinAcceso,
          archivo_principal: savedPrimaryFile,
        },
        subcarpetas: createdSubcarpetasInfo,
        responsables: responsablesData.map((r: any) => {
          const ofi = oficinasData.find((o: any) => o.id === r.oficina_id);
          const isTestOffice = ofi?.codigo?.toUpperCase().includes('PRUEBA') || ofi?.nombre?.toLowerCase().includes('prueba');
          return {
            id: r.id,
            oficina_nombre: ofi?.nombre,
            subcarpeta_id: r.subcarpeta_id,
            email_institucional: isTestOffice ? (ofi?.email_institucional || null) : null,
            codigo_acceso: r.codigo_acceso,
            storage_subfolder_path: r.storage_subfolder_path,
          };
        }),
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Error procesando creación de petición:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error interno del servidor al procesar radicación.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

function bufferOrFallback(buf: Buffer) {
  return buf;
}
