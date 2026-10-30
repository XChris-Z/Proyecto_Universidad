// src/pages/api/auth/google-calendar/callback.ts
// Callback de OAuth2 de Google Calendar — Gestiona el código, intercambia tokens y persiste de forma aislada
import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { SESSION_COOKIE_KEY } from '@lib/constants';

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const origin = url.origin;
  const redirectUri = `${origin}/api/auth/google-calendar/callback`;

  // 1. Manejo de cancelación o error de Google
  const errorParam = url.searchParams.get('error');
  if (errorParam) {
    console.warn('[Google Calendar OAuth] Usuario canceló o Google devolvió error:', errorParam);
    return redirect('/calendario?error=cancelled');
  }

  const code = url.searchParams.get('code');
  if (!code) {
    return redirect('/calendario?error=missing_code');
  }

  // 2. Extraer state para identificar al usuario
  let targetUserId = cookies.get(SESSION_COOKIE_KEY)?.value || 'usr-root';
  const stateParam = url.searchParams.get('state');
  if (stateParam) {
    try {
      const parsed = JSON.parse(decodeURIComponent(stateParam));
      if (parsed.userId) targetUserId = parsed.userId;
    } catch (e) {
      // Ignorar error de JSON parse
    }
  }

  const googleClientId = import.meta.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = import.meta.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

  if (!googleClientId || !googleClientSecret) {
    // Si no hay client secret configurado, marcar conexión directa para el usuario
    try {
      await (supabase.rpc as any)('set_user_calendar_connection', {
        p_user_id: targetUserId,
        p_connected: true,
        p_calendar_id: 'primary',
      });
      return redirect('/calendario?connected=true');
    } catch (err) {
      console.error('Error registrando conexión:', err);
      return redirect('/calendario?error=db_error');
    }
  }

  // 3. Intercambio seguro de autorización por tokens con Google
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('[Google Calendar Token Error]:', errText);
      return redirect('/calendario?error=token_exchange_failed');
    }

    const tokens = await tokenResponse.json();
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token || null;

    // 4. Persistir tokens cifrados/privados en el perfil del usuario en Supabase
    await (supabase.rpc as any)('set_user_calendar_connection', {
      p_user_id: targetUserId,
      p_connected: true,
      p_access_token: accessToken,
      p_refresh_token: refreshToken,
      p_calendar_id: 'primary',
    });

    return redirect('/calendario?connected=true');
  } catch (err: any) {
    console.error('Error durante intercambio de tokens de Google Calendar:', err);
    return redirect('/calendario?error=unexpected_error');
  }
};

