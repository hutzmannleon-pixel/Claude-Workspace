// Notfall: Passkeys eines Kontos löschen (z. B. Handy verloren). Danach geht die Anmeldung wieder per E-Mail-Code.
// Aufruf auf dem Server:  npm run reset-passkeys -- name@example.de [admin|sweep|customer]
import { get, run } from './db.js';
const [email, role = 'admin'] = process.argv.slice(2);
if (!email) { console.error('Aufruf: npm run reset-passkeys -- E-Mail [admin|sweep|customer]'); process.exit(1); }
const u = get('SELECT id FROM users WHERE email = ? AND role = ?', email.trim().toLowerCase(), role);
if (!u) { console.error(`Kein Konto ${email} (${role}) gefunden.`); process.exit(1); }
const n = run('DELETE FROM passkeys WHERE user_id = ?', u.id).changes;
console.log(`${n} Passkey(s) von ${email} (${role}) gelöscht.`);
