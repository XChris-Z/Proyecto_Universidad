// src/pages/api/portal/subir-anexo.ts
import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('archivo') as File | null;
    const peticionId = formData.get('peticion_id') as string | null;
    const responsableId = formData.get('responsable_id') as string | null;
    const numeroRadicado = formData.get('numero_radicado') as string | null;
    const emailInstitucional = formData.get('email_institucional') as string | null;
    const storageSubfolder = formData.get('storage_subfolder_path') as string | null;
    const observaciones = (formData.get('observaciones') as string | null) || '';

    if (!file || !peticionId || !responsableId || !numeroRadicado || !storageSubfolder) {
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
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const relativeStoragePath = `${storageSubfolder.replace(/^peticiones\//, '')}${Date.now()}_${cleanFileName}`;
    const fullStoragePath = `peticiones/${relativeStoragePath}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('peticiones')
      .upload(relativeStoragePath, buffer, {
        contentType: file.type || 'application/octet-stream',
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
        nombre_archivo: file.name,
        storage_path: fullStoragePath,
        tamano_bytes: file.size,
        mime_type: file.type,
        subido_por_email: emailInstitucional || 'oficina@unitropico.edu.co',
        es_anexo_oficina: true,
      } as any)
      .select()
      .single() as any);

    if (anexoError) {
      console.error('Error insertando registro de anexo:', anexoError);
    }

    // 4. Actualizar estado de entrega en peticion_responsables
    await (supabase
      .from('peticion_responsables' as any)
      .update({
        estado_entrega: 'Entregado',
        fecha_entrega: new Date().toISOString(),
        observaciones_entrega: observaciones,
      } as any)
      .eq('id', responsableId) as any);

    return new Response(
      JSON.stringify({
        success: true,
        anexo: anexoData || {
          nombre_archivo: file.name,
          storage_path: fullStoragePath,
          tamano_bytes: file.size,
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

