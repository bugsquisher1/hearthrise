// ============================================================================
// supabase/functions/hr-accrue/hunt-settle.js — THE HUNT SESSION SETTLE.
//
// Ruling HR-2026-10-14 "Hunt Sessions replace away", §2: "the world tick is the
// only thing that settles a session". This file is that settle — ONE
// implementation, reached from three doors that differ only in WHEN they ask:
//
//   the world tick   tick.js, for every session hr_hunt_roster leased to it
//                    (mode 'tick': no rate gate, a derived intent key)
//   hunt_settle      the player's "bring me up to date" (mode 'settle': the
//                    `accrue` rate bucket, the ACCRUE_MIN_MS floor unless a
//                    leave/change is pending)
//   hunt_use         a manual action-bar press (mode 'use': the press lands at
//                    the FIRST swing boundary at or after it — ruling §2 "It
//                    lands immediately, not up to 10 s late" — under the
//                    player's own key and the `activity` bucket)
//
// and from the collect every settle-before-mutate verb runs (set-activity.js
// collectCurrentWindow routes a hunter here, mode 'settle', so a purchase or a
// meal mid-hunt prices the hunt at the state BEFORE it — Security F1's rule).
//
// ── WHAT ONE SETTLE DOES ────────────────────────────────────────────────────
//   (1) READ, in one statement: the rate gate (player doors), the session
//       (hr_hunt_engine_read: clock, bag, bar, presses, the keyed-seed secret),
//       the character (hr_state_of), the server clock.
//   (2) the perk stack and the bestiary counters (./tick-reads.js — the same
//       two reads every other settle makes, one definition).
//   (3) COMPUTE: computeAccrual with the session attached — the SAME combat
//       body every fight is priced by, the span walking the session's
//       absolute swing clock with one HMAC-keyed seed per swing (./hunt-seed.js).
//   (4) COMMIT, one statement: hr_hunt_apply(user, slot, session, version,
//       intent, delta, hunt, buffs, press). Postgres takes the character lock,
//       runs hr_apply and hr_hunt_settle_session in ONE subtransaction and
//       decides whether any of it may land.
//   A `session_moved` / `version_conflict` (another settler won the lock) is
//   re-read and recomputed once; a clamp the degrade ladder can shrink halves
//   the window (at most MAX_DEGRADE times). Anything else is answered as-is:
//   the session stays where it was, owed, and the next fire offers it again.
//
// ── WHAT IT NEVER DOES ──────────────────────────────────────────────────────
//   · never writes a table (hr_engine holds none) and never calls hr_apply
//     outside hr_hunt_apply — the session half and the value half are one;
//   · never reads a client value: the request contributes `slot` (a row the
//     caller owns) and, for a press, a bar-slot index the database re-validates;
//   · never consults presence, an offline cap, a return anchor or `ctx.away`
//     (TICK-2): a hunt is a hunt, watched or not.
//
// PURE ESM behind the injected `exec` seam, Node + Deno. No `?v=`.
// ============================================================================

import { computeAccrual } from './accrual.js';
import { engineInputsFromEnvelope } from './envelope.js';
import { intentIdFor } from './intents.js';
import { readTickPerks, readTickBestiary } from './tick-reads.js';
import { GATHER_NODES, ARTISAN_RECIPES_ALL } from './catalogue.js';
import { newHuntSession } from '../../../src/core/action-rules.js';
import { ACTION_SET_LIMITS } from '../../../src/data/rule-subjects.js';
import { ITEMS } from '../../../src/data/items.js';
import { MONSTERS } from '../../../src/data/monsters.js';
import { COMPANION_XP_SERVER_BACKED } from '../../../src/core/companion-xp.js';

/* THE PLAYER DOOR'S FLOOR (hunt_settle, a hunter's accrue, a purchase's
   collect): a settle asked for inside this of the last one prices nothing and
   writes nothing — the ledger-volume fuse on a client-driven door (with the
   30/min `accrue` gate it bounds a spamming client to ~4 settles a minute).
   15 s, below C1's 20 s mid-hunt slack (hr_hunt_restock / set_preset /
   action_set_put refuse `settle_first` past it), so "settle, then edit" always
   lands. A pending leave/change is never held back. */
export const HUNT_SETTLE_MIN_MS = 15000;

/* hr_apply clamps the degrade ladder can escape by asking for less — the
   accrue verb's DEGRADABLE list, restated for the one other caller that halves
   a window. A hunt halves its WINDOW (fewer swings), never its rates. */
export const HUNT_DEGRADABLE = Object.freeze([
  'gold_clamp', 'item_clamp', 'xp_clamp', 'progress_clamp',
  'too_many_item_kinds', 'too_many_progress_ops', 'bank_full', 'daily_budget',
]);
export const HUNT_MAX_DEGRADE = 3;
/* Refusals that mean "someone else moved the session/character under us". */
const RETRYABLE = Object.freeze(['session_moved', 'version_conflict']);

/* THE READ. One statement: the gate is its first term on a player door (D3:
   a call that settles nothing still spends budget), absent on the tick's. */
export const HUNT_READ_SQL = `
  with g as (select case when $3::text is null then true
                         else public.hr_rate_gate($1::uuid, $2::int, $3::text) end as allowed)
  select g.allowed                                                              as allowed,
         case when g.allowed then public.hr_hunt_engine_read($1::uuid, $2::int) end as hunt,
         case when g.allowed then public.hr_state_of($1::uuid, $2::int) end      as state,
         now()                                                                  as now
    from g`;

/* THE COMMIT. `::text::jsonb` on every pre-stringified argument — the
   transport rule tests/delta-transport.mjs grades (a json-described parameter
   is re-serialised by the driver and arrives as a string scalar). */
export const HUNT_APPLY_SQL = `
  select public.hr_hunt_apply($1::uuid, $2::int, $3::uuid, $4::bigint, $5::uuid,
                              $6::text::jsonb, $7::text::jsonb, $8::text::jsonb, $9::text::jsonb,
                              $10::boolean) as res`;

/* "Is a hunt open?" — the cheap read the accrue and collect paths make so the
   old combat pricing never runs for a hunter. 42883 (no such function: a
   database without the settle migration) reads as "no". */
export const HUNT_OPEN_SQL = 'select public.hr_hunt_open_of($1::uuid, $2::int) as session';
export async function huntOpenOf(exec, user, slot) {
  try {
    const [r] = await exec(HUNT_OPEN_SQL, [user, slot]);
    return (r && typeof r.session === 'string') ? r.session : null;
  } catch (e) {
    if (String((e && e.code) ?? '') === '42883') return null;
    throw e;
  }
}

/** The engine-shape session from hr_hunt_engine_read. Field by field. */
export function huntSessionFromRead(h) {
  const num = (v) => (v === null || v === undefined || v === '') ? null : Number(v);
  return newHuntSession({
    id: String(h.id),
    huntFromMs: num(h.hunt_from_ms),
    nextSwingAtMs: num(h.next_swing_at_ms),
    swingIndex: num(h.swing_index),
    bag: h.bag || {},
    slots: Array.isArray(h.slots) ? h.slots : [],
    presses: Array.isArray(h.presses) ? h.presses : [],
    cooldowns: (h.cooldowns && typeof h.cooldowns === 'object') ? h.cooldowns : {},
    falls: num(h.falls),
    fallsLimit: num(h.falls_limit),
    hoursLimit: num(h.hours_limit),
    leaveAtMs: num(h.leave_at_ms),
    changeAtMs: num(h.change_at_ms),
    /* THE KILL SWITCH ends the hunt at its first boundary ('server', END_ORDER
       last), which hr_hunt_settle_session re-proves from hr_hunt_config. */
    stopAtMs: h.enabled === false ? num(h.settled_to_ms) : null,
    down: h.down === true,
    /* THE STAMINA POOL AT THE WINDOW START: the database's own
       hr_stamina_of(settled_to), never a client value. */
    staminaMs: num(h.stamina_ms),
    /* THE SHOP (hr_hunt_basic_supplies) and the ids this hunt's tier resolves
       a shop slot to, and the action set's target mode / pull count —
       catalogue and stored rows, never a request value; newHuntSession keeps
       only well-formed entries. */
    basics: (h.basics && typeof h.basics === 'object') ? h.basics : {},
    shop: (h.shop && typeof h.shop === 'object') ? h.shop : {},
    targetMode: typeof h.target_mode === 'string' ? h.target_mode : null,
    /* THE SPAWN CYCLE (Security design review 2026-10-14 items 1-2): the pull
       the SERVER computed (hr_hunt_pull_of) and the session row's cycle state.
       hr_hunt_apply recomputes the pull under the lock and re-proves the
       window's kills against it. */
    pull: (h.pull && typeof h.pull === 'object') ? {
      size: num(h.pull.size), respawnMs: num(h.pull.respawn_ms),
      left: num(h.pull.left), respawnAtMs: num(h.pull.respawn_at_ms),
    } : null,
    /* THE GOLD FLOOR and the loot sell-to-cover may sell (hr_hunt_cover_items
       x this session's own loot still in the bag) — server rows. */
    goldFloor: num(h.gold_floor),
    cover: (h.cover && typeof h.cover === 'object') ? h.cover : {},
  });
}

const refusal = (status, error, extra) => ({ status, body: { ok: false, error, ...(extra || {}) } });

/**
 * ONE SETTLE OF ONE CHARACTER'S OPEN SESSION.
 *
 * @param o.exec      the one-statement seam (index.ts / tick.js)
 * @param o.user      the VERIFIED subject (player doors) or a roster selector (tick)
 * @param o.slot      the character slot
 * @param o.mode      'tick' | 'settle' | 'use'
 * @param o.bucket    the rate bucket (player doors), null on the tick
 * @param o.intentId  the player's key (mode 'use'), else derived here
 * @param o.barSlot   the pressed action-bar slot (mode 'use')
 * @param o.session   the session the caller expects (tick roster), or null
 * @param o.project   answer with the post-settle envelope (player doors)
 * @param o.minWindowMs  the floor below which nothing is settled (default:
 *                    HUNT_SETTLE_MIN_MS for 'settle', 0 otherwise)
 * @returns {{ outcome: 'paid'|'nothing'|'none'|'refused'|'limited', reason?, status, body, ended? }}
 */
export async function settleHunt(o) {
  const { exec, user, slot } = o;
  const mode = o.mode === 'use' ? 'use' : o.mode === 'settle' ? 'settle' : 'tick';
  let lastRefusal = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const v = await settleOnce(o, mode, attempt === 0 ? null : lastRefusal);
    if (v.outcome !== 'refused' || !RETRYABLE.includes(v.reason)) return v;
    lastRefusal = v;
    /* The press key is the player's: a version_conflict released it (it is on
       hr_apply's c_release_codes), so the retry may present it again. */
  }
  return lastRefusal;
}

async function settleOnce(o, mode) {
  const { exec, user, slot } = o;
  const [read] = await exec(HUNT_READ_SQL, [user, slot, mode === 'tick' ? null : (o.bucket || null)]);
  if (!read || read.allowed !== true) {
    return { outcome: 'limited', reason: 'rate_limited', ...refusal(429, 'rate_limited') };
  }
  const env = read.state;
  if (!env || env.ok !== true) {
    return { outcome: 'none', reason: 'no_character', ...refusal(409, (env && env.error) || 'no_character') };
  }
  const h = read.hunt;
  if (!h || h.open !== true) {
    return { outcome: 'none', reason: 'no_hunt', ...refusal(409, 'no_hunt', { ...env, ok: false }) };
  }
  if (o.session && String(o.session) !== String(h.id)) {
    /* The roster named a session that is no longer the open one (it ended and
       another began between the roster and this read). Not this fire's. */
    return { outcome: 'none', reason: 'session_changed', ...refusal(409, 'session_changed') };
  }
  /* The server clock, floored to the engine's millisecond. */
  const nowMs = Math.floor(new Date(read.now).getTime());
  const fromMs = Number(h.settled_to_ms);
  const pending = h.leave_at_ms != null || h.change_at_ms != null || h.enabled === false;
  if (!(nowMs > fromMs)) {
    return { outcome: 'nothing', reason: 'not_due', status: 200, body: { ok: true, settled: false, reason: 'not_due', ...env } };
  }
  /* THE FLOOR: the player door's (and a purchase's collect) — a settle asked
     for inside a minute of the last one writes nothing; a switch's collect and
     the tick pass 0. A pending leave/change is never held back. */
  const minMs = Number.isFinite(Number(o.minWindowMs)) ? Math.max(0, Number(o.minWindowMs))
    : (mode === 'settle' ? HUNT_SETTLE_MIN_MS : 0);
  if (!pending && nowMs - fromMs < minMs) {
    return { outcome: 'nothing', reason: 'below_min_span', status: 200,
      body: { ok: true, settled: false, reason: 'below_min_span', ...env } };
  }

  const hs = huntSessionFromRead(h);
  let press = null;
  if (mode === 'use') {
    const bar = Math.floor(Number(o.barSlot));
    /* Huntera's bar: ACTION_SET_LIMITS.slots (20) slots, data — not a literal. */
    if (!Number.isInteger(bar) || bar < 0 || bar >= ACTION_SET_LIMITS.slots) return { outcome: 'refused', reason: 'bad_bar_slot', ...refusal(400, 'bad_bar_slot') };
    if (h.leave_at_ms != null || h.change_at_ms != null) return { outcome: 'refused', reason: 'hunt_leaving', ...refusal(409, 'hunt_leaving', { ...env, ok: false }) };
    if (nowMs < Number(h.hunt_from_ms)) return { outcome: 'refused', reason: 'hunt_walking', ...refusal(409, 'hunt_walking', { ...env, ok: false }) };
    /* The press joins the queue the engine walks, stamped with THIS read's
       server instant; hr_hunt_apply re-validates it and stamps the same value
       (clamped into [settled_to, now()]) under the lock. */
    press = { slot: bar, at: nowMs };
    hs.presses = [...hs.presses, press];
  }

  const perks = await readTickPerks(exec, user, slot);
  const bestiaryKills = await readTickBestiary(exec, user, slot);
  const salt = String(h.secret || '');

  let toMs = nowMs;
  let degraded = 0;
  for (;;) {
    const out = computeAccrual(huntEngineInputs({
      user, slot, env, hs, nowMs, fromMs, toMs, perks, bestiaryKills,
      secret: salt, pressAtMs: press ? press.at : null,
    }));
    if (!out.accrued) {
      return { outcome: 'nothing', reason: String(out.reason || 'nothing'), status: 200,
        body: { ok: true, settled: false, reason: String(out.reason || 'nothing'), ...env } };
    }
    const intentId = mode === 'use' && o.intentId
      ? o.intentId
      : await intentIdFor({
        user, slot, watermark: huntWatermarkLabel(h),
        version: env.version, salt, attempt: degraded,
      });
    const res = await commitHuntSettle(exec, {
      user, slot, sessionId: String(h.id), version: env.version, intentId, out, press,
      project: o.project === true,
    });
    if (res && res.ok === true) {
      const ended = res.hunt_settle && res.hunt_settle.ended ? String(res.hunt_settle.ended) : null;
      return {
        outcome: res.stage === 'replayed' ? 'nothing' : 'paid',
        reason: res.stage === 'replayed' ? 'replayed' : null,
        ended,
        status: 200,
        body: { ...res, ok: true, settled: res.stage !== 'replayed',
          ...(degraded ? { degraded } : {}) },
      };
    }
    const err = String((res && res.error) || 'apply_failed');
    if (HUNT_DEGRADABLE.includes(err) && degraded < HUNT_MAX_DEGRADE && !press) {
      /* ASK FOR LESS: half the window, so fewer swings and a smaller delta. The
         session clock still only moves by what is settled; the rest is owed. */
      const half = fromMs + Math.floor((toMs - fromMs) / 2);
      if (!(half > fromMs)) {
        return { outcome: 'refused', reason: err, ...refusal(409, err, { detail: res ?? null }) };
      }
      toMs = half;
      degraded++;
      continue;
    }
    return { outcome: 'refused', reason: err, ...refusal(409, err, { detail: res ?? null, stage: res && res.stage }) };
  }
}

/* ── THE THREE PIECES OF ONE SETTLE, EXPORTED ────────────────────────────────
   settleOnce composes exactly these; tests/hunt-sessions-settle.mjs composes
   the same three against a replayed chain (choosing the window end a real
   clock would), so the guard grades the bytes that deploy, not a copy. */

/** The computeAccrual input of one hunt-session window. Field by field: the
    envelope spread is ./envelope.js's ONE field list (every settle reads the
    character the same way); everything else is named here. No `caller`: a
    session's window is its own, and the caller taxonomy only prices absences. */
export function huntEngineInputs(o) {
  return {
    userId: o.user,
    slot: o.slot,
    nowMs: o.toMs,
    ...engineInputsFromEnvelope(o.env, o.nowMs),
    seed: 0,
    perks: o.perks ?? null,
    unlockedRecipes: (o.perks && o.perks.unlockedRecipes) ?? null,
    bestiaryKills: o.bestiaryKills ?? null,
    companionXpBacked: COMPANION_XP_SERVER_BACKED,
    items: ITEMS,
    monsters: MONSTERS,
    nodes: GATHER_NODES,
    recipes: ARTISAN_RECIPES_ALL,
    actionBudget: null,
    huntSession: o.hs,
    huntWindow: { fromMs: Number(o.fromMs), toMs: o.toMs, pressAtMs: o.pressAtMs ?? null },
    huntSecret: String(o.secret || ''),
  };
}

/** The derived intent label of a tick/settle window: the session and the swing
    the window starts at (with the version and the secret salt, intentIdFor). */
export function huntWatermarkLabel(h) {
  return 'hunt:' + String(h.id) + ':' + String(h.swing_index);
}

/** THE COMMIT: one statement, hr_hunt_apply. An HR000 that escaped its own
    handler is still a named refusal (the message is the machine code);
    anything else is a defect and propagates. */
export async function commitHuntSettle(exec, c) {
  try {
    const [r] = await exec(HUNT_APPLY_SQL, [c.user, c.slot, c.sessionId, c.version, c.intentId,
      JSON.stringify(c.out.delta), JSON.stringify(c.out.hunt),
      c.out.huntBuffs ? JSON.stringify(c.out.huntBuffs) : null,
      c.press ? JSON.stringify(c.press) : null,
      c.project === true]);
    return r && r.res;
  } catch (e) {
    if (String((e && e.code) ?? '') !== 'HR000') throw e;
    return { ok: false, error: String((e && e.message) || 'hunt_settle_refused'), stage: 'raise' };
  }
}

/* ── THE TICK'S SELECTORS ────────────────────────────────────────────────────
   `hunts` in the driver's body: (user_id, slot, session_id) and NOTHING else is
   read — the session, the clock and the character are re-read in this request.
   A malformed row is dropped, not refused (one bad row must not cost the rest
   their settle). Null-prototype, field by field (parseTickBody's discipline). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_HUNTS = 500;
export function parseHunts(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  const seen = new Set();
  for (const row of raw) {
    if (out.length >= MAX_HUNTS) break;
    if (!row || typeof row !== 'object') continue;
    const userId = typeof row.user_id === 'string' && UUID_RE.test(row.user_id) ? row.user_id.toLowerCase() : null;
    const slot = Number.isInteger(row.slot) && row.slot >= 0 && row.slot < 100 ? row.slot : null;
    const session = typeof row.session_id === 'string' && UUID_RE.test(row.session_id) ? row.session_id.toLowerCase() : null;
    if (userId === null || slot === null || session === null) continue;
    const key = userId + ':' + slot;
    if (seen.has(key)) continue;
    seen.add(key);
    const sel = Object.create(null);
    sel.userId = userId;
    sel.slot = slot;
    sel.session = session;
    out.push(sel);
  }
  return out;
}

/* ── THE PLAYER DOORS (index.ts) ─────────────────────────────────────────────
   `hunt_settle` and `hunt_use`. The body is `{status, body}`; the envelope on a
   success is the post-settle hr_state_of plus `session` (hr_hunt_view). */
export async function runHuntVerb(o) {
  const v = await settleHunt({
    exec: o.exec, user: o.user, slot: o.slot,
    mode: o.verb === 'hunt_use' ? 'use' : 'settle',
    bucket: o.bucket,
    intentId: o.intentId,
    barSlot: o.barSlot,
    project: true,
  });
  return { status: v.status, body: { ...v.body, verb: o.verb } };
}
