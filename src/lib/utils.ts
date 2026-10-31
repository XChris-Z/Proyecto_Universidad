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
 * Calcula el progreso de un plazo documental y su clase de urgencia (Semáforo SLA)
 */
export function calculateDeadlineProgress(
  uploadDateStr: string | null | undefined,
  dueDateStr: string | null | undefined
): DeadlineProgress {
  const ahora = Date.now();
  const parseDate = (d?: string | null, fallback = ahora) => {
    if (!d) return fallback;
    const clean = d.includes('T') ? d : `${d}T12:00:00`;
    const t = new Date(clean).getTime();
    return isNaN(t) ? fallback : t;
  };

  const inicio = parseDate(uploadDateStr, ahora - 86_400_000);
  const fin = parseDate(dueDateStr, ahora + 15 * 86_400_000);

  const totalTiempo = fin - inicio;
  const transcurrido = ahora - inicio;
  const diasRestantes = Math.ceil((fin - ahora) / (1000 * 60 * 60 * 24));

  let porcentaje = 100;
  if (diasRestantes <= 0) {
    porcentaje = 100;
  } else if (totalTiempo > 0) {
    porcentaje = Math.min(100, Math.max(5, Math.round((transcurrido / totalTiempo) * 100)));
  }

  let statusClass: string;
  let statusBadge: string;
  let color: string;
  let bgLight: string;

  if (diasRestantes <= 0) {
    statusClass = 'status-vencido';
    statusBadge = diasRestantes === 0 ? 'Vence Hoy' : `Vencido (${Math.abs(diasRestantes)}d)`;
    color = '#dc2626'; // Rojo
    bgLight = '#FEF2F2';
  } else if (diasRestantes <= 2) {
    statusClass = 'status-critico';
    statusBadge = `${diasRestantes}d (Crítico)`;
    color = '#dc2626'; // Rojo
    bgLight = '#FEF2F2';
  } else if (diasRestantes <= 7) {
    statusClass = 'status-alerta';
    statusBadge = `${diasRestantes} días`;
    color = '#d97706'; // Amarillo / Ámbar
    bgLight = '#FFFBEB';
  } else {
    statusClass = 'status-normal';
    statusBadge = `${diasRestantes} días`;
    color = '#16a34a'; // Verde saludable
    bgLight = '#ECFDF5';
  }

  return { percentage: porcentaje, daysRemaining: diasRestantes, statusClass, statusBadge, color, bgLight };
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

