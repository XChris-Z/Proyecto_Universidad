// src/scripts/normas.ts
// Lógica de cliente para Cuerpos Colegiados y Normativa Institucional

import { COLEGIADOS_NORMAS } from '@data/normas';
import { logSystemActivity } from '@lib/audit';
import type { ColegiadoNorma } from '@lib/types';

let currentOrgFilter = 'all';

export function initNormas() {
  const grid = document.getElementById('colegiados-cards-grid');
  const orgTabs = document.querySelectorAll('#normas-module-tabs .module-tab-btn');
  const searchInput = document.getElementById('normas-search-input') as HTMLInputElement | null;
  const vigenciaSelect = document.getElementById('normas-filter-vigencia') as HTMLSelectElement | null;
  const yearSelect = document.getElementById('normas-filter-year') as HTMLSelectElement | null;

  function updateCounts() {
    const total = COLEGIADOS_NORMAS.length;
    const csu = COLEGIADOS_NORMAS.filter(n => n.organoCode === 'csu').length;
    const ca = COLEGIADOS_NORMAS.filter(n => n.organoCode === 'ca').length;
    const rec = COLEGIADOS_NORMAS.filter(n => n.organoCode === 'rectoria').length;
    const ele = COLEGIADOS_NORMAS.filter(n => n.organoCode === 'electoral').length;

    const elAll = document.getElementById('normas-count-all');
    const elCsu = document.getElementById('normas-count-csu');
    const elCa = document.getElementById('normas-count-ca');
    const elRec = document.getElementById('normas-count-rectoria');
    const elEle = document.getElementById('normas-count-electoral');

    if (elAll) elAll.textContent = String(total);
    if (elCsu) elCsu.textContent = String(csu);
    if (elCa) elCa.textContent = String(ca);
    if (elRec) elRec.textContent = String(rec);
    if (elEle) elEle.textContent = String(ele);
  }

  function renderGrid() {
    if (!grid) return;
    grid.innerHTML = '';

    const query = (searchInput?.value || '').toLowerCase();
    const vigencia = vigenciaSelect?.value || 'all';
    const year = yearSelect?.value || 'all';

    const filtered = COLEGIADOS_NORMAS.filter(n => {
      if (currentOrgFilter !== 'all' && n.organoCode !== currentOrgFilter) return false;
      if (vigencia !== 'all' && n.vigencia !== vigencia) return false;
      if (year !== 'all' && n.year !== year) return false;
      if (query && !n.titulo.toLowerCase().includes(query) && !n.numero.toLowerCase().includes(query) && !n.resumen.toLowerCase().includes(query)) return false;
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: var(--text-muted);">
          No se encontraron normas para los filtros seleccionados.
        </div>
      `;
      return;
    }

    filtered.forEach(norma => {
      const card = document.createElement('div');
      card.className = 'colegiado-card';
      card.style.cssText = `
        border: 1px solid var(--border-color); border-radius: 12px; padding: 20px;
        background: var(--bg-surface); display: flex; flex-direction: column; justify-content: space-between;
      `;

      card.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
            <span class="badge" style="background: var(--primary-subtle); color: var(--primary); font-size: 0.75rem; font-weight: 700;">
              ${norma.organo}
            </span>
            <span class="badge-status ${norma.vigencia === 'vigente' ? 'status-safe' : 'status-warn'}" style="font-size: 0.72rem; padding: 2px 8px; border-radius: 4px;">
              ${norma.vigencia.toUpperCase()}
            </span>
          </div>

          <h3 style="font-size: 1.05rem; color: var(--text-main); margin-bottom: 6px; line-height: 1.35;">
            ${norma.tipo} No. ${norma.numero} de ${norma.year}
          </h3>

          <div style="font-size: 0.8rem; color: var(--secondary-light); font-weight: 600; margin-bottom: 10px;">
            ${norma.descriptor} &bull; Fecha: ${norma.fecha}
          </div>

          <p style="font-size: 0.84rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 14px;">
            ${norma.titulo}
          </p>
        </div>

        <div style="border-top: 1px solid var(--border-subtle); padding-top: 12px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.75rem; color: var(--text-muted);">${norma.signatarios}</span>
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.showToast('Descargando archivo oficial ${norma.fileDownload}...')">
            📥 Descargar
          </button>
        </div>
      `;

      grid.appendChild(card);
    });
  }

  orgTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      orgTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentOrgFilter = tab.getAttribute('data-org') || 'all';
      renderGrid();
    });
  });

  searchInput?.addEventListener('input', renderGrid);
  vigenciaSelect?.addEventListener('change', renderGrid);
  yearSelect?.addEventListener('change', renderGrid);

  // Modal nueva norma
  const newNormaModal = document.getElementById('new-norma-modal');
  const btnOpenNewNorma = document.getElementById('btn-open-new-norma-modal');
  const btnCloseNewNorma = document.getElementById('btn-close-new-norma-modal');
  const btnCancelNewNorma = document.getElementById('btn-cancel-new-norma');
  const newNormaForm = document.getElementById('new-norma-form') as HTMLFormElement | null;

  btnOpenNewNorma?.addEventListener('click', () => {
    if (newNormaModal) newNormaModal.style.display = 'flex';
  });

  btnCloseNewNorma?.addEventListener('click', () => {
    if (newNormaModal) newNormaModal.style.display = 'none';
  });

  btnCancelNewNorma?.addEventListener('click', () => {
    if (newNormaModal) newNormaModal.style.display = 'none';
  });

  newNormaForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const organo = (document.getElementById('select-norma-organo') as HTMLSelectElement | null)?.value || 'Consejo Superior';
    const tipo = (document.getElementById('select-norma-tipo') as HTMLSelectElement | null)?.value || 'Acuerdo';
    const numero = (document.getElementById('input-norma-numero') as HTMLInputElement | null)?.value || '001';
    const fecha = (document.getElementById('input-norma-fecha') as HTMLInputElement | null)?.value || (new Date().toISOString().split('T')[0] ?? '2026-10-20');
    const titulo = (document.getElementById('input-norma-titulo') as HTMLInputElement | null)?.value || '';
    const resumen = (document.getElementById('input-norma-resumen') as HTMLTextAreaElement | null)?.value || '';

    const newNorma: ColegiadoNorma = {
      id: `norma-${Date.now()}`,
      organo,
      organoCode: organo.includes('Superior') ? 'csu' : organo.includes('Académico') ? 'ca' : organo.includes('Rectoría') ? 'rectoria' : 'electoral',
      tipo,
      numero,
      year: fecha.split('-')[0] ?? '2026',
      fecha,
      titulo,
      descriptor: 'Normatividad General',
      vigencia: 'vigente',
      resumen,
      signatarios: 'Secretaría General Institucional',
      fileDownload: `acto_${numero}_${fecha}.pdf`
    };

    COLEGIADOS_NORMAS.unshift(newNorma);

    logSystemActivity({
      actor: window.currentLoggedUser,
      action: 'Promulgación de Acto de Cuerpo Colegiado',
      actionType: 'GESTION',
      entity: 'Cuerpos Colegiados',
      entityId: `${tipo} No. ${numero}`,
      details: `Incorporación formal de: ${titulo}`,
      severity: 'INFO'
    });

    window.showToast(`Acto institucional ${tipo} No. ${numero} promulgado exitosamente.`);
    if (newNormaModal) newNormaModal.style.display = 'none';
    newNormaForm.reset();
    updateCounts();
    renderGrid();
  });

  updateCounts();
  renderGrid();
}
