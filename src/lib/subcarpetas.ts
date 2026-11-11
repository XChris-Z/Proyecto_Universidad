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
    archivo_respuesta?: any;
    respuesta_archivo?: any;
    [key: string]: any;
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
    st === 'completada' ||
    st === 'completado' ||
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
    p.fecha_respuesta ||
    p.respuesta_fecha_envio ||
    p.respuesta_oficial === true ||
    p.respuesta_enviada === true ||
    (typeof p.respuesta_mensaje === 'string' && p.respuesta_mensaje.trim().length > 0) ||
    p.respuesta_pin_solicitante
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
