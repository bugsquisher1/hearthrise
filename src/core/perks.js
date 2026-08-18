// ============================================================
// src/core/perks.js — THE PERMANENT PERK CHANNEL, as one rule, for both sides.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────
// `supabase/functions/hr-accrue/accrual.js` passes `zeroBonus()` to every
// simulation it runs. Every permanent bonus a player has bought therefore
// reads **0** server-side. Two consequences, and they are different in kind:
//
//   (a) ARTISAN IS UNSHIPPABLE, not merely under-paid. `noBurn` is the
//       Kitchen rung. At the recipe's required level `burnChance` is
//       BURN_BASE 0.25 with noBurn 0, against 0.12 / 0.06 / 0.00 at Kitchen
//       rungs 1 / 2 / 3+. A server that cooked today would DESTROY a quarter
//       of the input the player's Cast-Iron Range makes burn-proof. That is
//       not an under-payment at the margin, it is the server taking items
//       away, and it is why `src/core/skill-sim.js` refuses `artisan` in
//       PAYABLE_KINDS in writing rather than by omission.
//
//   (b) COMBAT ACCRUAL ALREADY UNDER-PAYS, silently, today. A Trophy Room at
//       L5 plus a Watchtower is +7% combatXP; a Great Library plus the
//       Hearthrise Castle capstone is +7% allXP. Every away night the engine
//       has ever priced paid none of it.
//
// ── WHY IT IS PURE, AND WHY BOTH SIDES RUN IT ────────────────────────
// The client's number and the server's must not be able to differ. On the
// client the perk stack is `getBonus` — a base function plus SIX additive
// monkey-patch wrappers (docs/design/bonus-rebase.md §1). That chain reaches
// for `window`, for `G`, and for five feature modules that are classic
// scripts Deno cannot import. So the chain cannot move; the DECISION moves,
// exactly as `src/core/auto-eat.js` did for auto-eat and `src/core/artisan.js`
// did for the burn maths.
//
// What lives here is the PERMANENT half of layer 0 — the half that is (or
// will be) server-owned state. `src/legacy.js getBonus` now delegates to it
// instead of computing it inline, and `hr-accrue` calls it with the same
// state read out of the database. Neither side has its own copy of the
// arithmetic.
//
// The six wrapper layers ABOVE layer 0 are untouched and are not this file's
// business: companions, food buffs, clan level perks, the castle, the muster
// aura and blessings each still add through their own owner. Which of them
// pay while away is `src/core/away.js AWAY_SCOPE`'s ruling, not this file's.
// This file is the `permanent` channel, and `AWAY_SCOPE.permanent` is true.
//
// PURE ESM. No DOM, no window, no timers, no Math.random, no RNG at all —
// a perk stack draws nothing, so inserting it into a seeded fight moves no
// later roll. That is what lets the away parity test compare byte for byte.
// ============================================================

import { ROOM_PERKS, ROOM_RUNG_EXTRAS, ROOM_PERK_KEYS } from '../data/perks.js?v=389';

export { ROOM_PERKS, ROOM_RUNG_EXTRAS, ROOM_PERK_KEYS };

/* ══════════════════════════════════════════════════════════════════════════
   1 · THE SOURCES THAT ARE NOT A TABLE

   The three plot buildings and the property capstone were LITERALS inside
   getBonus (`t += 0.02` and friends), not rows in PLOT_BUILDINGS — its rows
   carry name/icon/cost/desc and no bonus at all. They are authored HERE and
   getBonus delegates, so there is exactly ONE copy and nothing to guard.
   (Extracting a literal out of a function body by regex would be the
   "source-text regex standing in for a numeric assertion" failure this repo
   has already recorded once.)

   Magnitudes are bonus-rebase.md §3.1 as shipped in b228: Toolshed 5%→2%,
   Watchtower already in grammar at 2%, Scarecrow's +0.1 (a ghost —
   harvestPlot floored it to zero) became a real +1.
   ══════════════════════════════════════════════════════════════════════════ */

/* PER INSTANCE, not per id. `plot` unlocks are repeatable (Scarecrow max 2),
   and getBonus iterated `G.plotBuildings` — an ARRAY with one entry per
   building owned — so two Scarecrows really do pay +2 farmYield. The perk
   state therefore carries a COUNT, and this table is multiplied by it.
   Getting that wrong in the direction of "one each" would have been a silent
   under-pay of exactly the kind this file exists to end. */
export const PLOT_PERKS = Object.freeze({
  toolshed: Object.freeze({ gatherSpeed: 0.02 }),
  scarecrow: Object.freeze({ farmYield: 1 }),
  watchtower: Object.freeze({ combatXP: 0.02 }),
  /* farm_plot pays no bonus — it grants a PLOT, which is capacity. Listed so
     a reader can see it was considered rather than missed. */
  farm_plot: Object.freeze({}),
});

/* The property capstone: owning the Hearthrise Castle, the last tier.
   b228 brought it to +2% on the wide-key half-step (bonus-rebase.md §3.1). */
export const CAPSTONE_PERKS = Object.freeze({ allXP: 0.02 });

/* Tier index of the Hearthrise Castle in src/features/homestead.js TIERS
   (camp 0 · homestead 1 · farmstead 2 · manor 3 · keep 4 · CASTLE 5), and the
   same number src/data/shops.js grants: `property:castle` → amount 5.
   Named rather than inlined because `isCastle()` on the client is
   `getTier() === TIERS.length - 1`, and a sixth tier must move both. */
export const CASTLE_TIER = 5;

/* ══════════════════════════════════════════════════════════════════════════
   2 · THE BUDGET

   docs/design/bonus-rebase.md §2.2 / §4.1, as shipped in
   src/features/power-budget.js. The numbers live HERE now because the server
   has no wrapper chain to install a fuse at the end of: `makeBonus` below is
   the whole stack it will ever see, so the clamp has to be inside it.

   ⚠ src/features/power-budget.js still declares its own three literals. It is
     a classic-script IIFE that reads them at parse time, before core-bridge's
     deferred module has published HearthriseCore, so it cannot import them
     without a boot-order assumption — and a boot-order assumption is exactly
     the escaped-fuse failure that file was written to end. The two copies are
     pinned equal by a smoke assertion (B349-4), the same remedy that keeps
     KITCHEN_NO_BURN and the ROOMS Kitchen rungs honest.
   ══════════════════════════════════════════════════════════════════════════ */
export const PERMANENT_CAP = 0.20;
export const TEMPORARY_CAP = 0.15;
export const TOTAL_CAP = 0.30;

/* The nine keys the budget governs — every one multiplies a RATE.
   Everything else a rung can pay is deliberately outside it:
     farmYield      capacity — a COUNT of extra crops, not a multiplier
     noBurn         reliability — burn-proof is burn-proof; it cannot stack
                    into a faucet, and burnChance() already floors at 0
     buffDuration   duration — lengthens a window, never raises a magnitude
     craftSave, yield_cooking, yield_smithing
                    output procs, inside the 4/8% grammar and an order of
                    magnitude below any cap */
export const GOVERNED = Object.freeze({
  allXP: 1, combatXP: 1, goldFind: 1,
  gatherSpeed: 1, cookSpeed: 1, smithSpeed: 1, craftSpeed: 1, prayerSpeed: 1,
  raidPower: 1,
});

export function governed(key) { return own(GOVERNED, key) && GOVERNED[key] === 1; }

/* ⚠ EVERY DYNAMIC LOOKUP IN THIS FILE GOES THROUGH THIS, and it is not
   hygiene — it is a live NaN injection without it.

   Found by tests/perk-channel.mjs P5 on its first run, in this file's own
   first draft. `ROOM_PERKS` and the rung maps are ordinary object literals,
   so `rung['constructor']` is `Object` — truthy, non-null, and `t += Object`
   is **NaN**. A single NaN in `getBonus` poisons every multiplier downstream
   for the whole session. `ROOM_PERKS['constructor']` likewise passes a
   `if (!ladder) continue` gate and then reports `.length === 1`, so a forged
   perk state naming `constructor` was accepted as a room.

   This is exactly Security's C6 — `MONSTERS['constructor']` passing
   `!MONSTERS[id]` — filed as "harmless now, a free craft when intent #3 reads
   RECIPES[id].cost.gold after the same check". It was NOT harmless here, and
   it arrived in a file written after C6 was recorded, which is the argument
   for the guard being a named function rather than a habit. */
function own(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

/** The permanent fuse. Negative values pass through untouched: every cap here
    is a ceiling on how much a player may GAIN, never a floor on how much a
    debuff may take, and treating one as the other turns a curse into a
    blessing. */
export function clampPermanent(key, value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return Number.isFinite(v) ? v : 0;
  if (!governed(key)) return v;
  return v > PERMANENT_CAP ? PERMANENT_CAP : v;
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · THE PERK STATE — the contract between the database and the arithmetic

   The DATABASE returns bookkeeping (which rooms, at which rung); the RULES
   that turn a rung into a magnitude are JavaScript and live here. That split
   is the 2026-08-15 architecture decision, and it is what keeps the room
   table from being copied into SQL — a second copy of game data in the
   database is the failure `src/main.js unifyObject` was written about.

   EVERY FIELD IS OPTIONAL AND EVERY ABSENCE MEANS ZERO. That is not
   defensive padding: it is the self-configuring switch. A database that has
   no unlock storage yet returns `{}`, the channel computes 0 for every key,
   and the engine behaves EXACTLY as it does today with `zeroBonus`. There is
   no flag anyone can forget to flip, and applying the migration before or
   after the Edge deploy is safe in either order.
   ══════════════════════════════════════════════════════════════════════════ */

/** The zero state. `makeBonus(EMPTY_PERKS)` is behaviourally identical to the
    `zeroBonus()` it replaces — asserted, not assumed (tests/perk-channel.mjs
    P1), because "the new thing degrades to the old thing" is a claim about
    executable behaviour. */
export const EMPTY_PERKS = Object.freeze({
  rooms: Object.freeze({}),
  plots: Object.freeze({}),
  propertyTier: 0,
  renownAllXp: 0,
  clanPerks: Object.freeze({}),
  castle: null,
});

const nonNegInt = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Canonicalise anything that arrives claiming to be a perk state.
 *
 * The server's copy comes out of `hr_perks_of` as jsonb over a network hop,
 * so it is parsed, not trusted: unknown room ids are DROPPED (never
 * forwarded to the bonus loop, which would silently pay nothing anyway but
 * would hide a schema drift), levels are clamped to the rung count that
 * actually exists, and magnitudes are never read from the input — only ids
 * and counts are, and every magnitude comes from the generated table.
 *
 * ⚠ THAT IS THE SECURITY PROPERTY, stated plainly: a hostile perk state can
 *   name a room, but it cannot name a NUMBER. The worst a forged state can
 *   do is claim a Kitchen the player has not built — which is a claim about
 *   server-owned unlock rows that only the database produces.
 */
export function normalisePerkState(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};

  const rooms = Object.create(null);
  const rawRooms = (r.rooms && typeof r.rooms === 'object') ? r.rooms : {};
  for (const id of Object.keys(rawRooms)) {
    if (!own(ROOM_PERKS, id)) continue;          // not a room this build knows
    const ladder = ROOM_PERKS[id];
    const lv = Math.min(nonNegInt(rawRooms[id]), ladder.length);
    if (lv > 0) rooms[id] = lv;
  }

  const plots = Object.create(null);
  const rawPlots = (r.plots && typeof r.plots === 'object') ? r.plots : {};
  for (const id of Object.keys(rawPlots)) {
    if (!own(PLOT_PERKS, id)) continue;
    const n = nonNegInt(rawPlots[id]);
    if (n > 0) plots[id] = n;
  }

  const clanPerks = Object.create(null);
  const rawClan = (r.clanPerks && typeof r.clanPerks === 'object') ? r.clanPerks : {};
  for (const k of Object.keys(rawClan)) {
    const v = Number(rawClan[k]);
    /* A clan perk IS a magnitude off the wire, unlike a room level — so it is
       range-checked against the same fuse rather than accepted. Today every
       clan-level perk is `offlineHours`, which is not a getBonus key at all,
       so this branch is inert; it is written now so that wiring the ladder
       later cannot arrive without a bound. */
    if (Number.isFinite(v) && v > 0) clanPerks[k] = Math.min(v, PERMANENT_CAP);
  }

  const renown = Number(r.renownAllXp);

  return {
    rooms,
    plots,
    propertyTier: nonNegInt(r.propertyTier),
    renownAllXp: Number.isFinite(renown) && renown > 0 ? Math.min(renown, PERMANENT_CAP) : 0,
    clanPerks,
    /* NOT WIRED. See §5. Carried so the shape is settled and a later wiring
       is a body change rather than a contract change. */
    castle: null,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · THE ARITHMETIC
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The permanent stack for one key, UNCLAMPED.
 *
 * Unclamped on purpose. On the client this is layer 0 of a seven-layer chain
 * and `power-budget.js` applies the fuse at the end, where nothing can be
 * added after it; clamping here as well would make `HearthrisePowerBudget
 * .rawFor()` — which is what the "the realm's blessing is at its limit"
 * panel reads — under-report by exactly the amount the fuse would have bound.
 * The SERVER's clamp is in `makeBonus`, because there this IS the whole chain.
 */
export function permanentBonus(key, state) {
  if (!key) return 0;
  const s = state || EMPTY_PERKS;
  let t = 0;

  /* Rooms. A rung's map REPLACES the rung below it — `levels[lv-1]`, never a
     sum over rungs — which is why every rung restates every key it keeps. */
  const rooms = s.rooms || {};
  for (const id of Object.keys(rooms)) {
    if (!own(ROOM_PERKS, id)) continue;
    const ladder = ROOM_PERKS[id];
    const lv = rooms[id] | 0;
    if (lv <= 0) continue;
    const rung = ladder[Math.min(lv, ladder.length) - 1];
    if (own(rung, key)) t += Number(rung[key]) || 0;
  }

  /* Plots, per instance owned. */
  const plots = s.plots || {};
  for (const id of Object.keys(plots)) {
    if (!own(PLOT_PERKS, id)) continue;
    const per = PLOT_PERKS[id];
    if (!own(per, key)) continue;
    t += (Number(per[key]) || 0) * (plots[id] | 0);
  }

  /* The property capstone. */
  if ((s.propertyTier | 0) >= CASTLE_TIER && own(CAPSTONE_PERKS, key)) {
    t += Number(CAPSTONE_PERKS[key]) || 0;
  }

  /* Renown. One key today (`allXP`); the ladder's other four perks are
     offline hours, a market slot and a daily-task slot — capacity and access,
     none of them a getBonus key. */
  if (key === 'allXP') t += Number(s.renownAllXp) || 0;

  /* Clan level perks. Every rung is `offlineHours` or a cosmetic today, so
     this contributes 0 — wired anyway so the ladder gaining a real key is a
     data change and not a code change. */
  const clan = s.clanPerks || {};
  if (own(clan, key)) t += Number(clan[key]) || 0;

  return t;
}

/**
 * The `bonus(key)` function every simulation takes — combat-sim, skill-sim,
 * artisan, grantXp. Clamped, because on the server this is the entire chain.
 *
 * Memoised per call site: `resolveArtisanAction` asks for `craftSave` and
 * `yield_<skill>` on EVERY tick, and an 12h cooking night is ~18,000 ticks
 * over a handful of distinct keys. A closure over a small map turns that from
 * 36,000 walks of the room table into 36,000 map reads. The map is created
 * per `makeBonus` call and never shared, so a state change means a new
 * function — there is no cache to invalidate and no staleness to reason about.
 */
export function makeBonus(state) {
  const s = normalisePerkState(state);
  const memo = new Map();
  return function bonus(key) {
    if (memo.has(key)) return memo.get(key);
    const v = clampPermanent(key, permanentBonus(key, s));
    memo.set(key, v);
    return v;
  };
}

/**
 * The Library's Rested XP payload for a given Library rung — the one piece of
 * rung payload that is not a bonus key. Returned as `{ rested, restedCap }`
 * with zeroes for a rung that pays none, so a caller never has to know which
 * rungs carry it.
 *
 * ⚠ INERT TODAY, WITH A NAMED CONSUMER — say so rather than let a reader
 *   assume it is wired. `accrual.js` passes `restedQuantum: 0` with the note
 *   "Rested XP is not server state yet", because `player_state` has no
 *   `rested_xp` / `rested_at` columns; when it does, this is the function that
 *   prices a charge, and the data is already extracted (ROOM_RUNG_EXTRAS)
 *   because the generator reads the WHOLE rung rather than the bonus half.
 *   Kept, rather than deleted, so that landing Rested does not require a
 *   SECOND extraction of the same table — which is how a second copy of game
 *   data gets created. Tested by tests/perk-channel.mjs P8; this repo has
 *   recorded that inert seams rot (`registerBuffScaler`), so if Rested is not
 *   moving server-side, delete this and the `extras` half of the generator
 *   together.
 */
export function restedPayload(state) {
  const s = state || EMPTY_PERKS;
  const lv = (s.rooms && s.rooms.library) | 0;
  const out = { rested: 0, restedCap: 0 };
  if (lv <= 0) return out;
  if (!own(ROOM_RUNG_EXTRAS, 'library')) return out;
  const extras = ROOM_RUNG_EXTRAS.library;
  /* Scan DOWN from the current rung: L5 carries both fields, L4 carries only
     `rested`, so a player at L5 must not lose `restedCap` if a future rung
     restates one field and not the other. */
  for (let i = Math.min(lv, extras.length) - 1; i >= 0; i--) {
    const e = extras[i];
    if (!e) continue;
    if (!out.rested && e.rested) out.rested = e.rested;
    if (!out.restedCap && e.restedCap) out.restedCap = e.restedCap;
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · WHAT IS SERVER-DERIVABLE TODAY, AND WHAT IS BLOCKED ON WHAT

   Stated here rather than in a design doc because the next person to widen
   this channel will read the code, and a promise recorded only in prose is
   how "bounded and journalled" came to describe a function that was neither.

   ── DERIVABLE NOW, and wired ────────────────────────────────────────────
   rooms / plots / propertyTier
       All three are `unlock` grants in src/data/shops.js
       (`room:<id>` amount = rung, `plot:<id>` amount = 1 per purchase and
       repeatable, `property:<id>` amount = tier index). They are read through
       `public.hr_unlock_levels` — ONE named seam, so whichever storage model
       the unlock work lands on is a change to that view and to nothing else.
       Until an unlock is actually WRITTEN, the seam returns no rows, this
       channel returns 0, and the engine behaves exactly as it does today.

   ── DERIVABLE NOW, and contributes nothing ──────────────────────────────
   clanPerks
       Clan membership and `clans.level` are server-owned and have been since
       the clan-seat migration. But `src/features/clans.js PERKS` grants
       `offlineHours` at Lv4/Lv7 and a cosmetic banner at Lv10 — no getBonus
       key at any rung (clan-overhaul.md §8.3 re-scoped them away). Offline
       hours are already server-side in `hr_offline_cap_ms`, which is a
       different channel. So wiring the read would be decoration: it is
       carried in the contract and left unread, and this note is what stops
       the next reader concluding it was forgotten.

   ── BLOCKED ─────────────────────────────────────────────────────────────
   renownAllXp   BLOCKED ON: a server-side renown score.
       `src/features/renown.js` scores renown from ~10 terms — total level,
       combat level, kills, boss kills, quests completed, collection entries,
       the daily streak, lifetime gold. Skill XP is server-owned; quests,
       collection, streak and lifetime gold have NO server progress model
       (the same gap `accrual.js` names for dailies and quests). Deriving
       renown from the subset that exists would produce a DIFFERENT rank from
       the client's, and a rank is a visible title — a divergence a player can
       read off the screen. Worth +4% allXP at High King.
       Unblocks with: the quest/daily/collection progress models.

   castle        BLOCKED ON: nothing structural — it is scope, and it crosses
       an ownership boundary. Castle building levels and the castle tier are
       server-owned (`hr_castle_buildings` + the clan seat tables), the perk
       ladder is +1% at building level 4/7/10 for five buildings, and Tyler's
       2026-08-15 ruling says clan buffs DO pay while away. What it needs that
       this change does not have: the perk table lives in
       `src/features/clan-seat-ui.js` (another classic script → a second
       generator), `perkScale()` folds the clan's UPKEEP STATE (strained x0.6,
       dormant x0) into every magnitude, and both are surfaces another agent
       holds. `state.castle` is `null` and the contract is settled, so wiring
       it is a body change here plus a read in `hr_perks_of`.
       Worth up to +3% on goldFind / craftSmith / smithSpeed / raidPower and
       +4% allXP, to clan members only.

   companions    BLOCKED ON: no server model for the equipped pet at all.
       Worth ~+2.45% on one narrow key at pet level 30. Not in this contract:
       it is a wrapper layer (layer 1), not part of layer 0, and adding it
       here would mean this file owned a source the client adds elsewhere.

   ── OUT OF SCOPE BY RULING, not by omission ─────────────────────────────
   blessings (AWAY_SCOPE.blessing = false — server-wide events do not pay
   while away, Tyler 2026-08-15), the feast, the muster aura, and consumable
   buffs (their own away branch; `AWAY_SCOPE.buff`).
   ══════════════════════════════════════════════════════════════════════════ */
