#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// tools/race-test.mjs — TRUE CONCURRENCY, finally raced.
//
// WHY THIS EXISTS. "True concurrency" has been the server-authority program's
// standing cutover blocker since it was first written down, and every attempt
// to close it has failed for a DIFFERENT, MEASURED reason — all recorded in
// docs/design/HANDOFF-server-authority.md:
//
//   • PGlite is ONE backend. A fuzz run there contends with nothing, so the
//     serialisation chain (advisory lock -> `for update` -> VOLATILE ledger sum
//     -> insert) is exercised on every run and raced on none.
//   • Two parallel `execute_sql` calls landed on DISTINCT backends 2.13 s apart
//     — the MCP channel serialises them. Distinct backends, zero overlap.
//   • `dblink` / `postgres_fdw` / `pg_net` are not installed, so a second
//     backend cannot be opened from inside SQL.
//   • `create_branch` needs a `confirm_cost` tool that is not exposed here.
//   • A15/A18's version conflict is a FAULT INJECTION at the point a race would
//     produce one. That is a mock of the answer, not the question.
//
// THE ONE PATH THAT WAS ALWAYS OPEN: the Edge Function is live over HTTPS. Two
// OS processes holding a real user JWT and firing overlapping POSTs at ONE
// character genuinely contend — two isolates, two pooled connections, two
// backends, one `pg_advisory_xact_lock`. That is a race by construction and
// nothing in the transport can serialise it away.
//
// ── WHAT IS MEASURED, AND WHAT IS MERELY ASSUMED ────────────────────────────
// "They overlapped" is the claim every previous attempt got wrong, so this
// harness never assumes it. It measures overlap TWICE, at two different layers,
// and the second layer is the one that counts:
//
//   1. TRANSPORT OVERLAP (necessary, not sufficient). Every child records
//      send/receive instants from `performance.timeOrigin + performance.now()`
//      — an absolute epoch clock, comparable across processes on one host — and
//      the parent intersects the in-flight intervals pairwise. Printed in ms.
//      Wall-clock overlap alone proves only that two sockets were open at once.
//
//   2. SERVER-SIDE CONTENTION EVIDENCE (the real proof). The accrual key is
//      DERIVED from (user, slot, watermark, version, salt) — see
//      hr-accrue/intents.js §"THE ACCRUAL KEY". So a loser that answers
//      `replayed` PROVES it read the same watermark AND the same version as the
//      winner, i.e. both invocations completed their READ before either APPLY
//      committed. A `version_conflict` proves the same for the version alone.
//      That is evidence produced BY THE SERVER about its own interleaving, and
//      no client-side timestamp can fake it.
//
//   A run whose sockets overlapped but whose responses show each call reading
//   state the other had already committed is reported NOT-OVERLAPPED, not
//   RACED. Reporting that as a pass is exactly how a race test becomes
//   decoration.
//
// ── THE MONEY PROPERTY ──────────────────────────────────────────────────────
// One absence window must be paid EXACTLY ONCE, no matter how many callers ask
// at once or through which verb. Four assertions, and this file is explicit
// about which are exact and which are advisory:
//
//   P1 EXACTLY-ONE-PAYMENT   (exact)  across every response in the race there is
//                                     exactly ONE non-null payment receipt.
//                                     ⚠ a receipt can ride on a 409: a
//                                     set_activity whose SWITCH was refused
//                                     still reports the COLLECT it already paid
//                                     in `body.collected`. Counting only 200s
//                                     would miss a double payment.
//   P2 CONSERVATION          (exact)  gold/XP moved in `player_state`, read
//                                     through hr_load before and after, equals
//                                     the sum of the receipts. Catches a
//                                     receipt for money that never landed, and
//                                     money that landed with no receipt.
//   P3 VERSION ACCOUNTING    (exact)  `version` advanced by exactly the number
//                                     of applies the responses claim — derived
//                                     from the responses, never hardcoded.
//   P4 WINDOW CONSERVATION   (exact)  the paid span (`grantMs`) equals the
//                                     elapsed window. This is the assertion
//                                     that catches a CONFISCATED window, which
//                                     is the direction this codebase has bled
//                                     from most often ("every historical away
//                                     bug was a base reward silently
//                                     vanishing").
//   P5 RATE vs CONTROL     (advisory) gold/ms and xp/ms of the raced window
//                                     against a SEQUENTIAL control run from the
//                                     same character over an equal window,
//                                     immediately before. Advisory ON PURPOSE:
//                                     combat rolls are seeded per watermark, so
//                                     two windows are never byte-equal. A wide
//                                     band catches ~2x and ~0x; it must not be
//                                     read as a tight equality.
//
// P3 has a false-positive this harness refuses to produce: if `version` moved
// MORE than the responses account for, the honest answer is usually "something
// else is writing to this character" — a browser tab signed into the same
// account — not "the engine double-applied". That is reported as
// INCONCLUSIVE-CONTAMINATED with the arithmetic shown, and the plan block below
// tells the operator to close the game first.
//
// ── THE LOCK PROPERTY ───────────────────────────────────────────────────────
// No 40P01 deadlock, no 5xx, no request that outlives --timeout. `hr_apply`
// takes `pg_advisory_xact_lock(user:slot)` and then `select … for update` on
// the same row in the same order every time, so a deadlock would mean a NEW
// lock ordering has appeared. Under the transaction pooler a hung request is
// also a leaked backend, and this project's `max_connections` is 60.
//
// ── PROVING THE HARNESS ITSELF (--selftest) ─────────────────────────────────
// A race test that cannot SEE a violation is worth less than no race test,
// because it manufactures confidence. Instance #15 of this program's
// assertion-that-asserts-nothing family was a probe that hardcoded a value it
// had not measured. So `--selftest` spawns the SAME child processes, running
// the SAME scenario code and the SAME verdict logic, against a local HTTP
// stand-in that fabricates contention — and it injects real property violations
// that the harness is REQUIRED to catch. The self-test exits non-zero if the
// honest case fails OR if any violation case passes. Seven cases, each naming
// the property it exists to trip. Only the base URL differs between a self-test
// run and a live run; there is no second implementation to drift.
//
// ── CREDENTIALS ────────────────────────────────────────────────────────────
// The password is read from stdin — never argv, never an env var — exactly as
// tools/switch-on-test.mjs does, so it stays out of shell history and out of
// the process table. The JWT is handed to each child over ITS STDIN for the
// same reason: an access token in `argv` is visible to every process on the box
// for the lifetime of the request.
//
// ── USAGE ───────────────────────────────────────────────────────────────────
//   node tools/race-test.mjs --selftest              # no credentials, no network
//   node tools/race-test.mjs                         # prints the plan, does nothing
//   node tools/race-test.mjs --yes                   # races production
//   node tools/race-test.mjs --yes --procs 4 --window 90
//   node tools/race-test.mjs --worker                # internal, one child
// ════════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import http from 'node:http';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const SELF = fileURLToPath(import.meta.url);

/* ── An absolute, cross-process clock ───────────────────────────────────────
   `Date.now()` is millisecond-granular and can step. `performance.now()` is
   sub-millisecond and monotonic but relative to ITS OWN process start.
   `timeOrigin` is that start expressed as an absolute epoch, so the sum is a
   high-resolution absolute instant that two processes on one host can be
   compared on — which is the whole measurement this file rests on. */
const nowAbs = () => performance.timeOrigin + performance.now();

// ═══════════════════════════════════════════════════════════════════════════
// ARGV
// ═══════════════════════════════════════════════════════════════════════════
function parseArgs(argv) {
  const a = {
    yes: false, selftest: false, worker: false, provision: false, json: null,
    procs: 2, windowSec: 75, slot: 0, timeoutMs: 20000, leadMs: 1500,
    staggerMs: 50, retries: 2, rateCeiling: 24, verbose: false,
    target: 'slime', target2: 'rat', scenarios: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const val = () => argv[++i];
    if (k === '--yes') a.yes = true;
    else if (k === '--selftest') a.selftest = true;
    else if (k === '--worker') a.worker = true;
    else if (k === '--provision') a.provision = true;
    else if (k === '--verbose' || k === '-v') a.verbose = true;
    else if (k === '--json') a.json = val();
    else if (k === '--procs') a.procs = Math.max(2, Number(val()) || 2);
    else if (k === '--window') a.windowSec = Number(val()) || 75;
    else if (k === '--slot') a.slot = Number(val()) || 0;
    else if (k === '--timeout') a.timeoutMs = Number(val()) || 20000;
    else if (k === '--lead') a.leadMs = Number(val()) || 1500;
    else if (k === '--stagger') a.staggerMs = Number(val()) || 50;
    else if (k === '--retries') a.retries = Number(val()) || 0;
    else if (k === '--rate-ceiling') a.rateCeiling = Number(val()) || 24;
    else if (k === '--target') a.target = String(val() || 'slime');
    else if (k === '--target2') a.target2 = String(val() || 'rat');
    else if (k === '--scenario') (a.scenarios ||= []).push(String(val() || ''));
    else if (k === '--help' || k === '-h') a.help = true;
  }
  return a;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const rule = (s = '') => console.log(s ? `\n── ${s} ${'─'.repeat(Math.max(0, 74 - s.length))}` : '─'.repeat(78));
const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : String(n));

/** Read url + anon key out of the client bootstrap, so this tool can never
    disagree with the app about which project it is talking to. Same source
    tools/switch-on-test.mjs and tests/rpc-resolution.mjs read. */
function readProjectConfig() {
  const boot = fs.readFileSync(new URL('../src/net/supabase-bootstrap.js', import.meta.url), 'utf8');
  const url = (boot.match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [])[0];
  const key = (boot.match(/eyJ[A-Za-z0-9_\-.]{40,}/) || [])[0];
  return { url, key };
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const onData = (char) => {
        if (['\n', '\r', ''].includes(char.toString('utf8'))) process.stdin.removeListener('data', onData);
        else process.stdout.write(`\x1b[2K\x1b[200D${question}${'*'.repeat(rl.line.length)}`);
      };
      process.stdin.on('data', onData);
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

/* ── THE RATE ACCOUNTANT ────────────────────────────────────────────────────
   `hr_rate_gate` allows 30 accrue/min and 30 activity/min per user; hr_load is
   180/min and hr_create_character 60/min. A harness that trips those reports
   429 and calls it a race outcome, which is a lie — so it paces itself under a
   ceiling with headroom and SAYS when it is waiting. The ceiling is deliberately
   below the real limit: the server's window is its own, not ours, and being
   exactly at the limit is indistinguishable from being over it. */
class RateBook {
  constructor(ceilings) { this.ceilings = ceilings; this.hits = new Map(); this.waited = 0; }
  async spend(bucket, label = '') {
    const cap = this.ceilings[bucket];
    if (!cap) return;
    const list = this.hits.get(bucket) || [];
    for (;;) {
      const cut = Date.now() - 60000;
      while (list.length && list[0] < cut) list.shift();
      if (list.length < cap) break;
      const waitMs = (list[0] + 60000) - Date.now() + 250;
      console.log(`   [rate] ${bucket} bucket at ${list.length}/${cap} in the last 60 s — waiting ${Math.ceil(waitMs / 1000)} s${label ? ` before ${label}` : ''}`);
      this.waited += waitMs;
      await sleep(waitMs);
    }
    list.push(Date.now());
    this.hits.set(bucket, list);
  }
  spent(bucket) { return (this.hits.get(bucket) || []).length; }
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP — the parent's own (sequential) calls
// ═══════════════════════════════════════════════════════════════════════════
async function postJson(ctx, path, body, { auth = true, timeoutMs = 20000 } = {}) {
  const headers = { 'Content-Type': 'application/json', apikey: ctx.key };
  if (auth && ctx.jwt) headers.Authorization = `Bearer ${ctx.jwt}`;
  const t0 = nowAbs();
  let res, text;
  try {
    res = await fetch(ctx.base + path, {
      method: 'POST', headers, body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    text = await res.text();
  } catch (e) {
    return { status: 0, ms: nowAbs() - t0, body: null, text: '', err: String(e?.message || e) };
  }
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* left null — the text is reported */ }
  return { status: res.status, ms: nowAbs() - t0, body: parsed, text, err: null };
}

/* ⚠ THE GET NEEDS A KEY. The function's own GET branch is unauthenticated — it
   returns the payload fingerprint and touches nothing — but the SUPABASE
   GATEWAY in front of it rejects a request with no Authorization header before
   the function ever runs (`UNAUTHORIZED_NO_AUTH_HEADER`). The first revision of
   this file sent no headers and would have aborted every live run at the first
   preflight step with "404 means hr-accrue is not deployed", which is both
   wrong and the most expensive kind of wrong: it names a cause the operator
   would then go and chase. The anon key is not a secret — it ships in the
   client bundle — and sending it is exactly what a browser does. */
async function getJson(ctx, path, { timeoutMs = 15000 } = {}) {
  const t0 = nowAbs();
  const headers = ctx.key ? { apikey: ctx.key, Authorization: `Bearer ${ctx.key}` } : {};
  try {
    const res = await fetch(ctx.base + path, { method: 'GET', headers, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, ms: nowAbs() - t0, body: parsed, text, err: null };
  } catch (e) {
    return { status: 0, ms: nowAbs() - t0, body: null, text: '', err: String(e?.message || e) };
  }
}

/** hr_load — the AUTHORITATIVE read, and deliberately not an accrue.
    An accrue call that finds a payable window PAYS it, so it cannot be used to
    observe state without changing it. hr_load is `authenticated`-only, returns
    the same envelope hr_state_of builds, writes nothing, and spends a different
    (180/min) budget. It is what makes P2 and P3 exact rather than inferred. */
async function hrLoad(ctx, slot) {
  await ctx.rates.spend('load', 'hr_load');
  const r = await postJson(ctx, '/rest/v1/rpc/hr_load', { p_slot: slot });
  return r;
}

function envelopeOf(loadRes) {
  const b = loadRes?.body;
  if (!b || typeof b !== 'object') return null;
  return b.ok === true ? b : null;
}
const goldOf = (env) => Number(env?.state?.gold ?? NaN);
const versionOf = (env) => Number(env?.version ?? NaN);
const accruedToOf = (env) => (env?.state?.accrued_to ? new Date(env.state.accrued_to).getTime() : NaN);
function xpTotalOf(env) {
  let t = 0;
  for (const k of Object.keys(env?.skills || {})) t += Number(env.skills[k]?.xp) || 0;
  return t;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE WORKER — one child process, one POST, timed to the microsecond
// ═══════════════════════════════════════════════════════════════════════════
const WORKER_SENTINEL = '__RACE_RESULT__';

async function runWorker() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  let job;
  try { job = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch (e) { process.stdout.write(`${WORKER_SENTINEL}${JSON.stringify({ fatal: `bad job: ${e.message}` })}\n`); return; }

  const out = { label: job.label, warmupMs: null, warmupStatus: null };

  /* WARM THE CONNECTION FIRST. The GET branch of hr-accrue returns the payload
     fingerprint without touching identity, the pooler or the database — so it
     costs no rate budget and writes nothing, and it leaves a live TLS
     connection in undici's pool. Without it the first child to finish its TLS
     handshake would fire seconds ahead of the other and the "race" would be a
     relay. This is the single highest-leverage line in the file for actually
     producing overlap. */
  if (job.warmupPath) {
    const t = nowAbs();
    try {
      const r = await fetch(job.base + job.warmupPath, {
        method: 'GET',
        headers: job.apikey ? { apikey: job.apikey, Authorization: `Bearer ${job.apikey}` } : {},
        signal: AbortSignal.timeout(10000),
      });
      await r.text();
      out.warmupStatus = r.status;
    } catch (e) { out.warmupErr = String(e?.message || e); }
    out.warmupMs = nowAbs() - t;
  }

  // Park until the shared start instant, then spin the last few ms. setTimeout
  // is only accurate to the event-loop tick; the spin removes that jitter.
  const target = job.startAtEpochMs;
  const coarse = target - nowAbs() - 12;
  if (coarse > 0) await sleep(coarse);
  while (nowAbs() < target) { /* spin — bounded by the 12 ms above */ }

  const headers = { 'Content-Type': 'application/json', apikey: job.apikey };
  if (job.jwt) headers.Authorization = `Bearer ${job.jwt}`;

  out.plannedAt = target;
  out.sendAt = nowAbs();
  out.skewMs = out.sendAt - target;
  try {
    const res = await fetch(job.base + job.path, {
      method: 'POST', headers, body: JSON.stringify(job.body),
      signal: AbortSignal.timeout(job.timeoutMs),
    });
    out.recvAt = nowAbs();
    out.status = res.status;
    const text = await res.text();
    out.bodyAt = nowAbs();
    out.text = text.slice(0, 8000);
    try { out.body = JSON.parse(text); } catch { out.body = null; }
  } catch (e) {
    out.recvAt = nowAbs();
    out.bodyAt = out.recvAt;
    out.status = 0;
    out.err = String(e?.message || e);
  }
  process.stdout.write(`${WORKER_SENTINEL}${JSON.stringify(out)}\n`);
}

/** Spawn N children, hand each its job on STDIN (never argv — see the header),
    and collect one result per child. A child that produces no result inside its
    own timeout plus slack is killed and recorded as a hang, which is itself a
    property violation rather than a missing data point. */
function spawnRacers(jobs) {
  return Promise.all(jobs.map((job) => new Promise((resolve) => {
    const child = spawn(process.execPath, [SELF, '--worker'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', settled = false;
    const finish = (r) => { if (!settled) { settled = true; resolve(r); } };
    const killer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      finish({ label: job.label, status: 0, err: 'worker_hang', hung: true, sendAt: null, recvAt: null });
    }, job.timeoutMs + 8000);

    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    child.on('close', () => {
      clearTimeout(killer);
      const line = stdout.split('\n').find((l) => l.startsWith(WORKER_SENTINEL));
      if (!line) return finish({ label: job.label, status: 0, err: `worker produced no result: ${stderr.slice(0, 300)}`, sendAt: null, recvAt: null });
      try { finish(JSON.parse(line.slice(WORKER_SENTINEL.length))); }
      catch (e) { finish({ label: job.label, status: 0, err: `unparseable worker result: ${e.message}`, sendAt: null, recvAt: null }); }
    });
    child.stdin.end(JSON.stringify(job));
  })));
}

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFICATION — one reader for both verbs
// ═══════════════════════════════════════════════════════════════════════════
/* The outcomes a concurrent caller can legitimately receive. Everything not on
   this list is a defect by default; a taxonomy that fails OPEN is how an
   unrecognised 500 gets filed as "some other outcome" and passes. */
const CONTENTION_OUTCOMES = new Set(['replayed', 'version_conflict', 'intent_mismatch', 'intent_in_flight']);

function classify(r) {
  const b = r?.body;
  const out = { label: r?.label, status: r?.status ?? 0, kind: 'unknown', code: null, receipt: null, applies: 0, version: null };

  if (r?.hung || r?.err === 'worker_hang') { out.kind = 'hang'; out.code = 'worker_hang'; return out; }
  if (r?.err) { out.kind = /timeout|abort|timed out/i.test(r.err) ? 'timeout' : 'network'; out.code = r.err; return out; }
  if (!b || typeof b !== 'object') { out.kind = 'unparseable'; out.code = (r?.text || '').slice(0, 120); return out; }

  out.version = Number.isFinite(Number(b.version)) ? Number(b.version) : null;

  /* ⚠ THE RECEIPT CAN RIDE ON A REFUSAL. set-activity.js attaches `collected`
     to a 409 raised at stage:'switch', because the COLLECT that ran on the way
     there already paid and dropping it would report applied money as nothing.
     Reading receipts only from 200s therefore under-counts payments, which is
     the exact direction that hides a double payment. */
  const away = (b.ok === true && b.accrued === true && b.away) ? b.away : null;
  const collected = (b.collected && typeof b.collected === 'object') ? b.collected : null;
  const rec = away || collected;
  if (rec) {
    out.receipt = {
      ms: Number(rec.ms ?? rec.grantMs ?? NaN),
      gold: Number(rec.gold ?? 0) || 0,
      xp: sumXp(rec.xp),
      kills: Number(rec.kills ?? 0) || 0,
      source: away ? 'away' : 'collected',
    };
    out.applies += 1;                       // a paid delta is one hr_apply
  }

  if (r.status >= 500) { out.kind = 'server_error'; out.code = b.error || `http_${r.status}`; return out; }
  if (r.status === 429) { out.kind = 'rate_limited'; out.code = b.error || 'rate_limited'; return out; }

  if (b.ok === true) {
    if (b.accrued === true) { out.kind = 'applied'; out.code = 'accrued'; return out; }
    if (b.replayed === true || b.reason === 'replayed') {
      out.kind = 'replayed'; out.code = 'replayed';
      // A replayed SWITCH applied nothing this invocation.
      return out;
    }
    if (b.verb === 'set_activity' || b.activity !== undefined) {
      out.kind = 'switched'; out.code = 'switch_ok';
      out.applies += 1;                     // the switch delta is its own apply
      return out;
    }
    out.kind = 'nothing'; out.code = String(b.reason || 'no_reason');
    return out;
  }

  const code = String(b.error || `http_${r.status}`);
  out.code = code;
  out.kind = CONTENTION_OUTCOMES.has(code) ? code : 'refused';
  return out;
}

function sumXp(xp) {
  if (!xp) return 0;
  if (typeof xp === 'number') return xp;
  let t = 0;
  for (const k of Object.keys(xp)) t += Number(xp[k]) || 0;
  return t;
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERLAP
// ═══════════════════════════════════════════════════════════════════════════
function overlapReport(results) {
  const iv = results
    .filter((r) => Number.isFinite(r?.sendAt) && Number.isFinite(r?.recvAt))
    .map((r) => ({ label: r.label, a: r.sendAt, b: r.recvAt }));
  const pairs = [];
  for (let i = 0; i < iv.length; i++) {
    for (let j = i + 1; j < iv.length; j++) {
      pairs.push({
        pair: `${iv[i].label}x${iv[j].label}`,
        ms: Math.min(iv[i].b, iv[j].b) - Math.max(iv[i].a, iv[j].a),
      });
    }
  }
  const all = iv.length >= 2 ? Math.min(...iv.map((x) => x.b)) - Math.max(...iv.map((x) => x.a)) : NaN;
  return {
    pairs,
    allMs: all,
    minPairMs: pairs.length ? Math.min(...pairs.map((p) => p.ms)) : NaN,
    complete: iv.length === results.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// THE PROPERTY CHECK + VERDICT
// ═══════════════════════════════════════════════════════════════════════════
/**
 * @param o.classified  classify() output per racer
 * @param o.overlap     overlapReport()
 * @param o.before      hr_load envelope before the race
 * @param o.after       hr_load envelope after the race
 * @param o.elapsedMs   the real window the race was paid for
 * @param o.control     the sequential control's receipt (or null)
 */
function judge(o) {
  const { classified, overlap, before, after, elapsedMs, control, tol } = o;
  const violations = [];
  const notes = [];

  // ── The lock property ────────────────────────────────────────────────────
  const bad = classified.filter((c) => ['server_error', 'hang', 'timeout', 'network', 'unparseable'].includes(c.kind));
  for (const c of bad) violations.push({ prop: 'LOCK', detail: `${c.label}: ${c.kind} (${c.code})` });
  const deadlock = classified.filter((c) => /40P01|deadlock/i.test(String(c.code)));
  for (const c of deadlock) violations.push({ prop: 'LOCK', detail: `${c.label}: DEADLOCK reported — ${c.code}` });

  // ── P1 exactly-one-payment ───────────────────────────────────────────────
  const receipts = classified.filter((c) => c.receipt);
  if (receipts.length > 1) {
    violations.push({
      prop: 'P1 EXACTLY-ONE-PAYMENT',
      detail: `${receipts.length} payment receipts for ONE window: `
        + receipts.map((c) => `${c.label}=${c.receipt.gold}g/${c.receipt.ms}ms(${c.receipt.source})`).join(', '),
    });
  }

  // ── P2 conservation, and P3 version accounting ───────────────────────────
  const paidGold = receipts.reduce((t, c) => t + c.receipt.gold, 0);
  const paidXp = receipts.reduce((t, c) => t + c.receipt.xp, 0);
  const paidMs = receipts.reduce((t, c) => t + (Number.isFinite(c.receipt.ms) ? c.receipt.ms : 0), 0);
  const claimedApplies = classified.reduce((t, c) => t + c.applies, 0);

  let contaminated = false;
  if (before && after) {
    const dGold = goldOf(after) - goldOf(before);
    const dXp = xpTotalOf(after) - xpTotalOf(before);
    const dVer = versionOf(after) - versionOf(before);
    notes.push(`state delta: gold ${dGold >= 0 ? '+' : ''}${dGold}, xp ${dXp >= 0 ? '+' : ''}${dXp}, version +${dVer}`);
    notes.push(`receipts    : gold +${paidGold}, xp +${paidXp}, applies claimed ${claimedApplies}`);

    if (dGold !== paidGold) {
      violations.push({
        prop: 'P2 CONSERVATION',
        detail: `gold moved ${dGold} but the receipts total ${paidGold} `
          + (dGold > paidGold ? '— money landed with NO receipt' : '— a receipt was issued for money that never landed'),
      });
    }
    if (dXp !== paidXp) {
      violations.push({ prop: 'P2 CONSERVATION', detail: `xp moved ${dXp} but the receipts total ${paidXp}` });
    }
    if (dVer !== claimedApplies) {
      if (dVer > claimedApplies) {
        contaminated = true;
        notes.push(`⚠ version advanced ${dVer} against ${claimedApplies} claimed applies — ${dVer - claimedApplies} unexplained. `
          + 'Most often a second client (a browser tab) is signed into this account. Close it and re-run.');
      } else {
        violations.push({
          prop: 'P3 VERSION ACCOUNTING',
          detail: `${claimedApplies} applies were claimed but version advanced only ${dVer} — a response reported work that did not commit`,
        });
      }
    }
  } else {
    notes.push('state could not be read before/after — P2 and P3 were NOT evaluated');
  }

  /* ── P4 window conservation ───────────────────────────────────────────────
     THE EXPECTED SPAN IS DERIVED FROM THE SERVER'S OWN CLOCK, not from mine.
     The first revision compared the paid span against wall-clock elapsed time
     measured in this process, which had to carry a tolerance big enough to
     absorb two round trips — and the self-test proved that tolerance swallowed
     a stand-in that silently paid HALF the window. A guard whose slack is wider
     than the bug it hunts is decoration.

     `hr_apply` stamps `accrued_to = now()` on every applied delta and the
     engine always simulates a window ENDING at now(), so
     `accrued_to(after) - accrued_to(before)` IS the time the server consumed,
     measured entirely on its clock with no network in it. Anything paid short
     of that is time the watermark swallowed without paying for — which is
     precisely the failure shape this codebase has bled from most.

     The tolerance is proportional (5%) with a small floor, plus a per-extra-
     apply allowance: a set_activity re-stamps the watermark after its collect,
     so each additional apply legitimately adds its own round trip to the
     consumed span without adding to the paid span. */
  let expectedSpanMs = NaN;
  if (before && after) {
    const d = accruedToOf(after) - accruedToOf(before);
    if (Number.isFinite(d) && d > 0) expectedSpanMs = d;
  }
  if (!Number.isFinite(expectedSpanMs)) expectedSpanMs = elapsedMs;

  if (receipts.length && Number.isFinite(expectedSpanMs)) {
    const slack = Math.max(0.05 * expectedSpanMs, tol?.windowFloorMs ?? 250)
      + (tol?.perApplyMs ?? 400) * Math.max(0, claimedApplies - 1);
    const lo = expectedSpanMs - slack, hi = expectedSpanMs + slack;
    if (!(paidMs >= lo && paidMs <= hi)) {
      violations.push({
        prop: 'P4 WINDOW CONSERVATION',
        detail: `paid ${Math.round(paidMs)} ms against a watermark that advanced ${Math.round(expectedSpanMs)} ms `
          + `(accepted ${Math.round(lo)}..${Math.round(hi)}) — `
          + (paidMs < lo
            ? 'the window was CONFISCATED: the watermark moved past time nobody was paid for'
            : 'more time was paid than the watermark consumed'),
      });
    } else {
      notes.push(`window: paid ${Math.round(paidMs)} ms of ${Math.round(expectedSpanMs)} ms consumed by the watermark `
        + `(±${Math.round(slack)} ms; wall clock saw ${Math.round(elapsedMs)} ms incl. round trips)`);
    }
  }

  // ── P5 rate against the sequential control (ADVISORY) ────────────────────
  if (control && control.ms > 0 && receipts.length === 1 && receipts[0].receipt.ms > 0) {
    const cg = control.gold / control.ms, rg = receipts[0].receipt.gold / receipts[0].receipt.ms;
    const cx = control.xp / control.ms, rx = receipts[0].receipt.xp / receipts[0].receipt.ms;
    const ratio = (r, c) => (c > 0 ? r / c : NaN);
    const gr = ratio(rg, cg), xr = ratio(rx, cx);
    notes.push(`rate vs control: gold ${fmt(gr, 2)}x, xp ${fmt(xr, 2)}x `
      + `(control ${control.gold}g/${control.ms}ms, race ${receipts[0].receipt.gold}g/${receipts[0].receipt.ms}ms)`);
    const band = tol?.rateBand ?? [0.35, 2.5];
    for (const [name, v] of [['gold', gr], ['xp', xr]]) {
      if (Number.isFinite(v) && (v < band[0] || v > band[1])) {
        violations.push({
          prop: 'P5 RATE vs CONTROL (advisory)',
          detail: `${name} paid at ${fmt(v, 2)}x the sequential control's rate, outside the ${band[0]}..${band[1]} band`,
        });
      }
    }
  }

  // ── Did they actually contend? ───────────────────────────────────────────
  const losers = classified.filter((c) => !c.receipt);
  const evidence = losers.filter((c) => CONTENTION_OUTCOMES.has(c.kind));
  const transportOverlapped = Number.isFinite(overlap.minPairMs) && overlap.minPairMs > 0;
  const contended = evidence.length > 0;

  let verdict;
  if (violations.length) verdict = 'PROPERTY-VIOLATED';
  else if (contaminated) verdict = 'INCONCLUSIVE-CONTAMINATED';
  else if (!transportOverlapped || !contended) verdict = 'NOT-OVERLAPPED';
  else verdict = 'RACED';

  return {
    verdict, violations, notes,
    transportOverlapped, contended,
    evidence: evidence.map((c) => `${c.label}:${c.kind}`),
    receipts: receipts.length, claimedApplies, paidGold, paidXp, paidMs,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PREFLIGHT DECISIONS — pure, because they are the part that runs FIRST
//
// These three judgements decide whether the operator gets a meaningful verdict
// or a confusing one, and each of them has a wrong answer that looks completely
// reasonable. They are pure functions with a self-test table (see
// PREFLIGHT_CASES) rather than `if`s buried in a network sequence, because the
// network sequence is the one part of this file that cannot be exercised
// without credentials — which is exactly how the important branch ends up being
// the untested one.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A 429 from `set_activity`, disambiguated.
 *
 * ⚠ THIS IS THE ONE THAT WOULD HAVE WASTED A LIVE RUN. `hr_rate_gate` refuses
 *   an UNKNOWN bucket by returning false (`else return false` — it fails closed
 *   on purpose), and set-activity.js reports that as 429 `rate_limited` — the
 *   IDENTICAL answer it gives when the real 30/min limit is hit. On a database
 *   where 2026-08-15-activity-intent.sql has not been applied, the `activity`
 *   bucket does not exist, so EVERY set_activity call answers 429 forever. A
 *   harness that reads that as "rate limited, back off and retry" would wait,
 *   retry, and report NOT-OVERLAPPED for eternity against a server that can
 *   never answer.
 *
 *   The discriminator is budget we KNOW we have not spent: if this is the first
 *   activity-bucket call of the run, 429 cannot mean "you have made 30 calls in
 *   the last minute".
 */
export function diagnoseActivity429(activityCallsSpent) {
  return activityCallsSpent <= 1 ? 'bucket_missing' : 'rate_limited';
}

/** Does the deployed build implement `set_activity` at all? A 400 `unknown_verb`
    is the shell refusing a verb it has no registry row for — the deploy is
    behind the repo. Anything else means the verb dispatched (a `bad_activity`
    400 is the SHAPE refusal, which proves dispatch happened). */
export function diagnoseVerbProbe(status, body) {
  const err = String(body?.error ?? '');
  if (status === 400 && err === 'unknown_verb') return 'verb_not_deployed';
  if (status === 400 && err === 'bad_activity') return 'verb_present';
  if (status === 401) return 'not_signed_in';
  if (status >= 500) return 'engine_error';
  return 'verb_present';
}

/** What to do about the character in the target slot. `no_character` is not a
    failure — it is the ordinary state of a slot nobody has provisioned — but it
    means every POST answers 409 and there is nothing to race, so it must stop
    the run LOUDLY rather than produce three empty verdicts. */
export function diagnoseCharacter(loadBody, httpStatus, provision) {
  if (loadBody?.ok === true) return 'ready';
  const err = String(loadBody?.error ?? `http_${httpStatus}`);
  if (err === 'no_character') return provision ? 'provision' : 'needs_provision';
  if (err === 'rate_limited') return 'load_rate_limited';
  return 'load_failed';
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════
const SCENARIOS = {
  'accrue-vs-accrue': {
    why: 'the base case — N invocations of the ONE verb whose key is derived, on one watermark',
    jobs: (ctx, n) => Array.from({ length: n }, (_, i) => ({
      verb: 'accrue', body: { slot: ctx.slot }, label: String.fromCharCode(65 + i), bucket: 'accrue',
    })),
  },
  'accrue-vs-set_activity': {
    why: 'two DIFFERENT verbs deriving the SAME collect key — the property intents.js claims and nothing has ever tested',
    jobs: (ctx, n) => Array.from({ length: n }, (_, i) => (i === 0
      ? { verb: 'accrue', body: { slot: ctx.slot }, label: 'A', bucket: 'accrue' }
      : {
        verb: 'set_activity', bucket: 'activity', label: String.fromCharCode(65 + i),
        body: { slot: ctx.slot, verb: 'set_activity', intentId: randomUUID(), activity: { kind: 'combat', id: ctx.target2 } },
      })),
  },
  'set_activity-vs-set_activity': {
    why: 'two switches racing: the collect must pay once even though the two switches carry DIFFERENT client keys',
    jobs: (ctx, n) => Array.from({ length: n }, (_, i) => ({
      verb: 'set_activity', bucket: 'activity', label: String.fromCharCode(65 + i),
      body: {
        slot: ctx.slot, verb: 'set_activity', intentId: randomUUID(),
        activity: { kind: 'combat', id: i % 2 === 0 ? ctx.target : ctx.target2 },
      },
    })),
  },
};

/** Drain whatever is currently owed so the raced window starts from a known
    watermark. Loops because the first accrue can itself take long enough to
    leave a sub-threshold remainder; bounded so a permanently-refusing character
    cannot spin here. */
async function drain(ctx, maxCalls = 3) {
  const seen = [];
  for (let i = 0; i < maxCalls; i++) {
    await ctx.rates.spend('accrue', 'drain');
    const r = await postJson(ctx, '/functions/v1/hr-accrue', { slot: ctx.slot }, { timeoutMs: ctx.timeoutMs });
    const c = classify({ ...r, label: 'drain' });
    seen.push(`${c.kind}${c.code ? `(${c.code})` : ''}`);
    if (c.kind !== 'applied') break;
  }
  return seen;
}

async function runScenario(ctx, name) {
  const spec = SCENARIOS[name];
  rule(`SCENARIO ${name}`);
  console.log(`   why: ${spec.why}`);

  // (0) known watermark
  const drained = await drain(ctx);
  console.log(`   drain: ${drained.join(' -> ')}`);
  const s0 = envelopeOf(await hrLoad(ctx, ctx.slot));
  if (!s0) return { name, verdict: 'INCONCLUSIVE', reason: 'hr_load did not return an envelope after the drain' };
  if (!s0.state?.active_kind || s0.state.active_kind === 'idle') {
    return {
      name, verdict: 'INCONCLUSIVE',
      reason: `the character is idle (active_kind=${JSON.stringify(s0.state?.active_kind)}) so no window can ever be payable — `
        + 'set an activity first (this harness does it in preflight; if it could not, the activity intent is not live)',
    };
  }

  // (1) the SEQUENTIAL CONTROL — what one caller pays for a window of this length
  console.log(`   waiting ${ctx.windowSec}s for the CONTROL window…`);
  await sleep(ctx.windowSec * 1000);
  await ctx.rates.spend('accrue', 'control');
  const cRes = await postJson(ctx, '/functions/v1/hr-accrue', { slot: ctx.slot }, { timeoutMs: ctx.timeoutMs });
  const cCls = classify({ ...cRes, label: 'control' });
  const s1 = envelopeOf(await hrLoad(ctx, ctx.slot));
  console.log(`   control: ${cCls.kind}(${cCls.code}) ${cCls.receipt ? `paid ${cCls.receipt.gold}g ${cCls.receipt.xp}xp over ${cCls.receipt.ms}ms` : 'paid nothing'}`);
  if (!cCls.receipt) {
    return {
      name, verdict: 'INCONCLUSIVE',
      reason: `the sequential control paid nothing (${cCls.kind}/${cCls.code}) — there is no money property to race for. `
        + (cCls.code === 'below_min_span' ? `Raise --window above ${Math.ceil(60000 / 1000)}s.` : 'Check the character has a payable activity.'),
      control: cCls,
    };
  }

  // (2) THE RACE
  console.log(`   waiting ${ctx.windowSec}s for the RACED window…`);
  const rStart = nowAbs();
  await sleep(ctx.windowSec * 1000);

  const jobSpecs = spec.jobs(ctx, ctx.procs);
  for (const j of jobSpecs) await ctx.rates.spend(j.bucket, `race:${j.label}`);
  const startAt = nowAbs() + ctx.leadMs;
  const jobs = jobSpecs.map((j, i) => ({
    label: j.label,
    base: ctx.base, apikey: ctx.key, jwt: ctx.jwt,
    path: '/functions/v1/hr-accrue', warmupPath: '/functions/v1/hr-accrue',
    body: j.body,
    startAtEpochMs: startAt + (ctx.procs > 1 ? (i * ctx.staggerMs) / (ctx.procs - 1) : 0),
    timeoutMs: ctx.timeoutMs,
  }));

  const results = await spawnRacers(jobs);
  const rElapsed = nowAbs() - rStart;
  const classified = results.map(classify);
  const overlap = overlapReport(results);
  const s2 = envelopeOf(await hrLoad(ctx, ctx.slot));

  // ── the transcript, per request, so nothing is taken on trust ────────────
  console.log('');
  for (const r of results) {
    const c = classify(r);
    const send = Number.isFinite(r.sendAt) ? new Date(r.sendAt).toISOString().slice(11, 23) : '—';
    const dur = Number.isFinite(r.recvAt) && Number.isFinite(r.sendAt) ? `${Math.round(r.recvAt - r.sendAt)}ms` : '—';
    console.log(`   ${r.label}: sent ${send} (+${fmt(r.skewMs ?? NaN, 1)}ms of plan)  rtt ${dur}  HTTP ${c.status}  ${c.kind}${c.code ? `(${c.code})` : ''}`
      + (c.receipt ? `  RECEIPT ${c.receipt.gold}g ${c.receipt.xp}xp ${Math.round(c.receipt.ms)}ms` : ''));
    if (ctx.verbose && r.text) console.log(`      ${r.text.slice(0, 400)}`);
  }
  console.log(`   overlap: pairwise ${overlap.pairs.map((p) => `${p.pair}=${Math.round(p.ms)}ms`).join(' ')}`
    + (Number.isFinite(overlap.allMs) ? `  all-${results.length} intersection ${Math.round(overlap.allMs)}ms` : ''));

  const j = judge({
    classified, overlap, before: s1, after: s2, elapsedMs: rElapsed,
    control: cCls.receipt,
    tol: { windowFloorMs: ctx.windowFloorMs, perApplyMs: ctx.perApplyMs, rateBand: ctx.rateBand },
  });

  return { name, ...j, overlap, classified, control: cCls, elapsedMs: rElapsed };
}

function printVerdict(res) {
  console.log('');
  rule();
  if (res.verdict === 'RACED') {
    console.log(`VERDICT  RACED — ${res.name}`);
    console.log(`  Transport overlap ${Math.round(res.overlap.minPairMs)} ms (smallest pair); the server itself confirms the`);
    console.log(`  interleaving: ${res.evidence.join(', ')} — a derived-key replay can only be produced by two`);
    console.log('  invocations that BOTH read the same watermark and version before either applied.');
    console.log(`  The window was paid EXACTLY ONCE (${res.receipts} receipt, ${res.paidGold} gold, ${res.paidXp} xp).`);
    for (const n of res.notes) console.log(`  ${n}`);
  } else if (res.verdict === 'NOT-OVERLAPPED') {
    console.log(`VERDICT  NOT-OVERLAPPED — ${res.name}. RETRY; this is not a pass and not a failure.`);
    console.log(`  transport overlapped: ${res.transportOverlapped}   server-side contention evidence: ${res.contended}`);
    if (res.transportOverlapped && !res.contended) {
      console.log('  The sockets were open at the same time but each call read state the other had');
      console.log('  already committed, so nothing contended in the critical section. Retry with a');
      console.log('  smaller --stagger, or a longer --window so the read phase is not the whole call.');
    } else {
      console.log('  The requests did not overlap on the wire at all. Raise --lead so both children');
      console.log('  finish their TLS handshake before the start instant, and re-run.');
    }
    for (const n of res.notes) console.log(`  ${n}`);
  } else if (res.verdict === 'INCONCLUSIVE' || res.verdict === 'INCONCLUSIVE-CONTAMINATED') {
    console.log(`VERDICT  ${res.verdict} — ${res.name}`);
    if (res.reason) console.log(`  ${res.reason}`);
    for (const n of res.notes || []) console.log(`  ${n}`);
  } else {
    console.log(`VERDICT  PROPERTY-VIOLATED — ${res.name}`);
    console.log('  THIS IS THE FINDING THE HARNESS EXISTS TO PRODUCE. Do not cut over on it.');
    for (const v of res.violations) console.log(`  !! ${v.prop}: ${v.detail}`);
    for (const n of res.notes) console.log(`  ${n}`);
  }
  rule();
}

// ═══════════════════════════════════════════════════════════════════════════
// THE PLAN — printed before anything is written, every time
// ═══════════════════════════════════════════════════════════════════════════
function printPlan(a, cfg, names) {
  const accrueCalls = names.length * (3 + 1 + (names.includes('accrue-vs-accrue') ? a.procs : 1));
  console.log('');
  rule('WHAT THIS RUN WILL DO — read it before passing --yes');
  console.log(`  project      ${cfg.url}`);
  console.log(`  target       POST /functions/v1/hr-accrue   slot ${a.slot}`);
  console.log(`  processes    ${a.procs} OS child processes per race, staggered 0..${a.staggerMs} ms`);
  console.log(`  window       ${a.windowSec} s of real absence per measured window (engine minimum is 60 s)`);
  console.log(`  scenarios    ${names.join(', ')}`);
  console.log(`  duration     roughly ${Math.ceil((names.length * (a.windowSec * 2 + 25)) / 60)} min — two real windows per scenario`);
  console.log('');
  console.log('  IT WRITES REAL ROWS TO A REAL CHARACTER. Specifically, per scenario:');
  console.log('    • player_state       gold / xp / hp / inventory / accrued_to / version all advance.');
  console.log('                         This is genuine progression on the account you sign in as.');
  console.log('    • player_ledger      one APPEND-ONLY aggregated row per applied accrual.');
  console.log('                         Deletion from it is refused by design — this residue is permanent');
  console.log('                         until the beta wipe.');
  console.log('    • player_intents     one row per distinct intent key (derived + client). Pruned by');
  console.log('                         hr_intents_prune within ~25 h.');
  console.log('    • hr_rate_counters   one bucket row per (user, bucket) window.');
  console.log('    • hr_rejections      a row only if something is refused or rate-limited (sampled).');
  console.log('    • active_kind/id     the set_activity scenarios MOVE the character\'s activity pointer');
  console.log(`                         and leave it on whichever of ${a.target}/${a.target2} won the last switch.`);
  console.log('');
  console.log(`  RATE BUDGET  hr_rate_gate allows 30 accrue/min and 30 activity/min per user.`);
  console.log(`               This run is paced to a ceiling of ${a.rateCeiling}/min per bucket and will`);
  console.log(`               SLEEP rather than trip it (~${accrueCalls} accrue-bucket calls total, spread`);
  console.log('               across windows that are themselves minutes long).');
  console.log('');
  console.log('  PRECONDITION, and the harness cannot enforce it: NOTHING ELSE MAY BE SIGNED IN');
  console.log('  as this account while it runs. A browser tab playing the game writes the same');
  console.log('  rows, and the conservation check would attribute its writes to the race. If the');
  console.log('  harness sees unexplained version movement it reports INCONCLUSIVE-CONTAMINATED');
  console.log('  rather than a violation.');
  console.log('');
  console.log('  USE THE THROWAWAY ACCOUNT. Not a real player.');
  rule();
}

// ═══════════════════════════════════════════════════════════════════════════
// LIVE MAIN
// ═══════════════════════════════════════════════════════════════════════════
async function main(a) {
  const cfg = readProjectConfig();
  if (!cfg.url || !cfg.key) {
    console.error('Could not read the project url/anon key out of src/net/supabase-bootstrap.js');
    process.exit(1);
  }
  let names = (a.scenarios?.length ? a.scenarios : Object.keys(SCENARIOS))
    .filter((n) => { if (!SCENARIOS[n]) { console.error(`unknown scenario '${n}'`); process.exit(2); } return true; });

  /* ── THE WINDOW HAS A HARD FLOOR AND IT IS NOT ADVISORY ───────────────────
     `ACCRUE_MIN_MS` in hr-accrue/accrual.js is 60,000: below that the engine
     returns `below_min_span` and pays nothing, deliberately, so a sub-threshold
     call cannot confiscate the time it declined to pay for. A run with
     --window 45 would therefore wait forty-five seconds per window, three
     times, and produce three INCONCLUSIVE verdicts — five wasted minutes for a
     mistake that is knowable at argv-parse time. Refuse it up front instead. */
  const MIN_WINDOW_SEC = 65;
  if (a.windowSec < MIN_WINDOW_SEC) {
    console.error(`\n--window ${a.windowSec} is below the engine's minimum payable span.`);
    console.error(`accrual.js ACCRUE_MIN_MS is 60000, so anything under ~${MIN_WINDOW_SEC}s pays nothing and`);
    console.error('every scenario would return INCONCLUSIVE(below_min_span). Use --window 75 or more.\n');
    return 2;
  }

  printPlan(a, cfg, names);
  if (!a.yes) {
    console.log('\nNothing was done. Re-run with --yes to actually race:');
    console.log(`  node tools/race-test.mjs --yes${a.procs !== 2 ? ` --procs ${a.procs}` : ''}\n`);
    return 0;
  }

  const ctx = {
    base: cfg.url, key: cfg.key, jwt: null,
    slot: a.slot, procs: a.procs, windowSec: a.windowSec, timeoutMs: a.timeoutMs,
    leadMs: a.leadMs, staggerMs: a.staggerMs, verbose: a.verbose,
    target: a.target, target2: a.target2,
    /* 5% of the watermark's own advance, floored at 1 s, plus 1.5 s per extra
       apply. On a 75 s window that is ~3.8 s — so a confiscation bigger than
       about 5% of an absence is caught, and ordinary round-trip slop is not
       reported as one. State the sensitivity rather than implying exactness. */
    windowFloorMs: 1000, perApplyMs: 1500,
    rateBand: [0.35, 2.5],
    rates: new RateBook({ accrue: a.rateCeiling, activity: a.rateCeiling, load: 120, ensure: 30 }),
  };

  // ── PREFLIGHT ────────────────────────────────────────────────────────────
  rule('PREFLIGHT');
  const ping = await getJson(ctx, '/functions/v1/hr-accrue');
  const deployedHash = String(ping.body?.payload_sha256 ?? '');
  console.log(`   GET  hr-accrue -> HTTP ${ping.status} ${deployedHash ? `payload ${deployedHash.slice(0, 16)}…` : ping.text.slice(0, 140)}`);
  if (ping.status !== 200 || !deployedHash) {
    console.log('\n   The function did not answer its GET branch, so nothing below can run.');
    if (ping.status === 401) console.log('   401 here is the GATEWAY, not the function — the anon key was rejected or missing.');
    else if (ping.status === 404) console.log('   404 here means hr-accrue is not deployed on this project.');
    return 3;
  }

  /* ── WHICH BUILD IS ACTUALLY UNDER TEST ────────────────────────────────────
     A race result is a statement about SOME bytes. If the deployed bytes are
     not the reviewed bytes, the result is a statement about code nobody has
     read. This is not hypothetical: during the session that wrote this file the
     deployed hash moved from 721f3499… to 2f633413… while the repo stayed put —
     a redeploy landed mid-session — and the only reason it was noticed is that
     the smoke suite's Edge payload guard went red. That guard runs at the end
     of a two-minute suite; this runs before a ten-minute live race that writes
     permanent ledger rows, so it is worth the second it costs.

     Best-effort ON PURPOSE: pack() reads 22 files off disk and a failure there
     must not block a race. A drift is a loud WARNING and not a stop, because
     "race the deployed build and say which one it was" is still a useful
     result — "race some build and not say which" is not. */
  try {
    const { pack } = await import('./pack-edge.mjs');
    const packed = await pack('hr-accrue');
    if (packed?.hash) {
      const match = packed.hash === deployedHash;
      console.log(`   repo packs to ${String(packed.hash).slice(0, 16)}…  ${match ? '— MATCH, the deployed build is the reviewed build' : '— MISMATCH'}`);
      if (!match) {
        console.log('\n   ⚠ THE DEPLOYED FUNCTION IS NOT THE ONE IN THIS REPO. Everything below still');
        console.log('     races a real engine, but the verdict describes the DEPLOYED bytes, not the');
        console.log('     bytes you can read. Either redeploy, or record the deployed hash beside the');
        console.log('     result so the two can be reconciled later:');
        console.log(`       deployed ${deployedHash}`);
        console.log(`       repo     ${packed.hash}\n`);
      }
    }
  } catch (e) {
    console.log(`   (could not pack the repo for comparison: ${String(e?.message || e).slice(0, 120)})`);
  }

  /* FAIL FAST WITHOUT A TERMINAL. The password is read from stdin by design
     (never argv, never an env var), which means a piped or closed stdin leaves
     the hidden-input readline waiting for a keypress that can never arrive —
     the process then hangs with no output at all. A silent hang is the worst
     diagnostic this tool could produce, so it is named instead. */
  if (!process.stdin.isTTY) {
    console.log('\n   STDIN IS NOT A TERMINAL, so the password cannot be prompted for.');
    console.log('   Run this from an interactive shell. The password is read from stdin on purpose:');
    console.log('   argv is visible in the process table and an env var leaks into child processes.');
    return 4;
  }
  const email = await ask('\n   throwaway account email: ');
  const password = await ask('   password (hidden)      : ', { hidden: true });
  if (!email || !password) {
    console.log('\n   No credentials entered — nothing was raced and nothing was written.');
    return 4;
  }
  const auth = await fetch(`${ctx.base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ctx.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  if (!auth?.access_token) {
    console.log('\nSIGN-IN FAILED —', JSON.stringify(auth).slice(0, 300));
    return 4;
  }
  ctx.jwt = auth.access_token;
  console.log(`\n   signed in — user ${auth.user.id}`);
  console.log('   ONE sign-in for the whole run; every child gets this token over its stdin, never argv.');

  // character present?
  const load0 = await hrLoad(ctx, ctx.slot);
  let env = envelopeOf(load0);
  if (!env) {
    const raw = load0;
    const err = raw.body?.error || `HTTP ${raw.status}`;
    const decision = diagnoseCharacter(raw.body, raw.status, a.provision);
    if (decision === 'needs_provision') {
      console.log(`\n   slot ${ctx.slot} has NO CHARACTER, so every POST would answer 409 no_character and`);
      console.log('   there would be nothing to race. This harness will not create one silently.');
      console.log('   Creating a character grants the server-authored starting kit (gold + equipment).');
      console.log('   If this really is the throwaway account, re-run adding --provision:');
      console.log(`\n     node tools/race-test.mjs --yes --provision${a.procs !== 2 ? ` --procs ${a.procs}` : ''}\n`);
      return 5;
    }
    if (decision === 'provision') {
      await ctx.rates.spend('ensure', 'hr_create_character');
      const mk = await postJson(ctx, '/rest/v1/rpc/hr_create_character', { p_slot: ctx.slot });
      console.log(`   hr_create_character -> HTTP ${mk.status} ${JSON.stringify(mk.body).slice(0, 200)}`);
      env = envelopeOf(await hrLoad(ctx, ctx.slot));
      if (!env) { console.log('   still no character after provisioning — stopping.'); return 5; }
    } else {
      console.log(`\n   hr_load failed: ${err}. Cannot establish a baseline; stopping.`);
      return 5;
    }
  }
  console.log(`   character: version ${env.version}, gold ${goldOf(env)}, activity ${JSON.stringify(env.state.active_kind)}/${JSON.stringify(env.state.active_id)}, accrued_to ${env.state.accrued_to}`);

  /* ── THE DIAGNOSTIC THAT STOPS A BOGUS VERDICT ─────────────────────────────
     `hr_rate_gate` refuses an UNKNOWN bucket by returning false, and
     set-activity.js reports that as 429 rate_limited — the identical answer it
     gives when the real 30/min limit is hit. So on a database where
     2026-08-15-activity-intent.sql has NOT been applied, every set_activity
     call answers 429 forever and a naive harness would report "rate limited,
     retry" for eternity. We have spent ZERO activity budget at this point, so a
     429 on the first call cannot be a rate limit and is named as what it is.
     A 400 bad_activity first proves the verb dispatches at all without spending
     any budget (the shape refusal happens before any database work). */
  const shapeProbe = await postJson(ctx, '/functions/v1/hr-accrue',
    { slot: ctx.slot, verb: 'set_activity', intentId: randomUUID(), activity: { kind: 'combat' } },
    { timeoutMs: ctx.timeoutMs });
  const verbState = diagnoseVerbProbe(shapeProbe.status, shapeProbe.body);
  console.log(`   verb probe: set_activity with a malformed declaration -> HTTP ${shapeProbe.status} ${JSON.stringify(shapeProbe.body).slice(0, 120)}  [${verbState}]`);
  if (verbState === 'verb_not_deployed') {
    console.log('\n   THE DEPLOYED BUILD DOES NOT KNOW set_activity. Only the accrue scenario can run.');
    console.log('   Redeploy hr-accrue, or run with --scenario accrue-vs-accrue.');
    names = names.filter((n) => n === 'accrue-vs-accrue');
    if (!names.length) return 6;
  }

  // make sure the character has a payable activity
  if (!env.state.active_kind || env.state.active_kind === 'idle') {
    console.log(`   the character is idle — setting activity to combat/${ctx.target} so a window can accrue`);
    await ctx.rates.spend('activity', 'preflight set_activity');
    const set = await postJson(ctx, '/functions/v1/hr-accrue',
      { slot: ctx.slot, verb: 'set_activity', intentId: randomUUID(), activity: { kind: 'combat', id: ctx.target } },
      { timeoutMs: ctx.timeoutMs });
    console.log(`   set_activity -> HTTP ${set.status} ${JSON.stringify(set.body).slice(0, 200)}`);
    if (set.status === 429) {
      const why = diagnoseActivity429(ctx.rates.spent('activity'));
      if (why === 'bucket_missing') {
        console.log('\n   429 ON THE FIRST ACTIVITY CALL OF THE RUN. We have spent no activity budget, so this');
        console.log('   is NOT a rate limit: hr_rate_gate does not know the \'activity\' bucket and fails');
        console.log('   closed (`else return false`). 2026-08-15-activity-intent.sql is not applied to');
        console.log('   this database. Every set_activity call will answer 429 forever, so nothing here');
        console.log('   can set an activity and no window can ever be payable. Stopping.');
      } else {
        console.log('\n   429 after real activity traffic — this one IS the 30/min limit. Wait and re-run.');
      }
      return 6;
    }
    env = envelopeOf(await hrLoad(ctx, ctx.slot)) || env;
    if (!env.state.active_kind || env.state.active_kind === 'idle') {
      console.log('\n   the activity pointer did not move. Stopping rather than racing an unpayable window.');
      return 6;
    }
  }

  // ── RUN ──────────────────────────────────────────────────────────────────
  const out = [];
  for (const name of names) {
    let res = null;
    for (let attempt = 0; attempt <= a.retries; attempt++) {
      res = await runScenario(ctx, name);
      printVerdict(res);
      if (res.verdict !== 'NOT-OVERLAPPED') break;
      if (attempt < a.retries) {
        ctx.staggerMs = Math.max(0, Math.floor(ctx.staggerMs / 2));
        console.log(`   retrying ${name} (${attempt + 1}/${a.retries}) with stagger ${ctx.staggerMs} ms…`);
      }
    }
    out.push(res);
  }

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  rule('SUMMARY');
  for (const r of out) console.log(`  ${String(r.verdict).padEnd(26)} ${r.name}${r.reason ? ` — ${r.reason}` : ''}`);
  const worst = out.some((r) => r.verdict === 'PROPERTY-VIOLATED') ? 1
    : out.some((r) => String(r.verdict).startsWith('INCONCLUSIVE')) ? 2
      : out.some((r) => r.verdict === 'NOT-OVERLAPPED') ? 3 : 0;
  console.log('');
  console.log(worst === 0
    ? '  ALL SCENARIOS RACED AND HELD. The cutover blocker "true concurrency has never been\n  executed" is closed on its own stated terms — two OS processes, measured overlap,\n  server-confirmed interleaving, exactly-once payment.'
    : '  NOT A CLEAN PASS. Read the verdict blocks above; each names what to do next.');
  console.log('\n  Residue left by this run: player_ledger rows (append-only, permanent until the wipe),');
  console.log('  player_intents rows (auto-pruned ~25 h), hr_rate_counters buckets, and real');
  console.log('  progression on the character. The activity pointer may have moved.');

  if (a.json) {
    fs.writeFileSync(a.json, JSON.stringify({ at: new Date().toISOString(), args: a, results: out }, null, 2));
    console.log(`\n  machine-readable results -> ${a.json}`);
  }
  return worst;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE SELF-TEST STAND-IN
//
// A local HTTP server that speaks the same three endpoints and can be told to
// misbehave — but ONLY under contention. That last part is the whole design:
// every fault fires only while more than one request is in flight, so the drain
// and the sequential control are always honest and the harness has to catch a
// defect that exists ONLY in the concurrent path. A stand-in that pays half the
// window on every call would be caught by arithmetic; one that pays half only
// when raced is the bug class this file exists for.
// ═══════════════════════════════════════════════════════════════════════════
const SELFTEST_MIN_SPAN_MS = 300;
const SELFTEST_READ_DELAY_MS = 260;

function makeStandIn(mode) {
  const state = {
    version: 0, gold: 0, xp: 0, accruedTo: Date.now(),
    activeKind: 'combat', activeId: 'slime', intents: new Map(),
  };
  let inflight = 0, hungOnce = false;
  let lock = Promise.resolve();
  const withLock = (fn) => { const p = lock.then(fn, fn); lock = p.then(() => {}, () => {}); return p; };

  const payoutFor = (spanMs) => ({
    ms: spanMs,
    gold: Math.floor(spanMs / 100),
    xp: { attack: Math.floor(spanMs / 50) },
    kills: Math.floor(spanMs / 1000),
  });
  const envelope = () => ({
    ok: true, version: state.version, now: new Date().toISOString(),
    state: {
      slot: 0, gold: state.gold, hp: 100, max_hp: 100,
      active_kind: state.activeKind, active_id: state.activeId,
      active_since: new Date(state.accruedTo).toISOString(),
      accrued_to: new Date(state.accruedTo).toISOString(),
    },
    skills: { attack: { xp: state.xp } },
    inventory: {},
  });

  const server = http.createServer((req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (req.method === 'GET' && req.url.startsWith('/functions/v1/hr-accrue')) {
      return send(200, { ok: true, fn: 'hr-accrue', payload_sha256: `selftest-${mode}` });
    }
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', async () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch { /* keep {} */ }

      if (req.url.startsWith('/auth/v1/token')) {
        return send(200, { access_token: 'selftest-token', user: { id: '00000000-0000-4000-8000-000000000001' } });
      }
      if (req.url.startsWith('/rest/v1/rpc/hr_load')) return send(200, envelope());
      if (req.url.startsWith('/rest/v1/rpc/hr_create_character')) return send(200, { ok: true, slot: 0, created: false });
      if (!req.url.startsWith('/functions/v1/hr-accrue')) return send(404, { ok: false, error: 'not_found' });

      inflight += 1;
      const contended = () => inflight > 1;
      try {
        // ── READ PHASE. The delay is what lets two callers observe the same
        //    watermark — i.e. it manufactures exactly the interleaving the live
        //    engine produces naturally over a ~1.4 s round trip.
        const snapWatermark = state.accruedTo;
        const snapVersion = state.version;
        const wasContended = contended();
        await sleep(SELFTEST_READ_DELAY_MS);
        const contendedNow = wasContended || contended();

        if (mode === 'hang' && contendedNow && !hungOnce) { hungOnce = true; return; /* never responds */ }
        if (mode === 'error500' && contendedNow) return send(500, { ok: false, error: 'server_error' });

        if (mode === 'serialised') {
          // Hold the lock across read AND apply: the second caller re-reads
          // fresh state, so nothing ever contends in the critical section.
          return await withLock(async () => {
            const span = Date.now() - state.accruedTo;
            if (span < SELFTEST_MIN_SPAN_MS) return send(200, { ok: true, accrued: false, reason: 'below_min_span', version: state.version });
            const p = payoutFor(span);
            state.gold += p.gold; state.xp += p.xp.attack; state.version += 1; state.accruedTo = Date.now();
            return send(200, { ok: true, accrued: true, version: state.version, away: p });
          });
        }

        const key = `${snapWatermark}|${snapVersion}`;
        const span = Date.now() - snapWatermark;
        if (span < SELFTEST_MIN_SPAN_MS) {
          return send(200, { ok: true, accrued: false, reason: 'below_min_span', version: state.version });
        }

        return await withLock(async () => {
          const replay = state.intents.has(key);
          if (replay && mode !== 'doublepay') {
            return send(200, { ok: true, accrued: false, reason: 'replayed', version: state.version });
          }
          state.intents.set(key, true);
          let p = payoutFor(span);
          if (mode === 'halfwindow' && contendedNow) p = payoutFor(Math.floor(span / 2));

          if (mode === 'phantom' && contendedNow) {
            // Reports a receipt; commits NOTHING. P2 and P3 must both fire.
            return send(200, { ok: true, accrued: true, version: state.version, away: p });
          }
          state.gold += p.gold; state.xp += p.xp.attack; state.version += 1;
          state.accruedTo = Date.now();
          return send(200, { ok: true, accrued: true, version: state.version, away: p });
        });
      } finally {
        inflight -= 1;
      }
    });
  });
  return { server, state };
}

const SELFTEST_CASES = [
  { mode: 'honest', expect: 'RACED', prop: null, why: 'the control — if THIS fails the harness is broken and every other result is meaningless' },
  { mode: 'doublepay', expect: 'PROPERTY-VIOLATED', prop: 'P1 EXACTLY-ONE-PAYMENT', why: 'the idempotency key is ignored under contention: the window is paid twice' },
  { mode: 'phantom', expect: 'PROPERTY-VIOLATED', prop: 'P2 CONSERVATION', why: 'a receipt is issued for money that never landed in player_state' },
  { mode: 'halfwindow', expect: 'PROPERTY-VIOLATED', prop: 'P4 WINDOW CONSERVATION', why: 'half the absence is silently confiscated — the failure shape this codebase has bled from most' },
  { mode: 'serialised', expect: 'NOT-OVERLAPPED', prop: null, why: 'the backend serialises, so nothing contends — must NOT be reported as a pass' },
  { mode: 'error500', expect: 'PROPERTY-VIOLATED', prop: 'LOCK', why: 'a 5xx under contention (the shape a 40P01 deadlock would take)' },
  { mode: 'hang', expect: 'PROPERTY-VIOLATED', prop: 'LOCK', why: 'a request that never returns — under the transaction pooler that is a leaked backend' },
];

/* ── PREFLIGHT DECISION TABLE ───────────────────────────────────────────────
   The branches that run BEFORE any race and decide whether the operator gets a
   real verdict. Driven with the exact response shapes production produces. The
   first row is the one that matters most: an unapplied activity migration and a
   genuine rate limit are the SAME HTTP answer, and telling them apart is the
   difference between a diagnosis and an infinite retry loop. */
const PREFLIGHT_CASES = [
  ['429 on the first activity call = the bucket does not exist', () => diagnoseActivity429(1), 'bucket_missing'],
  ['429 after real activity traffic = the actual 30/min limit', () => diagnoseActivity429(24), 'rate_limited'],
  ['400 unknown_verb = the deploy is behind the repo', () => diagnoseVerbProbe(400, { ok: false, error: 'unknown_verb' }), 'verb_not_deployed'],
  ['400 bad_activity = the verb dispatched fine', () => diagnoseVerbProbe(400, { ok: false, error: 'bad_activity' }), 'verb_present'],
  ['401 = the JWT was refused, not a verb problem', () => diagnoseVerbProbe(401, { ok: false, error: 'not_signed_in' }), 'not_signed_in'],
  ['500 = engine misconfiguration, stop', () => diagnoseVerbProbe(500, { ok: false, error: 'server_error' }), 'engine_error'],
  ['no_character without --provision = stop and explain', () => diagnoseCharacter({ ok: false, error: 'no_character' }, 200, false), 'needs_provision'],
  ['no_character with --provision = create it', () => diagnoseCharacter({ ok: false, error: 'no_character' }, 200, true), 'provision'],
  ['a real envelope = ready', () => diagnoseCharacter({ ok: true, version: 3 }, 200, false), 'ready'],
  ['hr_load rate limited is not a missing character', () => diagnoseCharacter({ ok: false, error: 'rate_limited' }, 200, true), 'load_rate_limited'],
  ['an HTTP failure is not a missing character', () => diagnoseCharacter(null, 503, true), 'load_failed'],
];

function runPreflightTable() {
  rule('PREFLIGHT DECISION TABLE — the branches that run before any race');
  let bad = 0;
  for (const [why, fn, expect] of PREFLIGHT_CASES) {
    let got;
    try { got = fn(); } catch (e) { got = `threw: ${e.message}`; }
    const ok = got === expect;
    if (!ok) bad++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${why}`);
    if (!ok) console.log(`        expected ${expect}, got ${got}`);
  }
  return bad;
}

async function selftest(a) {
  const preflightFails = runPreflightTable();

  rule('SELF-TEST — proving the harness can SEE a violation, not only report a pass');
  console.log('  Same child processes, same scenario code, same verdict logic. Only the base URL');
  console.log('  differs from a live run. Every fault below fires ONLY while more than one request');
  console.log('  is in flight, so the drain and the sequential control are always honest — the');
  console.log('  harness has to catch a defect that exists only in the concurrent path.');
  console.log(`  ${a.procs} processes, ${SELFTEST_MIN_SPAN_MS} ms minimum span, ${SELFTEST_READ_DELAY_MS} ms read phase.\n`);

  const rows = [];
  for (const c of SELFTEST_CASES) {
    const { server } = makeStandIn(c.mode);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const ctx = {
      base: `http://127.0.0.1:${port}`, key: 'selftest-anon', jwt: null,
      slot: 0, procs: a.procs, windowSec: 0.8, timeoutMs: 2500,
      leadMs: 400, staggerMs: 20, verbose: a.verbose,
      target: 'slime', target2: 'rat',
      windowFloorMs: 250, perApplyMs: 400, rateBand: [0.35, 2.5],
      rates: new RateBook({ accrue: 1000, activity: 1000, load: 1000, ensure: 1000 }),
    };
    // The sign-in path is exercised too — against the stand-in, non-interactively.
    const auth = await postJson(ctx, '/auth/v1/token?grant_type=password', { email: 'selftest@localhost', password: 'selftest' }, { auth: false });
    ctx.jwt = auth.body?.access_token || null;

    console.log(`\n${'═'.repeat(78)}`);
    console.log(`CASE ${c.mode}  — expect ${c.expect}${c.prop ? ` on ${c.prop}` : ''}`);
    console.log(`  ${c.why}`);
    const res = await runScenario(ctx, 'accrue-vs-accrue');
    printVerdict(res);
    await new Promise((r) => server.close(r));

    const verdictOk = res.verdict === c.expect;
    const propOk = !c.prop || (res.violations || []).some((v) => v.prop === c.prop);
    rows.push({ mode: c.mode, expect: c.expect, got: res.verdict, prop: c.prop, propOk, ok: verdictOk && propOk, res });
    console.log(`  SELF-TEST ${verdictOk && propOk ? 'PASS' : 'FAIL'} — expected ${c.expect}${c.prop ? ` / ${c.prop}` : ''}, got ${res.verdict}`
      + (c.prop ? ` / ${(res.violations || []).map((v) => v.prop).join(',') || 'no violation'}` : ''));
  }

  rule('SELF-TEST RESULT');
  for (const r of rows) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.mode.padEnd(12)} expected ${r.expect.padEnd(20)} got ${String(r.got).padEnd(20)}`
      + (r.prop ? `[${r.prop}${r.propOk ? '' : ' NOT RAISED'}]` : ''));
  }
  const failed = rows.filter((r) => !r.ok);
  console.log(`  ${preflightFails ? 'FAIL' : 'PASS'}  preflight decision table (${PREFLIGHT_CASES.length - preflightFails}/${PREFLIGHT_CASES.length})`);
  console.log('');
  if (failed.length || preflightFails) {
    console.log(`  ${failed.length + preflightFails} SELF-TEST CHECKS FAILED — the harness cannot be trusted against production.`);
    console.log('  Fix this before running it live: a race test that cannot see a violation manufactures');
    console.log('  confidence, which is worse than having no race test at all.');
    return 1;
  }
  console.log(`  ${rows.length}/${rows.length} PASSED. The harness measures overlap, distinguishes contention from`);
  console.log('  coincidence, and RAISES the correct named property on each injected defect —');
  console.log('  including the two directions that matter most: paid twice, and paid for half the');
  console.log('  window. The honest case passes and every violation case fails, which is the only');
  console.log('  combination that makes a green live run mean anything.');
  return 0;
}

// ═══════════════════════════════════════════════════════════════════════════
const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(fs.readFileSync(SELF, 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n'));
  process.exit(0);
}
/* `process.exitCode` rather than `process.exit()`. On Windows, calling exit()
   while a piped stdin handle is mid-teardown aborts libuv
   (`!(handle->flags & UV_HANDLE_CLOSING)`) — which replaced this tool's real
   exit code with 127 AFTER it had printed the correct diagnosis. Setting the
   code and letting the event loop drain reports the truth. */
if (args.worker) {
  await runWorker();
} else if (args.selftest) {
  process.exitCode = await selftest(args);
} else {
  process.exitCode = await main(args);
}
if (process.stdin.isTTY === undefined || !process.stdin.isTTY) process.stdin.unref?.();
