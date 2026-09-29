import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.TZ = process.env.TZ || 'Europe/Berlin';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const list = v => (v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

export const config = {
  root,
  port: Number(env.PORT || 3000),
  host: env.HOST || '0.0.0.0',
  // Öffentliche Adresse der App – wird in E-Mail-Links verwendet
  baseUrl: (env.BASE_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  dataDir: path.resolve(root, env.DATA_DIR || 'data'),
  // Geheimnis für Code-Hashes. In Produktion unbedingt setzen.
  secret: env.APP_SECRET || 'dev-secret-bitte-in-produktion-aendern',
  production: env.NODE_ENV === 'production',
  // Testmodus: Testseite /test mit Postfach, Route auch an künftigen Tagen startbar. Nie in Produktion aktivieren.
  testMode: env.TEST_MODE === '1' || env.TEST_MODE === 'true',
  // Betreiber muss einen Passkey haben (ADMIN_PASSKEY=optional nur für lokale Tests)
  adminPasskeyRequired: env.ADMIN_PASSKEY !== 'optional',
  adminEmails: list(env.ADMIN_EMAILS),
  // Testbetrieb: nur diese Adressen (oder „@domain.de“) dürfen Codes anfordern und E-Mails bekommen. Leer = alle.
  allowedEmails: list(env.ALLOWED_EMAILS),
  // Route auch vor dem Termintag startbar (zum Ausprobieren der Live-Anzeige)
  allowEarlyRoute: env.ALLOW_EARLY_ROUTE === '1' || env.ALLOW_EARLY_ROUTE === 'true',
  // Angaben für Impressum und Datenschutzerklärung
  operator: { name: env.OPERATOR_NAME || '', address: env.OPERATOR_ADDRESS || '', email: env.OPERATOR_EMAIL || (list(env.ADMIN_EMAILS)[0] || '') },
  smtp: env.SMTP_HOST ? {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === '1' || env.SMTP_SECURE === 'true',
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
  } : null,
  mailFrom: env.MAIL_FROM || 'Kaminfeger Verwaltung <no-reply@localhost>',
  codeTtlMin: 10,
  codeMaxAttempts: 5,
  codesPerHour: 6,
  sessionDays: 60,
  adminIdleMin: 5,
  docMaxDays: 14,
  uploadMaxBytes: 10 * 1024 * 1024
};

/** Darf an diese Adresse gesendet werden? (Freigabeliste im Testbetrieb) */
export function emailAllowed(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!config.allowedEmails.length || config.adminEmails.includes(e)) return true;
  return config.allowedEmails.some(a => a.startsWith('@') ? e.endsWith(a) : a === e);
}

if (config.production && config.secret.startsWith('dev-')) {
  console.warn('WARNUNG: APP_SECRET ist nicht gesetzt. Bitte in der Umgebung konfigurieren.');
}
