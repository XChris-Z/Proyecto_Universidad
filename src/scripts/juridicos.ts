// src/scripts/juridicos.ts
// Lógica de cliente para Asuntos Jurídicos y Normativos

import { ASUNTOS_JURIDICOS_DATA } from '@data/juridicos';

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

    const brechasLen = (ASUNTOS_JURIDICOS_DATA.brechas || []).length;
    const conceptosLen = (ASUNTOS_JURIDICOS_DATA.conceptos || []).length;
    const litigiosLen = (ASUNTOS_JURIDICOS_DATA.litigios || []).length;
    const auditoriasLen = (ASUNTOS_JURIDICOS_DATA.auditorias || []).length;
    const directivasLen = (ASUNTOS_JURIDICOS_DATA.directivas || []).length;

    if (elBrechas) elBrechas.textContent = String(brechasLen);
    if (elConceptos) elConceptos.textContent = String(conceptosLen);
    if (elLitigios) elLitigios.textContent = String(litigiosLen);
    if (elAuditorias) elAuditorias.textContent = String(auditoriasLen);
    if (elDirectivas) elDirectivas.textContent = String(directivasLen);
  }

  function renderEmptyState(label: string) {
    if (!container) return;
    container.innerHTML = `
      <div style="text-align: center; padding: 48px 16px; color: var(--text-muted); background: var(--bg-surface-elevated); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--verde-principal); margin-bottom: 8px;"><path d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/></svg>
        <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">No hay ${label} registrados actualmente</div>
        <p style="font-size: 0.85rem; margin-top: 4px;">La Oficina Asesora Jurídica no registra expedientes activos en esta sección.</p>
      </div>
    `;
  }

  function renderContent() {
    if (!container) return;
    updateCounts();

    if (activeTab === 'brechas') {
      const list = ASUNTOS_JURIDICOS_DATA.brechas || [];
      if (list.length === 0) {
        renderEmptyState('brechas normativas');
        return;
      }
    } else if (activeTab === 'conceptos') {
      const list = ASUNTOS_JURIDICOS_DATA.conceptos || [];
      if (list.length === 0) {
        renderEmptyState('conceptos jurídicos');
        return;
      }
    } else if (activeTab === 'litigios') {
      const list = ASUNTOS_JURIDICOS_DATA.litigios || [];
      if (list.length === 0) {
        renderEmptyState('litigios o procesos judiciales');
        return;
      }
    } else if (activeTab === 'auditorias') {
      const list = ASUNTOS_JURIDICOS_DATA.auditorias || [];
      if (list.length === 0) {
        renderEmptyState('auditorías de entes de control');
        return;
      }
    } else if (activeTab === 'directivas') {
      const list = ASUNTOS_JURIDICOS_DATA.directivas || [];
      if (list.length === 0) {
        renderEmptyState('directivas ni circulares');
        return;
      }
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

  // Modal para proponer normativa
  const modal = document.getElementById('new-gap-modal');
  const openBtn = document.getElementById('btn-open-gap-modal');
  const closeBtn = document.getElementById('btn-close-gap-modal');
  const cancelBtn = document.getElementById('btn-cancel-gap');

  openBtn?.addEventListener('click', () => {
    if (modal) modal.style.display = 'flex';
  });

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
  };

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);

  renderContent();
}
