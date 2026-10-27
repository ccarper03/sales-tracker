/* Sales Tracker: each rep's numbers stay on their own phone. Nothing is sent anywhere. */
(() => {
'use strict';

const KEY = 'salesTracker.v1';
const app = document.getElementById('app');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => '$' + Math.round(v).toLocaleString('en-US');
const pct = (v) => (isFinite(v) ? Math.round(v * 100) + '%' : '—');
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayIso = () => iso(new Date());
const monthKey = (s) => s.slice(0, 7);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* What gets logged. Same categories as the objections in the appointment guide's talk track. */
const COUNTERS = [
  ['act', 'Activities', 'Calls, texts, emails'],
  ['set', 'Appointments set', 'Booked for any day'],
  ['noshow', 'No-shows', ''],
  ['resched', 'Reschedules', ''],
  ['cancel', 'Appointment cancels', ''],
  ['held', 'Appointments held', 'They showed up'],
  ['walk', 'Walk-ins', 'Unscheduled visits']
];
const SALES = [['first', 'Sales: first visit', 'Deposit on visit one'], ['beback', 'Sales: be-back', 'Deposit on a return visit']];
const OBJ = [
  ['think', 'Think about it'], ['partner', 'Partner'], ['moneyL', 'Money: logistics'], ['moneyF', 'Money: fear'],
  ['sell', 'Sell first'], ['timing', 'Timing / rates'], ['shop', 'Shopping around'], ['value', 'Value']
];

/* ---------- storage ---------- */
const blank = () => ({ v: 1, name: '', settings: { presale: null, spec: null, floor: 50, goal: 4 }, goals: {}, days: {}, lastExport: '' });
let DB = load();
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw); return Object.assign(blank(), d, { settings: Object.assign(blank().settings, d.settings || {}) }); } } catch (e) { /* storage blocked */ }
  return blank();
}
let warned = false;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(DB)); }
  catch (e) { if (!warned) { warned = true; toast('This browser isn’t saving. Export your numbers before closing.'); } }
  if (navigator.storage && navigator.storage.persist && !save.asked) { save.asked = true; navigator.storage.persist().catch(() => {}); }
}
const day = (d) => {
  if (!DB.days[d]) DB.days[d] = { c: {}, sales: [], o: {}, none: 0 };
  const x = DB.days[d]; x.c = x.c || {}; x.sales = x.sales || []; x.o = x.o || {}; x.none = x.none || 0; return x;
};
const peek = (d) => DB.days[d] || { c: {}, sales: [], o: {}, none: 0 };

/* ---------- state ---------- */
const S = { tab: 'log', date: todayIso(), month: monthKey(todayIso()), sheet: null, eraseArm: false };

/* ---------- math ---------- */
function monthDays(mk) { return Object.keys(DB.days).filter((d) => d.startsWith(mk)).sort(); }
function totals(days) {
  const t = { c: {}, first: 0, beback: 0, o: {}, none: 0, sales: [] };
  COUNTERS.forEach(([k]) => { t.c[k] = 0; });
  OBJ.forEach(([k]) => { t.o[k] = [0, 0]; });
  days.forEach((d) => {
    const x = peek(d);
    COUNTERS.forEach(([k]) => { t.c[k] += x.c[k] || 0; });
    (x.sales || []).forEach((s) => { t[s.type]++; t.sales.push(Object.assign({ date: d }, s)); });
    OBJ.forEach(([k]) => { const v = x.o[k] || [0, 0]; t.o[k][0] += v[0]; t.o[k][1] += v[1]; });
    t.none += x.none || 0;
  });
  t.salesN = t.first + t.beback;
  t.visits = t.c.held + t.c.walk;
  return t;
}
function weekRange(dIso) {
  const d = parseIso(dIso), off = (d.getDay() + 6) % 7; // Monday start
  const start = new Date(d); start.setDate(d.getDate() - off);
  const out = []; for (let i = 0; i < 7; i++) { const x = new Date(start); x.setDate(start.getDate() + i); out.push(iso(x)); }
  return out;
}
const commission = (s) => (s.price ? s.price * (Number(s.kind === 'spec' ? DB.settings.spec : DB.settings.presale) || 0) / 100 : 0);
const ratesSet = () => DB.settings.presale != null && DB.settings.spec != null;

/* ---------- ui helpers ---------- */
function toast(msg, undo) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Undo</button>' : ''}`;
  if (undo) t.querySelector('button').addEventListener('click', () => { undo(); t.remove(); });
  document.body.appendChild(t); setTimeout(() => t.remove(), undo ? 4500 : 2800);
}
const dateLabel = (d) => { const t = todayIso(); if (d === t) return 'Today'; const y = new Date(); y.setDate(y.getDate() - 1); if (d === iso(y)) return 'Yesterday'; const x = parseIso(d); return `${DOW[x.getDay()]} ${x.getMonth() + 1}/${x.getDate()}`; };
const monthLabel = (mk) => { const [y, m] = mk.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const step = (a, k, v, min = 0) => `<div class="step"><button type="button" data-a="${a}" data-k="${k}" data-d="-1" aria-label="Minus one" ${v <= min ? 'disabled' : ''}>−</button><output aria-live="polite">${v}</output><button type="button" class="plus" data-a="${a}" data-k="${k}" data-d="1" aria-label="Plus one">+</button></div>`;
const ICON = {
  log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  month: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>'
};

/* ---------- views ---------- */
function render() {
  const head = `<header class="top"><div class="who"><div class="sub">${esc(DB.name || 'Sales tracker')}</div><div class="title">${S.tab === 'log' ? 'Log' : S.tab === 'month' ? monthLabel(S.month) : 'Settings'}</div></div>
    ${S.tab === 'log' ? `<div class="datebar"><button class="btn icon" data-a="day" data-d="-1" aria-label="Previous day">‹</button><span class="d">${dateLabel(S.date)}</span><button class="btn icon" data-a="day" data-d="1" aria-label="Next day" ${S.date >= todayIso() ? 'disabled' : ''}>›</button></div>` : ''}
    ${S.tab === 'month' ? `<div class="datebar"><button class="btn icon" data-a="mon" data-d="-1" aria-label="Previous month">‹</button><button class="btn icon" data-a="mon" data-d="1" aria-label="Next month" ${S.month >= monthKey(todayIso()) ? 'disabled' : ''}>›</button></div>` : ''}</header>`;
  const body = S.tab === 'log' ? viewLog() : S.tab === 'month' ? viewMonth() : viewMore();
  const tabs = `<nav class="tabs" aria-label="Sections">${[['log', 'Log'], ['month', 'Month'], ['more', 'Settings']].map(([k, t]) => `<a href="#${k}" class="${S.tab === k ? 'on' : ''}" ${S.tab === k ? 'aria-current="page"' : ''}>${ICON[k]}${t}</a>`).join('')}</nav>`;
  app.innerHTML = head + `<main class="wrap">${body}</main>` + tabs + (S.sheet ? sheet() : '');
  if (S.sheet) { const f = document.getElementById('sp'); if (f) setTimeout(() => f.focus(), 50); }
}

function viewLog() {
  const x = peek(S.date);
  const ctrs = COUNTERS.map(([k, t, s]) => `<div class="ctr"><div><div class="t">${t}</div>${s ? `<div class="s">${s}</div>` : ''}</div>${step('c', k, x.c[k] || 0)}</div>`).join('');
  const sales = SALES.map(([k, t, s]) => { const n = (x.sales || []).filter((y) => y.type === k).length; return `<div class="ctr"><div><div class="t">${t}</div><div class="s">${s}</div></div>${step('sale', k, n)}</div>`; }).join('');
  const objs = OBJ.map(([k, t]) => { const v = x.o[k] || [0, 0]; return `<div class="obj"><span class="t">${t}</span><button type="button" class="tap f" data-a="obj" data-k="${k}" data-i="0" aria-label="${t}: faced, now ${v[0]}">${v[0]}</button><button type="button" class="tap b" data-a="obj" data-k="${k}" data-i="1" aria-label="${t}: beat, now ${v[1]}">${v[1]}</button><span class="r small muted">${v[0] ? pct(v[1] / v[0]) : ''}</span></div>`; }).join('');
  const wk = weekRange(S.date), act = wk.reduce((a, d) => a + (peek(d).c.act || 0), 0), floor = DB.settings.floor;
  return `<section class="card" aria-labelledby="h-log"><div class="head"><div class="grow"><h2 id="h-log">${S.date === todayIso() ? 'Log today' : 'Log ' + dateLabel(S.date)}</h2><p class="hint">Tap after each one. Ten seconds.</p></div></div>${ctrs}${sales}</section>
  <section class="card" aria-labelledby="h-obj"><div class="head"><div class="grow"><h2 id="h-obj">Objections</h2><p class="hint">Tap Faced when it comes up. Tap Beat when you work through it.</p></div></div>
    <div class="obj hdr"><span></span><span>FACED</span><span>BEAT</span><span></span></div>${objs}
    <div class="ctr"><div><div class="t">Sale with no objection</div></div>${step('none', 'none', x.none || 0)}</div></section>
  <section class="card"><div class="need" style="border-top:0;padding-top:0"><span>Activities this week</span><span class="v">${act} / ${floor}</span></div><div class="bar" aria-hidden="true"><i style="width:${Math.min(100, Math.round(100 * act / floor))}%"></i></div></section>`;
}

function viewMonth() {
  const mk = S.month, t = totals(monthDays(mk)), set = DB.settings;
  const show = t.c.set ? t.c.held / t.c.set : NaN, close = t.visits ? t.salesN / t.visits : NaN;
  const comm = t.sales.reduce((a, s) => a + commission(s), 0), noPrice = t.sales.filter((s) => !s.price).length;
  const kpis = [
    ['Show-up rate', pct(show), `${t.c.held} held of ${t.c.set} set`],
    ['Close rate', pct(close), `${t.salesN} sale${t.salesN === 1 ? '' : 's'} from ${t.visits} visit${t.visits === 1 ? '' : 's'}`],
    ['Sales', String(t.salesN), `${t.first} first visit · ${t.beback} be-back`],
    ['Est. commission', !ratesSet() ? '—' : t.sales.length ? money(comm) : '$0', !ratesSet() ? 'Add your commission rates in Settings' : `${set.presale}% presale · ${set.spec}% spec, paid at closing${noPrice ? ` · ${noPrice} without a price` : ''}`]
  ].map(([a, b, c]) => `<div class="kpi"><div class="t">${a}</div><div class="v">${b}</div><div class="s">${esc(c)}</div></div>`).join('');

  const goal = DB.goals[mk] != null ? DB.goals[mk] : set.goal;
  const isNow = mk === monthKey(todayIso());
  const left = Math.max(0, goal - t.salesN);
  let need = '';
  if (left === 0) need = `<div class="need"><span>Goal hit. Raise it?</span><span class="v">${t.salesN} / ${goal}</span></div>`;
  else if (!isFinite(close) || close === 0 || !isFinite(show) || show === 0) need = `<div class="need"><span class="muted">Log a few appointments and visits to see what it takes.</span></div>`;
  else {
    const visits = Math.ceil(left / close);
    let walkLeft = 0, walkNote = '';
    if (isNow) {
      const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), elapsed = now.getDate(), daysLeft = dim - elapsed;
      walkLeft = Math.round((t.c.walk / elapsed) * daysLeft); walkNote = ` less about ${walkLeft} more walk-in${walkLeft === 1 ? '' : 's'}`;
    }
    const appts = Math.max(0, Math.ceil((visits - walkLeft) / show));
    need = `<div class="need"><span>Sales still needed</span><span class="v">${left}</span></div>
      <div class="need"><span>Visits needed at your ${pct(close)} close rate</span><span class="v">${visits}</span></div>
      <div class="need"><span>Appointments to set at your ${pct(show)} show-up rate${walkNote}</span><span class="v">${appts}</span></div>`;
  }
  const wk = weekRange(isNow ? todayIso() : monthDays(mk).slice(-1)[0] || mk + '-01');
  const act = wk.reduce((a, d) => a + (peek(d).c.act || 0), 0);

  const rows = OBJ.map(([k, n]) => { const v = t.o[k]; return `<div class="obj"><span class="t">${n}</span><span class="r" style="text-align:center">${v[0]}</span><span class="r" style="text-align:center">${v[1]}</span><span class="r">${v[0] ? pct(v[1] / v[0]) : '—'}</span></div>`; }).join('');
  const faced = OBJ.reduce((a, [k]) => a + t.o[k][0], 0), beat = OBJ.reduce((a, [k]) => a + t.o[k][1], 0);
  const salesList = t.sales.length ? t.sales.map((s) => `<div class="sale"><span class="pill">${s.type === 'first' ? 'First visit' : 'Be-back'}</span><span class="grow">${dateLabel(s.date)}${s.kind ? ' · ' + (s.kind === 'spec' ? 'Spec' : 'Presale') : ''}</span><b>${s.price ? money(s.price) : '<span class="muted small">no price</span>'}</b><button type="button" class="btn icon" data-a="editsale" data-date="${s.date}" data-id="${s.id}" aria-label="Edit this sale">✎</button></div>`).join('') : '<div class="empty">No sales logged this month yet.</div>';

  return `<div class="kpis">${kpis}</div>
  <section class="card" aria-labelledby="h-goal"><div class="head"><div class="grow"><h2 id="h-goal">Goal math</h2><p class="hint">Change one number, see what it takes.</p></div></div>
    <div class="ctr" style="border-top:0"><div class="t">Sales goal this month</div>${step('goal', 'goal', goal, 1)}</div>${need}
    ${isNow ? `<div class="need"><span>Activities this week</span><span class="v">${act} / ${set.floor}</span></div>` : ''}</section>
  <section class="card" aria-labelledby="h-om"><div class="head"><div class="grow"><h2 id="h-om">Objections this month</h2><p class="hint">${faced ? `${beat} beat of ${faced} faced · ${pct(beat / faced)}` : 'Nothing logged yet.'}${t.none ? ` · ${t.none} sale${t.none === 1 ? '' : 's'} with no objection` : ''}</p></div></div>
    <div class="obj hdr"><span></span><span>FACED</span><span>BEAT</span><span style="text-align:right">RATE</span></div>${rows}</section>
  <section class="card" aria-labelledby="h-sales"><div class="head"><div class="grow"><h2 id="h-sales">Sales</h2><p class="hint">Add the price to count commission.</p></div></div>${salesList}</section>
  <section class="card" aria-labelledby="h-tot"><h2 id="h-tot">Month totals</h2><div class="tot">${COUNTERS.map(([k, n]) => `<span>${n}</span><b>${t.c[k]}</b>`).join('')}</div></section>`;
}

function viewMore() {
  const s = DB.settings, n = Object.keys(DB.days).length;
  return `<section class="card" style="display:flex;flex-direction:column;gap:12px"><h2>You</h2>
    <label class="f">Your name<input id="m_name" value="${esc(DB.name)}" autocomplete="name" placeholder="Shown at the top and on exports"></label>
    <div class="row"><label class="f">Presale commission %<input id="m_pre" type="number" step="0.01" inputmode="decimal" value="${s.presale ?? ''}" placeholder="Your %"></label><label class="f">Spec commission %<input id="m_spec" type="number" step="0.01" inputmode="decimal" value="${s.spec ?? ''}" placeholder="Your %"></label></div>
    <div class="row"><label class="f">Weekly activity floor<input id="m_floor" type="number" inputmode="numeric" value="${s.floor}"></label><label class="f">Default monthly sales goal<input id="m_goal" type="number" inputmode="numeric" value="${s.goal}"></label></div>
    <button class="btn primary" data-a="savesettings">Save</button></section>
  <section class="card" style="display:flex;flex-direction:column;gap:10px"><h2>Your numbers</h2>
    <p class="hint">They live on this phone only. Nobody else can see them, and they don’t sync. Export a copy now and then, and before you switch phones or clear your browser.</p>
    <div class="row"><button class="btn primary" data-a="export">Export CSV</button><label class="btn" style="position:relative;overflow:hidden">Import CSV<input type="file" id="m_imp" accept=".csv,text/csv" style="position:absolute;inset:0;opacity:0"></label></div>
    <p class="small muted" style="margin:0">${n} day${n === 1 ? '' : 's'} logged${DB.lastExport ? ` · last export ${esc(DB.lastExport)}` : ' · never exported'}</p></section>
  <section class="card" style="display:flex;flex-direction:column;gap:10px"><h2>Install</h2>
    <p class="hint">iPhone: tap Share, then Add to Home Screen. It opens like an app and works without signal.</p></section>
  <section class="card" style="display:flex;flex-direction:column;gap:10px"><h2>Start over</h2>
    <button class="btn" data-a="erase" style="color:var(--red)">${S.eraseArm ? 'Tap again to erase everything' : 'Erase all my numbers'}</button></section>`;
}

/* sale sheet: price and type, both optional */
function sheet() {
  const sh = S.sheet;
  return `<div class="scrim" data-a="sheetclose"><form class="sheet" id="saleform" role="dialog" aria-modal="true" aria-labelledby="sh-h">
    <h3 id="sh-h">${sh.edit ? 'Edit sale' : sh.type === 'first' ? 'Sale on a first visit' : 'Sale on a be-back'}</h3>
    <label class="f">Price (optional)<input id="sp" type="number" inputmode="numeric" placeholder="e.g. 449990" value="${sh.price || ''}"></label>
    <div class="seg" role="group" aria-label="Home type"><button type="button" data-a="kind" data-k="presale" class="${sh.kind === 'presale' ? 'on' : ''}">Presale</button><button type="button" data-a="kind" data-k="spec" class="${sh.kind === 'spec' ? 'on' : ''}">Spec</button></div>
    ${sh.edit ? `<div class="seg" role="group" aria-label="Visit"><button type="button" data-a="stype" data-k="first" class="${sh.type === 'first' ? 'on' : ''}">First visit</button><button type="button" data-a="stype" data-k="beback" class="${sh.type === 'beback' ? 'on' : ''}">Be-back</button></div>` : ''}
    <div class="row"><button class="btn primary" type="submit">${sh.edit ? 'Save' : 'Log sale'}</button>${sh.edit ? '<button class="btn" type="button" data-a="delsale" style="color:var(--red)">Delete</button>' : '<button class="btn" type="button" data-a="sheetclose">Cancel</button>'}</div>
  </form></div>`;
}

/* ---------- actions ---------- */
const objName = (k) => (OBJ.find((o) => o[0] === k) || [k, k])[1];
const A = {
  c: (t) => {
    const k = t.dataset.k, d = +t.dataset.d, x = day(S.date), before = x.c[k] || 0;
    x.c[k] = Math.max(0, before + d); save(); render();
    if (d > 0) { const n = COUNTERS.find((c) => c[0] === k)[1]; toast(`${n} +1`, () => { day(S.date).c[k] = before; save(); render(); }); }
  },
  sale: (t) => {
    const k = t.dataset.k, x = day(S.date);
    if (+t.dataset.d > 0) { S.sheet = { type: k, kind: 'presale', price: '' }; render(); return; }
    const i = x.sales.map((s) => s.type).lastIndexOf(k); if (i < 0) return;
    const [gone] = x.sales.splice(i, 1); save(); render();
    toast('Sale removed', () => { day(S.date).sales.splice(i, 0, gone); save(); render(); });
  },
  obj: (t) => {
    const k = t.dataset.k, i = +t.dataset.i, x = day(S.date), v = (x.o[k] || [0, 0]).slice();
    v[i]++; if (i === 1 && v[0] < v[1]) v[0] = v[1]; // beating one means you faced it
    const prev = (x.o[k] || [0, 0]).slice(); x.o[k] = v; save(); render();
    toast(`${objName(k)}: ${i ? 'beat' : 'faced'}`, () => { day(S.date).o[k] = prev; save(); render(); });
  },
  none: (t) => { const x = day(S.date); x.none = Math.max(0, (x.none || 0) + (+t.dataset.d)); save(); render(); },
  goal: (t) => { const g = DB.goals[S.month] != null ? DB.goals[S.month] : DB.settings.goal; DB.goals[S.month] = Math.max(1, g + (+t.dataset.d)); save(); render(); },
  day: (t) => { const d = parseIso(S.date); d.setDate(d.getDate() + (+t.dataset.d)); const n = iso(d); if (n <= todayIso()) { S.date = n; render(); } },
  mon: (t) => { const [y, m] = S.month.split('-').map(Number); const d = new Date(y, m - 1 + (+t.dataset.d), 1); const k = iso(d).slice(0, 7); if (k <= monthKey(todayIso())) { S.month = k; render(); } },
  kind: (t) => { S.sheet.price = document.getElementById('sp').value; S.sheet.kind = t.dataset.k; render(); },
  stype: (t) => { S.sheet.price = document.getElementById('sp').value; S.sheet.type = t.dataset.k; render(); },
  sheetclose: (t, e) => { if (e && e.target !== t) return; S.sheet = null; render(); },
  editsale: (t) => { const x = day(t.dataset.date), s = x.sales.find((y) => String(y.id) === t.dataset.id); if (!s) return; S.sheet = { edit: true, date: t.dataset.date, id: s.id, type: s.type, kind: s.kind || 'presale', price: s.price || '' }; render(); },
  delsale: () => { const sh = S.sheet, x = day(sh.date), i = x.sales.findIndex((y) => y.id === sh.id); if (i >= 0) { const [gone] = x.sales.splice(i, 1); save(); S.sheet = null; render(); toast('Sale deleted', () => { day(sh.date).sales.splice(i, 0, gone); save(); render(); }); } },
  savesettings: () => {
    const num = (id, dflt) => { const v = parseFloat(document.getElementById(id).value); return isFinite(v) && v >= 0 ? v : dflt; };
    DB.name = document.getElementById('m_name').value.trim();
    DB.settings = { presale: num('m_pre', null), spec: num('m_spec', null), floor: Math.max(1, Math.round(num('m_floor', 50))), goal: Math.max(1, Math.round(num('m_goal', 4))) };
    save(); render(); toast('Saved');
  },
  export: () => exportCSV(),
  erase: () => {
    if (!S.eraseArm) { S.eraseArm = true; render(); setTimeout(() => { if (S.eraseArm) { S.eraseArm = false; if (S.tab === 'more') render(); } }, 4000); return; }
    S.eraseArm = false; const keep = { name: DB.name, settings: DB.settings }; DB = Object.assign(blank(), keep); save(); render(); toast('Numbers erased');
  }
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-a]');
  if (!t || !A[t.dataset.a] || t.disabled) return;
  if (t.dataset.a === 'sheetclose' && t.classList.contains('scrim') && e.target !== t) return;
  e.preventDefault();
  A[t.dataset.a](t, e);
});
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'saleform') return;
  e.preventDefault();
  const sh = S.sheet, price = Math.round(parseFloat(document.getElementById('sp').value)) || 0;
  if (sh.edit) { const s = day(sh.date).sales.find((y) => y.id === sh.id); if (s) { s.price = price; s.kind = sh.kind; s.type = sh.type; } save(); S.sheet = null; render(); toast('Sale saved'); return; }
  const x = day(S.date), sale = { id: Date.now(), type: sh.type, kind: sh.kind, price };
  x.sales.push(sale); save(); S.sheet = null; render();
  toast(price ? `Sale logged · ${money(price)}` : 'Sale logged', () => { const d = day(S.date); d.sales = d.sales.filter((y) => y.id !== sale.id); save(); render(); });
});
document.addEventListener('change', (e) => { if (e.target.id === 'm_imp') importCSV(e.target); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sheet) { S.sheet = null; render(); } });

function route() { const h = location.hash.replace('#', ''); S.tab = ['log', 'month', 'more'].includes(h) ? h : 'log'; S.eraseArm = false; S.sheet = null; render(); window.scrollTo(0, 0); }
window.addEventListener('hashchange', route);
/* a phone left open overnight should log to the new day */
document.addEventListener('visibilitychange', () => { if (document.hidden) return; const t = todayIso(); if (t !== S._today) { if (S.date === S._today) S.date = t; S.month = monthKey(t); S._today = t; render(); } });

/* ---------- CSV ---------- */
const COLS = ['date'].concat(COUNTERS.map((c) => c[0]), ['sales_first_visit', 'sales_be_back', 'sale_details', 'no_objection_sales'], OBJ.flatMap(([k]) => [k + '_faced', k + '_beat']));
const HEAD = ['Date'].concat(COUNTERS.map((c) => c[1]), ['Sales: first visit', 'Sales: be-back', 'Sale details (type|presale or spec|price)', 'Sales with no objection'], OBJ.flatMap(([, n]) => [n + ' faced', n + ' beat']));
const q = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function exportCSV() {
  const lines = [HEAD.map(q).join(','), COLS.join(',')];
  Object.keys(DB.days).sort().forEach((d) => {
    const x = peek(d);
    const row = [d].concat(COUNTERS.map(([k]) => x.c[k] || 0), [x.sales.filter((s) => s.type === 'first').length, x.sales.filter((s) => s.type === 'beback').length,
      x.sales.map((s) => [s.type, s.kind || '', s.price || ''].join('|')).join(';'), x.none || 0], OBJ.flatMap(([k]) => (x.o[k] || [0, 0])));
    lines.push(row.map(q).join(','));
  });
  const name = `Sales Tracker${DB.name ? ' - ' + DB.name.replace(/[\\/:*?"<>|]+/g, '') : ''} - ${todayIso()}.csv`;
  const file = new File([lines.join('\n') + '\n'], name, { type: 'text/csv' });
  const done = () => { DB.lastExport = new Date().toLocaleDateString('en-US'); save(); if (S.tab === 'more') render(); };
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: name }).then(done).catch((err) => { if (!err || err.name !== 'AbortError') download(file, name, done); });
  } else download(file, name, done);
}
function download(file, name, done) {
  const url = URL.createObjectURL(file), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  done(); toast('Exported ' + name);
}
function parseCSV(text) {
  const rows = []; let row = [], f = '', inq = false;
  text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inq) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else inq = false; } else f += c; }
    else if (c === '"') inq = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
async function importCSV(input) {
  const file = input.files && input.files[0]; if (!file) return;
  const rows = parseCSV(await file.text());
  const hi = rows.findIndex((r) => r[0] === 'date');
  if (hi < 0) { toast('That isn’t a Sales Tracker export.'); input.value = ''; return; }
  const cols = rows[hi]; let n = 0;
  rows.slice(hi + 1).forEach((r) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r[0] || '')) return;
    const g = (k) => r[cols.indexOf(k)];
    const x = { c: {}, sales: [], o: {}, none: +g('no_objection_sales') || 0 };
    COUNTERS.forEach(([k]) => { x.c[k] = +g(k) || 0; });
    let id = Date.parse(r[0]) || Date.now();
    (g('sale_details') || '').split(';').filter(Boolean).forEach((s) => { const [type, kind, price] = s.split('|'); if (type === 'first' || type === 'beback') x.sales.push({ id: id++, type, kind: kind || 'presale', price: +price || 0 }); });
    OBJ.forEach(([k]) => { x.o[k] = [+g(k + '_faced') || 0, +g(k + '_beat') || 0]; });
    DB.days[r[0]] = x; n++;
  });
  save(); input.value = ''; render(); toast(`Imported ${n} day${n === 1 ? '' : 's'}`);
}

window.__tracker = { totals, weekRange, commission, get DB() { return DB; } };
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
S._today = todayIso();
route();
})();
