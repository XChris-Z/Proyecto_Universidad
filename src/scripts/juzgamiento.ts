// src/scripts/juzgamiento.ts
// Lógica de cliente para la Fase de Juzgamiento Disciplinario en Supabase

import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';

let currentStageFilter = 'all';
let procesosList: any[] = [];

export async function initJuzgamiento() {
  const tbody = document.getElementById('juzgamiento-table-body');
  const stageTabs = document.querySelectorAll('#juzgamiento-module-tabs .module-tab-btn');

  async function loadProcesos() {
    try {
      const { data, error } = await supabase
        .from('juzgamiento_procesos' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        procesosList = data;
      }
    } catch (err) {
      console.warn('Error cargando procesos disciplinarios de Supabase:', err);
    }
    updateCounts();
    renderTable();
  }

  function updateCounts() {
    const total = procesosList.length;
    const autos = procesosList.filter(c => c.tipo_acto && c.tipo_acto.toLowerCase().includes('auto')).length;
    const apelaciones = procesosList.filter(c => c.tipo_acto && (c.tipo_acto.toLowerCase().includes('apelación') || (c.etapa_procesal && c.etapa_procesal.toLowerCase().includes('segunda')))).length;

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

    const filtered = procesosList.filter(c => {
      if (currentStageFilter === 'all') return true;
      if (currentStageFilter === 'autos') return c.tipo_acto && c.tipo_acto.toLowerCase().includes('auto');
      if (currentStageFilter === 'apelaciones') return c.tipo_acto && (c.tipo_acto.toLowerCase().includes('apelación') || (c.etapa_procesal && c.etapa_procesal.toLowerCase().includes('segunda')));
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 42px 16px; color: var(--text-muted);">
            <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem; margin-bottom: 4px;">No se registran expedientes disciplinarios activos</div>
            <p style="font-size: 0.82rem; margin: 0;">Utilice el botón superior para radicar el primer auto o pieza procesal disciplinaria.</p>
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
          <div style="font-size: 0.74rem; color: var(--text-muted);">${c.cargo || 'Funcionario'}</div>
          <span style="font-family: monospace; font-size: 0.72rem; color: var(--primary); font-weight: 700;">${c.radicado}</span>
        </td>
        <td>
          <span class="badge" style="background: #f3e8ff; color: #7e22ce; font-size: 0.74rem; font-weight: 700;">
            ${c.tipo_acto}
          </span>
        </td>
        <td style="max-width: 260px;">
          <div style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">
            ${c.conducta || 'Sin descripción adicional'}
          </div>
        </td>
        <td>
          <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-main);">${c.etapa_procesal}</span>
        </td>
        <td>
          <span style="font-size: 0.78rem; color: var(--text-muted);">${c.fecha_notificacion || 'Pendiente'}</span>
        </td>
        <td>
          <span style="font-size: 0.8rem; font-weight: 700; color: var(--primary);">${c.segunda_instancia || 'CSU / Rectoría'}</span>
        </td>
        <td>
          <span class="badge ${c.dias_restantes <= 7 && c.dias_restantes > 0 ? 'status-critico' : c.dias_restantes === 0 ? '' : 'status-alerta'}" style="font-size: 0.72rem; padding: 2px 8px; border-radius: 4px;">
            ${c.dias_restantes > 0 ? `${c.dias_restantes} días restantes` : c.estado || 'En Términos'}
          </span>
        </td>
        <td style="text-align: right;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="(window as any).showToast('Expediente confidencial radicado: ${c.radicado}')">
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

  // Modal para radicar auto / apelación
  const modal = document.getElementById('new-juzgamiento-modal');
  const openBtn = document.getElementById('btn-open-juzgamiento-modal');
  const closeBtn = document.getElementById('btn-close-new-juzg-modal');
  const cancelBtn = document.getElementById('btn-cancel-new-juzg');
  const form = document.getElementById('form-new-juzgamiento') as HTMLFormElement | null;
  const submitBtn = document.getElementById('btn-submit-juzg') as HTMLButtonElement | null;

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
    const radicado = (document.getElementById('new-juzg-radicado') as HTMLInputElement).value.trim();
    const implicado = (document.getElementById('new-juzg-implicado') as HTMLInputElement).value.trim();
    const cargo = (document.getElementById('new-juzg-cargo') as HTMLInputElement).value.trim();
    const tipo = (document.getElementById('new-juzg-tipo') as HTMLSelectElement).value;
    const etapa = (document.getElementById('new-juzg-etapa') as HTMLSelectElement).value;
    const fecha = (document.getElementById('new-juzg-fecha') as HTMLInputElement).value;
    const conducta = (document.getElementById('new-juzg-conducta') as HTMLTextAreaElement).value.trim();

    const newId = `juzg-${Date.now().toString(36)}`;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    try {
      const { error } = await supabase.from('juzgamiento_procesos' as any).insert([{
        id: newId,
        radicado,
        implicado,
        cargo,
        tipo_acto: tipo,
        conducta,
        etapa_procesal: etapa,
        fecha_notificacion: fecha || null,
        segunda_instancia: 'Consejo Superior / Rectoría',
        dias_restantes: 15,
        estado: 'En Términos',
        created_at: new Date().toISOString()
      }] as any);

      if (error) throw error;

      await logSystemActivity({
        actor: { id: 'usr-root', name: 'ING. Christian Lemus', role: 'admin' },
        action: 'Radicación de Auto Disciplinario',
        actionType: 'GESTION',
        entity: 'Control Disciplinario',
        entityId: radicado,
        details: `Se radicó el expediente procesal "${radicado}" (${tipo}) respecto a ${implicado}.`,
        severity: 'WARN'
      });

      (window as any).showToast(`Expediente procesal "${radicado}" incorporado exitosamente a Supabase.`);
      closeModal();
      form.reset();
      await loadProcesos();
    } catch (err: any) {
      console.error('Error guardando proceso disciplinario:', err);
      (window as any).showToast('Error guardando en Supabase: ' + (err.message || 'Error de base de datos'));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Incorporar a Supabase';
      }
    }
  });

  await loadProcesos();
}
