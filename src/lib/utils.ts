// src/lib/utils.ts
// Funciones utilitarias compartidas del SGD Unitrópico

import type { DeadlineProgress } from './types';

/**
 * Formatea una fecha como "DD Mon YYYY" (ej: "26 Oct 2026")
 */
export function formatNiceDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Retorna la fecha en formato YYYY-MM-DD
 */
export function formatDateInput(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

/**
 * Suma (o resta si es negativo) días a una fecha
 */
export function addDays(baseDate: Date, days: number): Date {
  const result = new Date(baseDate);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Calcula el progreso de un plazo documental y su clase de urgencia
 */
export function calculateDeadlineProgress(
  uploadDateStr: string,
  dueDateStr: string
): DeadlineProgress {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const uploadDate = new Date(uploadDateStr + 'T00:00:00');
  const dueDate = new Date(dueDateStr + 'T00:00:00');

  const totalDays = Math.max(
    1,
    Math.round((dueDate.getTime() - uploadDate.getTime()) / 86_400_000)
  );
  const daysRemaining = Math.round(
    (dueDate.getTime() - today.getTime()) / 86_400_000
  );
  const percentage = Math.min(
    100,
    Math.max(0, Math.round(((totalDays - daysRemaining) / totalDays) * 100))
  );

  let statusClass: string;
  let statusBadge: string;

  if (daysRemaining < 0) {
    statusClass = 'status-vencido';
    statusBadge = `VENCIDO (${Math.abs(daysRemaining)}d)`;
  } else if (daysRemaining <= 3) {
    statusClass = 'status-critico';
    statusBadge = `CRÍTICO: ${daysRemaining}d`;
  } else if (daysRemaining <= 7) {
    statusClass = 'status-alerta';
    statusBadge = `${daysRemaining} días`;
  } else {
    statusClass = 'status-normal';
    statusBadge = `${daysRemaining} días`;
  }

  return { percentage, daysRemaining, statusClass, statusBadge };
}

/**
 * Genera un hash determinista de 64 chars para el log de auditoría
 * (blockchain-style chaining — implementación mock para Fase 1)
 */
export function generateAuditHash(
  previousHash: string,
  recordData: object
): string {
  const raw = previousHash + JSON.stringify(recordData) + Date.now();
  let hash = '';
  for (let i = 0; i < raw.length; i++) {
    hash += raw.charCodeAt(i).toString(16).padStart(2, '0');
  }
  // Asegura siempre 64 caracteres
  return (hash + '0'.repeat(64)).slice(0, 64);
}

/**
 * Trunca un texto a n caracteres y añade "…"
 */
export function truncate(text: string, n: number): string {
  return text.length > n ? text.slice(0, n) + '…' : text;
}

