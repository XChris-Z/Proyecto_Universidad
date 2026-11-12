// src/lib/dashboard-data.ts
// Fuente unificada y resiliente de métricas en tiempo real para Dashboard y Exportación Excel (.xlsx)

import { supabase } from './supabase';
import {
  getSlaBucket,
  isAuditLogOfficialResponse,
  isPeticionRespondida,
  limpiarBloquesRespuestaMeta,
  separarRespuestaMeta,
} from './subcarpetas';

export interface DashboardPriorityDoc {
  id: string;
  numero_radicado: string;
  asunto: string;
  solicitante_nombre: string;
  fecha_limite_entrega: string;
  fecha_limite_responsable: string;
  prioridad: string;
  estado: string;
  respondida: boolean;
  progress: {
    percentage: number;
    statusClass: string;
    statusBadge: string;
    daysRemaining: number;
  };
  statusCategory: 'safe' | 'warn' | 'danger';
}

export interface DependencyPerformanceRow {
  oficinaId: string;
  codigo: string;
  nombre: string;
  email: string;
  asignacionesTotales: number;
  entregadas: number;
  aprobadas: number;
  rechazadas: number;
  pendientes: number;
  eficaciaPct: number;
}

export interface DashboardSnapshot {
  generatedAtIso: string;
  generatedAtBogota: string;
  peticiones: any[];
  urgentPeticiones: DashboardPriorityDoc[];
  totalPeticiones: number;
  totalRespondidas: number;
  totalPendientes: number;
  responseRate: number;
  aportesAprobadosCount: number;
  dependenciasPendientesCount: number;
  oficiosEmitidos: number;
  oficiosEntregados: number;
  oficiosPendientes: number;
  slaSafe: number;
  slaWarn: number;
  slaDanger: number;
  slaSafePct: number;
  slaWarnPct: number;
  slaDangerPct: number;
  totalNormas: number;
  acuerdosCount: number;
  resolucionesCount: number;
  actasCount: number;
  otrosNormasCount: number;
  recentNormas: any[];
  normas: any[];
  totalConvenios: number;
  convenios: any[];
  totalJuridicos: number;
  totalJuzgamiento: number;
  totalProgramas: number;
  totalPlaneacion: number;
  rendimientoDependencias: DependencyPerformanceRow[];
  auditLogsRecientes: any[];
}

async function safeSelectAll(table: string, orderCol?: string, ascending = false): Promise<any[]> {
  try {
    if (orderCol) {
      const ordered = await (supabase
        .from(table as any)
        .select('*')
        .order(orderCol, { ascending }) as any);
      if (!ordered.error && Array.isArray(ordered.data)) {
        return ordered.data;
      }
    }
    const plain = await (supabase.from(table as any).select('*') as any);
    return !plain.error && Array.isArray(plain.data) ? plain.data : [];
  } catch {
    return [];
  }
}

function normalizeYmd(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  const direct = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct?.[1]) return direct[1];
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function getTodayBogotaYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function diffDaysYmd(targetYmd: string, baseYmd: string): number {
  const t = Date.parse(`${targetYmd}T00:00:00Z`);
  const b = Date.parse(`${baseYmd}T00:00:00Z`);
  return Math.round((t - b) / 86_400_000);
}

export function formatBogotaDateTime(raw: string | Date | null | undefined): string {
  if (!raw) return '--';
  const d = raw instanceof Date ? raw : new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  return d.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function computeSlaProgressForDoc(pet: any, todayYmd: string): DashboardPriorityDoc['progress'] & { statusCategory: 'safe' | 'warn' | 'danger' } {
  const limitYmd = normalizeYmd(pet.fecha_limite_entrega);
  const startYmd = normalizeYmd(pet.fecha_radicacion || pet.created_at) || todayYmd;

  if (!limitYmd) {
    return {
      percentage: 10,
      statusClass: 'badge-green',
      statusBadge: 'En Trámite',
      daysRemaining: 10,
      statusCategory: 'safe',
    };
  }

  const daysRemaining = diffDaysYmd(limitYmd, todayYmd);
  const totalSpan = Math.max(1, diffDaysYmd(limitYmd, startYmd));
  const elapsed = Math.max(0, totalSpan - daysRemaining);
  const percentage = Math.min(100, Math.max(5, Math.round((elapsed / totalSpan) * 100)));
  const bucket = getSlaBucket(daysRemaining);

  if (daysRemaining < 0) {
    return {
      percentage: 100,
      statusClass: 'badge-danger',
      statusBadge: `Vencido (${Math.abs(daysRemaining)}d)`,
      daysRemaining,
      statusCategory: 'danger',
    };
  }
  if (daysRemaining === 0) {
    return {
      percentage: 100,
      statusClass: 'badge-danger',
      statusBadge: 'Vence Hoy',
      daysRemaining: 0,
      statusCategory: 'danger',
    };
  }
  if (bucket === 'critical' || daysRemaining <= 2) {
    return {
      percentage: Math.max(percentage, 80),
      statusClass: 'badge-danger',
      statusBadge: `Crítico (${daysRemaining}d)`,
      daysRemaining,
      statusCategory: 'danger',
    };
  }
  if (bucket === 'warn' || percentage >= 50) {
    return {
      percentage: Math.max(percentage, 50),
      statusClass: 'badge-warn',
      statusBadge: `Próximo (${daysRemaining}d)`,
      daysRemaining,
      statusCategory: 'warn',
    };
  }
  return {
    percentage,
    statusClass: 'badge-green',
    statusBadge: `En Término (${daysRemaining}d)`,
    daysRemaining,
    statusCategory: 'safe',
  };
}

export async function getDashboardSnapshotData(): Promise<DashboardSnapshot> {
  const [
    rawPeticiones,
    rawResponsables,
    rawAnexos,
    rawSubcarpetas,
    rawOficinas,
    rawNormas,
    rawConvenios,
    rawJuridicos,
    rawJuzgamiento,
    rawProgramas,
    rawPlaneacion,
    rawAuditLogs,
  ] = await Promise.all([
    safeSelectAll('peticiones', 'created_at', false),
    safeSelectAll('peticion_responsables'),
    safeSelectAll('peticion_anexos', 'created_at', false),
    safeSelectAll('peticion_subcarpetas', 'created_at', true),
    safeSelectAll('oficinas', 'nombre', true),
    safeSelectAll('colegiados_normas', 'fecha', false),
    safeSelectAll('convenios', 'created_at', false),
    safeSelectAll('juridicos_casos', 'created_at', false),
    safeSelectAll('juzgamiento_procesos', 'created_at', false),
    safeSelectAll('programas_academicos', 'created_at', false),
    safeSelectAll('planeacion_informes', 'created_at', false),
    safeSelectAll('audit_logs', 'raw_timestamp', false),
  ]);

  const peticionesActivas = (rawPeticiones || []).filter((p: any) => p && p.id);
  const idsPeticionesActivas = new Set(peticionesActivas.map((p: any) => String(p.id)));
  const radicadosActivos = new Set(
    peticionesActivas
      .map((p: any) => String(p.numero_radicado || p.radicado || '').trim().toUpperCase())
      .filter(Boolean)
  );

  // Filtrar estrictamente contra peticiones activas (descartar huérfanos de radicados eliminados)
  const responsablesActivos = (rawResponsables || []).filter((r: any) => {
    const pid = String(r?.peticion_id || '');
    const rad = String(r?.radicado || r?.numero_radicado || '').trim().toUpperCase();
    return (pid && idsPeticionesActivas.has(pid)) || (rad && radicadosActivos.has(rad));
  });

  const anexosActivos = (rawAnexos || []).filter((a: any) => {
    const pid = String(a?.peticion_id || '');
    const rad = String(a?.radicado || a?.numero_radicado || '').trim().toUpperCase();
    return (pid && idsPeticionesActivas.has(pid)) || (rad && radicadosActivos.has(rad));
  });

  const subcarpetasActivas = (rawSubcarpetas || []).filter((s: any) => {
    const pid = String(s?.peticion_id || '');
    return pid && idsPeticionesActivas.has(pid);
  });

  const oficinaMap = new Map<string, any>();
  for (const ofi of rawOficinas) {
    if (ofi?.id) oficinaMap.set(String(ofi.id), ofi);
  }

  const respsByPet = new Map<string, any[]>();
  for (const r of responsablesActivos) {
    const pid = String(r?.peticion_id || '');
    if (!pid || !idsPeticionesActivas.has(pid)) continue;
    const enrichedResp = {
      ...r,
      oficinas: r.oficinas || oficinaMap.get(String(r.oficina_id || '')) || null,
    };
    const arr = respsByPet.get(pid) || [];
    arr.push(enrichedResp);
    respsByPet.set(pid, arr);
  }

  const anexosByPet = new Map<string, any[]>();
  for (const a of anexosActivos) {
    const pid = String(a?.peticion_id || '');
    if (!pid || !idsPeticionesActivas.has(pid)) continue;
    const arr = anexosByPet.get(pid) || [];
    arr.push(a);
    anexosByPet.set(pid, arr);
  }

  const subsByPet = new Map<string, any[]>();
  for (const s of subcarpetasActivas) {
    const pid = String(s?.peticion_id || '');
    if (!pid || !idsPeticionesActivas.has(pid)) continue;
    const arr = subsByPet.get(pid) || [];
    arr.push(s);
    subsByPet.set(pid, arr);
  }

  const todayYmd = getTodayBogotaYmd();

  const peticiones = peticionesActivas.map((p: any) => {
    const pid = String(p.id || '');
    const parsedMeta = separarRespuestaMeta(p.instrucciones_anexos || p.descripcion || '');
    const auditMatch = rawAuditLogs.some((log: any) => isAuditLogOfficialResponse(log, p));
    const anexos = anexosByPet.get(pid) || [];
    const responsables = respsByPet.get(pid) || [];
    const subcarpetas = subsByPet.get(pid) || [];

    const enriched: any = {
      ...p,
      peticion_anexos: anexos,
      peticion_responsables: responsables,
      subcarpetas,
      tiene_respuesta_audit: auditMatch,
      respuesta_meta: parsedMeta.respuestaMeta,
      texto_limpio: limpiarBloquesRespuestaMeta(p.instrucciones_anexos || p.descripcion || ''),
    };
    enriched.respondida = isPeticionRespondida(enriched);
    return enriched;
  });

  const totalPeticiones = peticiones.length;
  const totalRespondidas = peticiones.filter((p) => p.respondida).length;
  const totalPendientes = Math.max(0, totalPeticiones - totalRespondidas);
  const responseRate = totalPeticiones > 0 ? Math.round((totalRespondidas / totalPeticiones) * 100) : 0;

  let slaSafe = 0;
  let slaWarn = 0;
  let slaDanger = 0;
  const urgentPeticiones: DashboardPriorityDoc[] = [];

  for (const pet of peticiones) {
    if (pet.respondida) continue;
    const calc = computeSlaProgressForDoc(pet, todayYmd);
    if (calc.statusCategory === 'danger') slaDanger++;
    else if (calc.statusCategory === 'warn') slaWarn++;
    else slaSafe++;

    urgentPeticiones.push({
      id: pet.id,
      numero_radicado: pet.numero_radicado || `RAD-${String(pet.id).slice(0, 8)}`,
      asunto: pet.asunto || 'Expediente sin asunto',
      solicitante_nombre: pet.solicitante_nombre || 'Solicitante Institucional',
      fecha_limite_entrega: normalizeYmd(pet.fecha_limite_entrega) || 'En trámite',
      fecha_limite_responsable: normalizeYmd(pet.fecha_limite_responsable) || '--',
      prioridad: pet.prioridad || 'Media',
      estado: pet.estado || 'en_tramite',
      respondida: false,
      progress: {
        percentage: calc.percentage,
        statusClass: calc.statusClass,
        statusBadge: calc.statusBadge,
        daysRemaining: calc.daysRemaining,
      },
      statusCategory: calc.statusCategory,
    });
  }

  // Ordenar Reparto Prioritario: críticos/vencidos primero, luego menor días restantes
  urgentPeticiones.sort((a, b) => a.progress.daysRemaining - b.progress.daysRemaining);

  const activeTotal = slaSafe + slaWarn + slaDanger;
  const slaSafePct = activeTotal > 0 ? Math.round((slaSafe / activeTotal) * 100) : totalPeticiones > 0 ? 100 : 0;
  const slaWarnPct = activeTotal > 0 ? Math.round((slaWarn / activeTotal) * 100) : 0;
  const slaDangerPct = activeTotal > 0 ? Math.max(0, 100 - slaSafePct - slaWarnPct) : 0;

  // Oficios emitidos vs entregados/pendientes (asignaciones a dependencias)
  // Oficios emitidos vs entregados/pendientes (asignaciones a dependencias de radicados activos exclusivamente)
  const oficiosEmitidos = responsablesActivos.length;
  let oficiosEntregados = 0;
  let oficiosPendientes = 0;

  // Mapa de rendimiento por dependencia (únicamente radicados activos)
  const depPerfMap = new Map<string, DependencyPerformanceRow>();
  for (const ofi of rawOficinas) {
    depPerfMap.set(String(ofi.id), {
      oficinaId: String(ofi.id),
      codigo: String(ofi.codigo || '--'),
      nombre: String(ofi.nombre || 'Dependencia'),
      email: String(ofi.email_institucional || '--'),
      asignacionesTotales: 0,
      entregadas: 0,
      aprobadas: 0,
      rechazadas: 0,
      pendientes: 0,
      eficaciaPct: 0,
    });
  }

  for (const r of responsablesActivos) {
    const st = String(r?.estado_entrega || '').toLowerCase();
    const obs = String(r?.observaciones_entrega || '').toUpperCase();
    const isApproved = obs.includes('[APROBADO]') || obs.includes('ESTADO:APROBADO');
    const isRejected = obs.includes('[RECHAZADO]') || obs.includes('DEVUELTO');
    const isDelivered = !isRejected && (st === 'entregado' || st === 'aprobado' || isApproved);

    if (isDelivered) oficiosEntregados++;
    else oficiosPendientes++;

    const ofiId = String(r?.oficina_id || '');
    const existing = depPerfMap.get(ofiId);
    if (existing) {
      existing.asignacionesTotales++;
      if (isDelivered) existing.entregadas++;
      else existing.pendientes++;
      if (isApproved) existing.aprobadas++;
      if (isRejected) existing.rechazadas++;
    }
  }

  // Contadores específicos y coherentes para la tarjeta "Eficacia en Peticiones"
  let aportesAprobadosCount = 0;
  let dependenciasPendientesCount = 0;

  for (const pet of peticiones) {
    const petResps = pet.peticion_responsables || [];
    const petAnexos = pet.peticion_anexos || [];

    for (const a of petAnexos) {
      const aName = String(a.nombre_archivo || '').toUpperCase();
      if (aName.includes('[APROBADO]') || a.aprobado === true) {
        aportesAprobadosCount++;
      }
    }

    for (const r of petResps) {
      const st = String(r?.estado_entrega || '').toLowerCase();
      const obs = String(r?.observaciones_entrega || '').toUpperCase();
      const isApproved = obs.includes('[APROBADO]') || obs.includes('ESTADO:APROBADO') || st === 'aprobado';
      const isRejected = obs.includes('[RECHAZADO]') || obs.includes('DEVUELTO');
      const isDelivered = !isRejected && (st === 'entregado' || isApproved);

      if (isApproved && petAnexos.length === 0) {
        aportesAprobadosCount++;
      }

      if (!pet.respondida && !isDelivered) {
        dependenciasPendientesCount++;
      }
    }
  }

  if (aportesAprobadosCount === 0 && totalRespondidas > 0) {
    aportesAprobadosCount = responsablesActivos.filter((r) => {
      const st = String(r?.estado_entrega || '').toLowerCase();
      const obs = String(r?.observaciones_entrega || '').toUpperCase();
      return st === 'entregado' || st === 'aprobado' || obs.includes('[APROBADO]');
    }).length || totalRespondidas;
  }

  const rendimientoDependencias: DependencyPerformanceRow[] = [];
  for (const row of depPerfMap.values()) {
    if (row.asignacionesTotales > 0) {
      row.eficaciaPct = Math.round((row.entregadas / row.asignacionesTotales) * 100);
      rendimientoDependencias.push(row);
    }
  }
  rendimientoDependencias.sort((a, b) => b.asignacionesTotales - a.asignacionesTotales);

  // Desglose de Cuerpos Colegiados
  let acuerdosCount = 0;
  let resolucionesCount = 0;
  let actasCount = 0;
  let otrosNormasCount = 0;
  for (const n of rawNormas) {
    const t = String(n?.tipo || '').toLowerCase();
    if (t.includes('acuerdo')) acuerdosCount++;
    else if (t.includes('resolu')) resolucionesCount++;
    else if (t.includes('acta')) actasCount++;
    else otrosNormasCount++;
  }

  const now = new Date();
  return {
    generatedAtIso: now.toISOString(),
    generatedAtBogota: formatBogotaDateTime(now),
    peticiones,
    urgentPeticiones,
    totalPeticiones,
    totalRespondidas,
    totalPendientes,
    responseRate,
    aportesAprobadosCount,
    dependenciasPendientesCount,
    oficiosEmitidos,
    oficiosEntregados,
    oficiosPendientes,
    slaSafe,
    slaWarn,
    slaDanger,
    slaSafePct,
    slaWarnPct,
    slaDangerPct,
    totalNormas: rawNormas.length,
    acuerdosCount,
    resolucionesCount,
    actasCount,
    otrosNormasCount,
    recentNormas: rawNormas.slice(0, 6),
    normas: rawNormas,
    totalConvenios: rawConvenios.length,
    convenios: rawConvenios,
    totalJuridicos: rawJuridicos.length,
    totalJuzgamiento: rawJuzgamiento.length,
    totalProgramas: rawProgramas.length,
    totalPlaneacion: rawPlaneacion.length,
    rendimientoDependencias,
    auditLogsRecientes: rawAuditLogs.slice(0, 50),
  };
}

