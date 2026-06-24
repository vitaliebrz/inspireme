import { Resend } from 'resend';

const resend = new Resend(process.env['RESEND_API_KEY']);
const FROM = 'InspireMe <noreply@inspireme.ro>';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<void> {
  await resend.emails.send({ from: FROM, to, subject, html });
}

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'Resetează parola InspireMe',
    html: `
      <h2>Resetare parolă</h2>
      <p>Ai solicitat resetarea parolei. Apasă pe link-ul de mai jos (valid 24 ore):</p>
      <a href="${resetLink}" style="background:#f6a623;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
        Resetează parola
      </a>
      <p>Dacă nu ai solicitat această acțiune, ignoră acest email.</p>
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

export async function sendAccountDeletionWarning(to: string, daysLeft: number): Promise<void> {
  await sendEmail({
    to,
    subject: `InspireMe — Contul tău va fi șters în ${daysLeft} zile`,
    html: `
      <h2>Avertizare inactivitate</h2>
      <p>Contul tău InspireMe nu a fost accesat de mult timp și va fi șters automat în <strong>${daysLeft} zile</strong>.</p>
      <p>Intră în cont pentru a-l salva:</p>
      <a href="${process.env['FRONTEND_URL']}/login" style="background:#f6a623;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
        Intră în cont
      </a>
    `,
  });
}
