// ============================================================
// src/core-bridge.js — the ONLY adapter between the pure simulation core
// (src/core/*) and the browser engine (src/legacy.js).
//
// WHY THIS FILE EXISTS
// legacy.js is a CLASSIC script: it cannot `import`. src/core/* is pure
// ESM with no `window`. Something has to introduce them, and that
// something must be exactly one file, or the seam rots into N ad-hoc
// lookups. This is that file, and it is deliberately the only impure
// thing in the Phase-0 extraction — everything it touches (`window`,
// `G`, `Math.random`) stops here.
//
// BOOT ORDER (verified, and load-bearing)
// Module scripts are deferred: every classic <script> in index.html runs
// first, then module scripts in document order, then DOMContentLoaded.
// legacy.js only DEFINES at parse time — its boot() is on
// DOMContentLoaded, behind the account gate — so publishing
// window.HearthriseCore here is comfortably early enough for every
// runtime caller. This file is placed before src/main.js so the core is
// up before any feature module boots.
//
// THE RNG SEAM
// src/core forbids Math.random() so that server accrual is replayable
// (design §3). The client has no dispute to resolve, so it seeds a
// mulberry32 stream from Math.random() once, here. Behaviour is
// unchanged — the stream is uniform and unpredictable — but the *shape*
// of every call site is now "take an rng", which is what lets the same
// function run inside an Edge Function against hash(user_id, slot,
// accrued_to).
// ============================================================

import * as rngMod from './core/rng.js?v=340';
import * as xp from './core/xp.js?v=340';
import * as combat from './core/combat.js?v=340';
import * as drops from './core/drops.js?v=340';
import * as pacing from './core/pacing.js?v=340';
import * as rested from './core/rested.js?v=340';
import * as tools from './core/tools.js?v=340';
import * as farm from './core/farm.js?v=340';
import * as progression from './core/progression.js?v=340';
import * as styles from './core/styles.js?v=340';
import * as artisan from './core/artisan.js?v=340';
import * as bounty from './core/bounty.js?v=340';
import * as away from './core/away.js?v=340';
import * as botd from './core/botd.js?v=340';
import * as buffs from './core/buffs.js?v=340';
import * as combatSim from './core/combat-sim.js?v=340';
import * as licence from './core/licence.js?v=340';

/* One stream for the whole session, seeded from the platform RNG. Exposed
   as `reseed` so the smoke suite can pin it and assert determinism from
   inside the game. */
let rng = rngMod.createRng((Math.random() * 0x100000000) >>> 0);

const G = () => window.G;
const ITEMS = () => window.ITEMS || {};

/* The perk stack. On the client this is a chain seven wrappers deep
   (world-events, companions, clans, clan-seat-ui, muster + two in
   legacy.js); core must not know that, so it only ever sees a function. */
function bonus(key) {
  try { return (typeof window.getBonus === 'function') ? (window.getBonus(key) || 0) : 0; }
  catch (e) { return 0; }
}

/* Tool speed still routes through window.HearthriseTools rather than
   straight to core, because that object is a documented public API other
   feature modules call — and it now delegates to core itself. */
function toolSpeed(skill) {
  try {
    return (window.HearthriseTools && window.HearthriseTools.bestToolSpeed)
      ? (window.HearthriseTools.bestToolSpeed(skill) || 0) : 0;
  } catch (e) { return 0; }
}

/* ── Context builders ──────────────────────────────────────────────────
   Each one turns the engine's ambient globals into the explicit argument
   object a core function wants. The server builds the same shapes from
   `player_state` / `player_skills` / `player_equipment` rows. */

function combatCtx(eq, setBonus) {
  const g = G() || {};
  return {
    eq: eq || combat.equipmentStats(g.equipment, ITEMS()),
    equipment: g.equipment || {},
    items: ITEMS(),
    skills: g.skills || {},
    bonus,
    setBonus,
    profile: (typeof window.getCombatStatProfile === 'function')
      ? window.getCombatStatProfile()
      : Object.assign({}, combat.DEFAULT_PROFILE, { type: (eq && eq.weaponType) || 'sword' }),
    style: (typeof window.getActiveCombatStyle === 'function')
      ? window.getActiveCombatStyle()
      : combat.DEFAULT_STYLE,
  };
}

function rateCtx() {
  return {
    bonus,
    toolSpeed,
    xpB: (typeof window.getEquipmentStats === 'function') ? (window.getEquipmentStats().xpB || 0) : 0,
  };
}

/* The two Rested "roads", resolved from the two systems that grant them.
   Defensive on every hop: a missing module or a clanless player
   contributes 0, never a throw and never a default. */
function restedRoads() {
  const roads = { library: 0, clan: 0 };
  try {
    const g = G();
    const lv = (g && g.rooms && g.rooms.library) | 0;
    const rung = (lv > 0 && window.ROOMS && window.ROOMS.library) ? window.ROOMS.library.levels[lv - 1] : null;
    if (rung && rung.rested > 0) roads.library = rung.rested;
  } catch (e) {}
  try {
    if (window.HearthriseClanSeatUI && typeof window.HearthriseClanSeatUI.restedQuantum === 'function') {
      roads.clan = Number(window.HearthriseClanSeatUI.restedQuantum()) || 0;
    }
  } catch (e) {}
  return roads;
}

/* The Great Library's raised bank, resolved the same way. */
function restedLibraryCap() {
  try {
    const g = G();
    const lv = (g && g.rooms && g.rooms.library) | 0;
    const rung = (lv > 0 && window.ROOMS && window.ROOMS.library) ? window.ROOMS.library.levels[lv - 1] : null;
    if (rung && rung.restedCap > 0) return rung.restedCap;
  } catch (e) {}
  return 0;
}

function xpGrantCtx(opts) {
  return {
    bonus,
    xpB: (typeof window.getEquipmentStats === 'function') ? (window.getEquipmentStats().xpB || 0) : 0,
    /* Through window.restedQuantum, NOT straight to core: that function is the
       published seam the Tavern/Library integrations and the suite substitute,
       and resolving the quantum here would silently escape whoever replaced it.
       Same rule as getEquipmentStats above — delegation must never quietly
       remove a link from a chain the engine already had. */
    restedQuantum: (typeof window.restedQuantum === 'function') ? (window.restedQuantum() || 0) : 0,
    authored: !!(opts && opts.authored),
  };
}

window.HearthriseCore = {
  /* The modules, verbatim — nothing is re-wrapped, so a caller reading
     this object is reading the same functions Deno will run. */
  rngMod, xp, combat, drops, pacing, rested, tools, farm, progression,
  styles, artisan, bounty, away, botd, buffs, combatSim, licence,

  /* The session RNG. */
  get rng() { return rng; },
  /* Test seam: pin the stream, run something, restore. The smoke suite
     uses this to prove that the same seed replays the same fight. */
  reseed(seed) { rng = rngMod.createRng(seed); return rng; },
  randomSeed() { rng = rngMod.createRng((Math.random() * 0x100000000) >>> 0); return rng; },
  /* Test seam: substitute the generator outright. Tests used to force a
     specific outcome by assigning `Math.random = () => 0`, which only worked
     while the engine reached for the global — the thing Phase 0 removes. This
     is the honest replacement: the RNG is an injected dependency, so a test
     injects one. `setRng(null)` restores an unpredictable session stream. */
  setRng(replacement) {
    rng = replacement || rngMod.createRng((Math.random() * 0x100000000) >>> 0);
    return rng;
  },

  /* The adapters legacy.js calls. */
  bonus, toolSpeed, combatCtx, rateCtx, xpGrantCtx, restedRoads, restedLibraryCap,
  items: ITEMS,
};

/* ── The canonical constants ───────────────────────────────────────────
   These used to be `const`s in legacy.js. They are authored in src/core now
   and published here, which makes the client's object THE SAME OBJECT the
   core reads — one identity, not two copies reconciled by a guard.

   That identity is load-bearing in two directions:
     • the b226 suite stubs `window.PACE.xp` and expects the real grant to
       move; it does, because addXp → core pacedXp → this exact object;
     • an Edge Function importing src/core/pacing.js reads the same numbers,
       so a server-computed offline grant and a client-rendered "xp/hr" can
       never disagree.

   `window.XP_TABLE` in particular fixes b222's failure mode by construction:
   a top-level `const` in a classic script is NOT a window property, which is
   how renown.js and admin.js silently read `undefined` for months. Nothing is
   a const any more. */
Object.assign(window, {
  XP_TABLE: xp.XP_TABLE,
  WEAPON_TYPES: combat.WEAPON_TYPES,
  WEAKNESS_BONUS: combat.WEAKNESS_BONUS,
  NEUTRAL_DROP_BONUS: combat.NEUTRAL_DROP_BONUS,
  COMBAT_BALANCE: combat.COMBAT_BALANCE,
  WEAPON_SPEED_MOD: combat.WEAPON_SPEED_MOD,
  ACC_DEF_MUL: combat.ACC_DEF_MUL,
  DROP_BAND_MAX: drops.DROP_BAND_MAX,
  PACE: pacing.PACE,
  PACE_EXEMPT_SKILLS: pacing.PACE_EXEMPT_SKILLS,
  SPEED_FUSE: pacing.SPEED_FUSE,
  SPEED_KEYS: pacing.SPEED_KEYS,
  RESTED_CHARGE_MS: rested.RESTED_CHARGE_MS,
  RESTED_CAP: rested.RESTED_CAP,
  RESTED_CAP_LIBRARY: rested.RESTED_CAP_LIBRARY,
  RESTED_QUANTUM_CAP: rested.RESTED_QUANTUM_CAP,
  COMBAT_XP_SKILLS: progression.COMBAT_XP_SKILLS,

  /* PHASE A. COMBAT_STYLES was a `window.` assignment inside legacy.js
     block 10; the bounty tables were top-level `const`s, i.e. invisible to
     every other file. Both are now authored in src/core and published here,
     which is what lets the server generate a board and route kill XP from
     the same table the client renders. */
  COMBAT_STYLES: styles.COMBAT_STYLES,
  BOUNTY_KILL_COUNTS: bounty.BOUNTY_KILL_COUNTS,
  BOUNTY_BASE_REWARDS: bounty.BOUNTY_BASE_REWARDS,
  BOUNTY_TYPE_MULT: bounty.BOUNTY_TYPE_MULT,
  BOUNTY_DIFFICULTY_MULT: bounty.BOUNTY_DIFFICULTY_MULT,
  BOUNTY_TYPE_LABEL: bounty.BOUNTY_TYPE_LABEL,
  BOUNTY_DIFFICULTY_LABEL: bounty.BOUNTY_DIFFICULTY_LABEL,

  /* THE UNIFICATION. `BUFFS_DEF` was a `const` inside legacy.js's buff-queue
     IIFE re-published on window; it is authored in src/core/buffs.js now, so
     the accrual engine reads the same registry the tooltip does — and the
     `damage_crit` exclusion the ruling names needs no special case, because
     it is simply a member of the buff channel.
     `AWAY_RATE_MULT` is published so the value is inspectable from devtools
     and from the suite: a dial nobody can read is a dial nobody trusts. */
  BUFFS_DEF: buffs.BUFFS_DEF,
  AWAY_RATE_MULT: away.AWAY_RATE_MULT,
  FIELD_LICENCE_KILLS: licence.FIELD_LICENCE_KILLS,
});

/* ── The Field Licence, bound to the live save ─────────────────────────────
   ONE reader for every client surface that states the licence: the quest row,
   the monster preview's Away line, the Stats modal, the welcome-back toast.
   They share a function rather than each re-deriving `kills >= 100`, because
   four copies of a threshold is four places for it to drift from the server's.

   DISPLAY ONLY. The authority is `hr-accrue/accrual.js`, which asks the same
   `fieldLicence()` against server-known `stats.kills` before it simulates. */
window.HearthriseLicence = {
  KILLS: licence.FIELD_LICENCE_KILLS,
  /** The verdict for the current save (or any state passed explicitly). */
  check(state) { return licence.fieldLicence(state || G() || {}); },
  /** "may a span of this activity accrue?" — the caller's vocabulary. */
  allows(kind, state) { return licence.awayActivityAllowed(kind, state || G() || {}); },
};

/* THE READINESS SIGNAL — must be the last statement in this file.
   src/core-ready.js (a classic script, so it is up before any engine script)
   parks every boot timer the classic scripts register and releases them here.
   Without this call the engine's parse-time setTimeout/setInterval work fires
   into a coreless window on a slow cold load and throws. See that file's
   header for the full reasoning; `node tests/visual-qa.mjs --cold` is the
   guard. Optional-chained so core-bridge still stands alone in a bare page. */
if (typeof window.__hearthriseCoreOnline === 'function') window.__hearthriseCoreOnline();

console.log('[Hearthrise core] shared simulation core online —',
  Object.keys(window.HearthriseCore).length, 'entries,', xp.XP_TABLE.length, 'XP rungs');
