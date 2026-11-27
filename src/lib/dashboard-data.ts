// src/lib/dashboard-data.ts
// Fuente unificada y resiliente de métricas en tiempo real para Dashboard y Exportación Excel (.xlsx)

import { supabase, supabaseAdmin } from './supabase';
import {
  cleanAuditActionTitle,
  esEventoDeExpediente,
  formatBogotaTimestamp,
  isRelevantAuditLog,
  normalizeAuditActor,
  obtenerIniciales,
} from './audit';
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
  daysRemainingResponsable: number | null;
  hasPendingResponsables: boolean;
  responsableAlertBadge: string | null;
  drive_folder_id: string | null;
  drive_folder_url: string | null;
  hasDriveBackup: boolean;
  prioridad: string;
  estado: string;
  estadoNormalizado: 'Respondida' | 'Cerrada' | 'En Trámite' | 'Pendiente' | 'Vencida';
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

export interface MiembroConsejoAlert {
  id: string;
  nombre_completo: string;
  cuerpo_colegiado: string;
  cargo_calidad: string;
  fecha_fin: string;
  diasRestantes: number;
}

export interface PlaneacionResumen {
  id: string;
  tipo: string;
  periodo: string;
  radicado_csu: string;
  ejecucion_pct: number;
  ejecucionFormatted: string;
  estado: string;
}

export interface ConvenioAlert {
  id: string;
  numero: string;
  entidad: string;
  tipo_label: string;
  fin: string;
  cuantiaFormatted: string;
  diasRestantes: number;
  estado: string;
}

export interface JuzgamientoAlert {
  id: string;
  radicado: string;
  implicado: string;
  etapa_procesal: string;
  segunda_instancia: string;
  dias_restantes: number | null;
  estado: string;
}

export interface DashboardAuditItem {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: string;
  initials: string;
  actionTitle: string;
  entity: string;
  entityId: string;
  actionType: string;
  esExpediente: boolean;
  esEliminacion: boolean;
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
  peticionesEstados: {
    respondidas: number;
    cerradas: number;
    enTramite: number;
    pendientes: number;
    vencidas: number;
  };
  peticionesConDriveCount: number;
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
  normasPorOrgano: {
    csu: number;
    ca: number;
    rectoria: number;
    otros: number;
  };
  normasVigentesCount: number;
  normasPorAnio: Array<{ anio: string; count: number }>;
  recentNormas: any[];
  normas: any[];
  miembrosActivosCount: number;
  miembrosArchivoCount: number;
  miembrosProximosVencer: MiembroConsejoAlert[];
  totalConvenios: number;
  conveniosActivosCount: number;
  conveniosProximosVencerCount: number;
  conveniosCuantiaTotal: number;
  conveniosCuantiaFormateada: string;
  conveniosAlertas: ConvenioAlert[];
  convenios: any[];
  totalJuridicos: number;
  totalJuridicoCarpetas: number;
  juridicosPorCategoria: {
    conceptos_internos: number;
    litigios_judiciales: number;
    auditoria_entes_control: number;
  };
  recentJuridicoDocs: Array<{
    id: string;
    titulo: string;
    categoria_raiz: string;
    anio: number | null;
  }>;
  totalJuzgamiento: number;
  juzgamientoActivosCount: number;
  juzgamientoSegundaInstanciaCount: number;
  juzgamientoProximosVencerCount: number;
  juzgamientoAlertas: JuzgamientoAlert[];
  totalProgramas: number;
  programasActivosCount: number;
  totalPlaneacion: number;
  ultimoInformePlaneacion: PlaneacionResumen | null;
  rendimientoDependencias: DependencyPerformanceRow[];
  auditLogsRecientes: any[];
  auditActividadReciente: DashboardAuditItem[];
}

async function safeSelectAll(table: string, orderCol?: string, ascending = false): Promise<any[]> {
  const dbClient = (supabaseAdmin || supabase) as any;

  const queryWithClient = async (client: any): Promise<{ data: any[] | null; error: any }> => {
    if (orderCol) {
      const ordered = await (client
        .from(table as any)
        .select('*')
        .order(orderCol, { ascending }) as any);
      if (!ordered.error && Array.isArray(ordered.data)) {
        return { data: ordered.data, error: null };
      }
    }
    const plain = await (client.from(table as any).select('*') as any);
    return {
      data: !plain.error && Array.isArray(plain.data) ? plain.data : null,
      error: plain.error || null,
    };
  };

  try {
    const primary = await queryWithClient(dbClient);
    if (!primary.error && Array.isArray(primary.data)) {
      return primary.data;
    }
    if (dbClient !== supabase) {
      const fallback = await queryWithClient(supabase);
      if (!fallback.error && Array.isArray(fallback.data)) {
        return fallback.data;
      }
    }
    return [];
  } catch (err) {
    console.warn(`[Dashboard] Consulta segura fallida en tabla '${table}':`, err);
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

function parseCopAmount(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const str = String(raw ?? '').trim();
  if (!str) return 0;
  // Quitar símbolo de moneda, espacios y separadores de miles
  const digitsOnly = str.replace(/[^\d]/g, '');
  if (!digitsOnly) return 0;
  const parsed = Number(digitsOnly);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCopCurrency(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(safe);
  return `${formatted} COP`;
}

function normalizePeticionState(
  rawEstado: string | null | undefined,
  respondida: boolean,
  daysRemaining: number | null
): 'Respondida' | 'Cerrada' | 'En Trámite' | 'Pendiente' | 'Vencida' {
  const st = String(rawEstado || '').toLowerCase().trim();
  if (st === 'cerrada' || st === 'cerrado' || st === 'finalizada' || st === 'finalizado') {
    return 'Cerrada';
  }
  if (respondida || st === 'respondida' || st === 'respondido' || st === 'resuelta' || st === 'completada') {
    return 'Respondida';
  }
  if (st === 'vencida' || st === 'vencido' || (daysRemaining !== null && daysRemaining < 0)) {
    return 'Vencida';
  }
  if (st === 'pendiente') {
    return 'Pendiente';
  }
  return 'En Trámite';
}

function computeSlaProgressForDoc(
  pet: any,
  todayYmd: string,
  hasPendingResponsables: boolean
): DashboardPriorityDoc['progress'] & {
  statusCategory: 'safe' | 'warn' | 'danger';
  daysRemainingResponsable: number | null;
  responsableAlertBadge: string | null;
} {
  const limitYmd = normalizeYmd(pet.fecha_limite_entrega);
  const respYmd = normalizeYmd(pet.fecha_limite_responsable);
  const effectiveLimitYmd = limitYmd || respYmd;
  const startYmd = normalizeYmd(pet.fecha_radicacion || pet.created_at) || todayYmd;

  const daysRemainingResponsable = respYmd ? diffDaysYmd(respYmd, todayYmd) : null;
  let responsableAlertBadge: string | null = null;
  if (daysRemainingResponsable !== null && hasPendingResponsables) {
    if (daysRemainingResponsable < 0) {
      responsableAlertBadge = `Resp. vencido (${Math.abs(daysRemainingResponsable)}d)`;
    } else if (daysRemainingResponsable === 0) {
      responsableAlertBadge = 'Resp. vence hoy';
    } else if (daysRemainingResponsable <= 3) {
      responsableAlertBadge = `Resp. en ${daysRemainingResponsable}d`;
    }
  }

  if (!effectiveLimitYmd) {
    return {
      percentage: 10,
      statusClass: 'badge-green',
      statusBadge: 'En Trámite',
      daysRemaining: 10,
      statusCategory: 'safe',
      daysRemainingResponsable,
      responsableAlertBadge,
    };
  }

  const daysRemaining = diffDaysYmd(effectiveLimitYmd, todayYmd);
  const totalSpan = Math.max(1, diffDaysYmd(effectiveLimitYmd, startYmd));
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
      daysRemainingResponsable,
      responsableAlertBadge,
    };
  }
  if (daysRemaining === 0) {
    return {
      percentage: 100,
      statusClass: 'badge-danger',
      statusBadge: 'Vence Hoy',
      daysRemaining: 0,
      statusCategory: 'danger',
      daysRemainingResponsable,
      responsableAlertBadge,
    };
  }
  if (bucket === 'critical' || daysRemaining <= 2) {
    return {
      percentage: Math.max(percentage, 80),
      statusClass: 'badge-danger',
      statusBadge: `Crítico (${daysRemaining}d)`,
      daysRemaining,
      statusCategory: 'danger',
      daysRemainingResponsable,
      responsableAlertBadge,
    };
  }
  if (
    bucket === 'warn' ||
    percentage >= 50 ||
    (daysRemainingResponsable !== null && hasPendingResponsables && daysRemainingResponsable < 0)
  ) {
    return {
      percentage: Math.max(percentage, 50),
      statusClass: 'badge-warn',
      statusBadge: `Próximo (${daysRemaining}d)`,
      daysRemaining,
      statusCategory: 'warn',
      daysRemainingResponsable,
      responsableAlertBadge,
    };
  }
  return {
    percentage,
    statusClass: 'badge-green',
    statusBadge: `En Término (${daysRemaining}d)`,
    daysRemaining,
    statusCategory: 'safe',
    daysRemainingResponsable,
    responsableAlertBadge,
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
    rawMiembros,
    rawConvenios,
    rawJuridicoCarpetas,
    rawJuridicoDocs,
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
    safeSelectAll('colegiados_normas', 'created_at', false),
    safeSelectAll('miembros_consejo', 'fecha_fin', true),
    safeSelectAll('convenios', 'created_at', false),
    safeSelectAll('juridico_carpetas', 'created_at', false),
    safeSelectAll('juridico_documentos', 'created_at', false),
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

  const peticionesEstados = {
    respondidas: 0,
    cerradas: 0,
    enTramite: 0,
    pendientes: 0,
    vencidas: 0,
  };
  let peticionesConDriveCount = 0;

  for (const pet of peticiones) {
    if (pet.drive_folder_id) {
      peticionesConDriveCount++;
    }

    const petResps = pet.peticion_responsables || [];
    const hasPendingResponsables =
      petResps.length === 0
        ? !pet.respondida
        : petResps.some((r: any) => {
            const st = String(r?.estado_entrega || '').toLowerCase();
            const obs = String(r?.observaciones_entrega || '').toUpperCase();
            const isApproved = obs.includes('[APROBADO]') || obs.includes('ESTADO:APROBADO') || st === 'aprobado';
            const isRejected = obs.includes('[RECHAZADO]') || obs.includes('DEVUELTO');
            const isDelivered = !isRejected && (st === 'entregado' || isApproved);
            return !isDelivered;
          });

    const calc = computeSlaProgressForDoc(pet, todayYmd, hasPendingResponsables);
    const estNorm = normalizePeticionState(pet.estado, pet.respondida, calc.daysRemaining);
    if (estNorm === 'Cerrada') peticionesEstados.cerradas++;
    else if (estNorm === 'Respondida') peticionesEstados.respondidas++;
    else if (estNorm === 'Vencida') peticionesEstados.vencidas++;
    else if (estNorm === 'Pendiente') peticionesEstados.pendientes++;
    else peticionesEstados.enTramite++;

    if (pet.respondida) continue;

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
      daysRemainingResponsable: calc.daysRemainingResponsable,
      hasPendingResponsables,
      responsableAlertBadge: calc.responsableAlertBadge,
      drive_folder_id: pet.drive_folder_id ? String(pet.drive_folder_id) : null,
      drive_folder_url: pet.drive_folder_url ? String(pet.drive_folder_url) : null,
      hasDriveBackup: Boolean(pet.drive_folder_id),
      prioridad: pet.prioridad || 'Media',
      estado: pet.estado || 'en_tramite',
      estadoNormalizado: estNorm,
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

  // Ordenar Reparto Prioritario: menor días restantes primero (teniendo en cuenta vencimiento de responsable si es más próximo)
  urgentPeticiones.sort((a, b) => {
    const aEff =
      a.hasPendingResponsables && a.daysRemainingResponsable !== null
        ? Math.min(a.progress.daysRemaining, a.daysRemainingResponsable)
        : a.progress.daysRemaining;
    const bEff =
      b.hasPendingResponsables && b.daysRemainingResponsable !== null
        ? Math.min(b.progress.daysRemaining, b.daysRemainingResponsable)
        : b.progress.daysRemaining;
    return aEff - bEff;
  });

  const activeTotal = slaSafe + slaWarn + slaDanger;
  const slaSafePct = activeTotal > 0 ? Math.round((slaSafe / activeTotal) * 100) : totalPeticiones > 0 ? 100 : 0;
  const slaWarnPct = activeTotal > 0 ? Math.round((slaWarn / activeTotal) * 100) : 0;
  const slaDangerPct = activeTotal > 0 ? Math.max(0, 100 - slaSafePct - slaWarnPct) : 0;

  // Oficios emitidos vs entregados/pendientes (asignaciones a dependencias de radicados activos exclusivamente)
  const oficiosEmitidos = responsablesActivos.length;
  let oficiosEntregados = 0;
  let oficiosPendientes = 0;

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
    aportesAprobadosCount =
      responsablesActivos.filter((r) => {
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

  // =========================================================================
  // CUERPOS COLEGIADOS (colegiados_normas)
  // =========================================================================
  let acuerdosCount = 0;
  let resolucionesCount = 0;
  let actasCount = 0;
  let otrosNormasCount = 0;
  let normasVigentesCount = 0;
  const normasPorOrgano = { csu: 0, ca: 0, rectoria: 0, otros: 0 };
  const anioCounts = new Map<string, number>();

  const normalizedNormas = (rawNormas || []).map((n: any) => {
    const tipo = String(n?.tipo_acto || n?.tipo || 'Acto').trim();
    const numero = String(n?.numero_acto || n?.numero || '--').trim();
    const fecha = normalizeYmd(n?.fecha_expedicion || n?.fecha) || '--';
    const anioVal =
      n?.anio != null && Number(n.anio) > 0
        ? String(n.anio)
        : n?.year
          ? String(n.year).trim()
          : fecha !== '--'
            ? fecha.slice(0, 4)
            : '';
    const organo = String(n?.cuerpo_colegiado || n?.organo || '').trim();
    const organoCodeRaw = String(n?.organo_code || '').toLowerCase().trim();
    const organoText = `${organoCodeRaw} ${organo}`.toLowerCase();
    const vigencia = String(n?.vigencia || 'Vigente').trim();
    const titulo = String(n?.asunto || n?.titulo || 'Sin título').trim();

    const tipoLower = tipo.toLowerCase();
    if (tipoLower.includes('acuerdo')) acuerdosCount++;
    else if (tipoLower.includes('resolu')) resolucionesCount++;
    else if (tipoLower.includes('acta')) actasCount++;
    else otrosNormasCount++;

    if (/vigente/i.test(vigencia) && !/derogad/i.test(vigencia)) {
      normasVigentesCount++;
    }

    if (organoCodeRaw === 'csu' || organoText.includes('superior')) {
      normasPorOrgano.csu++;
    } else if (organoCodeRaw === 'ca' || organoText.includes('académico') || organoText.includes('academico')) {
      normasPorOrgano.ca++;
    } else if (organoCodeRaw === 'rectoria' || organoText.includes('rector')) {
      normasPorOrgano.rectoria++;
    } else {
      normasPorOrgano.otros++;
    }

    if (anioVal) {
      anioCounts.set(anioVal, (anioCounts.get(anioVal) || 0) + 1);
    }

    return {
      ...n,
      tipo,
      numero,
      fecha,
      anio: anioVal,
      organo: organo || (organoCodeRaw === 'csu' ? 'CSU' : organoCodeRaw === 'ca' ? 'Consejo Académico' : organoCodeRaw === 'rectoria' ? 'Rectoría' : 'Institucional'),
      organo_code: organoCodeRaw,
      vigencia,
      titulo,
    };
  });

  normalizedNormas.sort((a: any, b: any) => {
    const da = a.fecha !== '--' ? a.fecha : normalizeYmd(a.created_at) || '';
    const db = b.fecha !== '--' ? b.fecha : normalizeYmd(b.created_at) || '';
    return db.localeCompare(da);
  });

  const normasPorAnio = Array.from(anioCounts.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 4)
    .map(([anio, count]) => ({ anio, count }));

  // =========================================================================
  // MIEMBROS DE CONSEJO (miembros_consejo) — Solo activos vigentes con alerta <= 30d
  // =========================================================================
  let miembrosActivosCount = 0;
  let miembrosArchivoCount = 0;
  const miembrosProximosVencer: MiembroConsejoAlert[] = [];

  for (const m of rawMiembros || []) {
    const estadoLower = String(m?.estado || 'activo').toLowerCase().trim();
    const fechaFinYmd = normalizeYmd(m?.fecha_fin);
    const diasRestantes = fechaFinYmd ? diffDaysYmd(fechaFinYmd, todayYmd) : 999;
    const isManuallyArchived = estadoLower === 'inactivo' || estadoLower === 'archivado';
    const isExpired = Boolean(fechaFinYmd) && diasRestantes < 0;

    if (isManuallyArchived || isExpired) {
      miembrosArchivoCount++;
      continue;
    }

    // Estictamente activo (estado === 'activo' y fecha_fin >= hoy o sin fecha_fin vencida)
    miembrosActivosCount++;
    if (Boolean(fechaFinYmd) && diasRestantes >= 0 && diasRestantes <= 30) {
      miembrosProximosVencer.push({
        id: String(m.id || ''),
        nombre_completo: String(m.nombre_completo || 'Miembro Registrado'),
        cuerpo_colegiado: String(m.cuerpo_colegiado || 'Consejo'),
        cargo_calidad: String(m.cargo_calidad || 'Representante'),
        fecha_fin: fechaFinYmd,
        diasRestantes,
      });
    }
  }
  miembrosProximosVencer.sort((a, b) => a.diasRestantes - b.diasRestantes);

  // =========================================================================
  // ASUNTOS JURÍDICOS (juridico_carpetas + juridico_documentos)
  // =========================================================================
  const juridicosPorCategoria = {
    conceptos_internos: 0,
    litigios_judiciales: 0,
    auditoria_entes_control: 0,
  };
  for (const doc of rawJuridicoDocs || []) {
    const cat = String(doc?.categoria_raiz || '').toLowerCase().trim();
    if (cat === 'conceptos_internos') juridicosPorCategoria.conceptos_internos++;
    else if (cat === 'litigios_judiciales') juridicosPorCategoria.litigios_judiciales++;
    else if (cat === 'auditoria_entes_control') juridicosPorCategoria.auditoria_entes_control++;
  }
  const recentJuridicoDocs = (rawJuridicoDocs || []).slice(0, 3).map((d: any) => ({
    id: String(d.id || ''),
    titulo: String(d.titulo || d.archivo_nombre || 'Documento Jurídico'),
    categoria_raiz: String(d.categoria_raiz || 'conceptos_internos'),
    anio: typeof d.anio === 'number' ? d.anio : null,
  }));

  // =========================================================================
  // FASE DE JUZGAMIENTO DISCIPLINARIO (juzgamiento_procesos)
  // =========================================================================
  let juzgamientoActivosCount = 0;
  let juzgamientoSegundaInstanciaCount = 0;
  let juzgamientoProximosVencerCount = 0;
  const juzgamientoAlertas: JuzgamientoAlert[] = [];

  for (const j of rawJuzgamiento || []) {
    const estadoStr = String(j?.estado || 'En Términos').trim();
    const isClosed = /finaliz|cerrad|archivad|terminad|fallo ejecut|resuelt/i.test(estadoStr);
    const etapa = String(j?.etapa_procesal || '').trim();
    const segInst = String(j?.segunda_instancia || '').trim();
    const dias = j?.dias_restantes !== null && j?.dias_restantes !== undefined ? Number(j.dias_restantes) : null;

    if (!isClosed) {
      juzgamientoActivosCount++;
      if (/segunda/i.test(etapa) || (segInst && !/^no aplica$/i.test(segInst))) {
        juzgamientoSegundaInstanciaCount++;
      }
      if (dias !== null && Number.isFinite(dias) && dias <= 5) {
        juzgamientoProximosVencerCount++;
      }
      juzgamientoAlertas.push({
        id: String(j.id || ''),
        radicado: String(j.radicado || '--'),
        implicado: String(j.implicado || 'Sujeto Procesal'),
        etapa_procesal: etapa || 'En Sustanciación',
        segunda_instancia: segInst,
        dias_restantes: dias !== null && Number.isFinite(dias) ? dias : null,
        estado: estadoStr,
      });
    }
  }
  juzgamientoAlertas.sort((a, b) => (a.dias_restantes ?? 999) - (b.dias_restantes ?? 999));

  // =========================================================================
  // PLANEACIÓN Y GESTIÓN CSU (planeacion_informes)
  // =========================================================================
  const latestPlan = (rawPlaneacion || [])[0];
  const ultimoInformePlaneacion: PlaneacionResumen | null = latestPlan
    ? {
        id: String(latestPlan.id || ''),
        tipo: String(latestPlan.tipo || 'Informe'),
        periodo: String(latestPlan.periodo || 'Periodo vigente'),
        radicado_csu: String(latestPlan.radicado_csu || '--'),
        ejecucion_pct: Number(latestPlan.ejecucion_pct ?? 0) || 0,
        ejecucionFormatted: `${Number(latestPlan.ejecucion_pct ?? 0) || 0}%`,
        estado: String(latestPlan.estado || 'Radicado'),
      }
    : null;

  // =========================================================================
  // RELACIONAMIENTO INSTITUCIONAL Y CONVENIOS (convenios)
  // =========================================================================
  let conveniosActivosCount = 0;
  let conveniosProximosVencerCount = 0;
  let conveniosCuantiaTotal = 0;
  const conveniosAlertas: ConvenioAlert[] = [];

  for (const c of rawConvenios || []) {
    const estadoStr = String(c?.estado || 'Activo').trim();
    const isClosed = /terminad|liquidad|finaliz|inactiv|suspend|vencid/i.test(estadoStr);
    const amount = parseCopAmount(c?.cuantia);
    conveniosCuantiaTotal += amount;

    const finYmd = normalizeYmd(c?.fin);
    const dias = finYmd ? diffDaysYmd(finYmd, todayYmd) : 999;

    if (!isClosed) {
      conveniosActivosCount++;
      if (Boolean(finYmd) && dias <= 30) {
        conveniosProximosVencerCount++;
      }
      conveniosAlertas.push({
        id: String(c.id || ''),
        numero: String(c.numero || '--'),
        entidad: String(c.entidad || 'Entidad Aliada'),
        tipo_label: String(c.tipo_label || c.tipo || 'Convenio'),
        fin: finYmd || '--',
        cuantiaFormatted: formatCopCurrency(amount),
        diasRestantes: dias,
        estado: estadoStr,
      });
    }
  }
  conveniosAlertas.sort((a, b) => a.diasRestantes - b.diasRestantes);
  const conveniosCuantiaFormateada = formatCopCurrency(conveniosCuantiaTotal);

  // =========================================================================
  // PROGRAMAS ACADÉMICOS (programas_academicos)
  // =========================================================================
  const programasActivosCount = (rawProgramas || []).filter((p: any) => {
    const est = String(p?.estado || 'Activo').toLowerCase();
    return !/inactiv|cerrad|suspend/i.test(est);
  }).length;

  // =========================================================================
  // ACTIVIDAD RECIENTE DE AUDITORÍA (audit_logs reales sin fallback ficticio)
  // =========================================================================
  const auditActividadReciente: DashboardAuditItem[] = (rawAuditLogs || [])
    .filter((log: any) => isRelevantAuditLog(log))
    .slice(0, 8)
    .map((log: any) => {
      const normalizedActor = normalizeAuditActor({
        id: log.actor_id,
        name: log.actor_name,
        role: log.actor_role,
      });
      const actionTitle = cleanAuditActionTitle(log.action);
      const entity = String(log.entity || 'Sistema Institucional')
        .replace(/Catálogo de Roles RBAC/gi, 'Configuración de Roles')
        .replace(/Roles RBAC/gi, 'Roles del Sistema')
        .replace(/\bRBAC\b/g, 'del Sistema')
        .trim();
      const esExpediente = esEventoDeExpediente({
        entity: log.entity,
        entity_id: log.entity_id,
        action: log.action,
      });
      const actionType = String(log.action_type || 'SISTEMA').toUpperCase();
      const esEliminacion =
        actionType.includes('ELIMINA') || /eliminaci[oó]n|eliminado|borrado/i.test(actionTitle);

      return {
        id: String(log.id || ''),
        timestamp: formatBogotaTimestamp(log.raw_timestamp || log.created_at),
        actorName: normalizedActor.name,
        actorRole: normalizedActor.role,
        initials: obtenerIniciales(normalizedActor.name),
        actionTitle,
        entity,
        entityId: String(log.entity_id || ''),
        actionType,
        esExpediente,
        esEliminacion,
      };
    });

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
    peticionesEstados,
    peticionesConDriveCount,
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
    totalNormas: normalizedNormas.length,
    acuerdosCount,
    resolucionesCount,
    actasCount,
    otrosNormasCount,
    normasPorOrgano,
    normasVigentesCount,
    normasPorAnio,
    recentNormas: normalizedNormas.slice(0, 6),
    normas: normalizedNormas,
    miembrosActivosCount,
    miembrosArchivoCount,
    miembrosProximosVencer,
    totalConvenios: (rawConvenios || []).length,
    conveniosActivosCount,
    conveniosProximosVencerCount,
    conveniosCuantiaTotal,
    conveniosCuantiaFormateada,
    conveniosAlertas,
    convenios: rawConvenios || [],
    totalJuridicos: (rawJuridicoDocs || []).length,
    totalJuridicoCarpetas: (rawJuridicoCarpetas || []).length,
    juridicosPorCategoria,
    recentJuridicoDocs,
    totalJuzgamiento: (rawJuzgamiento || []).length,
    juzgamientoActivosCount,
    juzgamientoSegundaInstanciaCount,
    juzgamientoProximosVencerCount,
    juzgamientoAlertas,
    totalProgramas: (rawProgramas || []).length,
    programasActivosCount,
    totalPlaneacion: (rawPlaneacion || []).length,
    ultimoInformePlaneacion,
    rendimientoDependencias,
    auditLogsRecientes: (rawAuditLogs || []).slice(0, 50),
    auditActividadReciente,
  };
}
