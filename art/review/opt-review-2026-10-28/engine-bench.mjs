// art/review/opt-review-2026-10-28/engine-bench.mjs — CPU ms of the edge's own hunt settle compute, per instance window.
//
//   node art/review/opt-review-2026-10-28/engine-bench.mjs [out.json]
//
// Drives supabase/functions/hr-accrue/accrual.js accrueHunt + src/core/hunt-track.js huntTimeline (the shipped bytes,
// through tests/hunt-live.mjs HARNESS, the same seam tests/perf-budget.mjs uses) for a solo hero, a party of 2 and a
// party of 4 on millrace_sewer at density 8, over 10 s windows (a WATCHED hunt's tick cadence) and 90 s windows (the
// unwatched flush). Reports process CPU ms per commit (median and p95 after warm-up), to set against the Edge
// Function limit of 2 s CPU per request and the tick's hunt_body_max (12 instances per body). Node on this PC,
// not Deno on Supabase's edge: a relative cost, stated as such.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { HARNESS: H } = await import(pathToFileURL(join(ROOT, 'tests/hunt-live.mjs')).href);
const M = await H.load(ROOT);
const HUNT = 'millrace_sewer';
const ROLES = ['tank', 'melee_dps', 'ranger', 'melee_dps'];

function party(n) {
  const mis = [];
  for (let i = 0; i < n; i++) {
    const uid = '11111111-2222-3333-4444-' + String(555555555550 + i);
    const m = H.memberOf(M, uid, i, ROLES[i], 14);
    m.key = uid + ':0'; m.huntId = HUNT; m.hero = Object.assign({}, m.hero, { density: 8 });
    mis.push(m);
  }
  return mis;
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2); };

const out = { node: process.version, hunt: HUNT, density: 8, runs: [] };
for (const n of [1, 2, 4]) for (const windowMs of [10000, 90000]) {
  const srv = H.server(M, party(n), { hunt: HUNT });
  let t = H.T0;
  for (let i = 0; i < 3; i++) { t += windowMs; srv.commit(t); }          // warm-up (JIT, world spawn)
  const cpu = [], wall = [];
  for (let i = 0; i < 20; i++) {
    t += windowMs;
    const c0 = process.cpuUsage(), w0 = performance.now();
    srv.commit(t);
    const c = process.cpuUsage(c0);
    cpu.push((c.user + c.system) / 1000); wall.push(performance.now() - w0);
  }
  const r = { heroes: n, window_s: windowMs / 1000, cpu_ms_p50: q(cpu, 0.5), cpu_ms_p95: q(cpu, 0.95), wall_ms_p50: q(wall, 0.5),
    body_of_12_cpu_ms_p50: +(12 * q(cpu, 0.5)).toFixed(0) };
  out.runs.push(r);
  console.log(JSON.stringify(r));
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
