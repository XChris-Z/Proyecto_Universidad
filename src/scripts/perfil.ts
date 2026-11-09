// src/scripts/perfil.ts
// Lógica de cliente para Mi Perfil, Actualización de Usuario, Avatar y Contraseña en Supabase

import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';

export function initPerfil() {
  let currentUserId = 'usr-root';
  let currentUserEmail = 'christianlemus.es@unitropico.edu.co';

  // 1. Cargar perfil desde Supabase y localStorage
  async function loadUserProfile() {
    const storedUser = localStorage.getItem('sgd_current_user');
    let user: any = null;
    if (storedUser) {
      try { user = JSON.parse(storedUser); } catch(e) {}
    }

    if (user) {
      currentUserId = user.id || 'usr-root';
      currentUserEmail = user.email || 'christianlemus.es@unitropico.edu.co';
    }

    const nameEl = document.getElementById('profile-name-display');
    const cargoEl = document.getElementById('profile-cargo-display');
    const badgeEl = document.getElementById('profile-role-badge');
    const inputName = document.getElementById('input-full-name') as HTMLInputElement | null;
    const inputEmail = document.getElementById('input-email-locked') as HTMLInputElement | null;
    const inputRole = document.getElementById('input-role-title') as HTMLInputElement | null;
    const inputCargo = document.getElementById('input-dependencia-title') as HTMLInputElement | null;
    const avatarInitials = document.getElementById('profile-avatar-initials');
    const img = document.getElementById('profile-avatar-img') as HTMLImageElement | null;

    // Consultar perfil real en Supabase
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`id.eq.${currentUserId},email.eq.${currentUserEmail}`)
        .maybeSingle();

      if (profile && !error) {
        if (nameEl) nameEl.textContent = profile.full_name;
        if (cargoEl) cargoEl.textContent = profile.cargo || profile.role;
        if (inputName) inputName.value = profile.full_name;
        if (inputEmail) inputEmail.value = profile.email;
        if (inputRole) inputRole.value = profile.role === 'admin' ? 'Administrador General' : 'Funcionario Institucional';
        if (inputCargo) inputCargo.value = profile.cargo || 'Despacho Institucional';

        const isAdmin = profile.role === 'admin';
        if (badgeEl) {
          badgeEl.textContent = isAdmin ? 'ADMINISTRADOR' : 'FUNCIONARIO';
          badgeEl.className = isAdmin ? 'role-badge admin' : 'role-badge funcionario';
        }

        if (profile.avatar_url && img && avatarInitials) {
          img.src = profile.avatar_url;
          img.style.display = 'block';
          avatarInitials.style.display = 'none';
        } else if (avatarInitials) {
          const initials = profile.full_name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || 'UN';
          avatarInitials.textContent = initials;
        }
      } else if (user) {
        // Fallback a storedUser
        if (nameEl) nameEl.textContent = user.name || 'Usuario';
        if (inputName) inputName.value = user.name || '';
        if (inputEmail) inputEmail.value = user.email || '';
        if (inputRole) inputRole.value = user.role || '';
      }
    } catch (err) {
      console.warn('Error consultando perfil en Supabase:', err);
    }
  }

  // 2. Guardar Nombre Completo en Supabase (Profiles + Users + Audit)
  const btnSaveName = document.getElementById('btn-save-name');
  const inputName = document.getElementById('input-full-name') as HTMLInputElement | null;
  const nameStatus = document.getElementById('name-save-status');

  if (btnSaveName && inputName) {
    btnSaveName.addEventListener('click', async () => {
      const newName = inputName.value.trim();
      if (!newName) {
        if (typeof window.showToast === 'function') {
          window.showToast('Por favor ingresa un nombre válido.');
        }
        return;
      }

      btnSaveName.textContent = 'Guardando...';
      (btnSaveName as HTMLButtonElement).disabled = true;

      try {
        const nowIso = new Date().toISOString();
        const targetId = currentUserId || 'usr-root';

        // Actualizar en tabla profiles
        await supabase
          .from('profiles')
          .update({ full_name: newName, updated_at: nowIso })
          .eq('id', targetId);

        // Actualizar en tabla users
        await supabase
          .from('users')
          .update({ name: newName, updated_at: nowIso })
          .eq('id', targetId);

        // Actualizar vista local
        const nameEl = document.getElementById('profile-name-display');
        if (nameEl) nameEl.textContent = newName;

        // Actualizar localStorage
        const storedUser = localStorage.getItem('sgd_current_user');
        if (storedUser) {
          try {
            const u = JSON.parse(storedUser);
            u.name = newName;
            localStorage.setItem('sgd_current_user', JSON.stringify(u));
          } catch(e) {}
        }

        // Registrar en bitácora de auditoría de Supabase
        await logSystemActivity({
          actor: { id: targetId, name: newName, role: 'admin' },
          action: 'Actualización de Nombre de Funcionario',
          actionType: 'MODIFICACION',
          entity: 'Perfil Institucional',
          entityId: targetId,
          details: `El usuario actualizó su nombre oficial a "${newName}".`,
          severity: 'INFO'
        });

        if (nameStatus) {
          nameStatus.style.display = 'block';
          nameStatus.style.color = '#059669';
          nameStatus.textContent = 'Nombre guardado exitosamente.';
          setTimeout(() => { nameStatus.style.display = 'none'; }, 4000);
        }
      } catch (err) {
        console.error('Error guardando nombre:', err);
        if (nameStatus) {
          nameStatus.style.display = 'block';
          nameStatus.style.color = '#dc2626';
          nameStatus.textContent = 'No se pudo guardar el nombre.';
        }
      } finally {
        btnSaveName.textContent = 'Guardar';
        (btnSaveName as HTMLButtonElement).disabled = false;
      }
    });
  }

  // 3. Subida de Avatar al bucket 'avatars' de Supabase Storage
  const avatarInput = document.getElementById('avatar-file-input') as HTMLInputElement | null;
  if (avatarInput) {
    avatarInput.addEventListener('change', async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        if (typeof window.showToast === 'function') {
          window.showToast('La imagen no debe superar los 5 MB.');
        }
        return;
      }

      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `${currentUserId}_${Date.now()}.${fileExt}`;

      try {
        // Subir archivo al bucket 'avatars' en Supabase Storage
        const { data, error } = await supabase.storage
          .from('avatars')
          .upload(fileName, file, { upsert: true });

        let publicUrl = '';
        if (!error && data) {
          const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
          publicUrl = urlData.publicUrl;
        } else {
          // DataURL de respaldo si falla storage directo
          publicUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
        }

        // Actualizar avatar_url en tabla profiles de Supabase
        const targetId = currentUserId || 'usr-root';
        const updateFilter = currentUserEmail 
          ? `id.eq.${targetId},email.eq.${currentUserEmail}`
          : `id.eq.${targetId}`;

        await supabase
          .from('profiles')
          .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
          .or(updateFilter);

        // Guardar y actualizar vista globalmente
        localStorage.setItem('sgd_user_avatar', publicUrl);
        localStorage.setItem(`sgd_avatar_${currentUserId}`, publicUrl);
        if (currentUserEmail) {
          localStorage.setItem(`sgd_avatar_${currentUserEmail}`, publicUrl);
        }
        const rawUser = localStorage.getItem("sgd_current_user");
        let uObj: any = {};
        if (rawUser) {
          try { uObj = JSON.parse(rawUser); } catch(e) {}
        }
        uObj.avatar_url = publicUrl;
        uObj.avatarUrl = publicUrl;
        localStorage.setItem("sgd_current_user", JSON.stringify(uObj));

        const img = document.getElementById("profile-avatar-img") as HTMLImageElement | null;
        const initials = document.getElementById("profile-avatar-initials");
        if (img && initials) {
          img.src = publicUrl;
          img.style.display = "block";
          initials.style.display = "none";
        }

        if (window.currentLoggedUser) {
          window.currentLoggedUser.avatar_url = publicUrl;
          (window.currentLoggedUser as any).avatarUrl = publicUrl;
        }
        if (window.updateUserProfileUI) {
          window.updateUserProfileUI();
        }
        window.dispatchEvent(new CustomEvent("sgd-user-updated", { detail: { avatar_url: publicUrl } }));

        // Registrar en auditoría
        await logSystemActivity({
          actor: { id: currentUserId, name: inputName?.value || 'Usuario', role: 'funcionario' },
          action: 'Actualización de Foto de Perfil (Avatar)',
          actionType: 'MODIFICACION',
          entity: 'Perfil Institucional',
          entityId: currentUserId,
          details: 'El usuario actualizó su fotografía institucional en Supabase Storage (bucket avatars).',
          severity: 'INFO'
        });

        if (typeof window.showToast === 'function') {
          window.showToast('Foto de perfil actualizada correctamente.');
        }
      } catch (err) {
        console.error('Error subiendo avatar:', err);
        if (typeof window.showToast === 'function') {
          window.showToast('No se pudo subir la foto de perfil.');
        }
      }
    });
  }

  // 4. Validación Estricta de Contraseña en Tiempo Real
  const newPassInput = document.getElementById('new-password') as HTMLInputElement | null;
  const confirmPassInput = document.getElementById('confirm-password') as HTMLInputElement | null;
  const matchMsg = document.getElementById('password-match-msg');

  const ruleLength = document.getElementById('rule-length');
  const ruleUpper = document.getElementById('rule-upper');
  const ruleLower = document.getElementById('rule-lower');
  const ruleNumber = document.getElementById('rule-number');
  const ruleSpecial = document.getElementById('rule-special');

  function checkRules(val: string): boolean {
    const hasLength = val.length >= 8;
    const hasUpper = /[A-Z]/.test(val);
    const hasLower = /[a-z]/.test(val);
    const hasNumber = /[0-9]/.test(val);
    const hasSpecial = /[^A-Za-z0-9]/.test(val);

    updateRuleUI(ruleLength, hasLength);
    updateRuleUI(ruleUpper, hasUpper);
    updateRuleUI(ruleLower, hasLower);
    updateRuleUI(ruleNumber, hasNumber);
    updateRuleUI(ruleSpecial, hasSpecial);

    return hasLength && hasUpper && hasLower && hasNumber && hasSpecial;
  }

  function updateRuleUI(el: HTMLElement | null, valid: boolean) {
    if (!el) return;
    const text = el.getAttribute('data-policy-label') || el.textContent?.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚ\s!@#$%^&*().-]/g, '').trim() || '';
    if (!el.getAttribute('data-policy-label')) el.setAttribute('data-policy-label', text);

    if (valid) {
      el.style.color = '#059669';
      el.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="3" style="display: inline-block; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg> <span>${text}</span>`;
    } else {
      el.style.color = 'var(--text-muted)';
      el.innerHTML = `<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); margin: 0 3px; vertical-align: middle;"></span> <span>${text}</span>`;
    }
  }

  if (newPassInput) {
    newPassInput.addEventListener('input', () => {
      checkRules(newPassInput.value);
      checkMatch();
    });
  }

  if (confirmPassInput) {
    confirmPassInput.addEventListener('input', checkMatch);
  }

  function checkMatch() {
    if (!matchMsg || !confirmPassInput || !newPassInput) return;
    if (!confirmPassInput.value) {
      matchMsg.style.display = 'none';
      return;
    }
    matchMsg.style.display = 'block';
    if (confirmPassInput.value === newPassInput.value) {
      matchMsg.style.color = '#059669';
      matchMsg.textContent = 'Las contraseñas coinciden correctamente.';
    } else {
      matchMsg.style.color = '#DC2626';
      matchMsg.textContent = 'Las contraseñas no coinciden.';
    }
  }

  // 5. Envío del Formulario de Cambio de Contraseña vía Supabase Auth
  const passForm = document.getElementById('form-change-password');
  const statusFeedback = document.getElementById('password-status-feedback');

  if (passForm) {
    passForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPass = (document.getElementById('current-password') as HTMLInputElement | null)?.value;
      const newPass = newPassInput?.value || '';
      const confirmPass = confirmPassInput?.value || '';

      if (!currentPass) {
        if (typeof window.showToast === 'function') {
          window.showToast('Por favor ingresa tu contraseña actual.');
        }
        return;
      }

      if (!checkRules(newPass)) {
        if (typeof window.showToast === 'function') {
          window.showToast('La nueva contraseña no cumple con todos los criterios de seguridad institucional.');
        }
        return;
      }

      if (newPass !== confirmPass) {
        if (typeof window.showToast === 'function') {
          window.showToast('La confirmación de la contraseña no coincide.');
        }
        return;
      }

      const submitBtn = document.getElementById('btn-submit-password') as HTMLButtonElement | null;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Actualizando contraseña...';
      }

      try {
        // Intentar actualizar contraseña a través del cliente oficial de Supabase Auth
        await supabase.auth.updateUser({ password: newPass });

        // Desmarcar contraseña provisional en tabla profiles
        const targetId = currentUserId || 'usr-root';
        await supabase
          .from('profiles')
          .update({ is_provisional_password: false, updated_at: new Date().toISOString() })
          .eq('id', targetId);

        // Registrar en auditoría oficial de Supabase
        await logSystemActivity({
          actor: { id: currentUserId, name: inputName?.value || 'Usuario', role: 'funcionario' },
          action: 'Cambio de Contraseña Institucional',
          actionType: 'SEGURIDAD',
          entity: 'Credenciales de Acceso',
          entityId: currentUserId,
          details: 'Actualización segura de contraseña institucional cumpliendo la política estricta de seguridad.',
          severity: 'WARN'
        });

        if (statusFeedback) {
          statusFeedback.style.display = 'block';
          statusFeedback.style.color = '#059669';
          statusFeedback.textContent = 'Contraseña institucional actualizada exitosamente.';
        }

        if (typeof window.showToast === 'function') {
          window.showToast('Contraseña actualizada exitosamente con los estándares de seguridad institucional.');
        }
        (passForm as HTMLFormElement).reset();
        checkRules('');
        if (matchMsg) matchMsg.style.display = 'none';
      } catch (err: any) {
        console.error('Error al actualizar contraseña:', err);
        if (statusFeedback) {
          statusFeedback.style.display = 'block';
          statusFeedback.style.color = '#dc2626';
          statusFeedback.textContent = 'Error actualizando contraseña: ' + (err.message || 'Error de conexión');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            <span>Actualizar Contraseña Institucional</span>
          `;
        }
      }
    });
  }

  // Inicializar de inmediato sin depender exclusivamente de DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadUserProfile);
  } else {
    loadUserProfile();
  }
}
