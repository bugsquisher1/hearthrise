// scratch (not committed): replay to argv[2], then run argv[3] section by section ("-- ── §" markers), reporting the first failure
import { readFileSync } from 'node:fs';
import { bootReplay } from '../tests/schema-replay.mjs';
const { db, failures } = await bootReplay({ upTo: process.argv[2], tolerant: true });
if (failures.length) console.log('FAILURES before', JSON.stringify(failures).slice(0, 2000));
const sql = readFileSync(process.argv[3], 'utf8').replace(/\r\n/g, '\n');
const parts = sql.split(/\n(?=-- ── §)/);
for (const p of parts) {
  const head = p.split('\n').find((l) => l.startsWith('-- ── §')) || '(header)';
  try { await db.exec(p); console.log('OK  ', head.slice(0, 90)); }
  catch (e) { console.log('FAIL', head.slice(0, 90), '\n   ', e.message, e.where ? '\n    where: ' + e.where : '', e.position ? ' pos ' + e.position : ''); if (!process.argv[4]) break; }
}
for (const s of process.argv.slice(5)) {
  const r = await db.query(`select md5(regexp_replace(pg_get_functiondef($1::regprocedure), '[[:space:]]+', ' ', 'g')) m`, [s]).catch((e) => ({ rows: [{ m: 'ERR ' + e.message }] }));
  console.log(s, r.rows[0].m);
}
process.exit(0);
