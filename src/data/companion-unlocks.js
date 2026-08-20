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
// A `count` would double-increment on concurrent buys; independent unlock_ids
// avoid forcing a purchase ORDER across unrelated pets.
//
// ── WHAT LIVES HERE vs. IN SQL ──────────────────────────────────────────────
// Bookkeeping only: which companions are gold-buyable, their PRICE, and their
// skill PREREQUISITE — all DERIVED from src/data/companions.js so drift is
// structurally impossible, and tools/gen-companion-unlocks.mjs --check fails the
// smoke suite if the committed migration no longer matches. NO bonus magnitude
// is here — what a companion is WORTH stays in src/data/companions.js and is
// read by the client; the server stores only whether the character owns it.
//
// ⚠ THE SERVER PET MODEL DID NOT EXIST BEFORE THIS SLICE. 2026-08-16-artisan-
//   progress-model.sql's hr_perks_of records companions as
//   'blocked:no_server_pet_model'. This file creates the OWNERSHIP half (storage
//   + the purchase gate). Wiring hr_perks_of / the client to READ that ownership
//   is a later, client-side slice and is deliberately out of scope here.
//
// PURE ESM. Imports only sibling pure-data; no I/O, no Deno, no globals.
// ============================================================================

import { COMPANIONS } from './companions.js';

/** Parse a companion `source` string. Returns null unless it is a `shop:` source.
 *  'shop:8000:cooking25' → { price:8000, skill:'cooking', lv:25 }
 *  'shop:5000'           → { price:5000, skill:null,      lv:null }
 *  The `(\w+?)(\d+)$` split mirrors src/legacy.js injectShopCompanions EXACTLY,
 *  so the server gate and the client's shop-row lock read one requirement. */
function parseShopSource(source) {
  const parts = String(source || '').split(':');
  if (parts[0] !== 'shop') return null;
  const price = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(price) || price < 0) return null;
  let skill = null;
  let lv = null;
  if (parts[2]) {
    const m = parts[2].match(/^(\w+?)(\d+)$/);
    if (m) { skill = m[1]; lv = Number.parseInt(m[2], 10); }
  }
  return { price, skill, lv };
}

/** One companion unlock offer, exactly the columns hr_unlock_offers stores
 *  (including the two NEW ones). Derived from the shop-source companions, sorted
 *  by id so the emitted migration is stable. */
export const COMPANION_OFFERS = Object.freeze(
  Object.keys(COMPANIONS)
    .map((id) => ({ id, def: COMPANIONS[id], shop: parseShopSource(COMPANIONS[id].source) }))
    .filter((e) => e.shop !== null)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((e) => Object.freeze({
      offer_id: `companion.${e.id}`,
      table_name: 'companion',
      name: `Companion: ${e.def.n}`,
      unlock_id: `companion:${e.id}`,
      value: 1,
      gold: e.shop.price,
      items: Object.freeze({}),
      req_property_tier: 0,
      req_item: null,
      req_skill: e.shop.skill,          // null = ungated
      req_skill_level: e.shop.lv,       // null = ungated
    })),
);

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
