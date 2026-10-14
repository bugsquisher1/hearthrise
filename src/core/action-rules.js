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

import { SUPPLIES, HEAL_ORDER } from '../data/supplies.js?v=575';
import { RULE_SUBJECTS, COOLDOWN_GROUPS, HEAL_ANY, parseSubject } from '../data/rule-subjects.js?v=575';
import { END_ORDER, SESSION_LIMITS } from '../data/hunt-sessions.js?v=575';
import { applyBuffSegment } from './buffs.js?v=575';
import { hashSeed } from './rng.js?v=575';

const HEAL_RANK = new Map(HEAL_ORDER.map((id, i) => [id, i]));
const int = (v, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : d; };

/** The seed label of one swing, verbatim from the ruling: `hunt:<session>:<swing_index>`. */
export function swingSeedLabel(sessionId, swingIndex) {
  return 'hunt:' + String(sessionId) + ':' + int(swingIndex, 0);
}

/* THE PER-SWING SEED. `sessionSeed` is hr_seed(user, slot, 'hunt:'||session_id):
   secret-mixed, so a client cannot predict a roll, and fetched ONCE per settle
   (a per-swing hr_seed call would be ~1,500 round trips a character-hour).
   The swing index is mixed in here, so the stream depends on the swing and
   never on the window that happened to contain it. */
export function huntSwingSeed(sessionSeed, sessionId, swingIndex) {
  if (sessionSeed === undefined || sessionSeed === null || sessionSeed === '') {
    throw new Error('huntSwingSeed: a hunt session needs ctx.sessionSeed (hr_seed of the session) — refusing an unseeded swing');
  }
  return hashSeed(String(sessionSeed), swingSeedLabel(sessionId, swingIndex));
}

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
    default:
      return false;
  }
}

/* Which item a slot would spend, and why not when it cannot. */
function resolveSlot(slot, v) {
  const want = slot && slot.item;
  if (want === HEAL_ANY) {
    const id = pickHeal(v.hs, v.maxHp - v.hp);
    return id ? { id, group: 'heal' } : { why: v.hp >= v.maxHp ? 'full_hp' : 'bag_empty' };
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
  return { id: want, group: kind };
}

/**
 * THE DECISION. Pure: reads a view, returns what fires, mutates nothing.
 *
 * Pending manual presses go first, in press order, then the slots in order.
 * At most ONE use per cooldown group per swing, and none while the group's
 * cooldown runs. A press skips its slot's conditions — that is what pressing
 * means — and nothing else: it waits out a cooldown like a rule would, so a
 * press can re-order uses the rules already allow but never add one. A press
 * whose item cannot be used at all (bag empty, nothing to heal, buff refused)
 * is dropped with its reason.
 *
 * @param v { hs, hp, maxHp, buffs, atMs, buffScale }
 * @returns { uses: [{slot, id, group, manual}], keep: [slot…], dropped: [{slot, why}] }
 */
export function fireRules(v) {
  const hs = v.hs;
  const slots = Array.isArray(hs.slots) ? hs.slots : [];
  const cd = hs.cooldowns || {};
  const used = new Set();
  const out = { uses: [], keep: [], dropped: [] };
  const ready = (g) => !used.has(g) && !(Number(cd[g]) > v.atMs);
  for (const idx of Array.isArray(hs.presses) ? hs.presses : []) {
    const r = resolveSlot(slots[idx], v);
    if (!r.id) { out.dropped.push({ slot: idx, why: r.why }); continue; }
    if (!ready(r.group)) { out.keep.push(idx); continue; }
    used.add(r.group);
    out.uses.push({ slot: idx, id: r.id, group: r.group, manual: true });
  }
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s || !s.on) continue;
    const conds = Array.isArray(s.conditions) ? s.conditions : [];
    if (!conds.every((c) => conditionHolds(c, v))) continue;
    const r = resolveSlot(s, v);
    if (!r.id || !ready(r.group)) continue;
    used.add(r.group);
    out.uses.push({ slot: i, id: r.id, group: r.group, manual: false });
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
    buffs: state.buffs, atMs, buffScale: ctx.buffScale };
  const d = fireRules(v);
  hs.presses = d.keep;
  let ate = false;
  for (const u of d.uses) {
    if (u.group === 'heal') {
      state.playerHp = Math.min(state.playerMaxHp, state.playerHp + SUPPLIES[u.id].heals);
      ate = true;
    } else {
      applyBuffSegment(state.buffs, SUPPLIES[u.id].buff, { atMs, scale: ctx.buffScale });
    }
    spendFromBag(hs, u.id, 1, atMs);
    hs.cooldowns[u.group] = atMs + COOLDOWN_GROUPS[u.group].ms;
  }
  return ate;
}

function essentialOut(hs, kind) {
  let any = false;
  for (const id of Object.keys(hs.bag || {})) {
    if (kindOf(id) !== kind || !isEssential(id, hs.bag[id])) continue;
    any = true;
    if (leftOf(hs, id) > 0) return false;
  }
  return any;
}
const at = (ms, t) => ms !== null && ms !== undefined && Number.isFinite(Number(ms)) && t >= Number(ms);

/* THE END CHECKS, keyed by END_ORDER's names; the order is END_ORDER's. */
const END_CHECKS = Object.freeze({
  falls: (hs) => int(hs.falls, 0) >= int(hs.fallsLimit, SESSION_LIMITS.falls.default),
  heals_out: (hs) => essentialOut(hs, 'heal'),
  ammo_out: (hs) => essentialOut(hs, 'ammo'),
  vigour: (hs) => hs.vigourLeftMs !== null && hs.vigourLeftMs !== undefined && !(Number(hs.vigourLeftMs) > 0),
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

/**
 * A session in the engine's shape, every field present. The caller (the tick)
 * builds it from hunt_sessions / hunt_bag / player_action_sets; the engine
 * then owns `nextSwingAtMs`, `swingIndex`, `cooldowns`, `presses`, `falls`,
 * `down`, `tally`, the bag's `left` and the end stamp.
 */
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
    huntFromMs: from,
    nextSwingAtMs: Math.max(from, int(s.nextSwingAtMs, from)),
    swingIndex: Math.max(0, int(s.swingIndex, 0)),
    bag,
    slots: Array.isArray(s.slots) ? s.slots : [],
    presses: Array.isArray(s.presses) ? s.presses.slice() : [],
    cooldowns: Object.assign({ heal: 0, buff: 0 }, s.cooldowns || {}),
    falls: Math.max(0, int(s.falls, 0)),
    fallsLimit: Math.min(lim.max, Math.max(lim.min, int(s.fallsLimit, lim.default))),
    hoursLimit: s.hoursLimit === null || s.hoursLimit === undefined ? null : int(s.hoursLimit, null),
    vigourLeftMs: s.vigourLeftMs === null || s.vigourLeftMs === undefined ? null : Number(s.vigourLeftMs),
    leaveAtMs: s.leaveAtMs ?? null,
    changeAtMs: s.changeAtMs ?? null,
    stopAtMs: s.stopAtMs ?? null,
    down: !!s.down,
    tally: Object.assign({ swings: 0, kills: 0, deaths: 0, downMs: 0, paidMs: 0, coins: 0,
      xp: {}, loot: {}, supplies: {} }, s.tally || {}),
    endedReason: s.endedReason || null,
    endedAtMs: s.endedAtMs ?? null,
  };
}
