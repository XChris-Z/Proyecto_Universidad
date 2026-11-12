// src/lib/rbac-server.ts
// Resolución y persistencia server-side del modelo RBAC (12 módulos, roles personalizados y permisos por usuario)

import { supabase } from './supabase';
import {
  ALL_PERMISSION_IDS,
  DEFAULT_FUNCIONARIO_PERMISSIONS,
  PERMISSIONS_CATALOG,
  SYSTEM_ROLES,
} from '@data/roles';
import {
  getRoleDisplayName,
  isAdminRoleCode,
  normalizePermissionsList,
} from './permissions';
import type { RbacConfigState, SystemRole } from './types';

export interface ResolvedUserRbac {
  authenticated: boolean;
  userId: string;
  email: string;
  fullName: string;
  cargo: string;
  avatarUrl: string | null;
  roleId: string;
  roleName: string;
  isAdmin: boolean;
  effectivePermissions: string[];
  hasExplicitUserPermissions: boolean;
  roles: SystemRole[];
}

function buildDefaultState(): RbacConfigState {
  return {
    roles: SYSTEM_ROLES.map((r) => ({ ...r, permissions: [...r.permissions] })),
    userCustomRoles: {},
    userPermissionsOverride: {},
    updatedAt: new Date().toISOString(),
  };
}

export async function ensureCatalogPermissionsInDb(): Promise<void> {
  try {
    const rows = PERMISSIONS_CATALOG.map((p) => ({
      id: p.id,
      category: p.category,
      label: p.label,
      description: p.desc,
    }));
    await supabase.from('permissions').upsert(rows, { onConflict: 'id' });
  } catch {
    // Continuar con respaldo snapshot si RLS bloquea escritura directa en permissions
  }
}

export async function loadRbacState(): Promise<RbacConfigState> {
  const base = buildDefaultState();
  const rolesMap = new Map<string, SystemRole>();
  for (const r of base.roles) {
    rolesMap.set(r.id, { ...r, permissions: [...r.permissions] });
  }

  try {
    const [rolesRes, rolePermsRes, usersRes, userPermsRes, snapshotRes] = await Promise.all([
      supabase.from('roles').select('*'),
      supabase.from('role_permissions').select('*'),
      supabase.from('users').select('id, email, role_id, role_title'),
      supabase.from('user_permissions').select('*'),
      supabase
        .from('audit_logs')
        .select('after_state, raw_timestamp')
        .eq('entity', 'rbac_state_snapshot')
        .order('raw_timestamp', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const rolePermsByRole: Record<string, string[]> = {};
    if (Array.isArray(rolePermsRes.data)) {
      for (const rp of rolePermsRes.data as any[]) {
        if (!rp?.role_id || !rp?.permission_id) continue;
        if (!rolePermsByRole[rp.role_id]) rolePermsByRole[rp.role_id] = [];
        rolePermsByRole[rp.role_id]!.push(String(rp.permission_id));
      }
    }

    if (Array.isArray(rolesRes.data)) {
      for (const row of rolesRes.data as any[]) {
        if (!row?.id && !row?.code) continue;
        const id = String(row.id || row.code);
        if (isAdminRoleCode(id)) {
          rolesMap.set('admin', {
            ...SYSTEM_ROLES[0]!,
            name: 'Administrador',
            isProtected: true,
            permissions: [...ALL_PERMISSION_IDS],
          });
          continue;
        }
        const existing = rolesMap.get(id);
        const dbRolePerms = rolePermsByRole[id];
        const normalizedPerms =
          dbRolePerms && dbRolePerms.length > 0
            ? normalizePermissionsList(dbRolePerms)
            : existing?.permissions || [...DEFAULT_FUNCIONARIO_PERMISSIONS];

        rolesMap.set(id, {
          id,
          code: String(row.code || id),
          name: id === 'funcionario' ? 'Funcionario' : String(row.name || existing?.name || id),
          level: Number(row.level || existing?.level || 2),
          levelName: id === 'funcionario' ? 'Operativo Dinámico' : String(row.level_name || 'Rol Personalizado'),
          desc: String(row.description || existing?.desc || 'Rol personalizado institucional'),
          color: String(row.color || existing?.color || '#00594E'),
          isProtected: id === 'admin' || id === 'funcionario' || Boolean(row.is_protected),
          permissions: normalizedPerms,
        });
      }
    }

    const userCustomRoles: Record<string, string> = {};
    const usersEmailById: Record<string, string> = {};
    if (Array.isArray(usersRes.data)) {
      for (const u of usersRes.data as any[]) {
        if (u?.id && u?.email) usersEmailById[u.id] = String(u.email).toLowerCase();
        if (u?.role_id) {
          const rid = isAdminRoleCode(u.role_id) ? 'admin' : String(u.role_id);
          if (u.id) userCustomRoles[u.id] = rid;
          if (u.email) userCustomRoles[String(u.email).toLowerCase()] = rid;
        }
      }
    }

    const userPermissionsOverride: Record<string, string[]> = {};
    if (Array.isArray(userPermsRes.data)) {
      for (const up of userPermsRes.data as any[]) {
        if (!up?.user_id || !up?.permission_id || up.is_granted === false) continue;
        const uid = String(up.user_id);
        if (!userPermissionsOverride[uid]) userPermissionsOverride[uid] = [];
        userPermissionsOverride[uid]!.push(String(up.permission_id));
      }
      for (const uid of Object.keys(userPermissionsOverride)) {
        userPermissionsOverride[uid] = normalizePermissionsList(userPermissionsOverride[uid]);
        const email = usersEmailById[uid];
        if (email) userPermissionsOverride[email] = userPermissionsOverride[uid]!;
      }
    }

    // Superponer snapshot autoritativo (soporta roles personalizados + listas [] explícitamente vacías)
    const snap = (snapshotRes.data as any)?.after_state as RbacConfigState | null;
    if (snap && typeof snap === 'object') {
      if (Array.isArray(snap.roles)) {
        // Mantener roles base + roles del snapshot; eliminar roles personalizados borrados del snapshot
        const snapIds = new Set(snap.roles.map((r) => r.id));
        for (const existingKey of Array.from(rolesMap.keys())) {
          if (existingKey !== 'admin' && existingKey !== 'funcionario' && !snapIds.has(existingKey)) {
            rolesMap.delete(existingKey);
          }
        }
        for (const sr of snap.roles) {
          if (!sr?.id) continue;
          if (sr.id === 'admin' || isAdminRoleCode(sr.id)) {
            rolesMap.set('admin', {
              ...SYSTEM_ROLES[0]!,
              name: 'Administrador',
              isProtected: true,
              permissions: [...ALL_PERMISSION_IDS],
            });
          } else {
            rolesMap.set(sr.id, {
              id: sr.id,
              code: sr.code || sr.id,
              name: sr.id === 'funcionario' ? 'Funcionario' : sr.name,
              level: Number(sr.level || 2),
              levelName: sr.id === 'funcionario' ? 'Operativo Dinámico' : sr.levelName || 'Rol Personalizado',
              desc: sr.desc || '',
              color: sr.color || '#00594E',
              isProtected: sr.id === 'funcionario' ? true : Boolean(sr.isProtected),
              permissions: normalizePermissionsList(sr.permissions || []),
            });
          }
        }
      }

      if (snap.userCustomRoles && typeof snap.userCustomRoles === 'object') {
        for (const [k, v] of Object.entries(snap.userCustomRoles)) {
          if (k && v) userCustomRoles[k] = String(v);
        }
      }

      if (snap.userPermissionsOverride && typeof snap.userPermissionsOverride === 'object') {
        for (const [k, v] of Object.entries(snap.userPermissionsOverride)) {
          if (k && Array.isArray(v)) {
            userPermissionsOverride[k] = normalizePermissionsList(v);
          }
        }
      }
    }

    return {
      roles: Array.from(rolesMap.values()),
      userCustomRoles,
      userPermissionsOverride,
      updatedAt: snap?.updatedAt || new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[RBAC] Fallback a configuración base:', err);
    return base;
  }
}

export async function persistRbacSnapshot(
  state: RbacConfigState,
  actor: { id: string; name: string; role: string },
  clientIp?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const payload = {
    roles: state.roles,
    userCustomRoles: state.userCustomRoles,
    userPermissionsOverride: state.userPermissionsOverride,
    updatedAt: new Date().toISOString(),
  };

  const nowIso = new Date().toISOString();
  const buildRow = (actorIdVal: string | null) => ({
    actor_id: actorIdVal,
    actor_name: actor.name || 'Administrador',
    actor_role: 'Administrador',
    action: 'RBAC_STATE_SYNC',
    action_type: 'SEGURIDAD',
    entity: 'rbac_state_snapshot',
    entity_id: 'rbac_config_v2',
    details: 'Sincronización estructural de matriz RBAC (12 módulos y roles).',
    severity: 'INFO',
    ip_address: clientIp || null,
    previous_hash: 'RBAC-SNAPSHOT-ROOT',
    integrity_hash: `RBAC-${Date.now().toString(36)}`,
    after_state: payload as any,
    raw_timestamp: nowIso,
  });

  try {
    let res = await supabase.from('audit_logs').insert([buildRow(actor.id || 'usr-root')]);
    if (res.error) {
      res = await supabase.from('audit_logs').insert([buildRow(null)]);
    }
    if (res.error) {
      return { ok: false, error: res.error.message };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Error guardando snapshot RBAC' };
  }
}

export async function resolveUserRbacServer(sessionUserId?: string | null): Promise<ResolvedUserRbac> {
  const cleanSessionId = String(sessionUserId || '').trim();
  if (!cleanSessionId) {
    const base = buildDefaultState();
    return {
      authenticated: false,
      userId: '',
      email: '',
      fullName: '',
      cargo: '',
      avatarUrl: null,
      roleId: 'funcionario',
      roleName: 'Funcionario',
      isAdmin: false,
      effectivePermissions: [],
      hasExplicitUserPermissions: false,
      roles: base.roles,
    };
  }

  const isRoot = cleanSessionId === 'usr-root';
  const [rbacState, profileRes] = await Promise.all([
    loadRbacState(),
    isRoot
      ? supabase
          .from('profiles')
          .select('id, full_name, email, role, cargo, avatar_url')
          .or('id.eq.usr-root,email.eq.christianlemus.es@unitropico.edu.co')
          .maybeSingle()
      : supabase
          .from('profiles')
          .select('id, full_name, email, role, cargo, avatar_url')
          .or(`id.eq.${cleanSessionId},email.eq.${cleanSessionId}`)
          .maybeSingle(),
  ]);

  const profile = profileRes.data as any;
  const userId = profile?.id || cleanSessionId;
  const email = String(profile?.email || (isRoot ? 'christianlemus.es@unitropico.edu.co' : '')).toLowerCase();
  const fullName = profile?.full_name || (isRoot ? 'ING. Christian Lemus' : 'Funcionario Institucional');
  const cargo = profile?.cargo || (isRoot ? 'Administrador' : 'Dependencia Institucional');
  const avatarUrl = profile?.avatar_url || null;

  const customRoleId =
    rbacState.userCustomRoles[userId] ||
    (email ? rbacState.userCustomRoles[email] : undefined) ||
    rbacState.userCustomRoles[cleanSessionId];

  const isAdmin =
    isRoot ||
    isAdminRoleCode(profile?.role) ||
    isAdminRoleCode(customRoleId);

  const resolvedRoleId = isAdmin ? 'admin' : customRoleId || 'funcionario';
  const roleObj =
    rbacState.roles.find((r) => r.id === resolvedRoleId || r.code === resolvedRoleId) ||
    rbacState.roles.find((r) => r.id === 'funcionario') ||
    SYSTEM_ROLES[1]!;

  const roleName = isAdmin ? 'Administrador' : getRoleDisplayName(roleObj.id, rbacState.roles);

  const hasOverrideById = Object.prototype.hasOwnProperty.call(rbacState.userPermissionsOverride, userId);
  const hasOverrideByEmail = Boolean(
    email && Object.prototype.hasOwnProperty.call(rbacState.userPermissionsOverride, email)
  );
  const hasOverrideBySession = Object.prototype.hasOwnProperty.call(
    rbacState.userPermissionsOverride,
    cleanSessionId
  );
  const hasExplicitUserPermissions = hasOverrideById || hasOverrideByEmail || hasOverrideBySession;

  let effectivePermissions: string[];
  if (isAdmin) {
    effectivePermissions = [...ALL_PERMISSION_IDS];
  } else if (hasExplicitUserPermissions) {
    const rawOverride =
      (hasOverrideById ? rbacState.userPermissionsOverride[userId] : undefined) ??
      (hasOverrideByEmail && email ? rbacState.userPermissionsOverride[email] : undefined) ??
      rbacState.userPermissionsOverride[cleanSessionId] ??
      [];
    effectivePermissions = normalizePermissionsList(rawOverride);
  } else {
    effectivePermissions = normalizePermissionsList(
      roleObj.permissions || DEFAULT_FUNCIONARIO_PERMISSIONS
    );
  }

  return {
    authenticated: true,
    userId,
    email,
    fullName,
    cargo,
    avatarUrl,
    roleId: resolvedRoleId,
    roleName,
    isAdmin,
    effectivePermissions,
    hasExplicitUserPermissions,
    roles: rbacState.roles,
  };
}

