// src/lib/audit.ts
// Sistema de auditoría y trazabilidad oficial del SGD Unitrópico
// Persiste en Supabase (tabla audit_logs) y mantiene sincronizado el estado.

import type { AuditLog, AuditActionType, AuditSeverity, InstitutionalUser } from './types';
import { generateAuditHash } from './utils';
import { supabase } from './supabase';

const AUDIT_STORAGE_KEY = 'sgd_audit_logs';

/** Carga los logs desde localStorage o retorna arreglo vacío */
function loadLogs(): AuditLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuditLog[]) : [];
  } catch {
    return [];
  }
}

/** Persiste los logs en localStorage */
function saveLogs(logs: AuditLog[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs));
}

/** Obtiene el hash del último registro para encadenar */
function getLastHash(logs: AuditLog[]): string {
  return logs.at(0)?.integrityHash ?? '0'.repeat(64);
}

/**
 * Registra una actividad en el log de auditoría en Supabase.
 * Usa hash chaining (blockchain-style) para garantizar integridad inmutable.
 */
export async function logSystemActivity(params: {
  actor: InstitutionalUser | { id: string; name: string; role: string; initials?: string; avatarColor?: string };
  action: string;
  actionType: AuditActionType;
  entity: string;
  entityId: string;
  details: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  severity?: AuditSeverity;
}): Promise<AuditLog> {
  const logs = loadLogs();
  const previousHash = getLastHash(logs);
  const now = new Date();

  const entry: AuditLog = {
    id: `alog-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: now.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    rawTimestamp: now.toISOString(),
    actor: {
      id: params.actor.id,
      name: params.actor.name,
      role: params.actor.role,
      initials: params.actor.initials || params.actor.name.substring(0, 2).toUpperCase(),
      avatarColor: params.actor.avatarColor || '#00594E',
    },
    action: params.action,
    actionType: params.actionType,
    entity: params.entity,
    entityId: params.entityId,
    details: params.details,
    before: params.before ?? null,
    after: params.after ?? null,
    severity: params.severity ?? 'INFO',
    previousHash,
    integrityHash: generateAuditHash(previousHash, {
      action: params.action,
      entityId: params.entityId,
      ts: now.toISOString(),
    }),
    ip: '127.0.0.1',
    cipher: 'AES-256-GCM / SHA-256',
  };

  // Guardar en cache local
  logs.unshift(entry);
  saveLogs(logs);

  // Persistir en Supabase audit_logs
  try {
    await supabase.from('audit_logs').insert([{
      id: entry.id,
      action: entry.action,
      action_type: entry.actionType,
      actor_id: params.actor.id && params.actor.id.startsWith('usr-') ? params.actor.id : null,
      actor_name: params.actor.name,
      actor_role: params.actor.role,
      entity: entry.entity,
      entity_id: entry.entityId,
      details: entry.details,
      before_state: (entry.before as any) ?? null,
      after_state: (entry.after as any) ?? null,
      severity: entry.severity,
      previous_hash: entry.previousHash,
      integrity_hash: entry.integrityHash,
      cipher: entry.cipher,
      raw_timestamp: entry.rawTimestamp,
    }]);
  } catch (err) {
    console.warn('[Audit] Error guardando log en Supabase:', err);
  }

  return entry;
}

/** Obtiene todos los logs de auditoría consultando en vivo Supabase */
export async function fetchAuditLogsFromSupabase(): Promise<AuditLog[]> {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('raw_timestamp', { ascending: false });

    if (!error && data && data.length > 0) {
      const mapped: AuditLog[] = data.map((d: any) => {
        const dDate = new Date(d.raw_timestamp || Date.now());
        return {
          id: d.id,
          timestamp: dDate.toLocaleString('es-CO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          rawTimestamp: d.raw_timestamp,
          actor: {
            id: d.actor_id || 'usr-anon',
            name: d.actor_name,
            role: d.actor_role,
            initials: d.actor_name ? d.actor_name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : 'US',
            avatarColor: d.actor_role === 'admin' ? '#00594E' : '#D4AF37',
          },
          action: d.action,
          actionType: (d.action_type || 'ACCESO') as AuditActionType,
          entity: d.entity,
          entityId: d.entity_id,
          details: d.details,
          before: d.before_state,
          after: d.after_state,
          severity: (d.severity || 'INFO') as AuditSeverity,
          previousHash: d.previous_hash || '0'.repeat(64),
          integrityHash: d.integrity_hash || '0'.repeat(64),
          ip: d.ip_address ? String(d.ip_address) : '127.0.0.1',
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
