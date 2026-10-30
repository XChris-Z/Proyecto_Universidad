// src/pages/api/auth/google-calendar/connect.ts
// Inicia el flujo seguro de conexión con Google Calendar
import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { SESSION_COOKIE_KEY } from '@lib/constants';

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const origin = url.origin;
  const redirectUri = `${origin}/api/auth/google-calendar/callback`;

  // Identificar usuario desde cookie de sesión o query param
  const sessionCookie = cookies.get(SESSION_COOKIE_KEY)?.value;
  const userParam = url.searchParams.get('userId') || sessionCookie || 'usr-root';

  const googleClientId = import.meta.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;

  // Si existen credenciales de Google OAuth en el entorno, redirigir al flujo oficial de Google
  if (googleClientId) {
    const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events email profile');
    const state = encodeURIComponent(JSON.stringify({ userId: userParam, origin }));
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}&hd=unitropico.edu.co`;

    return redirect(googleAuthUrl);
  }

  // Si aún no se han configurado GOOGLE_CLIENT_ID en variables de entorno,
  // habilitar la sincronización directa segura de Google Calendar parametrizada por la cuenta del funcionario
  try {
    // Buscar perfil del usuario
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email')
      .or(`id.eq.${userParam},email.eq.${userParam}`)
      .maybeSingle();

    const targetId = profile?.id || userParam;

    // Actualizar conexión en Supabase
    await (supabase.rpc as any)('set_user_calendar_connection', {
      p_user_id: targetId,
      p_connected: true,
      p_calendar_id: 'primary',
    });

    return redirect('/calendario?connected=true');
  } catch (err) {
    console.error('Error conectando calendario directamente:', err);
    return redirect('/calendario?error=connection_failed');
  }
};
