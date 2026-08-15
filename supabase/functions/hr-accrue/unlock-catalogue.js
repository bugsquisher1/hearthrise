// ============================================================================
// supabase/functions/hr-accrue/unlock-catalogue.js — WHICH OFFERS `unlock_buy`
// MAY SELL, and why every other one is refused BY NAME.
//
// ── WHAT THIS FILE IS NOT ───────────────────────────────────────────────────
// It is NOT the price. `shop_buy` derives its price here in JS and hands it to
// hr_apply as a signed `gold` delta; `unlock_buy` does not, and that difference
// is the whole design (docs/design/unlock-buy.md §2). `hr_unlock_buy` takes an
// OFFER ID and nothing else, and reads the price out of `public.hr_unlock_offers`
// — a GENERATED table whose rows come from THIS MODULE'S OWN eligibility
// predicate via tools/gen-unlock-offers.mjs. So there is exactly one derivation
// and the Edge Function has no arithmetic authority over a permanent unlock at
// all: it cannot propose a cheaper Kitchen, because it cannot propose a price.
//
// What it IS: the SHAPE half. A malformed or unsellable offer is refused HERE,
// in process, before any database work — the same property `shop_buy` has and
// for the same reason (a malformed client must not be able to spend a real
// player's rate budget by looping on garbage).
//
// ⚠ ONE PREDICATE, TWO CONSUMERS. tools/gen-unlock-offers.mjs imports
//   `unlockOfferIneligibility` from this file to decide which rows to emit, so
//   the SQL catalogue and this module cannot disagree about what is sellable —
//   they are one statement read twice. `node tools/gen-unlock-offers.mjs --check`
//   is a preflight in tests/run-smoke.mjs and fails the build on any drift.
//
// ⚠ WHAT IS DELIBERATELY ABSENT: the PREREQUISITES. Which property tier a room
//   rung needs, and which dungeon blueprint it consumes, live in classic scripts
//   (src/legacy.js `ROOMS`, src/features/homestead.js `TIERS`) that neither ESM
//   nor Deno can import. They are extracted by the generator and enforced by
//   `hr_unlock_buy` in SQL, against the character's own server-side state. The
//   Edge Function therefore cannot forget them, cannot weaken them, and never
//   sees them — a refusal comes back named (`prereq_property_tier`,
//   `prereq_item`) with the numbers the server compared.
//
// PURE ESM. No I/O, no Deno, no globals — Node imports it verbatim.
// ============================================================================

import { SHOP_OFFERS } from '../../../src/data/shops.js';
import { ITEMS } from '../../../src/data/items.js';
import { catalogueGet } from './intents.js';

/* ── THE SELLABLE SHAPE ─────────────────────────────────────────────────────
   `shop_buy` sells "gold in, items out" and refuses 99 of 128 authored offers
   by name. This verb sells the mirror image — VALUE IN, ONE PERMANENT UNLOCK
   OUT — and refuses everything else the same way, on the offer's SHAPE rather
   than against a hand-listed set of ids, so an offer that GROWS a condition
   falls out of the sellable set by construction. */

/** Fields this verb understands. Anything else disqualifies the offer BY NAME.
    `max` is understood because the server enforces the ceiling itself, out of
    `hr_unlocks.max_value` — which is generated from that same `max`. */
const OFFER_FIELDS_UNDERSTOOD = Object.freeze(['id', 'table', 'name', 'cost', 'grant', 'repeatable', 'max']);

/** THE NAMESPACES THIS BUILD OWNS, and the decision is per namespace.
 *
 *  An unlock is only sellable server-side if the server can re-validate the
 *  WHOLE purchase — the ladder, the ceiling, and the PREREQUISITE. Two
 *  namespaces qualify today:
 *
 *    room      the rung ladder is in hr_unlocks; the property-tier gate and the
 *              dungeon blueprint are in hr_unlock_offers. Both enforced in SQL.
 *              This is the namespace `noBurn` lives in — the reason the verb
 *              exists (§9(3) of 2026-08-16-artisan-progress-model.sql).
 *    property  the homestead spine. Each tier is its own unlock id with a
 *              one-rung ladder, so "buy the Castle first" is NOT caught by the
 *              ladder check — it is caught by the prerequisite (tier k requires
 *              tier k-1), which is exactly why the prerequisite column exists.
 *
 *  Everything else is refused by name, and each has a reason rather than an
 *  omission:
 *    plot / worker    REPEATABLE hires and buildings whose cap is the PROPERTY
 *                     TIER's `plots`/`workers`, not a number in any catalogue
 *                     the server has. A cap that is not enforced is not a cap.
 *    farm_plot_tier   priced in `farm_deed` items and gated by src/core/farm.js
 *                     PLOT_TIERS; the same missing-cap argument.
 *    companion        two of the four carry reqSkill/reqLv, which this verb does
 *                     not implement; the namespace is refused whole rather than
 *                     half, so "which companions are buyable" is not a rule a
 *                     reader has to reconstruct from two places.
 *    dungeon_run      merge='none' — a one-shot action with no persistent home.
 *                     The intent that CONSUMES it owns it (hr_unlocks' own
 *                     header), and it is refused by the storage guard anyway.
 *    theme / cosmetic / character_slot / entitlement / bounty
 *                     priced in gems, Bounty Marks (no server column at all) or
 *                     real money (the platform's authority, not ours).
 *    trait            trait:auto_eat already has its own applied, live RPC
 *                     (hr_set_auto_eat). A second writer for one row is how two
 *                     rules end up disagreeing about one fact.
 *    recipe           kind='flag', EARNED by playing: the accrual engine grants
 *                     it through hr_apply when its own drop roll yields the
 *                     scroll. Nothing sells it. */
export const SELLABLE_NAMESPACES = Object.freeze(['room', 'property']);

const MAX_ITEM_COST_PER_LINE = 100000;

const isPosInt = (n) => Number.isSafeInteger(n) && n > 0;

/**
 * Why `o` is not `unlock_buy`-able, or null if it is. PURE — no database, no
 * clock, no request. It names the FIELD or the LINE that disqualified it.
 *
 * EXPORTED and driven directly by the tests with SYNTHETIC offers, for the
 * reason `offerIneligibility` states in catalogue.js: a rule with nothing live
 * to reject is unobservable, and unobservable rules rot until the day they
 * matter, which is the day somebody authors exactly that row.
 */
export function unlockOfferIneligibility(o) {
  if (!o || typeof o !== 'object') return 'not_an_offer';

  /* THE GRANT FIRST, because it is what decides whether this verb is the right
     verb at all. Exactly ONE unlock line: a two-unlock offer is a purchase with
     two ladders and one price, and `hr_unlock_buy` writes one row. */
  if (!Array.isArray(o.grant) || o.grant.length !== 1) return 'multi_line_grant';
  const g = o.grant[0];
  if (!g || g.kind !== 'unlock' || typeof g.id !== 'string') {
    return `ungrantable:${g ? g.kind : 'none'}`;
  }
  if (!isPosInt(g.amount)) return 'non_positive_grant';
  const ns = g.id.includes(':') ? g.id.slice(0, g.id.indexOf(':')) : g.id;

  /* ⚠ THE NAMESPACE IS TESTED BEFORE THE FIELD ALLOWLIST (Security F8,
     diagnostics only). Both orders refuse the same set — nothing changes about
     WHAT is sellable — but the REASON changes, and the reason is what a player
     and a bug report read. `dungeon.crypt_of_bones` carries reqSkill AND is in
     a namespace with no persistent home; reported as `unimplemented_field:
     reqSkill` it reads as "we could sell this once we implement skill gates",
     which is false: the namespace is a one-shot action with no storage at all.
     The wider fact is the truer one, so it is reported first. */
  if (!SELLABLE_NAMESPACES.includes(ns)) return `namespace_unsupported:${ns}`;

  for (const k of Object.keys(o)) {
    if (!OFFER_FIELDS_UNDERSTOOD.includes(k)) return `unimplemented_field:${k}`;
  }

  /* THE COST. One gold line, plus item lines — which is the shape every room
     rung and every property tier actually has (`room.kitchen.1` is 500 gold AND
     20 normal_log). A gold-only predicate would have refused all 45 of them and
     the verb would have shipped unable to sell the thing it was written for. */
  if (!Array.isArray(o.cost) || o.cost.length === 0) return 'no_cost';
  let goldLines = 0;
  for (const c of o.cost) {
    if (!c || typeof c !== 'object') return 'bad_cost_line';
    if (c.kind === 'currency') {
      if (c.id !== 'gold') return `unpayable_cost:currency:${c.id}`;
      goldLines += 1;
      /* A ZERO-GOLD UNLOCK IS A FREE PERMANENT CAPABILITY. `theme.default` is
         priced at 0 and nothing else is; the day a 0-gold room rung is
         authored it must be a deliberate decision somewhere other than here. */
      if (!isPosInt(c.amount)) return 'non_positive_price';
    } else if (c.kind === 'item') {
      if (catalogueGet(ITEMS, c.id) === undefined) return `unknown_item:${c.id}`;
      if (!isPosInt(c.amount) || c.amount > MAX_ITEM_COST_PER_LINE) return `bad_cost_amount:${c.id}`;
    } else {
      return `unpayable_cost:${c.kind}:${c.id}`;
    }
  }
  if (goldLines !== 1) return `gold_lines:${goldLines}`;
  return null;
}

/** The one gold line's amount, and the item lines as `{ id: qty }`. Only ever
    called on an offer `unlockOfferIneligibility` has already passed. */
export function costOf(offer) {
  let gold = 0;
  const items = Object.create(null);
  for (const c of offer.cost) {
    if (c.kind === 'currency') gold = c.amount;
    else items[c.id] = (items[c.id] || 0) + c.amount;
  }
  return { gold, items };
}

const sellable = Object.create(null);
const refusals = Object.create(null);
const allIds = [];
for (const o of SHOP_OFFERS) {
  const id = o && o.id;
  if (typeof id !== 'string') continue;
  /* Only offers that GRANT AN UNLOCK are this verb's business at all. An equip
     offer is `shop_buy`'s and answering `namespace_unsupported` for it here
     would tell a player the wrong thing about a working purchase — so it is
     simply not in either map, and the verb answers `unknown_offer`. */
  if (!Array.isArray(o.grant) || !o.grant.some((g) => g && g.kind === 'unlock')) continue;
  allIds.push(id);
  const why = unlockOfferIneligibility(o);
  if (why) { refusals[id] = why; continue; }
  const { gold, items } = costOf(o);
  sellable[id] = Object.freeze({
    id,
    table: o.table,
    name: o.name,
    unlockId: o.grant[0].id,
    /** The RUNG this offer sells — not an amount to add. `hr_unlock_buy` merges
        it as GREATEST(existing, value), never `+=`; that is §9's contract and
        the reason 'unlock' is absent from hr_apply's delta allowlist. */
    value: o.grant[0].amount,
    gold,
    items: Object.freeze({ ...items }),
  });
}

/** `{ [offerId]: {id, table, name, unlockId, value, gold, items} }` — every
    unlock offer this build can sell. NULL-PROTOTYPE: the offer id shape admits
    `constructor`, whose `.gold` is `undefined` — a free purchase — and every
    reader goes through `catalogueGet` as well. */
export const UNLOCK_OFFERS = Object.freeze(sellable);

/** `{ [offerId]: reason }` for every AUTHORED unlock offer this verb cannot
    sell. The distinction against `unknown_offer` is the point: a player told
    "no such offer" about the Hearth Hall subscription files a bug against the
    wrong system. */
export const UNLOCK_REFUSALS = Object.freeze(refusals);

/** Every authored unlock-granting offer id, sellable or not. Guards only. */
export const ALL_UNLOCK_OFFER_IDS = Object.freeze(allIds);
