// src/scripts/calendario.ts
// Lógica de cliente para el Calendario Institucional tipo Google Calendar

import { CALENDARIO_EVENTS } from '@data/calendar';
import { documents } from '@data/documents';
import { calculateDeadlineProgress } from '@lib/utils';
import type { CalendarioEvent } from '@lib/types';

let currentYear = 2026;
let currentMonth = 9; // 0-indexed: 9 = Octubre
let activeView = 'month';

export function initCalendario() {
  const monthGrid = document.getElementById('gcal-month-grid-cells');
  const miniGrid = document.getElementById('gcal-mini-days-container');
  const monthTitle = document.getElementById('gcal-current-label');
  const miniTitle = document.getElementById('gcal-mini-title');
  const viewButtons = document.querySelectorAll('#gcal-view-switcher .gcal-view-btn');

  function getMonthName(m: number) {
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return months[m] || '';
  }

  function getAllEvents(): Array<{ id: string; titulo: string; fecha: string; tipo: string; color: string; dias: number }> {
    const list: Array<{ id: string; titulo: string; fecha: string; tipo: string; color: string; dias: number }> = [];

    CALENDARIO_EVENTS.forEach(e => {
      let color = '#1a73e8';
      if (e.tipo === 'colegiado') color = '#1e8e3e';
      if (e.tipo === 'reporte') color = '#f29900';
      if (e.tipo === 'financiero') color = '#9334e6';
      list.push({ id: e.id, titulo: e.titulo, fecha: e.fecha, tipo: e.tipo, color, dias: e.diasRestantes });
    });

    documents.filter(d => d.responseStatus === 'pendiente').forEach(d => {
      const p = calculateDeadlineProgress(d.uploadDate, d.dueDate);
      list.push({
        id: d.id,
        titulo: `Vence: ${d.title}`,
        fecha: d.dueDate,
        tipo: 'peticion',
        color: p.percentage > 80 ? '#d93025' : '#f29900',
        dias: p.daysRemaining
      });
    });

    return list;
  }

  function updateTitles() {
    const label = `${getMonthName(currentMonth)} de ${currentYear}`;
    if (monthTitle) monthTitle.textContent = label;
    if (miniTitle) miniTitle.textContent = `${getMonthName(currentMonth).slice(0, 3)} ${currentYear}`;
  }

  function renderMonthView() {
    if (!monthGrid) return;
    monthGrid.innerHTML = '';
    const events = getAllEvents();

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    // Días mes previo
    for (let i = firstDay - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const cell = document.createElement('div');
      cell.className = 'gcal-cell other-month';
      cell.style.cssText = 'min-height: 110px; border: 1px solid var(--border-color); padding: 4px; background: #fafafa; opacity: 0.5;';
      cell.innerHTML = `<span style="font-size: 0.75rem; color: var(--text-muted);">${dayNum}</span>`;
      monthGrid.appendChild(cell);
    }

    // Días mes actual
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('div');
      cell.className = 'gcal-cell';
      cell.style.cssText = 'min-height: 110px; border: 1px solid var(--border-color); padding: 6px; background: var(--bg-surface); display: flex; flex-direction: column; overflow: hidden;';
      
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = events.filter(e => e.fecha === dateStr);

      const header = document.createElement('div');
      header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;';
      header.innerHTML = `<strong style="font-size: 0.82rem; color: var(--text-main);">${d}</strong>`;
      cell.appendChild(header);

      const eventsContainer = document.createElement('div');
      eventsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 3px; overflow-y: auto; max-height: 85px;';

      dayEvents.forEach(ev => {
        const chip = document.createElement('div');
        chip.style.cssText = `
          background: ${ev.color}; color: #fff; font-size: 0.68rem; font-weight: 600;
          padding: 2px 6px; border-radius: 3px; white-space: nowrap; overflow: hidden;
          text-overflow: ellipsis; cursor: pointer;
        `;
        chip.textContent = ev.titulo;
        chip.title = `${ev.titulo} (${ev.fecha})`;
        chip.onclick = () => window.showToast(`Evento: ${ev.titulo}`);
        eventsContainer.appendChild(chip);
      });

      cell.appendChild(eventsContainer);
      monthGrid.appendChild(cell);
    }
  }

  function renderMiniCal() {
    if (!miniGrid) return;
    miniGrid.innerHTML = '';

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
      const span = document.createElement('span');
      span.style.cssText = 'font-size: 0.72rem; color: var(--border-color); text-align: center;';
      miniGrid.appendChild(span);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const span = document.createElement('span');
      span.style.cssText = 'font-size: 0.72rem; color: var(--text-main); text-align: center; padding: 3px 0; cursor: pointer; border-radius: 50%;';
      span.textContent = String(d);
      miniGrid.appendChild(span);
    }
  }

  // Navigation handlers
  document.getElementById('gcal-btn-prev')?.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    updateTitles();
    renderMonthView();
    renderMiniCal();
  });

  document.getElementById('gcal-btn-next')?.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    updateTitles();
    renderMonthView();
    renderMiniCal();
  });

  document.getElementById('gcal-btn-today')?.addEventListener('click', () => {
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
    updateTitles();
    renderMonthView();
    renderMiniCal();
  });

  // Switch views
  viewButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      viewButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeView = btn.getAttribute('data-gview') || 'month';

      const monthV = document.getElementById('gcal-month-view');
      const agendaV = document.getElementById('gcal-agenda-view');

      if (activeView === 'agenda') {
        if (monthV) monthV.style.display = 'none';
        if (agendaV) {
          agendaV.style.display = 'block';
          renderAgendaView();
        }
      } else {
        if (monthV) monthV.style.display = 'block';
        if (agendaV) agendaV.style.display = 'none';
      }
    });
  });

  function renderAgendaView() {
    const agendaV = document.getElementById('gcal-agenda-view');
    if (!agendaV) return;
    agendaV.innerHTML = '';
    const events = getAllEvents().sort((a, b) => a.fecha.localeCompare(b.fecha));

    events.forEach(ev => {
      const item = document.createElement('div');
      item.style.cssText = 'padding: 14px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface);';
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 12px; height: 12px; border-radius: 50%; background: ${ev.color};"></div>
          <div>
            <div style="font-weight: 700; color: var(--text-main); font-size: 0.9rem;">${ev.titulo}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${ev.fecha} &bull; ${ev.tipo.toUpperCase()}</div>
          </div>
        </div>
        <span class="badge" style="background: var(--bg-surface-elevated); font-size: 0.75rem;">
          ${ev.dias > 0 ? `${ev.dias} días restantes` : 'Término Vencido'}
        </span>
      `;
      agendaV.appendChild(item);
    });
  }

  // Create event button
  document.getElementById('btn-gcal-create-event')?.addEventListener('click', () => {
    window.showToast('Formulario para agendar nuevo evento institucional');
  });

  updateTitles();
  renderMonthView();
  renderMiniCal();
}

