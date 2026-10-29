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
      container.innerHTML = `
        <div class="programas-cards-grid">
          ${PROGRAMAS_ACADEMICOS.historial.map(p => `
            <div class="programa-card">
              <div class="programa-top-meta">
                <span class="snies-badge">SNIES: ${p.snies}</span>
                ${p.acreditacionAltaCalidad ? `
                  <span class="acreditacion-badge alta-calidad">★ Alta Calidad CNA</span>
                ` : (p.estadoRegistro.includes('Negación') ? `
                  <span class="acreditacion-badge negado">✕ Negado / Recurso</span>
                ` : `
                  <span class="acreditacion-badge registro-calificado">✓ Registro Calificado</span>
                `)}
              </div>
              <div class="programa-title">${p.nombre}</div>
              <div class="programa-facultad">${p.facultad} &bull; ${p.nivel}</div>
              
              <div class="programa-details-grid">
                <div>
                  <label>Acto MEN:</label>
                  <strong>${p.actoNumero}</strong>
                </div>
                <div>
                  <label>Vigencia:</label>
                  <strong>${p.vigenciaAnios}</strong>
                </div>
                <div>
                  <label>Modalidad / Créditos:</label>
                  <strong>${p.modalidad} (${p.creditos} cr.)</strong>
                </div>
                <div>
                  <label>Estado Trámite:</label>
                  <strong style="color: ${p.estadoRegistro.includes('Negación') ? '#dc2626' : 'var(--primary)'};">${p.estadoRegistro}</strong>
                </div>
              </div>

              <p style="font-size: 0.76rem; color: var(--text-muted); line-height: 1.5; flex: 1; margin: 0 0 14px 0;">
                ${p.observaciones}
              </p>

              <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 12px;">
                <span style="font-size: 0.72rem; color: var(--text-muted);">Fecha Acto: ${formatNiceDate(p.fechaActo)}</span>
                <button class="btn btn-secondary btn-sm" onclick="window.downloadUniversalOfficialDoc('programa', '${p.id}')">
                  <span>Ver Resolución MEN</span>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (tabName === 'saces') {
      container.innerHTML = `
        <div class="table-responsive">
          <table class="doc-table">
            <thead>
              <tr>
                <th>Programa Académico</th>
                <th>Tipo de Trámite Radicado</th>
                <th>Radicado SACES</th>
                <th>Fecha de Radicación</th>
                <th>Sala CONACES Asignada</th>
                <th>Etapa Actual / Visita de Pares</th>
                <th>Pares Evaluadores</th>
              </tr>
            </thead>
            <tbody>
              ${PROGRAMAS_ACADEMICOS.saces.map(s => `
                <tr>
                  <td><strong style="color: var(--text-main); font-size: 0.9rem;">${s.programa}</strong></td>
                  <td><span class="colegiado-badge superior">${s.tramite}</span></td>
                  <td><span class="norma-num-badge">${s.radicadoSACES}</span></td>
                  <td><span style="font-size: 0.78rem;">${formatNiceDate(s.fechaRadicacion)}</span></td>
                  <td><span style="font-size: 0.78rem; font-weight: 600;">${s.salaCONACES}</span></td>
                  <td><span style="font-weight: 700; color: var(--primary); font-size: 0.8rem;">${s.etapaActual}</span></td>
                  <td><div style="font-size: 0.74rem; color: var(--text-muted);">${s.paresAsignados}</div></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (tabName === 'acreditacion') {
      container.innerHTML = `
        <div class="colegiados-grid">
          ${PROGRAMAS_ACADEMICOS.acreditacion.map(a => `
            <div class="colegiado-card academico">
              <div class="colegiado-header">
                <span class="acreditacion-badge alta-calidad">★ Consejo Nacional de Acreditación (CNA)</span>
                <span class="norma-num-badge">${a.vigencia}</span>
              </div>
              <div class="colegiado-title">${a.programa}</div>
              <div style="font-size: 0.78rem; color: var(--primary); font-weight: 700; margin-bottom: 8px;">
                ${a.resolucionMEN}
              </div>
              <div class="colegiado-desc">${a.aspectosDestacados}</div>
              <div class="colegiado-footer">
                <span class="vigencia-pill vigente">${a.estado}</span>
                <span style="font-size: 0.78rem; font-weight: 800; color: var(--secondary);">Puntaje: ${a.puntajePares}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  // Event listeners for tabs
  document.querySelectorAll('#programas-module-tabs .module-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ptab = btn.getAttribute('data-ptab') || 'historial';
      renderProgramasTab(ptab);
    });
  });

  // Action button
  document.getElementById('btn-open-programa-modal')?.addEventListener('click', () => {
    window.showToast('Módulo de radicación de trámites MEN / SACES');
  });

  // Render initial
  renderProgramasTab('historial');
}
