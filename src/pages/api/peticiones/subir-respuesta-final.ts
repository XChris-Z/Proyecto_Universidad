// src/pages/api/peticiones/subir-respuesta-final.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';
import { separarRespuestaMeta } from '@lib/subcarpetas';

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    let peticionId = '';
    let fileName = '';
    let fileMime = 'application/pdf';
    let fileSize = 0;
    let fileBuffer: Buffer | null = null;
    let directStoragePath: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      peticionId = (formData.get('peticion_id') as string) || '';
      const file = formData.get('archivo') as File | null;
      if (file && typeof file.arrayBuffer === 'function') {
        const arrayBuffer = await file.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuffer);
        fileName = file.name;
        fileMime = file.type || 'application/pdf';
        fileSize = file.size;
      }
    } else {
      const body = await request.json().catch(() => ({}));
      peticionId = body.peticion_id || '';
      fileName = body.nombre_archivo || '';
      fileMime = body.mime_type || body.archivo_mime || 'application/pdf';
      fileSize = Number(body.tamano_bytes || body.archivo_tamano || 0);
      directStoragePath = body.storage_path || null;

      if (body.archivo_base64 && fileName) {
        fileBuffer = Buffer.from(body.archivo_base64, 'base64');
        fileSize = fileBuffer.length;
      }
    }

    if (!peticionId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Identificador de petición requerido.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!fileBuffer && !directStoragePath) {
      return new Response(
        JSON.stringify({ success: false, error: 'Debe adjuntar el archivo de Respuesta Final Oficial.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Consultar radicado de la petición
    const { data: peticion, error: petErr } = await (supabase
      .from('peticiones' as any)
      .select('id, numero_radicado, asunto, instrucciones_anexos, storage_folder_path')
      .eq('id', peticionId)
      .maybeSingle() as any);

    if (petErr || !peticion) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontró la petición en el sistema.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // REGLA ESTRICTA DE NOMBRE DE ARCHIVO: Conservar el nombre 100% original sin prefijos ni textos extra
    const cleanOriginalName = (fileName || 'Respuesta_Oficial.pdf')
      .replace(/^\[[^\]]+\]\s*/, '')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .trim();

    const cleanRadicado = String(peticion.numero_radicado || peticion.id).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const finalStoragePath = directStoragePath || `peticiones/${cleanRadicado}/respuesta_final/${cleanOriginalName}`;

    // 2. Subir a Supabase Storage bucket 'peticiones' si se envió buffer
    if (fileBuffer) {
      const cleanPathForBucket = finalStoragePath.replace(/^peticiones\//, '');
      const { error: uploadErr } = await supabase.storage
        .from('peticiones')
        .upload(cleanPathForBucket, fileBuffer, {
          contentType: fileMime,
          upsert: true,
        });

      if (uploadErr) {
        console.warn('[Subir Respuesta Final] Aviso en Supabase Storage:', uploadErr.message);
      }
    }

    const archivoRespuesta = {
      id: `resp-file-${peticion.id}`,
      peticion_id: peticion.id,
      nombre_archivo: cleanOriginalName,
      storage_path: finalStoragePath,
      tamano_bytes: fileSize,
      mime_type: fileMime,
      es_anexo_oficina: false,
      es_respuesta_final: true,
      created_at: new Date().toISOString(),
    };

    // 3. Registrar o actualizar en public.peticion_anexos
    try {
      const { data: existingAnexos } = await (supabase
        .from('peticion_anexos' as any)
        .select('id, storage_path')
        .eq('peticion_id', peticion.id)
        .ilike('storage_path', '%/respuesta_final/%') as any);

      if (existingAnexos && existingAnexos.length > 0) {
        const targetId = existingAnexos[0].id;
        await (supabase
          .from('peticion_anexos' as any)
          .update({
            nombre_archivo: cleanOriginalName,
            storage_path: finalStoragePath,
            tamano_bytes: fileSize,
            mime_type: fileMime,
            created_at: new Date().toISOString(),
          } as any)
          .eq('id', targetId) as any);
        archivoRespuesta.id = targetId;
      } else {
        const { data: insertedAnexo } = await (supabase
          .from('peticion_anexos' as any)
          .insert({
            peticion_id: peticion.id,
            nombre_archivo: cleanOriginalName,
            storage_path: finalStoragePath,
            tamano_bytes: fileSize,
            mime_type: fileMime,
            es_anexo_oficina: false,
            subido_por_email: 'despacho@unitropico.edu.co',
          } as any)
          .select()
          .maybeSingle() as any);

        if (insertedAnexo?.id) {
          archivoRespuesta.id = insertedAnexo.id;
        }
      }
    } catch (anexoErr: any) {
      console.warn('[Subir Respuesta Final] Aviso actualizando peticion_anexos:', anexoErr.message);
    }

    // 4. Actualizar [RESPUESTA_META] en instrucciones_anexos para persistencia inmutable
    const { textoLimpio, respuestaMeta } = separarRespuestaMeta(peticion.instrucciones_anexos || '');
    const currentMeta = (respuestaMeta && typeof respuestaMeta === 'object') ? respuestaMeta : {};
    const updatedMeta = {
      ...currentMeta,
      archivo_respuesta: archivoRespuesta,
      respuesta_archivo: archivoRespuesta,
    };

    const cleanInst = textoLimpio.trim();
    const metaBlock = `[RESPUESTA_META]: ${JSON.stringify(updatedMeta)}`;
    const newInstrucciones = cleanInst ? `${cleanInst}\n\n${metaBlock}` : metaBlock;

    await (supabase
      .from('peticiones' as any)
      .update({
        instrucciones_anexos: newInstrucciones,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', peticion.id) as any);

    // 5. Registrar en Auditoría y Trazabilidad
    try {
      await logSystemActivity({
        actor: { id: 'usr-despacho', name: 'Funcionario de Despacho', role: 'funcionario' },
        action: 'Carga de Respuesta Final Oficial',
        actionType: 'RESPUESTA',
        entity: 'Expediente Documental',
        entityId: peticion.numero_radicado || peticion.id,
        details: `Se cargó el archivo de respuesta final oficial: "${cleanOriginalName}" (${(fileSize / 1024).toFixed(1)} KB) sin alterar su nomenclatura original.`,
        severity: 'INFO',
      });
    } catch (auditErr: any) {
      console.warn('[Subir Respuesta Final] Error audit:', auditErr.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Respuesta Final Oficial cargada exitosamente con su nombre original.',
        archivo: archivoRespuesta,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[Subir Respuesta Final] Error crítico:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error interno al cargar la respuesta final.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
