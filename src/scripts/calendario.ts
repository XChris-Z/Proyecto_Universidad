// src/scripts/calendario.ts
// Lógica de cliente para el Calendario Institucional tipo Google Calendar en tiempo real

import {
  getUnifiedCalendarEvents,
  createGoogleCalendarEvent,
  connectGoogleCalendar,
} from '@lib/calendar';
import { logSystemActivity } from '@lib/audit';
import type { CalendarioEvent, CalendarioEventType } from '@lib/types';

// Estado global de la vista
let currentDate = new Date();
let selectedDay = new Date();
let currentYear = currentDate.getFullYear();
let currentMonth = currentDate.getMonth(); // 0-indexed (0 = Enero, 9 = Octubre)
let activeView: 'month' | 'week' | 'day' | 'agenda' = 'month';

let allEvents: CalendarioEvent[] = [];
let isGoogleConnected = false;
let activeCategories = new Set<string>(['peticion', 'reporte', 'colegiado', 'academica', 'financiero']);
let searchQuery = '';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const WEEKDAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const WEEKDAY_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export async function initCalendario() {
  const monthTitle = document.getElementById('gcal-current-label');
  const miniTitle = document.getElementById('gcal-mini-title');
  const viewButtons = document.querySelectorAll('#gcal-view-switcher .gcal-view-btn');
  const syncBtn = document.getElementById('btn-gcal-sync');
  const syncBadge = document.getElementById('gcal-sync-badge');
  const searchInput = document.getElementById('gcal-search-input') as HTMLInputElement | null;
  const categoryContainer = document.getElementById('gcal-category-filters');

  // Inicializar títulos
  updateHeaderTitles();

  // Cargar eventos iniciales
  await loadEvents();

  // Escuchar cambio de vistas (Mes, Semana, Día, Agenda)
  viewButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      viewButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.getAttribute('data-gview') as 'month' | 'week' | 'day' | 'agenda';
      if (view) {
        switchView(view);
      }
    });
  });

  // Botón Sincronizar
  syncBtn?.addEventListener('click', async () => {
    const icon = document.getElementById('sync-icon-spin');
    if (icon) icon.style.animation = 'spin 1s linear infinite';
    await loadEvents();
    if (icon) icon.style.animation = 'none';
    if ((window as any).showToast) {
      (window as any).showToast('Calendario sincronizado con éxito');
    }
  });

  // Badge de Estado Google Calendar
  syncBadge?.addEventListener('click', async () => {
    if (!isGoogleConnected) {
      let confirmed = false;
      if ((window as any).showConfirm) {
        confirmed = await (window as any).showConfirm(
          '¿Deseas conectar tu cuenta institucional de Google Workspace para sincronizar tus eventos en tiempo real?',
          'Google Calendar Institucional'
        );
      } else {
        confirmed = confirm('¿Deseas conectar tu cuenta institucional de Google Workspace?');
      }

      if (confirmed) {
        try {
          await connectGoogleCalendar();
        } catch (err: any) {
          if ((window as any).showToast) {
            (window as any).showToast('Aviso: La agenda opera sincronizada con la base de datos en tiempo real.', 'info');
          }
        }
      }
    }
  });

  // Búsqueda en tiempo real
  searchInput?.addEventListener('input', (e) => {
    searchQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
    renderCurrentView();
  });

  // Filtros de categoría
  categoryContainer?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target && target.type === 'checkbox') {
      if (target.checked) {
        activeCategories.add(target.value);
      } else {
        activeCategories.delete(target.value);
      }
      renderCurrentView();
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
    updateHeaderTitles();
    renderCurrentView();
    renderMiniCal();
  });

  // Navegación en Mini Calendario
  document.getElementById('gcal-mini-prev')?.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    updateHeaderTitles();
    renderCurrentView();
    renderMiniCal();
  });

  document.getElementById('gcal-mini-next')?.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    updateHeaderTitles();
    renderCurrentView();
    renderMiniCal();
  });

  // Modal Crear Evento
  setupCreateEventModal();

  // Modal Detalle del Día
  setupDayDetailModal();
}

/**
 * Carga los eventos unificados (Google Calendar + Supabase)
 */
async function loadEvents() {
  const syncBadge = document.getElementById('gcal-sync-badge');
  if (syncBadge) {
    syncBadge.textContent = 'Consultando...';
    syncBadge.style.background = 'var(--bg-surface-elevated)';
    syncBadge.style.color = 'var(--text-muted)';
  }

  // Rango de consulta: 1 mes antes y 3 meses después del mes visible
  const timeMin = new Date(currentYear, currentMonth - 1, 1).toISOString();
  const timeMax = new Date(currentYear, currentMonth + 3, 0).toISOString();

  try {
    const res = await getUnifiedCalendarEvents(timeMin, timeMax);
    allEvents = res.events;
    isGoogleConnected = res.isGoogleConnected;

    // Actualizar badges de semáforo
    const critEl = document.getElementById('gcal-crit-count');
    const warnEl = document.getElementById('gcal-warn-count');
    const safeEl = document.getElementById('gcal-safe-count');

    if (critEl) critEl.textContent = String(res.critCount);
    if (warnEl) warnEl.textContent = String(res.warnCount);
    if (safeEl) safeEl.textContent = String(res.safeCount);

    // Actualizar badge de sincronización con Google
    if (syncBadge) {
      if (isGoogleConnected) {
        syncBadge.textContent = '● Google Calendar Activo';
        syncBadge.style.background = '#ecfdf5';
        syncBadge.style.color = '#065f46';
        syncBadge.style.border = '1px solid #a7f3d0';
      } else {
        syncBadge.textContent = '+ Conectar Google Calendar';
        syncBadge.style.background = '#fffbeb';
        syncBadge.style.color = '#92400e';
        syncBadge.style.border = '1px solid #fde68a';
      }
    }

    renderCurrentView();
    renderMiniCal();
  } catch (err) {
    console.error('Error cargando eventos:', err);
    if (syncBadge) {
      syncBadge.textContent = 'Modo Local (Sin Google)';
      syncBadge.style.background = '#fef2f2';
      syncBadge.style.color = '#991b1b';
    }
    renderCurrentView();
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
 * Navega según la vista activa
 */
function navigate(step: number) {
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
  renderMiniCal();
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

  if (monthV) monthV.style.display = view === 'month' ? 'block' : 'none';
  if (weekV) weekV.style.display = view === 'week' ? 'block' : 'none';
  if (dayV) dayV.style.display = view === 'day' ? 'block' : 'none';
  if (agendaV) agendaV.style.display = view === 'agenda' ? 'block' : 'none';

  updateHeaderTitles();
  renderCurrentView();
}

/**
 * Retorna eventos filtrados por categorías y búsqueda
 */
function getFilteredEvents(): CalendarioEvent[] {
  return allEvents.filter((ev) => {
    // Filtro por categoría
    if (!activeCategories.has(ev.tipo)) return false;

    // Filtro por búsqueda
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
 * Renderiza la vista Mes
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

    const cell = document.createElement('div');
    cell.className = `gcal-cell ${isToday ? 'today' : ''}`;

    // Vista previa de puntos de semáforo
    let dotsHtml = '';
    dayEvents.slice(0, 3).forEach((ev) => {
      dotsHtml += `<span class="gcal-sem-dot ${ev.urgencia}"></span>`;
    });

    const header = `
      <div class="gcal-cell-header">
        <div class="gcal-cell-dots-preview">${dotsHtml}</div>
        <span class="gcal-day-num">${d}</span>
      </div>
    `;

    // Stack de eventos
    let eventsHtml = '<div class="gcal-events-stack">';
    const displayEvents = dayEvents.slice(0, 2);
    displayEvents.forEach((ev) => {
      eventsHtml += `
        <div class="gcal-sem-chip sem-${ev.urgencia}" title="${ev.titulo} (${ev.diasRestantes} días)">
          <span class="gcal-sem-dot ${ev.urgencia}"></span>
          <span class="gcal-sem-text">${ev.titulo}</span>
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

    // Al hacer clic en la celda del día
    cell.addEventListener('click', () => {
      openDayModal(dateStr, dayEvents);
    });

    monthGrid.appendChild(cell);
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

  // Encontrar el domingo de la semana de selectedDay
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
        cardsHtml += `
          <div class="gcal-week-card sem-${ev.urgencia}" data-id="${ev.id}">
            <div class="gcal-week-card-type">${ev.tipo} &bull; ${ev.diasRestantes <= 0 ? 'Vencido' : `${ev.diasRestantes}d`}</div>
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

  const headerCard = `
    <div class="gcal-day-header-card">
      <div class="gcal-day-title-wrap">
        <h3>${WEEKDAY_FULL[selectedDay.getDay()]}, ${selectedDay.getDate()} de ${MONTH_NAMES[selectedDay.getMonth()]} de ${selectedDay.getFullYear()}</h3>
        <p>${dayEvents.length} compromisos registrados en tiempo real</p>
      </div>
      <div class="gcal-day-stats-pills">
        <div class="gcal-day-stat-chip"><span style="color:#fecaca;">●</span> ${critCount} Críticos</div>
        <div class="gcal-day-stat-chip"><span style="color:#fde68a;">●</span> ${warnCount} Alerta</div>
        <div class="gcal-day-stat-chip"><span style="color:#a7f3d0;">●</span> ${safeCount} En Término</div>
      </div>
    </div>
  `;

  let eventsListHtml = '<div class="gcal-day-events-list">';
  if (dayEvents.length === 0) {
    eventsListHtml += `
      <div class="gcal-day-empty-state" style="text-align: center; padding: 48px 20px; background: #fff; border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--text-muted); margin-bottom: 12px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <h4 style="font-size: 1rem; font-weight: 700; color: var(--text-main); margin: 0 0 4px 0;">No hay compromisos agendados para este día</h4>
        <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0;">Puedes agendar una nueva actividad con el botón "Crear" de la barra superior.</p>
      </div>
    `;
  } else {
    dayEvents.forEach((ev) => {
      eventsListHtml += `
        <div class="gcal-day-event-card sem-${ev.urgencia}" style="background: #fff; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px 20px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span class="badge ${ev.urgencia === 'danger' ? 'status-critico' : ev.urgencia === 'warning' ? 'status-alerta' : 'status-exito'}" style="font-size: 0.72rem;">
                ${ev.diasRestantes <= 0 ? 'Término Vencido' : `${ev.diasRestantes} días restantes`}
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
 * Renderiza la vista Agenda
 */
function renderAgendaView() {
  const agendaV = document.getElementById('gcal-agenda-view');
  if (!agendaV) return;
  agendaV.innerHTML = '';

  const events = getFilteredEvents();

  if (events.length === 0) {
    agendaV.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; background: #fff; border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
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
    groupEl.style.cssText = 'margin-bottom: 20px; background: #fff; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden;';

    const parts = dateStr.split('-');
    const y = parseInt(parts[0] || '2026', 10);
    const m = parseInt(parts[1] || '1', 10) - 1;
    const d = parseInt(parts[2] || '1', 10);
    const dObj = new Date(y, m, d);
    const formattedHeader = `${WEEKDAY_FULL[dObj.getDay()] || ''}, ${dObj.getDate()} de ${MONTH_NAMES[dObj.getMonth()] || ''} de ${dObj.getFullYear()}`;

    let rowsHtml = `
      <div class="gcal-agenda-date-header" style="background: #f8fafc; padding: 10px 16px; border-bottom: 1px solid var(--border-color); font-weight: 800; font-size: 0.85rem; color: var(--text-main); display: flex; justify-content: space-between;">
        <span>${formattedHeader}</span>
        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">${dayEvents.length} actividad(es)</span>
      </div>
    `;

    dayEvents.forEach((ev) => {
      rowsHtml += `
        <div class="gcal-agenda-row" style="padding: 14px 16px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
            <div style="width: 10px; height: 10px; border-radius: 50%; background: ${ev.urgencia === 'danger' ? '#dc2626' : ev.urgencia === 'warning' ? '#f59e0b' : '#10b981'}; flex-shrink: 0;"></div>
            <div>
              <div style="font-weight: 700; color: var(--text-main); font-size: 0.88rem;">${ev.titulo}</div>
              <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 2px;">
                ${ev.hora || 'Todo el día'} &bull; Destino: ${ev.destino} &bull; Resp: ${ev.responsable}
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="badge ${ev.urgencia === 'danger' ? 'status-critico' : ev.urgencia === 'warning' ? 'status-alerta' : 'status-exito'}" style="font-size: 0.72rem;">
              ${ev.diasRestantes <= 0 ? 'Vencido' : `${ev.diasRestantes} días`}
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
          <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 14px; border-left: 4px solid ${ev.urgencia === 'danger' ? '#dc2626' : ev.urgencia === 'warning' ? '#f59e0b' : '#10b981'};">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
              <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin: 0 0 4px 0;">${ev.titulo}</h4>
              <span class="badge ${ev.urgencia === 'danger' ? 'status-critico' : ev.urgencia === 'warning' ? 'status-alerta' : 'status-exito'}" style="font-size: 0.7rem;">
                ${ev.diasRestantes <= 0 ? 'Vencido' : `${ev.diasRestantes}d`}
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
      
      // Si no hubo token API directo, abrir la ventana oficial de Google Calendar para confirmar guardado con 1 clic
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
