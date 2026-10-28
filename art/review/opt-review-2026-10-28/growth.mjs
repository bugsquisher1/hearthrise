// art/review/opt-review-2026-10-28/growth.mjs — what the live database holds, how fast it grows, what keeps it bounded.
//
//   node art/review/opt-review-2026-10-28/growth.mjs [out.json]
//
// Read-only (lib-q.mjs) and CHEAP by design: sizes from the catalog, rows from reltuples / pg_stat, history from the
// hourly public.hr_db_samples sampler. It never detoasts realtime.messages payloads (one such scan took 34.7 s on
// 2026-10-28; payload sizes are sampled from ONE row of the newest partition instead). Also: the cron schedule and its
// last-24 h run cost, the tick's own log, pg_net's response table (live rows vs bytes), disk utilisation, compute
// add-on and the Realtime tenant limits (Management API GETs).
import { writeFileSync } from 'node:fs';
import { q, api } from './lib-q.mjs';

const SQL = {
  db: `select pg_database_size(current_database()) db_b, (select setting::int from pg_settings where name = 'max_connections') max_conn,
    (select setting from pg_settings where name = 'shared_buffers') shared_buffers_8k, (select setting from pg_settings where name = 'pg_stat_statements.track') pss_track,
    (select setting from pg_settings where name = 'track_functions') track_functions, (select stats_reset from extensions.pg_stat_statements_info) pss_reset`,
  biggest: `select n.nspname || '.' || c.relname rel, pg_total_relation_size(c.oid) total_b, pg_relation_size(c.oid) heap_b, pg_indexes_size(c.oid) idx_b,
      greatest(c.reltuples, 0)::bigint est_rows, coalesce(st.n_live_tup, 0) live, coalesce(st.n_dead_tup, 0) dead, st.last_autovacuum
    from pg_class c join pg_namespace n on n.oid = c.relnamespace left join pg_stat_all_tables st on st.relid = c.oid
    where c.relkind in ('r', 'm') and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast') order by 2 desc limit 25`,
  db_by_day: `select date_trunc('day', at) d, max(db_bytes) / 1048576 max_mb, max(used_conns) max_conns,
      max((tables->'player_ledger'->>'r')::bigint) ledger_rows, max((tables->'player_ledger'->>'b')::bigint) / 1048576 ledger_mb
    from public.hr_db_samples group by 1 order by 1`,
  realtime_partitions: `select c.relname part, pg_total_relation_size(c.oid) total_b, greatest(c.reltuples, 0)::bigint est_rows
    from pg_inherits i join pg_class c on c.oid = i.inhrelid join pg_class p on p.oid = i.inhparent join pg_namespace n on n.oid = p.relnamespace
    where n.nspname = 'realtime' and p.relname = 'messages' order by 1`,
  ledger_by_day: `select date_trunc('day', at) d, count(*) n, count(distinct (user_id, slot)) chars from public.player_ledger where at > now() - interval '8 days' group by 1 order by 1`,
  ledger_kinds_1d: `select kind, count(*) n from public.player_ledger where at > now() - interval '1 day' group by 1 order by 2 desc`,
  hunt_seat_hours: `with d as (select generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') d)
    select d.d, (select round(sum(extract(epoch from least(coalesce(s.ended_at, now()), d.d + interval '1 day') - greatest(s.entered_at, d.d)) / 3600)::numeric, 1)
      from public.hunt_sessions s where s.entered_at < d.d + interval '1 day' and coalesce(s.ended_at, now()) > d.d) seat_hours from d order by 1`,
  cron_24h: `select j.jobname, j.schedule, count(*) runs, round(avg(extract(epoch from d.end_time - d.start_time)) * 1000) avg_ms,
      round(max(extract(epoch from d.end_time - d.start_time)) * 1000) max_ms, sum((d.status <> 'succeeded')::int) failed
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid where d.start_time > now() - interval '24 hours' group by 1, 2 order by 3 desc`,
  tick_log_24h: `select outcome, count(*) n, round(avg(rostered)::numeric, 2) avg_rostered, max(rostered) max_rostered, round(avg(ms)) avg_ms, max(ms) max_ms
    from public.hr_tick_cron_log where at > now() - interval '24 hours' group by 1`,
  pg_net: `select (select count(*) from net._http_response) live_rows, (select coalesce(sum(octet_length(content)), 0) from net._http_response) content_b,
      pg_total_relation_size('net._http_response') total_b, (select last_autovacuum from pg_stat_all_tables where relid = 'net._http_response'::regclass) last_autovacuum,
      (select n_tup_ins from pg_stat_all_tables where relid = 'net.http_request_queue'::regclass) requests_ever`,
  hot_catalog_scans: `select relname, n_live_tup live, seq_scan, seq_tup_read, idx_scan from pg_stat_user_tables where schemaname = 'public' order by seq_scan desc limit 12`,
  frame_sample: `with m as (select payload from realtime.messages where inserted_at > now() - interval '2 days' and event = 'frame' order by inserted_at desc limit 1)
    select octet_length(m.payload::text) total_b, (select json_object_agg(k, octet_length(v::text)) from jsonb_each(m.payload->'env') e(k, v)) env_section_bytes from m`,
};

const res = { at: new Date().toISOString() };
for (const [k, sql] of Object.entries(SQL)) { try { res[k] = await q(sql); } catch (e) { res[k] = { error: e.message.slice(0, 200) }; } }
for (const [k, p] of [['disk_util', '/config/disk/util'], ['disk', '/config/disk'], ['realtime_config', '/config/realtime'], ['addons', '/billing/addons']]) {
  try { const r = await api(p); res[k] = k === 'addons' ? (r.selected_addons || []) : r; } catch (e) { res[k] = { error: e.message.slice(0, 200) }; }
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(res, null, 1));
console.log(JSON.stringify({ db: res.db, disk_util: res.disk_util, realtime: res.realtime_config, pg_net: res.pg_net, frame: res.frame_sample }, null, 1));
