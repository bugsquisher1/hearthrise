#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/beta-load.mjs — THE BETA'S WORST HOUR, REPLAYED: real chain, real engine, real concurrency, PostgreSQL 17.
//   (lane/r-beta-load, reliability-engineer, 2026-11-01.) Load-test only; nothing imports it (importing runs it); never touches production.
//
//   node tools/beta-load.mjs --accounts=20 [--heroes=4] [--minutes=5] [--party=0.4] [--town=0.25] [--workers=2] [--idle-accounts=80] [--warm=240] [--engine-pool=15] [--rest-pool=15] [--unviewed-poll-ms=0]
//                            [--drill=tick-stop|edge-5xx|retry] [--json=out.json]
//   node tools/beta-load.mjs --shape=krell4 --accounts=40 --online=0.5 ...   THE HEAVY FOUR'S BAND (below)
//   node tools/beta-load.mjs --shape=lt --accounts=1000 --online=0.1 [--grounds=a,b] [--builders=4] [--flame=room|0|<mpts>] ...
//                                           THE v0.3.0 LOAD TEST (below): the drop switches on, fours across the Trait grounds
//   node tools/beta-load.mjs --selftest     the conservation audit, proved to bite on planted double pay and lost time; the band's wiring
//   node tools/beta-load.mjs --selftest --pure   the database-free proofs only (the bands and the load test's verdicts), for a PC with no
//                                           PostgreSQL 17
//
// THE v0.3.0 LOAD TEST (lane/lt-load-test, reliability-engineer, 2026-11-27; docs/design/redesign/20-v030-the-roads.md section 4 Band 6
// LT, section 5 gate 10). --shape=lt lights the release's drop switches IN THIS SCRATCH DATABASE ONLY (tests/per-player-cost.mjs
// V030_SWITCHES: personal_loot, trait_pieces, signatures, trait_drops, inner_flame) before anyone enters, so every hunt session freezes its
// luck at its insert (1074-inner-flame-luck.sql), seeds each account's fire at its room (--flame, the default stoke rule's "Keep full":
// +25.7% Rare luck), and makes every synthetic account one four (per-player-cost buildFour: the Level 80 heavy four's kit on a ground
// entered at 70 or more, the Level 50 own four's below), spread evenly over the grounds that roll Traits (hr_piece_grounds max_rank > 0:
// Muster Barrows, the Slake, Hask's Ford, Pyre Field, Krell's Hold) and seated in one party, the first --online share of each ground with
// its tab open. The world tick runs on the CHAIN'S OWN DIALS (hr_tick_config as the migrations leave it; the other shapes keep their
// 11-02 overrides). Never production, never a real character (CLAUDE.md section 2): the accounts are this clone's own synthetic rows.
//   THE LAG GATE. Since the flush (lane/c-settle-flush) every hunt's lag (now - settled_to) is a 0 to flush + cadence sawtooth BY DESIGN,
//   so the 32 s is read PAST DUE: how far past its flush (hr_tick_config.flush_seconds) a hunt waits for its save. Red when any reading
//   of any open hunt reaches the look-ahead a watched browser holds (src/data/hunt-tuning.js liveSeeds x src/core/combat.js
//   COMBAT_BALANCE.tickMs = 32 s): there the viewer runs out of seeds, the line tools/lib/hunt-lag.mjs calls FREEZING (flush + a poll +
//   slack, 121 s). Reported raw and past due, p50 / p95 / p99 / max over every hunt at every 10 s sample.
//   THE COST GATE. Journal rows, statements and row writes a hero-hour (every settle kind's statements, the public tables' tuple writes)
//   against tests/per-player-cost.mjs's fixtures, blended by each group's kit and tab share (ltCostVerdict): past +25%
//   (CONCURRENCY.band) is red. The exact per-settle numbers with the switches on are per-player-cost --lit's (every push, PGlite).
//   THE BENCH. A runner holds the engine, the edges' JSON and PostgreSQL on one box (production gives every edge request its own
//   isolate), so the report carries the box's busy cores, the postgres processes' cores and each worker's event-loop use: a red read
//   on a saturated bench names that. MEASURED (run 45993601381, 4 vCPU): 1,000 fours with a tenth of the tabs open saturate it (3.64
//   cores busy, worker loops 0.91), the engine's wall per run inflates to 1.2 s, bodies defer on the 800 ms engine budget and every
//   watched confirm simulates the growing lag, so the nightly runs 2% open: the tick's whole closed load, the door's locks still met.
//   The watched door's cost a tab is the heavy four band's (40 fours, half open) and the fixtures'. Costs are per PAID hero-hour.
//   PERSONAL LOOT AS BUILT: each hero rolls its own Trait finds with its own pity (src/core/trait-roll.js, hero_pity). The per-hero
//   ordinary drop roll (20-v030 lane P1) is not built and nothing reads `personal_loot` yet: when P1 lands, this re-runs.
// ci-step: pg17-lt | The v0.3.0 load test, 1,000 accounts x 4 heroes with the drop switches on, settle lag and per-hero cost in budget (nightly, PostgreSQL 17)
// ci-run: node tools/beta-load.mjs --shape=lt --accounts=1000 --online=0.02 --minutes=5 --warm=120 --workers=3 --json=beta-load-lt.json
//
// THE HEAVY FOUR'S BAND (lane/c-cost-fixtures 2026-11-20; balance program L11, call 28 step 10). --shape=krell4 makes every account the
// heavy four on Krell's Hold, Deadly (tests/per-player-cost.mjs HEAVY_FOUR, built by its buildFour: the fixture the release path measures
// alone on PGlite), the first --online share with its tab open (a hello every 16 s and the early asks), the rest away on the world tick.
// At the end its journal rows and settle statements a hero-hour (every statement the engine sent to settle: the workers' execOf counters)
// are judged against that file's two Krell rows, blended by the open share (concurrencyBand): past +25% is red (exit 1), beside the audit.
// THE CONCURRENCY. The beta's 250 accounts (docs/design/balance-program/30-plan.md §F: the gate runs "before the beta passes 250
// accounts") at 28-platform.md's mixed share of Heavy fours (15%) is 38 heavy-four accounts: 40, every four hunting at once, half the tabs
// open (30-plan §F's "half their tabs open"). The plan's 1,000 Own-four accounts do not fit a 4-core runner (28's own table: 5.8 cores, a
// 2XL), so the gate runs the shape that SETS the per-hero cost at a size a runner holds; absolute capacity is the capacity sample's.
// ESTIMATED, NOT YET RUN ON A RUNNER (no PostgreSQL 17 on the authoring PC): world ~1 min (40 x ~90 statements), warm 1, measured 3,
// drain and audit ~0.5 = ~5.5 min beside the mixed run's ~8 in pg17-load's 26; re-budget both from the first nightly.
// ci-step: pg17-load | The heavy four at the beta's concurrency, its journal rows and statements a hero-hour in band (nightly, PostgreSQL 17)
// ci-run: node tools/beta-load.mjs --shape=krell4 --accounts=40 --online=0.5 --minutes=3 --warm=60 --workers=2 --json=beta-load-krell4.json
//
// WHY THIS AND NOT tools/load-probe.mjs. load-probe's model multiplies ONE measured settle; settle-cost measures one
// instance in series. This runs the whole population at once on a real server: hr_tick_cron_run's real roster and leases,
// the shipped tick.js and hunt-settle.js against a connection pool the size of production's, each viewed hero's hello on
// the client's cadence, unviewed reads, social, chat and market reads, and the cron jobs on their production schedules.
//
// THE SERVER. A scratch cluster shaped like Small, started by the caller and reached through tools/pg-replay.mjs's HR_PG_PORT /
// HR_PG_DATA / HR_PG_BIN: shared_buffers 512MB, max_connections 200, shared_preload_libraries pg_stat_statements, full_page_writes on
// (the WAL volume is honest), fsync off, and max_files_per_process 4000. THE LAST TWO ARE NOT OPTIONAL ON WINDOWS: one file open costs
// 17 ms on this PC, so at the default 1000 every backend churns its descriptors and statements read 5-10x slow; with fsync on, a clone's
// forced checkpoint takes 4+ minutes. Build the template with fsync and synchronous_commit off too (it takes ~50 minutes either way).
// CPU: production ran a CPU-only hash statement 1.4x slower than this bench (read-only, 11-02), and per-statement production means agree
// (hr_state_of 40 vs 24 ms, hr_tick_cron_run 24 vs 16, hr_perks_of 2.3 vs 1.6; hr_load 92 vs 27-35, its heroes carry more). So the bench gives
// the counts, the concurrency and the bytes; Small's CPU is about 1.4 x db_cpu_cores_local, cross-checked as counts x production's means.
//
// MEASURED 2026-11-02, worst realistic hour (party 0.4, town 0.25, every account online, every hero hunting, 5 min after warm-up):
//   20 x 4    0.22 bench cores (~0.30 on Small), 120 edge calls/min, 1.7 frames/s, lag 129 s max (a deferred selector), audit 0 red
//   100 x 4   1.01 bench cores (~1.45 on Small), 588 edge calls/min, 8.2 frames/s, lag 102 s max, pool queue < 51 ms, audit 0 red
//   20 x 4, --unviewed-poll-ms=0: exec 205 -> 164 ms/s on the bench; hr_load is 3x dearer on production, so ~-30 % there.
//   Drills, audit 0 red each: tick-stop (20 x 4) peak lag 681 s, drained 60 s after the return; edge-5xx (12 x 4) peak 189 s; retry (12 x 4).
//
// WHAT IT CANNOT SEE: Deno isolate limits and cold starts, the pooler's own latency, Realtime's fan-out (realtime.send is
// a recording stub; the bytes are real), and network RTT. Those are modeled and named in the report.
//
// A run ends with THE AUDIT: every session's journalled window ms == its clock's move (nothing lost or paid twice), every
// tally == its ledger, no intent id twice. A drill passes only if the audit is clean and the lag came back.
// Exit: 0 audit clean (and, --shape=krell4, the band green) · 1 audit or band red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, readdirSync, appendFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import postgres from 'postgres';

const PORT = Number(process.env.HR_PG_PORT || 55417);
const DATA = process.env.HR_PG_DATA || '';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };

/* tools/pg-replay.mjs's value parsing, so the shipped edge reads the values it reads there. */
const TYPES = {
  json: { to: 114, from: [114, 3802], serialize: (x) => (typeof x === 'string' ? x : JSON.stringify(x)), parse: (x) => JSON.parse(x) },
  int8: { to: 20, from: [20], serialize: (x) => String(x),
    parse: (x) => { const b = BigInt(x); return b < BigInt(Number.MIN_SAFE_INTEGER) || b > BigInt(Number.MAX_SAFE_INTEGER) ? b : Number(b); } },
};
const connect = (database, max) => postgres({ host: '127.0.0.1', port: PORT, user: 'postgres', database, max, prepare: false,
  onnotice: () => {}, types: TYPES, idle_timeout: 0, connection: { application_name: 'hr-beta-load', TimeZone: 'UTC' } });

/* THE CLIENT'S CADENCES, from the code that sends them (src/session/config.js, src/data/chat-channels.js,
   src/data/town-presence.js, src/shell/market-watch.js). */
const C = {
  huntPollMs: 16000,      // a viewed hunt's landed settle
  earlyAsksPerPoll: 0.6,  // live-view start-point asks; the pacer's cap is 6 asks a minute a character (6 x 16/60 = 1.6)
  unviewedPollMs: 0,      // hr_load for each hunting hero not on screen: none since the 11-19 server audit (row 5); 60000 models the old client
  socialPollMs: 30000,    // hr_social_poll
  townPollMs: 2000,       // hr_town_view while a town is drawn (TOWN_PRESENCE.pollMs; 6 s at rest)
  townMoveMs: 8000,       // hr_town_move, a walker who walks about half the time
  marketReadMs: 60000,    // a market browse + market_mine a minute (ASSUMED: market open on every page)
  chatLineMs: 120000,     // a chat line every two minutes an account (ASSUMED: a lively beta)
};

/* ── THE WORKER: one or more "edges and browsers", each owning some accounts ─────────────────────────────────────────── */
async function workerMain() {
  const { dbName, enginePool, restPool, accounts, root } = workerData;
  const u = (p) => new URL(`file:///${join(root, p).replace(/\\/g, '/')}`).href;
  const TK = await import(u('supabase/functions/hr-accrue/tick.js'));
  const HS = await import(u('supabase/functions/hr-accrue/hunt-settle.js'));
  const engine = connect(dbName, enginePool);
  const rest = connect(dbName, restPool);
  const stats = new Map();
  const stat = (k) => { let s = stats.get(k); if (!s) { s = { n: 0, wall: [], queue: 0, db: 0, bytes: 0, errors: 0, engine: 0 }; stats.set(k, s); } return s; };
  const mode = { edge: 'ok', retry: 0 };
  let live = false;
  const log = (s, wall, bytes) => { s.n++; if (s.wall.length < 20000) s.wall.push(wall); s.bytes += bytes || 0; };
  const JSONLEN = (x) => { try { return JSON.stringify(x).length; } catch { return 0; } };

  /* index.ts's exec: one transaction a statement, on the pool, role hr_engine, the frame-self marker if a player asked. */
  const execOf = (s, marker) => async (text, params) => {
    s.stmts = (s.stmts || 0) + 1;   // payload statements, the unit tests/per-player-cost.mjs counts (--shape=krell4's band)
    const t0 = performance.now(); let t1 = t0;
    const rows = await engine.begin(async (tx) => {
      t1 = performance.now(); s.queue += t1 - t0;
      await tx.unsafe('set local role hr_engine');
      if (marker) await tx.unsafe(`select set_config('hr.frame_self', '${marker}', true)`);
      return tx.unsafe(text, params || []);
    });
    s.db += performance.now() - t1;
    return Array.from(rows);
  };
  /* A PostgREST call: its pre-request (role, claims, hr_access_check), then the RPC. */
  const rpc = async (kind, uid, text, params) => {
    const s = stat(kind); const t0 = performance.now();
    try {
      const rows = await rest.begin(async (tx) => {
        const t1 = performance.now(); s.queue += t1 - t0;
        await tx.unsafe(`select set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', $1, true)`, [uid]);
        await tx.unsafe('select public.hr_access_check()');
        const r = await tx.unsafe(text, params || []);
        s.db += performance.now() - t1;
        return r;
      });
      log(s, performance.now() - t0, JSONLEN(rows[0]));
      return rows[0];
    } catch (e) { s.errors++; s.last = String(e.message).slice(0, 160); return null; }
  };

  /* ONE EDGE INVOCATION with the drill's faults. 'fail': the function never ran. 'lost': it ran and the answer was lost
     (the caller sees a 5xx, the commit stands). retry: delivered 1 + n times at once. */
  const invoke = async (kind, fn) => {
    const s = stat(kind); const t0 = performance.now();
    if (mode.edge === 'fail') { s.errors++; s.n5xx = (s.n5xx || 0) + 1; return null; }
    if (mode.edge === 'mixed' && Math.random() < 0.5) { s.errors++; s.n5xx = (s.n5xx || 0) + 1; return null; }
    const lost = mode.edge === 'mixed' && Math.random() < 0.5;
    try {
      const runs = [fn(s)];
      for (let i = 0; i < mode.retry; i++) runs.push(fn(stat(kind + ':retry')));
      const [out] = await Promise.all(runs);
      log(s, performance.now() - t0, JSONLEN(out));
      if (lost) { s.lost = (s.lost || 0) + 1; return null; }
      return out;
    } catch (e) { s.errors++; s.last = String(e.message).slice(0, 200); return null; }
  };

  /* A BROWSER'S HELLO: index.ts's accrue read, statement for statement (tools/settle-cost.mjs restates it; SB-0 pins it),
     the seed read, then the settle. minWindowMs: an early ask, answered below the floor. */
  const hello = (a, early) => invoke(early ? 'hello_early' : 'hello', async (s) => {
    const marker = `${a.uid.toLowerCase()}:${a.viewed}`;
    const x = execOf(s, marker);
    await x(`select public.hr_rate_gate($1::uuid, $2::int, 'accrue:' || $2::text) as allowed`, [a.uid, a.viewed]);
    await x('select public.hr_accrue_read($1::uuid, $2::int) as state, public.hr_accrue_cap_ms($1::uuid, $2::int) as cap_ms, now() as now', [a.uid, a.viewed]);
    await x('select monster_id, kills from public.hr_bestiary_of($1::uuid, $2::int)', [a.uid, a.viewed]);
    await x('select monster_id, stage from public.hr_trophy_of($1::uuid, $2::int)', [a.uid, a.viewed]);
    await x('select public.hr_hunt_open_of($1::uuid, $2::int) as session', [a.uid, a.viewed]);
    await x('select count(*)::int as n from public.hr_collection_of($1::uuid, $2::int)', [a.uid, a.viewed]);
    await x(`select (public.hr_seed($1::uuid, $2::int, $3) & 4294967295)::bigint as seed,
             public.hr_seed($1::uuid, $2::int, $4)::text as salt, public.hr_perks_of($1::uuid, $2::int) as perks`, [a.uid, a.viewed, 'accrue:x', 'intent:accrue:x']);
    const t = performance.now();
    /* the shipped client's ask names the version its record holds whole (character-session.js `have`): the last answer that carried it;
       its landed poll runs a prediction, so it CONFIRMS (hunt-ask.js `confirm`: saved at the flush, hunt-settle.js flushDue) */
    const v = await HS.settleHunt({ exec: x, user: a.uid, slot: a.viewed, mode: 'settle', bucket: null, project: true, live: true,
      ...(early ? { minWindowMs: 1e15 } : { confirm: true }), ...(Number.isSafeInteger(a.held) ? { have: a.held } : {}) });
    if (v && v.body && v.body.state && Number.isSafeInteger(v.body.version)) a.held = v.body.version;
    s.settle = (s.settle || 0) + performance.now() - t;
    s.outcomes = s.outcomes || {}; s.outcomes[v.outcome + (v.reason ? ':' + v.reason : '')] = (s.outcomes[v.outcome + (v.reason ? ':' + v.reason : '')] || 0) + 1;
    return v.body;
  });

  const market = (a) => invoke('market', async (s) => {
    const x = execOf(s, null);
    const [b] = await x(`select public.hr_market_browse($1::uuid, $2::int, $3::text::text[], $4::text, $5::int) as res`, [a.uid, a.viewed, null, null, 50]);
    const [m] = await x('select public.hr_market_mine($1::uuid, $2::int) as res', [a.uid, a.viewed]);
    return [b, m];
  });

  const timers = [];
  const every = (ms, fn) => {
    const start = Math.random() * ms;
    timers.push(setTimeout(() => {
      if (!live) return;
      fn();
      timers.push(setInterval(() => { if (live) fn(); }, ms));
    }, start));
  };
  function startBrowsers() {
    live = true;
    for (const a of accounts) {
      if (!a.online) continue;
      if (a.kind === 'town') {
        let cursor = null;
        every(C.townPollMs, async () => {
          const r = await rpc('town_view', a.uid, 'select public.hr_town_view(p_slot => $1::int, p_map => $2::text, p_cx => 0, p_cy => 0, p_cursor => $3::bigint, p_pcx => 0, p_pcy => 0) as r', [a.viewed, a.map, cursor]);
          if (r && r.r && Number.isSafeInteger(r.r.cursor)) cursor = r.r.cursor;
        });
        every(C.townMoveMs, () => rpc('town_move', a.uid, `select public.hr_town_move(p_slot => $1::int, p_map => $2::text, p_x => 10, p_y => 10, p_gx => 12, p_gy => 12, p_dir => 'e') as r`, [a.viewed, a.map]));
      } else {
        every(C.huntPollMs, () => hello(a, false));
        every(C.huntPollMs / C.earlyAsksPerPoll, () => hello(a, true));
      }
      for (const slot of a.slots) {
        if (slot === a.viewed) continue;
        /* --unviewed-poll-ms=0: the cut that raises the client's poll past the frames' own cadence, so it never fires while they flow */
        if (workerData.unviewedPollMs > 0) every(workerData.unviewedPollMs, () => rpc('hr_load', a.uid, 'select public.hr_load(p_slot => $1::int) as r', [slot]));
      }
      every(C.socialPollMs, () => rpc('social_poll', a.uid, 'select public.hr_social_poll(p_slot => $1::int, p_slots => $2::int[]) as r', [a.viewed, a.slots]));
      every(C.marketReadMs, () => market(a));
      every(C.chatLineMs, () => rpc('chat_send', a.uid, `select public.hr_chat_send(p_slot => $1::int, p_kind => 'global', p_body => $2::text) as r`, [a.viewed, 'hello from the replay']));
    }
  }
  const body = (b) => invoke('tick_body', async (s) => {
    const t0 = performance.now();
    const r = (await TK.runTick({ exec: execOf(s, null), body: b })).body;
    s.walls = s.walls || []; s.walls.push(performance.now() - t0);
    if (r && r.hunts) {
      const h = r.hunts;
      s.settled = (s.settled || 0) + (h.settled || 0); s.nothing = (s.nothing || 0) + (h.nothing || 0);
      s.refused = (s.refused || 0) + (h.refused || 0); s.ended = (s.ended || 0) + (h.ended || 0); s.deferred = (s.deferred || 0) + (h.deferred || 0);
      s.engine += h.engine_ms || 0; s.engineMax = Math.max(s.engineMax || 0, h.engine_ms || 0); if (h.engine_ms) { s.bodyEngine = s.bodyEngine || []; s.bodyEngine.push(h.engine_ms); } s.engineRunMax = Math.max(s.engineRunMax || 0, h.engine_max_ms || 0);
      for (const [k, v] of Object.entries(h.reasons || {})) { s.reasons = s.reasons || {}; s.reasons[k] = (s.reasons[k] || 0) + v; }
    }
    return { summary: r && r.hunts };
  });

  /* THIS EDGE'S OWN BUSY SHARE over the measured window (its thread's event loop: the engine is synchronous, so a share near 1 is a
     worker that ran out of CPU and a lag the bench made, not the server) */
  let elu0 = performance.eventLoopUtilization();
  parentPort.on('message', async (m) => {
    if (m.t === 'start') startBrowsers();
    else if (m.t === 'body') { await body(m.body); parentPort.postMessage({ t: 'done', id: m.id }); }
    else if (m.t === 'mode') Object.assign(mode, m.mode);
    else if (m.t === 'reset') { stats.clear(); elu0 = performance.eventLoopUtilization(); }
    else if (m.t === 'stop') {
      const elu = performance.eventLoopUtilization(elu0).utilization;
      live = false; for (const x of timers) { clearTimeout(x); clearInterval(x); }
      await new Promise((r) => setTimeout(r, 3000));
      parentPort.postMessage({ t: 'stats', cpu: process.cpuUsage(), elu, stats: Array.from(stats.entries()) });
      await Promise.all([engine.end({ timeout: 5 }), rest.end({ timeout: 5 })]);
      process.exit(0);
    }
  });
  parentPort.postMessage({ t: 'ready' });
}

/* ── THE AUDIT: nothing lost, nothing paid twice ──────────────────────────────────────────────────────────────────────── */
const PURSE = 5000000;
const purseBase = async (sql) => new Map((await sql.unsafe(`select w.user_id, w.gold::bigint as gold,
    (select coalesce(sum(l.gold), 0) from public.player_ledger l where l.user_id = w.user_id and l.intent is distinct from 'beta_load_fill')::bigint as moved
  from public.account_wallet w where w.user_id in (select user_id from public.hunt_sessions)`)).map((p) => [p.user_id, { gold: Number(p.gold), moved: Number(p.moved) }]));
async function auditSessions(sql, fromBySession, base) {
  const rows = await sql.unsafe(`
    select h.id, h.instance_id, floor(extract(epoch from h.settled_to) * 1000)::bigint as to_ms,
      floor(extract(epoch from h.hunt_from) * 1000)::bigint as from_ms,
      (select coalesce(sum((l.meta->>'ms')::bigint), 0) from public.player_ledger l where l.session_id = h.id and l.kind = 'combat' and l.intent = 'accrue') as ms,
      (select count(*) from public.player_ledger l where l.session_id = h.id and l.kind = 'combat' and l.intent = 'accrue') as windows,
      (select coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then (l.meta->>'kills')::int else 0 end), 0) from public.player_ledger l where l.session_id = h.id) as lkills,
      (select coalesce(sum(case when l.kind <> 'hunt' then l.gold else 0 end), 0) from public.player_ledger l where l.session_id = h.id) as lcoins,
      t.kills as tkills, t.coins as tcoins
    from public.hunt_sessions h left join public.hunt_session_tally t on t.session_id = h.id`);
  const red = [];
  let windows = 0;
  for (const r of rows) {
    windows += Number(r.windows);
    const from = fromBySession && fromBySession.get(r.id) !== undefined ? fromBySession.get(r.id) : Number(r.from_ms);
    if (Number(r.ms) !== Number(r.to_ms) - from) red.push(`session ${String(r.id).slice(-6)}: journalled ${r.ms} ms for a clock that moved ${Number(r.to_ms) - from} ms`);
    if (Number(r.tkills ?? 0) !== Number(r.lkills) || Number(r.tcoins ?? 0) !== Number(r.lcoins)) red.push(`session ${String(r.id).slice(-6)}: tally ${r.tkills}/${r.tcoins} != ledger ${r.lkills}/${r.lcoins}`);
  }
  /* THE PURSE: every coin the account's wallet moved since the baseline is a ledger row. */
  const purse = await purseBase(sql);
  if (base) for (const [u, p] of purse) {
    const b = base.get(u);
    if (!b) continue;
    if (p.gold - b.gold !== p.moved - b.moved) red.push(`purse ${String(u).slice(-6)}: ${p.gold - b.gold} moved, the ledger says ${p.moved - b.moved}`);
  }
  return { red, sessions: rows.length, windows, purses: purse.size };
}

/* ── THE MAIN: the world, the crons, the clock ─────────────────────────────────────────────────────────────────────────── */
const nowMs = () => performance.now();
const pct = (a, q) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]; };
const uidOf = (i) => `00000000-0000-4000-8000-${(0xbe7a0000 + i).toString(16).padStart(12, '0')}`;

async function buildWorld(db, { accounts, heroes, partyShare, townShare, online, idleAccounts, shape = 'mixed', name = null, grounds: groundsArg = '',
  builders = 4, flame = 'room' }) {
  const H = (await import('../tests/hunt-sessions-settle.mjs')).HARNESS;
  const M = await H.loadEdge(H.ROOT);
  const { SHIM_CRYPTO, SHIM_VAULT, SHIM_NET } = await import('../tests/world-tick-token-shims.mjs');
  const one = async (t, p) => { const r = (await db.query(t, p)).rows[0]; return r ? Object.values(r)[0] : undefined; };
  await db.exec(SHIM_CRYPTO + SHIM_VAULT + SHIM_NET);
  await db.exec(`create schema if not exists realtime;
    create table if not exists realtime.bench_frames (n bigserial primary key, topic text, event text, payload jsonb, at timestamptz default now());
    create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
      language sql as $f$ insert into realtime.bench_frames (topic, event, payload) values (topic, event, payload) $f$;`);
  await db.query(`update public.hr_hunt_config set enabled = true where id`);
  /* --shape=lt runs the world tick on the chain's own dials (1004-tick-pack-heroes.sql's 16 instances / 16 heroes / 32 bodies a fire,
     the flush, the cadence, the lease): only the switch, the frames and the queue's URL are the bench's. The other shapes keep the 11-02
     rig's overrides (its hunt_body_max 4 predates 1004's 16; a four's body is 4 instances either way, so the heavy four's band is unmoved). */
  if (shape === 'lt') await db.query(`update public.hr_tick_config set enabled = true, frame_push = true,
    edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue' where id`);
  else await db.query(`update public.hr_tick_config set enabled = true, flush_seconds = 90, cadence_seconds = 10, batch_limit = 200, lease_ms = 30000,
    shards = 1, fold_windows = 1, catchup_windows = 1, hunt_body_max = 4, hunt_bodies_max = 32, frame_push = true,
    edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue' where id`);
  const kit = { inv: { cooked_shrimp: 400 }, bag: [{ item: 'cooked_shrimp', qty: 300 }] };
  const stacks = (await db.query(`select item_id from public.hr_items order by item_id limit 60`)).rows.map((r) => r.item_id);
  const grounds = (await db.query('select hunt_id from public.hr_hunt_grounds')).rows.map((r) => r.hunt_id);
  const partyGround = grounds.includes('millrace_sewer') ? 'millrace_sewer' : grounds[0];
  const soloGround = grounds.includes('meadowbrook_thicket') ? 'meadowbrook_thicket' : (grounds.find((g) => /thicket/.test(g)) || grounds[0]);
  const out = [];
  const townMap = (await db.query('select map_id from public.hr_town_maps order by map_id limit 1')).rows[0]?.map_id || 'town';
  const asUser = (uid) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  const levelXp = M.XP.charXpForLevel(20);
  const skillXp = Object.fromEntries(['melee', 'ranged', 'magic', 'defense'].map((k) => [k, M.XP.skillXpForLevel(k, 20)]));
  const nameOf = (i, s) => 'Bench' + String(i).split('').map((d) => 'abcdefghij'[Number(d)]).join('') + 'wxyz'[s];
  const refused = {};
  /* Extra slots are bought with gold in play: on this scratch clone they are starters while the fixture builds; an existing
     character then owns its slot (hr_hero_slots_of's grandfather clause). */
  const starters = (await db.query('select slot_id from public.hr_hero_slots where starter')).rows.map((r) => r.slot_id);
  await db.query('update public.hr_hero_slots set starter = true');
  const idle = Number(idleAccounts || 0);
  /* --shape=krell4: every account is THE HEAVY FOUR on Krell's Hold, Deadly (tests/per-player-cost.mjs HEAVY_FOUR and buildFour: the
     fixture the release path measures alone, here at concurrency), its tab open for the first `online` share */
  if (shape === 'krell4') {
    const PPC = await import('../tests/per-player-cost.mjs');
    for (let i = 0; i < accounts; i++) {
      const uid = uidOf(i);
      const { slots } = await PPC.buildFour(db, M, uid, PPC.HEAVY_FOUR, { as: asUser });
      out.push({ uid, slots, viewed: 0, kind: 'party', online: i / accounts < online, map: townMap });
    }
  }
  /* --shape=lt: THE v0.3.0 LOAD TEST (header). The switches first (a hunt session freezes its luck at its insert), then each account's
     fire at --flame, then the fours, built by --builders connections at once (one account at a time each; buildFour sets its claim on
     its own connection). A refused four is counted under `refused` and the run goes on without it. */
  let lt = null;
  if (shape === 'lt') {
    const PPC = await import('../tests/per-player-cost.mjs');
    const { DANGER_GROUNDS } = await import('../src/data/danger.js');
    const lit = await PPC.lightSwitches(db);
    const rolling = (await db.query(`select p.hunt_id from public.hr_piece_grounds p join public.hr_hunt_grounds g on g.hunt_id = p.hunt_id
      where p.max_rank > 0 order by p.hunt_id`)).rows.map((r) => r.hunt_id);
    const named = String(groundsArg || '').split(',').map((s) => s.trim()).filter(Boolean);
    const pool = (named.length ? named : rolling).map((g) => {
      if (!grounds.includes(g)) throw new Error(`--grounds: ${g} is not a hunting ground on this chain`);
      const d = DANGER_GROUNDS[g];
      if (!d) throw new Error(`--grounds: ${g} is not on the Danger scale (src/data/danger.js DANGER_GROUNDS)`);
      return { hunt: g, kit: d.entryLevel >= LT_HEAVY_AT ? 'heavy' : 'own', rolls: rolling.includes(g) };
    });
    const plan = ltPlan(accounts, pool, online);
    const flameMpts = flame === 'room' ? Number(await one('select public.hr_flame_room_mpts(1)')) : Math.max(0, Math.floor(Number(flame) || 0));
    const luckPm = Number(await one('select public.hr_flame_luck_pm($1::bigint)', [flameMpts]));
    const { attachPg } = await import('./pg-replay.mjs');
    const conns = [];
    for (let k = 0; k < Math.max(1, Math.min(builders, plan.length)); k++) conns.push(await attachPg(name));
    const built = [];
    let next = 0;
    await Promise.all(conns.map(async (c) => {
      const as = (uid) => c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
      for (let k = next++; k < plan.length; k = next++) {
        const p = plan[k]; const uid = uidOf(k);
        try {
          await c.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
          if (flameMpts > 0) await c.query(`insert into public.company_flame (user_id, height_mpts) values ($1, $2)
              on conflict (user_id) do update set height_mpts = excluded.height_mpts`, [uid, flameMpts]);
          const { slots } = await PPC.buildFour(c, M, uid, { ...(p.kit === 'heavy' ? PPC.HEAVY_FOUR : PPC.OWN_FOUR), hunt: p.hunt }, { as });
          built.push({ k, a: { uid, slots, viewed: 0, kind: 'party', online: p.online, map: townMap, ground: p.hunt, kit: p.kit } });
        } catch (e) { const key = `${p.hunt}: ${String(e.message).slice(0, 90)}`; refused[key] = (refused[key] || 0) + 1; }
      }
    }));
    for (const c of conns) await c.close();
    out.push(...built.sort((x, y) => x.k - y.k).map((x) => x.a));
    lt = { lit, flame: { height_mpts: flameMpts, luck_pm: luckPm }, pool, builders: conns.length };
  }
  for (let i = shape === 'krell4' || shape === 'lt' ? accounts : 0; i < accounts + idle; i++) {
    const uid = uidOf(i);
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
    await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'beta-load') on conflict (user_id) do nothing`, [uid]);
    await db.query(`insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do nothing`, [uid, 'Bench' + i]).catch(() => {});
    await asUser(uid);
    const slots = [];
    for (let s = 0; s < heroes; s++) {
      const c = await one('select public.hr_create_character($1::int)', [s]);
      if (!c || !(c.created === true || c.ok === true)) {
        /* Extra slots are bought with gold in play; the fixture opens them on the replay only. */
        refused[JSON.stringify(c).slice(0, 80)] = (refused[JSON.stringify(c).slice(0, 80)] || 0) + 1;
        break;
      }
      slots.push(s);
      await db.query(`update public.player_state set active_kind = 'idle', active_id = null, level_xp = $3 where user_id = $1 and slot = $2`, [uid, s, levelXp]);
      /* skill_id (2026-08-11-player-state.sql): until 2026-11-20 this wrote a column `skill` that never existed behind a silent catch,
         so every bench hero fought at combat skill 1 under its Level 20 */
      for (const [skill, xp] of Object.entries(skillXp)) {
        await db.query(`insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, $2, $3, $4) on conflict (user_id, slot, skill_id) do update set xp = excluded.xp`, [uid, s, skill, xp]);
      }
      await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) select $1, $2, x, 1 from unnest($3::text[]) x on conflict do nothing`, [uid, s, stacks]).catch(() => {});
      await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, $2, 'cooked_shrimp', 400) on conflict (user_id, slot, item_id) do update set qty = excluded.qty`, [uid, s]);
      await one(`select public.hr_character_name_set($1::int, $2, $3::uuid)`, [s, nameOf(i, s), randomUUID()]);
    }
    await db.query(`insert into public.account_wallet (user_id, gold) values ($1, ${PURSE}) on conflict (user_id) do update set gold = excluded.gold`, [uid]);
    if (i >= accounts) continue;   // the population the tables must hold, standing in town
    const kind = i / accounts < partyShare ? 'party' : (i / accounts < partyShare + townShare ? 'town' : 'solo');
    const bag = JSON.stringify(kit.bag);
    const enter = async (s, g) => {
      await asUser(uid);
      const e = await one(`select public.hr_hunt_enter($1::int, $2, $3::jsonb, 0, null, $4::uuid)`, [s, g, bag, randomUUID()]);
      if (!e || e.ok !== true) { const k = JSON.stringify(e).slice(0, 80); refused[k] = (refused[k] || 0) + 1; return false; }
      return true;
    };
    if (kind === 'party' && slots.length > 1) {
      await asUser('');
      const pid = await one('select public.hr_party_open($1::uuid, 0)', [uid]);
      for (const s of slots.slice(1)) await db.query('select public.hr_party_seat_into($1::uuid, $2::uuid, $3::int)', [pid, uid, s]);
      await db.query('update public.hunt_parties set hunt_id = $2 where id = $1', [pid, partyGround]);
      for (const s of slots) await enter(s, partyGround);
    } else {
      for (const s of slots) if (!(kind === 'town' && s === 0)) await enter(s, soloGround);
    }
    out.push({ uid, slots, viewed: 0, kind, online: i / accounts < online, map: townMap });
  }
  await asUser('');
  await db.query('update public.hr_hero_slots set starter = (slot_id = any ($1::int[]))', [starters]);
  /* Staggered clocks over one flush: a population, not a stampede. The hunt's own start stays the audit's zero. */
  await db.query(`update public.hunt_instances i set settled_to = date_trunc('second', now() - make_interval(secs => s.lag)), next_swing_at = date_trunc('second', now() - make_interval(secs => s.lag))
      from (select id, (random() * 90)::int + 1 as lag from public.hunt_instances where id in (select instance_id from public.hunt_sessions where ended_at is null)) s where i.id = s.id`);
  await db.query(`update public.hunt_sessions h set hunt_from = i.settled_to, settled_to = i.settled_to, next_swing_at = i.settled_to, entered_at = i.settled_to - interval '1 minute'
      from public.hunt_instances i where i.id = h.instance_id and h.ended_at is null`);
  /* The journal, at the size retention keeps: the 2,000 rows a hero production carries today, as index depth for the writes. */
  const heroCount = (accounts + idle) * heroes;
  await db.query(`insert into public.player_ledger (user_id, slot, kind, intent, at)
    select $1::uuid, 0, 'admin', 'beta_load_fill', now() - interval '30 days' from generate_series(1, $2::int)`, [uidOf(0), Math.min(heroCount * 2000, 1000000)]).catch((e) => { refused['ledger fill: ' + String(e.message).slice(0, 60)] = 1; });
  await db.exec('analyze');
  return { accounts: out, refused, partyGround, soloGround, lt };
}

async function cpuOf(pid) {
  const ps = `$p=${pid}; $x=Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq $p -or $_.ParentProcessId -eq $p }; ($x | Measure-Object -Property UserModeTime -Sum).Sum + ($x | Measure-Object -Property KernelModeTime -Sum).Sum`;
  try { return Number(execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 30000 }).trim()) / 1e7; } catch { return NaN; }
}

/* ── THE v0.3.0 LOAD TEST: its plan, its verdicts and its bench (--shape=lt; the plan and the verdicts are pure: --selftest feeds them) ── */
/** A ground entered at this Level or more gets the heavy four's Level 80 kit; below it, the own four's Level 50 kit. */
const LT_HEAVY_AT = 70;
/** The look-ahead a watched browser holds, s: src/data/hunt-tuning.js liveSeeds swings of src/core/combat.js COMBAT_BALANCE.tickMs (32 s). */
async function lookAheadS() {
  const [{ HUNT_TUNING }, { COMBAT_BALANCE }] = await Promise.all([import('../src/data/hunt-tuning.js'), import('../src/core/combat.js')]);
  return (Number(HUNT_TUNING.liveSeeds) * Number(COMBAT_BALANCE.tickMs)) / 1000;
}
/** The fixtures each kit is judged by (tests/per-player-cost.baseline.json). The own four has no watched fixture: its door is the heavy
    four's (a hello's statements do not depend on the ground; its journal rows moved 4% between the Krell doors), ASSUMED and named. */
const LT_KITS = Object.freeze({
  heavy: Object.freeze({ watched: 'krell4_L80_deadly_watched', closed: 'krell4_L80_deadly_closed' }),
  own: Object.freeze({ watched: 'krell4_L80_deadly_watched', closed: 'supply4_L50_hasks_ford_deadly' }),
});
const LT_METRICS = Object.freeze(['ledger_rows_a_hero_hour', 'statements_a_hero_hour', 'row_writes_a_hero_hour']);
/** Account k's ground (round robin over `pool`, so every ground holds the same number) and tab: the first `online` share of each
    ground's own accounts. Pure. */
function ltPlan(accounts, pool, online) {
  const n = pool.length; const per = pool.map((_, g) => Math.ceil((accounts - g) / n));
  return Array.from({ length: accounts }, (_, k) => { const g = k % n; return { ...pool[g], online: Math.floor(k / n) < Math.round(per[g] * online) }; });
}
/** THE LAG VERDICT. `readings`: every open hunt's lag (s) at every sample; past due = lag - flushS. Red at a reading past due by the
    look-ahead or more, or with no reading at all. Pure. */
function ltLagVerdict(readings, flushS, budgetS) {
  const all = readings.filter((x) => Number.isFinite(x));
  const past = all.map((l) => Math.max(0, l - flushS));
  const q = (a) => ({ p50: r1(pct(a, 0.5)), p95: r1(pct(a, 0.95)), p99: r1(pct(a, 0.99)), max: r1(pct(a, 1)) });
  const over = past.filter((x) => x >= budgetS).length;
  const red = [];
  if (!all.length) red.push('lag: no reading (no open hunt was measured)');
  else if (over) red.push(`lag: ${over} of ${all.length} readings past the ${flushS} s flush by ${budgetS} s or more (max ${r1(pct(past, 1))} s): a watched hunt there has run out of its look-ahead`);
  return { raw: q(all), past_due: q(past), budget_s: budgetS, flush_s: flushS, readings: all.length, over, red };
}
/** THE COST VERDICT. `measured`: the population's LT_METRICS; `groups`: [{ kit, heroes, tabs }]. Each kit's watched and closed fixture,
    blended by its tab share, weighted by its heroes; red past the blend by more than `band`, low under half of it. Pure. */
function ltCostVerdict(measured, base, groups, band) {
  const F = (base && base.fixtures) || {};
  const red = []; const low = []; const expected = {};
  const heroes = groups.reduce((n, g) => n + Number(g.heroes || 0), 0);
  if (!(heroes > 0)) return { red: ['cost: no hunting hero to judge'], low, expected: null };
  for (const g of groups) for (const d of ['watched', 'closed']) {
    const fx = (LT_KITS[g.kit] || {})[d];
    if (!fx || !F[fx]) red.push(`cost: no ${fx || g.kit + ' ' + d} fixture in tests/per-player-cost.baseline.json`);
  }
  if (red.length) return { red, low, expected: null };
  for (const k of LT_METRICS) {
    const e = groups.reduce((s, g) => s + (Number(g.heroes) / heroes) * (g.tabs * F[LT_KITS[g.kit].watched][k] + (1 - g.tabs) * F[LT_KITS[g.kit].closed][k]), 0);
    expected[k] = r1(e);
    const m = Number(measured && measured[k]);
    if (!Number.isFinite(m)) red.push(`${k}: not measured`);
    else if (m > e * (1 + band)) red.push(`${k}: ${r1(m)} > ${r1(e)} (+${band * 100}% = ${r1(e * (1 + band))})`);
    else if (m < e * 0.5) low.push(`${k}: ${r1(m)} < half of ${r1(e)}`);
  }
  return { red, low, expected };
}
const r1 = (x) => Math.round(Number(x) * 10) / 10;
const r2 = (x) => Math.round(Number(x) * 100) / 100;
/* THE BENCH'S OWN CPU, Linux only (a GitHub runner): the whole box's busy jiffies, and the postgres processes' (utime + stime, USER_HZ
   100). Null elsewhere: Windows reads the postmaster's tree with cpuOf. */
function hostJiffies() {
  try {
    const f = readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
    return { busy: f.reduce((a, b) => a + b, 0) - f[3] - (f[4] || 0), total: f.reduce((a, b) => a + b, 0) };
  } catch { return null; }
}
function postgresTicks() {
  if (process.platform !== 'linux') return null;
  let t = 0;
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const s = readFileSync(`/proc/${d}/stat`, 'utf8'); const close = s.lastIndexOf(')');
      if (s.slice(s.indexOf('(') + 1, close) !== 'postgres') continue;
      const rest = s.slice(close + 2).split(' ');
      t += Number(rest[11]) + Number(rest[12]);
    } catch { /* a backend that ended between the listing and the read */ }
  }
  return t;
}

const CRONS = [
  { name: 'hr_tick_enrol', ms: 60000, sql: 'select public.hr_tick_enrol(200)' },
  { name: 'hr_hunt_party_sweep', ms: 60000, sql: 'select public.hr_hunt_party_sweep(200)' },
  { name: 'hr_town_refresh', ms: 25000, sql: 'select public.hr_town_refresh()' },
  { name: 'hr_leaderboard_refresh', ms: 300000, sql: 'select public.hr_leaderboard_refresh(true)' },
  { name: 'hr_market_expire', ms: 300000, sql: 'select public.hr_market_expire(200)' },
  { name: 'hr_slot_health_alert', ms: 300000, sql: 'select public.hr_slot_health_alert()' },
  { name: 'hr_party_reap_stale', ms: 600000, sql: 'select public.hr_party_reap_stale(200)' },
];

async function main() {
  const accounts = Number(arg('accounts', 20)); const heroes = Number(arg('heroes', 4)); const minutes = Number(arg('minutes', 5));
  const shape = arg('shape', 'mixed');
  if (!['mixed', 'krell4', 'lt'].includes(shape)) throw new Error(`--shape is mixed | krell4 | lt, not ${shape}`);
  const partyShare = Number(arg('party', 0.4)); const townShare = Number(arg('town', 0.25)); const online = Number(arg('online', shape === 'lt' ? 0.1 : 1));
  const W = Number(arg('workers', accounts > 40 ? 3 : 2)); const drill = arg('drill', ''); const jsonOut = arg('json', '');
  const fours = shape === 'krell4' || shape === 'lt';
  const report = { args: { shape, accounts, heroes: fours ? 4 : heroes, minutes, partyShare, townShare, online, drill, workers: W }, at: new Date().toISOString() };
  const log = (s) => process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${s}\n`);

  const { bootPg } = await import('./pg-replay.mjs');
  log('booting the chain on PG17');
  const { db, name } = await bootPg({ log });
  /* The statement window below reads pg_stat_statements, which only a preloaded server counts: say so before the
     minutes of world and warm-up, not at the first reset (a cluster started before pg-replay preloaded it is stopped first). */
  const [{ pre }] = (await db.query(`select current_setting('shared_preload_libraries') pre`)).rows;
  if (!/\bpg_stat_statements\b/.test(pre)) throw new Error(`the server preloads "${pre}", not pg_stat_statements: restart the scratch cluster (tools/pg-replay.mjs starts it with the preload)`);
  await db.exec('create extension if not exists pg_stat_statements');
  const t0 = Date.now();
  const world = await buildWorld(db, { accounts, heroes, partyShare, townShare, online, idleAccounts: Number(arg('idle-accounts', 0)), shape, name,
    grounds: arg('grounds', ''), builders: Number(arg('builders', 4)), flame: arg('flame', 'room') });
  const builtS = (Date.now() - t0) / 1000;
  log(`world built in ${builtS.toFixed(0)} s: refused ${JSON.stringify(world.refused)}; party ${world.partyGround}, solo ${world.soloGround}`);
  const admin = connect(name, 4);
  const openN = (await admin.unsafe('select count(*)::int s, count(distinct instance_id)::int i from public.hunt_sessions where ended_at is null'))[0];
  log(`${openN.s} open sessions on ${openN.i} instances`);
  report.world = { sessions: openN.s, instances: openN.i, refused: world.refused, built_s: Math.round(builtS) };
  /* THE DIALS THE TICK RAN ON (--shape=lt: the chain's own), and the load test's population by ground */
  const [dials] = await admin.unsafe(`select flush_seconds, cadence_seconds, batch_limit, lease_ms, shards, fold_windows, catchup_windows, hunt_body_max,
      hunt_body_heroes, hunt_bodies_max from public.hr_tick_config where id`).catch(() => [{}]);
  report.dials = dials;
  if (world.lt) {
    const groups = {};
    for (const a of world.accounts) {
      const g = groups[a.ground] || (groups[a.ground] = { kit: a.kit, accounts: 0, heroes: 0, online: 0 });
      g.accounts += 1; g.heroes += a.slots.length; g.online += a.online ? 1 : 0;
    }
    report.lt = { lit: world.lt.lit, flame: world.lt.flame, builders: world.lt.builders, groups };
    log(`THE v0.3.0 LOAD: lit ${world.lt.lit.join(', ')}; fire at ${world.lt.flame.height_mpts} mpts (+${(world.lt.flame.luck_pm / 10).toFixed(1)}% Rare luck); `
      + Object.entries(groups).map(([g, x]) => `${g} ${x.accounts} x4 (${x.kit}, ${x.online} open)`).join(', ')
      + `; dials ${JSON.stringify(dials)}`);
  }
  const fromBySession = new Map((await admin.unsafe(`select id, floor(extract(epoch from hunt_from) * 1000)::bigint as f from public.hunt_sessions`)).map((r) => [r.id, Number(r.f)]));

  const purse0 = await purseBase(admin);

  /* Production's pool: 15 server connections to hr_engine through the pooler (Small's default_pool_size, ASSUMED; the
     role's own limit is 20), PostgREST's own pool on Small (ASSUMED 15). Split across the workers. */
  const engineTotal = Number(arg('engine-pool', 15)); const restTotal = Number(arg('rest-pool', 15));
  const workers = [];
  for (let i = 0; i < W; i++) {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { hrBetaLoad: true, dbName: name, root: join(fileURLToPath(new URL('..', import.meta.url))),
      unviewedPollMs: Number(arg('unviewed-poll-ms', C.unviewedPollMs)), enginePool: Math.max(1, Math.floor(engineTotal / W)), restPool: Math.max(1, Math.floor(restTotal / W)),
      accounts: world.accounts.filter((_, k) => k % W === i) } });
    await new Promise((res, rej) => { w.once('message', res); w.once('error', rej); });
    w.setMaxListeners(0);
    w.on('error', (e) => log('worker error: ' + e.message));
    workers.push(w);
  }
  const say = (m) => workers.forEach((w) => w.postMessage(m));

  /* THE TICK: the real fire, the real roster and leases; each hunt body is its own concurrent edge invocation. */
  let rr = 0, bodyId = 0, fires = 0, bodiesPosted = 0, firing = true;
  const fireWalls = []; const bodiesPerFire = []; const busy = new Set();
  const fire = async () => {
    if (!firing) return;
    const a = nowMs();
    try {
      await admin.unsafe('delete from net.http_request_queue');
      await admin.unsafe('select public.hr_tick_cron_run()');
      const q = await admin.unsafe(`select convert_from(body, 'UTF8') as b from net.http_request_queue order by id`);
      fireWalls.push(nowMs() - a); fires++;
      const bodies = q.map((r) => JSON.parse(r.b)).filter((b) => (Array.isArray(b.hunts) && b.hunts.length) || (Array.isArray(b.roster) && b.roster.length));
      bodiesPerFire.push(bodies.length); bodiesPosted += bodies.length;
      for (const b of bodies) {
        const id = ++bodyId; const w = workers[rr++ % W];
        const done = new Promise((res) => { const on = (m) => { if (m.t === 'done' && m.id === id) { w.off('message', on); res(); } }; w.on('message', on); });
        busy.add(done); done.then(() => busy.delete(done));
        w.postMessage({ t: 'body', id, body: b });
      }
    } catch (e) { log('fire failed: ' + e.message); }
  };
  /* THE LAG: what hunt-health sees, sampled every 10 s. */
  const lagSeries = [];
  /* every open hunt's own lag at every sample (the load test's percentiles are over these, not over each sample's max) */
  const lagReadings = [];
  const sampleLag = async () => {
    const [r] = await admin.unsafe(`select count(*)::int n, coalesce(max(extract(epoch from now() - i.settled_to)), 0)::float8 mx,
        coalesce(percentile_cont(0.95) within group (order by extract(epoch from now() - i.settled_to)), 0)::float8 p95,
        count(*) filter (where extract(epoch from now() - i.settled_to) > 125)::int stalled,
        array_agg(extract(epoch from now() - i.settled_to)::float8) lags
      from public.hunt_instances i where i.id in (select instance_id from public.hunt_sessions where ended_at is null)`);
    const { lags, ...row } = r;
    lagSeries.push({ t: Date.now(), ...row });
    if (Array.isArray(lags)) for (const l of lags) lagReadings.push(Number(l));
  };

  const pmPid = DATA ? Number(readFileSync(join(DATA, 'postmaster.pid'), 'utf8').split('\n')[0]) : 0;
  const statSql = `select coalesce(sum(xact_commit), 0)::bigint c, coalesce(sum(xact_rollback), 0)::bigint r, coalesce(sum(blks_read), 0)::bigint rd, coalesce(sum(blks_hit), 0)::bigint hit,
      coalesce(sum(deadlocks), 0)::bigint dl, coalesce(sum(tup_inserted), 0)::bigint ins, coalesce(sum(tup_updated), 0)::bigint upd from pg_stat_database where datname = current_database()`;
  const walSql = `select wal_bytes::bigint b, wal_fpi::bigint f, wal_records::bigint r from pg_stat_wal`;
  /* Named tables only: a stat of every relation took 35 s on this PC, where one file open costs 17 ms (measured 11-02). */
  const tableSql = `select t as relname, pg_total_relation_size(t::regclass)::bigint b from unnest(array['player_ledger', 'player_state', 'player_inventory', 'player_skills', 'player_progress', 'player_intents',
      'hunt_sessions', 'hunt_instances', 'hunt_session_tally', 'hunt_session_events', 'hunt_bag', 'hr_rate_counters', 'hr_rejections', 'chat_messages', 'hunt_tick_lease', 'hr_town_stands', 'character_presence']) t
      union all select 'realtime.bench_frames', pg_total_relation_size('realtime.bench_frames'::regclass)`;

  const fireTimer = setInterval(fire, 10000);
  const lagTimer = setInterval(sampleLag, 10000);
  const cronWalls = {};
  const cronTimers = CRONS.map((c) => setInterval(async () => {
    const a = nowMs();
    try { await admin.unsafe(c.sql); (cronWalls[c.name] = cronWalls[c.name] || []).push(nowMs() - a); }
    catch (e) { (cronWalls[c.name + ':error'] = cronWalls[c.name + ':error'] || []).push(String(e.message).slice(0, 80)); }
  }, c.ms));
  await fire();
  say({ t: 'start' });
  const warmS = Number(arg('warm', 240));
  log(`warming ${warmS} s (every pooled backend past its first touches: a cold backend opens hundreds of files at 17 ms each here)`);
  await new Promise((r) => setTimeout(r, warmS * 1000));

  /* THE MEASURED WINDOW. */
  say({ t: 'reset' });
  await admin.unsafe('select extensions.pg_stat_statements_reset()').catch(() => admin.unsafe('select pg_stat_statements_reset()'));
  fires = 0; bodiesPosted = 0; fireWalls.length = 0; bodiesPerFire.length = 0; lagSeries.length = 0; lagReadings.length = 0;
  const cpu0 = pmPid ? await cpuOf(pmPid) : NaN;
  const [s0] = await admin.unsafe(statSql); const [w0] = await admin.unsafe(walSql);
  const tables0 = new Map((await admin.unsafe(tableSql)).map((r) => [r.relname, Number(r.b)]));
  const fr0 = (await admin.unsafe('select count(*)::bigint n, coalesce(sum(length(payload::text)), 0)::bigint b from realtime.bench_frames'))[0];
  const led0 = Number((await admin.unsafe(`select count(*)::bigint n from public.player_ledger where intent <> 'beta_load_fill'`))[0].n);
  /* THE PAID HERO-TIME: every session's clock (settled_to) summed, s, at both ends: the hours the window actually paid, the denominator
     tests/per-player-cost.mjs uses (a population that fell behind is judged on the hours it was paid, not the wall's) */
  const paidSql = 'select coalesce(sum(extract(epoch from settled_to)), 0)::float8 s from public.hunt_sessions';
  const paid0 = Number((await admin.unsafe(paidSql))[0].s);
  /* rule 10's row writes: every public table's inserts + updates + deletes (pg_stat_user_tables, one autocommit read each end) */
  const writesSql = `select relname, (n_tup_ins + n_tup_upd + n_tup_del)::bigint w from pg_stat_user_tables where schemaname = 'public'`;
  const writes0 = new Map((await admin.unsafe(writesSql)).map((r) => [r.relname, Number(r.w)]));
  /* what the lit switches wrote (the load test's chain only: these tables are 1063 / 1071 / 1074's) */
  const dropSql = `select (select count(*) from public.trait_pieces)::int pieces, (select count(*) from public.hero_pity)::int pity_rows,
      (select count(*) from public.hunt_flame)::int hunt_flame_rows, (select coalesce(sum(units), 0) from public.hunt_flame)::bigint remains_burned,
      (select count(*) from public.player_ledger where kind = 'trait')::int trait_ledger_rows`;
  const drops0 = world.lt ? (await admin.unsafe(dropSql))[0] : null;
  const host0 = hostJiffies(); const pg0 = postgresTicks();
  const tMeasure = Date.now();
  const proc0 = process.cpuUsage();

  const drillLog = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (drill) {
    const mark = (s) => { drillLog.push({ at: Date.now() - tMeasure, s }); log('drill: ' + s); };
    await sleep(60000);
    if (drill === 'tick-stop') {
      firing = false; mark('the tick stops');
      await sleep(600000);
      firing = true; mark('the tick returns'); await fire();
    } else if (drill === 'edge-5xx') {
      say({ t: 'mode', mode: { edge: 'mixed' } }); mark('edge answers 5xx for 5 minutes: half never ran, a quarter ran with the answer lost');
      await sleep(300000);
      say({ t: 'mode', mode: { edge: 'ok' } }); mark('edge back');
    } else if (drill === 'retry') {
      say({ t: 'mode', mode: { retry: 2 } }); mark('every settle delivered 3 times at once, for 3 minutes');
      await sleep(180000);
      say({ t: 'mode', mode: { retry: 0 } }); mark('single delivery');
    }
    await sleep(Math.max(0, minutes * 60000));
  } else {
    await sleep(minutes * 60000);
  }
  const elapsedS = (Date.now() - tMeasure) / 1000;
  const proc1 = process.cpuUsage(proc0);
  const host1 = hostJiffies(); const pg1 = postgresTicks();
  const cpu1 = pmPid ? await cpuOf(pmPid) : NaN;
  const writes1 = (await admin.unsafe(writesSql)).map((r) => ({ t: r.relname, w: Number(r.w) - (writes0.get(r.relname) || 0) })).filter((r) => r.w > 0).sort((a, b) => b.w - a.w);
  const drops1 = world.lt ? (await admin.unsafe(dropSql))[0] : null;
  /* the workload's statements only: the bench's own reads are not the server's load */
  const pss = await admin.unsafe(`select r.rolname, s.calls::bigint calls, s.total_exec_time::float8 ms, s.mean_exec_time::float8 mean, s.max_exec_time::float8 mx, s.wal_bytes::bigint wal,
      regexp_replace(s.query, '\\s+', ' ', 'g') q from pg_stat_statements s join pg_roles r on r.oid = s.userid
      where s.query not like '%pg_stat%' and s.query not like '%pg_total_relation_size%' and s.query not like '%bench_frames%' and s.query not like '%net.http_request_queue%'
        and s.query not like '%hunt_instances i where i.id in%' and s.query not like '%beta_load_fill%' order by s.total_exec_time desc limit 80`).catch(() => []);
  const totals = { ms: pss.reduce((a, r) => a + r.ms, 0), calls: pss.reduce((a, r) => a + Number(r.calls), 0) };
  const [s1] = await admin.unsafe(statSql); const [w1] = await admin.unsafe(walSql);
  const tables1 = (await admin.unsafe(tableSql)).map((r) => ({ t: r.relname, grew: Number(r.b) - (tables0.get(r.relname) || 0), b: Number(r.b) })).filter((r) => r.grew > 0).sort((a, b) => b.grew - a.grew);
  const fr1 = (await admin.unsafe('select count(*)::bigint n, coalesce(sum(length(payload::text)), 0)::bigint b from realtime.bench_frames'))[0];
  const led1 = Number((await admin.unsafe(`select count(*)::bigint n from public.player_ledger where intent <> 'beta_load_fill'`))[0].n);
  const paidHeroHours = (Number((await admin.unsafe(paidSql))[0].s) - paid0) / 3600;
  const ledBytes = Number((await admin.unsafe(`select coalesce(avg(pg_column_size(l.*)), 0)::float8 a from public.player_ledger l where intent <> 'beta_load_fill'`))[0].a);
  const conns = (await admin.unsafe(`select count(*)::int n from pg_stat_activity where datname = current_database()`))[0].n;
  /* Stop the driver and gather its numbers. */
  clearInterval(fireTimer); clearInterval(lagTimer); cronTimers.forEach(clearInterval);
  firing = false;
  const gathered = await new Promise((resolve) => {
    const got = [];
    for (const w of workers) { w.on('message', (m) => { if (m.t === 'stats') { got.push(m); if (got.length === W) resolve(got); } }); w.postMessage({ t: 'stop' }); }
  });
  const merged = new Map();
  for (const g of gathered) for (const [k, s] of g.stats) {
    const m = merged.get(k) || { n: 0, wall: [], queue: 0, db: 0, bytes: 0, errors: 0, engine: 0 };
    for (const [f, v] of Object.entries(s)) {
      if (f === 'wall' || f === 'walls' || f === 'bodyEngine') m[f] = (m[f] || []).concat(v);
      else if (f === 'outcomes' || f === 'reasons') { m[f] = m[f] || {}; for (const [x, y] of Object.entries(v)) m[f][x] = (m[f][x] || 0) + y; }
      else if (f === 'last') m.last = v;
      else if (f === 'engineMax' || f === 'engineRunMax') m[f] = Math.max(m[f] || 0, v);
      else m[f] = (m[f] || 0) + v;
    }
    merged.set(k, m);
  }
  const perMin = (n) => (60 * n) / elapsedS;
  const rows = {};
  for (const [k, s] of merged) {
    rows[k] = { n: s.n, stmts: s.stmts || 0, perMin: Math.round(perMin(s.n) * 10) / 10, p50: Math.round(pct(s.wall, 0.5)), p95: Math.round(pct(s.wall, 0.95)), max: Math.round(pct(s.wall, 1)),
      queueMean: s.n ? Math.round(s.queue / s.n) : 0, dbMean: s.n ? Math.round(s.db / s.n) : 0, kbMean: s.n ? Math.round(s.bytes / s.n / 102.4) / 10 : 0, errors: s.errors, n5xx: s.n5xx, lost: s.lost,
      settled: s.settled, nothing: s.nothing, refused: s.refused, ended: s.ended, deferred: s.deferred, engineMs: s.engine ? Math.round(s.engine) : undefined, engineMax: s.engineMax, engineRunMax: s.engineRunMax,
      outcomes: s.outcomes, reasons: s.reasons, last: s.last,
      ...(s.bodyEngine && s.bodyEngine.length ? { bodyEngineMs: { n: s.bodyEngine.length, p50: Math.round(pct(s.bodyEngine, 0.5)), p95: Math.round(pct(s.bodyEngine, 0.95)), max: Math.round(pct(s.bodyEngine, 1)) } } : {}) };
  }
  const lagMax = lagSeries.reduce((m, r) => Math.max(m, r.mx), 0);
  report.measured = {
    seconds: Math.round(elapsedS),
    db_cpu_cores_local: Number.isFinite(cpu1 - cpu0) ? (cpu1 - cpu0) / elapsedS : null,
    db_exec_ms_per_s: totals.ms / elapsedS, statements_per_s: Number(totals.calls) / elapsedS,
    js_cpu_cores_local: (proc1.user + proc1.system) / 1e6 / elapsedS,
    commits_per_s: Number(s1.c - s0.c) / elapsedS, rollbacks: Number(s1.r - s0.r), deadlocks: Number(s1.dl - s0.dl),
    blocks_read_per_s: Number(s1.rd - s0.rd) / elapsedS, hit_ratio: Number(s1.hit - s0.hit) / Math.max(1, Number(s1.hit - s0.hit) + Number(s1.rd - s0.rd)),
    wal_mb_per_s: Number(w1.b - w0.b) / 1e6 / elapsedS, connections: conns,
    frames_per_s: Number(fr1.n - fr0.n) / elapsedS, frame_kb_mean: Number(fr1.n - fr0.n) ? Number(fr1.b - fr0.b) / Number(fr1.n - fr0.n) / 1024 : 0, frame_kb_per_s: Number(fr1.b - fr0.b) / 1024 / elapsedS,
    ledger_rows_per_hero_hour: (led1 - led0) / openN.s / (elapsedS / 3600), ledger_bytes_mean: ledBytes,
    row_writes_per_hero_hour: writes1.reduce((n, r) => n + r.w, 0) / openN.s / (elapsedS / 3600), tables_written: writes1.slice(0, 15),
    fires, bodies_posted: bodiesPosted, bodies_per_fire_p95: pct(bodiesPerFire, 0.95), bodies_per_fire_max: pct(bodiesPerFire, 1), fire_ms_p50: Math.round(pct(fireWalls, 0.5)), fire_ms_max: Math.round(pct(fireWalls, 1)),
    edge_invocations_per_min: perMin((merged.get('hello')?.n || 0) + (merged.get('hello_early')?.n || 0) + (merged.get('market')?.n || 0) + bodiesPosted),
    lag: { max_s: lagMax, p95_of_p95_s: pct(lagSeries.map((r) => r.p95), 0.95), stalled_samples: lagSeries.filter((r) => r.stalled > 0).length, samples: lagSeries.length, last: lagSeries[lagSeries.length - 1],
      readings: { n: lagReadings.length, p50: r1(pct(lagReadings, 0.5)), p95: r1(pct(lagReadings, 0.95)), p99: r1(pct(lagReadings, 0.99)), max: r1(pct(lagReadings, 1)) } },
    rows, crons: Object.fromEntries(Object.entries(cronWalls).map(([k, v]) => [k, typeof v[0] === 'string' ? v[0] : { n: v.length, mean: Math.round(v.reduce((a, b) => a + b, 0) / v.length), max: Math.round(Math.max(...v)) }])),
    tables_grew: tables1.slice(0, 12),
    top_statements: pss.map((r) => ({ role: r.rolname, calls: Number(r.calls), ms: Math.round(r.ms), mean: Math.round(r.mean * 10) / 10, max: Math.round(r.mx), wal_kb: Math.round(Number(r.wal) / 1024), q: r.q.slice(0, 160) })),
  };
  if (drillLog.length) report.drill = { log: drillLog, lag: lagSeries.map((r) => ({ s: Math.round((r.t - tMeasure) / 1000), mx: Math.round(r.mx), p95: Math.round(r.p95), stalled: r.stalled })) };
  /* THE BENCH (Linux): the box's busy cores, the postgres processes', each edge worker's event-loop share */
  const ncpu = cpus().length;
  const bench = { cores: ncpu, busy_cores: host0 && host1 ? r2((ncpu * (host1.busy - host0.busy)) / Math.max(1, host1.total - host0.total)) : null,
    postgres_cores: pg0 !== null && pg1 !== null ? r2((pg1 - pg0) / 100 / elapsedS) : null, worker_elu: gathered.map((g) => r2(g.elu)) };
  bench.saturated = (bench.busy_cores !== null && bench.busy_cores > 0.9 * ncpu) || bench.worker_elu.some((u) => u > 0.9);
  report.measured.bench = bench;

  /* THE v0.3.0 LOAD TEST'S VERDICTS (--shape=lt): the lag past due against the look-ahead, the per-hero cost against the fixtures' blend */
  let ltRed = [];
  if (world.lt) {
    const PPC = await import('../tests/per-player-cost.mjs');
    const base = JSON.parse(readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), 'tests', 'per-player-cost.baseline.json'), 'utf8'));
    const stmts = SETTLE_KINDS.reduce((n, k) => n + Number((rows[k] || {}).stmts || 0) + Number((rows[k + ':retry'] || {}).stmts || 0), 0);
    const written = writes1.reduce((n, r) => n + r.w, 0);
    const paidOf = (r) => Object.entries((r || {}).outcomes || {}).reduce((n, [k, v]) => n + (k === 'paid' || k.startsWith('paid:') ? Number(v) : 0), 0);
    const saves = Number((rows.tick_body || {}).settled || 0) + paidOf(rows.hello) + paidOf(rows.hello_early);
    const ph = paidHeroHours > 0 ? paidHeroHours : NaN;
    const per = { ledger_rows_a_hero_hour: r1((led1 - led0) / ph), statements_a_hero_hour: r1(stmts / ph), row_writes_a_hero_hour: r1(written / ph) };
    const groups = Object.values(report.lt.groups).map((g) => ({ kit: g.kit, heroes: g.heroes, tabs: g.accounts ? g.online / g.accounts : 0 }));
    const cost = ltCostVerdict(per, base, groups, PPC.CONCURRENCY.band);
    const lag = ltLagVerdict(lagReadings, Number(dials.flush_seconds) || 90, await lookAheadS());
    const refusals = await admin.unsafe('select code, sum(n)::int n from public.hr_rejections group by 1 order by 2 desc limit 12').catch(() => []);
    const { HUNT_ENGINE_BUDGET_MS } = await import('../supabase/functions/hr-accrue/hunt-settle.js');
    report.lt.lag = lag;
    report.lt.cost = { band: PPC.CONCURRENCY.band, engine_budget_ms: HUNT_ENGINE_BUDGET_MS, paid_hero_hours: r1(paidHeroHours), paid_share: r2(paidHeroHours / (openN.s * elapsedS / 3600)), per, per_save: saves ? { statements: r1(stmts / saves), row_writes: r1(written / saves), ledger_rows: r1((led1 - led0) / saves) } : null, saves, ...cost };
    report.lt.drops = Object.fromEntries(Object.keys(drops1).map((k) => [k, Number(drops1[k]) - Number(drops0[k])]));
    report.lt.refusals = refusals;
    report.lt.bench = bench;
    ltRed = [...lag.red, ...cost.red];
    report.lt.red = ltRed;
  }

  /* Let every body and every in-flight settle land, then audit. */
  await Promise.race([Promise.all(Array.from(busy)), sleep(30000)]);
  await sleep(2000);
  const audit = await auditSessions(admin, fromBySession, purse0);
  report.audit = { ...audit, red: audit.red.slice(0, 10), red_total: audit.red.length };
  const ended = await admin.unsafe(`select end_reason, count(*)::int n from public.hunt_sessions group by 1 order by 2 desc`).catch(() => []);
  report.end_reasons = ended;

  const m = report.measured;
  log(`DB CPU ${m.db_cpu_cores_local?.toFixed(2)} local cores · exec ${m.db_exec_ms_per_s.toFixed(0)} ms/s · ${m.statements_per_s.toFixed(0)} stmts/s · WAL ${m.wal_mb_per_s.toFixed(2)} MB/s · frames ${m.frames_per_s.toFixed(2)}/s (${m.frame_kb_mean.toFixed(0)} KB) · edge ${m.edge_invocations_per_min.toFixed(0)}/min`);
  log(`lag max ${m.lag.max_s.toFixed(0)} s, stalled samples ${m.lag.stalled_samples}/${m.lag.samples}; audit: ${audit.sessions} sessions, ${audit.windows} windows, ${audit.red.length} red`);
  for (const r of audit.red.slice(0, 5)) log('  RED ' + r);
  let cost = { red: [] };
  if (shape === 'krell4') {
    const PPC = await import('../tests/per-player-cost.mjs');
    const base = JSON.parse(readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), 'tests', 'per-player-cost.baseline.json'), 'utf8'));
    cost = krellVerdict({ seconds: m.seconds, heroes: openN.s, ledger_rows_per_hero_hour: m.ledger_rows_per_hero_hour, rows: m.rows }, base, online, PPC.concurrencyBand);
    report.cost = cost;
    log(`THE HEAVY FOUR x${accounts}, ${Math.round(online * 100)}% of tabs open: ${cost.per.ledger_rows_a_hero_hour.toFixed(1)} journal rows and ${cost.per.statements_a_hero_hour.toFixed(1)} statements a hero-hour `
      + `against the fixtures' blend ${JSON.stringify(cost.expected)} (tests/per-player-cost.mjs, band +${PPC.CONCURRENCY.band * 100}%); engine max ${m.rows.tick_body?.engineRunMax ?? '-'} ms a run`);
    for (const r of cost.red) log('  RED cost ' + r);
    for (const r of cost.low || []) log('  LOW cost ' + r + ' (not red: read the lag above)');
  }
  if (world.lt) {
    const L = report.lt; const g = L.lag; const c = L.cost; const b = L.bench;
    log(`THE v0.3.0 LOAD, ${openN.i} fours (${openN.s} heroes), ${Object.values(L.groups).reduce((n, x) => n + x.online, 0)} tabs open, ${m.seconds} s measured over ${g.readings} lag readings:`);
    log(`  settle lag p50 ${g.raw.p50} / p95 ${g.raw.p95} / p99 ${g.raw.p99} / max ${g.raw.max} s; past the ${g.flush_s} s flush p50 ${g.past_due.p50} / p95 ${g.past_due.p95} / p99 ${g.past_due.p99} / max ${g.past_due.max} s (budget ${g.budget_s} s)`);
    log(`  a paid hero-hour (${c.paid_hero_hours} paid, ${Math.round(c.paid_share * 100)}% of the wall's): ${c.per.ledger_rows_a_hero_hour} journal rows, ${c.per.statements_a_hero_hour} statements, ${c.per.row_writes_a_hero_hour} row writes against the fixtures' blend ${JSON.stringify(c.expected)} (band +${c.band * 100}%)`);
    if (c.per_save) log(`  a save (${c.saves}): ${c.per_save.statements} statements, ${c.per_save.row_writes} row writes, ${c.per_save.ledger_rows} journal rows; engine max ${m.rows.tick_body?.engineRunMax ?? '-'} ms a run, a body p50 ${m.rows.tick_body?.bodyEngineMs?.p50 ?? '-'} / p95 ${m.rows.tick_body?.bodyEngineMs?.p95 ?? '-'} / max ${m.rows.tick_body?.bodyEngineMs?.max ?? '-'} ms (budget ${c.engine_budget_ms}), deferred ${m.rows.tick_body?.deferred || 0}, bodies ${m.bodies_posted} (${m.bodies_per_fire_p95} a fire p95), fire p50 ${m.fire_ms_p50} ms`);
    log(`  the switches wrote ${JSON.stringify(L.drops)}; refusals ${JSON.stringify(L.refusals)}`);
    log(`  bench: ${b.busy_cores ?? '-'} of ${b.cores} cores busy, postgres ${b.postgres_cores ?? '-'}, worker loops ${b.worker_elu.join(' / ')}${b.saturated ? ' SATURATED' : ''}`);
    for (const r of ltRed) log('  RED ' + r);
    for (const r of c.low || []) log('  LOW cost ' + r + ' (not red: read the lag above)');
    if (ltRed.length && b.saturated) log('  the bench was saturated: this lag is partly the runner\'s, not the server\'s alone (re-run with more workers, fewer accounts or a bigger runner before reading it as the server\'s)');
    log('  top statements: ' + m.top_statements.slice(0, 8).map((s) => `${s.calls}x mean ${s.mean} ms ${s.q.slice(0, 70)}`).join(' | '));
    /* the run page's own summary (GitHub): one table, read without the log */
    if (process.env.GITHUB_STEP_SUMMARY) {
      const row = (k, v) => `| ${k} | ${v} |`;
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['', `### v0.3.0 load test: ${ltRed.length || audit.red.length ? 'RED' : 'green'}`, '', '| | |', '|---|---|',
        row('Load', `${openN.i} fours (${openN.s} heroes) over ${Object.keys(L.groups).join(', ')}; ${Object.values(L.groups).reduce((n, x) => n + x.online, 0)} tabs open; lit ${L.lit.join(', ')}`),
        row('Settle lag (s)', `p50 ${g.raw.p50} · p95 ${g.raw.p95} · p99 ${g.raw.p99} · max ${g.raw.max}`),
        row(`Past the ${g.flush_s} s flush (s)`, `p50 ${g.past_due.p50} · p95 ${g.past_due.p95} · p99 ${g.past_due.p99} · max ${g.past_due.max} (budget ${g.budget_s})`),
        row('A paid hero-hour', `(${Math.round(c.paid_share * 100)}% of the wall paid) ${c.per.ledger_rows_a_hero_hour} journal rows · ${c.per.statements_a_hero_hour} statements · ${c.per.row_writes_a_hero_hour} row writes; blend ${JSON.stringify(c.expected)} +${c.band * 100}%`),
        row('A save', c.per_save ? `${c.per_save.statements} statements · ${c.per_save.row_writes} row writes · ${c.per_save.ledger_rows} journal rows (${c.saves} saves)` : '-'),
        row('Bench', `${b.busy_cores ?? '-'} of ${b.cores} cores busy · postgres ${b.postgres_cores ?? '-'} · worker loops ${b.worker_elu.join(' / ')}${b.saturated ? ' · SATURATED' : ''}`),
        row('Audit', `${audit.sessions} sessions, ${audit.windows} windows, ${audit.red.length} red`),
        ...ltRed.map((r) => row('RED', r)), ''].join('\n'));
    }
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 1));
  else process.stdout.write(JSON.stringify(report, null, 1) + '\n');
  await admin.end({ timeout: 5 });
  await db.close().catch(() => {});
  process.exit(audit.red.length || cost.red.length || ltRed.length ? 1 : 0);
}

/* THE HEAVY FOUR'S BAND (--shape=krell4; balance program L11, call 28 step 10). The population's journal rows and settle statements a
   hero-hour (the hellos, the early asks and the tick bodies: every statement the engine sent to settle, counted in the workers' execOf)
   against tests/per-player-cost.mjs's two Krell rows, blended by the share of open tabs (its concurrencyBand). Pure: --selftest feeds it. */
const SETTLE_KINDS = Object.freeze(['hello', 'hello_early', 'tick_body']);
function krellVerdict(measured, base, tabs, band) {
  const hours = Number(measured.seconds) / 3600;
  const heroes = Number(measured.heroes);
  const stmts = SETTLE_KINDS.reduce((n, k) => n + Number((measured.rows[k] || {}).stmts || 0) + Number((measured.rows[k + ':retry'] || {}).stmts || 0), 0);
  const per = { ledger_rows_a_hero_hour: Number(measured.ledger_rows_per_hero_hour), statements_a_hero_hour: heroes > 0 && hours > 0 ? stmts / heroes / hours : NaN };
  return { per, ...band(per, base, tabs) };
}

/* THE BAND'S WIRING (no database): a population costing what the fixtures cost is green; a row a kill, or a third more statements a
   settle, counted the way the workers count them (rows[kind].stmts over heroes and seconds), is red. */
async function krellBandProof() {
  const PPC = await import('../tests/per-player-cost.mjs');
  const base = JSON.parse(readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), 'tests', 'per-player-cost.baseline.json'), 'utf8'));
  const w = base.fixtures[PPC.CONCURRENCY.watched]; const c = base.fixtures[PPC.CONCURRENCY.closed];
  const tabs = 0.5; const heroes = 160; const seconds = 180;
  const at = (k, x) => (tabs * w[k] + (1 - tabs) * c[k]) * x;
  /* the statements a hero-hour, spread over the three settle kinds as counters (half the hellos' share each to two kinds) */
  const rowsOf = (x) => { const n = at('statements_a_hero_hour', x) * heroes * (seconds / 3600); return { hello: { stmts: n * 0.5 }, hello_early: { stmts: n * 0.2 }, tick_body: { stmts: n * 0.3 } }; };
  const run = (rowsX, stmtsX) => krellVerdict({ seconds, heroes, ledger_rows_per_hero_hour: at('ledger_rows_a_hero_hour', rowsX), rows: rowsOf(stmtsX) }, base, tabs, PPC.concurrencyBand);
  const out = [];
  const clean = run(1.05, 1.05);
  if (clean.red.length) out.push('KRELL-BAND CONTROL: a population at the fixtures\' blend reads red: ' + clean.red.join('; '));
  if (!run(4, 1).red.some((r) => r.startsWith('ledger_rows'))) out.push('KRELL-BAND a row a kill at concurrency went unseen');
  if (!run(1, 1.35).red.some((r) => r.startsWith('statements'))) out.push('KRELL-BAND a third more statements a settle at concurrency went unseen');
  return out;
}

/* THE LOAD TEST'S VERDICTS (no database), each planted defect caught BY ITS OWN line, beside its clean control:
     LT-PLAN   1,000 accounts over five grounds hold 200 fours each, the first tenth of each with its tab open
     LT-LAG    a healthy flush sawtooth (0 to flush + cadence) is green; one hunt a look-ahead past its flush is red, a tenth of a second
               short of it is green (the boundary), and a run that read no hunt is red
     LT-COST   a population at the fixtures' blend (two kits, uneven tabs) is green; a row a kill, a third more statements, two fifths
               more row writes and a missing fixture are each red on their own line */
async function ltProof() {
  const base = JSON.parse(readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), 'tests', 'per-player-cost.baseline.json'), 'utf8'));
  const band = (await import('../tests/per-player-cost.mjs')).CONCURRENCY.band;
  const out = []; let caught = 0;
  const pool = ['a', 'b', 'c', 'd', 'e'].map((hunt, i) => ({ hunt, kit: i < 3 ? 'own' : 'heavy' }));
  const plan = ltPlan(1000, pool, 0.1);
  const by = (p) => pool.map((g) => p.filter((x) => x.hunt === g.hunt));
  if (!by(plan).every((x) => x.length === 200 && x.filter((y) => y.online).length === 20)) out.push('LT-PLAN 1,000 over five grounds is not 200 each with 20 open');
  if (ltPlan(10, pool, 0).some((x) => x.online) || !ltPlan(10, pool, 1).every((x) => x.online)) out.push('LT-PLAN --online 0 or 1 is not none or all');
  const budget = await lookAheadS(); const flush = 90;
  const saw = []; for (let s = 0; s < 30; s++) for (let i = 0; i < 1000; i++) saw.push(((i * 0.1 + s * 10) % 100));
  const clean = ltLagVerdict(saw, flush, budget);
  if (clean.red.length || clean.past_due.max > 10.0001) out.push('LT-LAG CONTROL: a healthy sawtooth reads red or past due over its cadence: ' + JSON.stringify(clean.past_due) + ' ' + clean.red.join('; '));
  const late = ltLagVerdict([...saw, flush + budget], flush, budget);
  if (late.red.some((r) => r.startsWith('lag:') && /look-ahead/.test(r))) caught++; else out.push('LT-LAG a hunt a look-ahead past its flush went unseen');
  if (ltLagVerdict([...saw, flush + budget - 0.1], flush, budget).red.length) out.push('LT-LAG CONTROL: a hunt short of the look-ahead reads red');
  if (ltLagVerdict([], flush, budget).red.some((r) => /no reading/.test(r))) caught++; else out.push('LT-LAG a run that read no hunt went unseen');
  const groups = [{ kit: 'own', heroes: 2400, tabs: 0.1 }, { kit: 'heavy', heroes: 1600, tabs: 0.25 }];
  const blend = (k) => groups.reduce((s, g) => s + (g.heroes / 4000) * (g.tabs * base.fixtures[LT_KITS[g.kit].watched][k] + (1 - g.tabs) * base.fixtures[LT_KITS[g.kit].closed][k]), 0);
  const at = (x) => Object.fromEntries(LT_METRICS.map((k) => [k, blend(k) * (x[k] || 1.05)]));
  const ok = ltCostVerdict(at({}), base, groups, band);
  if (ok.red.length) out.push('LT-COST CONTROL: a population at the blend reads red: ' + ok.red.join('; '));
  for (const [k, x, what] of [['ledger_rows_a_hero_hour', 4, 'a row a kill'], ['statements_a_hero_hour', 1.35, 'a third more statements'], ['row_writes_a_hero_hour', 1.4, 'two fifths more row writes']]) {
    const r = ltCostVerdict(at({ [k]: x }), base, groups, band);
    if (r.red.length === 1 && r.red[0].startsWith(k + ':')) caught++; else out.push(`LT-COST ${what} is not red on ${k} alone: ${r.red.join('; ') || 'green'}`);
  }
  const gone = ltCostVerdict(at({}), { fixtures: { ...base.fixtures, [LT_KITS.own.closed]: undefined } }, groups, band);
  if (gone.red.some((r) => /no .* fixture/.test(r))) caught++; else out.push('LT-COST a missing fixture went unseen');
  return { out, caught, of: 6, budget };
}

/* --selftest: the audit must go red on a planted double payment and on planted lost time, on a real replayed chain. */
async function selftest() {
  const bandProblems = await krellBandProof();
  console.log(bandProblems.length ? 'beta-load --selftest: the heavy four band RED, ' + bandProblems.join('; ') : 'beta-load --selftest: the heavy four band, 2/2 planted defects caught, control clean (no database)');
  const lt = await ltProof();
  for (const p of lt.out) console.log('RED ' + p);
  console.log(lt.out.length ? `beta-load --selftest: the load test's verdicts RED (${lt.out.length})` : `beta-load --selftest: the load test's verdicts, ${lt.caught}/${lt.of} planted defects caught, controls clean (look-ahead ${lt.budget} s; no database)`);
  bandProblems.push(...lt.out);
  if (process.argv.includes('--pure')) process.exit(bandProblems.length ? 1 : 0);
  const { bootPg } = await import('./pg-replay.mjs');
  const { db, name } = await bootPg({});
  const world = await buildWorld(db, { accounts: 1, heroes: 1, partyShare: 0, townShare: 0, online: 1 });
  const admin = connect(name, 2);
  const H = (await import('../tests/hunt-sessions-settle.mjs')).HARNESS;
  const M = await H.loadEdge(H.ROOT);
  const uid = world.accounts[0].uid;
  const exec = async (text, params) => admin.begin(async (tx) => { await tx.unsafe('set local role hr_engine'); return Array.from(await tx.unsafe(text, params || [])); });
  const fromBy = new Map((await admin.unsafe(`select id, floor(extract(epoch from hunt_from) * 1000)::bigint as f from public.hunt_sessions`)).map((r) => [r.id, Number(r.f)]));
  await admin.unsafe(`update public.hunt_instances set settled_to = settled_to - interval '200 seconds', next_swing_at = next_swing_at - interval '200 seconds'`);
  await admin.unsafe(`update public.hunt_sessions set entered_at = entered_at - interval '200 seconds', hunt_from = hunt_from - interval '200 seconds', settled_to = settled_to - interval '200 seconds', next_swing_at = next_swing_at - interval '200 seconds'`);
  for (const k of fromBy.keys()) fromBy.set(k, fromBy.get(k) - 200000);
  const base = await purseBase(admin);
  const v = await M.HS.settleHunt({ exec, user: uid, slot: 0, mode: 'settle', bucket: null, project: true, live: true });
  const problems = [...bandProblems];
  if (v.outcome !== 'paid') problems.push('CONTROL: the settle did not pay: ' + JSON.stringify({ o: v.outcome, r: v.reason }));
  const clean = await auditSessions(admin, fromBy, base);
  if (clean.red.length || clean.windows < 1) problems.push('CONTROL: a clean settle reads red or empty: ' + JSON.stringify(clean));
  /* A4: gold moved with no ledger row. */
  await admin.unsafe(`update public.account_wallet set gold = gold + 7`);
  const a4 = await auditSessions(admin, fromBy, base);
  if (!a4.red.some((r) => /purse/.test(r))) problems.push('A4: gold moved without a ledger row went unseen');
  await admin.unsafe(`update public.account_wallet set gold = gold - 7`);
  /* A2: time lost (the clock moved with no window). */
  await admin.unsafe(`update public.hunt_sessions set settled_to = settled_to + interval '90 seconds'`);
  const a2 = await auditSessions(admin, fromBy, base);
  if (!a2.red.some((r) => /clock that moved/.test(r))) problems.push('A2: lost time went unseen');
  await admin.unsafe(`update public.hunt_sessions set settled_to = settled_to - interval '90 seconds'`);
  /* A3: a tally that disagrees with its ledger. */
  await admin.unsafe(`update public.hunt_session_tally set coins = coins + 1`);
  const a3 = await auditSessions(admin, fromBy, base);
  if (!a3.red.some((r) => /tally/.test(r))) problems.push('A3: a tally off its ledger went unseen');
  /* last: the journal refuses a delete inside its retention window, so this plant stays */
  /* A1: a window journalled twice (double pay). */
  await admin.begin(async (tx) => {
    await tx.unsafe(`set local session_replication_role = replica`);   // the journal's own fences refuse this write; the plant is the point
    await tx.unsafe(`insert into public.player_ledger (user_id, slot, kind, intent, gold, purse, gold_kind, session_id, meta)
      select user_id, slot, kind, intent, gold, purse, gold_kind, session_id, meta from public.player_ledger where kind = 'combat' and intent = 'accrue' limit 1`);
  }).catch((e) => problems.push('plant failed: ' + e.message));
  const a1 = await auditSessions(admin, fromBy, base);
  if (!a1.red.some((r) => /journalled/.test(r))) problems.push('A1: a window paid twice went unseen');
  await admin.end({ timeout: 5 }); await db.close().catch(() => {});
  for (const p of problems) console.log('RED ' + p);
  console.log(problems.length ? `beta-load --selftest: ${problems.length} red` : 'beta-load --selftest: 4/4 planted defects caught, control clean; the heavy four band: 2/2 caught, control clean');
  process.exit(problems.length ? 1 : 0);
}

if (!isMainThread && workerData && workerData.hrBetaLoad) {
  workerMain().catch((e) => { console.error(e); process.exit(2); });
} else if (isMainThread) {
  (process.argv.includes('--selftest') ? selftest() : main()).catch((e) => { console.error(e && e.stack || e); process.exit(2); });
}
