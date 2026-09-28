(function () {
  if (window.KF) return;
  const LS = 'kf-proto-v2';
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'], MON = ['Jan', 'Feb', 'März', 'Apr', 'Mai', 'Juni', 'Juli', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const parse = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const iso = dt => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  const dayLabel = i => { const d = parse(i); return WD[d.getDay()] + ', ' + d.getDate() + '. ' + MON[d.getMonth()]; };
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fmt = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const now = () => 'Heute · ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  function seed() {
    const houses = [
      { nr: '1', name: 'Berger', phone: '0761 44 71 20', status: 'booked', w: 'w1', t: '08:00' },
      { nr: '2', name: 'Yılmaz', phone: '0761 38 90 12', status: 'booked', w: 'w1', t: '08:30' },
      { nr: '3', name: 'Hoffmann', phone: '0761 20 55 83', status: 'booked', w: 'w1', t: '09:30', key: 'Fam. Schulz, Nr. 5' },
      { nr: '4', name: 'Novak', phone: '0761 71 02 46', status: 'open' },
      { nr: '5', name: 'Schulz', phone: '0761 55 13 07', status: 'booked', w: 'w1', t: '10:00' },
      { nr: '6', name: 'Wagner', phone: '0761 29 48 61', status: 'booked', w: 'w2', t: '13:00' },
      { nr: '7', name: 'Keller', phone: '0761 66 30 94', status: 'open' },
      { nr: '8', name: 'Richter', phone: '0761 90 17 35', status: 'booked', w: 'w2', t: '14:00' },
      { nr: '9', name: 'Lang', phone: '0761 12 84 59', status: 'open' },
      { nr: '10', name: 'Krüger', phone: '0761 47 26 03', status: 'booked', w: 'w3', t: '09:00' },
      { nr: '11', name: 'Meier', phone: '0761 83 65 18', status: 'cancelled' },
      { nr: '12', name: 'Fischer', phone: '0761 31 09 77', status: 'booked', w: 'w1', t: '11:00' }
    ];
    return {
      street: 'Lindenstraße', me: '7', slotLen: 30, deadline: 'Fr, 9. Okt',
      windows: [
        { id: 'w1', date: '2026-10-13', label: 'Di, 13. Okt', start: '08:00', end: '12:00' },
        { id: 'w2', date: '2026-10-14', label: 'Mi, 14. Okt', start: '13:00', end: '17:00' },
        { id: 'w3', date: '2026-10-17', label: 'Sa, 17. Okt', start: '09:00', end: '12:00' }
      ],
      ahorn: null,
      houses,
      reminders: { eve: true, hour: true },
      routeStarted: false,
      messages: [{ id: 1, time: 'Mo, 28. Sep · 09:12', to: houses.map(h => h.nr),
        text: 'Guten Tag! Im Oktober komme ich zur Feuerstättenschau in die Lindenstraße. Bitte wählen Sie bis Fr, 9. Okt eine halbe Stunde, in der jemand zu Hause ist.' }],
      read: [], seq: 1,
      admin: { mb: 'pending', jw: 'pending', tr: 'query', so: 'pending', pn: 'pending' }, rejectReason: '',
      adminLog: [
        { t: 'Gestern · 16:40', what: 'Sabine Roth · Freiburg 9 freigegeben', note: 'Urkunde und Ausweis gelöscht' },
        { t: 'Mo · 11:05', what: 'Anfrage Lindenhofweg 3 abgelehnt', note: 'Kein Eintrag im Kehrbuch · keine Dokumente gespeichert' }
      ]
    };
  }

  function preset(name) {
    const s = seed();
    const me = s.houses.find(h => h.nr === s.me);
    const book = () => Object.assign(me, { status: 'booked', w: 'w1', t: '09:00' });
    if (name === 'booked') { book(); s.read = [1]; }
    if (name === 'key') { book(); me.key = 'Fam. Schulz, Nr. 5'; s.read = [1]; }
    if (name === 'live' || name === 'route') { book(); s.read = [1]; s.routeStarted = true; }
    if (name === 'route') s.houses[0].visit = 'done';
    if (name === 'missed') {
      book(); s.read = [1]; s.routeStarted = true; ['1', '2'].forEach(n => s.houses.find(h => h.nr === n).visit = 'done'); me.visit = 'missed';
      s.seq = 2; s.messages.push({ id: 2, time: 'Heute · 09:07', to: ['7'], text: 'Ich war um 09:00 Uhr bei Ihnen, leider hat niemand geöffnet. Bitte wählen Sie in der App eine neue Zeit.' });
    }
    if (name === 'tenant') s.admin.so = 'asked';
    if (name === 'cancelled') { s.read = [1]; me.status = 'cancelled'; }
    return s;
  }

  function create(init, persist) {
    let state = init; const ls = new Set();
    const emit = () => { if (persist) try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) {} ls.forEach(f => f()); };
    return {
      get: () => state,
      set(p) { state = Object.assign({}, state, typeof p === 'function' ? p(state) : p); emit(); },
      house(nr, patch) { this.set(s => ({ houses: s.houses.map(h => h.nr === nr ? Object.assign({}, h, patch) : h) })); },
      msg(text, to) { this.set(s => ({ seq: s.seq + 1, messages: s.messages.concat([{ id: s.seq + 1, time: now(), text, to }]) })); },
      sub(f) { ls.add(f); return () => ls.delete(f); },
      reset() { state = seed(); emit(); }
    };
  }

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LS)); } catch (e) {}

  const h = {
    toMin, fmt, dayLabel,
    addDays: (i, n) => { const d = parse(i); d.setDate(d.getDate() + n); return iso(d); },
    days(from, to) { const out = []; for (let d = parse(from); d <= parse(to); d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) out.push({ iso: iso(d), wd: WD[d.getDay()], d: d.getDate() }); return out; },
    me: s => s.houses.find(x => x.nr === s.me),
    win: (s, id) => s.windows.find(w => w.id === id),
    end: (t, len) => fmt(toMin(t) + len),
    slots(w, len) { const out = []; for (let m = toMin(w.start); m + len <= toMin(w.end); m += len) out.push(fmt(m)); return out; },
    taken: (s, wid, t, except) => s.houses.find(x => x.status === 'booked' && x.w === wid && x.t === t && x.nr !== except),
    free(s, wid, except) { const w = h.win(s, wid); return w ? h.slots(w, s.slotLen).filter(t => !h.taken(s, wid, t, except)).length : 0; },
    route: s => s.houses.filter(x => x.status === 'booked' && x.w === s.windows[0].id).sort((a, b) => toMin(a.t) - toMin(b.t)),
    current(s) { return h.route(s).find(x => !x.visit); },
    counts(s) {
      const c = { booked: 0, open: 0, cancelled: 0 };
      s.houses.forEach(x => { if (x.status === 'booked') c.booked++; else if (x.status === 'cancelled') c.cancelled++; else c.open++; });
      return c;
    },
    short: label => { const [d, rest] = label.split(', '); return { day: d, date: rest || '' }; },
    longDay: label => ({ Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag', Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag' })[label.split(',')[0]] || label.split(',')[0]
  };

  window.KF = { seed, preset, create, h, shared: create(saved && saved.houses ? Object.assign(seed(), saved) : seed(), true) };
})();
