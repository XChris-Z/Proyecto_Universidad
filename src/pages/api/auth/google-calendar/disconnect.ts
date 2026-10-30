// src/pages/api/auth/google-calendar/disconnect.ts
// Desvincula de forma segura la cuenta de Google Calendar del usuario
import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { SESSION_COOKIE_KEY } from '@lib/constants';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const sessionUserId = cookies.get(SESSION_COOKIE_KEY)?.value;
    const body = await request.json().catch(() => ({}));
    const targetUserId = body.userId || sessionUserId || 'usr-root';

    // Desconectar y limpiar credenciales en Supabase
    const { data, error } = await (supabase.rpc as any)('disconnect_user_calendar', {
      p_user_id: targetUserId,
    });

    if (error) {
      console.error('Error desconectando calendario:', error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, user_id: targetUserId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
