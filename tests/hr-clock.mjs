#!/usr/bin/env node
// tests/hr-clock.mjs — the neutral server clock (src/net/hr-clock.js) that
// replaces HearthriseMuster.now() after the clean-slate demolition (2026-10-14).
//
//   node tests/hr-clock.mjs             the contract
//   node tests/hr-clock.mjs --selftest  mutation proof: a clock that trusts the
//                                       device (skew forced to 0) and one that
//                                       applies sub-threshold latency must go red
//
// Also invoked by tests/run-smoke.mjs as a preflight (hrClockGuard).
import { pathToFileURL } from 'node:url';
import { skewFrom, serverNow, MIN_SKEW_MS } from '../src/net/hr-clock.js';

function check(skew, now) {
  const p = [];
  const ok = (c, m) => { if (!c) p.push(m); };
  const T = Date.parse('2026-10-14T12:00:00.000Z');
  ok(skew(null) === 0 && skew(undefined) === 0 && skew({}) === 0, 'a missing record must read as no skew');
  ok(skew({ serverNow: 'garbage', at: T }) === 0, 'a garbage server instant must read as no skew');
  ok(skew({ serverNow: new Date(T).toISOString(), at: 'x' }) === 0, 'a garbage receive instant must read as no skew');
  ok(skew({ serverNow: new Date(T + 600000).toISOString(), at: T }) === 600000,
    'a device 10 min slow must be corrected by +600000 ms (ISO server instant)');
  ok(skew({ serverNow: T - 540000, at: T }) === -540000,
    'a device 9 min fast must be corrected by -540000 ms (numeric server instant)');
  ok(skew({ serverNow: new Date(T + MIN_SKEW_MS - 1).toISOString(), at: T }) === 0,
    'latency below the threshold must not move a healthy clock');
  // serverNow() reads the live record on globalThis.G.
  const saved = globalThis.G;
  try {
    globalThis.G = { _serverAccrual: { serverNow: new Date(Date.now() + 3600000).toISOString(), at: Date.now() } };
    const d = now() - Date.now();
    ok(d > 3590000 && d < 3610000, `serverNow() must follow G._serverAccrual (off by ${d} ms)`);
    globalThis.G = undefined;
    ok(Math.abs(now() - Date.now()) < 1000, 'serverNow() with no G must be the device clock');
  } finally { globalThis.G = saved; }
  return p;
}

export function hrClockGuard() { return check(skewFrom, serverNow); }

function selftest() {
  const mutants = [
    ['device clock trusted (skew always 0)', () => 0, () => Date.now()],
    ['sub-threshold latency applied', (r) => {
      if (!r || !Number.isFinite(Date.parse(r.serverNow) || r.serverNow)) return 0;
      const s = (typeof r.serverNow === 'number' ? r.serverNow : Date.parse(r.serverNow)) - Number(r.at);
      return Number.isFinite(s) ? s : 0;
    }, serverNow],
  ];
  let escaped = 0;
  for (const [name, sk, nw] of mutants) {
    const red = check(sk, nw).length > 0;
    console.log(`  ${red ? 'RED  ' : 'GREEN'}  ${name}`);
    if (!red) escaped++;
  }
  return escaped === 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.argv.includes('--selftest')) {
    if (!selftest()) { console.log('hr-clock selftest: a mutant escaped'); process.exit(1); }
    console.log('hr-clock selftest: every mutant was caught.');
    process.exit(0);
  }
  const p = hrClockGuard();
  if (p.length) { console.log('hr-clock — FAILED:'); for (const x of p) console.log('  x ' + x); process.exit(1); }
  console.log('hr-clock — the server clock follows the envelope, ignores latency, and degrades to the device clock.');
}
