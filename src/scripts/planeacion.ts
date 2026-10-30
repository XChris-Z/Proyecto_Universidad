// src/scripts/planeacion.ts
// Lógica de cliente para Planeación y Gestión CSU

import { PLANEACION_DATA } from '@data/planeacion';

let currentPlanTab = 'financieros';

export function initPlaneacion() {
  const container = document.getElementById('planeacion-tab-content');
  const tabs = document.querySelectorAll('#planeacion-module-tabs .module-tab-btn');

  function renderContent() {
    if (!container) return;
    container.innerHTML = '';

    if (currentPlanTab === 'financieros') {
      if (PLANEACION_DATA.informesFinancieros.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px 16px; color: var(--text-muted); background: var(--bg-surface-elevated); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--verde-principal); margin-bottom: 8px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">No hay informes financieros disponibles actualmente</div>
            <p style="font-size: 0.85rem; margin-top: 4px;">Los informes financieros mensuales radicados ante el Consejo Superior (CSU) se listarán en esta sección.</p>
          </div>
        `;
        return;
      }

      const tableWrap = document.createElement('div');
      tableWrap.className = 'table-responsive';
      tableWrap.innerHTML = `
        <table class="doc-table">
          <thead>
            <tr>
              <th>Periodo / Mes</th>
              <th>Radicado ante CSU</th>
              <th>Fecha Presentación</th>
              <th>Ingresos Recaudados</th>
              <th>Gastos Ejecutados</th>
              <th>% Ejecución</th>
              <th>Estado Aprobación</th>
              <th style="text-align: right;">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${PLANEACION_DATA.informesFinancieros.map(inf => `
              <tr>
                <td><strong>${inf.mes}</strong></td>
                <td><span style="font-family: monospace; font-size: 0.82rem; font-weight: 700; color: var(--primary);">${inf.radicadoCSU}</span></td>
                <td>${inf.fechaPresentacion}</td>
                <td><strong style="color: var(--status-safe);">${inf.ingresosTotales}</strong></td>
                <td>${inf.gastosEjecutados}</td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="dist-progress-bg" style="width: 80px; height: 6px;">
                      <div class="dist-progress-fill" style="width: ${inf.ejecucionPct}%; background: var(--primary);"></div>
                    </div>
                    <span>${inf.ejecucionPct}%</span>
                  </div>
                </td>
                <td><span class="badge status-safe">${inf.estadoAprobacion}</span></td>
                <td style="text-align: right;">
                  <button type="button" class="btn btn-secondary btn-sm" onclick="window.showToast('Descargando ${inf.descarga}')">
                    Descargar
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      container.appendChild(tableWrap);
    } else if (currentPlanTab === 'rectorales') {
      if (PLANEACION_DATA.informesRectorales.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px 16px; color: var(--text-muted); background: var(--bg-surface-elevated); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--verde-principal); margin-bottom: 8px;"><path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
            <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">No hay informes de gestión rectoral disponibles actualmente</div>
            <p style="font-size: 0.85rem; margin-top: 4px;">Los informes periódicos presentados por la Rectoría se visualizarán aquí una vez formalizados.</p>
          </div>
        `;
        return;
      }

      const grid = document.createElement('div');
      grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;';
      PLANEACION_DATA.informesRectorales.forEach(inf => {
        const card = document.createElement('div');
        card.className = 'planeacion-card';
        card.style.cssText = 'border: 1px solid var(--border-color); border-radius: 10px; padding: 18px; background: var(--bg-surface);';
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <span class="badge" style="background: var(--primary-subtle); color: var(--primary); font-size: 0.75rem;">${inf.radicadoCSU}</span>
            <span class="badge status-safe" style="font-size: 0.72rem;">${inf.estadoCSU}</span>
          </div>
          <h4 style="font-size: 0.98rem; color: var(--text-main); margin-bottom: 6px;">${inf.periodo}</h4>
          <div style="font-size: 0.78rem; color: var(--secondary-light); font-weight: 600; margin-bottom: 8px;">
            Eje: ${inf.ejePrincipal} &bull; CSU: ${inf.fechaCSU}
          </div>
          <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.45; margin-bottom: 12px;">
            ${inf.resumenEjecutivo}
          </p>
          <div style="border-top: 1px solid var(--border-subtle); padding-top: 8px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.8rem; font-weight: 700; color: var(--primary);">Avance Metas: ${inf.avanceMetasPDI}</span>
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.showToast('Descargando informe de gestión...')">Descargar</button>
          </div>
        `;
        grid.appendChild(card);
      });
      container.appendChild(grid);
    } else if (currentPlanTab === 'metas') {
      if (PLANEACION_DATA.metasPDI.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px 16px; color: var(--text-muted); background: var(--bg-surface-elevated); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--verde-principal); margin-bottom: 8px;"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">No hay metas del PDI configuradas actualmente</div>
            <p style="font-size: 0.85rem; margin-top: 4px;">Las metas y ejes estratégicos institucionales se sincronizarán con el Plan de Desarrollo de Unitrópico.</p>
          </div>
        `;
        return;
      }

      const list = document.createElement('div');
      list.style.cssText = 'display: flex; flex-direction: column; gap: 14px;';
      PLANEACION_DATA.metasPDI.forEach(m => {
        const item = document.createElement('div');
        item.style.cssText = 'border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; background: var(--bg-surface);';
        item.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong style="color: var(--text-main); font-size: 0.92rem;">${m.nombre}</strong>
            <span class="badge status-safe">${m.cumplimiento}% &bull; ${m.estado}</span>
          </div>
          <div class="dist-progress-bg" style="height: 10px;">
            <div class="dist-progress-fill" style="width: ${m.cumplimiento}%; background: linear-gradient(90deg, var(--secondary) 0%, var(--primary) 100%);"></div>
          </div>
        `;
        list.appendChild(item);
      });
      container.appendChild(list);
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentPlanTab = tab.getAttribute('data-ptab') || 'financieros';
      renderContent();
    });
  });

  renderContent();
}
