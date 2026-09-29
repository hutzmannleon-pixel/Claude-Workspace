// Kaminfeger-App – nach „KaminfegerApp“ (Claude Design), angebunden an /api/sweep/*.
import { useEffect, useRef, useState } from 'react';
import { sx, api, upload, useData, useAction, useWide, fmtAt, endOf, short, slotsOf, toMin, dayLabel, days, addDays, todayIso, parseDate, plural, greeting } from '../lib/core.js';
import { Shell, GLOW, Icon, BackHeader, SectionLabel, Sheet, Seg, Avatar, Toast, ErrorLine, Loading, FilePick, Hero, DeleteSheet, EmptyPane, DatePicker, DIV_BOTTOM } from '../ui.jsx';

const PRE = [['Vormittag', '08:00', '12:00'], ['Nachmittag', '13:00', '17:00'], ['Ganzer Tag', '08:00', '16:00']];
const chip = on => ({ bd: on ? 'var(--color-accent)' : 'var(--color-neutral-700)', bg: on ? 'var(--color-accent-900)' : 'transparent', fg: on ? 'var(--color-accent-200)' : 'var(--color-text)' });
const nextWorkday = iso => { let d = iso; while (parseDate(d).getDay() === 0) d = addDays(d, 1); return d; };

export default function SweepApp({ onLogout }) {
  const [ui, setUi] = useState({ screen: 'streets', campaignId: null, target: null, draft: null, toast: null, filter: 'all', callId: null, tenantId: null,
    sheet: null, routeDate: null, rcpt: 'all', msgCampaign: null, text: '', kb: null });
  const set = p => setUi(u => ({ ...u, ...p }));
  const act = useAction();
  const wide = useWide();
  const ov = useData('/api/sweep/overview');
  const scr = ui.screen;
  const camp = useData(ui.campaignId ? `/api/sweep/campaigns/${ui.campaignId}` : null, { enabled: !!ui.campaignId && (scr === 'street' || scr === 'setup') });
  const route = useData(`/api/sweep/route${ui.routeDate ? '?date=' + ui.routeDate : ''}`, { enabled: scr === 'route' });
  const msgs = useData('/api/sweep/messages', { enabled: scr === 'notify' });
  useEffect(() => { if ([ov.error, camp.error, route.error, msgs.error].some(e => e?.status === 401)) onLogout(); }, [ov.error, camp.error, route.error, msgs.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const o = ov.data;
  if (!o) return ov.error && ov.error.status !== 401 ? <Shell glow={GLOW.sweep}><Hero icon="ph-wifi-slash" muted title="Keine Verbindung" sub={ov.error.message} /></Shell> : <Loading />;
  const go = screen => () => { act.setError(null); set({ screen, callId: null, toast: null }); };
  const c = camp.data && camp.data.id === ui.campaignId ? camp.data : null;

  // ---------- Zeitfenster-Editor ----------
  const openSetup = target => {
    act.setError(null);
    if (target.campaign) {
      const src = target.campaign;
      set({ screen: 'setup', target, toast: null, draft: { windows: src.windows.map(w => ({ id: w.id, date: w.date, label: w.label, start: w.start, end: w.end })), slotLen: src.slotLen, deadline: src.deadline } });
    } else {
      const d1 = nextWorkday(addDays(todayIso(), 14));
      set({ screen: 'setup', target, toast: null, draft: { windows: [{ id: 'n1', date: d1, label: dayLabel(d1), start: '08:00', end: '12:00' }], slotLen: 30, deadline: nextWorkday(addDays(d1, -4)) } });
    }
  };
  const d = ui.draft;
  const patchWin = (i, p) => setUi(u => ({ ...u, draft: { ...u.draft, windows: u.draft.windows.map((w, j) => j === i ? { ...w, ...p } : w) } }));
  const tomorrow = addDays(todayIso(), 1);
  const booked = new Set((c?.houses || []).filter(h => h.booking).map(h => h.booking.windowId + '|' + h.booking.t));
  const nHouses = ui.target ? ui.target.households : 0;
  const draftWins = d ? d.windows.map((w, i) => {
    const valid = w.start && w.end && toMin(w.end) > toMin(w.start);
    const times = valid ? slotsOf(w, d.slotLen) : [];
    const used = d.windows.filter((_, j) => j !== i).map(x => x.date);
    const first = w.date < tomorrow ? w.date : tomorrow;
    const last = w.date > addDays(tomorrow, 62) ? w.date : addDays(tomorrow, 62);
    return { ...w, n: i + 1, times, used, days: days(first, last).filter(x => !used.includes(x.iso)) };
  }) : [];
  const cap = draftWins.reduce((a, w) => a + w.times.length, 0), capOk = cap >= nHouses;
  const saveSetup = () => act.run(async () => {
    const body = { id: ui.target.campaign?.id, street: ui.target.street, plz: ui.target.plz, slotLen: d.slotLen, deadline: d.deadline,
      windows: d.windows.slice().sort((a, b) => a.date < b.date ? -1 : 1).map(w => ({ id: typeof w.id === 'number' ? w.id : undefined, date: w.date, start: w.start, end: w.end })) };
    const r = await api('/api/sweep/campaigns', { body });
    const toast = `Zeitfenster für ${ui.target.street} an ${plural(r.households, 'Haushalt', 'Haushalte')} gesendet.` + (r.dropped ? ` ${plural(r.dropped, 'Termin passt', 'Termine passen')} nicht mehr – die Haushalte wählen neu.` : '');
    set({ screen: 'street', campaignId: r.id, draft: null, toast });
    ov.reload(); camp.reload();
  });

  // ---------- Straße ----------
  const rows = c ? c.houses.map(h => {
    const w = h.booking ? c.windows.find(x => x.id === h.booking.windowId) : null;
    let line = 'Keine Rückmeldung', lineFg = 'var(--color-neutral-500)', tag = null, tagCls = 'tag-neutral', showCall = false;
    const missed = h.booking?.visit === 'missed';
    if (h.status === 'booked' && w) {
      line = `${short(w.label).day} ${short(w.label).date} · ${h.booking.t}${h.booking.src === 'phone' ? ' · telefonisch' : ''}`; lineFg = 'var(--color-neutral-400)';
      if (h.booking.visit === 'done') tag = 'erledigt';
      else if (missed) { line = `Nicht angetroffen · ${h.booking.t}`; lineFg = 'var(--color-accent-300)'; showCall = true; }
      else { tag = 'bestätigt'; tagCls = 'tag-accent'; }
    } else if (h.moved) { line = 'Bewohner ausgezogen · neu verifizieren lassen'; tag = 'Umzug'; }
    else if (h.status === 'cancelled') { line = 'Hat abgesagt'; lineFg = 'var(--color-accent-300)'; showCall = true; }
    else showCall = true;
    return { ...h, line, lineFg, tag, tagCls, showCall, missed, isOpen: h.status !== 'booked' || missed, key: h.status === 'booked' && h.booking.key };
  }) : [];
  const counts = c ? { booked: c.houses.filter(h => h.status === 'booked').length, cancelled: c.houses.filter(h => h.status === 'cancelled').length } : null;
  const bar = (booked_, open, canc, total) => (
    <div style={sx('display:flex;height:6px;border-radius:3px;overflow:hidden;gap:2px')}>
      <div style={sx(`width:${booked_ / total * 100}%;background:var(--color-accent)`)} />
      <div style={sx(`width:${open / total * 100}%;background:var(--color-neutral-700)`)} />
      <div style={sx(`width:${canc / total * 100}%;background:var(--color-neutral-800)`)} />
    </div>
  );
  const callH = ui.callId && c ? rows.find(h => h.id === ui.callId) : null;
  const callWhy = h => h.status === 'cancelled' ? 'hat abgesagt' : h.missed ? 'nicht angetroffen' : 'keine Rückmeldung';
  const callWins = callH ? c.windows.map(w => ({ ...w, slots: slotsOf(w, c.slotLen).filter(t => !c.houses.some(x => x.id !== callH.id && x.booking && x.booking.windowId === w.id && x.booking.t === t)) })).filter(x => x.slots.length) : [];

  // ---------- Route ----------
  const rt = route.data;
  const cur = rt?.started ? rt.stops.find(x => !x.visit) : null;
  const nDone = rt ? rt.stops.filter(x => x.visit === 'done').length : 0, nMiss = rt ? rt.stops.filter(x => x.visit === 'missed').length : 0;
  const canStart = rt && (rt.date <= todayIso() || rt.canStartFuture);

  // ---------- Nachrichten ----------
  const md = msgs.data;
  const mc = md ? (md.campaigns.find(x => x.id === ui.msgCampaign) || md.campaigns[0]) : null;
  const rcptN = mc ? mc.n[ui.rcpt] : 0;
  const templates = mc ? [
    { label: 'Komme ca. 15 Min. später', text: 'Ich bin heute leider ca. 15 Minuten später dran. Danke für Ihre Geduld!' },
    { label: 'Bitte Zeit wählen', text: `Kurze Erinnerung: Bitte wählen Sie bis ${mc.deadlineLabel} in der App eine Zeit für die Feuerstättenschau.` },
    { label: 'Heute kurzfristig frei', text: 'Heute sind noch Slots frei. Wenn es Ihnen passt, buchen Sie direkt in der App.' },
    { label: 'Zugang freihalten', text: 'Bitte halten Sie den Zugang zu Heizraum und Dachboden frei. Vielen Dank!' }
  ] : [];

  const tabOf = { streets: 0, street: 0, setup: 0, route: 1, notify: 2 }[scr];
  const tabs = [['Straßen', 'ph-map-trifold', 'streets'], ['Route', 'ph-path', 'route'], ['Nachrichten', 'ph-paper-plane-tilt', 'notify']]
    .map((t, i) => ({ label: t[0], icon: t[1], on: tabOf === i, onClick: go(t[2]) }));
  const tenant = ui.tenantId ? o.tenants.find(t => t.id === ui.tenantId) : null;
  const answerTenant = answer => act.run(async () => { const r = await api(`/api/sweep/tenant/${tenant.id}`, { body: { answer } }); set({ tenantId: null, toast: r.toast }); ov.reload(); });
  const importKb = file => act.run(async () => { const r = await upload('/api/sweep/kehrbuch', file); set({ kb: r }); ov.reload(); });

  const bottom = <>
    {scr === 'setup' && <div style={sx('flex:none;padding:10px 16px 6px;position:relative;z-index:2')}>
      {act.error && <div style={sx('padding:0 4px 8px')}><ErrorLine text={act.error} /></div>}
      <button className="btn btn-primary" onClick={saveSetup} disabled={act.busy} style={sx('width:100%;min-height:50px;font-size:15px;box-shadow:0 0 28px color-mix(in srgb, var(--color-accent) 22%, transparent)')}><Icon n="ph-paper-plane-tilt" />{act.busy ? 'Wird gesendet …' : `Speichern & an ${plural(nHouses, 'Haushalt', 'Haushalte')} senden`}</button>
    </div>}
  </>;

  const calW = scr === 'setup' && ui.calWin != null ? draftWins[ui.calWin] : null;
  const overlay = <>
    {calW && <DatePicker title={`Fenster ${calW.n} · Datum`} value={calW.date} min={calW.date < tomorrow ? calW.date : tomorrow} max={addDays(tomorrow, 365)}
      disabled={x => parseDate(x).getDay() === 0 || calW.used.includes(x)}
      onPick={x => { patchWin(ui.calWin, { date: x, label: dayLabel(x) }); set({ calWin: null }); }} onClose={() => set({ calWin: null })} />}
    {tenant && <Sheet>
      <span className="card-kicker">Bewohner bestätigen</span>
      <div style={sx('font-size:20px;font-weight:500;line-height:1.2')}>Wohnt {tenant.name} in der {tenant.street} {tenant.nr}?</div>
      <div style={sx('display:flex;flex-direction:column;gap:8px;font-size:13px;color:var(--color-neutral-300);margin-top:4px')}>
        <div style={sx('display:flex;gap:10px;align-items:center')}><Icon n="ph-buildings" style={sx('font-size:17px;color:var(--color-neutral-500)')} /><span>Eigentümer laut Kehrbuch: {tenant.owner}</span></div>
        <div style={sx('display:flex;gap:10px;align-items:center')}><Icon n="ph-envelope-simple" style={sx('font-size:17px;color:var(--color-neutral-500)')} /><span>E-Mail bestätigt · Bewohner laut eigener Angabe</span></div>
      </div>
      <div style={sx('font-size:12px;color:var(--color-neutral-500);text-wrap:pretty')}>Nur bestätigen, wenn Sie es wissen – z. B. vom Klingelschild oder vom letzten Besuch. Sonst fragen wir den Eigentümer per E-Mail.</div>
      {act.error && <ErrorLine text={act.error} />}
      <button className="btn btn-primary" disabled={act.busy} onClick={() => answerTenant('yes')} style={sx('min-height:48px;margin-top:4px')}><Icon n="ph-check" />Ja, wohnt dort</button>
      <button className="btn btn-secondary" disabled={act.busy} onClick={() => answerTenant('no')} style={sx('min-height:46px')}>Weiß ich nicht – Eigentümer fragen</button>
      <button className="btn btn-ghost" onClick={() => set({ tenantId: null })} style={sx('min-height:44px;color:var(--color-neutral-400)')}>Später</button>
    </Sheet>}
    {callH && <Sheet scroll>
      <div style={sx('display:flex;align-items:center;gap:12px')}>
        <div style={sx('width:44px;height:44px;border-radius:var(--radius-md);background:var(--color-bg);display:grid;place-items:center;font-size:16px;font-weight:500')}>{callH.nr}</div>
        <div style={sx('flex:1')}><div style={sx('font-size:18px;font-weight:500')}>Familie {callH.name}</div><div style={sx('font-size:13px;color:var(--color-neutral-400);font-variant-numeric:tabular-nums')}>{callH.phone || 'keine Nummer im Kehrbuch'} · {callWhy(callH)}</div></div>
      </div>
      {callH.phone ? <a className="btn btn-primary" href={`tel:${callH.phone.replace(/[^\d+]/g, '')}`} style={sx('min-height:48px')}><Icon n="ph-phone" />Jetzt anrufen</a>
        : <button className="btn btn-secondary" disabled style={sx('min-height:48px')}><Icon n="ph-phone-slash" />Keine Telefonnummer</button>}
      <div style={sx('font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-neutral-500);margin-top:6px')}>Telefonisch vereinbart? Zeit eintragen</div>
      {callWins.map(cw => (
        <div key={cw.id} style={sx('display:flex;flex-direction:column;gap:6px')}>
          <div style={sx('font-size:12px;color:var(--color-neutral-400)')}>{cw.label} · {cw.start}–{cw.end}</div>
          <div style={sx('display:flex;flex-wrap:wrap;gap:6px')}>
            {cw.slots.map(t => <button key={t} className="btn btn-secondary" disabled={act.busy} onClick={() => act.run(async () => { await api('/api/sweep/bookings', { body: { campaignId: c.id, householdId: callH.id, windowId: cw.id, time: t } }); set({ callId: null }); camp.reload(); ov.reload(); })} style={sx('min-height:38px;min-width:62px;font-variant-numeric:tabular-nums')}>{t}</button>)}
          </div>
        </div>
      ))}
      {act.error && <ErrorLine text={act.error} />}
      <button className="btn btn-ghost" onClick={() => set({ callId: null })} style={sx('min-height:44px;color:var(--color-neutral-400);margin-top:4px')}>Schließen</button>
    </Sheet>}
    {ui.sheet === 'account' && <Sheet>
      <div style={sx('display:flex;align-items:center;gap:12px')}>
        <Avatar ini={o.ini} size={44} fs={15} />
        <div style={sx('flex:1;min-width:0')}><div style={sx('font-size:18px;font-weight:500')}>{o.name}</div><div style={sx('font-size:13px;color:var(--color-neutral-400)')}>Kehrbezirk {o.bez} · {o.kreis}</div></div>
      </div>
      <div style={sx('font-size:13px;color:var(--color-neutral-400)')}>{plural(o.households, 'Liegenschaft', 'Liegenschaften')} im Kehrbuch</div>
      <button className="btn btn-secondary" onClick={() => set({ sheet: 'kehrbuch', kb: null })} style={sx('min-height:46px;margin-top:4px')}><Icon n="ph-upload-simple" />Kehrbuch importieren</button>
      <button className="btn btn-secondary" onClick={async () => { await api('/api/sweep/logout', { body: {} }).catch(() => {}); onLogout(); }} style={sx('min-height:46px')}><Icon n="ph-sign-out" />Abmelden</button>
      <button className="btn btn-ghost" onClick={() => { act.setError(null); set({ sheet: 'delete' }); }} style={sx('min-height:40px;color:var(--color-neutral-500)')}><Icon n="ph-trash" />Konto löschen</button>
      <div style={sx('display:flex;justify-content:center;gap:18px;font-size:12px')}><a href="/impressum" style={sx('color:var(--color-neutral-500)')}>Impressum</a><a href="/datenschutz" style={sx('color:var(--color-neutral-500)')}>Datenschutz</a></div>
      <button className="btn btn-ghost" onClick={() => set({ sheet: null })} style={sx('min-height:44px;color:var(--color-neutral-400)')}>Schließen</button>
    </Sheet>}
    {ui.sheet === 'delete' && <DeleteSheet busy={act.busy} error={act.error} onClose={() => set({ sheet: 'account' })}
      text="Ihr Kaminfeger-Konto wird gelöscht, samt gesendeten Nachrichten. Kehrbuch, Zeitfenster und Termine bleiben beim Bezirk, damit Ihre Kunden ihre Termine behalten. Das lässt sich nicht rückgängig machen."
      onDelete={c => act.run(async () => { await api('/api/sweep/delete', { body: { confirm: c } }); onLogout(); })} />}
    {ui.sheet === 'kehrbuch' && <Sheet scroll>
      <span className="card-kicker">Kehrbuch</span>
      <div style={sx('font-size:20px;font-weight:500;line-height:1.2')}>Kehrbuch importieren</div>
      <div style={sx('font-size:13px;color:var(--color-neutral-300);text-wrap:pretty')}>CSV-Datei mit einer Zeile pro Liegenschaft (Trennzeichen Semikolon oder Komma). Spalten: <b style={sx('font-weight:500')}>strasse, hausnummer, plz, ort, eigentuemer</b>, optional kundennummer, email, telefon. Vorhandene Einträge werden aktualisiert.</div>
      <div style={sx('font-size:12px;color:var(--color-neutral-500);text-wrap:pretty')}>Mit Kundennummer bestätigen Bewohner ihren Wohnsitz sofort. An die E-Mail-Adresse geht beim Senden der Zeitfenster eine Einladung.</div>
      <a href="/vorlagen/kehrbuch.csv" download style={sx('font-size:13px;display:flex;gap:6px;align-items:center')}><Icon n="ph-download-simple" />Vorlage herunterladen</a>
      {ui.kb && <div style={sx('padding:12px 14px;border-radius:var(--radius-md);box-shadow:0 0 0 1px var(--color-accent-700);font-size:13px;display:flex;flex-direction:column;gap:4px')}>
        <span><Icon n="ph-check-circle" style={sx('color:var(--color-accent)')} /> {ui.kb.added} neu · {ui.kb.updated} aktualisiert</span>
        {ui.kb.errorCount > 0 && <span style={sx('color:var(--color-accent-300)')}>{ui.kb.errorCount} Zeilen übersprungen: {ui.kb.errors.slice(0, 3).join(' · ')}</span>}
      </div>}
      {act.error && <ErrorLine text={act.error} />}
      <FilePick className="btn btn-primary" accept=".csv,text/csv" onFile={importKb} disabled={act.busy} style={sx('min-height:48px;margin-top:4px')}><Icon n="ph-upload-simple" />{act.busy ? 'Wird importiert …' : 'CSV-Datei wählen'}</FilePick>
      <button className="btn btn-ghost" onClick={() => set({ sheet: null })} style={sx('min-height:44px;color:var(--color-neutral-400)')}>Schließen</button>
    </Sheet>}
  </>;

  const streetsView = <>
        <div style={sx('padding:10px 22px 0;display:flex;align-items:center;justify-content:space-between;gap:12px')}>
          <div>
            <div style={sx('font-size:12px;color:var(--color-neutral-500)')}>Kehrbezirk {o.bez} · {o.kreis}</div>
            <div style={sx('font-size:23px;font-weight:500;letter-spacing:-0.015em;line-height:1.2')}>{greeting()}, {o.first}</div>
          </div>
          <button onClick={() => set({ sheet: 'account' })} aria-label="Konto" style={sx('width:40px;height:40px;border-radius:50%;background:var(--color-neutral-800);display:grid;place-items:center;font-size:14px;font-weight:500;flex:none;border:0;color:inherit;font-family:inherit;cursor:pointer')}>{o.ini}</button>
        </div>
        {o.today.count > 0 && <div style={sx('margin:16px 16px 0;padding:16px;border-radius:var(--radius-lg);background:var(--color-surface);box-shadow:0 0 0 1px var(--color-accent-800);display:flex;flex-direction:column;gap:4px')}>
          <span className="card-kicker">{o.today.isToday ? 'Heute' : 'Nächster Termintag'} · {o.today.label}</span>
          <div style={sx('font-size:20px;font-weight:500;letter-spacing:-0.015em')}>Route {o.today.streets.join(', ')}</div>
          <div style={sx('font-size:13px;color:var(--color-neutral-400)')}>{plural(o.today.count, 'Termin', 'Termine')} · {o.today.from}–{o.today.to}</div>
          <button className="btn btn-primary" onClick={() => set({ screen: 'route', routeDate: o.today.date, toast: null })} style={sx('min-height:44px;margin-top:10px')}><Icon n="ph-path" />Route öffnen</button>
        </div>}
        <Toast text={ui.toast} icon="ph-paper-plane-tilt" />
        {o.tenants.map(t => (
          <button key={t.id} onClick={() => { act.setError(null); set({ tenantId: t.id }); }} style={sx('margin:12px 16px 0;width:calc(100% - 32px);text-align:left;display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:var(--radius-lg);background:var(--color-surface);border:1px solid var(--color-accent-700);color:inherit;font:inherit;cursor:pointer')}>
            <Icon n="ph-user-check" style={sx('font-size:22px;color:var(--color-accent)')} />
            <div style={sx('flex:1')}><div style={sx('font-size:12px;color:var(--color-accent-300)')}>Bewohner-Anfrage</div><div style={sx('font-size:14px')}>Wohnt {t.name} in der {t.street} {t.nr}?</div></div>
            <Icon n="ph-caret-right" style={sx('color:var(--color-neutral-500)')} />
          </button>
        ))}
        {!o.streets.length && <div style={sx('margin:16px 16px 0;padding:16px;border-radius:var(--radius-lg);box-shadow:0 0 0 1px var(--color-accent-800);display:flex;flex-direction:column;gap:6px')}>
          <span className="card-kicker">Erster Schritt</span>
          <div style={sx('font-size:18px;font-weight:500')}>Kehrbuch importieren</div>
          <div style={sx('font-size:13px;color:var(--color-neutral-400);text-wrap:pretty')}>Laden Sie Ihre Liegenschaften als CSV-Datei hoch. Danach legen Sie pro Straße Zeitfenster an.</div>
          <button className="btn btn-primary" onClick={() => set({ sheet: 'kehrbuch', kb: null })} style={sx('min-height:44px;margin-top:6px')}><Icon n="ph-upload-simple" />Kehrbuch importieren</button>
        </div>}
        {o.streets.length > 0 && <SectionLabel pad="22px 22px 8px">Straßen im Kehrbuch</SectionLabel>}
        <div style={sx('display:flex;flex-direction:column;gap:8px;padding:0 16px 20px')}>
          {o.streets.map(s => {
            const k = s.campaign;
            if (!k) return (
              <div key={s.street + s.plz} style={sx('padding:14px 16px;border-radius:var(--radius-lg);box-shadow:0 0 0 1px var(--color-accent-800);display:flex;flex-direction:column;gap:6px')}>
                <div style={sx('display:flex;align-items:center;gap:8px')}><span style={sx('font-size:16px;font-weight:500;flex:1')}>{s.street}</span><span className="tag tag-neutral">Entwurf</span></div>
                <div style={sx('font-size:12px;color:var(--color-neutral-500)')}>{plural(s.households, 'Haushalt', 'Haushalte')} · {s.plz} · noch keine Zeitfenster</div>
                <button className="btn btn-primary" onClick={() => openSetup({ street: s.street, plz: s.plz, households: s.households })} style={sx('min-height:44px;margin-top:6px')}><Icon n="ph-calendar-plus" />Zeitfenster anlegen</button>
              </div>
            );
            if (k.done) return (
              <button key={s.street + s.plz} onClick={() => set({ screen: 'street', campaignId: k.id, toast: null, filter: 'all' })} style={sx(`text-align:left;padding:14px 16px;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);background:none;border:0;color:inherit;font:inherit;cursor:pointer;display:flex;flex-direction:column;gap:6px${wide && ui.campaignId === k.id && scr !== 'streets' ? ';box-shadow:0 0 0 1px var(--color-accent)' : ''}`)}>
                <div style={sx('display:flex;align-items:center;gap:8px')}><span style={sx('font-size:16px;font-weight:500;flex:1;color:var(--color-neutral-400)')}>{s.street}</span><span style={sx('font-size:12px;color:var(--color-neutral-500);display:flex;gap:4px;align-items:center')}><Icon n="ph-check" />abgeschlossen</span></div>
                <div style={sx('font-size:12px;color:var(--color-neutral-500)')}>{k.visited} von {k.total} besucht · {k.missed} × vor verschlossener Tür</div>
              </button>
            );
            return (
              <button key={s.street + s.plz} onClick={() => set({ screen: 'street', campaignId: k.id, toast: null, filter: 'all' })} style={sx(`text-align:left;padding:14px 16px;border-radius:var(--radius-lg);background:var(--color-surface);border:0;color:inherit;font:inherit;cursor:pointer;display:flex;flex-direction:column;gap:8px${wide && ui.campaignId === k.id && scr !== 'streets' ? ';box-shadow:0 0 0 1px var(--color-accent)' : ''}`)}>
                <div style={sx('display:flex;align-items:center;gap:8px')}><span style={sx('font-size:16px;font-weight:500;flex:1')}>{s.street}</span><span className="tag tag-accent">läuft</span><Icon n="ph-caret-right" style={sx('color:var(--color-neutral-500)')} /></div>
                {bar(k.booked, k.open, k.cancelled, k.total)}
                <div style={sx('font-size:12px;color:var(--color-neutral-400)')}>{k.booked} bestätigt · {k.open} offen · {k.cancelled} abgesagt · {k.windows.join(' · ')}</div>
              </button>
            );
          })}
          {o.streets.length > 0 && <button className="btn btn-ghost" onClick={() => set({ sheet: 'kehrbuch', kb: null })} style={sx('min-height:44px;color:var(--color-neutral-400);align-self:flex-start;padding-inline:6px')}><Icon n="ph-upload-simple" />Kehrbuch aktualisieren</button>}
        </div>
  </>;
  const nav = { title: o.name, sub: `Kehrbezirk ${o.bez} · ${o.kreis}`, tabs, bar: scr !== 'setup',
    footer: <button className="btn btn-secondary" onClick={() => set({ sheet: 'account' })} style={sx('min-height:44px')}><Icon n="ph-user-circle" />Konto</button> };

  return (
    <Shell glow={GLOW.sweep} scrollKey={scr + (ui.campaignId || '')} bottom={bottom} overlay={overlay} nav={nav} feedback={{ role: 'sweep', where: scr }} aside={wide && ['streets', 'street', 'setup'].includes(scr) ? streetsView : null}>
      {scr === 'streets' && (wide ? <EmptyPane icon="ph-map-trifold" text="Wählen Sie links eine Straße." /> : streetsView)}

      {scr === 'street' && (!c ? <div style={sx('padding:40px;color:var(--color-neutral-500);font-size:13px')}>Lädt …</div> : <>
        <BackHeader onBack={go('streets')} title={c.street} sub={`${plural(c.houses.length, 'Haushalt', 'Haushalte')} · Frist ${c.deadlineLabel}`} />
        <Toast text={ui.toast} icon="ph-paper-plane-tilt" />
        <SectionLabel pad="14px 22px 0" right={<button className="btn btn-ghost" onClick={() => openSetup({ street: c.street, plz: c.plz, households: c.houses.length, campaign: c })} style={sx('min-height:36px;padding-inline:8px')}><Icon n="ph-pencil-simple" />Bearbeiten</button>}>Zeitfenster</SectionLabel>
        <div style={sx('display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:8px;padding:4px 16px 0')}>
          {c.windows.map(w => (
            <div key={w.id} style={sx('padding:10px;border-radius:var(--radius-md);background:var(--color-surface);display:flex;flex-direction:column;gap:1px')}>
              <span style={sx('font-size:12px;color:var(--color-neutral-500)')}>{w.label}</span>
              <span style={sx('font-size:13px')}>{w.start}–{w.end}</span>
              <span style={sx('font-size:11px;color:var(--color-accent-300);margin-top:4px')}>{w.booked} / {w.total} gebucht</span>
            </div>
          ))}
        </div>
        <div style={sx('padding:18px 16px 0;display:flex;flex-direction:column;gap:8px')}>
          {bar(counts.booked, c.houses.length - counts.booked - counts.cancelled, counts.cancelled, c.houses.length || 1)}
          <div style={sx('font-size:12px;color:var(--color-neutral-400)')}>{counts.booked} bestätigt · {c.houses.length - counts.booked - counts.cancelled} offen · {counts.cancelled} abgesagt</div>
        </div>
        <div style={sx('padding:14px 16px 0')}>
          <Seg value={ui.filter} onChange={v => set({ filter: v })} options={[{ value: 'all', label: 'Alle' }, { value: 'open', label: `Offen · ${rows.filter(r => r.isOpen).length}` }, { value: 'booked', label: 'Bestätigt' }]} />
        </div>
        <div style={sx('display:flex;flex-direction:column;padding:6px 16px 0')}>
          {rows.filter(r => ui.filter === 'open' ? r.isOpen : ui.filter === 'booked' ? !r.isOpen : true).map(r => (
            <div key={r.id} style={sx(`display:flex;align-items:center;gap:12px;min-height:60px;padding:6px 0;background:${DIV_BOTTOM}`)}>
              <div style={sx('width:38px;height:38px;border-radius:var(--radius-md);background:var(--color-surface);display:grid;place-items:center;font-size:14px;font-weight:500;flex:none;font-variant-numeric:tabular-nums')}>{r.nr}</div>
              <div style={sx('flex:1;min-width:0')}>
                <div style={sx('font-size:14px')}>{r.name}</div>
                <div style={sx(`font-size:12px;color:${r.lineFg};display:flex;gap:5px;align-items:center`)}>{r.line}{r.key && <Icon n="ph-key" style={sx('color:var(--color-accent)')} />}</div>
              </div>
              {r.showCall && <button className="btn btn-secondary" onClick={() => { act.setError(null); set({ callId: r.id }); }} style={sx('min-height:40px')}><Icon n="ph-phone" />Anrufen</button>}
              {r.tag && <span className={`tag ${r.tagCls}`}>{r.tag}</span>}
            </div>
          ))}
        </div>
        <div style={sx('padding:16px 16px 20px')}>
          <button className="btn btn-primary" onClick={() => set({ screen: 'notify', msgCampaign: c.id, rcpt: 'open', text: `Kurze Erinnerung: Bitte wählen Sie bis ${c.deadlineLabel} in der App eine Zeit für die Feuerstättenschau. So stehe ich nicht vor verschlossener Tür.` })} style={sx('width:100%;min-height:46px')}><Icon n="ph-bell-ringing" />Offene erinnern</button>
        </div>
      </>)}

      {scr === 'setup' && d && <>
        <BackHeader onBack={() => { act.setError(null); set({ screen: ui.target.campaign ? 'street' : 'streets', draft: null }); }} title={ui.target.campaign ? 'Zeitfenster bearbeiten' : 'Zeitfenster anlegen'} sub={`${ui.target.street} · ${plural(nHouses, 'Haushalt', 'Haushalte')}`} />
        <div style={sx('padding:12px 22px 0;font-size:14px;color:var(--color-neutral-400);text-wrap:pretty')}>Schlagen Sie 2–3 Fenster vor. Die Kunden buchen darin feste Slots – jeder Slot nur einmal.</div>
        <div style={sx('display:flex;flex-direction:column;gap:10px;padding:14px 16px 0')}>
          {draftWins.map((w, i) => (
            <div key={w.id} style={sx('padding:12px 12px 14px 14px;border-radius:var(--radius-lg);background:var(--color-surface);display:flex;flex-direction:column;gap:12px')}>
              <div style={sx('display:flex;align-items:center;gap:8px')}>
                <button onClick={() => set({ calWin: i })} aria-label={`Fenster ${w.n}: Datum im Kalender wählen`} style={sx('flex:1;display:flex;flex-direction:column;align-items:flex-start;text-align:left;background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer')}>
                  <span style={sx('font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-accent)')}>Fenster {w.n}</span>
                  <span style={sx('font-size:17px;font-weight:500;letter-spacing:-0.01em;display:flex;align-items:center;gap:8px')}>{w.label} · {w.start}–{w.end}<Icon n="ph-calendar-dots" style={sx('font-size:18px;color:var(--color-accent)')} /></span>
                </button>
                <button className="btn btn-icon" aria-label="Fenster löschen" onClick={() => setUi(u => ({ ...u, draft: { ...u.draft, windows: u.draft.windows.filter((_, j) => j !== i) } }))} disabled={d.windows.length <= 1} style={sx('width:40px;height:40px;color:var(--color-neutral-400)')}><Icon n="ph-trash" style={sx('font-size:18px')} /></button>
              </div>
              <DayStrip days={w.days} value={w.date} onPick={x => patchWin(i, { date: x, label: dayLabel(x) })} />
              <div style={sx('display:flex;gap:6px;flex-wrap:wrap')}>
                {PRE.map(p => { const ch = chip(w.start === p[1] && w.end === p[2]); return (
                  <button key={p[0]} onClick={() => patchWin(i, { start: p[1], end: p[2] })} style={sx(`min-height:34px;padding:0 12px;border-radius:17px;border:1px solid ${ch.bd};background:${ch.bg};color:${ch.fg};font:inherit;font-size:13px;cursor:pointer`)}>{p[0]} {p[1].slice(0, 2).replace(/^0/, '')}–{p[2].slice(0, 2)}</button>
                ); })}
              </div>
              <div style={sx('display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);gap:8px')}>
                <div className="field"><label>von</label><input className="input" type="time" step="1800" value={w.start} onChange={e => patchWin(i, { start: e.target.value })} style={sx('min-height:44px;color-scheme:dark;font-size:15px')} /></div>
                <div className="field"><label>bis</label><input className="input" type="time" step="1800" value={w.end} onChange={e => patchWin(i, { end: e.target.value })} style={sx('min-height:44px;color-scheme:dark;font-size:15px')} /></div>
              </div>
              <div style={sx('display:flex;flex-direction:column;gap:6px')}>
                <span style={sx('font-size:12px;color:var(--color-neutral-500)')}>{w.times.length} Slots à {d.slotLen} Min für Kunden</span>
                <div style={sx('display:flex;flex-wrap:wrap;gap:4px')}>
                  {w.times.map(t => { const b = booked.has(w.id + '|' + t); return <span key={t} style={sx(`font-size:11px;font-variant-numeric:tabular-nums;padding:2px 6px;border-radius:var(--radius-sm);background:${b ? 'var(--color-accent-900)' : 'var(--color-bg)'};color:${b ? 'var(--color-accent-300)' : 'var(--color-neutral-400)'}`)}>{t}</span>; })}
                </div>
              </div>
            </div>
          ))}
          {d.windows.length < 3 && <button className="btn btn-secondary" onClick={() => setUi(u => {
            const ws = u.draft.windows, taken = ws.map(w => w.date);
            let dt = addDays(ws[ws.length - 1].date, 1);
            while (taken.includes(dt) || parseDate(dt).getDay() === 0) dt = addDays(dt, 1);
            return { ...u, draft: { ...u.draft, windows: ws.concat([{ id: 'n' + Date.now(), date: dt, label: dayLabel(dt), start: '13:00', end: '17:00' }]) } };
          })} style={sx('min-height:46px;border-style:dashed')}><Icon n="ph-plus" />Fenster hinzufügen</button>}
        </div>
        <div style={sx('padding:18px 16px 0;display:flex;flex-direction:column;gap:14px')}>
          <div className="field"><label>Dauer pro Haushalt</label>
            <Seg value={d.slotLen} onChange={n => setUi(u => ({ ...u, draft: { ...u.draft, slotLen: n } }))} options={[20, 30, 45].map(n => ({ value: n, label: n + ' Min' }))} />
          </div>
          <div className="field"><label>Antwortfrist für Kunden</label><input className="input" type="date" value={d.deadline} min={todayIso()} onChange={e => { const v = e.target.value; setUi(u => ({ ...u, draft: { ...u.draft, deadline: v } })); }} style={sx('min-height:42px;color-scheme:dark')} /></div>
        </div>
        <div style={sx('margin:16px 16px 20px;padding:12px 14px;border-radius:var(--radius-md);box-shadow:var(--shadow-sm);display:flex;gap:10px;align-items:center;font-size:13px')}>
          <Icon n={capOk ? 'ph-check-circle' : 'ph-warning'} style={sx(`font-size:20px;color:${capOk ? 'var(--color-accent)' : 'var(--color-accent-300)'}`)} />
          <span style={sx('text-wrap:pretty')}>{capOk ? `${cap} Slots für ${plural(nHouses, 'Haushalt', 'Haushalte')} – genug Auswahl.` : `Nur ${cap} Slots für ${plural(nHouses, 'Haushalt', 'Haushalte')}. Fenster verlängern oder hinzufügen.`}</span>
        </div>
      </>}

      {scr === 'route' && (!rt ? <div style={sx('padding:40px;color:var(--color-neutral-500);font-size:13px')}>Lädt …</div> : <>
        <div style={sx('padding:10px 22px 0;display:flex;align-items:flex-end;justify-content:space-between;gap:12px')}>
          <div>
            <div style={sx('font-size:12px;color:var(--color-neutral-500)')}>{rt.isToday ? 'Heute' : rt.label}{rt.streets.length ? ' · ' + rt.streets.join(', ') : ''}</div>
            <div style={sx('font-size:23px;font-weight:500;letter-spacing:-0.015em;line-height:1.2')}>Tagesroute</div>
          </div>
          {rt.started && <span className="tag tag-outline" style={sx('gap:6px;margin-bottom:4px')}><span style={sx('width:6px;height:6px;border-radius:50%;background:var(--color-accent)')} />Kunden sehen live</span>}
        </div>
        {rt.dates.length > 1 && <div style={sx('display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:14px 16px 0')}>
          {rt.dates.map(x => { const ch = chip(x.date === rt.date); return <button key={x.date} onClick={() => set({ routeDate: x.date })} style={sx(`flex:none;min-height:34px;padding:0 12px;border-radius:17px;border:1px solid ${ch.bd};background:${ch.bg};color:${ch.fg};font:inherit;font-size:13px;cursor:pointer`)}>{x.date === todayIso() ? 'Heute' : x.label}</button>; })}
        </div>}
        {!rt.stops.length && <div style={sx('margin:16px 16px 0;padding:16px;border-radius:var(--radius-lg);background:var(--color-surface);font-size:14px;color:var(--color-neutral-400)')}>Für diesen Tag sind keine Termine gebucht.</div>}
        {rt.stops.length > 0 && !rt.started && <div style={sx('margin:16px 16px 0;padding:16px;border-radius:var(--radius-lg);background:var(--color-surface);display:flex;flex-direction:column;gap:6px')}>
          <div style={sx('font-size:16px;font-weight:500')}>{plural(rt.stops.length, 'Termin', 'Termine')} · {rt.stops[0].t}–{rt.stops[rt.stops.length - 1].end}</div>
          <div style={sx('font-size:13px;color:var(--color-neutral-400);text-wrap:pretty')}>Mit dem Start sehen Ihre Kunden, wie viele Häuser Sie noch entfernt sind.</div>
          {act.error && <ErrorLine text={act.error} />}
          <button className="btn btn-primary" disabled={!canStart || act.busy} onClick={() => act.run(async () => { await api('/api/sweep/route/start', { body: { date: rt.date } }); route.reload(); })} style={sx('min-height:46px;margin-top:8px')}><Icon n="ph-play" />Route starten</button>
          {!canStart && <div style={sx('font-size:12px;color:var(--color-neutral-500)')}>Starten können Sie am Termintag.</div>}
        </div>}
        {rt.started && !cur && rt.stops.length > 0 && <div style={sx('margin:16px 16px 0;padding:16px;border-radius:var(--radius-lg);background:var(--color-surface);box-shadow:0 0 0 1px var(--color-accent-700);display:flex;flex-direction:column;gap:4px')}>
          <span className="card-kicker">Route abgeschlossen</span>
          <div style={sx('font-size:20px;font-weight:500')}>{nDone} erledigt · {nMiss} nicht angetroffen</div>
        </div>}
        <div style={sx('display:flex;flex-direction:column;padding:18px 16px 20px')}>
          {rt.stops.map(p => {
            const isCur = cur && cur.id === p.id, done = p.visit === 'done', missed = p.visit === 'missed';
            const status = done ? 'erledigt' : missed ? 'niemand da · benachrichtigt' : p.src === 'phone' ? 'telefonisch' : '';
            const visit = result => act.run(async () => { await api('/api/sweep/visit', { body: { bookingId: p.id, result } }); route.reload(); });
            return (
              <div key={p.id} style={sx('display:grid;grid-template-columns:48px 22px minmax(0, 1fr);column-gap:10px')}>
                <div style={sx(`font-size:13px;font-variant-numeric:tabular-nums;color:${isCur ? 'var(--color-accent)' : done || missed ? 'var(--color-neutral-600)' : 'var(--color-neutral-400)'};padding-top:13px;text-align:right`)}>{p.t}</div>
                <div style={sx('position:relative;display:flex;justify-content:center')}>
                  <div style={sx('position:absolute;top:0;bottom:0;width:1px;background:var(--color-neutral-800)')} />
                  <div style={sx(`position:relative;margin-top:16px;width:${isCur ? '14px' : '12px'};height:${isCur ? '14px' : '12px'};border-radius:50%;background:${isCur ? 'var(--color-accent)' : done ? 'var(--color-neutral-500)' : 'var(--color-bg)'};box-shadow:${isCur ? '0 0 0 4px var(--color-accent-900), 0 0 14px var(--color-accent)' : missed ? '0 0 0 1.5px var(--color-accent-300)' : done ? 'none' : '0 0 0 1.5px var(--color-neutral-600)'};display:grid;place-items:center;font-size:9px;color:var(--color-bg)`)}>{done && <Icon w="ph-bold" n="ph-check" />}</div>
                </div>
                <div style={sx('padding:6px 0')}>
                  <div style={sx(`padding:${isCur ? '12px 12px 12px 14px' : '8px 0'};border-radius:var(--radius-lg);background:${isCur ? 'var(--color-surface)' : 'transparent'};box-shadow:${isCur ? '0 0 0 1px var(--color-accent-700), 0 0 30px color-mix(in srgb, var(--color-accent) 16%, transparent)' : 'none'};display:flex;flex-direction:column;gap:2px`)}>
                    <div style={sx('display:flex;align-items:center;gap:8px')}>
                      <span style={sx(`font-size:15px;flex:1;color:${done || missed ? 'var(--color-neutral-500)' : 'var(--color-text)'}`)}>{rt.streets.length > 1 ? p.street + ' ' : 'Nr. '}{p.nr} · {p.name}</span>
                      {status && <span style={sx('font-size:11px;color:var(--color-neutral-500)')}>{status}</span>}
                    </div>
                    {p.key && <div style={sx('font-size:12px;color:var(--color-accent-300);display:flex;gap:5px;align-items:center')}><Icon n="ph-key" /><span>Schlüssel bei {p.key}</span></div>}
                    {isCur && <div style={sx('display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px')}>
                      <button className="btn btn-primary" disabled={act.busy} onClick={() => visit('done')} style={sx('min-height:44px')}><Icon n="ph-check" />Erledigt</button>
                      <button className="btn btn-secondary" disabled={act.busy} onClick={() => visit('missed')} style={sx('min-height:44px')}>Niemand da</button>
                    </div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>)}

      {scr === 'notify' && <>
        <div style={sx('padding:10px 22px 0')}><div style={sx('font-size:23px;font-weight:500;letter-spacing:-0.015em')}>Nachricht senden</div><div style={sx('font-size:12px;color:var(--color-neutral-500)')}>{mc ? `In der App und per E-Mail an Kunden der ${mc.street}` : 'An Ihre Kunden'}</div></div>
        {md && !md.campaigns.length && <div style={sx('margin:16px 16px 0;padding:16px;border-radius:var(--radius-lg);background:var(--color-surface);font-size:14px;color:var(--color-neutral-400);text-wrap:pretty')}>Sobald Sie Zeitfenster für eine Straße gesendet haben, können Sie hier den Haushalten schreiben.</div>}
        {mc && <div style={sx('padding:14px 16px 0;display:flex;flex-direction:column;gap:14px')}>
          {md.campaigns.length > 1 && <div className="field"><label>Straße</label><select className="input" value={mc.id} onChange={e => set({ msgCampaign: Number(e.target.value) })} style={sx('min-height:44px;font-size:15px;color-scheme:dark')}>{md.campaigns.map(x => <option key={x.id} value={x.id}>{x.street}</option>)}</select></div>}
          <div className="field"><label>An</label>
            <Seg stacked minH="44px" value={ui.rcpt} onChange={v => set({ rcpt: v })} options={[['all', 'Alle'], ['open', 'Offen'], ['route', 'Route heute']].map(x => ({ value: x[0], label: x[1], sub: plural(mc.n[x[0]], 'Haushalt', 'Haushalte') }))} />
          </div>
          <div className="field"><label>Vorlagen</label>
            <div style={sx('display:flex;flex-wrap:wrap;gap:6px')}>{templates.map(t => <button key={t.label} className="btn btn-secondary" onClick={() => set({ text: t.text })} style={sx('min-height:36px;font-size:13px;border-radius:18px;padding-inline:12px')}>{t.label}</button>)}</div>
          </div>
          <div className="field"><label>Nachricht</label><textarea className="input" value={ui.text} onChange={e => set({ text: e.target.value })} placeholder="Kurz und freundlich …" style={sx('min-height:96px;font-size:15px')} /></div>
          {act.error && <ErrorLine text={act.error} />}
          <button className="btn btn-primary" disabled={!ui.text.trim() || !rcptN || act.busy} onClick={() => act.run(async () => { await api('/api/sweep/messages', { body: { campaignId: mc.id, rcpt: ui.rcpt, text: ui.text.trim() } }); set({ text: '' }); msgs.reload(); })} style={sx('min-height:48px')}><Icon n="ph-paper-plane-tilt" />An {plural(rcptN, 'Haushalt', 'Haushalte')} senden</button>
        </div>}
        {md && md.sent.length > 0 && <>
          <SectionLabel pad="24px 22px 8px">Gesendet</SectionLabel>
          <div style={sx('display:flex;flex-direction:column;gap:8px;padding:0 16px 20px')}>
            {md.sent.map(m => (
              <div key={m.id} style={sx('padding:12px 14px;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:4px')}>
                <div style={sx('font-size:14px;text-wrap:pretty')}>{m.text}</div>
                <div style={sx('font-size:11px;color:var(--color-neutral-500)')}>{fmtAt(m.at)} · an {plural(m.n, 'Haushalt', 'Haushalte')}{m.street && md.campaigns.length > 1 ? ' · ' + m.street : ''}</div>
              </div>
            ))}
          </div>
        </>}
      </>}
    </Shell>
  );
}

function DayStrip({ days: list, value, onPick }) {
  // Monatsname über dem ersten Tag eines Monats, damit bei 8 Wochen Auswahl klar bleibt, welcher Monat gemeint ist
  const ref = useRef(null);
  // Gewählten Tag sichtbar machen (auch nach Auswahl im Kalender)
  useEffect(() => {
    const el = ref.current?.querySelector('[aria-pressed="true"]');
    if (el) ref.current.scrollTo({ left: el.offsetLeft - ref.current.clientWidth / 2 + el.clientWidth / 2 });
  }, [value]);
  return (
    <div ref={ref} style={sx('display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -12px 0 -14px;padding:0 12px 0 14px;position:relative')}>
      {list.map((x, i) => { const ch = chip(x.iso === value); const newMonth = i === 0 || list[i - 1].m !== x.m; return (
        <button key={x.iso} onClick={() => onPick(x.iso)} aria-label={dayLabel(x.iso)} aria-pressed={x.iso === value} style={sx(`flex:none;width:44px;min-height:52px;padding:6px 0;border-radius:var(--radius-md);border:1px solid ${ch.bd};background:${ch.bg};color:${ch.fg};display:flex;flex-direction:column;align-items:center;justify-content:center;font:inherit;cursor:pointer;line-height:1.15;position:relative`)}>
          <span style={sx('font-size:11px;opacity:.75')}>{newMonth ? x.m : x.wd}</span><span style={sx('font-size:16px;font-weight:500;font-variant-numeric:tabular-nums')}>{x.d}</span>
        </button>
      ); })}
    </div>
  );
}
