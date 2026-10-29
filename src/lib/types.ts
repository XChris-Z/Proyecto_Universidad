// src/lib/types.ts
// Interfaces y tipos globales del SGD Unitrópico

// ──────────────────────────────────────────────
// Permisos y Roles
// ──────────────────────────────────────────────

export type PermissionCategory = 'Consulta' | 'Operación' | 'Gestión' | 'Configuración' | 'Seguridad';

export interface Permission {
  id: string;
  label: string;
  desc: string;
  category: PermissionCategory;
}

export interface SystemRole {
  id: string;
  code: string;
  name: string;
  level: number;
  levelName: string;
  desc: string;
  color: string;
  isProtected: boolean;
  permissions: string[];
}

// ──────────────────────────────────────────────
// Usuarios
// ──────────────────────────────────────────────

export interface InstitutionalUser {
  id: string;
  name: string;
  role: string;
  roleId: string;
  email: string;
  /** Solo para datos mock de Fase 1. Se eliminará con Supabase Auth en Fase 3. */
  password: string;
  initials: string;
  avatarColor: string;
}

/** Payload guardado en localStorage / sessionStorage durante Fase 1 */
export interface SessionPayload {
  userId: string;
  email: string;
  loggedAt: string;
}

// ──────────────────────────────────────────────
// Documentos y Expedientes
// ──────────────────────────────────────────────

export type DocumentFormat = 'pdf' | 'docx' | 'xlsx';
export type DocumentPriority = 'Alta' | 'Media' | 'Baja';
export type ResponseStatus = 'pendiente' | 'respondida';

export interface DocumentResponse {
  radicado: string;
  date: string;
  subject: string;
  templateTitle: string;
  decision: string;
  content: string;
  respondedBy: string;
  signedName: string;
  signedRole: string;
  createdAt: string;
}

export interface Document {
  id: string;
  radicado: string;
  title: string;
  category: string;
  originRight: string;
  applicant: string;
  applicantType: string;
  slaDays: number;
  fileName: string;
  format: DocumentFormat;
  size: string;
  uploadDate: string;
  dueDate: string;
  responsibleId: string;
  priority: DocumentPriority;
  notes: string;
  status: string;
  responseStatus: ResponseStatus;
  response: DocumentResponse | null;
}

export interface ResponseTemplate {
  id: string;
  title: string;
  category: string;
  decision: string;
  subject: string;
  content: string;
}

// ──────────────────────────────────────────────
// Normatividad (Cuerpos Colegiados)
// ──────────────────────────────────────────────

export type OrganoCode = 'csu' | 'ca' | 'rectoria' | 'electoral';

export interface ColegiadoNorma {
  id: string;
  organo: string;
  organoCode: OrganoCode;
  tipo: string;
  numero: string;
  year: string;
  fecha: string;
  titulo: string;
  descriptor: string;
  vigencia: string;
  resumen: string;
  signatarios: string;
  fileDownload: string;
}

// ──────────────────────────────────────────────
// Asuntos Jurídicos
// ──────────────────────────────────────────────

export interface Concepto {
  id: string;
  tipo: string;
  radicado: string;
  fecha: string;
  asunto: string;
  solicitante: string;
  sentido: string;
  resumen: string;
}

export interface Litigio {
  id: string;
  radicado: string;
  tipo: string;
  despacho: string;
  demandante: string;
  demandado: string;
  cuantia: string;
  riesgo: string;
  etapa: string;
  resumen: string;
  estado: string;
}

export interface AuditoriaJuridica {
  id: string;
  ente: string;
  tipo: string;
  vigenciaAuditada: string;
  fechaInforme: string;
  hallazgosTotales: number;
  hallazgosFiscales: number;
  hallazgosDisciplinarios: number;
  hallazgosAdministrativos: number;
  planMejoramientoAvance: number;
  resumen: string;
  estado: string;
}

export interface Directiva {
  id: string;
  tipo: string;
  numero: string;
  fecha: string;
  asunto: string;
  emisor: string;
  estado: string;
}

export interface Brecha {
  id: string;
  normaRequerida: string;
  mandatoNacional: string;
  organoCompetente: string;
  urgencia: string;
  estadoFormulacion: string;
  avancePct: number;
  justificacion: string;
  fechaLimite: string;
}

export interface AsuntosJuridicosData {
  conceptos: Concepto[];
  litigios: Litigio[];
  auditorias: AuditoriaJuridica[];
  directivas: Directiva[];
  brechas: Brecha[];
}

// ──────────────────────────────────────────────
// Juzgamiento Disciplinario
// ──────────────────────────────────────────────

export interface JuzgamientoCase {
  id: string;
  radicado: string;
  implicado: string;
  cargo: string;
  tipoActo: string;
  etapaProcesal: string;
  conducta: string;
  fechaNotificacion: string;
  vencimientoTermino: string;
  segundaInstancia: string;
  estado: string;
  diasRestantes: number;
}

// ──────────────────────────────────────────────
// Planeación y Gestión CSU
// ──────────────────────────────────────────────

export interface InformeFinanciero {
  mes: string;
  radicadoCSU: string;
  fechaPresentacion: string;
  ingresosTotales: string;
  gastosEjecutados: string;
  ejecucionPct: number;
  estadoAprobacion: string;
  observaciones: string;
  descarga: string;
}

export interface InformeRectoral {
  id: string;
  periodo: string;
  radicadoCSU: string;
  fechaCSU: string;
  avanceMetasPDI: string;
  ejePrincipal: string;
  resumenEjecutivo: string;
  estadoCSU: string;
}

export interface MetaPDI {
  nombre: string;
  cumplimiento: number;
  estado: string;
}

export interface PlaneacionData {
  informesFinancieros: InformeFinanciero[];
  informesRectorales: InformeRectoral[];
  metasPDI: MetaPDI[];
}

// ──────────────────────────────────────────────
// Calendario
// ──────────────────────────────────────────────

export type CalendarioEventType = 'colegiado' | 'reporte' | 'financiero' | 'academica';
export type EventUrgency = 'danger' | 'warning' | 'safe';

export interface CalendarioEvent {
  id: string;
  titulo: string;
  tipo: CalendarioEventType;
  fecha: string;
  destino: string;
  responsable: string;
  urgencia: EventUrgency;
  diasRestantes: number;
  descripcion: string;
}

// ──────────────────────────────────────────────
// Programas Académicos
// ──────────────────────────────────────────────

export interface ProgramaHistorial {
  id: string;
  nombre: string;
  snies: string;
  nivel: string;
  facultad: string;
  modalidad: string;
  creditos: number;
  actoTipo: string;
  actoNumero: string;
  fechaActo: string;
  vigenciaAnios: string;
  estadoRegistro: string;
  acreditacionAltaCalidad: boolean;
  cnaResolucion: string;
  observaciones: string;
}

export interface ProgramaSACES {
  id: string;
  programa: string;
  tramite: string;
  radicadoSACES: string;
  fechaRadicacion: string;
  salaCONACES: string;
  etapaActual: string;
  paresAsignados: string;
  estado: string;
}

export interface ProgramaAcreditacion {
  programa: string;
  tipo: string;
  resolucionMEN: string;
  vigencia: string;
  estado: string;
  puntajePares: string;
  aspectosDestacados: string;
}

export interface ProgramasAcademicos {
  historial: ProgramaHistorial[];
  saces: ProgramaSACES[];
  acreditacion: ProgramaAcreditacion[];
}

// ──────────────────────────────────────────────
// Convenios e Instituciones
// ──────────────────────────────────────────────

export type ConvenioTipo = 'gubernamental' | 'internacional' | 'nacional';

export interface Convenio {
  id: string;
  tipo: ConvenioTipo;
  tipoLabel: string;
  numero: string;
  entidad: string;
  objeto: string;
  inicio: string;
  fin: string;
  cuantia: string;
  supervisor: string;
  estado: string;
  archivoMinuta: string;
}

export type ConvenioItem = Convenio;

// ──────────────────────────────────────────────
// Dependencias Universitarias
// ──────────────────────────────────────────────

export interface DependenciaFuncionario {
  id: string;
  nombre: string;
  cargo: string;
  email: string;
  ext: string;
}

export type FuncionarioItem = DependenciaFuncionario;

export interface Dependencia {
  id: string;
  codigo: string;
  nombre: string;
  nivel: string;
  jefe: string;
  jefeCargo: string;
  correo: string;
  ext: string;
  color: string;
  competencias: string;
  archivosActivos: number;
  funcionarios: DependenciaFuncionario[];
}

export type DependenciaItem = Dependencia;

// ──────────────────────────────────────────────
// Auditoría y Trazabilidad
// ──────────────────────────────────────────────

export type AuditSeverity = 'INFO' | 'WARN' | 'CRITICAL';
export type AuditActionType =
  | 'SEGURIDAD'
  | 'ELIMINACION'
  | 'MODIFICACION'
  | 'RESPUESTA'
  | 'SUBIDA_ARCHIVO'
  | 'ACCESO'
  | 'GESTION';

export interface AuditLogActor {
  id: string;
  name: string;
  role: string;
  initials: string;
  avatarColor: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  rawTimestamp: string;
  actor: AuditLogActor;
  action: string;
  actionType: AuditActionType;
  entity: string;
  entityId: string;
  details: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  severity: AuditSeverity;
  integrityHash: string;
  previousHash: string;
  ip: string;
  cipher: string;
}

// ──────────────────────────────────────────────
// Utilidades de UI
// ──────────────────────────────────────────────

export interface DeadlineProgress {
  percentage: number;
  daysRemaining: number;
  statusClass: string;
  statusBadge: string;
}

// ──────────────────────────────────────────────
// Módulo Subir Petición y Portal Externo (Fase 2 & 3)
// ──────────────────────────────────────────────

export type RolSistema = 'admin' | 'funcionario';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: RolSistema;
  avatar_url?: string | null;
  is_provisional_password: boolean;
  phone?: string | null;
  cargo?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Oficina {
  id: string;
  codigo: string;
  nombre: string;
  email_institucional: string;
  titular_cargo?: string | null;
  activo: boolean;
}

export interface Peticion {
  id: string;
  numero_radicado: string;
  asunto: string;
  descripcion?: string | null;
  solicitante_nombre: string;
  solicitante_email?: string | null;
  solicitante_tipo: string;
  categoria: string;
  prioridad: 'Alta' | 'Media' | 'Baja';
  estado: 'En Trámite' | 'Revisión' | 'Respondida' | 'Vencida';
  fecha_radicacion: string;
  fecha_limite_entrega: string;
  fecha_limite_responsable: string;
  storage_folder_path: string;
  creado_por?: string | null;
  created_at: string;
  updated_at: string;
  responsables?: PeticionResponsable[];
}

export interface PeticionResponsable {
  id: string;
  peticion_id: string;
  oficina_id: string;
  codigo_acceso: string;
  fecha_expiracion_codigo: string;
  storage_subfolder_path: string;
  estado_entrega: 'Pendiente' | 'Entregado' | 'Extemporáneo';
  fecha_entrega?: string | null;
  observaciones_entrega?: string | null;
  email_enviado_at?: string | null;
  oficina?: Oficina;
}

export interface PeticionAnexo {
  id: string;
  peticion_id: string;
  peticion_responsable_id?: string | null;
  nombre_archivo: string;
  storage_path: string;
  tamano_bytes?: number | null;
  mime_type?: string | null;
  subido_por_email: string;
  es_anexo_oficina: boolean;
  created_at: string;
}

export interface PortalValidationResult {
  success: boolean;
  code?: 'INVALID_CREDENTIALS' | 'EXPIRED_DEADLINE';
  message?: string;
  responsable_id?: string;
  peticion_id?: string;
  numero_radicado?: string;
  oficina_nombre?: string;
  email_institucional?: string;
  asunto?: string;
  descripcion?: string;
  fecha_limite_responsable?: string;
  fecha_limite_entrega?: string;
  storage_subfolder_path?: string;
  estado_entrega?: 'Pendiente' | 'Entregado' | 'Extemporáneo';
}


