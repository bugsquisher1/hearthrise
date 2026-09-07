// ════════════════════════════════════════════════════════════════════════
// tests/goal-counter-kinds.mjs — THE BACKFILLED LIFETIME COUNTER MUST NEVER
//                                BECOME PAYABLE BY ACCIDENT.
//
// 2026-09-07-farm-plant-lifetime-counter.sql fixed a real bug (the "Plant N
// crops" daily could never move) and, to make the fix true for players who had
// already farmed, BACKFILLED a lifetime stat/'ev:planted' row for 27
// (user, slot) pairs from the plant ledger — up to 13 plants each. Security's
// GO named the residual risk precisely: those rows are a stock of completed
// work that no catalogue grades TODAY, and the day one does, 27 players are
// instantly complete for work done before the goal existed. hr_claim_goal would
// pay it without ever seeing a claim it could refuse, because from its point of
// view the counter is simply already at target.
//
// Two independent paths could open that door, and they need different guards:
//
//   1. THE CATALOGUE. A row in hr_goal_rewards whose counter_kind names a
//      lifetime counter. Guarded IN THE DATABASE by the check constraint
//      2026-09-07-goal-counter-kind-check.sql installs/asserts — this file
//      proves the constraint is there, VALIDATED, and that it actually bites
//      by executing the refused insert.
//   2. THE QUEST CASE. hr_claim_quest__ungated does NOT read that catalogue at
//      all: its four quests are a hardcoded CASE over LIFETIME stat keys
//      (ev:gather / ev:cooked / ev:kill_any / ev:harvest), and lifetime is
//      exactly the shape the backfill wrote. No constraint anywhere can stop a
//      fifth branch from naming 'ev:planted'. Only a guard over the body can,
//      so this file reads the INSTALLED function and requires that it does not.
//
// ── THE HONEST LIMIT OF THE CONSTRAINT, MEASURED NOT ASSUMED ────────────────
// Both goal readers (hr_goal_state__ungated, hr_claim_goal__ungated) branch
// `if counter_kind = 'ledger_gold' … else <read player_progress kind='daily'>`.
// The else is a FALLTHROUGH: an unknown counter_kind is graded as daily today,
// so a rogue catalogue row alone would read the DAILY counter and pay nothing
// retroactively. The exposure is the two-step — a row lands, then a later change
// teaches a reader about lifetime kinds, and by then the row looks intentional.
// The constraint's value is that it makes step one impossible instead of merely
// unhelpful, and that it makes the else-fallthrough honest. This guard therefore
// asserts BOTH halves: the constraint exists AND the readers are still
// period-scoped, proven by driving a player who has a large lifetime
// ev:planted and no daily one.
//
// ── WHAT THIS GUARD DOES (credential-free; PGlite rebuilds the chain) ───────
//   · the constraint on hr_goal_rewards.counter_kind exists, is VALIDATED and
//     pins exactly {daily, ledger_gold};
//   · EXECUTED: an insert with counter_kind='stat', counter_key='ev:planted' is
//     REFUSED (23514) while a control insert with 'daily' is accepted;
//   · every seeded catalogue row uses a kind that has a paying reader;
//   · a character with lifetime ev:planted = 40x the target and NO daily row
//     reads the plant goal as have=0, NOT complete, and hr_claim_goal refuses
//     it 'incomplete' — the backfill is unpayable through the goal board;
//   · the same character WITH a daily counter at target does complete it, so
//     the check above is not passing because the fixture is broken;
//   · the installed hr_claim_quest__ungated names no 'ev:planted' (with a
//     positive control on the four keys it does name);
//   · the migration is placed in tests/schema-apply-order.json with the exact
//     "STAGED, NOT APPLIED - REVIEW ONLY; " prefix.
//
// Run GREEN:  node tests/goal-counter-kinds.mjs
// Prove RED:  node tests/goal-counter-kinds.mjs --selftest
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { bootReplay, MANIFEST_PATH } from './schema-replay.mjs';

const MIG = '2026-09-07-goal-counter-kind-check.sql';
const CATALOGUE_MIG = '2026-08-23-modal-goal-claims.sql';
const QUEST_MIG = '2026-09-06-quest-item-rewards.sql';
const STAGED_PREFIX = 'STAGED, NOT APPLIED - REVIEW ONLY; ';

const UID = '000000f8-0000-0000-0000-0000000000c1';

/* THE ALLOWLIST, and the reason each member is on it. A kind belongs here only
   because a reader in the database pays it; this list is not a preference. */
const PAYING_KINDS = ['daily', 'ledger_gold'];

/* ── SEC 4 SHORT-CIRCUIT (the gate-blind arm) ───────────────────────────────
   Every red mutation is ALSO run with the migration's own Sec 4 neutered.
   A mutation that only makes the APPLY throw proves the MIGRATION can fail, not
   that THIS guard can see anything — and Sec 4 runs once, at apply time, while
   the regression that actually reopens this hole is a LATER migration widening
   the constraint or teaching the quest CASE a new key, long after Sec 4 has
   stopped running. Each defect is therefore caught twice: once by the gate,
   once by the guard standing alone. */
const GATE_BLIND = [
  MIG,
  `begin
  -- (a) A validated check constraint pins the column, whatever its name.`,
  `begin
  raise notice 'SEC 4 SHORT-CIRCUITED FOR THE MUTATION PROOF';
  return;
  -- (a) A validated check constraint pins the column, whatever its name.`,
];

/* ── MUTATIONS ─────────────────────────────────────────────────────────────
   Each plants a REAL defect in REAL migration text. Four must turn the guard
   RED. The fifth must leave it GREEN, and it is the most informative of the
   five: it deletes the inline check the CREATE TABLE happens to carry, which
   is the only reason the new migration takes its skip path — proving the ADD
   path installs a constraint that satisfies every assertion below, rather than
   the guard merely re-reading a constraint that was already there. */
const MUTATIONS = {
  allowlist_widened: {
    expect: 'red',
    why: 'THE NAMED RISK: the allowlist grows a lifetime kind, so a catalogue row grading the '
       + 'backfilled ev:planted stock can be inserted. (Widened at the CREATE, which the new '
       + "migration's coverage probe still accepts — it looks for 'daily' and 'ledger_gold' in the "
       + 'definition — so the skip path leaves the widened check in place. Exactly how this would '
       + 'arrive in real life: someone edits the table definition, not the constraint file.)',
    patches: [[CATALOGUE_MIG,
      "  counter_kind text    not null check (counter_kind in ('daily', 'ledger_gold')),",
      "  counter_kind text    not null check (counter_kind in ('daily', 'ledger_gold', 'stat')),"]],
  },
  constraint_absent: {
    expect: 'red',
    why: 'the column is free text again — the inline check is gone from the CREATE and the new '
       + "migration's ADD is neutered, which is the state any database whose table predated "
       + 'create-table-if-not-exists is in',
    patches: [
      [CATALOGUE_MIG,
        "  counter_kind text    not null check (counter_kind in ('daily', 'ledger_gold')),",
        '  counter_kind text    not null check (length(counter_kind) between 1 and 64),'],
      [MIG,
        `    alter table public.hr_goal_rewards
      add constraint hr_goal_rewards_counter_kind_ck
      check (counter_kind in ('daily', 'ledger_gold')) not valid;
    alter table public.hr_goal_rewards
      validate constraint hr_goal_rewards_counter_kind_ck;`,
        '    null;  -- MUTATION: the ADD path is neutered'],
    ],
  },
  quest_reads_planted: {
    expect: 'red',
    why: 'THE PATH NO CONSTRAINT CAN REACH: a fifth quest branch grades the LIFETIME ev:planted '
       + 'counter, so all 27 backfilled characters can claim it for work done before it existed',
    patches: [[QUEST_MIG,
      "    when 'farmhand'    then v_key := 'ev:harvest';  v_goal := 6;  v_gold := 500;",
      "    when 'farmhand'    then v_key := 'ev:harvest';  v_goal := 6;  v_gold := 500;\n"
      + "    when 'planter'     then v_key := 'ev:planted';  v_goal := 6;  v_gold := 500;"]],
  },
  goal_state_reads_lifetime: {
    expect: 'red',
    why: 'the goal board stops being period-scoped and grades the LIFETIME row instead — the '
       + 'second half of the two-step the constraint alone cannot prevent, and the reason this '
       + 'guard drives a real player rather than only reading pg_constraint',
    patches: [[CATALOGUE_MIG,
      `      select coalesce(value, 0) into v_have from public.player_progress
       where user_id = v_uid and slot = v_slot and kind = 'daily'
         and key = r.counter_key and period_key = v_day;`,
      `      select coalesce(value, 0) into v_have from public.player_progress
       where user_id = v_uid and slot = v_slot and kind = 'stat'
         and key = r.counter_key and period_key = '';`]],
  },
  inline_check_deleted_add_path: {
    expect: 'green',
    why: 'THE NEGATIVE CONTROL. With the inline check deleted the new migration must take its ADD '
       + 'path and install hr_goal_rewards_counter_kind_ck itself; the guard must stay GREEN. If '
       + 'this arm goes red, the ADD path does not work and the file only ever passed because the '
       + 'CREATE TABLE was already doing the job',
    patches: [[CATALOGUE_MIG,
      "  counter_kind text    not null check (counter_kind in ('daily', 'ledger_gold')),",
      '  counter_kind text    not null,']],
  },
};

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  FAIL  ${msg}`); } };

async function boot(name, gateBlind) {
  const map = new Map();
  const add = (file, find, repl) => {
    if (!map.has(file)) map.set(file, []);
    map.get(file).push([find, repl]);
  };
  if (name) for (const [f, find, repl] of MUTATIONS[name].patches) add(f, find, repl);
  if (gateBlind) add(GATE_BLIND[0], GATE_BLIND[1], GATE_BLIND[2]);
  const { db } = await bootReplay(map.size ? { patches: map } : undefined);
  return db;
}

async function asUser(db, uid, sql, params) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
  try { return await db.query(sql, params); }
  finally { await db.exec(`select set_config('request.jwt.claim.sub', '', false)`); }
}

/** Run `sql` inside a transaction that is ALWAYS rolled back; return the
 *  PostgreSQL SQLSTATE it raised, or null if it succeeded. */
async function refusedWith(db, sql) {
  await db.exec('begin');
  try { await db.exec(sql); return null; }
  catch (e) { return e && (e.code || (e.cause && e.cause.code)) || String(e.message); }
  finally { await db.exec('rollback'); }
}

async function runAll(db) {
  // ── THE CATALOGUE ROW THE BACKFILL SHADOWS, READ NOT ASSUMED ─────────────
  const plant = (await db.query(
    `select counter_kind, counter_key, target, weekly from public.hr_goal_rewards where goal_id = 'plant'`
  )).rows[0];
  ok(!!plant, "hr_goal_rewards still carries the 'plant' goal — the fixture below grades it");
  if (!plant) return;
  ok(plant.counter_key === 'ev:planted',
     `the plant goal grades ev:planted (got ${plant.counter_key}) — the same key the backfill wrote`);
  ok(plant.counter_kind === 'daily',
     `the plant goal is a DAILY counter (got ${plant.counter_kind}) — a lifetime kind here is the bug`);
  const target = Number(plant.target);
  ok(target > 0, `the plant goal has a positive target (got ${target})`);

  // ── 1. THE CONSTRAINT ────────────────────────────────────────────────────
  const cons = (await db.query(
    `select c.conname, pg_get_constraintdef(c.oid) as def, c.convalidated
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public' and t.relname = 'hr_goal_rewards' and c.contype = 'c'
        and pg_get_constraintdef(c.oid) like '%counter_kind%'`)).rows;
  ok(cons.length >= 1,
     'a CHECK constraint pins hr_goal_rewards.counter_kind — without one the column is free text and '
     + 'any kind can be authored into the reward catalogue');
  for (const c of cons) {
    ok(c.convalidated === true,
       `${c.conname} is VALIDATED (got convalidated=${c.convalidated}) — a NOT VALID constraint does not `
       + 'vouch for the rows already in the table');
    for (const k of PAYING_KINDS) {
      ok(c.def.includes(`'${k}'`), `${c.conname} admits '${k}', which has a paying reader: ${c.def}`);
    }
    /* The predicate must not have grown a THIRD value. Counted from the
       definition text rather than eyeballed, so a widening cannot hide. */
    const quoted = [...c.def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
    const extra = quoted.filter((v) => !PAYING_KINDS.includes(v));
    ok(extra.length === 0,
       `${c.conname} admits ONLY the kinds that have a paying reader — it also admits `
       + `[${extra.join(', ')}], and any lifetime kind here makes the backfilled ev:planted stock payable`);
  }

  // ── 2. EXECUTED: THE REFUSAL, WITH A POSITIVE CONTROL ────────────────────
  const control = await refusedWith(db,
    `insert into public.hr_goal_rewards (goal_id, weekly, counter_kind, counter_key, target, gold, gems, xp, items)
     values ('__gck_ok', false, 'daily', 'ev:planted', 3, 0, 0, '{}', '{}')`);
  ok(control === null,
     `a catalogue insert with an ALLOWED kind succeeds (got ${control}) — the refusal below must be `
     + 'caused by the allowlist, not by RLS, a missing grant or a NOT NULL');
  const refused = await refusedWith(db,
    `insert into public.hr_goal_rewards (goal_id, weekly, counter_kind, counter_key, target, gold, gems, xp, items)
     values ('__gck_bad', false, 'stat', 'ev:planted', 3, 500, 0, '{}', '{}')`);
  ok(refused === '23514',
     `a catalogue row with counter_kind='stat' grading ev:planted is REFUSED by the database `
     + `(expected sqlstate 23514, got ${refused}) — if it is accepted, the day anyone adds it all 27 `
     + 'backfilled lifetime rows pay out retroactively');
  const n = Number((await db.query('select count(*)::int as n from public.hr_goal_rewards')).rows[0].n);
  ok(n === 19, `the catalogue still holds its 19 rows after the probes (got ${n})`);

  // ── 3. EVERY SEEDED ROW USES A KIND THAT HAS A PAYING READER ─────────────
  const kinds = (await db.query(
    'select distinct counter_kind from public.hr_goal_rewards order by 1')).rows.map((r) => r.counter_kind);
  for (const k of kinds) {
    ok(PAYING_KINDS.includes(k),
       `catalogue kind '${k}' is one of the kinds a reader actually pays (${PAYING_KINDS.join(', ')})`);
  }

  // ── 4. THE PLAYER-LEVEL PROPERTY: THE BACKFILL IS UNPAYABLE ──────────────
  // A character in exactly the state the backfill left 27 of them in: a large
  // LIFETIME ev:planted row, and no daily one.
  const stock = target * 40;
  await db.exec(`insert into auth.users (id) values ('${UID}') on conflict (id) do nothing;`);
  await db.exec(`insert into public.player_state (user_id, slot, gold, gems, version)
                 values ('${UID}', 0, 0, 0, 1)
                 on conflict (user_id, slot) do update set version = 1;`);
  await db.exec(`insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
                 values ('${UID}', 0, 'stat', 'ev:planted', ${stock}, '', 'active')
                 on conflict (user_id, slot, kind, key, period_key)
                   do update set value = ${stock};`);

  const goalOf = async (env) => (env && Array.isArray(env.goals)
    ? env.goals.find((g) => g.goal_id === 'plant') : null);

  let env = (await asUser(db, UID, 'select public.hr_goal_state__ungated(0) as env')).rows[0].env;
  ok(env && env.ok === true, `hr_goal_state answers for the fixture character (got ${JSON.stringify(env)})`);
  let g = await goalOf(env);
  ok(!!g, 'the plant goal appears on the board');
  ok(g && Number(g.have) === 0,
     `a character with a LIFETIME ev:planted of ${stock} and no daily row reads the plant goal as `
     + `have=0 (got ${g && g.have}) — the goal board is period-scoped and cannot see the backfill`);
  ok(g && g.complete === false,
     `…and the goal is NOT complete (got complete=${g && g.complete}) — 27 players would otherwise wake `
     + 'up with a free claim for work done before the goal existed');

  const claim = (await asUser(db, UID,
    `select public.hr_claim_goal__ungated('plant', false, 0, '000000f8-0000-0000-0000-0000000000d1'::uuid) as r`
  )).rows[0].r;
  /* 'not_complete' is hr_claim_goal's refusal code (hr_claim_QUEST's is
     'incomplete' — two different RPCs, two different vocabularies; asserting
     the wrong one here would have made this check silently vacuous). */
  ok(claim && claim.ok === false && claim.error === 'not_complete' && Number(claim.have) === 0,
     `hr_claim_goal REFUSES the plant goal as 'not_complete' with have=0 for that character (got `
     + `${JSON.stringify(claim)}) — the server, not the client, is what makes the backfill unpayable`);

  // NON-VACUITY: the same reads must be able to say YES. Without this, a goal
  // board that answered "0, incomplete" for every goal in the game would pass.
  const day = (await db.query('select public.hr_utc_day_key(now()) as d')).rows[0].d;
  await db.exec(`insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
                 values ('${UID}', 0, 'daily', 'ev:planted', ${target}, '${day}', 'active')
                 on conflict (user_id, slot, kind, key, period_key)
                   do update set value = ${target};`);
  env = (await asUser(db, UID, 'select public.hr_goal_state__ungated(0) as env')).rows[0].env;
  g = await goalOf(env);
  ok(g && Number(g.have) === target && g.complete === true,
     `the SAME character with a DAILY ev:planted at target ${target} reads have=${g && g.have} and `
     + 'complete=true — the assertions above are about the counter kind, not a dead fixture');

  // ── 5. THE QUEST CASE — THE PATH NO CONSTRAINT REACHES ───────────────────
  const src = (await db.query(
    `select pg_get_functiondef(p.oid) as src from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='hr_claim_quest__ungated' limit 1`)).rows[0];
  ok(!!src, 'hr_claim_quest__ungated is installed');
  const body = src ? src.src : '';
  ok(!body.includes('ev:planted'),
     "hr_claim_quest__ungated names NO 'ev:planted' — its quests grade LIFETIME stat counters from a "
     + 'hardcoded CASE, which is exactly the shape the plant backfill wrote, and no constraint on '
     + 'hr_goal_rewards can stop a branch being added here');
  for (const k of ['ev:gather', 'ev:cooked', 'ev:kill_any', 'ev:harvest']) {
    ok(body.includes(k),
       `…and it still names ${k} — the positive control, without which the absence check above would `
       + 'pass on an empty or unrelated body');
  }

  // ── 6. THE DEPLOYMENT RECORD NAMES THE FILE ──────────────────────────────
  const man = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  ok(man.order.filter((f) => f === MIG).length === 1,
     `${MIG} appears exactly once in the apply order`);
  const note = (man._order_notes || {})[MIG] || '';
  ok(note.startsWith(STAGED_PREFIX),
     `its note opens with the exact "${STAGED_PREFIX}" prefix — an operator reading the record to `
     + 'decide what still has to be run must not be told a staged file is live, or the reverse');
}

const argv = process.argv.slice(2);

if (argv.includes('--selftest')) {
  console.log('goal-counter-kinds --selftest: four defects must turn the guard RED, one control must leave it GREEN');
  {
    const save = failed; failed = 0;
    await runAll(await boot(null, false));
    if (failed) { console.error(`\nFLOOR CHECK FAILED: the CLEAN pass is already red (${failed}).`); process.exit(2); }
    failed = save;
  }
  let bad = 0, n = 0;
  for (const name of Object.keys(MUTATIONS)) {
    const m = MUTATIONS[name];
    const arms = m.expect === 'red' ? [false, true] : [false];
    for (const gateBlind of arms) {
      n++;
      const label = gateBlind ? `${name} [gate-blind]` : name;
      const save = failed; failed = 0; let threw = false; let msg = '';
      try { await runAll(await boot(name, gateBlind)); }
      catch (e) { threw = true; msg = String(e && e.message).split('\n')[0]; }
      const wentRed = failed > 0 || threw; failed = save;
      if (m.expect === 'green') {
        if (wentRed) { bad++; console.error(`  x ${label}: WENT RED — ${m.why}${threw ? ` (threw: ${msg})` : ''}`); }
        else console.log(`  ${label}: GREEN as required — ${m.why}`);
        continue;
      }
      /* A gate-blind arm that only THROWS means the Sec 4 short-circuit did not
         take, so the arm demonstrated the MIGRATION's own gate a second time
         instead of this guard. That is not a catch. */
      if (gateBlind && threw) {
        bad++;
        console.error(`  x ${label}: the SEC 4 short-circuit did NOT take (the apply still threw: ${msg}), so `
          + 'this arm proved the migration gate rather than the guard. Fix GATE_BLIND.');
        continue;
      }
      if (wentRed) console.log(`  ${label}: RED${threw ? ` (threw: ${msg})` : ' (assertions failed)'} — ${m.why}`);
      else { bad++; console.error(`  x ${label}: STAYED GREEN — the guard does not catch: ${m.why}`); }
    }
  }
  if (bad) { console.error(`\n${bad} mutation arm(s) behaved wrongly.`); process.exit(1); }
  console.log(`\nAll ${n} arms behaved as required. The guard is non-vacuous, and the migration's ADD path `
    + 'is proven by the control rather than assumed.');
  process.exit(0);
} else {
  await runAll(await boot(null, false));
  if (failed) { console.error(`\ngoal-counter-kinds: ${failed} assertion(s) FAILED.`); process.exit(1); }
  console.log('goal-counter-kinds: hr_goal_rewards.counter_kind is pinned to the two kinds a reader pays, a '
    + "counter_kind='stat' row grading ev:planted is refused by the database, the goal board stays "
    + 'period-scoped for a character holding a large lifetime ev:planted, and the quest CASE names no '
    + 'ev:planted — the backfilled lifetime plant counter is unpayable by every path.');
  process.exit(0);
}
