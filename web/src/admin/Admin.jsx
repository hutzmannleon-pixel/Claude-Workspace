// Betreiber-App – nach „BetreiberApp“ (Claude Design), angebunden an /api/admin/*.
import { Fragment, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { sx, api, upload, useData, useAction, useWide, since, fmtAt, EMAIL_RE } from '../lib/core.js';
import { LogoMark } from '../brand.jsx';
import { loginPasskey, passkeySupported } from '../lib/passkey.js';
import { Shell, GLOW, Icon, HomeBack, PasskeyLogin, PasskeyPanel, BackHeader, SectionLabel, Sheet, Seg, Avatar, Toast, ErrorLine, Loading, CodeInput, Input, Field, CheckRow, FilePick, EmptyPane, DIV_BOTTOM, bubble } from '../ui.jsx';

const PdfView = lazy(() => import('./PdfView.jsx'));
const TAG = { pending: ['offen', 'tag-accent'], query: ['Rückfrage', 'tag-outline'], approved: ['freigegeben', 'tag-neutral'], rejected: ['abgelehnt', 'tag-neutral'],
  asked: ['beim Kaminfeger', 'tag-outline'], letter: ['E-Mail gesendet', 'tag-outline'], dismissed: ['verworfen', 'tag-neutral'] };
const CH_BAFA = ['bafa', 'Im Schornsteinfegerregister: Name, Kehrbezirk und Bestellungsdatum stimmen'];
const CH = [['name', 'Name auf der Urkunde = Konto-Name'], ['nr', 'Bezirksnummer auf der Urkunde stimmt'], ['valid', 'Bestellung gültig, nicht abgelaufen'], ['id', 'Ausweis lesbar und passt zur Urkunde']];
const REASONS = ['Urkunde unleserlich – bitte neu hochladen', 'Name passt nicht zur Urkunde', 'Bezirk gehört einer anderen Person', 'Verdacht auf gefälschte Unterlagen'];
const isOpen = s => s === 'pending' || s === 'query';
const autoRow = a => ({ text: a[1], icon: a[0] === 'ok' ? 'ph-check' : a[0] === 'warn' ? 'ph-warning' : 'ph-info',
  fg: a[0] === 'ok' ? 'var(--color-accent)' : a[0] === 'warn' ? 'var(--color-accent-300)' : 'var(--color-neutral-500)', tfg: a[0] === 'warn' ? 'var(--color-accent-200)' : 'var(--color-text)' });
const LS = 'kf-admin-email';
const lsGet = () => { try { return localStorage.getItem(LS) || ''; } catch { return ''; } };
const lsSet = v => { try { localStorage.setItem(LS, v); } catch { /* egal */ } };

export default function Admin() {
  const [me, setMe] = useState(undefined);
  useEffect(() => { api('/api/auth/me?role=admin').then(r => setMe(r.user)).catch(() => setMe(null)); }, []);
  if (me === undefined) return <Loading />;
  if (!me) return <Lock onUnlock={setMe} />;
  // Pflicht: ohne Passkey geht es nach dem ersten Entsperren nicht weiter
  if (me.passkeyRequired && !me.passkeys) return <PasskeySetup me={me} onDone={async () => setMe((await api('/api/auth/me?role=admin')).user)} onLock={() => setMe(null)} />;
  return <AdminApp me={me} onLock={() => setMe(null)} />;
}

function Lock({ onUnlock }) {
  const [email, setEmail] = useState(lsGet());
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const act = useAction();
  const send = () => act.run(async () => { await api('/api/auth/code', { body: { email: email.trim(), role: 'admin', purpose: 'login' } }); setSent(true); setCode(''); });
  const finish = async () => {
    const u = (await api('/api/auth/me?role=admin')).user;
    if (!u) throw new Error('Anmeldung nicht gespeichert – bitte Cookies erlauben und über https:// aufrufen.');
    onUnlock(u);
  };
  const unlock = () => act.run(async () => { await api('/api/auth/login', { body: { email: email.trim(), role: 'admin', code } }); lsSet(email.trim()); await finish(); });
  const passkeyUnlock = () => act.run(async () => { await loginPasskey('admin'); await finish(); });
  return (
    <Shell glow={GLOW.admin} top={<HomeBack />} bottom={
      <div style={sx('flex:none;padding:10px 16px 6px;position:relative;z-index:2;display:flex;flex-direction:column;gap:12px')}>
        {!sent && <PasskeyLogin onPasskey={passkeyUnlock} busy={act.busy} label="Mit Passkey entsperren" hint="Beim ersten Mal mit Code per E-Mail entsperren – danach richten Sie den Passkey ein." />}
        {!sent && <Field label="Admin-E-Mail"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@betreiber.de" autoComplete="email" /></Field>}
        {sent && <CodeInput email={email} value={code} onChange={setCode} label="Entsperrcode" onResend={send} />}
        {act.error && <ErrorLine text={act.error} />}
        <button className="btn btn-primary" disabled={act.busy || (sent ? code.length < 6 : !EMAIL_RE.test(email.trim()))} onClick={sent ? unlock : send} style={sx('width:100%;min-height:50px;font-size:15px')}>
          <Icon n={sent ? 'ph-lock-simple-open' : 'ph-envelope-simple'} style={sx('font-size:18px')} />{sent ? 'Entsperren' : 'Code per E-Mail senden'}</button>
        {sent && <button className="btn btn-ghost" onClick={() => { setSent(false); act.setError(null); }} style={sx('min-height:40px;color:var(--color-neutral-400)')}>Andere E-Mail</button>}
      </div>
    }>
      <div style={sx('padding:56px 26px 0;display:flex;flex-direction:column;gap:12px')}>
        <LogoMark size={64} title="Kaminfeger Verwaltung" />
        <span className="card-kicker" style={sx('margin-top:8px')}>Kaminfeger Verwaltung</span>
        <div style={sx('font-size:32px;font-weight:600;letter-spacing:-0.025em;line-height:1.1')}>Betreiber-Zugang</div>
        <div style={sx('font-size:14px;color:var(--color-neutral-400);text-wrap:pretty')}>Nur für freigeschaltete Admins. Jede Entscheidung wird mit deinem Namen protokolliert.</div>
      </div>
      <div style={sx('display:flex;flex-direction:column;gap:12px;padding:36px 26px 20px;font-size:13px;color:var(--color-neutral-400)')}>
        <div style={sx('display:flex;gap:10px;align-items:center')}><Icon n="ph-key" style={sx('font-size:18px;color:var(--color-accent)')} />Entsperren per Passkey – beim ersten Mal mit Code per E-Mail</div>
        <div style={sx('display:flex;gap:10px;align-items:center')}><Icon n="ph-timer" style={sx('font-size:18px;color:var(--color-accent)')} />Sperrt nach 5 Minuten Inaktivität</div>
        <div style={sx('display:flex;gap:10px;align-items:center')}><Icon n="ph-eye" style={sx('font-size:18px;color:var(--color-accent)')} />Dokumente nur ansehen, kein Download</div>
      </div>
    </Shell>
  );
}

function AdminApp({ me, onLock }) {
  const [ui, setUi] = useState({ screen: 'queue', kind: 'sweep', sel: null, overlay: null, checks: {}, reason: null, queryText: '', toast: null, result: null, docId: null, dir: null });
  const set = p => setUi(u => ({ ...u, ...p }));
  const act = useAction();
  const wide = useWide();
  const scr = ui.screen;
  const q = useData('/api/admin/queue');
  const detailPath = ui.sel ? `/api/admin/${ui.sel.kind === 'sweep' ? 'sweeps' : 'residents'}/${ui.sel.id}` : null;
  const det = useData(detailPath, { enabled: !!ui.sel && (scr === 'detail' || scr === 'result') });
  const log = useData('/api/admin/log', { enabled: scr === 'log' });
  const dir = useData('/api/admin/directory', { enabled: scr === 'dir' });
  const fb = useData('/api/admin/feedback');
  const lock = async () => { await api('/api/admin/logout', { body: {} }).catch(() => {}); onLock(); };

  // Sperre bei 401 (Server-Timeout) und nach 5 Minuten ohne Eingabe
  useEffect(() => { if ([q.error, det.error, log.error, dir.error, fb.error].some(e => e?.status === 401)) onLock(); }, [q.error, det.error, log.error, dir.error, fb.error]); // eslint-disable-line react-hooks/exhaustive-deps
  const idle = useRef(null);
  useEffect(() => {
    const reset = () => { clearTimeout(idle.current); idle.current = setTimeout(lock, 5 * 60000); };
    reset();
    const evs = ['pointerdown', 'keydown', 'scroll'];
    evs.forEach(e => window.addEventListener(e, reset, true));
    return () => { clearTimeout(idle.current); evs.forEach(e => window.removeEventListener(e, reset, true)); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!q.data) return <Loading />;
  const all = [...q.data.sweeps.map(x => ({ ...x, kind: 'sweep' })), ...q.data.residents.map(x => ({ ...x, kind: 'res' }))];
  const cnt = k => all.filter(x => x.kind === k && isOpen(x.status)).length;
  const flagOf = x => { const w = x.auto.find(a => a[0] === 'warn'); return w ? { t: x.flag || w[1], icon: 'ph-warning', fg: 'var(--color-accent-300)' } : { t: 'Alle automatischen Checks bestanden', icon: 'ph-check', fg: 'var(--color-neutral-400)' }; };
  const queue = all.filter(x => x.kind === ui.kind).sort((a, b) => isOpen(b.status) - isOpen(a.status));
  const x = det.data && ui.sel && det.data.id === ui.sel.id && det.data.kind === ui.sel.kind ? det.data : null;
  const decided = x ? !(isOpen(x.status) || (x.kind === 'res' && ['letter', 'asked'].includes(x.status))) : false;
  const mine = x ? ui.checks[x.id] || [] : [];
  const needed = x?.manual ? [CH_BAFA, ...CH] : CH;
  const toQueue = () => { act.setError(null); set({ screen: 'queue', overlay: null, result: null, sel: null }); };
  const decide = (path, body, after) => act.run(async () => { const r = await api(path, { body }); after(r || {}); q.reload(); det.reload(); });

  let resActions = [];
  if (x && x.kind === 'res') {
    const askSweep = { label: 'Kaminfeger um Bestätigung bitten', icon: 'ph-user-check', action: 'ask_sweep' };
    const askOwner = { label: 'Eigentümer per E-Mail fragen', icon: 'ph-envelope-simple', action: 'ask_owner' };
    if (x.status === 'pending') resActions = [x.sweep && askSweep, x.ownerMail && askOwner, { label: 'Ablehnen', icon: 'ph-x', action: 'reject', ghost: true }];
    if (x.status === 'letter') resActions = [{ label: 'E-Mail erneut senden', icon: 'ph-envelope-simple', action: 'resend' }, x.sweep && askSweep, { label: 'Anfrage verwerfen', icon: 'ph-trash-simple', action: 'dismiss' }];
    if (x.status === 'asked') resActions = [x.ownerMail && askOwner, { label: 'Ablehnen', icon: 'ph-x', action: 'reject', ghost: true }];
    resActions = resActions.filter(Boolean).map((a, i) => ({ ...a, cls: a.ghost ? 'btn-ghost' : i === 0 ? 'btn-primary' : 'btn-secondary' }));
  }
  const res = ui.result;
  let resTitle = '', resSub = '', resSteps = [], resIcon = 'ph-seal-check', muted = false;
  if (res && x) {
    if (res.type === 'approved') {
      resTitle = `${x.name} freigegeben`; resSub = `Kehrbezirk ${x.bez} wird freigeschaltet, sobald der Link in der E-Mail geöffnet ist.`;
      resSteps = [
        { icon: 'ph-envelope-simple', t: 'Freischaltlink per E-Mail gesendet', s: res.fromList === false ? `An ${res.sentTo} (E-Mail der Registrierung)` : `An ${res.sentTo} – die Adresse aus dem Bezirksverzeichnis, nicht die vom Kaminfeger angegebene` },
        ...(res.fromList === false ? [{ icon: 'ph-list-plus', t: `Kehrbezirk ${x.bez} ins Verzeichnis übernommen`, s: 'Mit Name und Betriebsadresse, nach dem Abgleich im Schornsteinfegerregister' }] : []),
        { icon: 'ph-trash-simple', t: 'Bestellungsurkunde gelöscht', s: 'Datei endgültig entfernt' },
        { icon: 'ph-trash-simple', t: 'Ausweisfoto gelöscht', s: 'Datei endgültig entfernt' },
        { icon: 'ph-list-checks', t: 'Protokolliert', s: 'Prüfer, Zeitpunkt, Ergebnis – keine Dokumente' }];
    } else {
      resTitle = 'Abgelehnt'; resSub = `${x.name} wurde per E-Mail informiert und kann neue Unterlagen einreichen.`; resIcon = 'ph-x'; muted = true;
      resSteps = [
        { icon: 'ph-envelope-simple', t: 'E-Mail an den Kaminfeger', s: 'Grund: ' + res.reason },
        { icon: 'ph-trash-simple', t: 'Urkunde und Ausweis gelöscht', s: 'Bei neuer Einreichung wird neu hochgeladen' },
        { icon: 'ph-list-checks', t: 'Protokolliert', s: 'Prüfer, Zeitpunkt, Grund' }];
    }
  }
  const doc = x?.docs?.find(d => d.id === ui.docId);
  const tabs = [
    { label: 'Prüfungen', icon: 'ph-seal-check', on: scr === 'queue', onClick: toQueue, badge: cnt('sweep') + cnt('res') },
    { label: 'Protokoll', icon: 'ph-list-checks', on: scr === 'log', onClick: () => set({ screen: 'log', toast: null }) },
    { label: 'Verzeichnis', icon: 'ph-book-open', on: scr === 'dir', onClick: () => set({ screen: 'dir', toast: null, dir: null }) },
    { label: 'Vorschau', icon: 'ph-eye', on: scr === 'demo', onClick: () => set({ screen: 'demo', toast: null }) },
    { label: 'Feedback', icon: 'ph-chat-circle-dots', on: scr === 'feedback', onClick: () => set({ screen: 'feedback', toast: null }), badge: (fb.data?.items || []).filter(f => f.status === 'open').length }
  ];
  // Vorschau: neuer Tab zuerst öffnen (sonst blockt der Browser das Popup nach dem Warten), dann Adresse setzen
  const openDemo = (as, reset = false) => {
    const w = window.open('about:blank', '_blank');
    act.run(async () => {
      try { const r = await api('/api/admin/demo', { body: { as, reset } }); if (w) w.location.href = r.url; else location.href = r.url; }
      catch (e) { if (w) w.close(); throw e; }
    });
  };
  const fbAct = (id, action) => act.run(async () => { await api(`/api/admin/feedback/${id}`, { body: { action } }); fb.reload(); });
  const fbImg = (fb.data?.items || []).find(f => f.id === ui.fbId);
  const mailto = to => {
    const subject = `Bestätigung Kehrbezirk ${x.bez}`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(ui.queryText)}`, '_blank');
    decide(`/api/admin/sweeps/${x.id}/query`, { to }, () => set({ overlay: null, screen: 'queue', sel: null, toast: `Rückfrage an ${to === 'innung' ? 'Innung' : 'Behörde'} protokolliert – die E-Mail öffnet sich in deinem Mailprogramm.` }));
  };

  const bottom = <>
    {scr === 'result' && <div style={sx('flex:none;padding:10px 16px 6px;position:relative;z-index:2')}><button className="btn btn-secondary" onClick={toQueue} style={sx('width:100%;min-height:50px;font-size:15px')}>Zur Prüfliste</button></div>}
  </>;
  const overlay = <>
    {ui.overlay === 'doc' && doc && <div style={sx('position:absolute;inset:0;z-index:5;background:color-mix(in srgb, var(--color-bg) 92%, transparent);display:flex;flex-direction:column;padding:24px 16px 24px;gap:14px')}>
      <div style={sx('display:flex;align-items:center;gap:8px')}><span style={sx('font-size:17px;font-weight:500;flex:1')}>{doc.kind === 'urkunde' ? 'Bestellungsurkunde' : 'Ausweis'}</span><button className="btn btn-secondary btn-icon" onClick={() => set({ overlay: null })} style={sx('width:44px;height:44px')} aria-label="Schließen"><Icon n="ph-x" style={sx('font-size:18px')} /></button></div>
      <div onContextMenu={e => e.preventDefault()} style={sx('flex:1;border-radius:var(--radius-md);background:var(--color-neutral-200);position:relative;overflow:hidden;display:grid;place-items:center;color:var(--color-neutral-600);font-size:13px;text-align:center')}>
        {doc.mime === 'application/pdf'
          ? <Suspense fallback={<span>Dokument lädt …</span>}><PdfView url={`/api/admin/documents/${doc.id}`} /></Suspense>
          : <img alt="Dokument" src={`/api/admin/documents/${doc.id}`} draggable={false} style={sx('max-width:100%;max-height:100%;object-fit:contain;user-select:none')} />}
        <div style={sx('position:absolute;inset:0;pointer-events:none;display:grid;place-items:center;transform:rotate(-24deg);font-size:22px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:color-mix(in srgb, var(--color-bg) 22%, transparent)')}>Nur zur Prüfung</div>
        <div style={sx('position:absolute;left:0;right:0;bottom:0;padding:10px 12px;background:color-mix(in srgb, var(--color-bg) 85%, transparent);color:var(--color-neutral-200);font-size:11px;letter-spacing:0.06em;text-transform:uppercase;display:flex;gap:8px;align-items:center')}><Icon n="ph-eye" /><span>Nur zur Prüfung · {me.email} · {new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span></div>
      </div>
      <div style={sx('font-size:12px;color:var(--color-neutral-400);display:flex;gap:8px')}><Icon n="ph-trash-simple" style={sx('font-size:15px')} /><span style={sx('text-wrap:pretty')}>Wird nach deiner Entscheidung gelöscht. Bitte nicht herunterladen oder weitergeben.</span></div>
    </div>}
    {ui.overlay === 'fbimg' && fbImg && <div onClick={() => set({ overlay: null })} style={sx('position:absolute;inset:0;z-index:5;background:color-mix(in srgb, var(--color-bg) 94%, transparent);display:grid;place-items:center;padding:16px;cursor:zoom-out')}>
      <FbImage f={fbImg} big />
    </div>}
    {ui.overlay === 'passkeys' && <Sheet scroll>
      <div style={sx('font-size:20px;font-weight:600')}>Passkeys</div>
      <PasskeyPanel role="admin" intro="Der Betreiber-Zugang wird nur per Passkey entsperrt. Richten Sie am besten zwei Geräte ein, damit Sie bei Verlust nicht ausgesperrt sind." />
      <button className="btn btn-ghost" onClick={() => set({ overlay: null })} style={sx('min-height:44px;color:var(--color-neutral-300)')}>Schließen</button>
    </Sheet>}
    {ui.overlay === 'query' && x && <Sheet>
      <div style={sx('font-size:20px;font-weight:500')}>Rückfrage stellen</div>
      <div style={sx('font-size:14px;color:var(--color-neutral-300);text-wrap:pretty')}>Zuständig für Kehrbezirk {x.bez}: die Schornsteinfeger-Aufsicht der Stadt bzw. des Landkreises – oder die Innung. Die E-Mail öffnet sich in deinem Mailprogramm.</div>
      <div className="field"><label>Anfrage (Vorlage)</label><textarea className="input" value={ui.queryText} onChange={e => set({ queryText: e.target.value })} style={sx('min-height:96px;font-size:14px')} /></div>
      {act.error && <ErrorLine text={act.error} />}
      <div style={sx('display:grid;grid-template-columns:1fr 1fr;gap:8px')}>
        <button className="btn btn-primary" disabled={act.busy} onClick={() => mailto('behoerde')} style={sx('min-height:46px')}><Icon n="ph-envelope-simple" />An Behörde</button>
        <button className="btn btn-secondary" disabled={act.busy} onClick={() => mailto('innung')} style={sx('min-height:46px')}><Icon n="ph-users-three" />An Innung</button>
      </div>
      <button className="btn btn-ghost" onClick={() => set({ overlay: null })} style={sx('min-height:44px;color:var(--color-neutral-400)')}>Abbrechen</button>
    </Sheet>}
    {ui.overlay === 'reject' && x && <Sheet>
      <div style={sx('font-size:20px;font-weight:500')}>Ablehnen – Grund</div>
      <div style={sx('display:flex;flex-direction:column;gap:2px')}>
        {REASONS.map(r => <label key={r} className="radio" style={sx('min-height:44px')}><input type="radio" name="rr" checked={ui.reason === r} onChange={() => set({ reason: r })} /><span className="dot" /><span>{r}</span></label>)}
      </div>
      {act.error && <ErrorLine text={act.error} />}
      <button className="btn btn-primary" disabled={!ui.reason || act.busy} onClick={() => decide(`/api/admin/sweeps/${x.id}/reject`, { reason: ui.reason }, () => set({ overlay: null, screen: 'result', result: { type: 'rejected', reason: ui.reason } }))} style={sx('min-height:48px;margin-top:4px')}>Ablehnen &amp; per E-Mail informieren</button>
      <button className="btn btn-ghost" onClick={() => set({ overlay: null })} style={sx('min-height:44px;color:var(--color-neutral-400)')}>Abbrechen</button>
    </Sheet>}
  </>;

  const queueView = <>
        <div style={sx('padding:10px 22px 0;display:flex;align-items:center;justify-content:space-between;gap:12px')}>
          <div><div style={sx('font-size:12px;color:var(--color-neutral-500)')}>Betreiber · {me.email}</div><div style={sx('font-size:23px;font-weight:500;letter-spacing:-0.015em;line-height:1.2')}>Prüfungen</div></div>
          <div style={sx('display:flex;gap:8px')}>
            <button className="btn btn-secondary btn-icon" onClick={() => set({ overlay: 'passkeys' })} style={sx('width:44px;height:44px')} aria-label="Passkeys verwalten"><Icon n="ph-fingerprint" style={sx('font-size:19px')} /></button>
            <button className="btn btn-secondary btn-icon" onClick={lock} style={sx('width:44px;height:44px')} aria-label="Sperren"><Icon n="ph-lock-simple" style={sx('font-size:18px')} /></button>
          </div>
        </div>
        <Toast text={ui.toast} />
        <div style={sx('padding:14px 16px 0')}><Seg value={ui.kind} onChange={k => set({ kind: k })} options={[{ value: 'sweep', label: `Kaminfeger · ${cnt('sweep')}` }, { value: 'res', label: `Bewohner · ${cnt('res')}` }]} /></div>
        <div style={sx('display:flex;flex-direction:column;gap:8px;padding:12px 16px 0')}>
          {!queue.length && <div style={sx('font-size:14px;color:var(--color-neutral-500);padding:10px 6px')}>Keine Einträge.</div>}
          {queue.map(it => { const f = flagOf(it), op = isOpen(it.status), tg = TAG[it.status] || TAG.pending; return (
            <button key={it.kind + it.id} onClick={() => { act.setError(null); set({ screen: 'detail', sel: { kind: it.kind, id: it.id }, overlay: null, toast: null }); }} aria-current={wide && ui.sel?.kind === it.kind && ui.sel?.id === it.id ? 'true' : undefined} style={sx(`text-align:left;padding:12px 14px;border-radius:var(--radius-lg);background:${op ? 'var(--color-surface)' : 'transparent'};border:0;box-shadow:${wide && ui.sel?.kind === it.kind && ui.sel?.id === it.id ? '0 0 0 1px var(--color-accent)' : op ? 'none' : 'var(--shadow-sm)'};color:inherit;font:inherit;cursor:pointer;display:flex;gap:12px;align-items:center`)}>
              <Avatar ini={it.ini} />
              <div style={sx('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                <div style={sx('display:flex;gap:8px;align-items:center')}><span style={sx(`font-size:15px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${op ? 'var(--color-text)' : 'var(--color-neutral-400)'}`)}>{it.name}</span><span className={`tag ${tg[1]}`}>{tg[0]}</span></div>
                <div style={sx('font-size:12px;color:var(--color-neutral-400)')}>{it.kind === 'sweep' ? `Kehrbezirk ${it.bez}` : it.addr} · {since(it.since)}</div>
                <div style={sx(`font-size:12px;color:${op ? f.fg : 'var(--color-neutral-500)'};display:flex;gap:5px;align-items:center`)}><Icon n={f.icon} /><span>{f.t}</span></div>
              </div>
            </button>
          ); })}
        </div>
        <div style={sx('margin:16px 22px 20px;display:flex;gap:8px;font-size:12px;color:var(--color-neutral-500)')}><Icon n="ph-trash-simple" style={sx('font-size:15px;margin-top:1px')} /><span style={sx('text-wrap:pretty')}>Urkunden und Ausweise werden nach deiner Entscheidung automatisch gelöscht, spätestens nach 14 Tagen.</span></div>
  </>;
  const inQueue = ['queue', 'detail', 'result'].includes(scr);
  const nav = { title: 'Betreiber', sub: me.email, tabs, bar: ['queue', 'log', 'dir', 'feedback', 'demo'].includes(scr),
    footer: <button className="btn btn-secondary" onClick={lock} style={sx('min-height:44px')}><Icon n="ph-lock-simple" />Sperren</button> };

  return (
    <Shell glow={GLOW.admin} scrollKey={scr + (ui.sel?.id || '')} bottom={bottom} overlay={overlay} nav={nav} feedback={{ role: 'admin', where: scr }} aside={wide && inQueue ? queueView : null} asideKey={ui.kind}>
      {scr === 'queue' && (wide ? <EmptyPane icon="ph-seal-check" text="Wählen Sie links einen Eintrag zum Prüfen." /> : queueView)}

      {scr === 'detail' && (!x ? <div style={sx('padding:40px;color:var(--color-neutral-500);font-size:13px')}>Lädt …</div> : <>
        <BackHeader onBack={toQueue} title={x.kind === 'sweep' ? 'Kaminfeger prüfen' : 'Bewohner prüfen'} sub={`eingereicht ${since(x.since)}`} right={<span className={`tag ${(TAG[x.status] || TAG.pending)[1]}`} style={sx('margin-right:10px')}>{(TAG[x.status] || TAG.pending)[0]}</span>} />
        <div style={sx('margin:12px 16px 0;padding:14px;border-radius:var(--radius-lg);background:var(--color-surface);display:flex;gap:12px;align-items:center')}>
          <Avatar ini={x.ini} size={44} fs={15} />
          <div style={sx('flex:1;min-width:0')}><div style={sx('font-size:17px;font-weight:500')}>{x.name}</div><div style={sx('font-size:13px;color:var(--color-neutral-400)')}>{x.kind === 'sweep' ? `Kehrbezirk ${x.bez}` : x.addr}</div></div>
        </div>
        <SectionLabel pad="20px 22px 6px">Automatisch geprüft</SectionLabel>
        <div style={sx('margin:0 16px;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);padding:4px 14px')}>
          {x.auto.map(autoRow).map((a, i) => <div key={i} style={sx('display:flex;gap:10px;align-items:flex-start;padding:9px 0;font-size:13px')}><Icon w="ph-bold" n={a.icon} style={sx(`color:${a.fg};margin-top:2px`)} /><span style={sx(`flex:1;text-wrap:pretty;color:${a.tfg}`)}>{a.text}</span></div>)}
        </div>
        {x.kind === 'sweep' && <>
          <SectionLabel pad="20px 22px 6px" right={<span style={sx('font-size:11px;color:var(--color-neutral-500)')}>{x.docs.length ? 'werden nach Entscheidung gelöscht' : 'bereits gelöscht'}</span>}>Dokumente</SectionLabel>
          {x.docs.length > 0 && <div style={sx('display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 16px')}>
            {x.docs.map(dc => (
              <button key={dc.id} onClick={() => set({ overlay: 'doc', docId: dc.id })} style={sx('padding:10px;border-radius:var(--radius-lg);background:var(--color-surface);border:0;color:inherit;font:inherit;cursor:pointer;display:flex;flex-direction:column;gap:8px;text-align:left')}>
                {dc.kind === 'urkunde' ? <div aria-hidden="true" style={sx('height:118px;border-radius:4px;background:var(--color-neutral-200);padding:10px 12px;display:flex;flex-direction:column;gap:5px;position:relative;overflow:hidden')}>
                  <div style={sx('height:5px;width:55%;background:var(--color-neutral-500);align-self:center')} />
                  <div style={sx('height:3px;width:80%;background:var(--color-neutral-400);margin-top:8px')} /><div style={sx('height:3px;width:90%;background:var(--color-neutral-400)')} /><div style={sx('height:3px;width:70%;background:var(--color-neutral-400)')} />
                  <div style={sx('position:absolute;right:12px;bottom:12px;width:26px;height:26px;border-radius:50%;box-shadow:inset 0 0 0 2px var(--color-accent-600)')} />
                </div> : <div aria-hidden="true" style={sx('height:118px;display:grid;place-items:center')}>
                  <div style={sx('width:100%;aspect-ratio:1.58;border-radius:6px;background:var(--color-neutral-300);padding:8px;display:flex;gap:8px')}>
                    <div style={sx('width:32%;border-radius:3px;background:var(--color-neutral-500)')} />
                    <div style={sx('flex:1;display:flex;flex-direction:column;gap:5px;padding-top:4px')}><div style={sx('height:4px;width:80%;background:var(--color-neutral-600)')} /><div style={sx('height:3px;width:60%;background:var(--color-neutral-500)')} /><div style={sx('height:3px;width:70%;background:var(--color-neutral-500)')} /></div>
                  </div>
                </div>}
                <div style={sx('font-size:13px;display:flex;gap:6px;align-items:center')}><Icon n={dc.kind === 'urkunde' ? 'ph-file-text' : 'ph-identification-card'} style={sx('color:var(--color-neutral-400)')} /><span>{dc.kind === 'urkunde' ? 'Bestellungsurkunde' : 'Ausweis'}</span></div>
              </button>
            ))}
          </div>}
          {!decided && x.manual && x.register && <>
            <SectionLabel pad="20px 22px 6px">Schornsteinfegerregister</SectionLabel>
            <div style={sx('margin:0 16px;padding:14px;border-radius:var(--radius-lg);box-shadow:0 0 0 1px var(--color-accent-800);display:flex;flex-direction:column;gap:10px')}>
              <div style={sx('font-size:13px;color:var(--color-neutral-300);text-wrap:pretty')}>Der Bezirk steht noch nicht im Verzeichnis. Suche den Betrieb in der Registerauskunft des BAFA und vergleiche:</div>
              <div style={sx('display:grid;grid-template-columns:auto minmax(0, 1fr);gap:4px 12px;font-size:13px')}>
                {[['Name', x.register.name], ['Betrieb', x.register.address], ['Kehrbezirk', `${x.register.kreis} ${x.register.bez}`], ['Bundesland', x.register.land]].map(([k, v]) => <Fragment key={k}>
                  <span style={sx('color:var(--color-neutral-500)')}>{k}</span><span style={sx('user-select:all;overflow-wrap:anywhere')}>{v}</span>
                </Fragment>)}
              </div>
              <a className="btn btn-secondary" href={x.register.url} target="_blank" rel="noopener noreferrer" style={sx('min-height:44px;text-decoration:none')}><Icon n="ph-magnifying-glass" />Im BAFA-Register prüfen<Icon n="ph-arrow-square-out" /></a>
              <div style={sx('font-size:12px;color:var(--color-neutral-500);text-wrap:pretty')}>Bei der Freigabe wird der Bezirk ins Verzeichnis übernommen. Der Freischaltlink geht an die E-Mail der Registrierung.</div>
            </div>
          </>}
          {!decided && <>
            <SectionLabel pad="20px 22px 6px" right={<span style={sx('font-size:12px;color:var(--color-neutral-500);font-variant-numeric:tabular-nums')}>{mine.length} von {needed.length}</span>}>Deine Prüfung</SectionLabel>
            <div style={sx('margin:0 16px;border-radius:var(--radius-lg);background:var(--color-surface);padding:2px 14px')}>
              {needed.map(ch => <CheckRow key={ch[0]} on={mine.includes(ch[0])} label={ch[1]} onClick={() => setUi(u => { const m = u.checks[x.id] || []; return { ...u, checks: { ...u.checks, [x.id]: m.includes(ch[0]) ? m.filter(k => k !== ch[0]) : m.concat([ch[0]]) } }; })} />)}
            </div>
            <div style={sx('display:flex;flex-direction:column;gap:8px;padding:16px 16px 20px')}>
              {act.error && <ErrorLine text={act.error} />}
              <button className="btn btn-primary" disabled={!needed.every(ch => mine.includes(ch[0])) || act.busy} onClick={() => decide(`/api/admin/sweeps/${x.id}/approve`, { checks: mine }, r => set({ screen: 'result', result: { type: 'approved', sentTo: r.sentTo, fromList: r.fromList } }))} style={sx('min-height:50px;font-size:15px')}><Icon n="ph-seal-check" />{x.manual ? 'Freigeben, Bezirk übernehmen & Link senden' : 'Freigeben & Link per E-Mail'}</button>
              <div style={sx('display:grid;grid-template-columns:1fr 1fr;gap:8px')}>
                <button className="btn btn-secondary" onClick={() => set({ overlay: 'query', queryText: `Guten Tag, bitte bestätigen Sie uns: Ist ${x.name} bevollmächtigte/r Bezirksschornsteinfeger/in für den Kehrbezirk ${x.bez}? Vielen Dank.` })} style={sx('min-height:44px')}><Icon n="ph-phone-call" />Rückfrage</button>
                <button className="btn btn-secondary" onClick={() => set({ overlay: 'reject', reason: null })} style={sx('min-height:44px;color:var(--color-neutral-400)')}>Ablehnen</button>
              </div>
            </div>
          </>}
        </>}
        {x.kind === 'res' && <>
          <div style={sx('margin:14px 16px 0;padding:12px 14px;border-radius:var(--radius-md);background:var(--color-surface);display:flex;gap:10px;font-size:13px;color:var(--color-neutral-300)')}><Icon n="ph-info" style={sx('font-size:18px;color:var(--color-accent)')} /><span style={sx('text-wrap:pretty')}>{x.hint}</span></div>
          {!decided && <div style={sx('display:flex;flex-direction:column;gap:8px;padding:16px 16px 20px')}>
            {act.error && <ErrorLine text={act.error} />}
            {resActions.map(ra => <button key={ra.action} className={`btn ${ra.cls}`} disabled={act.busy} onClick={() => decide(`/api/admin/residents/${x.id}`, { action: ra.action }, r => set({ screen: 'queue', sel: null, toast: r.toast }))} style={sx(`min-height:46px${ra.ghost ? ';color:var(--color-neutral-400)' : ''}`)}><Icon n={ra.icon} />{ra.label}</button>)}
          </div>}
        </>}
        {decided && <div style={sx('margin:16px 16px 20px;padding:12px 14px;border-radius:var(--radius-md);box-shadow:var(--shadow-sm);font-size:13px;color:var(--color-neutral-400);display:flex;gap:10px')}><Icon n="ph-check-circle" style={sx('font-size:18px;color:var(--color-accent)')} /><span>Bereits entschieden: {(TAG[x.status] || TAG.pending)[0]}</span></div>}
      </>)}

      {scr === 'result' && x && <>
        <div style={sx('padding:52px 24px 0;display:flex;flex-direction:column;align-items:flex-start;gap:6px')}>
          <div style={sx(`width:64px;height:64px;border-radius:50%;display:grid;place-items:center;border:1px solid ${muted ? 'var(--color-neutral-400)' : 'var(--color-accent)'};color:${muted ? 'var(--color-neutral-400)' : 'var(--color-accent)'};box-shadow:${muted ? 'none' : '0 0 40px color-mix(in srgb, var(--color-accent) 30%, transparent)'};margin-bottom:18px`)}><Icon w="ph-bold" n={resIcon} style={sx('font-size:28px')} /></div>
          <div style={sx('font-size:28px;font-weight:500;letter-spacing:-0.02em;line-height:1.15')}>{resTitle}</div>
          <div style={sx('font-size:15px;color:var(--color-neutral-400);text-wrap:pretty')}>{resSub}</div>
        </div>
        <div style={sx('margin:24px 16px 20px;border-radius:var(--radius-lg);background:var(--color-surface);padding:4px 16px')}>
          {resSteps.map(r => (
            <div key={r.t} style={sx(`display:flex;gap:12px;align-items:flex-start;padding:12px 0;background:${DIV_BOTTOM}`)}>
              <Icon w="ph-bold" n={r.icon} style={sx('color:var(--color-accent);margin-top:3px')} />
              <div style={sx('flex:1')}><div style={sx('font-size:14px')}>{r.t}</div><div style={sx('font-size:12px;color:var(--color-neutral-500);text-wrap:pretty')}>{r.s}</div></div>
            </div>
          ))}
        </div>
      </>}

      {scr === 'log' && <>
        <div style={sx('padding:10px 22px 4px')}><div style={sx('font-size:23px;font-weight:500;letter-spacing:-0.015em')}>Protokoll</div><div style={sx('font-size:12px;color:var(--color-neutral-500)')}>Wer hat wann was entschieden – ohne Dokumente</div></div>
        <div style={sx('display:flex;flex-direction:column;padding:12px 16px 20px')}>
          {log.data && !log.data.log.length && <div style={sx('font-size:14px;color:var(--color-neutral-500);padding:10px 4px')}>Noch keine Einträge.</div>}
          {(log.data?.log || []).map(l => (
            <div key={l.id} style={sx(`display:flex;flex-direction:column;gap:2px;padding:12px 4px;background:${DIV_BOTTOM}`)}>
              <div style={sx('font-size:14px')}>{l.what}</div>
              <div style={sx('font-size:12px;color:var(--color-neutral-500)')}>{fmtAt(l.at)} · {l.by === me.email ? 'Du' : l.by}</div>
              {l.note && <div style={sx('font-size:12px;color:var(--color-accent-300);display:flex;gap:5px;align-items:center')}><Icon n="ph-trash-simple" /><span>{l.note}</span></div>}
            </div>
          ))}
        </div>
      </>}

      {scr === 'demo' && <>
        <div style={sx('padding:10px 22px 4px')}><div style={sx('font-size:23px;font-weight:500;letter-spacing:-0.015em')}>Vorschau</div><div style={sx('font-size:12px;color:var(--color-neutral-500);text-wrap:pretty')}>Die Apps mit Beispieldaten ansehen und ausprobieren – zum Zeigen oder Testen.</div></div>
        <div style={sx('display:flex;flex-direction:column;gap:10px;padding:12px 16px 0')}>
          {[['sweep', 'ph-hard-hat', 'Kaminfeger-App ansehen', 'Als „Max Muster“, Kehrbezirk Musterstadt 1 · 3 Straßen, laufende Runde mit Terminen heute'],
            ['customer', 'ph-house-line', 'Bewohner-App ansehen', 'Als Familie Engel, Lindenweg 5 · Termin heute, Live-Anzeige sobald die Route läuft']].map(([as, icon, t, sub]) => (
            <button key={as} disabled={act.busy} onClick={() => openDemo(as)} style={sx('text-align:left;padding:16px;border-radius:var(--radius-lg);background:var(--color-surface);border:0;color:inherit;font:inherit;cursor:pointer;display:flex;gap:14px;align-items:center')}>
              <span style={sx('width:44px;height:44px;border-radius:14px;display:grid;place-items:center;flex:none;' + bubble(as === 'sweep' ? '#ff7a2f' : '#ffbd3f'))}><Icon w="ph-fill" n={icon} style={sx('font-size:22px')} /></span>
              <span style={sx('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px')}><span style={sx('font-size:16px;font-weight:500')}>{t}</span><span style={sx('font-size:12px;color:var(--color-neutral-400);text-wrap:pretty')}>{sub}</span></span>
              <Icon n="ph-arrow-square-out" style={sx('color:var(--color-neutral-400)')} />
            </button>
          ))}
          {act.error && <ErrorLine text={act.error} />}
          <button className="btn btn-ghost" disabled={act.busy} onClick={() => openDemo('sweep', true)} style={sx('min-height:44px;align-self:flex-start;color:var(--color-neutral-300)')}><Icon n="ph-arrow-counter-clockwise" />Beispieldaten zurücksetzen und Kaminfeger-App öffnen</button>
        </div>
        <div style={sx('margin:12px 22px 20px;display:flex;gap:8px;font-size:12px;color:var(--color-neutral-500)')}><Icon n="ph-shield-check" style={sx('font-size:15px;margin-top:1px;flex:none')} /><span style={sx('text-wrap:pretty')}>Der Demo-Bezirk ist für echte Nutzer unsichtbar, und es gehen keine E-Mails raus. Die Vorschau öffnet sich in einem neuen Tab. Ein eigenes Kaminfeger- oder Bewohner-Konto in diesem Browser wird dabei abgemeldet. Die Beispieldaten erneuern sich jeden Tag.</span></div>
      </>}

      {scr === 'feedback' && <>
        <div style={sx('padding:10px 22px 4px')}><div style={sx('font-size:23px;font-weight:500;letter-spacing:-0.015em')}>Feedback</div><div style={sx('font-size:12px;color:var(--color-neutral-500)')}>Rückmeldungen aus den Apps · erledigte werden nach 90 Tagen gelöscht</div></div>
        {act.error && <div style={sx('padding:8px 22px 0')}><ErrorLine text={act.error} /></div>}
        <div style={sx('display:flex;flex-direction:column;gap:10px;padding:12px 16px 20px')}>
          {fb.data && !fb.data.items.length && <div style={sx('font-size:14px;color:var(--color-neutral-500);padding:10px 6px')}>Noch kein Feedback.</div>}
          {(fb.data?.items || []).map(f => (
            <div key={f.id} style={sx(`padding:14px;border-radius:var(--radius-lg);display:flex;flex-direction:column;gap:10px;background:${f.status === 'open' ? 'var(--color-surface)' : 'transparent'};box-shadow:${f.status === 'open' ? 'none' : 'var(--shadow-sm)'}`)}>
              <div style={sx('display:flex;gap:8px;align-items:center;flex-wrap:wrap')}>
                <span className={`tag ${f.status === 'open' ? 'tag-accent' : 'tag-neutral'}`}>{f.status === 'open' ? 'offen' : 'erledigt'}</span>
                <span className="tag tag-neutral">{FB_ROLE[f.role] || f.role}</span>
                <span style={sx('font-size:12px;color:var(--color-neutral-400);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{f.email} · {fmtAt(f.at)}</span>
              </div>
              <div style={sx(`font-size:14px;white-space:pre-wrap;text-wrap:pretty;color:${f.status === 'open' ? 'var(--color-text)' : 'var(--color-neutral-400)'}`)}>{f.note}</div>
              {f.hasImage && <button onClick={() => set({ overlay: 'fbimg', fbId: f.id })} aria-label="Bild vergrößern" style={sx('align-self:flex-start;padding:0;border:0;background:none;cursor:zoom-in;line-height:0')}><FbImage f={f} /></button>}
              <div style={sx('font-size:11px;color:var(--color-neutral-500)')}>{f.page}{f.device ? ' · ' + f.device : ''}</div>
              <div style={sx('display:flex;gap:8px')}>
                {f.status === 'open'
                  ? <button className="btn btn-secondary" disabled={act.busy} onClick={() => fbAct(f.id, 'done')} style={sx('min-height:40px')}><Icon n="ph-check" />Erledigt</button>
                  : <button className="btn btn-ghost" disabled={act.busy} onClick={() => fbAct(f.id, 'reopen')} style={sx('min-height:40px;color:var(--color-neutral-400)')}><Icon n="ph-arrow-counter-clockwise" />Wieder öffnen</button>}
                <button className="btn btn-ghost" disabled={act.busy} onClick={() => fbAct(f.id, 'delete')} style={sx('min-height:40px;color:var(--color-neutral-500)')}><Icon n="ph-trash" />Löschen</button>
              </div>
            </div>
          ))}
        </div>
      </>}

      {scr === 'dir' && <>
        <div style={sx('padding:10px 22px 4px')}><div style={sx('font-size:23px;font-weight:500;letter-spacing:-0.015em')}>Bezirksverzeichnis</div><div style={sx('font-size:12px;color:var(--color-neutral-500)')}>{dir.data ? `${dir.data.count} Kehrbezirke` : 'Lädt …'} · Grundlage für die Prüfung der Kaminfeger</div></div>
        <div style={sx('margin:12px 16px 0;padding:14px;border-radius:var(--radius-lg);background:var(--color-surface);display:flex;flex-direction:column;gap:10px')}>
          <div style={sx('font-size:13px;color:var(--color-neutral-300);text-wrap:pretty')}>CSV mit den Spalten <b style={sx('font-weight:500')}>bundesland, kreis, bezirk, name, email</b>, optional betriebsadresse und bestellt_bis (JJJJ-MM-TT). An die E-Mail aus dem Verzeichnis geht der Freischaltlink – nicht an die Adresse, die der Kaminfeger selbst angibt.</div>
          <a href="/vorlagen/bezirksverzeichnis.csv" download style={sx('font-size:13px;display:flex;gap:6px;align-items:center')}><Icon n="ph-download-simple" />Vorlage herunterladen</a>
          {ui.dir && <div style={sx('font-size:13px;display:flex;flex-direction:column;gap:4px')}><span><Icon n="ph-check-circle" style={sx('color:var(--color-accent)')} /> {ui.dir.added} neu · {ui.dir.updated} aktualisiert</span>{ui.dir.errorCount > 0 && <span style={sx('color:var(--color-accent-300)')}>{ui.dir.errorCount} Zeilen übersprungen: {ui.dir.errors.slice(0, 3).join(' · ')}</span>}</div>}
          {act.error && <ErrorLine text={act.error} />}
          <FilePick className="btn btn-primary" accept=".csv,text/csv" disabled={act.busy} onFile={f => act.run(async () => { const r = await upload('/api/admin/directory', f); set({ dir: r }); dir.reload(); })} style={sx('min-height:46px')}><Icon n="ph-upload-simple" />{act.busy ? 'Wird importiert …' : 'CSV importieren'}</FilePick>
        </div>
        <div style={sx('display:flex;flex-direction:column;padding:12px 16px 20px')}>
          {(dir.data?.rows || []).map(r => (
            <div key={r.id} style={sx(`display:flex;flex-direction:column;gap:2px;padding:10px 4px;background:${DIV_BOTTOM}`)}>
              <div style={sx('display:flex;gap:8px')}><span style={sx('font-size:14px;flex:1')}>{r.kreis} {r.number}</span><span style={sx('font-size:12px;color:var(--color-neutral-500)')}>{r.land}</span></div>
              <div style={sx('font-size:12px;color:var(--color-neutral-400)')}>{r.holder_name} · {r.official_email}{r.appointed_until ? ' · bis ' + r.appointed_until.split('-').reverse().join('.') : ''}</div>
            </div>
          ))}
        </div>
      </>}
    </Shell>
  );
}

const FB_ROLE = { customer: 'Bewohner', sweep: 'Kaminfeger', admin: 'Betreiber', public: 'Ohne Anmeldung' };

/** Feedback-Bild mit markiertem Bereich */
function FbImage({ f, big }) {
  const m = f.mark;
  return (
    <div style={sx('position:relative;display:inline-block;border-radius:var(--radius-md);overflow:hidden;box-shadow:0 0 0 1px var(--color-neutral-700);line-height:0')}>
      <img src={`/api/admin/feedback/${f.id}/image`} alt="Bild der Ansicht" loading="lazy" style={sx(big ? 'display:block;max-width:100%;max-height:calc(100dvh - 48px)' : 'display:block;max-width:100%;max-height:260px')} />
      {m && <div style={{ position: 'absolute', left: m.x * 100 + '%', top: m.y * 100 + '%', width: m.w * 100 + '%', height: m.h * 100 + '%', border: '2px solid var(--color-accent)', borderRadius: 4, boxShadow: '0 0 0 9999px color-mix(in srgb, #000 30%, transparent)' }} />}
    </div>
  );
}

/** Pflicht-Einrichtung für den Betreiber nach dem ersten Entsperren per E-Mail-Code */
function PasskeySetup({ me, onDone, onLock }) {
  const lock = async () => { await api('/api/admin/logout', { body: {} }).catch(() => {}); onLock(); };
  return (
    <Shell glow={GLOW.admin} top={<HomeBack onBack={lock} />}>
      <div style={sx('padding:40px 22px 24px;display:flex;flex-direction:column;gap:14px;max-width:520px')}>
        <div style={sx('width:64px;height:64px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,0.1);box-shadow:inset 0 1px 0 rgba(255,255,255,0.3)')}><Icon n="ph-fingerprint" style={sx('font-size:34px;color:var(--color-accent-300)')} /></div>
        <div style={sx('font-size:28px;font-weight:700;letter-spacing:-0.02em;line-height:1.15')}>Passkey einrichten</div>
        <div style={sx('font-size:15px;color:var(--color-neutral-300);text-wrap:pretty')}>Der Betreiber-Zugang ist nur mit Passkey möglich: Sie entsperren künftig per Fingerabdruck, Gesicht oder Geräte-PIN. Ein E-Mail-Code reicht dann nicht mehr – so kommt niemand hinein, der nur Ihr Postfach kennt.</div>
        <div style={sx('font-size:13px;color:var(--color-neutral-400);text-wrap:pretty')}>Tipp: Richten Sie zusätzlich einen Passkey auf einem zweiten Gerät ein (z. B. Handy und PC), damit Sie bei Verlust nicht ausgesperrt sind.</div>
        <PasskeyPanel role="admin" onChange={onDone} />
        <div style={sx('font-size:12px;color:var(--color-neutral-500)')}>Angemeldet als {me.email}</div>
      </div>
    </Shell>
  );
}
