// src/pages/api/juridico/documentos/subir.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';
import { resolveSessionActor } from '@lib/request-actor';
import { extractText } from 'unpdf';
// @ts-ignore
import mammoth from 'mammoth';

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const categoriaRaiz = String(formData.get('categoria_raiz') || '').trim();
    const carpetaIdRaw = formData.get('carpeta_id');
    const carpetaId = carpetaIdRaw && carpetaIdRaw !== 'null' && carpetaIdRaw !== 'undefined' ? String(carpetaIdRaw) : null;
    const titulo = String(formData.get('titulo') || '').trim();
    const tema = String(formData.get('tema') || '').trim() || null;
    const anioRaw = formData.get('anio');
    const anio = anioRaw ? parseInt(String(anioRaw), 10) : new Date().getFullYear();
    const palabrasClave = String(formData.get('palabras_clave') || '').trim() || null;
    const descripcion = String(formData.get('descripcion') || '').trim() || null;

    if (!file || typeof file === 'string') {
      return new Response(JSON.stringify({ error: 'No se ha adjuntado ningún archivo válido.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const validCategorias = ['conceptos_internos', 'litigios_judiciales', 'auditoria_entes_control'];
    if (!validCategorias.includes(categoriaRaiz)) {
      return new Response(JSON.stringify({ error: 'Categoría raíz inválida.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fileName = file.name || 'documento.pdf';
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const mimeType = file.type || 'application/octet-stream';
    const lowerName = fileName.toLowerCase();

    // Clonar copias independientes ANTES de consumir el ArrayBuffer (previene detached ArrayBuffer en unpdf/Storage)
    const rawBuffer = await file.arrayBuffer();
    // Copia 1: exclusiva para subir a Supabase Storage
    const storageBytes = Buffer.from(rawBuffer.slice(0));
    // Copia 2: exclusiva para extracción de texto (si la librería la detacha, no afecta a Storage)
    const extractBytes = new Uint8Array(rawBuffer.slice(0));
    const extractNodeBuffer = Buffer.from(extractBytes);

    // 1. Subir Archivo Original primero a Supabase Storage (bucket dedicado 'juridico', con respaldo a 'peticiones')
    const storagePath = `${categoriaRaiz}/${Date.now()}_${cleanFileName}`;
    const storageClient = supabaseAdmin || supabase;
    let targetBucket = 'juridico';
    let targetPath = storagePath;
    let { error: uploadError } = await storageClient.storage
      .from(targetBucket)
      .upload(targetPath, storageBytes, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      targetBucket = 'peticiones';
      targetPath = `juridico/${storagePath}`;
      const fallbackRes = await storageClient.storage
        .from(targetBucket)
        .upload(targetPath, storageBytes, {
          contentType: mimeType,
          upsert: true,
        });
      uploadError = fallbackRes.error;
    }

    if (uploadError) {
      console.error('[JURIDICO UPLOAD] Error subiendo archivo a Supabase Storage:', uploadError);
      return new Response(JSON.stringify({ error: `Error subiendo archivo: ${uploadError.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: publicData } = storageClient.storage.from(targetBucket).getPublicUrl(targetPath);
    const archivoUrl = publicData?.publicUrl || '';

    // 2. Extracción Automática de Texto en Memoria con copia independiente (no bloqueante ante errores o PDFs escaneados)
    let extractedText = '';
    try {
      if (lowerName.endsWith('.pdf') || mimeType.includes('pdf')) {
        const pdfResult = await extractText(extractBytes).catch(() => null);
        if (pdfResult) {
          if (Array.isArray(pdfResult.text)) {
            extractedText = pdfResult.text.join(' ');
          } else {
            extractedText = String(pdfResult.text || '');
          }
        }
      } else if (lowerName.endsWith('.docx') || mimeType.includes('wordprocessingml')) {
        const docxResult = await mammoth.extractRawText({ buffer: extractNodeBuffer }).catch(() => null);
        if (docxResult && docxResult.value) {
          extractedText = String(docxResult.value || '');
        }
      } else if (lowerName.endsWith('.txt') || lowerName.endsWith('.csv') || mimeType.includes('text')) {
        extractedText = extractNodeBuffer.toString('utf-8');
      }
    } catch (extractErr: any) {
      console.warn('[JURIDICO EXTRACTION] Advertencia extrayendo texto (no fatal):', extractErr?.message);
    }

    // Normalizar texto extraído y limitar tamaño de seguridad a 150,000 caracteres
    const cleanedText = extractedText
      .replace(/\r\n/g, '\n')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 150000);

    // 3. Insertar Registro en juridico_documentos
    const dbClient = (supabaseAdmin || supabase) as any;
    const docPayload = {
      categoria_raiz: categoriaRaiz,
      carpeta_id: carpetaId,
      titulo: titulo || fileName,
      tema,
      anio,
      palabras_clave: palabrasClave,
      descripcion,
      archivo_url: archivoUrl,
      archivo_nombre: fileName,
      archivo_tamano: file.size,
      contenido_extraido: cleanedText,
      created_at: new Date().toISOString(),
    };

    const { data: insertedDoc, error: insertError } = await dbClient
      .from('juridico_documentos')
      .insert([docPayload])
      .select('*')
      .single();

    if (insertError) {
      console.error('[JURIDICO INSERT] Error guardando metadatos en DB:', insertError);
      return new Response(JSON.stringify({ error: `Error en base de datos: ${insertError.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Registro de Auditoría
    const actor = await resolveSessionActor(cookies, null);
    await logSystemActivity({
      actor,
      action: 'Subida de Documento en Asuntos Jurídicos',
      actionType: 'SUBIDA_ARCHIVO',
      entity: 'Asuntos Jurídicos',
      entityId: insertedDoc.id,
      details: `Documento "${fileName}" subido en categoría ${categoriaRaiz} (Año ${anio}, Tema: ${tema || 'General'}). Longitud texto indexado: ${cleanedText.length} caracteres.`,
      severity: 'INFO',
      request,
      clientAddress,
      cookies,
    }).catch((e) => console.warn('[JURIDICO AUDITORIA] Error:', e?.message));

    return new Response(
      JSON.stringify({
        success: true,
        documento: insertedDoc,
        indexedChars: cleanedText.length,
        hasText: cleanedText.length > 0,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[JURIDICO SUBIR API] Error general:', err);
    return new Response(
      JSON.stringify({ error: err?.message || 'Error interno del servidor procesando archivo.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
