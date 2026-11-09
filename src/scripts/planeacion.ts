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
        <div class="pro-scroll-container table-scroll-wrapper" style="max-height: 520px; overflow-y: auto; overflow-x: auto; border: 1.5px solid #DCE4E3; border-radius: 12px; background: #ffffff;">
          <table class="doc-table" style="width: 100%; border-collapse: collapse; font-size: 0.86rem;">
            <thead style="position: sticky; top: 0; z-index: 10;">
              <tr style="background: #F2F7F6; border-bottom: 2px solid #DCE4E3; text-align: left; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.5px; color: #52606D;">
                <th style="padding: 14px 16px; position: sticky; top: 0; z-index: 10; background: #F2F7F6; box-shadow: 0 1px 0 #DCE4E3; white-space: nowrap;">Periodo / Vigencia</th>
                <th style="padding: 14px 16px; position: sticky; top: 0; z-index: 10; background: #F2F7F6; box-shadow: 0 1px 0 #DCE4E3; white-space: nowrap;">Radicado ante CSU</th>
                <th style="padding: 14px 16px; position: sticky; top: 0; z-index: 10; background: #F2F7F6; box-shadow: 0 1px 0 #DCE4E3;">Ingresos Reportados</th>
                <th style="padding: 14px 16px; position: sticky; top: 0; z-index: 10; background: #F2F7F6; box-shadow: 0 1px 0 #DCE4E3;">Gastos Ejecutados</th>
                <th style="padding: 14px 16px; position: sticky; top: 0; z-index: 10; background: #F2F7F6; box-shadow: 0 1px 0 #DCE4E3;">% Ejecución</th>
                <th style="padding: 14px 16px; position: sticky; top: 0; z-index: 10; background: #F2F7F6; box-shadow: 0 1px 0 #DCE4E3;">Estado Aprobación</th>
                <th style="padding: 14px 16px; position: sticky; top: 0; z-index: 10; background: #F2F7F6; box-shadow: 0 1px 0 #DCE4E3; text-align: right;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${finItems.map(inf => `
                <tr style="border-bottom: 1px solid #E2E8F0; font-size: 0.84rem;">
                  <td style="padding: 12px 16px; font-weight: 700; color: #111827;">${inf.periodo}</td>
                  <td style="padding: 12px 16px;"><span style="font-family: monospace; font-size: 0.82rem; font-weight: 800; color: #00594E; background: #F2F7F6; padding: 2px 8px; border-radius: 6px; border: 1px solid #B2CFCB;">${inf.radicado_csu || 'N/A'}</span></td>
                  <td style="padding: 12px 16px;"><strong style="color: #00594E;">${inf.ingresos || '$0 COP'}</strong></td>
                  <td style="padding: 12px 16px; color: #52606D;">${inf.gastos || '$0 COP'}</td>
                  <td style="padding: 12px 16px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <div class="dist-progress-bg" style="width: 80px; height: 6px; background: #E2E8F0; border-radius: 4px; overflow: hidden;">
                        <div class="dist-progress-fill" style="width: ${inf.ejecucion_pct || 0}%; background: #00594E; height: 100%;"></div>
                      </div>
                      <span style="font-size: 0.76rem; font-weight: 800; color: #00594E;">${inf.ejecucion_pct || 0}%</span>
                    </div>
                  </td>
                  <td style="padding: 12px 16px;"><span class="badge" style="font-size: 0.72rem; font-weight: 800; background: #DCFCE7; color: #00594E; border: 1px solid #B2CFCB; padding: 3px 8px; border-radius: 6px;">${inf.estado || 'Aprobado CSU'}</span></td>
                  <td style="padding: 12px 16px; text-align: right; white-space: nowrap;">
                    <button type="button" class="btn btn-ghost btn-sm btn-del-informe" data-id="${inf.id}" data-nombre="${inf.radicado_csu || inf.periodo}" title="Eliminar informe" style="color: #DC2626; padding: 4px 8px; border-radius: 6px; background: transparent; border: 1px solid transparent; cursor: pointer;">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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
            <div style="border: 1.5px solid #DCE4E3; border-radius: 12px; padding: 20px; background: #ffffff; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 8px rgba(0,0,0,0.03); min-width: 0; overflow-wrap: anywhere;">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 8px;">
                  <span class="badge" style="background: #F7F5EE; color: #786832; border: 1px solid #DBD2B0; font-size: 0.74rem; font-weight: 800; padding: 2px 8px; border-radius: 6px;">${inf.radicado_csu || 'GESTIÓN RECTORAL'}</span>
                  <span class="badge" style="font-size: 0.72rem; font-weight: 800; background: #DCFCE7; color: #00594E; border: 1px solid #B2CFCB; padding: 2px 8px; border-radius: 6px;">${inf.estado || 'Aprobado'}</span>
                </div>
                <h4 style="font-size: 1.05rem; font-weight: 800; color: #111827; margin: 4px 0 6px 0;">${inf.periodo}</h4>
                <p style="font-size: 0.82rem; color: #52606D; line-height: 1.5; margin-bottom: 12px;">
                  ${inf.observaciones || 'Informe oficial de cumplimiento del Plan de Desarrollo Institucional (PDI Unitrópico).'}
                </p>
              </div>
              <div style="border-top: 1px solid #E2E8F0; padding-top: 12px; font-size: 0.74rem; color: #64748B; display: flex; justify-content: space-between; align-items: center;">
                <span>Radicado el: <strong>${new Date(inf.created_at).toLocaleDateString('es-CO')}</strong></span>
                <button type="button" class="btn btn-ghost btn-sm btn-del-informe" data-id="${inf.id}" data-nombre="${inf.radicado_csu || inf.periodo}" title="Eliminar informe" style="color: #DC2626; padding: 4px 8px; border-radius: 6px; background: transparent; cursor: pointer;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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
