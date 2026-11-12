// src/lib/permissions.ts
// Helpers RBAC compartidos (SSR + Cliente) para los 12 módulos institucionales (Ver / Gestionar) y roles personalizados

import type { InstitutionalUser, RbacModuleDef, SystemRole } from './types';
import {
  ALL_PERMISSION_IDS,
  DEFAULT_FUNCIONARIO_PERMISSIONS,
  PERMISSIONS_CATALOG,
  RBAC_MODULES,
  SYSTEM_ROLES,
} from '@data/roles';

const LEGACY_PERMISSION_MAP: Record<string, string[]> = {
  view_dashboard: ['dashboard.ver'],
  view_files: ['archivos.ver', 'peticiones.ver'],
  download_documents: ['archivos.ver', 'peticiones.ver'],
  upload_files: ['subir.ver', 'subir.gestionar'],
  reassign_files: ['archivos.ver', 'archivos.gestionar', 'peticiones.ver', 'peticiones.gestionar'],
  respond_petitions: ['archivos.ver', 'archivos.gestionar', 'peticiones.ver', 'peticiones.gestionar'],
  delete_files: ['archivos.ver', 'archivos.gestionar', 'peticiones.ver', 'peticiones.gestionar'],
  manage_templates: ['normas.ver', 'normas.gestionar'],
  manage_users: ['usuarios.gestionar'],
  manage_roles: ['usuarios.gestionar'],
};

const VALID_MODULE_IDS = new Set(RBAC_MODULES.map((m) => m.id));

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

/**
 * Normaliza un arreglo de permisos (v2 `<mod>.ver`/`.gestionar` + legado), garantizando que
 * todo permiso `.gestionar` implique también `.ver`.
 */
export function normalizePermissionsList(rawPerms: string[] | null | undefined): string[] {
  if (!Array.isArray(rawPerms)) return [];
  const result = new Set<string>();

  for (const raw of rawPerms) {
    const perm = String(raw || '').trim();
    if (!perm) continue;

    if (LEGACY_PERMISSION_MAP[perm]) {
      LEGACY_PERMISSION_MAP[perm]!.forEach((mapped) => result.add(mapped));
      continue;
    }

    result.add(perm);
    if (perm.endsWith('.gestionar')) {
      const modId = perm.slice(0, -'.gestionar'.length);
      if (VALID_MODULE_IDS.has(modId)) {
        result.add(`${modId}.ver`);
      }
    }
  }

  return Array.from(result);
}

/**
 * Resuelve qué módulo de los 12 corresponde a una ruta dada.
 * Evalúa prefijos específicos primero (`/peticiones/subir` antes que `/peticiones`).
 */
export function getModuleByPath(pathname: string): RbacModuleDef | null {
  const cleanPath = (pathname || '/').replace(/\/+$/, '') || '/';
  const sortedModules = [...RBAC_MODULES].sort((a, b) => b.href.length - a.href.length);
  for (const mod of sortedModules) {
    if (cleanPath === mod.href || cleanPath.startsWith(`${mod.href}/`)) {
      return mod;
    }
  }
  return null;
}

export function isAdminOnlyPath(pathname: string): boolean {
  const cleanPath = (pathname || '/').replace(/\/+$/, '') || '/';
  return (
    cleanPath === '/admin' ||
    cleanPath.startsWith('/admin/') ||
    cleanPath === '/usuarios' ||
    cleanPath.startsWith('/usuarios/')
  );
}

export function hasModulePermission(
  effectivePerms: string[],
  moduleId: string,
  action: 'ver' | 'gestionar',
  isAdmin = false
): boolean {
  if (isAdmin) return true;
  if (action === 'ver') {
    return (
      effectivePerms.includes(`${moduleId}.ver`) ||
      effectivePerms.includes(`${moduleId}.gestionar`)
    );
  }
  return effectivePerms.includes(`${moduleId}.gestionar`);
}

export function canAccessModuleRoute(
  pathname: string,
  effectivePerms: string[],
  isAdmin = false
): boolean {
  if (isAdmin) return true;
  if (isAdminOnlyPath(pathname)) return false;

  const mod = getModuleByPath(pathname);
  if (mod) {
    return hasModulePermission(effectivePerms, mod.id, 'ver', false);
  }

  // Rutas transversales permitidas a todo usuario autenticado (/perfil, /dependencias, /auth/*, /)
  return true;
}

export function getFirstAllowedPath(effectivePerms: string[], isAdmin = false): string {
  if (isAdmin) return '/dashboard';
  for (const mod of RBAC_MODULES) {
    if (hasModulePermission(effectivePerms, mod.id, 'ver', false)) {
      return mod.href;
    }
  }
  return '/perfil';
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

  const normalized = normalizePermissionsList(sourcePerms);
  if (normalized.includes(permissionId)) return true;

  if (permissionId.endsWith('.ver')) {
    const modId = permissionId.slice(0, -'.ver'.length);
    return normalized.includes(`${modId}.gestionar`);
  }

  const legacyExpanded = normalizePermissionsList([permissionId]);
  return legacyExpanded.some((id) => normalized.includes(id));
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

export { ALL_PERMISSION_IDS, DEFAULT_FUNCIONARIO_PERMISSIONS };
