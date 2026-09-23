// ============================================================================
// supabase/functions/hr-accrue/tick.js — THE `op:'tick'` ENTRY.
//
// WORLD_TICK_DESIGN.md §15c, "The `op:'tick'` entry, specified". Milestone 1b.
//
// ── WHY THIS IS ITS OWN FILE AND ITS OWN REVIEW ─────────────────────────────
// It is the ONE place in the system where a request reaches the engine with no
// player behind it. `index.ts` verifies a player's JWT as its second statement
// and derives `user` from it; a tick request is not about one player and
// carries no player token, so this branch sits BEFORE that call. That is a
// deliberate bypass of the gate `tests/edge-jwt-gate.mjs` exists to defend, and
// everything below exists to make the bypass narrower than the thing it
// bypasses.
//
// ── THE TWO HEADERS, AND WHY THERE ARE TWO ──────────────────────────────────
//   Authorization: Bearer …   the project's GATEWAY key (the anon key is a
//                             valid JWT and the gateway accepts it). Checked by
//                             Supabase, before this function runs, because
//                             `verify_jwt = true` stays on. It is PUBLIC and it
//                             is NOT the tick's authorisation.
//   X-HR-Tick-Auth            the tick bearer, Vault `hr_tick_shared_secret`,
//                             env `HR_TICK_SHARED_SECRET`. Checked HERE, in
//                             constant time. This one is the authorisation.
// Conflating them is the whole exploit, which is why the gateway key never
// appears in this file.
//
// ── WHAT THIS ENTRY ACCEPTS FROM THE REQUEST BODY ───────────────────────────
// Four things, and every one of them is a SELECTOR or a bounded geometry knob:
//
//   op            must be the literal 'tick'.
//   roster[].user_id, roster[].slot
//                 WHICH CHARACTERS TO CONSIDER. Not authority: the fence
//                 (`hr_tick_settle`) refuses any character the ROSTER did not
//                 lease in this driver's holder name, and the roster is
//                 executable by `hr_tick` — a role this function cannot become.
//                 So naming a character here buys nothing: it can only narrow
//                 the set the server would have ticked anyway.
//   cadence_ms, flush_ms
//                 WINDOW GEOMETRY, couriered from `hr_tick_config` (which
//                 `hr_engine` holds no privilege to read) and CLAMPED here to
//                 the same ranges that table's CHECK constraints allow. They
//                 carry no value and no instant; the total time a fire can pay
//                 for is `[server watermark, server now()]` whatever they say.
//
// EVERYTHING ELSE IN THE BODY IS IGNORED, INCLUDING `holder`, `shadow` AND THE
// ROSTER'S `state`, `version`, `seed`, `accrued_to` AND `active_*`. Each of
// those is re-derived from the database inside this request:
//
//   holder      `left('cron:' || current_database(), 64)` — the byte-identical
//               expression the pg_cron driver stamps its lease with.
//   watermark   from the FENCE, not from the body: a deliberately-stale probe
//               window is refused with `window_already_settled` and the refusal
//               CARRIES the effective mark (`greatest(accrued_to,
//               shadow_accrued_to)`), which is the only way to read a table
//               `hr_engine` is revoked from. Nothing is written by the probe.
//   state/ver   `hr_state_of(user, slot)` in this request's own transaction.
//   seed        `hr_seed(user, slot, 'accrue:' || <watermark>)`, per window.
//   now         `now()`, Postgres's clock.
//   shard       pinned to 0, because `hr_shard_of` is `select 0` and the driver
//               rosters shard 0 only. If sharding ever becomes real this pin
//               must become a read, and `hr_engine` will need the grant.
//
// ── WHAT IT NEVER DOES ──────────────────────────────────────────────────────
//   • never calls `hr_apply` — only `hr_tick_settle`, the fenced door;
//   • never touches a player's row on any other path;
//   • never parses the body, reads an env var other than the secret, or opens a
//     transaction before the bearer comparison has SUCCEEDED;
//   • never logs, returns or raises anything derived from the secret;
//   • never runs a second gather path: every number comes out of
//     `settleGatherSession` → `gatherTick` → `computeAccrual` (AWAY-12).
//
// PURE ESM, Node + Deno, so a Node test drives the bytes that deploy. No `?v=`
// (not under src/**).
// ============================================================================

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import {
  CHANNEL as GATHER_CHANNEL, DEFAULT_CADENCE_MS, DEFAULT_FLUSH_MS,
  sessionFromRoster as gatherSessionFromRoster, settleGatherSession,
} from './tick-gather.js';
import {
  CHANNEL as COMBAT_CHANNEL,
  sessionFromRoster as combatSessionFromRoster, settleCombatSession,
} from './tick-combat.js';
/* THE CHAIN CARRIER, ONE DEFINITION, SHARED WITH THE OFFLINE GUARDS
   (services/world-tick/contract.js re-exports the same module — AWAY-12).
   `shadowStateOf` serialises the engine's own output state; `applyShadowState`
   lays it back over a session read from `hr_state_of`. Neither computes a
   delta and neither is authority. */
import { shadowStateOf, applyShadowState, SHADOW_STATE_V } from './tick-contract.js';

/* ── THE DISPATCH TABLE (Security S-8, 2026-09-23) ───────────────────────────
   Until today this file imported ONE `CHANNEL` — gather's — and used it three
   ways: as the `p_channel` of the watermark probe, as the kind a character's
   pointer had to equal, and as the `p_channel` of the settle. A combat
   character therefore could not be settled at all. Arming `combat` in
   `hr_tick_config.channels` would have made `hr_tick_roster` hand one out under
   a stamped lease, and this file would then have asked the fence about it under
   the WRONG channel — where step (4) looks the lease up by
   `(user, slot, channel)` and finds nothing, and step (5) refuses
   `channel_moved`. Every combat character would have burned one of
   `batch_limit` slots per fire, taken from the running gather cohort, and
   journalled NOTHING: a 48 h parity read that is empty by construction while
   every dashboard stays green.

   So the channel is a property of the CHARACTER, read from `hr_state_of` in
   this request, and this table is the one place that maps it to the code that
   settles it. A kind with no entry here is SKIPPED by name — never fenced under
   another channel's spelling, which is the shape that made S-8 invisible.

   `sessionFromRoster` and the settler are taken as a PAIR on purpose: each
   channel's session builder asserts its own `row.active_kind` and throws on a
   mismatch, so a table wired to a mismatched pair fails loudly on the first
   character rather than silently pricing one channel with another's rules. */
export const CHANNELS = Object.freeze({
  [GATHER_CHANNEL]: Object.freeze({
    channel: GATHER_CHANNEL,
    sessionFromRoster: gatherSessionFromRoster,
    settle: settleGatherSession,
  }),
  [COMBAT_CHANNEL]: Object.freeze({
    channel: COMBAT_CHANNEL,
    sessionFromRoster: combatSessionFromRoster,
    settle: settleCombatSession,
  }),
});

/* ── CHANNELS THE DATABASE ADMITS AND THIS FILE CANNOT SETTLE ────────────────
   `hr_tick_config_channels_ck` (2026-09-22-world-tick-combat-channel.sql §1)
   is `channels <@ array['combat','gather','artisan']`, so `artisan` is a value
   an operator CAN put in that column today. There is no artisan settler: the
   channel is declared here, by name and with its reason, so that

     (a) `tickOne` refuses an artisan character with `channel_not_driven`
         rather than fencing it under someone else's channel, and
     (b) the guard can assert that every channel the CHECK admits is either
         DRIVEN or DECLARED-UNDRIVEN — so a fourth value added to that CHECK
         without a driver goes red here instead of being discovered as an empty
         parity read three milestones later.

   ARMING AN UNDRIVEN CHANNEL IS AN OPERATOR ERROR, and it is fail-closed: the
   characters are leased and skipped by name, nothing is paid and nothing is
   journalled. It still costs them a roster slot per fire, which is why this is
   a declaration and not a silent default. */
export const UNDRIVEN_CHANNELS = Object.freeze({
  artisan: 'no artisan settler exists; the channel is admitted by '
    + 'hr_tick_config_channels_ck but must never be armed until one ships',
});

/* The header the tick bearer rides on. Lower-case because `Headers.get` is
   case-insensitive and every comparison in this file should be too. */
export const TICK_HEADER = 'x-hr-tick-auth';

/* The one `op` this entry answers to. */
export const TICK_OP = 'tick';

/* THE MINIMUM SECRET LENGTH, AND IT FAILS CLOSED. The Vault contract mints 32
   random bytes as 64 hex characters (`encode(gen_random_bytes(32),'hex')`), so
   anything shorter than 32 characters is a typo, a truncation or a placeholder
   — never the real secret. An unset or short env var therefore does not mean
   "skip the check", it means REFUSE EVERY TICK REQUEST, which is the same
   direction as every other gate in CLAUDE.md §6. */
export const MIN_SECRET_LEN = 32;

/* Blast radius per fire. The roster's own cap is 500 (`c_max_rows`) and the
   config's is 500; a body naming more than that is truncated rather than
   refused, because a refusal would let a forged oversize body stop the whole
   world tick. */
export const MAX_ROSTER = 500;

/* THE BODY CEILING (Security §7.8, 2026-09-21). A fire carries at most
   `batch_limit` (<= 500) rows, and a row is a full `hr_state_of` envelope — a
   few KB at the top of the range. 4 MiB is a comfortable multiple of the
   largest honest batch and still a hard bound, which is the point: the branch
   above this one runs before `verifyJwt`, so the only thing between a socket
   and `JSON.parse` is the bearer. Holding the bearer must not also buy the
   right to make this function allocate without limit — the function that
   writes all player value is the worst possible thing to be able to stall.

   CHECKED TWICE, and that is deliberate: `Content-Length` is a CLAIM by the
   sender and is refused early when it is honest, but a chunked or lying sender
   omits it, so the bytes are counted as they arrive and the read is ABORTED at
   the same ceiling. A header check alone is not a cap. */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

/* Engine polls per character per fire. `toMs` is already capped at one flush
   window below, so this is the second, independent bound — the one that still
   holds if a future caller widens the first. */
export const MAX_POLLS = 64;

/* The ranges `hr_tick_config`'s CHECK constraints allow, restated here because
   the edge cannot read that table. Restating a catalogue is a drift risk and is
   accepted ONLY because these two are clamps rather than values: the worst a
   drifted bound can do is change window geometry inside a range the database
   itself would permit, and `tests/edge-tick-gate.mjs` T-G1 reads the migration
   text and fails if the two ever disagree. */
export const CADENCE_MS_MIN = 5000;
export const CADENCE_MS_MAX = 300000;
export const FLUSH_MS_MIN = 10000;
export const FLUSH_MS_MAX = 900000;

/* The probe window's lower bound. Any instant strictly below every real
   watermark works; the epoch is the honest spelling of "certainly already
   settled" and cannot be confused with a real window by a reader. */
const PROBE_FROM_ISO = '1970-01-01T00:00:00.000Z';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* THE BOUNDED READ. Returns the parsed body, or `null` for "too big or not
   JSON" — which the caller answers as `bad_request` WITHOUT saying which,
   because a body-shaped oracle on this branch is the same mistake as a
   length-shaped one on the bearer.

   It is a pure function of a Request-like object so a Node test can drive it
   with a real `Request`; `body` may be absent (a Response-less stub), in which
   case there is nothing to read and `{}` is the honest answer. */
export async function readTickBytes(req, limit = MAX_BODY_BYTES) {
  const declared = Number(req.headers && req.headers.get
    ? req.headers.get('content-length') : NaN);
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!req.body || typeof req.body.getReader !== 'function') {
    /* No stream to meter (a stub, or a runtime that buffered it already). Fall
       back to the whole-body read, still bounded by the length check above, and
       still returned as BYTES — `text()` then `TextEncoder` round-trips through
       the same UTF-8 the sender used, which is what the mac is computed over. */
    try {
      if (typeof req.text === 'function') {
        const t = await req.text();
        const b = new TextEncoder().encode(t);
        return b.byteLength > limit ? null : b;
      }
      if (typeof req.json === 'function') {
        /* Last resort, for a stub that offers only `json()`: re-serialise. The
           bytes are then OURS rather than the sender's, so `tickBodyAuthOk`
           will refuse unless they happen to match — which is the safe
           direction, and the reason the real runtime never lands here. */
        return new TextEncoder().encode(JSON.stringify(await req.json()));
      }
      return null;
    } catch { return null; }
  }
  const reader = req.body.getReader();
  const chunks = [];
  let n = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > limit) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } catch { return null; }
  const buf = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) { buf.set(c, at); at += c.byteLength; }
  return buf;
}

/* The parse, SEPARATED FROM THE READ so that authentication can sit between
   them. `null` means "not JSON"; the caller answers `bad_request`, and by then
   the caller already holds the secret, so that answer is not an oracle. */
export function parseTickBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) return null;
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}

/* The old whole-body read, kept because the bound is worth asserting on its own
   and the guard drives it directly. NOTHING IN THE REQUEST PATH CALLS IT: the
   entry reads bytes, authenticates them, and only then parses (§the token
   block below). */
export async function readTickBody(req, limit = MAX_BODY_BYTES) {
  const bytes = await readTickBytes(req, limit);
  return bytes === null ? null : parseTickBytes(bytes);
}

// ═══════════════════════════════════════════════════════════════════════════
// THE TOKEN — DERIVED PER FIRE (Security T-5.3, 2026-09-22)
//
// The static 64-hex bearer is GONE. It transited `net.http_request_queue` and
// `net._http_response`, both SELECT-to-PUBLIC by a grant `supabase_admin` made
// and `postgres` cannot revoke, so its confidentiality rested on PostgREST's
// exposed-schema list and on the absence of a bridge — reachability, not
// privilege. T-5.3 makes replacing it the hard condition on the tick ever
// PAYING. WORLD_TICK_DESIGN.md §17 is the design.
//
//     X-HR-Tick-Auth: v1 t=<bucket> b=<body_sha256_hex> m=<hmac_sha256_hex>
//
//       bucket = floor(epoch_seconds / 30)
//       m      = hmac_sha256(key = HR_TICK_SHARED_SECRET,
//                            msg = bucket + '.' + body_sha256_hex)
//
// FOUR CHECKS, AND NONE OF THEM IS REDUNDANT:
//   1. the secret is usable at all (>= MIN_SECRET_LEN) — else refuse everything;
//   2. the header parses as exactly this shape, both digests 64 LOWER-CASE hex;
//   3. `bucket` is within ±1 of ours — a ≤90 s window, the flush cadence, far
//      wider than any Postgres↔edge skew and narrow enough that a captured
//      header expires before the next flush;
//   4. sha256(the body we actually received) === `b`, AND `m` verifies over
//      `t.b`, constant time.
// (4) is two halves and both are load-bearing: `m` covers only `t` and `b`, so
// WITHOUT THE BODY HASH CHECK a captured triple would authenticate any body at
// all. That check is the body binding, and it is why there is no nonce.
//
// ── WHY NO NONCE AND NO PER-ISOLATE REPLAY CACHE ───────────────────────────
// At a 10 s cadence three fires land in each 30 s bucket, and when the roster
// has not moved the driver's body is BYTE-IDENTICAL — so `t`, `b` and therefore
// `m` are identical too. An LRU keyed on the token would refuse the driver's own
// second and third legitimate fire of every bucket: an outage with a
// security-shaped name. Per-isolate memory would not be a control anyway (N
// isolates behind one URL, recycled, catching an unknown fraction). T-5.3 says
// the same: "no nonce table, no new row growth".
//   RESIDUAL R-T1: a verbatim replay inside the ≤90 s window is
//   indistinguishable from an extra cron fire. The fence refuses any character
//   the roster did not lease in the driver's own holder name, the watermark CAS
//   refuses a second payment for a settled window (S-3), and accrual is bounded
//   to [watermark, now()]. IT CANNOT DOUBLE-PAY, CANNOT NAME AN UNLEASED
//   CHARACTER, AND CANNOT MOVE A WATERMARK BACKWARDS.
//
// ── THE ORDERING CHANGE, AND WHAT IT COSTS ─────────────────────────────────
// The mac binds the body hash, so the bytes must be READ before they can be
// authenticated. Shape and window are checked FIRST and allocate nothing; the
// read is bounded by MAX_BODY_BYTES exactly as before; nothing is PARSED and
// nothing touches the database until the mac verifies. RESIDUAL R-T2: a caller
// presenting a syntactically valid in-window header — which needs no secret,
// because the shape is not authenticated — can make the function buffer up to
// 4 MiB. The ceiling is the control, doing the job it was already sized for.
//   Net: the body is now AUTHENTICATED BEFORE IT IS PARSED, which the static
//   form never was.
// ═══════════════════════════════════════════════════════════════════════════

/* Is this env var usable as the tick secret at all? Split out so the refusal
   path can be asserted without an env var and without a request. */
export function tickSecretUsable(secret) {
  return typeof secret === 'string' && secret.length >= MIN_SECRET_LEN;
}

/* The bucket width and the skew tolerance. 30 s × {n-1, n, n+1} = a ≤90 s
   acceptance window, which is T-5.3's number and the gather flush cadence. */
export const TICK_BUCKET_SECONDS = 30;
export const TICK_BUCKET_SKEW = 1;

/* The token version tag. A future v2 changes THIS and the migration together;
   there is deliberately no multi-version accept path (WORLD_TICK_DESIGN.md
   §17.9 — the cutover is one form at a time, behind the kill switch). */
export const TICK_TOKEN_VERSION = 'v1';

/* THE SHAPE, PINNED. Lower-case hex only: accepting both cases would mean two
   spellings of one digest and a comparison that has to normalise before it can
   be constant time. The driver emits `encode(…, 'hex')`, which is lower-case. */
const TOKEN_RE = /^v1 t=(0|[1-9][0-9]{0,15}) b=([0-9a-f]{64}) m=([0-9a-f]{64})$/;

/* Parse and nothing else — no secret is touched here, so a malformed header
   costs a regex and not a digest. Returns null for anything that is not
   exactly the shape. */
export function parseTickToken(presented) {
  if (typeof presented !== 'string') return null;
  const m = TOKEN_RE.exec(presented);
  if (m === null) return null;
  const bucket = Number(m[1]);
  if (!Number.isSafeInteger(bucket) || bucket <= 0) return null;
  const out = Object.create(null);
  out.bucket = bucket;
  out.bodySha = m[2];
  out.mac = m[3];
  return out;
}

/* The bucket this instant belongs to. `nowMs` is a parameter so every arm can
   drive the clock instead of sleeping. */
export function tickBucketOf(nowMs) {
  return Math.floor(nowMs / 1000 / TICK_BUCKET_SECONDS);
}

/* ±TICK_BUCKET_SKEW buckets. A token from the future is refused as firmly as a
   stale one: a clock that far ahead is a broken driver, not a slow network. */
export function tickWindowOk(bucket, nowMs) {
  if (!Number.isSafeInteger(bucket)) return false;
  return Math.abs(bucket - tickBucketOf(nowMs)) <= TICK_BUCKET_SKEW;
}

/* The mac the driver should have sent for this (bucket, body hash). Exported so
   the guard can build a real token rather than a plausible-looking string. */
export function tickTokenMac(bucket, bodyShaHex, secret) {
  return createHmac('sha256', secret)
    .update(`${bucket}.${bodyShaHex}`, 'utf8').digest('hex');
}

/* The sha256 of the bytes as they arrived. `Uint8Array` in, lower-case hex out,
   so it is comparable to the driver's `encode(digest(…), 'hex')` directly. */
export function tickBodySha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/* CONSTANT TIME, AND LENGTH-INDEPENDENT.
   `timingSafeEqual` throws on a length mismatch, and catching that throw would
   itself be the length oracle — so both sides are hashed to a fixed 32 bytes
   FIRST and the comparison is always over 32 bytes. A wrong guess therefore
   costs exactly what a right one costs, whatever its length.

   Both arguments here are hex digests rather than secrets, but the discipline
   stays: this is the function that answers "is the presented mac the right
   one", and that answer must not be reachable one character at a time. */
export function tickMacOk(presented, expected) {
  if (typeof presented !== 'string' || typeof expected !== 'string') return false;
  if (presented.length === 0 || expected.length === 0) return false;
  const a = createHash('sha256').update(presented, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/* THE GATE, AS A PURE FUNCTION OF (headers, env, clock). Stage one of two: it
   decides whether this is a tick request at all, and whether the token is
   well-formed and fresh — WITHOUT reading the body, because the body is the
   thing the rest of the check is about.

   Three answers, and the caller in index.ts must handle all three:
     null                 → not a tick request; fall through to the player path,
                            byte for byte unchanged.
     { ok:false, … }      → a tick request that failed. 401 `not_signed_in` —
                            the SAME body the player path returns for a bad
                            token, so this branch is not an oracle for "does
                            op:tick exist here", and the same body for EVERY
                            reason, so it is not an oracle for which check bit.
     { ok:true, token }   → the shape and the window hold. `token` must then be
                            carried to `tickBodyAuthOk` with the bytes; nothing
                            else may run first.

   THE DISCRIMINATOR IS THE HEADER'S PRESENCE, NEVER THE BODY. A request with no
   `X-HR-Tick-Auth` is simply not a tick request and is handled by the player
   path exactly as it was before this file existed — including a body that says
   `op: 'tick'`, which reaches `parseIntent` and is answered as that caller's own
   accrual, never as a tick. */
export function tickGate(headers, secret, nowMs = Date.now()) {
  const presented = headers && typeof headers.get === 'function'
    ? headers.get(TICK_HEADER) : null;
  if (presented === null || presented === undefined) return null;
  const refuse = { ok: false, status: 401, body: { ok: false, error: 'not_signed_in' } };
  if (!tickSecretUsable(secret)) return refuse;
  const token = parseTickToken(presented);
  if (token === null) return refuse;
  if (!tickWindowOk(token.bucket, nowMs)) return refuse;
  return { ok: true, token };
}

/* Stage two: the body binding and the mac, in that order. `bytes` is exactly
   what arrived — not a re-serialisation of a parsed object, which would be a
   different byte string and would defeat the whole point.

   `bytes === null` means the read was refused (over the ceiling, or the stream
   died). That is a FALSE, not a separate answer: a body we could not read is a
   body we could not authenticate, and answering it differently would hand an
   unauthenticated caller an oracle the static form never gave. */
export function tickBodyAuthOk(token, bytes, secret) {
  if (!tickSecretUsable(secret)) return false;
  if (!token || typeof token.bodySha !== 'string' || typeof token.mac !== 'string') return false;
  if (!(bytes instanceof Uint8Array)) return false;
  if (tickBodySha256(bytes) !== token.bodySha) return false;
  return tickMacOk(token.mac, tickTokenMac(token.bucket, token.bodySha, secret));
}

// ═══════════════════════════════════════════════════════════════════════════
// THE BODY — SELECTORS ONLY
// ═══════════════════════════════════════════════════════════════════════════

/* Freshly built, null-prototype, field by field — the same discipline
   `./request.js` `parseIntent` follows for the player path, and for the same
   reason: nothing derived from the body may be spread into anything. */
export function parseTickBody(raw) {
  const b = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const out = Object.create(null);
  out.op = typeof b.op === 'string' ? b.op : null;
  out.cadenceMs = clampInt(b.cadence_ms, CADENCE_MS_MIN, CADENCE_MS_MAX, DEFAULT_CADENCE_MS);
  out.flushMs = clampInt(b.flush_ms, FLUSH_MS_MIN, FLUSH_MS_MAX, DEFAULT_FLUSH_MS);
  /* The config's own `flush_seconds >= cadence_seconds` constraint, restated:
     a flush shorter than the cadence is the ledger-volume failure §15c prices,
     and it must not be reachable by naming two numbers in a body. */
  if (out.flushMs < out.cadenceMs) out.flushMs = out.cadenceMs;
  out.roster = parseSelectors(b.roster);
  return out;
}

/* TWO FIELDS PER ROW AND NOTHING ELSE. `state`, `version`, `seed`,
   `accrued_to`, `active_kind`, `active_id`, `active_since` and `shard` are
   present in the driver's POST and are deliberately NOT read: every one of them
   is re-derived from the database below. A row that is malformed is dropped,
   not refused — one bad row must not cost the other 199 their window. */
export function parseSelectors(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  const seen = new Set();
  for (const row of raw) {
    if (out.length >= MAX_ROSTER) break;
    if (!row || typeof row !== 'object') continue;
    const userId = typeof row.user_id === 'string' && UUID_RE.test(row.user_id)
      ? row.user_id.toLowerCase() : null;
    const slot = Number.isInteger(row.slot) && row.slot >= 0 && row.slot < 100
      ? row.slot : null;
    if (userId === null || slot === null) continue;
    const key = `${userId}:${slot}`;
    if (seen.has(key)) continue;          // a duplicated row is one character
    seen.add(key);
    const sel = Object.create(null);
    sel.userId = userId;
    sel.slot = slot;
    out.push(sel);
  }
  return out;
}

function clampInt(v, lo, hi, dflt) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

// ═══════════════════════════════════════════════════════════════════════════
// THE RUN
// ═══════════════════════════════════════════════════════════════════════════

/* One statement, one transaction, `set local role hr_engine` re-issued inside
   it — the `exec` seam index.ts already owns. This module never opens a
   transaction of its own and holds no connection. */

/** `hr_tick_settle`, the ONLY writer this entry can reach. */
async function fence(exec, args) {
  /* ── THE TENTH ARGUMENT: THE SHADOW'S CONTINUATION STATE (2026-09-23) ────
     NULL on every call but a shadow settle, and the fence REFUSES a non-null
     one on the armed branch (`shadow_state_while_armed`) rather than ignoring
     it — a carrier that is silently dropped on the branch that pays is how a
     stale proposal would reach hr_apply. It is declared `default null` in SQL
     so the migration can apply BEFORE this payload is deployed without the
     nine-argument probe breaking for the length of the deploy window. */
  const [r] = await exec(
    'select public.hr_tick_settle($1::text, $2::uuid, $3::int, $4::text, $5::bigint,'
    + ' $6::timestamptz, $7::timestamptz, $8::uuid, $9::text::jsonb,'
    + ' $10::text::jsonb) as res',
    [args.holder, args.user, args.slot, args.channel, args.version,
      args.windowFrom, args.windowTo, args.intentId, args.delta,
      args.shadowState ?? null]);
  return (r && r.res) || null;
}

/* THE KILL SWITCH, READ BEFORE ANY WORK — AND READ FROM THE FENCE, because
   `hr_tick_config` is revoked from `hr_engine` and a flag this entry cached or
   took from the body would not be a kill switch at all.

   The fence checks `enabled` at step (1) and its arguments at step (2), so a
   call with a null user is answered by exactly one of two codes and touches
   nothing either way:
       tick_disabled   → the switch is off. Return, having run no engine.
       bad_arguments   → the switch is on. Proceed.
   Anything else — a missing function, a renamed code, a permission error —
   fails CLOSED and the fire is a no-op. */
export async function probeKillSwitch(exec, holder) {
  const res = await fence(exec, {
    holder, user: null, slot: null, channel: null, version: null,
    windowFrom: null, windowTo: null, intentId: null, delta: null,
  });
  const err = res && res.error;
  if (err === 'tick_disabled') return { enabled: false };
  if (err === 'bad_arguments') return { enabled: true };
  return { enabled: false, unexpected: String(err || 'no_answer') };
}

/* THE WATERMARK PROBE. A window starting at the epoch is, by construction,
   already settled for every character that exists — so the fence answers
   `window_already_settled` and the refusal carries `accrued_to`, which IS
   `greatest(player_state.accrued_to, hr_tick_ownership.shadow_accrued_to)`
   evaluated under the fence's own row lock. That is the only way this role can
   learn the shadow mark, and reading it here rather than from the body is what
   makes "the server picks whose world ticks, and from when" true rather than
   asserted.

   It is also the LEASE and OWNERSHIP check, for free and before any engine
   time is spent: steps (3)–(5) of the fence run first, so a character this
   driver does not hold, does not own, or is no longer gathering is refused
   here with its own code. Nothing is written on any of those paths.

   ⚠ `channel` IS THE CHARACTER'S OWN, NOT A CONSTANT (Security S-8). The
     fence looks the lease up by `(user, slot, channel)` at step (4) and
     compares `player_state.active_kind` to it at step (5), so probing under a
     hard-coded 'gather' asks a combat character's question about a lease that
     does not exist and reads back `not_tick_owned` — indistinguishable from an
     unleased character, and the reason the combat shadow could not produce one
     row. The caller reads `active_kind` from `hr_state_of` and passes it. */
export async function probeWatermark(exec, holder, sel, nowIso, channel) {
  const res = await fence(exec, {
    holder, user: sel.userId, slot: sel.slot, channel,
    version: null, windowFrom: PROBE_FROM_ISO, windowTo: nowIso,
    intentId: '00000000-0000-0000-0000-000000000000',
    delta: JSON.stringify({ accrued_to: nowIso }),
  });
  const err = res && res.error;
  if (err === 'window_already_settled') {
    const mark = res.accrued_to ? Date.parse(String(res.accrued_to)) : NaN;
    if (!Number.isFinite(mark)) return { ok: false, reason: 'unreadable_watermark' };
    /* THE VERBATIM SPELLING TRAVELS WITH THE MILLISECONDS (T-2). `accrued_to`
       arrives as the fence's own jsonb rendering of the mark — microseconds and
       `+00:00` included — and that string IS the per-window PRNG label the
       accrue path names. `Date.parse` truncates it to ms, which is the right
       number for the window arithmetic and the wrong text for the label, so
       both are kept and neither is re-derived from the other. */
    /* ── THE CARRIER RIDES THE SAME REFUSAL AS THE MARK (design 4) ───────
       The alternative was `hr_tick_roster`'s row. It was rejected, and the
       reason is the sentence the fence exists to keep true: the roster is
       executable by `hr_tick` and by NOTHING ELSE, so its row does not reach
       this role directly — it arrives in the driver's REQUEST BODY, via
       `hr_tick_cron_run`'s payload. Routing the continuation state through
       the body would make "the server picks whose world ticks, and from
       when" a claim about a POST rather than about a row somebody else
       wrote, and a tick host that could edit its own payload could hand the
       engine any hp, any recovery clock and any bag it liked. It journals
       nothing tradeable today, but it is the measurement that gates ARMING,
       and a measurement a caller can author is not one.
       This refusal is read under the fence's own `for update` on the
       ownership row, in this role's own transaction, on the same statement
       that reports the mark — one lock, one answer, no second read.

       `shadow` is the fence's own `hr_tick_config.shadow`, never the body's:
       the driver must know the mode BEFORE it settles, because sending a
       state on the armed branch is a refusal by design. If the operator arms
       between this probe and the settle below, that one settle is refused
       `shadow_state_while_armed`, loudly and countably, and the next fire
       runs armed with no carrier — the tick pays nothing rather than paying
       against a proposal built in the other mode. */
    return {
      ok: true,
      markMs: mark,
      markText: String(res.accrued_to),
      shadow: res.shadow === true,
      shadowState: (res.shadow_state && typeof res.shadow_state === 'object')
        ? res.shadow_state : null,
    };
  }
  /* `tick_disabled` cannot appear here (the switch was read above and a change
     between the two calls simply refuses every settle below). Everything else
     is a refusal with a name, and the name is what the summary counts. */
  return { ok: false, reason: String(err || 'no_answer') };
}

/* THE SEED LADDER, IN ONE ROUND TRIP.
   A window's seed is a function of its WATERMARK, and a watermark is only known
   after the engine has answered the window before it — so the labels cannot be
   enumerated up front. They are DISCOVERED by a dry pass whose output is thrown
   away except for the instants it visited, and then resolved together.

   The dry pass's numbers never leave this function and are never settled: it
   returns instants, not deltas. That matters because a dry pass necessarily runs
   on `seedFor`'s visible-values hash, which is exactly the predictable stream
   the real pass must not use. If the real chain diverges from the predicted one
   — a level-up inside the window changing the action interval, say — the real
   pass simply walks past the end of the ladder and stops, and the tail is owed
   rather than paid on a seed that names the wrong instant. */
export function planSeedLabels(settle, session, fromMs, toMs, opts) {
  /* THE DRY PASS MUST BE THE CHANNEL'S OWN (S-8). Running gather's chain over
     a combat session would walk a different ladder of instants than the real
     pass then asks for, so the real pass would stop at the first watermark the
     ladder does not name and settle nothing. */
  const dry = settle(session, fromMs, toMs, opts);
  const out = [];
  const seen = new Set();
  /* THE FIRST WINDOW'S INSTANT IS CARRIED, NOT RE-SPELLED. It is the instant
     the accrue path would have labelled, and `probeWatermark` already holds the
     fence's own rendering of it; `markMs` has lost the microseconds. */
  const markText = (opts && typeof opts.markText === 'string') ? opts.markText : null;
  for (const r of dry.results) {
    const ms = Math.floor(r.watermarkMs);
    if (seen.has(ms)) continue;
    seen.add(ms);
    out.push({ ms, ts: (ms === fromMs && markText) ? markText : new Date(ms).toISOString() });
  }
  return out;
}

/* THE LABEL IS SPELLED BY POSTGRES, NEVER BY JS (T-2).
   `hr_seed` hashes the LABEL, so one window has one stream only if every path
   that names it spells the instant identically. The accrue path's label is
   `'accrue:' + String(st.accrued_to)` (index.ts:785) where `st` is the
   `hr_state_of` JSONB envelope — Postgres's own ISO rendering of the column,
   microseconds and `+00:00` included. `new Date(ms).toISOString()` cannot
   reproduce it (`.739Z` vs `.739123+00:00`) and a `to_char` template agrees
   only by luck, which is how the tick and the roster came to agree with each
   other and with nothing that had ever paid a player. So neither side spells
   it: the instants travel as timestamptz text and the SERVER renders the
   label, in the same call that hashes it. The roster does the same thing with
   `to_jsonb(l.mark) #>> '{}'`, and `hr_state_of` is where both come from.
   Exported because tests/world-tick-edge-contract.mjs EC-3a executes THIS
   expression rather than restating it; the alias is `l` and the column `ts`. */
export const SEED_LABEL_EXPR = "'accrue:' || (to_jsonb(l.ts::timestamptz) #>> '{}')";

/** `hr_seed` for a whole ladder, masked exactly as the accrue path masks it. */
async function seedLadder(exec, sel, labels) {
  const map = new Map();
  if (labels.length === 0) return map;
  const rows = await exec(
    `select l.ord, (public.hr_seed($1::uuid, $2::int, ${SEED_LABEL_EXPR})`
    + ' & 4294967295)::bigint as seed'
    + ' from unnest($3::text[]) with ordinality l(ts, ord)',
    [sel.userId, sel.slot, labels.map((x) => x.ts)]);
  for (const r of rows || []) {
    const i = Number(r.ord) - 1;
    if (labels[i]) map.set(labels[i].ms, Number(r.seed));
  }
  return map;
}

/* ── ONE CHARACTER, ONE FIRE ────────────────────────────────────────────────
   Returns a verdict, never a throw: a character that cannot be settled must not
   cost the rest of the batch its window. */
async function tickOne(exec, holder, sel, body) {
  /* (0) THE SERVER CLOCK. Every instant this function names comes from here or
         from the fence; none of them comes from the body. */
  const read0 = await exec('select now()::timestamptz as now', []);
  /* THE DRIVER HANDS BACK A `Date`, NOT A STRING (T-1). `postgres` parses OID
     1184 into a JS Date and index.ts gives it no `types` override, so
     `String(...)` here spells `Mon Sep 21 2026 17:58:04 GMT+0000 (…)` — which
     is bound straight back as `$7::timestamptz` AND written into
     `delta.accrued_to`, and Postgres answers 22P02. That throw lands on the
     FIRST engine statement of every character of every fire, so the fire
     returns 200 with `processed:0` and the shadow journal stays empty.
     `.toISOString()` is the spelling index.ts:775 already uses on the accrue
     path; tests/world-tick-edge-contract.mjs EC-1b/EC-2a is the exit code. */
  const nowIso = new Date(read0[0].now).toISOString();

  /* (1) THE STATE, FROM THE DATABASE, IN THIS REQUEST. Not one field of it
         comes from the body — `hr_state_of` is the same projection the player's
         own envelope is built from, and `version` is the number `hr_apply`
         refuses a stale copy of.

         ⚠ THIS READ MOVED AHEAD OF THE PROBE (Security S-8, 2026-09-23), and
           the order is the finding. The probe IS the lease check, and the fence
           looks a lease up by `(user, slot, channel)` — so the probe cannot be
           asked until this driver knows which channel the character is on, and
           the only server-side answer to that is `active_kind` on this
           projection. `hr_engine` is revoked from `player_state`, so there is
           no cheaper read of it.

           The cost is one `hr_state_of` for a character that turns out to be
           unleased, where the old order cost none. That is bounded: the body's
           roster is clamped to MAX_ROSTER and the branch already sits behind
           the tick bearer. It buys the property S-8 is about — a character is
           never asked about under a channel that is not its own. */
  const [row] = await exec(
    'select public.hr_state_of($1::uuid, $2::int) as state,'
    + ' public.hr_offline_cap_ms($1::uuid, $2::int) as cap_ms,'
    + ' now()::timestamptz as now',
    [sel.userId, sel.slot]);
  const env = row && row.state;
  if (!env || env.ok !== true) return { outcome: 'skipped', reason: 'no_character' };
  const st = env.state || {};

  /* (2) THE DISPATCH. The character's pointer picks the code that settles it.
         A kind with no entry is skipped BY NAME: `channel_not_driven` says the
         edge cannot settle this character, which is a different sentence from
         `channel_moved` ("it was here and moved") and from `no_lease` ("it is
         not mine"). Collapsing the three is exactly how S-8 stayed invisible —
         a wall of `channel_moved` read as players switching activity. */
  const driver = Object.prototype.hasOwnProperty.call(CHANNELS, st.active_kind)
    ? CHANNELS[st.active_kind]
    : null;
  if (!driver) return { outcome: 'skipped', reason: 'channel_not_driven' };
  const channel = driver.channel;

  /* (3) THE FENCE, UNDER THE CHARACTER'S OWN CHANNEL. It answers "do I hold
         this character, is it still on this channel, and from when" in one call
         that writes nothing. */
  const probe = await probeWatermark(exec, holder, sel, nowIso, channel);
  if (!probe.ok) return { outcome: 'skipped', reason: probe.reason };
  /* Same driver contract as (1): `row.now` is a Date. `String()` happened to
     survive here only because JS can parse what Postgres cannot. */
  const nowMs = new Date(row.now).getTime();
  const markMs = probe.markMs;

  /* (4) THE WINDOW. It ENDS at one flush period past the mark or at the server
         clock, whichever is sooner — so a fire computes at most one flush
         window per character and emits at most one intent. A character further
         behind than that catches up one flush per fire; the tail is owed, never
         lost, because the watermark does not move for time nobody settled. */
  const toMs = Math.min(nowMs, markMs + body.flushMs);
  if (toMs - markMs < body.flushMs) {
    /* BELOW THE FLUSH LINE. Settling here would write one ledger row per
       cadence per character, which is the row volume §15c prices at 9x the
       prune ceiling. Waiting costs nothing: the mark stays put. */
    return { outcome: 'skipped', reason: 'below_flush' };
  }

  /* (5) THE SESSION. Assembled from SERVER values field by field, with the
         watermark the FENCE reported rather than `st.accrued_to` — in shadow
         the two differ, and chaining on `accrued_to` is the overlapping-window
         bug §15c's shadow mark exists to prevent.

         ⚠ THE SECOND ARGUMENT IS `env`, THE WHOLE ENVELOPE, NOT `st`
           (2026-09-22). `skills`, `inventory`, `equipment`, `enchant` and
           `buffs` live at the envelope TOP LEVEL; `state` holds the
           player_state columns. Handing `st` here gave the engine `skills {}`
           and every shadow window for a Mining-61 character on `mithril_rock`
           came back `would_ticks: 0` with `activity: {kind:'idle'}` — the
           level gate, on a character who can mine that node. The field list
           itself is now ./envelope.js, shared with index.ts's accrue path. */
  const session0 = driver.sessionFromRoster({
    user_id: sel.userId,
    slot: sel.slot,
    shard: 0,                       // hr_shard_of is `select 0`; see the header
    active_kind: st.active_kind,
    active_id: st.active_id,
    active_since: st.active_since,
    accrued_to: new Date(markMs).toISOString(),
    /* THE FENCE'S OWN RENDERING OF THE WATERMARK (Security S-8/T-2).
       `accrued_to` above is `new Date(markMs).toISOString()` — the `…Z`
       spelling, and `markMs` has already lost the microseconds. Combat's
       `rosterWatermarkText` needs a SERVER rendering of that same instant to
       spell the seed label with, and it checks the candidates it is given
       against `markMs` before accepting one. Until today nothing set this key,
       so the only candidate was `state.accrued_to` — which in SHADOW is a
       DIFFERENT instant from the fence's mark, so every displaced shadow
       window would have been refused outright ("no server rendering of the
       watermark"). `probe.markText` is the fence's own jsonb rendering of the
       mark it just reported, microseconds and `+00:00` included, and it is the
       only spelling that is both correct and available here.

       Gather's `sessionFromRoster` ignores it: its label is planned by
       Postgres from the instant (SEED_LABEL_EXPR), never from a JS string. */
    mark_text: probe.markText,
    version: env.version,
    /* THE ABSENCE CAP, read in the same transaction as everything else —
       `hr_offline_cap_ms`, exactly as the accrue path reads it. Without it the
       engine answers `no_cap` and settles nothing, which is the safe direction
       and is also a tick that silently never runs; T-S1 is what catches it. */
    cap_ms: row.cap_ms,
  }, env);

  /* (5b) ── THE SHADOW OVERLAY (2026-09-23) ────────────────────────────────
         Armed, there is nothing to do here: hr_apply wrote the last window and
         `hr_state_of` above already read it back. SHADOW PAYS NOTHING — e15,
         deliberately — so `player_state` stands still and every fire re-seeds
         the character from the SAME row. Measured on production at 16:40 UTC
         on 2026-09-23 (QA slot 1, hp 4/10, no food, auto-eat off, armed in
         shadow at 15:36): 42 windows in 62 minutes, `would_deaths = 1` in 41
         of them, `would_hp = 4` in every one, `would_recovering_until` ~31
         minutes past the end of every one. A chained character dies once and
         then sits inside its own recovery clock; 41 deaths in an hour is the
         absence of a chain, not a simulation result. The M3 parity read 8c
         (deaths, kills, hp, consec_falls EXACT) could not have passed.

         THE OVERLAY IS A DISPLAY OF THE SHADOW'S OWN PROPOSALS AND NEVER
         AUTHORITY. The session is built from `hr_state_of` field by field,
         exactly as above; this lays the shadow's cumulative movement over it,
         and every number it touches ends up in `hr_tick_shadow` — a table
         classified `operational` + `player_value_exempt` that nothing reads
         to decide a number a player can spend. It is applied ONLY when the
         fence is chaining (`probe.shadow` and a mark the shadow's own column
         moved past `accrued_to`), and `applyShadowState` drops it again if
         `player_state.version` has moved since it was built — any real write
         to this character ends the chain instead of being papered over. */
  const chaining = probe.shadow === true && probe.shadowState
    && markMs > (st.accrued_to ? Date.parse(st.accrued_to) : markMs);
  const session = chaining
    ? applyShadowState(session0, probe.shadowState)
    : session0;

  const geom = {
    cadenceMs: body.cadenceMs,
    flushMs: body.flushMs,
    maxPolls: MAX_POLLS,
    holder,
  };

  /* (6) THE SEEDS, THEN THE ONE REAL PASS. */
  const labels = planSeedLabels(driver.settle, session, markMs, toMs,
    Object.assign({}, geom, { markText: probe.markText }));
  const seeds = await seedLadder(exec, sel, labels);
  const run = driver.settle(session, markMs, toMs,
    Object.assign({}, geom, { seedOf: (ms) => (seeds.has(ms) ? seeds.get(ms) : null) }));

  if (run.intents.length === 0) return { outcome: 'skipped', reason: 'nothing_settled' };

  /* (7) THE SETTLE. Intents 2..N are stale by construction and say so
         (`rehydrateBefore`, S-6): they carry a null version precisely so the
         database refuses them, and the honest answer is to stop and re-hydrate
         on the next fire rather than to invent a successor version. */
  const intent = run.intents[0];
  if (intent.rehydrateBefore) return { outcome: 'skipped', reason: 'rehydrate_required' };
  const a = intent.args;
  /* ── WHAT THE NEXT WINDOW IS SEEDED FROM, AND WHEN IT IS NOT ─────────────
     `run.char` is the engine's OWN output state — the continuation object
     `advance()` holds, the same one the attended loop and the parity harness
     carry — serialised by `shadowStateOf` and stored by the fence verbatim.
     No arithmetic of ours crosses, and none is done in SQL.

     IT IS SENT ONLY WHEN THE CHARACTER'S STATE IS THE STATE AT EXACTLY THE
     INSTANT BEING SETTLED. `settleCombatSession` walks the whole span it is
     given and advances `char` past every window it settled, while only
     `intents[0]` is handed to the fence — so if the loop ran past this
     intent's `p_window_to` (a second flush batch, which a flush-sized span
     does not produce but a config change could), the carried state would be
     AHEAD of the watermark the fence is about to stamp and the next window
     would double-count the difference. Refusing to carry is the safe
     direction: the chain restarts from `hr_state_of` and under-reports,
     which is a measurement that is honest about being short rather than one
     that silently pays twice. */
  const atMark = run.watermarkMs === Date.parse(a.p_window_to);
  const carried = (probe.shadow === true && atMark)
    ? shadowStateOf(run.char, { baseVersion: env.version, atMs: run.watermarkMs })
    : null;
  /* ── ANYTHING THAT OVERLAID MUST SEND A CARRIER (Security S-1, 2026-09-23) ─
     `chaining` above laid the shadow's own proposals over this session, so the
     delta just computed is built on a character that is PART PROPOSAL. The one
     thing standing between that delta and hr_apply is the fence's
     `shadow_state_while_armed` refusal — and that refusal keys on a NON-NULL
     tenth argument.

     `carried` is null on two reachable paths that have nothing to do with the
     mode: the bound breaking (`shadowStateOf` returns null BY DESIGN so the
     chain restarts rather than lying) and `!atMark`. On either of those, an
     operator who arms between `probeWatermark` and this call would have the
     armed branch accept a null carrier and PAY a delta built on the overlay —
     exactly what design constraint 2 forbids, reached through the gap between
     "we overlaid" and "we have something to carry". The header above claims
     that race is covered by `shadow_state_while_armed`; it only is while those
     two conditions agree, so they are made one here.

     The marker carries NO state, so the next window's overlay applies nothing
     and re-seeds from `hr_state_of` — the same restart `carried === null`
     already meant — while the armed branch still sees a non-null argument and
     refuses before hr_apply. Covered by tests/world-tick-shadow-chain.mjs
     SC-11 and by its `--mutate armedPaysOverlay` mutant. */
  const carry = carried
    || (chaining ? { v: SHADOW_STATE_V, base_version: env.version, restart: true } : null);
  const res = await fence(exec, {
    holder,                          // ours, never `a.p_holder` from the fold
    user: sel.userId,
    slot: sel.slot,
    channel,                         // the character's own, as the probe used
    version: a.p_version,
    windowFrom: a.p_window_from,
    windowTo: a.p_window_to,
    intentId: a.p_intent_id,
    delta: JSON.stringify(a.p_delta),
    shadowState: carry ? JSON.stringify(carry) : null,
  });
  if (!res || res.ok !== true) {
    return { outcome: 'refused', reason: String((res && res.error) || 'no_answer') };
  }
  /* THE MODE IS THE FENCE'S, NEVER THE BODY'S. `shadow` arrives in the driver's
     POST and is ignored: `hr_tick_config.shadow` is read inside the fence, and
     this is what it decided. A summary that reported the body's flag would say
     "shadowed" about a fire that paid. */
  return { outcome: res.mode === 'shadow' ? 'shadowed' : 'processed' };
}

/* ── THE FIRE ───────────────────────────────────────────────────────────────
   `exec` is index.ts's one-statement seam; `now` is injectable so a test can
   measure `ms` without a clock. Returns the small JSON summary §15c asks for. */
export async function runTick(opts) {
  const exec = opts.exec;
  const now = opts.now || (() => Date.now());
  const t0 = now();
  const body = parseTickBody(opts.body);

  const summary = (extra) => Object.assign({
    ok: true, op: TICK_OP, processed: 0, skipped: 0, shadowed: 0,
    refused: 0, ms: Math.max(0, now() - t0),
  }, extra);

  if (body.op !== TICK_OP) {
    return { status: 400, body: summary({ ok: false, error: 'unknown_op' }) };
  }

  /* THE HOLDER, DERIVED SERVER-SIDE. `left('cron:' || coalesce(
     current_database(),'db'), 64)` is the expression `hr_tick_cron_run` stamps
     its lease with, written out here so the two cannot be compared favourably
     by accident — if they ever drift, every settle is refused `no_lease`, which
     is the safe direction and is loud in the summary. */
  const [h] = await exec(
    "select left('cron:' || coalesce(current_database(), 'db'), 64) as holder", []);
  const holder = String((h && h.holder) || '');

  const ks = await probeKillSwitch(exec, holder);
  if (!ks.enabled) {
    return { status: 200, body: summary({ disabled: true, reason: ks.unexpected || 'kill_switch' }) };
  }

  const counts = { processed: 0, skipped: 0, shadowed: 0, refused: 0 };
  const reasons = Object.create(null);
  for (const sel of body.roster) {
    let v;
    try {
      v = await tickOne(exec, holder, sel, body);
    } catch (e) {
      /* NO CHARACTER'S FAILURE COSTS ANOTHER ONE ITS WINDOW. The message is
         the engine's or the driver's; it is never built from a header and never
         from the secret. */
      v = { outcome: 'refused', reason: 'error:' + String((e && e.message) || e).slice(0, 64) };
    }
    counts[v.outcome] = (counts[v.outcome] || 0) + 1;
    if (v.reason) reasons[v.reason] = (reasons[v.reason] || 0) + 1;
  }

  return { status: 200, body: summary(Object.assign({}, counts, { reasons })) };
}
