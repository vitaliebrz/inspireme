import { Resend } from 'resend';
import nodemailer from 'nodemailer';

const MAILTRAP_HOST = process.env['MAILTRAP_HOST'];
const MAILTRAP_USER = process.env['MAILTRAP_USER'];
const MAILTRAP_PASS = process.env['MAILTRAP_PASS'];
const useMailtrap = !!(MAILTRAP_HOST && MAILTRAP_USER && MAILTRAP_PASS);

const GMAIL_USER = process.env['GMAIL_USER'];
const GMAIL_PASS = process.env['GMAIL_APP_PASSWORD'];
const useGmail = !!(GMAIL_USER && GMAIL_PASS);

const transport = useMailtrap
  ? nodemailer.createTransport({
      host: MAILTRAP_HOST,
      port: parseInt(process.env['MAILTRAP_PORT'] ?? '2525'),
      auth: { user: MAILTRAP_USER, pass: MAILTRAP_PASS },
    })
  : useGmail
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    })
  : null;

const FROM = useMailtrap
  ? 'InspireMe <noreply@inspireme.ro>'
  : useGmail
  ? `InspireMe <${GMAIL_USER}>`
  : null;

// Resend (fallback când nu e Nodemailer configurat)
const resend = new Resend(process.env['RESEND_API_KEY']);
const RESEND_FROM = process.env['RESEND_FROM'] ?? 'InspireMe <onboarding@resend.dev>';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<void> {
  if (transport && FROM) {
    await transport.sendMail({ from: FROM, to, subject, html });
  } else {
    await resend.emails.send({ from: RESEND_FROM, to, subject, html });
  }
}

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'Resetează parola InspireMe',
    html: `
      <h2>Resetare parolă</h2>
      <p>Ai solicitat resetarea parolei. Apasă pe link-ul de mai jos (valid 1 oră, poate fi folosit o singură dată):</p>
      <a href="${resetLink}" style="background:#f6a623;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
        Resetează parola
      </a>
      <p>Dacă nu ai solicitat această acțiune, ignoră acest email — parola ta rămâne neschimbată.</p>
    `,
  });
}

export async function sendPasswordChangedEmail(to: string): Promise<void> {
  const when = new Date().toLocaleString('ro-RO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Chisinau' });
  await sendEmail({
    to,
    subject: 'Parola contului tău InspireMe a fost schimbată',
    html: `
      <h2>Parolă schimbată</h2>
      <p>Parola contului tău InspireMe a fost schimbată cu succes pe <strong>${when}</strong>.</p>
      <p>Toate sesiunile active au fost delogate din motive de securitate.</p>
      <p style="color:#ef4444;"><strong>Dacă nu tu ai făcut această schimbare</strong>, contul tău ar putea fi compromis — contactează urgent echipa InspireMe și resetează din nou parola.</p>
    `,
  });
}

export async function sendParentalConsentEmail(
  parentEmail: string,
  childName: string,
  confirmLink: string,
  rejectLink: string,
): Promise<void> {
  await sendEmail({
    to: parentEmail,
    subject: 'Confirmare cont minor pe InspireMe',
    html: `
      <h2>Confirmare acces InspireMe</h2>
      <p>${childName} dorește să se înregistreze pe platforma InspireMe.</p>
      <p>InspireMe este o platformă educațională pentru elevi (13-19 ani) din România.</p>
      <p>Vă rugăm să confirmați sau să refuzați accesul:</p>
      <a href="${confirmLink}" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-right:12px;">
        ✓ Confirm accesul copilului meu
      </a>
      <a href="${rejectLink}" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
        ✗ Nu confirm — șterge contul
      </a>
      <p style="margin-top:24px;color:#666;">Link-ul este valabil 48 ore.</p>
    `,
  });
}

export async function sendWelcomeEmail(to: string, firstName: string, role: 'elev' | 'antreprenor'): Promise<void> {
  const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:5173';
  const isElev = role === 'elev';
  await sendEmail({
    to,
    subject: 'Bun venit pe InspireMe! 🚀',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f1117;color:#f0f2f8;border-radius:16px;overflow:hidden;">
        <div style="background:#f6a623;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;font-size:28px;color:#fff;font-weight:800;">InspireMe</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Platforma ideilor de business</p>
        </div>
        <div style="padding:40px;">
          <h2 style="margin:0 0 12px;font-size:22px;color:#f0f2f8;">Salut, ${firstName}! 👋</h2>
          <p style="color:#8892a4;line-height:1.6;margin:0 0 24px;">
            ${isElev
              ? 'Contul tău de <strong style="color:#f0f2f8">elev</strong> a fost creat cu succes. Acum poți să-ți postezi ideile de business și să te conectezi cu antreprenori reali din România.'
              : 'Contul tău de <strong style="color:#f0f2f8">antreprenor</strong> a fost creat cu succes. Acum poți să descoperi ideile tinerilor talentați și să investești în viitorul lor.'
            }
          </p>
          <a href="${frontendUrl}/${isElev ? 'idea/new' : 'feed'}"
            style="display:inline-block;background:#f6a623;color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">
            ${isElev ? 'Postează prima ta idee →' : 'Explorează ideile →'}
          </a>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:32px 0;" />
          <p style="color:#8892a4;font-size:13px;margin:0;">
            Dacă ai întrebări, răspunde la acest email sau vizitează <a href="${frontendUrl}" style="color:#f6a623;">inspireme.ro</a>.
          </p>
        </div>
      </div>
    `,
  });
}

export async function sendSupportReplyEmail(
  to: string,
  userName: string,
  adminMessage: string,
  options?: { replyLink?: string },
): Promise<void> {
  const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:5173';
  const replyLink = options?.replyLink ?? `${frontendUrl}/support-chat`;
  const preview = adminMessage.length > 200 ? adminMessage.slice(0, 200) + '...' : adminMessage;
  await sendEmail({
    to,
    subject: 'Răspuns de la suportul InspireMe',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f1117;color:#f0f2f8;border-radius:16px;overflow:hidden;">
        <div style="background:#f6a623;padding:28px 40px;text-align:center;">
          <h1 style="margin:0;font-size:24px;color:#fff;font-weight:800;">InspireMe Support</h1>
        </div>
        <div style="padding:36px 40px;">
          <h2 style="margin:0 0 12px;font-size:18px;color:#f0f2f8;">Salut, ${userName}!</h2>
          <p style="color:#8892a4;line-height:1.6;margin:0 0 20px;">
            Ai primit un răspuns de la echipa de suport:
          </p>
          <div style="background:#161b27;border-left:3px solid #f6a623;border-radius:0 12px 12px 0;padding:16px 20px;margin-bottom:28px;">
            <p style="margin:0;color:#f0f2f8;line-height:1.7;white-space:pre-wrap;">${preview}</p>
          </div>
          <a href="${replyLink}"
            style="display:inline-block;background:#f6a623;color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;">
            Răspunde în aplicație →
          </a>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:28px 0;" />
          <p style="color:#8892a4;font-size:12px;margin:0;">
            Primești acest email deoarece ai o conversație activă cu suportul InspireMe.
          </p>
        </div>
      </div>
    `,
  });
}

