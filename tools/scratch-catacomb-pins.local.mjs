// scratch (not committed): replay the chain, print each body's pin md5 (pg_get_functiondef, whitespace runs as one space)
import { bootReplay } from '../tests/schema-replay.mjs';
const upTo = process.argv[2] || undefined;
const { db, failures } = await bootReplay({ upTo, tolerant: true });
if (failures.length) { console.log('FAILURES', JSON.stringify(failures, null, 1).slice(0, 4000)); }
const sigs = process.argv.slice(3);
for (const s of sigs) {
  const r = await db.query(`select md5(regexp_replace(pg_get_functiondef($1::regprocedure), '[[:space:]]+', ' ', 'g')) m`, [s]).catch((e) => ({ rows: [{ m: 'ERR ' + e.message }] }));
  console.log(s, r.rows[0].m);
}
process.exit(0);
