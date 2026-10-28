// art/review/opt-review-2026-10-28/capacity-model.mjs — the arithmetic from MEASURED per-unit costs to N concurrent hunts.
//
//   node art/review/opt-review-2026-10-28/capacity-model.mjs [out.json]
//
// Every input below is either MEASURED on live (2026-10-28 ~00:50-01:15 UTC, the files beside this one) or ASSUMED
// (named so). The model is deliberately simple: linear per hero, no contention, no burst credits. It names, for each
// resource, the N at which it is exhausted, so "what breaks first" is a comparison of numbers, not adjectives.
import { writeFileSync } from 'node:fs';

const M = {
  // ── DB time (pg_stat_statements diff A->C, 26.17 min, one unwatched party instance of 4 heroes: server-window-a-c.json) ──
  db_ms_per_unwatched_hero_min: 51957 / 26.17 / 4,     // MEASURED: hr_engine total (read 26858 + apply 15992 + tick_settle 4361 + state 3953 + perks 766 ms)
  settles_per_min_unwatched: 35 / 26.17,               // MEASURED: 35 hr_hunt_apply_instance calls in the window
  settles_per_min_watched: 6,                          // DESIGN: the 10 s pg_cron tick settles a watched hunt each fire
  client_polls_per_min_watched: 60 / 16,               // CODE: SESSION_CONFIG.huntPollMs = 16000 (a hunt_settle each)
  db_ms_per_player_poll: 440,                          // MEASURED: HUNT_READ_SQL mean in the window (a poll inside the floor reads, settles nothing)
  db_fixed_ms_per_min: 1673 / 6.27,                    // MEASURED (A->B): cron jobs (tick run, leaderboards, enrol, sweep, town refresh, ...)
  db_core_ms_per_min: 60000,
  micro_cores: 2,                                      // MEASURED: billing/addons ci_micro cpu_cores 2, cpu_dedicated false
  usable_core_fraction: 0.7,                           // ASSUMED: shared ARM cores, headroom for autovacuum/WAL/pooler
  // ── realtime frames (realtime.messages, 10-24..10-27) ──
  frame_payload_kb: 50,                                // MEASURED: avg 48.8-54.8 KB/frame/day, max 69 KB; one frame = the whole envelope
  frame_disk_kb: 97271808 / 3842 / 1024,               // MEASURED: partition 10_26 total bytes / rows (TOAST-compressed on disk)
  frames_per_watched_hero_min: 6,                      // DESIGN: one per settle per online member
  realtime_partition_days: 3.5,                        // MEASURED: partitions 10_24..10_27 kept, older dropped
  // ── disk (Management API /config/disk/util) ──
  disk_total_gb: 2077073408 / 1e9, disk_used_gb: 1043390464 / 1e9,   // MEASURED
  autoscale_at: 0.9, autoscale_growth: 0.5, autoscale_cooldown_h: 6,  // ASSUMED: Supabase documented defaults (config returns null = defaults)
  // ── ledger (player_ledger, 10-27) ──
  ledger_rows_per_unwatched_hero_min: 297 / 26.17 / 4, // MEASURED: 297 inserts in the A->C window, 4 heroes
  ledger_bytes_per_row: 92569600 / 148055,             // MEASURED: total relation bytes / rows (heap + 3 indexes)
  ledger_retain_days: 90, ledger_prune_rows_per_day: 20000 * 24,   // CODE: hr_ledger_config 90 d; cron hr_ledger_prune(20000) hourly
  // ── realtime tenant limits (Management API /config/realtime) ──
  rt_max_concurrent: 200, rt_max_events_per_s: 100, rt_max_payload_kb: 256,   // MEASURED: Free-plan values on a Pro project
  rt_topics_per_client: 5,                             // CODE: chat:global, chat:system, chat:local:<zone>, chat:inbox:<uid>, hr:<uid> frames
  global_chat_lines_per_player_hour: 2,                // ASSUMED: a quiet Discord playtest
  // ── connections ──
  pooler_clients: 200, direct: 60,                     // MEASURED: billing/addons
  // ── edge ──
  edge_cpu_limit_ms: 2000, hunt_body_max: 12,          // DOCS: 2 s CPU per request; CODE/DB: hr_tick_config.hunt_body_max
  engine_cpu_ms_party4_90s: 172, engine_cpu_ms_party4_10s: 31,   // MEASURED (engine-bench.mjs, Node on Tyler's PC; Deno edge likely slower)
};

function at(n, watchedShare) {
  const w = n * watchedShare, u = n - w;
  const perSettle = M.db_ms_per_unwatched_hero_min / M.settles_per_min_unwatched;   // DB ms per hero per settle
  const dbMsMin = u * M.db_ms_per_unwatched_hero_min + w * (perSettle * M.settles_per_min_watched + M.client_polls_per_min_watched * M.db_ms_per_player_poll / 4)
    + M.db_fixed_ms_per_min;
  const cores = dbMsMin / M.db_core_ms_per_min;
  const frameDiskGbH = w * M.frames_per_watched_hero_min * 60 * M.frame_disk_kb / 1e6;
  const frameEgressGbH = w * M.frames_per_watched_hero_min * 60 * M.frame_payload_kb / 1e6;
  const ledgerRowsDay = (u * M.ledger_rows_per_unwatched_hero_min + w * M.ledger_rows_per_unwatched_hero_min * (M.settles_per_min_watched / M.settles_per_min_unwatched)) * 1440;
  const ledgerGbDay = ledgerRowsDay * M.ledger_bytes_per_row / 1e9;
  const rtEvents = w * M.frames_per_watched_hero_min / 60 + (n * M.global_chat_lines_per_player_hour / 3600) * n;   // a global line is delivered to every client
  return {
    heroes: n, watched: Math.round(w),
    db_cores_needed: +cores.toFixed(2), micro_db_saturated: cores > M.micro_cores * M.usable_core_fraction,
    frame_disk_gb_per_hour: +frameDiskGbH.toFixed(2), frame_steady_disk_gb: +(frameDiskGbH * 24 * M.realtime_partition_days).toFixed(1),
    hours_to_disk_full_from_now: frameDiskGbH > 0 ? +(((M.disk_total_gb * M.autoscale_at) - M.disk_used_gb) / frameDiskGbH).toFixed(1) : null,
    frame_egress_gb_per_day: +(frameEgressGbH * 24).toFixed(1),
    ledger_rows_per_day: Math.round(ledgerRowsDay), ledger_gb_per_day: +ledgerGbDay.toFixed(2), ledger_gb_at_retention: +(ledgerGbDay * M.ledger_retain_days).toFixed(0),
    ledger_prune_keeps_up: ledgerRowsDay <= M.ledger_prune_rows_per_day,
    realtime_connections_over_limit: n > M.rt_max_concurrent, realtime_events_per_s: +rtEvents.toFixed(1), realtime_events_over_limit: rtEvents > M.rt_max_events_per_s,
  };
}
/* THE DISK, SIMULATED: from today's used/total, frames + ledger landing at the steady rate of N heroes, the
   documented autoscale (+50 % at 90 %, then a cooldown) — the hour the volume is FULL (the database goes read-only),
   or null if it survives 72 h. `startGb` lets the same run price a pre-sized volume (Pro includes 8 GB). */
function diskFullHour(n, watchedShare, startGb) {
  const r = at(n, watchedShare);
  const rate = r.frame_disk_gb_per_hour + r.ledger_gb_per_day / 24;
  let size = startGb || M.disk_total_gb, used = M.disk_used_gb, ready = 0;
  for (let h = 0; h <= 72; h += 0.1) {
    used += rate * 0.1;
    if (used >= size) return +h.toFixed(1);
    if (used >= size * M.autoscale_at && h >= ready) { size *= 1 + M.autoscale_growth; ready = h + M.autoscale_cooldown_h; }
  }
  return null;
}
const first = (pred) => { for (let n = 1; n <= 5000; n++) if (pred(n)) return n; return null; };
const share = 0.4;   // ASSUMED: 40 % of hunting heroes have an open, viewed hunt tab at the playtest
const res = {
  inputs: M, watched_share_assumed: share,
  at: [20, 50, 100, 500, 2000].map((n) => Object.assign(at(n, share), { disk_full_hour_2gb: diskFullHour(n, share), disk_full_hour_8gb: diskFullHour(n, share, 8) })),
  first_break: {
    disk_full_within_72h_heroes_2gb: first((n) => diskFullHour(n, share) !== null),
    disk_full_within_72h_heroes_8gb: first((n) => diskFullHour(n, share, 8) !== null),
    db_cpu_micro_heroes: first((n) => at(n, share).micro_db_saturated),
    realtime_events_heroes: first((n) => at(n, share).realtime_events_over_limit),
    realtime_connections_players: M.rt_max_concurrent + 1,
    disk_90pct_within_6h_heroes: first((n) => { const h = at(n, share).hours_to_disk_full_from_now; return h !== null && h < M.autoscale_cooldown_h; }),
    ledger_prune_falls_behind_heroes: first((n) => !at(n, share).ledger_prune_keeps_up),
    edge_cpu_body_of_12_party4_90s_ms: M.hunt_body_max * M.engine_cpu_ms_party4_90s,
  },
};
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(res, null, 1));
console.table(res.at);
console.log(JSON.stringify(res.first_break, null, 1));
