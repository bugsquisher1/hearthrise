// ============================================================================
// supabase/functions/hr-accrue/accrual.js — the SERVER ACCRUAL ENGINE.
//
// Phase C. Given server-owned state and a server timestamp, decide what a
// player is owed for the time they were away, and express it as a delta for
// hr_apply. This file computes; it does no I/O, opens no connection, reads no
// request and knows nothing about HTTP. index.ts does all of that.
//
// ── WHY THE SPLIT ──────────────────────────────────────────────────────────
// The exploit surface of an accrual engine is its INPUTS, and inputs are only
// auditable if you can see all of them in one place. `computeAccrual` takes a
// single explicit object; every field is named in this file; there is no
// spread, no Object.assign from a caller-supplied bag, and no default that
// reaches for an ambient value. A reviewer can therefore answer "what can the
// client influence?" by reading one function signature instead of tracing a
// request body through four call frames.
//
// It also means the whole engine runs in plain Node, so the parity contract
// (a span computed here must equal the client's simulateSpan for the same
// inputs and seed) is provable by a test rather than by deployment.
//
// ── ONE SIMULATION ─────────────────────────────────────────────────────────
// Nothing below re-implements a rule. Every number comes out of src/core:
// the tick interval from src/core/combat.js's constants, the fight from
// src/core/combat-sim.js's `simulateSpan` — the SAME function the live 2.4s
// tick runs — the XP grant from src/core/progression.js `grantXp`, the
// featured boss from src/core/botd.js, the away scope from src/core/away.js.
// A second copy of the maths is the failure this whole program exists to
// prevent, so if you find yourself typing an arithmetic operator on a game
// value in this file, you are writing a bug.
//
// PURE ESM. No DOM, no window, no timers, no Math.random, no fetch.
// ============================================================================

import {
  DEFAULT_PROFILE, swingIntervalMs,
  equipmentStats, armorSetBonus, playerCombatRolls, monsterCombatRolls, weaknessInfo,
} from '../../../src/core/combat.js';
import { simulateSpan } from '../../../src/core/combat-sim.js';
import { resolveAutoEat, thresholdFromPct } from '../../../src/core/auto-eat.js';
import { killBonusesFor } from '../../../src/core/botd.js';
import { createRng } from '../../../src/core/rng.js';
import { grantXp } from '../../../src/core/progression.js';
import { resolveStyle } from '../../../src/core/styles.js';
import { levelFromXp } from '../../../src/core/xp.js';

/* The floor on an accrual. Below this nothing is simulated and — unlike the
   client, which advances its watermark regardless (legacy.js:987) — NOTHING IS
   WRITTEN. The client had to advance, because its watermark was also its
   "have I already paid this?" record. The server's watermark is `accrued_to`,
   and leaving it alone simply means the next call sees a slightly longer span.
   That is strictly better: the client's behaviour quietly confiscates every
   sub-threshold absence, and the server has no reason to inherit that. */
export const ACCRUE_MIN_MS = 60000;

/* An absolute fuse on the span, independent of hr_offline_cap_ms. If the cap
   function is ever wrong, mis-granted or replaced, this still bounds one
   accrual to a day of ticks. Two independent limits, because `capMs` is the
   single highest-leverage number in the grant after tickMs. */
export const ACCRUE_MAX_SPAN_MS = 24 * 3600000;

/* Reasons a call did nothing. Machine codes, never prose — the client
   localises (design §2, "Error taxonomy"). These are not errors: they are the
   ordinary answer for a player who has nothing to collect. */
export const SKIP = {
  NO_ACTIVITY: 'idle',
  UNSUPPORTED: 'unsupported_activity',
  TOO_SOON: 'below_min_span',
  NO_TARGET: 'unknown_monster',
  NOTHING: 'nothing_accrued',
};

/* The perk stack, server-side. Returns 0 for every channel.
   THIS IS NOT A STUB THAT FORGOT SOMETHING — it is the honest state of the
   world: renown, property, blessings, world events and consumable buffs are
   not server-owned yet, and the away ruling puts blessings and buffs out of
   scope while away anyway. Equipment-sourced power does NOT come through here;
   it comes through `equipmentStats`, which reads server-owned player_equipment.
   So the only thing currently missing from an away grant is the permanent
   renown/property/clan perk channel, which under-pays. Under-paying is the
   correct direction to be wrong in, and it closes when those move into tables.

   ⚠ BUT UNDER-PAYING IS NOT THE ONLY DIRECTION THIS ENGINE IS WRONG IN, and
     saying so anywhere is a claim this file cannot support. `equipment` is read
     at COLLECT time and prices the WHOLE window: log off naked, equip
     best-in-slot, collect, and the night is paid at best-in-slot rates.
     Measured 2026-08-11, same seed and same 12h goblin fixture, varying nothing
     but the equipment map: 477g / 3,235 Attack XP naked versus 6,103g / 65,029
     naked→BiS — 12.8x gold and 20x XP. That is review S5, it is an OVER-payment,
     it is deliberately deferred to Phase D (no client path can start an activity
     today, so it has no live blast radius), and it must ship in the same
     migration as the first client-reachable activity intent. See
     docs/design/server-authority.md §3.
   Named and exported so a test can assert it is inert rather than trusting a
   closure. */
export function zeroBonus() { return 0; }

/**
 * The swing interval, DERIVED — never accepted.
 *
 * `ticks = floor(elapsed / tickMs)` makes this a DIVISOR of elapsed time and
 * therefore the largest single lever in the whole grant: a 12h absence at the
 * honest 2.4s swing budgets ~18,000 ticks; at 1ms it budgets ~43,200,000.
 * (design §3, "interval_ms is the accrual engine's largest lever".)
 *
 * b329: this used to be a HAND COPY of the client's combatTickMs(), annotated
 * "byte-for-byte the same expression". It is now literally the same function —
 * `src/core/combat.js swingIntervalMs()` — because the moment a third speed
 * term arrived (the style's `speedMod`), "byte-for-byte by comment" was one
 * edit away from being false, and two intervals is exactly how a hammer came to
 * swing 26% more often asleep than awake (combat-sim.js header, omission 10).
 *
 * `style` is still DERIVED, never accepted: the caller resolves it from the
 * server-owned weapon family, and `swingIntervalMs` clamps `speedMod` to
 * [1.00, 2.00], so no style row — present, absent or hostile — can shrink the
 * divisor below the family baseline.
 *
 * @param equipment  server-owned { equip_slot: item_id }
 * @param items      the ITEMS catalogue
 * @param style      the resolved COMBAT_STYLES row (optional)
 */
export function deriveTickMs(equipment, items, style) {
  return swingIntervalMs(equipmentStats(equipment, items), style);
}

/** The stat profile, derived from the equipped weapon family. Mirrors
    legacy.js:7906 getCombatStatProfile, which reads the same weapon type. */
export function deriveProfile(weaponType) {
  if (weaponType === 'magic') {
    return { type: 'magic', accuracySkill: 'magic', damageSkill: 'magic',
             accuracyBonusField: 'magicAtkB', strengthBonusField: 'magicStrB' };
  }
  if (weaponType === 'ranged') {
    return { type: 'ranged', accuracySkill: 'ranged', damageSkill: 'ranged',
             accuracyBonusField: 'rangeAtkB', strengthBonusField: 'rangeStrB' };
  }
  return Object.assign({}, DEFAULT_PROFILE, { type: weaponType || 'sword' });
}

/* A finite, non-negative integer or the fallback. Used on every number that
   crosses into this engine from a database row — a NULL column, a bigint
   arriving as a string, or a NaN would otherwise propagate into `Math.floor`
   and out the other side as a grant. */
function nat(v, fallback) {
  const n = Number(v);
  return (Number.isFinite(n) && n >= 0) ? n : fallback;
}

/**
 * THE ACCRUAL.
 *
 * @param input  every field is server-owned. Named exhaustively on purpose —
 *               see the header. NOTHING here may originate in a request body.
 *   userId       uuid, from the verified JWT subject
 *   slot         int, the only client-chosen value in the whole call, and it
 *                selects a row the caller already owns
 *   nowMs        the SERVER clock (`select now()`), never the client's
 *   accruedToMs  player_state.accrued_to
 *   activeSinceMs player_state.active_since
 *   activeKind   player_state.active_kind
 *   activeId     player_state.active_id
 *   capMs        hr_offline_cap_ms(), computed in Postgres
 *   seed         hr_seed(user, slot, 'accrue:<accrued_to>') — mixes a 256-bit
 *                server-only secret, so the roll is replayable for a dispute
 *                but not precomputable by the player (design §3, review S20)
 *   hp, maxHp, gold   player_state
 *   skills       { skill_id: xp }        from player_skills
 *   equipment    { equip_slot: item_id } from player_equipment
 *   inventory    { item_id: qty }        from player_inventory — READ, and
 *                partially SPENT: auto-eat consumes food out of it. This is
 *                the first input the engine both reads and debits, which is
 *                why the delta below is signed.
 *   autoEatEnabled  player_state.auto_eat_enabled — the purchased-trait
 *                receipt. FALSE by default and false for every character until
 *                hr_set_auto_eat is called, so this handler is inert rather
 *                than generous on the day it ships.
 *   autoEatFood  player_state.auto_eat_food — the nominated Provision, or null
 *   autoEatPct   player_state.auto_eat_pct — integer percent, 0..100
 *   items        ITEMS,   the authored catalogue (src/data/items.js)
 *   monsters     MONSTERS, ditto
 *
 * @returns { accrued: false, reason } | { accrued: true, delta, summary, … }
 */
export function computeAccrual(input) {
  const inp = input || {};

  // ── (0) The activity pointer. Combat only in Phase C. ────────────────────
  // Gathering and artisan accrual are the next slices; refusing them here —
  // rather than falling through to "no ticks" — matters, because a fall-through
  // would advance the watermark and silently confiscate the gathering time the
  // next phase is supposed to pay.
  if (inp.activeKind !== 'combat' || !inp.activeId) {
    return { accrued: false, reason: inp.activeKind && inp.activeKind !== 'idle'
      ? SKIP.UNSUPPORTED : SKIP.NO_ACTIVITY };
  }
  const monsters = inp.monsters || {};
  if (!monsters[inp.activeId]) return { accrued: false, reason: SKIP.NO_TARGET };

  // ── (1) The span. SERVER CLOCK ONLY. ─────────────────────────────────────
  const nowMs = nat(inp.nowMs, 0);
  const accruedToMs = nat(inp.accruedToMs, nowMs);
  const capMs = Math.min(ACCRUE_MAX_SPAN_MS, nat(inp.capMs, 0));

  // THE SECOND WATERMARK, and it is not decoration. `accrued_to` is only
  // advanced by a caller that remembers to send `accrued_to` in its delta, so
  // a `start_activity` intent that forgets it would leave a stale watermark and
  // hand the first accrual an absence the player did not spend fighting. That
  // is a genuine (capped) mint. `active_since` is stamped by hr_apply itself
  // from now() on `restart:true` and is not in the delta contract as a value,
  // so clamping to it closes the hole from this side as well: you can never be
  // paid for more time than the activity has actually existed.
  const sinceMs = nat(inp.activeSinceMs, accruedToMs);
  const elapsedMs = Math.max(0, nowMs - accruedToMs);
  const sinceActivityMs = Math.max(0, nowMs - sinceMs);
  const grantMs = Math.min(elapsedMs, sinceActivityMs, capMs);

  if (!(capMs > 0)) return { accrued: false, reason: 'no_cap' };
  if (grantMs < ACCRUE_MIN_MS) return { accrued: false, reason: SKIP.TOO_SOON };
  const capped = elapsedMs > grantMs;

  // ── (2) The simulation state. Field by field, from server rows. ──────────
  const skills0 = {};
  for (const k in (inp.skills || {})) skills0[k] = nat(inp.skills[k], 0);

  const items = inp.items || {};
  const equipment = inp.equipment || {};
  const eq = equipmentStats(equipment, items);
  const setBonus = armorSetBonus(equipment, items);
  const profile = deriveProfile(eq.weaponType);
  /* The player's chosen style is NOT server state yet (there is no column and
     no intent that sets it), so the server uses the default for the equipped
     weapon family. See "Known limitations" in the change contract — this
     changes XP ROUTING (Accurate trains Attack, Aggressive trains Strength),
     never the total, and it closes when a set_style intent exists. */
  const style = resolveStyle(eq.weaponType, null);

  const maxHp = Math.max(1, nat(inp.maxHp, 10));
  const state = {
    activeMonster: inp.activeId,
    monsterHp: 0, monsterMaxHp: 0,          // repaired by simulateSpan
    playerHp: Math.min(maxHp, Math.max(0, nat(inp.hp, maxHp))),
    playerMaxHp: maxHp,
    gold: 0,                                 // a DELTA accumulator, see below
    /* A COPY. `grantXp` mutates `state.skills` in place, so handing it
       `skills0` itself would make the "before" and the "after" the same object
       and every XP delta below would compute as zero — a silent, total loss of
       every skill grant in an absence, with kills, gold and drops all still
       correct so nothing looks wrong. Found by the parity test; it is exactly
       the always-null-probe shape this program has been bitten by four times. */
    skills: { ...skills0 },
    stats: {},
    combatKillsThisFoe: 0,
  };
  /* `state.gold` starts at ZERO rather than at the player's balance. resolveKill
     does `state.gold = state.gold + gp`, so it accumulates the delta directly —
     and hr_apply's `gold` key is a DELTA, not an absolute. Seeding it with the
     real balance and subtracting afterwards would work too, but it would put a
     player's whole fortune inside a simulation that has no reason to know it,
     and one careless `= ` instead of `+=` downstream would then send an
     absolute to a contract expecting a delta. Start at zero and the mistake is
     unreachable. */

  // ── (3) The delta accumulators, fed by the effect sink. ──────────────────
  const itemDelta = Object.create(null);
  const events = [];
  const levelUps = [];

  /* THE LIVE BAG. A running view of what the character owns DURING the
     absence, not just what they gained: `startInv + everything addItem has
     credited - everything autoEat has consumed`.

     It has to be live rather than a snapshot for one reason the parity test
     pins: the client's maybeAutoEat reads `G.inventory`, which `addItem`
     mutates, so a Cooked Shark that DROPS at hour two is edible at hour three.
     A server that ate only from the starting stack would diverge from the
     client on exactly the long absences where it matters most.

     Quantities are coerced through nat() because they arrive from a jsonb
     round trip, where a bigint is a string. `'5000' - 1` is 4999 in JS but
     `'5000' > 0` and `Number('5000')` are the only forms that survive being
     compared and decremented, so the coercion is not decoration. */
  const bag = Object.create(null);
  for (const id in (inp.inventory || {})) {
    const q = Math.floor(nat(inp.inventory[id], 0));
    if (q > 0) bag[id] = q;
  }

  /* THE PURCHASED-TRAIT GATE, and it fails CLOSED.
     Auto-Eat costs 100 Bounty Marks in the Store and the client refuses to eat
     without `G.traits.auto_eat` (auto-actions.js). `player_state.auto_eat_enabled`
     can only be set true by hr_set_auto_eat, which requires the server-side
     ownership flag — so the column IS the receipt that the trait was owned when
     it was switched on. Reading it here rather than re-deriving ownership from
     the progress envelope is deliberate: that envelope is LIMIT-ed (hr_state_of
     caps the progress read at 1000 rows and reports `progress_truncated`), and a
     survival mechanic must never depend on a read that can be truncated. One
     non-truncatable column on the row hr_apply already locks. */
  /* ONE input, not two. `resolveAutoEat` takes `enabled` and `owned`
     separately because the CLIENT genuinely holds two facts —
     `G.autoActions.eat.enabled` (the toggle) and `G.traits.auto_eat` (the
     purchase). The server holds one: hr_set_auto_eat refuses to write
     `auto_eat_enabled = true` without the ownership flag, so the column IS
     both facts and there is nothing to cross-check.
     Deriving them from the same value under two names was the first shape
     here, and it was worse than useless: it read like defence in depth while
     being one variable, so a mutation that bypassed `owned` changed nothing and
     the test that was supposed to catch it passed. One name, and the core's
     `owned` gate is asserted directly in tests/accrual-engine.mjs instead. */
  const autoEatOn = inp.autoEatEnabled === true;
  const eatCfg = {
    enabled: autoEatOn,
    owned: autoEatOn,
    threshold: thresholdFromPct(inp.autoEatPct),
    foodId: (typeof inp.autoEatFood === 'string' && inp.autoEatFood) ? inp.autoEatFood : null,
  };
  let foodEaten = 0;

  const fx = {
    /* XP goes through the SHARED grant, not a bare accumulator. grantXp applies
       PACE.xp (0.39 — a raw sum would over-pay by 2.5x), the perk block, the
       single floor and the "a positive grant never rounds to zero" rule, and it
       mutates state.skills. Skipping it would not be an optimisation; it would
       be a second XP formula. */
    addXp(skillId, amt) {
      const res = grantXp(state, skillId, amt, {
        bonus: zeroBonus,
        xpB: eq.xpB || 0,
        restedQuantum: 0,     // Rested XP is not server state yet.
        authored: false,
      });
      for (const ev of res.events) {
        if (ev.type !== 'levelup') continue;
        /* The client raises max HP on a Hitpoints level (legacy.js:2003). The
           server must do the same or a long absence ends with a character whose
           max HP silently disagrees with their level. */
        if (ev.skill === 'hitpoints') state.playerMaxHp = ev.to;
        levelUps.push({ skill: ev.skill, from: ev.from, to: ev.to });
      }
    },
    addItem(id, qty) {
      const n = Math.floor(Number(qty) || 0);
      if (!id || n <= 0) return;
      itemDelta[id] = (itemDelta[id] || 0) + n;
      bag[id] = (bag[id] || 0) + n;      // edible from the moment it drops
    },
    onDrop(ev) { if (ev && ev.rare) events.push({ type: 'rare_drop', item: ev.id }); },

    /* ── AUTO-EAT ─ survival, not a bonus. The ruling is explicit that it
       stays away and keeps consuming, and combat-sim.js calls it after the
       monster's swing and BEFORE the death check, so a successful eat is what
       keeps an unattended night running.

       It was absent here until 2026-08-15, and because a missing fx handler is
       a no-op by construction the absence was silent: the server never healed,
       the character died at the first bad streak, and everything after that
       moment paid nothing. Measured against the client on the same seed and
       the same state — the ONLY difference being whether this handler exists:

         early-game goblin        -90.5% kills, died 1.17h into a 12h night
         maxed vs slime           -62.9% kills, died 4.44h in
         maxed vs the day-1 boss  -99.0% kills, died 7.9 MINUTES in

       The decision is `src/core/auto-eat.js resolveAutoEat` — literally the
       same function `HearthriseAuto.maybeAutoEat()` now calls — so the two
       sides cannot answer differently. Only the APPLY differs: the client
       mutates G, this accumulates a delta.

       IT DRAWS NO RANDOM NUMBERS. That is a contract, not a coincidence: the
       fight is seeded, so a handler that consumed a draw would shift every
       later roll and the parity test would be comparing two different fights.

       The debit is signed into the SAME `items` map as the gains, because
       hr_apply's item block is signed and re-checks `have + delta >= 0`
       server-side. The bag bookkeeping means the engine structurally cannot
       propose eating food the character does not own — which matters because
       `insufficient_item` is NOT on index.ts's DEGRADABLE list, so proposing
       one would 409 an entire night rather than shorten it. */
    autoEat() {
      const decision = resolveAutoEat({
        enabled: eatCfg.enabled,
        owned: eatCfg.owned,
        hp: state.playerHp,
        maxHp: state.playerMaxHp,
        threshold: eatCfg.threshold,
        foodId: eatCfg.foodId,
        inventory: bag,
        items,
      });
      if (!decision) return false;
      state.playerHp = decision.hp;
      bag[decision.foodId] -= 1;
      if (bag[decision.foodId] <= 0) delete bag[decision.foodId];
      itemDelta[decision.foodId] = (itemDelta[decision.foodId] || 0) - 1;
      foodEaten++;
      return true;
    },

    /* Deliberately ABSENT, and each absence is a decision, not an oversight:
         killMonster  — the client's five wrappers (dungeon keys, companions,
                        pets, collection log, chronicle) are client features
                        with no server model. simulateTick falls back to
                        resolveKill, which is the whole reward path.
         recordKill / rollKillDeed / handleBountyKill / updateDaily /
         updateQuest  — the drop log, Farmer's Deeds, bounties, dailies and
                        quests have no server progress model yet. Emitting
                        invented progress keys now would hand the quest
                        workstream a contract it has to break. Stats ARE
                        journalled (below), because `stat` is already a legal
                        progress kind with a defined meaning.
       A missing fx handler is a no-op by construction in combat-sim.js, so
       every one of these is a silent skip rather than a crash — which is why
       they are listed here instead of being discovered by their absence.

       ⚠ AND UNDER THE 2026-08-15 RULING ("the offline portion should function
         exactly the same as if the player was still online", Tyler) every one
         of them is a MUST-CLOSE, not a tradeoff. They are listed as remaining
         work with a named dependency, not as accepted behaviour. */
  };

  // ── (4) The ctx. CONSTRUCTED FIELD BY FIELD. ─────────────────────────────
  // ⚠ THE RULE (design §3): there is no spread of a caller object anywhere in
  //   this literal, and there must never be one. `tickMs` is derived below;
  //   `minTickMs` is NOT SET AT ALL, so `resolveTickMs` uses the real 600ms
  //   floor. If this were built by spreading a request body, `minTickMs` would
  //   ride in through the same door as `tickMs` and defeat the clamp that is
  //   supposed to be the second line of defence. Adding a field here is a
  //   deliberate act; that is the entire point of the shape.
  /* b329: the style is passed because it now carries a speed term. It is the
     SAME `style` object simulateSpan routes XP through, resolved above from
     server-owned equipment — never from the request body. */
  const tickMs = deriveTickMs(equipment, items, style);
  const ctx = {
    away: true,                    // this IS the away path (docs/design/away-time-ruling.md)
    fromMs: nowMs - grantMs,
    toMs: nowMs,
    tickMs,                        // DERIVED from server-owned equipment
    capped,
    rng: createRng(nat(inp.seed, 0)),
    monsters,
    items,
    bonus: zeroBonus,
    style,
    /* activeBuffCount = 0: the server holds no buffs, so `buffsPaused` reports
       false and the welcome-back line cannot claim buffs were paused when the
       player had none. Stating it beats letting the null-default guess. */
    activeBuffCount: 0,
    playerRolls(m) {
      return playerCombatRolls(m, {
        eq, equipment, items, skills: state.skills,
        bonus: zeroBonus, setBonus, profile, style,
      });
    },
    monsterRolls(m) {
      return monsterCombatRolls(m, { eq, skills: state.skills, bonus: zeroBonus });
    },
    weakness(m) { return weaknessInfo(m, eq); },
    /* Boss of the Day, resolved PER UTC-DAY SEGMENT of the absence, from the
       SERVER instant. simulateSpan rebinds this per segment, so an absence
       crossing UTC midnight pays each half its own day's boss (the ruling). */
    botdFor(atMs) {
      return { killBonuses(id) { return killBonusesFor(id, atMs, monsters); } };
    },
    fx,
  };

  // ── (5) Run the SHARED span. ─────────────────────────────────────────────
  const summary = simulateSpan(state, ctx);

  // ── (6) Turn the mutated state into a delta hr_apply will accept. ────────
  // Every value below is an INTEGER. hr_apply casts with `::bigint`, and a
  // fractional string ('12.32' — which a 0.33-ratio style XP split produces
  // before grantXp floors it) raises invalid_text_representation and comes back
  // as `bad_delta`. Integers are a contract requirement, not tidiness.
  const xpDelta = {};
  for (const k in state.skills) {
    const gained = Math.floor((state.skills[k] || 0) - (skills0[k] || 0));
    if (gained > 0) xpDelta[k] = gained;
  }
  const goldDelta = Math.floor(state.gold || 0);

  /* THE ITEM DELTA IS SIGNED. Gains come from drops; the one negative is food
     auto-eat consumed. hr_apply's item block is signed too — it re-reads
     `player_inventory` under the row lock and rejects `have + delta < 0` as
     `insufficient_item` — so the bag arithmetic above is the engine's promise
     and that check is the database's verification of it. */
  const items_ = {};
  let itemKinds = 0;
  const startQty = (id) => Math.floor(nat((inp.inventory || {})[id], 0));
  for (const id in itemDelta) {
    // Unknown ids are refused by hr_apply against the generated hr_items
    // catalogue, which would reject the WHOLE delta — one cut monster drop
    // would cost a player their entire night. Filter here against the same
    // authored data the catalogue is generated from, and report it.
    if (!items[id]) { events.push({ type: 'unknown_item_skipped', item: id }); continue; }
    const n = Math.floor(itemDelta[id]);
    // A net zero is not a no-op to hr_apply — it is a catalogue lookup, a row
    // lock and a ledger byte for nothing. Drop it.
    if (n === 0) continue;
    /* THE FLOOR, and it is deliberately redundant. `bag` already makes a
       propose-more-than-owned impossible, but this delta is the thing that
       crosses a network hop into a function whose rejection costs the player a
       whole night — and `insufficient_item` is NOT on index.ts's DEGRADABLE
       list, so it does not shorten the span, it 409s it. Two independent locks
       on the one error that has no recovery path. */
    if (n < 0 && startQty(id) + n < 0) {
      events.push({ type: 'overeat_clamped', item: id });
      const floored = -startQty(id);
      if (floored === 0) continue;
      items_[id] = floored;
    } else {
      items_[id] = n;
    }
    itemKinds++;
  }

  const nothingHappened =
    goldDelta === 0 && itemKinds === 0 && Object.keys(xpDelta).length === 0
    && !summary.died && summary.ticks === 0;
  if (nothingHappened) return { accrued: false, reason: SKIP.NOTHING, summary };

  const stats = state.stats || {};
  const progress = [];
  const stat = (key, n) => { if (n > 0) progress.push({ kind: 'stat', key, period: '', add: Math.floor(n), state: 'active' }); };
  stat('kills', stats.kills);
  stat('crits', stats.crits);
  stat('deaths', stats.deaths);
  stat('rare_drops', stats.rareDrops);

  const delta = {
    // A watermark the SERVER computed and hr_apply then clamps into
    // [old, now()] — it can move neither backwards (paying the same seconds
    // twice) nor forwards (paying for time that has not happened).
    //
    // NOTE it is `now`, not `fromMs + grantMs`, even when CAPPED. A capped
    // absence forfeits its excess, which is the b307 per-absence rule the
    // ruling explicitly preserves ("signing in resets the timer"). Advancing
    // only to the paid instant would let a 40-hour absence be collected as four
    // full 12h nights in a row — a cap that can be drained in instalments is
    // not a cap.
    accrued_to: new Date(nowMs).toISOString(),
    hp: Math.max(0, Math.min(state.playerMaxHp, Math.floor(state.playerHp))),
    journal: {
      kind: 'combat',
      intent: 'accrue',
      // AGGREGATE, never per-tick and never per-kill. The receipt for why:
      // game_events reached 1.6M rows / 229 MB from six players in four days by
      // journalling every kill. One row per accrual, a handful of scalars.
      // `ate` is the count of auto-eats. It is an aggregate like everything
      // else here — never a row per meal — and it is the only trace of the
      // food a night consumed, which a support request about a vanished
      // Cooked Shark stack has to be answerable from.
      meta: { ms: grantMs, ticks: summary.ticks, kills: summary.kills, capped,
              ate: foodEaten },
    },
  };
  if (goldDelta > 0) delta.gold = goldDelta;
  if (itemKinds > 0) delta.items = items_;
  if (Object.keys(xpDelta).length) delta.xp = xpDelta;
  if (progress.length) delta.progress = progress;
  // A death ends the fight. Sent only when it happened, because an `activity`
  // key is a complete, re-validated activity statement (hr_apply R11) and
  // restating an unchanged pointer buys nothing but a catalogue lookup.
  if (summary.died || !state.activeMonster) delta.activity = { kind: 'idle', id: null };

  return {
    accrued: true,
    delta,
    grantMs,
    capped,
    tickMs,
    foodEaten,
    watermark: delta.accrued_to,
    events,
    levelUps,
    summary: {
      ...summary,
      // The Art Director's b326 field. Computed server-side, by the simulation,
      // so the welcome-back line can say "+50% drops" (daily) or "+100%"
      // (weekly) instead of a renderer guessing and halving a weekly night.
      featuredDropMult: summary.featuredDropMult,
      gold: goldDelta,
      xp: xpDelta,
      items: items_,
      levelUps,
    },
  };
}

/** Derived levels for the envelope, so the client never computes one. */
export function levelsOf(skills) {
  const out = {};
  for (const k in (skills || {})) out[k] = levelFromXp(Number(skills[k]) || 0);
  return out;
}
