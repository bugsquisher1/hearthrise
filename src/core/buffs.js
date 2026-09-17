// ============================================================
// src/core/buffs.js — the timed-consumable registry, and the buff clock
// as a FUNCTION OF ELAPSED TIME rather than a setInterval.
//
// WHY THIS MOVED (and it is not tidiness)
//
// The buff clock was `setInterval(… 1000)` inside legacy.js's buff-queue
// block. An interval only runs in a live tab. But buffs reached the AWAY
// replay through the getBonus chain, which is not gated on presence. So:
//
//     eat a 10-minute drop-rate buff -> close the tab -> come back 12 hours
//     later -> collect twelve hours of BUFFED gathering -> the buff still
//     reads 10:00, because nothing ticked it.
//
// A live exploit, and not a subtle one. It is not fixable inside an
// interval: "does this buff pay for the hour you were away, and does that
// hour drain it?" is a question about ELAPSED TIME, which an interval
// cannot answer. Hence `tickBuffs(buffs, elapsedMs, ctx)`.
//
// THE ANSWER CHANGED, AND THE QUESTION IS WHY IT WAS EVER "FROZEN"
//
// The first answer (b326) was: a timed buff is FROZEN while away — it neither
// pays nor ticks down. That closed the exploit, but it closed it by removing
// the buff from the away model entirely, and it was justified by a
// timed-vs-permanent split that was never the real line.
//
// The real line is SERVER-WIDE vs PERSONAL (Tyler, 2026-08-14 — see the header
// of src/core/away.js). A blessing is something the world does for people who
// are in it. A Feast is something the player did to their own character, and
// it is still true while they sleep. So the buff channel PAYS away.
//
// Which means it must also DRAIN away, and the two halves are the same rule
// stated once: `AWAY_SCOPE.buff` opens the payout, `tickBuffs` no longer
// refuses to spend the clock, and src/core/combat-sim.js `simulateSpan` hands
// it real elapsed time tick by tick. A ten-minute Feast eaten on the way out
// pays the first ten minutes of the night and expires; the other seven hours
// fifty minutes run unbuffed — which is exactly what would have happened had
// the player sat and watched. The freeze that survives is `active === false`:
// a buff is spent on WORK, and idling is not work. Away combat is work.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { CHANNEL, channelApplies } from './away.js?v=548';

/* Maps buff.type -> {label, bonusKey, isPercent|isFlat, glyph}.
   `bonusKey` is the getBonus key the effect pays into; a type with no row
   here is REJECTED by applyBuff, which is how a tooltip promising an
   effect the engine throws away gets caught at authoring time. */
export const BUFFS_DEF = {
  /* `glyph` is an ATLAS KEY (src/data/glyphs.js), drawn by the Active Effects
     panel and the buff pill through HR.icon(). It used to be `icon` holding a
     raw emoji, and the comment that stood here reasoned about WHICH SYSTEM
     EMOJI FONT rendered it least badly on Segoe vs Apple Color — which is the
     argument for not shipping emoji as art in the first place. */
  gather_speed: { label: 'Gather Speed', bonusKey: 'gatherSpeed', isPercent: true, glyph: 'uiLeaf' },
  all_xp: { label: 'All XP', bonusKey: 'allXP', isPercent: true, glyph: 'uiXp' },
  drop_rate: { label: 'Drop Rate', bonusKey: 'dropRate', isPercent: true, glyph: 'uiGift' },
  /* b228: `farmYield` is a COUNT of extra crops, never a percentage. This
     entry once claimed isPercent, so Carrot Stew's "15" reached the engine
     as 0.15 of a crop and harvestPlot floored it to nothing. */
  farm_yield: { label: 'Farm Yield', bonusKey: 'farmYield', isPercent: false, isFlat: true, glyph: 'uiWheat' },
  damage: { label: 'Damage', bonusKey: 'damage', isPercent: true, glyph: 'uiSword' },
  /* b238: a FLAT bump to defence (a +4 food buff reads "+4", not "+4%"),
     consumed by monsterCombatRolls. */
  defense: { label: 'Defense', bonusKey: 'defense', isPercent: false, isFlat: true, glyph: 'uiShield' },
  combat_xp: { label: 'Combat XP', bonusKey: 'combatXP', isPercent: true, glyph: 'uiTarget' },
  gold_find: { label: 'Gold Find', bonusKey: 'goldFind', isPercent: true, glyph: 'uiCoinStack' },
  /* Pays into the `crit` bonus key, which is ALSO fed by gear (`critB` + the
     armour-set bonus). Under b326 this buff was the ruling's worked example of
     an exclusion — crit applied away, this did not, and it fell out for free
     because it is a BUFF. That is no longer true in either direction: the buff
     channel pays away now, so a Void Banquet's +5% crit reaches an away swing
     and then runs out mid-night like any other Feast. Still no special case —
     which is the property that survived the rule changing under it. */
  damage_crit: { label: 'Critical Chance', bonusKey: 'crit', isPercent: true, glyph: 'uiSpark' },
};

/* ── THE DRAIN RULE, AS ONE NAMED CONSTANT (game-designer, final, 2026-09-13) ──
   WALL-CLOCK. A buff's authority is an ABSOLUTE `until` on player_state.buffs,
   stamped by hr_apply from now() + the catalogue duration, so a Feast is true
   while you sleep and runs out at the INSTANT it would have run out had you sat
   and watched. Every derivation of "how much is left" goes through
   `remainingAtMs` below, so a ruling the other way (drain only while working)
   is a change to this constant and that one function — not a sweep of callers.

     'wall-clock'  now() decides. The rule as shipped.
     'worked'      only time spent on a paid action drains it. NOT shipped;
                   named so the alternative is a value and not a rewrite.

   ✔ DONE (step 2, 2026-09-13): `tickBuffs`'s `ctx.active === false` freeze is
     GONE. It predated the ruling and contradicted it — an idling character's wall
     clock still runs — and it was a CLIENT-ONLY divergence: every engine caller
     passes `active: true` (combat-sim, skill-sim, artisan-sim), so the server has
     always drained by wall clock while the live tab froze the countdown whenever
     the player stopped doing something. The player-visible symptom was the worst
     shape a timer can take: the pill read "8m 40s" for an hour, the player ate
     nothing, and the buff was already over on the server. */
export const BUFF_DRAIN_RULE = 'wall-clock';

/* The server's ceiling on a buff's expiry: `until` is clamped to
   now() + BUFF_MAX_UNTIL_MS by hr_apply (c_buff_max_ms, 2026-09-13-consumable-
   buffs.sql) and tools/gen-catalogues.mjs refuses to emit a food that lasts
   longer. Mirrored here because the away engine derives a remaining time from
   the same number and two ceilings for one bound is two numbers that can drift;
   tests/buff-queue.mjs asserts the SQL constant and this one agree. */
export const BUFF_MAX_UNTIL_MS = 3600000;

/**
 * How much of a buff is left AT A GIVEN INSTANT, under BUFF_DRAIN_RULE.
 *
 * @param until  epoch ms, or an ISO string / Date (the projection sends ISO)
 * @param atMs   the instant to measure at — the START of the window being
 *               priced, never `Date.now()`: the away engine measures at
 *               `credit.fromMs` so a buff that expired mid-absence still pays
 *               the slice it was alive for, and the client measures at the
 *               envelope's own `now`. There is no default on purpose; a caller
 *               that reaches for the local clock has to say so.
 * @returns ms remaining, floored at 0. 0 for an unparseable/absent expiry —
 *          the fail-safe direction is "not running".
 */
export function remainingAtMs(until, atMs) {
  const u = (until instanceof Date) ? until.getTime()
    : (typeof until === 'number' ? until : Date.parse(String(until)));
  const at = Number(atMs);
  if (!isFinite(u) || !isFinite(at)) return 0;
  return Math.max(0, u - at);
}

/**
 * Build the queue the simulators drain from the SERVER's absolute-`until` rows.
 *
 * `player_state.buffs` is `[{type, magnitude, until}]` with an absolute
 * timestamp, because an absolute expiry is the only shape that survives a
 * process that is not running: a stored `remainingMs` would have to be ticked by
 * somebody, and "somebody" was the setInterval this module's header is about.
 * The simulators want `remainingMs` (they walk a tick timeline), so the two
 * representations meet HERE, once, at the window boundary.
 *
 * Entries with an unknown type or nothing left at `atMs` are DROPPED — the same
 * liveness rule `activeBuffs` applies, so a caller cannot end up with a queue
 * whose members the bonus function refuses to pay (a boundary that changes
 * nothing is a segment that pays twice — see `nextBuffExpiryMs`).
 *
 * @param rows  the projected/stored array (anything else → [])
 * @param atMs  the instant the window starts (see remainingAtMs)
 * @returns a FRESH array of fresh objects — the simulators mutate what they are
 *          given, and mutating the caller's projected envelope would make the
 *          drain invisible in one place and permanent in another.
 */
export function buffQueueFromServer(rows, atMs) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    if (!isKnownBuff(r.type)) continue;
    const mag = Number(r.magnitude);
    if (!isFinite(mag) || mag <= 0) continue;
    const remainingMs = remainingAtMs(r.until, atMs);
    if (remainingMs <= 0) continue;
    out.push({ type: r.type, magnitude: mag, remainingMs, until: r.until });
  }
  return out;
}

/** Is this a buff type the engine can actually pay? */
export function isKnownBuff(type) {
  return !!(type && Object.prototype.hasOwnProperty.call(BUFFS_DEF, type));
}

/** The still-running buffs in a queue. */
export function activeBuffs(buffs) {
  if (!Array.isArray(buffs)) return [];
  return buffs.filter((b) => b && b.remainingMs > 0 && isKnownBuff(b.type));
}

/**
 * Is ANY buff still running? The same predicate as `activeBuffs().length > 0`,
 * without the array — `simulateSpan` asks it once per tick, and an 8-hour
 * absence is ~12,000 ticks. Same answer or this is a bug: the two are asserted
 * equivalent in the suite rather than left to look alike.
 */
export function hasActiveBuff(buffs) {
  if (!Array.isArray(buffs)) return false;
  for (const b of buffs) {
    if (b && b.remainingMs > 0 && isKnownBuff(b.type)) return true;
  }
  return false;
}

/**
 * How much longer until the SOONEST live buff runs out — the next instant at
 * which the away payout changes. `Infinity` when nothing is running, which is
 * the honest answer and also the one a caller can pass straight to
 * `Math.min(remaining, boundary)` without a special case.
 *
 * WHY THIS EXISTS AND WHY IT IS HERE. `simulateSpan` can afford to ask "is a
 * buff alive?" once per swing because it already walks a tick timeline. The
 * gather/artisan away replay does not walk one: it computes `ticks = floor(
 * spanMs / interval)` once and runs that many identical actions, and it CANNOT
 * become a per-tick loop cheaply, because a `gather_speed` buff expiring
 * changes the interval itself — the very number the tick count was derived
 * from. So that caller needs the other shape: split the span at the boundaries
 * and run each slice at its own rate, exactly as `utcDaySegments` splits an
 * absence at the boundaries where the Boss of the Day changes.
 *
 * This is the boundary query for that split, and it lives beside `activeBuffs`
 * so it applies the SAME liveness rule (`remainingMs > 0` and a type the
 * registry knows). A caller re-deriving it would eventually disagree with the
 * function that decides what pays — an unknown buff type would create a
 * boundary that changes nothing, which is a segment that pays twice.
 */
export function nextBuffExpiryMs(buffs) {
  let soonest = Infinity;
  if (!Array.isArray(buffs)) return soonest;
  for (const b of buffs) {
    if (!b || !isKnownBuff(b.type)) continue;
    const r = Number(b.remainingMs);
    if (isFinite(r) && r > 0 && r < soonest) soonest = r;
  }
  return soonest;
}

/* ── PER-SEGMENT ENTRIES, AND WHY SUMMING THEM WOULD DOUBLE-PAY ─────────────
   (game-designer ruling, final, 2026-09-13 — the F2 answer.)

   The first stacking model MERGED a second helping into the existing row:
   `magnitude = max(old, new)`, `until = old.until + duration`. That LAUNDERS the
   magnitude — a 20-second scrap of Cooked Herring (+1%) extended a Void Banquet
   (+5%) by twenty seconds AT +5%, for the price of a herring. The ruling replaces
   the merge with SEGMENTS: the queue may hold SEVERAL entries of one type,
   contiguous and ordered by `until`, each carrying its OWN magnitude, and the
   effective bonus at any instant is the entry whose window contains that instant.

   THE INSTANT'S ENTRY IS THE ONE WITH THE SMALLEST POSITIVE `remainingMs`, and
   that is a property of contiguity rather than a heuristic: segment k ends at
   u(k) and segment k+1 covers [u(k), u(k+1)], so at any `now` inside the queue
   every later segment has strictly MORE left than the one running. The queue
   therefore needs no "current index" to maintain, no pointer to get wrong across a
   reload, and no second representation.

   ⚠ SUMMING IS WHAT THIS USED TO DO, AND IT WAS A MINT. Measured on the designer's
     own worked example: +5% and +2% read 0.07 for the whole overlap, i.e. the cheap
     trout ADDED its magnitude to the expensive elixir — strictly worse than the
     max() merge it replaced, and the exact laundering the ruling exists to prevent.

   ONE FUNCTION, because the client's getBonus chain, the away engine
   (combat-sim / skill-sim / artisan-sim all read `ctx.bonus`) and the pill must not
   each decide which segment is running. DIFFERENT TYPES STILL SUM — they are
   different effects, and no two types share a `bonusKey` (asserted by the suite),
   so grouping by type is the same partition as grouping by key. */
export function effectiveBuffs(buffs) {
  const live = activeBuffs(buffs);
  if (live.length < 2) return live;
  const byType = new Map();
  for (const b of live) {
    const cur = byType.get(b.type);
    if (cur === undefined) { byType.set(b.type, b); continue; }
    const r = Number(b.remainingMs); const rc = Number(cur.remainingMs);
    /* The shorter remainder is the running segment. A TIE is two entries claiming
       the same instant — a shape the server cannot produce (contiguous windows have
       distinct ends) — so it is resolved deterministically and in the player's
       favour rather than by array order, which would make the payout depend on the
       projection's sort being stable. */
    if (r < rc || (r === rc && Number(b.magnitude) > Number(cur.magnitude))) byType.set(b.type, b);
  }
  return [...byType.values()];
}

/**
 * Aggregate a buff queue into { bonusKey: total }.
 *
 * @param buffs the queue (G.buffs)
 * @param ctx   { away } — the buff channel is PERSONAL and pays away; what
 *              stops an away payout is the buff running out, which is a
 *              property of `remainingMs` and therefore of whoever advanced
 *              the clock. See `tickBuffs`.
 */
export function buffBonuses(buffs, ctx) {
  const out = {};
  if (!channelApplies(CHANNEL.BUFF, ctx)) return out;
  for (const b of effectiveBuffs(buffs)) {
    const def = BUFFS_DEF[b.type];
    /* A FLAT key's magnitude is already in its own units (crops, defence
       points); every other key is a percentage stored as an integer. */
    out[def.bonusKey] = (out[def.bonusKey] || 0) + (def.isFlat ? b.magnitude : b.magnitude / 100);
  }
  return out;
}

/** One key's contribution. The shape getBonus's wrapper wants. */
export function buffBonusFor(buffs, key, ctx) {
  const all = buffBonuses(buffs, ctx);
  return typeof all[key] === 'number' ? all[key] : 0;
}

/**
 * Advance the buff clock by `elapsedMs`. THE clock — there is no other.
 *
 * Mutates `buffs` in place (the queue is display state on the client and
 * simulation state in the engine) and reports what happened so the caller can
 * prune and repaint.
 *
 * @param ctx { away } — kept for callers and for symmetry with `buffBonuses`;
 *        NOTHING in it freezes the clock any more, and there is no state of the
 *        world in which it should.
 *          away:   never a freeze. An away buff PAYS (src/core/away.js
 *                  `AWAY_SCOPE.buff`), so an away buff must be spent, or "it pays
 *                  away" is a mint: ten minutes of Feast would cover eight hours.
 *          active: DELETED (step 2, 2026-09-13). `BUFF_DRAIN_RULE` is
 *                  'wall-clock' and an idle character's wall clock runs, so a
 *                  freeze here contradicted the rule this module names. It was
 *                  also unreachable on the server — combat-sim, skill-sim and
 *                  artisan-sim all pass `active: true` — which made it a
 *                  CLIENT-ONLY lie: the pill stopped counting down while the
 *                  server's absolute `until` went right on expiring. The
 *                  authority is `until`; a client clock that pauses cannot be an
 *                  input to it.
 *
 * @returns { changed, frozen, expired: [type], elapsedMs } — `frozen` is
 *          retained and is ALWAYS false, so a caller that renders a "paused" row
 *          off it renders nothing rather than throwing while it is removed.
 */
export function tickBuffs(buffs, elapsedMs, ctx) {
  const dt = Number(elapsedMs) || 0;
  const res = { changed: false, frozen: false, expired: [], elapsedMs: dt };
  if (!Array.isArray(buffs) || buffs.length === 0) return res;
  if (dt <= 0) return res;
  for (const b of buffs) {
    if (!b || b.remainingMs <= 0) continue;
    b.remainingMs -= dt;
    if (b.remainingMs <= 0) { res.changed = true; res.expired.push(b.type); }
  }
  return res;
}

/** Drop expired entries. Returns the surviving array (a new array). */
export function pruneBuffs(buffs) {
  if (!Array.isArray(buffs)) return [];
  return buffs.filter((b) => b && b.remainingMs > 0);
}
