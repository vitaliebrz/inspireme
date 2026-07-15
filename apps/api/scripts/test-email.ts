import 'dotenv/config';
import { sendEmail } from '../src/lib/email.js';

// Script de verificare a pipeline-ului de email.
// Rulează: npx tsx scripts/test-email.ts [destinatar]
const to = process.argv[2] ?? 'user-test@inspireme.ro';

console.log(`[test-email] Transport: ${process.env['MAILTRAP_HOST'] ? 'Mailtrap sandbox' : (process.env['GMAIL_USER'] ? 'Gmail' : 'Resend')}`);
console.log(`[test-email] Trimit către: ${to} ...`);

sendEmail({
  to,
  subject: 'Test InspireMe — verificare pipeline email',
  html: '<h2>Merge! ✅</h2><p>Email de test trimis prin <code>sendEmail</code> unificat (lib/email.ts).</p>',
})
  .then(() => {
    console.log('✅ Trimitere reușită. Verifică inbox-ul Mailtrap.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Eroare la trimitere:', err);
    process.exit(1);
  });
