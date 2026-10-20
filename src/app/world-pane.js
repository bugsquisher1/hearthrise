// ════════════════════════════════════════════════════════════════════════
// src/app/world-pane.js — ONE CHARACTER'S WORLD, WITH THE SHELL OVER IT.
//
// mountWorldPane(host, character) builds the World pane for exactly one
// CharacterSession: the World engine (src/world/world-boot.js, loaded on first
// mount) reads that character's view (src/app/world-view.js) every frame, and
// the shell (src/shell/shell.js) lays its windows and widgets over it with the
// HUD layout kept in that character's residue. A tap the World names (a
// hunt's entrance, a station) opens its window here; a right-click on a unit
// opens the shell's player / monster menu. Every server answer the
// character applies re-syncs the frame and repaints the widgets. Nothing here
// sends an intent or writes a number.
// ════════════════════════════════════════════════════════════════════════

import { worldViewOf } from './world-view.js?v=0.2.18';
import { mountShell } from '../shell/shell.js?v=0.2.18';
import { logFor } from '../hunt-view/combat-log.js?v=0.2.18';
import { pickHunt } from '../shell/windows/hunts.js?v=0.2.18';
import { worldTargetOf } from '../shell/menu-providers.js?v=0.2.18';

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
 * @param {() => object[]} [o.peers]    the account's open characters (hunt prep, the item finder)
 * @param {object} [o.account]          the AccountSession
 * @param {object} [o.alerts]           the account's alert centre
 * @param {Function} [o.goTo]           (slot, window?) show another open character
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

  /* The combat log listens to the character's timeline from the start, so no line is missed while its
     window is shut: BEFORE the World boots, because the World plays the timeline from its first frame. */
  logFor(character);

  /* What a tap in the World names, and the window it opens (the World itself knows no window). */
  let shell = null;
  const SHOWS = { entrance: (d) => { pickHunt(character, d.hunt); return 'hunts'; }, station: () => 'skills-trade' };
  function emit(kind, detail) {
    /* The World's entity context (a right-click or long press on a unit): the shell's one player / monster menu. */
    if (kind === 'entity') { const t = shell && worldTargetOf(detail); return !!t && shell.menu.open(t, { x: detail.x, y: detail.y }); }
    const to = shell && SHOWS[kind] ? SHOWS[kind](detail || {}) : null;
    if (!to) return false;
    if (shell.wm.isOpen(to)) shell.refresh(to); else shell.open(to);
    return true;
  }

  let runtime = null;
  try {
    const { bootWorld } = await import('../world/world-boot.js?v=0.2.18');
    const town = opts.account && typeof opts.account.townOf === 'function' ? opts.account.townOf(character.slot) : null;
    runtime = await bootWorld(pane, { view, character, emit, town });
    runtime.sync();
  } catch (e) {
    console.error('[world] the world failed to load', e);
    const s = stage.querySelector('.world-status');
    if (s) s.textContent = 'The world could not load. Reload the page to try again.';
  }

  const inHunt = () => !!character.read('hunt') || !!view()._huntId;
  shell = mountShell(stage, { character, screen: opts.screen || doc.body, inHunt, peers: opts.peers, account: opts.account,
    alerts: opts.alerts, goTo: opts.goTo });
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
