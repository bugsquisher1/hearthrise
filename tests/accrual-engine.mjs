// ============================================================================
// tests/accrual-engine.mjs — the SERVER ACCRUAL guard.
//
// Three claims, all mechanical, none of them provable from a browser:
//
//   1. PARITY (the contract). A span computed by the SERVER engine
//      (supabase/functions/hr-accrue/accrual.js) is identical — kills, crits,
//      ticks, gold, every XP grant, every item — to the same span computed the
//      way the CLIENT computes it (legacy.js simulateAwayCombat), for the same
//      state and the same seed. If these two ever diverge, the server and the
//      client disagree about what a night was worth, and the player is right
//      whichever way it went.
//
//      The client side of the comparison is built here from src/core the way
//      legacy.js builds it — NOT by calling the server engine — so the test is
//      an independent second construction, which is the only kind of parity
//      test worth having.
//
//   2. HOSTILE INPUT. Nothing a client could send inflates a grant: not
//      `tickMs`, not `minTickMs`, not `atMs`, not `capMs`, not `elapsed`, not
//      `nowMs`, not `grantMs`. The engine reads named server fields only, so
//      the proof is "these keys are inert", asserted by running with and
//      without them and comparing.
//
//   3. SHAPE. The delta only ever contains keys hr_apply implements; every
//      numeric value is an integer (hr_apply casts with ::bigint, and a
//      fractional string is a `bad_delta` that costs a player their whole
//      night); and the source of the engine never spreads a caller object into
//      the simulation ctx — the rule that keeps `minTickMs` from riding in
//      through the same door as `tickMs`.
//
// Run standalone:  node tests/accrual-engine.mjs
// Also invoked as a preflight by tests/run-smoke.mjs.
// ============================================================================

import { readFile, readdir } from 'node:fs/promises';
/* SYNC, deliberately: REACHABLE_CAP_H is a module-scope constant the sweep
   tables below are built from, and an async read there would make it a promise
   that every fixture silently compared against. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  COMBAT_BALANCE, WEAPON_SPEED_MOD, DEFAULT_PROFILE,
  equipmentStats, armorSetBonus, playerCombatRolls, monsterCombatRolls, weaknessInfo,
} from '../src/core/combat.js';
import { simulateSpan } from '../src/core/combat-sim.js';
import { killBonusesFor, botdFor } from '../src/core/botd.js';
import { creditWindow, DAY_MS } from '../src/core/away.js';
import { createRng } from '../src/core/rng.js';
import { grantXp, resolveGatherAction } from '../src/core/progression.js';
import { resolveStyle, COMBAT_STYLES } from '../src/core/styles.js';
/* The gather half. `simulateSkillSpan` is imported for the BUFF TIMELINE
   section only — the parity section deliberately does NOT use it (see its
   header: the client column there is a transcription of legacy.js). */
import {
  indexGatherNodes, duplicateGatherIds, simulateSkillSpan, SKILL_ACTION_STAT, STOP_REASON,
} from '../src/core/skill-sim.js';
import { bestTool, toolSpeed, toolXpB, toolDouble } from '../src/core/tools.js';
import { pacedActionMs, speedClamp } from '../src/core/pacing.js';
import { nextBuffExpiryMs, hasActiveBuff, tickBuffs, buffBonusFor } from '../src/core/buffs.js';
import { levelOf } from '../src/core/xp.js';
/* THE CONSUMPTION SEAM (E1). Imported as a namespace so the guard below can
   assert against the module's own frozen tables — `AMMO_EMPTY_SLOT_IS_DRY` is a
   design position, and a test that restated it instead of reading it would
   agree with itself forever. */
import * as AMMO from '../src/core/ammo.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { TREES, ROCKS, FISH_SPOTS } from '../src/data/gathering.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { indexArtisanRecipes, benchPayable } from '../src/core/artisan-sim.js';

import { resolveAutoEat, thresholdFromPct, pctFromThreshold, bestHealingFood, DEFAULT_THRESHOLD,
         maxPctForTier } from '../src/core/auto-eat.js';
import {
  computeAccrual, deriveTickMs, deriveProfile, zeroBonus,
  ACCRUE_MIN_MS, ACCRUE_MAX_SPAN_MS,
} from '../supabase/functions/hr-accrue/accrual.js';
import { parseIntent, readSlot, MAX_SLOT, INTENT_KEYS } from '../supabase/functions/hr-accrue/request.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const FN_DIR = join(ROOT, 'supabase', 'functions', 'hr-accrue');
/* SYNC, like REACHABLE_CAP_H above and for the same reason: `ammoGuard` is
   synchronous so the whole family can run under a mutation harness without a
   network round trip, and an async read here would be a promise every
   assertion silently compared against. */
const COMBAT_SIM_SRC = readFileSync(join(ROOT, 'src', 'core', 'combat-sim.js'), 'utf8');

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const eq = (a, b, msg) => {
  const A = JSON.stringify(a); const B = JSON.stringify(b);
  if (A !== B) problems.push(`${msg}\n      server: ${A}\n      client: ${B}`);
};

// ── The fixture ─────────────────────────────────────────────────────────────
// A real monster, real items, a real absence. Picked to exercise the parts that
// have historically drifted: a weapon with a family speed identity, an armour
// set worth a crit bonus, an absence long enough to level up, and a start
// instant that crosses UTC midnight so the Boss-of-the-Day segmentation runs.

const MONSTER = Object.keys(MONSTERS).includes('goblin') ? 'goblin' : Object.keys(MONSTERS)[0];

/* Fixtures, chosen so the SET exercises every branch that has historically
   drifted. One fixture proves one path; the coverage assertions at the bottom
   of parityGuard() are what stop this table quietly degrading into one easy
   case that always passes.
     • slime       — 8,000+ kills across BOTH UTC segments, thousands of crits
     • warband_captain — the DAY-1 featured boss (and not day 2's), so
                     featuredMs and featuredDropMult are real values, not 0 and 1
     • goblin at low level — the ordinary early-game character
   Every one of them ends in a death, and that is not a broken fixture: auto-eat
   is OFF by default in the shipped client (src/features/auto-actions.js:49
   `eat: { enabled: false }`), so an unattended fight ends the same way on both
   sides. See "Known limitations". */
const MAXED = Object.freeze({
  attack: 13034431, strength: 13034431, defense: 13034431, hitpoints: 13034431,
  ranged: 13034431, magic: 13034431, prayer: 13034431,
});

/* 2026-03-14 20:00 UTC → 2026-03-15 08:00 UTC. Twelve hours, one UTC boundary,
   so `utcDaySegments` yields two segments and each is resolved against its own
   day's featured boss. A single-segment fixture would let a segmentation bug
   pass. */
const FROM_MS = Date.UTC(2026, 2, 14, 20, 0, 0);
const SPAN_MS = 12 * 3600000;
const NOW_MS = FROM_MS + SPAN_MS;
const SEED = 0x5eed1234;

function baseSkills() {
  return {
    attack: 30000, strength: 28000, defense: 22000, hitpoints: 26000,
    ranged: 1000, magic: 1000, prayer: 500,
    woodcutting: 4000, mining: 4000, fishing: 4000,
  };
}

/* Equipment chosen FROM THE LIVE CATALOGUE, never invented — an invented item
   would test the engine against data the game does not contain, and the whole
   point is that both sides read src/data. Best-in-slot so spdB, the
   weapon-family speed identity, critB and the armour-set bonus all have real
   non-zero values to carry. */
function pickEquipment() {
  const eqp = {};
  const weapon = Object.keys(ITEMS)
    .filter((id) => ITEMS[id]?.weaponType && ITEMS[id]?.atkB)
    .sort((a, b) => (ITEMS[b].atkB || 0) - (ITEMS[a].atkB || 0))[0];
  if (weapon) eqp.weapon = weapon;
  const best = {};
  for (const [id, it] of Object.entries(ITEMS)) {
    if (!it || it.type !== 'armor' || !it.slot) continue;
    const cur = best[it.slot];
    if (!cur || (it.tier || 0) > (ITEMS[cur].tier || 0)) best[it.slot] = id;
  }
  for (const [slot, id] of Object.entries(best)) eqp[slot === 'head' ? 'helmet' : slot] = id;
  return eqp;
}
const EQUIPMENT = pickEquipment();

// ── The CLIENT reference implementation ─────────────────────────────────────
// Mirrors legacy.js: `combatTickMs()` (:2543), `getCombatStatProfile()` (:7906),
// `combatSimCtx()` (:2705) and `simulateAwayCombat()` (:2765), with the client's
// window.* helpers replaced by the same core calls they delegate to and the
// presentation handlers dropped (they only ever push toasts).
//
// Written out rather than imported so it is a genuinely independent second
// construction. If it were `computeAccrual` in a hat, it would prove nothing.

function clientCombatTickMs(eqStats, style) {
  const spd = Math.max(0, Math.min(0.20, (eqStats.spdB) || 0));
  const wmod = WEAPON_SPEED_MOD[eqStats.weaponType] || 1;
  /* b329: the third term. Written out here, deliberately, rather than calling
     core's swingIntervalMs — this reference exists to be an INDEPENDENT second
     construction, so it has to spend the style cost independently too. Today
     every family's DEFAULT style is 1.00, so omitting it would have kept parity
     green while the term rotted; that is exactly the silent drift this file is
     supposed to catch. */
  const smod = Math.max(1, Math.min(2, Number(style && style.speedMod) || 1));
  return Math.max(COMBAT_BALANCE.minTickMs,
    Math.floor(COMBAT_BALANCE.tickMs * (1 - spd) * wmod * smod));
}

function clientProfile(weaponType) {
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

function clientAwaySpan(opts) {
  const items = ITEMS; const monsters = MONSTERS;
  const equipment = opts.equipment;
  const bonus = () => 0;                       // no blessings, no buffs, no perks
  let eqStats = equipmentStats(equipment, items);
  const setBonus = armorSetBonus(equipment, items);
  const profile = clientProfile(eqStats.weaponType);
  const style = resolveStyle(eqStats.weaponType, null);

  const G = {
    activeMonster: opts.monsterId,
    monsterHp: 0, monsterMaxHp: 0,
    playerHp: opts.hp, playerMaxHp: opts.maxHp,
    gold: 0,
    skills: { ...opts.skills },
    stats: {},
    combatKillsThisFoe: 0,
    /* The bag, as the CLIENT holds it: `G.inventory`, mutated by addItem and by
       auto-eat. It is not a snapshot — food that DROPS during the night is
       edible for the rest of it, which is the property the server's live `bag`
       has to reproduce. */
    inventory: { ...(opts.inventory || {}) },
    /* THE EQUIPPED SET, on G, exactly as the real client holds it. E1's
       `readAmmo` asks the STATE which stack is loaded and which weapon family
       is swinging — `G.equipment.ammo` and `ITEMS[G.equipment.weapon].weaponType`
       — so a reference that omitted it would silently answer 'neutral', spend
       nothing, and agree with a server that also spent nothing. That is
       precisely the fixture-rule blind spot (TESTING.md, instance 1). */
    equipment: { ...equipment },
    /* The deterministic fractional carry, threaded so a caller can prove that
       two consecutive spans charge what one long span charges. */
    ammoCarry: { ...(opts.ammoCarry || {}) },
    traits: opts.traits || {},
    autoActions: { eat: opts.eat || { enabled: false, threshold: DEFAULT_THRESHOLD, foodId: null } },
  };
  const bag = {};
  const spentBag = {};
  const fx = {
    addXp(sk, amt) {
      const r = grantXp(G, sk, amt, { bonus, xpB: eqStats.xpB || 0, restedQuantum: 0, authored: false });
      for (const ev of r.events) if (ev.type === 'levelup' && ev.skill === 'hitpoints') G.playerMaxHp = ev.to;
    },
    addItem(id, qty) {
      bag[id] = (bag[id] || 0) + qty;
      G.inventory[id] = (G.inventory[id] || 0) + qty;
    },
    /* THE CONSUMPTION SINK (E1), written out here for the same reason
       `clientCombatTickMs` and `autoEat` are: this reference is an INDEPENDENT
       second construction of legacy.js's COMBAT_FX, and the adapters are where
       the bugs live. legacy.js's version additionally records a pending-consume
       HOLD — a client-reconcile concern with no server twin — but the BAG
       ARITHMETIC, which is the half the server must agree with, is this. */
    removeItem(id, qty) {
      const n = Math.max(0, Math.floor(Number(qty) || 0));
      if (!id || n <= 0) return;
      const have = Math.max(0, Math.floor(Number(G.inventory[id]) || 0));
      const take = Math.min(n, have);
      if (take <= 0) return;
      G.inventory[id] = have - take;
      if (G.inventory[id] <= 0) delete G.inventory[id];
      spentBag[id] = (spentBag[id] || 0) + take;
    },
    /* THE CLIENT'S ADAPTER, written out here rather than imported, exactly as
       clientCombatTickMs above is. This mirrors src/features/auto-actions.js
       `maybeAutoEat()`: the gates come off `G.autoActions.eat` and `G.traits`,
       the threshold is a FRACTION, and the apply step mutates `G`. The DECISION
       is core's — both sides must call the same predicate or the test proves
       nothing about the seam — but the two ADAPTERS are independent, and the
       adapters are where the bugs live: a percent read as a fraction, a trait
       gate on one side only, a snapshot bag instead of a live one. */
    autoEat() {
      const eat = G.autoActions.eat;
      const decision = resolveAutoEat({
        enabled: !!eat.enabled,
        owned: !!(G.traits && G.traits.auto_eat),
        hp: G.playerHp, maxHp: G.playerMaxHp,
        threshold: eat.threshold,
        foodId: eat.foodId,
        inventory: G.inventory,
        items,
      });
      if (!decision) return false;
      G.playerHp = decision.hp;
      G.inventory[decision.foodId] = (G.inventory[decision.foodId] || 1) - 1;
      if (G.inventory[decision.foodId] <= 0) delete G.inventory[decision.foodId];
      G._ate = (G._ate || 0) + 1;
      return true;
    },
  };
  const ctx = {
    away: (opts.away !== undefined) ? opts.away : true,
    fromMs: opts.fromMs, toMs: opts.toMs,
    tickMs: clientCombatTickMs(eqStats, style),
    capped: !!opts.capped,
    rng: createRng(opts.seed),
    monsters, items, bonus, style,
    activeBuffCount: 0,
    playerRolls(m) {
      eqStats = equipmentStats(equipment, items);   // the client re-reads per swing
      return playerCombatRolls(m, { eq: eqStats, equipment, items, skills: G.skills, bonus, setBonus, profile, style });
    },
    monsterRolls(m) { return monsterCombatRolls(m, { eq: eqStats, skills: G.skills, bonus }); },
    weakness(m) { return weaknessInfo(m, eqStats); },
    botdFor(atMs) { return { killBonuses(id) { return killBonusesFor(id, atMs, monsters); } }; },
    fx,
  };
  const summary = simulateSpan(G, ctx);
  const xp = {};
  for (const k in G.skills) {
    const d = Math.floor((G.skills[k] || 0) - (opts.skills[k] || 0));
    if (d > 0) xp[k] = d;
  }
  return { summary, gold: Math.floor(G.gold), xp, items: bag, hp: G.playerHp, maxHp: G.playerMaxHp,
           stats: G.stats, inventory: G.inventory, ate: G._ate || 0,
           spent: spentBag, ammoCarry: G.ammoCarry };
}

// ── Server call helper ──────────────────────────────────────────────────────
function serverAccrual(over) {
  return computeAccrual({
    userId: '00000000-0000-4000-8000-000000000001',
    slot: 0,
    nowMs: NOW_MS,
    accruedToMs: FROM_MS,
    activeSinceMs: FROM_MS,
    activeKind: 'combat',
    activeId: MONSTER,
    capMs: 12 * 3600000,
    seed: SEED,
    hp: 60, maxHp: 60, gold: 1234,
    skills: baseSkills(),
    equipment: EQUIPMENT,
    items: ITEMS,
    monsters: MONSTERS,
    ...over,
  });
}

// ── 1. PARITY ───────────────────────────────────────────────────────────────
/* b332: this fixture used to name `warband_captain` literally, which was the
   boss the BROKEN FNV-1a drew for 2026-03-14. Fixing the hash re-rolled the
   rotation and the featured-boss coverage assertion went dark. The fixture is
   the PROPERTY "day 1's featured boss, and not day 2's", so derive it — the
   anchor then survives any future change to the pools or the key format, and
   goes red only if the property itself stops holding. */
const DAY1_BOSS = botdFor(FROM_MS, MONSTERS).dailyId;
const DAY2_BOSS = botdFor(NOW_MS, MONSTERS).dailyId;

const FIXTURES = [
  { name: 'early-game goblin', monster: MONSTER, skills: baseSkills(), hp: 60, maxHp: 60 },
  { name: 'maxed vs slime (both UTC segments)', monster: 'slime', skills: MAXED, hp: 99, maxHp: 99 },
  { name: 'maxed vs the day-1 featured boss (' + DAY1_BOSS + ')', monster: DAY1_BOSS, skills: MAXED, hp: 99, maxHp: 99 },
].filter((f) => MONSTERS[f.monster]);

function parityGuard() {
  const seen = { segments: 0, featuredMs: 0, featuredDropMult: 1, crits: 0, kills: 0, ticks: 0, deaths: 0 };

  for (const f of FIXTURES) {
    const s = serverAccrual({ activeId: f.monster, skills: f.skills, hp: f.hp, maxHp: f.maxHp });
    ok(s.accrued === true, `[${f.name}] accrued nothing (reason: ${s.reason})`);
    if (!s.accrued) continue;

    const c = clientAwaySpan({
      monsterId: f.monster, equipment: EQUIPMENT, skills: f.skills,
      hp: f.hp, maxHp: f.maxHp, seed: SEED, fromMs: FROM_MS, toMs: NOW_MS, capped: false,
    });

    const P = (m) => `PARITY [${f.name}]: ${m}`;
    const pEq = equipmentStats(EQUIPMENT, ITEMS);
    eq(s.tickMs, clientCombatTickMs(pEq, resolveStyle(pEq.weaponType, null)),
      P('derived tickMs differs from the client combatTickMs()'));
    eq(s.summary.ticks, c.summary.ticks, P('tick count differs'));
    eq(s.summary.kills, c.summary.kills, P('kill count differs'));
    eq(s.summary.crits, c.summary.crits, P('crit count differs'));
    eq(s.summary.died, c.summary.died, P('death outcome differs'));
    eq(s.summary.featuredMs, c.summary.featuredMs, P('featured (Boss-of-the-Day) ms differs'));
    eq(s.summary.featuredDropMult, c.summary.featuredDropMult, P('featuredDropMult differs (b326)'));
    eq(s.summary.segments, c.summary.segments, P('UTC-day segmentation differs'));
    eq(s.summary.gold, c.gold, P('gold differs'));
    eq(s.summary.xp, c.xp, P('XP grants differ'));
    /* ── RECIPE SCROLLS ARE COMPARED WHERE THEY ACTUALLY LAND (b352) ──────
       The client's bag here is the RAW simulation bag. On the real client a
       scroll never survives in it: src/legacy.js's addItem wrapper unlocks the
       recipe and removes the item on pickup. The server does the same thing one
       layer lower — accrual.js turns a `.recipe` drop into a
       {kind:'flag', key:'recipe:<id>'} progress op instead of an inventory
       grant — so the two agree on the END STATE and differ only at the layer
       this line compares.

       ⚠ SPLITTING THEM OUT IS NOT RELAXING THE GUARD, AND IT MUST NOT BE. The
         signal is preserved in both directions:
           · a server that STOPPED converting puts the scroll back in
             `s.summary.items`, which then differs from `clientLoot` -> RED;
           · a server that converted and then LOST the op fails the
             scroll-accounting check below -> RED.
         Deleting the scrolls from both sides and asserting nothing else would
         be the relaxation. Proven by tests/artisan-progress-model.mjs M13,
         which reverts the engine branch and goes red. */
    const clientLoot = {};
    const clientScrolls = {};
    for (const id of Object.keys(c.items || {})) {
      if (ITEMS[id] && ITEMS[id].recipe) clientScrolls[id] = c.items[id];
      else clientLoot[id] = c.items[id];
    }
    eq(s.summary.items, clientLoot, P('item drops differ'));

    const serverScrolls = {};
    for (const op of (s.delta.progress || [])) {
      if (!op || typeof op.key !== 'string' || !op.key.startsWith('recipe:')) continue;
      const id = op.key.slice('recipe:'.length);
      serverScrolls[id] = (serverScrolls[id] || 0) + (Number(op.add) || 0);
    }
    eq(serverScrolls, clientScrolls,
      P('recipe scrolls are not accounted for. The client unlocks and consumes them on pickup '
        + '(src/legacy.js addItem); the server must propose one recipe:<id> progress op per scroll '
        + 'rolled. A scroll that appears in neither the item delta nor the progress ops has '
        + 'silently vanished.'));
    eq(s.delta.hp, Math.max(0, Math.min(c.maxHp, Math.floor(c.hp))), P('resulting HP differs'));

    /* The `stat` progress rows must agree with what the simulation counted —
       otherwise the Hero screen and the ledger tell two different stories. */
    const stats = Object.fromEntries((s.delta.progress || []).map((p) => [p.key, p.add]));
    eq(stats.kills, c.stats.kills, P('the journalled kill count differs from the simulated one'));
    eq(stats.crits || undefined, c.stats.crits, P('the journalled crit count differs from the simulated one'));

    /* Determinism: the same seed twice is the same answer. That is what makes a
       server grant auditable — a dispute is replayable from the ledger. */
    const again = serverAccrual({ activeId: f.monster, skills: f.skills, hp: f.hp, maxHp: f.maxHp });
    eq(again.summary.xp, s.summary.xp, `DETERMINISM [${f.name}]: same seed produced different XP`);
    /* …and a DIFFERENT seed does not. An engine that ignored its seed would
       pass every assertion above. */
    const other = serverAccrual({ activeId: f.monster, skills: f.skills, hp: f.hp, maxHp: f.maxHp, seed: SEED + 1 });
    ok(JSON.stringify(other.summary.xp) !== JSON.stringify(s.summary.xp),
      `DETERMINISM [${f.name}]: a different seed produced an identical fight — the seed is not being used`);

    /* The ruling's own contract: away and active are ONE formula, and with
       blessings and consumables off they must produce identical results. */
    const active = clientAwaySpan({
      monsterId: f.monster, equipment: EQUIPMENT, skills: f.skills,
      hp: f.hp, maxHp: f.maxHp, seed: SEED, fromMs: FROM_MS, toMs: NOW_MS, away: false,
    });
    eq(s.summary.kills, active.summary.kills,
      `RULING [${f.name}]: away and active differ with all bonuses off — away must pay 1.00x`);
    eq(s.summary.xp, active.xp, `RULING [${f.name}]: away and active XP differ with all bonuses off`);

    seen.segments = Math.max(seen.segments, s.summary.segments.length);
    seen.featuredMs = Math.max(seen.featuredMs, s.summary.featuredMs);
    seen.featuredDropMult = Math.max(seen.featuredDropMult, s.summary.featuredDropMult);
    seen.crits = Math.max(seen.crits, s.summary.crits);
    seen.kills = Math.max(seen.kills, s.summary.kills);
    seen.ticks = Math.max(seen.ticks, s.summary.ticks);
    seen.deaths += s.summary.died ? 1 : 0;
  }

  /* COVERAGE. A parity suite whose fixtures all take the same trivial path
     proves parity of nothing. These assertions fail if the table degrades —
     which is how a passing test quietly stops testing. */
  ok(seen.ticks > 1000, `COVERAGE: the longest fixture ran only ${seen.ticks} ticks`);
  ok(seen.kills > 100, `COVERAGE: the busiest fixture made only ${seen.kills} kills`);
  ok(seen.crits > 0, 'COVERAGE: no fixture rolled a crit — crits away are the ruling\'s headline reversal');
  ok(seen.segments >= 2, 'COVERAGE: no fixture crossed UTC midnight — Boss-of-the-Day segmentation is untested');
  ok(seen.featuredMs > 0 && seen.featuredDropMult > 1,
    'COVERAGE: no fixture fought a featured boss — featuredMs/featuredDropMult are untested');
  /* …and the fixture must still be featured for only PART of the absence, or
     the segmentation branch it exists to cover is not being taken. */
  ok(DAY1_BOSS !== DAY2_BOSS,
    `COVERAGE: the featured boss did not change across the UTC boundary (${DAY1_BOSS} both days) — `
    + 'the partial-featured branch is untested; move FROM_MS to a day pair that rotates');
  ok(seen.deaths > 0, 'COVERAGE: no fixture died — the death path ends the activity and is untested');
}

// ── 1a. THE CREDITED WINDOW (Ruling 2, 2026-08-15) ──────────────────────────
// WHICH hours of an over-cap absence are paid — a different question from HOW
// MANY (the cap, covered by dayBudgetGuard and the client's AWAY-8), with a
// different answer, and until this guard both sides answered it wrong.
//
// The old anchor was `fromMs = nowMs - grantMs`: the LAST cap-hours before the
// player came back. Two live defects fell out of it.
//
//   THE EXPLOIT. `simulateSpan` resolves the Boss of the Day per UTC-day
//   SEGMENT of the credited window. Anchored to the return instant, WHICH DAYS
//   PAY IS CHOSEN BY WHEN THE TAB IS OPENED — an 18h absence begun at 22:00 UTC
//   can be made to land wholly on the next day's boss (x1.5 drops, x1.25 combat
//   XP; x2.0/x1.5 on a weekly) by returning at the right hour. That is a
//   free-to-select multiplier on a tradeable-item faucet, which the ruling's own
//   rationale for paying BotD away forbids: it is a targeting decision made
//   BEFORE leaving, so it must be resolved from the departure instant.
//
//   THE FORFEITED CONSUMABLE. A timed buff eaten on the way out is alive for the
//   first minutes OF THE ABSENCE. Credit the last twelve hours of an eighteen-
//   hour absence and those minutes fall outside the window entirely. (Measured
//   on the client, AWAY-23: 10 minutes of coverage becomes 0.)
//
// The fix moves the window, NOT the watermark: `accrued_to` still stamps
// `now()`, so a 40-hour absence stays one capped night instead of becoming four
// 12h instalments. That pairing is what section (c) below pins.
const WIN_FROM = Date.UTC(2026, 2, 14, 22, 0, 0);   // 22:00 UTC — 2h before midnight
const WIN_CAP_MS = 12 * 3600000;
const WIN_AWAY_MS = 18 * 3600000;
const WIN_NOW = WIN_FROM + WIN_AWAY_MS;             // 16:00 UTC the following day
const dayOf = (ms) => Math.floor(ms / DAY_MS);

function creditWindowGuard() {
  /* (0) THE HELPER, on its own. Total by construction: no combination of
     missing, garbage or hostile inputs may produce a window that pays for time
     nobody spent. */
  const w = creditWindow({ watermarkMs: WIN_FROM, nowMs: WIN_NOW, grantMs: WIN_CAP_MS });
  eq(w.fromMs, WIN_FROM, 'WINDOW: creditWindow must open at the watermark');
  eq(w.toMs, WIN_FROM + WIN_CAP_MS, 'WINDOW: creditWindow must close one grant later');
  eq(w.unpaidMs, WIN_AWAY_MS - WIN_CAP_MS, 'WINDOW: the forfeited tail is the rest of the absence');
  ok(w.capped === true, 'WINDOW: an over-cap absence must report itself capped');
  /* The second watermark NARROWS, never widens: an activity that started after
     the last payout cannot be paid for time before it existed. */
  const late = creditWindow({
    watermarkMs: WIN_FROM, activeSinceMs: WIN_FROM + 3600000, nowMs: WIN_NOW, grantMs: WIN_CAP_MS,
  });
  eq(late.fromMs, WIN_FROM + 3600000, 'WINDOW: active_since must move the window forward');
  ok(late.toMs <= WIN_NOW, 'WINDOW: a window may never close in the future');
  const hostile = creditWindow({ watermarkMs: WIN_NOW + 1e12, nowMs: WIN_NOW, grantMs: 1e12 });
  eq(hostile.paidMs, 0, 'WINDOW: a future watermark must pay nothing');
  eq(creditWindow({ nowMs: NaN, watermarkMs: NaN, grantMs: NaN }).paidMs, 0,
    'WINDOW: garbage in must produce a zero-length window, not a span');

  /* (a) THE ENGINE USES IT. An 18h absence at a 12h cap, begun at 22:00 UTC,
     pays 22:00->24:00 on day D and 00:00->10:00 on day D+1.
     MUTATION PROVEN: restore `fromMs: nowMs - grantMs` in accrual.js and the
     window opens at 04:00 on D+1 — one segment, on the wrong day. */
  const capped = serverAccrual({
    accruedToMs: WIN_FROM, activeSinceMs: WIN_FROM, nowMs: WIN_NOW,
    capMs: WIN_CAP_MS, skills: MAXED, hp: 99, maxHp: 99,
  });
  ok(capped.accrued === true, `WINDOW: the capped fixture accrued nothing (${capped.reason})`);
  if (capped.accrued) {
    eq(capped.grantMs, WIN_CAP_MS, 'WINDOW: an 18h absence at a 12h cap must still credit 12h');
    eq(capped.summary.windowFrom, WIN_FROM, 'WINDOW: the credited window must open where the absence did');
    eq(capped.summary.windowTo, WIN_FROM + WIN_CAP_MS, 'WINDOW: …and close one cap later');
    eq(capped.summary.unpaidMs, WIN_AWAY_MS - WIN_CAP_MS, 'WINDOW: the receipt must state the forfeited tail');
    ok(capped.summary.capped === true, 'WINDOW: the receipt must say the absence was capped');
    const segs = capped.summary.segments || [];
    eq(segs.map((s) => dayOf(s.fromMs)), [dayOf(WIN_FROM), dayOf(WIN_FROM) + 1],
      'WINDOW: the Boss-of-the-Day segments must be cut from the FIRST 12h of the absence '
      + '(day D 22:00-24:00 + day D+1 00:00-10:00). Later days mean the window was anchored '
      + 'to the return instant, which lets return timing pick the multiplier.');
    eq(segs[0].fromMs, WIN_FROM, 'WINDOW: the first segment must begin when the player left');
    eq(segs[segs.length - 1].toMs, WIN_FROM + WIN_CAP_MS, 'WINDOW: the last must end with the window');
  }

  /* (b) AND IT IS THE MULTIPLIER THAT MOVES, not just a label. Fight day D's
     featured boss: the credited window pays it (2h of featured time), while the
     window the OLD anchor would have credited — the same 12h span, positioned
     at the return instant — pays none, because by then it is a different day's
     boss. That control is what makes this an exploit test and not a field test. */
  const bossD = botdFor(WIN_FROM, MONSTERS).dailyId;
  const bossD1 = botdFor(WIN_FROM + WIN_CAP_MS, MONSTERS).dailyId;
  ok(bossD !== bossD1,
    `WINDOW COVERAGE: the featured boss did not rotate across this fixture's UTC boundary `
    + `(${bossD} both days) — the exploit this guard exists for cannot be expressed; move WIN_FROM`);
  if (MONSTERS[bossD]) {
    const paid = serverAccrual({
      activeId: bossD, accruedToMs: WIN_FROM, activeSinceMs: WIN_FROM, nowMs: WIN_NOW,
      capMs: WIN_CAP_MS, skills: MAXED, hp: 99, maxHp: 99,
    });
    ok(paid.accrued === true, `WINDOW: the featured-boss fixture accrued nothing (${paid.reason})`);
    ok(paid.accrued && paid.summary.featuredMs > 0,
      'WINDOW: an absence begun on the featured boss\'s own day must be paid featured time — got '
      + (paid.accrued ? paid.summary.featuredMs : 'nothing'));
    /* The counterfactual, computed rather than asserted from memory: the LAST
       12h of the same absence, same monster, same seed. */
    const returnAnchored = clientAwaySpan({
      monsterId: bossD, equipment: EQUIPMENT, skills: MAXED, hp: 99, maxHp: 99,
      seed: SEED, fromMs: WIN_NOW - WIN_CAP_MS, toMs: WIN_NOW, capped: true,
    });
    eq(returnAnchored.summary.featuredMs, 0,
      'WINDOW COVERAGE: the return-anchored window ALSO paid featured time on this fixture, so the '
      + 'comparison proves nothing (a weekly boss probably spans both days) — move WIN_FROM');
  }

  /* (c) THE WATERMARK DOES NOT FOLLOW THE WINDOW. `accrued_to` is `now()`, not
     `windowTo`: the forfeited tail IS the cap, and a cap that can be collected
     in instalments is not a cap.
     MUTATION PROVEN: set `accrued_to` to the window's end and the counterfactual
     below stops being a counterfactual — the player collects the same night's
     leftover six hours immediately, and a 40h absence becomes four 12h nights. */
  if (capped.accrued) {
    eq(capped.delta.accrued_to, new Date(WIN_NOW).toISOString(),
      'WINDOW: a capped accrual must stamp the watermark at now(), never at the end of the paid window');
    const again = serverAccrual({
      accruedToMs: WIN_NOW, activeSinceMs: WIN_FROM, nowMs: WIN_NOW,
      capMs: WIN_CAP_MS, skills: MAXED, hp: 99, maxHp: 99,
    });
    ok(again.accrued === false && again.reason === 'below_min_span',
      'WINDOW: coming straight back after a capped night must pay nothing, got '
      + JSON.stringify({ accrued: again.accrued, reason: again.reason, ms: again.grantMs }));
    /* …and the same call from the window's end DOES pay, which is exactly the
       instalment hazard the comment in accrual.js is defending against. If this
       ever stops accruing, the assertion above has gone vacuous. */
    const instalment = serverAccrual({
      accruedToMs: WIN_FROM + WIN_CAP_MS, activeSinceMs: WIN_FROM, nowMs: WIN_NOW,
      capMs: WIN_CAP_MS, skills: MAXED, hp: 99, maxHp: 99,
    });
    ok(instalment.accrued === true && Math.abs(instalment.grantMs - (WIN_AWAY_MS - WIN_CAP_MS)) < 1000,
      'WINDOW COVERAGE: a watermark left at the end of the paid window would NOT have paid the '
      + 'leftover tail, so the assertion above proves nothing');
  }

  /* (d) AN UNCAPPED ABSENCE IS BYTE-IDENTICAL. The flip may only move a window
     that was being cut short; anything else is a balance change nobody asked
     for, and the parity fixtures above would only catch it by luck. */
  const whole = serverAccrual({ skills: MAXED, hp: 99, maxHp: 99 });
  const client = clientAwaySpan({
    monsterId: MONSTER, equipment: EQUIPMENT, skills: MAXED, hp: 99, maxHp: 99,
    seed: SEED, fromMs: FROM_MS, toMs: NOW_MS, capped: false,
  });
  if (whole.accrued) {
    eq(whole.summary.windowFrom, FROM_MS, 'WINDOW: an uncapped window still opens at the watermark');
    eq(whole.summary.windowTo, NOW_MS, 'WINDOW: …and an uncapped one closes at now()');
    eq(whole.summary.unpaidMs, 0, 'WINDOW: nothing is forfeited when the absence fits in the cap');
    eq(whole.summary.ticks, client.summary.ticks, 'WINDOW: an uncapped night changed length');
    eq(whole.summary.xp, client.xp, 'WINDOW: an uncapped night changed value');
  }
}

// ── 1b. AUTO-EAT PARITY ─────────────────────────────────────────────────────
// The gap this guard was written for, and the number that justified closing it.
//
// `src/core/combat-sim.js` calls `fx.autoEat` after the monster's swing and
// BEFORE the death check, so a successful eat is what keeps an unattended night
// running. The server had no such handler and a missing fx handler is a NO-OP
// BY CONSTRUCTION — so it never threw, never logged, and no test saw it. The
// server's character simply died early and stopped earning.
//
// MEASURED 2026-08-15, same seed, same window, same state, varying ONLY whether
// the handler exists (`node tests/accrual-engine.mjs --report`):
//
//   early-game goblin        server 1,218 kills / 1.17h   client 12,790 / 12.00h   -90.5%
//   maxed vs slime           server 6,007 kills / 4.44h   client 16,211 / 12.00h   -62.9%
//   maxed vs the day-1 boss  server    48 kills / 0.13h   client  4,721 / 12.00h   -99.0%
//
// Section 1's fixtures cannot catch this, and the reason is worth stating: they
// run with auto-eat OFF (the shipped default), so BOTH sides die at the same
// tick and parity holds while the handler is missing entirely. A parity suite
// that only exercises the default is a parity suite with a hole the size of the
// feature. So this section is the same comparison with the feature ON.
//
// THE ASSERTION IS EQUALITY, not "the server now pays more". Under the
// 2026-08-15 ruling — "the offline portion should function exactly the same as
// if the player was still online" — anything other than an exact match is the
// defect, in either direction.
function autoEatParityGuard() {
  /* The top healing Provision, chosen FROM THE CATALOGUE rather than named, so
     a data edit cannot quietly make this fixture eat something that no longer
     exists. `FEAST` is the b220 control: it HEALS but is `foodClass: 'buff'`,
     so it must never be eaten even when it is the only food owned. */
  const PROVISION = Object.keys(ITEMS)
    .filter((id) => ITEMS[id] && ITEMS[id].foodClass === 'healing' && ITEMS[id].heals > 0)
    .sort((a, b) => ITEMS[b].heals - ITEMS[a].heals)[0];
  const FEAST = Object.keys(ITEMS)
    .filter((id) => ITEMS[id] && ITEMS[id].foodClass === 'buff' && ITEMS[id].heals > 0)
    .sort((a, b) => ITEMS[b].heals - ITEMS[a].heals)[0];
  ok(!!PROVISION, 'AUTO-EAT: no healing Provision in the catalogue — the fixture is vacuous');
  ok(!!FEAST, 'AUTO-EAT: no buff food in the catalogue — the b220 "never burn a Feast" rule is untested');

  const PCT = 50;                       // stored form: integer percent
  const seen = { ate: 0, survivedFull: 0, negativeDelta: 0 };

  for (const f of FIXTURES) {
    const inventory = { [PROVISION]: 5000 };

    const s = serverAccrual({
      activeId: f.monster, skills: f.skills, hp: f.hp, maxHp: f.maxHp,
      inventory, autoEatEnabled: true, autoEatFood: PROVISION, autoEatPct: PCT,
    });
    ok(s.accrued === true, `AUTO-EAT [${f.name}]: accrued nothing (reason: ${s.reason})`);
    if (!s.accrued) continue;

    const c = clientAwaySpan({
      monsterId: f.monster, equipment: EQUIPMENT, skills: f.skills,
      hp: f.hp, maxHp: f.maxHp, seed: SEED, fromMs: FROM_MS, toMs: NOW_MS, capped: false,
      inventory,
      traits: { auto_eat: true },
      // The CLIENT holds a fraction; the SERVER holds an integer percent. The
      // two must resolve to the same number or the fight diverges on the one
      // tick where hp/maxHp sits exactly on the threshold.
      eat: { enabled: true, threshold: PCT / 100, foodId: PROVISION },
    });

    const P = (m) => `AUTO-EAT PARITY [${f.name}]: ${m}`;
    eq(s.summary.ticks, c.summary.ticks, P('tick count differs'));
    eq(s.summary.kills, c.summary.kills, P('kill count differs'));
    eq(s.summary.crits, c.summary.crits, P('crit count differs'));
    eq(s.summary.died, c.summary.died, P('death outcome differs — one side ate and the other did not'));
    eq(s.summary.survivedMs, c.summary.survivedMs, P('time survived differs'));
    eq(s.summary.foodEaten, c.summary.foodEaten, P('food eaten differs'));
    eq(s.summary.gold, c.gold, P('gold differs'));
    eq(s.summary.xp, c.xp, P('XP grants differ'));
    eq(s.delta.hp, Math.max(0, Math.min(c.maxHp, Math.floor(c.hp))), P('resulting HP differs'));

    /* THE CONSUMPTION, both sides. The client decremented G.inventory; the
       server proposed a NEGATIVE item delta. They must name the same food and
       the same count, or one of them is eating for free. */
    const eaten = s.foodEaten;
    eq(eaten, c.ate, P('the server and the client ate a different number of meals'));
    eq(eaten, s.summary.foodEaten, P('the engine\'s own meal counter disagrees with the simulation\'s'));
    const clientLeft = c.inventory[PROVISION] || 0;
    eq(5000 - clientLeft, eaten, P('the client\'s bag does not reflect the meals eaten'));
    ok((s.delta.items || {})[PROVISION] === -eaten,
      P(`the server's item delta for ${PROVISION} is ${(s.delta.items || {})[PROVISION]}, expected ${-eaten} `
        + '— food eaten server-side must be DEBITED, or auto-eat is a free heal'));

    if (eaten > 0) { seen.ate += eaten; seen.negativeDelta++; }
    if (!s.summary.died) seen.survivedFull++;

    /* THE b220 RULE, on the server. Give the character ONLY Feasts. Auto-eat
       must decline to burn one — so the fight must be byte-identical to a
       character with no food at all, rather than merely "different". */
    const feastOnly = serverAccrual({
      activeId: f.monster, skills: f.skills, hp: f.hp, maxHp: f.maxHp,
      inventory: { [FEAST]: 5000 }, autoEatEnabled: true, autoEatFood: FEAST, autoEatPct: PCT,
    });
    const noFood = serverAccrual({ activeId: f.monster, skills: f.skills, hp: f.hp, maxHp: f.maxHp });
    eq(feastOnly.summary.kills, noFood.summary.kills,
      P(`a bag of ${FEAST} (foodClass:buff) changed the fight — auto-eat burned a Feast (b220)`));
    ok(!((feastOnly.delta.items || {})[FEAST] < 0),
      P(`the server debited ${FEAST} — a Feast must never be auto-eaten`));

    /* THE ENTITLEMENT GATE, on the engine. Identical state, identical food,
       `autoEatEnabled` false — which is what every character has until
       hr_set_auto_eat is called with the trait owned. It must be byte-identical
       to no food at all, or shipping the handler hands out a 100-Bounty-Mark
       trait for free. */
    const unowned = serverAccrual({
      activeId: f.monster, skills: f.skills, hp: f.hp, maxHp: f.maxHp,
      inventory, autoEatEnabled: false, autoEatFood: PROVISION, autoEatPct: PCT,
    });
    eq(unowned.summary.kills, noFood.summary.kills,
      P('auto_eat_enabled=false still ate — the purchased-trait gate does not hold'));
  }

  /* COVERAGE. Without these, a fixture set that never actually eats would pass
     every assertion above by comparing two identical no-ops — which is exactly
     how the missing handler survived until now. */
  ok(seen.ate > 0, 'AUTO-EAT COVERAGE: no fixture ate anything — the handler is untested');
  ok(seen.negativeDelta > 0,
    'AUTO-EAT COVERAGE: no fixture produced a negative item delta — the signed-delta path is untested');
  ok(seen.survivedFull > 0,
    'AUTO-EAT COVERAGE: every fixture still died with auto-eat on — the fixtures do not exercise '
    + 'the outcome the feature exists to produce (surviving the night)');

  /* ── THE BAG IS LIVE, NOT A SNAPSHOT ──────────────────────────────────
     The client's auto-eat reads `G.inventory`, which `addItem` mutates, so a
     Provision that DROPS at hour two is edible at hour three. The server keeps
     a running bag for the same reason.

     NO AUTHORED MONSTER DROPS AN AUTO-EATABLE ITEM TODAY (checked below), so
     this property is unreachable through the real catalogue — which is exactly
     why it needs a test rather than a shrug: the day someone adds a wolf that
     drops Cooked Wolf Meat, a snapshot bag would silently under-pay every
     absence and the fixture-based parity above would stay green. Proven here by
     INJECTING a catalogue, which is legitimate because `items` and `monsters`
     are parameters of computeAccrual, not globals.

     Mutation-proven: freezing `bag` at the start of the night leaves every
     fixture-based assertion above green and turns this one red. */
  const dropsFood = Object.entries(MONSTERS).some(([, m]) =>
    (m.drops || []).some((d) => ITEMS[d.id] && ITEMS[d.id].foodClass === 'healing'));
  ok(!dropsFood,
    'AUTO-EAT: a monster now drops an auto-eatable item — the live-bag property is reachable '
    + 'through the real catalogue, so add it to FIXTURES above instead of relying on the '
    + 'injected-catalogue probe below.');
  {
    const FOOD = 'probe_ration';
    const MON = 'probe_feeder';
    const items = {
      ...ITEMS,
      [FOOD]: { n: 'Probe Ration', v: 1, heals: 40, foodClass: 'healing' },
    };
    const monsters = {
      [MON]: {
        name: 'Probe Feeder', tier: 1, hp: 12, def: 0, atk: 40, maxHit: 9,
        xp: 10, gp: [1, 1], weaponWeak: 'neutral',
        drops: [{ id: FOOD, ch: 1 }],       // guaranteed, so the bag really refills
      },
    };
    const common = {
      userId: '00000000-0000-4000-8000-000000000001', slot: 0,
      nowMs: NOW_MS, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
      activeKind: 'combat', activeId: MON, capMs: SPAN_MS, seed: SEED,
      hp: 40, maxHp: 40, gold: 0, skills: baseSkills(), equipment: {},
      items, monsters,
      autoEatEnabled: true, autoEatFood: FOOD, autoEatPct: 50,
    };
    /* THREE rations to start: enough to prove eating happens at all, far too
       few to survive twelve hours on. Everything past the third meal must have
       come out of the drop table. */
    const live = computeAccrual({ ...common, inventory: { [FOOD]: 3 } });
    ok(live.accrued === true, `AUTO-EAT LIVE BAG: the probe accrued nothing (${live.reason})`);
    if (live.accrued) {
      ok(live.foodEaten > 3,
        `AUTO-EAT LIVE BAG: ate ${live.foodEaten} meals from a starting stack of 3 — food that DROPPED `
        + 'during the absence was not edible, so the server is holding a snapshot of the bag while '
        + 'the client holds a live one');
      /* And the net delta must still be honest: gained minus eaten, never a
         debit larger than the character could pay for. */
      const net = (live.delta.items || {})[FOOD];
      ok(Number.isInteger(net) && net >= -3,
        `AUTO-EAT LIVE BAG: the net ${FOOD} delta is ${net} — a debit deeper than the starting stack `
        + 'means the engine proposed eating food that never existed, which hr_apply answers with '
        + 'insufficient_item and index.ts does NOT degrade, i.e. a 409 for the whole night');
    }
  }

  /* THE CORE'S OWN GATES, asserted DIRECTLY rather than through the engine.
     Learned the hard way: the first version of this section tested `owned` only
     through computeAccrual, where `enabled` and `owned` come from the same
     column — so a mutation that hard-coded `owned: true` changed nothing and
     the assertion passed while asserting nothing (instance #16). The client
     holds the two facts separately, so the predicate has to be gated on each of
     them independently, and that is provable here in one call. */
  const eatable = { hp: 10, maxHp: 100, threshold: 0.5, items: ITEMS,
                    inventory: { [PROVISION]: 10 }, foodId: PROVISION };
  ok(resolveAutoEat({ ...eatable, enabled: true, owned: true }) !== null,
    'AUTO-EAT: the control did not eat — every gate assertion below is vacuous');
  ok(resolveAutoEat({ ...eatable, enabled: true, owned: false }) === null,
    'AUTO-EAT: a character WITHOUT the purchased trait ate — the 100-Bounty-Mark gate does not hold');
  ok(resolveAutoEat({ ...eatable, enabled: false, owned: true }) === null,
    'AUTO-EAT: a character with auto-eat switched OFF ate anyway');
  ok(resolveAutoEat({ ...eatable, enabled: true, owned: true, hp: 90 }) === null,
    'AUTO-EAT: ate at 90% HP against a 50% threshold');
  ok(resolveAutoEat({ ...eatable, enabled: true, owned: true, hp: 50 }) !== null,
    'AUTO-EAT: did NOT eat at exactly the threshold — the client eats when hp/maxHp <= threshold');
  ok(resolveAutoEat({ ...eatable, enabled: true, owned: true, hp: 0 }) === null,
    'AUTO-EAT: ate while dead — respawn owns that, and a corpse eating is a free resurrection');
  ok(resolveAutoEat({ ...eatable, enabled: true, owned: true, inventory: {} }) === null,
    'AUTO-EAT: ate out of an empty bag');
  ok(resolveAutoEat({ ...eatable, enabled: true, owned: true, inventory: { [FEAST]: 99 }, foodId: FEAST }) === null,
    `AUTO-EAT: burned a ${FEAST} — a foodClass:buff item is never auto-eaten (b220)`);
  /* A nominated food the player has run OUT of must fall back to the best
     Provision in the bag, not stop eating. */
  ok(resolveAutoEat({ ...eatable, enabled: true, owned: true,
                      foodId: PROVISION, inventory: { [PROVISION]: 0, shrimp: 5 } })?.foodId === 'shrimp',
    'AUTO-EAT: running out of the nominated food stopped auto-eat instead of falling back to the bag');

  /* THE STORED FORM ROUND-TRIPS EXACTLY. The client holds a fraction from a
     slider that steps by 0.05; the server holds an integer percent. Every step
     the UI can produce must survive the conversion as the SAME double, or the
     two sides disagree about whether hp/maxHp is at the threshold. */
  for (let k = 0; k <= 20; k++) {
    /* `(k*5)/100`, NOT `k*0.05`. An `<input type=range step=0.05>` yields a
       STRING that parses to the exact decimal ("0.15" -> 0.15); computing the
       same ladder by repeated multiplication does not (`3*0.05` is
       0.15000000000000002, `6*0.05` is 0.30000000000000004). Writing this
       fixture the wrong way was the first thing this assertion caught, and it
       is the same class of error the integer column exists to remove. */
    const frac = (k * 5) / 100;
    const pct = pctFromThreshold(frac);
    ok(pct === k * 5, `AUTO-EAT: slider step ${frac} stored as ${pct}%, expected ${k * 5}`);
    ok(thresholdFromPct(pct) === frac,
      `AUTO-EAT: ${pct}% reads back as ${thresholdFromPct(pct)}, not the ${frac} the slider set — `
      + 'the client and the server would disagree on the threshold tick');
    /* ...and the float-accumulated form must land on the SAME percent, because
       a client that computed its fraction that way still has to store it. */
    ok(pctFromThreshold(k * 0.05) === k * 5,
      `AUTO-EAT: the float-accumulated ${k * 0.05} stored as ${pctFromThreshold(k * 0.05)}%, expected ${k * 5}`);
  }
  /* 0 MUST MEAN ZERO. This is the b326 bug in its new home: `threshold || 0.5`
     was a falsy-coalesce on a number and turned "never auto-eat" into 50%. */
  ok(thresholdFromPct(0) === 0, 'AUTO-EAT: a stored 0% must mean NEVER, not the 50% default');
  ok(resolveAutoEat({ enabled: true, owned: true, hp: 1, maxHp: 100, threshold: 0,
                      inventory: { [PROVISION]: 5 }, items: ITEMS }) === null,
    'AUTO-EAT: a 0% threshold ate at 1% HP — "never auto-eat" is not honoured');
  /* ...and a garbage threshold falls back to the default rather than to 0 or 1,
     because both of those are real settings that would be silently applied. */
  for (const junk of [undefined, null, NaN, 'half', {}, Infinity]) {
    ok(thresholdFromPct(junk) === DEFAULT_THRESHOLD,
      `AUTO-EAT: a ${String(junk)} threshold resolved to ${thresholdFromPct(junk)}, not the default`);
  }

  /* THE TIE-BREAK IS DETERMINISTIC AND ORDER-INDEPENDENT. The authored
     catalogue has nine tied `heals` values, and the two sides receive the bag in
     different key orders — the client's is insertion history, the server's comes
     from jsonb_object_agg (length, then bytewise). The old rule (`heals >
     bestHeals` over `for…in`) would therefore have drained different stacks on
     each side. Proven by feeding the SAME bag in two different orders. */
  const tied = {};
  for (const [id, it] of Object.entries(ITEMS)) {
    if (it && it.foodClass === 'healing' && it.heals > 0) (tied[it.heals] ||= []).push(id);
  }
  const pair = Object.values(tied).find((ids) => ids.length > 1);
  ok(!!pair, 'AUTO-EAT: no two Provisions heal the same amount — the tie-break guard is vacuous, '
    + 'which means it would stop protecting the moment the data changed back');
  if (pair) {
    const fwd = {}; for (const id of pair) fwd[id] = 3;
    const rev = {}; for (const id of [...pair].reverse()) rev[id] = 3;
    eq(bestHealingFood(fwd, ITEMS), bestHealingFood(rev, ITEMS),
      `AUTO-EAT: bestHealingFood picked a different food for the same bag in a different key order `
      + `(${pair.join(' vs ')}) — the client and the server would drain different stacks`);
  }
}

// ── 1b-ii. THE SETTLE EATS AT EVERY SPAN — THERE IS NO "AWAY ONLY" ──────────
// ⚠ READ THIS BEFORE TOUCHING src/legacy.js `noteItemConsumed` OR
//   src/net/accrue.js `clientOwnsAutoEatDebit`.
//
// THE BELIEF THIS GUARD EXISTS TO KILL, quoted from the b497 staging note that
// held it (supabase/migrations/2026-09-04-auto-eat-at-creation.sql, header):
// "the server's sim only eats during AWAY accrual". It does not, and acting on
// that belief has one specific consequence: the client would start sending an
// `eat` intent for an ATTENDED auto-eat that the settle ALREADY debits, which is
// a DOUBLE DEBIT — real item loss, strictly worse than the restock the send was
// meant to fix. That exact direction is guarded on the client by EAT-RESTOCK-6
// block 2; this is the SERVER-side half — the measurement the client gate rests
// on — so the premise can never be re-asserted from either end.
//
// WHY THE BELIEF IS FALSE, structurally: `computeAccrual` has NO away input and
// no presence input. It prices `[max(accrued_to, active_since), +grantMs]` —
// whatever elapsed — and `fx.autoEat()` is gated on `autoEatEnabled` ALONE. The
// client settles on a ~90 s cadence WHILE VISIBLE (src/net/accrue.js: "The
// cadence (§3.1). 90 s"), and live settlement is the shipped model, not a plan
// (docs/design/live-settlement.md Phase 0; src/net/predict.js measures a live
// mid-fight window where the settle moved kills 3756 -> 3755). So an attended
// 90 s window is simulated, paid, and — with auto-eat on — EATEN, by the server.
//
// THE MUTANT: add any span/away condition to `fx.autoEat` (e.g. only eat when
// `grantMs` exceeds some "this was a night" threshold). Every fixture in
// autoEatParityGuard above runs a TWELVE-HOUR span and stays green; only the
// short spans here go red.
function attendedSettleAutoEatGuard() {
  const PROVISION = Object.keys(ITEMS)
    .filter((id) => ITEMS[id] && ITEMS[id].foodClass === 'healing' && ITEMS[id].heals > 0)
    .sort((a, b) => ITEMS[b].heals - ITEMS[a].heals)[0];
  if (!PROVISION) return;                 // already reported by autoEatParityGuard

  /* A FRESH CHARACTER, which is the shape the b497 ruling is about: 10 max HP,
     no equipment, no skills, the tier-I clamp (25%). Deliberately NOT the
     FIXTURES above — those are 60/99 HP veterans over a 12 h night, i.e. exactly
     the case that stays green under the mutant. */
  const run = (spanMs, autoEatEnabled) => computeAccrual({
    userId: '00000000-0000-4000-8000-000000000001', slot: 0,
    nowMs: FROM_MS + spanMs, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
    activeKind: 'combat', activeId: MONSTER,
    capMs: SPAN_MS, seed: SEED,
    hp: 10, maxHp: 10, gold: 0,
    skills: {}, equipment: {},
    inventory: { [PROVISION]: 5000 },
    autoEatEnabled, autoEatFood: PROVISION, autoEatPct: maxPctForTier(1),
    items: ITEMS, monsters: MONSTERS,
  });

  /* ACCRUE_MIN_MS is the SHORTEST window the engine will pay — below it the
     answer is `below_min_span` — and 90 s is the client's actual settle cadence.
     Both are ATTENDED windows by construction: no human is "away" for 60 s and
     the tab is visible the whole time. */
  const SPANS = [ACCRUE_MIN_MS, 90000, 5 * 60000];
  let saw = 0;
  for (const spanMs of SPANS) {
    const label = `${Math.round(spanMs / 1000)}s`;
    const on = run(spanMs, true);
    ok(on.accrued === true,
      `ATTENDED-EAT [${label}]: the engine accrued nothing (${on.reason}) — the fixture is vacuous`);
    if (!on.accrued) continue;

    ok(on.foodEaten > 0,
      `ATTENDED-EAT [${label}]: the settle ate NOTHING over an attended window. If this is a `
      + 'deliberate change, the client gate has to move with it — src/legacy.js noteItemConsumed '
      + 'currently declines to send an `eat` intent whenever the server reports '
      + 'auto_eat_enabled=true, on the strength of exactly this measurement.');
    ok((on.delta.items || {})[PROVISION] === -on.foodEaten,
      `ATTENDED-EAT [${label}]: ate ${on.foodEaten} but the item delta is `
      + `${(on.delta.items || {})[PROVISION]} — an attended meal that is not DEBITED is the free `
      + 'food the client gate assumes cannot happen');
    saw += on.foodEaten;

    /* AND THE PAYMENT DEPENDS ON IT. This is why the debit belongs to the
       settle: with auto-eat off, the SAME attended minute pays ZERO kills and
       reports a death, because `simulateSpan` breaks on the first death. The
       server eating is not a courtesy — it is the mechanism by which an attended
       window is paid at all for a 10-HP character. */
    const off = run(spanMs, false);
    ok(off.foodEaten === 0,
      `ATTENDED-EAT [${label}]: auto_eat_enabled=false still ate — the entitlement gate does not hold`);
    ok(off.summary.kills === 0 && off.summary.died === true,
      `ATTENDED-EAT [${label}]: the auto_eat_enabled=false control paid ${off.summary.kills} kills / `
      + `died=${off.summary.died}, so this fixture no longer demonstrates the death loop the b497 `
      + 'ruling exists to close — re-pick it rather than deleting the assertion');
  }
  ok(saw > 0, 'ATTENDED-EAT COVERAGE: no span ate anything — every assertion above was vacuous');
}

// ── 1c. GATHER PARITY ───────────────────────────────────────────────────────
// THE CONTRACT, for the other 23 activities. Measured 2026-08-15, before this
// landed, by running the shipped engine over `hr_activities`:
//
//   combat / goblin              -> accrued=TRUE  gold=477 xp={attack:3235,…}
//   gather / oak_tree            -> accrued=FALSE reason='unsupported_activity'
//   gather / copper_rock         -> accrued=FALSE reason='unsupported_activity'
//
// 313 of 344 catalogue rows (91%) paid nothing server-side; a player who logged
// off chopping Oak got a zero night. This section is the proof that a gathering
// night now pays, and pays EXACTLY what the shipped client would have paid.
//
// ⚠ THE CLIENT SIDE BELOW IS A TRANSCRIPTION OF legacy.js, NOT A CALL INTO
//   src/core/skill-sim.js. That is the whole point and it is a stronger
//   construction than the combat section's: combat's client reference calls
//   `simulateSpan` because legacy.js already calls `simulateSpan`. legacy.js does
//   NOT yet call `simulateSkillSpan` — it runs `replayAwaySpan` (legacy.js:1153)
//   over `doSkillAction` (legacy.js:3825) at the interval `activityIntervalMs`
//   (legacy.js:3691) derives. So the reference below is those three functions
//   written out, with their window.* helpers replaced by the same core calls
//   they delegate to and their render calls dropped.
//
//   Which means this test answers the question that actually matters: does the
//   SERVER pay what the CLIENT SHIPPING TODAY pays? If it does, the client
//   switch-over is a delegation with no balance change. If this file called
//   `simulateSkillSpan` on both sides it would prove that a function equals
//   itself.
const GATHER_SOURCES = { woodcutting: TREES, mining: ROCKS, fishing: FISH_SPOTS };
const GATHER_INDEX = indexGatherNodes(GATHER_SOURCES);

/* legacy.js:3691 activityIntervalMs() — written out.
   `Math.max(500, Math.floor(pacedActionMs(act.ms||3000) * speedClamp(speed)))`
   where `speed = getBonus('gatherSpeed') + HearthriseTools.bestToolSpeed(skill)`.
   Deliberately NOT `actionIntervalMs()` from core/pacing.js: this reference has
   to spend the terms independently, or a change to the shared helper would move
   both columns together and parity would stay green while the number drifted. */
function clientGatherIntervalMs(skill, node, inventory, equipment, bonus) {
  const tool = bestTool(skill, inventory, equipment, ITEMS);
  const speed = (bonus('gatherSpeed') || 0) + toolSpeed(tool);
  return Math.max(500, Math.floor(pacedActionMs(node.ms || 3000) * speedClamp(speed)));
}

/**
 * legacy.js:1153 `replayAwaySpan` + :3825 `doSkillAction(true)`, transcribed.
 *
 * @returns { xp, items, stats, toolCarry, ticks, paidMs, intervalMs, buffPaidMs,
 *            buffsExpired, stopped }
 */
function clientGatherSpan(opts) {
  const skill = opts.skill;
  const node = opts.node;
  const bonus = opts.bonus || (() => 0);
  /* `G`, as the client holds it. `inventory` is LIVE — addItem mutates it — and
     `toolCarry` is the persisted fractional carry (legacy.js:3841). */
  const G = {
    activeSkill: skill,
    skillTargetId: node.id,
    skills: { ...opts.skills },
    inventory: { ...(opts.inventory || {}) },
    equipment: opts.equipment || {},
    toolCarry: { ...(opts.toolCarry || {}) },
    stats: {},
    buffs: opts.buffs || [],
  };
  const eqStats = equipmentStats(G.equipment, ITEMS);
  const gained = {};

  /* doSkillAction(true) — the silent (offline-replay) arm. */
  const doSkillAction = () => {
    const res = resolveGatherAction(node, {
      skillId: skill,
      level: levelOf(G.skills, skill),
      toolCarry: G.toolCarry,
      toolDouble: toolDouble(bestTool(skill, G.inventory, G.equipment, ITEMS)),
      toolXpB: toolXpB(bestTool(skill, G.inventory, G.equipment, ITEMS)),
      rng: opts.rng,
    });
    if (!res.ok) return false;                       // 'level' -> stopSkill()
    if (res.toolDoubles > 0) G.stats.toolDoubles = (G.stats.toolDoubles || 0) + res.toolDoubles;
    // addItem
    gained[res.product] = (gained[res.product] || 0) + res.qty;
    G.inventory[res.product] = (G.inventory[res.product] || 0) + res.qty;
    G.stats.gathered = (G.stats.gathered || 0) + res.qty;
    const per = { woodcutting: 'chopped', mining: 'mined', fishing: 'fished' }[skill];
    if (per) G.stats[per] = (G.stats[per] || 0) + res.qty;
    // addXp — legacy.js:2534, through core's grantXp with the client's xpGrantCtx
    const tXp = toolXpB(bestTool(skill, G.inventory, G.equipment, ITEMS));
    grantXp(G, skill, tXp > 0 ? node.xp * (1 + tXp) : node.xp,
      { bonus, xpB: eqStats.xpB || 0, restedQuantum: 0, authored: false });
    return true;
  };

  /* replayAwaySpan — the slice loop, verbatim in behaviour. */
  const out = { ticks: 0, paidMs: 0, stopped: false, buffPaidMs: 0, buffsExpired: [] };
  let remaining = Math.max(0, opts.spanMs);
  let carryMs = 0; let slices = 0; let lastStep = 0;
  while (remaining > 0) {
    const stepMs = Math.max(1, clientGatherIntervalMs(skill, node, G.inventory, G.equipment, bonus));
    lastStep = stepMs;
    const boundary = (slices++ < 64) ? nextBuffExpiryMs(G.buffs) : Infinity;
    const sliceMs = Math.min(remaining, boundary);
    const wasBuffed = hasActiveBuff(G.buffs);
    const budget = sliceMs + carryMs;
    const n = Math.floor(budget / stepMs);
    let ran = 0;
    for (let i = 0; i < n; i++) { if (!doSkillAction()) break; ran++; }
    out.ticks += ran;
    const drain = (ms) => {
      if (!(ms > 0) || !G.buffs.length) return;
      const r = tickBuffs(G.buffs, ms, { away: true, active: true });
      for (const t of r.expired) out.buffsExpired.push(t);
    };
    if (ran < n) {
      const workedMs = ran * stepMs;
      out.paidMs += workedMs;
      if (wasBuffed) out.buffPaidMs += workedMs;
      drain(workedMs);
      out.stopped = true;
      break;
    }
    carryMs = budget - n * stepMs;
    out.paidMs += sliceMs;
    if (wasBuffed) out.buffPaidMs += sliceMs;
    drain(sliceMs);
    remaining -= sliceMs;
  }

  const xp = {};
  for (const k in G.skills) {
    const d = Math.floor((G.skills[k] || 0) - (opts.skills[k] || 0));
    if (d > 0) xp[k] = d;
  }
  return { ...out, xp, items: gained, stats: G.stats, toolCarry: G.toolCarry,
           intervalMs: lastStep, inventory: G.inventory };
}

/* The best tool the catalogue actually contains for a skill, chosen FROM the
   data rather than named — an invented item would test the engine against
   content the game does not have. */
function bestOwnedTool(skill) {
  return Object.keys(ITEMS)
    .filter((id) => ITEMS[id] && ITEMS[id].type === 'tool' && ITEMS[id].toolSkill === skill)
    .sort((a, b) => (ITEMS[b].toolTier || 0) - (ITEMS[a].toolTier || 0))[0] || null;
}

/* SKILL XP high enough to open every rung, so a fixture is never silently
   testing the level gate instead of the yield. 13,034,431 = level 99. */
const GATHER_MAXED = { woodcutting: 13034431, mining: 13034431, fishing: 13034431 };
/* The artisan benches, at 99, for the clamp/day-budget sweeps below. Same
   reason GATHER_MAXED exists: a fixture that is silently testing a level gate
   is not testing a yield. */
const ARTISAN_MAXED = { smithing: 13034431, crafting: 13034431, cooking: 13034431, prayer: 13034431 };
const ARTISAN_INDEX = indexArtisanRecipes(ARTISAN_RECIPES);
/* Every gated recipe unlocked. DERIVED from the data — a hand-listed set would
   go stale the day a ninth scroll is authored, and the recipes behind scrolls
   are the top of the ladder, i.e. exactly the ones a clamp sweep must see. */
const ARTISAN_SCROLLS = Object.fromEntries(
  Object.values(ARTISAN_INDEX).filter((e) => e.recipe.gated).map((e) => [e.recipe.gated, true]));

const GATHER_FIXTURES = [
  /* qty [1,1], no tool — the flat case. `rng.int(n,n)` returns WITHOUT drawing,
     so this fixture is deterministic with or without a seed, which is exactly
     why the two below exist. */
  { name: 'bare-handed Normal Tree', node: 'normal_tree', tool: false },
  /* qty [2,3] — a real RNG draw per action, ~3,200 of them. */
  { name: 'Rich Coal Seam (qty 2-3, a draw per action)', node: 'rich_coal_rock', tool: false },
  /* qty [1,2] AND the top axe: tool speed changes the interval, tool double
     changes the yield through the fractional carry, tool xpB changes the grant.
     All three terms live at once. */
  { name: 'Maple with the best axe (speed + carry + xpB)', node: 'maple_tree', tool: true },
  /* A third skill, so the per-skill stat routing and the rod ladder are covered. */
  { name: 'Fishing with the best rod', node: null, skill: 'fishing', tool: true },
];

function gatherParityGuard() {
  const seen = { draws: 0, doubles: 0, ticks: 0, skills: new Set(), speeds: new Set() };

  ok(Object.keys(GATHER_INDEX).length === TREES.length + ROCKS.length + FISH_SPOTS.length,
    `GATHER: the index holds ${Object.keys(GATHER_INDEX).length} nodes, the data holds `
    + `${TREES.length + ROCKS.length + FISH_SPOTS.length} — a node id is claimed twice`);
  eq(duplicateGatherIds(GATHER_SOURCES), [],
    'GATHER: two gathering sources claim the same node id — the index would resolve it to one '
    + 'skill and the other skill\'s node would be unreachable');
  /* The prototype hazard, measured rather than asserted about. `active_id` is
     bounded by /^[a-z0-9_]{1,64}$/, which matches `constructor`. */
  for (const probe of ['__proto__', 'constructor', 'toString', 'valueOf']) {
    ok(GATHER_INDEX[probe] === undefined,
      `GATHER: the index resolves '${probe}' — a null-prototype container was expected`);
  }

  for (const f of GATHER_FIXTURES) {
    const skill = f.skill || GATHER_INDEX[f.node].skill;
    const nodeId = f.node || FISH_SPOTS[FISH_SPOTS.length - 1].id;
    const node = GATHER_INDEX[nodeId].node;
    const toolId = f.tool ? bestOwnedTool(skill) : null;
    ok(!f.tool || !!toolId, `GATHER [${f.name}]: no tool exists for ${skill} — the fixture is vacuous`);
    const inventory = toolId ? { [toolId]: 1 } : {};

    const s = computeAccrual({
      userId: '00000000-0000-4000-8000-000000000001', slot: 0,
      nowMs: NOW_MS, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
      activeKind: 'gather', activeId: nodeId,
      capMs: 12 * 3600000, seed: SEED,
      hp: 60, maxHp: 60, gold: 0,
      skills: { ...GATHER_MAXED }, equipment: EQUIPMENT, inventory,
      autoEatEnabled: false, autoEatFood: null, autoEatPct: 0,
      toolCarry: {},
      items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX,
    });
    ok(s.accrued === true, `GATHER [${f.name}]: accrued nothing (reason: ${s.reason})`);
    if (!s.accrued) continue;

    const c = clientGatherSpan({
      skill, node, spanMs: SPAN_MS, rng: createRng(SEED),
      skills: { ...GATHER_MAXED }, inventory, equipment: EQUIPMENT, toolCarry: {},
    });

    const P = (m) => `GATHER PARITY [${f.name}]: ${m}`;
    eq(s.tickMs, c.intervalMs, P('the derived action interval differs from the client\'s'));
    eq(s.summary.ticks, c.ticks, P('action count differs'));
    eq(s.summary.paidMs, c.paidMs, P('the paid span differs'));
    eq(s.summary.items, c.items, P('yields differ'));
    eq(s.summary.xp, c.xp, P('XP grants differ'));
    eq(s.summary.gathered, c.stats.gathered || 0, P('the gathered counter differs'));
    eq(s.summary.toolDoubles, c.stats.toolDoubles || 0, P('tool double-yield differs'));
    eq(s.delta.tool_carry, roundedCarry(c.toolCarry), P('the fractional tool carry differs'));

    /* The journalled stats must agree with the simulation, or the Hero screen
       and the ledger tell two different stories. */
    const prog = Object.fromEntries((s.delta.progress || []).map((p) => [p.key, p.add]));
    const per = { woodcutting: 'chopped', mining: 'mined', fishing: 'fished' }[skill];
    eq(prog.gathered, c.stats.gathered, P('the journalled gather count differs from the simulated one'));
    eq(prog[per], c.stats[per], P(`the journalled ${per} count differs from the simulated one`));

    /* Determinism: same seed, same answer — that is what makes a grant
       auditable. And a DIFFERENT seed must NOT produce the same answer for a
       node with a real range, or the seed is being ignored. */
    const again = computeAccrual({
      userId: '00000000-0000-4000-8000-000000000001', slot: 0,
      nowMs: NOW_MS, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
      activeKind: 'gather', activeId: nodeId, capMs: 12 * 3600000, seed: SEED,
      hp: 60, maxHp: 60, gold: 0, skills: { ...GATHER_MAXED }, equipment: EQUIPMENT,
      inventory, autoEatEnabled: false, autoEatFood: null, autoEatPct: 0, toolCarry: {},
      items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX,
    });
    eq(again.summary.items, s.summary.items, P('the same seed produced a different yield'));
    if (node.qty[1] > node.qty[0]) {
      const other = computeAccrual({
        userId: '00000000-0000-4000-8000-000000000001', slot: 0,
        nowMs: NOW_MS, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
        activeKind: 'gather', activeId: nodeId, capMs: 12 * 3600000, seed: SEED + 1,
        hp: 60, maxHp: 60, gold: 0, skills: { ...GATHER_MAXED }, equipment: EQUIPMENT,
        inventory, autoEatEnabled: false, autoEatFood: null, autoEatPct: 0, toolCarry: {},
        items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX,
      });
      ok(JSON.stringify(other.summary.items) !== JSON.stringify(s.summary.items),
        P('a different seed produced an identical yield — the seed is not being used'));
      seen.draws++;
    }

    seen.ticks = Math.max(seen.ticks, s.summary.ticks);
    seen.doubles = Math.max(seen.doubles, s.summary.toolDoubles);
    seen.skills.add(skill);
    seen.speeds.add(s.tickMs);
  }

  /* COVERAGE. A parity suite whose fixtures all take the same trivial path
     proves parity of nothing. */
  ok(seen.ticks > 1000, `GATHER COVERAGE: the longest fixture ran only ${seen.ticks} actions`);
  ok(seen.draws > 0, 'GATHER COVERAGE: no fixture used a node with a qty RANGE, so the RNG never '
    + 'drew — rng.int(n,n) returns without drawing and the seed would be untested');
  ok(seen.doubles > 0, 'GATHER COVERAGE: no fixture earned a tool double, so the deterministic '
    + 'fractional carry — the whole reason an away replay is byte-identical — is untested');
  ok(seen.skills.size >= 3, `GATHER COVERAGE: only ${seen.skills.size} of the three gathering `
    + 'skills were exercised, so the per-skill stat routing is untested');
  ok(seen.speeds.size > 1, 'GATHER COVERAGE: every fixture ran at the same interval — the tool '
    + 'speed term is untested');
}

/* The engine rounds the stored carry to 9 decimals (see roundCarry in
   accrual.js). The reference has to do the same to be comparable, and doing it
   HERE rather than importing that function keeps the two constructions
   independent. */
function roundedCarry(carry) {
  const out = {};
  for (const k in (carry || {})) {
    const n = Number(carry[k]);
    if (Number.isFinite(n) && n > 0 && n < 1) out[k] = Math.floor(n * 1e9) / 1e9;
  }
  return out;
}

// ── 1d. THE BUFF TIMELINE (b347), now that the loop is core's ───────────────
// A `gather_speed` buff CHANGES THE INTERVAL, which is the number the action
// count is derived from — so a flat `floor(spanMs / interval)` loop pays the
// buffed rate for the whole night off a ten-minute consumable. Measured on the
// real engine before b347: 8h on Normal Tree with one 10-minute +4% buff paid
// 6,250 actions against an honest 6,005, and the buff came back reading 10:00
// with zero ms drained. Fifty times the earned value, by shutting the tab.
//
// The fix is the slice loop, and this is the assertion that it is still doing
// its job in core. Client-vs-client, because the SERVER holds no buffs (there
// is no buff column and no intent that writes one) — so the comparison that
// matters here is "buffed night vs honest night", not "server vs client".
function gatherBuffTimelineGuard() {
  const node = GATHER_INDEX.normal_tree.node;
  const SPAN = 8 * 3600000;
  const BUFF_MS = 10 * 60000;
  const run = (buffs) => {
    const state = {
      skillTargetId: 'normal_tree',
      skills: { ...GATHER_MAXED }, inventory: {}, equipment: {},
      toolCarry: {}, stats: {}, buffs,
    };
    const summary = simulateSkillSpan(state, {
      away: true, fromMs: 0, toMs: SPAN, rng: createRng(SEED),
      items: ITEMS, nodes: GATHER_INDEX,
      /* The client's getBonus chain, whose buff term reads the SAME queue this
         drains — one identity, not two copies. */
      bonus: (key) => buffBonusFor(state.buffs, key, { away: true }),
      fx: {},
    });
    return { summary, buffs: state.buffs, gathered: state.stats.gathered || 0 };
  };

  const honest = run([]);
  const buffed = run([{ type: 'gather_speed', magnitude: 4, remainingMs: BUFF_MS }]);
  /* THE FLAT LOOP the slicing replaces: one interval, derived once, for the
     whole night. This is what the number would have been. */
  const buffedInterval = Math.max(500, Math.floor(pacedActionMs(node.ms) * speedClamp(0.04)));
  const flat = Math.floor(SPAN / buffedInterval);

  ok(buffed.summary.ticks > honest.summary.ticks,
    `BUFF TIMELINE: a +4% gather_speed buff produced ${buffed.summary.ticks} actions against an `
    + `unbuffed ${honest.summary.ticks} — the buff paid nothing at all`);
  ok(buffed.summary.ticks < flat,
    `BUFF TIMELINE: a 10-minute buff paid ${buffed.summary.ticks} actions, which is the FLAT `
    + `whole-night buffed rate (${flat}). The span is not being sliced at the expiry.`);
  /* The honest arithmetic, stated: 10 minutes at the buffed rate, the rest at
     the base rate, with the sub-tick remainder carried across the boundary. */
  const expected = Math.floor(BUFF_MS / buffedInterval)
    + Math.floor(((BUFF_MS - Math.floor(BUFF_MS / buffedInterval) * buffedInterval)
      + (SPAN - BUFF_MS)) / Math.max(500, Math.floor(pacedActionMs(node.ms))));
  eq(buffed.summary.ticks, expected,
    `BUFF TIMELINE: the buffed night paid ${buffed.summary.ticks} actions; slicing at the expiry `
    + `and carrying the remainder gives ${expected}`);
  ok(buffed.summary.slices === 2,
    `BUFF TIMELINE: the span ran in ${buffed.summary.slices} slice(s) — one buff expiry inside the `
    + 'window must produce exactly two');
  /* AND IT DRAINED. Paying without draining is the b326 exploit written
     backwards, and it is the half that a payout test alone would never catch. */
  eq(buffed.buffs, [], 'BUFF TIMELINE: the buff survived an 8-hour night — it paid away and was '
    + 'never spent, which is the whole exploit');
  eq(buffed.summary.buffsExpired, ['gather_speed'],
    'BUFF TIMELINE: the summary did not STATE which buff ran out, so a welcome-back card would '
    + 'have to infer it');
  eq(buffed.summary.buffPaidMs, BUFF_MS,
    `BUFF TIMELINE: the summary claims ${buffed.summary.buffPaidMs} ms of buffed time against a `
    + `${BUFF_MS} ms buff`);
  /* THE CONTROL: with no buff held there is exactly ONE slice and the
     arithmetic is byte-identical to the flat loop this replaces. That
     equivalence is what keeps every pre-existing away number honest rather than
     re-baselined. */
  eq(honest.summary.ticks, Math.floor(SPAN / Math.max(500, Math.floor(pacedActionMs(node.ms)))),
    'BUFF TIMELINE CONTROL: an unbuffed night no longer equals the flat loop');
  ok(honest.summary.slices === 1,
    `BUFF TIMELINE CONTROL: an unbuffed night ran in ${honest.summary.slices} slices, not 1`);
}

// ── 1e. THE CARRY IS THE ONLY THING THAT NEEDS A COLUMN ─────────────────────
// `player_state.tool_carry` does not exist yet; the migration is staged
// (supabase/migrations/2026-08-15-tool-carry.sql). Until it is applied the
// engine is handed `toolCarry: null`, starts each span from an empty carry, and
// omits the delta key — because hr_apply refuses an unknown key and that
// refusal costs the player the whole night.
//
// This measures what that gap costs, so the number is a fact and not a claim,
// and asserts the two halves of the switch: null in ⇒ no key out; object in ⇒
// key out, and the carry actually continues across a span boundary.
function toolCarryContinuityGuard() {
  const skill = 'woodcutting';
  const nodeId = 'maple_tree';
  const toolId = bestOwnedTool(skill);
  const inventory = { [toolId]: 1 };
  const HALF = SPAN_MS / 2;
  const call = (over) => computeAccrual({
    userId: '00000000-0000-4000-8000-000000000001', slot: 0,
    nowMs: FROM_MS + HALF, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
    activeKind: 'gather', activeId: nodeId, capMs: 12 * 3600000, seed: SEED,
    hp: 60, maxHp: 60, gold: 0, skills: { ...GATHER_MAXED }, equipment: EQUIPMENT,
    inventory, autoEatEnabled: false, autoEatFood: null, autoEatPct: 0,
    items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX, ...over,
  });

  const noColumn = call({ toolCarry: null });
  ok(noColumn.accrued === true, 'CARRY: the no-column span did not accrue');
  ok(!('tool_carry' in noColumn.delta),
    'CARRY: the engine proposed a `tool_carry` key with no column to write it to. hr_apply answers '
    + 'unknown_delta_key with a 409, which costs the player the entire night — the null input is '
    + 'the switch and it is not being read');

  const withColumn = call({ toolCarry: {} });
  ok(withColumn.delta.tool_carry && typeof withColumn.delta.tool_carry === 'object',
    'CARRY: with the column present the engine wrote no carry back, so the next span restarts from '
    + 'zero and the column is decoration');
  eq(withColumn.summary.items, noColumn.summary.items,
    'CARRY: the FIRST span differs depending on whether the column exists — it must not; the carry '
    + 'starts empty either way and only the write-back differs');

  /* THE SECOND SPAN is where it shows. Same window, same seed, the only
     difference being whether a remainder was carried in. Swept across the whole
     range a carry can hold, because ONE sample is not a verdict: the difference
     is 0 or 1 depending on whether the carry pushes a payout across an integer
     boundary, and a guard that happened to sample a 0 would report "it costs
     nothing" forever. */
  const qtyOf = (r) => Object.values(r.summary.items).reduce((a, b) => a + b, 0);
  const restarted = qtyOf(call({ toolCarry: {} }));
  const losses = [];
  for (let i = 1; i <= 9; i++) {
    const lost = qtyOf(call({ toolCarry: { [skill]: i / 10 } })) - restarted;
    losses.push(lost);
    ok(lost >= 0 && lost <= 1,
      `CARRY: carrying ${i / 10} into the next span changed it by ${lost} units. It must be 0 or 1 `
      + '— the carry is a fraction of ONE item, so anything larger means it is being applied as a '
      + 'rate rather than as a remainder');
  }
  ok(Math.max(...losses) === 1,
    'CARRY: no carry value in [0.1 … 0.9] changed the following span at all, so this guard is '
    + 'measuring nothing — the carry is not being read as a starting remainder');
  /* ⚠ THE STORAGE ROUNDING MUST NOT BE A PAYOUT. `accrual.js roundCarry` stores
     9 decimals, so the column holds 0.76 where the simulation held
     0.7600000000000812 — and that is the ONLY difference between the two
     columns in the parity table above. The argument that it is harmless is that
     `advanceToolCarry` already floors with a 1e-9 epsilon, four orders of
     magnitude larger than the discarded tail. An argument is not a measurement,
     so here is the measurement: a span started from the rounded carry and the
     same span started from the raw one must produce the same yield, for every
     raw value the engine can actually emit. */
  {
    const raw = { woodcutting: 0.7600000000000812 };
    const rounded = { woodcutting: Math.round(raw.woodcutting * 1e9) / 1e9 };
    ok(rounded.woodcutting !== raw.woodcutting,
      'CARRY ROUNDING: the fixture is not actually rounding anything — the assertion below is vacuous');
    const a = qtyOf(call({ toolCarry: raw }));
    const b = qtyOf(call({ toolCarry: rounded }));
    ok(a === b,
      `CARRY ROUNDING: storing 9 decimals changed a span's yield (${a} vs ${b}). The rounding must `
      + 'sit strictly inside advanceToolCarry\'s 1e-9 payout epsilon; if it does not, it is not a '
      + 'storage detail, it is a balance change.');
    /* ⚠ THE TOP OF THE RANGE, and this assertion FOUND A REAL BUG rather than
       confirming a belief. The carry's range is the half-open [0,1), so
       0.9999999999 is legal — and `Math.round(0.9999999999 * 1e9) / 1e9` is
       **1**, which hr_apply refuses as `bad_tool_carry`. That code is not on
       index.ts's DEGRADABLE list, so it does not shorten the span, it 409s it:
       the engine would propose an impossible value and cost the player THE
       WHOLE NIGHT. `Math.floor` cannot leave the range by construction. Every
       raw carry >= 0.9999999995 was affected. */
    const edge = 1 - 1e-10;
    const stored = roundedCarry({ woodcutting: edge }).woodcutting;
    ok(stored < 1,
      `CARRY ROUNDING: a carry of ${edge} is stored as ${stored}, which is OUTSIDE the [0,1) range `
      + 'hr_apply enforces. The next accrual would be refused as bad_tool_carry — not degraded, '
      + 'REFUSED — and the player would lose the entire night. Floor, do not round.');
    ok(qtyOf(call({ toolCarry: { woodcutting: edge } }))
       === qtyOf(call({ toolCarry: { woodcutting: stored } })),
      'CARRY ROUNDING: a carry one epsilon under 1.0 pays differently stored than raw');
  }

  toolCarryContinuityGuard.report = [
    `tool_carry: losing the carry costs ${Math.min(...losses)}-${Math.max(...losses)} units on the `
    + `following span (${losses.filter((n) => n > 0).length} of 9 carry values in [0.1 … 0.9] `
    + `lose one). One span produced ${JSON.stringify(withColumn.delta.tool_carry)}.`];
}

// ── 2. HOSTILE INPUT ────────────────────────────────────────────────────────
function hostileGuard() {
  const honest = serverAccrual();
  if (!honest.accrued) { problems.push('hostile: baseline did not accrue'); return; }
  const fingerprint = (r) => JSON.stringify({
    ticks: r.summary?.ticks, kills: r.summary?.kills, xp: r.summary?.xp,
    gold: r.summary?.gold, items: r.summary?.items, grantMs: r.grantMs, tickMs: r.tickMs,
  });
  const base = fingerprint(honest);

  /* Every field a compromised or careless caller might try to smuggle in. The
     engine takes a NAMED object, so the proof is that adding these keys changes
     nothing at all. This is the mechanical form of "construct the ctx field by
     field — never spread a request body". */
  const attacks = {
    tickMs: 1,
    minTickMs: 1,
    interval_ms: 1,
    ticks: 43_200_000,
    atMs: 0,
    fromMs: 0,
    toMs: NOW_MS + 365 * 86400000,
    elapsedMs: 365 * 86400000,
    elapsed: 365 * 86400000,
    grantMs: 365 * 86400000,
    spanMs: 365 * 86400000,
    away: false,
    rateMult: 1000,
    capped: false,
    bonus: () => 10,
    rng: createRng(1),
    ctx: { tickMs: 1, minTickMs: 1 },
    delta: { gold: 1e12 },
    hearth_tokens: 1e9,
  };
  for (const [k, v] of Object.entries(attacks)) {
    const r = serverAccrual({ [k]: v });
    if (fingerprint(r) !== base) {
      problems.push(`HOSTILE: request field '${k}' changed the grant — it must be inert`);
    }
  }
  /* …and all of them at once, in case one is only inert in isolation. */
  const all = serverAccrual(attacks);
  if (fingerprint(all) !== base) problems.push('HOSTILE: the combined hostile payload changed the grant');

  // capMs: a caller-inflated cap can never buy more than the real elapsed time,
  // and can never exceed the engine's own absolute fuse.
  const bigCap = computeAccrual({
    nowMs: NOW_MS, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
    activeKind: 'combat', activeId: MONSTER, capMs: Number.MAX_SAFE_INTEGER,
    seed: SEED, hp: 60, maxHp: 60, skills: baseSkills(), equipment: EQUIPMENT,
    items: ITEMS, monsters: MONSTERS,
  });
  ok(bigCap.accrued && bigCap.grantMs === SPAN_MS,
    `HOSTILE: an unbounded capMs granted ${bigCap.grantMs}ms, expected the real elapsed ${SPAN_MS}ms`);

  const longAbsence = computeAccrual({
    nowMs: NOW_MS, accruedToMs: NOW_MS - 400 * 86400000, activeSinceMs: NOW_MS - 400 * 86400000,
    activeKind: 'combat', activeId: MONSTER, capMs: Number.MAX_SAFE_INTEGER,
    seed: SEED, hp: 60, maxHp: 60, skills: baseSkills(), equipment: EQUIPMENT,
    items: ITEMS, monsters: MONSTERS,
  });
  ok(longAbsence.grantMs <= ACCRUE_MAX_SPAN_MS,
    `HOSTILE: a 400-day absence with a broken cap granted ${longAbsence.grantMs}ms — the absolute fuse did not hold`);

  // The cap is real: an 18h absence at a 12h cap pays exactly 12h and reports it.
  const capped = computeAccrual({
    nowMs: NOW_MS, accruedToMs: NOW_MS - 18 * 3600000, activeSinceMs: NOW_MS - 18 * 3600000,
    activeKind: 'combat', activeId: MONSTER, capMs: 12 * 3600000,
    seed: SEED, hp: 60, maxHp: 60, skills: baseSkills(), equipment: EQUIPMENT,
    items: ITEMS, monsters: MONSTERS,
  });
  ok(capped.grantMs === 12 * 3600000, `CAP: 18h absence at a 12h cap granted ${capped.grantMs}ms`);
  ok(capped.capped === true, 'CAP: a capped grant did not report capped:true');
  ok(capped.delta.accrued_to === new Date(NOW_MS).toISOString(),
    'CAP: a capped grant must still advance the watermark to now — otherwise the cap is drainable in instalments');

  // active_since clamps too, so a stale watermark after a forgotten
  // `accrued_to` on start_activity cannot mint a night.
  const staleWatermark = computeAccrual({
    nowMs: NOW_MS, accruedToMs: NOW_MS - 11 * 3600000,
    activeSinceMs: NOW_MS - 30 * 60000,          // the fight started 30 minutes ago
    activeKind: 'combat', activeId: MONSTER, capMs: 12 * 3600000,
    seed: SEED, hp: 60, maxHp: 60, skills: baseSkills(), equipment: EQUIPMENT,
    items: ITEMS, monsters: MONSTERS,
  });
  ok(staleWatermark.grantMs === 30 * 60000,
    `WATERMARK: a stale accrued_to paid ${staleWatermark.grantMs}ms for a fight that is 30 minutes old`);

  // A clock that has not moved, or has moved backwards, grants nothing.
  for (const [name, over] of [
    ['no elapsed time', { accruedToMs: NOW_MS }],
    ['a future watermark', { accruedToMs: NOW_MS + 86400000 }],
    ['a sub-threshold absence', { accruedToMs: NOW_MS - (ACCRUE_MIN_MS - 1) }],
    ['a zero cap', { capMs: 0 }],
    ['a negative cap', { capMs: -1 }],
    ['a NaN cap', { capMs: NaN }],
    ['an idle character', { activeKind: 'idle', activeId: null }],
    ['a gathering character', { activeKind: 'gather', activeId: 'oak' }],
    ['an unknown monster', { activeId: 'not_a_monster' }],
  ]) {
    const r = serverAccrual(over);
    ok(r.accrued === false, `SKIP: ${name} produced a grant (${JSON.stringify(r.grantMs)})`);
    ok(!r.delta, `SKIP: ${name} produced a delta`);
  }

  // tickMs is derived from equipment and floored. Prove BOTH: that gear moves
  // it (so it is not a constant) and that it can never go under the floor.
  const noGear = deriveTickMs({}, ITEMS);
  ok(noGear === COMBAT_BALANCE.tickMs, `TICK: an unarmed player should swing at ${COMBAT_BALANCE.tickMs}ms, got ${noGear}`);
  const hammer = Object.keys(ITEMS).find((id) => ITEMS[id]?.weaponType === 'hammer');
  if (hammer) {
    ok(deriveTickMs({ weapon: hammer }, ITEMS) > noGear,
      'TICK: a hammer must swing SLOWER than bare hands — the weapon-family speed identity is not applied');
  }
  for (const bogus of [{ weapon: '__nope__' }, null, undefined, { weapon: null }]) {
    const t = deriveTickMs(bogus, ITEMS);
    ok(t >= COMBAT_BALANCE.minTickMs, `TICK: bogus equipment ${JSON.stringify(bogus)} produced ${t}ms, below the ${COMBAT_BALANCE.minTickMs}ms floor`);
  }
  /* b329 (Xarn): the chosen STYLE now carries a speed cost, and the server has
     to spend it too — otherwise a Longrange player earns Rapid's tick budget
     overnight, which is the away/live divergence class this whole program
     exists to end. Also pins the direction: a style may only ever be SLOWER,
     because tickMs is a divisor of elapsed time on this path. */
  const bow = Object.keys(ITEMS).find((id) => ITEMS[id]?.weaponType === 'ranged');
  if (bow) {
    const R = COMBAT_STYLES.ranged;
    const fast = deriveTickMs({ weapon: bow }, ITEMS, R.rapid);
    const slow = deriveTickMs({ weapon: bow }, ITEMS, R.longrange);
    ok(deriveTickMs({ weapon: bow }, ITEMS) === fast,
      'TICK: no style must derive the same interval as the baseline style');
    ok(slow > fast,
      `TICK: Longrange must swing slower than Rapid on the SERVER too — got ${slow}ms vs ${fast}ms`);
    ok(deriveTickMs({ weapon: bow }, ITEMS, { speedMod: 0.01 }) === fast,
      'TICK: a sub-1 speedMod must clamp to the baseline — a style can never shrink the away tick divisor');
  }
  ok(zeroBonus('goldFind') === 0 && zeroBonus('dropRate') === 0 && zeroBonus('allXP') === 0,
    'BONUS: the server perk stack is not inert');
}

// ── 3. SHAPE + SOURCE ───────────────────────────────────────────────────────
// hr_apply's delta contract, asserted against the same list the SQL enforces.
const DELTA_KEYS = ['gold', 'gems', 'hp', 'items', 'xp', 'equip', 'activity',
                    'accrued_to', 'farm', 'progress', 'progress_claim', 'journal'];

async function shapeGuard() {
  const s = serverAccrual();
  if (!s.accrued) { problems.push('shape: baseline did not accrue'); return; }

  for (const k of Object.keys(s.delta)) {
    ok(DELTA_KEYS.includes(k),
      `SHAPE: delta key '${k}' is not in hr_apply's contract — unknown keys are REJECTED, not ignored`);
  }
  ok(!('hearth_tokens' in s.delta), 'SHAPE: the bond must never appear in a delta');
  ok(!('gems' in s.delta), 'SHAPE: accrual must not touch gems');
  ok(!('equip' in s.delta), 'SHAPE: accrual must not move equipment');

  const ints = [];
  if (s.delta.gold !== undefined) ints.push(['gold', s.delta.gold]);
  if (s.delta.hp !== undefined) ints.push(['hp', s.delta.hp]);
  for (const [k, v] of Object.entries(s.delta.xp || {})) ints.push([`xp.${k}`, v]);
  for (const [k, v] of Object.entries(s.delta.items || {})) ints.push([`items.${k}`, v]);
  for (const p of s.delta.progress || []) ints.push([`progress.${p.key}`, p.add]);
  for (const [k, v] of ints) {
    ok(Number.isInteger(v) && Number.isFinite(v),
      `SHAPE: ${k} = ${v} is not an integer — hr_apply casts with ::bigint and would return bad_delta`);
    /* `items` is the ONE signed map — auto-eat debits the food it consumed, and
       hr_apply's item block is signed for exactly this (it re-reads the row
       under a lock and rejects `have + delta < 0`). Everything else stays
       non-negative: a negative `gold` or `xp` from an accrual would make a
       rollback indistinguishable from an exploit. */
    ok(v >= 0 || k.startsWith('items.'), `SHAPE: ${k} = ${v} is negative`);
  }

  /* THE SIGNED-DELTA INVARIANT, on a run that actually eats. A debit deeper
     than the starting stack is answered by hr_apply with `insufficient_item`,
     which is NOT on index.ts's DEGRADABLE list — so it does not shorten the
     span, it 409s the whole night with the watermark unmoved. The engine has to
     be structurally incapable of proposing one. */
  const FOOD = Object.keys(ITEMS)
    .filter((id) => ITEMS[id] && ITEMS[id].foodClass === 'healing' && ITEMS[id].heals > 0)
    .sort((a, b) => ITEMS[b].heals - ITEMS[a].heals)[0];
  for (const stock of [1, 2, 7, 40, 5000]) {
    const e = serverAccrual({
      inventory: { [FOOD]: stock },
      autoEatEnabled: true, autoEatFood: FOOD, autoEatPct: 50,
    });
    if (!e.accrued) continue;
    const net = (e.delta.items || {})[FOOD];
    if (net === undefined) continue;
    ok(Number.isInteger(net), `SHAPE: the ${FOOD} delta ${net} is not an integer`);
    ok(stock + net >= 0,
      `SHAPE: with ${stock} ${FOOD} in the bag the engine proposed a net ${net} — `
      + 'the resulting quantity is negative, which hr_apply rejects as insufficient_item and '
      + 'index.ts does NOT degrade, costing the player the entire absence');
    ok(e.foodEaten <= stock + Object.values(e.summary.items || {}).length * 0,
      `SHAPE: ate ${e.foodEaten} meals from a stack of ${stock}`);
  }
  ok(s.delta.xp === undefined || Object.values(s.delta.xp).every((v) => v > 0),
    'SHAPE: XP is monotonic — a zero or negative grant must be omitted');

  for (const it of Object.keys(s.delta.items || {})) {
    ok(!!ITEMS[it], `SHAPE: item '${it}' is not in the authored catalogue — hr_apply would reject the WHOLE delta`);
  }
  for (const p of s.delta.progress || []) {
    ok(['quest', 'daily', 'bounty', 'stat', 'collection', 'flag'].includes(p.kind),
      `SHAPE: progress kind '${p.kind}' is not one hr_apply accepts`);
    ok(['active', 'done'].includes(p.state),
      `SHAPE: progress state '${p.state}' is not settable by a delta ('claimed' has its own path)`);
  }
  ok(s.delta.journal?.kind === 'combat' && s.delta.journal?.intent === 'accrue',
    'SHAPE: the journal row must name kind=combat / intent=accrue');
  ok(typeof s.delta.journal?.meta === 'object'
     && Object.keys(s.delta.journal.meta).length <= 8,
    'SHAPE: the journal meta must be an aggregate, not a per-kill log (game_events: 1.6M rows from six players)');
  ok(typeof s.delta.accrued_to === 'string' && !Number.isNaN(Date.parse(s.delta.accrued_to)),
    'SHAPE: accrued_to must be an ISO timestamp');

  // ── Source-level rules that no runtime test can see ──────────────────────
  const engine = await readFile(join(FN_DIR, 'accrual.js'), 'utf8');
  const shell = await readFile(join(FN_DIR, 'index.ts'), 'utf8');
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const engineCode = code(engine);
  const shellCode = code(shell);

  ok(!/\.\.\.\s*(inp|input|req|body|opts|ctx)\b/.test(engineCode),
    'SOURCE: accrual.js spreads a caller object — minTickMs would ride in through the same door as tickMs');
  /* Reading COMBAT_BALANCE.minTickMs is correct (it IS the floor); ASSIGNING
     `minTickMs:` into a ctx is the opt-in that would defeat the clamp. Match
     the assignment, not the identifier. */
  ok(!/\bminTickMs\s*:/.test(engineCode),
    'SOURCE: accrual.js sets minTickMs in a ctx — the accrual path must use the real 600ms floor');
  /* b329: the floor moved INTO `swingIntervalMs` (src/core/combat.js) when the
     hand-copied interval expression here was replaced by a call to the one the
     client uses. The grep follows it: the requirement is still "the derived tick
     is floored", it is just no longer floored by a second copy of the clamp.
     Either shape satisfies this — what must never happen is deriveTickMs
     open-coding an interval with no floor at all. The NUMERIC proof that the
     floor holds is the bogus-equipment loop above; this is the shape guard. */
  ok(/COMBAT_BALANCE\.minTickMs/.test(engineCode) || /swingIntervalMs\s*\(/.test(engineCode),
    'SOURCE: accrual.js must floor the derived tick — via core swingIntervalMs() or COMBAT_BALANCE.minTickMs');
  ok(!/\bMath\s*\.\s*random\s*\(/.test(engineCode) && !/\bMath\s*\.\s*random\s*\(/.test(shellCode),
    'SOURCE: Math.random() is banned server-side — accrual must be replayable');
  ok(!/\bDate\s*\.\s*now\s*\(\)/.test(engineCode),
    'SOURCE: accrual.js reads a wall clock — atMs must come from now() in Postgres');
  ok(/service_role/.test(shellCode) === false,
    'SOURCE: index.ts references the service role — it bypasses RLS and holds every table privilege (defect S1)');
  ok(!/:5432\b/.test(shellCode),
    'SOURCE: index.ts names port 5432 — all engine traffic uses the transaction pooler on 6543 (design §2a-ii, HARD RULE)');
  ok(/set local role hr_engine/.test(shellCode),
    'SOURCE: index.ts must `set local role hr_engine` inside every transaction — transaction mode keeps no session state');
  ok(/prepare:\s*false/.test(shellCode),
    'SOURCE: index.ts must set prepare:false — named prepared statements do not survive transaction-mode pooling');
  for (const table of ['player_state', 'player_inventory', 'player_skills', 'player_ledger', 'player_progress']) {
    ok(!new RegExp(`(insert|update|delete)[\\s\\S]{0,40}${table}`, 'i').test(shellCode),
      `SOURCE: index.ts appears to write ${table} directly — Edge Functions never write tables`);
  }
  ok(/hr_apply\(/.test(shellCode), 'SOURCE: index.ts must go through hr_apply');
  ok(/hr_offline_cap_ms\(/.test(shellCode), 'SOURCE: the cap must be read from Postgres, not computed in the engine');
  ok(/hr_seed\(/.test(shellCode), 'SOURCE: the PRNG seed must come from hr_seed (server secret), never from visible values');
}

// ── 4. THE SHELL — THE SURFACE AN ATTACKER ACTUALLY TOUCHES ────────────────
// Section 2 proves hostile keys are inert ON THE ENGINE'S INPUT OBJECT. Nobody
// hands the engine an object: an attacker hands an HTTP BODY to index.ts. That
// surface had no executable test, because index.ts is Deno TypeScript and
// cannot be imported into Node — so the body reader now lives in request.js,
// which is pure ESM, and this section runs the exact function the shell calls.
function requestGuard() {
  /* Every shape a body can take. The assertion is the same for all of them: the
     result has exactly the CONTRACT's keys — read from the module, never
     restated here, so a field being ADDED shows up as a diff rather than
     sliding past a hard-coded list — and every one of them is inert.

     b345: the contract grew from `{slot}` to `{slot, verb, intentId, activity}`
     when the shell gained verb dispatch. The bound is unchanged in kind: every
     one of the four is a NAME or a SELECTOR, none is a value any progression
     number is computed from. tests/activity-intent.mjs A12 drives the same
     function with intent-shaped hostile bodies (uuid smuggling, SQL in an
     activity id, a poisoned verb); this section keeps the original corpus. */
  const bodies = [
    null, undefined, 0, 1, '', 'slot', '{"slot":3}', true, [], [3], [{ slot: 3 }],
    {}, { slot: 3 }, { slot: '3' }, { slot: 3.5 }, { slot: -1 }, { slot: 6 },
    { slot: 1e9 }, { slot: NaN }, { slot: Infinity }, { slot: null }, { slot: {} },
    { slot: [3] }, { slot: '3abc' }, { slot: ' 3 ' }, { slot: '0x3' }, { slot: 1n },
    { slot: 2, capMs: 999999999, tickMs: 1, gold: 1e12, userId: 'someone-else' },
    { slot: 2, __proto__: { slot: 5 } },
    JSON.parse('{"__proto__":{"slot":5},"slot":1}'),
    JSON.parse('{"constructor":{"prototype":{"slot":5}}}'),
    { get slot() { throw new Error('a getter that fires is a getter that ran'); } },
    { toJSON: () => ({ slot: 5 }) },
    Object.create({ slot: 5 }),                       // slot on the PROTOTYPE only
  ];
  for (const b of bodies) {
    let r;
    try { r = parseIntent(b); }
    catch (e) {
      /* A getter is allowed to throw — what matters is that the shell never
         reaches a state where a thrown getter has already influenced a number.
         parseIntent reading `body.slot` once is the whole exposure. */
      ok(String(e?.message || '').includes('getter'),
        `REQUEST: parseIntent threw on ${JSON.stringify(String(b))}: ${e?.message}`);
      continue;
    }
    const keys = Object.keys(r).sort().join(',');
    ok(keys === [...INTENT_KEYS].sort().join(','),
      `REQUEST: parseIntent returned keys [${keys}] for a hostile body — the contract is [${INTENT_KEYS}]`);
    ok(Number.isInteger(r.slot) && r.slot >= 0 && r.slot <= MAX_SLOT,
      `REQUEST: parseIntent produced slot=${String(r.slot)} — outside [0, ${MAX_SLOT}]`);
    /* The three fields b345 added, on the SAME hostile corpus. None of these
       bodies names a verb, a key or an activity, so every one of them must come
       back inert — a hostile body that produced a usable intent id or a settable
       activity would be authoring an intent, not describing one. */
    ok(r.verb === 'accrue',
      `REQUEST: a body that names no verb produced verb='${String(r.verb)}' — it must default to accrue`);
    ok(r.intentId === null,
      `REQUEST: a body that carries no key produced intentId='${String(r.intentId)}'`);
    ok(r.activity === null || (r.activity.kind === null && r.activity.id === null),
      `REQUEST: a body that declares no activity produced ${JSON.stringify(r.activity)}`);
    ok(Object.getPrototypeOf(r) === null,
      'REQUEST: parseIntent returned an object with a prototype — it must be null-prototype');
    if (r.activity) {
      ok(Object.getPrototypeOf(r.activity) === null,
        'REQUEST: the activity sub-object has a prototype — it must be null-prototype too');
    }
  }
  /* The prototype was never polluted along the way. */
  ok(({}).slot === undefined, 'REQUEST: Object.prototype.slot was polluted by a hostile body');
  /* The legal values survive, so the guard is not just "always 0". */
  for (let s = 0; s <= MAX_SLOT; s++) {
    ok(readSlot({ slot: s }) === s, `REQUEST: a legitimate slot ${s} was coerced to ${readSlot({ slot: s })}`);
  }
  ok(readSlot({ slot: MAX_SLOT + 1 }) === 0, 'REQUEST: a slot past the bound was not clamped');
}

/* Source-level rules about the SHELL. `shapeGuard` used to assert things about
   accrual.js and call that a proof about the request path; these are the ones
   that are actually about the request path. */
async function shellGuard() {
  const shell = await readFile(join(FN_DIR, 'index.ts'), 'utf8');
  const code = shell.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  // (a) NOTHING request-shaped is ever spread. This is the rule that keeps
  //     `minTickMs` from riding in through the same door as `tickMs`.
  ok(!/\.\.\.\s*(body|payload|req|request|json|intent|input|params|query)\b/.test(code),
    'SHELL: index.ts spreads a request-derived object — the ctx must be built field by field');

  // (b) The body is read ONCE, and the value goes straight into the one function
  //     that is allowed to interpret it. No intermediate binding means there is
  //     no identifier for a later edit to reach for.
  const jsonCalls = (code.match(/req\s*\.\s*json\s*\(/g) || []).length;
  ok(jsonCalls === 1, `SHELL: req.json() is called ${jsonCalls} times — the body must be read exactly once`);
  ok(/parseIntent\(\s*await\s+req\.json\(\)[\s\S]{0,40}?\)/.test(code),
    'SHELL: the req.json() result is not piped directly into parseIntent — that binding is the attack surface');
  const parseCalls = (code.match(/parseIntent\s*\(/g) || []).length;
  ok(parseCalls === 1, `SHELL: parseIntent is called ${parseCalls} times — one body, one reader`);

  // (c) The engine call site names only server values. Extract the literal by
  //     brace matching and check every identifier in it.
  const at = code.indexOf('computeAccrual({');
  ok(at >= 0, 'SHELL: index.ts does not call computeAccrual({ … }) with an object literal');
  if (at >= 0) {
    let depth = 0; let end = at;
    for (let i = code.indexOf('{', at); i < code.length; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const lit = code.slice(at, end + 1);
    for (const bad of ['body', 'req.', 'request', 'payload', 'intent.', 'params', 'headers']) {
      ok(!lit.includes(bad),
        `SHELL: the computeAccrual literal references '${bad}' — the only request-derived value permitted is slot`);
    }
    ok(/\bslot\b/.test(lit), 'SHELL: the computeAccrual literal does not pass slot at all');
    ok(!/\.\.\./.test(lit), 'SHELL: the computeAccrual literal contains a spread');
  }

  // (d) IDENTITY IS VERIFIED, NOT DECODED (review D2).
  ok(/verifyJwt\(/.test(code),
    'SHELL: index.ts does not call verifyJwt — a decoded JWT is not a verified one');
  ok(!/JSON\.parse\(\s*atob\(/.test(code),
    'SHELL: index.ts decodes a JWT by hand — that is the D2 defect, use jwt.js');

  // (e) THE RATE GATE PRECEDES THE EXPENSIVE READ (review D3).
  const gateAt = code.indexOf('hr_rate_gate(');
  const stateAt = code.indexOf('hr_state_of(');
  ok(gateAt >= 0, 'SHELL: index.ts does not call hr_rate_gate — the non-accruing path would be free to loop');
  ok(gateAt >= 0 && stateAt >= 0 && gateAt < stateAt,
    'SHELL: hr_rate_gate is called AFTER hr_state_of — a rejected call must consume budget BEFORE it costs a read');
  ok(!/hr_rate_ok\(/.test(code),
    'SHELL: index.ts calls hr_rate_ok directly — its signature takes the LIMIT as an argument, so the engine would name its own rate limit');

  // (f) The replay path must not fabricate a receipt (review S7).
  ok(/replayed\s*===\s*true/.test(code),
    'SHELL: index.ts does not branch on res.replayed — a replay would return an `away` block for a delta that was not applied');
  const replayAt = code.indexOf('replayed === true');
  const awayAt = code.indexOf('away: {');
  ok(replayAt >= 0 && awayAt >= 0 && replayAt < awayAt,
    'SHELL: the replay branch does not precede the away block');

  // (g) The slot bound must agree with the DATABASE, not with a comment. The
  //     previous shell documented "0…4" while the code and the CHECK both said
  //     0..5; a comment that disagrees with a constraint is a trap.
  const ps = await readFile(join(ROOT, 'supabase', 'migrations', '2026-08-11-player-state.sql'), 'utf8');
  const m = ps.match(/slot\s+int\s+not null default 0 check \(slot between (\d+) and (\d+)\)/);
  ok(!!m, 'SHELL: could not find the player_state slot CHECK to compare MAX_SLOT against');
  if (m) {
    ok(Number(m[2]) === MAX_SLOT,
      `SHELL: request.js MAX_SLOT is ${MAX_SLOT} but player_state allows 0..${m[2]}`);
  }
  ok(!/0…4|0\.\.4\b/.test(shell), 'SHELL: index.ts still documents the slot bound as 0…4');

  /* (h) THE SHELL MUST ACTUALLY PASS THE AUTO-EAT STATE. The engine reads four
     named fields; if index.ts stops sending them the engine silently falls back
     to "auto-eat off" and the whole night regresses to the -63%..-99% measured
     before this shipped — with every parity test still green, because
     accrual-engine.mjs calls computeAccrual directly and never goes through the
     shell. That gap is exactly how the handler came to be missing in the first
     place, so it gets a source assertion. */
  for (const field of ['inventory:', 'autoEatEnabled:', 'autoEatFood:', 'autoEatPct:']) {
    ok(code.includes(field),
      `SHELL: index.ts does not pass '${field.replace(':', '')}' to computeAccrual — the server would `
      + 'stop eating and every away night would end at the first death, silently');
  }
  ok(/auto_eat_enabled/.test(code) && /auto_eat_pct/.test(code) && /auto_eat_food/.test(code),
    'SHELL: index.ts no longer reads the auto_eat_* columns off hr_state_of');

  /* (i) THE SAME RULE FOR GATHERING, and it has the same silent shape. Drop
     `nodes:` and every gathering night answers `unknown_node` — a REFUSING
     reason, so the time is deferred rather than confiscated, but the player
     accrues nothing from gathering ever again and no test here notices, because
     accrual-engine.mjs calls computeAccrual directly and never goes through the
     shell. Drop `toolCarry:` and the carry silently restarts from zero every
     span. Both are one-line omissions with no exception and no log. */
  for (const field of ['nodes:', 'toolCarry:']) {
    ok(code.includes(field),
      `SHELL: index.ts does not pass '${field.replace(':', '')}' to computeAccrual — gathering would `
      + 'silently stop paying (nodes) or silently lose its deterministic carry (toolCarry)');
  }
  ok(/tool_carry/.test(code),
    'SHELL: index.ts no longer reads tool_carry off hr_state_of — the null branch would be permanent '
    + 'and applying the migration would change nothing');
}

// ── 4b. CROSS-FILE CONSTANTS ────────────────────────────────────────────────
// Two numbers are written in a JS file AND in a SQL file, and neither language
// can import the other. That is a drift generator, so it gets a guard rather
// than a comment — the same technique clampGuard uses for the hr_apply clamps.
async function autoEatDriftGuard() {
  const sql = await readFile(join(ROOT, 'supabase', 'migrations', '2026-08-15-auto-eat.sql'), 'utf8');

  /* (a) hr_set_auto_eat refuses a settings change with more than ACCRUE_MIN_MS
     of unpaid absence (`collect_first`), because auto-eat prices the WHOLE
     window and changing it mid-absence is the S5 equipment lever in a new
     dimension. Below ACCRUE_MIN_MS the engine writes nothing, so there is no
     span to over-pay and refusing would just be rude. If the two numbers ever
     drift apart there is a window that is either refused for nothing or open
     for something. */
  const grace = sql.match(/c_collect_grace\s+constant\s+interval\s*:=\s*interval\s*'(\d+)\s*seconds?'/);
  ok(!!grace, 'DRIFT: could not read c_collect_grace out of 2026-08-15-auto-eat.sql — the guard is vacuous');
  if (grace) {
    ok(Number(grace[1]) * 1000 === ACCRUE_MIN_MS,
      `DRIFT: hr_set_auto_eat's collect_first grace is ${grace[1]}s but ACCRUE_MIN_MS is ${ACCRUE_MIN_MS}ms. `
      + 'Below the engine floor nothing is written, so a LONGER grace lets a settings change price an '
      + 'absence the engine will pay, and a SHORTER one refuses a change that could never have been abused.');
  }

  /* (b) THE ADVISORY LOCK KEY. hr_set_auto_eat has to serialise against a
     concurrent hr_apply on the same character, and a lock taken on a DIFFERENT
     key is not a lock — it is a syscall and a false sense of safety. Compared
     textually against the expression apply-engine.sql actually uses. */
  const engine = await readFile(join(ROOT, 'supabase', 'migrations', '2026-08-11-apply-engine.sql'), 'utf8');
  const keyOf = (src) => {
    const m = src.match(/pg_advisory_xact_lock\(\s*hashtextextended\(([^;]*?)\)\s*\)/);
    return m ? m[1].replace(/v_uid|p_user/g, 'U').replace(/v_slot|p_slot/g, 'S').replace(/\s+/g, '') : null;
  };
  const kEngine = keyOf(engine);
  const kAutoEat = keyOf(sql);
  ok(!!kEngine && !!kAutoEat, 'DRIFT: could not read an advisory lock key out of both migrations');
  if (kEngine && kAutoEat) {
    ok(kEngine === kAutoEat,
      `DRIFT: hr_set_auto_eat locks on \`${kAutoEat}\` but hr_apply locks on \`${kEngine}\`. `
      + 'Two different keys serialise nothing, so a settings change and an accrual can interleave.');
  }

  /* (c) The column default and the engine's fail-closed read must agree that
     auto-eat is OFF until somebody with the trait switches it on. */
  ok(/auto_eat_enabled boolean not null default false/.test(sql),
    'DRIFT: auto_eat_enabled no longer defaults to false in the migration');
  const eng = await readFile(join(FN_DIR, 'accrual.js'), 'utf8');
  ok(/inp\.autoEatEnabled === true/.test(eng),
    'DRIFT: accrual.js no longer requires autoEatEnabled to be strictly true — a truthy string or a '
    + '1 from a jsonb round trip would switch on a purchased trait');
}

// ── 5. CLAMP HEADROOM ───────────────────────────────────────────────────────
// hr_apply's clamps are a BLAST RADIUS, not balance — but a clamp rejection
// rolls back, watermark included, so before the degrade ladder in index.ts a
// single trip bricked a character's accrual permanently. The ladder makes that
// recoverable; this guard makes it unlikely, by failing the BUILD when honest
// play gets within 60% of any clamp.
//
// The clamps are read out of the migration, never restated here: a second copy
// of a number is a drift generator, which is the failure this whole program is
// organised around.
const HEADROOM = 0.60;

/* ⚠ THE XP DIMENSION HAS ITS OWN LINE, AND IT IS AN ARGUED EXCEPTION RATHER
   THAN A RELAXATION. (Security ruling 2026-08-16, "artisan flip re-review".)

   Every other clamp in the table can be RAISED if honest play approaches it —
   that is what the 60% line is for, and what the failure message tells you to
   do. `c_max_xp_delta` cannot: xpForLevel(99) is 13,034,431, the clamp is
   12,000,000, and the single property it still buys is that ONE apply cannot
   carry a skill from 0 to the cap. There is no headroom to grant, only 1.03M
   of theoretical room that the `< xpForLevel(99)` assertion above already
   claims. So "keep honest play under 60% of it" is not an instruction anybody
   could follow — the only lever left is the YIELD, which belongs to the Game
   Designer.

   The line is therefore set where it means something the engine CAN honour:
   honest play must not EXCEED the clamp. At 95% the guard still fails before a
   real player trips it, the degrade ladder covers the last 5%, and the failure
   message points at the yield instead of at a constant that cannot move.

   It is a SEPARATE named constant rather than a bump to HEADROOM because the
   two say different things, and folding them would quietly move five other
   dimensions' fuses at the same time. */
const XP_HEADROOM = 0.95;

/* ── THE SPAN THE BLOCKING ARM SWEEPS AT (Security ruling 2026-08-16) ───────
   `hr_offline_cap_ms` is 12h base, +1h at clan level 4, +2h more at clan level
   7 — a hard maximum of 15h — against its own `c_ceiling_ms` of 24h, which is
   a FUSE and not a reachable cap ("the largest cap any legal combination of
   sources could ever produce … so it can never clip an honest player").

   Sweeping the blocking assertion at 24h therefore fails the build on a span no
   character in production can have. That is not conservatism, it is a false
   red: it makes the guard something to be argued with rather than something to
   be believed, which is how a real one eventually gets relaxed.

   So the BLOCKING arm sweeps the reachable cap and the 24h numbers stay, as a
   NON-BLOCKING FORECAST line printed on every run — because the cap is a number
   somebody will raise (the clan ladder already moves it), and the day it
   becomes reachable the figure is already on the screen rather than discovered
   by a player. `2026-08-16-day-budget-artisan.sql` records the specific
   trigger: above ~17h, forge_slagheart_platebody crosses c_max_xp_delta and the
   resolution has to be a yield change.

   DERIVED from the migration, never typed here: a cap raise moves this in the
   same commit that moves the cap, which is the whole reason the clamps
   themselves are parsed rather than restated. */
const REACHABLE_CAP_H = reachableCapHours();
const FORECAST_CAP_H = 24;

/* ── THE AMMUNITION LANE: AMNESTY REMOVED (b374, Game Designer) ─────────────
   The seven `fletch_*` rows once produced 500-1,000 arrows per craft, so a full
   15-hour offline auto-fletch minted 4-7.7 MILLION units of one item — over
   `c_max_item_delta` (1,000,000) — and lived on this enumerated amnesty while
   the degrade ladder paid ~1/8 of the night. That was always property (3)'s
   "stale exception waiting to be removed": the real defect was the YIELD, and
   the yield was the Game Designer's.

   b374 cut every fletch batch to `outputQty` 50 (Tyler, twice: "500 seems like
   way too much for 1 craft"). At 50 the worst rung (bronze, ms 3200) moves
   ~527,300 units on a 15h offline fletch — under the 60% honest-play line the
   rest of this guard enforces — so the rows no longer overflow and the amnesty
   is EMPTY. Property (1) now catches any fletch row (or any new recipe) that
   crosses the clamp exactly like every other artisan recipe; the ratchet (2)
   and stale-report (3) have nothing to hold, which is the intended end state.

   If a future ammo rung is deliberately sized over the clamp again, re-populate
   this table with its MEASURED maximum single-item movement at the reachable
   cap AND take it to Security — do not raise HEADROOM to hide it. */
const AMMO_CLAMP_BASELINE = Object.freeze({});

/* THE HONEST MAXIMUM IS A CHARACTER THAT DOES NOT DIE, AND `hp: 9999` IS NOT
   ONE. Until 2026-08-15 both headroom sweeps below used `hp/maxHp = 9999` with
   no auto-eat as a "never dies" proxy. It is not: it is a "dies after 9999
   damage" proxy, and a 24h absence is ~37,000 ticks, so against anything that
   lands a hit the fixture died partway through and the sweep measured a
   FRACTION of an absence while claiming to measure the maximum.

   Measured the difference, on the same monsters and the same seed:

     fixture                                  max per-skill XP   max gold
     hp 9999, no auto-eat  (the old proxy)         2,830,315      535,191
     hp 99, auto-eat ON    (a real maxed player)   3,445,997    1,228,312

   — 1.22x the XP and 2.30x the gold. The old fixture understated the honest
   maximum, which is the direction that makes a headroom guard useless: it
   reports slack that does not exist.

   So the sweeps now run the way a real maxed player actually plays: 99 max HP,
   auto-eat on, a deep stack of the best Provision. That IS the honest ceiling
   now that the server can eat, and it is what a clamp has to sit above. */
const HONEST_MAX_HP = 99;
const HONEST_FOOD = Object.keys(ITEMS)
  .filter((id) => ITEMS[id] && ITEMS[id].foodClass === 'healing' && ITEMS[id].heals > 0)
  .sort((a, b) => ITEMS[b].heals - ITEMS[a].heals)[0];
/* Deep enough that the stack is never the limit — the guard must measure what
   the SIMULATION can produce, not what a shopping trip can sustain. */
const HONEST_FOOD_QTY = 200000;
const HONEST_SUSTAIN = {
  hp: HONEST_MAX_HP, maxHp: HONEST_MAX_HP,
  inventory: { [HONEST_FOOD]: HONEST_FOOD_QTY },
  autoEatEnabled: true, autoEatFood: HONEST_FOOD, autoEatPct: 50,
};

/* ── THE GATHERING SWEEP, so the clamp reports cover the OTHER payable kind ──
   Every gathering node in the catalogue, at maxed skills, holding the best tool
   for that node's skill (which is the honest ceiling: tool speed shortens the
   interval, so it MULTIPLIES the action count, and tool double adds to every
   yield). A guard whose envelope stops at combat would report comfortable
   headroom the day gathering became payable and keep reporting it. */
function gatherSweep(spanH, seed = SEED) {
  const out = [];
  for (const nodeId of Object.keys(GATHER_INDEX)) {
    const skill = GATHER_INDEX[nodeId].skill;
    const toolId = bestOwnedTool(skill);
    const r = computeAccrual({
      userId: '00000000-0000-4000-8000-000000000001', slot: 0,
      nowMs: NOW_MS, accruedToMs: NOW_MS - spanH * 3600000,
      activeSinceMs: NOW_MS - spanH * 3600000,
      activeKind: 'gather', activeId: nodeId, capMs: spanH * 3600000, seed,
      hp: HONEST_MAX_HP, maxHp: HONEST_MAX_HP, gold: 0,
      skills: { ...MAXED, ...GATHER_MAXED }, equipment: EQUIPMENT,
      inventory: toolId ? { [toolId]: 1 } : {},
      autoEatEnabled: false, autoEatFood: null, autoEatPct: 0,
      toolCarry: {},
      items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX,
    });
    if (r.accrued) out.push([`${spanH}h ${nodeId}`, r.delta]);
  }
  return out;
}

/* ── THE ARTISAN SWEEP (b356, Security C1) ──────────────────────────────────
   Every one of the 290 recipes, at a given span, with UNLIMITED supply — which
   is the honest worst case for a clamp: the bag is the only other bound, and a
   player who left a full bank is not doing anything wrong.
   Measured exposure at the time of writing: 0 of 290 reach c_max_xp_delta on a
   plain 12h span with no perks, 10 of 290 at 24h. That is why this sweep had to
   exist — the ladder is REACHED by honest play on this path, and nothing here
   looked at artisan at all before b356.
   Blocked benches are skipped rather than silently paying 0: they are refused
   by the engine, and a refusal contributes no delta to bound. */
function artisanSweep(spanH, seed = SEED) {
  const out = [];
  for (const id of Object.keys(ARTISAN_INDEX)) {
    const entry = ARTISAN_INDEX[id];
    if (!benchPayable(entry.skill)) continue;
    const r = computeAccrual({
      userId: '00000000-0000-4000-8000-000000000001', slot: 0,
      nowMs: NOW_MS, accruedToMs: NOW_MS - spanH * 3600000,
      activeSinceMs: NOW_MS - spanH * 3600000,
      activeKind: 'artisan', activeId: id, capMs: spanH * 3600000, seed,
      actionBudget: null,
      hp: HONEST_MAX_HP, maxHp: HONEST_MAX_HP, gold: 0,
      skills: { ...MAXED, ...GATHER_MAXED, ...ARTISAN_MAXED }, equipment: EQUIPMENT,
      inventory: artisanSupply(entry.recipe),
      autoEatEnabled: false, autoEatFood: null, autoEatPct: 0,
      toolCarry: {},
      /* The scroll for every gated recipe: a locked one stops at tick 0 and
         would silently drop out of the sweep, which is the direction that hides
         the highest-XP recipes in the catalogue. */
      unlockedRecipes: ARTISAN_SCROLLS,
      items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX,
      recipes: ARTISAN_INDEX,
    });
    if (r.accrued) out.push([`${spanH}h ${id}`, r.delta]);
  }
  return out;
}

/** Enough of every input that the CLOCK is the only bound. */
function artisanSupply(recipe) {
  const bag = {};
  const add = (id, q) => { bag[id] = (bag[id] || 0) + q * 1e6; };
  if (recipe.inputs) for (const [id, q] of Object.entries(recipe.inputs)) add(id, q);
  else {
    if (recipe.input) add(recipe.input, recipe.inputQty || 1);
    if (recipe.secondary) for (const [id, q] of Object.entries(recipe.secondary)) add(id, q);
  }
  return bag;
}

/**
 * The largest offline cap a real character can hold, in hours, READ OUT OF
 * `hr_offline_cap_ms` in supabase/migrations/2026-08-11-accrual.sql.
 *
 * The function is `c_base_h` plus a ladder of `v_hours := v_hours + N` bumps,
 * every one of which a single character can hold at once (they are cumulative
 * clan-level thresholds, not alternatives), then `least(c_ceiling_ms, …)`.
 * So the reachable maximum is base + every bump, capped by the ceiling.
 *
 * ⚠ IT THROWS RATHER THAN GUESSING. A parse that quietly returned a default
 *   would make both headroom sweeps run at a span nobody chose, and they would
 *   still print a confident number — the always-null-probe shape. If this
 *   throws, the cap function's spelling moved and somebody has to look.
 */
function reachableCapHours() {
  const path = join(ROOT, 'supabase', 'migrations', '2026-08-11-accrual.sql');
  const sql = readFileSync(path, 'utf8');
  const body = sql.slice(sql.indexOf('function public.hr_offline_cap_ms'));
  const base = body.match(/c_base_h\s+constant\s+int\s*:=\s*(\d+)/);
  if (!base) throw new Error('reachableCapHours: could not read c_base_h out of hr_offline_cap_ms — '
    + 'the cap function moved and both headroom sweeps would run at a span nobody chose');
  const bumps = [...body.slice(0, body.indexOf('$$;') + 1)
    .matchAll(/v_hours\s*:=\s*v_hours\s*\+\s*(\d+)/g)].map((m) => Number(m[1]));
  if (!bumps.length) throw new Error('reachableCapHours: hr_offline_cap_ms has no `v_hours := '
    + 'v_hours + N` bumps — either the ladder moved or the parse is blind, and a base-only answer '
    + 'would understate the reachable cap');
  const ceilMs = body.match(/c_ceiling_ms\s+constant\s+bigint\s*:=\s*(\d+)\s*\*\s*3600000/);
  const ceilH = ceilMs ? Number(ceilMs[1]) : Infinity;
  return Math.min(ceilH, Number(base[1]) + bumps.reduce((a, b) => a + b, 0));
}

function clampsFromMigration(sql) {
  const out = {};
  for (const m of sql.matchAll(/c_(max_[a-z_]+)\s+constant\s+(?:bigint|int)\s*:=\s*(\d+)/g)) {
    out[m[1]] = Number(m[2]);
  }
  return out;
}

async function clampGuard() {
  const sql = await readFile(join(ROOT, 'supabase', 'migrations', '2026-08-11-apply-engine.sql'), 'utf8');
  const C = clampsFromMigration(sql);
  for (const need of ['max_gold_delta', 'max_item_delta', 'max_xp_delta', 'max_item_kinds',
                      'max_progress_ops', 'max_progress_add']) {
    ok(C[need] > 0, `CLAMP: could not read c_${need} out of apply-engine.sql — the guard would be vacuous`);
  }
  if (!C.max_xp_delta) return;

  /* X4 — THE SURVIVING PROPERTY, ASSERTED RATHER THAN DESCRIBED.
     c_max_xp_delta was raised 5,000,000 -> 12,000,000 on 2026-08-11. The
     property that has to hold at ANY value is: one compromised call still
     cannot carry a skill from 0 to the level cap. xpForLevel(99) = 13,034,431
     (checked against public.hr_xp_for_level(99) on the live database, and
     against XP_TABLE in legacy.js, which agree). 12,000,000 lands at level 98.
     A future "just bump the clamp" therefore fails HERE, in a test, instead of
     passing a review as a sentence in a comment.
     Note what this is NOT: it is not a claim that the clamp stops a determined
     attacker. hr_rate_gate allows 30 calls/min, so 12M/call is 360M XP/min to
     anyone holding the engine. See the block above c_max_xp_delta in
     apply-engine.sql for what the clamp genuinely earns. */
  ok(C.max_xp_delta < 13034431,
    `CLAMP: c_max_xp_delta is ${C.max_xp_delta}, at or above xpForLevel(99) = 13034431. `
    + 'One apply could then take a skill from 0 to the cap, which is the only property '
    + 'the per-call XP clamp still buys. Lower it, or stop calling it a clamp.');

  /* The whole reachable envelope, not one fixture: EVERY monster in the
     catalogue, at the two spans that matter (15h, and 24h — the
     hr_offline_cap_ms ceiling and accrual.js's own ACCRUE_MAX_SPAN_MS), maxed
     skills and best-in-slot gear. "A new high-XP monster tightens it" is only
     true as a guard if the guard actually looks at the new monster. */
  const blank = () => ({ max_xp_delta: [0, ''], max_gold_delta: [0, ''], max_item_delta: [0, ''],
                         max_item_kinds: [0, ''], max_progress_add: [0, ''], max_progress_ops: [0, ''] });
  /* TWO tables, and the split is the ruling: `worst` is what a real character
     can reach and it FAILS THE BUILD; `forecast` is the 24h fuse ceiling and it
     is PRINTED. Same sweep, same fixtures, different verdicts. */
  const worst = blank();
  const forecast = blank();
  /* What each amnestied fletching recipe actually moved this run, for the
     printed report — an accepted residual nobody can see the size of is an
     accepted residual nobody re-examines. */
  const ammoSeen = {};
  let into = worst;
  const bump = (k, v, where) => { if (v > into[k][0]) into[k] = [v, where]; };

  for (const spanH of [REACHABLE_CAP_H, FORECAST_CAP_H]) {
    into = spanH === REACHABLE_CAP_H ? worst : forecast;
    for (const id of Object.keys(MONSTERS)) {
      const r = computeAccrual({
        userId: '00000000-0000-4000-8000-000000000001', slot: 0,
        nowMs: NOW_MS, accruedToMs: NOW_MS - spanH * 3600000,
        activeSinceMs: NOW_MS - spanH * 3600000,
        activeKind: 'combat', activeId: id, capMs: spanH * 3600000, seed: SEED,
        gold: 0, skills: MAXED, equipment: EQUIPMENT,
        items: ITEMS, monsters: MONSTERS,
        ...HONEST_SUSTAIN,
      });
      if (!r.accrued) continue;
      const d = r.delta; const where = `${spanH}h ${id}`;
      bump('max_xp_delta', Math.max(0, ...Object.values(d.xp || {})), where);
      bump('max_gold_delta', d.gold || 0, where);
      bump('max_item_delta', Math.max(0, ...Object.values(d.items || {})), where);
      bump('max_item_kinds', Object.keys(d.items || {}).length, where);
      bump('max_progress_add', Math.max(0, ...(d.progress || []).map((p) => p.add)), where);
      bump('max_progress_ops', (d.progress || []).length, where);
    }
    /* …and every GATHERING node, at the same two spans. Gathering's shape is
       the opposite of combat's — one item kind, no gold, modest XP, but a very
       large SINGLE-ITEM quantity, which is the dimension c_max_item_delta
       bounds. Sweeping it is the only way "gathering has plenty of headroom"
       stops being a sentence. */
    for (const [where, d] of gatherSweep(spanH)) {
      bump('max_xp_delta', Math.max(0, ...Object.values(d.xp || {})), where);
      bump('max_gold_delta', d.gold || 0, where);
      bump('max_item_delta', Math.max(0, ...Object.values(d.items || {})), where);
      bump('max_item_kinds', Object.keys(d.items || {}).length, where);
      bump('max_progress_add', Math.max(0, ...(d.progress || []).map((p) => p.add)), where);
      bump('max_progress_ops', (d.progress || []).length, where);
    }
    /* …and every ARTISAN recipe (b356). This is the sweep that was missing, and
       its absence was not neutral: artisan is 84% of the catalogue and it is
       the ONLY payable kind that reaches c_max_xp_delta in honest play. The
       item dimension is signed here — inputs leave, output arrives — so
       `max_item_delta` is measured on the ABSOLUTE movement, because hr_apply's
       clamp is `abs(v_n) > c_max_item_delta` and a 20,000-ore debit trips it
       exactly as a 20,000-bar credit would. */
    for (const [where, d] of artisanSweep(spanH)) {
      const recipeId = where.split(' ')[1];
      bump('max_xp_delta', Math.max(0, ...Object.values(d.xp || {})), where);
      bump('max_gold_delta', d.gold || 0, where);
      const units = Math.max(0, ...Object.values(d.items || {}).map(Math.abs));
      /* THE AMMUNITION LANE IS HELD OUT OF THE BLOCKING MAXIMUM — and ONLY
         those ids, and only against their own baselined value, and only at the
         reachable cap. Everything else on this dimension still fails at 60%,
         so a combat drop or a new bulk recipe crossing the clamp is caught
         exactly as before. The held-out rows get their own assertions below. */
      if (spanH === REACHABLE_CAP_H && Object.prototype.hasOwnProperty.call(AMMO_CLAMP_BASELINE, recipeId)) {
        ammoSeen[recipeId] = units;
      } else {
        bump('max_item_delta', units, where);
      }
      bump('max_item_kinds', Object.keys(d.items || {}).length, where);
      bump('max_progress_add', Math.max(0, ...(d.progress || []).map((p) => p.add)), where);
      bump('max_progress_ops', (d.progress || []).length, where);
    }
  }

  /* ── THE BASELINE'S FOUR PROPERTIES, ASSERTED ──────────────────────────── */
  {
    /* (1) NOTHING NEW MAY JOIN IT. Recomputed from the sweep rather than from
       `worst`, because `worst` only remembers the single largest. */
    const over = [];
    for (const [where, d] of artisanSweep(REACHABLE_CAP_H)) {
      const id = where.split(' ')[1];
      const units = Math.max(0, ...Object.values(d.items || {}).map(Math.abs));
      if (units > C.max_item_delta) over.push([id, units]);
    }
    for (const [id, units] of over) {
      ok(Object.prototype.hasOwnProperty.call(AMMO_CLAMP_BASELINE, id),
        `CLAMP BASELINE: '${id}' moves ${units} units of one item against c_max_item_delta = `
        + `${C.max_item_delta} and is NOT on AMMO_CLAMP_BASELINE. Only the seven fletching recipes `
        + 'Security ruled on 2026-08-16 are amnestied; a new recipe crossing the clamp is a new '
        + 'decision, not an inherited one. Reduce the yield, or take it to Security.');
      /* (2) THE RATCHET. An amnestied recipe may not get worse. */
      const base = AMMO_CLAMP_BASELINE[id];
      if (base !== undefined) {
        ok(units <= base,
          `CLAMP BASELINE RATCHET: '${id}' moves ${units} units, above its baselined ${base}. The `
          + 'amnesty is for the yields Security measured, not for whatever they become — a balance '
          + 'change that makes an already-over-clamp recipe worse pushes the degrade ladder past '
          + 'MAX_DEGRADE and the player gets nothing at all.');
      }
    }
    /* (3) A STALE AMNESTY IS REPORTED. An exception that no longer applies is a
       hole nobody remembers leaving open. */
    const stale = Object.keys(AMMO_CLAMP_BASELINE).filter((id) => !over.some(([o]) => o === id));
    clampGuard.staleAmnesty = stale;
    clampGuard.ammo = over.map(([id, units]) =>
      `${id} ${units}/${C.max_item_delta} = ${(units / C.max_item_delta).toFixed(1)}x  `
      + `→ ladder pays ~1/${2 ** Math.ceil(Math.log2(units / C.max_item_delta))} of the night`);
    for (const id of stale) {
      clampGuard.ammo.push(`${id} no longer overflows — REMOVE it from AMMO_CLAMP_BASELINE`);
    }
    /* (3b) b357 — THE TWO NEW ARTISAN LANES ARE NAMED, NOT MERELY ABSENT.
       Property (1) already fails the build on any unlisted recipe that crosses
       the clamp, so Runecrafting and Stonemason are covered by it. That is not
       enough: "not on the over-clamp list" is also what a lane looks like when
       the sweep never reached it — an empty set satisfies (1) perfectly.

       So the two lanes b357 added are checked POSITIVELY, and against the same
       60% line the rest of the guard uses rather than against the 100% the
       amnesty list represents. The design was BUILT to that number (the batch
       sizes in src/data/stonecraft.js are derived from it: `units = floor(
       54,000,000 / (ms x PACE.actionMs)) x outputQty`), so a balance change
       that quietly walks a rung toward the clamp should fail HERE, naming the
       rung, rather than in the aggregate `worst` line naming whichever recipe
       happened to be largest that day. */
    {
      const NEW_LANES = ['runecrafting', 'stonemason'];
      const laneIds = new Set();
      for (const skill of NEW_LANES) {
        for (const r of (ARTISAN_RECIPES[skill] || [])) laneIds.add(r.id);
      }
      ok(laneIds.size > 0,
        'CLAMP b357: ARTISAN_RECIPES has no runecrafting/stonemason rows — the lanes did not reach '
        + 'the engine and every assertion below would pass against an empty set');
      let seen = 0;
      for (const [where, d] of artisanSweep(REACHABLE_CAP_H)) {
        const id = where.split(' ')[1];
        if (!laneIds.has(id)) continue;
        seen++;
        const units = Math.max(0, ...Object.values(d.items || {}).map(Math.abs));
        ok(units <= C.max_item_delta * HEADROOM,
          `CLAMP b357: '${id}' moves ${units} units of one item at the ${REACHABLE_CAP_H}h reachable `
          + `cap — ${(units / C.max_item_delta * 100).toFixed(1)}% of c_max_item_delta, over the `
          + `${HEADROOM * 100}% line. The seven fletch_* rows are amnestied and pay ~1/8 of a night; `
          + 'these lanes were sized so they never need to be. Reduce outputQty (or raise ms) — the '
          + 'arithmetic is in the header of src/data/stonecraft.js.');
      }
      ok(seen === laneIds.size,
        `CLAMP b357: the sweep priced ${seen} of ${laneIds.size} new-lane recipes. A recipe the sweep `
        + 'cannot run is a recipe with no headroom measurement at all — check benchPayable and that '
        + 'artisanSupply() can stock its inputs.');
    }

    /* (4) AND THE CONTROL: the sweep must still SEE the lane. A change that made
       artisanSweep return nothing would satisfy (1) and (2) vacuously and this
       whole block would pass while measuring an empty set. */
    ok(over.length > 0 || stale.length === Object.keys(AMMO_CLAMP_BASELINE).length,
      'CLAMP BASELINE CONTROL: the artisan sweep found NO clamp overflow at all and the baseline is '
      + 'not fully stale either — the sweep is not seeing the ammunition lane, so (1) and (2) pass '
      + 'against an empty set.');
  }

  /* ── THE OFFENDER LIST, PRINTED (b356) ────────────────────────────────────
     `worst` names ONE recipe per dimension, which is enough to fail the build
     and not enough to decide anything. Whoever sizes the fuse needs to know
     whether it is one outlier or the whole top of the ladder — those are
     opposite decisions (re-balance one row vs. raise a constant). */
  {
    const over = [];
    for (const [where, d] of artisanSweep(24)) {
      const xp = Math.max(0, ...Object.values(d.xp || {}));
      const qty = Math.max(0, ...Object.values(d.items || {}).map(Math.abs));
      if (xp > C.max_xp_delta || qty > C.max_item_delta) {
        over.push({ where, xp, qty });
      }
    }
    over.sort((a, b) => (b.qty / C.max_item_delta + b.xp / C.max_xp_delta)
                      - (a.qty / C.max_item_delta + a.xp / C.max_xp_delta));
    clampGuard.artisanOverflow = over;
  }

  clampGuard.report = [];
  for (const [k, [v, where]] of Object.entries(worst)) {
    if (!C[k]) continue;
    const pct = v / C[k];
    clampGuard.report.push(`${k} ${v}/${C[k]} = ${(pct * 100).toFixed(1)}% (${where})`);
    /* THE XP DIMENSION HAS ITS OWN LINE — see XP_HEADROOM. It is the one clamp
       that cannot be raised, so the only honest instruction is about the yield. */
    if (k === 'max_xp_delta') {
      ok(pct < XP_HEADROOM,
        `CLAMP HEADROOM: honest play reaches ${v} against c_max_xp_delta = ${C[k]} — `
        + `${(pct * 100).toFixed(1)}%, over the ${XP_HEADROOM * 100}% line, at ${where}. `
        + 'THIS CLAMP CANNOT BE RAISED: xpForLevel(99) is 13,034,431 and the only property it still '
        + 'buys is that one apply cannot carry a skill from 0 to the cap (asserted above, and the '
        + 'literal is pinned by 2026-08-15-gem-daily-budget.sql\'s §0). The lever is the YIELD, and '
        + 'it is the Game Designer\'s. Until then the degrade ladder pays a fraction of the night '
        + 'and records an incident on every attempt. '
        + '(Line set by Security ruling 2026-08-16, "artisan flip re-review".)');
      continue;
    }
    ok(pct < HEADROOM,
      `CLAMP HEADROOM: honest play reaches ${v} against c_${k} = ${C[k]} — ${(pct * 100).toFixed(1)}%, `
      + `over the ${HEADROOM * 100}% line, at ${where}. A clamp that honest play can approach is a clamp that WILL `
      + `fire, and a fired clamp costs the player part of an absence (index.ts's degrade ladder) instead of `
      + `bricking it — but it is still an incident. Raise c_${k} in supabase/migrations/2026-08-11-apply-engine.sql `
      + `(and get it re-reviewed), or reduce the yield.`);
  }

  /* ── THE FORECAST. NOT AN ASSERTION, AND THAT IS DELIBERATE ─────────────
     24h is `hr_offline_cap_ms`'s fuse ceiling, not a span any character can
     hold (the reachable maximum is ${REACHABLE_CAP_H}h). Failing the build on
     it would be a false red — the fastest way to teach everyone that this guard
     can be argued with. Printing it costs nothing and means that on the day
     somebody raises the cap, the number they need is already on the screen
     rather than in a player's bug report. */
  clampGuard.forecast = [];
  for (const [k, [v, where]] of Object.entries(forecast)) {
    if (!C[k] || !v) continue;
    const pct = v / C[k];
    clampGuard.forecast.push(
      `${k} ${v}/${C[k]} = ${(pct * 100).toFixed(1)}% (${where})${pct >= 1 ? '  ⚠ OVER' : ''}`);
  }
}

// ── 5b. THE DAILY-BUDGET HEADROOM (C5 / X3) ─────────────────────────────────
// The per-call clamps above bound ONE delta. The daily budget
// (2026-08-11-daily-budget.sql) bounds a UTC DAY, and it is the control that
// actually caps a compromised engine — 30 accrues/minute makes the per-call XP
// clamp worth 518 BILLION XP/day on its own.
//
// The budget is a FUSE, not a pacing control, and the difference is the whole
// argument for why it does not resurrect b226's daily away-time bucket (which
// was replaced by b307's per-absence cap precisely because it pinned every save
// to its cap — see docs/design/away-time-ruling.md). A fuse that honest play can
// reach IS a pacing control, whatever the header calls it. So this guard fails
// the build the moment the honest maximum crosses the line.
//
// THE HONEST MAXIMUM IS MEASURED, NOT ASSUMED: every monster in the catalogue,
// maxed skills, best-in-slot gear, at the 24h span, summed ACROSS skills and
// ACROSS item ids (the budget's dimensions are totals, so a per-call maximum
// would understate them). Times TWO, because a single UTC day's ledger can hold
// two such windows — a 24h-capped absence collected at 00:01, which paid for
// yesterday, plus a full 24h of today.
const DAY_HEADROOM = 0.35;
const DAY_WINDOWS_PER_UTC_DAY = 2;

function dayBudgetsFromMigration(sql) {
  const out = {};
  for (const m of sql.matchAll(/c_day_([a-z_]+)_budget\s+constant\s+bigint\s*:=\s*(\d+)/g)) {
    out[m[1]] = Number(m[2]);
  }
  return out;
}

/* ── THE LIVE END OF THE CHAIN, NOT THE FIRST FILE ──────────────────────────
   `hr_day_budget_limits` is a `create or replace` that FOUR migrations restate,
   so the value production runs is the one in the LAST file that declares it —
   filename order, which is how this repo's chain is applied. Reading
   2026-08-11-daily-budget.sql (as this guard did until b356) graded a value
   that a later migration may already have superseded: it happened to be right
   only because every restatement so far kept the same numbers, i.e. the guard
   was correct by coincidence and would have gone silently stale on the first
   file that changed one. It went stale immediately when
   2026-08-16-day-budget-artisan.sql raised two of them.

   Returns { budgets, file } so a failure can name WHICH file it graded — "the
   ceiling is 40M" is useless when four files declare a ceiling. */
async function latestDayBudgets() {
  const dir = join(ROOT, 'supabase', 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  let found = null;
  for (const f of files) {
    const b = dayBudgetsFromMigration(await readFile(join(dir, f), 'utf8'));
    if (Object.keys(b).length) found = { budgets: b, file: f };
  }
  return found;
}

async function dayBudgetGuard() {
  const latest = await latestDayBudgets();
  ok(!!latest,
    'DAY BUDGET: no migration in the chain declares a c_day_*_budget constant — the guard is blind, '
    + 'which is the always-null-probe failure this file exists to avoid.');
  if (!latest) return;
  const B = latest.budgets;
  for (const need of ['gold', 'xp', 'qty']) {
    ok(B[need] > 0,
      `DAY BUDGET: could not read c_day_${need}_budget out of ${latest.file} — the guard would be `
      + 'vacuous, which is the always-null-probe failure this file exists to avoid.');
  }
  if (!B.xp) return;
  dayBudgetGuard.source = latest.file;

  /* The per-call XP clamp must stay STRICTLY BELOW the day ceiling, or the day
     ceiling pre-empts it and c_max_xp_delta becomes a control that can never
     fire. (The gold pair is deliberately the other way round — see the
     ordering comment at hr_apply's (4b) — and is not asserted here.) */
  const clamps = clampsFromMigration(
    await readFile(join(ROOT, 'supabase', 'migrations', '2026-08-11-apply-engine.sql'), 'utf8'));
  ok(clamps.max_xp_delta && clamps.max_xp_delta * 2 <= B.xp,
    `DAY BUDGET: c_day_xp_budget (${B.xp}) leaves room for fewer than two per-call XP clamps `
    + `(${clamps.max_xp_delta}). The day ceiling would fire before the per-call clamp could, and a `
    + 'clamp that cannot fire is not a control.');

  /* TWO tables, same rule as clampGuard: `worst` is what a real character can
     reach at the REACHABLE offline cap and it FAILS THE BUILD; `forecast` is
     the 24h fuse ceiling and it is PRINTED. Security ruling 2026-08-16. */
  const worst = { gold: [0, ''], xp: [0, ''], qty: [0, ''] };
  const forecast = { gold: [0, ''], xp: [0, ''], qty: [0, ''] };
  let into = worst;
  const bump = (k, v, where) => { if (v > into[k][0]) into[k] = [v, where]; };
  const posQty = (d) => Object.values(d.items || {}).filter((v) => v > 0).reduce((a, b) => a + b, 0);

  for (const spanH of [REACHABLE_CAP_H, FORECAST_CAP_H]) {
    into = spanH === REACHABLE_CAP_H ? worst : forecast;
    for (const id of Object.keys(MONSTERS)) {
      const r = computeAccrual({
        userId: '00000000-0000-4000-8000-000000000001', slot: 0,
        nowMs: NOW_MS, accruedToMs: NOW_MS - spanH * 3600000, activeSinceMs: NOW_MS - spanH * 3600000,
        activeKind: 'combat', activeId: id, capMs: spanH * 3600000, seed: SEED,
        gold: 0, skills: MAXED, equipment: EQUIPMENT,
        items: ITEMS, monsters: MONSTERS,
        ...HONEST_SUSTAIN,
      });
      if (!r.accrued) continue;
      const d = r.delta;
      bump('gold', d.gold || 0, `${spanH}h ${id}`);
      bump('xp', Object.values(d.xp || {}).reduce((a, b) => a + b, 0), `${spanH}h ${id}`);
      /* POSITIVE entries only. The budget's `qty` dimension is gross INFLOW, and
         auto-eat now puts a negative in this map — summing it signed would let a
         night of eating pay for a night of looting. */
      bump('qty', posQty(d), `${spanH}h ${id}`);
    }
    /* Gathering, at the same span. It is the `qty` dimension's real worst case
       among the pre-b356 kinds — a night of chopping is one item kind in five
       figures, where a night of fighting is a handful of drop rows. */
    for (const [where, d] of gatherSweep(spanH)) {
      bump('gold', d.gold || 0, where);
      bump('xp', Object.values(d.xp || {}).reduce((a, b) => a + b, 0), where);
      bump('qty', posQty(d), where);
    }
    /* Artisan (b356), and it is now the worst case in BOTH the qty and xp
       dimensions by an order of magnitude. POSITIVE entries only, for the
       reason stated above and doubly so here: this is the one path whose item
       map is routinely negative, and summing it signed would let the consumed
       inputs pay for the produced output — a night that mints 20,000 bars would
       score as nearly zero gross inflow, which is precisely the dimension the
       budget exists to bound. */
    for (const [where, d] of artisanSweep(spanH)) {
      bump('gold', d.gold || 0, where);
      bump('xp', Object.values(d.xp || {}).reduce((a, b) => a + b, 0), where);
      bump('qty', posQty(d), where);
    }
  }

  dayBudgetGuard.report = [];
  for (const [k, [v, where]] of Object.entries(worst)) {
    const perDay = v * DAY_WINDOWS_PER_UTC_DAY;
    const pct = perDay / B[k];
    dayBudgetGuard.report.push(`${k} ${perDay}/${B[k]} = ${(pct * 100).toFixed(1)}% (${where} x${DAY_WINDOWS_PER_UTC_DAY})`);
    ok(pct < DAY_HEADROOM,
      `DAY BUDGET HEADROOM: honest play reaches ${perDay} ${k} in a UTC day against a ceiling of `
      + `${B[k]} — ${(pct * 100).toFixed(1)}%, over the ${DAY_HEADROOM * 100}% line, at ${where}. `
      + 'The daily budget is an ABUSE CEILING and must never clip a player; the per-absence offline '
      + 'cap (b307) is the pacing control and it WINS when the two conflict. Raise c_day_'
      + `${k}_budget in supabase/migrations/${latest.file} — do NOT let this fire. (The escalation `
      + 'rule is the one 2026-08-11-daily-budget.sql states itself: "if a balance change ever makes honest play '
      + 'approach these numbers, the correct response is to raise the budget, not to let it clip a '
      + 'player.")');
  }

  /* THE FORECAST, printed and not asserted — same reason clampGuard keeps one.
     24h is the cap function's FUSE ceiling, not a span any character can hold. */
  dayBudgetGuard.forecast = [];
  for (const [k, [v, where]] of Object.entries(forecast)) {
    if (!v) continue;
    const perDay = v * DAY_WINDOWS_PER_UTC_DAY;
    const pct = perDay / B[k];
    dayBudgetGuard.forecast.push(
      `${k} ${perDay}/${B[k]} = ${(pct * 100).toFixed(1)}% (${where} x${DAY_WINDOWS_PER_UTC_DAY})`
      + `${pct >= 1 ? '  ⚠ OVER' : ''}`);
  }
}

/* ── THE COMBAT-XP CREDIT DAILY-CEILING GUARD (Security 2026-08-31, condition 1a) ─
   Sibling of dayBudgetGuard. hr_credit_combat_xp has its OWN daily ceiling
   (c_combat_xp_day_budget) because combat XP is RANKED (leaderboards server-sourced
   since 2026-08-18) and the shared 40M XP pool is ~9x the honest combat maximum —
   a forger on the shared pool reaches max combat level in ~2.3 days without
   playing. This BINDS that ceiling to the measured honest maximum a real maxed
   character can earn in a 24h NONSTOP attended grind (the credit path is attended,
   so the ceiling is per-play-hour x 24, not the away offline cap). It FAILS THE
   BUILD if the constant is below the honest max (would throttle a hardcore grinder)
   or too far above it (would hand a forger more than ~a grinder's day). */
async function combatXpDayCeilingGuard() {
  const file = join(ROOT, 'supabase', 'migrations', '2026-08-31-combat-xp-credit.sql');
  let sql;
  try { sql = await readFile(file, 'utf8'); }
  catch { ok(false, 'COMBAT-XP CEILING: 2026-08-31-combat-xp-credit.sql is missing'); return; }
  const m = sql.match(/c_combat_xp_day_budget\s+constant\s+bigint\s*:=\s*(\d+)/);
  ok(!!m, 'COMBAT-XP CEILING: could not read c_combat_xp_day_budget out of the migration — the guard would be vacuous');
  if (!m) return;
  const budget = Number(m[1]);

  // Honest max: the best combat total-XP any maxed, auto-eating character can earn
  // in ONE hour, x24 for a full nonstop day. Measured on the same fixture the
  // dayBudgetGuard uses (HONEST_SUSTAIN), so the two ceilings share one definition
  // of "honest". A 1h window is used so tick granularity does not favour a monster.
  const H = 1;
  let perHour = 0, where = '';
  for (const id of Object.keys(MONSTERS)) {
    const r = computeAccrual({
      userId: '00000000-0000-4000-8000-000000000001', slot: 0,
      nowMs: NOW_MS, accruedToMs: NOW_MS - H * 3600000, activeSinceMs: NOW_MS - H * 3600000,
      activeKind: 'combat', activeId: id, capMs: H * 3600000, seed: SEED,
      gold: 0, skills: MAXED, equipment: EQUIPMENT, items: ITEMS, monsters: MONSTERS,
      ...HONEST_SUSTAIN,
    });
    if (!r.accrued) continue;
    const tot = Object.values(r.delta.xp || {}).reduce((a, b) => a + b, 0);
    if (tot > perHour) { perHour = tot; where = id; }
  }
  const honestDay = perHour * 24;
  combatXpDayCeilingGuard.report = `c_combat_xp_day_budget ${budget} vs honest 24h-grind `
    + `${honestDay} (${(budget / honestDay).toFixed(2)}x, worst monster ${where})`;
  ok(perHour > 0, 'COMBAT-XP CEILING: the honest sweep produced no combat XP — fixture is not exercising the path');
  ok(budget >= honestDay,
    `COMBAT-XP CEILING: c_combat_xp_day_budget (${budget}) is BELOW the honest 24h-grind maximum `
    + `(${honestDay}, at ${where}) — a hardcore grinder would be THROTTLED. Raise the constant in `
    + '2026-08-31-combat-xp-credit.sql (the escalation rule is dayBudgetGuard\'s: raise the budget, never clip a player).');
  ok(budget <= Math.ceil(honestDay * 1.5),
    `COMBAT-XP CEILING: c_combat_xp_day_budget (${budget}) is more than 1.5x the honest 24h-grind maximum `
    + `(${honestDay}) — a forger's daily combat-XP ceiling is too loose. This is a RANKED surface; tighten `
    + 'the constant toward the honest max so the forgeable ceiling stays "hardcore grinder", not "5.6x the best player".');
}

// ── 6. THE DEPLOY CONTRACT ──────────────────────────────────────────────────
// D2's second lock. In-function verification is the primary control, but
// `verify_jwt = true` must also exist as a committed artefact, and nothing in
// the repo may tell anyone to turn it off.
async function deployGuard() {
  const cfgPath = join(ROOT, 'supabase', 'config.toml');
  let cfg = null;
  try { cfg = await readFile(cfgPath, 'utf8'); }
  catch { problems.push('DEPLOY: supabase/config.toml is missing — verify_jwt would live only in a deploy command'); return; }

  const fnDir = join(ROOT, 'supabase', 'functions');
  const names = (await readdir(fnDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name);
  for (const n of names) {
    const head = `[functions.${n}]`;
    const at = cfg.indexOf(head);
    if (at < 0) { problems.push(`DEPLOY: supabase/config.toml has no ${head} section`); continue; }
    const rest = cfg.slice(at + head.length);
    const next = rest.indexOf('\n[');
    const block = next >= 0 ? rest.slice(0, next) : rest;
    ok(/verify_jwt\s*=\s*true/.test(block),
      `DEPLOY: supabase/config.toml does not pin verify_jwt = true for ${head}`);
  }
  ok(!/verify_jwt\s*=\s*false/.test(cfg), 'DEPLOY: config.toml sets verify_jwt = false somewhere');

  /* No file in the repo may hand someone the flag. Documentation that explains
     WHY NOT to use it is legitimate and worth keeping — the header of jwt.js is
     the clearest statement of the D2 defect anywhere — so an occurrence is
     allowed ONLY on a line that also carries the marker below. That makes the
     exception explicit and countable instead of making the guard blind, and a
     future deploy script cannot acquire one by accident.

     The pattern is assembled from fragments so that THIS FILE does not match
     its own search — the self-match is how the first run of this guard failed. */
  const FLAG = `--no-${'verify'}-jwt`;
  const MARKER = 'never use this';
  for (const rel of await repoScripts()) {
    const body = await readFile(join(ROOT, rel), 'utf8');
    for (const line of body.split('\n')) {
      if (!line.includes(FLAG)) continue;
      ok(line.toLowerCase().includes(MARKER),
        `DEPLOY: ${rel} contains ${FLAG} on a line with no "${MARKER}" marker — `
        + 'if this is documentation, say so on the line; if it is a command, delete it');
    }
  }
}

/* Every place a deploy command could plausibly be written down. Kept explicit
   rather than walking the whole tree: node_modules and assets are large, and a
   guard that takes four seconds is a guard someone will move out of the
   preflight. */
async function repoScripts() {
  const out = [];
  const roots = ['', '.github/workflows', 'docs', 'docs/design', 'tools', 'tests', 'supabase'];
  for (const r of roots) {
    let entries = [];
    try { entries = await readdir(join(ROOT, r), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!/\.(sh|mjs|js|ya?ml|md|toml|json)$/.test(e.name)) continue;
      out.push(r ? `${r}/${e.name}` : e.name);
    }
  }
  return out;
}

// ── 7. THE PACKER ───────────────────────────────────────────────────────────
// The Deno/core sharing mechanism has a packability guard; run it here so a
// change to src/core that never got repacked fails a test rather than a deploy.
//
// ⚠ WHAT THIS DOES NOT PROVE (review S10). `check()` cannot answer
//   "does production match this repo?" — it derives both sides from the same
//   bytes. The earlier revision claimed otherwise and its central comparison was
//   unfalsifiable. The deployed-vs-repo question is answered by the payload
//   hash: pack() stamps it, the function returns it on a GET, and
//   tests/run-smoke.mjs compares the two when HR_ACCRUE_URL is configured.
async function packerGuard() {
  const pe = await import('../tools/pack-edge.mjs');
  for (const p of await pe.runAll()) problems.push(`PACK: ${p}`);

  const { files, hash } = await pe.pack('hr-accrue');
  ok(/^[0-9a-f]{64}$/.test(hash || ''), `PACK: the payload hash is '${hash}' — not a sha256`);
  const stamped = files.find((f) => f.name === pe.HASH_FILE);
  ok(!!stamped && stamped.content.includes(`'${hash}'`),
    'PACK: the packed payload-hash.js does not carry the digest the packer computed');

  /* THE GUARD'S OWN GUARD. `check()`'s comparisons are only worth having if a
     corrupted transform would be caught. Prove the round-trip property is
     falsifiable rather than assuming it: a transform that drops a character
     must not round-trip. */
  const src = await readFile(join(FN_DIR, 'index.ts'), 'utf8');
  ok(pe.unrewriteFunctionSource(pe.rewriteFunctionSource(src)) === src,
    'PACK: an honest pack does not round-trip — the check would fail on correct input');
  const corrupted = pe.rewriteFunctionSource(src).replace('./vendor/data/', './vendor/dat/');
  ok(pe.unrewriteFunctionSource(corrupted) !== src,
    'PACK: a CORRUPTED pack still round-trips — the drift check is unfalsifiable');

  /* And the payload hash must actually depend on the payload. */
  const other = files.map((f) => ({ ...f }));
  other[0] = { ...other[0], content: `${other[0].content}\n` };
  ok(pe.payloadHash(files) !== pe.payloadHash(other),
    'PACK: payloadHash ignored a one-byte change — it cannot detect drift');
}

/* ── TWO CALLERS, ONE ENGINE (b345) ─────────────────────────────────────────
   `computeAccrual` now has two call sites: index.ts's accrue verb, and the
   COLLECT that set-activity.js runs before it switches. If one gains an input
   the other does not, the two verbs price the SAME window differently —
   silently, with no error, always in the player's disfavour on whichever side
   is short. That is not hypothetical: auto-eat added `inventory` /
   `autoEatEnabled` / `autoEatFood` / `autoEatPct` to the accrue literal, and a
   collect without them fights with no food and dies early.

   Exported so tests/activity-intent.mjs (A14) runs the SAME function against
   its mutated temp copy — one implementation, two callers, which is the rule
   this guard exists to enforce applied to the guard itself.

   It compares two REAL things against each other rather than one thing against
   a list somebody typed, and it reports "the extractor is blind" as a FAILURE
   rather than as agreement. */
export function computeAccrualInputParity(fnDir) {
  const found = [];
  const keysOf = (src) => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const at = code.indexOf('computeAccrual({');
    if (at < 0) return null;
    const open = code.indexOf('{', at);
    let depth = 0; let end = -1;
    for (let i = open; i < code.length; i++) {
      if ('{(['.includes(code[i])) depth++;
      else if ('})]'.includes(code[i])) { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;
    const keys = []; let d = 0; let line = '';
    for (const ch of code.slice(open + 1, end)) {
      if (ch === '\n') {
        /* `name:` AND the shorthand `name,` — the two literals use a mix of both
           for the same field, and an extractor that saw only one form would
           report a permanent, meaningless difference and be "fixed" by deletion. */
        const m = d === 0 && line.match(/^\s*([A-Za-z_$][\w$]*)\s*(?::|,\s*$)/);
        if (m) keys.push(m[1]);
        line = ''; continue;
      }
      if (d === 0) line += ch;
      if ('{(['.includes(ch)) d++; else if ('})]'.includes(ch)) d--;
    }
    return keys.sort();
  };
  return (async () => {
    const shell = keysOf(await readFile(join(fnDir, 'index.ts'), 'utf8'));
    const intent = keysOf(await readFile(join(fnDir, 'set-activity.js'), 'utf8'));
    /* CONTROL FIRST. An extractor that returns [] would make the comparison
       below pass on any pair of files forever. */
    if (!shell || shell.length < 10) {
      found.push(`PARITY: the extractor found ${shell ? shell.length : 'no'} fields in index.ts's `
        + 'computeAccrual literal — it is blind, so the comparison proves nothing');
      return found;
    }
    if (!intent || intent.length < 10) {
      found.push(`PARITY: the extractor found ${intent ? intent.length : 'no'} fields in `
        + "set-activity.js's computeAccrual literal — it is blind");
      return found;
    }
    const onlyShell = shell.filter((k) => !intent.includes(k));
    const onlyIntent = intent.filter((k) => !shell.includes(k));
    if (onlyShell.length || onlyIntent.length) {
      found.push(`PARITY: the two computeAccrual call sites disagree. Only in index.ts (accrue): `
        + `[${onlyShell}]. Only in set-activity.js (the collect a switch runs): [${onlyIntent}]. `
        + 'Two callers of one engine with different inputs price the same window differently, '
        + 'silently. Add the field to BOTH — do not relax this guard.');
    }
    return found;
  })();
}

/* The intent's allowlist may never be wider than the set the engine can PAY: a
   window the engine cannot price is a window the switch CONFISCATES, because
   hr_apply stamps accrued_to = now() on any activity delta. Derived, not
   restated — this asserts the derivation survived. */
async function settableKindsGuard() {
  const [{ PAYABLE_KINDS }, { SETTABLE_KINDS }] = await Promise.all([
    import('../supabase/functions/hr-accrue/accrual.js'),
    import('../supabase/functions/hr-accrue/set-activity.js'),
  ]);
  for (const k of SETTABLE_KINDS) {
    ok(k === 'idle' || PAYABLE_KINDS.includes(k),
      `INTENT: SETTABLE_KINDS contains '${k}', which computeAccrual cannot pay — an activity `
      + 'switch would confiscate that window instead of paying it');
  }
  ok(SETTABLE_KINDS.includes('idle'),
    'INTENT: SETTABLE_KINDS has no idle — the player could never stop');
  for (const k of PAYABLE_KINDS) {
    ok(SETTABLE_KINDS.includes(k),
      `INTENT: the engine can pay '${k}' but no intent can set it — the accrual is unreachable`);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   THE CONSUMPTION GUARD (design item E1) — "crafted arrows are never spent in
   combat" (Paione, 2026-08-20).

   Six claims, and every one of them is checked against a number this file
   derives from the CATALOGUE rather than against the other engine's answer.
   That is the fixture rule (TESTING.md, instance 1) applied on purpose: the
   away-vs-live parity fixtures compare two sides that share `src/core`, so a
   defect planted inside the shared half moves BOTH columns identically and
   stays green. `ticks x ITEMS[id].ammoPerShot` is the third opinion.
   ════════════════════════════════════════════════════════════════════════════ */

/* The ranged loadout, picked from the LIVE catalogue like `pickEquipment` — an
   invented bow would test the engine against data the game does not contain. */
function rangedLoadout(ammoId) {
  const bow = Object.keys(ITEMS)
    .filter((id) => ITEMS[id]?.weaponType === 'ranged' && ITEMS[id]?.rangeStrB)
    .sort((a, b) => (ITEMS[b].rangeStrB || 0) - (ITEMS[a].rangeStrB || 0))[0];
  const eqp = { weapon: bow };
  if (ammoId) eqp.ammo = ammoId;
  return eqp;
}

function meleeLoadout(ammoId) {
  const sword = Object.keys(ITEMS)
    .filter((id) => ITEMS[id]?.weaponType === 'sword' && ITEMS[id]?.strB)
    .sort((a, b) => (ITEMS[b].strB || 0) - (ITEMS[a].strB || 0))[0];
  const eqp = { weapon: sword };
  if (ammoId) eqp.ammo = ammoId;
  return eqp;
}

/** The signed debit the server proposed for `id`, as a POSITIVE count. */
function serverSpent(out, id) {
  const n = Number((out.delta && out.delta.items && out.delta.items[id]) || 0);
  return n < 0 ? -n : 0;
}

/* ── DOES ANY SHIPPED SOURCE FILE CARRY THIS TOKEN? ─────────────────────────
   The instrument behind the A1 coupling: `AMMO_EMPTY_SLOT_IS_DRY` may not be
   true unless the empty-quiver indicator exists, and "exists" has to be
   something a build can SEE. Walks `src/` once (js/mjs/css/html) and memoises,
   because `ammoGuard` is synchronous so the whole family can run under a
   mutation harness with no network and no await.

   The indicator is allowed to be a CSS class, a data attribute, a glyph key or
   a render helper, so the scan does not narrow by mechanism — narrowing it
   would be this file dictating the Art Director's implementation instead of
   asking for evidence of the outcome.

   ⚠ `src/core/**` IS EXCLUDED, AND THAT EXCLUSION IS THE WHOLE CONTROL.
     Without it the check is UNFALSIFIABLE: `src/core/ammo.js` is where the
     marker string is DEFINED (`AMMO_DRY_UI_MARKER`) and where the coupling is
     documented, so the scan found the token in the very file that names it and
     the "flag flipped, no indicator" mutation passed green. Caught by running
     that mutation — which is the second time on this branch that a check I had
     just written proved to be about itself.
     Excluding core is not a patch over that; it is the correct rule
     independently: `src/core` is pure and DOM-free by construction (enforced by
     tests/core-purity.mjs), so an INDICATOR can never honestly live there. The
     evidence has to come from a surface that can actually render. */
const SRC_SCAN_EXT = new Set(['.js', '.mjs', '.css', '.html']);
const SRC_SCAN_SKIP = join(ROOT, 'src', 'core');
let SRC_TREE_BLOB = null;
function srcTreeBlob() {
  if (SRC_TREE_BLOB !== null) return SRC_TREE_BLOB;
  const parts = [];
  const walk = (dir) => {
    if (dir === SRC_SCAN_SKIP) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      const dot = e.name.lastIndexOf('.');
      if (dot < 0 || !SRC_SCAN_EXT.has(e.name.slice(dot))) continue;
      try { parts.push(readFileSync(full, 'utf8')); } catch { /* unreadable is not evidence */ }
    }
  };
  walk(join(ROOT, 'src'));
  SRC_TREE_BLOB = parts.join('\n');
  return SRC_TREE_BLOB;
}
/** Does a RENDERABLE source file under `src/` (i.e. not `src/core`) carry this
 *  token? See the exclusion note above before widening this. */
function srcTreeContains(token) {
  return srcTreeBlob().indexOf(token) !== -1;
}

/* The other half of the tree — `src/core` only. Its one caller (AMMO-E5b) is
   asking whether an invariant is still WRITTEN DOWN at the function it governs,
   which is exactly the region `srcTreeContains` excludes. Kept separate rather
   than adding a flag, so neither reader can be handed the wrong half. */
let CORE_TREE_BLOB = null;
function srcTreeBlobCore() {
  if (CORE_TREE_BLOB !== null) return CORE_TREE_BLOB;
  const parts = [];
  let entries;
  try { entries = readdirSync(SRC_SCAN_SKIP, { withFileTypes: true }); } catch { entries = []; }
  for (const e of entries) {
    if (e.isDirectory()) continue;
    const dot = e.name.lastIndexOf('.');
    if (dot < 0 || !SRC_SCAN_EXT.has(e.name.slice(dot))) continue;
    try { parts.push(readFileSync(join(SRC_SCAN_SKIP, e.name), 'utf8')); } catch { /* skip */ }
  }
  CORE_TREE_BLOB = parts.join('\n');
  return CORE_TREE_BLOB;
}

function ammoGuard() {
  const A = 'AMMO-E';
  const RANGED_SKILLS = { ...MAXED, ranged: 13034431 };
  /* A monster that dies fast enough to keep the fight going all night and does
     not kill a maxed character, so the span runs its full tick budget and the
     consumption arithmetic is not truncated by a death. */
  const TARGET = MONSTERS.slime ? 'slime' : MONSTER;

  /* Every arrow, rune and whetstone the catalogue ships, so a new ladder rung
     is covered on the day it is authored rather than the day someone
     remembers to add it here. */
  const AMMO_IDS = Object.keys(ITEMS).filter((id) => ITEMS[id] && ITEMS[id].slot === 'ammo');
  ok(AMMO_IDS.length >= 14,
    `${A}0: the catalogue holds only ${AMMO_IDS.length} ammo-slot items — this guard is reading the wrong table`);
  const PAID_ARROW = AMMO_IDS.find((id) => ITEMS[id].ammoPerShot === 1 && ITEMS[id].rangeStrB);
  const FREE_ARROW = AMMO_IDS.find((id) => ITEMS[id].ammoPerShot === 0 && ITEMS[id].rangeStrB);
  const WHETSTONE = AMMO_IDS.find((id) => ITEMS[id].ammoPerShot > 0 && ITEMS[id].ammoPerShot < 1);
  ok(!!PAID_ARROW && !!FREE_ARROW && !!WHETSTONE,
    `${A}0: the catalogue no longer carries one of {paid arrow, free arrow, fractional whetstone} `
    + `— got ${PAID_ARROW}/${FREE_ARROW}/${WHETSTONE}. The ladders moved; re-point this guard.`);
  if (!PAID_ARROW || !FREE_ARROW || !WHETSTONE) return;

  const STOCK = 1000000;                       // far more than any 12h span burns

  /* ── THE FIXTURE IS FED, AND EVERY CASE BELOW USES IT ────────────────────
     The parity fixtures at the top of this file run with auto-eat OFF (the
     shipped default) and every one of them ends in a DEATH partway through the
     night — which truncates the tick budget and would make "ticks x
     ammoPerShot" a claim about a 3-hour span dressed as a claim about a
     12-hour one. Feeding the character makes the span run its FULL budget
     (20,454 swings at 2112 ms), which is the number consumable-economy.md §4.2
     publishes and the number a supply projection quotes.

     ⚠ THE FOOD IS PICKED BY THE ENGINE'S OWN CHOOSER, not by a `heals` sort —
       the fixture rule (TESTING.md). The catalogue's biggest healer is
       `void_banquet`, and it is `foodClass: 'buff'`, which `isAutoEatable`
       REFUSES: a fixture that nominated it would feed the character food the
       engine will not eat, watch it die, and blame the arrows. */
  const everything = {};
  for (const id of Object.keys(ITEMS)) everything[id] = 1;
  const FOOD = bestHealingFood(everything, ITEMS);
  ok(!!FOOD && Number(ITEMS[FOOD].heals) > 0,
    `${A}0: bestHealingFood found nothing auto-eatable in the catalogue — every fixture below `
    + 'would starve and the failures would all point at ammo');
  const runServer = (over) => serverAccrual({
    activeId: TARGET, skills: RANGED_SKILLS, hp: 99, maxHp: 99,
    autoEatEnabled: true, autoEatFood: FOOD, autoEatPct: 50, ...over,
  });
  /* An inventory with the quiver AND the larder. */
  const fed = (inv) => ({ ...inv, [FOOD]: 100000 });

  // ── E1. THE RATE. Exactly `ticks x ammoPerShot`, from the catalogue. ───────
  {
    const eqp = rangedLoadout(PAID_ARROW);
    const s = runServer({ equipment: eqp, inventory: fed({ [PAID_ARROW]: STOCK }) });
    ok(s.accrued === true, `${A}1: the supplied ranged fixture accrued nothing (${s.reason})`);
    if (s.accrued) {
      const want = s.summary.ticks * ITEMS[PAID_ARROW].ammoPerShot;
      ok(want > 10000,
        `${A}1: the fixture only fired ${want} arrows in ${SPAN_MS / 3600000}h — it died early, so `
        + 'the rate claim below would be about a span nobody asked about');
      ok(serverSpent(s, PAID_ARROW) === want,
        `${A}1: a ${SPAN_MS / 3600000}h span ran ${s.summary.ticks} swings and should have spent `
        + `${want} ${PAID_ARROW} at ammoPerShot ${ITEMS[PAID_ARROW].ammoPerShot}, but the delta says `
        + `${serverSpent(s, PAID_ARROW)}. Burn is a pure function of TIME (R3) — never of accuracy, `
        + 'kills or drops.');
      ok((s.summary.consumed || {})[PAID_ARROW] === want,
        `${A}1: summary.consumed disagrees with the item delta — the away card and the ledger `
        + 'would tell the player two different numbers');
      /* THE LEDGER SHAPE (§13.2): "consumption is a per-tick inventory
         decrement… it MUST be aggregated into the span's single delta, never
         written per tick — 13,636 arrows over an 8-hour absence is 13,636
         ledger rows if anyone gets that wrong." The delta names ONE key for
         ~20,000 spends, and the whole map stays bounded by the DROP TABLE
         rather than by the tick count. */
      ok(Object.keys(s.delta.items || {}).length <= 12,
        `${A}1: the item delta carries ${Object.keys(s.delta.items || {}).length} keys — it must be `
        + 'bounded by the monster\'s drop table, never by the tick count');
      ok(s.delta.items[PAID_ARROW] === -want,
        `${A}1: ${s.summary.ticks} separate spends must arrive as ONE signed key of ${-want}, `
        + `got ${s.delta.items[PAID_ARROW]}`);
      ok(s.delta.journal.meta.spent && s.delta.journal.meta.spent[PAID_ARROW] === want,
        `${A}1: the journal does not record the burn — a support request about a vanished quiver `
        + 'has to be answerable from it');
    }
  }

  // ── E1b. THE LAST ARROW'S OWN SHOT IS A SUPPLIED SHOT. ────────────────────
  /* The off-by-one a player would feel as "it took my arrow AND weakened the
     shot". Pinned at the seam because it is invisible in a 20,000-swing
     aggregate: one weak swing in twenty thousand moves no fixture's kill count.
     `startMult` and `mult` exist as two fields precisely for this swing. */
  {
    const st = { equipment: { weapon: rangedLoadout(PAID_ARROW).weapon, ammo: PAID_ARROW },
                 inventory: { [PAID_ARROW]: 1 } };
    const removed = [];
    /* THE SINK MOVES THE BAG — `spendForSwings` states the debit, it does not
       apply it. A fixture whose sink only recorded would leave the stack full
       and then "prove" that the next swing was still supplied, which is a
       property of the fixture. Both real sinks (legacy COMBAT_FX.removeItem and
       accrual.js's) decrement; so does this one. */
    const c = { items: ITEMS, fx: { removeItem: (id, q) => {
      removed.push([id, q]);
      st.inventory[id] = Math.max(0, (st.inventory[id] || 0) - q);
    } } };
    const r = AMMO.spendForSwings(st, 1, c);
    ok(r.spent === 1 && removed.length === 1,
      `${A}1b: the last arrow was not spent (spent ${r.spent}, ${removed.length} removeItem calls)`);
    ok(r.startMult === 1,
      `${A}1b: the swing that looses the LAST arrow ran at x${r.startMult}. It was supplied when it `
      + 'was loosed — only the NEXT swing is weak.');
    ok(r.mult === AMMO.AMMO_DRY_MULT && r.dry === true,
      `${A}1b: after the last arrow the run must report the unsupplied multiplier for its remainder`);
    const after = AMMO.spendForSwings(st, 1, c);
    ok(after.spent === 0 && after.startMult === AMMO.AMMO_DRY_MULT,
      `${A}1b: the swing AFTER the stack emptied must spend nothing and run weak `
      + `(spent ${after.spent}, startMult ${after.startMult})`);
    ok((st.inventory[PAID_ARROW] || 0) === 0,
      `${A}1b: the quiver went to ${st.inventory[PAID_ARROW]} — a stack may empty, never go negative`);
    /* R5 through the same door: melee's remainder multiplier is 1, not 0.25. */
    const mst = { equipment: { weapon: meleeLoadout(WHETSTONE).weapon, ammo: WHETSTONE },
                  inventory: {} };
    const mr = AMMO.spendForSwings(mst, 100, { items: ITEMS, fx: {} });
    ok(mr.mult === 1 && mr.startMult === 1 && mr.dry === false,
      `${A}1b: an empty whetstone slot reported mult ${mr.mult} / dry ${mr.dry} — melee takes NO `
      + 'depletion penalty (R5), and a second statement of the fail-soft rule that forgets that is '
      + 'a wrong answer waiting for its first consumer');
    /* AND THE CALL SITE READS THE RIGHT ONE. The two fields differ on exactly
       one swing in a night, so no aggregate fixture can tell them apart — a
       20,454-swing span moves by zero kills either way. The source is the only
       instrument with the resolution, and this file already uses it for the
       same reason AWAY-12 reads `String(window.combatTick)`. */
    ok(/applyAmmoMult\(\s*roll\.maxHit\s*,\s*supply\.startMult\s*\)/.test(COMBAT_SIM_SRC),
      `${A}1b: simulateTick no longer applies supply.startMult to the rolled max hit. Reading `
      + '`supply.mult` there charges the last arrow\'s OWN swing at x0.25 — an off-by-one worth '
      + 'zero kills a night and one very confused bug report.');
  }

  // ── E2. PARITY. Away and live spend the SAME arrows, byte for byte. ───────
  {
    const eqp = rangedLoadout(PAID_ARROW);
    const s = runServer({ equipment: eqp, inventory: fed({ [PAID_ARROW]: STOCK }) });
    const c = clientAwaySpan({
      monsterId: TARGET, equipment: eqp, skills: RANGED_SKILLS, hp: 99, maxHp: 99,
      seed: SEED, fromMs: FROM_MS, toMs: NOW_MS, capped: false,
      inventory: fed({ [PAID_ARROW]: STOCK }),
      /* The client's own auto-eat adapter, driven the same way — otherwise the
         two columns run DIFFERENT-LENGTH nights and the arrow comparison is
         between a 12-hour span and a 3-hour one. */
      traits: { auto_eat: true },
      eat: { enabled: true, threshold: thresholdFromPct(50), foodId: FOOD },
    });
    eq(s.summary.ticks, c.summary.ticks, `${A}2: PARITY tick count differs with ammo equipped`);
    eq(s.summary.kills, c.summary.kills, `${A}2: PARITY kills differ with ammo equipped`);
    eq(serverSpent(s, PAID_ARROW), c.spent[PAID_ARROW],
      `${A}2: PARITY the two paths spent different numbers of arrows. AWAY-1's contract is that a `
      + 'seeded fight is byte-identical live and away, and the quiver is part of the fight.');
    /* THE THIRD OPINION. Both columns above share src/core, so they would agree
       even if the shared half were wrong (TESTING.md fixture rule, instance 1).
       This is the catalogue's own arithmetic, computed here. */
    eq(c.spent[PAID_ARROW], c.summary.ticks * ITEMS[PAID_ARROW].ammoPerShot,
      `${A}2: both engines agree with each other and DISAGREE with the catalogue — `
      + 'ticks x ammoPerShot is the number the pre-flight projection quotes the player');
  }

  // ── E3. RUNNING OUT. Honest degradation, never a negative bag, never zero. ─
  {
    const eqp = rangedLoadout(PAID_ARROW);
    /* ⚠ A FED FIXTURE IS WHAT MAKES "running dry did not kill me" SAYABLE.
       Against an unfed character the death is the FIXTURE's (auto-eat is off by
       default and every parity fixture above dies), so the assertion would be
       about the fixture rather than the system. A supplied character who
       survives the night must still survive it after the quiver empties — that
       is what fail-soft means. */
    /* Enough to cover a visible slice of the night and run out inside it. */
    const supplied = runServer({ equipment: eqp, inventory: fed({ [PAID_ARROW]: STOCK }) });
    const SHORT = Math.floor(supplied.summary.ticks / 4);
    const s = runServer({ equipment: eqp, inventory: fed({ [PAID_ARROW]: SHORT }) });
    ok(supplied.summary.died === false,
      `${A}3: the CONTROL died with a full quiver and 100,000 meals — the fixture is broken, so `
      + 'the dry run below would prove nothing about ammo');
    ok(s.accrued === true, `${A}3: the short-stack fixture accrued nothing (${s.reason})`);
    if (s.accrued) {
      ok(serverSpent(s, PAID_ARROW) === SHORT,
        `${A}3: a stack of ${SHORT} must be spent EXACTLY to zero, not ${serverSpent(s, PAID_ARROW)} — `
        + 'over-billing the night that already went wrong is the one direction that is unforgivable');
      ok(SHORT + (s.delta.items[PAID_ARROW] || 0) === 0,
        `${A}3: the proposed delta would take the quiver NEGATIVE — hr_apply answers `
        + 'insufficient_item, which is not on the DEGRADABLE list and 409s the whole night');
      ok((s.summary.consumed || {})[PAID_ARROW] === SHORT,
        `${A}3: the simulation's own tally disagrees with the delta on a span that ran dry`);
      /* FAIL-SOFT: the span keeps paying. A stall that pays zero for the rest
         of the window is the failure mode the ruling exists to forbid. */
      ok(s.summary.kills > 0 && (s.delta.gold || 0) > 0 && Object.keys(s.delta.xp || {}).length > 0,
        `${A}3: an unsupplied span paid nothing — running dry is FAIL-SOFT (x${0.25} on max hit), `
        + 'not a stop');
      ok(s.summary.died === false,
        `${A}3: running out of arrows killed the character — fail-soft must not become fail-fatal`);
      /* IT MUST ACTUALLY HURT, or the mechanic is decoration. */
      ok(s.summary.kills < supplied.summary.kills,
        `${A}3: the dry span killed ${s.summary.kills} against the supplied span's `
        + `${supplied.summary.kills} — the x0.25 max-hit penalty is not being applied at all`);
      /* THE MOMENT IS STATED, not inferred, and it is the SAME closed form the
         pre-flight projection quotes (§10). */
      ok(s.summary.dryMs === SHORT * s.tickMs,
        `${A}3: summary.dryMs is ${s.summary.dryMs} but the closed form `
        + `fromMs + floor(stock/perShot) x tickMs says ${SHORT * s.tickMs}. §10: "a player who buys `
        + 'exactly what they were quoted must not run dry in the last minute" — the quote and the '
        + 'report have to be one expression.');
      ok(s.summary.dryItemId === PAID_ARROW && s.summary.weakMs > 0,
        `${A}3: the span ran dry and did not name the stack or the time it cost`);
    }
  }

  // ── E4. NO AMMO, AND A FREE RUNG. Nothing spent; the boost tracks the item. ─
  {
    const bare = runServer({ equipment: rangedLoadout(null), inventory: fed({}) });
    ok(!Object.keys(bare.delta.items || {}).some((k) => bare.delta.items[k] < 0 && k !== FOOD),
      `${A}4: a bow with an EMPTY ammo slot proposed a debit — nothing may be spent from a slot `
      + 'that holds nothing');
    ok(Object.keys(bare.summary.consumed || {}).length === 0,
      `${A}4: summary.consumed is not empty for a loadout with no ammo`);

    const free = runServer({
      equipment: rangedLoadout(FREE_ARROW), inventory: fed({ [FREE_ARROW]: 500 }),
    });
    ok(serverSpent(free, FREE_ARROW) === 0,
      `${A}4: the tier-1 rung ${FREE_ARROW} is authored ammoPerShot 0 and must NEVER deplete — `
      + 'a free rung is what makes this mechanic invisible to a new player (§12.2)');
    /* NO AMMO EQUIPPED = NO BOOST. The free rung carries rangeStrB, so it must
       out-kill the empty slot; if it did not, the ammo slot would be paying its
       stats to a player who never equipped anything. */
    ok(free.summary.kills > bare.summary.kills,
      `${A}4: a loadout with ${FREE_ARROW} equipped killed ${free.summary.kills} against `
      + `${bare.summary.kills} with an EMPTY slot — the ammo slot's rangeStrB is reaching a player `
      + 'who has no ammo, which is the cross-style leak in another costume');
    /* ── THE KNOWLEDGE-TAX COUPLING, ENFORCED (security A1) ────────────────
       The empty slot is not penalised today. Flipping `AMMO_EMPTY_SLOT_IS_DRY`
       is a legitimate design call — but flipping it WITHOUT the empty-quiver
       indicator stops the mechanic taxing PREPARATION and starts it taxing
       INFORMATION: an informed player unequips (58 vs 17 maxHit), an uninformed
       one silently eats x0.25 all night with no surface saying why, and it
       lands hardest on the newest players. So the coupling is an IMPLICATION,
       checked against the source rather than restated:

           flag === true   =>   the marker token exists under src/

       NOT a biconditional: the indicator may land FIRST and alone (an
       empty-quiver badge is useful copy while the penalty is off), so
       UI-without-flag stays green. Only penalty-without-sign goes red. The
       marker NAME is read off src/core/ammo.js, so the guard cannot drift from
       the contract it is enforcing. */
    const marker = AMMO.AMMO_DRY_UI_MARKER;
    ok(typeof marker === 'string' && marker.length > 3,
      `${A}4: src/core/ammo.js no longer exports AMMO_DRY_UI_MARKER — the coupling between the `
      + 'penalty and its indicator has lost its anchor, so the check below proves nothing');
    if (typeof marker === 'string' && marker.length > 3) {
      /* TWO CONTROLS, BOTH FIRST, because this check passes forever on a false
         flag and a blind scanner would never be noticed (TESTING.md's fixture
         rule: a nothing-was-found assertion is evidence only when something
         else WAS found in the same run).
           (a) the scanner can see a token that really is out there, and
           (b) it CANNOT see one that only exists inside src/core — which is the
               exclusion that makes the implication falsifiable at all, and the
               exact hole a mutation caught here. */
      ok(srcTreeContains('COMBAT_FX'),
        `${A}4: the source scan cannot find COMBAT_FX under src/ — srcTreeContains is blind, so the `
        + 'coupling check below is decoration');
      ok(!srcTreeContains('AMMO_DRY_UI_MARKER'),
        `${A}4: the source scan is reading src/core/** — it can see AMMO_DRY_UI_MARKER, which only `
        + 'exists in src/core/ammo.js. The coupling would then be satisfied by its own definition '
        + 'and could never go red. Restore the src/core exclusion in srcTreeBlob.');
      const uiExists = srcTreeContains(marker);
      ok(!AMMO.AMMO_EMPTY_SLOT_IS_DRY || uiExists,
        `${A}4: AMMO_EMPTY_SLOT_IS_DRY is TRUE and no rendered surface under src/ carries the `
        + `marker '${marker}'. An unsupplied player now loses three quarters of their max hit with `
        + 'NOTHING on the equip doll or the combat panel telling them why — that taxes KNOWLEDGE '
        + 'rather than preparation, which is not the mechanic the design ruled. Ship the '
        + 'empty-quiver indicator in the SAME build (consumable-economy.md §14, Art Director) or '
        + 'flip the flag back. See the coupling block above the flag in src/core/ammo.js.');
      if (!AMMO.AMMO_EMPTY_SLOT_IS_DRY && uiExists) {
        /* Not a failure — the honest ordering. Printed so the flip is not
           forgotten once the surface it was waiting on exists. */
        ammoGuard.notes = (ammoGuard.notes || []).concat(
          `the empty-quiver indicator ('${marker}') has landed and AMMO_EMPTY_SLOT_IS_DRY is still `
          + 'false — the design call is now unblocked');
      }
    }
  }

  // ── E5. MELEE. The whetstone burns; the empty slot still costs nothing. ────
  {
    const eqp = meleeLoadout(WHETSTONE);
    const per = ITEMS[WHETSTONE].ammoPerShot;
    const s = runServer({
      equipment: eqp, skills: MAXED, inventory: fed({ [WHETSTONE]: STOCK }),
    });
    ok(s.accrued === true, `${A}5: the melee fixture accrued nothing (${s.reason})`);
    if (s.accrued) {
      const want = Math.floor(s.summary.ticks * per + 1e-9);
      ok(want > 100, `${A}5: only ${want} stones owed — too short a span to prove a fractional rate`);
      ok(serverSpent(s, WHETSTONE) === want,
        `${A}5: ${s.summary.ticks} sword swings at ammoPerShot ${per} owe ${want} ${WHETSTONE}, `
        + `and the delta says ${serverSpent(s, WHETSTONE)}. R5 gives melee a FREE FLOOR, not a free `
        + 'CEILING: a whetstone that is never consumed is a permanent +strB for nothing, which is '
        + 'the faucet §6.3 priced at 15,840 g a night. `styleSpendsAmmo` and `styleNeedsAmmo` are '
        + 'two tables precisely so this half of R5 can be true.');
      /* MELEE TAKES NO DEPLETION PENALTY (R5), with an empty slot or no slot. */
      const dryMelee = runServer({ equipment: eqp, skills: MAXED, inventory: fed({}) });
      const noSlot = runServer({ equipment: meleeLoadout(null), skills: MAXED, inventory: fed({}) });
      ok(dryMelee.summary.weakMs === 0 && noSlot.summary.weakMs === 0,
        `${A}5: a melee span reported unsupplied time (${dryMelee.summary.weakMs}ms / `
        + `${noSlot.summary.weakMs}ms) — R5 is explicit that melee's floor is free, because the `
        + 'starting weapon is a Bronze Sword and a paid floor would put every brand-new character '
        + 'in the penalty state from second one');
      ok(serverSpent(dryMelee, WHETSTONE) === 0,
        `${A}5: an EMPTY whetstone slot was still billed — a stack of zero cannot be spent`);
      /* ── THE STATED LIMITATION, PINNED SO CHANGING IT IS DELIBERATE ────────
         `equipmentStats` sums the ammo slot's stats off the EQUIPMENT MAP, and
         the slot is a POINTER (§2.2) that survives its stack hitting zero. So
         an emptied whetstone still pays its +strB, and a melee player can burn
         one stone and keep the bonus forever. That is not a regression — before
         E1 the stone was never consumed at all — but it IS the half of R5's
         "melee's ceiling is paid" that consumption alone does not close, and
         closing it means teaching the STAT layer about stock, which is a change
         to the one function both engines share. Handed to the Designer with the
         arithmetic; these two assertions are what a fix would flip. */
      eq(dryMelee.summary.kills, s.summary.kills,
        `${A}5: spending stones changed the fight. It must not — consumption is a cost, not a `
        + 'combat input. (If this went red because an emptied slot now loses its stats, that is '
        + 'the deliberate fix landing: update this pin.)');
      ok(dryMelee.summary.kills > noSlot.summary.kills,
        `${A}5: an emptied whetstone stopped paying its strB. That is the RIGHT end state and it `
        + 'is not what ships today — see the block above before changing this line.');
    }

    /* ── E5b. THE INVARIANT: **EQUIPPED DOES NOT IMPLY HELD** (security A2) ──
       Pinned as a PROPERTY OF THE SYSTEM, not as a stat outcome, because this
       branch is what makes it arise from ordinary play for the first time. The
       ammo slot is a POINTER by ruling (§2.2) and the fight now spends what it
       points at, so "a populated slot naming an item the bag no longer holds"
       stops being an impossible state and becomes the ordinary end of any night
       that outlasts its supply.

       Driven through the REAL engine to zero rather than hand-built, because a
       hand-built `{equipment:{ammo:x}, inventory:{}}` would prove the shape is
       representable, not that play produces it. That distinction is the whole
       point of the pin: future code may not assume equipped ⇒ held, and the
       reason it may not is that the engine manufactures the counter-example. */
    {
      const eqp = meleeLoadout(WHETSTONE);
      const per = ITEMS[WHETSTONE].ammoPerShot;
      const full = runServer({ equipment: eqp, skills: MAXED, inventory: fed({ [WHETSTONE]: STOCK }) });
      const SHORT = Math.max(1, Math.floor(full.summary.ticks * per / 4));
      const out = runServer({ equipment: eqp, skills: MAXED, inventory: fed({ [WHETSTONE]: SHORT }) });
      ok(out.accrued === true, `${A}5b: the short-stone fixture accrued nothing (${out.reason})`);
      if (out.accrued) {
        // (a) ORDINARY PLAY EMPTIES THE STACK — the state is produced, not posited.
        ok(serverSpent(out, WHETSTONE) === SHORT && SHORT + (out.delta.items[WHETSTONE] || 0) === 0,
          `${A}5b: the span did not spend the stone stack to exactly zero `
          + `(${serverSpent(out, WHETSTONE)} of ${SHORT}) — without that this pin is about a `
          + 'hand-built object rather than about the game');
        // (b) NOTHING UNEQUIPS. The pointer outlives the stack, deliberately.
        ok(!('equipment' in out.delta),
          `${A}5b: the accrual proposed an EQUIPMENT key. Running out of a consumable must never `
          + 'rearrange a loadout behind the player — the pointer is meant to outlive the stack, and '
          + 'an engine that silently unequipped overnight is a worse surprise than the empty slot.');
        // (c) SO THE STATE IS: slot populated, bag empty. Say it in one object.
        const after = AMMO.readAmmo({ equipment: eqp, inventory: {} }, { items: ITEMS });
        ok(after.id === WHETSTONE && after.stock === 0,
          `${A}5b: readAmmo does not report the equipped-but-not-held state as `
          + `{id:'${WHETSTONE}', stock:0} — it is the ONE reader that answers "what is loaded" and `
          + '"how much is left" together, and every consumer is meant to ask it instead of reading '
          + 'the equipment map and guessing');
        // (d) AND THE STATS DO NOT KNOW. Documented, not accidental.
        const withStone = equipmentStats(eqp, ITEMS).strB;
        const without = equipmentStats(meleeLoadout(null), ITEMS).strB;
        ok(withStone > without,
          `${A}5b: equipmentStats stopped paying an equipped item's stats. If that is the deliberate `
          + '"teach the stat layer about stock" fix landing, this whole block is the expected diff '
          + '— update it and the note above equipmentStats in src/core/combat.js together.');
        ok(srcTreeBlobCore().indexOf('EQUIPPED DOES NOT IMPLY HELD') !== -1,
          `${A}5b: the non-guarantee is no longer stated at equipmentStats. This invariant is only `
          + 'safe while it is WRITTEN DOWN where the function is read — a test that knows it and a '
          + 'reader who does not is how the next author assumes equipped ⇒ held.');
      }
    }
  }

  // ── E6. THE CARRY. Deterministic, continuous across spans, self-configuring. ─
  {
    const eqp = meleeLoadout(WHETSTONE);
    const withCol = runServer({
      equipment: eqp, skills: MAXED, inventory: fed({ [WHETSTONE]: STOCK }), ammoCarry: {},
    });
    ok(withCol.delta.ammo_carry && typeof withCol.delta.ammo_carry === 'object',
      `${A}6: with the column present the engine must PROPOSE ammo_carry — without it a 90-second `
      + 'attended settle drops the fraction every time and a 0.02 consumable is free forever');
    const carried = Number((withCol.delta.ammo_carry || {})[WHETSTONE]);
    ok(Number.isFinite(carried) && carried >= 0 && carried < 1,
      `${A}6: the proposed carry ${carried} is outside [0,1) — hr_apply refuses it as `
      + 'bad_tool_carry and the refusal costs the player the whole window');

    const noCol = runServer({
      equipment: eqp, skills: MAXED, inventory: fed({ [WHETSTONE]: STOCK }), ammoCarry: null,
    });
    ok(!('ammo_carry' in noCol.delta),
      `${A}6: the engine proposed ammo_carry with NO column — hr_apply answers unknown_delta_key `
      + 'and 409s the night. The column\'s presence IS the switch (the tool_carry idiom).');
    /* THE COST OF THE GAP, ASSERTED RATHER THAN ASSUMED: an INTEGER perShot is
       exact with or without the column, because the carry lands on 0 every
       swing. That is why the reported bug (arrows) is fully fixed today and
       only the fractional rung waits on SQL. */
    const arrowCol = runServer({
      equipment: rangedLoadout(PAID_ARROW), inventory: fed({ [PAID_ARROW]: STOCK }), ammoCarry: {},
    });
    const arrowNoCol = runServer({
      equipment: rangedLoadout(PAID_ARROW), inventory: fed({ [PAID_ARROW]: STOCK }), ammoCarry: null,
    });
    ok(serverSpent(arrowCol, PAID_ARROW) === serverSpent(arrowNoCol, PAID_ARROW),
      `${A}6: an integer ammoPerShot spent differently with and without the carry column `
      + `(${serverSpent(arrowCol, PAID_ARROW)} vs ${serverSpent(arrowNoCol, PAID_ARROW)}) — it must `
      + 'not, and the claim that arrows are exact today rests on it');

    /* ── CONTINUITY: WHY THE COLUMN IS NOT OPTIONAL FOR A FRACTIONAL RUNG ───
       Two consecutive half-spans with the carry THREADED must charge what one
       whole span charges. Run with the carry DROPPED between them — which is
       exactly what a database without the column does — and the fraction is
       forgiven at every boundary. At the live 90-second settle cadence that is
       ~37 swings per window against a 50-swing stone, i.e. ZERO stones, forever.
       This is the arithmetic behind the known limitation, asserted rather than
       asserted-about. Split spans are run with `AWAY_RATE_MULT` untouched, so
       the two halves are the same fight the whole span is. */
    const halfMs = SPAN_MS / 2;
    const runHalf = (fromMs, toMs, carry, stock) => serverAccrual({
      activeId: TARGET, skills: MAXED, hp: 99, maxHp: 99,
      autoEatEnabled: true, autoEatFood: FOOD, autoEatPct: 50,
      equipment: eqp, inventory: fed({ [WHETSTONE]: stock }), ammoCarry: carry,
      accruedToMs: fromMs, activeSinceMs: fromMs, nowMs: toMs, capMs: halfMs,
    });
    const h1 = runHalf(FROM_MS, FROM_MS + halfMs, {}, STOCK);
    const threaded = runHalf(FROM_MS + halfMs, NOW_MS, h1.delta.ammo_carry, STOCK - serverSpent(h1, WHETSTONE));
    const dropped = runHalf(FROM_MS + halfMs, NOW_MS, {}, STOCK - serverSpent(h1, WHETSTONE));
    const oneSpan = serverSpent(withCol, WHETSTONE);
    const twoThreaded = serverSpent(h1, WHETSTONE) + serverSpent(threaded, WHETSTONE);
    const twoDropped = serverSpent(h1, WHETSTONE) + serverSpent(dropped, WHETSTONE);
    ok(Math.abs(twoThreaded - oneSpan) <= 1,
      `${A}6: two threaded half-spans spent ${twoThreaded} against one whole span's ${oneSpan}. `
      + 'A carry that is threaded must make the split invisible — that is the entire reason it '
      + 'exists (src/core/ammo.js advanceAmmoCarry, and src/core/tools.js before it).');
    ok(twoDropped <= twoThreaded,
      `${A}6: DROPPING the carry between spans charged MORE (${twoDropped} vs ${twoThreaded}). `
      + 'The gap must only ever under-charge — over-billing a player for a database column they '
      + 'do not have is the one direction with no defence.');
  }

  // ── E7. THE FAMILY DERIVATION AGREES WITH equipmentStats, EVERY WEAPON. ────
  {
    let checked = 0;
    for (const [id, it] of Object.entries(ITEMS)) {
      if (!it || it.type !== 'weapon' || !it.weaponType) continue;
      checked++;
      const derived = AMMO.weaponTypeOf({ equipment: { weapon: id } }, { items: ITEMS });
      const canonical = equipmentStats({ weapon: id }, ITEMS).weaponType;
      if (derived !== canonical) {
        ok(false, `${A}7: weaponTypeOf says '${derived}' for ${id} and equipmentStats says `
          + `'${canonical}'. Two readings of one catalogue field is exactly the drift this `
          + 'codebase has paid for eleven times.');
        break;
      }
    }
    ok(checked > 20, `${A}7: only ${checked} weapons walked — the catalogue scan is broken`);
    ok(AMMO.weaponTypeOf({}, { items: ITEMS }) === 'neutral',
      `${A}7: an unarmed state must read 'neutral' — an unarmed player looses no arrow`);
    ok(AMMO.weaponTypeOf({ equipment: { weapon: 'x' } }, { items: ITEMS, weaponType: 'magic' }) === 'magic',
      `${A}7: an explicit ctx.weaponType must WIN — the pre-flight projection asks about a `
      + 'hypothetical loadout it holds in its hand, not about state.equipment');
  }

  // ── E8. THE CLIENT SINK, AND ITS HOLD. ────────────────────────────────────
  /* legacy.js is a classic script; node cannot execute it, and the browser
     suite cannot see a missing line that only matters ninety seconds later. So
     the contract is asserted against the source, which is the same instrument
     AWAY-12 uses on the same file for the same reason.

     THE HOLD IS THE HALF THAT GETS FORGOTTEN. `reconcileInventory` takes
     `Math.max(have, q)` off every envelope, and the envelope in flight when a
     swing happens names the PRE-swing count — so a debit with no hold is
     RESTOCKED by construction. That is the live P0 Paione reported four times
     about food ("everytime i use 1 it returns back in my inventory"), and
     pending-consume.js's own header names ammunition as the next consumer.
     A 20,454-arrow night with no hold spends nothing that survives. */
  {
    const src = readFileSync(join(ROOT, 'src', 'legacy.js'), 'utf8');
    const at = src.indexOf('  removeItem:function(id,qty){');
    ok(at > 0,
      `${A}8: legacy.js COMBAT_FX has no removeItem handler. A missing fx handler is a silent `
      + 'no-op in combat-sim.js, so the live client would spend nothing and only the away path '
      + 'would drain the quiver — the exact two-loops-drift class the one-loop mandate exists for.');
    if (at > 0) {
      const body = src.slice(at, at + 900);
      ok(/removeItem\(id,take\)/.test(body),
        `${A}8: the client sink does not move the bag — the quiver would only appear to drain when `
        + 'the settle lands, up to ninety seconds after the shot');
      ok(/noteItemConsumed\(id,take,\{send:false\}\)/.test(body),
        `${A}8: the client sink does not record a pending-consume HOLD. Without it the next `
        + 'envelope RESTOCKS every arrow spent since it was built (accrue.js reconcileInventory '
        + 'takes Math.max(have, q)) — the food-restock P0 with a different item id.');
      ok(!/queueEatIntent|_sendEatNow/.test(body),
        `${A}8: the client sink sends an intent. There is no spend-ammo verb and there must not `
        + 'be one — consumption rides the accrual the server already computes (§13.1: no new '
        + 'client-reported value, no new trusted input, no new intent id namespace).');
    }
    /* AND THE CARRY HAS A HOME. `G.ammoCarry` is written by src/core/ammo.js on
       every fractional swing; a field the game writes and no mechanism homes is
       STRANDED under the arm and resets on every reload — which for a carry
       means a fractional consumable is free to anyone who refreshes. */
    const cs = readFileSync(join(ROOT, 'src', 'net', 'client-state.js'), 'utf8');
    ok(/'ammoCarry'/.test(cs),
      `${A}8: ammoCarry is not in RESIDUE_FIELDS. src/core/ammo.js writes it into G on every `
      + 'fractional swing, so without a home it resets on every reload and a 0.02 consumable '
      + 'becomes free to anyone who refreshes (the b462/b466 strand class).');
  }
}

/* THE MUTATION SEAM. `computeAccrualInputParity` is exported for the same
   reason: a guard whose failures cannot be reproduced in isolation is a guard
   nobody mutation-proves, and `runAll` costs a network round trip. This runs the
   consumption block alone and hands back its problems. */
export function ammoGuardProblems() {
  const before = problems.length;
  ammoGuard();
  return problems.splice(before);
}

export async function runAll() {
  problems.length = 0;
  parityGuard();
  ammoGuard();
  creditWindowGuard();
  autoEatParityGuard();
  attendedSettleAutoEatGuard();
  gatherParityGuard();
  gatherBuffTimelineGuard();
  toolCarryContinuityGuard();
  hostileGuard();
  await shapeGuard();
  requestGuard();
  await settableKindsGuard();
  for (const p of await computeAccrualInputParity(FN_DIR)) problems.push(p);
  await shellGuard();
  await autoEatDriftGuard();
  await clampGuard();
  await dayBudgetGuard();
  await combatXpDayCeilingGuard();
  await deployGuard();
  await packerGuard();
  return problems.slice();
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const found = await runAll();
  if (found.length) {
    console.log('Accrual engine guard — FAILED:');
    for (const p of found) console.log('  x ' + p);
    process.exit(1);
  }
  const s = serverAccrual();
  console.log('Accrual engine guard — server parity with the client, hostile inputs inert.');
  /* Printed on every run, deliberately. A headroom number nobody sees is a
     number nobody notices tightening. */
  for (const line of clampGuard.report || []) console.log(`  clamp headroom: ${line}`);
  for (const line of dayBudgetGuard.report || []) console.log(`  day-budget headroom: ${line}`);
  if (combatXpDayCeilingGuard.report) console.log(`  combat-xp ceiling: ${combatXpDayCeilingGuard.report}`);
  /* ⚠ THE ACCEPTED RESIDUAL, PRINTED ON EVERY RUN. Security ruled the
     ammunition lane may exceed c_max_item_delta pending a yield decision; a
     residual nobody can see the size of is a residual nobody re-examines. */
  for (const line of clampGuard.ammo || []) console.log(`  ⚠ ammo residual: ${line}`);
  /* And the 24h FORECAST — not asserted (the reachable cap is
     ${REACHABLE_CAP_H}h), printed so a cap raise starts from a number rather
     than from a player's bug report. */
  for (const line of clampGuard.forecast || []) console.log(`  forecast @24h: ${line}`);
  for (const line of dayBudgetGuard.forecast || []) console.log(`  forecast @24h day-budget: ${line}`);
  console.log(`  spans: blocking arm at the reachable cap ${REACHABLE_CAP_H}h `
    + `(hr_offline_cap_ms base + every bump); forecast at ${FORECAST_CAP_H}h (its fuse ceiling). `
    + `day budgets read from ${dayBudgetGuard.source}.`);
  for (const line of toolCarryContinuityGuard.report || []) console.log(`  ${line}`);
  /* The gather fixtures, printed. A parity number nobody sees is a number
     nobody notices moving — the same reason the clamp headroom is printed. */
  for (const f of GATHER_FIXTURES) {
    const skill = f.skill || GATHER_INDEX[f.node].skill;
    const nodeId = f.node || FISH_SPOTS[FISH_SPOTS.length - 1].id;
    const toolId = f.tool ? bestOwnedTool(skill) : null;
    const g = computeAccrual({
      userId: '00000000-0000-4000-8000-000000000001', slot: 0,
      nowMs: NOW_MS, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
      activeKind: 'gather', activeId: nodeId, capMs: 12 * 3600000, seed: SEED,
      hp: 60, maxHp: 60, gold: 0, skills: { ...GATHER_MAXED }, equipment: EQUIPMENT,
      inventory: toolId ? { [toolId]: 1 } : {},
      autoEatEnabled: false, autoEatFood: null, autoEatPct: 0, toolCarry: {},
      items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX,
    });
    console.log(`  gather: ${nodeId} (${skill}${toolId ? ' + ' + toolId : ''}) · ${g.tickMs}ms · `
      + `${g.summary.ticks} actions · ${JSON.stringify(g.summary.items)} · `
      + `${JSON.stringify(g.summary.xp)} · +${g.summary.toolDoubles} tool doubles`);
  }
  console.log(`  fixture: ${MONSTER} · ${SPAN_MS / 3600000}h · tick ${s.tickMs}ms · ` +
    `${s.summary.ticks} ticks · ${s.summary.kills} kills · ${s.summary.crits} crits · ` +
    `${s.summary.gold}g · ${Object.keys(s.summary.xp).length} skills · ` +
    `${s.summary.segments.length} UTC segments`);
}
