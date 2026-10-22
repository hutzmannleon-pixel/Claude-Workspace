import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.TZ = process.env.TZ || 'Europe/Berlin';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;

export const config = {
  root,
  port: Number(env.PORT || 3000),
  host: env.HOST || '0.0.0.0',
  // Öffentliche Adresse – steckt im QR-Code für das Hochladen per Handy
  baseUrl: (env.BASE_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  dataDir: path.resolve(root, env.DATA_DIR || 'data'),
  // Geheimnis für Sitzungs-Hashes. In Produktion unbedingt setzen.
  secret: env.APP_SECRET || 'dev-secret-bitte-in-produktion-aendern',
  production: env.NODE_ENV === 'production',
  uploadMaxBytes: Number(env.UPLOAD_MAX_MB || 15) * 1024 * 1024,
  sessionDays: 30
};
