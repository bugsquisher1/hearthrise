#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/goal-counters.mjs — THE DAILY/QUEST PROGRESS COUNTERS, END TO END.
//
// THE CLAIM UNDER TEST, in three lines:
//   · a seeded away COMBAT night advances 'slay N' counters by EXACTLY the
//     kill count — not approximately, not the tick count;
//   · a seeded away GATHER night advances its counter by exactly the YIELD
//     (tool doubles included), and touches no combat counter;
//   · a counter a night should not touch is ABSENT afterwards, which is the
//     only shape of "untouched" a database can prove.
//
// Everything runs for real: the REAL engine bytes (`computeAccrual` from
// supabase/functions/hr-accrue/accrual.js), the REAL simulation
// (src/core/combat-sim.js, src/core/skill-sim.js), and the REAL `hr_apply` on
// a real PostgreSQL (PGlite/WASM, in process) with THE WHOLE MIGRATION CHAIN
// applied verbatim through tests/schema-replay.mjs — so every migration's own
// self-verifying block EXECUTES on every run of this guard.
//
//     computeAccrual (real engine, real monster, real drop table)
//       → progress ops  {kind:'daily', key:'ev:kill_any', period:'<day>'}
//                       {kind:'stat',  key:'ev:kill_any', period:''}
//       → public.hr_apply  (those ops VERBATIM — not a copy of them)
//       → public.player_progress   (real table, real guard trigger)
//       → public.hr_state_of       (the envelope the client will read)
//
// ── WHY "UNTOUCHED" NEEDS ITS OWN BLOCK ─────────────────────────────────
// A counter model is trivially satisfiable by a bug that increments
// everything. G5 is the control: the combat night must produce NO gather op
// and NO gather row, and the gather night must produce no kill row. Without
// it every other assertion here would pass against a handler that counted
// every event under every key.
//
// ── MUTATION ────────────────────────────────────────────────────────────
//   node tests/goal-counters.mjs --mutate
// plants nine real defects one at a time — six in the ACCRUAL ENGINE (a copy
// of accrual.js with a handler removed, a seam crossed, or the day anchor
// moved) and three in src/core/goals.js — and FAILS if any slips past.
//
// Run standalone:  node tests/goal-counters.mjs
// Also invoked as a guard by tests/run-smoke.mjs.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

import { bootReplay, ROOT } from './schema-replay.mjs';
import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';
import {
  GOAL_EVENTS, UNCOUNTED_EVENTS, GOAL_KEY_PREFIX, MAX_GOAL_ADD,
  goalKey, utcDayKey, makeGoalCounter, goalProgressOps,
} from '../src/core/goals.js';
import { MONSTERS } from '../src/data/monsters.js';
import { ITEMS } from '../src/data/items.js';
import { TREES, ROCKS, FISH_SPOTS } from '../src/data/gathering.js';
import { indexGatherNodes } from '../src/core/skill-sim.js';
import { MIN_ACTION_MS } from '../src/core/pacing.js';
import { xpForLevel } from '../src/core/xp.js';

const USER = '00000000-0000-4000-c000-9081a1c00000';
const SEED = 0x9021;

/* The engine entry point, as a REBINDABLE reference. The M1-M6 arms swap it
   for a copy of accrual.js with a real defect planted; a JS mutant needs the
   same treatment the SQL arms get from bootReplay's patches. */
let computeAccrualFn = computeAccrual;
/* src/core/goals.js, likewise — M7-M9 plant defects in the contract module
   itself, and the engine mutants must then load THAT copy, so both are
   rebound through one loader. */
let goalsMod = { GOAL_EVENTS, UNCOUNTED_EVENTS, MAX_GOAL_ADD, utcDayKey, makeGoalCounter, goalProgressOps };

let problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

const GATHER_INDEX = indexGatherNodes({ woodcutting: TREES, mining: ROCKS, fishing: FISH_SPOTS });

/* THE FIXTURES, DERIVED — never named. A fixture chosen by literal is a
   fixture that goes vacuous the day the content is renamed, and the monster/
   item id renames are ON the roadmap. */
const MONSTER = Object.keys(MONSTERS)
  .filter((id) => MONSTERS[id] && MONSTERS[id].hp > 0)
  .sort((a, b) => (MONSTERS[a].hp || 0) - (MONSTERS[b].hp || 0))[0];

/* A gathering node with the LOWEST requirement, so the level gate never fires
   and the span is time-bounded rather than refused at tick 0. */
const NODE = Object.keys(GATHER_INDEX)
  .filter((id) => GATHER_INDEX[id].skill === 'woodcutting')
  .sort((a, b) => (GATHER_INDEX[a].node.req || 0) - (GATHER_INDEX[b].node.req || 0))[0];

/* The best woodcutting tool in the data — its `toolDouble` is what makes the
   gather YIELD exceed the ACTION COUNT, which is the only thing that can tell
   `updateDaily('gather', qty)` apart from `updateDaily('gather', 1)`. M9
   plants exactly that defect. */
const TOOL = Object.keys(ITEMS)
  .filter((id) => ITEMS[id] && ITEMS[id].type === 'tool' && ITEMS[id].toolSkill === 'woodcutting')
  .sort((a, b) => (ITEMS[b].toolTier || 0) - (ITEMS[a].toolTier || 0))[0] || null;

const HOUR = 3600000;
/* A Sunday in the middle of a month, at 09:00 UTC, so a 2h window neither
   crosses midnight nor lands on a day whose key has a leading zero to lose.
   Day-key edges get their own sweep in G1. */
const NOW_MS = Date.UTC(2026, 7, 16, 9, 0, 0);

// ── the harness ───────────────────────────────────────────────────────────
async function boot(patches) {
  const { db } = await bootReplay(patches ? { patches } : {});
  await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [USER]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [USER]);
  const r = await db.query('select public.hr_create_character(0) as r');
  const c = r.rows[0].r;
  if (!(c?.ok === true || c?.created === true)) {
    throw new Error(`SETUP: hr_create_character failed — ${JSON.stringify(c)}`);
  }
  return db;
}

/** Apply a delta through the REAL hr_apply, at the current version. */
async function apply(db, delta) {
  const v = await db.query('select version from public.player_state where user_id=$1 and slot=0', [USER]);
  const r = await db.query(
    'select public.hr_apply($1::uuid, 0, $2::bigint, gen_random_uuid(), $3::text::jsonb) as r',
    [USER, v.rows[0].version, JSON.stringify(delta)]);
  return r.rows[0].r;
}

/** Every progress row for the character, as `${kind}|${key}|${period}` -> value. */
async function progressRows(db) {
  const r = await db.query(
    `select kind, key, period_key, value, state from public.player_progress
      where user_id=$1 and slot=0`, [USER]);
  const out = new Map();
  for (const row of r.rows) out.set(`${row.kind}|${row.key}|${row.period_key}`, row);
  return out;
}

const opsOf = (delta) => (delta && Array.isArray(delta.progress)) ? delta.progress : [];
const goalOps = (delta) => opsOf(delta).filter((o) => String(o.key || '').startsWith(GOAL_KEY_PREFIX));
const findOp = (delta, kind, type) =>
  opsOf(delta).find((o) => o.kind === kind && o.key === `${GOAL_KEY_PREFIX}${type}`) || null;

function combatNight(over) {
  return computeAccrualFn({
    userId: USER, slot: 0,
    nowMs: NOW_MS, accruedToMs: NOW_MS - 2 * HOUR, activeSinceMs: NOW_MS - 2 * HOUR,
    activeKind: 'combat', activeId: MONSTER,
    capMs: 12 * HOUR, seed: SEED,
    hp: 999, maxHp: 999, gold: 0,
    skills: { attack: xpForLevel(70), strength: xpForLevel(70), defence: xpForLevel(70),
              hitpoints: xpForLevel(70) },
    equipment: {}, inventory: {},
    autoEatEnabled: false, autoEatFood: null, autoEatPct: 0,
    items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX,
    ...over,
  });
}

function gatherNight(over) {
  return computeAccrualFn({
    userId: USER, slot: 0,
    nowMs: NOW_MS, accruedToMs: NOW_MS - 2 * HOUR, activeSinceMs: NOW_MS - 2 * HOUR,
    activeKind: 'gather', activeId: NODE,
    capMs: 12 * HOUR, seed: SEED,
    hp: 999, maxHp: 999, gold: 0,
    skills: { woodcutting: xpForLevel(70) },
    equipment: {}, inventory: TOOL ? { [TOOL]: 1 } : {},
    autoEatEnabled: false, autoEatFood: null, autoEatPct: 0,
    toolCarry: {},
    items: ITEMS, monsters: MONSTERS, nodes: GATHER_INDEX,
    ...over,
  });
}

// ════════════════════════════════════════════════════════════════════════
async function run(patches) {
  const db = await boot(patches);
  const G = goalsMod;

  // ── G0 · THE FIXTURES ARE REAL ────────────────────────────────────────
  // Everything below is derived from src/data; a derivation that came back
  // empty would make every later block pass vacuously.
  ok(!!MONSTER, 'G0: no monster in the catalogue — the combat night has no target');
  ok(!!NODE, 'G0: no woodcutting node in the gather index — the gather night has no target');
  ok(!!TOOL, 'G0: no woodcutting tool in ITEMS — the yield can never exceed the action count and '
    + 'M9 (amt ignored) would be undetectable');
  ok(G.GOAL_EVENTS.length >= 6,
    `G0: the vocabulary holds ${G.GOAL_EVENTS.length} events, expected at least 6`);
  ok(G.GOAL_EVENTS.every((t) => !G.UNCOUNTED_EVENTS.includes(t)),
    'G0: an event is BOTH counted and uncounted — the two lists must partition, or a type is '
    + 'classified twice and the guard below cannot say which decision applies');

  // ── G1 · THE DAY KEY IS THE DATABASE'S ────────────────────────────────
  // `to_char(…, 'FMYYYY-FMMM-FMDD')` strips leading zeros. A hand-written ISO
  // slice looks right, passes review, and files every away night under a
  // period key no other surface in this database has ever used. Swept across
  // the edges rather than sampled at one instant — one sample is not a verdict.
  {
    const sweep = [
      Date.UTC(2026, 0, 1, 0, 0, 0),      // single-digit month AND day
      Date.UTC(2026, 0, 1, 23, 59, 59),   // same day, other end
      Date.UTC(2026, 8, 9, 12, 0, 0),     // 9 September — both single digit
      Date.UTC(2026, 9, 10, 12, 0, 0),    // 10 October — both double digit
      Date.UTC(2024, 1, 29, 12, 0, 0),    // leap day
      Date.UTC(2026, 11, 31, 23, 0, 0),   // year end
      NOW_MS,
    ];
    for (const ms of sweep) {
      const r = await db.query(
        'select public.hr_utc_day_key(to_timestamp($1::double precision)) as k', [ms / 1000]);
      const sqlKey = r.rows[0].k;
      ok(G.utcDayKey(ms) === sqlKey,
        `G1: utcDayKey(${new Date(ms).toISOString()}) = ${JSON.stringify(G.utcDayKey(ms))} but `
        + `public.hr_utc_day_key returns ${JSON.stringify(sqlKey)}. A second day-key universe is `
        + 'invisible in every screenshot and wrong in every query.');
    }
    // The control: if the SQL function stopped answering, every line above
    // would be comparing two nulls and passing.
    const ctl = await db.query("select public.hr_utc_day_key(timestamptz '2026-08-16T00:00:00Z') as k");
    ok(ctl.rows[0].k === '2026-8-16',
      `G1 CONTROL: hr_utc_day_key returned ${JSON.stringify(ctl.rows[0].k)} for 2026-08-16 — `
      + 'expected the FM (unpadded) form 2026-8-16. If the SQL changed, this file moves with it.');
  }

  // ── G2 · THE VOCABULARY IS BOUND TO BOTH SIDES ────────────────────────
  // Derivation removes the second LIST; it does not remove the second SIDE
  // (b350). So: every EMIT site in core must be classified, and every AUTHORED
  // goal type must be countable. Each with a positive control, because a scan
  // that stopped matching would report a clean bill on a broken contract.
  {
    const coreFiles = ['combat-sim.js', 'skill-sim.js', 'artisan-sim.js', 'farm.js', 'bounty.js'];
    const emitted = new Set();
    let sites = 0;
    for (const f of coreFiles) {
      const src = await readFile(join(ROOT, 'src', 'core', f), 'utf8').catch(() => null);
      if (src === null) continue;
      for (const m of src.matchAll(/'update(?:Daily|Quest)'\s*,\s*'([a-z_]+)'/g)) {
        emitted.add(m[1]); sites++;
      }
    }
    ok(sites >= 4,
      `G2 CONTROL: only ${sites} updateDaily/updateQuest emit sites found in src/core — the scan is `
      + 'blind, and every classification check below would pass for free');
    for (const t of emitted) {
      ok(G.GOAL_EVENTS.includes(t) || G.UNCOUNTED_EVENTS.includes(t),
        `G2(a): src/core emits goal event '${t}' which is in NEITHER GOAL_EVENTS nor `
        + 'UNCOUNTED_EVENTS. A new emit site must be classified: counted (a key shape exists for '
        + 'it) or uncounted (with a reason). Being in neither is a counter that silently never '
        + 'moves. See src/core/goals.js.');
    }

    // The authored side: legacy.js's QUEST_DEFS + DAILY_TASK_POOL.
    const legacy = await readFile(join(ROOT, 'src', 'legacy.js'), 'utf8');
    const block = (name) => {
      const at = legacy.indexOf(`const ${name}=`);
      if (at < 0) return null;
      const open = legacy.indexOf('[', at);
      let depth = 0;
      for (let i = open; i < legacy.length; i++) {
        if (legacy[i] === '[') depth++;
        else if (legacy[i] === ']' && --depth === 0) return legacy.slice(open, i + 1);
      }
      return null;
    };
    for (const name of ['QUEST_DEFS', 'DAILY_TASK_POOL']) {
      const body = block(name);
      ok(!!body, `G2 CONTROL: ${name} could not be located in src/legacy.js by balanced-bracket `
        + 'scan. The authored side of the contract is unreadable, so (b) proves nothing. The '
        + 'declaration moved — find it and fix this anchor.');
      if (!body) continue;
      const types = [...body.matchAll(/\btype:\s*'([a-z_]+)'/g)].map((m) => m[1]);
      ok(types.length >= 4,
        `G2 CONTROL: ${name} yielded ${types.length} authored types, expected at least 4`);
      for (const t of types) {
        ok(G.GOAL_EVENTS.includes(t),
          `G2(b): ${name} authors a goal of type '${t}', which is NOT in GOAL_EVENTS — the server `
          + 'can never mint a counter for it, so that goal would sit at 0 forever on an away '
          + 'night. Add it to src/core/goals.js (and check an emit site exists).');
      }
      // No authored goal may be target-scoped: the counter key carries no
      // target, so a targeted goal would read a number that counts every foe.
      ok(!/\btarget:\s*'/.test(body),
        `G2(c): ${name} now authors a goal with a \`target:\` — the counter key shape is 'ev:<type>' `
        + 'and carries no target, so that goal would read a count of EVERY kill. This is the '
        + 'decision UNCOUNTED_EVENTS records for kill_monster, and it is now re-opened by name. '
        + 'Extend the key shape before shipping the goal.');
    }
    // The negative control: a sentinel that appears in no file must not match.
    ok(!legacy.includes('hr353_negative_control_this_type_is_not_authored'),
      'G2 NEGATIVE CONTROL: a sentinel that appears in no file matched — the scan matches '
      + 'everything and cannot see a failure');
  }

  // ── G3 · A COMBAT NIGHT ADVANCES 'SLAY N' BY EXACTLY THE KILL COUNT ───
  let combat;
  {
    combat = combatNight();
    ok(combat.accrued === true, `G3: the combat night accrued nothing (reason: ${combat.reason})`);
    if (!combat.accrued) { return; }
    const kills = combat.summary.kills;
    ok(kills > 0, `G3: the fixture killed ${kills} monsters — a night with no kills cannot show `
      + 'a counter moving, so every assertion here would be vacuous');

    const day = G.utcDayKey(NOW_MS);
    const daily = findOp(combat.delta, 'daily', 'kill_any');
    const life = findOp(combat.delta, 'stat', 'kill_any');
    ok(!!daily, "G3: no {kind:'daily', key:'ev:kill_any'} op in the delta — the away night pays XP "
      + "and items and leaves 'Slay N monsters' at 0/N. That is Designer Ruling 3.1 verbatim.");
    ok(!!life, "G3: no {kind:'stat', key:'ev:kill_any'} op — the quest counter never moves");
    if (daily) {
      ok(daily.add === kills,
        `G3: the daily counter advanced by ${daily.add} for ${kills} kills — a counter that is not `
        + 'the kill count is a counter the player can prove wrong');
      ok(daily.period === day,
        `G3: the daily op is filed under period ${JSON.stringify(daily.period)}, expected the `
        + `RETURN day ${JSON.stringify(day)}`);
      ok(daily.state === 'active',
        `G3: the daily op carries state=${JSON.stringify(daily.state)}. Every progress op this `
        + "engine emits names a settable state ('active'|'done') — tests/accrual-engine.mjs' SHAPE "
        + "block asserts it, and `stat:kills` three lines away carries 'active'. The one value "
        + "that must never appear is 'claimed': it gates a payout (review S13).");
    }
    if (life) {
      ok(life.add === kills, `G3: the lifetime counter advanced by ${life.add}, expected ${kills}`);
      ok(life.period === '', 'G3: the lifetime counter is period-keyed — it would then be PRUNED '
        + 'after 31 days and every quest built on it would silently reset');
      ok(life.kind === 'stat',
        `G3: the lifetime counter is kind='${life.kind}'. It must be 'stat': kind='quest' is the `
        + 'claim path\'s key space (key=<quest_id>, state=active|done|claimed) and an additive '
        + 'engine writing there would collide with the one transition that gates a payout.');
    }
    // THE REDUNDANCY IS THE DRIFT GUARD. `stat:kills` (the Hero screen) and
    // `stat:ev:kill_any` (the goal event) are written by two different lines
    // from two different sources; if they ever disagree, one of them is wrong.
    const kStat = opsOf(combat.delta).find((o) => o.kind === 'stat' && o.key === 'kills');
    ok(!!kStat && !!life && kStat.add === life.add,
      `G3: stat:kills = ${kStat?.add} but stat:ev:kill_any = ${life?.add}. They count the same `
      + 'event from the same span through two independent paths and must agree.');
  }

  // ── G4 · A GATHER NIGHT ADVANCES ITS COUNTER BY THE YIELD ─────────────
  let gather;
  {
    gather = gatherNight();
    ok(gather.accrued === true, `G4: the gather night accrued nothing (reason: ${gather.reason})`);
    if (!gather.accrued) { return; }
    const qty = gather.summary.gathered;
    ok(qty > 0, `G4: the fixture gathered ${qty} — vacuous`);
    ok(qty > gather.summary.ticks,
      `G4 CONTROL: the fixture yielded ${qty} from ${gather.summary.ticks} actions — with no tool `
      + 'double the yield equals the action count, and a handler that passed 1 instead of `amt` '
      + 'would be indistinguishable from a correct one. Pick a tool with a double rate.');

    const daily = findOp(gather.delta, 'daily', 'gather');
    const life = findOp(gather.delta, 'stat', 'gather');
    ok(!!daily, "G4: no {kind:'daily', key:'ev:gather'} op — a gathering night makes no progress "
      + "on 'Gather 50 resources'");
    ok(!!life, "G4: no {kind:'stat', key:'ev:gather'} op — the gather QUEST counter never moves");
    ok(!daily || daily.add === qty,
      `G4: the daily gather counter advanced by ${daily?.add} for a yield of ${qty}. The seam is `
      + '`updateDaily(\'gather\', res.qty)` — the AMOUNT is the yield, not 1, so a tool double '
      + 'moves the counter by 2 exactly as it does live.');
    ok(!life || life.add === qty, `G4: the lifetime gather counter advanced by ${life?.add}, expected ${qty}`);
    const gStat = opsOf(gather.delta).find((o) => o.kind === 'stat' && o.key === 'gathered');
    ok(!!gStat && !!life && gStat.add === life.add,
      `G4: stat:gathered = ${gStat?.add} but stat:ev:gather = ${life?.add} — two paths counting `
      + 'one span must agree');
  }

  // ── G5 · THE CONTROL — A NIGHT TOUCHES NOTHING IT SHOULD NOT ──────────
  // Without this block, a handler that counted every event under every key
  // would pass G3 and G4 outright.
  {
    const cKeys = goalOps(combat.delta).map((o) => o.key).sort();
    const gKeys = goalOps(gather.delta).map((o) => o.key).sort();
    ok(cKeys.every((k) => k === goalKey('kill_any')),
      `G5: the COMBAT night proposed goal ops ${JSON.stringify(cKeys)} — it may move 'kill_any' `
      + 'and nothing else. A counter a night should not touch must stay untouched.');
    ok(gKeys.every((k) => k === goalKey('gather')),
      `G5: the GATHER night proposed goal ops ${JSON.stringify(gKeys)} — it may move 'gather' and `
      + 'nothing else.');
    ok(!findOp(combat.delta, 'daily', 'gather') && !findOp(combat.delta, 'stat', 'gather'),
      "G5: the combat night moved a 'gather' counter");
    ok(!findOp(gather.delta, 'daily', 'kill_any') && !findOp(gather.delta, 'stat', 'kill_any'),
      "G5: the gather night moved a 'kill_any' counter");
    // And the uncounted event stays uncounted. resolveKill emits
    // `updateQuest('kill_monster', …)` on every kill; a handler that counted
    // it would mint a key with no authored consumer.
    for (const t of G.UNCOUNTED_EVENTS) {
      ok(!goalOps(combat.delta).some((o) => o.key === goalKey(t)),
        `G5: the combat night minted a counter for '${t}', which UNCOUNTED_EVENTS declares must `
        + 'not be counted (it is target-scoped and no authored goal consumes it)');
    }
  }

  // ── G6 · hr_apply ACCEPTS THE OPS, VERBATIM ───────────────────────────
  // Not a copy of them, and not a hand-built delta: the engine's own array.
  // The whole model rests on 'daily' and 'stat' already being in hr_apply's
  // six-kind allowlist, which is why this file needs no migration — and that
  // claim is only worth anything if it is executed.
  {
    const r = await apply(db, {
      progress: opsOf(combat.delta),
      journal: { kind: 'combat', intent: 'goal:test:combat' },
    });
    ok(r?.ok === true,
      `G6: hr_apply REFUSED the engine's own progress array — ${JSON.stringify(r)}. Every counter `
      + 'op must be legal against the live allowlist, or an away night 409s (or, on a clamp, '
      + 'halves its span and pays half the gold) to move a number.');

    const rows = await progressRows(db);
    const day = G.utcDayKey(NOW_MS);
    const dRow = rows.get(`daily|${goalKey('kill_any')}|${day}`);
    const lRow = rows.get(`stat|${goalKey('kill_any')}|`);
    ok(!!dRow, `G6: no daily row landed for ${goalKey('kill_any')} on ${day}`);
    ok(!!lRow, `G6: no lifetime row landed for ${goalKey('kill_any')}`);
    ok(!dRow || Number(dRow.value) === combat.summary.kills,
      `G6: the stored daily value is ${dRow?.value}, expected ${combat.summary.kills}`);
    ok(!dRow || dRow.state === 'active',
      `G6: the stored daily row carries state=${JSON.stringify(dRow?.state)}, expected 'active'`);
    // The transition that gates a payout must be unreachable from a counter op,
    // whatever this file proposes. hr_apply is the protection, not goals.js.
    {
      const forged = await apply(db, {
        progress: [{ kind: 'daily', key: goalKey('kill_any'), period: day, add: 1, state: 'claimed' }],
        journal: { kind: 'combat', intent: 'goal:test:claimed' },
      });
      ok(forged?.ok !== true,
        `G6: hr_apply ACCEPTED state='claimed' from the generic progress block — ${JSON.stringify(forged)}. `
        + 'That is the one transition that gates a payout (review S13) and it has its own path.');
      ok(forged?.error === 'bad_progress_state',
        `G6: the claimed op was refused with ${JSON.stringify(forged?.error)}, expected `
        + 'bad_progress_state — a different refusal means the protection is accidental');
    }
    ok(!rows.has(`daily|${goalKey('gather')}|${day}`) && !rows.has(`stat|${goalKey('gather')}|`),
      'G6: a gather counter row exists after a COMBAT night — the control from G5, at the '
      + 'database rather than at the delta');

    // ADDITIVE: a second night ADDS, it does not replace. This is the merge
    // hr_apply performs and the reason 'stat'/'daily' are the right kinds.
    const again = combatNight({ accruedToMs: NOW_MS - 3 * HOUR, activeSinceMs: NOW_MS - 3 * HOUR });
    ok(again.accrued === true, 'G6: the second combat night accrued nothing');
    if (again.accrued) {
      const r2 = await apply(db, {
        progress: opsOf(again.delta),
        journal: { kind: 'combat', intent: 'goal:test:combat2' },
      });
      ok(r2?.ok === true, `G6: the second apply failed — ${JSON.stringify(r2)}`);
      const rows2 = await progressRows(db);
      const want = combat.summary.kills + again.summary.kills;
      ok(Number(rows2.get(`stat|${goalKey('kill_any')}|`)?.value) === want,
        `G6: two nights of ${combat.summary.kills} + ${again.summary.kills} kills left the `
        + `lifetime counter at ${rows2.get(`stat|${goalKey('kill_any')}|`)?.value}, expected ${want}. `
        + 'Both kinds merge `value = value + add`; anything else is a lost night.');
    }
  }

  // ── G7 · THE ROUND TRIP — hr_state_of CARRIES THEM ────────────────────
  // The client seam is DARK, but the server-side READ must work or the day it
  // lights up is the day the model is found to be write-only.
  {
    const r = await db.query('select public.hr_state_of($1::uuid, 0) as e', [USER]);
    const env = r.rows[0].e;
    ok(env?.ok === true, `G7: hr_state_of refused — ${JSON.stringify(env)}`);
    const prog = Array.isArray(env?.progress) ? env.progress : [];
    const day = G.utcDayKey(NOW_MS);
    const seen = (kind, key, period) =>
      prog.find((p) => p.kind === kind && p.key === key && p.period === period);
    ok(!!seen('daily', goalKey('kill_any'), day),
      `G7: the daily counter is NOT in hr_state_of's progress envelope. It was written and cannot `
      + 'be read, which is a counter that does not exist as far as any client is concerned.');
    ok(!!seen('stat', goalKey('kill_any'), ''),
      'G7: the lifetime counter is not in the progress envelope');
    ok(env.progress_truncated === false,
      'G7: progress_truncated is true on a character with a handful of rows — the LIMIT 1000 is '
      + 'being hit, and the daily population is period-keyed and therefore GROWS. Measure the '
      + 'population before widening anything.');
    // The permanent row passed hr_unlock_guard, which fires on period_key=''.
    // If it had refused, the apply in G6 would have failed — this states WHY
    // it did not, so the interaction is recorded rather than lucky.
    const t = await db.query(
      `select count(*)::int as n from pg_trigger where tgrelid='public.player_progress'::regclass
        and tgname='player_progress_unlock_guard' and not tgisinternal`);
    ok(t.rows[0].n === 1,
      'G7: hr_unlock_guard is not installed, so the permanent counter row passing it proves '
      + 'nothing about the interaction between this model and the artisan one');
  }

  // ── G8 · RETENTION — THE DAILY POPULATION IS SWEPT, THE LIFETIME IS NOT ─
  // player_progress has TWO populations and only one of them is bounded by
  // content. This model adds to the UNBOUNDED one, so its prune arm is not
  // optional — and hr_progress_prune already covers it, because it keys on
  // `period_key <> ''` rather than on a kind list.
  {
    const day = G.utcDayKey(NOW_MS);
    await db.query(
      `update public.player_progress set updated_at = now() - interval '90 days'
        where user_id=$1 and slot=0 and period_key <> ''`, [USER]);
    const n = await db.query('select public.hr_progress_prune() as n');
    ok(Number(n.rows[0].n) >= 1,
      `G8: hr_progress_prune deleted ${n.rows[0].n} rows — an aged daily counter must be swept, or `
      + 'the periodic population grows forever (600 players x 6 events x 365 days = 1.3M rows/yr)');
    const rows = await progressRows(db);
    ok(!rows.has(`daily|${goalKey('kill_any')}|${day}`),
      'G8: the aged daily counter survived the prune');
    ok(!!rows.get(`stat|${goalKey('kill_any')}|`),
      'G8: the prune deleted the LIFETIME counter. period_key=\'\' is the permanent population and '
      + 'must never be swept — every quest built on it would silently reset.');
    // The bound the read window has to hold, stated as a number.
    const bound = G.GOAL_EVENTS.length * 31;
    ok(bound <= 500,
      `G8: this model can add ${bound} rows inside hr_state_of's 31-day read window, against a `
      + 'LIMIT of 1000 shared with every other progress row. Adding an event type is cheap; '
      + 'adding thirty is not.');
  }

  // ── G9 · THE CLAMPS — A 12h NIGHT FITS, AND AN IMPOSSIBLE ONE IS CAPPED ─
  {
    // hr_apply's own numbers, read out of the migration rather than retyped —
    // a clamp this file believes in but the database does not is not a clamp.
    const src = await readFile(join(ROOT, 'supabase', 'migrations', '2026-08-11-apply-engine.sql'), 'utf8');
    const maxAdd = Number((src.match(/c_max_progress_add\s+constant\s+bigint\s*:=\s*(\d+)/) || [])[1]);
    const maxOps = Number((src.match(/c_max_progress_ops\s+constant\s+int\s*:=\s*(\d+)/) || [])[1]);
    ok(Number.isFinite(maxAdd) && Number.isFinite(maxOps),
      'G9 CONTROL: could not read c_max_progress_add/c_max_progress_ops out of apply-engine.sql — '
      + 'the anchor moved, and every bound below would be checked against NaN');
    ok(maxAdd === G.MAX_GOAL_ADD,
      `G9: src/core/goals.js clamps at ${G.MAX_GOAL_ADD} but hr_apply refuses above ${maxAdd}. The `
      + 'engine must respect the database\'s number, not its own.');

    // A 12h night at the absolute physical ceiling: 24h of ticks at the
    // MIN_ACTION_MS floor, doubled for a tool. Recomputed from the real
    // constants so the margin cannot rot.
    const physicalMax = (24 * HOUR / MIN_ACTION_MS) * 2;
    ok(maxAdd / physicalMax >= 2,
      `G9: the clamp headroom is ${(maxAdd / physicalMax).toFixed(2)}x (${maxAdd} against a `
      + `physical ceiling of ${physicalMax}). Under 2x an honest night starts clamping counters.`);

    // A REAL 12h night fits both clamps.
    const long = combatNight({ accruedToMs: NOW_MS - 12 * HOUR, activeSinceMs: NOW_MS - 12 * HOUR });
    ok(long.accrued === true, 'G9: the 12h night accrued nothing');
    if (long.accrued) {
      ok(opsOf(long.delta).length <= maxOps,
        `G9: a 12h night proposes ${opsOf(long.delta).length} progress ops against a ceiling of `
        + `${maxOps}. Over it, hr_apply answers too_many_progress_ops and the degrade ladder HALVES `
        + 'the span — half the gold and half the XP, to move a counter.');
      for (const o of opsOf(long.delta)) {
        ok(o.add <= maxAdd, `G9: a 12h night proposes add=${o.add} on ${o.key}, over ${maxAdd}`);
      }
    }

    // AND THE CLAMP ACTUALLY FIRES. Driven through the real builder with a
    // synthetic count, because no honest night can reach it — an unfireable
    // clamp is a comment.
    {
      const c = G.makeGoalCounter();
      c.daily('kill_any', maxAdd + 5000);
      const evs = [];
      const ops = G.goalProgressOps(c, NOW_MS, evs);
      ok(ops.length === 1 && ops[0].add === maxAdd,
        `G9: an over-limit count produced ${JSON.stringify(ops)} — it must be clamped to ${maxAdd}, `
        + 'not passed through (the whole span would be halved) and not dropped (the night would '
        + 'silently not count).');
      ok(evs.some((e) => e.type === 'goal_clamped'),
        'G9: the clamp left no receipt — a support request about a counter that stopped short is '
        + 'unanswerable');
    }
  }

  // ── G10 · THE DAY ANCHOR IS THE RETURN, NOT THE WINDOW ────────────────
  // The failure this closes is specifically "the player comes back and the
  // counter reads 0". Both window anchors reproduce it; only `nowMs` does not.
  {
    // A CAPPED absence: 40h away, 12h paid. Its credited window ENDED 28h ago.
    const capNow = Date.UTC(2026, 7, 20, 9, 0, 0);
    const capped = combatNight({
      nowMs: capNow, accruedToMs: capNow - 40 * HOUR, activeSinceMs: capNow - 40 * HOUR,
      capMs: 12 * HOUR,
    });
    ok(capped.accrued === true && capped.capped === true,
      `G10: the fixture is not capped (accrued=${capped.accrued}, capped=${capped.capped}) — the `
      + 'whole point of it is a window that ended days before the player returned');
    const op = findOp(capped.delta, 'daily', 'kill_any');
    ok(!!op && op.period === G.utcDayKey(capNow),
      `G10: a capped night filed its daily counter under ${JSON.stringify(op?.period)}; expected `
      + `the RETURN day ${JSON.stringify(G.utcDayKey(capNow))}. Anchoring to the credited window `
      + 'means a 40h absence credits a day the player can no longer see — "my night did not '
      + 'count", which is exactly Designer Ruling 3.1.');
    ok(!!op && op.period !== G.utcDayKey(capped.summary.windowTo),
      `G10 CONTROL: the fixture's window end (${G.utcDayKey(capped.summary.windowTo)}) is the same `
      + 'day as the return, so this block cannot tell the two anchors apart. Move the fixture.');

    // Two returns on different days write different period keys — one rule,
    // applied twice, and the lifetime counter is unaffected by either.
    const d1 = findOp(combat.delta, 'daily', 'kill_any');
    ok(d1.period !== op.period, 'G10: two nights returning on different UTC days share a period key');
  }

  // ── G11 · THE GATHER NIGHT ROUND-TRIPS TOO ────────────────────────────
  // The gather path is a separate delta builder in accrual.js. A model wired
  // into one of them and not the other is exactly the b350 "gather declaration
  // gap" in miniature, so it gets its own end-to-end pass rather than being
  // assumed to follow.
  {
    const r = await apply(db, {
      progress: opsOf(gather.delta),
      journal: { kind: 'gather', intent: 'goal:test:gather' },
    });
    ok(r?.ok === true, `G11: hr_apply refused the gather night's progress array — ${JSON.stringify(r)}`);
    const rows = await progressRows(db);
    ok(Number(rows.get(`stat|${goalKey('gather')}|`)?.value) === gather.summary.gathered,
      `G11: the gather lifetime counter reads ${rows.get(`stat|${goalKey('gather')}|`)?.value}, `
      + `expected ${gather.summary.gathered}`);
    ok(Number(rows.get(`daily|${goalKey('gather')}|${G.utcDayKey(NOW_MS)}`)?.value) === gather.summary.gathered,
      'G11: the gather daily counter did not land at the yield');
  }
}

// ════════════════════════════════════════════════════════════════════════
// MUTATION — every planted defect must turn the run RED.
// ════════════════════════════════════════════════════════════════════════
/* Each entry names a file and one text substitution. A mutation that does not
   apply cleanly THROWS rather than reporting GREEN: a mutant that was never
   planted proves nothing, and "the mutation escaped" is the wrong diagnosis
   for "the mutation never happened". */
const MUTATIONS = [
  { name: 'M1 combat: the updateDaily handler is removed (today\'s shipped behaviour)',
    file: 'accrual', from: "updateDaily(type, amt) { goals.daily(type, amt == null ? 1 : amt); },\n    updateQuest(type, amt /* , meta */) { goals.quest(type, amt == null ? 1 : amt); },\n\n    /* Still deliberately ABSENT, and each absence",
    to: "updateQuest(type, amt /* , meta */) { goals.quest(type, amt == null ? 1 : amt); },\n\n    /* Still deliberately ABSENT, and each absence" },
  { name: 'M2 combat: the updateQuest handler is removed',
    file: 'accrual', from: "updateQuest(type, amt /* , meta */) { goals.quest(type, amt == null ? 1 : amt); },\n\n    /* Still deliberately ABSENT, and each absence",
    to: "\n\n    /* Still deliberately ABSENT, and each absence" },
  { name: 'M3 combat: the goal ops never reach the delta',
    file: 'accrual', from: "  for (const op of goalProgressOps(goals, nowMs, events)) progress.push(op);\n\n  const delta = {\n    // A watermark",
    to: "\n  const delta = {\n    // A watermark" },
  { name: 'M4 gather: the goal ops never reach the delta',
    file: 'accrual', from: "  for (const op of goalProgressOps(goals, nowMs, events)) progress.push(op);\n\n  const delta = {\n    accrued_to:",
    to: "\n  const delta = {\n    accrued_to:" },
  { name: 'M5 gather: the yield is ignored and every action counts 1',
    file: 'accrual', from: "    updateDaily(type, amt) { goals.daily(type, amt == null ? 1 : amt); },\n    updateQuest(type, amt /* , meta */) { goals.quest(type, amt == null ? 1 : amt); },\n    /* Still deliberately ABSENT:",
    to: "    updateDaily(type) { goals.daily(type, 1); },\n    updateQuest(type) { goals.quest(type, 1); },\n    /* Still deliberately ABSENT:" },
  { name: 'M6 combat: the daily is anchored to the credited window, not the return',
    file: 'accrual', from: "  for (const op of goalProgressOps(goals, nowMs, events)) progress.push(op);\n\n  const delta = {\n    // A watermark",
    to: "  for (const op of goalProgressOps(goals, credit.fromMs, events)) progress.push(op);\n\n  const delta = {\n    // A watermark" },
  { name: 'M7 goals: the day key is zero-padded (the FM defect)',
    file: 'goals', from: "return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;",
    to: "return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;" },
  { name: "M8 goals: the lifetime counter is filed under kind='quest'",
    file: 'goals', from: "    ops.push({ kind: 'stat', key: goalKey(type), period: '',",
    to: "    ops.push({ kind: 'quest', key: goalKey(type), period: ''," },
  { name: 'M9 goals: the MAX_GOAL_ADD clamp is removed',
    file: 'goals', from: "    if (n <= MAX_GOAL_ADD) return n;",
    to: "    if (n <= MAX_GOAL_ADD || true) return n;" },
  /* The one value that must never appear. It is refused by hr_apply rather than
     by this file, which is the right place for it — and that refusal is only
     worth anything if something exercises it. */
  { name: "M10 goals: a counter op claims state='claimed'",
    file: 'goals', from: "               add: clamp(type, daily[type], 'daily'), state: 'active' });",
    to: "               add: clamp(type, daily[type], 'daily'), state: 'claimed' });" },
];

const ENGINE_PATH = join(ROOT, 'supabase', 'functions', 'hr-accrue', 'accrual.js');
const GOALS_PATH = join(ROOT, 'src', 'core', 'goals.js');

/* Load a MUTATED copy of the engine + goals module pair.

   Both are loaded together even when only one is patched, because the engine
   imports the goals module by relative specifier: a mutant engine that resolved
   the REAL goals module would half-plant M8/M9 and read GREEN for the wrong
   reason. The rewrite points every relative specifier at an absolute file URL,
   and refuses to write a file with a surviving relative import — a mutant that
   cannot load is a harness failure, not a caught defect. */
async function loadMutant(m) {
  const rootUrl = pathToFileURL(join(ROOT, 'x')).href.replace(/x$/, '');
  const fnUrl = pathToFileURL(join(ROOT, 'supabase', 'functions', 'hr-accrue', 'x')).href.replace(/x$/, '');
  const stamp = `${process.pid}-${Date.now()}`;

  let goalsSrc = await readFile(GOALS_PATH, 'utf8');
  let engineSrc = await readFile(ENGINE_PATH, 'utf8');
  if (m.file === 'goals') {
    if (!goalsSrc.includes(m.from)) throw new Error(`MUTATION HARNESS: ${m.name} — anchor not found in goals.js`);
    goalsSrc = goalsSrc.replace(m.from, m.to);
  } else {
    if (!engineSrc.includes(m.from)) throw new Error(`MUTATION HARNESS: ${m.name} — anchor not found in accrual.js`);
    engineSrc = engineSrc.replace(m.from, m.to);
  }

  const goalsFile = join(tmpdir(), `hr-goals-mutant-${stamp}.mjs`);
  await writeFile(goalsFile, goalsSrc, 'utf8');
  const goalsUrl = pathToFileURL(goalsFile).href;

  engineSrc = engineSrc
    .replace(/from '\.\.\/\.\.\/\.\.\/src\/core\/goals\.js'/g, `from '${goalsUrl}'`)
    .replace(/from '\.\.\/\.\.\/\.\.\/src\//g, `from '${rootUrl}src/`)
    .replace(/from '\.\//g, `from '${fnUrl}`);
  if (/from '\.\.?\//.test(engineSrc)) {
    throw new Error('MUTATION HARNESS: a relative import survived the rewrite, so the mutant cannot load');
  }
  const engineFile = join(tmpdir(), `hr-accrual-mutant-${stamp}.mjs`);
  await writeFile(engineFile, engineSrc, 'utf8');

  try {
    const gm = await import(goalsUrl);
    const em = await import(pathToFileURL(engineFile).href);
    if (typeof em.computeAccrual !== 'function') throw new Error('MUTATION HARNESS: no computeAccrual export');
    return { engine: em.computeAccrual, goals: gm };
  } finally {
    await unlink(goalsFile).catch(() => {});
    await unlink(engineFile).catch(() => {});
  }
}

async function mutate() {
  const escapes = [];
  const realEngine = computeAccrualFn;
  const realGoals = goalsMod;
  for (const m of MUTATIONS) {
    problems = [];
    const loaded = await loadMutant(m);   // THROWS on a failed plant, deliberately
    computeAccrualFn = loaded.engine;
    goalsMod = loaded.goals;
    try { await run(null); }
    catch (e) { problems.push(`threw: ${String(e?.message || e).split('\n')[0]}`); }
    finally { computeAccrualFn = realEngine; goalsMod = realGoals; }
    const caught = problems.length > 0;
    console.log(`  ${caught ? 'RED  ' : 'GREEN'}  ${m.name}${caught ? ` (${problems.length})` : ''}`);
    if (caught) console.log(`         first: ${problems[0]}`);
    else escapes.push(m.name);
  }
  problems = escapes.map((n) => `MUTATION ESCAPED — the guard did not see: ${n}`);
  return escapes.length === 0;
}

export async function goalCountersGuard() {
  problems = [];
  try { await run(null); }
  catch (e) { problems.push(`goal counters guard failed to run — ${e?.message || e}`); }
  return problems.slice();
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.argv.includes('--mutate')) {
    console.log('goal counters — mutation run (every line must read RED):');
    const clean = await mutate();
    if (!clean) { for (const q of problems) console.log('  x ' + q); process.exit(1); }
    console.log(`All ${MUTATIONS.length} planted defects were caught.`);
    process.exit(0);
  }
  const ps = await goalCountersGuard();
  if (ps.length) {
    console.log('goal counters guard — FAILED:');
    for (const q of ps) console.log('  x ' + q);
    process.exit(1);
  }
  console.log('Goal counters guard — an away combat night moves \'slay N\' by exactly the kill count, '
    + 'a gather night moves its own counter by the yield, and neither touches the other\'s.');
}
