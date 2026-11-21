// src/data/roles.ts
// Re-exporta el catálogo maestro unificado desde @lib/permisos
import {
  ALL_PERMISSION_IDS,
  DEFAULT_FUNCIONARIO_PERMISSIONS,
  MODULOS_SISTEMA,
  SYSTEM_ROLES,
} from '@lib/permisos';
import type { Permission, RbacModuleDef } from '@lib/types';

export {
  MODULOS_SISTEMA,
  ALL_PERMISSION_IDS,
  DEFAULT_FUNCIONARIO_PERMISSIONS,
  SYSTEM_ROLES,
};

export const RBAC_MODULES: RbacModuleDef[] = MODULOS_SISTEMA.map((m) => ({
  id: m.id,
  label: m.label,
  href: m.href,
  sidebarId: m.sidebarId,
  group: m.groupLabel,
  description: m.description,
}));

export const MODULE_PERMISSIONS_CATALOG: Permission[] = MODULOS_SISTEMA.flatMap((mod) =>
  mod.acciones.map((act) => ({
    id: `${mod.id}.${act.id}`,
    label: `${act.label} (${mod.label})`,
    desc: act.desc || `Permiso ${act.label} en el módulo ${mod.label}`,
    category: mod.groupLabel,
  }))
);

export const PERMISSIONS_CATALOG: Permission[] = [
  ...MODULE_PERMISSIONS_CATALOG,
];

export const ALL_MODULE_PERMISSION_IDS: string[] = ALL_PERMISSION_IDS;
