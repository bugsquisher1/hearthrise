#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/gem-daily-budget.mjs — SECURITY'S BLOCKING CONDITION 1, EXECUTED
//
// The ruling, verbatim: "A delta key the engine can write must have both a
// per-call clamp and a per-day ledger-derived ceiling before the first intent
// that writes it ships. If a currency has no `*_in` column on `player_ledger`
// and no dimension in hr_day_budget_limits(), no intent may put it in a delta."
//
// What was measured before 2026-08-15-gem-daily-budget.sql: a loop of maximal
// gem applies minted 1,200,000 gems in 12 calls with ZERO refusals, while the
// byte-identical loop in the GOLD dimension was refused at call 6. Same engine,
// same clamp shape, same idempotency key — the only difference was that gold had
// a ceiling and gems did not.
//
// This file re-runs both loops against the REAL migration chain on a REAL
// PostgreSQL (PGlite/WASM, in process — no Docker, no credentials, production
// untouched) and requires:
//   · the gem loop to REFUSE at 5,000/character-day, and
//   · THE GOLD LOOP TO STILL REFUSE at 25,000,000, as the control that proves
//     the harness can see a ceiling fire at all.
// A run in which the gem loop refuses but the gold loop does not is reported as
// BROKEN, not as a pass: a harness that has stopped being able to distinguish
// the two is the "assertion that asserts nothing" this program has now recorded
// eighteen instances of.
//
// ── TWO LAYERS OF MUTATION PROOF (`--mutate`) ───────────────────────────
//   GATE runs   — the defect is planted in the MIGRATION TEXT and the file must
//                 REFUSE TO INSTALL. A bug that cannot be applied beats a bug
//                 that is detected at runtime.
//   RED runs    — the same defects are installed AFTER a clean chain, over the
//                 top of the migration's own self-checks, so the migration
//                 cannot be the thing that catches them. THIS FILE must be. A
//                 mutation that is only ever caught by the migration proves the
//                 migration works and proves nothing about this test.
// Every RED run additionally asserts the gold control still refuses, so
// "everything broke" cannot masquerade as "the mutation was caught".
//
// ── WHAT THIS CANNOT SEE ────────────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend. The budget's serialisation rests
//     on hr_apply's advisory lock plus hr_day_budget_used being VOLATILE; the
//     volatility is asserted (by the migration, from pg_proc), the race is not
//     run here. tools/race-test.mjs is the tool that races.
//   · THE HONEST MAXIMUM. 780 gems/character-day is measured on the gold-grant
//     branch, where claim_reward lives; there is no gem faucet in this tree to
//     execute. tests/accrual-engine.mjs' dayBudgetGuard owes this dimension a
//     measured headroom check when claim_reward merges.
//
// Exit codes: 0 = clean · 1 = a check failed · 2 = harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';

const MIGFILE = join(ROOT, 'supabase', 'migrations', '2026-08-15-gem-daily-budget.sql');
const MUTATE = process.argv.includes('--mutate');

// The two numbers this file is about. Read out of the migration rather than
// retyped, so a re-priced ceiling moves the test with it and a test that has
// drifted from the file cannot report green.
const migSql = (await readFile(MIGFILE, 'utf8')).replace(/\r\n/g, '\n');
const numFromMig = (name) => {
  const m = migSql.match(new RegExp(`${name}\\s+constant\\s+bigint\\s*:=\\s*(\\d+)`));
  if (!m) {
    console.error(`HARNESS: cannot read ${name} out of the migration — the test would be vacuous.`);
    process.exit(2);
  }
  return Number(m[1]);
};
const GEM_CEIL = numFromMig('c_day_gems_budget');
const GOLD_CEIL = numFromMig('c_day_gold_budget');
const GEM_CLAMP = numFromMig('c_max_gem_delta');

let failures = 0;
const ok = (cond, msg, detail) => {
  if (cond) { console.log(`  ok    ${msg}`); return true; }
  failures++;
  console.error(`  FAIL  ${msg}${detail === undefined ? '' : `\n          ${detail}`}`);
  return false;
};

// ── a driver for one character ──────────────────────────────────────────
async function harness(db) {
  let n = 0;
  const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

  async function character(id, slot = 0) {
    await db.query('insert into auth.users(id) values ($1) on conflict do nothing', [id]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    const r = (await db.query('select hr_create_character($1) r', [slot])).rows[0].r;
    if (r.created !== true) throw Object.assign(new Error(`hr_create_character: ${JSON.stringify(r)}`), { harness: true });
    return id;
  }

  async function version(id, slot = 0) {
    const r = await db.query('select version from player_state where user_id=$1 and slot=$2', [id, slot]);
    return Number(r.rows[0].version);
  }

  async function apply(id, slot, delta) {
    const v = await version(id, slot);
    await db.exec('set role hr_engine');
    let r;
    try {
      r = (await db.query('select hr_apply($1,$2,$3,$4,$5::text::jsonb) r',
        [id, slot, v, crypto.randomUUID(), JSON.stringify(delta)])).rows[0].r;
    } catch (e) {
      // A RAISE out of hr_apply (the fail-closed HR351) is a legitimate outcome
      // and must be reported as one, not swallowed into "refused".
      r = { ok: false, error: 'RAISED', raised: String(e.message || e).split('\n')[0] };
    } finally {
      await db.exec('reset role').catch(() => {});
    }
    return r;
  }

  /* Drive `per`-sized mints of one currency until the server refuses, and report
     what it minted and why it stopped. `cap` bounds the loop so a MISSING
     ceiling terminates (and is reported as "never refused") instead of hanging. */
  async function loop(id, slot, key, per, cap) {
    let minted = 0, calls = 0, stop = null;
    for (let i = 0; i < cap; i++) {
      const r = await apply(id, slot, { [key]: per, journal: { kind: 'admin', intent: `b351:${key}` } });
      calls++;
      if (r.ok !== true) { stop = r; break; }
      minted += per;
    }
    return { minted, calls, stop };
  }

  const state = async (id, slot, col) =>
    Number((await db.query(`select ${col} from player_state where user_id=$1 and slot=$2`, [id, slot])).rows[0][col]);

  return { uid, character, apply, loop, state, version, db };
}

// ── THE ACCEPTANCE RUN ──────────────────────────────────────────────────
// Returns a verdict object so the mutation runs can grade the same legs.
async function acceptance(H, label) {
  const out = {};
  console.log(`\n── ${label}`);

  // Leg 1 — Security's own scenario: maximal gem applies, one after another.
  const c1 = await H.character(H.uid());
  out.clampLoop = await H.loop(c1, 0, 'gems', GEM_CLAMP, 12);
  console.log(`     ${GEM_CLAMP.toLocaleString()}/call x${out.clampLoop.calls}: minted `
    + `${out.clampLoop.minted.toLocaleString()} gems, stopped on `
    + `${out.clampLoop.stop ? out.clampLoop.stop.error + (out.clampLoop.stop.dim ? `/${out.clampLoop.stop.dim}` : '') : 'NOTHING'}`);

  // Leg 2 — the ceiling's VALUE, at a granularity that can express it.
  const c2 = await H.character(H.uid());
  const per = GEM_CEIL / 5;
  out.fineLoop = await H.loop(c2, 0, 'gems', per, 40);
  console.log(`     ${per.toLocaleString()}/call x${out.fineLoop.calls}: minted `
    + `${out.fineLoop.minted.toLocaleString()} gems, stopped on `
    + `${out.fineLoop.stop ? out.fineLoop.stop.error + (out.fineLoop.stop.dim ? `/${out.fineLoop.stop.dim}` : '') : 'NOTHING'}`);

  // Leg 3 — THE CONTROL. The gold ceiling has been live since C5/X3 and is
  // untouched by this change; if it stops firing, this harness is broken and no
  // verdict it produces about gems means anything.
  const c3 = await H.character(H.uid());
  out.goldLoop = await H.loop(c3, 0, 'gold', GOLD_CEIL / 25, 40);
  console.log(`     CONTROL gold ${(GOLD_CEIL / 25).toLocaleString()}/call x${out.goldLoop.calls}: minted `
    + `${out.goldLoop.minted.toLocaleString()}, stopped on `
    + `${out.goldLoop.stop ? out.goldLoop.stop.error + (out.goldLoop.stop.dim ? `/${out.goldLoop.stop.dim}` : '') : 'NOTHING'}`);

  // Leg 4 — the ledger is the ONLY input. What the sum saw must equal what was
  // paid; a check that passes over rows nobody stamped is a ceiling that resets
  // on every apply.
  out.stamped = Number((await H.db.query(
    'select coalesce(sum(gems_in),0) s from player_ledger where user_id=$1 and slot=0', [c2])).rows[0].s);

  // Leg 5 — dimension independence: gold still pays on the character whose GEM
  // budget is spent.
  out.goldAfterGems = await H.apply(c2, 0, { gold: 1000, journal: { kind: 'admin', intent: 'b351:mix' } });

  // Leg 6 — gross, not net: spend the gems back and try to mint again.
  out.spend = await H.apply(c2, 0, { gems: -out.fineLoop.minted, journal: { kind: 'admin', intent: 'b351:spend' } });
  out.mintAfterSpend = await H.apply(c2, 0, { gems: 1, journal: { kind: 'admin', intent: 'b351:regain' } });

  // Leg 7 — the per-call clamp still wins above its own limit, so `gem_clamp`
  // ("this ONE delta is insane") is still reachable and still the more specific
  // diagnosis. The ordering inside hr_apply is what makes that true.
  const c4 = await H.character(H.uid());
  out.overClamp = await H.apply(c4, 0, { gems: GEM_CLAMP + 1, journal: { kind: 'admin', intent: 'b351:clamp' } });

  return out;
}

function grade(v, { expectGemCeiling = true } = {}) {
  // THE CONTROL FIRST. Everything below is meaningless without it.
  const control = ok(v.goldLoop.stop && v.goldLoop.stop.error === 'daily_budget' && v.goldLoop.stop.dim === 'gold'
      && v.goldLoop.minted === GOLD_CEIL,
    `CONTROL: the gold ceiling still refuses at ${GOLD_CEIL.toLocaleString()}/day`,
    `minted ${v.goldLoop.minted}, stop ${JSON.stringify(v.goldLoop.stop)}`);
  if (!control) {
    console.error('          ↑ the harness cannot see a ceiling fire at all. No gem verdict below is trustworthy.');
    return;
  }

  if (!expectGemCeiling) return;

  ok(v.clampLoop.stop && v.clampLoop.stop.error === 'daily_budget' && v.clampLoop.stop.dim === 'gems'
     && v.clampLoop.minted === 0,
    `a ${GEM_CLAMP.toLocaleString()}-gem apply is refused on the FIRST call (Security minted 1,200,000 in 12)`,
    `minted ${v.clampLoop.minted} in ${v.clampLoop.calls} call(s), stop ${JSON.stringify(v.clampLoop.stop)}`);

  ok(v.fineLoop.minted === GEM_CEIL,
    `the gem ceiling is exactly ${GEM_CEIL.toLocaleString()}/character-day`,
    `minted ${v.fineLoop.minted}`);
  ok(v.fineLoop.stop && v.fineLoop.stop.error === 'daily_budget' && v.fineLoop.stop.dim === 'gems'
     && Number(v.fineLoop.stop.limit) === GEM_CEIL && Number(v.fineLoop.stop.used) === GEM_CEIL,
    'the refusal names dim/used/limit so a fired fuse is diagnosable from the response',
    JSON.stringify(v.fineLoop.stop));

  ok(v.stamped === GEM_CEIL,
    `player_ledger.gems_in sums to ${GEM_CEIL.toLocaleString()} — what was CHECKED is what was CHARGED`,
    `sum(gems_in) = ${v.stamped}`);

  ok(v.goldAfterGems.ok === true,
    'CONTROL: a gold mint still succeeds on a character whose gem budget is spent (per-dimension, not a lockout)',
    JSON.stringify(v.goldAfterGems));

  ok(v.spend.ok === true,
    'CONTROL: a gem SPEND still succeeds after the ceiling is reached (zero gross inflow short-circuits)',
    JSON.stringify(v.spend));
  ok(v.mintAfterSpend.error === 'daily_budget',
    'spending does NOT buy back budget — the sum is GROSS inflow, not net',
    `got ${v.mintAfterSpend.error || `ok:${v.mintAfterSpend.ok}`} — a signed sum would make the `
    + 'ceiling a reset button');

  ok(v.overClamp.error === 'gem_clamp',
    `a ${(GEM_CLAMP + 1).toLocaleString()}-gem delta still answers gem_clamp, not daily_budget `
    + '(the per-call clamp stays reachable and keeps the more specific diagnosis)',
    JSON.stringify(v.overClamp));
}

// ── mutations ───────────────────────────────────────────────────────────
// GATE mutations are planted in the migration text; the file must refuse.
const GATES = {
  check_ignores_gems: {
    what: 'hr_apply computes the gem inflow and then passes 0 to the ceiling check',
    find: 'v_bud := public.hr_day_budget_check(v_uid, v_slot, v_gold_in, v_xp_in, v_qty_in, v_gems_in);',
    with: 'v_bud := public.hr_day_budget_check(v_uid, v_slot, v_gold_in, v_xp_in, v_qty_in, 0);',
  },
  limits_drop_gems: {
    what: 'hr_day_budget_limits() stops declaring a gems dimension',
    find: "    'gems', c_day_gems_budget);",
    with: "    'gems', 0);",
  },
  ledger_not_stamped: {
    what: 'hr_apply checks the ceiling and then writes a NULL gems_in, so the sum never grows',
    find: '       v_gold_in, v_xp_in, v_qty_in, v_gems_in,',
    with: '       v_gold_in, v_xp_in, v_qty_in, null,',
  },
};

// RED mutations are installed AFTER a clean chain, so the migration's own
// self-checks cannot be the thing that catches them. This file must be.
const REDS = {
  dimension_disabled: {
    what: 'the gems dimension is removed from hr_day_budget_limits AND from the check (the exact '
        + '"disable the gems dimension" mutation Security asked for)',
    sql: async () => `
create or replace function public.hr_day_budget_limits()
returns jsonb language sql immutable set search_path = public as
$f$ select jsonb_build_object('gold', 25000000, 'xp', 40000000, 'qty', 1000000, 'gems', 0) $f$;
create or replace function public.hr_day_budget_check(
  p_user uuid, p_slot int,
  p_gold_in bigint, p_xp_in bigint, p_qty_in bigint, p_gems_in bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $f$
declare
  v_lim jsonb; v_used jsonb;
  v_g bigint := greatest(0, coalesce(p_gold_in, 0));
begin
  if v_g = 0 then return null; end if;
  v_lim := public.hr_day_budget_limits();
  v_used := public.hr_day_budget_used(p_user, p_slot, now());
  if (v_used->>'gold')::bigint + v_g > (v_lim->>'gold')::bigint then
    return jsonb_build_object('dim','gold','used',(v_used->>'gold')::bigint,'add',v_g,
                              'limit',(v_lim->>'gold')::bigint,'day',v_used->>'day');
  end if;
  return null;
end $f$;`,
  },
  used_blind_to_gems: {
    what: 'hr_day_budget_used reports gems=0 forever — the ceiling is checked against a sum that '
        + 'cannot grow',
    sql: async () => `
create or replace function public.hr_day_budget_used(
  p_user uuid, p_slot int, p_at timestamptz default now())
returns jsonb language plpgsql volatile security definer set search_path = public as $f$
declare v_out jsonb;
begin
  select jsonb_build_object(
           'gold', coalesce(sum(gold_in), 0), 'xp', coalesce(sum(xp_in), 0),
           'qty', coalesce(sum(qty_in), 0), 'gems', 0,
           'rows', count(*), 'day', public.hr_utc_day_key(p_at))
    into v_out from public.player_ledger
   where user_id = p_user and slot = p_slot
     and at >= public.hr_utc_day_start(p_at)
     and at <  public.hr_utc_day_start(p_at) + interval '1 day';
  return v_out;
end $f$;`,
  },
  apply_stamps_null: {
    what: 'hr_apply passes the check and then stamps a NULL gems_in, so every apply starts from zero',
    // The body is the REAL one out of the migration, with one word changed —
    // retyping 56 KB of hr_apply to plant a one-line defect is how a mutation
    // stops modelling the thing it is mutating.
    sql: async () => {
      const start = migSql.indexOf('create or replace function public.hr_apply(');
      const end = migSql.indexOf('\nend $$;\n', start);
      if (start < 0 || end < 0) throw Object.assign(new Error('cannot extract hr_apply from the migration'), { harness: true });
      const fn = migSql.slice(start, end + '\nend $$;\n'.length);
      const find = '       v_gold_in, v_xp_in, v_qty_in, v_gems_in,';
      if (fn.split(find).length - 1 !== 1) {
        throw Object.assign(new Error('the gems_in ledger anchor did not match exactly once'), { harness: true });
      }
      return fn.replace(find, '       v_gold_in, v_xp_in, v_qty_in, null,');
    },
  },
};

// ── run ─────────────────────────────────────────────────────────────────
const t0 = Date.now();
try {
  console.log(`gem daily budget — ceiling ${GEM_CEIL.toLocaleString()}/character-day, `
    + `per-call clamp ${GEM_CLAMP.toLocaleString()}, gold control ${GOLD_CEIL.toLocaleString()}`);

  const { db } = await bootReplay();
  const H = await harness(db);
  grade(await acceptance(H, 'CLEAN CHAIN'));

  if (MUTATE) {
    for (const [name, m] of Object.entries(GATES)) {
      console.log(`\n── GATE ${name}`);
      console.log(`     ${m.what}`);
      let installed = false, why = '';
      try {
        await bootReplay({
          patches: new Map([['2026-08-15-gem-daily-budget.sql', [[m.find, m.with]]]]),
        });
        installed = true;
      } catch (e) {
        if (e.harness) throw e;
        why = String(e.message || e).split('\n').slice(0, 3).join(' ');
      }
      ok(!installed,
        `the migration REFUSES to install with this defect (a bug that cannot be applied beats one that is detected)`,
        installed ? 'IT INSTALLED CLEANLY — the self-check does not cover this' : undefined);
      if (!installed) console.log(`          refused with: ${why.slice(0, 200)}`);
    }

    for (const [name, m] of Object.entries(REDS)) {
      console.log(`\n── RED ${name}`);
      console.log(`     ${m.what}`);
      const boot = await bootReplay();
      await boot.db.exec(await m.sql());
      const H2 = await harness(boot.db);
      const before = failures;
      const v = await acceptance(H2, `RED ${name} — this run MUST fail`);
      // Grade with the gem expectation ON: these assertions are supposed to break.
      grade(v);
      const caught = failures > before;
      // Undo the bookkeeping — a RED run failing is the PASS.
      failures = before;
      ok(caught,
        `this test goes RED when the mutation is installed`,
        'THE MUTATION SLIPPED. This file cannot see the defect it exists to see, so a green run '
        + 'here proves nothing about the gem ceiling.');
      // …and the control must still have fired inside that run, or "everything
      // broke" is being read as "the mutation was caught".
      ok(v.goldLoop.stop && v.goldLoop.stop.dim === 'gold' && v.goldLoop.minted === GOLD_CEIL,
        'CONTROL inside the RED run: the gold ceiling still fired',
        JSON.stringify(v.goldLoop.stop));
    }
  }
} catch (e) {
  console.error(`\n${e.replay ? 'CHAIN' : e.harness ? 'HARNESS' : 'ERROR'}: ${e.message}`);
  process.exit(e.harness ? 2 : 1);
}

console.log(`\n${failures ? `${failures} check(s) failed` : 'gem daily budget: all checks passed'}`
  + ` (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(failures ? 1 : 0);
