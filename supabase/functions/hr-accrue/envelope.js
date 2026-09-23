// ============================================================================
// supabase/functions/hr-accrue/envelope.js — A REFUSAL THAT REACHED THE
// DATABASE CARRIES THE STATE ENVELOPE. Security review C2, ONE implementation.
//
// ── WHY THIS IS A MODULE AND NOT A PRIVATE FUNCTION IN EACH INTENT ─────────
// The seam's instruction to the client is "put your optimistic local pointer
// back to what the ENVELOPE says, never to what you guessed". That instruction
// is only executable if every refusal that could have changed something carries
// one. `set_activity` implemented it privately; `claim_reward` is the second
// intent and seven more follow, and eight private copies of one rule is eight
// chances for the seventh to forget — which would not fail, it would just leave
// one client path guessing. So the rule moves here, with the intents as
// callers.
//
// ⚠ IT IS A FRESH READ, NOT THE ONE TAKEN AT THE TOP OF THE CALL. The refusal
//   that most needs an envelope is `version_conflict`, which means BY
//   DEFINITION that the state moved after that read. Costs one extra statement,
//   on the refusal path only, behind a gate that has already been spent.
//
// PURE ESM behind the same injected `exec` seam every intent uses. No Deno, no
// fetch, no globals — so a Node test drives the same bytes that deploy.
// ============================================================================

import { refusalCarriesState, STATELESS_REFUSALS } from './intents.js';

/** The one statement. A single `select`, which is what transaction-mode pooling
    requires (design §2a-ii, HARD RULE). */
export const REFRESH_SQL = 'select public.hr_state_of($1::uuid, $2::int) as state';

/**
 * Build a refusal body carrying the CURRENT `hr_state_of` envelope.
 *
 * @param o.exec      the injected one-statement seam
 * @param o.verb      the verb, echoed on every body so one client dispatcher
 *                    can route a response without remembering what it asked
 * @param o.user      the VERIFIED subject
 * @param o.slot      the character slot
 * @param o.refusal   `{ error, stage?, detail?, ...anything the intent adds }`
 * @param o.fallback  the envelope read at the top of the call, used only if the
 *                    fresh read fails. Pass null where it is known to be stale.
 * @param o.decorate  optional `(env) => extraFields` — how THIS intent
 *                    summarises the server's state at the top level (the
 *                    activity intent echoes the pointer). Called only when an
 *                    envelope was obtained.
 *
 * ⚠ A FAILED REFRESH MUST NOT TURN A 409 INTO A 500. The refusal is the answer;
 *   the envelope is an aid to reconciling. So the read is best-effort and the
 *   body degrades to "no envelope" — the same shape the documented stateless
 *   refusals have, which the client already handles.
 */
export async function refusalBody(o) {
  const { exec, verb, user, slot, refusal, fallback, decorate } = o;

  /* THE RULE GETS A RUNTIME READER. `refusalCarriesState` was, until b349, read
     by nothing but a test — which is the definition of decoration in this
     payload (intents.js: "a rule in this file that no code path reads is not a
     rule"). Now the mechanics ask the rule: a code on the exemption list has
     already returned before reaching here, so arriving with one means an intent
     is about to spend a statement re-reading state for a refusal the contract
     says carries none. Answer without the read rather than silently disagreeing
     with the published taxonomy. */
  if (!refusalCarriesState(refusal && refusal.error)) {
    return { ok: false, verb, ...refusal };
  }

  let env = null;
  try {
    const [row] = await exec(REFRESH_SQL, [user, slot]);
    const fresh = row && row.state;
    if (fresh && fresh.ok === true) env = fresh;
  } catch { /* best effort — see above */ }
  if (!env && fallback && fallback.ok === true) env = fallback;
  if (!env) return { ok: false, verb, ...refusal };
  return {
    ...env,
    ok: false,
    verb,
    ...(typeof decorate === 'function' ? (decorate(env) || {}) : {}),
    ...refusal,
  };
}

/** Re-exported so a caller needs one import to reason about the taxonomy. */
export { refusalCarriesState, STATELESS_REFUSALS };

// ============================================================================
// THE OTHER HALF OF "THE ENVELOPE": HOW AN ENGINE INPUT IS READ OUT OF ONE.
//
// ── WHY THIS IS HERE AND NOT COPIED AT EACH CALL SITE ───────────────────────
// `hr_state_of` is the ONE projection every server-side settler hydrates from,
// and it has TWO levels: `state` holds the player_state COLUMNS (hp, gold,
// active_kind, accrued_to, tool_carry, fight, …) and the ENVELOPE TOP LEVEL
// holds the projections built from other tables (skills, inventory, equipment,
// enchant, buffs, version). Which level a field lives on is not guessable from
// its name, and `env.state.skills` is `undefined` rather than an error.
//
// Measured on production 2026-09-22 22:37–22:42 UTC: the world tick hydrated
// `sessionFromRoster(row, env.state)` and therefore handed the engine
// `skills {}, inventory {}, equipment {}` for a character at Mining 61–64 on
// `mithril_rock`. Every shadow row in `hr_tick_shadow` came back
// `would_ticks: 0, would_qty: 0` and — because a level gate is
// `STOP_REASON.LEVEL` — with `activity: {kind:'idle', id:null}`, i.e. the tick
// would have ENDED the activity of a character who can mine that node, every
// window. The accrue path in index.ts read the SAME envelope correctly and paid
// +3,375 items for a 12 h absence on that character the same afternoon.
//
// Two readers of one two-level shape is the second path AWAY-12 forbids, and
// the drift was silent because both halves "worked": each one read a real
// object and got an answer. So the mapping is ONE function with ONE field list,
// the accrue path and the tick both call it, and a field that moves level moves
// for both callers in the same commit.
//
// PURE. No `exec`, no clock, no catalogue, no request body — the argument is
// the envelope and nothing else, which is what lets a Node test drive the same
// bytes the edge deploys.
// ============================================================================

/* THE CHARACTER-STATE KEYS: everything the engine reads that a settler also
   CARRIES FORWARD between windows (tick-shadow.js `advance` writes most of
   them). Exported so a chained caller forwards exactly this list instead of
   re-typing a subset — the third copy of the field list, and the one that made
   `hearthfindReady`, `enchant` and `combatStyle` invisible to a tick window. */
export const ENGINE_STATE_KEYS = Object.freeze([
  'hp', 'maxHp', 'gold',
  'skills', 'inventory', 'equipment',
  'enchant', 'buffs', 'combatStyle',
  'autoEatEnabled', 'autoEatFood', 'autoEatPct',
  'toolCarry', 'ammoCarry', 'fight',
  'recoveringUntilMs', 'consecFalls',
  'deathsTodayBefore', 'deathsLifetimeBefore',
  'hearthfindReady', 'combatXpAccruedToMs',
  /* THE HUNT'S FOUR (2026-09-22). They belong on THIS list and not in a field
     list at each call site for the reason the whole module exists: the accrue
     path, the collect and the world tick must price a hunt the same way, and
     `vigour` missing from one of the three is a daily limiter that one caller
     does not have. Named here, they reach all three in one commit. */
  'huntStance', 'huntStop', 'traits', 'vigour',
]);

/* THE POINTER KEYS: the activity and the two watermarks. A chained caller
   OVERRIDES these per window (the tick's watermark is the fence's mark, not
   `state.accrued_to`), which is why they are named apart from the state. */
export const ENGINE_POINTER_KEYS = Object.freeze([
  'accruedToMs', 'activeSinceMs', 'activeKind', 'activeId',
]);

/** Every key `engineInputsFromEnvelope` produces. */
export const ENGINE_INPUT_KEYS = Object.freeze(
  [...ENGINE_POINTER_KEYS, ...ENGINE_STATE_KEYS]);

/**
 * Map an `hr_state_of` envelope to the engine inputs it OWNS.
 *
 * It answers for the envelope and for nothing else: `seed`, `perks`,
 * `unlockedRecipes`, `attended`, `bestiaryKills`, `capMs`, `nowMs`, the
 * catalogues, `caller` and `callerAuthority` all come from other reads or are
 * server literals, and each call site still names them itself.
 *
 * @param env    the full envelope — `hr_state_of`'s result, NOT `env.state`.
 * @param nowMs  the server clock, used only as `accrued_to`'s fallback, exactly
 *               as the accrue path falls back.
 */
export function engineInputsFromEnvelope(env, nowMs) {
  const e = env || {};
  const st = e.state || {};

  /* SKILLS ARE A TWO-LEVEL PROJECTION AND THE ENGINE WANTS ONE.
     `hr_state_of` emits `{skill_id: {xp, level}}` (2026-09-14-hr-state-of-
     restatement.sql L518) because the client renders the level; the engine
     takes raw xp and derives the level itself (`levelFromXp`). Reading
     `.xp` is therefore not defensive spelling, it is the projection's shape —
     and it is ALSO why hydrating from `env.state` failed silently rather than
     loudly: `{}` is a perfectly good skills map that says level 0. */
  const skills = {};
  for (const k of Object.keys(e.skills || {})) skills[k] = Number(e.skills[k].xp) || 0;

  return {
    /* ── THE POINTER AND THE TWO WATERMARKS ──────────────────────────────── */
    accruedToMs: st.accrued_to ? new Date(st.accrued_to).getTime() : nowMs,
    /* NULL, not a fallback to accruedToMs (b345). `active_since` is the second
       watermark and substituting the first one for it removes the clamp at
       exactly the moment it is needed — a `start_activity` that forgot to send
       `accrued_to` is the case it exists for. computeAccrual refuses a payable
       activity with no `active_since` by name (`no_active_since`). */
    activeSinceMs: st.active_since ? new Date(st.active_since).getTime() : null,
    activeKind: st.active_kind,
    activeId: st.active_id,
    /* THE COMBAT-XP WATERMARK (2026-08-31-combat-xp-credit.sql). Advanced ONLY
       by hr_credit_combat_xp; the settle reads it here and credits combat XP
       only for the window at/after it (accrual.js xpEligibleFromMs), so it
       never re-mints XP a live credit already applied. Absent column ⇒ 0 ⇒ the
       split is inert and the settle pays the whole window exactly as before. */
    combatXpAccruedToMs: st.combat_xp_accrued_to
      ? new Date(st.combat_xp_accrued_to).getTime() : 0,

    /* ── THE COLUMNS ON THE ROW `hr_apply` LOCKS ─────────────────────────── */
    hp: Number(st.hp) || 0,
    maxHp: Number(st.max_hp) || 0,
    gold: Number(st.gold) || 0,

    /* ── THE PROJECTIONS, WHICH LIVE AT THE ENVELOPE TOP LEVEL ───────────── */
    skills,
    equipment: e.equipment || {},
    /* `inventory` is the first input the engine SPENDS rather than only reads —
       auto-eat consumes food — which is why the returned delta's `items` map is
       signed. */
    inventory: e.inventory || {},
    /* THE WEAPON ENCHANT (ELEMENTS v1). `{ <equip_slot>: <element> }`, or `{}`
       when the column is absent. A READ-ONLY input to
       `equipmentStats(equipment, items, enchant)` — no delta key is derived
       from it — so `|| {}` is safe. It is what makes an AWAY fight see the
       element (accrual.js `weakness`). */
    enchant: e.enchant || {},
    /* THE CONSUMABLE BUFF QUEUE (2026-09-13). player_state.buffs, written only
       by hr_apply's buff_apply block from hr_item_buffs + now(). PRESENCE OF
       KEY, not `|| []`: an ABSENT key means this database has no buff column
       (or an older hr_state_of), and `null` is what makes accrual.js pay NOBODY
       instead of guessing. Never a request field: the body carries no buff. */
    buffs: ('buffs' in e) ? e.buffs : null,

    /* ── THE SELF-CONFIGURING SWITCHES ───────────────────────────────────── */
    /* AUTO-EAT. The three settings are what let the server heal exactly as the
       client does; without them it never heals and an unattended night ends at
       the first death (measured: -63% to -99% of the night). `auto_eat_enabled`
       is also the purchased-trait receipt, so nothing here defaults to true. */
    autoEatEnabled: st.auto_eat_enabled === true,
    autoEatFood: st.auto_eat_food ?? null,
    autoEatPct: Number(st.auto_eat_pct),
    /* THE GATHER CARRY. `?? null` and NOT `?? {}`: null means the column does
       not exist on this database, and the engine reads that as "do not write a
       tool_carry key", because hr_apply refuses an unknown delta key and that
       refusal costs a whole night. The presence of the column IS the switch. */
    toolCarry: st.tool_carry ?? null,
    /* THE CONSUMPTION CARRY (design item E2). `?? null` for exactly the reason
       above; resolves to null today because `player_state.ammo_carry` does not
       exist yet. */
    ammoCarry: st.ammo_carry ?? null,
    /* THE IN-FLIGHT FIGHT (Phase 0). `?? null` and NOT `?? {}`: with the column
       a settle RESUMES the fight instead of restarting it — without it, any
       monster whose time-to-kill exceeds the span pays zero forever. */
    fight: st.fight ?? null,
    /* THE RECOVERY LINE (First-Night Idle Rescue). An ABSOLUTE server timestamp,
       the only authority on whether this character is Knocked Out. It CANNOT be
       spelled `?? null`: null is the ORDINARY value (the character is up), so
       `??` would report every healthy character as a database without the
       column. The distinction is the KEY'S PRESENCE in the envelope. */
    recoveringUntilMs: ('recovering_until' in st)
      ? (st.recovering_until ? new Date(st.recovering_until).getTime() : 0) : null,
    /* THE RETREAT COUNTER (Recovery rev. 3). Written ONLY by hr_apply from the
       engine's own proposal. Presence-of-key, not `?? null`, so all four
       self-configuring inputs read with one idiom rather than two. */
    consecFalls: ('consec_falls' in st) ? (Number(st.consec_falls) || 0) : null,
    /* THE RECOVERY LADDER'S TWO ANCHORS (Recovery rev. 2). Read by hr_state_of
       as its OWN scalars and NOT dug out of the `progress` array, which is
       `limit 1000` with a `progress_truncated` flag: a survival mechanic must
       never answer "you have never died" because a character owns a lot of
       collection rows. Absent ⇒ 0 ⇒ the day's-first-fall grace, which is the
       UNDER-charging direction. */
    deathsTodayBefore: Number(st.deaths_today) || 0,
    deathsLifetimeBefore: Number(st.deaths_lifetime) || 0,
    /* THE HEARTHFIND'S SELF-CONFIGURING SWITCH (Feature Slate 2). hr_state_of
       projects `hearthfind_ready:true` only on a database whose hr_apply
       allowlists the `hearthfind` delta key, so an edge deployed BEFORE the
       migration is inert rather than 409-ing `unknown_delta_key` and costing a
       player their night. The switch is the ENVELOPE, never a deploy flag. */
    hearthfindReady: st.hearthfind_ready === true,
    /* THE COMBAT STYLE (2026-08-24-combat-style.sql). Projected INSIDE `state`,
       read off the row hr_apply locks — never from the request body, which
       carries no style field at all. It is what makes an away fight train the
       skill the player picked. `?? null` and NOT `?? {}`: null means the column
       does not exist, and `resolveStyle(weaponType, null)` is exactly the
       pre-migration behaviour. */
    combatStyle: st.combat_style ?? null,

    /* ── THE HUNT (2026-09-22) — FOUR INPUTS, ALL SELF-CONFIGURING ─────────
       Every one is ABSENT-SAFE, so an edge carrying them is byte-identical
       until the lane-C migrations are applied:
         huntStance  `?? null`  -> stanceOf reads null as `steady`, which IS
                     today's behaviour. A database without the column projects
                     no key and the engine changes not one draw.
         huntStop    `?? null`  -> no rules, so the stop predicate never fires.
         traits      the envelope's trait id ARRAY, at the TOP level and not on
                     `state`. It is what clamps a stance's auto-eat threshold to
                     the tier the character actually PAID for; absent reads as
                     tier 0, whose ceiling is the LOWER one, so a caller that
                     forgets it gets the safe answer rather than the generous
                     one.
         vigour      hr_vigour_of's whole block, including the SERVER's
                     `budget_min` and its `day_key`, also at the TOP level.
                     Absent -> the engine proposes no charge and pays no dry
                     multiplier. The day key travels from the database because a
                     daily boundary is a database spelling, and two spellings of
                     "today" is how a daily gets charged twice. */
    huntStance: st.hunt_stance ?? null,
    huntStop: st.hunt_stop ?? null,
    traits: e.traits ?? null,
    vigour: e.vigour ?? null,
  };
}

/**
 * Forward a CHAINED caller's character to the engine: exactly
 * `ENGINE_STATE_KEYS`, and only the keys the character actually carries.
 *
 * A key the character does not hold stays ABSENT rather than becoming
 * `undefined`, because several of these inputs are presence-of-key switches
 * (`recoveringUntilMs`, `consecFalls`, `buffs`) and an offline fixture that
 * never had the column must keep reading as "no column".
 */
export function engineStateOf(char) {
  const c = char || {};
  const out = {};
  for (const k of ENGINE_STATE_KEYS) if (k in c) out[k] = c[k];
  return out;
}
