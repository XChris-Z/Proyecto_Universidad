// src/scripts/relacionamiento.ts
// Lógica de cliente para Relacionamiento Institucional y Convenios

import { CONVENIOS_DATA } from '@data/convenios';
import { formatNiceDate } from '@lib/utils';
import type { ConvenioItem } from '@lib/types';

let currentConvenioFilter = 'all';

export function initRelacionamiento() {
  const grid = document.getElementById('convenios-cards-grid');
  if (!grid) return;

  function renderConveniosGrid(filterType = 'all') {
    if (!grid) return;
    currentConvenioFilter = filterType;
    grid.innerHTML = '';

    document.querySelectorAll('#convenios-module-tabs .module-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-ctab') === filterType);
    });

    const setEl = (id: string, val: number | string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };

    const total = CONVENIOS_DATA.length;
    const gobCount = CONVENIOS_DATA.filter(c => c.tipo === 'gubernamental').length;
    const intCount = CONVENIOS_DATA.filter(c => c.tipo === 'internacional').length;
    const nalCount = CONVENIOS_DATA.filter(c => c.tipo === 'nacional').length;

    setEl('conv-count-all', total);
    setEl('conv-count-gob', gobCount);
    setEl('conv-count-int', intCount);
    setEl('conv-count-nal', nalCount);

    const filtered = CONVENIOS_DATA.filter(c => {
      if (filterType !== 'all' && c.tipo !== filterType) return false;
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">No se encontraron convenios en esta modalidad.</div>`;
      return;
    }

    filtered.forEach(c => {
      const card = document.createElement('div');
      card.className = 'convenio-card';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span class="convenio-type-badge ${c.tipo}">${c.tipoLabel}</span>
          <span class="norma-num-badge">${c.numero}</span>
        </div>
        <div class="convenio-entity">${c.entidad}</div>
        <div class="convenio-objeto">${c.objeto}</div>
        
        <div class="convenio-meta-row">
          <span>Vigencia:</span>
          <strong>${formatNiceDate(c.inicio)} &rarr; ${formatNiceDate(c.fin)}</strong>
        </div>
        <div class="convenio-meta-row">
          <span>Aporte / Cuantía:</span>
          <strong style="color: var(--primary);">${c.cuantia}</strong>
        </div>
        <div class="convenio-meta-row">
          <span>Supervisor Institucional:</span>
          <span>${c.supervisor}</span>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-color);">
          <span class="vigencia-pill vigente">${c.estado}</span>
          <button class="btn btn-primary btn-sm" onclick="window.downloadUniversalOfficialDoc('convenio', '${c.id}')" title="Descargar minuta y constancia formal">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Minuta de Convenio</span>
          </button>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // Modals
  const modal = document.getElementById('new-convenio-modal');
  const openBtn = document.getElementById('btn-open-convenio-modal');
  const closeBtn = document.getElementById('btn-close-new-conv-modal');
  const cancelBtn = document.getElementById('btn-cancel-new-conv');
  const form = document.getElementById('new-convenio-form') as HTMLFormElement | null;

  function openModal() {
    if (modal) modal.classList.add('open');
  }

  function closeModal() {
    if (modal) modal.classList.remove('open');
    form?.reset();
  }

  openBtn?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const tipo = (document.getElementById('select-conv-tipo') as HTMLSelectElement).value as 'gubernamental' | 'internacional' | 'nacional';
    const numero = (document.getElementById('input-conv-numero') as HTMLInputElement).value.trim();
    const entidad = (document.getElementById('input-conv-entidad') as HTMLInputElement).value.trim();
    const objeto = (document.getElementById('input-conv-objeto') as HTMLTextAreaElement).value.trim();
    const inicio = (document.getElementById('input-conv-inicio') as HTMLInputElement).value;
    const fin = (document.getElementById('input-conv-fin') as HTMLInputElement).value;
    const supervisor = (document.getElementById('input-conv-supervisor') as HTMLInputElement).value.trim() || 'Secretaría General';
    const cuantia = (document.getElementById('input-conv-cuantia') as HTMLInputElement).value.trim() || 'Sin cuantía pecuniaria';

    let tipoLabel = 'Cooperación Nacional';
    if (tipo === 'gubernamental') tipoLabel = 'Ente Gubernamental';
    else if (tipo === 'internacional') tipoLabel = 'Cooperación Internacional';

    const newConv: ConvenioItem = {
      id: 'conv-' + Date.now(),
      tipo,
      tipoLabel,
      numero,
      entidad,
      objeto,
      inicio,
      fin,
      cuantia,
      supervisor,
      estado: 'Activo / En Ejecución',
      archivoMinuta: `${numero.replace(/\s+/g, '_')}.pdf`
    };

    CONVENIOS_DATA.unshift(newConv);
    closeModal();
    renderConveniosGrid(tipo);
    window.showToast(`Convenio ${numero} con "${entidad}" registrado formalmente.`);
  });

  // Tab listeners
  document.querySelectorAll('#convenios-module-tabs .module-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ctab = btn.getAttribute('data-ctab') || 'all';
      renderConveniosGrid(ctab);
    });
  });

  // Initial render
  renderConveniosGrid('all');
}
