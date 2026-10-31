// ════════════════════════════════════════════════════════════════════════
// src/shell/shell.js — THE WORLD SHELL'S DOM HOST: windows and widgets over the World.
//
// mountShell(root) lays three layers over `root` (the World's box) and drives
// them from the pure modules:
//   window-manager.js  which windows are open, docked or floating
//   hud.js             which widgets show, how faded, and where they sit
//   renderers.js       what goes inside each window and widget
// Windows are reconciled by id, so opening one never re-renders (or scrolls)
// another; a body re-renders on refresh(id). The World never pauses: windows
// are not modal and have no backdrop.
//
// THE CAMERA INSET: the World edges the docked HUD widgets cover (the bottom
// bar, the top bar, the side panels; hud.js hudInsetOf) are handed to an
// onInset(fn) subscriber at once, then on every change, as {left, right, top, bottom}; each change is dispatched as
// `hearthrise:shell-inset` on the host, so the World calls its engine's
// setInset and frames the hero and the target in the uncovered part.
// WINDOWS ARE NEVER IN IT (Tyler 2026-10-19): they float over the World, so
// opening, closing, focusing or dragging one never moves the camera. A docked
// window never covers a widget either (r11, hud.js clearOfDock): a right-anchored
// widget it lands on slides left of the dock, and the inset keeps reading that
// widget at its home place, so the camera still never moves.
//
// COMPONENTS (the hunt panels): a renderer that carries a `.patch(el, ctx)` is
// BUILT ONCE (its HTML is the skeleton, written when the box is created) and
// then only patched in place (src/render/paint.js): on every envelope, and at
// DISPLAY_TICK_MS for clocks and the timeline. `.act(ctx, el, action, ev)`
// receives the box's [data-hs-act] clicks and changes. A renderer that lists
// more DOM events in `.events` (input, keydown, contextmenu, the pointer and
// drag events, mouseover) gets those too, and only those: a renderer that did
// not ask never sees a keydown. An act that returns true has consumed the
// event (it is not passed on to the window keys or the World). A plain
// renderer keeps the old contract (its HTML replaces the box when it differs).
//
// THE PLAYER MENU: one context menu (src/shell/context-menu.js) over both
// layers, its entries answered by src/shell/menu-providers.js; `menu` is in the
// context (a name in chat opens it on a click) and returned (the World pane
// attaches its picked units to it).
//
// Mounted by src/app/world-pane.js over one character's World.
// ════════════════════════════════════════════════════════════════════════
import { MOBILE_QUERY } from '../world/core/camera.js?v=0.2.75';
import { SHELL_WINDOWS } from '../data/shell-windows.js?v=0.2.75';
import { HUD_WIDGETS } from '../data/hud-widgets.js?v=0.2.75';
import { createWindowManager, DOCK_EDGE, HOME_BOTTOM, RESIZE_MIN } from './window-manager.js?v=0.2.75';
import { createHud, residueStore, placeWidget, hudInsetOf, clearOfEdges, clearOfDock, stageOf, dockCap, homeAt, stackBelow, stackRoom } from './hud.js?v=0.2.75';
import { keyLabel, glyphSvg, actCoach, heldCard, coachHtml, placeCoach, ringCoach, noteCoachSight, coachOnScreen } from './launcher.js?v=0.2.75';
import { coachWindow } from '../data/hunt-tutorial.js?v=0.2.75';
import { WINDOW_RENDERERS, WIDGET_RENDERERS } from './renderers.js?v=0.2.75';
import { mountContextMenu } from './context-menu.js?v=0.2.75';
import { menuProvidersOf } from './menu-providers.js?v=0.2.75';
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.75';
import { followDeaths, deathPopupOf } from './death-popup.js?v=0.2.75';
import { takeFresh } from '../hunt-view/summary-recorder.js?v=0.2.75';
import { huntOf } from '../session/hunt-sections.js?v=0.2.75';
import { sizeStore, gripHtml, pressGrip } from './window-sizes.js?v=0.2.75';
import { watchTown, settleSpentBench } from '../session/town-poll.js?v=0.2.75';
import { benchSpentAtMs } from './town-work.js?v=0.2.75';
import { applyPanelAlpha, clearPanelAlpha } from './panel-alpha.js?v=0.2.75';
import { mountWidgetMoves, paintMove } from './widget-move.js?v=0.2.75';

/* The components' display clock: session timers and the timeline's due events (parity SH-05, DOM 4 Hz). */
const DISPLAY_TICK_MS = 250;
/* How far a press on a window's head must travel before it is a drag (a click never floats a window). */
const DRAG_SLOP_PX = 5;
/* The widgets the coach card hangs under (launcher.js: the icon row in town, the hunt bar in a hunt). */
const COACH_HOSTS = '[data-hs-widget="launchers"], [data-hs-widget="hunt-topbar"]';
/* The DOM events a renderer may opt into with `.events` (click and change always reach `.act`). */
const EXTRA_EVENTS = Object.freeze(['input', 'keydown', 'contextmenu', 'pointerdown', 'pointerup', 'pointercancel',
  'dragstart', 'dragover', 'dragleave', 'drop', 'dragend', 'mouseover', 'mouseout', 'focusin']);

/**
 * @param {HTMLElement} root   the World's box; the shell fills it
 * @param {object} [o]
 * @param {object} o.character   the CharacterSession this shell belongs to (its HUD layout is that character's residue)
 * @param {HTMLElement} [o.screen]    the whole-screen box (strip included) for screen widgets; default body
 * @param {() => boolean} [o.inHunt]   true while a hunt runs ('hunt' widgets)
 * @param {() => object[]} [o.peers]   every CharacterSession this account has open (hunt prep reads each one)
 * @param {object} [o.account]         the AccountSession (the item finder's account-wide read)
 * @param {object} [o.alerts]          the account's alert centre (src/shell/alerts.js)
 * @param {(slot: number, win?: string|null) => void} [o.goTo]  show another open character (and open a window there)
 * @param {Window} [o.host]            defaults to window
 */
export function mountShell(root, o) {
  const opts = o || {};
  const host = opts.host || window;
  const doc = host.document;
  const phoneMq = host.matchMedia(MOBILE_QUERY);
  const motionMq = host.matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => motionMq.matches;

  const shell = doc.createElement('div');
  shell.className = 'hs-shell';
  shell.setAttribute('data-hs-shell', '');
  shell.innerHTML = '<div class="hs-hud" data-hs-hud="world"></div><div class="hs-layer" data-hs-layer></div>';
  root.appendChild(shell);
  /* Screen widgets (the launcher row lives in the strip) cover the whole screen box, not the World. */
  const screen = doc.createElement('div');
  screen.className = 'hs-shell hs-screen';
  screen.innerHTML = '<div class="hs-hud is-screen" data-hs-hud="screen"></div>';
  (opts.screen || doc.body).appendChild(screen);
  const worldHud = shell.querySelector('[data-hs-hud="world"]');
  const screenHud = screen.querySelector('[data-hs-hud="screen"]');
  const layer = shell.querySelector('[data-hs-layer]');

  const sizes = sizeStore(opts.character);
  const wm = createWindowManager({
    windows: SHELL_WINDOWS,
    sizeOf: (id) => sizes.read(id),
    isPhone: () => phoneMq.matches,
    world: () => ({ width: shell.clientWidth, height: shell.clientHeight }),
    reducedMotion,
    schedule: (fn, ms) => host.setTimeout(fn, ms),
  });
  /* THE HUNT'S WIDGETS LEAVE TOWN WITH IT (designer walk 2026-10-25 #5: the summary, "Not in a party", the hunt bar's
     Summary, the analyzer's "Hunt ended" and a toast, five overlays on return): the party panel and the analyzer show
     while a hunt runs and the server has not said it ended; the hunt bar, which keeps only the way back to the summary
     once the hunt is over (Tyler 10-19), leaves with the summary: when the player closes it (summaryClosed), so the
     summary opens by itself (followSummary below) as the one notice and then the town is clear. */
  let summaryClosed = null;   // the ended session whose summary the player has closed (display scratch)
  const huntUp = (id) => {
    if (!opts.inHunt || !opts.inHunt()) return false;
    const h = huntOf(opts.character);
    if (!h || !h.ended) return true;
    /* ...and none while that summary is open: the bar would hold only a Summary press for the window already on
       screen (first-hour playtest 10-29 #10: on a phone, its ground's name given way to the sheet, an empty box). */
    return id === 'hunt-topbar' && summaryClosed !== h.sessionId && !wm.isOpen('hunt-summary');
  };
  const hud = createHud({
    widgets: HUD_WIDGETS,
    sizeClass: () => (phoneMq.matches ? 'phone' : 'desktop'),
    store: residueStore(opts.character),
    inHunt: huntUp,
  });
  const insetListeners = new Set();
  const ctx = {
    wm, hud, refresh, doc, get glyphs() { return host.HR_GLYPHS || {}; }, character: opts.character || null,
    peers: () => (opts.peers ? opts.peers() : (opts.character ? [opts.character] : [])),
    account: opts.account || null,
    alerts: opts.alerts || null,
    goTo: opts.goTo || null,
    isPhone: () => phoneMq.matches,
    now: () => host.performance.now(),
    show(id) { if (hud.row(id)) hud.setVisible(id, true); else wm.open(id); },
  };

  ctx.menu = mountContextMenu(ctx, [shell, screen], () => menuProvidersOf(ctx));

  /* ── Windows, reconciled by id ── */
  function frame(row) {
    const el = doc.createElement('section');
    el.className = 'hs-win is-' + row.object;
    el.setAttribute('data-hs-win', row.id);
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', row.label);
    el.innerHTML = '<header class="hs-win-head" data-hs-drag="' + esc(row.id) + '">' + glyphSvg(ctx.glyphs, row.glyph)
      + '<h2 class="hs-win-title">' + esc(row.label) + '</h2><kbd class="hs-key">' + esc(keyLabel(row.key)) + '</kbd>'
      + '<button type="button" class="hs-close" data-hs-close="' + esc(row.id) + '" aria-label="Close ' + esc(row.label) + '">' + glyphSvg(ctx.glyphs, 'uiClose') + '</button></header>'
      /* the coach's card when it points into this window (coach() below), above the body: it covers nothing */
      + '<div class="hs-win-coach"></div>'
      + '<div class="hs-win-body" data-hs-body></div>' + gripHtml(row);
    return el;
  }

  function refresh(id) {
    const el = layer.querySelector('[data-hs-win="' + id + '"]');
    const render = WINDOW_RENDERERS[id];
    if (!el || !render) return;
    const body = el.querySelector('[data-hs-body]');
    if (!render.patch) { body.innerHTML = render(ctx); return; }
    if (!body.hasAttribute('data-hs-built')) { body.innerHTML = render(ctx); body.setAttribute('data-hs-built', ''); }
    render.patch(body, ctx);
  }

  function paintWindows() {
    const placed = wm.layout();
    const keep = new Set(placed.map((p) => p.id));
    for (const el of Array.from(layer.children)) if (!keep.has(el.getAttribute('data-hs-win'))) el.remove();
    for (const p of placed) {
      let el = layer.querySelector('[data-hs-win="' + p.id + '"]');
      if (!el) { el = frame(wm.row(p.id)); layer.appendChild(el); refresh(p.id); if (sized) sized.ro.observe(el, { box: 'border-box' }); }
      el.classList.toggle('is-entering', p.entering);
      el.classList.toggle('is-leaving', p.leaving);
      el.classList.toggle('is-floating', !p.docked && !p.modal);
      el.classList.toggle('is-modal', !!p.modal);
      el.classList.toggle('is-top', p.top);
      el.style.zIndex = String(p.z);
      el.style.width = p.width ? p.width + 'px' : '';
      el.style.height = p.height ? p.height + 'px' : '';
      el.classList.toggle('is-sized', !!p.height);
      el.style.right = p.docked && !p.phone ? p.right + 'px' : '';
      /* A modal row is centred by its own CSS (.hs-win.is-modal), on every size class; a home row (Chat) is held
         to the World's bottom-left by its bottom edge, so a taller one grows up. */
      const home = Number.isFinite(p.bottom);
      el.classList.toggle('is-home', home);
      /* A modal the player dragged (desktop) sits where it was put: no longer centred by its CSS. */
      const moved = !!p.modal && Number.isFinite(p.x);
      el.classList.toggle('is-moved', moved);
      el.style.left = p.docked || (p.modal && !moved) ? '' : p.x + 'px';
      el.style.top = p.docked || (p.modal && !moved) || home ? '' : p.y + 'px';
      el.style.bottom = home ? p.bottom + 'px' : '';
    }
  }

  /* ── Widgets: shown, faded and placed from the layout ── */
  function paintWidgets() {
    /* The window opacity follows the character's residue on every repaint (a Settings drag included). */
    applyPanelAlpha(ctx.doc, ctx.character);
    for (const row of hud.rows()) {
      const box = row.layer === 'screen' ? screenHud : worldHud;
      let el = box.querySelector('[data-hs-widget="' + row.id + '"]');
      if (!hud.isShown(row.id)) { if (el) el.remove(); continue; }
      const render = WIDGET_RENDERERS[row.id];
      if (!el) {
        el = doc.createElement('div');
        el.className = 'hs-widget is-' + row.id;
        el.setAttribute('data-hs-widget', row.id);
        box.appendChild(el);
        if (render.patch) el.innerHTML = render(ctx);
      }
      if (render.patch) render.patch(el, ctx);
      else { const html = render(ctx); if (el.innerHTML !== html) el.innerHTML = html; }
      const L = hud.layoutOf(row.id);
      el.style.setProperty('--hs-op', String(L.opacity));
      el.style.minWidth = row.min[0] + 'px';
      el.style.minHeight = L.folded ? '' : row.min[1] + 'px';
      paintMove(el, L, hud.isMoved(row.id));
      if (sized && !sized.watched.has(el)) { sized.watched.add(el); sized.ro.observe(el, { box: 'border-box' }); }
    }
    placeWidgets();
  }

  /* A widget sits where its anchor puts it AT ITS SIZE NOW: a bottom-docked stack (the phone alerts)
     that grows after it was placed (a new line on a display tick, a late stylesheet) would grow DOWN
     over the bar's buttons (v0.2.24 run 39670839568: "No thanks" took the Fight settings press).
     Every size change of a widget or of the box it docks in re-places the widgets. */
  const sized = host.ResizeObserver ? { ro: new host.ResizeObserver(() => placeWidgets()), watched: new WeakSet() } : null;
  if (sized) { sized.ro.observe(worldHud); sized.ro.observe(screenHud); }
  function placeWidgets() {
    for (const row of hud.rows()) {
      const box = row.layer === 'screen' ? screenHud : worldHud;
      const el = box.querySelector('[data-hs-widget="' + row.id + '"]');
      if (!el) continue;
      const at = placeWidget(hud.layoutOf(row.id), { width: box.clientWidth, height: box.clientHeight }, { width: el.offsetWidth, height: el.offsetHeight }, hud.isMoved(row.id));
      el.style.left = at.left + 'px';
      el.style.top = at.top + 'px';
    }
    stackWidgets();
    roomForStack();
    capDock();
    /* A docked window never covers a widget (hud.js clearOfDock, r11): a right-anchored World widget it
       lands on slides left of the dock but never into the middle of the fight (hud.js stageOf), else
       waits hidden until the dock narrows; its home left is kept for the camera inset. Then widgets never overlap (hud.js clearOfEdges): a centred widget that lands on
       an edge-anchored one, or on the dock, moves along its row to clear it, and when the row is too
       narrow the edge widgets it still hits step down below it. */
    const dock = dockRects();
    for (const box of [worldHud, screenHud]) {
      const els = Array.from(box.querySelectorAll('[data-hs-widget]'));
      const anchorOf = (e) => hud.layoutOf(e.getAttribute('data-hs-widget')).anchor;
      const centred = (e) => anchorOf(e)[1] === 'c';
      const b = box.getBoundingClientRect();
      /* pinned: a widget the player moved, in no centred bar's row (hud.js clearOfEdges) */
      const rel = (e) => { const q = e.getBoundingClientRect(); return { left: q.left - b.left, top: q.top - b.top, width: q.width, height: q.height, pinned: hud.isMoved(e.getAttribute('data-hs-widget')) }; };
      const edgeEls = els.filter((e) => !centred(e));
      const fixed = box === worldHud ? dock : [];
      const stage = fixed.length ? [stageOf(insetNow(), { width: b.width, height: b.height })] : [];
      for (const e of edgeEls) {
        const home = rel(e);
        const left = fixed.length && anchorOf(e)[1] === 'r' ? clearOfDock(home, fixed, edgeEls.filter((o) => o !== e).map(rel), DOCK_EDGE, stage) : home.left;
        e.classList.toggle('is-under-dock', left === null);
        if (left === home.left) { dockHome.delete(e); continue; }
        dockHome.set(e, home.left);
        if (left !== null) e.style.left = left + 'px';
      }
      for (const e of els.filter(centred)) {
        const at = clearOfEdges(rel(e), edgeEls.map(rel), b.width, DOCK_EDGE, fixed);
        e.style.left = at.left + 'px';
        for (const p of at.push) edgeEls[p.i].style.top = p.top + 'px';
      }
    }
    stackWidgets();
    publishInset();
    roomForCoach();
  }

  /* The coach card hangs under its host (the hunt bar in a hunt, the icon row in town: launcher.js) and must end
     above the action bar. Each host widget carries --coach-room, the px from its foot to the bar's top (the World's
     foot when no bar shows), whether or not a card shows yet (a display tick may draw one); the phone caps the card
     to it (shell.css). Measured after every repaint and resize, never a constant. */
  function roomForCoach() {
    const bar = worldHud.querySelector('[data-hs-widget="action-bar"]');
    const floor = bar && bar.offsetWidth ? bar.getBoundingClientRect().top : worldHud.getBoundingClientRect().bottom;
    for (const w of [worldHud, screenHud].flatMap((b) => Array.from(b.querySelectorAll(COACH_HOSTS)))) {
      const v = Math.max(0, Math.floor(floor - w.getBoundingClientRect().bottom)) + 'px';
      if (w.style.getPropertyValue('--coach-room') !== v) w.style.setProperty('--coach-room', v);
    }
  }

  /* A widget that stacks (a row's `below`: the tally) sits under the widgets it names on its edge, wherever
     they are now (hud.js stackBelow); a hidden one is in nobody's way. Run again after a step-down. */
  function stackWidgets() {
    for (const row of hud.rows()) {
      if (!row.below || hud.isMoved(row.id)) continue;
      const box = row.layer === 'screen' ? screenHud : worldHud;
      const el = box.querySelector('[data-hs-widget="' + row.id + '"]');
      if (!el || !el.offsetWidth) continue;
      const b = box.getBoundingClientRect();
      const rel = (e) => { const q = e.getBoundingClientRect(); return { left: q.left - b.left, top: q.top - b.top, width: q.width, height: q.height }; };
      const above = row.below.map((id) => box.querySelector('[data-hs-widget="' + id + '"]')).filter(Boolean).map(rel);
      const at = rel(el);
      const top = stackBelow(at, above, DOCK_EDGE);
      if (top !== Math.round(at.top)) el.style.top = top + 'px';
    }
  }

  /* A widget others stack under (the analyzer, for the Tally) ends where the one under it still clears the bottom bar
     (hud.js stackRoom, the 170 px bar): its CSS reads --hs-room. Written only when it changes; the size change re-places
     the widgets (the observer above), and the room reads no height of its own, so the second pass writes nothing. */
  function roomForStack() {
    const b = worldHud.getBoundingClientRect();
    const rel = (e) => { const q = e.getBoundingClientRect(); return { left: q.left - b.left, top: q.top - b.top, width: q.width, height: q.height }; };
    const els = Array.from(worldHud.querySelectorAll('[data-hs-widget]'));
    const bars = els.filter((e) => hud.layoutOf(e.getAttribute('data-hs-widget')).anchor === 'bc').map(rel);
    const room = new Map();
    for (const row of hud.rows()) {
      const el = row.below && worldHud.querySelector('[data-hs-widget="' + row.id + '"]');
      for (const id of row.below || []) {
        const a = worldHud.querySelector('[data-hs-widget="' + id + '"]');
        if (!a) continue;
        const r = el && el.offsetWidth && !hud.isMoved(row.id) && !hud.isMoved(id) ? stackRoom(rel(a), rel(el), bars, b.height, DOCK_EDGE) : null;
        room.set(a, r === null ? (room.get(a) ?? null) : Math.min(r, room.get(a) ?? r));
      }
    }
    for (const [a, r] of room) {
      const v = r === null ? '' : r + 'px';
      if (a.style.getPropertyValue('--hs-room') === v) continue;
      if (v) a.style.setProperty('--hs-room', v); else a.style.removeProperty('--hs-room');
    }
  }

  /* The docked windows' boxes in the World's px (the layer and the World HUD share the shell's box);
     layout boxes, so a window sliding in is where it will sit. Floating and centred windows are the
     player's own and never move a widget; a window sliding out is already gone. */
  function dockRects() {
    return Array.from(layer.querySelectorAll('.hs-win:not(.is-floating):not(.is-modal):not(.is-leaving)'))
      .map((w) => ({ left: w.offsetLeft, top: w.offsetTop, width: w.offsetWidth, height: w.offsetHeight }))
      .filter((q) => q.width > 0 && q.height > 0);
  }
  /* Desktop: a docked window whose column crosses the bottom bar's home ends above it (hud.js dockCap), so a window
     that grows (a Settings tab) never moves the bar, and the home window (Chat) stands above it. The phone's sheet is
     full height; the bar clears it as before. */
  function capDock() {
    const b = shell.getBoundingClientRect();
    const bars = phoneMq.matches ? [] : Array.from(worldHud.querySelectorAll('[data-hs-widget]'))
      .filter((e) => hud.layoutOf(e.getAttribute('data-hs-widget')).anchor === 'bc')
      .map((e) => { const q = e.getBoundingClientRect(); return { left: q.left - b.left, top: q.top - b.top, width: q.width, height: q.height }; });
    for (const w of layer.querySelectorAll('.hs-win:not(.is-floating):not(.is-modal)')) {
      const cap = bars.length ? dockCap({ left: w.offsetLeft, top: w.offsetTop, width: w.offsetWidth, height: w.offsetHeight }, bars, DOCK_EDGE) : null;
      const v = cap === null ? '' : cap + 'px';
      if (w.style.maxHeight !== v) w.style.maxHeight = v;
    }
    /* The home window (Chat) stands above the bar where its column crosses it and below the widgets over its
       column (a four-seat party panel), never over either: it shrinks, or slides right past them (hud.js homeAt).
       Measured from its home column every time, so it comes back when the panel gets shorter. */
    const homes = layer.querySelectorAll('.hs-win.is-home');
    const tops = homes.length ? Array.from(worldHud.querySelectorAll('[data-hs-widget]'))
      .filter((e) => hud.layoutOf(e.getAttribute('data-hs-widget')).anchor[0] !== 'b')
      .map((e) => { const q = e.getBoundingClientRect(); return { left: q.left - b.left, top: q.top - b.top, width: q.width, height: q.height }; }) : [];
    for (const w of homes) {
      const at = homeAt({ left: DOCK_EDGE, width: w.offsetWidth }, bars, tops, DOCK_EDGE, HOME_BOTTOM, { width: b.width, height: b.height }, RESIZE_MIN.h);
      if (w.style.left !== at.left + 'px') w.style.left = at.left + 'px';
      if (w.style.bottom !== at.bottom + 'px') w.style.bottom = at.bottom + 'px';
      const v = at.max === null ? '' : at.max + 'px';
      if (w.style.maxHeight !== v) w.style.maxHeight = v;
    }
  }
  /* A widget the dock moved -> its home left: the camera inset reads it there (windows never move the World). */
  const dockHome = new WeakMap();

  /* The World edges the docked HUD widgets cover ({left, right, top, bottom}),
     published only when they change, so the camera frames the playable area beside them. */
  let lastInset = '';
  function insetNow() {
    const b = shell.getBoundingClientRect();
    const widgets = [];
    const rel = (r, left = r.left - b.left) => ({ left, top: r.top - b.top, width: r.width, height: r.height });
    for (const el of worldHud.querySelectorAll('[data-hs-widget]')) {
      if (hud.isMoved(el.getAttribute('data-hs-widget'))) continue;   // the player's own, like a floating window
      const r = el.getBoundingClientRect();
      const left = dockHome.has(el) ? dockHome.get(el) : r.left - b.left;
      widgets.push({ anchor: hud.layoutOf(el.getAttribute('data-hs-widget')).anchor, rect: rel(r, left) });
    }
    /* THE PHONE'S COACH NEVER LIES ON THE HERO (first-hour playtest 10-29 #10): the open card under the hunt bar stands
       at the bar's right end (shell.css) and the camera frames the World beside it, as it does beside a panel. */
    const card = phoneMq.matches && worldHud.querySelector('[data-hs-widget="hunt-topbar"] > .hs-pointer:not(.is-min)');
    const cr = card && card.getBoundingClientRect();
    if (cr) widgets.push({ anchor: cr.left + cr.width / 2 - b.left < b.width / 2 ? 'tl' : 'tr', rect: rel(cr) });
    return hudInsetOf(widgets, { width: b.width, height: b.height });
  }
  function publishInset() {
    const inset = insetNow();
    const sig = JSON.stringify(inset);
    if (sig === lastInset) return;
    lastInset = sig;
    for (const fn of insetListeners) fn(inset);
    host.dispatchEvent(new host.CustomEvent('hearthrise:shell-inset', { detail: inset }));
  }
  let summaryWasOpen = false;
  function onWm() {
    /* the player closed an ended hunt's summary: its hunt bar leaves town with it (huntUp) */
    const so = wm.isOpen('hunt-summary');
    if (summaryWasOpen && !so) { const h = huntOf(ctx.character); if (h && h.ended) summaryClosed = h.sessionId; }
    summaryWasOpen = so;
    paintWindows();
    /* an open window asked to show another tab (R on an open Shop: window-manager.js openTab) shows it at once */
    for (const id of wm.openIds()) if (wm.wantsTab(id)) refresh(id);
    paintWidgets();
    coach();
  }
  /* The coach (launcher.js heldCard) inside the window it points into, and its gold ring (launcher.js ringCoach), after every
     paint and on the display tick; a card that gives way on the tick (a held card read) redraws the icon row too. */
  let coachShown = null;
  function coach(tick) {
    const cs = ctx.character;
    const card = cs ? heldCard(ctx) : null;
    const win = coachWindow(card);
    for (const slot of layer.querySelectorAll('[data-hs-win] > .hs-win-coach')) {
      placeCoach(slot, win && slot.parentElement.getAttribute('data-hs-win') === win ? coachHtml(cs, card, true) : '');
    }
    const id = card ? card.id : null;
    if (tick && id !== coachShown) paintWidgets();
    coachShown = id;
    ringCoach(ctx, card, ringRoots);
    /* a card the player only has to read is marked read once it has been on screen, open or folded, its reading time */
    if (tick) noteCoachSight(ctx, card, coachOnScreen([shell, screen], card));
  }
  /* The ring's boxes: the World shell, the screen layer, then the whole screen around them (the character strip's
     Characters button and hero tabs, src/app/character-strip.js). */
  const ringRoots = [shell, screen, opts.screen || doc.body];
  const offWm = wm.subscribe(onWm);
  /* A reset or a size-class reload moves every line of the HUD layout window too. */
  const offHud = hud.subscribe((id) => { paintWidgets(); if (id === null) for (const w of wm.openIds()) refresh(w); });

  /* A freshly ended hunt opens its summary, once (summary-recorder.js takeFresh), unless the hero died: the death popup
     comes first, and its "Hunt summary" button opens it (Tyler 2026-10-19). Here, not in the hunt bar: the bar leaves
     town with the hunt (huntUp). */
  function followSummary() {
    const cs = ctx.character;
    if (cs && takeFresh(cs) && !deathPopupOf(cs) && !wm.isOpen('death')) queueMicrotask(() => wm.open('hunt-summary'));
  }

  /* The display tick: components patch their clocks and play the timeline's due events. */
  function patchComponents() {
    /* The coach FIRST, while the page is still laid out from the last frame: its ring asks what is on screen
       (launcher.js shown, getClientRects), and asked after the patches below it forced a whole layout inside the
       tick (perf lane 2026-10-28: up to 79 ms of an 81 ms tick at 4x CPU). A control that appears on this tick is
       ringed on the next, 250 ms later. */
    coach(true);
    followSummary();
    if (ctx.character && ctx.character.timeline) ctx.character.timeline.advance(ctx.now());
    /* The Work window or the bag watches the town work: the viewed character re-reads at townPollMs (town-poll.js). */
    if (ctx.character && (wm.isOpen('skills-trade') || wm.isOpen('inventory'))) watchTown(ctx.character);
    /* A bench the server's own numbers say is spent is settled for EVERY open character, watched or not (report #68). */
    for (const p of ctx.peers()) settleSpentBench(p, benchSpentAtMs(p));
    for (const row of hud.rows()) {
      const render = WIDGET_RENDERERS[row.id];
      const el = render.patch && (row.layer === 'screen' ? screenHud : worldHud).querySelector('[data-hs-widget="' + row.id + '"]');
      if (el) render.patch(el, ctx);
    }
    for (const id of wm.openIds()) if (WINDOW_RENDERERS[id] && WINDOW_RENDERERS[id].patch) refresh(id);
  }
  const ticker = host.setInterval(patchComponents, DISPLAY_TICK_MS);

  /* A component's own control: [data-hs-act] inside a widget or a window body. */
  function onAct(e) {
    const t = e.target.closest('[data-hs-act]');
    if (!t) return false;
    const box = t.closest('[data-hs-widget],[data-hs-win]');
    if (!box) return false;
    const id = box.getAttribute('data-hs-widget') || box.getAttribute('data-hs-win');
    const render = box.hasAttribute('data-hs-widget') ? WIDGET_RENDERERS[id] : WINDOW_RENDERERS[id];
    if (!render || !render.act) return false;
    const where = box.hasAttribute('data-hs-widget') ? box : box.querySelector('[data-hs-body]');
    render.act(ctx, where, t.getAttribute('data-hs-act'), e, t);
    return true;
  }

  /* Opt-in events: routed only to a renderer whose `.events` names the type. */
  function onExtra(e) {
    const t = e.target && e.target.closest ? e.target.closest('[data-hs-act]') : null;
    const box = t && t.closest('[data-hs-widget],[data-hs-win]');
    if (!box) return;
    const id = box.getAttribute('data-hs-widget') || box.getAttribute('data-hs-win');
    const render = box.hasAttribute('data-hs-widget') ? WIDGET_RENDERERS[id] : WINDOW_RENDERERS[id];
    if (!render || !render.act || !Array.isArray(render.events) || !render.events.includes(e.type)) return;
    const where = box.hasAttribute('data-hs-widget') ? box : box.querySelector('[data-hs-body]');
    if (render.act(ctx, where, t.getAttribute('data-hs-act'), e, t) === true) { e.preventDefault(); e.stopPropagation(); }
  }

  /* ── Input ── */
  function onClick(e) {
    /* the coach's fold and open inside a window (the window's own renderer does not know them) */
    const fold = e.target.closest('.hs-win-coach [data-hs-act]');
    if (fold) { actCoach(ctx, fold.closest('.hs-win-coach'), fold.getAttribute('data-hs-act'), e); return; }
    if (onAct(e)) return;
    const t = e.target.closest('[data-hs-open],[data-hs-close],[data-hs-wreset]');
    if (!t) return;
    if (t.hasAttribute('data-hs-open')) wm.toggle(t.getAttribute('data-hs-open'));
    else if (t.hasAttribute('data-hs-close')) wm.close(t.getAttribute('data-hs-close'));
    else hud.reset();
  }
  /* A range reports on `input` (live), a checkbox on `change`: one write per gesture. */
  function onInput(e) {
    const t = e.target;
    if (e.type === 'change' && t.hasAttribute('data-hs-act')) { onAct(e); return; }
    if (t.hasAttribute('data-hs-wop') && e.type === 'input') {
      hud.setOpacity(t.getAttribute('data-hs-wop'), Number(t.value) / 100);
      const pct = t.nextElementSibling;
      if (pct) pct.textContent = t.value + '%';
    } else if (t.hasAttribute('data-hs-wshow') && e.type === 'change') {
      hud.setVisible(t.getAttribute('data-hs-wshow'), t.checked);
    }
  }
  function onKey(e) { if (wm.handleKey(e)) e.preventDefault(); }
  /* A press on a window raises it (z only: the dock never moves, window-manager.js slots); a press on
     its head (desktop) drags it off the dock. The X is a button: its press raises nothing and drags
     nothing, so the click lands on the same X and closes. */
  function onPointerDown(e) {
    const win = e.target.closest('[data-hs-win]');
    if (!win) return;
    if (e.target.closest('[data-hs-close]')) return;
    const id = win.getAttribute('data-hs-win');
    wm.focus(id);
    if (!phoneMq.matches && pressGrip(e, { wm, store: sizes, host })) return;
    const head = e.target.closest('[data-hs-drag]');
    if (!head || e.button !== 0 || phoneMq.matches) return;
    const b = shell.getBoundingClientRect(), r = win.getBoundingClientRect();
    /* A modal (Configure action) is held wholly inside the World, so the manager takes its measured height. */
    const h = wm.row(id).modal ? r.height : undefined;
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    /* A press that wanders under DRAG_SLOP_PX is a click, not a drag: it never floats the window. */
    let dragging = false;
    const move = (m) => {
      if (!dragging && Math.hypot(m.clientX - e.clientX, m.clientY - e.clientY) < DRAG_SLOP_PX) return;
      dragging = true;
      wm.float(id, { x: m.clientX - b.left - ox, y: m.clientY - b.top - oy, h });
    };
    const up = () => { host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', up); };
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerup', up);
  }
  function onSizeClass() { wm.resize(); hud.reload(); }
  function onResize() { paintWidgets(); }

  shell.addEventListener('click', onClick);
  screen.addEventListener('click', onClick);
  for (const type of EXTRA_EVENTS) { shell.addEventListener(type, onExtra); screen.addEventListener(type, onExtra); }
  shell.addEventListener('input', onInput);
  shell.addEventListener('change', onInput);
  layer.addEventListener('pointerdown', onPointerDown);
  doc.addEventListener('keydown', onKey);
  phoneMq.addEventListener('change', onSizeClass);
  host.addEventListener('resize', onResize);
  followSummary();
  /* A widget's title drags it (desktop) and its dash folds it (src/shell/widget-move.js). */
  const offMoves = mountWidgetMoves({ boxes: [worldHud, screenHud], hud, host, isPhone: () => phoneMq.matches, place: placeWidgets, refresh });
  paintWidgets();
  coach();
  /* A death opens its popup (death-popup.js), on mount too: a death while away shows on return. */
  const offDeaths = followDeaths(ctx);

  return {
    wm, hud,
    open: (id) => wm.open(id),
    close: (id) => wm.close(id),
    toggle: (id) => wm.toggle(id),
    refresh,
    /** Repaint the widgets and patch the open component windows (every applied envelope). */
    paint() { followSummary(); paintWidgets(); for (const id of wm.openIds()) if (WINDOW_RENDERERS[id] && WINDOW_RENDERERS[id].patch) refresh(id); coach(); },
    inset: () => insetNow(),
    /* A subscriber hears the inset as it is NOW, then every change: the mount already published it to
       nobody, and publishInset only repeats a change, so a pane mounted mid-hunt (a reload, a switch of
       the viewed hero) framed the hero in the whole stage, under the party panel and the analyzer. */
    onInset(fn) { insetListeners.add(fn); fn(insetNow()); return () => insetListeners.delete(fn); },
    menu: ctx.menu,
    destroy() {
      offDeaths(); offWm(); offHud(); offMoves();
      if (sized) sized.ro.disconnect();
      ctx.menu.destroy();
      host.clearInterval(ticker);
      doc.removeEventListener('keydown', onKey);
      phoneMq.removeEventListener('change', onSizeClass);
      host.removeEventListener('resize', onResize);
      clearPanelAlpha(ctx.doc);
      shell.remove();
      screen.remove();
    },
  };
}

