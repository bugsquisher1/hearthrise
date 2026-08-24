// Hearthrise — ES module entry point
//
// Boot architecture (post Phase-3 monolith retirement):
//   index.html  → loads src/styles/legacy.css   (extracted from monolith)
//                → loads src/legacy.js           (classic <script>, all engine
//                                                 globals + body fns; will
//                                                 progressively shrink as
//                                                 chunks move into proper
//                                                 ESM modules under src/)
//                → loads this file as a module  (deferred — runs after
//                                                 legacy.js has set globals)
//
// What this module does:
//   1. Imports modern data modules (src/data/*) and assigns them on window —
//      these are the source of truth and override anything legacy.js may have
//      defined for the same identifiers.
//   2. Imports the network adapters (events / sync / auth).
//   3. Imports feature modules (src/features/*) and calls their setup(),
//      which wraps the legacy engine fns to register modern renderers.
//
// Long-term: peel the engine out of legacy.js into src/engine/* modules,
// peel each feature into src/features/*, until legacy.js is empty and can
// be deleted.

// 1. Data — single source of truth
import { SKILLS_DEF } from './data/skills.js?v=465';
import { MONSTERS } from './data/monsters.js?v=465';
import { MONSTER_CLASSES, MONSTER_CLASS_ORDER, resolveMonsterProfile, auditRoster, TIER_BANDS } from './data/monster-classes.js?v=465';
import { wiredIconMap, EXPECTED as MONSTER_ART_EXPECTED, pendingArt } from './data/monster-art.js?v=465';
import * as ItemArt from './data/item-art.js?v=465';
import { ITEMS, foodClassOf, isAutoEatable, foodKindOf, FOOD_KIND_META } from './data/items.js?v=465';
import { TREES, ROCKS, FISH_SPOTS, CROPS, EQUIP_SLOTS, EQUIP_SLOT_META } from './data/gathering.js?v=465';
import { ARTISAN_RECIPES, ARTISAN_CATEGORIES, recipeCategory, categorizeRecipes, isCastleGood } from './data/recipes.js?v=465';
// b348 — the generated progression lanes, published so the suite can grade the
// LIVE recipe table against the ladder the generator actually laid down (a
// hand-authored recipe wins the merge, so the two can disagree; see gear-tiers).
import { GEAR_LADDERS, MATERIAL_TIERS } from './data/gear-tiers.js?v=465';
import { COMPANIONS } from './data/companions.js?v=465';
import { RAID_BOSSES } from './data/raid-bosses.js?v=465';
/* b356 — the review-book catalogue's two published seams. `EFFECT_KINDS` is
   what the reachability guard reads to decide whether an item is legitimately
   not-yet-obtainable; `LIB2_ICON_FILES` is the art batch's work order. Both are
   plain data with no legacy twin, so no unify is needed. */
import { EFFECT_KINDS, PENDING_SYSTEMS, effectsAreLive, dormantEffects } from './data/item-effects.js?v=465';
import { LIB2_ICON_FILES } from './data/library2-items.js?v=465';
import { BOSSES, BOSS_BY_DUNGEON } from './data/bosses.js?v=465';
/* b349 — CLAIMABLE REWARDS. The daily-login cycle used to be a literal inside
   src/features/daily-reward.js, a classic <script> that neither Deno nor Node
   can import, so the server could not read the numbers it is about to be
   responsible for paying. It is authored here now and this is its ONLY
   publication point — daily-reward.js reads `window.HearthriseRewards` at call
   time and fails loud if it is absent, rather than carrying a fallback copy. */
import {
  DAILY_LOGIN_CYCLE, DAILY_LOGIN_CYCLE_DAYS, DAILY_LOGIN_WEEK_BONUS,
  DAILY_LOGIN_MAX_WEEK_MULT, CLAIMABLES, claimableFor, claimableId,
  priceDailyLogin,
} from './data/rewards.js?v=465';

// b215: MERGE the ESM data into legacy.js's lexical objects rather than just
// shadowing them on window.
//
// Why: legacy.js declares `const ITEMS = {...}` at classic-script top level.
// That's a lexical global binding, and it *shadows* `window.ITEMS` for every
// bare `ITEMS[...]` reference inside that 10k-line file. Plain
// `Object.assign(window, { ITEMS })` therefore published the ESM data to
// feature modules while the entire engine kept reading its own stale inline
// copy — two live datasets that drifted apart silently.
//
// Merging in place (same object identity) means legacy's `ITEMS`, this
// module's `ITEMS`, and `window.ITEMS` are all one object. Content is authored
// once, in src/data/*.js, and every consumer sees it.
//
// Merge direction is ESM-wins-per-key, and legacy-only keys survive — so a
// value defined only in legacy.js no longer becomes `undefined` downstream.
const LEGACY = window.__LEGACY_INLINE || {};

function unifyObject(name, esmObj) {
  const legacyObj = LEGACY[name];
  if (!legacyObj || typeof legacyObj !== 'object' || Array.isArray(legacyObj)) return esmObj;
  Object.assign(legacyObj, esmObj);      // ESM values win; legacy-only keys kept
  return legacyObj;                       // one shared identity
}
function unifyArray(name, esmArr) {
  const legacyArr = LEGACY[name];
  if (!Array.isArray(legacyArr) || !Array.isArray(esmArr)) return esmArr;
  legacyArr.length = 0;                   // mutate in place — the const still points here
  esmArr.forEach((entry) => legacyArr.push(entry));
  return legacyArr;
}

/* b356 — the monster taxonomy + portrait manifest.
   `_monsterIcon` is seeded from `src/data/monster-art.js` rather than from a
   literal in legacy.js. It is filtered to portraits that ACTUALLY EXIST, so
   the 80 monsters still awaiting art fall through to the glyph atlas instead
   of requesting a 404. legacy.js's applyLocalIcons() IIFE runs before this
   module and now contributes no monster entries, so there is no race and no
   second opinion about a path. */
window.HearthriseMonsterClasses = {
  CLASSES: MONSTER_CLASSES, ORDER: MONSTER_CLASS_ORDER,
  profileOf: resolveMonsterProfile, audit: auditRoster,
  /* b362: the measured progression curve, published so a guard can check ONE
     row against its band without re-auditing a whole fixture roster. */
  TIER_BANDS,
};
window.HearthriseMonsterArt = { expected: MONSTER_ART_EXPECTED, pending: pendingArt };
window._monsterIcon = Object.assign(window._monsterIcon || {}, wiredIconMap());

/* b358 — the Hearthfire ITEM art manifest, same shape as the monster one.
   Applied through the applier legacy.js exposes rather than by writing
   `_itemPath` directly, because the map must land in legacy's own
   `LOCAL_ITEM_ICON` closure: `__mapGeneratedGearIcons()` re-runs at the icon-
   readiness edge below and only skips ids IT can see there. Writing
   `_itemPath` alone would let a generic tier silhouette overwrite a real
   painting. It must therefore stay ABOVE that edge (b371 moved the re-run off
   a 1500 ms timer; this ordering is what the b358 smoke guard asserts). */
window.HearthriseItemArt = ItemArt;
window.__hearthfireItemsWired = (window.__applyHearthfireItemIcons || (() => 0))(ItemArt.wiredIconMap());

Object.assign(window, {
  SKILLS_DEF:      unifyObject('SKILLS_DEF', SKILLS_DEF),
  MONSTERS:        unifyObject('MONSTERS', MONSTERS),
  ITEMS:           unifyObject('ITEMS', ITEMS),
  CROPS:           unifyObject('CROPS', CROPS),
  EQUIP_SLOT_META: unifyObject('EQUIP_SLOT_META', EQUIP_SLOT_META),
  TREES:           unifyArray('TREES', TREES),
  ROCKS:           unifyArray('ROCKS', ROCKS),
  FISH_SPOTS:      unifyArray('FISH_SPOTS', FISH_SPOTS),
  EQUIP_SLOTS:     unifyArray('EQUIP_SLOTS', EQUIP_SLOTS),
  ARTISAN_RECIPES, COMPANIONS,
  // b356 — see src/data/item-effects.js for what these guard.
  HearthriseItemEffects: { EFFECT_KINDS, PENDING_SYSTEMS, effectsAreLive, dormantEffects, LIB2_ICON_FILES },
  // b281 — the canonical data-driven boss registry (data/bosses.js). A new global
  // object, so no merge needed; surfaces read boss identity/weakness/mechanic by id.
  BOSSES, BOSS_BY_DUNGEON,
  // The weekly Hunt (raid) boss registry — single source for src/features/raids.js
  // (which reads window.RAID_BOSSES lazily), the inventory-authority partition and
  // the server-mint catalogue generator (tools/gen-raid-boss-rewards.mjs).
  RAID_BOSSES,
  // b220 — artisan taxonomy + food classification, published for the classic
  // scripts (legacy.js renderer, features/auto-actions.js) that cannot import.
  ARTISAN_CATEGORIES, recipeCategory, categorizeRecipes, foodClassOf, isAutoEatable,
  // b224 — the presentation twin of foodClassOf, so the item modal, the combat
  // picker and the hover tooltip all name a food the same way.
  foodKindOf, FOOD_KIND_META,
  // b222 — the Castle Stores predicate, shared by the artisan lane and (once
  // the Clan Seat migration is applied) the Storehouse deposit filter.
  isCastleGood,
  // b348 — the progression spine, readable by the guard that keeps the two
  // recipe authorities (generated curve vs hand-authored row) in order.
  GEAR_LADDERS, MATERIAL_TIERS,
});

/* b420 — FINITE-PERENNIAL regrow limits (design ruling: a perennial deplete-s).
   Tomato/Emberfruit `regrows:true` used to yield FREE food FOREVER off one
   seed while permanently locking the plot — a player filed it as a bug. A
   perennial should give a bounded burst (one seed = `regrowLimit`+1 harvests),
   then wither and clear the plot. `harvestPlot` enforces this off `regrowLimit`.

   This lives as a CLIENT-SIDE overlay rather than in src/data/gathering.js on
   purpose: farming is client-authoritative today (its server RPCs are unwired)
   AND gathering.js is packed byte-for-byte into the hr-accrue edge function, so
   editing it there would force an edge redeploy the ruling explicitly avoids.
   `window.CROPS` is the ONE shared crop identity (harvestPlot, the farm render,
   the seed picker and the smoke suite all read it), so patching it here reaches
   every consumer. When farming goes server-authoritative, fold `regrowLimit`
   into gathering.js + the hr_crops catalogue and delete this block. */
(function applyPerennialLimits(){
  const LIMITS = { tomato: 4, emberfruit: 4 };
  const C = window.CROPS || {};
  for (const id in LIMITS) {
    if (C[id] && C[id].regrows) C[id].regrowLimit = LIMITS[id];
  }
})();

/* b371 — THE ICON-READINESS EDGE (see the long block at `__hrIconsReady` in
   src/legacy.js). This is the earliest instant at which the icon picture is
   COMPLETE: the Hearthfire manifest is applied above, and `ITEMS` has just
   been unified, which is what the generated-gear pass needs in order to find
   anything. Calling it HERE rather than on a 1500 ms timer is the whole fix
   for the audit's F13 flicker — the engine may already have painted a screen
   against the 109-entry map legacy.js could see while it loaded, and this is
   the signal that tells it to repaint. Idempotent and one-shot; legacy keeps a
   1500 ms fallback for the case where this module never executes at all. */
window.__hrIconsReady?.();

/* b349 — the claimable-reward tables, published for the classic scripts that
   cannot import (src/features/daily-reward.js). A NAMESPACE rather than seven
   loose globals: these are read by exactly one consumer today and by the
   server's `claim_reward` intent tomorrow, and a namespace is what makes
   "is the data wired?" a single, testable question. */
window.HearthriseRewards = Object.freeze({
  DAILY_LOGIN_CYCLE, DAILY_LOGIN_CYCLE_DAYS, DAILY_LOGIN_WEEK_BONUS,
  DAILY_LOGIN_MAX_WEEK_MULT, CLAIMABLES,
  claimableFor, claimableId, priceDailyLogin,
});

// 2. Network — auto-boots in offline mode, ready to upgrade to Supabase later.
//    The bootstrap module reads stored credentials from localStorage and
//    auto-wires auth + sync + realtime backends if found. Until the player
//    enters Supabase URL/anonKey via Settings → Account, everything stays
//    in offline mode and no network requests are made.
import './net/events.js?v=465';
import './net/sync.js?v=465';
// b337 — server-authoritative away time. Imported BEFORE auth.js because
// enableLiveSync() calls configureAccrual() with the same credentials it hands
// sync.js, so there is one source of the url/key/token and no second copy to
// drift. Ships DARK: the kill switch defaults OFF and processOffline() is
// byte-for-byte b336 behaviour until it is turned on.
import './net/accrue.js?v=465';
// b338 — the character-creation intent. AFTER accrue.js (it imports the kill
// switch from it) and BEFORE auth.js, which configures both with the same
// credentials. Ships DARK behind the SAME switch as b337.
import './net/character.js?v=465';
// b372 — the Quartermaster trade ledger's classic-script door. AFTER accrue.js,
// which applies the ledger inside applyEnvelopeState; this module only opens
// `window.__recordItemTrade` for src/dungeons.js. Loading it late would mean a
// purchase made in the first moments after boot is not recorded, so it sits
// with the other net modules rather than behind a feature gate.
import './net/dungeon-purchase.js?v=465';
// The RECORD seam. AFTER accrue.js (it imports the same kill switch and the
// same slot resolver) and BEFORE auth.js, which configures all three with one
// copy of the credentials. Ships DARK behind the SAME switch as b337/b338.
// It must load whenever accrue.js does: legacy.js's load-strip fails LOUD if
// the switch is on and this module is absent, rather than silently reading a
// moved field back out of the save blob. B340-7 asserts the pairing.
// b455 — the DISPLAY-PREDICTION scratch layer. Imported HERE, explicitly, even
// though record.js / balance.js / skill-record.js each import it themselves: it
// publishes `window.HearthrisePredict`, legacy.js reaches it through that name,
// and a reader of this file should be able to see where that global comes from
// rather than discovering it three modules down. Dependency-free and stateless
// (the scratch bag lives on G), so its position here is documentation, not
// ordering — but the ordering is right anyway: it must exist before the record
// seam retires anything.
import './net/predict.js?v=465';
import './net/record.js?v=465';
// The READ side of a server-owned balance. AFTER record.js, which it imports:
// once `gold`/`gems` are on SERVER_OF_RECORD, `recordValue` is the only thing
// entitled to say a balance is known, and this module is the single accessor
// every display and every affordability check in the client goes through so
// that UNKNOWN renders as a pending state instead of crashing (the measurement
// that held the flip back — see the b353 block in src/net/record.js).
// It is NOT behind the kill switch: it is a read shape, correct in both
// positions, and today it answers exactly what the raw read answered.
import './net/balance.js?v=465';
// b429 — the READ side of server-owned SKILL XP, the analogue of balance.js for
// the `skills` record entry (shipped DORMANT in record.js behind
// SKILLS_RECORD_ARM_ENABLED). A no-op today: `skills` is not on the active
// registry, so skillXpOf falls through to G.skills and answers the raw read
// byte-for-byte. Once armed, it is the ONE accessor that reads skill xp from the
// server map and fail-closes on UNKNOWN. NOT behind the master kill switch — a
// read shape, correct in both positions.
import './net/skill-record.js?v=465';
// The read side of server-owned BOUNTY MARKS (dormant). Same shape as
// skill-record.js: publishes window.HearthriseMarks; a no-op until the arm flips.
import './net/marks-record.js?v=465';
// The read side of server-owned HOUSE ROOMS (dormant). Same shape as
// skill-record.js but the fail-closed value is a SAFE EMPTY MAP (not UNKNOWN),
// because every room read iterates and a null/undefined there crashes boot.
// Publishes window.HearthriseRooms; a no-op until ROOMS_RECORD_ARM_ENABLED flips.
import './net/rooms-record.js?v=465';
// The read side of server-owned RESTED XP (dormant, b437). Publishes
// window.HearthriseRested (restedOf/restedCharges) so the rested display + the
// bank read the server's value under arm and fail-closed to 0 while UNKNOWN.
// A no-op until RESTED_RECORD_ARM_ENABLED flips. (Was authored in b437 but never
// imported — the accessor was dead at runtime until b445 wired it here.)
import './net/rested-record.js?v=465';
// The read side of server-owned EQUIPMENT (dormant, b446). Same shape as
// rooms-record.js — the fail-closed value is a SAFE EMPTY MAP (not UNKNOWN),
// because every equipment read iterates/indexes and a null/undefined there
// crashes boot/combat (the gold-toLocaleString / rooms-Object.values class of
// lockout). Publishes window.HearthriseEquipRead (equipmentMap/equippedItem);
// a no-op until EQUIPMENT_RECORD_ARM_ENABLED flips. This is the READ side —
// distinct from window.HearthriseEquip (equip.js), which is the equip INTENT
// transport (the WRITE side).
import './net/equipment-record.js?v=465';
// b347 — the ACTIVITY intent (`set_activity`). AFTER accrue.js: it imports the
// same kill switch, the same slot resolver, the same endpoint derivation AND the
// envelope/receipt writers, so the switch verb and the accrue verb cannot form
// two ideas of what the server's answer means. BEFORE auth.js, which configures
// all four with one copy of the credentials. Ships DARK behind the SAME switch.
import './net/activity.js?v=465';
// b354 — the three ECONOMY verbs (`shop_buy`, `vendor_sell`, `claim_reward`).
// AFTER accrue.js for the same reason as every seam before it: it imports the
// same kill switch, the same slot resolver, the same endpoint derivation and
// the same envelope writer, so a purchase and an away grant cannot form two
// ideas of what the server's answer means. BEFORE auth.js, which configures all
// five with one copy of the credentials. Ships DARK behind the SAME switch.
//
// It must load whenever legacy.js's `goldSettle` can be reached with the switch
// on: that helper THROWS rather than paying a client-authored number when this
// module is absent, exactly as the b340 record strip does.
import './net/gold.js?v=465';
// FARM SERVER-AUTHORITY (b435 RPCs) — the CLIENT transport for the four farm
// gestures (plant/water/harvest/upgrade-plot). Publishes window.HearthriseFarmSync
// so legacy.js can route the gestures to hr_farm_* under isFarmServerArmed().
// Ships DORMANT: FARM_SERVER_ARM_ENABLED (item-authority.js) is false, so the
// legacy farm writers run byte-for-byte as today and nothing here is called.
// Importing it does NOT arm anything — it only makes the transport available.
import './net/farm-sync.js?v=465';
// b366 — the EQUIP intent (`equip`), Phase 2 of docs/design/live-settlement.md.
// AFTER accrue.js, and for a reason stronger than the shared kill switch this
// time: loading it is what makes `markEquipAuthorityLive` REACHABLE, and that
// registration is the single condition `isEnvelopeAbsolute()` reads. It ships
// DISARMED — the flip arms only when whoever owns the equip gesture calls
// `configureEquip({..., gestureWired: true})`, i.e. when the player's equip
// actually routes to the server instead of mutating G.equipment locally.
// Importing it here does NOT arm it; it only makes the transport available.
// Read the block above `equipAuthorityLive` in net/accrue.js before changing
// either half — arming without the gesture reopens the b362 dupe at settle
// cadence, which is worse than the merge it replaces.
import './net/equip.js?v=465';
// ELEMENTS v1 — the enchant intent (bind an element rune to the weapon slot).
// equip.js's sibling; imported eagerly so window.HearthriseEnchant exists for
// the gear-doll affordance and the smoke suite. Sends only a slot + a rune
// name; the server authors state.enchant.weapon. No flip of its own — it reuses
// the equip transport's config (same hr-accrue endpoint) via wireServerEnchant.
import './net/enchant.js?v=465';
// b361 — YOUR OWN TRADE LEDGER. A pure reader over rows the player can already
// SELECT under market-v2's existing `own sales readable` policy; it authors
// nothing and no payment path consults it. Imported EAGERLY (not lazily, the
// way the Supabase market backend is) because its pure half — the away
// summary's "2 listings sold · +340 gold" line and the panel's arithmetic —
// must exist in a build that was never signed in, including the smoke harness.
// It reaches for the backend through `window` at call time, so no Supabase
// build is a hard dependency.
import './net/market-history.js?v=465';
import './net/auth.js?v=465';
import './net/supabase-bootstrap.js?v=465';
// b333 — tells a LIVE tab that a new build shipped. An idle game is played with
// a tab open for days, so "the fix ships" and "the fix arrives" are different
// events; without this, every client-side fix reaches only the players who
// happen to reload. Never reloads without consent; escalates into the b331
// sign-in-expired sheet when sync has died, because there a stale build is the
// difference between saving and not saving.
import './net/build-watch.js?v=465';

// 2.5 Utilities — shared helpers + boot-time integrity checks. Importing
// these for side effects:
//   • exposes window.HearthriseDom / HearthriseSafe / HearthriseConfig /
//     HearthriseIdentity for classic-script modules to consume,
//   • runs the ITEMS-divergence check ~1.5s after boot.
import './config.js?v=465';
import './utils/dom.js?v=465';
import './utils/safe.js?v=465';
import './utils/profile.js?v=465';
import './utils/data-integrity.js?v=465';
import './utils/image-fallback.js?v=465';

// 3. Feature modules — each registers itself on setup()
import { setupSmokeTest } from './features/smoke-test.js?v=465';
import { setupCompanions } from './features/companions.js?v=465';
import { setupActivitiesGrid } from './features/activities-grid.js?v=465';
import { setupCharacterPage } from './features/character-page.js?v=465';
import { setupCombatRender } from './features/combat-render.js?v=465';
import { setupCombatScreens } from './features/combat-screens.js?v=465';
import { setupRecipeBook } from './features/recipe-book.js?v=465';
import { setupItemIndex } from './features/item-index.js?v=465';

// Boot diagnostics
const counts = {
  skills: Object.keys(SKILLS_DEF).length,
  monsters: Object.keys(MONSTERS).length,
  items: Object.keys(ITEMS).length,
  trees: TREES.length,
  rocks: ROCKS.length,
  fish: FISH_SPOTS.length,
  crops: Object.keys(CROPS).length,
  recipes: Object.values(ARTISAN_RECIPES).reduce((n, arr) => n + arr.length, 0),
  companions: Object.keys(COMPANIONS).length,
};

console.log('[Hearthrise ESM] Data loaded:', counts);
window.__esmBoot = { counts, ts: Date.now(), modules: ['smoke-test', 'companions', 'activities-grid', 'character-page', 'combat-render', 'auth', 'sync'] };

// 4. Wait for engine to be available, then run feature setups
function tryBootFeatures() {
  if (typeof window.G === 'undefined' || typeof window.showTab !== 'function') {
    return false;
  }
  /* b229: isolate each setup. These ran bare in sequence, so a throw in an
     earlier one (a boot-order race on a slow device) silently skipped every
     setup after it — most visibly setupCharacterPage(), leaving the Character
     screen stuck on the dead legacy renderer (fake "Your Heroes" slots that
     overflow on mobile). Each is independent; one failing must not cost the
     others. */
  const boot = (name, fn) => { try { fn(); } catch (e) { console.error('[ESM boot] ' + name + ' failed', e); } };
  boot('smoke-test', setupSmokeTest);
  boot('companions', setupCompanions);
  boot('activities-grid', setupActivitiesGrid);
  boot('character-page', setupCharacterPage);
  boot('combat-render', setupCombatRender);
  /* AFTER combat-render, which installs HearthriseCombatHud — the Fight screen
     reads the HUD's forecast and hands it the two action mounts. */
  boot('combat-screens', setupCombatScreens);
  boot('recipe-book', setupRecipeBook);
  boot('item-index', setupItemIndex);
  /* b228: setupCompanions() wraps window.getBonus, and it is the LAST wrapper
     any boot path installs. Hand the per-key power budget back the outermost
     position immediately rather than waiting for its 1s watchdog — otherwise
     there is a window in which a pet's bonus is added outside the clamp. */
  try { window.HearthrisePowerBudget?.ensureOutermost(); } catch (e) {}
  console.log('[Hearthrise ESM] Features booted');
  return true;
}

if (typeof window.G !== 'undefined' && typeof window.showTab === 'function') {
  tryBootFeatures();
} else {
  // Engine not yet loaded (we're being included in a context where the monolith
  // still sets up G/showTab). Poll briefly.
  let tries = 0;
  const tick = setInterval(() => {
    if (tryBootFeatures() || ++tries > 50) clearInterval(tick);
  }, 100);
}

// Status panel for the standalone index.html status page (no-op when integrated into monolith)
document.addEventListener('DOMContentLoaded', () => {
  const status = document.getElementById('esm-status');
  if (!status) return;
  status.innerHTML = `
    <h1>Hearthrise — ES Module Build</h1>
    <p>Data + features loaded. ${window.__esmBoot.modules.length} feature modules registered.</p>
    <ul style="font-family:monospace;line-height:1.7">
      <li>Skills: <b>${counts.skills}</b> · Monsters: <b>${counts.monsters}</b> · Items: <b>${counts.items}</b></li>
      <li>Trees / Rocks / Fish: <b>${counts.trees} / ${counts.rocks} / ${counts.fish}</b> · Crops: <b>${counts.crops}</b></li>
      <li>Recipes: <b>${counts.recipes}</b> · Companions: <b>${counts.companions}</b></li>
    </ul>
    <p style="color:#5fcc7c">✓ Modules: ${window.__esmBoot.modules.join(', ')}</p>
    <p style="color:#9aa3b0;font-size:calc(14.5px * var(--ui-scale, 1))">Cloud sync is in offline mode — events buffered to localStorage.<br>
       See <code>src/net/SUPABASE_SETUP.md</code> for live config.</p>
  `;
});
