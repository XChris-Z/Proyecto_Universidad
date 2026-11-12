// src/pages/api/admin/rbac.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import {
  ALL_PERMISSION_IDS,
  DEFAULT_FUNCIONARIO_PERMISSIONS,
  RBAC_MODULES,
  SYSTEM_ROLES,
} from '@data/roles';
import { SESSION_COOKIE_KEY } from '@lib/constants';
import {
  getRoleDisplayName,
  isAdminRoleCode,
  normalizePermissionsList,
} from '@lib/permissions';
import {
  ensureCatalogPermissionsInDb,
  loadRbacState,
  persistRbacSnapshot,
  resolveUserRbacServer,
} from '@lib/rbac-server';
import { logSystemActivity } from '@lib/audit';
import { extractClientIp, resolveSessionActor } from '@lib/request-actor';
import type { SystemRole } from '@lib/types';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function slugifyRoleId(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return `rol_${base || 'personalizado'}_${Date.now().toString(36).slice(-4)}`;
}

export const GET: APIRoute = async ({ url, cookies }) => {
  const sessionId = cookies.get(SESSION_COOKIE_KEY)?.value;
  if (!sessionId) {
    return jsonResponse({ success: false, error: 'No autenticado' }, 401);
  }

  const mode = url.searchParams.get('mode') || 'full';
  const currentUserRbac = await resolveUserRbacServer(sessionId);
  if (!currentUserRbac.authenticated) {
    return jsonResponse({ success: false, error: 'Sesión inválida' }, 401);
  }

  if (mode === 'me') {
    return jsonResponse({
      success: true,
      user: {
        id: currentUserRbac.userId,
        email: currentUserRbac.email,
        fullName: currentUserRbac.fullName,
        cargo: currentUserRbac.cargo,
        roleId: currentUserRbac.roleId,
        roleName: currentUserRbac.roleName,
        isAdmin: currentUserRbac.isAdmin,
        effectivePermissions: currentUserRbac.effectivePermissions,
      },
      roles: currentUserRbac.roles,
      modules: RBAC_MODULES,
    });
  }

  if (!currentUserRbac.isAdmin) {
    return jsonResponse({ success: false, error: 'Acceso restringido al Administrador' }, 403);
  }

  const fullState = await loadRbacState();
  return jsonResponse({
    success: true,
    roles: fullState.roles,
    modules: RBAC_MODULES,
    userCustomRoles: fullState.userCustomRoles,
    userPermissions: fullState.userPermissionsOverride,
  });
};

export const POST: APIRoute = async ({ request, clientAddress, cookies }) => {
  const sessionId = cookies.get(SESSION_COOKIE_KEY)?.value;
  if (!sessionId) {
    return jsonResponse({ success: false, error: 'No autenticado' }, 401);
  }

  const currentRbac = await resolveUserRbacServer(sessionId);
  if (!currentRbac.authenticated || !currentRbac.isAdmin) {
    return jsonResponse(
      { success: false, error: 'Solo el rol Administrador puede modificar roles, usuarios o permisos.' },
      403
    );
  }

  const actor = await resolveSessionActor(cookies);
  const clientIp = extractClientIp(request, clientAddress);

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Cuerpo JSON inválido' }, 400);
  }

  const action = String(body.action || '').trim();
  const state = await loadRbacState();

  try {
    // 1. Guardar matriz de permisos de un usuario específico (12 módulos .ver / .gestionar)
    if (action === 'save_user_permissions') {
      const targetUserId = String(body.userId || '').trim();
      const targetEmail = String(body.userEmail || '').trim().toLowerCase();
      const targetName = String(body.userName || targetEmail || targetUserId).trim();

      if (!targetUserId) {
        return jsonResponse({ success: false, error: 'Identificador de usuario requerido' }, 400);
      }

      const rawPerms: string[] = Array.isArray(body.permissions) ? body.permissions : [];
      const normalizedPerms = normalizePermissionsList(rawPerms);

      await ensureCatalogPermissionsInDb();

      // Sincronizar tabla relacional user_permissions en Supabase (si RLS lo permite)
      try {
        await (supabase.from('user_permissions') as any).delete().eq('user_id', targetUserId);
        if (normalizedPerms.length > 0) {
          const rows = normalizedPerms.map((permId) => ({
            user_id: targetUserId,
            permission_id: permId,
            is_granted: true,
            granted_by: actor.id || 'usr-root',
            created_at: new Date().toISOString(),
          }));
          await supabase.from('user_permissions').insert(rows);
        }
      } catch {
        // El snapshot en Supabase garantiza persistencia exacta incluso si permissions FK o RLS falla
      }

      state.userPermissionsOverride[targetUserId] = normalizedPerms;
      if (targetEmail) state.userPermissionsOverride[targetEmail] = normalizedPerms;

      const snapRes = await persistRbacSnapshot(state, actor, clientIp);
      if (!snapRes.ok) {
        return jsonResponse({ success: false, error: snapRes.error || 'No se pudo persistir permisos RBAC' }, 500);
      }

      await logSystemActivity({
        request,
        clientAddress,
        cookies,
        actor,
        action: `Actualización de Permisos RBAC (${targetName})`,
        actionType: 'SEGURIDAD',
        entity: 'Matriz de Permisos RBAC',
        entityId: targetUserId,
        details: `Se asignaron ${normalizedPerms.length} permiso(s) modular(es) al funcionario ${targetName}.`,
        after: { userId: targetUserId, permissions: normalizedPerms },
        severity: 'WARN',
      });

      return jsonResponse({
        success: true,
        userId: targetUserId,
        permissions: normalizedPerms,
        message: 'Matriz de permisos guardada correctamente.',
      });
    }

    // 2. Actualizar información y rol (base o personalizado) de un usuario
    if (action === 'update_user') {
      const targetUserId = String(body.userId || '').trim();
      const targetEmail = String(body.userEmail || '').trim().toLowerCase();
      const name = String(body.name || '').trim();
      const cargo = String(body.cargo || '').trim();
      const selectedRoleId = String(body.roleId || 'funcionario').trim();

      if (!targetUserId || !name || !cargo) {
        return jsonResponse({ success: false, error: 'Nombre, ID y dependencia son obligatorios.' }, 400);
      }

      const roleObj =
        state.roles.find((r) => r.id === selectedRoleId || r.code === selectedRoleId) ||
        SYSTEM_ROLES[1]!;

      const isTargetAdmin = targetUserId === 'usr-root' || isAdminRoleCode(roleObj.id);
      const baseDbRole = isTargetAdmin ? 'admin' : 'funcionario';
      const nowIso = new Date().toISOString();

      const { error: profErr } = await supabase
        .from('profiles')
        .update({
          full_name: name,
          role: baseDbRole,
          cargo,
          updated_at: nowIso,
        })
        .eq('id', targetUserId);

      if (profErr) {
        return jsonResponse({ success: false, error: profErr.message }, 500);
      }

      try {
        await (supabase.from('users') as any)
          .update({
            name,
            role_id: roleObj.id,
            role_title: roleObj.name,
            updated_at: nowIso,
          })
          .eq('id', targetUserId);
      } catch {
        // Ignorar si la fila no existe en users o FK rechaza rol personalizado
      }

      const finalRoleId = isTargetAdmin ? 'admin' : roleObj.id;
      state.userCustomRoles[targetUserId] = finalRoleId;
      if (targetEmail) state.userCustomRoles[targetEmail] = finalRoleId;

      // Si cambia de rol, aplicar plantilla de permisos del nuevo rol salvo que quiera mantener override explícito
      if (body.applyRolePermissions !== false && !isTargetAdmin) {
        const templatePerms = normalizePermissionsList(roleObj.permissions || DEFAULT_FUNCIONARIO_PERMISSIONS);
        state.userPermissionsOverride[targetUserId] = templatePerms;
        if (targetEmail) state.userPermissionsOverride[targetEmail] = templatePerms;

        await ensureCatalogPermissionsInDb();
        try {
          await (supabase.from('user_permissions') as any).delete().eq('user_id', targetUserId);
          if (templatePerms.length > 0) {
            await supabase.from('user_permissions').insert(
              templatePerms.map((pId) => ({
                user_id: targetUserId,
                permission_id: pId,
                is_granted: true,
                granted_by: actor.id || 'usr-root',
                created_at: nowIso,
              }))
            );
          }
        } catch {}
      }

      await persistRbacSnapshot(state, actor, clientIp);

      await logSystemActivity({
        request,
        clientAddress,
        cookies,
        actor,
        action: `Actualización de Funcionario (${name})`,
        actionType: 'MODIFICACION',
        entity: 'Control de Usuarios y Roles',
        entityId: targetUserId,
        details: `Se actualizaron los datos de "${name}" (${targetEmail || targetUserId}): Rol "${getRoleDisplayName(finalRoleId, state.roles)}", Dependencia "${cargo}".`,
        after: { name, cargo, roleId: finalRoleId },
        severity: 'INFO',
      });

      return jsonResponse({
        success: true,
        userId: targetUserId,
        roleId: finalRoleId,
        roleName: getRoleDisplayName(finalRoleId, state.roles),
        permissions: state.userPermissionsOverride[targetUserId] || roleObj.permissions,
        message: 'Funcionario modificado con éxito.',
      });
    }

    // 3. Crear usuario mediante RPC admin_create_user + asignar rol (base o personalizado)
    if (action === 'create_user') {
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const selectedRoleId = String(body.roleId || 'funcionario').trim();
      const cargo = String(body.cargo || '').trim();

      if (!name || !email || password.length < 8) {
        return jsonResponse(
          { success: false, error: 'Nombre, correo institucional y contraseña (mín. 8 caracteres) son obligatorios.' },
          400
        );
      }

      const roleObj =
        state.roles.find((r) => r.id === selectedRoleId || r.code === selectedRoleId) ||
        SYSTEM_ROLES[1]!;

      const isNewAdmin = isAdminRoleCode(roleObj.id);
      const baseDbRole = isNewAdmin ? 'admin' : 'funcionario';

      const { data: createData, error: rpcErr } = await (supabase.rpc as any)('admin_create_user', {
        p_name: name,
        p_email: email,
        p_password: password,
        p_role: baseDbRole,
        p_cargo: cargo || roleObj.name,
      });

      if (rpcErr) {
        return jsonResponse({ success: false, error: rpcErr.message || 'No se pudo crear el usuario.' }, 400);
      }

      // Buscar ID real recién creado en profiles para enlazar permisos y rol personalizado
      const { data: createdProf } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      const newId = createdProf?.id || createData?.id || `usr-${Date.now().toString(36)}`;
      const assignedRoleId = isNewAdmin ? 'admin' : roleObj.id;
      const initialPerms = isNewAdmin
        ? [...ALL_PERMISSION_IDS]
        : normalizePermissionsList(roleObj.permissions || DEFAULT_FUNCIONARIO_PERMISSIONS);

      state.userCustomRoles[newId] = assignedRoleId;
      state.userCustomRoles[email] = assignedRoleId;
      if (!isNewAdmin) {
        state.userPermissionsOverride[newId] = initialPerms;
        state.userPermissionsOverride[email] = initialPerms;
      }

      await ensureCatalogPermissionsInDb();
      try {
        await (supabase.from('users') as any)
          .update({ role_id: assignedRoleId, role_title: roleObj.name })
          .eq('id', newId);
        if (!isNewAdmin && initialPerms.length > 0) {
          await supabase.from('user_permissions').insert(
            initialPerms.map((pId) => ({
              user_id: newId,
              permission_id: pId,
              is_granted: true,
              granted_by: actor.id || 'usr-root',
              created_at: new Date().toISOString(),
            }))
          );
        }
      } catch {}

      await persistRbacSnapshot(state, actor, clientIp);

      await logSystemActivity({
        request,
        clientAddress,
        cookies,
        actor,
        action: `Creación de Funcionario (${name})`,
        actionType: 'SEGURIDAD',
        entity: 'Control de Usuarios y Roles',
        entityId: newId,
        details: `Registro institucional de "${name}" (${email}) con rol "${roleObj.name}" y dependencia "${cargo || roleObj.name}".`,
        after: { id: newId, email, roleId: assignedRoleId, cargo },
        severity: 'INFO',
      });

      return jsonResponse({
        success: true,
        userId: newId,
        roleId: assignedRoleId,
        roleName: roleObj.name,
        message: `Usuario ${name} registrado satisfactoriamente.`,
      });
    }

    // 4. Eliminar usuario mediante RPC admin_delete_user
    if (action === 'delete_user') {
      const targetUserId = String(body.userId || '').trim();
      const targetEmail = String(body.userEmail || '').trim().toLowerCase();
      const targetName = String(body.userName || targetEmail || targetUserId).trim();

      if (!targetUserId || targetUserId === 'usr-root') {
        return jsonResponse({ success: false, error: 'El usuario Administrador principal está protegido.' }, 400);
      }

      const { error: delErr } = await (supabase.rpc as any)('admin_delete_user', {
        p_user_id: targetUserId,
      });

      if (delErr) {
        return jsonResponse({ success: false, error: delErr.message || 'No se pudo eliminar el usuario.' }, 500);
      }

      delete state.userCustomRoles[targetUserId];
      if (targetEmail) delete state.userCustomRoles[targetEmail];
      delete state.userPermissionsOverride[targetUserId];
      if (targetEmail) delete state.userPermissionsOverride[targetEmail];

      await persistRbacSnapshot(state, actor, clientIp);

      await logSystemActivity({
        request,
        clientAddress,
        cookies,
        actor,
        action: `Eliminación de Funcionario (${targetName})`,
        actionType: 'ELIMINACION',
        entity: 'Control de Usuarios y Roles',
        entityId: targetUserId,
        details: `El Administrador dio de baja y eliminó al funcionario "${targetName}" (${targetEmail}).`,
        severity: 'CRITICAL',
      });

      return jsonResponse({ success: true, message: `Usuario ${targetName} eliminado correctamente.` });
    }

    // 5. Crear o actualizar Rol (base o personalizado)
    if (action === 'upsert_role') {
      const rawId = String(body.id || '').trim();
      const name = String(body.name || '').trim();
      const desc = String(body.desc || '').trim() || 'Rol personalizado institucional con permisos definidos por el Administrador.';
      const color = String(body.color || '#00594E').trim();
      const rawPerms: string[] = Array.isArray(body.permissions) ? body.permissions : [];

      if (!name) {
        return jsonResponse({ success: false, error: 'El nombre del rol es obligatorio.' }, 400);
      }

      const isAdminTarget = rawId === 'admin' || isAdminRoleCode(name);
      if (isAdminTarget) {
        return jsonResponse(
          { success: false, error: 'El rol base Administrador mantiene control total inmutable.' },
          400
        );
      }

      const roleId = rawId || slugifyRoleId(name);
      const isBaseFuncionario = roleId === 'funcionario';
      const normalizedPerms = normalizePermissionsList(rawPerms);

      const newRole: SystemRole = {
        id: roleId,
        code: roleId,
        name: isBaseFuncionario ? 'Funcionario' : name,
        level: 2,
        levelName: isBaseFuncionario ? 'Operativo Dinámico' : 'Rol Personalizado',
        desc,
        color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#00594E',
        isProtected: isBaseFuncionario,
        permissions: normalizedPerms,
      };

      await ensureCatalogPermissionsInDb();

      try {
        await supabase.from('roles').upsert(
          {
            id: newRole.id,
            code: newRole.code,
            name: newRole.name,
            level: newRole.level,
            level_name: newRole.levelName,
            description: newRole.desc,
            color: newRole.color,
            is_protected: newRole.isProtected,
          },
          { onConflict: 'id' }
        );
        await (supabase.from('role_permissions') as any).delete().eq('role_id', newRole.id);
        if (normalizedPerms.length > 0) {
          await supabase.from('role_permissions').insert(
            normalizedPerms.map((pId) => ({
              role_id: newRole.id,
              permission_id: pId,
            }))
          );
        }
      } catch {
        // Snapshot mantiene consistencia incluso si RLS limita tablas auxiliares
      }

      const idx = state.roles.findIndex((r) => r.id === newRole.id);
      if (idx >= 0) {
        state.roles[idx] = newRole;
      } else {
        state.roles.push(newRole);
      }

      // Sincronizar usuarios que tienen este rol personalizado sin override manual o si se solicita propagar
      if (body.propagateToUsers === true) {
        for (const [uid, assignedRid] of Object.entries(state.userCustomRoles)) {
          if (assignedRid === newRole.id) {
            state.userPermissionsOverride[uid] = normalizedPerms;
          }
        }
      }

      const snapRes = await persistRbacSnapshot(state, actor, clientIp);
      if (!snapRes.ok) {
        return jsonResponse({ success: false, error: snapRes.error || 'No se pudo guardar el rol.' }, 500);
      }

      await logSystemActivity({
        request,
        clientAddress,
        cookies,
        actor,
        action: `${idx >= 0 ? 'Actualización' : 'Creación'} de Rol RBAC (${newRole.name})`,
        actionType: 'SEGURIDAD',
        entity: 'Catálogo de Roles RBAC',
        entityId: newRole.id,
        details: `Se configuró el rol "${newRole.name}" con ${normalizedPerms.length} permiso(s) modular(es).`,
        after: newRole,
        severity: 'WARN',
      });

      return jsonResponse({
        success: true,
        role: newRole,
        roles: state.roles,
        message: `Rol "${newRole.name}" guardado correctamente.`,
      });
    }

    // 6. Eliminar rol personalizado
    if (action === 'delete_role') {
      const roleId = String(body.roleId || '').trim();
      if (!roleId || roleId === 'admin' || roleId === 'funcionario') {
        return jsonResponse(
          { success: false, error: 'Los roles institucionales base (Administrador y Funcionario) están protegidos.' },
          400
        );
      }

      const targetRole = state.roles.find((r) => r.id === roleId);
      if (!targetRole) {
        return jsonResponse({ success: false, error: 'El rol especificado no existe.' }, 404);
      }

      state.roles = state.roles.filter((r) => r.id !== roleId);
      for (const [uid, rid] of Object.entries(state.userCustomRoles)) {
        if (rid === roleId) {
          state.userCustomRoles[uid] = 'funcionario';
        }
      }

      try {
        await (supabase.from('role_permissions') as any).delete().eq('role_id', roleId);
        await (supabase.from('roles') as any).delete().eq('id', roleId);
      } catch {}

      await persistRbacSnapshot(state, actor, clientIp);

      await logSystemActivity({
        request,
        clientAddress,
        cookies,
        actor,
        action: `Eliminación de Rol Personalizado (${targetRole.name})`,
        actionType: 'ELIMINACION',
        entity: 'Catálogo de Roles RBAC',
        entityId: roleId,
        details: `Se eliminó el rol "${targetRole.name}" y los usuarios asociados fueron reasignados al rol Funcionario.`,
        severity: 'WARN',
      });

      return jsonResponse({
        success: true,
        roles: state.roles,
        message: `Rol "${targetRole.name}" eliminado correctamente.`,
      });
    }

    return jsonResponse({ success: false, error: `Acción RBAC no soportada: ${action}` }, 400);
  } catch (err: any) {
    console.error('[API RBAC] Error procesando solicitud:', err);
    return jsonResponse({ success: false, error: err?.message || 'Error interno en gestión RBAC' }, 500);
  }
};

