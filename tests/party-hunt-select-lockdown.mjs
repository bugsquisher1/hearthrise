// ============================================================================
// tests/party-hunt-select-lockdown.mjs — NO CLIENT READS party_hunt DIRECTLY
//
//   node tests/party-hunt-select-lockdown.mjs            the guard
//   node tests/party-hunt-select-lockdown.mjs --mutate   every mutant must go RED
//
// supabase/migrations/2026-10-15-party-hunt-select-lockdown.sql (Security
// GO-WITH-CHANGES #2 on party-hunt-view): party_hunt.stopped_by can carry
// 'member_unpayable:<co-member uuid>', so the table loses its client SELECT
// policy and grant; hr_party_hunt_view is the only client read of a hunt.
//
//   P-APPLY  the file applies on the replayed chain; its §4 passes (zero
//            policies, no client/engine privilege, no client invoker reads it,
//            a live member is refused 42501 and still reads via the view)
//   P-IDEM   a second apply is byte-identical
//   P-GREP   no client (src/**, index.html) or edge (supabase/functions/**)
//            CODE names party_hunt as a table: no .from('party_hunt'), no
//            /rest/v1/party_hunt, no bare `party_hunt` outside comments
//
// --mutate: two SQL mutants (the policy left in place, the grant left in
// place) must be refused by §4 on their named arm; three scanner mutants (a
// planted PostgREST, REST-URL and raw-SQL read) must be found by P-GREP.
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const MIG = '2026-10-15-party-hunt-select-lockdown.sql';
const PREV = '2026-10-15-party-hunt-view.sql';
const SQL = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
const SELF = '-- ── §4 SELF-CHECK';
if (SQL.indexOf(SELF) < 0) { console.error('harness: no §4 marker'); process.exit(2); }

/** Comment-stripped code mentions of party_hunt AS A TABLE — not _view, _start, …
    and not the refusal code `no_party_hunt`: an identifier char on either side
    makes it another name (the b569 party UI branches on that code). */
export function tableReads(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
  return [...code.matchAll(/(?<![A-Za-z0-9_])party_hunt(?![a-z_])/g)].map((m) => code.slice(Math.max(0, m.index - 30), m.index + 20));
}
async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') await walk(p, out); }
    else if (['.js', '.mjs', '.ts', '.html'].includes(extname(e.name))) out.push(p);
  }
  return out;
}
async function grepProof() {
  const files = [...await walk(join(ROOT, 'src')), ...await walk(join(ROOT, 'supabase', 'functions')), join(ROOT, 'index.html')];
  const hits = [];
  for (const f of files) {
    for (const h of tableReads(await readFile(f, 'utf8'))) hits.push(`${f.slice(ROOT.length + 1)}: …${h.replace(/\s+/g, ' ')}…`);
  }
  return { files: files.length, hits };
}

async function tryApply(db, sql, after) {
  await db.exec('begin;');
  try { await db.exec(sql); if (after) return await after(); return null; }
  catch (e) { return String(e.message).split('\n')[0]; }
  finally { await db.exec('rollback;'); }
}

let db;
try { ({ db } = await bootReplay({ upTo: PREV })); } catch (e) {
  console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2);
}

if (!MUTATE) {
  console.log('\nparty-hunt-select-lockdown: no client reads party_hunt directly');
  const red = [];
  const err = await tryApply(db, SQL, async () => {
    const inv1 = JSON.stringify(await inventory(db));
    console.log('  ✓ P-APPLY — applied; §4 passed (k-policy, k-priv, k-invoker, k-read, hygiene)');
    try { await db.exec(SQL); } catch (e) { return `P-IDEM: the second apply RAISED: ${String(e.message).split('\n')[0]}`; }
    if (JSON.stringify(await inventory(db)) !== inv1) return 'P-IDEM: the second apply moved the schema';
    console.log('  ✓ P-IDEM — a second apply is byte-identical');
    return null;
  });
  if (err) { red.push(err.startsWith('P-') ? err.split(':')[0] : 'P-APPLY'); console.log(`  ✗ ${err}`); }
  const g = await grepProof();
  if (g.hits.length) { red.push('P-GREP'); console.log(`  ✗ P-GREP — code reads party_hunt directly:\n    ${g.hits.join('\n    ')}`); }
  else console.log(`  ✓ P-GREP — ${g.files} client/edge files; party_hunt appears as a table only in comments`);
  await db.close();
  console.log(red.length ? `\nRED: ${red.join(', ')}` : '\nGREEN: the co-member uuid in stopped_by has no client door');
  process.exit(red.length ? 1 : 0);
}

const MUTANTS = [
  { name: 'policyKept', why: 'the member SELECT policy survives (the uuid door stays open)', expect: /§4 k-policy/,
    find: 'drop policy if exists "party hunt readable by live members" on public.party_hunt;\n',
    repl: '' },
  { name: 'grantKept', why: 'the policy goes but authenticated keeps SELECT', expect: /§4 k-priv/,
    find: '\nrevoke select on public.party_hunt from anon, authenticated;\n',
    repl: '\nrevoke select on public.party_hunt from anon;\n' },
  { name: 'clientReadPlanted', why: 'a client file reads the table through PostgREST', expect: /P-GREP/, js: true,
    src: "export async function hunt(sb) { return sb.from('party_hunt').select('*'); }\n" },
  { name: 'restReadPlanted', why: 'a client fetches the table over REST by URL', expect: /P-GREP/, js: true,
    src: "export const u = base + '/rest/v1/party_hunt?select=stopped_by';\n" },
  { name: 'edgeSqlPlanted', why: 'the edge selects the table in raw SQL', expect: /P-GREP/, js: true,
    src: "const r = await sql`select stopped_by from public.party_hunt where id = ${id}`;\n" },
];
/* The scanner's negative control: the refusal CODE is not a table read. */
if (tableReads("if (code === 'no_party_hunt') refresh();\n").length) {
  console.error('harness: tableReads flags the refusal code no_party_hunt as a table read'); process.exit(2);
}
console.log('\nparty-hunt-select-lockdown --mutate: every mutant must go RED on its named arm');
const control = await tryApply(db, SQL);
if (control) { console.error(`harness: the unmutated file is red (${control})`); process.exit(2); }
console.log(`[mutants] ${MUTANTS.length}`);
let survived = 0;
for (const m of MUTANTS) {
  let got;
  if (m.js) {
    got = !CONTROL && tableReads(m.src).length ? 'P-GREP: planted read found' : null;
  } else {
    if (SQL.split(m.find).length - 1 !== 1) { console.error(`harness: ${m.name}: anchor`); process.exit(2); }
    const mutated = CONTROL ? SQL : SQL.replace(m.find, () => m.repl);
    const cut = mutated.indexOf(SELF);
    got = await tryApply(db, mutated.slice(0, cut), async () => {
      try { await db.exec(mutated.slice(cut)); return null; } catch (e) { return String(e.message).split('\n')[0]; }
    });
  }
  const hit = got !== null && m.expect.test(got);
  console.log(`[mutant] ${m.name} ${hit ? 'caught' : 'survived'}`);
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via ${got.slice(0, 160)}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: ${got === null ? 'SURVIVED' : `red only via ${got}`}`); }
}
await db.close();
if (CONTROL) { console.log(`\nHR_MUTANT_CONTROL: nothing planted`); process.exit(survived === MUTANTS.length ? 0 : 1); }
console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length} mutants red on their named arm`);
process.exit(survived ? 1 : 0);
