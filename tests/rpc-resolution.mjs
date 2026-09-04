#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/rpc-resolution.mjs — THE POSTGREST RPC RESOLUTION GATE
//
// WHY THIS EXISTS
// The A9 retrofit in 2026-08-11-authenticated-surface-lockdown.sql renamed 35
// live RPC bodies to `<name>__ungated` and installed thin rate-gated wrappers
// in their place. Every one of those wrappers had to keep the ORIGINAL
// parameter NAMES, because PostgREST resolves a function in its schema cache on
// (name + the set of argument names) — not on types, not on position. Get one
// parameter name wrong and the RPC does not fail loudly at apply time: it
// starts answering `PGRST202 Could not find the function … in the schema cache`
// to real players, and the migration reports success.
//
// That was verified ONCE, by hand, on 2026-08-11 (41 probes, byte-identical
// before and after). Verified once is not verified. This is the same probe,
// committed, with its expected answer committed next to it, so the property is
// checked on every push instead of on the day someone remembers.
//
// WHAT THE THREE ANSWERS MEAN
//   PGRST202  → resolution FAILED. The RPC is invisible to the client. BREAKAGE.
//   42501     → resolved, then Postgres refused the anon grant. HEALTHY — this
//               is what a locked-down, authenticated-only RPC must return.
//   200       → resolved and executed (hr_leaderboard: the deliberately public
//               board). Compared on the SHAPE of the response, not its rows, so
//               players joining the leaderboard does not fail the test but a
//               changed return type does.
//
// Resolution is ROLE-INDEPENDENT, which is the whole reason an anonymous probe
// can cover the entire 35-RPC authenticated surface without minting a test
// account against production.
//
// IS THIS SAFE TO RUN AGAINST PRODUCTION? Yes, and it is meant to.
//   • 38 of the 41 calls are refused by Postgres BEFORE the function body runs.
//   • 2 are reads of the public leaderboard.
//   • 1 is a control that must NOT resolve, so that a probe which has silently
//     stopped being able to see a failure gets caught by its own test. This
//     repo has shipped six always-null probes; a control is not optional.
//   No row is written. No player data is read. The anon key is public by
//   design and already ships in src/net/supabase-bootstrap.js, so there is no
//   secret to configure and no reason for this to be skipped in CI.
//
// MAINTENANCE
//   A DELIBERATE change (a new RPC, a renamed parameter, an RPC opened to anon)
//   makes this fail. That is correct — it is the point. Re-baseline ONLY after
//   you have read the diff and agree with every line of it:
//       node tests/rpc-resolution.mjs --update-baseline
//   and commit the baseline change in the SAME commit as the migration, so the
//   review sees the client surface move.
//
// ── RETIRED SIGNATURES: FOUR ENTRIES THAT MUST STAY PGRST202 ─────────────
// Re-baselining a DROPPED RPC to "PGRST202 is expected" is only half a fix: it
// silences the diff and leaves the REPLACEMENT — the signature real players
// actually call — unprobed, which is precisely the coverage this file exists to
// hold. So each of the four keeps its retired entry AND gains its live one, and
// the retired entry is now an assertion in its own right: this call must stay
// invisible. (2026-09-04. All four had been red since the day their migration
// landed, unseen because CI was red for other reasons.)
//
//   buy_listing(p_listing_id,p_qty)
//     DROPPED by 2026-08-27-clan-economy-sinks.sql:98-99, together with
//     buy_listing__ungated. It is the client-authored market buy CLAUDE.md's
//     server-authority section was written about ("buy_listing moves no value
//     server-side — the client does"); hr_market_buy replaced it and there is no
//     call site left in src/. It has NO live twin, and the retired probe earns
//     its place twice over: supabase/schema.sql:220-221 still CREATES it and
//     grants it to `authenticated`, so any rebuild or restore that replays
//     schema.sql without reaching the 2026-08-27 drop brings the old buy path
//     back. This probe is the thing that would notice.
//   clan_feast_deposit(p_clan_id,p_heals)
//     DROPPED by 2026-08-27-clan-economy-sinks.sql:261-262; §362 creates
//     clan_feast_deposit(p_clan_id, p_item_id, p_qty, p_slot default 0). The old
//     contract let the client mint the feast meter for free (it named the heal
//     value); the new one takes an ITEM and the server reads the heal from its
//     own catalogue. src/features/clan-seat-ui.js:729 sends the three-key form.
//   raid_claim(p_clan_id,p_scope,p_week)
//     DROPPED by 2026-08-19-muster-raid-rpc-credit.sql:87-88; §423 creates
//     raid_claim(p_scope, p_clan_id, p_week, p_slot) so the chest is credited to
//     a NAMED character server-side. src/features/raids.js:960 sends all four.
//   world_event_claim(p_day_key)
//     DROPPED by 2026-08-19-muster-raid-rpc-credit.sql:89-90; §413 creates
//     world_event_claim(p_day_key, p_slot), same reason.
//     src/features/muster.js:1010 sends both.
//
// hr_leaderboard's 200-shape gained `available` in the same period:
// 2026-08-18-leaderboard-server-source.sql:441/491 (Security condition S2 — the
// boards stopped ranking the client-authored save blob) answers an unsourced
// board with ok+empty+`available:false` so the screen can hide the chip. It is
// an ADDITIVE key on a deliberately public read; both hr_leaderboard entries
// move together, which is itself the evidence that it is the function and not
// one call shape.
//
// Usage:
//   node tests/rpc-resolution.mjs                  # check against the baseline
//   node tests/rpc-resolution.mjs --update-baseline
//   node tests/rpc-resolution.mjs --json           # machine-readable result
// ════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TARGETS_PATH  = path.join(HERE, 'rpc-resolution.targets.json');
const BASELINE_PATH = path.join(HERE, 'rpc-resolution.baseline.json');

const argv = process.argv.slice(2);
const UPDATE = argv.includes('--update-baseline');
const AS_JSON = argv.includes('--json');

// ── Config comes from the shipped client, not from a second copy ─────────
// A duplicated URL/key is a drift generator: the probe would keep passing
// against a project the game no longer talks to. Read the values the browser
// actually uses. Env vars override, for a branch database.
function readClientConfig() {
  if (process.env.HR_SUPABASE_URL && process.env.HR_ANON) {
    return { url: process.env.HR_SUPABASE_URL, anonKey: process.env.HR_ANON, from: 'env' };
  }
  const p = path.join(ROOT, 'src', 'net', 'supabase-bootstrap.js');
  const src = fs.readFileSync(p, 'utf8');
  const url = /url:\s*'([^']+)'/.exec(src);
  const key = /anonKey:\s*'([^']+)'/.exec(src);
  if (!url || !key) {
    throw new Error('could not read DEFAULT_CONFIG {url, anonKey} out of ' + p +
      ' — if the shape of that file changed, fix this reader rather than hardcoding a second copy');
  }
  return { url: url[1], anonKey: key[1], from: 'src/net/supabase-bootstrap.js' };
}

// ── The probe. Identical logic to the 2026-08-11 hand run. ───────────────
async function probe(cfg, targets) {
  const out = {};
  for (const [name, body] of targets) {
    const key = name + '(' + Object.keys(body).sort().join(',') + ')';
    try {
      const res = await fetch(cfg.url.replace(/\/+$/, '') + '/rest/v1/rpc/' + name, {
        method: 'POST',
        headers: {
          apikey: cfg.anonKey,
          Authorization: 'Bearer ' + cfg.anonKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let j = null; try { j = JSON.parse(text); } catch { /* non-JSON body */ }
      const code = j && j.code ? j.code : (res.ok ? 'OK' : 'nocode');
      // For the 200 path record a SHAPE fingerprint, never the payload, so the
      // baseline is stable as rows change and unstable as the contract changes.
      let shape = '';
      if (res.ok) {
        if (Array.isArray(j)) shape = 'array[' + (j.length ? 'of ' + Object.keys(j[0] ?? {}).sort().join(',') : 'empty') + ']';
        else if (j && typeof j === 'object') shape = 'obj{' + Object.keys(j).sort().join(',') + '}';
        else shape = typeof j;
      }
      out[key] = { status: res.status, code, shape };
    } catch (e) {
      out[key] = { status: -1, code: 'FETCH_ERR', shape: '', msg: String(e).slice(0, 140) };
    }
  }
  return out;
}

const targets = JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf8'));
const cfg = readClientConfig();
const live = await probe(cfg, targets);

// A network outage must NOT read as "the surface changed" — it reads as
// "this test could not run", which is a different failure with a different fix.
const fetchErrors = Object.entries(live).filter(([, v]) => v.code === 'FETCH_ERR');
if (fetchErrors.length) {
  console.error('RPC RESOLUTION: could not reach ' + cfg.url + ' (' + fetchErrors.length + '/' +
    targets.length + ' calls failed at the socket). This is an INFRASTRUCTURE failure, not a ' +
    'resolution regression — the surface was not measured.');
  console.error('  first error: ' + fetchErrors[0][1].msg);
  process.exit(2);
}

// THE CONTROL. If the non-existent function ever stops answering PGRST202 the
// probe has lost the ability to see the exact failure it exists to catch, and
// every "pass" it has ever printed is worthless.
const CONTROL = 'hr_definitely_not_a_function()';
if (live[CONTROL]?.code !== 'PGRST202') {
  console.error('RPC RESOLUTION: THE CONTROL DID NOT FIRE. ' + CONTROL + ' answered ' +
    JSON.stringify(live[CONTROL]) + ' instead of PGRST202. A probe that cannot see a ' +
    'missing function cannot certify a present one. Fix the probe before trusting any result.');
  process.exit(1);
}

if (UPDATE) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(live, null, 1) + '\n');
  console.log('baseline rewritten: ' + Object.keys(live).length + ' entries -> ' + BASELINE_PATH);
  console.log('READ THE DIFF before committing. A silently re-baselined resolution test is a ' +
    'deleted resolution test.');
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const keys = [...new Set([...Object.keys(baseline), ...Object.keys(live)])].sort();
const diffs = [];
for (const k of keys) {
  const a = baseline[k], b = live[k];
  const fa = a ? a.status + '/' + a.code + '/' + a.shape : '<not in baseline>';
  const fb = b ? b.status + '/' + b.code + '/' + b.shape : '<not probed>';
  if (fa !== fb) diffs.push({ rpc: k, expected: fa, actual: fb });
}

const counts = {};
for (const v of Object.values(live)) counts[v.code] = (counts[v.code] || 0) + 1;

if (AS_JSON) {
  console.log(JSON.stringify({ ok: diffs.length === 0, project: cfg.url, counts, diffs }, null, 1));
} else {
  console.log('RPC resolution probe — ' + cfg.url + '  (config from ' + cfg.from + ')');
  console.log('  ' + keys.length + ' RPCs probed: ' +
    Object.entries(counts).sort().map(([c, n]) => n + '× ' + c).join(', '));
  if (diffs.length === 0) {
    console.log('  PASS — every RPC resolves exactly as the committed baseline says it should.');
  } else {
    console.error('  FAIL — ' + diffs.length + ' RPC(s) changed resolution:');
    for (const d of diffs) console.error('    ' + d.rpc + '\n      expected ' + d.expected + '\n      actual   ' + d.actual);
    console.error('\n  PGRST202 in "actual" means that RPC is now INVISIBLE to the client — a live');
    console.error('  breakage for players, usually a parameter NAME that changed. If the change was');
    console.error('  deliberate, re-baseline with --update-baseline in the same commit as the migration.');
  }
}
process.exit(diffs.length === 0 ? 0 : 1);
