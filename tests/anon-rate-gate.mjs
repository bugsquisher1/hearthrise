#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/anon-rate-gate.mjs — F4, BEHAVIOURALLY.
//
// THE FINDING, as the Security Engineer executed it against production:
//   30 anonymous calls against a bucket whose limit is 20 → 0 refused,
//   because hr_rpc_gate contains `if v_uid is null then return true; end if;`.
//   The authenticated control on the same bucket → 10 refused, which is the
//   only reason the probe could be trusted to see failure at all.
//
// That exact probe, with that exact control, is R2/R3 below. A probe that
// cannot demonstrate failure is treated here as broken rather than as a pass,
// so R3 is an assertion and not a comment.
//
// ── WHAT THIS FILE PROVES ───────────────────────────────────────────────
//   R2  an anonymous caller carrying a normal request's headers is now rated;
//   R3  the authenticated path is UNCHANGED (10 of 30 refused at limit 20);
//   R5  two different IPs do NOT share a budget — the objection §2b of
//       2026-08-11-authenticated-surface-lockdown.sql raised against rating
//       anon at all ("one attacker locks out every anonymous visitor") is
//       answered, not overruled;
//   R6  a FORGED x-forwarded-for prefix does not mint a fresh bucket. This is
//       the assertion that separates a real key from a decorative one: reading
//       the FIRST XFF element instead of the LAST would look identical on
//       every other probe in this file;
//   R7  cf-connecting-ip beats a forged x-forwarded-for;
//   R8  with NO headers the shared fallback binds at 600/minute and is
//       PER BUCKET — exhausting beta_invite_check does not take hr_leaderboard
//       down with it;
//   R9  neither hr_rpc_gate nor hr_request_ip is client-executable;
//   R10 no bucket was lost in the rewrite (the "two files own one `case`"
//       hazard; a lost bucket fails CLOSED, i.e. every RPC in it dead).
//
// ── WHAT IT DOES NOT AND CANNOT PROVE ───────────────────────────────────
// That Supabase's gateway actually populates `cf-connecting-ip` or what it
// leaves in `x-forwarded-for`. `request.headers` is set here with set_config,
// which is how PostgREST sets it — but the hop in front of PostgREST is not
// modelled and cannot be from inside the database. If production turns out to
// deliver neither header, every anon caller lands in R8's shared bucket and the
// protection is 600/minute globally rather than per caller. The post-apply
// check that tells you which world you are in is in the migration header and
// in the handoff. This limitation is the reason R8 exists as its own assertion
// rather than as an afterthought.
//
// ── FALSIFIABILITY ──────────────────────────────────────────────────────
//   node tests/anon-rate-gate.mjs --selftest
// Two of the four mutations are caught ONLY here: `ip_key_always_null` and
// `xff_first_element` both leave the migration's own commit gate green,
// because that gate can only exercise the keyless path.
//
// Exit: 0 clean · 1 a violation or a slipped mutation · 2 harness problem.
// ════════════════════════════════════════════════════════════════════════

import { bootChain } from './pglite-chain.mjs';

const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit === undefined ? d : hit.slice(n.length + 3);
};

const BUCKET = 'beta_invite_check';      // limit 20
const LIMIT = 20;
const UNKEYED_LIMIT = 600;

const MUTATIONS = {
  anon_unrated: {
    what: 'THE FINDING ITSELF — `if v_uid is null then return true` is restored',
    where: 'gate',
    patches: [['anon-rate-gate', [[
      `  if v_uid is not null then
    v_key    := v_uid;
    v_bucket := 'rpc:' || p_bucket;
  else`,
      `  if v_uid is null then return true; end if;  -- MUTATED anon_unrated
  if v_uid is not null then
    v_key    := v_uid;
    v_bucket := 'rpc:' || p_bucket;
  else`,
    ]]]],
  },

  ip_key_always_null: {
    what: 'hr_request_ip never finds a key, so every anon caller falls into the shared 600/min bucket — which is what production looks like if the gateway strips both headers',
    where: 'runtime',
    patches: [['anon-rate-gate', [[
      `  v_raw := nullif(current_setting('request.headers', true), '');
  if v_raw is null then return null; end if;`,
      `  return null;  -- MUTATED ip_key_always_null
  v_raw := nullif(current_setting('request.headers', true), '');
  if v_raw is null then return null; end if;`,
    ]]]],
  },

  xff_first_element: {
    what: 'x-forwarded-for is read from the FIRST element instead of the last — the key becomes client-authored, so it looks like a limit and is not one',
    where: 'runtime',
    patches: [['anon-rate-gate', [[
      `    v_ip := nullif(btrim(v_parts[array_length(v_parts, 1)]), '');`,
      `    v_ip := nullif(btrim(v_parts[1]), '');  -- MUTATED xff_first_element`,
    ]]]],
  },

  bucket_deleted: {
    what: 'the beta_invite_check bucket is dropped from the `case` — every call in it fails closed',
    where: 'gate',
    patches: [['anon-rate-gate', [[
      `    when 'beta_invite_check'
      then v_limit := 20;`,
      `    -- MUTATED bucket_deleted`,
    ]]]],
  },
};

// Each scenario is ONE statement, so it is one transaction: `set_config(...,
// true)` is transaction-local (which is how PostgREST scopes request.headers),
// and now() is frozen, so the one-minute rate window cannot roll mid-probe.
const FIXTURE_SQL = `
create or replace function public.__gate_burst(
  p_headers text, p_sub text, p_bucket text, p_n int)
returns jsonb language plpgsql as $$
declare i int; refused int := 0; first_ok boolean;
begin
  if p_headers is null then
    perform set_config('request.headers', '', true);
  else
    perform set_config('request.headers', p_headers, true);
  end if;
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  first_ok := public.hr_rpc_gate(p_bucket);
  for i in 2..greatest(2, p_n) loop
    if not public.hr_rpc_gate(p_bucket) then refused := refused + 1; end if;
  end loop;
  return jsonb_build_object('first_ok', first_ok, 'refused', refused, 'n', p_n);
end $$;

-- Rotate the FORGED prefix of x-forwarded-for on every call while keeping the
-- proxy-written last element fixed. A gate that keys on the first element sees
-- a brand-new caller each time and refuses nothing.
create or replace function public.__gate_burst_forged(p_bucket text, p_n int)
returns jsonb language plpgsql as $$
declare i int; refused int := 0;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  for i in 1..p_n loop
    perform set_config('request.headers',
      '{"x-forwarded-for":"10.0.0.' || i::text || ', 198.51.100.7"}', true);
    if not public.hr_rpc_gate(p_bucket) then refused := refused + 1; end if;
  end loop;
  return jsonb_build_object('refused', refused, 'n', p_n);
end $$;

-- cf-connecting-ip must win. Exhaust one CF IP while the XFF the caller sends
-- keeps changing; then a DIFFERENT cf-connecting-ip must still be admitted.
create or replace function public.__gate_cf_precedence(p_bucket text)
returns jsonb language plpgsql as $$
declare i int; refused int := 0; other_ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  for i in 1..30 loop
    perform set_config('request.headers',
      '{"cf-connecting-ip":"203.0.113.5","x-forwarded-for":"10.0.0.' || i::text || '"}', true);
    if not public.hr_rpc_gate(p_bucket) then refused := refused + 1; end if;
  end loop;
  perform set_config('request.headers', '{"cf-connecting-ip":"203.0.113.6"}', true);
  other_ok := public.hr_rpc_gate(p_bucket);
  return jsonb_build_object('refused', refused, 'other_ip_ok', other_ok);
end $$;

-- The keyless fallback: per bucket, not global.
create or replace function public.__gate_unkeyed_isolation() returns jsonb
language plpgsql as $$
declare i int; refused int := 0; other_ok boolean;
begin
  perform set_config('request.headers', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  for i in 1..${UNKEYED_LIMIT + 40} loop
    if not public.hr_rpc_gate('${BUCKET}') then refused := refused + 1; end if;
  end loop;
  other_ok := public.hr_rpc_gate('hr_leaderboard');
  return jsonb_build_object('refused', refused, 'other_bucket_ok', other_ok);
end $$;

-- No bucket may be lost. The list is the one the file installs; if a future
-- edit drops one, this goes red rather than the RPCs going quietly dead.
create or replace function public.__gate_buckets() returns jsonb
language plpgsql as $$
declare b text; lost text; n int := 0;
  buckets text[] := array[
    'clan_seat_read','clan_vote_read','hr_leaderboard','hr_rally_pledge_state',
    'hr_display_name_available','hr_server_now','clan_invites_list',
    'buy_listing','clan_board_claim','clan_board_progress','clan_contribute',
    'clan_deposit','clan_feast_deposit','clan_rested_grant','clan_vote_cast',
    'clan_work_complete','clan_work_labour','clan_work_supply','raid_claim',
    'raid_strike','world_event_absence_claim','world_event_claim',
    'world_event_contribute','world_event_join','world_event_pledge',
    'world_event_pledge_settle','bug_report_submit','claim_beta_invite',
    'claim_display_name','clan_board_roll','clan_feast_call','clan_hunt_declare',
    'clan_tier_up','clan_vice_set','clan_vote_close','clan_vote_open',
    'clan_work_post','clan_create','clan_join','clan_leave','clan_kick',
    'clan_invite','clan_invite_revoke','clan_join_policy_set','beta_invite_check'];
begin
  perform set_config('request.headers', '', true);
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  foreach b in array buckets loop
    n := n + 1;
    if not public.hr_rpc_gate(b) then lost := coalesce(lost || ',', '') || b; end if;
  end loop;
  return jsonb_build_object('tried', n, 'lost', lost,
                            'unknown_admitted', public.hr_rpc_gate('__not_a_bucket__'));
end $$;

create or replace function public.__gate_grants() returns jsonb
language plpgsql as $$
declare g text; bad text;
begin
  foreach g in array array['public','anon','authenticated','service_role'] loop
    if has_function_privilege(g, 'public.hr_rpc_gate(text)', 'execute') then
      bad := coalesce(bad || ',', '') || g || ':gate'; end if;
    if has_function_privilege(g, 'public.hr_request_ip()', 'execute') then
      bad := coalesce(bad || ',', '') || g || ':ip'; end if;
  end loop;
  return jsonb_build_object('bad', bad);
end $$;
`;

async function run(mutationId) {
  const patches = new Map();
  if (mutationId) {
    const m = MUTATIONS[mutationId];
    if (!m) { const e = new Error(`unknown mutation "${mutationId}"`); e.harness = true; throw e; }
    for (const [file, list] of m.patches) patches.set(file, list);
  }

  let db;
  try {
    ({ db } = await bootChain({ patches: patches.size ? patches : undefined }));
  } catch (e) {
    if (e.harness) throw e;
    return [{ name: 'migration commit gate', ok: false, detail: String(e.message).slice(0, 300) }];
  }
  await db.exec(FIXTURE_SQL);

  const out = [];
  const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail });
  const one = async (sql) => {
    try { return (await db.query(sql)).rows[0]?.r ?? {}; }
    catch (e) { check(`probe threw: ${sql.slice(0, 60)}`, false, String(e.message).slice(0, 300)); return {}; }
  };

  const g = await one("select public.__gate_grants() as r");
  check('R9  hr_rpc_gate and hr_request_ip are not client-executable',
    g.bad === null, `executable by: ${g.bad}`);

  // R2 — THE FINDING, reproduced exactly: 30 anon calls, limit 20.
  const anon = await one(
    `select public.__gate_burst('{"cf-connecting-ip":"203.0.113.9"}', null, '${BUCKET}', 30) as r`);
  check('R1  CONTROL · the first anonymous call is admitted (rate-limited, not closed)',
    anon.first_ok === true, JSON.stringify(anon));
  check(`R2  THE FINDING · 30 anonymous calls at limit ${LIMIT} → refusals > 0`,
    anon.refused > 0, `refused=${anon.refused} of 30 (expected ${30 - LIMIT})`);
  check('R2b the anonymous refusal count matches the bucket limit exactly',
    anon.refused === 30 - LIMIT, `refused=${anon.refused}, expected ${30 - LIMIT}`);

  // R3 — the control that made the original finding legible.
  const auth = await one(
    `select public.__gate_burst(null, gen_random_uuid()::text, '${BUCKET}', 30) as r`);
  check(`R3  CONTROL · the authenticated path still refuses ${30 - LIMIT} of 30 — the probe can see failure`,
    auth.refused === 30 - LIMIT, `refused=${auth.refused} of 30`);

  // R5 — no cross-lockout between callers.
  const ipA = await one(
    `select public.__gate_burst('{"cf-connecting-ip":"198.51.100.1"}', null, '${BUCKET}', 40) as r`);
  const ipB = await one(
    `select public.__gate_burst('{"cf-connecting-ip":"198.51.100.2"}', null, '${BUCKET}', 2) as r`);
  check('R5  one exhausted IP does not lock out a different IP',
    ipA.refused > 0 && ipB.first_ok === true && ipB.refused === 0,
    `A refused=${ipA.refused}; B first_ok=${ipB.first_ok} refused=${ipB.refused}`);

  // R6 — the forgery test. THIS is what separates a key from decoration.
  const forged = await one(`select public.__gate_burst_forged('${BUCKET}', 40) as r`);
  check('R6  a forged x-forwarded-for prefix does not mint a fresh bucket',
    forged.refused >= 40 - LIMIT,
    `refused=${forged.refused} of 40 with a rotating forged prefix (expected >= ${40 - LIMIT})`);

  // R7 — cf-connecting-ip wins over a forged XFF.
  const cf = await one(`select public.__gate_cf_precedence('${BUCKET}') as r`);
  check('R7  cf-connecting-ip takes precedence over a client-supplied x-forwarded-for',
    cf.refused === 30 - LIMIT && cf.other_ip_ok === true, JSON.stringify(cf));

  // R8 — the keyless fallback, and its per-bucket isolation.
  const un = await one('select public.__gate_unkeyed_isolation() as r');
  check(`R8  with no headers the shared fallback binds at ${UNKEYED_LIMIT}/min`,
    un.refused > 0, `refused=${un.refused} of ${UNKEYED_LIMIT + 40}`);
  check('R8b the shared fallback is PER BUCKET — exhausting one does not close another',
    un.other_bucket_ok === true, JSON.stringify(un));

  // R10 — no bucket lost, unknown bucket still fails closed.
  const bk = await one('select public.__gate_buckets() as r');
  check('R10 every bucket in the allowlist is still admitted',
    bk.lost === null && bk.tried === 45, `tried=${bk.tried} lost=${bk.lost}`);
  check('R10b an unknown bucket still fails closed',
    bk.unknown_admitted === false, `admitted=${bk.unknown_admitted}`);

  return out;
}

function report(results) {
  let bad = 0;
  for (const r of results) {
    if (!r.ok) bad++;
    process.stdout.write(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}\n`);
    if (!r.ok) process.stdout.write(`        ${r.detail}\n`);
  }
  return bad;
}

async function main() {
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) {
      process.stdout.write(`${id.padEnd(24)} [${m.where}] ${m.what}\n`);
    }
    return 0;
  }
  const only = argOf('mutate', null);
  if (only) {
    process.stdout.write(`MUTATION ${only} — ${MUTATIONS[only]?.what}\n`);
    const bad = report(await run(only));
    if (bad === 0) { process.stdout.write('\nSLIPPED: not caught. The guard is decoration.\n'); return 1; }
    process.stdout.write(`\nCAUGHT (${bad} assertion(s) red).\n`);
    return 0;
  }

  process.stdout.write('CLEAN RUN\n');
  const bad = report(await run(null));
  if (bad) { process.stdout.write(`\n${bad} assertion(s) FAILED.\n`); return 1; }
  process.stdout.write('\nall green.\n');
  if (!argv.includes('--selftest')) return 0;

  process.stdout.write('\nSELFTEST — every mutation must be caught\n');
  let slipped = 0;
  for (const [id, m] of Object.entries(MUTATIONS)) {
    const res = await run(id);
    const n = res.filter((r) => !r.ok).length;
    const gated = res.length === 1 && res[0].name === 'migration commit gate';
    if (n === 0) { slipped++; process.stdout.write(`  SLIPPED  ${id}\n`); continue; }
    process.stdout.write(`  caught   ${id.padEnd(24)} ${gated ? 'by the migration commit gate' : `by ${n} runtime assertion(s)`}\n`);
    if (gated && m.where === 'runtime') {
      slipped++;
      process.stdout.write('           MISLABELLED: the migration refused it, so the runtime probe is unproven\n');
    }
  }
  if (slipped) { process.stdout.write(`\n${slipped} mutation(s) slipped or mislabelled.\n`); return 1; }
  process.stdout.write('\nevery mutation caught.\n');
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => {
  process.stderr.write(`${e.harness ? 'HARNESS' : 'ERROR'}: ${e.message}\n`);
  process.exit(2);
});
