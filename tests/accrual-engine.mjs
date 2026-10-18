// ============================================================================
// tests/accrual-engine.mjs — the SERVER ACCRUAL guard.
//
// Three claims, all mechanical, none of them provable from a browser:
//
//   1. PARITY (the contract). A GATHER / ARTISAN / CREW span computed by the
//      SERVER engine (supabase/functions/hr-accrue/accrual.js) is identical —
//      ticks, every XP grant, every item — to the same span computed the way
//      the CLIENT computes it, for the same state and the same seed. (The
//      combat half left with the away combat path, lane C2: a fight is a hunt
//      session, and its parity is tests/hunt-sessions-settle.mjs TICK-1.) If these two ever diverge, the server and the
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
import { readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { COMBAT_BALANCE, equipmentStats } from '../src/core/combat.js';
import { createRng } from '../src/core/rng.js';
import { grantXp, resolveGatherAction } from '../src/core/progression.js';
import { COMBAT_STYLES } from '../src/core/styles.js';
/* The gather half. `simulateSkillSpan` is imported for the BUFF TIMELINE
   section only — the parity section deliberately does NOT use it (see its
   header: the client column there is a transcription of legacy.js). */
import {
  indexGatherNodes, duplicateGatherIds, simulateSkillSpan,
} from '../src/core/skill-sim.js';
import { bestTool, toolSpeed, toolXpB, toolDouble } from '../src/core/tools.js';
import { pacedActionMs, speedClamp } from '../src/core/pacing.js';
import { nextBuffExpiryMs, hasActiveBuff, tickBuffs, buffBonusFor } from '../src/core/buffs.js';
import { levelOf, xpForLevel } from '../src/core/xp.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { TREES, ROCKS, FISH_SPOTS } from '../src/data/gathering.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { indexArtisanRecipes, benchPayable } from '../src/core/artisan-sim.js';

import {
  computeAccrual, deriveTickMs, zeroBonus, accrueWorkers,
  ACCRUE_MIN_MS, ACCRUE_MAX_SPAN_MS, WORKER_ACCRUE_CAP_MS,
} from '../supabase/functions/hr-accrue/accrual.js';
/* CREW-BACKLOG reads the crew's rate from the SHARED model both engines import,
   never from a number retyped here: a retuned efficiency curve must retune the
   expectation, not turn the guard red. */
import { workerTickMs } from '../src/core/workers.js';
import { parseIntent, readSlot, MAX_SLOT, INTENT_KEYS } from '../supabase/functions/hr-accrue/request.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const FN_DIR = join(ROOT, 'supabase', 'functions', 'hr-accrue');

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const eq = (a, b, msg) => {
  const A = JSON.stringify(a); const B = JSON.stringify(b);
  if (A !== B) problems.push(`${msg}\n      server: ${A}\n      client: ${B}`);
};

// ── The fixture ─────────────────────────────────────────────────────────────
// Real items, a real absence. MONSTER survives only as the "a fight outside a
// hunt session is refused" probe in the hostile section (lane C2).

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
// The COMBAT client reference (clientAwaySpan, the away-combat parity, the
// credited window, Auto-Eat, the recovery ladder, the Retreat, the receipt
// level-ups, the charm and the away-ammo arms) left with the combat path it
// compared against: closed rebuild, lane C2. A fight is a hunt session, priced
// by ONE engine (combat-sim.js simulateHuntInstance, lane S1) and guarded by
// tests/hunt-sessions-settle.mjs (TICK-1 split-settle parity, attended and away)
// and tests/hunt-core/*. What stays here is the gather / artisan / crew engine and the shell.

// ── Server call helper ──────────────────────────────────────────────────────
/* A GATHERING night (closed rebuild, lane C2): a fight outside a hunt session
   is refused `hunt_required`, so the hostile-input and shape baselines run on
   the payable kind the away path still prices. */
const BASE_NODE = 'mithril_rock';
function serverAccrual(over) {
  return computeAccrual({
    userId: '00000000-0000-4000-8000-000000000001',
    slot: 0,
    nowMs: NOW_MS,
    accruedToMs: FROM_MS,
    activeSinceMs: FROM_MS,
    activeKind: 'gather',
    activeId: BASE_NODE,
    capMs: 12 * 3600000,
    seed: SEED,
    hp: 60, maxHp: 60, gold: 1234,
    skills: { ...baseSkills(), ...GATHER_MAXED },
    equipment: EQUIPMENT,
    items: ITEMS,
    monsters: MONSTERS,
    nodes: GATHER_INDEX,
    ...over,
  });
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
      inventory, toolCarry: {},
      items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX,
    });
    eq(again.summary.items, s.summary.items, P('the same seed produced a different yield'));
    if (node.qty[1] > node.qty[0]) {
      const other = computeAccrual({
        userId: '00000000-0000-4000-8000-000000000001', slot: 0,
        nowMs: NOW_MS, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
        activeKind: 'gather', activeId: nodeId, capMs: 12 * 3600000, seed: SEED + 1,
        hp: 60, maxHp: 60, gold: 0, skills: { ...GATHER_MAXED }, equipment: EQUIPMENT,
        inventory, toolCarry: {},
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
    inventory,
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
    activeKind: 'gather', activeId: BASE_NODE, capMs: Number.MAX_SAFE_INTEGER,
    seed: SEED, hp: 60, maxHp: 60, skills: { ...baseSkills(), ...GATHER_MAXED }, equipment: EQUIPMENT,
    items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX,
  });
  ok(bigCap.accrued && bigCap.grantMs === SPAN_MS,
    `HOSTILE: an unbounded capMs granted ${bigCap.grantMs}ms, expected the real elapsed ${SPAN_MS}ms`);

  const longAbsence = computeAccrual({
    nowMs: NOW_MS, accruedToMs: NOW_MS - 400 * 86400000, activeSinceMs: NOW_MS - 400 * 86400000,
    activeKind: 'gather', activeId: BASE_NODE, capMs: Number.MAX_SAFE_INTEGER,
    seed: SEED, hp: 60, maxHp: 60, skills: { ...baseSkills(), ...GATHER_MAXED }, equipment: EQUIPMENT,
    items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX,
  });
  ok(longAbsence.grantMs <= ACCRUE_MAX_SPAN_MS,
    `HOSTILE: a 400-day absence with a broken cap granted ${longAbsence.grantMs}ms — the absolute fuse did not hold`);

  // The cap is real: an 18h absence at a 12h cap pays exactly 12h and reports it.
  const capped = computeAccrual({
    nowMs: NOW_MS, accruedToMs: NOW_MS - 18 * 3600000, activeSinceMs: NOW_MS - 18 * 3600000,
    activeKind: 'gather', activeId: BASE_NODE, capMs: 12 * 3600000,
    seed: SEED, hp: 60, maxHp: 60, skills: { ...baseSkills(), ...GATHER_MAXED }, equipment: EQUIPMENT,
    items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX,
  });
  ok(capped.grantMs === 12 * 3600000, `CAP: 18h absence at a 12h cap granted ${capped.grantMs}ms`);
  ok(capped.capped === true, 'CAP: a capped grant did not report capped:true');
  ok(capped.delta.accrued_to === new Date(NOW_MS).toISOString(),
    'CAP: a capped grant must still advance the watermark to now — otherwise the cap is drainable in instalments');

  // active_since clamps too, so a stale watermark after a forgotten
  // `accrued_to` on start_activity cannot mint a night.
  const staleWatermark = computeAccrual({
    nowMs: NOW_MS, accruedToMs: NOW_MS - 11 * 3600000,
    activeSinceMs: NOW_MS - 30 * 60000,          // the gather started 30 minutes ago
    activeKind: 'gather', activeId: BASE_NODE, capMs: 12 * 3600000,
    seed: SEED, hp: 60, maxHp: 60, skills: { ...baseSkills(), ...GATHER_MAXED }, equipment: EQUIPMENT,
    items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX,
  });
  ok(staleWatermark.grantMs === 30 * 60000,
    `WATERMARK: a stale accrued_to paid ${staleWatermark.grantMs}ms for a gather that is 30 minutes old`);

  // A clock that has not moved, or has moved backwards, grants nothing.
  for (const [name, over] of [
    ['no elapsed time', { accruedToMs: NOW_MS }],
    ['a future watermark', { accruedToMs: NOW_MS + 86400000 }],
    ['a sub-threshold absence', { accruedToMs: NOW_MS - (ACCRUE_MIN_MS - 1) }],
    ['a zero cap', { capMs: 0 }],
    ['a negative cap', { capMs: -1 }],
    ['a NaN cap', { capMs: NaN }],
    ['an idle character', { activeKind: 'idle', activeId: null }],
    ['a fight outside a hunt session', { activeKind: 'combat', activeId: MONSTER }],
    ['an unknown node', { activeId: 'not_a_node' }],
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
  ok(s.delta.journal?.kind === 'gather' && s.delta.journal?.intent === 'accrue',
    'SHAPE: the journal row must name kind=gather / intent=accrue');
  /* ── THE JOURNAL META: AN ALLOWLIST, NOT A COUNT (rewritten 2026-09-18) ────
     This was `Object.keys(meta).length <= 8` measured on ONE sample, and the
     sample was an away window with neither an attended split nor a consumable
     burn — so the bound was never exercised against the shape it was written
     for. The combat meta's WORST case on 2026-09-18 is
       ms, ticks, kills, capped, ate, att, spent, w, from, to  = TEN keys,
     and it was NINE before `w` landed. A count that a real row can exceed while
     the guard passes is not a bound; an ALLOWLIST is, because a per-kill log
     cannot be spelled without a key that is not on it. Both are asserted: an
     unknown key fails, and so does a row longer than the enumerated list.

     WHY THE NUMBER MAY MOVE FROM 9 TO 10, with the arithmetic rather than a
     shrug. The rule this guard enforces is "aggregate, never per-tick"
     (game_events: 1.6M rows / 229 MB from six players in four days). `w` adds
     NO ROWS - it is a <=24-byte scalar on a row that already exists, and it is
     OMITTED when both its terms are zero, i.e. on every window with no death
     and no idle time. Measured cadence: the 14-day production read behind
     tests/fixtures/world-tick-real-windows.json is ~1.7k accrue rows for 5
     users, i.e. ~24 rows/user/day. At 100x the live player base (500 active)
     that is ~12k accrue rows/day; if EVERY one carried the widest form the
     ceiling is ~290 KB/day (~105 MB/year), and the real figure is a small
     fraction of that. The bound that matters - rows - is unchanged.

     ⚠ The next key gets the same treatment: add it to META_KEYS with its
       byte-and-rows arithmetic, or nest it inside an existing one the way
       `att` is. Never just raise a number. */
  /* ELEVENTH KEY, 2026-09-22: `stopped`. Added WITH the arithmetic this block's
     own closing note demands, never by raising a number.
       WHAT IT IS: the name of the hunt stop rule that ended the run — one of
       six short strings ('falls', 'bag_full', 'food_floor', 'ammo_floor',
       'hours', 'ammo_dry'), at most 11 bytes.
       ROWS ADDED: ZERO. It is a scalar on a row that already exists, and the
       rule this guard enforces is "aggregate, never per-tick" (game_events:
       1.6M rows / 229 MB from six players in four days).
       BYTES: OMITTED on every window that did not stop, i.e. on all of them but
       the LAST of a hunt. A hunt is at least an hour and settles at the ~90 s
       attended cadence, so fewer than 1 in 40 combat rows can carry it even in
       the worst case. Against the measured ~24 accrue rows/user/day, at 100x
       the live player base (500 active) that is at most ~300 rows/day x 11
       bytes = ~3 KB/day. The bound that matters — rows — is unchanged.
       WHY NOT NESTED: `att` is nested because it is four related integers;
       this is one scalar, and nesting a single value inside an object to keep a
       count down would be the number-raising this note forbids, wearing a hat.
     The next key gets the same treatment. */
  /* TWELFTH KEY, 2026-10-10: `mon`. Added WITH the arithmetic, never by
     raising a number.
       WHAT IT IS: the monster id of the pointer the window settled (one
       pointer per window, so one id per row). Rally points weight a kill by
       its tier (2026-10-10-rally-points-server.sql) and this row is the only
       server record of which monster a window's kills were.
       ROWS ADDED: ZERO. A scalar on a row that already exists.
       BYTES: ids are <= ~24 bytes (sliced to 64). Against the measured ~24
       accrue rows/user/day, at 100x the live player base (500 active) that is
       ~12k rows/day x ~30 bytes = ~360 KB/day (~130 MB/year) at the ceiling
       if every row were combat; the bound that matters — rows — is unchanged.
       WHY NOT NESTED: one scalar; nesting it to keep a count down would be the
       number-raising this note forbids, wearing a hat.
     The next key gets the same treatment. */
  /* THIRTEENTH KEY, 2026-10-13: `km` (lane C1, Security C3). Added WITH the
     arithmetic, never by raising a number.
       WHAT IT IS: a NAMED HUNT's kills by monster ({id: n}); `mon` is the area
       id on those rows, so rally points need the per-monster split to price
       each kill at its server tier (2026-10-20-hunts-rally-kills.sql).
       ROWS ADDED: ZERO. A flat map of integers on a row that already exists.
       BYTES: one entry per spawn (<= 3 today, ~20 bytes each), OMITTED on every
       training row. At 100x (500 active, ~12k accrue rows/day) the ceiling if
       EVERY row were a hunt is ~12k x 60 bytes = ~720 KB/day; rows unchanged.
       WHY NOT NESTED: it is already one object, the `spent` shape. */
  /* THE GATHER ROW'S ALLOWLIST (lane C2: the shape baseline is a gathering
     night now; the combat row's keys above — `kills`, `ate`, `mon`, `km`,
     `att`, `spent`, `stopped` — are the hunt settle's, journalled by
     hr_hunt_apply). Same rule: a new key comes with its rows-and-bytes
     arithmetic, never a raised number. */
  const META_KEYS = ['ms', 'ticks', 'qty', 'capped', 'node', 'skill', 'w', 'from', 'to'];
  const metaProblems = (m) => {
    const out = [];
    if (typeof m !== 'object' || m === null || Array.isArray(m)) return ['meta is not an object'];
    const keys = Object.keys(m);
    for (const k of keys) if (!META_KEYS.includes(k)) out.push(`unknown meta key '${k}'`);
    if (keys.length > META_KEYS.length) out.push(`${keys.length} keys > ${META_KEYS.length}`);
    return out;
  };
  /* MUTATION PROOF, INLINE AND ALWAYS RUN. A guard that has never been red is
     not a guard: the two shapes it exists to refuse are a per-kill log (an
     unknown key) and an over-long row. If either of these came back clean the
     assertion below would be decoration. */
  ok(metaProblems({ ...s.delta.journal.meta, kill_log: [1, 2, 3] }).length > 0,
    'SHAPE-selftest: the meta checker accepted a per-kill log key — it is not checking anything');
  ok(metaProblems(Object.fromEntries(META_KEYS.concat('extra').map((k) => [k, 1]))).length > 0,
    'SHAPE-selftest: the meta checker accepted a row longer than its own allowlist');
  ok(metaProblems(s.delta.journal?.meta).length === 0,
    `SHAPE: the journal meta must be an aggregate, not a per-kill log (game_events: 1.6M rows from six players): ${metaProblems(s.delta.journal?.meta).join('; ')}`);
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
  /* ── RETREAT-W8's PROVENANCE HALF, INVERTED (lane C2) ─────────────────────
     The attended kill ledger was the ONE input that could make `resolveKill`
     run outside the simulation. It is GONE (ruling HR-2026-10-14 §3: the
     attended top-up and hr_credit_kills are deleted), so the shell may not pass
     an `attended` value at all, and may not read hr_attended_kills: a revived
     door is a client-claimed kill count reaching the engine again. */
  ok(!/attended\s*:\s*[A-Za-z_$]/.test(shellCode),
    'SOURCE: index.ts passes an `attended` value to the engine again — the attended top-up is deleted');
  ok(!/hr_attended_kills/.test(shellCode),
    'SOURCE: index.ts reads hr_attended_kills again — the attended kill ledger is deleted');
  /* AND THE COUNTER ITSELF IS NEVER CLIENT-SOURCED. `consecFalls` is seeded
     from hr_state_of's projection and proposed back; an assignment reading the
     parsed intent would be the same defect one field over. */
  ok(!/consecFalls\s*:\s*(intent|body|req|payload)\b/.test(shellCode),
    'SOURCE: index.ts seeds consecFalls from the request — the retreat counter is server-owned');
  /* 2026-10-10 presence horizon: the accrue span cap is hr_accrue_cap_ms — hr_offline_cap_ms
     bounded by the last real return + cap (2026-10-10-world-tick-presence-horizon.sql). Reading
     the raw cap here would pay a ticked absence twice, so the raw read is RED too. */
  ok(/hr_accrue_cap_ms\(/.test(shellCode) && !/public\.hr_offline_cap_ms\([^)]*\)\s*as cap_ms/.test(shellCode),
    'SOURCE: the cap must be read from Postgres (hr_accrue_cap_ms, the horizon-aware cap), not computed in the engine');
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
  /* THE HYDRATION HALF OF THE SHELL (2026-09-22). The envelope -> engine-input
     map moved OUT of index.ts into ./envelope.js, because the world tick had a
     SECOND copy of the field list reading `env.state` instead of the envelope
     top level and handed the engine `skills {}` for a Mining-61 character. The
     fields this guard exists to protect are therefore now spelled one file
     over — so the scan follows them. It does NOT simply union two files: (c)
     below proves index.ts reaches them by spreading THIS function's result, so
     `hydration` is the shell plus the code the shell demonstrably calls. */
  const envSrc = await readFile(join(FN_DIR, 'envelope.js'), 'utf8');
  const envCode = envSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const hydration = code + '\n' + envCode;
  ok(/import\s*\{[^}]*\bengineInputsFromEnvelope\b[^}]*\}\s*from\s*'\.\/envelope\.js'/.test(code),
    'SHELL: index.ts does not import engineInputsFromEnvelope from ./envelope.js — the hydration '
    + 'scan below would be reading a file the shell never calls');
  /* AND THE MAP READS AN ENVELOPE, NEVER A BODY. It is handed `hr_state_of`'s
     result and the server clock and nothing else; a request-shaped identifier
     appearing in it would put client bytes into the engine on BOTH paths at
     once, which is the whole reason it is one function. */
  for (const bad of ['body', 'req.', 'request', 'payload', 'intent.', 'params', 'headers']) {
    ok(!envCode.includes(bad),
      `SHELL: envelope.js references '${bad}' — the envelope map may read the envelope and nothing else`);
  }

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
    /* SPREADS ARE AN ALLOWLIST, NOT A BAN (2026-09-22). The rule this replaces
       was "no spread at all", and its PURPOSE — stated by (a) above — is that
       nothing request-shaped rides in through one. That purpose is unchanged;
       what changed is that the envelope's own fields are now one audited
       server-side map instead of thirty hand-copied lines, precisely because
       the second hand-copy (tick-gather.js) read the wrong level of the same
       projection for four days. So a spread is permitted only when its binder
       is assigned FROM `engineInputsFromEnvelope` IN THIS FILE — an identity a
       request body cannot acquire, and the same technique `callerAuthority`
       uses. `...body`, `...anythingElse` and a renamed binder all stay red. */
    for (const m of lit.matchAll(/\.\.\.\s*([A-Za-z_$][\w$]*)/g)) {
      ok(m[1] === 'engineInputsFromEnvelope',
        `SHELL: the computeAccrual literal spreads '${m[1]}' — only the CALL `
        + '`...engineInputsFromEnvelope(env, nowMs)` may be spread, never a binder and never '
        + 'anything else. A binder is a name a later edit can reassign; the call is not.');
    }
    ok(/\.\.\.\s*engineInputsFromEnvelope\s*\(\s*env\s*,/.test(lit),
      'SHELL: the computeAccrual literal no longer spreads engineInputsFromEnvelope(env, …) — the '
      + 'envelope fields (skills, inventory, equipment, the auto-eat settings, tool_carry, buffs, '
      + 'the recovery line) would silently stop reaching the engine');
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

  /* (h) retired with Auto-Eat (closed rebuild, lane C2): the engine reads no
     auto-eat state, and the hunt's heal is an action-bar slot the session
     carries. (i) below still holds the gathering half of the rule. */
  /* (i) THE SAME RULE FOR GATHERING, and it has the same silent shape. Drop
     `nodes:` and every gathering night answers `unknown_node` — a REFUSING
     reason, so the time is deferred rather than confiscated, but the player
     accrues nothing from gathering ever again and no test here notices, because
     accrual-engine.mjs calls computeAccrual directly and never goes through the
     shell. Drop `toolCarry:` and the carry silently restarts from zero every
     span. Both are one-line omissions with no exception and no log. */
  for (const field of ['nodes:', 'toolCarry:']) {
    ok(hydration.includes(field),
      `SHELL: neither index.ts nor envelope.js passes '${field.replace(':', '')}' to computeAccrual — `
      + 'gathering would silently stop paying (nodes) or silently lose its deterministic carry (toolCarry)');
  }
  ok(/tool_carry/.test(hydration),
    'SHELL: the accrue path no longer reads tool_carry off hr_state_of — the null branch would be '
    + 'permanent and applying the migration would change nothing');

  /* (j) THE FIELD LIST CANNOT SHRINK SILENTLY (2026-09-22, and it is the hole
     the extraction itself opened).

     Until today the envelope's fields were hand-copied at each call site and
     PARITY held them together by COMPARING THE TWO COPIES. One list means
     there is nothing to compare: delete `hearthfindReady` from
     ENGINE_STATE_KEYS and both callers lose it in the same commit, PARITY
     still agrees, and every away night silently stops proposing hearthfinds.
     That is the same shape as the defect this whole change is about — a value
     the engine reads and nobody hands it — so it gets the same treatment: the
     list is checked against the ENGINE, not against another copy of itself.

     `accrual.js` reads its input as `inp.<name>` and nothing else, so the set
     of names it reads is greppable and is the truth. Subtract the inputs that
     do NOT come from the envelope — each one named here with where it does
     come from — and what remains must be exactly what the map declares. */
  const engineSrc = await readFile(join(FN_DIR, 'accrual.js'), 'utf8');
  const engineCode = engineSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const read = new Set([...engineCode.matchAll(/\binp\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  /* NOT FROM `hr_state_of`, each from a named other read or a server literal. */
  const NOT_FROM_ENVELOPE = new Set([
    'nowMs',            // the server clock, read in the settling transaction
    'capMs',            // hr_offline_cap_ms, its own column in the same select
    'seed',             // hr_seed over the window label, the seed transaction
    'perks',            // hr_perks_of, the seed transaction
    'unlockedRecipes',  // hr_perks_of's own field
    'bestiaryKills',    // hr_bestiary_of, behind its own savepoint
    'crew',             // env.workers, but consumed by accrueWorkers, not computeAccrual
    'workersAccruedToMs', // ditto — the crew's own watermark
    'actionBudget',     // the degrade ladder's knob, from the engine's own answer
    'caller',           // a server literal per call site
    'callerAuthority',  // an imported object identity
    'items', 'monsters', 'nodes', 'recipes',  // the generated catalogues
    'companionXpBacked',                      // a deploy-time constant
    /* HUNT INSTANCES (lane S1). accrueHunt's input is the instance read
       (hr_hunt_instance_read: the instance, its window and seed key, each
       member's session) and the ground the edge builds, never hr_state_of;
       `huntOpen` is hr_hunt_open_of on the accrue/collect paths. */
    'instance', 'window', 'secret', 'ground', 'grid', 'members', 'huntOpen',
  ]);
  /* Declared by the map and NOT read by the engine. One entry, and it is
     honest: both call sites have always passed `gold` and accrual.js has never
     read it. Listed rather than deleted so removing it is a deliberate edit.
     LANE S1: only a fight read the combat keys, and a fight is a hunt instance
     now — hunt-settle.js memberInput reads hp / maxHp / combatStyle / the death
     anchors from this same map for its member. `fight` and `ammoCarry` were
     the single-foe span's carries: nothing reads them, and the columns retire
     with the Early Access wipe (logged in CONFLICTS 2026-10-17, S1). */
  const PASSED_BUT_UNREAD = new Set(['gold', 'hp', 'maxHp', 'combatStyle', 'deathsTodayBefore', 'deathsLifetimeBefore',
    'fight', 'ammoCarry']);
  const declared = new Set([...envCode.matchAll(
    /export const ENGINE_(?:POINTER|STATE)_KEYS = Object\.freeze\(\[([\s\S]*?)\]\)/g)]
    .flatMap((m) => [...m[1].matchAll(/'([A-Za-z_$][\w$]*)'/g)].map((x) => x[1])));
  ok(declared.size >= 20,
    `SHELL: envelope.js declares only ${declared.size} engine-input keys — the extractor is blind, `
    + 'so the two comparisons below prove nothing');
  for (const name of [...read].sort()) {
    if (NOT_FROM_ENVELOPE.has(name)) continue;
    ok(declared.has(name),
      `SHELL: accrual.js reads \`inp.${name}\` but envelope.js's ENGINE_*_KEYS do not declare it, `
      + 'and it is not on the not-from-the-envelope list. The engine would read undefined on EVERY '
      + 'path at once — there is only one field list now, so nothing else can notice.');
  }
  for (const name of [...declared].sort()) {
    if (PASSED_BUT_UNREAD.has(name)) continue;
    ok(read.has(name),
      `SHELL: envelope.js declares '${name}' but accrual.js never reads \`inp.${name}\` — either `
      + 'the engine stopped reading it (then say so in PASSED_BUT_UNREAD) or the name is wrong '
      + 'and the real field is silently undefined.');
  }
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
      hp: 99, maxHp: 99, gold: 0,
      skills: { ...MAXED, ...GATHER_MAXED }, equipment: EQUIPMENT,
      inventory: toolId ? { [toolId]: 1 } : {},
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
      hp: 99, maxHp: 99, gold: 0,
      skills: { ...MAXED, ...GATHER_MAXED, ...ARTISAN_MAXED }, equipment: EQUIPMENT,
      inventory: artisanSupply(entry.recipe),
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
    /* No COMBAT sweep since lane C2 (closed rebuild): a fight is a hunt
       session, settled in tick-sized windows that HALVE themselves on any
       hr_apply clamp (hunt-settle.js HUNT_DEGRADABLE), so no hunt window can
       be refused whole for size the way a 12 h away night could. */
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
    /* No COMBAT row (lane C2): a hunt window halves itself on daily_budget
       too (HUNT_DEGRADABLE), so the day budget never refuses a hunt whole. */
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
  /* THE SPREAD IS RESOLVED, NOT IGNORED (2026-09-22). Both literals now spread
     `engineInputsFromEnvelope(env, nowMs)` — the ONE envelope -> engine-input
     map, shared with the world tick, which exists because a FOURTH hand-copy of
     this field list (tick-gather.js) read `env.state.skills` and priced a
     Mining-61 character at level 0. An extractor that skipped a `...` line
     would report both sides as agreeing on the twenty-odd fields neither one
     names any more, i.e. it would go blind on exactly the fields this guard was
     written for. So the spread expands to the map's own declared key list and
     the comparison is over the FULL set at each call site. */
  const spreadKeysOf = (envSrc, name) => {
    const m = envSrc.match(/export const ENGINE_STATE_KEYS = Object\.freeze\(\[([\s\S]*?)\]\)/);
    const p = envSrc.match(/export const ENGINE_POINTER_KEYS = Object\.freeze\(\[([\s\S]*?)\]\)/);
    if (!m || !p) return null;
    const names = (blob) => [...blob.matchAll(/'([A-Za-z_$][\w$]*)'/g)].map((x) => x[1]);
    const keys = [...names(p[1]), ...names(m[1])];
    return keys.length >= 20 ? keys : null;
  };
  const keysOf = (src, spreadKeys) => {
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
        /* `...engineInputsFromEnvelope(env, nowMs),` — the map's keys ARE this
           call site's keys. Matched on the CALL, not on a binder name, so a
           spread of anything else stays unexpanded and shows up as a
           difference rather than as silent agreement. */
        const sp = d === 0 && line.match(/^\s*\.\.\.\s*(?:engineInputsFromEnvelope\s*\(|([A-Za-z_$][\w$]*)\s*,)/);
        if (sp) keys.push(...(sp[1] ? [`<unresolved spread ${sp[1]}>`] : spreadKeys));
        line = ''; continue;
      }
      if (d === 0) line += ch;
      if ('{(['.includes(ch)) d++; else if ('})]'.includes(ch)) d--;
    }
    return keys.sort();
  };
  return (async () => {
    const envSrc = await readFile(join(fnDir, 'envelope.js'), 'utf8');
    const spreadKeys = spreadKeysOf(envSrc);
    if (!spreadKeys) {
      found.push('PARITY: envelope.js does not declare ENGINE_POINTER_KEYS + ENGINE_STATE_KEYS as '
        + 'two frozen literal arrays of at least 20 names — the spread both call sites use cannot be '
        + 'resolved, so this comparison would be blind on every envelope field');
      return found;
    }
    /* THE LIST MUST DESCRIBE THE MAP (2026-09-23, b552 CI red). The comparison
       below resolves BOTH spreads through the same two frozen arrays, so from
       the moment M1f (82606827) moved the field list into one builder the two
       call sites agree BY CONSTRUCTION and the parity half can no longer be
       violated from envelope.js at all. What can still happen is the defect
       tests/activity-intent.mjs `input_set_drift` plants: an input is dropped
       from `engineInputsFromEnvelope`'s BODY while its name stays on the list,
       after which this function reports the two call sites agreeing on a key
       NEITHER of them receives, and the collect prices its window against a
       state the server never had. Measured 2026-09-23: deleting `gold:` from
       the body slipped every guard in this tree.
       So the list is not trusted, it is CHECKED — against what the builder
       actually returns, by calling it. Read from `fnDir`, which is the MUTATED
       temp copy under a mutation, for the reason A14's header gives. */
    let built = null;
    try {
      const href = `${pathToFileURL(join(fnDir, 'envelope.js')).href}?parity=${Date.now()}`;
      const mod = await import(href);
      built = Object.keys(mod.engineInputsFromEnvelope({}, 0));
    } catch (e) {
      found.push('PARITY: envelope.js could not be imported to check its own key list against the '
        + `map it declares — ${e && e.message}`);
      return found;
    }
    const notBuilt = spreadKeys.filter((k) => !built.includes(k));
    const notListed = built.filter((k) => !spreadKeys.includes(k));
    if (notBuilt.length || notListed.length) {
      found.push('PARITY: engineInputsFromEnvelope does not produce the key list it exports, so the '
        + 'spread both call sites rely on is a claim rather than a fact. On the list but NOT built: '
        + `[${notBuilt.join(', ')}] (every caller silently loses these). Built but NOT on the list: `
        + `[${notListed.join(', ')}] (invisible to this comparison and to engineStateOf).`);
      return found;
    }

    const shell = keysOf(await readFile(join(fnDir, 'index.ts'), 'utf8'), spreadKeys);
    const intent = keysOf(await readFile(join(fnDir, 'set-activity.js'), 'utf8'), spreadKeys);
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

// ════════════════════════════════════════════════════════════════════════════
// CREW-BACKLOG — a worker is never paid for time before it was hired.
//
// THE LIVE ROW THIS REPRODUCES (QA 0a47ba77, slot 2, 2026-09-09 03:06:57Z,
// b527, engine payload 50c6d492): one `player_ledger` kind='gather'
// intent='accrue' row, node copper_rock, meta.ms = 440,102, and
// meta.delta.i.copper_ore = 1,891 — about 21x the node's rate, against
// neighbouring rows of 62,862 ms -> 13 and 64,016 ms -> 13. Mining XP over the
// window did NOT move by 21x, and that asymmetry is the whole diagnosis:
// gathering XP is granted per ACTION, so no per-action multiplier can inflate
// the items and leave the XP alone. The 1,891 is a SUM of two settles that
// index.ts merges into one delta and one journal line (`mergeWorkers`):
//
//      91  the player's own gathering   floor(440,102 / 4,800 ms)
//   1,800  the hired crew               a full 24h WORKER_ACCRUE_CAP at
//                                       copper_rock (86,400,000 / 48,000 ms)
//   -----
//   1,891
//
// The crew half is the mint. `workers_accrued_to` is a SHARED watermark that
// index.ts advances only on a settle that PRODUCED, and a character with no
// crew never produces — so the watermark sits where the character was created
// while the calendar runs, and the first accrual after the first hire pays the
// whole backlog. Aldric was hired at 03:00:33; six minutes later he was paid a
// day. The mint signs itself: 1,800 ticks is 18,900 worker xp, which is worker
// level 4, and every worker row after it lands at 38.7 s — exactly the level-4
// tick that burst created. It is NOT a one-off and it is NOT a fire/re-hire
// exploit — there is no dismiss RPC and hr_worker_hire is player_workers'
// only writer. The repeat vectors are ordinary play: every character's FIRST
// hire made 24h+ after the character was created (the case measured here), a
// hire into a fresh SLOT on an older account, and a WHOLE crew left idle then
// re-assigned (the assigned_at half, which hired_at does not close).
//
// BOTH HALVES ARE ASSERTED, because a fix must not pay for itself out of the
// honest one: the player's own 91 ore and their mining XP are unchanged.
// ════════════════════════════════════════════════════════════════════════════
const CREW_ROW = {
  nowMs: Date.parse('2026-09-09T03:06:57Z'),
  grantMs: 440102,                      // meta.ms, verbatim
  nodeId: 'copper_rock',
  hiredAgoMs: 384000,                   // 03:00:33 -> 03:06:57
  staleWatermarkAgoMs: 40 * 3600000,    // no producing settle since the character existed
  liveMint: 1891,
};

function crewBacklogGuard() {
  const C = 'CREW-BACKLOG';
  const t = CREW_ROW;
  const entry = GATHER_INDEX[t.nodeId];
  const node = entry && entry.node;
  if (!node) {
    ok(false, `${C}0: ${t.nodeId} is not in the gather index — the fixture cannot be built`);
    return;
  }
  const PROD = node.prod;
  const crew = (over) => [{
    uid: 'w1', name: 'Aldric', skill: 'mining', target_id: t.nodeId, xp: 0, acc_ms: 0,
    hired_at: new Date(t.nowMs - t.hiredAgoMs).toISOString(), ...over,
  }];
  const settle = (over) => accrueWorkers({
    nowMs: t.nowMs,
    workersAccruedToMs: t.nowMs - t.staleWatermarkAgoMs,
    crew: crew(),
    nodes: GATHER_INDEX, items: ITEMS, ...over,
  });
  const oreOf = (r) => (r && r.accrued && r.items && r.items[PROD]) ? r.items[PROD] : 0;

  // ── 1. THE MINT ITSELF. ───────────────────────────────────────────────────
  /* The ceiling is DERIVED from the shared rate model, never a typed 8. */
  const perTickMs = workerTickMs(node.ms, 0);
  const honest = Math.floor(t.hiredAgoMs / perTickMs);
  const paid = settle({});
  ok(oreOf(paid) <= honest,
    `${C}1: a worker hired ${Math.round(t.hiredAgoMs / 1000)}s ago was paid ${oreOf(paid)} `
    + `${PROD} against a ceiling of ${honest}. The shared workers_accrued_to watermark, stale `
    + 'since before the hire existed, is being paid out as a backlog — the live 1,800-ore mint.');
  ok(oreOf(paid) === honest,
    `${C}2: the crew was paid ${oreOf(paid)} ${PROD} where its lifetime buys exactly ${honest} — `
    + 'a worker is paid for every ms it HAS existed, and not one before.');

  // ── 2. THE FULL LIVE ROW, COMPOSED THE WAY index.ts COMPOSES IT. ──────────
  /* `mergeWorkers` folds the crew items into the pointer's `items` map while the
     journal keeps the POINTER's kind and ms — which is why this mint arrived
     wearing a `gather` label and a 440-second window. */
  const pointer = computeAccrual({
    userId: '00000000-0000-4000-8000-000000000001', slot: 2,
    nowMs: t.nowMs, accruedToMs: t.nowMs - t.grantMs, activeSinceMs: t.nowMs - t.grantMs,
    activeKind: 'gather', activeId: t.nodeId, capMs: 12 * 3600000, seed: SEED,
    hp: 60, maxHp: 60, gold: 0, skills: { mining: 0 }, equipment: {},
    inventory: {},
    items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX,
  });
  ok(pointer.accrued === true,
    `${C}3: the pointer half of the live row did not accrue (${pointer.reason}) — the fixture `
    + 'would be vacuous');
  if (pointer.accrued) {
    const own = (pointer.delta.items && pointer.delta.items[PROD]) || 0;
    eq(own, Math.floor(t.grantMs / pacedActionMs(node.ms)),
      `${C}4: the PLAYER's own half of the row moved. The crew fix must not touch it — this is `
      + `the ore a ${t.grantMs} ms window at ${t.nodeId} is worth.`);
    ok(pointer.delta.xp && pointer.delta.xp.mining > 0,
      `${C}5: the player's mining XP left the row. The diagnosis rests on XP being per-action `
      + 'and honest, so a fix that moved it would have moved the wrong thing.');
    ok(own + oreOf(paid) < t.liveMint,
      `${C}6: the composed delta still totals ${own + oreOf(paid)} ${PROD} — the live mint was `
      + `${t.liveMint}.`);
  }

  // ── 3. NOT A NEW CONFISCATION. ────────────────────────────────────────────
  const ancient = settle({
    crew: crew({ hired_at: new Date(t.nowMs - 40 * 3600000).toISOString() }),
  });
  ok(oreOf(ancient) > 0 && oreOf(ancient) <= Math.floor(WORKER_ACCRUE_CAP_MS / perTickMs),
    `${C}7: a genuinely long-serving worker must still be paid its (24h-capped) backlog — the `
    + `fix is a floor at hire time, not a second cap. Paid ${oreOf(ancient)}.`);

  // ── 4. FAIL CLOSED. ───────────────────────────────────────────────────────
  /* The engine cannot read a column hr_state_of does not project, and here the
     "absent => previous behaviour" default IS the mint. So absence pays NOTHING.
     This is the deploy-order contract in executable form:
     2026-09-12-worker-hired-at-projection.sql is applied BEFORE this engine. */
  const blind = settle({ crew: crew({ hired_at: undefined }) });
  ok(oreOf(blind) === 0,
    `${C}8: a crew row with no hired_at was paid ${oreOf(blind)} ${PROD}. A missing hire time `
    + 'must fail CLOSED — an under-paying crew is a redeploy, a backlog faucet is a wipe.');

  // ── 5. THE CREW'S SHARE IS JOURNALLED (C2, 2026-09-08 security review). ───
  /* This mint was found by DIVIDING meta.ms by the node rate, because on the
     merged path the crew's items disappear into the pointer's `meta.delta.i`
     under the pointer's own kind/intent/ms. After the floor lands the faucet is
     shut, but the NEXT crew defect would be exactly as invisible — so
     `mergeWorkers` folds `journal.meta.crew` into the delta and hr_apply's
     existing `|| coalesce(v_j->'meta','{}')` merge carries it onto the row.

     EXECUTED, not string-matched, and executed on the SHIPPED BYTES: Node
     cannot import a Deno .ts file, so `mergeWorkers` is sliced out of index.ts's
     source, its (only) type annotations stripped, and run — the
     tests/delta-transport.mjs T1 idiom. Deleting, renaming or gutting the merge
     makes this red; so does a type annotation the strip does not know, which
     throws rather than passing vacuously. */
  if (paid.accrued) {
    const shell = readFileSync(join(FN_DIR, 'index.ts'), 'utf8').replace(/\r\n/g, '\n');
    const OPEN = 'const mergeWorkers = ';
    const CLOSE = '\n    };\n';
    const from = shell.indexOf(OPEN);
    const to = from < 0 ? -1 : shell.indexOf(CLOSE, from);
    if (from < 0 || to < 0) {
      ok(false, `${C}9: index.ts no longer contains a \`${OPEN}…\` arrow closing at the expected `
        + 'indent, so this guard can no longer see the merge it grades. That is a failure, not a '
        + 'pass.');
    } else {
      const js = shell.slice(from, to + CLOSE.length - 1)
        .replace(/\s+as\s+Record<string,\s*any>/g, '')
        .replace(/:\s*Record<string,\s*(?:any|number)>/g, '');
      const pointerDelta = {
        journal: { kind: 'gather', intent: 'accrue', meta: { ms: t.grantMs } },
        items: { [PROD]: 91 },
      };
      let merged = null;
      let boom = null;
      try {
        merged = new Function('wout', js + '\nreturn mergeWorkers;')(paid)(pointerDelta);
      } catch (e) { boom = e; }
      ok(!boom, `${C}9: index.ts's mergeWorkers could not be executed off its own bytes `
        + `(${boom && boom.message}) — most likely a new TypeScript annotation the strip above `
        + 'does not know about.');
      const fold = merged && merged.journal && merged.journal.meta && merged.journal.meta.crew;
      eq(JSON.stringify(fold && fold.items), JSON.stringify(paid.items),
        `${C}10: the merged delta's journal.meta.crew.items must be EXACTLY the crew half `
        + `(${JSON.stringify(paid.items)}), and it is ${JSON.stringify(fold && fold.items)}. `
        + "Without it a merged row's crew contribution cannot be reconstructed — which is how "
        + 'the 1,800-ore mint hid inside a `gather` row for a day.');
      eq(merged && merged.journal && merged.journal.kind, 'gather',
        `${C}11: folding meta.crew disturbed the pointer's journal kind. hr_apply coalesces a `
        + "kindless journal to kind='admin', so the row would be mislabelled in the ledger.");
      eq(merged && merged.journal && merged.journal.meta && merged.journal.meta.ms, t.grantMs,
        `${C}12: the pointer's own meta.ms was overwritten by the crew fold. meta.crew.ms is the `
        + "crew's span; meta.ms stays the pointer's, or the arithmetic that found this bug stops "
        + 'working.');
    }
  }
}

/* TIMBERLINE-S1 — THE EDGE PAYLOAD CARRIES THE NEW STANDS (the server half of
   the in-page TIMBERLINE-1..4). Credential-free: the index is the one the edge
   imports (hr-accrue/catalogue.js GATHER_NODES), not a local rebuild, so a
   stand the client paints but the payload lacks is caught here rather than as
   an away night refused `unknown_node`. A seeded 1 h span at the Elder Yew at
   Woodcutting 68, no tool: 3,600,000 / pacedActionMs(10800) = 208 actions at
   floor(124 x 0.39) = 48 XP each. CONTROL: the same span against the index with
   the stand removed must be REFUSED unknown_node, or the pass above proves
   nothing about the payload. */
async function timberlineServerGuard() {
  const { GATHER_NODES } = await import('../supabase/functions/hr-accrue/catalogue.js');
  const NODE = 'elder_yew_tree';
  const from = FROM_MS;
  const run = (nodes) => computeAccrual({
    userId: '00000000-0000-4000-8000-000000000001', slot: 0,
    nowMs: from + 3600000, accruedToMs: from, activeSinceMs: from,
    activeKind: 'gather', activeId: NODE, capMs: 12 * 3600000, seed: SEED,
    hp: 60, maxHp: 60, gold: 0, skills: { woodcutting: xpForLevel(68) },
    equipment: {}, inventory: {},
    toolCarry: {},
    items: ITEMS, monsters: MONSTERS, nodes,
  });
  const entry = GATHER_NODES[NODE];
  ok(!!entry && entry.skill === 'woodcutting' && entry.node.req === 68,
    `TIMBERLINE-S1: the edge GATHER_NODES has no woodcutting-68 ${NODE} — the payload the server `
    + 'runs cannot pay the stand the client paints');
  if (!entry) return;
  const s = run(GATHER_NODES);
  ok(s.accrued === true, `TIMBERLINE-S1: a 1 h span at ${NODE} accrued nothing (reason: ${s.reason})`);
  if (!s.accrued) return;
  eq(s.summary.ticks, 208, `TIMBERLINE-S1: 1 h at ${NODE} ran ${s.summary.ticks} actions, not 208`);
  ok((s.summary.items.yew_log || 0) > 0,
    `TIMBERLINE-S1: 1 h at ${NODE} paid no yew_log — ${JSON.stringify(s.summary.items)}`);
  const yew = s.summary.items.yew_log || 0;
  ok(yew >= s.summary.ticks && yew <= 2 * s.summary.ticks,
    `TIMBERLINE-S1: ${yew} yew_log over ${s.summary.ticks} actions is outside the [1,2] yield`);
  eq(s.summary.xp.woodcutting, 48 * s.summary.ticks,
    `TIMBERLINE-S1: ${NODE} paid ${s.summary.xp.woodcutting} woodcutting XP over `
    + `${s.summary.ticks} actions, not 48 per action`);
  const without = Object.assign(Object.create(null), GATHER_NODES);
  delete without[NODE];
  const refused = run(without);
  ok(refused.accrued !== true && refused.reason === 'unknown_node',
    `TIMBERLINE-S1 CONTROL: with ${NODE} removed from the index the span answered `
    + `accrued=${refused.accrued} reason=${refused.reason}, not a refusal as unknown_node`);
}

/* DEEPWATERS-S1 — THE EDGE PAYLOAD CARRIES THE DEEP MITHRIL VEIN (server half of
   the in-page DEEPWATERS-1/2). Same shape as TIMBERLINE-S1, against the index
   the edge imports. A seeded 1 h span at Mining 67, no tool, no gear:
   3,600,000 / pacedActionMs(9300) = 3,600,000 / 14,880 = 241 actions at
   floor(118 x 0.39) = 46 XP, 1-2 mithril_ore each, the ore count pinned on the
   seed. The ATTENDED path (clientGatherSpan, the client's own loop) on the same
   seed must pay the identical span. CONTROL: with the vein removed from the
   index the span is REFUSED unknown_node. */
async function deepWatersServerGuard() {
  const { GATHER_NODES } = await import('../supabase/functions/hr-accrue/catalogue.js');
  const NODE = 'deep_mithril_vein';
  const SEEDED_ORE = 348;   // measured once on SEED; pinned, never banded
  const run = (nodes) => computeAccrual({
    userId: '00000000-0000-4000-8000-000000000001', slot: 0,
    nowMs: FROM_MS + 3600000, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
    activeKind: 'gather', activeId: NODE, capMs: 12 * 3600000, seed: SEED,
    hp: 60, maxHp: 60, gold: 0, skills: { mining: xpForLevel(67) },
    equipment: {}, inventory: {},
    toolCarry: {},
    items: ITEMS, monsters: MONSTERS, nodes,
  });
  const entry = GATHER_NODES[NODE];
  ok(!!entry && entry.skill === 'mining' && entry.node.req === 67,
    `DEEPWATERS-S1: the edge GATHER_NODES has no mining-67 ${NODE} — the payload cannot pay the vein the client paints`);
  if (!entry) return;
  const s = run(GATHER_NODES);
  ok(s.accrued === true, `DEEPWATERS-S1: a 1 h span at ${NODE} accrued nothing (reason: ${s.reason})`);
  if (!s.accrued) return;
  eq(s.summary.ticks, 241, `DEEPWATERS-S1: 1 h at ${NODE} ran ${s.summary.ticks} actions, not 241`);
  eq(s.summary.xp.mining, 46 * 241, `DEEPWATERS-S1: ${NODE} paid ${s.summary.xp.mining} mining XP, not 46 x 241`);
  const ore = s.summary.items.mithril_ore || 0;
  ok(ore >= 241 && ore <= 482, `DEEPWATERS-S1: ${ore} mithril_ore over 241 actions is outside the [1,2] yield`);
  eq(ore, SEEDED_ORE, `DEEPWATERS-S1: the seeded span paid ${ore} mithril_ore, the seed pins ${SEEDED_ORE}`);
  const c = clientGatherSpan({ skill: 'mining', node: entry.node, spanMs: 3600000, rng: createRng(SEED),
    skills: { mining: xpForLevel(67) }, inventory: {}, equipment: {}, toolCarry: {} });
  eq(c.ticks, s.summary.ticks, 'DEEPWATERS-S1 ATTENDED: the client loop ran a different number of actions');
  eq(c.items, s.summary.items, 'DEEPWATERS-S1 ATTENDED: the client loop paid different ore on the same seed');
  eq(c.xp, s.summary.xp, 'DEEPWATERS-S1 ATTENDED: the client loop paid different XP on the same seed');
  const without = Object.assign(Object.create(null), GATHER_NODES);
  delete without[NODE];
  const refused = run(without);
  ok(refused.accrued !== true && refused.reason === 'unknown_node',
    `DEEPWATERS-S1 CONTROL: with ${NODE} removed the span answered accrued=${refused.accrued} `
    + `reason=${refused.reason}, not unknown_node`);
}

export async function runAll() {
  problems.length = 0;
  gatherParityGuard();
  gatherBuffTimelineGuard();
  await timberlineServerGuard();
  await deepWatersServerGuard();
  toolCarryContinuityGuard();
  crewBacklogGuard();
  hostileGuard();
  await shapeGuard();
  requestGuard();
  await settableKindsGuard();
  for (const p of await computeAccrualInputParity(FN_DIR)) problems.push(p);
  await shellGuard();
  await clampGuard();
  await dayBudgetGuard();
  await deployGuard();
  await packerGuard();
  return problems.slice();
}

/* `--fuse-only` (b569): just the clamp and day-budget sweeps, the only guards the
   fuse-sizing mutants in tests/artisan-accrual.mjs --selftest can reach. A probe,
   not a gate: the plain run (every guard) is what CI and run-smoke execute. */
async function fuseSizingOnly(part) {
  problems.length = 0;
  if (part !== 'day') await clampGuard();
  if (part !== 'clamp') await dayBudgetGuard();
  return problems.slice();
}

const FUSE_ARG = process.argv.find((a) => a === '--fuse-only' || a.startsWith('--fuse-only='));
if (import.meta.url === pathToFileURL(process.argv[1] || '').href && FUSE_ARG) {
  const found = await fuseSizingOnly(FUSE_ARG.split('=')[1] || null);
  for (const p of found) console.log('  x ' + p);
  console.log(found.length ? 'Accrual engine fuse sizing — FAILED' : 'Accrual engine fuse sizing — green');
  process.exit(found.length ? 1 : 0);
} else if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const found = await runAll();
  if (found.length) {
    console.log('Accrual engine guard — FAILED:');
    for (const p of found) console.log('  x ' + p);
    process.exit(1);
  }
  const s = serverAccrual();
  console.log('Accrual engine guard — gather/artisan/crew parity with the client, hostile inputs inert.');
  /* Printed on every run, deliberately. A headroom number nobody sees is a
     number nobody notices tightening. */
  for (const line of clampGuard.report || []) console.log(`  clamp headroom: ${line}`);
  for (const line of dayBudgetGuard.report || []) console.log(`  day-budget headroom: ${line}`);
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
      toolCarry: {},
      items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX,
    });
    console.log(`  gather: ${nodeId} (${skill}${toolId ? ' + ' + toolId : ''}) · ${g.tickMs}ms · `
      + `${g.summary.ticks} actions · ${JSON.stringify(g.summary.items)} · `
      + `${JSON.stringify(g.summary.xp)} · +${g.summary.toolDoubles} tool doubles`);
  }
  console.log(`  fixture: ${BASE_NODE} · ${SPAN_MS / 3600000}h · ${s.tickMs}ms · `
    + `${s.summary.ticks} actions · ${JSON.stringify(s.summary.items)} · ${JSON.stringify(s.summary.xp)}`);
}
