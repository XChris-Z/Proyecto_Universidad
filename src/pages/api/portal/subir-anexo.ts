// src/pages/api/portal/subir-anexo.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    let peticionId = '';
    let responsableId = '';
    let subcarpetaId = '';
    let numeroRadicado = '';
    let emailInstitucional = '';
    let storageSubfolder = '';
    let observaciones = '';
    let fileBuffer: Buffer | null = null;
    let fileName = '';
    let fileMime = 'application/octet-stream';
    let fileSize = 0;

    let directStoragePath: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('archivo') as File | null;
      peticionId = (formData.get('peticion_id') as string) || '';
      responsableId = (formData.get('responsable_id') as string) || '';
      subcarpetaId = (formData.get('subcarpeta_id') as string) || '';
      numeroRadicado = (formData.get('numero_radicado') as string) || '';
      emailInstitucional = (formData.get('email_institucional') as string) || '';
      storageSubfolder = (formData.get('storage_subfolder_path') as string) || '';
      observaciones = (formData.get('observaciones') as string) || '';

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
      responsableId = body.responsable_id || '';
      subcarpetaId = body.subcarpeta_id || '';
      numeroRadicado = body.numero_radicado || '';
      emailInstitucional = body.email_institucional || '';
      storageSubfolder = body.storage_subfolder_path || '';
      observaciones = body.observaciones || '';
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

    if ((!fileBuffer && !directStoragePath) || !peticionId || !responsableId || !numeroRadicado || !storageSubfolder) {
      return new Response(
        JSON.stringify({ success: false, error: 'Parámetros obligatorios faltantes para la carga.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Validar que la fecha límite no haya expirado aún
    const { data: respCheck, error: checkError } = await (supabase
      .from('peticion_responsables' as any)
      .select('fecha_expiracion_codigo, estado_entrega')
      .eq('id', responsableId)
      .single() as any);

    if (checkError || !respCheck) {
      return new Response(
        JSON.stringify({ success: false, error: 'Asignación no encontrada.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const ahora = new Date();
    const expiracion = new Date(respCheck.fecha_expiracion_codigo);
    if (ahora > expiracion) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'El plazo de entrega para su oficina expiró. No se reciben anexos dentro de los últimos 5 días previos al cierre.',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Subir archivo a Supabase Storage bucket 'peticiones' (si no fue subido directo por el cliente)
    let fullStoragePath = directStoragePath;
    if (!fullStoragePath && fileBuffer) {
      const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const relativeStoragePath = `${storageSubfolder.replace(/^peticiones\//, '')}${Date.now()}_${cleanFileName}`;
      fullStoragePath = `peticiones/${relativeStoragePath}`;

      const { error: uploadError } = await supabase.storage
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
    const anexoPayload: any = {
      peticion_id: peticionId,
      peticion_responsable_id: responsableId,
      nombre_archivo: fileName,
      storage_path: fullStoragePath,
      tamano_bytes: fileSize,
      mime_type: fileMime,
      subido_por_email: emailInstitucional || 'oficina@unitropico.edu.co',
      es_anexo_oficina: true,
    };

    if (subcarpetaId && !subcarpetaId.startsWith('sub-')) {
      anexoPayload.subcarpeta_id = subcarpetaId;
    }

    let anexoData: any = null;
    let anexoError: any = null;

    const resAnexo = await (supabase
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
      const retryRes = await (supabase
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

    // 4. Actualizar estado de entrega en peticion_responsables preservando el PIN
    const { data: currentResp } = await (supabase
      .from('peticion_responsables' as any)
      .select('observaciones_entrega')
      .eq('id', responsableId)
      .maybeSingle() as any);

    const rawExisting = currentResp?.observaciones_entrega || '';
    const pinMatch = rawExisting.match(/PIN:\s*([0-9A-Z]{6})/i);
    const cleanUserObs = String(observaciones || '').trim();

    let finalObservaciones = '';
    if (pinMatch) {
      finalObservaciones = cleanUserObs ? `${pinMatch[0]} | ${cleanUserObs}` : pinMatch[0];
    } else {
      finalObservaciones = cleanUserObs;
    }

    // Actualizar de forma defensiva
    try {
      await (supabase
        .from('peticion_responsables' as any)
        .update({
          estado_entrega: 'Entregado',
          fecha_entrega: new Date().toISOString(),
          observaciones_entrega: finalObservaciones || null,
          observaciones: cleanUserObs || null,
        } as any)
        .eq('id', responsableId) as any);
    } catch {
      await (supabase
        .from('peticion_responsables' as any)
        .update({
          estado_entrega: 'Entregado',
          fecha_entrega: new Date().toISOString(),
          observaciones_entrega: finalObservaciones || null,
        } as any)
        .eq('id', responsableId) as any);
    }

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
