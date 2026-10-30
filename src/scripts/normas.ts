// src/scripts/normas.ts
// Lógica de cliente para Cuerpos Colegiados y Normativa Institucional

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

  openBtn?.addEventListener('click', () => {
    if (modal) modal.style.display = 'flex';
  });

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
  };

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
}
