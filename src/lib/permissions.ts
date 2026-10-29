// src/lib/permissions.ts
// Sistema de control de acceso basado en roles (RBAC) dinámico para SGD Unitrópico
// 2 Roles Principales: Administrador (Total) y Funcionario (Dinámico)

import type { InstitutionalUser, SystemRole } from './types';
import { SYSTEM_ROLES, PERMISSIONS_CATALOG } from '@data/roles';

/**
 * Obtiene un rol por su id o código. Por defecto retorna 'funcionario'.
 */
export function getRoleById(roleIdOrCode: string): SystemRole {
  return (
    SYSTEM_ROLES.find((r) => r.id === roleIdOrCode || r.code === roleIdOrCode) ?? {
      id: 'funcionario',
      code: 'funcionario',
      name: 'Funcionario',
      level: 2,
      levelName: 'Nivel 2: Operativo Dinámico',
      desc: 'Acceso condicionado a los permisos dinámicos asignados.',
      color: '#B5A160',
      isProtected: false,
      permissions: ['view_dashboard', 'view_files', 'respond_petitions', 'download_documents'],
    }
  );
}

/**
 * Determina si un usuario tiene un permiso específico.
 * Administrador siempre retorna true (acceso total).
 * Funcionario evalúa sus permisos dinámicos asignados o predeterminados.
 */
export function hasPermission(
  user: InstitutionalUser,
  permissionId: string,
  dynamicUserPermissions?: string[]
): boolean {
  const role = getRoleById(user.roleId);
  if (role.code === 'admin' || role.id === 'admin') return true;

  // Si se proveen permisos dinámicos específicos asignados al funcionario por el Administrador
  if (dynamicUserPermissions && Array.isArray(dynamicUserPermissions)) {
    return dynamicUserPermissions.includes(permissionId);
  }

  // De lo contrario, evalúa los permisos base del rol
  return Array.isArray(role.permissions) && role.permissions.includes(permissionId);
}

/**
 * Verifica si el usuario tiene uno de los roles indicados ('admin' | 'funcionario').
 */
export function hasRole(user: InstitutionalUser, roleCodes: string[]): boolean {
  const role = getRoleById(user.roleId);
  return roleCodes.includes(role.code) || roleCodes.includes(role.id);
}

/**
 * Retorna la etiqueta legible de un permiso por su id.
 */
export function getPermissionLabel(permissionId: string): string {
  return (
    PERMISSIONS_CATALOG.find((p) => p.id === permissionId)?.label ??
    permissionId
  );
}

