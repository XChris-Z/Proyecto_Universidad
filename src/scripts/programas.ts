// src/scripts/programas.ts
// Lógica de cliente para Gestión Académica y Acreditación Institucional en Supabase

import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';

let currentProgramasTab = 'historial';
let programasList: any[] = [];
let progSearchQuery = '';
let selectedProgram: any = null;

/**
 * Extrae la información del documento de soporte del programa académico
 */
function getProgramDocument(p: any): { url: string; nombre: string; path?: string } | null {
  if (!p) return null;
  if (p.archivo_url) {
    return {
      url: p.archivo_url,
      nombre: p.archivo_nombre || 'Documento_Soporte.pdf',
      path: p.archivo_path || '',
    };
  }
  if (p.radicado_saces && typeof p.radicado_saces === 'string' && p.radicado_saces.startsWith('DOC:')) {
    try {
      const parsed = JSON.parse(p.radicado_saces.slice(4));
      return {
        url: parsed.url,
        nombre: parsed.nombre || 'Documento_Soporte.pdf',
        path: parsed.path || '',
      };
    } catch (e) {
      // Formato simple DOC:url|nombre
      const parts = p.radicado_saces.slice(4).split('|');
      return {
        url: parts[0] || '',
        nombre: parts[1] || 'Documento_Soporte.pdf',
      };
    }
  }
  return null;
}

export async function initProgramas() {
  const container = document.getElementById('programas-tab-content');
  if (!container) return;

  const searchInput = document.getElementById('programas-search-input') as HTMLInputElement | null;
  searchInput?.addEventListener('input', () => {
    progSearchQuery = (searchInput.value || '').toLowerCase().trim();
    renderProgramasTab(currentProgramasTab);
  });

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

    let items = programasList.filter(p => p.categoria === tabName);
    if (progSearchQuery) {
      items = items.filter(p => 
        String(p.nombre || '').toLowerCase().includes(progSearchQuery) ||
        String(p.codigo_snies || '').toLowerCase().includes(progSearchQuery) ||
        String(p.resolucion_men || '').toLowerCase().includes(progSearchQuery) ||
        String(p.estado || '').toLowerCase().includes(progSearchQuery) ||
        String(p.nivel || '').toLowerCase().includes(progSearchQuery)
      );
    }

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
        ${items.map(p => {
          const doc = getProgramDocument(p);
          return `
            <div 
              class="program-card" 
              data-id="${p.id}" 
              role="button" 
              tabindex="0"
              style="background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px; display: flex; flex-direction: column; justify-content: space-between; cursor: pointer; transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1); box-shadow: 0 1px 3px rgba(0,0,0,0.05);"
              onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 16px -4px rgba(0,0,0,0.1)';"
              onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.05)';"
            >
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                  <span class="badge" style="background: var(--verde-suave-bg); color: var(--verde-principal); font-size: 0.70rem; font-weight: 700;">
                    ${p.nivel || 'Pregrado'}
                  </span>
                  <div style="display: flex; gap: 6px; align-items: center;">
                    ${doc ? `
                      <span title="Documento oficial adjunto" style="font-size: 0.65rem; font-weight: 700; color: #1e40af; background: #dbeafe; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        PDF
                      </span>
                    ` : ''}
                    <span style="font-size: 0.68rem; font-weight: 700; color: #059669; background: #d1fae5; padding: 2px 8px; border-radius: 4px;">
                      ${p.estado || 'Activo'}
                    </span>
                  </div>
                </div>

                <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin: 0 0 6px 0; line-height: 1.35;">
                  ${p.nombre}
                </h4>

                ${p.facultad ? `
                  <div style="font-size: 0.76rem; color: var(--text-muted); margin-bottom: 8px;">
                    ${p.facultad}
                  </div>
                ` : ''}

                <div style="background: var(--bg-surface-elevated); padding: 10px 12px; border-radius: 6px; font-size: 0.78rem; display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--border-subtle);">
                  ${p.codigo_snies ? `<div><strong>SNIES:</strong> <span style="font-family: monospace;">${p.codigo_snies}</span></div>` : ''}
                  ${p.resolucion_men ? `<div><strong>Acto / Radicado:</strong> ${p.resolucion_men}</div>` : ''}
                  ${p.fecha_resolucion ? `<div><strong>Fecha:</strong> ${p.fecha_resolucion}</div>` : ''}
                </div>
              </div>

              <div style="border-top: 1px solid var(--border-subtle); padding-top: 10px; margin-top: 14px; font-size: 0.72rem; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center;">
                <span style="display: inline-flex; align-items: center; gap: 4px; color: var(--verde-principal); font-weight: 700;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  Ver expediente y archivo
                </span>
                <span>${new Date(p.created_at).toLocaleDateString('es-CO')}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Asignar listeners de apertura a las tarjetas
    container.querySelectorAll('.program-card').forEach(card => {
      card.addEventListener('click', () => {
        const progId = card.getAttribute('data-id');
        const prog = programasList.find(p => p.id === progId);
        if (prog) {
          openDetailModal(prog);
        }
      });
    });
  }

  document.querySelectorAll('#programas-module-tabs .module-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ptab = btn.getAttribute('data-ptab') || 'historial';
      renderProgramasTab(ptab);
    });
  });

  // Modal para Detalle y Gestión del Programa
  const detailModal = document.getElementById('detail-programa-modal');
  const closeDetailBtn = document.getElementById('btn-close-detail-modal');
  const closeDetailBottomBtn = document.getElementById('btn-detail-close');
  const deleteBtn = document.getElementById('btn-detail-delete-prog') as HTMLButtonElement | null;
  const uploadDocBtn = document.getElementById('btn-detail-upload-doc') as HTMLButtonElement | null;
  const detailFileInput = document.getElementById('detail-upload-file-input') as HTMLInputElement | null;

  function closeDetail() {
    if (detailModal) {
      detailModal.style.display = 'none';
      selectedProgram = null;
    }
  }

  closeDetailBtn?.addEventListener('click', closeDetail);
  closeDetailBottomBtn?.addEventListener('click', closeDetail);

  function openDetailModal(prog: any) {
    selectedProgram = prog;
    if (!detailModal) return;

    const titleEl = document.getElementById('modal-detail-prog-title');
    const nivelEl = document.getElementById('modal-detail-prog-nivel');
    const sniesEl = document.getElementById('detail-snies');
    const facEl = document.getElementById('detail-facultad');
    const resEl = document.getElementById('detail-resolucion');
    const fechaEl = document.getElementById('detail-fecha');
    const vigEl = document.getElementById('detail-vigencia');
    const docContainer = document.getElementById('detail-document-container');

    if (titleEl) titleEl.textContent = prog.nombre || 'Programa Académico';
    if (nivelEl) nivelEl.textContent = `${prog.nivel || 'Pregrado Universitario'} — ${prog.categoria?.toUpperCase() || 'HISTORIAL'}`;
    if (sniesEl) sniesEl.textContent = prog.codigo_snies || 'N/A';
    if (facEl) facEl.textContent = prog.facultad || 'No especificada';
    if (resEl) resEl.textContent = prog.resolucion_men || 'En trámite / No registrada';
    if (fechaEl) fechaEl.textContent = prog.fecha_resolucion || 'Sin fecha de expedición';
    if (vigEl) vigEl.textContent = `${prog.vigencia_anos || 7} Años`;

    if (docContainer) {
      const doc = getProgramDocument(prog);
      if (doc && doc.url) {
        docContainer.innerHTML = `
          <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-left: 4px solid #16A34A; border-radius: 6px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <div>
                <strong style="font-size: 0.88rem; color: #166534; display: block;">${doc.nombre}</strong>
                <span style="font-size: 0.72rem; color: #15803D;">Documento verificado y custodiado digitalmente</span>
              </div>
            </div>
            <a 
              href="${doc.url}" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="btn btn-primary btn-sm" 
              style="text-decoration: none; display: inline-flex; align-items: center; gap: 6px; font-weight: 700; padding: 6px 14px;"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span>Ver / Descargar Documento</span>
            </a>
          </div>
        `;
      } else {
        docContainer.innerHTML = `
          <div style="background: var(--bg-surface-elevated); border: 1px dashed var(--border-color); border-radius: 6px; padding: 14px; text-align: center; color: var(--text-muted); font-size: 0.82rem;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 4px; display: inline-block;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <div>Este programa no tiene documento de soporte adjunto en el expediente digital.</div>
          </div>
        `;
      }
    }

    if (detailFileInput) detailFileInput.value = '';
    detailModal.style.display = 'flex';
  }

  // Subir o reemplazar documento desde el modal de detalle
  uploadDocBtn?.addEventListener('click', async () => {
    if (!selectedProgram) return;
    const file = detailFileInput?.files?.[0];
    if (!file) {
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast('Seleccione un archivo PDF o documento de soporte primero.', 'error');
      } else {
        alert('Seleccione un archivo PDF o documento primero.');
      }
      return;
    }

    uploadDocBtn.disabled = true;
    uploadDocBtn.textContent = 'Subiendo...';

    try {
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `programas/${selectedProgram.id}/${cleanFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('peticiones')
        .upload(storagePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('peticiones')
        .getPublicUrl(storagePath);

      const publicUrl = publicUrlData.publicUrl;
      const docPayload = JSON.stringify({ url: publicUrl, nombre: file.name, path: storagePath });

      // Actualizar en base de datos (con fallback transparente si no existe la columna archivo_url)
      const { error: updateColErr } = await (supabase
        .from('programas_academicos' as any)
        .update({
          archivo_url: publicUrl,
          archivo_nombre: file.name,
          radicado_saces: `DOC:${docPayload}`,
        } as any)
        .eq('id', selectedProgram.id) as any);

      if (updateColErr) {
        // Fallback a solo radicado_saces
        await (supabase
          .from('programas_academicos' as any)
          .update({
            radicado_saces: `DOC:${docPayload}`,
          } as any)
          .eq('id', selectedProgram.id) as any);
      }

      await logSystemActivity({
        actor: { id: 'usr-root', name: 'Funcionario Académico', role: 'admin' },
        action: `Carga de soporte documental — ${selectedProgram.nombre}`,
        actionType: 'SUBIDA_ARCHIVO',
        entity: 'Gestión Académica',
        entityId: selectedProgram.id,
        details: `Se subió el documento de soporte "${file.name}" para el programa académico ${selectedProgram.nombre}.`,
        severity: 'INFO',
      });

      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast('Documento subido y vinculado exitosamente al programa.');
      }

      await loadProgramas();
      const updatedProg = programasList.find(p => p.id === selectedProgram.id);
      if (updatedProg) openDetailModal(updatedProg);
    } catch (err: any) {
      console.error('Error subiendo documento:', err);
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast('Error al subir documento: ' + (err.message || 'Error en servidor'), 'error');
      } else {
        alert('Error: ' + err.message);
      }
    } finally {
      uploadDocBtn.disabled = false;
      uploadDocBtn.textContent = 'Subir Documento';
    }
  });

  // Eliminar programa académico con confirmación y auditoría
  deleteBtn?.addEventListener('click', async () => {
    if (!selectedProgram) return;

    const confirmDelete = window.confirm(
      `¿Está seguro de eliminar formalmente el programa académico "${selectedProgram.nombre}"?\n\nEsta acción eliminará el registro institucional y sus documentos asociados.`
    );
    if (!confirmDelete) return;

    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Eliminando...';

    try {
      const doc = getProgramDocument(selectedProgram);
      if (doc && doc.path) {
        await supabase.storage.from('peticiones').remove([doc.path]).catch(() => {});
      }

      const { error: delErr } = await (supabase
        .from('programas_academicos' as any)
        .delete()
        .eq('id', selectedProgram.id) as any);

      if (delErr) throw delErr;

      await logSystemActivity({
        actor: { id: 'usr-root', name: 'Funcionario Académico', role: 'admin' },
        action: `Eliminación de Programa Académico — ${selectedProgram.nombre}`,
        actionType: 'ELIMINACION',
        entity: 'Gestión Académica',
        entityId: selectedProgram.id,
        details: `Se eliminó el programa académico "${selectedProgram.nombre}" (${selectedProgram.nivel || 'Pregrado'}).`,
        severity: 'CRITICAL',
      });

      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast(`Programa "${selectedProgram.nombre}" eliminado correctamente.`);
      }

      closeDetail();
      await loadProgramas();
    } catch (err: any) {
      console.error('Error eliminando programa:', err);
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast('Error al eliminar: ' + (err.message || 'Error en servidor'), 'error');
      } else {
        alert('Error: ' + err.message);
      }
    } finally {
      deleteBtn.disabled = false;
      deleteBtn.textContent = 'Eliminar Programa';
    }
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
    const fileInput = document.getElementById('new-prog-archivo') as HTMLInputElement | null;
    const file = fileInput?.files?.[0];

    const newId = `prog-${Date.now().toString(36)}`;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    try {
      let archivoUrl = null;
      let archivoNombre = null;
      let docPayload = null;

      // Si adjuntó archivo, subirlo a Supabase Storage
      if (file) {
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `programas/${newId}/${cleanFileName}`;

        const { error: uploadError } = await supabase.storage
          .from('peticiones')
          .upload(storagePath, file, { upsert: true });

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from('peticiones')
            .getPublicUrl(storagePath);
          archivoUrl = publicUrlData.publicUrl;
          archivoNombre = file.name;
          docPayload = JSON.stringify({ url: archivoUrl, nombre: archivoNombre, path: storagePath });
        }
      }

      const basePayload: any = {
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
        radicado_saces: docPayload ? `DOC:${docPayload}` : null,
        created_at: new Date().toISOString(),
      };

      // Intentar guardar con archivo_url si la columna fue creada
      if (archivoUrl) {
        const { error: insertWithColErr } = await (supabase
          .from('programas_academicos' as any)
          .insert([{ ...basePayload, archivo_url: archivoUrl, archivo_nombre: archivoNombre } as any]) as any);

        if (insertWithColErr) {
          // Fallback seguro sin columnas archivo_url (metadata persistida en radicado_saces)
          const { error: fallbackErr } = await (supabase
            .from('programas_academicos' as any)
            .insert([basePayload] as any) as any);
          if (fallbackErr) throw fallbackErr;
        }
      } else {
        const { error } = await (supabase
          .from('programas_academicos' as any)
          .insert([basePayload] as any) as any);
        if (error) throw error;
      }

      await logSystemActivity({
        actor: { id: 'usr-root', name: 'Funcionario Académico', role: 'admin' },
        action: 'Registro de Programa Académico / MEN',
        actionType: 'GESTION',
        entity: 'Gestión Académica',
        entityId: newId,
        details: `Se registró el programa académico "${nombre}" (${nivel}) en categoría ${categoria}.`,
        severity: 'INFO',
      });

      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast(`Programa "${nombre}" registrado exitosamente.`);
      }
      closeModal();
      form.reset();
      await loadProgramas();
    } catch (err: any) {
      console.error('Error guardando programa académico:', err);
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast('Error al guardar programa: ' + (err.message || 'Error en el servidor'), 'error');
      } else {
        alert('Error: ' + err.message);
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Programa';
      }
    }
  });

  await loadProgramas();
}
