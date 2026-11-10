// src/scripts/dashboard.ts
// Lógica de cliente específica de la página de Dashboard con eventos en tiempo real

import { getUnifiedCalendarEvents } from '@lib/calendar';

export async function initDashboard() {
  const calRecentList = document.getElementById('dashboard-calendar-recent-list');
  if (!calRecentList) return;

  calRecentList.innerHTML = `
    <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.8rem;">
      <span class="spinner" style="display: inline-block; width: 14px; height: 14px; border: 2px solid var(--border-color); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; margin-right: 6px; vertical-align: middle;"></span>
      Sincronizando compromisos próximos...
    </div>
  `;

  try {
    const today = new Date();
    const timeMin = today.toISOString();
    const timeMax = new Date(today.getFullYear(), today.getMonth() + 2, 0).toISOString();

    const { events } = await getUnifiedCalendarEvents(timeMin, timeMax);
    const recentEvents = events.slice(0, 4);

    calRecentList.innerHTML = '';

    if (recentEvents.length === 0) {
      calRecentList.innerHTML = `
        <div style="text-align: center; padding: 28px 16px; color: var(--text-muted); font-size: 0.82rem;">
          <p style="margin: 0 0 6px 0; font-weight: 600; color: var(--text-main);">Sin compromisos inmediatos</p>
          <span style="font-size: 0.78rem;">No hay eventos o vencimientos pendientes en la agenda próxima.</span>
        </div>
      `;
      return;
    }

    recentEvents.forEach((ev) => {
      const item = document.createElement('div');
      item.className = 'cal-mini-item';
      item.style.cssText = 'padding: 10px 0; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; gap: 8px;';
      
      const statusClass = ev.urgencia === 'danger' ? 'status-critico' : ev.urgencia === 'warning' ? 'status-alerta' : 'status-exito';
      const labelDias = ev.diasRestantes <= 0 ? 'Vencido' : `${ev.diasRestantes}d`;

      item.innerHTML = `
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
            <span class="badge ${statusClass}" style="font-size: 0.68rem; padding: 2px 6px;">
              ${labelDias}
            </span>
            <span style="font-size: 0.74rem; color: var(--text-muted);">${ev.fecha}</span>
            <span style="font-size: 0.70rem; color: var(--primary); text-transform: uppercase; font-weight: 700;">${ev.tipo}</span>
          </div>
          <div style="font-weight: 600; font-size: 0.84rem; color: var(--text-main); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${ev.titulo}">
            ${ev.titulo}
          </div>
        </div>
        <a href="${ev.link || '/calendario'}" ${ev.link?.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : ''} class="btn btn-ghost btn-sm" style="text-decoration: none; font-size: 0.74rem; padding: 4px 8px; flex-shrink: 0;">
          Ver
        </a>
      `;
      calRecentList.appendChild(item);
    });
  } catch (err) {
    console.warn('Error cargando agenda en dashboard:', err);
    calRecentList.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.8rem;">
        No se pudo sincronizar la agenda institucional.
      </div>
    `;
  }
}
