// ════════════════════════════════════════════════════════════════════════
// src/features/world-panel.js — THE WORLD PANE: the Home hub's second pane.
//
// This file is all a player's boot pays for the world: it injects an empty
// section.panel#panel-world and registers one showTab post-tap. The first time
// the pane is opened it loads src/styles/world.css and imports
// src/world/world-boot.js — the renderer, the maps and the art book — and from
// then on the tap only starts and stops the loop. tests/boot-budget.mjs BOOT-5
// fails the build if any of src/world is fetched by a boot that never opened it.
//
// WORLD_LAUNCHED is the shipping switch (the `world` product in
// src/features/spine-reveal.js). While it is off the pane is drawn locked on the
// Home strip ("Coming in a later update"); the in-page suite opens it through
// the harness, which reveals every product.
// ════════════════════════════════════════════════════════════════════════
import { BUILD } from '../build-info.js?v=588';

const WORLD_LAUNCHED = true;
let pending = null;
let runtime = null;

const panel = () => document.getElementById('panel-world');

function injectPanel() {
  if (panel()) return;
  const main = document.querySelector('main.main') || document.querySelector('main');
  if (!main) return;
  const sec = document.createElement('section');
  sec.className = 'panel';
  sec.id = 'panel-world';
  sec.innerHTML = '<div class="world-chrome">'
    + '<span class="world-title">World</span>'
    + '<span class="world-scenes" role="group" aria-label="Show">'
    + '<button type="button" class="world-scene" data-world-choice="town" aria-pressed="false">Town</button>'
    + '<button type="button" class="world-scene" data-world-choice="home" aria-pressed="false">Home</button>'
    + '</span></div>'
    + '<div class="world-stage"><p class="world-status">Loading the world…</p></div>';
  main.appendChild(sec);
}

function ensureStyles() {
  if (document.getElementById('world-css')) return;
  const link = document.createElement('link');
  link.id = 'world-css';
  link.rel = 'stylesheet';
  link.href = 'src/styles/world.css?v=' + BUILD.cache;
  document.head.appendChild(link);
}

/** Load the runtime once (a failed load is retried on the next open). Resolves to it, or null. */
function loadWorld() {
  if (!pending) {
    ensureStyles();
    pending = import('../world/world-boot.js?v=588')
      .then((m) => m.bootWorld(panel()))
      .then((rt) => { runtime = rt; runtime.sync(); return runtime; })
      .catch((e) => {
        pending = null;
        console.error('[world] the world failed to load', e);
        const s = panel() && panel().querySelector('.world-status');
        if (s) s.textContent = 'The world could not load. Open it again to retry.';
        return null;
      });
  }
  return pending;
}

function onTab() {
  const p = panel();
  if (!p) return;
  if (p.classList.contains('active')) loadWorld();
  if (runtime) runtime.sync();
}

export function setupWorldPanel() {
  injectPanel();
  window.HearthriseShowTab.wrapShowTab('world-panel', onTab);
}

window.HearthriseWorld = Object.freeze({
  launched: () => WORLD_LAUNCHED,
  load: loadWorld,
  runtime: () => runtime,
});
