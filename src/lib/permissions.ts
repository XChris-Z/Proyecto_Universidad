// src/lib/permissions.ts
// Re-exporta y adapta funciones RBAC hacia @lib/permisos
import {
  ALL_PERMISSION_IDS,
  DEFAULT_FUNCIONARIO_PERMISSIONS,
  MODULOS_SISTEMA,
  SYSTEM_ROLES,
  canAccessModuleRoute,
  canCreateAdminAccount,
  canDeleteUserTarget,
  canManageRolesAndPermissions,
  canModifyUserTarget,
  filterNonEscalatedPermissions,
  getFirstAllowedPath,
  getModuleByPath,
  getRoleById,
  getRoleDisplayName,
  isAdminRoleCode,
  normalizePermissionsList,
  tienePermiso,
} from './permisos';
import { PERMISSIONS_CATALOG } from '@data/roles';
import type { InstitutionalUser, SystemRole } from './types';

export {
  ALL_PERMISSION_IDS,
  DEFAULT_FUNCIONARIO_PERMISSIONS,
  MODULOS_SISTEMA,
  SYSTEM_ROLES,
  canAccessModuleRoute,
  canCreateAdminAccount,
  canDeleteUserTarget,
  canManageRolesAndPermissions,
  canModifyUserTarget,
  filterNonEscalatedPermissions,
  getFirstAllowedPath,
  getModuleByPath,
  getRoleById,
  getRoleDisplayName,
  isAdminRoleCode,
  normalizePermissionsList,
  tienePermiso,
};

export function isAdminOnlyPath(pathname: string): boolean {
  const cleanPath = (pathname || '/').replace(/\/+$/, '') || '/';
  // Solo rutas de administración técnica estricta que no correspondan a módulos delegables
  return cleanPath === '/admin' || cleanPath.startsWith('/admin/configuracion');
}

export function hasModulePermission(
  effectivePerms: any,
  moduleId: string,
  action: 'ver' | 'gestionar' | string,
  isAdmin = false
): boolean {
  if (isAdmin) return true;
  return tienePermiso(effectivePerms, moduleId, action);
}

export function hasPermission(
  user: InstitutionalUser,
  permissionId: string,
  dynamicUserPermissions?: string[],
  rolesCatalog: SystemRole[] = SYSTEM_ROLES
): boolean {
  if (isAdminRoleCode(user.roleId) || isAdminRoleCode(user.role)) return true;
  const sourcePerms = Array.isArray(dynamicUserPermissions)
    ? dynamicUserPermissions
    : getRoleById(user.roleId, rolesCatalog).permissions || DEFAULT_FUNCIONARIO_PERMISSIONS;

  if (permissionId.includes('.')) {
    const [mod, act] = permissionId.split('.');
    return tienePermiso(sourcePerms, mod || '', act || 'ver');
  }
  return tienePermiso(sourcePerms, permissionId, 'ver');
}

export function hasRole(user: InstitutionalUser, roleCodes: string[], rolesCatalog: SystemRole[] = SYSTEM_ROLES): boolean {
  const role = getRoleById(user.roleId, rolesCatalog);
  return roleCodes.includes(role.code) || roleCodes.includes(role.id);
}

export function getPermissionLabel(permissionId: string): string {
  return (
    PERMISSIONS_CATALOG.find((p) => p.id === permissionId)?.label ??
    permissionId
  );
}
