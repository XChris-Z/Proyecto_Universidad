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

export interface EmailPeticionNotificationParams {
  toEmail: string;
  oficinaNombre: string;
  numeroRadicado: string;
  asunto: string;
  categoria?: string | null;
  prioridad?: string | null;
  instruccionesAnexos?: string | null;
  subcarpetas?: EmailSubcarpetaItem[];
  fechaLimiteEntrega: string;
  fechaLimiteResponsable: string;
  codigoAcceso: string;
  pinAcceso?: string | null;
  portalUrl: string;
  attachments?: EmailAttachment[];
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
  } catch (e) {
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

  // 1. Si no está en variables de entorno o es placeholder, consultar Supabase profiles (perfil root)
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

  // 2. Consultar Supabase configuracion_sistema como respaldo adicional
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

  // 3. Fallback institucional garantizado para producción en Vercel
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

/**
 * Crea un transporte Nodemailer con timeout seguro y configuración TLS
 */
function createTransporter(creds: { user: string; pass: string; host: string; port: number }, forcePort587 = false) {
  const usePort = forcePort587 ? 587 : creds.port;
  const isSecure = usePort === 465;

  return nodemailer.createTransport({
    host: creds.host,
    port: usePort,
    secure: isSecure, // true para 465 (SSL), false para 587 (STARTTLS)
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

/**
 * Obtiene el transporte SMTP configurado vía variables de entorno o base de datos Supabase
 */
async function getSmtpTransporter() {
  const creds = await getSmtpCredentials();
  if (!creds) {
    return null;
  }

  return {
    transporter: createTransporter(creds),
    sender: creds.user,
    creds,
  };
}

/**
 * Envía la notificación institucional oficial a la oficina responsable
 */
export async function sendPeticionAssignmentEmail(
  params: EmailPeticionNotificationParams
): Promise<{ success: boolean; simulated?: boolean; messageId?: string; error?: string; needsSmtpConfig?: boolean }> {
  const smtpInfo = await getSmtpTransporter();

  const formattedFechaEntrega = new Date(params.fechaLimiteEntrega + 'T12:00:00').toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const formattedFechaResponsable = new Date(params.fechaLimiteResponsable + 'T12:00:00').toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const prioridadBadge = params.prioridad || 'Media';
  const categoriaLegal = params.categoria || 'Petición General (CP art. 23)';
  const instrucciones = params.instruccionesAnexos && params.instruccionesAnexos.trim().length > 0
    ? params.instruccionesAnexos.trim()
    : 'No se especificaron instrucciones adicionales. Remitir los documentos y antecedentes que sustenten la respuesta oficial.';

  const subject = `[Radicado N° ${params.numeroRadicado}] Solicitud formal de respuesta y cargue de anexos - Prioridad ${prioridadBadge}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b; }
        .email-container { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
        .email-header { background: #00594E; padding: 28px 24px; text-align: center; color: #ffffff; border-bottom: 4px solid #B5A160; }
        .email-header h1 { font-size: 20px; font-weight: 800; letter-spacing: 1px; margin: 0; text-transform: uppercase; }
        .email-header p { font-size: 12px; color: #B5A160; text-transform: uppercase; font-weight: 700; margin: 6px 0 0 0; letter-spacing: 1.5px; }
        .email-body { padding: 32px 28px; }
        .greeting { font-size: 16px; font-weight: 700; color: #00594E; margin-top: 0; }
        .badge-radicado { display: inline-block; background: #E6F0EE; color: #00594E; border: 1px solid #99C5BF; padding: 8px 16px; border-radius: 8px; font-weight: 800; font-size: 16px; font-family: monospace; letter-spacing: 0.5px; }
        .info-table { width: 100%; border-collapse: collapse; margin: 18px 0; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; font-size: 13px; }
        .info-table td { padding: 10px 14px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
        .info-table tr:last-child td { border-bottom: none; }
        .info-label { font-weight: 700; color: #64748b; width: 32%; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
        .info-val { color: #0f172a; font-weight: 600; }
        .instrucciones-box { background: #FAF9F5; border-left: 4px solid #B5A160; border-top: 1px solid #EAE5D5; border-right: 1px solid #EAE5D5; border-bottom: 1px solid #EAE5D5; border-radius: 6px; padding: 16px 18px; margin: 22px 0; }
        .instrucciones-title { font-size: 12px; font-weight: 800; text-transform: uppercase; color: #7a6a35; letter-spacing: 0.5px; margin-bottom: 8px; }
        .instrucciones-text { font-size: 13.5px; color: #334155; line-height: 1.6; font-style: italic; white-space: pre-wrap; }
        .attachment-banner { background: #F0FDF4; border: 1px solid #BBF7D0; border-left: 4px solid #10B981; border-radius: 6px; padding: 12px 16px; margin: 18px 0; font-size: 13px; }
        .credentials-card { background: #f8fafc; border: 1px dashed #00594E; border-radius: 8px; padding: 18px; margin: 22px 0; text-align: center; }
        .cred-email { font-size: 13px; color: #475569; margin-bottom: 6px; }
        .cred-code-title { font-size: 11px; text-transform: uppercase; font-weight: 800; color: #64748b; letter-spacing: 1px; margin-top: 8px; }
        .cred-code-val { font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #00594E; font-family: monospace; margin: 6px 0; }
        .deadline-warning { background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 14px 16px; margin: 22px 0; font-size: 12.5px; color: #92400E; line-height: 1.5; }
        .btn-access { display: block; width: fit-content; margin: 26px auto; background: #00594E; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 800; font-size: 14px; text-align: center; box-shadow: 0 4px 12px rgba(0, 89, 78, 0.25); }
        .email-footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 22px 24px; font-size: 11px; color: #64748b; text-align: center; line-height: 1.6; }
        .footer-brand { font-weight: 800; color: #00594E; text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="email-container">
        
        <!-- ENCABEZADO INSTITUCIONAL -->
        <div class="email-header">
          <h1>UNITRÓPICO</h1>
          <p>Sistema de Gestión Documental y Correspondencia</p>
        </div>

        <div class="email-body">
          <p class="greeting">Estimado(a) responsable de ${params.oficinaNombre},</p>
          
          <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-top: 0;">
            Le notificamos formalmente que se ha registrado en el Sistema de Gestión Documental de Unitrópico una nueva petición oficial en la que su oficina ha sido asignada para dar respuesta y suministrar los anexos probatorios correspondientes.
          </p>

          <div style="text-align: center; margin: 18px 0;">
            <div class="badge-radicado">Radicado N° ${params.numeroRadicado}</div>
          </div>

          <!-- DETALLES DEL RADICADO -->
          <table class="info-table">
            <tr>
              <td class="info-label">Asunto:</td>
              <td class="info-val">${params.asunto}</td>
            </tr>
            <tr>
              <td class="info-label">Categoría Legal:</td>
              <td class="info-val">${categoriaLegal}</td>
            </tr>
            <tr>
              <td class="info-label">Prioridad:</td>
              <td class="info-val">
                <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 800; background: ${prioridadBadge === 'Alta' ? '#FEE2E2' : '#E0F2FE'}; color: ${prioridadBadge === 'Alta' ? '#B91C1C' : '#0369A1'};">
                  ${prioridadBadge}
                </span>
              </td>
            </tr>
          </table>

          <!-- REGLA OBLIGATORIA: ARCHIVO ADJUNTO DE LA RADICACIÓN -->
          ${params.attachments && params.attachments.length > 0 ? `
            <div class="attachment-banner">
              <strong style="color: #166534; font-size: 13px;">Documento Radicado Adjunto:</strong>
              <div style="color: #15803D; font-size: 12.5px; font-weight: 700; margin-top: 2px;">
                ${params.attachments.map(a => a.filename).join(', ')}
              </div>
              <div style="font-size: 11.5px; color: #4B5563; margin-top: 4px;">
                Se ha adjuntado físicamente a este correo el documento original de la petición para su descarga e inspección inmediata.
              </div>
            </div>
          ` : ''}

          <!-- SECCIÓN DESTACADA: REQUERIMIENTO Y SUBCARPETAS SOLICITADAS -->
          ${params.subcarpetas && params.subcarpetas.length > 0 ? `
            <div class="instrucciones-box">
              <div class="instrucciones-title">Subcarpetas asignadas a su dependencia (${params.subcarpetas.length}):</div>
              <div style="margin-top: 10px;">
                ${params.subcarpetas.map(sub => `
                  <div style="background: #ffffff; border: 1px solid #cbd5e1; border-left: 4px solid #00594E; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px;">
                    <div style="font-weight: 800; font-size: 13px; color: #00594E;">
                      📁 ${sub.nombre}
                    </div>
                    ${sub.descripcion ? `<div style="font-size: 12px; color: #475569; margin-top: 4px; line-height: 1.4;">${sub.descripcion}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : `
            <div class="instrucciones-box">
              <div class="instrucciones-title">Requerimiento y anexos solicitados:</div>
              <div class="instrucciones-text">"${instrucciones}"</div>
            </div>
          `}

          <!-- CREDENCIALES DE ACCESO TEMPORAL Y PIN DE SEGURIDAD -->
          <div class="credentials-card">
            <div class="cred-email">Correo Electrónico Autorizado: <strong>${params.toEmail}</strong></div>
            <div style="display: flex; gap: 12px; margin-top: 10px; flex-wrap: wrap;">
              <div style="flex: 1; min-width: 160px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; text-align: center;">
                <div class="cred-code-title">Código Único de Acceso</div>
                <div class="cred-code-val" style="margin: 4px 0;">${params.codigoAcceso}</div>
              </div>
              ${params.pinAcceso ? `
                <div style="flex: 1; min-width: 160px; background: #FFFBEB; border: 1px solid #FCD34D; border-radius: 6px; padding: 10px; text-align: center;">
                  <div style="font-size: 11px; font-weight: 700; color: #92400E; text-transform: uppercase; letter-spacing: 0.5px;">PIN de Seguridad (6 Dígitos)</div>
                  <div style="font-family: monospace; font-size: 20px; font-weight: 900; color: #B45309; letter-spacing: 4px; margin: 4px 0;">${params.pinAcceso}</div>
                </div>
              ` : ''}
            </div>
            <div style="font-size: 11px; color: #64748b; margin-top: 10px;">Estas credenciales son confidenciales e intransferibles para cargar anexos en esta carpeta oficial.</div>
          </div>

          <!-- ADVERTENCIA DE VENCIMIENTO PERENTORIO (-5 DÍAS) -->
          <div class="deadline-warning">
            <strong>ADVERTENCIA DE VENCIMIENTO PERENTORIO:</strong><br>
            Habilitado únicamente hasta el <strong>${formattedFechaResponsable} (23:59:59)</strong> (5 días calendario antes del cierre definitivo del radicado: <strong>${formattedFechaEntrega}</strong>). Cumplido este plazo, el acceso quedará inhabilitado automáticamente en el sistema para permitir la consolidación jurídica e institucional de la respuesta.
          </div>

          <!-- BOTÓN DIRECTO AL PORTAL DE CARGA -->
          <a href="${params.portalUrl}" class="btn-access">
            Ingresar a la Carpeta y Cargar Anexos &rarr;
          </a>

          <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 18px;">
            Si el botón no funciona, copie y pegue el siguiente enlace en su navegador web:<br>
            <a href="${params.portalUrl}" style="color: #00594E; word-break: break-all; font-size: 11px;">${params.portalUrl}</a>
          </p>
        </div>

        <!-- PIE INSTITUCIONAL -->
        <div class="email-footer">
          <span class="footer-brand">Universidad Internacional del Trópico Americano — Unitrópico</span><br>
          Sistema de Gestión Documental y Archivo Central<br>
          Yopal, Casanare, Colombia &bull; Vigilada MinEducación<br>
          <span style="font-size: 10px; color: #94a3b8; margin-top: 8px; display: block;">
            Este es un mensaje institucional generado automáticamente por el sistema de radicación. Por favor no responda a este correo electrónico.
          </span>
        </div>

      </div>
    </body>
    </html>
  `;

  if (!smtpInfo) {
    const errorMsg = 'Configuración SMTP no encontrada en el servidor. Por favor configure las variables de entorno GOOGLE_SMTP_USER y GOOGLE_SMTP_PASS en el archivo .env.';
    console.error(`[SMTP NO CONFIGURADO] ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
    };
  }

  const { transporter, sender, creds } = smtpInfo;

  const mailOptions = {
    from: `"Sistema de Radicación Unitrópico" <${sender}>`,
    to: params.toEmail,
    subject,
    html: htmlContent,
    attachments: params.attachments,
  };

  try {
    let info;
    try {
      info = await transporter.sendMail(mailOptions);
    } catch (primaryErr: any) {
      console.warn(`[SMTP AVISO] Falló envío en puerto ${creds.port} (${primaryErr.message}). Reintentando con puerto alternativo 587 (STARTTLS)...`);
      const fallbackTransporter = createTransporter(creds, true);
      info = await fallbackTransporter.sendMail(mailOptions);
    }

    console.log(`[SMTP ENVIADO] Correo entregado exitosamente a ${params.toEmail} (MessageId: ${info.messageId})`);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error: any) {
    console.error('Error enviando correo SMTP a ' + params.toEmail + ':', error.message);
    return {
      success: false,
      error: error.message || 'Error desconocido al enviar correo SMTP',
    };
  }
}

export interface EmailRespuestaSolicitanteParams {
  toEmail: string;
  solicitanteNombre: string;
  numeroRadicado: string;
  asunto: string;
  mensajeRespuesta: string;
  funcionarioNombre: string;
  pinSolicitante: string;
  fechaExpiracion: string;
  consultaUrl: string;
  driveUrl?: string | null;
  totalArchivos?: number;
}

/**
 * Envía la notificación con la respuesta oficial al solicitante original
 * con credenciales y candado temporal de 10 días calendario.
 */
export async function sendRespuestaSolicitanteEmail(
  params: EmailRespuestaSolicitanteParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const smtpInfo = await getSmtpTransporter();

  const formattedFechaExpiracion = new Date(params.fechaExpiracion).toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const subject = `[Radicado N° ${params.numeroRadicado}] Notificación oficial de respuesta a su petición - Unitrópico`;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b; }
        .email-container { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
        .email-header { background: #006837; padding: 28px 24px; text-align: center; color: #ffffff; border-bottom: 4px solid #b8860b; }
        .email-header h1 { font-size: 20px; font-weight: 800; letter-spacing: 1px; margin: 0; text-transform: uppercase; }
        .email-header p { font-size: 12px; color: #fde68a; text-transform: uppercase; font-weight: 700; margin: 6px 0 0 0; letter-spacing: 1.5px; }
        .email-body { padding: 32px 28px; }
        .greeting { font-size: 16px; font-weight: 700; color: #006837; margin-top: 0; }
        .badge-radicado { display: inline-block; background: #f0fdf4; color: #006837; border: 1px solid #bbf7d0; padding: 8px 16px; border-radius: 8px; font-weight: 800; font-size: 16px; font-family: monospace; letter-spacing: 0.5px; }
        .respuesta-box { background: #f8fafc; border-left: 4px solid #006837; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0; }
        .respuesta-header { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #006837; letter-spacing: 0.8px; margin-bottom: 10px; display: flex; justify-content: space-between; }
        .respuesta-text { font-size: 14px; color: #1e293b; line-height: 1.7; white-space: pre-wrap; margin: 0; }
        .credentials-card { background: #f8fafc; border: 1px dashed #006837; border-radius: 8px; padding: 18px; margin: 22px 0; text-align: center; }
        .cred-email { font-size: 13px; color: #475569; margin-bottom: 6px; }
        .cred-code-title { font-size: 11px; text-transform: uppercase; font-weight: 800; color: #64748b; letter-spacing: 1px; margin-top: 8px; }
        .cred-code-val { font-size: 26px; font-weight: 900; letter-spacing: 4px; color: #006837; font-family: monospace; margin: 6px 0; }
        .expira-card { background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #b8860b; border-radius: 8px; padding: 14px 16px; margin: 20px 0; font-size: 12.5px; color: #78350f; line-height: 1.5; }
        .btn-access { display: block; width: fit-content; margin: 26px auto; background: #006837; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 800; font-size: 14px; text-align: center; box-shadow: 0 4px 12px rgba(0, 104, 55, 0.25); }
        .email-footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 22px 24px; font-size: 11px; color: #64748b; text-align: center; line-height: 1.6; }
        .footer-brand { font-weight: 800; color: #006837; text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="email-container">
        
        <div class="email-header">
          <h1>UNITRÓPICO</h1>
          <p>Sistema de Gestión Documental y Correspondencia</p>
        </div>

        <div class="email-body">
          <p class="greeting">Estimado(a) ${params.solicitanteNombre},</p>
          
          <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-top: 0;">
            Le informamos formalmente que la Universidad Internacional del Trópico Americano — Unitrópico ha emitido pronunciamiento oficial en relación con su petición radicada:
          </p>

          <div style="text-align: center; margin: 18px 0;">
            <div class="badge-radicado">Radicado N° ${params.numeroRadicado}</div>
            <div style="font-size: 13px; color: #64748b; margin-top: 6px; font-weight: 600;">Asunto: ${params.asunto}</div>
          </div>

          <!-- TARJETA DE RESPUESTA OFICIAL -->
          <div class="respuesta-box">
            <div class="respuesta-header">
              <span>RESPUESTA OFICIAL DE LA INSTITUCIÓN</span>
              <span style="color: #64748b; font-weight: 600;">Emitida por: ${params.funcionarioNombre}</span>
            </div>
            <p class="respuesta-text">${params.mensajeRespuesta}</p>
          </div>

          <!-- AVISO DE CADUCIDAD 10 DÍAS -->
          <div class="expira-card">
            <strong style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; color: #92400e;">
              ⏱ Acceso Temporal Habilitado (10 Días Calendario)
            </strong>
            Conforme a los protocolos de seguridad documental, el expediente completo con sus anexos y soportes oficiales estará habilitado para consulta y descarga en el portal seguro hasta el <strong>${formattedFechaExpiracion}</strong>.
          </div>

          <!-- CREDENCIALES DE CONSULTA -->
          <div class="credentials-card">
            <div class="cred-email">Correo registrado: <strong>${params.toEmail}</strong></div>
            <div class="cred-code-title">Código de Seguridad (PIN de 6 Dígitos)</div>
            <div class="cred-code-val">${params.pinSolicitante}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
              Este código de acceso es confidencial y de uso exclusivo para desbloquear su expediente.
            </div>
          </div>

          <!-- BOTÓN DE ACCESO AL PORTAL -->
          <div style="text-align: center; margin: 26px 0;">
            <a href="${params.consultaUrl}" class="btn-access" target="_blank">
              Consultar Expediente y Descargar Anexos &rarr;
            </a>
            <div style="font-size: 11.5px; color: #64748b; margin-top: 8px;">
              O ingrese directamente en: <a href="${params.consultaUrl}" style="color: #006837; word-break: break-all;">${params.consultaUrl}</a>
            </div>
          </div>

          ${params.driveUrl ? `
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin: 18px 0; font-size: 13px; text-align: center;">
              <strong>Repositorio Complementario Externo:</strong><br>
              <a href="${params.driveUrl}" target="_blank" style="color: #006837; font-weight: 700; text-decoration: underline; margin-top: 4px; display: inline-block;">
                Ver carpeta complementaria compartida &rarr;
              </a>
            </div>
          ` : ''}

          <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-top: 24px;">
            Si tiene alguna inquietud adicional respecto a esta respuesta, por favor canalícela a través de los canales institucionales oficiales de correspondencia de Unitrópico.
          </p>
        </div>

        <div class="email-footer">
          <span class="footer-brand">Universidad Internacional del Trópico Americano — Unitrópico</span><br>
          Sistema de Gestión Documental y Archivo Central<br>
          Yopal, Casanare, Colombia &bull; Vigilada MinEducación<br>
          <span style="font-size: 10px; color: #94a3b8; margin-top: 8px; display: block;">
            Este es un correo institucional generado automáticamente para la entrega de respuestas a solicitudes ciudadanas y de la comunidad académica. Por favor no responda a este remitente.
          </span>
        </div>

      </div>
    </body>
    </html>
  `;

  if (!smtpInfo) {
    console.error('[SMTP NO CONFIGURADO] No se pudo obtener el transporte SMTP');
    return { success: false, error: 'Configuración SMTP no disponible en el servidor' };
  }

  const { transporter, sender, creds } = smtpInfo;

  const mailOptions = {
    from: `"Correspondencia Oficial Unitrópico" <${sender}>`,
    to: params.toEmail,
    subject,
    html: htmlContent,
  };

  try {
    let info;
    try {
      info = await transporter.sendMail(mailOptions);
    } catch (primaryErr: any) {
      console.warn(`[SMTP AVISO] Reintentando con puerto alternativo 587 para respuesta a solicitante (${primaryErr.message})...`);
      const fallbackTransporter = createTransporter(creds, true);
      info = await fallbackTransporter.sendMail(mailOptions);
    }

    console.log(`[RESPUESTA ENVIADA] Correo entregado al solicitante ${params.toEmail} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('Error enviando respuesta oficial a ' + params.toEmail + ':', error.message);
    return { success: false, error: error.message || 'Error al despachar correo al solicitante' };
  }
}
