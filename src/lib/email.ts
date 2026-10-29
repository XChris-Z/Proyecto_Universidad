// src/lib/email.ts
import nodemailer from 'nodemailer';

export interface EmailPeticionNotificationParams {
  toEmail: string;
  oficinaNombre: string;
  numeroRadicado: string;
  asunto: string;
  descripcion?: string | null;
  fechaLimiteEntrega: string;
  fechaLimiteResponsable: string;
  codigoAcceso: string;
  portalUrl: string;
}

/**
 * Obtiene el transporte SMTP de Google Workspace / Gmail
 */
function getSmtpTransporter() {
  const user = process.env.GOOGLE_SMTP_USER;
  const pass = process.env.GOOGLE_SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.GOOGLE_SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.GOOGLE_SMTP_PORT) || 465,
    secure: true, // true para port 465
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

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Montserrat', Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }
        .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.06); }
        .email-header { background: #00594E; padding: 28px 24px; text-align: center; color: #ffffff; }
        .email-logo-title { font-size: 20px; font-weight: 800; letter-spacing: 0.5px; margin: 0; }
        .email-logo-sub { font-size: 11px; color: #B5A160; text-transform: uppercase; font-weight: 700; margin-top: 4px; letter-spacing: 1px; }
        .email-body { padding: 28px 24px; }
        .badge-radicado { display: inline-block; background: rgba(0, 89, 78, 0.08); color: #00594E; border: 1px solid rgba(0, 89, 78, 0.25); padding: 6px 14px; border-radius: 6px; font-weight: 800; font-size: 15px; margin-bottom: 16px; font-family: monospace; }
        .deadline-card { background: #FFFBEB; border: 1px solid #FDE68A; border-left: 5px solid #B5A160; border-radius: 8px; padding: 16px; margin: 20px 0; }
        .deadline-title { font-weight: 800; color: #7a6a35; font-size: 14px; margin-bottom: 6px; }
        .code-box { background: #F1F5F9; border: 2px dashed #CBD5E1; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0; }
        .code-title { font-size: 12px; text-transform: uppercase; color: #64748B; font-weight: 700; margin-bottom: 6px; }
        .code-value { font-size: 24px; font-weight: 900; letter-spacing: 3px; color: #00594E; font-family: monospace; }
        .btn-portal { display: block; text-align: center; background: #00594E; color: #ffffff !important; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-weight: 800; font-size: 15px; margin: 20px 0; box-shadow: 0 4px 10px rgba(0, 89, 78, 0.25); }
        .email-footer { background: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 18px 24px; font-size: 11px; color: #64748B; text-align: center; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="email-header">
          <div class="email-logo-title">UNITRÓPICO</div>
          <div class="email-logo-sub">Sistema de Gestión Documental y Peticiones</div>
        </div>
        
        <div class="email-body">
          <p style="font-size: 15px; margin-top: 0;">Estimados(as) <strong>${params.oficinaNombre}</strong>,</p>
          
          <p style="font-size: 14px; line-height: 1.6; color: #334155;">
            Se ha radicado en el sistema una nueva petición oficial en la cual su oficina ha sido asignada como <strong>responsable de aportar documentación y anexos de soporte</strong>.
          </p>

          <div style="text-align: center;">
            <div class="badge-radicado">Radicado: ${params.numeroRadicado}</div>
          </div>

          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; font-size: 13px; margin-bottom: 18px;">
            <div style="margin-bottom: 8px;"><strong>Asunto:</strong> ${params.asunto}</div>
            ${params.descripcion ? `<div><strong>Descripción:</strong> ${params.descripcion}</div>` : ''}
          </div>

          <!-- REGLA ESTRICTA DE LOS 5 DÍAS -->
          <div class="deadline-card">
            <div class="deadline-title">⚠️ PLAZO ESTRICTO DE CARGA PARA SU OFICINA:</div>
            <div style="font-size: 13px; color: #334155; line-height: 1.5;">
              Su fecha límite de entrega vence el: <br>
              <strong style="color: #7a6a35; font-size: 15px;">${formattedFechaResponsable} (23:59:59)</strong>.<br>
              <span style="font-size: 11px; color: #64748B;">
                * En cumplimiento de la regla institucional de 5 días de margen antes del cierre general de la petición (${formattedFechaEntrega}). Posterior a esta fecha el portal bloqueará la recepción de anexos.
              </span>
            </div>
          </div>

          <!-- CÓDIGO ÚNICO TEMPORAL -->
          <div class="code-box">
            <div class="code-title">Su Código Único de Acceso Temporal:</div>
            <div class="code-value">${params.codigoAcceso}</div>
            <div style="font-size: 11px; color: #64748B; margin-top: 6px;">Válido únicamente para el correo: ${params.toEmail}</div>
          </div>

          <!-- BOTÓN DIRECTO AL PORTAL -->
          <a href="${params.portalUrl}" class="btn-portal">
            Ingresar al Portal de Entrega de Anexos &rarr;
          </a>
        </div>

        <div class="email-footer">
          Universidad Internacional del Trópico Americano - Unitrópico<br>
          Este es un mensaje institucional automático del Sistema de Gestión Documental. No responda a este correo.
        </div>
      </div>
    </body>
    </html>
  `;

  if (!transporter) {
    console.log(`[SMTP SIMULADO] Se generó notificación para ${params.toEmail} (${params.oficinaNombre}) - Radicado ${params.numeroRadicado} - Código: ${params.codigoAcceso}`);
    return {
      success: true,
      simulated: true,
      messageId: `sim-${Date.now()}`,
    };
  }

  try {
    const info = await transporter.sendMail({
      from: `"SGD Unitrópico" <${process.env.GOOGLE_SMTP_USER}>`,
      to: params.toEmail,
      subject: `[SGD UNITRÓPICO] Asignación de Petición ${params.numeroRadicado} - Código de Acceso`,
      html: htmlContent,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error: any) {
    console.error('Error enviando correo SMTP:', error);
    return {
      success: false,
      error: error.message || 'Error desconocido al enviar correo SMTP',
    };
  }
}
