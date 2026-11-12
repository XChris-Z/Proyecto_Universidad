// src/lib/constants.ts
// Constantes globales del SGD Unitrópico

export const APP_NAME = 'SGD Unitrópico';
export const APP_FULL_NAME = 'Plataforma de Trazabilidad de Peticiones y Expedientes';
export const INSTITUTION_NAME = 'Universidad Internacional del Trópico Americano';

/** Etiqueta informativa para carga ilimitada directa a Storage */
export const UNLIMITED_UPLOAD_LABEL = 'Capacidad Ilimitada · Soporte de Archivos Pesados';
export const MAX_FILE_SIZE_MB = Number.MAX_SAFE_INTEGER;
export const MAX_FILE_SIZE_BYTES = Number.MAX_SAFE_INTEGER;

/** Clave usada para la cookie de sesión del middleware */
export const SESSION_COOKIE_KEY = 'sgd_session';

/** Clave de localStorage para compatibilidad con datos mock (Fase 1) */
export const SESSION_STORAGE_KEY = 'sgd_unitropico_session';

/** Rutas públicas que NO requieren autenticación */
export const PUBLIC_ROUTES = [
  '/login',
  '/404',
  '/portal-responsable',
  '/consulta-respuesta',
  '/api/portal',
  '/api/auth',
  '/api/consultar-respuesta',
  '/api/storage/signed-upload',
];

/** Rutas exclusivas de administrador/root */
export const ADMIN_ROUTES = ['/admin/usuarios', '/admin/roles'];

/** Mapa de rutas a etiquetas de navegación */
export const NAV_LABELS: Record<string, string> = {
  '/dashboard':      'Dashboard — Panel de Control',
  '/archivos':       'Carpetas de Radicados',
  '/peticiones':     'Derechos de Petición y PQRS',
  '/normas':         'Cuerpos Colegiados y Normatividad',
  '/juridicos':      'Asuntos Jurídicos y Tutelas',
  '/juzgamiento':    'Fase de Juzgamiento Disciplinario',
  '/calendario':     'Agenda de Vencimientos',
  '/programas':      'Programas Académicos',
  '/planeacion':     'Planeación y Gestión CSU',
  '/relacionamiento':'Relacionamiento Institucional',
  '/dependencias':   'Dependencias Universitarias',
  '/auditoria':      'Auditoría y Trazabilidad',
  '/admin/usuarios': 'Gestión de Usuarios',
  '/admin/roles':    'Gestión de Roles y Permisos',
};

