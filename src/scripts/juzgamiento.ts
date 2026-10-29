// src/scripts/juzgamiento.ts
// Lógica de cliente para la Fase de Juzgamiento Disciplinario

import { JUZGAMIENTO_CASES } from '@data/juzgamiento';
import { logSystemActivity } from '@lib/audit';
import type { JuzgamientoCase } from '@lib/types';

let currentStageFilter = 'all';

export function initJuzgamiento() {
  const tbody = document.getElementById('juzgamiento-table-body');
  const stageTabs = document.querySelectorAll('#juzgamiento-module-tabs .module-tab-btn');

  function updateCounts() {
    const total = JUZGAMIENTO_CASES.length;
    const autos = JUZGAMIENTO_CASES.filter(c => c.tipoActo.includes('Auto')).length;
    const apelaciones = JUZGAMIENTO_CASES.filter(c => c.tipoActo.includes('Apelación') || c.etapaProcesal.includes('Segunda')).length;

    const elAll = document.getElementById('juzg-count-all');
    const elAutos = document.getElementById('juzg-count-autos');
    const elApel = document.getElementById('juzg-count-apelaciones');

    if (elAll) elAll.textContent = String(total);
    if (elAutos) elAutos.textContent = String(autos);
    if (elApel) elApel.textContent = String(apelaciones);
  }

  function renderTable() {
    if (!tbody) return;
    tbody.innerHTML = '';

    const filtered = JUZGAMIENTO_CASES.filter(c => {
      if (currentStageFilter === 'all') return true;
      if (currentStageFilter === 'autos') return c.tipoActo.includes('Auto');
      if (currentStageFilter === 'apelaciones') return c.tipoActo.includes('Apelación') || c.etapaProcesal.includes('Segunda');
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 36px; color: var(--text-muted);">
            No se registran expedientes disciplinarios para la categoría seleccionada.
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="font-weight: 700; font-size: 0.88rem; color: var(--text-main);">${c.implicado}</div>
          <div style="font-size: 0.74rem; color: var(--text-muted);">${c.cargo}</div>
          <span style="font-family: monospace; font-size: 0.72rem; color: var(--primary); font-weight: 700;">${c.radicado}</span>
        </td>
        <td>
          <span class="badge" style="background: #f3e8ff; color: #7e22ce; font-size: 0.74rem; font-weight: 700;">
            ${c.tipoActo}
          </span>
        </td>
        <td style="max-width: 260px;">
          <div style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">
            ${c.conducta}
          </div>
        </td>
        <td>
          <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-main);">${c.etapaProcesal}</span>
        </td>
        <td>
          <span style="font-size: 0.78rem; color: var(--text-muted);">${c.fechaNotificacion}</span>
        </td>
        <td>
          <span style="font-size: 0.8rem; font-weight: 700; color: var(--primary);">${c.segundaInstancia}</span>
        </td>
        <td>
          <span class="badge ${c.diasRestantes <= 7 && c.diasRestantes > 0 ? 'status-critico' : c.diasRestantes === 0 ? '' : 'status-alerta'}" style="font-size: 0.72rem; padding: 2px 8px; border-radius: 4px;">
            ${c.diasRestantes > 0 ? `${c.diasRestantes} días restantes` : c.estado}
          </span>
        </td>
        <td style="text-align: right;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.showToast('Accediendo a expediente reservado: ${c.radicado}')">
            Ver Piezas
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  stageTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      stageTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentStageFilter = tab.getAttribute('data-jstage') || 'all';
      renderTable();
    });
  });

  const modal = document.getElementById('new-juzgamiento-modal');
  document.getElementById('btn-open-juzgamiento-modal')?.addEventListener('click', () => {
    if (modal) modal.style.display = 'flex';
  });
  document.getElementById('btn-close-new-juzg-modal')?.addEventListener('click', () => {
    if (modal) modal.style.display = 'none';
  });

  updateCounts();
  renderTable();
}

