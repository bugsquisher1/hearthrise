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
// ── 2026-10-30 (lane/c-reliability-basics): RE-BASED ON THE GAME THAT SHIPS ─
//   · The logs read moved to GET /v1/projects/<ref>/analytics/endpoints/logs
//     (ClickHouse SQL over ONE `logs` table keyed by `source`, fields in the
//     `log_attributes` map, a window of at most 24 h). `logs.all` answers
//     410 Gone; --live died on it, and so did .github/workflows/edge-quota-watch.yml.
//   · The model is the HUNT SETTLE, not August's 90 s accrue: a viewed hunt is
//     settled by its browser every huntPollMs (16 s), an unviewed one by the
//     10 s world tick once it is flush_seconds (90 s) behind. Its inputs are
//     LIVE per-settle timings (SETTLE below), re-measurable with --settle.
//   · populate() follows the schema: gold lives on account_wallet since 10-19.
//   · Scales are multiples of the PLAYTEST, 10 players x 4 heroes = 40 heroes.
//
// ── USAGE ───────────────────────────────────────────────────────────────────
//   node tools/load-probe.mjs                      # --db at 1x,10x,100x + model
//   node tools/load-probe.mjs --db --scales 1,10   # cheaper run
//   node tools/load-probe.mjs --db --iters 60      # more samples per scale
//   node tools/load-probe.mjs --fn                 # bounded live-endpoint probe
//   node tools/load-probe.mjs --fn --n 12          # <= MAX_FN_REQUESTS
//   node tools/load-probe.mjs --model --players 200
//   node tools/load-probe.mjs --live               # production health, read-only (needs ~/.supabase-token)
//   node tools/load-probe.mjs --settle [--window 120]
//                                                  # live per-settle DB cost over a read-only
//                                                  # pg_stat_statements window, fed to the model
//   node tools/load-probe.mjs --json out.json      # machine-readable
//
// Exit 0 = every asserted capacity property held. Exit 1 = a property failed
// (see THE ASSERTIONS at the bottom). Exit 2 = harness/environment problem.
// ════════════════════════════════════════════════════════════════════════════

import { bootReplay } from '../tests/schema-replay.mjs';

// ── Ground truth, measured against nezapsylztqbbwuwembx on 2026-10-30 ───────
// Every number here was READ from the project, not assumed. Where a number is
// a platform default rather than something we set, it says so.
const GROUND = {
  project: 'nezapsylztqbbwuwembx',
  region: 'us-west-2',
  plan: 'pro',                       // GET /v1/organizations/<org>
  compute: 'ci_micro',               // GET /v1/projects/<ref>/billing/addons
  cpu_cores: 2,                      // "2-core ARM (shared)": bursts, then falls to a baseline
  /* ⚠ ASSUMED, NOT MEASURED: the sustained share of those 2 cores. Supabase says
     Nano..2XL "can burst to higher performance levels for short periods of
     time" and publishes no baseline; 1 GB / 2 ARM cores is AWS t4g.micro, whose
     baseline is 10 % per vCPU. The model prints the verdict at BOTH numbers and
     asserts on the burst one; the dashboard's CPU chart under real load is the
     only thing that settles which one production gets. */
  cpu_cores_baseline_assumed: 0.2,
  memory_gb: 1,
  max_connections: 60,               // select current_setting('max_connections')
  connections_pooler: 200,           // ci_micro meta.connections_pooler (max_client_conn)
  engine_role_connlimit: 20,         // pg_roles.rolconnlimit for hr_engine_login
  peak_connections_seen: 44,         // hr_db_samples.used_conns max, 10-21..10-30 (10-23 10:07)
  live_characters: 15,               // select count(*) from player_state
  live_users: 4,                     // select count(distinct user_id) from player_state
  db_bytes: 850832531,               // pg_database_size, 10-30 02:27 UTC
};

// THE PLAYTEST (Tyler 10-30): about 10 players, each up to 4 heroes hunting.
const PLAYTEST_PLAYERS = 10;
const HEROES_PER_PLAYER = 4;
const BASE_CHARACTERS = PLAYTEST_PLAYERS * HEROES_PER_PLAYER;

/* ── THE SETTLE, MEASURED (2026-10-30 02:31-02:40 UTC, production) ───────────
   One WATCHED 4-hero party (QA account, mosslight_glade), pg_stat_statements
   delta over 156 s (10 settles) and again over 19 s: hr_hunt_apply_instance
   416-463 ms a call, hr_state_of 82-88 ms a call (~4.2 a settle), the read
   statement 28 ms, hr_perks_of 4.5 ms (x10). 9,113 ms of hr_engine time / 10
   settles = 911 ms of database a 4-hero settle. Edge: function_edge_logs, the
   browser's POSTs to hr-accrue over 24 h to 10-30 02:30 (n = 6,546), and
   function_logs `shutdown` cpu_time_used (n = 2,691). --settle re-measures the
   database half on whatever is hunting when it runs. */
/* 2026-10-31 (lane/c-beta-capacity): 911 -> 407 ms = the live number / the PG17 replay's 2.24x (v0.2.74, applied
   10-30 20:33; no 4-hero party has hunted since, so this is DERIVED; the one live post-apply settle is a solo Mill
   Cellar at 68-85 ms, against 416-463 ms for four before). Cron re-measured over 606 s with nothing hunting: 10.2 ms/s
   (it was 3.0: that window excluded hr_cron_health and the prunes). */
const SETTLE = {
  measured: '2026-10-30 02:31 UTC 4-hero party / 2.24 (PG17 A/B, v0.2.74)',
  party_heroes: 4,
  db_ms_per_party_settle: 407,
  rest_db_ms_per_player_s: 6.3,      // `authenticated` PostgREST time, one active player, same window
  cron_db_ms_per_s: 10.2,            // every postgres-role statement over 606 s, 10-31 03:59 UTC, nothing hunting
  poll_ms: 16000,                    // src/session/config.js huntPollMs (the player door's floor is 15 s)
  look_ahead_ms: 32000,              // tools/lib/hunt-lag.mjs LOOK_AHEAD_S: past it a watched hunt FREEZES
  edge_wall_ms: { p50: 643, p95: 1287, max: 6460 },
  edge_cpu_ms: { p50: 154, p99: 1104, max: 1439 },
  edge_cpu_limit_ms: 2000,           // Supabase Edge Functions, per request
  invocations_per_active_hour: 240,  // the heaviest account, 10-29: 5,270 POSTs over 22 active hours
  frame_bytes_stored: 29276,         // realtime.messages, event 'frame', avg pg_column_size, 10-29
  frame_bytes_wire: 68490,           // the same frames' JSON text
  frames_per_active_hour: 600,       // 10-29 busy hours: 567-627 an hour
  realtime_retained_days: 4,         // partitions 10-26..10-30 present at 10-30 02:30
  ledger_bytes_per_heavy_player_day: 11.8e6, // 21,061 rows, 8.63 MB of rows x 1.37 (indexes), 0d959747 10-29
  ledger_retain_days: 90,            // hr_ledger_config.retain_days
};

// The world tick (hr_tick_config, read 10-30): a body carries at most
// hunt_body_max instances, a fire posts at most hunt_bodies_max bodies, every
// cadence_seconds; an unviewed instance is due once per flush_seconds.
const TICK = { cadence_s: 10, flush_s: 90, hunt_body_max: 4, hunt_bodies_max: 32 };

// Plan quotas (Pro), confirmed against the Supabase docs 2026-10-30.
const QUOTA = { invocations_month: 2_000_000, invocation_overage_usd_per_m: 2,
                egress_gb_month: 250, egress_overage_usd_per_gb: 0.09,
                disk_gb_included: 8, disk_usd_per_gb_month: 0.125 };

// Hard cap on live-endpoint requests. This is a reliability tool, not a
// stress-test cannon, and production has real players on it.
const MAX_FN_REQUESTS = 40;

// ── args ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const WANT_DB = has('--db') || (!has('--fn') && !has('--model') && !has('--live') && !has('--settle'));
const WANT_FN = has('--fn');
const WANT_SETTLE = has('--settle');
const WANT_MODEL = has('--model') || WANT_DB || WANT_FN || WANT_SETTLE || has('--live');
const SCALES = String(val('--scales', '1,10,100')).split(',').map(Number).filter((n) => n > 0);
const ITERS = Number(val('--iters', '40'));
const FN_N = Math.min(Number(val('--n', '12')), MAX_FN_REQUESTS);
const PLAYERS = Number(val('--players', '0')) || null;
const WINDOW_S = Math.min(Math.max(Number(val('--window', '120')) || 120, 20), 900);
const JSON_OUT = val('--json', null);

const out = { ground: GROUND, settle: SETTLE, db: null, fn: null, live: null, live_settle: null, model: null, assertions: [] };
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

/* The per-character row shape, read from production 2026-10-30 (15 heroes) and
   rounded UP so the model is pessimistic rather than flattering:
       player_skills       195 / 15 = 13.0  -> 17 (every skill the catalogue has, capped)
       player_inventory    941 / 15 = 62.7  -> 64
       player_equipment    102 / 15 =  6.8  ->  7
       account_farm_plots  (per ACCOUNT)    ->  4
       player_progress   1,510 / 15 = 100.7 -> 101
       player_ledger   182,375 / 15 = 12,158 (90-day retention; the GROWTH table)
   The ledger is CAPPED at 250 a hero here: 12,158 x 4,000 heroes does not fit a
   WASM heap, and the planner question (an index path on (user_id, slot)) is
   already decided at 1M rows. A synthetic character is built to those counts so
   the tables reach the size a real population would, which is the only thing
   the PLANNER cares about. */
const PER_CHAR = { skills: 17, inventory: 64, equipment: 7, farm: 4, progress: 101, ledger: 250 };

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
      // closed_mode (2026-10-21) admits only the allowlist; the probe's heroes are let in the way QA's are.
      await db.query(`insert into hr_access_allowlist(user_id, note) values ($1, 'load-probe') on conflict (user_id) do nothing`, [uid]);
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
    // Gold is the ACCOUNT's since 2026-10-19 (account_wallet), not a player_state column.
    await db.query(
      `insert into player_state(user_id, slot, hp, accrued_to, version)
       select ('00000000-0000-4000-a000-' || lpad(to_hex(g),12,'0'))::uuid, 0,
              50, now() - interval '5 minutes', 1
         from generate_series($1::int, $2::int) g
       on conflict do nothing`, [lo, hi - 1]);
    await db.query(
      `insert into account_wallet(user_id, gold)
       select ('00000000-0000-4000-a000-' || lpad(to_hex(g),12,'0'))::uuid, 500 + g
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
      `insert into account_farm_plots(user_id, plot_idx, crop_id, planted_at, planted_by)
       select ('00000000-0000-4000-a000-' || lpad(to_hex(g),12,'0'))::uuid, k,
              (select crop_id from hr_crops order by crop_id limit 1), now() - interval '1 hour', 0
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
declare ids uuid[]; u uuid; s int; v bigint; t0 timestamptz; i int; j int; r jsonb; itm text; el double precision; sk text[];
begin
  select array_agg(user_id order by user_id) into ids
    from (select user_id from player_state order by md5(user_id::text) limit 200) x;
  select item_id into itm from hr_items where tradeable order by item_id limit 1;
  -- Two skills the CATALOGUE has (the August 'attack'/'hitpoints' are gone: unknown_skill).
  select array_agg(skill_id order by skill_id) into sk from (select skill_id from hr_skills order by skill_id limit 2) x;
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
               'xp', jsonb_build_object(sk[1], 120, sk[2], 40),
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
    account_farm_plots: 'select * from account_farm_plots where user_id = $1 and $2::int is not null',   // the ACCOUNT's field (2026-12-14-shared-farm.sql): every hero reads it, the slot binds only
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
    const target = BASE_CHARACTERS * mult;
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
// THE MANAGEMENT API — the token, a READ-ONLY SQL door, and the logs door.
// ════════════════════════════════════════════════════════════════════════════

/* The token is ~/.supabase-token, read as bytes and never printed. Every SQL
   read is SELECT/WITH inside a READ ONLY transaction (the same fence as
   tools/hunt-health.local.mjs): this tool never writes production. */
async function mgmt() {
  const { readFile } = await import('node:fs/promises');
  const { homedir } = await import('node:os');
  let token = '';
  try { token = (await readFile(`${homedir()}/.supabase-token`, 'utf8')).trim(); } catch { /* optional */ }
  const base = `https://api.supabase.com/v1/projects/${GROUND.project}`;
  const api = async (path) => {
    if (!token) return null;
    const r = await fetch(`https://api.supabase.com/v1/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return r.ok ? r.json() : { error: r.status };
  };
  const sqlRead = async (sql) => {
    if (!token) throw Object.assign(new Error('no ~/.supabase-token: the live half needs it'), { harness: true });
    if (!/^\s*(select|with)\b/i.test(sql)
        || /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|call|vacuum|copy)\b/i.test(sql)) {
      throw Object.assign(new Error('load-probe reads only'), { harness: true });
    }
    const r = await fetch(`${base}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'begin read only; ' + sql + ';', read_only: true }) });
    if (!r.ok) throw Object.assign(new Error(`database answered ${r.status} ${(await r.text()).slice(0, 160)}`), { harness: true });
    return r.json();
  };
  /* THE LOGS DOOR. `analytics/endpoints/logs.all` answers 410 Gone (Supabase's
     2026 logs migration); its replacement takes ClickHouse SQL over ONE `logs`
     table: `source` picks the service ('function_edge_logs', 'function_logs',
     'edge_logs', 'postgrest_logs', 'postgres_logs', ...), fields live in the
     `log_attributes` map as strings (wrap numbers in toInt32OrZero), `count()`
     not `count(*)`, and the window is at most 24 h. Discover a source's keys
     with `select arrayJoin(mapKeys(log_attributes)) k, count() n from logs
     where source = '...' group by k`; never guess one (a wrong key reads as 0). */
  const logs = async (sql, hours = 24) => {
    if (!token) return null;
    const end = new Date();
    const start = new Date(end.getTime() - Math.min(Math.max(hours, 1), 24) * 3600e3);
    const qs = new URLSearchParams({ sql, iso_timestamp_start: start.toISOString(), iso_timestamp_end: end.toISOString() });
    const r = await fetch(`${base}/analytics/endpoints/logs?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const j = await r.json();
    return j.error ? { error: JSON.stringify(j.error).slice(0, 160) } : (j.result || []);
  };
  return { token, api, sqlRead, logs };
}

// ════════════════════════════════════════════════════════════════════════════
// SETTLE — the live database cost of one settle, over a read-only window.
//
// Two pg_stat_statements snapshots WINDOW_S apart (cumulative counters, so the
// delta is exactly what ran in between), split by role: hr_engine is the edge
// (every settle's reads and hr_hunt_apply_instance), authenticated/anon the
// browser's PostgREST calls, postgres the cron jobs. This tool's own reads run
// as supabase_read_only_user and are excluded. Normalised by the settles that
// landed (hr_hunt_apply_instance calls) and the heroes those instances seat.
// ════════════════════════════════════════════════════════════════════════════

const PSS_SQL = `select s.queryid::text || ':' || s.userid::text as k, r.rolname as role,
  s.calls::bigint as calls, s.total_exec_time as total, left(regexp_replace(s.query, '\\s+', ' ', 'g'), 90) as q
  from extensions.pg_stat_statements s join pg_roles r on r.oid = s.userid`;
const OPEN_HUNTS_SQL = `select i.id::text inst, count(*)::int heroes from public.hunt_sessions s
  join public.hunt_instances i on i.id = s.instance_id where s.ended_at is null group by i.id`;

async function runSettle() {
  p(`══ SETTLE — live per-settle DB cost, read-only, ${WINDOW_S} s window ═══════════════`);
  const { sqlRead } = await mgmt();
  const hunts0 = await sqlRead(OPEN_HUNTS_SQL);
  const a = await sqlRead(PSS_SQL);
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, WINDOW_S * 1000));
  const b = await sqlRead(PSS_SQL);
  const secs = (Date.now() - t0) / 1000;
  const hunts1 = await sqlRead(OPEN_HUNTS_SQL);

  const prev = new Map(a.map((r) => [r.k, r]));
  const by = { engine: 0, rest: 0, cron: 0 };
  let applies = 0; let townSettles = 0; const top = [];
  for (const r of b) {
    const o = prev.get(r.k) || { calls: 0, total: 0 };
    const dc = Number(r.calls) - Number(o.calls); const dt = Number(r.total) - Number(o.total);
    if (dc <= 0) continue;
    const q = String(r.q);
    if (r.role === 'hr_engine') { by.engine += dt; if (q.includes('hr_hunt_apply_instance')) applies += dc; if (q.includes('hr_tick_settle')) townSettles += dc; }
    else if (r.role === 'authenticated' || r.role === 'anon') by.rest += dt;
    else if (r.role === 'postgres' && /^select public\.hr_|^delete from public\./i.test(q)) by.cron += dt;
    else continue;
    top.push({ role: r.role, calls: dc, ms: dt, q });
  }
  top.sort((x, y) => y.ms - x.ms);
  const heroes = Math.max(...[hunts0, hunts1].map((h) => h.reduce((s, x) => s + x.heroes, 0)), 0);
  const instances = Math.max(hunts0.length, hunts1.length);
  const heroesPerInstance = instances ? heroes / instances : null;
  const res = { window_s: secs, engine_ms: by.engine, rest_ms: by.rest, cron_ms: by.cron, applies, heroes, instances,
    top: top.slice(0, 8), override: null };

  p(`   open hunts: ${instances} instance(s), ${heroes} hero(es); settles landed: ${applies}`);
  p(`   DB time: engine ${fx(by.engine, 0)} ms · REST ${fx(by.rest, 0)} ms · cron ${fx(by.cron, 0)} ms`
    + ` = ${fx((by.engine + by.rest + by.cron) / 10 / secs, 2)} % of one core`);
  for (const t of res.top) p(`     ${String(t.calls).padStart(5)} x ${fx(t.ms / t.calls, 1).padStart(8)} ms  ${t.role.padEnd(13)} ${t.q.slice(0, 70)}`);
  /* A town tick in the window is hr_engine time no hunt spent (10-31: 97 hr_tick_settle + 33 hr_state_of beside 5 solo
     settles read as "1,980 ms a party"), so hr_engine / applies is only a settle's price when no town tick ran. */
  if (townSettles > 0) {
    p(`   => ${townSettles} town tick settles shared the window: engine time is not one settle's; the model keeps the dated measurement (${SETTLE.measured})`);
  } else if (applies >= 3 && heroesPerInstance) {
    // One settle's engine time, scaled to the model's party size (every member is re-read and framed).
    const perSettle = by.engine / applies;
    res.override = { db_ms_per_party_settle: perSettle * (SETTLE.party_heroes / heroesPerInstance),
      cron_db_ms_per_s: by.cron / secs, measured: `live ${new Date().toISOString()}, ${applies} settles` };
    p(`   => ${fx(perSettle, 0)} ms of database a settle (${fx(heroesPerInstance, 1)} heroes an instance);`
      + ` the model uses ${fx(res.override.db_ms_per_party_settle, 0)} ms for a ${SETTLE.party_heroes}-hero party`);
  } else {
    p(`   => fewer than 3 settles landed: the model keeps the dated measurement (${SETTLE.measured})`);
  }
  out.live_settle = res;
  return res;
}

// ════════════════════════════════════════════════════════════════════════════
// THE MODEL — what one settle costs, in players
//
// A VIEWED hunt is settled by its browser every poll_ms; each settle re-reads
// and re-frames every hero of the party (hr_state_of per member, the frame per
// member inside hr_hunt_apply_instance), so its DB cost grows with the party,
// not with the population. The worst case per player is therefore ALL FOUR
// heroes in ONE viewed party. An unviewed hunt costs the same settle once per
// flush (90 s) instead of once per poll (16 s): a quarter of the price or less.
//
// The lag of a viewed hunt peaks at one poll plus one settle's wall time. With
// the database a fraction rho busy, a settle's DB half stretches by about
// 1 / (1 - rho); past rho ~ 0.94 the stretched settle overruns the 16 s of
// headroom under the 32 s look-ahead and the screen FREEZES. rho >= 1 is
// unbounded: the backlog grows every poll.
// ════════════════════════════════════════════════════════════════════════════

function runModel(db, liveSettle) {
  const S = { ...SETTLE, ...(liveSettle?.override || {}) };
  const partyCores = S.db_ms_per_party_settle / S.poll_ms;                 // DB core-seconds a second
  const perPlayer = partyCores * (HEROES_PER_PLAYER / S.party_heroes) + S.rest_db_ms_per_player_s / 1000;
  const cron = S.cron_db_ms_per_s / 1000;
  const nonDbWall = Math.max(0, S.edge_wall_ms.p95 - S.db_ms_per_party_settle);
  const lagMs = (rho) => (rho >= 1 ? Infinity : S.poll_ms + nonDbWall + S.db_ms_per_party_settle / (1 - rho));
  const RHO_LAG = 1 - S.db_ms_per_party_settle / Math.max(1, S.look_ahead_ms - S.poll_ms - nonDbWall);
  const PEAK = 4;                       // burst factor on mean busy backends (Little's law gives the mean)
  const HOURS = 4.5;                    // typical active hours a day (08-24 measurement); 24 = the hunt never stops

  const at = (n) => {
    const demand = n * perPlayer + cron;
    const rhoBurst = demand / GROUND.cpu_cores;
    const rhoBase = demand / GROUND.cpu_cores_baseline_assumed;
    const soloDue = n * (HEROES_PER_PLAYER - 1) * TICK.cadence_s / TICK.flush_s; // the solo case's tick load a fire
    return {
      players: n, heroes: n * HEROES_PER_PLAYER, db_cores: demand,
      cpu_pct_burst: 100 * rhoBurst, cpu_pct_baseline: 100 * rhoBase,
      lag_ms_burst: lagMs(rhoBurst), lag_ms_baseline: lagMs(rhoBase),
      engine_backends_peak: n * partyCores * PEAK,
      tick_bodies_a_fire: Math.ceil(soloDue / TICK.hunt_body_max),
      invocations_month_typical: n * S.invocations_per_active_hour * HOURS * 30,
      invocations_month_allday: n * S.invocations_per_active_hour * 24 * 30,
      egress_gb_month: n * S.frames_per_active_hour * S.frame_bytes_wire * HOURS * 30 / 1e9,
      realtime_gb_steady: n * S.frames_per_active_hour * S.frame_bytes_stored * HOURS * S.realtime_retained_days / 1e9,
      ledger_gb_day: n * S.ledger_bytes_per_heavy_player_day / 1e9,
    };
  };
  const list = PLAYERS ? [PLAYERS] : [1, GROUND.live_users, PLAYTEST_PLAYERS, 30, PLAYTEST_PLAYERS * 10];
  const rows = list.map(at);
  const ceil = (x) => Math.max(0, Math.floor(x));
  const ceilings = {
    'DB CPU, burst (2 cores)': ceil((RHO_LAG * GROUND.cpu_cores - cron) / perPlayer),
    'DB CPU, baseline (ASSUMED 0.2 core)': ceil((RHO_LAG * GROUND.cpu_cores_baseline_assumed - cron) / perPlayer),
    'engine connections (20)': ceil(GROUND.engine_role_connlimit / (partyCores * PEAK)),
    'Edge invocations (2M/mo, 4.5 h/day)': ceil(QUOTA.invocations_month / (S.invocations_per_active_hour * HOURS * 30)),
    'egress (250 GB/mo, frames)': ceil(QUOTA.egress_gb_month * 1e9 / (S.frames_per_active_hour * S.frame_bytes_wire * HOURS * 30)),
    'tick (bodies a fire)': ceil(TICK.hunt_bodies_max * TICK.hunt_body_max * TICK.flush_s / TICK.cadence_s / (HEROES_PER_PLAYER - 1)),
  };

  p('');
  p('══ THE MODEL — the hunt settle ═════════════════════════════════════════');
  p(`   inputs     : ${fx(S.db_ms_per_party_settle, 0)} ms of DB a ${S.party_heroes}-hero settle every ${S.poll_ms / 1000} s (${S.measured})`);
  p(`                + ${S.rest_db_ms_per_player_s} ms/s of PostgREST a player, ${fx(S.cron_db_ms_per_s, 1)} ms/s of cron`);
  p(`   per player : ${fx(perPlayer * 1000, 1)} DB ms a second, worst case (${HEROES_PER_PLAYER} heroes in one viewed party)`);
  p(`   edge       : settle wall p95 ${S.edge_wall_ms.p95} ms; isolate CPU p99 ${S.edge_cpu_ms.p99} ms of a ${S.edge_cpu_limit_ms} ms limit`
    + ' (per request: does not grow with players)');
  p('');
  p('   players heroes  DB CPU% burst  baseline*   watched lag   engine conns  bodies/fire  inv/mo (4.5h|24h)   egress GB/mo  realtime GB  ledger GB/day');
  const lagTxt = (ms) => (Number.isFinite(ms) ? `${fx(ms / 1000, 1)} s` : 'UNBOUNDED');
  for (const r of rows) {
    p(`   ${String(r.players).padStart(7)} ${String(r.heroes).padStart(6)} ${fx(r.cpu_pct_burst, 0).padStart(13)}% ${fx(r.cpu_pct_baseline, 0).padStart(8)}%`
      + `   ${lagTxt(r.lag_ms_burst).padStart(11)} ${fx(r.engine_backends_peak, 1).padStart(13)} ${String(r.tick_bodies_a_fire).padStart(11)}`
      + `  ${(Math.round(r.invocations_month_typical / 1e3) + 'k|' + Math.round(r.invocations_month_allday / 1e3) + 'k').padStart(17)}`
      + ` ${fx(r.egress_gb_month, 0).padStart(14)} ${fx(r.realtime_gb_steady, 1).padStart(12)} ${fx(r.ledger_gb_day, 2).padStart(14)}`);
  }
  p('   * baseline = the ASSUMED sustained share of the shared Micro CPU once burst credit is spent (see GROUND).');
  p('');
  p('   ceilings (players, worst case):');
  const sorted = Object.entries(ceilings).sort((x, y) => x[1] - y[1]);
  for (const [k, v] of sorted) p(`     ${k.padEnd(38)} ~${v.toLocaleString()}`);

  const pt = at(PLAYTEST_PLAYERS);
  const disk14 = GROUND.db_bytes / 1e9 + pt.realtime_gb_steady + 14 * pt.ledger_gb_day;
  const daysTo8 = (QUOTA.disk_gb_included - GROUND.db_bytes / 1e9 - pt.realtime_gb_steady) / pt.ledger_gb_day;
  p('');
  p(`   PLAYTEST (${PLAYTEST_PLAYERS} x ${HEROES_PER_PLAYER}): watched lag ${lagTxt(pt.lag_ms_burst)} of ${S.look_ahead_ms / 1000} s at burst,`
    + ` ${lagTxt(pt.lag_ms_baseline)} at the assumed baseline; disk ${fx(disk14, 1)} GB after 14 days, 8 GB in ~${fx(daysTo8, 0)} days`);

  const burstFirst = sorted.find(([k]) => !k.includes('ASSUMED'));
  const model = { inputs: S, per_player_db_cores: perPlayer, rho_lag: RHO_LAG, scenarios: rows, ceilings,
    first_bottleneck: { surface: burstFirst[0], players: burstFirst[1] }, playtest: pt, disk_gb_14d: disk14, days_to_8gb: daysTo8 };
  p(`   FIRST BOTTLENECK (burst CPU): ${burstFirst[0]} at ~${burstFirst[1]} players;`
    + ` at the assumed baseline: ~${ceilings['DB CPU, baseline (ASSUMED 0.2 core)']} players`);

  // ── THE ASSERTIONS: the playtest, at what production verifiably has ───────
  assert(`playtest DB CPU under 50 % of the Micro's ${GROUND.cpu_cores} cores at burst`,
    pt.cpu_pct_burst < 50, `${fx(pt.cpu_pct_burst, 0)} % (${fx(pt.db_cores, 2)} cores)`);
  assert(`playtest watched settle lag under the ${S.look_ahead_ms / 1000} s look-ahead`,
    pt.lag_ms_burst < S.look_ahead_ms, `${lagTxt(pt.lag_ms_burst)} (poll ${S.poll_ms / 1000} s + settle p95 stretched by 1/(1-rho))`);
  assert(`playtest engine connections (peak x${PEAK}) under hr_engine_login's ${GROUND.engine_role_connlimit}`,
    pt.engine_backends_peak < GROUND.engine_role_connlimit, `${fx(pt.engine_backends_peak, 1)} busy backends at peak`);
  assert('edge isolate CPU p99 under 75 % of the per-request limit',
    S.edge_cpu_ms.p99 < 0.75 * S.edge_cpu_limit_ms, `${S.edge_cpu_ms.p99} / ${S.edge_cpu_limit_ms} ms (max ${S.edge_cpu_ms.max})`);
  assert('playtest Edge invocations under the 2M/month quota even hunting all day',
    pt.invocations_month_allday < QUOTA.invocations_month, `${Math.round(pt.invocations_month_allday / 1e3)}k / 2,000k`);
  assert(`playtest tick fits one fire (${TICK.hunt_bodies_max} bodies of ${TICK.hunt_body_max})`,
    pt.tick_bodies_a_fire <= TICK.hunt_bodies_max, `${pt.tick_bodies_a_fire} bodies a fire in the all-solo case`);
  assert(`playtest disk after 14 days under the ${QUOTA.disk_gb_included} GB included`,
    disk14 < QUOTA.disk_gb_included, `${fx(disk14, 1)} GB (realtime frames ${fx(pt.realtime_gb_steady, 1)} + ledger ${fx(14 * pt.ledger_gb_day, 1)})`);

  out.model = model;
  return model;
}

// ════════════════════════════════════════════════════════════════════════════
// LIVE — the health numbers, read-only, so the check outlives this session.
//
// Every query here is a SELECT inside a READ ONLY transaction, or a logs read.
// Nothing writes, nothing locks, nothing a player can feel. Run it before and
// after a wave. It needs ~/.supabase-token because half the answers are
// platform facts the database cannot see — invocations, isolates, the plan.
// ════════════════════════════════════════════════════════════════════════════

const LIVE_SQL = {
  players: `select (select count(*) from player_state) as characters,
      (select count(distinct user_id) from player_state) as users`,
  connections: `select current_setting('max_connections')::int as max_connections,
      (select count(*) from pg_stat_activity) as total,
      (select count(*) from pg_stat_activity where state = 'active') as active,
      (select count(*) from pg_stat_activity where usename = 'hr_engine_login') as engine,
      (select rolconnlimit from pg_roles where rolname = 'hr_engine_login') as engine_cap`,
  size: `select pg_database_size(current_database()) as db_bytes,
      (select pg_total_relation_size('public.player_ledger')) as ledger_bytes,
      (select count(*) from player_ledger where at > now() - interval '1 day') as ledger_rows_1d,
      (select retain_days from hr_ledger_config) as ledger_retain_days,
      (select coalesce(sum(pg_total_relation_size(c.oid)), 0) from pg_inherits i join pg_class c on c.oid = i.inhrelid
        where i.inhparent = 'realtime.messages'::regclass) as realtime_bytes,
      (select pg_total_relation_size('cron.job_run_details')) as cron_runs_bytes`,
  /* THE pg_net RESPONSE TABLE (2026-10-30): pg_net's worker inserts and deletes
     its responses without reporting to pgstat (n_tup_ins = 0 after 127,819
     requests), so autovacuum never sees a dead row and the heap only grows —
     208.8 MB holding 280 live rows on 10-30. 2027-02-10-pg-net-vacuum.sql
     vacuums it hourly; this probe says whether that is still working. */
  pg_net: `select pg_relation_size('net._http_response') as heap_bytes,
      (select count(*) from net._http_response) as live_rows,
      (select last_vacuum from pg_stat_all_tables where relid = 'net._http_response'::regclass) as last_vacuum`,
  /* 2027-02-11-db-retention.sql's promise, re-read forever: no frame past ~1 h + one run, nothing past 3 days + a day. */
  retention: `select (select active from cron.job where jobname = 'hr-realtime-frame-prune') as frame_job,
      (select extract(epoch from (now() at time zone 'utc') - min(inserted_at)) from realtime.messages where event = 'frame') as oldest_frame_s,
      (select extract(epoch from now() - min(start_time)) from cron.job_run_details) as oldest_run_s,
      (select extract(epoch from now() - min(at)) from public.hr_tick_cron_log) as oldest_fire_s`,
  // A per-character read that has gone sequential is the O(N-squared) failure
  // this whole exercise exists to rule out. Cheap to check, so check it forever.
  scans: `select relname, seq_scan, idx_scan, n_live_tup
      from pg_stat_user_tables
     where schemaname = 'public'
       and relname in ('player_state','player_skills','player_inventory','player_equipment',
                       'account_farm_plots','player_progress','player_ledger','hunt_sessions','hunt_bag')
     order by relname`,
  rejections: `select code, severity, sum(n)::bigint as total, max(last_at) as last_seen
      from hr_rejections where last_at > now() - interval '7 days'
      group by 1, 2 order by total desc limit 12`,
  cron: `select j.jobname, j.schedule, j.active,
      max(d.start_time) filter (where d.status = 'succeeded') as last_ok,
      count(*) filter (where d.status <> 'succeeded' and d.start_time > now() - interval '24 hours') as fails_24h,
      round((percentile_cont(0.95) within group (order by extract(epoch from d.end_time - d.start_time) * 1000))::numeric) as p95_ms_24h
      from cron.job j left join cron.job_run_details d on d.jobid = j.jobid and d.start_time > now() - interval '24 hours'
     group by 1, 2, 3 order by 1`,
};

const LIVE_LOGS = {
  invocations: `select count() as n from logs where source = 'function_edge_logs'`,
  accrue: `select if(log_attributes['request.headers.user_agent'] like 'pg_net%', 'tick', 'browser') as who, count() as n,
      quantile(0.5)(toInt32OrZero(log_attributes['execution_time_ms'])) as p50,
      quantile(0.95)(toInt32OrZero(log_attributes['execution_time_ms'])) as p95,
      max(toInt32OrZero(log_attributes['execution_time_ms'])) as mx,
      countIf(toInt32OrZero(log_attributes['response.status_code']) >= 500) as e5xx
    from logs where source = 'function_edge_logs' and log_attributes['request.pathname'] = '/functions/v1/hr-accrue'
      and log_attributes['request.method'] = 'POST' group by who order by n desc`,
  isolate: `select count() as n, quantile(0.99)(toInt32OrZero(log_attributes['cpu_time_used'])) as p99,
      max(toInt32OrZero(log_attributes['cpu_time_used'])) as mx, countIf(log_attributes['reason'] != 'EarlyDrop') as not_early
    from logs where source = 'function_logs' and event_message = 'shutdown'`,
  rest: `select count() as n, countIf(toInt32OrZero(log_attributes['response.status_code']) >= 500) as e5xx,
      max(toInt32OrZero(log_attributes['response.origin_time'])) as max_origin_ms
    from logs where source = 'edge_logs' and log_attributes['request.path'] like '/rest/v1/%'`,
  /* "Warp server error: Thread killed by timeout manager" (postgrest_logs,
     severity INFO) is Warp's slowloris reaper closing an IDLE keep-alive
     connection between the gateway and PostgREST. Warp pauses that timer while
     a handler runs, so a slow query cannot raise it. Measured 10-27..10-30:
     30-170 an hour, each PostgREST process's reaps 30 s apart, with zero 5xx on
     /rest/v1 and a REST origin time of at most 1.2 s in the same hours. It is
     counted so nobody chases it again, never asserted. */
  warp_reaps: `select count() as n from logs where source = 'postgrest_logs' and event_message like '%Thread killed by timeout manager%'`,
};

async function runLive() {
  p('══ LIVE — production health, read-only ═════════════════════════════════');
  const { token, api, sqlRead, logs } = await mgmt();
  const res = { sql: {}, logs: {}, platform: {} };
  if (!token) {
    p('   (no ~/.supabase-token — the live half is skipped; the SQL it runs is in LIVE_SQL)');
    out.live = res;
    return res;
  }
  for (const [k, sql] of Object.entries(LIVE_SQL)) {
    try { res.sql[k] = await sqlRead(sql); } catch (e) { res.sql[k] = { error: e.message }; }
  }
  for (const [k, sql] of Object.entries(LIVE_LOGS)) res.logs[k] = await logs(sql, 24);

  const one = (k) => (Array.isArray(res.sql[k]) ? res.sql[k][0] || {} : {});
  const pl = one('players'); const cn = one('connections'); const sz = one('size'); const pn = one('pg_net');
  p(`   ${pl.characters} heroes, ${pl.users} accounts · connections ${cn.total}/${cn.max_connections} (${cn.active} active, engine ${cn.engine}/${cn.engine_cap})`);
  p(`   db ${fx(sz.db_bytes / 1e6, 0)} MB · ledger ${fx(sz.ledger_bytes / 1e6, 0)} MB (+${sz.ledger_rows_1d} rows/24 h, kept ${sz.ledger_retain_days} d)`
    + ` · realtime.messages ${fx(sz.realtime_bytes / 1e6, 0)} MB · cron runs ${fx(sz.cron_runs_bytes / 1e6, 0)} MB`);
  p(`   net._http_response ${fx(pn.heap_bytes / 1e6, 1)} MB for ${pn.live_rows} live rows (last vacuum ${pn.last_vacuum ?? 'NEVER'})`);
  const cronBad = (Array.isArray(res.sql.cron) ? res.sql.cron : []).filter((j) => Number(j.fails_24h) > 0 || !j.active);
  p(`   cron: ${(res.sql.cron || []).length} jobs, ${cronBad.length} with a failure in 24 h or inactive`
    + (cronBad.length ? ': ' + cronBad.map((j) => `${j.jobname} x${j.fails_24h}`).join(', ') : ''));

  const L = res.logs;
  const inv = Array.isArray(L.invocations) ? Number(L.invocations[0]?.n) : null;
  if (inv === null) p(`   logs: ${JSON.stringify(L.invocations)}`);
  else {
    p(`   Edge invocations last 24 h: ${inv.toLocaleString()} -> ${(inv * 30).toLocaleString()}/month`
      + ` = ${fx(100 * inv * 30 / QUOTA.invocations_month, 1)} % of the ${QUOTA.invocations_month / 1e6}M quota`);
    for (const r of (Array.isArray(L.accrue) ? L.accrue : [])) {
      p(`   hr-accrue ${String(r.who).padEnd(7)} ${String(r.n).padStart(6)} POSTs, wall p50 ${fx(r.p50, 0)} p95 ${fx(r.p95, 0)} max ${r.mx} ms, 5xx ${r.e5xx}`);
    }
    const iso = Array.isArray(L.isolate) ? L.isolate[0] || {} : {};
    p(`   isolates ${iso.n}: CPU p99 ${fx(iso.p99, 0)} ms, max ${iso.mx} ms of ${SETTLE.edge_cpu_limit_ms}; not EarlyDrop ${iso.not_early}`);
    const rest = Array.isArray(L.rest) ? L.rest[0] || {} : {};
    const warp = Array.isArray(L.warp_reaps) ? L.warp_reaps[0]?.n : '?';
    p(`   PostgREST ${rest.n} requests, 5xx ${rest.e5xx}, origin max ${rest.max_origin_ms} ms;`
      + ` ${warp} Warp idle-connection reaps ("Thread killed by timeout manager", benign: see LIVE_LOGS)`);
    assert('projected monthly Edge Function invocations are under 80 % of the Pro quota',
      inv * 30 < QUOTA.invocations_month * 0.8, `${(inv * 30).toLocaleString()} / ${QUOTA.invocations_month.toLocaleString()}`);
    assert('no hr-accrue 5xx in 24 h', (Array.isArray(L.accrue) ? L.accrue : []).every((r) => Number(r.e5xx) === 0),
      (Array.isArray(L.accrue) ? L.accrue : []).map((r) => `${r.who} ${r.e5xx}`).join(', '));
    assert('edge isolate CPU max under 90 % of the per-request limit', Number(iso.mx) < 0.9 * SETTLE.edge_cpu_limit_ms,
      `${iso.mx} / ${SETTLE.edge_cpu_limit_ms} ms`);
  }
  /* The job's own proof: a VACUUM that is refused for want of MAINTAIN only WARNs (the cron run reads
     `succeeded`) and does not stamp last_vacuum, so a stamp under 2 h old means the hourly job really ran. */
  assert('net._http_response vacuumed in the last 2 h (hr-net-response-vacuum)',
    pn.last_vacuum && Date.now() - Date.parse(pn.last_vacuum) < 2 * 3600e3,
    `last vacuum ${pn.last_vacuum ?? 'NEVER'}; heap ${fx(pn.heap_bytes / 1e6, 1)} MB for ${pn.live_rows} rows`);
  const rt = one('retention');
  p(`   retention: oldest frame ${fx(Number(rt.oldest_frame_s) / 3600, 1)} h, cron run ${fx(Number(rt.oldest_run_s) / 86400, 1)} d, tick fire ${fx(Number(rt.oldest_fire_s) / 86400, 1)} d (job ${rt.frame_job ?? 'not applied'})`);
  if (rt.frame_job === true) {
    assert('no frame older than 2 h (hr-realtime-frame-prune)', !(Number(rt.oldest_frame_s) > 2 * 3600), `oldest ${fx(Number(rt.oldest_frame_s) / 3600, 1)} h`);
    assert('the run history and the fire log keep at most 4 days', !(Number(rt.oldest_run_s) > 4 * 86400) && !(Number(rt.oldest_fire_s) > 4 * 86400),
      `runs ${fx(Number(rt.oldest_run_s) / 86400, 1)} d, fires ${fx(Number(rt.oldest_fire_s) / 86400, 1)} d`);
  }
  assert('no cron job failed or went inactive in 24 h', cronBad.length === 0,
    cronBad.map((j) => `${j.jobname}: ${j.fails_24h} failed${j.active ? '' : ', INACTIVE'}`).join('; ') || 'all succeeded');

  const addons = await api(`projects/${GROUND.project}/billing/addons`);
  const backups = await api(`projects/${GROUND.project}/database/backups`);
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
  p(`   backups ${res.platform.backups_retained} retained, newest ${res.platform.newest_backup} · PITR ${res.platform.pitr_enabled}`
    + ' · restore drill: tests/restore-census.baseline.json restore_drill');
  assert('daily backups exist and are recent (durability, not capacity — but it is the same alarm clock)',
    (res.platform.backups_retained ?? 0) >= 7
    && Date.now() - Date.parse(res.platform.newest_backup ?? 0) < 36 * 3600e3,
    `${res.platform.backups_retained} retained, newest ${res.platform.newest_backup}, PITR ${res.platform.pitr_enabled}`);

  out.live = res;
  return res;
}

// ════════════════════════════════════════════════════════════════════════════
(async () => {
  let db = null; let live = null;
  try {
    if (WANT_DB) db = await runDb();
    if (WANT_FN) await runFn();
    if (has('--live')) await runLive();
    if (WANT_SETTLE) live = await runSettle();
    if (WANT_MODEL) runModel(db, live);
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
