// src/data/roles.ts
import type { Permission, SystemRole } from '@lib/types';

export const PERMISSIONS_CATALOG: Permission[] = [
  { id: 'view_dashboard',    label: 'Ver Dashboard y Métricas (KPIs)',     desc: 'Acceso a estadísticas de radicación y atención prioritaria',            category: 'Consulta'       },
  { id: 'view_files',        label: 'Ver Módulo de Archivos y Proyectos',  desc: 'Consultar listado general y carpetas de expedientes',                    category: 'Consulta'       },
  { id: 'upload_files',      label: 'Radicar y Subir Peticiones',          desc: 'Crear nuevas peticiones y asignar oficinas responsables',               category: 'Operación'      },
  { id: 'reassign_files',    label: 'Reasignar Responsables',              desc: 'Transferir la responsabilidad de peticiones entre oficinas',            category: 'Gestión'        },
  { id: 'respond_petitions', label: 'Responder Peticiones',                desc: 'Revisar anexos entregados y consolidar respuesta institucional',        category: 'Operación'      },
  { id: 'manage_templates',  label: 'Gestionar Plantillas',                desc: 'Crear y editar modelos de respuesta oficiales',                          category: 'Configuración'  },
  { id: 'manage_users',      label: 'Gestionar Usuarios',                  desc: 'Registrar nuevos funcionarios y asignar contraseñas provisionales',     category: 'Seguridad'      },
  { id: 'manage_roles',      label: 'Gestionar Permisos Dinámicos',        desc: 'Habilitar o revocar permisos específicos a cada funcionario',           category: 'Seguridad'      },
  { id: 'download_documents',label: 'Descargar Documentos y Anexos',       desc: 'Descarga de soportes y carpetas de radicados',                          category: 'Operación'      },
  { id: 'delete_files',      label: 'Anular o Archivar Peticiones',        desc: 'Anulación o archivo justificado de radicados',                          category: 'Gestión'        },
];

export const SYSTEM_ROLES: SystemRole[] = [
  {
    id: 'admin',
    code: 'admin',
    name: 'Administrador',
    level: 1,
    levelName: 'Nivel 1: Total',
    desc: 'Acceso total al sistema, creación de usuarios con contraseña provisional y asignación dinámica de permisos granulares.',
    color: '#00594E',
    isProtected: true,
    permissions: PERMISSIONS_CATALOG.map((p) => p.id),
  },
  {
    id: 'funcionario',
    code: 'funcionario',
    name: 'Funcionario',
    level: 2,
    levelName: 'Nivel 2: Operativo Dinámico',
    desc: 'Acceso condicionado a los permisos dinámicos asignados por el Administrador. Visualización y gestión de proyectos y carpetas de peticiones.',
    color: '#B5A160',
    isProtected: false,
    permissions: [
      'view_dashboard',
      'view_files',
      'respond_petitions',
      'download_documents',
    ],
  },
];

