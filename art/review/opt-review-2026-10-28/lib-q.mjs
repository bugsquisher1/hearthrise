// art/review/opt-review-2026-10-28/lib-q.mjs — read-only SQL through the Management API.
// Same pattern as tools/char-state.local.mjs: ~/.supabase-token read as file bytes (never printed),
// every statement wrapped in `begin read only;` and refused client-side if it names a write verb.
// Measurement-only (lane/r-opt-review). Not in CI.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const REF = 'nezapsylztqbbwuwembx';
const tok = () => readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
const WRITE = /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|call|reset|vacuum|analyze|cluster|reindex|copy|lo_import|pg_read_file|pg_ls_dir)\b/i;

export async function q(sql) {
  const bare = sql.replace(/'(?:[^']|'')*'/g, "''");
  if (WRITE.test(bare)) throw new Error('read-only queries only');
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + tok(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'begin read only; ' + sql + ';', read_only: true }) });
  const t = await r.text();
  if (!r.ok) throw new Error('database answered ' + r.status + ' ' + t.slice(0, 300));
  return JSON.parse(t);
}

export async function api(path) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}${path}`, { headers: { Authorization: 'Bearer ' + tok() } });
  const t = await r.text();
  if (!r.ok) throw new Error('api ' + path.slice(0, 60) + ' answered ' + r.status + ' ' + t.slice(0, 200));
  return JSON.parse(t);
}

// CLI: node lib-q.mjs <file.sql>  — ad-hoc probe, prints a table.
if (process.argv[1] && process.argv[1].endsWith('lib-q.mjs') && process.argv[2]) {
  const rows = await q(readFileSync(process.argv[2], 'utf8'));
  if (process.argv[3] === '--json') console.log(JSON.stringify(rows, null, 1)); else console.table(rows);
}
