// ════════════════════════════════════════════════════════════════════════
// src/app/world-pane.js — ONE CHARACTER'S WORLD, WITH THE SHELL OVER IT.
//
// mountWorldPane(host, character) builds the World pane for exactly one
// CharacterSession: the World engine (src/world/world-boot.js, loaded on first
// mount) reads that character's view (src/app/world-view.js) every frame, and
// the shell (src/shell/shell.js) lays its windows and widgets over it with the
// HUD layout kept in that character's residue. Every server answer the
// character applies re-syncs the frame and repaints the widgets. Nothing here
// sends an intent or writes a number.
// ════════════════════════════════════════════════════════════════════════

import { worldViewOf } from './world-view.js?v=591';
import { mountShell } from '../shell/shell.js?v=591';

const PANE_HTML = '<div class="world-chrome">'
  + '<span class="world-title">World</span>'
  + '<span class="world-scenes" role="group" aria-label="Show">'
  + '<button type="button" class="world-scene" data-world-choice="town" aria-pressed="false">Town</button>'
  + '<button type="button" class="world-scene" data-world-choice="home" aria-pressed="false">Home</button>'
  + '</span></div>'
  + '<div class="world-stage"><p class="world-status">Loading the world…</p></div>';

/**
 * @param {HTMLElement} host            where the pane goes (the app's main box)
 * @param {object} character            a CharacterSession (status 'ready')
 * @param {object} [o]
 * @param {HTMLElement} [o.screen]      the whole-screen box for the shell's screen widgets
 * @returns {Promise<{runtime: object|null, shell: object, destroy(): void}>}
 */
export async function mountWorldPane(host, character, o) {
  const opts = o || {};
  const doc = host.ownerDocument;
  const pane = doc.createElement('section');
  pane.className = 'panel active';
  pane.id = 'panel-world';
  pane.setAttribute('data-slot', String(character.slot));
  pane.innerHTML = PANE_HTML;
  host.appendChild(pane);
  const stage = pane.querySelector('.world-stage');

  /* The character's own display scratch: where its hero stands, town or home. Never sent. */
  const scratch = { choice: 'town' };
  const view = () => worldViewOf(character.record, scratch);

  let runtime = null;
  try {
    const { bootWorld } = await import('../world/world-boot.js?v=591');
    runtime = await bootWorld(pane, { view });
    runtime.sync();
  } catch (e) {
    console.error('[world] the world failed to load', e);
    const s = stage.querySelector('.world-status');
    if (s) s.textContent = 'The world could not load. Reload the page to try again.';
  }

  const shell = mountShell(stage, { character, screen: opts.screen || doc.body, inHunt: () => !!view()._huntId });
  const offInset = shell.onInset((inset) => { if (runtime) runtime.setInset(inset); });
  const offChar = character.subscribe(() => { if (runtime) runtime.sync(); shell.paint(); });

  return {
    runtime,
    shell,
    destroy() {
      offChar();
      offInset();
      shell.destroy();
      if (runtime) runtime.destroy();
      pane.remove();
    },
  };
}
