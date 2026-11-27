// src/scripts/normas.ts
// Lógica de cliente para Cuerpos Colegiados en Supabase

export function initNormas() {
  const rows = document.querySelectorAll('.norma-row') as NodeListOf<HTMLElement>;
  const orgTabs = document.querySelectorAll('#normas-module-tabs .module-tab-btn');
  const yearPills = document.querySelectorAll('#normas-year-tabs .normas-year-pill');
  const searchInput = document.getElementById('normas-search-input') as HTMLInputElement | null;
  const vigenciaSelect = document.getElementById('normas-filter-vigencia') as HTMLSelectElement | null;
  const scrollContainer = document.getElementById('normas-scroll-container');
  const visibleCountEl = document.getElementById('normas-visible-count');
  const filterEmptyRow = document.getElementById('normas-filter-empty-row') as HTMLTableRowElement | null;

  // Mapa de registros cargados desde el DOM para edición directa
  const normasById = new Map<string, any>();
  try {
    const jsonEl = document.getElementById('normas-data-json');
    if (jsonEl?.textContent) {
      const parsed = JSON.parse(jsonEl.textContent);
      if (Array.isArray(parsed)) {
        parsed.forEach((n: any) => {
          if (n?.id) normasById.set(String(n.id), n);
        });
      }
    }
  } catch {}

  let currentOrg = 'all';
  let currentYear = 'all';

  function triggerCrossfade() {
    if (!scrollContainer) return;
    scrollContainer.classList.remove('normas-crossfade-in');
    void scrollContainer.offsetWidth;
    scrollContainer.classList.add('normas-crossfade-in');
  }

  function filterNormas(animate = false) {
    const q = (searchInput?.value || '').toLowerCase().trim();
    const vig = (vigenciaSelect?.value || 'all').toLowerCase().trim();

    let visibleCount = 0;

    rows.forEach((row) => {
      const org = (row.getAttribute('data-org') || '').toLowerCase().trim();
      const rowVig = (row.getAttribute('data-vigencia') || '').toLowerCase().trim();
      const rowYear = (row.getAttribute('data-year') || '').trim();
      const searchable = (row.getAttribute('data-search') || row.textContent || '').toLowerCase();

      const matchesOrg = currentOrg === 'all' || org === currentOrg;
      const matchesVig = vig === 'all' || rowVig === vig;
      const matchesYear = currentYear === 'all' || rowYear === currentYear;
      const matchesQ = !q || searchable.includes(q);
      const show = matchesOrg && matchesVig && matchesYear && matchesQ;

      row.hidden = !show;
      row.classList.toggle('is-hidden-row', !show);
      row.style.display = show ? '' : 'none';
      if (show) visibleCount += 1;
    });

    if (visibleCountEl) {
      visibleCountEl.textContent = String(visibleCount);
    }

    if (filterEmptyRow && rows.length > 0) {
      const showEmpty = visibleCount === 0;
      filterEmptyRow.hidden = !showEmpty;
      filterEmptyRow.classList.toggle('is-hidden-row', !showEmpty);
    }

    if (animate) {
      triggerCrossfade();
    }
  }

  orgTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      orgTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentOrg = (tab.getAttribute('data-org') || 'all').toLowerCase().trim();
      filterNormas(true);
    });
  });

  yearPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      yearPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      currentYear = (pill.getAttribute('data-year') || 'all').toLowerCase().trim();
      filterNormas(true);
    });
  });

  searchInput?.addEventListener('input', () => filterNormas(false));
  vigenciaSelect?.addEventListener('change', () => filterNormas(true));
  vigenciaSelect?.addEventListener('input', () => filterNormas(true));

  // Modal unificado Radicar / Editar Acto
  const modal = document.getElementById('new-norma-modal');
  const modalTitle = document.getElementById('norma-modal-title');
  const openBtn = document.getElementById('btn-open-new-norma-modal');
  const closeBtn = document.getElementById('btn-close-new-norma-modal');
  const cancelBtn = document.getElementById('btn-cancel-norma');
  const form = document.getElementById('form-new-norma') as HTMLFormElement | null;
  const submitBtn = document.getElementById('btn-submit-norma') as HTMLButtonElement | null;

  const editIdInput = document.getElementById('norma-edit-id') as HTMLInputElement | null;
  const organoSelect = document.getElementById('new-norma-organo') as HTMLSelectElement | null;
  const yearSelect = document.getElementById('new-norma-year') as HTMLSelectElement | null;
  const tipoInput = document.getElementById('new-norma-tipo') as HTMLInputElement | null;
  const numeroInput = document.getElementById('new-norma-numero') as HTMLInputElement | null;
  const tituloInput = document.getElementById('new-norma-titulo') as HTMLTextAreaElement | null;
  const fechaInput = document.getElementById('new-norma-fecha') as HTMLInputElement | null;
  const fechaFinInput = document.getElementById('new-norma-fecha-fin') as HTMLInputElement | null;
  const vigenciaFormSelect = document.getElementById('new-norma-vigencia') as HTMLSelectElement | null;
  const descriptorInput = document.getElementById('new-norma-descriptor') as HTMLInputElement | null;
  const fileInput = document.getElementById('new-norma-archivo') as HTMLInputElement | null;
  const browseFileBtn = document.getElementById('btn-browse-norma-archivo');
  const fileLabel = document.getElementById('norma-archivo-label');

  function syncSelectUi(sel: HTMLSelectElement | null) {
    if (sel && typeof (window as any).refrescarSelectPersonalizado === 'function') {
      (window as any).refrescarSelectPersonalizado(sel);
    }
  }

  function mapStoredVigenciaToOption(rawVig?: string | null): string {
    const lower = String(rawVig || 'Vigente').toLowerCase().trim();
    if (lower.includes('derogad') || lower.includes('modificad')) {
      return 'Derogado / Modificado';
    }
    if (lower === 'no_vigente' || lower === 'no vigente' || lower === 'vencido') {
      return 'No Vigente';
    }
    return 'Vigente';
  }

  function openCreateModal() {
    form?.reset();
    if (editIdInput) editIdInput.value = '';
    if (modalTitle) modalTitle.textContent = 'Radicar Nuevo Acto / Norma';
    if (submitBtn) submitBtn.textContent = 'Guardar Acto';
    if (organoSelect) organoSelect.value = 'csu';
    if (yearSelect) yearSelect.value = '2026';
    if (vigenciaFormSelect) vigenciaFormSelect.value = 'Vigente';
    if (fechaFinInput) fechaFinInput.value = '';
    if (fileLabel) {
      fileLabel.textContent = 'Ningún documento adjunto (opcional)';
      fileLabel.style.color = '#64748B';
      fileLabel.style.fontWeight = 'normal';
    }
    syncSelectUi(organoSelect);
    syncSelectUi(yearSelect);
    syncSelectUi(vigenciaFormSelect);

    if (modal) {
      modal.classList.add('open');
      modal.style.display = 'flex';
    }
  }

  function openEditModal(norma: any) {
    form?.reset();
    if (editIdInput) editIdInput.value = String(norma.id || '');
    if (modalTitle) modalTitle.textContent = `Editar Acto · ${norma.tipo || ''} ${norma.numero || ''}`.trim();
    if (submitBtn) submitBtn.textContent = 'Guardar Cambios';

    if (organoSelect) organoSelect.value = norma.organo_code || 'csu';
    if (yearSelect) yearSelect.value = String(norma.year || norma.anio || '2026');
    if (tipoInput) tipoInput.value = norma.tipo || '';
    if (numeroInput) numeroInput.value = norma.numero || '';
    if (tituloInput) tituloInput.value = norma.titulo || '';
    if (fechaInput) fechaInput.value = norma.fecha ? String(norma.fecha).slice(0, 10) : '';
    if (fechaFinInput) fechaFinInput.value = norma.fecha_fin_vigencia ? String(norma.fecha_fin_vigencia).slice(0, 10) : '';
    if (vigenciaFormSelect) vigenciaFormSelect.value = mapStoredVigenciaToOption(norma.vigencia);
    if (descriptorInput) descriptorInput.value = norma.descriptor || '';

    if (fileLabel) {
      if (norma.archivo_nombre || norma.archivo_url) {
        fileLabel.textContent = `Documento actual: ${norma.archivo_nombre || 'Adjunto registrado'} (seleccione otro para reemplazar)`;
        fileLabel.style.color = '#00594E';
        fileLabel.style.fontWeight = '600';
      } else {
        fileLabel.textContent = 'Ningún documento adjunto (opcional)';
        fileLabel.style.color = '#64748B';
        fileLabel.style.fontWeight = 'normal';
      }
    }

    syncSelectUi(organoSelect);
    syncSelectUi(yearSelect);
    syncSelectUi(vigenciaFormSelect);

    if (modal) {
      modal.classList.add('open');
      modal.style.display = 'flex';
    }
  }

  // Autocalcular año al cambiar la fecha de expedición
  fechaInput?.addEventListener('change', () => {
    if (fechaInput.value && yearSelect) {
      const parts = fechaInput.value.split('-');
      const yearFromDate = parts[0];
      if (yearFromDate) {
        const matchingOpt = Array.from(yearSelect.options).find((opt) => opt.value === yearFromDate);
        if (matchingOpt) {
          yearSelect.value = yearFromDate;
          syncSelectUi(yearSelect);
        }
      }
    }
  });

  browseFileBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (typeof (window as any).abrirModalSubida === 'function') {
      const files = await (window as any).abrirModalSubida({
        titulo: 'Soporte Documental Oficial',
        subtitulo: 'Arrastre el documento oficial (PDF o DOCX) o examine en su equipo',
        accept: '.pdf,.docx',
        multiple: false,
        textoConfirmar: 'Adjuntar Soporte',
      });
      if (files && files[0] && fileInput) {
        const dt = new DataTransfer();
        dt.items.add(files[0]);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      fileInput?.click();
    }
  });

  fileInput?.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0] && fileLabel) {
      fileLabel.textContent = `Archivo seleccionado: ${fileInput.files[0].name} (${(fileInput.files[0].size / 1024).toFixed(1)} KB)`;
      fileLabel.style.color = '#00594E';
      fileLabel.style.fontWeight = '700';
    } else if (fileLabel && !editIdInput?.value) {
      fileLabel.textContent = 'Ningún documento adjunto (opcional)';
      fileLabel.style.color = '#64748B';
      fileLabel.style.fontWeight = 'normal';
    }
  });

  openBtn?.addEventListener('click', openCreateModal);

  // Botón Editar por fila
  document.querySelectorAll('.btn-norma-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id') || '';
      const norma = normasById.get(id);
      if (!norma) {
        (window as any).showToast?.('No se encontró la información del acto seleccionado.', 'error');
        return;
      }
      openEditModal(norma);
    });
  });

  const closeModal = () => {
    if (modal) {
      modal.classList.remove('open');
      modal.style.display = 'none';
    }
  };

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Modal para Importar Excel
  const excelModal = document.getElementById('excel-import-modal');
  const openExcelBtn = document.getElementById('btn-open-excel-modal');
  const closeExcelBtn = document.getElementById('btn-close-excel-modal');
  const cancelExcelBtn = document.getElementById('btn-cancel-excel');
  const browseExcelBtn = document.getElementById('btn-browse-excel');
  const excelFileInput = document.getElementById('excel-file-input') as HTMLInputElement | null;
  const excelFileName = document.getElementById('excel-file-name');
  const submitExcelBtn = document.getElementById('btn-submit-excel');

  openExcelBtn?.addEventListener('click', () => {
    if (excelModal) excelModal.style.display = 'flex';
  });

  const closeExcelModal = () => {
    if (excelModal) excelModal.style.display = 'none';
  };

  closeExcelBtn?.addEventListener('click', closeExcelModal);
  cancelExcelBtn?.addEventListener('click', closeExcelModal);
  excelModal?.addEventListener('click', (e) => {
    if (e.target === excelModal) closeExcelModal();
  });

  browseExcelBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (typeof (window as any).abrirModalSubida === 'function') {
      const files = await (window as any).abrirModalSubida({
        titulo: 'Importar Normativa desde Hoja de Cálculo',
        subtitulo: 'Arrastre su libro de Excel (.xlsx) o archivo CSV o examine en su equipo',
        accept: '.xlsx,.xls,.csv',
        multiple: false,
        textoConfirmar: 'Cargar Hoja de Cálculo',
      });
      if (files && files[0] && excelFileInput) {
        const dt = new DataTransfer();
        dt.items.add(files[0]);
        excelFileInput.files = dt.files;
        excelFileInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      excelFileInput?.click();
    }
  });

  excelFileInput?.addEventListener('change', () => {
    if (excelFileInput.files && excelFileInput.files[0] && excelFileName) {
      excelFileName.textContent = `Archivo seleccionado: ${excelFileInput.files[0].name}`;
      excelFileName.style.display = 'block';
    }
  });

  submitExcelBtn?.addEventListener('click', () => {
    if (!excelFileInput?.files || !excelFileInput.files[0]) {
      (window as any).showToast?.('Por favor seleccione un archivo .xlsx o .csv antes de continuar.', 'warning');
      return;
    }
    (window as any).showToast?.('Archivo cargado exitosamente. Preparado para la fase de mapeo masivo de columnas.', 'success');
    closeExcelModal();
  });

  // Guardar nuevo acto o actualización a través de /api/normas/guardar
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const editId = (editIdInput?.value || '').trim();
    const organoCode = organoSelect?.value || 'csu';
    const yearVal = yearSelect?.value || '2026';
    const tipo = (tipoInput?.value || '').trim();
    const numero = (numeroInput?.value || '').trim();
    const titulo = (tituloInput?.value || '').trim();
    const fecha = (fechaInput?.value || '').trim();
    const fechaFin = (fechaFinInput?.value || '').trim();
    const vigencia = vigenciaFormSelect?.value || 'Vigente';
    const descriptor = (descriptorInput?.value || '').trim();

    if (fechaFin && fecha && fechaFin < fecha) {
      (window as any).showToast?.('La fecha fin de vigencia no puede ser anterior a la fecha de expedición.', 'warning');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = editId ? 'Guardando cambios...' : 'Guardando Acto...';
    }

    try {
      const formData = new FormData();
      if (editId) formData.append('id', editId);
      formData.append('organo_code', organoCode);
      formData.append('year', yearVal);
      formData.append('tipo', tipo);
      formData.append('numero', numero);
      formData.append('titulo', titulo);
      formData.append('fecha_expedicion', fecha);
      formData.append('fecha_fin_vigencia', fechaFin);
      formData.append('vigencia', vigencia);
      formData.append('descriptor', descriptor);

      if (fileInput?.files && fileInput.files[0]) {
        formData.append('archivo', fileInput.files[0]);
      }

      const res = await fetch('/api/normas/guardar', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Error en el servidor al guardar el acto.');
      }

      (window as any).showToast?.(
        editId
          ? `Acto "${tipo} ${numero}" actualizado exitosamente.`
          : `Acto "${tipo} ${numero}" radicado exitosamente.`,
        'success'
      );
      window.location.reload();
    } catch (err: any) {
      console.error('Error guardando norma:', err);
      const errMsg = err?.message || 'Error en el servidor al guardar el acto.';
      (window as any).showToast?.(`Error al guardar acto: ${errMsg}`, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = editId ? 'Guardar Cambios' : 'Guardar Acto';
      }
    }
  });

  filterNormas(false);
}
