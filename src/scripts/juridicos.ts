// src/scripts/juridicos.ts
// Lógica de cliente para Asuntos Jurídicos y Normativos en Supabase

import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';

let activeTab = 'brechas';
let casosList: any[] = [];

export async function initJuridicos() {
  const container = document.getElementById('juridicos-tab-content');
  const tabs = document.querySelectorAll('#juridicos-module-tabs .module-tab-btn');

  // Cargar casos reales desde Supabase
  async function loadCasos() {
    try {
      const { data, error } = await supabase
        .from('juridicos_casos' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        casosList = data;
      }
    } catch (err) {
      console.warn('Error cargando casos jurídicos de Supabase:', err);
    }
    updateCounts();
    renderContent();
  }

  function updateCounts() {
    const elBrechas = document.getElementById('jcount-brechas');
    const elConceptos = document.getElementById('jcount-conceptos');
    const elLitigios = document.getElementById('jcount-litigios');
    const elAuditorias = document.getElementById('jcount-auditorias');
    const elDirectivas = document.getElementById('jcount-directivas');

    if (elBrechas) elBrechas.textContent = String(casosList.filter(c => c.categoria === 'brechas').length);
    if (elConceptos) elConceptos.textContent = String(casosList.filter(c => c.categoria === 'conceptos').length);
    if (elLitigios) elLitigios.textContent = String(casosList.filter(c => c.categoria === 'litigios').length);
    if (elAuditorias) elAuditorias.textContent = String(casosList.filter(c => c.categoria === 'auditorias').length);
    if (elDirectivas) elDirectivas.textContent = String(casosList.filter(c => c.categoria === 'directivas').length);
  }

  function renderEmptyState(label: string) {
    if (!container) return;
    container.innerHTML = `
      <div style="text-align: center; padding: 48px 16px; color: var(--text-muted); background: var(--bg-surface-elevated); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--verde-principal); margin-bottom: 8px;"><path d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/></svg>
        <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">No hay ${label} registrados actualmente</div>
        <p style="font-size: 0.85rem; margin-top: 4px;">Utilice el botón superior para registrar un nuevo asunto en la Oficina Asesora Jurídica.</p>
      </div>
    `;
  }

  function renderContent() {
    if (!container) return;
    updateCounts();

    const currentItems = casosList.filter(c => c.categoria === activeTab);

    if (currentItems.length === 0) {
      const labels: Record<string, string> = {
        brechas: 'brechas normativas',
        conceptos: 'conceptos jurídicos',
        litigios: 'litigios o procesos judiciales',
        auditorias: 'auditorías de entes de control',
        directivas: 'directivas ni circulares'
      };
      renderEmptyState(labels[activeTab] || 'expedientes');
      return;
    }

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">
        ${currentItems.map(c => `
          <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                <span class="badge" style="background: var(--verde-suave-bg); color: var(--verde-principal); font-size: 0.70rem; font-weight: 700;">
                  ${c.organo_competente || 'Oficina Jurídica'}
                </span>
                <span style="font-size: 0.68rem; font-weight: 700; color: #b45309; background: #fef3c7; padding: 2px 8px; border-radius: 4px;">
                  ${c.estado || 'En Formulación'}
                </span>
              </div>
              <h4 style="font-size: 0.95rem; font-weight: 800; color: var(--text-main); margin: 0 0 4px 0;">
                ${c.titulo}
              </h4>
              ${c.mandato_ley ? `
                <div style="font-size: 0.74rem; color: var(--text-muted); margin-bottom: 8px;">
                  Mandato / Radicado: <strong>${c.mandato_ley}</strong>
                </div>
              ` : ''}
              <p style="font-size: 0.82rem; color: var(--text-main); line-height: 1.4; margin: 0 0 12px 0;">
                ${c.justificacion}
              </p>
            </div>
            <div style="border-top: 1px solid var(--border-subtle); padding-top: 10px; font-size: 0.72rem; color: var(--text-muted); display: flex; justify-content: space-between;">
              <span>Registrado en Supabase</span>
              <span>${new Date(c.created_at).toLocaleDateString('es-CO')}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.getAttribute('data-jtab') || 'brechas';
      renderContent();
    });
  });

  // Modal para registrar asunto jurídico
  const modal = document.getElementById('new-gap-modal');
  const openBtn = document.getElementById('btn-open-gap-modal');
  const closeBtn = document.getElementById('btn-close-gap-modal');
  const cancelBtn = document.getElementById('btn-cancel-gap');
  const form = document.getElementById('form-new-gap') as HTMLFormElement | null;
  const submitBtn = document.getElementById('btn-submit-gap') as HTMLButtonElement | null;

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

  // Envío del formulario
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const categoria = (document.getElementById('new-gap-categoria') as HTMLSelectElement).value;
    const titulo = (document.getElementById('new-gap-titulo') as HTMLInputElement).value.trim();
    const mandato = (document.getElementById('new-gap-mandato') as HTMLInputElement).value.trim();
    const organo = (document.getElementById('new-gap-organo') as HTMLSelectElement).value;
    const justificacion = (document.getElementById('new-gap-justificacion') as HTMLTextAreaElement).value.trim();

    const newId = `jur-${Date.now().toString(36)}`;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    try {
      const { error } = await supabase.from('juridicos_casos' as any).insert([{
        id: newId,
        categoria,
        titulo,
        mandato_ley: mandato,
        organo_competente: organo,
        justificacion,
        estado: 'En Formulación',
        created_at: new Date().toISOString()
      }] as any);

      if (error) throw error;

      await logSystemActivity({
        actor: { id: 'usr-root', name: 'ING. Christian Lemus', role: 'admin' },
        action: 'Registro de Asunto Jurídico',
        actionType: 'GESTION',
        entity: 'Oficina Asesora Jurídica',
        entityId: newId,
        details: `Se registró el asunto jurídico "${titulo}" (${categoria}).`,
        severity: 'INFO'
      });

      alert(`Asunto jurídico "${titulo}" registrado exitosamente en Supabase.`);
      closeModal();
      form.reset();
      await loadCasos();
    } catch (err: any) {
      console.error('Error guardando caso jurídico:', err);
      alert('Error guardando en Supabase: ' + (err.message || 'Error de base de datos'));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar en Supabase';
      }
    }
  });

  await loadCasos();
}
