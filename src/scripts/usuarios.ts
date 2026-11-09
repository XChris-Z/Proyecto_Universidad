// src/scripts/usuarios.ts
// Lógica de cliente para Gestión de Usuarios, Roles y Permisos Granulares RBAC en Supabase

import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';

export function initUsuarios() {
  let activePermsUserId: string | null = null;
  let userPermissionsMap: Record<string, string[]> = {};

  // 1. Cargar Permisos desde Supabase
  async function loadAllPermissions() {
    try {
      const { data: dbPerms } = await supabase.from('user_permissions').select('*');
      if (dbPerms) {
        userPermissionsMap = {};
        dbPerms.forEach((row: any) => {
          if (!userPermissionsMap[row.user_id]) userPermissionsMap[row.user_id] = [];
          if (row.is_granted && row.permission_id) {
            userPermissionsMap[row.user_id]!.push(row.permission_id);
          }
        });
      }
    } catch (err) {
      console.warn('Aviso cargando permisos de Supabase:', err);
    }
  }

  // 2. Filtrado y Búsqueda en la Tabla
  const searchInput = document.getElementById('user-search-input') as HTMLInputElement | null;
  const filterButtons = document.querySelectorAll('.user-filter-btn');

  function applyUserFilters() {
    const query = (searchInput?.value || '').toLowerCase().trim();
    const activeBtn = document.querySelector('.user-filter-btn.active');
    const selectedRole = activeBtn?.getAttribute('data-role') || 'all';

    const rows = document.querySelectorAll<HTMLTableRowElement>('#users-table-body .user-row');
    rows.forEach(row => {
      const name = (row.dataset.userName || '').toLowerCase();
      const email = (row.dataset.userEmail || '').toLowerCase();
      const cargo = (row.dataset.userCargo || '').toLowerCase();
      const role = row.dataset.userRole || 'funcionario';

      const matchesQuery = !query || name.includes(query) || email.includes(query) || cargo.includes(query);
      const matchesRole = selectedRole === 'all' || role === selectedRole;

      row.style.display = matchesQuery && matchesRole ? '' : 'none';
    });
  }

  searchInput?.addEventListener('input', applyUserFilters);

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyUserFilters();
    });
  });

  // 3. Modal de Permisos Dinámicos
  const permsModal = document.getElementById('modal-permissions');
  const permsUserName = document.getElementById('perm-modal-user-name');
  const permsUserDesc = document.getElementById('perm-modal-user-desc');
  const permsAdminBanner = document.getElementById('perms-admin-banner');
  const btnSavePerms = document.getElementById('btn-save-dynamic-perms');
  const btnClosePerms = document.getElementById('btn-close-perms-modal');
  const btnCancelPerms = document.getElementById('btn-cancel-perms-modal');

  function closePermsModal() {
    if (permsModal) permsModal.style.display = 'none';
    activePermsUserId = null;
  }

  btnClosePerms?.addEventListener('click', closePermsModal);
  btnCancelPerms?.addEventListener('click', closePermsModal);

  function openPermsModal(userId: string, userName: string, userCargo: string, userRole: string) {
    activePermsUserId = userId;
    if (permsUserName) permsUserName.textContent = `Permisos: ${userName}`;
    if (permsUserDesc) permsUserDesc.textContent = `${userCargo} • ${userRole === 'admin' ? 'Administrador General' : 'Funcionario Operativo'}`;

    const isAdmin = userRole === 'admin';
    if (permsAdminBanner) permsAdminBanner.style.display = isAdmin ? 'block' : 'none';
    if (btnSavePerms) (btnSavePerms as HTMLButtonElement).disabled = isAdmin;

    const userPerms = userPermissionsMap[userId] || (isAdmin 
      ? ['view_dashboard', 'view_files', 'upload_files', 'reassign_files', 'respond_petitions', 'manage_templates', 'manage_users', 'manage_roles', 'download_documents', 'delete_files']
      : ['view_dashboard', 'view_files', 'respond_petitions', 'download_documents']);

    const checkboxes = document.querySelectorAll<HTMLInputElement>('.perm-checkbox');
    checkboxes.forEach((cb) => {
      const permId = cb.dataset.permId || '';
      cb.checked = isAdmin || userPerms.includes(permId);
      cb.disabled = isAdmin;
    });

    if (permsModal) permsModal.style.display = 'flex';
  }

  btnSavePerms?.addEventListener('click', async () => {
    const targetUserId = activePermsUserId;
    if (!targetUserId) return;

    const checkboxes = document.querySelectorAll<HTMLInputElement>('.perm-checkbox:checked');
    const newPerms: string[] = [];
    checkboxes.forEach((cb) => {
      if (cb.dataset.permId) newPerms.push(cb.dataset.permId);
    });

    const saveBtn = btnSavePerms as HTMLButtonElement | null;
    if (saveBtn) {
      saveBtn.textContent = 'Guardando cambios...';
      saveBtn.disabled = true;
    }

    try {
      await (supabase.from('user_permissions') as any).delete().eq('user_id', targetUserId);

      if (newPerms.length > 0) {
        const rowsToInsert = newPerms.map((permId) => ({
          user_id: targetUserId,
          permission_id: permId,
          is_granted: true,
          created_at: new Date().toISOString(),
        }));
        await supabase.from('user_permissions').insert(rowsToInsert);
      }

      userPermissionsMap[targetUserId] = newPerms;

      await logSystemActivity({
        actor: { id: 'usr-root', name: 'ING. Christian Lemus', role: 'admin' },
        action: 'Actualización de Permisos Granulares',
        actionType: 'SEGURIDAD',
        entity: 'Permisos Dinámicos RBAC',
        entityId: targetUserId,
        details: `Se actualizaron ${newPerms.length} permisos dinámicos para el usuario ${targetUserId}.`,
        severity: 'WARN'
      });

      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast('Permisos dinámicos guardados exitosamente.', 'success');
      }
      closePermsModal();
    } catch (err: any) {
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast('Error al guardar permisos: ' + (err.message || 'Error en base de datos'), 'error');
      }
    } finally {
      if (saveBtn) {
        saveBtn.textContent = 'Guardar Permisos Dinámicos';
        saveBtn.disabled = false;
      }
    }
  });

  // 4. Modal de Editar Usuario
  const editUserModal = document.getElementById('modal-edit-user');
  const editUserId = document.getElementById('edit-user-id') as HTMLInputElement | null;
  const editUserName = document.getElementById('edit-user-name') as HTMLInputElement | null;
  const editUserEmail = document.getElementById('edit-user-email') as HTMLInputElement | null;
  const editUserRole = document.getElementById('edit-user-role') as HTMLSelectElement | null;
  const editUserCargo = document.getElementById('edit-user-cargo') as HTMLInputElement | null;
  const formEditUser = document.getElementById('form-edit-user');
  const btnCloseEdit = document.getElementById('btn-close-edit-modal');
  const btnCancelEdit = document.getElementById('btn-cancel-edit-user');

  function closeEditModal() {
    if (editUserModal) editUserModal.style.display = 'none';
  }

  btnCloseEdit?.addEventListener('click', closeEditModal);
  btnCancelEdit?.addEventListener('click', closeEditModal);

  function openEditModal(userId: string, userName: string, userEmail: string, userCargo: string, userRole: string) {
    if (editUserId) editUserId.value = userId;
    if (editUserName) editUserName.value = userName;
    if (editUserEmail) editUserEmail.value = userEmail;
    if (editUserRole) editUserRole.value = userRole;
    if (editUserCargo) editUserCargo.value = userCargo;

    if (editUserModal) editUserModal.style.display = 'flex';
  }

  formEditUser?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editUserId || !editUserName || !editUserRole || !editUserCargo) return;

    const id = editUserId.value;
    const name = editUserName.value.trim();
    const role = editUserRole.value;
    const cargo = editUserCargo.value.trim();

    const submitBtn = document.getElementById('btn-submit-edit-user') as HTMLButtonElement | null;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    try {
      const nowIso = new Date().toISOString();
      await supabase.from('profiles').update({
        full_name: name,
        role,
        cargo,
        updated_at: nowIso,
      }).eq('id', id);

      await (supabase.from('users') as any).update({
        name,
        role,
        updated_at: nowIso,
      }).eq('id', id);

      // Actualizar fila en el DOM
      const row = document.getElementById(`row-user-${id}`);
      if (row) {
        row.dataset.userName = name;
        row.dataset.userCargo = cargo;
        row.dataset.userRole = role;

        const nameText = row.querySelector('td:first-child strong, td:first-child div[style*="font-weight: 800"]');
        if (nameText) nameText.textContent = name;
        const cargoText = row.querySelector('td:nth-child(3) span');
        if (cargoText) cargoText.textContent = cargo;
      }

      await logSystemActivity({
        actor: { id: 'usr-root', name: 'ING. Christian Lemus', role: 'admin' },
        action: 'Modificación de Datos de Funcionario',
        actionType: 'MODIFICACION',
        entity: 'Control de Usuarios y Roles',
        entityId: id,
        details: `Se actualizaron datos de "${name}": Rol: ${role.toUpperCase()}, Cargo: "${cargo}".`,
        severity: 'INFO'
      });

      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast('Funcionario modificado con éxito.', 'success');
      }
      closeEditModal();
      setTimeout(() => window.location.reload(), 500);
    } catch (err: any) {
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast('Error al modificar usuario: ' + (err.message || 'Error en el servidor'), 'error');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Modificaciones';
      }
    }
  });

  // 5. Modal Crear Usuario
  const createModal = document.getElementById('modal-create-user');
  const btnOpenCreate = document.getElementById('btn-open-create-user');
  const btnCloseCreate = document.getElementById('btn-close-create-modal');
  const btnCancelCreate = document.getElementById('btn-cancel-create-user');
  const passInput = document.getElementById('create-user-password') as HTMLInputElement | null;
  const btnGenPass = document.getElementById('btn-generate-password');
  const formCreate = document.getElementById('form-create-new-user');

  function toggleCreateModal(open: boolean) {
    if (createModal) createModal.style.display = open ? 'flex' : 'none';
  }

  btnOpenCreate?.addEventListener('click', () => toggleCreateModal(true));
  btnCloseCreate?.addEventListener('click', () => toggleCreateModal(false));
  btnCancelCreate?.addEventListener('click', () => toggleCreateModal(false));

  btnGenPass?.addEventListener('click', () => {
    if (!passInput) return;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    passInput.value = pass;
  });

  formCreate?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('create-user-name') as HTMLInputElement).value.trim();
    const email = (document.getElementById('create-user-email') as HTMLInputElement).value.trim().toLowerCase();
    const role = (document.getElementById('create-user-role') as HTMLSelectElement).value;
    const cargo = (document.getElementById('create-user-cargo') as HTMLInputElement).value.trim();
    const password = passInput?.value.trim() || '';

    if (password.length < 8) {
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast('La contraseña provisional debe tener al menos 8 caracteres.', 'warning');
      }
      return;
    }

    const submitBtn = document.getElementById('btn-submit-create-user') as HTMLButtonElement | null;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creando funcionario...';
    }

    try {
      const { data: createData, error: rpcErr } = await (supabase.rpc as any)('admin_create_user', {
        p_name: name,
        p_email: email,
        p_password: password,
        p_role: role,
        p_cargo: cargo || (role === 'admin' ? 'Administrador' : 'Funcionario')
      });

      if (rpcErr) throw rpcErr;

      const newId = createData?.id || `usr-${Date.now().toString(36)}`;
      await logSystemActivity({
        actor: { id: 'usr-root', name: 'ING. Christian Lemus', role: 'admin' },
        action: 'Creación de Funcionario Institucional',
        actionType: 'SEGURIDAD',
        entity: 'Control de Usuarios y Roles',
        entityId: newId,
        details: `Registro oficial de "${name}" (${email}) con rol ${role.toUpperCase()} y cargo "${cargo}".`,
        severity: 'INFO'
      });

      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast(`Funcionario ${name} registrado satisfactoriamente.`, 'success');
      }
      toggleCreateModal(false);
      (formCreate as HTMLFormElement).reset();
      setTimeout(() => window.location.reload(), 600);
    } catch (err: any) {
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast('Error creando usuario: ' + (err.message || 'Error en base de datos'), 'error');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Crear Funcionario';
      }
    }
  });

  // 6. Modal Eliminar Usuario
  let userToDelete: { id: string; name: string; email: string } | null = null;
  const deleteModal = document.getElementById('modal-delete-user');
  const deleteModalName = document.getElementById('delete-user-modal-name');
  const deleteModalEmail = document.getElementById('delete-user-modal-email');
  const btnCancelDelete = document.getElementById('btn-cancel-delete-user');
  const btnConfirmDelete = document.getElementById('btn-confirm-delete-user');

  function closeDeleteModal() {
    if (deleteModal) deleteModal.style.display = 'none';
    userToDelete = null;
  }

  btnCancelDelete?.addEventListener('click', closeDeleteModal);

  btnConfirmDelete?.addEventListener('click', async () => {
    const targetUser = userToDelete;
    if (!targetUser) return;

    const confirmBtn = btnConfirmDelete as HTMLButtonElement | null;
    if (confirmBtn) {
      confirmBtn.textContent = 'Eliminando...';
      confirmBtn.disabled = true;
    }

    try {
      const { error: delRpcErr } = await (supabase.rpc as any)('admin_delete_user', {
        p_user_id: targetUser.id
      });
      if (delRpcErr) throw delRpcErr;

      await logSystemActivity({
        actor: { id: 'usr-root', name: 'ING. Christian Lemus', role: 'admin' },
        action: 'Baja y Eliminación de Funcionario',
        actionType: 'ELIMINACION',
        entity: 'Control de Usuarios y Roles',
        entityId: targetUser.id,
        details: `El Administrador dio de baja y eliminó al funcionario "${targetUser.name}" (${targetUser.email}).`,
        severity: 'CRITICAL'
      });

      const row = document.getElementById(`row-user-${targetUser.id}`);
      if (row) row.remove();

      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast(`El funcionario ${targetUser.name} fue eliminado.`, 'success');
      }
      closeDeleteModal();
    } catch (err: any) {
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast('Error eliminando usuario: ' + (err.message || 'Error en el servidor'), 'error');
      }
    } finally {
      if (confirmBtn) {
        confirmBtn.textContent = 'Confirmar Eliminación';
        confirmBtn.disabled = false;
      }
    }
  });

  // 7. Delegación Global de Clics en la Tabla de Usuarios
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // A. Botón Gestionar Permisos
    const permsBtn = target.closest('.btn-manage-perms') as HTMLElement | null;
    if (permsBtn) {
      e.preventDefault();
      const uid = permsBtn.dataset.userId || '';
      const name = permsBtn.dataset.userName || '';
      const cargo = permsBtn.dataset.userCargo || '';
      const role = permsBtn.dataset.userRole || 'funcionario';
      openPermsModal(uid, name, cargo, role);
      return;
    }

    // B. Botón Editar Usuario
    const editBtn = target.closest('.btn-edit-user') as HTMLElement | null;
    if (editBtn) {
      e.preventDefault();
      const uid = editBtn.dataset.userId || '';
      const name = editBtn.dataset.userName || '';
      const email = editBtn.dataset.userEmail || '';
      const cargo = editBtn.dataset.userCargo || '';
      const role = editBtn.dataset.userRole || 'funcionario';
      openEditModal(uid, name, email, cargo, role);
      return;
    }

    // C. Botón Eliminar Usuario
    const deleteBtn = target.closest('.btn-delete-user') as HTMLElement | null;
    if (deleteBtn) {
      e.preventDefault();
      userToDelete = {
        id: deleteBtn.dataset.userId || '',
        name: deleteBtn.dataset.userName || '',
        email: deleteBtn.dataset.userEmail || '',
      };
      if (deleteModal && deleteModalName && deleteModalEmail) {
        deleteModalName.textContent = userToDelete.name;
        deleteModalEmail.textContent = userToDelete.email;
        deleteModal.style.display = 'flex';
      }
      return;
    }
  });

  // Inicialización
  async function init() {
    await loadAllPermissions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
