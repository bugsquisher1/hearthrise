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
// None on the client: a companion pays only its passive keys
// (src/core/companion-perk.js), so no companion path mints inventory and there
// is no proc residual for the absolute replace to drop.
//
// PURE ESM. No DOM required to import. `window.DUNGEONS` is read lazily and only
// when present, so this loads and answers in Node and before the legacy IIFE.
// ============================================================================

import { TREES, ROCKS, FISH_SPOTS, CROPS } from './gathering.js?v=0.2.19';
import { ARTISAN_RECIPES } from './recipes.js?v=0.2.19';
import { MONSTERS } from './monsters.js?v=0.2.19';
import { BOSSES } from './bosses.js?v=0.2.19';
import { ITEMS } from './items.js?v=0.2.19';
/* THE GRANT UNIVERSE, WIDENED (security C3). `unclassifiedGrantIds()` used to
   walk only the four ENGINE grant sources, so an id a shop or a quest reward is
   the ONLY source of could sit in limbo — neither ownable nor excluded — and
   nothing failed. Both tables are ESM data, so the completeness check reads them.
   (The Quartermaster, daily-task and raid-chest partitions were deleted with
   their systems in the 2026-10-14 demolition.) */
import { SHOP_OFFERS } from './shops.js?v=0.2.19';
import { QUEST_REWARDS } from './goal-catalogue.js?v=0.2.19';
/* The BURN, from the one module that names it — src/core/artisan.js is the same
   dual-runtime code the edge cooks with, so there is no second copy of the id. */
import { BURNT_ITEM } from '../core/artisan.js?v=0.2.19';

/* ── ARTISAN LANE CLASSIFICATION — THE FAIL-CLOSED SEAM ─────────────────────
   The audit's rule is "payable = ARTISAN_RECIPES minus cooking". A NEW artisan
   lane must not silently inherit "payable" (and thus become absolutely-owned,
   able to DELETE a live-crafted output) just because it is not literally named
   'cooking'. Every lane is classified here explicitly; `assertArtisanLanesClassified`
   fails the guard on a lane this table has never heard of, forcing a human to
   rule payable-or-unmodeled before the flip can trust it. */
export const COOKING_SKILL = 'cooking';

/* ── THE COOKING SETTLEMENT ARM — ARMED (b431 machinery, live) ──────────────
   Cooking was the last un-modeled artisan lane. It became settle-able when its
   only destructive bonus key — `noBurn`, off the Kitchen room rung — became
   server-owned, i.e. when src/net/record.js ROOMS_RECORD_ARM_ENABLED went true.
   This const is the data-layer half and it is TRUE: cooking's classification is
   'payable', which enrols it into payableArtisanSkills() (skill-authority.js) so
   the SERVER cooks the recipe. COUPLED to record.js ROOMS_RECORD_ARM_ENABLED and
   to artisan-sim.js COOKING_SETTLEMENT_ARM_ENABLED (the benchPayable half); a
   drift guard (smoke ROOMS-COOKING-ARM) asserts this equals artisan-sim's twin.

   ⚠ OUTPUT-OWNERSHIP IS DELIBERATELY LEFT EXCLUDED, EVEN THOUGH THIS IS TRUE.
   Cooking OUTPUTS are ITEMS, so absolute ownership of them belongs to the SEPARATE
   inventory flip (INVENTORY_ARM_ENABLED, also true). buildItemAuthority() ALWAYS
   adds cookingOutputIds() to `excluded`, and EXCLUDED WINS on overlap — so
   payableArtisanOutputIds() includes the dishes (harmless) while they STAY out of
   the ownable set, i.e. the inventory absolute-replace can never DELETE a
   live-cooked dish. Owning cooking outputs (removing that unconditional exclusion)
   is a follow-up; the SETTLEMENT is independent of it. */
export const COOKING_SETTLEMENT_ARM_ENABLED = true;   // ARMED (cooking real-fix, supersedes the R4 pause) — twin of artisan-sim.js COOKING_SETTLEMENT_ARM_ENABLED; both TRUE so ARTISAN_SETTLEMENT.cooking='payable' → payableArtisanSkills() includes cooking → serverAccruedSkill('cooking')=true and the server actually settles the cook (consumes raw, produces cooked + server-computed burn, grants cooking XP). The precondition is met: the noBurn Kitchen rung is server-owned end to end (upgradeRoom→hr_unlock_buy write + rooms record arm + hr_perks_of read). ⚠ OUTPUT-OWNERSHIP STAYS EXCLUDED: buildItemAuthority() still adds cookingOutputIds() to `excluded`, and EXCLUDED WINS on overlap — so the dishes are settled/credited by the accrual delta (hr_apply → player_inventory) but stay OUT of the ownable set, i.e. the inventory absolute-replace (INVENTORY_ARM_ENABLED, also LIVE) can never DELETE a live-cooked dish. Owning cooking outputs is a post-inventory-arm follow-up; the SETTLEMENT here is independent and safe. Coupled twin: artisan-sim.js.
export const ARTISAN_SETTLEMENT = Object.freeze({
  smithing:     'payable',
  crafting:     'payable',
  runecrafting: 'payable',
  prayer:       'payable',   // buries bones for XP; outputs are null → contributes no id
  cooking:      COOKING_SETTLEMENT_ARM_ENABLED ? 'payable' : 'unmodeled',
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

   ── SERVER-OWNED SINCE b454 (armed 2026-08-22, 953bd626 — LIVE) ─────────
   Worker production IS server-settled: supabase/functions/hr-accrue
   `accrueWorkers` prices [workers_accrued_to, now()] with NO rng and emits a
   signed item delta + per-worker xp that hr_apply applies into player_inventory /
   player_workers (2026-08-25-workers.sql). The client's accrueWorker no longer
   mints (src/features/workers.js gates on this flag), so this lane is OUT of
   `unbackedOwnableMintLanes` and `flipArmBlockers` is clear for it.

   INVARIANT: this flag is TRUE, and true means "no client mint". Setting it true
   while src/features/workers.js still minted would re-open the landmine above —
   the SERVER-OWNED-5 backstop fails exactly then. (History, for context only:
   shipped inert b423, armed pre-wipe b424, rolled back b425, armed for good in
   the b454 post-wipe cutover.) */
export const WORKER_PRODUCTION_SERVER_BACKED = true;   // LIVE since b454 (2026-08-22 cutover) — worker production is server-settled; the client mints none of it

/* THE INVENTORY-FLIP ARM — LIVE SINCE b454 (armed 2026-08-22, 953bd626).
   THE ONE FLAG THAT TURNS THE INVENTORY ABSOLUTE-REPLACE ON FOR EVERY PLAYER, and
   it is ON. maybeAutoArm() in src/net/accrue.js performs the guarded auto-arm at
   boot (it refuses unless this flag is true); markInventoryAuthorityLive still
   throws unless every guard is met; player_inventory is the only copy of a bag.

   INVARIANT — WHY THIS IS ONLY EVER SAFE POST-WIPE: an absolute replace assumes
   the server baseline IS the bag. `inventory_complete=true` means "the server's
   settle loop is caught up", NOT "the server bag equals the client bag". Armed
   pre-wipe (b424) it cost a live character ~40k items — 12 OWNABLE stacks omitted
   by a "complete" envelope — and b425 rolled it back. Post-wipe the baseline
   starts empty and every item is server-settled from scratch, so the assumption
   holds. Never re-introduce a client-authored bag alongside it.

   COUPLED BY CONSTRUCTION with WORKER_PRODUCTION_SERVER_BACKED above (both TRUE):
   flipArmBlockers() is non-empty while ANY ownable mint lane is un-backed, so the
   flip physically cannot arm while a client still mints an ownable id. Adding a
   new client-side mint of an ownable id re-opens the landmine — make it
   server-settled, or classify it excluded. */
export const INVENTORY_ARM_ENABLED = true;   // LIVE since b454 (2026-08-22 post-wipe cutover) — inventory absolute-replace is on

/* ══════════════════════════════════════════════════════════════════════════
   THE STAGED ARM POSITION — PHASE 2, AND WHY IT HAD TO EXIST (b547)
   ══════════════════════════════════════════════════════════════════════════
   MEASURED, 2026-09-13, reading the code the way the runtime reads it: the flip
   above has been enabled since b454, the server has stamped `inventory_complete`
   since 2026-08-24 (10 of 39 live characters read TRUE at the moment of writing),
   `flipArmBlockers()` is EMPTY, and `maybeAutoArm()` therefore had nothing left
   refusing it. What actually decided whether a player's bag went absolute was
   `isEnvelopeAbsolute()` — i.e. `markEquipAuthorityLive`, which src/net/equip.js
   throws only after the server ACKNOWLEDGES an equip IN THIS SESSION.

   So the flip was neither off nor on: it was ON for a session in which the player
   happened to equip something and OFF otherwise, per player, per reload. Phantom
   ownable stacks left one player's bag and stayed in the next player's. A
   data-deleting authority must never be gated on an unrelated gesture, and a
   rollout position that differs between two players on the same build cannot be
   soaked, staged or rolled back.

   THIS is that position, and it is the ONLY one: a build-level constant, read
   ONCE at boot by src/net/accrue.js, never a residue field (a residue flag would
   be client-authored authority over a delete). 'off' ⇒ `maybeAutoArm` refuses and
   the bag is merge for EVERY player on this build, deterministically. 'on' ⇒ the
   six existing guards decide, as documented above.

   PER ENVIRONMENT: add a hostname to INVENTORY_ARM_STAGE_HOSTS to arm staging
   (or a local origin) while the default stays 'off' for production. The host is
   matched exactly against `location.hostname`; an unknown or absent host falls
   back to the default, which is the fail-safe direction.

   ── ARMED 'on' (2026-10-11) — CLAUDE.md §6, a P1 class-kill ────────────────
   The merge this stage kept alive is the "browser says one thing, server says
   another" class: Tyler's live QA bag showed 33 seeds after a refused +10 buy
   while player_inventory held 23, and NO later envelope could lower it. The
   reasons the stage was held, answered one by one:
     · "it can DELETE a player's item" — it cannot any more. G.inventory is not
       saved anywhere (loadLocal reads no blob, `inventory` is not a residue
       field) and hr_state_of projects the WHOLE of player_inventory. A few
       gestures DO size an intent from it — sell-one, the context menu, the
       quick-sell slider, legacy hasItem — by design: vendor_sell collects the
       open window first, so a just-gathered log is real on the server
       (SELL-SRV-1/5). The server re-checks every quantity under its row lock.
       Replacing the bag can only correct what is DISPLAYED; every real item is
       a row the next envelope restates.
     · "the 24 h soak must read clean" — read SELECT-only on 2026-10-11:
       `inv_flip_drift` 102 sessions since 10-05, 72 with destructiveOwnedOmissions
       > 0 (magnitude 4–10). Under a server that owns every mint, a "destructive
       omission" is the client showing MORE than the server holds — i.e. the
       phantom itself, counted. The soak measured the bug, not a hazard.
     · "pending unsettled gains would vanish" — they are predictions, and
       predictions are display-only: every spend gate reads `G._serverBag` via
       gateItemCount, never G.inventory, and the next envelope replaces
       the display. See accrue.js `bagPrediction` / `gateItemCount`.
     · "a per-session equip acknowledgement decided it" — removed from
       isInventoryAbsolute: the equip verb is server-side, so
       the server's bag already excludes the worn copy.
   Ways back are unchanged: `hr_flags.inventory_absolute = false` (no deploy),
   `localStorage['hr:envelopeMerge'] = 'on'` (one device), or this line. */
export const INVENTORY_ARM_STAGE = 'on';                     // 'on' | 'off' — THE ONE LINE THAT ARMS IT
export const INVENTORY_ARM_STAGE_HOSTS = Object.freeze({});  // { 'localhost': 'on' } — per-environment override

/** Is the absolute-inventory flip STAGED ON for this host? Fail-safe: anything
 *  other than the literal string 'on' reads as off. Pure — the caller reads it
 *  once at boot; nothing here observes time or storage. */
export function inventoryArmStaged(host) {
  const h = (typeof host === 'string' && host)
    ? host
    : ((typeof location !== 'undefined' && location && typeof location.hostname === 'string')
      ? location.hostname : '');
  const perHost = h ? INVENTORY_ARM_STAGE_HOSTS[h] : undefined;
  return (perHost === undefined ? INVENTORY_ARM_STAGE : perHost) === 'on';
}

/* ── THE FARM SERVER-AUTHORITY ARM — LIVE SINCE b454 (2026-08-22, 953bd626) ──
   TRUE: the client does NOT author farm outcomes. plantCrop / waterPlot /
   harvestPlot / plot-tier upgrade send INTENTS to hr_farm_plant / hr_farm_water /
   hr_farm_harvest / hr_farm_upgrade_plot (2026-08-22-server-farming-complete.sql)
   via src/net/farm-sync.js and render the plot state the server returns.
   reconcileFarmResult applies the server's own produce / xp / seed debit ONCE, and
   the local yield roll / addXp / seed removal are SKIPPED — no double credit.

   INVARIANT: this arm is INDEPENDENT of the master accrual switch and of
   INVENTORY_ARM_ENABLED. Farming is a standalone RPC pair, not an accrual kind,
   and crop produce is EXCLUDED from the ownable-inventory set (cropProductIds is a
   documented exclusion) — so the harvest RPC, not the inventory flip, is what
   makes farm produce server-owned. */
export const FARM_SERVER_ARM_ENABLED = true;   // LIVE since b454 (2026-08-22 cutover) — farm gestures are server intents
/* b514 (cleanup slice 4): the OVERRIDE SEAM IS GONE and this is a constant.
   `__setFarmServerArm` existed to drive the pre-cutover client-authoring path,
   and that path no longer exists in any caller — plantCrop / waterPlot /
   waterAllPlots / harvestPlot / upgradePlot have exactly one branch each. A seam
   that can only select a deleted branch is not a kill switch, it is a lie about
   what the client can still do; keeping it would let a test (or a console) claim
   a fall-through that would now simply drop the gesture on the floor.
   The kill-switch position, if it is ever wanted again, is a SERVER one. */
export function isFarmServerArmed() {
  return FARM_SERVER_ARM_ENABLED;
}

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

/* ── SERVER-CONSUMED IDS — THE FOOD THE SERVER EATS ON ITS OWN ──────────────
   THE LIVE BUG THIS CLOSES (b510, QA slot 2, 2026-09-06). `player_inventory`
   held NO food; the away settle receipt said `ate 23 cooked_shrimp`; and the
   client, after a fresh reload, still showed 20 Cooked Shrimp. The knocked-out
   sheet then told the player they "were carrying 20 and never ate one" and
   offered a Rest the server refused with `insufficient_food`.

   WHY THE EXISTING PARTITION CANNOT SEE IT. A cooked dish is deliberately
   EXCLUDED (buildItemAuthority adds cookingOutputIds to `excluded`) so that the
   absolute replace can never DELETE a live-cooked meal. Exclusion is a
   never-lower rule — so the ONE id class the server routinely DEBITS behind the
   player's back (auto-eat, hr_rest) is exactly the class the client can never
   learn has gone. The stale count then survives every envelope forever, because
   both branches take a Math.max.

   THE CLASS, NOT THE ITEM: any item the server may eat, not just shrimp. The
   marker is the SAME one both sides already read — `heals > 0` in the shared
   catalogue (supabase/functions/hr-accrue/eat.js reads `item.heals`;
   src/core/auto-eat.js reads `it.heals`). No second list to drift.

   THE READ IS ONE-WAY AND COMPLETENESS-GATED. accrue.js only believes the
   server's figure for these ids on an envelope the server has certified
   `inventory_complete === true` — which the SQL defines as "no settle window is
   open" — so a mid-cook or mid-fight envelope can never delete a meal that is
   still in flight. See reconcileInventory. */
export function serverConsumedIds() {
  const s = new Set();
  const catalogue = ITEMS || {};
  for (const id of Object.keys(catalogue)) {
    const it = catalogue[id];
    if (it && Number(it.heals) > 0) s.add(id);
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

/** Every ITEM a shop offer GRANTS (kind:'item'); currency/unlock/capacity grants
 *  are not bag ids and contribute nothing. */
export function shopGrantIds() {
  const s = new Set();
  for (const offer of SHOP_OFFERS || []) {
    const grants = (offer && offer.grant) || [];
    for (const g of grants) if (g && g.kind === 'item' && g.id) s.add(g.id);
  }
  return s;
}

/** Every ITEM a quest pays out. */
export function goalRewardIds() {
  const s = new Set();
  for (const k of Object.keys(QUEST_REWARDS || {})) {
    const items = QUEST_REWARDS[k] && QUEST_REWARDS[k].items;
    if (items) for (const id of Object.keys(items)) if (id) s.add(id);
  }
  return s;
}

/** Every SEED id in the crop catalogue — the plantable half of farming. */
export function seedIds() {
  const s = new Set();
  for (const k of Object.keys(CROPS || {})) {
    const seed = CROPS[k] && CROPS[k].seed;
    if (seed) s.add(seed);
  }
  return s;
}

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
  /* THE BURN IS A COOKING OUTPUT (security C2 classification). `burnt_food` is
     what src/core/artisan.js produces when a cook fails, so it is minted by the
     attended client tick exactly as a dish is, and belongs to the same EXCLUDED
     class for exactly the same reason. It was neither ownable nor excluded —
     limbo — and 11 live slots hold 206 of them. */
  excluded.add(BURNT_ITEM);

  const modeled = new Set();
  addAll(modeled, combatDropIds());
  addAll(modeled, gatherProductIds());
  addAll(modeled, payableArtisanOutputIds());
  /* ── SEEDS ARE SERVER-MODELLED (security C2 classification) ────────────────
     A seed is DEBITED by hr_farm_plant and CREDITED only by server verbs — the
     goal-claim RPC, the shop/unlock buy, the market. The client mints none:
     the four sites that used to addItem a reward behind a constant-true gate now
     ask `clientMayWrite('inventory')`, which answers NO under the flip (see
     record.js). Leaving seeds unclassified is what kept the phantom-seed class
     alive: an unclassified id is never lowered and never removed, and a spent
     stack DELETES its row, so the envelope omits it and `max(5, omitted)` = 5
     forever. Owning them is what lets the omission mean zero. */
  addAll(modeled, seedIds());

  /* ── SHOP-ONLY IDS ARE EXCLUDED (security C3) ─────────────────────────────
     THE BLUEPRINT-LOSS SHAPE, generalised and closed by construction. An id
     whose ONLY grant source is a counter is never produced by the accrual
     engine, so a complete envelope that has not yet been told about the
     purchase omits it, and an armed absolute replace would delete a thing the
     player paid for. Computed as shop MINUS `modeled`, so an id a shop merely
     RESELLS (an ore, a bar) keeps the class its engine source gives it. */
  for (const id of shopGrantIds()) if (!modeled.has(id)) excluded.add(id);

  // EXCLUDED wins on overlap — the never-delete direction (see header).
  const ownable = new Set();
  for (const id of modeled) if (!excluded.has(id)) ownable.add(id);

  /* ── THE CONSUMED SET IS NARROWED BY THE FARM ─────────────────────────────
     A raw crop heals, so `serverConsumedIds()` names all nine of them. But a
     crop's MINT path is the farm harvest, which is a SEPARATE server-authority
     program with its own arm (`isFarmServerArmed`) — and letting a complete
     envelope zero a crop would put an entire harvest at the mercy of that
     program being finished, which is not a bet the phantom-food fix needs to
     take. Crops are therefore left on the never-lower rule exactly as today.
     KNOWN LIMITATION, stated rather than hidden: a player whose auto-eat nominee
     is a RAW CROP can still see a stale count until the farm arm lands, at which
     point the crop becomes ownable and the absolute branch covers it anyway.
     Cooked dishes — the reported class, and 28 of the 45 provisions — are
     covered here; raw fish are gather products and were already OWNABLE. */
  const consumed = new Set();
  const crops = cropProductIds();
  for (const id of serverConsumedIds()) if (!crops.has(id)) consumed.add(id);

  return { ownable, excluded, modeled, consumed };
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

/**
 * Is `id` an item the SERVER consumes on its own behalf (a healing provision)?
 * Distinct from `serverOwnedItem`: ownership decides who may CREATE the stack,
 * this decides whether a shrinking figure is believable. A dish is EXCLUDED from
 * ownership (never deleted by an incomplete baseline) and still consumed, which
 * is precisely why the two predicates cannot be the same set.
 */
export function serverConsumedItem(id) {
  if (!id || typeof id !== 'string') return false;
  return itemAuthority().consumed.has(id);
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
  /* …and every NON-ENGINE grant source (security C3): shop stock, quest
     payouts and the seeds themselves. A new row in any of those tables now has
     to be ruled, not discovered live. */
  addAll(universe, shopGrantIds());
  addAll(universe, goalRewardIds());
  addAll(universe, seedIds());

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
    if (lane.assumeOwnable) { out.add('@' + lane.source); continue; }
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
      if (lane.assumeOwnable) {
        blockers.push('un-backed OWNABLE mint: ' + lane.source
          + ' grants OWNABLE id(s) whose set is not enumerable from the data layer '
          + '(assumeOwnable) with no server write (backed by ' + lane.backedBy + ')');
        continue;
      }
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
    INVENTORY_ARM_STAGE, INVENTORY_ARM_STAGE_HOSTS, inventoryArmStaged,
    unbackedOwnableMintLanes, pendingUnbackedOwnableMints, flipArmBlockers,
    COOKING_SKILL, ARTISAN_SETTLEMENT, COOKING_SETTLEMENT_ARM_ENABLED,
    gatherProductIds, cropProductIds, combatDropIds, artisanOutputIds, seedIds,
    shopGrantIds, goalRewardIds,
    cookingOutputIds, payableArtisanOutputIds, bossRewardIds, dungeonRewardIds,
    serverConsumedIds, serverConsumedItem,
    buildItemAuthority, itemAuthority, rebuildItemAuthority,
    serverOwnedItem, classifyItem, unclassifiedGrantIds, unclassifiedArtisanLanes,
  };
}
