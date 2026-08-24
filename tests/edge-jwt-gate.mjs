#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// tests/edge-jwt-gate.mjs — IS `verify_jwt` ACTUALLY ON, ON THE LIVE FUNCTIONS?
//
// Security Engineer, 2026-08-23, open-beta audit.
//
// ── THE FINDING THIS TEST EXISTS FOR ───────────────────────────────────────
// `supabase/config.toml` pins `verify_jwt = true` for BOTH deployed functions,
// and bug-report-bridge's own file header states it as its contract:
//
//     //   POST /functions/v1/bug-report-bridge   (verify_jwt = true)
//
// On production, on 2026-08-23, it was FALSE. Measured, with a control:
//
//   POST .../functions/v1/bug-report-bridge   Authorization: Bearer aaa.bbb.ccc
//     → 400 {"ok":false,"status":"bad_request","detail":"summary_required"}
//        ...i.e. OUR FUNCTION BODY RAN for a caller holding a garbage token.
//
//   POST .../functions/v1/hr-accrue           Authorization: Bearer aaa.bbb.ccc
//     → {"code":"UNAUTHORIZED_INVALID_JWT_FORMAT","message":"Invalid JWT"}
//        ...i.e. the gateway refused it before any of our code ran.
//
// Same header, same project, two different answers. The setting is a DEPLOY-TIME
// property of whatever command somebody typed, and `config.toml` only takes
// effect if the deploy is driven through the CLI from a directory that contains
// it. Three independent statements of the truth — a config file, a code comment
// and a test that asserted the config file — and all three were describing a
// posture production did not have. THIS is the one that can tell.
//
// ── WHY THE EXISTING TEST DID NOT CATCH IT ─────────────────────────────────
// tests/accrual-engine.mjs asserts that config.toml SAYS verify_jwt = true and
// that no script in the repo carries --no-verify-jwt (never use this flag). Both are true. Neither is
// a statement about the deployed function. A file is not a deployment.
//
// ── WHAT THIS PROBE DOES, AND WHY IT IS SAFE AGAINST PRODUCTION ────────────
// One POST per function carrying a SYNTACTICALLY-VALID-BUT-GARBAGE bearer token
// (`aaa.bbb.ccc` — three dot-separated segments, so it passes any regex-shaped
// check and can only be rejected by real verification). It must be refused by
// the GATEWAY, i.e. before our code runs.
//
//   • No credential is needed: the anon key is public by design and already
//     ships in src/net/supabase-bootstrap.js. Read from there, never a copy.
//   • No row is written. On a correctly-configured function the request never
//     reaches the function body at all; on a MIS-configured one it reaches a
//     body that rejects a deliberately-empty payload at its first validation
//     step, which is exactly the observation being made.
//   • Nothing is read from any player's data.
//
// ── THE CONTROL, WHICH IS NOT OPTIONAL ─────────────────────────────────────
// "Everything was refused" also passes against a project that is paused, a
// wrong URL, a DNS failure, or a network with no egress — which would make this
// guard silently blind, the failure mode this repo has shipped six of. So the
// run ALSO makes a request that MUST succeed (the public leaderboard RPC with
// the real anon key). If the control cannot get through, the verdict is
// INCONCLUSIVE and the exit code says so, rather than a green tick.
//
// ── OFFLINE / NO-NETWORK ───────────────────────────────────────────────────
// Exits 0 with a loud SKIPPED banner when the control cannot reach the project,
// so a developer on a plane is not blocked. In CI the control does reach it, so
// a real regression is a real failure. `--strict` turns an unreachable control
// into a failure for anyone who wants that.
//
// Usage:
//   node tests/edge-jwt-gate.mjs
//   node tests/edge-jwt-gate.mjs --strict     # unreachable control = failure
//   node tests/edge-jwt-gate.mjs --json
// ════════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const STRICT = argv.includes('--strict');
const TIMEOUT_MS = 20000;

// A token that is SHAPED like a JWT and is not one. The shape matters: several
// hand-rolled checks in this codebase (including bug-report-bridge's own
// `/^Bearer\s+[\w-]+\.[\w-]+\.[\w-]+$/`) only test the shape, so a probe with a
// malformed token would be refused by the wrong thing and prove nothing.
const GARBAGE_BEARER = 'aaa.bbb.ccc';

// ── Config comes from the shipped client, never a second copy ──────────────
function readClientConfig() {
  if (process.env.HR_SUPABASE_URL && process.env.HR_ANON) {
    return { url: process.env.HR_SUPABASE_URL, anonKey: process.env.HR_ANON, from: 'env' };
  }
  const p = path.join(ROOT, 'src', 'net', 'supabase-bootstrap.js');
  const src = fs.readFileSync(p, 'utf8');
  const url = /url:\s*'([^']+)'/.exec(src);
  const key = /anonKey:\s*'([^']+)'/.exec(src);
  if (!url || !key) {
    throw new Error('could not read DEFAULT_CONFIG {url, anonKey} out of ' + p);
  }
  return { url: url[1].replace(/\/+$/, ''), anonKey: key[1], from: 'src/net/supabase-bootstrap.js' };
}

// ── The functions under test come from config.toml, not from a list here ───
// A hand-maintained list is how a NEW function ships ungated and unnoticed: it
// would simply not be on the list, and the guard would stay green while saying
// nothing about it. Parse the file that already declares the intent, and fail
// if a function directory exists with no [functions.<name>] section at all.
function functionsUnderTest() {
  const toml = fs.readFileSync(path.join(ROOT, 'supabase', 'config.toml'), 'utf8');
  const declared = new Map();
  // Split on section headers rather than a lookahead: JavaScript has no \Z, and
  // a `(?=^\[|\Z)` lookahead silently treats the Z as a literal, which drops the
  // LAST section in the file. That is precisely the "the guard checked n-1 of n
  // and reported green" shape — caught here by the probe disagreeing with the
  // directory listing, which is why the two sources are cross-checked at all.
  const sections = toml.split(/^\[/m).slice(1);
  for (const sec of sections) {
    const m = /^functions\.([A-Za-z0-9_-]+)\]/.exec(sec);
    if (!m) continue;
    declared.set(m[1], /verify_jwt\s*=\s*true/.test(sec));
  }
  const dir = path.join(ROOT, 'supabase', 'functions');
  const onDisk = fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];
  return { declared, onDisk };
}

async function post(url, headers, body) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: ac.signal });
    const text = (await res.text()).slice(0, 400);
    return { status: res.status, text };
  } catch (e) {
    return { status: -1, text: String(e).slice(0, 200) };
  } finally { clearTimeout(t); }
}

// The gateway's refusal is recognisable and is DIFFERENT from any refusal our
// own code produces. Matching on it (rather than on "status >= 400") is what
// separates "the gateway stopped it" from "our body ran and disliked the
// payload" — which is the entire distinction this test was written to make.
function gatewayRefused(r) {
  if (r.status !== 401 && r.status !== 403) return false;
  return /invalid jwt|missing authorization|jwt/i.test(r.text);
}

async function main() {
  const cfg = readClientConfig();
  const { declared, onDisk } = functionsUnderTest();
  const problems = [];
  const results = {};

  // ── THE CONTROL, FIRST. If this does not pass, nothing below means anything.
  const control = await post(
    cfg.url + '/rest/v1/rpc/hr_leaderboard',
    { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, 'Content-Type': 'application/json' },
    JSON.stringify({ p_board: 'total_level', p_limit: 1, p_span: 0 }),
  );
  const controlOk = control.status === 200;
  if (!controlOk) {
    const msg = `CONTROL FAILED (hr_leaderboard → ${control.status}: ${control.text}). The project is `
      + 'unreachable or paused, so "the gateway refused everything" below would be meaningless.';
    if (STRICT) {
      console.error('Edge JWT gate — ' + msg);
      process.exit(1);
    }
    console.log('Edge JWT gate — SKIPPED (no reachable project).');
    console.log('  ' + msg);
    console.log('  Run with --strict to make this a failure.');
    process.exit(0);
  }

  // ── EVERY function directory must be DECLARED in config.toml ──────────────
  for (const name of onDisk) {
    if (!declared.has(name)) {
      problems.push(`supabase/functions/${name}/ has no [functions.${name}] section in supabase/config.toml — `
        + 'an undeclared function deploys with whatever flag the deployer typed, which is how bug-report-bridge '
        + 'ended up unverified while a committed file said otherwise');
    }
  }

  // ── THE PROBE ─────────────────────────────────────────────────────────────
  for (const [name, wantsVerify] of declared) {
    const r = await post(
      cfg.url + '/functions/v1/' + name,
      {
        apikey: cfg.anonKey,
        Authorization: 'Bearer ' + GARBAGE_BEARER,
        'Content-Type': 'application/json',
      },
      '{}',
    );
    results[name] = { status: r.status, body: r.text, declared_verify_jwt: wantsVerify };

    if (r.status === -1) {
      problems.push(`${name}: the probe could not complete (${r.text}) — and the control DID reach the project, `
        + 'so this is about this function, not the network');
      continue;
    }
    if (r.status === 404) {
      problems.push(`${name}: 404 — declared in config.toml but not deployed. A function that is described in `
        + 'the repo and absent from production is a posture nobody is actually running.');
      continue;
    }
    if (!wantsVerify) {
      // Nothing in this repo declares verify_jwt = false today. If something
      // ever does, that is a decision that needs a written reason next to it,
      // not a silent pass from this test.
      problems.push(`${name}: config.toml declares verify_jwt = false (or omits it). Every player-reachable `
        + 'function in this project is authenticated; an exception needs a stated threat model, and this guard '
        + 'is not the place it gets waved through.');
      continue;
    }
    if (!gatewayRefused(r)) {
      problems.push(`${name}: A GARBAGE BEARER TOKEN ("${GARBAGE_BEARER}") WAS NOT REFUSED BY THE GATEWAY. `
        + `Got ${r.status} ${r.text} — that is our own function body answering, which means verify_jwt is OFF on `
        + `the DEPLOYED function even though supabase/config.toml pins it true. Every unauthenticated request on `
        + `the internet can now run this function's code (body read, JSON parse, outbound calls) for free. `
        + `FIX: redeploy through the CLI from the repo root so config.toml is honoured — `
        + `\`supabase functions deploy ${name}\` — or flip it in the dashboard, then re-run this test.`);
    }
  }

  if (AS_JSON) {
    console.log(JSON.stringify({ ok: problems.length === 0, control: control.status, results, problems }, null, 2));
  } else {
    console.log(`Edge JWT gate — project reachable (control 200), ${declared.size} declared function(s).`);
    for (const [n, r] of Object.entries(results)) {
      console.log(`  ${problems.some((p) => p.startsWith(n + ':')) ? '✗' : '✓'} ${n}: ${r.status} ${r.body.slice(0, 80)}`);
    }
    if (problems.length) {
      console.log('\nFAILED:');
      for (const p of problems) console.log('  ✗ ' + p);
    } else {
      console.log('\nEvery deployed Edge Function refuses a shaped-but-invalid JWT at the gateway.');
    }
  }
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => { console.error('edge-jwt-gate: ' + (e && e.stack || e)); process.exit(1); });
