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

  // 2. Función global Toast ejecutiva y de alto nivel con auto-dismiss garantizado en 2.8s
  window.showToast = function (
    message: string,
    typeOrIsError: boolean | 'success' | 'error' | 'warning' | 'info' | string = 'success',
    customTitle?: string
  ) {
    let container = document.getElementById('global-toast-container') || document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'global-toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    let type: 'success' | 'error' | 'warning' | 'info' = 'success';
    if (typeof typeOrIsError === 'boolean') {
      type = typeOrIsError ? 'error' : 'success';
    } else if (typeof typeOrIsError === 'string') {
      const lower = typeOrIsError.toLowerCase().trim();
      if (lower === 'error' || lower === 'danger' || lower === 'err' || lower === 'fail' || lower === 'fallo') {
        type = 'error';
      } else if (lower === 'warning' || lower === 'warn' || lower === 'alerta' || lower === 'aviso') {
        type = 'warning';
      } else if (lower === 'info' || lower === 'informacion' || lower === 'blue') {
        type = 'info';
      } else {
        type = 'success';
      }
    }

    // Si entra un nuevo toast de resultado (éxito, error o advertencia), remover de inmediato cualquier loader/info en progreso
    const activeToasts = container.querySelectorAll('.toast');
    activeToasts.forEach((t) => {
      const msg = (t.querySelector('.toast-message')?.textContent || '').toLowerCase();
      if (
        msg.includes('iniciando') ||
        msg.includes('cargando') ||
        msg.includes('procesando') ||
        msg.includes('respaldando') ||
        msg.includes('subiendo') ||
        type === 'error' ||
        type === 'warning'
      ) {
        try { t.remove(); } catch (_) {}
      }
    });

    // Máximo 2 Toasts visibles al mismo tiempo: si entra un 3.º, remover el más antiguo
    const currentToasts = container.querySelectorAll('.toast');
    if (currentToasts.length >= 2 && currentToasts[0]) {
      try { currentToasts[0].remove(); } catch (_) {}
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

    const resolvedTitle = (customTitle && typeof customTitle === 'string' && customTitle.trim() && customTitle.trim().toLowerCase() !== 'undefined')
      ? customTitle.trim()
      : (titles[type] || 'Notificación Oficial');

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-icon-wrap">
        ${icons[type] || icons.success}
      </div>
      <div class="toast-content-col">
        <div class="toast-header-row">
          <span class="toast-category">${resolvedTitle}</span>
          <button type="button" class="toast-close-btn" title="Cerrar">&times;</button>
        </div>
        <div class="toast-message">${message}</div>
      </div>
      <div class="toast-progress toast-progress-bar"></div>
    `;

    let removed = false;
    const removeToast = () => {
      if (removed) return;
      removed = true;
      toast.style.animation = 'toastFadeOut 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      setTimeout(() => {
        try { toast.remove(); } catch (_) { }
      }, 200);
    };

    const btnClose = toast.querySelector('.toast-close-btn');
    btnClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      removeToast();
    });

    // Auto-dismiss infalible en exactamente 3200ms (3.2 segundos)
    setTimeout(() => {
      removeToast();
    }, 3200);

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

  // Reemplazar window.alert y window.confirm globales para que NUNCA salga el diálogo nativo del navegador
  window.alert = function (message: any) {
    const str = String(message ?? '');
    const lower = str.toLowerCase();
    let type: 'success' | 'error' | 'warning' | 'info' = 'info';
    let title = 'Notificación Institucional';

    if (lower.includes('exitos') || lower.includes('éxito') || lower.includes('correctamente') || lower.includes('copiad')) {
      type = 'success';
      title = 'Operación Exitosa';
    } else if (lower.includes('error') || lower.includes('no se pudo') || lower.includes('fall')) {
      type = 'error';
      title = 'Error del Sistema';
    } else if (lower.includes('aviso') || lower.includes('atención') || lower.includes('criterio') || lower.includes('coincide') || lower.includes('advertencia')) {
      type = 'warning';
      title = 'Aviso del Sistema';
    }

    // Si el mensaje es largo o contiene saltos de línea, mostrar el modal institucional para lectura cómoda
    if ((str.length > 140 || str.includes('\n')) && typeof window.showAlert === 'function') {
      window.showAlert(str, type, title);
    } else {
      window.showToast(str, type, title);
    }
  };

  window.confirm = function (message?: string) {
    if (typeof window.showConfirm === 'function') {
      window.showConfirm(String(message || '¿Desea confirmar esta acción institucional?'));
    }
    return true;
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

    // Visibilidad exclusiva de funciones administrativas (Usuarios y Permisos)
    const isAdmin = u.roleId === 'admin' || (u.role && u.role.toLowerCase().includes('admin'));
    const navUsuarios = document.getElementById('nav-usuarios');
    if (navUsuarios) {
      navUsuarios.style.display = isAdmin ? 'flex' : 'none';
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

  // 7.1 Barra lateral plegable a Mini-Rail con tooltip flotante sin recorte
  const btnCollapseSidebar = document.getElementById('btn-collapse-sidebar');

  const miniTooltip = document.createElement('div');
  miniTooltip.id = 'sidebar-mini-tooltip';
  miniTooltip.className = 'sidebar-mini-tooltip';
  miniTooltip.setAttribute('role', 'tooltip');
  miniTooltip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(miniTooltip);

  function hideMiniTooltip() {
    miniTooltip.classList.remove('is-visible');
    miniTooltip.setAttribute('aria-hidden', 'true');
  }

  function showMiniTooltipFor(target: HTMLElement) {
    if (window.innerWidth < 1025 || !document.body.classList.contains('sidebar-collapsed')) return;
    const text = target.getAttribute('data-tooltip');
    if (!text) return;
    const rect = target.getBoundingClientRect();
    const centerY = Math.max(20, Math.min(window.innerHeight - 20, rect.top + rect.height / 2));
    miniTooltip.textContent = text;
    miniTooltip.style.top = `${centerY}px`;
    miniTooltip.style.left = `${rect.right + 12}px`;
    miniTooltip.setAttribute('aria-hidden', 'false');
    miniTooltip.classList.add('is-visible');
  }

  function setSidebarCollapsed(collapsed: boolean) {
    hideMiniTooltip();
    if (collapsed) {
      document.body.classList.add('sidebar-collapsed');
      localStorage.setItem('sgd_sidebar_collapsed', 'true');
      btnCollapseSidebar?.setAttribute('aria-expanded', 'false');
    } else {
      document.body.classList.remove('sidebar-collapsed');
      localStorage.setItem('sgd_sidebar_collapsed', 'false');
      btnCollapseSidebar?.setAttribute('aria-expanded', 'true');
    }
  }

  // Inicializar estado guardado en navegador en escritorio
  const isInitiallyCollapsed = window.innerWidth >= 1025 && localStorage.getItem('sgd_sidebar_collapsed') === 'true';
  if (isInitiallyCollapsed) {
    document.body.classList.add('sidebar-collapsed');
    btnCollapseSidebar?.setAttribute('aria-expanded', 'false');
  } else {
    document.body.classList.remove('sidebar-collapsed');
    btnCollapseSidebar?.setAttribute('aria-expanded', 'true');
  }

  btnCollapseSidebar?.addEventListener('click', () => {
    const isCurrentlyCollapsed = document.body.classList.contains('sidebar-collapsed');
    setSidebarCollapsed(!isCurrentlyCollapsed);
  });

  document.querySelectorAll('#app-sidebar [data-tooltip]').forEach((el) => {
    const htmlEl = el as HTMLElement;
    htmlEl.addEventListener('mouseenter', () => showMiniTooltipFor(htmlEl));
    htmlEl.addEventListener('focusin', () => showMiniTooltipFor(htmlEl));
    htmlEl.addEventListener('mouseleave', hideMiniTooltip);
    htmlEl.addEventListener('focusout', hideMiniTooltip);
  });

  document.getElementById('sidebar-nav-menu')?.addEventListener('scroll', hideMiniTooltip, { passive: true });
  window.addEventListener('resize', () => {
    hideMiniTooltip();
    if (window.innerWidth < 1025) {
      document.body.classList.remove('sidebar-collapsed');
    } else if (localStorage.getItem('sgd_sidebar_collapsed') === 'true') {
      document.body.classList.add('sidebar-collapsed');
    }
  });

  // Atajo de teclado (Ctrl + B) para conmutar barra lateral
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      if (window.innerWidth < 1025) return;
      const isNowCollapsed = document.body.classList.contains('sidebar-collapsed');
      setSidebarCollapsed(!isNowCollapsed);
    }
  });

  // 7.2 Persistencia de Scroll y Estado Activo en la Barra Lateral
  const sidebarNavMenu = document.getElementById('sidebar-nav-menu');
  const appSidebar = document.getElementById('app-sidebar');

  function restoreSidebarScrollPos() {
    try {
      const saved = sessionStorage.getItem('sidebar_scroll_pos');
      if (saved !== null) {
        const pos = parseInt(saved, 10);
        if (sidebarNavMenu && !isNaN(pos)) {
          sidebarNavMenu.scrollTop = pos;
        }
        if (appSidebar && !isNaN(pos)) {
          appSidebar.scrollTop = pos;
        }
      }
    } catch (e) { }
  }

  // Guardar en evento scroll pasivo
  sidebarNavMenu?.addEventListener('scroll', () => {
    sessionStorage.setItem('sidebar_scroll_pos', String(sidebarNavMenu.scrollTop));
  }, { passive: true });

  appSidebar?.addEventListener('scroll', () => {
    sessionStorage.setItem('sidebar_scroll_pos', String(appSidebar.scrollTop));
  }, { passive: true });

  // Guardar inmediatamente antes de navegar al hacer clic en un enlace
  document.querySelectorAll('#sidebar-nav-menu a, .sidebar a').forEach((link) => {
    link.addEventListener('click', () => {
      if (sidebarNavMenu) {
        sessionStorage.setItem('sidebar_scroll_pos', String(sidebarNavMenu.scrollTop));
      } else if (appSidebar) {
        sessionStorage.setItem('sidebar_scroll_pos', String(appSidebar.scrollTop));
      }
    });
  });

  // Restaurar de forma inmediata
  restoreSidebarScrollPos();

  // Asegurar clase .active en el enlace del módulo actual
  try {
    const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
    const navLinks = document.querySelectorAll('#sidebar-nav-menu .nav-item');
    navLinks.forEach((link) => {
      const href = (link.getAttribute('href') || '').replace(/\/$/, '');
      if (href && (currentPath === href || (href !== '/dashboard' && href !== '' && currentPath.startsWith(href)))) {
        navLinks.forEach((l) => l.classList.remove('active'));
        link.classList.add('active');
      }
    });
  } catch (e) { }

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
