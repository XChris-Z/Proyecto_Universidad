// src/data/roles.ts
// Catálogo maestro RBAC: 12 módulos institucionales (Ver / Interactuar) y roles base del SGD Unitrópico

import type { Permission, RbacModuleDef, SystemRole } from '@lib/types';

export const RBAC_MODULES: RbacModuleDef[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    sidebarId: 'nav-dashboard',
    group: 'Navegación Principal',
    description: 'Panel ejecutivo, métricas KPI, gráficos y exportación oficial a Excel.',
  },
  {
    id: 'archivos',
    label: 'Carpetas de Radicados',
    href: '/archivos',
    sidebarId: 'nav-archivos',
    group: 'Navegación Principal',
    description: 'Carpetas de radicados, revisión de aportes, cierre interno, prórrogas y respaldo en Drive.',
  },
  {
    id: 'peticiones',
    label: 'Peticiones Radicadas',
    href: '/peticiones',
    sidebarId: 'nav-peticiones',
    group: 'Navegación Principal',
    description: 'Tabla maestra de radicados, edición de información, prórrogas y reenvío a dependencias.',
  },
  {
    id: 'subir',
    label: 'Subir Petición',
    href: '/peticiones/subir',
    sidebarId: 'nav-subir-peticion',
    group: 'Navegación Principal',
    description: 'Radicación de nuevas solicitudes, carga de anexos y asignación inicial de dependencias.',
  },
  {
    id: 'normas',
    label: 'Cuerpos Colegiados',
    href: '/normas',
    sidebarId: 'nav-normas',
    group: 'Gobierno y Normativa',
    description: 'Consulta y gestión normativa de actas, acuerdos y resoluciones de cuerpos colegiados.',
  },
  {
    id: 'juridicos',
    label: 'Asuntos Jurídicos',
    href: '/juridicos',
    sidebarId: 'nav-juridicos',
    group: 'Gobierno y Normativa',
    description: 'Control de tutelas, acciones judiciales, conceptos y procesos legales.',
  },
  {
    id: 'juzgamiento',
    label: 'Fase de Juzgamiento',
    href: '/juzgamiento',
    sidebarId: 'nav-juzgamiento',
    group: 'Control y Disciplinario',
    description: 'Seguimiento a expedientes disciplinarios y actuaciones procesales reservadas.',
  },
  {
    id: 'calendario',
    label: 'Agenda de Vencimientos',
    href: '/calendario',
    sidebarId: 'nav-calendario',
    group: 'Control y Disciplinario',
    description: 'Cronograma de vencimientos, sesiones institucionales y agenda estratégica.',
  },
  {
    id: 'programas',
    label: 'Programas Académicos',
    href: '/programas',
    sidebarId: 'nav-programas',
    group: 'Academia y Estrategia',
    description: 'Gestión documental de registros calificados, acreditación y programas universitarios.',
  },
  {
    id: 'planeacion',
    label: 'Planeación y Gestión CSU',
    href: '/planeacion',
    sidebarId: 'nav-planeacion',
    group: 'Academia y Estrategia',
    description: 'Informes de gestión, metas e indicadores ante el Consejo Superior Universitario.',
  },
  {
    id: 'relacionamiento',
    label: 'Relacionamiento Institucional',
    href: '/relacionamiento',
    sidebarId: 'nav-relacionamiento',
    group: 'Academia y Estrategia',
    description: 'Convenios, alianzas y cooperación interinstitucional.',
  },
  {
    id: 'auditoria',
    label: 'Auditoría y Trazabilidad',
    href: '/auditoria',
    sidebarId: 'nav-auditoria',
    group: 'Seguridad y Administración',
    description: 'Bitácora inmutable de accesos, direcciones IP, acciones y exportación forense.',
  },
];

export const MODULE_PERMISSIONS_CATALOG: Permission[] = RBAC_MODULES.flatMap((mod) => [
  {
    id: `${mod.id}.ver`,
    label: `Ver ${mod.label}`,
    desc: `Permite acceder y visualizar ${mod.label} en modo consulta.`,
    category: 'Consulta',
  },
  {
    id: `${mod.id}.gestionar`,
    label: `Interactuar / Gestionar ${mod.label}`,
    desc: `Permite crear, editar, cargar, aprobar o ejecutar acciones en ${mod.label}.`,
    category: 'Gestión',
  },
]);

export const PERMISSIONS_CATALOG: Permission[] = [
  ...MODULE_PERMISSIONS_CATALOG,
  {
    id: 'usuarios.gestionar',
    label: 'Administrar Usuarios y Roles RBAC',
    desc: 'Acceso exclusivo del Administrador para gestionar cuentas, roles y matriz de permisos.',
    category: 'Seguridad',
  },
];

export const ALL_MODULE_PERMISSION_IDS: string[] = MODULE_PERMISSIONS_CATALOG.map((p) => p.id);

export const ALL_PERMISSION_IDS: string[] = PERMISSIONS_CATALOG.map((p) => p.id);

export const DEFAULT_FUNCIONARIO_PERMISSIONS: string[] = [
  'dashboard.ver',
  'archivos.ver',
  'archivos.gestionar',
  'peticiones.ver',
  'calendario.ver',
];

export const SYSTEM_ROLES: SystemRole[] = [
  {
    id: 'admin',
    code: 'admin',
    name: 'Administrador',
    level: 1,
    levelName: 'Control Total',
    desc: 'Acceso irrestricto a los 12 módulos del sistema, administración del directorio de usuarios, creación de roles y matriz RBAC.',
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
    desc: 'Rol operativo estándar cuyos módulos visibles y nivel de interacción (Ver / Gestionar) dependen de la matriz RBAC asignada.',
    color: '#B5A160',
    isProtected: true,
    permissions: [...DEFAULT_FUNCIONARIO_PERMISSIONS],
  },
];
