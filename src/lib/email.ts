// src/lib/email.ts
import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import { supabase } from './supabase';

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface EmailSubcarpetaItem {
  nombre: string;
  descripcion?: string | null;
}

export interface EmailRadicacionSolicitanteParams {
  toEmail: string;
  solicitanteNombre: string;
  numeroRadicado: string;
  asunto: string;
  categoria?: string | null;
  prioridad?: string | null;
  fechaRadicacion?: string | null;
  fechaLimiteEntrega: string;
  pinAcceso: string;
  nombreDocumento?: string | null;
  totalDependencias?: number;
  consultaUrl: string;
}

export interface EmailPeticionNotificationParams {
  toEmail: string;
  oficinaNombre: string;
  numeroRadicado: string;
  asunto: string;
  categoria?: string | null;
  prioridad?: string | null;
  instruccionesAnexos?: string | null;
  subcarpetas?: EmailSubcarpetaItem[];
  fechaRadicacion?: string | null;
  fechaLimiteEntrega: string;
  fechaLimiteResponsable: string;
  codigoAcceso: string;
  pinAcceso?: string | null;
  portalUrl: string;
  attachments?: EmailAttachment[];
}

export interface EmailRespuestaSolicitanteParams {
  toEmail: string;
  solicitanteNombre: string;
  numeroRadicado: string;
  asunto: string;
  mensajeRespuesta: string;
  funcionarioNombre: string;
  pinSolicitante: string;
  fechaRadicacion?: string | null;
  fechaExpiracion: string;
  consultaUrl: string;
  driveUrl?: string | null;
  totalArchivos?: number;
  archivoAdjunto?: {
    filename: string;
    content: Buffer;
    contentType?: string;
  } | null;
  anexosAdicionales?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
  anexosResumen?: Array<{
    nombre: string;
    origen?: string;
  }>;
}

export interface EmailRecordatorioDependenciaParams {
  toEmail: string;
  oficinaNombre: string;
  numeroRadicado: string;
  tituloPeticion: string;
  categoria?: string | null;
  prioridad?: string | null;
  nombreSubcarpeta: string;
  instruccionSubcarpeta?: string | null;
  fechaRadicacion?: string | null;
  fechaLimiteDependencia: string;
  diasRestantes: number;
  codigoAccesoDependencia: string;
  pinAcceso?: string | null;
  portalUrl: string;
}

export interface EmailRechazoAporteParams {
  toEmail: string;
  oficinaNombre: string;
  numeroRadicado: string;
  tituloPeticion: string;
  nombreSubcarpeta: string;
  archivoRechazado: string;
  motivoRechazo: string;
  fechaLimiteDependencia?: string | null;
  codigoAccesoDependencia: string;
  pinAcceso?: string | null;
  portalUrl: string;
  revisadoPor?: string | null;
}

/**
 * Obtiene el valor de una variable de entorno buscando en process.env, Vite/Astro env
 * y lectura directa del archivo .env en disco como respaldo obligatorio para Astro SSR.
 */
export function getEnvVar(key: string): string {
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {};
  const fromProcess = process.env[key] || metaEnv[key];
  if (fromProcess) {
    return String(fromProcess).replace(/['"\r\n]+/g, '').trim();
  }

  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, 'm'));
      if (match && match[1]) {
        return match[1].replace(/['"\r\n]+/g, '').trim();
      }
    }
  } catch {
    // Silencioso si no se puede leer el archivo .env
  }

  return '';
}

/**
 * Obtiene las credenciales SMTP desde variables de entorno (.env local o Vercel)
 * o desde Supabase (configuracion_sistema como respaldo).
 */
export async function getSmtpCredentials() {
  let rawUser = getEnvVar('GOOGLE_SMTP_USER') || getEnvVar('SMTP_USER') || getEnvVar('PUBLIC_SMTP_USER');
  let rawPass = getEnvVar('GOOGLE_SMTP_PASS') || getEnvVar('SMTP_PASS') || getEnvVar('PUBLIC_SMTP_PASS');
  let host = getEnvVar('GOOGLE_SMTP_HOST') || getEnvVar('SMTP_HOST') || 'smtp.gmail.com';
  let rawPort = getEnvVar('GOOGLE_SMTP_PORT') || getEnvVar('SMTP_PORT');
  let port = Number(rawPort) || 465;

  if (!rawUser || !rawPass || String(rawPass).includes('pegar_aqui')) {
    try {
      const { data: profile } = await (supabase
        .from('profiles' as any)
        .select('email, phone')
        .eq('id', 'usr-root')
        .maybeSingle() as any);

      if (profile && profile.phone && profile.phone.startsWith('smtp:')) {
        rawUser = profile.email || 'christianlemus.es@unitropico.edu.co';
        rawPass = profile.phone.replace(/^smtp:/, '').trim();
      }
    } catch (err: any) {
      console.warn('[SMTP] Aviso consultando profiles en base de datos:', err.message);
    }
  }

  if (!rawUser || !rawPass || String(rawPass).includes('pegar_aqui')) {
    try {
      const { data } = await (supabase
        .from('configuracion_sistema' as any)
        .select('*')
        .eq('id', 'config_smtp')
        .maybeSingle() as any);

      if (data && data.smtp_user && data.smtp_pass && !String(data.smtp_pass).includes('pegar_aqui')) {
        rawUser = data.smtp_user;
        rawPass = data.smtp_pass;
        if (data.smtp_host) host = data.smtp_host;
        if (data.smtp_port) port = Number(data.smtp_port) || 465;
      }
    } catch (err: any) {
      console.warn('[SMTP] Aviso consultando configuracion_sistema en base de datos:', err.message);
    }
  }

  if (!rawUser || !rawPass || String(rawPass).includes('pegar_aqui')) {
    rawUser = 'christianlemus.es@unitropico.edu.co';
    rawPass = 'niwhdmyiysfneazz';
    host = 'smtp.gmail.com';
    port = 465;
  }

  const cleanUser = String(rawUser).replace(/['"]+/g, '').trim();
  const cleanPass = String(rawPass).replace(/['"]+/g, '').replace(/\s+/g, '');

  return {
    user: cleanUser,
    pass: cleanPass,
    host: String(host).replace(/['"]+/g, '').trim(),
    port: Number(port) || 465,
  };
}

function createTransporter(creds: { user: string; pass: string; host: string; port: number }, forcePort587 = false) {
  const usePort = forcePort587 ? 587 : creds.port;
  const isSecure = usePort === 465;

  return nodemailer.createTransport({
    host: creds.host,
    port: usePort,
    secure: isSecure,
    auth: {
      user: creds.user,
      pass: creds.pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 15000,
  });
}

async function getSmtpTransporter() {
  const creds = await getSmtpCredentials();
  if (!creds) return null;
  return {
    transporter: createTransporter(creds),
    sender: creds.user,
    creds,
  };
}

async function dispatchSmtpMail(options: {
  fromLabel: string;
  toEmail: string;
  subject: string;
  html: string;
  attachments?: any[];
  logTag: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const smtpInfo = await getSmtpTransporter();
  if (!smtpInfo) {
    const errorMsg = 'Configuración SMTP no disponible en el servidor.';
    console.error(`[${options.logTag}] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  const { transporter, sender, creds } = smtpInfo;
  const mailOptions: any = {
    from: `"${options.fromLabel}" <${sender}>`,
    to: options.toEmail,
    subject: options.subject,
    html: options.html,
  };

  // Política de cero adjuntos físicos por correo: los soportes se descargan únicamente en la plataforma.

  try {
    let info;
    try {
      info = await transporter.sendMail(mailOptions);
    } catch (primaryErr: any) {
      console.warn(`[${options.logTag}] Reintentando puerto 587 STARTTLS (${primaryErr.message})...`);
      const fallbackTransporter = createTransporter(creds, true);
      info = await fallbackTransporter.sendMail(mailOptions);
    }

    console.log(`[${options.logTag}] Enviado a ${options.toEmail} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[${options.logTag} ERROR] ${options.toEmail}:`, error.message);
    return { success: false, error: error.message || 'Error enviando correo SMTP' };
  }
}

const PRODUCTION_PUBLIC_BASE_URL = 'https://proyecto-universidad-eosin.vercel.app';

/**
 * Resuelve la URL pública real de la aplicación evitando orígenes internos `localhost` en Vercel SSR.
 */
export function resolvePublicBaseUrl(request?: Request | null, url?: URL | null): string {
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {};
  const envSite =
    getEnvVar('PUBLIC_SITE_URL') ||
    getEnvVar('SITE_URL') ||
    (metaEnv.SITE ? String(metaEnv.SITE).replace(/\/+$/, '') : '');

  const forwardedHost = request?.headers?.get('x-forwarded-host')?.split(',')[0]?.trim() || '';
  const directHost = request?.headers?.get('host')?.trim() || url?.host || '';
  const rawHost = forwardedHost || directHost;
  const forwardedProto = request?.headers?.get('x-forwarded-proto')?.split(',')[0]?.trim() || '';

  const isLocalHost =
    !rawHost ||
    /^localhost(:\d+)?$/i.test(rawHost) ||
    /^127\.0\.0\.1(:\d+)?$/i.test(rawHost);

  if (!isLocalHost) {
    const proto = forwardedProto || (rawHost.includes('vercel.app') ? 'https' : url?.protocol?.replace(':', '') || 'https');
    return `${proto}://${rawHost}`.replace(/\/+$/, '');
  }

  if (envSite && !/localhost|127\.0\.0\.1/i.test(envSite)) {
    return envSite.replace(/\/+$/, '');
  }

  const vercelProdUrl = getEnvVar('VERCEL_PROJECT_PRODUCTION_URL');
  if (vercelProdUrl && !/localhost|127\.0\.0\.1/i.test(vercelProdUrl)) {
    return `https://${vercelProdUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`;
  }

  const vercelUrl = getEnvVar('VERCEL_URL');
  if (vercelUrl && !/localhost|127\.0\.0\.1/i.test(vercelUrl)) {
    return `https://${vercelUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`;
  }

  const isVercelRuntime = Boolean(getEnvVar('VERCEL') || getEnvVar('VERCEL_ENV'));
  if (isVercelRuntime || !rawHost || !rawHost.includes(':')) {
    return PRODUCTION_PUBLIC_BASE_URL;
  }

  const proto = forwardedProto || url?.protocol?.replace(':', '') || 'http';
  return `${proto}://${rawHost}`.replace(/\/+$/, '');
}

function sanitizeEmailActionUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return PRODUCTION_PUBLIC_BASE_URL;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(\/|$|\?)/i.test(trimmed)) {
    return trimmed.replace(/^https?:\/\/(localhost|127\.0\.0\.1)/i, resolvePublicBaseUrl());
  }
  return trimmed;
}

/**
 * Sanitiza descripciones, observaciones e instrucciones eliminando bloques internos [RESPUESTA_META],
 * otros metadatos técnicos y prefijos entre corchetes antes de renderizar en correos o vistas.
 */
export function limpiarTextoRequerimiento(raw?: string | null): string {
  if (!raw) return 'Aportar los soportes documentales y pronunciamiento técnico correspondiente al radicado.';
  const cleaned = String(raw)
    // Eliminar cualquier bloque [RESPUESTA_META]: {...} hasta el final o salto
    .replace(/\[RESPUESTA_META\]:\s*\{[\s\S]*?\}(?=\n|$)/gi, '')
    .replace(/\[RESPUESTA_META\]:[\s\S]*$/gi, '')
    // Eliminar otros bloques de metadatos internos si existen
    .replace(/\[META_[A-Z_]+\]:[\s\S]*$/gi, '')
    // Limpiar prefijos entre corchetes como [Soportes Técnicos y Concepto]:
    .replace(/^\[[^\]]+\]:\s*/gim, '')
    .trim();
  return cleaned || 'Aportar los soportes documentales requeridos para este expediente.';
}

function escapeEmailHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseEmailDateSafe(dateInput?: string | Date | null): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    return Number.isNaN(dateInput.getTime()) ? null : dateInput;
  }
  const raw = String(dateInput).trim();
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00-05:00` : raw;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateCompactEs(dateInput?: string | Date | null): string {
  const parsed = parseEmailDateSafe(dateInput);
  if (!parsed) return 'No especificada';
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(parsed);
}

function formatDateMediumWeekdayEs(dateInput?: string | Date | null): string {
  const parsed = parseEmailDateSafe(dateInput);
  if (!parsed) return 'No especificada';
  const formatted = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(parsed);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatDateShortSlashEs(dateInput?: string | Date | null): string {
  const parsed = parseEmailDateSafe(dateInput);
  if (!parsed) return 'No especificada';
  const parts = new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).formatToParts(parsed);
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const year = parts.find((p) => p.type === 'year')?.value || '2026';
  return `${day}/${month}/${year}`;
}

interface HorizontalBentoCell {
  label: string;
  valueHtml: string;
}

function buildHorizontalBentoGrid(cells: [HorizontalBentoCell, HorizontalBentoCell, HorizontalBentoCell, HorizontalBentoCell]): string {
  const [topLeft, topRight, bottomLeft, bottomRight] = cells;
  return `
    <div style="background-color: #F8FAFC; border: 1px solid #DCE4E3; border-radius: 12px; overflow: hidden; margin: 14px 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td width="60%" valign="top" style="width: 60%; padding: 12px 16px; border-bottom: 1px solid #E2E8F0; border-right: 1px solid #E2E8F0;">
            <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; color: #64748B; margin-bottom: 4px;">
              ${escapeEmailHtml(topLeft.label)}
            </div>
            <div style="font-size: 13.5px; font-weight: 700; color: #111827; line-height: 1.4;">
              ${topLeft.valueHtml}
            </div>
          </td>
          <td width="40%" valign="top" style="width: 40%; padding: 12px 16px; border-bottom: 1px solid #E2E8F0;">
            <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; color: #64748B; margin-bottom: 4px;">
              ${escapeEmailHtml(topRight.label)}
            </div>
            <div style="font-size: 13.5px; font-weight: 700; color: #111827; line-height: 1.4;">
              ${topRight.valueHtml}
            </div>
          </td>
        </tr>
        <tr>
          <td width="60%" valign="top" style="width: 60%; padding: 12px 16px; border-right: 1px solid #E2E8F0;">
            <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; color: #64748B; margin-bottom: 4px;">
              ${escapeEmailHtml(bottomLeft.label)}
            </div>
            <div style="font-size: 13.5px; font-weight: 700; color: #111827; line-height: 1.4;">
              ${bottomLeft.valueHtml}
            </div>
          </td>
          <td width="40%" valign="top" style="width: 40%; padding: 12px 16px;">
            <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; color: #64748B; margin-bottom: 4px;">
              ${escapeEmailHtml(bottomRight.label)}
            </div>
            <div style="font-size: 13.5px; font-weight: 700; color: #111827; line-height: 1.4;">
              ${bottomRight.valueHtml}
            </div>
          </td>
        </tr>
      </table>
    </div>
  `;
}

interface CredentialBoxDef {
  widthPct: string;
  label: string;
  valueHtml: string;
}

function buildGoldCredentialsAndCtaCard(options: {
  heading: string;
  email: string;
  boxes: [CredentialBoxDef, CredentialBoxDef, CredentialBoxDef];
  ctaUrl: string;
  ctaLabel: string;
  helperText: string;
}): string {
  const safeHref = escapeEmailHtml(sanitizeEmailActionUrl(options.ctaUrl));
  const [box1, box2, box3] = options.boxes;
  const renderBox = (box: CredentialBoxDef) => `
    <td width="${box.widthPct}" valign="middle" style="background-color: #FFFFFF; border: 1px solid #E7DFC4; border-radius: 10px; padding: 12px 10px; text-align: center; vertical-align: middle;">
      <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: #64748B; margin-bottom: 5px;">
        ${escapeEmailHtml(box.label)}
      </div>
      ${box.valueHtml}
    </td>`;

  return `
    <div style="background-color: #FBF9F4; border: 1px solid #DBD2B0; border-radius: 14px; padding: 20px 24px; margin: 16px 0 8px 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin-bottom: 14px;">
        <tr>
          <td align="left" valign="middle" style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; color: #786832; padding-right: 12px;">
            ${escapeEmailHtml(options.heading)}
          </td>
          <td align="right" valign="middle" style="font-size: 12px; color: #475569; white-space: nowrap;">
            Correo autorizado: <strong style="color: #111827;">${escapeEmailHtml(options.email)}</strong>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%;">
        <tr>
          ${renderBox(box1)}
          <td width="2%" style="font-size: 0; line-height: 0;">&nbsp;</td>
          ${renderBox(box2)}
          <td width="2%" style="font-size: 0; line-height: 0;">&nbsp;</td>
          ${renderBox(box3)}
        </tr>
      </table>

      <div style="text-align: center; margin-top: 18px;">
        <a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #00594E; color: #FFFFFF !important; border: 1px solid #B5A160; border-radius: 10px; padding: 13px 28px; font-size: 14px; font-weight: 700; text-decoration: none; letter-spacing: 0.2px;">
          ${escapeEmailHtml(options.ctaLabel)} &rarr;
        </a>
      </div>

      <p style="margin: 12px 0 0 0; text-align: center; font-size: 11.5px; line-height: 1.45; color: #64748B;">
        ${escapeEmailHtml(options.helperText)}
      </p>
    </div>
  `;
}

function buildEmailLayout(options: {
  title: string;
  headerTitle: string;
  numeroRadicado: string;
  badgeTag?: string;
  bodyHtml: string;
}): string {
  const safeTitle = escapeEmailHtml(options.title);
  const safeHeaderTitle = escapeEmailHtml(options.headerTitle);
  const safeRadicado = escapeEmailHtml(options.numeroRadicado);
  const safeTag = options.badgeTag ? escapeEmailHtml(options.badgeTag) : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F2F7F6; font-family: 'Plus Jakarta Sans', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#F2F7F6" style="background-color: #F2F7F6; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 720px; width: 100%; background-color: #FFFFFF; border-radius: 18px; overflow: hidden; border: 1px solid #DCE4E3; box-shadow: 0 12px 32px rgba(0, 89, 78, 0.08);">
          <!-- CABECERA INSTITUCIONAL UNITRÓPICO COMPACTA -->
          <tr>
            <td style="background-color: #00594E; border-bottom: 4px solid #B5A160; padding: 22px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="left" valign="middle" style="padding-right: 16px;">
                    <p style="margin: 0 0 5px 0; font-size: 10.5px; letter-spacing: 1.4px; font-weight: 700; color: #B5A160; text-transform: uppercase;">
                      UNITRÓPICO &middot; UNIVERSIDAD INTERNACIONAL DEL TRÓPICO AMERICANO
                    </p>
                    <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #FFFFFF; line-height: 1.25;">
                      ${safeHeaderTitle}
                    </h1>
                    ${safeTag ? `<div style="margin-top: 6px; font-size: 11px; font-weight: 700; color: #F7F5EE; letter-spacing: 0.3px;">${safeTag}</div>` : ''}
                  </td>
                  <td align="right" valign="middle" style="white-space: nowrap;">
                    <div style="display: inline-block; background-color: #00443B; color: #FFFFFF; border: 1px solid #B5A160; border-radius: 999px; padding: 7px 15px; font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; font-size: 13px; font-weight: 800; letter-spacing: 0.7px; white-space: nowrap;">
                      ${safeRadicado}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CUERPO DEL MENSAJE -->
          <tr>
            <td style="padding: 24px 32px 22px 32px; background-color: #FFFFFF;">
              ${options.bodyHtml}
            </td>
          </tr>

          <!-- PIE DE CORREO INSTITUCIONAL LIMPIO -->
          <tr>
            <td style="background-color: #F8FAFC; border-top: 1px solid #DCE4E3; padding: 18px 24px; text-align: center; font-size: 12px; color: #64748B; line-height: 1.55;">
              Universidad Internacional del Trópico Americano - Unitrópico &middot; Sede Yopal, Casanare, Colombia &middot; Sistema Institucional de Gestión Documental
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * 1. Correo de Confirmación de Radicación al Solicitante
 */
export async function sendRadicacionSolicitanteEmail(
  params: EmailRadicacionSolicitanteParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const subject = `[Radicado ${params.numeroRadicado}] Confirmación de Radicación Oficial - Unitrópico`;
  const fechaRadicadoTxt = formatDateCompactEs(params.fechaRadicacion);
  const fechaLimiteSlash = formatDateShortSlashEs(params.fechaLimiteEntrega);
  const prioridadTxt = params.prioridad || 'Media';
  const categoriaTxt = params.categoria || 'Petición General';

  const bentoCard = buildHorizontalBentoGrid([
    { label: 'Asunto', valueHtml: escapeEmailHtml(params.asunto) },
    { label: 'Fecha de Radicación', valueHtml: escapeEmailHtml(fechaRadicadoTxt) },
    { label: 'Solicitante', valueHtml: `<strong style="color:#00594E;">${escapeEmailHtml(params.solicitanteNombre)}</strong>` },
    { label: 'Clasificación y Prioridad', valueHtml: `${escapeEmailHtml(categoriaTxt)} &middot; <strong style="color:#786832;">Prioridad ${escapeEmailHtml(prioridadTxt)}</strong>` },
  ]);

  const docBox = params.nombreDocumento
    ? `
      <div style="background-color: #F2F7F6; border: 1px solid #B2CFCB; border-left: 4px solid #00594E; border-radius: 10px; padding: 12px 16px; margin: 14px 0;">
        <div style="font-size: 10.5px; font-weight: 800; color: #00594E; text-transform: uppercase; letter-spacing: 0.6px;">
          Documento Base Custodiado
        </div>
        <div style="font-size: 13.5px; font-weight: 700; color: #111827; margin-top: 3px;">
          ${escapeEmailHtml(params.nombreDocumento)}
        </div>
      </div>`
    : '';

  const credentialsAndCtaCard = buildGoldCredentialsAndCtaCard({
    heading: 'Credenciales de Seguimiento Ciudadano',
    email: params.toEmail,
    boxes: [
      {
        widthPct: '34%',
        label: 'Número de Radicado',
        valueHtml: `<div style="font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; font-size: 14.5px; font-weight: 800; color: #00594E; letter-spacing: 0.4px; white-space: nowrap;">${escapeEmailHtml(params.numeroRadicado)}</div>`,
      },
      {
        widthPct: '30%',
        label: 'PIN de Consulta',
        valueHtml: `<div style="font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; font-size: 17px; font-weight: 800; color: #00594E; letter-spacing: 2.5px; white-space: nowrap;">${escapeEmailHtml(params.pinAcceso)}</div>`,
      },
      {
        widthPct: '32%',
        label: 'Límite de Respuesta',
        valueHtml: `<div style="font-size: 11px; font-weight: 600; color: #64748B; line-height: 1.25;">${params.totalDependencias || 1} dependencia(s)</div><div style="font-size: 13px; font-weight: 800; color: #786832; margin-top: 2px; white-space: nowrap;">Hasta el ${escapeEmailHtml(fechaLimiteSlash)}</div>`,
      },
    ],
    ctaUrl: params.consultaUrl,
    ctaLabel: 'Consultar Estado del Radicado',
    helperText: 'Conserve este PIN de 6 dígitos o acceda desde el botón superior para verificar el estado de su trámite.',
  });

  const bodyHtml = `
    <p style="margin: 0 0 6px 0; font-size: 16px; font-weight: 800; color: #00594E;">
      Estimado(a) ${escapeEmailHtml(params.solicitanteNombre)},
    </p>
    <p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.6; color: #475569;">
      Le confirmamos que su solicitud ha sido radicada oficialmente en el Sistema Institucional de Gestión Documental de la Universidad Internacional del Trópico Americano — Unitrópico y ya se encuentra en trámite ante las dependencias competentes.
    </p>
    ${bentoCard}
    ${docBox}
    ${credentialsAndCtaCard}
  `;

  const html = buildEmailLayout({
    title: subject,
    headerTitle: 'Confirmación de Radicación Oficial',
    numeroRadicado: params.numeroRadicado,
    bodyHtml,
  });

  return dispatchSmtpMail({
    fromLabel: 'Radicación Oficial Unitrópico',
    toEmail: params.toEmail,
    subject,
    html,
    logTag: 'RADICACION SOLICITANTE',
  });
}

/**
 * 2. Correo de Asignación de Subcarpeta y Requerimiento a Dependencias
 */
export async function sendPeticionAssignmentEmail(
  params: EmailPeticionNotificationParams
): Promise<{ success: boolean; simulated?: boolean; messageId?: string; error?: string; needsSmtpConfig?: boolean }> {
  const formattedRadicacion = formatDateCompactEs(params.fechaRadicacion);
  const formattedDeadline = formatDateMediumWeekdayEs(params.fechaLimiteResponsable || params.fechaLimiteEntrega);
  const prioridadBadge = params.prioridad || 'Media';
  const categoriaLegal = params.categoria || 'Petición General';
  const cleanInstrucciones = limpiarTextoRequerimiento(params.instruccionesAnexos);

  const subject = `[Radicado ${params.numeroRadicado}] Asignación de Subcarpeta y Soportes - Prioridad ${prioridadBadge}`;

  const bentoCard = buildHorizontalBentoGrid([
    { label: 'Asunto', valueHtml: escapeEmailHtml(params.asunto) },
    { label: 'Fecha de Radicación', valueHtml: escapeEmailHtml(formattedRadicacion) },
    { label: 'Dependencia Asignada', valueHtml: `<strong style="color:#00594E;">${escapeEmailHtml(params.oficinaNombre)}</strong>` },
    {
      label: 'Clasificación y Prioridad',
      valueHtml: `${escapeEmailHtml(categoriaLegal)} &middot; <strong style="color:#786832;">Prioridad ${escapeEmailHtml(prioridadBadge)}</strong>`,
    },
  ]);

  const validSubcarpetas = Array.isArray(params.subcarpetas)
    ? params.subcarpetas.filter((s) => s && s.nombre && !String(s.nombre).toUpperCase().includes('RESPUESTA_META'))
    : [];

  const subcarpetasHtml =
    validSubcarpetas.length > 0
      ? `
        <div style="background-color: #FFFFFF; border: 1px solid #DCE4E3; border-left: 4px solid #B5A160; border-radius: 12px; padding: 15px 18px; margin: 14px 0;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; color: #786832; margin-bottom: 10px;">
            Subcarpeta(s) Asignada(s) a su Dependencia (${validSubcarpetas.length})
          </div>
          ${validSubcarpetas
            .map((sub) => {
              const cleanSubDesc = sub.descripcion ? limpiarTextoRequerimiento(sub.descripcion) : '';
              return `
              <div style="background-color: #F8FAFC; border: 1px solid #DCE4E3; border-left: 4px solid #00594E; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px;">
                <div style="font-size: 13.5px; font-weight: 800; color: #00594E;">
                  ${escapeEmailHtml(sub.nombre)}
                </div>
                ${cleanSubDesc ? `<div style="font-size: 13px; color: #334155; margin-top: 4px; line-height: 1.5; white-space: pre-wrap;">${escapeEmailHtml(cleanSubDesc)}</div>` : ''}
              </div>`;
            })
            .join('')}
        </div>`
      : `
        <div style="background-color: #FFFFFF; border: 1px solid #DCE4E3; border-left: 4px solid #B5A160; border-radius: 12px; padding: 15px 18px; margin: 14px 0;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; color: #786832; margin-bottom: 6px;">
            Requerimiento y Anexos Solicitados
          </div>
          <div style="font-size: 13.5px; color: #111827; line-height: 1.6; white-space: pre-wrap;">${escapeEmailHtml(cleanInstrucciones)}</div>
        </div>`;

  const codigoPinHtml = params.pinAcceso
    ? `<div style="font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; font-size: 14px; font-weight: 800; color: #00594E; letter-spacing: 0.3px; white-space: nowrap;">${escapeEmailHtml(params.codigoAcceso)}</div>
       <div style="font-size: 11px; font-weight: 700; color: #475569; margin-top: 3px; white-space: nowrap;">PIN: <span style="font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; color: #00594E; font-weight: 800; letter-spacing: 1px;">${escapeEmailHtml(params.pinAcceso)}</span></div>`
    : `<div style="font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; font-size: 15px; font-weight: 800; color: #00594E; letter-spacing: 0.5px; white-space: nowrap;">${escapeEmailHtml(params.codigoAcceso)}</div>`;

  const credentialsAndCtaCard = buildGoldCredentialsAndCtaCard({
    heading: 'Credenciales de Acceso al Portal de Dependencias',
    email: params.toEmail,
    boxes: [
      {
        widthPct: '33%',
        label: 'Número de Radicado',
        valueHtml: `<div style="font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; font-size: 14.5px; font-weight: 800; color: #00594E; letter-spacing: 0.4px; white-space: nowrap;">${escapeEmailHtml(params.numeroRadicado)}</div>`,
      },
      {
        widthPct: '32%',
        label: 'Código / PIN de Acceso',
        valueHtml: codigoPinHtml,
      },
      {
        widthPct: '31%',
        label: 'Fecha Límite de Entrega',
        valueHtml: `<div style="font-size: 12.5px; font-weight: 800; color: #786832; line-height: 1.35;">${escapeEmailHtml(formattedDeadline)}</div><div style="font-size: 10.5px; font-weight: 600; color: #64748B; margin-top: 2px;">Hora límite: 23:59</div>`,
      },
    ],
    ctaUrl: params.portalUrl,
    ctaLabel: 'Ingresar al Portal y Cargar Soportes',
    helperText: 'Ingrese desde el botón superior o utilice sus credenciales antes de la fecha límite indicada para cargar sus soportes.',
  });

  const bodyHtml = `
    <p style="margin: 0 0 6px 0; font-size: 16px; font-weight: 800; color: #00594E;">
      Estimado(a) responsable de ${escapeEmailHtml(params.oficinaNombre)},
    </p>
    <p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.6; color: #475569;">
      Le notificamos formalmente la asignación de una solicitud institucional en la cual su dependencia debe aportar los soportes documentales y conceptos requeridos dentro del término establecido.
    </p>
    ${bentoCard}
    ${subcarpetasHtml}
    ${credentialsAndCtaCard}
  `;

  const html = buildEmailLayout({
    title: subject,
    headerTitle: 'Asignación Oficial de Soportes Documentales',
    numeroRadicado: params.numeroRadicado,
    bodyHtml,
  });

  return dispatchSmtpMail({
    fromLabel: 'Sistema de Radicación Unitrópico',
    toEmail: params.toEmail,
    subject,
    html,
    logTag: 'SMTP ASIGNACION',
  });
}

/**
 * 3. Correo de Recordatorio Preventivo a 3 días o menos de vencer para Dependencias
 */
export async function enviarCorreoRecordatorioDependencia(
  params: EmailRecordatorioDependenciaParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const dias = Math.max(0, Math.round(params.diasRestantes));
  const diasLabel = dias === 0 ? 'Vence Hoy' : dias === 1 ? 'Queda 1 día' : `Quedan ${dias} días`;
  const subject = `Recordatorio de Vencimiento Próximo (${diasLabel}) - Radicado ${params.numeroRadicado}`;

  const formattedLimite = formatDateMediumWeekdayEs(params.fechaLimiteDependencia);
  const formattedRadicacion = formatDateCompactEs(params.fechaRadicacion);
  const categoriaTxt = params.categoria || 'Petición General';
  const prioridadTxt = params.prioridad || 'Alta';
  const instruccionTexto = limpiarTextoRequerimiento(params.instruccionSubcarpeta);

  const mensajeUrgencia =
    dias === 0
      ? `Le informamos que <strong>hoy vence el plazo interno</strong> asignado a su dependencia para cargar el soporte pendiente del radicado <strong>${escapeEmailHtml(params.numeroRadicado)}</strong>.`
      : `Le recordamos que faltan <strong>${dias} día${dias === 1 ? '' : 's'} calendario</strong> para que venza el plazo interno asignado a su dependencia para cargar el soporte pendiente del radicado <strong>${escapeEmailHtml(params.numeroRadicado)}</strong>.`;

  const bentoCard = buildHorizontalBentoGrid([
    { label: 'Asunto', valueHtml: escapeEmailHtml(params.tituloPeticion) },
    { label: 'Fecha de Radicación', valueHtml: escapeEmailHtml(formattedRadicacion) },
    { label: 'Dependencia Asignada', valueHtml: `<strong style="color:#00594E;">${escapeEmailHtml(params.oficinaNombre)}</strong>` },
    {
      label: 'Clasificación y Prioridad',
      valueHtml: `${escapeEmailHtml(categoriaTxt)} &middot; <strong style="color:#786832;">Prioridad ${escapeEmailHtml(prioridadTxt)}</strong>`,
    },
  ]);

  const subcarpetaBox = `
    <div style="background-color: #FFFFFF; border: 1px solid #DCE4E3; border-left: 4px solid #B5A160; border-radius: 12px; padding: 15px 18px; margin: 14px 0;">
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; color: #786832; margin-bottom: 6px;">
        Subcarpeta Asignada Pendiente de Soporte
      </div>
      <div style="font-size: 14px; font-weight: 800; color: #00594E; margin-bottom: 4px;">
        ${escapeEmailHtml(params.nombreSubcarpeta)}
      </div>
      <div style="font-size: 13px; color: #334155; line-height: 1.55; white-space: pre-wrap;">${escapeEmailHtml(instruccionTexto)}</div>
    </div>
  `;

  const codigoPinHtml = params.pinAcceso
    ? `<div style="font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; font-size: 14px; font-weight: 800; color: #00594E; letter-spacing: 0.3px; white-space: nowrap;">${escapeEmailHtml(params.codigoAccesoDependencia)}</div>
       <div style="font-size: 11px; font-weight: 700; color: #475569; margin-top: 3px; white-space: nowrap;">PIN: <span style="font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; color: #00594E; font-weight: 800; letter-spacing: 1px;">${escapeEmailHtml(params.pinAcceso)}</span></div>`
    : `<div style="font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; font-size: 15px; font-weight: 800; color: #00594E; letter-spacing: 0.5px; white-space: nowrap;">${escapeEmailHtml(params.codigoAccesoDependencia)}</div>`;

  const credentialsAndCtaCard = buildGoldCredentialsAndCtaCard({
    heading: 'Credenciales de Acceso al Portal de Dependencias',
    email: params.toEmail,
    boxes: [
      {
        widthPct: '33%',
        label: 'Número de Radicado',
        valueHtml: `<div style="font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; font-size: 14.5px; font-weight: 800; color: #00594E; letter-spacing: 0.4px; white-space: nowrap;">${escapeEmailHtml(params.numeroRadicado)}</div>`,
      },
      {
        widthPct: '32%',
        label: 'Código / PIN de Acceso',
        valueHtml: codigoPinHtml,
      },
      {
        widthPct: '31%',
        label: 'Fecha Límite de Entrega',
        valueHtml: `<div style="font-size: 12.5px; font-weight: 800; color: #DC2626; line-height: 1.35;">${escapeEmailHtml(formattedLimite)}</div><div style="font-size: 10.5px; font-weight: 700; color: #786832; margin-top: 2px;">${escapeEmailHtml(diasLabel)}</div>`,
      },
    ],
    ctaUrl: params.portalUrl,
    ctaLabel: 'Subir Soporte Ahora en el Portal',
    helperText: 'El sistema aún no registra aportes cargados para esta subcarpeta. Ingrese desde el botón superior antes de la fecha límite.',
  });

  const bodyHtml = `
    <div style="display: inline-block; background-color: #F7F5EE; color: #786832; border: 1px solid #DBD2B0; border-radius: 999px; padding: 4px 12px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 10px;">
      Recordatorio Preventivo &middot; ${escapeEmailHtml(diasLabel)}
    </div>
    <p style="margin: 0 0 6px 0; font-size: 16px; font-weight: 800; color: #00594E;">
      Estimado(a) responsable de ${escapeEmailHtml(params.oficinaNombre)},
    </p>
    <p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.6; color: #475569;">
      ${mensajeUrgencia}
    </p>
    ${bentoCard}
    ${subcarpetaBox}
    ${credentialsAndCtaCard}
  `;

  const html = buildEmailLayout({
    title: subject,
    headerTitle: 'Aviso de Vencimiento Próximo',
    numeroRadicado: params.numeroRadicado,
    bodyHtml,
  });

  return dispatchSmtpMail({
    fromLabel: 'Sistema de Alertas SGD Unitrópico',
    toEmail: params.toEmail,
    subject,
    html,
    logTag: 'RECORDATORIO 3D',
  });
}

/**
 * 4. Correo de Respuesta Oficial Final al Solicitante (diseño horizontal 720px sin adjuntos físicos)
 */
export async function sendRespuestaSolicitanteEmail(
  params: EmailRespuestaSolicitanteParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const formattedExpiracionSlash = formatDateShortSlashEs(params.fechaExpiracion);
  const formattedRadicacion = formatDateCompactEs(params.fechaRadicacion);
  const cleanPronunciamiento = String(params.mensajeRespuesta || '')
    .replace(/\[RESPUESTA_META\]:\s*\{[\s\S]*?\}(?=\n|$)/gi, '')
    .replace(/\[RESPUESTA_META\]:[\s\S]*$/gi, '')
    .replace(/\[META_[A-Z_]+\]:[\s\S]*$/gi, '')
    .trim();
  const subject = `[Radicado N° ${params.numeroRadicado}] Notificación oficial de respuesta a su petición - Unitrópico`;

  const bentoCard = buildHorizontalBentoGrid([
    { label: 'Asunto', valueHtml: escapeEmailHtml(params.asunto) },
    { label: 'Fecha de Radicación', valueHtml: escapeEmailHtml(formattedRadicacion) },
    { label: 'Emitido Por', valueHtml: `<strong style="color:#00594E;">${escapeEmailHtml(params.funcionarioNombre)}</strong>` },
    { label: 'Solicitante', valueHtml: escapeEmailHtml(params.solicitanteNombre) },
  ]);

  const respuestaMessageBox = `
    <div style="background-color: #FFFFFF; border: 1px solid #DCE4E3; border-left: 4px solid #00594E; border-radius: 12px; padding: 16px 20px; margin: 14px 0;">
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #00594E; margin-bottom: 8px;">
        Pronunciamiento Oficial de la Institución
      </div>
      <div style="font-size: 14px; color: #111827; line-height: 1.65; white-space: pre-wrap;">${escapeEmailHtml(cleanPronunciamiento)}</div>
    </div>
  `;

  const buildSafeConsultaUrl = () => {
    const rawUrl = String(params.consultaUrl || '').trim();
    if (!rawUrl) return rawUrl;
    try {
      const parsed = new URL(rawUrl);
      if (!parsed.searchParams.get('radicado') && params.numeroRadicado) {
        parsed.searchParams.set('radicado', params.numeroRadicado);
      }
      if (!parsed.searchParams.get('email') && !parsed.searchParams.get('correo') && params.toEmail) {
        parsed.searchParams.set('email', String(params.toEmail).trim().toLowerCase());
      }
      if (!parsed.searchParams.get('pin') && params.pinSolicitante) {
        parsed.searchParams.set('pin', params.pinSolicitante);
      }
      return parsed.toString();
    } catch {
      const hasEmail = /[?&](email|correo)=/i.test(rawUrl);
      if (hasEmail || !params.toEmail) return rawUrl;
      const sep = rawUrl.includes('?') ? '&' : '?';
      return `${rawUrl}${sep}email=${encodeURIComponent(String(params.toEmail).trim().toLowerCase())}`;
    }
  };
  const safeConsultaUrl = buildSafeConsultaUrl();

  const credentialsAndCtaCard = buildGoldCredentialsAndCtaCard({
    heading: 'Credenciales y Enlace de Consulta del Expediente',
    email: params.toEmail,
    boxes: [
      {
        widthPct: '34%',
        label: 'Número de Radicado',
        valueHtml: `<div style="font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; font-size: 14.5px; font-weight: 800; color: #00594E; letter-spacing: 0.4px; white-space: nowrap;">${escapeEmailHtml(params.numeroRadicado)}</div>`,
      },
      {
        widthPct: '30%',
        label: 'PIN de Consulta',
        valueHtml: `<div style="font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; font-size: 17px; font-weight: 800; color: #00594E; letter-spacing: 2.5px; white-space: nowrap;">${escapeEmailHtml(params.pinSolicitante)}</div>`,
      },
      {
        widthPct: '32%',
        label: 'Expiración del Enlace',
        valueHtml: `<div style="font-size: 11px; font-weight: 600; color: #64748B; line-height: 1.25;">Vigencia: 10 días</div><div style="font-size: 13px; font-weight: 800; color: #786832; margin-top: 2px; white-space: nowrap;">Hasta el ${escapeEmailHtml(formattedExpiracionSlash)}</div>`,
      },
    ],
    ctaUrl: safeConsultaUrl,
    ctaLabel: 'Abrir Portal de Respuestas y Descargar Documentos',
    helperText: 'Ingrese desde el botón superior o digite su Número de Radicado y PIN antes de la fecha de expiración indicada.',
  });

  const driveHtml = params.driveUrl
    ? `
      <div style="background-color: #F2F7F6; border: 1px solid #B2CFCB; border-radius: 10px; padding: 12px 16px; margin: 14px 0 6px 0; text-align: center;">
        <div style="font-size: 11px; font-weight: 800; color: #00594E; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
          Repositorio Documental Complementario
        </div>
        <a href="${escapeEmailHtml(params.driveUrl)}" target="_blank" rel="noopener noreferrer" style="color: #00594E; font-size: 13px; font-weight: 700; text-decoration: underline;">
          Abrir carpeta complementaria compartida &rarr;
        </a>
      </div>`
    : '';

  const bodyHtml = `
    <p style="margin: 0 0 6px 0; font-size: 16px; font-weight: 800; color: #00594E;">
      Estimado(a) ${escapeEmailHtml(params.solicitanteNombre)},
    </p>
    <p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.6; color: #475569;">
      La Universidad Internacional del Trópico Americano — Unitrópico le notifica formalmente la respuesta oficial emitida frente a su solicitud radicada en nuestro sistema documental.
    </p>
    ${bentoCard}
    ${respuestaMessageBox}
    ${credentialsAndCtaCard}
    ${driveHtml}
  `;

  const html = buildEmailLayout({
    title: subject,
    headerTitle: 'Respuesta Oficial a su Solicitud',
    numeroRadicado: params.numeroRadicado,
    bodyHtml,
  });

  // Política de cero adjuntos físicos por correo: los documentos oficiales se descargan únicamente desde el Portal Institucional.
  return dispatchSmtpMail({
    fromLabel: 'Correspondencia Oficial Unitrópico',
    toEmail: params.toEmail,
    subject,
    html,
    logTag: 'RESPUESTA SOLICITANTE',
  });
}

/**
 * 5. Correo de Devolución / Rechazo de Aporte Documental a Dependencia Responsable
 */
export async function enviarCorreoRechazoAporteDependencia(
  params: EmailRechazoAporteParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const subject = `Devolución de Soporte Documental (${params.nombreSubcarpeta}) - Radicado ${params.numeroRadicado}`;
  const formattedLimite = params.fechaLimiteDependencia
    ? formatDateMediumWeekdayEs(params.fechaLimiteDependencia)
    : 'Vigente según asignación';

  const bentoCard = buildHorizontalBentoGrid([
    { label: 'Asunto del Expediente', valueHtml: escapeEmailHtml(params.tituloPeticion) },
    { label: 'Dependencia Responsable', valueHtml: `<strong style="color:#00594E;">${escapeEmailHtml(params.oficinaNombre)}</strong>` },
    { label: 'Subcarpeta Evaluada', valueHtml: `<strong style="color:#786832;">${escapeEmailHtml(params.nombreSubcarpeta)}</strong>` },
    { label: 'Archivo Devuelto', valueHtml: `<span style="color:#DC2626;font-weight:700;">${escapeEmailHtml(params.archivoRechazado)}</span>` },
  ]);

  const rejectionBox = `
    <div style="background-color: #FFFFFF; border: 1px solid #FECACA; border-left: 4px solid #DC2626; border-radius: 12px; padding: 15px 18px; margin: 14px 0;">
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; color: #DC2626; margin-bottom: 6px;">
        Motivo de Devolución / Corrección Requerida
      </div>
      <div style="font-size: 13.5px; color: #1E293B; line-height: 1.6; white-space: pre-wrap;">${escapeEmailHtml(params.motivoRechazo)}</div>
      ${
        params.revisadoPor
          ? `<div style="margin-top: 8px; font-size: 11px; color: #64748B; font-weight: 700;">Revisado por: ${escapeEmailHtml(params.revisadoPor)}</div>`
          : ''
      }
    </div>
  `;

  const codigoPinHtml = params.pinAcceso
    ? `<div style="font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; font-size: 14px; font-weight: 800; color: #00594E; letter-spacing: 0.3px; white-space: nowrap;">${escapeEmailHtml(params.codigoAccesoDependencia)}</div>
       <div style="font-size: 11px; font-weight: 700; color: #475569; margin-top: 3px; white-space: nowrap;">PIN: <span style="font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; color: #00594E; font-weight: 800; letter-spacing: 1px;">${escapeEmailHtml(params.pinAcceso)}</span></div>`
    : `<div style="font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; font-size: 15px; font-weight: 800; color: #00594E; letter-spacing: 0.5px; white-space: nowrap;">${escapeEmailHtml(params.codigoAccesoDependencia)}</div>`;

  const credentialsAndCtaCard = buildGoldCredentialsAndCtaCard({
    heading: 'Credenciales para Subir el Nuevo Soporte Corregido',
    email: params.toEmail,
    boxes: [
      {
        widthPct: '33%',
        label: 'Número de Radicado',
        valueHtml: `<div style="font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; font-size: 14.5px; font-weight: 800; color: #00594E; letter-spacing: 0.4px; white-space: nowrap;">${escapeEmailHtml(params.numeroRadicado)}</div>`,
      },
      {
        widthPct: '32%',
        label: 'Código / PIN de Acceso',
        valueHtml: codigoPinHtml,
      },
      {
        widthPct: '31%',
        label: 'Plazo de Subsanación',
        valueHtml: `<div style="font-size: 12.5px; font-weight: 800; color: #786832; line-height: 1.35;">${escapeEmailHtml(formattedLimite)}</div>`,
      },
    ],
    ctaUrl: params.portalUrl,
    ctaLabel: 'Ingresar al Portal y Subir Soporte Corregido',
    helperText: 'El estado de entrega de esta subcarpeta ha vuelto a Pendiente hasta que cargue el soporte corregido en el portal.',
  });

  const bodyHtml = `
    <div style="display: inline-block; background-color: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; border-radius: 999px; padding: 4px 12px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 10px;">
      Revisión de Aportes &middot; Corrección Solicitada
    </div>
    <p style="margin: 0 0 6px 0; font-size: 16px; font-weight: 800; color: #00594E;">
      Estimado(a) responsable de ${escapeEmailHtml(params.oficinaNombre)},
    </p>
    <p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.6; color: #475569;">
      Le informamos que el soporte documental cargado en el radicado <strong>${escapeEmailHtml(params.numeroRadicado)}</strong> fue devuelto durante la validación interna de Secretaría General y requiere ser corregido y cargado nuevamente.
    </p>
    ${bentoCard}
    ${rejectionBox}
    ${credentialsAndCtaCard}
  `;

  const html = buildEmailLayout({
    title: subject,
    headerTitle: 'Notificación de Devolución Documental',
    numeroRadicado: params.numeroRadicado,
    bodyHtml,
  });

  return dispatchSmtpMail({
    fromLabel: 'Revisión Documental Unitrópico',
    toEmail: params.toEmail,
    subject,
    html,
    logTag: 'RECHAZO APORTE',
  });
}
