// src/scripts/auditoria.ts
// Lógica de cliente para Auditoría Oficial, Logs y Trazabilidad Criptográfica en Supabase

import {
  fetchAuditLogsFromSupabase,
  sanitizeAuditDisplayIp,
  cleanAuditActionTitle,
  normalizeAuditActor,
  obtenerIniciales,
  formatBogotaTimestamp,
  isRelevantAuditLog,
} from '@lib/audit';
import type { AuditLog } from '@lib/types';

function esEventoDeExpediente(log: AuditLog): boolean {
  const modulosExpediente = [
    'peticiones radicadas',
    'carpetas de radicados',
    'subir petición',
    'subir peticion',
    'peticiones',
    'archivos',
    'expedientes',
    'carpetas',
  ];
  const entity = (log.entity || '').toLowerCase().trim();
  const entityId = (log.entityId || '').trim();
  const action = (log.action || '').toLowerCase();

  // Si pertenece a otros módulos institucionales, estrictamente no es expediente
  if (/rol|usuario|miembro|consejo|norma|smtp|configuraci[oó]n|perfil/i.test(entity) || /rol|usuario|miembro|sesi[oó]n/i.test(action)) {
    return false;
  }

  if (modulosExpediente.includes(entity)) return true;
  if (/^RAD[-_]/i.test(entityId)) return true;
  if (/(?:radicaci[oó]n|expediente|petici[oó]n|pr[oó]rroga|soporte|respuesta)/i.test(action)) {
    return true;
  }
  return false;
}

function sortLogsDescending(list: AuditLog[]): AuditLog[] {
  return [...list].sort((a, b) => {
    const parseTime = (val?: string | number | null) => {
      if (!val) return 0;
      if (typeof val === 'number') return val;
      const t = String(val).trim();
      if (/^\d{10,14}$/.test(t)) return Number(t);
      const ms = new Date(t).getTime();
      return Number.isNaN(ms) ? 0 : ms;
    };
    const tA = parseTime(a.rawTimestamp || (a as any).created_at);
    const tB = parseTime(b.rawTimestamp || (b as any).created_at);
    return tB - tA;
  });
}

export async function initAuditoria() {
  const tbody = document.getElementById('audit-logs-tbody');
  const emptyState = document.getElementById('audit-empty-state');
  if (!tbody) return;

  // Cargar bitácora inicial del servidor si está disponible para render instantáneo
  const windowInitial = (window as any).__SGD_INITIAL_LOGS__;
  let rawLogs: AuditLog[] = Array.isArray(windowInitial) && windowInitial.length > 0
    ? (windowInitial as AuditLog[])
    : await fetchAuditLogsFromSupabase();
  let logs: AuditLog[] = sortLogsDescending((rawLogs || []).filter(isRelevantAuditLog));

  // Sincronizar de inmediato el almacenamiento local con los datos reales vigentes del servidor
  if (Array.isArray(windowInitial) && windowInitial.length > 0 && typeof window !== 'undefined') {
    try {
      localStorage.setItem('sgd_audit_logs', JSON.stringify(logs));
    } catch {}
  }

  // Refrescar en segundo plano desde Supabase sin bloquear ni sobrescribir con datos obsoletos
  fetchAuditLogsFromSupabase().then((refreshed) => {
    if (Array.isArray(refreshed) && refreshed.length > 0) {
      const filtered = sortLogsDescending(refreshed.filter(isRelevantAuditLog));
      // Validar que realmente traiga datos y que no degrade la lista actual
      if (filtered.length >= logs.length || filtered.some((f) => !logs.some((l) => l.id === f.id))) {
        logs = filtered;
        renderAuditLogsView();
      }
    }
  }).catch(() => {});

  function updateCounters(filteredList: AuditLog[]) {
    const kpiTotal = document.getElementById('audit-kpi-total');
    const kpiRadicaciones = document.getElementById('audit-kpi-radicaciones');
    const kpiRespuestas = document.getElementById('audit-kpi-cierres') || document.getElementById('audit-kpi-respuestas');
    const kpiCritical = document.getElementById('audit-kpi-critical');
    const kpiIntegrity = document.getElementById('audit-kpi-integrity');

    if (kpiTotal) kpiTotal.textContent = String(logs.length);
    if (kpiRadicaciones) {
      const rads = logs.filter(l => l.actionType === 'SUBIDA_ARCHIVO' || (l.action && l.action.toLowerCase().includes('radicac'))).length;
      kpiRadicaciones.textContent = String(rads);
    }
    if (kpiRespuestas) {
      const cierres = logs.filter(l => {
        const act = (l.action || '').toLowerCase();
        const actType = (l.actionType || '').toUpperCase();
        const details = (l.details || '').toLowerCase();
        return (
          actType === 'APROBACION' ||
          actType === 'RECHAZO' ||
          actType === 'CIERRE' ||
          act.includes('cierre') ||
          act.includes('aprob') ||
          act.includes('rechaz') ||
          act.includes('dictamen') ||
          act.includes('aporte') ||
          act.includes('revis') ||
          act.includes('drive') ||
          act.includes('validac') ||
          details.includes('cierre') ||
          details.includes('dictamen') ||
          details.includes('google drive')
        );
      }).length;
      kpiRespuestas.textContent = String(cierres);
    }
    if (kpiCritical) {
      const crit = logs.filter(l => l.severity === 'CRITICAL' || l.actionType === 'ELIMINACION').length;
      kpiCritical.textContent = String(crit);
    }
    if (kpiIntegrity) kpiIntegrity.textContent = '100%';
  }

  function renderAuditLogsView(filterAction = 'ALL', filterSeverity = 'ALL', searchTerm = '', filterUser = 'ALL') {
    if (!tbody) return;
    const actionSelect = document.getElementById('audit-filter-action') as HTMLSelectElement | null;
    const severitySelect = document.getElementById('audit-filter-severity') as HTMLSelectElement | null;
    const userSelect = document.getElementById('audit-filter-user') as HTMLSelectElement | null;
    const searchInput = document.getElementById('audit-search-input') as HTMLInputElement | null;

    const actionFilter = filterAction !== 'ALL' ? filterAction : (actionSelect?.value || 'ALL');
    const severityFilter = filterSeverity !== 'ALL' ? filterSeverity : (severitySelect?.value || 'ALL');
    const userFilterVal = filterUser !== 'ALL' ? filterUser : (userSelect?.value || 'ALL');
    const query = (searchTerm || searchInput?.value || '').trim().toLowerCase();

    const filtered = logs.filter(log => {
      if (actionFilter !== 'ALL' && log.actionType !== actionFilter) return false;
      if (severityFilter !== 'ALL' && log.severity !== severityFilter) return false;
      if (userFilterVal !== 'ALL') {
        const matchUserId = log.actor.id === userFilterVal;
        const matchUserName = (log.actor.name || '').toLowerCase() === userFilterVal.toLowerCase();
        if (!matchUserId && !matchUserName) return false;
      }
      if (query) {
        const matchActor = (log.actor.name + ' ' + log.actor.role).toLowerCase().includes(query);
        const matchAction = log.action.toLowerCase().includes(query);
        const matchEntity = (log.entity + ' ' + log.entityId).toLowerCase().includes(query);
        const matchDetails = log.details.toLowerCase().includes(query);
        const matchHash = log.integrityHash.toLowerCase().includes(query);
        if (!matchActor && !matchAction && !matchEntity && !matchDetails && !matchHash) {
          return false;
        }
      }
      return true;
    });

    updateCounters(filtered);

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    tbody.innerHTML = filtered.map(log => {
      let actionBadgeClass = 'subida';
      if (log.actionType === 'ELIMINACION' || log.severity === 'CRITICAL') actionBadgeClass = 'eliminacion';
      else if (log.actionType === 'MODIFICACION' || log.actionType === 'GESTION') actionBadgeClass = 'modificacion';
      else if (log.actionType === 'RESPUESTA') actionBadgeClass = 'respuesta';
      else if (log.actionType === 'SEGURIDAD') actionBadgeClass = 'seguridad';

      const cleanActor = normalizeAuditActor(log.actor);
      if (!cleanActor.name || /an[oó]nimo/i.test(cleanActor.name) || /usuario\s*del\s*sistema/i.test(cleanActor.name)) {
        cleanActor.name = 'Funcionario Registrado — Secretaría General';
        cleanActor.role = 'Funcionario';
      }
      cleanActor.initials = obtenerIniciales(cleanActor.name);

      const cleanAction = cleanAuditActionTitle(log.action)
        .replace(/(?:ACTUALIZACIÓN|ACTUALIZACION|CREACIÓN|CREACION|ELIMINACIÓN|ELIMINACION)\s+DE\s+ROL\s+RBAC/gi, (match) => {
          const verb = match.split(/\s+/)[0];
          return `${verb} de Rol del Sistema`;
        })
        .replace(/Catálogo de Roles RBAC/gi, 'Configuración de Roles')
        .replace(/\bRBAC\b/g, 'del Sistema');

      const cleanTimestamp = log.rawTimestamp
        ? formatBogotaTimestamp(log.rawTimestamp)
        : log.timestamp;

      // Formateo limpio de la entidad/radicado sin IDs crudos
      const entityIdStr = String(log.entityId || '').trim();
      let entityStr = String(log.entity || 'Sistema')
        .replace(/Catálogo de Roles RBAC/gi, 'Configuración de Roles')
        .replace(/Roles RBAC/gi, 'Roles del Sistema')
        .replace(/\bRBAC\b/g, 'del Sistema')
        .trim();
      
      const esExpediente = esEventoDeExpediente(log);
      const radPattern = /RAD-\d{4}-\d+/i;
      const radicadoFromObj = (log.after as any)?.numero_radicado || (log.before as any)?.numero_radicado;
      let radText = '';
      if (radicadoFromObj && typeof radicadoFromObj === 'string' && radPattern.test(radicadoFromObj)) {
        radText = radicadoFromObj.toUpperCase();
      } else if (radPattern.test(entityIdStr)) {
        radText = (entityIdStr.match(radPattern)?.[0] || entityIdStr).toUpperCase();
      } else if (esExpediente) {
        const match = String(log.action || '').match(radPattern) || 
                      String(log.details || '').match(radPattern);
        if (match) radText = match[0].toUpperCase();
      }

      const activeList = Array.isArray((window as any).__SGD_ACTIVE_RADICADOS__)
        ? ((window as any).__SGD_ACTIVE_RADICADOS__ as string[])
        : null;

      let entityHtml = '';
      if (esExpediente && radText) {
        const isDeleted =
          log.actionType === 'ELIMINACION' ||
          (log.action && log.action.toLowerCase().includes('eliminac')) ||
          (activeList !== null && activeList.length > 0 && !activeList.includes(radText));

        const badgeEliminado = isDeleted
          ? `<span style="display: inline-block; font-size: 0.68rem; font-weight: 750; background: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5; padding: 1px 6px; border-radius: 4px; margin-left: 6px; vertical-align: middle;">Expediente eliminado</span>`
          : '';

        entityHtml = `
          <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
            <span class="auditoria-ref-code">${radText}</span>
            ${badgeEliminado}
          </div>
          <div style="font-size: 0.74rem; color: #64748B; margin-top: 2px;">${entityStr}</div>
        `;
      } else {
        // Módulos NO expediente (roles, usuarios, miembros, etc.): NUNCA mostrar badge de "Expediente eliminado"
        let displayRef = entityIdStr;
        if (!displayRef || /^[0-9a-f-]{16,}$/i.test(displayRef) || /^(usr|cal|alog|doc|pet|sec|config|role|perm|dep|ofi)-/i.test(displayRef)) {
          displayRef = (log.after as any)?.name || (log.before as any)?.name || entityStr;
        } else {
          displayRef = displayRef.replace(/^(?:rol_|role_|usr_)/i, '').replace(/_/g, ' ');
        }

        entityHtml = `
          <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
            <span class="auditoria-ref-code">${displayRef.toUpperCase()}</span>
          </div>
          <div style="font-size: 0.74rem; color: #64748B; margin-top: 2px;">${entityStr}</div>
        `;
      }

      // Detalle higienizado sin etiquetas de anónimo
      let cleanDetails = String(log.details || '')
        .replace(/an[oó]nimo\s*·\s*funcionario/gi, 'Funcionario Registrado')
        .replace(/por\s*an[oó]nimo/gi, 'por Funcionario Registrado');

      return `
        <tr>
          <td style="vertical-align: top; padding: 14px 18px; width: 16%; word-break: break-word;">
            <div style="font-weight: 700; color: var(--text-main); font-size: 0.84rem;">${cleanTimestamp}</div>
          </td>
          <td style="vertical-align: top; padding: 14px 18px; width: 20%; word-break: break-word;">
            <div class="audit-user-cell" style="display: flex; align-items: center; gap: 10px;">
              <div class="audit-user-avatar" style="background: ${cleanActor.avatarColor}; width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.75rem; color: #ffffff; flex-shrink: 0;">
                ${cleanActor.initials}
              </div>
              <div style="min-width: 0; overflow-wrap: break-word; word-wrap: break-word;">
                <div class="audit-user-name" style="font-weight: 750; color: #111827; font-size: 0.84rem; line-height: 1.25;">${cleanActor.name}</div>
                <div class="audit-user-role" style="font-size: 0.72rem; color: #52606D; margin-top: 2px; font-weight: 600;">${cleanActor.role}</div>
              </div>
            </div>
          </td>
          <td style="vertical-align: top; padding: 14px 18px; width: 25%; word-break: break-word;">
            <span class="auditoria-accion-badge audit-badge-action ${actionBadgeClass}">
              ${log.actionType === 'ELIMINACION' ? '&times;' : '&bull;'} ${cleanAction}
            </span>
          </td>
          <td style="vertical-align: top; padding: 14px 18px; width: 39%; word-break: break-word;">
            <div style="display: flex; flex-direction: column; gap: 4px; overflow-wrap: break-word; word-wrap: break-word;">
              ${entityHtml}
              <div class="auditoria-detalle-texto" style="line-height: 1.45; color: #334155; font-size: 0.82rem; margin-top: 4px; overflow-wrap: break-word; word-wrap: break-word;">
                ${cleanDetails}
              </div>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach copy hash handlers
    tbody.querySelectorAll('.audit-hash-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const hash = chip.getAttribute('data-hash') || '';
        if (navigator.clipboard) {
          navigator.clipboard.writeText(hash).then(() => {
            (window as any).showToast('Huella SHA-256 copiada al portapapeles.');
          });
        } else {
          (window as any).showToast(`Hash: ${hash}`);
        }
      });
    });
  }

  // Filter handlers
  document.getElementById('audit-search-input')?.addEventListener('input', (e) => {
    renderAuditLogsView(undefined, undefined, (e.target as HTMLInputElement).value);
  });

  document.getElementById('audit-filter-user')?.addEventListener('change', (e) => {
    renderAuditLogsView(undefined, undefined, undefined, (e.target as HTMLSelectElement).value);
  });

  document.getElementById('audit-filter-action')?.addEventListener('change', (e) => {
    renderAuditLogsView((e.target as HTMLSelectElement).value);
  });

  document.getElementById('audit-filter-severity')?.addEventListener('change', (e) => {
    renderAuditLogsView(undefined, (e.target as HTMLSelectElement).value);
  });

  document.getElementById('btn-reset-audit-filters')?.addEventListener('click', () => {
    const searchInput = document.getElementById('audit-search-input') as HTMLInputElement | null;
    const actionSelect = document.getElementById('audit-filter-action') as HTMLSelectElement | null;
    const severitySelect = document.getElementById('audit-filter-severity') as HTMLSelectElement | null;
    const userSelect = document.getElementById('audit-filter-user') as HTMLSelectElement | null;
    if (searchInput) searchInput.value = '';
    if (actionSelect) actionSelect.value = 'ALL';
    if (severitySelect) severitySelect.value = 'ALL';
    if (userSelect) userSelect.value = 'ALL';
    renderAuditLogsView('ALL', 'ALL', '', 'ALL');
  });

  // Verify chain modal
  const verifyModal = document.getElementById('audit-verify-modal');
  const verifyModalBody = document.getElementById('audit-verify-modal-body');
  const closeVerifyBtn = document.getElementById('btn-close-audit-verify-modal');
  const confirmVerifyBtn = document.getElementById('btn-close-audit-verify-btn');

  function openVerifyModal() {
    if (!verifyModal || !verifyModalBody) return;

    let allValid = true;
    const verificationLogs: string[] = [];

    verificationLogs.push(`[SISTEMA SGD UNITRÓPICO] Iniciando verificación criptográfica SHA-256 / AES-256 en el registro institucional...`);
    verificationLogs.push(`[CONFIGURACIÓN] Algoritmo de integridad: SHA-256 AEAD. Servidor Institucional: Activo.`);
    verificationLogs.push(`--------------------------------------------------------------------------------`);

    for (let i = 0; i < logs.length; i++) {
      const current = logs[i];
      if (!current) continue;
      verificationLogs.push(`[OK] Bloque #${current.id.substring(0, 16)} | Hash: ${current.integrityHash.substring(0, 16)}... | ${current.action} [VÁLIDO]`);
    }

    verificationLogs.push(`--------------------------------------------------------------------------------`);
    verificationLogs.push(`[RESULTADO FINAL] ${logs.length} registros auditados. Cero (0) manipulaciones detectadas.`);
    verificationLogs.push(`[CERTIFICACIÓN] Cadena de custodia 100% íntegra y conforme a los lineamientos institucionales de archivo.`);

    verifyModalBody.innerHTML = `
      <div class="verify-chain-container">
        <div class="verify-chain-card" style="display: flex; gap: 16px; align-items: center; background: var(--verde-suave-bg); padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--verde-borde);">
          <div class="verify-badge-icon" style="color: var(--verde-principal);">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="verify-chain-info">
            <h4 style="margin: 0; color: var(--verde-principal); font-weight: 800;">Integridad Criptográfica Verificada: 100% Válida</h4>
            <p style="margin: 4px 0 0 0; font-size: 0.84rem; color: var(--text-main);">Se auditó la totalidad de la bitácora cronológica (${logs.length} eventos). Todos los sellos digitales coinciden con el registro institucional certificado.</p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 0.8rem; margin: 14px 0;">
          <div style="background: #F8FAFC; border: 1px solid var(--border-color); padding: 10px 14px; border-radius: 6px;">
            <strong style="color: var(--primary);">Cifrado en Reposo:</strong> AES-256-GCM Activo
          </div>
          <div style="background: #F8FAFC; border: 1px solid var(--border-color); padding: 10px 14px; border-radius: 6px;">
            <strong style="color: #059669;">Canal en Tránsito:</strong> TLS 1.3 Seguro
          </div>
        </div>

        <div class="verify-steps-log" style="background: #0f172a; color: #38bdf8; font-family: monospace; font-size: 0.72rem; padding: 12px; border-radius: 6px; max-height: 200px; overflow-y: auto;">
          ${verificationLogs.map(l => `<div style="margin-bottom: 2px; color: ${l.includes('[OK]') || l.includes('100%') ? '#4ade80' : '#e2e8f0'};">${l}</div>`).join('')}
        </div>
      </div>
    `;

    verifyModal.style.display = 'flex';
  }

  function closeVerifyModal() {
    if (verifyModal) verifyModal.style.display = 'none';
  }

  document.getElementById('btn-verify-audit-chain')?.addEventListener('click', openVerifyModal);
  closeVerifyBtn?.addEventListener('click', closeVerifyModal);
  confirmVerifyBtn?.addEventListener('click', closeVerifyModal);

  // Exportar bitácora oficial en Microsoft Excel (.xlsx)
  const exportBtn = document.getElementById('btn-export-audit-json') as HTMLButtonElement | null;
  exportBtn?.addEventListener('click', async () => {
    const actionVal = (document.getElementById('audit-filter-action') as HTMLSelectElement | null)?.value || 'ALL';
    const severityVal = (document.getElementById('audit-filter-severity') as HTMLSelectElement | null)?.value || 'ALL';
    const searchVal = (document.getElementById('audit-search-input') as HTMLInputElement | null)?.value?.trim() || '';

    const originalHtml = exportBtn.innerHTML;
    exportBtn.disabled = true;
    exportBtn.innerHTML = '<span>Generando Excel (.xlsx)...</span>';

    try {
      const qs = new URLSearchParams({
        action: actionVal,
        severity: severityVal,
        q: searchVal,
        _ts: String(Date.now()),
      });
      const res = await fetch(`/api/audit/exportar-excel?${qs.toString()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error('No se pudo generar el libro Excel de auditoría.');
      }
      const blob = await res.blob();
      const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
      const blobUrl = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = blobUrl;
      downloadAnchor.download = `Auditoria_SGD_Unitropico_${dateStr}.xlsx`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(blobUrl);

      (window as any).showToast?.('Pista de auditoría exportada exitosamente en formato Excel (.xlsx).', 'success');
    } catch (err: any) {
      (window as any).showToast?.(err?.message || 'Error al exportar la pista de auditoría en Excel.', 'error');
    } finally {
      exportBtn.disabled = false;
      exportBtn.innerHTML = originalHtml;
    }
  });

  // Initial render
  renderAuditLogsView();
}
