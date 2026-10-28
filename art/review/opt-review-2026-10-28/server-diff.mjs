// art/review/opt-review-2026-10-28/server-diff.mjs — the cost of one window, from two server-snapshot.mjs files.
//
//   node art/review/opt-review-2026-10-28/server-diff.mjs <a.json> <b.json> [out.json]
//
// Per statement (queryid+role): calls, total ms, mean ms, rows, WAL bytes and buffer hits in the window; per table:
// inserts/updates/deletes, seq scans and bytes grown; DB-wide: transactions, tuple writes, WAL bytes. Normalised per
// open hero-minute (the load in both snapshots) so it can be projected to N concurrent hunts.
import { readFileSync, writeFileSync } from 'node:fs';

const [fa, fb, out] = process.argv.slice(2);
if (!fa || !fb) { console.error('usage: server-diff.mjs <a.json> <b.json> [out.json]'); process.exit(2); }
const A = JSON.parse(readFileSync(fa, 'utf8')), B = JSON.parse(readFileSync(fb, 'utf8'));
const secs = Number(B.at[0].epoch) - Number(A.at[0].epoch);
const mins = secs / 60;
const n = (v) => Number(v) || 0;

const key = (s) => s.qid + '|' + s.role;
const prev = new Map(A.statements.map((s) => [key(s), s]));
const stm = [];
for (const s of B.statements) {
  const p = prev.get(key(s)) || { calls: 0, total_exec_time: 0, rows: 0, wal_bytes: 0, shared_blks_hit: 0, shared_blks_read: 0 };
  const calls = n(s.calls) - n(p.calls);
  if (calls <= 0) continue;
  const ms = n(s.total_exec_time) - n(p.total_exec_time);
  stm.push({ role: s.role, calls, total_ms: +ms.toFixed(1), mean_ms: +(ms / calls).toFixed(2), rows: n(s.rows) - n(p.rows),
    wal_kb: +((n(s.wal_bytes) - n(p.wal_bytes)) / 1024).toFixed(1), blks_hit: n(s.shared_blks_hit) - n(p.shared_blks_hit),
    blks_read: n(s.shared_blks_read) - n(p.shared_blks_read), query: s.query.slice(0, 200) });
}
stm.sort((x, y) => y.total_ms - x.total_ms);
const dbMs = stm.reduce((a, s) => a + s.total_ms, 0);
for (const s of stm) s.pct = +(100 * s.total_ms / (dbMs || 1)).toFixed(1);

const tprev = new Map(A.tables.map((t) => [t.rel, t]));
const tbl = [];
for (const t of B.tables) {
  const p = tprev.get(t.rel) || {};
  const d = { rel: t.rel, ins: n(t.ins) - n(p.ins), upd: n(t.upd) - n(p.upd), hot_upd: n(t.hot_upd) - n(p.hot_upd), del: n(t.del) - n(p.del),
    seq_scan: n(t.seq_scan) - n(p.seq_scan), seq_tup_read: n(t.seq_tup_read) - n(p.seq_tup_read), idx_scan: n(t.idx_scan) - n(p.idx_scan),
    grew_kb: +((n(t.total_b) - n(p.total_b)) / 1024).toFixed(1), total_mb: +(n(t.total_b) / 1048576).toFixed(2), live: n(t.live), dead: n(t.dead) };
  if (d.ins || d.upd || d.del || d.seq_scan || d.grew_kb) tbl.push(d);
}
tbl.sort((x, y) => (y.ins + y.upd + y.del) - (x.ins + x.upd + x.del));

const db = (k) => n(B.db[0][k]) - n(A.db[0][k]);
const seats = (n(A.load[0].open_seats) + n(B.load[0].open_seats)) / 2;
const res = {
  window: { from: A.at[0].at, to: B.at[0].at, minutes: +mins.toFixed(2) },
  load: { a: A.load[0], b: B.load[0], mean_open_seats: seats },
  db: { stmt_ms: +dbMs.toFixed(0), stmt_ms_per_min: +(dbMs / mins).toFixed(0), db_busy_pct_of_one_core: +(100 * dbMs / (secs * 1000)).toFixed(2),
    xacts_per_s: +(db('xacts') / secs).toFixed(2), tup_writes_per_s: +(db('tup_writes') / secs).toFixed(2),
    wal_mb_per_hour: +(db('wal_bytes') / 1048576 / (secs / 3600)).toFixed(1), db_grew_mb: +((n(B.db[0].db_b) - n(A.db[0].db_b)) / 1048576).toFixed(2),
    max_conn: B.db[0].max_conn, conns: [A.db[0].conns, B.db[0].conns] },
  per_open_seat_minute: seats ? { stmt_ms: +(dbMs / mins / seats).toFixed(1), wal_kb: +(db('wal_bytes') / 1024 / mins / seats).toFixed(1) } : null,
  statements: stm.slice(0, 40),
  tables: tbl.slice(0, 40),
  conns: B.conns, pgnet: B.pgnet,
};
if (out) writeFileSync(out, JSON.stringify(res, null, 1));
console.log(JSON.stringify({ window: res.window, load: res.load, db: res.db, per_open_seat_minute: res.per_open_seat_minute }, null, 1));
console.table(stm.slice(0, 22).map((s) => ({ role: s.role, calls: s.calls, total_ms: s.total_ms, mean_ms: s.mean_ms, pct: s.pct, wal_kb: s.wal_kb, q: s.query.slice(0, 70) })));
console.table(tbl.slice(0, 18).map((t) => ({ rel: t.rel, ins: t.ins, upd: t.upd, hot: t.hot_upd, del: t.del, seq: t.seq_scan, seq_rows: t.seq_tup_read, grew_kb: t.grew_kb, mb: t.total_mb })));
