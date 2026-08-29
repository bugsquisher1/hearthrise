#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// tools/load-probe.mjs — CAPACITY, MEASURED. (Scalable-state exit criterion #4)
//
// LOAD-TEST ONLY. This file ships no game behaviour and nothing imports it.
// It answers one question with numbers instead of adjectives:
//
//     "How many concurrent players can hr-accrue carry before something breaks,
//      and WHICH thing breaks first?"
//
// ── WHY IT IS SHAPED LIKE THIS ──────────────────────────────────────────────
// The obvious load test — point a swarm at the production endpoint — is the one
// we may not run. Production is a LIVE BETA with real players whose progression
// now lives ONLY on the server, and a saturation test is indistinguishable from
// an outage for whoever is playing during it. So the load is split along the
// line where each half can be measured honestly:
//
//   DB SIDE  (--db)  the whole migration chain replayed into PGlite (a real
//                    PostgreSQL, in-process, no Docker, no credentials,
//                    production untouched), populated to 1x / 10x / 100x the
//                    live player count, and timed INSIDE the database with
//                    clock_timestamp so the number is SQL execution cost, not
//                    harness round-trip. This is where the per-request DB cost
//                    and the query PLANS come from.
//
//   FN SIDE  (--fn)  a BOUNDED, sequential, small probe of the deployed
//                    function's authentication-only paths (GET health, and a
//                    POST with no/!authenticated bearer). Neither path touches
//                    the database — hr_rate_gate is the first statement AFTER
//                    identity — so this measures gateway + isolate + JWT verify
//                    and NOTHING a live player can feel. Hard-capped; see
//                    MAX_FN_REQUESTS. It refuses to flood.
//
//   MODEL    (always) the arithmetic that turns the two into a ceiling:
//                    requests/sec at N players, DB ms/request, pooled
//                    connection-seconds/request, versus the measured pool and
//                    connection limits.
//
// ── WHAT THIS CANNOT SEE, STATED UP FRONT ───────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend. Per-call cost and plan SHAPE are
//     exact; lock contention between two simultaneous accruals for the SAME
//     character is not reproduced here. That contention is bounded by design
//     (hr_apply's advisory lock is keyed on hashtextextended(user:slot) — per
//     character, never global) and the harness ASSERTS that property rather
//     than measuring it.
//   · Deno isolate CPU for the JS simulation half of an accrual. The engine's
//     combat simulation runs in the Edge Function, not in Postgres. --fn
//     measures the function's floor, not a full accrual, because a full accrual
//     needs a player JWT this harness deliberately does not hold.
//   · PGlite is single-user WASM: its ABSOLUTE ms differ from a Micro instance.
//     Use the RATIO between scales (which is what capacity is about) and the
//     production spot-checks in --compare for absolute calibration.
//
// ── USAGE ───────────────────────────────────────────────────────────────────
//   node tools/load-probe.mjs                      # --db at 1x,10x,100x + model
//   node tools/load-probe.mjs --db --scales 1,10   # cheaper run
//   node tools/load-probe.mjs --db --iters 60      # more samples per scale
//   node tools/load-probe.mjs --fn                 # bounded live-endpoint probe
//   node tools/load-probe.mjs --fn --n 12          # <= MAX_FN_REQUESTS
//   node tools/load-probe.mjs --model --players 200
//   node tools/load-probe.mjs --json out.json      # machine-readable
//
// Exit 0 = every asserted capacity property held. Exit 1 = a property failed
// (see THE ASSERTIONS at the bottom). Exit 2 = harness/environment problem.
// ════════════════════════════════════════════════════════════════════════════

import { bootReplay } from '../tests/schema-replay.mjs';

// ── Ground truth, measured against nezapsylztqbbwuwembx on 2026-08-29 ───────
// Every number here was READ from the project, not assumed. Where a number is
// a platform default rather than something we set, it says so.
const GROUND = {
  project: 'nezapsylztqbbwuwembx',
  region: 'us-west-2',
  plan: 'pro',                       // GET /v1/organizations/<org>
  compute: 'ci_micro',               // GET /v1/projects/<ref>/billing/addons
  cpu_cores: 2,                      // shared
  memory_gb: 1,
  max_connections: 60,               // select current_setting('max_connections')
  connections_pooler: 200,           // ci_micro meta.connections_pooler (max_client_conn)
  engine_role_connlimit: 20,         // pg_roles.rolconnlimit for hr_engine_login
  auth_connections: 10,              // advisor auth_db_connections_absolute
  live_characters: 35,               // select count(*) from player_state
  live_users: 34,                    // select count(distinct user_id) from player_state
  db_bytes: 31018131,                // pg_database_size
  // Per-request DB cost measured ON PRODUCTION (clock_timestamp around each
  // call, 30 samples, live row counts). These are the calibration anchors.
  prod_ms: {
    hr_state_of: { p50: 2.567, p95: 3.853 },
    hr_perks_of: { p50: 1.815, p95: 2.380 },
    hr_total_level: { p50: 0.728, p95: 0.749 },
    hr_seed: { p50: 0.129, p95: 0.204 },
    hr_day_budget_used: { p50: 0.115, p95: 1.130 },
    hr_rate_gate: { p50: 0.032, p95: 0.147 },
    hr_offline_cap_ms: { p50: 0.027, p95: 0.178 },
  },
};

// The client cadence. Mirrors src/net/accrue.js SETTLE_INTERVAL_MS / the server
// floor. If either moves, this file is wrong and its assertion says so.
const CADENCE_MS = 90000;            // SETTLE_INTERVAL_MS
const SERVER_FLOOR_MS = 60000;       // ACCRUE_MIN_SPAN_MS mirror
const RATE_PER_MIN = 30;             // hr_rate_gate 'accrue' bucket

/* ⚠ THE CADENCE IS NOT THE REQUEST RATE, AND THE DIFFERENCE IS 3.5x.
   The obvious model — "one settle per player per 90 s = 40 invocations per
   player-hour" — is what this file computed first, and it is wrong by a factor
   that decides the verdict. MEASURED on the busiest real day (2026-08-24, open
   beta): 14,375 POSTs against 24 distinct active users = ~600 per active
   player-DAY, and 1,490 in the busiest hour. Every INTENT — set_activity, eat,
   equip, shop_buy, claim_reward, unlock_buy, market_* — is a POST to this same
   function, so an actively-played hour costs far more than 40. Capacity is
   modelled on the measurement, never on the cadence. */
const MEASURED = {
  day: '2026-08-24',
  post_invocations: 14375,
  active_users: 24,                  // distinct user_id in game_events that day
  peak_hour_invocations: 1490,
  per_active_player_day: 14375 / 24, // ~599
  // Server-side wall clock, from function_edge_logs.metadata.execution_time_ms
  exec_ms: { min: 54, p50: 1239, p90: 2665, p95: 2828, p99: 3509, max: 65544 },
  // Isolate lifecycle, from function_logs.metadata (event_type / reason).
  boots: 13576,                      // 94 % of requests run on a FRESH isolate
  boot_ms: 35,                       // the module load itself is cheap
  shutdown_reason: 'EarlyDrop',      // NOT CPUTime — the isolate is not CPU-bound
  cpu_ms_per_isolate: [54, 79],      // against a 200 ms soft / 2000 ms hard limit
  error_rate: (83 + 1 + 1) / 14460,  // 409 + 401 + 520 over billable invocations
};

// Plan quotas (Pro), confirmed against the Supabase docs 2026-08-29.
const QUOTA = { invocations_month: 2_000_000, invocation_overage_usd_per_m: 2,
                egress_gb_month: 250, egress_overage_usd_per_gb: 0.09,
                disk_gb_included: 8 };

// hr-accrue opens this many POOLED TRANSACTIONS per request (index.ts):
//   read (rate gate + state + cap + now)  ·  seed (2x hr_seed + hr_perks_of)
//   apply (hr_apply)  — only when there is something to pay.
const TX_PER_ACCRUE_PAYING = 3;
const TX_PER_ACCRUE_IDLE = 2;

// Hard cap on live-endpoint requests. This is a reliability tool, not a
// stress-test cannon, and production has real players on it.
const MAX_FN_REQUESTS = 40;

// ── args ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const WANT_DB = has('--db') || (!has('--fn') && !has('--model') && !has('--live'));
const WANT_FN = has('--fn');
const WANT_MODEL = has('--model') || WANT_DB || WANT_FN || has('--live');
const SCALES = String(val('--scales', '1,10,100')).split(',').map(Number).filter((n) => n > 0);
const ITERS = Number(val('--iters', '40'));
const FN_N = Math.min(Number(val('--n', '12')), MAX_FN_REQUESTS);
const PLAYERS = Number(val('--players', '0')) || null;
const JSON_OUT = val('--json', null);

const out = { ground: GROUND, db: null, fn: null, model: null, assertions: [] };
const p = (s = '') => process.stdout.write(s + '\n');
const fx = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toFixed(d));

function assert(name, ok, detail) {
  out.assertions.push({ name, ok: !!ok, detail });
  return ok;
}

// ── stats ──────────────────────────────────────────────────────────────────
function stats(list) {
  const a = list.slice().sort((x, y) => x - y);
  if (!a.length) return { n: 0 };
  const q = (f) => a[Math.min(a.length - 1, Math.floor(f * (a.length - 1)))];
  return {
    n: a.length, min: a[0], p50: q(0.5), p95: q(0.95), max: a[a.length - 1],
    mean: a.reduce((s, x) => s + x, 0) / a.length,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// DB SIDE
// ════════════════════════════════════════════════════════════════════════════

/* The per-character row shape, read from production 2026-08-29 and rounded UP
   so the model is pessimistic rather than flattering:
       player_skills     595 / 35 = 17.0  -> 17
       player_inventory  308 / 35 =  8.8  ->  9
       player_equipment   78 / 35 =  2.2  ->  3
       player_farm       119 / 35 =  3.4  ->  4
       player_progress   878 / 35 = 25.1  -> 26
       player_ledger   7,627 / 35 = 218   -> 220 (this is the GROWTH table)
   A synthetic character is built to those counts so the tables reach the size a
   real population would, which is the only thing the PLANNER cares about. */
const PER_CHAR = { skills: 17, inventory: 9, equipment: 3, farm: 4, progress: 26, ledger: 220 };

const uidOf = (i) => {
  const h = i.toString(16).padStart(12, '0');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4000-a000-${i.toString(16).padStart(12, '0')}`;
};

async function q(db, sql, params) { return (await db.query(sql, params)).rows; }

/** Bulk-populate the database to `target` characters. The first `real` of them
 *  are created through hr_create_character (so the MEASURED characters are
 *  exactly what the engine builds, start kit and all); the remainder are bulk
 *  inserted, because their only job is to make the tables big enough that the
 *  planner has to choose. Returns the number of characters now present. */
async function populate(db, target, realWanted) {
  const [{ n: have }] = await q(db, 'select count(*)::int n from player_state');
  if (have >= target) return have;

  // Engine-built characters first (only once, at the smallest scale).
  const [{ n: realHave }] = await q(db, 'select count(*)::int n from player_state');
  if (realHave < realWanted) {
    for (let i = realHave; i < realWanted; i++) {
      const uid = uidOf(i);
      await db.query('insert into auth.users(id) values ($1) on conflict (id) do nothing', [uid]);
      await db.query(
        'insert into profiles(id, display_name) values ($1,$2) on conflict (id) do update set display_name = excluded.display_name',
        [uid, `Probe${i}`]);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
      const r = (await db.query('select hr_create_character(0) r')).rows[0].r;
      if (r?.ok !== true) throw Object.assign(new Error(`hr_create_character: ${JSON.stringify(r)}`), { harness: true });
    }
  }

  // Background population, bulk. One statement per table per batch.
  const from = Math.max(realWanted, (await q(db, 'select count(*)::int n from player_state'))[0].n);
  const BATCH = 250;
  for (let lo = from; lo < target; lo += BATCH) {
    const hi = Math.min(target, lo + BATCH);
    await db.exec('begin');
    await db.query(
      `insert into auth.users(id)
       select ('00000000-0000-4000-a000-' || lpad(to_hex(g),12,'0'))::uuid
         from generate_series($1::int, $2::int) g
       on conflict (id) do nothing`, [lo, hi - 1]);
    await db.query(
      `insert into player_state(user_id, slot, gold, hp, max_hp, accrued_to, version)
       select ('00000000-0000-4000-a000-' || lpad(to_hex(g),12,'0'))::uuid, 0,
              500 + g, 50, 50, now() - interval '5 minutes', 1
         from generate_series($1::int, $2::int) g
       on conflict do nothing`, [lo, hi - 1]);
    await db.query(
      `insert into player_skills(user_id, slot, skill_id, xp)
       select ('00000000-0000-4000-a000-' || lpad(to_hex(g),12,'0'))::uuid, 0, s.skill_id, 1000 + g
         from generate_series($1::int, $2::int) g
         cross join (select skill_id from hr_skills order by skill_id limit $3) s
       on conflict do nothing`, [lo, hi - 1, PER_CHAR.skills]);
    await db.query(
      `insert into player_inventory(user_id, slot, item_id, qty)
       select ('00000000-0000-4000-a000-' || lpad(to_hex(g),12,'0'))::uuid, 0, i.item_id, 10
         from generate_series($1::int, $2::int) g
         cross join (select item_id from hr_items order by item_id limit $3) i
       on conflict do nothing`, [lo, hi - 1, PER_CHAR.inventory]);
    await db.query(
      `insert into player_equipment(user_id, slot, equip_slot, item_id)
       select ('00000000-0000-4000-a000-' || lpad(to_hex(g),12,'0'))::uuid, 0, e.equip_slot, e.item_id
         from generate_series($1::int, $2::int) g
         cross join (select distinct on (s.equip_slot) s.equip_slot, s.item_id
                       from hr_item_slots s order by s.equip_slot, s.item_id limit $3) e
       on conflict do nothing`, [lo, hi - 1, PER_CHAR.equipment]);
    await db.query(
      `insert into player_farm(user_id, slot, plot_idx, crop_id, planted_at)
       select ('00000000-0000-4000-a000-' || lpad(to_hex(g),12,'0'))::uuid, 0, k,
              (select crop_id from hr_crops order by crop_id limit 1), now() - interval '1 hour'
         from generate_series($1::int, $2::int) g
         cross join generate_series(0, $3::int - 1) k
       on conflict do nothing`, [lo, hi - 1, PER_CHAR.farm]);
    await db.query(
      `insert into player_progress(user_id, slot, kind, key, period_key, value)
       select ('00000000-0000-4000-a000-' || lpad(to_hex(g),12,'0'))::uuid, 0,
              'stat', 'ev:probe' || k, '', k
         from generate_series($1::int, $2::int) g
         cross join generate_series(1, $3::int) k
       on conflict do nothing`, [lo, hi - 1, PER_CHAR.progress]);
    await db.query(
      `insert into player_ledger(user_id, slot, kind, intent, gold, at, gold_in)
       select ('00000000-0000-4000-a000-' || lpad(to_hex(g),12,'0'))::uuid, 0,
              'accrue', 'probe', 1, now() - (k || ' minutes')::interval, 1
         from generate_series($1::int, $2::int) g
         cross join generate_series(1, $3::int) k`, [lo, hi - 1, PER_CHAR.ledger]);
    await db.exec('commit');
  }
  await db.exec('analyze');
  return (await q(db, 'select count(*)::int n from player_state'))[0].n;
}

/** Time a call INSIDE the database, so the number is execution cost and not
 *  PGlite's IPC.
 *
 *  ⚠ REPS IS NOT PADDING. PGlite's clock_timestamp() resolves to ~1 ms, so a
 *  0.4 ms function times as "0" and a 1.2 ms one as "1" — the first run of this
 *  harness reported hr_rate_gate and hr_seed as exactly 0.000 ms, which is not a
 *  measurement, it is a rounding artefact that would have made every ratio in
 *  the model wrong. Each SAMPLE therefore times a BATCH of `reps` calls and
 *  divides, which buys three significant figures out of a millisecond clock.
 *  Returns a per-call ms list. */
async function timeInDb(db, label, body, iters, reps = 40) {
  await db.exec('create temp table if not exists _lp(k text, ms double precision)');
  await db.query('delete from _lp where k = $1', [label]);
  /* ⚠ AND IT ROTATES CHARACTERS. Hammering ONE row measures a fully cached
     btree leaf and reports the same number at 35 players and at 3,500 — i.e. it
     would prove the thing it is supposed to test, by construction. Sampling a
     spread of characters is what makes the 100x number mean anything. */
  await db.exec(`do $LP$
declare ids uuid[]; u uuid; s int; t0 timestamptz; i int; j int;
begin
  select array_agg(user_id order by user_id) into ids
    from (select user_id from player_state order by md5(user_id::text) limit 200) x;
  for i in 1..${iters} loop
    t0 := clock_timestamp();
    for j in 1..${reps} loop
      u := ids[1 + ((i * ${reps} + j) % array_length(ids,1))];
      s := 0;
      ${body}
    end loop;
    insert into _lp values ('${label}', extract(epoch from (clock_timestamp()-t0))*1000 / ${reps});
  end loop;
end $LP$;`);
  return (await q(db, 'select ms from _lp where k = $1', [label])).map((r) => Number(r.ms));
}

/** The one write we cannot loop: hr_apply BUMPS version and consumes an intent
 *  key, so each iteration needs a fresh key and the version it just produced.
 *  Done inside one DO block so the timing excludes harness round-trips. */
async function timeApply(db, iters, reps = 8) {
  await db.exec('create temp table if not exists _lp(k text, ms double precision)');
  await db.query("delete from _lp where k = 'hr_apply'");
  /* ⚠ THE ROLE IS SET AROUND THE CALL AND ONLY AROUND THE CALL. `hr_engine`
     holds ZERO table privileges — that is the entire point of the design — so a
     block that sets the role once and then reads `player_state.version` for the
     next iteration gets `permission denied for table player_state`, which reads
     like a broken database and is in fact the security model working. */
  await db.exec(`do $LP$
declare ids uuid[]; u uuid; s int; v bigint; t0 timestamptz; i int; j int; r jsonb; itm text; el double precision;
begin
  select array_agg(user_id order by user_id) into ids
    from (select user_id from player_state order by md5(user_id::text) limit 200) x;
  select item_id into itm from hr_items where tradeable order by item_id limit 1;
  for i in 1..${iters} loop
    /* ⚠ ONE CHARACTER PER SAMPLE. hr_apply rate-limits itself at 240/min PER
       USER (apply-engine.sql:507) — a real, correct control that a single-row
       benchmark trips at sample 7 and then reads as "the database broke". N
       players each accruing is also what production looks like. */
    u := ids[1 + (i % array_length(ids,1))];
    s := 0;
    select version into v from player_state where user_id = u and slot = s;
    set local role hr_engine;
    t0 := clock_timestamp();
    for j in 1..${reps} loop
      r := public.hr_apply(u, s, v + (j - 1), gen_random_uuid(),
             jsonb_build_object(
               'gold', 25,
               'items', jsonb_build_object(itm, 2),
               'xp', jsonb_build_object('attack', 120, 'hitpoints', 40),
               'accrued_to', 'now',
               'journal', jsonb_build_object('kind','accrue','intent','probe')));
      exit when coalesce(r->>'ok','') <> 'true';
    end loop;
    el := extract(epoch from (clock_timestamp()-t0))*1000 / ${reps};
    reset role;
    insert into _lp values ('hr_apply', el);
    if coalesce(r->>'ok','') <> 'true' then
      raise exception 'hr_apply refused at sample %: %', i, r::text;
    end if;
  end loop;
end $LP$;`);
  return (await q(db, "select ms from _lp where k = 'hr_apply'")).map((r) => Number(r.ms));
}

/** The plan shape is the whole scalability question: an index scan costs the
 *  same at 35 characters and at 35,000; a sequential scan costs N. */
async function planShapes(db) {
  const [{ user_id: u, slot: s }] = await q(db, 'select user_id, slot from player_state order by md5(user_id::text) limit 1');
  const targets = {
    player_state: 'select * from player_state where user_id = $1 and slot = $2',
    player_skills: 'select * from player_skills where user_id = $1 and slot = $2',
    player_inventory: 'select * from player_inventory where user_id = $1 and slot = $2',
    player_equipment: 'select * from player_equipment where user_id = $1 and slot = $2',
    player_farm: 'select * from player_farm where user_id = $1 and slot = $2',
    player_progress: 'select * from player_progress where user_id = $1 and slot = $2',
    player_ledger_day: "select coalesce(sum(gold_in),0) from player_ledger where user_id = $1 and slot = $2 and at >= date_trunc('day', now())",
  };
  const res = {};
  for (const [name, sql] of Object.entries(targets)) {
    const rows = await q(db, `explain (analyze, buffers, format json) ${sql}`, [u, s]);
    const plan = rows[0]['QUERY PLAN'][0].Plan;
    const nodes = [];
    (function walk(n) { nodes.push(n['Node Type']); (n.Plans || []).forEach(walk); })(plan);
    res[name] = {
      nodes,
      seq: nodes.some((t) => t === 'Seq Scan'),
      rows_removed: plan['Rows Removed by Filter'] ?? null,
      actual_ms: rows[0]['QUERY PLAN'][0]['Execution Time'],
    };
  }
  return res;
}

/** Global-serialization sweep. A per-character lock is fine and is the design;
 *  a CONSTANT lock key, a shared counter row or a global sequence on the hot
 *  path is what turns N players into one queue. This reads the LIVE function
 *  bodies rather than the migration text, because the body is what runs. */
async function serializationSweep(db) {
  const rows = await q(db, `
    select p.proname,
           (select count(*) from regexp_matches(p.prosrc,'pg_advisory[a-z_]*lock','g')) as locks,
           coalesce((select array_agg(m[1]) from regexp_matches(p.prosrc,'pg_advisory[a-z_]*lock\\s*\\(([^;]{0,120})','g') m), '{}') as lock_args,
           (select count(*) from regexp_matches(p.prosrc,'lock table','gi')) as table_locks
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('hr_apply','hr_state_of','hr_rate_gate','hr_seed','hr_perks_of',
                         'hr_offline_cap_ms','hr_day_budget_used','hr_total_level')
     order by p.proname`);
  const findings = [];
  for (const r of rows) {
    for (const a of (r.lock_args || [])) {
      const perChar = /hashtext|user|uid/i.test(a);
      findings.push({ fn: r.proname, arg: String(a).trim().replace(/\s+/g, ' '), per_character: perChar });
    }
    if (Number(r.table_locks) > 0) findings.push({ fn: r.proname, arg: 'LOCK TABLE', per_character: false });
  }
  return findings;
}

async function runDb() {
  p('══ DB SIDE — full migration chain replayed into PGlite ═════════════════');
  const t0 = Date.now();
  const { db, applied, failures } = await bootReplay({});
  /* --trace names the statement that failed. Without it a PGlite error arrives
     with a WASM stack and no SQL, which cost an hour the first time. */
  if (has('--trace')) {
    const oq = db.query.bind(db); const oe = db.exec.bind(db);
    const shorten = (s) => String(s).replace(/\s+/g, ' ').slice(0, 140);
    db.query = async (s, prm) => { try { return await oq(s, prm); } catch (e) { e.message += `\n  SQL: ${shorten(s)}`; throw e; } };
    db.exec = async (s) => { try { return await oe(s); } catch (e) { e.message += `\n  SQL: ${shorten(s)}`; throw e; } };
  }
  p(`   chain: ${applied.length} migrations applied, ${failures.length} failures, ${Date.now() - t0} ms`);
  if (failures.length) throw Object.assign(new Error('chain did not replay'), { harness: true });

  const res = { boot_ms: Date.now() - t0, migrations: applied.length, scales: [], serialization: null };

  res.serialization = await serializationSweep(db);
  p('');
  p('   SERIALIZATION SWEEP (the difference between N players and one queue)');
  for (const f of res.serialization) {
    p(`     ${f.per_character ? 'per-character OK ' : '⚠ GLOBAL        '} ${f.fn}: ${f.arg.slice(0, 80)}`);
  }
  const globals = res.serialization.filter((f) => !f.per_character);
  assert('no global serialization on the accrue path', globals.length === 0,
    globals.length ? globals.map((g) => `${g.fn}:${g.arg}`).join('; ') : 'every lock is keyed on (user, slot)');

  for (const mult of SCALES) {
    const target = GROUND.live_characters * mult;
    const t1 = Date.now();
    const chars = await populate(db, target, Math.min(3, target));
    const popMs = Date.now() - t1;

    const sizes = Object.fromEntries((await q(db, `
      select relname, n_live_tup::int
        from pg_stat_user_tables
       where schemaname='public' and relname like 'player_%'
       order by relname`)).map((r) => [r.relname, r.n_live_tup]));

    const m = {};
    m.hr_rate_gate = stats(await timeInDb(db, 'gate', "perform public.hr_rate_gate(u, s, 'accrue');", ITERS));
    m.hr_state_of = stats(await timeInDb(db, 'state', 'perform public.hr_state_of(u, s);', ITERS));
    m.hr_offline_cap_ms = stats(await timeInDb(db, 'cap', 'perform public.hr_offline_cap_ms(u, s);', ITERS));
    m.hr_seed = stats(await timeInDb(db, 'seed', "perform public.hr_seed(u, s, 'accrue:probe');", ITERS));
    m.hr_perks_of = stats(await timeInDb(db, 'perks', 'perform public.hr_perks_of(u, s);', ITERS));
    m.hr_day_budget_used = stats(await timeInDb(db, 'budget', 'perform public.hr_day_budget_used(u, s, now());', ITERS));
    m.hr_apply = stats(await timeApply(db, Math.min(ITERS, 25)));

    const plans = await planShapes(db);

    /* EGRESS. Every accrue returns the WHOLE envelope — inventory, seventeen
       skills, farm, progress — so the response body, not the request rate, is
       what bills. Measured, not guessed, because a 4 KB envelope at 550 players
       is ~9 GB/month and a 40 KB one is ~90 GB against a 250 GB allowance. */
    const [{ b }] = await q(db, `
      select max(octet_length(public.hr_state_of(user_id, slot)::text)) b
        from (select user_id, slot from player_state order by md5(user_id::text) limit 25) x`);
    const envelopeBytes = Number(b);

    // The DB cost of ONE accrue request, as the Edge Function actually issues it.
    const perRequest = {
      idle_p50: m.hr_rate_gate.p50 + m.hr_state_of.p50 + m.hr_offline_cap_ms.p50
              + 2 * m.hr_seed.p50 + m.hr_perks_of.p50,
      paying_p50: m.hr_rate_gate.p50 + m.hr_state_of.p50 + m.hr_offline_cap_ms.p50
                + 2 * m.hr_seed.p50 + m.hr_perks_of.p50 + m.hr_apply.p50,
      paying_p95: m.hr_rate_gate.p95 + m.hr_state_of.p95 + m.hr_offline_cap_ms.p95
                + 2 * m.hr_seed.p95 + m.hr_perks_of.p95 + m.hr_apply.p95,
    };

    res.scales.push({ mult, characters: chars, populate_ms: popMs, sizes, ms: m, plans, perRequest, envelopeBytes });

    p('');
    p(`   ── ${mult}x  (${chars} characters · ${sizes.player_ledger ?? 0} ledger rows · populated in ${popMs} ms)`);
    p(`      hr_state_of envelope: ${envelopeBytes.toLocaleString()} bytes`);
    p('      call                    p50 ms   p95 ms');
    for (const [k, v] of Object.entries(m)) {
      p(`      ${k.padEnd(22)} ${fx(v.p50, 3).padStart(8)} ${fx(v.p95, 3).padStart(8)}`);
    }
    p(`      ACCRUE REQUEST (paying) p50 ${fx(perRequest.paying_p50, 3)} ms   p95 ${fx(perRequest.paying_p95, 3)} ms`);
    p('      plan shapes:');
    for (const [t, v] of Object.entries(plans)) {
      p(`        ${v.seq ? '⚠ SEQ ' : '  idx '} ${t.padEnd(20)} ${v.nodes.join(' > ')}`);
    }
  }

  // ── THE ASSERTION THAT MATTERS. ──────────────────────────────────────────
  // A per-player read whose plan is a Seq Scan costs O(total players) per
  // request, so total DB work grows as N^2 and the game gets slower for
  // everybody every time somebody signs up. At the LARGEST scale probed, every
  // per-character read must be an index path.
  const last = res.scales[res.scales.length - 1];
  const seqAtScale = Object.entries(last.plans).filter(([, v]) => v.seq).map(([k]) => k);
  assert(`no sequential scan on a per-character read at ${last.mult}x (${last.characters} characters)`,
    seqAtScale.length === 0,
    seqAtScale.length ? `seq scan: ${seqAtScale.join(', ')}` : 'all index paths');

  // Cost per request must be FLAT across scales, not linear. Allow 2x drift for
  // btree depth + cache effects; anything beyond that is a scan in disguise.
  if (res.scales.length > 1) {
    const a = res.scales[0].perRequest.paying_p50;
    const b = last.perRequest.paying_p50;
    const growth = b / a;
    const scaleFactor = last.mult / res.scales[0].mult;
    assert(`per-request DB cost is flat in player count (${fx(growth)}x cost for ${scaleFactor}x players)`,
      growth < 2.0, `${fx(a, 3)} ms -> ${fx(b, 3)} ms`);
  }

  out.db = res;
  return res;
}

// ════════════════════════════════════════════════════════════════════════════
// FN SIDE — bounded, sequential, auth-only. Never floods.
// ════════════════════════════════════════════════════════════════════════════

async function runFn() {
  const { readFile } = await import('node:fs/promises');
  const boot = await readFile(new URL('../src/net/supabase-bootstrap.js', import.meta.url), 'utf8');
  const url = (boot.match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [])[0];
  const anon = (boot.match(/eyJ[A-Za-z0-9_\-.]{40,}/) || [])[0];
  if (!url || !anon) throw Object.assign(new Error('could not read project url/anon key'), { harness: true });
  const endpoint = `${url}/functions/v1/hr-accrue`;

  p('══ FN SIDE — deployed hr-accrue, bounded auth-only probe ════════════════');
  p(`   endpoint : ${endpoint}`);
  p(`   requests : ${FN_N} per path, SEQUENTIAL (cap ${MAX_FN_REQUESTS})`);
  p('   paths    : GET (health, no auth, no DB) and POST with the ANON key');
  p('              (a validly SIGNED token whose role is not `authenticated`,');
  p('              so it is refused BEFORE hr_rate_gate — no player is touched)');
  p('');

  const one = async (init) => {
    const t = performance.now();
    let status = 0; let body = '';
    try {
      const r = await fetch(endpoint, init);
      status = r.status; body = (await r.text()).slice(0, 160);
    } catch (e) { status = -1; body = String(e?.message || e); }
    return { ms: performance.now() - t, status, body };
  };

  const res = { endpoint, get: null, post_anon: null, cold: null, payload_sha256: null };

  const gets = [];
  for (let i = 0; i < FN_N; i++) gets.push(await one({ method: 'GET', headers: { apikey: anon, Authorization: `Bearer ${anon}` } }));
  res.cold = gets[0].ms;
  try { res.payload_sha256 = JSON.parse(gets.find((g) => g.status === 200)?.body || '{}').payload_sha256 ?? null; } catch { /* shape probe only */ }
  res.get = { ...stats(gets.slice(1).map((g) => g.ms)), first_ms: gets[0].ms, statuses: [...new Set(gets.map((g) => g.status))] };

  const posts = [];
  for (let i = 0; i < FN_N; i++) {
    posts.push(await one({
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ verb: 'accrue', slot: 0 }),
    }));
  }
  res.post_anon = { ...stats(posts.map((x) => x.ms)), statuses: [...new Set(posts.map((x) => x.status))], sample: posts[0].body };

  p(`   GET  health   first(cold) ${fx(res.cold)} ms · warm p50 ${fx(res.get.p50)} ms · p95 ${fx(res.get.p95)} ms · status ${res.get.statuses.join(',')}`);
  p(`   POST anon-key p50 ${fx(res.post_anon.p50)} ms · p95 ${fx(res.post_anon.p95)} ms · status ${res.post_anon.statuses.join(',')}`);
  p(`   body: ${res.post_anon.sample}`);
  p(`   deployed payload_sha256: ${res.payload_sha256 ?? '—'}`);

  // The anon key is a valid SIGNED token with role `anon`. If it is ever
  // accepted, the identity seam has regressed and an unauthenticated caller can
  // read any player's envelope (design §2a-iii, review D2).
  assert('the project anon key cannot accrue (role is not `authenticated`)',
    res.post_anon.statuses.every((s) => s === 401 || s === 403),
    `statuses ${res.post_anon.statuses.join(',')}`);

  out.fn = res;
  return res;
}

// ════════════════════════════════════════════════════════════════════════════
// THE MODEL — what the two halves mean in players
// ════════════════════════════════════════════════════════════════════════════

function runModel(db, fn) {
  // DB ms per accrue: prefer the PGlite measurement at the largest scale, but
  // calibrate it against production's measured hr_state_of so the absolute
  // number is a production-equivalent rather than a WASM number.
  let dbMs = null; let calib = 1; let source = 'production spot-checks only';
  if (db && db.scales.length) {
    const last = db.scales[db.scales.length - 1];
    const first = db.scales[0];
    calib = GROUND.prod_ms.hr_state_of.p50 / first.ms.hr_state_of.p50;
    dbMs = last.perRequest.paying_p50 * calib;
    source = `PGlite ${last.mult}x (${last.characters} chars) x ${fx(calib, 3)} production calibration`;
  } else {
    const g = GROUND.prod_ms;
    dbMs = g.hr_rate_gate.p50 + g.hr_state_of.p50 + g.hr_offline_cap_ms.p50 + 2 * g.hr_seed.p50 + g.hr_perks_of.p50;
  }

  /* Requests per second at N SIMULTANEOUSLY-PLAYING players, from the measured
     intensity rather than the cadence (see MEASURED). ~599 invocations per
     active player-day over ~4.5 h of play is ~133 per player-hour. */
  const INV_PER_PLAYER_HOUR = MEASURED.per_active_player_day / 4.5;
  const rps = (players) => players * INV_PER_PLAYER_HOUR / 3600;
  // Connection-seconds per request: the DB work is spread over 3 pooled
  // transactions, and a pooled connection is held only for the duration of each
  // statement in transaction mode. Round trip between transactions releases it.
  const connSecPerReq = (dbMs / 1000);

  // Ceilings.
  const poolServer = Math.min(GROUND.engine_role_connlimit, GROUND.max_connections - GROUND.auth_connections - 12);
  const ceilingByPool = Math.floor((poolServer / connSecPerReq) * (CADENCE_MS / 1000));
  const ceilingByCpu = Math.floor((GROUND.cpu_cores * 1000 / dbMs) * (CADENCE_MS / 1000));
  const ceilingByRate = null; // per-user bucket; not a global ceiling by construction
  const ceilingByClient = GROUND.connections_pooler; // max_client_conn, only reachable if every isolate holds a connection

  /* ── THE CEILING NOBODY EXPECTS: THE PLAN'S OWN QUOTAS ────────────────────
     The accrue path is cheap in CPU and cheaper still in connections, so the
     first wall this game hits is not a performance wall — it is an INVOICE.
     Pro includes 2,000,000 Edge Function invocations and 250 GB egress per
     month. A player at a 90 s cadence generates 40 invocations per hour of play,
     each returning the whole hr_state_of envelope. Both numbers below are
     "players who play HOURS_PER_DAY hours a day, every day, for a month". */
  const HOURS_PER_DAY = 4.5;
  const invPerPlayerMonth = MEASURED.per_active_player_day * 30;
  const envBytes = (db && db.scales.length) ? db.scales[db.scales.length - 1].envelopeBytes : null;
  const bytesPerPlayerMonth = envBytes ? envBytes * invPerPlayerMonth : null;
  const ceilingByInvocations = Math.floor(QUOTA.invocations_month / invPerPlayerMonth);
  const ceilingByEgress = bytesPerPlayerMonth
    ? Math.floor(QUOTA.egress_gb_month * 1e9 / bytesPerPlayerMonth) : null;

  /* Supavisor CLIENT connections. 94 % of invocations boot a fresh isolate
     (MEASURED.boots), so each one opens its OWN pooled connection and holds it
     for the whole request — the p50 wall clock, not the 12 ms of SQL inside it.
     max_client_conn is therefore a CONCURRENCY limit on in-flight accruals. */
  const inFlightPerPlayer = (MEASURED.exec_ms.p50 / 1000) * INV_PER_PLAYER_HOUR / 3600;
  const ceilingByClientConns = Math.floor(GROUND.connections_pooler / inFlightPerPlayer);

  const scenarios = [];
  const list = PLAYERS ? [PLAYERS] : [10, GROUND.live_users, 55, 200, 550, 2000];
  for (const n of list) {
    const r = rps(n);
    scenarios.push({
      players: n,
      req_per_s: r,
      tx_per_s_paying: r * TX_PER_ACCRUE_PAYING,
      db_ms_per_s: r * dbMs,
      db_utilisation_pct: (r * dbMs) / (GROUND.cpu_cores * 1000) * 100,
      engine_conns_needed: r * connSecPerReq,
    });
  }

  const model = {
    cadence_ms: CADENCE_MS, server_floor_ms: SERVER_FLOOR_MS, rate_per_min: RATE_PER_MIN,
    db_ms_per_request: dbMs, source, calibration: calib,
    tx_per_request: { paying: TX_PER_ACCRUE_PAYING, idle: TX_PER_ACCRUE_IDLE },
    envelope_bytes: envBytes,
    hours_per_day: HOURS_PER_DAY,
    invocations_per_player_month: invPerPlayerMonth,
    bytes_per_player_month: bytesPerPlayerMonth,
    ceilings: {
      engine_pool_backends: poolServer,
      players_by_engine_pool: ceilingByPool,
      players_by_db_cpu: ceilingByCpu,
      players_by_pooler_clients: ceilingByClient,
      players_by_rate_gate: ceilingByRate,
      players_by_function_invocations: ceilingByInvocations,
      players_by_egress: ceilingByEgress,
      players_by_pooler_client_conns: ceilingByClientConns,
    },
    measured: MEASURED,
    inv_per_player_hour: INV_PER_PLAYER_HOUR,
    scenarios,
  };

  p('');
  p('══ THE MODEL ═══════════════════════════════════════════════════════════');
  p(`   cadence        : ${CADENCE_MS / 1000} s settle (src/net/accrue.js SETTLE_INTERVAL_MS), floor ${SERVER_FLOOR_MS / 1000} s`);
  p(`   MEASURED rate  : ${fx(INV_PER_PLAYER_HOUR, 0)} invocations per active player-HOUR`);
  p(`                    (${fx(MEASURED.per_active_player_day, 0)}/player-day on ${MEASURED.day}; the cadence alone predicts 40 — intents are the rest)`);
  p(`   DB per request : ${fx(dbMs, 3)} ms  (${source})`);
  p(`   WALL per req   : ${MEASURED.exec_ms.p50} ms p50 / ${MEASURED.exec_ms.p95} ms p95 (edge logs) — ${fx(100 * dbMs / MEASURED.exec_ms.p50, 1)} % of it is database`);
  p(`   isolate        : ${MEASURED.boots} boots / ${MEASURED.post_invocations} POSTs = ${fx(100 * MEASURED.boots / MEASURED.post_invocations, 0)} % cold; boot ${MEASURED.boot_ms} ms;`);
  p(`                    shutdown reason ${MEASURED.shutdown_reason}, CPU ${MEASURED.cpu_ms_per_isolate.join('-')} ms of a 200 ms soft limit -> NOT CPU-bound`);
  p(`   transactions   : ${TX_PER_ACCRUE_PAYING} pooled per paying request, ${TX_PER_ACCRUE_IDLE} when idle`);
  p('');
  p('   players   req/s   tx/s   DB ms/s   DB busy %   engine conns');
  for (const s of scenarios) {
    p(`   ${String(s.players).padStart(7)} ${fx(s.req_per_s).padStart(7)} ${fx(s.tx_per_s_paying).padStart(6)} `
      + `${fx(s.db_ms_per_s, 1).padStart(9)} ${fx(s.db_utilisation_pct, 2).padStart(11)} ${fx(s.engine_conns_needed, 3).padStart(14)}`);
  }
  p('');
  /* ⚠ THE ENGINE-POOL CEILING IS NOT A REAL NUMBER AND MUST NOT BE QUOTED AS
     ONE. Transaction mode returns the server backend at the end of each
     statement, and the SQL inside an accrue is ~12 ms of a ~1,240 ms request —
     so "how many players fit in 20 backends" divides by a duty cycle of 1 % and
     produces six figures. It is printed to show that the pool is NOT the
     constraint, which is the only thing it can honestly say. The binding
     connection number is the CLIENT side: a cold isolate holds one Supavisor
     client slot for the WHOLE request. */
  p(`   ceiling · engine server pool (${poolServer} backends) : not binding (~${ceilingByPool.toLocaleString()}; 1 % duty cycle — see comment)`);
  p(`   ceiling · DB CPU (${GROUND.cpu_cores} shared cores)   : ~${ceilingByCpu.toLocaleString()} simultaneously-playing players`);
  p(`   ceiling · pooler CLIENT slots (${GROUND.connections_pooler})    : ~${ceilingByClientConns.toLocaleString()} simultaneously-playing players`);
  p('');
  p(`   ── the PLAN quotas, at the MEASURED intensity (~${fx(HOURS_PER_DAY, 1)} h/day/player) ──`);
  p(`   invocations per player-month : ${invPerPlayerMonth.toLocaleString()}`);
  p(`   ceiling · ${(QUOTA.invocations_month / 1e6)}M invocations/mo  : ~${ceilingByInvocations.toLocaleString()} DAILY-active players (then $${QUOTA.invocation_overage_usd_per_m} / extra million)`);
  if (envBytes) {
    p(`   envelope                     : ${envBytes.toLocaleString()} bytes -> ${fx(bytesPerPlayerMonth / 1e6, 1)} MB per player-month`);
    p(`   ceiling · ${QUOTA.egress_gb_month} GB egress/mo   : ~${ceilingByEgress.toLocaleString()} daily-active players`);
  }

  // The accrue path must not be the thing that runs out first. If a plan quota
  // is reached at fewer players than the DB can serve, the honest verdict is a
  // COST decision, not a performance one — and it has to be said out loud.
  const first = Object.entries({
    'engine pool': ceilingByPool, 'DB CPU': ceilingByCpu,
    'function invocations': ceilingByInvocations,
    'pooler client connections': ceilingByClientConns,
    ...(ceilingByEgress ? { egress: ceilingByEgress } : {}),
  }).sort((a, b) => a[1] - b[1])[0];
  model.first_bottleneck = { surface: first[0], players: first[1] };
  p('');
  p(`   FIRST BOTTLENECK: ${first[0]} at ~${first[1].toLocaleString()} players`);

  /* ── THE TWO VERDICTS, DERIVED NOT ASSUMED ──────────────────────────────
     TARGET is the imminent beta wave: 34 accounts that already hold a
     character, plus the 20 keys in the launch plan = 54 accounts. Launch day
     put 24 of 24 existing accounts into game_events, so a 100 % DAU rate on a
     wave day is the pessimistic and observed case -> 54 daily-active.
     HEADROOM is 10x that, which is the number a "will it scale" question
     actually means. They are asserted SEPARATELY because they have different
     answers, and collapsing them into one verdict is how a real ceiling gets
     hidden behind a comfortable one. */
  const TARGET_DAU = 54;
  const HEADROOM_DAU = TARGET_DAU * 10;
  model.target_dau = TARGET_DAU;
  model.headroom_dau = HEADROOM_DAU;
  model.target_margin = first[1] / TARGET_DAU;

  assert(`the beta wave (${TARGET_DAU} daily-active) clears every ceiling with 2x margin`,
    first[1] >= TARGET_DAU * 2,
    `first ceiling is ${first[0]} at ~${first[1].toLocaleString()} — ${fx(first[1] / TARGET_DAU, 1)}x the wave`);

  assert(`10x the beta wave (${HEADROOM_DAU} daily-active) clears every ceiling`,
    first[1] >= HEADROOM_DAU,
    first[1] >= HEADROOM_DAU
      ? `first ceiling is ${first[0]} at ~${first[1].toLocaleString()}`
      : `${first[0]} caps at ~${first[1].toLocaleString()}, i.e. ${fx(first[1] / TARGET_DAU, 1)}x the wave. `
        + 'Cheapest mitigation: cut invocations per player-hour '
        + '(SETTLE_INTERVAL_MS 90s -> 180s halves the settle half; the server prices '
        + 'the span from accrued_to so NOTHING is lost), then check the Spend Cap.');

  // The DB is not allowed to be the thing that breaks, at either number.
  const dbCeil = Math.min(ceilingByCpu, ceilingByPool, ceilingByClientConns);
  assert(`the DATABASE is not the first bottleneck (DB/pooler ceiling ~${dbCeil.toLocaleString()})`,
    dbCeil > ceilingByInvocations,
    `db/pooler ${dbCeil.toLocaleString()} vs quota ${ceilingByInvocations.toLocaleString()}`);

  out.model = model;
  return model;
}

// ════════════════════════════════════════════════════════════════════════════
// LIVE — the health numbers, read-only, so the check outlives this session.
//
// Every query here is a SELECT. Nothing writes, nothing locks, nothing a player
// can feel. Run it before and after a wave. It needs a Supabase personal access
// token (~/.supabase-token) because half the answers are platform facts the
// database cannot see — the invocation count, the isolate lifecycle, the plan.
// ════════════════════════════════════════════════════════════════════════════

const LIVE_SQL = {
  players: `select
      (select count(*) from player_state)                        as characters,
      (select count(distinct user_id) from player_state)         as users,
      (select count(*) from profiles)                            as profiles,
      (select count(*) from beta_invites)                        as invites,
      (select count(*) from beta_invites where used_by is not null) as invites_used`,
  connections: `select
      current_setting('max_connections')::int                    as max_connections,
      (select count(*) from pg_stat_activity)                    as total,
      (select count(*) from pg_stat_activity where state='active') as active,
      (select count(*) from pg_stat_activity where usename='hr_engine_login') as engine,
      (select rolconnlimit from pg_roles where rolname='hr_engine_login')     as engine_cap`,
  size: `select pg_database_size(current_database())             as db_bytes,
      (select pg_total_relation_size('public.player_ledger'))    as ledger_bytes,
      (select count(*) from player_ledger)                       as ledger_rows,
      (select retain_days from hr_ledger_config)                 as ledger_retain_days,
      (select count(*) from player_ledger_rollup)                as rollup_rows`,
  // A per-character read that has gone sequential is the O(N-squared) failure
  // this whole exercise exists to rule out. Cheap to check, so check it forever.
  scans: `select relname, seq_scan, idx_scan, n_live_tup
      from pg_stat_user_tables
     where schemaname='public'
       and relname in ('player_state','player_skills','player_inventory',
                       'player_equipment','player_farm','player_progress','player_ledger')
     order by relname`,
  rejections: `select code, severity, sum(n)::bigint as total, max(last_at) as last_seen
      from hr_rejections where last_at > now() - interval '7 days'
      group by 1,2 order by total desc limit 12`,
  cron: `select j.jobname, j.schedule, j.active,
      max(d.start_time) filter (where d.status='succeeded') as last_ok,
      count(*) filter (where d.status='failed' and d.start_time > now() - interval '24 hours') as fails_24h
      from cron.job j left join cron.job_run_details d on d.jobid=j.jobid
     group by 1,2,3 order by 1`,
};

async function runLive() {
  p('══ LIVE — production health, read-only ═════════════════════════════════');
  const { readFile } = await import('node:fs/promises');
  const { homedir } = await import('node:os');
  let token = '';
  try { token = (await readFile(`${homedir()}/.supabase-token`, 'utf8')).trim(); } catch { /* optional */ }
  const REF = GROUND.project;
  const api = async (path, qs = '') => {
    if (!token) return null;
    const r = await fetch(`https://api.supabase.com/v1/${path}${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    return r.ok ? r.json() : { error: r.status };
  };

  const res = { sql: {}, platform: {} };
  p('   SQL probes must be run through the Supabase MCP `execute_sql` or psql;');
  p('   this mode prints them so the check is reproducible verbatim:');
  for (const [k, sql] of Object.entries(LIVE_SQL)) {
    p(`\n   -- ${k}\n   ${sql.replace(/\n\s+/g, '\n     ')}`);
    res.sql[k] = sql;
  }

  if (token) {
    p('');
    const addons = await api(`projects/${REF}/billing/addons`);
    const backups = await api(`projects/${REF}/database/backups`);
    const compute = addons?.selected_addons?.find((a) => a.type === 'compute_instance')?.variant;
    res.platform = {
      compute: compute?.id ?? null,
      connections_direct: compute?.meta?.connections_direct ?? null,
      connections_pooler: compute?.meta?.connections_pooler ?? null,
      pitr_enabled: backups?.pitr_enabled ?? null,
      backups_retained: backups?.backups?.length ?? null,
      newest_backup: backups?.backups?.[0]?.inserted_at ?? null,
    };
    p(`   compute ${res.platform.compute} · direct ${res.platform.connections_direct} · pooler ${res.platform.connections_pooler}`);
    p(`   backups ${res.platform.backups_retained} retained, newest ${res.platform.newest_backup} · PITR ${res.platform.pitr_enabled}`);

    // Invocations in the last 24 h, against the monthly quota. This is the
    // number that decides the verdict, and it is not visible from SQL.
    const end = new Date().toISOString();
    const start = new Date(Date.now() - 24 * 3600e3).toISOString();
    const sql = encodeURIComponent('select count(*) as n from function_edge_logs');
    const inv = await api(`projects/${REF}/analytics/endpoints/logs.all`,
      `?sql=${sql}&iso_timestamp_start=${start}&iso_timestamp_end=${end}`);
    const n = inv?.result?.[0]?.n ?? null;
    res.platform.invocations_24h = n;
    if (n !== null) {
      const monthly = n * 30;
      p(`   invocations last 24 h: ${n.toLocaleString()} -> ${monthly.toLocaleString()}/month `
        + `= ${fx(100 * monthly / QUOTA.invocations_month, 1)} % of the ${QUOTA.invocations_month / 1e6}M quota`);
      assert('projected monthly Edge Function invocations are under 80 % of the Pro quota',
        monthly < QUOTA.invocations_month * 0.8,
        `${monthly.toLocaleString()} / ${QUOTA.invocations_month.toLocaleString()}`);
    }
    assert('daily backups exist and are recent (durability, not capacity — but it is the same alarm clock)',
      (res.platform.backups_retained ?? 0) >= 7
      && Date.now() - Date.parse(res.platform.newest_backup ?? 0) < 36 * 3600e3,
      `${res.platform.backups_retained} retained, newest ${res.platform.newest_backup}, PITR ${res.platform.pitr_enabled}`);
  } else {
    p('   (no ~/.supabase-token — platform half skipped)');
  }

  out.live = res;
  return res;
}

// ════════════════════════════════════════════════════════════════════════════
(async () => {
  let db = null; let fn = null;
  try {
    if (WANT_DB) db = await runDb();
    if (WANT_FN) fn = await runFn();
    if (has('--live')) await runLive();
    if (WANT_MODEL) runModel(db, fn);
  } catch (e) {
    if (e?.harness) { p(`\nHARNESS: ${e.message}`); process.exit(2); }
    p(`\nFAILED: ${e?.stack || e}`);
    process.exit(2);
  }

  p('');
  p('══ ASSERTIONS ══════════════════════════════════════════════════════════');
  let bad = 0;
  for (const a of out.assertions) {
    p(`   ${a.ok ? 'PASS' : 'FAIL'}  ${a.name}`);
    if (a.detail) p(`         ${a.detail}`);
    if (!a.ok) bad++;
  }

  if (JSON_OUT) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(JSON_OUT, JSON.stringify(out, null, 2));
    p(`\n   wrote ${JSON_OUT}`);
  }
  p('');
  p(bad ? `   ${bad} capacity property FAILED` : '   every capacity property held');
  process.exit(bad ? 1 : 0);
})();
