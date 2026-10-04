// Startschalter für den echten Betrieb.
//   npm run launch-check                 → prüft, ob alles für den Start bereit ist (ändert nichts)
//   npm run go-live                      → zeigt, welche Testdaten entfernt würden (ändert nichts)
//   npm run go-live -- --ausfuehren      → sichert die Datenbank und entfernt die Testdaten
// Testdaten = alles im Bezirk mit Bundesland „Testland“ bzw. PLZ 99999 (siehe testdaten/).
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db, dbFile, get, all, run } from './db.js';

const env = process.env;
const cmd = process.argv[2];
const ok = (t) => console.log(`  ✓ ${t}`);
const fail = (t, fix) => { console.log(`  ✗ ${t}${fix ? `\n      → ${fix}` : ''}`); problems++; };
const warn = (t, fix) => { console.log(`  ! ${t}${fix ? `\n      → ${fix}` : ''}`); warnings++; };
let problems = 0, warnings = 0;

const testDistricts = () => all(`SELECT * FROM districts WHERE land = 'Testland'`);
const testHouseholds = () => all(`SELECT id FROM households WHERE plz = '99999' OR district_id IN (SELECT id FROM districts WHERE land = 'Testland')`).map(r => r.id);

function check() {
  console.log('\nStart-Check Kaminfeger Verwaltung\n');
  console.log('Einstellungen');
  config.production ? ok('NODE_ENV=production') : fail('NODE_ENV ist nicht „production“', 'In /etc/kaminfeger.env NODE_ENV=production setzen');
  config.baseUrl.startsWith('https://') ? ok(`Adresse ${config.baseUrl}`) : fail(`BASE_URL ist ${config.baseUrl}`, 'BASE_URL=https://… setzen');
  config.secret.length >= 24 && !config.secret.startsWith('dev-') ? ok('APP_SECRET gesetzt') : fail('APP_SECRET fehlt oder ist zu kurz', 'openssl rand -hex 32');
  config.adminEmails.length ? ok(`Betreiber: ${config.adminEmails.join(', ')}`) : fail('ADMIN_EMAILS ist leer');
  ok(config.adminPasskeyRequired ? 'Betreiber: nur mit Passkey' : 'Betreiber: E-Mail-Code oder Passkey');
  !config.testMode ? ok('Testmodus aus') : fail('TEST_MODE ist an', 'Zeile TEST_MODE entfernen');
  !config.allowedEmails.length ? ok('Keine Freigabeliste – alle können sich anmelden') : fail(`Freigabeliste aktiv (${config.allowedEmails.length} Adressen)`, 'Zeile ALLOWED_EMAILS entfernen');
  !config.allowEarlyRoute ? ok('Route nur am Termintag startbar') : fail('ALLOW_EARLY_ROUTE ist an', 'Zeile ALLOW_EARLY_ROUTE entfernen');
  config.operator.name && config.operator.address ? ok(`Impressum: ${config.operator.name}`) : fail('Impressum unvollständig (OPERATOR_NAME / OPERATOR_ADDRESS)', 'Name und ladungsfähige Anschrift eintragen');

  console.log('\nE-Mail');
  if (!config.smtp) fail('Kein SMTP-Server eingerichtet – E-Mails würden nur im Log landen');
  else {
    ok(`SMTP: ${config.smtp.host}:${config.smtp.port}`);
    if (/amazonaws\.com$/.test(config.smtp.host)) warn('Amazon SES: im „Sandbox“-Modus gehen Mails nur an bestätigte Adressen', 'Produktionszugang bei SES beantragen oder Brevo nutzen (siehe BETRIEB.md)');
    if (/localhost>?$/.test(config.mailFrom)) fail(`Absender ${config.mailFrom}`, 'MAIL_FROM setzen');
    else ok(`Absender: ${config.mailFrom}`);
  }

  console.log('\nDaten');
  const admins = all(`SELECT u.email, (SELECT COUNT(*) FROM passkeys p WHERE p.user_id = u.id) n FROM users u WHERE u.role = 'admin'`);
  if (admins.some(a => a.n > 0 && config.adminEmails.includes(a.email))) ok('Betreiber-Passkey eingerichtet');
  else if (config.adminPasskeyRequired) fail('Kein Betreiber-Passkey', 'Unter /betreiber per Code entsperren und Passkey einrichten');
  else ok('Betreiber melden sich per E-Mail-Code an (Passkey freiwillig)');
  const td = testDistricts(), th = testHouseholds();
  !td.length && !th.length ? ok('Keine Testdaten') : fail(`Testdaten vorhanden (${td.length} Testbezirk, ${th.length} Test-Haushalte)`, 'npm run go-live -- --ausfuehren');
  const districts = get('SELECT COUNT(*) n FROM districts WHERE demo = 0').n - td.length;
  ok(`${districts} Bezirke im Verzeichnis – fehlende tragen Kaminfeger bei der Registrierung selbst ein`);

  console.log('\nSicherung');
  const dir = env.BACKUP_DIR || '/opt/kaminfeger/backups';
  let newest = null;
  try { newest = fs.readdirSync(dir).filter(f => f.endsWith('.sqlite')).map(f => fs.statSync(path.join(dir, f)).mtimeMs).sort().pop(); } catch {}
  if (!newest) fail(`Keine Sicherung in ${dir}`, 'Backup-Timer einrichten (deploy/backup.sh)');
  else if (Date.now() - newest > 26 * 3600000) fail(`Letzte Sicherung ist ${Math.round((Date.now() - newest) / 3600000)} h alt`);
  else ok(`Letzte Sicherung vor ${Math.round((Date.now() - newest) / 3600000)} h`);
  env.BACKUP_S3_BUCKET ? ok(`Zusätzlich extern gesichert: s3://${env.BACKUP_S3_BUCKET}`) : warn('Keine externe Sicherung (BACKUP_S3_BUCKET)', 'Fällt der Server aus, wären die Daten weg');

  console.log(problems ? `\n✗ ${problems} Punkt(e) offen${warnings ? `, ${warnings} Hinweis(e)` : ''} – noch nicht startklar.\n` : `\n✓ Startklar${warnings ? ` (${warnings} Hinweis(e))` : ''}.\n`);
  process.exit(problems ? 1 : 0);
}

function goLive(execute) {
  const td = testDistricts(), dIds = td.map(d => d.id), hIds = testHouseholds();
  const inList = ids => ids.length ? ids.join(',') : '-1';
  const campaigns = all(`SELECT id FROM campaigns WHERE district_id IN (${inList(dIds)}) OR (plz = '99999')`).map(r => r.id);
  const sweeps = all(`SELECT s.id, s.user_id, u.email FROM sweeps s JOIN users u ON u.id = s.user_id WHERE s.district_id IN (${inList(dIds)})`);
  const residents = all(`SELECT r.id, r.user_id, u.email FROM residents r JOIN users u ON u.id = r.user_id WHERE r.household_id IN (${inList(hIds)}) OR r.plz = '99999'`);
  console.log('\nTestdaten, die entfernt werden:\n');
  console.log(`  Testbezirke:        ${td.map(d => `${d.land} ${d.kreis} ${d.number}`).join(', ') || '–'}`);
  console.log(`  Haushalte:          ${hIds.length}`);
  console.log(`  Straßen-Runden:     ${campaigns.length} (mit Zeitfenstern, Terminen, Nachrichten)`);
  console.log(`  Kaminfeger-Konten:  ${sweeps.map(s => s.email).join(', ') || '–'}`);
  console.log(`  Bewohner-Konten:    ${residents.map(r => r.email).join(', ') || '–'}`);
  console.log('  Außerdem: Test-Postfach, abgelaufene Codes und Sitzungen der entfernten Konten.');
  console.log('  Bleibt: Betreiber-Zugang mit Passkey, Feedback, Protokoll, alle anderen Bezirke.\n');
  if (!execute) { console.log('Nichts geändert. Zum Ausführen: npm run go-live -- --ausfuehren\n'); return; }

  const backup = path.join(path.dirname(dbFile), `vor-start-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
  db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
  console.log(`Sicherung angelegt: ${backup}`);
  const cIn = inList(campaigns), hIn = inList(hIds), uIds = [...sweeps.map(s => s.user_id), ...residents.map(r => r.user_id)];
  db.exec('BEGIN');
  try {
    run(`DELETE FROM message_recipients WHERE household_id IN (${hIn}) OR message_id IN (SELECT id FROM messages WHERE campaign_id IN (${cIn}) OR sweep_id IN (${inList(sweeps.map(s => s.id))}))`);
    run(`DELETE FROM messages WHERE campaign_id IN (${cIn}) OR sweep_id IN (${inList(sweeps.map(s => s.id))})`);
    run(`DELETE FROM bookings WHERE campaign_id IN (${cIn}) OR household_id IN (${hIn})`);
    run(`DELETE FROM chat_messages WHERE household_id IN (${hIn})`);
    run(`DELETE FROM campaigns WHERE id IN (${cIn})`); // Zeitfenster per CASCADE
    run(`DELETE FROM route_days WHERE district_id IN (${inList(dIds)})`);
    run(`DELETE FROM tokens WHERE (kind IN ('invite','member') AND ref_id IN (${hIn})) OR (kind = 'owner' AND ref_id IN (${inList(residents.map(r => r.id))})) OR (kind = 'activate' AND ref_id IN (${inList(sweeps.map(s => s.id))}))`);
    for (const s of sweeps) {
      for (const d of all('SELECT stored FROM documents WHERE sweep_id = ?', s.id)) fs.rmSync(path.join(config.dataDir, 'uploads', d.stored), { force: true });
    }
    run(`DELETE FROM users WHERE id IN (${inList(uIds)})`); // Sitzungen, Passkeys, Bewohner, Kaminfeger, Dokumente per CASCADE
    run(`UPDATE residents SET household_id = NULL, status = 'unverified' WHERE household_id IN (${hIn})`);
    run(`DELETE FROM households WHERE id IN (${hIn})`);
    run(`UPDATE sweeps SET district_id = NULL WHERE district_id IN (${inList(dIds)})`);
    run(`DELETE FROM districts WHERE id IN (${inList(dIds)})`);
    run('DELETE FROM outbox');
    run(`INSERT INTO admin_log (admin_email, what, note) VALUES ('System', 'Start: Testdaten entfernt', ?)`, `${hIds.length} Haushalte, ${uIds.length} Konten · Sicherung ${path.basename(backup)}`);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  console.log('✓ Testdaten entfernt.\n');
}

if (cmd === 'check') check();
else if (cmd === 'go-live') goLive(process.argv.includes('--ausfuehren'));
else { console.error('Aufruf: node server/launch.js check | go-live [--ausfuehren]'); process.exit(1); }
