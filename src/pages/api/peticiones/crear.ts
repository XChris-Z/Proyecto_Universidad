// src/pages/api/peticiones/crear.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { sendPeticionAssignmentEmail } from '@lib/email';
import { logSystemActivity } from '@lib/audit';
import { generatePin6 } from '@lib/security';

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

    // Normalizar Subcarpetas y Oficinas Responsables
    if (!subcarpetas || subcarpetas.length === 0) {
      if (Array.isArray(oficina_ids) && oficina_ids.length > 0) {
        subcarpetas = [{
          nombre: 'Expediente General',
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

    // 1. Insertar Petición en Base de Datos
    const finalInstrucciones = instrucciones_anexos || descripcion || null;
    const pinAcceso = generatePin6();

    // Payload base sin columna pin_acceso para blindaje contra errores de schema cache si aún no existe físicamente
    const basePayload: any = {
      asunto,
      descripcion: finalInstrucciones,
      instrucciones_anexos: finalInstrucciones,
      solicitante_nombre,
      solicitante_email,
      solicitante_tipo,
      categoria,
      prioridad,
      fecha_limite_entrega,
    };

    const { data: peticionData, error: peticionError } = await (supabase
      .from('peticiones' as any)
      .insert(basePayload as any)
      .select()
      .single() as any);

    if (peticionError || !peticionData) {
      console.error('Error insertando petición:', peticionError);
      return new Response(
        JSON.stringify({ success: false, error: peticionError?.message || 'Error guardando petición en base de datos.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Asignar el PIN de 6 dígitos en memoria para notificaciones y trazabilidad
    peticionData.pin_acceso = pinAcceso;

    // Intentar actualizar la columna pin_acceso de forma no bloqueante si ya fue creada en PostgreSQL
    try {
      await (supabase
        .from('peticiones' as any)
        .update({ pin_acceso: pinAcceso } as any)
        .eq('id', peticionData.id) as any);
    } catch (pinUpdateErr) {
      // Silencioso si la columna física aún no existe
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
    const asignacionesToInsert: any[] = [];
    for (let i = 0; i < subcarpetas.length; i++) {
      const sub = subcarpetas[i]!;
      const subId = createdSubcarpetasMap[i];
      const validSubUuid = subId && !subId.startsWith('sub-local-') ? subId : null;

      for (const ofiId of sub.oficina_ids || []) {
        asignacionesToInsert.push({
          peticion_id: peticionData.id,
          oficina_id: ofiId,
          subcarpeta_id: validSubUuid,
          estado_entrega: 'Pendiente',
          observaciones_entrega: `PIN:${pinAcceso} | [${sub.nombre}]${sub.descripcion ? ` ${sub.descripcion}` : ''}`,
        });
      }
    }

    let responsablesData: any = null;
    let respError: any = null;

    // Intento 1: Inserción vinculando subcarpeta_id si la columna física ya existe en PostgreSQL
    const resWithSub = await (supabase
      .from('peticion_responsables' as any)
      .insert(asignacionesToInsert as any)
      .select('id, oficina_id, codigo_acceso, fecha_expiracion_codigo, storage_subfolder_path, estado_entrega') as any);

    if (
      resWithSub.error &&
      (String(resWithSub.error.message || '').includes('subcarpeta_id') ||
       String(resWithSub.error.message || '').includes('schema cache') ||
       resWithSub.error.code === '42703' ||
       resWithSub.error.code === 'PGRST204')
    ) {
      console.warn('Columna subcarpeta_id no encontrada en peticion_responsables. Reintentando radicación sin subcarpeta_id...');
      const asignacionesFallback = asignacionesToInsert.map((a: any) => {
        const copy = { ...a };
        delete copy.subcarpeta_id;
        return copy;
      });

      const resFallback = await (supabase
        .from('peticion_responsables' as any)
        .insert(asignacionesFallback as any)
        .select('id, oficina_id, codigo_acceso, fecha_expiracion_codigo, storage_subfolder_path, estado_entrega') as any);

      responsablesData = resFallback.data;
      respError = resFallback.error;
    } else {
      responsablesData = resWithSub.data;
      respError = resWithSub.error;
    }

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

        const portalUrl = `${baseUrl}/portal-responsable?codigo=${encodeURIComponent(accessCode)}&email=${encodeURIComponent(targetEmail)}&pin=${encodeURIComponent(pinAcceso)}`;

        const emailPromise = sendPeticionAssignmentEmail({
          toEmail: targetEmail,
          oficinaNombre: oficina.nombre,
          numeroRadicado: peticionData.numero_radicado,
          asunto: peticionData.asunto,
          categoria: peticionData.categoria,
          prioridad: peticionData.prioridad,
          subcarpetas: assignedSubcarpetas,
          instruccionesAnexos: peticionData.instrucciones_anexos || peticionData.descripcion,
          fechaLimiteEntrega: peticionData.fecha_limite_entrega,
          fechaLimiteResponsable: peticionData.fecha_limite_responsable,
          codigoAcceso: accessCode,
          pinAcceso: pinAcceso,
          portalUrl,
          attachments: emailAttachments,
        }).catch((err: any) => {
          console.warn(`[EMAIL ERROR NO FATAL] Fallo correo a ${targetEmail}:`, err.message);
          return { success: false, error: err.message };
        });

        emailNotifications.push(emailPromise);
      }
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
          pin_acceso: pinAcceso,
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
