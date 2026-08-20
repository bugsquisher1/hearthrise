// ============================================================================
// src/data/companion-unlocks.js — GOLD-SPEND SLICE 4: COMPANION UNLOCKS.
//
// The shop-purchasable companions (source `shop:<price>[:<skill><lv>]`) become
// SERVER-OWNED boolean unlocks, so that the ONE existing spend RPC
// (public.hr_unlock_buy) sells them with no new code path — the same treatment
// worker_hire / plot:farm_land / bank got in slices 2 & 3. The census: four
// companions have a `shop:` source, and exactly TWO of them carry a skill
// requirement (honeybee → cooking 25, owl → prayer 50).
//
// ── THE ONE NEW SERVER INVARIANT ────────────────────────────────────────────
// A companion is the first gold spend gated on a SKILL LEVEL rather than on the
// property tier. hr_unlock_offers gains two nullable columns — req_skill (text)
// and req_skill_level (int) — and hr_unlock_buy grows a gate that, AFTER the
// rung-order check and mirroring the property-tier gate, reads the character's
// OWN server-side level for that skill (hr_level_from_xp over player_skills, the
// exact read the equip and activity gates already use) and refuses
// `prereq_skill_level` below it. A client-sent level never enters it. An offer
// with no req_skill leaves both columns NULL and is ungated.
//
// ── WHY A SINGLE-RUNG MAX LADDER, NOT A COUNT OR A FLAG ──────────────────────
// Each companion is an INDEPENDENT boolean (owning the Bunny says nothing about
// owning the Owl), so each is its OWN unlock_id `companion:<id>` with a one-rung
// max ladder (rungs=[1], max_value=1). That reuses hr_unlock_buy's proven path:
// GREATEST-merge makes a second purchase `already_owned` rather than a double
// charge, the storage guard refuses any value off [1], and a replay pays once.
//
// ── SELF-CONTAINED, DRIFT-GUARDED (the gold-ladders.js pattern) ──────────────
// These offers are AUTHORED here as literals rather than derived from
// companions.js at eval, because this file is BUILD-ONLY (read only by
// tools/gen-companion-unlocks.mjs to emit the migration — never browser-loaded),
// and a browser-versioned `?v=` import would break the Node generator while an
// unversioned one trips the bump guard. Correctness is not lost: the generator
// imports companions.js DIRECTLY and its `--check` drift guard fails the smoke
// suite if these literals ever diverge from what companions.js says today (price,
// skill requirement, or the shop-companion set). NO bonus magnitude lives here —
// what a companion is WORTH stays in companions.js; the server stores only
// whether the character owns it.
//
// ⚠ THE SERVER PET MODEL DID NOT EXIST BEFORE THIS SLICE. 2026-08-16-artisan-
//   progress-model.sql's hr_perks_of records companions as
//   'blocked:no_server_pet_model'. This file creates the OWNERSHIP half (storage
//   + the purchase gate). Wiring hr_perks_of / the client to READ that ownership
//   is a later, client-side slice and is deliberately out of scope here.
//
// PURE ESM. No imports, no I/O, no Deno, no globals — a self-contained manifest.
// ============================================================================

/** One companion unlock offer, exactly the columns hr_unlock_offers stores
 *  (including the two NEW ones req_skill/req_skill_level). Authored as literals,
 *  sorted by offer_id so the emitted migration is stable. Drift-guarded against
 *  src/data/companions.js by tools/gen-companion-unlocks.mjs --check. */
export const COMPANION_OFFERS = Object.freeze([
  Object.freeze({
    offer_id: 'companion.honeybee',
    table_name: 'companion',
    name: 'Companion: Honeybee',
    unlock_id: 'companion:honeybee',
    value: 1,
    gold: 8000,
    items: Object.freeze({}),
    req_property_tier: 0,
    req_item: null,
    req_skill: 'cooking',
    req_skill_level: 25,
  }),
  Object.freeze({
    offer_id: 'companion.owl',
    table_name: 'companion',
    name: 'Companion: Owl',
    unlock_id: 'companion:owl',
    value: 1,
    gold: 50,
    items: Object.freeze({}),
    req_property_tier: 0,
    req_item: null,
    req_skill: 'prayer',
    req_skill_level: 50,
  }),
  Object.freeze({
    offer_id: 'companion.raccoon',
    table_name: 'companion',
    name: 'Companion: Raccoon',
    unlock_id: 'companion:raccoon',
    value: 1,
    gold: 25000,
    items: Object.freeze({}),
    req_property_tier: 0,
    req_item: null,
    req_skill: null,
    req_skill_level: null,
  }),
  Object.freeze({
    offer_id: 'companion.sparrow',
    table_name: 'companion',
    name: 'Companion: Sparrow',
    unlock_id: 'companion:sparrow',
    value: 1,
    gold: 5000,
    items: Object.freeze({}),
    req_property_tier: 0,
    req_item: null,
    req_skill: null,
    req_skill_level: null,
  }),
]);

/** The hr_unlocks catalogue rows these offers need: one single-rung max ladder
 *  per companion (merge='max', kind='unlock', rungs=[1]). */
export const COMPANION_UNLOCKS = Object.freeze(
  COMPANION_OFFERS.map((o) => Object.freeze({
    unlock_id: o.unlock_id,
    namespace: 'companion',
    merge: 'max',
    progress_kind: 'unlock',
    max_value: 1,
    rungs: Object.freeze([1]),
  })),
);

/** The offer-id SET the Edge consults to decide it may forward the intent to
 *  hr_unlock_buy. Disjoint from every authored shop offer id AND from the
 *  gold-ladder ids (namespace `companion.*`), so it is checked with no risk of
 *  colliding with a refused shop row or a gold-ladder rung. */
export const COMPANION_OFFER_IDS = Object.freeze(COMPANION_OFFERS.map((o) => o.offer_id));
