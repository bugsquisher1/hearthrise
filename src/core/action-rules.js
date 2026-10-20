// ============================================================
// src/core/action-rules.js — A HUNT SESSION'S SUPPLIES, ITS END ORDER, ITS
// STAMINA AND THE PRICE OF A DEATH (ruling HR-2026-10-14; HUNT_SCREEN_SPEC
// §3.4, §3.8; lane S1 2026-10-17).
//
// A hunt session is one character's half of a hunt instance: its bag, its
// purse and shop, its swing clock, its stamina and its tally. The
// caller carries it across settle windows. Its clock is `nextSwingAtMs`: every
// swing boundary is an absolute instant, so WHERE a settle window splits cannot
// move a swing, a seed or a use (TICK-1).
//
// Hunts are idle (Tyler 2026-10-16). The C2 action bar — conditional supply
// slots, manual presses, the *heal pick and the bag spender — was retired with
// lane S1: food and drink fire by the hero's thresholds
// (src/core/hunt/consumables.js), abilities by bar order
// (src/core/hunt/abilities.js), and both spend through THE ONE SUPPLY RESOLVER
// below (resolveLine / takeLine). This file holds no second copy of either.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { SUPPLIES } from '../data/supplies.js?v=0.2.18';
import { END_ORDER, DEATH_XP_LOSS, DEATH_XP_BASE, GOLD_FLOOR, SUPPLY_SOURCE, ON_EMPTY } from '../data/hunt-sessions.js?v=0.2.18';
import { CONSUMABLES, CONSUMABLE_KINDS } from '../data/consumables.js?v=0.2.18';
import { COMBAT_SKILLS } from '../data/skills.js?v=0.2.18';
import { skillLevelFromXp, skillXpForLevel, charLevelFromXp, charXpForLevel } from './xp.js?v=0.2.18';

const int = (v, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : d; };

/* THE SEED LABEL HAS A DOMAIN (architecture contracts S2): `hunt:<instance>:
   <domain>:<i>`, so a swing, a gather roll, a cast on a lane and a party roll
   on the SAME instance and index draw from separate streams, and adding one
   never re-keys another. Domains: `s` swing, `g` gather, `c:<lane>` cast,
   `r` roll. A solo instance's id is its session id (hunt_instances). */
export const SEED_DOMAIN = /^(s|g|r|c:[a-z0-9_]{1,32})$/;
export function seedLabel(instanceId, domain, index) {
  if (!SEED_DOMAIN.test(String(domain))) throw new Error('seedLabel: unknown seed domain ' + String(domain));
  return 'hunt:' + String(instanceId) + ':' + String(domain) + ':' + int(index, 0);
}

/* THE PER-SWING SEED is NOT derived in this file (Security, C1 review item 3).
   The label above is mixed with the session's 64-bit secret by a keyed hash
   (HMAC-SHA256, supabase/functions/hr-accrue/hunt-seed.js) and handed to the
   engine as `ctx.seed(domain, index)`; combat-sim.js refuses a swing without
   it. */

function bagLine(hs, id) {
  const b = hs && hs.bag;
  return (b && Object.prototype.hasOwnProperty.call(b, id)) ? b[id] : null;
}
function leftOf(hs, id) { const l = bagLine(hs, id); return l ? Math.max(0, int(l.left, 0)) : 0; }
function kindOf(id) { const s = SUPPLIES[id]; return s ? s.kind : null; }
function isEssential(id, line) {
  if (line && typeof line.essential === 'boolean') return line.essential;
  return !!(SUPPLIES[id] && SUPPLIES[id].essential);
}

/* ── THE STORE: SUPPLIES PAID PER USE (Tyler 2026-10-14; supply-basics.js) ────
   A store supply is not an item. `hs.basics` is the SERVER's catalogue
   (hr_hunt_basic_supplies: id → { kind, price, heals, mana, partner }) and
   `hs.shop` the ids the hunt's tier resolves food and drink to ({ heal, mana });
   neither is ever a client value. A store use is paid from `hs.purse` (the
   character's gold at the window start plus the coins this window has earned).
   The database re-prices every use from its own catalogue and debits it in the
   locked settle (one `supply_buy` ledger row per settle). */
export function basicOf(hs, id) {
  const b = hs && hs.basics && typeof id === 'string' && Object.prototype.hasOwnProperty.call(hs.basics, id) ? hs.basics[id] : null;
  return b && Number.isInteger(b.price) && b.price > 0 ? b : null;
}
/** MAY THE STORE SUPPLY `kind` NOW? The hero's own setting (hunt-sessions.js
    SUPPLY_SOURCE / ON_EMPTY): always under `store`; under `mine` only with
    `switch` (the default) AND once no carried line of that kind has a use left.
    Every store path asks this: food, drink, a rune, a shot, and the
    out-of-supply end test. */
export function storeAllowed(hs, kind) {
  if (!hs) return false;
  if (hs.supplySource === 'store') return true;
  if (hs.onEmpty !== 'switch') return false;
  return !Object.keys(hs.bag || {}).some((id) => kindOf(id) === kind && leftOf(hs, id) > 0);
}
/** The store shot an empty carried line of `ammoId` (an arrow or a rune) falls
    back to, or null when the store may not supply ammo. */
export function shopShotFor(hs, ammoId) {
  if (!hs || !storeAllowed(hs, 'ammo')) return null;
  for (const id of Object.keys((hs && hs.basics) || {}).sort()) {
    const b = basicOf(hs, id);
    if (b && b.kind === 'ammo' && b.partner === ammoId) return { id, price: b.price };
  }
  return null;
}
/** Buy `n` uses of store supply `id` from the purse, all or none of each use.
    Returns the uses bought; a shortfall marks the session goldOut. */
export function buyFromShop(hs, id, n) {
  const b = basicOf(hs, id);
  const want = Math.max(0, int(n, 0));
  if (!b || want <= 0) return 0;
  let got = 0;
  for (; got < want; got++) {
    /* Loot is sold only when the sale lets THIS use be paid: a charge the purse
       and the sellable loot together cannot cover sells nothing and ends the
       hunt `gold_out` (hr_hunt_apply refuses loot sold for no purchase). */
    if (!canAfford(hs, b.price)) { hs.goldOut = true; break; }
    const purse = Math.max(0, int(hs.purse, 0));
    if (purse - b.price < floorOf(hs)) sellToCover(hs, floorOf(hs) + b.price - purse);
    hs.purse = Math.max(0, int(hs.purse, 0)) - b.price;
  }
  if (got > 0) {
    const bought = hs.tally.bought || (hs.tally.bought = {});
    bought[id] = (bought[id] || 0) + got;
  }
  return got;
}

/* ── THE GOLD FLOOR AND SELL-TO-COVER (master plan row 3, 2026-10-14) ─────────
   A store use never takes the purse below the hero's `goldFloor`. When a use
   would, the hunt first sells THIS session's sellable loot to the vendor
   (`hs.cover`: item → { unit, avail }, server values), CHEAPEST FIRST, just
   enough to pay; only when that is not enough does the hunt end `gold_out`.
   The database re-prices and re-bounds every unit (hr_hunt_apply_member). */
export function floorOf(hs) { return Math.max(0, int(hs && hs.goldFloor, GOLD_FLOOR.default)); }
/** What the session's sellable loot would fetch, all of it. */
export function coverValue(hs) {
  let v = 0;
  for (const id of Object.keys((hs && hs.cover) || {})) v += Math.max(0, int(hs.cover[id].avail, 0)) * hs.cover[id].unit;
  return v;
}
/** Sell loot, cheapest first, until `need` gold has come in (or nothing is left). */
export function sellToCover(hs, need) {
  let left = Math.max(0, int(need, 0));
  if (left <= 0 || !hs.cover) return 0;
  const order = Object.keys(hs.cover).filter((id) => hs.cover[id].avail > 0)
    .sort((a, b) => (hs.cover[a].unit - hs.cover[b].unit) || (a < b ? -1 : 1));
  let got = 0;
  for (const id of order) {
    if (left <= 0) break;
    const c = hs.cover[id];
    const n = Math.min(c.avail, Math.ceil(left / c.unit));
    c.avail -= n;
    const gold = n * c.unit;
    hs.purse = Math.max(0, int(hs.purse, 0)) + gold;
    left -= gold; got += gold;
    const covered = hs.tally.covered || (hs.tally.covered = {});
    covered[id] = (covered[id] || 0) + n;
  }
  return got;
}
/** Can the purse (with the floor kept, and the loot it could sell) pay `price`? */
export function canAfford(hs, price) {
  return Math.max(0, int(hs.purse, 0)) + coverValue(hs) - floorOf(hs) >= price;
}

/* ── THE ONE SUPPLY RESOLVER (architecture contracts §1.2 / S5; HUNT_SCREEN_SPEC
   §3.4, §3.8) ──────────────────────────────────────────────────────────────
   `resolveLine(hs, want, need)` answers which line ONE use of a supply comes
   from: the hero's OWN carried line first (already owned, so it moves no gold),
   then the STORE at catalogue price — only on the hero's own setting
   (storeAllowed) and only while the purse can pay (`gold_short` otherwise: the
   caller marks goldOut and the hunt ends gold_out). `want` is a consumable kind
   ('heal' food, 'mana' drink) or an item id (a rune, an arrow). `takeLine`
   spends the answer: an own line out of the bag, a store line through
   buyFromShop — so the tally (`supplies` own units, `bought` store uses) is
   exactly the ledger split supply_own / supply_buy the database journals.
   Food and drink (src/core/hunt/consumables.js) and runes and ammo
   (src/core/hunt/abilities.js) all resolve here. */

/* An own food or drink line: the SMALLEST that covers `need`, else the
   LARGEST; ties by id. Every covering line lands the pool on full, so inside
   that set the choice only spends stock, and the smallest wins. */
function pickOwn(hs, kind, need) {
  let cover = null; let big = null;
  for (const id of Object.keys((hs && hs.bag) || {}).sort()) {
    const c = CONSUMABLES[id];
    if (!c || c.source !== 'own' || CONSUMABLE_KINDS[c.kind].supply !== kind || leftOf(hs, id) <= 0) continue;
    if (c.amount >= need && (!cover || c.amount < CONSUMABLES[cover].amount)) cover = id;
    if (!big || c.amount > CONSUMABLES[big].amount) big = id;
  }
  return cover || big;
}
export function resolveLine(hs, want, need) {
  if (!hs) return { why: 'none' };
  if (want === 'heal' || want === 'mana') {
    const own = pickOwn(hs, want, Math.max(1, int(need, 1)));
    if (own) return { id: own, source: 'own', price: 0 };
    const id = (hs.shop && hs.shop[want]) || null;
    const b = id ? basicOf(hs, id) : null;
    if (!b || b.kind !== want) return { why: 'none' };
    if (!storeAllowed(hs, want)) return { why: 'store_off' };
    return canAfford(hs, b.price) ? { id, source: 'store', price: b.price } : { why: 'gold_short', id };
  }
  if (leftOf(hs, want) > 0) return { id: want, source: 'own', price: 0 };
  const shot = shopShotFor(hs, want);
  if (!shot) return { why: 'none' };
  return canAfford(hs, shot.price) ? { id: shot.id, source: 'store', price: shot.price } : { why: 'gold_short', id: shot.id };
}
/** Spend ONE use of a resolved line; true when it was paid for (own or store).
    An own use leaves the bag here — the one door every carried supply leaves
    by — with a `slot_dry` event the moment its line empties. */
export function takeLine(hs, line, atMs) {
  if (!line || !line.id) return false;
  if (line.source !== 'own') return buyFromShop(hs, line.id, 1) === 1;
  const l = bagLine(hs, line.id);
  if (!l || !(int(l.left, 0) > 0)) return false;
  l.left = int(l.left, 0) - 1;
  hs.tally.supplies[line.id] = (hs.tally.supplies[line.id] || 0) + 1;
  if (l.left === 0 && Array.isArray(hs._events)) hs._events.push({ type: 'slot_dry', atMs, item: line.id });
  return true;
}
/** What one use of a resolved food or drink restores: an own line by its item, a store
    line by the SERVER's catalogue row (hs.basics), never the client's copy. */
export function lineAmount(hs, line) {
  if (!line || !line.id) return 0;
  if (line.source === 'store') {
    const b = basicOf(hs, line.id);
    return b ? Math.max(0, int(b.kind === 'mana' ? b.mana : b.heals, 0)) : 0;
  }
  const c = CONSUMABLES[line.id];
  return c && c.source === 'own' ? c.amount : 0;
}

/* A kind is OUT when every essential bag line of it is empty AND the store
   may not carry on instead. Under the default `switch` (or `store`) a line
   with a store row behind it never runs out: the hunt keeps going until the
   purse runs dry, and then it ends `gold_out`, not `heals_out` / `ammo_out`.
   So these two ends are reachable only under the hero's explicit `end`. */
function essentialOut(hs, kind) {
  let any = false;
  for (const id of Object.keys(hs.bag || {})) {
    if (kindOf(id) !== kind || !isEssential(id, hs.bag[id])) continue;
    any = true;
    if (leftOf(hs, id) > 0 || (kind === 'ammo' && shopShotFor(hs, id))) return false;
  }
  if (any && kind === 'heal' && storeAllowed(hs, 'heal') && basicOf(hs, hs.shop && hs.shop.heal)) return false;
  return any;
}
const at = (ms, t) => ms !== null && ms !== undefined && Number.isFinite(Number(ms)) && t >= Number(ms);

/* THE END CHECKS, keyed by END_ORDER's names; the order is END_ORDER's. */
const END_CHECKS = Object.freeze({
  /* The hero was killed this span (combat-sim.js die): the hunt ends at the next boundary. */
  died: (hs) => hs.died === true,
  /* Another member of the party died this span: the whole party's hunt ends (Tyler 2026-10-19). */
  party_member_died: (hs) => hs.partyDied === true && hs.died !== true,
  heals_out: (hs) => essentialOut(hs, 'heal'),
  ammo_out: (hs) => essentialOut(hs, 'ammo'),
  gold_out: (hs) => hs.goldOut === true,
  /* A stop rule met (conditions.js checkStopRules); like goldOut, a flag of this span, never stored. */
  rule: (hs) => typeof hs.ruleStop === 'string' && hs.ruleStop.length > 0,
  stamina: (hs) => hs.staminaMs !== null && hs.staminaMs !== undefined && !(Number(hs.staminaMs) > 0),
  hours: (hs, t) => Number(hs.hoursLimit) > 0 && t - hs.huntFromMs >= Number(hs.hoursLimit) * 3600000,
  left: (hs, t) => at(hs.leaveAtMs, t),
  changed: (hs, t) => at(hs.changeAtMs, t),
  server: (hs, t) => at(hs.stopAtMs, t),
});
for (const k of END_ORDER) {
  if (typeof END_CHECKS[k] !== 'function') throw new Error('action-rules: END_ORDER names "' + k + '" and no check implements it');
}

/** Why the hunt ends at this swing boundary, first match in END_ORDER; null when it hunts on. */
export function endReasonAt(hs, atMs) {
  for (const k of END_ORDER) if (END_CHECKS[k](hs, atMs)) return k;
  return null;
}

/* ── STAMINA (Tyler 2026-10-14; hunt-sessions.js STAMINA_MAX_MS) ──────────────
   One swing interval of the pool: a HUNTING interval drains it 1:1 (floored at
   0 — the swing that empties it still lands, and the next boundary ends the
   hunt `stamina`); any other interval rests it back 1:1, never past `maxMs`
   (the character's cap, which the server reads from its premium column) and
   never DOWN to it (a pool above the cap is kept; resting does not take it
   away). PURE and draw-free; the database re-bounds the window's result. */
export function staminaStep(ms, intervalMs, hunting, maxMs) {
  const v = Math.max(0, Math.floor(Number(ms) || 0));
  const d = Math.max(0, Math.floor(Number(intervalMs) || 0));
  if (hunting) return Math.max(0, v - d);
  return Math.max(v, Math.min(Math.floor(Number(maxMs) || 0), v + d));
}

/* ── THE PRICE OF A DEATH (Tyler 2026-10-19; hunt-sessions.js DEATH_XP_LOSS) ──
   LEVEL: the fraction of the character's TOTAL Level XP (DEATH_XP_BASE 'total')
   or of its current Level's span ('level'), never below the start of its
   current Level (a death never de-levels; 0 at a Level floor).
   SKILLS: every combat skill (src/data/skills.js COMBAT_SKILLS) loses the same
   fraction of its PROGRESS toward its next level, never a level.
   Integer XP, floored. PURE: it draws no random number, and it is read off the
   state, not applied (the caller debits the same numbers it journals). */
export function levelDeathLoss(levelXp, fraction = DEATH_XP_LOSS, base = DEATH_XP_BASE) {
  const x = Math.max(0, Math.floor(Number(levelXp) || 0));
  const f = Number(fraction);
  if (!(f > 0)) return 0;
  const lv = charLevelFromXp(x);
  const floor = charXpForLevel(lv);
  const of = base === 'level' ? charXpForLevel(lv + 1) - floor : x;
  return Math.max(0, Math.min(Math.floor(of * f), x - floor));
}
export function skillDeathLoss(skillId, xp, fraction = DEATH_XP_LOSS) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  const f = Number(fraction);
  if (!(f > 0)) return 0;
  const into = x - skillXpForLevel(skillId, skillLevelFromXp(skillId, x));
  return Math.max(0, Math.floor(into * f));
}
/** One death's loss as `{ level?: xp, <skill>?: xp }` (zeros omitted), skills in COMBAT_SKILLS order. */
export function deathXpLoss(state, fraction = DEATH_XP_LOSS) {
  const out = {};
  const lv = levelDeathLoss(state && state.levelXp, fraction);
  if (lv > 0) out.level = lv;
  for (const k of COMBAT_SKILLS) {
    const n = skillDeathLoss(k, state && state.skills ? state.skills[k] : 0, fraction);
    if (n > 0) out[k] = n;
  }
  return out;
}

/* The server's sell-to-cover table: item → { unit (whole gold > 0), avail }. */
function coverTable(t) {
  const out = {};
  if (!t || typeof t !== 'object' || Array.isArray(t)) return out;
  for (const id of Object.keys(t)) {
    const c = t[id] || {};
    const unit = Number(c.unit);
    if (!/^[a-z0-9_]{1,64}$/.test(id) || !Number.isInteger(unit) || unit <= 0) continue;
    out[id] = { unit, avail: Math.max(0, int(c.avail, 0)) };
  }
  return out;
}

/* The server's store catalogue, kept to well-formed rows (whole gold > 0, a
   known kind, a whole effect) — never a client value. */
function shopTable(t) {
  const out = {};
  if (!t || typeof t !== 'object' || Array.isArray(t)) return out;
  for (const id of Object.keys(t)) {
    const b = t[id] || {};
    const price = Number(b.price);
    if (!/^[a-z0-9_]{1,64}$/.test(id) || !['heal', 'mana', 'ammo'].includes(b.kind) || !Number.isInteger(price) || price <= 0) continue;
    out[id] = { kind: b.kind, price, heals: Math.max(0, int(b.heals, 0)), mana: Math.max(0, int(b.mana, 0)),
      partner: typeof b.partner === 'string' ? b.partner : null };
  }
  return out;
}

/**
 * A session in the engine's shape, every field present. The settle builds it
 * from hunt_sessions / hunt_bag / player_action_sets.options (server rows);
 * the engine then owns `nextSwingAtMs`, `swingIndex`, `died`, `tally`, the
 * bag's `left`, the purse and the end stamp.
 */
export function newHuntSession(o) {
  const s = o || {};
  const from = int(s.huntFromMs, 0);
  const bag = {};
  for (const [id, l] of Object.entries(s.bag || {})) {
    const loaded = Math.max(0, int(l && l.loaded, 0));
    bag[id] = { loaded, left: Math.max(0, int(l && l.left, loaded)), essential: isEssential(id, l) };
  }
  return {
    id: String(s.id || ''),
    /* THE INSTANCE the session hunts in (hunt_instances; solo: the session's
       own id). Seeds are labelled by it, never by the session. */
    instanceId: String(s.instanceId || s.id || ''),
    huntFromMs: from,
    nextSwingAtMs: Math.max(from, int(s.nextSwingAtMs, from)),
    swingIndex: Math.max(0, int(s.swingIndex, 0)),
    bag,
    /* Killed this span (a flag of the span, never stored: the death row is). */
    died: s.died === true,
    partyDied: s.partyDied === true,
    hoursLimit: s.hoursLimit === null || s.hoursLimit === undefined ? null : int(s.hoursLimit, null),
    /* THE STORE: the server's catalogue, the ids this hunt's tier resolves
       food and drink to, the purse they are paid from, and "a buy failed". */
    basics: shopTable(s.basics),
    shop: { heal: typeof (s.shop || {}).heal === 'string' ? s.shop.heal : null,
      mana: typeof (s.shop || {}).mana === 'string' ? s.shop.mana : null },
    purse: Math.max(0, int(s.purse, 0)),
    goldOut: s.goldOut === true,
    /* THE GOLD FLOOR and the loot sell-to-cover may sell (row 3). */
    goldFloor: Math.min(GOLD_FLOOR.max, Math.max(GOLD_FLOOR.min, int(s.goldFloor, GOLD_FLOOR.default))),
    /* THE HERO'S SUPPLY SETTING (SUPPLY_SOURCE / ON_EMPTY; unknown = the
       defaults, 'mine' + 'switch'). */
    supplySource: SUPPLY_SOURCE.modes.includes(s.supplySource) ? s.supplySource : SUPPLY_SOURCE.default,
    onEmpty: ON_EMPTY.modes.includes(s.onEmpty) ? s.onEmpty : ON_EMPTY.default,
    cover: coverTable(s.cover),
    /* The stamina pool at `nextSwingAtMs`, and the cap it rests to, from the
       server's read (null pool = no read: the session then never ends on
       stamina and proposes none, and the database refuses the settle). */
    staminaMs: s.staminaMs === null || s.staminaMs === undefined ? null : Math.max(0, int(s.staminaMs, 0)),
    staminaMaxMs: Math.max(0, int(s.staminaMaxMs, 0)),
    leaveAtMs: s.leaveAtMs ?? null,
    changeAtMs: s.changeAtMs ?? null,
    stopAtMs: s.stopAtMs ?? null,
    tally: Object.assign({ swings: 0, kills: 0, deaths: 0, paidMs: 0, coins: 0,
      xp: {}, loot: {}, supplies: {}, bought: {}, covered: {} }, s.tally || {}),
    endedReason: s.endedReason || null,
    endedAtMs: s.endedAtMs ?? null,
  };
}
