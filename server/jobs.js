import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { get, all, run } from './db.js';
import { queueMail } from './mail.js';
import { parseDate, dayLabel, toMin, fmtMin } from './util.js';
import { activeSweepForDistrict, sweepName, householdName } from './domain.js';

const slotDate = (date, time) => { const d = parseDate(date); d.setMinutes(toMin(time)); return d; };

/** Erinnerungen per E-Mail: am Vorabend um 18 Uhr und eine Stunde vorher. */
export function sendReminders(now = new Date()) {
  const rows = all(`SELECT b.id, b.time, b.household_id, b.reminded_eve, b.reminded_hour, w.date, c.slot_len, h.street, h.nr
    FROM bookings b JOIN windows w ON w.id = b.window_id JOIN campaigns c ON c.id = b.campaign_id JOIN households h ON h.id = b.household_id
    WHERE b.status = 'booked' AND b.visit IS NULL AND (b.reminded_eve = 0 OR b.reminded_hour = 0)`);
  for (const b of rows) {
    const at = slotDate(b.date, b.time);
    if (at <= now) continue;
    const eve = parseDate(b.date); eve.setDate(eve.getDate() - 1); eve.setHours(18, 0, 0, 0);
    const hour = new Date(at.getTime() - 3600000);
    const people = all(`SELECT u.email, r.rem_eve, r.rem_hour, r.ch_mail FROM residents r JOIN users u ON u.id = r.user_id WHERE r.household_id = ? AND r.status = 'verified'`, b.household_id);
    const range = `${b.time}–${fmtMin(toMin(b.time) + b.slot_len)}`;
    if (!b.reminded_eve && now >= eve && now < hour) {
      run('UPDATE bookings SET reminded_eve = 1 WHERE id = ?', b.id);
      for (const p of people) if (p.rem_eve && p.ch_mail) queueMail({ to: p.email, subject: `Morgen kommt Ihr Kaminfeger · ${range}`,
        text: `Erinnerung: Morgen, ${dayLabel(b.date)}, kommt Ihr Kaminfeger zwischen ${range} Uhr in die ${b.street} ${b.nr}.\n\nBitte halten Sie den Zugang zu Heizraum und Dachboden frei und heizen Sie den Kaminofen ab heute Abend nicht mehr.`,
        link: `${config.baseUrl}/kunde`, linkLabel: 'Termin ansehen' });
    }
    if (!b.reminded_hour && now >= hour) {
      run('UPDATE bookings SET reminded_hour = 1, reminded_eve = 1 WHERE id = ?', b.id);
      for (const p of people) if (p.rem_hour && p.ch_mail) queueMail({ to: p.email, subject: `In einer Stunde kommt Ihr Kaminfeger`,
        text: `Ihr Kaminfeger kommt heute zwischen ${range} Uhr. In der App sehen Sie live, wie weit er noch entfernt ist.`, link: `${config.baseUrl}/kunde`, linkLabel: 'Live ansehen' });
    }
  }
}

/**
 * Messenger: Ungelesene Nachrichten nach 10 Minuten per E-Mail melden – je Unterhaltung und Richtung eine Mail,
 * damit ein Hin und Her nicht für jede Zeile eine Mail auslöst.
 */
export function sendChatMails() {
  const groups = all(`SELECT household_id hid, from_sweep, COUNT(*) n, MAX(id) last FROM chat_messages
    WHERE read_at IS NULL AND mailed = 0 AND created_at <= datetime('now','-10 minutes') GROUP BY household_id, from_sweep`);
  for (const g of groups) {
    run('UPDATE chat_messages SET mailed = 1 WHERE household_id = ? AND from_sweep = ? AND mailed = 0 AND id <= ?', g.hid, g.from_sweep, g.last);
    const h = get('SELECT * FROM households WHERE id = ?', g.hid);
    const s = h && activeSweepForDistrict(h.district_id);
    if (!h || !s) continue;
    const last = get('SELECT text FROM chat_messages WHERE id = ?', g.last).text;
    const more = g.n > 1 ? `\n\n(${g.n} neue Nachrichten)` : '';
    if (g.from_sweep) {
      const to = all(`SELECT u.email FROM residents r JOIN users u ON u.id = r.user_id WHERE r.household_id = ? AND r.status = 'verified' AND r.ch_mail = 1`, h.id).map(x => x.email);
      for (const m of to) queueMail({ to: m, subject: `Neue Nachricht von Ihrem Kaminfeger ${sweepName(s)}`,
        text: `„${last}“${more}\n\nAntworten Sie direkt in der App.`, link: `${config.baseUrl}/kunde`, linkLabel: 'Nachricht öffnen' });
    } else {
      queueMail({ to: s.email, subject: `Neue Nachricht: Familie ${householdName(h)}, ${h.street} ${h.nr}`,
        text: `„${last}“${more}\n\nAntworten Sie direkt in Ihrer App.`, link: `${config.baseUrl}/kaminfeger`, linkLabel: 'Nachricht öffnen' });
    }
  }
}

/** Dokumente spätestens nach 14 Tagen löschen, abgelaufene Codes/Sessions aufräumen. */
export function purge() {
  const cutoff = new Date(Date.now() - config.docMaxDays * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  for (const d of all('SELECT * FROM documents WHERE uploaded_at < ?', cutoff)) {
    fs.rmSync(path.join(config.dataDir, 'uploads', d.stored), { force: true });
    run('DELETE FROM documents WHERE id = ?', d.id);
  }
  run(`DELETE FROM feedback WHERE (status = 'done' AND created_at < datetime('now','-90 days')) OR created_at < datetime('now','-180 days')`);
  run(`DELETE FROM codes WHERE created_at < datetime('now','-1 day')`);
  run(`DELETE FROM chat_messages WHERE created_at < datetime('now','-12 months')`);
  run(`DELETE FROM sessions WHERE expires_at < ?`, new Date().toISOString());
  run(`DELETE FROM tokens WHERE expires_at < ? AND used_at IS NULL`, new Date(Date.now() - 30 * 86400000).toISOString());
}

export function startJobs() {
  const tick = () => {
    try { sendReminders(); } catch (e) { console.error('Erinnerungen:', e); }
    try { sendChatMails(); } catch (e) { console.error('Nachrichten-Mails:', e); }
  };
  setInterval(tick, 60000).unref();
  setInterval(() => { try { purge(); } catch (e) { console.error('Aufräumen:', e); } }, 3600000).unref();
  purge();
}
