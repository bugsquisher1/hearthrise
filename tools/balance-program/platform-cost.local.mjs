// tools/balance-program/platform-cost.local.mjs — 48-platform-cost.md's PRODUCTION READ: where the database-seconds go, by statement
// and by the shape of what was hunted (lane/d-platform-cost, 2026-11-21).
//
//   node tools/balance-program/platform-cost.local.mjs [read ...]   print the aggregates (Coordinator's PC only: needs ~/.supabase-token)
//
// SELECT only, each statement inside `begin read only` with read_only:true: the gate of real-players.local.mjs, restated (importing
// that file runs its whole read; platform-read.local.mjs restates it the same way). The token is read as file bytes and never printed.
// Every read is an AGGREGATE: no account id, hero name, session id or clock time of a player is selected; query texts from
// pg_stat_statements are cut to their first 70 characters (function names: the game calls functions with parameters).
//
// THE READS, and what 48 takes from each:
//   statements   pg_stat_statements since its reset: a call's mean, spread, buffer hits and WAL (the per-call costs)
//   indexes      the indexes that read the most tuples (where the settle's hidden scans are)
//   tables_seq   the tables scanned whole most often (catalogue lookups repeated a row)
//   commits      every hunt commit of the last 14 days by party size and door (a commit's journal rows share one `at`; its
//                window's ms says watched, about 18 s, or away, about 100 s): commits a hero-hour, REAL
//   accrue       commits and hero-hours since pg_stat_statements' reset, hunts and town work: the denominators of the means
//   before       journal rows a hero already has today when it commits (what a day-budget read scans)
//   minutes      the capacity sample's database ms a minute (27 h of it) bucketed by what committed in that minute: the
//                REAL cost of a four's away commit and of a watched minute, beside an empty minute
//   frames       Realtime frames kept now against commits in the same span
//   config       the tick's own dials (cadence, flush, fold, frame_push, frame_own_s): catalogue, not player data
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const WRITE_WORDS = ['insert', 'update', 'delete', 'merge', 'truncate', 'drop', 'alter', 'create', 'grant', 'revoke', 'copy', 'call', 'do', 'commit',
  'rollback', 'begin', 'set', 'reset', 'lock', 'vacuum', 'analyze', 'refresh', 'reindex', 'comment', 'execute', 'prepare', 'notify', 'listen', 'into',
  'nextval', 'setval', 'set_config', 'pg_advisory_lock', 'dblink', 'lo_import', 'lo_export', 'pg_read_file', 'pg_terminate_backend'];
/** Why `sql` is not one plain read, or null. */
function writeProblem(sql) {
  const bare = String(sql).replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (bare.includes(';')) return 'more than one statement';
  if (!/^\s*(select|with)\b/i.test(bare)) return 'does not open with select or with';
  for (const w of WRITE_WORDS) if (new RegExp('(^|[^a-z_])' + w + '([^a-z_]|$)', 'i').test(bare)) return 'holds the word "' + w + '"';
  return null;
}
function makeQuery({ token }) {
  const scrub = (s) => String(s).split(token).join('[token]');
  return async function q(sql) {
    const why = writeProblem(sql);
    if (why) throw new Error('refused, not a plain read: ' + why);
    let r;
    try {
      r = await fetch('https://api.supabase.com/v1/projects/nezapsylztqbbwuwembx/database/query', { method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'begin read only; ' + sql + ';', read_only: true }) });
    } catch (e) { throw new Error('read failed: ' + scrub(e && e.message).slice(0, 200)); }
    if (!r.ok) throw new Error('read failed: ' + scrub(await r.text()).slice(0, 200));
    return r.json();
  };
}

/* a hunt commit: its journal rows share the transaction's `at`; `heroes` its seats, `win_ms` its window (watched about 18 s, away about 100 s) */
const COMMITS = (since) => `select l.at, count(distinct (l.user_id, l.slot)) heroes,
    percentile_disc(0.5) within group (order by (l.meta->>'ms')::numeric) win_ms, sum((l.meta->>'ms')::numeric) ms
  from public.player_ledger l where l.kind = 'combat' and l.intent = 'accrue' and l.meta ? 'ms' and l.at > ${since} group by l.at`;
const READS = {
  statements: `select left(regexp_replace(query, '\\s+', ' ', 'g'), 70) q, calls, round(total_exec_time) total_ms, round(mean_exec_time::numeric, 2) mean_ms,
    round(stddev_exec_time::numeric, 1) sd_ms, round(max_exec_time::numeric) max_ms, round(shared_blks_hit::numeric / calls) hits_a_call,
    round(wal_bytes::numeric / calls) wal_a_call, userid::regrole::text who from extensions.pg_stat_statements order by total_exec_time desc limit 45`,
  since: `select stats_reset::text since, round(extract(epoch from (now() - stats_reset))) seconds,
    (select round(sum(total_exec_time)) from extensions.pg_stat_statements) total_ms, (select sum(calls) from extensions.pg_stat_statements) calls
    from extensions.pg_stat_statements_info`,
  indexes: `select relname t, indexrelname i, idx_scan, idx_tup_read, idx_tup_fetch, round(idx_tup_read::numeric / nullif(idx_scan, 0)) read_a_scan
    from pg_stat_user_indexes order by idx_tup_read desc limit 12`,
  tables_seq: `select schemaname || '.' || relname t, seq_scan, round(seq_tup_read::numeric / nullif(seq_scan, 0)) rows_a_scan, n_live_tup
    from pg_stat_user_tables order by seq_scan desc limit 12`,
  commits: `with c as (${COMMITS("now() - interval '14 days'")})
    select heroes, case when win_ms < 40000 then 'watched' when win_ms >= 80000 then 'away' else 'between' end door, count(*) commits,
      round(sum(ms) / 3600000, 1) hero_hours, round(count(*) * heroes / nullif(sum(ms) / 3600000, 0), 1) hero_commits_a_hero_hour, round(avg(win_ms)) mean_win_ms
    from c group by 1, 2 order by 1, 2`,
  accrue: `select kind, count(*) rows_, count(distinct at) commits, round(sum((meta->>'ms')::numeric) / 3600000, 1) hero_hours,
      count(*) filter (where (meta->>'ms')::numeric < 40000) short_windows
    from public.player_ledger where intent = 'accrue' and kind in ('combat', 'gather', 'craft')
      and at > (select stats_reset from extensions.pg_stat_statements_info) group by 1 order by 1`,
  before: `with r as (select (l.meta->>'ms')::numeric ms, l.kind, l.intent,
      count(*) over (partition by l.user_id, l.slot, (l.at at time zone 'utc')::date order by l.at, l.id rows between unbounded preceding and current row) - 1 n
    from public.player_ledger l where l.at > now() - interval '7 days')
    select case when ms < 40000 then 'watched' else 'away' end door, count(*) commits_rows, round(avg(n)) mean_rows_today,
      percentile_disc(0.5) within group (order by n) p50, percentile_disc(0.9) within group (order by n) p90
    from r where kind = 'combat' and intent = 'accrue' and ms is not null group by 1 order by 1`,
  minutes: `with s as (select date_trunc('minute', at) - interval '1 minute' mi, (detail->>'db_exec_ms')::numeric db_ms
      from hr_ops.capacity_samples where detail ? 'db_exec_ms'),
    c as (${COMMITS('(select min(mi) from s)')}),
    cm as (select date_trunc('minute', at) mi, count(*) filter (where heroes = 1 and win_ms >= 40000) lone_away,
        count(*) filter (where heroes = 1 and win_ms < 40000) lone_watched, count(*) filter (where heroes > 1 and win_ms >= 40000) party_away,
        count(*) filter (where heroes > 1 and win_ms < 40000) party_watched from c group by 1),
    t as (select date_trunc('minute', at) mi, count(*) town from public.player_ledger
        where at > (select min(mi) from s) and kind in ('gather', 'craft') and intent = 'accrue' group by 1)
    select coalesce(cm.lone_away, 0) lone_away, coalesce(cm.lone_watched, 0) lone_watched, coalesce(cm.party_away, 0) party_away,
      coalesce(cm.party_watched, 0) party_watched, coalesce(t.town, 0) town_settles, count(*) minutes, round(avg(s.db_ms)) db_ms_avg,
      round(percentile_cont(0.5) within group (order by s.db_ms)) db_ms_p50
    from s left join cm on cm.mi = s.mi left join t on t.mi = s.mi group by 1, 2, 3, 4, 5 having count(*) >= 10 order by 6 desc`,
  frames: `select count(*) frames_kept, round(avg(pg_column_size(m.*))) frame_bytes_avg,
      (select count(*) from realtime.messages where inserted_at > now() - interval '1 hour') frames_last_hour,
      (select count(distinct at) from public.player_ledger where kind = 'combat' and intent = 'accrue' and at > now() - interval '1 hour') commits_last_hour
    from realtime.messages m`,
  config: `select cadence_seconds, flush_seconds, fold_windows, catchup_windows, hunt_body_max, hunt_bodies_max, hunt_body_heroes, shards,
      frame_push, frame_own_s, armed_channels from public.hr_tick_config`,
};

const token = readFileSync(join(homedir(), '.supabase-token')).toString('utf8').trim();
const q = makeQuery({ token });
const ONLY = process.argv.slice(2);
for (const [name, sql] of Object.entries(READS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  try {
    const rows = await q(sql);
    console.log('## ' + name);
    for (const r of rows) console.log(JSON.stringify(r));
  } catch (e) { console.log('## ' + name + ' FAILED: ' + String(e && e.message).slice(0, 300)); }
}
