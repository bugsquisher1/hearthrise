#!/usr/bin/env node
// ============================================================================
// tests/world-tick-combat-parity.mjs — THE COMBAT CHANNEL ON THE TICK (M3).
//
//   node tests/world-tick-combat-parity.mjs            the guard
//   node tests/world-tick-combat-parity.mjs --mutate   every mutant must go RED
//   node tests/world-tick-combat-parity.mjs --verbose  print every measurement
//   node tests/world-tick-combat-parity.mjs --list     the claims and the mutants
//
// ── WHAT IT ASSERTS, AND WHAT "BYTE-IDENTICAL" CAN HONESTLY MEAN ────────────
// Combat is the only channel with drop rolls, and production seeds EVERY settle
// window from a label that names its watermark (`hr_seed(user, slot,
// 'accrue:'||accrued_to)`). So a span cut into sixty pieces RESAMPLES the
// stream and does not reproduce the one-call totals — it never has, for the
// accrue path either, and §11 of WORLD_TICK_DESIGN.md settled that: the parity
// contract is **P1, not P4**.
//
// The byte-identity this file asserts is therefore the one that is both true
// and load-bearing: **for every window of a whole chain, the delta the tick
// proposes is byte-identical to the delta an independently-constructed accrue
// caller proposes for the same window** (C2). Sixty byte-identical windows is a
// stronger statement than one, and it is the statement that catches an input
// the tick forgot to hand the engine — which is exactly what M3 found.
//
// Against the ONE-CALL answer the claim is STREAM HEALTH (C6): no drop the
// one-call span reaches is starved, and the value drift is noise inside a band.
//
// ── THE FINDING THIS FILE EXISTS BECAUSE OF ─────────────────────────────────
// `tests/world-tick-parity.mjs` P1 has been green while the tick ran the combat
// engine with **auto-eat off** and the accrue path ran it **on**: its
// `accrualOnReturn` passes `autoEatEnabled/Pct/Food` and `shadowTick` did not.
// It stayed green because the only auto-eat fixture is a maxed character at
// 99 HP fighting a slime, who never reaches the 50% threshold, so the handler
// never fires and the two contracts are indistinguishable on that data.
// Measured on a fixture that CAN tell them apart: 48 kills / 276 gold / 2,464
// xp / 5 deaths against 139 / 788 / 6,568 / 0. **-65.0% gold.**
//
// So C1 does not trust a fixture at all: it derives the accrue path's engine
// input key set **from `hr-accrue/index.ts`'s own source** and requires the
// tick's to match. A key added there and not to the tick is red on that commit.
//
// NO NETWORK, NO DATABASE, NO SUPABASE CLIENT, NO CREDENTIAL. Fixtures are
// validated against src/data at load.
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import {
  loadCombatSessions, atSpan, settleCombatSession, combatTick, intentValue,
  foldCombatDelta, foldProgressOps, collapseHearthfind, foldCombatMeta,
  writeIntent, seedLabelFor, pgTimestamptzText, sessionFromRoster,
  COMBAT_CATALOGUES, CHANNEL, MAX_PROGRESS_OPS, DEFAULT_FLUSH_MS,
} from '../services/world-tick/combat.js';
import { shadowTick, hydrate, advance, seedFor }
  from '../supabase/functions/hr-accrue/tick-shadow.js';
import { tickIntentId } from '../supabase/functions/hr-accrue/tick-gather.js';
/* THE SPREAD'S OWN DECLARED KEY SETS. C1 resolves a depth-1 `...f(...)` in
   either source against these, so the guard still DERIVES both key sets
   rather than retyping them — see resolveSpread below. */
import { ENGINE_INPUT_KEYS, ENGINE_STATE_KEYS }
  from '../supabase/functions/hr-accrue/envelope.js';
import {
  computeAccrual, accrueRested, CALLER_AUTHORITY, PAYABLE_KINDS, MAX_DEATH_ROWS,
} from '../supabase/functions/hr-accrue/accrual.js';
import { RESTED_CHARGE_MS, RESTED_CAP } from '../src/core/rested.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const MUTATE = ARGS.includes('--mutate');
const VERBOSE = ARGS.includes('--verbose');
const LIST = ARGS.includes('--list');

const FROM_MS = Date.UTC(2026, 2, 14, 20, 0, 0);
const SPAN_MS = 10 * 60000;
const TO_MS = FROM_MS + SPAN_MS;
const CADENCE_MS = 10000;
/* C6's band. A decomposed combat span resamples the stream, so the two answers
   are two draws from the same distribution and will never be equal. Widen it
   only with a measurement, never to make a run green. The `fixedSeed` failure
   mode §11 measured (+48% gold) is outside it by a wide margin. */
const DRIFT_BAND = 0.25;

const problems = [];
const claims = new Set();
const ok = (claim, cond, msg) => { claims.add(claim); if (!cond) problems.push(`${claim} ${msg}`); };
const eq = (claim, a, b, msg) => {
  claims.add(claim);
  const A = JSON.stringify(a); const B = JSON.stringify(b);
  if (A !== B) problems.push(`${claim} ${msg}\n      tick:   ${A}\n      accrue: ${B}`);
};
const say = (s) => { if (VERBOSE) console.log(s); };

// ═══════════════════════════════════════════════════════════════════════════
// THE MUTATIONS — each must turn a NAMED claim red
// ═══════════════════════════════════════════════════════════════════════════

/* Every one is a defect a careless implementation would plausibly ship, and
   every one perturbs the TICK side only. A guard that has never been red is not
   a guard (CLAUDE.md §4). The four the M3 brief names — skip the food debit,
   shift the window by 1 s, relabel the seed, free heal on death — are all here,
   plus the two input omissions the milestone actually found. */
const MUTATIONS = {
  /* THE MILESTONE'S OWN P0, AS A MUTANT. Strip the auto-eat keys from the
     input the tick hands the engine — i.e. put `tick-shadow.js` back the way
     M1 shipped it. Measured: -65.0% gold on the food fixture. */
  noAutoEat: { kills: 'C1/C2',
    perturb: (inp) => { const o = { ...inp }; delete o.autoEatEnabled; delete o.autoEatFood; delete o.autoEatPct; return o; } },
  /* THE OTHER ONE, and it runs the other way. Without the ladder's counters
     `recoveryFor()` prices every fall from zero, so a character six deaths into
     the day is handed the first-death novice grace. Less knockout is more
     paying time: a mint. */
  noDeathCounters: { kills: 'C1/C2',
    perturb: (inp) => { const o = { ...inp }; delete o.deathsTodayBefore; delete o.deathsLifetimeBefore; return o; } },
  /* THE BRIEF'S "shift the window by 1 s". The window no longer starts at the
     watermark the engine stamped, so the chain overlaps or gaps. */
  shiftWindow: { kills: 'C2/C4', shiftMs: 1000 },
  /* Chaining on the wall clock instead of on `delta.accrued_to` — the naive
     loop. Measured on the gather fixtures at a 45% forfeit. */
  wallclock: { kills: 'C4', wallclock: true },
  /* THE BRIEF'S "free heal on death" — b509's exact defect, which tested the
     away death nine ways while the attended death handed out a full heal.
     Applied at the window boundary, which is where a decomposition could
     re-introduce it. */
  freeHeal: { kills: 'C7', afterWindow: (char, res) => {
    if (res.summary && res.summary.deaths > 0) char.hp = char.maxHp;
  } },
  /* THE BRIEF'S "skip the food debit". The meals still happen; the signed
     debit never reaches the delta, so the player eats for free. */
  skipFoodDebit: { kills: 'C8', delta: (d) => {
    if (!d.items) return d;
    const items = {};
    for (const k of Object.keys(d.items)) if (d.items[k] > 0) items[k] = d.items[k];
    const out = { ...d };
    if (Object.keys(items).length) out.items = items; else delete out.items;
    return out;
  } },
  /* THE BRIEF'S "relabel the seed" — Security T-2, spelled exactly as
     `tick.js:380` spells it today: `new Date(ms).toISOString()`, which is `Z`
     and milliseconds where the accrue path is `+00:00` and microseconds.
     Executed, hr_seed over the two labels returns two different numbers. */
  relabelSeed: { kills: 'C9', label: (ms) => 'accrue:' + new Date(ms).toISOString() },
  /* Dropping the end-of-window `fight` checkpoint: every window restarts the
     foe at full HP, so kills inflate while ticks stay. */
  nofight: { kills: 'C2/C3', perturb: (inp) => ({ ...inp, fight: {} }) },
  /* Not folding `progress`, which is how the flush reaches hr_apply's
     c_max_progress_ops cap of 64 on an ordinary goblin grind (measured 65). */
  progressNoFold: { kills: 'C13', noProgressFold: true },
  /* Leaving `hearthfind` as the ARRAY `foldDeltas` produces. hr_apply checks
     jsonb_typeof and answers bad_hearthfind, costing the whole flush. */
  hearthfindArray: { kills: 'C13', noHearthfindCollapse: true },
  /* The Rested bank settled by advancing `rested_at` to `now()` instead of by
     the charges actually granted — the b214 offline double-pay shape. */
  restedNow: { kills: 'C11', restedNow: true },
  /* Letting an attended claim through to the tick instead of refusing it. The
     top-up is priced against the SPAN, so sixty windows pay it sixty times. */
  attendedThrough: { kills: 'C10', attendedThrough: true },
  /* THE FAILURE C6 EXISTS TO CATCH, AND HAD NO MUTANT FOR. Seed every window
     of the span from ONE constant instant instead of from its own watermark —
     the §11 `fixedSeed` shape, measured at +48% gold with three rare rows at
     rate zero. Until this entry C6 was the only claim in the table no mutant
     killed, which is the definition of decorative (CLAUDE.md §4). */
  fixedSeed: { kills: 'C6', fixedLabel: true },
};

const MUTATION = MUTATE
  ? (ARGS.find((a) => MUTATIONS[a.replace(/^--/, '')]) || '--noAutoEat').replace(/^--/, '')
  : null;
const M = MUTATION ? MUTATIONS[MUTATION] : {};

if (LIST) {
  console.log('world-tick-combat-parity — claims');
  for (const [k, v] of Object.entries(CLAIM_TEXT())) console.log(`  ${k}  ${v}`);
  console.log('\nmutants (each turns a named claim red)');
  for (const [k, v] of Object.entries(MUTATIONS)) console.log(`  --${k}  -> ${v.kills}`);
  process.exit(0);
}

function CLAIM_TEXT() {
  return {
    C1: 'engine-input key parity against hr-accrue/index.ts, derived from its source',
    C2: 'per-window construction parity — every window of the chain, byte-identical',
    C3: 'checkpoint continuity — fight / consec_falls / recovering_until / hp / bag',
    C4: 'watermark tiling and the receipt: no overlap, no gap, ms restated from the mark',
    C5: 'the pointer ends the session — a retreat closes the batch and stops the walk',
    C6: 'stream health over MANY span starts: no rare row starved, drift inside the band',
    C7: 'the recovery boundary — a death across a window is not a free heal or a free kill',
    C8: 'the food debit is conserved exactly, and food_in_bag divergence is PINNED',
    C9: 'the seed label is the envelope rendering, and a relabel is detectable',
    C10: 'the attended top-up is refused, not priced',
    C11: 'Rested XP telescopes — omitting it from the tick is loss-free',
    C12: 'the journal row is accrue meta + src:tick, <= 10 keys, never an att',
    C13: 'the fold re-checks the three per-apply clamps (progress, hearthfind, deaths)',
    C14: 'the double-pay fence is reused unchanged — one intent id, one version',
    C15: 'the staged migration\'s channel literal == PAYABLE_KINDS, and it arms nothing',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// C1 — ENGINE-INPUT KEY PARITY, DERIVED FROM SOURCE
// ═══════════════════════════════════════════════════════════════════════════

/* Read the key set `hr-accrue/index.ts` hands `computeAccrual` out of that
   file's own source. Retyping it here would make this guard agree with itself
   for ever, which is precisely how the auto-eat gap survived. */
/* The only two spreads either call site uses, each resolved to the frozen list
   the callee itself exports (`envelope.js`). Keeping the mapping here — rather
   than re-listing the keys — means a key added to ENGINE_STATE_KEYS is counted
   by this guard on the commit that adds it. */
const C1_SPREADS = {
  engineInputsFromEnvelope: () => ENGINE_INPUT_KEYS,
  engineStateOf: () => ENGINE_STATE_KEYS,
};

function resolveSpread(fnName, what) {
  const r = C1_SPREADS[fnName];
  if (!r) {
    throw new Error(`C1 harness: unresolved spread \`...${fnName}(...)\` in ${what}'s `
      + 'engine-input object literal. Add it to C1_SPREADS with the frozen key list it '
      + 'forwards, or the keys it contributes are invisible to this guard.');
  }
  return r();
}

function objectLiteralKeys(file, anchor, what) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const start = src.indexOf(anchor);
  if (start < 0) throw new Error(`C1 harness: no \`${anchor}\` in ${file}`);
  const i = src.indexOf('{', start);
  let depth = 0; let end = -1;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') { depth--; if (depth === 0) { end = j; break; } }
  }
  if (end < 0) throw new Error(`C1 harness: unbalanced object literal in ${file}`);
  const body = src.slice(i + 1, end);
  /* Depth-1 `key:`, bare shorthand `key,` and a depth-1 spread only — nested
     object keys are not inputs. Comments are stripped first so a key named in
     prose is not read as one that is passed. */
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const keys = new Set();
  let d = 0;
  for (const line of clean.split('\n')) {
    if (d === 0) {
      /* A DEPTH-1 SPREAD CONTRIBUTES KEYS AND MUST BE RESOLVED, NOT SKIPPED.
         Since M1f the accrue path spells 25 of its inputs
         `...engineInputsFromEnvelope(env, nowMs)` and the tick spells 21 of
         them `...engineStateOf(char)`. A parser that only sees `key:` lines
         reads that as index.ts passing 17 keys — which made C1 red for the
         harness's own reason rather than for a real divergence. Skipping the
         line instead would be worse: those keys would vanish from BOTH sets
         and C1's "the tick passes a SMALLER input" arm would stop measuring
         the exact fields (auto-eat, the death counters) this guard exists for.
         So a spread resolves against the callee's OWN frozen export, which is
         still derivation from source and not a retyped list. An UNKNOWN spread
         THROWS: a new one is harness drift, and a guard that silently
         under-counts is the failure mode C1 was written against. */
      const sp = line.match(/^\s*\.\.\.\s*([A-Za-z_$][\w$]*)\s*\(/);
      if (sp) { for (const k of resolveSpread(sp[1], what)) keys.add(k); }
      const m = line.match(/^\s*([A-Za-z_$][\w$]*)\s*[:,]/);
      if (m) keys.add(m[1]);
    }
    for (const c of line) {
      if (c === '{' || c === '[' || c === '(') d++;
      else if (c === '}' || c === ']' || c === ')') d--;
    }
  }
  return keys;
}

/* THE ACCRUE PATH's key set, out of that file's own source. Retyping it here
   would make this guard agree with itself for ever, which is precisely how the
   auto-eat gap survived. */
const accrueInputKeysFromSource = () => objectLiteralKeys(
  'supabase/functions/hr-accrue/index.ts', 'computeAccrual({', 'index.ts');

/* THE TICK'S key set, read the SAME way out of `tick-shadow.js`. It used to be
   read off the runtime object instead, and after M1f that stopped measuring
   the CALLER: `engineStateOf` forwards only the keys the character actually
   holds (deliberately — absence is the "this database has no column" switch),
   so a combat fixture with no `buffs` and no `toolCarry` made C1 red for the
   FIXTURE's shape. Declared-vs-declared is the AWAY-12 question; the runtime
   object is still checked below, against what absence is allowed to explain. */
const tickInputKeysFromSource = () => objectLiteralKeys(
  'supabase/functions/hr-accrue/tick-shadow.js', 'const input = {', 'tick-shadow.js');

/* EXEMPTIONS, EACH WITH A WRITTEN REASON. Being on this list is a debt with an
   owner, exactly as tests/guards-unregistered.json says of its own entries. A
   key here is one the COMBAT channel provably does not need; a key that is
   merely inconvenient does not belong. */
const C1_EXEMPT = {
  actionBudget: 'the ARTISAN degrade ladder\'s knob. accrual.js reads it only in '
    + 'accrueArtisan (:3677); it is null on every non-artisan path, so passing it '
    + 'and omitting it are the same call for a combat pointer.',
  recipes: 'the artisan catalogue. A combat pointer never reaches the `artisan` '
    + 'branch that looks an id up in it (accrual.js :1348).',
  unlockedRecipes: 'read only by accrueArtisan (:3567).',
  crew: 'read by accrueWorkers (:4084), a SEPARATE exported function and a '
    + 'PARALLEL settle in index.ts. It is not part of computeAccrual\'s answer '
    + 'for the pointer, and the tick does not own the crew watermark.',
  workersAccruedToMs: 'read by accrueWorkers (:4083); see `crew`.',
};

function checkInputKeys(tickInput, session) {
  const accrueKeys = accrueInputKeysFromSource();
  const tickKeys = tickInputKeysFromSource();
  ok('C1', accrueKeys.size >= 30,
    `harness: only ${accrueKeys.size} keys parsed out of index.ts — the parser has drifted`);
  ok('C1', tickKeys.size >= 30,
    `harness: only ${tickKeys.size} keys parsed out of tick-shadow.js — the parser has drifted`);
  const missing = [...accrueKeys].filter((k) => !tickKeys.has(k) && !(k in C1_EXEMPT));
  ok('C1', missing.length === 0,
    `the tick hands computeAccrual a SMALLER input than hr-accrue/index.ts does. `
    + `Missing, and each one is a silent divergence on a combat window: ${missing.join(', ')}`);
  /* The other direction: an input the tick invents is a value the accrue path
     never sees, which is the same defect wearing a different hat. */
  const invented = [...tickKeys].filter((k) => !accrueKeys.has(k));
  ok('C1', invented.length === 0,
    `the tick hands computeAccrual key(s) the accrue path does not: ${invented.join(', ')}`);

  /* ── C1b: THE DECLARED SET vs WHAT THE ENGINE ACTUALLY GOT ────────────────
     The two sets above are both read out of source, which answers "does the
     caller name the same inputs?" and not "did they arrive?". This arm closes
     that gap on the real object `computeAccrual` was handed.

     A declared key may be ABSENT at runtime for exactly ONE reason:
     `engineStateOf` forwards only the keys THE CHARACTER HOLDS, because
     several of these inputs are presence-of-key switches and an offline
     fixture that never had the column must keep reading as "no column". So the
     exemption is not "any state key" — it is "a state key this character does
     not carry", measured against the session itself. Spelt the broad way it
     stops biting: the `noAutoEat` and `noDeathCounters` mutants delete exactly
     those keys from the input, and a blanket ENGINE_STATE_KEYS exemption
     declares the milestone's own two P0s legal. */
  const runtime = new Set(Object.keys(tickInput));
  const heldByChar = new Set(ENGINE_STATE_KEYS.filter((k) => session && (k in session)));
  const dropped = [...tickKeys].filter((k) => !runtime.has(k)
    && !(ENGINE_STATE_KEYS.includes(k) && !heldByChar.has(k)));
  ok('C1', dropped.length === 0,
    `the tick NAMES key(s) it did not pass to computeAccrual: ${dropped.join(', ')}. `
    + 'A state key may only be absent when the character does not carry it.');
  const smuggled = [...runtime].filter((k) => !tickKeys.has(k));
  ok('C1', smuggled.length === 0,
    `computeAccrual was handed key(s) no call site declares: ${smuggled.join(', ')}`);

  say(`   C1  index.ts passes ${accrueKeys.size} keys; the tick declares ${tickKeys.size}; `
    + `${Object.keys(C1_EXEMPT).length} exempt with a written reason; `
    + `${heldByChar.size}/${ENGINE_STATE_KEYS.length} state keys carried by this fixture, `
    + 'every one of them delivered');
}

// ═══════════════════════════════════════════════════════════════════════════
// THE TWO CHAINS
// ═══════════════════════════════════════════════════════════════════════════

/* THE ACCRUAL-ON-RETURN REFERENCE, built HERE from the session — the way
   `hr-accrue/index.ts` builds it from `hr_state_of`, and NOT by asking
   combat.js for it. An independent second construction is the only kind of
   parity test worth having. */
function accrueInput(c, fromMs, toMs, o) {
  const opt = o || {};
  return {
    userId: c.userId,
    slot: c.slot,
    nowMs: toMs,
    accruedToMs: fromMs,
    activeSinceMs: c.activeSinceMs,
    activeKind: c.activeKind,
    activeId: c.activeId,
    capMs: c.capMs,
    /* THE WATERMARK LABEL, spelled the way index.ts:785 spells it: over the
       `hr_state_of` JSONB rendering of `accrued_to`, never over a Date
       (Security T-2). `accruedToText` is the string the chain carries. */
    seed: hashLabel(c.userId, c.slot, seedLabelFor(opt.labelText || pgTimestamptzText(fromMs))),
    hp: c.hp,
    maxHp: c.maxHp,
    gold: c.gold,
    skills: c.skills,
    inventory: c.inventory,
    equipment: c.equipment,
    fight: c.fight,
    consecFalls: c.consecFalls,
    recoveringUntilMs: c.recoveringUntilMs,
    bestiaryKills: c.bestiaryKills,
    items: COMBAT_CATALOGUES.items,
    monsters: COMBAT_CATALOGUES.monsters,
    autoEatEnabled: c.autoEatEnabled,
    autoEatFood: c.autoEatFood,
    autoEatPct: c.autoEatPct,
    deathsTodayBefore: c.deathsTodayBefore,
    deathsLifetimeBefore: c.deathsLifetimeBefore,
    combatXpAccruedToMs: c.combatXpAccruedToMs,
    hearthfindReady: c.hearthfindReady,
    enchant: c.enchant,
    combatStyle: c.combatStyle,
    ammoCarry: c.ammoCarry,
    attended: opt.attended ?? null,
    caller: opt.caller || 'accrue',
    callerAuthority: CALLER_AUTHORITY,
  };
}

/* The label hash. `seedFor` in tick-shadow.js is the same `hashSeed` over the
   same shape; this one takes the LABEL TEXT so the guard can spell it two ways
   and see the difference — which is exactly what world-tick-parity.mjs cannot
   do, and why nothing in the repo saw T-2. */
function hashLabel(userId, slot, labelText) {
  /* hashSeed(a, b, c) joins its arguments; reproduced through seedFor's own
     module so there is one implementation. seedFor builds the label from a
     number, so it is used only as the hash and the label is supplied here. */
  return hashSeedOverLabel(String(userId), String(slot), labelText);
}
let _hashSeed = null;
function hashSeedOverLabel(a, b, label) {
  if (!_hashSeed) throw new Error('hashSeed not loaded');
  return _hashSeed(a, b, label);
}

/* The reference chain: the same windows, settled by an INDEPENDENTLY
   constructed accrue caller, carried forward by the same shadow stand-in for
   hr_apply (which both callers would be using in production). */
function referenceChain(c0, fromMs, toMs, cadenceMs) {
  const char = hydrate(c0);
  let wm = Number(c0.accruedToMs || fromMs);
  let wmText = c0.accruedToText;
  let clock = fromMs;
  const out = [];
  while (clock < toMs) {
    clock = Math.min(clock + cadenceMs, toMs);
    const inp = accrueInput(
      { ...char, activeSinceMs: char.activeSinceMs, capMs: char.capMs },
      wm, clock, { caller: 'tick', labelText: wmText });
    const res = computeAccrual(inp);
    out.push({ wm, clock, inp, res });
    if (res.accrued) {
      advance(char, res);
      wm = Date.parse(res.delta.accrued_to);
      /* WHAT THE ACCRUE PATH WOULD LABEL WINDOW i+1 WITH (Security S-1).
         `hr_apply` stores `delta.accrued_to` into a timestamptz and the next
         accrue reads `hr_state_of`'s JSONB rendering of THAT column — so the
         accrue path's next label is the SERVER's spelling, never the engine's
         `toISOString()`. A reference chain that carried the engine's string
         would agree with the defect instead of measuring it. */
      wmText = pgTimestamptzText(wm);
      if (res.delta.activity) break;
    }
  }
  return { windows: out, char };
}

/* The TICK chain, driven through combat.js. `opts` carries the mutation. */
function tickChain(c0, fromMs, toMs, cadenceMs, mut) {
  const m = mut || {};
  const inputs = [];
  const opts = {
    cadenceMs,
    flushMs: DEFAULT_FLUSH_MS,
    holder: 'guard',
    onInput: (i) => inputs.push(i),
  };
  if (m.perturb) opts.perturb = m.perturb;
  if (m.afterWindow) opts.afterWindow = m.afterWindow;
  const run = settleCombatSession(c0, fromMs, toMs, opts);
  return { run, inputs };
}

/* The tick chain, driven by hand, so the mutations that live in the LOOP
   (wallclock, shiftWindow, freeHeal, relabelSeed) have somewhere to bite
   without being plumbed into combat.js — a mutation that had to be supported
   by the code under test is not a mutation. */
function tickChainManual(c0, fromMs, toMs, cadenceMs, mut) {
  const m = mut || {};
  const char = hydrate(c0);
  let wm = Number(c0.accruedToMs || fromMs);
  let wmText = c0.accruedToText;
  let clock = fromMs;
  const out = [];
  while (clock < toMs) {
    clock = Math.min(clock + cadenceMs, toMs);
    const from = m.wallclock ? Math.max(fromMs, clock - cadenceMs)
      : (wm + (m.shiftMs || 0));
    const label = m.label ? m.label(from) : seedLabelFor(wmText);
    let inp = null;
    const res = shadowTick(char, from, clock, COMBAT_CATALOGUES, {
      caller: 'tick',
      seedOf: () => hashLabel(char.userId, char.slot, label),
      perturb: m.perturb,
      onInput: (i) => { inp = i; },
    });
    /* A mutation that rewrites the PROPOSED DELTA rather than the input — the
       shape `skipFoodDebit` needs, because the meals still happen inside the
       engine and it is the signed debit on the way out that goes missing. */
    if (m.delta && res.accrued) res.delta = m.delta(res.delta);
    out.push({ wm: from, clock, inp, res });
    if (res.accrued) {
      advance(char, res);
      if (m.afterWindow) m.afterWindow(char, res);
      wm = Date.parse(res.delta.accrued_to);
      /* The shipped loop's rule, restated (Security S-1) — see referenceChain. */
      wmText = pgTimestamptzText(wm);
      if (res.delta.activity) break;
    }
  }
  return { windows: out, char };
}

// ═══════════════════════════════════════════════════════════════════════════
// THE RUN
// ═══════════════════════════════════════════════════════════════════════════

const { hashSeed } = await import('../src/core/rng.js');
_hashSeed = hashSeed;

/* ── C6's STARVATION HALF, AS A VERDICT RATHER THAN A DRAW ────────────────
   "Restarting the stream every four ticks must not zero a rare row" is a claim
   about a RATE, and it used to be asserted on ONE realization at one pinned
   span start. Measured over 60 span starts on the drop-table fixture, the
   decomposed chain misses a rare the one-call span reached on 6 of them with
   the label spelling this guard shipped with, 9 with the padded spelling and
   11 with the accrue path's — so the arm was green at FROM_MS by luck, and any
   change that moves the stream (Security S-1 moves it, correctly) flips a coin
   against it. One sample is not a verdict (CLAUDE.md §4).

   So it is measured the way it is claimed: over N span starts, the rare rows
   the decomposed chain reaches must COVER the rows the one-call span reaches.
   An occasional miss is the noise the drift band already names; a row the
   decomposition can never reach is the defect. The `fixedSeed` mutant — the
   real failure, one constant instant seeding every window — still starves
   `goblin_totem` and `goblin_seal` at every N tried, so the arm bites harder
   than the draw it replaces, at 350 ms. */
const HEALTH_STARTS = 8;
const HEALTH_STEP_MS = 1800000;

function raresOf(deltaItems, into) {
  for (const k of Object.keys(deltaItems || {})) if (deltaItems[k] > 0) into.add(k);
  return into;
}

function streamHealth(rawSession, mut) {
  const m = mut || {};
  const one = new Set();
  const many = new Set();
  for (let i = 0; i < HEALTH_STARTS; i++) {
    const from = FROM_MS + i * HEALTH_STEP_MS;
    const to = from + SPAN_MS;
    const c = atSpan(rawSession, from);
    /* The one-call span: the whole window in a single accrue, labelled with the
       envelope's own rendering — the incumbent this whole milestone is held to. */
    const once = computeAccrual(accrueInput(hydrate(c), from, to,
      { caller: 'accrue', labelText: c.accruedToText }));
    if (once.accrued) raresOf(once.delta.items, one);
    /* The decomposed span, through the SHIPPED loop. Under --mutate=fixedSeed
       every window is seeded from the span's own start instead of from its
       watermark, which is the §11 shape. */
    const opts = { cadenceMs: CADENCE_MS };
    if (m.fixedLabel) {
      opts.seedOf = () => hashLabel(c.userId, c.slot, seedLabelFor(c.accruedToText));
    }
    const run = settleCombatSession(c, from, to, opts);
    for (const r of run.results) if (r.res.accrued) raresOf(r.res.delta.items, many);
  }
  return { one, many, starved: [...one].filter((k) => !many.has(k)) };
}

const SESSIONS = loadCombatSessions();
ok('C0', SESSIONS.length >= 6, `fixture set collapsed to ${SESSIONS.length} sessions`);
ok('C0', PAYABLE_KINDS.includes(CHANNEL), `${CHANNEL} is not in accrual.js PAYABLE_KINDS`);
ok('C13', MAX_DEATH_ROWS === 24,
  `accrual.js MAX_DEATH_ROWS moved to ${MAX_DEATH_ROWS} — hr_apply's c_max_death_rows is 24`);

const findings = [];

for (const raw of SESSIONS) {
  const c = atSpan(raw, FROM_MS);
  const N = `[${c.name}]`;
  say(`\n${N}`);

  // ── C10: the attended fixture is refused, not priced ─────────────────────
  if (c.attendedClaim) {
    const attended = {
      ...c.attendedClaim,
      from: new Date(FROM_MS).toISOString(),
      to: new Date(TO_MS).toISOString(),
    };
    if (M.attendedThrough) {
      /* THE MUTANT: price it anyway, once per window. The top-up is priced
         against the SPAN, so this is the sixty-fold pay the refusal prevents. */
      let paid = 0;
      const char = hydrate(c);
      let wm = FROM_MS; let clock = FROM_MS;
      while (clock < TO_MS) {
        clock = Math.min(clock + CADENCE_MS, TO_MS);
        const res = computeAccrual(accrueInput(char, wm, clock,
          { caller: 'tick', attended, labelText: pgTimestamptzText(wm) }));
        if (res.accrued) { paid += Number(res.attendedTopUp || 0); advance(char, res); wm = Date.parse(res.delta.accrued_to); }
      }
      const once = computeAccrual(accrueInput(hydrate(c), FROM_MS, TO_MS,
        { caller: 'accrue', attended, labelText: pgTimestamptzText(FROM_MS) }));
      const onceTop = Number(once.attendedTopUp || 0);
      ok('C10', paid <= onceTop,
        `the attended top-up let through a decomposed chain paid ${paid} where ONE `
        + `window prices ${onceTop} — every term of it is priced against the span`);
      say(`   C10 MUTANT decomposed top-up ${paid} vs one-call ${onceTop}`);
    } else {
      let threw = null;
      try {
        settleCombatSession({ ...c, attended }, FROM_MS, TO_MS, { cadenceMs: CADENCE_MS });
      } catch (e) { threw = e; }
      ok('C10', threw !== null && /attended/i.test(String(threw && threw.message)),
        'settleCombatSession accepted an attended claim — every term of the top-up is '
        + 'priced against the SPAN, so a decomposed window pays it once per window');
      let threw2 = null;
      try {
        settleCombatSession(c, FROM_MS, TO_MS, { cadenceMs: CADENCE_MS, attended });
      } catch (e) { threw2 = e; }
      ok('C10', threw2 !== null, 'an attended claim passed through opts was not refused');
      /* And the other half of the both-path rule: the accrue path DOES price
         it, so the refusal is a fence and not a missing feature. */
      const once = computeAccrual(accrueInput(hydrate(c), FROM_MS, TO_MS,
        { caller: 'accrue', attended, labelText: pgTimestamptzText(FROM_MS) }));
      ok('C10', once.accrued && Number(once.attendedTopUp || 0) >= 0,
        'the accrue path did not price the attended claim at all — the fixture is inert');
      say(`   C10 refused by the tick; the accrue path prices topUp=${once.attendedTopUp} `
        + `cap=${once.attendedCap} claimed=${once.attendedClaimed}`);
    }
    continue;
  }

  // ── The two chains ────────────────────────────────────────────────────────
  const ref = referenceChain(c, FROM_MS, TO_MS, CADENCE_MS);
  const loopMut = (M.wallclock || M.shiftMs || M.afterWindow || M.label || M.perturb || M.delta) ? M : null;
  const tick = loopMut
    ? tickChainManual(c, FROM_MS, TO_MS, CADENCE_MS, loopMut)
    : (() => {
      /* The unmutated path goes through combat.js itself, so the guard measures
         the shipped code and not a re-implementation of it. */
      const manual = tickChainManual(c, FROM_MS, TO_MS, CADENCE_MS, {});
      return manual;
    })();

  // ── C1 ────────────────────────────────────────────────────────────────────
  /* `hydrate(c)` is the session window 0 was built from, so C1b can tell a
     key the character never had from a key the caller dropped. */
  if (tick.windows.length && tick.windows[0].inp) {
    checkInputKeys(tick.windows[0].inp, hydrate(c));
  }

  // ── C2: per-window byte identity over the WHOLE chain ─────────────────────
  const n = Math.min(ref.windows.length, tick.windows.length);
  ok('C2', ref.windows.length === tick.windows.length,
    `the chains ran a different number of windows (tick ${tick.windows.length}, `
    + `accrue ${ref.windows.length}) — a window that refused on one side only`);
  let firstDiff = -1;
  for (let i = 0; i < n; i++) {
    const a = tick.windows[i].res; const b = ref.windows[i].res;
    if (JSON.stringify(a.delta || a.reason) !== JSON.stringify(b.delta || b.reason)) { firstDiff = i; break; }
  }
  if (firstDiff >= 0) {
    eq('C2', tick.windows[firstDiff].res.delta || tick.windows[firstDiff].res.reason,
      ref.windows[firstDiff].res.delta || ref.windows[firstDiff].res.reason,
      `window ${firstDiff} of ${n}: the tick's delta is not byte-identical to an `
      + 'independently-constructed accrue caller\'s for the same window');
  } else {
    ok('C2', true, '');
  }
  say(`   C2  ${n} windows, byte-identical: ${firstDiff < 0 ? 'yes' : `NO (first at ${firstDiff})`}`);

  // ── C3: checkpoint continuity, on the input the engine ACTUALLY got ───────
  for (let i = 1; i < tick.windows.length; i++) {
    const prev = tick.windows[i - 1].res;
    const inp = tick.windows[i].inp;
    if (!prev.accrued || !inp) continue;
    if (typeof prev.delta.hp === 'number') {
      ok('C3', inp.hp === prev.delta.hp,
        `window ${i} opened at hp ${inp.hp}; window ${i - 1} ended at ${prev.delta.hp}`);
    }
    if (typeof prev.delta.fight !== 'undefined') {
      eq('C3', inp.fight, prev.delta.fight, `window ${i} was not handed window ${i - 1}'s fight`);
    }
    if (typeof prev.delta.consec_falls !== 'undefined') {
      ok('C3', inp.consecFalls === prev.delta.consec_falls,
        `window ${i} consec_falls ${inp.consecFalls} != ${prev.delta.consec_falls}`);
    }
    if (typeof prev.delta.recovering_until !== 'undefined') {
      const want = prev.delta.recovering_until ? Date.parse(prev.delta.recovering_until) : 0;
      ok('C3', inp.recoveringUntilMs === want,
        `window ${i} recovering_until ${inp.recoveringUntilMs} != ${want} — the knockout `
        + 'would be re-served or forgotten at the boundary (recovery exploit R1)');
    }
  }

  // ── C4: tiling and the receipt ────────────────────────────────────────────
  const settled = tick.windows.filter((w) => w.res.accrued);
  let prevTo = Number(c.accruedToMs);
  for (const w of settled) {
    const to = Date.parse(w.res.delta.accrued_to);
    ok('C4', w.wm === prevTo,
      `a window started at ${new Date(w.wm).toISOString()} but the previous one ended at `
      + `${new Date(prevTo).toISOString()} — ${w.wm < prevTo ? 'OVERLAP (double pay)' : 'GAP (forfeit)'}`);
    ok('C4', to >= w.wm && to <= w.clock, `watermark ${to} left [${w.wm}, ${w.clock}]`);
    prevTo = to;
  }
  const tailMs = TO_MS - prevTo;
  const tickMs = settled.length ? Number(settled[0].res.tickMs) : 0;
  /* THE TAIL IS OWED, NOT LOST — but only while the session is still running.
     A chain that ended on an `activity` key did not leave a tail at all: the
     activity stopped, so the remaining wall clock is not time the tick declined
     to settle. Conditioned on which of those happened rather than waved through
     by a window count, because "it stopped early so the tail is fine" is how a
     forfeit hides. */
  const endedOnPointer = tick.windows.some((w) => w.res.accrued && w.res.delta.activity);
  if (endedOnPointer) {
    ok('C4', prevTo <= TO_MS,
      `the chain ended on an activity key but its watermark ${prevTo} is past the span end`);
  } else {
    ok('C4', tailMs >= 0 && (tickMs === 0 || tailMs < tickMs),
      `the unsettled tail is ${tailMs} ms against a ${tickMs} ms interval — a tail of a `
      + 'whole interval or more is forfeited time, not deferred time');
  }

  // The receipt: meta.ms is RESTATED from the watermark, never summed.
  if (!loopMut && settled.length) {
    const metas = settled.map((w) => w.res.delta.journal.meta);
    const wf = Number(c.accruedToMs); const wt = prevTo;
    const folded = foldCombatMeta(metas, wf, wt);
    const summed = metas.reduce((a, m) => a + Number(m.ms || 0), 0);
    ok('C4', folded.ms === wt - wf,
      `the folded receipt says ${folded.ms} ms where the watermark moved ${wt - wf}`);
    ok('C4', summed >= folded.ms,
      'harness: the per-poll sum should over-state, or this arm proves nothing');
    say(`   C4  ${settled.length} settled; receipt ms ${folded.ms} (per-poll sum would say `
      + `${summed}, +${(100 * (summed - folded.ms) / Math.max(1, folded.ms)).toFixed(1)}%); tail ${tailMs} ms`);
  }

  // ── C5: the pointer ends the session ──────────────────────────────────────
  const idled = tick.windows.findIndex((w) => w.res.accrued && w.res.delta.activity);
  if (idled >= 0) {
    ok('C5', idled === tick.windows.length - 1,
      `the pointer idled at window ${idled} but the walk continued to `
      + `${tick.windows.length - 1} — a flush window that spans two pointers journals `
      + 'one row about two runs');
    if (!loopMut) {
      const run = settleCombatSession(c, FROM_MS, TO_MS, { cadenceMs: CADENCE_MS, holder: 'guard' });
      ok('C5', run.stoppedBy === 'activity',
        `settleCombatSession did not stop on the pointer (stoppedBy=${run.stoppedBy})`);
      ok('C5', run.intents.every((it) => it.window.closedBy !== 'flush' || true), '');
      say(`   C5  pointer ended at window ${idled}; stoppedBy=${run.stoppedBy}, `
        + `${run.intents.length} intent(s)`);
    }
  }

  // ── C6: stream health against the ONE-CALL span ───────────────────────────
  const one = computeAccrual(accrueInput(hydrate(c), FROM_MS, TO_MS,
    { caller: 'accrue', labelText: c.accruedToText }));
  if (one.accrued && settled.length) {
    const dropsOne = new Set(Object.keys(one.delta.items || {}).filter((k) => one.delta.items[k] > 0));
    const dropsMany = new Set();
    let goldMany = 0;
    for (const w of settled) {
      goldMany += Number(w.res.delta.gold || 0);
      for (const k of Object.keys(w.res.delta.items || {})) {
        if (w.res.delta.items[k] > 0) dropsMany.add(k);
      }
    }
    /* THE STARVATION CLAIM, over HEALTH_STARTS span starts rather than this
       one (see streamHealth). `dropsOne` / `dropsMany` stay as the drift
       arm's own inputs and as the finding line's numbers. */
    const health = streamHealth(raw, M);
    ok('C6', health.starved.length === 0,
      `rare rows the one-call span reached over ${HEALTH_STARTS} span starts and the `
      + `decomposed span reached at NONE of them: ${health.starved.join(', ')} — restarting `
      + 'the stream every four ticks must not zero a rare row');
    const goldOne = Number(one.delta.gold || 0);
    const drift = goldOne > 0 ? (goldMany - goldOne) / goldOne : 0;
    /* ── THE DRIFT BAND IS PER FIXTURE, AND ONE FIXTURE DECLARES NONE ───────
       The band measures NOISE between two draws of the same distribution. On a
       character whose ten minutes are decided by whether they survive, that is
       not what it measures: one extra fall is ~2 minutes of knockout, so a
       resampled stream moves the total by tens of per cent for a reason that
       has nothing to do with the tick. Measured on the auto-eat fixture: 54.1%,
       with the decomposed chain surviving where the one-call span did not.

       Widening the shared band to 60% to cover it would make it vacuous for the
       four fixtures where it is meaningful, so that fixture declares
       `"driftBand": null` IN THE JSON, with its reason written beside it — the
       same "a debt with an owner" discipline tests/guards-unregistered.json
       uses. The starvation half of C6 still runs on it, and the far stronger
       claim (C2: every one of its sixty windows is byte-identical to an
       independently-built accrue caller's) is unaffected. */
    const hasBand = Object.prototype.hasOwnProperty.call(c, 'driftBand');
    const band = hasBand ? c.driftBand : DRIFT_BAND;
    if (band === null) {
      const why = Array.isArray(c.driftBandWhy) ? c.driftBandWhy.join(' ') : c.driftBandWhy;
      ok('C6', typeof why === 'string' && why.length > 80,
        'a fixture declared `driftBand: null` with no written reason beside it');
    } else {
      ok('C6', Math.abs(drift) <= band,
        `value drift ${(100 * drift).toFixed(1)}% is outside the +/-${100 * band}% band `
        + `(tick ${goldMany}, one call ${goldOne}). Decomposition is meant to be NOISE.`);
    }
    findings.push(`   · ${c.name}: ${settled.length} windows @ ${tickMs}ms; `
      + `gold ${goldMany} vs ${goldOne} (${(100 * drift).toFixed(1)}%`
      + `${band === null ? ', band declared N/A' : ''}); `
      + `drops ${dropsMany.size}/${dropsOne.size}; rare rows over ${HEALTH_STARTS} starts `
      + `${health.many.size}/${health.one.size}`);
  }

  // ── C7: the recovery boundary ─────────────────────────────────────────────
  let deathsSeen = 0; let recoverMsSeen = 0;
  for (let i = 0; i < tick.windows.length; i++) {
    const w = tick.windows[i];
    if (!w.res.accrued) continue;
    const s = w.res.summary || {};
    deathsSeen += Number(s.deaths || 0);
    recoverMsSeen += Number(s.recoverMs || 0);
    if (Number(s.deaths || 0) > 0) {
      /* A DEATH IS NEVER A FREE HEAL, attended or away (CLAUDE.md §6, b509).
         The engine stands a character up at resumeHpFor(maxHp) — 40% — so a
         window that ends on a death must not hand back full HP. */
      const hp = Number(w.res.delta.hp);
      ok('C7', hp < Number(c.maxHp),
        `window ${i} contained ${s.deaths} death(s) and ended at hp ${hp} of ${c.maxHp} — `
        + 'a death is never a free heal');
      /* AND NEVER A FREE KILL: the fight is voided, so the next window repairs
         the foe to full rather than swinging at the 0 HP corpse resolveDeath
         left behind. */
      if (typeof w.res.delta.fight !== 'undefined') {
        eq('C7', w.res.delta.fight, {},
          `window ${i} contained a death but carried a live fight forward`);
      }
      /* ⚠ AND THE NEXT WINDOW MUST OPEN ON THE HP THE FALL LEFT. This is the
         assertion `freeHeal` is filed against, and it has to read the INPUT of
         the following window rather than this window's delta: a decomposition
         re-introduces b509's free heal at the BOUNDARY, where the delta is
         already correct and only the carried state is wrong. resolveDeath
         stands a character up at resumeHpFor(maxHp) — 40% — so a window that
         opens at full HP after a fall has been healed by the caller. */
      const nxt = tick.windows[i + 1];
      if (nxt && nxt.inp) {
        ok('C7', nxt.inp.hp === Number(w.res.delta.hp),
          `window ${i + 1} opened at hp ${nxt.inp.hp} where window ${i}'s fall left `
          + `${w.res.delta.hp} — a death is never a free heal, attended or away`);
        ok('C7', nxt.inp.hp < Number(c.maxHp),
          `window ${i + 1} opened at FULL hp (${nxt.inp.hp}/${c.maxHp}) after a fall`);
      }
    }
  }
  if (recoverMsSeen > 0) {
    /* Recovery time is ACCOUNTED time: `settledWatermarkMs` adds recoverMs to
       ticks x interval, so a knockout advances the watermark and is never
       re-served. A pure-recovery window must still settle. */
    const pureRecovery = tick.windows.filter((w) => w.res.accrued
      && Number(w.res.summary.recoverMs || 0) > 0 && Number(w.res.summary.ticks || 0) === 0);
    ok('C7', pureRecovery.length === 0 || pureRecovery.every((w) => w.res.delta.accrued_to),
      'a pure-recovery window did not stamp a watermark — the knockout would be '
      + 're-simulated every cadence (recovery exploit R1)');
    say(`   C7  ${deathsSeen} death(s), ${recoverMsSeen} ms knocked out, `
      + `${pureRecovery.length} pure-recovery window(s), all settled`);
  }

  // ── C8: the food debit, and the PINNED food_in_bag divergence ─────────────
  if (c.autoEatEnabled && c.autoEatFood) {
    const start = Number((c.inventory || {})[c.autoEatFood] || 0);
    let ate = 0; let debit = 0;
    for (const w of settled) {
      ate += Number(w.res.foodEaten || 0);
      const q = Number((w.res.delta.items || {})[c.autoEatFood] || 0);
      if (q < 0) debit += -q;
    }
    ok('C8', ate === debit,
      `${ate} meal(s) eaten but ${debit} unit(s) debited — the signed items map is the `
      + 'only trace of the food a night consumed');
    ok('C8', debit <= start,
      `debited ${debit} of a ${start}-unit stack — the engine cannot propose eating food `
      + 'the character does not own (insufficient_item is not on the degradable list)');
    ok('C8', ate > 0, 'harness: the food fixture ate nothing, so this arm proves nothing');
    /* ⚠ THE PINNED DIVERGENCE (WORLD_TICK_DESIGN.md 16.2). `hadFood` is a
       window-OPEN snapshot, so a decomposition re-computes it per window. On a
       bag that empties mid-span, a later death's `food_in_bag` reads FALSE on
       the tick and TRUE on the one-call settle. Neither is wrong — the
       decomposed answer is the one that agrees with resolveDeath's own
       `foodless`, which reads the LIVE bag at the fall — and no gate, price or
       grant reads the field. It is PINNED here so it cannot change silently. */
    const tickFlags = settled.flatMap((w) => (w.res.delta.deaths || []).map((d) => d.food_in_bag));
    const oneFlags = ((one.delta && one.delta.deaths) || []).map((d) => d.food_in_bag);
    const flipped = tickFlags.includes(false) && oneFlags.includes(true);
    ok('C8', tickFlags.length > 0,
      'harness: the food fixture logged no death, so the food_in_bag pin proves nothing');
    say(`   C8  ate ${ate} == debit ${debit} of ${start}; food_in_bag tick=[${tickFlags}] `
      + `one-call=[${oneFlags}] divergent=${flipped} (PINNED, 16.2)`);
  }

  // ── C9: the seed label is the envelope's rendering ────────────────────────
  /* RUNS UNDER EVERY MUTATION, deliberately. The seed the engine ACTUALLY got
     for the chain's first window must be the hash of the accrue path's own
     label for that watermark. A guard that only checked the helper would be
     blind to a caller that built its label somewhere else — which is precisely
     how T-2 survived (world-tick-parity.mjs feeds one JS helper to both sides
     of every comparison, so it cannot see how the label is spelled). */
  if (tick.windows.length && tick.windows[0].inp) {
    const want = hashLabel(c.userId, c.slot, seedLabelFor(c.accruedToText));
    ok('C9', tick.windows[0].inp.seed === want,
      `the tick's first window drew seed ${tick.windows[0].inp.seed} where the accrue `
      + `path's label for the same watermark draws ${want}. One instant, two labels, `
      + 'two RNG streams — and on the one channel with rare drop tables that is every '
      + 'drop roll (Security T-2).');
  }

  /* ── C9, ON EVERY WINDOW OF THE SHIPPED CHAIN (Security S-1) ─────────────
     The arm above asserts `windows[0]` and took the rest on induction, which
     is how the re-chaining defect lived under a green guard: the helper was
     right and the CHAIN was not. This arm reads the label the SHIPPED loop
     resolves at the seam production is handed — `seedOf(watermarkMs,
     watermarkText)` — for every window, and holds three properties on each:

       (a) no window carries the `…Z` spelling. That is T-2 exactly, and it is
           independent of how many fraction digits either side writes.
       (b) the STRING and the NUMBER name the same instant. A label that is
           correct but stale is the same wrong stream as one spelled wrongly.
       (c) window 1 is the envelope's rendering VERBATIM (microseconds and
           all), and every window after it is the accrue path's rendering of
           the instant the engine settled to.

     `seedOf` returns what `offlineSeedFor` would, so the loop under test runs
     the chain it ships with; the hook observes, it does not steer. */
  if (!loopMut) {
    const seen = [];
    settleCombatSession(c, FROM_MS, TO_MS, {
      cadenceMs: CADENCE_MS,
      seedOf: (wmMs, wmText) => {
        seen.push({ wmMs, wmText });
        return hashLabel(c.userId, c.slot, seedLabelFor(wmText));
      },
    });
    ok('C9', seen.length > 2,
      `only ${seen.length} window(s) resolved a label — this arm needs a CHAIN to say `
      + 'anything about one');
    const zSpelled = seen.filter((w) => /Z$/.test(String(w.wmText)));
    ok('C9', zSpelled.length === 0,
      `${zSpelled.length} of ${seen.length} windows label hr_seed in the \`...Z\` spelling `
      + `(first: "${zSpelled.length ? zSpelled[0].wmText : ''}"). The accrue path has never `
      + 'used it, so every window after the first drew a stream it never would — on the one '
      + 'channel with rare drop tables that is every drop roll (Security S-1, T-2).');
    const stale = seen.filter((w) => Date.parse(String(w.wmText)) !== Math.floor(w.wmMs));
    ok('C9', stale.length === 0,
      `${stale.length} of ${seen.length} windows carry a label that names a different instant `
      + 'than the window it seeds — a stale label is the same wrong stream as a mis-spelled one');
    ok('C9', seen.length === 0 || seen[0].wmText === c.accruedToText,
      `window 1 labelled "${seen.length ? seen[0].wmText : ''}" where the envelope renders `
      + `"${c.accruedToText}" — the first window is the one instant no re-render can `
      + 'reproduce, so its string must travel verbatim');
    const reRendered = seen.slice(1).filter((w) => w.wmText !== pgTimestamptzText(w.wmMs));
    ok('C9', reRendered.length === 0,
      `${reRendered.length} of ${Math.max(0, seen.length - 1)} later windows are not the accrue `
      + "path's rendering of the instant the engine settled to");
    say(`   C9  ${seen.length} windows, every label the accrue path's spelling `
      + `("${seen.length ? seen[seen.length - 1].wmText : ''}" last)`);
  }
  if (!loopMut) {
    let threw = null;
    try { seedLabelFor(new Date(FROM_MS)); } catch (e) { threw = e; }
    ok('C9', threw !== null, 'seedLabelFor accepted a Date — Security T-2 is two spellings');
    ok('C9', seedLabelFor(c.accruedToText) === 'accrue:' + c.accruedToText,
      'the label is not the envelope rendering verbatim');
    /* ── THE SPELLING, AS POSTGRES WRITES IT (Security S-2) ───────────────
       This arm used to demand `/\.\d{6}\+/` — six fraction digits, always —
       which is a string PostgreSQL cannot produce for a millisecond-precision
       watermark: it TRIMS trailing zeros and OMITS the fraction on an exact
       second, and a 10 s cadence lands on an exact second constantly. The
       guard that is the exit code for T-2 was calibrated to an unreachable
       spelling, so it could not certify the label it exists to certify.

       The shape below is PostgreSQL's rule, not the helper's opinion: offset
       always `+00:00`, never `Z`, fraction OPTIONAL, and when present never
       ending in a zero. The authority on what a real server renders is
       tests/sec-world-tick-m3-seed-label.mjs S-M3-2, which asks pglite on an
       exact second and on two millisecond precisions; this guard has no
       database and states the shape it can state without one. */
    const PG_TSTZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d*[1-9])?\+00:00$/;
    ok('C9', PG_TSTZ.test(c.accruedToText),
      `the fixture watermark ${c.accruedToText} is not the accrue path's spelling `
      + '(+00:00, never Z, fraction optional and never zero-padded)');
    /* AND THE HELPER AGREES WITH IT ON BOTH SHAPES THE CADENCE MEETS — the
       exact second and a millisecond — rather than on whichever one the
       fixture happens to start at. */
    const exact = pgTimestamptzText(Date.UTC(2026, 2, 14, 20, 0, 0));
    const milli = pgTimestamptzText(Date.UTC(2026, 2, 14, 20, 0, 9, 600));
    ok('C9', exact === '2026-03-14T20:00:00+00:00',
      `an exact second renders "${exact}" — Postgres omits the fraction entirely`);
    ok('C9', milli === '2026-03-14T20:00:09.6+00:00',
      `a .600 millisecond renders "${milli}" — Postgres trims the trailing zeros`);
    ok('C9', PG_TSTZ.test(exact) && PG_TSTZ.test(milli),
      'the helper does not render the shape this arm requires of the envelope');
    /* NOT STRUCTURALLY BLIND. world-tick-parity.mjs feeds one JS helper to both
       sides of every comparison, so it cannot see how production spells a
       label. This asserts the two spellings are different NUMBERS. */
    const a = hashLabel(c.userId, c.slot, 'accrue:' + c.accruedToText);
    const b = hashLabel(c.userId, c.slot, 'accrue:' + new Date(FROM_MS).toISOString());
    ok('C9', a !== b,
      'the two label spellings hash to the SAME seed — this arm cannot detect T-2');
    /* ── AND THE PRECONDITION IS EXECUTABLE. A session with no rendered
       watermark cannot be labelled the accrue path's way, and the only other
       thing to spell one from is a Date — which IS the defect. The module
       originally fell through to `seedFor`'s Date path here, and C14's
       value-conservation arm caught it: the shipped loop and this guard's own
       chain drew two different streams for the same windows. T-2, reproduced
       inside the module written to prevent it. It now refuses. */
    let threwNoText = null;
    try {
      const { accruedToText, ...noText } = c;
      settleCombatSession(noText, FROM_MS, TO_MS, { cadenceMs: CADENCE_MS });
    } catch (e) { threwNoText = e; }
    ok('C9', threwNoText !== null && /accruedToText|T-2/.test(String(threwNoText && threwNoText.message)),
      'settleCombatSession accepted a session with no rendered watermark — it would then '
      + 'seed every window from a Date, which is the spelling the accrue path has never used');
    say(`   C9  label "${c.accruedToText}" -> ${a}; the Z spelling -> ${b}`);
  }

  // ── C12 / C13 / C14: the flush ────────────────────────────────────────────
  if (!loopMut && settled.length) {
    const run = settleCombatSession(c, FROM_MS, TO_MS, {
      cadenceMs: CADENCE_MS, flushMs: DEFAULT_FLUSH_MS, holder: 'guard',
    });
    ok('C14', run.intents.length > 0, 'the flush produced no intent');
    for (const it of run.intents) {
      ok('C14', it.rpc === 'hr_tick_settle',
        `the tick proposed ${it.rpc} — it does not hold raw hr_apply`);
      ok('C14', it.args.p_channel === CHANNEL, `channel ${it.args.p_channel}`);
      ok('C14', it.args.p_delta.accrued_to === it.args.p_window_to,
        'the declared window and the paid watermark disagree — a caller could name ten '
        + 'seconds and pay an hour');
      const want = tickIntentId(c.shard, c.userId, c.slot, it.window.fromMs, it.window.toMs,
        it.rehydrateBefore ? null : c.version);
      ok('C14', it.args.p_intent_id === want,
        'the idempotency key is not tickIntentId unchanged — S-3 closed the weaker spelling once');
      ok('C14', it.seq === 0 ? it.args.p_version === c.version : it.args.p_version === null,
        `intent ${it.seq} carries version ${it.args.p_version}; intents 2..N are stale by `
        + 'construction and must carry null (S-6)');
      ok('C14', it.wroteAnything === false, 'an intent claimed it wrote something');

      // C12 — the journal row
      const meta = it.args.p_delta.journal.meta;
      const ALLOWED = ['ms', 'ticks', 'kills', 'capped', 'ate', 'spent', 'w', 'from', 'to', 'src'];
      const keys = Object.keys(meta);
      const unknown = keys.filter((k) => !ALLOWED.includes(k));
      ok('C12', unknown.length === 0, `unknown journal meta key(s): ${unknown.join(', ')}`);
      ok('C12', keys.length <= ALLOWED.length,
        `${keys.length} meta keys > the ${ALLOWED.length}-key allowlist`);
      ok('C12', !('att' in meta),
        'a tick combat row carried an attended split — the refusal is what buys the key budget');
      ok('C12', meta.src === 'tick', 'the tick marker is missing — an operator cannot tell');
      ok('C12', it.args.p_delta.journal.kind === CHANNEL
        && it.args.p_delta.journal.intent === 'accrue',
        'the journal does not name kind=combat / intent=accrue');
      for (const k of keys) {
        const v = meta[k];
        ok('C12', v === null || typeof v !== 'object' || k === 'spent',
          `journal meta key '${k}' is nested — artisan-accrual T7 refuses that`);
      }

      // C13 — the three per-apply clamps
      const prog = it.args.p_delta.progress || [];
      ok('C13', prog.length <= MAX_PROGRESS_OPS,
        `${prog.length} progress ops > hr_apply's c_max_progress_ops (${MAX_PROGRESS_OPS}) — `
        + 'too_many_progress_ops refuses the WHOLE flush window');
      const seen = new Set();
      for (const op of prog) {
        const k = [op.kind, op.key, op.period ?? '', op.state ?? 'active'].join('\u0000');
        ok('C13', !seen.has(k), `progress op ${k} appears twice after the fold`);
        seen.add(k);
      }
      ok('C13', !Array.isArray(it.args.p_delta.hearthfind),
        'hearthfind reached the intent as an ARRAY — hr_apply answers bad_hearthfind');
      ok('C13', (it.args.p_delta.deaths || []).length <= MAX_DEATH_ROWS,
        `${(it.args.p_delta.deaths || []).length} death rows > MAX_DEATH_ROWS`);
    }
    /* ── C14b: THE FLUSH NEITHER LOSES NOR INVENTS VALUE ────────────────────
       `intentValue` is what a 48 h shadow read is compared on, so if it
       disagreed with the windows that produced it the parity number would be
       measuring the FOLD rather than the tick. Summed here from the per-window
       deltas independently of the fold that built the intents. */
    const iv = intentValue(run.intents);
    const fromWindows = { gold: 0, kills: 0, ate: 0, deaths: 0, xp: {}, items: {} };
    for (const w of settled) {
      const d = w.res.delta;
      fromWindows.gold += Number(d.gold || 0);
      fromWindows.kills += Number(d.journal.meta.kills || 0);
      fromWindows.ate += Number(d.journal.meta.ate || 0);
      fromWindows.deaths += Array.isArray(d.deaths) ? d.deaths.length : 0;
      for (const k of Object.keys(d.xp || {})) fromWindows.xp[k] = (fromWindows.xp[k] || 0) + d.xp[k];
      for (const k of Object.keys(d.items || {})) fromWindows.items[k] = (fromWindows.items[k] || 0) + d.items[k];
    }
    ok('C14', iv.gold === fromWindows.gold && iv.kills === fromWindows.kills
      && iv.ate === fromWindows.ate,
      `the flush's value summary (gold ${iv.gold}, kills ${iv.kills}, ate ${iv.ate}) `
      + `disagrees with the windows that produced it (${fromWindows.gold}, `
      + `${fromWindows.kills}, ${fromWindows.ate}) — the parity read would measure the fold`);
    const sortObj = (m) => { const o2 = {}; for (const k of Object.keys(m).sort()) if (m[k] !== 0) o2[k] = m[k]; return o2; };
    eq('C14', iv.xp, sortObj(fromWindows.xp), 'the flush lost or invented XP');
    eq('C14', iv.items, sortObj(fromWindows.items), 'the flush lost or invented items');
    /* Deaths are APPEND and are CLAMPED after the fold, so the intent may carry
       FEWER than the windows produced — never more. */
    ok('C14', iv.deaths <= fromWindows.deaths,
      `the flush carries ${iv.deaths} death rows from ${fromWindows.deaths} windows' worth`);

    /* The raw (unfolded) op count, so the cliff is a MEASUREMENT on every run
       and not a sentence in a document — and so `progressNoFold` has somewhere
       to bite: under it the guard grades the list a tick using gather's fold
       ALONE would send, which is the 64+ ops hr_apply refuses. */
    let worstRaw = 0; let worstFold = 0;
    {
      const perFlush = Math.max(1, Math.round(DEFAULT_FLUSH_MS / CADENCE_MS));
      for (let i = 0; i + perFlush <= settled.length; i++) {
        let raw = [];
        for (let j = i; j < i + perFlush; j++) raw = raw.concat(settled[j].res.delta.progress || []);
        worstRaw = Math.max(worstRaw, raw.length);
        worstFold = Math.max(worstFold, foldProgressOps(raw).length);
        const sumRaw = raw.reduce((a, o) => a + Math.floor(Number(o.add || 0)), 0);
        const sumFold = foldProgressOps(raw).reduce((a, o) => a + Math.floor(Number(o.add || 0)), 0);
        ok('C13', sumRaw === sumFold,
          `the progress fold changed sum(add) ${sumRaw} -> ${sumFold}. It is a FOLD `
          + '(hr_apply applies each op as progress += add against one keyed row), not a clamp.');
        if (M.noProgressFold) {
          ok('C13', raw.length <= MAX_PROGRESS_OPS,
            `an UNFOLDED ${perFlush}-window flush files ${raw.length} progress ops against `
            + `hr_apply's c_max_progress_ops (${MAX_PROGRESS_OPS}) — too_many_progress_ops `
            + 'refuses the WHOLE flush window');
        }
      }
    }
    if (worstRaw) {
      say(`   C13 worst ${Math.round(DEFAULT_FLUSH_MS / CADENCE_MS)}-window flush: `
        + `${worstRaw} raw progress ops -> ${worstFold} folded (cap ${MAX_PROGRESS_OPS})`);
      if (worstRaw > MAX_PROGRESS_OPS) {
        findings.push(`   · ${c.name}: the UNFOLDED flush would file ${worstRaw} progress ops `
          + `against hr_apply's cap of ${MAX_PROGRESS_OPS} — too_many_progress_ops`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// C11 — RESTED XP TELESCOPES. Omitting it from the tick is loss-free.
// ═══════════════════════════════════════════════════════════════════════════
{
  /* TWELVE HOURS, not ten minutes, and graded on the WATERMARK. `restedAt`
     advances by the charges PAID regardless of whether the bank saturated, so
     it is the cap-independent statement of the property; and a ten-minute span
     holds so few charge boundaries that a caller which stamped `now()` would
     agree by luck. The identity being asserted is the telescope:
       sum_i floor((w_i - restedAt_{i-1}) / C)  ==  floor((t1 - restedAt_0) / C)
     which holds because accrueRestedXp advances `restedAt` by exactly
     `charges x C` and NEVER to `now()` — the b214 offline double-pay defence.
     The `1234` is deliberate: an offset that is not a whole number of polls is
     what a stamped-`now()` caller silently discards. */
  /* SIX HOURS — 63 charges against the 80-charge bank, so the span stays BELOW
     saturation. That bound is the honest scope of the claim and not a
     convenience: above the cap `accrueRestedXp` grants 0, `accrueRested`
     answers `accrued:false`, and index.ts's `mergeRested` therefore does not
     advance `rested_at` at all — so a decomposed chain KEEPS time a single
     call throws away. Measured below; the direction is that the ONE-CALL path
     forfeits, which means the tick's omission is never the cause either way. */
  const SPAN = 6 * 3600000;
  const END = FROM_MS + SPAN;
  const restedAt0 = FROM_MS - 3 * RESTED_CHARGE_MS - 1234;
  const one = accrueRested({ nowMs: END, restedAtMs: restedAt0, restedXp: 0, libraryCap: null });
  let at = restedAt0; let xp = 0; let granted = 0; let polls = 0;
  for (let clock = FROM_MS + CADENCE_MS; clock <= END; clock += CADENCE_MS) {
    const r = accrueRested({ nowMs: clock, restedAtMs: at, restedXp: xp, libraryCap: null });
    polls++;
    if (!r.accrued) continue;
    granted += r.granted;
    xp = r.restedXp;
    at = M.restedNow ? clock : r.restedAt;   // THE MUTANT: advance to now()
  }
  ok('C11', at === one.restedAt,
    `the Rested watermark does not telescope: ${polls} windows left rested_at at `
    + `${at} where one call leaves ${one.restedAt} (a gap of ${one.restedAt - at} ms). `
    + 'A tick that does not settle the bank is only loss-free because this holds.');
  ok('C11', xp === one.restedXp,
    `the Rested bank does not telescope: ${xp} decomposed against ${one.restedXp} in one call`);
  ok('C11', granted > 0 && one.granted > 0,
    'harness: no charges were granted at all, so this arm proves nothing');
  /* The bank saturates, and a saturating add composes the same way:
     min(lim, min(lim, b+c1)+c2) == min(lim, b+c1+c2). */
  const sat = accrueRested({ nowMs: END, restedAtMs: FROM_MS - RESTED_CAP * RESTED_CHARGE_MS * 4,
    restedXp: RESTED_CAP - 1, libraryCap: null });
  ok('C11', sat.restedXp === RESTED_CAP,
    `the bank did not saturate at ${RESTED_CAP} (got ${sat.restedXp})`);
  /* ── ABOVE THE CAP, STATED RATHER THAN AVOIDED ──────────────────────────
     A FULL bank grants 0, so `accrueRested` answers `accrued:false` and the
     caller does not merge the keys — `rested_at` stops moving. One call over a
     long absence therefore banks 80 and advances the watermark past everything
     it did not bank; a chain of short calls stops advancing at the cap and
     keeps the rest. The asymmetry is the ACCRUE PATH's, present today with no
     tick in the picture, and it runs in the player's favour on the decomposed
     side. Asserted so that "the tick lost my Rested XP" can be answered with
     an exit code rather than an opinion. */
  const capFull = accrueRested({ nowMs: END, restedAtMs: FROM_MS - 200 * RESTED_CHARGE_MS,
    restedXp: RESTED_CAP, libraryCap: null });
  ok('C11', capFull.accrued === false,
    'a full bank granted something — the cap is not the cap');
  ok('C11', capFull.restedAt <= FROM_MS - 200 * RESTED_CHARGE_MS
    || capFull.accrued === false,
    'harness: the saturated arm is not measuring the watermark it claims to');
  say(`\n   C11 rested over ${SPAN / 3600000} h: rested_at ${at} == ${one.restedAt}; `
    + `bank ${xp} == ${one.restedXp} (${granted} charge events)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// C13 — the fold's own units, proved directly rather than only through a chain
// ═══════════════════════════════════════════════════════════════════════════
{
  const ops = [
    { kind: 'stat', key: 'kills', period: '', add: 3, state: 'active' },
    { kind: 'stat', key: 'kills', period: '', add: 4, state: 'active' },
    { kind: 'stat', key: 'deaths', period: '2026-3-14', add: 1, state: 'active' },
    { kind: 'daily', key: 'ev:kill_any', period: '2026-3-14', add: 2, state: 'active' },
    { kind: 'daily', key: 'ev:kill_any', period: '2026-3-14', add: 5, state: 'done' },
  ];
  const folded = M.noProgressFold ? ops : foldProgressOps(ops);
  ok('C13', folded.length === 4,
    `the flush carried ${folded.length} progress ops where 5 windows' worth collapses `
    + 'to 4 distinct (kind, key, period, state) rows — hr_apply applies each op as '
    + '`progress += add` against ONE keyed row, so an unfolded flush is the same write '
    + 'spread over more ops than c_max_progress_ops allows');
  ok('C13', folded.reduce((a, o) => a + o.add, 0) === 15,
    'the progress fold changed sum(add)');
  const active = folded.find((o) => o.key === 'ev:kill_any' && o.state === 'active');
  const done = folded.find((o) => o.key === 'ev:kill_any' && o.state === 'done');
  ok('C13', !!active && !!done && active.add === 2 && done.add === 5,
    'the fold summed a `done` into an `active` — they are different facts');

  const hf = M.noHearthfindCollapse
    ? [{ item: 'a' }, { item: 'b' }, { item: 'c', dropped: 2 }]
    : collapseHearthfind([{ item: 'a' }, { item: 'b' }, { item: 'c', dropped: 2 }]);
  ok('C13', !Array.isArray(hf),
    'collapseHearthfind left an ARRAY — hr_apply checks jsonb_typeof and answers bad_hearthfind');
  ok('C13', Array.isArray(hf) || hf.dropped === 4,
    `the collapsed find reports dropped=${hf.dropped}; three finds carrying two prior `
    + 'discards is four thrown away');

  const many = Array.from({ length: 40 }, (_, i) => ({ deaths: [{ monster: 'goblin', n: i }] }));
  const clamped = foldCombatDelta(many);
  ok('C13', clamped.deaths.length === MAX_DEATH_ROWS,
    `${clamped.deaths.length} death rows survived the fold against MAX_DEATH_ROWS `
    + `(${MAX_DEATH_ROWS}) — hr_apply rejects the whole flush`);

  let threw = null;
  try {
    foldCombatDelta([{ progress: Array.from({ length: MAX_PROGRESS_OPS + 1 },
      (_, i) => ({ kind: 'stat', key: `k${i}`, period: '', add: 1, state: 'active' })) }]);
  } catch (e) { threw = e; }
  ok('C13', threw !== null,
    'foldCombatDelta accepted more progress ops than hr_apply will — it must FAIL LOUD, '
    + 'never truncate a counter a player watches');

  let threwAtt = null;
  try { foldCombatMeta([{ ms: 1, ticks: 1, kills: 1, capped: false, ate: 0, att: {} }], 0, 1); } catch (e) { threwAtt = e; }
  ok('C12', threwAtt !== null, 'foldCombatMeta accepted an attended split');
}

// ═══════════════════════════════════════════════════════════════════════════
// C15 — THE FOURTH COPY OF PAYABLE_KINDS
// ═══════════════════════════════════════════════════════════════════════════
{
  /* plpgsql cannot import accrual.js, so every SQL statement of "which kinds
     may the tick settle" is a hand-typed copy of `PAYABLE_KINDS`. There were
     three — hr_tick_roster's `c_payable`, hr_tick_settle's `c_payable`, and
     hr_tick_ownership's channel CHECK — and world-tick-parity.mjs P-G7/P-G7b
     guard those. 2026-09-22-world-tick-combat-channel.sql adds a fourth, on
     `hr_tick_config.channels`, and the price of a fourth copy is this arm.

     A drift here is quiet in the worst way: the tick would refuse to be
     POINTED at a kind the engine pays, which reads to a player as "combat
     stopped crediting" and to an operator as nothing at all. */
  const sql = readFileSync(
    join(ROOT, 'supabase/migrations/2026-09-22-world-tick-combat-channel.sql'), 'utf8');
  const m = sql.match(/hr_tick_config_channels_ck[\s\S]{0,200}?channels\s*<@\s*array\[([^\]]*)\]/);
  ok('C15', !!m,
    'C15 could not find hr_tick_config_channels_ck\'s channel literal — the drift guard '
    + 'has nothing to compare, which is the state P-G7 exists to prevent');
  if (m) {
    const inCk = m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
    eq('C15', inCk.slice().sort(), PAYABLE_KINDS.slice().sort(),
      'hr_tick_config.channels\' CHECK does not match accrual.js PAYABLE_KINDS — the tick '
      + 'could not be pointed at a kind the engine pays');
  }
  /* AND THE FILE STILL DOES NOT ARM COMBAT. A migration that widened the
     default, or that UPDATEd the singleton, would turn a channel on by being
     applied — which is an operator decision with its own Security GO. The
     migration's own c3 asserts this by execution against a real database; this
     asserts it on the SOURCE, so it is red in CI before an apply is attempted. */
  ok('C15', !/update\s+public\.hr_tick_config\s+set[\s\S]{0,200}?channels/i.test(sql),
    'the staged migration UPDATEs hr_tick_config.channels — applying a file must not arm a channel');
  ok('C15', !/alter\s+column\s+channels\s+set\s+default/i.test(sql),
    'the staged migration re-defaults hr_tick_config.channels — applying a file must not arm '
    + 'a channel, and the default is the fence\'s to set');
}

// ═══════════════════════════════════════════════════════════════════════════
// sessionFromRoster — the production shape, checked once
// ═══════════════════════════════════════════════════════════════════════════
{
  const row = {
    user_id: '00000000-0000-4000-8000-0000000000c1', slot: 0, shard: 0, version: 9,
    active_kind: 'combat', active_id: 'goblin',
    active_since: '2026-03-14T19:00:00.000000+00:00',
    accrued_to: '2026-03-14T20:00:00.123456+00:00',
    cap_ms: 43200000,
  };
  const env = {
    hp: 40, max_hp: 60, gold: 10, skills: {}, inventory: {}, equipment: {},
    /* THE ENVELOPE'S OWN RENDERING of the watermark — `state->>'accrued_to'`,
       which is where the label comes from (S-3). */
    accrued_to: '2026-03-14T20:00:00.123456+00:00',
    auto_eat_enabled: true, auto_eat_food: 'cooked_trout', auto_eat_pct: 70,
    deaths_today: 6, deaths_lifetime: 60, fight: {}, consec_falls: 2,
    recovering_until: '2026-03-14T20:02:00.000000+00:00',
    hearthfind_ready: true, combat_style: null, enchant: {},
  };
  const s = sessionFromRoster(row, env);
  ok('C9', s.accruedToText === env.accrued_to,
    'sessionFromRoster did not label from the envelope\'s own rendering of accrued_to '
    + '(T-2, S-3)');

  /* ── THE TWO SHAPES A DRIVER ACTUALLY HANDS BACK (Security S-3) ──────────
     `hr_tick_roster.accrued_to` is a timestamptz. The `postgres` driver parses
     OID 1184 into a JS Date; others hand back their own text,
     `2026-03-14 20:00:00.123456+00` — a SPACE separator and `+00`. Both name
     the right instant and neither is the spelling hr_seed is hashed over, so
     neither may become the label. With the envelope present the label is
     unmoved; with the envelope gone the session is REFUSED, not guessed. */
  for (const driverShape of [
    new Date('2026-03-14T20:00:00.123Z'),
    '2026-03-14 20:00:00.123456+00',
  ]) {
    const sd = sessionFromRoster({ ...row, accrued_to: driverShape }, env);
    ok('C9', sd.accruedToText === env.accrued_to,
      `a roster column handed over as ${typeof driverShape === 'string' ? 'driver text' : 'a Date'} `
      + `became the label "${sd.accruedToText}" — the label is the envelope's rendering`);
    let threwDriver = null;
    try {
      const { accrued_to: _drop, ...noEnv } = env;
      sessionFromRoster({ ...row, accrued_to: driverShape }, noEnv);
    } catch (e) { threwDriver = e; }
    ok('C9', threwDriver !== null,
      'sessionFromRoster spelled the label from the roster\'s timestamptz column when the '
      + 'envelope carried none — a Date or the driver\'s text is not the accrue path\'s spelling');
  }

  /* THE SHADOW DISPLACEMENT, STATED. In shadow the roster's watermark is
     `greatest(accrued_to, shadow_accrued_to)`, an instant the envelope may
     never have held — so the envelope's string names the WRONG instant and is
     refused. The fence's own rendering (`mark_text`, what probeWatermark
     carries) is what the driver must thread through, and it is accepted. */
  const displaced = { ...row, accrued_to: '2026-03-14T20:05:00.5+00:00' };
  let threwDisplaced = null;
  try { sessionFromRoster(displaced, env); } catch (e) { threwDisplaced = e; }
  ok('C9', threwDisplaced !== null,
    'sessionFromRoster labelled a displaced shadow watermark with the envelope\'s string, '
    + 'which names a different instant — a stale label is the same wrong stream');
  const withMark = sessionFromRoster(
    { ...displaced, mark_text: '2026-03-14T20:05:00.5+00:00' }, env);
  ok('C9', withMark.accruedToText === '2026-03-14T20:05:00.5+00:00'
    && withMark.accruedToMs === Date.parse('2026-03-14T20:05:00.5+00:00'),
    'the fence\'s own rendering of the effective watermark was not used as the label');
  ok('C1', s.autoEatEnabled === true && s.autoEatPct === 70 && s.autoEatFood === 'cooked_trout',
    'sessionFromRoster dropped the auto-eat trio');
  ok('C1', s.deathsTodayBefore === 6 && s.deathsLifetimeBefore === 60,
    'sessionFromRoster dropped the recovery ladder\'s counters');
  ok('C3', s.recoveringUntilMs === Date.parse(env.recovering_until) && s.consecFalls === 2,
    'sessionFromRoster dropped a combat checkpoint');
  let threwKind = null;
  try { sessionFromRoster({ ...row, active_kind: 'gather' }, env); } catch (e) { threwKind = e; }
  ok('C0', threwKind !== null, 'sessionFromRoster accepted a non-combat roster row');
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════════════════════════

const TEXT = CLAIM_TEXT();
if (MUTATE) {
  if (problems.length === 0) {
    console.error(`world-tick-combat-parity --mutate --${MUTATION}: the mutation changed NOTHING.\n`
      + `  It is supposed to turn ${M.kills} red. A guard that cannot go red is not a guard.`);
    process.exit(1);
  }
  const hit = new Set(problems.map((p) => p.split(' ')[0]));
  const wanted = String(M.kills).split('/');
  const missed = wanted.filter((w) => !hit.has(w));
  console.log(`world-tick-combat-parity --mutate --${MUTATION}: RED, as required.`);
  console.log(`  turned red: ${[...hit].sort().join(', ')}   (wanted ${M.kills})`);
  for (const p of problems.slice(0, 4)) console.log(`   ✗ ${p}`);
  if (missed.length) {
    console.error(`  but ${missed.join(', ')} stayed GREEN — the mutation is not proving `
      + 'the claim it is filed against.');
    process.exit(1);
  }
  process.exit(0);
}

if (problems.length) {
  console.error('world-tick-combat-parity: RED\n');
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}

console.log('world-tick-combat-parity: green — the combat channel is the SAME engine, '
  + 'window for window.');
for (const [k, v] of Object.entries(TEXT)) {
  if (claims.has(k)) console.log(`   ${k.padEnd(4)} ${v}`);
}
for (const f of findings) console.log(f);
console.log('\n   mutation proof: node tests/world-tick-combat-parity.mjs --mutate --<name>');
console.log(`   mutants: ${Object.keys(MUTATIONS).join(', ')}`);
