// src/scripts/subir.ts - Lógica cliente para el módulo de radicación de peticiones
import { supabase } from '@lib/supabase';

export function initSubir(): void {
  // 0. Archivo Principal de la Petición & Auto-rellenado inteligente
  let primaryFile: File | null = null;
  const dropZone = document.getElementById('drop-zone-peticion');
  const fileInput = document.getElementById('input-archivo-peticion') as HTMLInputElement | null;
  const fileIndicator = document.getElementById('file-selected-indicator');
  const selectedFileName = document.getElementById('selected-file-name');
  const selectedFileSize = document.getElementById('selected-file-size');
  const btnRemoveFile = document.getElementById('btn-remove-selected-file');
  const asuntoInput = document.getElementById('peticion-asunto') as HTMLInputElement | null;

  function setPrimaryFile(file: File) {
    primaryFile = file;
    if (selectedFileName) selectedFileName.textContent = file.name;
    if (selectedFileSize) selectedFileSize.textContent = `${(file.size / 1024).toFixed(1)} KB`;
    if (fileIndicator) fileIndicator.style.display = 'flex';
    if (dropZone) dropZone.style.display = 'none';

    // Auto-rellenar Asunto si está vacío a partir del nombre del archivo
    if (asuntoInput && !asuntoInput.value.trim()) {
      const cleanName = file.name
        .replace(/\.[^/.]+$/, '') // quitar extensión
        .replace(/[-_]+/g, ' ') // reemplazar guiones por espacios
        .trim();
      // Capitalizar primera letra
      asuntoInput.value = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    }
  }

  function removePrimaryFile() {
    primaryFile = null;
    if (fileInput) fileInput.value = '';
    if (fileIndicator) fileIndicator.style.display = 'none';
    if (dropZone) dropZone.style.display = 'block';
  }

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.background = 'rgba(0, 89, 78, 0.15)';
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.background = 'var(--verde-suave-bg)';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.background = 'var(--verde-suave-bg)';
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        setPrimaryFile(files[0]!);
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        setPrimaryFile(fileInput.files[0]!);
      }
    });
  }

  btnRemoveFile?.addEventListener('click', removePrimaryFile);

  // 1. Cálculo en Vivo de la Regla de los 5 Días
  const inputFechaEntrega = document.getElementById('fecha-limite-entrega') as HTMLInputElement | null;
  const previewFechaResp = document.getElementById('preview-fecha-responsable');

  function calculateFiveDaysRule() {
    if (!inputFechaEntrega || !previewFechaResp) return;
    const val = inputFechaEntrega.value;
    if (!val) {
      previewFechaResp.textContent = '-- Seleccione fecha de cierre --';
      return;
    }

    const dateObj = new Date(val + 'T12:00:00');
    if (isNaN(dateObj.getTime())) return;

    // Restar exactamente 5 días calendario
    const fechaResp = new Date(dateObj);
    fechaResp.setDate(fechaResp.getDate() - 5);

    const formatted = fechaResp.toLocaleDateString('es-CO', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    previewFechaResp.textContent = `${formatted} (5 días antes)`;
  }

  // Por defecto sugerir fecha a 15 días calendario a partir de hoy (en zona horaria local)
  const today = new Date();
  const defaultEntrega = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 15);
  const yyyy = defaultEntrega.getFullYear();
  const mm = String(defaultEntrega.getMonth() + 1).padStart(2, '0');
  const dd = String(defaultEntrega.getDate()).padStart(2, '0');
  if (inputFechaEntrega) {
    inputFechaEntrega.value = `${yyyy}-${mm}-${dd}`;
    calculateFiveDaysRule();
    inputFechaEntrega.addEventListener('change', calculateFiveDaysRule);
    inputFechaEntrega.addEventListener('input', calculateFiveDaysRule);
  }

  // 2. Constructor Dinámico de Subcarpetas y Asignación de Dependencias
  let oficinasCatalog: any[] = [];
  try {
    const catalogEl = document.getElementById('data-oficinas-catalog');
    if (catalogEl && catalogEl.textContent) {
      oficinasCatalog = JSON.parse(catalogEl.textContent);
    }
  } catch (e) {
    console.error('Error cargando catálogo de oficinas:', e);
  }

  let subcarpetasState = [
    {
      uid: Date.now(),
      nombre: 'Soportes Técnicos y Concepto',
      descripcion: '',
      selectedOffices: [] as string[],
    },
  ];

  const subcarpetasContainer = document.getElementById('subcarpetas-container');
  const subcarpetasCountBadge = document.getElementById('subcarpetas-count-badge');
  const btnAddSubcarpeta = document.getElementById('btn-add-subcarpeta');

  function syncCurrentInputsToState() {
    subcarpetasContainer?.querySelectorAll('.subcarpeta-card').forEach((card) => {
      const uid = Number(card.getAttribute('data-sub-uid'));
      const sub = subcarpetasState.find((s) => s.uid === uid);
      if (!sub) return;
      const nameInput = card.querySelector('.sub-input-nombre') as HTMLInputElement | null;
      const descInput = card.querySelector('.sub-input-desc') as HTMLTextAreaElement | null;
      if (nameInput) sub.nombre = nameInput.value;
      if (descInput) sub.descripcion = descInput.value;
    });
  }

  function escapeHtmlAttr(str: string) {
    return String(str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeHtmlText(str: string) {
    return String(str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function attachSubcarpetasEvents() {
    // Inputs de nombre
    subcarpetasContainer?.querySelectorAll('.sub-input-nombre').forEach((input) => {
      input.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        const uid = Number(target.getAttribute('data-sub-uid'));
        const sub = subcarpetasState.find((s) => s.uid === uid);
        if (sub) sub.nombre = target.value;
      });
    });

    // Textareas de descripción
    subcarpetasContainer?.querySelectorAll('.sub-input-desc').forEach((textarea) => {
      textarea.addEventListener('input', (e) => {
        const target = e.target as HTMLTextAreaElement;
        const uid = Number(target.getAttribute('data-sub-uid'));
        const sub = subcarpetasState.find((s) => s.uid === uid);
        if (sub) sub.descripcion = target.value;
      });
    });

    // Chips de selección de oficinas
    subcarpetasContainer?.querySelectorAll('.sub-office-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const uid = Number(chip.getAttribute('data-sub-uid'));
        const ofiId = chip.getAttribute('data-ofi-id');
        if (!ofiId) return;

        const sub = subcarpetasState.find((s) => s.uid === uid);
        if (!sub) return;

        const index = sub.selectedOffices.indexOf(ofiId);
        if (index > -1) {
          sub.selectedOffices.splice(index, 1);
        } else {
          sub.selectedOffices.push(ofiId);
        }

        renderSubcarpetas();
      });
    });

    // Botones de eliminación de subcarpeta
    subcarpetasContainer?.querySelectorAll('.btn-remove-subcarpeta').forEach((btn) => {
      btn.addEventListener('click', () => {
        const uid = Number(btn.getAttribute('data-sub-uid'));
        if (subcarpetasState.length <= 1) return;
        subcarpetasState = subcarpetasState.filter((s) => s.uid !== uid);
        renderSubcarpetas();
      });
    });
  }

  function renderSubcarpetas() {
    syncCurrentInputsToState();
    if (!subcarpetasContainer) return;
    if (subcarpetasCountBadge) {
      subcarpetasCountBadge.textContent = `${subcarpetasState.length} Subcarpeta${subcarpetasState.length === 1 ? '' : 's'}`;
    }

    subcarpetasContainer.innerHTML = subcarpetasState.map((sub, idx) => {
      const canDelete = subcarpetasState.length > 1;
      const selectedCount = sub.selectedOffices.length;

      const officesChipsHtml = oficinasCatalog.map((ofi: any) => {
        const isChecked = sub.selectedOffices.includes(ofi.id);
        const isTestOffice = (ofi.codigo || '').toUpperCase().includes('PRUEBA') || (ofi.nombre || '').toLowerCase().includes('prueba');
        const emailDisplay = isTestOffice ? (ofi.email_institucional || '') : '';

        return `
          <div 
            class="sub-office-chip ${isChecked ? 'is-selected' : ''}" 
            data-sub-uid="${sub.uid}" 
            data-ofi-id="${ofi.id}"
            style="display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; border: 1px solid ${isChecked ? 'var(--verde-principal)' : (isTestOffice ? 'var(--dorado-borde, #dcd4b8)' : 'var(--border-color)')}; border-radius: 6px; cursor: pointer; background: ${isChecked ? 'var(--verde-suave-bg)' : (isTestOffice ? '#FCFBF7' : '#ffffff')}; transition: all 0.12s ease; user-select: none;"
          >
            <input 
              type="checkbox" 
              class="sub-office-checkbox" 
              data-sub-uid="${sub.uid}" 
              data-ofi-id="${ofi.id}" 
              ${isChecked ? 'checked' : ''} 
              style="margin-top: 2px; accent-color: var(--verde-principal); pointer-events: none; width: 15px; height: 15px;" 
            />
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px;">
                <span style="font-size: 0.78rem; font-weight: 700; color: ${isChecked ? 'var(--verde-oscuro)' : 'var(--text-main)'}; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${ofi.nombre}
                </span>
                ${isTestOffice ? `
                  <span style="background: rgba(181, 161, 96, 0.15); color: #7a6a35; border: 1px solid rgba(181, 161, 96, 0.4); font-size: 0.58rem; font-weight: 800; padding: 1px 4px; border-radius: 3px; text-transform: uppercase;">Prueba</span>
                ` : ''}
              </div>
              ${emailDisplay ? `<div style="font-size: 0.68rem; color: var(--text-muted); font-family: monospace;">${emailDisplay}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="subcarpeta-card" data-sub-uid="${sub.uid}" style="background: #FAF9F5; border: 1px solid var(--border-color); border-left: 4px solid var(--verde-principal); border-radius: var(--radius-sm); padding: 18px; display: flex; flex-direction: column; gap: 14px; position: relative;">
          
          <!-- Cabecera de la subcarpeta -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.1rem;">📁</span>
              <strong style="font-size: 0.92rem; color: var(--verde-oscuro);">Subcarpeta #${idx + 1}</strong>
              <span style="font-size: 0.70rem; font-weight: 700; color: ${selectedCount > 0 ? 'var(--verde-principal)' : 'var(--text-muted)'}; background: ${selectedCount > 0 ? 'var(--verde-suave-bg)' : '#f1f5f9'}; border: 1px solid ${selectedCount > 0 ? 'var(--verde-borde)' : '#e2e8f0'}; padding: 2px 8px; border-radius: 4px;">
                ${selectedCount} dependencia${selectedCount === 1 ? '' : 's'} asignada${selectedCount === 1 ? '' : 's'}
              </span>
            </div>

            ${canDelete ? `
              <button type="button" class="btn-remove-subcarpeta" data-sub-uid="${sub.uid}" title="Eliminar esta subcarpeta" style="border: 1px solid #fee2e2; background: #fef2f2; color: #dc2626; border-radius: 4px; padding: 4px 10px; font-size: 0.72rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                <span>Eliminar Subcarpeta</span>
              </button>
            ` : ''}
          </div>

          <!-- Campos de la subcarpeta -->
          <div style="display: grid; grid-template-columns: minmax(240px, 1fr) 2fr; gap: 14px;" class="grid-sub-fields">
            <div>
              <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-main); text-transform: uppercase; margin-bottom: 4px; display: block;">
                Nombre de la Subcarpeta *
              </label>
              <input 
                type="text" 
                class="form-input sub-input-nombre" 
                data-sub-uid="${sub.uid}" 
                value="${escapeHtmlAttr(sub.nombre)}" 
                placeholder="Ej. Soportes Financieros, Concepto Jurídico..." 
                required 
                style="font-size: 0.84rem; font-weight: 700; background: #ffffff;"
              />
            </div>

            <div>
              <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; display: block;">
                Instrucciones o requerimiento de anexos para esta subcarpeta
              </label>
              <textarea 
                class="form-input sub-input-desc" 
                data-sub-uid="${sub.uid}" 
                rows="2" 
                placeholder="Especifique los certificados, actas o documentos que las dependencias deben aportar aquí..." 
                style="font-size: 0.82rem; resize: vertical; background: #ffffff;"
              >${escapeHtmlText(sub.descripcion)}</textarea>
            </div>
          </div>

          <!-- Selector de Oficinas Responsables Asignadas a esta Subcarpeta -->
          <div style="margin-top: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <label style="font-size: 0.75rem; font-weight: 700; color: var(--dorado-oscuro); text-transform: uppercase;">
                Dependencias Asignadas a esta Subcarpeta *
              </label>
              <span style="font-size: 0.70rem; color: var(--text-muted);">
                Haga clic sobre una o más dependencias para asignarlas
              </span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); gap: 8px;">
              ${officesChipsHtml}
            </div>
          </div>

        </div>
      `;
    }).join('');

    attachSubcarpetasEvents();
  }

  btnAddSubcarpeta?.addEventListener('click', () => {
    syncCurrentInputsToState();
    subcarpetasState.push({
      uid: Date.now(),
      nombre: `Subcarpeta ${subcarpetasState.length + 1}`,
      descripcion: '',
      selectedOffices: [],
    });
    renderSubcarpetas();
    // Scroll suave hacia la nueva subcarpeta
    const cards = subcarpetasContainer?.querySelectorAll('.subcarpeta-card');
    if (cards && cards.length > 0) {
      cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  // Render inicial de subcarpetas
  renderSubcarpetas();

  // 3. Envío del Formulario vía FormData a /api/peticiones/crear
  const form = document.getElementById('form-subir-peticion');
  const submitBtn = document.getElementById('btn-submit-peticion') as HTMLButtonElement | null;
  const modalSuccess = document.getElementById('modal-radicado-success');

  let isSubmitting = false;
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isSubmitting) return;
      syncCurrentInputsToState();
      isSubmitting = true;

      // Validaciones de arquitectura de subcarpetas
      if (subcarpetasState.length === 0) {
        const msg = 'Debe configurar al menos una subcarpeta en el expediente.';
        if ((window as any).showToast) (window as any).showToast(msg, 'warning');
        else alert(msg);
        isSubmitting = false;
        return;
      }

      for (let i = 0; i < subcarpetasState.length; i++) {
        const sub = subcarpetasState[i]!;
        if (!sub.nombre.trim()) {
          const msg = `La Subcarpeta #${i + 1} debe tener un nombre asignado.`;
          if ((window as any).showToast) (window as any).showToast(msg, 'warning');
          else alert(msg);
          isSubmitting = false;
          return;
        }
        if (sub.selectedOffices.length === 0) {
          const msg = `Por favor asigne al menos una dependencia responsable a la subcarpeta "${sub.nombre}".`;
          if ((window as any).showToast) (window as any).showToast(msg, 'warning');
          else alert(msg);
          isSubmitting = false;
          return;
        }
      }

      const allUniqueOfficeIds = Array.from(
        new Set(subcarpetasState.flatMap((s) => s.selectedOffices))
      );

      const subcarpetasPayload = subcarpetasState.map((s) => ({
        nombre: s.nombre.trim(),
        descripcion: s.descripcion.trim(),
        oficina_ids: s.selectedOffices,
      }));

      const instruccionesConsolidadas = subcarpetasState
        .map((s) => `[${s.nombre}]: ${s.descripcion || 'Sin requerimiento específico'}`)
        .join('\n');

      if (!primaryFile && fileInput?.files && fileInput.files.length > 0) {
        primaryFile = fileInput.files[0]!;
      }

      let archivoNombre: string | null = null;
      let archivoMime: string | null = null;
      let archivoStoragePath: string | null = null;
      let archivoTamano: number = 0;
      let archivoBase64: string | null = null;

      const detectSafeMime = (file: File): string => {
        if (file.type && file.type.trim() && file.type !== 'application/octet-stream') {
          return file.type;
        }
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        switch (ext) {
          case 'pdf': return 'application/pdf';
          case 'doc': return 'application/msword';
          case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          case 'xls': return 'application/vnd.ms-excel';
          case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          case 'jpg':
          case 'jpeg': return 'image/jpeg';
          case 'png': return 'image/png';
          case 'zip': return 'application/zip';
          default: return 'application/pdf';
        }
      };

      if (primaryFile) {
        archivoNombre = primaryFile.name;
        archivoMime = detectSafeMime(primaryFile);
        archivoTamano = primaryFile.size;

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = `<span>Subiendo documento (${(primaryFile.size / (1024 * 1024)).toFixed(1)} MB)...</span>`;
        }

        // Blindaje contra límite de Vercel (413 Payload Too Large) y RLS del Storage:
        const cleanName = primaryFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const tempPath = `temp_radicaciones/${Date.now()}_${cleanName}`;
        let uploadedSuccessfully = false;

        try {
          // 1. Intentar subir mediante URL firmada de subida (Service Role / Administrativa)
          try {
            const signedRes = await fetch('/api/storage/signed-url', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bucket: 'peticiones', path: tempPath }),
            });
            const signedJson = await signedRes.json().catch(() => ({}));
            if (signedJson.success && signedJson.signedUrl) {
              const putRes = await fetch(signedJson.signedUrl, {
                method: 'PUT',
                headers: { 'Content-Type': archivoMime },
                body: primaryFile,
              });
              if (putRes.ok) {
                archivoStoragePath = signedJson.path || tempPath;
                uploadedSuccessfully = true;
              }
            }
          } catch (signedErr) {
            console.warn('Aviso en subida por URL firmada:', signedErr);
          }

          // 2. Si no se pudo por URL firmada, intentar con SDK de Supabase directo
          if (!uploadedSuccessfully) {
            try {
              const { data: uploadData, error: uploadErr } = await supabase.storage
                .from('peticiones')
                .upload(tempPath, primaryFile, {
                  contentType: archivoMime,
                  upsert: true,
                });

              if (!uploadErr && uploadData?.path) {
                archivoStoragePath = uploadData.path;
                uploadedSuccessfully = true;
              }
            } catch (sdkErr) {
              console.warn('Aviso en subida SDK directa:', sdkErr);
            }
          }

          // 3. Fallback a Base64 ESTRICTAMENTE para archivos menores a 1.5 MB para evitar 413 Payload Too Large
          if (!uploadedSuccessfully) {
            if (primaryFile.size < 1.5 * 1024 * 1024) {
              archivoBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const resStr = String(reader.result || '');
                  resolve(resStr.includes(',') ? (resStr.split(',')[1] || '') : resStr);
                };
                reader.onerror = reject;
                reader.readAsDataURL(primaryFile!);
              });
            } else {
              throw new Error('No se pudo subir el archivo adjunto (' + (primaryFile.size / (1024 * 1024)).toFixed(1) + ' MB) al almacenamiento institucional. Verifique su conexión a internet e intente nuevamente.');
            }
          }
        } catch (uploadException: any) {
          console.error('Error al subir archivo:', uploadException);
          if ((window as any).showToast) {
            (window as any).showToast(uploadException.message || 'Error al cargar el documento adjunto.', 'error');
          }
          if (submitBtn) {
            isSubmitting = false;
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              <span>Radicar Petición y Notificar Oficinas</span>
            `;
          }
          return;
        }
      }

      const inputAsunto = document.getElementById('peticion-asunto') as HTMLInputElement;
      const inputSolicitanteNombre = document.getElementById('solicitante-nombre') as HTMLInputElement;
      const inputSolicitanteEmail = document.getElementById('solicitante-email') as HTMLInputElement;
      const inputSolicitanteTipo = document.getElementById('solicitante-tipo') as HTMLSelectElement;
      const inputCategoria = document.getElementById('peticion-categoria') as HTMLSelectElement;
      const inputPrioridad = document.getElementById('peticion-prioridad') as HTMLSelectElement;

      const payload = {
        asunto: inputAsunto ? inputAsunto.value : '',
        descripcion: instruccionesConsolidadas,
        instrucciones_anexos: instruccionesConsolidadas,
        solicitante_nombre: inputSolicitanteNombre ? inputSolicitanteNombre.value : '',
        solicitante_email: inputSolicitanteEmail ? inputSolicitanteEmail.value : '',
        solicitante_tipo: inputSolicitanteTipo ? inputSolicitanteTipo.value : 'Estudiante',
        categoria: inputCategoria ? inputCategoria.value : 'Petición',
        prioridad: inputPrioridad ? inputPrioridad.value : 'Media',
        fecha_limite_entrega: inputFechaEntrega ? inputFechaEntrega.value : '',
        oficina_ids: allUniqueOfficeIds,
        subcarpetas: subcarpetasPayload,
        archivo_nombre: archivoNombre,
        archivo_mime: archivoMime,
        archivo_tamano: archivoTamano,
        archivo_storage_path: archivoStoragePath,
        archivo_base64: archivoBase64,
      };

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>Radicando y enviando notificaciones por correo...</span>`;
      }

      try {
        const res = await fetch('/api/peticiones/crear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const rawText = await res.text();
        let data: any = null;
        try {
          data = JSON.parse(rawText);
        } catch (jsonErr) {
          console.error('El servidor no retornó JSON válido:', rawText);
          const errMsg = `Error del servidor (${res.status}): ${rawText.slice(0, 150) || res.statusText || 'Error inesperado'}`;
          if ((window as any).showToast) {
            (window as any).showToast(errMsg, 'error');
          } else if ((window as any).showAlert) {
            (window as any).showAlert(errMsg, 'Error del Servidor');
          }
          return;
        }

        if (!res.ok || !data.success) {
          const errMsg = 'Error al radicar petición: ' + (data.error || 'Ocurrió un error en el servidor.');
          if ((window as any).showToast) {
            (window as any).showToast(errMsg, 'error');
          } else if ((window as any).showAlert) {
            (window as any).showAlert(errMsg, 'Error en Radicación');
          }
          return;
        }

        // Mostrar modal con los datos generados
        const modalNum = document.getElementById('modal-radicado-number');
        const modalEntrega = document.getElementById('modal-fecha-entrega');
        const modalResp = document.getElementById('modal-fecha-responsable');
        const modalPin = document.getElementById('modal-pin-acceso');
        const modalDoc = document.getElementById('modal-doc-name');
        const modalPath = document.getElementById('modal-storage-path');
        const listContainer = document.getElementById('modal-responsables-list');

        if (modalNum) modalNum.textContent = data.peticion.numero_radicado;
        if (modalEntrega) modalEntrega.textContent = data.peticion.fecha_limite_entrega;
        if (modalResp) modalResp.textContent = `${data.peticion.fecha_limite_responsable} (Cierre para dependencias)`;
        if (modalPin) modalPin.textContent = data.peticion.pin_acceso || '--';
        if (modalDoc) {
          modalDoc.textContent = data.peticion.archivo_principal?.nombre_archivo || (primaryFile ? primaryFile.name : 'Ninguno adjunto');
        }
        if (modalPath) modalPath.textContent = data.peticion.storage_folder_path;

        if (listContainer && Array.isArray(data.responsables)) {
          listContainer.innerHTML = data.responsables.map((r: any) => {
            const isTest = (r.oficina_nombre || '').toLowerCase().includes('prueba');
            const emailHtml = (isTest && r.email_institucional)
              ? `<div style="color: var(--text-muted); font-size: 0.70rem;">${r.email_institucional}</div>`
              : '';
            const notifyStatus = (isTest && r.email_institucional)
              ? `<div style="font-size: 0.65rem; color: #059669; margin-top: 2px; font-weight: 700;">Notificado vía Correo</div>`
              : `<div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 2px;">Código Asignado</div>`;

            return `
              <div style="background: var(--bg-body); border: 1px solid var(--border-subtle); padding: 8px 12px; border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem;">
                <div>
                  <strong style="color: var(--text-main);">${r.oficina_nombre}</strong>
                  ${emailHtml}
                </div>
                <div style="text-align: right;">
                  <span style="font-family: monospace; font-weight: 900; color: var(--verde-principal); background: var(--verde-suave-bg); padding: 3px 8px; border-radius: 4px; border: 1px solid var(--verde-borde);">${r.codigo_acceso}</span>
                  ${notifyStatus}
                </div>
              </div>
            `;
          }).join('');
        }

        if (modalSuccess) modalSuccess.style.display = 'flex';
        (form as HTMLFormElement).reset();
        removePrimaryFile();
        subcarpetasState = [
          {
            uid: Date.now(),
            nombre: 'Soportes Técnicos y Concepto',
            descripcion: '',
            selectedOffices: [],
          },
        ];
        renderSubcarpetas();
      } catch (err: any) {
        console.error('Error de red al conectar con el servidor:', err);
        const errMsg = 'Error de conexión al servidor: ' + (err.message || 'Verifique su conexión de red.');
        if ((window as any).showToast) {
          (window as any).showToast(errMsg, 'error');
        } else if ((window as any).showAlert) {
          (window as any).showAlert(errMsg, 'Error de Conexión');
        }
      } finally {
        isSubmitting = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            <span>Radicar Petición y Notificar Oficinas</span>
          `;
        }
      }
    });
  }

  // Cerrar modal y reiniciar
  document.getElementById('btn-modal-close-reset')?.addEventListener('click', () => {
    if (modalSuccess) modalSuccess.style.display = 'none';
    calculateFiveDaysRule();
  });
}

