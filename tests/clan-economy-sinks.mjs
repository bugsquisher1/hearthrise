#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/clan-economy-sinks.mjs — CONSERVATION guards for the 2026-08-27
// economy-sinks migration (clan_contribute gold debit, clan_feast_deposit food
// debit, buy_listing removal).
//
// Same technique as tests/clan-journal-guard.mjs: boot a REAL PostgreSQL
// (PGlite) with the full clan chain applied, APPEND this migration via bootChain's
// `extra` seam, then CALL the real RPCs as a real signed-in caller and read the
// books. Nothing is asserted from migration text; every claim is behavioural.
//
// WHAT IS PROVEN
//   · clan_contribute debits the caller's player_state.gold by EXACTLY the
//     accepted amount, credits the treasury by the same, and journals the
//     outflow — value is conserved, not minted (the P1 free-mint is closed);
//   · a contribution that exceeds the caller's gold is REFUSED with nothing
//     moved on either side;
//   · the 10M/call + 10M/day clamps and the level cascade still hold;
//   · clan_feast_deposit consumes real cooked food from player_inventory under
//     lock, advances the meter by the SERVER's heal value, and refuses when the
//     caller lacks the food or names a non-food item;
//   · buy_listing / buy_listing__ungated no longer exist and cannot be called.
//
// NOT PROVEN
//   · TRUE CONCURRENCY (PGlite is one backend — advisory locks are exercised,
//     contended by nothing). A real race needs a multi-connection database.
//
// Exit: 0 all green · 1 a failed assertion · 2 harness problem.
// ════════════════════════════════════════════════════════════════════════

import { join } from 'node:path';
import { bootChain, ROOT } from './pglite-chain.mjs';

const MIG = join(ROOT, 'supabase', 'migrations', '2026-08-27-clan-economy-sinks.sql');

const FIXTURE_SQL = `
create or replace function public.__mkuser(p_tag text) returns uuid
language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email)
    values (v, '00000000-0000-0000-0000-000000000000'::uuid,
            'authenticated', 'authenticated', p_tag || '-' || v::text || '@probe.invalid');
  return v;
end $$;

-- ── CONTRIBUTE ──────────────────────────────────────────────────────────
create or replace function public.__probe_contrib() returns jsonb
language plpgsql as $$
declare
  a uuid := public.__mkuser('contrib');
  c uuid;
  g0 bigint; g1 bigint; g2 bigint; t0 bigint; t1 bigint; t2 bigint;
  r1 jsonb; r2 jsonb; led bigint;
begin
  insert into public.clans (name, created_by) values ('__es_contrib__', a) returning id into c;
  insert into public.clan_members (clan_id, user_id, role) values (c, a, 'leader');
  insert into public.player_state (user_id, slot, gold) values (a, 0, 15000000);

  perform set_config('request.jwt.claim.sub', a::text, true);
  select gold into g0 from public.player_state where user_id = a and slot = 0;
  select treasury into t0 from public.clans where id = c;

  r1 := public.clan_contribute(c, 10000000);
  select gold into g1 from public.player_state where user_id = a and slot = 0;
  select treasury into t1 from public.clans where id = c;
  select coalesce(sum(-gold), 0) into led
    from public.player_ledger where user_id = a and kind = 'clan';

  -- the 60/min gate allows this second call; it must hit the DAILY cap, not mint.
  r2 := public.clan_contribute(c, 10000000);
  select gold into g2 from public.player_state where user_id = a and slot = 0;
  select treasury into t2 from public.clans where id = c;
  perform set_config('request.jwt.claim.sub', '', true);

  return jsonb_build_object(
    'first', r1, 'second', r2,
    'gold_debited', g0 - g1, 'treasury_credited', t1 - t0, 'ledger_out', led,
    'gold_after_cap', g2, 'treasury_after_cap', t2, 'gold_before', g0);
end $$;

create or replace function public.__probe_contrib_broke() returns jsonb
language plpgsql as $$
declare
  a uuid := public.__mkuser('broke'); c uuid; g0 bigint; g1 bigint; t0 bigint; t1 bigint; n int; r jsonb;
begin
  insert into public.clans (name, created_by) values ('__es_broke__', a) returning id into c;
  insert into public.clan_members (clan_id, user_id, role) values (c, a, 'leader');
  insert into public.player_state (user_id, slot, gold) values (a, 0, 5000);
  perform set_config('request.jwt.claim.sub', a::text, true);
  select gold into g0 from public.player_state where user_id = a and slot = 0;
  select treasury into t0 from public.clans where id = c;
  r := public.clan_contribute(c, 10000);   -- more than the 5,000 held
  select gold into g1 from public.player_state where user_id = a and slot = 0;
  select treasury into t1 from public.clans where id = c;
  select count(*) into n from public.player_ledger where user_id = a and kind = 'clan';
  perform set_config('request.jwt.claim.sub', '', true);
  return jsonb_build_object('r', r, 'gold_moved', g0 - g1, 'treasury_moved', t1 - t0, 'ledger_rows', n);
end $$;

create or replace function public.__probe_contrib_cascade() returns jsonb
language plpgsql as $$
declare a uuid := public.__mkuser('casc'); c uuid; lv int; r jsonb;
begin
  insert into public.clans (name, created_by, level) values ('__es_casc__', a, 1) returning id into c;
  insert into public.clan_members (clan_id, user_id, role) values (c, a, 'leader');
  insert into public.player_state (user_id, slot, gold) values (a, 0, 20000);
  perform set_config('request.jwt.claim.sub', a::text, true);
  r := public.clan_contribute(c, 10000);   -- treasury 10000 >= 10000 → level 2
  select level into lv from public.clans where id = c;
  perform set_config('request.jwt.claim.sub', '', true);
  return jsonb_build_object('r', r, 'level', lv);
end $$;

-- ── FEAST ───────────────────────────────────────────────────────────────
create or replace function public.__probe_feast() returns jsonb
language plpgsql as $$
declare
  a uuid := public.__mkuser('feast'); c uuid;
  inv0 bigint; inv1 bigint; m0 int; m1 int; r jsonb; r_bad jsonb; r_nofood jsonb; r_clamp jsonb;
  led bigint;
begin
  insert into public.clans (name, created_by, upgrades)
    values ('__es_feast__', a, '{"tavern":"5"}'::jsonb) returning id into c;  -- cap = 600 + 120*5 = 1200
  insert into public.clan_members (clan_id, user_id, role) values (c, a, 'leader');
  insert into public.player_state (user_id, slot, gold) values (a, 0, 0);
  insert into public.player_inventory (user_id, slot, item_id, qty) values (a, 0, 'cooked_shark', 5);  -- heals 42

  perform set_config('request.jwt.claim.sub', a::text, true);
  select coalesce(feast_meter, 0) into m0 from public.clan_tavern where clan_id = c;   -- null → 0
  m0 := coalesce(m0, 0);
  select qty into inv0 from public.player_inventory where user_id = a and slot = 0 and item_id = 'cooked_shark';

  r := public.clan_feast_deposit(c, 'cooked_shark', 3);   -- 3 * 42 = 126
  select qty into inv1 from public.player_inventory where user_id = a and slot = 0 and item_id = 'cooked_shark';
  select feast_meter into m1 from public.clan_tavern where clan_id = c;
  select coalesce(sum(-qty), 0) into led
    from public.player_ledger where user_id = a and kind = 'clan' and item_id = 'cooked_shark';

  -- non-food item is refused outright
  r_bad := public.clan_feast_deposit(c, 'iron_bar', 1);
  -- a food the caller does not hold is refused, meter untouched
  r_nofood := public.clan_feast_deposit(c, 'cooked_lobster', 1);
  perform set_config('request.jwt.claim.sub', '', true);

  return jsonb_build_object(
    'r', r, 'inv_before', inv0, 'inv_after', inv1, 'meter_before', m0, 'meter_after', m1,
    'ledger_out', led, 'bad', r_bad, 'nofood', r_nofood);
end $$;

create or replace function public.__probe_feast_clamp() returns jsonb
language plpgsql as $$
declare a uuid := public.__mkuser('clamp'); c uuid; inv1 bigint; m1 int; r jsonb;
begin
  insert into public.clans (name, created_by, upgrades)
    values ('__es_clamp__', a, '{"tavern":"5"}'::jsonb) returning id into c;   -- cap 1200
  insert into public.clan_members (clan_id, user_id, role) values (c, a, 'leader');
  insert into public.player_state (user_id, slot, gold) values (a, 0, 0);
  insert into public.player_inventory (user_id, slot, item_id, qty) values (a, 0, 'cooked_shark', 100);
  perform set_config('request.jwt.claim.sub', a::text, true);
  -- per-call clamp is 600 heal-points; cooked_shark heals 42 → floor(600/42)=14 items, add 588
  r := public.clan_feast_deposit(c, 'cooked_shark', 100);
  select qty into inv1 from public.player_inventory where user_id = a and slot = 0 and item_id = 'cooked_shark';
  select feast_meter into m1 from public.clan_tavern where clan_id = c;
  perform set_config('request.jwt.claim.sub', '', true);
  return jsonb_build_object('r', r, 'inv_after', inv1, 'meter', m1);
end $$;
`;

export async function clanEconomySinksGuard() {
  const res = await run();
  return res.out.filter((r) => !r.ok).map((r) => `${r.name} — ${r.detail}`);
}

async function run() {
  let db;
  try {
    ({ db } = await bootChain({ extra: [['clan-economy-sinks', MIG]] }));
  } catch (e) {
    return { out: [{ ok: false, name: 'migration failed to apply', detail: String(e.message).slice(0, 300) }] };
  }
  await db.exec(FIXTURE_SQL);

  const out = [];
  const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail });
  const one = async (sql) => {
    try { return (await db.query(sql)).rows[0]; }
    catch (e) { check(`probe threw: ${sql.slice(0, 50)}`, false, String(e.message).slice(0, 300)); return {}; }
  };
  const R = (v) => (v && typeof v === 'object' ? v : {});

  // ── FIX 1 · contribute conservation ─────────────────────────────────────
  const c = R((await one('select public.__probe_contrib() as r')).r);
  check('E1  contribute debits the payer gold by EXACTLY the accepted amount',
    Number(c.gold_debited) === 10000000, `debited=${c.gold_debited}`);
  check('E2  treasury is credited by the same amount (value conserved, not minted)',
    Number(c.treasury_credited) === 10000000 && Number(c.gold_debited) === Number(c.treasury_credited),
    `credited=${c.treasury_credited} debited=${c.gold_debited}`);
  check('E3  the outflow is journalled to player_ledger',
    Number(c.ledger_out) === 10000000, `ledger_out=${c.ledger_out}`);
  check('E4  the second call hits the DAILY cap and mints nothing more',
    c.second?.error === 'daily_cap' && Number(c.treasury_after_cap) === 10000000
      && Number(c.gold_after_cap) === Number(c.gold_before) - 10000000,
    JSON.stringify({ second: c.second, treasury: c.treasury_after_cap, gold: c.gold_after_cap }));

  const cb = R((await one('select public.__probe_contrib_broke() as r')).r);
  check('E5  a contribution over the payer\'s gold is REFUSED (insufficient_gold)',
    cb.r?.error === 'insufficient_gold', JSON.stringify(cb.r));
  check('E6  the refused contribution moves NOTHING on either side and journals nothing',
    Number(cb.gold_moved) === 0 && Number(cb.treasury_moved) === 0 && cb.ledger_rows === 0,
    JSON.stringify(cb));

  const cc = R((await one('select public.__probe_contrib_cascade() as r')).r);
  check('E7  the level cascade is preserved (10000 treasury → level 2)',
    cc.r?.ok === true && Number(cc.level) === 2, JSON.stringify(cc));

  // ── FIX 2 · feast food debit ────────────────────────────────────────────
  const f = R((await one('select public.__probe_feast() as r')).r);
  check('E8  feast consumes real food: inventory drops by exactly the qty asked',
    Number(f.inv_before) - Number(f.inv_after) === 3 && Number(f.r?.items_consumed) === 3,
    JSON.stringify({ before: f.inv_before, after: f.inv_after, consumed: f.r?.items_consumed }));
  check('E9  the meter advances by the SERVER heal value (3 × 42 = 126), not a client number',
    Number(f.meter_after) - Number(f.meter_before) === 126 && Number(f.r?.added) === 126,
    `delta=${Number(f.meter_after) - Number(f.meter_before)} added=${f.r?.added}`);
  check('E10 the food debit is journalled',
    Number(f.ledger_out) === 3, `ledger_out=${f.ledger_out}`);
  check('E11 a non-food item is refused (not_feast_food)',
    f.bad?.error === 'not_feast_food', JSON.stringify(f.bad));
  check('E12 a food the caller does not hold is refused (insufficient_item)',
    f.nofood?.error === 'insufficient_item', JSON.stringify(f.nofood));

  const fc = R((await one('select public.__probe_feast_clamp() as r')).r);
  check('E13 the 600 heal-point per-call clamp binds (14 sharks, +588, not +4200)',
    Number(fc.r?.items_consumed) === 14 && Number(fc.r?.added) === 588
      && Number(fc.inv_after) === 86 && Number(fc.meter) === 588,
    JSON.stringify(fc));

  // ── FIX 3 · buy_listing is gone and not client-executable ──────────────
  const g = R((await one(
    "select count(*)::int as n from pg_proc where proname in ('buy_listing','buy_listing__ungated')")));
  check('E14 buy_listing / buy_listing__ungated no longer exist',
    Number(g.n) === 0, `matching pg_proc rows=${g.n}`);
  let threw = false;
  try { await db.query("select public.buy_listing('00000000-0000-0000-0000-000000000000'::uuid, 1)"); }
  catch { threw = true; }
  check('E15 calling buy_listing throws (the RPC is unreachable)', threw, `threw=${threw}`);

  return { out };
}

// CLI: node tests/clan-economy-sinks.mjs
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('clan-economy-sinks.mjs')) {
  run().then(({ out }) => {
    let bad = 0;
    for (const r of out) {
      if (!r.ok) bad++;
      process.stdout.write(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}\n`);
      if (!r.ok) process.stdout.write(`        ${r.detail}\n`);
    }
    if (bad) { process.stdout.write(`\n${bad} assertion(s) FAILED.\n`); process.exit(1); }
    process.stdout.write('\nall green.\n');
    process.exit(0);
  }).catch((e) => { process.stderr.write(`ERROR: ${e.message}\n`); process.exit(2); });
}
