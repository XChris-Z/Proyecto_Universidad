// src/scripts/appLayout.ts
// Lógica compartida de la shell institucional (Sidebar, Topbar, Modales globales, Sesión)

import { INSTITUTIONAL_USERS } from '@data/users';
import { SYSTEM_ROLES } from '@data/roles';
import { documents } from '@data/documents';
import { CALENDARIO_EVENTS } from '@data/calendar';
import { SESSION_STORAGE_KEY, SESSION_COOKIE_KEY } from '@lib/constants';
import { calculateDeadlineProgress } from '@lib/utils';
import type { InstitutionalUser } from '@lib/types';

// Extender Window para tipado de utilidades globales
declare global {
  interface Window {
    showToast: (message: string, isError?: boolean) => void;
    currentLoggedUser: InstitutionalUser;
    updateUserProfileUI: () => void;
  }
}

export function initAppLayout() {
  // 1. Resolver usuario activo desde storage o defecto
  let activeUser: InstitutionalUser = INSTITUTIONAL_USERS[0]!; // Por defecto Rector/Root
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY) || sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const found = INSTITUTIONAL_USERS.find(u => u.id === parsed.userId);
      if (found) activeUser = found;
    }
  } catch (err) {
    console.error('Error al recuperar sesión:', err);
  }

  window.currentLoggedUser = activeUser;

  // 2. Función global Toast
  window.showToast = function (message: string, isError = false) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;
    toast.innerHTML = `
      <div class="toast-content" style="display:flex; align-items:center; gap:8px;">
        <span>${isError ? '⚠️' : '✅'}</span>
        <span>${message}</span>
      </div>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  };

  // 3. Actualizar perfil en el Sidebar
  window.updateUserProfileUI = function () {
    const u = window.currentLoggedUser;
    const avatarEl = document.getElementById('avatar-initials');
    const nameEl = document.getElementById('user-display-name');
    const roleBadgeEl = document.getElementById('user-role-badge');

    if (avatarEl) {
      avatarEl.textContent = u.initials;
      avatarEl.style.backgroundColor = u.avatarColor;
    }
    if (nameEl) nameEl.textContent = u.name;
    if (roleBadgeEl) {
      const role = SYSTEM_ROLES.find(r => r.id === u.roleId);
      const roleName = role ? role.name.toUpperCase() : u.role.toUpperCase();
      roleBadgeEl.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
        <span>${roleName}</span>
      `;
    }
  };

  window.updateUserProfileUI();

  // 4. Fecha del Topbar
  const dateText = document.getElementById('current-date-text');
  if (dateText) {
    const now = new Date();
    dateText.textContent = now.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  }

  // 5. Menú móvil (Sidebar)
  const btnMenuToggle = document.getElementById('btn-mobile-menu-toggle');
  const btnMenuClose = document.getElementById('btn-mobile-sidebar-close');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const sidebarEl = document.querySelector('.sidebar');

  function openSidebar() {
    sidebarEl?.classList.add('mobile-open');
    sidebarBackdrop?.classList.add('active');
  }

  function closeSidebar() {
    sidebarEl?.classList.remove('mobile-open');
    sidebarBackdrop?.classList.remove('active');
  }

  btnMenuToggle?.addEventListener('click', openSidebar);
  btnMenuClose?.addEventListener('click', closeSidebar);
  sidebarBackdrop?.addEventListener('click', closeSidebar);

  // 6. Cierre de sesión
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    document.cookie = `${SESSION_COOKIE_KEY}=; path=/; max-age=0;`;
    window.showToast('Sesión finalizada. Redirigiendo...');
    setTimeout(() => {
      window.location.href = '/login';
    }, 500);
  });

  // 7. Conmutador de Perfiles (Simulador RBAC)
  const switchUserModal = document.getElementById('switch-user-modal');
  const btnToggleRole = document.getElementById('btn-toggle-role');
  const btnCloseSwitchUser = document.getElementById('btn-close-switch-user-modal');
  const btnCloseSwitchFooter = document.getElementById('btn-close-switch-modal-footer');
  const userSwitcherContainer = document.getElementById('user-switcher-container');

  function renderUserSwitcher() {
    if (!userSwitcherContainer) return;
    userSwitcherContainer.innerHTML = '';

    INSTITUTIONAL_USERS.forEach((u) => {
      const isCurrent = u.id === window.currentLoggedUser.id;
      const role = SYSTEM_ROLES.find(r => r.id === u.roleId);
      const card = document.createElement('div');
      card.className = `user-switch-card ${isCurrent ? 'active' : ''}`;
      card.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 16px; border: 1px solid ${isCurrent ? 'var(--primary)' : 'var(--border-color)'};
        border-radius: 8px; margin-bottom: 8px; cursor: pointer;
        background: ${isCurrent ? 'var(--primary-subtle)' : 'var(--bg-surface)'};
        transition: all 0.2s;
      `;
      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 36px; height: 36px; border-radius: 50%; background: ${u.avatarColor}; color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; font-size: 0.85rem;">
            ${u.initials}
          </div>
          <div>
            <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-main);">${u.name}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">${u.role} &bull; ${u.email}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="role-badge" style="background: ${role?.color || '#0284c7'}; color: #fff; font-size: 0.7rem; padding: 3px 8px; border-radius: 4px;">
            ${role?.name || u.role}
          </span>
          ${isCurrent ? '<span style="color: var(--primary); font-weight: 800; font-size: 0.85rem;">(Activo)</span>' : ''}
        </div>
      `;

      card.addEventListener('click', () => {
        window.currentLoggedUser = u;
        const payload = { userId: u.id, email: u.email, loggedAt: new Date().toISOString() };
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
        document.cookie = `${SESSION_COOKIE_KEY}=${u.id}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax`;
        window.updateUserProfileUI();
        if (switchUserModal) switchUserModal.style.display = 'none';
        window.showToast(`Perfil conmutado a: ${u.name} (${u.role})`);
        renderUserSwitcher();
      });

      userSwitcherContainer.appendChild(card);
    });
  }

  btnToggleRole?.addEventListener('click', () => {
    renderUserSwitcher();
    if (switchUserModal) switchUserModal.style.display = 'flex';
  });

  btnCloseSwitchUser?.addEventListener('click', () => {
    if (switchUserModal) switchUserModal.style.display = 'none';
  });

  btnCloseSwitchFooter?.addEventListener('click', () => {
    if (switchUserModal) switchUserModal.style.display = 'none';
  });

  // 8. Centro de Notificaciones del Rector
  const rectorAlertsModal = document.getElementById('rector-alerts-modal');
  const btnRectorAlerts = document.getElementById('btn-rector-alerts');
  const btnCloseRectorAlerts = document.getElementById('btn-close-rector-alerts');
  const btnCloseRectorFooter = document.getElementById('btn-close-rector-alerts-footer');
  const rectorAlertsList = document.getElementById('rector-alerts-list');

  function renderRectorAlerts() {
    if (!rectorAlertsList) return;
    rectorAlertsList.innerHTML = '';

    const urgentDocs = documents.filter(d => d.responseStatus === 'pendiente');
    urgentDocs.forEach(doc => {
      const progress = calculateDeadlineProgress(doc.uploadDate, doc.dueDate);
      const item = document.createElement('div');
      item.className = 'rector-alert-card';
      item.style.cssText = 'padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px; background: var(--bg-surface);';
      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
          <div>
            <span class="badge ${progress.statusClass}" style="font-size: 0.72rem; padding: 2px 6px; border-radius: 4px;">
              ${progress.statusBadge}
            </span>
            <strong style="font-size: 0.88rem; margin-left: 8px; color: var(--text-main);">${doc.title}</strong>
          </div>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${doc.radicado}</span>
        </div>
        <div style="font-size: 0.78rem; color: var(--text-muted); display: flex; justify-content: space-between;">
          <span>Peticionario: ${doc.applicant} (${doc.applicantType})</span>
          <span>Vence: ${doc.dueDate}</span>
        </div>
      `;
      rectorAlertsList.appendChild(item);
    });

    CALENDARIO_EVENTS.filter(e => e.urgencia === 'danger').forEach(ev => {
      const item = document.createElement('div');
      item.className = 'rector-alert-card';
      item.style.cssText = 'padding: 12px; border: 1px solid #fecaca; border-radius: 8px; margin-bottom: 8px; background: #fef2f2;';
      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
          <div>
            <span class="badge status-critico" style="font-size: 0.72rem; padding: 2px 6px; border-radius: 4px;">
              URGENTE: ${ev.diasRestantes} días
            </span>
            <strong style="font-size: 0.88rem; margin-left: 8px; color: #991b1b;">${ev.titulo}</strong>
          </div>
          <span style="font-size: 0.75rem; color: #991b1b;">${ev.fecha}</span>
        </div>
        <div style="font-size: 0.78rem; color: #7f1d1d;">
          ${ev.descripcion} &bull; Responsable: ${ev.responsable}
        </div>
      `;
      rectorAlertsList.appendChild(item);
    });
  }

  btnRectorAlerts?.addEventListener('click', () => {
    renderRectorAlerts();
    if (rectorAlertsModal) rectorAlertsModal.style.display = 'flex';
  });

  btnCloseRectorAlerts?.addEventListener('click', () => {
    if (rectorAlertsModal) rectorAlertsModal.style.display = 'none';
  });

  btnCloseRectorFooter?.addEventListener('click', () => {
    if (rectorAlertsModal) rectorAlertsModal.style.display = 'none';
  });

  // 9. Modal de Radicación / Subir Archivo
  const uploadModal = document.getElementById('upload-modal');
  const btnTopUpload = document.getElementById('btn-topbar-upload');
  const btnCloseUpload = document.getElementById('btn-close-upload-modal');
  const btnCancelUpload = document.getElementById('btn-cancel-upload');
  const uploadForm = document.getElementById('upload-doc-form') as HTMLFormElement | null;
  const selectResponsible = document.getElementById('select-doc-responsible') as HTMLSelectElement | null;

  function populateResponsibleSelect() {
    if (!selectResponsible) return;
    selectResponsible.innerHTML = '';
    INSTITUTIONAL_USERS.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.name} — ${u.role}`;
      selectResponsible.appendChild(opt);
    });
  }

  function openUploadModal() {
    populateResponsibleSelect();
    const upDateInput = document.getElementById('input-upload-date') as HTMLInputElement | null;
    const dueDateInput = document.getElementById('input-due-date') as HTMLInputElement | null;
    const now = new Date();
    if (upDateInput) upDateInput.value = now.toISOString().split('T')[0] ?? '';
    if (dueDateInput) {
      const due = new Date();
      due.setDate(due.getDate() + 15);
      dueDateInput.value = due.toISOString().split('T')[0] ?? '';
    }
    if (uploadModal) uploadModal.style.display = 'flex';
  }

  function closeUploadModal() {
    if (uploadModal) uploadModal.style.display = 'none';
  }

  btnTopUpload?.addEventListener('click', openUploadModal);
  btnCloseUpload?.addEventListener('click', closeUploadModal);
  btnCancelUpload?.addEventListener('click', closeUploadModal);

  document.querySelectorAll('[data-action="open-upload-modal"]').forEach(btn => {
    btn.addEventListener('click', openUploadModal);
  });

  uploadForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const titleInput = document.getElementById('input-doc-title') as HTMLInputElement | null;
    const applicantInput = document.getElementById('input-doc-applicant') as HTMLInputElement | null;
    const title = titleInput?.value || 'Documento sin título';
    const applicant = applicantInput?.value || 'Peticionario anónimo';

    const newRadicado = `UNIT-2026-SGD-${Math.floor(1000 + Math.random() * 9000)}`;

    window.showToast(`Expediente radicado exitosamente con consecutivo: ${newRadicado}`);
    closeUploadModal();
    uploadForm.reset();
  });

  // Dropzone drag-and-drop
  const dropzone = document.getElementById('file-dropzone');
  const fileSelector = document.getElementById('file-input-selector') as HTMLInputElement | null;
  const detectedCard = document.getElementById('file-detected-card');
  const detectedName = document.getElementById('detected-file-name');

  dropzone?.addEventListener('click', () => fileSelector?.click());
  fileSelector?.addEventListener('change', () => {
    if (fileSelector.files && fileSelector.files[0]) {
      const file = fileSelector.files[0];
      if (detectedName) detectedName.textContent = file.name;
      if (detectedCard) detectedCard.style.display = 'flex';
    }
  });

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (detectedName) detectedName.textContent = file.name;
      if (detectedCard) detectedCard.style.display = 'flex';
    }
  });
}
