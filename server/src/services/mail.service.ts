import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../config/logger';

let transporter: Transporter | null = null;
function getTransporter() {
  if (!env.mailEnabled) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Minimal, email-client-safe HTML layout with an optional call-to-action button. */
export function emailLayout({
  heading,
  paragraphs,
  cta,
}: {
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
}) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;color:#374151;line-height:1.55">${escape(p)}</p>`).join('');
  const button = cta
    ? `<p style="margin:22px 0"><a href="${cta.url}" style="background:#4f46e5;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escape(cta.label)}</a></p>
       <p style="font-size:12px;color:#9ca3af">Or open: ${escape(cta.url)}</p>`
    : '';
  return `<div style="font-family:Segoe UI,Arial,sans-serif;background:#f3f4f6;padding:28px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
      <p style="font-weight:700;color:#4f46e5;margin:0 0 18px">AgencyFlow</p>
      <h1 style="font-size:20px;color:#111827;margin:0 0 14px">${escape(heading)}</h1>
      ${body}${button}
    </div></div>`;
}

export interface MailResult {
  sent: boolean;
}

/**
 * Sends an email when SMTP is configured; otherwise logs it so local development and
 * demos work without an email provider. Never throws: email is a side effect.
 */
export async function sendMail(
  to: string,
  subject: string,
  html: string,
  attachments?: { filename: string; content: Buffer }[],
): Promise<MailResult> {
  const t = getTransporter();
  if (!t) {
    logger.info({ to, subject, attachments: attachments?.length ?? 0 }, 'Email not sent (SMTP not configured)');
    return { sent: false };
  }
  try {
    await t.sendMail({ from: env.MAIL_FROM, to, subject, html, attachments });
    return { sent: true };
  } catch (err) {
    logger.error({ err, to, subject }, 'Email failed');
    return { sent: false };
  }
}
