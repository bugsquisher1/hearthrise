// ════════════════════════════════════════════════════════════════════════
// src/shell/launcher-menu.js — THE TOP BAR'S GROUP MENUS (Tyler 2026-11-16: "Our top menu bar is starting to get long again").
//
// The row's plan (which icons stand in the row, which sit in a group's menu: src/data/shell-windows.js `group`, LAUNCHER_GROUPS),
// the one open menu per shell, and the presses and keys that open, walk and shut it. The row's markup and the coach's ring are
// src/shell/launcher.js (renderLaunchers), which hands its own renderer in as `draw`. Display scratch only: gates, spends and
// stores nothing (CLAUDE.md §6).
// ════════════════════════════════════════════════════════════════════════
import { LAUNCHER_GROUPS } from '../data/shell-windows.js?v=0.2.138';
import { markup } from '../render/paint.js?v=0.2.138';

/* ── THE BAR'S GROUPS (Tyler 2026-11-16: "Our top menu bar is starting to get long again"; src/data/shell-windows.js LAUNCHER_GROUPS) ──
   A grouped row's icon lives in its group's menu, one press under the group's own icon. The menu is display scratch per shell (its
   window manager): it opens on a press of the group's icon, and shuts on a pick, a second press, Esc, a press anywhere else, or any
   window opening or closing (a key opened one: the menu has done its job). Gates, spends and stores nothing. */
const GROUP_BY_ID = new Map(LAUNCHER_GROUPS.map((g) => [g.id, g]));

/**
 * THE ROW'S PLAN: [{ row } | { group, rows }] in the catalogue's order; a group stands where its first offered member would, and a
 * group with no offered member is not drawn. Pure; throws on a row naming a group LAUNCHER_GROUPS lacks.
 */
export function barPlan(rows) {
  const out = [], seen = new Map();
  for (const r of rows) {
    if (!r.group) { out.push({ row: r }); continue; }
    if (!GROUP_BY_ID.has(r.group)) throw new Error('launcher: ' + r.id + ' names no group ' + r.group);
    let g = seen.get(r.group);
    if (!g) { g = { group: GROUP_BY_ID.get(r.group), rows: [] }; seen.set(r.group, g); out.push(g); }
    g.rows.push(r);
  }
  return out;
}

const MENU = new WeakMap();   // wm -> { id: the open group, seen: the open windows when it opened }
const openKey = (wm) => wm.openIds().join(',');
/** The group whose menu is open on this shell, or null. A window opened or closed since it opened shuts it. */
export function menuOpenOf(ctx) {
  const m = MENU.get(ctx.wm);
  if (m && m.seen !== openKey(ctx.wm)) { MENU.delete(ctx.wm); return null; }
  return m ? m.id : null;
}
function focusIn(el, q) { const b = el && el.querySelector(q); if (b) b.focus(); }
/* Open group `id`'s menu on this shell (null: shut it) and redraw the row now (`draw`: the row's renderer): the shell repaints a widget
   on its own clock. */
function setMenu(ctx, el, id, draw) {
  if (id) MENU.set(ctx.wm, { id, seen: openKey(ctx.wm) }); else MENU.delete(ctx.wm);
  if (el.isConnected) markup(el, draw(ctx));
  if (!id) return;
  dockClear(el);
  watchOutside(el.ownerDocument);
  if (el.hasAttribute('data-hs-menu-wired')) return;
  el.setAttribute('data-hs-menu-wired', '');
  el.addEventListener('hs-menu-shut', (e) => {
    if (MENU.has(ctx.wm)) setMenu(ctx, el, null, draw);
    if (e.detail && e.detail.focusBack) focusIn(el, '[data-hs-group="' + e.detail.id + '"]');
  });
}
/* THE COACH'S CARD STANDS CLEAR OF THE OPEN MENU (the Coordinator's read 2026-11-16: the Town menu lay over its Got it). The menu's left
   edge, measured from the row's, goes on the row's widget as --hs-menu-left; shell.css docks the card's right end 8 px short of it while
   a menu is open (a phone's menu is a sheet at the right and its card stands at the left: its own rules win there). */
function dockClear(el) {
  const row = el.querySelector('.hs-launchers'), menu = el.querySelector('.hs-launch-menu');
  if (row && menu) el.style.setProperty('--hs-menu-left', Math.round(menu.getBoundingClientRect().left - row.getBoundingClientRect().left) + 'px');
}
/* A press outside the open menu shuts it (the press goes on to whatever it landed on); so does Esc, wherever the focus is, and Esc
   then does nothing else. The row that drew the menu is told (an event on its widget), so its own shell's state goes. Once per document. */
const WATCHED = new WeakSet();
function watchOutside(doc) {
  if (!doc || WATCHED.has(doc)) return;
  WATCHED.add(doc);
  const shut = (focusBack) => {
    for (const box of doc.querySelectorAll('.hs-launch-group.is-menu')) {
      const host = box.closest('[data-hs-widget]');
      if (host) host.dispatchEvent(new CustomEvent('hs-menu-shut', { detail: { id: box.getAttribute('data-hs-group-box'), focusBack } }));
    }
  };
  doc.addEventListener('pointerdown', (e) => { if (!(e.target.closest && e.target.closest('.hs-launch-group.is-menu'))) shut(false); }, true);
  doc.addEventListener('keydown', (e) => {
    const esc = e.key === 'Escape';
    if (!esc || !doc.querySelector('.hs-launch-group.is-menu')) return;
    e.preventDefault(); e.stopPropagation();
    shut(true);
  }, true);
}

/**
 * The row's menu controls: a group's icon (a press opens or shuts its menu; the arrows open it on its first or last line) and a
 * menu's line (a press shuts the menu and opens its window; the arrows, Home and End walk the lines). `draw` is the row's renderer.
 * Answers true or false for a menu action, undefined for any other (the row's own controls).
 */
export function actMenu(ctx, el, action, ev, hit, draw) {
  if (action === 'launch-group') {
    const id = hit.getAttribute('data-hs-group');
    if (ev.type === 'click') { setMenu(ctx, el, menuOpenOf(ctx) === id ? null : id, draw); focusIn(el, '[data-hs-group="' + id + '"]'); return true; }
    if (ev.type === 'keydown' && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
      if (menuOpenOf(ctx) !== id) setMenu(ctx, el, id, draw);
      const items = el.querySelectorAll('.hs-launch-item');
      if (items.length) items[ev.key === 'ArrowUp' ? items.length - 1 : 0].focus();
      return true;
    }
    return false;
  }
  if (action === 'launch-pick') {
    const id = hit.getAttribute('data-hs-open');
    if (ev.type === 'click') { setMenu(ctx, el, null, draw); ctx.wm.open(id); return true; }
    if (ev.type === 'keydown' && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'Home' || ev.key === 'End')) {
      const items = Array.from(el.querySelectorAll('.hs-launch-item'));
      const i = items.indexOf(hit), n = items.length;
      const to = ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : (i + (ev.key === 'ArrowDown' ? 1 : -1) + n) % n;
      items[to].focus();
      return true;
    }
    return false;
  }
  return undefined;
}
