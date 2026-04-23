import { NextRequest } from 'next/server';
import nodemailer from 'nodemailer';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest } from '@/lib/api/middleware';
import { config, isConfigured } from '@/lib/config';
import { getLogger } from '@/lib/logger';

const logger = getLogger('api:qbr-send');

const EMAIL_COPY = {
  it: {
    lang: 'it',
    greeting: 'Ciao,',
    body: (clientName: string) =>
      `in allegato trovi la <strong>Quarterly Business Review</strong> relativa a <strong>${clientName}</strong>, con il riepilogo delle attivita svolte insieme e i prossimi passi della nostra collaborazione.`,
    closing: 'Per qualsiasi domanda o approfondimento, rispondi direttamente a questa email.',
    attachmentLabel: 'Documento allegato a questa email',
    consultantLabel: 'Il vostro consulente',
  },
  en: {
    lang: 'en',
    greeting: 'Hello,',
    body: (clientName: string) =>
      `please find attached the <strong>Quarterly Business Review</strong> for <strong>${clientName}</strong>, summarising what we have accomplished together and our next steps.`,
    closing: 'If you have any questions, just reply to this email.',
    attachmentLabel: 'Document attached to this email',
    consultantLabel: 'Your consultant',
  },
  es: {
    lang: 'es',
    greeting: 'Hola,',
    body: (clientName: string) =>
      `adjunto encontraras la <strong>Quarterly Business Review</strong> de <strong>${clientName}</strong>, con el resumen de lo que hemos logrado juntos y los proximos pasos de nuestra colaboracion.`,
    closing: 'Si tienes alguna pregunta, responde directamente a este correo.',
    attachmentLabel: 'Documento adjunto a este correo',
    consultantLabel: 'Tu consultor',
  },
} as const;

function getTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: config.gmail.user,
      pass: config.gmail.appPassword,
    },
  });
}

export const POST = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    if (!isConfigured('gmail')) {
      throw new ApiError(503, 'Servizio email non configurato (GMAIL_USER / GMAIL_APP_PASSWORD mancanti)');
    }

    const body = await request.json() as {
      clientName?: string;
      recipientEmails?: string[];
      pdfBase64?: string;
      language?: string;
    };

    if (!body.clientName) throw new ApiError(400, 'Missing clientName');
    if (!body.recipientEmails?.length) throw new ApiError(400, 'Nessun destinatario selezionato');
    if (!body.pdfBase64) throw new ApiError(400, 'Missing PDF data');

    const invalidEmails = body.recipientEmails.filter(
      e => !e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e),
    );
    if (invalidEmails.length > 0) {
      throw new ApiError(400, `Email non valide: ${invalidEmails.join(', ')}`);
    }

    const filename = `QBR_${body.clientName.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    const senderName = auth.name || 'Spoki';
    const transporter = getTransporter();
    const lang = (['it', 'en', 'es'] as const).includes(body.language as 'it' | 'en' | 'es')
      ? (body.language as 'it' | 'en' | 'es')
      : 'it';
    const copy = EMAIL_COPY[lang];

    await transporter.sendMail({
      from: `${senderName} <${config.gmail.user}>`,
      replyTo: auth.email || config.gmail.user,
      to: body.recipientEmails.join(', '),
      subject: `QBR - ${body.clientName}`,
      html: `
<!DOCTYPE html>
<html lang="${copy.lang}">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f0fdf4;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

        <!-- Header -->
        <tr>
          <td style="background-color:#1a1f1d;padding:28px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="color:#16d46c;font-size:24px;font-weight:800;letter-spacing:-0.5px;">SPOKI</span>
                </td>
                <td style="text-align:right;">
                  <span style="color:rgba(255,255,255,0.5);font-size:12px;text-transform:uppercase;letter-spacing:1px;">Quarterly Business Review</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Green accent bar -->
        <tr>
          <td style="height:4px;background:linear-gradient(90deg,#16d46c,#10b981,#7c3aed);font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 24px;">
            <p style="margin:0 0 20px;color:#1a1f1d;font-size:15px;line-height:1.7;">
              ${copy.greeting}
            </p>
            <p style="margin:0 0 20px;color:#1a1f1d;font-size:15px;line-height:1.7;">
              ${copy.body(body.clientName)}
            </p>
            <p style="margin:0 0 28px;color:#1a1f1d;font-size:15px;line-height:1.7;">
              ${copy.closing}
            </p>

            <!-- Attachment badge -->
            <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
              <tr>
                <td style="background-color:#f0fdf4;border:1px solid #d1fae5;border-radius:10px;padding:14px 24px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding-right:12px;vertical-align:middle;">
                        <div style="width:36px;height:36px;background-color:#16d46c;border-radius:8px;text-align:center;line-height:36px;">
                          <span style="color:#ffffff;font-size:16px;font-weight:700;">PDF</span>
                        </div>
                      </td>
                      <td style="vertical-align:middle;">
                        <p style="margin:0;color:#1a1f1d;font-size:14px;font-weight:600;">QBR_${body.clientName.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf</p>
                        <p style="margin:2px 0 0;color:#6b7280;font-size:12px;">${copy.attachmentLabel}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Signature -->
            <table cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:24px;width:100%;">
              <tr>
                <td style="padding-right:16px;vertical-align:top;">
                  <div style="width:40px;height:40px;background-color:#16d46c;border-radius:10px;text-align:center;line-height:40px;">
                    <span style="color:#ffffff;font-size:18px;font-weight:700;">${senderName.charAt(0).toUpperCase()}</span>
                  </div>
                </td>
                <td style="vertical-align:top;">
                  <p style="margin:0 0 2px;color:#1a1f1d;font-size:14px;font-weight:600;">${senderName}</p>
                  <p style="margin:0 0 2px;color:#6b7280;font-size:13px;">${copy.consultantLabel}</p>
                  <p style="margin:0;color:#16d46c;font-size:13px;font-weight:600;">Spoki</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#1a1f1d;padding:20px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="color:#16d46c;font-size:13px;font-weight:700;">SPOKI</span>
                  <span style="color:rgba(255,255,255,0.4);font-size:12px;"> &middot; WhatsApp Business Platform</span>
                </td>
                <td style="text-align:right;">
                  <a href="https://spoki.it" style="color:#16d46c;font-size:12px;text-decoration:none;">spoki.it</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
      `,
      attachments: [
        {
          filename,
          content: Buffer.from(body.pdfBase64, 'base64'),
          contentType: 'application/pdf',
        },
      ],
    });

    logger.info(`QBR sent by ${auth.email} for ${body.clientName} to ${body.recipientEmails.length} recipient(s)`);
    return createSuccessResponse({ data: { sent: body.recipientEmails.length } });
  } catch (error) {
    return createErrorResponse(error, 'Invio QBR fallito');
  }
});
