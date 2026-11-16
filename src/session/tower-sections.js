// ════════════════════════════════════════════════════════════════════════
// src/session/tower-sections.js — THE BURNING TOWER AND THE HEARTH CHEST AS THE SERVER STATES THEM, FOR ONE HERO.
//
// PURE. Reads the envelope's `tower` section (supabase/migrations/2027-04-28-tower-section.sql hr_tower_section; its `chest` is
// 2027-04-27-tower-chest.sql hr_chest_section):
//   null / absent   the `burning_tower` switch is off for this account: no Tower window, the Great Hearth opens the bag, nothing to press
//   { hunt, rules { room_size, landing_every, floor_limit_ms, landing_limit_ms, floor_top },
//     pays { xp_pm, coin, drops, bestiary, death_loss_pm, blessings, stamina },
//     best_floor, best_landing, week, week_ends_at, base, starts [floor], landings [{ landing, key }], open [landing], next_landing,
//     run { session, start, top, floors, floor } | null,
//     last { session, start, top, floors, end_reason, ended_at, keys [{ landing, key }] } | null,
//     chest { on, dry, opens, today, max_day, per_call, own_pm, own_family, warmth_pm, cinders { bag, storage },
//             keys [{ key, item, name, from, family, held { bag, storage }, base_pm, chance_ppm, stokes_default, stokes [{ n, pm, cost }],
//                     inside { item: qty }, ready, skill_plus }],
//             families [{ family, opened_week, max_week, held, max_held }] } }   <- PROVISIONAL, see KEY FAMILIES below
//
// KEY FAMILIES (Tyler 2026-11-16, rulings-of-record): every key belongs to a family (tower, catacomb, later more); the weekly cap is CHESTS
// OPENED per hero per family (6), not keys earned, and a hero holds at most about 30 keys of a family. The server half is
// lane/c-tower-chest's, in flight: origin/lane/c-tower-chest (50b37bc0b) has no field names for it yet.
// TODO(lane/c-tower-chest KEY-FAMILIES): the names `family` (key row) and `families` / `opened_week` / `max_week` / `held` / `max_held`
// (chest) are this window's PROPOSAL, read in ONE place (familyOf / keyOf below). Until the server sends them every reader
// answers null and the window draws no cap line and gates nothing on it (it never guesses a 6 or a 30); when the chest lane lands
// its projection, rename here and in tests/tower-window.mjs section() and nothing else moves.
// CHECKPOINTS (Tyler 2026-11-16, replaces "each week starts 60 floors under your best"): a climb starts on any landing up to the hero's
// best (default the best); for a party, only landings every member has reached. The server names the floors it allows and the window
// offers only those (`starts`, today hr_tower_starts' list). The server half is lane/c-tower-checkpoints', not pushed yet.
// TODO(lane/c-tower-checkpoints CHECKPOINTS): if that lane names the list differently, rename it in startsOf below (ONE place); the
// window's picker and Enter read tw.starts only. `week_back` is no longer read (nothing on screen says the old rule).
// Every envelope replaces it, and nothing here holds a number of its own (CLAUDE.md §6). A row that is not the server's shape is
// dropped, never mended: the window shows less, never something the server did not say. A number the server did not send is null.
// ════════════════════════════════════════════════════════════════════════

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const WORD = /^[a-z0-9_]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const word = (v) => (typeof v === 'string' && WORD.test(v) ? v : null);
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const pos = (v) => (Number.isSafeInteger(v) && v > 0 ? v : null);
const at = (v) => { const ms = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(ms) ? ms : null; };
const sid = (v) => (typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : null);
const name = (v) => (typeof v === 'string' && v.trim() && v.length <= 60 ? v.trim() : null);
/* A list of floors: whole, above 0, no repeats, in order (the server sorts them; a list out of order is not its shape). */
function floors(v, max = 64) {
  if (!Array.isArray(v)) return null;
  const out = v.slice(0, max).map(pos);
  if (out.some((f) => f === null)) return null;
  for (let i = 1; i < out.length; i++) if (out[i] <= out[i - 1]) return null;
  return Object.freeze(out);
}

function rulesOf(r) {
  if (!isObj(r)) return null;
  const o = { roomSize: pos(r.room_size), landingEvery: pos(r.landing_every), floorLimitMs: pos(r.floor_limit_ms),
    landingLimitMs: pos(r.landing_limit_ms), floorTop: pos(r.floor_top) };
  return Object.values(o).some((v) => v === null) ? null : Object.freeze(o);
}

function paysOf(p) {
  if (!isObj(p) || nat(p.xp_pm) === null || nat(p.death_loss_pm) === null) return null;
  return Object.freeze({ xpPm: p.xp_pm, coin: p.coin === true, drops: p.drops === true, bestiary: p.bestiary === true,
    deathLossPm: p.death_loss_pm, blessings: p.blessings === true, stamina: p.stamina === true });
}

function landingKeyOf(l) {
  if (!isObj(l) || pos(l.landing) === null) return null;
  return Object.freeze({ landing: l.landing, key: word(l.key) });
}
const landingKeys = (v) => Object.freeze((Array.isArray(v) ? v : []).slice(0, 64).map(landingKeyOf).filter(Boolean));

function runOf(r) {
  if (!isObj(r) || !sid(r.session) || pos(r.start) === null) return null;
  return Object.freeze({ session: sid(r.session), start: r.start, top: pos(r.top), floors: nat(r.floors) ?? 0, floor: pos(r.floor) });
}

function lastOf(r) {
  if (!isObj(r) || !sid(r.session) || pos(r.start) === null) return null;
  return Object.freeze({ session: sid(r.session), start: r.start, top: pos(r.top), floors: nat(r.floors) ?? 0,
    endReason: word(r.end_reason), endedAt: at(r.ended_at), keys: landingKeys(r.keys) });
}

function heldOf(h) {
  return isObj(h) && nat(h.bag) !== null && nat(h.storage) !== null ? Object.freeze({ bag: h.bag, storage: h.storage }) : null;
}

function stokeOf(s) {
  if (!isObj(s) || pos(s.n) === null || pos(s.pm) === null || pos(s.cost) === null) return null;
  return Object.freeze({ n: s.n, pm: s.pm, cost: s.cost });
}

/* One key family's week as the server states it (PROVISIONAL names, KEY FAMILIES above): chests opened this week and the cap, keys held
   (bag and Storage) and the limit. A row without its family id or its week numbers is not the server's shape and is dropped; the held
   pair is optional on its own (null when the server sends none). */
function familyOf(f) {
  if (!isObj(f) || !word(f.family) || nat(f.opened_week) === null || pos(f.max_week) === null) return null;
  const held = nat(f.held), maxHeld = pos(f.max_held);
  return Object.freeze({ family: f.family, openedWeek: f.opened_week, maxWeek: f.max_week,
    held: held !== null && maxHeld !== null ? held : null, maxHeld: held !== null && maxHeld !== null ? maxHeld : null });
}

function keyOf(k) {
  if (!isObj(k) || !word(k.key) || !word(k.item) || pos(k.from) === null) return null;
  const held = heldOf(k.held);
  const stokes = (Array.isArray(k.stokes) ? k.stokes : []).slice(0, 9).map(stokeOf);
  if (!held || stokes.some((s) => s === null)) return null;
  const inside = {};
  if (isObj(k.inside)) for (const [id, q] of Object.entries(k.inside)) if (word(id) && pos(q) !== null) inside[id] = q;
  const def = nat(k.stokes_default);
  return Object.freeze({
    key: k.key, item: k.item, name: name(k.name), from: k.from, family: word(k.family), held, heldAll: held.bag + held.storage,
    basePm: nat(k.base_pm), chancePpm: Number.isSafeInteger(k.chance_ppm) && k.chance_ppm >= 0 && k.chance_ppm <= 1000000 ? k.chance_ppm : null,
    /* the saved default must be a stoke count the server lists (or none) */
    stokesDefault: def === 0 || stokes.some((s) => s.n === def) ? def : null,
    stokes: Object.freeze(stokes), inside: Object.freeze(inside), ready: k.ready === true, skillPlus: pos(k.skill_plus),
  });
}

function chestOf(c) {
  if (!isObj(c) || !Array.isArray(c.keys)) return null;
  const cinders = heldOf(c.cinders);
  return Object.freeze({
    dry: nat(c.dry), opens: nat(c.opens), today: nat(c.today), maxDay: nat(c.max_day), perCall: pos(c.per_call),
    ownPm: nat(c.own_pm), ownFamily: word(c.own_family), warmthPm: nat(c.warmth_pm),
    cinders, cindersAll: cinders ? cinders.bag + cinders.storage : null,
    keys: Object.freeze(c.keys.slice(0, 32).map(keyOf).filter(Boolean)),
    /* one row a family, the first the server lists for an id kept (a repeat is not its shape) */
    families: Object.freeze((Array.isArray(c.families) ? c.families : []).slice(0, 16).map(familyOf)
      .filter((f, i, all) => f && all.findIndex((g) => g && g.family === f.family) === i)),
  });
}

/* The floors a climb may start on, as the server lists them (CHECKPOINTS above: the one place its name is read). */
const startsOf = (s) => floors(s.starts) || Object.freeze([]);

/** The section, checked field by field and frozen, or null when the server did not send it (the switch is off). */
export function towerOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('tower') : undefined;
  if (!isObj(s) || !word(s.hunt)) return null;
  const rules = rulesOf(s.rules);
  if (!rules) return null;
  return Object.freeze({
    hunt: s.hunt, rules, pays: paysOf(s.pays),
    bestFloor: nat(s.best_floor) ?? 0, bestLanding: nat(s.best_landing) ?? 0,
    weekEndsAt: at(s.week_ends_at), base: nat(s.base),
    starts: startsOf(s),
    landings: landingKeys(s.landings), open: floors(s.open) || Object.freeze([]), nextLanding: pos(s.next_landing),
    run: runOf(s.run), last: lastOf(s.last), chest: chestOf(s.chest),
  });
}

/** Is `floor` a landing (a Keeper holds its key) by the server's rule? Pure. */
export const isLanding = (tw, floor) => !!tw && Number.isSafeInteger(floor) && floor > 0 && floor % tw.rules.landingEvery === 0;

/** The key row of the chest the server names `key`, or null. Pure. */
export const keyRow = (tw, key) => (tw && tw.chest ? tw.chest.keys.find((k) => k.key === key) || null : null);

/** The key a landing gives (the highest row at or under it, the server's mint rule, read off the server's own rows), or null. Pure. */
export function keyForLanding(tw, landing) {
  if (!tw || !tw.chest) return null;
  let best = null;
  for (const k of tw.chest.keys) if (k.from <= landing && (!best || k.from > best.from)) best = k;
  return best;
}

/** The week of the family a key belongs to (chests opened, the cap, keys held, the limit), or null while the server sends none. Pure. */
export const familyRow = (tw, k) => (tw && tw.chest && k && k.family ? tw.chest.families.find((f) => f.family === k.family) || null : null);

/** A stoke count's row (cost, multiplier) for a key, or null (0 stokes has none). Pure. */
export const stokeRow = (k, n) => (k ? k.stokes.find((s) => s.n === n) || null : null);
