// tools/hunt-health.local.mjs — the live server's view of every open hunt, read-only, one screen.
//
//   node tools/hunt-health.local.mjs            open hunts, settle lag, rate counters, today's refusals
//   node tools/hunt-health.local.mjs --watch 15 re-read every 15 s (Ctrl+C stops)
//
// SELECT-only through the Management API with ~/.supabase-token (read as bytes, never printed),
// inside a READ ONLY transaction. Lag verdicts: tools/lib/hunt-lag.mjs (FREEZING = a WATCHED hunt past the
// 32 s look-ahead; STALLED = past the tick's own flush; an unwatched hunt's 0-100 s sawtooth is by design).
// Local tool, not in CI.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { lagVerdict, WATCHED_SQL } from './lib/hunt-lag.mjs';

const REF = 'nezapsylztqbbwuwembx';
const tok = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
const at = process.argv.indexOf('--watch');
const watchS = at >= 0 ? Math.max(5, Number(process.argv[at + 1]) || 15) : 0;

async function q(sql) {
  if (!/^\s*(select|with)\b/i.test(sql) || /\b(insert|update|delete|drop|alter|create|grant|truncate|call)\b/i.test(sql)) throw new Error('read-only queries only');
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'begin read only; ' + sql + ';', read_only: true }) });
  if (!r.ok) throw new Error('database answered ' + r.status + ' ' + (await r.text()).slice(0, 120));
  return r.json();
}

const HUNTS = `select left(i.id::text, 8) inst, i.hunt_id, i.kind, count(*) heroes,
  string_agg(left(s.user_id::text, 8) || ':' || s.slot || (case when s.leave_at is not null then ' leaving' else '' end), ' ', ) who,
  round(extract(epoch from now() - i.settled_to)) lag_s, i.world_swing, array_agg(distinct s.user_id::text) users, round(extract(epoch from now() - min(s.entered_at)) / 60) mins
  from public.hunt_sessions s join public.hunt_instances i on i.id = s.instance_id
  where s.ended_at is null group by i.id order by lag_s desc`.replace(', ' + ')', ')');
const RATE = `select left(user_id::text, 8) u, bucket, sum(n) n from public.hr_rate_counters
  where window_start > now() - interval '2 minutes' group by 1, 2 order by n desc limit 12`;
const TICK = 'select flush_seconds, cadence_seconds from public.hr_tick_config where id';
const REFUSED = `select left(user_id::text, 8) u, code, intent, sum(n) n, max(last_at) last from public.hr_rejections
  where day = current_date group by 1, 2, 3 order by last desc limit 10`;

async function once() {
  const [hunts, rate, refused, watchedRows, tick] = await Promise.all([q(HUNTS), q(RATE), q(REFUSED), q(WATCHED_SQL), q(TICK)]);
  const watching = new Set(watchedRows.map((r) => r.u));
  const cfg = { flushS: Number((tick[0] || {}).flush_seconds) || 90, cadenceS: Number((tick[0] || {}).cadence_seconds) || 10 };
  console.log(`\nHunt health at ${new Date().toLocaleTimeString()}`);
  if (!hunts.length) console.log('  no open hunts');
  for (const h of hunts) {
    const users = Array.isArray(h.users) ? h.users : String(h.users || '').replace(/[{}]/g, '').split(',');
    const v = lagVerdict({ lagS: Number(h.lag_s), watched: users.some((u) => watching.has(u)), ...cfg });
    const flag = v.code === 'ok' ? `  (${v.note})` : `  << ${v.note}`;
    console.log(`  ${h.inst} ${h.hunt_id} ${h.kind} ×${h.heroes} [${h.who}] lag ${h.lag_s}s, swing ${h.world_swing}, ${h.mins} min${flag}`);
  }
  console.log('Rate counters, last 2 min: ' + (rate.length ? rate.map((r) => `${r.u} ${r.bucket}=${r.n}`).join(' · ') : 'none'));
  console.log('Refusals today: ' + (refused.length ? '' : 'none'));
  for (const r of refused) console.log(`  ${r.u} ${r.code} (${r.intent}) ×${r.n}, last ${String(r.last).slice(11, 19)}`);
}

await once().catch((e) => { console.error('hunt-health:', e.message); process.exitCode = 1; });
if (watchS) setInterval(() => once().catch((e) => console.error('hunt-health:', e.message)), watchS * 1000);
