// ============================================================
// src/core/action-rules.js — THE HUNT ACTION BAR, the bag it spends, and the
// order a hunt ends in (ruling HR-2026-10-14 "Hunt Sessions replace away",
// §2 Rules / Supplies / Ending a hunt; §4 seed).
//
// A hunt session is `state.huntSession`, carried by the caller across settle
// windows. Its clock is `nextSwingAtMs`: every swing boundary is an absolute
// instant, so WHERE a settle window splits cannot move a swing, a seed, a
// cooldown or a use (TICK-1). Every relative clock the session holds (the buff
// queue's `remainingMs`) is measured from that same instant.
//
// The action bar replaces Auto-Eat inside simulateTick: `fireRules` decides,
// `runActionBar` applies. Deciding is PURE and draws nothing, so inserting it
// into a seeded swing cannot shift a later roll.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { SUPPLIES, HEAL_ORDER } from '../data/supplies.js?v=587';
import { RULE_SUBJECTS, COOLDOWN_LANES, LANE_OF_KIND, HEAL_ANY, parseSubject, TARGET_MODES, DEFAULT_TARGET_MODE,
  SLOT_TARGETS } from '../data/rule-subjects.js?v=587';
import { END_ORDER, SESSION_LIMITS, DEATH_XP_LOSS, STAMINA_MAX_MS, GOLD_FLOOR, SUPPLY_SOURCE, ON_EMPTY } from '../data/hunt-sessions.js?v=587';
import { applyBuffSegment } from './buffs.js?v=587';
import { levelFromXp, xpForLevel, MAX_LEVEL } from './xp.js?v=587';

const HEAL_RANK = new Map(HEAL_ORDER.map((id, i) => [id, i]));
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
/** The seed label of one swing: the `s` domain. */
export function swingSeedLabel(instanceId, swingIndex) {
  return seedLabel(instanceId, 's', swingIndex);
}

/* THE PER-SWING SEED is NOT derived in this file (Security, C1 review item 3).
   The label above is mixed with the session's 64-bit secret by a keyed hash
   (HMAC-SHA256, supabase/functions/hr-accrue/hunt-seed.js) and handed to the
   engine as `ctx.swingSeed(swingIndex)`; combat-sim.js refuses a swing
   without it. A 32-bit text hash here (FNV-1a, the first draft) collapsed the
   secret into one 32-bit state an observer could brute-force from swings. */

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

/* ── THE SHOP: SUPPLIES PAID PER USE (Tyler 2026-10-14: "exactly like Huntera";
   src/data/supply-basics.js, lane D) ──────────────────────────────────────────
   A shop supply is not an item. `hs.basics` is the SERVER's catalogue
   (hr_hunt_basic_supplies: id → { kind, price, heals, mana, partner }) and
   `hs.shop` the ids a "shop" slot target resolves to for this hunt's tier
   ({ heal, mana }); neither is ever a client value. A shop slot (`*heal_shop`,
   or a shop id named directly) BUYS one use when it fires: the price leaves
   `hs.purse` (the character's gold at the window start plus the coins this
   window has earned). A packed crafted line is spent by its own slot first —
   the bar walks slots in order, one use per group per swing. Ammo falls back
   per SHOT to the shop shot whose partner is the equipped arrow or rune once
   the bag line is empty (combat-sim.js spendFromQuiver). A buy the purse
   cannot cover sets `hs.goldOut`; the hunt ends `gold_out` at the next swing
   boundary. Drinks are INERT until the mana engine ships (no `mana` on a
   character): a mana slot validates and never fires. The database re-prices
   every buy from its own catalogue and debits it in the locked settle
   (hr_hunt_apply §5b). */
export function basicOf(hs, id) {
  const b = hs && hs.basics && typeof id === 'string' && Object.prototype.hasOwnProperty.call(hs.basics, id) ? hs.basics[id] : null;
  return b && Number.isInteger(b.price) && b.price > 0 ? b : null;
}
/** MAY THE STORE SUPPLY `kind` NOW? Only on the player's own choice (Master
    Design Reference §4, hunt-sessions.js SUPPLY_SOURCE / ON_EMPTY): always
    under `store`; under `mine` only with `switch` AND once no carried line of
    that kind has a use left. Every shop path asks this — the heal slot, the
    shop shot behind an empty quiver line, and the out-of-supply end test. */
export function storeAllowed(hs, kind) {
  if (!hs) return false;
  if (hs.supplySource === 'store') return true;
  if (hs.onEmpty !== 'switch') return false;
  return !Object.keys(hs.bag || {}).some((id) => kindOf(id) === kind && leftOf(hs, id) > 0);
}
/** The shop shot an empty quiver line of `ammoId` falls back to, or null —
    only when the store may supply ammo (storeAllowed) AND the bar NAMES that
    shot in a slot that is on: gold moves only through a slot that shows its
    price (master plan row 1). */
export function shopShotFor(hs, ammoId) {
  if (!hs || !storeAllowed(hs, 'ammo')) return null;
  const named = new Set((Array.isArray(hs && hs.slots) ? hs.slots : []).filter((sl) => sl && sl.on).map((sl) => sl.item));
  for (const id of Object.keys((hs && hs.basics) || {}).sort()) {
    const b = basicOf(hs, id);
    if (b && b.kind === 'ammo' && b.partner === ammoId && named.has(id)) return { id, price: b.price };
  }
  return null;
}
/** Buy `n` uses of shop supply `id` from the purse, all or none of each use.
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
   A shop use never takes the purse below the action set's `goldFloor`. When a
   use would, the hunt first sells THIS session's sellable loot to the vendor
   (`hs.cover`: item → { unit, avail }, from hr_hunt_cover_items and the
   session's own loot still in the bag — server values), CHEAPEST FIRST, just
   enough to pay; only when that is not enough does the hunt end `gold_out`.
   The database re-prices and re-bounds every unit (hr_hunt_apply §5b). */
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
/* Which shop id a slot item names: a shop target resolves by the hunt's tier
   (`hs.shop`), a shop id names itself; anything else is not a shop slot. */
function shopIdOf(hs, item) {
  if (Object.prototype.hasOwnProperty.call(SLOT_TARGETS, item)) {
    const t = SLOT_TARGETS[item];
    return t.from === 'shop' ? ((hs.shop && hs.shop[t.kind]) || null) : undefined;
  }
  return basicOf(hs, item) ? item : undefined;
}
/* Can this bar buy a use of `kind` once the bag runs dry? */
function barBuys(hs, kind) {
  return (Array.isArray(hs.slots) ? hs.slots : []).some((sl) => {
    if (!sl || !sl.on) return false;
    const id = shopIdOf(hs, sl.item);
    const b = id ? basicOf(hs, id) : null;
    return !!(b && b.kind === kind);
  });
}

/* ── THE "*heal" RULE (Game Designer balance note, lane E) ──────────────────
   The cheapest heal in the bag WHOSE AMOUNT COVERS THE MISSING HP; when none
   covers it, the LARGEST heal (ties to the cheaper). Plain cheapest-first
   would eat a 9-hp Cooked Panther Meat with 30 HP missing while a Swordfish
   Steak sat in the bag. Every covering heal lands on full HP, so inside that
   set the choice only spends gold, and cheapest wins. "Cheapest" is
   supplies.js HEAL_ORDER (book value, then heal, then id), so the answer never
   depends on the bag's key order. */
export function pickHeal(hs, deficit) {
  const need = Number(deficit);
  if (!(need > 0)) return null;
  let cover = null; let coverRank = Infinity;
  let big = null; let bigHeals = 0; let bigRank = Infinity;
  for (const id of Object.keys((hs && hs.bag) || {})) {
    if (kindOf(id) !== 'heal' || leftOf(hs, id) <= 0) continue;
    const heals = SUPPLIES[id].heals;
    const rank = HEAL_RANK.has(id) ? HEAL_RANK.get(id) : Infinity;
    if (heals >= need && rank < coverRank) { cover = id; coverRank = rank; }
    if (heals > bigHeals || (heals === bigHeals && rank < bigRank)) { big = id; bigHeals = heals; bigRank = rank; }
  }
  return cover || big;
}

function compare(lhs, op, rhs) {
  if (op === '<=') return lhs <= rhs;
  if (op === '>=') return lhs >= rhs;
  return false;
}

function buffTail(buffs, type) {
  let tail = 0;
  for (const b of Array.isArray(buffs) ? buffs : []) {
    if (b && b.type === type && b.remainingMs > tail) tail = b.remainingMs;
  }
  return tail;
}

/* One condition. An unknown subject or operator is FALSE: the slot does not
   fire. The server refuses such a slot at write time (rule-subjects.js); the
   engine still never guesses what one meant. */
export function conditionHolds(c, v) {
  const { base, param } = parseSubject(c && c.subject);
  const spec = RULE_SUBJECTS[base];
  if (!spec) return false;
  const value = int(c.value, NaN);
  switch (base) {
    case 'self_hp_pct':
      return v.maxHp > 0 && Number.isFinite(value) && compare(v.hp * 100, c.op, value * v.maxHp);
    case 'buff_left_s':
      return Number.isFinite(value) && compare(Math.floor(buffTail(v.buffs, param) / 1000), c.op, value);
    case 'buff_missing':
      return buffTail(v.buffs, param) <= 0;
    case 'bag_left':
      return Number.isFinite(value) && compare(leftOf(v.hs, param), c.op, value);
    case 'session_minutes':
      return Number.isFinite(value) && compare(Math.floor((v.atMs - v.hs.huntFromMs) / 60000), c.op, value);
    /* No mana pool (maxMana absent or 0) reads FALSE: the slot never fires. */
    case 'self_mana_pct':
      return v.maxMana > 0 && Number.isFinite(value) && compare(v.mana * 100, c.op, value * v.maxMana);
    default:
      return false;
  }
}

/* Which item a slot would spend, and why not when it cannot. `buy` marks a
   shop use; `gold_short` is a buy the purse cannot cover. */
function resolveSlot(slot, v) {
  if (slot && slot.kind !== undefined && slot.kind !== 'supply') return { why: 'not_fireable' };
  const want = slot && slot.item;
  const shopId = shopIdOf(v.hs, want);
  if (shopId !== undefined) {
    const b = shopId ? basicOf(v.hs, shopId) : null;
    if (!b) return { why: 'not_fireable' };
    if (b.kind === 'mana') return { why: 'no_mana' };          // inert until the mana engine ships
    if (b.kind !== 'heal') return { why: 'not_fireable' };     // shots are spent by the quiver, not fired
    if (!storeAllowed(v.hs, 'heal')) return { why: 'store_off' };
    if (!(v.maxHp - v.hp > 0)) return { why: 'full_hp' };
    return canAfford(v.hs, b.price)
      ? { id: shopId, kind: 'heal', buy: true } : { why: 'gold_short', item: shopId, kind: 'heal' };
  }
  if (Object.prototype.hasOwnProperty.call(SLOT_TARGETS, want) && SLOT_TARGETS[want].kind === 'mana') {
    return { why: 'no_mana' };                                  // the bag drink: inert until mana
  }
  if (want === HEAL_ANY) {
    const id = pickHeal(v.hs, v.maxHp - v.hp);
    return id ? { id, kind: 'heal' } : { why: v.hp >= v.maxHp ? 'full_hp' : 'bag_empty' };
  }
  const kind = kindOf(want);
  if (kind !== 'heal' && kind !== 'buff') return { why: 'not_fireable' };
  if (leftOf(v.hs, want) <= 0) return { why: 'bag_empty' };
  if (kind === 'heal' && !(v.maxHp - v.hp > 0)) return { why: 'full_hp' };
  if (kind === 'buff') {
    const trial = (Array.isArray(v.buffs) ? v.buffs : []).map((b) => Object.assign({}, b));
    const r = applyBuffSegment(trial, SUPPLIES[want].buff, { atMs: v.atMs, scale: v.buffScale });
    if (!r.ok) return { why: r.why };
  }
  return { id: want, kind };
}

/* A queued press, as stored (`{slot, at}`, hunt_sessions.presses, at = the
   server instant of the press in epoch ms) or as a bare slot index (a press
   with no time, due at once). */
function pressOf(e) {
  if (e && typeof e === 'object') {
    const at = Number(e.at);
    return { slot: int(e.slot, -1), at: Number.isFinite(at) ? at : -Infinity };
  }
  return { slot: int(e, -1), at: -Infinity };
}

/**
 * THE DECISION. Pure: reads a view, returns what fires, mutates nothing.
 *
 * Pending manual presses go first, in press order, then the slots in order.
 * A press is never considered before its own `at` (lane C2: the press lands at
 * the first swing boundary at or after the moment it was made — never earlier,
 * so a press cannot reach back into a window it did not see). A press not yet
 * due keeps its place in the queue.
 * At most ONE use per cooldown LANE per swing (rule-subjects.js COOLDOWN_LANES:
 * every supply is a `consumable`), and none while the lane's cooldown runs. A press skips its slot's conditions — that is what pressing
 * means — and nothing else: it waits out a cooldown like a rule would, so a
 * press can re-order uses the rules already allow but never add one. A press
 * whose item cannot be used at all (bag empty, nothing to heal, buff refused)
 * is dropped with its reason.
 *
 * A slot (rule or press) that wanted an NPC basic the purse cannot pay is
 * reported in `short`: the purse ran dry, and the hunt ends `gold_out`.
 *
 * @param v { hs, hp, maxHp, mana, maxMana, buffs, atMs, buffScale }
 * @returns { uses: [{slot, id, kind, lane, manual, buy}], keep: [press…] (as queued), dropped: [{slot, why}], short }
 */
export function fireRules(v) {
  const hs = v.hs;
  const slots = Array.isArray(hs.slots) ? hs.slots : [];
  const cd = hs.cooldowns || {};
  const used = new Set();
  const out = { uses: [], keep: [], dropped: [], short: false };
  const laneOf = (r) => LANE_OF_KIND[r.kind] || null;
  const ready = (r) => { const l = laneOf(r); return !!l && !used.has(l) && !(Number(cd[l]) > v.atMs); };
  for (const entry of Array.isArray(hs.presses) ? hs.presses : []) {
    const p = pressOf(entry);
    const idx = p.slot;
    if (p.at > v.atMs) { out.keep.push(entry); continue; }
    const r = resolveSlot(slots[idx], v);
    if (r.why === 'gold_short' && ready(r)) out.short = true;
    if (!r.id) { out.dropped.push({ slot: idx, why: r.why }); continue; }
    if (!ready(r)) { out.keep.push(entry); continue; }
    used.add(laneOf(r));
    out.uses.push({ slot: idx, id: r.id, kind: r.kind, lane: laneOf(r), manual: true, buy: r.buy === true });
  }
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s || !s.on) continue;
    const conds = Array.isArray(s.conditions) ? s.conditions : [];
    if (!conds.every((c) => conditionHolds(c, v))) continue;
    const r = resolveSlot(s, v);
    /* A rule that would have fired (its lane ready) but cannot pay: the purse ran dry. */
    if (r.why === 'gold_short' && ready(r)) out.short = true;
    if (!r.id || !ready(r)) continue;
    used.add(laneOf(r));
    out.uses.push({ slot: i, id: r.id, kind: r.kind, lane: laneOf(r), manual: false, buy: r.buy === true });
  }
  return out;
}

/* Spend ONE unit from a bag line: the tally, the line, and a `slot_dry` event
   the moment it empties. Ammo arrives here too, from simulateTick's quiver
   view, so every supply leaves the bag through one door. */
export function spendFromBag(hs, id, n, atMs) {
  const line = bagLine(hs, id);
  const take = Math.min(Math.max(0, int(n, 0)), line ? Math.max(0, int(line.left, 0)) : 0);
  if (take <= 0) return 0;
  line.left = int(line.left, 0) - take;
  const sup = hs.tally.supplies;
  sup[id] = (sup[id] || 0) + take;
  if (line.left === 0 && Array.isArray(hs._events)) hs._events.push({ type: 'slot_dry', atMs, item: id });
  return take;
}

/**
 * Decide and APPLY the action bar for one swing. Called by simulateTick where
 * Auto-Eat used to be: after the monster's swing, before the death check, so a
 * heal still lands in time to survive the blow that made it necessary.
 * @returns true when a heal was eaten (the swing's `ate`)
 */
export function runActionBar(state, ctx) {
  const hs = state.huntSession;
  const atMs = Number(ctx.atMs) || 0;
  /* A blow that took the last HP is a fall; nothing fires on a body. Without
     this a heal would raise the dead (resolveAutoEat's `hp <= 0` rule). */
  if (!(Number(state.playerHp) > 0)) return false;
  if (!Array.isArray(state.buffs)) state.buffs = [];
  const v = { hs, hp: Number(state.playerHp) || 0, maxHp: Number(state.playerMaxHp) || 0,
    mana: Number(state.playerMana) || 0, maxMana: Number(state.playerMaxMana) || 0,
    buffs: state.buffs, atMs, buffScale: ctx.buffScale };
  const d = fireRules(v);
  hs.presses = d.keep;
  if (d.short) hs.goldOut = true;
  let ate = false;
  /* A heal line only heals and a buff line only buffs, whatever else the item
     does when eaten by hand — Auto-Eat's two rules (a heal never applies its
     timed buff; a Feast is never eaten for HP), kept. */
  for (const u of d.uses) {
    /* A shop use is paid BEFORE it works; fireRules already checked the purse,
       so a refusal here is a defect, and it simply does not fire. */
    if (u.buy && buyFromShop(hs, u.id, 1) !== 1) continue;
    if (u.kind === 'heal') {
      const heals = u.buy ? basicOf(hs, u.id).heals : SUPPLIES[u.id].heals;
      state.playerHp = Math.min(state.playerMaxHp, state.playerHp + heals);
      ate = true;
    } else {
      applyBuffSegment(state.buffs, SUPPLIES[u.id].buff, { atMs, scale: ctx.buffScale });
    }
    if (!u.buy) spendFromBag(hs, u.id, 1, atMs);
    hs.cooldowns[u.lane] = atMs + COOLDOWN_LANES[u.lane].ms;
  }
  return ate;
}

/* A kind is OUT when every essential bag line of it is empty AND the shop
   cannot carry on instead: a bar with a shop heal slot keeps eating, and an
   empty arrow / rune line with a shop shot behind it keeps shooting, until the
   purse runs dry — then the hunt ends `gold_out`, not `heals_out` / `ammo_out`. */
function essentialOut(hs, kind) {
  let any = false;
  for (const id of Object.keys(hs.bag || {})) {
    if (kindOf(id) !== kind || !isEssential(id, hs.bag[id])) continue;
    any = true;
    if (leftOf(hs, id) > 0 || (kind === 'ammo' && shopShotFor(hs, id))) return false;
  }
  if (any && kind === 'heal' && barBuys(hs, 'heal') && (hs.supplySource === 'store' || hs.onEmpty === 'switch')) return false;
  return any;
}
const at = (ms, t) => ms !== null && ms !== undefined && Number.isFinite(Number(ms)) && t >= Number(ms);

/* THE END CHECKS, keyed by END_ORDER's names; the order is END_ORDER's. */
const END_CHECKS = Object.freeze({
  falls: (hs) => int(hs.falls, 0) >= int(hs.fallsLimit, SESSION_LIMITS.falls.default),
  heals_out: (hs) => essentialOut(hs, 'heal'),
  ammo_out: (hs) => essentialOut(hs, 'ammo'),
  gold_out: (hs) => hs.goldOut === true,
  stamina: (hs) => hs.staminaMs !== null && hs.staminaMs !== undefined && !(Number(hs.staminaMs) > 0),
  hours: (hs, t) => Number(hs.hoursLimit) > 0 && t - hs.huntFromMs >= Number(hs.hoursLimit) * 3600000,
  left: (hs, t) => at(hs.leaveAtMs, t),
  changed: (hs, t) => at(hs.changeAtMs, t),
  server: (hs, t) => at(hs.stopAtMs, t),
});
for (const k of END_ORDER) {
  if (typeof END_CHECKS[k] !== 'function') throw new Error('action-rules: END_ORDER names "' + k + '" and no check implements it');
}

/* ── STAMINA (Tyler 2026-10-14; data row STAMINA_MAX_MS) ──────────────────────
   One swing interval of the pool: a HUNTING interval drains it 1:1 (floored at
   0 — the swing that empties it still lands, and the next boundary ends the
   hunt `stamina`); any other interval rests it back 1:1, never past the cap
   and never DOWN to it (a refill may hold it above the cap; resting does not
   take that away). PURE and draw-free, so a seeded swing replays identically,
   and per interval, so N windows walk exactly what one span does (TICK-1).
   The database re-bounds the window's result (hr_hunt_apply §5a). */
export function staminaStep(ms, intervalMs, hunting, maxMs = STAMINA_MAX_MS) {
  const v = Math.max(0, Math.floor(Number(ms) || 0));
  const d = Math.max(0, Math.floor(Number(intervalMs) || 0));
  if (hunting) return Math.max(0, v - d);
  return Math.max(v, Math.min(Math.floor(Number(maxMs) || 0), v + d));
}

/* ── THE PRICE OF A FALL (Tyler 2026-10-14; data row DEATH_XP_LOSS) ─────────
   Each skill the fight trains — the combat style's XP route, `style.xp`'s
   keys (Attack when no style resolved, exactly as killXpRoute credits) — loses
   DEATH_XP_LOSS of the XP its CURRENT level needs to reach the next, and only
   out of the progress made inside that level: never a de-level, 0 at a level
   floor, 0 at the top level. Integer XP, floored, so the loss can never round
   up past the bound the database re-checks (hr_hunt_apply). PURE: it draws no
   random number, so a seeded swing replays identically with it. */
export function deathXpLossFor(xp, fraction = DEATH_XP_LOSS) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  const lv = levelFromXp(x);
  if (lv >= MAX_LEVEL) return 0;
  const floor = xpForLevel(lv);
  const gap = xpForLevel(lv + 1) - floor;
  const f = Number(fraction);
  if (!(f > 0) || !(gap > 0)) return 0;
  return Math.max(0, Math.min(Math.floor(gap * f), x - floor));
}
/** The skills a fall costs: the style's XP route, sorted (one order, every caller). */
export function deathXpSkills(style) {
  const route = style && style.xp && typeof style.xp === 'object' ? Object.keys(style.xp) : ['attack'];
  return route.slice().sort();
}
/** One fall's loss as `{skill: xp}` (zeros omitted), read off `skills` and
    NOT applied — the caller debits the same numbers it journals. */
export function deathXpLoss(skills, style, fraction = DEATH_XP_LOSS) {
  const out = {};
  for (const k of deathXpSkills(style)) {
    const n = deathXpLossFor(skills ? skills[k] : 0, fraction);
    if (n > 0) out[k] = n;
  }
  return out;
}

/** Why the hunt ends at this swing boundary, first match in END_ORDER; null when it hunts on. */
export function endReasonAt(hs, atMs) {
  for (const k of END_ORDER) if (END_CHECKS[k](hs, atMs)) return k;
  return null;
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

/* The server's shop catalogue, kept to well-formed rows (whole gold > 0, a
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
 * A session in the engine's shape, every field present. The caller (the tick)
 * builds it from hunt_sessions / hunt_bag / player_action_sets; the engine
 * then owns `nextSwingAtMs`, `swingIndex`, `cooldowns`, `presses`, `falls`,
 * `down`, `tally`, the bag's `left` and the end stamp.
 */
function pullState(p, fromMs) {
  const x = p || {};
  const size = Math.max(1, int(x.size, 1));
  return {
    size,
    respawnMs: Math.max(0, int(x.respawnMs, 0)),
    /* A pull a smaller action-set count left standing keeps its foes. */
    left: Math.max(0, int(x.left, 0)),
    respawnAtMs: int(x.respawnAtMs, fromMs),
    pulls: 0,
  };
}

export function newHuntSession(o) {
  const s = o || {};
  const from = int(s.huntFromMs, 0);
  const bag = {};
  for (const [id, l] of Object.entries(s.bag || {})) {
    const loaded = Math.max(0, int(l && l.loaded, 0));
    bag[id] = { loaded, left: Math.max(0, int(l && l.left, loaded)), essential: isEssential(id, l) };
  }
  const lim = SESSION_LIMITS.falls;
  return {
    id: String(s.id || ''),
    /* THE INSTANCE the session hunts in (hunt_instances; solo: the session's
       own id). Seeds are labelled by it, never by the session. */
    instanceId: String(s.instanceId || s.id || ''),
    huntFromMs: from,
    nextSwingAtMs: Math.max(from, int(s.nextSwingAtMs, from)),
    swingIndex: Math.max(0, int(s.swingIndex, 0)),
    bag,
    slots: Array.isArray(s.slots) ? s.slots : [],
    presses: Array.isArray(s.presses) ? s.presses.slice() : [],
    cooldowns: Object.assign({ consumable: 0 }, s.cooldowns || {}),
    falls: Math.max(0, int(s.falls, 0)),
    fallsLimit: Math.min(lim.max, Math.max(lim.min, int(s.fallsLimit, lim.default))),
    hoursLimit: s.hoursLimit === null || s.hoursLimit === undefined ? null : int(s.hoursLimit, null),
    /* THE SHOP: the server's catalogue, the ids this hunt's tier resolves a
       shop slot to, the purse they are paid from, and "a buy failed". */
    basics: shopTable(s.basics),
    shop: { heal: typeof (s.shop || {}).heal === 'string' ? s.shop.heal : null,
      mana: typeof (s.shop || {}).mana === 'string' ? s.shop.mana : null },
    purse: Math.max(0, int(s.purse, 0)),
    goldOut: s.goldOut === true,
    /* THE ACTION SET'S TARGET MODE AND PULL COUNT (Huntera's bar), clamped to
       the data vocabulary. Read by the settle; the single-target engine fights
       one foe at a time until the combat redesign gives them a fight to shape. */
    targetMode: (typeof s.targetMode === 'string' && Object.prototype.hasOwnProperty.call(TARGET_MODES, s.targetMode)
      && TARGET_MODES[s.targetMode].solo) ? s.targetMode : DEFAULT_TARGET_MODE,
    /* THE SPAWN CYCLE (Security design review 2026-10-14 items 1-2). `size` and
       `respawnMs` are the SERVER's (hr_hunt_pull_of: the action set's pull count
       clamped to the ground and to rule-subjects.js PULL_CAP, and the ground's
       respawn scaled to it) — the engine never clamps a pull of its own. `left`
       foes of the current pull are still standing; the next pull comes back at
       `respawnAtMs` (absolute ms; the first is the arrival). `pulls` counts the
       pulls this WINDOW started, which hr_hunt_apply re-proves. */
    pull: pullState(s.pull, from),
    /* THE GOLD FLOOR and the loot sell-to-cover may sell (row 3). */
    goldFloor: Math.min(GOLD_FLOOR.max, Math.max(GOLD_FLOOR.min, int(s.goldFloor, GOLD_FLOOR.default))),
    /* HUNT SUPPLIES: where supplies come from and what an empty carried line
       does (SUPPLY_SOURCE / ON_EMPTY; unknown = the defaults, 'mine' + 'end'). */
    supplySource: SUPPLY_SOURCE.modes.includes(s.supplySource) ? s.supplySource : SUPPLY_SOURCE.default,
    onEmpty: ON_EMPTY.modes.includes(s.onEmpty) ? s.onEmpty : ON_EMPTY.default,
    cover: coverTable(s.cover),
    /* The stamina pool at `nextSwingAtMs`, from the server's read (null = no
       read: the session then never ends on stamina and proposes none, and the
       database refuses the settle — fail closed). */
    staminaMs: s.staminaMs === null || s.staminaMs === undefined ? null : Math.max(0, int(s.staminaMs, 0)),
    leaveAtMs: s.leaveAtMs ?? null,
    changeAtMs: s.changeAtMs ?? null,
    stopAtMs: s.stopAtMs ?? null,
    down: !!s.down,
    tally: Object.assign({ swings: 0, kills: 0, deaths: 0, downMs: 0, paidMs: 0, coins: 0,
      xp: {}, loot: {}, supplies: {}, bought: {}, covered: {} }, s.tally || {}),
    endedReason: s.endedReason || null,
    endedAtMs: s.endedAtMs ?? null,
  };
}
