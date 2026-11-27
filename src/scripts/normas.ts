// src/scripts/normas.ts
// Lógica de cliente para Cuerpos Colegiados y Normativa Institucional en Supabase

import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';

export function initNormas() {
  const rows = document.querySelectorAll('.norma-row, .colegiado-card') as NodeListOf<HTMLElement>;
  const orgTabs = document.querySelectorAll('#normas-module-tabs .module-tab-btn');
  const yearPills = document.querySelectorAll('#normas-year-tabs .normas-year-pill');
  const searchInput = document.getElementById('normas-search-input') as HTMLInputElement | null;
  const vigenciaSelect = document.getElementById('normas-filter-vigencia') as HTMLSelectElement | null;
  const scrollContainer = document.getElementById('normas-scroll-container');
  const visibleCountEl = document.getElementById('normas-visible-count');
  const filterEmptyEl = document.getElementById('normas-filter-empty');

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
    const vig = (vigenciaSelect?.value || 'all').toLowerCase();

    let visibleCount = 0;

    rows.forEach((row) => {
      const org = (row.getAttribute('data-org') || '').toLowerCase();
      const rowVig = (row.getAttribute('data-vigencia') || '').toLowerCase();
      const rowYear = (row.getAttribute('data-year') || '').trim();
      const text = (row.textContent || '').toLowerCase();

      const matchesOrg = currentOrg === 'all' || org === currentOrg;
      const matchesVig = vig === 'all' || rowVig === vig;
      const matchesYear = currentYear === 'all' || rowYear === currentYear;
      const matchesQ = !q || text.includes(q);
      const show = matchesOrg && matchesVig && matchesYear && matchesQ;

      row.style.display = show ? '' : 'none';
      if (show) visibleCount += 1;
    });

    if (visibleCountEl) {
      visibleCountEl.textContent = String(visibleCount);
    }

    if (filterEmptyEl && rows.length > 0) {
      filterEmptyEl.style.display = visibleCount === 0 ? 'block' : 'none';
    }

    if (animate) {
      triggerCrossfade();
    }
  }

  orgTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      orgTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentOrg = (tab.getAttribute('data-org') || 'all').toLowerCase();
      filterNormas(true);
    });
  });

  yearPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      yearPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      currentYear = (pill.getAttribute('data-year') || 'all').toLowerCase();
      filterNormas(true);
    });
  });

  searchInput?.addEventListener('input', () => filterNormas(false));
  vigenciaSelect?.addEventListener('change', () => filterNormas(true));

  // Botones de descarga PDF por delegación limpia
  document.querySelectorAll('.btn-norma-download').forEach((btn) => {
    btn.addEventListener('click', () => {
      const label = btn.getAttribute('data-norma-label') || 'acto administrativo';
      (window as any).showToast?.(`Consultando ${label}...`, 'info');
    });
  });

  // Modal para nueva norma
  const modal = document.getElementById('new-norma-modal');
  const openBtn = document.getElementById('btn-open-new-norma-modal');
  const closeBtn = document.getElementById('btn-close-new-norma-modal');
  const cancelBtn = document.getElementById('btn-cancel-norma');
  const form = document.getElementById('form-new-norma') as HTMLFormElement | null;
  const submitBtn = document.getElementById('btn-submit-norma') as HTMLButtonElement | null;

  const fechaInput = document.getElementById('new-norma-fecha') as HTMLInputElement | null;
  const yearSelect = document.getElementById('new-norma-year') as HTMLSelectElement | null;
  const fileInput = document.getElementById('new-norma-archivo') as HTMLInputElement | null;
  const browseFileBtn = document.getElementById('btn-browse-norma-archivo');
  const fileLabel = document.getElementById('norma-archivo-label');

  // Autocalcular año al cambiar la fecha
  fechaInput?.addEventListener('change', () => {
    if (fechaInput.value && yearSelect) {
      const parts = fechaInput.value.split('-');
      const yearFromDate = parts[0];
      if (yearFromDate) {
        const matchingOpt = Array.from(yearSelect.options).find((opt) => opt.value === yearFromDate);
        if (matchingOpt) {
          yearSelect.value = yearFromDate;
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
    } else if (fileLabel) {
      fileLabel.textContent = 'Ningún documento adjunto (opcional)';
      fileLabel.style.color = '#64748B';
      fileLabel.style.fontWeight = 'normal';
    }
  });

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
    if (excelModal) {
      excelModal.style.display = 'flex';
    }
  });

  const closeExcelModal = () => {
    if (excelModal) {
      excelModal.style.display = 'none';
    }
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

  // Conectar envío del formulario de nueva norma a Supabase (DB + Storage)
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const organoCode = (document.getElementById('new-norma-organo') as HTMLSelectElement).value;
    const organoNameMap: Record<string, string> = {
      csu: 'Consejo Superior Universitario',
      ca: 'Consejo Académico',
      rectoria: 'Rectoría',
    };
    const organo = organoNameMap[organoCode] || 'Consejo Superior Universitario';
    const tipo = (document.getElementById('new-norma-tipo') as HTMLInputElement).value.trim();
    const numero = (document.getElementById('new-norma-numero') as HTMLInputElement).value.trim();
    const titulo = (document.getElementById('new-norma-titulo') as HTMLTextAreaElement).value.trim();
    const fecha = (document.getElementById('new-norma-fecha') as HTMLInputElement).value;
    const descriptor = (document.getElementById('new-norma-descriptor') as HTMLInputElement).value.trim();
    const splitYear = fecha ? fecha.split('-')[0] : '2026';
    const yearVal = (document.getElementById('new-norma-year') as HTMLSelectElement)?.value || splitYear || '2026';
    const anioNum = parseInt(yearVal, 10) || new Date().getFullYear();

    const newId = `norma-${Date.now().toString(36)}`;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando Acto...';
    }

    try {
      let uploadedUrl: string | null = null;
      let uploadedName: string | null = null;

      // Carga a Supabase Storage (bucket peticiones con prefijo colegiados/ o bucket colegiados)
      if (fileInput?.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        uploadedName = file.name;
        const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `colegiados/${anioNum}/${Date.now()}_${cleanName}`;

        const { error: uploadErr } = await supabase.storage
          .from('peticiones')
          .upload(storagePath, file, { contentType: file.type || 'application/pdf', upsert: true });

        if (!uploadErr) {
          const { data: publicData } = supabase.storage.from('peticiones').getPublicUrl(storagePath);
          uploadedUrl = publicData?.publicUrl || null;
        } else {
          console.warn('[Normas] Aviso subiendo archivo a storage:', uploadErr.message);
        }
      }

      const { error } = await supabase.from('colegiados_normas' as any).insert([{
        id: newId,
        anio: anioNum,
        year: String(anioNum),
        cuerpo_colegiado: organo,
        organo,
        organo_code: organoCode,
        tipo_acto: tipo,
        tipo,
        numero_acto: numero,
        numero,
        fecha_expedicion: fecha,
        fecha,
        asunto: titulo,
        titulo,
        descriptor: descriptor || 'General',
        vigencia: 'Vigente',
        resumen: titulo,
        signatarios: 'Secretaría General / Rectoría',
        archivo_url: uploadedUrl,
        archivo_nombre: uploadedName,
        created_at: new Date().toISOString(),
      }] as any);

      if (error) throw error;

      await logSystemActivity({
        actor: { id: 'usr-root', name: 'ING. Christian Lemus', role: 'admin' },
        action: 'Radicación de Acto / Norma Colegiada',
        actionType: 'SUBIDA_ARCHIVO',
        entity: 'Cuerpos Colegiados',
        entityId: `${tipo} ${numero}`,
        details: `Se radicó el acto administrativo "${tipo} ${numero}" para ${organo} (Año ${anioNum}).`,
        severity: 'INFO',
      }).catch(() => {});

      (window as any).showToast?.(`Acto "${tipo} ${numero}" radicado exitosamente.`, 'success');
      window.location.reload();
    } catch (err: any) {
      console.error('Error guardando norma:', err);
      const errMsg = err?.message || err?.error_description || 'Error en el servidor al guardar el acto.';
      (window as any).showToast?.(`Error al guardar acto: ${errMsg}`, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Acto';
      }
    }
  });

  filterNormas(false);
}
