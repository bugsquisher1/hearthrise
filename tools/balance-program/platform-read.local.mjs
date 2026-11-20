// tools/balance-program/platform-read.local.mjs — THE PLATFORM DIVE'S PRODUCTION READ (docs/design/balance-program/28-platform.md).
//
//   node tools/balance-program/platform-read.local.mjs [read ...]   print the aggregates (Coordinator's PC only: needs ~/.supabase-token)
//
// SELECT only, each statement inside `begin read only` with read_only:true (the gate of real-players.local.mjs, restated below
// because importing that file runs its whole read). The token is read as file bytes and never printed. Every read is an AGGREGATE:
// no account id, hero name or session id is selected, and query texts from pg_stat_statements are cut to their first 70 characters
// (function names, no values: the game calls functions with parameters). Nothing is written to disk.
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

const REAL = `not exists (select 1 from hr_access_allowlist a where a.user_id = l.user_id and a.note like 'QA%')
  and not exists (select 1 from hr_gm_accounts g where g.user_id = l.user_id)`;
const HOURS = `sum((meta->>'ms')::numeric) / 3600000`;
const READS = {
  database: `select pg_database_size(current_database()) bytes, (select count(*) from profiles) profiles,
    (select count(*) from player_state) heroes, now() at time zone 'utc' read_at`,
  tables: `select n.nspname || '.' || c.relname t, pg_total_relation_size(c.oid) bytes, c.reltuples::bigint est_rows
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in ('public','hr_ops','net','cron','realtime')
    order by 2 desc limit 28`,
  ledger_days: `select (at at time zone 'utc')::date::text d, count(*) n, count(*) filter (where intent = 'accrue' and kind = 'combat') combat_accrue,
    count(distinct (user_id, slot)) heroes from player_ledger group by 1 order by 1`,
  ledger_kinds: `select kind, intent, count(*) n, round(avg(pg_column_size(l.*))) row_bytes from player_ledger l group by 1, 2 order by 3 desc limit 30`,
  ledger_real: `select count(*) n, count(*) filter (where intent = 'accrue' and kind = 'combat') combat_accrue,
    count(distinct (user_id, slot)) heroes from player_ledger l where ${REAL}`,
  /* journal rows an hour of the work they pay, by day: the settle rate real heroes ran at (36 an hour away, 198 watched) */
  ledger_rate: `select (at at time zone 'utc')::date::text d, kind, count(*) n, round(${HOURS}, 1) hero_hours,
    round(count(*) / nullif(${HOURS}, 0), 1) rows_a_hero_hour, count(distinct session_id) sessions
    from player_ledger l where intent = 'accrue' and kind in ('combat','gather','craft') and at > now() - interval '9 days' group by 1, 2 order by 1, 2`,
  ledger_rate_all: `select kind, count(*) n, round(${HOURS}, 1) hero_hours, round(count(*) / nullif(${HOURS}, 0), 1) rows_a_hero_hour
    from player_ledger l where intent = 'accrue' and kind in ('combat','gather','craft') group by 1`,
  /* what a hunted hour journals NOW (the rule sets before v0.2.139 wrote other rows) */
  ledger_recent: `select kind, split_part(intent, ':', 1) intent, count(*) n, round(avg(pg_column_size(l.*))) row_bytes from player_ledger l
    where at > now() - interval '5 days' group by 1, 2 order by 3 desc limit 16`,
  capacity: `select count(*) samples, round(avg(db_pct)::numeric, 2) db_avg, max(db_pct) db_max, max(tick_pct) tick_max, max(edge_pct) edge_max, max(ledger_pct) ledger_max from hr_ops.capacity_samples`,
  capacity_shape: `select (detail->>'tick_open')::int open_instances, count(*) samples, round(avg(db_pct)::numeric, 2) db_avg, max(db_pct) db_max,
    round(avg(edge_pct)::numeric, 1) edge_avg, percentile_cont(0.5) within group (order by edge_pct) edge_p50, max(edge_pct) edge_max,
    count(*) filter (where edge_pct > 50) edge_over_half, round(avg(ledger_pct)::numeric, 1) ledger_avg, max((detail->>'tick_worst_lag_s')::numeric) worst_lag_s
    from hr_ops.capacity_samples group by 1 order by 1`,
  ledger_bytes: `select count(*) n, sum(pg_column_size(l.*)) row_bytes, min(at)::date::text first_day from player_ledger l`,
  statements: `select left(regexp_replace(query, '\\s+', ' ', 'g'), 70) q, calls, round(total_exec_time) total_ms, round(mean_exec_time::numeric, 2) mean_ms,
    rows, wal_bytes from extensions.pg_stat_statements order by total_exec_time desc limit 40`,
  statements_since: `select stats_reset::text since, (select round(sum(total_exec_time)) from extensions.pg_stat_statements) total_ms,
    (select sum(calls) from extensions.pg_stat_statements) calls, (select sum(wal_bytes) from extensions.pg_stat_statements) wal_bytes,
    round(extract(epoch from (now() - stats_reset))) seconds from extensions.pg_stat_statements_info`,
  cron_day: `select j.jobname, count(*) runs, round(avg(extract(epoch from (d.end_time - d.start_time)) * 1000)) mean_ms,
    round(sum(extract(epoch from (d.end_time - d.start_time)))) total_s, count(*) filter (where d.status <> 'succeeded') failed
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid where d.start_time > now() - interval '1 day' group by 1 order by 4 desc`,
  wal: `select wal_bytes, wal_records, stats_reset::text since, round(extract(epoch from (now() - stats_reset))) seconds from pg_stat_wal`,
  hunts_now: `select count(*) filter (where ended_at is null) open_sessions, count(*) kept from hunt_sessions`,
  settings: `select name, setting, unit from pg_settings where name in ('max_connections','shared_buffers','effective_cache_size','max_worker_processes','work_mem')`,
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
