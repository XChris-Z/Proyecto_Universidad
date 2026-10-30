// src/scripts/programas.ts
// Lógica de cliente para Gestión Académica y Acreditación Institucional

import { PROGRAMAS_ACADEMICOS } from '@data/programas';
import { formatNiceDate } from '@lib/utils';

let currentProgramasTab = 'historial';

export function initProgramas() {
  const container = document.getElementById('programas-tab-content');
  if (!container) return;

  function renderProgramasTab(tabName = 'historial') {
    if (!container) return;
    currentProgramasTab = tabName;
    container.innerHTML = '';

    document.querySelectorAll('#programas-module-tabs .module-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-ptab') === tabName);
    });

    const setEl = (id: string, val: number | string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };

    setEl('prog-count-total', PROGRAMAS_ACADEMICOS.historial.length);
    setEl('prog-count-saces', PROGRAMAS_ACADEMICOS.saces.length);
    setEl('prog-count-cna', PROGRAMAS_ACADEMICOS.acreditacion.length);

    if (tabName === 'historial') {
      if (PROGRAMAS_ACADEMICOS.historial.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px 16px; color: var(--text-muted); background: var(--bg-surface-elevated); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--verde-principal); margin-bottom: 8px;"><path d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 0 1 .665 6.479A11.952 11.952 0 0 0 12 20.055a11.952 11.952 0 0 0-6.824-2.998 12.078 12.078 0 0 1 .665-6.479L12 14zm-4 6v-7.5l4-2.222"/></svg>
            <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">No hay programas académicos registrados actualmente</div>
            <p style="font-size: 0.85rem; margin-top: 4px;">Utilice el botón superior para registrar un nuevo programa o trámite ante el MEN.</p>
          </div>
        `;
        return;
      }
    } else if (tabName === 'saces') {
      if (PROGRAMAS_ACADEMICOS.saces.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px 16px; color: var(--text-muted); background: var(--bg-surface-elevated); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--verde-principal); margin-bottom: 8px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
            <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">No hay procesos radicados ante SACES / MEN actualmente</div>
            <p style="font-size: 0.85rem; margin-top: 4px;">Los trámites de registro calificado y renovaciones se listarán aquí.</p>
          </div>
        `;
        return;
      }
    } else if (tabName === 'acreditacion') {
      if (PROGRAMAS_ACADEMICOS.acreditacion.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px 16px; color: var(--text-muted); background: var(--bg-surface-elevated); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--verde-principal); margin-bottom: 8px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">No hay procesos de acreditación CNA registrados actualmente</div>
            <p style="font-size: 0.85rem; margin-top: 4px;">Los programas en autoevaluación o con acreditación de alta calidad se listarán aquí.</p>
          </div>
        `;
        return;
      }
    }
  }

  document.querySelectorAll('#programas-module-tabs .module-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ptab = btn.getAttribute('data-ptab') || 'historial';
      renderProgramasTab(ptab);
    });
  });

  renderProgramasTab('historial');
}
