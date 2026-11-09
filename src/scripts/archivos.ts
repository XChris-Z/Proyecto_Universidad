// src/scripts/archivos.ts - Lógica de cliente para el Módulo de Archivos y Repositorio Documental
import { separarRespuestaMeta, esSubcarpetaValida, filtrarSubcarpetasValidas } from '@lib/subcarpetas';

export function initArchivos(): void {
interface PeticionAnexo {
      id: string;
      nombre_archivo: string;
      storage_path: string;
      tamano_bytes: number | null;
      mime_type?: string | null;
      es_anexo_oficina?: boolean | null;
      peticion_responsable_id?: string | null;
      created_at: string;
    }

    interface OficinaInfo {
      id: string;
      codigo: string;
      nombre: string;
      email_institucional?: string | null;
    }

    interface PeticionResponsable {
      id: string;
      codigo_acceso: string;
      subcarpeta_id?: string | null;
      estado_entrega?: string | null;
      observaciones_entrega?: string | null;
      fecha_entrega?: string | null;
      storage_subfolder_path?: string | null;
      oficinas?: OficinaInfo | OficinaInfo[] | null;
    }

    interface PeticionExpediente {
      id: string;
      numero_radicado: string;
      asunto: string;
      descripcion?: string | null;
      categoria?: string | null;
      instrucciones_anexos?: string | null;
      pin_acceso?: string | null;
      solicitante_nombre: string;
      solicitante_tipo?: string | null;
      solicitante_email?: string | null;
      fecha_radicacion?: string | null;
      fecha_limite_entrega?: string | null;
      fecha_limite_responsable?: string | null;
      storage_folder_path?: string | null;
      estado: string;
      prioridad?: string | null;
      created_at: string;
      respuesta_mensaje?: string | null;
      respuesta_funcionario?: string | null;
      respuesta_fecha_envio?: string | null;
      respuesta_expira_at?: string | null;
      respuesta_pin_solicitante?: string | null;
      respuesta_archivos_incluidos?: string[] | null;
      respuesta_drive_url?: string | null;
      subcarpetas?: any[];
      peticion_anexos?: PeticionAnexo[];
      peticion_responsables?: PeticionResponsable[];
    }

    let allPeticiones: PeticionExpediente[] = [];
    const peticionesMap = new Map<string, PeticionExpediente>();

    function inferSubcarpetas(p: any): any[] {
      const dbSubs = (p.subcarpetas && Array.isArray(p.subcarpetas)) ? filtrarSubcarpetasValidas(p.subcarpetas) : [];
      const mapByName: Record<string, any> = {};
      dbSubs.forEach((s: any) => {
        if (s && s.nombre && s.nombre.trim().toLowerCase() !== 'expediente general') {
          mapByName[s.nombre.trim().toUpperCase()] = s;
        }
      });

      const foundSubs: Record<string, { id: string; peticion_id: string; nombre: string; descripcion?: string | null }> = {};

      (p.peticion_responsables || []).forEach((r: any) => {
        const raw = r?.observaciones_entrega || '';
        const { textoLimpio } = separarRespuestaMeta(raw);
        const withoutPin = textoLimpio.replace(/^PIN:\s*[0-9A-Z]{6}(\s*\|\s*)?/i, '');
        const matches = withoutPin.matchAll(/\[([^\]\r\n]+)\](?:\s*:?\s*([^|\[\r\n]+))?/g);
        for (const m of matches) {
          const name = String(m?.[1] || '').trim();
          const desc = String(m?.[2] || '').trim() || null;
          if (name && esSubcarpetaValida({ nombre: name, descripcion: desc })) {
            const key = name.toUpperCase();
            const existing = foundSubs[key];
            if (!existing) {
              foundSubs[key] = {
                id: `sub-inf-${p.id}-${key.replace(/[^A-Z0-9_-]/g, '_')}`,
                peticion_id: p.id,
                nombre: name,
                descripcion: desc,
              };
            } else if (!existing.descripcion && desc) {
              existing.descripcion = desc;
            }
          }
        }
      });

      (p.peticion_anexos || []).forEach((a: any) => {
        const fileName = a?.nombre_archivo || '';
        const m = fileName.match(/\[([^\]\r\n]+)\]/i);
        if (m && m[1]) {
          const name = String(m[1] || '').trim();
          if (name && esSubcarpetaValida({ nombre: name })) {
            const key = name.toUpperCase();
            if (!foundSubs[key]) {
              foundSubs[key] = {
                id: `sub-inf-${p.id}-${key.replace(/[^A-Z0-9_-]/g, '_')}`,
                peticion_id: p.id,
                nombre: name,
                descripcion: null,
              };
            }
          }
        }
      });

      const { textoLimpio: cleanDesc } = separarRespuestaMeta(p.instrucciones_anexos || p.descripcion || '');
      if (cleanDesc) {
        const matches = cleanDesc.matchAll(/\[([^\]\r\n]+)\](?:\s*:?\s*([^|\[\r\n]+))?/g);
        for (const m of matches) {
          const name = String(m?.[1] || '').trim();
          const desc = String(m?.[2] || '').trim() || null;
          if (name && esSubcarpetaValida({ nombre: name, descripcion: desc })) {
            const key = name.toUpperCase();
            const existing = foundSubs[key];
            if (!existing) {
              foundSubs[key] = {
                id: `sub-inf-${p.id}-${key.replace(/[^A-Z0-9_-]/g, '_')}`,
                peticion_id: p.id,
                nombre: name,
                descripcion: desc,
              };
            } else if (!existing.descripcion && desc) {
              existing.descripcion = desc;
            }
          }
        }
      }

      Object.values(foundSubs).forEach((s) => {
        if (esSubcarpetaValida(s)) {
          const k = s.nombre.trim().toUpperCase();
          if (!mapByName[k]) mapByName[k] = s;
        }
      });

      const list = filtrarSubcarpetasValidas(Object.values(mapByName));
      if (list.length === 0 && (p.peticion_responsables?.length > 0 || (p.peticion_anexos && p.peticion_anexos.some((a: any) => a.es_anexo_oficina)))) {
        const { textoLimpio } = separarRespuestaMeta(p.instrucciones_anexos);
        list.push({
          id: `sub-default-${p.id}`,
          peticion_id: p.id,
          nombre: 'Subcarpeta 1',
          descripcion: textoLimpio || 'Aportes y requerimientos de dependencias',
        });
      }

      return filtrarSubcarpetasValidas(list);
    }

    function decodeBase64Utf8(b64: string): PeticionExpediente[] {
      try {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
          bytes[i] = bin.charCodeAt(i);
        }
        return JSON.parse(new TextDecoder('utf-8').decode(bytes));
      } catch (e) {
        return [];
      }
    }

    // 1. Decodificar desde Base64 (inmune a escapes de HTML)
    try {
      const b64El = document.getElementById('peticiones-b64-payload');
      const payload = b64El?.getAttribute('data-payload');
      if (payload) {
        allPeticiones = decodeBase64Utf8(payload);
      }
    } catch (err) {
      console.warn('Fallback base64 error:', err);
    }

    // 2. Fallback textContent
    if (!allPeticiones || allPeticiones.length === 0) {
      try {
        const dataEl = document.getElementById('peticiones-data');
        if (dataEl && dataEl.textContent) {
          allPeticiones = JSON.parse(dataEl.textContent);
        }
      } catch (err) {
        console.warn('Fallback peticiones-data error:', err);
      }
    }

    function indexPeticion(p: PeticionExpediente | null | undefined) {
      if (!p || typeof p !== 'object') return;
      if (p.id) {
        const idStr = String(p.id).trim();
        peticionesMap.set(idStr, p);
        peticionesMap.set(idStr.toLowerCase(), p);
      }
      if (p.numero_radicado) {
        const radStr = String(p.numero_radicado).trim();
        peticionesMap.set(radStr, p);
        peticionesMap.set(radStr.toUpperCase(), p);
        peticionesMap.set(radStr.toLowerCase(), p);
      }
    }

    allPeticiones.forEach(indexPeticion);

    let currentView: 'grid' | 'table' = 'grid';
    let currentActiveFolderId: string | null = null;

    const explorerRootView = document.getElementById('explorer-root-view') as HTMLElement | null;
    const explorerFolderView = document.getElementById('explorer-folder-view') as HTMLElement | null;
    const gridContainer = document.getElementById('drive-grid-container') as HTMLElement | null;
    const tableContainer = document.getElementById('drive-table-container') as HTMLElement | null;
    const btnGrid = document.getElementById('btn-view-grid') as HTMLButtonElement | null;
    const btnTable = document.getElementById('btn-view-table') as HTMLButtonElement | null;
    const searchInput = document.getElementById('drive-search-input') as HTMLInputElement | null;

    // Elementos del Modal Editar
    const editModal = document.getElementById('modal-edit-peticion') as HTMLElement | null;
    const editTitle = document.getElementById('edit-modal-title') as HTMLElement | null;
    const inputId = document.getElementById('edit-pet-id') as HTMLInputElement | null;
    const inputAsunto = document.getElementById('edit-pet-asunto') as HTMLInputElement | null;
    const inputSolicitante = document.getElementById('edit-pet-solicitante') as HTMLInputElement | null;
    const selectTipo = document.getElementById('edit-pet-tipo') as HTMLSelectElement | null;
    const selectPrioridad = document.getElementById('edit-pet-prioridad') as HTMLSelectElement | null;
    const selectEstado = document.getElementById('edit-pet-estado') as HTMLSelectElement | null;
    const inputEntrega = document.getElementById('edit-pet-entrega') as HTMLInputElement | null;
    const formEdit = document.getElementById('form-edit-peticion') as HTMLFormElement | null;

    // 1. Alternador de Vistas (Carpetas vs Tabla) - Estrictamente Excluyentes
    btnGrid?.addEventListener('click', () => {
      currentView = 'grid';
      btnGrid?.classList.add('active');
      btnTable?.classList.remove('active');
      if (gridContainer) gridContainer.style.setProperty('display', 'grid', 'important');
      if (tableContainer) tableContainer.style.setProperty('display', 'none', 'important');
    });

    btnTable?.addEventListener('click', () => {
      currentView = 'table';
      btnTable?.classList.add('active');
      btnGrid?.classList.remove('active');
      if (gridContainer) gridContainer.style.setProperty('display', 'none', 'important');
      if (tableContainer) tableContainer.style.setProperty('display', 'block', 'important');
    });

    function getPublicStorageUrl(storagePath: string | null | undefined): string {
      if (!storagePath) return '#';
      const clean = storagePath.replace(/^peticiones\//, '');
      return `https://irjjpjtvhxoakiazfswn.supabase.co/storage/v1/object/public/peticiones/${clean}`;
    }

    function formatFileSize(bytes: number | null | undefined): string {
      if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 KB';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      const unit = sizes[i] ?? 'Bytes';
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + unit;
    }

    function escapeHtml(text: string | null | undefined): string {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function safeFormatDate(dateStr: string | null | undefined): string {
      if (!dateStr) return '--';
      try {
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('es-CO');
      } catch {
        return dateStr;
      }
    }

    // 2. ABRIR CARPETA VIRTUAL (VISTA EXCLUSIVA DEDICADA ESTILO GOOGLE DRIVE)
    function openFolderDetail(folderId: string | null) {
      try {
        if (!folderId) return;
        const cleanTarget = String(folderId).trim();

        // 1. Búsqueda instantánea O(1) en Mapa
        let peticion: PeticionExpediente | undefined = 
          peticionesMap.get(cleanTarget) ||
          peticionesMap.get(cleanTarget.toUpperCase()) ||
          peticionesMap.get(cleanTarget.toLowerCase());

        // 2. Búsqueda en lista en memoria
        if (!peticion) {
          peticion = allPeticiones.find((p) => 
            String(p.id).trim().toLowerCase() === cleanTarget.toLowerCase() || 
            String(p.numero_radicado || '').trim().toUpperCase() === cleanTarget.toUpperCase()
          );
        }

        // 3. Rescate desde el DOM iterando tarjetas de forma segura (sin selectores frágiles)
        if (!peticion) {
          const cards = document.querySelectorAll('.drive-folder-card');
          for (let i = 0; i < cards.length; i++) {
            const card = cards[i] as HTMLElement;
            const cId = card.getAttribute('data-folder-id') || card.getAttribute('data-id') || '';
            const cRad = card.getAttribute('data-radicado') || '';
            if (
              (cId && cId.toLowerCase() === cleanTarget.toLowerCase()) ||
              (cRad && cRad.toUpperCase() === cleanTarget.toUpperCase())
            ) {
              peticion = {
                id: cId || cleanTarget,
                numero_radicado: cRad || cleanTarget,
                asunto: card.getAttribute('data-asunto') || 'Expediente Documental',
                pin_acceso: card.getAttribute('data-pin') || '849201',
                solicitante_nombre: card.getAttribute('data-solicitante') || 'Ciudadano',
                solicitante_tipo: 'Ciudadano',
                fecha_radicacion: new Date().toISOString().slice(0, 10),
                fecha_limite_entrega: '--',
                fecha_limite_responsable: '--',
                estado: card.getAttribute('data-status') === 'responded' ? 'respondida' : 'en_tramite',
                prioridad: 'Media',
                created_at: new Date().toISOString(),
                peticion_anexos: [],
                peticion_responsables: []
              };
              indexPeticion(peticion);
              break;
            }
          }
        }

        const explorerRoot = document.getElementById('explorer-root-view') || explorerRootView;
        const explorerFolder = document.getElementById('explorer-folder-view') || explorerFolderView;

        if (!explorerRoot || !explorerFolder) {
          console.error('Contenedores de explorador no encontrados en el DOM');
          return;
        }

        if (!peticion) {
          console.warn('Expediente no encontrado para el identificador:', cleanTarget);
          if (typeof (window as any).showToast === 'function') {
            (window as any).showToast(`No se encontró el expediente ${cleanTarget}`, 'warning');
          }
          return;
        }

        currentActiveFolderId = peticion.id || folderId;

        // OCULTAR POR COMPLETO LA VISTA GENERAL DE CARPETAS Y MOSTRAR ÚNICAMENTE LA VISTA DEDICADA
        explorerRoot.style.setProperty('display', 'none', 'important');
        explorerFolder.style.setProperty('display', 'flex', 'important');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Actualizar URL sin recargar la página
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('radicado', peticion.numero_radicado);
          window.history.replaceState({}, '', url.toString());
        } catch (e) {}

        const anexos = Array.isArray(peticion.peticion_anexos) ? peticion.peticion_anexos : [];
        const anexoPrincipal = anexos.find((a) => a && !a.es_anexo_oficina) || anexos[0];
        const anexosOficinas = anexos.filter((a) => a && a.es_anexo_oficina);
        const responsables = Array.isArray(peticion.peticion_responsables) ? peticion.peticion_responsables : [];

        // Calcular SLA
        let slaPct = 0;
        let daysRemaining = 0;
        let slaColor = '#16a34a';
        try {
          const startStr = peticion.fecha_radicacion || peticion.created_at || '';
          const endStr = peticion.fecha_limite_entrega || '';
          const start = startStr ? new Date(startStr).getTime() : NaN;
          const end = endStr ? new Date(endStr).getTime() : NaN;
          const now = Date.now();
          if (!isNaN(start) && !isNaN(end) && end > start) {
            const totalDays = Math.max(1, Math.round((end - start) / 86400000));
            const elapsed = Math.max(0, Math.round((now - start) / 86400000));
            daysRemaining = Math.max(0, Math.round((end - now) / 86400000));
            slaPct = Math.min(100, Math.round((elapsed / totalDays) * 100));
            if (daysRemaining <= 2) {
              slaColor = '#dc2626';
            } else if (daysRemaining <= 7) {
              slaColor = '#d97706';
            }
          }
        } catch (err) {}

        // Parsear instrucciones_anexos si contiene desglose por subcarpetas [1.1]: ... [1.2]: ...
        const { textoLimpio: rawInstrucciones, respuestaMeta } = separarRespuestaMeta(peticion.instrucciones_anexos || peticion.descripcion || '');
        const bracketPattern = /\[([^\]]+)\]:?\s*([^[|\n]+(?:\n(?![\[\s]*[0-9a-zA-Z._-]+\s*\]:)[^[|\n]+)*)/g;
        const parsedInstruccionesMap = new Map<string, string>();
        const allInstruccionMatches = Array.from(rawInstrucciones.matchAll(bracketPattern));
        for (const im of allInstruccionMatches) {
          const k = String(im?.[1] ?? '').trim();
          const v = String(im?.[2] ?? '').trim();
          if (k && esSubcarpetaValida(k)) {
            parsedInstruccionesMap.set(k.toLowerCase(), v);
          }
        }

        peticion.subcarpetas = filtrarSubcarpetasValidas(peticion.subcarpetas || []);

        let subReqsList: Array<{ nombre: string; descripcion: string }> = [];
        if (peticion.subcarpetas && peticion.subcarpetas.length > 0) {
          subReqsList = peticion.subcarpetas.map((s: any) => {
            const sName = String(s.nombre || '').trim();
            const lowerName = sName.toLowerCase();
            return {
              nombre: sName,
              descripcion: s.descripcion || parsedInstruccionesMap.get(lowerName) || 'Aportar soportes requeridos para esta subcarpeta.'
            };
          });
        } else if (parsedInstruccionesMap.size > 0) {
          subReqsList = Array.from(parsedInstruccionesMap.entries()).map(([k, v]) => {
            const origKeyMatches = Array.from(rawInstrucciones.matchAll(/\[(.*?)\]:/g));
            const origKey = origKeyMatches
              .map((m: any) => String(m?.[1] ?? '').trim())
              .find((name: string) => name.toLowerCase() === k) || k;
            return {
              nombre: origKey,
              descripcion: v
            };
          });
        }
        subReqsList = filtrarSubcarpetasValidas(subReqsList);

        const cleanGeneralInstruccion = rawInstrucciones
          .replace(/\[([^\]]+)\]:?\s*[^[|\n]+(?:\n(?![\[\s]*[0-9a-zA-Z._-]+\s*\]:)[^[|\n]+)*/g, '')
          .replace(/\[.*?\]/g, '')
          .replace(/\|/g, '')
          .trim();

        explorerFolder.innerHTML = `
          <!-- CABECERA DE NAVEGACIÓN Y BREADCRUMB DEDICADO -->
          <div class="card" style="padding: 16px 22px; background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
            
            <!-- Botón Volver y Ruta -->
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
              <button type="button" id="btn-back-to-explorer" class="btn btn-secondary" style="display: inline-flex; align-items: center; gap: 8px; font-weight: 800; font-size: 0.84rem; padding: 8px 16px; border: 1px solid var(--verde-borde); background: var(--verde-suave-bg); color: var(--verde-principal); cursor: pointer;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                <span>Volver a todas las carpetas</span>
              </button>

              <div style="display: flex; align-items: center; gap: 8px; font-size: 0.88rem;">
                <span style="color: var(--text-muted); font-weight: 600;">Módulo de Archivos</span>
                <span style="color: var(--text-muted);">&rsaquo;</span>
                <span style="color: var(--verde-principal); font-weight: 800; font-family: monospace;">Carpeta ${escapeHtml(peticion.numero_radicado)}</span>
              </div>
            </div>

            <!-- Acciones de Cabecera -->
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <button 
                type="button" 
                class="btn btn-secondary btn-sm btn-export-drive" 
                data-id="${escapeHtml(peticion.id)}"
                data-radicado="${escapeHtml(peticion.numero_radicado)}"
                title="Respaldar estructura completa de carpetas y archivos en Google Drive sin comprimir"
                style="display: inline-flex; align-items: center; gap: 6px; font-weight: 800; font-size: 0.82rem; padding: 7px 16px; background: #F2F7F6; border: 1.5px solid #00594E; color: #00594E; border-radius: 6px; cursor: pointer; transition: all 0.2s ease;"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><polyline points="12 11 12 17"/><polyline points="9 14 12 11 15 14"/></svg>
                <span>Respaldar en Drive</span>
              </button>

              <button 
                type="button" 
                class="btn btn-primary btn-sm btn-open-responder-modal" 
                data-id="${escapeHtml(peticion.id)}"
                title="Despachar respuesta formal y habilitar portal temporal al solicitante"
                style="display: inline-flex; align-items: center; gap: 6px; font-weight: 800; font-size: 0.82rem; padding: 7px 16px; background: #00594E; border-color: #00594E; color: #ffffff; box-shadow: 0 2px 6px rgba(0, 89, 78, 0.2); cursor: pointer;"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                <span>Enviar Respuesta al Solicitante</span>
              </button>

              <button 
                type="button" 
                class="btn btn-secondary btn-sm btn-edit-pet" 
                data-id="${escapeHtml(peticion.id)}"
                data-radicado="${escapeHtml(peticion.numero_radicado)}"
                data-asunto="${escapeHtml(peticion.asunto)}"
                data-solicitante="${escapeHtml(peticion.solicitante_nombre)}"
                data-tipo="${escapeHtml(peticion.solicitante_tipo || 'Ciudadano')}"
                data-prioridad="${escapeHtml(peticion.prioridad || 'Media')}"
                data-entrega="${escapeHtml(peticion.fecha_limite_entrega || '')}"
                data-estado="${escapeHtml(peticion.estado || 'en_tramite')}"
                style="display: inline-flex; align-items: center; gap: 6px; font-weight: 700; font-size: 0.8rem; border-color: var(--dorado-borde); background: var(--dorado-suave-bg); color: var(--dorado-oscuro);"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <span>Editar Expediente</span>
              </button>
            </div>
          </div>

          <!-- RESUMEN DEL RADICADO Y METADATOS -->
          <div class="card" style="padding: 24px; background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-md); border-left: 5px solid var(--verde-principal); display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px;">
              <div>
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap;">
                  <span class="radicado-chip" style="font-size: 1.05rem; padding: 4px 12px;">${escapeHtml(peticion.numero_radicado)}</span>
                  <span style="font-size: 0.74rem; font-weight: 800; padding: 4px 10px; border-radius: 4px; ${String(peticion.estado || '').toLowerCase() === 'respondida' ? 'background: #DCFCE7; color: #15803D;' : 'background: #FEF3C7; color: #92400E;'}">
                    ${String(peticion.estado || '').toLowerCase() === 'respondida' ? 'Respondida' : 'En Trámite'}
                  </span>
                  ${(() => {
                    const fechaEnvio = peticion.respuesta_fecha_envio || respuestaMeta?.fecha_envio;
                    const expiraAt = peticion.respuesta_expira_at || respuestaMeta?.expira;
                    if (fechaEnvio || String(peticion.estado || '').toLowerCase() === 'respondida') {
                      const now = Date.now();
                      const exp = expiraAt ? new Date(expiraAt).getTime() : 0;
                      const isExpired = exp > 0 && now > exp;
                      const daysLeft = exp > 0 ? Math.max(0, Math.ceil((exp - now) / (1000 * 60 * 60 * 24))) : 10;
                      if (isExpired) {
                        return `
                          <span style="font-size: 0.74rem; font-weight: 750; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; padding: 4px 10px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">
                            <span>Respuesta Enviada (Caducada)</span>
                          </span>
                        `;
                      }
                      return `
                        <span style="font-size: 0.74rem; font-weight: 750; background: #f0fdf4; color: #00594E; border: 1px solid #b2cfcb; padding: 4px 10px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">
                          <span>Respuesta Enviada (Activa por ${daysLeft} día${daysLeft === 1 ? '' : 's'} restante${daysLeft === 1 ? '' : 's'})</span>
                        </span>
                      `;
                    }
                    return '';
                  })()}
                  <span style="font-size: 0.74rem; font-weight: 700; color: var(--dorado-oscuro); background: var(--dorado-suave-bg); border: 1px solid var(--dorado-borde); padding: 4px 10px; border-radius: 4px;">
                    Prioridad: ${escapeHtml(peticion.prioridad || 'Media')}
                  </span>
                  <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.74rem; font-weight: 700; color: #b45309; background: rgba(217, 119, 6, 0.12); border: 1px solid rgba(217, 119, 6, 0.25); padding: 4px 10px; border-radius: 4px;">
                    <span>PIN Acceso:</span>
                    <strong style="font-family: monospace; letter-spacing: 0.05em;">${escapeHtml(peticion.pin_acceso || '849201')}</strong>
                    <button type="button" class="btn-copy-pin" data-pin="${escapeHtml(peticion.pin_acceso || '849201')}" title="Copiar PIN de 6 dígitos" style="border: none; background: transparent; cursor: pointer; color: #b45309; display: inline-flex; align-items: center; padding: 0 2px;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                  </span>
                </div>
                <h2 style="font-size: 1.35rem; font-weight: 800; color: var(--text-main); margin: 0 0 8px 0; line-height: 1.35; overflow-wrap: anywhere; word-break: break-word;">${escapeHtml(peticion.asunto)}</h2>
                <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; font-size: 0.82rem; color: #64748b; line-height: 1.5; margin-top: 4px; min-width: 0;">
                  <span style="display: inline-flex; align-items: center; gap: 5px; min-width: 0;">
                    <strong style="color: #334155;">Solicitante:</strong>
                    <span style="color: #0f172a; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; display: inline-block;" title="${escapeHtml(peticion.solicitante_nombre)}">${escapeHtml(peticion.solicitante_nombre)}</span>
                    <span style="font-size: 0.72rem; color: #64748b; background: #f1f5f9; padding: 1px 6px; border-radius: 4px;">${escapeHtml(peticion.solicitante_tipo === 'Docente' ? 'Profesor' : (peticion.solicitante_tipo || 'Ciudadano'))}</span>
                  </span>
                  <span style="color: #cbd5e1;">&bull;</span>
                  <span style="display: inline-flex; align-items: center; gap: 5px; min-width: 0;">
                    <strong style="color: #334155;">Correo:</strong>
                    <span style="color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; display: inline-block;" title="${escapeHtml(peticion.solicitante_email || 'Sin correo registrado')}">${escapeHtml(peticion.solicitante_email || 'Sin correo registrado')}</span>
                  </span>
                  <span style="color: #cbd5e1;">&bull;</span>
                  <span style="display: inline-flex; align-items: center; gap: 5px;">
                    <strong style="color: #334155;">Categoría:</strong>
                    <span style="color: #475569;">${escapeHtml(peticion.categoria || 'Petición General')}</span>
                  </span>
                  <span style="color: #cbd5e1;">&bull;</span>
                  <span style="display: inline-flex; align-items: center; gap: 5px;">
                    <strong style="color: #334155;">Radicado:</strong>
                    <span style="color: #475569;">${escapeHtml(peticion.fecha_radicacion || 'Reciente')}</span>
                  </span>
                </div>
              </div>

              <!-- Semáforo SLA -->
              <div style="background: #FAF9F5; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 14px 18px; min-width: 250px;">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.74rem; margin-bottom: 6px;">
                  <span style="color: var(--text-muted); font-weight: 700;">Plazo General:</span>
                  <span style="font-weight: 800; color: ${slaColor};">${slaPct}% consumido</span>
                </div>
                <div style="width: 100%; height: 7px; background: #E2E8F0; border-radius: 9999px; overflow: hidden; margin-bottom: 8px;">
                  <div style="width: ${slaPct}%; height: 100%; background: ${slaColor}; border-radius: 9999px;"></div>
                </div>
                <div style="font-size: 0.72rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 3px;">
                  <div>Término Legal: <strong style="color: var(--text-main); font-family: monospace;">${escapeHtml(peticion.fecha_limite_entrega || '--')}</strong></div>
                  <div>Límite Oficinas: <strong style="color: var(--dorado-oscuro); font-family: monospace;">${escapeHtml(peticion.fecha_limite_responsable || '--')}</strong></div>
                  <div style="color: ${slaColor}; font-weight: 700;">${daysRemaining} días restantes</div>
                </div>
              </div>
            </div>

            ${(() => {
              const resMsg = peticion.respuesta_mensaje || respuestaMeta?.msg;
              if (!resMsg) return '';
              const pinSol = peticion.respuesta_pin_solicitante || respuestaMeta?.pin || peticion.pin_acceso;
              const funcEmite = peticion.respuesta_funcionario || respuestaMeta?.func || 'Oficina de Correspondencia y Gestión Documental';
              const fEnvio = peticion.respuesta_fecha_envio || respuestaMeta?.fecha_envio;
              const fEnvioFormatted = fEnvio ? safeFormatDate(fEnvio) : 'Reciente';
              const queryParams = new URLSearchParams({
                radicado: peticion.numero_radicado || '',
                correo: peticion.solicitante_email || ''
              }).toString();
              return `
                <div style="background: #ffffff; border: 1px solid #b2cfcb; border-left: 4px solid #00594E; border-radius: 8px; padding: 14px 18px; margin-top: 4px; box-shadow: 0 1px 3px rgba(0, 89, 78, 0.05);">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 6px; color: #00594E; font-weight: 800; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.4px;">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      <span>Respuesta Oficial Despachada al Solicitante</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      ${pinSol ? `
                        <span style="font-size: 0.72rem; font-weight: 700; color: #00594E; background: #f0fdf4; border: 1px solid #b2cfcb; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 5px;">
                          <span>PIN Solicitante:</span>
                          <strong style="font-family: monospace; letter-spacing: 0.05em;">${escapeHtml(pinSol)}</strong>
                        </span>
                      ` : ''}
                      <a href="/consulta-respuesta?${queryParams}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; font-weight: 750; color: #00594E; background: #f0fdf4; border: 1px solid #b2cfcb; padding: 3px 10px; border-radius: 4px; text-decoration: none;">
                        <span>Ver Portal Solicitante</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </a>
                    </div>
                  </div>
                  <p style="font-size: 0.82rem; color: #1e293b; line-height: 1.55; margin: 0 0 8px 0; background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 6px; padding: 10px 12px; white-space: pre-wrap;">${escapeHtml(resMsg)}</p>
                  <div style="display: flex; gap: 14px; font-size: 0.72rem; color: #64748b; flex-wrap: wrap;">
                    <span>Emitida por: <strong style="color: #334155;">${escapeHtml(funcEmite)}</strong></span>
                    <span>&bull;</span>
                    <span>Fecha de envío: <strong style="color: #334155;">${escapeHtml(fEnvioFormatted)}</strong></span>
                    <span>&bull;</span>
                    <span>Vigencia: <strong style="color: #786832;">10 días calendario con candado temporal</strong></span>
                  </div>
                </div>
              `;
            })()}
          </div>

          <!-- ESTRUCTURA JERÁRQUICA DIRECTA DEL EXPEDIENTE (ÁRBOL PLANO SIN NIVELES INTERMEDIOS) -->
          <div class="card" style="padding: 22px; background: #ffffff; border: 1px solid rgba(15, 23, 42, 0.08); border-radius: var(--radius-md); box-shadow: 0 2px 10px rgba(0,0,0,0.02);">
            <!-- Cabecera del Contenedor Principal: 📁 [Número de Radicado] - [Título] -->
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 1.5px solid #E6EFEF; flex-wrap: wrap; gap: 12px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 40px; height: 40px; border-radius: 8px; background: #E6EFEF; color: #00594E; display: flex; align-items: center; justify-content: center; border: 1.5px solid #B2CFCB; flex-shrink: 0;">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00594E" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div>
                  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <h3 style="font-size: 1.08rem; font-weight: 800; color: #0f172a; margin: 0;">Estructura Documental del Expediente</h3>
                    <span style="font-size: 0.74rem; font-family: monospace; font-weight: 800; color: #00594E; background: #F2F7F6; padding: 2px 8px; border-radius: 4px; border: 1px solid #B2CFCB;">${escapeHtml(peticion.numero_radicado)}</span>
                  </div>
                  <span style="font-size: 0.74rem; color: #64748b;">Árbol jerárquico directo: Archivo base radicado y subcarpetas con soportes aportados</span>
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 8px;">
                <button 
                  type="button" 
                  class="btn btn-primary btn-sm btn-open-modal-subcarpeta" 
                  data-peticion-id="${escapeHtml(peticion.id)}" 
                  data-radicado="${escapeHtml(peticion.numero_radicado)}" 
                  style="display: inline-flex; align-items: center; gap: 6px; font-weight: 800; font-size: 0.78rem; background: #00594E; border-color: #00594E; color: #ffffff;"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>Crear Carpeta y Asignar Dependencias</span>
                </button>
                <span style="font-size: 0.78rem; font-weight: 800; color: #00594E; background: #F2F7F6; padding: 4px 12px; border-radius: 6px; border: 1px solid #B2CFCB;">
                  ${responsables.length} asignacion${responsables.length === 1 ? '' : 'es'}
                </span>
              </div>
            </div>

            <!-- ELEMENTOS HIJOS DIRECTOS DEL EXPEDIENTE (MISMO NIVEL JERÁRQUICO) -->
            <div style="display: flex; flex-direction: column; gap: 14px;">
              <!-- ÍTEM 1: DOCUMENTO ORIGINAL DE LA PETICIÓN (ARCHIVO BASE) -->
              <div style="background: #F7F5EE; border: 1.5px solid #DBD2B0; border-radius: 12px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                  <div style="width: 42px; height: 42px; border-radius: 8px; background: #ffffff; border: 1.5px solid #B5A160; color: #786832; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.78rem; flex-shrink: 0;">
                    PDF
                  </div>
                  <div style="min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <strong style="color: #0f172a; font-size: 0.92rem; word-break: break-all;">${anexoPrincipal ? escapeHtml(anexoPrincipal.nombre_archivo) : 'Documento Inicial no adjunto'}</strong>
                      <span style="font-size: 0.68rem; font-weight: 800; color: #786832; background: #ffffff; padding: 2px 8px; border-radius: 4px; border: 1px solid #DBD2B0;">Documento Base Radicado</span>
                    </div>
                    <div style="font-size: 0.74rem; color: #64748b; margin-top: 3px;">
                      ${anexoPrincipal ? `Tamaño: <strong>${formatFileSize(anexoPrincipal.tamano_bytes)}</strong> &bull; Subido: ${safeFormatDate(anexoPrincipal.created_at)}` : 'Sin archivo físico adjunto'}
                    </div>
                  </div>
                </div>

                ${anexoPrincipal ? `
                  <div style="display: flex; gap: 8px; flex-shrink: 0;">
                    <a 
                      href="${getPublicStorageUrl(anexoPrincipal.storage_path)}" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      class="btn btn-sm" 
                      style="text-decoration: none; display: inline-flex; align-items: center; gap: 6px; font-weight: 750; font-size: 0.78rem; padding: 6px 14px; background: #ffffff; color: #00594E; border: 1.5px solid #00594E; border-radius: 6px; transition: all 0.2s ease;"
                      onmouseover="this.style.background='#E6EFEF';"
                      onmouseout="this.style.background='#ffffff';"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      <span>Descargar Documento</span>
                    </a>
                  </div>
                ` : ''}
              </div>

            ${(() => {
              const subcarpetas = filtrarSubcarpetasValidas(
                (peticion.subcarpetas && peticion.subcarpetas.length > 0)
                  ? peticion.subcarpetas
                  : inferSubcarpetas(peticion)
              );
              if (subcarpetas.length > 1) {
                return `
                  <!-- Barra de Pestañas / Filtro de Subcarpetas con Transición Fluida Crossfade -->
                  <div class="sub-filter-bar" style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch;">
                    <button type="button" class="btn-sub-filter-tab active" data-filter-sub="all" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: 0.76rem; font-weight: 800; border-radius: 6px; border: 1px solid #00594E; background: #00594E; color: #ffffff; cursor: pointer; transition: all 0.2s ease;">
                      <span>Todas las Carpetas</span>
                      <span style="background: rgba(255,255,255,0.2); padding: 1px 6px; border-radius: 9999px; font-size: 0.68rem;">${subcarpetas.length}</span>
                    </button>
                    ${subcarpetas.map((s: any) => {
                      const cleanSubTitle = String(s.nombre || '').replace(/^subcarpeta\s+/i, '').trim();
                      return `
                      <button type="button" class="btn-sub-filter-tab" data-filter-sub="${escapeHtml(cleanSubTitle)}" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: 0.76rem; font-weight: 750; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; color: #334155; cursor: pointer; transition: all 0.2s ease;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                        <span>${escapeHtml(cleanSubTitle)}</span>
                      </button>
                    `}).join('')}
                  </div>
                `;
              }
              return '';
            })()}

            <div id="subcarpetas-bento-container" style="display: flex; flex-direction: column; gap: 16px;">
              ${(() => {
                const subcarpetas = filtrarSubcarpetasValidas(
                  (peticion.subcarpetas && peticion.subcarpetas.length > 0) 
                    ? peticion.subcarpetas 
                    : inferSubcarpetas(peticion)
                );
                const subcarpetaBlocks: string[] = [];

                // Helper para extraer observaciones específicas de cada subcarpeta
                const extractSubObs = (raw: string, subName: string): string => {
                  if (!raw) return '';
                  const { textoLimpio } = separarRespuestaMeta(raw);
                  const withoutPin = textoLimpio.replace(/^PIN:\s*[0-9A-Z]{6}(\s*\|\s*)?/i, '').trim();
                  const escaped = subName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  const reg = new RegExp(`\\[\\s*${escaped}\\s*\\]\\s*:?\\s*([^|\\[]+)`, 'i');
                  const m = withoutPin.match(reg);
                  if (m && m[1]) return (m[1] || '').trim();
                  if (!withoutPin.includes('[') || withoutPin.startsWith(`[${subName}]`)) {
                    return withoutPin.replace(new RegExp(`^\\[\\s*${escaped}\\s*\\]\\s*:?\\s*`, 'i'), '').trim();
                  }
                  return '';
                };

                // Helper robusto para asociar archivos a una subcarpeta específica
                const isFileForSub = (a: any, subName: string, subId: string): boolean => {
                  if (!a) return false;
                  if (a.subcarpeta_id && a.subcarpeta_id === subId) return true;
                  const cleanName = (a.nombre_archivo || '').toLowerCase();
                  const cleanSub = subName.toLowerCase().trim();
                  if (cleanName.includes(`[${cleanSub}]`) || cleanName.includes(`[subcarpeta ${cleanSub}]`)) return true;
                  const slug = cleanSub.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
                  if (slug && a.storage_path && a.storage_path.toLowerCase().includes(`/${slug}/`)) return true;
                  if (subcarpetas.length === 1) return true;
                  return false;
                };

                if (subcarpetas.length > 0) {
                  // Helper para asociar responsables a la subcarpeta correcta
                  const isRespForSub = (r: any, sub: any, index: number): boolean => {
                    if (!r) return false;
                    if (r.subcarpeta_id && (r.subcarpeta_id === sub.id || String(r.subcarpeta_id) === String(sub.id))) return true;
                    const cleanSubName = (sub.nombre || '').toLowerCase().trim();
                    const rawObs = (r.observaciones_entrega || '').toLowerCase();
                    if (cleanSubName && (rawObs.includes(`[${cleanSubName}]`) || rawObs.includes(`[subcarpeta ${cleanSubName}]`))) return true;
                    if (subcarpetas.length === 1) return true;
                    // Si no tiene coincidencia explícita con ninguna subcarpeta, asignar a la primera subcarpeta
                    const matchesAnySub = subcarpetas.some((s: any) => {
                      const sName = (s.nombre || '').toLowerCase().trim();
                      return (r.subcarpeta_id && String(r.subcarpeta_id) === String(s.id)) || 
                             (sName && (rawObs.includes(`[${sName}]`) || rawObs.includes(`[subcarpeta ${sName}]`)));
                    });
                    if (!matchesAnySub && index === 0) return true;
                    return false;
                  };

                  subcarpetas.forEach((sub: any, subIdx: number) => {
                    const subResps = responsables.filter((r) => isRespForSub(r, sub, subIdx));

                    // Filtrar anexos estrictamente correspondientes a esta subcarpeta
                    const subAnexos = anexosOficinas.filter((a) => {
                      if (isFileForSub(a, sub.nombre, sub.id)) return true;
                      if (a.peticion_responsable_id && subResps.some((sr: any) => sr.id === a.peticion_responsable_id)) {
                        const otherSubNames = subcarpetas.filter((s: any) => s.id !== sub.id).map((s: any) => (s.nombre || '').toLowerCase().trim());
                        const fileName = (a.nombre_archivo || '').toLowerCase();
                        const hasOtherSub = otherSubNames.some((os: string) => os && fileName.includes(`[${os}]`));
                        if (!hasOtherSub) return true;
                      }
                      return false;
                    });

                    // Contar dependencias que ya entregaron archivos en esta subcarpeta
                    const deliveredCount = subResps.filter((r) => {
                      const ofiHasFiles = subAnexos.some((a) => a.peticion_responsable_id === r.id);
                      const isStateEntregado = String(r.estado_entrega || '').toLowerCase() === 'entregado';
                      return ofiHasFiles || (subcarpetas.length === 1 && isStateEntregado);
                    }).length;

                    const allDeliveredInSub = subResps.length > 0 && deliveredCount >= subResps.length;
                    const subDisplayTitle = String(sub.nombre || '').replace(/^subcarpeta\s+/i, '').trim();

                    subcarpetaBlocks.push(`
                      <div class="subfolder-bento-card" data-sub-name="${escapeHtml(subDisplayTitle)}" data-collapsed="false" style="border: 1px solid ${allDeliveredInSub ? '#a7f3d0' : 'rgba(15, 23, 42, 0.08)'}; border-radius: 12px; overflow: hidden; background: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.02); transition: opacity 0.25s ease, transform 0.25s ease;">
                        <!-- Nivel 1: Encabezado Clickeable de la Subcarpeta (Acordeón Pro Max) -->
                        <div class="subcarpeta-header" data-sub-id="${escapeHtml(sub.id)}" style="background: ${allDeliveredInSub ? '#f0fdf4' : '#f8fafc'}; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; cursor: pointer; user-select: none; transition: background 0.2s ease;">
                          <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 32px; height: 32px; border-radius: 6px; background: #ffffff; border: 1px solid ${allDeliveredInSub ? '#a7f3d0' : 'rgba(15, 23, 42, 0.1)'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${allDeliveredInSub ? '#00594E' : '#00594E'}" stroke-width="1.75"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                            </div>
                            <div>
                              <div style="display: flex; align-items: center; gap: 8px;">
                                <strong style="font-size: 0.95rem; color: #052e16; font-weight: 800;">${escapeHtml(subDisplayTitle)}</strong>
                                <span style="font-size: 0.68rem; font-weight: 800; color: #00594E; background: #ffffff; padding: 2px 8px; border-radius: 4px; border: 1px solid #B2CFCB;">${subResps.length} dependencia${subResps.length === 1 ? '' : 's'}</span>
                              </div>
                              ${sub.descripcion ? `
                                <div style="font-size: 0.76rem; color: #334155; margin-top: 5px; background: #ffffff; padding: 6px 12px; border-radius: 6px; border-left: 3px solid #00594E; border: 1px solid rgba(15, 23, 42, 0.05); box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                                  <strong style="color: #00594E; font-size: 0.70rem; text-transform: uppercase;">Requerimiento / Instrucción:</strong> ${escapeHtml(sub.descripcion)}
                                </div>
                              ` : ''}
                            </div>
                          </div>
                          <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 0.74rem; font-weight: 800; padding: 4px 12px; border-radius: 6px; border: 1px solid; ${allDeliveredInSub ? 'background: #E6EFEF; color: #00594E; border-color: #B2CFCB;' : 'background: #F7F5EE; color: #786832; border-color: #DBD2B0;'}">
                              ${deliveredCount} de ${subResps.length} Aportes entregados
                            </span>
                            <div class="subcarpeta-chevron" style="width: 28px; height: 28px; border-radius: 6px; background: #ffffff; border: 1px solid rgba(15, 23, 42, 0.1); display: flex; align-items: center; justify-content: center; transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#334155" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                            </div>
                          </div>
                        </div>

                        <!-- Nivel 2: Contenedor Acordeón Suave con CSS Grid -->
                        <div class="subcarpeta-body-wrapper" style="display: grid; grid-template-rows: 1fr; transition: grid-template-rows 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease; opacity: 1;">
                          <div class="subcarpeta-body-content" style="overflow: hidden;">
                            <div style="padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; background: #ffffff; border-top: 1px solid rgba(15, 23, 42, 0.06);">
                              ${subResps.length > 0 ? subResps.map((r) => {
                                const ofiAnexos = subAnexos.filter((a) => a && a.peticion_responsable_id === r.id);
                                const isStateEntregado = String(r.estado_entrega || '').toLowerCase() === 'entregado';
                                const isDelivered = ofiAnexos.length > 0 || (subcarpetas.length === 1 && isStateEntregado);
                                const ofiNombre = Array.isArray(r.oficinas) ? (r.oficinas[0]?.nombre || 'Oficina Responsable') : (r.oficinas?.nombre || 'Oficina Responsable');
                                const ofiCodigo = Array.isArray(r.oficinas) ? (r.oficinas[0]?.codigo || '') : (r.oficinas?.codigo || '');
                                const rawObs = (r as any).observaciones_entrega || '';
                                const cleanObs = extractSubObs(rawObs, sub.nombre);
                                const subReqText = (sub.descripcion || '').trim().toLowerCase();
                                const obsText = cleanObs.trim().toLowerCase();
                                const isSameAsRequirement = Boolean(subReqText && (obsText === subReqText || obsText.startsWith(subReqText) || subReqText.startsWith(obsText)));
                                const hasRealFiles = ofiAnexos.length > 0;
                                const showAporteObs = hasRealFiles && cleanObs && !isSameAsRequirement;

                                return `
                                  <div style="background: #f8fafc; border: 1px solid rgba(15, 23, 42, 0.07); border-radius: 8px; padding: 14px 16px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                                      <div style="display: flex; align-items: center; gap: 8px;">
                                        <strong style="font-size: 0.88rem; color: #0f172a; font-weight: 750;">Aporte de: ${escapeHtml(ofiNombre)}</strong>
                                        ${ofiCodigo ? `<span style="font-size: 0.70rem; color: #64748b;">(${escapeHtml(ofiCodigo)})</span>` : ''}
                                      </div>
                                      <div style="display: flex; align-items: center; gap: 6px;">
                                        <span style="font-family: monospace; font-size: 0.74rem; font-weight: 800; color: #00594E; background: #ffffff; padding: 2px 7px; border-radius: 4px; border: 1px solid #B2CFCB;" title="Código Único de Acceso">${escapeHtml(r.codigo_acceso || 'UPQ')}</span>
                                        <span style="font-size: 0.70rem; font-weight: 800; padding: 2px 8px; border-radius: 4px; border: 1px solid; ${isDelivered ? 'background: #E6EFEF; color: #00594E; border-color: #B2CFCB;' : 'background: #F7F5EE; color: #786832; border-color: #DBD2B0;'}">
                                          ${isDelivered ? 'Entregado' : 'Pendiente de aporte'}
                                        </span>
                                      </div>
                                    </div>

                                    ${ofiAnexos.length > 0 ? `
                                      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
                                        <div style="font-size: 0.70rem; font-weight: 750; color: #475569; text-transform: uppercase; letter-spacing: 0.3px;">Documentos aportados en esta subcarpeta:</div>
                                        ${ofiAnexos.map((oa) => `
                                          <div style="background: #ffffff; border: 1px solid rgba(15, 23, 42, 0.08); border-radius: 6px; padding: 9px 12px; display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; gap: 10px;">
                                            <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00594E" stroke-width="1.75" style="flex-shrink: 0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                              <div style="min-width: 0;">
                                                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                                  <strong style="color: #0f172a; word-break: break-all;">[Aporte de: ${escapeHtml(ofiNombre)}] - ${escapeHtml((oa.nombre_archivo || 'anexo.pdf').replace(/^\[[^\]]+\]\s*/, ''))}</strong>
                                                  <span style="font-size: 0.66rem; font-weight: 750; color: #00594E; background: #E6EFEF; padding: 1px 6px; border-radius: 3px; border: 1px solid #B2CFCB;">${escapeHtml(subDisplayTitle)}</span>
                                                </div>
                                                <div style="font-size: 0.68rem; color: #64748b; margin-top: 2px;">
                                                  ${formatFileSize(oa.tamano_bytes)}${oa.created_at ? ` • Subido el ${new Date(oa.created_at).toLocaleDateString('es-CO')}` : ''}
                                                </div>
                                              </div>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                                              <a 
                                                href="${getPublicStorageUrl(oa.storage_path)}" 
                                                download="${escapeHtml(oa.nombre_archivo)}" 
                                                onclick="event.stopPropagation()" 
                                                class="btn-download-discreet" 
                                                style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: 0.74rem; font-weight: 600; border-radius: 6px; background: #f8fafc; color: #334155; border: 1px solid #cbd5e1; text-decoration: none; transition: all 0.2s ease;"
                                                onmouseover="this.style.borderColor='#00594E'; this.style.color='#00594E'; this.style.background='#ffffff';"
                                                onmouseout="this.style.borderColor='#cbd5e1'; this.style.color='#334155'; this.style.background='#f8fafc';"
                                                title="Descargar archivo"
                                              >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                                <span>Descargar</span>
                                              </a>
                                            </div>
                                          </div>
                                        `).join('')}
                                      </div>
                                    ` : `
                                      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 8px; padding: 10px 12px; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 6px;">
                                        <span style="font-size: 0.76rem; color: #64748b; font-style: italic;">Pendiente de entrega (Sin archivos cargados aún)</span>
                                        <button type="button" class="btn btn-secondary btn-sm btn-subir-soporte-manual" onclick="event.stopPropagation()" data-resp-id="${escapeHtml(r.id)}" data-sub-id="${escapeHtml(sub.id)}" data-sub-nombre="${escapeHtml(sub.nombre)}" data-ofi-nombre="${escapeHtml(ofiNombre)}" style="font-size: 0.72rem; padding: 4px 10px; font-weight: 750; border: 1px solid #00594E; color: #00594E; background: #E6EFEF;">
                                          Subir soporte manualmente
                                        </button>
                                      </div>
                                    `}

                                    ${showAporteObs ? `
                                      <div style="margin-top: 10px; background: #ffffff; border: 1px solid rgba(15, 23, 42, 0.08); border-left: 3px solid #B5A160; border-radius: 6px; padding: 10px 14px; font-size: 0.78rem; color: #334155;">
                                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px;">
                                          <strong style="color: #786832; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.3px;">Observación del Aporte:</strong>
                                          ${r.fecha_entrega ? `<span style="font-size: 0.68rem; color: #64748b;">${new Date(r.fecha_entrega).toLocaleDateString('es-CO')}</span>` : ''}
                                        </div>
                                        <div style="line-height: 1.45;">"${escapeHtml(cleanObs)}"</div>
                                      </div>
                                    ` : ''}
                                  </div>
                                `;
                              }).join('') : `
                                <div style="font-size: 0.78rem; color: #64748b; font-style: italic;">
                                  No hay dependencias asignadas en esta subcarpeta.
                                </div>
                              `}
                            </div>
                          </div>
                        </div>
                      </div>
                    `);
                  });
                }

                if (subcarpetaBlocks.length === 0) {
                  return `
                    <div style="text-align: center; padding: 24px; color: #64748b; font-size: 0.82rem;">
                      No se han asignado subcarpetas ni dependencias a este expediente. Utilice el botón "Crear Subcarpeta" para estructurarlo.
                    </div>
                  `;
                }

                return subcarpetaBlocks.join('');
              })()}
            </div>
          </div>
        </div>
        `;

        // Registrar listener para el botón volver de la cabecera
        document.getElementById('btn-back-to-explorer')?.addEventListener('click', closeFolderDetail);

        // Registrar listener para tabs de filtrado por subcarpeta con Crossfade
        document.querySelectorAll('.btn-sub-filter-tab').forEach((tab) => {
          tab.addEventListener('click', (e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            const filterTarget = btn.getAttribute('data-filter-sub');

            document.querySelectorAll('.btn-sub-filter-tab').forEach((b) => {
              b.classList.remove('active');
              (b as HTMLElement).style.background = '#f8fafc';
              (b as HTMLElement).style.color = '#334155';
              (b as HTMLElement).style.borderColor = '#cbd5e1';
            });
            btn.classList.add('active');
            btn.style.background = '#00594E';
            btn.style.color = '#ffffff';
            btn.style.borderColor = '#00594E';

            const cards = document.querySelectorAll('.subfolder-bento-card');
            cards.forEach((card) => {
              const htmlCard = card as HTMLElement;
              const subName = htmlCard.getAttribute('data-sub-name');
              if (filterTarget === 'all' || subName === filterTarget) {
                htmlCard.style.display = 'block';
                htmlCard.style.opacity = '0';
                htmlCard.style.transform = 'translateY(4px)';
                setTimeout(() => {
                  htmlCard.style.opacity = '1';
                  htmlCard.style.transform = 'translateY(0)';
                }, 30);
              } else {
                htmlCard.style.display = 'none';
              }
            });
          });
        });

        // Registrar listener para Acordeón Vertical Pro Max en cada subcarpeta
        explorerFolder.querySelectorAll('.subcarpeta-header').forEach((hdr) => {
          hdr.addEventListener('click', (e) => {
            const h = e.currentTarget as HTMLElement;
            const card = h.closest('.subfolder-bento-card');
            if (!card) return;
            const wrapper = card.querySelector('.subcarpeta-body-wrapper') as HTMLElement | null;
            const chevron = h.querySelector('.subcarpeta-chevron') as HTMLElement | null;
            if (!wrapper) return;

            const isCollapsed = card.getAttribute('data-collapsed') === 'true';
            if (isCollapsed) {
              card.setAttribute('data-collapsed', 'false');
              wrapper.style.gridTemplateRows = '1fr';
              wrapper.style.opacity = '1';
              if (chevron) chevron.style.transform = 'rotate(0deg)';
            } else {
              card.setAttribute('data-collapsed', 'true');
              wrapper.style.gridTemplateRows = '0fr';
              wrapper.style.opacity = '0';
              if (chevron) chevron.style.transform = 'rotate(-90deg)';
            }
          });
        });

        // Registrar listener para botones "Subir soporte manualmente"
        document.querySelectorAll('.btn-subir-soporte-manual').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const b = e.currentTarget as HTMLButtonElement;
            const respId = b.getAttribute('data-resp-id');
            const subId = b.getAttribute('data-sub-id');
            const subNombre = b.getAttribute('data-sub-nombre');
            const ofiNombre = b.getAttribute('data-ofi-nombre');

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);

            fileInput.onchange = async () => {
              const file = fileInput.files?.[0];
              if (!file) {
                document.body.removeChild(fileInput);
                return;
              }

              if (typeof (window as any).showToast === 'function') {
                (window as any).showToast(`Subiendo soporte para ${ofiNombre}...`, 'info');
              }

              try {
                // Generar URL firmada de subida
                const radicadoClean = (peticion.numero_radicado || 'EXP').replace(/[^a-zA-Z0-9_-]/g, '_');
                const subSlug = (subNombre || 'general').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
                const cleanFileName = `[${subNombre}]_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                const storagePath = `peticiones/${radicadoClean}/${subSlug}/${Date.now()}_${cleanFileName}`;

                let uploadedPath = storagePath;
                try {
                  const signedRes = await fetch('/api/storage/signed-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bucket: 'peticiones', path: storagePath }),
                  });
                  const signedData = await signedRes.json().catch(() => ({}));
                  if (signedData.success && signedData.signedUrl) {
                    await fetch(signedData.signedUrl, {
                      method: 'PUT',
                      headers: { 'Content-Type': file.type || 'application/octet-stream' },
                      body: file,
                    });
                    uploadedPath = signedData.path || storagePath;
                  }
                } catch (signErr) {
                  console.warn('Fallo URL firmada, probando subida directa:', signErr);
                }

                // Registrar en public.peticion_anexos mediante endpoint oficial
                const res = await fetch('/api/portal/subir-anexo', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    peticion_id: peticion.id,
                    responsable_id: respId,
                    subcarpeta_id: subId && !subId.startsWith('sub-inf-') ? subId : null,
                    subcarpeta_nombre: subNombre,
                    numero_radicado: peticion.numero_radicado,
                    storage_path: uploadedPath,
                    archivo_nombre: cleanFileName,
                    archivo_mime: file.type || 'application/octet-stream',
                    archivo_tamano: file.size,
                    observaciones: `Carga manual de soporte para ${ofiNombre} en Subcarpeta ${subNombre}`,
                  }),
                });

                const data = await res.json().catch(() => ({}));
                if (data.success) {
                  if (typeof (window as any).showToast === 'function') {
                    (window as any).showToast('Soporte cargado exitosamente.', 'success');
                  }
                  setTimeout(() => window.location.reload(), 800);
                } else {
                  throw new Error(data.error || 'No se pudo registrar el soporte.');
                }
              } catch (uploadErr: any) {
                console.error('Error subiendo soporte manual:', uploadErr);
                if (typeof (window as any).showToast === 'function') {
                  (window as any).showToast(uploadErr.message || 'Error al subir soporte.', 'error');
                }
              } finally {
                document.body.removeChild(fileInput);
              }
            };

            fileInput.click();
          });
        });
      } catch (err) {
        console.error('Error detallado en openFolderDetail:', err);
        if (typeof (window as any).showToast === 'function') {
          (window as any).showToast('Ocurrió un error al abrir la carpeta.', 'error');
        }
      }
    }

    // Exponer globalmente para permitir apertura desde cualquier botón o enlace
    (window as any).openFolderDetail = openFolderDetail;

    // 3. CERRAR DETALLE DE CARPETA Y RESTAURAR VISTA PRINCIPAL
    function closeFolderDetail() {
      currentActiveFolderId = null;
      const explorerRoot = document.getElementById('explorer-root-view') || explorerRootView;
      const explorerFolder = document.getElementById('explorer-folder-view') || explorerFolderView;
      const grid = document.getElementById('drive-grid-container') || gridContainer;
      const table = document.getElementById('drive-table-container') || tableContainer;

      if (explorerFolder) explorerFolder.style.setProperty('display', 'none', 'important');
      if (explorerRoot) explorerRoot.style.setProperty('display', 'flex', 'important');

      if (currentView === 'grid') {
        if (grid) grid.style.setProperty('display', 'grid', 'important');
        if (table) table.style.setProperty('display', 'none', 'important');
      } else {
        if (grid) grid.style.setProperty('display', 'none', 'important');
        if (table) table.style.setProperty('display', 'block', 'important');
      }

      // Restaurar URL limpia
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('radicado') || url.searchParams.has('folderId') || url.searchParams.has('id')) {
          url.searchParams.delete('radicado');
          url.searchParams.delete('folderId');
          url.searchParams.delete('id');
          window.history.replaceState({}, '', url.pathname);
        }
      } catch (e) {}

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // 4. DELEGACIÓN GLOBAL DE EVENTOS (Abrir Carpeta, Editar y Eliminar)
    document.addEventListener('click', async (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // A. Botón Editar Petición / Carpeta
      const editBtn = target.closest('.btn-edit-pet') as HTMLElement | null;
      if (editBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = editBtn.getAttribute('data-id') || '';
        const radicado = editBtn.getAttribute('data-radicado') || '';
        const asunto = editBtn.getAttribute('data-asunto') || '';
        const solicitante = editBtn.getAttribute('data-solicitante') || '';
        const tipo = editBtn.getAttribute('data-tipo') || 'Ciudadano';
        const prioridad = editBtn.getAttribute('data-prioridad') || 'Media';
        const estado = editBtn.getAttribute('data-estado') || 'en_tramite';
        const entrega = editBtn.getAttribute('data-entrega') || '';

        if (editTitle) editTitle.textContent = `Editar Expediente ${radicado}`;
        if (inputId) inputId.value = id;
        if (inputAsunto) inputAsunto.value = asunto;
        if (inputSolicitante) inputSolicitante.value = solicitante;
        if (selectTipo) selectTipo.value = tipo;
        if (selectPrioridad) selectPrioridad.value = prioridad;
        if (selectEstado) selectEstado.value = estado;
        if (inputEntrega) inputEntrega.value = entrega;

        if (editModal) editModal.style.display = 'flex';
        return;
      }

      // B. Botón Crear Subcarpeta en Expediente
      const subcarpetaBtn = target.closest('.btn-open-modal-subcarpeta') as HTMLElement | null;
      if (subcarpetaBtn) {
        e.preventDefault();
        e.stopPropagation();
        const petId = subcarpetaBtn.getAttribute('data-peticion-id') || '';
        const radicado = subcarpetaBtn.getAttribute('data-radicado') || '';
        openModalCrearSubcarpeta(petId, radicado);
        return;
      }

      // C. Botón Enviar Respuesta al Solicitante
      const responderBtn = target.closest('.btn-open-responder-modal') as HTMLElement | null;
      if (responderBtn) {
        e.preventDefault();
        e.stopPropagation();
        const petId = responderBtn.getAttribute('data-id') || '';
        if (petId) openResponderModal(petId);
        return;
      }

      // D. Botón Respaldar Expediente en Google Drive
      const driveBtn = target.closest('.btn-export-drive') as HTMLElement | null;
      if (driveBtn) {
        e.preventDefault();
        e.stopPropagation();
        const petId = driveBtn.getAttribute('data-id') || '';
        const radicado = driveBtn.getAttribute('data-radicado') || 'RAD';
        if (petId) {
          handleExportToGoogleDrive(petId, radicado, driveBtn);
        }
        return;
      }

      // B. Botón Eliminar Carpeta
      const deleteBtn = target.closest('.btn-delete-pet') as HTMLElement | null;
      if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = deleteBtn.getAttribute('data-id');
        const radicado = deleteBtn.getAttribute('data-radicado');
        if (!id) return;

        const confirmed = typeof (window as any).showConfirm === 'function'
          ? await (window as any).showConfirm(
              `¿Está seguro de que desea eliminar definitivamente la carpeta del radicado ${radicado}?\n\nEsta acción purgará los archivos almacenados en Storage y registrará el evento en la Auditoría institucional.`,
              'Confirmar Eliminación'
            )
          : true;
        if (!confirmed) return;

        deleteBtn.setAttribute('disabled', 'true');
        try {
          const res = await fetch('/api/peticiones/eliminar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            (window as any).showToast('Error al eliminar: ' + (data.error || 'No se pudo eliminar'), 'error');
            deleteBtn.removeAttribute('disabled');
            return;
          }

          const card = document.getElementById(`card-folder-${id}`);
          if (card) card.remove();
          const row = document.getElementById(`row-folder-${id}`);
          if (row) row.remove();

          if (currentActiveFolderId === id) {
            closeFolderDetail();
          }

          (window as any).showToast(`Carpeta y radicado ${radicado} eliminados exitosamente.`, 'success');
        } catch (err) {
          (window as any).showToast('Error de conexión al eliminar.', 'error');
          deleteBtn.removeAttribute('disabled');
        }
        return;
      }

      // C. Botón "Abrir Carpeta" (.btn-open-folder o .btn-abrir-carpeta)
      const openBtn = target.closest('.btn-open-folder, .btn-abrir-carpeta') as HTMLElement | null;
      if (openBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = openBtn.getAttribute('data-radicado') || openBtn.getAttribute('data-folder-id') || openBtn.getAttribute('data-id');
        if (id) openFolderDetail(id);
        return;
      }

      // D. Clic en la tarjeta de carpeta (sin tocar botones secundarios)
      const folderCard = target.closest('.drive-folder-card') as HTMLElement | null;
      if (folderCard && !target.closest('.btn-edit-pet, .btn-delete-pet, a, button')) {
        const id = folderCard.getAttribute('data-radicado') || folderCard.getAttribute('data-folder-id') || folderCard.getAttribute('data-id');
        if (id) openFolderDetail(id);
        return;
      }

      // E. Clic en la fila de tabla (sin tocar la columna de acciones)
      const tableRow = target.closest('.doc-row') as HTMLElement | null;
      if (tableRow && !target.closest('td:last-child, a, button')) {
        const id = tableRow.getAttribute('data-radicado') || tableRow.getAttribute('data-folder-id') || tableRow.getAttribute('data-id');
        if (id) openFolderDetail(id);
        return;
      }

      // F. Botón Copiar PIN
      const copyPinBtn = target.closest('.btn-copy-pin') as HTMLElement | null;
      if (copyPinBtn) {
        e.preventDefault();
        e.stopPropagation();
        const pin = copyPinBtn.getAttribute('data-pin') || '849201';
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(pin);
          }
          if (typeof (window as any).showToast === 'function') {
            (window as any).showToast(`PIN de acceso ${pin} copiado al portapapeles.`, 'info');
          } else {
            alert(`PIN copiado: ${pin}`);
          }
        } catch {
          alert(`PIN copiado: ${pin}`);
        }
        return;
      }
    });

    // 5. Filtrado por Pestañas
    const filterTabs = document.querySelectorAll('#archivos-filter-tabs .filter-tab');
    filterTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        filterTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');

        const filter = tab.getAttribute('data-filter') || 'all';
        applyFilters(filter, searchInput ? searchInput.value : '');
      });
    });

    // 6. Buscador interactivo en vivo
    searchInput?.addEventListener('input', () => {
      const activeTab = document.querySelector('#archivos-filter-tabs .filter-tab.active');
      const filter = activeTab ? activeTab.getAttribute('data-filter') || 'all' : 'all';
      applyFilters(filter, searchInput.value.toLowerCase().trim());
    });

    function applyFilters(filterStatus: string, searchText: string) {
      const cards = document.querySelectorAll('.drive-folder-card');
      const rows = document.querySelectorAll('.doc-row');

      cards.forEach((el) => {
        const card = el as HTMLElement;
        const status = card.getAttribute('data-status');
        const sla = card.getAttribute('data-sla');
        const radicado = (card.getAttribute('data-radicado') || '').toLowerCase();
        const asunto = (card.getAttribute('data-asunto') || '').toLowerCase();
        const solicitante = (card.getAttribute('data-solicitante') || '').toLowerCase();

        let matchesStatus = true;
        if (filterStatus === 'pending') matchesStatus = status === 'pending';
        else if (filterStatus === 'responded') matchesStatus = status === 'responded';
        else if (filterStatus === 'safe' || filterStatus === 'warn' || filterStatus === 'critical') matchesStatus = sla === filterStatus;

        let matchesSearch = true;
        if (searchText) {
          matchesSearch = radicado.includes(searchText) || asunto.includes(searchText) || solicitante.includes(searchText);
        }

        card.style.display = (matchesStatus && matchesSearch) ? 'flex' : 'none';
      });

      rows.forEach((el) => {
        const row = el as HTMLElement;
        const status = row.getAttribute('data-status');
        const sla = row.getAttribute('data-sla');
        const radicado = (row.getAttribute('data-radicado') || '').toLowerCase();
        const asunto = (row.getAttribute('data-asunto') || '').toLowerCase();
        const solicitante = (row.getAttribute('data-solicitante') || '').toLowerCase();

        let matchesStatus = true;
        if (filterStatus === 'pending') matchesStatus = status === 'pending';
        else if (filterStatus === 'responded') matchesStatus = status === 'responded';
        else if (filterStatus === 'safe' || filterStatus === 'warn' || filterStatus === 'critical') matchesStatus = sla === filterStatus;

        let matchesSearch = true;
        if (searchText) {
          matchesSearch = radicado.includes(searchText) || asunto.includes(searchText) || solicitante.includes(searchText);
        }

        row.style.display = (matchesStatus && matchesSearch) ? '' : 'none';
      });
    }

    // 7. Modal Editar Petición
    const closeEdit = () => { if (editModal) editModal.style.display = 'none'; };
    document.getElementById('btn-close-edit-modal')?.addEventListener('click', closeEdit);
    document.getElementById('btn-cancel-edit-pet')?.addEventListener('click', closeEdit);

    formEdit?.addEventListener('submit', async (e: Event) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-edit-pet') as HTMLButtonElement | null;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Actualizando...';
      }

      try {
        const payload = {
          id: inputId ? inputId.value : '',
          asunto: inputAsunto ? inputAsunto.value.trim() : '',
          solicitante_nombre: inputSolicitante ? inputSolicitante.value.trim() : '',
          solicitante_tipo: selectTipo ? selectTipo.value : 'Ciudadano',
          prioridad: selectPrioridad ? selectPrioridad.value : 'Media',
          estado: selectEstado ? selectEstado.value : 'en_tramite',
          fecha_limite_entrega: inputEntrega ? inputEntrega.value : '',
        };

        const res = await fetch('/api/peticiones/editar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          (window as any).showToast('Error al actualizar: ' + (data.error || 'No se pudo actualizar'), 'error');
          return;
        }

        (window as any).showToast('Expediente actualizado con éxito.', 'success');
        setTimeout(() => window.location.reload(), 600);
      } catch (err) {
        (window as any).showToast('Error de conexión al actualizar.', 'error');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Guardar Cambios';
        }
      }
    });

    // 7.1 Modal Crear Subcarpeta y Asignar Dependencias
    const subcarpetaModal = document.getElementById('modal-crear-subcarpeta');
    const formCrearSubcarpeta = document.getElementById('form-crear-subcarpeta');
    const closeSubModal = () => { if (subcarpetaModal) subcarpetaModal.style.display = 'none'; };
    document.getElementById('btn-close-subcarpeta-modal')?.addEventListener('click', closeSubModal);
    document.getElementById('btn-cancel-crear-subcarpeta')?.addEventListener('click', closeSubModal);

    let archivosOficinasCatalog: any[] = [];
    try {
      const ofiEl = document.getElementById('data-archivos-oficinas');
      if (ofiEl && ofiEl.textContent) {
        archivosOficinasCatalog = JSON.parse(ofiEl.textContent);
      }
    } catch {}

    function openModalCrearSubcarpeta(petId: string, radicado: string) {
      const petIdInput = document.getElementById('subcarpeta-target-pet-id') as HTMLInputElement | null;
      const radicadoLabel = document.getElementById('subcarpeta-target-radicado');
      const nombreInput = document.getElementById('subcarpeta-nombre-input') as HTMLInputElement | null;
      const descInput = document.getElementById('subcarpeta-desc-input') as HTMLTextAreaElement | null;
      const ofisContainer = document.getElementById('subcarpeta-modal-oficinas-list');
      const countLabel = document.getElementById('subcarpeta-modal-selected-count');

      if (petIdInput) petIdInput.value = petId;
      if (radicadoLabel) radicadoLabel.textContent = radicado;
      if (nombreInput) nombreInput.value = '';
      if (descInput) descInput.value = '';
      if (countLabel) countLabel.textContent = '0 seleccionadas';

      if (ofisContainer) {
        ofisContainer.innerHTML = archivosOficinasCatalog.map((ofi: any) => {
          const isTest = (ofi.codigo || '').toUpperCase().includes('PRUEBA') || (ofi.nombre || '').toLowerCase().includes('prueba');
          return `
            <label style="display: flex; align-items: flex-start; gap: 8px; padding: 6px 8px; background: #ffffff; border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer; font-size: 0.78rem;">
              <input type="checkbox" name="subcarpeta_modal_ofi" value="${ofi.id}" style="accent-color: var(--verde-principal); margin-top: 2px;" />
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${ofi.nombre}
                </div>
                ${isTest ? `<span style="font-size: 0.60rem; color: #b45309; font-weight: 800;">PRUEBA</span>` : ''}
              </div>
            </label>
          `;
        }).join('');

        const cbs = ofisContainer.querySelectorAll('input[name="subcarpeta_modal_ofi"]');
        cbs.forEach((cb) => {
          cb.addEventListener('change', () => {
            const checkedCount = ofisContainer.querySelectorAll('input[name="subcarpeta_modal_ofi"]:checked').length;
            if (countLabel) countLabel.textContent = `${checkedCount} seleccionada${checkedCount === 1 ? '' : 's'}`;
          });
        });
      }

      if (subcarpetaModal) subcarpetaModal.style.display = 'flex';
    }

    let isSubmittingSubfolder = false;

    formCrearSubcarpeta?.addEventListener('submit', async (e: Event) => {
      e.preventDefault();
      if (isSubmittingSubfolder) return;

      const petIdInput = document.getElementById('subcarpeta-target-pet-id') as HTMLInputElement | null;
      const nombreInput = document.getElementById('subcarpeta-nombre-input') as HTMLInputElement | null;
      const descInput = document.getElementById('subcarpeta-desc-input') as HTMLTextAreaElement | null;
      const submitBtn = document.getElementById('btn-submit-crear-subcarpeta') as HTMLButtonElement | null;

      const petId = petIdInput?.value || '';
      const nombre = nombreInput?.value.trim() || '';
      const descripcion = descInput?.value.trim() || '';

      const checkedOffices: string[] = [];
      document.querySelectorAll('input[name="subcarpeta_modal_ofi"]:checked').forEach((el) => {
        checkedOffices.push((el as HTMLInputElement).value);
      });

      if (!nombre) {
        alert('Por favor ingrese el nombre de la subcarpeta.');
        return;
      }
      if (checkedOffices.length === 0) {
        alert('Por favor seleccione al menos una dependencia responsable.');
        return;
      }

      isSubmittingSubfolder = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creando y notificando...';
      }

      try {
        const res = await fetch('/api/peticiones/subcarpetas/crear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            peticion_id: petId,
            nombre,
            descripcion,
            oficina_ids: checkedOffices,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          if (typeof (window as any).showToast === 'function') {
            (window as any).showToast('Error: ' + (data.error || 'No se pudo crear la subcarpeta'), 'error');
          }
          return;
        }

        if (typeof (window as any).showToast === 'function') {
          (window as any).showToast('Subcarpeta creada exitosamente y dependencias notificadas vía correo.', 'success');
        }
        closeSubModal();

        // Actualizar peticion en el array local y re-renderizar sin recarga forzada
        const pet = peticionesMap.get(petId) || allPeticiones.find((p) => p.id === petId);
        if (pet) {
          if (!pet.subcarpetas) pet.subcarpetas = [];
          if (!pet.subcarpetas.some((s: any) => s.id === data.subcarpeta.id || s.nombre?.toLowerCase() === data.subcarpeta.nombre?.toLowerCase())) {
            pet.subcarpetas.push(data.subcarpeta);
          }
          if (data.subcarpeta?.nombre) {
            const newDesc = data.subcarpeta.descripcion || '';
            const entry = `[${data.subcarpeta.nombre}]: ${newDesc}`;
            pet.instrucciones_anexos = pet.instrucciones_anexos ? `${pet.instrucciones_anexos}\n${entry}` : entry;
          }
          if (Array.isArray(data.responsables)) {
            if (!pet.peticion_responsables) pet.peticion_responsables = [];
            data.responsables.forEach((r: any) => {
              const existingIdx = pet.peticion_responsables!.findIndex((er: any) => er.id === r.id || er.oficina_id === r.oficina_id);
              const matchedOfi = archivosOficinasCatalog.find((o: any) => o.id === r.oficina_id);
              if (existingIdx >= 0) {
                const existing = pet.peticion_responsables![existingIdx];
                if (existing) {
                  if (r.observaciones_entrega) {
                    existing.observaciones_entrega = r.observaciones_entrega;
                  }
                  if (r.subcarpeta_id) {
                    existing.subcarpeta_id = r.subcarpeta_id;
                  }
                }
              } else {
                pet.peticion_responsables!.push({
                  id: r.id,
                  codigo_acceso: r.codigo_acceso,
                  subcarpeta_id: data.subcarpeta.id,
                  estado_entrega: 'Pendiente',
                  observaciones_entrega: r.observaciones_entrega,
                  oficinas: matchedOfi,
                });
              }
            });
          }
          indexPeticion(pet);
          openFolderDetail(petId);
        } else {
          setTimeout(() => window.location.reload(), 600);
        }
      } catch (err: any) {
        console.error('Error al crear subcarpeta:', err);
        if (typeof (window as any).showToast === 'function') {
          (window as any).showToast('Error de red al crear la subcarpeta.', 'error');
        }
      } finally {
        isSubmittingSubfolder = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Crear Subcarpeta y Notificar';
        }
      }
    });

    // 7.2 Modal Enviar Respuesta Oficial al Solicitante
    const responderModal = document.getElementById('modal-responder-solicitante');
    const formResponder = document.getElementById('form-responder-solicitante');
    const closeResponder = () => { if (responderModal) responderModal.style.display = 'none'; };
    document.getElementById('btn-close-responder-modal')?.addEventListener('click', closeResponder);
    document.getElementById('btn-cancel-responder-modal')?.addEventListener('click', closeResponder);

    const responderPetIdInput = document.getElementById('responder-pet-id') as HTMLInputElement | null;
    const responderDispRadicado = document.getElementById('responder-disp-radicado');
    const responderDispAsunto = document.getElementById('responder-disp-asunto');
    const responderDispSol = document.getElementById('responder-disp-solicitante');
    const responderEmailInput = document.getElementById('responder-solicitante-email') as HTMLInputElement | null;
    const responderExpiraLabel = document.getElementById('responder-disp-fecha-expira');
    const responderArchivosContainer = document.getElementById('responder-archivos-container');
    const responderFuncionarioInput = document.getElementById('responder-funcionario-input') as HTMLInputElement | null;
    const responderMensajeInput = document.getElementById('responder-mensaje-input') as HTMLTextAreaElement | null;
    const btnToggleAllFiles = document.getElementById('btn-toggle-all-responder-files');

    function updateFileCardState(card: HTMLElement, isChecked: boolean) {
      if (isChecked) {
        card.style.background = '#F2F7F6';
        card.style.borderColor = '#00594E';
        card.style.boxShadow = '0 2px 6px rgba(0, 89, 78, 0.05)';
        card.style.opacity = '1';
        card.classList.add('selected');
      } else {
        card.style.background = '#FFFFFF';
        card.style.borderColor = '#DCE4E3';
        card.style.boxShadow = 'none';
        card.style.opacity = '0.75';
        card.classList.remove('selected');
      }
      const pill = card.querySelector<HTMLElement>('.file-status-pill');
      if (pill) {
        if (isChecked) {
          pill.textContent = 'Incluido';
          pill.style.background = '#00594E';
          pill.style.color = '#FFFFFF';
        } else {
          pill.textContent = 'Omitido';
          pill.style.background = '#F1F5F9';
          pill.style.color = '#64748B';
        }
      }
    }

    let allFilesChecked = true;
    btnToggleAllFiles?.addEventListener('click', () => {
      allFilesChecked = !allFilesChecked;
      const cbs = document.querySelectorAll<HTMLInputElement>('input[name="responder_file_check"]');
      cbs.forEach((cb) => {
        cb.checked = allFilesChecked;
        const card = cb.closest<HTMLElement>('.modal-file-item, .responder-file-card');
        if (card) {
          updateFileCardState(card, allFilesChecked);
        }
      });
    });

    function openResponderModal(petId: string) {
      const pet = peticionesMap.get(petId) || allPeticiones.find((p) => p.id === petId);
      if (!pet) return;

      if (responderPetIdInput) responderPetIdInput.value = pet.id;
      if (responderDispRadicado) responderDispRadicado.textContent = pet.numero_radicado || 'RAD-2026';
      if (responderDispAsunto) responderDispAsunto.textContent = pet.asunto || 'Sin asunto';
      if (responderDispSol) responderDispSol.textContent = pet.solicitante_nombre || 'Ciudadano(a)';
      if (responderEmailInput) responderEmailInput.value = pet.solicitante_email || '';

      // Calcular fecha estimada de expiración (10 días)
      const expDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      const expStr = expDate.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      if (responderExpiraLabel) responderExpiraLabel.textContent = expStr;

      if (responderFuncionarioInput) {
        responderFuncionarioInput.value = pet.respuesta_funcionario || 'Oficina de Correspondencia y Gestión Documental';
      }

      // Plantilla por defecto para redactar
      const defaultMensaje = pet.respuesta_mensaje || `Estimado(a) ${pet.solicitante_nombre || 'solicitante'}, en atención a su comunicación oficial radicada bajo el N° ${pet.numero_radicado}, nos permitimos informarle que la institución ha emitido respuesta de fondo. Se anexan al presente expediente los soportes correspondientes debidamente certificados.`;
      if (responderMensajeInput) responderMensajeInput.value = defaultMensaje;

      // Renderizar checklist de archivos del expediente
      if (responderArchivosContainer) {
        allFilesChecked = true;
        const anexos = Array.isArray(pet.peticion_anexos) ? pet.peticion_anexos : [];
        if (anexos.length === 0) {
          responderArchivosContainer.innerHTML = `
            <div style="font-size: 0.78rem; color: #64748b; font-style: italic; text-align: center; padding: 12px;">
              No se han subido archivos adjuntos a este expediente aún. Podrá enviar el pronunciamiento textual al solicitante.
            </div>
          `;
        } else {
          // Si ya había archivos aprobados previamente
          const previouslyApproved = Array.isArray(pet.respuesta_archivos_incluidos) && pet.respuesta_archivos_incluidos.length > 0
            ? new Set(pet.respuesta_archivos_incluidos)
            : null;

          responderArchivosContainer.innerHTML = anexos.map((a: any, idx: number) => {
            const rawName = a.nombre_archivo || `Archivo_${idx + 1}.pdf`;
            const cleanName = rawName.replace(/^\[[^\]]+\]\s*/, '');
            const isChecked = previouslyApproved ? previouslyApproved.has(a.id) || previouslyApproved.has(a.storage_path) || previouslyApproved.has(a.nombre_archivo) : true;
            const subTag = rawName.match(/^\[([^\]]+)\]/);
            const rawSubLabel = subTag && subTag[1] ? subTag[1].trim() : (a.es_anexo_oficina ? 'Aporte de Dependencia' : 'Documento Inicial');
            const subLabel = rawSubLabel.replace(/^subcarpeta\s+/i, '').trim() || rawSubLabel;
            const sizeLabel = a.tamano_bytes ? (a.tamano_bytes / 1024).toFixed(0) + ' KB' : 'Soporte digital';

            return `
              <label 
                class="modal-file-item responder-file-card ${isChecked ? 'selected' : ''}" 
                style="display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 18px; margin-bottom: 10px; background: ${isChecked ? '#F2F7F6' : '#FFFFFF'}; border: 1.5px solid ${isChecked ? '#00594E' : '#DCE4E3'}; border-radius: 12px; cursor: pointer; transition: all 0.2s ease; box-shadow: ${isChecked ? '0 2px 6px rgba(0, 89, 78, 0.05)' : 'none'}; opacity: ${isChecked ? '1' : '0.75'}; width: 100%; box-sizing: border-box;"
              >
                <!-- LADO IZQUIERDO: Checkbox Institucional + Icono en Caja + Info del Archivo -->
                <div style="display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1;">
                  <!-- Checkbox con color institucional #00594E (NUNCA azul) -->
                  <input
                    type="checkbox"
                    name="responder_file_check"
                    value="${escapeHtml(a.id || a.storage_path || cleanName)}"
                    ${isChecked ? 'checked' : ''}
                    class="responder-file-checkbox"
                    style="accent-color: #00594E; width: 19px; height: 19px; cursor: pointer; flex-shrink: 0; margin: 0;"
                  />

                  <!-- Contenedor elegante para el icono SVG del documento -->
                  <div style="width: 40px; height: 40px; border-radius: 10px; background: #FFFFFF; border: 1px solid #B2CFCB; color: #00594E; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00594E" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  </div>

                  <!-- Nombre del archivo y metadatos en columna limpia -->
                  <div style="display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1;">
                    <span style="font-size: 0.92rem; font-weight: 700; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(cleanName)}">
                      ${escapeHtml(cleanName)}
                    </span>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <!-- Badge de la Subcarpeta / Origen en Dorado/Verde Institucional -->
                      <span style="display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 999px; font-size: 0.74rem; font-weight: 600; background: #F7F5EE; color: #786832; border: 1px solid #DBD2B0;">
                        ${escapeHtml(subLabel)}
                      </span>
                      <span style="font-size: 0.76rem; font-weight: 500; color: #52606D;">
                        • ${escapeHtml(sizeLabel)}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- LADO DERECHO: Indicador visual de estado seleccionado -->
                <span class="file-status-pill" style="display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; background: ${isChecked ? '#00594E' : '#F1F5F9'}; color: ${isChecked ? '#FFFFFF' : '#64748B'}; flex-shrink: 0;">
                  ${isChecked ? 'Incluido' : 'Omitido'}
                </span>
              </label>
            `;
          }).join('');

          // Actualizar estado visual y clases al interactuar con cada fila/checkbox
          responderArchivosContainer.querySelectorAll<HTMLInputElement>('input[name="responder_file_check"]').forEach((cb) => {
            cb.addEventListener('change', () => {
              const card = cb.closest<HTMLElement>('.modal-file-item, .responder-file-card');
              if (card) {
                updateFileCardState(card, cb.checked);
              }
            });
          });
        }
      }

      if (responderModal) responderModal.style.display = 'flex';
    }

    let isSubmittingRespuesta = false;
    formResponder?.addEventListener('submit', async (e: Event) => {
      e.preventDefault();
      if (isSubmittingRespuesta) return;

      const petId = responderPetIdInput?.value || '';
      const email = responderEmailInput?.value.trim().toLowerCase() || '';
      const mensaje = responderMensajeInput?.value.trim() || '';
      const funcionario = responderFuncionarioInput?.value.trim() || '';
      const currentPet = petId ? (peticionesMap.get(petId) || allPeticiones.find((p) => p.id === petId)) : null;
      const driveUrl = currentPet?.respuesta_drive_url || null;

      const checkedFiles: string[] = [];
      document.querySelectorAll<HTMLInputElement>('input[name="responder_file_check"]:checked').forEach((cb) => {
        checkedFiles.push(cb.value);
      });

      if (!petId || !mensaje) {
        alert('Por favor ingrese el texto de la respuesta oficial.');
        return;
      }

      if (!email || !email.includes('@')) {
        alert('Por favor ingrese un correo válido para el solicitante.');
        return;
      }

      const submitBtn = document.getElementById('btn-submit-responder') as HTMLButtonElement | null;
      const submitText = document.getElementById('btn-submit-responder-text');

      isSubmittingRespuesta = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        if (submitText) submitText.textContent = 'Despachando respuesta oficial y notificando por correo...';
      }

      try {
        const res = await fetch('/api/peticiones/responder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            peticion_id: petId,
            solicitante_email: email,
            respuesta_mensaje: mensaje,
            respuesta_funcionario: funcionario,
            respuesta_archivos_incluidos: checkedFiles,
            respuesta_drive_url: driveUrl,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          if (typeof (window as any).showToast === 'function') {
            (window as any).showToast('Error: ' + (data.error || 'No se pudo enviar la respuesta'), 'error');
          }
          return;
        }

        if (typeof (window as any).showToast === 'function') {
          (window as any).showToast('Respuesta oficial despachada con éxito. Solicitante notificado por correo electrónico.', 'success');
        }
        closeResponder();

        // Actualizar peticion en el array local y recargar vista de la carpeta
        const pet = peticionesMap.get(petId) || allPeticiones.find((p) => p.id === petId);
        if (pet) {
          pet.estado = 'Respondida';
          pet.solicitante_email = email;
          pet.respuesta_mensaje = mensaje;
          pet.respuesta_funcionario = funcionario;
          pet.respuesta_fecha_envio = new Date().toISOString();
          pet.respuesta_expira_at = data.expira_at;
          pet.respuesta_pin_solicitante = data.pin_solicitante;
          pet.respuesta_drive_url = driveUrl || null;
          pet.respuesta_archivos_incluidos = checkedFiles;

          indexPeticion(pet);
          openFolderDetail(petId);
        } else {
          setTimeout(() => window.location.reload(), 600);
        }
      } catch (err: any) {
        console.error('Error al despachar respuesta:', err);
        if (typeof (window as any).showToast === 'function') {
          (window as any).showToast('Error de red al despachar la respuesta oficial.', 'error');
        }
      } finally {
        isSubmittingRespuesta = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          if (submitText) submitText.textContent = 'Confirmar y Enviar Respuesta Oficial';
        }
      }
    });

    // 7.3 Exportar Expediente a Google Drive (Estructura y Archivos sin comprimir)
    let isExportingDrive = false;
    async function handleExportToGoogleDrive(petId: string, radicado: string, clickedBtn: HTMLElement) {
      if (isExportingDrive) return;

      const allDriveBtns = document.querySelectorAll<HTMLButtonElement>(`.btn-export-drive[data-id="${petId}"]`);
      isExportingDrive = true;
      allDriveBtns.forEach((btn) => {
        btn.disabled = true;
        btn.innerHTML = `
          <svg class="spin-animation" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          <span>Creando carpetas y subiendo archivos a Drive...</span>
        `;
      });

      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast(`Iniciando respaldo de ${radicado} en Google Drive...`, 'info');
      }

      try {
        const res = await fetch('/api/exportar-drive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ peticionId: petId }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          if (data.missingConfig) {
            if (typeof (window as any).showToast === 'function') {
              (window as any).showToast(
                'Credenciales de Google Drive no configuradas en el servidor. Configure GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET y GOOGLE_DRIVE_REFRESH_TOKEN en el archivo .env o en Vercel.',
                'warning',
                'Aviso del Sistema'
              );
            }
          } else {
            const errorMsg = data.error || 'No se pudo exportar el expediente a Google Drive.';
            if (typeof (window as any).showToast === 'function') {
              (window as any).showToast(errorMsg, 'error', 'Error de Exportación');
            }
          }
          return;
        }

        // Éxito: Actualizar en memoria el drive url
        const pet = peticionesMap.get(petId) || allPeticiones.find((p) => p.id === petId);
        if (pet) {
          pet.respuesta_drive_url = data.webViewLink;
          indexPeticion(pet);
        }

        // Mostrar notificación Toast flotante con acciones directas
        showDriveSuccessToast(radicado, data.webViewLink, data.archivosSubidos || 0, data.subcarpetasCreadas || 0);

        if (typeof (window as any).showToast === 'function') {
          (window as any).showToast(`¡Expediente ${radicado} respaldado exitosamente en Google Drive!`, 'success');
        }

        allDriveBtns.forEach((btn) => {
          btn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00594E" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Respaldado en Drive</span>
          `;
          btn.style.background = '#E6EFEF';
          btn.style.borderColor = '#00594E';
          btn.style.color = '#00594E';
        });
      } catch (err: any) {
        console.error('Error al exportar a Google Drive:', err);
        if (typeof (window as any).showToast === 'function') {
          (window as any).showToast('Error de comunicación con el servicio de Google Drive.', 'error', 'Error de Conexión');
        }
      } finally {
        isExportingDrive = false;
        allDriveBtns.forEach((btn) => {
          btn.disabled = false;
        });
      }
    }

    function showDriveSuccessToast(radicado: string, webViewLink: string, archivosCount: number, subcarpetasCount: number) {
      const toast = document.getElementById('drive-success-toast');
      const openBtn = document.getElementById('btn-drive-open-link') as HTMLAnchorElement | null;
      const copyBtn = document.getElementById('btn-drive-copy-link');
      const copyText = document.getElementById('btn-drive-copy-text');
      const msg = document.getElementById('drive-toast-message');

      if (!toast) return;

      if (openBtn) openBtn.href = webViewLink;
      if (msg) {
        msg.textContent = `Se ha creado en Google Drive la carpeta "${radicado}" con ${archivosCount} archivo(s) organizados en ${subcarpetasCount} subcarpeta(s) sin comprimir.`;
      }

      if (copyBtn) {
        copyBtn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(webViewLink);
            if (copyText) copyText.textContent = '¡Enlace Copiado!';
            setTimeout(() => {
              if (copyText) copyText.textContent = 'Copiar Enlace';
            }, 3000);
          } catch {
            alert('Enlace de Drive: ' + webViewLink);
          }
        };
      }

      const closeBtn = document.getElementById('btn-close-drive-toast');
      if (closeBtn) {
        closeBtn.onclick = () => {
          toast.style.display = 'none';
        };
      }

      toast.style.display = 'block';
    }

    // 8. Auto-abrir carpeta si viene parámetro ?radicado=... o ?id=... en la URL
    const urlParams = new URLSearchParams(window.location.search);
    const targetQuery = urlParams.get('radicado') || urlParams.get('folderId') || urlParams.get('id');
    if (targetQuery) {
      openFolderDetail(targetQuery);
    }
}
