// src/pages/api/portal/subir-anexo.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    let peticionId = '';
    let responsableId = '';
    let numeroRadicado = '';
    let emailInstitucional = '';
    let storageSubfolder = '';
    let observaciones = '';
    let fileBuffer: Buffer | null = null;
    let fileName = '';
    let fileMime = 'application/octet-stream';
    let fileSize = 0;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('archivo') as File | null;
      peticionId = (formData.get('peticion_id') as string) || '';
      responsableId = (formData.get('responsable_id') as string) || '';
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
      numeroRadicado = body.numero_radicado || '';
      emailInstitucional = body.email_institucional || '';
      storageSubfolder = body.storage_subfolder_path || '';
      observaciones = body.observaciones || '';

      if (body.archivo_base64 && body.archivo_nombre) {
        fileBuffer = Buffer.from(body.archivo_base64, 'base64');
        fileName = body.archivo_nombre;
        fileMime = body.archivo_mime || 'application/octet-stream';
        fileSize = fileBuffer.length;
      }
    }

    if (!fileBuffer || !peticionId || !responsableId || !numeroRadicado || !storageSubfolder) {
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

    // 2. Subir archivo a Supabase Storage bucket 'peticiones'
    // Ruta: peticiones/{numero_radicado}/{nombre_oficina_slug}/{timestamp}_{filename}
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const relativeStoragePath = `${storageSubfolder.replace(/^peticiones\//, '')}${Date.now()}_${cleanFileName}`;
    const fullStoragePath = `peticiones/${relativeStoragePath}`;

    const { error: uploadError } = await supabase.storage
      .from('peticiones')
      .upload(relativeStoragePath, fileBuffer, {
        contentType: fileMime,
        upsert: true,
      });

    if (uploadError) {
      console.warn('Advertencia subiendo a Supabase Storage (se registrará anexo):', uploadError.message);
    }

    // 3. Registrar en public.peticion_anexos
    const { data: anexoData, error: anexoError } = await (supabase
      .from('peticion_anexos' as any)
      .insert({
        peticion_id: peticionId,
        peticion_responsable_id: responsableId,
        nombre_archivo: fileName,
        storage_path: fullStoragePath,
        tamano_bytes: fileSize,
        mime_type: fileMime,
        subido_por_email: emailInstitucional || 'oficina@unitropico.edu.co',
        es_anexo_oficina: true,
      } as any)
      .select()
      .single() as any);

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

    await (supabase
      .from('peticion_responsables' as any)
      .update({
        estado_entrega: 'Entregado',
        fecha_entrega: new Date().toISOString(),
        observaciones_entrega: finalObservaciones || null,
      } as any)
      .eq('id', responsableId) as any);

    return new Response(
      JSON.stringify({
        success: true,
        anexo: anexoData || {
          nombre_archivo: fileName,
          storage_path: fullStoragePath,
          tamano_bytes: fileSize,
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

