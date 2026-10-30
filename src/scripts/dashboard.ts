// src/scripts/dashboard.ts
// Lógica de cliente específica de la página de Dashboard

import { CALENDARIO_EVENTS } from '@data/calendar';

export function initDashboard() {
  // 1. Renderizar Agenda y Calendario Reciente si existe contenedor
  const calRecentList = document.getElementById('dashboard-calendar-recent-list');
  if (calRecentList && calRecentList.children.length === 0) {
    calRecentList.innerHTML = '';
    const recentEvents = CALENDARIO_EVENTS.slice(0, 3);

    if (recentEvents.length === 0) {
      calRecentList.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.82rem;">
          No hay eventos programados en la agenda próxima.
        </div>
      `;
      return;
    }

    recentEvents.forEach((ev) => {
      const item = document.createElement('div');
      item.className = 'cal-mini-item';
      item.style.cssText = 'padding: 10px 0; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;';
      item.innerHTML = `
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
            <span class="badge ${ev.urgencia === 'danger' ? 'status-critico' : 'status-alerta'}" style="font-size: 0.7rem; padding: 2px 6px;">
              ${ev.diasRestantes} días
            </span>
            <span style="font-size: 0.75rem; color: var(--text-muted);">${ev.fecha}</span>
          </div>
          <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-main); line-height: 1.3;">
            ${ev.titulo}
          </div>
        </div>
        <a href="/calendario" class="btn btn-ghost btn-sm" style="text-decoration: none; font-size: 0.75rem;">Ver</a>
      `;
      calRecentList.appendChild(item);
    });
  }
}
