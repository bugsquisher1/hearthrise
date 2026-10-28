// ============================================================================
// supabase/functions/hr-accrue/hunt-settle.js — THE HUNT INSTANCE SETTLE.
//
// Ruling HR-2026-10-14 §2 ("the world tick is the only thing that settles a
// session") and HUNT_SCREEN_SPEC §1.3 (lane S1): a settle runs per INSTANCE.
// A solo hunt is a party of one. ONE implementation, reached from two doors
// that differ only in WHEN they ask:
//
//   the world tick   tick.js, for every session hr_hunt_roster leased to it
//                    (mode 'tick': no rate gate, a derived intent key)
//   hunt_settle      the player's "bring me up to date" (mode 'settle': the
//                    `accrue` rate bucket, the HUNT_SETTLE_MIN_MS floor unless
//                    a leave / change is pending)
// and from the collect every settle-before-mutate verb runs (set-activity.js
// collectCurrentWindow routes a hunter here, mode 'settle', so a purchase or a
// meal mid-hunt prices the hunt at the state BEFORE it — Security F1's rule).
// Hunts are idle (Tyler 2026-10-16): there is no press door.
//
// ── WHAT ONE SETTLE DOES ────────────────────────────────────────────────────
//   (1) READ, in one statement: the rate gate (player doors), the caller's open
//       session's INSTANCE and EVERY open member of it (hr_hunt_instance_read:
//       the instance clock and world, each member's session, bag, options and
//       engine inputs (hr_hunt_member_state), the instance's keyed-seed
//       secret), the server clock. The caller's envelope only when a player
//       door's early answer carries it (HUNT_STATE_SQL).
//   (2) each member's perk stack (./tick-reads.js).
//   (3) COMPUTE: accrual.js accrueHunt — the one combat loop over the instance
//       world, one HMAC-keyed seed stream per swing and domain (./hunt-seed.js).
//   (4) COMMIT, one statement: hr_hunt_apply_instance(instance, world swing,
//       the instance half, every member's halves). Postgres locks the instance,
//       then every member in (user_id, slot) order, re-proves every member's
//       window and the instance's world, and decides whether ANY of it may land
//       — all of it or none.
//   A `session_moved` (another settler won the lock) is re-read and recomputed
//   once; a clamp the degrade ladder can shrink halves the window (at most
//   HUNT_MAX_DEGRADE times). Anything else is answered as-is: the instance
//   stays where it was, owed, and the next fire offers it again.
//
// ── WHAT IT NEVER DOES ──────────────────────────────────────────────────────
//   · never writes a table (hr_engine holds none) and never calls hr_apply
//     outside hr_hunt_apply_instance — the session half and the value half of
//     every member are one;
//   · never reads a client value: the request contributes `slot` (a row the
//     caller owns) and nothing else;
//   · never consults presence, an offline cap, a return anchor or `ctx.away`
//     (TICK-2): a hunt is a hunt, watched or not.
//
// PURE ESM behind the injected `exec` seam, Node + Deno. No `?v=`.
// ============================================================================

import { accrueHunt } from './accrual.js';
import { engineInputsFromEnvelope } from './envelope.js';
import { intentIdFor } from './intents.js';
import { readTickPerks } from './tick-reads.js';
import { huntGroundOf } from '../../../src/core/hunt-ground.js';
import { huntTimeline, worldHash } from '../../../src/core/hunt-track.js';
import { ITEMS } from '../../../src/data/items.js';
import { HUNT_TUNING } from '../../../src/data/hunt-tuning.js';
import { MONSTERS } from '../../../src/data/monsters.js';
import { wornRoleKey } from '../../../src/data/hunt-roles.js';
import { heroSetup } from '../../../src/core/hunt-spawn.js';
import { memberSide, frozenOf } from '../../../src/core/member.js';
import { WORLD_VERSION, SHAPE as WORLD_SHAPE } from '../../../src/core/hunt/world-state.js';
import { seederFor } from './hunt-seed.js';

/* A DEPLOY IN FLIGHT (2026-12-11-hunt-deploy-no-forfeit.sql). The read carries the server catalogue's
   world shape (hr_hunt_instance_read instance.world_shape = hr_hunt_world_shape { v, s }). When it is not
   this engine's (world-state.js WORLD_VERSION / SHAPE), the catalogue and this edge are landing seconds
   apart, in either order, and any world proposed now is one the server cannot store: every such settle
   would be a refusal the server caused, and the sixth in a row forfeits the hunt. So nothing is proposed:
   no commit, no refusal, no count. The instance keeps its owed window on its unmoved settled_to and the
   first fire after both have landed settles it whole (a stored world of the old shape restarts:
   decodeStored). A read with no shape (a database before that file) is no deploy. */
function worldShapePending(ws) {
  return ws != null && typeof ws === 'object' && (Number(ws.v) !== WORLD_VERSION || Number(ws.s) !== WORLD_SHAPE);
}

/* THE LIVE VIEW (option B, Tyler 2026-10-19). The browser runs the SAME instance engine
   (src/core/combat-sim.js, the member assembly src/core/member.js) for the VIEWED character,
   display only, and the server confirms. `hunt_live` is what it needs to start from the instance's
   last settled point: the stored world (and its hash), the instance clocks, every member's engine
   input and the next LIVE_SEEDS combat-swing seeds. THE DROP STREAM ('r') IS NEVER SENT: the
   browser cannot foresee loot, and shows none until a server envelope confirms it. A party
   member's purse is withheld (null); its skills, gear and bar are sent (the shared instance needs
   them; listed for the reopen Security review in docs/design/ARCHITECTURE_CONTRACTS.md §L). Prediction
   only: nothing the browser simulates is spent or credited (CLAUDE.md §1, §6). */
/* The look-ahead is ONE data constant the browser reads too (src/data/hunt-tuning.js liveSeeds). */
export const LIVE_SEEDS = HUNT_TUNING.liveSeeds;
/** The next LIVE_SEEDS combat-swing seeds from world swing `from` (domain 's' only, never 'r'). */
export function liveSeeds(inst, from) {
  const seed = seederFor(String(inst.secret || ''), String(inst.id));
  const list = [];
  for (let i = 0; i < LIVE_SEEDS; i++) list.push(seed('s', from + i));
  return { domain: 's', from, list };
}
export function huntLive(inst, members, user, slot) {
  const from = Math.max(0, Math.floor(Number(inst.world_swing) || 0));
  const world = typeof inst.world === 'string' ? inst.world : null;
  return {
    v: 1,
    instance: { id: String(inst.id), hunt: String(inst.hunt), world, world_hash: worldHash(world),
      settled_to_ms: Number(inst.settled_to_ms), next_swing_at_ms: Number(inst.next_swing_at_ms), world_swing: from },
    seeds: liveSeeds(inst, from),
    members: members.map((m) => {
      const self = String(m.user) === String(user) && Number(m.slot) === Number(slot);
      /* THE VIEWER'S OWN member: its full engine input. EVERY OTHER member: only its frozen numbers
         (src/core/member.js frozenOf; Tyler 2026-10-20: no skills, gear, perks, premium or bestiary). */
      if (!self) {
        return { key: m.key, seat: m.seat, unitId: m.unitId, self: false,
          frozen: frozenOf(memberSide(m, { items: ITEMS }), kindsOf(inst, world), Number(inst.next_swing_at_ms)) };
      }
      return { key: m.key, seat: m.seat, unitId: m.unitId, self, huntSession: m.huntSession,
        skills: m.skills, levelXp: m.levelXp, xpFrac: m.xpFrac, hp: m.hp, gold: m.gold,
        equipment: m.equipment, buffs: m.buffs, perks: m.perks, hero: m.hero };
    }),
  };
}

/* The monster kinds a peer's rolls are frozen against: every kind the ground's pockets field,
   and any standing in the stored world. */
function kindsOf(inst, worldText) {
  const out = new Set();
  const where = huntGroundOf(String(inst.hunt));
  for (const p of (where && where.ground.pockets) || []) for (const sp of [...(p.spawns || []), ...(p.pack || [])]) if (sp && MONSTERS[sp.monster]) out.add(sp.monster);
  if (worldText) for (const u of JSON.parse(worldText).u || []) for (const v of u) if (typeof v === 'string' && MONSTERS[v]) out.add(v);
  return Array.from(out).sort();
}

/* THE PLAYER DOOR'S FLOOR (hunt_settle, a hunter's accrue, a purchase's
   collect): a settle asked for inside this of the last one prices nothing and
   writes nothing — the ledger-volume fuse on a client-driven door. 15 s, below
   the 20 s mid-hunt slack (settings and bag verbs refuse `settle_first` past
   it), so "settle, then edit" always lands. A pending leave/change is never
   held back. */
export const HUNT_SETTLE_MIN_MS = 15000;

/* hr_apply clamps the degrade ladder can escape by asking for less. A hunt
   halves its WINDOW (fewer swings), never its rates. */
export const HUNT_DEGRADABLE = Object.freeze([
  'gold_clamp', 'item_clamp', 'xp_clamp', 'progress_clamp',
  'too_many_item_kinds', 'too_many_progress_ops', 'bank_full', 'daily_budget',
]);
export const HUNT_MAX_DEGRADE = 3;

/* THE PER-SETTLE SIMULATED SPAN, SIZED TO THE EDGE'S CPU (lane/c-tick-span, 2026-10-28; first the 546
   WORKER_RESOURCE_LIMIT fuse of P1 2026-10-20, at 15 min). A settle simulates at most this much of the instance's
   backlog, on either door; the rest stays owed on its unmoved settled_to and the next fire takes the next slice
   (2027-02-04-tick-span.sql re-offers a session whose settle landed at the very next fire). Splitting a window
   moves no outcome: the engine is cut-invariant (tests/hunt-sessions-settle.mjs TICK-1 / BOTH-PATH / PARITY,
   tests/hunt-tick-shards.mjs OUTAGE).
   WHY 2 MIN. Engine CPU grows with the simulated span and varies ~10x with the ground and the moment (measured
   2026-10-28, Node, the real grounds: 0.3-1.4 ms per simulated second lightly loaded, 2.5-3.5 under load; the
   optimization review's 4-hero p95 6.2). At 15 min one 4-hero instance cost 1-2.3 s, so after any tick outage past
   ~4 min every 4-instance body ran over the edge's 2 s CPU limit and died on every retry: the backlog never
   drained. 2 min is above the steady window (the 90 s flush + one 10 s cadence) and its worst slice (~0.75 s at
   6.2 ms/s) fits beside HUNT_ENGINE_BUDGET_MS under the limit with room for an edge 1.6x slower than that bench. */
export const HUNT_SETTLE_SPAN_MS = 2 * 60000;

/* THE ENGINE BUDGET, PER REQUEST (lane/c-tick-span). Measured engine time (accrueHunt is synchronous: its wall
   is its CPU), shared by every settle of one tick body and fresh for each player door call. NO ENGINE RUN STARTS
   AT OR PAST IT — a body's next instance is deferred (left owed and leased; the roster puts the most-behind
   instance first in its next body), and a settle's retry or degrade step answers its last refusal instead — so a
   request's engine CPU is at most this plus one slice: 0.8 s + ~0.75 s, under the edge's 2 s (EDGE_CPU_MS). A full
   body at the steady window (4 x ~0.19 s at the 4-hero mean) runs whole. The first run of a request always starts.
   Pacing only: where a body stops never moves an outcome. */
export const HUNT_ENGINE_BUDGET_MS = 800;
/* The edge's CPU limit per request (Supabase Edge Functions, 2 s): the bound HUNT_ENGINE_BUDGET_MS and
   HUNT_SETTLE_SPAN_MS are sized against. tests/hunt-tick-shards.mjs OUTAGE measures a full body under it. */
export const EDGE_CPU_MS = 2000;
const perfNow = () => (globalThis.performance && typeof globalThis.performance.now === 'function'
  ? globalThis.performance.now() : Date.now());
/** One request's engine budget: `limitMs` of measured engine time, `clock` the timer (a test seam; the edge's
    is performance.now). `spentMs`, `runs` and `maxRunMs` are what the request's engine runs measured. */
export function engineBudget(limitMs, clock) {
  const lim = Number(limitMs);
  return { limitMs: Number.isFinite(lim) && lim >= 0 ? lim : HUNT_ENGINE_BUDGET_MS,
    clock: typeof clock === 'function' ? clock : perfNow, spentMs: 0, runs: 0, maxRunMs: 0 };
}
const budgetSpent = (b) => b.spentMs >= b.limitMs;
/* Refusals that mean "someone else moved the instance under us" — or, with ONE purse per account
   (2026-12-15-account-gold.sql), "another hero of the account moved the purse under us": a store bill
   the purse no longer pays (gold_short) or a gold_out end it no longer proves (another hero's coins
   arrived). The server never clamps a bill the engine already spent; it refuses the window, and this
   re-reads at once so the window re-runs on the fresh purse. */
const RETRYABLE = Object.freeze(['session_moved', 'version_conflict', 'gold_short']);
export function retryableSettle(v) {
  if (!v || v.outcome !== 'refused') return false;
  if (RETRYABLE.includes(v.reason)) return true;
  const d = v.body && v.body.detail && v.body.detail.detail;
  return v.reason === 'end_not_proven' && !!d && d.reason === 'gold_out';
}

/* THE READ. One statement: the gate is its first term on a player door (D3:
   a call that settles nothing still spends budget), absent on the tick's.
   Each member's `state` is its ENGINE INPUTS (hr_hunt_member_state, 2027-02-02-settle-cost.sql), never its
   whole envelope, and the caller's envelope is no longer a term here: see HUNT_STATE_SQL. */
export const HUNT_READ_SQL = `
  with g as (select case when $3::text is null then true
                         else public.hr_rate_gate($1::uuid, $2::int, $3::text) end as allowed)
  select g.allowed                                                                  as allowed,
         case when g.allowed then public.hr_hunt_instance_read($1::uuid, $2::int) end as inst,
         now()                                                                      as now
    from g`;

/* THE CALLER'S ENVELOPE ON AN EARLY ANSWER (2027-02-02-settle-cost.sql). A PLAYER door's answer that settles nothing
   (not due, below the floor, no hunt, a deploy in flight, nothing accrued) carries the caller's envelope, which the client
   applies; a settle that lands answers the commit's own projection (hr_hunt_apply_instance's), and the world tick's
   answers carry nothing (tick.js reads outcomes and reasons, never a body). So it is read only when an answer needs it,
   at most once. It was a term of HUNT_READ_SQL, built on every read — the busiest statement in the database (measured
   2026-10-28: 61 reads in 26 min at 440 ms each), read on the tick by nobody. */
export const HUNT_STATE_SQL = 'select public.hr_state_of($1::uuid, $2::int) as state';
function envReader(o) {
  let memo;
  return async () => {
    if (o.project !== true) return null;
    if (memo === undefined) {
      const [s] = await o.exec(HUNT_STATE_SQL, [o.user, o.slot]);
      memo = (s && s.state) || null;
    }
    return memo;
  };
}

/* THE COMMIT. `::text::jsonb` on every pre-stringified argument — the
   transport rule tests/delta-transport.mjs grades. */
export const HUNT_APPLY_SQL = `
  select public.hr_hunt_apply_instance($1::uuid, $2::bigint, $3::text::jsonb, $4::text::jsonb,
                                       $5::uuid, $6::int) as res`;

/* "Is a hunt open?" — the cheap read the accrue and collect paths make so the
   old pricing never runs for a hunter. 42883 (no such function) reads "no". */
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

const num = (v) => (v === null || v === undefined || v === '') ? null : Number(v);

/** The engine-shape session input of one member (newHuntSession builds it). Field by field. */
export function huntSessionFromRead(h, instanceId) {
  return {
    id: String(h.id),
    instanceId: String(instanceId),
    huntFromMs: num(h.hunt_from_ms),
    nextSwingAtMs: num(h.next_swing_at_ms),
    swingIndex: num(h.swing_index),
    bag: h.bag || {},
    hoursLimit: num(h.hours_limit),
    leaveAtMs: num(h.leave_at_ms),
    changeAtMs: num(h.change_at_ms),
    /* THE KILL SWITCH ends the hunt at its first boundary ('server', END_ORDER
       last), which hr_hunt_settle_session re-proves from hr_hunt_config. */
    stopAtMs: h.enabled === false ? num(h.settled_to_ms) : null,
    /* THE STAMINA POOL AT THE WINDOW START and the cap it rests to — the
       database's own hr_stamina_of / hr_stamina_cap, never a client value. */
    staminaMs: num(h.stamina_ms),
    staminaMaxMs: num(h.stamina_max_ms),
    /* THE STORE (hr_hunt_basic_supplies) — catalogue rows; newHuntSession keeps
       well-formed ones. The hero's bar slots choose the row a use buys. */
    basics: (h.basics && typeof h.basics === 'object') ? h.basics : {},
    /* THE HERO'S SUPPLY SETTING, gold floor and the loot sell-to-cover may sell. */
    goldFloor: num(h.gold_floor),
    supplySource: typeof h.supply_source === 'string' ? h.supply_source : null,
    onEmpty: typeof h.on_empty === 'string' ? h.on_empty : null,
    cover: (h.cover && typeof h.cover === 'object') ? h.cover : {},
  };
}

const refusal = (status, error, extra) => ({ status, body: { ok: false, error, ...(extra || {}) } });

/**
 * ONE SETTLE OF THE INSTANCE THE CALLER'S OPEN SESSION HUNTS IN.
 *
 * @param o.exec      the one-statement seam (index.ts / tick.js)
 * @param o.user      the VERIFIED subject (player doors) or a roster selector (tick)
 * @param o.slot      the character slot
 * @param o.mode      'tick' | 'settle'
 * @param o.bucket    the rate bucket (player doors), null on the tick
 * @param o.session   the session the caller expects (tick roster), or null
 * @param o.project   answer with the caller's post-settle envelope (player doors)
 * @param o.minWindowMs  the floor below which nothing is settled
 * @param o.grounds   test seam: { [huntId]: { ground, grid } } instead of huntGroundOf
 * @param o.atMs     test seam: end the window here instead of at the server's now
 *                    (clamped to it; production passes none)
 * @param o.worldMaxBytes  test seam: a TIGHTER world bound (accrual.js accrueHunt
 *                    takes the smaller; production passes none)
 * @param o.budget    the request's engineBudget (tick.js shares one across a body and admits a settle only
 *                    while it is unspent); absent = a fresh HUNT_ENGINE_BUDGET_MS for this call. This
 *                    settle's FIRST engine run always starts; its retry and degrade steps start only
 *                    while the budget is unspent.
 * @returns {{ outcome: 'paid'|'nothing'|'none'|'refused'|'limited', reason?, status, body, ended?, behindMs? }}
 *          A player door's paid body carries `hunt_behind_ms`: how far the instance still is behind the server's now
 *          (0 = caught up), and `hunt_slices` when it took more than one.
 */
export async function settleHunt(o) {
  const mode = o.mode === 'settle' ? 'settle' : 'tick';
  const budget = o.budget && typeof o.budget === 'object' ? o.budget : engineBudget();
  const first = await settleRetried(o, mode, budget);
  /* THE TICK SETTLES ONE SLICE AN INSTANCE A FIRE (tick.js `covered`, fair across a body); the next fire takes the next. */
  if (mode !== 'settle' || first.outcome !== 'paid') return first;
  /* THE PLAYER DOOR CATCHES UP (lane/c-tick-span). After a tick outage the hunt can be minutes behind, and every
     settle-before-mutate verb and settings edit refuses `settle_first` until it is not. So a player's own settle (the
     hunt re-read, a verb's collect) takes slice after slice, oldest first, while the instance is still behind and ITS
     OWN budget (fresh a call) is unspent, at most HUNT_PLAYER_SLICES_MAX: one 2-min slice each, every one its own read,
     engine run and commit, exactly the windows the tick would have cut (the engine is cut-invariant). A later slice's
     refusal or early answer leaves the landed ones landed and the rest owed; the answer is the LAST commit's envelope. */
  const slices = [first];
  while (slices.length < HUNT_PLAYER_SLICES_MAX && !slices[slices.length - 1].ended
         && slices[slices.length - 1].behindMs > 0 && !budgetSpent(budget)) {
    const v = await settleRetried({ ...o, bucket: null }, mode, budget);
    if (v.outcome !== 'paid') break;
    slices.push(v);
  }
  return caughtUp(slices, o);
}

/* The most slices one player call settles (16 min of hunt): the call's DB work stays bounded (one read and one commit
   a slice) whatever its engine budget leaves; the hunt re-read (16 s) and the tick take the rest. */
export const HUNT_PLAYER_SLICES_MAX = 8;

/* One settle with its one retry on a race (RETRYABLE), never a retry past the budget. */
async function settleRetried(o, mode, budget) {
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    /* A retry is another read and another engine run: never one past the budget (its refusal stands, owed). */
    if (attempt > 0 && budgetSpent(budget)) return last;
    const v = await settleOnce(o, mode, budget);
    if (!retryableSettle(v)) return v;
    last = v;
  }
  return last;
}

/* A player door's answer over its slices: the last commit's envelope, how far behind it leaves the hunt, and (viewed)
   ONE timeline from the first slice's start to the last's end — tracks and events in order (an event's id is its
   instant's, the same however the windows were cut), each monster as it stood when it first appeared. */
async function caughtUp(slices, o) {
  const last = slices[slices.length - 1];
  const extra = { hunt_behind_ms: last.behindMs, ...(slices.length > 1 ? { hunt_slices: slices.length } : {}) };
  if (slices.length > 1 && o.project === true) {
    const tl = slices.map((s) => s.timeline);
    const units = {};
    for (let i = tl.length - 1; i >= 0; i--) Object.assign(units, tl[i].units || {});
    Object.assign(extra, huntTimeline(tl.flatMap((t) => t.track || []), tl.flatMap((t) => t.events || []), tl[0].fromMs,
      tl[tl.length - 1].toMs, tl[tl.length - 1].nowMs, units));
  }
  /* the last landed slice was cut short (the budget or the slice cap stopped the catch-up): its commit built no
     envelope, so the caller's is read once (HUNT_STATE_SQL), under the answer's own keys */
  const env = o.project === true && !last.projected ? await envReader(o)() : null;
  return { ...last, body: { ...(env || {}), ...last.body, ...extra } };
}

async function settleOnce(o, mode, budget) {
  const plan = await readHuntSettle(o, mode);
  if (plan.answer) return plan.answer;
  const { user, slot } = o;
  const { envOf, fromMs } = plan;
  let toMs = plan.toMs;
  let degraded = 0;
  /* The refusal a degrade step answers to: the one it would have escaped, were the budget not spent. */
  let pending = null;
  /* ASK FOR LESS: half the window, so fewer swings and a smaller delta (or another
     world). The instance clock still only moves by what is settled; the rest is owed. */
  const shorter = (err, detail) => {
    const half = fromMs + Math.floor((toMs - fromMs) / 2);
    pending = { outcome: 'refused', reason: err, ...refusal(409, err, detail) };
    if (degraded >= HUNT_MAX_DEGRADE || !(half > fromMs)) return pending;
    toMs = half;
    degraded++;
    return null;
  };
  for (;;) {
    /* NO DEGRADE STEP PAST THE BUDGET (lane/c-tick-span): this settle's first run was admitted by its caller (tick.js
       checks the body's shared budget; a player door's is fresh); a halved window is another engine run, so a spent
       budget answers the refusal it would have escaped. Nothing is written; the next fire tries the instance again. */
    if (degraded > 0 && budgetSpent(budget)) return pending;
    const p = await proposeHuntSettle(plan, toMs, degraded, budget.clock);
    budget.spentMs += p.engineMs;
    budget.runs += 1;
    budget.maxRunMs = Math.max(budget.maxRunMs, p.engineMs);
    if (!p.out.accrued && p.out.refused) {
      /* THE ENGINE REFUSED THE WINDOW (accrual.js HUNT_REFUSE): nothing was
         proposed and nothing is committed. */
      const err = String(p.out.reason);
      const stop = shorter(err, { detail: { world_bytes: p.out.worldBytes, world_max_bytes: p.out.worldMaxBytes } });
      if (stop) return stop;
      continue;
    }
    if (!p.out.accrued) {
      return { outcome: 'nothing', reason: String(p.out.reason || 'nothing'), status: 200,
        body: { ok: true, settled: false, reason: String(p.out.reason || 'nothing'), ...(await envOf()) } };
    }
    /* A player door's slice the span cap cut short is not its answer (the catch-up takes the next): it builds no
       envelope (settle-cost's rule); the answer reads the caller's once, after the last (caughtUp). */
    const projected = o.project === true && !(mode === 'settle' && plan.toMs < plan.endMs);
    const res = await commitHuntSettle(o.exec, { ...p.commit, project: projected ? { user, slot } : null });
    if (res && res.ok === true) {
      const own = (res.members || []).find((x) => String(x.user) === String(user) && Number(x.slot) === Number(slot)) || {};
      const ended = own.hunt_settle && own.hunt_settle.ended ? String(own.hunt_settle.ended) : null;
      const replayed = res.stage === 'replayed';
      return {
        outcome: replayed ? 'nothing' : 'paid',
        reason: replayed ? 'replayed' : null,
        ended,
        /* THE MEMBERS THIS COMMIT SETTLED (2027-02-02-settle-cost.sql): ONE settle an instance a fire. tick.js skips
           a later selector of any of them in the same fire: caught up, its read would settle nothing, or, a few seconds
           into a slow body, one swing (a whole commit for two seconds of hunt; measured 2026-10-28: 61 reads and 35
           commits for one party); behind (the span cap, a halved window), it would simulate the NEXT slice in the same
           body, so a lagging party cost one slice per member — the body's engine CPU (2 s a request) multiplied by
           its party size exactly when it is already behind. The rest is owed to the next fire (2027-02-04-tick-span.sql
           re-offers a landed session at once: HUNT_SETTLE_SPAN_MS a fire, 12x real time at a 10 s tick). */
        covers: replayed ? null : (res.members || []).map((x) => String(x.user).toLowerCase() + ':' + Number(x.slot)),
        /* how far this commit leaves the instance behind the instant it was asked to reach (the span cap, a halved
           window): the player door's catch-up reads it; the slice's own timeline, for one merged answer */
        behindMs: replayed ? 0 : Math.max(0, plan.endMs - p.out.settledTo),
        projected,
        timeline: o.project === true ? { track: p.out.track, events: p.out.events, units: p.out.units, fromMs,
          toMs: p.out.settledTo, nowMs: plan.nowMs } : null,
        status: 200,
        body: { ...(res.state || {}), ok: true, settled: !replayed, hunt_settle: own.hunt_settle || null,
          session: own.session || null, instance: res.instance || null,
          ...(o.project === true ? huntTimeline(p.out.track, p.out.events, fromMs, p.out.settledTo, plan.nowMs, p.out.units) : {}),
          /* THE RECONCILE KEY of the world this commit stored: the live view compares its own. */
          ...(o.live === true ? { hunt_check: { world_swing: p.out.worldSwingTo, settled_to_ms: p.out.settledTo, world_hash: worldHash(p.out.world),
            /* the next combat seeds from the stored world: a matching prediction runs on with them */
            seeds: liveSeeds(plan.inst, p.out.worldSwingTo) } } : {}),
          ...(degraded ? { degraded } : {}) },
      };
    }
    const err = String((res && res.error) || 'apply_failed');
    if (HUNT_DEGRADABLE.includes(err) && degraded < HUNT_MAX_DEGRADE) {
      const stop = shorter(err, { detail: res ?? null });
      if (stop) return stop;
      continue;
    }
    return { outcome: 'refused', reason: err, ...refusal(409, err, { detail: res ?? null, stage: res && res.stage }) };
  }
}

/* ── THE THREE PIECES OF ONE SETTLE, EXPORTED ────────────────────────────────
   settleOnce composes exactly these; tests/hunt-sessions-settle.mjs composes the
   same three against a replayed chain (and may tamper the proposal between the
   second and the third), so the guard grades the bytes that deploy.

   (1) THE READ: the gate, the instance and its members, the server clock, and
       every early answer (rate-limited, no hunt, not due, below the floor, no
       ground, no role). Answers { answer } or the plan { envOf, inst, members,
       where, fromMs, toMs, nowMs } (envOf: the caller's envelope, read on first ask
       and only for a player door). */
export async function readHuntSettle(o, mode) {
  const { exec, user, slot } = o;
  const [read] = await exec(HUNT_READ_SQL, [user, slot, mode === 'tick' ? null : (o.bucket || null)]);
  if (!read || read.allowed !== true) {
    return { answer: { outcome: 'limited', reason: 'rate_limited', ...refusal(429, 'rate_limited') } };
  }
  const envOf = envReader(o);
  const r = read.inst;
  if (!r || r.open !== true) {
    /* No open hunt. A player door says which: no character at all, or none hunting (with its envelope). */
    const env = await envOf();
    if (env && env.ok !== true) {
      return { answer: { outcome: 'none', reason: 'no_character', ...refusal(409, env.error || 'no_character') } };
    }
    return { answer: { outcome: 'none', reason: 'no_hunt', ...refusal(409, 'no_hunt', { ...env, ok: false }) } };
  }
  const mine = (r.members || []).find((m) => String(m.user) === String(user) && Number(m.slot) === Number(slot));
  if (!mine || (o.session && String(o.session) !== String(mine.session.id))) {
    /* The roster named a session that is no longer the open one. Not this fire's. */
    return { answer: { outcome: 'none', reason: 'session_changed', ...refusal(409, 'session_changed') } };
  }
  if (!mine.state || mine.state.ok !== true) {
    return { answer: { outcome: 'none', reason: 'no_character', ...refusal(409, (mine.state && mine.state.error) || 'no_character') } };
  }
  const inst = r.instance;
  if (worldShapePending(inst.world_shape)) {
    return { answer: { outcome: 'nothing', reason: 'world_shape_pending', status: 200,
      body: { ok: true, settled: false, reason: 'world_shape_pending', ...(await envOf()) } } };
  }
  /* The server clock, floored to the engine's millisecond. */
  const nowMs = Math.floor(new Date(read.now).getTime());
  const fromMs = Number(inst.settled_to_ms);
  const pending = r.members.some((m) => m.session.leave_at_ms != null || m.session.change_at_ms != null)
    || inst.enabled === false;
  const notDue = async () => ({ answer: { outcome: 'nothing', reason: 'not_due', status: 200,
    body: { ok: true, settled: false, reason: 'not_due', ...(await envOf()) } } });
  if (!(nowMs > fromMs)) return notDue();
  const minMs = Number.isFinite(Number(o.minWindowMs)) ? Math.max(0, Number(o.minWindowMs))
    : (mode === 'settle' ? HUNT_SETTLE_MIN_MS : 0);
  const below = !pending && nowMs - fromMs < minMs;
  if (below && o.live !== true) {
    return { answer: { outcome: 'nothing', reason: 'below_min_span', status: 200,
      body: { ok: true, settled: false, reason: 'below_min_span', ...(await envOf()) } } };
  }
  const where = (o.grounds && o.grounds[inst.hunt]) || huntGroundOf(inst.hunt);
  if (!where) return { answer: { outcome: 'refused', reason: 'no_ground', ...refusal(409, 'no_ground') } };
  const members = [];
  for (const m of r.members) members.push(await memberInput(exec, m, inst));
  const partyRoles = members.map((m) => m._role).filter(Boolean);
  for (const m of members) {
    m.hero = heroSetup({ weaponType: m._weaponType, options: m._options, bar: m._bar, partyRoles, leaveTogether: m._leaveTogether, lead: m._leads, hold: m._hold });
    if (!m.hero) return { answer: { outcome: 'refused', reason: 'no_role', ...refusal(409, 'no_role') } };
  }
  /* Below the floor a player door that asked for the live view gets the instance's start point
     instead of a settle: nothing is priced or written. */
  if (below) {
    return { answer: { outcome: 'nothing', reason: 'below_min_span', status: 200,
      body: { ok: true, settled: false, reason: 'below_min_span', ...(await envOf()), hunt_live: huntLive(inst, members, user, slot) } } };
  }
  const endMs = Number.isFinite(Number(o.atMs)) ? Math.min(nowMs, Math.floor(Number(o.atMs))) : nowMs;
  const toMs = Math.min(endMs, fromMs + HUNT_SETTLE_SPAN_MS);
  if (!(toMs > fromMs)) return notDue();
  return { envOf, inst, members, where, fromMs, toMs, endMs, nowMs, worldMaxBytes: o.worldMaxBytes };
}

/* (2) THE PROPOSAL: the engine over [fromMs, toMs) and every member's keyed
       share. Answers { out, commit } — `commit` is commitHuntSettle's input. */
export async function proposeHuntSettle(plan, toMs, attempt, clock) {
  const { inst, members, where, fromMs } = plan;
  /* THE ENGINE, TIMED (lane/c-tick-span): accrueHunt is synchronous, so its wall is its CPU (GC included, which the
     edge's limit counts too). `clock` is the request budget's timer (engineBudget); absent, performance.now. */
  const tick = typeof clock === 'function' ? clock : perfNow;
  const t0 = tick();
  const out = accrueHunt({
    instance: { id: String(inst.id), nextSwingAtMs: Number(inst.next_swing_at_ms), world: inst.world || null,
      worldSwing: Number(inst.world_swing) || 0 },
    window: { fromMs, toMs }, secret: String(inst.secret || ''),
    ground: where.ground, grid: where.grid, items: ITEMS, monsters: MONSTERS, members,
    worldMaxBytes: plan.worldMaxBytes,
  });
  const engineMs = Math.max(0, tick() - t0);
  if (!out.accrued) return { out, commit: null, engineMs };
  const payload = [];
  for (const p of out.members) {
    const m = members.find((x) => x.key === p.key);
    payload.push({ user: m.user, slot: m.slot, session: m.sessionId, version: m.version,
      intent: await intentIdFor({ user: m.user, slot: m.slot, watermark: huntWatermarkLabel(inst, m),
        version: m.version, salt: String(inst.secret || ''), attempt: attempt || 0 }),
      delta: p.delta, hunt: p.hunt, analyzer: p.analyzer });
  }
  return { out, engineMs, commit: { instanceId: String(inst.id), worldSwingFrom: out.worldSwingFrom,
    settle: { to: new Date(out.settledTo).toISOString(), world_swing: out.worldSwingTo, world: out.world },
    members: payload } };
}

/* ONE MEMBER'S ENGINE INPUT, from the instance read. Field by field: the
   envelope spread is ./envelope.js's ONE field list. */
async function memberInput(exec, m, inst) {
  const env = m.state || {};
  const nowMs = Math.floor(Number(m.session.settled_to_ms) || 0);
  const e = engineInputsFromEnvelope(env, nowMs);
  const perks = await readTickPerks(exec, m.user, m.slot);
  /* The ROLE key of the worn set (hunt-roles.js wornRoleKey: the weapon, a magic one by its discipline, and the
     shield beside it: Tyler 2026-10-23, the SHIELD makes the tank), the same key hr_hunt_weapon_of reads; the
     combat style stays equipmentStats' weaponType in the engine. */
  const weaponType = wornRoleKey(e.equipment, ITEMS);
  const options = (m.session.options && typeof m.session.options === 'object') ? m.session.options : {};
  const pre = heroSetup({ weaponType, options, bar: m.session.bar, partyRoles: null });
  return {
    key: String(m.user) + ':' + String(m.slot),
    user: String(m.user), slot: Number(m.slot), seat: Number(m.seat) || 0,
    unitId: Number.isInteger(m.unit_id) ? m.unit_id : null,
    sessionId: String(m.session.id), version: env.version, huntId: String(inst.hunt),
    /* KICKED (hr_hunt_instance_read `kicked`, 2026-12-18-party-leave-together.sql): a member the leader removed; its end
       sends nobody home (Coordinator ruling 2026-10-23). */
    huntSession: { ...huntSessionFromRead(m.session, inst.id), kicked: m.kicked === true },
    skills: e.skills, levelXp: e.levelXp, xpFrac: e.xpFrac, hp: e.hp, gold: e.gold,
    equipment: e.equipment, inventory: e.inventory, buffs: e.buffs,
    deathsTodayBefore: e.deathsTodayBefore, deathsLifetimeBefore: e.deathsLifetimeBefore,
    hearthfindReady: e.hearthfindReady, perks,
    /* THE ACCOUNT BESTIARY's relic multipliers, from this member's OWN hr_state_of
       (account_bestiary.relic_mult: { monster kind: mult }), never from the request */
    relicMults: env.account_bestiary && typeof env.account_bestiary === 'object' && env.account_bestiary.relic_mult
      && typeof env.account_bestiary.relic_mult === 'object' ? env.account_bestiary.relic_mult : null,
    _weaponType: weaponType, _options: options, _bar: m.session.bar, _role: pre ? pre.role : null,
    /* THE PARTY LEADER (hr_hunt_instance_read `leads`, 2026-11-01-party-leader-density.sql): its density is the pull. */
    _leads: m.leads === true,
    /* WHO HOLDS THE PACK (Tyler 2026-10-22): the party's hold seat (hr_hunt_instance_read `hold_seat`, the server's
       hunt_parties.hold_seat, set by the leader's hr_party_hold_set); null = the tanks take turns. */
    _hold: Number.isInteger(inst.hold_seat) ? inst.hold_seat : null,
    /* LEAVE TOGETHER (Tyler 2026-10-22): this member's own "Leave if anyone leaves the hunt or dies" (hr_hunt_instance_read
       `leave_together`, the server's player_state.party_leave_together). A read without it (an older server) is off. */
    _leaveTogether: m.leave_together === true,
  };
}

/** The derived intent label of one member's share of an instance window: the
    instance, the world swing the window starts at, the member's session and
    the swing it starts at (with the version and the secret salt, intentIdFor). */
export function huntWatermarkLabel(inst, m) {
  return 'hunt:' + String(inst.id) + ':' + String(inst.world_swing ?? 0) + ':' + String(m.sessionId)
    + ':' + String(m.huntSession.swingIndex);
}

/* (3) THE COMMIT: one statement, hr_hunt_apply_instance. An HR000 that escaped
       its own handler is still a named refusal; anything else is a defect and
       propagates. */
export async function commitHuntSettle(exec, c) {
  try {
    const [r] = await exec(HUNT_APPLY_SQL, [c.instanceId, c.worldSwingFrom, JSON.stringify(c.settle),
      JSON.stringify(c.members), c.project ? c.project.user : null, c.project ? c.project.slot : null]);
    return r && r.res;
  } catch (e) {
    if (String((e && e.code) ?? '') !== 'HR000') throw e;
    return { ok: false, error: String((e && e.message) || 'hunt_settle_refused'), stage: 'raise' };
  }
}

/* ── THE TICK'S SELECTORS ────────────────────────────────────────────────────
   `hunts` in the driver's body: (user_id, slot, session_id) and NOTHING else is
   read — the instance, its members and their characters are re-read in this
   request. A malformed row is dropped, not refused. Null-prototype, field by
   field (parseTickBody's discipline). */
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

/* ── THE PLAYER DOOR (index.ts) ──────────────────────────────────────────────
   `hunt_settle`. The body is `{status, body}`; the envelope on a success is the
   caller's post-settle hr_state_of plus `session` (hr_hunt_view) and the
   window's timeline (./hunt-track.js huntTimeline: hunt_track, hunt_events, hunt_server_now_ms). */
export async function runHuntVerb(o) {
  const v = await settleHunt({
    exec: o.exec, user: o.user, slot: o.slot, mode: 'settle', bucket: o.bucket, project: true, live: true,
  });
  return { status: v.status, body: { ...v.body, verb: o.verb } };
}
