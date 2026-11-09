// src/scripts/peticiones.ts - Lógica de cliente para el Módulo de Peticiones y PQRS

export function initPeticiones(): void {
  // 1. FILTRO DE PESTAÑAS Y BUSCADOR EN TIEMPO REAL
  const filterButtons = document.querySelectorAll('#peticiones-filter-tabs .filter-tab');
  const tableRows = document.querySelectorAll<HTMLTableRowElement>('#tabla-peticiones tbody tr');
  const searchInput = document.getElementById('peticiones-search-input') as HTMLInputElement | null;
  let currentFilterMode = 'all';

  function applyPeticionesFilters() {
    const q = (searchInput?.value || '').toLowerCase().trim();
    tableRows.forEach((row) => {
      if (row.id && row.id.startsWith('row-pet-')) {
        const estado = row.getAttribute('data-estado');
        const isPendiente = estado !== 'respondida' && estado !== 'completada';
        const matchesTab = currentFilterMode === 'all' || (currentFilterMode === 'pendientes' && isPendiente);
        const text = row.textContent?.toLowerCase() || '';
        const matchesQ = !q || text.includes(q);

        row.style.display = (matchesTab && matchesQ) ? 'table-row' : 'none';
      }
    });
  }

  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilterMode = btn.getAttribute('data-pfilter') || 'all';
      applyPeticionesFilters();
    });
  });

  searchInput?.addEventListener('input', applyPeticionesFilters);

  // 2. MODAL DE EDICIÓN
  const editModal = document.getElementById('modal-edit-peticion');
  const editTitle = document.getElementById('edit-modal-title');
  const inputId = document.getElementById('edit-pet-id') as HTMLInputElement | null;
  const inputAsunto = document.getElementById('edit-pet-asunto') as HTMLInputElement | null;
  const inputSolicitante = document.getElementById('edit-pet-solicitante') as HTMLInputElement | null;
  const selectTipo = document.getElementById('edit-pet-tipo') as HTMLSelectElement | null;
  const selectPrioridad = document.getElementById('edit-pet-prioridad') as HTMLSelectElement | null;
  const selectEstado = document.getElementById('edit-pet-estado') as HTMLSelectElement | null;
  const inputEntrega = document.getElementById('edit-pet-entrega') as HTMLInputElement | null;
  const formEdit = document.getElementById('form-edit-peticion') as HTMLFormElement | null;

  const closeEdit = () => {
    if (editModal) editModal.style.display = 'none';
  };
  document.getElementById('btn-close-edit-modal')?.addEventListener('click', closeEdit);
  document.getElementById('btn-cancel-edit-pet')?.addEventListener('click', closeEdit);

  // 3. DELEGACIÓN GLOBAL DE ACCIONES (Abrir Carpeta, Editar, Eliminar y Reenviar)
  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // A. Botón Abrir Carpeta
    const abrirBtn = target.closest('.btn-abrir-carpeta') as HTMLAnchorElement | null;
    if (abrirBtn && abrirBtn.href) {
      return;
    }

    // B. Botón Editar
    const editBtn = target.closest('.btn-edit-pet') as HTMLElement | null;
    if (editBtn) {
      e.preventDefault();
      e.stopPropagation();
      const id = editBtn.dataset.id || '';
      const radicado = editBtn.dataset.radicado || '';
      const asunto = editBtn.dataset.asunto || '';
      const solicitante = editBtn.dataset.solicitante || '';
      const tipo = editBtn.dataset.tipo || 'Ciudadano';
      const prioridad = editBtn.dataset.prioridad || 'Media';
      const estado = editBtn.dataset.estado || 'en_tramite';
      const entrega = editBtn.dataset.entrega || '';

      if (editTitle) editTitle.textContent = `Editar Radicado ${radicado}`;
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

    // C. Botón Eliminar
    const deleteBtn = target.closest('.btn-delete-pet') as HTMLElement | null;
    if (deleteBtn) {
      e.preventDefault();
      e.stopPropagation();
      const id = deleteBtn.dataset.id;
      const radicado = deleteBtn.dataset.radicado;
      if (!id) return;

      const confirmed = typeof (window as any).showConfirm === 'function'
        ? await (window as any).showConfirm(
            `¿Está seguro de que desea eliminar definitivamente el radicado ${radicado}?\n\nEsta acción purgará los registros de oficinas asignadas, archivos en el repositorio y registrará el evento de eliminación en la Auditoría institucional.`,
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
          (window as any).showToast('Error al eliminar: ' + (data.error || 'No se pudo procesar la eliminación'), 'error');
          deleteBtn.removeAttribute('disabled');
          return;
        }

        const row = document.getElementById(`row-pet-${id}`);
        if (row) {
          row.style.transition = 'opacity 0.3s ease';
          row.style.opacity = '0';
          setTimeout(() => row.remove(), 300);
        }

        (window as any).showToast(`El radicado ${radicado} ha sido eliminado satisfactoriamente.`, 'success');
      } catch (err: any) {
        (window as any).showToast('Error al comunicarse con el servidor para la eliminación.', 'error');
        deleteBtn.removeAttribute('disabled');
      }
      return;
    }

    // D. Botón Reenviar Correo SMTP
    const resendBtn = target.closest('.btn-resend-mail') as HTMLButtonElement | null;
    if (resendBtn) {
      e.preventDefault();
      e.stopPropagation();
      const id = resendBtn.dataset.id;
      const radicado = resendBtn.dataset.radicado;
      if (!id) return;

      resendBtn.disabled = true;
      const originalContent = resendBtn.innerHTML;
      resendBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>`;

      try {
        const res = await fetch('/api/peticiones/reenviar-correo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          (window as any).showToast(
            `Fallo en el envío SMTP para ${radicado}: ${data.error || 'No se pudo conectar con el servidor de correo'}`,
            'error',
            'Diagnóstico SMTP'
          );
        } else {
          (window as any).showToast(
            `Notificación enviada exitosamente para ${radicado}.`,
            'success',
            'Despacho de Correo'
          );
        }
      } catch (err: any) {
        (window as any).showToast('Error de red al intentar conectar con el servicio de correo.', 'error');
      } finally {
        resendBtn.disabled = false;
        resendBtn.innerHTML = originalContent;
      }
      return;
    }
  });

  formEdit?.addEventListener('submit', async (e) => {
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
        (window as any).showToast('Error al actualizar: ' + (data.error || 'No se pudo guardar la modificación'), 'error');
        return;
      }

      (window as any).showToast('Petición actualizada con éxito.', 'success');
      setTimeout(() => window.location.reload(), 600);
    } catch (err: any) {
      (window as any).showToast('Error de conexión al actualizar la petición.', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Cambios';
      }
    }
  });
}
