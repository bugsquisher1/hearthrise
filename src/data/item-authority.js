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

import { TREES, ROCKS, FISH_SPOTS, CROPS } from './gathering.js?v=533';
import { ARTISAN_RECIPES } from './recipes.js?v=533';
import { MONSTERS } from './monsters.js?v=533';
import { BOSSES } from './bosses.js?v=533';
import { ITEMS } from './items.js?v=533';

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
  stonemason:   'payable',
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

/* ── RAID CHEST MATERIALS — UNBACKED OWNABLE MINT (2026-08-22) ───────────────
   src/features/raids.js `grantReward` mints the raid chest MATERIALS
   (chest.items — boss.reward.items keys) AND the signature spoil (chest.sig)
   CLIENT-SIDE via window.addItem, with NO server write: raid_claim
   (2026-08-11-raid-claim-authority.sql, credit added b412) authorises the claim
   and credits gold/gems into player_state but writes NO player_inventory. Those
   material ids classify OWNABLE (bars/logs/ores) and several signature ids are
   OWNABLE too (verified live: hollow_sigil, abyssal_pearl). So under the inventory
   absolute-replace flip they would be DELETED.

   Unlike the muster chest, the raid chest ITEM CATALOGUE is NOT server-known: the
   material ids come from raids.js BOSSES[*].reward.items — a CLIENT feature file,
   not the pure src/data layer, and the DB's hr_hunt_bosses holds only sig_item,
   hr_hunt_tiers only chest_mats (a count). A correct server mint therefore needs
   a PREREQUISITE: extract the raid boss reward catalogue into src/data and
   generate a DB catalogue (with a drift guard), then extend raid_claim to mint
   from it — the clan_deposit pattern. Until that lands this flag stays FALSE, the
   lane below is an arm-blocker (assumeOwnable), and the flip fails closed. The
   client grantReward addItem is already gated on the inventory record seam, so no
   raid reward is stranded by the gate — the flip simply cannot arm. Flip TRUE only
   in the commit that makes the raid server mint live + verified.

   ── BACKED (2026-08-22, LIVE) ───────────────────────────────────────────────
   The prerequisite landed: the raid boss reward catalogue was extracted to the
   pure data layer (src/data/raid-bosses.js, published as window.RAID_BOSSES) and
   generated into the DB (hr_hunt_boss_reward, tools/gen-raid-boss-rewards.mjs +
   2026-08-22-raid-boss-rewards.generated.sql, drift-guarded in run-smoke). The
   raid_claim RPC now mints the chest MATERIALS + signature into player_inventory
   from that server catalogue — clan AND solo paths — scaled the same way the
   client's chestFor/grantReward did (each = round(chest_mats / n_ids), per-id qty
   = greatest(1, floor(each × scale)); solo = first two materials at qty 1; sig ×1
   when the server's v_sig roll lands), consume-before-credit so a replay never
   double-mints alongside the b412 gold/gems credit, journalled on the SAME 'raid'
   ledger row. Applied + in-tx self-check verified live (2026-08-22-raid-chest-items.sql:
   credit-once, replay-refused, materials land, no double-mint with the gold path,
   net-zero rolled-back probe). So this is TRUE and the raid lane is no longer an
   arm-blocker — unbackedOwnableMintLanes() drops it. The client grantReward addItem
   stays inventory-seam gated (b450): pre-arm it credits locally, post-arm it no-ops
   and the server-minted items arrive via the inventory envelope. */
export const RAID_ITEMS_SERVER_BACKED = true;   // LIVE — 2026-08-22-raid-chest-items.sql applied + verified

/* ── MUSTER ABSENCE CHEST ITEMS — SERVER-BACKED (2026-08-22, LIVE) ───────────
   The muster ONLINE claim (world_event_claim) has written its chest items to
   player_inventory since b422. The ABSENCE / half-honors path
   (world_event_absence_claim) did NOT — it computed the chest and returned
   gold/gems but minted no items server-side, so grantAbsent addItem'd OWNABLE
   theme materials client-side with no server write. 2026-08-22-absence-chest-items.sql
   closes that: the RPC now writes the hr_rally_chest items into player_inventory
   after its once-per-day settle guard, journals a 'rally' ledger row, and returns
   the item list; muster.js grantAbsent renders that list and gates its local
   addItem on the inventory record seam. Applied + self-check verified live
   (credit-once, replay-safe, inventory-survival, grant-hygiene). So this is TRUE
   and the absence path is NOT an arm-blocker. */
export const MUSTER_ABSENCE_ITEMS_SERVER_BACKED = true;   // LIVE — 2026-08-22-absence-chest-items.sql applied + verified

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
  if (!RAID_ITEMS_SERVER_BACKED) {
    /* The raid chest material + signature ids live in src/features/raids.js
       BOSSES[*].reward.items / .sig — a CLIENT feature file, not importable here
       without a DOM. So this lane cannot enumerate its ids from the data layer;
       it is marked assumeOwnable, which makes flipArmBlockers/pendingUnbackedOwnableMints
       treat it as an un-backed OWNABLE mint (fail closed) regardless of the id
       set. Verified live that raid sig ids include OWNABLE members (hollow_sigil,
       abyssal_pearl) and the chest mats are gather/artisan ownables. */
    lanes.push({
      source: 'src/features/raids.js grantReward -> window.addItem(chest.items / chest.sig)',
      ids: new Set(),
      assumeOwnable: true,
      backedBy: 'RAID_ITEMS_SERVER_BACKED (raid_claim mints chest mats/sig into player_inventory; needs the BOSSES reward catalogue extracted to src/data first)',
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
    RAID_ITEMS_SERVER_BACKED, MUSTER_ABSENCE_ITEMS_SERVER_BACKED,
    unbackedOwnableMintLanes, pendingUnbackedOwnableMints, flipArmBlockers,
    COOKING_SKILL, ARTISAN_SETTLEMENT, COOKING_SETTLEMENT_ARM_ENABLED,
    gatherProductIds, cropProductIds, combatDropIds, artisanOutputIds,
    cookingOutputIds, payableArtisanOutputIds, bossRewardIds, dungeonRewardIds,
    serverConsumedIds, serverConsumedItem,
    buildItemAuthority, itemAuthority, rebuildItemAuthority,
    serverOwnedItem, classifyItem, unclassifiedGrantIds, unclassifiedArtisanLanes,
  };
}
