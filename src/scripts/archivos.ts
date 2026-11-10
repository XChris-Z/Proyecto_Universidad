// src/scripts/archivos.ts
// Lógica de cliente para el Módulo de Archivos y Gestión Documental

import { documents, DEFAULT_RESPONSE_TEMPLATES } from '@data/documents';
import { INSTITUTIONAL_USERS } from '@data/users';
import { calculateDeadlineProgress } from '@lib/utils';
import { logSystemActivity } from '@lib/audit';
import type { Document } from '@lib/types';

let currentFilter = 'all';
let selectedDocForReassign: Document | null = null;
let selectedDocForResponse: Document | null = null;
let selectedDocForPreview: Document | null = null;

export function initArchivos() {
  const tbody = document.getElementById('documents-table-body');
  const filterTabs = document.querySelectorAll('.filter-tab');

  function updateCounts() {
    const total = documents.length;
    const pending = documents.filter(d => d.responseStatus === 'pendiente').length;
    const responded = documents.filter(d => d.responseStatus === 'respondida').length;
    
    let safe = 0;
    let warn = 0;
    let critical = 0;

    documents.forEach(d => {
      const p = calculateDeadlineProgress(d.uploadDate, d.dueDate);
      if (p.percentage < 50) safe++;
      else if (p.percentage <= 80) warn++;
      else critical++;
    });

    const elAll = document.getElementById('count-all');
    const elPending = document.getElementById('count-pending');
    const elResponded = document.getElementById('count-responded');
    const elSafe = document.getElementById('count-safe');
    const elWarn = document.getElementById('count-warn');
    const elCritical = document.getElementById('count-critical');

    if (elAll) elAll.textContent = String(total);
    if (elPending) elPending.textContent = String(pending);
    if (elResponded) elResponded.textContent = String(responded);
    if (elSafe) elSafe.textContent = String(safe);
    if (elWarn) elWarn.textContent = String(warn);
    if (elCritical) elCritical.textContent = String(critical);
  }

  function renderTable() {
    if (!tbody) return;
    tbody.innerHTML = '';

    const filtered = documents.filter(doc => {
      if (currentFilter === 'all') return true;
      if (currentFilter === 'pending') return doc.responseStatus === 'pendiente';
      if (currentFilter === 'responded') return doc.responseStatus === 'respondida';
      const p = calculateDeadlineProgress(doc.uploadDate, doc.dueDate);
      if (currentFilter === 'safe') return p.percentage < 50;
      if (currentFilter === 'warn') return p.percentage >= 50 && p.percentage <= 80;
      if (currentFilter === 'critical') return p.percentage > 80;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 36px; color: var(--text-muted);">
            No se encontraron expedientes para el filtro seleccionado.
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(doc => {
      const progress = calculateDeadlineProgress(doc.uploadDate, doc.dueDate);
      const responsible = INSTITUTIONAL_USERS.find(u => u.id === doc.responsibleId) || INSTITUTIONAL_USERS[0]!;
      const isResponded = doc.responseStatus === 'respondida';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="doc-icon-badge ${doc.format}" style="width: 34px; height: 34px; font-size: 0.68rem;">
              <span>${doc.format.toUpperCase()}</span>
            </div>
            <div>
              <div style="font-weight: 700; font-size: 0.88rem; color: var(--text-main);">${doc.title}</div>
              <div style="font-size: 0.74rem; color: var(--text-muted);">
                ${doc.category} &bull; ${doc.applicant}
              </div>
            </div>
          </div>
        </td>
        <td>
          <span style="font-family: monospace; font-size: 0.82rem; font-weight: 700; color: var(--primary);">
            ${doc.radicado}
          </span>
        </td>
        <td>
          <div style="font-size: 0.78rem;">
            <div>Rad: <strong>${doc.uploadDate}</strong></div>
            <div style="color: var(--text-muted);">Vence: ${doc.dueDate}</div>
          </div>
        </td>
        <td>
          <div style="min-width: 140px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.74rem; margin-bottom: 3px;">
              <span class="badge ${progress.statusClass}" style="font-size: 0.68rem; padding: 1px 6px; border-radius: 4px;">
                ${progress.statusBadge}
              </span>
              <span>${progress.percentage}%</span>
            </div>
            <div class="dist-progress-bg" style="height: 6px;">
              <div class="dist-progress-fill" style="width: ${progress.percentage}%; background: ${progress.percentage > 80 ? 'var(--status-critical)' : progress.percentage > 50 ? 'var(--status-warn)' : 'var(--status-safe)'};"></div>
            </div>
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 28px; height: 28px; border-radius: 50%; background: ${responsible.avatarColor}; color: #fff; font-size: 0.72rem; font-weight: 700; display: flex; align-items: center; justify-content: center;">
              ${responsible.initials}
            </div>
            <div style="font-size: 0.8rem;">
              <div style="font-weight: 600; color: var(--text-main);">${responsible.name}</div>
              <div style="font-size: 0.7rem; color: var(--text-muted);">${responsible.role}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="badge-response-status ${isResponded ? 'responded' : 'pending'}" style="font-size: 0.72rem; padding: 4px 8px; border-radius: 4px;">
            ${isResponded ? '✓ Respondida' : '⏳ Pendiente'}
          </span>
        </td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 6px;">
            <button type="button" class="btn btn-ghost btn-sm btn-action-preview" data-doc-id="${doc.id}" title="Ver expediente">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button type="button" class="btn btn-secondary btn-sm btn-action-reassign" data-doc-id="${doc.id}" title="Reasignar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </button>
            ${!isResponded ? `
              <button type="button" class="btn btn-primary btn-sm btn-action-respond" data-doc-id="${doc.id}" title="Responder">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              </button>
            ` : ''}
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    attachTableActions();
  }

  function attachTableActions() {
    document.querySelectorAll('.btn-action-preview').forEach(btn => {
      btn.addEventListener('click', () => {
        const docId = btn.getAttribute('data-doc-id');
        const doc = documents.find(d => d.id === docId);
        if (doc) openPreviewModal(doc);
      });
    });

    document.querySelectorAll('.btn-action-reassign').forEach(btn => {
      btn.addEventListener('click', () => {
        const docId = btn.getAttribute('data-doc-id');
        const doc = documents.find(d => d.id === docId);
        if (doc) openReassignModal(doc);
      });
    });

    document.querySelectorAll('.btn-action-respond').forEach(btn => {
      btn.addEventListener('click', () => {
        const docId = btn.getAttribute('data-doc-id');
        const doc = documents.find(d => d.id === docId);
        if (doc) openResponseModal(doc);
      });
    });
  }

  // Filter Tabs click
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.getAttribute('data-filter') || 'all';
      renderTable();
    });
  });

  // Reassign Modal logic
  const reassignModal = document.getElementById('reassign-modal');
  const reassignDocName = document.getElementById('reassign-doc-name');
  const userPickerContainer = document.getElementById('user-picker-container');
  const userSearchInput = document.getElementById('user-search-input') as HTMLInputElement | null;
  let selectedUserIdForReassign: string | null = null;

  function openReassignModal(doc: Document) {
    selectedDocForReassign = doc;
    selectedUserIdForReassign = doc.responsibleId;
    if (reassignDocName) reassignDocName.textContent = doc.title;
    renderUserPicker();
    if (reassignModal) reassignModal.style.display = 'flex';
  }

  function renderUserPicker(search = '') {
    if (!userPickerContainer) return;
    userPickerContainer.innerHTML = '';
    const q = search.toLowerCase();

    INSTITUTIONAL_USERS.filter(u => u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q)).forEach(u => {
      const isSelected = u.id === selectedUserIdForReassign;
      const card = document.createElement('div');
      card.className = `user-picker-card ${isSelected ? 'selected' : ''}`;
      card.style.cssText = `
        padding: 10px 14px; border: 1px solid ${isSelected ? 'var(--primary)' : 'var(--border-color)'};
        border-radius: 8px; margin-bottom: 6px; cursor: pointer; display: flex;
        align-items: center; justify-content: space-between; background: ${isSelected ? 'var(--primary-subtle)' : 'var(--bg-surface)'};
      `;
      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 32px; height: 32px; border-radius: 50%; background: ${u.avatarColor}; color: #fff; font-size: 0.78rem; font-weight: 700; display: flex; align-items: center; justify-content: center;">
            ${u.initials}
          </div>
          <div>
            <div style="font-weight: 700; font-size: 0.88rem; color: var(--text-main);">${u.name}</div>
            <div style="font-size: 0.74rem; color: var(--text-muted);">${u.role}</div>
          </div>
        </div>
        ${isSelected ? '<span style="color: var(--primary); font-weight: 800;">✓</span>' : ''}
      `;
      card.addEventListener('click', () => {
        selectedUserIdForReassign = u.id;
        renderUserPicker(userSearchInput?.value || '');
      });
      userPickerContainer.appendChild(card);
    });
  }

  userSearchInput?.addEventListener('input', () => {
    renderUserPicker(userSearchInput.value);
  });

  document.getElementById('btn-close-reassign-modal')?.addEventListener('click', () => {
    if (reassignModal) reassignModal.style.display = 'none';
  });

  document.getElementById('btn-cancel-reassign')?.addEventListener('click', () => {
    if (reassignModal) reassignModal.style.display = 'none';
  });

  document.getElementById('btn-save-reassignment')?.addEventListener('click', () => {
    if (selectedDocForReassign && selectedUserIdForReassign) {
      const oldId = selectedDocForReassign.responsibleId;
      selectedDocForReassign.responsibleId = selectedUserIdForReassign;
      const newResponsible = INSTITUTIONAL_USERS.find(u => u.id === selectedUserIdForReassign);

      logSystemActivity({
        actor: window.currentLoggedUser,
        action: 'Reasignación de Custodia de Expediente',
        actionType: 'MODIFICACION',
        entity: 'Expediente Documental',
        entityId: selectedDocForReassign.radicado,
        details: `Custodia transferida a: ${newResponsible?.name || 'Desconocido'}.`,
        severity: 'WARN'
      });

      window.showToast(`Expediente reasignado exitosamente a ${newResponsible?.name}`);
      if (reassignModal) reassignModal.style.display = 'none';
      renderTable();
    }
  });

  // Preview Modal logic
  const previewModal = document.getElementById('preview-modal');
  const previewModalContent = document.getElementById('preview-modal-content');
  const tabBtnDoc = document.getElementById('tab-btn-preview-doc');
  const tabBtnResp = document.getElementById('tab-btn-preview-response');
  const respTabBadge = document.getElementById('preview-response-tab-badge');
  let currentPreviewTab = 'doc';

  function openPreviewModal(doc: Document) {
    selectedDocForPreview = doc;
    currentPreviewTab = 'doc';
    tabBtnDoc?.classList.add('active');
    tabBtnResp?.classList.remove('active');

    if (respTabBadge) {
      respTabBadge.textContent = doc.responseStatus === 'respondida' ? 'Respondida' : 'Pendiente';
      respTabBadge.className = `tab-badge ${doc.responseStatus === 'respondida' ? 'badge-safe' : 'badge-warn'}`;
    }

    renderPreviewContent();
    if (previewModal) previewModal.style.display = 'flex';
  }

  function renderPreviewContent() {
    if (!previewModalContent || !selectedDocForPreview) return;
    const doc = selectedDocForPreview;

    if (currentPreviewTab === 'doc') {
      previewModalContent.innerHTML = `
        <div style="background: var(--bg-surface-elevated); padding: 18px; border-radius: 8px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
            <div>
              <span class="badge" style="background: var(--primary-subtle); color: var(--primary); font-size: 0.74rem;">${doc.category}</span>
              <h3 style="font-size: 1.1rem; color: var(--text-main); margin-top: 6px;">${doc.title}</h3>
            </div>
            <span style="font-family: monospace; font-size: 0.88rem; font-weight: 700; color: var(--primary);">${doc.radicado}</span>
          </div>
          <p style="font-size: 0.84rem; color: var(--text-muted);">${doc.notes || 'Sin observaciones adicionales registradas.'}</p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; font-size: 0.82rem;">
          <div><strong>Solicitante:</strong> ${doc.applicant} (${doc.applicantType})</div>
          <div><strong>Fundamento legal:</strong> ${doc.originRight}</div>
          <div><strong>Fecha Radicación:</strong> ${doc.uploadDate}</div>
          <div><strong>Fecha Plazo:</strong> ${doc.dueDate}</div>
          <div><strong>Archivo digital:</strong> ${doc.fileName} (${doc.size})</div>
          <div><strong>Prioridad:</strong> ${doc.priority}</div>
        </div>
      `;
    } else {
      if (doc.response) {
        previewModalContent.innerHTML = `
          <div style="border: 2px solid var(--border-color); padding: 24px; border-radius: 8px; background: #fff;">
            <div style="text-align: center; border-bottom: 2px solid var(--primary); padding-bottom: 14px; margin-bottom: 16px;">
              <h4 style="color: var(--primary); font-size: 0.95rem;">UNIVERSIDAD INTERNACIONAL DEL TRÓPICO AMERICANO</h4>
              <p style="font-size: 0.78rem; color: var(--text-muted);">OFICIO FORMAL DE RESPUESTA INSTITUCIONAL &bull; RADICADO: ${doc.response.radicado}</p>
            </div>
            <div style="font-size: 0.85rem; line-height: 1.6; margin-bottom: 20px;">
              <p><strong>Fecha:</strong> ${doc.response.date}</p>
              <p><strong>Asunto:</strong> ${doc.response.subject}</p>
              <p><strong>Decisión:</strong> <span style="color: var(--status-safe); font-weight: 700;">${doc.response.decision}</span></p>
              <hr style="margin: 14px 0; border: none; border-top: 1px solid var(--border-subtle);">
              <p style="white-space: pre-wrap;">${doc.response.content}</p>
            </div>
            <div style="border-top: 1px solid var(--border-subtle); padding-top: 14px; display: flex; justify-content: space-between; align-items: flex-end;">
              <div>
                <strong>${doc.response.signedName}</strong><br>
                <span style="font-size: 0.78rem; color: var(--text-muted);">${doc.response.signedRole}</span>
              </div>
              <span style="color: var(--status-safe); font-size: 0.75rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Firma Electrónica Verificada
              </span>
            </div>
          </div>
        `;
      } else {
        previewModalContent.innerHTML = `
          <div style="text-align: center; padding: 40px; color: var(--text-muted);">
            <p>Este expediente aún no cuenta con un oficio de respuesta formal radicado.</p>
            <button type="button" class="btn btn-primary" id="btn-trigger-response-from-empty" style="margin-top: 14px;">
              Redactar Oficio de Respuesta Ahora
            </button>
          </div>
        `;
        document.getElementById('btn-trigger-response-from-empty')?.addEventListener('click', () => {
          if (previewModal) previewModal.style.display = 'none';
          openResponseModal(doc);
        });
      }
    }
  }

  tabBtnDoc?.addEventListener('click', () => {
    currentPreviewTab = 'doc';
    tabBtnDoc.classList.add('active');
    tabBtnResp?.classList.remove('active');
    renderPreviewContent();
  });

  tabBtnResp?.addEventListener('click', () => {
    currentPreviewTab = 'resp';
    tabBtnResp.classList.add('active');
    tabBtnDoc?.classList.remove('active');
    renderPreviewContent();
  });

  document.getElementById('btn-close-preview-modal')?.addEventListener('click', () => {
    if (previewModal) previewModal.style.display = 'none';
  });

  document.getElementById('btn-close-preview-footer')?.addEventListener('click', () => {
    if (previewModal) previewModal.style.display = 'none';
  });

  // Response Modal logic
  const responseModal = document.getElementById('response-modal');
  const responseForm = document.getElementById('response-doc-form') as HTMLFormElement | null;
  const selectTemplate = document.getElementById('select-response-template') as HTMLSelectElement | null;
  const chipsContainer = document.getElementById('template-chips-container');
  const inputRadicado = document.getElementById('input-response-radicado') as HTMLInputElement | null;
  const inputSubject = document.getElementById('input-response-subject') as HTMLInputElement | null;
  const inputBody = document.getElementById('input-response-body') as HTMLTextAreaElement | null;
  const selectDecision = document.getElementById('select-response-decision') as HTMLSelectElement | null;
  const petitionSummary = document.getElementById('response-petition-summary');

  function openResponseModal(doc: Document) {
    selectedDocForResponse = doc;
    if (petitionSummary) {
      petitionSummary.innerHTML = `
        <div style="padding: 12px; background: var(--bg-surface-elevated); border-radius: 6px; margin-bottom: 14px;">
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.9rem;">${doc.title}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Radicado Origen: ${doc.radicado} &bull; Solicitante: ${doc.applicant}</div>
        </div>
      `;
    }

    if (inputRadicado) {
      inputRadicado.value = `OFC-UNT-2026-${Math.floor(100 + Math.random() * 900)}`;
    }

    populateTemplates(doc);
    if (responseModal) responseModal.style.display = 'flex';
  }

  function populateTemplates(doc: Document) {
    if (!selectTemplate || !chipsContainer) return;
    selectTemplate.innerHTML = '<option value="">-- Seleccionar modelo o redactar manualmente --</option>';
    chipsContainer.innerHTML = '';

    DEFAULT_RESPONSE_TEMPLATES.forEach(tpl => {
      const opt = document.createElement('option');
      opt.value = tpl.id;
      opt.textContent = `${tpl.title} (${tpl.decision})`;
      selectTemplate.appendChild(opt);

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'template-chip';
      chip.style.cssText = 'padding: 4px 10px; font-size: 0.72rem; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-surface); cursor: pointer; margin-right: 6px; margin-top: 6px;';
      chip.textContent = tpl.title;
      chip.addEventListener('click', () => applyTemplate(tpl, doc));
      chipsContainer.appendChild(chip);
    });

    selectTemplate.onchange = () => {
      const tpl = DEFAULT_RESPONSE_TEMPLATES.find(t => t.id === selectTemplate.value);
      if (tpl) applyTemplate(tpl, doc);
    };
  }

  function applyTemplate(tpl: typeof DEFAULT_RESPONSE_TEMPLATES[0], doc: Document) {
    if (inputSubject) inputSubject.value = tpl.subject.replace('[NUMERO_RADICADO]', doc.radicado).replace('[TITULO_DOCUMENTO]', doc.title);
    if (inputBody) inputBody.value = tpl.content;
    if (selectDecision) selectDecision.value = tpl.decision;
  }

  document.getElementById('btn-close-response-modal')?.addEventListener('click', () => {
    if (responseModal) responseModal.style.display = 'none';
  });

  document.getElementById('btn-cancel-response')?.addEventListener('click', () => {
    if (responseModal) responseModal.style.display = 'none';
  });

  responseForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!selectedDocForResponse) return;

    const radicado = inputRadicado?.value || `OFC-UNT-2026-${Date.now().toString().slice(-4)}`;
    const subject = inputSubject?.value || 'Respuesta Oficial';
    const content = inputBody?.value || '';
    const decision = selectDecision?.value || 'Favorable';
    const activeU = window.currentLoggedUser;

    selectedDocForResponse.responseStatus = 'respondida';
    selectedDocForResponse.status = 'Respondido';
    selectedDocForResponse.response = {
      radicado,
      date: new Date().toISOString().split('T')[0] ?? '',
      subject,
      templateTitle: 'Oficio Institucional',
      decision,
      content,
      respondedBy: activeU.id,
      signedName: activeU.name,
      signedRole: activeU.role,
      createdAt: new Date().toISOString()
    };

    logSystemActivity({
      actor: activeU,
      action: 'Emisión y Firma de Oficio de Respuesta',
      actionType: 'RESPUESTA',
      entity: 'Expediente Documental',
      entityId: selectedDocForResponse.radicado,
      details: `Oficio formal ${radicado} formalizado con decisión "${decision}".`,
      severity: 'INFO'
    });

    window.showToast(`Oficio de respuesta ${radicado} vinculado exitosamente.`);
    if (responseModal) responseModal.style.display = 'none';
    updateCounts();
    renderTable();
  });

  // Upload modal trigger
  document.getElementById('btn-open-upload-modal-view')?.addEventListener('click', () => {
    const uploadModal = document.getElementById('upload-modal');
    if (uploadModal) uploadModal.style.display = 'flex';
  });

  // Inicializar vista
  updateCounts();
  renderTable();
}
