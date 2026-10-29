// src/data/roles.ts
import type { Permission, SystemRole } from '@lib/types';

export const PERMISSIONS_CATALOG: Permission[] = [
  { id: 'view_dashboard',    label: 'Ver Dashboard y Métricas (KPIs)',     desc: 'Acceso a estadísticas de radicación y atención prioritaria',            category: 'Consulta'       },
  { id: 'view_files',        label: 'Ver Módulo de Archivos',              desc: 'Consultar listado general y tabla de expedientes',                       category: 'Consulta'       },
  { id: 'upload_files',      label: 'Radicar y Subir Archivos',            desc: 'Registrar nuevos expedientes en plataforma (Drag & Drop)',              category: 'Operación'      },
  { id: 'reassign_files',    label: 'Reasignar Expedientes',               desc: 'Transferir la responsabilidad de expedientes entre funcionarios',        category: 'Gestión'        },
  { id: 'respond_petitions', label: 'Responder Peticiones',                desc: 'Redactar y vincular oficios institucionales de respuesta',               category: 'Operación'      },
  { id: 'manage_templates',  label: 'Gestionar Plantillas',                desc: 'Crear y editar modelos de respuesta oficiales',                          category: 'Configuración'  },
  { id: 'manage_users',      label: 'Gestionar Usuarios',                  desc: 'Registrar, editar y listar funcionarios institucionales',                category: 'Seguridad'      },
  { id: 'manage_roles',      label: 'Gestionar Roles y Permisos',          desc: 'Crear roles institucionales y configurar permisos granulares',           category: 'Seguridad'      },
  { id: 'download_documents',label: 'Descargar Documentos',                desc: 'Descarga e impresión de oficios membretados y expedientes',             category: 'Operación'      },
  { id: 'delete_files',      label: 'Eliminar o Anular Expedientes',       desc: 'Anulación justificada de expedientes radicados',                        category: 'Gestión'        },
];

export const SYSTEM_ROLES: SystemRole[] = [
  {
    id: 'role-root',
    code: 'root',
    name: 'Root / Superusuario',
    level: 1,
    levelName: 'Nivel 1: Máxima Autoridad',
    desc: 'Acceso total y omnipotente a todas las funciones y auditorías. Inmutable por diseño.',
    color: '#6b21a8',
    isProtected: true,
    permissions: PERMISSIONS_CATALOG.map((p) => p.id),
  },
  {
    id: 'role-admin',
    code: 'admin',
    name: 'Administrador del SGD',
    level: 2,
    levelName: 'Nivel 2: Segunda Autoridad',
    desc: 'Gestiona la plataforma, crea usuarios y roles, y configura los permisos de cada rol a discreción.',
    color: '#00594E',
    isProtected: false,
    permissions: [
      'view_dashboard', 'view_files', 'upload_files', 'reassign_files',
      'respond_petitions', 'manage_templates', 'manage_users', 'manage_roles',
      'download_documents',
    ],
  },
  {
    id: 'role-funcionario',
    code: 'funcionario',
    name: 'Funcionario Institucional',
    level: 3,
    levelName: 'Nivel 3: Operativo',
    desc: 'Responsable de tramitar y responder los expedientes y solicitudes asignadas a su dependencia.',
    color: '#0284c7',
    isProtected: false,
    permissions: [
      'view_dashboard', 'view_files', 'upload_files',
      'respond_petitions', 'download_documents',
    ],
  },
];

