// src/scripts/appLayout.ts
// Lógica compartida de la shell institucional (Sidebar, Topbar, Modales globales, Sesión, Avatares y Notificaciones)

import { INSTITUTIONAL_USERS } from '@data/users';
import { SYSTEM_ROLES } from '@data/roles';
import { SESSION_STORAGE_KEY, SESSION_COOKIE_KEY } from '@lib/constants';
import type { InstitutionalUser } from '@lib/types';
import { supabase } from '@lib/supabase';

// Extender Window para tipado de utilidades globales
declare global {
  interface Window {
    showToast: (message: string, typeOrIsError?: boolean | 'success' | 'error' | 'warning' | 'info', customTitle?: string) => void;
    showAlert: (message: string, type?: 'success' | 'error' | 'warning' | 'info', title?: string) => Promise<void>;
    showConfirm: (message: string, title?: string) => Promise<boolean>;
    openSmtpConfigModal: () => void;
    currentLoggedUser: InstitutionalUser;
    updateUserProfileUI: () => void;
  }
}

export function initAppLayout() {
  // 1. Resolver usuario activo desde storage o defecto
  let activeUser: InstitutionalUser = { ...INSTITUTIONAL_USERS[0]! }; // ING. Christian Lemus (Root)
  try {
    const rawUser = localStorage.getItem('sgd_current_user');
    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      if (parsed && parsed.name) {
        activeUser = {
          id: parsed.id || 'usr-root',
          name: parsed.name,
          email: parsed.email || 'christianlemus.es@unitropico.edu.co',
          role: parsed.role || 'Administrador General',
          roleId: parsed.roleId || 'admin',
          initials: parsed.initials || 'CL',
          avatarColor: parsed.avatarColor || '#00594E',
          avatar_url: parsed.avatar_url || parsed.avatarUrl || localStorage.getItem(`sgd_avatar_${parsed.id}`) || null,
          avatarUrl: parsed.avatar_url || parsed.avatarUrl || localStorage.getItem(`sgd_avatar_${parsed.id}`) || null,
          password: ''
        };
      }
    }
  } catch (err) {
    console.error('Error al recuperar sesión:', err);
  }

  window.currentLoggedUser = activeUser;

  // 2. Función global Toast ejecutiva y de alto nivel
  window.showToast = function (
    message: string,
    typeOrIsError: boolean | 'success' | 'error' | 'warning' | 'info' = 'success',
    customTitle?: string
  ) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    let type: 'success' | 'error' | 'warning' | 'info' = 'success';
    if (typeof typeOrIsError === 'boolean') {
      type = typeOrIsError ? 'error' : 'success';
    } else if (typeOrIsError) {
      type = typeOrIsError;
    }

    const titles: Record<string, string> = {
      success: 'Operación Exitosa',
      error: 'Atención Requerida',
      warning: 'Aviso del Sistema',
      info: 'Notificación Oficial',
    };

    const icons: Record<string, string> = {
      success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-icon-wrap">
        ${icons[type] || icons.success}
      </div>
      <div class="toast-content-col">
        <div class="toast-header-row">
          <span class="toast-category">${customTitle || titles[type]}</span>
          <button type="button" class="toast-close-btn" title="Cerrar">&times;</button>
        </div>
        <div class="toast-message">${message}</div>
      </div>
      <div class="toast-progress"></div>
    `;

    const btnClose = toast.querySelector('.toast-close-btn');
    btnClose?.addEventListener('click', () => {
      dismissToast();
    });

    let dismissTimer: any = null;
    function dismissToast() {
      if (dismissTimer) clearTimeout(dismissTimer);
      toast.style.animation = 'toastFadeOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      setTimeout(() => toast.remove(), 300);
    }

    dismissTimer = setTimeout(dismissToast, 4000);

    toast.addEventListener('mouseenter', () => {
      if (dismissTimer) clearTimeout(dismissTimer);
      const prog = toast.querySelector('.toast-progress') as HTMLElement;
      if (prog) prog.style.animationPlayState = 'paused';
    });
    toast.addEventListener('mouseleave', () => {
      dismissTimer = setTimeout(dismissToast, 2000);
      const prog = toast.querySelector('.toast-progress') as HTMLElement;
      if (prog) prog.style.animationPlayState = 'running';
    });

    container.appendChild(toast);
  };

  // Diálogo modal institucional (sustituye alert y confirm del navegador)
  window.showAlert = function (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', title?: string): Promise<void> {
    return new Promise((resolve) => {
      const modal = document.getElementById('sgd-system-dialog');
      if (!modal) {
        window.showToast(message, type, title);
        resolve();
        return;
      }

      const titleEl = document.getElementById('sgd-dialog-title');
      const msgEl = document.getElementById('sgd-dialog-message');
      const iconWrap = document.getElementById('sgd-dialog-icon-wrap');
      const btnOk = document.getElementById('sgd-dialog-btn-ok');
      const btnCancel = document.getElementById('sgd-dialog-btn-cancel');

      if (titleEl) titleEl.textContent = title || (type === 'error' ? 'Atención Requerida' : type === 'warning' ? 'Aviso del Sistema' : 'Notificación Institucional');
      if (msgEl) msgEl.textContent = message;
      if (btnCancel) btnCancel.style.display = 'none';

      if (iconWrap) {
        if (type === 'error') {
          iconWrap.style.background = '#FEE2E2';
          iconWrap.style.color = '#DC2626';
          iconWrap.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
        } else if (type === 'warning') {
          iconWrap.style.background = '#FEF3C7';
          iconWrap.style.color = '#D97706';
          iconWrap.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        } else {
          iconWrap.style.background = 'var(--verde-suave-bg)';
          iconWrap.style.color = 'var(--verde-principal)';
          iconWrap.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
        }
      }

      modal.style.display = 'flex';

      const handleOk = () => {
        modal.style.display = 'none';
        btnOk?.removeEventListener('click', handleOk);
        resolve();
      };

      btnOk?.addEventListener('click', handleOk);
    });
  };

  window.showConfirm = function (message: string, title?: string): Promise<boolean> {
    return new Promise((resolve) => {
      let modal = document.getElementById('sgd-system-dialog');
      if (!modal) {
        const div = document.createElement('div');
        div.id = 'sgd-system-dialog';
        div.className = 'modal-backdrop';
        div.style.cssText = 'display: none; z-index: 100000;';
        div.innerHTML = `
          <div class="modal-card" style="max-width: 440px; border-radius: 16px; border-top: 5px solid var(--verde-principal); box-shadow: 0 20px 40px rgba(0,0,0,0.2); text-align: center; padding: 28px 24px; background: #ffffff;">
            <div id="sgd-dialog-icon-wrap" style="width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; background: var(--verde-suave-bg); color: var(--verde-principal);">
              <svg id="sgd-dialog-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </div>
            <h3 id="sgd-dialog-title" style="font-size: 1.2rem; font-weight: 800; color: var(--text-main); margin: 0 0 8px 0;">
              Confirmación Requerida
            </h3>
            <p id="sgd-dialog-message" style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.5; margin: 0 0 22px 0; word-break: break-word;">
            </p>
            <div id="sgd-dialog-actions" style="display: flex; gap: 10px; justify-content: center;">
              <button type="button" class="btn btn-primary" id="sgd-dialog-btn-ok" style="min-width: 120px; font-weight: 700;">
                Aceptar
              </button>
              <button type="button" class="btn btn-ghost" id="sgd-dialog-btn-cancel" style="min-width: 100px;">
                Cancelar
              </button>
            </div>
          </div>
        `;
        document.body.appendChild(div);
        modal = div;
      }

      const titleEl = document.getElementById('sgd-dialog-title');
      const msgEl = document.getElementById('sgd-dialog-message');
      const iconWrap = document.getElementById('sgd-dialog-icon-wrap');
      const btnOk = document.getElementById('sgd-dialog-btn-ok') as HTMLButtonElement | null;
      const btnCancel = document.getElementById('sgd-dialog-btn-cancel') as HTMLButtonElement | null;

      const isDelete = (title || '').toLowerCase().includes('eliminar') || message.toLowerCase().includes('eliminar');

      if (titleEl) titleEl.textContent = title || (isDelete ? 'Confirmar Eliminación' : 'Confirmación Requerida');
      if (msgEl) msgEl.textContent = message;
      if (btnCancel) btnCancel.style.display = 'inline-flex';

      if (iconWrap) {
        if (isDelete) {
          iconWrap.style.background = '#FEE2E2';
          iconWrap.style.color = '#DC2626';
          iconWrap.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
        } else {
          iconWrap.style.background = 'var(--dorado-suave-bg)';
          iconWrap.style.color = 'var(--dorado-oscuro)';
          iconWrap.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
        }
      }

      if (btnOk) {
        if (isDelete) {
          btnOk.style.background = '#DC2626';
          btnOk.style.color = '#ffffff';
          btnOk.style.borderColor = '#DC2626';
          btnOk.textContent = 'Eliminar';
        } else {
          btnOk.style.background = 'var(--verde-principal)';
          btnOk.style.color = '#ffffff';
          btnOk.style.borderColor = 'var(--verde-principal)';
          btnOk.textContent = 'Aceptar';
        }
      }

      modal.style.display = 'flex';

      const handleOk = () => {
        cleanup();
        resolve(true);
      };
      const handleCancel = () => {
        cleanup();
        resolve(false);
      };
      function cleanup() {
        modal!.style.display = 'none';
        if (btnOk) {
          btnOk.style.background = '';
          btnOk.style.color = '';
          btnOk.style.borderColor = '';
          btnOk.textContent = 'Aceptar';
        }
        btnOk?.removeEventListener('click', handleOk);
        btnCancel?.removeEventListener('click', handleCancel);
      }

      btnOk?.addEventListener('click', handleOk);
      btnCancel?.addEventListener('click', handleCancel);
    });
  };

  // Reemplazar window.alert global para que NUNCA salga la alerta nativa del navegador
  window.alert = function (message: any) {
    const str = String(message ?? '');
    const lower = str.toLowerCase();
    if (lower.includes('exitos') || lower.includes('éxito') || lower.includes('correctamente') || lower.includes('copiad')) {
      window.showToast(str, 'success');
    } else if (lower.includes('error') || lower.includes('no se pudo') || lower.includes('fall')) {
      window.showToast(str, 'error');
    } else if (lower.includes('aviso') || lower.includes('atención') || lower.includes('criterio') || lower.includes('coincide')) {
      window.showToast(str, 'warning');
    } else {
      window.showToast(str, 'info');
    }
  };

  // 3. Actualizar perfil y foto en el Sidebar y Topbar
  window.updateUserProfileUI = function () {
    const u = window.currentLoggedUser;
    const avatarEl = document.getElementById('avatar-initials');
    const sidebarAvatarText = document.getElementById('sidebar-avatar-text');
    const sidebarAvatarImg = document.getElementById('sidebar-avatar-img') as HTMLImageElement;
    const nameEl = document.getElementById('user-display-name');
    const roleBadgeEl = document.getElementById('user-role-badge');

    const topbarAvatarText = document.getElementById('topbar-avatar-text');
    const topbarAvatarImg = document.getElementById('topbar-avatar-img') as HTMLImageElement;
    const topbarUserName = document.getElementById('topbar-user-name');

    const avatarUrl = u.avatar_url || 
      (u as any).avatarUrl || 
      localStorage.getItem('sgd_user_avatar') || 
      localStorage.getItem(`sgd_avatar_${u.id}`) || 
      (u.email ? localStorage.getItem(`sgd_avatar_${u.email}`) : null);

    // Renderizado en el Sidebar
    if (avatarUrl) {
      if (sidebarAvatarImg && sidebarAvatarText) {
        sidebarAvatarImg.src = avatarUrl;
        sidebarAvatarImg.style.display = 'block';
        sidebarAvatarText.style.display = 'none';
      } else if (avatarEl) {
        avatarEl.innerHTML = `<img src="${avatarUrl}" alt="Avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;
      }
    } else {
      if (sidebarAvatarText) {
        sidebarAvatarText.textContent = u.initials;
        sidebarAvatarText.style.display = 'inline';
      }
      if (sidebarAvatarImg) sidebarAvatarImg.style.display = 'none';
      if (avatarEl) {
        avatarEl.style.backgroundColor = u.avatarColor;
        if (!sidebarAvatarText) avatarEl.textContent = u.initials;
      }
    }

    // Renderizado en el Topbar
    if (avatarUrl) {
      if (topbarAvatarImg && topbarAvatarText) {
        topbarAvatarImg.src = avatarUrl;
        topbarAvatarImg.style.display = 'block';
        topbarAvatarText.style.display = 'none';
      }
    } else {
      if (topbarAvatarText) {
        topbarAvatarText.textContent = u.initials;
        topbarAvatarText.style.display = 'inline';
      }
      if (topbarAvatarImg) topbarAvatarImg.style.display = 'none';
    }

    if (nameEl) nameEl.textContent = u.name;
    if (topbarUserName) {
      const firstName = u.name.split(' ')[0] || u.name;
      topbarUserName.textContent = firstName;
    }

    if (roleBadgeEl) {
      const role = SYSTEM_ROLES.find(r => r.id === u.roleId);
      const roleName = role ? role.name.toUpperCase() : u.role.toUpperCase();
      roleBadgeEl.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
        <span>${roleName}</span>
      `;
    }

    // Visibilidad exclusiva de funciones administrativas (Usuarios y Permisos, Configuración SMTP)
    const isAdmin = u.roleId === 'admin' || (u.role && u.role.toLowerCase().includes('admin'));
    const navUsuarios = document.getElementById('nav-usuarios');
    if (navUsuarios) {
      navUsuarios.style.display = isAdmin ? 'flex' : 'none';
    }
    const btnTopbarSmtp = document.getElementById('btn-topbar-smtp');
    if (btnTopbarSmtp) {
      btnTopbarSmtp.style.display = isAdmin ? 'inline-flex' : 'none';
    }
  };

  window.updateUserProfileUI();

  // 4. Sincronizar fotografía institucional desde Supabase en background
  (async () => {
    try {
      const userEmail = activeUser.email || 'christianlemus.es@unitropico.edu.co';
      const userFilter = `id.eq.${activeUser.id},email.eq.${userEmail}`;
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url, full_name, role')
        .or(userFilter)
        .maybeSingle();

      if (profile?.avatar_url && profile.avatar_url !== activeUser.avatar_url) {
        activeUser.avatar_url = profile.avatar_url;
        activeUser.avatarUrl = profile.avatar_url;
        window.currentLoggedUser = activeUser;

        const raw = localStorage.getItem('sgd_current_user');
        let obj = raw ? JSON.parse(raw) : {};
        obj.avatar_url = profile.avatar_url;
        obj.avatarUrl = profile.avatar_url;
        localStorage.setItem('sgd_current_user', JSON.stringify(obj));
        localStorage.setItem('sgd_user_avatar', profile.avatar_url);
        localStorage.setItem(`sgd_avatar_${activeUser.id}`, profile.avatar_url);
        if (activeUser.email) {
          localStorage.setItem(`sgd_avatar_${activeUser.email}`, profile.avatar_url);
        }

        window.updateUserProfileUI();
      }
    } catch (err) {
      console.warn('Sincronización de avatar en background completada:', err);
    }
  })();

  // 5. Escuchar evento de actualización de usuario en tiempo real
  window.addEventListener('sgd-user-updated', (e: any) => {
    const detail = e.detail;
    if (detail?.avatar_url) {
      window.currentLoggedUser.avatar_url = detail.avatar_url;
      (window.currentLoggedUser as any).avatarUrl = detail.avatar_url;
      window.updateUserProfileUI();
    }
  });

  // 6. Fecha del Topbar
  const dateText = document.getElementById('current-date-text');
  if (dateText) {
    const now = new Date();
    dateText.textContent = now.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  }

  // 7. Menú móvil (Sidebar)
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

  // 7.1 Barra lateral plegable (Collapsible Sidebar)
  const btnToggleCollapse = document.getElementById('btn-toggle-sidebar-collapse');
  const isInitiallyCollapsed = localStorage.getItem('sgd_sidebar_collapsed') === 'true';
  if (isInitiallyCollapsed) {
    document.body.classList.add('sidebar-collapsed');
  }

  btnToggleCollapse?.addEventListener('click', () => {
    const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem('sgd_sidebar_collapsed', isCollapsed ? 'true' : 'false');
    btnToggleCollapse.setAttribute('title', isCollapsed ? 'Desplegar barra lateral' : 'Plegar barra lateral');
  });

  // 8. Cierre de sesión definitivo y purga integral de almacenamiento y cookies
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Aviso cerrando sesión en Supabase:', e);
    }

    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem('sgd_current_user');
    localStorage.removeItem('sgd_user_avatar');
    sessionStorage.clear();

    const cookiesToPurge = [
      SESSION_COOKIE_KEY,
      'sb-access-token',
      'sb-refresh-token',
      'sgd_session_user'
    ];
    cookiesToPurge.forEach(name => {
      document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT;`;
    });

    window.showToast('Sesión finalizada. Redirigiendo...', 'info');
    setTimeout(() => {
      window.location.replace('/login');
    }, 300);
  });

  // Prevenir que el botón "Atrás" del navegador muestre vistas protegidas en caché (bfcache)
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      const hasLocalUser = localStorage.getItem('sgd_current_user') || localStorage.getItem(SESSION_STORAGE_KEY);
      const hasCookie = document.cookie.includes(SESSION_COOKIE_KEY);
      if (!hasLocalUser && !hasCookie) {
        window.location.replace('/login');
      }
    }
  });

  // 8.1 Modal de Configuración y Conexión de Correo Institucional (Google SMTP)
  const smtpModal = document.getElementById('modal-smtp-config');
  const btnCloseSmtp = document.getElementById('btn-close-smtp-modal');
  const btnCancelSmtp = document.getElementById('btn-cancel-smtp-modal');
  const formSmtp = document.getElementById('form-smtp-config') as HTMLFormElement | null;
  const btnToggleSmtpPass = document.getElementById('btn-toggle-smtp-pass');
  const inputSmtpUser = document.getElementById('input-smtp-user') as HTMLInputElement | null;
  const inputSmtpPass = document.getElementById('input-smtp-pass') as HTMLInputElement | null;
  const feedbackSmtp = document.getElementById('smtp-status-feedback');
  const btnSubmitSmtp = document.getElementById('btn-submit-smtp-config') as HTMLButtonElement | null;
  const btnSubmitSmtpText = document.getElementById('btn-submit-smtp-text');

  window.openSmtpConfigModal = async function () {
    if (!smtpModal) return;
    smtpModal.style.display = 'flex';
    if (feedbackSmtp) feedbackSmtp.style.display = 'none';

    try {
      const res = await fetch('/api/configuracion/smtp');
      if (res.ok) {
        const data = await res.json();
        if (data.configured && data.user && inputSmtpUser) {
          inputSmtpUser.value = data.user;
          if (feedbackSmtp) {
            feedbackSmtp.style.display = 'block';
            feedbackSmtp.style.background = '#ecfdf5';
            feedbackSmtp.style.color = '#065f46';
            feedbackSmtp.style.border = '1px solid #a7f3d0';
            feedbackSmtp.innerHTML = `<strong>Correo vinculado actualmente:</strong> ${data.user} (${data.source === 'env' ? 'Variable de entorno Vercel' : 'Base de datos Supabase'}). Puedes actualizarlo ingresando nuevas credenciales.`;
          }
        }
      }
    } catch {
      // Ignorar error inicial de consulta
    }
  };

  document.getElementById('btn-topbar-smtp')?.addEventListener('click', () => {
    window.openSmtpConfigModal();
  });

  btnCloseSmtp?.addEventListener('click', () => {
    if (smtpModal) smtpModal.style.display = 'none';
  });
  btnCancelSmtp?.addEventListener('click', () => {
    if (smtpModal) smtpModal.style.display = 'none';
  });

  btnToggleSmtpPass?.addEventListener('click', () => {
    if (!inputSmtpPass) return;
    inputSmtpPass.type = inputSmtpPass.type === 'password' ? 'text' : 'password';
  });

  formSmtp?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!inputSmtpUser || !inputSmtpPass) return;

    const user = inputSmtpUser.value.trim();
    const pass = inputSmtpPass.value.trim();

    if (btnSubmitSmtp) btnSubmitSmtp.disabled = true;
    if (btnSubmitSmtpText) btnSubmitSmtpText.textContent = 'Verificando con Google...';
    if (feedbackSmtp) {
      feedbackSmtp.style.display = 'block';
      feedbackSmtp.style.background = '#eff6ff';
      feedbackSmtp.style.color = '#1e40af';
      feedbackSmtp.style.border = '1px solid #bfdbfe';
      feedbackSmtp.textContent = 'Estableciendo comunicación segura con smtp.gmail.com...';
    }

    try {
      const res = await fetch('/api/configuracion/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, pass }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (feedbackSmtp) {
          feedbackSmtp.style.background = '#fff1f2';
          feedbackSmtp.style.color = '#9f1239';
          feedbackSmtp.style.border = '1px solid #fecdd3';
          feedbackSmtp.textContent = data.error || 'Error verificando las credenciales SMTP.';
        }
        window.showToast(data.error || 'Fallo de verificación SMTP.', 'error', 'Diagnóstico SMTP');
        return;
      }

      if (feedbackSmtp) {
        feedbackSmtp.style.background = '#ecfdf5';
        feedbackSmtp.style.color = '#065f46';
        feedbackSmtp.style.border = '1px solid #a7f3d0';
        feedbackSmtp.textContent = data.message || 'Correo institucional configurado y verificado exitosamente.';
      }

      window.showToast('¡Correo Google vinculado exitosamente! Ahora los radicados enviarán notificaciones reales.', 'success', 'Conexión SMTP');
      setTimeout(() => {
        if (smtpModal) smtpModal.style.display = 'none';
      }, 1500);
    } catch (err: any) {
      if (feedbackSmtp) {
        feedbackSmtp.style.background = '#fff1f2';
        feedbackSmtp.style.color = '#9f1239';
        feedbackSmtp.style.border = '1px solid #fecdd3';
        feedbackSmtp.textContent = 'Error de conexión: ' + (err.message || 'No se pudo contactar el servidor');
      }
      window.showToast('Error de conexión al guardar configuración SMTP.', 'error');
    } finally {
      if (btnSubmitSmtp) btnSubmitSmtp.disabled = false;
      if (btnSubmitSmtpText) btnSubmitSmtpText.textContent = 'Verificar y Guardar Conexión';
    }
  });

  // 9. Conmutador de Perfiles (Simulador RBAC)
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
          <div style="width: 36px; height: 36px; border-radius: 50%; background: ${u.avatarColor}; color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; overflow: hidden;">
            ${u.avatar_url ? `<img src="${u.avatar_url}" style="width:100%; height:100%; object-fit:cover;" />` : u.initials}
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
        window.showToast(`Perfil conmutado a: ${u.name} (${u.role})`, 'info');
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
}
