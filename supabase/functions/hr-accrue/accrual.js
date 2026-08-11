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
  COMBAT_BALANCE, WEAPON_SPEED_MOD, DEFAULT_PROFILE,
  equipmentStats, armorSetBonus, playerCombatRolls, monsterCombatRolls, weaknessInfo,
} from '../../../src/core/combat.js?v=326';
import { simulateSpan } from '../../../src/core/combat-sim.js?v=326';
import { killBonusesFor } from '../../../src/core/botd.js?v=326';
import { createRng } from '../../../src/core/rng.js?v=326';
import { grantXp } from '../../../src/core/progression.js?v=326';
import { resolveStyle } from '../../../src/core/styles.js?v=326';
import { levelFromXp } from '../../../src/core/xp.js?v=326';

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
 * Byte-for-byte the same expression as the client's combatTickMs()
 * (legacy.js:2543): the same spdB clamp, the same weapon-family speed
 * identity, the same floor — because the away replay and the live scheduler
 * being given two different intervals is exactly how a hammer came to swing
 * 26% more often asleep than awake (combat-sim.js header, omission 10).
 *
 * @param equipment  server-owned { equip_slot: item_id }
 * @param items      the ITEMS catalogue
 */
export function deriveTickMs(equipment, items) {
  const eq = equipmentStats(equipment, items);
  const spd = Math.max(0, Math.min(0.20, eq.spdB || 0));
  const wmod = WEAPON_SPEED_MOD[eq.weaponType] || 1;
  return Math.max(
    COMBAT_BALANCE.minTickMs,
    Math.floor(COMBAT_BALANCE.tickMs * (1 - spd) * wmod),
  );
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
    },
    onDrop(ev) { if (ev && ev.rare) events.push({ type: 'rare_drop', item: ev.id }); },
    /* Deliberately ABSENT, and each absence is a decision, not an oversight:
         killMonster  — the client's five wrappers (dungeon keys, companions,
                        pets, collection log, chronicle) are client features
                        with no server model. simulateTick falls back to
                        resolveKill, which is the whole reward path.
         autoEat      — food_slot / auto_eat_pct are not columns on
                        player_state, so the server cannot know which food the
                        player nominated. The player therefore dies EARLIER
                        server-side than client-side: an under-pay, not a mint.
         recordKill / rollKillDeed / handleBountyKill / updateDaily /
         updateQuest  — the drop log, Farmer's Deeds, bounties, dailies and
                        quests have no server progress model yet. Emitting
                        invented progress keys now would hand the quest
                        workstream a contract it has to break. Stats ARE
                        journalled (below), because `stat` is already a legal
                        progress kind with a defined meaning.
       A missing fx handler is a no-op by construction in combat-sim.js, so
       every one of these is a silent skip rather than a crash — which is why
       they are listed here instead of being discovered by their absence. */
  };

  // ── (4) The ctx. CONSTRUCTED FIELD BY FIELD. ─────────────────────────────
  // ⚠ THE RULE (design §3): there is no spread of a caller object anywhere in
  //   this literal, and there must never be one. `tickMs` is derived below;
  //   `minTickMs` is NOT SET AT ALL, so `resolveTickMs` uses the real 600ms
  //   floor. If this were built by spreading a request body, `minTickMs` would
  //   ride in through the same door as `tickMs` and defeat the clamp that is
  //   supposed to be the second line of defence. Adding a field here is a
  //   deliberate act; that is the entire point of the shape.
  const tickMs = deriveTickMs(equipment, items);
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

  const items_ = {};
  let itemKinds = 0;
  for (const id in itemDelta) {
    // Unknown ids are refused by hr_apply against the generated hr_items
    // catalogue, which would reject the WHOLE delta — one cut monster drop
    // would cost a player their entire night. Filter here against the same
    // authored data the catalogue is generated from, and report it.
    if (!items[id]) { events.push({ type: 'unknown_item_skipped', item: id }); continue; }
    items_[id] = Math.floor(itemDelta[id]);
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
      meta: { ms: grantMs, ticks: summary.ticks, kills: summary.kills, capped },
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
