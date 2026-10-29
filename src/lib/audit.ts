// src/lib/audit.ts
// Sistema de auditoría y trazabilidad del SGD Unitrópico
// Fase 1: persiste en localStorage. Fase 2: persiste en Supabase (tabla audit_logs).

import type { AuditLog, AuditActionType, AuditSeverity, InstitutionalUser } from './types';
import { generateAuditHash } from './utils';
import { INITIAL_AUDIT_LOGS } from '@data/audit';

const AUDIT_STORAGE_KEY = 'sgd_audit_logs';

/** Carga los logs desde localStorage (Fase 1) o retorna los iniciales */
function loadLogs(): AuditLog[] {
  if (typeof window === 'undefined') return INITIAL_AUDIT_LOGS;
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuditLog[]) : INITIAL_AUDIT_LOGS;
  } catch {
    return INITIAL_AUDIT_LOGS;
  }
}

/** Persiste los logs en localStorage (Fase 1) */
function saveLogs(logs: AuditLog[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs));
}

/** Obtiene el hash del último registro para encadenar */
function getLastHash(logs: AuditLog[]): string {
  return logs.at(-1)?.integrityHash ?? '0'.repeat(64);
}

/**
 * Registra una actividad en el log de auditoría.
 * Usa hash chaining (blockchain-style) para garantizar integridad.
 */
export function logSystemActivity(params: {
  actor: InstitutionalUser;
  action: string;
  actionType: AuditActionType;
  entity: string;
  entityId: string;
  details: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  severity?: AuditSeverity;
}): void {
  const logs = loadLogs();
  const previousHash = getLastHash(logs);
  const now = new Date();

  const entry: AuditLog = {
    id: `alog-${Date.now()}`,
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
      initials: params.actor.initials,
      avatarColor: params.actor.avatarColor,
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
    ip: '192.168.1.x', // En Fase 3 se obtiene del request server-side
    cipher: 'AES-256-GCM / SHA-256',
  };

  logs.push(entry);
  saveLogs(logs);
}

/** Obtiene todos los logs de auditoría */
export function getAuditLogs(): AuditLog[] {
  return loadLogs();
}

