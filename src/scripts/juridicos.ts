// src/scripts/juridicos.ts
// Lógica de cliente para Asuntos Jurídicos y Normativos

import { ASUNTOS_JURIDICOS_DATA } from '@data/juridicos';
import { logSystemActivity } from '@lib/audit';

let activeTab = 'brechas';

export function initJuridicos() {
  const container = document.getElementById('juridicos-tab-content');
  const tabs = document.querySelectorAll('#juridicos-module-tabs .module-tab-btn');

  function updateCounts() {
    const elBrechas = document.getElementById('jcount-brechas');
    const elConceptos = document.getElementById('jcount-conceptos');
    const elLitigios = document.getElementById('jcount-litigios');
    const elAuditorias = document.getElementById('jcount-auditorias');
    const elDirectivas = document.getElementById('jcount-directivas');

    if (elBrechas) elBrechas.textContent = String(ASUNTOS_JURIDICOS_DATA.brechas.length);
    if (elConceptos) elConceptos.textContent = String(ASUNTOS_JURIDICOS_DATA.conceptos.length);
    if (elLitigios) elLitigios.textContent = String(ASUNTOS_JURIDICOS_DATA.litigios.length);
    if (elAuditorias) elAuditorias.textContent = String(ASUNTOS_JURIDICOS_DATA.auditorias.length);
    if (elDirectivas) elDirectivas.textContent = String(ASUNTOS_JURIDICOS_DATA.directivas.length);
  }

  function renderContent() {
    if (!container) return;
    container.innerHTML = '';

    if (activeTab === 'brechas') {
      const grid = document.createElement('div');
      grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;';
      ASUNTOS_JURIDICOS_DATA.brechas.forEach(b => {
        const card = document.createElement('div');
        card.className = 'juridico-card';
        card.style.cssText = 'border: 1px solid var(--border-color); border-radius: 10px; padding: 18px; background: var(--bg-surface);';
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <span class="badge" style="background: ${b.urgencia === 'Alta' ? '#fee2e2' : '#fef3c7'}; color: ${b.urgencia === 'Alta' ? '#dc2626' : '#d97706'}; font-size: 0.72rem;">
              Urgencia ${b.urgencia}
            </span>
            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">Meta: ${b.fechaLimite}</span>
          </div>
          <h4 style="font-size: 0.95rem; color: var(--text-main); margin-bottom: 6px;">${b.normaRequerida}</h4>
          <div style="font-size: 0.78rem; color: var(--secondary-light); font-weight: 600; margin-bottom: 8px;">
            ${b.mandatoNacional} &bull; ${b.organoCompetente}
          </div>
          <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.45; margin-bottom: 12px;">
            ${b.justificacion}
          </p>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; margin-bottom: 4px;">
            <span>Avance formulación:</span>
            <strong>${b.avancePct}%</strong>
          </div>
          <div class="dist-progress-bg" style="height: 6px;">
            <div class="dist-progress-fill" style="width: ${b.avancePct}%; background: var(--primary);"></div>
          </div>
        `;
        grid.appendChild(card);
      });
      container.appendChild(grid);
    } else if (activeTab === 'conceptos') {
      const grid = document.createElement('div');
      grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;';
      ASUNTOS_JURIDICOS_DATA.conceptos.forEach(c => {
        const card = document.createElement('div');
        card.className = 'juridico-card';
        card.style.cssText = 'border: 1px solid var(--border-color); border-radius: 10px; padding: 18px; background: var(--bg-surface);';
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
            <span class="badge" style="background: var(--primary-subtle); color: var(--primary); font-size: 0.72rem;">${c.tipo}</span>
            <span style="font-family: monospace; font-size: 0.78rem; font-weight: 700; color: var(--primary);">${c.radicado}</span>
          </div>
          <h4 style="font-size: 0.92rem; color: var(--text-main); margin-bottom: 6px;">${c.asunto}</h4>
          <div style="font-size: 0.76rem; color: var(--text-muted); margin-bottom: 8px;">
            Solicitante: <strong>${c.solicitante}</strong> &bull; Fecha: ${c.fecha}
          </div>
          <div style="background: var(--bg-surface-elevated); padding: 10px; border-radius: 6px; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 10px;">
            <strong>Sentido:</strong> <span style="color: var(--status-safe); font-weight: 700;">${c.sentido}</span><br>
            ${c.resumen}
          </div>
        `;
        grid.appendChild(card);
      });
      container.appendChild(grid);
    } else if (activeTab === 'litigios') {
      const grid = document.createElement('div');
      grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;';
      ASUNTOS_JURIDICOS_DATA.litigios.forEach(l => {
        const card = document.createElement('div');
        card.className = 'juridico-card';
        card.style.cssText = 'border: 1px solid var(--border-color); border-radius: 10px; padding: 18px; background: var(--bg-surface);';
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
            <span class="badge" style="background: #fee2e2; color: #dc2626; font-size: 0.72rem;">${l.tipo}</span>
            <span style="font-family: monospace; font-size: 0.75rem; color: var(--text-muted);">${l.radicado}</span>
          </div>
          <h4 style="font-size: 0.92rem; color: var(--text-main); margin-bottom: 4px;">${l.despacho}</h4>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 8px;">
            Demandante: ${l.demandante} &bull; Cuantía: <strong>${l.cuantia}</strong>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 10px;">
            <strong>Etapa:</strong> ${l.etapa}<br>
            ${l.resumen}
          </div>
          <div style="border-top: 1px solid var(--border-subtle); padding-top: 8px; display: flex; justify-content: space-between; font-size: 0.75rem;">
            <span>Riesgo Procesal: <strong>${l.riesgo}</strong></span>
            <span style="color: var(--status-safe); font-weight: 700;">${l.estado}</span>
          </div>
        `;
        grid.appendChild(card);
      });
      container.appendChild(grid);
    } else if (activeTab === 'auditorias') {
      const grid = document.createElement('div');
      grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;';
      ASUNTOS_JURIDICOS_DATA.auditorias.forEach(a => {
        const card = document.createElement('div');
        card.className = 'juridico-card';
        card.style.cssText = 'border: 1px solid var(--border-color); border-radius: 10px; padding: 18px; background: var(--bg-surface);';
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
            <span class="badge" style="background: var(--primary-subtle); color: var(--primary); font-size: 0.72rem;">${a.ente}</span>
            <span style="font-size: 0.75rem; color: var(--text-muted);">${a.vigenciaAuditada}</span>
          </div>
          <h4 style="font-size: 0.92rem; color: var(--text-main); margin-bottom: 6px;">${a.tipo}</h4>
          <div style="display: flex; gap: 8px; font-size: 0.75rem; margin-bottom: 10px;">
            <span class="badge status-safe">Fiscales: ${a.hallazgosFiscales}</span>
            <span class="badge status-warn">Disciplinarios: ${a.hallazgosDisciplinarios}</span>
            <span class="badge">Administrativos: ${a.hallazgosAdministrativos}</span>
          </div>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 10px;">${a.resumen}</p>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; margin-bottom: 4px;">
            <span>Avance Plan Mejoramiento:</span>
            <strong>${a.planMejoramientoAvance}%</strong>
          </div>
          <div class="dist-progress-bg" style="height: 6px;">
            <div class="dist-progress-fill" style="width: ${a.planMejoramientoAvance}%; background: var(--status-safe);"></div>
          </div>
        `;
        grid.appendChild(card);
      });
      container.appendChild(grid);
    } else if (activeTab === 'directivas') {
      const grid = document.createElement('div');
      grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;';
      ASUNTOS_JURIDICOS_DATA.directivas.forEach(d => {
        const card = document.createElement('div');
        card.className = 'juridico-card';
        card.style.cssText = 'border: 1px solid var(--border-color); border-radius: 10px; padding: 18px; background: var(--bg-surface);';
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
            <span class="badge" style="background: var(--primary-subtle); color: var(--primary); font-size: 0.72rem;">${d.tipo}</span>
            <span style="font-size: 0.75rem; color: var(--text-muted);">${d.fecha}</span>
          </div>
          <h4 style="font-size: 0.92rem; color: var(--text-main); margin-bottom: 4px;">${d.numero}</h4>
          <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 10px;">${d.asunto}</p>
          <div style="border-top: 1px solid var(--border-subtle); padding-top: 8px; display: flex; justify-content: space-between; font-size: 0.75rem;">
            <span>Emisor: <strong>${d.emisor}</strong></span>
            <span style="color: var(--status-safe); font-weight: 700;">${d.estado}</span>
          </div>
        `;
        grid.appendChild(card);
      });
      container.appendChild(grid);
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.getAttribute('data-jtab') || 'brechas';
      renderContent();
    });
  });

  // Modal nueva brecha
  const gapModal = document.getElementById('new-gap-modal');
  document.getElementById('btn-open-gap-modal')?.addEventListener('click', () => {
    if (gapModal) gapModal.style.display = 'flex';
  });
  document.getElementById('btn-close-gap-modal')?.addEventListener('click', () => {
    if (gapModal) gapModal.style.display = 'none';
  });
  document.getElementById('btn-cancel-gap')?.addEventListener('click', () => {
    if (gapModal) gapModal.style.display = 'none';
  });

  updateCounts();
  renderContent();
}

