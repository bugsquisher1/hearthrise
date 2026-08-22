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

import { TREES, ROCKS, FISH_SPOTS, CROPS } from './gathering.js?v=432';
import { ARTISAN_RECIPES } from './recipes.js?v=432';
import { MONSTERS } from './monsters.js?v=432';
import { BOSSES } from './bosses.js?v=432';

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

/* ── HIRED-WORKER PRODUCTION — THE UNBACKED-OWNABLE-MINT LANDMINE ────────────
   src/features/workers.js `accrueWorker` mints gather products CLIENT-SIDE via
   `window.addItem(act.prod, qty)` — online AND offline — with NO server model.
   A worker can only be ASSIGNED a woodcutting / mining / fishing node
   (workers.js `assign` -> `actFor` reads TREES / ROCKS / FISH_SPOTS), so the set
   of ids a worker can ever mint is EXACTLY the gather-product set — every one of
   which is classified OWNABLE below (a gather `prod` is `modeled`). So on the
   inventory absolute-replace flip, a worker haul the server never settled is
   DELETED. It CANNOT be excluded (that would gut the flip for core materials
   like normal_log / copper_ore / trout, which legit gathering also grants).
   The only correct fix is to make worker production SERVER-OWNED — settled by
   the accrual pass into player_inventory — after which the client stops calling
   addItem for it and this lane leaves the unbacked set.

   ── SHIPPED (worker-settlement slice, 2026-08-25) ──────────────────────────
   Worker production is now server-settled: supabase/functions/hr-accrue
   `accrueWorkers` prices [workers_accrued_to, now()] with NO rng and emits a
   signed item delta + per-worker xp that hr_apply applies into player_inventory /
   player_workers (2026-08-25-workers.sql). The client's accrueWorker no longer
   mints (src/features/workers.js gates on this flag). So this flag flips TRUE in
   the SAME commit that removes the client mint — `unbackedOwnableMintLanes`
   empties, `flipArmBlockers` clears this blocker, and SERVER-OWNED-5 crosses to
   its backed branch. Flipping it without removing the mint would re-open the
   landmine; the SERVER-OWNED-5 backstop fails exactly then.

   ⚠ HISTORY: shipped DORMANT (false) b423, then ARMED true b424 (2026-08-20) —
   PRE-WIPE by Tyler's explicit call, item loss accepted (players warned; Saturday
   wipe is the backstop). Activating makes the client reconcile the crew from the
   server; existing players' client-side crews reconcile to the (empty) server crew
   on next load = expected/accepted. Post-wipe every crew is empty, so no further
   transition. Coupled with INVENTORY_ARM_ENABLED below (both set true together). */
export const WORKER_PRODUCTION_SERVER_BACKED = false;   // REVERTED to dormant b425 — see note below

/* THE INVENTORY-FLIP LIVE-ARM ENABLE (rollout gate, 2026-08-20).
   ⚠⚠ b424 ARMED PRE-WIPE, then b425 REVERTED (2026-08-20) after a LIVE TEST found it
   CATASTROPHIC. THE HARD LESSON: `inventory_complete=true` means "the server's settle
   loop is caught up", NOT "the server bag equals the client bag". Every player built
   their inventory CLIENT-SIDE before the flip, so the server baseline is SPARSE — a
   live check on Tyler's own character: client 36 stacks / 91,168 items vs server 19
   stacks / 37,157 items, with 12 OWNABLE stacks (coal 3974, iron_ore 4000, oak_log
   3960, all three essences 4000 each, water_rune 1247, …) OMITTED by the "complete"
   envelope. An absolute replace would DELETE ~40k+ items of real progress per player.
   The drift readout (inventoryFlipReadiness().destructiveOwnedOmissions / lastLoss)
   flagged exactly this — the "soak" I'd called unmeasurable IS measurable client-side,
   and it screamed. The flip is ONLY safe POST-WIPE (empty server baseline == empty
   client bag, every subsequent item server-settled from scratch). Both flags stay
   FALSE until AFTER the wipe. Do NOT arm pre-wipe again.
   THE ONE FLAG THAT TURNS THE INVENTORY FLIP ON FOR EVERY PLAYER. All the arm
   machinery is built and dormant: markInventoryAuthorityLive throws unless every
   guard is met, and isInventoryAbsolute stays false because nothing in prod calls
   the arm. maybeAutoArm() in src/net/accrue.js is the deliberate, guarded auto-
   arm at boot, but it refuses unless THIS flag is true. Default FALSE: the auto-
   arm is a silent no-op until a rollout commit flips it, so the flip cannot arm
   by accident.

   THIS IS A COUPLED TWO-FLAG ROLLOUT, FLIP BOTH IN THE SAME COMMIT.
   Arming requires workers server-backed (an un-backed OWNABLE mint would be
   DELETED on the flip, see flipArmBlockers/unbackedOwnableMintLanes). So the
   rollout that turns the inventory flip live sets BOTH, together, post-wipe:

       WORKER_PRODUCTION_SERVER_BACKED = true   (this file, above)
       INVENTORY_ARM_ENABLED           = true   (this file, here)

   They are coupled by construction: even if INVENTORY_ARM_ENABLED were flipped
   alone, flipArmBlockers() is non-empty while workers are un-backed, so
   maybeAutoArm refuses and the arm gate throws, the flip physically cannot arm
   until workers are backed too. Flipping WORKER_PRODUCTION_SERVER_BACKED without
   removing the client mint (src/features/workers.js) re-opens the landmine; both
   moves belong in the ONE post-wipe rollout commit, gated on a security pass and
   a coordinator-run drift-soak. Do NOT set either true before the wipe. */
export const INVENTORY_ARM_ENABLED = false;   // REVERTED to dormant b425 — pre-wipe arm was catastrophic (see note above); post-wipe only

/** Every id a hired worker can mint client-side = every gather product (a worker
 *  is only ever assigned a gather node). Kept as its own function, not an alias,
 *  so the "workers mint gather products" fact is stated where the flip reads it
 *  rather than inferred. */
export function workerProductIds() { return gatherProductIds(); }

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

/* ── THE ARM-GATE COMPLETENESS BACKSTOP (security review Finding #2) ─────────
   The inventory absolute-replace flip is only safe when EVERY id it will treat
   as ownable is actually SETTLED by the server. `serverOwnedItem` says which ids
   are ownable; it does NOT say which ownable ids are still being minted by an
   un-server-backed CLIENT path. That second fact is the flip's real
   precondition, and it needs a place that fails LOUD when a new un-backed mint
   of an ownable id is introduced — otherwise the next `window.addItem` of a
   gather/craft/drop id with no server write silently re-opens the landmine this
   whole program closed, and the flip deletes it.

   This is a REGISTRY of known client mint lanes that (a) grant OWNABLE ids and
   (b) are not yet settled by the server. Each entry names the source, the id
   set, and the flag whose flip empties it. `pendingUnbackedOwnableMints()` is
   the arm precondition: the flip MUST NOT arm while it is non-empty. Today it
   holds exactly one lane — hired-worker production — and that is the landmine
   the worker server-authority slice exists to defuse. */
export function unbackedOwnableMintLanes() {
  const lanes = [];
  if (!WORKER_PRODUCTION_SERVER_BACKED) {
    lanes.push({
      source: 'src/features/workers.js accrueWorker -> window.addItem(act.prod)',
      ids: workerProductIds(),
      backedBy: 'WORKER_PRODUCTION_SERVER_BACKED (server accrual settles worker output into player_inventory)',
    });
  }
  return lanes;
}

/** The OWNABLE ids currently minted by a client path with no server settlement —
 *  the flip's arm-blockers. Intersected with the real ownable set so a lane that
 *  only grants excluded/overlap ids (safe under the flip) contributes nothing.
 *  Empty ⇒ no un-backed ownable mint remains ⇒ the flip may arm. */
export function pendingUnbackedOwnableMints() {
  const a = itemAuthority();
  const out = new Set();
  for (const lane of unbackedOwnableMintLanes()) {
    for (const id of lane.ids) if (a.ownable.has(id)) out.add(id);
  }
  return out;
}

/** Human-readable reasons the inventory flip must not arm yet. Empty ⇒ clear.
 *  Consumed by the arm gate (once wired) and by the smoke backstop. */
export function flipArmBlockers() {
  const blockers = [];
  const pend = pendingUnbackedOwnableMints();
  if (pend.size > 0) {
    for (const lane of unbackedOwnableMintLanes()) {
      const owned = [...lane.ids].filter((id) => itemAuthority().ownable.has(id));
      if (owned.length) {
        blockers.push('un-backed OWNABLE mint: ' + lane.source
          + ' grants ' + owned.length + ' ownable id(s) with no server write (backed by '
          + lane.backedBy + ')');
      }
    }
  }
  return blockers;
}

if (typeof window !== 'undefined') {
  window.HearthriseItemAuthority = {
    WORKER_PRODUCTION_SERVER_BACKED, INVENTORY_ARM_ENABLED, workerProductIds,
    unbackedOwnableMintLanes, pendingUnbackedOwnableMints, flipArmBlockers,
    COOKING_SKILL, ARTISAN_SETTLEMENT,
    gatherProductIds, cropProductIds, combatDropIds, artisanOutputIds,
    cookingOutputIds, payableArtisanOutputIds, bossRewardIds, dungeonRewardIds,
    buildItemAuthority, itemAuthority, rebuildItemAuthority,
    serverOwnedItem, classifyItem, unclassifiedGrantIds, unclassifiedArtisanLanes,
  };
}
