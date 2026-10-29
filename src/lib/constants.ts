// src/lib/constants.ts
// Constantes globales del SGD Unitrópico

export const APP_NAME = 'SGD Unitrópico';
export const APP_FULL_NAME = 'Sistema de Gestión Documental y Gobierno Institucional';
export const INSTITUTION_NAME = 'Universidad Internacional del Trópico Americano';

/** Clave usada para la cookie de sesión del middleware */
export const SESSION_COOKIE_KEY = 'sgd_session';

/** Clave de localStorage para compatibilidad con datos mock (Fase 1) */
export const SESSION_STORAGE_KEY = 'sgd_unitropico_session';

/** Rutas públicas que NO requieren autenticación */
export const PUBLIC_ROUTES = ['/login', '/404'];

/** Rutas exclusivas de administrador/root */
export const ADMIN_ROUTES = ['/admin/usuarios', '/admin/roles'];

/** Mapa de rutas a etiquetas de navegación */
export const NAV_LABELS: Record<string, string> = {
  '/dashboard':      'Dashboard — Panel de Control',
  '/archivos':       'Módulo de Archivos y TRD',
  '/peticiones':     'Derechos de Petición y PQRS',
  '/normas':         'Cuerpos Colegiados y Normatividad',
  '/juridicos':      'Asuntos Jurídicos y Tutelas',
  '/juzgamiento':    'Fase de Juzgamiento Disciplinario',
  '/calendario':     'Calendario Institucional',
  '/programas':      'Programas Académicos',
  '/planeacion':     'Planeación y Gestión CSU',
  '/relacionamiento':'Relacionamiento Institucional',
  '/dependencias':   'Dependencias Universitarias',
  '/auditoria':      'Auditoría y Trazabilidad',
  '/admin/usuarios': 'Gestión de Usuarios',
  '/admin/roles':    'Gestión de Roles y Permisos',
};

