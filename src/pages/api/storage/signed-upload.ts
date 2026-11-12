// src/pages/api/storage/signed-upload.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@lib/supabase';

function getStorageClient() {
  const rawUrl = (
    import.meta.env.PUBLIC_SUPABASE_URL ||
    (typeof process !== 'undefined' ? process.env?.PUBLIC_SUPABASE_URL || process.env?.SUPABASE_URL : undefined) ||
    'https://irjjpjtvhxoakiazfswn.supabase.co'
  ) as string;
  const cleanUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const serviceKey = (
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY ||
    (typeof process !== 'undefined' ? process.env?.SUPABASE_SERVICE_ROLE_KEY : undefined) ||
    ''
  ).trim();

  if (serviceKey) {
    return createClient(cleanUrl, serviceKey);
  }
  return supabase;
}

function sanitizeStoragePath(rawPath: string): string {
  return String(rawPath || '')
    .replace(/\\/g, '/')
    .replace(/^peticiones\//i, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const bucket = String(body.bucket || 'peticiones').trim() || 'peticiones';
    const rawPath =
      body.path ||
      (body.fileName
        ? `direct_uploads/${Date.now()}_${String(body.fileName).replace(/[^a-zA-Z0-9._-]/g, '_')}`
        : '');

    if (!rawPath || typeof rawPath !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Debe especificar la ruta (path) o nombre de archivo.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const cleanPath = sanitizeStoragePath(rawPath);
    if (!cleanPath) {
      return new Response(
        JSON.stringify({ success: false, error: 'Ruta de almacenamiento inválida.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const storageClient = getStorageClient();
    const { data, error } = await storageClient.storage
      .from(bucket)
      .createSignedUploadUrl(cleanPath, { upsert: true } as any);

    if (error || !data) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error?.message || 'No se pudo generar la URL firmada de subida.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        bucket,
        signedUrl: data.signedUrl,
        token: data.token,
        path: data.path || cleanPath,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Error en endpoint signed-upload:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Error interno generando URL firmada de carga.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

