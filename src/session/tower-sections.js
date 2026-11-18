// ════════════════════════════════════════════════════════════════════════
// src/session/tower-sections.js — THE BURNING TOWER AND THE HEARTH CHEST AS THE SERVER STATES THEM, FOR ONE HERO.
//
// PURE. Reads the envelope's `tower` section (supabase/migrations/2027-04-28-tower-section.sql hr_tower_section; its `chest` is
// 2027-04-27-tower-chest.sql hr_chest_section):
//   null / absent   the `burning_tower` switch is off for this account: no Tower window, the Great Hearth opens the bag, nothing to press
//   { hunt, rules { room_size, landing_every, floor_limit_ms, landing_limit_ms, floor_top },
//     pays { xp_pm, coin, drops, bestiary, death_loss_pm, blessings, stamina },
//     best_floor, record, checkpoints [landing],
//     run { session, start, top, floors, floor } | null,
//     last { session, start, top, floors, end_reason, ended_at, keys [{ landing, key }], withheld, best_before,
//            board { rank | over, passed, name } | null } | null,
//     party [{ seat, name, floor, outfit }],
//     field { rank | over, above [{ name, floor, at, outfit }], below [...] } | absent,
//     chest { on, dry, opens, per_call, own_pm, own_family, warmth_pm, week_ends, cinders { bag, storage, ring },
//             families [{ family, name, max, held_max, opened, held, dry, warmth_pm }],
//             keys [{ key, family, item, name, from, held { bag, storage, ring }, base_pm, chance_ppm, stokes_default, stokes [{ n, pm, cost }],
//                     inside { item: qty }, ready, skill_plus, outfits [{ outfit, item, pm }],
//                     gear, ground, helmet_pm, armor [{ slot, weight, item }] (2027-05-08-catacombs.sql: a Catacomb key's armor) }] } }
// The chest, the field and the board's place are read the same way for the Catacombs (./catacomb-sections.js imports them).
//
// CHECKPOINTS (Tyler 2026-11-16, lane/c-tower-checkpoints; replaces the week that started 60 floors under your best): a climb starts after
// any landing up to the RECORD (the hero's best floor; in a party, its lowest seat's), the best by default. `checkpoints` is the server's
// list (hr_mode_checkpoints: 0 = floor 1, then every landing), the ONE list hr_tower_start(p_slot, p_landing, p_idem) checks p_landing against.
// KEY FAMILIES (Tyler 2026-11-16, lane/c-tower-chest): every key belongs to a family (tower, catacomb, later more); the cap is chests OPENED a
// week per hero per family (`max`), not keys earned, and a family's held keys stop dropping at `held_max`. Each family row is the server's
// whole week: the window never guesses a 6 or a 30, and with no row it draws no cap line and gates nothing on one. Keys count where they
// are held: the bag, the account's Storage and the hero's Key Ring (lane/c-key-ring).
// THE CLIMB DRAWN (direction A, Tyler 2026-11-16): `party` is every OTHER seat of the hero's party with its best floor (the Climb tab's
// party markers); `last.best_before` the hero's best before that climb, or null when it set no record (the end card's "New Best +N").
// THE BOARD (2027-04-30-tower-board.sql, lane/c-tower-board): `field` is the hero's place (`rank`, or `over` when more heroes are ahead
// than the board counts to: "#1,000+") and the two heroes just above and below it, top-down, never a seat of its own party (those are
// `party`); absent for a hero with no floor on the board, so the window draws no rank and no rivals, never a guess. `last.board` is that
// climb's place when it ended, the heroes it passed and the best of them (the end card's Rank (+N) and Passed).
// Every envelope replaces it, and nothing here holds a number of its own (CLAUDE.md §6). A row that is not the server's shape is
// dropped, never mended: the window shows less, never something the server did not say. A number the server did not send is null.
// ════════════════════════════════════════════════════════════════════════

import { TOWER_KEY_FAMILY } from '../data/chests.js?v=0.2.139';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const WORD = /^[a-z0-9_]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const word = (v) => (typeof v === 'string' && WORD.test(v) ? v : null);
/* A list of whole numbers 0 and up, strictly rising (the server sorts them; a list out of order is not its shape). */
function rising(v, max = 512) {
  if (!Array.isArray(v)) return null;
  const out = v.slice(0, max).map((x) => (Number.isSafeInteger(x) && x >= 0 ? x : null));
  if (out.some((x) => x === null)) return null;
  for (let i = 1; i < out.length; i++) if (out[i] <= out[i - 1]) return null;
  return Object.freeze(out);
}
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const pos = (v) => (Number.isSafeInteger(v) && v > 0 ? v : null);
const at = (v) => { const ms = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(ms) ? ms : null; };
const sid = (v) => (typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : null);
const name = (v) => (typeof v === 'string' && v.trim() && v.length <= 60 ? v.trim() : null);

function rulesOf(r) {
  if (!isObj(r)) return null;
  const o = { roomSize: pos(r.room_size), landingEvery: pos(r.landing_every), floorLimitMs: pos(r.floor_limit_ms),
    landingLimitMs: pos(r.landing_limit_ms), floorTop: pos(r.floor_top) };
  return Object.values(o).some((v) => v === null) ? null : Object.freeze(o);
}

export function paysOf(p) {
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
    endReason: word(r.end_reason), endedAt: at(r.ended_at), keys: landingKeys(r.keys), withheld: nat(r.withheld) ?? 0,
    bestBefore: nat(r.best_before), board: climbPlaceOf(r.board) });
}

/* A hero drawn on the tower: a name, a best floor, an outfit (null: its role's). A row without a name or a floor is not the server's. */
function heroOf(h) {
  if (!isObj(h) || !name(h.name) || nat(h.floor) === null) return null;
  return Object.freeze({ name: name(h.name), floor: h.floor, outfit: word(h.outfit), seat: nat(h.seat) });
}
const heroes = (v, max) => Object.freeze((Array.isArray(v) ? v : []).slice(0, max).map(heroOf).filter(Boolean));
/* A place on the board: the exact `rank`, or `over` (more heroes ahead than the board counts to: "#1,000+"); one of them, never both.
   Null when it is neither (not the server's shape). */
function placeOf(p) {
  if (!isObj(p)) return null;
  const rank = pos(p.rank), over = pos(p.over);
  return (rank === null) === (over === null) ? null : { rank, over };
}
/* The field (the Tower board's, 2027-04-30-tower-board.sql: the hero's place and the heroes just above and below), or null while the
   server sends none (a hero with no floor on the board). */
export function fieldOf(f) {
  const place = placeOf(f);
  if (!place) return null;
  return Object.freeze({ rank: place.rank, over: place.over, above: heroes(f.above, 3), below: heroes(f.below, 3) });
}
/* The last climb's place on the board (last.board): its rank when it ended, how many heroes it passed and the best of them (a name, or
   null when it passed nobody or that hero left the board), or null when the server sends none. */
export function climbPlaceOf(b) {
  const place = placeOf(b);
  if (!place || nat(b.passed) === null) return null;
  return Object.freeze({ rank: place.rank, over: place.over, passed: b.passed, passedName: b.passed > 0 ? name(b.name) : null });
}

/* Where a hero holds an item: its bag, the account's Storage, its Key Ring (hr_chest_held). All three, or not the server's shape. */
function heldOf(h) {
  return isObj(h) && nat(h.bag) !== null && nat(h.storage) !== null && nat(h.ring) !== null
    ? Object.freeze({ bag: h.bag, storage: h.storage, ring: h.ring }) : null;
}
const heldSum = (h) => (h ? h.bag + h.storage + h.ring : null);

function stokeOf(s) {
  if (!isObj(s) || pos(s.n) === null || pos(s.pm) === null || pos(s.cost) === null) return null;
  return Object.freeze({ n: s.n, pm: s.pm, cost: s.cost });
}

/* One key family's week as the server states it (KEY FAMILIES above): its name, chests opened this week against its cap, keys held (bag,
   Storage, Key Ring) against its limit. A row without its id or its week numbers is not the server's shape and is dropped; the held pair
   is read as a pair (null when either is missing). */
function familyOf(f) {
  if (!isObj(f) || !word(f.family) || nat(f.opened) === null || pos(f.max) === null) return null;
  const held = nat(f.held), maxHeld = pos(f.held_max);
  return Object.freeze({ family: f.family, name: name(f.name), openedWeek: f.opened, maxWeek: f.max,
    held: held !== null && maxHeld !== null ? held : null, maxHeld: held !== null && maxHeld !== null ? maxHeld : null,
    /* the family's own warmth (2027-05-08-catacombs.sql chest_warmth: a weapon never cools an armor streak), null when not sent */
    dry: nat(f.dry), warmthPm: nat(f.warmth_pm) });
}

function keyOf(k) {
  if (!isObj(k) || !word(k.key) || !word(k.item) || pos(k.from) === null) return null;
  const held = heldOf(k.held);
  const stokes = (Array.isArray(k.stokes) ? k.stokes : []).slice(0, 9).map(stokeOf);
  if (!held || stokes.some((s) => s === null)) return null;
  const inside = {};
  if (isObj(k.inside)) for (const [id, q] of Object.entries(k.inside)) if (word(id) && pos(q) !== null) inside[id] = q;
  const def = nat(k.stokes_default);
  /* the super-rare outfits this key can find and their chance (permille), the server's rows (2027-04-27-tower-chest.sql hr_chest_outfits) */
  const outfits = (Array.isArray(k.outfits) ? k.outfits : []).slice(0, 16)
    .filter((o) => isObj(o) && word(o.outfit) && word(o.item) && pos(o.pm) !== null && o.pm <= 1000)
    .map((o) => Object.freeze({ outfit: o.outfit, item: o.item, pm: o.pm }));
  return Object.freeze({
    key: k.key, item: k.item, name: name(k.name), from: k.from, family: word(k.family), held, heldAll: heldSum(held),
    basePm: nat(k.base_pm), chancePpm: Number.isSafeInteger(k.chance_ppm) && k.chance_ppm >= 0 && k.chance_ppm <= 1000000 ? k.chance_ppm : null,
    /* the saved default must be a stoke count the server lists (or none) */
    stokesDefault: def === 0 || stokes.some((s) => s.n === def) ? def : null,
    stokes: Object.freeze(stokes), inside: Object.freeze(inside), ready: k.ready === true, skillPlus: pos(k.skill_plus),
    outfits: Object.freeze(outfits),
    /* what a hit pays (2027-05-08-catacombs.sql): 'weapon' (a Tower key) or 'armor' (a Catacomb key: a helmet or boots, `helmetPm` of them
       helmets, each slot and weight's piece the server's `armor` row); `ground` the run ground whose doors hand it out */
    gear: k.gear === 'armor' ? 'armor' : 'weapon', ground: word(k.ground),
    helmetPm: Number.isSafeInteger(k.helmet_pm) && k.helmet_pm >= 0 && k.helmet_pm <= 1000 ? k.helmet_pm : null,
    armor: Object.freeze((Array.isArray(k.armor) ? k.armor : []).slice(0, 12)
      .filter((a) => isObj(a) && word(a.slot) && word(a.weight) && word(a.item))
      .map((a) => Object.freeze({ slot: a.slot, weight: a.weight, item: a.item }))),
  });
}

export function chestOf(c) {
  if (!isObj(c) || !Array.isArray(c.keys)) return null;
  const cinders = heldOf(c.cinders);
  return Object.freeze({
    dry: nat(c.dry), opens: nat(c.opens), perCall: pos(c.per_call), weekEnds: at(c.week_ends),
    ownPm: nat(c.own_pm), ownFamily: word(c.own_family), warmthPm: nat(c.warmth_pm),
    cinders, cindersAll: heldSum(cinders),
    keys: Object.freeze(c.keys.slice(0, 32).map(keyOf).filter(Boolean)),
    /* one row a family, the first the server lists for an id kept (a repeat is not its shape) */
    families: Object.freeze((Array.isArray(c.families) ? c.families : []).slice(0, 16).map(familyOf)
      .filter((f, i, all) => f && all.findIndex((g) => g && g.family === f.family) === i)),
  });
}


/** The section, checked field by field and frozen, or null when the server did not send it (the switch is off). */
export function towerOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('tower') : undefined;
  if (!isObj(s) || !word(s.hunt)) return null;
  const rules = rulesOf(s.rules);
  if (!rules) return null;
  return Object.freeze({
    hunt: s.hunt, rules, pays: paysOf(s.pays),
    bestFloor: nat(s.best_floor) ?? 0, record: nat(s.record),
    /* the landings a climb may start after (0: floor 1), the server's whole list or none */
    checkpoints: rising(s.checkpoints) || Object.freeze([]),
    run: runOf(s.run), last: lastOf(s.last), chest: chestOf(s.chest),
    party: heroes(s.party, 7), field: fieldOf(s.field),
  });
}

/** The newest climb that ended for this hero (the section's `last.session`), or null: none, or the Tower not offered. Pure. */
export function lastClimbOf(cs) {
  const tw = towerOf(cs);
  return tw && tw.last ? tw.last.session : null;
}

/** Is `floor` a landing (a Keeper holds its key) by the server's rule? Pure. */
export const isLanding = (tw, floor) => !!tw && Number.isSafeInteger(floor) && floor > 0 && floor % tw.rules.landingEvery === 0;

/** The key row of the chest the server names `key`, or null. Pure. */
export const keyRow = (tw, key) => (tw && tw.chest ? tw.chest.keys.find((k) => k.key === key) || null : null);

/** The key a landing gives (the highest Tower-family row at or under it, the server's mint rule, read off the server's own rows), or
    null. Another family's keys (the catacombs') are never a landing's. Pure. */
export function keyForLanding(tw, landing) {
  if (!tw || !tw.chest) return null;
  let best = null;
  for (const k of tw.chest.keys) if (k.family === TOWER_KEY_FAMILY && k.from <= landing && (!best || k.from > best.from)) best = k;
  return best;
}

/** The week of the family a key belongs to (chests opened, the cap, keys held, the limit), or null while the server sends none. Pure. */
export const familyRow = (tw, k) => (tw && tw.chest && k && k.family ? tw.chest.families.find((f) => f.family === k.family) || null : null);

/** A stoke count's row (cost, multiplier) for a key, or null (0 stokes has none). Pure. */
export const stokeRow = (k, n) => (k ? k.stokes.find((s) => s.n === n) || null : null);
