// src/scripts/planeacion.ts
// Lógica de cliente para Planeación y Gestión CSU en Supabase

import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';

let currentPlanTab = 'financieros';
let informesList: any[] = [];

export async function initPlaneacion() {
  const container = document.getElementById('planeacion-tab-content');
  const tabs = document.querySelectorAll('#planeacion-module-tabs .module-tab-btn');

  async function loadInformes() {
    try {
      const { data, error } = await supabase
        .from('planeacion_informes' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        informesList = data;
      }
    } catch (err) {
      console.warn('Error cargando informes de planeación:', err);
    }
    updateCounts();
    renderContent();
  }

  function updateCounts() {
    const fin = informesList.filter(i => i.tipo === 'financiero').length;
    const rec = informesList.filter(i => i.tipo === 'rectoral').length;

    const elFin = document.getElementById('plan-count-fin');
    const elRec = document.getElementById('plan-count-rec');
    const kpiFin = document.getElementById('plan-kpi-count-fin');
    const kpiRec = document.getElementById('plan-kpi-count-rec');

    if (elFin) elFin.textContent = String(fin);
    if (elRec) elRec.textContent = String(rec);
    if (kpiFin) kpiFin.textContent = String(fin);
    if (kpiRec) kpiRec.textContent = String(rec);
  }

  function renderContent() {
    if (!container) return;
    container.innerHTML = '';
    updateCounts();

    if (currentPlanTab === 'financieros') {
      const finItems = informesList.filter(i => i.tipo === 'financiero');

      if (finItems.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px 16px; color: var(--text-muted); background: var(--bg-surface-elevated); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--verde-principal); margin-bottom: 8px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">No hay informes financieros disponibles actualmente</div>
            <p style="font-size: 0.85rem; margin-top: 4px;">Los informes financieros mensuales radicados ante el Consejo Superior (CSU) se listarán en esta sección.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="table-responsive">
          <table class="doc-table">
            <thead>
              <tr>
                <th>Periodo / Vigencia</th>
                <th>Radicado ante CSU</th>
                <th>Ingresos Reportados</th>
                <th>Gastos Ejecutados</th>
                <th>% Ejecución</th>
                <th>Estado Aprobación</th>
                <th style="text-align: right;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${finItems.map(inf => `
                <tr>
                  <td><strong>${inf.periodo}</strong></td>
                  <td><span style="font-family: monospace; font-size: 0.82rem; font-weight: 700; color: var(--primary);">${inf.radicado_csu || 'N/A'}</span></td>
                  <td><strong style="color: var(--status-safe);">${inf.ingresos || '$0'}</strong></td>
                  <td>${inf.gastos || '$0'}</td>
                  <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <div class="dist-progress-bg" style="width: 80px; height: 6px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
                        <div class="dist-progress-fill" style="width: ${inf.ejecucion_pct || 0}%; background: var(--primary); height: 100%;"></div>
                      </div>
                      <span>${inf.ejecucion_pct || 0}%</span>
                    </div>
                  </td>
                  <td><span class="badge status-safe">${inf.estado || 'Aprobado CSU'}</span></td>
                  <td style="text-align: right;">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="alert('Informe radicado: ${inf.radicado_csu || inf.periodo}')">
                      Ver Detalle
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (currentPlanTab === 'rectorales') {
      const recItems = informesList.filter(i => i.tipo === 'rectoral');

      if (recItems.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px 16px; color: var(--text-muted); background: var(--bg-surface-elevated); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--verde-principal); margin-bottom: 8px;"><path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
            <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">No hay informes de gestión rectoral disponibles actualmente</div>
            <p style="font-size: 0.85rem; margin-top: 4px;">Los informes periódicos presentados por la Rectoría se visualizarán aquí una vez formalizados.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">
          ${recItems.map(inf => `
            <div style="border: 1px solid var(--border-color); border-radius: 10px; padding: 18px; background: var(--bg-surface);">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <span class="badge" style="background: var(--verde-suave-bg); color: var(--verde-principal); font-size: 0.75rem;">${inf.radicado_csu || 'GESTIÓN RECTORAL'}</span>
                <span class="badge status-safe" style="font-size: 0.72rem;">${inf.estado || 'Aprobado'}</span>
              </div>
              <h4 style="font-size: 0.98rem; font-weight: 800; color: var(--text-main); margin-bottom: 6px;">${inf.periodo}</h4>
              <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.45; margin-bottom: 12px;">
                ${inf.observaciones || 'Informe de cumplimiento del Plan de Desarrollo Institucional.'}
              </p>
              <div style="border-top: 1px solid var(--border-subtle); padding-top: 10px; font-size: 0.74rem; color: var(--text-muted); display: flex; justify-content: space-between;">
                <span>Radicado en Supabase</span>
                <span>${new Date(inf.created_at).toLocaleDateString('es-CO')}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (currentPlanTab === 'metas') {
      const EJES_PDI = [
        { nombre: 'Eje 1: Calidad Académica y Formación Integral', avance: 82 },
        { nombre: 'Eje 2: Investigación, Innovación y Desarrollo Territorial', avance: 75 },
        { nombre: 'Eje 3: Proyección Social, Extensión e Internacionalización', avance: 68 },
        { nombre: 'Eje 4: Transformación Digital y Gobierno Electrónico', avance: 88 },
        { nombre: 'Eje 5: Sostenibilidad Financiera y Gestión Transparente', avance: 79 },
        { nombre: 'Eje 6: Bienestar Universitario y Comunidad Saludable', avance: 84 },
      ];

      container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
          ${EJES_PDI.map(eje => `
            <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 18px; background: var(--bg-surface);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-weight: 700; font-size: 0.88rem; color: var(--text-main);">${eje.nombre}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
                  <div style="width: ${eje.avance}%; height: 100%; background: var(--verde-principal);"></div>
                </div>
                <span style="font-size: 0.82rem; font-weight: 800; color: var(--verde-principal);">${eje.avance}%</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
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

  // Modal para radicar informe ante CSU
  const modal = document.getElementById('new-planeacion-modal');
  const openBtn = document.getElementById('btn-open-planeacion-modal');
  const closeBtn = document.getElementById('btn-close-plan-modal');
  const cancelBtn = document.getElementById('btn-cancel-plan');
  const form = document.getElementById('form-new-planeacion') as HTMLFormElement | null;
  const submitBtn = document.getElementById('btn-submit-plan') as HTMLButtonElement | null;

  openBtn?.addEventListener('click', () => {
    if (modal) modal.style.display = 'flex';
  });

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
  };

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tipo = (document.getElementById('new-plan-tipo') as HTMLSelectElement).value;
    const periodo = (document.getElementById('new-plan-periodo') as HTMLInputElement).value.trim();
    const radicado = (document.getElementById('new-plan-radicado') as HTMLInputElement).value.trim();
    const ejecucion = Number((document.getElementById('new-plan-ejecucion') as HTMLInputElement).value) || 0;
    const ingresos = (document.getElementById('new-plan-ingresos') as HTMLInputElement).value.trim();
    const gastos = (document.getElementById('new-plan-gastos') as HTMLInputElement).value.trim();
    const observaciones = (document.getElementById('new-plan-observaciones') as HTMLTextAreaElement).value.trim();

    const newId = `plan-${Date.now().toString(36)}`;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Radicando...';
    }

    try {
      const { error } = await supabase.from('planeacion_informes' as any).insert([{
        id: newId,
        tipo,
        periodo,
        radicado_csu: radicado || null,
        ejecucion_pct: ejecucion,
        ingresos: ingresos || null,
        gastos: gastos || null,
        observaciones: observaciones || null,
        estado: 'Aprobado CSU',
        created_at: new Date().toISOString()
      }] as any);

      if (error) throw error;

      await logSystemActivity({
        actor: { id: 'usr-root', name: 'Dr. Cristian Lemus', role: 'admin' },
        action: 'Radicación de Informe de Planeación CSU',
        actionType: 'GESTION',
        entity: 'Planeación Estratégica',
        entityId: newId,
        details: `Se radicó el informe de ${tipo} (${periodo}) ante el Consejo Superior Universitario.`,
        severity: 'INFO'
      });

      alert(`Informe de ${tipo} (${periodo}) radicado exitosamente ante el CSU.`);
      closeModal();
      form.reset();
      await loadInformes();
    } catch (err: any) {
      console.error('Error guardando informe:', err);
      alert('Error al radicar en Supabase: ' + (err.message || 'Error de base de datos'));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Radicar en Supabase';
      }
    }
  });

  await loadInformes();
}
