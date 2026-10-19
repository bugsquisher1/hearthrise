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
//       hr_state_of, the instance's keyed-seed secret), the server clock.
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
import { MONSTERS } from '../../../src/data/monsters.js';
import { roleWeaponOf } from '../../../src/data/hunt-roles.js';
import { heroSetup } from '../../../src/core/hunt-spawn.js';
import { seederFor } from './hunt-seed.js';

/* THE LIVE VIEW (option B, Tyler 2026-10-19). The browser runs the SAME instance engine
   (src/core/combat-sim.js, the member assembly src/core/member.js) for the VIEWED character,
   display only, and the server confirms. `hunt_live` is what it needs to start from the instance's
   last settled point: the stored world (and its hash), the instance clocks, every member's engine
   input and the next LIVE_SEEDS combat-swing seeds. THE DROP STREAM ('r') IS NEVER SENT: the
   browser cannot foresee loot, and shows none until a server envelope confirms it. A party
   member's purse is withheld (null); its skills, gear and bar are sent (the shared instance needs
   them; listed for the reopen Security review in docs/design/server-authority.md). Prediction
   only: nothing the browser simulates is spent or credited (CLAUDE.md §1, §6). */
export const LIVE_SEEDS = 64;
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
      return { key: m.key, seat: m.seat, unitId: m.unitId, self, huntSession: m.huntSession,
        skills: m.skills, levelXp: m.levelXp, xpFrac: m.xpFrac, hp: m.hp, gold: self ? m.gold : null,
        equipment: m.equipment, buffs: m.buffs, perks: m.perks, hero: m.hero };
    }),
  };
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
/* Refusals that mean "someone else moved the instance under us". */
const RETRYABLE = Object.freeze(['session_moved', 'version_conflict']);

/* THE READ. One statement: the gate is its first term on a player door (D3:
   a call that settles nothing still spends budget), absent on the tick's. */
export const HUNT_READ_SQL = `
  with g as (select case when $3::text is null then true
                         else public.hr_rate_gate($1::uuid, $2::int, $3::text) end as allowed)
  select g.allowed                                                                  as allowed,
         case when g.allowed then public.hr_hunt_instance_read($1::uuid, $2::int) end as inst,
         case when g.allowed then public.hr_state_of($1::uuid, $2::int) end           as state,
         now()                                                                      as now
    from g`;

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
    /* THE STORE (hr_hunt_basic_supplies) and the ids this hunt's tier resolves
       food and drink to — catalogue rows; newHuntSession keeps well-formed ones. */
    basics: (h.basics && typeof h.basics === 'object') ? h.basics : {},
    shop: (h.shop && typeof h.shop === 'object') ? h.shop : {},
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
 * @returns {{ outcome: 'paid'|'nothing'|'none'|'refused'|'limited', reason?, status, body, ended? }}
 */
export async function settleHunt(o) {
  const mode = o.mode === 'settle' ? 'settle' : 'tick';
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const v = await settleOnce(o, mode);
    if (v.outcome !== 'refused' || !RETRYABLE.includes(v.reason)) return v;
    last = v;
  }
  return last;
}

async function settleOnce(o, mode) {
  const plan = await readHuntSettle(o, mode);
  if (plan.answer) return plan.answer;
  const { user, slot } = o;
  const { env, fromMs } = plan;
  let toMs = plan.toMs;
  let degraded = 0;
  for (;;) {
    const p = await proposeHuntSettle(plan, toMs, degraded);
    if (!p.out.accrued) {
      return { outcome: 'nothing', reason: String(p.out.reason || 'nothing'), status: 200,
        body: { ok: true, settled: false, reason: String(p.out.reason || 'nothing'), ...env } };
    }
    const res = await commitHuntSettle(o.exec, { ...p.commit, project: o.project === true ? { user, slot } : null });
    if (res && res.ok === true) {
      const own = (res.members || []).find((x) => String(x.user) === String(user) && Number(x.slot) === Number(slot)) || {};
      const ended = own.hunt_settle && own.hunt_settle.ended ? String(own.hunt_settle.ended) : null;
      const replayed = res.stage === 'replayed';
      return {
        outcome: replayed ? 'nothing' : 'paid',
        reason: replayed ? 'replayed' : null,
        ended,
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
      /* ASK FOR LESS: half the window, so fewer swings and a smaller delta. The
         instance clock still only moves by what is settled; the rest is owed. */
      const half = fromMs + Math.floor((toMs - fromMs) / 2);
      if (!(half > fromMs)) return { outcome: 'refused', reason: err, ...refusal(409, err, { detail: res ?? null }) };
      toMs = half;
      degraded++;
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
       ground, no role). Answers { answer } or the plan { env, inst, members,
       where, fromMs, toMs }. */
export async function readHuntSettle(o, mode) {
  const { exec, user, slot } = o;
  const [read] = await exec(HUNT_READ_SQL, [user, slot, mode === 'tick' ? null : (o.bucket || null)]);
  if (!read || read.allowed !== true) {
    return { answer: { outcome: 'limited', reason: 'rate_limited', ...refusal(429, 'rate_limited') } };
  }
  const env = read.state;
  if (!env || env.ok !== true) {
    return { answer: { outcome: 'none', reason: 'no_character', ...refusal(409, (env && env.error) || 'no_character') } };
  }
  const r = read.inst;
  if (!r || r.open !== true) {
    return { answer: { outcome: 'none', reason: 'no_hunt', ...refusal(409, 'no_hunt', { ...env, ok: false }) } };
  }
  const mine = (r.members || []).find((m) => String(m.user) === String(user) && Number(m.slot) === Number(slot));
  if (!mine || (o.session && String(o.session) !== String(mine.session.id))) {
    /* The roster named a session that is no longer the open one. Not this fire's. */
    return { answer: { outcome: 'none', reason: 'session_changed', ...refusal(409, 'session_changed') } };
  }
  const inst = r.instance;
  /* The server clock, floored to the engine's millisecond. */
  const nowMs = Math.floor(new Date(read.now).getTime());
  const fromMs = Number(inst.settled_to_ms);
  const pending = r.members.some((m) => m.session.leave_at_ms != null || m.session.change_at_ms != null)
    || inst.enabled === false;
  const notDue = { answer: { outcome: 'nothing', reason: 'not_due', status: 200, body: { ok: true, settled: false, reason: 'not_due', ...env } } };
  if (!(nowMs > fromMs)) return notDue;
  const minMs = Number.isFinite(Number(o.minWindowMs)) ? Math.max(0, Number(o.minWindowMs))
    : (mode === 'settle' ? HUNT_SETTLE_MIN_MS : 0);
  const below = !pending && nowMs - fromMs < minMs;
  if (below && o.live !== true) {
    return { answer: { outcome: 'nothing', reason: 'below_min_span', status: 200,
      body: { ok: true, settled: false, reason: 'below_min_span', ...env } } };
  }
  const where = (o.grounds && o.grounds[inst.hunt]) || huntGroundOf(inst.hunt);
  if (!where) return { answer: { outcome: 'refused', reason: 'no_ground', ...refusal(409, 'no_ground') } };
  const members = [];
  for (const m of r.members) members.push(await memberInput(exec, m, inst));
  const partyRoles = members.map((m) => m._role).filter(Boolean);
  for (const m of members) {
    m.hero = heroSetup({ weaponType: m._weaponType, options: m._options, bar: m._bar, partyRoles });
    if (!m.hero) return { answer: { outcome: 'refused', reason: 'no_role', ...refusal(409, 'no_role') } };
  }
  /* Below the floor a player door that asked for the live view gets the instance's start point
     instead of a settle: nothing is priced or written. */
  if (below) {
    return { answer: { outcome: 'nothing', reason: 'below_min_span', status: 200,
      body: { ok: true, settled: false, reason: 'below_min_span', ...env, hunt_live: huntLive(inst, members, user, slot) } } };
  }
  const toMs = Number.isFinite(Number(o.atMs)) ? Math.min(nowMs, Math.floor(Number(o.atMs))) : nowMs;
  if (!(toMs > fromMs)) return notDue;
  return { env, inst, members, where, fromMs, toMs, nowMs };
}

/* (2) THE PROPOSAL: the engine over [fromMs, toMs) and every member's keyed
       share. Answers { out, commit } — `commit` is commitHuntSettle's input. */
export async function proposeHuntSettle(plan, toMs, attempt) {
  const { inst, members, where, fromMs } = plan;
  const out = accrueHunt({
    instance: { id: String(inst.id), nextSwingAtMs: Number(inst.next_swing_at_ms), world: inst.world || null },
    window: { fromMs, toMs }, secret: String(inst.secret || ''),
    ground: where.ground, grid: where.grid, items: ITEMS, monsters: MONSTERS, members,
  });
  if (!out.accrued) return { out, commit: null };
  const payload = [];
  for (const p of out.members) {
    const m = members.find((x) => x.key === p.key);
    payload.push({ user: m.user, slot: m.slot, session: m.sessionId, version: m.version,
      intent: await intentIdFor({ user: m.user, slot: m.slot, watermark: huntWatermarkLabel(inst, m),
        version: m.version, salt: String(inst.secret || ''), attempt: attempt || 0 }),
      delta: p.delta, hunt: p.hunt, analyzer: p.analyzer });
  }
  return { out, commit: { instanceId: String(inst.id), worldSwingFrom: out.worldSwingFrom,
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
  /* The ROLE key (hunt-roles.js roleWeaponOf: a magic weapon by its discipline), the same key
     hr_hunt_weapons holds; the combat style stays equipmentStats' weaponType in the engine. */
  const weaponType = roleWeaponOf(ITEMS[(e.equipment || {}).weapon]) || 'neutral';
  const options = (m.session.options && typeof m.session.options === 'object') ? m.session.options : {};
  const pre = heroSetup({ weaponType, options, bar: m.session.bar, partyRoles: null });
  return {
    key: String(m.user) + ':' + String(m.slot),
    user: String(m.user), slot: Number(m.slot), seat: Number(m.seat) || 0,
    unitId: Number.isInteger(m.unit_id) ? m.unit_id : null,
    sessionId: String(m.session.id), version: env.version, huntId: String(inst.hunt),
    huntSession: huntSessionFromRead(m.session, inst.id),
    skills: e.skills, levelXp: e.levelXp, xpFrac: e.xpFrac, hp: e.hp, gold: e.gold,
    equipment: e.equipment, inventory: e.inventory, buffs: e.buffs,
    deathsTodayBefore: e.deathsTodayBefore, deathsLifetimeBefore: e.deathsLifetimeBefore,
    hearthfindReady: e.hearthfindReady, perks,
    _weaponType: weaponType, _options: options, _bar: m.session.bar, _role: pre ? pre.role : null,
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
