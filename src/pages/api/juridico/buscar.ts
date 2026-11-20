// src/pages/api/juridico/buscar.ts
import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '@lib/supabase';

const CATEGORIA_LABELS: Record<string, string> = {
  conceptos_internos: 'Conceptos Internos',
  litigios_judiciales: 'Litigios y Asuntos Judiciales',
  auditoria_entes_control: 'Auditoría de Entes de Control',
};

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateSnippet(text: string, query: string, maxLen = 160): { snippet: string; hasMatch: boolean } {
  if (!text || !query) {
    return {
      snippet: text ? (text.length > maxLen ? text.slice(0, maxLen) + '...' : text) : '',
      hasMatch: false,
    };
  }

  const cleanQuery = query.trim().split(/\s+/).filter(Boolean);
  if (cleanQuery.length === 0) {
    return { snippet: text.slice(0, maxLen) + (text.length > maxLen ? '...' : ''), hasMatch: false };
  }

  const primaryWord = cleanQuery[0];
  if (!primaryWord) {
    return { snippet: text.slice(0, maxLen) + (text.length > maxLen ? '...' : ''), hasMatch: false };
  }
  const regexPrimary = new RegExp(escapeRegex(primaryWord), 'i');
  const match = regexPrimary.exec(text);

  let snippet = '';
  let start = 0;
  let end = maxLen;

  if (match) {
    const matchIdx = match.index;
    const half = Math.floor(maxLen / 2);
    start = Math.max(0, matchIdx - half);
    end = Math.min(text.length, start + maxLen);
    if (end - start < maxLen) {
      start = Math.max(0, end - maxLen);
    }
    snippet = text.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
  } else {
    snippet = text.slice(0, maxLen) + (text.length > maxLen ? '...' : '');
  }

  // Resaltar términos encontrados con <mark>
  for (const term of cleanQuery) {
    if (term.length >= 2) {
      const termRegex = new RegExp(`(${escapeRegex(term)})`, 'gi');
      snippet = snippet.replace(termRegex, '<mark class="juridico-mark">$1</mark>');
    }
  }

  return { snippet, hasMatch: Boolean(match) };
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const q = (url.searchParams.get('q') || '').trim();
    const categoria = (url.searchParams.get('categoria') || 'todas').trim();
    const anio = (url.searchParams.get('anio') || 'todos').trim();
    const tema = (url.searchParams.get('tema') || 'todos').trim();
    const carpetaId = (url.searchParams.get('carpeta_id') || '').trim();

    const db = (supabaseAdmin || supabase) as any;

    // 1. Obtener catálogo de carpetas para reconstrucción de breadcrumbs y búsqueda
    const { data: allCarpetasRaw } = await db.from('juridico_carpetas').select('*');
    const allCarpetas: any[] = Array.isArray(allCarpetasRaw) ? allCarpetasRaw : [];
    const carpetasMap = new Map<string, any>(allCarpetas.map((c) => [c.id, c]));

    function buildBreadcrumbPath(catRaiz: string, folderId?: string | null): string {
      const rootLabel = CATEGORIA_LABELS[catRaiz] || catRaiz;
      if (!folderId) return rootLabel;

      const segments: string[] = [];
      let currentId: string | null = folderId;
      let depth = 0;

      while (currentId && depth < 10) {
        const folder = carpetasMap.get(currentId);
        if (!folder) break;
        segments.unshift(folder.nombre);
        currentId = folder.parent_id || null;
        depth++;
      }

      return [rootLabel, ...segments].join(' › ');
    }

    // 2. Consulta de Documentos
    let docQuery = db.from('juridico_documentos').select('*');

    if (categoria && categoria !== 'todas') {
      docQuery = docQuery.eq('categoria_raiz', categoria);
    }
    if (anio && anio !== 'todos') {
      const anioNum = parseInt(anio, 10);
      if (!isNaN(anioNum)) {
        docQuery = docQuery.eq('anio', anioNum);
      }
    }
    if (tema && tema !== 'todos') {
      docQuery = docQuery.ilike('tema', `%${tema}%`);
    }
    if (carpetaId) {
      docQuery = docQuery.eq('carpeta_id', carpetaId);
    }

    // Búsqueda profunda combinada: título, tema, palabras_clave, nombre de archivo, descripción y contenido extraído
    if (q) {
      const filterStr = [
        `titulo.ilike.%${q}%`,
        `tema.ilike.%${q}%`,
        `palabras_clave.ilike.%${q}%`,
        `archivo_nombre.ilike.%${q}%`,
        `descripcion.ilike.%${q}%`,
        `contenido_extraido.ilike.%${q}%`,
      ].join(',');
      docQuery = docQuery.or(filterStr);
    }

    docQuery = docQuery.order('created_at', { ascending: false }).limit(60);

    const { data: docsData, error: docError } = await docQuery;
    if (docError) {
      console.error('[JURIDICO BUSCAR] Error consultando documentos:', docError);
    }

    const rawDocs: any[] = Array.isArray(docsData) ? docsData : [];

    // Procesar resultados de documentos con snippet contextual y breadcrumb
    const documentosProcesados = rawDocs.map((doc) => {
      const breadcrumb = buildBreadcrumbPath(doc.categoria_raiz, doc.carpeta_id);
      const contentSnippet = generateSnippet(doc.contenido_extraido || '', q);
      const descSnippet = generateSnippet(doc.descripcion || '', q);

      let chosenSnippet = '';
      let isContentMatch = false;

      if (contentSnippet.hasMatch) {
        chosenSnippet = contentSnippet.snippet;
        isContentMatch = true;
      } else if (descSnippet.hasMatch) {
        chosenSnippet = descSnippet.snippet;
      } else {
        chosenSnippet = contentSnippet.snippet || descSnippet.snippet || '';
      }

      return {
        ...doc,
        breadcrumb,
        snippet: chosenSnippet,
        isContentMatch,
        categoriaLabel: CATEGORIA_LABELS[doc.categoria_raiz] || doc.categoria_raiz,
        hasExtractedText: Boolean(doc.contenido_extraido && doc.contenido_extraido.length > 0),
      };
    });

    // 3. Consulta de Carpetas (si hay query de búsqueda)
    let carpetasEncontradas: any[] = [];
    if (q) {
      let carpQuery = db.from('juridico_carpetas').select('*');
      if (categoria && categoria !== 'todas') {
        carpQuery = carpQuery.eq('categoria_raiz', categoria);
      }
      carpQuery = carpQuery.or(`nombre.ilike.%${q}%,tema.ilike.%${q}%,descripcion.ilike.%${q}%`).limit(20);
      const { data: carpData } = await carpQuery;
      if (Array.isArray(carpData)) {
        carpetasEncontradas = carpData.map((c) => ({
          ...c,
          breadcrumb: buildBreadcrumbPath(c.categoria_raiz, c.parent_id),
          categoriaLabel: CATEGORIA_LABELS[c.categoria_raiz] || c.categoria_raiz,
        }));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        query: q,
        categoria,
        totalResultados: documentosProcesados.length + carpetasEncontradas.length,
        documentos: documentosProcesados,
        carpetas: carpetasEncontradas,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[JURIDICO BUSCAR API] Error general:', err);
    return new Response(
      JSON.stringify({ error: err?.message || 'Error en la búsqueda profunda.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
