// ============================================================================
// tests/world-tick-scale.mjs — THE WORLD TICK SCALES PAST THE OWNED COHORT
//
//   node tests/world-tick-scale.mjs            the guard
//   node tests/world-tick-scale.mjs --mutate   every mutant must go RED
//
// docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md, section "Scale" (the
// stage 2/3 prerequisites of the gather widen: S1 due-only roster, S2 sharded
// fires, S3 multi-window catch-up, S4 ledger fold). Every claim is re-measured
// on the PGlite chain replay; the cost claims are STRUCTURAL (counted function
// calls and ledger rows under pg_stat_user_functions), never wall-clock.
//
//   P-IDEM  the newest file of this lane re-applies byte-identically
//
//   S1 — supabase/migrations/2026-10-11-world-tick-due-roster.sql
//   R1  ★ a due armed gatherer (10 min) is rostered and leased; `state` NULL
//   R2  ★ not due (30 s, 89 s): not rostered, lease untouched
//   R3  the boundary: exactly one flush is due (same clock)
//   R4  ★ shadow uses the chained mark (raw 2 h, chain 20 s -> not due;
//           chain 5 min -> due, served at the chain mark)
//   R5  the line follows hr_tick_config.flush_seconds
//   R6  ★ THE EDGE AGREES: every character the roster serves, driven through
//           the shipped runTick, is settled — never a `below_flush` skip
//   R7  ★ NO HYDRATION: a roster call over due characters calls hr_state_of
//           zero times (pg_stat_user_functions)
//   R8  grants: hr_tick only
//   R9  ★ parked is per absence: a crossing logged under an OLDER anchor does
//           not park the new absence's first crossing; the current one does
//
//   S2 — supabase/migrations/2026-10-11-world-tick-shards.sql + tick.js
//        TICK_HOLDER_SQL (pg_net / Vault / pgcrypto stubbed by
//        tests/world-tick-token-shims.mjs, the same stubs the token guards pin)
//   H1  ★ END TO END at shards = 4: one fire queues one POST per non-empty
//           shard; the bodies' rosters are pairwise DISJOINT and cover every
//           due character; each body names its shard and its rows are leased
//           to that shard's holder; every body's MAC verifies with tick.js's
//           own gate; and the shipped runTick, handed each body, settles every
//           character (the edge's holder equals the driver's lease)
//   H2  ★ shards = 1 is the single-POST driver: one POST, shard 0, holder
//           `left('cron:'||db,64)`, no fan-out keys in the log, settles
//   H3  ★ a body naming the wrong shard settles nothing (no_lease)
//   H4  ★ NO CROSS-SHARD CLAIM: a character leased by shard 3, dial moved to
//           2, is not served to its new shard until that lease ends
//   H5  tick.js MAX_SHARDS equals the hr_tick_config_shards_ck ceiling
//   H6  the keyset cursor is per shard: a full batch resumes, a short one
//           resets, and the config row's retired cursor stays NULL
//
//   S3 — supabase/migrations/2026-10-11-world-tick-catchup.sql + tick.js catch-up
//   C0  no dial in the body: one window per visit, the old summary shape
//   C1  ★ THE DIFFERENTIAL (AWAY): ONE visit with catch-up 10 vs 10 single
//           fires, same frozen clock, same starting row: ledger rows, intent
//           keys, inventory, skills, progress and watermark byte-identical
//   C2  the bounds: stops at the flush line (a); one minute past the offline
//           cap pays nothing (b); two minutes inside it pays only windows that
//           start inside it (c, 8c per settle); a SHADOW character is never
//           caught up (d)
//   C3  ★ ATTENDED: the player's own settle (hr_apply) after window 2 ends the
//           catch-up: 2 contiguous tick windows, none past the player's stamp
//   C4  the time budget stops the extra windows, never the first
//   C5  the driver posts both dials in every body
//   C6  MAX_CATCHUP_WINDOWS equals the CHECK, and a body asking 1000 gets 40
//   C7  the CHECKs hold fold <= 8 (the lag judge) and fold <= catch-up
//
//   S4 — supabase/migrations/2026-10-11-world-tick-ledger-fold.sql + tick.js
//        settleFolded + tick-gather.js foldWindowIntents / coalesceProgress
//   F1  ★ THE FOLD DIFFERENTIAL (AWAY): ONE folded settle of 8 windows vs 8
//           single fires, same frozen clock: gold/xp/items (columns and
//           meta.delta), ticks, qty, ms, inventory, skills, progress, tool
//           carry and watermark identical; 1 ledger row instead of 8 over the
//           same [from, to]; the version moves once instead of 8 times
//   F2  8 windows file > 64 progress ops; the fold carries one per (kind,
//           key, period), each the sum of its windows' adds
//   F3  the roster holds an AWAY armed gatherer until a fold is due; an
//           ONLINE one and a SHADOW one keep the one-flush line; fold 1 = S1
//   F4  ★ ATTENDED: the player's own settle (hr_apply) lands between the
//           fold's compute and its settle: the fold is refused, pays nothing
//   F5  a level-up ends the fold chain (renown may move), pay still equal
//   F6  a SHADOW gather window never folds
//   F7  MAX_FOLD_WINDOWS equals the CHECK
//   F8  8c on a fold: past the cap nothing; inside it only windows inside it
//   F9  ★ the PRESENCE HORIZON (8d): a fold crossing it is cut to exactly the
//           windows single fires pay before parking (same pay, one row), the
//           crossing is journalled once, and the parked character then leaves
//           the roster (S1's parked skip)
//   F10 ★ a window carrying an unmodelled key (a real hearthfind, from a
//           fixture engine whose copy rolls 1 in 25) is settled as its own row,
//           never folded; pay equals 8 single fires
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile, writeFile, cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';
import * as TICK from '../supabase/functions/hr-accrue/tick.js';
import * as TICK_GATHER from '../supabase/functions/hr-accrue/tick-gather.js';
import { xpForLevel } from '../src/core/xp.js';
import { SHIM_CRYPTO, SHIM_VAULT, SHIM_NET, K_SECRET } from './world-tick-token-shims.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const HF_FIND = '  if (!rng.chance(1 / row.oneIn)) return null;';
const HF_REPL = '  if (!rng.chance(1 / 25)) return null;';
/* ...and the hook. accrueGather's fx has NO onHearthfind today (gather never
   proposes a hearthfind away or on the tick; combat does, accrual.js
   computeAccrual). The fixture adds the combat path's own line, which is what
   any change closing that gap will do; FOLD_CHAIN_KEYS must already hold then. */
const HF_HOOK_FIND = '    /* Still deliberately ABSENT:';
const HF_HOOK_REPL = '    onHearthfind(f) { if (f && f.item) finds.push({ item: f.item, source_kind: f.kind, source_id: f.id }); },\n'
  + '    /* Still deliberately ABSENT:';
/* ...and the one-per-window collapse the combat flush already does
   (tick-combat.js foldCombatDelta / collapseHearthfind), in the window's own
   poll fold, which is what that change would also need. */
const HF_WIN_FIND = '  const folded = foldDeltas(deltas);\n';
const HF_WIN_REPL = '  const folded = foldDeltas(deltas);\n'
  + '  if (Array.isArray(folded.hearthfind)) { const l = folded.hearthfind; '
  + 'folded.hearthfind = l.length > 1 ? { ...l[0], dropped: Math.min(99, l.length - 1) } : l[0]; }\n';

/* This lane's files, OLDEST FIRST. The newest is the one P-IDEM re-applies
   (each file's §0 accepts its predecessor's body or its own, so an older file
   re-applied over a newer body refuses by design). */
const LANE = [
  '2026-10-11-world-tick-due-roster.sql',
  '2026-10-11-world-tick-shards.sql',
  '2026-10-11-world-tick-catchup.sql',
  '2026-10-11-world-tick-ledger-fold.sql',
];
const read = async (f) => (await readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8')).replace(/\r\n/g, '\n');
const SQL = Object.fromEntries(await Promise.all(LANE.map(async (f) => [f, await read(f)])));
const NEWEST = LANE[LANE.length - 1];

/** The chain-end `create or replace function public.<name>(` statement of this lane, verbatim. */
function fnSource(name) {
  for (const f of [...LANE].reverse()) {
    const sql = SQL[f];
    const start = sql.indexOf(`create or replace function public.${name}(`);
    if (start < 0) continue;
    const as = sql.indexOf('\nas $$', start);
    const end = sql.indexOf('$$;', as + 6);
    if (as < 0 || end < 0) break;
    return sql.slice(start, end + 3);
  }
  throw Object.assign(new Error(`${name} not found in this lane's files`), { harness: true });
}

/* A fresh character per run: player_ledger is append-only (hr_ledger_immutable),
   so a fixture is never reused across the control and mutant runs. */
let RUN = 0;
const U = (n) => `00000000-0000-4000-8000-${(0x7200 + RUN).toString(16).padStart(4, '0')}${n.toString(16).padStart(8, '0')}`;

/* `only` (a Set of section letters R/H/C/F) is the --mutate seam: a mutant runs
   the sections its named arms live in, never fewer. */
async function arms(db, { log = true, tick = TICK, tickGather = TICK_GATHER, hfTick = null, only = null } = {}) {
  RUN += 1;
  const red = [];
  const ok = (id, cond, okMsg, badMsg) => {
    if (cond) { if (log) console.log(`  ✓ ${id} — ${okMsg}`); }
    else { red.push(id); if (log) console.log(`  ✗ ${id} — ${badMsg}`); }
  };
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const cfg = (set) => db.exec(`update public.hr_tick_config set ${set} where id;`);
  /* A node a level-1 character can work (no level gate): a gated node answers
     the engine's level stop, which ENDS the activity and would make every
     catch-up arm below measure an idle transition instead of a yield. */
  const gact = (await one("select activity_id from public.hr_activities where kind = 'gather' and coalesce(req_lv, 1) <= 1 order by activity_id limit 1"))?.activity_id;
  const cact = (await one("select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 1"))?.activity_id;
  if (!gact || !cact) throw Object.assign(new Error('hr_activities lacks a gather or combat row'), { harness: true });
  const HOLDER = (await one("select left('cron:' || coalesce(current_database(), 'db'), 64) as h")).h;

  /* A clean tick cohort per run: every arm reads the roster, and earlier
     runs' (control, mutant) rows must not be in it. */
  await db.exec('delete from public.hr_tick_ownership;');
  await cfg("enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['gather'],"
    + " flush_seconds = 90, cadence_seconds = 10, batch_limit = 200, lease_ms = 30000, shards = 1,"
    + " edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue'");

  /** A character `ageS` seconds behind; owned on its channel; optional shadow chain age. */
  const char = async (u, { ageS = 600, kind = 'gather', chainS = null, sinceS = 10800 } = {}) => {
    await q('insert into auth.users (id) values ($1) on conflict do nothing', [u]);
    await q(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                              active_kind, active_id, active_since)
             values ($1, 0, 0, 0, 10, 10, 1, date_trunc('milliseconds', now()) - make_interval(secs => $2), $3, $4,
                     now() - make_interval(secs => $5))
             on conflict (user_id, slot) do update set version = 1, gold = 0,
               accrued_to = excluded.accrued_to, active_kind = excluded.active_kind,
               active_id = excluded.active_id, active_since = excluded.active_since`,
    [u, ageS, kind, kind === 'combat' ? cact : gact, Math.max(sinceS, ageS + 3600)]);
    await q(`insert into public.hr_tick_ownership (user_id, slot, channel, owned, shadow_accrued_to)
             values ($1, 0, $2, true, case when $3::int is null then null
                                           else date_trunc('milliseconds', now()) - make_interval(secs => $3::int) end)`,
    [u, kind, chainS]);
    return u;
  };
  const roster = (kinds, holder = 'scale-proof', shard = 0) => q(
    `select * from public.hr_tick_roster($1::text[], $2, 500, $3, 30000, null::timestamptz, null::uuid, null::int)`,
    [kinds, shard, holder]);
  const lease = async (u, ch = 'gather') => (await one(
    'select lease_holder from public.hr_tick_ownership where user_id = $1 and slot = 0 and channel = $2', [u, ch]))?.lease_holder ?? null;
  const calls = async (fn) => {
    await q('select pg_stat_force_next_flush()');
    return Number((await one('select coalesce(sum(calls), 0)::int as n from pg_stat_user_functions where funcname = $1', [fn])).n);
  };
  /** The one-statement seam index.ts hands the tick, as the real role. */
  const exec = async (text, params) => {
    await db.exec('begin'); await db.exec('set local role hr_engine');
    try { return (await db.query(text, params)).rows; } finally { await db.exec('commit'); }
  };
  const fireEdge = async (body) => {
    try { return (await tick.runTick({ exec, probe: false, body })).body; }
    catch (e) { return { threw: String(e.message).slice(0, 160) }; }
  };
  const holderOf = async (k) => (await one(
    "select case when $1::int = 0 then left('cron:' || coalesce(current_database(), 'db'), 64)"
    + " else left('cron:' || coalesce(current_database(), 'db'), 58) || ':s' || $1::int end as h", [k])).h;
  const queue = async () => (await q(`select id, headers, convert_from(body, 'UTF8') as body
                                        from net.http_request_queue order by id`))
    .map((r) => ({ id: r.id, headers: r.headers, raw: r.body, j: JSON.parse(r.body) }));
  const cronFire = async () => {
    await q('delete from net.http_request_queue');
    return (await one('select public.hr_tick_cron_run() as r')).r;
  };
  await db.exec("set track_functions = 'all'");

  // ── S1 ──────────────────────────────────────────────────────────────────
  if (!only || only.has('R')) {
    const due = await char(U(1), { ageS: 600 });
    const fresh = await char(U(2), { ageS: 30 });
    const near = await char(U(3), { ageS: 89 });
    const edge = await char(U(4), { ageS: 90 });
    const chainFresh = await char(U(5), { ageS: 7200, kind: 'combat', chainS: 20 });
    const chainDue = await char(U(6), { ageS: 7200, kind: 'combat', chainS: 300 });
    const hydr0 = await calls('hr_state_of');
    const rows = await roster(['gather', 'combat']);
    const hydr = (await calls('hr_state_of')) - hydr0;
    const by = Object.fromEntries(rows.map((r) => [String(r.user_id), r]));

    ok('R1', !!by[due] && by[due].state === null && (await lease(due)) === 'scale-proof',
      'a gatherer 10 min behind is rostered and leased, and its row carries no hydrated state',
      `due row ${JSON.stringify(by[due] ? { state: by[due].state } : null)} lease ${await lease(due)}`);
    ok('R2', !by[fresh] && !by[near] && (await lease(fresh)) === null && (await lease(near)) === null,
      'gatherers 30 s and 89 s behind are neither rostered nor leased',
      `fresh ${!!by[fresh]}/${await lease(fresh)} near ${!!by[near]}/${await lease(near)}`);
    /* THE BOUNDARY, ON ONE CLOCK. now() is the transaction's, so a mark set to
       now() - 90 s and read by the roster in the same transaction is EXACTLY
       one flush old — the only way to tell `<=` from `<`. */
    await db.exec('begin');
    let atLine;
    try {
      await q("update public.player_state set accrued_to = now() - interval '90 seconds' where user_id = $1", [edge]);
      await q("update public.hr_tick_ownership set lease_holder = null, lease_until = null where user_id = $1", [edge]);
      atLine = (await roster(['gather'], 'scale-proof-line')).some((r) => String(r.user_id) === edge);
    } finally { await db.exec('commit'); }
    ok('R3', !!by[edge] && atLine, 'a mark exactly one flush (90 s) old is due, on the same clock',
      `the one-flush boundary was not served (later clock ${!!by[edge]}, same clock ${atLine})`);
    const chainMark = (await one(`select shadow_accrued_to from public.hr_tick_ownership
                                   where user_id = $1 and channel = 'combat'`, [chainDue])).shadow_accrued_to;
    ok('R4', !by[chainFresh] && !!by[chainDue]
        && new Date(by[chainDue].accrued_to).getTime() === new Date(chainMark).getTime(),
      'shadow combat is due on its CHAIN: raw 2 h + chain 20 s is not served; chain 5 min is, at the chain mark',
      `chainFresh ${!!by[chainFresh]}, chainDue ${by[chainDue] ? by[chainDue].accrued_to : 'absent'} vs ${chainMark}`);
    ok('R7', hydr === 0 && rows.length >= 3,
      `a roster call serving ${rows.length} due characters called hr_state_of 0 times`,
      `the roster called hr_state_of ${hydr} time(s) for ${rows.length} rows — it hydrates again`);

    // R5 the line follows the config
    await db.exec('update public.hr_tick_ownership set lease_holder = null, lease_until = null;');
    await cfg('flush_seconds = 600');
    const r600 = (await roster(['gather'])).map((r) => String(r.user_id));
    const five = await char(U(7), { ageS: 300 });
    const r600b = (await roster(['gather'], 'scale-proof-2')).map((r) => String(r.user_id));
    await cfg('flush_seconds = 90');
    ok('R5', r600.includes(due) && !r600.includes(edge) && !r600b.includes(five),
      'at flush 600 s the 10 min gatherer is due and the 90 s / 5 min ones are not',
      `flush 600: ${JSON.stringify({ due: r600.includes(due), edge: r600.includes(edge), five: r600b.includes(five) })}`);

    // R6 the edge agrees with the roster
    await db.exec('update public.hr_tick_ownership set lease_holder = null, lease_until = null;');
    await q("delete from public.hr_tick_ownership where channel = 'combat'");
    const served = await roster(['gather'], HOLDER);
    const fire = await fireEdge({ op: 'tick', roster: served.map((r) => ({ user_id: String(r.user_id), slot: r.slot })),
      cadence_ms: 10000, flush_ms: 90000 });
    const reasons = (fire && fire.reasons) || {};
    ok('R6', served.length >= 3 && fire && fire.ok === true && !reasons.below_flush
        && fire.processed === served.length,
      `the shipped runTick settled every one of the ${served.length} characters the roster served `
      + `(processed ${fire && fire.processed}, no below_flush)`,
      `served ${served.length}; fire ${JSON.stringify(fire)}`);

    // R8 grants
    const sig = 'public.hr_tick_roster(text[],int,int,text,int,timestamptz,uuid,int)';
    const g = {};
    for (const role of ['hr_tick', 'hr_engine', 'anon', 'authenticated', 'service_role']) {
      g[role] = (await one('select has_function_privilege($1, $2, \'execute\') as x', [role, sig])).x;
    }
    ok('R8', g.hr_tick && !g.hr_engine && !g.anon && !g.authenticated && !g.service_role,
      'hr_tick_roster EXECUTE is hr_tick only among the request roles', JSON.stringify(g));

    // R9 ★ PARKED IS PER ABSENCE: a crossing journalled under an OLDER anchor
    //    does not park the new absence's first crossing; one under the CURRENT
    //    anchor does (Security, secParkedAnyAnchor).
    const pk = await char(U(8), { ageS: 600, sinceS: 30 * 3600 });
    const capP = Number((await one('select public.hr_offline_cap_ms($1::uuid, 0) as c', [pk])).c);
    await q(`insert into public.hr_return_anchor (user_id, slot, real_return_at)
             values ($1, 0, now() - interval '9 minutes' - make_interval(secs => $2::double precision))
             on conflict (user_id, slot) do update set real_return_at = excluded.real_return_at`, [pk, capP / 1000]);
    const logAt = (anchorExpr) => q(`insert into public.hr_tick_horizon_log (user_id, slot, anchor_at, channel, horizon_at, cap_ms, mark)
             select $1, 0, ${anchorExpr}, 'gather', ${anchorExpr} + make_interval(secs => $2::double precision), $3,
                    now() - interval '10 minutes'
               from public.hr_return_anchor a where a.user_id = $1 and a.slot = 0`, [pk, capP / 1000, capP]);
    const servedPk = async (h) => {
      await q('update public.hr_tick_ownership set lease_holder = null, lease_until = null where user_id = $1', [pk]);
      return (await roster(['gather'], h)).some((r) => String(r.user_id) === pk);
    };
    await logAt("a.real_return_at - interval '1 day'");
    const oldAnchorServed = await servedPk('r9-a');
    await logAt('a.real_return_at');
    const currentAnchorServed = await servedPk('r9-b');
    ok('R9', oldAnchorServed && !currentAnchorServed,
      'a horizon crossing logged under the previous absence\'s anchor leaves the new absence\'s first crossing '
      + 'served; logged under the current anchor, the character is parked',
      JSON.stringify({ oldAnchorServed, currentAnchorServed }));
  }

  // ── S2 ──────────────────────────────────────────────────────────────────
  if (!only || only.has('H')) {
    const lastNote = async () => (await one('select outcome, rostered, detail from public.hr_tick_cron_log order by id desc limit 1')) || {};
    const macOk = (p) => {
      const h = new Headers(Object.entries(p.headers || {}));
      const g = tick.tickGate(h, K_SECRET, Date.now());
      return !!(g && g.ok && tick.tickBodyAuthOk(g.token, new TextEncoder().encode(p.raw), K_SECRET));
    };
    const selectors = (b) => (b.roster || []).map((r) => ({ user_id: String(r.user_id), slot: r.slot }));

    // H1 the fan-out, end to end
    await db.exec('delete from public.hr_tick_ownership;');
    await q('delete from public.hr_tick_shard_cursor');
    await cfg('shards = 4');
    const fx = [];
    for (let i = 0; i < 24; i++) fx.push(await char(U(100 + i), { ageS: 600 }));
    const want = new Set((await q('select distinct public.hr_tick_shard_of(u, 4) as s from unnest($1::uuid[]) u', [fx])).map((r) => r.s));
    const out = await cronFire();
    const posts = await queue();
    const seen = new Map();
    let overlap = 0; let wrongShard = 0; let wrongLease = 0;
    for (const p of posts) {
      const k = p.j.shard;
      const hk = await holderOf(k);
      if (p.j.holder !== hk) wrongLease++;
      for (const r of p.j.roster || []) {
        const u = String(r.user_id);
        if (seen.has(u)) overlap++;
        seen.set(u, k);
        if (r.shard !== k || 'state' in r) wrongShard++;
        if ((await lease(u)) !== hk) wrongLease++;
      }
    }
    const shardSet = new Set(posts.map((p) => p.j.shard));
    const note = await lastNote();
    ok('H1a', out && out.outcome === 'posted' && posts.length === want.size && want.size >= 2
        && shardSet.size === posts.length && overlap === 0 && wrongShard === 0 && wrongLease === 0
        && seen.size === fx.length && fx.every((u) => seen.has(u))
        && note.detail && note.detail.shards === 4
        && (note.detail.rostered_by_shard || []).reduce((a, b) => a + b, 0) === fx.length,
      `shards = 4: ${posts.length} POSTs (one per non-empty shard), disjoint rosters covering all ${fx.length} `
      + 'due characters, each row leased to its body\'s shard holder, logged per shard',
      JSON.stringify({ out, posts: posts.length, want: [...want], overlap, wrongShard, wrongLease, seen: seen.size,
        note: note.detail && { shards: note.detail.shards, by: note.detail.rostered_by_shard } }));
    ok('H1b', posts.length > 0 && posts.every(macOk),
      'every body\'s X-HR-Tick-Auth verifies with tick.js tickGate + tickBodyAuthOk over the queued bytes',
      `MAC per body: ${JSON.stringify(posts.map(macOk))}`);
    let settled = 0; const why = {};
    for (const p of posts) {
      const f = await fireEdge(p.j);
      settled += Number(f.processed || 0);
      for (const [r, n] of Object.entries(f.reasons || {})) why[r] = (why[r] || 0) + n;
      if (f.threw) why.threw = f.threw;
    }
    ok('H1c', settled === fx.length && !why.no_lease,
      `the shipped runTick, handed each shard's body, settled all ${fx.length} characters (the edge's holder is the driver's)`,
      `settled ${settled}/${fx.length}; reasons ${JSON.stringify(why)}`);

    // H2 one shard is the single-POST driver
    await db.exec('delete from public.hr_tick_ownership;');
    await cfg('shards = 1');
    const one1 = [await char(U(200), { ageS: 600 }), await char(U(201), { ageS: 600 }), await char(U(202), { ageS: 600 })];
    const o2 = await cronFire();
    const p2 = await queue();
    const n2 = await lastNote();
    const f2 = p2.length === 1 ? await fireEdge(p2[0].j) : { processed: 0 };
    ok('H2', o2.outcome === 'posted' && p2.length === 1 && p2[0].j.shard === 0 && p2[0].j.holder === HOLDER
        && !('shards' in (n2.detail || {})) && !('rostered_by_shard' in (n2.detail || {}))
        && (n2.detail || {}).holder === HOLDER && !('shards' in o2)
        && selectors(p2[0].j).length === 3 && f2.processed === 3,
      `shards = 1: one POST, shard 0, holder ${HOLDER}, no fan-out keys logged, and it settles all 3`,
      JSON.stringify({ o2, posts: p2.map((p) => ({ shard: p.j.shard, holder: p.j.holder, n: (p.j.roster || []).length })),
        detail: n2.detail, f2 }));

    // H3 a body naming the wrong shard settles nothing
    await db.exec('delete from public.hr_tick_ownership;');
    const w = [await char(U(300), { ageS: 600 }), await char(U(301), { ageS: 600 })];
    const h2 = await holderOf(2);
    await q("update public.hr_tick_ownership set lease_holder = $2, lease_until = now() + interval '5 minutes' where user_id = any($1::uuid[])", [w, h2]);
    const l0 = Number((await one('select count(*)::int as n from public.player_ledger where user_id = any($1::uuid[])', [w])).n);
    const f3 = await fireEdge({ op: 'tick', shard: 1, roster: w.map((u) => ({ user_id: u, slot: 0 })), cadence_ms: 10000, flush_ms: 90000 });
    const f3b = await fireEdge({ op: 'tick', roster: w.map((u) => ({ user_id: u, slot: 0 })), cadence_ms: 10000, flush_ms: 90000 });
    const l1 = Number((await one('select count(*)::int as n from public.player_ledger where user_id = any($1::uuid[])', [w])).n);
    const f3c = await fireEdge({ op: 'tick', shard: 2, roster: w.map((u) => ({ user_id: u, slot: 0 })), cadence_ms: 10000, flush_ms: 90000 });
    ok('H3', Number((f3.reasons || {}).no_lease) === 2 && Number((f3b.reasons || {}).no_lease) === 2 && l1 === l0
        && f3c.processed === 2,
      'characters leased to shard 2: a body naming shard 1, and one naming none, settle nothing (no_lease x2, '
      + 'zero ledger rows); the body naming shard 2 settles both',
      JSON.stringify({ shard1: f3.reasons, none: f3b.reasons, ledger: l1 - l0, shard2: f3c }));

    // H4 no cross-shard claim across a dial move
    await db.exec('delete from public.hr_tick_ownership;');
    await cfg('shards = 4');
    let mover = null;
    for (let i = 0; i < 64 && !mover; i++) {
      const u = U(400 + i);
      const s = (await one('select public.hr_tick_shard_of($1::uuid, 4) as a, public.hr_tick_shard_of($1::uuid, 2) as b', [u]));
      if (s.a === 3 && s.b !== 3) mover = u;
    }
    if (!mover) throw Object.assign(new Error('H4: no fixture hashes to shard 3 of 4'), { harness: true });
    await char(mover, { ageS: 600 });
    const r4a = (await roster(['gather'], await holderOf(3), 3)).some((r) => String(r.user_id) === mover);
    await cfg('shards = 2');
    const k2 = (await one('select public.hr_shard_of($1::uuid) as k', [mover])).k;
    const r4b = (await roster(['gather'], await holderOf(k2), k2)).some((r) => String(r.user_id) === mover);
    await q("update public.hr_tick_ownership set lease_until = now() - interval '1 second' where user_id = $1", [mover]);
    const r4c = (await roster(['gather'], await holderOf(k2), k2)).some((r) => String(r.user_id) === mover);
    ok('H4', r4a && !r4b && r4c,
      `a character leased by shard 3 of 4 is not served to its new shard ${k2} of 2 while that lease lives, and is once it ends`,
      JSON.stringify({ leasedBy3: r4a, servedWhileLeased: r4b, servedAfter: r4c }));

    // H5 the edge's ceiling is the CHECK's
    const ck = (await one("select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'hr_tick_config_shards_ck'"))?.d || '';
    const hi = Number((ck.match(/shards <= (\d+)/) || [])[1]);
    ok('H5', hi === tick.MAX_SHARDS && /shards >= 1/.test(ck),
      `tick.js MAX_SHARDS ${tick.MAX_SHARDS} equals the CHECK ceiling (${ck})`,
      `MAX_SHARDS ${tick.MAX_SHARDS} vs ${ck}`);

    // H6 the cursor is per shard
    await db.exec('delete from public.hr_tick_ownership;');
    await q('delete from public.hr_tick_shard_cursor');
    await cfg('shards = 1, batch_limit = 2');
    for (let i = 0; i < 5; i++) await char(U(500 + i), { ageS: 600 + i });
    const b1 = (await cronFire(), (await queue())[0]?.j.roster || []).map((r) => String(r.user_id));
    const c1 = await one('select cursor_at from public.hr_tick_shard_cursor where shard = 0');
    const b2 = (await cronFire(), (await queue())[0]?.j.roster || []).map((r) => String(r.user_id));
    const b3 = (await cronFire(), (await queue())[0]?.j.roster || []).map((r) => String(r.user_id));
    const c3 = await one('select cursor_at from public.hr_tick_shard_cursor where shard = 0');
    const cfgCur = await one('select cursor_at, cursor_user, cursor_slot from public.hr_tick_config where id');
    await cfg('batch_limit = 200');
    const all3 = new Set([...b1, ...b2, ...b3]);
    ok('H6', b1.length === 2 && b2.length === 2 && b3.length === 1 && all3.size === 5
        && c1 && c1.cursor_at !== null && c3 && c3.cursor_at === null
        && cfgCur.cursor_at === null && cfgCur.cursor_user === null && cfgCur.cursor_slot === null,
      'batch 2 over 5 due: fires serve 2, 2, 1 distinct characters; the shard cursor holds after a full '
      + 'batch and resets after a short one; the config row\'s retired cursor stays NULL',
      JSON.stringify({ b1: b1.length, b2: b2.length, b3: b3.length, distinct: all3.size, c1, c3, cfgCur }));
    await cfg('shards = 1');
  }

  // ── S3 ──────────────────────────────────────────────────────────────────
  const body1 = (u, extra = {}) => Object.assign({ op: 'tick', roster: [{ user_id: u, slot: 0 }],
    cadence_ms: 10000, flush_ms: 90000 }, extra);
  const leaseTo = (u, h = HOLDER) => q(
    "update public.hr_tick_ownership set lease_holder = $2, lease_until = now() + interval '10 minutes' where user_id = $1", [u, h]);
  /* Everything a window can move, minus the clock columns. Two paths that pay
     the same windows produce this byte for byte. */
  const snapshot = async (u) => ({
    ledger: await q(`select kind, intent, item_id, qty, gold, skill_id, xp, gold_in, xp_in, qty_in, gems_in, meta
                       from public.player_ledger where user_id = $1 order by id`, [u]),
    state: await one('select gold, gems, version, accrued_to, tool_carry, hp from public.player_state where user_id = $1', [u]),
    inv: await q('select item_id, qty from public.player_inventory where user_id = $1 order by item_id', [u]),
    skills: await q('select skill_id, xp from public.player_skills where user_id = $1 order by skill_id', [u]),
    progress: await q(`select kind, key, period_key, value, state from public.player_progress
                        where user_id = $1 order by kind, key, period_key`, [u]),
    intents: await q('select intent_id, intent from public.player_intents where user_id = $1 order by intent_id', [u]),
  });
  /* ONE outer transaction = ONE frozen now(), so two paths see the same clock;
     each statement still runs as hr_engine in its own savepoint (a refusal
     must not abort the path); everything is rolled back after the snapshot. */
  const inTxn = async (u, fn) => {
    await db.exec('begin');
    try {
      const sexec = async (text, params) => {
        await db.exec('savepoint s'); await db.exec('set role hr_engine');
        try {
          const r = (await db.query(text, params)).rows;
          await db.exec('reset role'); await db.exec('release savepoint s');
          return r;
        } catch (e) { await db.exec('rollback to savepoint s'); await db.exec('reset role'); throw e; }
      };
      const fires = await fn(sexec);
      return { fires, snap: await snapshot(u) };
    } finally { await db.exec('rollback'); }
  };
  const tickRows = async (u) => q(`select meta from public.player_ledger
                                    where user_id = $1 and meta->>'src' = 'tick' order by id`, [u]);
  const capOf = async (u) => Number((await one('select public.hr_offline_cap_ms($1::uuid, 0) as c', [u])).c);
  if (!only || only.has('C')) {
    await db.exec('delete from public.hr_tick_ownership;');
    const K = 10;
    // C0 the dial absent is one window per visit, and the summary has no catch-up key
    const z = await char(U(600), { ageS: 1200 });
    await leaseTo(z);
    const f0 = await fireEdge(body1(z));
    ok('C0', f0.processed === 1 && (await tickRows(z)).length === 1 && !('catchup' in f0),
      'no catch_up_windows in the body: one window, one ledger row, and the fire summary is the old shape',
      JSON.stringify({ f0, rows: (await tickRows(z)).length }));

    // C1 ★ THE DIFFERENTIAL (AWAY): one visit with catch-up K == K single fires, byte for byte
    const d = await char(U(601), { ageS: 1200 });
    await leaseTo(d);
    const A = await inTxn(d, async (sexec) => {
      const fires = [];
      for (let i = 0; i < K; i++) fires.push((await tick.runTick({ exec: sexec, probe: false, body: body1(d) })).body);
      return fires;
    });
    const B = await inTxn(d, async (sexec) => [(await tick.runTick({ exec: sexec, probe: false, catchupBudgetMs: 120000,
      body: body1(d, { catchup_windows: K }) })).body]);
    const same = JSON.stringify(A.snap) === JSON.stringify(B.snap);
    const bf = B.fires[0] || {};
    const tickA = A.snap.ledger.filter((l) => l.meta && l.meta.src === 'tick').length;
    ok('C1', same && tickA === K && A.fires.every((f) => f.processed === 1)
        && bf.processed === 1 && bf.catchup && bf.catchup.windows === K && bf.catchup.stops.dial === 1,
      `ONE visit with catch-up ${K} settled the same ${K} windows as ${K} single fires: ledger rows, `
      + 'intent keys, inventory, skills, progress and the watermark identical byte for byte',
      same ? `tick rows A ${tickA} (ledger ${A.snap.ledger.length}); fires ${JSON.stringify(A.fires.map((f) => f.processed))}; B ${JSON.stringify(bf)}`
        : `DIFFERENT: A ${JSON.stringify(A.snap).slice(0, 400)}\n             B ${JSON.stringify(B.snap).slice(0, 400)}`);

    // C2 the bounds: the flush line, the cap, and the armed-only rule
    const five = await char(U(602), { ageS: 300 });
    await leaseTo(five);
    const f2a = await fireEdge(body1(five, { catchup_windows: K }));
    const capped = await char(U(603), { ageS: 600, sinceS: 30 * 3600 });
    const cap = await capOf(capped);
    await q('update public.player_state set accrued_to = now() - make_interval(secs => $2::double precision) where user_id = $1',
      [capped, cap / 1000 + 60]);
    await leaseTo(capped);
    const f2b = await fireEdge(body1(capped, { catchup_windows: K }));
    const inside = await char(U(604), { ageS: 600, sinceS: 30 * 3600 });
    await q('update public.player_state set accrued_to = now() - make_interval(secs => $2::double precision) where user_id = $1',
      [inside, cap / 1000 - 120]);
    await leaseTo(inside);
    const nowMs = new Date((await one('select now() as t')).t).getTime();
    const f2c = await fireEdge(body1(inside, { catchup_windows: K, }));
    const inRows = await tickRows(inside);
    const earliest = Math.min(...inRows.map((r) => Date.parse(r.meta.from)));
    const shadowC = await char(U(605), { ageS: 1800, kind: 'combat', chainS: 1200 });
    await leaseTo(shadowC);
    const sh0 = Number((await one('select count(*)::int as n from public.hr_tick_shadow where user_id = $1', [shadowC])).n);
    const f2d = await fireEdge(body1(shadowC, { catchup_windows: K }));
    const sh1 = Number((await one('select count(*)::int as n from public.hr_tick_shadow where user_id = $1', [shadowC])).n);
    const lag5 = Number((await one('select extract(epoch from (now() - accrued_to)) as s from public.player_state where user_id = $1', [five])).s);
    ok('C2a', (await tickRows(five)).length >= 2 && lag5 < 90 && f2a.catchup && f2a.catchup.stops.below_flush === 1,
      `a character 5 min behind catches up ${(await tickRows(five)).length} full windows and stops at the flush line (lag now ${Math.round(lag5)} s)`,
      JSON.stringify({ rows: (await tickRows(five)).length, lag5, catchup: f2a.catchup }));
    ok('C2b', f2b.refused === 1 && (f2b.reasons || {}).fenced_cap === 1 && (await tickRows(capped)).length === 0,
      'one minute past the offline cap: the first window is refused fenced_cap, nothing is paid, no extra visit',
      JSON.stringify({ f2b, rows: (await tickRows(capped)).length }));
    ok('C2c', inRows.length === K && earliest >= nowMs - cap - 1000,
      `two minutes inside the cap: ${inRows.length} windows paid, every one starting inside the cap (8c per settle)`,
      JSON.stringify({ rows: inRows.length, earliestBehindS: Math.round((nowMs - earliest) / 1000), capS: cap / 1000 }));
    ok('C2d', f2d.shadowed === 1 && sh1 - sh0 === 1 && (f2d.catchup || {}).windows === 0,
      'a SHADOW character is never caught up: one shadow window per visit (probes and their counts untouched)',
      JSON.stringify({ f2d, shadowRows: sh1 - sh0 }));

    // C3 ★ ATTENDED: the player's own settle lands mid catch-up
    const att = await char(U(606), { ageS: 1200 });
    await leaseTo(att);
    let paid = 0; let stamp = null; let how = null;
    const attExec = async (text, params) => {
      const rows = await exec(text, params);
      const r = rows && rows[0] && rows[0].res;
      if (/hr_tick_settle/.test(text) && params && params[4] != null && r && r.ok === true && r.paid === true) {
        paid += 1;
        if (paid === 2) {
          /* A REAL RETURN, through hr_apply as the engine (the accrue path's
             writer): accrued_to is server-clamped to now() and the version moves. */
          try {
            const v = (await one('select version from public.player_state where user_id = $1', [att])).version;
            await db.exec('begin'); await db.exec('set local role hr_engine');
            const res = (await one(
              "select public.hr_apply($1::uuid, 0, $2::bigint, gen_random_uuid(), jsonb_build_object('accrued_to', to_jsonb(now()))) as r",
              [att, v])).r;
            await db.exec('commit');
            how = res && res.ok ? 'hr_apply' : `hr_apply refused: ${JSON.stringify(res).slice(0, 80)}`;
          } catch (e) { try { await db.exec('rollback'); } catch { /* none */ } how = `hr_apply threw: ${e.message.slice(0, 80)}`; }
          stamp = new Date((await one('select accrued_to from public.player_state where user_id = $1', [att])).accrued_to).getTime();
        }
      }
      return rows;
    };
    let f3;
    try {
      f3 = (await tick.runTick({ exec: attExec, probe: false, catchupBudgetMs: 120000,
        body: body1(att, { catchup_windows: K }) })).body;
    } catch (e) { f3 = { threw: e.message }; }
    const aRows = await tickRows(att);
    const aEnd = aRows.length ? Date.parse(aRows[aRows.length - 1].meta.to) : null;
    const contiguous = aRows.every((r, i) => i === 0 || r.meta.from === aRows[i - 1].meta.to);
    const finalMark = new Date((await one('select accrued_to from public.player_state where user_id = $1', [att])).accrued_to).getTime();
    ok('C3', how === 'hr_apply' && aRows.length === 2 && contiguous && aEnd <= stamp && finalMark === stamp
        && f3.catchup && f3.catchup.windows === 2 && (f3.catchup.stops.below_flush === 1),
      'ATTENDED: the player\'s own settle (hr_apply, accrued_to -> now()) after the 2nd window ends the catch-up: '
      + '2 contiguous tick windows, none past the player\'s stamp, the watermark left where the player put it',
      JSON.stringify({ how, rows: aRows.length, contiguous, aEnd, stamp, finalMark, catchup: f3.catchup }));

    // C4 the budget bounds the extra windows, never the first
    const bud = await char(U(607), { ageS: 1200 });
    await leaseTo(bud);
    let f4;
    try { f4 = (await tick.runTick({ exec, probe: false, catchupBudgetMs: 0, body: body1(bud, { catchup_windows: K }) })).body; }
    catch (e) { f4 = { threw: e.message }; }
    ok('C4', f4.processed === 1 && (await tickRows(bud)).length === 1 && f4.catchup && f4.catchup.stops.budget === 1,
      'a spent budget still settles the first window and stops the extra ones (stops.budget)',
      JSON.stringify({ f4, rows: (await tickRows(bud)).length }));

    // C5 the driver posts both dials
    await db.exec('delete from public.hr_tick_ownership;');
    await char(U(608), { ageS: 600 });
    await cfg('catchup_windows = 10');
    const o5 = await cronFire();
    const p5 = (await queue())[0];
    await cfg('catchup_windows = 1');
    ok('C5', o5.outcome === 'posted' && p5 && p5.j.catchup_windows === 10 && p5.j.fold_windows === 1,
      'the driver posts catchup_windows and fold_windows from the config in every body',
      JSON.stringify({ o5, body: p5 && { catchup: p5.j.catchup_windows, fold: p5.j.fold_windows } }));

    // C6 the edge's ceiling is the CHECK's, and it holds
    const ck = (await one("select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'hr_tick_config_catchup_ck'"))?.d || '';
    const hi = Number((ck.match(/catchup_windows <= (\d+)/) || [])[1]);
    const far = await char(U(609), { ageS: 7200 });
    await leaseTo(far);
    let f6;
    try { f6 = (await tick.runTick({ exec, probe: false, catchupBudgetMs: 600000, body: body1(far, { catchup_windows: 1000 }) })).body; }
    catch (e) { f6 = { threw: e.message }; }
    ok('C6', hi === tick.MAX_CATCHUP_WINDOWS && f6.catchup && f6.catchup.windows === hi
        && (await tickRows(far)).length === hi,
      `MAX_CATCHUP_WINDOWS ${tick.MAX_CATCHUP_WINDOWS} equals the CHECK (${ck}); a body asking 1000 settles exactly ${hi}`,
      JSON.stringify({ ck, max: tick.MAX_CATCHUP_WINDOWS, catchup: f6.catchup, rows: (await tickRows(far)).length }));

    // C7 the fold dial is held to the lag judge and to the visit budget
    const refused = async (set) => {
      await db.exec('savepoint c7');
      try { await cfg(set); await db.exec('rollback to savepoint c7'); return false; }
      catch (e) { await db.exec('rollback to savepoint c7'); return e.code === '23514'; }
    };
    await db.exec('begin');
    const c7 = { fold9: await refused('catchup_windows = 40, fold_windows = 9'),
      foldOverCatchup: await refused('catchup_windows = 4, fold_windows = 8'),
      catchup41: await refused('catchup_windows = 41') };
    await db.exec('rollback');
    ok('C7', c7.fold9 && c7.foldOverCatchup && c7.catchup41,
      'the CHECKs refuse fold 9 (past the 15 min lag judge), fold > catch-up, and catch-up 41',
      JSON.stringify(c7));
  }

  // ── S4 ──────────────────────────────────────────────────────────────────
  if (!only || only.has('F')) {
    await db.exec('delete from public.hr_tick_ownership;');
    const F = 8;
    const gskill = (await one('select req_skill from public.hr_activities where activity_id = $1', [gact]))?.req_skill
      || 'woodcutting';
    const setXp = (u, xp) => q(`insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, 0, $2, $3)
                                 on conflict (user_id, slot, skill_id) do update set xp = excluded.xp`, [u, gskill, xp]);
    const sumOf = (rows) => {
      const out = { gold_in: 0, xp_in: 0, qty_in: 0, qty: 0, ticks: 0, ms: 0, i: {}, x: {} };
      for (const r of rows) {
        out.gold_in += Number(r.gold_in || 0); out.xp_in += Number(r.xp_in || 0); out.qty_in += Number(r.qty_in || 0);
        out.qty += Number(r.meta.qty || 0); out.ticks += Number(r.meta.ticks || 0); out.ms += Number(r.meta.ms || 0);
        for (const [k, v] of Object.entries((r.meta.delta || {}).i || {})) out.i[k] = (out.i[k] || 0) + Number(v);
        for (const [k, v] of Object.entries((r.meta.delta || {}).x || {})) out.x[k] = (out.x[k] || 0) + Number(v);
      }
      for (const m of [out.i, out.x]) for (const k of Object.keys(m)) if (m[k] === 0) delete m[k];
      const sort = (m) => Object.fromEntries(Object.keys(m).sort().map((k) => [k, m[k]]));
      out.i = sort(out.i); out.x = sort(out.x);
      return out;
    };
    const tickOnly = (snap) => snap.ledger.filter((l) => l.meta && l.meta.src === 'tick');
    /* The pay a fold must equal: everything but the version (K settles bump
       it K times, one fold once) and the ledger's row count. */
    const value = (snap) => JSON.stringify({ state: { ...snap.state, version: null }, inv: snap.inv, skills: snap.skills,
      progress: snap.progress, ledger: sumOf(tickOnly(snap)) });
    const differential = async (u, fold, mod = tick) => {
      const A = await inTxn(u, async (sexec) => {
        const fires = [];
        for (let i = 0; i < F; i++) fires.push((await mod.runTick({ exec: sexec, probe: false, body: body1(u) })).body);
        return fires;
      });
      const C = await inTxn(u, async (sexec) => [(await mod.runTick({ exec: sexec, probe: false, catchupBudgetMs: 120000,
        body: body1(u, { catchup_windows: F, fold_windows: fold }) })).body]);
      return { A, C, a: tickOnly(A.snap), c: tickOnly(C.snap) };
    };

    // F1 ★ THE FOLD DIFFERENTIAL (AWAY): one fold of 8 == 8 single fires
    const fd = await char(U(700), { ageS: 1200 });
    await setXp(fd, xpForLevel(60) + 1);
    await leaseTo(fd);
    const v0 = (await one('select version from public.player_state where user_id = $1', [fd])).version;
    const d1 = await differential(fd, F);
    const sameValue = value(d1.A.snap) === value(d1.C.snap);
    const cf = d1.C.fires[0] || {};
    ok('F1', sameValue && d1.a.length === F && d1.c.length === 1
        && d1.c[0].meta.from === d1.a[0].meta.from && d1.c[0].meta.to === d1.a[F - 1].meta.to
        && Number(d1.A.snap.state.version) === Number(v0) + F && Number(d1.C.snap.state.version) === Number(v0) + 1
        && cf.processed === 1 && cf.catchup && cf.catchup.windows === F,
      `AWAY: ONE folded settle paid exactly what ${F} single fires paid — gold/xp/items in and in meta.delta, `
      + 'ticks, qty, ms, inventory, skills, progress, tool carry and watermark — in 1 ledger row instead of '
      + `${F}, spanning the same [from, to]`,
      sameValue ? JSON.stringify({ rowsA: d1.a.length, rowsC: d1.c.length, v0, vA: d1.A.snap.state.version,
        vC: d1.C.snap.state.version, cf })
        : `DIFFERENT:\n             A ${value(d1.A.snap).slice(0, 500)}\n             C ${value(d1.C.snap).slice(0, 500)}`);

    // F2 the fold's progress ops are coalesced under hr_apply's 64
    {
      const J = JSON.parse(await readFile(join(ROOT, 'services', 'world-tick', 'fixtures', 'gather-sessions.json'), 'utf8'));
      const s0 = Object.assign({ activeKind: 'gather' }, J.sessions[0]);
      const from = Date.parse('2026-10-01T00:00:00.000Z');
      s0.accruedToMs = from; s0.activeSinceMs = from;
      const geom = { cadenceMs: 10000, flushMs: 90000, maxPolls: 64, holder: 'f2' };
      let s = s0; let m = from; const wins = [];
      for (let w = 0; w < F; w++) {
        const run = tickGather.settleGatherSession(s, m, m + 90000, geom);
        if (!run.intents[0]) break;
        wins.push(run.intents[0]); m = Date.parse(run.intents[0].args.p_window_to);
        s = Object.assign({}, run.char, { accruedToMs: m });
      }
      const folded = wins.length >= 2 ? tickGather.foldWindowIntents({ userId: s0.userId, slot: 0, shard: 0, version: 1, holder: 'f2' }, wins) : null;
      const raw = wins.flatMap((w) => w.args.p_delta.progress || []);
      const sumBy = (ops) => {
        const out = {};
        for (const o of ops) { const k = `${o.kind}|${o.key}|${o.period ?? ''}`; out[k] = (out[k] || 0) + Number(o.add); }
        return JSON.stringify(Object.keys(out).sort().map((k) => [k, out[k]]));
      };
      const fp = (folded && folded.args.p_delta.progress) || [];
      ok('F2', wins.length === F && raw.length > 64 && fp.length <= 64 && sumBy(fp) === sumBy(raw)
          && fp.length === new Set(fp.map((o) => `${o.kind}|${o.key}|${o.period ?? ''}`)).size,
        `${F} windows file ${raw.length} progress ops (hr_apply refuses > 64 per call); the fold carries `
        + `${fp.length}, one per (kind, key, period), each the sum of its windows' adds`,
        JSON.stringify({ windows: wins.length, raw: raw.length, folded: fp.length }));
    }

    // F3 the roster holds an AWAY gatherer for a fold; online and shadow keep one flush
    await db.exec('delete from public.hr_tick_ownership;');
    await cfg(`catchup_windows = ${F}, fold_windows = ${F}`);
    const away3 = await char(U(710), { ageS: 270 });
    const away8 = await char(U(711), { ageS: 721 });
    const live = await char(U(712), { ageS: 95 });
    await q("update public.player_state set last_seen_at = now() - interval '10 seconds' where user_id = $1", [live]);
    const shadowG = await char(U(713), { ageS: 7200, kind: 'combat', chainS: 95 });
    const served3 = (await roster(['gather', 'combat'], 'fold-proof')).map((r) => String(r.user_id));
    await cfg('fold_windows = 1');
    await db.exec('update public.hr_tick_ownership set lease_holder = null, lease_until = null;');
    const served1 = (await roster(['gather'], 'fold-proof-1')).map((r) => String(r.user_id));
    await cfg('fold_windows = 1, catchup_windows = 1');
    ok('F3', !served3.includes(away3) && served3.includes(away8) && served3.includes(live)
        && served3.includes(shadowG) && served1.includes(away3),
      'fold 8: an AWAY gatherer 3 flushes behind waits, 8 flushes behind is served; an ONLINE one (heartbeat '
      + '10 s ago) and a SHADOW combat one keep the one-flush line; fold 1 serves the 3-flush gatherer',
      JSON.stringify({ away3: served3.includes(away3), away8: served3.includes(away8), live: served3.includes(live),
        shadow: served3.includes(shadowG), away3AtFold1: served1.includes(away3) }));

    // F4 ★ ATTENDED: the player's own settle lands between the fold's compute and its settle
    const fa = await char(U(720), { ageS: 1200 });
    await setXp(fa, xpForLevel(60) + 1);
    await leaseTo(fa);
    let raced = null;
    const raceExec = async (text, params) => {
      if (!raced && /hr_tick_settle/.test(text) && params && params[4] != null) {
        const v = (await one('select version from public.player_state where user_id = $1', [fa])).version;
        await db.exec('begin'); await db.exec('set local role hr_engine');
        try {
          raced = (await one(
            "select public.hr_apply($1::uuid, 0, $2::bigint, gen_random_uuid(), jsonb_build_object('accrued_to', to_jsonb(now()))) as r",
            [fa, v])).r;
          await db.exec('commit');
        } catch (e) { await db.exec('rollback'); raced = { threw: e.message }; }
      }
      return exec(text, params);
    };
    let f4;
    try { f4 = (await tick.runTick({ exec: raceExec, probe: false, body: body1(fa, { catchup_windows: F, fold_windows: F }) })).body; }
    catch (e) { f4 = { threw: e.message }; }
    const f4rows = await tickRows(fa);
    const f4mark = new Date((await one('select accrued_to from public.player_state where user_id = $1', [fa])).accrued_to).getTime();
    const why4 = Object.keys(f4.reasons || {})[0] || '';
    ok('F4', raced && raced.ok === true && f4.refused === 1 && /window_already_settled|version_conflict/.test(why4)
        && f4rows.length === 0 && Math.abs(f4mark - Date.now()) < 120000,
      `ATTENDED: the player's own settle landed first; the 8-window fold was refused (${why4}), paid nothing, `
      + 'and the watermark is where the player put it',
      JSON.stringify({ raced: raced && (raced.ok ?? raced), f4, rows: f4rows.length }));

    // F5 a level-up ends the fold chain, and the pay is still the single fires'
    const fl = await char(U(730), { ageS: 1200 });
    await setXp(fl, xpForLevel(61) - 30);
    await leaseTo(fl);
    const d5 = await differential(fl, F);
    ok('F5', value(d5.A.snap) === value(d5.C.snap) && d5.a.length === F && d5.c.length >= 2 && d5.c.length < F,
      `a level-up inside the fold ends the chain (renown and the perk stack may move): ${d5.c.length} settles `
      + `instead of 1, paying exactly what ${F} single fires paid`,
      JSON.stringify({ rowsA: d5.a.length, rowsC: d5.c.length, same: value(d5.A.snap) === value(d5.C.snap) }));

    // F6 a SHADOW gather window is never folded
    await cfg("armed_channels = '{}'");
    const sg = await char(U(740), { ageS: 1200 });
    await setXp(sg, xpForLevel(60) + 1);   // no level-up: only the shadow rule can stop a fold
    await leaseTo(sg);
    const s0n = Number((await one('select count(*)::int as n from public.hr_tick_shadow where user_id = $1', [sg])).n);
    const f6 = await fireEdge(body1(sg, { catchup_windows: F, fold_windows: F }));
    const s1n = Number((await one('select count(*)::int as n from public.hr_tick_shadow where user_id = $1', [sg])).n);
    const s6 = (await one('select extract(epoch from (window_to - window_from))::float8 as w from public.hr_tick_shadow where user_id = $1 order by id desc limit 1', [sg]));
    await cfg("armed_channels = array['gather']");
    const spanS = s6 && s6.w != null ? Number(s6.w) : null;
    ok('F6', f6.shadowed === 1 && s1n - s0n === 1 && spanS !== null && spanS <= 90,
      'SHADOW gather with fold 8: one shadow window of at most one flush (the carrier and probes untouched)',
      JSON.stringify({ f6, rows: s1n - s0n, spanS }));

    // F7 the edge's fold ceiling is the CHECK's
    const ckf = (await one("select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'hr_tick_config_fold_ck'"))?.d || '';
    const hiF = Number((ckf.match(/fold_windows <= (\d+)/) || [])[1]);
    ok('F7', hiF === tick.MAX_FOLD_WINDOWS,
      `tick.js MAX_FOLD_WINDOWS ${tick.MAX_FOLD_WINDOWS} equals the CHECK ceiling (${ckf})`,
      `MAX_FOLD_WINDOWS ${tick.MAX_FOLD_WINDOWS} vs ${ckf}`);

    // F8 8c on a fold: past the cap nothing, inside it only windows that start inside it
    const fc = await char(U(750), { ageS: 600, sinceS: 30 * 3600 });
    const capF = await capOf(fc);
    await q('update public.player_state set accrued_to = now() - make_interval(secs => $2::double precision) where user_id = $1',
      [fc, capF / 1000 + 60]);
    await leaseTo(fc);
    const f8a = await fireEdge(body1(fc, { catchup_windows: F, fold_windows: F }));
    const fi = await char(U(751), { ageS: 600, sinceS: 30 * 3600 });
    await q('update public.player_state set accrued_to = now() - make_interval(secs => $2::double precision) where user_id = $1',
      [fi, capF / 1000 - 120]);
    await setXp(fi, xpForLevel(60) + 1);
    await leaseTo(fi);
    const n8 = new Date((await one('select now() as t')).t).getTime();
    const f8b = await fireEdge(body1(fi, { catchup_windows: F, fold_windows: F }));
    const fiRows = await tickRows(fi);
    ok('F8', (f8a.reasons || {}).fenced_cap === 1 && (await tickRows(fc)).length === 0
        && fiRows.length === 1 && fiRows.every((r) => Date.parse(r.meta.from) >= n8 - capF - 1000)
        && (f8b.catchup || {}).windows === F,
      `a fold one minute past the cap is refused fenced_cap and pays nothing; two minutes inside it pays ${F} `
      + `windows in ${fiRows.length} row(s), every one starting inside the cap`,
      JSON.stringify({ f8a: f8a.reasons, rowsPast: (await tickRows(fc)).length, f8b: f8b.catchup, rowsInside: fiRows.length }));

    // F9 ★ THE HORIZON (presence-horizon (8d)) cuts a fold exactly where single fires park,
    //     and the parked character then leaves the roster (S1's parked skip)
    await db.exec('delete from public.hr_tick_ownership;');
    await cfg(`catchup_windows = ${F}, fold_windows = ${F}`);
    const hz = await char(U(760), { ageS: 1200 });
    await setXp(hz, xpForLevel(60) + 1);
    const capH = await capOf(hz);
    /* The tick "has paid" since the last real return: the horizon falls 405 s
       (4.5 flushes) past the mark, so four windows fit and the fifth crosses. */
    await q(`update public.hr_return_anchor a set real_return_at = ps.accrued_to + interval '405 seconds'
                                                                - make_interval(secs => $2::double precision)
               from public.player_state ps where ps.user_id = a.user_id and ps.slot = a.slot and a.user_id = $1`,
    [hz, capH / 1000]);
    const horizon = new Date((await one(`select a.real_return_at + make_interval(secs => $2::double precision) as h
                                           from public.hr_return_anchor a where a.user_id = $1`, [hz, capH / 1000])).h).getTime();
    const servedBefore = (await roster(['gather'], 'hz-proof')).some((r) => String(r.user_id) === hz);
    await q('update public.hr_tick_ownership set lease_holder = null, lease_until = null where user_id = $1', [hz]);
    await leaseTo(hz);
    const d9 = await differential(hz, F);
    const f9 = await fireEdge(body1(hz, { catchup_windows: F, fold_windows: F }));
    const hzRows = await tickRows(hz);
    const parked = Number((await one('select count(*)::int as n from public.hr_tick_horizon_log where user_id = $1', [hz])).n);
    await q('update public.hr_tick_ownership set lease_holder = null, lease_until = null where user_id = $1', [hz]);
    const servedAfter = (await roster(['gather'], 'hz-proof-2')).some((r) => String(r.user_id) === hz);
    await cfg('fold_windows = 1, catchup_windows = 1');
    ok('F9', value(d9.A.snap) === value(d9.C.snap) && d9.a.length === 4 && d9.c.length === 1
        && hzRows.length === 1 && Date.parse(hzRows[0].meta.to) <= horizon && (f9.catchup || {}).windows === 4
        && parked === 1 && servedBefore && !servedAfter,
      'the fold is cut at the presence horizon to the 4 windows single fires pay before parking (same pay, 1 row), '
      + 'the crossing is journalled once, and the parked character then leaves the roster',
      JSON.stringify({ same: value(d9.A.snap) === value(d9.C.snap), singles: d9.a.length, folds: d9.c.length,
        rows: hzRows.length, f9: f9.catchup, reasons: f9.reasons, parked, servedBefore, servedAfter }));

    // F10 ★ A WINDOW CARRYING AN UNMODELLED KEY (`hearthfind`) IS NEVER FOLDED
    //     (Security, secFoldNoKeyStop). The fixture engine (hfTick) is the
    //     shipped edge with ONE data change in its copy: the hearthfind odds
    //     are 1 in 25 per action instead of 1 in 100-400 hours, so a real
    //     `hearthfind` delta appears inside 8 windows. Pay must equal 8 single
    //     fires, and the find window must be its own row.
    if (!hfTick) throw Object.assign(new Error('F10 needs the hearthfind fixture engine'), { harness: true });
    await db.exec('delete from public.hr_tick_ownership;');
    const hf = await char(U(770), { ageS: 1200 });
    await q("update public.player_state set active_id = 'normal_tree' where user_id = $1", [hf]);
    await q(`insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, 0, 'woodcutting', $2)
             on conflict (user_id, slot, skill_id) do update set xp = excluded.xp`, [hf, xpForLevel(60) + 1]);
    await leaseTo(hf);
    const d10 = await differential(hf, F, hfTick);
    const finds = (rows) => rows.filter((r) => ((r.meta.delta || {}).k || []).includes('hearthfind'));
    const findsA = finds(d10.a); const findsC = finds(d10.c);
    ok('F10', findsA.length >= 2 && value(d10.A.snap) === value(d10.C.snap)
        && findsC.length === findsA.length && d10.c.length <= F
        && JSON.stringify(findsC.map((r) => [r.meta.from, r.meta.to])) === JSON.stringify(findsA.map((r) => [r.meta.from, r.meta.to])),
      `${findsA.length} hearthfind window(s) inside 8: each settled as its own row (same span as the single fire), `
      + `${d10.c.length} rows in all, pay (trophies included, under the 3/day cap) identical to 8 single fires`,
      JSON.stringify({ findsA: findsA.length, findsC: findsC.length, rowsA: d10.a.length, rowsC: d10.c.length,
        same: value(d10.A.snap) === value(d10.C.snap), fires: d10.C.fires.map((f) => ({ c: f.catchup, r: f.reasons })) }));
  }

  return red;
}

const bodies = async (db) => (await db.query(
  `select p.proname || ':' || md5(pg_get_functiondef(p.oid)) as h from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('hr_tick_roster', 'hr_tick_cron_run', 'hr_shard_of', 'hr_tick_shard_of')
    order by 1`)).rows.map((r) => r.h).join(',');

async function boot() {
  const { db } = await bootReplay({ upTo: NEWEST });
  /* What Supabase has and PGlite does not, from the ONE copy the token guards
     pin against node:crypto and the migration's own vector. */
  await db.exec(SHIM_CRYPTO + SHIM_VAULT + SHIM_NET);
  return db;
}

if (!MUTATE) {
  console.log('\nworld-tick-scale: the tick serves only what is due, fans out, catches up and folds — paying exactly what single windows pay');
  let db;
  try { db = await boot(); } catch (e) {
    console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2);
  }
  const inv0 = JSON.stringify(await inventory(db));
  const b0 = await bodies(db);
  let err = null;
  try { await db.exec(SQL[NEWEST]); } catch (e) { err = String(e.message).split('\n')[0]; }
  const idem = !err && JSON.stringify(await inventory(db)) === inv0 && (await bodies(db)) === b0;
  console.log(idem
    ? `  ✓ P-IDEM — ${NEWEST} re-applied byte-identically (§0 accepted its own body, its self-check passed twice)`
    : `  ✗ P-IDEM — ${err || 'the re-apply moved the schema or a body'}`);
  let red;
  const HF = await edgeCopy(null, null, null, null, true);
  try { red = await arms(db, { hfTick: HF.mod }); } catch (e) {
    if (e.harness) { console.error(`harness: ${e.message}`); process.exit(2); }
    throw e;
  }
  await rm(HF.base, { recursive: true, force: true });
  if (!idem) red.push('P-IDEM');
  console.log(red.length ? `\nRED: ${red.join(', ')}`
    : '\nGREEN: the roster serves only due characters without hydrating them; one fire fans out to disjoint, '
      + 'correctly-leased shards the edge settles; the edge settles every one it is served');
  process.exit(red.length ? 1 : 0);
}

// ── --mutate ──────────────────────────────────────────────────────────────
// SQL mutants re-create ONE function from this lane's chain-end text with one
// line broken (each file's own self-check md5 lock would refuse a patched FILE
// before any behaviour ran, which proves the lock, not the arms). EDGE mutants
// patch a COPY of the function directory under the OS temp dir (never the
// tracked file: Security S-UM-1) and hand the arms that copy's runTick.
const SRC = {
  roster: fnSource('hr_tick_roster'),
  cron: fnSource('hr_tick_cron_run'),
  shardOf: fnSource('hr_shard_of'),
};
const RESTORE = [
  SRC.roster, SRC.cron, SRC.shardOf,
  'revoke execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) from public;',
  'revoke execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) from anon, authenticated, service_role, hr_engine;',
  'grant  execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) to hr_tick;',
  'revoke execute on function public.hr_tick_cron_run() from public;',
  'revoke execute on function public.hr_tick_cron_run() from anon, authenticated, service_role, hr_engine, hr_tick;',
  'revoke execute on function public.hr_shard_of(uuid) from public;',
  'revoke execute on function public.hr_shard_of(uuid) from anon, authenticated, service_role, hr_engine, hr_tick;',
].join('\n');
const MUTANTS = [
  // S1
  // (The due line's chain-end spelling is S4's `m.mark <= now() - v_flush * (<fold>)`.)
  { name: 'noDueLine', fn: 'roster', why: 'the roster serves every owned character again (8 of 9 visits wasted)', expect: /R2/,
    find: '       and m.mark <= now() - v_flush * (\n', repl: "       and m.mark <= now() + interval '1 day' + v_flush * (\n" },
  { name: 'strictDueLine', fn: 'roster', why: 'a mark exactly one flush old waits a fire', expect: /R3/,
    find: '       and m.mark <= now() - v_flush * (\n', repl: '       and m.mark < now() - v_flush * (\n' },
  { name: 'dueOnRawMark', fn: 'roster', why: 'the due line reads the raw accrued_to, not the chained mark the edge probes', expect: /R4/,
    find: '       and m.mark <= now() - v_flush * (\n', repl: '       and ps.accrued_to <= now() - v_flush * (\n' },
  { name: 'flushConstant', fn: 'roster', why: 'the due line ignores flush_seconds', expect: /R5/,
    find: '       and m.mark <= now() - v_flush * (\n', repl: "       and m.mark <= now() - interval '90 seconds' * (\n" },
  { name: 'hydrates', fn: 'roster', why: 'the roster hydrates every row again (17 ms/row nobody reads)', expect: /R1|R7/,
    find: '         null::jsonb                                                     as state',
    repl: '         public.hr_state_of(ps.user_id, ps.slot)                        as state' },
  { name: 'dueTooLate', fn: 'roster', why: 'the due line is two flushes (a due character waits a whole extra flush)', expect: /R3|R6|R1/,
    find: '       and m.mark <= now() - v_flush * (\n', repl: '       and m.mark <= now() - 2 * v_flush * (\n' },
  { name: 'grantEngine', fn: 'roster', why: 'hr_engine is granted EXECUTE on the roster', expect: /R8/,
    find: null, repl: '\ngrant execute on function public.hr_tick_roster(text[], int, int, text, int, timestamptz, uuid, int) to hr_engine;' },
  // S2
  { name: 'oneHolderForAll', fn: 'cron', why: 'every shard leases under shard 0\'s name (the edge of shard k settles nothing)', expect: /H1/,
    find: "                     else left('cron:' || coalesce(current_database(), 'db'), 58) || ':s' || k end;",
    repl: "                     else left('cron:' || coalesce(current_database(), 'db'), 64) end;" },
  { name: 'noShardKey', fn: 'cron', why: 'the body does not name its shard (the edge settles it as shard 0)', expect: /H1/,
    find: "                                   'shard', k,\n", repl: '' },
  { name: 'shardConstant', fn: 'shardOf', why: 'hr_shard_of is `select 0` again: one fire, one POST, whatever the dial', expect: /H1|H4/,
    find: "  select public.hr_tick_shard_of(p_user,\n           coalesce((select c.shards from public.hr_tick_config c where c.id), 1))",
    repl: '  select 0' },
  { name: 'cursorNeverAdvances', fn: 'cron', why: 'a full batch does not store its cursor (the next fire re-serves it)', expect: /H6/,
    find: '      values (k, v_last_a, v_last_u, v_last_s, now())', repl: '      values (k, null, null, null, now())' },
  { name: 'fanOutLoggedAlways', fn: 'cron', why: 'a one-shard fire logs fan-out keys (the single-POST log row is not preserved)', expect: /H2/,
    find: '    || case when v_shards > 1\n            then jsonb_build_object(\'shards\'',
    repl: '    || case when true\n            then jsonb_build_object(\'shards\'' },
  { name: 'edgeHolderIgnoresShard', edge: 'tick.js', why: 'the edge settles every shard under shard 0\'s holder', expect: /H1|H3/,
    find: '  const [h] = await exec(TICK_HOLDER_SQL, [body.shard]);', repl: '  const [h] = await exec(TICK_HOLDER_SQL, [0]);' },
  { name: 'edgeHolderSpelling', edge: 'tick.js', why: 'the edge spells shard k\'s holder differently from the driver', expect: /H1|H3/,
    find: " + \" else left('cron:' || coalesce(current_database(), 'db'), 58) || ':s' || $1::int end as holder\";",
    repl: " + \" else left('cron:' || coalesce(current_database(), 'db'), 58) || '-s' || $1::int end as holder\";" },
  { name: 'edgeMaxShards', edge: 'tick.js', why: 'the edge ceiling drifts from the CHECK', expect: /H5/,
    find: 'export const MAX_SHARDS = 16;', repl: 'export const MAX_SHARDS = 8;' },
  // S3
  { name: 'catchupDefaultTwo', edge: 'tick.js', why: 'a body with no dial catches up anyway', expect: /C0/,
    find: '  out.catchupWindows = clampInt(b.catchup_windows, 1, MAX_CATCHUP_WINDOWS, 1);',
    repl: '  out.catchupWindows = clampInt(b.catchup_windows, 1, MAX_CATCHUP_WINDOWS, 2);' },
  { name: 'catchupShadow', edge: 'tick.js', why: 'a SHADOW character is caught up (probe counts move)', expect: /C2d/,
    find: "    if (catchup && v.outcome === 'processed') {",
    repl: "    if (catchup && (v.outcome === 'processed' || v.outcome === 'shadowed')) {",
    and: ["        if (w.outcome !== 'processed') { stop = String(w.reason || w.outcome); break; }",
      "        if (w.outcome !== 'processed' && w.outcome !== 'shadowed') { stop = String(w.reason || w.outcome); break; }"] },
  { name: 'catchupNoCeiling', edge: 'tick.js', why: 'the edge ceiling drifts above the CHECK', expect: /C6/,
    find: 'export const MAX_CATCHUP_WINDOWS = 40;', repl: 'export const MAX_CATCHUP_WINDOWS = 400;' },
  { name: 'catchupNoBudget', edge: 'tick.js', why: 'the extra windows ignore the time budget', expect: /C4/,
    find: "        if (now() >= deadline) { stop = 'budget'; break; }", repl: '' },
  { name: 'catchupCountsSkips', edge: 'tick.js', why: 'a visit that did not pay is counted as a caught-up window', expect: /C2a|C3/,
    find: "        if (w.outcome !== 'processed') { stop = String(w.reason || w.outcome); break; }\n", repl: '' },
  { name: 'cronDropsCatchup', fn: 'cron', why: 'the driver does not post the catch-up dial', expect: /C5/,
    find: "                                   'catchup_windows', v_cfg.catchup_windows,\n", repl: '' },
  { name: 'foldPastLagJudge', raw: true, why: 'the CHECK admits a fold past the 15 min lag judge', expect: /C7/,
    sql: 'alter table public.hr_tick_config drop constraint hr_tick_config_fold_ck; alter table public.hr_tick_config add constraint hr_tick_config_fold_ck check (fold_windows between 1 and 40 and fold_windows <= catchup_windows);',
    restore: 'alter table public.hr_tick_config drop constraint hr_tick_config_fold_ck; alter table public.hr_tick_config add constraint hr_tick_config_fold_ck check (fold_windows between 1 and 8 and fold_windows <= catchup_windows);' },
  // S4
  { name: 'foldsOnline', fn: 'roster', why: 'an ONLINE player is held for a fold (a watching player sees no progress for 12 min)', expect: /F3/,
    find: "                       and not coalesce(ps.last_seen_at >  now() - interval '75 seconds'\n"
      + "                                    and ps.last_seen_at <= now() + interval '60 seconds', false)\n", repl: '' },
  { name: 'foldsShadow', fn: 'roster', why: 'a SHADOW combat character is held for a fold it will never get', expect: /F3/,
    find: "             case when a.armed and o.channel = 'gather'\n", repl: "             case when o.channel in ('gather', 'combat')\n" },
  { name: 'noFoldWait', fn: 'roster', why: 'an away character is visited every flush (no ledger saving)', expect: /F3/,
    find: '                  then v_fold else 1 end)\n', repl: '                  then 1 else 1 end)\n' },
  { name: 'foldNoCoalesce', edge: 'tick-gather.js', why: 'the fold concatenates progress ops (hr_apply refuses > 64)', expect: /F1|F2/,
    find: '    it.args.p_delta.progress = coalesceProgress(it.args.p_delta.progress);\n', repl: '' },
  { name: 'foldIgnoresLevelUp', edge: 'tick.js', why: 'the fold chain runs through a level-up (renown/perks may move)', expect: /F5/,
    find: '    if (levelledUp(session.skills, run.char.skills)) break;\n', repl: '' },
  { name: 'foldChainsOnClock', edge: 'tick.js', why: 'the next folded window starts at the clock, not at the settled watermark', expect: /F1|F5/,
    find: '    m = run.watermarkMs;\n', repl: '    m = to;\n' },
  { name: 'foldInShadow', edge: 'tick.js', why: 'a SHADOW gather window folds (carrier and probes bypassed)', expect: /F6/,
    find: '  const foldN = (probe.shadow === false && channel === GATHER_CHANNEL && maxWindows > 1)',
    repl: '  const foldN = (channel === GATHER_CHANNEL && maxWindows > 1)' },
  { name: 'parkedNotSkipped', fn: 'roster', why: 'a PARKED character (journalled horizon crossing) is rostered and refused every fire', expect: /F9/,
    find: '       and not (a.armed and exists (\n', repl: '       and not (false and exists (\n' },
  // Security's review mutants (2026-10-08), both SURVIVED @c34efa5f.
  { name: 'secParkedAnyAnchor', fn: 'roster', why: 'a crossing logged under an OLDER anchor parks the new absence', expect: /R9/,
    find: '                and hl.anchor_at = ra.real_return_at\n', repl: '' },
  { name: 'secFoldNoKeyStop', edge: 'tick.js', why: 'a window carrying hearthfind/activity is folded with its neighbours', expect: /F10/,
    find: '    if (Object.keys(it.args.p_delta).some((k) => !FOLD_CHAIN_KEYS.includes(k))) {\n      if (i === 0) wins.push(it);\n      break;\n    }\n',
    repl: '' },
  { name: 'foldNoHorizonTrim', edge: 'tick.js', why: 'a fold crossing the horizon is refused whole (the 4 payable windows are lost)', expect: /F9/,
    find: "  if (res && res.ok !== true && res.error === 'past_horizon' && wins.length > 1 && res.horizon) {",
    repl: '  if (false) {' },
  { name: 'foldCeiling', edge: 'tick.js', why: 'the edge fold ceiling drifts from the CHECK', expect: /F7/,
    find: 'export const MAX_FOLD_WINDOWS = 8;', repl: 'export const MAX_FOLD_WINDOWS = 16;' },
];

/** A patched COPY of the edge, imported fresh. Returns the module and its temp root. */
/* THE HEARTHFIND FIXTURE (F10): the one data change a copy may carry beyond its
   mutant. Applied in the control run too, because it is the fixture, not a mutant. */
async function edgeCopy(file, find, repl, and, hf = false) {
  const base = await mkdtemp(join(tmpdir(), 'hr-wts-'));
  const dir = join(base, 'supabase', 'functions', 'hr-accrue');
  await cp(join(ROOT, 'supabase', 'functions', 'hr-accrue'), dir, { recursive: true });
  await cp(join(ROOT, 'src', 'core'), join(base, 'src', 'core'), { recursive: true });
  await cp(join(ROOT, 'src', 'data'), join(base, 'src', 'data'), { recursive: true });
  if (find !== null && !CONTROL) {
    const src = (await readFile(join(dir, file), 'utf8')).replace(/\r\n/g, '\n');
    if (src.split(find).length !== 2) {
      throw Object.assign(new Error(`edge anchor matched ${src.split(find).length - 1}x in ${file}`), { harness: true });
    }
    let out = src.replace(find, () => repl);
    if (and) {
      if (out.split(and[0]).length !== 2) {
        throw Object.assign(new Error(`second edge anchor matched ${out.split(and[0]).length - 1}x in ${file}`), { harness: true });
      }
      out = out.replace(and[0], () => and[1]);
    }
    await writeFile(join(dir, file), out, 'utf8');
  }
  if (hf) {
    const p = join(base, 'src', 'core', 'hearthfind.js');
    const src = (await readFile(p, 'utf8')).replace(/\r\n/g, '\n');
    if (src.split(HF_FIND).length !== 2) throw Object.assign(new Error('hearthfind fixture anchor moved'), { harness: true });
    await writeFile(p, src.replace(HF_FIND, () => HF_REPL), 'utf8');
    const pa = join(dir, 'accrual.js');
    const sa = (await readFile(pa, 'utf8')).replace(/\r\n/g, '\n');
    if (sa.split(HF_HOOK_FIND).length !== 2) throw Object.assign(new Error('gather hearthfind hook anchor moved'), { harness: true });
    await writeFile(pa, sa.replace(HF_HOOK_FIND, () => HF_HOOK_REPL), 'utf8');
    const pg = join(dir, 'tick-gather.js');
    const sg = (await readFile(pg, 'utf8')).replace(/\r\n/g, '\n');
    if (sg.split(HF_WIN_FIND).length !== 2) throw Object.assign(new Error('gather window fold anchor moved'), { harness: true });
    await writeFile(pg, sg.replace(HF_WIN_FIND, () => HF_WIN_REPL), 'utf8');
  }
  const mod = await import(pathToFileURL(join(dir, 'tick.js')).href);
  const gather = await import(pathToFileURL(join(dir, 'tick-gather.js')).href);
  return { mod, gather, base };
}

console.log('\nworld-tick-scale --mutate: every mutant must go RED on its named arm');
let db;
try { db = await boot(); } catch (e) { console.error(`harness: ${e.message}`); process.exit(2); }
const HF0 = await edgeCopy(null, null, null, null, true);
const control = await arms(db, { log: false, hfTick: HF0.mod });
if (control.length) { console.error(`harness: the unmutated control is red (${control.join(', ')})`); process.exit(2); }
console.log(`[mutants] ${MUTANTS.length}`);
let survived = 0;
for (const m of MUTANTS) {
  let red;
  /* The sections the mutant's named arms live in (R1 -> R, F9 -> F, ...). */
  const only = new Set((m.expect.source.match(/[RHCF](?=\d)/g) || []));
  let tmp = null;
  let tmp2 = null;
  try {
    if (m.edge) {
      const c = await edgeCopy(m.edge, m.find, m.repl, m.and);
      tmp = c.base;
      const h = only.has('F') ? await edgeCopy(m.edge, m.find, m.repl, m.and, true) : null;
      tmp2 = h && h.base;
      try { red = await arms(db, { log: false, tick: c.mod, tickGather: c.gather, hfTick: h ? h.mod : HF0.mod, only }); } catch (e) { red = [`threw: ${e.message}`]; }
    } else if (m.raw) {
      if (!CONTROL) {
        try { await db.exec(m.sql); } catch (e) { console.error(`harness: ${m.name}: ${e.message}`); process.exit(2); }
      }
      try { red = await arms(db, { log: false, hfTick: HF0.mod, only }); } catch (e) { red = [`threw: ${e.message}`]; }
      try { await db.exec('rollback;'); } catch { /* not inside a transaction */ }
      if (!CONTROL) await db.exec(m.restore);
    } else {
      const base = SRC[m.fn];
      let src;
      if (m.find === null) src = base + m.repl;
      else {
        if (base.split(m.find).length !== 2) { console.error(`harness: ${m.name}: anchor matched ${base.split(m.find).length - 1}x`); process.exit(2); }
        src = base.replace(m.find, () => m.repl);
      }
      if (!CONTROL) {
        try { await db.exec(src); } catch (e) { console.error(`harness: ${m.name}: ${e.message}`); process.exit(2); }
      }
      try { red = await arms(db, { log: false, hfTick: HF0.mod, only }); } catch (e) { red = [`threw: ${e.message}`]; }
    }
  } catch (e) {
    if (e.harness) { console.error(`harness: ${m.name}: ${e.message}`); process.exit(2); }
    throw e;
  } finally {
    if (tmp) await rm(tmp, { recursive: true, force: true });
    if (tmp2) await rm(tmp2, { recursive: true, force: true });
  }
  try { await db.exec('rollback;'); } catch { /* not inside a transaction */ }
  await db.exec(RESTORE);
  const hit = red.some((id) => m.expect.test(id));
  console.log(`[mutant] ${m.name} ${hit ? 'caught' : 'survived'}`);
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via ${red.join(', ')}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: ${red.length ? `red only via ${red.join(', ')}` : 'SURVIVED'}`); }
}
const after = await arms(db, { log: false, hfTick: HF0.mod });
if (after.length) { console.error(`harness: the restored bodies are red (${after.join(', ')})`); process.exit(2); }
await db.close();
await rm(HF0.base, { recursive: true, force: true });
if (CONTROL) {
  console.log(`\nHR_MUTANT_CONTROL: nothing planted; ${MUTANTS.length - survived} arm(s) read caught`);
  process.exit(survived === MUTANTS.length ? 0 : 1);
}
console.log(survived ? `\nRED: ${survived} mutant(s) survived` : `\nGREEN: all ${MUTANTS.length} mutants caught`);
process.exit(survived ? 1 : 0);
