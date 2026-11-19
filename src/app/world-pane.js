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

import { worldViewOf } from './world-view.js?v=0.2.140';
import { mountShell } from '../shell/shell.js?v=0.2.140';
import { logFor } from '../hunt-view/combat-log.js?v=0.2.140';
import { pickHunt } from '../shell/windows/hunts.js?v=0.2.140';
import { worldTargetOf } from '../shell/menu-providers.js?v=0.2.140';
import { TAP_WINDOWS } from '../data/world/stations.js?v=0.2.140';
import { SINK_TAPS } from '../data/world/sink-taps.js?v=0.2.140';
import { roomWindowOf } from '../data/world/house-layouts.js?v=0.2.140';
import { connection, loadingWords } from '../net/connection.js?v=0.2.140';
import { SHELL_WINDOWS } from '../data/shell-windows.js?v=0.2.140';
import { rowOffered } from '../shell/launcher.js?v=0.2.140';

/* The windows a town keeper or station opens (a tapped prop's `window`), and nothing else. */
const KEEPER_WINDOWS = new Set([...TAP_WINDOWS, ...Object.values(SINK_TAPS).map((t) => t.window)]);
/** @type {Map<string, {id: string, gm?: boolean, section?: string, orElse?: string}>} */
const ROW_OF = new Map(SHELL_WINDOWS.map((r) => [r.id, r]));
/* A window the server hides from this hero (shell-windows.js `section`) is not opened by a tap: its row's `orElse` is (the yard
   opens Hunts while the server sends no `training` section). */
const shownOr = (id, character) => (rowOffered(ROW_OF.get(id), character) ? id : (ROW_OF.get(id) && ROW_OF.get(id).orElse) || null);

/**
 * The window a tap the World names opens for `character`, or null (it opens nothing): a station's work, a town keeper's window, and
 * a home room's piece or signpost (house-layouts.js roomWindowOf: the House screen, or the room's own window, the Garden's Farm).
 * A hunt's entrance is the pane's own (it picks the hunt first). Pure.
 * THE HOME'S TAPS WERE NAMED AND NEVER OPENED (audit 2026-11-18 A4: the Garden signpost showed a hand and did nothing): the World
 * emitted 'room' and 'house' and nothing here answered them.
 */
export function tapWindowOf(kind, d, character) {
  const detail = d || {};
  if (kind === 'station') return 'skills-trade';
  if (kind === 'keeper') return KEEPER_WINDOWS.has(detail.window) ? shownOr(detail.window, character) : null;
  if (kind === 'room' || kind === 'house') return typeof detail.room === 'string' && detail.room ? shownOr(roomWindowOf(detail.room), character) : null;
  return null;
}

/* The place's name and its Town / Home switch (world-boot.js paintChrome names the scene and presses its button). ONE TOP BAR (UI audit
   2026-11-18 #10: a second strip under the character strip held only these, 52 px of the World on a desktop and 44 of a 423 px phone):
   they stand in the character strip's place slot (src/app/character-strip.js .char-place); a pane mounted with no strip keeps them over its stage. */
const CHROME_HTML = '<div class="world-chrome">'
  + '<span class="world-title">World</span>'
  + '<span class="world-scenes" role="group" aria-label="Show">'
  + '<button type="button" class="world-scene" data-world-choice="town" aria-pressed="false">Town</button>'
  + '<button type="button" class="world-scene" data-world-choice="home" aria-pressed="false">Home</button>'
  + '</span></div>';
const PANE_HTML = CHROME_HTML + '<div class="world-stage"><p class="world-status">Loading world…</p></div>';

/* Each character's own display scratch (Town or Home, where its hero stands at home), kept across
   mounts: the pane is remounted on every switch of the viewed character, and a scratch made per mount
   sent the hero back to the map's start and the view back to Town. Never sent, never residue. */
const SCRATCH = new WeakMap();
function scratchOf(character) {
  if (!SCRATCH.has(character)) SCRATCH.set(character, { choice: 'town' });
  return SCRATCH.get(character);
}

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
  const chrome = pane.querySelector('.world-chrome');
  const placeSlot = opts.screen ? opts.screen.querySelector('.char-place') : null;
  if (placeSlot) placeSlot.replaceChildren(chrome);

  /* The character's own display scratch (SCRATCH): Town or Home, where its hero stands at home. Never sent. */
  const scratch = scratchOf(character);
  const view = () => worldViewOf(character.record, scratch);

  /* The combat log listens to the character's timeline from the start, so no line is missed while its
     window is shut: BEFORE the World boots, because the World plays the timeline from its first frame. */
  logFor(character);

  /* What a tap in the World names, and the window it opens (the World itself knows no window). */
  let shell = null;
  function emit(kind, detail) {
    /* The World's entity context (a right-click or long press on a unit): the shell's one player / monster menu. */
    if (kind === 'entity') { const t = shell && worldTargetOf(detail); return !!t && shell.menu.open(t, { x: detail.x, y: detail.y }); }
    if (!shell) return false;
    /* a hunt's entrance picks its hunt, then opens Hunts; every other tap is tapWindowOf's (a keeper's window: only one a station names) */
    const to = kind === 'entrance' ? (pickHunt(character, (detail || {}).hunt), 'hunts') : tapWindowOf(kind, detail, character);
    if (!to) return false;
    /* a station that opens its window on one tab (the Tavern on Round) */
    if (detail && typeof detail.tab === 'string') { shell.wm.openTab(to, detail.tab); shell.refresh(to); return true; }
    if (shell.wm.isOpen(to)) shell.refresh(to); else shell.open(to);
    return true;
  }

  /* NEVER A SILENT WAIT (phone playtest 2026-10-31: 35 s of "Loading world…" in a tunnel, no word about why): while
     the world loads, its line says when the connection is gone or slow. It comes back by itself: nothing to press. */
  const statusEl = stage.querySelector('.world-status');
  const firstWords = statusEl.textContent;
  const waitFrom = Date.now();
  const sayWait = () => { statusEl.textContent = loadingWords(connection.state(), Date.now() - waitFrom, firstWords); };
  const waitTick = doc.defaultView.setInterval(sayWait, 1000);
  doc.defaultView.addEventListener('offline', sayWait);
  doc.defaultView.addEventListener('online', sayWait);
  sayWait();

  let runtime = null;
  let reloading = false;   // the World's module did not load and the page is about to try again by itself (src/platform/load-shell.js)
  try {
    const { bootWorld } = await import('../world/world-boot.js?v=0.2.140').catch((e) => {
      const win = doc.defaultView;
      reloading = typeof win.HearthriseRetryLoad === 'function' && win.HearthriseRetryLoad();
      throw e;
    });
    const town = opts.account && typeof opts.account.townOf === 'function' ? opts.account.townOf(character.slot) : null;
    runtime = await bootWorld(pane, { view, character, emit, town, peers: opts.peers, chrome });
    runtime.sync();
  } catch (e) {
    console.error('[world] the world failed to load', e);
    const s = stage.querySelector('.world-status');
    if (s && !reloading) s.textContent = 'World failed to load, reload the page';
  } finally {
    doc.defaultView.clearInterval(waitTick);
    doc.defaultView.removeEventListener('offline', sayWait);
    doc.defaultView.removeEventListener('online', sayWait);
  }

  const inHunt = () => !!character.read('hunt') || !!view()._huntId;
  shell = mountShell(stage, { character, screen: opts.screen || doc.body, inHunt, peers: opts.peers, account: opts.account,
    alerts: opts.alerts, goTo: opts.goTo });
  const offInset = shell.onInset((inset) => { if (runtime) runtime.setInset(inset); });
  /* ONE REPAINT PER TASK (tests/perf-budget.mjs; live v0.2.23, Andy in Firefox): an answer emits, and
     its listeners emit again inside it (an alert writes its residue, the summary recorder its list), so
     one answer repainted the shell and drew the World two or three times over (16 ms an answer, 80 ms
     in an alert burst). Every change of one task is painted once, as that task ends. */
  let queued = false, gone = false;
  const repaint = () => { queued = false; if (gone) return; if (runtime) runtime.sync(); shell.paint(); };
  const offChar = character.subscribe(() => { if (!queued) { queued = true; queueMicrotask(repaint); } });

  return {
    runtime,
    shell,
    destroy() {
      gone = true;
      offChar();
      offInset();
      shell.destroy();
      if (runtime) runtime.destroy();
      chrome.remove();
      pane.remove();
    },
  };
}
