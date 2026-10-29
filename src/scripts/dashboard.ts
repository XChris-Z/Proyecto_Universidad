// src/scripts/dashboard.ts
// Lógica de cliente específica de la página de Dashboard

import { documents } from '@data/documents';
import { COLEGIADOS_NORMAS } from '@data/normas';
import { CALENDARIO_EVENTS } from '@data/calendar';
import { DEPENDENCIAS_DATA } from '@data/dependencias';
import { calculateDeadlineProgress } from '@lib/utils';

export function initDashboard() {
  // 1. Renderizar Reparto Rectoral Prioritario (Documentos Urgentes)
  const criticalList = document.getElementById('dashboard-critical-list');
  if (criticalList) {
    criticalList.innerHTML = '';
    const pendingDocs = documents.filter(d => d.responseStatus === 'pendiente').slice(0, 4);

    pendingDocs.forEach((doc) => {
      const progress = calculateDeadlineProgress(doc.uploadDate, doc.dueDate);
      const card = document.createElement('div');
      card.className = 'critical-doc-card';
      card.style.cssText = `
        padding: 14px 18px; border: 1px solid var(--border-color); border-radius: 10px;
        background: var(--bg-surface); display: flex; justify-content: space-between;
        align-items: center; gap: 16px; flex-wrap: wrap;
      `;

      card.innerHTML = `
        <div style="flex: 1; min-width: 250px;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
            <span class="badge ${progress.statusClass}" style="font-size: 0.72rem; padding: 2px 8px; border-radius: 4px;">
              ${progress.statusBadge}
            </span>
            <span style="font-size: 0.78rem; font-family: monospace; color: var(--text-muted);">${doc.radicado}</span>
          </div>
          <div style="font-weight: 700; font-size: 0.92rem; color: var(--text-main); margin-bottom: 2px;">
            ${doc.title}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">
            Solicitante: <strong>${doc.applicant}</strong> &bull; Término: ${doc.slaDays} días hábiles
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <a href="/archivos" class="btn btn-secondary btn-sm" style="text-decoration: none; font-size: 0.78rem;">
            Ver Expediente
          </a>
          <a href="/peticiones" class="btn btn-primary btn-sm" style="text-decoration: none; font-size: 0.78rem;">
            Responder
          </a>
        </div>
      `;

      criticalList.appendChild(card);
    });
  }

  // 2. Renderizar Actos Colegiados Recientes
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
            <span class="badge" style="background: var(--primary-subtle); color: var(--primary); font-size: 0.7rem; padding: 2px 6px;">
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

  // 3. Renderizar Agenda y Calendario Reciente
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

  // 4. Renderizar Carga Operativa por Dependencias
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
          <div style="width: 38px; height: 38px; border-radius: 8px; background: ${dep.color}; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem;">
            ${dep.codigo}
          </div>
          <div>
            <div style="font-weight: 700; font-size: 0.88rem; color: var(--text-main);">${dep.nombre}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${dep.jefe}</div>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 800; font-size: 1.1rem; color: var(--primary);">${dep.archivosActivos}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted);">Expedientes</div>
        </div>
      `;
      workloadGrid.appendChild(card);
    });
  }
}

