// ============================================================================
// supabase/functions/hr-accrue/tick-party.js — THE PARTY UNIT, IN THE DRIVER.
//
// M8 slice S2 (docs/planning/WORLD_TICK_DESIGN.md §18.2.4, §18.2.5, §18.5's S2
// Edge cell). *"A party is a ROSTER UNIT, not a new engine, not a new channel
// and not a new authority — the tick settles four characters in one fenced call
// instead of four, and the split is arithmetic the settle does under the row
// locks it already holds."*
//
// So this file contains NO combat code. It runs `settleCombatSession` — the
// same bytes `tickOne` runs for a solo character — once per member, asks
// `src/core/party-split.js` for the two share vectors, attaches each member's
// attribution to their own delta as ONE nested journal key, and emits ONE
// `hr_party_tick_settle` call for the whole window. `AWAY-12` forbids a second
// combat path and there is not one here.
//
// ── WHAT COMES FROM THE BODY, AND WHY THAT IS SAFE ─────────────────────────
// `tickOne` reads EVERYTHING from the database in its own request and uses the
// body only as a selector. A party cannot do all of that, and the reason is a
// grant rather than an oversight: `hr_party_roster` is executable by `hr_tick`
// and BY NOTHING ELSE (§18.2.2), and this function runs as `hr_engine`. The
// party's own scheduling fields therefore travel in the POST body, exactly as
// the per-character roster rows do today.
//
// The split is stated field by field rather than left to be discovered:
//
//   FROM THE BODY (SELECTORS ONLY)    party id · hunt id · active id · stance ·
//                                     the member (user, slot) pairs
//   FROM THE FENCE'S OWN REFUSAL      the TRUE party watermark, its verbatim
//                                     server rendering, the MODE, and the
//                                     per-member continuation carrier —
//                                     `probeParty` below, which is the solo
//                                     `probeWatermark` at party grain
//   RE-DERIVED HERE, PER MEMBER       the whole `hr_state_of` envelope, the
//                                     `version` hr_apply refuses a stale copy
//                                     of, the absence cap, and the window seed
//   RE-CHECKED BY THE FENCE AGAIN     the lease and the holder, the party lock,
//                                     the CAS against the TRUE watermark,
//                                     invariant 8 per member, each version
//                                     against `player_state`, the live member
//                                     set re-counted under the lock, and
//                                     `delta.accrued_to = p_window_to`
//
// SO NOT ONE NUMBER THE ENGINE COMPUTES FROM COMES OUT OF THE REQUEST. A forged
// body can name a party and nothing else: the watermark, the mode and the
// carrier are read back out of a refusal taken under the fence's own row locks,
// and every member's state is read from `hr_state_of` in this request. That
// matters more here than on the solo path, because a tick host that could edit
// its own payload would otherwise be handing the engine any hp, any recovery
// clock and any bag it liked for FOUR characters at once — and the measurement
// this milestone gates ARMING on is one a caller must not be able to author.
//
// ── THE OPEN SEAM, NAMED RATHER THAN LEFT TO BE FOUND ──────────────────────
// Nothing posts `body.parties` yet. `hr_tick_cron_run` builds its POST from
// `hr_tick_roster` alone, and teaching it the party cohort — with its limit
// counted in CHARACTERS (I-3) — is §18.5's S5 row, not S2's. It is also
// unreachable before S4 in any case: `hr_party_hunt_start` is S4's, so there is
// no live `party_hunt` for `hr_party_roster` to return. This file freezes the
// body key and the unit shape so that wiring is additive when it comes.
//
// PURE ESM, Node + Deno, so a Node test drives the bytes that deploy. No `?v=`
// (not under src/**).
// ============================================================================

import { createHash } from 'node:crypto';

import {
  CHANNEL as COMBAT_CHANNEL,
  sessionFromRoster as combatSessionFromRoster,
  settleCombatSession,
} from './tick-combat.js';
import { shadowStateOf, applyShadowState, SHADOW_STATE_V } from './tick-contract.js';
/* THE SPLIT, AND IT IS S3's FILE, IMPORTED — never re-implemented here. One
   pure function, dual-runtime, the same code in the live tick and the away
   replay (`AWAY-12`). Nothing in this file names a share, a weight or a
   recipient; it hands the engine's own per-member numbers to `splitParty` and
   journals what comes back. */
import { splitParty, partyJournal, PARTY_MAX, PARTY_JOURNAL_KEYS } from '../../../src/core/party-split.js';

/** §18.2.1a: a party settle writes ordinary `channel = 'combat'` rows. `party`
    is a unit of SCHEDULING, not a kind of work, and neither CHECK widens. */
export const PARTY_CHANNEL = COMBAT_CHANNEL;

/** Blast radius per fire, in PARTIES. The character-grained limit is the
    database's (`hr_party_roster` admits parties until the running sum of their
    live member counts reaches `batch_limit`, I-3); this is the body ceiling. */
export const MAX_PARTIES = 128;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ── THE WINDOW KEY, DERIVED AND NEVER SUPPLIED (§18.3) ─────────────────────
   `uuid_v5(party_id, window_from||window_to)`. A retried party settle is the
   same operation however many times the tick asks — the accrue verb's rule at
   party grain. It needs no `hr_seed` salt, and that is an argument rather than
   an omission: the accrue key is salted because `hr_load` returns `accrued_to`
   to the client, which makes an unsalted key COMPUTABLE BY THE PLAYER. Nothing
   in the party window key is client-supplied and `hr_party_tick_settle` is
   executable by `hr_engine` and nothing else, so there is no caller who could
   present a guessed key.

   ONE key spans 2..4 members without collision because
   `hr_tick_shadow_intent_uidx` is unique on (user_id, slot, intent_id) — and
   `hr_apply`'s own idempotency is keyed the same way. */
export function partyIntentId(partyId, windowFromMs, windowToMs) {
  const label = `party:${String(partyId).toLowerCase()}`
    + `:${Math.floor(Number(windowFromMs) || 0)}:${Math.floor(Number(windowToMs) || 0)}`;
  const h = createHash('sha1').update('hearthrise:world-tick:v1\n' + label).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;                 // version 5
  b[8] = (b[8] & 0x3f) | 0x80;                 // RFC 4122 variant
  const s = b.toString('hex');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/* ── THE PARTY UNITS IN A BODY ──────────────────────────────────────────────
   A malformed unit is DROPPED, not refused — one bad party must not cost the
   other 127 their window, which is `parseSelectors`' own rule. */
export function parseParties(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  const seen = new Set();
  for (const row of raw) {
    if (out.length >= MAX_PARTIES) break;
    const unit = parsePartyUnit(row);
    if (!unit) continue;
    if (seen.has(unit.partyId)) continue;      // a duplicated unit is one party
    seen.add(unit.partyId);
    out.push(unit);
  }
  return out;
}

/** One `hr_party_roster` row, validated into the shape this driver uses. */
export function parsePartyUnit(row) {
  if (!row || typeof row !== 'object') return null;
  const partyId = typeof row.party_id === 'string' && UUID_RE.test(row.party_id)
    ? row.party_id.toLowerCase() : null;
  const huntId = typeof row.hunt_id === 'string' && UUID_RE.test(row.hunt_id)
    ? row.hunt_id.toLowerCase() : null;
  if (partyId === null || huntId === null) return null;
  const markMs = Date.parse(row.accrued_to);
  if (!Number.isFinite(markMs)) return null;
  const activeId = typeof row.active_id === 'string' && row.active_id ? row.active_id : null;
  if (activeId === null) return null;
  const members = [];
  const seen = new Set();
  for (const m of Array.isArray(row.members) ? row.members : []) {
    if (!m || typeof m !== 'object') continue;
    const userId = typeof m.user_id === 'string' && UUID_RE.test(m.user_id)
      ? m.user_id.toLowerCase() : null;
    const slot = Number.isInteger(m.slot) && m.slot >= 0 && m.slot < 100 ? m.slot : null;
    if (userId === null || slot === null) continue;
    const key = `${userId}:${slot}`;
    if (seen.has(key)) continue;
    seen.add(key);
    members.push({ userId, slot });
  }
  /* A party the fence would refuse is dropped HERE rather than settled and
     refused: the settle re-counts the live membership under the lock and
     answers `party_window_already_settled` for a set that is not exactly it,
     so a unit of 0 or of 5 cannot produce anything but a wasted round trip. */
  if (members.length < 1 || members.length > PARTY_MAX) return null;
  /* Ordered, once, here: the settle takes its member row locks in
     (user_id, slot) order and the split's remainder rule reads the same order.
     Sorting in one place is what keeps the two from ever disagreeing. */
  members.sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1
    : a.slot - b.slot));
  const unit = Object.create(null);
  unit.partyId = partyId;
  unit.huntId = huntId;
  unit.activeId = activeId;
  unit.stance = typeof row.stance === 'string' ? row.stance : 'steady';
  /* ⚠ `accrued_to`, `shadow_accrued_to` and `shadow_state` ARE PRESENT IN THE
     ROSTER ROW AND ARE DELIBERATELY NOT READ. They are re-derived from the
     fence's own refusal by `probeParty` below, under the party lock, in this
     role's own transaction. `accrued_to` is parsed above only to DROP a unit
     whose row is malformed — the value is thrown away. */
  unit.members = members;
  return unit;
}

/* ── THE CONTRIBUTION SEAM — ONE FUNCTION, AND S3 OWNS ITS FIRST BRANCH ─────
   §18.1: *"Contribution-weighted by damage dealt."* §18.5's S3 Edge cell names
   the other half of that sentence as S3's: *"`computeAccrual` returns
   per-member damage."* `src/core/party-split.js` has landed; the engine's
   damage counter has NOT, and this is the one place that difference is visible.

   ⚠ TODO(M8 S3): when the engine files its own per-window damage total, the
     first branch below reads it and this comment goes away. That is the whole
     of the wiring — the split, the journal and the fence are already built on
     `damage` and need no change.

   UNTIL THEN the fallback is `survivedMs`: the engine's OWN count of the
   milliseconds this member actually FOUGHT in the window. It is not arithmetic
   of ours (it is read where the simulation put it), it has the right shape (a
   knocked-out member's is smaller, a parked member's is smaller, a member who
   fought the whole window gets the whole window), and it is the SAME quantity
   S-10 already prices Vigour from (`fight_ms`).

   ⚠ AND THE COST IS STATED RATHER THAN DISCOVERED: a fight-time weighting is
     not a damage weighting, so the `dmg_bp` and `xp_bp` a shadow window
     journals under the fallback are NOT the vectors an armed window would pay.
     Nothing is paid from them (S2 is shadow-only and the settle's armed branch
     is behind an operator `update`), and §18-SEC.2's 8c-ii reads that BOTH
     vectors sum to exactly 10,000 bp, which holds either way. What does NOT
     hold is the SPLIT half of the 48 h pre-arm parity read: it measures the
     fallback until S3's counter lands. Named here, and named again in the
     lane report, because a parity number that silently measures the wrong
     quantity is the exact failure §16.3 records. */
export function memberContribution(run) {
  const results = Array.isArray(run && run.results) ? run.results : [];
  let damage = 0;
  let knockedOut = false;
  let vigourDry = false;
  let engineDamage = null;
  for (const r of results) {
    const s = (r && r.summary) || {};
    /* S3's half, when it lands. `?? null` and not `|| 0`: a genuine zero from
       the engine must not read as "the engine does not count this yet". */
    if (s.damage !== undefined && s.damage !== null) {
      engineDamage = (engineDamage || 0) + Math.max(0, Math.floor(Number(s.damage) || 0));
    }
    damage += Math.max(0, Math.floor(Number(s.survivedMs) || 0));
    if (s.died === true) knockedOut = true;
    /* `dryMs !== null` and NEVER `if (dryMs)`: null means "it never ran out"
       and ZERO means "it ran out at the very end" — src/core/hunt.js's own
       note, and the two are different facts. */
    if (s.dryMs !== undefined && s.dryMs !== null && Number(s.dryMs) > 0) vigourDry = true;
  }
  return {
    damage: engineDamage === null ? damage : engineDamage,
    fromEngineDamage: engineDamage !== null,
    knockedOut,
    vigourDry,
  };
}

/* ── ONE PARTY, ONE FIRE ────────────────────────────────────────────────────
   Returns a verdict, never a throw: a party that cannot be settled must not
   cost the rest of the cohort its window. ALL-OR-NOTHING at this level too —
   if any member cannot produce an intent for the window, the whole party is
   skipped and NOTHING is sent, because a settle built from three of four
   members is the partial settle §18.2.5 step 5 calls a mint, and the fence
   would refuse it anyway. */
export async function settleParty(exec, holder, unit, body, deps) {
  const d = deps || {};
  const settle = d.settle || settleCombatSession;
  const sessionOf = d.sessionFromRoster || combatSessionFromRoster;
  const seedsFor = d.seedLadder || null;
  const fence = d.fence || partyFence;

  const [clock] = await exec('select now()::timestamptz as now', []);
  /* THE DRIVER HANDS BACK A `Date`, NOT A STRING (T-1): `String(...)` spells
     `Mon Sep 21 2026 …`, which Postgres answers 22P02 on. */
  const nowIso = new Date(clock.now).toISOString();
  const nowMs = new Date(clock.now).getTime();

  /* THE PROBE. One call that writes nothing and answers "do I hold this party,
     from when, in which mode, and what did my last window leave behind". */
  const probe = await (d.probe || probeParty)(exec, holder, unit, nowIso);
  if (!probe.ok) return { outcome: 'skipped', reason: probe.reason };
  const markMs = probe.markMs;

  /* THE WINDOW. ONE GEOMETRY FOR THE WHOLE PARTY, computed once — §18.2.4:
     *"a party window is [party_hunt.accrued_to, t] for every member, one
     geometry, computed once."* It ENDS at one flush period past the mark or at
     the server clock, whichever is sooner. */
  const toMs = Math.min(nowMs, markMs + body.flushMs);
  if (toMs - markMs < body.flushMs) {
    /* BELOW THE FLUSH LINE. Waiting costs nothing: the mark stays put. */
    return { outcome: 'skipped', reason: 'below_flush' };
  }

  const runs = [];
  for (const m of unit.members) {
    /* THE STATE, FROM THE DATABASE, IN THIS REQUEST. Not one field of it comes
       from the body: `hr_state_of` is the same projection the player's own
       envelope is built from, and `version` is the number hr_apply refuses a
       stale copy of. This is what keeps a forged body from forging a member. */
    const [row] = await exec(
      'select public.hr_state_of($1::uuid, $2::int) as state,'
      + ' public.hr_offline_cap_ms($1::uuid, $2::int) as cap_ms',
      [m.userId, m.slot]);
    const env = row && row.state;
    if (!env || env.ok !== true) return { outcome: 'skipped', reason: 'member_no_character' };
    const st = env.state || {};
    /* The character must still be on the channel the party is hunting on. The
       fence re-checks this under the lock; checking here saves the round trip
       and keeps the reason NAMED rather than collapsed into `channel_moved`. */
    if (st.active_kind !== PARTY_CHANNEL) {
      return { outcome: 'skipped', reason: 'member_channel_moved' };
    }
    const session0 = sessionOf({
      user_id: m.userId,
      slot: m.slot,
      shard: 0,
      active_kind: PARTY_CHANNEL,
      active_id: unit.activeId,       // THE PARTY's monster, not the member's
      active_since: st.active_since,
      accrued_to: new Date(markMs).toISOString(),
      /* The SERVER's own rendering of the party watermark. `rosterWatermarkText`
         checks the candidates it is given against `markMs` before accepting
         one, and in SHADOW the party mark is a DIFFERENT instant from the
         member's `state.accrued_to` — so without this the seed label could not
         be spelled at all (Security T-2/S-8). */
      mark_text: probe.markText,
      version: env.version,
      cap_ms: row.cap_ms,
    }, env);

    /* THE OVERLAY, PER MEMBER (RE-VERIFY 5 at party grain). The session is
       built from `hr_state_of` field by field, exactly as above; this lays that
       member's own shadow proposals over it. `applyShadowState` drops the
       overlay if `player_state.version` has moved since it was built, so any
       real write to that character ends the chain instead of being papered
       over. It is a DISPLAY of the shadow's own proposals and never authority:
       every number it touches ends up in `hr_tick_shadow`, which nothing reads
       to decide a number a player can spend. */
    const carried = probe.shadowState ? probe.shadowState[`${m.userId}:${m.slot}`] : null;
    const chaining = probe.shadow === true && !!carried
      && markMs > (st.accrued_to ? Date.parse(st.accrued_to) : markMs);
    const session = chaining ? applyShadowState(session0, carried) : session0;

    const geom = {
      cadenceMs: body.cadenceMs,
      flushMs: body.flushMs,
      maxPolls: d.maxPolls || 64,
      holder,
    };
    const seeds = seedsFor ? await seedsFor(exec, m, session, markMs, toMs, geom) : null;
    const run = settle(session, markMs, toMs, Object.assign({}, geom,
      { seedOf: (ms) => (seeds && seeds.has(ms) ? seeds.get(ms) : null) }));
    if (!run.intents.length) return { outcome: 'skipped', reason: 'nothing_settled' };
    const intent = run.intents[0];
    if (intent.rehydrateBefore) return { outcome: 'skipped', reason: 'rehydrate_required' };
    if (Date.parse(intent.args.p_window_to) !== toMs) {
      /* The engine settled to a different instant than the party window ends
         at. One geometry for the whole party is the invariant; a member whose
         own settle disagreed with it cannot be folded into this call. */
      return { outcome: 'skipped', reason: 'member_window_mismatch' };
    }
    runs.push({ m, env, run, intent, chaining });
  }

  /* ── THE SPLIT. S3's pure function, over the engine's own per-member
     numbers. Nothing here names a share, a weight or a recipient — that is the
     whole of §18.4 T-5, and a forged client value has nothing to forge because
     no client value reaches this line. */
  const contributions = runs.map((r) => memberContribution(r.run));
  const split = splitParty({
    partyId: unit.partyId,
    huntId: unit.huntId,
    members: runs.map((r, i) => ({
      user: r.m.userId,
      slot: r.m.slot,
      damage: contributions[i].damage,
      knockedOut: contributions[i].knockedOut,
      vigourDry: contributions[i].vigourDry,
    })),
    /* THE LOTTERY ROLL, ONE PER WINDOW, from the window's own key rather than
       from a clock or a counter — so the assignment replays from the ledger
       exactly (§18.4 T-1, `meta.party.roll`). */
    roll: rollFromIntent(partyIntentId(unit.partyId, markMs, toMs)),
  });

  const intentId = partyIntentId(unit.partyId, markMs, toMs);
  const members = runs.map((r, i) => {
    const a = r.intent.args;
    /* ★ ATTRIBUTION IS JOURNAL, NEVER DELTA (S-1). The delta is the one the
       engine folded — key-for-key a solo combat settle's — and the party rides
       inside `journal.meta` as ONE nested key of exactly
       PARTY_JOURNAL_KEYS (B-A5). `hr_apply` merges `journal.meta` at the TOP of
       `player_ledger.meta`, so the party read is `meta->'party'`. */
    const delta = Object.assign({}, a.p_delta);
    const journal = Object.assign({}, delta.journal);
    journal.meta = Object.assign({}, journal.meta, { party: partyJournal(split, i) });
    delta.journal = journal;
    /* IT IS SENT ONLY WHEN THE MEMBER'S STATE IS THE STATE AT EXACTLY THE
       INSTANT BEING SETTLED, and only in SHADOW — the armed branch refuses a
       non-null carrier by design, so sending one there is an outage with a
       security-shaped name. `atMark` cannot be false here (a member whose
       engine settled past the party window was dropped above), and it is
       asserted rather than assumed. */
    const atMark = r.run.watermarkMs === Date.parse(a.p_window_to);
    const carry = (probe.shadow === true && atMark)
      ? shadowStateOf(r.run.char, { baseVersion: r.env.version, atMs: r.run.watermarkMs })
      : null;
    return {
      user: r.m.userId,
      slot: r.m.slot,
      version: a.p_version,
      delta,
      /* ANYTHING THAT OVERLAID MUST SEND A CARRIER (RE-VERIFY 5 S-1, at party
         grain). `shadowStateOf` returns null BY DESIGN when its bound breaks,
         so a member that chained but has nothing to carry would otherwise hand
         the fence a NULL tenth value — and the armed branch's refusal keys on a
         NON-NULL one. The restart marker names no field, so the next overlay
         applies nothing and re-seeds from `hr_state_of` (the same restart a
         null already meant), while the armed branch still refuses before
         hr_apply. */
      shadow_state: carry
        || ((probe.shadow === true && r.chaining)
              ? { v: SHADOW_STATE_V, base_version: r.env.version, restart: true } : null),
    };
  });

  const res = await fence(exec, {
    holder,
    party: unit.partyId,
    windowFrom: new Date(markMs).toISOString(),
    windowTo: new Date(toMs).toISOString(),
    intentId,
    members,
  });
  if (!res || res.ok !== true) {
    return { outcome: 'refused', reason: String((res && res.error) || 'no_answer') };
  }
  /* THE MODE IS THE FENCE'S, NEVER THE BODY'S. `hr_tick_config.shadow` is read
     inside the fence, and this is what it decided. */
  return {
    outcome: res.mode === 'shadow' ? 'shadowed' : 'processed',
    members: members.length,
  };
}

/* ── THE PROBE — `probeWatermark` AT PARTY GRAIN ────────────────────────────
   A deliberately stale window and a minimal delta per member. The fence takes
   the party lock and the lease lock, computes the mark, and refuses on
   arithmetic — carrying the mark, its own verbatim rendering of it, the MODE
   and the per-member carrier. NOTHING IS WRITTEN.

   The epoch is the honest spelling of "certainly already settled" and cannot be
   confused with a real window by a reader. */
export async function probeParty(exec, holder, unit, nowIso) {
  const res = await partyFence(exec, {
    holder,
    party: unit.partyId,
    windowFrom: '1970-01-01T00:00:00.000Z',
    windowTo: nowIso,
    intentId: '00000000-0000-0000-0000-000000000000',
    members: unit.members.map((m) => ({
      user: m.userId, slot: m.slot, delta: { accrued_to: nowIso },
    })),
  });
  const err = res && res.error;
  if (err !== 'party_window_already_settled') {
    /* Everything else is a refusal WITH A NAME — `no_party_hunt`, `no_lease`,
       `not_tick_owned`, `tick_disabled` — and the name is what the summary
       counts. Collapsing them is how M3's S-8 stayed invisible for a week. */
    return { ok: false, reason: String(err || 'no_answer') };
  }
  const mark = res.accrued_to ? Date.parse(String(res.accrued_to)) : NaN;
  if (!Number.isFinite(mark)) return { ok: false, reason: 'unreadable_watermark' };
  /* THE VERBATIM SPELLING TRAVELS WITH THE MILLISECONDS (T-2). `accrued_to`
     arrives as the fence's own jsonb rendering of the mark — microseconds and
     `+00:00` included — and that string IS the per-window PRNG label the accrue
     path names. `Date.parse` truncates it to ms, which is the right number for
     the window arithmetic and the wrong text for the label, so both are kept
     and neither is re-derived from the other. */
  return {
    ok: true,
    markMs: mark,
    markText: String(res.accrued_to),
    /* NEVER THE BODY'S. The driver must know the mode BEFORE it settles,
       because sending a carrier on the armed branch is a refusal by design. If
       an operator arms between this probe and the settle below, that one settle
       is refused `shadow_state_while_armed`, loudly and countably, and the next
       fire runs armed with no carrier. */
    shadow: res.shadow === true,
    shadowState: (res.shadow_state && typeof res.shadow_state === 'object'
      && !Array.isArray(res.shadow_state)) ? res.shadow_state : null,
  };
}

/** `hr_party_tick_settle`, the ONLY writer this path can reach. */
export async function partyFence(exec, args) {
  const [r] = await exec(
    'select public.hr_party_tick_settle($1::text, $2::uuid, $3::timestamptz,'
    + ' $4::timestamptz, $5::uuid, $6::text::jsonb) as res',
    [args.holder, args.party, args.windowFrom, args.windowTo, args.intentId,
      JSON.stringify(args.members)]);
  return (r && r.res) || null;
}

/* The window's lottery roll, folded out of the derived window key so it is a
   function of (party, window) alone — replayable from the ledger, and not
   anything a caller chooses. */
export function rollFromIntent(intentId) {
  const hex = String(intentId).replace(/-/g, '').slice(0, 8);
  return parseInt(hex, 16) % 10000;
}

/* Re-exported so a guard can assert the journal key set against ONE definition
   rather than against a copy of it. */
export { PARTY_JOURNAL_KEYS };
