// src/data/audit.ts
import type { AuditLog } from '@lib/types';

// Los registros de auditoría y trazabilidad oficial se persisten y consultan en tiempo real en la tabla audit_logs de Supabase
export const INITIAL_AUDIT_LOGS: AuditLog[] = [];
