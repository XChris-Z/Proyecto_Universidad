// src/scripts/normas.ts
// Lógica de cliente para Cuerpos Colegiados y Normativa Institucional en Supabase

import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';

export function initNormas() {
  const cards = document.querySelectorAll('.colegiado-card') as NodeListOf<HTMLElement>;
  const orgTabs = document.querySelectorAll('#normas-module-tabs .module-tab-btn');
  const searchInput = document.getElementById('normas-search-input') as HTMLInputElement | null;
  const vigenciaSelect = document.getElementById('normas-filter-vigencia') as HTMLSelectElement | null;

  let currentOrg = 'all';

  function filterCards() {
    const q = (searchInput?.value || '').toLowerCase().trim();
    const vig = vigenciaSelect?.value || 'all';

    cards.forEach(card => {
      const org = card.getAttribute('data-org');
      const cardVig = card.getAttribute('data-vigencia');
      const text = card.textContent?.toLowerCase() || '';

      const matchesOrg = currentOrg === 'all' || org === currentOrg;
      const matchesVig = vig === 'all' || cardVig === vig;
      const matchesQ = !q || text.includes(q);

      card.style.display = (matchesOrg && matchesVig && matchesQ) ? '' : 'none';
    });
  }

  orgTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      orgTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentOrg = tab.getAttribute('data-org') || 'all';
      filterCards();
    });
  });

  searchInput?.addEventListener('input', filterCards);
  vigenciaSelect?.addEventListener('change', filterCards);

  // Modal para nueva norma
  const modal = document.getElementById('new-norma-modal');
  const openBtn = document.getElementById('btn-open-new-norma-modal');
  const closeBtn = document.getElementById('btn-close-new-norma-modal');
  const cancelBtn = document.getElementById('btn-cancel-norma');
  const form = document.getElementById('form-new-norma') as HTMLFormElement | null;
  const submitBtn = document.getElementById('btn-submit-norma') as HTMLButtonElement | null;

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

  // Conectar envío del formulario a Supabase
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const organoCode = (document.getElementById('new-norma-organo') as HTMLSelectElement).value;
    const organoNameMap: Record<string, string> = {
      csu: 'Consejo Superior Universitario',
      ca: 'Consejo Académico',
      rectoria: 'Rectoría',
      electoral: 'Consejo Electoral'
    };
    const organo = organoNameMap[organoCode] || 'Consejo Superior Universitario';
    const tipo = (document.getElementById('new-norma-tipo') as HTMLInputElement).value.trim();
    const numero = (document.getElementById('new-norma-numero') as HTMLInputElement).value.trim();
    const titulo = (document.getElementById('new-norma-titulo') as HTMLTextAreaElement).value.trim();
    const fecha = (document.getElementById('new-norma-fecha') as HTMLInputElement).value;
    const descriptor = (document.getElementById('new-norma-descriptor') as HTMLInputElement).value.trim();
    const year = fecha ? fecha.split('-')[0] : String(new Date().getFullYear());

    const newId = `norma-${Date.now().toString(36)}`;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando en Supabase...';
    }

    try {
      const { error } = await supabase.from('colegiados_normas' as any).insert([{
        id: newId,
        organo,
        organo_code: organoCode,
        tipo,
        numero,
        year,
        fecha,
        titulo,
        descriptor: descriptor || 'General',
        vigencia: 'Vigente',
        resumen: titulo,
        signatarios: 'Secretaría General / Rectoría',
        created_at: new Date().toISOString()
      }] as any);

      if (error) throw error;

      await logSystemActivity({
        actor: { id: 'usr-root', name: 'ING. Christian Lemus', role: 'admin' },
        action: 'Radicación de Acto / Norma Colegiada',
        actionType: 'SUBIDA_ARCHIVO',
        entity: 'Cuerpos Colegiados',
        entityId: `${tipo} ${numero}`,
        details: `Se radicó el acto administrativo "${tipo} ${numero}" para ${organo}.`,
        severity: 'INFO'
      });

      alert(`Acto "${tipo} ${numero}" radicado exitosamente en Supabase.`);
      window.location.reload();
    } catch (err: any) {
      console.error('Error guardando norma:', err);
      alert('Error al guardar en Supabase: ' + (err.message || 'Error de base de datos'));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Acto';
      }
    }
  });
}
