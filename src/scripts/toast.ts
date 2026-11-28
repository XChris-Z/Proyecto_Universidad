// src/scripts/toast.ts
// Sistema Global Unificado de Notificaciones — Isla Dinámica Superior (Paleta Institucional Unitrópico)

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export type ToastFunction = (
  message: string,
  typeOrIsError?: boolean | ToastType | string,
  customTitle?: string,
  durationMs?: number
) => void;

const DEFAULT_DURATION_MS = 4500;
const MAX_VISIBLE_TOASTS = 3;
const EXIT_ANIMATION_MS = 210;

const TITLES: Record<ToastType, string> = {
  success: 'Operación Exitosa',
  info: 'Notificación Oficial',
  warning: 'Advertencia / Plazo',
  error: 'Atención Requerida',
};

const ICONS: Record<ToastType, string> = {
  success: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`,
  info: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  warning: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  error: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
};

function normalizeToastType(typeOrIsError: boolean | ToastType | string = 'success'): ToastType {
  if (typeof typeOrIsError === 'boolean') {
    return typeOrIsError ? 'error' : 'success';
  }
  const lower = String(typeOrIsError || '').toLowerCase().trim();
  if (lower === 'error' || lower === 'danger' || lower === 'err' || lower === 'fail' || lower === 'fallo') {
    return 'error';
  }
  if (lower === 'warning' || lower === 'warn' || lower === 'alerta' || lower === 'aviso') {
    return 'warning';
  }
  if (lower === 'info' || lower === 'informacion' || lower === 'blue') {
    return 'info';
  }
  return 'success';
}

function getOrCreateToastContainer(): HTMLElement {
  let container = document.getElementById('global-toast-container');
  const legacyContainer = document.getElementById('toast-container');

  if (!container && legacyContainer) {
    container = legacyContainer;
    container.id = 'global-toast-container';
  } else if (container && legacyContainer && legacyContainer !== container) {
    legacyContainer.remove();
  }

  if (!container) {
    container = document.createElement('div');
    container.id = 'global-toast-container';
    document.body.appendChild(container);
  }

  container.className = 'toast-container';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'false');
  return container;
}

function dismissToastElement(toast: HTMLElement): void {
  if (toast.dataset.leaving === 'true') return;
  toast.dataset.leaving = 'true';
  toast.classList.add('is-leaving');
  window.setTimeout(() => {
    try {
      toast.remove();
    } catch (_) {}
  }, EXIT_ANIMATION_MS);
}

export function showGlobalToast(
  message: string,
  typeOrIsError: boolean | ToastType | string = 'success',
  customTitle?: string,
  durationMs: number = DEFAULT_DURATION_MS
): void {
  if (typeof document === 'undefined') return;

  const container = getOrCreateToastContainer();
  const type = normalizeToastType(typeOrIsError);
  const cleanMessage = String(message ?? '').trim();
  const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : DEFAULT_DURATION_MS;

  // Deduplicar mensajes idénticos o estados transitorios repetidos sin dejar fantasmas
  const activeToasts = Array.from(container.querySelectorAll<HTMLElement>('.toast:not(.is-leaving)'));
  activeToasts.forEach((existing) => {
    const existingMsg = (existing.querySelector('.toast-message')?.textContent || '').trim();
    const lowerExisting = existingMsg.toLowerCase();
    if (
      existingMsg === cleanMessage ||
      lowerExisting.includes('iniciando') ||
      lowerExisting.includes('cargando') ||
      lowerExisting.includes('procesando') ||
      lowerExisting.includes('respaldando') ||
      lowerExisting.includes('subiendo')
    ) {
      dismissToastElement(existing);
    }
  });

  // Limitar apilamiento visible a máximo 3 notificaciones simultáneas
  const remainingActive = Array.from(container.querySelectorAll<HTMLElement>('.toast:not(.is-leaving)'));
  while (remainingActive.length >= MAX_VISIBLE_TOASTS) {
    const oldest = remainingActive.shift();
    if (oldest) dismissToastElement(oldest);
  }

  const resolvedTitle =
    customTitle &&
    typeof customTitle === 'string' &&
    customTitle.trim() &&
    customTitle.trim().toLowerCase() !== 'undefined'
      ? customTitle.trim()
      : TITLES[type];

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');

  const iconWrap = document.createElement('div');
  iconWrap.className = 'toast-icon-wrap';
  iconWrap.innerHTML = ICONS[type] || ICONS.success;

  const contentCol = document.createElement('div');
  contentCol.className = 'toast-content-col';

  const categoryEl = document.createElement('span');
  categoryEl.className = 'toast-category';
  categoryEl.textContent = resolvedTitle;

  const messageEl = document.createElement('div');
  messageEl.className = 'toast-message';
  messageEl.textContent = cleanMessage;

  contentCol.appendChild(categoryEl);
  contentCol.appendChild(messageEl);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-close-btn';
  closeBtn.setAttribute('aria-label', 'Cerrar notificación');
  closeBtn.setAttribute('title', 'Cerrar');
  closeBtn.innerHTML = '&times;';

  const progressTrack = document.createElement('div');
  progressTrack.className = 'toast-progress-track';

  const progressBar = document.createElement('div');
  progressBar.className = 'toast-progress toast-progress-bar';
  progressBar.style.animationDuration = `${duration}ms`;
  progressTrack.appendChild(progressBar);

  toast.appendChild(iconWrap);
  toast.appendChild(contentCol);
  toast.appendChild(closeBtn);
  toast.appendChild(progressTrack);

  let remainingTime = duration;
  let startedAt = performance.now();
  let timerId: number | null = null;

  const startTimer = () => {
    if (toast.dataset.leaving === 'true') return;
    if (timerId !== null) window.clearTimeout(timerId);
    startedAt = performance.now();
    progressBar.style.animationPlayState = 'running';
    timerId = window.setTimeout(() => {
      timerId = null;
      dismissToastElement(toast);
    }, Math.max(80, remainingTime));
  };

  const pauseTimer = () => {
    if (toast.dataset.leaving === 'true' || timerId === null) return;
    window.clearTimeout(timerId);
    timerId = null;
    const elapsed = performance.now() - startedAt;
    remainingTime = Math.max(0, remainingTime - elapsed);
    progressBar.style.animationPlayState = 'paused';
  };

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (timerId !== null) {
      window.clearTimeout(timerId);
      timerId = null;
    }
    dismissToastElement(toast);
  });

  toast.addEventListener('mouseenter', pauseTimer);
  toast.addEventListener('mouseleave', startTimer);

  container.appendChild(toast);
  startTimer();
}

export function initGlobalToast(): void {
  if (typeof window === 'undefined') return;
  getOrCreateToastContainer();
  const w = window as unknown as Record<string, unknown>;
  w.showToast = showGlobalToast;
  w.mostrarNotificacion = showGlobalToast;
  w.mostrarToast = showGlobalToast;
}
