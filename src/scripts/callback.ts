// src/scripts/callback.ts - Lógica de cliente para la verificación OAuth PKCE/Implicit
import { supabase } from '@lib/supabase';
import { SESSION_STORAGE_KEY, SESSION_COOKIE_KEY } from '@lib/constants';
import { logSystemActivity } from '@lib/audit';

export function initAuthCallback(): void {
  async function handleCallback() {
    const statusText = document.getElementById('auth-status-text');

    try {
      // 1. Verificar si viene código en la URL (PKCE)
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error || !data.session?.user?.email) {
          console.error('Error canjeando código OAuth:', error);
          window.location.href = '/login?error=auth_failed';
          return;
        }
        await verifyWhitelist(data.session.user.email, data.session);
        return;
      }

      // 2. Verificar si ya existe sesión activa
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        await verifyWhitelist(session.user.email, session);
        return;
      }

      // 3. Escuchar hash en URL (Implicit Flow de Supabase)
      supabase.auth.onAuthStateChange(async (event, currentSession) => {
        if (currentSession?.user?.email) {
          await verifyWhitelist(currentSession.user.email, currentSession);
        }
      });

      // Si después de 4 segundos no hay respuesta, redirigir
      setTimeout(() => {
        if (statusText) statusText.textContent = 'Tiempo de espera agotado. Redirigiendo a inicio...';
        setTimeout(() => { window.location.href = '/login'; }, 1500);
      }, 4000);
    } catch (err) {
      console.error('Error en autenticación callback:', err);
      window.location.href = '/login?error=callback_error';
    }
  }

  async function verifyWhitelist(email: string, session: any) {
    const normalizedEmail = email.trim().toLowerCase();
    const statusText = document.getElementById('auth-status-text');
    if (statusText) statusText.textContent = `Validando permisos para ${normalizedEmail}...`;

    // Consulta de Whitelist estricta en tabla 'profiles' de Supabase
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (error || !profile) {
      // REGISTRAR INTENTO NO AUTORIZADO EN AUDITORÍA
      await logSystemActivity({
        actor: { id: 'usr-unauthorized', name: normalizedEmail, role: 'externo' },
        action: 'Intento de Acceso Denegado por Whitelist',
        actionType: 'SEGURIDAD',
        entity: 'Control de Acceso OAuth Google',
        entityId: normalizedEmail,
        details: `El correo "${normalizedEmail}" completó el flujo de Google pero NO está en la Whitelist autorizada del SGD. Acceso denegado.`,
        severity: 'CRITICAL',
      });

      // Cerrar sesión en Supabase Auth y limpiar almacenamiento
      await supabase.auth.signOut();
      localStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem('sgd_current_user');
      document.cookie = `${SESSION_COOKIE_KEY}=; path=/; max-age=0`;

      // Redirigir a pantalla de acceso denegado
      window.location.href = `/auth/denegado?email=${encodeURIComponent(normalizedEmail)}`;
      return;
    }

    // Usuario AUTORIZADO en la Whitelist:
    const currentUser = {
      id: profile.id,
      name: profile.full_name,
      email: profile.email,
      role: profile.role === 'admin' ? 'Administrador' : 'Funcionario',
      roleId: profile.role,
      initials: profile.full_name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || 'US',
      avatarColor: profile.role === 'admin' ? '#00594E' : '#D4AF37',
    };

    localStorage.setItem('sgd_current_user', JSON.stringify(currentUser));
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      userId: profile.id,
      email: profile.email,
      loggedAt: new Date().toISOString(),
    }));
    document.cookie = `${SESSION_COOKIE_KEY}=${profile.id}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax`;

    // Guardar tokens de Google para Google Calendar
    if (session.provider_token) {
      sessionStorage.setItem('google_provider_token', session.provider_token);
    }
    if (session.provider_refresh_token) {
      sessionStorage.setItem('google_refresh_token', session.provider_refresh_token);
    }

    // REGISTRAR INICIO DE SESIÓN EXITOSO EN AUDITORÍA
    await logSystemActivity({
      actor: currentUser,
      action: 'Inicio de Sesión Exitoso vía Google OAuth',
      actionType: 'ACCESO',
      entity: 'Control de Acceso OAuth',
      entityId: profile.id,
      details: `Acceso concedido a "${profile.full_name}" (${profile.email}) verificado en Whitelist con rol ${profile.role.toUpperCase()}.`,
      severity: 'INFO',
    });

    if (statusText) statusText.textContent = `¡Autorizado! Bienvenido, ${profile.full_name}. Redirigiendo al sistema...`;
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleCallback);
  } else {
    handleCallback();
  }
}

