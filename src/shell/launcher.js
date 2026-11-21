// ════════════════════════════════════════════════════════════════════════
// src/shell/launcher.js — THE ICON ROW AT THE TOP RIGHT (WORLD_SHELL.md §1).
//
// Icons only. Hover or focus shows a tooltip with the label and the shortcut;
// the open window's icon is lit gold with an underline (aria-pressed mirrors it).
// The row is drawn from the window catalogue, so it lists only windows that
// exist, and it is the `launchers` HUD widget, which can never be hidden.
// The coach card under it, its fold and its ring are src/shell/launcher-coach.js.
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../utils/dom.js';
import { gmOf } from '../session/character-sections.js';
import { glyphSvg } from './widgets/bits.js';
import { barPlan, menuOpenOf, actMenu } from './launcher-menu.js';
import { pointerFor, actCoach, rowRing } from './launcher-coach.js';

/** The chip text for a row's shortcut key: 'b' -> 'B', 'enter' -> 'Enter'. */
export function keyLabel(key) {
  const k = String(key || '');
  return k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1);
}

/** An inline SVG for a window.HR_GLYPHS key, or '' when the glyph is missing (src/shell/widgets/bits.js). */
export { glyphSvg };

/**
 * Does the server offer this row to the hero on screen? A Game Master row only to the Game Master; a row tied to a section
 * (src/data/shell-windows.js `section`) only while the server sends that section. The icon row, the All characters sheet
 * and a place's tap (src/app/world-pane.js) read this one answer. Pure.
 */
export function rowOffered(r, cs) {
  if (!r) return false;
  if (r.gm === true && !gmOf(cs)) return false;
  if (typeof r.section === 'string') { const v = cs && typeof cs.read === 'function' ? cs.read(r.section) : null; return !!v && typeof v === 'object'; }
  return true;
}

/* The rows the icon row offers the hero on screen, in the catalogue's order (a grouped row inside its group's menu). */
function launcherRows(ctx) {
  return ctx.wm.rows().filter((r) => r.launcher !== false && rowOffered(r, ctx.character));
}


const iconHtml = (ctx, r, on, ringed) => {
  const key = keyLabel(r.key);
  return '<button type="button" class="hs-launch' + (on ? ' is-open' : '') + '" data-hs-open="' + esc(r.id) + '"'
    + ' aria-pressed="' + on + '" aria-label="' + esc(r.label) + (key ? ' (' + esc(key) + ')' : '') + '"'
    + ' data-tip="' + esc(r.label) + '" data-key="' + esc(key) + '"' + (ringed ? ' data-coach-ring=""' : '') + '>'
    + glyphSvg(ctx.glyphs, r.glyph) + '</button>';
};
/* A member of a group's menu: its glyph, its name and its key (a touch screen has no keys: shell.css). */
const itemHtml = (ctx, r, on, ringed) => {
  const key = keyLabel(r.key);
  return '<button type="button" role="menuitem" class="hs-launch-item' + (on ? ' is-open' : '') + '" data-hs-act="launch-pick" data-hs-open="' + esc(r.id) + '"'
    + (ringed ? ' data-coach-ring=""' : '') + '>' + glyphSvg(ctx.glyphs, r.glyph) + '<span class="hs-launch-label">' + esc(r.label) + '</span>'
    + (key ? '<span class="hs-launch-key" aria-hidden="true">' + esc(key) + '</span>' : '') + '</button>';
};
/* A line of the row's `menuTabs` (src/data/shell-windows.js): its window opened on that tab (launcher-menu.js actMenu), under the window's own line. */
const tabItemHtml = (ctx, r, m) => '<button type="button" role="menuitem" class="hs-launch-item" data-hs-act="launch-pick" data-hs-open="' + esc(r.id) + '" data-hs-tab="' + esc(m.tab) + '">'
  + glyphSvg(ctx.glyphs, m.glyph) + '<span class="hs-launch-label">' + esc(m.label) + '</span></button>';
function groupHtml(ctx, e, open, ring, menu) {
  const g = e.group, shown = menu === g.id;
  const on = e.rows.some((r) => open.has(r.id));
  const inside = e.rows.some((r) => r.id === ring);
  return '<span class="hs-launch-group' + (shown ? ' is-menu' : '') + '" data-hs-group-box="' + esc(g.id) + '">'
    + '<button type="button" class="hs-launch is-group' + (on ? ' is-open' : '') + '" data-hs-group="' + esc(g.id) + '" data-hs-act="launch-group"'
    + ' aria-haspopup="menu" aria-expanded="' + shown + '" aria-label="' + esc(g.label) + '" data-tip="' + esc(g.label) + '" data-key=""'
    + (inside && !shown ? ' data-coach-ring=""' : '') + '>' + glyphSvg(ctx.glyphs, g.glyph) + '</button>'
    + (shown ? '<div class="hs-launch-menu" role="menu" aria-label="' + esc(g.label) + '"><p class="hs-launch-menu-h" aria-hidden="true">' + esc(g.label) + '</p>'
      + e.rows.map((r) => itemHtml(ctx, r, open.has(r.id), r.id === ring) + (r.menuTabs || []).map((m) => tabItemHtml(ctx, r, m)).join('')).join('') + '</div>' : '')
    + '</span>';
}

/** The `launchers` widget body: one button per window row that has a launcher, and one per group (its menu under it while open).
 *  The coach's ring is drawn here when the card's way starts at an icon (src/data/hunt-tutorial.js coachIcon): on the window's icon,
 *  or, for a grouped window, on its item while the menu is open and on the group's icon while it is shut, last of the button's
 *  attributes, exactly as ringCoach (below) would set it, so a row rebuilt for any reason comes back ringed and the coach never adds
 *  or moves a ring after it. The shell redraws the row only when this string changes (src/render/paint.js markup). */
export function renderLaunchers(ctx) {
  const open = new Set(ctx.wm.openIds());
  const ring = rowRing(ctx, open);
  const menu = menuOpenOf(ctx);
  const items = barPlan(launcherRows(ctx)).map((e) => (e.row ? iconHtml(ctx, e.row, open.has(e.row.id), ring === e.row.id) : groupHtml(ctx, e, open, ring, menu)));
  return '<nav class="hs-launchers" aria-label="Windows">' + items.join('') + (ctx.hud && ctx.hud.isShown('hunt-topbar') ? '' : pointerFor(ctx)) + '</nav>';
}

/* The row's own controls: a group's icon (its menu), a menu's item (it opens its window), and the coach's fold and open (an icon
   in the row is [data-hs-open], the shell's). The arrows walk a menu; Esc shuts it and gives the focus back to its group's icon. */
renderLaunchers.events = Object.freeze(['keydown']);
renderLaunchers.act = function actLaunchers(ctx, el, action, ev, hit) {
  const menu = actMenu(ctx, el, action, ev, hit, renderLaunchers);
  if (menu !== undefined) return menu;
  if (ev.type === 'click') actCoach(ctx, el, action, ev);
  return false;
};
