// src/lib/email.ts
import nodemailer from 'nodemailer';

export interface EmailPeticionNotificationParams {
  toEmail: string;
  oficinaNombre: string;
  numeroRadicado: string;
  asunto: string;
  categoria?: string | null;
  prioridad?: string | null;
  instruccionesAnexos?: string | null;
  fechaLimiteEntrega: string;
  fechaLimiteResponsable: string;
  codigoAcceso: string;
  portalUrl: string;
}

/**
 * Obtiene el transporte SMTP configurado vía variables de entorno
 * Soporta SMTP_USER / SMTP_PASS o GOOGLE_SMTP_USER / GOOGLE_SMTP_PASS
 */
function getSmtpTransporter() {
  const user = process.env.SMTP_USER || process.env.GOOGLE_SMTP_USER;
  const pass = process.env.SMTP_PASS || process.env.GOOGLE_SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  const host = process.env.SMTP_HOST || process.env.GOOGLE_SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || process.env.GOOGLE_SMTP_PORT) || 465;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
}

/**
 * Envía la notificación institucional oficial a la oficina responsable
 */
export async function sendPeticionAssignmentEmail(
  params: EmailPeticionNotificationParams
): Promise<{ success: boolean; simulated?: boolean; messageId?: string; error?: string }> {
  const transporter = getSmtpTransporter();
  const smtpUser = process.env.SMTP_USER || process.env.GOOGLE_SMTP_USER || 'sgd@unitropico.edu.co';

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
        .instrucciones-title { font-size: 12px; font-weight: 800; text-transform: uppercase; color: #7a6a35; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; }
        .instrucciones-text { font-size: 13.5px; color: #334155; line-height: 1.6; font-style: italic; white-space: pre-wrap; }
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

          <!-- SECCIÓN DESTACADA: REQUERIMIENTO Y ANEXOS SOLICITADOS -->
          <div class="instrucciones-box">
            <div class="instrucciones-title">📋 Requerimiento y anexos solicitados:</div>
            <div class="instrucciones-text">"${instrucciones}"</div>
          </div>

          <!-- CREDENCIALES DE ACCESO TEMPORAL -->
          <div class="credentials-card">
            <div class="cred-email">Correo Electrónico Autorizado: <strong>${params.toEmail}</strong></div>
            <div class="cred-code-title">Código Único Temporal de Acceso</div>
            <div class="cred-code-val">${params.codigoAcceso}</div>
            <div style="font-size: 11px; color: #64748b;">Este código es intransferible y de un solo uso para esta petición específica.</div>
          </div>

          <!-- ADVERTENCIA DE VENCIMIENTO PERENTORIO (-5 DÍAS) -->
          <div class="deadline-warning">
            <strong>⚠️ ADVERTENCIA DE VENCIMIENTO PERENTORIO:</strong><br>
            Habilitado únicamente hasta el <strong>${formattedFechaResponsable} (23:59:59)</strong> (5 días calendario antes del cierre definitivo del radicado: <strong>${formattedFechaEntrega}</strong>). Cumplido este plazo, el acceso quedará inhabilitado automáticamente en el sistema para permitir la consolidación jurídica e institucional de la respuesta.
          </div>

          <!-- BOTÓN DIRECTO AL PORTAL DE CARGA -->
          <a href="${params.portalUrl}" class="btn-access">
            Ingresar al Portal de Entrega de Anexos &rarr;
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

  if (!transporter) {
    console.log(
      `[SMTP SIMULADO] Se generó notificación para ${params.toEmail} (${params.oficinaNombre}) - Radicado ${params.numeroRadicado} - Código: ${params.codigoAcceso}`
    );
    return {
      success: true,
      simulated: true,
      messageId: `sim-${Date.now()}`,
    };
  }

  try {
    const info = await transporter.sendMail({
      from: `"SGD Unitrópico" <${smtpUser}>`,
      to: params.toEmail,
      subject,
      html: htmlContent,
    });

    console.log(`[SMTP ENVIADO] Correo entregado exitosamente a ${params.toEmail} (MessageId: ${info.messageId})`);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error: any) {
    console.error('Error enviando correo SMTP a ' + params.toEmail + ':', error);
    return {
      success: false,
      error: error.message || 'Error desconocido al enviar correo SMTP',
    };
  }
}
