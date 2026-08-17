// ============================================================================
// supabase/functions/hr-accrue/catalogue.js — the derived catalogues, built
// ONCE, at module scope, from src/data.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// `computeAccrual` takes every catalogue as a NAMED INPUT (see its header: the
// exploit surface of an accrual engine is its inputs, and inputs are only
// auditable if a reviewer can see all of them in one function signature). That
// rule is right, and it has one consequence: anything derived from src/data has
// to be derived by the CALLER — and there are two callers, `index.ts` (the
// accrue verb) and `set-activity.js` (the collect that a switch runs).
//
// Two callers deriving one index is a drift generator, and this codebase has
// the receipt for exactly that shape: tests/accrual-engine.mjs' A14 guard
// exists because the auto-eat workstream added four inputs to one call site and
// not the other, so a collect would have fought with no food and died early.
//
// So the derivation lives here, once, and both callers import the SAME OBJECT.
// A14 still forces both to pass it.
//
// ⚠ NOTHING IS COPIED. The skill↔array mapping below is the only place in the
//   server payload that says "TREES are woodcutting", and it is the same
//   statement tools/gen-catalogues.mjs makes when it generates `hr_activities`
//   — which is what the database re-validates an activity id against. Two
//   statements of one fact, in two languages, is the `unifyObject` failure this
//   whole program exists to prevent; the drift guard between them is
//   `gen-catalogues --check`, wired into tests/run-smoke.mjs as a preflight.
//
// PURE ESM. No DOM, no window, no timers, no Math.random, no fetch.
// ============================================================================

import { TREES, ROCKS, FISH_SPOTS, EQUIP_SLOTS, expandItemSlot }
  from '../../../src/data/gathering.js';
import { indexGatherNodes } from '../../../src/core/skill-sim.js';
import { ARTISAN_RECIPES } from '../../../src/data/recipes.js';
import { indexArtisanRecipes, payableRecipeIndex } from '../../../src/core/artisan-sim.js';
import { SHOP_OFFERS } from '../../../src/data/shops.js';
import { ITEMS } from '../../../src/data/items.js';
import { catalogueGet } from './intents.js';

/**
 * `{ [nodeId]: { skill, node } }` over all 23 gathering nodes.
 *
 * NULL-PROTOTYPE (see `indexGatherNodes`): `active_id` is bounded by
 * /^[a-z0-9_]{1,64}$/ at the request layer, which matches `__proto__` and
 * `constructor`. On a plain object both are truthy and a lookup followed by a
 * property read walks straight past a truthiness check. Here there is no
 * prototype to inherit from.
 */
export const GATHER_NODES = indexGatherNodes({
  woodcutting: TREES,
  mining: ROCKS,
  fishing: FISH_SPOTS,
});

/**
 * `{ [recipeId]: { skill, recipe } }` over all 290 artisan recipes, and the
 * PAYABLE subset of it.
 *
 * ⚠ TWO INDEXES, AND THE DIFFERENCE IS LOAD-BEARING.
 *
 *   ARTISAN_RECIPES_ALL  every authored recipe. The ENGINE resolves against
 *                        this, so a pointer on an unpayable bench comes back as
 *                        a NAMED refusal (`unpayable_bench`) that DEFERS the
 *                        window, rather than as `unknown_recipe`, which would
 *                        be a lie about content that plainly exists.
 *   ARTISAN_RECIPES      the payable subset. The INTENT's shape check uses
 *                        this, so an unpayable bench is refused BEFORE any
 *                        database work and can therefore never become the
 *                        pointer — which is what stops the refusal above from
 *                        ever being reachable through a player gesture.
 *
 * Both are null-prototype (see `indexArtisanRecipes`), which matters more here
 * than for gather: a truthy miss on a plain object reaches `recipe.inputs` and
 * `recipe.cost`.
 *
 * The payable subset is DERIVED from src/core/artisan-sim.js's
 * `benchPayable` — the same predicate `src/net/activity.js` reads for the
 * client's downgrade — so the three sides cannot disagree about which benches
 * exist tonight.
 */
export const ARTISAN_RECIPES_ALL = indexArtisanRecipes(ARTISAN_RECIPES);
export const ARTISAN_RECIPES_PAYABLE = payableRecipeIndex(ARTISAN_RECIPES_ALL);

/* ════════════════════════════════════════════════════════════════════════
   THE EQUIP CATALOGUE (b366) — the SAME two derivations
   tools/gen-catalogues.mjs makes when it generates `hr_equip_slots` and
   `hr_item_slots`, from the SAME two imports, so the intent's early answer and
   the database's authoritative one cannot disagree about which item fits which
   slot.

   ⚠ THIS IS AN EARLY ANSWER, NOT THE AUTHORITY. `hr_apply`'s equip block
     re-checks `hr_equip_slots` / `hr_item_slots` / `hr_items` / the
     reqSkill+reqLv gate / ownership under a row lock, and it is the thing a
     compromised Edge Function cannot lie to. What this buys is a NAMED refusal
     one round trip earlier — and, more importantly, a refusal that costs the
     player NO idempotency key and NO collect, because the equip verb collects
     the accrual window before it acts (hr_apply stamps `accrued_to` on an
     `equip` delta) and a shape refused here never reaches that collect.

   NULL-PROTOTYPE, and it is the `__proto__` hazard again, not hygiene: an
   equip-slot name off the wire is bounded by a character class that matches
   `constructor`, and `{}.constructor` is truthy. `catalogueGet` is the reader.
   ════════════════════════════════════════════════════════════════════════ */

/** Every equip slot a character HAS, in authored order. Frozen copy. */
export const EQUIP_SLOT_IDS = Object.freeze(EQUIP_SLOTS.slice());

const equipSlotSet = Object.create(null);
for (const s of EQUIP_SLOTS) equipSlotSet[s] = true;
/** `{ [equipSlot]: true }` — the `hr_equip_slots` allowlist, null-prototype. */
export const EQUIP_SLOT_INDEX = Object.freeze(equipSlotSet);

const itemSlotIdx = Object.create(null);
for (const id of Object.keys(ITEMS)) {
  const slots = expandItemSlot(ITEMS[id] && ITEMS[id].slot);
  if (!slots.length) continue;
  const m = Object.create(null);
  for (const s of slots) m[s] = true;
  itemSlotIdx[id] = Object.freeze(m);
}
/** `{ [itemId]: { [equipSlot]: true } }` — the `hr_item_slots` pairs, exactly
    as the generator derives them (including the ring1/ring2 expansion, which is
    imported rather than restated). An item with no `slot` is ABSENT, which is
    what makes "this is not equipment" answerable without a database read. */
export const ITEM_EQUIP_SLOTS = Object.freeze(itemSlotIdx);

/* ════════════════════════════════════════════════════════════════════════
   THE ECONOMY CATALOGUE — prices, derived from src/data, never restated.

   ⚠ THE CLIENT NEVER SENDS A PRICE. It sends an OFFER ID (`equip.iron_sword`)
     or an ITEM ID (`normal_log`) and a COUNT. Everything below is what turns
     one of those names into a number, and it is derived from the SAME
     src/data/shops.js + src/data/items.js the client renders from — which is
     what makes "the server priced it" and "the shop showed that price" one
     fact rather than two that agree today.

   src/data/shops.js is itself GENERATED from the shop tables in legacy.js by
   tools/gen-shops.mjs, and `node tools/gen-shops.mjs --check` is a preflight in
   tests/run-smoke.mjs, mutation-proven by tests/shop-drift-guard.mjs (8
   mutations, each preceded by a green control). So the chain from the table a
   designer edits to the number the server charges has a guard at every hop and
   nothing in this payload is hand-typed.
   ════════════════════════════════════════════════════════════════════════ */

/* ── WHAT `shop_buy` MAY SELL, AND WHY THE PREDICATE IS AN ALLOWLIST ────────
   128 offers are authored. This verb implements exactly one shape — GOLD IN,
   ITEMS OUT — and every other offer is refused BY NAME with the reason
   attached (see OFFER_REFUSALS), never silently.

   THE ELIGIBILITY TEST IS ON THE OFFER'S SHAPE, NOT ON A HAND-LISTED SET OF
   IDS, AND THAT IS THE LOAD-BEARING PART. `SHOP_OFFERS` rows carry optional
   fields that are CONDITIONS — `reqSkill`/`reqLv` (a skill gate), `max` (a
   purchase cap), `period` (a subscription), `authority: 'platform'` (the store
   charges, not us). None of those are implemented here. A predicate written as
   "cost is gold and grants are items" would happily sell a gated offer
   UNGATED the day one is authored; a predicate written as "and the row carries
   no field this verb does not understand" refuses it instead. An offer that
   grows a condition therefore falls OUT of this catalogue by construction —
   the safe direction — and the refusal names the field.

   Excluded for the same reason, structurally rather than by name:
     · every `unlock`/`capacity` grant. Unlocks are `player_progress` rows and
       are deliberately absent from hr_apply's delta allowlist, so a delta
       proposing one is refused `unknown_delta_key`. That is 99 of the 128.
     · every `gems`/`marks`/`hearth_tokens`/`usd` cost. `marks` has no server
       column at all; `usd` is the platform's; gems and hearth tokens are real
       columns but minting/spending them is a separate ruling (see the gold
       grant intent's open question about gems having no daily budget).
     · every non-repeatable offer. "Buy once" needs a purchase record the
       server does not keep, and a cap that is not enforced is not a cap. */
const OFFER_FIELDS_UNDERSTOOD = Object.freeze(['id', 'table', 'name', 'cost', 'grant', 'repeatable']);

const MAX_GRANT_PER_UNIT = 10000;

const isPosInt = (n) => Number.isSafeInteger(n) && n > 0;

/** Why this offer is not `shop_buy`-able, or null if it is. Pure, and it names
    the FIELD or the LINE that disqualified it — a refusal a player can read.

    EXPORTED so tests/gold-intents.mjs can drive it with SYNTHETIC offers. That
    is not test-only convenience: no authored offer today is
    gold-for-an-item-with-a-skill-gate, so the field allowlist below has nothing
    live to reject and would be decoration by C4's standard — unobservable, and
    therefore free to rot until the day it matters, which is the day somebody
    authors exactly that row. Driving it directly is what keeps it a rule. */
export function offerIneligibility(o) {
  if (!o || typeof o !== 'object') return 'not_an_offer';
  for (const k of Object.keys(o)) {
    if (!OFFER_FIELDS_UNDERSTOOD.includes(k)) return `unimplemented_field:${k}`;
  }
  if (!Array.isArray(o.cost) || o.cost.length !== 1) return 'multi_line_cost';
  const c = o.cost[0];
  if (!c || c.kind !== 'currency' || c.id !== 'gold') {
    return `unpayable_cost:${c ? `${c.kind}:${c.id}` : 'none'}`;
  }
  /* A ZERO-GOLD OFFER IS AN INFINITE ITEM FAUCET. `theme.default` is priced at
     0 and grants an unlock; nothing today is 0-gold-for-an-item, and the day
     one is authored it must be a deliberate decision somewhere other than
     here. */
  if (!isPosInt(c.amount)) return 'non_positive_price';
  if (!Array.isArray(o.grant) || o.grant.length === 0) return 'no_grant';
  for (const g of o.grant) {
    if (!g || g.kind !== 'item') return `ungrantable:${g ? g.kind : 'none'}`;
    /* hasOwnProperty, never truthiness — `ITEMS['constructor']` is the Object
       constructor and a truthiness guard admits it. See catalogueGet. */
    if (catalogueGet(ITEMS, g.id) === undefined) return `unknown_item:${g.id}`;
    if (!isPosInt(g.amount) || g.amount > MAX_GRANT_PER_UNIT) return `bad_grant_amount:${g.id}`;
  }
  /* LAST, and the order is the reason a player reads. "We cannot grant that" and
     "we cannot take that currency" are facts about the OFFER; "buy once" is a
     fact about BOOKKEEPING WE DO NOT KEEP, and reporting it in preference to
     the other two would tell somebody their gem-priced cosmetic is a one-off
     purchase rather than that we cannot charge gems at all. */
  if (o.repeatable !== true) return 'not_repeatable';
  return null;
}

const goldOffers = Object.create(null);
const offerRefusals = Object.create(null);
const offerIds = [];
for (const o of SHOP_OFFERS) {
  const id = o && o.id;
  if (typeof id !== 'string') continue;
  offerIds.push(id);
  const why = offerIneligibility(o);
  if (why) { offerRefusals[id] = why; continue; }
  goldOffers[id] = Object.freeze({
    id,
    table: o.table,
    name: o.name,
    /** The whole price of ONE unit, in gold. There is no other number. */
    gold: o.cost[0].amount,
    grant: Object.freeze(o.grant.map((g) => Object.freeze({ id: g.id, amount: g.amount }))),
  });
}

/**
 * Every offer this build can sell for gold: `{ [offerId]: {id, gold, grant} }`.
 *
 * NULL-PROTOTYPE. The offer id shape is bounded but permissive enough to spell
 * `constructor`, and on a plain object that lookup returns a function whose
 * `.gold` is `undefined` — a FREE purchase. There is no prototype here to
 * inherit from, and every reader goes through `catalogueGet` as well.
 */
export const GOLD_OFFERS = Object.freeze(goldOffers);

/** `{ [offerId]: reason }` for every AUTHORED offer this verb cannot sell.
    The distinction against `unknown_offer` is the whole point: a player told
    "unknown offer" about the Hearth Hall subscription files a bug against the
    wrong system. Null-prototype, same reason as above. */
export const OFFER_REFUSALS = Object.freeze(offerRefusals);

/** Every authored offer id, eligible or not. Used only by the guards. */
export const ALL_OFFER_IDS = Object.freeze(offerIds);

/* ── WHAT THE VENDOR BIDS ───────────────────────────────────────────────────
   `vendor.sell` is one of the six DERIVED_PRICES in src/data/shops.js — a
   FORMULA rather than a row, so it is deliberately absent from SHOP_OFFERS and
   the catalogue's own header says so: "DERIVABLE TODAY — needs `raw` added and
   the rate as a constant. This is the cheapest of the six to close."

   It is closed here rather than in SQL because both inputs are already
   vendored: `ITEMS[id].v` (book value) and `ITEMS[id].raw` (is it unprocessed
   material), the latter DERIVED in items.js from every tree/rock/spot/crop
   `prod` plus an explicit monster-drop list. Restating either in PL/pgSQL
   would be the second copy this whole program exists to prevent.

   ⚠ THIS CONSTANT IS THE ONE NUMBER IN THIS FILE THAT IS NOT IMPORTED, because
     the authority for it is `VENDOR_RAW_RATE` in src/legacy.js — a classic
     script that ESM and Deno cannot import, which is exactly why
     src/data/shops.js exists as a generated second copy in the first place.
     tests/gold-intents.mjs reads BOTH the rate and the formula out of
     legacy.js's `vendorPrice()` and fails the build if either moves, so the
     second statement is guarded rather than trusted — the same bargain
     shops.js struck, mutation-proven the same way.

   Why 20%: gathering throughput is roughly flat (~300 items/h at every tier)
   while `v` climbs 2.77x per material tier, so a maxed miner vendoring
   Dawnstone out-earned an entire renown rank every 32 minutes WHILE ASLEEP.
   The rate puts gathering back to being the material faucet and the player
   market back to being the best price for raws. It is a BALANCE number and it
   belongs to the Game Designer; it is mirrored here, never chosen here. */
export const VENDOR_RAW_RATE = 0.20;

/**
 * What the NPC vendor pays for ONE `id`. 0 means "the vendor does not buy it",
 * which is a refusal, not a free sale.
 *
 * @param items  the item catalogue, passed in rather than closed over — the
 *               exploit surface of a pricing function is its inputs, and an
 *               input a reviewer can see in the signature is an input they can
 *               audit. Same rule computeAccrual follows.
 */
export function vendorPriceOf(items, id) {
  const it = catalogueGet(items, id);
  if (!it || typeof it !== 'object') return 0;
  const v = Number(it.v) || 0;
  if (!(v > 0)) return 0;
  /* Floored at 1: a raw worth anything at all is still worth something, and a
     0g bid reads as "this item is broken" rather than "this is cheap". */
  return it.raw ? Math.max(1, Math.floor(v * VENDOR_RAW_RATE)) : v;
}
