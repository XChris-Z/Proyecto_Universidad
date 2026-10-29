// src/scripts/dependencias.ts
// Lógica de cliente para la Estructura Orgánica y Dependencias Universitarias

import { DEPENDENCIAS_DATA } from '@data/dependencias';
import { documents } from '@data/documents';
import type { DependenciaItem, FuncionarioItem } from '@lib/types';

export function initDependencias() {
  const container = document.getElementById('dependencias-cards-grid');
  if (!container) return;

  function renderDependenciasGrid(filterText = '', levelFilter = 'all') {
    if (!container) return;
    container.innerHTML = '';

    const q = filterText.toLowerCase();
    const filtered = DEPENDENCIAS_DATA.filter(dep => {
      const matchLevel = levelFilter === 'all' || dep.nivel === levelFilter;
      const matchText = !q ||
        dep.nombre.toLowerCase().includes(q) ||
        dep.codigo.toLowerCase().includes(q) ||
        dep.jefe.toLowerCase().includes(q) ||
        dep.competencias.toLowerCase().includes(q) ||
        dep.funcionarios.some(f => f.nombre.toLowerCase().includes(q));
      return matchLevel && matchText;
    });

    // Actualizar contadores
    const totalOfficials = DEPENDENCIAS_DATA.reduce((acc, d) => acc + d.funcionarios.length, 0);
    const totalActiveFiles = DEPENDENCIAS_DATA.reduce((acc, d) => acc + d.archivosActivos, 0);
    
    const setEl = (id: string, val: number | string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };

    setEl('dep-stat-total', DEPENDENCIAS_DATA.length);
    setEl('dep-stat-officials', totalOfficials);
    setEl('dep-stat-active-files', totalActiveFiles);

    filtered.forEach(dep => {
      const card = document.createElement('div');
      card.className = 'dependencia-card';
      const initials = dep.jefe.split(' ').map(n => n[0]).slice(-2).join('');
      
      card.innerHTML = `
        <div class="dep-header-row">
          <span class="dep-acronym-pill">${dep.codigo}</span>
          <span class="dep-level-badge">${dep.nivel}</span>
        </div>

        <h3 class="dep-title">${dep.nombre}</h3>
        <div class="dep-competencia">${dep.competencias}</div>

        <div class="dep-chief-box">
          <div class="dep-chief-avatar">${initials}</div>
          <div class="dep-chief-info">
            <div class="dep-chief-label">Titular / Jefe de Dependencia</div>
            <div class="dep-chief-name">${dep.jefe}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${dep.correo} &bull; ${dep.ext}</div>
          </div>
        </div>

        <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">
          Funcionarios Adscritos (${dep.funcionarios.length})
        </div>
        <div class="dep-officials-list">
          ${dep.funcionarios.map(f => `
            <div class="dep-official-row">
              <div>
                <strong>${f.nombre}</strong> &bull; <span style="color: var(--text-muted);">${f.cargo}</span>
              </div>
              <span style="font-size: 0.7rem; color: var(--secondary); font-weight: 700;">${f.ext ? 'Ext. ' + f.ext : ''}</span>
            </div>
          `).join('')}
        </div>

        <div class="dep-footer-actions">
          <div class="dep-files-count">
            <strong>${dep.archivosActivos}</strong> expedientes activos
          </div>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn-secondary btn-sm" data-action="add-official" data-dep="${dep.id}" title="Vincular nuevo funcionario">
              + Funcionario
            </button>
            <button type="button" class="btn btn-primary btn-sm" data-action="repartir" data-dep="${dep.id}" title="Repartir un expediente">
              ⚡ Repartir
            </button>
          </div>
        </div>
      `;

      card.querySelector('[data-action="add-official"]')?.addEventListener('click', () => {
        openAddOfficialModal(dep.id);
      });

      card.querySelector('[data-action="repartir"]')?.addEventListener('click', () => {
        const doc = documents.find(d => d.responseStatus !== 'respondida') || documents[0];
        if (doc) {
          window.showToast(`Expediente ${doc.radicado} preparado para reparto a ${dep.nombre}`);
        } else {
          window.showToast('No hay expedientes pendientes para reparto.', true);
        }
      });

      container.appendChild(card);
    });
  }

  // Modals: Add Official
  const addOfficialModal = document.getElementById('add-official-modal');
  const closeAddOfficialBtn = document.getElementById('btn-close-add-official');
  const cancelAddOfficialBtn = document.getElementById('btn-cancel-add-official');
  const addOfficialForm = document.getElementById('add-official-form') as HTMLFormElement | null;

  function openAddOfficialModal(preselectedDepId: string | null = null) {
    const select = document.getElementById('select-official-dependencia') as HTMLSelectElement | null;
    if (select) {
      select.innerHTML = DEPENDENCIAS_DATA.map(d => `
        <option value="${d.id}" ${preselectedDepId === d.id ? 'selected' : ''}>${d.nombre} (${d.codigo})</option>
      `).join('');
    }
    if (addOfficialModal) addOfficialModal.classList.add('open');
  }

  function closeAddOfficialModal() {
    if (addOfficialModal) addOfficialModal.classList.remove('open');
    if (addOfficialForm) addOfficialForm.reset();
  }

  document.getElementById('btn-open-add-official-modal')?.addEventListener('click', () => openAddOfficialModal());
  closeAddOfficialBtn?.addEventListener('click', closeAddOfficialModal);
  cancelAddOfficialBtn?.addEventListener('click', closeAddOfficialModal);

  addOfficialForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const depId = (document.getElementById('select-official-dependencia') as HTMLSelectElement).value;
    const nombre = (document.getElementById('input-official-name') as HTMLInputElement).value.trim();
    const cargo = (document.getElementById('input-official-role') as HTMLInputElement).value.trim();
    const email = (document.getElementById('input-official-email') as HTMLInputElement).value.trim();
    const ext = (document.getElementById('input-official-ext') as HTMLInputElement).value.trim() || 'Ext. S/N';

    const dep = DEPENDENCIAS_DATA.find(d => d.id === depId);
    if (!dep) return;

    const newOfficial: FuncionarioItem = {
      id: 'usr-off-' + Date.now(),
      nombre,
      cargo,
      email,
      ext
    };

    dep.funcionarios.push(newOfficial);
    closeAddOfficialModal();
    renderDependenciasGrid();
    window.showToast(`Funcionario ${nombre} vinculado a ${dep.codigo}.`);
  });

  // Modals: New Dependencia
  const newDepModal = document.getElementById('new-dependencia-modal');
  const openNewDepBtn = document.getElementById('btn-open-new-dep-modal');
  const closeNewDepBtn = document.getElementById('btn-close-new-dep');
  const cancelNewDepBtn = document.getElementById('btn-cancel-new-dep');
  const newDepForm = document.getElementById('new-dependencia-form') as HTMLFormElement | null;

  function openNewDepModal() {
    if (newDepModal) newDepModal.classList.add('open');
  }

  function closeNewDepModal() {
    if (newDepModal) newDepModal.classList.remove('open');
    if (newDepForm) newDepForm.reset();
  }

  openNewDepBtn?.addEventListener('click', openNewDepModal);
  closeNewDepBtn?.addEventListener('click', closeNewDepModal);
  cancelNewDepBtn?.addEventListener('click', closeNewDepModal);

  newDepForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const nombre = (document.getElementById('input-dep-nombre') as HTMLInputElement).value.trim();
    const codigo = (document.getElementById('input-dep-sigla') as HTMLInputElement).value.trim().toUpperCase();
    const nivel = (document.getElementById('select-dep-nivel') as HTMLSelectElement).value;
    const jefe = (document.getElementById('input-dep-jefe') as HTMLInputElement).value.trim();
    const correo = (document.getElementById('input-dep-correo') as HTMLInputElement).value.trim();
    const ext = (document.getElementById('input-dep-ext') as HTMLInputElement).value.trim() || 'Ext. S/N';
    const competencias = (document.getElementById('input-dep-competencias') as HTMLTextAreaElement).value.trim();

    const newDep: DependenciaItem = {
      id: 'dep-custom-' + Date.now(),
      codigo,
      nombre,
      nivel,
      jefe,
      jefeCargo: `Titular de ${nombre}`,
      correo,
      ext,
      color: '#00594E',
      competencias,
      archivosActivos: 0,
      funcionarios: [
        { id: 'usr-dep-' + Date.now(), nombre: jefe, cargo: `Director / Jefe de ${codigo}`, email: correo, ext }
      ]
    };

    DEPENDENCIAS_DATA.push(newDep);
    closeNewDepModal();
    renderDependenciasGrid();
    window.showToast(`Dependencia "${nombre}" (${codigo}) creada exitosamente.`);
  });

  // Filters
  const searchInput = document.getElementById('dep-search-input') as HTMLInputElement | null;
  const levelSelect = document.getElementById('dep-filter-level') as HTMLSelectElement | null;

  searchInput?.addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value;
    const level = levelSelect?.value || 'all';
    renderDependenciasGrid(q, level);
  });

  levelSelect?.addEventListener('change', (e) => {
    const level = (e.target as HTMLSelectElement).value;
    const q = searchInput?.value || '';
    renderDependenciasGrid(q, level);
  });

  // Initial render
  renderDependenciasGrid();
}
