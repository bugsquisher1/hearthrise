// ════════════════════════════════════════════════════════════════════════
// tests/_sql-bodies.mjs — THE SERVER'S FUNCTIONS AS THE REPO LAST DEFINES THEM, READ AS TEXT.
//
// Shared by the guards that judge server bodies without a database (tests/refusal-words.mjs: the codes a client can
// receive; tests/catalogue-coherence.mjs C13: the items a server function compares the bag against):
//   latestBodies(root)    name -> body: each function's LAST `create or replace` in tests/schema-apply-order.json order
//   reachedFunctions(...) the functions the client's RPCs, the envelope's section views and the hr-accrue engine call,
//                         and every hr_ function their bodies call in turn
// Text, not a replay: a body built by an anchored splice (`execute v_def`) is read as its last whole definition.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const orderOf = (root) => JSON.parse(readFileSync(join(root, 'tests/schema-apply-order.json'), 'utf8')).order;
const migration = (root, f) => { try { return readFileSync(join(root, 'supabase/migrations', f), 'utf8'); } catch { return null; } };
export const jsFiles = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? jsFiles(join(d, e.name)) : /\.(js|ts)$/.test(e.name) ? [join(d, e.name)] : []));

/** The latest body of every SQL function, in apply order. */
export function latestBodies(root) {
  const last = new Map();
  for (const f of orderOf(root)) {
    const src = migration(root, f);
    if (src === null) continue;
    const re = /create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi;
    const starts = [];
    let m;
    while ((m = re.exec(src))) starts.push([m.index, m[1].toLowerCase()]);
    for (let i = 0; i < starts.length; i++) {
      const next = i + 1 < starts.length ? starts[i + 1][0] : src.length;
      /* A body ends at its closing dollar quote: a self-check `do` block after the LAST function (its pg_temp
         probes' own codes, e.g. density-bounds' probe_no_hunt) is not that function's (v0.2.28 integration). */
      const q = /\bas\s+(\$[a-z_]*\$)/i.exec(src.slice(starts[i][0], next));
      const close = q ? src.indexOf(q[1], starts[i][0] + q.index + q[0].length) : -1;
      last.set(starts[i][1], src.slice(starts[i][0], close >= 0 && close < next ? close + q[1].length : next));
    }
  }
  return last;
}

/** Every hr_ RPC the client calls by name (`rpc('hr_…'` under src/). */
export function clientRpcNames(root) {
  const rpcs = new Set();
  for (const f of jsFiles(join(root, 'src'))) for (const m of readFileSync(f, 'utf8').matchAll(/rpc\('(hr_[a-z0-9_]+)'/g)) rpcs.add(m[1]);
  return rpcs;
}

/** The envelope's section views (hr_state_sections rows) and every `public.hr_…(` the hr-accrue engine calls. */
export function serverEntryNames(root) {
  const names = new Set();
  for (const f of orderOf(root)) {
    const src = migration(root, f);
    if (src === null) continue;
    for (const m of src.matchAll(/insert into public\.hr_state_sections\s*\([^)]*\)\s*values([\s\S]*?);/g)) {
      for (const x of m[1].matchAll(/\(\s*'[a-z0-9_]+'\s*,\s*'(hr_[a-z0-9_]+)'/g)) names.add(x[1]);
    }
  }
  for (const f of jsFiles(join(root, 'supabase/functions/hr-accrue'))) for (const m of readFileSync(f, 'utf8').matchAll(/public\.(hr_[a-z0-9_]+)\s*\(/g)) names.add(m[1]);
  return names;
}

/** name -> body for every function reached from `entries` (each with its __ungated twin) through the hr_ calls in the bodies. */
export function reachedFunctions(bodies, entries) {
  const out = new Map();
  const walk = (n) => {
    if (out.has(n) || !bodies.has(n)) return;
    const b = bodies.get(n);
    out.set(n, b);
    for (const m of b.matchAll(/\b(hr_[a-z0-9_]+)\s*\(/g)) walk(m[1]);
  };
  for (const n of entries) { walk(n); walk(n + '__ungated'); }
  return out;
}
