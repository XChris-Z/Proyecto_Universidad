// src/lib/audit.ts — Servicio de Auditoría Inmutable y Trazabilidad Real SGD Unitrópico
import type { AstroCookies } from 'astro';
import type { AuditLog, AuditActionType, AuditSeverity, InstitutionalUser } from './types';
import { generateAuditHash } from './utils';
import { supabase } from './supabase';
import {
  extractClientIp,
  normalizeInstitutionalRole,
  resolveSessionActor,
} from './request-actor';

const AUDIT_STORAGE_KEY = 'sgd_audit_logs';
const BOGOTA_TZ = 'America/Bogota';

function loadLogs(): AuditLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuditLog[]) : [];
  } catch {
    return [];
  }
}

function saveLogs(logs: AuditLog[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs));
  } catch {}
}

function getLastHash(logs: AuditLog[]): string {
  const first = logs[0];
  if (!first) return '0'.repeat(64);
  return first.integrityHash;
}

export function formatBogotaTimestamp(dateInput?: Date | string | number | null): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(d.getTime())) return String(dateInput || '');
  return d.toLocaleString('es-CO', {
    timeZone: BOGOTA_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function isLoopbackOrInvalidIp(rawIp?: unknown): boolean {
  const raw = String(rawIp ?? '').trim();
  if (!raw) return true;
  const lower = raw.toLowerCase();
  return (
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower === '::ffff:127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === 'localhost' ||
    lower === 'unknown' ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'red local / institucional'
  );
}

export function isValidDbInetIp(rawIp?: unknown): boolean {
  const s = String(rawIp ?? '').trim();
  if (isLoopbackOrInvalidIp(s)) return false;
  const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(s) && !s.startsWith('127.');
  const isIpv6 = s.includes(':') && /^[0-9a-fA-F:]+$/.test(s);
  return isIpv4 || isIpv6;
}

export function sanitizeAuditDisplayIp(rawIp?: unknown): string {
  const s = String(rawIp ?? '').trim();
  if (!s || isLoopbackOrInvalidIp(s)) {
    return 'Red Local / Institucional';
  }
  return s;
}

export function cleanAuditActionTitle(rawAction?: string | null): string {
  const action = String(rawAction || '').trim();
  if (!action) return 'Operación Institucional';

  if (action.includes('[EXPEDIENTE_COMPLETO]')) {
    const rad = action.match(/RAD-\d{4}-\d+/i)?.[0];
    return rad ? `Cierre Interno de Expediente (${rad.toUpperCase()})` : 'Cierre Interno de Expediente';
  }

  if (action.includes('AUTH_FAIL')) {
    return 'Acceso Denegado en Portal de Dependencias';
  }

  return action
    .replace(/\[RESPUESTA_META\]:\s*\{[\s\S]*?\}/gi, '')
    .replace(/\[REV_APROBADO:[^\]]+\]/gi, '')
    .replace(/\[RECHAZADO:[^\]]+\]/gi, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeAuditActor(actor: {
  id?: string | null;
  name?: string | null;
  role?: string | null;
  initials?: string | null;
  avatarColor?: string | null;
}): {
  id: string;
  name: string;
  role: string;
  initials: string;
  avatarColor: string;
} {
  let cleanName = String(actor?.name || 'Sistema SGD')
    .replace(/\s*-\s*(Oficina|Dependencia|Superadministrador|Administrador General)\s*$/i, '')
    .trim();

  if (!cleanName || /^administrador general$/i.test(cleanName)) {
    cleanName = 'Administrador del Sistema';
  }

  const rawRole = String(actor?.role || '').trim();
  const lowerRole = rawRole.toLowerCase();

  let roleLabel = '';
  if (lowerRole.includes('oficina') || lowerRole.includes('dependencia') || lowerRole === 'external') {
    roleLabel = 'Dependencia Asignada';
  } else if (lowerRole.includes('automat') || lowerRole === 'cron' || lowerRole === 'sistema') {
    roleLabel = 'Automatización SGD';
  } else if (
    !rawRole ||
    lowerRole === 'admin' ||
    lowerRole === 'superadmin' ||
    lowerRole === 'superadministrador' ||
    lowerRole === 'administrador general' ||
    lowerRole === 'administrador'
  ) {
    roleLabel = 'Administrador';
  } else if (
    lowerRole === 'funcionario' ||
    lowerRole === 'despacho' ||
    lowerRole === 'colaborador' ||
    lowerRole === 'usuario'
  ) {
    roleLabel = 'Funcionario';
  } else {
    roleLabel = normalizeInstitutionalRole(rawRole);
  }

  const initials =
    actor?.initials?.trim() ||
    cleanName
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() ||
    'SG';

  const avatarColor =
    actor?.avatarColor || (roleLabel === 'Administrador' ? '#00594E' : '#B5A160');

  return {
    id: String(actor?.id || 'usr-root'),
    name: cleanName,
    role: roleLabel,
    initials,
    avatarColor,
  };
}

export interface LogSystemActivityParams {
  actor:
    | InstitutionalUser
    | { id: string; name: string; role: string; initials?: string; avatarColor?: string };
  action: string;
  actionType: AuditActionType;
  entity: string;
  entityId: string;
  details: string;
  before?: any;
  after?: any;
  severity?: AuditSeverity;
  request?: Request | null;
  clientAddress?: string | null;
  cookies?: AstroCookies | null;
  ip?: string | null;
}

/** Registra una acción del sistema en Supabase y caché local con IP real y hora Colombia */
export async function logSystemActivity(params: LogSystemActivityParams): Promise<AuditLog> {
  // En llamadas desde navegador sin Request de servidor, delegar al endpoint /api/audit/log para capturar la IP real del cliente
  if (typeof window !== 'undefined' && !params.request) {
    try {
      const res = await fetch('/api/audit/log', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          actor: params.actor,
          action: params.action,
          actionType: params.actionType,
          entity: params.entity,
          entityId: params.entityId,
          details: params.details,
          before: params.before,
          after: params.after,
          severity: params.severity,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.entry) {
          const logs = loadLogs();
          logs.unshift(data.entry);
          saveLogs(logs.slice(0, 200));
          return data.entry as AuditLog;
        }
      }
    } catch {
      // Fallback abajo si el endpoint no está disponible
    }
  }

  // En servidor con cookies de sesión, resolver el actor real de BD salvo actores externos/automatización
  let baseActor = params.actor;
  const rawRoleLower = String(params.actor?.role || '').toLowerCase();
  const isExternalOrAutomation =
    rawRoleLower.includes('oficina') ||
    rawRoleLower.includes('dependencia') ||
    rawRoleLower.includes('automat') ||
    rawRoleLower === 'external';

  if (typeof window === 'undefined' && params.cookies && !isExternalOrAutomation) {
    try {
      const resolved = await resolveSessionActor(params.cookies, params.actor);
      baseActor = {
        ...params.actor,
        id: resolved.id,
        name: resolved.name,
        role: resolved.role,
      };
    } catch {}
  }

  const normalizedActor = normalizeAuditActor(baseActor);
  const detectedIp = params.ip || extractClientIp(params.request, params.clientAddress);
  const displayIp = sanitizeAuditDisplayIp(detectedIp);
  const dbIp: string | null = isValidDbInetIp(detectedIp) ? detectedIp : null;

  const logs = loadLogs();
  const previousHash = getLastHash(logs);
  const now = new Date();
  const cleanAction = cleanAuditActionTitle(params.action);

  const entry: AuditLog = {
    id: `alog-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: formatBogotaTimestamp(now),
    rawTimestamp: now.toISOString(),
    actor: normalizedActor,
    action: cleanAction,
    actionType: params.actionType,
    entity: params.entity,
    entityId: params.entityId,
    details: params.details,
    before: params.before,
    after: params.after,
    severity: params.severity || 'INFO',
    previousHash,
    integrityHash: generateAuditHash(previousHash, {
      action: cleanAction,
      entity: params.entity,
      entityId: params.entityId,
      actorId: normalizedActor.id,
      timestamp: now.toISOString(),
    }),
    ip: displayIp,
    cipher: 'AES-256-GCM / SHA-256',
  };

  if (typeof window !== 'undefined') {
    logs.unshift(entry);
    saveLogs(logs.slice(0, 200));
  }

  // Persistir en Supabase con tolerancia a columnas inet o FK estrictas en actor_id
  try {
    const buildPayload = (useIp: string | null, useActorId: string | null) => ({
      id: entry.id,
      actor_id: useActorId,
      actor_name: entry.actor.name,
      actor_role: entry.actor.role,
      action: entry.action,
      action_type: entry.actionType,
      entity: entry.entity,
      entity_id: entry.entityId,
      details: entry.details,
      before_state: (entry.before ?? null) as any,
      after_state: (entry.after ?? null) as any,
      severity: entry.severity,
      previous_hash: entry.previousHash,
      integrity_hash: entry.integrityHash,
      ip_address: useIp,
      cipher: entry.cipher,
      raw_timestamp: entry.rawTimestamp,
    });

    const isUuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      normalizedActor.id
    );
    const initialActorId =
      normalizedActor.id && (isUuidLike || normalizedActor.id.startsWith('usr-'))
        ? normalizedActor.id
        : null;

    let res = await supabase.from('audit_logs').insert([buildPayload(dbIp, initialActorId)]);
    if (res.error) {
      res = await supabase.from('audit_logs').insert([buildPayload(null, initialActorId)]);
    }
    if (res.error && initialActorId) {
      await supabase.from('audit_logs').insert([buildPayload(null, null)]);
    }
  } catch (err) {
    console.warn('[Audit] No se pudo registrar en Supabase (reintento diferido):', err);
  }

  return entry;
}

/** Obtiene los logs de auditoría en tiempo real desde Supabase */
export async function fetchAuditLogsFromSupabase(): Promise<AuditLog[]> {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('raw_timestamp', { ascending: false })
      .limit(250);

    if (!error && data) {
      const visibleRows = (data as any[]).filter((d) => d.entity !== 'rbac_state_snapshot');
      const mapped: AuditLog[] = visibleRows.map((d: any) => {
        const normalizedActor = normalizeAuditActor({
          id: d.actor_id || 'usr-root',
          name: d.actor_name,
          role: d.actor_role,
        });

        return {
          id: d.id,
          timestamp: formatBogotaTimestamp(d.raw_timestamp || d.created_at || Date.now()),
          rawTimestamp: d.raw_timestamp,
          actor: normalizedActor,
          action: cleanAuditActionTitle(d.action),
          actionType: (d.action_type || 'ACCESO') as AuditActionType,
          entity: d.entity,
          entityId: d.entity_id,
          details: d.details,
          before: d.before_state,
          after: d.after_state,
          severity: (d.severity || 'INFO') as AuditSeverity,
          previousHash: d.previous_hash || '0'.repeat(64),
          integrityHash: d.integrity_hash || '0'.repeat(64),
          ip: sanitizeAuditDisplayIp(d.ip_address),
          cipher: d.cipher || 'AES-256-GCM / SHA-256',
        };
      });
      saveLogs(mapped);
      return mapped;
    }
  } catch (err) {
    console.warn('[Audit] Error obteniendo logs de Supabase:', err);
  }

  return loadLogs();
}

/** Obtiene los logs de auditoría locales */
export function getAuditLogs(): AuditLog[] {
  return loadLogs();
}
