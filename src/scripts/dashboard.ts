// src/scripts/dashboard.ts
// Lógica de cliente específica de la página de Dashboard

import { COLEGIADOS_NORMAS } from '@data/normas';
import { CALENDARIO_EVENTS } from '@data/calendar';
import { DEPENDENCIAS_DATA } from '@data/dependencias';

export function initDashboard() {
  // 1. Renderizar Actos Colegiados Recientes
  const colegiadosList = document.getElementById('dashboard-colegiados-recent-list');
  if (colegiadosList) {
    colegiadosList.innerHTML = '';
    const recentNormas = COLEGIADOS_NORMAS.slice(0, 3);

    recentNormas.forEach((norma) => {
      const item = document.createElement('div');
      item.className = 'colegiado-mini-item';
      item.style.cssText = 'padding: 10px 0; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;';
      item.innerHTML = `
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
            <span class="badge" style="background: var(--verde-suave-bg); color: var(--verde-principal); font-size: 0.7rem; padding: 2px 6px; border: 1px solid var(--verde-borde);">
              ${norma.tipo} ${norma.numero}/${norma.year}
            </span>
            <span style="font-size: 0.75rem; color: var(--text-muted);">${norma.fecha}</span>
          </div>
          <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-main); line-height: 1.3;">
            ${norma.titulo}
          </div>
        </div>
        <a href="/normas" class="btn btn-ghost btn-sm" style="text-decoration: none; font-size: 0.75rem;">Ver</a>
      `;
      colegiadosList.appendChild(item);
    });
  }

  // 2. Renderizar Agenda y Calendario Reciente (Semáforo de Plazos Autorizado)
  const calRecentList = document.getElementById('dashboard-calendar-recent-list');
  if (calRecentList) {
    calRecentList.innerHTML = '';
    const recentEvents = CALENDARIO_EVENTS.slice(0, 3);

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

  // 3. Renderizar Carga Operativa por Dependencias
  const workloadGrid = document.getElementById('dashboard-dependencias-workload-grid');
  if (workloadGrid) {
    workloadGrid.innerHTML = '';
    DEPENDENCIAS_DATA.slice(0, 6).forEach((dep) => {
      const card = document.createElement('div');
      card.style.cssText = `
        padding: 14px; border: 1px solid var(--border-color); border-radius: 8px;
        background: var(--bg-surface); display: flex; align-items: center; justify-content: space-between;
      `;
      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 38px; height: 38px; border-radius: 8px; background: var(--verde-principal); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem;">
            ${dep.codigo}
          </div>
          <div>
            <div style="font-weight: 700; font-size: 0.88rem; color: var(--text-main);">${dep.nombre}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${dep.jefe}</div>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 800; font-size: 1.1rem; color: var(--dorado-oscuro);">${dep.archivosActivos}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted);">Expedientes</div>
        </div>
      `;
      workloadGrid.appendChild(card);
    });
  }
}
