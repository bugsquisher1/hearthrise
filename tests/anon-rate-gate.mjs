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

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootChain, CHAIN } from './pglite-chain.mjs';

/* fileURLToPath, NOT .pathname — this repo lives under a path containing
   SPACES and .pathname hands back the %20-escaped form, which fs cannot open. */
const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));

const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit === undefined ? d : hit.slice(n.length + 3);
};

const BUCKET = 'beta_invite_check';      // limit 20
const LIMIT = 20;
const UNKEYED_LIMIT = 600;

/* ════════════════════════════════════════════════════════════════════════
   THE BUCKET WALK — R10/R11's expected set, DERIVED FROM THE CHAIN.

   WHY THIS EXISTS. hr_rpc_gate is a single `case` that ends `else return
   false`, and TWELVE migrations restate it in full. A file that restates it
   from a stale template does not error, does not warn, and does not fail any
   hash check that a human will read as "you deleted buckets" — it just makes
   every RPC in the missing buckets answer `rate_limited` on every call, for
   every player, forever. That is not hypothetical: "b487-b491: rpc-gate bucket
   restore = the week's root cause."

   The md5 pin in tests/live-hash-drift.baseline.json DOES see the body change
   — but it reports "md5 moved", and the remedy for a moved md5 is `--write`.
   An md5 cannot distinguish "added one bucket" from "lost thirteen and added
   one", so a re-pin absorbs the clobber silently. THAT is the gap this closes:
   the loss is named, per bucket, instead of being a hex digest.

   THE WALK IS RUN TWICE, OVER TWO DIFFERENT FILE LISTS, BECAUSE THEY ANSWER
   TWO DIFFERENT QUESTIONS — and conflating them is a real trap I fell into:

     · R10 walks `CHAIN` (pglite-chain.mjs), the 27-file PREFIX this harness
       actually boots, ending at 2026-08-13-anon-rate-gate.sql. That prefix
       admits 45 buckets, which is why the hand list here was 45. It was NOT a
       decayed list — it was correct for this database. Deriving it just means
       it stays correct when someone adds a gate-touching file to CHAIN.

     · R11 walks the FULL apply order (tests/schema-apply-order.json), which is
       what a real rebuild runs (66 buckets today). It is a STATIC check — no
       database — asserting FINAL ⊇ HIGH-WATER: every bucket the gate held at
       ANY point survives to the end. A transient dip inside one apply run is
       survivable because the chain applies in one go; a dip nothing heals is
       the outage. This is the assertion that would have caught b487 on the day
       it landed, and the one whose absence lets 2026-08-23-bounty.sql keep a
       53-bucket restatement that destroys thirteen live buckets if it is ever
       re-applied as a revert.
   ════════════════════════════════════════════════════════════════════════ */
function gateBucketWalkWith(files, read) {
  const events = [];
  let cur = new Set();
  for (const p of files) {
    const f = p.split(/[\\/]/).pop();
    if (!existsSync(p)) continue;
    const src = read(p);
    if (!src.includes('hr_rpc_gate')) continue;
    let lost = []; const gained = []; let kind = null;
    /* A FULL RESTATEMENT replaces the whole `case`. Slice from `case p_bucket`
       and NOT from the `create`, so the `set search_path to 'public',
       'pg_catalog'` clause cannot contribute two phantom buckets. */
    const ci = src.indexOf('create or replace function public.hr_rpc_gate');
    if (ci >= 0) {
      const cs = src.indexOf('case p_bucket', ci);
      const ce = src.indexOf('end case', cs);
      if (cs >= 0 && ce > cs) {
        const set = new Set([...src.slice(cs, ce).matchAll(/'([a-zA-Z0-9_]+)'/g)].map((m) => m[1]));
        lost = [...cur].filter((b) => !set.has(b));
        for (const b of set) if (!cur.has(b)) gained.push(b);
        cur = set; kind = 'restate';
      }
    }
    /* A PROGRAMMATIC SPLICE appends arms inside a SQL string literal, so its
       bucket names are DOUBLE-quoted. That is why it cannot collide with a
       restatement's single-quoted `case` arms even in a file that does both. */
    for (const m of src.matchAll(/when\s+''([a-zA-Z0-9_]+)''\s+then\s+v_limit/g)) {
      if (!cur.has(m[1])) { gained.push(m[1]); cur.add(m[1]); }
      kind = kind || 'splice';
    }
    if (kind) events.push({ file: f, kind, size: cur.size, lost, gained });
  }
  const high = new Set(cur);
  for (const e of events) { for (const b of e.lost) high.add(b); for (const b of e.gained) high.add(b); }
  return { events, final: cur, high };
}
/* The selftest injects a reader so the MUTATED walk runs the SAME code as the
   assertion — a mutation proof against a second implementation proves nothing
   about the first. */
const gateBucketWalk = (files) => gateBucketWalkWith(files, (p) => readFileSync(p, 'utf8'));

/** The files the PGlite harness actually applies, in the order it applies them. */
const CHAIN_FILES = CHAIN.map(([, p]) => p);
/** The files a real rebuild applies — the full apply order. */
const FULL_ORDER_FILES = JSON.parse(
  readFileSync(join(REPO_ROOT, 'tests', 'schema-apply-order.json'), 'utf8'),
).order.map((f) => join(REPO_ROOT, 'supabase', 'migrations', f));

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
-- ⚠ THE BUCKET LIST IS A PARAMETER, NOT A LITERAL, AND THAT IS THE FIX.
-- It used to be a hand-maintained 45-element array written on 2026-08-13. The
-- gate has since grown to 66 buckets and NOBODY GREW THE ARRAY, so R10 was
-- silently covering 45 of 66 — and not one of the thirteen buckets a stale
-- restatement destroys (farm_water, worker_hire, hr_credit_kills, hr_set_style,
-- …) was among the 45. A guard whose expected set is typed by hand decays into
-- decoration. The caller now DERIVES the list from the migration chain itself,
-- so it cannot drift from what the chain builds.
create or replace function public.__gate_buckets(p_buckets text[]) returns jsonb
language plpgsql as $$
declare b text; lost text; n int := 0;
begin
  perform set_config('request.headers', '', true);
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  foreach b in array p_buckets loop
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

  // ── R10/R11 — BUCKET COMPLETENESS, DERIVED (see gateBucketWalk above) ──
  const walk = gateBucketWalk(CHAIN_FILES);        // what THIS database has
  const finalList = [...walk.final].sort();

  /* The names go into a SQL array literal, so prove they are inert first.
     Every bucket in this codebase is [a-z0-9_]; anything else means the walk
     scraped something that is not a bucket, and the right answer is to fail
     rather than to interpolate it. */
  const shady = finalList.filter((b) => !/^[a-zA-Z0-9_]+$/.test(b));
  check('R10 CONTROL · every derived bucket name is an inert identifier',
    shady.length === 0, `not identifiers: ${JSON.stringify(shady)}`);

  /* The 2026-08-13 hand list, kept as a FLOOR. The derived set replaces it as
     the expected set, but the historical guarantee must never silently shrink:
     if a future edit made the walk return fewer names, this catches it. */
  const HISTORICAL_45 = ['clan_seat_read', 'clan_vote_read', 'hr_leaderboard', 'hr_rally_pledge_state',
    'hr_display_name_available', 'hr_server_now', 'clan_invites_list', 'buy_listing',
    'clan_board_claim', 'clan_board_progress', 'clan_contribute', 'clan_deposit',
    'clan_feast_deposit', 'clan_rested_grant', 'clan_vote_cast', 'clan_work_complete',
    'clan_work_labour', 'clan_work_supply', 'raid_claim', 'raid_strike',
    'world_event_absence_claim', 'world_event_claim', 'world_event_contribute',
    'world_event_join', 'world_event_pledge', 'world_event_pledge_settle', 'bug_report_submit',
    'claim_beta_invite', 'claim_display_name', 'clan_board_roll', 'clan_feast_call',
    'clan_hunt_declare', 'clan_tier_up', 'clan_vice_set', 'clan_vote_close', 'clan_vote_open',
    'clan_work_post', 'clan_create', 'clan_join', 'clan_leave', 'clan_kick', 'clan_invite',
    'clan_invite_revoke', 'clan_join_policy_set', 'beta_invite_check'];
  const missingFloor = HISTORICAL_45.filter((b) => !walk.final.has(b));
  check('R10 CONTROL · the derived set still covers the original 2026-08-13 allowlist',
    missingFloor.length === 0 && finalList.length >= HISTORICAL_45.length,
    `derived ${finalList.length}; derivation lost: ${missingFloor.join(',') || '(none)'}`);

  const bk = shady.length ? {} : await one(
    `select public.__gate_buckets(array[${finalList.map((b) => `'${b}'`).join(',')}]::text[]) as r`);
  check(`R10 every bucket THIS chain builds is admitted (${finalList.length}, derived from CHAIN)`,
    bk.lost === null && bk.tried === finalList.length,
    `tried=${bk.tried} of ${finalList.length}; NOT ADMITTED: ${bk.lost}`);
  check('R10b an unknown bucket still fails closed',
    bk.unknown_admitted === false, `admitted=${bk.unknown_admitted}`);

  /* ── R11 — THE HIGH-WATER MARK, over the FULL apply order. STATIC. ──────
     Every bucket the gate held at any point in a real rebuild must still be
     there at the end. hr_rpc_gate is one `case` ending `else return false`,
     restated in full by TWELVE migrations, so a file written from a stale
     template silently disarms whole feature areas — that is b487. The md5 pin
     in live-hash-drift sees "the body moved"; it cannot see "you deleted
     thirteen buckets", and the remedy for a moved md5 is `--write`, which
     absorbs the loss. This names it instead. */
  const full = gateBucketWalk(FULL_ORDER_FILES);
  const neverRestored = [...full.high].filter((b) => !full.final.has(b));
  check(`R11 no bucket is dropped by a restatement and never restored (full order, ${full.final.size})`,
    neverRestored.length === 0,
    `DROPPED AND NEVER RESTORED: ${neverRestored.join(', ')} — every RPC in those buckets would `
    + 'answer rate_limited on every call. Offending file(s): '
    + full.events.filter((e) => e.lost.some((b) => neverRestored.includes(b)))
      .map((e) => e.file).join(', '));

  /* R11 SELFTEST — inline, because a static check that cannot demonstrate
     failure is prose. Delete a bucket from the LAST full restatement in the
     real order and re-walk: it must come back named. */
  {
    const victim = 'farm_water';
    const lastIdx = full.events.map((e) => e.kind).lastIndexOf('restate');
    const lastFile = lastIdx >= 0 ? full.events[lastIdx].file : null;
    const files = FULL_ORDER_FILES.filter((p) => p.endsWith(lastFile || ' '));
    const src = files.length ? readFileSync(files[0], 'utf8') : '';
    /* Tolerate whatever whitespace follows the name — in the restore file
       'farm_water' ends a line, so an anchor with a trailing space misses. */
    const broke = src.replace(new RegExp(`'${victim}',\\s*`), '');
    const patched = new Map([[files[0], broke]]);
    const reader = (p) => (patched.has(p) ? patched.get(p) : readFileSync(p, 'utf8'));
    const mutated = gateBucketWalkWith(FULL_ORDER_FILES, reader);
    const seen = [...mutated.high].filter((b) => !mutated.final.has(b));
    check(`R11 SELFTEST · deleting '${victim}' from ${lastFile} is reported as lost`,
      broke !== src && seen.includes(victim),
      `anchor ${broke === src ? 'DID NOT MATCH' : 'matched'}; reported lost=${JSON.stringify(seen)} `
      + '— if this is red, R11 is blind and the class is unguarded');
  }

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
