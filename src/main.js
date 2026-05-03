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
import { SKILLS_DEF } from './data/skills.js';
import { MONSTERS } from './data/monsters.js';
import { ITEMS } from './data/items.js';
import { TREES, ROCKS, FISH_SPOTS, CROPS, EQUIP_SLOTS, EQUIP_SLOT_META } from './data/gathering.js';
import { ARTISAN_RECIPES } from './data/recipes.js';
import { COMPANIONS } from './data/companions.js';

Object.assign(window, {
  SKILLS_DEF, MONSTERS, ITEMS,
  TREES, ROCKS, FISH_SPOTS, CROPS, EQUIP_SLOTS, EQUIP_SLOT_META,
  ARTISAN_RECIPES, COMPANIONS,
});

// 2. Network — auto-boots in offline mode, ready to upgrade to Supabase later.
//    The bootstrap module reads stored credentials from localStorage and
//    auto-wires auth + sync + realtime backends if found. Until the player
//    enters Supabase URL/anonKey via Settings → Account, everything stays
//    in offline mode and no network requests are made.
import './net/events.js';
import './net/sync.js';
import './net/auth.js';
import './net/supabase-bootstrap.js';

// 2.5 Utilities — shared helpers + boot-time integrity checks. Importing
// these for side effects:
//   • exposes window.HearthriseDom / HearthriseSafe / HearthriseConfig /
//     HearthriseIdentity for classic-script modules to consume,
//   • runs the ITEMS-divergence check ~1.5s after boot.
import './config.js';
import './utils/dom.js';
import './utils/safe.js';
import './utils/profile.js';
import './utils/data-integrity.js';
import './utils/image-fallback.js';

// 3. Feature modules — each registers itself on setup()
import { setupSmokeTest } from './features/smoke-test.js';
import { setupCompanions } from './features/companions.js';
import { setupActivitiesGrid } from './features/activities-grid.js';
import { setupCharacterPage } from './features/character-page.js';
import { setupCombatRender } from './features/combat-render.js';

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
  setupSmokeTest();
  setupCompanions();
  setupActivitiesGrid();
  setupCharacterPage();
  setupCombatRender();
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
    <p style="color:#9aa3b0;font-size:13px">Cloud sync is in offline mode — events buffered to localStorage.<br>
       See <code>src/net/SUPABASE_SETUP.md</code> for live config.</p>
  `;
});
