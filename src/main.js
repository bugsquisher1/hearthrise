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
import { SKILLS_DEF } from './data/skills.js?v=265';
import { MONSTERS } from './data/monsters.js?v=265';
import { ITEMS, foodClassOf, isAutoEatable, foodKindOf, FOOD_KIND_META } from './data/items.js?v=265';
import { TREES, ROCKS, FISH_SPOTS, CROPS, EQUIP_SLOTS, EQUIP_SLOT_META } from './data/gathering.js?v=265';
import { ARTISAN_RECIPES, ARTISAN_CATEGORIES, recipeCategory, categorizeRecipes, isCastleGood } from './data/recipes.js?v=265';
import { COMPANIONS } from './data/companions.js?v=265';

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
  // b220 — artisan taxonomy + food classification, published for the classic
  // scripts (legacy.js renderer, features/auto-actions.js) that cannot import.
  ARTISAN_CATEGORIES, recipeCategory, categorizeRecipes, foodClassOf, isAutoEatable,
  // b224 — the presentation twin of foodClassOf, so the item modal, the combat
  // picker and the hover tooltip all name a food the same way.
  foodKindOf, FOOD_KIND_META,
  // b222 — the Castle Stores predicate, shared by the artisan lane and (once
  // the Clan Seat migration is applied) the Storehouse deposit filter.
  isCastleGood,
});

// 2. Network — auto-boots in offline mode, ready to upgrade to Supabase later.
//    The bootstrap module reads stored credentials from localStorage and
//    auto-wires auth + sync + realtime backends if found. Until the player
//    enters Supabase URL/anonKey via Settings → Account, everything stays
//    in offline mode and no network requests are made.
import './net/events.js?v=265';
import './net/sync.js?v=265';
import './net/auth.js?v=265';
import './net/supabase-bootstrap.js?v=265';

// 2.5 Utilities — shared helpers + boot-time integrity checks. Importing
// these for side effects:
//   • exposes window.HearthriseDom / HearthriseSafe / HearthriseConfig /
//     HearthriseIdentity for classic-script modules to consume,
//   • runs the ITEMS-divergence check ~1.5s after boot.
import './config.js?v=265';
import './utils/dom.js?v=265';
import './utils/safe.js?v=265';
import './utils/profile.js?v=265';
import './utils/data-integrity.js?v=265';
import './utils/image-fallback.js?v=265';

// 3. Feature modules — each registers itself on setup()
import { setupSmokeTest } from './features/smoke-test.js?v=265';
import { setupCompanions } from './features/companions.js?v=265';
import { setupActivitiesGrid } from './features/activities-grid.js?v=265';
import { setupCharacterPage } from './features/character-page.js?v=265';
import { setupCombatRender } from './features/combat-render.js?v=265';
import { setupRecipeBook } from './features/recipe-book.js?v=265';
import { setupItemIndex } from './features/item-index.js?v=265';

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
