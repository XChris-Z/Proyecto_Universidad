// src/scripts/portal-responsable.ts - Lógica cliente del Portal de Responsables / Dependencias
import { supabase } from '@lib/supabase';
import { separarRespuestaMeta, esSubcarpetaValida, filtrarSubcarpetasValidas } from '@lib/subcarpetas';

export function initPortalResponsable(): void {
  let activeSessionData: any = null;
  let activeSubIndex = 0;
  let selectedFilesToUpload: File[] = [];

  const loginSection = document.getElementById('portal-login-section');
  const uploadSection = document.getElementById('portal-upload-section');
  const loginForm = document.getElementById('form-portal-login');
  const loginError = document.getElementById('portal-login-error');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('portal-file-input') as HTMLInputElement | null;
  const uploadBtn = document.getElementById('btn-upload-files') as HTMLButtonElement | null;

  // Elementos del Stepper
  const stepNode1 = document.getElementById('step-node-1');
  const stepNode2 = document.getElementById('step-node-2');
  const stepNode3 = document.getElementById('step-node-3');
  const progressBar = document.getElementById('stepper-progress-bar');

  // Auto-completar campos si vienen en URL
  const urlParams = new URLSearchParams(window.location.search);
  const paramEmail = urlParams.get('email');
  const paramCodigo = urlParams.get('codigo');
  const paramPin = urlParams.get('pin');
  const inputEmail = document.getElementById('portal-input-email') as HTMLInputElement | null;
  const inputCodigo = document.getElementById('portal-input-codigo') as HTMLInputElement | null;
  const inputPin = document.getElementById('portal-input-pin') as HTMLInputElement | null;

  if (paramEmail && inputEmail) inputEmail.value = paramEmail.trim();
  if (paramCodigo && inputCodigo) inputCodigo.value = paramCodigo.replace(/\s+/g, '').toUpperCase().trim();
  if (paramPin && inputPin) inputPin.value = paramPin.replace(/\s+/g, '').trim();

  // 1. Manejo del Login de Responsables
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (document.getElementById('portal-input-email') as HTMLInputElement)?.value.trim().toLowerCase();
      const codigo = (document.getElementById('portal-input-codigo') as HTMLInputElement)?.value.replace(/\s+/g, '').toUpperCase().trim();
      const pin = (document.getElementById('portal-input-pin') as HTMLInputElement)?.value.replace(/\s+/g, '').trim();

      if (loginError) loginError.style.display = 'none';

      const submitBtn = document.getElementById('btn-portal-enter') as HTMLButtonElement | null;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Verificando credenciales y PIN...</span>';
      }

      try {
        const res = await fetch('/api/portal/validar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, codigo, pin }),
        });

        const resData = await res.json();

        if (!res.ok || !resData.success) {
          if (loginError) {
            loginError.textContent = resData.message || 'Código de acceso o correo institucional no válidos.';
            loginError.style.display = 'block';
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Validar Acceso y Continuar</span>';
          }
          return;
        }

        // Sesión autorizada
        activeSessionData = resData.data;

        // Transición fluida Crossfade
        if (typeof document !== 'undefined' && 'startViewTransition' in document) {
          try {
            (document as any).startViewTransition(() => {
              renderPortalDashboard();
            });
            return;
          } catch {}
        }

        renderPortalDashboard();
      } catch (err) {
        console.error(err);
        if (loginError) {
          loginError.textContent = 'Error de conexión con el servidor.';
          loginError.style.display = 'block';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>Validar Acceso y Continuar</span>';
        }
      }
    });
  }

  // 2. Renderizar Pantalla de Carga
  function renderPortalDashboard() {
    if (!activeSessionData) return;

    if (loginSection) loginSection.style.display = 'none';
    if (uploadSection) uploadSection.style.display = 'flex';

    // 1. Extraer y desglosar requerimientos por subcarpeta vs descripción general
    const { textoLimpio: rawDescripcion } = separarRespuestaMeta(activeSessionData.descripcion || '');

    // Parsear subcarpetas en formato [1.1]: ... [1.2]: ... o [Subcarpeta X]: ...
    const bracketPattern = /\[([^\]]+)\]:?\s*([^[|\n]+(?:\n(?![\[\s]*[0-9a-zA-Z._-]+\s*\]:)[^[|\n]+)*)/g;
    const parsedRequirementsMap = new Map<string, string>();
    const allBracketMatches = Array.from(rawDescripcion.matchAll(bracketPattern));
    for (const match of allBracketMatches) {
      const subKey = String(match?.[1] ?? '').trim();
      const subReq = String(match?.[2] ?? '').trim();
      if (subKey && esSubcarpetaValida(subKey)) {
        parsedRequirementsMap.set(subKey.toLowerCase(), subReq);
      }
    }

    // Extraer descripción general limpia eliminando tags de subcarpetas
    let cleanGeneralDesc = rawDescripcion
      .replace(/\[([^\]]+)\]:?\s*[^[|\n]+(?:\n(?![\[\s]*[0-9a-zA-Z._-]+\s*\]:)[^[|\n]+)*/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\|/g, '')
      .trim();

    // Si encontramos múltiples subcarpetas en la descripción y activeSessionData.subcarpetas no las tenía
    if (parsedRequirementsMap.size > 1 && (!activeSessionData.subcarpetas || activeSessionData.subcarpetas.length <= 1)) {
      const newSubs: any[] = [];
      let sIdx = 0;
      for (const [subKey, subReq] of parsedRequirementsMap.entries()) {
        const keyMatches = Array.from(rawDescripcion.matchAll(/\[(.*?)\]:/g));
        const origKey = keyMatches
          .map((match: any) => String(match?.[1] ?? '').trim())
          .find((k: string) => k.toLowerCase() === subKey) || subKey;

        newSubs.push({
          id: `parsed-sub-${sIdx + 1}`,
          responsable_id: activeSessionData.responsable_id,
          subcarpeta_id: null,
          nombre: origKey,
          descripcion: subReq,
          estado_entrega: activeSessionData.estado_entrega || 'Pendiente',
          storage_subfolder_path: activeSessionData.storage_subfolder_path,
          observaciones: '',
          anexos: activeSessionData.anexos || [],
        });
        sIdx++;
      }
      activeSessionData.subcarpetas = filtrarSubcarpetasValidas(newSubs);
    } else if (activeSessionData.subcarpetas && activeSessionData.subcarpetas.length > 0) {
      activeSessionData.subcarpetas = filtrarSubcarpetasValidas(activeSessionData.subcarpetas);
      // Si ya existen subcarpetas, enriquecer su descripción si tienen la genérica o el texto crudo
      for (const sub of activeSessionData.subcarpetas) {
        const subName = String(sub.nombre || '').trim();
        const lowerName = subName.toLowerCase();
        if (parsedRequirementsMap.has(lowerName)) {
          const req = parsedRequirementsMap.get(lowerName)!;
          if (!sub.descripcion || sub.descripcion.startsWith('Cargue los documentos') || sub.descripcion === rawDescripcion) {
            sub.descripcion = req;
          }
        }
      }
    }

    // Normalizar subcarpetas en la sesión si estuviera vacía
    if (!activeSessionData.subcarpetas || activeSessionData.subcarpetas.length === 0) {
      activeSessionData.subcarpetas = [
        {
          id: 'default-sub',
          responsable_id: activeSessionData.responsable_id,
          subcarpeta_id: null,
          nombre: 'Subcarpeta 1',
          descripcion: cleanGeneralDesc || 'Entrega de anexos oficiales para este radicado.',
          estado_entrega: activeSessionData.estado_entrega || 'Pendiente',
          storage_subfolder_path: activeSessionData.storage_subfolder_path,
          observaciones: '',
          anexos: activeSessionData.anexos || [],
        },
      ];
    }

    if (activeSubIndex >= activeSessionData.subcarpetas.length) {
      activeSubIndex = 0;
    }

    // Actualizar Stepper
    if (stepNode1) {
      stepNode1.classList.remove('active');
      stepNode1.classList.add('completed');
    }
    if (stepNode2) {
      stepNode2.classList.add('completed');
    }
    if (stepNode3) {
      stepNode3.classList.add('active');
    }
    if (progressBar) {
      progressBar.style.width = '100%';
    }

    const radEl = document.getElementById('portal-disp-radicado');
    const ofiEl = document.getElementById('portal-disp-oficina');
    const asuntoEl = document.getElementById('portal-disp-asunto');
    const descEl = document.getElementById('portal-disp-desc');
    const fechaRespEl = document.getElementById('portal-disp-fecha-resp');
    const fechaEntEl = document.getElementById('portal-disp-fecha-entrega');

    if (radEl) radEl.textContent = activeSessionData.numero_radicado;
    if (ofiEl) ofiEl.textContent = activeSessionData.oficina_nombre;
    if (asuntoEl) asuntoEl.textContent = activeSessionData.asunto;

    // Descripción general limpia (se oculta si no existe o solo habían subcarpetas)
    if (descEl) {
      if (cleanGeneralDesc && cleanGeneralDesc.length > 3) {
        descEl.textContent = cleanGeneralDesc;
        descEl.style.display = 'block';
      } else {
        descEl.textContent = '';
        descEl.style.display = 'none';
      }
    }

    if (fechaRespEl) fechaRespEl.textContent = `${activeSessionData.fecha_limite_responsable} (Cierre Dependencia)`;
    if (fechaEntEl) fechaEntEl.textContent = activeSessionData.fecha_limite_entrega;

    // Renderizar Documento Original si está disponible
    const docOrigCard = document.getElementById('portal-doc-original-card');
    const docOrigName = document.getElementById('portal-doc-original-name');
    const docOrigBtn = document.getElementById('portal-doc-original-btn') as HTMLAnchorElement | null;

    if (activeSessionData.documento_original) {
      if (docOrigCard) docOrigCard.style.display = 'flex';
      if (docOrigName) docOrigName.textContent = activeSessionData.documento_original.nombre_archivo;
      const cleanPath = (activeSessionData.documento_original.storage_path || '').replace(/^peticiones\//, '');
      if (docOrigBtn) {
        docOrigBtn.href = `https://irjjpjtvhxoakiazfswn.supabase.co/storage/v1/object/public/peticiones/${cleanPath}`;
      }
    } else {
      if (docOrigCard) docOrigCard.style.display = 'none';
    }

    // Renderizar Pestañas de Subcarpetas
    renderSubcarpetasTabs();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderSubcarpetasTabs() {
    const tabsContainer = document.getElementById('portal-subcarpetas-tabs');
    const countBadge = document.getElementById('portal-subcarpeta-badge');
    const descText = document.getElementById('portal-subcarpeta-desc-text');
    const descBox = document.getElementById('portal-subcarpeta-desc-box');
    const activeSubName = document.getElementById('portal-active-subname');
    const activeSubStatus = document.getElementById('portal-active-sub-status-badge');
    const obsTextarea = document.getElementById('portal-observaciones') as HTMLTextAreaElement | null;
    if (!tabsContainer || !activeSessionData?.subcarpetas) return;

    const subs = activeSessionData.subcarpetas;
    if (countBadge) {
      countBadge.textContent = `${subs.length} Asignada${subs.length === 1 ? '' : 's'}`;
    }

    if (activeSubIndex >= subs.length) activeSubIndex = 0;
    const currentSub = subs[activeSubIndex] || subs[0];

    // Actualizar Encabezado Dinámico Destacado
    if (activeSubName) {
      activeSubName.textContent = currentSub.nombre || `Subcarpeta ${activeSubIndex + 1}`;
    }

    const descTitle = document.getElementById('portal-subcarpeta-desc-title');
    if (descTitle) {
      descTitle.textContent = `Requerimiento (${currentSub.nombre || activeSubIndex + 1}):`;
    }

    const isCurrentDelivered = currentSub.estado_entrega === 'Entregado' || (currentSub.anexos && currentSub.anexos.length > 0);
    if (activeSubStatus) {
      activeSubStatus.textContent = isCurrentDelivered ? 'Anexo cargado ✓' : 'Pendiente de carga';
      activeSubStatus.style.background = isCurrentDelivered ? '#dcfce7' : '#fef3c7';
      activeSubStatus.style.color = isCurrentDelivered ? '#166534' : '#92400e';
      activeSubStatus.style.border = isCurrentDelivered ? '1px solid #bbf7d0' : '1px solid #fde68a';
    }

    // Efecto Crossfade suave para el requerimiento individual
    if (descBox) {
      descBox.style.opacity = '0.4';
      descBox.style.transform = 'translateY(2px)';
      setTimeout(() => {
        if (descText) {
          descText.textContent = currentSub.descripcion || 'Cargue los documentos de soporte requeridos para esta subcarpeta.';
        }
        descBox.style.opacity = '1';
        descBox.style.transform = 'translateY(0)';
      }, 120);
    } else if (descText) {
      descText.textContent = currentSub.descripcion || 'Cargue los documentos de soporte requeridos para esta subcarpeta.';
    }

    // Observaciones de entrega (campo limpio para nuevos aportes)
    if (obsTextarea) {
      obsTextarea.value = '';
    }

    // Ordenar carpetas de forma natural estricta (1.1, 1.2, 1.3...)
    subs.sort((a: any, b: any) => {
      const nombreA = String(a?.nombre ?? '').replace(/^subcarpeta\s+/i, '').trim();
      const nombreB = String(b?.nombre ?? '').replace(/^subcarpeta\s+/i, '').trim();
      return nombreA.localeCompare(nombreB, 'es', { numeric: true, sensitivity: 'base' });
    });

    // Pestañas Compactas Pro Max en la Columna Lateral (con nombres reales limpios)
    tabsContainer.innerHTML = subs.map((s: any, idx: number) => {
      const isActive = idx === activeSubIndex;
      const isDelivered = s.estado_entrega === 'Entregado' || (s.anexos && s.anexos.length > 0);
      const rawName = String(s.nombre || `${idx + 1}`).trim();
      const badgeLabel = rawName.replace(/^subcarpeta\s+/i, '').trim() || rawName;
      const anexosCount = (s.anexos || []).length;

      return `
        <div 
          role="button"
          tabindex="0"
          class="btn-subcarpeta-tab ${isActive ? 'active-subcarpeta-card' : ''}" 
          data-sub-idx="${idx}"
          style="cursor: pointer; border-radius: 8px; padding: 9px 12px; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); position: relative; overflow: hidden; border: 1.5px solid ${isActive ? '#00594E' : '#e2e8f0'}; background: ${isActive ? '#ffffff' : '#f8fafc'}; box-shadow: ${isActive ? '0 2px 8px rgba(0, 89, 78, 0.1)' : 'none'}; user-select: none;"
        >
          ${isActive ? '<div style="position: absolute; top: 0; left: 0; bottom: 0; width: 4px; background: #00594E;"></div>' : ''}
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; padding-left: ${isActive ? '5px' : '0'};">
            <span style="font-size: 0.74rem; font-weight: 800; color: ${isActive ? '#00594E' : '#1e293b'}; display: flex; align-items: center; gap: 5px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${isActive ? '#00594E' : '#64748b'}" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              ${badgeLabel}
            </span>
            <span style="font-size: 0.62rem; font-weight: 800; padding: 1px 6px; border-radius: 9999px; ${isDelivered ? 'background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;' : 'background: #fef3c7; color: #92400e; border: 1px solid #fde68a;'}">
              ${isDelivered ? 'Cargado ✓' : 'Pendiente'}
            </span>
          </div>
          <div style="font-size: 0.68rem; color: #64748b; padding-left: ${isActive ? '5px' : '0'}; display: flex; align-items: center; justify-content: space-between;">
            <span>${anexosCount} archivo${anexosCount === 1 ? '' : 's'} aportado${anexosCount === 1 ? '' : 's'}</span>
            ${isActive ? '<span style="font-size: 0.62rem; color: #00594E; font-weight: 750;">Activa</span>' : ''}
          </div>
        </div>
      `;
    }).join('');

    tabsContainer.querySelectorAll('.btn-subcarpeta-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const idx = Number(tab.getAttribute('data-sub-idx'));
        if (activeSubIndex !== idx) {
          activeSubIndex = idx;
          renderSubcarpetasTabs();
        }
      });
    });

    // Anexos específicos de esta subcarpeta
    const subSlug = (currentSub.nombre || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const activeAnexos = (currentSub.anexos && currentSub.anexos.length > 0)
      ? currentSub.anexos
      : (activeSessionData.anexos || []).filter((a: any) => {
          if (a.subcarpeta_id && a.subcarpeta_id === (currentSub.subcarpeta_id || currentSub.id)) return true;
          if (a.storage_path && subSlug && a.storage_path.toLowerCase().includes(`/${subSlug}/`)) return true;
          if (a.nombre_archivo && a.nombre_archivo.includes(`[${currentSub.nombre}]`)) return true;
          if (subs.length === 1) return true;
          return false;
        });

    renderAnexosList(activeAnexos);
  }

  function renderAnexosList(anexos: any[]) {
    const container = document.getElementById('portal-anexos-list');
    const noMsg = document.getElementById('no-anexos-msg');
    if (!container) return;

    if (!anexos || anexos.length === 0) {
      if (noMsg) noMsg.style.display = 'flex';
      return;
    }

    if (noMsg) noMsg.style.display = 'none';
    container.innerHTML = anexos.map((a: any) => `
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 32px; height: 32px; border-radius: 8px; background: var(--uni-green-05); color: #00594E; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div>
            <strong style="color: #0f172a; font-size: 0.88rem;">${a.nombre_archivo}</strong>
            <div style="color: #64748b; font-size: 0.70rem; margin-top: 1px;">Entregado: ${new Date(a.created_at).toLocaleString('es-CO')}</div>
          </div>
        </div>
        <span style="font-size: 0.72rem; font-weight: 750; color: #00594E; background: var(--uni-green-05); padding: 3px 10px; border-radius: 6px; border: 1px solid var(--uni-green-25); display: inline-flex; align-items: center; gap: 4px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Radicado en Repositorio</span>
        </span>
      </div>
    `).join('');
  }

  function handleFilesSelected(files: File[]) {
    selectedFilesToUpload = files;
    if (dropZone) {
      dropZone.innerHTML = `
        <div style="font-weight: 800; font-size: 0.95rem; color: #00594E;">
          ${files.length} archivo(s) preparado(s) para entrega:
        </div>
        <div style="font-size: 0.78rem; color: #475569; margin-top: 4px; font-weight: 600;">
          ${files.map(f => f.name).join(', ')}
        </div>
        <div style="font-size: 0.72rem; color: var(--uni-gold-primary); font-weight: 750; margin-top: 8px;">
          Haga clic abajo en 'Confirmar y Subir Archivos a Subcarpeta'.
        </div>
      `;
    }
  }

  // 3. Drag and Drop de Archivos
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.background = '#dcfce7';
      dropZone.style.borderColor = '#1A6A60';
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.background = '#f0fdf4';
      dropZone.style.borderColor = '#00594E';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.background = '#f0fdf4';
      dropZone.style.borderColor = '#00594E';
      if (e.dataTransfer?.files) {
        handleFilesSelected(Array.from(e.dataTransfer.files));
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files) {
        handleFilesSelected(Array.from(fileInput.files));
      }
    });
  }

  // Notificaciones Toast del Portal
  function showPortalToast(msg: string, type: 'success' | 'error' | 'warning' = 'success') {
    if (typeof (window as any).showToast === 'function') {
      (window as any).showToast(msg, type);
      return;
    }

    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const color = type === 'success' ? '#00594E' : type === 'error' ? '#dc2626' : '#B5A160';
    toast.innerHTML = `
      <div class="toast-content-col" style="padding: 10px 14px; background: #ffffff; border: 1px solid #cbd5e1; border-left: 4px solid ${color}; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
        <div style="font-weight: 800; font-size: 0.82rem; color: ${color}; margin-bottom: 2px;">
          ${type === 'success' ? 'Operación Exitosa' : type === 'error' ? 'Atención Requerida' : 'Aviso'}
        </div>
        <div class="toast-message" style="font-size: 0.80rem; color: #0f172a;">${msg}</div>
      </div>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  // 4. Subir Archivos vía API
  if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
      if (!selectedFilesToUpload || selectedFilesToUpload.length === 0) {
        showPortalToast('Por favor seleccione al menos un archivo para subir.', 'warning');
        return;
      }

      uploadBtn.disabled = true;
      uploadBtn.innerHTML = `
        <svg class="spinner-loader-promax" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 0.8s linear infinite;"><circle cx="12" cy="10" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
        <span>Subiendo documentos...</span>
      `;

      const obs = (document.getElementById('portal-observaciones') as HTMLTextAreaElement)?.value || '';
      const subs = activeSessionData.subcarpetas || [];
      const currentSub = subs[activeSubIndex] || subs[0] || {};
      const targetResponsableId = currentSub.responsable_id || activeSessionData.responsable_id;
      const targetSubcarpetaId = currentSub.subcarpeta_id || null;
      const targetStorageSubfolder = currentSub.storage_subfolder_path || activeSessionData.storage_subfolder_path;

      try {
        for (const file of selectedFilesToUpload) {
          const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const subSlug = (currentSub.nombre || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'general';
          const relativeStoragePath = `${targetStorageSubfolder.replace(/^peticiones\//, '').replace(/\/+$/, '')}/${subSlug}/${Date.now()}_${cleanName}`;
          const fullPath = `peticiones/${relativeStoragePath}`;

          let directUploaded = false;
          let fileBase64: string | null = null;

          // 1. Intentar subir mediante URL firmada (Service Role) para evitar errores 413 y políticas RLS
          try {
            const signedRes = await fetch('/api/storage/signed-url', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bucket: 'peticiones', path: relativeStoragePath }),
            });
            const signedJson = await signedRes.json().catch(() => ({}));
            if (signedJson.success && signedJson.signedUrl) {
              const putRes = await fetch(signedJson.signedUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type || 'application/octet-stream' },
                body: file,
              });
              if (putRes.ok) {
                directUploaded = true;
              }
            }
          } catch (signedErr) {
            console.warn('Aviso en subida por URL firmada de anexo:', signedErr);
          }

          // 2. Si no se pudo por URL firmada, intentar con SDK directo de Supabase
          if (!directUploaded) {
            try {
              const { error: uploadErr } = await supabase.storage
                .from('peticiones')
                .upload(relativeStoragePath, file, {
                  contentType: file.type || 'application/octet-stream',
                  upsert: true,
                });

              if (!uploadErr) {
                directUploaded = true;
              } else {
                console.warn('Aviso en subida directa SDK de anexo:', uploadErr);
              }
            } catch (e) {
              console.warn('Excepción en subida directa de anexo:', e);
            }
          }

          // 3. Fallback a Base64 solo para archivos pequeños (< 2.5 MB)
          if (!directUploaded && file.size < 2.5 * 1024 * 1024) {
            fileBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const resStr = String(reader.result || '');
                const base64Data = resStr.includes(',') ? resStr.split(',')[1] : resStr;
                resolve(base64Data || '');
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          }

          const res = await fetch('/api/portal/subir-anexo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storage_path: directUploaded ? fullPath : null,
              archivo_base64: fileBase64,
              archivo_nombre: file.name,
              archivo_tamano: file.size,
              archivo_mime: file.type || 'application/octet-stream',
              peticion_id: activeSessionData.peticion_id,
              responsable_id: targetResponsableId,
              subcarpeta_id: targetSubcarpetaId,
              subcarpeta_nombre: currentSub.nombre,
              numero_radicado: activeSessionData.numero_radicado,
              email_institucional: activeSessionData.email_institucional,
              storage_subfolder_path: targetStorageSubfolder,
              observaciones: obs,
            }),
          });

          const resData = await res.json();
          if (!res.ok || !resData.success) {
            showPortalToast('Error subiendo ' + file.name + ': ' + (resData.error || 'Fallo de subida'), 'error');
          } else {
            if (!activeSessionData.anexos) activeSessionData.anexos = [];
            activeSessionData.anexos.unshift(resData.anexo);
            if (!currentSub.anexos) currentSub.anexos = [];
            currentSub.anexos.unshift(resData.anexo);
            currentSub.estado_entrega = 'Entregado';
            currentSub.observaciones = '';
          }
        }

        showPortalToast('Todos los anexos se subieron y radicaron correctamente.', 'success');
        selectedFilesToUpload = [];
        if (fileInput) fileInput.value = '';
        const obsEl = document.getElementById('portal-observaciones') as HTMLTextAreaElement | null;
        if (obsEl) obsEl.value = '';
        if (dropZone) {
          dropZone.innerHTML = `
            <div class="drop-icon-box">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <div class="drop-title">Arrastre más archivos aquí o haga clic para examinar</div>
            <div class="drop-formats">Formatos permitidos: PDF, DOCX, XLSX, JPG, PNG, ZIP</div>
          `;
        }
        renderSubcarpetasTabs();
      } catch (err) {
        console.error(err);
        showPortalToast('Error de red al subir archivos.', 'error');
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span>Confirmar y Subir Archivos a Subcarpeta</span>
        `;
      }
    });
  }

  // Salir del portal
  document.getElementById('btn-portal-logout')?.addEventListener('click', () => {
    activeSessionData = null;
    if (loginSection) loginSection.style.display = 'block';
    if (uploadSection) uploadSection.style.display = 'none';
    if (loginForm) (loginForm as HTMLFormElement).reset();

    // Reset Stepper
    if (stepNode1) {
      stepNode1.classList.remove('completed');
      stepNode1.classList.add('active');
    }
    if (stepNode2) {
      stepNode2.classList.remove('completed');
    }
    if (stepNode3) {
      stepNode3.classList.remove('active');
    }
    if (progressBar) {
      progressBar.style.width = '33%';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

