// ════════════════════════════════════════════════════════════════════════
// src/features/deeds.js — DEEDS OF THE REALM: the thirty achievements, graded
// on the realm's own counts.
//
// ── NOTHING HERE OWNS A NUMBER (CLAUDE.md §1, §6) ───────────────────────────
// Every figure comes through its one owner, and null means UNKNOWN:
//   tally:<k>        window.HearthriseLifetime.count(k) — exact counts only; a
//                    floor from a truncated statement is not a grade
//   skill:*          window.HearthriseSkillRecord.skillLevelOf (server XP, no
//                    prediction; the display level would unlock on guesses)
//   rooms:house      window.HearthriseRooms.roomsOf(G), window.ROOMS ids at rung 1+
//   monster:<id>     window.HearthriseTrophies, gated on its own countsKnown()
// An unknown deed renders the pending dash and is never Earned. There is no
// unlock record in G and none in the residue: a deed is done when the realm's
// number says so, on every device, after every reload.
//
// ── THE MOMENT'S RECORD IS DISPLAY-ONLY ─────────────────────────────────────
// 'hearthrise:deeds-seen' (storage seam) remembers, per uid:slot, which deeds
// were last seen done, so the toast fires on a crossing and never on boot. It
// gates nothing. Seeding is PER DEED: a source that becomes known late seeds its
// deeds silently rather than toasting old ones. One toast per batch; the suite
// parks the watcher. Pattern: src/features/hunters-ledger.js tick().
// ════════════════════════════════════════════════════════════════════════

import { DEEDS, DEED_GROUPS } from '../data/deeds.js?v=563';

const SEEN_KEY = 'hearthrise:deeds-seen';
const MAX_KEYS = 10;
const MELEE = ['attack', 'strength', 'defense', 'hitpoints'];
const PENDING = '<span class="bal-pending" role="status" title="Waiting for the server">—</span>';

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const splitSource = (s) => { const at = s.indexOf(':'); return [s.slice(0, at), s.slice(at + 1)]; };

function haveOf(kind, arg, r) {
  if (kind === 'tally') return num(r.tally(arg));
  if (kind === 'skill') {
    const ids = arg === 'highest' ? r.skillIds() : MELEE;
    if (!ids || !ids.length) return null;
    const lv = ids.map((id) => num(r.skillLevel(id)));
    if (lv.some((v) => v === null)) return null;
    return arg === 'highest' ? Math.max(...lv) : Math.min(...lv);
  }
  if (kind === 'rooms') {
    const rooms = r.roomsOf();
    if (!rooms || !rooms.known) return null;
    return (r.roomIds() || []).filter((id) => Number(rooms.map[id]) >= 1).length;
  }
  if (kind === 'monster') return r.monsterKnown() ? num(r.monsterKills(arg)) : null;
  return null;
}

/** One deed against the readers, pure: {known, have, target, done, html, desc}. */
export function progressOf(deed, readers) {
  const [kind, arg] = splitSource(deed.source);
  const target = deed.target === null ? (readers.roomIds() || []).length : deed.target;
  const monster = kind === 'monster' ? (readers.monsterName(arg) || arg) : '';
  const desc = deed.desc.replace('{n}', target.toLocaleString()).replace('{monster}', monster);
  const have = target >= 1 ? haveOf(kind, arg, readers) : null;
  if (have === null) return { known: false, have: null, target, done: false, html: PENDING, desc };
  const done = have >= target;
  const html = done ? 'Earned' : Math.min(have, target).toLocaleString() + ' / ' + target.toLocaleString();
  return { known: true, have, target, done, html, desc };
}

/** Deeds done, or null while any deed is still unknown. */
export function doneCount(readers) {
  let n = 0;
  for (const d of DEEDS) {
    const p = progressOf(d, readers);
    if (!p.known) return null;
    if (p.done) n += 1;
  }
  return n;
}

/** THE WATCHER, pure over its deps. Returns what it did. */
export function tick(deps) {
  if (deps.parked) return 'parked';
  const known = Object.keys(deps.states || {}).filter((id) => deps.states[id] !== 'unknown');
  if (!deps.uid || !known.length) return 'unknown';
  const key = deps.uid + ':' + deps.slot;
  const rec = deps.store.getJSON(SEEN_KEY, {}) || {};
  const cur = Object.assign({}, rec[key]);
  let seeded = false;
  const ups = [];
  for (const id of known) {
    const done = deps.states[id] === 'done';
    if (!Object.prototype.hasOwnProperty.call(cur, id)) { cur[id] = done ? 1 : 0; seeded = true; }
    else if (cur[id] === 0 && done) ups.push(id);
  }
  const write = () => {
    delete rec[key];
    rec[key] = cur;
    const keys = Object.keys(rec);
    for (let i = 0; i < keys.length - MAX_KEYS; i += 1) delete rec[keys[i]];
    deps.store.setJSON(SEEN_KEY, rec);
  };
  if (!ups.length) { if (seeded) write(); return seeded ? 'seeded' : 'quiet'; }
  let busy = true;
  try { busy = !!deps.busy(); } catch (e) { busy = true; }
  if (busy) return 'waiting';
  deps.open(ups);
  for (const id of ups) cur[id] = 1;
  write();
  return 'opened';
}

function liveReaders() {
  const W = window, G = W.G;
  const L = W.HearthriseLifetime, SR = W.HearthriseSkillRecord, R = W.HearthriseRooms, T = W.HearthriseTrophies;
  return {
    tally: (k) => { const c = L && L.count(k); return c && c.exact ? c.n : null; },
    skillLevel: (id) => (SR && typeof SR.skillLevelOf === 'function' ? SR.skillLevelOf(G, id) : null),
    skillIds: () => Object.keys(W.SKILLS_DEF || {}),
    roomsOf: () => (R && typeof R.roomsOf === 'function' ? R.roomsOf(G) : null),
    roomIds: () => Object.keys(W.ROOMS || {}),
    monsterKnown: () => !!(T && typeof T.countsKnown === 'function' && T.countsKnown()),
    monsterKills: (id) => (T && typeof T.killsOfMonster === 'function' ? T.killsOfMonster(id) : null),
    monsterName: (id) => (W.MONSTERS && W.MONSTERS[id] && W.MONSTERS[id].name) || null,
  };
}

function openToast(ids) {
  const first = DEEDS.find((d) => d.id === ids[0]);
  if (!first || typeof window.showAchToast !== 'function') return;
  const more = ids.length - 1;
  window.showAchToast({ glyph: first.glyph, name: more ? first.name + ' and ' + more + ' more' : first.name });
}

let parked = false;

function liveTick() {
  if (parked) return 'parked';
  const r = liveReaders();
  const states = {};
  for (const d of DEEDS) {
    const p = progressOf(d, r);
    states[d.id] = !p.known ? 'unknown' : (p.done ? 'done' : 'open');
  }
  const A = window.HearthriseAuth, P = window.HearthriseProfile;
  return tick({
    parked,
    uid: A && typeof A.currentUserId === 'function' ? A.currentUserId() : null,
    slot: P && typeof P.activeSlot === 'function' ? P.activeSlot() : 0,
    states,
    store: window.HearthriseStorage,
    busy: () => !!document.querySelector('.ftue-root') || window.HearthriseSheet.anyOpen(),
    open: openToast,
  });
}

export function setupDeeds() {
  window.HearthriseDeeds = {
    rows: DEEDS, groups: DEED_GROUPS, progressOf, doneCount, tick,
    readers: liveReaders,
    __setPollEnabled(on) { const was = !parked; parked = !on; return was; },
  };
  window.ACHIEVEMENTS = DEEDS;
  window.checkAchievements = () => { try { return liveTick(); } catch (e) { return 'error'; } };
  setInterval(window.checkAchievements, 1000);
}
