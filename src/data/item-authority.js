// ============================================================================
// src/data/item-authority.js — THE SERVER-OWNED-ITEM PREDICATE.
//
// Server-authority inventory-flip program, STEP 2 (the machinery; UNARMED).
//
// ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
// The absolute-inventory branch in src/net/accrue.js (applyEnvelopeState) will,
// once armed, REPLACE the bag with the server's envelope — a named key sets the
// quantity and an OMITTED key is a real zero. That is only safe for an item the
// accrual ENGINE actually settles. Several LIVE actions still write G.inventory
// with NO server model (Step-1 audit): cooked-food outputs, crop harvest,
// companion/pet procs, dungeon rewards. Under an absolute replace the envelope
// omits those (the server never heard of them) and they would be DELETED —
// the one irreversible mistake this whole program exists to avoid.
//
// So this module derives, FROM THE DATA MODULES (never a hand-list, so it cannot
// silently drift as content grows), the set of item-ids the envelope is ALLOWED
// to own — and its complement, the ids the absolute branch must leave the client's
// copy of intact. accrue.js consults `serverOwnedItem(id)` in exactly the shape
// of the existing `itemLedger.reconcile` carve-out.
//
// ── THE PARTITION ───────────────────────────────────────────────────────────
//   OWNABLE  (serverOwnedItem === true): what the engine settles —
//              combat drops (MONSTERS[*].drops) ∪ gather products (TREES/ROCKS/
//              FISH_SPOTS[*].prod) ∪ payable artisan outputs (ARTISAN_RECIPES
//              MINUS cooking) — with the EXCLUDED set removed (see precedence).
//   EXCLUDED (serverOwnedItem === false): what a LIVE, un-modeled path writes —
//              cooking outputs (ARTISAN_RECIPES.cooking) ∪ crop products
//              (CROPS[*].prod) ∪ dungeon rewards (BOSSES[*].signature ∪ the
//              window.DUNGEONS loot tables).
//
// ── EXCLUDED WINS ON OVERLAP, AND THAT IS THE SAFE DIRECTION ─────────────────
// Several ids are granted by BOTH a modeled and an un-modeled path — `wheat` is
// a crop AND a rat drop; `magic_essence` is a monster drop AND dungeon loot. If
// such an id were owned, a legitimately CROP-HARVESTED or DUNGEON-DROPPED copy
// the server has not modelled would be deleted by the absolute replace. So on
// overlap the id is EXCLUDED: the never-delete direction. The cost is that the
// id stays client-forgeable until its un-modeled path is modelled — a residual
// this module reports for the security review, never a data-loss bug.
//
// ── COMPANION / PET PROCS ───────────────────────────────────────────────────
// The proc handler (src/features/companions.js) adds EXTRA QUANTITY to items it
// does not own an id for: `doubleYield` mints a CROP (already excluded → safe),
// `refundIngredients` restores a cook recipe's inputs (the server never modelled
// the cook, so its figure still counts them → the absolute replace over-credits
// rather than deletes → safe), and `doubleDrop` mints one extra of a combat/
// gather drop. That last one is OWNABLE, so an absolute replace drops the ~2-3%
// proc bonus copy. It is bounded, non-forgeable, and cannot be excluded without
// emptying the ownable set of all drops — so it is a FLAGGED residual, not a new
// excluded id. See docs/CONFLICTS handoff.
//
// PURE ESM. No DOM required to import. `window.DUNGEONS` is read lazily and only
// when present, so this loads and answers in Node and before the legacy IIFE.
// ============================================================================

import { TREES, ROCKS, FISH_SPOTS, CROPS } from './gathering.js?v=410';
import { ARTISAN_RECIPES } from './recipes.js?v=410';
import { MONSTERS } from './monsters.js?v=410';
import { BOSSES } from './bosses.js?v=410';

/* ── ARTISAN LANE CLASSIFICATION — THE FAIL-CLOSED SEAM ─────────────────────
   The audit's rule is "payable = ARTISAN_RECIPES minus cooking". A NEW artisan
   lane must not silently inherit "payable" (and thus become absolutely-owned,
   able to DELETE a live-crafted output) just because it is not literally named
   'cooking'. Every lane is classified here explicitly; `assertArtisanLanesClassified`
   fails the guard on a lane this table has never heard of, forcing a human to
   rule payable-or-unmodeled before the flip can trust it. */
export const COOKING_SKILL = 'cooking';
export const ARTISAN_SETTLEMENT = Object.freeze({
  smithing:     'payable',
  crafting:     'payable',
  runecrafting: 'payable',
  stonemason:   'payable',
  prayer:       'payable',   // buries bones for XP; outputs are null → contributes no id
  cooking:      'unmodeled',
});

function addAll(dst, src) { for (const x of src) if (x) dst.add(x); return dst; }

/** Every id produced by a tree/rock/fishing-spot `prod`. */
export function gatherProductIds() {
  const s = new Set();
  for (const node of [].concat(TREES || [], ROCKS || [], FISH_SPOTS || [])) {
    if (node && node.prod) s.add(node.prod);
  }
  return s;
}

/** Every id produced by a crop `prod` (the un-modeled farm-harvest path). */
export function cropProductIds() {
  const s = new Set();
  for (const k of Object.keys(CROPS || {})) {
    const p = CROPS[k] && CROPS[k].prod;
    if (p) s.add(p);
  }
  return s;
}

/** Every id that any monster can drop (the server-settled combat path). */
export function combatDropIds() {
  const s = new Set();
  for (const k of Object.keys(MONSTERS || {})) {
    const drops = MONSTERS[k] && MONSTERS[k].drops;
    if (Array.isArray(drops)) for (const d of drops) if (d && d.id) s.add(d.id);
  }
  return s;
}

/** The output ids of one artisan lane. Rows with `output:null` (prayer) add none. */
export function artisanOutputIds(skill) {
  const s = new Set();
  const rows = (ARTISAN_RECIPES || {})[skill];
  if (Array.isArray(rows)) for (const r of rows) if (r && r.output) s.add(r.output);
  return s;
}

/** Cooking outputs — the un-modeled artisan lane. */
export function cookingOutputIds() { return artisanOutputIds(COOKING_SKILL); }

/** Every output of a lane classified `payable` in ARTISAN_SETTLEMENT. */
export function payableArtisanOutputIds() {
  const s = new Set();
  for (const skill of Object.keys(ARTISAN_RECIPES || {})) {
    if (ARTISAN_SETTLEMENT[skill] !== 'payable') continue;
    addAll(s, artisanOutputIds(skill));
  }
  return s;
}

/** Boss signature ids — the static, ESM-clean half of dungeon rewards. */
export function bossRewardIds() {
  const s = new Set();
  for (const k of Object.keys(BOSSES || {})) {
    const sig = BOSSES[k] && BOSSES[k].signature;
    if (Array.isArray(sig)) for (const id of sig) if (id) s.add(id);
  }
  return s;
}

/** Every dungeon-reward id: boss signatures ∪ the loot tables in `dungeons`
 *  (defaults to the runtime `window.DUNGEONS`, which the legacy IIFE publishes;
 *  absent in Node or pre-boot, in which case only boss signatures contribute). */
export function dungeonRewardIds(dungeons) {
  const s = bossRewardIds();
  const D = dungeons || (typeof globalThis !== 'undefined' ? globalThis.DUNGEONS : null);
  if (D && typeof D === 'object') {
    for (const k of Object.keys(D)) {
      const loot = D[k] && D[k].loot;
      if (Array.isArray(loot)) for (const l of loot) if (l && l.id) s.add(l.id);
    }
  }
  return s;
}

/**
 * Build the ownable/excluded partition. Pure over its inputs; the only ambient
 * read is the optional `window.DUNGEONS` inside dungeonRewardIds.
 */
export function buildItemAuthority(opts) {
  opts = opts || {};

  const excluded = new Set();
  addAll(excluded, cookingOutputIds());
  addAll(excluded, cropProductIds());
  addAll(excluded, dungeonRewardIds(opts.dungeons));

  const modeled = new Set();
  addAll(modeled, combatDropIds());
  addAll(modeled, gatherProductIds());
  addAll(modeled, payableArtisanOutputIds());

  // EXCLUDED wins on overlap — the never-delete direction (see header).
  const ownable = new Set();
  for (const id of modeled) if (!excluded.has(id)) ownable.add(id);

  return { ownable, excluded, modeled };
}

let _cache = null;
let _cacheDungeons = undefined;   // the DUNGEONS ref the cache was built against

/**
 * The cached partition, built on first use.
 *
 * ⚠ LOAD-TIMING ROBUSTNESS. The dungeon-reward exclusion reads window.DUNGEONS,
 * which the legacy IIFE publishes AFTER this module can first be called (a boot
 * device-handoff envelope reaches describeReplacement early). If the cache were
 * built once, before DUNGEONS existed, an OVERLAP id — one that is both a combat
 * drop (modeled) and dungeon loot (un-modeled), e.g. `magic_essence` — would be
 * classified OWNABLE and, once the flip armed, a dungeon-dropped copy the
 * envelope omits could be deleted. So the cache is invalidated the moment the
 * DUNGEONS reference appears or changes: the partition can only ever GROW its
 * excluded set as more grant sources come online, which is the safe direction.
 */
export function itemAuthority() {
  const D = (typeof globalThis !== 'undefined') ? (globalThis.DUNGEONS || null) : null;
  if (!_cache || _cacheDungeons !== D) {
    _cache = buildItemAuthority({ dungeons: D });
    _cacheDungeons = D;
  }
  return _cache;
}

/** Rebuild (tests, or once window.DUNGEONS has loaded). */
export function rebuildItemAuthority(opts) {
  opts = opts || {};
  const D = ('dungeons' in opts) ? opts.dungeons
    : ((typeof globalThis !== 'undefined') ? (globalThis.DUNGEONS || null) : null);
  _cache = buildItemAuthority({ dungeons: D });
  _cacheDungeons = D;
  return _cache;
}

/**
 * THE PREDICATE. Is `id` an item the absolute-inventory envelope is allowed to
 * own — i.e. one the accrual engine settles? False for everything else, which is
 * the safe answer: accrue.js leaves the client's copy of a false id intact.
 */
export function serverOwnedItem(id) {
  if (!id || typeof id !== 'string') return false;
  return itemAuthority().ownable.has(id);
}

/** 'ownable' | 'excluded' | 'unclassified'. */
export function classifyItem(id) {
  const a = itemAuthority();
  if (a.ownable.has(id)) return 'ownable';
  if (a.excluded.has(id)) return 'excluded';
  return 'unclassified';
}

/**
 * COMPLETENESS: every id the DATA grants must land ownable-or-excluded, never in
 * limbo. Returns the grant ids that are unclassified — empty by construction of
 * the partition, so a non-empty return is a real drift signal (a grant source
 * wired into the universe but not into the partition). Pure.
 */
export function unclassifiedGrantIds(opts) {
  opts = opts || {};
  const a = itemAuthority();
  const dungeons = ('dungeons' in opts) ? opts.dungeons : _cacheDungeons;
  const universe = new Set();
  addAll(universe, combatDropIds());
  addAll(universe, gatherProductIds());
  addAll(universe, cropProductIds());
  addAll(universe, dungeonRewardIds(dungeons));
  for (const skill of Object.keys(ARTISAN_RECIPES || {})) addAll(universe, artisanOutputIds(skill));

  const out = [];
  for (const id of universe) {
    if (!a.ownable.has(id) && !a.excluded.has(id)) out.push(id);
  }
  return out;
}

/**
 * FAIL-CLOSED on a new artisan lane. Returns lane ids present in ARTISAN_RECIPES
 * but absent from ARTISAN_SETTLEMENT — a new lane whose settlement nobody has
 * ruled. Empty today; a non-empty return must fail the guard, because an
 * unruled lane would default `payable !== true` (excluded), which is the safe
 * direction but should be a CONSCIOUS decision, not a silent one.
 */
export function unclassifiedArtisanLanes() {
  const out = [];
  for (const skill of Object.keys(ARTISAN_RECIPES || {})) {
    if (!ARTISAN_SETTLEMENT[skill]) out.push(skill);
  }
  return out;
}

if (typeof window !== 'undefined') {
  window.HearthriseItemAuthority = {
    COOKING_SKILL, ARTISAN_SETTLEMENT,
    gatherProductIds, cropProductIds, combatDropIds, artisanOutputIds,
    cookingOutputIds, payableArtisanOutputIds, bossRewardIds, dungeonRewardIds,
    buildItemAuthority, itemAuthority, rebuildItemAuthority,
    serverOwnedItem, classifyItem, unclassifiedGrantIds, unclassifiedArtisanLanes,
  };
}
