#!/usr/bin/env node
// Read-only audit helper (2026-11-19 server audit): boots the replayed chain (PGlite) and writes the END-STATE
// bodies of every public / hr_ops function, the tick dials, the cron jobs, the client grants and the policies to a
// directory, so the audit reads what the chain installs rather than one of 800 files. Writes nothing to any
// database but its own in-memory replay.
//
//   node tools/qa/audit-2026-11-19-server/dump-bodies.mjs <outdir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootReplay } from '../../../tests/schema-replay.mjs';

const out = process.argv[2];
if (!out) { console.error('usage: dump-bodies.mjs <outdir>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const t0 = Date.now();
const { db } = await bootReplay();
console.log('replay booted in', Date.now() - t0, 'ms');
const q = async (s, p) => (await db.query(s, p)).rows;
const fns = await q(`select p.proname, p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) as def, length(p.prosrc) as n,
                            p.prosecdef, p.proacl::text as acl
                       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname in ('public','hr_ops') and p.prokind = 'f' order by 1`);
let idx = '';
for (const f of fns) {
  idx += `${f.n}\t${f.prosecdef ? 'DEFINER' : 'invoker'}\t${f.sig}\t${f.acl || ''}\n`;
  writeFileSync(join(out, f.proname + '.sql'), f.def);
}
writeFileSync(join(out, '_index.tsv'), idx);
const dump = async (name, sql) => {
  try { writeFileSync(join(out, name), JSON.stringify(await q(sql), null, 1)); }
  catch (e) { writeFileSync(join(out, name), 'ERR ' + e.message); }
};
await dump('_tick_config.json', 'select * from public.hr_tick_config');
await dump('_cron.json', 'select jobname, schedule, command from cron.job order by jobname');
await dump('_tables.json', `select c.relname, c.relpersistence, c.relrowsecurity as rls,
   (select count(*) from pg_index i where i.indrelid = c.oid) as indexes,
   (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
   (select count(*) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as cols
   from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`);
await dump('_indexes.json', `select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1,2`);
await dump('_client_grants.json', `select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth,
   has_function_privilege('anon', p.oid, 'execute') as anon, p.prosecdef
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')) order by 1`);
await dump('_policies.json', `select c.relname, p.polname, p.polcmd, pg_get_expr(p.polqual, p.polrelid) as using_,
   pg_get_expr(p.polwithcheck, p.polrelid) as check_, p.polroles::regrole[]::text as roles
   from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' order by 1,2`);
await dump('_table_grants.json', `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
   from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated') group by 1,2 order by 1,2`);
console.log('functions:', fns.length, 'written to', out);
process.exit(0);
