#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bestiary-trophy.mjs — THE TROPHY IS CLAIMED, THE POWER IS DERIVED,
// AND NEITHER HALF TRUSTS THE CLIENT.
//
//   node tests/bestiary-trophy.mjs             the guard (pure arm + SQL arm)
//   node tests/bestiary-trophy.mjs --pure      the pure arm only (no pglite)
//   node tests/bestiary-trophy.mjs --report    print what it measured, gate too
//   node tests/bestiary-trophy.mjs --selftest  mutation proof: each defect caught
//
// ── WHAT THIS OWNS, AND WHAT tests/bestiary-ladder.mjs OWNS ─────────────────
// bestiary-ladder.mjs owns the DATA: that every monster has a ladder, that the
// census is generated rather than typed, and that every authored bonus sits
// inside its band. This file owns the two halves that data becomes:
//
//   THE DERIVED HALF (pure, milliseconds, no database) — src/core/trophies.js
//   turns the server's kill counters into a multiplier, the product with the
//   class charm is clamped once, the damage half is honestly dormant, and the
//   attended and away paths read ONE number (AWAY-1).
//
//   THE CLAIMED HALF (a real PostgreSQL, via tests/schema-replay.mjs) —
//   hr_trophy_claim refuses below the threshold, refuses a second claim, writes
//   exactly one progress row and exactly one ledger row, and cannot be told a
//   kill count because its signature has nowhere to put one.
//
// ── WHY THE SQL ARM EXISTS AT ALL, GIVEN §5 OF THE MIGRATION ────────────────
// 2026-09-22-trophy-claim.sql asserts these properties in its own §4 self-check
// and tests/schema-drift.mjs executes that on every replay — so the CLEAN case
// is already covered twice. What this file adds is the thing a self-check
// structurally cannot do: it MUTATES the migration and requires each defect to
// be caught. A self-check runs inside the file it is checking; it can only ever
// prove that file correct as written, never that its guards bite.
//
// Design: docs/design/BESTIARY_LADDER.md. Engine: src/core/trophies.js.
// Ladder data: src/data/bestiary.js.
//
// Exit: 0 green · 1 a finding · 2 harness (a module would not load, pglite is
// absent, or --selftest could not plant a defect).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TROPHY_STAGES, MAX_TROPHY_DROP_MULT, MAX_TROPHY_DAMAGE_MULT, MAX_MEMORY_DROP_MULT,
  MAX_TROPHY_STAGE, trophyKey, trophyStageAt,
} from '../src/data/bestiary.js';
import { CHARM_RANKS, MAX_CHARM_DROP_MULT } from '../src/data/bestiary-charms.js';
import { MONSTERS } from '../src/data/monsters.js';
import { MAX_TOTAL_DAMAGE_MULT } from '../src/core/elements.js';
import {
  trophyIndex, trophyDropMultFor, trophyDamageMultFor, trophyStageFor,
  memoryDropMult, TROPHY_DAMAGE_ARM_ENABLED,
} from '../src/core/trophies.js';
import { weaknessInfo, playerCombatRolls, equipmentStats } from '../src/core/combat.js';
import { charmIndex, killsByClass } from '../src/core/charms.js';
import { ITEMS } from '../src/data/items.js';
import { readTrophy } from '../supabase/functions/hr-accrue/request.js';
import { resolveTrophyClaim } from '../supabase/functions/hr-accrue/trophy-claim.js';
import { INTENT_REGISTRY } from '../supabase/functions/hr-accrue/intents.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLAIM_SQL_FILE = join(ROOT, 'supabase', 'migrations', '2026-09-22-trophy-claim.sql');

/* player_progress.key is `check (length(key) between 1 and 64)`. */
const KEY_MAX = 64;
/* The chain name tests/schema-apply-order.json gives the file under test. */
const CLAIM_FILE = '2026-09-22-trophy-claim.sql';

const near = (a, b) => Math.abs(a - b) < 1e-9;

/* An RPC answer, reduced to the fact a finding is about. A successful claim
   returns the WHOLE hr_state_of envelope — every skill, the bag, the farm — and
   a message that printed it would bury the verdict under a character sheet. */
const verdict = (r) => JSON.stringify({
  ok: r?.ok, error: r?.error, replayed: r?.replayed, detail: r?.detail, claimed: r?.claimed,
});

// ════════════════════════════════════════════════════════════════════════
// THE PURE ARM — the derived multiplier, over an INJECTABLE world so a
// mutation can be planted in any input and the NAMED assertion required to be
// the one that reports it.
// ════════════════════════════════════════════════════════════════════════

/** The world the pure assertions read. Everything injectable; nothing global. */
function realPureWorld() {
  return {
    stages: TROPHY_STAGES.map((r) => ({ ...r })),
    charmRanks: CHARM_RANKS.map((r) => ({ ...r })),
    roster: Object.fromEntries(Object.keys(MONSTERS).map((id) => [id, { ...MONSTERS[id] }])),
    maxDrop: MAX_TROPHY_DROP_MULT,
    maxDmg: MAX_TROPHY_DAMAGE_MULT,
    maxMemory: MAX_MEMORY_DROP_MULT,
    maxCharmDrop: MAX_CHARM_DROP_MULT,
    maxTotalDamage: MAX_TOTAL_DAMAGE_MULT,
    wireMax: 4,          // request.js MAX_TROPHY_STAGE_WIRE, re-read below
    sqlThresholds: null, // filled from the migration by auditPure's caller
    /* The multiplier functions themselves are NOT injected: they are the thing
       under test. What is injected is every number they are supposed to obey,
       so a mutation moves the CONTRACT and the assertion has to notice. */
  };
}

function auditPure(w) {
  const f = [];
  const say = (id, msg) => f.push({ id, msg });

  /* T1 — THE DERIVED MULTIPLIER EQUALS THE DESIGN'S TABLE, AT EVERY STAGE, on
     the exact threshold and one kill below it. This is the assertion the whole
     "the power is derived" claim rests on: if the table and the derivation
     disagree, a player is paid a rate nobody authored. */
  for (const row of w.stages) {
    const idx = Object.create(null); idx.slime = row.stage;
    const got = trophyDropMultFor('slime', idx);
    /* ⚠ COMPARED AGAINST THE TABLE AS AUTHORED, NOT AGAINST `min(table, ceiling)`.
       Pre-applying the clamp here would make this assertion agree with the
       derivation for ANY authored value at or above the ceiling — measured:
       with `want = Math.min(row.drop, maxDrop)` a table re-priced to x1.99 is
       invisible to T1, because both sides collapse to x1.03. The clamp is a
       property of the FORMULA and T3 owns it; T1 owns the narrower question of
       whether the derivation says what the ladder says. */
    if (!near(got, row.drop)) {
      say('T1', `stage ${row.stage} (${row.id}) derives drop x${got}, the ladder authors x${row.drop}`);
    }
    const at = trophyStageAt(row.at);
    if (!at || at.stage !== row.stage) {
      say('T1', `${row.at} kills derives stage ${at ? at.stage : 'null'}, expected ${row.stage}`);
    }
    const below = trophyStageAt(row.at - 1);
    if (below && below.stage >= row.stage) {
      say('T1', `${row.at - 1} kills — one short of ${row.id} — already derives stage ${below.stage}`);
    }
  }

  /* T2 — STAGE 1 PAYS NO POWER. Design §2: a first rung that paid a multiplier
     would make the first 2,500 kills of all 108 monsters compulsory rather than
     chosen, which is the opposite of what the ladder is for. EXACTLY 1, not
     "about 1": the trophy and the revealed drop table ARE the reward. */
  const q = Object.create(null); q.slime = 1;
  /* BOTH SIDES, because they can fail apart: the authored table is where a
     designer would put the bonus, and the derivation is where a clamp or an
     off-by-one rung would introduce one. An assertion that read only the module
     cannot see the first, which is the edit this rule exists to refuse. */
  if (w.stages[0].drop !== 1) {
    say('T2', `the ladder authors x${w.stages[0].drop} at stage 1 — the first rung must pay the trophy and the revealed drop table, and no power`);
  }
  if (w.stages[0].dmg !== 1) {
    say('T2', `the ladder authors damage x${w.stages[0].dmg} at stage 1 — the first rung pays no power at all`);
  }
  if (trophyDropMultFor('slime', q) !== 1) {
    say('T2', `stage 1 derives a drop multiplier (x${trophyDropMultFor('slime', q)}) — the first rung must pay the trophy and nothing else`);
  }

  /* T3 — THE PRODUCT OF BOTH REMEMBERED-KILLS LADDERS, over EVERY pair, never
     exceeds MAX_MEMORY_DROP_MULT — and the clamp is the FORMULA's, so a hostile
     pair is clamped too. Design §2.3: two ladders that each clamp only
     themselves are two ladders whose product is nobody's job. */
  for (const c of w.charmRanks) {
    for (const t of w.stages) {
      const product = Math.max(1, c.drop) * Math.max(1, t.drop);
      if (product > w.maxMemory + 1e-9) {
        say('T3', `charm ${c.id} (x${c.drop}) x trophy ${t.id} (x${t.drop}) = ${product.toFixed(4)}, over MAX_MEMORY_DROP_MULT ${w.maxMemory}`);
      }
      const clamped = memoryDropMult(c.drop, t.drop);
      if (clamped > w.maxMemory + 1e-9) {
        say('T3', `memoryDropMult(${c.drop}, ${t.drop}) returned ${clamped}, over the ceiling it exists to apply`);
      }
    }
  }
  /* …and the clamp BITES on a pair no table authors, which is what makes it a
     property of the formula rather than a restatement of the data. */
  if (memoryDropMult(9, 9) > w.maxMemory + 1e-9) {
    say('T3', `memoryDropMult(9, 9) returned ${memoryDropMult(9, 9)} — the ceiling is not applied by the formula`);
  }

  /* T4 — THE OWN-PROPERTY RECEIPT. charms.js already paid for this one: with
     `Object.prototype.constructor` truthy on any plain object, a lookup written
     as `index[id]` handed out a top-rung bonus against something nobody had
     killed (Security review 2026-09-13). */
  for (const hostile of ['constructor', 'toString', 'valueOf', '__proto__']) {
    if (trophyDropMultFor(hostile, {}) !== 1 || trophyStageFor(hostile, {}) !== 0) {
      say('T4', `"${hostile}" resolves to a trophy on an empty index — the lookup is not own-property only`);
    }
  }

  /* T5 — THE DAMAGE HALF IS DORMANT AND HONEST. Design §3.1: `maxHit` is an
     integer and `Math.floor` rounds x1.01 away, so the stated effect would do
     nothing — which is what tests/arm-flag-honesty.mjs exists for. While the
     flag is off EVERY stage must return exactly 1, including the top one that
     authors x1.01, and `weaknessInfo` must publish no damage readout for it. */
  for (const row of w.stages) {
    const idx = Object.create(null); idx.slime = row.stage;
    const got = trophyDamageMultFor('slime', idx);
    if (TROPHY_DAMAGE_ARM_ENABLED) {
      const want = Math.min(row.dmg, w.maxDmg);
      if (!near(got, want)) say('T5', `ARMED: stage ${row.id} derives damage x${got}, the ladder authors x${want}`);
    } else if (got !== 1) {
      say('T5', `stage ${row.id} pays damage x${got} while TROPHY_DAMAGE_ARM_ENABLED is false — a dormant flag that pays is worse than an armed one`);
    }
  }
  /* …and the dormant ladder leaves the one clamped damage expression untouched:
     a top-stage trophy must not move `damageMult` by a hair while it is off. */
  {
    const m = MONSTERS.slime;
    const eq = equipmentStats({}, ITEMS);
    const top = Object.create(null); top.slime = MAX_TROPHY_STAGE;
    const off = weaknessInfo(m, eq, null, null, 'slime');
    const on = weaknessInfo(m, eq, null, top, 'slime');
    if (!TROPHY_DAMAGE_ARM_ENABLED && !near(off.damageMult, on.damageMult)) {
      say('T5', `a top-stage trophy moved damageMult ${off.damageMult} → ${on.damageMult} while the arm flag is off`);
    }
    if (!TROPHY_DAMAGE_ARM_ENABLED && on.trophyDamageMult !== undefined) {
      say('T5', 'weaknessInfo publishes a trophyDamageMult readout for a bonus the engine does not apply');
    }
    if (on.damageMult > w.maxTotalDamage + 1e-9) {
      say('T5', `damageMult ${on.damageMult} exceeds MAX_TOTAL_DAMAGE_MULT ${w.maxTotalDamage}`);
    }
  }

  /* T6 — AWAY-1 / BOTH-PATH. The ATTENDED shape (`playerCombatRolls(m, ctx)`,
     which the live tick and the attended loot top-up call) and the AWAY shape
     (`weaknessInfo(m, eq, charms, trophies, id)`, which the span binds as
     `ctx.weakness`) must quote ONE drop rate for one fight. b509 is the receipt
     for why both columns get their own assertion: the away death was tested
     nine ways while the attended one handed out a free full heal.

     ⚠ AND THE ID IS THE THING THAT BREAKS FIRST. No roster row carries an `id`,
       so a caller that drops the fifth argument pays every charm and no trophy
       — silently, and on one path only. The third case below is that caller. */
  {
    const m = MONSTERS.slime;
    const eq = equipmentStats({}, ITEMS);
    const kills = Object.create(null); kills.slime = TROPHY_STAGES[TROPHY_STAGES.length - 1].at;
    const trophies = trophyIndex(kills, MONSTERS);
    const charms = charmIndex(killsByClass(kills, MONSTERS));

    const away = weaknessInfo(m, eq, charms, trophies, 'slime');
    const attended = playerCombatRolls(m, {
      eq, equipment: {}, items: ITEMS, skills: {}, charms, trophies, monsterId: 'slime',
    }).weak;
    if (!near(away.dropMult, attended.dropMult)) {
      say('T6', `AWAY-1 broken: the away binding quotes dropMult ${away.dropMult}, the attended one ${attended.dropMult}`);
    }
    if (away.trophyStage !== attended.trophyStage) {
      say('T6', `AWAY-1 broken: the two paths priced different stages (${away.trophyStage} vs ${attended.trophyStage})`);
    }
    /* The trophy must actually have PAID on both, or this assertion passes on
       two identical zeroes — the vacuous form of an AWAY-1 test. */
    const bare = weaknessInfo(m, eq, charms, null, 'slime');
    if (!(away.dropMult > bare.dropMult)) {
      say('T6', `a full-ladder trophy paid nothing (dropMult ${away.dropMult} vs ${bare.dropMult} with no trophy) — the both-path assertion is vacuous`);
    }
    /* …and a binding that forgot the id pays the charm and NOT the trophy. This
       is asserted as a FACT about the failure mode, so the day someone removes
       the id from a call site the shape of the loss is already documented. */
    const idless = weaknessInfo(m, eq, charms, trophies);
    if (idless.trophyStage !== 0 || idless.dropMult >= away.dropMult) {
      say('T6', 'a weaknessInfo call with no monster id paid a trophy — the index is being keyed off something other than the id');
    }
  }

  /* T7 — THE KEY, FOR EVERY MONSTER AT EVERY STAGE. Three properties, and each
     one is a production-only failure if it breaks: an overlong key is a claim
     that throws in production and nowhere else; a key that collides with the
     `ev:` namespace is a claimable row inside an engine counter sweep (design
     §5); and a key the SQL projection cannot parse back is a trophy that is
     written and never rendered. */
  for (const id of Object.keys(w.roster)) {
    for (const row of w.stages) {
      const key = trophyKey(id, row.stage);
      if (key.length > KEY_MAX) {
        say('T7', `trophy key "${key}" is ${key.length} chars, over player_progress's ${KEY_MAX}`);
      }
      if (key.startsWith('ev:')) {
        say('T7', `trophy key "${key}" is inside the ev: engine-counter namespace`);
      }
      /* The inverse of hr_trophy_of's split_part(key, ':', 2|3). */
      const parts = key.split(':');
      if (parts.length !== 3 || parts[0] !== 'trophy' || parts[1] !== id
          || String(parts[2]) !== String(row.stage)) {
        say('T7', `trophy key "${key}" does not parse back to (${id}, ${row.stage}) the way hr_trophy_of's split_part does`);
      }
    }
  }

  /* T8 — THE SQL LADDER AND THE JS LADDER ARE ONE LADDER. The thresholds are
     authored in src/data/bestiary.js and restated as a catalogue inside
     hr_trophy_claim, because a threshold a claim is judged against may never
     travel on the wire. Two copies of one number drift; this reads BOTH and
     compares them rather than restating either. */
  if (w.sqlThresholds) {
    const want = w.stages.map((r) => r.at);
    if (w.sqlThresholds.length !== want.length
        || w.sqlThresholds.some((n, i) => Number(n) !== Number(want[i]))) {
      say('T8', `hr_trophy_claim's c_at is [${w.sqlThresholds.join(', ')}] and TROPHY_STAGES is [${want.join(', ')}] — the two ladders have drifted`);
    }
  }

  /* T9 — THE WIRE BOUND AND THE LADDER AGREE. request.js refuses a stage
     outside 1..MAX_TROPHY_STAGE_WIRE so an unbounded integer never reaches a
     `::int` cast; if that bound fell BEHIND the ladder, the top rung would be
     unclaimable and the refusal would read "malformed request". */
  if (w.wireMax !== w.stages.length || MAX_TROPHY_STAGE !== w.stages.length) {
    say('T9', `the wire admits stages 1..${w.wireMax} and MAX_TROPHY_STAGE is ${MAX_TROPHY_STAGE}, but the ladder has ${w.stages.length} rungs`);
  }

  /* T10 — A FORGED KILL COUNT HAS NOWHERE TO TRAVEL. The wire's whole
     caller-supplied surface for this verb is `{monster, stage}`: anything else
     in the object is DROPPED by the parser, so a client that sends a count is
     not disbelieved — it is unheard (design §5). Proven on the parser AND on
     the intent's own resolver, because either one could grow a field. */
  {
    const parsed = readTrophy({ trophy: { monster: 'slime', stage: 1, kills: 999999, earned: true, mult: 9 } });
    if (!parsed) {
      say('T10', 'readTrophy refused an otherwise-valid claim that carried extra keys — a forged field must be dropped, not fatal');
    } else {
      for (const k of Object.keys(parsed)) {
        if (k !== 'monster' && k !== 'stage') {
          say('T10', `readTrophy carried "${k}" through to the intent layer — the wire has grown a field the server would have to disbelieve`);
        }
      }
    }
    const resolved = resolveTrophyClaim({ monster: 'slime', stage: 1, kills: 999999 });
    if (!resolved.ok) {
      say('T10', 'resolveTrophyClaim refused a valid claim carrying an extra key');
    } else {
      for (const k of Object.keys(resolved.claim)) {
        if (k !== 'monster' && k !== 'stage') {
          say('T10', `the intent forwards "${k}" to the commit statement — a client value reaching the claim decision`);
        }
      }
    }
    /* …and the STAGE is never rounded into range. A parser that rounded would
       turn a garbage request into a claim for a trophy nobody asked for. */
    for (const bad of [0, 5, 1.5, -1, '1', null, undefined, NaN]) {
      if (readTrophy({ trophy: { monster: 'slime', stage: bad } }) !== null) {
        say('T10', `readTrophy accepted stage ${String(bad)} — an out-of-range or non-integer stage must refuse the whole gesture`);
      }
    }
  }

  /* T11 — THE VERB'S REGISTRY ROW. `collectsFirst:false` is derived (the verb
     builds no delta, so there is no key that could stamp `accrued_to`), and the
     bucket must be one that already exists in hr_rate_gate's frozen `case` —
     a row naming an unknown bucket is a verb that 429s forever. */
  {
    const row = INTENT_REGISTRY.trophy_claim;
    if (!row) {
      say('T11', 'trophy_claim has no INTENT_REGISTRY row — the verb cannot be rate-gated and fails closed');
    } else {
      if (row.needsKey !== true) say('T11', 'trophy_claim does not require an idempotency key — a double-click would be a second claim attempt');
      if (row.collectsFirst !== false) say('T11', 'trophy_claim is marked collectsFirst — it proposes no delta, so collecting first costs a round trip and buys nothing');
      const buckets = new Set(Object.values(INTENT_REGISTRY).map((r) => r.bucket));
      if (!buckets.has(row.bucket)) say('T11', `trophy_claim names bucket "${row.bucket}", which no other verb uses — hr_rate_gate's case is frozen and an unknown bucket fails closed`);
    }
  }

  return f;
}

// ── The pure arm's mutations ─────────────────────────────────────────────
// Each plants ONE defect in the injectable world (or in a number the module
// reads) and names the assertion that must report it.
const PURE_MUTATIONS = [
  ['T1', 'the top rung is re-priced in the data table',
    (w) => { w.stages[w.stages.length - 1].drop = 1.99; }],
  ['T2', 'stage 1 starts paying a drop bonus',
    (w) => { w.stages[0].drop = 1.02; }],
  ['T3', 'the memory ceiling is lowered under the shipped product',
    (w) => { w.maxMemory = 1.00; }],
  ['T7', 'a monster id is authored too long for the key',
    (w) => { w.roster['x'.repeat(70)] = { ...w.roster.slime }; }],
  ['T8', 'the SQL ladder drifts from the data ladder',
    (w) => { w.sqlThresholds = [2500, 5000, 10000, 99999]; }],
  ['T9', 'the wire bound falls behind the ladder',
    (w) => { w.wireMax = 3; }],
];

/* NEGATIVE CONTROLS — changes that must stay SILENT. A guard that goes red on
   a display rename is a guard people learn to edit around. */
const PURE_NEGATIVE = [
  ['a stage display name is rewritten', (w) => { w.stages[0].id = w.stages[0].id; }],
  ['a monster is added to the roster', (w) => { w.roster.new_beast = { ...w.roster.slime, name: 'New Beast' }; }],
];

function mutantPureWorld(plant, base) {
  const w = base || realPureWorld();
  plant(w);
  return w;
}

// ════════════════════════════════════════════════════════════════════════
// THE SQL ARM — a real PostgreSQL, the real chain, the real RPC.
// ════════════════════════════════════════════════════════════════════════

const PROBE = '00000000-0000-4000-c000-770f180a3333';
const OTHER = '00000000-0000-4000-c000-770f180a4444';

/** One statement, rows out. `db.query` is pglite's parameterised path. */
async function q(db, sql, params = []) {
  const r = await db.query(sql, params);
  return r.rows || [];
}

/**
 * Drive the real RPC against a probe character and return the findings.
 *
 * ⚠ EVERY ROW THIS TOUCHES IS ONE IT CREATED, under two uuids nothing else
 *   holds — the same rule the migrations' self-checks follow, for the same
 *   reason (tests/selfcheck-no-global-dml.mjs, the 2026-09-19 incident). It
 *   runs against a throwaway in-process database either way, but a harness that
 *   learned a different habit is a harness somebody copies.
 */
async function auditSql(db) {
  const f = [];
  const say = (id, msg) => f.push({ id, msg });
  const [{ activity_id: mon }] = await q(db,
    `select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 1`);
  const first = TROPHY_STAGES[0].at;

  await q(db, `select set_config('request.jwt.claim.sub', $1, false)`, [PROBE]);
  await q(db, `insert into auth.users (id) values ($1) on conflict (id) do nothing`, [PROBE]);
  await q(db, `select public.hr_create_character(0)`);

  const claim = async (user, monster, stage, idem) => {
    const rows = await q(db,
      `select public.hr_trophy_claim($1::uuid, 0, $2::text, $3::int, $4::text) as res`,
      [user, monster, stage, idem]);
    return rows[0].res;
  };
  const uuid = () => crypto.randomUUID();
  const counts = async (user) => {
    const [p] = await q(db,
      `select count(*)::int as n from public.player_progress
        where user_id = $1 and kind = 'collection' and key like 'trophy:%'`, [user]);
    const [l] = await q(db,
      `select count(*)::int as n from public.player_ledger
        where user_id = $1 and intent = 'trophy_claim'`, [user]);
    return { progress: p.n, ledger: l.n };
  };

  /* S1 — AN UNKNOWN MONSTER IS REFUSED, NEVER INSERTED. Inventing a monster
     from a client string is how a capability becomes forgeable from a stale
     save (design §4.2(2)). */
  {
    const r = await claim(PROBE, 'not_a_monster_at_all', 1, uuid());
    if (r?.ok !== false || r?.error !== 'unknown_monster') {
      say('S1', `an unknown monster was answered ${verdict(r)}, expected unknown_monster`);
    }
    if ((await counts(PROBE)).progress !== 0) say('S1', 'an unknown monster still wrote a trophy row');
  }

  /* S2 — BELOW THE THRESHOLD IS `not_yet`, AND NOTHING IS WRITTEN. One kill
     short, so the refusal is about the ladder and not about an empty counter. */
  await q(db,
    `insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
     values ($1, 0, 'stat', 'ev:kill_monster:' || $2, '', $3, 'active')
     on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value`,
    [PROBE, mon, first - 1]);
  {
    const r = await claim(PROBE, mon, 1, uuid());
    if (r?.ok !== false || r?.error !== 'not_yet') {
      /* `verdict`, not the whole answer: a successful claim returns the entire
         hr_state_of envelope, and a finding that printed it would bury the one
         fact the reader needs under a character sheet. */
      say('S2', `a claim at ${first - 1} kills was answered ${verdict(r)}, expected not_yet`);
    }
    /* THE REFUSAL STATES THE SERVER'S OWN COUNT, which is how a client whose
       idea of the number ran ahead reconciles instead of arguing (CLAUDE.md §6). */
    if (Number(r?.detail?.have) !== first - 1 || Number(r?.detail?.need) !== first) {
      say('S2', `the not_yet refusal did not state the server's count: ${JSON.stringify(r?.detail)}`);
    }
    const c = await counts(PROBE);
    if (c.progress !== 0 || c.ledger !== 0) {
      say('S2', `a refused claim wrote ${c.progress} progress row(s) and ${c.ledger} ledger row(s)`);
    }
  }

  /* S3 — A FORGED KILL COUNT CANNOT TRAVEL. The RPC's signature has five
     parameters and none of them is a count, so the executable statement of
     "ignored" is that the SAME refusal stands until the SERVER's own counter
     moves — and then the identical call succeeds. */
  {
    const [sig] = await q(db,
      `select pg_get_function_identity_arguments(p.oid) as args
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'hr_trophy_claim'`);
    if (/kill|count|value|qty|amount/i.test(String(sig?.args ?? ''))) {
      say('S3', `hr_trophy_claim's signature has grown a count-shaped parameter: ${sig.args} — a client number can now reach the claim decision`);
    }
    await q(db,
      `update public.player_progress set value = $3
        where user_id = $1 and slot = 0 and kind = 'stat' and period_key = ''
          and key = 'ev:kill_monster:' || $2`, [PROBE, mon, first]);
    const r = await claim(PROBE, mon, 1, '22222222-2222-4222-8222-222222222222');
    if (r?.ok !== true) {
      say('S3', `the claim at exactly ${first} kills was refused: ${verdict(r)}`);
    }
    if (Number(r?.claimed?.kills_at_claim) !== first) {
      say('S3', `the receipt reports kills_at_claim ${r?.claimed?.kills_at_claim}, but the server's counter reads ${first} — the receipt is not built from what was read`);
    }
  }

  /* S4 — EXACTLY ONE PROGRESS ROW AND EXACTLY ONE LEDGER ROW. The journal is
     append-only and a trophy is once-ever, so "one" is the whole contract. */
  {
    const c = await counts(PROBE);
    if (c.progress !== 1) say('S4', `a successful claim wrote ${c.progress} progress rows, expected 1`);
    if (c.ledger !== 1) say('S4', `a successful claim wrote ${c.ledger} ledger rows, expected 1`);
    const [row] = await q(db,
      `select key, value, state from public.player_progress
        where user_id = $1 and kind = 'collection' and key like 'trophy:%'`, [PROBE]);
    if (row?.key !== trophyKey(mon, 1) || Number(row?.value) !== 1 || row?.state !== 'claimed') {
      say('S4', `the trophy row is ${JSON.stringify(row)}, expected key ${trophyKey(mon, 1)} value 1 state claimed`);
    }
    /* THE MULTIPLIER IS NOT STORED. Design §4.1: a stored stage (or rate) is a
       second copy of a derivable fact and a thing that can disagree. */
    const [led] = await q(db,
      `select meta, gold, xp, qty from public.player_ledger
        where user_id = $1 and intent = 'trophy_claim'`, [PROBE]);
    for (const k of ['drop', 'mult', 'multiplier', 'bonus', 'rate']) {
      if (JSON.stringify(led?.meta ?? {}).toLowerCase().includes(k)) {
        say('S4', `the ledger meta stores "${k}" — the multiplier is supposed to be derived on every read, never stored`);
      }
    }
    if (Number(led?.gold) !== 0 || Number(led?.xp) !== 0 || Number(led?.qty) !== 0) {
      say('S4', `the trophy journal moved value: gold ${led?.gold}, xp ${led?.xp}, qty ${led?.qty} — a claim mints nothing`);
    }
  }

  /* S5 — A SECOND CLAIM IS REFUSED, AND IT DOES NOT JOURNAL. Two shapes, kept
     apart on purpose: a NEW key naming a held trophy is `already_owned`; a
     REPLAY of the same key is `replayed`, because a double-click is not an
     error. Both must leave the ledger at one row. */
  {
    const again = await claim(PROBE, mon, 1, uuid());
    if (again?.ok !== false || again?.error !== 'already_owned') {
      say('S5', `a second claim was answered ${verdict(again)}, expected already_owned`);
    }
    const replay = await claim(PROBE, mon, 1, '22222222-2222-4222-8222-222222222222');
    if (replay?.ok !== true || replay?.replayed !== true) {
      say('S5', `a replay of the ORIGINAL key was answered ${JSON.stringify({ ok: replay?.ok, error: replay?.error })}, expected ok with replayed:true`);
    }
    const c = await counts(PROBE);
    if (c.progress !== 1 || c.ledger !== 1) {
      say('S5', `after a second claim and a replay the character holds ${c.progress} trophy row(s) and ${c.ledger} ledger row(s), expected 1 and 1`);
    }
  }

  /* S6 — THE PROJECTION IS PARSED AND SCOPED. It must read the key back to
     (monster, stage), exclude a non-trophy collection row, and show a second
     character nothing — a trophy is not a public fact about somebody else. */
  {
    await q(db,
      `insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
       values ($1, 0, 'collection', 'hunter10', '', 1, 'claimed')
       on conflict (user_id, slot, kind, key, period_key) do nothing`, [PROBE]);
    const rows = await q(db, `select monster_id, stage from public.hr_trophy_of($1::uuid, 0)`, [PROBE]);
    if (rows.length !== 1 || rows[0].monster_id !== mon || Number(rows[0].stage) !== 1) {
      say('S6', `hr_trophy_of returned ${JSON.stringify(rows)}, expected exactly [{${mon}, 1}] — a decoy collection row leaked, or the key did not parse`);
    }
    await q(db, `select set_config('request.jwt.claim.sub', $1, false)`, [OTHER]);
    await q(db, `insert into auth.users (id) values ($1) on conflict (id) do nothing`, [OTHER]);
    await q(db, `select public.hr_create_character(0)`);
    const theirs = await q(db, `select 1 from public.hr_trophy_of($1::uuid, 0)`, [OTHER]);
    if (theirs.length !== 0) {
      say('S6', `a second character read ${theirs.length} trophies that are not theirs`);
    }
    const r = await claim(OTHER, mon, 1, uuid());
    if (r?.ok !== false || r?.error !== 'not_yet') {
      say('S6', `a second character's claim was answered ${verdict(r)} — it read the FIRST character's counter`);
    }
  }

  /* S7 — THE GRANTS. hr_engine only, and ABSENT from the client RPC baseline:
     registering an engine-only function on the approved client surface would
     declare a grant nobody granted, and the next "restore the baseline" would
     grant it (design §4.2(1)). */
  {
    for (const fn of ['public.hr_trophy_claim(uuid,integer,text,integer,text)',
      'public.hr_trophy_of(uuid,integer)']) {
      for (const role of ['authenticated', 'anon', 'service_role']) {
        const [{ ok }] = await q(db, `select has_function_privilege($1, $2, 'execute') as ok`, [role, fn]);
        if (ok) say('S7', `${role} can execute ${fn} — a second, unfiltered path over every character's trophies`);
      }
      const [{ ok }] = await q(db, `select has_function_privilege('hr_engine', $1, 'execute') as ok`, [fn]);
      if (!ok) say('S7', `hr_engine cannot execute ${fn} — the feature is dead`);
    }
    const [{ n }] = await q(db,
      `select count(*)::int as n from public.hr_client_rpc_baseline
        where proname in ('hr_trophy_claim','hr_trophy_of')`);
    if (n > 0) say('S7', `${n} trophy RPC(s) are registered in hr_client_rpc_baseline — these are engine-only`);
  }

  /* S8 — THE ENVELOPE NO LONGER CARRIES THE TROPHY POPULATION. The
     prerequisite, measured on a character that actually holds one: 108 kill rows
     + up to 432 trophies + the collection log breach hr_state_of's LIMIT 1000,
     and the failure is silent truncation of whatever sorts last (design §6). */
  {
    const [{ state }] = await q(db, `select public.hr_state_of($1::uuid, 0) as state`, [PROBE]);
    const keys = (state?.progress || []).map((r) => r.key);
    if (keys.some((k) => String(k).startsWith('trophy:'))) {
      say('S8', 'a trophy row is still inside hr_state_of\'s generic envelope — the 1000-row cap is unprotected');
    }
    if (!keys.includes('hunter10')) {
      say('S8', 'the collection-log milestone row was excluded too — the exclusion is keying on kind, not on the trophy prefix');
    }
  }

  return f;
}

// ── The SQL arm's mutations ──────────────────────────────────────────────
// Each patches the migration UNDER TEST and names the assertion that must go
// red. A self-check can only prove its own file correct as written; only a
// mutation proves its guards bite.
const SQL_MUTATIONS = [
  ['S2', 'the kill threshold check is removed from hr_trophy_claim',
    ['    if v_kills < v_need then', '    if false then']],
  ['S5', 'the once-guard stops refusing a second claim',
    ['    if v_rows = 0 then\n      perform public.hr_reject(\'already_owned\'',
      '    if false then\n      perform public.hr_reject(\'already_owned\'']],
  ['S1', 'the server-side monster catalogue check is removed',
    ['  if not exists (select 1 from public.hr_activities\n                  where kind = \'combat\' and activity_id = p_monster) then',
      '  if false then']],
  ['S7', 'the claim RPC is granted to authenticated',
    ['grant  execute on function public.hr_trophy_claim(uuid, int, text, int, text) to hr_engine;',
      'grant  execute on function public.hr_trophy_claim(uuid, int, text, int, text) to hr_engine;\ngrant execute on function public.hr_trophy_claim(uuid, int, text, int, text) to authenticated;']],
];

/* ⚠ EVERY SQL MUTATION ALSO DEFEATS THE MIGRATION'S OWN §5 SELF-CHECK, which
   runs inside the same apply and would abort the file before this guard could
   drive it. So the self-check block is removed ALONGSIDE each planted defect —
   the whole `do $mig$ … end $mig$;` that begins with the §5 marker. That is not
   a weakening: §5's job is to stop a broken file from applying to production,
   and this arm's job is to prove the FUNCTION's guards bite, which needs the
   broken file to install. The two are checked in opposite directions and
   tests/schema-drift.mjs runs the unpatched file with its self-check intact on
   every replay. */
async function selfcheckStripPatch() {
  const src = (await readFile(CLAIM_SQL_FILE, 'utf8')).replace(/\r\n/g, '\n');
  const start = src.indexOf('-- ── 5. SELF-CHECK');
  if (start < 0) { const e = new Error('the §5 self-check marker moved in ' + CLAIM_SQL_FILE); e.harness = true; throw e; }
  const block = src.slice(start);
  if (!block.trimEnd().endsWith('end $mig$;')) {
    const e = new Error('the §5 self-check block does not end where this harness expects'); e.harness = true; throw e;
  }
  return [block, '-- §5 removed by tests/bestiary-trophy.mjs --selftest\n'];
}

async function bootAndAudit(extraPatch) {
  const { bootReplay } = await import('./schema-replay.mjs');
  const patchList = [];
  if (extraPatch) {
    patchList.push(await selfcheckStripPatch());
    patchList.push(extraPatch);
  }
  const { db, failures } = await bootReplay(
    patchList.length ? { patches: new Map([[CLAIM_FILE, patchList]]) } : {});
  if (failures && failures.length) {
    const e = new Error(`the chain did not replay: ${failures[0].file}: ${failures[0].error}`);
    e.harness = !extraPatch;   // a PATCHED chain failing to apply is a bad mutation, not a finding
    throw e;
  }
  try { return await auditSql(db); } finally { await db.close?.(); }
}

// ════════════════════════════════════════════════════════════════════════

async function selftest() {
  console.log('── the pure arm ──────────────────────────────────────────────');
  const cleanPure = auditPure(await withSqlThresholds(realPureWorld()));
  if (cleanPure.length) {
    console.error('SELFTEST HARNESS: the CLEAN pure arm is already red, so a caught defect cannot be told from a broken guard.');
    for (const x of cleanPure) console.error(`  ${x.id}  ${x.msg}`);
    process.exit(2);
  }
  console.log('clean arm green (the floor) — planting defects');
  let bad = 0;
  for (const [id, what, plant] of PURE_MUTATIONS) {
    const found = auditPure(mutantPureWorld(plant, await withSqlThresholds(realPureWorld())));
    const byName = found.filter((x) => x.id === id);
    if (!byName.length) {
      console.error(`  ✗ ${id}  ${what} — NOT caught by ${id}`
        + (found.length ? ` (only ${[...new Set(found.map((x) => x.id))].join(',')} fired)` : ' (nothing fired)'));
      bad++;
    } else {
      console.log(`  ✓ ${id}  ${what} — caught: ${byName[0].msg}`);
    }
  }
  for (const [what, plant] of PURE_NEGATIVE) {
    const found = auditPure(mutantPureWorld(plant, await withSqlThresholds(realPureWorld())));
    if (found.length) {
      console.error(`  ✗ NEGATIVE CONTROL "${what}" went red: ${found.map((x) => x.id + ' ' + x.msg).join(' | ')}`);
      bad++;
    } else {
      console.log(`  ✓ NEGATIVE CONTROL "${what}" stayed silent`);
    }
  }

  if (!process.argv.includes('--pure')) {
    console.log('\n── the SQL arm (a real PostgreSQL per mutation) ───────────────');
    const cleanSql = await bootAndAudit(null);
    if (cleanSql.length) {
      console.error('SELFTEST HARNESS: the CLEAN SQL arm is already red.');
      for (const x of cleanSql) console.error(`  ${x.id}  ${x.msg}`);
      process.exit(2);
    }
    console.log('clean SQL arm green (the floor) — planting defects');
    for (const [id, what, patch] of SQL_MUTATIONS) {
      let found;
      try { found = await bootAndAudit(patch); }
      catch (e) {
        if (e.harness) throw e;
        console.log(`  ✓ ${id}  ${what} — caught: the patched chain refused to apply (${e.message})`);
        continue;
      }
      const byName = found.filter((x) => x.id === id);
      if (!byName.length) {
        console.error(`  ✗ ${id}  ${what} — NOT caught by ${id}`
          + (found.length ? ` (only ${[...new Set(found.map((x) => x.id))].join(',')} fired)` : ' (nothing fired)'));
        bad++;
      } else {
        console.log(`  ✓ ${id}  ${what} — caught: ${byName[0].msg}`);
      }
    }
  }

  if (bad) { console.error(`\n${bad} mutation(s) unproven.`); process.exit(1); }
  console.log('\nEvery mutation caught by its named assertion, every negative control silent — non-vacuous.');
  process.exit(0);
}

/** Read hr_trophy_claim's own ladder out of the migration, for T8. */
async function withSqlThresholds(w) {
  const src = await readFile(CLAIM_SQL_FILE, 'utf8');
  const m = src.match(/c_at\s+constant\s+bigint\[\]\s*:=\s*array\[([^\]]*)\]/);
  w.sqlThresholds = m ? m[1].split(',').map((s) => Number(s.trim())) : null;
  if (!w.sqlThresholds) {
    const e = new Error('hr_trophy_claim\'s `c_at` ladder could not be read out of ' + CLAIM_SQL_FILE
      + ' — T8 would pass vacuously');
    e.harness = true; throw e;
  }
  const wire = await readFile(join(ROOT, 'supabase', 'functions', 'hr-accrue', 'request.js'), 'utf8');
  const mw = wire.match(/MAX_TROPHY_STAGE_WIRE\s*=\s*(\d+)/);
  w.wireMax = mw ? Number(mw[1]) : -1;
  return w;
}

function report(pure, sql) {
  console.log(`bestiary trophies: ${Object.keys(MONSTERS).length} monsters x ${TROPHY_STAGES.length} stages`);
  for (const r of TROPHY_STAGES) {
    const idx = Object.create(null); idx.slime = r.stage;
    console.log(`  stage ${r.stage} ${r.id.padEnd(8)} at ${String(r.at).padStart(6)} kills`
      + `  derived drop x${trophyDropMultFor('slime', idx).toFixed(2)}`
      + `  derived dmg x${trophyDamageMultFor('slime', idx).toFixed(2)}`
      + (TROPHY_DAMAGE_ARM_ENABLED ? '' : ' (damage arm OFF)'));
  }
  const top = TROPHY_STAGES[TROPHY_STAGES.length - 1].drop;
  const topCharm = CHARM_RANKS[CHARM_RANKS.length - 1].drop;
  console.log(`  charm x${topCharm} x trophy x${top} = ${(topCharm * top).toFixed(4)}`
    + `, clamped to ${memoryDropMult(topCharm, top)} (ceiling ${MAX_MEMORY_DROP_MULT})`);
  console.log(`  pure findings ${pure.length}, sql findings ${sql === null ? 'skipped' : sql.length}`);
}

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) await selftest();

const pure = auditPure(await withSqlThresholds(realPureWorld()));
const sql = argv.includes('--pure') ? null : await bootAndAudit(null);
if (argv.includes('--report')) report(pure, sql);

const findings = [...pure, ...(sql || [])];
if (findings.length) {
  console.error('bestiary-trophy: RED');
  for (const x of findings) console.error(`  ${x.id}  ${x.msg}`);
  process.exit(1);
}
console.log(`bestiary-trophy: green — the ladder derives its own multipliers inside the stated`
  + ` ceilings, attended and away quote one number, and the claim refuses, journals once and mints`
  + ` nothing${sql === null ? ' (SQL arm skipped: --pure)' : ''}.`);
