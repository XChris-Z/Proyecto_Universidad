// src/scripts/consulta-respuesta.ts - Lógica cliente del Portal de Consulta
export function initConsultaRespuesta(): void {
// Script de gestión interactiva del portal público /consulta-respuesta
  const authSection = document.getElementById('auth-section');
  const expedienteSection = document.getElementById('expediente-section');
  const expiredSection = document.getElementById('expired-section');

  const formAuth = document.getElementById('form-consulta-auth') as HTMLFormElement | null;
  const inputRadicado = document.getElementById('input-radicado') as HTMLInputElement | null;
  const inputEmail = document.getElementById('input-email') as HTMLInputElement | null;
  const inputPin = document.getElementById('input-pin') as HTMLInputElement | null;
  const btnSubmit = document.getElementById('btn-submit-auth') as HTMLButtonElement | null;
  const btnText = document.getElementById('btn-text');
  const errorBox = document.getElementById('auth-error-box');
  const errorMsg = document.getElementById('auth-error-msg');
  const btnLogout = document.getElementById('btn-logout');

  // 1. Prellenado automático desde URL (?radicado=...&correo=...&pin=...)
  function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const rad = (urlParams.get('radicado') || urlParams.get('rad') || '').trim().toUpperCase();
    const email = (urlParams.get('correo') || urlParams.get('email') || '').trim().toLowerCase();
    const pin = (urlParams.get('pin') || urlParams.get('codigo') || '').replace(/\s+/g, '').trim();

    if (rad && inputRadicado) inputRadicado.value = rad;
    if (email && inputEmail) inputEmail.value = email;
    if (pin && inputPin) inputPin.value = pin;

    if (rad && email && pin) {
      submitValidation(rad, email, pin);
    } else if (rad && email && inputPin) {
      inputPin.focus();
    }
  }

  // 2. Ejecutar validación contra /api/consultar-respuesta
  async function submitValidation(radicado: string, email: string, pin: string) {
    const cleanRad = String(radicado || '').trim().toUpperCase();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPin = String(pin || '').replace(/\s+/g, '').trim();

    if (btnSubmit) {
      btnSubmit.disabled = true;
      if (btnText) btnText.textContent = 'Verificando y validando vigencia (10 días)...';
    }
    if (errorBox) errorBox.style.display = 'none';

    try {
      const res = await fetch('/api/consultar-respuesta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radicado: cleanRad, correo: cleanEmail, email: cleanEmail, pin: cleanPin }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        if (data.code === 'EXPIRED') {
          showExpiredScreen(data.error || 'El periodo de 10 días para consultar este expediente ha vencido.');
          return;
        }

        if (errorBox && errorMsg) {
          errorMsg.textContent = data.error || 'Las credenciales ingresadas (Correo o Código de 6 dígitos) no coinciden con este radicado.';
          errorBox.style.display = 'flex';
        }
        return;
      }

      // Éxito: renderizar datos
      renderExpediente(data);
    } catch (err: any) {
      if (errorBox && errorMsg) {
        errorMsg.textContent = 'Error de conexión con el servidor institucional.';
        errorBox.style.display = 'flex';
      }
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        if (btnText) btnText.textContent = 'Consultar y Desbloquear Expediente';
      }
    }
  }

  // 3. Mostrar pantalla de caducidad
  function showExpiredScreen(message: string) {
    if (authSection) authSection.style.display = 'none';
    if (expedienteSection) expedienteSection.style.display = 'none';
    if (expiredSection) expiredSection.style.display = 'flex';
    const detailText = document.getElementById('expired-detail-text');
    if (detailText) detailText.textContent = message;
  }

  // 4. Renderizar Pantalla de Expediente Desbloqueado
  function renderExpediente(data: any) {
    const pet = data.peticion || {};
    const resp = data.respuesta || {};
    const subcarpetas = data.subcarpetas || [];
    const anexos = data.anexos || [];

    // Ocultar Auth y mostrar Expediente
    if (authSection) authSection.style.display = 'none';
    if (expiredSection) expiredSection.style.display = 'none';
    if (expedienteSection) expedienteSection.style.display = 'flex';

    // Banner de Vigencia Estricto (10 días)
    const dispVigenciaText = document.getElementById('disp-vigencia-text');
    if (dispVigenciaText) {
      const diasLeft = resp.dias_restantes ?? resp.remaining_days ?? 10;
      dispVigenciaText.textContent = `Acceso temporal activo • Disponible por ${diasLeft} día${diasLeft === 1 ? '' : 's'} más (Vence el ${resp.formatted_expira})`;
    }

    // Cabecera del pronunciamiento
    const dispRadicado = document.getElementById('disp-radicado');
    if (dispRadicado) dispRadicado.textContent = pet.numero_radicado || 'RAD-2026';

    const dispAsunto = document.getElementById('disp-asunto');
    if (dispAsunto) dispAsunto.textContent = pet.asunto || 'Sin asunto especificado';

    const dispFechaEmision = document.getElementById('disp-fecha-emision');
    if (dispFechaEmision) {
      const fechaFormat = resp.fecha_envio ? new Date(resp.fecha_envio).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Reciente';
      dispFechaEmision.textContent = `Fecha de emisión: ${fechaFormat}`;
    }

    const dispFuncionario = document.getElementById('disp-funcionario');
    if (dispFuncionario) dispFuncionario.textContent = resp.funcionario || 'Oficina de Correspondencia y Gestión Documental';

    const dispMensaje = document.getElementById('disp-mensaje-respuesta');
    if (dispMensaje) dispMensaje.textContent = resp.mensaje || 'Se ha resuelto formalmente su petición.';

    // Enlace a Drive si existe
    const driveBox = document.getElementById('drive-link-box');
    const driveBtn = document.getElementById('drive-link-btn') as HTMLAnchorElement | null;
    if (resp.drive_url && driveBox && driveBtn) {
      driveBox.style.display = 'flex';
      driveBtn.href = resp.drive_url;
    } else if (driveBox) {
      driveBox.style.display = 'none';
    }

    // Metadatos
    const dispSol = document.getElementById('disp-solicitante');
    if (dispSol) dispSol.textContent = pet.solicitante_nombre || '--';

    const dispTipoSol = document.getElementById('disp-tipo-sol');
    if (dispTipoSol) dispTipoSol.textContent = pet.solicitante_tipo || 'Ciudadano';

    const dispFechaRad = document.getElementById('disp-fecha-rad');
    if (dispFechaRad) {
      dispFechaRad.textContent = pet.fecha_radicacion ? new Date(pet.fecha_radicacion).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' }) : '--';
    }

    const dispCat = document.getElementById('disp-categoria');
    if (dispCat) dispCat.textContent = pet.categoria || 'Petición General';

    // Contador de archivos
    const dispTotalFiles = document.getElementById('disp-total-files');
    if (dispTotalFiles) {
      dispTotalFiles.textContent = `${anexos.length} archivo${anexos.length === 1 ? '' : 's'} disponible${anexos.length === 1 ? '' : 's'}`;
    }

    // Renderizar subcarpetas y anexos
    renderSubcarpetas(subcarpetas, anexos);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Helper para agrupar y renderizar subcarpetas en el portal del solicitante
  function renderSubcarpetas(subcarpetas: any[], anexos: any[]) {
    const container = document.getElementById('subcarpetas-container');
    if (!container) return;

    const validSubcarpetas = (subcarpetas || []).filter((s: any) => {
      const n = String(s?.nombre || '').trim();
      if (!n || n.toUpperCase().includes('RESPUESTA_META') || n.includes('{"') || n.includes('"}') || n.includes('","') || /^["']?[0-9a-f]{8}-/i.test(n)) {
        return false;
      }
      return true;
    });

    if (anexos.length === 0) {
      container.innerHTML = `
        <div style="background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 24px; text-align: center; color: #64748b; font-size: 0.84rem;">
          No se registraron documentos anexos descargables para este expediente. El pronunciamiento oficial consta en el texto superior.
        </div>
      `;
      return;
    }

    // 1. Identificar documento original (no anexo de oficina)
    const docOriginales = anexos.filter((a: any) => !a.es_anexo_oficina);
    const anexosOficinas = anexos.filter((a: any) => a.es_anexo_oficina);

    let html = '';

    // Si hay documento original de la petición
    if (docOriginales.length > 0) {
      html += `
        <div class="subcarpeta-bento-card open">
          <div class="subcarpeta-header">
            <div class="subcarpeta-title-group">
              <svg class="subcarpeta-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span class="subcarpeta-name">Documento Original de la Petición</span>
              <span class="subcarpeta-count-badge">${docOriginales.length} doc</span>
            </div>
            <svg class="chevron-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div class="subcarpeta-body">
            ${docOriginales.map((doc: any) => renderFileRow(doc)).join('')}
          </div>
        </div>
      `;
    }

    // 2. Si no hay subcarpetas estructuradas pero hay archivos de oficinas
    if (validSubcarpetas.length === 0 && anexosOficinas.length > 0) {
      html += `
        <div class="subcarpeta-bento-card open">
          <div class="subcarpeta-header">
            <div class="subcarpeta-title-group">
              <svg class="subcarpeta-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              <span class="subcarpeta-name">Soportes y Anexos Institucionales</span>
              <span class="subcarpeta-count-badge">${anexosOficinas.length} doc</span>
            </div>
            <svg class="chevron-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div class="subcarpeta-body">
            ${anexosOficinas.map((doc: any) => renderFileRow(doc)).join('')}
          </div>
        </div>
      `;
    } else {
      // 3. Ordenar carpetas de forma natural estricta y renderizar cada una
      validSubcarpetas.sort((a: any, b: any) => {
        const nombreA = String(a?.nombre ?? '').replace(/^subcarpeta\s+/i, '').trim();
        const nombreB = String(b?.nombre ?? '').replace(/^subcarpeta\s+/i, '').trim();
        return nombreA.localeCompare(nombreB, 'es', { numeric: true, sensitivity: 'base' });
      });

      validSubcarpetas.forEach((sub: any, idx: number) => {
        const rawName = String(sub.nombre || `${idx + 1}`).trim();
        const cleanName = rawName.replace(/^subcarpeta\s+/i, '').trim() || rawName;
        const subId = sub.id;

        // Archivos asociados a esta subcarpeta
        const subFiles = anexosOficinas.filter((a: any) => {
          if (a.subcarpeta_id && a.subcarpeta_id === subId) return true;
          const fileName = (a.nombre_archivo || '').toLowerCase();
          const cleanSub = cleanName.toLowerCase();
          return fileName.includes(`[${cleanSub}]`) || fileName.includes(`[subcarpeta ${cleanSub}]`);
        });

        html += `
          <div class="subcarpeta-bento-card open">
            <div class="subcarpeta-header">
              <div class="subcarpeta-title-group">
                <svg class="subcarpeta-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                <span class="subcarpeta-name">${cleanName}</span>
                <span class="subcarpeta-count-badge">${subFiles.length} soporte${subFiles.length === 1 ? '' : 's'}</span>
              </div>
              <svg class="chevron-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="subcarpeta-body">
              ${sub.descripcion ? `<div class="sub-instruction-text"><strong>Finalidad:</strong> ${sub.descripcion}</div>` : ''}
              ${subFiles.length > 0 
                ? subFiles.map((doc: any) => renderFileRow(doc)).join('')
                : `<div style="font-size: 0.78rem; color: #94a3b8; font-style: italic; padding: 6px 0;">No se registraron archivos de soporte adjuntos para esta subcarpeta.</div>`
              }
            </div>
          </div>
        `;
      });
    }

    container.innerHTML = html;

    // Toggle interactivo para desplegar/replegar subcarpetas
    container.querySelectorAll('.subcarpeta-header').forEach((hdr) => {
      hdr.addEventListener('click', () => {
        const card = hdr.closest('.subcarpeta-bento-card');
        if (card) card.classList.toggle('open');
      });
    });
  }

  function renderFileRow(doc: any): string {
    const rawName = String(doc?.nombre_archivo || 'Documento_Adjunto.pdf');
    // Limpiar tags [1.1], [Soportes Técnicos], etc. si existen
    const cleanDisplayName = rawName.replace(/^\[[^\]]+\]\s*/, '').trim();
    const downloadUrl = doc?.download_url || '#';
    const fecha = doc?.created_at ? new Date(doc.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    const oficina = doc?.oficina_nombre ? String(doc.oficina_nombre).trim() : '';
    const observacion = doc?.observacion ? String(doc.observacion).trim() : '';
    const fileTitle = oficina ? `[Aporte de: ${oficina}] - ${cleanDisplayName}` : cleanDisplayName;

    return `
      <div class="file-item-row">
        <div class="file-left">
          <svg class="file-item-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <div style="flex: 1; min-width: 0;">
            <div class="file-name" style="word-break: break-all; font-weight: 700;">${fileTitle}</div>
            <div class="file-meta" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 3px;">
              ${oficina ? `<span class="file-office-badge">Aporte de: ${oficina}</span>` : ''}
              ${fecha ? `<span>Radicado el: ${fecha}</span>` : ''}
            </div>
            ${observacion ? `<div style="font-size: 0.75rem; color: var(--uni-text-muted); font-style: italic; margin-top: 4px; line-height: 1.4;">&ldquo;${observacion}&rdquo;</div>` : ''}
          </div>
        </div>
        <a href="${downloadUrl}" download="${cleanDisplayName}" class="btn-download-clean" target="_blank" rel="noopener noreferrer" title="Descargar documento">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Descargar</span>
        </a>
      </div>
    `;
  }

  // Listeners
  formAuth?.addEventListener('submit', (e) => {
    e.preventDefault();
    const rad = inputRadicado ? inputRadicado.value.trim().toUpperCase() : '';
    const email = inputEmail ? inputEmail.value.trim().toLowerCase() : '';
    const pin = inputPin ? inputPin.value.replace(/\s+/g, '').trim() : '';
    if (!rad || !email || !pin) return;
    submitValidation(rad, email, pin);
  });

  btnLogout?.addEventListener('click', () => {
    if (expedienteSection) expedienteSection.style.display = 'none';
    if (authSection) authSection.style.display = 'flex';
    if (inputPin) inputPin.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Ejecutar verificación de params al cargar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkUrlParams);
  } else {
    checkUrlParams();
  }
}
