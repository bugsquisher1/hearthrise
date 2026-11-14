import { bootReplay } from './schema-replay.mjs';
import { readFileSync } from 'node:fs';
const FILE = 'supabase/migrations/2027-04-22-target-kind.sql';
const md5 = async (db) => (await db.query("select md5(regexp_replace(pg_get_functiondef('public.hr_hunt_instance_read(uuid,integer)'::regprocedure), '[[:space:]]+', ' ', 'g')) m")).rows[0].m;
const { db } = await bootReplay({ upTo: '2027-04-21-tally-tier7-names.generated.sql' });
const pre = await md5(db);
console.log('pre', pre);
let sql = readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');
const pins = /v_md5 not in \('([0-9a-f]{32})', '([0-9a-f]{32})'\)/.exec(sql);
sql = sql.replace(pins[1], pre);
const notices = [];
db.onNotice?.((n) => notices.push(n.message));
try { await db.exec(sql); } catch (e) { console.log('FIRST APPLY FAILED', e.message); process.exit(1); }
const post = await md5(db);
console.log('post', post);
const dump = async () => JSON.stringify((await db.query("select p.proname, md5(pg_get_functiondef(p.oid)) m from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('hr_hunt_instance_read','hr_hunt_target_kind_set','hr_hunt_target_kind_view') order by 1")).rows);
const a = await dump();
const sql2 = sql.replace(pins[2], post);
try { await db.exec(sql2); } catch (e) { console.log('SECOND APPLY FAILED', e.message); process.exit(1); }
console.log('second apply byte-identical:', a === await dump());
