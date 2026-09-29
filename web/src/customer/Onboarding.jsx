// Registrierung & Anmeldung der Bewohner – nach „KundenAnmeldung“ (Claude Design).
import { useEffect, useRef, useState } from 'react';
import { sx, api, useAction, useData, EMAIL_RE } from '../lib/core.js';
import { LogoMark } from '../brand.jsx';
import { Shell, GLOW, Icon, StepsBar, Title, Cta, CodeInput, Field, Input, MailPreview, ErrorLine, Avatar, DIV_BOTTOM } from '../ui.jsx';

const card = 'margin:18px 16px 20px;padding:12px 14px;border-radius:var(--radius-lg)';

export default function Onboarding({ start = 'welcome', invite, readdress, onDone, onCancel }) {
  const [st, setSt] = useState({ screen: start, street: '', nr: '', plz: '', ort: '', name: '', person: '', email: '', codeSent: false, code: '',
    method: 'number', kdnr: '', lEmail: '', lCode: '', lSent: false, results: [], searching: false, picked: null, match: null,
    qr: false, inv: null, token: invite || '', paste: '', reg: null });
  const set = p => setSt(s => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }));
  const act = useAction();
  const scr = st.screen;

  // Einladungslink aus der URL
  useEffect(() => {
    if (!invite) return;
    api(`/api/customer/invite/${encodeURIComponent(invite)}`)
      .then(inv => set({ screen: 'scanned', qr: true, inv, token: invite, email: inv.email || '' }))
      .catch(e => { set({ screen: 'scan', qr: true }); act.setError(e.message); });
  }, [invite]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nach dem Login / Neuladen direkt in die Wohnsitz-Prüfung: Daten vom Server holen
  const fromState = x => ({ name: x.resident.family, street: x.resident.street, nr: x.resident.nr, plz: x.resident.plz, ort: x.resident.ort, email: x.me.email,
    match: x.district ? { no: x.district.no, sweep: x.district.sweep?.name } : null });
  useEffect(() => {
    if (start === 'verify') api('/api/customer/state').then(x => set(fromState(x))).catch(() => {});
  }, [start]); // eslint-disable-line react-hooks/exhaustive-deps

  // Straßensuche (OpenStreetMap / Photon)
  const t = useRef(null), qid = useRef(0);
  const search = (v, plz, ort) => {
    clearTimeout(t.current);
    const q = v.trim();
    if (q.length < 3) { set({ results: [], searching: false }); return; }
    t.current = setTimeout(() => {
      const id = ++qid.current;
      set({ searching: true });
      const loc = [q, plz, ort].filter(Boolean).join(' ');
      fetch('https://photon.komoot.io/api/?lang=de&limit=8&osm_tag=highway&bbox=5.8,47.2,15.1,55.1&q=' + encodeURIComponent(loc))
        .then(r => r.json()).then(j => {
          if (id !== qid.current) return;
          const seen = {}, out = [];
          (j.features || []).forEach(ft => {
            const p = ft.properties || {};
            if (p.countrycode && p.countrycode !== 'DE') return;
            const k = p.name + '|' + p.postcode;
            if (!p.name || seen[k]) return;
            seen[k] = 1; out.push({ name: p.name, plz: p.postcode || '', city: p.city || p.town || p.village || p.county || '' });
          });
          set({ results: out.slice(0, 5), searching: false });
        }).catch(() => { if (id === qid.current) set({ results: [], searching: false }); });
    }, 350);
  };

  // Bezirk zur Adresse suchen
  const plzValid = /^\d{5}$/.test(st.plz.trim());
  const addrOk = st.street.trim().length >= 3 && plzValid && st.ort.trim().length >= 2;
  useEffect(() => {
    if (scr !== 'address') return;
    if (!addrOk) { set({ match: null }); return; }
    const h = setTimeout(() => {
      api('/api/customer/lookup', { body: { street: st.street, nr: st.nr, plz: st.plz, ort: st.ort } })
        .then(r => set({ match: r.district ? { ...r.district, householdFound: r.householdFound } : { unknown: true } }))
        .catch(() => set({ match: { unknown: true } }));
    }, 300);
    return () => clearTimeout(h);
  }, [scr, addrOk, st.street, st.nr, st.plz, st.ort]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warten auf Bestätigung durch den Kaminfeger → sobald bestätigt, weiter
  const waiting = useData('/api/customer/state', { enabled: scr === 'letter' });
  useEffect(() => { if (scr === 'letter' && waiting.data?.resident.status === 'verified') set({ screen: 'done', reg: { status: 'verified', method: 'sweep' } }); }, [waiting.data, scr]);

  const go = screen => { act.setError(null); set({ screen }); };
  const emailOk = EMAIL_RE.test(st.email.trim());
  const qr = st.qr, inv = st.inv;
  const stepsMap = readdress ? { address: 1, verify: 2, letter: 2 } : qr ? { scan: 1, scanned: 1, email: 2 } : { address: 1, email: 2, verify: 3, letter: 3 };
  const stepTotal = readdress || qr ? 2 : 3;
  const stepNo = stepsMap[scr] || 0;
  const back = { scan: 'welcome', scanned: 'scan', address: readdress ? null : 'welcome', email: qr ? 'scanned' : 'address', verify: readdress ? 'address' : 'email', letter: 'verify' }[scr];
  const addrShort = qr && inv ? `${inv.street} ${inv.nr}` : `${st.street.trim()} ${st.nr.trim()}`;
  const family = qr && inv ? inv.family : st.name.trim();
  const sweepName = st.match?.sweep || 'Ihr Kaminfeger';

  const sendCode = (email, purpose, after) => act.run(async () => {
    await api('/api/auth/code', { body: { email: email.trim(), role: 'customer', purpose } });
    set(after);
  });
  const register = () => act.run(async () => {
    const body = qr ? { email: st.email.trim(), code: st.code, invite: st.token, person: st.person.trim() }
      : { email: st.email.trim(), code: st.code, street: st.street.trim(), nr: st.nr.trim(), plz: st.plz.trim(), ort: st.ort.trim(), name: st.name.trim() };
    const r = await api('/api/customer/register', { body });
    set({ reg: { ...r, method: qr ? 'invite' : null }, screen: r.next === 'verify' ? 'verify' : 'done' });
  });
  const saveAddress = () => act.run(async () => {
    const r = await api('/api/customer/readdress', { body: { street: st.street.trim(), nr: st.nr.trim(), plz: st.plz.trim(), ort: st.ort.trim(), name: st.name.trim() } });
    set({ reg: r, screen: r.next === 'verify' ? 'verify' : 'done' });
  });
  const verifyNumber = () => act.run(async () => {
    await api('/api/customer/verify-number', { body: { kdnr: st.kdnr.trim() } });
    set({ screen: 'done', reg: { status: 'verified', method: 'number' } });
  });
  const requestSweep = () => act.run(async () => { await api('/api/customer/request-sweep', { body: {} }); set({ screen: 'letter' }); });
  const openPasted = () => act.run(async () => {
    const raw = st.paste.trim(), m = raw.match(/einladung=([\w-]+)/);
    const token = m ? m[1] : raw.split('/').pop();
    const i = await api(`/api/customer/invite/${encodeURIComponent(token)}`);
    set({ screen: 'scanned', inv: i, token, email: i.email || st.email });
  });
  const login = () => act.run(async () => {
    await api('/api/auth/login', { body: { email: st.lEmail.trim(), role: 'customer', code: st.lCode } });
    const s = await api('/api/customer/state');
    if (s.resident.status === 'needs_verify') set({ ...fromState(s), screen: 'verify' });
    else onDone();
  });

  let cta = null, alt = null;
  if (scr === 'welcome') { cta = { label: 'Registrieren', onClick: () => set({ screen: 'address', qr: false }) }; alt = { label: 'Ich habe schon ein Konto', onClick: () => set({ screen: 'login', lSent: false, lCode: '' }) }; }
  if (scr === 'scan') cta = { label: 'Einladung öffnen', disabled: !st.paste.trim(), onClick: openPasted };
  if (scr === 'scanned') cta = { label: inv?.kind === 'member' ? 'Einladung annehmen – weiter' : 'Das sind wir – weiter', disabled: inv?.kind === 'member' && !st.person.trim(), onClick: () => go('email') };
  if (scr === 'address') cta = { label: 'Weiter', disabled: !(st.match && st.nr.trim() && st.ort.trim() && st.name.trim()), onClick: readdress ? saveAddress : () => go('email') };
  if (scr === 'email') cta = st.codeSent
    ? { label: 'Bestätigen', disabled: st.code.length < 6, onClick: register }
    : { label: 'Code senden', disabled: !emailOk, onClick: () => sendCode(st.email, 'register', { codeSent: true, code: '' }) };
  if (scr === 'verify') cta = st.method === 'number'
    ? { label: 'Adresse prüfen', disabled: st.kdnr.trim().length < 6, onClick: verifyNumber }
    : { label: 'Bestätigung anfragen', onClick: requestSweep };
  if (scr === 'letter') cta = { label: 'Zur App – Zeiten schon ansehen', onClick: onDone };
  if (scr === 'done') cta = { label: 'Zur App', onClick: onDone };
  if (scr === 'login') cta = st.lSent
    ? { label: 'Anmelden', disabled: st.lCode.length < 6, onClick: login }
    : { label: 'Code senden', disabled: !EMAIL_RE.test(st.lEmail.trim()), onClick: () => sendCode(st.lEmail, 'login', { lSent: true, lCode: '' }) };

  const sugg = st.picked === st.street ? [] : st.results;
  const methods = [
    { id: 'number', title: 'Kundennummer eingeben', sub: 'Vom Feuerstättenbescheid', tag: 'sofort', tagCls: 'tag-accent' },
    { id: 'letter', title: 'Vom Kaminfeger bestätigen lassen', sub: 'Bestätigung kommt per E-Mail – z. B. für Mieter', tag: '1–2 Tage', tagCls: 'tag-neutral' }
  ];
  const reg = st.reg || {};
  const verified = reg.status === 'verified';
  const inDistrict = reg.inDistrict !== false;
  const checks = [
    { t: 'E-Mail bestätigt', s: st.email || st.lEmail, icon: 'ph-check' },
    { t: inDistrict ? 'Adresse im Kehrbuch gefunden' : 'Adresse geprüft', s: addrShort + (qr && inv ? ' · Kehrbezirk ' + inv.bez : st.match?.no ? ' · Kehrbezirk ' + st.match.no : ', ' + st.plz + ' ' + st.ort), icon: 'ph-check' },
    verified
      ? { t: 'Wohnsitz bestätigt', s: reg.method === 'invite' || qr ? 'per Einladungslink vom Kaminfeger' : reg.method === 'sweep' ? 'bestätigt vom Kaminfeger, per E-Mail' : 'per Kundennummer vom Feuerstättenbescheid', icon: 'ph-check' }
      : { t: 'Wohnsitz wird später bestätigt', s: 'Sobald Ihr Kaminfeger die App nutzt – wir melden uns per E-Mail', icon: 'ph-hourglass-medium' }
  ];

  const top = (stepNo > 0 || scr === 'scan') && <StepsBar onBack={() => back ? go(back) : onCancel && onCancel()} stepNo={stepNo} total={stepTotal} />;
  const bottom = cta && <Cta {...cta} busy={act.busy} alt={alt} error={['email', 'verify', 'login', 'scan', 'address', 'scanned'].includes(scr) ? act.error : null} />;

  return (
    <Shell glow={GLOW.customer} top={top} bottom={bottom} scrollKey={scr}>
      {scr === 'welcome' && <>
        <div style={sx('padding:64px 26px 0;display:flex;flex-direction:column;gap:14px')}>
          <LogoMark size={60} title="Kaminfeger Verwaltung" />
          <span className="card-kicker" style={sx('margin-top:6px')}>Kaminfeger Verwaltung</span>
          <div style={sx('font-size:34px;font-weight:500;letter-spacing:-0.025em;line-height:1.1;text-wrap:pretty')}>Der Kaminfeger kommt, wenn Sie zu Hause sind.</div>
          <div style={sx('font-size:15px;color:var(--color-neutral-400);text-wrap:pretty')}>Ihr Kaminfeger gibt Zeitfenster für Ihre Straße frei – Sie wählen die halbe Stunde, die passt.</div>
        </div>
        <div style={sx('position:relative;margin:40px 26px 0;height:44px;display:flex;align-items:center;justify-content:space-between')}>
          <div style={sx('position:absolute;left:0;right:0;top:50%;height:1px;background:linear-gradient(to right, transparent, var(--color-neutral-700) 48px, var(--color-neutral-700) calc(100% - 48px), transparent)')} />
          <span style={sx('position:relative;width:8px;height:8px;border-radius:50%;background:var(--color-neutral-600)')} />
          <span style={sx('position:relative;width:8px;height:8px;border-radius:50%;background:var(--color-neutral-600)')} />
          <span style={sx('position:relative;width:14px;height:14px;border-radius:50%;background:var(--color-accent);box-shadow:0 0 0 4px var(--color-accent-900), 0 0 18px var(--color-accent)')} />
          <span style={sx('position:relative;width:8px;height:8px;border-radius:50%;background:var(--color-neutral-800)')} />
          <span style={sx('position:relative;width:12px;height:12px;border-radius:50%;background:var(--color-bg);box-shadow:0 0 0 2px var(--color-accent-300)')} />
          <span style={sx('position:relative;width:8px;height:8px;border-radius:50%;background:var(--color-neutral-800)')} />
        </div>
        <div style={sx('display:flex;flex-direction:column;gap:14px;padding:36px 26px 20px;font-size:14px')}>
          <div style={sx('display:flex;gap:12px;align-items:center')}><Icon n="ph-calendar-check" style={sx('font-size:20px;color:var(--color-accent)')} />Zeit selbst wählen</div>
          <div style={sx('display:flex;gap:12px;align-items:center')}><Icon n="ph-map-pin-line" style={sx('font-size:20px;color:var(--color-accent)')} />Live sehen, wie weit er noch weg ist</div>
          <div style={sx('display:flex;gap:12px;align-items:center')}><Icon n="ph-shield-check" style={sx('font-size:20px;color:var(--color-accent)')} />Nur verifizierte Bewohner buchen</div>
        </div>
        <button onClick={() => { act.setError(null); set({ screen: 'scan', qr: true }); }} style={sx('margin:4px 16px 16px;width:calc(100% - 32px);text-align:left;display:flex;gap:12px;align-items:center;padding:14px;border-radius:var(--radius-lg);background:var(--color-surface);border:1px solid var(--color-accent-800);color:inherit;font:inherit;cursor:pointer')}>
          <div style={sx('width:40px;height:40px;border-radius:var(--radius-md);background:var(--color-accent-900);display:grid;place-items:center;flex:none')}><Icon n="ph-envelope-open" style={sx('font-size:22px;color:var(--color-accent)')} /></div>
          <div style={sx('flex:1')}><div style={sx('font-size:14px')}>Einladung per E-Mail erhalten?</div><div style={sx('font-size:12px;color:var(--color-neutral-400);text-wrap:pretty')}>Link vom Kaminfeger öffnen – Adresse sofort bestätigt</div></div>
          <Icon n="ph-caret-right" style={sx('color:var(--color-neutral-500)')} />
        </button>
      </>}

      {scr === 'login' && <>
        <div style={sx('display:flex;align-items:center;padding:4px 12px 0')}><button className="btn btn-icon" onClick={() => go('welcome')} style={sx('width:44px;height:44px')} aria-label="Zurück"><Icon n="ph-caret-left" style={sx('font-size:22px')} /></button></div>
        <Title pad="10px 22px 0" title="Anmelden" sub="Mit der E-Mail-Adresse, mit der Sie sich registriert haben." />
        <div style={sx('display:flex;flex-direction:column;gap:14px;padding:20px 16px 0')}>
          <Field label="E-Mail-Adresse"><Input type="email" value={st.lEmail} onChange={e => set({ lEmail: e.target.value, lSent: false, lCode: '' })} placeholder="name@beispiel.de" autoComplete="email" /></Field>
        </div>
        {st.lSent && <div style={sx('padding:22px 16px 0')}>
          <CodeInput email={st.lEmail} value={st.lCode} onChange={v => set({ lCode: v })} label="Anmeldecode" onResend={() => sendCode(st.lEmail, 'login', { lCode: '' })} />
        </div>}
        <div style={sx('margin:22px 16px 20px;display:flex;gap:8px;font-size:12px;color:var(--color-neutral-500)')}><Icon n="ph-shield-check" style={sx('font-size:15px;margin-top:1px')} /><span style={sx('text-wrap:pretty')}>Kein Passwort nötig. Der Code gilt 10 Minuten und nur einmal.</span></div>
      </>}

      {scr === 'scan' && <>
        <Title title="Einladung öffnen" sub="Ihr Kaminfeger schickt die Einladung an die E-Mail-Adresse aus seinem Kehrbuch. Der Link darin bestätigt Ihre Adresse." />
        <div style={sx('margin:20px 16px 0;padding:14px;border-radius:var(--radius-lg);box-shadow:0 0 0 1px var(--color-accent-800);display:flex;flex-direction:column;gap:10px;font-size:14px')}>
          <span className="card-kicker">So geht's</span>
          <div style={sx('display:flex;gap:10px')}><b style={sx('font-weight:500;color:var(--color-accent)')}>1</b><span style={sx('text-wrap:pretty')}>Öffnen Sie die E-Mail Ihres Kaminfegers in Ihrem Postfach.</span></div>
          <div style={sx('display:flex;gap:10px')}><b style={sx('font-weight:500;color:var(--color-accent)')}>2</b><span style={sx('text-wrap:pretty')}>Tippen Sie dort auf <b style={sx('font-weight:500')}>„Einladung annehmen“</b> – die App öffnet sich mit Ihrer Adresse.</span></div>
          <div style={sx('display:flex;gap:10px')}><b style={sx('font-weight:500;color:var(--color-accent)')}>3</b><span style={sx('text-wrap:pretty')}>Klappt das nicht, kopieren Sie den Link aus der E-Mail und fügen ihn unten ein.</span></div>
        </div>
        <MailPreview meta="E-Mail · von Ihrem Kaminfeger" subject="Einladung: Termin für die Feuerstättenschau wählen" onClick={() => document.getElementById('invite-link')?.focus()}
          text="Guten Tag, ich komme zur Feuerstättenschau in Ihre Straße. Bitte wählen Sie Ihre Zeit in der App." action="Einladung annehmen" />
        <div style={sx('padding:16px 16px 0')}>
          <Field label="Link aus der E-Mail einfügen"><Input id="invite-link" value={st.paste} onChange={e => set({ paste: e.target.value })} placeholder="https://kaminfeger-verwaltung.com/kunde?einladung=…" autoComplete="off" /></Field>
        </div>
        <div style={sx('padding:14px 22px 20px;font-size:12px;color:var(--color-neutral-500);display:flex;gap:8px')}><Icon n="ph-info" style={sx('font-size:15px;margin-top:1px')} /><span style={sx('text-wrap:pretty')}>Keine Einladung bekommen? Dann gehen Sie zurück und registrieren sich normal – die Bestätigung läuft ebenfalls per E-Mail.</span></div>
      </>}

      {scr === 'scanned' && inv && <>
        <Title title="Einladung erkannt" sub={inv.kind === 'member' ? 'Sie wurden als Mitbewohner eingeladen.' : 'Sind das Sie?'} />
        <div style={sx('margin:20px 16px 0;padding:16px;border-radius:var(--radius-lg);background:var(--color-surface);box-shadow:0 0 0 1px var(--color-accent-700), 0 0 30px color-mix(in srgb, var(--color-accent) 14%, transparent);display:flex;flex-direction:column;gap:10px')}>
          <span className="card-kicker">Aus dem Kehrbuch</span>
          <div style={sx('font-size:22px;font-weight:500;letter-spacing:-0.015em')}>Familie {inv.family}</div>
          <div style={sx('display:flex;flex-direction:column;gap:8px;font-size:14px')}>
            <div style={sx('display:flex;gap:10px;align-items:center')}><Icon n="ph-map-pin" style={sx('font-size:18px;color:var(--color-neutral-500)')} /><span>{inv.street} {inv.nr}, {inv.plz} {inv.ort}</span></div>
            <div style={sx('display:flex;gap:10px;align-items:center')}><Icon n="ph-user" style={sx('font-size:18px;color:var(--color-neutral-500)')} /><span>Kehrbezirk {inv.bez} · {inv.sweep}</span></div>
            <div style={sx('display:flex;gap:10px;align-items:center')}><Icon n="ph-shield-check" style={sx('font-size:18px;color:var(--color-accent)')} /><span>Wohnsitz damit bestätigt</span></div>
          </div>
        </div>
        {inv.kind === 'member' && <div style={sx('padding:16px 16px 0')}><Field label="Ihr Name"><Input value={st.person} onChange={e => set({ person: e.target.value })} placeholder="Vor- und Nachname" autoComplete="name" /></Field></div>}
        <div style={sx('padding:14px 22px 20px;font-size:12px;color:var(--color-neutral-500);text-wrap:pretty')}>Der Link gilt nur einmal. Mitbewohner laden Sie später im Profil ein.</div>
      </>}

      {scr === 'address' && <>
        <Title title={readdress ? 'Ihre neue Adresse' : 'Wo wohnen Sie?'} sub="Wir ordnen Sie Ihrem Kehrbezirk zu." />
        <div style={sx('display:flex;flex-direction:column;gap:14px;padding:20px 16px 0')}>
          <Field label="Straße" style={sx('position:relative')}>
            <Input value={st.street} onChange={e => { const v = e.target.value; set({ street: v, picked: null }); search(v, st.plz, st.ort); }} placeholder="Straße eingeben" autoComplete="off" />
            {st.searching && <div style={sx('font-size:12px;color:var(--color-neutral-500);padding:6px 4px;display:flex;gap:6px;align-items:center')}><Icon n="ph-magnifying-glass" /><span>Suche Adressen …</span></div>}
            {sugg.length > 0 && <div style={sx('margin-top:4px;border-radius:var(--radius-md);background:var(--color-surface);box-shadow:var(--shadow-md);overflow:hidden')}>
              {sugg.map(r => (
                <button key={r.name + r.plz} onClick={() => set({ street: r.name, picked: r.name, plz: r.plz || st.plz, ort: r.city || st.ort, results: [] })} style={sx('width:100%;display:flex;gap:10px;align-items:center;min-height:46px;padding:0 12px;background:none;border:0;color:inherit;font:inherit;font-size:14px;cursor:pointer;text-align:left')}>
                  <Icon n="ph-map-pin" style={sx('color:var(--color-neutral-500)')} /><span style={sx('flex:1')}>{r.name}</span><span style={sx('font-size:12px;color:var(--color-neutral-500)')}>{[r.plz, r.city].filter(Boolean).join(' ')}</span>
                </button>
              ))}
            </div>}
          </Field>
          <Field label="Hausnummer" style={sx('max-width:50%')}><Input value={st.nr} onChange={e => set({ nr: e.target.value })} placeholder="7" /></Field>
          <div style={sx('display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1.6fr);gap:8px')}>
            <Field label="PLZ"><Input value={st.plz} onChange={e => set({ plz: e.target.value.replace(/\D/g, '').slice(0, 5) })} placeholder="79102" inputMode="numeric" maxLength={5} autoComplete="postal-code" style="font-variant-numeric:tabular-nums" /></Field>
            <Field label="Ort"><Input value={st.ort} onChange={e => set({ ort: e.target.value })} placeholder="Freiburg" autoComplete="address-level2" /></Field>
          </div>
          {st.plz && !plzValid && <div style={sx('padding:0 4px')}><ErrorLine text="Die PLZ hat 5 Ziffern." /></div>}
          <Field label="Familienname (wie auf dem Klingelschild)"><Input value={st.name} onChange={e => set({ name: e.target.value })} placeholder="z. B. Keller" /></Field>
        </div>
        {st.match && !st.match.unknown && <div style={sx(`${card};box-shadow:0 0 0 1px var(--color-accent-800);display:flex;gap:12px;align-items:center`)}>
          <Avatar ini={st.match.ini} />
          <div style={sx('flex:1')}><div style={sx('font-size:12px;color:var(--color-accent-300)')}>Kehrbezirk {st.match.no} gefunden</div><div style={sx('font-size:14px')}>Ihr Kaminfeger: {st.match.sweep}</div></div>
          <Icon w="ph-bold" n="ph-check" style={sx('color:var(--color-accent)')} />
        </div>}
        {st.match?.unknown && <div style={sx(`${card};box-shadow:var(--shadow-sm);display:flex;gap:12px;align-items:flex-start`)}>
          <Icon n="ph-map-pin-line" style={sx('font-size:20px;color:var(--color-accent);margin-top:1px')} />
          <div style={sx('flex:1;display:flex;flex-direction:column;gap:2px')}><div style={sx('font-size:14px')}>Adresse erfasst</div><div style={sx('font-size:12px;color:var(--color-neutral-400);text-wrap:pretty')}>Ihr Kaminfeger nutzt die App noch nicht. Sie können sich trotzdem registrieren – wir melden uns per E-Mail, sobald er Zeitfenster freigibt.</div></div>
        </div>}
        {!st.match && <div style={sx('height:20px')} />}
      </>}

      {scr === 'email' && <>
        <Title title="E-Mail bestätigen" sub="Dorthin schicken wir Terminbestätigungen und Erinnerungen." />
        <div style={sx('display:flex;flex-direction:column;gap:14px;padding:20px 16px 0')}>
          <Field label="E-Mail-Adresse"><Input type="email" value={st.email} onChange={e => set({ email: e.target.value, codeSent: false, code: '' })} placeholder="name@beispiel.de" autoComplete="email" /></Field>
        </div>
        {st.codeSent && <div style={sx('padding:22px 16px 20px')}>
          <CodeInput email={st.email} value={st.code} onChange={v => set({ code: v })} onResend={() => sendCode(st.email, 'register', { code: '' })} />
        </div>}
      </>}

      {scr === 'verify' && <>
        <Title title="Wohnen Sie wirklich hier?" sub={`Nur Bewohner dürfen Termine für ${addrShort} buchen. Wir gleichen mit dem Kehrbuch Ihres Kaminfegers ab.`} />
        <div style={sx('display:flex;flex-direction:column;gap:8px;padding:20px 16px 0')}>
          {methods.map(m => { const on = st.method === m.id; return (
            <button key={m.id} onClick={() => { act.setError(null); set({ method: m.id }); }} style={sx(`text-align:left;display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:var(--radius-lg);background:${on ? 'var(--color-accent-900)' : 'var(--color-surface)'};border:1px solid ${on ? 'var(--color-accent)' : 'transparent'};color:inherit;font:inherit;cursor:pointer`)}>
              <span style={sx(`width:18px;height:18px;border-radius:50%;flex:none;margin-top:2px;border:1.5px solid ${on ? 'var(--color-accent)' : 'var(--color-neutral-600)'};box-shadow:${on ? 'inset 0 0 0 4px var(--color-accent-900), inset 0 0 0 9px var(--color-accent)' : 'none'}`)} />
              <span style={sx('flex:1;display:flex;flex-direction:column;gap:2px')}><span style={sx('font-size:15px')}>{m.title}</span><span style={sx('font-size:12px;color:var(--color-neutral-400)')}>{m.sub}</span></span>
              <span className={`tag ${m.tagCls}`}>{m.tag}</span>
            </button>
          ); })}
        </div>
        {st.method === 'number' ? (
          <div style={sx('margin:14px 16px 20px;padding:14px;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);display:grid;grid-template-columns:minmax(0, 1fr) 76px;gap:14px;align-items:start')}>
            <Field label="Kundennummer">
              <Input value={st.kdnr} onChange={e => set({ kdnr: e.target.value })} placeholder="z. B. KF-14-0007" autoComplete="off" style="letter-spacing:0.04em;text-transform:uppercase" />
              <div style={sx('font-size:12px;color:var(--color-neutral-500);margin-top:6px;text-wrap:pretty')}>Steht oben rechts auf Ihrem letzten Feuerstättenbescheid.</div>
            </Field>
            <div aria-hidden="true" style={sx('height:100px;border-radius:4px;background:var(--color-neutral-200);padding:8px 7px;display:flex;flex-direction:column;gap:4px;margin-top:18px')}>
              <div style={sx('align-self:flex-end;width:30px;height:9px;border-radius:2px;box-shadow:0 0 0 2px var(--color-accent);background:var(--color-accent-300)')} />
              {['60%', '90%', '80%', '85%', '50%'].map((w, i) => <div key={i} style={sx(`height:3px;width:${w};background:var(--color-neutral-400)${i === 0 ? ';margin-top:6px' : ''}`)} />)}
            </div>
          </div>
        ) : (
          <div style={sx('margin:14px 16px 20px;padding:14px;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);display:flex;gap:12px;font-size:13px;color:var(--color-neutral-300)')}>
            <Icon n="ph-envelope-simple" style={sx('font-size:20px;color:var(--color-accent)')} />
            <span style={sx('text-wrap:pretty')}>Ihr Kaminfeger bekommt eine Anfrage und bestätigt, dass <strong style={sx('font-weight:500;color:var(--color-text)')}>Familie {family}</strong> in der {addrShort} wohnt. Danach erhalten Sie eine E-Mail. Bis dahin können Sie Zeiten ansehen, aber noch nicht buchen.</span>
          </div>
        )}
      </>}

      {scr === 'letter' && <>
        <Title title="Anfrage gesendet" sub={`Sobald ${sweepName} bestätigt, bekommen Sie eine E-Mail${st.email ? ' an ' + st.email : ''}. Meist innerhalb von 1–2 Tagen.`} />
        <div style={sx('margin:20px 16px 0;padding:14px;border-radius:var(--radius-lg);background:var(--color-surface);display:flex;flex-direction:column;gap:10px')}>
          <div style={sx('display:flex;gap:10px;align-items:center;font-size:14px')}><Icon w="ph-bold" n="ph-check" style={sx('color:var(--color-accent)')} />E-Mail bestätigt</div>
          <div style={sx('display:flex;gap:10px;align-items:center;font-size:14px')}><Icon w="ph-bold" n="ph-check" style={sx('color:var(--color-accent)')} />Adresse geprüft</div>
          <div style={sx('display:flex;gap:10px;align-items:center;font-size:14px;color:var(--color-neutral-400)')}><Icon n="ph-hourglass-medium" style={sx('color:var(--color-neutral-400)')} />Bestätigung durch den Kaminfeger</div>
        </div>
        <MailPreview meta={`E-Mail · an ${st.email || 'Sie'}`} subject="Ihre Adresse ist bestätigt" text={`${sweepName} hat bestätigt, dass Sie in der ${addrShort} wohnen. Tippen Sie auf den Link, um Ihr Konto freizuschalten.`} action="Konto freischalten" />
        <div style={sx('padding:10px 22px 20px;font-size:12px;color:var(--color-neutral-500)')}>So sieht die E-Mail aus, die Sie erhalten. Diese Seite geht automatisch weiter, sobald bestätigt ist.</div>
      </>}

      {scr === 'done' && <>
        <Hero icon="ph-shield-check" title={`Willkommen, Familie ${family}`} sub={verified ? 'Ihr Konto ist verifiziert.' : 'Ihr Konto ist angelegt.'} />
        <div style={sx('margin:24px 16px 20px;border-radius:var(--radius-lg);background:var(--color-surface);padding:4px 16px')}>
          {checks.map(c => (
            <div key={c.t} style={sx(`display:flex;gap:12px;align-items:center;min-height:52px;background:${DIV_BOTTOM}`)}>
              <Icon w="ph-bold" n={c.icon} style={sx('color:var(--color-accent)')} />
              <div style={sx('flex:1')}><div style={sx('font-size:14px')}>{c.t}</div><div style={sx('font-size:12px;color:var(--color-neutral-500)')}>{c.s}</div></div>
            </div>
          ))}
        </div>
      </>}
    </Shell>
  );
}

function Hero({ icon, title, sub }) {
  return (
    <div style={sx('padding:52px 24px 0;display:flex;flex-direction:column;align-items:flex-start;gap:6px')}>
      <div style={sx('width:64px;height:64px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--color-accent);color:var(--color-accent);box-shadow:0 0 40px color-mix(in srgb, var(--color-accent) 30%, transparent);margin-bottom:18px')}><Icon w="ph-bold" n={icon} style={sx('font-size:28px')} /></div>
      <div style={sx('font-size:28px;font-weight:500;letter-spacing:-0.02em')}>{title}</div>
      <div style={sx('font-size:15px;color:var(--color-neutral-400)')}>{sub}</div>
    </div>
  );
}
