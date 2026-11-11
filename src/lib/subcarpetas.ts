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
    email_destino?: string | null;
    original_email?: string | null;
    emails_autorizados?: string[];
    pins_historicos?: string[];
    archivo_respuesta?: any;
    respuesta_archivo?: any;
    [key: string]: any;
  } | null;
  allPins: string[];
  allEmails: string[];
  allMetas: any[];
}

/**
 * Extrae todos los objetos JSON válidos asociados a `[RESPUESTA_META]: {...}` mediante conteo balanceado
 * de llaves (tolerante a objetos anidados como `archivo_respuesta` y bloques múltiples heredados).
 */
function extractJsonObjectAt(text: string, startIndex: number): { jsonStr: string; endIndex: number } | null {
  const openIdx = text.indexOf('{', startIndex);
  if (openIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return { jsonStr: text.slice(openIdx, i + 1), endIndex: i + 1 };
      }
    }
  }
  return null;
}

/**
 * Elimina cualquier bloque `[RESPUESTA_META]: ...` del texto dejando solo el contenido descriptivo limpio.
 */
export function limpiarBloquesRespuestaMeta(textoCrudo: string | null | undefined): string {
  const texto = String(textoCrudo ?? '');
  if (!texto) return '';
  return separarRespuestaMeta(texto).textoLimpio
    .replace(/\[?RESPUESTA_META\]?\s*:[\s\S]*$/gi, '')
    .trim();
}

/**
 * Separa y extrae el bloque [RESPUESTA_META] del texto crudo (instrucciones_anexos o descripcion).
 * Soporta múltiples bloques heredados y JSONs con objetos anidados, retornando siempre el más
 * reciente como `respuestaMeta` y acumulando todos los PINs y correos históricos en `allPins`/`allEmails`.
 * Garantiza que `textoLimpio` JAMÁS contenga el JSON de metadatos de respuesta.
 */
export function separarRespuestaMeta(textoCrudo: string | null | undefined): SubcarpetaMetaParsed {
  const texto = String(textoCrudo ?? '');
  const allMetas: any[] = [];
  const pinsSet = new Set<string>();
  const emailsSet = new Set<string>();

  const tagRegex = /\[?RESPUESTA_META\]?\s*:/gi;
  const tagMatches = Array.from(texto.matchAll(tagRegex));

  const collectFromObj = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    allMetas.push(obj);
    if (obj.pin) pinsSet.add(String(obj.pin).replace(/\s+/g, '').trim());
    if (Array.isArray(obj.pins_historicos)) {
      obj.pins_historicos.forEach((p: any) => {
        const cleanP = String(p || '').replace(/\s+/g, '').trim();
        if (cleanP) pinsSet.add(cleanP);
      });
    }
    const candidates = [
      obj.email_destino,
      obj.correo,
      obj.to,
      obj.original_email,
      ...(Array.isArray(obj.emails_autorizados) ? obj.emails_autorizados : []),
    ];
    candidates.forEach((c: any) => {
      const cleanE = String(c || '').trim().toLowerCase();
      if (cleanE && cleanE.includes('@')) emailsSet.add(cleanE);
    });
  };

  for (let idx = 0; idx < tagMatches.length; idx++) {
    const match = tagMatches[idx]!;
    const afterTag = (match.index ?? 0) + match[0].length;
    const extracted = extractJsonObjectAt(texto, afterTag);
    if (extracted) {
      try {
        const parsed = JSON.parse(extracted.jsonStr);
        collectFromObj(parsed);
        continue;
      } catch {}
    }

    // Respaldo tolerante ante bloques JSON heredados truncados o dañados
    const nextTagStart = tagMatches[idx + 1]?.index ?? texto.length;
    const rawSegment = texto.slice(afterTag, nextTagStart);
    const pinFallback = rawSegment.match(/"pin"\s*:\s*"([^"]+)"/i);
    if (pinFallback?.[1]) pinsSet.add(pinFallback[1].replace(/\s+/g, '').trim());
    for (const emailFallback of rawSegment.matchAll(/"(?:email_destino|correo|to|original_email)"\s*:\s*"([^"]+@[^"]+)"/gi)) {
      if (emailFallback[1]) emailsSet.add(emailFallback[1].trim().toLowerCase());
    }
  }

  const firstIdx = texto.search(/\[?RESPUESTA_META\]?\s*:/i);
  const textoLimpio = (firstIdx !== -1 ? texto.slice(0, firstIdx) : texto)
    .replace(/\[?RESPUESTA_META\]?\s*:[\s\S]*$/gi, '')
    .trim();

  const respuestaMeta = allMetas.length > 0 ? allMetas[allMetas.length - 1] : null;
  return {
    textoLimpio,
    respuestaMeta,
    allPins: Array.from(pinsSet),
    allEmails: Array.from(emailsSet),
    allMetas,
  };
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
 * Limpia el nombre de una carpeta quitando el prefijo forzado "Subcarpeta"
 */
export function limpiarNombreCarpeta(nombreCrudo: string | null | undefined): string {
  return String(nombreCrudo ?? '').replace(/^subcarpeta\s+/i, '').trim();
}

/**
 * Ordena un conjunto de carpetas con orden alfanumérico natural estricto ('1.1', '1.2', '1.3'...)
 */
export function ordenarCarpetasNaturalmente<T = any>(lista: T[]): T[] {
  return [...lista].sort((a: any, b: any) => {
    const nombreA = limpiarNombreCarpeta(a?.nombre ?? a?.name ?? a);
    const nombreB = limpiarNombreCarpeta(b?.nombre ?? b?.name ?? b);
    return nombreA.localeCompare(nombreB, 'es', { numeric: true, sensitivity: 'base' });
  });
}

/**
 * Filtra una lista de subcarpetas asegurando que todas sean válidas y legítimas,
 * y retornándolas ordenadas con numeración natural estricta (1.1, 1.2, 1.3...).
 */
export function filtrarSubcarpetasValidas<T = any>(
  lista: T[] | null | undefined
): T[] {
  if (!Array.isArray(lista)) return [];
  const validas = lista.filter(item => esSubcarpetaValida(item));
  return ordenarCarpetasNaturalmente(validas);
}

/**
 * Normaliza si una petición ya cuenta con respuesta oficial despachada al solicitante.
 */
export const OFFICIAL_RESPONSE_AUDIT_ACTION = 'Envío de Respuesta Oficial al Solicitante';

/**
 * Determina si un registro de `audit_logs` corresponde a un despacho oficial real
 * al solicitante (excluye ingresos al portal de dependencias y cargas previas).
 */
export function isAuditLogOfficialResponse(
  log: { action?: string | null; entity_id?: string | null; details?: string | null } | null | undefined,
  peticion: { id?: string | number | null; numero_radicado?: string | null }
): boolean {
  if (!log) return false;
  const actionText = String(log.action || '').trim();
  if (actionText !== OFFICIAL_RESPONSE_AUDIT_ACTION) {
    return false;
  }

  const petId = peticion?.id ? String(peticion.id).trim() : '';
  const radicado = peticion?.numero_radicado ? String(peticion.numero_radicado).trim() : '';
  const entityId = String(log.entity_id || '').trim();
  const details = String(log.details || '');

  return Boolean(
    (petId && entityId === petId) ||
      (radicado && (entityId === radicado || details.includes(radicado)))
  );
}

/**
 * Determina de forma unificada en todo el sistema (Dashboard, Peticiones, Archivos,
 * Calendario y APIs) si una petición ya cuenta con respuesta oficial despachada.
 */
export function isPeticionRespondida(p: any): boolean {
  if (!p) return false;
  const st = String(p.estado || '').toLowerCase().trim();
  if (
    st === 'respondida' ||
    st === 'respondido' ||
    st === 'resuelta' ||
    st === 'resuelto' ||
    st === 'finalizada' ||
    st === 'finalizado' ||
    st === 'cerrada' ||
    st === 'cerrado' ||
    st === 'despachada' ||
    st === 'despachado'
  ) {
    return true;
  }

  if (
    p.respondida === true ||
    p.tiene_respuesta_audit === true ||
    Boolean(p.fecha_respuesta) ||
    Boolean(p.respuesta_fecha_envio) ||
    p.respuesta_oficial === true ||
    p.respuesta_enviada === true ||
    (typeof p.respuesta_mensaje === 'string' && p.respuesta_mensaje.trim().length > 0) ||
    Boolean(p.respuesta_pin_solicitante)
  ) {
    return true;
  }

  const anexos = Array.isArray(p.anexos)
    ? p.anexos
    : Array.isArray(p.peticion_anexos)
      ? p.peticion_anexos
      : [];
  if (
    anexos.some((a: any) => {
      const tipo = String(a?.tipo || a?.categoria || '').toUpperCase().trim();
      return a?.es_respuesta_final === true || tipo === 'RESPUESTA_FINAL';
    })
  ) {
    return true;
  }

  if (p.instrucciones_anexos) {
    const { respuestaMeta } = separarRespuestaMeta(p.instrucciones_anexos);
    if (
      respuestaMeta &&
      (respuestaMeta.fecha_envio ||
        respuestaMeta.pin ||
        (typeof respuestaMeta.msg === 'string' && respuestaMeta.msg.trim().length > 0))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Clasifica los días restantes en las bandas SLA oficiales:
 * > 5 días -> safe (Plazo Saludable)
 * 1 a 5 días -> warn (Próximo a Vencer)
 * <= 0 días -> critical (Crítico / Vencido)
 */
export function getSlaBucket(daysRemaining: number): 'safe' | 'warn' | 'critical' {
  if (daysRemaining <= 0) return 'critical';
  if (daysRemaining <= 5) return 'warn';
  return 'safe';
}
