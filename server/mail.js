import nodemailer from 'nodemailer';
import { config } from './config.js';
import { run } from './db.js';
import { live } from './live.js';

const transport = config.smtp ? nodemailer.createTransport(config.smtp) : null;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function html({ subject, text, link, linkLabel }) {
  const paras = text.split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const btn = link ? `<p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;padding:11px 18px;border-radius:8px;background:#8fd4c4;color:#161826;text-decoration:none;font-weight:600">${esc(linkLabel || 'Öffnen')}</a></p>
    <p style="margin:0;font-size:12px;color:#6b7686">Falls der Knopf nicht funktioniert: ${esc(link)}</p>` : '';
  return `<!doctype html><html><body style="margin:0;background:#f3f5f8;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1b2230">
  <div style="max-width:520px;margin:0 auto;padding:28px 20px"><div style="background:#fff;border-radius:12px;padding:26px 24px">
  <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7686;margin-bottom:10px">Kaminfeger-Termine</div>
  <h1 style="font-size:20px;font-weight:600;margin:0 0 16px">${esc(subject)}</h1>${paras}${btn}</div>
  <p style="font-size:11px;color:#8a94a3;text-align:center;margin-top:14px">Diese E-Mail wurde automatisch versendet.</p></div></body></html>`;
}

/**
 * Versendet eine E-Mail. Ohne SMTP-Konfiguration wird sie ins Server-Log geschrieben.
 * Im Testmodus landet sie zusätzlich im Test-Postfach (nie in Produktion – dort stünden Codes im Klartext).
 */
export async function sendMail({ to, subject, text, link, linkLabel }) {
  const body = link ? `${text}\n\n${linkLabel || 'Link'}: ${link}` : text;
  if (config.testMode) {
    run('INSERT INTO outbox (to_addr, subject, text, link, link_label) VALUES (?,?,?,?,?)', to, subject, text, link, linkLabel);
    live.bump('outbox');
  }
  if (!transport) {
    if (process.env.NODE_TEST_CONTEXT) return;
    console.log(`\n✉  E-Mail an ${to}\n   Betreff: ${subject}\n   ${body.replace(/\n/g, '\n   ')}\n`);
    return;
  }
  try {
    await transport.sendMail({ from: config.mailFrom, to, subject, text: body, html: html({ subject, text, link, linkLabel }) });
  } catch (e) {
    console.error('E-Mail-Versand fehlgeschlagen:', to, subject, e.message);
    throw e;
  }
}

/** Fire-and-forget – Fehler werden geloggt, blockieren aber den Request nicht. */
export function queueMail(m) { sendMail(m).catch(() => {}); }
