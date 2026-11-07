// src/lib/subcarpetas.ts

export interface SubcarpetaMetaParsed {
  textoLimpio: string;
  respuestaMeta: {
    pin?: string;
    expira?: string;
    msg?: string;
    func?: string;
    files?: string[];
    drive?: string | null;
    fecha_envio?: string;
  } | null;
}

/**
 * Separa y extrae el bloque [RESPUESTA_META] del texto crudo (instrucciones_anexos o descripcion).
 * Garantiza que textoLimpio JAMÁS contenga el JSON de metadatos de respuesta.
 */
export function separarRespuestaMeta(textoCrudo: string | null | undefined): SubcarpetaMetaParsed {
  const texto = String(textoCrudo ?? '');
  const idx = texto.search(/\[?RESPUESTA_META\]?\s*:/i);
  if (idx === -1) {
    return { textoLimpio: texto.trim(), respuestaMeta: null };
  }

  const textoLimpio = texto.slice(0, idx).trim();
  const bloqueMeta = texto.slice(idx).replace(/^\[?RESPUESTA_META\]?\s*:\s*/i, '').trim();

  let respuestaMeta: any = null;
  try {
    const firstBrace = bloqueMeta.indexOf('{');
    const lastBrace = bloqueMeta.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      respuestaMeta = JSON.parse(bloqueMeta.slice(firstBrace, lastBrace + 1));
    }
  } catch (e) {
    console.warn('[SUBCARPETAS] Error parseando bloque RESPUESTA_META:', e);
  }

  return { textoLimpio, respuestaMeta };
}

/**
 * Filtro de seguridad anti-subcarpetas fantasma / basura.
 * Descarta cualquier registro corrupto derivado de arrays de UUIDs o metadatos JSON.
 */
export function esSubcarpetaValida(sub: any): boolean {
  if (!sub) return false;
  let nombre = '';
  let desc = '';

  if (typeof sub === 'string') {
    nombre = sub.trim();
  } else if (typeof sub === 'object') {
    nombre = String(sub.nombre ?? sub.name ?? '').trim();
    desc = String(sub.descripcion ?? sub.requerimiento ?? sub.instruccion ?? '').trim();
  }

  if (!nombre) return false;

  const upper = nombre.toUpperCase();
  if (upper.includes('RESPUESTA_META') || upper === 'EXPEDIENTE GENERAL' || upper.startsWith('PIN')) {
    return false;
  }
  if (nombre.includes('{"') || nombre.includes('"}') || nombre.includes('","') || nombre.includes('":') || nombre.includes('["') || nombre.includes('"]')) {
    return false;
  }
  if (/^["']?[0-9a-f]{8}-[0-9a-f]{4}-/i.test(nombre)) {
    return false;
  }
  if (desc.startsWith('{"pin":') || desc.includes('"fecha_envio":') || desc.includes('"expira":')) {
    return false;
  }
  return true;
}

/**
 * Filtra una lista de subcarpetas asegurando que todas sean válidas y legítimas.
 */
export function filtrarSubcarpetasValidas<T = any>(
  lista: T[] | null | undefined
): T[] {
  if (!Array.isArray(lista)) return [];
  return lista.filter(item => esSubcarpetaValida(item));
}
