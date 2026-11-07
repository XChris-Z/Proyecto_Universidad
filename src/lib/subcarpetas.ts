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
    correo?: string | null;
  } | null;
  allPins: string[];
  allMetas: any[];
}

/**
 * Separa y extrae el bloque [RESPUESTA_META] del texto crudo (instrucciones_anexos o descripcion).
 * Soporta múltiples bloques heredados, retornando siempre el más reciente como `respuestaMeta`
 * y acumulando todos los PINs históricos emitidos en `allPins`.
 * Garantiza que `textoLimpio` JAMÁS contenga el JSON de metadatos de respuesta.
 */
export function separarRespuestaMeta(textoCrudo: string | null | undefined): SubcarpetaMetaParsed {
  const texto = String(textoCrudo ?? '');
  const allMetas: any[] = [];
  const allPins: string[] = [];

  // Buscar todas las ocurrencias de [RESPUESTA_META]: {...}
  const metaRegex = /\[?RESPUESTA_META\]?\s*:\s*(\{.*?\})(?=\s*(\[?RESPUESTA_META\]?|$))/gs;
  for (const m of texto.matchAll(metaRegex)) {
    try {
      const jsonStr = m[1];
      if (jsonStr) {
        const obj = JSON.parse(jsonStr);
        if (obj && typeof obj === 'object') {
          allMetas.push(obj);
          if (obj.pin) {
            allPins.push(String(obj.pin).trim());
          }
        }
      }
    } catch {}
  }

  const idx = texto.search(/\[?RESPUESTA_META\]?\s*:/i);
  let textoLimpio = texto;
  if (idx !== -1) {
    textoLimpio = texto.slice(0, idx).trim();
    if (allMetas.length === 0) {
      const bloque = texto.slice(idx).replace(/^\[?RESPUESTA_META\]?\s*:\s*/i, '').trim();
      const firstBrace = bloque.indexOf('{');
      const lastBrace = bloque.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        try {
          const parsed = JSON.parse(bloque.slice(firstBrace, lastBrace + 1));
          if (parsed && typeof parsed === 'object') {
            allMetas.push(parsed);
            if (parsed.pin) allPins.push(String(parsed.pin).trim());
          }
        } catch {}
      }
    }
  }

  const respuestaMeta = allMetas.length > 0 ? allMetas[allMetas.length - 1] : null;
  return { textoLimpio: textoLimpio.trim(), respuestaMeta, allPins, allMetas };
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
