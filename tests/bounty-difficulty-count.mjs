#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bounty-difficulty-count.mjs — b497, BEHAVIOURALLY.
//
// tests/bounty-drift.mjs is a STATIC guard: it reads the migration text and
// re-derives the SQL arithmetic in JavaScript. That catches a table edit, and it
// cannot catch a Postgres-vs-JavaScript disagreement — a rounding mode, a
// numeric cast, an overload resolving to the wrong function — because both
// sides of its comparison are JavaScript.
//
// So this boots a real PostgreSQL (PGlite / PG18, in process), applies the REAL
// migration chain verbatim, and then asks the DATABASE what the range is:
//
//   B1  hr_bounty_kill_range(tier, difficulty) equals bountyCountRange() for
//       all 24 (tier × difficulty) pairs. Two languages, one answer.
//   B2  hr_bounty_first_contract_range(difficulty) equals the b487 bracket
//       scaled the same way — the board's first slot is always EASY, so an
//       unscaled server floor silently raises an honest 14-kill contract to 15.
//   B3  an unknown difficulty yields NO ROW (fail closed), and the tier-only
//       overload is untouched.
//   B4  a real signed-in player ACCEPTS at easy / normal / hard and the
//       server's `required` round-trips the client's draw UNCHANGED.
//   B5  a below-floor and an above-ceiling `required` are clamped to the
//       SCALED bounds, not the tier bounds. This is the assertion that fails if
//       only one half of the ruling ships.
//   B6  'elite' is still REFUSED (Security ruling 2026-08-23) — this change is
//       not allowed to open it.
//   B7  gold-per-kill, read from the LIVE hr_bounty_reward and the LIVE range,
//       rises with difficulty at every tier. The b489 inversion, asserted as a
//       property of the database rather than of a comment.
//   B8  none of the three new functions is executable by anon / authenticated /
//       service_role.
//
// ── WHAT IS NOT PROVEN ──────────────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend; nothing contends the advisory
//     locks hr_accept_bounty's neighbours take.
//   · The PostgREST request path. RPCs are called as SQL with
//     `request.jwt.claim.sub` set, which is how PostgREST sets it.
//
// ── FALSIFIABILITY ─────────────────────────────────────────────────────
//   node tests/bounty-difficulty-count.mjs             clean run
//   node tests/bounty-difficulty-count.mjs --list      the mutation catalogue
//   node tests/bounty-difficulty-count.mjs --selftest  every mutation must be caught
//   node tests/bounty-difficulty-count.mjs --mutate=<id>
// ════════════════════════════════════════════════════════════════════════
import { bootReplay } from './schema-replay.mjs';
import {
  BOUNTY_DIFFICULTY_COUNT, BOUNTY_KILL_COUNTS, BOUNTY_FIRST_CONTRACT_COUNT,
  BOUNTY_FIRST_CONTRACT_MAX_LEVEL, bountyCountRange, bountyRewards,
} from '../src/core/bounty.js';

const MIG = '2026-09-04-bounty-difficulty-count.sql';
const DIFFS = ['easy', 'normal', 'hard', 'elite'];
/* The three the ACCEPT admits. 'elite' is refused before it ever reaches a
   range — see B6 and the 2026-08-23 security ruling. */
const ACCEPTED = ['easy', 'normal', 'hard'];

const MUTATIONS = {
  easy_scale_drift: {
    why: 'the SQL easy count multiplier drifts from the ruling, so the board draws 72 and the '
       + 'server demands 76 — the exact client/server contract split this change exists to close',
    find: "           when 'easy'   then 0.90", repl: "           when 'easy'   then 0.95",
  },
  scale_not_applied: {
    why: 'the scaled range stops multiplying, so every difficulty gets the tier range back and '
       + 'the b489 inversion returns through a green deploy',
    find: '  select greatest(1, round(r.kmin * m.dm))::bigint,\n         greatest(1, round(r.kmax * m.dm))::bigint\n    from public.hr_bounty_kill_range(p_tier) r',
    repl: '  select greatest(1, r.kmin)::bigint,\n         greatest(1, r.kmax)::bigint\n    from public.hr_bounty_kill_range(p_tier) r',
  },
  accept_ignores_difficulty: {
    why: 'the accept clamps on the TIER-ONLY range again — three new functions, nothing calling '
       + 'them, and the server silently enforcing a different contract than the board showed',
    find: "    || '    from public.hr_bounty_kill_range(v_tier, p_difficulty);' || chr(10)",
    repl: "    || '    from public.hr_bounty_kill_range(v_tier);' || chr(10)",
  },
  first_contract_unscaled: {
    why: "a new hunter's honest 14-kill EASY first contract is raised to 15 by the server",
    find: "    || '    select kmin into v_kmin from public.hr_bounty_first_contract_range(p_difficulty);'",
    repl: "    || '    select kmin into v_kmin from public.hr_bounty_first_contract_range();'",
  },
  unknown_difficulty_defaults: {
    why: 'an unknown difficulty is served the NORMAL range instead of being refused — the '
       + 'fail-closed half of the design is gone and a forged string gets a contract',
    find: "           when 'elite'  then 1.50\n         end::numeric;",
    repl: "           when 'elite'  then 1.50\n           else 1.00\n         end::numeric;",
  },
  range_client_callable: {
    why: 'the scaled range becomes client-executable — a privileged lookup left reachable is how '
       + 'the grant-hygiene rule gets quietly eroded one function at a time',
    find: 'revoke execute on function public.hr_bounty_kill_range(integer, text) from anon, authenticated, service_role;',
    repl: 'grant execute on function public.hr_bounty_kill_range(integer, text) to authenticated;',
  },
};

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

async function run(mutate) {
  const patches = mutate ? new Map([[MIG, [[MUTATIONS[mutate].find, MUTATIONS[mutate].repl]]]]) : undefined;
  const { db } = await bootReplay({ patches });
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const asUser = async (uid, sql, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; } finally { await db.query('reset role').catch(() => {}); }
  };
  const gate = () => q('delete from public.hr_rate_counters');

  // ── B1/B2/B3: the DATABASE's answer, for every pair ───────────────────
  const sqlRange = {};
  for (let t = 1; t <= 6; t++) {
    for (const d of DIFFS) {
      const r = await q('select kmin::text lo, kmax::text hi from public.hr_bounty_kill_range($1,$2)', [t, d]);
      sqlRange[`${t}:${d}`] = r.length ? [Number(r[0].lo), Number(r[0].hi)] : null;
    }
  }
  const sqlFirst = {};
  for (const d of DIFFS) {
    const r = await q('select kmin::text lo, kmax::text hi from public.hr_bounty_first_contract_range($1)', [d]);
    sqlFirst[d] = r.length ? [Number(r[0].lo), Number(r[0].hi)] : null;
  }
  const unknownRange = (await q("select count(*)::text c from public.hr_bounty_kill_range(1,'nonsense')"))[0].c;
  const unknownFirst = (await q("select count(*)::text c from public.hr_bounty_first_contract_range('nonsense')"))[0].c;
  const tierOnly = (await q('select kmin::text lo, kmax::text hi from public.hr_bounty_kill_range(1)'))[0];

  // ── B7: gold per kill, from the LIVE reward function ──────────────────
  const gpk = {};
  for (let t = 1; t <= 6; t++) {
    for (const d of DIFFS) {
      const rw = (await q("select gold::text g from public.hr_bounty_reward($1,'cull',$2)", [t, d]))[0];
      const rg = sqlRange[`${t}:${d}`];
      gpk[`${t}:${d}`] = rg ? Number(rw.g) / ((rg[0] + rg[1]) / 2) : null;
    }
  }

  // ── B8: nobody may call the new lookups ───────────────────────────────
  const acl = await q(`select r as role_name,
      has_function_privilege(r, 'public.hr_bounty_count_mult(text)', 'execute') m,
      has_function_privilege(r, 'public.hr_bounty_kill_range(integer,text)', 'execute') k,
      has_function_privilege(r, 'public.hr_bounty_first_contract_range(text)', 'execute') f
    from unnest(array['anon','authenticated','service_role']) r`);

  // ── B4/B5/B6: a real player, a real accept ────────────────────────────
  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q("insert into auth.users (id, instance_id, aud, role, email) "
    + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
  [uid, 'bounty-diff@probe.invalid']);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await gate();
  const created = await asUser(uid, 'select public.hr_create_character(0) as r');
  const target = (await q('select monster_id from public.hr_bounty_monsters where tier = 1 order by monster_id limit 1'))[0].monster_id;

  const accept = async (d, required) => {
    await gate();
    return asUser(uid, 'select public.hr_accept_bounty(0,$1,$2,$3,$4,$5) as r',
      [`b_${d}_${required}`, target, 'cull', d, required]);
  };

  /* THE FIRST-CONTRACT GRACE IS BURNED FIRST. hr_bounty_first_contract widens
     the FLOOR while the character has fewer than BOUNTY_FIRST_CONTRACT_GRACE
     journalled cull turn-ins, so a probe that did not burn it would be testing
     the bracket while believing it was testing the tier table — the always-null
     probe family. `graceBefore`/`graceAfter` are recorded so the grading can
     see that the burn actually took. */
  const graceBefore = (await q('select public.hr_bounty_first_contract($1,0) f', [uid]))[0].f;
  const firstEasy = await accept('easy', 20);          // inside the scaled bracket
  /* The grace counts kind='bounty' + intent LIKE 'bounty_turnin:%' rows in the
     append-only journal (hr_bounty_first_contract). Written directly rather
     than by claiming three real bounties: the claim path is another migration's
     subject, and borrowing it would couple this guard to it. */
  await q(`insert into public.player_ledger (user_id, slot, kind, intent, meta)
           select $1, 0, 'bounty', 'bounty_turnin:burn', '{}'::jsonb from generate_series(1,6)`, [uid]);
  const graceAfter = (await q('select public.hr_bounty_first_contract($1,0) f', [uid]))[0].f;

  const round = {};
  const clampLo = {};
  const clampHi = {};
  for (const d of ACCEPTED) {
    const mid = Math.round((sqlRange[`1:${d}`][0] + sqlRange[`1:${d}`][1]) / 2);
    round[d] = { asked: mid, got: (await accept(d, mid))?.required };
    clampLo[d] = (await accept(d, 1))?.required;
    clampHi[d] = (await accept(d, 999999))?.required;
  }
  const elite = await accept('elite', 150);

  return { sqlRange, sqlFirst, unknownRange, unknownFirst, tierOnly, gpk, acl,
    created, round, clampLo, clampHi, elite, graceBefore, graceAfter, firstEasy };
}

function grade(o) {
  ok(o.created?.ok === true, `FIXTURE: hr_create_character refused: ${JSON.stringify(o.created)}`);
  ok(o.graceBefore === true && o.graceAfter === false,
    `FIXTURE: the first-contract grace did not burn (before=${o.graceBefore}, after=${o.graceAfter}). `
    + 'Every clamp assertion below would be measuring the wrong range.');

  // ── B1 ────────────────────────────────────────────────────────────────
  for (let t = 1; t <= 6; t++) {
    for (const d of DIFFS) {
      const sq = o.sqlRange[`${t}:${d}`];
      const js = bountyCountRange('cull', t, 2, d);
      ok(sq && sq[0] === js[0] && sq[1] === js[1],
        `B1 tier ${t} ${d}: Postgres says ${sq ? sq.join('-') : '(no row)'}, src/core/bounty.js draws `
        + `${js.join('-')}. The board would offer one contract and the turn-in demand another.`);
    }
  }
  // The base table really is what is being scaled — a control, so B1 cannot
  // pass by both sides being wrong in the same way.
  ok(o.sqlRange['1:normal'][0] === BOUNTY_KILL_COUNTS.cull[1][0]
     && o.sqlRange['1:normal'][1] === BOUNTY_KILL_COUNTS.cull[1][1],
  `B1 CONTROL: 'normal' must be the identity — it reads ${o.sqlRange['1:normal'].join('-')} `
    + `against the tier table's ${BOUNTY_KILL_COUNTS.cull[1].join('-')}.`);
  ok(o.sqlRange['1:easy'][0] < o.sqlRange['1:normal'][0]
     && o.sqlRange['1:hard'][0] > o.sqlRange['1:normal'][0]
     && o.sqlRange['1:elite'][0] > o.sqlRange['1:hard'][0],
  'B1 CONTROL: the four tier-1 floors are not strictly ordered easy < normal < hard < elite '
    + `(${DIFFS.map((d) => o.sqlRange[`1:${d}`][0]).join(', ')}) — the scale is not being applied.`);

  // ── B2 ────────────────────────────────────────────────────────────────
  for (const d of DIFFS) {
    const js = bountyCountRange('cull', 1, BOUNTY_FIRST_CONTRACT_MAX_LEVEL, d);
    ok(o.sqlFirst[d] && o.sqlFirst[d][0] === js[0] && o.sqlFirst[d][1] === js[1],
      `B2 first contract ${d}: Postgres says ${o.sqlFirst[d] ? o.sqlFirst[d].join('-') : '(no row)'}, `
      + `bounty.js draws ${js.join('-')}.`);
  }
  ok(o.sqlFirst.easy[0] < BOUNTY_FIRST_CONTRACT_COUNT[0],
    `B2 CONTROL: the EASY first-contract floor (${o.sqlFirst.easy[0]}) is not below the unscaled `
    + `bracket floor (${BOUNTY_FIRST_CONTRACT_COUNT[0]}) — the bracket is not being scaled, and the `
    + "board's first slot is always easy.");

  // ── B3 ────────────────────────────────────────────────────────────────
  ok(o.unknownRange === '0',
    `B3: hr_bounty_kill_range(1,'nonsense') returned ${o.unknownRange} row(s). An unknown difficulty `
    + 'must yield NO range so the accept refuses it — a defaulted range is a contract for a forged string.');
  ok(o.unknownFirst === '0',
    `B3: hr_bounty_first_contract_range('nonsense') returned ${o.unknownFirst} row(s).`);
  ok(Number(o.tierOnly.lo) === BOUNTY_KILL_COUNTS.cull[1][0]
     && Number(o.tierOnly.hi) === BOUNTY_KILL_COUNTS.cull[1][1],
  'B3: the one-argument hr_bounty_kill_range(tier) moved. It is the composed base of both scaled '
    + 'functions and of assertion (2) in bounty-drift.mjs.');

  // ── B4 / B5 ───────────────────────────────────────────────────────────
  for (const d of ACCEPTED) {
    const [lo, hi] = o.sqlRange[`1:${d}`];
    ok(o.round[d].got === o.round[d].asked,
      `B4 ${d}: the client asked for ${o.round[d].asked} kills and the server wrote `
      + `${o.round[d].got}. A mid-range honest draw must round-trip UNCHANGED.`);
    ok(o.clampLo[d] === lo,
      `B5 ${d}: a below-floor request clamped to ${o.clampLo[d]}, expected the SCALED floor ${lo}.`);
    ok(o.clampHi[d] === hi,
      `B5 ${d}: an above-ceiling request clamped to ${o.clampHi[d]}, expected the SCALED ceiling ${hi}.`);
  }
  ok(o.clampLo.easy < o.clampLo.normal && o.clampHi.easy < o.clampHi.normal,
    `B5 CONTROL: the ACCEPT still clamps easy and normal to the same bounds `
    + `(${o.clampLo.easy}-${o.clampHi.easy} vs ${o.clampLo.normal}-${o.clampHi.normal}) — this is `
    + 'the b489 inversion itself, measured through the real RPC.');
  ok(o.firstEasy?.ok === true && o.firstEasy?.first_contract === true,
    `B4 FIXTURE: the first-contract accept did not take the bracket: ${JSON.stringify(o.firstEasy)}`);

  // ── B6 ────────────────────────────────────────────────────────────────
  ok(o.elite?.ok === false && o.elite?.error === 'bad_difficulty',
    `B6: 'elite' must still be REFUSED at the accept (Security ruling 2026-08-23 — elite is never `
    + 'board-generated and is gated only by the client-owned Bounty-Hunter level, so every elite '
    + `reaching the server is forged, at 1.75x tradeable gold). Got ${JSON.stringify(o.elite)}`);

  // ── B7 ────────────────────────────────────────────────────────────────
  for (let t = 1; t <= 6; t++) {
    let prev = null;
    for (const d of DIFFS) {
      const v = o.gpk[`${t}:${d}`];
      ok(prev === null || v > prev,
        `B7 tier ${t}: gold-per-kill is not monotonic — ${d} pays ${v?.toFixed(3)} and the easier `
        + `difficulty paid ${prev?.toFixed(3)}. "Easy is the best contract on the board" is back.`);
      prev = v;
    }
  }
  // The two derivations must also agree with each other.
  for (const d of DIFFS) {
    const js = bountyRewards(1, 'cull', d).gold / ((bountyCountRange('cull', 1, 2, d)[0]
      + bountyCountRange('cull', 1, 2, d)[1]) / 2);
    ok(Math.abs(js - o.gpk[`1:${d}`]) < 1e-9,
      `B7 tier 1 ${d}: the client would show ${js.toFixed(3)} gold/kill, the server pays `
      + `${o.gpk[`1:${d}`].toFixed(3)}.`);
  }

  // ── B8 ────────────────────────────────────────────────────────────────
  for (const r of o.acl) {
    ok(r.m === false && r.k === false && r.f === false,
      `B8: role ${r.role_name} can execute one of the new bounty range functions `
      + `(mult=${r.m} range=${r.k} first=${r.f}). Postgres grants EXECUTE to PUBLIC on every new `
      + 'function; these are internals of a SECURITY DEFINER body and need no grant at all.');
  }
}

/** The guard, as a function, so tests/run-smoke.mjs can call it. */
export async function bountyDifficultyCountGuard() {
  problems.length = 0;
  grade(await run());
  return [...problems];
}

const argv = process.argv.slice(2);
const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/bounty-difficulty-count.mjs');
if (RUN_DIRECTLY) {
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(28)} ${m.why}`);
    process.exit(0);
  }
  const mutateArg = argv.find((a) => a.startsWith('--mutate='));
  if (argv.includes('--selftest')) {
    let bad = 0;
    for (const id of Object.keys(MUTATIONS)) {
      problems.length = 0;
      let caught = false;
      try { grade(await run(id)); caught = problems.length > 0; } catch (e) { caught = true; }
      console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${id}`);
      if (!caught) { bad++; console.log(`         ${MUTATIONS[id].why}`); }
    }
    console.log(bad ? `\n${bad} mutation(s) NOT caught — the guard is blind to them.`
      : `\nall ${Object.keys(MUTATIONS).length} mutations caught.`);
    process.exit(bad ? 1 : 0);
  }
  grade(await run(mutateArg ? mutateArg.split('=')[1] : undefined));
  if (problems.length) {
    console.error(`bounty-difficulty-count: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(mutateArg ? 0 : 1);
  }
  console.log('bounty-difficulty-count: green — Postgres and src/core/bounty.js agree on all 24 '
    + 'scaled ranges and the first-contract bracket, the accept round-trips and clamps to the '
    + 'SCALED bounds, elite is still refused, gold-per-kill rises with difficulty at every tier, '
    + 'and nothing is client-callable.');
  if (mutateArg) { console.error('the mutation was NOT caught'); process.exit(1); }
}
