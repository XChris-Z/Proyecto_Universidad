// src/lib/permissions.ts
// Sistema de control de acceso basado en roles (RBAC)
// Fase 1: opera sobre datos mock. Fase 3: usará Supabase Auth.

import type { InstitutionalUser, SystemRole } from './types';
import { SYSTEM_ROLES, PERMISSIONS_CATALOG } from '@data/roles';

/**
 * Obtiene un rol por su id. Retorna un rol placeholder si no lo encuentra.
 */
export function getRoleById(roleId: string): SystemRole {
  return (
    SYSTEM_ROLES.find((r) => r.id === roleId) ?? {
      id: 'role-unknown',
      code: 'user',
      name: 'Funcionario',
      level: 99,
      levelName: 'Desconocido',
      desc: '',
      color: '#0284c7',
      isProtected: false,
      permissions: [],
    }
  );
}

/**
 * Determina si un usuario tiene un permiso específico.
 * Root siempre retorna true.
 */
export function hasPermission(
  user: InstitutionalUser,
  permissionId: string
): boolean {
  const role = getRoleById(user.roleId);
  if (role.code === 'root') return true;
  return Array.isArray(role.permissions) && role.permissions.includes(permissionId);
}

/**
 * Verifica si el usuario tiene uno de los códigos de rol indicados.
 * Ejemplo: requiresRole(user, ['root', 'admin'])
 */
export function hasRole(user: InstitutionalUser, roleCodes: string[]): boolean {
  const role = getRoleById(user.roleId);
  return roleCodes.includes(role.code);
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

