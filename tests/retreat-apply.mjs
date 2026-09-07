#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/retreat-apply.mjs — THE RETREAT COUNTER'S SERVER VALIDATION,
// PROVEN BY EXECUTION ON A REBUILT CHAIN.
//
//   node tests/retreat-apply.mjs             the guard
//   node tests/retreat-apply.mjs --list      the mutations
//   node tests/retreat-apply.mjs --mutate=<id>   plant ONE defect, show the result
//   node tests/retreat-apply.mjs --selftest  green first, then every mutation must go RED
//
// ── WHERE THIS CAME FROM ────────────────────────────────────────────────────
// The security review of 2026-09-07-retreat.sql (Recovery Rule rev. 3, "The
// Retreat") signed GO-WITH-CHANGES, and this harness is the change. The
// migration adds `player_state.consec_falls` — consecutive falls with no kill
// between them — and teaches `hr_apply` to allowlist, validate and write it.
// Its own §4 self-check is strong but it proves the VALIDATION BY strpos: it
// asserts that the text `bad_consec_falls` and `v_consec <> trunc(v_consec)`
// appear in the installed body. Text is not behaviour. A body can carry every
// one of those strings in a branch that never runs, or in a comment, and §4
// reports success — this repo has shipped a guard that asserted nothing twelve
// times, and "the marker is present" is exactly the shape those took.
//
// So this replays the REAL ordered chain (tests/schema-apply-order.json) into an
// in-process PostgreSQL and CALLS hr_apply, as the engine role, with each value
// an attacker or a buggy engine would send. Nothing is asserted about the text.
//
// ── WHAT IT PROVES, AND WHY EACH ONE IS HERE ────────────────────────────────
//   [1] REACHABILITY. `authenticated` and `anon` hold no EXECUTE on hr_apply or
//       hr_state_of, and a real call as `authenticated` is refused by Postgres
//       (42501). If a client could reach the writer, every validation below is
//       decoration — a forged counter would be the least of it.
//   [2] THE RETREAT DELTA, END TO END. `{consec_falls: 3, activity: idle}` — the
//       exact shape src/core/accrual.js proposes — writes 3 AND idles the
//       pointer in ONE apply.
//   [3] THE ACTIVITY KEY DOES NOT VOID IT. This is the exploit the migration's
//       §4(c) names and the reason it bites harder here than for
//       `recovering_until`: EVERY retreat carries an `activity` key, so if
//       consec_falls were voided by one, every retreat would erase its own
//       counter on the way out and "switch away, switch back" would be a free
//       reset of the rule that just ended the run.
//   [4] THE SHAPE REFUSALS, EXECUTED. 2.5, -1, 65, "3", null, true and 1e30 are
//       each refused as `bad_consec_falls`, and NONE of them moves the column —
//       the refusal has to roll back, not just report.
//   [5] THE ADMITTED VALUES. 0 (a kill's reset — the rule itself) and 64 (the
//       blast radius) are accepted and written. A guard that only proved
//       refusals would pass just as well against a body that refuses
//       everything, which would brick every settle.
//   [6] AN UNKNOWN KEY IS STILL REFUSED. The allowlist did not get widened.
//   [7] IDEMPOTENCY. A second apply of the file leaves both function bodies
//       BYTE-IDENTICAL and exactly one CHECK constraint. The file is a pair of
//       anchored patches on bodies that are ten patches deep; a re-apply that
//       double-patched would be a silent corruption of the engine.
//   [8] THE PROJECTION. hr_state_of returns the column, which is the only way
//       the engine ever learns it exists (accrual.js seeds NULL without it).
//
// ── THE MUTATIONS ───────────────────────────────────────────────────────────
// Each is planted in the REAL migration text through the replay's own patch
// mechanism, so the chain that gets tested is the chain that was built from the
// mutated file. Both were chosen to APPLY CLEAN — the migration's §4 self-check
// does not cover the range predicate or the type predicate, which is precisely
// why an executed guard has to. A mutation that made the file fail to apply
// would prove nothing: a file that will not install looks the same as a guard
// that works.
//
// NO CREDENTIALS. NO NETWORK. Production is untouched — this is a rebuild.
// NO `?v=` on the imports (this is tests/**, not a browser module — b332).
// Exit: 0 green · 1 a violation · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════

import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-09-07-retreat.sql';
const U = '00000000-0000-4000-8000-0000000000aa';
const J = { kind: 'combat', intent: 'accrue' };

const harness = (m) => { const e = new Error(m); e.harness = true; return e; };
const uuid = () => 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'
  .replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

/* ── THE MUTATION CATALOGUE ───────────────────────────────────────────────
   `find` must match EXACTLY ONCE in the migration (bootReplay enforces it and
   raises a harness error otherwise), so a mutation whose anchor has moved is
   repaired rather than silently no-oping into a green selftest. */
const MUTATIONS = {
  ceiling_arm_dropped: {
    why: 'hr_apply stops testing the BLAST RADIUS — `65` is admitted by the function and only the '
       + 'table CHECK stands between a forged/buggy engine and an out-of-range counter. The '
       + "migration's own §4 does not assert this predicate at all (it checks the fraction test and "
       + 'the release code), so nothing but an executed call can see it.',
    find: '      if v_consec < 0 or v_consec > c_max_consec_falls then',
    repl: '      if v_consec < 0 and false then',
  },
  type_gate_dropped: {
    why: 'hr_apply stops testing the JSON TYPE, so a STRING "3", a `null` and a `true` walk into a '
       + 'numeric cast instead of being refused as bad_consec_falls — the client-shaped value '
       + 'crossing into a server counter, which is the one outcome CLAUDE.md §1 forbids by name. '
       + "§4(b) only asserts that the words `if p_delta ? 'consec_falls' then` and "
       + '`bad_consec_falls` appear somewhere in the body, and after this mutation they both still do.',
    find: "      if jsonb_typeof(p_delta->'consec_falls') <> 'number' then",
    repl: "      if jsonb_typeof(p_delta->'consec_falls') = 'no_such_type' then",
  },
};

const patchesFor = (mutate) => {
  if (!mutate) return undefined;
  const m = MUTATIONS[mutate];
  if (!m) throw harness(`unknown mutation '${mutate}' (see --list)`);
  return new Map([[MIG, [[m.find, m.repl]]]]);
};

// ── THE RUN ────────────────────────────────────────────────────────────────
async function run(mutate) {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };

  const { db } = await bootReplay({ patches: patchesFor(mutate) });

  /* ── [7] IDEMPOTENCY, taken FIRST, before anything has written a row ──────
     Read the two bodies, apply the file a second time from the chain's own
     copy, read them again. Byte-identical or the anchored patches are
     double-applying — which on bodies this deep is a silent corruption of the
     engine that no signature-level guard would notice. The file text is taken
     from the SAME patched source the chain was built from, so under a mutation
     this measures the mutated file's idempotency rather than a mismatch. */
  const defs = async () => (await db.query(
    `select pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure) as a,
            pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure) as s`)).rows[0];
  const before = await defs();
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { ROOT } = await import('./schema-replay.mjs');
  let sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
  if (mutate) {
    const m = MUTATIONS[mutate];
    if (sql.split(m.find).length - 1 !== 1) {
      throw harness(`[7] the mutation anchor for '${mutate}' matched != 1 time in ${MIG}`);
    }
    sql = sql.replace(m.find, () => m.repl);
  }
  let reapplyErr = null;
  try { await db.exec(sql); } catch (e) { reapplyErr = e; }
  const after = await defs();
  ok(!reapplyErr, `[7] a second apply of ${MIG} did not run clean — ${reapplyErr && reapplyErr.message}`);
  ok(before.a === after.a,
    '[7] the hr_apply body CHANGED on a second apply — the anchored patch is not idempotent, and this '
    + 'file patches a body that is ten patches deep');
  ok(before.s === after.s, '[7] the hr_state_of body CHANGED on a second apply');
  const cons = (await db.query(
    `select count(*)::int n from pg_constraint
      where conrelid = 'public.player_state'::regclass
        and conname = 'player_state_consec_falls_sane'`)).rows[0].n;
  ok(cons === 1, `[7] ${cons} copies of the CHECK constraint after two applies (want exactly 1)`);

  // ── [1] REACHABILITY: can a client role reach the writer at all? ──────────
  for (const role of ['authenticated', 'anon']) {
    const p = (await db.query(
      `select has_function_privilege($1, 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute') as a,
              has_function_privilege($1, 'public.hr_state_of(uuid,int)', 'execute') as s`, [role])).rows[0];
    ok(p.a === false, `[1] ${role} holds EXECUTE on hr_apply — the counter is client-writable and so is `
      + 'everything else hr_apply owns');
    ok(p.s === false, `[1] ${role} holds EXECUTE on hr_state_of`);
  }
  /* Not just the catalogue — the CALL. A grant table can be read wrong; a
     refusal cannot be argued with. */
  await db.exec(`select set_config('request.jwt.claim.sub', '${U}', false)`);
  await db.exec('set role authenticated');
  let denied = null;
  try {
    await db.query('select public.hr_apply($1::uuid,$2::int,$3::bigint,$4::uuid,$5::jsonb)',
      [U, 0, 1, uuid(), JSON.stringify({ consec_falls: 0, journal: J })]);
  } catch (e) { denied = e; }
  await db.exec('reset role');
  ok(!!denied && /permission denied|42501/i.test(denied.message),
    `[1] a call to hr_apply AS authenticated was not refused (${denied ? denied.message.slice(0, 80) : 'it succeeded'})`);

  // ── the character ────────────────────────────────────────────────────────
  await db.exec(`insert into auth.users (id) values ('${U}') on conflict (id) do nothing;`);
  await db.exec(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
      active_kind, active_id, accrued_to)
    values ('${U}', 0, 0, 0, 4, 10, 1, 'combat', 'slime', now() - interval '600 seconds')
    on conflict (user_id, slot) do update set version = 1;`);

  const readRow = async () => (await db.query(
    `select consec_falls, active_kind, active_id, recovering_until, version
       from public.player_state where user_id = $1 and slot = 0`, [U])).rows[0];

  /* THE ENGINE'S OWN CALL. A refusal that escapes as an exception rather than as
     `{ok:false}` is still a refusal for the purposes of "did it move the
     column", but it is NOT the same thing as the named release code — so it is
     reported as what it is and the assertion below judges it. */
  const apply = async (delta) => {
    const v = Number((await readRow()).version);
    await db.exec('set role hr_engine');
    try {
      const r = await db.query(
        'select public.hr_apply($1::uuid,$2::int,$3::bigint,$4::uuid,$5::jsonb) as res',
        [U, 0, v, uuid(), JSON.stringify(delta)]);
      return r.rows[0].res;
    } catch (e) {
      return { ok: false, error: '__threw__', message: String((e && e.message) || e) };
    } finally { await db.exec('reset role'); }
  };

  // ── [2] THE RETREAT DELTA, END TO END ────────────────────────────────────
  const r0 = await apply({ consec_falls: 3, activity: { kind: 'idle', id: null }, journal: J });
  ok(r0 && r0.ok === true,
    `[2] the retreat delta (consec_falls + activity idle) was refused: ${JSON.stringify(r0).slice(0, 160)}`);
  let row = await readRow();
  ok(Number(row.consec_falls) === 3, `[2] the counter was not written ABSOLUTE (row reads ${row.consec_falls}, want 3)`);
  ok(row.active_kind === 'idle',
    `[2] the pointer did not idle in the same apply (reads ${row.active_kind}) — the retreat would end the `
    + 'run on the client and leave the server still paying a fight');

  // ── [3] THE ACTIVITY KEY DOES NOT VOID THE COUNTER ───────────────────────
  const r1 = await apply({ activity: { kind: 'combat', id: 'slime' }, journal: J });
  ok(r1 && r1.ok === true, `[3] an activity-only delta was refused: ${JSON.stringify(r1).slice(0, 140)}`);
  row = await readRow();
  ok(Number(row.consec_falls) === 3,
    `[3] switching activity RESET the counter to ${row.consec_falls}. Every retreat carries an activity `
    + 'key, so a void here would let each retreat erase its own counter and make "switch away, switch '
    + 'back" a free reset of the rule that just ended the run.');

  // ── [4] THE SHAPE REFUSALS, EXECUTED ─────────────────────────────────────
  for (const [label, val] of [['fractional 2.5', 2.5], ['negative -1', -1], ['over-ceiling 65', 65],
    ['the string "3"', '3'], ['null', null], ['boolean true', true], ['huge 1e30', 1e30]]) {
    const r = await apply({ consec_falls: val, journal: J });
    ok(!!r && r.ok === false && r.error === 'bad_consec_falls',
      `[4] ${label} was not refused as bad_consec_falls — got ${JSON.stringify(r).slice(0, 140)}`);
  }
  row = await readRow();
  ok(Number(row.consec_falls) === 3,
    `[4] a REFUSED delta moved the column to ${row.consec_falls}. A rejection has to roll the block back, `
    + 'not merely report — hr_reject raises HR000 for exactly that reason.');

  // ── [5] THE ADMITTED VALUES ──────────────────────────────────────────────
  const r2 = await apply({ consec_falls: 0, journal: J });
  row = await readRow();
  ok(!!r2 && r2.ok === true && Number(row.consec_falls) === 0,
    `[5] a KILL's reset to 0 was refused or not written (${JSON.stringify(r2).slice(0, 120)}, row `
    + `${row.consec_falls}). "Any kill resets the count" IS the rule — a body that refused it would `
    + 'retreat a hero who is winning.');
  const r3 = await apply({ consec_falls: 64, journal: J });
  row = await readRow();
  ok(!!r3 && r3.ok === true && Number(row.consec_falls) === 64,
    `[5] the ceiling value 64 was refused or not written (${JSON.stringify(r3).slice(0, 120)}, row `
    + `${row.consec_falls}) — the blast radius must ADMIT its own edge or a designer retuning the table `
    + 'would need an SQL migration');

  // ── [6] THE ALLOWLIST DID NOT WIDEN ──────────────────────────────────────
  const r4 = await apply({ not_a_real_key: 1, journal: J });
  ok(!!r4 && r4.ok === false && r4.error === 'unknown_delta_key',
    `[6] an unknown delta key was not refused: ${JSON.stringify(r4).slice(0, 140)}`);

  // ── [8] THE PROJECTION ───────────────────────────────────────────────────
  await db.exec('set role hr_engine');
  const env = (await db.query('select public.hr_state_of($1::uuid, 0) as e', [U])).rows[0].e;
  await db.exec('reset role');
  ok(!!env && !!env.state && Object.prototype.hasOwnProperty.call(env.state, 'consec_falls'),
    '[8] hr_state_of does not project consec_falls — the engine can never learn the column exists, '
    + 'accrual.js seeds NULL, and the whole feature is inert');
  ok(env && env.state && Number(env.state.consec_falls) === 64,
    `[8] the projection does not carry the stored value (got ${env && env.state && env.state.consec_falls}, want 64)`);

  return problems;
}

/** Registered surface for tests/run-smoke.mjs and run-ci-local. */
export async function retreatApplyGuard() { return run(); }

// ── CLI ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/retreat-apply.mjs');

if (RUN_DIRECTLY) {
  try {
    if (argv.includes('--list')) {
      for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(22)} ${m.why}`);
      process.exit(0);
    }

    if (argv.includes('--selftest')) {
      console.log('retreat-apply --selftest: the UNMUTATED chain must be green, then every mutation RED\n');
      const base = await run();
      if (base.length) {
        console.error('  x the unmutated chain is already red — fix that before reading the mutation results:');
        for (const p of base) console.error(`      ${p}`);
        process.exit(1);
      }
      console.log('  base: green');
      let missed = 0;
      for (const id of Object.keys(MUTATIONS)) {
        let probs = [];
        try { probs = await run(id); }
        catch (e) {
          if (e.harness) { console.error(`  x ${id}: HARNESS — ${e.message}`); process.exit(2); }
          throw e;
        }
        if (probs.length) {
          console.log(`  ${id}: RED (${probs.length}) — ${probs[0]}`);
        } else {
          missed += 1;
          console.error(`  x ${id}: STAYED GREEN. The guard does not catch: ${MUTATIONS[id].why}`);
        }
      }
      if (missed) {
        console.error(`\n${missed} mutation(s) not caught — the guard is not proving what it claims.`);
        process.exit(1);
      }
      console.log(`\nAll ${Object.keys(MUTATIONS).length} mutations caught. The guard is non-vacuous.`);
      process.exit(0);
    }

    const mArg = argv.find((a) => a.startsWith('--mutate='));
    const probs = await run(mArg ? mArg.split('=')[1] : undefined);
    if (probs.length) {
      console.error(`retreat-apply: ${probs.length} violation(s)\n`);
      for (const p of probs) console.error(`  ✗ ${p}`);
      process.exit(mArg ? 0 : 1);
    }
    if (mArg) {
      console.error(`\nx --mutate=${mArg.split('=')[1]}: STAYED GREEN.`);
      process.exit(1);
    }
    console.log('retreat-apply: hr_apply\'s consec_falls contract holds ON A REBUILT CHAIN, by execution — '
      + 'no client role can reach the writer and a call as `authenticated` is refused; the retreat delta '
      + '(counter + idle pointer) applies as one write; an activity key does NOT void the counter; 2.5, '
      + '-1, 65, "3", null, true and 1e30 are each refused as bad_consec_falls with the column unmoved; 0 '
      + '(a kill\'s reset) and 64 (the blast radius) are admitted and written; an unknown delta key is '
      + 'still refused; hr_state_of projects the column; and a second apply of the migration leaves both '
      + 'bodies byte-identical with exactly one CHECK constraint.');
    process.exit(0);
  } catch (e) {
    if (e && e.harness) { console.error(`retreat-apply: HARNESS — ${e.message}`); process.exit(2); }
    throw e;
  }
}
