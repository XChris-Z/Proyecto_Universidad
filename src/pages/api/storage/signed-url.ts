// src/pages/api/storage/signed-url.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const { bucket = 'peticiones', path } = body;

    if (!path || typeof path !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Debe especificar la ruta (path) del archivo.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Sanitizar ruta para almacenamiento seguro
    const cleanPath = path
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .replace(/^\/+|\/+$/g, '');

    // Intentar crear URL firmada de subida con el cliente administrativo (Service Role)
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(cleanPath);

    if (error || !data) {
      console.warn('Aviso generando signed upload URL:', error?.message);
      return new Response(
        JSON.stringify({ success: false, error: error?.message || 'No se pudo generar la URL firmada de subida.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        signedUrl: data.signedUrl,
        token: data.token,
        path: data.path || cleanPath,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Error en endpoint signed-url:', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Error interno generando URL firmada.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
