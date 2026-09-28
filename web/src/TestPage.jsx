// Testseite (nur mit TEST_MODE=1) – nach „Demo.dc.html“ (Claude Design):
// drei Apps live nebeneinander, Schritt-Anleitung aus dem echten Datenstand, Test-Postfach für Codes und Links.
import { useEffect, useState } from 'react';
import { sx, api, useData, fmtAt } from './lib/core.js';
import { Icon, Loading } from './ui.jsx';

const STEPS = [
  { who: 'O', title: 'Bezirksverzeichnis importieren', tag: ['tag-outline', 'Betreiber'], hint: <>Admin-E-Mail aus <b>ADMIN_EMAILS</b> eingeben → Code aus dem Postfach → Tab <b>Verzeichnis</b> → CSV importieren (Vorlage dort).</> },
  { who: 'S', title: 'Kaminfeger registrieren', tag: ['tag-neutral', 'Kaminfeger'], hint: <>Registrieren → Name <b>wie im Verzeichnis</b>, Betriebsadresse, E-Mail → Code aus dem Postfach → Bezirk wählen → Urkunde und Ausweis hochladen, Häkchen → <b>Zur Prüfung senden</b>.</> },
  { who: 'O', title: 'Prüfen & freigeben', tag: ['tag-outline', 'Betreiber'], hint: <>Kaminfeger öffnen → Dokumente ansehen → alle 4 Punkte abhaken → <b>Freigeben</b>.</> },
  { who: 'S', title: 'Bezirk freischalten', tag: ['tag-neutral', 'Kaminfeger'], hint: <>Im Postfach die Mail an die <b>Verzeichnis-Adresse</b> → <b>Link öffnen</b> → Zur App.</> },
  { who: 'S', title: 'Kehrbuch importieren', tag: ['tag-neutral', 'Kaminfeger'], hint: <><b>Kehrbuch importieren</b> → CSV mit Straße, Hausnummer, PLZ, Ort, Eigentümer, Kundennummer (Vorlage dort).</> },
  { who: 'S', title: 'Zeitfenster senden', tag: ['tag-neutral', 'Kaminfeger'], hint: <>Straße → <b>Zeitfenster anlegen</b> → Tag und Uhrzeit → <b>Speichern &amp; senden</b>. Haushalte mit E-Mail im Kehrbuch bekommen eine Einladung.</> },
  { who: 'K', title: 'Familie registrieren', tag: ['tag-accent', 'Kunde'], hint: <>Registrieren → Adresse <b>aus dem Kehrbuch</b> → E-Mail + Code → Kundennummer aus dem Kehrbuch → Zur App. (Oder Einladungslink aus dem Postfach öffnen.)</> },
  { who: 'K', title: 'Zeit buchen', tag: ['tag-accent', 'Kunde'], hint: <>Zeit wählen → Tag → freien Slot → optional „Schlüssel beim Nachbarn“ → verbindlich bestätigen.</> },
  { who: 'S', title: 'Route starten', tag: ['tag-neutral', 'Kaminfeger'], hint: <>Unten Tab <b>Route</b> → Tag wählen → <b>Route starten</b>. Im Testmodus geht das auch vor dem Termintag.</> },
  { who: 'S', title: 'Häuser abhaken', tag: ['tag-neutral', 'Kaminfeger'], hint: <>„Erledigt“ tippen und dabei den Kunden beobachten: <b>„2 Häuser entfernt“ → „Als Nächstes dran“</b>. Beim Kunden „Erledigt“ oder „Niemand da“.</> }
];
const PHONES = [
  { id: 'S', path: '/kaminfeger', tag: ['tag-neutral', 'Kaminfeger'], frame: 'var(--color-neutral-900)' },
  { id: 'O', path: '/betreiber', tag: ['tag-outline', 'Betreiber'], frame: 'var(--color-neutral-800)' },
  { id: 'K', path: '/kunde', tag: ['tag-accent', 'Kunde'], frame: 'var(--color-neutral-900)' }
];
const ring = on => on ? '0 0 0 2px var(--color-accent-700), 0 0 48px color-mix(in srgb, var(--color-accent) 22%, transparent)' : 'none';

export default function TestPage() {
  const [cfg, setCfg] = useState(null);
  const [src, setSrc] = useState({ S: '/kaminfeger?embed', O: '/betreiber?embed', K: '/kunde?embed' });
  const [keys, setKeys] = useState({ S: 0, O: 0, K: 0 });
  const [clock, setClock] = useState(() => new Date());
  const [copied, setCopied] = useState(null);
  useEffect(() => { api('/api/config').then(setCfg).catch(() => setCfg({ testMode: false })); const t = setInterval(() => setClock(new Date()), 30000); return () => clearInterval(t); }, []);
  const status = useData('/api/test/status', { enabled: !!cfg?.testMode });
  const box = useData('/api/test/outbox', { enabled: !!cfg?.testMode });
  if (!cfg) return <Loading />;
  if (!cfg.testMode) return (
    <div style={sx('min-height:100vh;display:grid;place-items:center;padding:24px;font-family:var(--font-body);color:var(--color-neutral-300);background:var(--color-bg);text-align:center')}>
      <div style={sx('max-width:420px;display:flex;flex-direction:column;gap:10px')}><span className="card-kicker">Testseite</span><div style={sx('font-size:22px;color:var(--color-text)')}>Nur im Testmodus verfügbar</div><div style={sx('font-size:14px')}>Starten Sie den Server mit <code>TEST_MODE=1</code>, um alle drei Apps nebeneinander zu testen. In Produktion bleibt diese Seite aus.</div></div>
    </div>
  );
  const done = status.data?.done || STEPS.map(() => false);
  const cur = done.indexOf(false);
  const at = cur >= 0 ? STEPS[cur].who : null;
  const hl = id => at === id || (cur === STEPS.length - 1 && id === 'K');
  const open = (id, path) => { setSrc(s => ({ ...s, [id]: path + (path.includes('?') ? '&' : '?') + 'embed' })); setKeys(k => ({ ...k, [id]: k[id] + 1 })); };
  const openLink = link => {
    const u = new URL(link, location.origin), p = u.pathname + u.search;
    if (p.startsWith('/aktivieren/') || p.startsWith('/kaminfeger')) open('S', p);
    else if (p.startsWith('/kunde')) open('K', p);
    else if (p.startsWith('/betreiber')) open('O', p);
    else window.open(p, '_blank');
  };
  const reset = async () => {
    if (!confirm('Wirklich alle Daten löschen? Konten, Verzeichnis, Kehrbuch und Buchungen sind danach weg.')) return;
    await api('/api/test/reset', { body: {} });
    setSrc({ S: '/kaminfeger?embed', O: '/betreiber?embed', K: '/kunde?embed' });
    setKeys(k => ({ S: k.S + 1, O: k.O + 1, K: k.K + 1 }));
  };
  const copy = code => { navigator.clipboard?.writeText(code).catch(() => {}); setCopied(code); setTimeout(() => setCopied(null), 1500); };
  const time = clock.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={sx('min-height:100vh;padding:40px 48px 64px;font-family:var(--font-body);color:var(--color-text);display:flex;flex-direction:column;gap:28px;background:radial-gradient(80% 40% at 0% 0%, color-mix(in srgb, var(--color-accent) 9%, transparent), transparent 70%), var(--color-bg);box-sizing:border-box')}>
      <div style={sx('display:flex;flex-wrap:wrap;gap:24px;align-items:flex-end;justify-content:space-between')}>
        <div style={sx('display:flex;flex-direction:column;gap:8px;max-width:720px')}>
          <span className="card-kicker">Testmodus · 3 Apps, live verbunden</span>
          <h1 style={sx('margin:0;font-size:40px;font-weight:500;letter-spacing:-0.02em;text-wrap:pretty')}>Kaminfeger-Termine testen</h1>
          <p style={sx('margin:0;font-size:15px;color:var(--color-neutral-400);text-wrap:pretty')}>Echte Abläufe mit echter Datenbank – ohne Beispieldaten. E-Mails landen im Postfach links, statt verschickt zu werden. Verzeichnis und Kehrbuch laden Sie als CSV hoch.</p>
        </div>
        <div style={sx('display:flex;gap:8px;align-items:center')}>
          <span style={sx('font-size:13px;color:var(--color-neutral-400);font-variant-numeric:tabular-nums')}>{done.filter(Boolean).length} von {STEPS.length} erledigt</span>
          <button className="btn btn-secondary" onClick={reset} style={sx('min-height:44px')}><Icon n="ph-trash" />Alles löschen</button>
        </div>
      </div>

      <div style={sx('display:flex;gap:40px;align-items:flex-start;flex-wrap:wrap')}>
        <div style={sx('width:340px;flex:none;display:flex;flex-direction:column;gap:8px;position:sticky;top:24px;max-height:calc(100vh - 48px);overflow-y:auto;scrollbar-width:none')}>
          <div style={sx('font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-neutral-500);padding:0 4px 4px')}>Ablauf</div>
          {STEPS.map((s, i) => {
            const d = done[i], c = i === cur;
            return (
              <div key={s.title} style={sx(`display:grid;grid-template-columns:28px minmax(0, 1fr);gap:10px;padding:12px;border-radius:var(--radius-lg);background:${c ? 'var(--color-surface)' : 'transparent'};box-shadow:${c ? '0 0 0 1px var(--color-accent-700), 0 0 30px color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'none'};opacity:${d ? '0.6' : '1'}`)}>
                <div style={sx(`width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:500;border:1px solid ${d || c ? 'var(--color-accent)' : 'var(--color-neutral-700)'};background:${d ? 'var(--color-accent)' : 'transparent'};color:${d ? 'var(--color-bg)' : c ? 'var(--color-accent)' : 'var(--color-neutral-400)'}`)}>{d ? <Icon w="ph-bold" n="ph-check" /> : i + 1}</div>
                <div style={sx('display:flex;flex-direction:column;gap:4px')}>
                  <div style={sx('display:flex;gap:8px;align-items:center')}><span style={sx('font-size:15px;font-weight:500;flex:1')}>{s.title}</span><span className={`tag ${s.tag[0]}`}>{s.tag[1]}</span></div>
                  {c && <div style={sx('font-size:13px;color:var(--color-neutral-300);text-wrap:pretty')}>{s.hint}</div>}
                </div>
              </div>
            );
          })}
          {cur === -1 && <div style={sx('margin-top:8px;padding:14px;border-radius:var(--radius-lg);box-shadow:0 0 0 1px var(--color-accent-700), 0 0 30px color-mix(in srgb, var(--color-accent) 14%, transparent);display:flex;flex-direction:column;gap:8px')}>
            <span className="card-kicker">Geschafft · weiter ausprobieren</span>
            <div style={sx('display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--color-neutral-300)')}>
              <span>Kunde: Termin verschieben, absagen, Profil → Mitbewohner einladen, Umzug melden</span>
              <span>Kaminfeger: Nachrichten → „Komme 15 Min. später“ senden</span>
              <span>Kaminfeger: Straße → offene Haushalte anrufen und Zeit eintragen</span>
              <span>Zweiter Kunde ohne Kundennummer → „Vom Kaminfeger bestätigen lassen“</span>
            </div>
          </div>}

          <div style={sx('font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-neutral-500);padding:18px 4px 4px;display:flex;gap:8px;align-items:center')}><Icon n="ph-tray" />Test-Postfach</div>
          {box.data && !box.data.mails.length && <div style={sx('font-size:13px;color:var(--color-neutral-500);padding:0 4px')}>Noch keine E-Mails.</div>}
          {(box.data?.mails || []).slice(0, 30).map(m => {
            const code = (m.subject.match(/Code: (\d{6})/) || [])[1];
            return (
              <div key={m.id} style={sx('padding:12px 14px;border-radius:var(--radius-lg);background:var(--color-surface);display:flex;flex-direction:column;gap:6px')}>
                <div style={sx('display:flex;gap:8px;font-size:12px;color:var(--color-neutral-500)')}><span style={sx('flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>an {m.to_addr}</span><span>{fmtAt(m.created_at).replace('Heute · ', '')}</span></div>
                <div style={sx('font-size:14px;font-weight:500')}>{code ? 'Code' : m.subject}</div>
                {code ? <button onClick={() => copy(code)} title="Kopieren" style={sx('align-self:flex-start;display:flex;gap:10px;align-items:center;padding:6px 12px;border-radius:var(--radius-md);border:1px solid var(--color-accent-700);background:var(--color-accent-900);color:var(--color-accent-200);font:inherit;font-size:22px;font-weight:500;letter-spacing:0.12em;font-variant-numeric:tabular-nums;cursor:pointer')}>{code}<Icon n={copied === code ? 'ph-check' : 'ph-copy'} style={sx('font-size:16px')} /></button>
                  : <div style={sx('font-size:12px;color:var(--color-neutral-400);white-space:pre-line;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden')}>{m.text}</div>}
                {m.link && <button className="btn btn-secondary" onClick={() => openLink(m.link)} style={sx('align-self:flex-start;min-height:36px;font-size:13px')}><Icon n="ph-link" />{m.link_label || 'Link öffnen'}</button>}
              </div>
            );
          })}
        </div>

        <div style={sx('display:flex;flex-wrap:wrap;gap:36px;align-items:flex-start;flex:1;min-width:0')}>
          {PHONES.map(p => (
            <div key={p.id} style={sx('display:flex;flex-direction:column;gap:12px')}>
              <div style={sx('display:flex;align-items:center;gap:10px;padding:0 6px;min-height:28px')}>
                <span className={`tag ${p.tag[0]}`}>{p.tag[1]}</span>
                <button onClick={() => open(p.id, p.path)} title="Neu laden" style={sx('background:none;border:0;color:var(--color-neutral-500);cursor:pointer;font-size:15px;padding:0')}><Icon n="ph-arrow-clockwise" /></button>
                <span style={sx('flex:1')} />
                {hl(p.id) && <span style={sx('font-size:12px;color:var(--color-accent);display:flex;gap:6px;align-items:center')}><span style={sx('width:6px;height:6px;border-radius:50%;background:var(--color-accent);box-shadow:0 0 8px var(--color-accent)')} />jetzt hier</span>}
              </div>
              <div style={sx(`border-radius:60px;box-shadow:${ring(hl(p.id))};transition:box-shadow .3s`)}>
                <div style={sx(`width:390px;height:844px;padding:10px;border-radius:56px;background:${p.frame};box-shadow:var(--shadow-md);box-sizing:border-box`)}>
                  <div style={sx('position:relative;width:100%;height:100%;border-radius:46px;overflow:hidden;background:var(--color-bg);display:flex;flex-direction:column')}>
                    <div style={sx('height:54px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:4px 30px 0 36px;font-size:15px;font-weight:600;position:relative;z-index:2')}>
                      <span>{time}</span>
                      <div style={sx('position:absolute;left:50%;top:11px;transform:translateX(-50%);width:122px;height:35px;border-radius:20px;background:color-mix(in srgb, var(--color-bg) 30%, black)')} />
                      <div style={sx('display:flex;gap:5px;align-items:center;font-size:16px')}><Icon w="ph-fill" n="ph-cell-signal-full" /><Icon w="ph-bold" n="ph-wifi-high" /><Icon w="ph-fill" n="ph-battery-full" style={sx('font-size:22px')} /></div>
                    </div>
                    <iframe key={keys[p.id]} title={p.tag[1]} src={src[p.id]} style={sx('flex:1;width:100%;border:0;background:var(--color-bg)')} />
                    <div style={sx('height:30px;flex:none;display:grid;place-items:center;position:relative;z-index:2')}><div style={sx('width:134px;height:5px;border-radius:3px;background:var(--color-neutral-300)')} /></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
