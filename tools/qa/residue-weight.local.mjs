#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/qa/residue-weight.local.mjs — WHAT THE SERVER RESIDUE WEIGHS IN EVERY ENVELOPE (lane/a-hunt-path-baseline, 2026-11-10).
//
//   node tools/qa/residue-weight.local.mjs [--json out.json]
//
// The 11-09 audit (part 2, F4): `client_state` is a DENY list on the server, capped at 256 KiB a hero, and hr_state_of
// ships the whole bag in every envelope, while the allowlist (RESIDUE_FIELDS, src/session/residue.js) lives only in the
// browser. This puts numbers on it, on tools/qa/local-world.mjs (the real chain, the real engine, no production):
//   1. a new account and hero through the real RPCs, its hr_load and hr-accrue answers weighed;
//   2. the SAME account puts a key that is on no allowlist (hr_put_client_state, as `authenticated`, its own token),
//      at growing sizes, and every answer is weighed again: what the server kept, what it sends back, what the
//      browser's own residueOf() keeps of it;
//   3. the allowlist's own ceiling: every field filled to its sanitizer's bound, weighed.
// Bytes are exact. The milliseconds are this machine's (PGlite in WASM): read the ratio, not the number.
// mutant-anchors: none — a manual measuring tool, not a CI guard
// ════════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { openWorld } from './local-world.mjs';

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const PASSWORD = 'local-world-password';
const EMAIL = 'residue@local-world.test';
const bytes = (v) => Buffer.byteLength(typeof v === 'string' ? v : JSON.stringify(v === undefined ? null : v));
const median = (a) => { const v = a.slice().sort((x, y) => x - y); return Math.round(v[Math.floor(v.length / 2)] * 10) / 10; };

const world = await openWorld({ tickMs: false });
const out = { tool: 'residue-weight', at: new Date().toISOString() };
let code = 0;
try {
  const post = async (path, body, token) => {
    const t = performance.now();
    const res = await fetch(world.origin + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
    const buf = Buffer.from(await res.arrayBuffer());
    let body2 = null;
    try { body2 = JSON.parse(buf.toString('utf8')); } catch { /* not JSON */ }
    return { status: res.status, bytes: buf.length, ms: performance.now() - t, body: body2 };
  };
  await post('/auth/v1/signup', { email: EMAIL, password: PASSWORD });
  const token = (await post('/auth/v1/token?grant_type=password', { email: EMAIL, password: PASSWORD })).body.access_token;
  const rpc = (fn, a) => post('/rest/v1/rpc/' + fn, a, token);
  const made = await rpc('hr_create_hero', { p_slot: 0, p_name: 'Weigher', p_colors: { head: 0, body: 0, legs: 0, feet: 0 }, p_idem: randomUUID() });
  if (!made.body || made.body.ok !== true) throw new Error('hr_create_hero: ' + JSON.stringify(made.body));
  const fresh = () => world.db.query('delete from public.hr_rate_counters');

  const { residueOf, RESIDUE_FIELDS, BAG_SEEN_MAX, STORE_SEEN_MAX, ALERTS_SEEN_MAX, COACH_READ_MAX } = await import('../../src/session/residue.js');

  async function weigh(label) {
    await fresh();
    const loads = [];
    for (let i = 0; i < 5; i++) loads.push(await rpc('hr_load', { p_slot: 0 }));
    const env = loads[0].body || {};
    const hello = await post('/functions/v1/hr-accrue', { slot: 0 }, token);
    const stored = (await world.db.query(`select octet_length(client_state::text) as n from public.player_state where slot = 0`)).rows[0];
    return { label, hrLoadBytes: loads[0].bytes, hrLoadMsMedian: median(loads.map((l) => l.ms)), clientStateBytesInEnvelope: bytes(env.client_state || {}),
      residueShare: Math.round(bytes(env.client_state || {}) / loads[0].bytes * 1000) / 10 + '%',
      storedBytes: stored ? Number(stored.n) : null, browserKeepsBytes: bytes(residueOf(env.client_state || {})), browserKeepsKeys: Object.keys(residueOf(env.client_state || {})),
      helloBytes: hello.bytes, helloCarriesClientState: !!(hello.body && 'client_state' in hello.body), helloStatus: hello.status };
  }

  out.rows = [await weigh('new hero, nothing put')];
  out.puts = [];
  for (const kib of [4, 32, 128, 250, 300]) {
    await fresh();
    const put = await rpc('hr_put_client_state', { p_slot: 0, p_patch: { not_on_any_allowlist: 'x'.repeat(kib * 1024) }, p_idem: randomUUID() });
    out.puts.push({ kib, status: put.status, answer: put.body && typeof put.body === 'object' ? { ok: put.body.ok, error: put.body.error ?? null, bytes: put.body.bytes ?? null, cap: put.body.cap ?? null } : put.body });
    if (put.body && put.body.ok === true) out.rows.push(await weigh('after a ' + kib + ' KiB key on no allowlist'));
  }

  /* THE ALLOWLIST'S OWN CEILING: every field at its sanitizer's bound (the ids as long as the patterns allow). */
  const id = (n, i) => ('i' + String(i).padStart(4, '0')).padEnd(n, 'a');
  const seen = (max) => Object.fromEntries(Array.from({ length: max }, (_, i) => [id(64, i), [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - i]]));
  const full = {
    hudLayout: Object.fromEntries(['a', 'b', 'c', 'd'].map((c) => [c.repeat(16), Object.fromEntries(Array.from({ length: 48 }, (_, i) => [id(32, i), { anchor: 'tl', dx: -4096, dy: -4096, opacity: 0.4123456789, visible: false, folded: false }]))])),
    combatText: Object.fromEntries(Array.from({ length: 32 }, (_, i) => [id(32, i), { regular: false, boss: false }])),
    combatLog: { off: Array.from({ length: 32 }, (_, i) => id(32, i)), scope: 'party' },
    bagSeen: seen(BAG_SEEN_MAX), storeSeen: seen(STORE_SEEN_MAX),
    bagView: { cat: id(32, 1), sort: id(32, 2), advanced: true }, storeView: { cat: id(32, 1), sort: id(32, 2) }, marketView: { cat: id(32, 1), sort: id(32, 2), deliver: 'storage', source: 'storage' },
    marketSeen: Number.MAX_SAFE_INTEGER,
    alerts: { off: Array.from({ length: 16 }, (_, i) => id(32, i)), seen: Array.from({ length: ALERTS_SEEN_MAX }, (_, i) => 'abcdefgh:' + String(i).padStart(4, '0').padEnd(120, 'a')) },
    awaySeen: { s: 's'.repeat(64), at: Number.MAX_SAFE_INTEGER, xp: Number.MAX_SAFE_INTEGER, gold: Number.MAX_SAFE_INTEGER, kills: Number.MAX_SAFE_INTEGER, sx: Number.MAX_SAFE_INTEGER, n: Number.MAX_SAFE_INTEGER },
    winSize: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [id(32, i), [4096, 4096]])),
    panelAlpha: 100, coach: { min: true, seen: 'a'.repeat(256), read: Array.from({ length: COACH_READ_MAX }, (_, i) => id(64, i)), back: 'b'.repeat(64) },
    townZoom: { z: 2, at: Number.MAX_SAFE_INTEGER }, shareReplay: { on: true, at: Number.MAX_SAFE_INTEGER }, idleMotion: { on: true, at: Number.MAX_SAFE_INTEGER },
  };
  const kept = residueOf(full);
  out.allowlist = { fields: RESIDUE_FIELDS.length, ceilingBytesWithoutSummaries: bytes(kept),
    byField: Object.fromEntries(Object.entries(kept).map(([k, v]) => [k, bytes(v)]).sort((a, b) => b[1] - a[1])),
    note: 'huntSummaries is left out of the ceiling (its cards are built from server sections; the main baseline reports their real size)' };
  /* 256 KiB under the deny list; the allowlist's own total from 2027-04-02-residue-allowlist.sql on (there a key on no
     allowlist is refused whole, and `puts` above records that answer instead of a stored weight) */
  const listed = (await world.db.query("select to_regprocedure('public.hr_residue_total_bytes()') is not null as y")).rows[0].y;
  out.serverCapBytes = listed ? Number((await world.db.query('select public.hr_residue_total_bytes() as n')).rows[0].n) : 262144;
  out.serverRule = listed ? 'allowlist' : 'denylist';
  out.offsite = [...world.offsite];
} catch (e) {
  code = 1;
  out.error = String((e && e.stack) || e);
} finally {
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await world.close().catch(() => {});
}
process.exit(code);
