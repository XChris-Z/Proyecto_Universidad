// src/scripts/relacionamiento.ts
// Lógica de cliente para Relacionamiento Institucional y Convenios con Supabase

import { supabase } from '@lib/supabase';

export function initRelacionamiento() {
  const modal = document.getElementById('new-convenio-modal');
  const openBtn = document.getElementById('btn-open-convenio-modal');
  const closeBtn = document.getElementById('btn-close-new-conv-modal');
  const cancelBtn = document.getElementById('btn-cancel-new-conv');
  const form = document.getElementById('new-convenio-form') as HTMLFormElement | null;
  const submitBtn = document.getElementById('btn-submit-convenio') as HTMLButtonElement | null;

  function openModal() {
    if (modal) modal.style.display = 'flex';
  }

  function closeModal() {
    if (modal) modal.style.display = 'none';
    form?.reset();
  }

  openBtn?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);

  // Filtrado de pestañas
  const tabButtons = document.querySelectorAll('#convenios-module-tabs .module-tab-btn');
  const cards = document.querySelectorAll('.convenio-card') as NodeListOf<HTMLElement>;

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.getAttribute('data-ctab') || 'all';
      let visibleCount = 0;

      cards.forEach(card => {
        const tipo = card.getAttribute('data-tipo');
        if (filter === 'all' || tipo === filter) {
          card.style.display = '';
          visibleCount++;
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  // Guardar convenio en Supabase
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tipo = (document.getElementById('select-conv-tipo') as HTMLSelectElement).value;
    const numero = (document.getElementById('input-conv-numero') as HTMLInputElement).value.trim();
    const entidad = (document.getElementById('input-conv-entidad') as HTMLInputElement).value.trim();
    const objeto = (document.getElementById('input-conv-objeto') as HTMLTextAreaElement).value.trim();
    const inicio = (document.getElementById('input-conv-inicio') as HTMLInputElement).value;
    const fin = (document.getElementById('input-conv-fin') as HTMLInputElement).value;
    const supervisor = (document.getElementById('input-conv-supervisor') as HTMLInputElement).value.trim() || 'Secretaría General';
    const cuantia = (document.getElementById('input-conv-cuantia') as HTMLInputElement).value.trim() || 'Sin cuantía';

    let tipoLabel = 'Cooperación Nacional';
    if (tipo === 'gubernamental') tipoLabel = 'Ente Gubernamental';
    else if (tipo === 'internacional') tipoLabel = 'Cooperación Internacional';

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando en Supabase...';
    }

    try {
      const { error } = await supabase
        .from('convenios')
        .insert({
          id: 'conv-' + Date.now(),
          tipo,
          tipo_label: tipoLabel,
          numero,
          entidad,
          objeto,
          inicio,
          fin,
          cuantia,
          supervisor,
          estado: 'Activo / En Ejecución',
          archivo_minuta: `${numero.replace(/\s+/g, '_')}.pdf`
        } as any);

      if (error) {
        alert('Error al guardar convenio: ' + error.message);
        return;
      }

      window.showToast?.(`Convenio ${numero} registrado exitosamente.`);
      closeModal();
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err: any) {
      alert('Error de conexión al servidor: ' + err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Convenio';
      }
    }
  });
}
