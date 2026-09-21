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

import { createHash, timingSafeEqual } from 'node:crypto';

import {
  CHANNEL, DEFAULT_CADENCE_MS, DEFAULT_FLUSH_MS,
  sessionFromRoster, settleGatherSession,
} from './tick-gather.js';

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

// ═══════════════════════════════════════════════════════════════════════════
// THE BEARER
// ═══════════════════════════════════════════════════════════════════════════

/* Is this env var usable as the tick bearer at all? Split out so the refusal
   path can be asserted without an env var and without a request. */
export function tickSecretUsable(secret) {
  return typeof secret === 'string' && secret.length >= MIN_SECRET_LEN;
}

/* CONSTANT TIME, AND LENGTH-INDEPENDENT.
   `timingSafeEqual` throws on a length mismatch, and catching that throw would
   itself be the length oracle — so both sides are hashed to a fixed 32 bytes
   FIRST and the comparison is always over 32 bytes. A wrong guess therefore
   costs exactly what a right one costs, whatever its length, and the digest of
   a secret is not the secret.

   `presented` is attacker-controlled and may be null; `secret` is the env var
   and is only ever reached through `tickSecretUsable`. */
export function tickBearerOk(presented, secret) {
  if (!tickSecretUsable(secret)) return false;
  if (typeof presented !== 'string' || presented.length === 0) return false;
  const a = createHash('sha256').update(presented, 'utf8').digest();
  const b = createHash('sha256').update(secret, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/* THE GATE, AS A PURE FUNCTION OF (headers, env).

   Three answers, and the caller in index.ts must handle all three:
     null                 → not a tick request; fall through to the player path,
                            byte for byte unchanged.
     { ok:false, … }      → a tick request that failed the bearer. 401
                            `not_signed_in` — the SAME body the player path
                            returns for a bad token, so this branch is not an
                            oracle for "does op:tick exist here".
     { ok:true }          → proceed, and only now may anything else run.

   THE DISCRIMINATOR IS THE HEADER'S PRESENCE, NEVER THE BODY. Reading the body
   to decide whether to check the bearer would mean parsing attacker-controlled
   JSON before authenticating it, which is the thing §15c says must not happen.
   A request with no `X-HR-Tick-Auth` is simply not a tick request and is
   handled by the player path exactly as it was before this file existed —
   including a body that says `op: 'tick'`, which reaches `parseIntent` and is
   answered as that caller's own accrual, never as a tick. */
export function tickGate(headers, secret) {
  const presented = headers && typeof headers.get === 'function'
    ? headers.get(TICK_HEADER) : null;
  if (presented === null || presented === undefined) return null;
  if (!tickBearerOk(presented, secret)) {
    return { ok: false, status: 401, body: { ok: false, error: 'not_signed_in' } };
  }
  return { ok: true };
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
  const [r] = await exec(
    'select public.hr_tick_settle($1::text, $2::uuid, $3::int, $4::text, $5::bigint,'
    + ' $6::timestamptz, $7::timestamptz, $8::uuid, $9::jsonb) as res',
    [args.holder, args.user, args.slot, args.channel, args.version,
      args.windowFrom, args.windowTo, args.intentId, args.delta]);
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
   here with its own code. Nothing is written on any of those paths. */
export async function probeWatermark(exec, holder, sel, nowIso) {
  const res = await fence(exec, {
    holder, user: sel.userId, slot: sel.slot, channel: CHANNEL,
    version: null, windowFrom: PROBE_FROM_ISO, windowTo: nowIso,
    intentId: '00000000-0000-0000-0000-000000000000',
    delta: JSON.stringify({ accrued_to: nowIso }),
  });
  const err = res && res.error;
  if (err === 'window_already_settled') {
    const mark = res.accrued_to ? Date.parse(String(res.accrued_to)) : NaN;
    if (!Number.isFinite(mark)) return { ok: false, reason: 'unreadable_watermark' };
    return { ok: true, markMs: mark };
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
   returns labels, not deltas. That matters because a dry pass necessarily runs
   on `seedFor`'s visible-values hash, which is exactly the predictable stream
   the real pass must not use. If the real chain diverges from the predicted one
   — a level-up inside the window changing the action interval, say — the real
   pass simply walks past the end of the ladder and stops, and the tail is owed
   rather than paid on a seed that names the wrong instant. */
export function planSeedLabels(session, fromMs, toMs, opts) {
  const dry = settleGatherSession(session, fromMs, toMs, opts);
  const out = [];
  const seen = new Set();
  for (const r of dry.results) {
    const ms = Math.floor(r.watermarkMs);
    if (seen.has(ms)) continue;
    seen.add(ms);
    out.push({ ms, label: 'accrue:' + new Date(ms).toISOString() });
  }
  return out;
}

/** `hr_seed` for a whole ladder, masked exactly as the accrue path masks it. */
async function seedLadder(exec, sel, labels) {
  const map = new Map();
  if (labels.length === 0) return map;
  const rows = await exec(
    'select l.ord, (public.hr_seed($1::uuid, $2::int, l.label) & 4294967295)::bigint as seed'
    + ' from unnest($3::text[]) with ordinality l(label, ord)',
    [sel.userId, sel.slot, labels.map((x) => x.label)]);
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
  /* (1) THE FENCE FIRST. It answers "do I hold this character, is it still
         gathering, and from when" in one call that writes nothing — so an
         unleased character costs one round trip and zero engine time. */
  const read0 = await exec('select now()::timestamptz as now', []);
  const nowIso = String(read0[0].now);
  const probe = await probeWatermark(exec, holder, sel, nowIso);
  if (!probe.ok) return { outcome: 'skipped', reason: probe.reason };

  /* (2) THE STATE, FROM THE DATABASE, IN THIS REQUEST. Not one field of it
         comes from the body — `hr_state_of` is the same projection the player's
         own envelope is built from, and `version` is the number `hr_apply`
         refuses a stale copy of. */
  const [row] = await exec(
    'select public.hr_state_of($1::uuid, $2::int) as state,'
    + ' public.hr_offline_cap_ms($1::uuid, $2::int) as cap_ms,'
    + ' now()::timestamptz as now',
    [sel.userId, sel.slot]);
  const env = row && row.state;
  if (!env || env.ok !== true) return { outcome: 'skipped', reason: 'no_character' };
  const st = env.state || {};
  if (st.active_kind !== CHANNEL) {
    return { outcome: 'skipped', reason: 'channel_moved' };
  }
  const nowMs = new Date(String(row.now)).getTime();
  const markMs = probe.markMs;

  /* (3) THE WINDOW. It ENDS at one flush period past the mark or at the server
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

  /* (4) THE SESSION. Assembled from SERVER values field by field, with the
         watermark the FENCE reported rather than `st.accrued_to` — in shadow
         the two differ, and chaining on `accrued_to` is the overlapping-window
         bug §15c's shadow mark exists to prevent. */
  const session = sessionFromRoster({
    user_id: sel.userId,
    slot: sel.slot,
    shard: 0,                       // hr_shard_of is `select 0`; see the header
    active_kind: st.active_kind,
    active_id: st.active_id,
    active_since: st.active_since,
    accrued_to: new Date(markMs).toISOString(),
    version: env.version,
    /* THE ABSENCE CAP, read in the same transaction as everything else —
       `hr_offline_cap_ms`, exactly as the accrue path reads it. Without it the
       engine answers `no_cap` and settles nothing, which is the safe direction
       and is also a tick that silently never runs; T-S1 is what catches it. */
    cap_ms: row.cap_ms,
  }, st);

  const geom = {
    cadenceMs: body.cadenceMs,
    flushMs: body.flushMs,
    maxPolls: MAX_POLLS,
    holder,
  };

  /* (5) THE SEEDS, THEN THE ONE REAL PASS. */
  const labels = planSeedLabels(session, markMs, toMs, geom);
  const seeds = await seedLadder(exec, sel, labels);
  const run = settleGatherSession(session, markMs, toMs,
    Object.assign({}, geom, { seedOf: (ms) => (seeds.has(ms) ? seeds.get(ms) : null) }));

  if (run.intents.length === 0) return { outcome: 'skipped', reason: 'nothing_settled' };

  /* (6) THE SETTLE. Intents 2..N are stale by construction and say so
         (`rehydrateBefore`, S-6): they carry a null version precisely so the
         database refuses them, and the honest answer is to stop and re-hydrate
         on the next fire rather than to invent a successor version. */
  const intent = run.intents[0];
  if (intent.rehydrateBefore) return { outcome: 'skipped', reason: 'rehydrate_required' };
  const a = intent.args;
  const res = await fence(exec, {
    holder,                          // ours, never `a.p_holder` from the fold
    user: sel.userId,
    slot: sel.slot,
    channel: CHANNEL,
    version: a.p_version,
    windowFrom: a.p_window_from,
    windowTo: a.p_window_to,
    intentId: a.p_intent_id,
    delta: JSON.stringify(a.p_delta),
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
