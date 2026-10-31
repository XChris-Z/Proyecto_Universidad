// src/pages/api/configuracion/smtp.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';
import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';

export const GET: APIRoute = async () => {
  try {
    const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {};
    const envUser = process.env.GOOGLE_SMTP_USER || process.env.SMTP_USER || metaEnv.GOOGLE_SMTP_USER || metaEnv.SMTP_USER;

    let dbUser: string | null = null;
    let host = 'smtp.gmail.com';
    let port = 587;

    try {
      const { data } = await (supabase
        .from('configuracion_sistema' as any)
        .select('smtp_user, smtp_host, smtp_port')
        .eq('id', 'config_smtp')
        .maybeSingle() as any);

      if (data && data.smtp_user) {
        dbUser = data.smtp_user;
        if (data.smtp_host) host = data.smtp_host;
        if (data.smtp_port) port = data.smtp_port;
      }
    } catch {
      // Si la tabla no existe aún, se ignora el error
    }

    const effectiveUser = envUser || dbUser;

    return new Response(
      JSON.stringify({
        success: true,
        configured: Boolean(effectiveUser),
        user: effectiveUser ? String(effectiveUser).replace(/['"]+/g, '').trim() : null,
        source: envUser ? 'env' : (dbUser ? 'database' : 'none'),
        host,
        port,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error consultando configuración SMTP' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const rawUser = String(body.user || '').trim();
    const rawPass = String(body.pass || '').trim();
    const host = String(body.host || 'smtp.gmail.com').trim();
    const port = Number(body.port) || 587;

    if (!rawUser || !rawPass) {
      return new Response(
        JSON.stringify({ success: false, error: 'Debe ingresar el correo institucional y la contraseña de aplicación de Google.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Limpieza estricta de credenciales
    const cleanUser = rawUser.replace(/['"]+/g, '').trim();
    const cleanPass = rawPass.replace(/['"]+/g, '').replace(/\s+/g, '');

    // 1. Probar credenciales en vivo contra Google SMTP
    const testTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user: cleanUser,
        pass: cleanPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });

    try {
      await testTransporter.verify();
    } catch (verifyErr: any) {
      console.error('[SMTP VERIFY FALLIDO]:', verifyErr.message);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Google SMTP rechazó la conexión (${verifyErr.message || 'Credenciales inválidas'}). Asegúrese de utilizar una "Contraseña de Aplicación" de 16 caracteres generada en https://myaccount.google.com/apppasswords.`,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Guardar en Supabase tabla configuracion_sistema
    try {
      const { error: upsertErr } = await (supabase
        .from('configuracion_sistema' as any)
        .upsert({
          id: 'config_smtp',
          smtp_user: cleanUser,
          smtp_pass: cleanPass,
          smtp_host: host,
          smtp_port: port,
          updated_at: new Date().toISOString(),
          updated_by: cleanUser,
        }) as any);

      if (upsertErr) {
        console.warn('Aviso guardando en configuracion_sistema:', upsertErr.message);
      }
    } catch (dbErr: any) {
      console.warn('Aviso conexión Supabase configuracion_sistema:', dbErr.message);
    }

    // 3. Registrar auditoría
    await logSystemActivity({
      actor: { id: 'usr-root', name: 'Administrador General', role: 'admin' },
      action: 'Configuración SMTP Institucional',
      actionType: 'SEGURIDAD',
      entity: 'Configuración del Sistema',
      entityId: 'config_smtp',
      details: `Vinculación y verificación exitosa de correo institucional ${cleanUser} para envío de notificaciones automáticas por SMTP.`,
      severity: 'INFO',
    }).catch(() => null);

    return new Response(
      JSON.stringify({
        success: true,
        message: `¡Correo institucional ${cleanUser} vinculado y probado exitosamente con Google SMTP!`,
        user: cleanUser,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Error guardando configuración SMTP:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error interno procesando configuración SMTP' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
