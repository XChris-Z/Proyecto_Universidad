// src/lib/revision-meta.ts

export interface RejectionMarkerInfo {
  rejected: boolean;
  motivo: string;
  subcarpeta?: string;
}

/**
 * Extrae los IDs de anexos aprobados registrados en `observaciones_entrega`.
 */
export function extractApprovedAnexoIds(observaciones?: string | null): Set<string> {
  const result = new Set<string>();
  const raw = String(observaciones || '');
  const matches = raw.matchAll(/\[REV_APROBADO:([^\]]+)\]/gi);
  for (const m of matches) {
    if (m?.[1]) result.add(String(m[1]).trim());
  }
  return result;
}

/**
 * Agrega un marcador de aprobación `[REV_APROBADO:<id>]` y limpia marcas de rechazo previas de esa subcarpeta.
 */
export function addApprovedAnexoMarker(
  observaciones: string | null | undefined,
  anexoId: string,
  subcarpetaNombre?: string | null
): string {
  let clean = stripRejectionMarker(observaciones, subcarpetaNombre);
  const token = `[REV_APROBADO:${anexoId}]`;
  if (!clean.includes(token)) {
    clean = [clean, token].filter(Boolean).join(' | ');
  }
  return clean;
}

/**
 * Elimina el marcador de aprobación de un anexo específico.
 */
export function removeApprovedAnexoMarker(
  observaciones: string | null | undefined,
  anexoId: string
): string {
  return String(observaciones || '')
    .replace(new RegExp(`\\s*\\|\\s*\\[REV_APROBADO:${escapeRegExp(anexoId)}\\]`, 'gi'), '')
    .replace(new RegExp(`\\[REV_APROBADO:${escapeRegExp(anexoId)}\\]\\s*\\|\\s*`, 'gi'), '')
    .replace(new RegExp(`\\[REV_APROBADO:${escapeRegExp(anexoId)}\\]`, 'gi'), '')
    .trim();
}

/**
 * Elimina marcadores `[RECHAZADO...]` de `observaciones_entrega`.
 */
export function stripRejectionMarker(
  observaciones: string | null | undefined,
  subcarpetaNombre?: string | null
): string {
  const raw = String(observaciones || '').trim();
  if (!raw) return '';
  if (subcarpetaNombre) {
    const escaped = escapeRegExp(subcarpetaNombre.trim());
    return raw
      .replace(new RegExp(`\\s*\\|\\s*\\[RECHAZADO:${escaped}\\][^|]*`, 'gi'), '')
      .replace(new RegExp(`\\[RECHAZADO:${escaped}\\][^|]*\\s*\\|\\s*`, 'gi'), '')
      .replace(new RegExp(`\\[RECHAZADO:${escaped}\\][^|]*`, 'gi'), '')
      .trim();
  }
  return raw
    .replace(/\s*\|\s*\[RECHAZADO[^\]]*\][^|]*/gi, '')
    .replace(/\[RECHAZADO[^\]]*\][^|]*\s*\|\s*/gi, '')
    .replace(/\[RECHAZADO[^\]]*\][^|]*/gi, '')
    .trim();
}

/**
 * Registra marcador `[RECHAZADO:<subcarpeta>]: <motivo>` en `observaciones_entrega`.
 */
export function setRejectedMarker(
  observaciones: string | null | undefined,
  subcarpetaNombre: string | null | undefined,
  motivo: string
): string {
  const cleanObs = stripRejectionMarker(observaciones, subcarpetaNombre);
  const subLabel = String(subcarpetaNombre || 'Soporte').trim().replace(/[\]|]/g, '');
  const cleanMotivo = String(motivo || 'Soporte devuelto para corrección').replace(/\|/g, '/').trim();
  const tag = `[RECHAZADO:${subLabel}]: ${cleanMotivo}`;
  return [cleanObs, tag].filter(Boolean).join(' | ');
}

/**
 * Extrae información de rechazo si existe para esa observación/subcarpeta.
 */
export function extractRejectionInfo(
  observaciones?: string | null,
  subcarpetaNombre?: string | null
): RejectionMarkerInfo | null {
  const raw = String(observaciones || '');
  if (!/\[RECHAZADO/i.test(raw)) return null;

  if (subcarpetaNombre) {
    const escaped = escapeRegExp(subcarpetaNombre.trim());
    const specificMatch = raw.match(new RegExp(`\\[RECHAZADO:${escaped}\\]:?\\s*([^|\\r\\n]+)`, 'i'));
    if (specificMatch) {
      return {
        rejected: true,
        subcarpeta: subcarpetaNombre,
        motivo: String(specificMatch[1] || 'Requiere subsanación documental').trim(),
      };
    }
  }

  const anyMatch = raw.match(/\[RECHAZADO(?::([^\]]+))?\]:?\s*([^|\r\n]+)/i);
  if (anyMatch) {
    return {
      rejected: true,
      subcarpeta: anyMatch[1] ? String(anyMatch[1]).trim() : undefined,
      motivo: String(anyMatch[2] || 'Requiere subsanación documental').trim(),
    };
  }

  return null;
}

/**
 * Limpia los tokens internos de revisión antes de mostrar notas humanas en UI o correos.
 */
export function sanitizeRevisionTokens(observaciones?: string | null): string {
  return String(observaciones || '')
    .replace(/\s*\|\s*\[REV_APROBADO:[^\]]+\]/gi, '')
    .replace(/\[REV_APROBADO:[^\]]+\]\s*\|\s*/gi, '')
    .replace(/\[REV_APROBADO:[^\]]+\]/gi, '')
    .trim();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

