// src/scripts/programas.ts
// Lógica de cliente para Gestión Académica y Acreditación Institucional en Supabase

import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';

let currentProgramasTab = 'historial';
let programasList: any[] = [];

export async function initProgramas() {
  const container = document.getElementById('programas-tab-content');
  if (!container) return;

  async function loadProgramas() {
    try {
      const { data, error } = await supabase
        .from('programas_academicos' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        programasList = data;
      }
    } catch (err) {
      console.warn('Error cargando programas de Supabase:', err);
    }
    updateCounts();
    renderProgramasTab(currentProgramasTab);
  }

  function updateCounts() {
    const hist = programasList.filter(p => p.categoria === 'historial').length;
    const saces = programasList.filter(p => p.categoria === 'saces').length;
    const acred = programasList.filter(p => p.categoria === 'acreditacion').length;

    const elHist = document.getElementById('prog-count-total');
    const elSaces = document.getElementById('prog-count-saces');
    const elAcred = document.getElementById('prog-count-cna');

    if (elHist) elHist.textContent = String(hist);
    if (elSaces) elSaces.textContent = String(saces);
    if (elAcred) elAcred.textContent = String(acred);
  }

  function renderEmptyState(label: string) {
    if (!container) return;
    container.innerHTML = `
      <div style="text-align: center; padding: 48px 16px; color: var(--text-muted); background: var(--bg-surface-elevated); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--verde-principal); margin-bottom: 8px;"><path d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 0 1 .665 6.479A11.952 11.952 0 0 0 12 20.055a11.952 11.952 0 0 0-6.824-2.998 12.078 12.078 0 0 1 .665-6.479L12 14zm-4 6v-7.5l4-2.222"/></svg>
        <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">No hay ${label} registrados actualmente</div>
        <p style="font-size: 0.85rem; margin-top: 4px;">Utilice el botón superior para registrar un nuevo programa o trámite ante el MEN.</p>
      </div>
    `;
  }

  function renderProgramasTab(tabName = 'historial') {
    if (!container) return;
    currentProgramasTab = tabName;
    updateCounts();

    document.querySelectorAll('#programas-module-tabs .module-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-ptab') === tabName);
    });

    const items = programasList.filter(p => p.categoria === tabName);

    if (items.length === 0) {
      const labels: Record<string, string> = {
        historial: 'programas académicos aprobados o negados',
        saces: 'procesos radicados ante SACES / MEN',
        acreditacion: 'procesos de acreditación CNA'
      };
      renderEmptyState(labels[tabName] || 'registros');
      return;
    }

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; margin-top: 18px;">
        ${items.map(p => `
          <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                <span class="badge" style="background: var(--verde-suave-bg); color: var(--verde-principal); font-size: 0.70rem; font-weight: 700;">
                  ${p.nivel || 'Pregrado'}
                </span>
                <span style="font-size: 0.68rem; font-weight: 700; color: #059669; background: #d1fae5; padding: 2px 8px; border-radius: 4px;">
                  ${p.estado || 'Activo'}
                </span>
              </div>
              <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin: 0 0 6px 0;">
                ${p.nombre}
              </h4>
              ${p.facultad ? `
                <div style="font-size: 0.76rem; color: var(--text-muted); margin-bottom: 8px;">
                  ${p.facultad}
                </div>
              ` : ''}
              <div style="background: var(--bg-surface-elevated); padding: 8px 12px; border-radius: 6px; font-size: 0.78rem; display: flex; flex-direction: column; gap: 4px;">
                ${p.codigo_snies ? `<div><strong>SNIES:</strong> ${p.codigo_snies}</div>` : ''}
                ${p.resolucion_men ? `<div><strong>Acto / Radicado:</strong> ${p.resolucion_men}</div>` : ''}
                ${p.fecha_resolucion ? `<div><strong>Fecha:</strong> ${p.fecha_resolucion}</div>` : ''}
              </div>
            </div>
            <div style="border-top: 1px solid var(--border-subtle); padding-top: 10px; margin-top: 12px; font-size: 0.72rem; color: var(--text-muted); display: flex; justify-content: space-between;">
              <span>Registrado en Supabase</span>
              <span>${new Date(p.created_at).toLocaleDateString('es-CO')}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  document.querySelectorAll('#programas-module-tabs .module-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ptab = btn.getAttribute('data-ptab') || 'historial';
      renderProgramasTab(ptab);
    });
  });

  // Modal para nuevo programa
  const modal = document.getElementById('new-programa-modal');
  const openBtn = document.getElementById('btn-open-programa-modal');
  const closeBtn = document.getElementById('btn-close-new-prog-modal');
  const cancelBtn = document.getElementById('btn-cancel-new-prog');
  const form = document.getElementById('form-new-programa') as HTMLFormElement | null;
  const submitBtn = document.getElementById('btn-submit-prog') as HTMLButtonElement | null;

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
    const categoria = (document.getElementById('new-prog-categoria') as HTMLSelectElement).value;
    const nivel = (document.getElementById('new-prog-nivel') as HTMLSelectElement).value;
    const nombre = (document.getElementById('new-prog-nombre') as HTMLInputElement).value.trim();
    const snies = (document.getElementById('new-prog-snies') as HTMLInputElement).value.trim();
    const facultad = (document.getElementById('new-prog-facultad') as HTMLInputElement).value.trim();
    const resolucion = (document.getElementById('new-prog-resolucion') as HTMLInputElement).value.trim();
    const fecha = (document.getElementById('new-prog-fecha') as HTMLInputElement).value;

    const newId = `prog-${Date.now().toString(36)}`;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    try {
      const { error } = await supabase.from('programas_academicos' as any).insert([{
        id: newId,
        categoria,
        nivel,
        nombre,
        codigo_snies: snies || null,
        facultad: facultad || null,
        resolucion_men: resolucion || null,
        fecha_resolucion: fecha || null,
        vigencia_anos: 7,
        estado: 'Activo',
        created_at: new Date().toISOString()
      }] as any);

      if (error) throw error;

      await logSystemActivity({
        actor: { id: 'usr-root', name: 'ING. Christian Lemus', role: 'admin' },
        action: 'Registro de Programa Académico / MEN',
        actionType: 'GESTION',
        entity: 'Gestión Académica',
        entityId: newId,
        details: `Se registró el programa académico "${nombre}" (${nivel}) en categoría ${categoria}.`,
        severity: 'INFO'
      });

      (window as any).showToast(`Programa "${nombre}" registrado exitosamente en Supabase.`);
      closeModal();
      form.reset();
      await loadProgramas();
    } catch (err: any) {
      console.error('Error guardando programa académico:', err);
      (window as any).showToast('Error guardando en Supabase: ' + (err.message || 'Error de base de datos'));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar en Supabase';
      }
    }
  });

  await loadProgramas();
}
