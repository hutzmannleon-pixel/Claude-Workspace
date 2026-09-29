// Kunden-App – nach „KundenApp“ (Claude Design), angebunden an /api/customer/*.
import { useEffect, useState } from 'react';
import { sx, api, useData, useAction, fmtAt, endOf, short, longDay, todayIso, EMAIL_RE } from '../lib/core.js';
import { Shell, GLOW, Icon, BackHeader, PageTitle, SectionLabel, Toggle, CheckRow, Sheet, TabBar, Avatar, Hero, ErrorLine, Loading, Input, DeleteSheet, LegalLinks, PasskeyPanel, PasskeyOffer, AppHeader, Greeting, NextCard, Tiles, InfoCard, PageHead, DIV_BOTTOM } from '../ui.jsx';
import { Scenery } from '../brand.jsx';

const PREP = [['access', 'Zugang zu Heizraum und Dachboden freihalten'], ['cold', 'Kaminofen ab dem Vorabend nicht mehr heizen'], ['pets', 'Haustiere während des Besuchs wegsperren']];
const cardS = 'margin:16px 16px 0;padding:18px 16px 16px;border-radius:var(--radius-lg)';

export default function CustomerApp({ onLogout, onReaddress }) {
  const { data: s, error, reload } = useData('/api/customer/state');
  const [ui, setUi] = useState({ screen: 'home', overlay: null, selW: null, selT: null, keyOn: false, keyWho: '', resched: false, cal: false, inviting: false, inviteEmail: '', done: null });
  const set = p => setUi(u => ({ ...u, ...p }));
  const act = useAction();
  useEffect(() => { if (error?.status === 401) onLogout(); }, [error]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return error && error.status !== 401 ? <Shell glow={GLOW.customer}><Hero icon="ph-wifi-slash" muted title="Keine Verbindung" sub={error.message} /></Shell> : <Loading />;

  const r = s.resident, c = s.campaign, b = s.booking, d = s.district;
  const scr = ui.screen, len = c ? c.slotLen : 30;
  const sweep = d?.sweep, sweepName = sweep?.name || 'Ihr Kaminfeger';
  const verified = r.status === 'verified';
  const pendingVerify = ['asked', 'owner', 'review'].includes(r.status);
  const addr = `${r.street} ${r.nr}`;
  const unreadList = s.messages.filter(m => !m.read);
  const year = c?.windows[0] ? c.windows[0].date.slice(0, 4) : String(new Date().getFullYear());
  const call = fn => act.run(async () => { await fn(); await reload(); });

  // Live am Termintag
  const lv = s.live && b ? s.live : null;
  let liveTitle = '', liveSub = '';
  if (lv) {
    const myIdx = lv.stops.findIndex(x => x.me), ci = lv.stops.findIndex(x => x.cur), curIdx = ci < 0 ? lv.stops.length : ci;
    const dist = myIdx - curIdx, slot = `Ihr Slot ${b.t}–${b.end}`;
    if (b.visit === 'done') { liveTitle = 'Erledigt – vielen Dank!'; liveSub = 'Die Feuerstättenschau ist abgeschlossen.'; }
    else if (b.visit === 'missed') { liveTitle = 'Sie wurden nicht angetroffen'; liveSub = 'Bitte wählen Sie eine neue Zeit – die Feuerstättenschau bleibt Pflicht.'; }
    else if (dist <= 0) { liveTitle = 'Ihr Kaminfeger ist jetzt bei Ihnen'; liveSub = 'Bitte öffnen Sie die Tür.'; }
    else if (dist === 1) { liveTitle = 'Sie sind als Nächstes dran'; liveSub = `Gerade bei Nr. ${lv.curNr} · ${slot}`; }
    else { liveTitle = `Ihr Kaminfeger ist ${dist} Häuser entfernt`; liveSub = `Gerade bei Nr. ${lv.curNr} · ${slot}`; }
  }

  // Zeitwahl
  const w = c ? (c.windows.find(x => x.id === ui.selW) || c.windows[0]) : null;
  const hasSel = !!ui.selT && ui.selW === w?.id;
  const freeLabel = n => n ? n + ' frei' : 'ausgebucht';
  const toPick = () => set({ screen: 'pick', resched: false, selW: c.windows[0]?.id, selT: null, overlay: null });
  const toResched = () => set({ screen: 'pick', resched: true, selW: b?.windowId || c.windows[0]?.id, selT: null, overlay: null, keyOn: !!b?.key, keyWho: b?.key || '' });
  const goHome = () => { act.setError(null); set({ screen: 'home', overlay: null }); };
  const openMsgs = () => { set({ screen: 'msgs' }); setTimeout(() => api('/api/customer/read', { body: {} }).then(reload).catch(() => {}), 1200); };
  const doConfirm = () => act.run(async () => {
    await api('/api/customer/book', { body: { windowId: w.id, time: ui.selT, key: ui.keyOn ? ui.keyWho.trim() : '' } });
    set({ screen: 'done', cal: false, done: { date: longDay(w.label) + ', ' + short(w.label).date, time: ui.selT + '–' + endOf(ui.selT, len) } });
    reload();
  });
  const myTime = b ? `${b.t}–${b.end}` : '';
  const myDate = b ? `${longDay(b.label)}, ${short(b.label).date}` : '';
  const prefs = r.prefs;
  const setPref = (k, v) => call(() => api('/api/customer/prefs', { body: { [k]: v } }));
  const rems = [
    { label: 'Am Vorabend', sub: 'E-Mail um 18:00 Uhr', on: prefs.eve, toggle: () => setPref('eve', !prefs.eve) },
    { label: 'Eine Stunde vorher', sub: 'Mit Link zum Live-Status', on: prefs.hour, toggle: () => setPref('hour', !prefs.hour) }
  ];
  const Rems = () => rems.map(x => (
    <div key={x.label} style={sx('display:flex;align-items:center;gap:12px;min-height:56px')}>
      <div style={sx('flex:1')}><div style={sx('font-size:14px')}>{x.label}</div><div style={sx('font-size:12px;color:var(--color-neutral-500)')}>{x.sub}</div></div>
      <Toggle on={x.on} onClick={x.toggle} label={x.label} />
    </div>
  ));

  const showTabs = ['home', 'termin', 'msgs', 'profile'].includes(scr);
  const toTermin = () => { act.setError(null); set({ screen: 'termin', overlay: null }); };
  const tabs = [
    { label: 'Start', icon: 'ph-house', on: scr === 'home', onClick: goHome },
    { label: 'Termin', icon: 'ph-calendar-blank', on: scr === 'termin', onClick: toTermin },
    { label: 'Nachrichten', icon: 'ph-chat-circle-text', on: scr === 'msgs', onClick: openMsgs, badge: unreadList.length },
    { label: 'Mehr', icon: 'ph-dots-three-outline', on: scr === 'profile', onClick: () => set({ screen: 'profile' }) }
  ];
  const btn = (label, onClick, extra = {}) => (
    <div style={sx(`flex:none;padding:10px 16px 6px;position:relative;z-index:2${extra.fade ? ';background:linear-gradient(to top, var(--color-bg) 70%, transparent)' : ''}`)}>
      {act.error && <div style={sx('padding:0 4px 8px')}><ErrorLine text={act.error} /></div>}
      {extra.hint && <div style={sx('padding:0 4px 8px;font-size:12px;color:var(--color-neutral-400);display:flex;gap:8px')}><Icon n="ph-hourglass-medium" style={sx('font-size:15px')} /><span style={sx('text-wrap:pretty')}>{extra.hint}</span></div>}
      <button className={`btn ${extra.secondary ? 'btn-secondary' : 'btn-primary'}`} onClick={onClick} disabled={extra.disabled || act.busy}
        style={sx(`width:100%;min-height:50px;font-size:15px${extra.glow ? ';box-shadow:0 0 28px color-mix(in srgb, var(--color-accent) 22%, transparent)' : ''}`)}>{extra.icon && <Icon n={extra.icon} style={sx('font-size:18px')} />}{label}</button>
    </div>
  );
  let bottom = null;
  if (scr === 'pick') bottom = btn(hasSel ? `Weiter · ${short(w.label).day} ${ui.selT}–${endOf(ui.selT, len)}` : 'Bitte eine Zeit wählen', () => hasSel && set({ screen: 'confirm' }), { disabled: !hasSel, fade: true });
  if (scr === 'confirm') bottom = btn('Termin verbindlich bestätigen', doConfirm, { icon: 'ph-check-circle', glow: true, disabled: !verified, hint: verified ? null : 'Buchen ist möglich, sobald Ihr Wohnsitz bestätigt ist. Sie bekommen dann eine E-Mail.' });
  if (scr === 'done') bottom = btn('Fertig', goHome, { secondary: true });
  if (scr === 'info') bottom = b ? btn('Termin ansehen', toTermin, { icon: 'ph-calendar-blank' }) : c && s.houseStatus !== 'booked' && r.status !== 'moved' ? btn(verified ? 'Zeit wählen' : 'Zeiten ansehen', toPick, { icon: 'ph-calendar-plus' }) : null;

  const overlay = <>
    <PasskeyOffer role="customer" />
    {ui.overlay === 'cancel' && <Sheet>
      <div style={sx('font-size:20px;font-weight:500')}>Termin absagen?</div>
      <div style={sx('font-size:14px;color:var(--color-neutral-300);text-wrap:pretty')}>Ihr Slot {myDate} · {myTime} wird für Nachbarn frei. Die Feuerstättenschau bleibt Pflicht – meist ist <strong style={sx('font-weight:500;color:var(--color-text)')}>Verschieben</strong> die bessere Wahl.</div>
      <button className="btn btn-primary" onClick={toResched} style={sx('min-height:48px;margin-top:6px')}>Lieber verschieben</button>
      <button className="btn btn-secondary" disabled={act.busy} onClick={() => call(async () => { await api('/api/customer/cancel', { body: {} }); set({ overlay: null, screen: 'home' }); })} style={sx('min-height:48px')}>Trotzdem absagen</button>
      <button className="btn btn-ghost" onClick={() => set({ overlay: null })} style={sx('min-height:44px;color:var(--color-neutral-400)')}>Zurück</button>
    </Sheet>}
    {ui.overlay === 'logout' && <Sheet>
      <div style={sx('font-size:20px;font-weight:500')}>Abmelden?</div>
      <div style={sx('font-size:14px;color:var(--color-neutral-300);text-wrap:pretty')}>Ihr Termin bleibt bestehen. Erinnerungen per E-Mail bekommen Sie weiter, auf diesem Gerät sind Sie danach abgemeldet.</div>
      <button className="btn btn-primary" onClick={async () => { await api('/api/customer/logout', { body: {} }).catch(() => {}); onLogout(); }} style={sx('min-height:48px;margin-top:6px')}><Icon n="ph-sign-out" />Abmelden</button>
      <button className="btn btn-ghost" onClick={() => set({ overlay: null })} style={sx('min-height:44px;color:var(--color-neutral-400)')}>Abbrechen</button>
    </Sheet>}
    {ui.overlay === 'delete' && <DeleteSheet busy={act.busy} error={act.error} onClose={() => { act.setError(null); set({ overlay: null }); }}
      text="Ihr Konto und Ihre Angaben werden gelöscht. Wohnt sonst niemand aus Ihrem Haushalt in der App, wird Ihr Termin storniert. Das lässt sich nicht rückgängig machen."
      onDelete={c => act.run(async () => { await api('/api/customer/delete', { body: { confirm: c } }); onLogout(); })} />}
    {ui.overlay === 'move' && <Sheet>
      <div style={sx('font-size:20px;font-weight:500')}>Umzug melden?</div>
      <div style={sx('font-size:14px;color:var(--color-neutral-300);text-wrap:pretty')}>Ihr Zugang zu {addr} endet. Offene Termine werden storniert und {sweepName} informiert. Die neuen Bewohner können sich dann selbst verifizieren.</div>
      {act.error && <ErrorLine text={act.error} />}
      <button className="btn btn-primary" disabled={act.busy} onClick={() => call(async () => { await api('/api/customer/move', { body: {} }); set({ overlay: null, screen: 'home' }); })} style={sx('min-height:48px;margin-top:6px')}>Umzug melden</button>
      <button className="btn btn-ghost" onClick={() => set({ overlay: null })} style={sx('min-height:44px;color:var(--color-neutral-400)')}>Abbrechen</button>
    </Sheet>}
  </>;

  // Live-Anzeige am Termintag – auf Start und auf der Termin-Seite
  const liveCard = <>
        {lv && <div style={sx(`${cardS};padding:18px 16px 16px;background:var(--color-surface);box-shadow:0 0 0 1px var(--color-accent-700), 0 0 40px color-mix(in srgb, var(--color-accent) 20%, transparent)`)}>
          <div style={sx('display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-accent)')}>
            <span style={sx('position:relative;width:8px;height:8px;border-radius:50%;background:var(--color-accent)')}><span style={sx('position:absolute;inset:0;border-radius:50%;background:var(--color-accent);animation:kfpulse 1.8s ease-out infinite')} /></span>
            <span>{b.date === todayIso() ? 'Live · heute' : 'Live'}</span>
          </div>
          <div style={sx('font-size:24px;font-weight:500;letter-spacing:-0.02em;line-height:1.15;margin-top:10px;text-wrap:pretty')}>{liveTitle}</div>
          <div style={sx('font-size:13px;color:var(--color-neutral-400);margin-top:4px')}>{liveSub}</div>
          <div style={sx('position:relative;margin-top:20px;display:flex')}>
            <div style={sx('position:absolute;left:0;right:0;top:9px;height:1px;background:linear-gradient(to right, transparent, var(--color-neutral-700) 32px, var(--color-neutral-700) calc(100% - 32px), transparent)')} />
            {lv.stops.map((x, i) => {
              const sz = x.cur ? '14px' : x.me ? '12px' : '8px';
              const bg = x.cur ? 'var(--color-accent)' : x.me ? 'var(--color-bg)' : x.visited ? 'var(--color-neutral-600)' : 'var(--color-neutral-800)';
              const sh = x.cur ? '0 0 0 4px var(--color-accent-900), 0 0 16px var(--color-accent)' : x.me ? '0 0 0 2px var(--color-accent-300)' : 'none';
              const fg = x.me ? 'var(--color-accent-300)' : x.cur ? 'var(--color-text)' : 'var(--color-neutral-500)';
              return (
                <div key={i} style={sx('flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;position:relative')}>
                  <div style={sx('height:19px;display:grid;place-items:center')}><div style={sx(`width:${sz};height:${sz};border-radius:50%;background:${bg};box-shadow:${sh}`)} /></div>
                  <div style={sx(`font-size:11px;color:${fg};white-space:nowrap`)}>{x.me ? 'Sie' : 'Nr. ' + x.nr}</div>
                </div>
              );
            })}
          </div>
          {b.visit === 'missed' && <button className="btn btn-primary" onClick={toPick} style={sx('width:100%;min-height:46px;margin-top:16px')}>Neue Zeit wählen<Icon n="ph-arrow-right" /></button>}
        </div>}

  </>;

  return (
    <Shell glow={GLOW.customer} scrollKey={scr} feedback={{ role: 'customer', where: scr }} bottom={<>{bottom}{showTabs && <TabBar tabs={tabs} />}</>} overlay={overlay}>
      {scr === 'home' && <>
        <AppHeader bell={unreadList.length} onBell={openMsgs} onProfile={() => set({ screen: 'profile' })} ini={('F' + (r.family[0] || '')).toUpperCase()} />
        <Greeting hi={`Hallo Familie ${r.family},`} sub="Schön, dass Sie da sind." />
        {liveCard}
        {r.status === 'moved' && <div style={sx(`${cardS};box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:10px`)}>
          <span className="card-kicker">Umzug gemeldet</span>
          <div style={sx('font-size:22px;font-weight:500;letter-spacing:-0.015em;line-height:1.2')}>Zugang zu {addr} beendet</div>
          <div style={sx('font-size:14px;color:var(--color-neutral-400);text-wrap:pretty')}>Der Kaminfeger ist informiert. Verifizieren Sie Ihre neue Adresse, um dort Termine zu buchen.</div>
          <button className="btn btn-primary" onClick={onReaddress} style={sx('min-height:48px;font-size:15px')}><Icon n="ph-map-pin-plus" />Neue Adresse verifizieren</button>
        </div>}

        {pendingVerify && <div style={sx(`${cardS};box-shadow:0 0 0 1px var(--color-accent-800);display:flex;flex-direction:column;gap:8px`)}>
          <div style={sx('display:flex;justify-content:space-between;align-items:center')}><span className="card-kicker">Wohnsitz</span><span className="tag tag-outline">wird bestätigt</span></div>
          <div style={sx('font-size:18px;font-weight:500;line-height:1.25;text-wrap:pretty')}>{r.status === 'owner' ? 'Wir haben den Eigentümer per E-Mail gefragt' : r.status === 'asked' ? `${sweepName} bestätigt Ihren Wohnsitz` : 'Wir prüfen Ihre Angaben'}</div>
          <div style={sx('font-size:13px;color:var(--color-neutral-400);text-wrap:pretty')}>Bis dahin können Sie Zeiten ansehen, aber noch nicht buchen. Sie bekommen eine E-Mail, sobald es geklappt hat.</div>
        </div>}
        {r.status === 'unverified' && <div style={sx(`${cardS};box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:8px`)}>
          <span className="card-kicker">Konto angelegt</span>
          <div style={sx('font-size:20px;font-weight:500;line-height:1.2;text-wrap:pretty')}>Ihr Kaminfeger nutzt die App noch nicht</div>
          <div style={sx('font-size:14px;color:var(--color-neutral-400);text-wrap:pretty')}>Sobald er dabei ist und Zeitfenster für {r.street} freigibt, melden wir uns per E-Mail. Dann bestätigen Sie kurz Ihren Wohnsitz.</div>
        </div>}
        {r.status === 'rejected' && <div style={sx(`${cardS};box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:8px`)}>
          <span className="card-kicker">Wohnsitz</span>
          <div style={sx('font-size:20px;font-weight:500;line-height:1.2')}>Nicht bestätigt</div>
          <div style={sx('font-size:14px;color:var(--color-neutral-400);text-wrap:pretty')}>Wir konnten nicht bestätigen, dass Sie in der {addr} wohnen. Bitte wenden Sie sich an {sweepName} – oder geben Sie eine andere Adresse an.</div>
          <button className="btn btn-secondary" onClick={onReaddress} style={sx('min-height:46px')}><Icon n="ph-map-pin-plus" />Andere Adresse angeben</button>
        </div>}
        {!c && ['verified', 'asked', 'owner', 'review'].includes(r.status) && <div style={sx(`${cardS};background:var(--color-surface);box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:8px`)}>
          <span className="card-kicker">Feuerstättenschau</span>
          <div style={sx('font-size:20px;font-weight:500;line-height:1.2;text-wrap:pretty')}>Noch keine Zeitfenster</div>
          <div style={sx('font-size:14px;color:var(--color-neutral-400);text-wrap:pretty')}>Sobald {sweepName} Zeitfenster für {r.street} freigibt, bekommen Sie eine E-Mail und wählen hier Ihre Zeit.</div>
        </div>}

        {b && !lv && <NextCard kicker="Nächster Termin" title={myDate} lines={['Feuerstättenschau', `${myTime} Uhr`]} tag="Geplant" onClick={toTermin} />}
        {!b && c && s.houseStatus === 'open' && r.status !== 'moved' && <NextCard icon="ph-calendar-plus" kicker={`Feuerstättenschau ${year}`} title="Bitte Zeit wählen" lines={[`${c.windows.length === 1 ? '1 Zeitfenster' : c.windows.length + ' Zeitfenster'} in der ${c.street}`, `Bis ${c.deadlineLabel} wählen`]} tag="Offen" tagCls="tag-outline" onClick={toTermin} />}
        {!b && s.houseStatus === 'cancelled' && r.status !== 'moved' && <NextCard icon="ph-calendar-x" kicker={`Feuerstättenschau ${year}`} title="Termin abgesagt" lines={['Bitte wählen Sie eine neue Zeit.']} tag="Neu wählen" tagCls="tag-outline" onClick={toPick} />}
        <Tiles items={[
          { label: 'Termin', icon: 'ph-calendar-blank', onClick: toTermin },
          { label: 'Nachrichten', icon: 'ph-chat-circle-text', onClick: openMsgs, badge: unreadList.length },
          { label: 'Leistungen', icon: 'ph-flame', onClick: () => set({ screen: 'info' }) },
          { label: 'Profil', icon: 'ph-user', onClick: () => set({ screen: 'profile' }) }
        ]} />
        <InfoCard title="Sicher. Sauber. Zukunft." sub="Ihr Kaminfeger sorgt für mehr Sicherheit im Bezirk." onClick={() => set({ screen: 'info' })} />
        {sweep && <div style={sx('margin:16px 16px 20px;padding:12px 14px;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);display:flex;align-items:center;gap:12px')}>
          <Avatar ini={sweep.ini} />
          <div style={sx('flex:1')}><div style={sx('font-size:14px')}>{sweep.name}</div><div style={sx('font-size:12px;color:var(--color-neutral-500)')}>Ihr Kaminfeger · Kehrbezirk {d.no}</div></div>
          {sweep.phone && <a className="btn btn-secondary btn-icon" href={`tel:${sweep.phone.replace(/[^\d+]/g, '')}`} style={sx('width:44px;height:44px')} aria-label={`${sweep.name} anrufen`}><Icon n="ph-phone" style={sx('font-size:18px')} /></a>}
        </div>}
        {!sweep && <div style={sx('height:20px')} />}
      </>}

      {scr === 'termin' && <>
        <PageHead title="Ihr Termin" onBack={goHome} />
        {liveCard}
        {c && s.houseStatus === 'open' && r.status !== 'moved' && <div style={sx(`${cardS};background:var(--color-surface);box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:10px`)}>
          <div style={sx('display:flex;justify-content:space-between;align-items:center')}><span className="card-kicker">Feuerstättenschau {year}</span><span className="tag tag-accent">Zeit wählen</span></div>
          <div style={sx('font-size:22px;font-weight:500;letter-spacing:-0.015em;line-height:1.2;text-wrap:pretty')}>Ihr Kaminfeger kommt in die {c.street}</div>
          <div style={sx('font-size:14px;color:var(--color-neutral-400);text-wrap:pretty')}>{sweepName} hat {c.windows.length} Zeitfenster freigegeben. Wählen Sie eine halbe Stunde, in der jemand zu Hause ist – dann steht er nicht vor verschlossener Tür.</div>
          <div style={sx('display:flex;flex-direction:column;gap:2px;margin-top:4px')}>
            {c.windows.map(x => (
              <div key={x.id} style={sx(`display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-size:14px;background:${DIV_BOTTOM}`)}>
                <span>{x.label} <span style={sx('color:var(--color-neutral-500)')}>· {x.start}–{x.end}</span></span>
                <span style={sx('font-size:12px;color:var(--color-accent-300)')}>{freeLabel(x.free)}</span>
              </div>
            ))}
          </div>
          <div style={sx('display:flex;align-items:center;gap:6px;font-size:12px;color:var(--color-neutral-400)')}><Icon n="ph-clock-countdown" style={sx('font-size:15px')} /><span>Bitte bis {c.deadlineLabel} wählen</span></div>
          <button className="btn btn-primary" onClick={toPick} style={sx('min-height:48px;font-size:15px;margin-top:2px')}>{verified ? 'Zeit wählen' : 'Zeiten ansehen'}<Icon n="ph-arrow-right" /></button>
        </div>}

        {b && <>
          <div style={sx(`${cardS};background:var(--color-surface);box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:6px`)}>
            <div style={sx('display:flex;justify-content:space-between;align-items:center')}><span className="card-kicker">Ihr Termin</span><span className="tag tag-neutral" style={sx('gap:5px')}><Icon w="ph-bold" n="ph-check" />bestätigt</span></div>
            <div style={sx('font-size:34px;font-weight:500;letter-spacing:-0.025em;line-height:1.1;margin-top:8px')}>{myTime}</div>
            <div style={sx('font-size:16px;color:var(--color-neutral-300)')}>{myDate}</div>
            <div className="hr" style={sx('margin:10px 0 6px')} />
            <div style={sx('display:flex;flex-direction:column;gap:9px;font-size:14px')}>
              <div style={sx('display:flex;gap:10px;align-items:center')}><Icon n="ph-map-pin" style={sx('font-size:18px;color:var(--color-neutral-500)')} />{addr}</div>
              {b.key && <div style={sx('display:flex;gap:10px;align-items:center')}><Icon n="ph-key" style={sx('font-size:18px;color:var(--color-accent)')} /><span>Schlüssel bei {b.key}</span></div>}
              <div style={sx('display:flex;gap:10px;align-items:center')}><Icon n="ph-timer" style={sx('font-size:18px;color:var(--color-neutral-500)')} /><span>Dauer ca. {len} Minuten</span></div>
            </div>
            {!b.visit && !r.isMember && <div style={sx('display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px')}>
              <button className="btn btn-secondary" onClick={toResched} style={sx('min-height:44px')}><Icon n="ph-calendar-dots" />Verschieben</button>
              <button className="btn btn-secondary" onClick={() => set({ overlay: 'cancel' })} style={sx('min-height:44px;color:var(--color-neutral-400)')}>Absagen</button>
            </div>}
          </div>
          {!b.visit && <>
            <SectionLabel right={<span style={sx('font-size:12px;color:var(--color-neutral-500);font-variant-numeric:tabular-nums')}>{r.prep.length} von {PREP.length}</span>}>Vorbereitung</SectionLabel>
            <div style={sx('margin:0 16px;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);padding:2px 14px')}>
              {PREP.map(p => <CheckRow key={p[0]} on={r.prep.includes(p[0])} label={p[1]} strike minH="52px" onClick={() => call(() => api('/api/customer/prep', { body: { key: p[0] } }))} />)}
            </div>
          </>}
          <SectionLabel>Erinnerungen</SectionLabel>
          <div style={sx('margin:0 16px;border-radius:var(--radius-lg);background:var(--color-surface);padding:2px 16px')}><Rems /></div>
        </>}

        {s.houseStatus === 'cancelled' && r.status !== 'moved' && <div style={sx(`${cardS};background:var(--color-surface);box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:10px`)}>
          <div style={sx('display:flex;justify-content:space-between;align-items:center')}><span className="card-kicker">Feuerstättenschau {year}</span><span className="tag tag-neutral">abgesagt</span></div>
          <div style={sx('font-size:22px;font-weight:500;letter-spacing:-0.015em;line-height:1.2')}>Termin abgesagt</div>
          <div style={sx('font-size:14px;color:var(--color-neutral-400);text-wrap:pretty')}>Die Feuerstättenschau ist Pflicht. Bitte wählen Sie eine neue Zeit – sonst meldet sich {sweepName} telefonisch.</div>
          <button className="btn btn-primary" onClick={toPick} style={sx('min-height:48px;font-size:15px')}>Neue Zeit wählen<Icon n="ph-arrow-right" /></button>
        </div>}

        {!b && !(c && s.houseStatus === 'open') && s.houseStatus !== 'cancelled' && <div className="glass" style={sx(`${cardS};display:flex;flex-direction:column;gap:8px`)}>
          <span className="card-kicker">Feuerstättenschau</span>
          <div style={sx('font-size:20px;font-weight:600;line-height:1.2')}>Noch kein Termin</div>
          <div style={sx('font-size:14px;color:var(--color-neutral-300);text-wrap:pretty')}>Sobald {sweepName} Zeitfenster für {r.street || 'Ihre Straße'} freigibt, wählen Sie hier Ihre Zeit. Sie bekommen dann eine E-Mail.</div>
        </div>}
        <div style={sx('height:20px')} />
      </>}

      {scr === 'info' && <>
        <PageHead title="Leistungen" onBack={goHome} />
        <div className="glass" style={sx('margin:8px 16px 20px;border-radius:26px;overflow:hidden')}>
          <div aria-hidden="true" style={sx('height:170px;position:relative;-webkit-mask-image:linear-gradient(to bottom, #000 60%, transparent);mask-image:linear-gradient(to bottom, #000 60%, transparent)')}><Scenery /></div>
          <div style={sx('padding:0 20px 22px;margin-top:-54px;position:relative;display:flex;flex-direction:column;gap:6px')}>
            <div style={sx('width:64px;height:64px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 50% 60%, rgba(255,170,80,0.55), rgba(40,56,80,0.85) 72%);box-shadow:inset 0 1px 0 rgba(255,255,255,0.3), 0 8px 24px rgba(8,16,30,0.4);margin-bottom:10px')}><Icon w="ph-fill" n="ph-flame" style={sx('font-size:34px;color:#f7a54a')} /></div>
            <div style={sx('font-size:26px;font-weight:700;letter-spacing:-0.02em')}>Feuerstättenschau</div>
            <div style={sx('font-size:16px;color:var(--color-neutral-200)')}>Sicherheit für Ihr Zuhause</div>
            <div style={sx('font-size:14px;color:var(--color-neutral-300);line-height:1.55;margin-top:10px;text-wrap:pretty')}>Die Feuerstättenschau ist gesetzlich vorgeschrieben und findet zweimal in sieben Jahren statt. Ihr Bezirkskaminfeger prüft dabei, ob Ihre Feuerstätten sicher und effizient betrieben werden können.</div>
            <div className="hr" style={sx('margin:14px 0 6px')} />
            {['Überprüfung der Feuerstätte', 'Sicherheitskontrolle von Abgasweg und Aufstellraum', 'Dokumentation im Protokoll', 'Dauer ca. ' + len + ' Minuten'].map(t => (
              <div key={t} style={sx('display:flex;gap:12px;align-items:center;min-height:40px;font-size:14px')}>
                <span style={sx('width:26px;height:26px;border-radius:50%;display:grid;place-items:center;flex:none;background:rgba(255,255,255,0.14);box-shadow:inset 0 1px 0 rgba(255,255,255,0.3)')}><Icon w="ph-bold" n="ph-check" style={sx('font-size:14px')} /></span>{t}
              </div>
            ))}
            <div style={sx('font-size:12px;color:var(--color-neutral-400);margin-top:10px;text-wrap:pretty')}>Tipp: Halten Sie den Zugang zu Heizraum und Dachboden frei und heizen Sie den Kaminofen ab dem Vorabend nicht mehr.</div>
          </div>
        </div>
      </>}

      {scr === 'pick' && c && w && <>
        <BackHeader onBack={goHome} title={ui.resched ? 'Termin verschieben' : 'Zeit wählen'} sub="Schritt 1 von 2" />
        <div style={sx('padding:14px 22px 0;font-size:14px;color:var(--color-neutral-400);text-wrap:pretty')}>An diesen Tagen ist {sweepName} in der {c.street}. Ein Besuch dauert etwa {len} Minuten.</div>
        <div style={sx('display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:8px;padding:16px 16px 0')}>
          {c.windows.map(x => { const on = x.id === w.id, p = short(x.label); return (
            <button key={x.id} onClick={() => set({ selW: x.id, selT: null })} style={sx(`text-align:left;padding:12px 10px 10px;border-radius:var(--radius-md);background:${on ? 'var(--color-accent-900)' : 'var(--color-surface)'};border:1px solid ${on ? 'var(--color-accent)' : 'transparent'};color:inherit;font:inherit;cursor:pointer;display:flex;flex-direction:column;gap:2px;box-shadow:${on ? '0 0 24px color-mix(in srgb, var(--color-accent) 18%, transparent)' : 'none'}`)}>
              <span style={sx(`font-size:12px;color:${on ? 'var(--color-accent)' : 'var(--color-neutral-500)'}`)}>{p.day}</span>
              <span style={sx('font-size:17px;font-weight:500;letter-spacing:-0.01em')}>{p.date}</span>
              <span style={sx('font-size:12px;color:var(--color-neutral-400)')}>{x.start}–{x.end}</span>
              <span style={sx('font-size:11px;color:var(--color-accent-300);margin-top:6px')}>{freeLabel(x.free)}</span>
            </button>
          ); })}
        </div>
        <SectionLabel pad="22px 22px 10px" right={<span style={sx('font-size:12px;color:var(--color-neutral-500)')}>{w.slots.filter(x => !x.taken).length} von {w.slots.length} frei</span>}>Zeiten · {w.label}</SectionLabel>
        <div style={sx('display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:8px;padding:0 16px 20px')}>
          {w.slots.map(sl => { const on = ui.selT === sl.t && ui.selW === w.id, tk = sl.taken; return (
            <button key={sl.t} onClick={() => set({ selT: sl.t, selW: w.id })} disabled={tk} style={sx(`min-height:48px;border-radius:var(--radius-md);background:${tk ? 'var(--color-neutral-900)' : on ? 'var(--color-accent-900)' : 'transparent'};border:1px solid ${tk ? 'transparent' : on ? 'var(--color-accent)' : 'var(--color-neutral-700)'};color:${tk ? 'var(--color-neutral-600)' : on ? 'var(--color-accent-200)' : 'var(--color-text)'};font:inherit;font-size:15px;font-weight:500;cursor:${tk ? 'default' : 'pointer'};text-decoration:${tk ? 'line-through' : 'none'};font-variant-numeric:tabular-nums`)}>{sl.t}</button>
          ); })}
        </div>
        <div style={sx('display:flex;gap:16px;padding:0 22px 20px;font-size:12px;color:var(--color-neutral-500)')}>
          <span style={sx('display:flex;align-items:center;gap:6px')}><span style={sx('width:10px;height:10px;border-radius:3px;border:1px solid var(--color-neutral-600)')} />frei</span>
          <span style={sx('display:flex;align-items:center;gap:6px')}><span style={sx('width:10px;height:10px;border-radius:3px;background:var(--color-neutral-900)')} />schon vergeben</span>
          <span style={sx('display:flex;align-items:center;gap:6px')}><span style={sx('width:10px;height:10px;border-radius:3px;border:1px solid var(--color-accent);background:var(--color-accent-900)')} />Ihre Wahl</span>
        </div>
      </>}

      {scr === 'confirm' && w && <>
        <BackHeader onBack={() => { act.setError(null); set({ screen: 'pick' }); }} title="Termin prüfen" sub="Schritt 2 von 2" />
        <div style={sx('margin:16px 16px 0;padding:18px 16px;border-radius:var(--radius-lg);background:var(--color-surface);box-shadow:0 0 0 1px var(--color-accent-800)')}>
          <div className="card-kicker">Feuerstättenschau</div>
          <div style={sx('font-size:34px;font-weight:500;letter-spacing:-0.025em;line-height:1.1;margin-top:10px')}>{ui.selT}–{endOf(ui.selT, len)}</div>
          <div style={sx('font-size:16px;color:var(--color-neutral-300)')}>{longDay(w.label)}, {short(w.label).date}</div>
          <div className="hr" style={sx('margin:14px 0 10px')} />
          <div style={sx('display:flex;flex-direction:column;gap:9px;font-size:14px')}>
            <div style={sx('display:flex;gap:10px;align-items:center')}><Icon n="ph-map-pin" style={sx('font-size:18px;color:var(--color-neutral-500)')} />{addr}, Familie {r.family}</div>
            <div style={sx('display:flex;gap:10px;align-items:center')}><Icon n="ph-user" style={sx('font-size:18px;color:var(--color-neutral-500)')} />{sweepName}, Kaminfeger</div>
          </div>
        </div>
        <div style={sx('margin:12px 16px 0;padding:14px 16px;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:12px')}>
          <div style={sx('display:flex;align-items:center;gap:12px')}>
            <Icon n="ph-key" style={sx('font-size:20px;color:var(--color-neutral-400)')} />
            <div style={sx('flex:1')}><div style={sx('font-size:14px')}>Schlüssel beim Nachbarn</div><div style={sx('font-size:12px;color:var(--color-neutral-500)')}>Falls doch niemand zu Hause ist</div></div>
            <Toggle on={ui.keyOn} onClick={() => set({ keyOn: !ui.keyOn })} label="Schlüssel beim Nachbarn" />
          </div>
          {ui.keyOn && <div className="field"><label>Bei wem liegt der Schlüssel?</label><Input value={ui.keyWho} onChange={e => set({ keyWho: e.target.value })} placeholder="z. B. Fam. Schulz, Nr. 5" style="min-height:44px" /></div>}
        </div>
        <div style={sx('padding:14px 22px 20px;font-size:12px;color:var(--color-neutral-500);display:flex;gap:8px')}><Icon n="ph-info" style={sx('font-size:15px;margin-top:1px')} /><span style={sx('text-wrap:pretty')}>Verschieben oder absagen können Sie bis zum Vortag in der App.</span></div>
      </>}

      {scr === 'done' && ui.done && <>
        <Hero pad="56px 24px 0" icon="ph-check" title="Termin bestätigt">
          <div style={sx('font-size:16px;color:var(--color-neutral-300)')}>{ui.done.date} · {ui.done.time}</div>
          <div style={sx('font-size:14px;color:var(--color-neutral-400);margin-top:6px;text-wrap:pretty')}>{sweepName} sieht Ihre Zeit sofort in seiner Tagesroute. Am Termintag zeigen wir Ihnen live, wie weit er noch entfernt ist.</div>
          <a className="btn btn-secondary" href="/api/customer/calendar.ics" onClick={() => set({ cal: true })} style={sx(`min-height:44px;margin-top:14px;color:${ui.cal ? 'var(--color-accent)' : 'var(--color-text)'}`)}><Icon n={ui.cal ? 'ph-check' : 'ph-calendar-plus'} />{ui.cal ? 'Kalenderdatei geladen' : 'Zum Kalender hinzufügen'}</a>
        </Hero>
        <SectionLabel pad="28px 22px 6px">Erinnern Sie mich</SectionLabel>
        <div style={sx('margin:0 16px 20px;border-radius:var(--radius-lg);background:var(--color-surface);padding:2px 16px')}><Rems /></div>
      </>}

      {scr === 'msgs' && <>
        <PageTitle title="Nachrichten" sub="von Ihrem Kaminfeger" />
        <div style={sx('display:flex;flex-direction:column;gap:10px;padding:14px 16px 20px')}>
          {!s.messages.length && <div style={sx('font-size:14px;color:var(--color-neutral-500);padding:8px 6px')}>Noch keine Nachrichten.</div>}
          {s.messages.slice().reverse().map(m => (
            <div key={m.id} style={sx('display:flex;gap:10px;align-items:flex-start')}>
              <Avatar ini={sweep?.ini || 'KF'} size={32} fs={12} />
              <div style={sx('flex:1;display:flex;flex-direction:column;gap:4px')}>
                <div style={sx(`padding:10px 12px;border-radius:4px var(--radius-lg) var(--radius-lg) var(--radius-lg);background:var(--color-surface);font-size:14px;text-wrap:pretty;box-shadow:${m.read ? 'none' : '0 0 0 1px var(--color-accent-700)'}`)}>{m.text}</div>
                <div style={sx('font-size:11px;color:var(--color-neutral-500);padding-left:4px')}>{fmtAt(m.at)}</div>
              </div>
            </div>
          ))}
        </div>
      </>}

      {scr === 'profile' && <Profile s={s} ui={ui} set={set} call={call} act={act} />}
    </Shell>
  );
}

function Profile({ s, ui, set, call, act }) {
  const r = s.resident, d = s.district;
  const moved = r.status === 'moved', verified = r.status === 'verified';
  const tag = moved ? ['tag-neutral', 'ph-x', 'beendet'] : verified ? ['tag-accent', 'ph-shield-check', 'verifiziert'] : ['tag-outline', 'ph-hourglass-medium', 'in Prüfung'];
  const inviteOk = EMAIL_RE.test(ui.inviteEmail.trim());
  return <>
    <PageTitle title="Profil" />
    <div style={sx('margin:12px 16px 0;padding:16px;border-radius:var(--radius-lg);background:var(--color-surface);display:flex;flex-direction:column;gap:4px')}>
      <div style={sx('display:flex;align-items:center;gap:8px')}><span style={sx('font-size:17px;font-weight:500;flex:1')}>Familie {r.family}</span><span className={`tag ${tag[0]}`} style={sx('gap:5px')}><Icon w="ph-bold" n={tag[1]} />{tag[2]}</span></div>
      <div style={sx('font-size:14px;color:var(--color-neutral-300)')}>{r.street} {r.nr}, {r.plz} {r.ort}</div>
      {d && <div style={sx('font-size:12px;color:var(--color-neutral-500)')}>Kehrbezirk {d.no}{d.sweep ? ' · ' + d.sweep.name : ''}</div>}
      <div style={sx('font-size:12px;color:var(--color-neutral-500)')}>{s.me.email}</div>
    </div>
    {verified && <>
      <SectionLabel>Haushalt</SectionLabel>
      <div style={sx('margin:0 16px;border-radius:var(--radius-lg);background:var(--color-surface);padding:2px 16px')}>
        {s.members.map((m, i) => (
          <div key={i} style={sx(`display:flex;align-items:center;gap:12px;min-height:56px;background:${DIV_BOTTOM}`)}>
            <Avatar ini={m.ini} size={32} fs={12} />
            <div style={sx('flex:1;min-width:0')}><div style={sx('font-size:14px;overflow:hidden;text-overflow:ellipsis')}>{m.name}</div><div style={sx('font-size:12px;color:var(--color-neutral-500)')}>{m.sub}</div></div>
          </div>
        ))}
        {ui.inviting ? <div style={sx('display:flex;flex-direction:column;gap:6px;padding:12px 0')}>
          <div style={sx('display:flex;gap:6px')}>
            <Input type="email" value={ui.inviteEmail} onChange={e => set({ inviteEmail: e.target.value })} placeholder="E-Mail der Mitbewohnerin" style="min-height:44px;flex:1" />
            <button className="btn btn-primary" disabled={!inviteOk || act.busy} onClick={() => call(async () => { await api('/api/customer/members', { body: { email: ui.inviteEmail.trim() } }); set({ inviteEmail: '', inviting: false }); })} style={sx('min-height:44px')}>Einladen</button>
          </div>
          <ErrorLine text={act.error} />
        </div> : <button className="btn btn-ghost" onClick={() => set({ inviting: true })} style={sx('min-height:48px;padding-inline:0')}><Icon n="ph-user-plus" />Mitbewohner einladen</button>}
      </div>
      <div style={sx('padding:6px 22px 0;font-size:12px;color:var(--color-neutral-500);text-wrap:pretty')}>Eingeladene sehen den Termin und bekommen Erinnerungen – ohne eigene Adressprüfung.</div>
    </>}
    <SectionLabel>Anmeldung</SectionLabel>
    <div className="glass" style={sx('margin:0 16px;border-radius:var(--radius-lg);padding:14px 16px')}>
      <PasskeyPanel role="customer" intro="Mit einem Passkey melden Sie sich per Fingerabdruck oder Gesicht an – ohne auf einen Code per E-Mail zu warten. Freiwillig; der E-Mail-Code funktioniert weiterhin." />
    </div>
    <SectionLabel>Benachrichtigungen</SectionLabel>
    <div style={sx('margin:0 16px;border-radius:var(--radius-lg);background:var(--color-surface);padding:2px 16px')}>
      <div style={sx('display:flex;align-items:center;gap:12px;min-height:56px')}>
        <div style={sx('flex:1')}><div style={sx('font-size:14px')}>E-Mail</div><div style={sx('font-size:12px;color:var(--color-neutral-500)')}>Bestätigung, Änderungen und Erinnerungen</div></div>
        <Toggle on={r.prefs.mail} label="E-Mail" onClick={() => call(() => api('/api/customer/prefs', { body: { mail: !r.prefs.mail } }))} />
      </div>
    </div>
    <div style={sx('display:flex;flex-direction:column;margin:16px 16px 20px;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);padding:2px 16px')}>
      {!r.isMember && <button onClick={() => set({ overlay: 'move' })} disabled={moved || !r.street} style={sx(`display:flex;align-items:center;gap:12px;min-height:52px;background:${DIV_BOTTOM};border:0;color:inherit;font:inherit;font-size:14px;cursor:pointer;text-align:left`)}><Icon n="ph-truck" style={sx('font-size:18px;color:var(--color-neutral-400)')} /><span style={sx('flex:1')}>Umzug melden</span><Icon n="ph-caret-right" style={sx('color:var(--color-neutral-500)')} /></button>}
      <button onClick={() => set({ overlay: 'logout' })} style={sx('display:flex;align-items:center;gap:12px;min-height:52px;background:none;border:0;color:var(--color-neutral-400);font:inherit;font-size:14px;cursor:pointer;text-align:left')}><Icon n="ph-sign-out" style={sx('font-size:18px')} /><span style={sx('flex:1')}>Abmelden</span></button>
      <button onClick={() => set({ overlay: 'delete' })} style={sx(`display:flex;align-items:center;gap:12px;min-height:52px;background:none;border:0;border-top:1px solid var(--color-divider);color:var(--color-neutral-500);font:inherit;font-size:14px;cursor:pointer;text-align:left`)}><Icon n="ph-trash" style={sx('font-size:18px')} /><span style={sx('flex:1')}>Konto löschen</span></button>
    </div>
    <LegalLinks />
  </>;
}
