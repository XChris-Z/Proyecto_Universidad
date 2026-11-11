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
  nombreSubcarpeta: string;
  instruccionSubcarpeta?: string | null;
  fechaRadicacion?: string | null;
  fechaLimiteDependencia: string;
  diasRestantes: number;
  codigoAccesoDependencia: string;
  pinAcceso?: string | null;
  portalUrl: string;
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

  if (options.attachments && options.attachments.length > 0) {
    mailOptions.attachments = options.attachments;
  }

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

function escapeEmailHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateLongEs(raw?: string | null): string {
  if (!raw) {
    return new Date().toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
  const normalized = raw.includes('T') ? raw : `${raw}T12:00:00`;
  const parsed = new Date(normalized);
  if (isNaN(parsed.getTime())) return String(raw);
  return parsed.toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface BentoRowItem {
  label: string;
  valueHtml: string;
}

interface SlaBarConfig {
  label: string;
  statusRight: string;
  greenPct: number;
  goldPct: number;
  legendLeft: string;
  legendRight: string;
}

function buildBentoDataCard(rows: BentoRowItem[], sla?: SlaBarConfig): string {
  const rowsHtml = rows
    .map(
      (row, idx) => `
      <tr>
        <td style="padding: 9px 0; width: 36%; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748B; vertical-align: top; ${idx < rows.length - 1 ? 'border-bottom: 1px solid #E2E8F0;' : ''}">
          ${escapeEmailHtml(row.label)}
        </td>
        <td style="padding: 9px 0 9px 12px; font-size: 13.5px; font-weight: 600; color: #111827; vertical-align: top; line-height: 1.45; ${idx < rows.length - 1 ? 'border-bottom: 1px solid #E2E8F0;' : ''}">
          ${row.valueHtml}
        </td>
      </tr>`
    )
    .join('');

  const greenWidth = sla ? Math.max(0, Math.min(100, Math.round(sla.greenPct))) : 0;
  const goldWidth = sla ? Math.max(0, Math.min(100 - greenWidth, Math.round(sla.goldPct))) : 0;
  const trackWidth = sla ? Math.max(0, 100 - greenWidth - goldWidth) : 100;

  const slaHtml = sla
    ? `
      <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid #E2E8F0;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 6px;">
          <tr>
            <td style="font-size: 11.5px; font-weight: 700; color: #475569; text-align: left;">
              ${escapeEmailHtml(sla.label)}
            </td>
            <td style="font-size: 11.5px; font-weight: 800; color: #00594E; text-align: right;">
              ${escapeEmailHtml(sla.statusRight)}
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #E2E8F0; border-radius: 999px; overflow: hidden;">
          <tr>
            ${greenWidth > 0 ? `<td width="${greenWidth}%" style="height: 8px; background-color: #00594E; font-size: 0; line-height: 0;">&nbsp;</td>` : ''}
            ${goldWidth > 0 ? `<td width="${goldWidth}%" style="height: 8px; background-color: #B5A160; font-size: 0; line-height: 0;">&nbsp;</td>` : ''}
            ${trackWidth > 0 ? `<td width="${trackWidth}%" style="height: 8px; background-color: #E2E8F0; font-size: 0; line-height: 0;">&nbsp;</td>` : ''}
          </tr>
        </table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 6px;">
          <tr>
            <td style="font-size: 11px; color: #00594E; font-weight: 600; text-align: left;">
              &#9679; ${escapeEmailHtml(sla.legendLeft)}
            </td>
            <td style="font-size: 11px; color: #786832; font-weight: 600; text-align: right;">
              &#9679; ${escapeEmailHtml(sla.legendRight)}
            </td>
          </tr>
        </table>
      </div>`
    : '';

  return `
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-left: 4px solid #00594E; border-radius: 12px; padding: 16px 18px; margin: 18px 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        ${rowsHtml}
      </table>
      ${slaHtml}
    </div>
  `;
}

function buildCredentialsBox(options: {
  heading: string;
  email: string;
  items: Array<{ label: string; value: string }>;
  footnote: string;
}): string {
  const cellsHtml = options.items
    .map(
      (item) => `
      <td style="padding: 6px; vertical-align: top;">
        <div style="background-color: #FFFFFF; border: 1px solid #DBD2B0; border-radius: 10px; padding: 12px 14px; text-align: center;">
          <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; color: #786832; margin-bottom: 5px;">
            ${escapeEmailHtml(item.label)}
          </div>
          <div style="font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; font-size: 20px; font-weight: 800; letter-spacing: 2px; color: #00594E;">
            ${escapeEmailHtml(item.value)}
          </div>
        </div>
      </td>`
    )
    .join('');

  return `
    <div style="background-color: #F7F5EE; border: 1px solid #DBD2B0; border-radius: 12px; padding: 18px 20px; margin: 20px 0; text-align: center;">
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.9px; color: #786832; margin-bottom: 4px;">
        ${escapeEmailHtml(options.heading)}
      </div>
      <div style="font-size: 12.5px; color: #475569; margin-bottom: 12px;">
        Correo autorizado: <strong style="color: #111827;">${escapeEmailHtml(options.email)}</strong>
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          ${cellsHtml}
        </tr>
      </table>
      <div style="font-size: 11.5px; color: #786832; margin-top: 10px; line-height: 1.45;">
        ${escapeEmailHtml(options.footnote)}
      </div>
    </div>
  `;
}

function buildCtaButton(href: string, label: string): string {
  const safeHref = escapeEmailHtml(href);
  return `
    <div style="text-align: center; margin: 26px 0 18px 0;">
      <a
        href="${safeHref}"
        target="_blank"
        rel="noopener noreferrer"
        style="display: inline-block; background-color: #00594E; border: 1.5px solid #B5A160; color: #FFFFFF !important; padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 700; text-decoration: none; letter-spacing: 0.2px;"
      >
        ${escapeEmailHtml(label)} &rarr;
      </a>
      <div style="font-size: 11.5px; color: #64748B; margin-top: 10px; line-height: 1.5;">
        Si el botón no abre automáticamente, copie e ingrese en:<br />
        <a href="${safeHref}" style="color: #00594E; word-break: break-all; font-weight: 600;">${safeHref}</a>
      </div>
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
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#F2F7F6" style="background-color: #F2F7F6; padding: 28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 620px; width: 100%; background-color: #FFFFFF; border-radius: 18px; overflow: hidden; border: 1px solid #DCE4E3; box-shadow: 0 12px 32px rgba(0, 89, 78, 0.08);">
          <!-- CABECERA INSTITUCIONAL UNITRÓPICO -->
          <tr>
            <td style="background-color: #00594E; border-bottom: 4px solid #B5A160; padding: 28px 28px 24px 28px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 11px; letter-spacing: 1.5px; font-weight: 700; color: #B5A160; text-transform: uppercase;">
                UNITRÓPICO &middot; UNIVERSIDAD INTERNACIONAL DEL TRÓPICO AMERICANO
              </p>
              <h1 style="margin: 0 0 14px 0; font-size: 22px; font-weight: 800; color: #FFFFFF; line-height: 1.25;">
                ${safeHeaderTitle}
              </h1>
              <div style="display: inline-block; background-color: #00443B; color: #FFFFFF; border: 1px solid #B5A160; border-radius: 999px; padding: 6px 16px; font-family: 'JetBrains Mono', Consolas, ui-monospace, monospace; font-size: 13px; font-weight: 800; letter-spacing: 0.7px;">
                ${safeRadicado}
              </div>
              ${safeTag ? `<div style="margin-top: 8px; font-size: 11px; font-weight: 700; color: #F7F5EE; letter-spacing: 0.4px;">${safeTag}</div>` : ''}
            </td>
          </tr>

          <!-- CUERPO DEL MENSAJE -->
          <tr>
            <td style="padding: 28px 28px 24px 28px; background-color: #FFFFFF;">
              ${options.bodyHtml}
            </td>
          </tr>

          <!-- PIE DE CORREO INSTITUCIONAL LIMPIO -->
          <tr>
            <td style="background-color: #F8FAFC; border-top: 1px solid #DCE4E3; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748B; line-height: 1.6;">
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
  const fechaRadicadoTxt = formatDateLongEs(params.fechaRadicacion);
  const fechaLimiteTxt = formatDateLongEs(params.fechaLimiteEntrega);
  const prioridadTxt = params.prioridad || 'Media';
  const categoriaTxt = params.categoria || 'Petición General (CP art. 23)';

  const bentoCard = buildBentoDataCard(
    [
      { label: 'Asunto', valueHtml: escapeEmailHtml(params.asunto) },
      { label: 'Solicitante', valueHtml: escapeEmailHtml(params.solicitanteNombre) },
      { label: 'Clasificación y Prioridad', valueHtml: `${escapeEmailHtml(categoriaTxt)} &middot; <strong style="color:#00594E;">Prioridad ${escapeEmailHtml(prioridadTxt)}</strong>` },
      { label: 'Fecha de Radicación', valueHtml: escapeEmailHtml(fechaRadicadoTxt) },
      { label: 'Fecha Límite de Respuesta', valueHtml: `<strong style="color:#00594E;">${escapeEmailHtml(fechaLimiteTxt)}</strong>` },
    ],
    {
      label: 'Trazabilidad del Expediente (Ley 1755)',
      statusRight: 'Radicación Registrada',
      greenPct: 30,
      goldPct: 40,
      legendLeft: 'Radicado y asignado a dependencias',
      legendRight: `${params.totalDependencias || 1} dependencia(s) en gestión`,
    }
  );

  const docBox = params.nombreDocumento
    ? `
      <div style="background-color: #F2F7F6; border: 1px solid #B2CFCB; border-left: 4px solid #00594E; border-radius: 10px; padding: 12px 16px; margin: 16px 0;">
        <div style="font-size: 11px; font-weight: 800; color: #00594E; text-transform: uppercase; letter-spacing: 0.6px;">
          Documento Base Custodiado
        </div>
        <div style="font-size: 13.5px; font-weight: 700; color: #111827; margin-top: 3px;">
          ${escapeEmailHtml(params.nombreDocumento)}
        </div>
      </div>`
    : '';

  const credsBox = buildCredentialsBox({
    heading: 'Credenciales de Seguimiento Ciudadano',
    email: params.toEmail,
    items: [
      { label: 'Número de Radicado', value: params.numeroRadicado },
      { label: 'PIN de Consulta', value: params.pinAcceso },
    ],
    footnote: 'Conserve este PIN de 6 dígitos para consultar el estado y descargar su respuesta oficial cuando sea emitida.',
  });

  const bodyHtml = `
    <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: 800; color: #00594E;">
      Estimado(a) ${escapeEmailHtml(params.solicitanteNombre)},
    </p>
    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.65; color: #475569;">
      Le confirmamos que su solicitud ha sido radicada oficialmente en el Sistema Institucional de Gestión Documental de la Universidad Internacional del Trópico Americano — Unitrópico y ya se encuentra en trámite ante las dependencias competentes.
    </p>
    ${bentoCard}
    ${docBox}
    ${credsBox}
    ${buildCtaButton(params.consultaUrl, 'Consultar Estado del Radicado')}
  `;

  const html = buildEmailLayout({
    title: subject,
    headerTitle: 'Confirmación de Radicación Oficial',
    numeroRadicado: params.numeroRadicado,
    badgeTag: 'Constancia de Ingreso al Expediente Digital',
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
  const formattedRadicacion = formatDateLongEs(params.fechaRadicacion);
  const formattedEntrega = formatDateLongEs(params.fechaLimiteEntrega);
  const formattedResponsable = formatDateLongEs(params.fechaLimiteResponsable);
  const prioridadBadge = params.prioridad || 'Media';
  const categoriaLegal = params.categoria || 'Petición General (CP art. 23)';
  const instrucciones =
    params.instruccionesAnexos && params.instruccionesAnexos.trim().length > 0
      ? params.instruccionesAnexos.trim()
      : 'Remitir los documentos, conceptos y antecedentes técnicos que sustenten la respuesta institucional.';

  const subject = `[Radicado ${params.numeroRadicado}] Asignación de Subcarpeta y Soportes - Prioridad ${prioridadBadge}`;

  const bentoCard = buildBentoDataCard(
    [
      { label: 'Asunto', valueHtml: escapeEmailHtml(params.asunto) },
      { label: 'Dependencia Asignada', valueHtml: `<strong style="color:#00594E;">${escapeEmailHtml(params.oficinaNombre)}</strong>` },
      { label: 'Clasificación y Prioridad', valueHtml: `${escapeEmailHtml(categoriaLegal)} &middot; <strong style="color:#786832;">Prioridad ${escapeEmailHtml(prioridadBadge)}</strong>` },
      { label: 'Fecha de Radicación', valueHtml: escapeEmailHtml(formattedRadicacion) },
      { label: 'Límite Dependencias (-5 Días)', valueHtml: `<strong style="color:#00594E;">${escapeEmailHtml(formattedResponsable)} (23:59:59)</strong>` },
      { label: 'Expiración General', valueHtml: escapeEmailHtml(formattedEntrega) },
    ],
    {
      label: 'Distribución Operativa del Término Legal',
      statusRight: 'Margen -5 días activo',
      greenPct: 67,
      goldPct: 33,
      legendLeft: 'Cargue de soportes por dependencia',
      legendRight: '5 días de consolidación institucional',
    }
  );

  const attachmentBanner =
    params.attachments && params.attachments.length > 0
      ? `
        <div style="background-color: #F2F7F6; border: 1px solid #B2CFCB; border-left: 4px solid #00594E; border-radius: 10px; padding: 13px 16px; margin: 16px 0;">
          <div style="font-size: 11px; font-weight: 800; color: #00594E; text-transform: uppercase; letter-spacing: 0.6px;">
            Memorial Original Adjunto
          </div>
          <div style="font-size: 13.5px; font-weight: 700; color: #111827; margin-top: 3px;">
            ${escapeEmailHtml(params.attachments.map((a) => a.filename).join(', '))}
          </div>
        </div>`
      : '';

  const subcarpetasHtml =
    params.subcarpetas && params.subcarpetas.length > 0
      ? `
        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-left: 4px solid #B5A160; border-radius: 12px; padding: 16px 18px; margin: 18px 0;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; color: #786832; margin-bottom: 10px;">
            Subcarpeta(s) Asignada(s) a su Dependencia (${params.subcarpetas.length})
          </div>
          ${params.subcarpetas
            .map(
              (sub) => `
              <div style="background-color: #FFFFFF; border: 1px solid #DCE4E3; border-left: 4px solid #00594E; border-radius: 8px; padding: 11px 14px; margin-bottom: 8px;">
                <div style="font-size: 13.5px; font-weight: 800; color: #00594E;">
                  ${escapeEmailHtml(sub.nombre)}
                </div>
                ${sub.descripcion ? `<div style="font-size: 12.5px; color: #475569; margin-top: 4px; line-height: 1.45;">${escapeEmailHtml(sub.descripcion)}</div>` : ''}
              </div>`
            )
            .join('')}
        </div>`
      : `
        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-left: 4px solid #B5A160; border-radius: 12px; padding: 16px 18px; margin: 18px 0;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; color: #786832; margin-bottom: 6px;">
            Requerimiento y Anexos Solicitados
          </div>
          <div style="font-size: 13.5px; color: #334155; line-height: 1.55; white-space: pre-wrap;">
            ${escapeEmailHtml(instrucciones)}
          </div>
        </div>`;

  const credItems = [{ label: 'Código Único de Dependencia', value: params.codigoAcceso }];
  if (params.pinAcceso) {
    credItems.push({ label: 'PIN de Expediente', value: params.pinAcceso });
  }

  const credsBox = buildCredentialsBox({
    heading: 'Credenciales de Acceso al Portal de Dependencias',
    email: params.toEmail,
    items: credItems,
    footnote: 'El enlace permanece habilitado hasta el vencimiento interno (-5 días). Pasada esta fecha se bloqueará para consolidación rectoral.',
  });

  const bodyHtml = `
    <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: 800; color: #00594E;">
      Estimado(a) responsable de ${escapeEmailHtml(params.oficinaNombre)},
    </p>
    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.65; color: #475569;">
      Le notificamos formalmente la asignación de una solicitud institucional en la cual su dependencia debe aportar los soportes documentales y conceptos requeridos dentro del término establecido.
    </p>
    ${bentoCard}
    ${attachmentBanner}
    ${subcarpetasHtml}
    ${credsBox}
    ${buildCtaButton(params.portalUrl, 'Ingresar al Portal y Cargar Soportes')}
  `;

  const html = buildEmailLayout({
    title: subject,
    headerTitle: 'Asignación Oficial de Soportes Documentales',
    numeroRadicado: params.numeroRadicado,
    badgeTag: `Prioridad ${prioridadBadge} · Portal de Dependencias`,
    bodyHtml,
  });

  return dispatchSmtpMail({
    fromLabel: 'Sistema de Radicación Unitrópico',
    toEmail: params.toEmail,
    subject,
    html,
    attachments: params.attachments,
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

  const formattedLimite = formatDateLongEs(params.fechaLimiteDependencia);
  const formattedRadicacion = formatDateLongEs(params.fechaRadicacion);
  const instruccionTexto =
    params.instruccionSubcarpeta && params.instruccionSubcarpeta.trim().length > 0
      ? params.instruccionSubcarpeta.trim()
      : 'Remitir los documentos, conceptos técnicos o soportes institucionales requeridos para consolidar la respuesta del radicado.';

  const mensajeUrgencia =
    dias === 0
      ? `Le informamos que <strong>hoy vence el plazo interno</strong> asignado a su dependencia para cargar el soporte pendiente del radicado <strong>${escapeEmailHtml(params.numeroRadicado)}</strong>.`
      : `Le recordamos que faltan <strong>${dias} día${dias === 1 ? '' : 's'} calendario</strong> para que venza el plazo interno asignado a su dependencia para cargar el soporte pendiente del radicado <strong>${escapeEmailHtml(params.numeroRadicado)}</strong>.`;

  const elapsedPct = dias === 0 ? 100 : dias === 1 ? 90 : dias === 2 ? 80 : 70;
  const remainPct = 100 - elapsedPct;

  const bentoCard = buildBentoDataCard(
    [
      { label: 'Asunto', valueHtml: escapeEmailHtml(params.tituloPeticion) },
      { label: 'Dependencia Pendiente', valueHtml: `<strong style="color:#786832;">${escapeEmailHtml(params.oficinaNombre)}</strong>` },
      { label: 'Fecha de Radicación', valueHtml: escapeEmailHtml(formattedRadicacion) },
      { label: 'Fecha de Expiración (Oficina)', valueHtml: `<strong style="color:#00594E;">${escapeEmailHtml(formattedLimite)} (23:59:59)</strong>` },
    ],
    {
      label: 'Semáforo Preventivo de Plazo',
      statusRight: diasLabel,
      greenPct: Math.min(60, elapsedPct),
      goldPct: Math.max(remainPct, elapsedPct - 60),
      legendLeft: 'Tiempo transcurrido de gestión',
      legendRight: `${diasLabel} para carga obligatoria`,
    }
  );

  const subcarpetaBox = `
    <div style="background-color: #FFFFFF; border: 1px solid #DCE4E3; border-left: 4px solid #B5A160; border-radius: 12px; padding: 15px 18px; margin: 18px 0;">
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; color: #786832; margin-bottom: 5px;">
        Subcarpeta Asignada Pendiente de Soporte
      </div>
      <div style="font-size: 14.5px; font-weight: 800; color: #00594E; margin-bottom: 5px;">
        ${escapeEmailHtml(params.nombreSubcarpeta)}
      </div>
      <div style="font-size: 13px; color: #475569; line-height: 1.5; white-space: pre-wrap;">
        ${escapeEmailHtml(instruccionTexto)}
      </div>
    </div>
  `;

  const credItems = [{ label: 'Código Único de Dependencia', value: params.codigoAccesoDependencia }];
  if (params.pinAcceso) {
    credItems.push({ label: 'PIN de Expediente', value: params.pinAcceso });
  }

  const credsBox = buildCredentialsBox({
    heading: 'Credenciales Originales de Carga Directa',
    email: params.toEmail,
    items: credItems,
    footnote: 'El sistema aún no registra aportes cargados para esta subcarpeta. Utilice estas credenciales para subir su soporte de inmediato.',
  });

  const bodyHtml = `
    <div style="display: inline-block; background-color: #F7F5EE; color: #786832; border: 1px solid #DBD2B0; border-radius: 999px; padding: 4px 12px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 12px;">
      Recordatorio Preventivo &middot; ${escapeEmailHtml(diasLabel)}
    </div>
    <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: 800; color: #00594E;">
      Estimado(a) responsable de ${escapeEmailHtml(params.oficinaNombre)},
    </p>
    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.65; color: #475569;">
      ${mensajeUrgencia}
    </p>
    ${bentoCard}
    ${subcarpetaBox}
    ${credsBox}
    ${buildCtaButton(params.portalUrl, 'Subir Soporte Ahora en el Portal')}
  `;

  const html = buildEmailLayout({
    title: subject,
    headerTitle: 'Aviso de Vencimiento Próximo',
    numeroRadicado: params.numeroRadicado,
    badgeTag: `Gestión Pendiente · ${diasLabel}`,
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
 * 4. Correo de Respuesta Oficial Final al Solicitante (con Respuesta Final + Anexos marcados con check)
 */
export async function sendRespuestaSolicitanteEmail(
  params: EmailRespuestaSolicitanteParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const formattedExpiracion = formatDateLongEs(params.fechaExpiracion);
  const formattedRadicacion = formatDateLongEs(params.fechaRadicacion);
  const subject = `[Radicado N° ${params.numeroRadicado}] Notificación oficial de respuesta a su petición - Unitrópico`;

  const bentoCard = buildBentoDataCard(
    [
      { label: 'Asunto', valueHtml: escapeEmailHtml(params.asunto) },
      { label: 'Solicitante', valueHtml: escapeEmailHtml(params.solicitanteNombre) },
      { label: 'Emitido Por', valueHtml: `<strong style="color:#00594E;">${escapeEmailHtml(params.funcionarioNombre)}</strong>` },
      { label: 'Fecha de Radicación', valueHtml: escapeEmailHtml(formattedRadicacion) },
      { label: 'Expiración del Enlace (10 Días)', valueHtml: `<strong style="color:#786832;">${escapeEmailHtml(formattedExpiracion)}</strong>` },
    ],
    {
      label: 'Ciclo Documental del Expediente',
      statusRight: 'Respuesta Oficial Emitida (100%)',
      greenPct: 80,
      goldPct: 20,
      legendLeft: 'Trámite institucional completado',
      legendRight: 'Descarga habilitada por 10 días calendario',
    }
  );

  const respuestaMessageBox = `
    <div style="background-color: #FFFFFF; border: 1px solid #DCE4E3; border-left: 4px solid #00594E; border-radius: 12px; padding: 18px 20px; margin: 18px 0;">
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #00594E; margin-bottom: 10px;">
        Pronunciamiento Oficial de la Institución
      </div>
      <div style="font-size: 14px; color: #111827; line-height: 1.7; white-space: pre-wrap;">${escapeEmailHtml(params.mensajeRespuesta)}</div>
    </div>
  `;

  const hasFinalFile = Boolean(params.archivoAdjunto?.filename);
  const hasOptionalFiles = Array.isArray(params.anexosResumen) && params.anexosResumen.length > 0;

  const attachmentsListHtml =
    hasFinalFile || hasOptionalFiles
      ? `
        <div style="background-color: #F8FAFC; border: 1px solid #DCE4E3; border-radius: 12px; padding: 16px 18px; margin: 18px 0;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; color: #00594E; margin-bottom: 10px;">
            Documentos Adjuntos y Soportes Oficiales
          </div>
          ${
            hasFinalFile
              ? `
                <div style="background-color: #FFFFFF; border: 1px solid #B2CFCB; border-left: 4px solid #00594E; border-radius: 10px; padding: 12px 14px; margin-bottom: 8px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td style="vertical-align: middle;">
                        <span style="display: inline-block; background-color: #F2F7F6; color: #00594E; border: 1px solid #B2CFCB; border-radius: 999px; padding: 2px 9px; font-size: 10.5px; font-weight: 800; text-transform: uppercase; margin-bottom: 4px;">
                          &#10003; Respuesta Final Oficial
                        </span>
                        <div style="font-size: 13.5px; font-weight: 800; color: #111827;">
                          ${escapeEmailHtml(params.archivoAdjunto!.filename)}
                        </div>
                      </td>
                    </tr>
                  </table>
                </div>`
              : ''
          }
          ${
            hasOptionalFiles
              ? params.anexosResumen!
                  .map(
                    (anexo) => `
                    <div style="background-color: #FFFFFF; border: 1px solid #DCE4E3; border-left: 4px solid #B5A160; border-radius: 10px; padding: 10px 14px; margin-bottom: 7px;">
                      <span style="color: #00594E; font-weight: 800; font-size: 13px; margin-right: 6px;">&#10003;</span>
                      <strong style="font-size: 13px; color: #111827;">${escapeEmailHtml(anexo.nombre)}</strong>
                      ${
                        anexo.origen
                          ? `<span style="display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 999px; background-color: #F7F5EE; border: 1px solid #DBD2B0; color: #786832; font-size: 10.5px; font-weight: 700;">${escapeEmailHtml(anexo.origen)}</span>`
                          : ''
                      }
                    </div>`
                  )
                  .join('')
              : ''
          }
        </div>`
      : '';

  const credsBox = buildCredentialsBox({
    heading: 'Credenciales de Consulta del Expediente',
    email: params.toEmail,
    items: [
      { label: 'Número de Radicado', value: params.numeroRadicado },
      { label: 'PIN de Consulta', value: params.pinSolicitante },
    ],
    footnote: `Portal seguro disponible para descarga y verificación de anexos hasta el ${formattedExpiracion}.`,
  });

  const driveHtml = params.driveUrl
    ? `
      <div style="background-color: #F2F7F6; border: 1px solid #B2CFCB; border-radius: 10px; padding: 12px 16px; margin: 16px 0; text-align: center;">
        <div style="font-size: 11.5px; font-weight: 800; color: #00594E; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
          Repositorio Documental Complementario
        </div>
        <a href="${escapeEmailHtml(params.driveUrl)}" target="_blank" rel="noopener noreferrer" style="color: #00594E; font-size: 13px; font-weight: 700; text-decoration: underline;">
          Abrir carpeta complementaria compartida &rarr;
        </a>
      </div>`
    : '';

  const bodyHtml = `
    <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: 800; color: #00594E;">
      Estimado(a) ${escapeEmailHtml(params.solicitanteNombre)},
    </p>
    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.65; color: #475569;">
      La Universidad Internacional del Trópico Americano — Unitrópico le notifica formalmente la respuesta oficial emitida frente a su solicitud radicada en nuestro sistema documental.
    </p>
    ${bentoCard}
    ${respuestaMessageBox}
    ${attachmentsListHtml}
    ${credsBox}
    ${buildCtaButton(params.consultaUrl, 'Consultar Expediente y Descargar Anexos')}
    ${driveHtml}
  `;

  const html = buildEmailLayout({
    title: subject,
    headerTitle: 'Respuesta Oficial a su Solicitud',
    numeroRadicado: params.numeroRadicado,
    badgeTag: 'Pronunciamiento Definitivo · Vigencia 10 Días',
    bodyHtml,
  });

  const mailAttachments: any[] = [];
  if (params.archivoAdjunto && params.archivoAdjunto.content) {
    mailAttachments.push({
      filename: params.archivoAdjunto.filename,
      content: params.archivoAdjunto.content,
      contentType: params.archivoAdjunto.contentType || 'application/pdf',
    });
  }
  if (Array.isArray(params.anexosAdicionales) && params.anexosAdicionales.length > 0) {
    params.anexosAdicionales.forEach((anexo) => {
      if (anexo && anexo.content) {
        mailAttachments.push({
          filename: anexo.filename,
          content: anexo.content,
          contentType: anexo.contentType || 'application/octet-stream',
        });
      }
    });
  }

  return dispatchSmtpMail({
    fromLabel: 'Correspondencia Oficial Unitrópico',
    toEmail: params.toEmail,
    subject,
    html,
    attachments: mailAttachments,
    logTag: 'RESPUESTA SOLICITANTE',
  });
}
