// src/scripts/calendario.ts
// Lógica de cliente para el Calendario Institucional UI/UX Pro Max en tiempo real con Crossfade y Shared Element Transitions

import {
  getUnifiedCalendarEvents,
  computeActivePeticionSlaCounts,
  createGoogleCalendarEvent,
  connectGoogleCalendar,
} from '@lib/calendar';
import { logSystemActivity } from '@lib/audit';
import type { CalendarioEvent, CalendarioEventType, EventUrgency } from '@lib/types';

// Estado global de la vista
let currentDate = new Date();
let selectedDay = new Date();
let currentYear = currentDate.getFullYear();
let currentMonth = currentDate.getMonth(); // 0-indexed (0 = Enero)
let activeView: 'month' | 'week' | 'day' | 'agenda' = 'month';

let allEvents: CalendarioEvent[] = [];
let isGoogleConnected = false;
let activeCategories = new Set<string>(['peticion', 'reporte', 'colegiado', 'academica', 'financiero']);
let searchQuery = '';
let activeSlaFilter: 'all' | 'danger' | 'warning' | 'safe' | 'completed' = 'all';
let selectedDayStr = '';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const WEEKDAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const WEEKDAY_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Transición de DOM suave con soporte para View Transitions API y fallback CSS/WAAPI
 */
export async function transitionDOMUpdate(updateFn: () => void | Promise<void>) {
  if (typeof document !== 'undefined' && 'startViewTransition' in document) {
    try {
      (document as any).startViewTransition(async () => {
        await updateFn();
      });
      return;
    } catch {
      // Fallback si falla la promesa interna
    }
  }

  // Fallback CSS Crossfade
  const targets = [
    document.getElementById('gcal-month-grid-cells'),
    document.getElementById('gcal-week-container'),
    document.getElementById('gcal-day-container'),
    document.getElementById('gcal-agenda-view'),
    document.getElementById('timeline-items-container')
  ].filter(Boolean) as HTMLElement[];

  targets.forEach((el) => el.classList.add('crossfade-leave'));
  await new Promise((resolve) => setTimeout(resolve, 90));
  await updateFn();
  targets.forEach((el) => {
    el.classList.remove('crossfade-leave');
    el.classList.add('crossfade-enter');
    setTimeout(() => el.classList.remove('crossfade-enter'), 280);
  });
}

export async function initCalendario() {
  // Inicializar títulos
  updateHeaderTitles();

  // Inicializar indicador del View Switcher
  initViewSwitcher();

  // Inicializar Bento Header Cards como filtros interactivos
  initBentoFilters();

  // Cargar eventos iniciales
  await loadEvents();

  // Botón Sincronizar
  const syncBtn = document.getElementById('btn-gcal-sync') || document.getElementById('btn-force-sync');
  syncBtn?.addEventListener('click', async () => {
    const icon = document.getElementById('sync-spinner-icon') || document.getElementById('sync-icon-spin');
    if (icon) icon.style.animation = 'spin 0.8s linear infinite';
    await loadEvents();
    if (icon) icon.style.animation = 'none';
    if ((window as any).showToast) {
      (window as any).showToast('Calendario y Semáforo SLA sincronizados en tiempo real', 'success');
    }
  });

  // Badge de Estado Google Calendar
  const syncBadge = document.getElementById('gcal-sync-badge');
  syncBadge?.addEventListener('click', async () => {
    if (!isGoogleConnected) {
      const confirmed = typeof (window as any).showConfirm === 'function'
        ? await (window as any).showConfirm(
            '¿Deseas conectar tu cuenta institucional de Google Workspace para sincronizar tus eventos en tiempo real?',
            'Google Calendar Institucional'
          )
        : true;

      if (confirmed) {
        try {
          await connectGoogleCalendar();
        } catch {
          if ((window as any).showToast) {
            (window as any).showToast('Aviso: La agenda opera sincronizada con la base de datos en tiempo real.', 'info');
          }
        }
      }
    }
  });

  // Búsqueda en tiempo real
  const searchInput = document.getElementById('gcal-search-input') as HTMLInputElement | null;
  searchInput?.addEventListener('input', (e) => {
    searchQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
    transitionDOMUpdate(() => {
      renderCurrentView();
      renderTimelineMonitor();
    });
  });

  // Filtros de categoría
  const categoryContainer = document.getElementById('gcal-category-filters');
  categoryContainer?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target && target.type === 'checkbox') {
      if (target.checked) {
        activeCategories.add(target.value);
      } else {
        activeCategories.delete(target.value);
      }
      transitionDOMUpdate(() => {
        renderCurrentView();
        renderTimelineMonitor();
      });
    }
  });

  // Navegación (Anterior, Siguiente, Hoy)
  document.getElementById('gcal-btn-prev')?.addEventListener('click', () => {
    navigate(-1);
  });

  document.getElementById('gcal-btn-next')?.addEventListener('click', () => {
    navigate(1);
  });

  document.getElementById('gcal-btn-today')?.addEventListener('click', () => {
    const today = new Date();
    currentDate = new Date(today);
    selectedDay = new Date(today);
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
    selectedDayStr = '';
    updateHeaderTitles();
    transitionDOMUpdate(() => {
      renderCurrentView();
      renderTimelineMonitor();
      renderMiniCal();
    });
  });

  // Botón Limpiar Selección de Día en Timeline
  document.getElementById('btn-clear-day-filter')?.addEventListener('click', () => {
    selectedDayStr = '';
    document.querySelectorAll('.gcal-cell.is-selected').forEach((c) => c.classList.remove('is-selected'));
    const clearBtn = document.getElementById('btn-clear-day-filter');
    if (clearBtn) clearBtn.style.display = 'none';
    transitionDOMUpdate(() => {
      renderTimelineMonitor();
    });
  });

  // Modales
  setupCreateEventModal();
  setupDayDetailModal();

  // Redimensionamiento de ventana para reposicionar indicador deslizante
  window.addEventListener('resize', () => {
    const activeBtn = document.querySelector('#gcal-view-switcher .gcal-view-btn.active') as HTMLElement | null;
    if (activeBtn) updateViewSwitcherIndicator(activeBtn);
  });
}

/**
 * Inicializa el View Switcher con píldora deslizante (Shared Element)
 */
function initViewSwitcher() {
  const viewButtons = document.querySelectorAll('#gcal-view-switcher .gcal-view-btn');
  const initialActive = document.querySelector('#gcal-view-switcher .gcal-view-btn.active') as HTMLElement | null;
  if (initialActive) {
    updateViewSwitcherIndicator(initialActive);
  }

  viewButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      viewButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updateViewSwitcherIndicator(btn as HTMLElement);
      const view = btn.getAttribute('data-gview') as 'month' | 'week' | 'day' | 'agenda';
      if (view) {
        transitionDOMUpdate(() => {
          switchView(view);
        });
      }
    });
  });
}

/**
 * Actualiza la posición y ancho del indicador deslizante del selector de vista
 */
function updateViewSwitcherIndicator(activeBtn: HTMLElement) {
  const indicator = document.getElementById('view-switcher-indicator');
  const parent = activeBtn.parentElement;
  if (!indicator || !parent) return;

  const parentRect = parent.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  const left = btnRect.left - parentRect.left;

  indicator.style.width = `${btnRect.width}px`;
  indicator.style.transform = `translateX(${left}px)`;
}

/**
 * Inicializa las tarjetas Bento como filtros interactivos SLA con Crossfade
 */
function initBentoFilters() {
  const bentoCards = document.querySelectorAll('.bento-sla-card');
  bentoCards.forEach((card) => {
    card.addEventListener('click', () => {
      const filter = card.getAttribute('data-sla-filter') as 'danger' | 'warning' | 'safe' | 'completed';
      if (activeSlaFilter === filter) {
        activeSlaFilter = 'all';
      } else {
        activeSlaFilter = filter;
      }
      updateBentoActiveIndicator();
      transitionDOMUpdate(() => {
        renderCurrentView();
        renderTimelineMonitor();
      });
    });
  });
}

/**
 * Actualiza el indicador visual de tarjeta Bento activa
 */
function updateBentoActiveIndicator() {
  const bentoCards = document.querySelectorAll('.bento-sla-card');
  bentoCards.forEach((card) => {
    const filter = card.getAttribute('data-sla-filter');
    const badge = card.querySelector('.bento-active-badge') as HTMLElement | null;
    if (activeSlaFilter === filter) {
      card.classList.add('active-filter');
      if (badge) badge.style.display = 'inline-flex';
    } else {
      card.classList.remove('active-filter');
      if (badge) badge.style.display = 'none';
    }
  });

  const timelineSubtitle = document.getElementById('timeline-current-filter-desc');
  if (timelineSubtitle) {
    if (activeSlaFilter === 'danger') {
      timelineSubtitle.textContent = 'Filtrando: Compromisos Críticos / Vencidos (≤ 0 días)';
    } else if (activeSlaFilter === 'warning') {
      timelineSubtitle.textContent = 'Filtrando: Compromisos Próximos a Vencer (1 a 5 días)';
    } else if (activeSlaFilter === 'safe') {
      timelineSubtitle.textContent = 'Filtrando: Compromisos en Término Saludable (> 5 días)';
    } else if (activeSlaFilter === 'completed') {
      timelineSubtitle.textContent = 'Filtrando: Expedientes Completados / Cerrados';
    } else if (selectedDayStr) {
      timelineSubtitle.textContent = `Compromisos del día ${selectedDayStr}`;
    } else {
      timelineSubtitle.textContent = 'Compromisos Oficiales en Tiempo Real';
    }
  }
}

/**
 * Lee los eventos pre-renderizados desde el payload SSR para pintar sin latencia.
 */
function readSsrDeadlines(): CalendarioEvent[] {
  try {
    const ssrEl = document.getElementById('calendario-ssr-events');
    if (!ssrEl || !ssrEl.textContent) return [];
    const parsed = JSON.parse(ssrEl.textContent);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function updateSlaCountersFromEvents(events: CalendarioEvent[]) {
  const { critCount, warnCount, safeCount, completedCount } = computeActivePeticionSlaCounts(events);
  const critEl = document.getElementById('gcal-crit-count');
  const warnEl = document.getElementById('gcal-warn-count');
  const safeEl = document.getElementById('gcal-safe-count');
  const completedEl = document.getElementById('gcal-completed-count');

  if (critEl) critEl.textContent = String(critCount);
  if (warnEl) warnEl.textContent = String(warnCount);
  if (safeEl) safeEl.textContent = String(safeCount);
  if (completedEl) completedEl.textContent = String(completedCount);
}

/**
 * Carga los eventos unificados (SSR inmediato + Google Calendar + Supabase)
 */
async function loadEvents() {
  const ssrEvents = readSsrDeadlines();
  if (allEvents.length === 0 && ssrEvents.length > 0) {
    allEvents = [...ssrEvents].sort((a, b) => a.fecha.localeCompare(b.fecha));
    updateSlaCountersFromEvents(allEvents);
    renderCurrentView();
    renderTimelineMonitor();
    renderMiniCal();
  }

  const syncBadge = document.getElementById('gcal-sync-badge');
  if (syncBadge) {
    syncBadge.textContent = 'Sincronizando...';
  }

  // Rango de consulta: 1 mes antes y 3 meses después del mes visible
  const timeMin = new Date(currentYear, currentMonth - 1, 1).toISOString();
  const timeMax = new Date(currentYear, currentMonth + 3, 0).toISOString();

  try {
    const res = await getUnifiedCalendarEvents(timeMin, timeMax);
    const liveIds = new Set(res.events.map((e) => e.id));
    const missingSsrDeadlines = ssrEvents.filter((e) => !liveIds.has(e.id));
    allEvents = [...res.events, ...missingSsrDeadlines].sort((a, b) => a.fecha.localeCompare(b.fecha));
    isGoogleConnected = res.isGoogleConnected;

    updateSlaCountersFromEvents(allEvents);

    // Actualizar badge de sincronización con Google
    if (syncBadge) {
      if (isGoogleConnected) {
        syncBadge.innerHTML = `<span class="badge-dot-live"></span> Google Calendar Activo`;
        syncBadge.classList.add('connected');
        syncBadge.classList.remove('disconnected');
      } else {
        syncBadge.innerHTML = `<span class="badge-dot-local"></span> Base de Datos en Tiempo Real`;
        syncBadge.classList.add('disconnected');
        syncBadge.classList.remove('connected');
      }
    }

    renderCurrentView();
    renderTimelineMonitor();
    renderMiniCal();
  } catch (err) {
    console.error('Error cargando eventos:', err);
    if (allEvents.length === 0 && ssrEvents.length > 0) {
      allEvents = [...ssrEvents];
      updateSlaCountersFromEvents(allEvents);
    }
    if (syncBadge) {
      syncBadge.innerHTML = `<span class="badge-dot-local"></span> Base de Datos Local`;
    }
    renderCurrentView();
    renderTimelineMonitor();
    renderMiniCal();
  }
}

/**
 * Actualiza los títulos de mes y año
 */
function updateHeaderTitles() {
  const monthTitle = document.getElementById('gcal-current-label');
  const miniTitle = document.getElementById('gcal-mini-title');

  if (monthTitle) {
    if (activeView === 'day') {
      const dayName = WEEKDAY_FULL[selectedDay.getDay()];
      monthTitle.textContent = `${dayName}, ${selectedDay.getDate()} de ${MONTH_NAMES[selectedDay.getMonth()]} de ${selectedDay.getFullYear()}`;
    } else if (activeView === 'week') {
      monthTitle.textContent = `Semana del ${selectedDay.getDate()} de ${MONTH_NAMES[currentMonth]} de ${currentYear}`;
    } else {
      monthTitle.textContent = `${MONTH_NAMES[currentMonth]} de ${currentYear}`;
    }
  }

  if (miniTitle) {
    miniTitle.textContent = `${(MONTH_NAMES[currentMonth] || '').slice(0, 3)} ${currentYear}`;
  }
}

/**
 * Navega según la vista activa con Crossfade
 */
function navigate(step: number) {
  transitionDOMUpdate(() => {
    if (activeView === 'month' || activeView === 'agenda') {
      currentMonth += step;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      } else if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      currentDate = new Date(currentYear, currentMonth, 1);
    } else if (activeView === 'week') {
      selectedDay.setDate(selectedDay.getDate() + step * 7);
      currentMonth = selectedDay.getMonth();
      currentYear = selectedDay.getFullYear();
    } else if (activeView === 'day') {
      selectedDay.setDate(selectedDay.getDate() + step);
      currentMonth = selectedDay.getMonth();
      currentYear = selectedDay.getFullYear();
    }

    updateHeaderTitles();
    renderCurrentView();
    renderTimelineMonitor();
    renderMiniCal();
  });
}

/**
 * Cambia la vista activa
 */
function switchView(view: 'month' | 'week' | 'day' | 'agenda') {
  activeView = view;

  const monthV = document.getElementById('gcal-month-view');
  const weekV = document.getElementById('gcal-week-view');
  const dayV = document.getElementById('gcal-day-view');
  const agendaV = document.getElementById('gcal-agenda-view');
  const timelinePanel = document.getElementById('gcal-timeline-monitor');

  if (monthV) monthV.style.display = view === 'month' ? 'block' : 'none';
  if (weekV) weekV.style.display = view === 'week' ? 'block' : 'none';
  if (dayV) dayV.style.display = view === 'day' ? 'block' : 'none';

  if (view === 'agenda') {
    if (agendaV) agendaV.style.display = 'block';
    if (monthV) monthV.style.display = 'none';
    if (weekV) weekV.style.display = 'none';
    if (dayV) dayV.style.display = 'none';
  } else {
    if (agendaV) agendaV.style.display = 'none';
  }

  updateHeaderTitles();
  renderCurrentView();
  renderTimelineMonitor();
}

/**
 * Retorna eventos filtrados por categorías, búsqueda y SLA
 */
function getFilteredEvents(): CalendarioEvent[] {
  return allEvents.filter((ev) => {
    // 1. Filtro por categoría
    if (!activeCategories.has(ev.tipo)) return false;

    // 2. Filtro SLA (desde Bento Header)
    if (activeSlaFilter !== 'all') {
      if (ev.urgencia !== activeSlaFilter) return false;
    }

    // 3. Filtro por búsqueda
    if (searchQuery) {
      const matchTitle = ev.titulo.toLowerCase().includes(searchQuery);
      const matchDesc = ev.descripcion.toLowerCase().includes(searchQuery);
      const matchDest = ev.destino.toLowerCase().includes(searchQuery);
      if (!matchTitle && !matchDesc && !matchDest) return false;
    }

    return true;
  });
}

/**
 * Renderiza la vista que esté activa
 */
function renderCurrentView() {
  if (activeView === 'month') {
    renderMonthView();
  } else if (activeView === 'week') {
    renderWeekView();
  } else if (activeView === 'day') {
    renderDayView();
  } else if (activeView === 'agenda') {
    renderAgendaView();
  }
}

/**
 * Extrae o formatea un identificador de radicado limpio para presentación monoespaciada
 */
function getRadicadoCode(ev: CalendarioEvent): string {
  const match = ev.titulo.match(/RAD-\d{4}-\d+/i) || ev.descripcion.match(/RAD-\d{4}-\d+/i);
  if (match) return match[0];
  if (ev.tipo === 'peticion') return `PQRS-${ev.id.slice(0, 6)}`;
  if (ev.tipo === 'reporte') return `REP-${ev.id.slice(0, 6)}`;
  if (ev.tipo === 'colegiado') return `CSU-${ev.id.slice(0, 6)}`;
  return `ACT-${ev.id.slice(0, 6)}`;
}

/**
 * Calcula porcentaje de tiempo consumido para la barra de progreso SLA Pro Max
 */
function getSlaConsumption(diasRestantes: number, tipo: string): number {
  if (diasRestantes <= 0) return 100;
  let term = 15;
  if (tipo === 'tutela') term = 2;
  else if (tipo === 'colegiado') term = 10;
  else if (tipo === 'reporte') term = 30;

  if (diasRestantes >= term) return 5;
  const consumed = Math.round(((term - diasRestantes) / term) * 100);
  return Math.min(95, Math.max(5, consumed));
}

/**
 * Renderiza la vista Mes con Cápsulas Flotantes Pro Max y Shared Element Ring
 */
function renderMonthView() {
  const monthGrid = document.getElementById('gcal-month-grid-cells');
  if (!monthGrid) return;
  monthGrid.innerHTML = '';

  const events = getFilteredEvents();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  // Días mes previo
  for (let i = firstDay - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    const cell = document.createElement('div');
    cell.className = 'gcal-cell other-month';
    cell.innerHTML = `
      <div class="gcal-cell-header">
        <span class="gcal-day-num">${dayNum}</span>
      </div>
    `;
    monthGrid.appendChild(cell);
  }

  // Días mes actual
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayEvents = events.filter((e) => e.fecha === dateStr);
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === selectedDayStr;

    const cell = document.createElement('div');
    cell.className = `gcal-cell ${isToday ? 'today' : ''} ${isSelected ? 'is-selected' : ''}`;
    cell.setAttribute('data-day', dateStr);

    // Indicador visual de puntos de semáforo
    let dotsHtml = '';
    dayEvents.slice(0, 3).forEach((ev) => {
      dotsHtml += `<span class="gcal-sem-dot ${ev.urgencia}"></span>`;
    });

    const header = `
      <div class="gcal-cell-header">
        <div class="gcal-cell-dots-preview">${dotsHtml}</div>
        <span class="gcal-day-num ${isToday ? 'is-today-badge' : ''}">${d}</span>
      </div>
    `;

    // Stack de micro-tarjetas con código monoespaciado y barra lateral
    let eventsHtml = '<div class="gcal-events-stack">';
    const displayEvents = dayEvents.slice(0, 2);
    displayEvents.forEach((ev) => {
      const radCode = getRadicadoCode(ev);
      const chipBadge =
        ev.urgencia === 'completed' || ev.completada
          ? 'OK'
          : ev.diasRestantes <= 0
          ? 'Vencido'
          : `${ev.diasRestantes}d`;
      const chipTitle =
        ev.urgencia === 'completed' || ev.completada
          ? `${ev.titulo} (Completado)`
          : `${ev.titulo} (${ev.diasRestantes <= 0 ? 'Vencido' : `${ev.diasRestantes}d`})`;
      eventsHtml += `
        <div class="gcal-sem-chip sem-${ev.urgencia}" data-radicado-id="${ev.id}" style="view-transition-name: radicado-card-${ev.id.replace(/[^a-zA-Z0-9_-]/g, '')};" title="${chipTitle}">
          <span class="chip-sla-bar ${ev.urgencia}"></span>
          <span class="chip-rad-code">${radCode}</span>
          <span class="chip-days-badge ${ev.urgencia}">${chipBadge}</span>
        </div>
      `;
    });

    if (dayEvents.length > 2) {
      eventsHtml += `
        <div class="gcal-more-chip">+${dayEvents.length - 2} más</div>
      `;
    }
    eventsHtml += '</div>';

    cell.innerHTML = header + eventsHtml;

    // Al hacer clic en un radicado específico dentro del día: Shared Element transition hacia la timeline
    cell.querySelectorAll('.gcal-sem-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const radId = chip.getAttribute('data-radicado-id');
        selectedDay = new Date(currentYear, currentMonth, d);
        selectedDayStr = dateStr;
        updateSelectedDayCells(dateStr);
        transitionDOMUpdate(() => {
          renderTimelineMonitor(radId || undefined);
        });
      });
    });

    // Al hacer clic en la celda del día: migra el Shared Element Ring y filtra la timeline
    cell.addEventListener('click', () => {
      selectedDay = new Date(currentYear, currentMonth, d);
      selectedDayStr = dateStr;
      updateSelectedDayCells(dateStr);
      transitionDOMUpdate(() => {
        renderTimelineMonitor();
      });
    });

    // Doble clic abre el modal detallado
    cell.addEventListener('dblclick', () => {
      openDayModal(dateStr, dayEvents);
    });

    monthGrid.appendChild(cell);
  }
}

/**
 * Actualiza el Shared Element Ring en las celdas del calendario
 */
function updateSelectedDayCells(activeDateStr: string) {
  document.querySelectorAll('.gcal-cell').forEach((cell) => {
    if (cell.getAttribute('data-day') === activeDateStr) {
      cell.classList.add('is-selected');
    } else {
      cell.classList.remove('is-selected');
    }
  });

  const clearBtn = document.getElementById('btn-clear-day-filter');
  if (clearBtn) {
    clearBtn.style.display = activeDateStr ? 'inline-flex' : 'none';
  }
}

/**
 * Renderiza el Panel Derecho: "Agenda & Monitor SLA" (Timeline Vertical Interactivo)
 */
function renderTimelineMonitor(focusEventId?: string) {
  const container = document.getElementById('timeline-items-container');
  if (!container) return;
  container.innerHTML = '';

  const events = getFilteredEvents();

  // Filtrar por día seleccionado si está activo
  let targetEvents = events;
  if (selectedDayStr) {
    targetEvents = events.filter((e) => e.fecha === selectedDayStr);
  }

  // Ordenar cronológicamente y por urgencia
  targetEvents.sort((a, b) => {
    if (a.diasRestantes !== b.diasRestantes) {
      return a.diasRestantes - b.diasRestantes;
    }
    return a.fecha.localeCompare(b.fecha);
  });

  const subtitleEl = document.getElementById('timeline-current-filter-desc');
  const clearBtn = document.getElementById('btn-clear-day-filter');

  if (subtitleEl) {
    if (selectedDayStr) {
      subtitleEl.textContent = `Compromisos del ${selectedDayStr} (${targetEvents.length})`;
      if (clearBtn) clearBtn.style.display = 'inline-flex';
    } else if (activeSlaFilter !== 'all') {
      const label =
        activeSlaFilter === 'danger'
          ? 'Críticos'
          : activeSlaFilter === 'warning'
          ? 'En Alerta'
          : activeSlaFilter === 'completed'
          ? 'Completados'
          : 'En Término';
      subtitleEl.textContent = `Filtrando: Compromisos ${label} (${targetEvents.length})`;
      if (clearBtn) clearBtn.style.display = 'inline-flex';
    } else {
      subtitleEl.textContent = `Monitoreando ${targetEvents.length} compromisos oficiales`;
      if (clearBtn) clearBtn.style.display = 'none';
    }
  }

  if (targetEvents.length === 0) {
    container.innerHTML = `
      <div class="timeline-empty-card">
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <h5>Sin compromisos registrados</h5>
        <p>${selectedDayStr ? 'No hay actividades agendadas para esta fecha.' : 'No hay actividades con los filtros actuales.'}</p>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-timeline-create-trigger">+ Agendar Compromiso</button>
      </div>
    `;
    document.getElementById('btn-timeline-create-trigger')?.addEventListener('click', () => {
      openCreateModal(selectedDayStr);
    });
    return;
  }

  let focusedCardElement: HTMLElement | null = null;

  targetEvents.forEach((ev) => {
    const radCode = getRadicadoCode(ev);
    const isCompleted = ev.urgencia === 'completed' || !!ev.completada;
    const consumedPercent = isCompleted ? 100 : getSlaConsumption(ev.diasRestantes, ev.tipo);
    const isFocused = focusEventId === ev.id;

    const card = document.createElement('div');
    card.className = `pro-timeline-card sem-${ev.urgencia} ${isFocused ? 'focused-card' : ''}`;
    card.setAttribute('data-id', ev.id);
    card.setAttribute('id', `timeline-card-${ev.id}`);
    card.style.setProperty('view-transition-name', `radicado-card-${ev.id.replace(/[^a-zA-Z0-9_-]/g, '')}`);

    const urgencyLabel = isCompleted
      ? 'Completado'
      : ev.diasRestantes <= 0
      ? 'Vencido'
      : ev.diasRestantes <= 2
      ? `${ev.diasRestantes}d (Atención Inmediata)`
      : `${ev.diasRestantes} días restantes`;

    card.innerHTML = `
      <div class="timeline-node-pin ${ev.urgencia}"></div>
      <div class="timeline-card-inner">
        <div class="timeline-card-header">
          <div class="timeline-rad-badge-wrap">
            <span class="timeline-rad-mono">${radCode}</span>
            <span class="timeline-sla-badge badge-${ev.urgencia}">${urgencyLabel}</span>
          </div>
          <span class="timeline-type-pill">${ev.tipo.toUpperCase()}</span>
        </div>
        
        <h5 class="timeline-card-title">${ev.titulo}</h5>
        
        ${ev.descripcion ? `<p class="timeline-card-desc">${ev.descripcion}</p>` : ''}
        
        <div class="timeline-card-meta">
          <div class="meta-item" title="Dependencia / Destino">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 7v14M21 7v14M6 7V3h12v4M10 11v2M14 11v2M10 16v2M14 16v2"/></svg>
            <span>${ev.destino}</span>
          </div>
          <div class="meta-item" title="Funcionario Responsable">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>${ev.responsable}</span>
          </div>
          <div class="meta-item" title="Fecha y Hora">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>${ev.fecha} ${ev.hora ? `(${ev.hora})` : ''}</span>
          </div>
        </div>
        
        <!-- Barra de Progreso SLA Pro Max -->
        <div class="timeline-sla-progress-wrap">
          <div class="timeline-sla-progress-track">
            <div class="timeline-sla-progress-fill ${ev.urgencia}" style="width: ${consumedPercent}%;"></div>
          </div>
          <div class="timeline-sla-progress-labels">
            <span class="progress-percent">${isCompleted ? 'Expediente Cerrado' : `${consumedPercent}% consumido`}</span>
            <span class="progress-remaining">${isCompleted ? 'Archivado' : ev.diasRestantes <= 0 ? 'Término Vencido' : `${ev.diasRestantes} días`}</span>
          </div>
        </div>
        
        ${ev.link ? `
          <div class="timeline-card-actions">
            <a href="${ev.link}" target="_blank" rel="noopener noreferrer" class="timeline-action-link">
              <span>Abrir en Google Calendar</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
            </a>
          </div>
        ` : ''}
      </div>
    `;

    card.addEventListener('click', () => {
      openDayModal(ev.fecha, [ev]);
    });

    container.appendChild(card);

    if (isFocused) {
      focusedCardElement = card;
    }
  });

  if (focusedCardElement) {
    (focusedCardElement as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/**
 * Renderiza la vista Semana
 */
function renderWeekView() {
  const container = document.getElementById('gcal-week-container');
  if (!container) return;
  container.innerHTML = '';

  const events = getFilteredEvents();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const startOfWeek = new Date(selectedDay);
  startOfWeek.setDate(selectedDay.getDate() - selectedDay.getDay());

  for (let i = 0; i < 7; i++) {
    const colDate = new Date(startOfWeek);
    colDate.setDate(startOfWeek.getDate() + i);

    const colDateStr = `${colDate.getFullYear()}-${String(colDate.getMonth() + 1).padStart(2, '0')}-${String(colDate.getDate()).padStart(2, '0')}`;
    const isToday = colDateStr === todayStr;
    const dayEvents = events.filter((e) => e.fecha === colDateStr);

    const col = document.createElement('div');
    col.className = `gcal-week-col ${isToday ? 'is-today' : ''}`;

    let cardsHtml = '';
    if (dayEvents.length === 0) {
      cardsHtml = `
        <div class="gcal-week-empty-slot">
          <span>Sin compromisos</span>
        </div>
      `;
    } else {
      dayEvents.forEach((ev) => {
        const wkStatus =
          ev.urgencia === 'completed' || ev.completada
            ? 'Completado'
            : ev.diasRestantes <= 0
            ? 'Vencido'
            : `${ev.diasRestantes}d`;
        cardsHtml += `
          <div class="gcal-week-card sem-${ev.urgencia}" data-id="${ev.id}">
            <div class="gcal-week-card-type">${ev.tipo} &bull; ${wkStatus}</div>
            <div class="gcal-week-card-title">${ev.titulo}</div>
            <div class="gcal-week-card-meta">${ev.hora || 'Todo el día'}</div>
          </div>
        `;
      });
    }

    col.innerHTML = `
      <div class="gcal-week-col-header">
        <div class="gcal-week-day-name">${WEEKDAY_NAMES[colDate.getDay()]}</div>
        <div class="gcal-week-day-num">${colDate.getDate()}</div>
      </div>
      <div class="gcal-week-col-body">
        ${cardsHtml}
      </div>
    `;

    col.querySelector('.gcal-week-col-header')?.addEventListener('click', () => {
      selectedDay = new Date(colDate);
      switchView('day');
    });

    col.querySelectorAll('.gcal-week-card').forEach((card) => {
      card.addEventListener('click', () => {
        openDayModal(colDateStr, dayEvents);
      });
    });

    container.appendChild(col);
  }
}

/**
 * Renderiza la vista Día
 */
function renderDayView() {
  const container = document.getElementById('gcal-day-container');
  if (!container) return;
  container.innerHTML = '';

  const events = getFilteredEvents();
  const dateStr = `${selectedDay.getFullYear()}-${String(selectedDay.getMonth() + 1).padStart(2, '0')}-${String(selectedDay.getDate()).padStart(2, '0')}`;
  const dayEvents = events.filter((e) => e.fecha === dateStr);

  const critCount = dayEvents.filter((e) => e.urgencia === 'danger').length;
  const warnCount = dayEvents.filter((e) => e.urgencia === 'warning').length;
  const safeCount = dayEvents.filter((e) => e.urgencia === 'safe').length;
  const doneCount = dayEvents.filter((e) => e.urgencia === 'completed' || e.completada).length;

  const headerCard = `
    <div class="gcal-day-header-card">
      <div class="gcal-day-title-wrap">
        <h3>${WEEKDAY_FULL[selectedDay.getDay()]}, ${selectedDay.getDate()} de ${MONTH_NAMES[selectedDay.getMonth()]} de ${selectedDay.getFullYear()}</h3>
        <p>${dayEvents.length} compromisos registrados en tiempo real</p>
      </div>
      <div class="gcal-day-stats-pills">
        <div class="gcal-day-stat-chip"><span style="color:#ef4444;">●</span> ${critCount} Críticos</div>
        <div class="gcal-day-stat-chip"><span style="color:#f59e0b;">●</span> ${warnCount} Alerta</div>
        <div class="gcal-day-stat-chip"><span style="color:#10b981;">●</span> ${safeCount} En Término</div>
        <div class="gcal-day-stat-chip"><span style="color:#00594E;">●</span> ${doneCount} Completados</div>
      </div>
    </div>
  `;

  let eventsListHtml = '<div class="gcal-day-events-list">';
  if (dayEvents.length === 0) {
    eventsListHtml += `
      <div class="gcal-day-empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <h4>No hay compromisos agendados para este día</h4>
        <p>Puedes agendar una nueva actividad con el botón "+ Compromiso" de la barra superior.</p>
      </div>
    `;
  } else {
    dayEvents.forEach((ev) => {
      eventsListHtml += `
        <div class="gcal-day-event-card sem-${ev.urgencia}">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span class="badge ${ev.urgencia === 'danger' ? 'status-critico' : ev.urgencia === 'warning' ? 'status-alerta' : 'status-exito'}">
                ${ev.urgencia === 'completed' || ev.completada ? 'Completado' : ev.diasRestantes <= 0 ? 'Término Vencido' : `${ev.diasRestantes} días restantes`}
              </span>
              <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">${ev.hora || 'Todo el día'}</span>
              <span style="font-size: 0.75rem; color: var(--text-muted);">&bull;</span>
              <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--primary);">${ev.tipo}</span>
            </div>
            <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin: 0 0 6px 0;">${ev.titulo}</h4>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0 0 10px 0; line-height: 1.4;">${ev.descripcion || 'Sin descripción adicional registrada.'}</p>
            <div style="font-size: 0.78rem; color: var(--text-muted); display: flex; gap: 16px;">
              <span><strong>Destino:</strong> ${ev.destino}</span>
              <span><strong>Responsable:</strong> ${ev.responsable}</span>
            </div>
          </div>
          ${ev.link ? `
            <a href="${ev.link}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="text-decoration: none; white-space: nowrap; font-size: 0.78rem;">
              Ver en Google &rarr;
            </a>
          ` : ''}
        </div>
      `;
    });
  }
  eventsListHtml += '</div>';

  container.innerHTML = headerCard + eventsListHtml;
}

/**
 * Renderiza la vista Agenda completa
 */
function renderAgendaView() {
  const agendaV = document.getElementById('gcal-agenda-view');
  if (!agendaV) return;
  agendaV.innerHTML = '';

  const events = getFilteredEvents();

  if (events.length === 0) {
    agendaV.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; background: #fff; border-radius: 16px; border: 1px dashed var(--border-color);">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--text-muted); margin-bottom: 12px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin: 0 0 6px 0;">No hay compromisos ni reportes en la agenda</h4>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0 0 16px 0;">No se encontraron eventos programados para los filtros seleccionados.</p>
        <button type="button" class="btn btn-primary btn-sm" id="btn-agenda-create-trigger">+ Agendar Compromiso Institucional</button>
      </div>
    `;
    document.getElementById('btn-agenda-create-trigger')?.addEventListener('click', () => {
      document.getElementById('btn-gcal-create-event')?.click();
    });
    return;
  }

  // Agrupar eventos por fecha
  const groups: Record<string, CalendarioEvent[]> = {};
  events.forEach((ev) => {
    if (!groups[ev.fecha]) groups[ev.fecha] = [];
    groups[ev.fecha]!.push(ev);
  });

  const sortedDates = Object.keys(groups).sort();

  sortedDates.forEach((dateStr) => {
    const dayEvents = groups[dateStr] || [];
    const groupEl = document.createElement('div');
    groupEl.className = 'gcal-agenda-group';
    groupEl.style.cssText = 'margin-bottom: 16px; background: #fff; border: 1px solid var(--border-color); border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.02);';

    const parts = dateStr.split('-');
    const y = parseInt(parts[0] || '2026', 10);
    const m = parseInt(parts[1] || '1', 10) - 1;
    const d = parseInt(parts[2] || '1', 10);
    const dObj = new Date(y, m, d);
    const formattedHeader = `${WEEKDAY_FULL[dObj.getDay()] || ''}, ${dObj.getDate()} de ${MONTH_NAMES[dObj.getMonth()] || ''} de ${dObj.getFullYear()}`;

    let rowsHtml = `
      <div class="gcal-agenda-date-header" style="background: #f8fafc; padding: 12px 18px; border-bottom: 1px solid var(--border-color); font-weight: 800; font-size: 0.88rem; color: var(--text-main); display: flex; justify-content: space-between; align-items: center;">
        <span>${formattedHeader}</span>
        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; background: #e2e8f0; padding: 2px 8px; border-radius: 12px;">${dayEvents.length} actividad(es)</span>
      </div>
    `;

    dayEvents.forEach((ev) => {
      const radCode = getRadicadoCode(ev);
      rowsHtml += `
        <div class="gcal-agenda-row" style="padding: 14px 18px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; gap: 14px;">
          <div style="display: flex; align-items: center; gap: 14px; flex: 1;">
            <div style="width: 10px; height: 10px; border-radius: 50%; background: ${ev.urgencia === 'completed' ? '#00594E' : ev.urgencia === 'danger' ? '#dc2626' : ev.urgencia === 'warning' ? '#f59e0b' : '#10b981'}; flex-shrink: 0; box-shadow: 0 0 6px ${ev.urgencia === 'completed' ? 'rgba(0,89,78,0.45)' : ev.urgencia === 'danger' ? 'rgba(220,38,38,0.5)' : ev.urgencia === 'warning' ? 'rgba(245,158,11,0.5)' : 'rgba(16,185,129,0.5)'};"></div>
            <div>
              <div style="font-weight: 800; color: var(--text-main); font-size: 0.90rem;">
                <span style="font-family: ui-monospace, monospace; font-size: 0.8rem; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; margin-right: 6px; border: 1px solid #cbd5e1;">${radCode}</span>
                ${ev.titulo}
              </div>
              <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 3px;">
                ${ev.hora || 'Todo el día'} &bull; Destino: ${ev.destino} &bull; Resp: ${ev.responsable}
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="badge ${ev.urgencia === 'danger' ? 'status-critico' : ev.urgencia === 'warning' ? 'status-alerta' : 'status-exito'}" style="font-size: 0.72rem;">
              ${ev.urgencia === 'completed' || ev.completada ? 'Completado' : ev.diasRestantes <= 0 ? 'Vencido' : `${ev.diasRestantes} días`}
            </span>
            ${ev.link ? `
              <a href="${ev.link}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="text-decoration: none; font-size: 0.72rem; padding: 4px 8px;">
                Ver
              </a>
            ` : ''}
          </div>
        </div>
      `;
    });

    groupEl.innerHTML = rowsHtml;
    agendaV.appendChild(groupEl);
  });
}

/**
 * Renderiza el Mini Calendario del Sidebar
 */
function renderMiniCal() {
  const miniGrid = document.getElementById('gcal-mini-days-container');
  if (!miniGrid) return;
  miniGrid.innerHTML = '';

  const events = getFilteredEvents();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const span = document.createElement('span');
    span.style.cssText = 'font-size: 0.72rem; color: var(--border-color); text-align: center;';
    miniGrid.appendChild(span);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const hasCrit = events.some((e) => e.fecha === dateStr && e.urgencia === 'danger');

    const span = document.createElement('span');
    span.className = `gcal-mini-day ${isToday ? 'today' : ''} ${hasCrit ? 'has-critical' : ''}`;
    span.textContent = String(d);

    span.addEventListener('click', () => {
      selectedDay = new Date(currentYear, currentMonth, d);
      switchView('day');
    });

    miniGrid.appendChild(span);
  }
}

/**
 * Modal de Detalle de Día
 */
function setupDayDetailModal() {
  const modal = document.getElementById('cal-day-events-modal');
  const btnClose = document.getElementById('btn-close-cal-day-modal');
  const btnCloseFooter = document.getElementById('btn-close-cal-day-modal-footer');
  const btnSwitchDay = document.getElementById('btn-cal-day-switch-to-day');

  function closeModal() {
    if (modal) {
      modal.classList.remove('open');
      modal.style.display = 'none';
    }
  }

  btnClose?.addEventListener('click', closeModal);
  btnCloseFooter?.addEventListener('click', closeModal);

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  btnSwitchDay?.addEventListener('click', () => {
    closeModal();
    switchView('day');
  });
}

/**
 * Abre el modal de compromisos del día
 */
function openDayModal(dateStr: string, dayEvents: CalendarioEvent[]) {
  const modal = document.getElementById('cal-day-events-modal');
  const title = document.getElementById('cal-day-modal-title');
  const body = document.getElementById('cal-day-modal-body');

  const parts = dateStr.split('-');
  const y = parseInt(parts[0] || '2026', 10);
  const m = parseInt(parts[1] || '1', 10) - 1;
  const d = parseInt(parts[2] || '1', 10);
  selectedDay = new Date(y, m, d);

  if (title) {
    title.textContent = `Compromisos del ${selectedDay.getDate()} de ${MONTH_NAMES[selectedDay.getMonth()] || ''} de ${selectedDay.getFullYear()}`;
  }

  if (body) {
    if (dayEvents.length === 0) {
      body.innerHTML = `
        <div style="text-align: center; padding: 32px 16px; color: var(--text-muted);">
          <p style="font-size: 0.88rem; margin: 0 0 12px 0;">No hay compromisos ni reportes agendados para este día.</p>
          <button type="button" class="btn btn-primary btn-sm" id="btn-modal-create-event">+ Agendar para esta Fecha</button>
        </div>
      `;
      document.getElementById('btn-modal-create-event')?.addEventListener('click', () => {
        if (modal) modal.style.display = 'none';
        openCreateModal(dateStr);
      });
    } else {
      let listHtml = '<div style="display: flex; flex-direction: column; gap: 12px;">';
      dayEvents.forEach((ev) => {
        listHtml += `
          <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 10px; padding: 14px; border-left: 4px solid ${ev.urgencia === 'completed' ? '#00594E' : ev.urgencia === 'danger' ? '#dc2626' : ev.urgencia === 'warning' ? '#f59e0b' : '#10b981'};">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
              <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin: 0 0 4px 0;">${ev.titulo}</h4>
              <span class="badge ${ev.urgencia === 'danger' ? 'status-critico' : ev.urgencia === 'warning' ? 'status-alerta' : 'status-exito'}" style="font-size: 0.7rem;">
                ${ev.urgencia === 'completed' || ev.completada ? 'Completado' : ev.diasRestantes <= 0 ? 'Vencido' : `${ev.diasRestantes}d`}
              </span>
            </div>
            <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0 0 8px 0;">${ev.descripcion || 'Sin descripción adicional.'}</p>
            <div style="font-size: 0.74rem; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center;">
              <span><strong>Destino:</strong> ${ev.destino}</span>
              ${ev.link ? `<a href="${ev.link}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); font-weight: 700; text-decoration: none;">Abrir en Google Calendar &rarr;</a>` : ''}
            </div>
          </div>
        `;
      });
      listHtml += '</div>';
      body.innerHTML = listHtml;
    }
  }

  if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
  }
}

/**
 * Modal para agendar nuevo evento
 */
function setupCreateEventModal() {
  const modal = document.getElementById('new-calendario-modal');
  const btnOpen = document.getElementById('btn-gcal-create-event');
  const btnClose = document.getElementById('btn-close-new-cal-modal');
  const btnCancel = document.getElementById('btn-cancel-new-cal');
  const form = document.getElementById('new-calendario-form') as HTMLFormElement | null;

  function closeModal() {
    if (modal) {
      modal.classList.remove('open');
      modal.style.display = 'none';
    }
  }

  btnOpen?.addEventListener('click', () => {
    openCreateModal();
  });

  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const tituloInput = document.getElementById('input-cal-titulo') as HTMLInputElement | null;
    const tipoSelect = document.getElementById('select-cal-tipo') as HTMLSelectElement | null;
    const destinoInput = document.getElementById('input-cal-destino') as HTMLInputElement | null;
    const fechaInput = document.getElementById('input-cal-fecha') as HTMLInputElement | null;
    const responsableInput = document.getElementById('input-cal-responsable') as HTMLInputElement | null;

    if (!tituloInput || !tipoSelect || !fechaInput) return;

    const titulo = tituloInput.value.trim();
    const tipo = tipoSelect.value as CalendarioEventType;
    const destino = destinoInput?.value.trim() || 'Comunidad Universitaria';
    const fecha = fechaInput.value;
    const responsable = responsableInput?.value.trim() || 'Dirección de Planeación';

    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Agendando...';
    }

    try {
      // 1. Intentar agendar en Google Calendar
      const result = await createGoogleCalendarEvent({
        titulo,
        tipo,
        fecha,
        destino,
        responsable,
        descripcion: `Compromiso oficial: ${titulo}. Receptora: ${destino}.`,
      });

      // 2. Registrar en auditoría
      const userStr = localStorage.getItem('sgd_current_user');
      const currentUser = userStr ? JSON.parse(userStr) : { id: 'usr-root', name: 'ING. Christian Lemus', role: 'admin' };

      await logSystemActivity({
        actor: currentUser,
        action: 'Compromiso Agendado en Calendario',
        actionType: 'GESTION',
        entity: 'Calendario Institucional',
        entityId: result.eventId || `cal-${Date.now()}`,
        details: `Se agendó "${titulo}" para la fecha ${fecha} (${tipo.toUpperCase()}). Sincronizado Google: ${result.success ? 'SÍ' : 'NO'}.`,
        severity: 'INFO',
      });

      const cleanDate = fecha.replace(/-/g, "");
      const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(titulo)}&dates=${cleanDate}/${cleanDate}&details=${encodeURIComponent(destino + " - " + titulo)}&location=${encodeURIComponent("Unitrópico")}`;
      
      if (!result.success) {
        window.open(gcalUrl, "_blank");
      }

      if ((window as any).showToast) {
        (window as any).showToast(
          result.success
            ? "¡Evento agendado y sincronizado con Google Calendar!"
            : "Compromiso agendado en el sistema y abierto en Google Calendar.",
          "success"
        );
      }

      form.reset();
      closeModal();
      await loadEvents();
    } catch (err: any) {
      console.error("Error al agendar evento:", err);
      if ((window as any).showToast) {
        (window as any).showToast("Error al agendar: " + (err.message || "Error desconocido"), "error");
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Agendar en Semáforo';
      }
    }
  });
}

function openCreateModal(defaultDate?: string) {
  const modal = document.getElementById('new-calendario-modal');
  const fechaInput = document.getElementById('input-cal-fecha') as HTMLInputElement | null;

  if (fechaInput) {
    if (defaultDate) {
      fechaInput.value = defaultDate;
    } else {
      const today = new Date();
      fechaInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }
  }

  if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
  }
}
