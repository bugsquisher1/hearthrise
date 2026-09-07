// ============================================================================
// tests/no-duplicate-rpc-callers.mjs — EVERY HAND-ROLLED RPC CALLER ASKS FIRST.
//
// ── WHY THIS FILE EXISTS, AND WHY IT IS A RATCHET AND NOT A MERGE ──────────
// Six feature modules each carry their own `async function rpc(name, body)`:
// clan-seat-ui, clans, identity, leaderboards, muster, raids — plus one inline
// copy in clans.js for `clan_contribute`, and a seventh, differently-shaped one
// in src/net/account-gate.js for `beta_invite_check`. Cleanup slice 4 set out to
// fold them onto "the shared caller, HearthriseRpc". Two measurements stopped it,
// and both are why this guard freezes the shape instead of changing it.
//
//   1. HearthriseRpc IS NOT A CALLER. src/net/server-rpc.js's header argues at
//      length that it publishes the DECISION ("does this RPC exist", "may this
//      call go out") and deliberately NOT the transport, because leaderboards
//      must retry anonymously and the market must never retry a write
//      anonymously — a shared fetch would have to grow a flag per caller and
//      would be the wrong abstraction. Nothing has changed to make that untrue.
//
//   2. THE ONE THING THAT SHOULD BE SHARED CANNOT BE ADOPTED BLIND. Only
//      muster.js consults `HearthriseRpc.mayCall()` before its fetch. That gap
//      is real debt (b349: 3,196 pre-auth `hr_server_now` calls a day left with
//      the ANON key, Postgres refused every one with a 42501 nobody read, and
//      19% of all DB traffic was a question the client had no standing to ask).
//      Adopting it in the other five was TRIED on this branch and the in-page
//      suite immediately went red on b340/F5:
//
//        ✗ b340/F5: the clan browser reads the hr_clan_browser RPC, not the
//          anon-readable view — "listClans must issue exactly one request, saw 0"
//
//      `hr_clan_browser` is deliberately reachable without a live session (it is
//      the anon-SAFE replacement for the world-readable `clan_leaderboard` view,
//      and F5 asserts that an EXPIRED token must still ATTEMPT the RPC and let
//      the SERVER refuse, never silently reopen the view). `mayCall` fails
//      closed on anything outside ANON_CALLABLE, whose sole entry is
//      `hr_leaderboard`. So the adoption is not a refactor: it needs a per-RPC
//      audit of which surfaces are legitimately anonymous, a matching grant on
//      the server, a move in tests/rpc-resolution.baseline.json, and a Security
//      GO (CLAUDE.md §2 — clans, raids and leaderboards are ranked surfaces).
//      Filed as its own work item; a cleanup slice is the wrong lane for it.
//
// What this guard does, therefore, is hold the line that made the b332 incident
// expensive (FNV-1a copied into five files, one with a float multiply, silently
// deleting content for five builds): the copies may not GROW, and the list of
// them is a sentence someone has to write rather than a thing that happens.
//
// ── WHAT IT ASSERTS ─────────────────────────────────────────────────────────
//   A1  THE RATCHET. The set of hand-rolled `async function rpc(name, body)`
//       copies under src/** matches KNOWN_COPIES exactly. A seventh module must
//       say here why its auth rules need their own transport; a copy that is
//       folded away must be struck, so the list never describes dead code.
//   A2  THE DEBT IS MEASURED, NOT FORGOTTEN. `mayCall` adoption is reported as a
//       count on every run, and the guard FAILS if it ever goes DOWN — muster.js
//       is the worked example and losing it would erase the only live proof of
//       the pattern.
//   A3  THE CONTROL (--selftest). Every rule re-run against sources that break
//       it. A guard that has never been red is not a guard.
//
// Usage:  node tests/no-duplicate-rpc-callers.mjs [--list] [--selftest]
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The copies that exist today, and nothing else may join them without an edit
 *  here. `src/net/account-gate.js` is NOT one: it posts `beta_invite_check`
 *  anonymously, before a session can exist, and a session guard there would
 *  close the front door. */
export const KNOWN_COPIES = [
  'src/features/clan-seat-ui.js',
  'src/features/clans.js',
  'src/features/identity.js',
  'src/features/leaderboards.js',
  'src/features/muster.js',
  'src/features/raids.js',
];

const RPC_FN = /async\s+function\s+rpc\s*\(\s*name\s*,\s*body\s*\)\s*\{/;

/** Brace-match a function body from an index that points at its `{`. */
function bodyFrom(src, at) {
  let depth = 0;
  for (let k = at; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(at, k + 1); }
  }
  return src.slice(at);
}

/** How many copies consult mayCall() BEFORE their fetch today. It may rise; it
 *  may not fall. muster.js is the one, and it is the worked example the adoption
 *  work item will copy — deleting it would erase the only live proof. */
export const GUARD_FLOOR = 1;

export function auditSources(sources, known = KNOWN_COPIES, floor = GUARD_FLOOR) {
  const findings = [];
  const found = [];
  const guarded = [];
  for (const [file, src] of Object.entries(sources)) {
    const m = RPC_FN.exec(src);
    if (!m) continue;
    found.push(file);
    const body = bodyFrom(src, src.indexOf('{', m.index + m[0].length - 1));
    const iGuard = body.search(/mayCall\s*\(/);
    const iFetch = body.search(/\bfetch\s*\(/);
    // A guard AFTER the fetch guards nothing — that one is always a finding.
    if (iGuard >= 0 && iFetch >= 0 && iGuard > iFetch) {
      findings.push(`${file}: HearthriseRpc.mayCall() is consulted AFTER the fetch. The request has `
        + 'already left with whatever key was in the header; move it above.');
    } else if (iGuard >= 0) {
      guarded.push(file);
    }
  }
  for (const f of found) {
    if (!known.includes(f)) {
      findings.push(`${f}: a NEW hand-rolled rpc(name, body). There are already ${known.length}. `
        + 'The transport is deliberately per-caller (src/net/server-rpc.js publishes the DECISION, not the '
        + 'transport) — but a seventh copy is a decision, not an accident: add it to KNOWN_COPIES here with '
        + 'a sentence saying what its auth rules need that the others do not.');
    }
  }
  for (const k of known) {
    if (!found.includes(k)) {
      findings.push(`${k}: declared as an rpc(name, body) caller but the function is gone. If it was `
        + 'folded away, delete the row — a list that describes code nobody runs is read as one that does.');
    }
  }
  if (guarded.length < floor) {
    findings.push(`only ${guarded.length} of ${found.length} copies consult HearthriseRpc.mayCall() before `
      + `their fetch; the floor is ${floor}. muster.js is the worked example for the adoption work item — `
      + 'losing it deletes the only live proof of the b349 pattern.');
  }
  return { findings, found, guarded };
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

function loadSrc() {
  const out = {};
  for (const p of walk(join(ROOT, 'src'))) {
    out[relative(ROOT, p).replace(/\\/g, '/')] = readFileSync(p, 'utf8');
  }
  return out;
}

// ── A3 THE CONTROL ──────────────────────────────────────────────────────────
function selftest() {
  let bad = 0;
  const check = (what, ok, extra) => {
    console.log(`  ${ok ? '✓' : '✗'} ${what}`);
    if (!ok) { bad++; if (extra) console.log('      ' + extra); }
  };

  const guarded = `async function rpc(name, body) {
    var _R = window.HearthriseRpc;
    if (_R && typeof _R.mayCall === 'function' && !_R.mayCall(name, signedIn() === true)) { return null; }
    var res = await fetch(u + name, { method: 'POST' });
  }`;
  const bare = `async function rpc(name, body) {
    var res = await fetch(u + name, { method: 'POST' });
  }`;
  const late = `async function rpc(name, body) {
    var res = await fetch(u + name, { method: 'POST' });
    if (!window.HearthriseRpc.mayCall(name, true)) return null;
  }`;

  {
    const f = auditSources({ 'a.js': guarded, 'b.js': bare }, ['a.js', 'b.js'], 1).findings;
    check('passes: an UNadopted copy is debt, not a failure (the adoption needs a Security GO)',
      f.length === 0, f.join(' | '));
  }
  {
    const f = auditSources({ 'a.js': late }, ['a.js'], 0).findings;
    check('bites: a guard that runs AFTER the fetch', f.length === 1 && /AFTER the fetch/.test(f[0]), f.join(' | '));
  }
  {
    const f = auditSources({ 'a.js': bare }, ['a.js'], 1).findings;
    check('bites: the adoption FLOOR dropping (muster.js losing its guard)',
      f.length === 1 && /the floor is 1/.test(f[0]), f.join(' | '));
  }
  {
    const f = auditSources({ 'a.js': guarded, 'b.js': guarded }, ['a.js'], 1).findings;
    check('bites: a NEW, undeclared copy (the ratchet)', f.length === 1 && /NEW hand-rolled/.test(f[0]), f.join(' | '));
  }
  {
    const f = auditSources({ 'a.js': guarded }, ['a.js', 'gone.js'], 1).findings;
    check('bites: a declared copy that no longer exists', f.length === 1 && /is gone/.test(f[0]), f.join(' | '));
  }
  {
    const { found, guarded: g, findings } = auditSources(loadSrc());
    check(`not vacuous: ${found.length} real copies, ${g.length} guarded, census clean`,
      found.length === KNOWN_COPIES.length && findings.length === 0, findings.join(' | '));
  }

  if (bad) { console.error(`no-duplicate-rpc-callers --selftest: ${bad} control(s) failed.`); process.exit(1); }
  console.log('no-duplicate-rpc-callers --selftest: all controls green.');
  process.exit(0);
}

const argv = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  if (argv.includes('--selftest')) selftest();
  const { findings, found, guarded } = auditSources(loadSrc());
  if (argv.includes('--list')) {
    for (const f of found) console.log(`  ${guarded.includes(f) ? 'mayCall' : '  —    '}  ${f}`);
  }
  if (!found.length) {
    console.error('no-duplicate-rpc-callers: found NO rpc(name, body) callers — the scanner is broken, not the code.');
    process.exit(1);
  }
  if (findings.length) {
    console.error(`no-duplicate-rpc-callers — ${findings.length} problem(s):`);
    for (const f of findings) console.error('  ✗ ' + f);
    process.exit(1);
  }
  console.log(`no-duplicate-rpc-callers — ${found.length} hand-rolled rpc(name, body) caller(s), no new copy; `
    + `${guarded.length}/${found.length} consult HearthriseRpc.mayCall() before their fetch `
    + '(OPEN DEBT: adopting the other ' + (found.length - guarded.length) + ' needs a per-RPC anonymous-surface '
    + 'audit + a Security GO — hr_clan_browser is legitimately session-free and b340/F5 goes red without it).');
  process.exit(0);
}
