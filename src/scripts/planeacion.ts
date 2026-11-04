// src/scripts/planeacion.ts
// Lógica de cliente para Planeación y Gestión CSU en Supabase

import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';

let currentPlanTab = 'financieros';
let informesList: any[] = [];
let planSearchQuery = '';

export async function initPlaneacion() {
  const container = document.getElementById('planeacion-tab-content');
  const tabs = document.querySelectorAll('#planeacion-module-tabs .module-tab-btn');
  const searchInput = document.getElementById('planeacion-search-input') as HTMLInputElement | null;

  searchInput?.addEventListener('input', () => {
    planSearchQuery = (searchInput.value || '').toLowerCase().trim();
    renderContent();
  });

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

  async function deleteInforme(id: string, nombre: string) {
    const confirmDelete = window.confirm(
      `¿Está seguro de eliminar formalmente el informe "${nombre}"?\n\nEsta acción registrará la baja en la bitácora de auditoría inmutable.`
    );
    if (!confirmDelete) return;

    try {
      const { error } = await (supabase
        .from('planeacion_informes' as any)
        .delete()
        .eq('id', id) as any);

      if (error) throw error;

      await logSystemActivity({
        actor: { id: 'usr-root', name: 'Funcionario Planeación', role: 'admin' },
        action: `Eliminación de Informe CSU — ${nombre}`,
        actionType: 'ELIMINACION',
        entity: 'Planeación Estratégica',
        entityId: id,
        details: `Se eliminó el informe de planeación "${nombre}".`,
        severity: 'CRITICAL',
      });

      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast(`Informe "${nombre}" eliminado correctamente.`);
      }

      await loadInformes();
    } catch (err: any) {
      console.error('Error eliminando informe:', err);
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast('Error al eliminar informe: ' + (err.message || 'Error de servidor'), 'error');
      } else {
        alert('Error: ' + err.message);
      }
    }
  }

  function renderContent() {
    if (!container) return;
    container.innerHTML = '';
    updateCounts();

    if (currentPlanTab === 'financieros') {
      let finItems = informesList.filter(i => i.tipo === 'financiero');
      if (planSearchQuery) {
        finItems = finItems.filter(i => 
          String(i.periodo || '').toLowerCase().includes(planSearchQuery) ||
          String(i.radicado_csu || '').toLowerCase().includes(planSearchQuery) ||
          String(i.observaciones || '').toLowerCase().includes(planSearchQuery)
        );
      }

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
        <div class="table-responsive" style="border: 1px solid var(--border-color); border-radius: 8px; background: #ffffff;">
          <table class="doc-table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #F8FAFC; border-bottom: 1px solid var(--border-color); text-align: left; font-size: 0.74rem; text-transform: uppercase; color: var(--text-muted);">
                <th style="padding: 12px 14px;">Periodo / Vigencia</th>
                <th style="padding: 12px 14px;">Radicado ante CSU</th>
                <th style="padding: 12px 14px;">Ingresos Reportados</th>
                <th style="padding: 12px 14px;">Gastos Ejecutados</th>
                <th style="padding: 12px 14px;">% Ejecución</th>
                <th style="padding: 12px 14px;">Estado Aprobación</th>
                <th style="padding: 12px 14px; text-align: right;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${finItems.map(inf => `
                <tr style="border-bottom: 1px solid var(--border-subtle); font-size: 0.84rem;">
                  <td style="padding: 12px 14px;"><strong>${inf.periodo}</strong></td>
                  <td style="padding: 12px 14px;"><span style="font-family: monospace; font-size: 0.82rem; font-weight: 700; color: var(--primary);">${inf.radicado_csu || 'N/A'}</span></td>
                  <td style="padding: 12px 14px;"><strong style="color: var(--status-safe);">${inf.ingresos || '$0 COP'}</strong></td>
                  <td style="padding: 12px 14px;">${inf.gastos || '$0 COP'}</td>
                  <td style="padding: 12px 14px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <div class="dist-progress-bg" style="width: 80px; height: 6px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
                        <div class="dist-progress-fill" style="width: ${inf.ejecucion_pct || 0}%; background: var(--verde-principal); height: 100%;"></div>
                      </div>
                      <span style="font-size: 0.76rem; font-weight: 700;">${inf.ejecucion_pct || 0}%</span>
                    </div>
                  </td>
                  <td style="padding: 12px 14px;"><span class="badge status-safe" style="font-size: 0.72rem;">${inf.estado || 'Aprobado CSU'}</span></td>
                  <td style="padding: 12px 14px; text-align: right; white-space: nowrap;">
                    <button type="button" class="btn btn-ghost btn-sm btn-del-informe" data-id="${inf.id}" data-nombre="${inf.radicado_csu || inf.periodo}" title="Eliminar informe" style="color: #dc2626; padding: 4px 8px;">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      container.querySelectorAll('.btn-del-informe').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id') || '';
          const nombre = btn.getAttribute('data-nombre') || 'Informe Financiero';
          deleteInforme(id, nombre);
        });
      });
    } else if (currentPlanTab === 'rectorales') {
      let recItems = informesList.filter(i => i.tipo === 'rectoral');
      if (planSearchQuery) {
        recItems = recItems.filter(i => 
          String(i.periodo || '').toLowerCase().includes(planSearchQuery) ||
          String(i.radicado_csu || '').toLowerCase().includes(planSearchQuery) ||
          String(i.observaciones || '').toLowerCase().includes(planSearchQuery)
        );
      }

      if (recItems.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px 16px; color: var(--text-muted); background: var(--bg-surface-elevated); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--verde-principal); margin-bottom: 8px;"><path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
            <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">No hay informes de gestión rectoral disponibles actualmente</div>
            <p style="font-size: 0.85rem; margin-top: 4px;">Los informes periódicos presentados por la Rectoría ante el Consejo Superior (CSU) se visualizarán aquí una vez formalizados.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">
          ${recItems.map(inf => `
            <div style="border: 1px solid var(--border-color); border-radius: 10px; padding: 18px; background: #ffffff; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                  <span class="badge" style="background: var(--verde-suave-bg); color: var(--verde-principal); font-size: 0.75rem; font-weight: 700;">${inf.radicado_csu || 'GESTIÓN RECTORAL'}</span>
                  <span class="badge status-safe" style="font-size: 0.72rem;">${inf.estado || 'Aprobado'}</span>
                </div>
                <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin-bottom: 6px;">${inf.periodo}</h4>
                <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.45; margin-bottom: 12px;">
                  ${inf.observaciones || 'Informe oficial de cumplimiento del Plan de Desarrollo Institucional (PDI Unitrópico).'}
                </p>
              </div>
              <div style="border-top: 1px solid var(--border-subtle); padding-top: 10px; font-size: 0.74rem; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center;">
                <span>Radicado el: ${new Date(inf.created_at).toLocaleDateString('es-CO')}</span>
                <button type="button" class="btn btn-ghost btn-sm btn-del-informe" data-id="${inf.id}" data-nombre="${inf.radicado_csu || inf.periodo}" title="Eliminar informe" style="color: #dc2626; padding: 2px 6px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      container.querySelectorAll('.btn-del-informe').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id') || '';
          const nombre = btn.getAttribute('data-nombre') || 'Informe Rectoral';
          deleteInforme(id, nombre);
        });
      });
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
    if (modal) {
      modal.classList.add('open');
      modal.style.display = 'flex';
    }
  });

  const closeModal = () => {
    if (modal) {
      modal.classList.remove('open');
      modal.style.display = 'none';
    }
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
        actor: { id: 'usr-root', name: 'Funcionario Planeación', role: 'admin' },
        action: 'Radicación de Informe de Planeación CSU',
        actionType: 'GESTION',
        entity: 'Planeación Estratégica',
        entityId: newId,
        details: `Se radicó el informe de ${tipo} (${periodo}) ante el Consejo Superior Universitario.`,
        severity: 'INFO'
      });

      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast(`Informe de ${tipo} (${periodo}) radicado exitosamente ante el CSU.`);
      }
      closeModal();
      form.reset();
      await loadInformes();
    } catch (err: any) {
      console.error('Error guardando informe:', err);
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast('Error al radicar informe: ' + (err.message || 'Error en el servidor'), 'error');
      } else {
        alert('Error: ' + err.message);
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Radicar Informe';
      }
    }
  });

  await loadInformes();
}
