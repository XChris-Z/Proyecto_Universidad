// src/scripts/juzgamiento.ts
// Lógica de cliente para la Fase de Juzgamiento Disciplinario en Supabase

import { supabase } from '@lib/supabase';
import { logSystemActivity, getClientAuditActor } from '@lib/audit';

let currentStageFilter = 'all';
let procesosList: any[] = [];
let juzgSearchQuery = '';

export async function initJuzgamiento() {
  const tbody = document.getElementById('juzgamiento-table-body');
  const stageTabs = document.querySelectorAll('#juzgamiento-module-tabs .module-tab-btn');
  const searchInput = document.getElementById('juzgamiento-search-input') as HTMLInputElement | null;

  searchInput?.addEventListener('input', () => {
    juzgSearchQuery = (searchInput.value || '').toLowerCase().trim();
    renderTable();
  });

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

    const q = juzgSearchQuery.toLowerCase().trim();
    const filtered = procesosList.filter(c => {
      let matchesStage = true;
      if (currentStageFilter === 'autos') {
        matchesStage = Boolean(c.tipo_acto && c.tipo_acto.toLowerCase().includes('auto'));
      } else if (currentStageFilter === 'apelaciones') {
        matchesStage = Boolean(c.tipo_acto && (c.tipo_acto.toLowerCase().includes('apelación') || (c.etapa_procesal && c.etapa_procesal.toLowerCase().includes('segunda'))));
      }
      
      const text = (String(c.radicado || '') + ' ' + String(c.implicado || c.implicado_nombre || '') + ' ' + String(c.cargo || c.implicado_cargo || '') + ' ' + String(c.conducta || '') + ' ' + String(c.etapa_procesal || '') + ' ' + String(c.tipo_acto || '') + ' ' + String(c.segunda_instancia || '')).toLowerCase();
      const matchesQ = !q || text.includes(q);

      return matchesStage && matchesQ;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 42px 16px; color: var(--text-muted);">
            <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem; margin-bottom: 4px;">No se registran expedientes disciplinarios activos</div>
            <p style="font-size: 0.82rem; margin: 0;">Utilice el botón superior para radicar el primer auto o pieza procesal disciplinaria.</p>
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(c => {
      const tr = document.createElement('tr');
      const isUrgent = Number(c.dias_restantes) <= 7 && Number(c.dias_restantes) > 0;
      const termText = Number(c.dias_restantes) > 0 ? `${c.dias_restantes} días restantes` : (c.estado || 'En Términos');

      tr.innerHTML = `
        <td>
          <div class="juzg-implicado-name">${c.implicado || ''}</div>
          <div class="juzg-implicado-cargo">${c.cargo || 'Funcionario'}</div>
          <span class="juzg-radicado-chip">${c.radicado || ''}</span>
        </td>
        <td>
          <span class="juzg-badge juzg-badge-acto">${c.tipo_acto || ''}</span>
        </td>
        <td>
          <div class="juzg-conducta-text">${c.conducta || 'Sin descripción adicional'}</div>
        </td>
        <td>
          <div class="juzg-etapa-title">${c.etapa_procesal || ''}</div>
          <div class="juzg-instancia-sub">${c.segunda_instancia || 'CSU / Rectoría'}</div>
        </td>
        <td>
          <span class="juzg-fecha-text">${c.fecha_notificacion || 'Pendiente'}</span>
        </td>
        <td>
          <span class="juzg-term-badge ${isUrgent ? 'juzg-badge-urgent' : 'juzg-badge-ok'}">${termText}</span>
        </td>
        <td>
          <button type="button" class="btn-view-piezas" data-radicado="${String(c.radicado || '').replace(/"/g, '&quot;')}">
            Ver Piezas
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll<HTMLButtonElement>('.btn-view-piezas').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rad = btn.getAttribute('data-radicado') || '';
        (window as any).showToast?.(`Expediente confidencial radicado: ${rad}`, 'info');
      });
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
        actor: getClientAuditActor(),
        action: 'Radicación de Auto Disciplinario',
        actionType: 'GESTION',
        entity: 'Control Disciplinario',
        entityId: radicado,
        details: `Se radicó el expediente procesal "${radicado}" (${tipo}) respecto a ${implicado}.`,
        severity: 'WARN'
      });

      (window as any).showToast(`Expediente procesal "${radicado}" incorporado exitosamente.`);
      closeModal();
      form.reset();
      await loadProcesos();
    } catch (err: any) {
      console.error('Error guardando proceso disciplinario:', err);
      (window as any).showToast('Error al incorporar expediente: ' + (err.message || 'Error en el servidor'));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Incorporar Expediente';
      }
    }
  });

  await loadProcesos();
}
