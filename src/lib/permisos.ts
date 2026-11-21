// src/lib/permisos.ts
// Catálogo maestro único RBAC (14 módulos institucionales, 4 grupos y permisos granulares)
// Fuente de verdad para modales, menú lateral, guards SSR y endpoints API

import type { SystemRole } from './types';

export interface ModuloAccionDef {
  id: string;
  label: string;
  desc?: string;
}

export interface ModuloSistemaDef {
  id: string;
  label: string;
  href: string;
  sidebarId: string;
  groupKey: 'operativo' | 'gobernanza' | 'academica' | 'administracion';
  groupLabel: string;
  description: string;
  icon: string;
  acciones: ModuloAccionDef[];
  isSensitive?: boolean;
}

export const GRUPOS_MODULOS = [
  { key: 'operativo', label: '1. Gestión Operativa y Expedientes', isSensitive: false },
  { key: 'gobernanza', label: '2. Gobernanza, Consejos y Jurídico', isSensitive: false },
  { key: 'academica', label: '3. Gestión Académica e Institucional', isSensitive: false },
  { key: 'administracion', label: '4. Administración y Control del Sistema', isSensitive: true },
] as const;

/**
 * CATÁLOGO MAESTRO ÚNICO: 14 módulos controlables organizados en 4 grupos claros.
 * Nota: "Mi Perfil" (/perfil) queda siempre libre para todo usuario autenticado.
 */
export const MODULOS_SISTEMA: ModuloSistemaDef[] = [
  // ─────────────────────────────────────────────────────────────
  // 1. Gestión Operativa y Expedientes
  // ─────────────────────────────────────────────────────────────
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    sidebarId: 'nav-dashboard',
    groupKey: 'operativo',
    groupLabel: 'Gestión Operativa y Expedientes',
    description: 'Panel ejecutivo, métricas KPI, gráficos y exportación oficial a Excel.',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    acciones: [
      { id: 'ver', label: 'Ver Dashboard y Métricas', desc: 'Acceso y consulta a los indicadores y métricas de gestión.' },
    ],
  },
  {
    id: 'archivos',
    label: 'Carpetas de Radicados',
    href: '/archivos',
    sidebarId: 'nav-archivos',
    groupKey: 'operativo',
    groupLabel: 'Gestión Operativa y Expedientes',
    description: 'Carpetas de radicados, revisión de aportes, cierre interno, prórrogas y respaldo en Drive.',
    icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
    acciones: [
      { id: 'ver', label: 'Ver Carpetas y Radicados', desc: 'Consultar carpetas y documentos de solicitudes.' },
      { id: 'editar', label: 'Editar Radicados', desc: 'Modificar metadatos, dependencias y plazos de expedientes.' },
      { id: 'aprobar_rechazar', label: 'Aprobar o Rechazar Aportes', desc: 'Validar o devolver documentos aportados por dependencias.' },
      { id: 'respaldar_drive', label: 'Respaldar en Google Drive', desc: 'Generar copia de seguridad sincronizada en la nube de Google.' },
      { id: 'eliminar', label: 'Eliminar Archivos', desc: 'Eliminar anexos y piezas documentales de la carpeta.' },
    ],
  },
  {
    id: 'peticiones',
    label: 'Peticiones Radicadas',
    href: '/peticiones',
    sidebarId: 'nav-peticiones',
    groupKey: 'operativo',
    groupLabel: 'Gestión Operativa y Expedientes',
    description: 'Tabla maestra de radicados, edición de información, prórrogas y reenvío a dependencias.',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    acciones: [
      { id: 'ver', label: 'Ver Peticiones', desc: 'Consultar la tabla maestra de solicitudes y expedientes.' },
      { id: 'editar', label: 'Editar y Reasignar', desc: 'Actualizar solicitantes, clasificaciones y dependencias asignadas.' },
      { id: 'eliminar', label: 'Eliminar Radicados', desc: 'Dar de baja solicitudes radicadas en el sistema.' },
    ],
  },
  {
    id: 'subir_peticion',
    label: 'Subir Petición',
    href: '/peticiones/subir',
    sidebarId: 'nav-subir-peticion',
    groupKey: 'operativo',
    groupLabel: 'Gestión Operativa y Expedientes',
    description: 'Radicación de nuevas solicitudes, carga de anexos y asignación inicial de dependencias.',
    icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
    acciones: [
      { id: 'ver', label: 'Acceder a Radicación', desc: 'Visualizar el formulario y panel de subida de peticiones.' },
      { id: 'crear', label: 'Radicar Nuevas Peticiones', desc: 'Crear radicados oficiales con asignación de carpetas y anexos.' },
    ],
  },
  {
    id: 'agenda_vencimientos',
    label: 'Agenda de Vencimientos',
    href: '/calendario',
    sidebarId: 'nav-calendario',
    groupKey: 'operativo',
    groupLabel: 'Gestión Operativa y Expedientes',
    description: 'Cronograma de vencimientos, sesiones institucionales y agenda estratégica.',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    acciones: [
      { id: 'ver', label: 'Ver Agenda y Vencimientos', desc: 'Consultar el calendario de plazos y compromisos institucionales.' },
      { id: 'editar', label: 'Gestionar Eventos y Plazos', desc: 'Crear, reprogramar o modificar citas y vencimientos.' },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 2. Gobernanza, Consejos y Jurídico
  // ─────────────────────────────────────────────────────────────
  {
    id: 'cuerpos_colegiados',
    label: 'Cuerpos Colegiados',
    href: '/normas',
    sidebarId: 'nav-normas',
    groupKey: 'gobernanza',
    groupLabel: 'Gobernanza, Consejos y Jurídico',
    description: 'Histórico por año (2021+), CSU, CA, Rectoría e importación Excel.',
    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    acciones: [
      { id: 'ver', label: 'Ver Normativa y Acuerdos', desc: 'Consultar acuerdos, resoluciones y actas de cuerpos colegiados.' },
      { id: 'crear', label: 'Crear Normas', desc: 'Registrar nuevas disposiciones y subir documentos normativos.' },
      { id: 'editar', label: 'Editar Actas y Resoluciones', desc: 'Actualizar metadatos, fechas y descripciones normativas.' },
      { id: 'eliminar', label: 'Eliminar Registros', desc: 'Eliminar normas o acuerdos institucionales.' },
      { id: 'importar_excel', label: 'Importar desde Excel', desc: 'Carga masiva histórica de normatividad mediante plantillas Excel.' },
    ],
  },
  {
    id: 'miembros_consejo',
    label: 'Miembros de Consejo',
    href: '/miembros-consejo',
    sidebarId: 'nav-miembros-consejo',
    groupKey: 'gobernanza',
    groupLabel: 'Gobernanza, Consejos y Jurídico',
    description: 'Integrantes de CSU, CA y Rectoría, periodos, semáforo de vencimiento y actas de cambio.',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    acciones: [
      { id: 'ver', label: 'Ver Integrantes y Periodos', desc: 'Consultar la lista activa e histórica de consejeros y representantes.' },
      { id: 'crear', label: 'Registrar Miembros', desc: 'Añadir nuevos consejeros con periodo de vigencia y estamento.' },
      { id: 'editar', label: 'Editar Miembros', desc: 'Modificar datos de contacto, representaciones y fechas de posesión.' },
      { id: 'registrar_cambio', label: 'Registrar Actas de Cambio', desc: 'Gestionar reemplazos, renuncias o relevos con acta de posesión.' },
      { id: 'eliminar', label: 'Eliminar Integrantes', desc: 'Eliminar registros erróneos de consejeros.' },
    ],
  },
  {
    id: 'asuntos_juridicos',
    label: 'Asuntos Jurídicos',
    href: '/asuntos-juridicos',
    sidebarId: 'nav-juridicos',
    groupKey: 'gobernanza',
    groupLabel: 'Gobernanza, Consejos y Jurídico',
    description: 'Explorador recursivo de Conceptos Internos, Litigios y Auditoría de Entes de Control + búsqueda profunda.',
    icon: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3',
    acciones: [
      { id: 'ver', label: 'Ver Explorador Jurídico', desc: 'Navegar y consultar conceptos, litigios y actuaciones de control.' },
      { id: 'crear_carpetas', label: 'Crear Subcarpetas', desc: 'Organizar la estructura jerárquica por temas y años.' },
      { id: 'subir_documentos', label: 'Subir e Indexar Documentos', desc: 'Subir expedientes jurídicos con extracción de texto plano.' },
      { id: 'editar', label: 'Editar Asuntos', desc: 'Modificar títulos, años y temas jurídicos de documentos o carpetas.' },
      { id: 'eliminar', label: 'Eliminar Carpetas/Documentos', desc: 'Eliminar expedientes o carpetas de la oficina jurídica.' },
    ],
  },
  {
    id: 'fase_juzgamiento',
    label: 'Fase de Juzgamiento',
    href: '/juzgamiento',
    sidebarId: 'nav-juzgamiento',
    groupKey: 'gobernanza',
    groupLabel: 'Gobernanza, Consejos y Jurídico',
    description: 'Seguimiento a expedientes disciplinarios y actuaciones procesales reservadas.',
    icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    acciones: [
      { id: 'ver', label: 'Ver Expedientes Disciplinarios', desc: 'Consultar procesos en etapa de juzgamiento.' },
      { id: 'crear', label: 'Crear Actuaciones', desc: 'Radicar nuevas piezas y expedientes disciplinarios.' },
      { id: 'editar', label: 'Editar Expedientes', desc: 'Actualizar estados procesales y autos de sustanciación.' },
      { id: 'eliminar', label: 'Eliminar Registros', desc: 'Eliminar actuaciones disciplinarias.' },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 3. Gestión Académica e Institucional
  // ─────────────────────────────────────────────────────────────
  {
    id: 'programas_academicos',
    label: 'Programas Académicos',
    href: '/programas',
    sidebarId: 'nav-programas',
    groupKey: 'academica',
    groupLabel: 'Gestión Académica e Institucional',
    description: 'Historial, registros calificados, radicados SACES / MEN y acreditación CNA.',
    icon: 'M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222',
    acciones: [
      { id: 'ver', label: 'Ver Programas Académicos', desc: 'Consultar el estado de registros y documentación curricular.' },
      { id: 'crear', label: 'Registrar Programas', desc: 'Añadir nuevos programas académicos de pregrado y posgrado.' },
      { id: 'editar', label: 'Editar Registros SACES/CNA', desc: 'Actualizar fechas de vigencia, resoluciones MEN y acreditación.' },
      { id: 'eliminar', label: 'Eliminar Programas', desc: 'Dar de baja registros de programas universitarios.' },
    ],
  },
  {
    id: 'planeacion_csu',
    label: 'Planeación y Gestión CSU',
    href: '/planeacion',
    sidebarId: 'nav-planeacion',
    groupKey: 'academica',
    groupLabel: 'Gestión Académica e Institucional',
    description: 'Informes de gestión, metas e indicadores ante el Consejo Superior Universitario.',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    acciones: [
      { id: 'ver', label: 'Ver Planeación y Gestión', desc: 'Consultar informes periódicos, tableros de avance y metas CSU.' },
      { id: 'crear', label: 'Crear Metas e Informes', desc: 'Publicar nuevos reportes de gestión estratégica.' },
      { id: 'editar', label: 'Editar Indicadores', desc: 'Modificar métricas de cumplimiento y evidencias.' },
      { id: 'eliminar', label: 'Eliminar Informes', desc: 'Eliminar reportes o documentos de planeación.' },
    ],
  },
  {
    id: 'relacionamiento_institucional',
    label: 'Relacionamiento Institucional',
    href: '/relacionamiento',
    sidebarId: 'nav-relacionamiento',
    groupKey: 'academica',
    groupLabel: 'Gestión Académica e Institucional',
    description: 'Convenios, alianzas y cooperación interinstitucional.',
    icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
    acciones: [
      { id: 'ver', label: 'Ver Convenios y Alianzas', desc: 'Consultar acuerdos interinstitucionales vigentes.' },
      { id: 'crear', label: 'Registrar Convenios', desc: 'Registrar nuevas alianzas y cargar minutas.' },
      { id: 'editar', label: 'Editar Acuerdos', desc: 'Actualizar vigencias, contrapartes y compromisos.' },
      { id: 'eliminar', label: 'Eliminar Convenios', desc: 'Eliminar registros de relacionamiento.' },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 4. Administración y Control del Sistema (DELEGABLES)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'usuarios',
    label: 'Usuarios y Gestión de Acceso',
    href: '/usuarios',
    sidebarId: 'nav-usuarios',
    groupKey: 'administracion',
    groupLabel: 'Administración y Control del Sistema',
    description: 'Directorio institucional, asignación de roles, delegación de permisos y control de personal.',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    isSensitive: true,
    acciones: [
      { id: 'ver', label: 'Ver listado de usuarios', desc: 'Consultar el directorio institucional y datos de funcionarios.' },
      { id: 'crear', label: 'Crear nuevas cuentas', desc: 'Registrar nuevos funcionarios con contraseña provisional (sin rol admin).' },
      { id: 'editar', label: 'Editar datos y dependencia', desc: 'Actualizar nombre, cargo o rol de cuentas no administradoras.' },
      { id: 'eliminar', label: 'Eliminar o desactivar cuentas', desc: 'Dar de baja cuentas institucionales no protegidas.' },
      { id: 'gestionar_permisos', label: 'Gestionar Roles y Permisos', desc: 'Configurar la matriz de permisos por usuario y crear roles personalizados.' },
    ],
  },
  {
    id: 'auditoria',
    label: 'Auditoría y Trazabilidad',
    href: '/auditoria',
    sidebarId: 'nav-auditoria',
    groupKey: 'administracion',
    groupLabel: 'Administración y Control del Sistema',
    description: 'Bitácora inmutable de accesos, direcciones IP, acciones y exportación forense.',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    isSensitive: true,
    acciones: [
      { id: 'ver', label: 'Ver Bitácora de Trazabilidad', desc: 'Consultar el registro de eventos, cambios y accesos del sistema.' },
      { id: 'exportar', label: 'Exportar Auditoría a Excel', desc: 'Descargar reportes forenses oficiales en hoja de cálculo.' },
    ],
  },
];

/** Mapeo de compatibilidad bidireccional entre identificadores canónicos y alias antiguos */
export const MODULE_ALIASES: Record<string, string> = {
  subir: 'subir_peticion',
  subir_peticion: 'subir_peticion',
  calendario: 'agenda_vencimientos',
  agenda_vencimientos: 'agenda_vencimientos',
  normas: 'cuerpos_colegiados',
  cuerpos_colegiados: 'cuerpos_colegiados',
  'cuerpos-colegiados': 'cuerpos_colegiados',
  'miembros-consejo': 'miembros_consejo',
  miembros_consejo: 'miembros_consejo',
  juridicos: 'asuntos_juridicos',
  'asuntos-juridicos': 'asuntos_juridicos',
  asuntos_juridicos: 'asuntos_juridicos',
  juzgamiento: 'fase_juzgamiento',
  fase_juzgamiento: 'fase_juzgamiento',
  programas: 'programas_academicos',
  programas_academicos: 'programas_academicos',
  planeacion: 'planeacion_csu',
  planeacion_csu: 'planeacion_csu',
  relacionamiento: 'relacionamiento_institucional',
  relacionamiento_institucional: 'relacionamiento_institucional',
  usuarios: 'usuarios',
  auditoria: 'auditoria',
  dashboard: 'dashboard',
  archivos: 'archivos',
  peticiones: 'peticiones',
};

export const REVERSE_MODULE_ALIASES: Record<string, string[]> = {
  subir_peticion: ['subir', 'subir-peticion'],
  agenda_vencimientos: ['calendario'],
  cuerpos_colegiados: ['normas', 'cuerpos-colegiados'],
  miembros_consejo: ['miembros-consejo'],
  asuntos_juridicos: ['juridicos', 'asuntos-juridicos'],
  fase_juzgamiento: ['juzgamiento'],
  programas_academicos: ['programas'],
  planeacion_csu: ['planeacion'],
  relacionamiento_institucional: ['relacionamiento'],
  usuarios: ['admin/usuarios', 'usuarios'],
  auditoria: ['auditoria'],
  dashboard: ['dashboard'],
  archivos: ['archivos'],
  peticiones: ['peticiones'],
};

export function getCanonicalModuleId(idOrAlias: string): string {
  const clean = String(idOrAlias || '').trim().toLowerCase();
  return MODULE_ALIASES[clean] || clean;
}

export function getAllModuleKeys(idOrAlias: string): string[] {
  const canonical = getCanonicalModuleId(idOrAlias);
  const aliases = REVERSE_MODULE_ALIASES[canonical] || [];
  return Array.from(new Set([canonical, ...aliases, idOrAlias]));
}

/** Generar lista exhaustiva de todos los IDs de permisos soportados */
export const ALL_PERMISSION_IDS: string[] = Array.from(
  new Set(
    MODULOS_SISTEMA.flatMap((mod) => {
      const keys = getAllModuleKeys(mod.id);
      const permIds: string[] = [];
      for (const k of keys) {
        // Acciones granulares
        for (const act of mod.acciones) {
          permIds.push(`${k}.${act.id}`);
        }
        // Aliases heredados de gestión amplia
        permIds.push(`${k}.gestionar`);
        permIds.push(`${k}.ver`);
      }
      return permIds;
    })
  )
);

export const DEFAULT_FUNCIONARIO_PERMISSIONS: string[] = [
  'dashboard.ver',
  'archivos.ver',
  'archivos.editar',
  'peticiones.ver',
  'subir_peticion.ver',
  'subir.ver',
  'agenda_vencimientos.ver',
  'calendario.ver',
];

export const SYSTEM_ROLES: SystemRole[] = [
  {
    id: 'admin',
    code: 'admin',
    name: 'Administrador',
    level: 1,
    levelName: 'Control Total',
    desc: 'Acceso irrestricto a todos los módulos del sistema, administración del directorio de usuarios, creación de roles y matriz RBAC.',
    color: '#00594E',
    isProtected: true,
    permissions: [...ALL_PERMISSION_IDS],
  },
  {
    id: 'funcionario',
    code: 'funcionario',
    name: 'Funcionario',
    level: 2,
    levelName: 'Operativo Dinámico',
    desc: 'Rol operativo estándar cuyos módulos visibles y nivel de interacción dependen de la matriz RBAC asignada.',
    color: '#B5A160',
    isProtected: true,
    permissions: [...DEFAULT_FUNCIONARIO_PERMISSIONS],
  },
];

export function isAdminRoleCode(role?: string | null): boolean {
  const clean = String(role || '').trim().toLowerCase();
  return (
    clean === 'admin' ||
    clean === 'administrador' ||
    clean === 'superadmin' ||
    clean === 'superadministrador' ||
    clean === 'administrador general' ||
    clean === 'root' ||
    clean === 'usr-root'
  );
}

export function getRoleDisplayName(roleIdOrCode?: string | null, rolesCatalog: SystemRole[] = SYSTEM_ROLES): string {
  if (!roleIdOrCode) return 'Funcionario';
  if (isAdminRoleCode(roleIdOrCode)) return 'Administrador';
  const clean = String(roleIdOrCode).trim();
  const found = rolesCatalog.find(
    (r) =>
      r.id === clean ||
      r.code === clean ||
      r.name.toLowerCase() === clean.toLowerCase()
  );
  if (found) return found.name;
  if (clean.toLowerCase().includes('func')) return 'Funcionario';
  return clean;
}

export function getRoleById(roleIdOrCode: string, rolesCatalog: SystemRole[] = SYSTEM_ROLES): SystemRole {
  const clean = String(roleIdOrCode || '').trim();
  const normalized = clean.toLowerCase();
  if (isAdminRoleCode(clean)) {
    return rolesCatalog.find((r) => r.id === 'admin' || r.code === 'admin') ?? SYSTEM_ROLES[0]!;
  }
  const found = rolesCatalog.find(
    (r) => r.id === clean || r.code === clean || r.id.toLowerCase() === normalized || r.name.toLowerCase() === normalized
  );
  if (found) return found;
  return rolesCatalog.find((r) => r.id === 'funcionario' || r.code === 'funcionario') ?? SYSTEM_ROLES[1]!;
}

/**
 * Normaliza cualquier lista de permisos asegurando compatibilidad con prefijos antiguos
 * y garantizando que todo permiso de gestión/acción implique también visualización (.ver).
 */
export function normalizePermissionsList(rawPerms: any): string[] {
  if (!rawPerms) return [];

  const resultSet = new Set<string>();

  // Si viene como objeto tipo { modulo: true } o { modulo: { ver: true } }
  if (typeof rawPerms === 'object' && !Array.isArray(rawPerms)) {
    for (const [modKey, val] of Object.entries(rawPerms)) {
      const canonical = getCanonicalModuleId(modKey);
      if (val === true) {
        const modDef = MODULOS_SISTEMA.find((m) => m.id === canonical);
        if (modDef) {
          for (const a of modDef.acciones) {
            resultSet.add(`${canonical}.${a.id}`);
          }
        }
        resultSet.add(`${canonical}.ver`);
        resultSet.add(`${canonical}.gestionar`);
      } else if (typeof val === 'object' && val !== null) {
        for (const [actKey, isGranted] of Object.entries(val as Record<string, boolean>)) {
          if (isGranted) {
            resultSet.add(`${canonical}.${actKey}`);
            resultSet.add(`${canonical}.ver`);
          }
        }
      }
    }
  } else if (Array.isArray(rawPerms)) {
    for (const raw of rawPerms) {
      const str = String(raw || '').trim();
      if (!str) continue;

      resultSet.add(str);

      // Si tiene punto, resolver módulo canónico y sincronizar .ver
      if (str.includes('.')) {
        const [modPart, actPart] = str.split('.');
        if (modPart && actPart) {
          const canonical = getCanonicalModuleId(modPart);
          resultSet.add(`${canonical}.${actPart}`);
          resultSet.add(`${canonical}.ver`);
          if (actPart === 'gestionar') {
            const modDef = MODULOS_SISTEMA.find((m) => m.id === canonical);
            if (modDef) {
              for (const a of modDef.acciones) {
                resultSet.add(`${canonical}.${a.id}`);
              }
            }
          }
        }
      } else {
        // Permiso booleano plano del módulo completo
        const canonical = getCanonicalModuleId(str);
        const modDef = MODULOS_SISTEMA.find((m) => m.id === canonical);
        if (modDef) {
          for (const a of modDef.acciones) {
            resultSet.add(`${canonical}.${a.id}`);
          }
        }
        resultSet.add(`${canonical}.ver`);
      }
    }
  }

  return Array.from(resultSet);
}

/**
 * FUNCIÓN ÚNICA Y AUTORITATIVA DE VERIFICACIÓN RBAC
 * Evalúa rol, permisos del rol y overrides individuales con compatibilidad total hacia atrás.
 * 
 * @param usuario Objeto usuario, perfil, actor o lista de permisos
 * @param modulo Clave del módulo (ej. 'usuarios', 'archivos', 'asuntos_juridicos')
 * @param accion Acción requerida (ej. 'ver', 'crear', 'editar', 'eliminar', 'gestionar_permisos'). Default: 'ver'.
 */
export function tienePermiso(
  usuario: any,
  modulo: string,
  accion: string = 'ver'
): boolean {
  if (!usuario) return false;

  // 1. Administrador (o Superusuario Root) dispone de permiso total absoluto
  const isUserAdmin =
    usuario.isAdmin === true ||
    usuario.id === 'usr-root' ||
    usuario.userId === 'usr-root' ||
    isAdminRoleCode(usuario.role) ||
    isAdminRoleCode(usuario.roleId) ||
    isAdminRoleCode(usuario.role_id) ||
    isAdminRoleCode(usuario.roleName);

  if (isUserAdmin) return true;

  const targetAction = String(accion || 'ver').trim().toLowerCase();
  const canonicalMod = getCanonicalModuleId(modulo);
  const allModKeys = getAllModuleKeys(canonicalMod);

  // 2. Extraer fuente de permisos del usuario
  let rawPerms: any = null;
  if (Array.isArray(usuario.effectivePermissions)) {
    rawPerms = usuario.effectivePermissions;
  } else if (Array.isArray(usuario.permissions)) {
    rawPerms = usuario.permissions;
  } else if (usuario.userPermissionsOverride) {
    const uid = usuario.id || usuario.userId || '';
    rawPerms = usuario.userPermissionsOverride[uid] || usuario.userPermissionsOverride[usuario.email?.toLowerCase()] || [];
  } else if (Array.isArray(usuario)) {
    rawPerms = usuario;
  } else if (typeof usuario === 'object' && usuario !== null) {
    rawPerms = usuario.permissions || usuario.perms || usuario;
  }

  // 3. Evaluación si los permisos vienen como objeto estructurado
  if (rawPerms && typeof rawPerms === 'object' && !Array.isArray(rawPerms)) {
    for (const key of allModKeys) {
      if (rawPerms[key] === true) return true;
      if (typeof rawPerms[key] === 'object' && rawPerms[key] !== null) {
        if (rawPerms[key][targetAction] === true) return true;
        if (targetAction === 'ver' && Object.values(rawPerms[key]).some((v) => v === true)) return true;
        if (targetAction !== 'ver' && (rawPerms[key]['gestionar'] === true || rawPerms[key]['*'] === true)) return true;
      }
    }
  }

  // 4. Evaluación sobre lista normalizada de cadenas
  const normalizedList = normalizePermissionsList(rawPerms);
  if (normalizedList.length === 0) return false;

  for (const k of allModKeys) {
    // Coincidencia exacta de acción granular (ej. 'usuarios.crear')
    if (normalizedList.includes(`${k}.${targetAction}`)) return true;

    // Coincidencia con 'gestionar' general o comodín
    if (normalizedList.includes(`${k}.gestionar`) || normalizedList.includes(`${k}.*`) || normalizedList.includes(k)) {
      return true;
    }

    // Si solo requiere 'ver', cualquier permiso concedido en el módulo otorga visualización
    if (targetAction === 'ver') {
      if (normalizedList.some((p) => p.startsWith(`${k}.`))) return true;
    }

    // Regla especial para módulo usuarios: gestionar_permisos o gestionar implica también ver y editar
    if (k === 'usuarios') {
      if (normalizedList.includes('usuarios.gestionar_permisos') || normalizedList.includes('usuarios.gestionar')) {
        if (targetAction === 'ver' || targetAction === 'editar' || targetAction === 'crear') {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * CANDADOS ANTI-ESCALAMIENTO OBLIGATORIOS
 */

/** Validar si el usuario puede crear cuentas con rol Administrador */
export function canCreateAdminAccount(actor: any): boolean {
  if (!actor) return false;
  return Boolean(actor.isAdmin || actor.id === 'usr-root' || isAdminRoleCode(actor.role) || isAdminRoleCode(actor.roleId));
}

/** Validar si el actor tiene permitido editar o modificar a un usuario objetivo */
export function canModifyUserTarget(actor: any, targetUser: any): boolean {
  if (!actor || !targetUser) return false;
  const actorIsAdmin = actor.isAdmin || actor.id === 'usr-root' || isAdminRoleCode(actor.role) || isAdminRoleCode(actor.roleId);
  const targetIsAdmin =
    targetUser.id === 'usr-root' ||
    targetUser.isProtectedRoot ||
    targetUser.isAdmin ||
    isAdminRoleCode(targetUser.role) ||
    isAdminRoleCode(targetUser.roleId) ||
    isAdminRoleCode(targetUser.assignedRoleId);

  // Un no-administrador NUNCA puede modificar a un Administrador ni a Root
  if (targetIsAdmin && !actorIsAdmin) {
    return false;
  }

  return actorIsAdmin || tienePermiso(actor, 'usuarios', 'editar');
}

/** Validar si el actor tiene permitido dar de baja o eliminar a un usuario objetivo */
export function canDeleteUserTarget(actor: any, targetUser: any): boolean {
  if (!actor || !targetUser) return false;
  // El usuario root principal nunca puede ser eliminado por nadie
  if (targetUser.id === 'usr-root' || targetUser.isProtectedRoot) return false;

  const actorIsAdmin = actor.isAdmin || actor.id === 'usr-root' || isAdminRoleCode(actor.role) || isAdminRoleCode(actor.roleId);
  const targetIsAdmin =
    targetUser.isAdmin ||
    isAdminRoleCode(targetUser.role) ||
    isAdminRoleCode(targetUser.roleId) ||
    isAdminRoleCode(targetUser.assignedRoleId);

  // Las cuentas de administrador nunca pueden ser eliminadas por no-administradores
  if (targetIsAdmin && !actorIsAdmin) return false;

  return actorIsAdmin || tienePermiso(actor, 'usuarios', 'eliminar');
}

/** Validar si el actor puede gestionar roles o modificar permisos individuales */
export function canManageRolesAndPermissions(actor: any): boolean {
  if (!actor) return false;
  const actorIsAdmin = actor.isAdmin || actor.id === 'usr-root' || isAdminRoleCode(actor.role) || isAdminRoleCode(actor.roleId);
  return actorIsAdmin || tienePermiso(actor, 'usuarios', 'gestionar_permisos');
}

/** Filtrar permisos para que un no-administrador no pueda otorgar permisos que él mismo no posea */
export function filterNonEscalatedPermissions(actor: any, requestedPerms: string[]): string[] {
  if (!actor) return [];
  const actorIsAdmin = actor.isAdmin || actor.id === 'usr-root' || isAdminRoleCode(actor.role) || isAdminRoleCode(actor.roleId);
  if (actorIsAdmin) return requestedPerms;

  const actorEffective = normalizePermissionsList(actor.effectivePermissions || actor.permissions || []);
  return requestedPerms.filter((p) => actorEffective.includes(p));
}

/** Resolver qué módulo del catálogo corresponde a una ruta URL */
export function getModuleByPath(pathname: string): ModuloSistemaDef | null {
  const cleanPath = (pathname || '/').replace(/\/+$/, '') || '/';
  const sorted = [...MODULOS_SISTEMA].sort((a, b) => b.href.length - a.href.length);
  for (const mod of sorted) {
    if (cleanPath === mod.href || cleanPath.startsWith(`${mod.href}/`)) {
      return mod;
    }
  }

  // Comprobar alias históricos
  if (cleanPath === '/calendario' || cleanPath.startsWith('/calendario/')) {
    return MODULOS_SISTEMA.find((m) => m.id === 'agenda_vencimientos') || null;
  }
  if (cleanPath === '/normas' || cleanPath.startsWith('/normas/')) {
    return MODULOS_SISTEMA.find((m) => m.id === 'cuerpos_colegiados') || null;
  }
  if (cleanPath === '/juridicos' || cleanPath.startsWith('/juridicos/')) {
    return MODULOS_SISTEMA.find((m) => m.id === 'asuntos_juridicos') || null;
  }
  if (cleanPath === '/admin/usuarios' || cleanPath.startsWith('/admin/usuarios/')) {
    return MODULOS_SISTEMA.find((m) => m.id === 'usuarios') || null;
  }

  return null;
}

export function canAccessModuleRoute(
  pathname: string,
  userOrPerms: any,
  isAdmin = false
): boolean {
  if (isAdmin) return true;
  const mod = getModuleByPath(pathname);
  if (mod) {
    return tienePermiso(userOrPerms, mod.id, 'ver');
  }
  // Rutas transversales libres para todo usuario autenticado (/perfil, /)
  return true;
}

export function getFirstAllowedPath(userOrPerms: any, isAdmin = false): string {
  if (isAdmin) return '/dashboard';
  for (const mod of MODULOS_SISTEMA) {
    if (tienePermiso(userOrPerms, mod.id, 'ver')) {
      return mod.href;
    }
  }
  return '/perfil';
}

export const RBAC_MODULES = MODULOS_SISTEMA;
