// Registrierung der Kaminfeger-Betriebe – nach „KaminfegerAnmeldung“ (Claude Design).
// Mitmachen kann jeder Betrieb, der im Schornsteinfegerregister steht. Ein Kehrbezirk ist nicht nötig:
// Die App ist für die freien Arbeiten (Kehren, Überprüfen, Messen) da, nicht für die Feuerstättenschau.
import { useEffect, useState } from 'react';
import { sx, api, upload, useAction, useData, EMAIL_RE, fileSize } from '../lib/core.js';
import { LogoMark } from '../brand.jsx';
import { loginPasskey, markPasskeyOffer } from '../lib/passkey.js';
import { Shell, GLOW, Icon, StepsBar, HomeBack, PasskeyLogin, Title, Cta, CodeInput, codeSuccess, blade, Field, Input, ErrorLine, FilePick } from '../ui.jsx';

const T = (state, title, sub) => ({ title, sub, state });

export default function SweepOnboarding({ start = 'welcome', notice, onDone }) {
  const [st, setSt] = useState({ screen: start, first: '', last: '', company: '', bstreet: '', bplz: '', bort: '', phone: '', email: '', codeSent: false, code: '',
    assure: false, lEmail: '', lCode: '', lSent: false, uploading: null });
  const set = p => setSt(s => ({ ...s, ...p }));
  const act = useAction();
  const scr = st.screen;
  const loggedIn = !['welcome', 'login', 'account'].includes(scr);
  const me = useData('/api/sweep/me', { enabled: loggedIn });
  const m = me.data;

  // Freigeschaltet (der Betreiber hat geprüft) → automatisch weiter
  useEffect(() => { if (scr === 'pending' && m?.status === 'active') set({ screen: 'done' }); }, [m, scr]);

  const go = screen => { act.setError(null); set({ screen }); };
  const emailOk = EMAIL_RE.test(st.email.trim());
  const stepNo = { account: 1, proof: 2 }[scr] || 0;
  const back = { account: 'welcome', proof: 'exit' }[scr];
  // Konto existiert schon: abmelden und zur Startseite – später über „Ich habe schon ein Konto“ fortsetzen
  const goBack = async () => {
    if (back !== 'exit') return back && go(back);
    await api('/api/sweep/logout', { body: {} }).catch(() => {});
    set({ screen: 'welcome', codeSent: false, code: '' });
  };
  const sendCode = (email, purpose, after) => act.run(async () => { await api('/api/auth/code', { body: { email: email.trim(), role: 'sweep', purpose } }); set(after); });
  const register = () => act.run(async () => {
    markPasskeyOffer('sweep');
    await api('/api/sweep/register', { body: { first: st.first.trim(), last: st.last.trim(), company: st.company.trim(), bstreet: st.bstreet.trim(), bplz: st.bplz, bort: st.bort.trim(), phone: st.phone.trim(), email: st.email.trim(), code: st.code } });
    await codeSuccess();
    await me.reload(); set({ screen: 'proof' });
  });
  const afterLogin = async () => {
    const x = await api('/api/sweep/me');
    if (x.status === 'active') return onDone();
    set({ screen: x.status === 'draft' ? 'proof' : 'pending' });
  };
  const login = () => act.run(async () => { await api('/api/auth/login', { body: { email: st.lEmail.trim(), role: 'sweep', code: st.lCode } }); await codeSuccess(); markPasskeyOffer('sweep'); await afterLogin(); });
  const passkeyLogin = () => act.run(async () => { await loginPasskey('sweep'); await afterLogin(); });
  const uploadDoc = (kind, file) => act.run(async () => { set({ uploading: kind }); try { await upload(`/api/sweep/documents/${kind}`, file); await me.reload(); } finally { set({ uploading: null }); } });
  const removeDoc = kind => act.run(async () => { await api(`/api/sweep/documents/${kind}`, { method: 'DELETE' }); await me.reload(); });
  const submit = () => act.run(async () => { await api('/api/sweep/submit', { body: { assure: true } }); await me.reload(); set({ screen: 'pending' }); });

  const status = m?.status;
  const active = status === 'active', rejected = status === 'rejected', query = status === 'query';
  const firma = m?.company || (m ? `${m.first} ${m.last}` : '');
  let cta = null, alt = null;
  if (scr === 'welcome') { cta = { label: 'Registrieren', onClick: () => blade(() => go('account'), { dir: 'left', title: 'Schön, dass', em: 'Sie da sind.' }) }; alt = { label: 'Ich habe schon ein Konto', onClick: () => blade(() => { act.setError(null); set({ screen: 'login', lSent: false, lCode: '' }); }, { dir: 'left', title: 'Willkommen', em: 'zurück.' }) }; }
  if (scr === 'account') cta = st.codeSent
    ? { label: 'Bestätigen', disabled: st.code.length < 6, onClick: register }
    : { label: 'Code senden', disabled: !(emailOk && st.first.trim() && st.last.trim() && st.bstreet.trim() && /^\d{5}$/.test(st.bplz) && st.bort.trim()), onClick: () => sendCode(st.email, 'register', { codeSent: true, code: '' }) };
  if (scr === 'proof') cta = { label: 'Zur Prüfung senden', disabled: !(m?.docs.ausweis && st.assure), onClick: submit };
  if (scr === 'pending') {
    if (rejected) cta = { label: 'Neuen Nachweis hochladen', onClick: () => set({ screen: 'proof', assure: false }) };
    else cta = { label: 'Warte auf Prüfung durch den Betreiber', disabled: true };
  }
  if (scr === 'done') cta = { label: 'Zur App', onClick: onDone };
  if (scr === 'login') alt = { label: 'Neu hier? Registrieren', onClick: () => blade(() => { act.setError(null); go('account'); }, { dir: 'right', title: 'Schön, dass', em: 'Sie da sind.' }) };
  if (scr === 'login') cta = st.lSent
    ? { label: 'Anmelden', disabled: st.lCode.length < 6, onClick: login }
    : { label: 'Code senden', disabled: !EMAIL_RE.test(st.lEmail.trim()), onClick: () => sendCode(st.lEmail, 'login', { lSent: true, lCode: '' }) };

  const docs = [
    { k: 'ausweis', title: 'Handwerkskarte oder Schornsteinfeger-Ausweis', empty: 'PDF oder Foto hochladen', icon: 'ph-identification-card' }
  ];
  const timeline = [
    T('done', 'E-Mail bestätigt', m?.email || ''),
    T('done', 'Betrieb angegeben', m ? `${firma} · ${m.bplz} ${m.bort}` : ''),
    T(active ? 'done' : 'now', rejected ? 'Nachweis abgelehnt' : 'Abgleich mit dem Schornsteinfegerregister',
      active ? 'Geprüft und bestätigt' : rejected ? m.rejectReason : query ? 'Rückfrage bei Innung oder Handwerkskammer läuft' : 'Prüfung durch den Betreiber · 1–2 Werktage'),
    T(active ? 'done' : 'todo', 'Freischaltung', 'Sie bekommen eine E-Mail – danach können Sie Ihre Kundenliste importieren')
  ];
  const top = stepNo > 0 ? <StepsBar onBack={goBack} stepNo={stepNo} total={2} /> : scr === 'welcome' ? <HomeBack /> : null;
  const bottom = cta && <Cta {...cta} busy={act.busy} alt={alt} error={act.error} />;

  return (
    <Shell glow={GLOW.sweep} top={top} bottom={bottom} scrollKey={scr}>
      {scr === 'welcome' && <>
        <div style={sx('padding:64px 26px 0;display:flex;flex-direction:column;gap:14px')}>
          <LogoMark size={60} title="Kaminfeger Verwaltung" />
          <span className="card-kicker" style={sx('margin-top:6px')}>Für Kaminfeger</span>
          <div style={sx('font-size:34px;font-weight:500;letter-spacing:-0.025em;line-height:1.1;text-wrap:pretty')}>Weniger verschlossene Türen. Mehr erledigte Häuser.</div>
          <div style={sx('font-size:15px;color:var(--color-neutral-400);text-wrap:pretty')}>Termine fürs Kehren, Überprüfen und Messen: Zeitfenster pro Straße freigeben, Rückmeldungen sehen, Route planen.</div>
        </div>
        {notice && <div style={sx('margin:24px 16px 0')}><ErrorLine text={notice} /></div>}
        <div style={sx('display:flex;flex-direction:column;gap:14px;padding:44px 26px 20px;font-size:14px')}>
          <div style={sx('display:flex;gap:12px;align-items:center')}><Icon n="ph-seal-check" style={sx('font-size:20px;color:var(--color-accent)')} />Für jeden Betrieb im Schornsteinfegerregister</div>
          <div style={sx('display:flex;gap:12px;align-items:center')}><Icon n="ph-buildings" style={sx('font-size:20px;color:var(--color-accent)')} />Ihre Kundenliste importieren Sie nach der Prüfung</div>
          <div style={sx('display:flex;gap:12px;align-items:center')}><Icon n="ph-clock" style={sx('font-size:20px;color:var(--color-accent)')} />Prüfung in 1–2 Werktagen</div>
          <div style={sx('display:flex;gap:12px;align-items:flex-start;color:var(--color-neutral-400)')}><Icon n="ph-info" style={sx('font-size:20px;flex:none')} /><span style={sx('text-wrap:pretty')}>Amtliche Aufgaben wie die Feuerstättenschau laufen nicht über die App.</span></div>
        </div>
      </>}

      {scr === 'login' && <>
        <div style={sx('display:flex;align-items:center;padding:4px 12px 0')}><button className="btn btn-icon" onClick={() => blade(() => go('welcome'), { dir: 'right', title: 'Schön, dass', em: 'Sie da sind.' })} style={sx('width:44px;height:44px')} aria-label="Zurück"><Icon n="ph-caret-left" style={sx('font-size:22px')} /></button></div>
        <Title pad="10px 22px 0" title="Anmelden" sub="Mit Passkey oder Ihrer geschäftlichen E-Mail-Adresse." />
        <div style={sx('display:flex;flex-direction:column;gap:14px;padding:20px 16px 0')}>
          {!st.lSent && <PasskeyLogin onPasskey={passkeyLogin} busy={act.busy} />}
          <Field label="E-Mail-Adresse"><Input type="email" value={st.lEmail} onChange={e => set({ lEmail: e.target.value, lSent: false, lCode: '' })} placeholder="name@beispiel.de" autoComplete="email" /></Field>
        </div>
        {st.lSent && <div style={sx('padding:22px 16px 0')}><CodeInput email={st.lEmail} value={st.lCode} onChange={v => set({ lCode: v })} label="Anmeldecode" busy={act.busy} error={act.error} onComplete={login} onResend={() => sendCode(st.lEmail, 'login', { lCode: '' })} /></div>}
        <div style={sx('margin:22px 16px 20px;display:flex;gap:8px;font-size:12px;color:var(--color-neutral-500)')}><Icon n="ph-shield-check" style={sx('font-size:15px;margin-top:1px')} /><span style={sx('text-wrap:pretty')}>Kein Passwort nötig. Der Code gilt 10 Minuten und nur einmal.</span></div>
      </>}

      {scr === 'account' && <>
        <Title title="Ihr Betrieb" sub="So, wie er im Schornsteinfegerregister steht." />
        <div style={sx('display:flex;flex-direction:column;gap:14px;padding:20px 16px 0')}>
          <div style={sx('display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);gap:8px')}>
            <Field label="Vorname"><Input value={st.first} onChange={e => set({ first: e.target.value })} placeholder="Vorname" autoComplete="given-name" /></Field>
            <Field label="Nachname"><Input value={st.last} onChange={e => set({ last: e.target.value })} placeholder="Nachname" autoComplete="family-name" /></Field>
          </div>
          <Field label="Name des Betriebs (optional)"><Input value={st.company} onChange={e => set({ company: e.target.value })} placeholder="z. B. Kaminfeger Muster" autoComplete="organization" maxLength={80} /></Field>
          <Field label="Betriebsadresse"><Input value={st.bstreet} onChange={e => set({ bstreet: e.target.value })} placeholder="Straße und Hausnummer" autoComplete="street-address" /></Field>
          <div style={sx('display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1.6fr);gap:8px')}>
            <Field label="PLZ"><Input value={st.bplz} onChange={e => set({ bplz: e.target.value.replace(/\D/g, '').slice(0, 5) })} placeholder="PLZ" inputMode="numeric" maxLength={5} autoComplete="postal-code" style="font-variant-numeric:tabular-nums" /></Field>
            <Field label="Ort"><Input value={st.bort} onChange={e => set({ bort: e.target.value })} placeholder="Ort" autoComplete="address-level2" /></Field>
          </div>
          <Field label="Telefon für Kunden (optional)"><Input type="tel" value={st.phone} onChange={e => set({ phone: e.target.value })} placeholder="z. B. 0761 123456" autoComplete="tel" /></Field>
          <Field label="Geschäftliche E-Mail"><Input type="email" value={st.email} onChange={e => set({ email: e.target.value, codeSent: false, code: '' })} placeholder="name@betrieb.de" autoComplete="email" /></Field>
        </div>
        {st.codeSent ? <div style={sx('padding:22px 16px 20px')}><CodeInput email={st.email} value={st.code} onChange={v => set({ code: v })} busy={act.busy} error={act.error} onResend={() => sendCode(st.email, 'register', { code: '' })} /></div> : <div style={sx('height:20px')} />}
      </>}

      {scr === 'proof' && <>
        <Title title="Nachweis" sub="Damit sich niemand als Ihr Betrieb ausgibt, gleichen wir Ihre Angaben mit dem Schornsteinfegerregister ab." />
        <div style={sx('display:flex;flex-direction:column;gap:8px;padding:20px 16px 0')}>
          {docs.map(d => { const f = m?.docs[d.k], on = !!f; const inner = <>
            <div style={sx('width:40px;height:40px;border-radius:var(--radius-md);background:var(--color-bg);display:grid;place-items:center;flex:none')}><Icon n={on ? 'ph-check' : d.icon} style={sx(`font-size:20px;color:${on ? 'var(--color-accent)' : 'var(--color-neutral-400)'}`)} /></div>
            <div style={sx('flex:1;min-width:0')}><div style={sx('font-size:14px')}>{d.title}</div><div style={sx(`font-size:12px;color:${on ? 'var(--color-accent-300)' : 'var(--color-neutral-500)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`)}>{st.uploading === d.k ? 'Wird hochgeladen …' : on ? `${f.name} · ${fileSize(f.size)}` : d.empty}</div></div>
            <Icon n={on ? 'ph-x' : 'ph-upload-simple'} style={sx('font-size:18px;color:var(--color-neutral-400)')} />
          </>;
          const style = sx(`width:100%;text-align:left;display:flex;gap:12px;align-items:center;min-height:68px;padding:12px 14px;border-radius:var(--radius-lg);background:${on ? 'var(--color-surface)' : 'transparent'};border:1px ${on ? 'solid' : 'dashed'} ${on ? 'var(--color-accent-800)' : 'var(--color-neutral-700)'};color:inherit;font:inherit;cursor:pointer`);
          return on ? <button key={d.k} onClick={() => removeDoc(d.k)} style={style} aria-label={`${d.title} entfernen`}>{inner}</button>
            : <FilePick key={d.k} accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" onFile={f2 => uploadDoc(d.k, f2)} disabled={!!st.uploading} style={style}>{inner}</FilePick>;
          })}
        </div>
        <label className="radio" style={sx('margin:18px 22px 20px;align-items:flex-start;font-size:13px;color:var(--color-neutral-300);line-height:1.45')}>
          <input type="checkbox" checked={st.assure} onChange={() => set({ assure: !st.assure })} />
          <span className="dot" style={sx(`border-radius:4px;margin-top:1px;background:${st.assure ? 'var(--color-accent)' : 'transparent'};border-color:${st.assure ? 'var(--color-accent)' : 'var(--color-divider)'};box-shadow:none;display:grid;place-items:center;color:var(--color-bg);font-size:11px`)}><Icon w="ph-bold" n="ph-check" /></span>
          <span style={sx('text-wrap:pretty')}>Mein Betrieb ist im Schornsteinfegerregister eingetragen. Ich nutze die App nur für freie Arbeiten (Kehren, Überprüfen, Messen) – nicht für die Feuerstättenschau oder andere amtliche Aufgaben.</span>
        </label>
        <div style={sx('margin:-8px 22px 20px;font-size:12px;color:var(--color-neutral-500);display:flex;gap:8px')}><Icon n="ph-trash-simple" style={sx('font-size:15px;margin-top:1px')} /><span style={sx('text-wrap:pretty')}>Den Nachweis sieht nur der Betreiber. Er wird nach der Entscheidung gelöscht, spätestens nach 14 Tagen.</span></div>
      </>}

      {scr === 'pending' && m && <>
        <Title pad="26px 22px 0" title={rejected ? 'Nachweis abgelehnt' : 'Wird geprüft'}
          sub={rejected ? `Grund: ${m.rejectReason}. Bitte laden Sie einen neuen Nachweis hoch.` : 'Wir melden uns per E-Mail, sobald Ihr Betrieb freigeschaltet ist. Diese Seite geht dann automatisch weiter.'} />
        <div style={sx('display:flex;flex-direction:column;padding:22px 16px 0')}>
          {timeline.map(t => (
            <div key={t.title} style={sx('display:grid;grid-template-columns:24px minmax(0, 1fr);column-gap:12px')}>
              <div style={sx('position:relative;display:flex;justify-content:center')}>
                <div style={sx('position:absolute;top:0;bottom:0;width:1px;background:var(--color-neutral-800)')} />
                <div style={sx(`position:relative;margin-top:14px;width:20px;height:20px;border-radius:50%;background:${t.state === 'done' ? 'var(--color-accent)' : 'var(--color-bg)'};box-shadow:${t.state === 'done' ? 'none' : t.state === 'now' ? '0 0 0 1.5px var(--color-accent), 0 0 14px color-mix(in srgb, var(--color-accent) 40%, transparent)' : '0 0 0 1.5px var(--color-neutral-700)'};display:grid;place-items:center;font-size:11px;color:var(--color-bg)`)}>{t.state === 'done' && <Icon w="ph-bold" n="ph-check" />}</div>
              </div>
              <div style={sx('padding:12px 0 14px')}><div style={sx(`font-size:14px;color:${t.state === 'todo' ? 'var(--color-neutral-500)' : 'var(--color-text)'}`)}>{t.title}</div><div style={sx('font-size:12px;color:var(--color-neutral-500);text-wrap:pretty')}>{t.sub}</div></div>
            </div>
          ))}
        </div>
        <div style={sx('height:20px')} />
      </>}

      {scr === 'done' && <div style={sx('padding:52px 24px 0;display:flex;flex-direction:column;align-items:flex-start;gap:6px')}>
        <div style={sx('width:64px;height:64px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--color-accent);color:var(--color-accent);box-shadow:0 0 40px color-mix(in srgb, var(--color-accent) 30%, transparent);margin-bottom:18px')}><Icon w="ph-bold" n="ph-seal-check" style={sx('font-size:28px')} /></div>
        <div style={sx('font-size:28px;font-weight:500;letter-spacing:-0.02em;text-wrap:balance')}>Ihr Betrieb ist freigeschaltet</div>
        <div style={sx('font-size:15px;color:var(--color-neutral-400);text-wrap:pretty')}>{m?.households
          ? `${m.streets} Straßen und ${m.households.toLocaleString('de-DE')} Haushalte aus Ihrer Kundenliste sind da. Legen Sie jetzt die ersten Zeitfenster an.`
          : 'Importieren Sie jetzt Ihre Kundenliste (CSV) und legen Sie die ersten Zeitfenster an.'}</div>
      </div>}
    </Shell>
  );
}
