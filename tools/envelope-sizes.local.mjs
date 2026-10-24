// tools/envelope-sizes.local.mjs — what the character envelope costs on the wire, per section, read-only.
// For the envelope diet (docs/planning/PRIORITY_BOARD.md "Envelope diet (2026-10-24)"): measure before cutting.
//
//   node tools/envelope-sizes.local.mjs              the frames Realtime kept (realtime.messages, ~3 days)
//   node tools/envelope-sizes.local.mjs --days 1     a shorter window
//   node tools/envelope-sizes.local.mjs --sub        also every second-level key of the object sections
//   node tools/envelope-sizes.local.mjs --hunting    only frames of a hero in an open hunt
//
// Reads the pushed frames themselves ({t:'state', frame, env}, 2026-12-25-frame-push-revive.sql): each is the whole
// hr_state_of projection a load or a settle answer carries, so a frame's section sizes ARE the envelope's. Per
// top-level section: mean / max bytes (jsonb text, what realtime.send and PostgREST serialise), share of the frame,
// and how often it changed between one frame and the next on the same topic (md5 of the section's text). Then the
// cadence (gap between consecutive frames per topic), the gzip ratio of the newest frame per topic, and which LEAF
// paths moved in the newest pair per topic (so a section that "changes every frame" because of a clock-derived
// number is told apart from one whose facts moved). SELECT-only via the Management API with ~/.supabase-token,
// inside a READ ONLY transaction, exactly like tools/char-state.local.mjs. Local tool, not in CI.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const tok = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
const argv = process.argv.slice(2);
const days = Math.max(0.05, Number(argv[argv.indexOf('--days') + 1]) || 3);
const SUB = argv.includes('--sub');
/* --hunting: only frames whose hero was IN a hunt (hunt.session present, not ended) — the case the diet is for. */
const HUNTING = argv.includes('--hunting');
async function q(sql) {
  const r = await fetch('https://api.supabase.com/v1/projects/nezapsylztqbbwuwembx/database/query', {
    method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'begin read only; ' + sql + ';', read_only: true }) });
  if (!r.ok) throw new Error((await r.text()).slice(0, 300));
  return r.json();
}
const WIN = `event = 'frame' and inserted_at > now() - interval '${days * 24} hours'`
  + (HUNTING ? ` and jsonb_typeof(payload->'env'->'hunt'->'session') = 'object' and payload->'env'->'hunt'->'session'->>'ended_at' is null` : '');
const FR = `fr as (select topic, (payload->>'frame')::bigint fv, inserted_at at, payload->'env' env, octet_length(payload::text) total
  from realtime.messages where ${WIN})`;
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const kb = (b) => (Number(b) / 1024).toFixed(1);

// ── 1. totals and cadence ──
const [tot] = await q(`with ${FR} select count(*) n, count(distinct topic) topics, round(avg(total)) avg_b, max(total) max_b,
  round(avg(octet_length(env::text))) env_b from fr`);
if (!tot || Number(tot.n) === 0) { console.log(`no frames in the last ${days} days`); process.exit(0); }
const gaps = await q(`with ${FR}, g as (select topic, extract(epoch from at - lag(at) over (partition by topic order by at)) s,
  fv - lag(fv) over (partition by topic order by at) dv from fr)
  select percentile_cont(0.5) within group (order by s) p50, percentile_cont(0.9) within group (order by s) p90,
    count(*) filter (where dv = 0) same_version, count(*) filter (where dv < 0) backwards, count(*) pairs from g where s is not null and s < 300`);
const g = gaps[0];
console.log(`Frames, last ${days} d: ${tot.n} on ${tot.topics} topics · mean ${kb(tot.avg_b)} KB (env ${kb(tot.env_b)} KB) · max ${kb(tot.max_b)} KB`);
console.log(`Cadence (pairs under 5 min apart, per topic): median ${Number(g.p50).toFixed(1)} s, p90 ${Number(g.p90).toFixed(1)} s · ${g.pairs} pairs, ${g.same_version} at the same version, ${g.backwards} backwards`);

// ── 2. per top-level section ──
const SEC = (depth) => depth === 1
  ? `select topic, fv, at, e.key k, octet_length(e.value::text) b, md5(e.value::text) h from fr, jsonb_each(fr.env) e`
  : `select topic, fv, at, e.key || '.' || s.key k, octet_length(s.value::text) b, md5(s.value::text) h
       from fr, jsonb_each(fr.env) e, jsonb_each(case when jsonb_typeof(e.value) = 'object' then e.value else '{}'::jsonb end) s`;
async function sections(depth) {
  return q(`with ${FR}, k as (${SEC(depth)}),
    l as (select *, lag(h) over (partition by topic, k order by fv, at) ph from k)
    select k, count(*) n, round(avg(b)) avg_b, max(b) max_b,
      count(*) filter (where ph is not null and ph <> h) changed, count(*) filter (where ph is not null) pairs
    from l group by k order by avg(b) desc`);
}
const envB = Number(tot.env_b);
function table(rows, title, limit) {
  console.log(`\n${title}`);
  console.log(`  ${pad('section', 34)}${lpad('mean B', 9)}${lpad('max B', 9)}${lpad('share', 7)}${lpad('changed', 9)}`);
  let shown = 0;
  for (const r of rows) {
    if (limit && shown++ >= limit) break;
    const rate = Number(r.pairs) ? (100 * Number(r.changed) / Number(r.pairs)).toFixed(0) + '%' : '-';
    console.log(`  ${pad(r.k, 34)}${lpad(r.avg_b, 9)}${lpad(r.max_b, 9)}${lpad((100 * Number(r.avg_b) / envB).toFixed(1) + '%', 7)}${lpad(rate, 9)}`);
  }
}
const top = await sections(1);
table(top, 'Top-level sections (changed = share of consecutive frame pairs on one topic where the section text moved):');
const changedB = top.reduce((a, r) => a + (Number(r.pairs) ? Number(r.avg_b) * Number(r.changed) / Number(r.pairs) : Number(r.avg_b)), 0);
console.log(`\n  Expected bytes per frame if only CHANGED sections were sent whole: ${kb(changedB)} KB of ${kb(envB)} KB (${(100 * changedB / envB).toFixed(0)}%)`);
if (SUB) {
  const sub = await sections(2);
  table(sub, 'Second-level keys of the object sections:', 80);
  // The same estimate with every OBJECT section cut one level deeper (its keys sent whole when they moved).
  const objects = new Set(sub.map((r) => r.k.split('.')[0]));
  const rate = (r) => (Number(r.pairs) ? Number(r.changed) / Number(r.pairs) : 1);
  const d2 = top.filter((r) => !objects.has(r.k)).reduce((a, r) => a + Number(r.avg_b) * rate(r), 0)
    + sub.reduce((a, r) => a + Number(r.avg_b) * rate(r), 0);
  console.log(`\n  ...and if every object section were cut at its second level: ${kb(d2)} KB of ${kb(envB)} KB (${(100 * d2 / envB).toFixed(0)}%)`);
}

// ── 3. gzip and leaf churn on the newest pair per topic ──
const pairs = await q(`with ${FR}, r as (select topic, fv, env, row_number() over (partition by topic order by fv desc, at desc) rn from fr)
  select topic, fv, rn, env::text j from r where rn <= 2 order by topic, rn`);
const byTopic = new Map();
for (const p of pairs) { if (!byTopic.has(p.topic)) byTopic.set(p.topic, []); byTopic.get(p.topic).push(p); }
function leaves(v, path, out) {
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) leaves(v[k], path + (Array.isArray(v) ? '[]' : '.' + k), out); }
  else out.push([path, JSON.stringify(v)]);
  return out;
}
const churn = new Map();
let gz = 0, raw = 0;
for (const [, [a, b]] of byTopic) {
  raw += Buffer.byteLength(a.j); gz += gzipSync(a.j).length;
  if (!b) continue;
  // Leaf paths with array indices folded ('[]'), counted once per path whose multiset of values moved.
  const la = new Map(), lb = new Map();
  for (const [p, v] of leaves(JSON.parse(a.j), '', [])) la.set(p, (la.get(p) || '') + v + '|');
  for (const [p, v] of leaves(JSON.parse(b.j), '', [])) lb.set(p, (lb.get(p) || '') + v + '|');
  for (const p of new Set([...la.keys(), ...lb.keys()])) if (la.get(p) !== lb.get(p)) churn.set(p, (churn.get(p) || 0) + 1);
}
console.log(`\nNewest frame per topic: ${kb(raw / byTopic.size)} KB raw, ${kb(gz / byTopic.size)} KB gzip (${(100 * gz / raw).toFixed(0)}%)`);
console.log(`Leaf paths that moved between the newest two frames (topics where it moved, of ${[...byTopic.values()].filter((x) => x[1]).length}):`);
for (const [p, n] of [...churn].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, 60)) console.log(`  ${lpad(n, 3)}  ${p}`);
