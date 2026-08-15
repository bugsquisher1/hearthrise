#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/auto-eat-authority.mjs — hr_set_auto_eat, EXECUTED.
//
// tests/schema-drift.mjs already proves the migration APPLIES and that its
// self-verifying block has teeth. That is a claim about SHAPE. This is the
// claim about BEHAVIOUR: what the function does when a player, or something
// pretending to be one, actually calls it.
//
// It runs in process against a REAL PostgreSQL (PGlite/WASM, PG 18) with the
// real migration files applied verbatim. Nothing on the server side is
// stubbed; the only scaffolding is tests/sql/pglite-fixture.sql (auth.uid,
// auth.users, profiles, the pg_cron shim, the four Supabase roles), which the
// rest of the SQL suite already uses.
//
// ── EVERY REFUSAL IS PAIRED WITH A CONTROL ──────────────────────────────
// This repo is at instance #15 of "assertions that pass while asserting
// nothing". A test that only proves `hr_set_auto_eat` says no would pass just
// as happily against a function that says no to EVERYTHING — including to the
// player trying to switch their own auto-eat on. So every `expect a refusal`
// below is immediately followed by the nearest legal call, which must SUCCEED.
// If a control ever goes red, the refusals above it mean nothing.
//
// Run standalone:  node tests/auto-eat-authority.mjs
// Also invoked as a preflight by tests/run-smoke.mjs.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG = (f) => join(ROOT, 'supabase', 'migrations', f);

/* The bundle, in apply order. auto-eat replaces hr_state_of, so it must be
   last; it reads hr_items.auto_eatable, so the catalogue must precede it. */
const MIGRATIONS = [
  ['player-state', MIG('2026-08-11-player-state.sql')],
  ['catalogue', MIG('2026-08-11-catalogue.generated.sql')],
  ['daily-budget', MIG('2026-08-11-daily-budget.sql')],
  ['apply-engine', MIG('2026-08-11-apply-engine.sql')],
  ['auto-eat', MIG('2026-08-15-auto-eat.sql')],
];

const USER = '00000000-0000-4000-b000-c5c5c5c5c5c5';

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

async function boot() {
  let PGlite;
  /* ⚠ THROW, NEVER process.exit(). This guard is imported by
     tests/run-smoke.mjs, and the first version called `process.exit(2)` here —
     which killed the ENTIRE suite mid-run the one time the package briefly
     failed to resolve, taking 684 unrelated results with it and printing no
     verdict at all. A guard that cannot run must fail loudly as ONE guard; it
     must never decide the outcome of the others. (The standalone entry point at
     the bottom still exits non-zero, which is what CI reads.)
     Deliberately NOT a silent skip: an unrunnable guard that reports success is
     the always-null probe this repo keeps finding. */
  try { ({ PGlite } = await import('@electric-sql/pglite')); }
  catch {
    throw new Error(
      '@electric-sql/pglite is not installed, so the auto-eat authority guard could not run. '
      + 'It exercises a real PostgreSQL in process; without it a "pass" would assert nothing. '
      + 'Install it:  npm i -D @electric-sql/pglite');
  }
  const db = await PGlite.create();
  const fixture = await readFile(join(ROOT, 'tests', 'sql', 'pglite-fixture.sql'), 'utf8');
  await db.exec(fixture);
  /* hr_utc_day_key is a PRE-EXISTING production object (2026-08-08-clan-seat.sql)
     that daily-budget fails closed without. Lifted by its EXACT BYTES rather
     than restated, so there is never a second definition of "what a UTC day
     is" in the tree. Same technique, and the same reasoning, as
     tests/conservation-fuzz.mjs. */
  const seat = await readFile(MIG('2026-08-08-clan-seat.sql'), 'utf8');
  const dayKey = seat.match(/create or replace function public\.hr_utc_day_key[\s\S]*?\$\$;/);
  if (!dayKey) throw new Error('could not lift hr_utc_day_key out of 2026-08-08-clan-seat.sql');
  await db.exec(dayKey[0]);
  await db.exec(`revoke execute on function public.hr_utc_day_key(timestamptz)
                   from public, anon, authenticated, service_role`);
  for (const [, path] of MIGRATIONS) {
    await db.exec((await readFile(path, 'utf8')).replace(/\r\n/g, '\n'));
  }
  return db;
}

/* Call as the PLAYER. The fixture's auth.uid() reads `request.jwt.claim.sub`,
   which is the GUC Supabase surfaces the JWT subject on — same seam
   tests/conservation-fuzz.mjs uses, so the identity path under test is the one
   the migrations are written against. */
async function asPlayer(db, sql, params = []) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [USER]);
  const r = await db.query(sql, params);
  return r.rows[0];
}

const setEat = (db, args) => asPlayer(db,
  'select public.hr_set_auto_eat($1::int,$2::boolean,$3::text,$4::int,$5::boolean) as r',
  [args.slot ?? 0, args.enabled ?? null, args.food ?? null, args.pct ?? null, args.clear ?? false],
).then((row) => row.r);

async function run() {
  const db = await boot();

  // ── A character, created by the SERVER's own RPC. ──────────────────────
  const created = await asPlayer(db, 'select public.hr_create_character(0) as r');
  ok(created.r?.ok === true, `SETUP: hr_create_character failed — ${JSON.stringify(created.r)}`);

  // Two foods out of the REAL catalogue, never invented: one Provision and one
  // Feast. The Feast is the point — it HEALS, so any check written as
  // `heals > 0` would accept it, and auto-eat must never burn one (b220).
  const foods = await db.query(`
    select (select item_id from public.hr_items where auto_eatable order by heals desc limit 1) as provision,
           (select item_id from public.hr_items where coalesce(heals,0) > 0 and not auto_eatable
             order by heals desc limit 1) as feast,
           (select item_id from public.hr_items where coalesce(heals,0) = 0 order by item_id limit 1) as inedible`);
  const { provision, feast, inedible } = foods.rows[0];
  ok(!!provision, 'SETUP: the catalogue has no auto-eatable item at all');
  ok(!!feast, 'SETUP: the catalogue has no healing-but-not-auto-eatable item — the b220 rule is untested');

  // ── 1. THE ENTITLEMENT GATE ────────────────────────────────────────────
  // A fresh character does not own the Auto-Eat trait (100 Bounty Marks), so
  // switching it on must be refused. This is the assertion that stops the
  // accrual handler from handing a paid trait to everyone.
  let r = await setEat(db, { enabled: true });
  ok(r?.error === 'trait_not_owned',
    `GATE: enabling without the trait returned ${JSON.stringify(r)} — expected trait_not_owned`);
  let st = await db.query('select auto_eat_enabled from public.player_state where user_id=$1 and slot=0', [USER]);
  ok(st.rows[0].auto_eat_enabled === false,
    'GATE: the refusal still wrote auto_eat_enabled — a rejection that mutates is not a rejection');

  // ...and settings that are NOT the entitlement still apply while it is off,
  // so the gate is scoped to the switch rather than to the whole function.
  r = await setEat(db, { pct: 30, food: provision });
  ok(r?.ok === true, `GATE: setting pct/food without the trait was refused — ${JSON.stringify(r)}`);

  // THE CONTROL. Grant the trait the way the server will — a `flag` progress
  // row — and the identical call must now succeed. Without this, every
  // assertion above is satisfied by a function that refuses everything.
  await db.query(`insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
                  values ($1, 0, 'flag', 'trait:auto_eat', 1, '', 'done')`, [USER]);
  r = await setEat(db, { enabled: true });
  ok(r?.ok === true, `CONTROL: enabling WITH the trait was refused — ${JSON.stringify(r)}`);
  st = await db.query('select auto_eat_enabled, auto_eat_pct, auto_eat_food from public.player_state where user_id=$1 and slot=0', [USER]);
  ok(st.rows[0].auto_eat_enabled === true, 'CONTROL: the successful enable did not persist');
  ok(st.rows[0].auto_eat_pct === 30, `CONTROL: pct is ${st.rows[0].auto_eat_pct}, expected the 30 set earlier`);

  // Turning it OFF must never require the trait — a player must always be able
  // to stop their food being eaten.
  await db.query(`delete from public.player_progress where user_id=$1 and key='trait:auto_eat'`, [USER]);
  r = await setEat(db, { enabled: false });
  ok(r?.ok === true, `GATE: disabling was refused without the trait — ${JSON.stringify(r)}`);
  await db.query(`insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
                  values ($1, 0, 'flag', 'trait:auto_eat', 1, '', 'done')`, [USER]);
  await setEat(db, { enabled: true });

  /* ── 1b. THE SLOT ───────────────────────────────────────────────────────
     Every out-of-range slot is refused, and a legal-but-unoccupied one gets a
     DIFFERENT verdict, so `bad_slot` is not this function's answer to
     everything.

     ⚠ AND A CORRECTION, recorded because the first version of this comment was
       wrong and my own mutation caught it. I claimed the slot check had to
       precede `pg_advisory_xact_lock` because a NULL key "would be reached".
       Moving the check AFTER the lock leaves this whole section GREEN, so the
       ordering is defence in depth, not the control.
       What IS true, verified on the live database rather than inferred:
       `pg_advisory_xact_lock(bigint)` is STRICT — `select
       pg_advisory_xact_lock(null::bigint)` returns NULL with
       `count(*) from pg_locks where locktype='advisory'` = 0. So a NULL key
       does not raise; it silently takes NO LOCK. That is the failure mode worth
       naming: if the range check ever moves below the lock, the damage is not an
       error, it is a character that quietly stops being serialised against a
       concurrent accrual. Keeping the check first is what keeps that
       unreachable. */
  for (const bad of [null, -1, 6, 999]) {
    const rr = await asPlayer(db,
      'select public.hr_set_auto_eat($1::int, true, null, null, false) as r', [bad]);
    ok(rr.r?.error === 'bad_slot',
      `SLOT: slot ${bad} returned ${JSON.stringify(rr.r)} — expected bad_slot before the lock is taken`);
  }
  // CONTROL: a legal slot the player does NOT own is a different verdict, so
  // "bad_slot" is not this function's answer to everything.
  const noChar = await asPlayer(db,
    'select public.hr_set_auto_eat(3::int, true, null, null, false) as r');
  ok(noChar.r?.error === 'no_character',
    `SLOT: an unoccupied but legal slot returned ${JSON.stringify(noChar.r)} — expected no_character`);

  // ── 2. THE FOOD CATALOGUE ──────────────────────────────────────────────
  r = await setEat(db, { food: '__not_an_item__' });
  ok(r?.error === 'unknown_item', `FOOD: an unknown id returned ${JSON.stringify(r)}`);
  r = await setEat(db, { food: feast });
  ok(r?.error === 'not_auto_eatable',
    `FOOD: a Feast (${feast}, heals but foodClass:buff) was accepted as a nominated food — ${JSON.stringify(r)}`);
  if (inedible) {
    r = await setEat(db, { food: inedible });
    ok(r?.error === 'not_auto_eatable', `FOOD: a non-food (${inedible}) was accepted — ${JSON.stringify(r)}`);
  }
  // CONTROL: a real Provision is accepted, so the three refusals above are not
  // "this function rejects every food".
  r = await setEat(db, { food: provision });
  ok(r?.ok === true, `CONTROL: a Provision (${provision}) was refused — ${JSON.stringify(r)}`);
  // ...and it can be cleared back to "best in the bag", which is a distinct
  // operation from "leave it alone" and needs its own flag.
  r = await setEat(db, { clear: true });
  ok(r?.ok === true, `FOOD: clearing the nomination was refused — ${JSON.stringify(r)}`);
  st = await db.query('select auto_eat_food from public.player_state where user_id=$1 and slot=0', [USER]);
  ok(st.rows[0].auto_eat_food === null, 'FOOD: p_clear_food did not clear the nomination');
  await setEat(db, { food: provision });

  // ── 3. THE THRESHOLD ───────────────────────────────────────────────────
  for (const bad of [101, 1000, -1]) {
    r = await setEat(db, { pct: bad });
    ok(r?.error === 'bad_pct', `PCT: ${bad} returned ${JSON.stringify(r)} — expected bad_pct`);
  }
  // CONTROL, and it is the b326 regression: 0 must be SETTABLE and must STICK.
  // "Never auto-eat" is a real choice, and the bug this replaces turned it into
  // 50% via a falsy-coalesce on a number.
  for (const good of [0, 100, 55]) {
    r = await setEat(db, { pct: good });
    ok(r?.ok === true, `CONTROL: pct ${good} was refused — ${JSON.stringify(r)}`);
    st = await db.query('select auto_eat_pct from public.player_state where user_id=$1 and slot=0', [USER]);
    ok(st.rows[0].auto_eat_pct === good,
      `CONTROL: pct ${good} did not persist (read back ${st.rows[0].auto_eat_pct})`);
  }

  // ── 4. THE VERSION BUMP ────────────────────────────────────────────────
  // These three columns PRICE an absence. An accrual in flight with the old
  // version must be forced to re-read rather than pay at the old settings.
  const v0 = (await db.query('select version from public.player_state where user_id=$1 and slot=0', [USER])).rows[0].version;
  await setEat(db, { pct: 45 });
  const v1 = (await db.query('select version from public.player_state where user_id=$1 and slot=0', [USER])).rows[0].version;
  ok(Number(v1) > Number(v0), `VERSION: a settings change left version at ${v1} — an in-flight accrual would pay at the old settings`);
  // A REFUSED call must not bump it, or a spammed rejection is a free way to
  // invalidate somebody's optimistic concurrency token.
  await setEat(db, { pct: 999 });
  const v2 = (await db.query('select version from public.player_state where user_id=$1 and slot=0', [USER])).rows[0].version;
  ok(Number(v2) === Number(v1), `VERSION: a REFUSED call bumped version ${v1} -> ${v2}`);

  // ── 5. collect_first — the S5 lever, closed ────────────────────────────
  // Auto-eat prices a whole window. Changing it mid-absence and then collecting
  // would pay the night as if the new setting had been true throughout — the
  // same shape as the equipment-at-collect over-payment, and up to 98x here.
  await db.query(`update public.player_state
                     set active_kind='combat', active_id='goblin',
                         active_since = now() - interval '3 hours',
                         accrued_to   = now() - interval '3 hours'
                   where user_id=$1 and slot=0`, [USER]);
  r = await setEat(db, { pct: 70 });
  ok(r?.error === 'collect_first',
    `S5: a settings change with 3 unpaid hours returned ${JSON.stringify(r)} — expected collect_first`);
  ok(Number(r?.detail?.unpaid_ms) > 3 * 3600000 - 5000,
    `S5: collect_first reported unpaid_ms=${r?.detail?.unpaid_ms}, expected ~3h so the client can say why`);
  st = await db.query('select auto_eat_pct from public.player_state where user_id=$1 and slot=0', [USER]);
  ok(st.rows[0].auto_eat_pct === 45, 'S5: the refused mid-absence change was written anyway');

  // CONTROL A — the same call, once the watermark is current (i.e. just
  // collected). Nothing is unpaid, so nothing can be over-paid.
  await db.query('update public.player_state set accrued_to = now() where user_id=$1 and slot=0', [USER]);
  r = await setEat(db, { pct: 70 });
  ok(r?.ok === true, `CONTROL: a settings change right after a collect was refused — ${JSON.stringify(r)}`);
  // CONTROL B — an IDLE character is never blocked, however stale the
  // watermark, because an idle absence accrues nothing to over-pay.
  await db.query(`update public.player_state
                     set active_kind='idle', active_id=null,
                         accrued_to = now() - interval '40 hours'
                   where user_id=$1 and slot=0`, [USER]);
  r = await setEat(db, { pct: 25 });
  ok(r?.ok === true, `CONTROL: an idle character with a 40h-old watermark was blocked — ${JSON.stringify(r)}`);

  // ── 6. THE ENVELOPE ────────────────────────────────────────────────────
  // hr_state_of was transcribed by hand into the migration. Prove it still
  // returns everything, by CALLING it — the migration's own check reads the
  // function source, which is a weaker claim than this one.
  const env = (await db.query('select public.hr_state_of($1::uuid, 0) as e', [USER])).rows[0].e;
  ok(env?.ok === true, `ENVELOPE: hr_state_of returned ${JSON.stringify(env)?.slice(0, 120)}`);
  for (const k of ['version', 'now', 'state', 'skills', 'inventory', 'equipment',
                   'farm', 'progress', 'progress_truncated', 'total_level']) {
    ok(k in env, `ENVELOPE: hr_state_of no longer returns '${k}' — the migration shortened the client's world`);
  }
  for (const k of ['slot', 'gold', 'gems', 'hearth_tokens', 'hp', 'max_hp', 'bank_cap',
                   'active_kind', 'active_id', 'active_since', 'accrued_to',
                   'auto_eat_enabled', 'auto_eat_food', 'auto_eat_pct']) {
    ok(k in env.state, `ENVELOPE: hr_state_of.state is missing '${k}'`);
  }
  ok(env.state.auto_eat_enabled === true && env.state.auto_eat_pct === 25,
    `ENVELOPE: the auto-eat values do not match the row (${JSON.stringify(env.state.auto_eat_pct)})`);

  // ── 7. WHO MAY CALL IT ─────────────────────────────────────────────────
  // The engine must not be able to switch a purchased trait on for somebody.
  // Asserted by EXECUTING as the role, not by reading a grant table — and
  // paired with the control that `authenticated` genuinely can.
  await db.exec('set role hr_engine');
  let denied = false;
  try { await db.query('select public.hr_set_auto_eat(0, true, null, null, false)'); }
  catch (e) { denied = /permission denied/i.test(String(e?.message || e)); }
  await db.exec('reset role');
  ok(denied, 'GRANT: hr_engine could EXECUTE hr_set_auto_eat — a compromised engine could grant a paid trait');

  await db.exec('set role authenticated');
  let allowed = false;
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [USER]);
    const rr = await db.query('select public.hr_set_auto_eat(0, null, null, 35, false) as r');
    allowed = rr.rows[0].r?.ok === true;
  } catch (e) { allowed = false; problems.push(`CONTROL: authenticated could not call it — ${e?.message}`); }
  await db.exec('reset role');
  ok(allowed, 'CONTROL: `authenticated` cannot call hr_set_auto_eat — the refusal above proves nothing');

  // ── 8. THE JOURNAL ─────────────────────────────────────────────────────
  const led = await db.query(
    `select count(*)::int n from public.player_ledger where user_id=$1 and intent='set_auto_eat'`, [USER]);
  ok(led.rows[0].n > 0, 'JOURNAL: no ledger row for a settings change — "my food vanished" is unanswerable');

  await db.close?.();
}

export async function autoEatAuthorityGuard() {
  problems.length = 0;
  try { await run(); }
  catch (e) { problems.push(`auto-eat authority guard failed to run — ${e?.message || e}`); }
  return problems.slice();
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const ps = await autoEatAuthorityGuard();
  if (ps.length) {
    console.log('auto-eat authority guard — FAILED:');
    for (const p of ps) console.log('  x ' + p);
    process.exit(1);
  }
  console.log('Auto-eat authority guard — the entitlement gate, the catalogue, the threshold, '
    + 'collect_first and the grants all hold, each against a control.');
}
