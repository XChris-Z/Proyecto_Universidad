// src/pages/api/usuarios/editar.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabaseAdmin, supabase } from '@lib/supabase';
import { logSystemActivity, computeHumanDiff } from '@lib/audit';
import { resolveSessionActor } from '@lib/request-actor';
import {
  tienePermiso,
  isAdminRoleCode,
  getRoleDisplayName,
  normalizePermissionsList,
  DEFAULT_FUNCIONARIO_PERMISSIONS,
} from '@lib/permisos';

const db: any = supabaseAdmin || supabase;

const RBAC_SETTINGS_KEY = 'system_rbac_state';

async function loadRbacState(): Promise<any> {
  try {
    const { data } = await db
      .from('system_settings')
      .select('value')
      .eq('key', RBAC_SETTINGS_KEY)
      .maybeSingle();

    if (data?.value && typeof data.value === 'object') {
      return data.value;
    }
  } catch (err) {
    console.warn('[RBAC State Load Warning]:', err);
  }
  return {
    roles: [],
    userPermissionsOverride: {},
    userCustomRoles: {},
  };
}

async function saveRbacState(state: any, actor: any) {
  try {
    state.updatedAt = new Date().toISOString();
    state.updatedBy = actor.id || actor.name || 'system';

    await db.from('system_settings').upsert({
      key: RBAC_SETTINGS_KEY,
      value: state,
      description: 'Estado sincronizado del catálogo de roles y permisos RBAC',
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[RBAC State Save Error]:', err);
  }
}

export const POST: APIRoute = async ({ request, clientAddress, cookies }) => {
  try {
    // 1. Validar actor de sesión y permisos
    const actor = await resolveSessionActor(cookies);
    const callerIsAdmin = actor.role === 'admin' || actor.id === 'usr-root' || isAdminRoleCode(actor.role);
    const canEditUsers = callerIsAdmin || tienePermiso(actor, 'usuarios', 'editar');

    if (!canEditUsers) {
      return new Response(
        JSON.stringify({ success: false, error: 'No tienes permisos para modificar funcionarios.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const targetUserId = String(body.userId || '').trim();
    const newName = String(body.name || '').trim();
    const newEmail = String(body.email || body.userEmail || '').trim().toLowerCase();
    const selectedRoleId = String(body.roleId || 'funcionario').trim();
    const newCargo = String(body.cargo || '').trim();
    const newSubtitulo = String(body.subtitulo || '').trim();
    const newEstado = String(body.estado || 'activo').trim().toLowerCase();
    const newPassword = typeof body.password === 'string' ? body.password.trim() : '';
    const applyRolePermissions = body.applyRolePermissions !== false;

    if (!targetUserId || !newName || !newCargo) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nombre completo, ID y dependencia oficial son requeridos.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Consultar perfil actual antes de actualizar
    const { data: previousProfile } = await db
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .maybeSingle();

    const previousRoleCode = previousProfile?.role || 'funcionario';
    const targetIsAdmin = targetUserId === 'usr-root' || isAdminRoleCode(previousRoleCode);

    // Candado anti-escalamiento: un no-admin no puede modificar a un Administrador
    if (targetIsAdmin && !callerIsAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Solo un Administrador puede modificar los datos de una cuenta Administrador.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Candado anti-escalamiento: un no-admin no puede otorgar el rol Administrador
    const isAssigningAdmin = isAdminRoleCode(selectedRoleId);
    if (isAssigningAdmin && !callerIsAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Solo un Administrador puede asignar el rol Administrador.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const state = await loadRbacState();
    const roleObj = state.roles?.find((r: any) => r.id === selectedRoleId || r.code === selectedRoleId);
    const finalRoleName = roleObj?.name || (isAssigningAdmin ? 'Administrador' : 'Funcionario');

    const willBeAdmin = targetUserId === 'usr-root' || isAssigningAdmin;
    const baseDbRole = willBeAdmin ? 'admin' : 'funcionario';
    const nowIso = new Date().toISOString();

    const updateProfilePayload: Record<string, any> = {
      full_name: newName,
      role: baseDbRole,
      cargo: newCargo,
      updated_at: nowIso,
    };

    if (newSubtitulo) updateProfilePayload.subtitulo = newSubtitulo;
    if (newEstado) updateProfilePayload.is_active = newEstado === 'activo';

    // 3. Si el correo cambió y el operador es Administrador, sincronizar Auth + DB
    let emailChanged = false;
    const oldEmail = (previousProfile?.email || '').toLowerCase().trim();
    if (callerIsAdmin && newEmail && newEmail !== oldEmail) {
      emailChanged = true;
      updateProfilePayload.email = newEmail;

      if (supabaseAdmin?.auth?.admin) {
        try {
          await supabaseAdmin.auth.admin.updateUserById(targetUserId, { email: newEmail });
        } catch (authErr: any) {
          console.warn('[Auth Admin Email Update Warning]:', authErr?.message);
        }
      }
    }

    // 4. Si se proporcionó una nueva contraseña, actualizar vía Supabase Auth Admin
    let passwordChanged = false;
    if (newPassword) {
      if (newPassword.length < 8) {
        return new Response(
          JSON.stringify({ success: false, error: 'La nueva contraseña debe tener mínimo 8 caracteres.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (supabaseAdmin?.auth?.admin) {
        try {
          const { error: pwdErr } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
            password: newPassword,
          });
          if (pwdErr) {
            return new Response(
              JSON.stringify({ success: false, error: `Error restableciendo contraseña: ${pwdErr.message}` }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
          }
          passwordChanged = true;
        } catch (authErr: any) {
          console.warn('[Auth Admin Password Update Warning]:', authErr?.message);
        }
      }
    }

    // 5. Actualizar registro en tabla profiles
    const { error: updateErr } = await db
      .from('profiles')
      .update(updateProfilePayload)
      .eq('id', targetUserId);

    if (updateErr) {
      return new Response(
        JSON.stringify({ success: false, error: updateErr.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Intentar sincronizar tabla users si existe
    try {
      await db
        .from('users')
        .update({
          name: newName,
          role_id: selectedRoleId,
          role_title: finalRoleName,
          ...(emailChanged ? { email: newEmail } : {}),
          updated_at: nowIso,
        })
        .eq('id', targetUserId);
    } catch {}

    // 6. Actualizar asignación de rol en RBAC snapshot
    if (!state.userCustomRoles) state.userCustomRoles = {};
    const finalRoleId = willBeAdmin ? 'admin' : selectedRoleId;
    state.userCustomRoles[targetUserId] = finalRoleId;
    if (newEmail) state.userCustomRoles[newEmail] = finalRoleId;

    // Si cambió de rol y se marcó aplicar plantilla de permisos del nuevo rol
    if (applyRolePermissions && !willBeAdmin && roleObj) {
      if (!state.userPermissionsOverride) state.userPermissionsOverride = {};
      const rawRolePerms = roleObj.permissions || DEFAULT_FUNCIONARIO_PERMISSIONS;
      const templatePerms = normalizePermissionsList(rawRolePerms);
      state.userPermissionsOverride[targetUserId] = templatePerms;
      if (newEmail) state.userPermissionsOverride[newEmail] = templatePerms;

      try {
        await db.from('user_permissions').delete().eq('user_id', targetUserId);
        if (templatePerms.length > 0) {
          await db.from('user_permissions').insert(
            templatePerms.map((pId: string) => ({
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

    await saveRbacState(state, actor);

    // 7. Auditoría con Human Diff
    const beforeComparable: Record<string, any> = {
      nombre: previousProfile?.full_name || '',
      correo: oldEmail,
      rol: getRoleDisplayName(previousRoleCode, state.roles),
      dependencia: previousProfile?.cargo || '',
      estado: previousProfile?.is_active === false ? 'Inactivo / Suspendido' : 'Activo',
    };

    const afterComparable: Record<string, any> = {
      nombre: newName,
      correo: emailChanged ? newEmail : oldEmail,
      rol: finalRoleName,
      dependencia: newCargo,
      estado: newEstado === 'inactivo' ? 'Inactivo / Suspendido' : 'Activo',
    };

    const fieldLabels: Record<string, string> = {
      nombre: 'Nombre Completo',
      correo: 'Correo Institucional',
      rol: 'Rol Asignado',
      dependencia: 'Dependencia Oficial',
      estado: 'Estado de la Cuenta',
    };

    const { diffText: baseDiff, changedFieldsCount } = computeHumanDiff(
      beforeComparable,
      afterComparable,
      fieldLabels
    );

    const changesList = baseDiff ? [baseDiff] : [];
    if (passwordChanged) {
      changesList.push("Contraseña: 'Restablecida exitosamente'");
    }

    const fullDiffText = changesList.join(' • ');

    if (changedFieldsCount > 0 || passwordChanged) {
      await logSystemActivity({
        actor,
        action: `Edición de Funcionario (${newName})`,
        actionType: 'MODIFICACION',
        entity: 'Control de Usuarios y Roles',
        entityId: targetUserId,
        details: `Actualización de cuenta para "${newName}" (${newEmail || oldEmail}): ${fullDiffText}`,
        before: beforeComparable,
        after: afterComparable,
        severity: 'INFO',
        request,
        clientAddress,
        cookies,
      }).catch((err) => console.error('[AUDITORIA ERROR] Error registrando auditoría editar usuario:', err));
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Funcionario modificado con éxito.',
        diff: fullDiffText,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[API Editar Usuario Error]:', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Error interno al actualizar usuario.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
