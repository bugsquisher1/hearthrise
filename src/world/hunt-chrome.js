// ════════════════════════════════════════════════════════════════════════
// src/world/hunt-chrome.js — THE HUNT'S HTML OVERLAY: vitals, action bar,
// Analyzer, timeline, bestiary tracker, end card.
//
// EVERY NUMBER HERE IS THE SERVER'S (CLAUDE.md §6). Two sources, both REPLACED
// whole by each answer and printed as sent:
//   · THE SESSION (lane B1, ruling HR-2026-10-14): hr_hunt_analyzer's answer in
//     `G._huntSession` (src/net/hunt.js) — bag counts, tally, Gold / Waste /
//     Balance at vendor value, per-hour figures, the timeline — labelled with
//     the age of the server's settle point ("settled 12 s ago");
//   · THE LEGACY FIGHT (lane W3): `G._huntAnalyzer` off the envelope, for a
//     fight that is not a session (the old combat pointer, until R1 retires it).
// Vitals: HP is the fight's (the one bar that may animate between updates),
// Combat level from the server's skills, stamina is the server's `stamina`
// projection as of its own instant — never counted down here. A hunt that has
// not settled shows em-dashes, never zeroes.
//
// SECTIONS: the overlay is a list of keyed sections, each a pure model → ONE
// element. The mount hands them to the paint seam (src/render/paint.js
// HearthrisePaint.rows), so a repaint swaps only the section that changed —
// an open <select> in the action-set box survives the Analyzer ticking over.
// HIDDEN until the combat redesign (master plan row 18): the mana bar, spells,
// target mode and pull count.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=584';
import { MONSTERS } from '../data/monsters.js?v=584';
import { HUNT_INDEX } from '../data/hunts.js?v=584';
import { SKILLS_DEF } from '../data/skills.js?v=584';
import { TREES, ROCKS, FISH_SPOTS } from '../data/gathering.js?v=584';
import { ARTISAN_RECIPES } from '../data/recipes.js?v=584';
import { END_CARD_COPY, END_REASON_COPY, EVENT_COPY, TIMELINE_COPY } from '../data/hunt-sessions.js?v=584';
import { barModel, quickModel, slotHtml, BAR_COLS } from './hunt-bar.js?v=584';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
const num = (v) => (v != null && Number.isFinite(Number(v)) ? Math.round(Number(v)).toLocaleString('en-US') : '—');
const signed = (v) => (v != null && Number.isFinite(Number(v)) ? (Number(v) > 0 ? '+' : '') + num(v) : '—');
const gold = (v) => (v != null && Number.isFinite(Number(v)) ? num(v) + 'g' : '—');
const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);
const fill = (p) => '<span class="whud-meter-bar" aria-hidden="true"><s style="width:' + p.toFixed(1) + '%"></s></span>';

/** "12 s ago", "4 min ago", "2 h ago" — the age of a server timestamp at `now`. */
function settledAgo(iso, now) {
  const at = Date.parse(String(iso || ''));
  if (!Number.isFinite(at)) return null;
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return s + ' s ago';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  return Math.floor(s / 3600) + ' h ago';
}

const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const hm = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; };
const hhmm = (iso) => { const d = new Date(Date.parse(iso)); return Number.isFinite(d.getTime()) ? String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : ''; };

/** Fill a copy entry ({one, other}) with server-stated values. */
function say(entry, vars) {
  if (!entry) return '';
  const n = vars && vars.n;
  const text = (n != null && Number(n) !== 1 && entry.other) ? entry.other : entry.one;
  return String(text).replace(/\{([a-z]+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
}

const itemName = (id) => (ITEMS[id] && ITEMS[id].name) || String(id || '').replace(/_/g, ' ');
const monsterName = (id) => (MONSTERS[id] && MONSTERS[id].name) || String(id || '').replace(/_/g, ' ');
export const huntName = (id) => (HUNT_INDEX[id] && HUNT_INDEX[id].name) || (MONSTERS[id] && MONSTERS[id].name) || String(id || '');
const skillName = (id) => (SKILLS_DEF[id] && SKILLS_DEF[id].name) || String(id || '');

/* The skill a resumed activity trains, in plain words ("fishing"), from the
   catalogue rows the server's hr_activities is built from. Null: say nothing. */
function activityWords(resume) {
  if (!resume || !resume.id) return null;
  let skill = null;
  if (resume.kind === 'gather') {
    for (const [k, rows] of [['woodcutting', TREES], ['mining', ROCKS], ['fishing', FISH_SPOTS]]) if (rows.some((r) => r.id === resume.id)) skill = k;
  } else if (resume.kind === 'artisan') {
    for (const k of Object.keys(ARTISAN_RECIPES)) if ((ARTISAN_RECIPES[k] || []).some((r) => r.id === resume.id)) skill = k;
  } else if (resume.kind === 'training') skill = 'training';
  return skill ? skillName(skill).toLowerCase() : null;
}

/* ── THE LEGACY OVERLAY (a fight that is not a session) ───────────────────── */
function legacyModel(o) {
  const a = o.analyzer && typeof o.analyzer === 'object' ? o.analyzer : null;
  const ago = a && settledAgo(a.settled_at, o.now);
  return {
    analyzer: {
      title: o.title,
      rows: [
        ['Kills', num(a && a.kills)],
        ['XP / hour', num(a && a.xp_per_h)],
        ['Loot value', a && a.loot_value != null ? num(a.loot_value) + ' gp' : '—'],
        ['Profit / hour', a && a.profit_per_h != null ? signed(a.profit_per_h) + ' gp' : '—'],
      ],
      honesty: ago ? 'settled ' + ago : 'nothing settled yet',
    },
    actions: [{ act: 'eat', label: 'Eat' }, { act: 'leave', label: 'Leave Hunt' }],
  };
}

function downStatus(d, now) {
  if (d && d.phase === 'recovering' && d.until > now) return { kind: 'down', text: 'Knocked out · back on your feet in ' + clock(d.until - now) };
  if (d && d.phase === 'pending') return { kind: 'pending', text: 'Knocked out · waiting for the realm' };
  return null;
}

/* ── THE SESSION OVERLAY ─────────────────────────────────────────────────── */
function eventLine(e, sessionHunt) {
  const d = (e && e.data) || {};
  switch (e.type) {
    case 'entered': return say(EVENT_COPY.entered, { hunt: huntName(d.hunt || sessionHunt) });
    case 'level_up': return say(EVENT_COPY.level_up, { skill: skillName(d.skill), level: num(d.level) });
    case 'rare_drop': return say(EVENT_COPY.rare_drop, { item: itemName(d.item) });
    case 'fall': return say(EVENT_COPY.fall, { monster: monsterName(d.monster) })
      + (Number(d.xp) > 0 ? ' ' + say(TIMELINE_COPY.xpLost, { n: num(d.xp) }) : '');
    case 'slot_dry': return say(EVENT_COPY.slot_dry, { item: itemName(d.item) });
    case 'vigour_low': return 'Stamina is low.';
    case 'ended': return 'Hunt over.';
    default: return String(e.type || '');
  }
}

/** The plain-English end card for an ended session, from server rows only. */
export function endCardModel(view) {
  const s = view && view.session;
  if (!s || !s.ended_at) return null;
  const evs = (view.recent || []).filter((e) => e.session === s.id);
  const dry = evs.filter((e) => e.type === 'slot_dry').pop();
  const ended = evs.filter((e) => e.type === 'ended').pop();
  const vars = { n: s.end_reason === 'hours' ? s.hours_limit : s.falls, item: dry ? itemName(dry.data && dry.data.item) : 'ammo', hunt: 'another hunt' };
  const xp = evs.filter((e) => e.type === 'fall').reduce((t, e) => t + (Number(e.data && e.data.xp) || 0), 0);
  const words = activityWords(ended && ended.data && ended.data.resume);
  return {
    title: END_CARD_COPY.title,
    reason: say(END_REASON_COPY[s.end_reason], vars) || 'The hunt ended.',
    xp: xp > 0 ? say(END_CARD_COPY.xpLost, { n: num(xp) }) : null,
    resume: words ? say(END_CARD_COPY.resumed, { activity: words }) : null,
    again: END_CARD_COPY.again, details: END_CARD_COPY.details,
    hunt: s.hunt,
  };
}

/**
 * The overlay's model. PURE.
 * @param {object} o
 *   analyzer, title, down, now   the legacy fight's inputs (lane W3)
 *   hunt   the session's: {view, slots, sets, preset, tier, hp, level, stamina,
 *          tracker, details, busy, renaming} — absent or no view: the legacy overlay
 */
export function hudModel(o) {
  const h = o.hunt;
  const v = h && h.view;
  const s = v && v.session;
  if (!s) return Object.assign(legacyModel(o), { status: downStatus(o.down, o.now) });
  const ended = !!s.ended_at;
  const evs = (v.recent || []).filter((e) => e.session === s.id);
  const ago = settledAgo(s.settled_to, o.now);
  const per = v.per_hour || {};
  const tally = s.tally || {};
  const bar = barModel({ slots: h.slots, bag: v.bag || s.bag || [], tier: h.tier });
  const used = (v.bag || []).filter((l) => Number(l.loaded) > Number(l.left)).map((l) => [itemName(l.item), num(Number(l.loaded) - Number(l.left))]);
  for (const [id, n] of Object.entries(tally.bought || {})) used.push([itemName(id) + ' (shop)', num(n)]);
  const loot = Object.entries(tally.loot || {}).map(([id, n]) => [itemName(id), num(n)]);
  const skills = Object.entries(v.skills || {}).map(([k, x]) => [skillName(k) + ' XP / hour', num(x && x.per_hour)]);
  let status = downStatus(o.down, o.now);
  if (!status && !ended && s.phase === 'walking') status = { kind: 'walking', text: 'Walking out to ' + huntName(s.hunt) };
  if (!status && !ended && s.phase === 'leaving') status = { kind: 'walking', text: 'Heading home after this swing' };
  const tr = h.tracker;
  return {
    session: true,
    vitals: {
      hp: h.hp ? { text: num(h.hp.hp) + ' / ' + num(h.hp.max), pct: pct(h.hp.hp, h.hp.max) } : null,
      level: h.level ? { text: 'Combat ' + num(h.level.lv), pct: h.level.pct * 100, note: h.level.note } : null,
      stamina: h.stamina ? { text: hm(h.stamina.ms), pct: pct(h.stamina.ms, h.stamina.maxMs), title: hm(h.stamina.ms) + ' of stamina as the realm last counted it' } : null,
    },
    dock: ended ? null : {
      bar, quick: quickModel(bar),
      sets: (h.sets || []).map((r) => ({ preset: r.preset, name: r.name, on: r.preset === h.preset })),
      renaming: !!h.renaming, name: ((h.sets || []).find((r) => r.preset === h.preset) || {}).name || '',
      busy: !!h.busy,
    },
    analyzer: {
      title: huntName(s.hunt),
      rows: [['Gold', gold(v.gold)], ['Waste', gold(v.waste)], ['Balance', signed(v.balance) + (v.balance != null ? 'g' : '')],
        ['Balance / hour', per.balance != null ? signed(per.balance) + 'g' : '—'], ['Kills', num(tally.kills)]],
      more: h.details ? [['Gold / hour', per.gold != null ? gold(per.gold) : '—'], ['Waste / hour', per.waste != null ? gold(per.waste) : '—']].concat(skills) : null,
      used: h.details ? used : null, loot: h.details ? loot : null,
      honesty: (ago ? 'settled ' + ago : 'nothing settled yet') + ' · gold at vendor value',
      details: !!h.details, trackerClosed: !!(tr && !tr.open),
    },
    timeline: {
      rows: evs.slice(-(h.details ? 12 : 5)).reverse().map((e) => ({ at: hhmm(e.at), text: eventLine(e, s.hunt), fresh: Number(e.id) > Number(s.seen_event_id || 0) })),
      details: !!h.details,
    },
    tracker: tr && tr.open ? { rows: tr.rows, known: tr.known } : null,
    status,
    end: ended && Number(v.unseen) > 0 ? endCardModel(v) : null,
  };
}

/* ── HTML, one element per section ─────────────────────────────────────── */
const SEC = {
  analyzer: (m) => {
    const a = m.analyzer;
    if (!a) return '';
    const dl = (rows, cls) => '<dl class="whud-rows' + (cls ? ' ' + cls : '') + '">' + rows.map(([k, v]) => '<div class="whud-row"><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('') + '</dl>';
    const list = (head, rows) => rows && rows.length ? '<h4 class="whud-sub">' + esc(head) + '</h4>' + dl(rows, 'is-list') : '';
    return '<section class="whud-analyzer' + (a.details ? ' is-open' : '') + '" aria-label="Hunt analyzer"><h3 class="whud-title">' + esc(a.title) + '</h3>'
      + dl(a.rows) + (a.more ? dl(a.more, 'is-more') : '') + list('Supplies used', a.used) + list('Loot', a.loot)
      + '<p class="whud-honesty">' + esc(a.honesty) + '</p>'
      + (m.session ? '<div class="whud-an-foot"><button type="button" class="whud-link" data-whud="details" aria-expanded="' + (a.details ? 'true' : 'false') + '">'
        + (a.details ? 'Less' : 'Details') + '</button>' + (a.trackerClosed ? '<button type="button" class="whud-link" data-whud="tracker-open">Bestiary</button>' : '') + '</div>' : '')
      + '</section>';
  },
  timeline: (m) => {
    const t = m.timeline;
    if (!t) return '';
    return '<section class="whud-timeline' + (t.details ? ' is-open' : '') + '" aria-label="' + esc(TIMELINE_COPY.heading) + '"><h4 class="whud-sub">' + esc(TIMELINE_COPY.heading) + '</h4>'
      + (t.rows.length ? '<ol class="whud-events">' + t.rows.map((r) => '<li' + (r.fresh ? ' class="is-new"' : '') + '><time>' + esc(r.at) + '</time><span>' + esc(r.text) + '</span></li>').join('') + '</ol>'
        : '<p class="whud-empty">' + esc(TIMELINE_COPY.empty) + '</p>') + '</section>';
  },
  tracker: (m) => {
    const t = m.tracker;
    if (!t) return '';
    const rows = t.known && t.rows ? t.rows.map((r) => '<li><span class="whud-trk-name">' + esc(r.name) + '</span><b>' + num(r.kills) + (r.next ? ' / ' + num(r.next) : '') + '</b>'
      + (r.next ? fill(pct(r.kills, r.next)) : '') + '</li>').join('') : '<li class="whud-empty">Waiting for the realm to count your kills.</li>';
    return '<section class="whud-tracker" aria-label="Bestiary tracker"><header><h4 class="whud-sub">Bestiary</h4>'
      + '<button type="button" class="whud-link" data-whud="tracker-close">Close tracker</button></header><ul>' + rows + '</ul></section>';
  },
  status: (m) => m.status && '<p class="whud-status is-' + m.status.kind + '" role="status">'
    + (m.status.kind === 'pending' ? '<span class="whud-pending" aria-hidden="true"></span>' : '') + esc(m.status.text) + '</p>',
  vitals: (m) => {
    const v = m.vitals;
    if (!v) return '';
    const meter = (cls, k, x, extra) => '<div class="whud-meter ' + cls + '"' + (x && x.title ? ' title="' + esc(x.title) + '"' : '') + '><span class="whud-meter-k">' + k + '</span>'
      + fill(x ? x.pct : 0) + '<b>' + esc(x ? x.text : '—') + '</b>' + (extra || '') + '</div>';
    return '<section class="whud-vitals" aria-label="Your hero">' + meter('is-hp', 'HP', v.hp)
      + meter('is-level', 'Level', v.level && Object.assign({ title: v.level.note }, v.level))
      + meter('is-stamina', 'Stamina', v.stamina, '<button type="button" class="whud-refill" disabled aria-label="Refill stamina: arrives in a later update" title="Stamina refills arrive in a later update">+</button>')
      + '</section>';
  },
  dock: (m, art) => {
    const d = m.dock;
    if (!d) return '';
    const quick = d.quick.map((q, k) => (q
      ? slotHtml(q, art, { attr: 'data-hquick' }).replace('class="hbar-slot', 'class="hbar-slot is-quick')
      : '<button type="button" class="hbar-slot is-quick is-empty" data-hquick-add="' + k + '" aria-label="Quick slot ' + (k + 1) + ': add an action"><span class="hbar-plus" aria-hidden="true">+</span></button>')).join('');
    const set = d.renaming
      ? '<form class="whud-rename" data-hrename><input type="text" maxlength="32" value="' + esc(d.name) + '" aria-label="Action set name" data-hname>'
        + '<button type="submit" class="whud-btn is-small">Save</button><button type="button" class="whud-btn is-small" data-whud="rename-cancel">Cancel</button></form>'
      : '<label class="whud-set"><span>Action set</span><select data-hset aria-label="Action set">'
        + d.sets.map((x) => '<option value="' + x.preset + '"' + (x.on ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('')
        + (d.sets.length < 5 ? '<option value="new">New set…</option>' : '') + '<option value="rename">Rename this set…</option></select></label>';
    return '<section class="whud-dock' + (d.busy ? ' is-busy' : '') + '" aria-label="Action bar">'
      + '<div class="whud-quick" role="group" aria-label="Quick slots: press to use now">' + quick + '</div>'
      + '<div class="whud-bar" role="group" aria-label="Action bar: click to configure, Shift+click to turn on or off" style="--hbar-cols:' + BAR_COLS + '">'
      + d.bar.map((b) => slotHtml(b, art)).join('') + '</div>'
      + '<div class="whud-setbox">' + set
      + '<span class="whud-setacts"><button type="button" class="whud-btn is-small" data-whud="restock">Restock</button>'
      + '<button type="button" class="whud-btn is-small is-leave" data-whud="leave">Leave hunt</button></span></div></section>';
  },
  end: (m) => {
    const e = m.end;
    if (!e) return '';
    return '<section class="whud-end" role="dialog" aria-label="' + esc(e.title) + '"><h3 class="whud-title">' + esc(e.title) + '</h3>'
      + '<p class="whud-end-reason">' + esc(e.reason) + '</p>' + (e.xp ? '<p>' + esc(e.xp) + '</p>' : '') + (e.resume ? '<p class="whud-end-resume">' + esc(e.resume) + '</p>' : '')
      + '<div class="whud-end-acts"><button type="button" class="whud-btn is-primary" data-whud="again">' + esc(e.again) + '</button>'
      + '<button type="button" class="whud-btn" data-whud="details">' + esc(e.details) + '</button>'
      + '<button type="button" class="whud-btn" data-whud="end-close">Close</button></div></section>';
  },
  actions: (m) => m.actions && '<div class="whud-actions">' + m.actions.map((b) => '<button type="button" class="whud-btn is-' + b.act + '" data-whud="' + b.act + '">' + esc(b.label) + '</button>').join('') + '</div>',
};

/** The sections, in paint order. */
export const HUD_SECTIONS = Object.freeze(['analyzer', 'timeline', 'tracker', 'vitals', 'status', 'dock', 'end', 'actions'].map((k) => [k, SEC[k]]));

/** The overlay as [key, html] rows (each html one element). PURE. */
export function hudRows(m, art) {
  const a = art || (() => '');
  return HUD_SECTIONS.map(([k, fn]) => [k, fn(m, a) || '']).filter((r) => r[1]);
}

/** The overlay as HTML. PURE. */
export function hudHtml(m, art) {
  return hudRows(m, art).map((r) => r[1]).join('');
}

/**
 * Mount the overlay in the stage. paint(model) repaints only the sections
 * whose HTML changed (the paint seam when present); clicks go to `on[act](el, e)`,
 * a bar slot to `on.slot(i, shift)`, a quick slot to `on.quick(i)`, the set
 * box to `on.set(value)` / `on.renameTo(name)`.
 * @param {HTMLElement} stage
 * @param {{doc: Document, on: object, art?: (id: string) => string, paint?: object}} o
 */
export function createHuntChrome(stage, o) {
  const el = o.doc.createElement('div');
  el.className = 'world-hud';
  el.hidden = true;
  stage.appendChild(el);
  let last = '';
  const on = o.on || {};
  const call = (k, ...a) => (typeof on[k] === 'function' ? on[k](...a) : undefined);
  const onClick = (e) => {
    const t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    const q = t.closest('[data-hquick]');
    if (q) { call('quick', Number(q.getAttribute('data-hquick'))); return; }
    const qa = t.closest('[data-hquick-add]');
    if (qa) { call('slot', -1, false); return; }
    const s = t.closest('[data-hbar]');
    if (s) { call('slot', Number(s.getAttribute('data-hbar')), !!e.shiftKey); return; }
    const b = t.closest('[data-whud]');
    if (b) call(b.getAttribute('data-whud'), b, e);
  };
  const onChange = (e) => {
    const sel = e.target && e.target.closest && e.target.closest('[data-hset]');
    if (!sel) return;
    const v = sel.value;
    /* "New set…" and "Rename…" are commands, not a choice: the box shows the
       server's set again until the server answers. */
    if (v === 'new' || v === 'rename') for (const opt of sel.options) if (opt.defaultSelected) opt.selected = true;
    call('set', v);
  };
  const onSubmit = (e) => {
    const f = e.target && e.target.closest && e.target.closest('[data-hrename]');
    if (!f) return;
    e.preventDefault();
    const i = f.querySelector('[data-hname]');
    call('renameTo', i ? i.value : '');
  };
  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  el.addEventListener('submit', onSubmit);
  return {
    paint(model) {
      el.hidden = !model;
      el.classList.toggle('is-session', !!(model && model.session));
      const rows = model ? hudRows(model, o.art) : [];
      const P = o.paint;
      if (P && typeof P.rows === 'function') { P.rows(el, rows); return; }
      const html = rows.map((r) => r[1]).join('');
      if (html !== last) { el.innerHTML = html; last = html; }
    },
    text: () => el.textContent,
    el: () => el,
    destroy() {
      el.removeEventListener('click', onClick);
      el.removeEventListener('change', onChange);
      el.removeEventListener('submit', onSubmit);
      el.remove();
    },
  };
}
