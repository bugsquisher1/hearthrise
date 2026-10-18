// ════════════════════════════════════════════════════════════════════════
// src/shell/shell.js — THE WORLD SHELL'S DOM HOST: windows and widgets over the World.
//
// mountShell(root) lays three layers over `root` (the World's box) and drives
// them from the pure modules:
//   window-manager.js  which windows are open, docked or floating, and the inset
//   hud.js             which widgets show, how faded, and where they sit
//   renderers.js       what goes inside each window and widget
// Windows are reconciled by id, so opening one never re-renders (or scrolls)
// another; a body re-renders on refresh(id). The World never pauses: windows
// are not modal and have no backdrop.
//
// THE CAMERA INSET: every change to the covered right-edge rect is handed to
// onInset(fn) subscribers and dispatched as `hearthrise:shell-inset` on the
// host, so the World can call its engine's setInset({right}) and keep the hero
// and the target in the uncovered part. World-layer widgets centre in the same
// uncovered rect.
//
// Mounted by src/app/world-pane.js over one character's World.
// ════════════════════════════════════════════════════════════════════════
import { MOBILE_QUERY } from '../world/core/camera.js?v=0.1.0';
import { SHELL_WINDOWS } from '../data/shell-windows.js?v=0.1.0';
import { HUD_WIDGETS } from '../data/hud-widgets.js?v=0.1.0';
import { createWindowManager, DOCK_EDGE } from './window-manager.js?v=0.1.0';
import { createHud, residueStore, placeWidget } from './hud.js?v=0.1.0';
import { keyLabel, glyphSvg } from './launcher.js?v=0.1.0';
import { WINDOW_RENDERERS, WIDGET_RENDERERS } from './renderers.js?v=0.1.0';
import { escapeHtml as esc } from '../utils/dom.js?v=0.1.0';

/**
 * @param {HTMLElement} root   the World's box; the shell fills it
 * @param {object} [o]
 * @param {object} o.character   the CharacterSession this shell belongs to (its HUD layout is that character's residue)
 * @param {HTMLElement} [o.screen]    the whole-screen box (strip included) for screen widgets; default body
 * @param {() => boolean} [o.inHunt]   true while a hunt runs ('hunt' widgets)
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

  const wm = createWindowManager({
    windows: SHELL_WINDOWS,
    isPhone: () => phoneMq.matches,
    world: () => ({ width: shell.clientWidth, height: shell.clientHeight }),
    reducedMotion,
    schedule: (fn, ms) => host.setTimeout(fn, ms),
  });
  const hud = createHud({
    widgets: HUD_WIDGETS,
    sizeClass: () => (phoneMq.matches ? 'phone' : 'desktop'),
    store: residueStore(opts.character),
    inHunt: opts.inHunt,
  });
  const insetListeners = new Set();
  const ctx = { wm, hud, refresh, get glyphs() { return host.HR_GLYPHS || {}; }, character: opts.character || null };

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
      + '<div class="hs-win-body" data-hs-body></div>';
    return el;
  }

  function refresh(id) {
    const el = layer.querySelector('[data-hs-win="' + id + '"]');
    const render = WINDOW_RENDERERS[id];
    if (el && render) el.querySelector('[data-hs-body]').innerHTML = render(ctx);
  }

  function paintWindows() {
    const placed = wm.layout();
    const keep = new Set(placed.map((p) => p.id));
    for (const el of Array.from(layer.children)) if (!keep.has(el.getAttribute('data-hs-win'))) el.remove();
    for (const p of placed) {
      let el = layer.querySelector('[data-hs-win="' + p.id + '"]');
      if (!el) { el = frame(wm.row(p.id)); layer.appendChild(el); refresh(p.id); }
      el.classList.toggle('is-entering', p.entering);
      el.classList.toggle('is-leaving', p.leaving);
      el.classList.toggle('is-floating', !p.docked);
      el.classList.toggle('is-top', p.top);
      el.style.zIndex = String(p.z);
      el.style.width = p.width ? p.width + 'px' : '';
      el.style.right = p.docked && !p.phone ? p.right + 'px' : '';
      el.style.left = p.docked ? '' : p.x + 'px';
      el.style.top = p.docked ? '' : p.y + 'px';
    }
  }

  /* ── Widgets: shown, faded and placed from the layout ── */
  function paintWidgets() {
    worldHud.style.right = wm.inset().right + 'px';
    for (const row of hud.rows()) {
      const box = row.layer === 'screen' ? screenHud : worldHud;
      let el = box.querySelector('[data-hs-widget="' + row.id + '"]');
      if (!hud.isShown(row.id)) { if (el) el.remove(); continue; }
      if (!el) {
        el = doc.createElement('div');
        el.className = 'hs-widget is-' + row.id;
        el.setAttribute('data-hs-widget', row.id);
        box.appendChild(el);
      }
      const html = WIDGET_RENDERERS[row.id](ctx);
      if (el.innerHTML !== html) el.innerHTML = html;
      const L = hud.layoutOf(row.id);
      el.style.setProperty('--hs-op', String(L.opacity));
      el.style.minWidth = row.min[0] + 'px';
      el.style.minHeight = row.min[1] + 'px';
      const at = placeWidget(L, { width: box.clientWidth, height: box.clientHeight }, { width: el.offsetWidth, height: el.offsetHeight });
      el.style.left = at.left + 'px';
      el.style.top = at.top + 'px';
    }
    /* Widgets never overlap: a centred widget that lands on an edge-anchored
       one (the dock narrowing the World) steps clear of it when there is room. */
    for (const box of [worldHud, screenHud]) {
      const els = Array.from(box.querySelectorAll('[data-hs-widget]'));
      const centred = (e) => hud.layoutOf(e.getAttribute('data-hs-widget')).anchor[1] === 'c';
      const edges = els.filter((e) => !centred(e)).map((e) => e.getBoundingClientRect());
      const b = box.getBoundingClientRect();
      for (const e of els.filter(centred)) {
        const r = e.getBoundingClientRect();
        const hit = edges.find((q) => r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top);
        if (hit && hit.right + DOCK_EDGE + r.width <= b.right) e.style.left = Math.round(hit.right - b.left + DOCK_EDGE) + 'px';
      }
    }
  }

  function onWm(ev) {
    paintWindows();
    paintWidgets();
    if (!ev.insetChanged) return;
    for (const fn of insetListeners) fn(ev.inset);
    host.dispatchEvent(new host.CustomEvent('hearthrise:shell-inset', { detail: ev.inset }));
  }
  const offWm = wm.subscribe(onWm);
  /* A reset or a size-class reload moves every line of the HUD layout window too. */
  const offHud = hud.subscribe((id) => { paintWidgets(); if (id === null) for (const w of wm.openIds()) refresh(w); });

  /* ── Input ── */
  function onClick(e) {
    const t = e.target.closest('[data-hs-open],[data-hs-close],[data-hs-wreset]');
    if (!t) return;
    if (t.hasAttribute('data-hs-open')) wm.toggle(t.getAttribute('data-hs-open'));
    else if (t.hasAttribute('data-hs-close')) wm.close(t.getAttribute('data-hs-close'));
    else hud.reset();
  }
  /* A range reports on `input` (live), a checkbox on `change`: one write per gesture. */
  function onInput(e) {
    const t = e.target;
    if (t.hasAttribute('data-hs-wop') && e.type === 'input') {
      hud.setOpacity(t.getAttribute('data-hs-wop'), Number(t.value) / 100);
      const pct = t.nextElementSibling;
      if (pct) pct.textContent = t.value + '%';
    } else if (t.hasAttribute('data-hs-wshow') && e.type === 'change') {
      hud.setVisible(t.getAttribute('data-hs-wshow'), t.checked);
    }
  }
  function onKey(e) { if (wm.handleKey(e)) e.preventDefault(); }
  /* A press on a window raises it; a press on its head (desktop) drags it off the dock. */
  function onPointerDown(e) {
    const win = e.target.closest('[data-hs-win]');
    if (!win) return;
    const id = win.getAttribute('data-hs-win');
    wm.focus(id);
    const head = e.target.closest('[data-hs-drag]');
    if (!head || e.target.closest('[data-hs-close]') || phoneMq.matches) return;
    const b = shell.getBoundingClientRect(), r = win.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    const move = (m) => wm.float(id, { x: m.clientX - b.left - ox, y: m.clientY - b.top - oy });
    const up = () => { host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', up); };
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerup', up);
  }
  function onSizeClass() { wm.resize(); hud.reload(); }
  function onResize() { paintWidgets(); }

  shell.addEventListener('click', onClick);
  screen.addEventListener('click', onClick);
  shell.addEventListener('input', onInput);
  shell.addEventListener('change', onInput);
  layer.addEventListener('pointerdown', onPointerDown);
  doc.addEventListener('keydown', onKey);
  phoneMq.addEventListener('change', onSizeClass);
  host.addEventListener('resize', onResize);
  paintWidgets();

  return {
    wm, hud,
    open: (id) => wm.open(id),
    close: (id) => wm.close(id),
    toggle: (id) => wm.toggle(id),
    refresh,
    /** Repaint the widgets (the cutover calls this when the envelope moves what they show). */
    paint: paintWidgets,
    inset: () => wm.inset(),
    onInset(fn) { insetListeners.add(fn); return () => insetListeners.delete(fn); },
    destroy() {
      offWm(); offHud();
      doc.removeEventListener('keydown', onKey);
      phoneMq.removeEventListener('change', onSizeClass);
      host.removeEventListener('resize', onResize);
      shell.remove();
      screen.remove();
    },
  };
}

