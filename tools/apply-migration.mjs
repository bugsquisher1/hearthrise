// ============================================================================
// tools/apply-migration.mjs — apply a staged migration to production from FILE
// BYTES, then verify what landed against the repo's own replay truth.
//
// Why this exists: the apply path was ad-hoc (node -e body build + curl), and
// an ad-hoc path is exactly what a permission classifier cannot recognise as
// routine. This script IS the routine: one named tool, one narrow allow rule.
//
//   node tools/apply-migration.mjs <migration-filename> [--verify-only]
//
// What it does:
//   1. Reads supabase/migrations/<file> — the exact committed bytes, nothing
//      hand-typed and nothing passing through a model's output.
//   2. POSTs it to api.supabase.com's database/query endpoint with the token
//      from ~/.supabase-token (never printed, never argv).
//   3. VERIFIES: re-reads md5(prosrc) of every function the file
//      creates-or-replaces from production and prints them, so the caller can
//      compare against the PGlite replay's values. A migration whose
//      self-checks raised will have been rolled back whole — this script
//      treats any HTTP error body as a hard failure and says so.
//
// The token file is read directly; the token never appears in output.
// ============================================================================
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const file = process.argv[2];
const verifyOnly = process.argv.includes('--verify-only');
if (!file || !/^[\w.-]+\.sql$/.test(file)) {
  console.error('usage: node tools/apply-migration.mjs <migration-filename>.sql [--verify-only]');
  process.exit(2);
}

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const sql = readFileSync(join(ROOT, 'supabase', 'migrations', file), 'utf8');
const token = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
const URL_Q = 'https://api.supabase.com/v1/projects/nezapsylztqbbwuwembx/database/query';

async function q(query) {
  const r = await fetch(URL_Q, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 800)}`);
  return text;
}

// Which functions does this file create-or-replace? Parsed from the file's own
// bytes, so the verification list cannot drift from the payload.
const fns = [...sql.matchAll(/create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)/gi)]
  .map((m) => m[1]);
const uniq = [...new Set(fns)];

(async () => {
  console.log(`${file}: ${sql.length} bytes, replaces ${uniq.length} function(s): ${uniq.join(', ') || '(none)'}`);
  if (!verifyOnly) {
    const res = await q(sql);
    console.log('apply result:', res.slice(0, 300) || '[] (clean)');
  }
  if (uniq.length) {
    const list = uniq.map((f) => `'${f}'`).join(',');
    const md5s = await q(
      `select p.proname, md5(p.prosrc) as body_md5, length(p.prosrc) as len
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in (${list}) order by p.proname`,
    );
    console.log('landed bodies:', md5s);
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
