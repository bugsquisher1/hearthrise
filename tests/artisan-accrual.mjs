// ============================================================================
// tests/artisan-accrual.mjs — THE ARTISAN ACCRUAL GUARD (b356).
//
// `artisan` is 290 of the 344 `hr_activities` rows — 84% of the catalogue — and
// until this landed every one of them answered `unsupported_activity`. A player
// who logged off smelting bars got a zero night, declared idle rather than
// confiscated, but zero all the same. This file is the proof that a smithing
// night now pays, that it pays EXACTLY what the shipped client would have paid,
// and that it can never pay more than the SERVER'S OWN inventory can cover.
//
// ── SEVEN CLAIMS, EACH WITH A CONTROL ───────────────────────────────────────
//   T1  a kind in PAYABLE_KINDS with no simulation is REFUSED, not paid as
//       combat — the protection the guard comment above PAYABLE_KINDS used to
//       claim and did not have.
//   T2  PARITY. A span computed by the server engine is identical — ticks,
//       output, burns, tool doubles, every XP grant, the carry — to the same
//       span computed the way legacy.js computes it. The client column is a
//       TRANSCRIPTION of `doArtisanAction` + `replayAwaySpan`, not a call into
//       `simulateArtisanSpan`, or it would prove that a function equals itself.
//   T3  MATERIALS ARE SERVER-CLAMPED. Production is bounded by the inventory
//       the server holds, never by a client count, and the delta's debit can
//       never exceed the starting stack.
//   T4  EXHAUSTION IS A STOP, NOT A REFUSAL, NOT A CONFISCATION: the worked
//       time is paid, the remainder idles, and the POINTER IS CLEARED so the
//       next accrual is not answered "nothing" forever.
//   T5  THE GATE IS SERVER-SIDE. `unlockedRecipes` comes from `hr_perks_of`;
//       a client that claims a scroll it has no progress row for gets nothing,
//       and an absent map is LOCKED rather than open.
//   T6  noBurn COMES FROM THE SERVER'S UNLOCK ROWS, and the perk stack is the
//       only thing that moves the burn rate. Plus the payability model: a bench
//       whose destructive key is not server-owned is refused by NAME.
//   T7  SHAPE. Every delta key is one hr_apply implements, every number is an
//       integer, the item map is signed, the ledger kind is `craft` (NOT
//       `artisan` — `player_ledger_kind_check` does not accept it), and the
//       hostile-input surface is inert.
//
// Run standalone:  node tests/artisan-accrual.mjs
// Also invoked as a preflight by tests/run-smoke.mjs.
// ============================================================================

import { pathToFileURL } from 'node:url';

import {
  computeAccrual, PAYABLE_KINDS, KIND_ACCRUERS, SKIP, degradeStep,
} from '../supabase/functions/hr-accrue/accrual.js';
import {
  GATHER_NODES, ARTISAN_RECIPES_ALL, ARTISAN_RECIPES_PAYABLE,
} from '../supabase/functions/hr-accrue/catalogue.js';
import {
  SAFE_SKIP_REASONS, REFUSING_SKIP_REASONS, POINTER_SKIP_REASONS, mayForceCloseWindow,
} from '../supabase/functions/hr-accrue/intents.js';

import {
  simulateArtisanSpan, indexArtisanRecipes, duplicateRecipeIds,
  benchPayable, benchBlockedBy, recipePayable,
  SERVER_OWNED_BONUS_KEYS, BENCH_DESTRUCTIVE_KEYS, STOP_REASON as ARTISAN_STOP,
} from '../src/core/artisan-sim.js';
import { resolveArtisanAction, burnChance, BURN_BASE, BURNT_ITEM } from '../src/core/artisan.js';
import { bestTool, toolSpeed, toolXpB, toolDouble } from '../src/core/tools.js';
import { pacedActionMs, speedClamp } from '../src/core/pacing.js';
import { equipmentStats } from '../src/core/combat.js';
import { grantXp } from '../src/core/progression.js';
import { createRng } from '../src/core/rng.js';
import { levelOf } from '../src/core/xp.js';
import { makeBonus } from '../src/core/perks.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const eq = (a, b, msg) => {
  const A = JSON.stringify(a); const B = JSON.stringify(b);
  if (A !== B) problems.push(`${msg}\n      server: ${A}\n      client: ${B}`);
};
/** Two `{id: n}` maps, compared as SETS OF PAIRS. See its call site. */
const sortMap = (o) => Object.fromEntries(Object.entries(o || {}).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
const eqMap = (a, b, msg) => eq(sortMap(a), sortMap(b), msg);

/* 2026-03-14 20:00 UTC → 2026-03-15 08:00 UTC. Twelve hours, one UTC boundary.
   Artisan has no day segmentation of its own, so the boundary is not the point
   here — using the SAME anchor the combat and gather fixtures use is, because a
   window that differs between paths is how two away paths come to disagree
   about when the night happened. */
const FROM_MS = Date.UTC(2026, 2, 14, 20, 0, 0);
const SPAN_MS = 12 * 3600000;
const NOW_MS = FROM_MS + SPAN_MS;
const SEED = 0x5eed1234;

const MAXED = 13034431;                 // level 99
const SKILLS = Object.freeze({
  cooking: MAXED, smithing: MAXED, crafting: MAXED, prayer: MAXED,
  woodcutting: MAXED, mining: MAXED, fishing: MAXED,
  attack: 1000, strength: 1000, defense: 1000, hitpoints: 1000,
});

/** The whole input dict for a recipe, in BOTH authored dialects. */
function inputsOf(recipe) {
  if (recipe.inputs) return { ...recipe.inputs };
  const i = {};
  if (recipe.input) i[recipe.input] = recipe.inputQty || 1;
  if (recipe.secondary) for (const k of Object.keys(recipe.secondary)) i[k] = recipe.secondary[k];
  return i;
}

/** A bag that can cover `n` runs of a recipe, plus anything else asked for. */
function supplyFor(recipe, n, extra) {
  const bag = { ...(extra || {}) };
  for (const [id, q] of Object.entries(inputsOf(recipe))) bag[id] = (bag[id] || 0) + q * n;
  return bag;
}

function call(over) {
  return computeAccrual({
    userId: '00000000-0000-4000-8000-000000000001',
    slot: 0,
    nowMs: NOW_MS,
    accruedToMs: FROM_MS,
    activeSinceMs: FROM_MS,
    activeKind: 'artisan',
    activeId: null,
    capMs: 12 * 3600000,
    seed: SEED,
    hp: 60, maxHp: 60, gold: 0,
    skills: { ...SKILLS },
    equipment: {},
    inventory: {},
    autoEatEnabled: false, autoEatFood: null, autoEatPct: 0,
    toolCarry: {},
    perks: null,
    unlockedRecipes: {},
    items: ITEMS,
    monsters: MONSTERS,
    nodes: GATHER_NODES,
    recipes: ARTISAN_RECIPES_ALL,
    ...over,
  });
}

/* The best tool the catalogue actually contains for a bench, chosen FROM the
   data rather than named — an invented item would test the engine against
   content the game does not have. */
function bestOwnedTool(skill) {
  return Object.keys(ITEMS)
    .filter((id) => ITEMS[id] && ITEMS[id].type === 'tool' && ITEMS[id].toolSkill === skill)
    .sort((a, b) => (ITEMS[b].toolTier || 0) - (ITEMS[a].toolTier || 0))[0] || null;
}

// ════════════════════════════════════════════════════════════════════════
// T1. A PAYABLE KIND WITH NO SIMULATION IS REFUSED, NOT MIS-PAID.
//
// The block above PAYABLE_KINDS used to claim "if you add a kind here without a
// simulation below, the guard fails". It did not: a fourth kind fell through
// the branch into the COMBAT tail, which looked `active_id` up in MONSTERS,
// found nothing, and priced the night against an undefined monster. This is the
// protection that replaced the claim, and it is reached DIRECTLY because the
// intent's allowlist is derived from PAYABLE_KINDS and can therefore never
// deliver an unsimulated kind through the front door.
// ════════════════════════════════════════════════════════════════════════
function unsimulatedKindGuard() {
  /* ── THE CLAIM THE COMMENT NOW MAKES, CHECKED IN BOTH DIRECTIONS. Not
     against a list this file types out — against the DISPATCH TABLE the engine
     actually reads. `combat` is the one permitted absence, because it is priced
     by the tail of computeAccrual itself; naming it here rather than accepting
     any absence is what stops a SECOND inline kind appearing by omission. */
  const INLINE = 'combat';
  for (const kind of PAYABLE_KINDS) {
    ok(kind === INLINE || typeof KIND_ACCRUERS[kind] === 'function',
      `T1: PAYABLE_KINDS names '${kind}' and KIND_ACCRUERS has no simulation for it. The intent's `
      + 'allowlist is derived from that array, so a player could set it, work it for hours, switch, '
      + 'and be paid nothing — or worse, fall through into the combat tail and be priced against a '
      + 'monster that does not exist.');
  }
  for (const kind of Object.keys(KIND_ACCRUERS)) {
    ok(PAYABLE_KINDS.includes(kind),
      `T1: KIND_ACCRUERS can price '${kind}' and PAYABLE_KINDS does not list it, so the simulation is `
      + 'unreachable — the accrual is dead code and the activity is unsettable');
  }
  ok(!KIND_ACCRUERS[INLINE],
    `T1: '${INLINE}' has an entry in KIND_ACCRUERS as well as the inline tail — two payers for one `
    + 'kind, and only one of them has parity fixtures');
  /* The prototype hazard on the dispatch itself. */
  for (const probe of ['__proto__', 'constructor', 'toString']) {
    ok(KIND_ACCRUERS[probe] === undefined,
      `T1: KIND_ACCRUERS resolves '${probe}' — a null-prototype table was expected, and here a truthy `
      + 'hit would be CALLED');
  }

  /* `PAYABLE_KINDS` is a frozen module export, so the mutation "add a kind
     without a simulation" cannot be applied from here — it is applied from
     tests/activity-intent.mjs's `widen_settable`, which patches the source on
     disk and is proven RED by `--selftest`. What is reachable HERE is the same
     property from the other side: a kind the engine has no branch for must come
     back with a REFUSING reason and no delta, whichever gate catches it. `farm`
     is a real `player_state.active_kind` value (it is on the column's CHECK),
     so this is not a synthetic string. */
  const r = call({ activeKind: 'farm', activeId: 'plot_0' });
  ok(r.accrued === false && r.reason === SKIP.UNSUPPORTED,
    `T1: an unsimulated kind returned ${JSON.stringify({ accrued: r.accrued, reason: r.reason })} — `
    + 'expected accrued:false / unsupported_activity. If it ACCRUED, the branch fell through into the '
    + 'combat tail and priced a night against a monster that does not exist.');
  ok(!r.delta, 'T1: an unsimulated kind produced a DELTA — the watermark would move and the window '
    + 'would be confiscated');
  ok(REFUSING_SKIP_REASONS.includes(SKIP.UNSUPPORTED),
    'T1: `unsupported_activity` is not in REFUSING_SKIP_REASONS, so a switch would treat an '
    + 'unpriceable window as "nothing owed" and destroy it');

  /* AND THE TWO NEW REASONS ARE CLASSIFIED. A reason the contract has no
     opinion about falls closed at runtime, which is right — and invisible. */
  for (const reason of [SKIP.NO_RECIPE, SKIP.UNPAYABLE_BENCH]) {
    ok(REFUSING_SKIP_REASONS.includes(reason),
      `T1: '${reason}' is not classified as REFUSING. Both name a window that is real work the engine `
      + 'will be able to price later, so switching past it would confiscate time a deploy makes '
      + 'payable.');
    ok(!SAFE_SKIP_REASONS.includes(reason),
      `T1: '${reason}' is in BOTH partitions`);
  }

  /* ── THE C3 SUB-PARTITION. `POINTER_SKIP_REASONS` names the refusing reasons
     an incoming `idle` may force-close as a forfeit. It must be a strict SUBSET
     of the refusing set — a SAFE reason there would be meaningless (nothing to
     forfeit), and a reason there that is NOT refusing would mean the hatch
     fires on a path that already proceeds. It must also LEAVE SOMETHING OUT:
     if every refusing reason could be forfeited, the transient ones (`no_cap`,
     `no_active_since`) would be confiscated by a stop, which is precisely the
     trade `no_cap`'s deliberate lockout was chosen over. */
  for (const reason of POINTER_SKIP_REASONS) {
    ok(REFUSING_SKIP_REASONS.includes(reason),
      `T1: POINTER_SKIP_REASONS names '${reason}', which is not a REFUSING reason. The escape hatch `
      + 'would then fire on a window that was already going to proceed.');
  }
  ok(POINTER_SKIP_REASONS.length < REFUSING_SKIP_REASONS.length,
    'T1: every refusing reason is force-closeable, so a STOP now confiscates the TRANSIENT ones too '
    + '(`no_cap`, `no_active_since`) — windows that waiting would have paid. The partition is the '
    + 'whole design of C3; a subset that is not proper is not a partition.');
  for (const reason of ['no_cap', 'no_active_since']) {
    ok(!POINTER_SKIP_REASONS.includes(reason),
      `T1: '${reason}' is force-closeable. It is a property of the ABSENCE, not of the pointer: it is `
      + 'transient, stopping does not fix it, and waiting WOULD have paid. Forfeiting it is the '
      + 'confiscation the collect-before-switch rule exists to prevent.');
    ok(!mayForceCloseWindow('idle', reason),
      `T1: mayForceCloseWindow('idle', '${reason}') is true while the list says otherwise — the `
      + 'predicate and its own table disagree');
  }
  /* CONTROL: the predicate says YES to something, and only to a stop. */
  ok(mayForceCloseWindow('idle', POINTER_SKIP_REASONS[0]),
    'T1 CONTROL: mayForceCloseWindow refuses every reason, so the escape hatch is dead code and a '
    + 'rolled-back deploy freezes every artisan character');
  for (const kind of ['combat', 'gather', 'artisan']) {
    ok(!mayForceCloseWindow(kind, POINTER_SKIP_REASONS[0]),
      `T1: a '${kind}' declaration can force-close a window. Only a STOP may — it is the one `
      + 'declaration that cannot be about the thing that is stuck, and any other kind forfeiting a '
      + 'window it could not price is an ordinary switch confiscating time.');
  }
}

// ════════════════════════════════════════════════════════════════════════
// T2. PARITY WITH THE SHIPPED CLIENT.
//
// ⚠ THE CLIENT SIDE BELOW IS A TRANSCRIPTION OF legacy.js, NOT A CALL INTO
//   src/core/artisan-sim.js. legacy.js's away branch ran `replayAwaySpan`
//   (legacy.js:1153) over `doArtisanAction` at the interval `activityIntervalMs`
//   (legacy.js:3691) derives; that is what is written out here, with the
//   window.* helpers replaced by the same core calls they delegate to and the
//   toasts and repaints dropped. If both columns called `simulateArtisanSpan`
//   this would prove that a function equals itself.
// ════════════════════════════════════════════════════════════════════════

/* legacy.js `activityIntervalMs()` for the artisan branch, written out.
   `Math.max(500, floor(pacedActionMs(r.ms || 3000) * speedClamp(speed)))` where
   `speed = getBonus('<bench>Speed') + HearthriseTools.bestToolSpeed(skill)`.
   Deliberately NOT `actionIntervalMs()` from core/pacing.js: this reference has
   to spend the terms independently, or a change to the shared helper would move
   both columns together and parity would stay green while the number drifted. */
const SPEED_KEY = { cooking: 'cookSpeed', smithing: 'smithSpeed', crafting: 'craftSpeed', prayer: 'prayerSpeed' };
function clientArtisanIntervalMs(skill, recipe, inventory, equipment, bonus) {
  const tool = bestTool(skill, inventory, equipment, ITEMS);
  const speed = (bonus(SPEED_KEY[skill]) || 0) + toolSpeed(tool);
  return Math.max(500, Math.floor(pacedActionMs(recipe.ms || 3000) * speedClamp(speed)));
}

/**
 * legacy.js `replayAwaySpan` + `doArtisanAction(silent)`, transcribed.
 * @returns { xp, items, consumed, stats, toolCarry, ticks, intervalMs, stopped, stoppedOn }
 */
function clientArtisanSpan(opts) {
  const skill = opts.skill;
  const recipe = opts.recipe;
  const bonus = opts.bonus || (() => 0);
  const G = {
    activeSkill: skill,
    skillTargetId: recipe.id,
    skills: { ...opts.skills },
    inventory: { ...(opts.inventory || {}) },
    equipment: opts.equipment || {},
    unlockedRecipes: opts.unlockedRecipes || {},
    toolCarry: { ...(opts.toolCarry || {}) },
    stats: {},
  };
  const eqStats = equipmentStats(G.equipment, ITEMS);
  const gained = {};
  const spent = {};

  /* doArtisanAction — the silent (offline-replay) arm. Returns false when the
     bag cannot cover the recipe or the scroll is not held, which is what
     legacy.js turns into `stopSkill()`. */
  const doArtisanAction = () => {
    const tool = bestTool(skill, G.inventory, G.equipment, ITEMS);
    const res = resolveArtisanAction(recipe, {
      skillId: skill,
      inventory: G.inventory,
      unlockedRecipes: G.unlockedRecipes,
      items: ITEMS,
      cookingLevel: levelOf(G.skills, 'cooking'),
      noBurn: bonus('noBurn') || 0,
      bonus,
      toolCarry: G.toolCarry,
      toolDouble: toolDouble(tool),
      toolXpB: toolXpB(tool),
      rng: opts.rng,
    });
    if (!res.ok) return false;
    // removeItem
    for (const [id, q] of Object.entries(res.consumed)) {
      spent[id] = (spent[id] || 0) + q;
      G.inventory[id] = (G.inventory[id] || 0) - q;
      if (G.inventory[id] <= 0) delete G.inventory[id];
    }
    // addItem
    if (res.produced) {
      gained[res.produced.id] = (gained[res.produced.id] || 0) + res.produced.qty;
      G.inventory[res.produced.id] = (G.inventory[res.produced.id] || 0) + res.produced.qty;
    }
    // addXp — through core's grantXp with the client's xpGrantCtx
    if (res.xpAmount) {
      grantXp(G, res.xpSkill, res.xpAmount,
        { bonus, xpB: eqStats.xpB || 0, restedQuantum: 0, authored: false });
    }
    for (const k of Object.keys(res.stats)) G.stats[k] = (G.stats[k] || 0) + res.stats[k];
    return true;
  };

  /* replayAwaySpan — the slice loop. With no buffs held there is exactly one
     slice, so this is the flat form: derive the interval, run floor(span/step)
     actions, stop early when one refuses. */
  const out = { ticks: 0, stopped: false, stoppedOn: null };
  const stepMs = Math.max(1, clientArtisanIntervalMs(skill, recipe, G.inventory, G.equipment, bonus));
  const n = Math.floor(Math.max(0, opts.spanMs) / stepMs);
  for (let i = 0; i < n; i++) {
    if (!doArtisanAction()) { out.stopped = true; break; }
    out.ticks++;
  }

  const xp = {};
  for (const k in G.skills) {
    const d = Math.floor((G.skills[k] || 0) - (opts.skills[k] || 0));
    if (d > 0) xp[k] = d;
  }
  return { ...out, xp, items: gained, consumed: spent, stats: G.stats,
           toolCarry: G.toolCarry, intervalMs: stepMs, inventory: G.inventory };
}

/* Fixtures chosen so the SET exercises every branch that has historically
   drifted, and every one is picked FROM THE DATA rather than invented.
     • a multi-input smelt      — two ingredients, so the debit is a MAP
     • the best hammer          — tool speed moves the interval, the fractional
                                  carry moves the yield, toolXpB moves the grant
     • a crafting material out  — craftSave and yield_crafting are live
     • prayer                   — the bench with no BENCH_COUNTERS row at all
   The coverage assertions at the bottom are what stop this table quietly
   degrading into one easy case that always passes. */
function pickRecipe(skill, pred) {
  const list = (ARTISAN_RECIPES[skill] || []).filter((r) => r && r.id && !r.gated && pred(r));
  return list[0] || null;
}
const FIXTURES = [
  {
    name: 'multi-input smelt (two ingredients, a MAP debit)',
    skill: 'smithing', tool: false,
    pick: () => pickRecipe('smithing', (r) => Object.keys(inputsOf(r)).length >= 2),
  },
  {
    name: 'smithing with the best hammer (speed + carry + xpB)',
    skill: 'smithing', tool: true,
    pick: () => pickRecipe('smithing', (r) => Object.keys(inputsOf(r)).length >= 1),
  },
  {
    name: 'crafting a MATERIAL output (craftSave + yield_crafting are live)',
    skill: 'crafting', tool: false,
    pick: () => pickRecipe('crafting', (r) => r.output && ITEMS[r.output] && !ITEMS[r.output].type),
  },
  {
    name: 'prayer (no BENCH_COUNTERS row — the counter loop must not invent one)',
    skill: 'prayer', tool: false,
    pick: () => pickRecipe('prayer', () => true),
  },
];

function parityGuard() {
  const seen = { ticks: 0, doubles: 0, benches: new Set(), speeds: new Set(), consumedKinds: 0 };

  ok(Object.keys(ARTISAN_RECIPES_ALL).length
     === Object.values(ARTISAN_RECIPES).reduce((a, l) => a + l.length, 0),
    `T2: the index holds ${Object.keys(ARTISAN_RECIPES_ALL).length} recipes and the data holds `
    + `${Object.values(ARTISAN_RECIPES).reduce((a, l) => a + l.length, 0)} — a recipe id is claimed twice`);
  eq(duplicateRecipeIds(ARTISAN_RECIPES), [],
    'T2: two benches claim the same recipe id — the index would resolve it to one bench and the '
    + "other bench's recipe would be unreachable");
  /* The prototype hazard, measured rather than asserted about. `active_id` is
     bounded by /^[a-z0-9_]{1,64}$/, which matches `constructor` — and here a
     truthy miss reaches `recipe.inputs`. */
  for (const probe of ['__proto__', 'constructor', 'toString', 'valueOf']) {
    ok(ARTISAN_RECIPES_ALL[probe] === undefined,
      `T2: the index resolves '${probe}' — a null-prototype container was expected`);
    ok(ARTISAN_RECIPES_PAYABLE[probe] === undefined,
      `T2: the payable index resolves '${probe}'`);
    const r = call({ activeId: probe });
    ok(r.accrued === false && r.reason === SKIP.NO_RECIPE,
      `T2: a '${probe}' pointer returned ${JSON.stringify({ a: r.accrued, r: r.reason })}`);
  }

  for (const f of FIXTURES) {
    const recipe = f.pick();
    ok(!!recipe, `T2 [${f.name}]: no recipe in the data matches the fixture — it is vacuous`);
    if (!recipe) continue;
    ok(benchPayable(f.skill),
      `T2 [${f.name}]: the ${f.skill} bench is not payable, so this fixture cannot run. If that is `
      + 'deliberate, the fixture table has to follow the payability model.');
    if (!benchPayable(f.skill)) continue;

    const toolId = f.tool ? bestOwnedTool(f.skill) : null;
    ok(!f.tool || !!toolId, `T2 [${f.name}]: no tool exists for ${f.skill} — the fixture is vacuous`);
    /* Supply for far more runs than the window can consume, so PARITY measures
       the rate rather than the stop. Exhaustion has its own section. */
    const inventory = supplyFor(recipe, 200000, toolId ? { [toolId]: 1 } : {});

    const s = call({ activeId: recipe.id, inventory });
    ok(s.accrued === true, `T2 [${f.name}]: accrued nothing (reason: ${s.reason})`);
    if (!s.accrued) continue;

    const c = clientArtisanSpan({
      skill: f.skill, recipe, spanMs: SPAN_MS, rng: createRng(SEED),
      skills: { ...SKILLS }, inventory, equipment: {}, toolCarry: {}, unlockedRecipes: {},
    });

    const P = (m) => `T2 PARITY [${f.name} · ${recipe.id}]: ${m}`;
    eq(s.tickMs, c.intervalMs, P("the derived action interval differs from the client's"));
    eq(s.summary.ticks, c.ticks, P('action count differs'));
    eq(s.summary.xp, c.xp, P('XP grants differ'));
    eq(s.summary.toolDoubles, c.stats.toolDoubles || 0, P('tool double-yield differs'));
    eq(s.summary.burnt, c.stats.burnt || 0, P('burn count differs'));

    /* ── THE SIGNED DELTA VERSUS THE CLIENT'S TWO MAPS. legacy.js keeps gains
       and spends apart (addItem / removeItem); the server nets them into one
       signed map because that is hr_apply's contract. Comparing the NET is the
       only honest comparison, and building the client's net here — rather than
       reading the server's — is what makes it one. */
    const clientNet = {};
    for (const [id, q] of Object.entries(c.items)) clientNet[id] = (clientNet[id] || 0) + q;
    for (const [id, q] of Object.entries(c.consumed)) clientNet[id] = (clientNet[id] || 0) - q;
    for (const id of Object.keys(clientNet)) if (clientNet[id] === 0) delete clientNet[id];
    /* KEY ORDER IS NOT PART OF THE CONTRACT and comparing it would be a
       permanent false red: the server builds its map by iterating the delta
       accumulator (debits first, in consumption order) and the client builds
       its by iterating gains then spends. hr_apply reads a jsonb object, which
       has no order. Sort both. */
    eqMap(s.delta.items || {}, clientNet, P('the net item movement differs'));

    eq(s.delta.tool_carry, roundedCarry(c.toolCarry), P('the fractional tool carry differs'));

    /* Determinism: same seed, same answer — that is what makes a grant
       auditable. And a DIFFERENT seed must not produce the same answer on a
       bench with a real roll, or the seed is being ignored. */
    eq(call({ activeId: recipe.id, inventory }).summary.items, s.summary.items,
      P('the same seed produced a different yield'));

    for (const [id, n] of Object.entries(s.delta.items || {})) {
      if (n < 0) seen.consumedKinds++;
      ok(Number.isInteger(n), P(`items.${id} = ${n} is not an integer`));
    }
    seen.ticks = Math.max(seen.ticks, s.summary.ticks);
    seen.doubles = Math.max(seen.doubles, s.summary.toolDoubles);
    seen.benches.add(f.skill);
    seen.speeds.add(s.tickMs);
  }

  /* COVERAGE. A parity suite whose fixtures all take the same trivial path
     proves parity of nothing. */
  ok(seen.ticks > 1000, `T2 COVERAGE: the longest fixture ran only ${seen.ticks} actions`);
  ok(seen.doubles > 0, 'T2 COVERAGE: no fixture earned a tool double, so the deterministic fractional '
    + 'carry — the whole reason an away replay is byte-identical — is untested');
  ok(seen.benches.size >= 3, `T2 COVERAGE: only ${seen.benches.size} bench(es) were exercised, so the `
    + 'per-bench counter routing is untested');
  ok(seen.speeds.size > 1, 'T2 COVERAGE: every fixture ran at the same interval — the tool speed term '
    + 'is untested');
  ok(seen.consumedKinds > 0, 'T2 COVERAGE: no fixture produced a NEGATIVE item delta, so the whole '
    + 'signed-debit contract — the one thing artisan does that neither other path does — is untested');
}

/* The engine floors the stored carry to 9 decimals (roundCarry in accrual.js).
   The reference has to do the same to be comparable, and doing it HERE rather
   than importing that function keeps the two constructions independent. */
function roundedCarry(carry) {
  const out = {};
  for (const k in (carry || {})) {
    const n = Number(carry[k]);
    if (Number.isFinite(n) && n > 0 && n < 1) out[k] = Math.floor(n * 1e9) / 1e9;
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════
// T3 + T4. MATERIALS ARE THE SERVER'S, AND RUNNING OUT IS A STOP.
// ════════════════════════════════════════════════════════════════════════
function materialGuard() {
  const recipe = pickRecipe('smithing', (r) => Object.keys(inputsOf(r)).length >= 2);
  ok(!!recipe, 'T3: no multi-input smithing recipe exists — the material guard is vacuous');
  if (!recipe) return;
  const inputs = inputsOf(recipe);
  const [limitId, limitQty] = Object.entries(inputs)[0];

  /* THE UNBOUNDED RUN, as the ceiling. This is what the window can produce when
     supply is not the constraint, and every clamp below has to come in UNDER
     it — otherwise "the run stopped at N" would be true of a clamp that does
     not exist. */
  const free = call({ activeId: recipe.id, inventory: supplyFor(recipe, 1e6) });
  ok(free.accrued && free.summary.ticks > 50,
    `T3 CONTROL: an unlimited-supply span ran ${free.accrued ? free.summary.ticks : 0} actions — too `
    + 'few for the clamps below to be distinguishable from the clock');
  const ceiling = free.summary.ticks;

  /* ── T3. THE CLAMP, SWEPT. One sample is not a verdict: a single supply level
     could match the clock by coincidence. Sweep it, and every level must
     produce exactly `runs` actions and consume exactly the inputs that buys. */
  for (const runs of [1, 2, 7, 30, 500]) {
    if (runs >= ceiling) continue;
    const inventory = supplyFor(recipe, runs);
    const r = call({ activeId: recipe.id, inventory });
    ok(r.accrued === true, `T3: a ${runs}-run supply accrued nothing (${r.reason})`);
    if (!r.accrued) continue;
    ok(r.summary.ticks === runs,
      `T3: a bag holding materials for exactly ${runs} runs produced ${r.summary.ticks} actions. The `
      + 'simulation is not SPENDING the server inventory it reads, so the delta it proposes would '
      + 'debit more than the character owns — hr_apply answers `insufficient_item`, which is not on '
      + "index.ts's DEGRADABLE list, so the player loses the ENTIRE night rather than part of it.");
    for (const [id, per] of Object.entries(inputs)) {
      const moved = (r.delta.items || {})[id];
      /* A recipe whose input is also its output nets out; everything else must
         show exactly `per × runs` leaving the bag. */
      const expect = (recipe.output === id) ? (moved) : -(per * runs);
      ok(moved === expect,
        `T3: after ${runs} runs the delta moves ${id} by ${moved}, expected ${expect}`);
      /* AND NEVER DEEPER THAN THE STACK. The redundant floor in the engine is
         the second of two locks on the one error with no recovery path. */
      ok((inventory[id] || 0) + (moved || 0) >= 0,
        `T3: the delta debits ${id} by ${moved} against a starting stack of ${inventory[id]} — `
        + 'hr_apply would refuse the whole night as insufficient_item');
    }
  }

  /* ── T3b. A CLIENT COUNT BUYS NOTHING. The engine takes ONE inventory, from
     `player_inventory`; there is no second count anywhere in the call. This is
     the mechanical form of that: every hostile spelling of "I have more" is
     inert, and the run still stops at what the server can see. */
  const short = supplyFor(recipe, 5);
  const honest = call({ activeId: recipe.id, inventory: short });
  const forged = call({
    activeId: recipe.id,
    inventory: short,
    // every name a careless or compromised caller might use for "more stuff"
    bag: supplyFor(recipe, 1e6),
    materials: supplyFor(recipe, 1e6),
    clientInventory: supplyFor(recipe, 1e6),
    qty: 1e6,
    inputs: {},
    consumed: {},
    produced: 1e6,
  });
  eq(forged.summary.items, honest.summary.items,
    'T3b: a request-shaped field changed what the run produced. The engine takes a NAMED object and '
    + 'every one of those keys must be inert — this is the mechanical form of "construct the input '
    + 'field by field, never spread a request body".');
  ok(honest.summary.ticks === 5,
    `T3b CONTROL: the honest 5-run supply produced ${honest.summary.ticks} actions, so the comparison `
    + 'above is not measuring the clamp at all');

  /* ── T4. EXHAUSTION IS A STOP: paid, reported, and the POINTER IS CLEARED. */
  const stopped = call({ activeId: recipe.id, inventory: supplyFor(recipe, 3) });
  ok(stopped.accrued === true, `T4: an exhausting run refused (${stopped.reason}) instead of paying `
    + 'the time it worked');
  ok(stopped.delta && stopped.delta.activity
     && stopped.delta.activity.kind === 'idle' && stopped.delta.activity.id === null,
    `T4: a run that ran out of materials left the pointer at ${JSON.stringify(stopped.delta
      && stopped.delta.activity)}. A bench with an empty bag can never pay again, so every future `
    + 'accrual answers "nothing" and the player is stuck on an activity they cannot do.');
  ok(stopped.delta.journal.meta.stopped === ARTISAN_STOP.SUPPLIES,
    `T4: the journal says stopped=${stopped.delta.journal.meta.stopped}, expected 'supplies'`);
  ok(stopped.delta.journal.meta.out_of === limitId || Object.keys(inputs).includes(String(stopped.delta.journal.meta.out_of)),
    `T4: the journal names out_of=${stopped.delta.journal.meta.out_of}, which is not one of this `
    + `recipe's inputs (${Object.keys(inputs)}). "Out of Iron Ore — smithing stopped" is the single `
    + 'most useful sentence in a welcome-back summary and it cannot be inferred.');
  ok(stopped.delta.accrued_to === new Date(NOW_MS).toISOString(),
    'T4: a stopped run did not advance the watermark to now. The remainder of the absence must IDLE '
    + '— paying it later would let one supply run be collected as several nights.');
  void limitQty;

  /* ── T4b. AN EMPTY BAG STILL CLEARS THE POINTER. This is the arm a "nothing
     happened → nothing_accrued" shortcut breaks, and it breaks it PERMANENTLY:
     the second collect of an exhausted bench. */
  const empty = call({ activeId: recipe.id, inventory: {} });
  ok(empty.accrued === true,
    `T4b: a run with NO materials answered ${JSON.stringify({ a: empty.accrued, r: empty.reason })}. `
    + '`nothing_accrued` is a SAFE skip that writes nothing, so the pointer would stay on a bench that '
    + 'can never pay, forever.');
  ok(empty.accrued && empty.delta.activity && empty.delta.activity.kind === 'idle',
    'T4b: an empty-bag run did not clear the pointer');
  ok(empty.accrued && !empty.delta.items && !empty.delta.xp,
    `T4b: an empty-bag run proposed ${JSON.stringify(empty.delta)} — it must move no value at all`);
}

// ════════════════════════════════════════════════════════════════════════
// T5. THE RECIPE GATE IS SERVER-SIDE, AND FAILS CLOSED.
// ════════════════════════════════════════════════════════════════════════
function gateGuard() {
  const gatedEntries = Object.entries(ARTISAN_RECIPES_ALL)
    .filter(([, e]) => e.recipe.gated && benchPayable(e.skill));
  ok(gatedEntries.length > 0,
    'T5: no GATED recipe exists on a payable bench, so the whole `unlockedRecipes` model is untested '
    + 'here. Eight recipes are gated in shipped data; if that changed, this guard needs a new anchor.');
  if (!gatedEntries.length) return;

  const [id, entry] = gatedEntries[0];
  const recipe = entry.recipe;
  const inventory = supplyFor(recipe, 100000);

  /* THE CONTROL FIRST: with the scroll, the night runs. Without it, everything
     below would be "refuses everything" wearing a gate's clothes. */
  const open = call({ activeId: id, inventory, unlockedRecipes: { [recipe.gated]: true } });
  ok(open.accrued === true && open.summary.ticks > 0,
    `T5 CONTROL: with '${recipe.gated}' unlocked, '${id}' produced ${open.accrued ? open.summary.ticks : 0} `
    + 'actions — the gate refuses even when it is satisfied, so every refusal below proves nothing');

  /* Every shape of "I do not have the scroll", each of which is a real server
     answer: no row (`{}`), no model at all (`null`), and the two hostile ones. */
  for (const [why, unlockedRecipes] of [
    ['no progress row', {}],
    ['a database that predates the model', null],
    ['a non-object', 'yes'],
    ['a different scroll', { some_other_scroll: true }],
    ['a falsy value on the right key', { [recipe.gated]: false }],
  ]) {
    const r = call({ activeId: id, inventory, unlockedRecipes });
    ok(r.accrued === true, `T5 [${why}]: refused (${r.reason}) instead of stopping at tick 0`);
    if (!r.accrued) continue;
    ok(r.summary.ticks === 0,
      `T5 [${why}]: '${id}' produced ${r.summary.ticks} actions without the scroll. The gate is the `
      + 'ONLY thing standing between a player and eight recipes they have not earned, and it must be '
      + "the SERVER'S progress row that opens it — never a value the client can author.");
    ok(!r.delta.items && !r.delta.xp,
      `T5 [${why}]: a gated run moved value: ${JSON.stringify(r.delta)}`);
    ok(r.delta.activity && r.delta.activity.kind === 'idle',
      `T5 [${why}]: a gated run left the pointer on a bench that can never pay`);
    ok(r.delta.journal.meta.stopped === ARTISAN_STOP.GATE,
      `T5 [${why}]: the journal says stopped=${r.delta.journal.meta.stopped}, expected 'gate'`);
  }

  /* AND AN UNGATED RECIPE IS UNAFFECTED BY ALL OF IT — the gate must not become
     a global switch. */
  const plain = pickRecipe('smithing', (r) => Object.keys(inputsOf(r)).length >= 1);
  if (plain) {
    const r = call({ activeId: plain.id, inventory: supplyFor(plain, 100000), unlockedRecipes: null });
    ok(r.accrued && r.summary.ticks > 0,
      `T5: an UNGATED recipe produced nothing with unlockedRecipes:null — the gate is refusing `
      + 'everything, which would take 282 of the 290 recipes down with the 8 it is for');
  }
}

// ════════════════════════════════════════════════════════════════════════
// T6. noBurn IS THE SERVER'S, AND THE PAYABILITY MODEL IS THE PROPERTY.
// ════════════════════════════════════════════════════════════════════════
function burnGuard() {
  /* ── T6a. THE PAYABILITY MODEL ITSELF. Driven off the tables, not the name
     "cooking", so it follows the gate rather than restating it. */
  const benches = Object.keys(ARTISAN_RECIPES);
  ok(benches.length > 0, 'T6a: ARTISAN_RECIPES is empty');
  for (const b of benches) {
    const blocked = benchBlockedBy(b);
    ok(benchPayable(b) === (blocked === null),
      `T6a: benchPayable('${b}') and benchBlockedBy('${b}') disagree (${benchPayable(b)} vs ${blocked}) `
      + '— one of them is the answer the engine uses and the other is the reason it reports');
    if (blocked !== null) {
      ok(SERVER_OWNED_BONUS_KEYS.indexOf(blocked) === -1,
        `T6a: '${b}' is blocked by '${blocked}', which IS in SERVER_OWNED_BONUS_KEYS — the predicate `
        + 'is inverted');
    }
  }
  /* ARTISAN_BENCH_COVERAGE: every bench in the DATA must be a bench the model
     has an opinion about — either it has no destructive key (payable by
     default) or it is listed. An unlisted bench pays by default, which is the
     right default and the one that must be a DECISION rather than an oversight. */
  for (const b of benches) {
    ok(typeof benchPayable(b) === 'boolean',
      `T6a COVERAGE: benchPayable('${b}') is not a boolean — the model does not cover a bench the `
      + 'data contains');
  }
  ok(Object.keys(BENCH_DESTRUCTIVE_KEYS).every((b) => benches.includes(b)),
    `T6a: BENCH_DESTRUCTIVE_KEYS names a bench ARTISAN_RECIPES does not have `
    + `(${Object.keys(BENCH_DESTRUCTIVE_KEYS).filter((b) => !benches.includes(b))}) — a gate on a `
    + 'bench that does not exist is decoration');

  /* THE TWO INDEXES AGREE WITH THE PREDICATE, recipe by recipe. This is what
     ./set-activity.js's shape check and src/net/activity.js's downgrade both
     rest on. */
  let payableCount = 0; let blockedCount = 0;
  for (const id of Object.keys(ARTISAN_RECIPES_ALL)) {
    const inPayable = Object.prototype.hasOwnProperty.call(ARTISAN_RECIPES_PAYABLE, id);
    const pred = recipePayable(ARTISAN_RECIPES_ALL, id);
    ok(inPayable === pred,
      `T6a: '${id}' is ${inPayable ? '' : 'NOT '}in ARTISAN_RECIPES_PAYABLE but recipePayable says `
      + `${pred} — the intent's shape check and the engine would disagree about it`);
    if (pred) payableCount++; else blockedCount++;
  }
  ok(payableCount > 0, 'T6a: NO recipe is payable — `artisan` is in PAYABLE_KINDS and pays nothing');

  /* ── T6a-2 (b357). THE TWO NEW BENCHES ARE PAYABLE, BY NAME.
     The default above is "an unlisted bench pays", which is the right default
     and is exactly why it must not be the whole story for a bench that has just
     been ADDED: "it passed because nobody had an opinion about it" and "it was
     reviewed and it is safe" are indistinguishable from a green tick.

     The review, recorded: neither bench can reach a value-DESTROYING bonus key.
     `resolveArtisanAction` rolls the burn only for `skillId === 'cooking'` and
     refunds via craftSave only for `'crafting'`, so every key Runecrafting and
     Stonemason can read is additive — and an additive key sourced from a
     stale-low server copy merely UNDER-pays, which is the direction this engine
     is already deliberately wrong in for renown, the clan castle and companions.
     Cooking is the sole exception in the catalogue because `noBurn` decides
     whether the input becomes the dish or becomes `burnt_food`.

     If a future rung on either bench does need a destructive key, this
     assertion is what forces that to be a decision with a diff attached. */
  for (const bench of ['runecrafting', 'stonemason']) {
    ok(benches.includes(bench),
      `T6a-2: ARTISAN_RECIPES has no '${bench}' lane — the b357 skill did not reach the engine, so `
      + 'every assertion about it below is vacuous');
    ok(benchPayable(bench) === true,
      `T6a-2: '${bench}' is NOT server-payable (blocked by ${benchBlockedBy(bench)}). The accrual `
      + 'engine would refuse every night on it — and because a pointer that can be SET and not PAID '
      + 'is a lockout (see recipePayable), the player could not switch away from it either.');
    ok(BENCH_DESTRUCTIVE_KEYS[bench] === undefined,
      `T6a-2: '${bench}' declares a destructive bonus key. That may well be correct, but it makes the `
      + 'bench unpayable until the key is server-owned end to end — take it to Security rather than '
      + 'shipping a skill the server refuses.');
    const lane = ARTISAN_RECIPES[bench] || [];
    ok(lane.length > 0, `T6a-2: the '${bench}' lane is empty`);
    for (const r of lane) {
      ok(recipePayable(ARTISAN_RECIPES_ALL, r.id),
        `T6a-2: '${r.id}' (${bench}) is not payable, though its bench is — the index and the `
        + 'predicate disagree about one row');
    }
  }

  /* ── T6b. A BLOCKED BENCH IS REFUSED BY NAME, AND THE REFUSAL DEFERS. */
  if (blockedCount > 0) {
    const blockedId = Object.keys(ARTISAN_RECIPES_ALL)
      .find((id) => !recipePayable(ARTISAN_RECIPES_ALL, id));
    const e = ARTISAN_RECIPES_ALL[blockedId];
    const r = call({ activeId: blockedId, inventory: supplyFor(e.recipe, 100000) });
    ok(r.accrued === false && r.reason === SKIP.UNPAYABLE_BENCH,
      `T6b: a recipe on the un-owned '${e.skill}' bench returned `
      + `${JSON.stringify({ a: r.accrued, r: r.reason })} — expected accrued:false / unpayable_bench`);
    ok(!r.delta,
      'T6b: an unpayable bench produced a DELTA. The refusal has to DEFER — this window becomes '
      + 'payable by deploying a commit, so confiscating it would be permanent.');
    ok(r.blockedBy === benchBlockedBy(e.skill) && r.bench === e.skill,
      `T6b: the refusal reports bench=${r.bench} blockedBy=${r.blockedBy}; a refusal that does not `
      + 'name the BONUS KEY sends the reader looking at the bench instead of at the one commit that '
      + 'opens it');
  }

  /* ── T6c. THE BURN RATE COMES FROM THE PERK STACK, AND THE PERK STACK COMES
     FROM `hr_perks_of`. Asserted on the RATE FUNCTION rather than through a
     span, because the bench that burns is the one currently held back — so a
     span-based assertion would be vacuous today and would silently STAY vacuous
     after the gate opens. This is the arithmetic the gate exists to protect. */
  const cookRecipe = pickRecipe('cooking', (r) => r.output && r.xp > 0);
  ok(!!cookRecipe, 'T6c: no cooking recipe with an output — the burn maths is untested');
  if (cookRecipe) {
    const atReq = cookRecipe.req || 1;
    /* The perk stack built from the SERVER's shape — `hr_perks_of`'s envelope,
       `{rooms:{kitchen:n}}` — through the same `makeBonus` the engine calls. */
    const noBurnAt = (rung) => makeBonus(rung == null ? {} : { rooms: { kitchen: rung } })('noBurn') || 0;
    ok(noBurnAt(null) === 0,
      `T6c: a character with NO server unlock row reads noBurn=${noBurnAt(null)} — an absent row must `
      + 'read 0, or the server relieves a burn nobody bought');
    ok(burnChance(cookRecipe, atReq, noBurnAt(null)) === BURN_BASE,
      `T6c: with no Kitchen the burn rate is ${burnChance(cookRecipe, atReq, noBurnAt(null))}, expected `
      + `the base ${BURN_BASE}`);
    const top = noBurnAt(3);
    ok(top > 0,
      'T6c: a Kitchen rung 3 read out of the SERVER envelope grants noBurn=0 — the whole reason the '
      + 'cooking bench is gated is that this number must come from a server row, and it is not '
      + 'arriving');
    ok(burnChance(cookRecipe, atReq, top) < BURN_BASE,
      `T6c: a Kitchen rung does not reduce the burn rate (${burnChance(cookRecipe, atReq, top)} vs `
      + `${BURN_BASE}) — the server would destroy input the player's Range protects`);
    /* THE MAGNITUDE THE GATE IS SIZED ON, measured rather than asserted about:
       what a stale rung actually costs, as a fraction of the input. */
    burnGuard.report = [
      `noBurn: kitchen 0/1/2/3 → burn ${[0, 1, 2, 3].map((n) => (burnChance(cookRecipe, atReq,
        n === 0 ? 0 : noBurnAt(n)) * 100).toFixed(0) + '%').join(' / ')} at ${cookRecipe.id} req level. `
      + `A server reading a stale rung 0 against a client's rung 3 burns `
      + `${(BURN_BASE * 100).toFixed(0)}% of the input. ${blockedCount} of `
      + `${Object.keys(ARTISAN_RECIPES_ALL).length} recipes held back; ${payableCount} payable.`,
    ];
    /* AND THE BURN PRODUCES THE BURNT ITEM, not nothing — a burn that produced
       nothing would look like a smaller night rather than a destroyed one. */
    const rng = { chance: (p) => p > 0, int: (a) => a, next: () => 0.5 };
    const res = resolveArtisanAction(cookRecipe, {
      skillId: 'cooking', inventory: supplyFor(cookRecipe, 10), unlockedRecipes: {}, items: ITEMS,
      cookingLevel: atReq, noBurn: 0, bonus: () => 0, toolCarry: {}, toolDouble: 0, toolXpB: 0, rng,
    });
    ok(res.ok && res.burnt && res.produced && res.produced.id === BURNT_ITEM,
      `T6c: a forced burn produced ${JSON.stringify(res.produced)} — expected ${BURNT_ITEM}`);
  }
}

// ════════════════════════════════════════════════════════════════════════
// T7. SHAPE + HOSTILE INPUT.
// ════════════════════════════════════════════════════════════════════════
const DELTA_KEYS = ['gold', 'gems', 'hp', 'items', 'xp', 'equip', 'activity',
                    'accrued_to', 'farm', 'progress', 'progress_claim', 'journal', 'tool_carry'];
/* The kinds `player_ledger_kind_check` accepts. Restated here deliberately: the
   constraint lives in SQL, this engine writes the value, and a comparison
   between two independent statements of the same list is the only thing that
   catches the two drifting. `artisan` is NOT among them, which is the whole
   reason this assertion exists. */
const LEDGER_KINDS = ['accrue', 'craft', 'gather', 'combat', 'farm', 'trade', 'shop',
                      'quest', 'equip', 'admin', 'iap', 'clan', 'raid'];

function shapeGuard() {
  const recipe = pickRecipe('smithing', (r) => Object.keys(inputsOf(r)).length >= 2);
  if (!recipe) { problems.push('T7: no fixture recipe'); return; }
  const inventory = supplyFor(recipe, 100000);
  const s = call({ activeId: recipe.id, inventory });
  ok(s.accrued === true, `T7: the baseline did not accrue (${s.reason})`);
  if (!s.accrued) return;

  for (const k of Object.keys(s.delta)) {
    ok(DELTA_KEYS.includes(k),
      `T7: delta key '${k}' is not in hr_apply's contract — unknown keys are REJECTED, not ignored, `
      + 'and the rejection costs the player the whole night');
  }
  ok(!('gold' in s.delta), 'T7: an artisan night proposed GOLD. No bench pays gold; a gold key here '
    + 'is a faucet with no source.');
  ok(!('gems' in s.delta), 'T7: an artisan night proposed gems');
  ok(!('equip' in s.delta), 'T7: accrual must not move equipment');
  ok(!('hearth_tokens' in s.delta), 'T7: the bond must never appear in a delta');

  ok(LEDGER_KINDS.includes(s.delta.journal.kind),
    `T7: journal.kind = '${s.delta.journal.kind}' is not accepted by player_ledger_kind_check `
    + `(${LEDGER_KINDS}). The delta would raise check_violation inside hr_apply's protected block, `
    + 'come back as bad_delta, and cost the player the entire night.');
  ok(s.delta.journal.kind === 'craft',
    `T7: journal.kind = '${s.delta.journal.kind}'. It must be 'craft' — the LEDGER's vocabulary and `
    + "`hr_activities`'s vocabulary are two different lists and this is the one place they differ.");
  ok(s.delta.journal.intent === 'accrue', `T7: journal.intent = '${s.delta.journal.intent}'`);
  /* AGGREGATE, not per-action. `game_events` reached 1.6M rows / 229 MB from six
     players in four days by journalling every kill; a 12h smithing night is
     ~14,000 actions. */
  ok(typeof s.delta.journal.meta === 'object' && !Array.isArray(s.delta.journal.meta),
    'T7: journal.meta is not a scalar bag');
  ok(Object.keys(s.delta.journal.meta).length <= 16,
    `T7: journal.meta carries ${Object.keys(s.delta.journal.meta).length} keys — the journal is ONE `
    + 'row of scalars per accrual, never a log');
  for (const v of Object.values(s.delta.journal.meta)) {
    ok(!Array.isArray(v) && (v === null || typeof v !== 'object'),
      `T7: journal.meta holds a nested ${JSON.stringify(v).slice(0, 60)} — per-action detail in the `
      + 'ledger is the mistake game_events already made at 229 MB');
  }

  const ints = [];
  for (const [k, v] of Object.entries(s.delta.xp || {})) ints.push([`xp.${k}`, v]);
  for (const [k, v] of Object.entries(s.delta.items || {})) ints.push([`items.${k}`, v]);
  for (const p of s.delta.progress || []) ints.push([`progress.${p.key}`, p.add]);
  for (const [k, v] of ints) {
    ok(Number.isInteger(v) && Number.isFinite(v),
      `T7: ${k} = ${v} is not an integer — hr_apply casts with ::bigint and would return bad_delta`);
    ok(v >= 0 || k.startsWith('items.'),
      `T7: ${k} = ${v} is negative. \`items\` is the ONE signed map; a negative xp or progress from `
      + 'an accrual would make a rollback indistinguishable from an exploit.');
  }
  /* ── ONE COUNTER, ONE KEY ACROSS THE THREE PATHS. A gathering tool double
     and a smithing tool double are the same fact on the same character; two
     spellings would be two half-counters that no screen could total, and
     `state.stats` is keyed `toolDoubles` in core while the server's progress
     rows are snake_case — which is exactly where the slip happens. Read the
     GATHER path's key out of a real gather accrual rather than restating it. */
  {
    const node = Object.keys(GATHER_NODES)[0];
    const g = computeAccrual({
      userId: '00000000-0000-4000-8000-000000000001', slot: 0,
      nowMs: NOW_MS, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
      activeKind: 'gather', activeId: node, capMs: 12 * 3600000, seed: SEED,
      hp: 60, maxHp: 60, gold: 0, skills: { ...SKILLS }, equipment: {}, inventory: {},
      autoEatEnabled: false, autoEatFood: null, autoEatPct: 0, toolCarry: {},
      perks: null, unlockedRecipes: {},
      items: ITEMS, monsters: MONSTERS, nodes: GATHER_NODES, recipes: ARTISAN_RECIPES_ALL,
    });
    const keysOf = (r) => new Set((r.accrued ? r.delta.progress || [] : [])
      .filter((p) => p.kind === 'stat').map((p) => p.key));
    const gatherKeys = keysOf(g);
    ok(gatherKeys.size > 0,
      'T7 CONTROL: a gather accrual emitted no stat rows, so the key comparison below is vacuous');
    ok(!gatherKeys.has('toolDoubles'),
      'T7: the GATHER path emits `toolDoubles` — this assertion was written against `tool_doubles` '
      + 'and the two paths have swapped underneath it');
    /* The artisan path must use whatever the gather path uses, and the only way
       to be sure is to make the tool-double fixture produce one. */
    const withTool = call({
      activeId: pickRecipe('smithing', (r) => Object.keys(inputsOf(r)).length >= 1).id,
      inventory: supplyFor(pickRecipe('smithing', (r) => Object.keys(inputsOf(r)).length >= 1),
        200000, { [bestOwnedTool('smithing')]: 1 }),
    });
    ok(withTool.accrued && withTool.summary.toolDoubles > 0,
      'T7 CONTROL: the tool fixture earned no doubles, so the key assertion below is vacuous');
    const artisanKeys = keysOf(withTool);
    ok(artisanKeys.has('tool_doubles') && !artisanKeys.has('toolDoubles'),
      `T7: the artisan builder journals the tool-double counter as `
      + `${[...artisanKeys].filter((k) => /tool/i.test(k))} while the gather builder uses `
      + `${[...gatherKeys].filter((k) => /tool/i.test(k))}. One counter, one key — two spellings are `
      + 'two half-counters on one character that never add up.');
  }

  for (const p of s.delta.progress || []) {
    ok(['stat', 'daily', 'flag'].includes(p.kind),
      `T7: a progress op of kind '${p.kind}'. 'unlock' is deliberately NOT in hr_apply's allowlist `
      + '(its merge is additive, so two cheap rungs would buy an expensive one).');
  }

  /* ── THE CARRY SWITCH, both halves. `null` in ⇒ no key out, because hr_apply
     answers `unknown_delta_key` with a 409 that costs the whole night. */
  const noColumn = call({ activeId: recipe.id, inventory, toolCarry: null });
  ok(noColumn.accrued && !('tool_carry' in noColumn.delta),
    'T7: the engine proposed a `tool_carry` key with no column to write it to');
  eq(noColumn.summary.items, s.summary.items,
    'T7: the FIRST span differs depending on whether the carry column exists — it must not');

  /* ── HOSTILE INPUT. The engine takes a NAMED object, so the proof is that
     every smuggled key is inert. */
  const fingerprint = (r) => JSON.stringify({
    ticks: r.summary && r.summary.ticks, xp: r.summary && r.summary.xp,
    items: r.summary && r.summary.items, grantMs: r.grantMs, tickMs: r.tickMs,
  });
  const base = fingerprint(s);
  const attacks = {
    tickMs: 1, minTickMs: 1, minStepMs: 1, stepMs: 1, interval_ms: 1,
    ticks: 43_200_000, atMs: 0, fromMs: 0, toMs: NOW_MS + 365 * 86400000,
    elapsedMs: 365 * 86400000, elapsed: 365 * 86400000, grantMs: 365 * 86400000,
    spanMs: 365 * 86400000, away: false, rateMult: 1000, capped: false,
    bonus: () => 10, rng: createRng(1), ctx: { tickMs: 1, minStepMs: 1 },
    delta: { gold: 1e12 }, hearth_tokens: 1e9,
    buffs: [{ type: 'smith_speed', magnitude: 90, remainingMs: 86400000 }],
    noBurn: 1, unlocked: true, gated: false,
  };
  for (const [k, v] of Object.entries(attacks)) {
    const r = call({ activeId: recipe.id, inventory, [k]: v });
    ok(fingerprint(r) === base, `T7 HOSTILE: request field '${k}' changed the grant — it must be inert`);
  }
  const all = call({ activeId: recipe.id, inventory, ...attacks });
  ok(fingerprint(all) === base, 'T7 HOSTILE: the combined hostile payload changed the grant');

  /* THE CAP AND THE SECOND WATERMARK apply to this path too — they are
     properties of an ABSENCE, computed before the kind branch, and asserting
     them here is what proves the branch did not skip the preamble. */
  const capped = call({
    activeId: recipe.id, inventory,
    accruedToMs: NOW_MS - 18 * 3600000, activeSinceMs: NOW_MS - 18 * 3600000,
    capMs: 12 * 3600000,
  });
  ok(capped.grantMs === 12 * 3600000, `T7 CAP: an 18h absence at a 12h cap granted ${capped.grantMs}ms`);
  ok(capped.capped === true, 'T7 CAP: a capped grant did not report capped:true');
  ok(capped.delta.accrued_to === new Date(NOW_MS).toISOString(),
    'T7 CAP: a capped grant must still advance the watermark to now — otherwise the cap is drainable '
    + 'in instalments');
  ok(capped.summary.windowFrom === NOW_MS - 18 * 3600000
     && capped.summary.windowTo === NOW_MS - 6 * 3600000,
    `T7 CAP: the credited window is [${capped.summary.windowFrom}, ${capped.summary.windowTo}] — `
    + 'Ruling 2 credits the FIRST grantMs after the player left, not the last before they came back');

  const stale = call({
    activeId: recipe.id, inventory,
    accruedToMs: NOW_MS - 11 * 3600000, activeSinceMs: NOW_MS - 30 * 60000,
  });
  ok(stale.grantMs === 30 * 60000,
    `T7 WATERMARK: a stale accrued_to paid ${stale.grantMs}ms for a bench that is 30 minutes old`);

  for (const [name, over] of [
    ['no elapsed time', { accruedToMs: NOW_MS }],
    ['a future watermark', { accruedToMs: NOW_MS + 86400000 }],
    ['a sub-threshold absence', { accruedToMs: NOW_MS - 59_999 }],
    ['a zero cap', { capMs: 0 }],
    ['a missing active_since', { activeSinceMs: null }],
  ]) {
    const r = call({ activeId: recipe.id, inventory, ...over });
    ok(r.accrued === false, `T7 SKIP: ${name} produced a grant (${JSON.stringify(r.grantMs)})`);
    ok(!r.delta, `T7 SKIP: ${name} produced a delta`);
  }
}

// ════════════════════════════════════════════════════════════════════════
// T8. THE DEGRADE LADDER SHRINKS THE PROPOSAL. (Security C1.)
//
// index.ts answers a clamp rejection by asking the engine for something smaller
// and re-applying, three times, and then FORFEITS THE NIGHT. So the ladder's
// only job is to make each rung strictly smaller than the last — and for
// artisan the shipped implementation (halve `grantMs`) does not, because an
// artisan night is bounded by the BAG whenever the player left less material
// than the clock could consume. Halving the span of a bag-bound run changes
// nothing at all until the span drops below what the bag could fill.
//
// The fixture is built from the DATA rather than described: a recipe, and a bag
// sized so the run is bag-bound at the full span AND still bag-bound at half of
// it. That is the exact condition, and it is asserted to hold before anything
// else is measured — otherwise this whole section would pass on a fixture that
// never reproduced the bug.
// ════════════════════════════════════════════════════════════════════════
function ladderGuard() {
  const recipe = pickRecipe('smithing', (r) => Object.keys(inputsOf(r)).length >= 1 && (r.ms || 0) >= 3000);
  ok(!!recipe, 'T8: no fixture recipe');
  if (!recipe) return;

  const SPAN_H = 24;
  const from = NOW_MS - SPAN_H * 3600000;
  const run = (over) => computeAccrual({
    userId: '00000000-0000-4000-8000-000000000001', slot: 0,
    nowMs: NOW_MS, accruedToMs: from, activeSinceMs: from,
    activeKind: 'artisan', activeId: recipe.id,
    capMs: SPAN_H * 3600000, actionBudget: null, seed: SEED,
    hp: 60, maxHp: 60, gold: 0, skills: { ...SKILLS }, equipment: {}, inventory: {},
    autoEatEnabled: false, autoEatFood: null, autoEatPct: 0, toolCarry: {},
    perks: null, unlockedRecipes: {},
    items: ITEMS, monsters: MONSTERS, nodes: GATHER_NODES, recipes: ARTISAN_RECIPES_ALL,
    ...over,
  });

  /* THE FIXTURE'S PRECONDITION, MEASURED. `clockBound` is what the span alone
     would run; the bag is then set to something strictly under HALF of it, so
     the run is bag-bound at the full span and still bag-bound at half. */
  const clockBound = run({ inventory: supplyFor(recipe, 1e7) }).summary.ticks;
  ok(clockBound > 40,
    `T8: the fixture only runs ${clockBound} actions in ${SPAN_H}h — too few to halve twice`);
  const bagRuns = Math.floor(clockBound / 4);
  const inventory = supplyFor(recipe, bagRuns);

  const full = run({ inventory });
  ok(full.accrued === true, `T8: the bag-bound fixture accrued nothing (${full.reason})`);
  if (!full.accrued) return;
  ok(full.summary.ticks === bagRuns,
    `T8 PRECONDITION: the fixture ran ${full.summary.ticks} actions against a ${bagRuns}-run bag, so it `
    + 'is NOT bag-bound and this section is testing the wrong thing');

  /* ── (a) THE DEFECT, REPRODUCED. Halving the SPAN — what index.ts did before
     b356 — proposes a BYTE-IDENTICAL delta. The ladder spends a rung, earns the
     same rejection, and is one rung closer to the forfeit that pays nothing.
     This assertion is what goes RED if somebody "simplifies" degradeStep back
     to a span halving: the two would then agree and (b) would fail. */
  const halvedSpan = run({ inventory, capMs: Math.floor(full.grantMs / 2) });
  ok(halvedSpan.accrued && halvedSpan.summary.ticks === full.summary.ticks,
    `T8 PRECONDITION: halving the span changed the action count ${full.summary.ticks} -> `
    + `${halvedSpan.accrued ? halvedSpan.summary.ticks : 'nothing'}, so the fixture does not reproduce `
    + 'the bag-bound case C1 is about and (b) below would prove nothing');
  eq(halvedSpan.delta.items, full.delta.items,
    'T8: the fixture is not producing an identical delta at half the span — see above');

  /* ── (b) THE FIX. `degradeStep` must strictly shrink the PROPOSAL at every
     rung, and by roughly half, whether the clock or the bag was binding. */
  let out = full;
  const rungs = [];
  for (let attempt = 1; attempt <= 4; attempt++) {
    const step = degradeStep(out, attempt);
    if (!step) break;
    const next = run({ inventory, capMs: step.capMs, actionBudget: step.actionBudget });
    ok(next.accrued === true,
      `T8: rung ${attempt} accrued nothing (${next.reason}) — the ladder must stay on a payable `
      + 'proposal until degradeStep says there is nothing smaller left');
    if (!next.accrued) break;
    ok(next.summary.ticks < out.summary.ticks,
      `T8: rung ${attempt} proposed ${next.summary.ticks} actions against the previous rung's `
      + `${out.summary.ticks}. A rung that does not SHRINK the proposal earns the identical clamp `
      + 'rejection and burns one of the three attempts standing between the player and a forfeited '
      + 'night. This is Security C1.');
    /* HALF, not merely smaller — a ladder that shaves 1% terminates in theory
       and forfeits in practice. One action of slack for the floor. */
    ok(Math.abs(next.summary.ticks - Math.floor(out.summary.ticks / 2)) <= 1,
      `T8: rung ${attempt} ran ${next.summary.ticks} actions where half of ${out.summary.ticks} is `
      + `${Math.floor(out.summary.ticks / 2)} — the rung is not a halving`);
    /* AND THE XP FALLS WITH IT. Ticks are the proxy; XP is the dimension the
       clamp actually measures, and asserting the proxy alone would miss a
       change that shrank the count and not the grant. */
    const xpOf = (r) => Math.max(0, ...Object.values(r.delta.xp || { x: 0 }));
    ok(xpOf(next) < xpOf(out),
      `T8: rung ${attempt} shrank the action count but not the XP (${xpOf(out)} -> ${xpOf(next)})`);
    rungs.push(next.summary.ticks);
    out = next;
  }
  ok(rungs.length >= 3,
    `T8: the ladder produced only ${rungs.length} usable rung(s) (${rungs}) — index.ts takes up to `
    + 'MAX_DEGRADE = 3 before forfeiting, so fewer than three means it forfeits early');

  /* ── (c) A BUDGET STOP IS NOT A BENCH STOP. The player is still at the bench;
     only the CALLER stopped asking. Clearing the pointer here would end the
     player's run every time a clamp fired — a punishment for a server-side
     limit, applied to the one path where the limit is reached by honest play. */
  const budgeted = run({ inventory, actionBudget: Math.max(1, Math.floor(bagRuns / 2)) });
  ok(budgeted.accrued === true, `T8c: a budgeted run refused (${budgeted.reason})`);
  if (budgeted.accrued) {
    ok(!budgeted.delta.activity,
      `T8c: a run truncated by the LADDER cleared the pointer (${JSON.stringify(budgeted.delta.activity)}). `
      + 'The bag is not empty and the recipe is not locked — the player is still smithing, and a clamp '
      + 'rejection must not end their run.');
    ok(budgeted.delta.journal.meta.stopped === 'budget',
      `T8c: the journal says stopped=${budgeted.delta.journal.meta.stopped}, expected 'budget'. A `
      + "budget stop reported as `supplies` names an ingredient that is still in the bag — a "
      + 'welcome-back line that is simply false.');
    ok(budgeted.delta.journal.meta.out_of == null,
      `T8c: a budget stop named out_of=${budgeted.delta.journal.meta.out_of}, which is still in the bag`);
  }

  /* ── (d) THE BUDGET IS SAFE IN THE HOSTILE DIRECTION. It is derived by
     index.ts from the engine's own previous answer and never from a request —
     but if it ever were forged, it may only ever REDUCE. */
  const unbounded = run({ inventory, actionBudget: null });
  for (const [why, v] of [
    ['a huge budget', Number.MAX_SAFE_INTEGER],
    ['Infinity', Infinity],
    ['a string', '999999999'],
    ['NaN', NaN],
    ['undefined', undefined],
  ]) {
    const r = run({ inventory, actionBudget: v });
    ok(r.accrued && r.summary.ticks <= unbounded.summary.ticks,
      `T8d: ${why} produced ${r.accrued ? r.summary.ticks : 'nothing'} actions against an unbounded `
      + `${unbounded.summary.ticks}. The budget must never be able to BUY work — only to give it up.`);
  }
  for (const [why, v] of [['zero', 0], ['a negative', -5]]) {
    const r = run({ inventory, actionBudget: v });
    ok(!r.accrued || r.summary.ticks === 0,
      `T8d: ${why} budget ran ${r.accrued ? r.summary.ticks : 0} actions — expected none`);
  }
  /* ⚠ THE `null` TRAP, PINNED. `Number(null)` is 0, which is FINITE, so the
     obvious implementation reads an ABSENT budget as a budget of ZERO and every
     artisan accrual returns `nothing_accrued`. It did exactly that on the first
     run after the field was wired. Both callers that pass `null` explicitly —
     index.ts's first attempt and set-activity.js's ladderless collect — depend
     on this. */
  ok(unbounded.accrued && unbounded.summary.ticks > 0,
    'T8d: `actionBudget: null` produced NO actions. `Number(null)` is 0 and finite; an absent budget '
    + 'must mean UNBOUNDED, or every first-attempt accrual and every collect pays nothing.');

  /* ── (e) THE OTHER KINDS STILL DEGRADE BY SPAN, unchanged. A single
     degradeStep serving three kinds is exactly where one kind's fix becomes
     another kind's regression. */
  const combat = computeAccrual({
    userId: '00000000-0000-4000-8000-000000000001', slot: 0,
    nowMs: NOW_MS, accruedToMs: from, activeSinceMs: from,
    activeKind: 'combat', activeId: Object.keys(MONSTERS)[0],
    capMs: SPAN_H * 3600000, actionBudget: null, seed: SEED,
    hp: 60, maxHp: 60, gold: 0, skills: { ...SKILLS }, equipment: {}, inventory: {},
    autoEatEnabled: false, autoEatFood: null, autoEatPct: 0, toolCarry: {},
    perks: null, unlockedRecipes: {},
    items: ITEMS, monsters: MONSTERS, nodes: GATHER_NODES, recipes: ARTISAN_RECIPES_ALL,
  });
  if (combat.accrued) {
    const step = degradeStep(combat, 1);
    ok(step && step.actionBudget === null,
      `T8e: degradeStep gave a COMBAT attempt an actionBudget (${step && step.actionBudget}). Combat `
      + 'output is proportional to time, the engine has no action cap on that path, and a budget there '
      + 'would be silently ignored — a rung that shrinks nothing.');
    ok(step && step.capMs === Math.floor(combat.grantMs / 2),
      `T8e: degradeStep halved a combat span to ${step && step.capMs}, expected `
      + `${Math.floor(combat.grantMs / 2)}`);
  }
  ok(degradeStep(null, 1) === null && degradeStep({ accrued: false }, 1) === null,
    'T8: degradeStep must answer null for a non-accruing attempt rather than proposing a rung off '
    + 'an absent summary');
}

// ════════════════════════════════════════════════════════════════════════
export async function runAll() {
  problems.length = 0;
  unsimulatedKindGuard();
  ladderGuard();
  parityGuard();
  materialGuard();
  gateGuard();
  burnGuard();
  shapeGuard();
  /* The span function itself is imported and exercised above through
     computeAccrual; assert it is the real one rather than a stub, because an
     accidental re-export of a no-op would make every "produced 0" assertion
     pass. */
  ok(typeof simulateArtisanSpan === 'function' && simulateArtisanSpan.length >= 2,
    'artisan: simulateArtisanSpan is not the two-argument span function');
  ok(typeof indexArtisanRecipes === 'function', 'artisan: indexArtisanRecipes is missing');
  return problems.slice();
}

/* ══════════════════════════════════════════════════════════════════════════
   THE MUTATION CATALOGUE (`node tests/artisan-accrual.mjs --selftest`).

   A guard nothing has ever seen fail is a guard nobody knows works. Each entry
   plants a REAL defect — the shape somebody would actually write — in the real
   file, re-runs this guard AND tests/activity-seam.mjs in CHILD PROCESSES (the
   ESM module cache makes an in-process re-import useless), and restores the
   file. A mutation nothing catches is reported SLIPPED and exits 1.

   Anchors are whole LINES, compared with the trailing `\r` stripped, because
   this repo is checked out CRLF and a substring anchor written on a Unix box
   silently matches nothing.
   ══════════════════════════════════════════════════════════════════════════ */
const ENGINE = 'supabase/functions/hr-accrue/accrual.js';
const INTENT = 'supabase/functions/hr-accrue/set-activity.js';
const CORE = 'src/core/artisan-sim.js';
const CLIENT = 'src/net/activity.js';
const SWEEP = 'tests/accrual-engine.mjs';
const BUDGET = 'supabase/migrations/2026-08-16-day-budget-artisan.sql';

export const MUTATIONS = [
  ['M1  the input debit does not spend the bag', [
    [ENGINE, '      bag[id] = have - take;', '      /* MUTATED */'],
  ], 'production is bounded by the clock instead of by the server inventory'],
  ['M2  journal.kind names the activity instead of the ledger kind', [
    [ENGINE, "      kind: 'craft',", "      kind: 'artisan',"],
  ], 'player_ledger_kind_check refuses it; hr_apply answers bad_delta and the night is lost'],
  ['M3  a stopped run does not clear the pointer', [
    [ENGINE, "  if (stopped) delta.activity = { kind: 'idle', id: null };", '  /* MUTATED */'],
  ], 'the player is stuck on a bench with an empty bag forever'],
  ['M4  an absent unlockedRecipes map fails OPEN', [
    [ENGINE, "    unlockedRecipes: (inp.unlockedRecipes && typeof inp.unlockedRecipes === 'object')",
      '    unlockedRecipes: (true'],
    [ENGINE, '      ? inp.unlockedRecipes : null,',
      '      ? new Proxy({}, { has: () => true, get: () => true }) : null),'],
  ], 'eight gated recipes become free'],
  ['M5  the engine stops refusing an unpayable bench', [
    [ENGINE, '    if (!benchPayable(bench)) {', '    if (false && !benchPayable(bench)) {'],
  ], 'the server cooks at the base 25% burn against a Kitchen it cannot see'],
  ['M6  a kind is widened with no simulation', [
    [ENGINE, "export const PAYABLE_KINDS = Object.freeze(['combat', 'gather', 'artisan']);",
      "export const PAYABLE_KINDS = Object.freeze(['combat', 'gather', 'artisan', 'farm']);"],
  ], 'the exact edit the block above PAYABLE_KINDS describes'],
  ['M6b a simulation becomes unreachable', [
    [ENGINE, "export const PAYABLE_KINDS = Object.freeze(['combat', 'gather', 'artisan']);",
      "export const PAYABLE_KINDS = Object.freeze(['combat', 'gather']);"],
  ], 'the other direction: 290 catalogue rows silently stop paying'],
  ['M6c the total branch is deleted (dispatch neutralised first)', [
    [ENGINE, '  t.gather = accrueGather;', '  t.gather = null;'],
    [ENGINE, "  if (inp.activeKind !== 'combat') return { accrued: false, reason: SKIP.UNSUPPORTED };",
      '  /* MUTATED */'],
  ], 'an unsimulated kind falls into the combat tail and is priced against nothing'],
  ['M7  nothing-happened swallows a first-tick stop', [
    [ENGINE, '  if (nothingHappened && !stopped) return { accrued: false, reason: SKIP.NOTHING, summary };',
      '  if (nothingHappened) return { accrued: false, reason: SKIP.NOTHING, summary };'],
  ], 'the second collect of an exhausted bench leaves the pointer stuck'],
  ['M8  set_activity accepts an unpayable bench', [
    [INTENT, '    if (!catalogueHas(ARTISAN_RECIPES_PAYABLE, decl.id)) {',
      '    if (false && !catalogueHas(ARTISAN_RECIPES_PAYABLE, decl.id)) {'],
  ], 'the pointer can hold a bench the engine refuses — the switch lockout'],
  ['M9  the step interval is captured once instead of re-derived per slice', [
    [CORE, '    stepMs: () => { lastStep = artisanIntervalMs(state, skill, recipe, c); return lastStep; },',
      '    stepMs: () => { lastStep = 3000; return lastStep; },'],
  ], "b347's bug, on this bench: a ten-minute buff pays for a whole night"],
  ['M10 the client stops downgrading an unpayable recipe', [
    [CLIENT, "  if (kind === 'artisan'", "  if (false && kind === 'artisan'"],
  ], 'a cooking gesture earns a 409 and leaves the server paying for the previous activity'],
  /* ── SECURITY C1. THE DEFECT AS IT SHIPPED: the ladder halves the SPAN. On a
     bag-bound artisan night that changes nothing, so the rung is spent for
     nothing and the night is one step closer to the forfeit that pays zero. */
  ['C1a the ladder degrades the SPAN instead of the action budget', [
    [ENGINE, "  if (kind === 'craft') {", '  if (false) {'],
  ], 'a bag-bound rung proposes a byte-identical delta and burns an attempt'],
  ['C1b the action budget is ignored by the simulation', [
    [CORE, '        if (budgetLeft <= 0) {', '        if (false) {'],
  ], 'degradeStep asks for less and the span runs the full amount anyway'],
  ['C1c an absent budget is read as ZERO (the Number(null) trap)', [
    [CORE, "  const rawBudget = (c.maxActions === null || c.maxActions === undefined)",
      '  const rawBudget = (false'],
  ], 'every first-attempt accrual and every collect returns nothing_accrued'],
  ['C1d a budget stop clears the activity pointer', [
    [ENGINE, '  const stopped = summary.stoppedBy === ARTISAN_STOP.SUPPLIES',
      '  const stopped = summary.stoppedBy || summary.stoppedBy === ARTISAN_STOP.SUPPLIES'],
  ], "a clamp rejection ends the player's run as a side effect"],
  /* ── THE FUSE-SIZING GUARD ITSELF (Security ruling 2026-08-16). Five ways to
     make it stop meaning anything, each of which would leave a green suite. */
  ['S1  the day-budget raise is reverted', [
    [BUDGET, '  c_day_qty_budget  constant bigint := 70000000;',
      '  c_day_qty_budget  constant bigint := 1000000;'],
  ], 'the qty fuse fires on an ordinary fletching night'],
  ['S2  the day-budget xp raise is reverted', [
    [BUDGET, '  c_day_xp_budget   constant bigint := 120000000;',
      '  c_day_xp_budget   constant bigint := 40000000;'],
  ], 'the xp fuse sits at 87.8% of honest play'],
  ['S3  the guard reads the FIRST budget migration, not the last', [
    [SWEEP, '    if (Object.keys(b).length) found = { budgets: b, file: f };',
      '    if (Object.keys(b).length && !found) found = { budgets: b, file: f };'],
  ], 'the ceiling graded is one a later migration already superseded'],
  ['S4  the blocking arm sweeps the 24h fuse ceiling again', [
    [SWEEP, 'const REACHABLE_CAP_H = reachableCapHours();',
      'const REACHABLE_CAP_H = 24;'],
  ], 'the build fails on a span no character in production can hold'],
  /* S5/S6 mutate the BASELINE rather than the assertion that reads it, and that
     is the only form that proves anything: weakening a check nothing currently
     violates stays green, so the mutation has to introduce the violation. Both
     are shaped like the real regression — a yield that grew past what Security
     measured, and a recipe that fell off the list. */
  ['S5  an amnestied yield grows past what Security measured', [
    [SWEEP, '  fletch_dawnpoint_arrows: 7670000,   // outputQty 1000',
      '  fletch_dawnpoint_arrows: 7000000,   // outputQty 1000'],
  ], 'the ratchet must fire — a worse yield pushes the ladder past MAX_DEGRADE and pays zero'],
  ['S6  a recipe crosses the clamp with no amnesty', [
    [SWEEP, '  fletch_bronze_arrows: 5273000,      // outputQty 500', '  // removed'],
  ], 'a NEW recipe over the per-call clamp must be a new decision, not an inherited one'],
];

const SEAM_PROBE = "import('./tests/activity-seam.mjs').then(async (m)=>{const p=await m.runAll();"
  + 'if(p.length){console.log(p[0]);process.exit(1)}})';

async function selftest() {
  const { readFile, writeFile } = await import('node:fs/promises');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);

  let slipped = 0;
  for (const [name, sites, why] of MUTATIONS) {
    const originals = new Map();
    for (const [file] of sites) {
      if (!originals.has(file)) originals.set(file, await readFile(file, 'utf8'));
    }
    let bad = null;
    for (const [file, find, repl] of sites) {
      const lines = (await readFile(file, 'utf8')).split('\n');
      const hits = lines.filter((l) => l.replace(/\r$/, '') === find).length;
      /* AN ANCHOR THAT MATCHES 0 OR 2 LINES IS A FAILURE, NOT A SKIP. A
         mutation harness whose anchors have drifted reports every mutation as
         "nothing to do" and exits 0, which is the loudest possible way to be
         silently useless. */
      if (hits !== 1) { bad = `${file}: anchor matched ${hits} line(s)`; break; }
      await writeFile(file, lines.map((l) => (l.replace(/\r$/, '') === find
        ? repl + (l.endsWith('\r') ? '\r' : '') : l)).join('\n'), 'utf8');
    }
    const red = [];
    if (!bad) {
      try { await run('node', ['tests/artisan-accrual.mjs'], { maxBuffer: 1e8 }); }
      catch (e) {
        const first = String(e.stdout || '').split('\n').filter((l) => l.trim().startsWith('x '))[0];
        red.push('artisan-accrual: ' + (first || 'RED').trim().slice(0, 150));
      }
      try { await run('node', ['-e', SEAM_PROBE], { maxBuffer: 1e8 }); }
      catch (e) { red.push('seam: ' + String(e.stdout || e.message).trim().slice(0, 150)); }
      /* THE FUSE-SIZING SWEEP runs here too, because the S-series mutations
         (the day-budget raise, the chain read, the reachable cap, the amnesty)
         are only visible to it — and a mutation harness whose probes cannot see
         the file being mutated reports SLIPPED for the right reason and
         CAUGHT-by-accident for the wrong one. */
      try { await run('node', ['tests/accrual-engine.mjs'], { maxBuffer: 1e8 }); }
      catch (e) {
        const first = String(e.stdout || '').split('\n').filter((l) => l.trim().startsWith('x '))[0];
        red.push('accrual-engine: ' + (first || 'RED').trim().slice(0, 150));
      }
    }
    for (const [file, orig] of originals) await writeFile(file, orig, 'utf8');
    if (bad) { console.log(`ANCHOR-FAIL ${name}: ${bad}`); slipped++; continue; }
    if (!red.length) slipped++;
    console.log(`  ${red.length ? 'CAUGHT ' : 'SLIPPED'} ${name}`);
    console.log(`            ${red.length ? red[0] : why}`);
  }
  if (slipped) {
    console.log(`\n${slipped} mutation(s) SLIPPED — the guard cannot see them.`);
    process.exit(1);
  }
  console.log(`\nall ${MUTATIONS.length} mutations CAUGHT.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href
    && process.argv.includes('--selftest')) {
  await selftest();
} else if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const found = await runAll();
  if (found.length) {
    console.log('Artisan accrual guard — FAILED:');
    for (const p of found) console.log('  x ' + p);
    process.exit(1);
  }
  console.log('Artisan accrual guard — a smithing night pays what the client pays, materials are the '
    + "server's, exhaustion stops and clears the pointer, the recipe gate is a server row.");
  for (const line of burnGuard.report || []) console.log(`  ${line}`);
  /* The fixtures, printed. A parity number nobody sees is a number nobody
     notices moving — the same reason the clamp headroom is printed. */
  for (const f of FIXTURES) {
    const r = f.pick();
    if (!r || !benchPayable(f.skill)) continue;
    const toolId = f.tool ? bestOwnedTool(f.skill) : null;
    const g = call({ activeId: r.id, inventory: supplyFor(r, 200000, toolId ? { [toolId]: 1 } : {}) });
    if (!g.accrued) { console.log(`  artisan: ${r.id} — ${g.reason}`); continue; }
    console.log(`  artisan: ${r.id} (${f.skill}${toolId ? ' + ' + toolId : ''}) · ${g.tickMs}ms · `
      + `${g.summary.ticks} actions · ${JSON.stringify(g.delta.items)} · `
      + `${JSON.stringify(g.summary.xp)} · +${g.summary.toolDoubles} tool doubles`);
  }
}
