// ============================================================================
// supabase/functions/hr-accrue/set-activity.js — THE FIRST PLAYER INTENT.
//
// "I am now fighting goblins." / "I stopped."
//
// Read ./intents.js first — it is the contract, and this file is its first
// implementation. Eight more copy this shape.
//
// ── WHY THIS IS AN EDGE FUNCTION AND NOT A DATABASE FUNCTION ────────────────
// Because it must COLLECT BEFORE IT SWITCHES (intents.js rule 3), and
// collecting is the game's rules: `computeAccrual` runs the same
// `src/core/combat-sim.js simulateSpan` the live 2.4s tick runs, over the same
// `src/data/monsters.js`. Re-expressing that in PL/pgSQL is the second copy of
// the game this whole program exists to prevent. The DECLARATION is then
// re-validated in Postgres against the generated `hr_activities` catalogue, and
// applied in ONE transaction by `hr_apply`. Edge decides what should happen;
// Postgres decides whether it may.
//
// ── WHY IT IS A .js MODULE AND NOT A BRANCH IN index.ts ─────────────────────
// index.ts is Deno TypeScript and CANNOT BE IMPORTED BY NODE, so anything
// written there can only ever be tested by a regex over its source — which is
// the "assertion that asserts nothing" family this repo has been bitten by
// fifteen times. Everything here is pure ESM behind one injected seam (`exec`),
// so `tests/activity-intent.mjs` drives THE SAME BYTES that deploy, against a
// real PostgreSQL. The only thing the test cannot exercise is the pooler,
// `set local role hr_engine` and the JWT — and those are named, not implied.
//
// ── THE SEAM ────────────────────────────────────────────────────────────────
//   exec(text, params) -> Promise<rows[]>
// One statement, run in its own transaction as `hr_engine`. index.ts implements
// it with `sql.begin(tx => { set local role hr_engine; tx.unsafe(...) })`; the
// test implements it with PGlite's `query`. Every statement here is a single
// `select`, which is exactly what transaction-mode pooling requires
// (design §2a-ii, HARD RULE) — no multi-statement transaction is opened and no
// session state is relied upon between calls.
//
// ⚠ THIS FILE WRITES NO TABLE. It contains no INSERT, UPDATE or DELETE, and it
//   could not use one: the connection is `hr_engine`, which holds ZERO table
//   privileges across every schema. The whole capability is "propose a delta to
//   a function that re-validates every invariant".
// ============================================================================

import { computeAccrual, PAYABLE_KINDS, ACCRUE_MIN_MS } from './accrual.js';
import {
  collectGate, classifySkip, intentNameFor, intentIdFor, INTENT_ERRORS,
  rateBucketFor, requiresKey, collectsFirst, catalogueHas,
} from './intents.js';
import { refusalBody } from './envelope.js';
import { GATHER_NODES } from './catalogue.js';
import { ITEMS } from '../../../src/data/items.js';
import { MONSTERS } from '../../../src/data/monsters.js';

/* ── THE INTENT'S ALLOWLIST — DERIVED FROM THE PAYER, NEVER RESTATED ────────
   `hr_activities` holds 344 rows across three kinds; this intent accepts the
   kinds the accrual engine can actually PAY, plus `idle`. See the block above
   PAYABLE_KINDS in accrual.js for why a wider allowlist would create an
   under-payment with the very rule that closed the over-payment.

   Deriving it (rather than typing `['idle','combat']`) is the load-bearing
   part: when gathering accrual lands, `PAYABLE_KINDS` grows and this grows with
   it, in one edit, with no second list to remember. */
export const SETTABLE_KINDS = Object.freeze(['idle', ...PAYABLE_KINDS]);

/** The verb's own name, used to build `journal.intent`. */
export const VERB = 'set_activity';

/**
 * Validate the DECLARATION. Pure — no database, no clock.
 *
 * Order matters and is deliberate: an unpayable-but-real kind must be refused
 * by NAME (`activity_unsupported`) before the pairing rule can mislabel it as
 * malformed. A player told "bad request" when the truth is "fishing is not
 * server-side yet" files a bug against the wrong system.
 *
 * @param a  the parsed `{kind, id}` from request.js, or null
 * @returns  { ok:true, kind, id } | { ok:false, error, detail }
 */
export function validateDeclaration(a) {
  if (!a || typeof a !== 'object') {
    return { ok: false, error: INTENT_ERRORS.BAD_ACTIVITY, detail: { why: 'no activity declaration' } };
  }
  const kind = a.kind;
  const id = a.id;

  /* `kind` is null when request.js could not match it against the catalogue's
     vocabulary at all — a string that is not one of the four. */
  if (kind === null || kind === undefined) {
    return { ok: false, error: INTENT_ERRORS.BAD_ACTIVITY, detail: { why: 'unknown activity kind' } };
  }
  if (!SETTABLE_KINDS.includes(kind)) {
    return {
      ok: false,
      error: INTENT_ERRORS.ACTIVITY_UNSUPPORTED,
      detail: { kind, settable: SETTABLE_KINDS },
    };
  }
  /* The (kind ⇔ id) invariant. It is also a CHECK on player_state and it is
     re-asserted by hr_apply, which is the authority; answering it here turns an
     opaque 23514 into a named refusal one round trip earlier.
     NOTE a malformed id (uppercase, punctuation, > 64 chars) arrives here as
     null and is therefore reported as `bad_activity`, not `unknown_activity` —
     correct, because it is not a catalogue lookup that failed, it is a string
     that could never have been one. */
  if ((kind === 'idle') !== (id === null || id === undefined)) {
    return {
      ok: false,
      error: INTENT_ERRORS.BAD_ACTIVITY,
      detail: { why: kind === 'idle' ? 'idle takes no id' : 'this kind requires an id' },
    };
  }
  return { ok: true, kind, id: kind === 'idle' ? null : id };
}

/**
 * The delta. `restart: true` is NOT optional and NOT cosmetic.
 *
 * `active_since` is the second watermark — it clamps a grant to "no more time
 * than the activity has actually existed", which is the only defence against an
 * intent that forgets `accrued_to`. It is stamped by hr_apply from now(), and
 * ONLY on `restart:true`; without it the pointer moves while the clock keeps
 * pointing at the previous activity's start, and accrual.js's fail-closed
 * precondition would then refuse to pay a brand-new character at all.
 */
export function activityDelta(kind, id, from) {
  return {
    activity: { kind, id: kind === 'idle' ? null : id, restart: true },
    journal: {
      /* `admin`, not the activity's own kind. A declaration MOVES NO VALUE, and
         `player_ledger.kind` is what the rollup aggregates on — a transition
         filed under `combat` would sit in the same bucket as the gold and XP a
         night of fighting actually paid. The `intent` column carries the whole
         truth ('set_activity:combat:goblin'), and mapping four activity kinds
         onto the ledger's thirteen would be a second table to keep in step. */
      kind: 'admin',
      intent: intentNameFor(VERB, kind, id),
      /* Small, and genuinely useful: it records the TRANSITION, which no other
         row does. The window that was paid on the way here has its own ledger
         row with its own `ms`, so nothing is duplicated. */
      meta: { from_kind: (from && from.kind) || null, from_id: (from && from.id) || null },
    },
  };
}

/* ── The one statement that opens the call ──────────────────────────────────
   THE GATE IS FIRST AND THE READ IS CONDITIONAL ON IT (review D3). `case when`
   short-circuits, so a rate-limited caller pays for a boolean and not for a
   full hr_state_of (player_state + fifteen skills + the whole inventory + every
   farm plot + up to 1,000 progress rows). One round trip, not two: at
   max_connections = 60 the cost of a round trip is not latency, it is the
   §2a-ii total outage.

   ⚠ THE BUCKET IS A BIND PARAMETER READ OUT OF `INTENT_REGISTRY`, not a literal.
     It was a literal, and the registry row that named it was read by nothing —
     so intent #2 could have declared one bucket and spent another with every
     guard green. `$3` makes the registry the only source, and it is a parameter
     rather than an interpolation because a bucket name is data. An unknown
     bucket fails closed inside hr_rate_gate, so a wrong row here is a 429, not a
     new unlimited namespace. */
const READ_SQL = `
  with g as (select public.hr_rate_gate($1::uuid, $2::int, $3::text) as allowed)
  select g.allowed                                                          as allowed,
         case when g.allowed then public.hr_state_of($1::uuid, $2::int) end  as state,
         case when g.allowed then public.hr_offline_cap_ms($1::uuid, $2::int) end as cap_ms,
         now()                                                              as now
    from g`;

/* THE REFUSAL ENVELOPE (review C2) MOVED TO ./envelope.js in b349, unchanged in
   behaviour and shared with the second intent. One implementation of "a refusal
   that reached the database says what the server's state IS", because eight
   private copies of that rule is eight chances for the eighth to forget — and
   forgetting does not fail, it just leaves one client path guessing, which is
   the one thing a client is never allowed to do. */

const SEED_SQL = `
  select (public.hr_seed($1::uuid, $2::int, $3::text) & 4294967295)::bigint as seed,
         public.hr_seed($1::uuid, $2::int, $4::text)::text                  as salt,
         public.hr_perks_of($1::uuid, $2::int)                              as perks`;

/* The same read WITHOUT the perk channel, for a database that predates it.
   A missing COLUMN reads as null; a missing FUNCTION is a hard 42883 that
   aborts the statement, so the "safe in either order" property the tool_carry
   column has by construction has to be restored by hand here — by catching
   42883 AND ONLY 42883 and retrying. Mirrors index.ts. */
const SEED_SQL_NO_PERKS = `
  select (public.hr_seed($1::uuid, $2::int, $3::text) & 4294967295)::bigint as seed,
         public.hr_seed($1::uuid, $2::int, $4::text)::text                  as salt`;

/* ⚠ `$5::text::jsonb`, NEVER `$5::jsonb`, BECAUSE THE DELTA IS PRE-STRINGIFIED.
   THE CONSTRAINT: a parameter that POSTGRES DESCRIBES AS json/jsonb makes
   postgres.js re-serialize the bound value with JSON.stringify. The engine
   connects with `prepare: false` (required in transaction mode), so every
   statement takes the describe-first path — Parse with an unspecified type,
   then Describe — the driver learns the resolved type 3802 from
   ParameterDescription, and Bind looks it up in `options.serializers`, where
   3802 maps to JSON.stringify. The already-stringified delta is therefore
   encoded a SECOND time and arrives as a jsonb STRING SCALAR, which hr_apply's
   first guard (`jsonb_typeof(p_delta) <> 'object'`) refuses as `bad_delta`.
   That is why no apply through this Edge Function had ever succeeded in
   production before 2026-08-15.
   Casting to `text` first makes Postgres describe the parameter as text (25),
   whose serializer is `x => '' + x` — a passthrough — and the SQL cast parses
   it. Correct under BOTH driver typings (an unspecified type 0 is also a
   passthrough), which is why this is preferred over binding the raw object and
   relying on the driver to stringify exactly once.
   index.ts's tagged-template apply must use the same shape.
   Guarded by tests/delta-transport.mjs, which drives the REAL postgres driver. */
const APPLY_SQL = `
  select public.hr_apply($1::uuid, $2::int, $3::bigint, $4::uuid, $5::text::jsonb) as res`;

/**
 * THE INTENT.
 *
 * @param o.exec      (text, params) => Promise<rows[]>, one statement per call
 * @param o.user      the VERIFIED JWT subject. Never a request field.
 * @param o.slot      the only request-derived value that reaches a query, and it
 *                    selects a row the caller already owns.
 * @param o.intentId  the caller's canonical-uuid idempotency key
 * @param o.activity  the parsed `{kind, id}` declaration
 * @returns { status, body } — the HTTP answer, built here so the test asserts
 *          the same object the shell serialises.
 */
export async function runSetActivity(o) {
  const { exec, user, slot, intentId, activity } = o;

  /* (0) SHAPE FIRST — refused before ANY database work, so a malformed client
         cannot spend a real player's rate budget by looping on garbage. THIS is
         why the four shape refusals carry no state envelope: reading one would
         be the database work this check exists to avoid (intents.js §"WHICH
         REFUSALS CARRY STATE").

         `requiresKey(VERB)` rather than an unconditional test — the registry is
         the only statement of which intents need a key, and a column nothing
         reads is decoration. */
  if (requiresKey(VERB) && !intentId) {
    return { status: 400, body: { ok: false, error: INTENT_ERRORS.MISSING_INTENT_ID } };
  }
  const decl = validateDeclaration(activity);
  if (!decl.ok) {
    return {
      status: decl.error === INTENT_ERRORS.ACTIVITY_UNSUPPORTED ? 409 : 400,
      body: { ok: false, error: decl.error, ...(decl.detail || {}) },
    };
  }
  /* A combat target that is not in the authored data cannot be a real activity.
     This is an EARLY ANSWER, not the authority: hr_apply re-checks the pair
     against the GENERATED hr_activities catalogue and would refuse it there
     too. Both matter — the catalogue is what a compromised engine cannot lie
     to, and this is what stops a typo costing a collect.

     ⚠ `catalogueHas`, NOT `!MONSTERS[id]`. The id shape is /^[a-z0-9_]{1,64}$/,
       which matches `constructor` and `__proto__`; both are truthy on MONSTERS
       and both walked straight past the truthiness form of this check. */
  if (decl.kind === 'combat' && !catalogueHas(MONSTERS, decl.id)) {
    return {
      status: 409,
      body: { ok: false, error: INTENT_ERRORS.UNKNOWN_ACTIVITY, kind: decl.kind, id: decl.id },
    };
  }
  /* The same early answer for the other payable kind. Both catalogues, one
     rule — a kind that can be SET but whose id is never checked here would
     reach hr_apply, which refuses it correctly but one round trip later and
     after the collect has already run. */
  if (decl.kind === 'gather' && !catalogueHas(GATHER_NODES, decl.id)) {
    return {
      status: 409,
      body: { ok: false, error: INTENT_ERRORS.UNKNOWN_ACTIVITY, kind: decl.kind, id: decl.id },
    };
  }

  /* (1) GATE + READ. The bucket comes out of the registry, never a literal. */
  const [read] = await exec(READ_SQL, [user, slot, rateBucketFor(VERB)]);
  if (!read || read.allowed !== true) {
    return { status: 429, body: { ok: false, error: INTENT_ERRORS.RATE_LIMITED } };
  }
  const env = read.state;
  if (!env || env.ok !== true) {
    return { status: 409, body: { ok: false, error: (env && env.error) || INTENT_ERRORS.NO_CHARACTER } };
  }
  const st = env.state;

  /* (2) ⚠ COLLECT BEFORE SWITCH. The rule. See intents.js §3. Whether it
         applies is the registry's `collectsFirst`, read here and nowhere else;
         an intent that does not collect states so as a verdict rather than by
         skipping the gate, so `collectGate` stays the one implementation. */
  const collect = collectsFirst(VERB)
    ? await collectCurrentWindow({
      exec, user, slot, env, st,
      nowMs: new Date(read.now).getTime(),
      capMs: Number(read.cap_ms) || 0,
    })
    : { outcome: 'nothing', version: env.version, reason: 'verb_does_not_collect' };
  const gate = collectGate(collect);
  if (!gate.proceed) {
    /* NOTHING WAS WRITTEN and the watermark did not move: the elapsed window is
       intact. The client's recovery is to run the `accrue` verb — which owns the
       degrade ladder, and the ladder is what escapes a clamp — and then to retry
       the switch WITH A NEW KEY. Saying WHICH half failed is the difference
       between that and a player retrying the switch forever.

       Note the key was never presented to hr_apply on this path (the switch was
       not attempted), so it is unspent — but the contract's rule is "a refusal
       means a new key", one rule and not a taxonomy, because a new key is
       always safe and a reused one sometimes is not. */
    return {
      status: 409,
      body: await refusalBody({
        exec, verb: VERB, user, slot, decorate: decorateActivity,
        refusal: { error: gate.error, stage: 'collect', detail: collect.detail ?? null },
        fallback: env,
      }),
    };
  }

  /* (3) THE SWITCH. The version is the one the COLLECT left behind, because a
         collect that paid has already bumped it. */
  const version = gate.version ?? env.version;
  const delta = activityDelta(decl.kind, decl.id, { kind: st.active_kind, id: st.active_id });
  const [applied] = await exec(APPLY_SQL, [user, slot, version, intentId, JSON.stringify(delta)]);
  const res = applied && applied.res;

  if (!res || res.ok !== true) {
    /* ⚠ THE COLLECT MAY HAVE PAID. A refused switch does NOT roll back the
       collect — they are two applies, deliberately (intents.js §4) — so the
       envelope attached here is the one that carries the money the player just
       earned. `collected` rides along for the same reason: dropping it because
       the SWITCH failed would report genuinely applied payment as nothing. */
    return {
      status: 409,
      body: await refusalBody({
        exec, verb: VERB, user, slot, decorate: decorateActivity,
        refusal: {
          error: (res && res.error) || 'apply_failed', stage: 'switch', detail: res ?? null,
          collected: collect.receipt || null,
        },
        fallback: null,
      }),
    };
  }

  /* THE ENVELOPE. `hr_state_of` verbatim — the client renders it and computes
     nothing.

     `activity` IS READ OUT OF `res.state`, NOT ECHOED FROM `decl`. The first
     revision echoed the request, so a replayed switch reported the CLIENT's own
     declaration as though the server had computed it while `state` said
     something else. Two fields disagreeing in one body, with the client-authored
     one on top, is the exact shape this whole program exists to remove.

     `collected` is a RECEIPT for the window that was paid on the way here,
     stated by the server. It is reported whenever THIS invocation's collect
     applied — which is NOT the same question as "was the switch a replay". The
     first revision asked the second question and reported 3,809 gold and 744
     kills of genuinely applied payment as `null`, destroying the welcome-back
     card for a night the player had earned. `collect.receipt` is already null
     when the collect itself was a replay or had nothing to pay, which is the
     honest condition. */
  return {
    status: 200,
    body: {
      ...res,
      ok: true,
      verb: VERB,
      activity: activityOf(res),
      collected: collect.receipt || null,
      ...(res.replayed === true ? { replayed: true } : {}),
    },
  };
}

/** The pointer, AS THE SERVER HOLDS IT. One reader, so a refusal and a success
    report the same field from the same place. */
function activityOf(env) {
  const st = env && env.state;
  if (!st) return null;
  return { kind: st.active_kind ?? null, id: st.active_id ?? null };
}

/** THIS INTENT'S top-level summary of the server's state, handed to the shared
    `refusalBody` so a refusal and a success report the same field from the same
    place. `envelope.js` owns the mechanics; what a body says about an ACTIVITY
    is still this file's. */
function decorateActivity(env) { return { activity: activityOf(env) }; }

/**
 * Pay the window that has elapsed on the CURRENT activity, in its own apply,
 * with the SERVER-DERIVED key.
 *
 * ⚠ NO DEGRADE LADDER, DELIBERATELY (intents.js rule 5). The accrue verb halves
 *   the span on a clamp because its only other option is to brick the watermark
 *   forever. This intent has a third option — refuse the switch — and taking it
 *   leaves the window intact for the verb that owns the ladder. That is why
 *   there is exactly one ladder in this payload rather than two implementations
 *   of one policy.
 *
 * @returns { outcome: 'paid'|'nothing'|'refused', version, error?, detail?, receipt? }
 */
async function collectCurrentWindow(o) {
  const { exec, user, slot, env, st, nowMs, capMs } = o;

  const accruedToMs = st.accrued_to ? new Date(st.accrued_to).getTime() : nowMs;

  /* CHEAP EXIT. Below the minimum span nothing can be produced, so the two
     seed round trips and the whole simulation are skipped — and, exactly as in
     the accrue verb, NOTHING IS WRITTEN, so a sub-threshold window is not
     confiscated by having been looked at. */
  if (nowMs - accruedToMs < ACCRUE_MIN_MS) {
    return { outcome: 'nothing', version: env.version, reason: 'below_min_span' };
  }

  const seedArgs = [
    user, slot, `accrue:${String(st.accrued_to)}`, `intent:accrue:${String(st.accrued_to)}`,
  ];
  let seedRow;
  try {
    [seedRow] = await exec(SEED_SQL, seedArgs);
  } catch (e) {
    /* ONLY 42883 (undefined_function) degrades. Anything else propagates —
       a swallowed error is how a guard reports SKIPPED and gets read as a
       pass. See SEED_SQL_NO_PERKS above. */
    if (String((e && e.code) ?? '') !== '42883') throw e;
    [seedRow] = await exec(SEED_SQL_NO_PERKS, seedArgs);
  }
  const salt = String((seedRow && seedRow.salt) ?? '');
  /* `ok !== true` covers "no character" and any future refusing shape. null →
     EMPTY_PERKS in the engine → 0 for every key → pre-b349 behaviour. */
  const perkEnv = seedRow && seedRow.perks;
  const perks = (perkEnv && perkEnv.ok === true) ? perkEnv : null;

  /* The engine is called with a LITERAL, field by field, from named server
     values — no spread of anything request-derived, ever. `slot` is the only
     field whose value came from the request and it selects a row the caller
     already owns. This is the same rule index.ts's accrue path follows and it
     is asserted against BOTH call sites.

     ⚠ THERE ARE NOW TWO CALLERS OF ONE ENGINE, AND THAT IS A DRIFT GENERATOR.
       index.ts's accrue path builds this same literal. If one of them gains an
       input the other does not, the two verbs price the SAME window
       differently — a switch would pay less than a collect over the identical
       three hours, silently, with no error anywhere. That is not hypothetical:
       the auto-eat workstream added `inventory` / `autoEatEnabled` /
       `autoEatFood` / `autoEatPct` to the accrue literal, and a collect without
       them heals nothing and dies early.

       tests/activity-intent.mjs A14 extracts the top-level FIELD NAMES from
       BOTH literals and fails the build if they differ. Adding a field here or
       there is therefore a two-file edit by construction, not by memory.
       Do not "fix" a red A14 by relaxing it. */
  const skills = {};
  for (const k of Object.keys(env.skills || {})) skills[k] = Number(env.skills[k].xp) || 0;

  const out = computeAccrual({
    userId: user,
    slot,
    nowMs,
    accruedToMs,
    activeSinceMs: st.active_since ? new Date(st.active_since).getTime() : null,
    activeKind: st.active_kind,
    activeId: st.active_id,
    capMs,
    seed: Number(seedRow && seedRow.seed) || 0,
    hp: Number(st.hp) || 0,
    maxHp: Number(st.max_hp) || 0,
    gold: Number(st.gold) || 0,
    skills,
    equipment: env.equipment || {},
    /* AUTO-EAT — added here the same day the accrue path gained it, because A14
       failed the build the moment the two literals diverged. That is the guard
       working exactly as its author intended: the auto-eat workstream and this
       one landed within hours of each other, textually disjoint, and the ONLY
       thing that noticed a collect would fight with no food and die early was
       the field-name comparison. Without it a switch would have paid less than
       an accrue over the identical window, silently, with no error anywhere.
       Mirrors index.ts field for field — if you add one there, add it here. */
    inventory: env.inventory || {},
    autoEatEnabled: st.auto_eat_enabled === true,
    autoEatFood: st.auto_eat_food ?? null,
    autoEatPct: Number(st.auto_eat_pct),
    /* THE GATHER CARRY — `?? null`, and the null is load-bearing. See the same
       field in index.ts and the `toolCarry` note in computeAccrual's contract:
       an absent column means the engine must NOT put `tool_carry` in the delta,
       because hr_apply's answer to an unknown key is a 409 that costs the
       window this collect exists to pay. */
    toolCarry: st.tool_carry ?? null,
    /* THE PERMANENT PERK STACK (b349). A collect that priced a window at zero
       perks while an accrue over the same window priced it at the player's real
       Kitchen would pay DIFFERENT amounts for the identical time — which is the
       exact class of silent divergence A14 exists to catch, and it caught this
       one: the first draft added `perks` to index.ts only and the parity guard
       went red before a single line of it shipped. */
    perks,
    items: ITEMS,
    monsters: MONSTERS,
    nodes: GATHER_NODES,
  });

  if (!out.accrued) {
    /* ⚠ NOT EVERY `accrued:false` MEANS "NOTHING TO DO". Six reasons, two
       opposite groups — see intents.js §"NOTHING OWED IS AN ALLOWLIST".
       `unsupported_activity` is the one that matters: it is a real window the
       engine cannot price, and treating it as "nothing" is exactly how three
       hours of mining vanish when the player says "now I'm fishing". */
    const cls = classifySkip(out.reason);
    if (cls === 'nothing') {
      return { outcome: 'nothing', version: env.version, reason: out.reason };
    }
    return {
      outcome: 'refused',
      version: null,
      error: 'uncollectable_window',
      detail: { reason: out.reason, active_kind: st.active_kind, active_id: st.active_id },
    };
  }

  /* THE DERIVED KEY. Named arguments and `version` among them — see the block
     above `intentIdFor` in ./intents.js. `version` is what stops a refused
     collect from re-deriving a byte-identical, permanently-poisoned key: the
     rejection does not move `accrued_to`, but a `version_conflict` means the
     version DID move, so the next call derives a different key by construction.
     It must be the SAME version this apply names, or the two stop agreeing. */
  const intentId = await intentIdFor({
    user, slot, watermark: String(st.accrued_to), version: env.version, salt, attempt: 0,
  });
  const [applied] = await exec(APPLY_SQL, [user, slot, env.version, intentId, JSON.stringify(out.delta)]);
  const res = applied && applied.res;

  if (!res || res.ok !== true) {
    return { outcome: 'refused', version: null, error: (res && res.error) || 'apply_failed', detail: res ?? null };
  }
  /* A REPLAY IS A PAID WINDOW. `replayed:true` means this exact collect already
     landed — most likely an `accrue` call that raced us onto the same watermark
     and derived the same key. The money is in the player's account; the version
     in the replay envelope is current. Proceed. */
  return {
    outcome: 'paid',
    version: res.version ?? env.version,
    receipt: res.replayed === true ? null : {
      ms: out.grantMs, capped: out.capped, kills: out.summary.kills,
      gold: out.summary.gold, xp: out.summary.xp, items: out.summary.items,
      levelUps: out.levelUps, died: out.summary.died,
    },
  };
}
