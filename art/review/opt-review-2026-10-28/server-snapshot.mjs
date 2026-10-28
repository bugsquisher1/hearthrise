// art/review/opt-review-2026-10-28/server-snapshot.mjs — one read-only snapshot of the live DB's cost counters.
//
//   node art/review/opt-review-2026-10-28/server-snapshot.mjs <out.json>
//
// pg_stat_statements on this project has not been reset since 2026-08-17 (cumulative across old architectures),
// and resetting it is a write. So per-window cost is measured as the DIFF of two snapshots taken N minutes apart
// (server-diff.mjs). Also captures table/WAL/connection/cron/pg_net/realtime counters and the open-hunt load,
// so the diff can be normalised per active hero-minute. SELECT-only, inside `begin read only;` (lib-q.mjs).
import { writeFileSync } from 'node:fs';
import { q } from './lib-q.mjs';

const out = process.argv[2];
if (!out) { console.error('usage: server-snapshot.mjs <out.json>'); process.exit(2); }

const SQL = {
  at: `select now() at, extract(epoch from now()) epoch`,
  statements: `select s.queryid::text qid, r.rolname role, s.calls, s.total_exec_time, s.rows, s.shared_blks_hit, s.shared_blks_read,
      s.shared_blks_dirtied, s.wal_bytes, s.wal_records, left(regexp_replace(s.query, '\\s+', ' ', 'g'), 400) query
    from extensions.pg_stat_statements s join pg_roles r on r.oid = s.userid where s.calls > 0`,
  tables: `select n.nspname || '.' || c.relname rel, pg_total_relation_size(c.oid) total_b, pg_relation_size(c.oid) heap_b,
      pg_indexes_size(c.oid) idx_b, coalesce(st.n_live_tup, 0) live, coalesce(st.n_dead_tup, 0) dead, coalesce(st.n_tup_ins, 0) ins,
      coalesce(st.n_tup_upd, 0) upd, coalesce(st.n_tup_hot_upd, 0) hot_upd, coalesce(st.n_tup_del, 0) del,
      coalesce(st.seq_scan, 0) seq_scan, coalesce(st.seq_tup_read, 0) seq_tup_read, coalesce(st.idx_scan, 0) idx_scan
    from pg_class c join pg_namespace n on n.oid = c.relnamespace left join pg_stat_all_tables st on st.relid = c.oid
    where c.relkind in ('r','p','m') and n.nspname not in ('pg_catalog','information_schema','pg_toast')`,
  db: `select pg_database_size(current_database()) db_b, (select setting::int from pg_settings where name='max_connections') max_conn,
      (select count(*) from pg_stat_activity) conns, (select count(*) from pg_stat_activity where state = 'active') active,
      (select xact_commit + xact_rollback from pg_stat_database where datname = current_database()) xacts,
      (select tup_inserted + tup_updated + tup_deleted from pg_stat_database where datname = current_database()) tup_writes,
      (select blks_read from pg_stat_database where datname = current_database()) blks_read,
      (select wal_bytes from pg_stat_wal) wal_bytes, (select wal_records from pg_stat_wal) wal_records,
      (select stats_reset from extensions.pg_stat_statements_info) pss_reset`,
  conns: `select coalesce(usename, '?') usr, coalesce(application_name, '') app, coalesce(state, '') state, count(*) n
    from pg_stat_activity group by 1, 2, 3 order by n desc`,
  load: `select count(*) filter (where s.ended_at is null) open_seats, count(distinct s.instance_id) filter (where s.ended_at is null) open_instances,
      count(distinct s.user_id) filter (where s.ended_at is null) open_users from public.hunt_sessions s`,
  pgnet: `select count(*) n, coalesce(sum(octet_length(content)), 0) content_b, min(created) oldest, max(created) newest,
      count(*) filter (where status_code between 200 and 299) ok, count(*) filter (where status_code is null or status_code >= 300) bad
    from net._http_response`,
  tick_log_cols: `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'hr_tick_cron_log' order by ordinal_position`,
};

const snap = {};
for (const [k, sql] of Object.entries(SQL)) {
  try { snap[k] = await q(sql); } catch (e) { snap[k] = { error: e.message.slice(0, 300) }; }
}
writeFileSync(out, JSON.stringify(snap));
console.log(`snapshot ${snap.at?.[0]?.at} → ${out}: ${Array.isArray(snap.statements) ? snap.statements.length : 'ERR'} statements, load ${JSON.stringify(snap.load?.[0] || snap.load)}`);
for (const k of Object.keys(SQL)) if (snap[k] && snap[k].error) console.log(`  ${k}: ${snap[k].error}`);
