// src/scripts/peticiones.ts
// Lógica de cliente para el Módulo de Derechos de Petición y PQRS

import { documents } from '@data/documents';
import { INSTITUTIONAL_USERS } from '@data/users';
import { calculateDeadlineProgress } from '@lib/utils';
import type { Document } from '@lib/types';

let currentFilter = 'all';

export function initPeticiones() {
  const tbody = document.getElementById('peticiones-table-body');
  const filterTabs = document.querySelectorAll('#peticiones-filter-tabs .filter-tab');

  function getPetitions(): Document[] {
    return documents.filter(d => d.category === 'Derecho de Petición');
  }

  function updateCounts() {
    const petitions = getPetitions();
    const total = petitions.length;
    const particular = petitions.filter(d => d.originRight.includes('Particular')).length;
    const general = petitions.filter(d => d.originRight.includes('General')).length;
    const info = petitions.filter(d => d.slaDays === 10 || d.originRight.includes('Información')).length;
    const consulta = petitions.filter(d => d.slaDays === 30 || d.originRight.includes('Consulta')).length;
    const pendientes = petitions.filter(d => d.responseStatus === 'pendiente').length;

    const elAll = document.getElementById('pcount-all');
    const elPart = document.getElementById('pcount-particular');
    const elGen = document.getElementById('pcount-general');
    const elInfo = document.getElementById('pcount-info');
    const elCon = document.getElementById('pcount-consulta');
    const elPend = document.getElementById('pcount-pendientes');

    if (elAll) elAll.textContent = String(total);
    if (elPart) elPart.textContent = String(particular);
    if (elGen) elGen.textContent = String(general);
    if (elInfo) elInfo.textContent = String(info);
    if (elCon) elCon.textContent = String(consulta);
    if (elPend) elPend.textContent = String(pendientes);
  }

  function renderTable() {
    if (!tbody) return;
    tbody.innerHTML = '';
    const petitions = getPetitions();

    const filtered = petitions.filter(doc => {
      if (currentFilter === 'all') return true;
      if (currentFilter === 'particular') return doc.originRight.includes('Particular');
      if (currentFilter === 'general') return doc.originRight.includes('General');
      if (currentFilter === 'informacion') return doc.slaDays === 10 || doc.originRight.includes('Información');
      if (currentFilter === 'consulta') return doc.slaDays === 30 || doc.originRight.includes('Consulta');
      if (currentFilter === 'pendientes') return doc.responseStatus === 'pendiente';
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 36px; color: var(--text-muted);">
            No se registran derechos de petición para la categoría seleccionada.
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(doc => {
      const progress = calculateDeadlineProgress(doc.uploadDate, doc.dueDate);
      const responsible = INSTITUTIONAL_USERS.find(u => u.id === doc.responsibleId) || INSTITUTIONAL_USERS[0]!;
      const isResponded = doc.responseStatus === 'respondida';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-main); margin-bottom: 2px;">
            ${doc.title}
          </div>
          <div style="font-size: 0.76rem; color: var(--text-muted);">
            Peticionario: <strong>${doc.applicant}</strong> (${doc.applicantType})
          </div>
        </td>
        <td>
          <span style="font-family: monospace; font-size: 0.82rem; font-weight: 700; color: var(--primary);">
            ${doc.radicado}
          </span>
        </td>
        <td>
          <span class="badge" style="background: var(--primary-subtle); color: var(--primary); font-size: 0.72rem; padding: 2px 8px; border-radius: 4px;">
            ${doc.originRight}
          </span>
        </td>
        <td>
          <span style="font-weight: 700; font-size: 0.82rem; color: var(--text-main);">
            ${doc.slaDays} Días Hábiles
          </span>
        </td>
        <td>
          <div style="min-width: 130px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.72rem; margin-bottom: 3px;">
              <span class="badge ${progress.statusClass}" style="font-size: 0.68rem; padding: 1px 6px; border-radius: 4px;">
                ${progress.statusBadge}
              </span>
              <span>${progress.percentage}%</span>
            </div>
            <div class="dist-progress-bg" style="height: 6px;">
              <div class="dist-progress-fill" style="width: ${progress.percentage}%; background: ${progress.percentage > 80 ? 'var(--status-critical)' : progress.percentage > 50 ? 'var(--status-warn)' : 'var(--status-safe)'};"></div>
            </div>
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 28px; height: 28px; border-radius: 50%; background: ${responsible.avatarColor}; color: #fff; font-size: 0.72rem; font-weight: 700; display: flex; align-items: center; justify-content: center;">
              ${responsible.initials}
            </div>
            <div style="font-size: 0.78rem;">
              <div style="font-weight: 600; color: var(--text-main);">${responsible.name}</div>
              <div style="font-size: 0.7rem; color: var(--text-muted);">${responsible.role}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="badge-response-status ${isResponded ? 'responded' : 'pending'}" style="font-size: 0.72rem; padding: 4px 8px; border-radius: 4px;">
            ${isResponded ? '✓ Respondida' : '⏳ En Trámite'}
          </span>
        </td>
        <td style="text-align: right;">
          <a href="/archivos" class="btn btn-secondary btn-sm" style="text-decoration: none; font-size: 0.78rem;">
            Ver en Archivos
          </a>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.getAttribute('data-pfilter') || 'all';
      renderTable();
    });
  });

  updateCounts();
  renderTable();
}
