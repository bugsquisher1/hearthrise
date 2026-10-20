// ════════════════════════════════════════════════════════════════════════
// src/shell/launcher.js — THE ICON ROW AT THE TOP RIGHT (WORLD_SHELL.md §1).
//
// Icons only. Hover or focus shows a tooltip with the label and the shortcut;
// the open window's icon is lit gold with an underline (aria-pressed mirrors it).
// The row is drawn from the window catalogue, so it lists only windows that
// exist, and it is the `launchers` HUD widget, which can never be hidden.
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.19';
import { HUNT_TUTORIAL } from '../data/hunt-tutorial.js?v=0.2.19';
import { levelOf } from '../session/character-sections.js?v=0.2.19';
import { huntOf } from '../session/hunt-sections.js?v=0.2.19';

/** The chip text for a row's shortcut key: 'b' -> 'B', 'enter' -> 'Enter'. */
export function keyLabel(key) {
  const k = String(key || '');
  return k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1);
}

/** An inline SVG for a window.HR_GLYPHS key, or '' when the glyph is missing. */
export function glyphSvg(glyphs, key, cls) {
  const d = glyphs && glyphs[key];
  return d ? '<svg class="' + (cls || 'hs-glyph') + '" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><path d="' + esc(d) + '"/></svg>' : '';
}

/**
 * THE FIRST-MINUTE POINTER (Tyler 10-18: "I'm confused right away"). A
 * character that has never fought (Level XP 0, as the server says: Level comes
 * from kills only) and is not hunting gets one line under the Hunts icon: the first
 * hunt tutorial card's words. It goes the moment the first kill pays Level XP, or
 * while Hunts is open. Display only; it reads the server's Level XP and hunt.
 */
function pointerFor(ctx, open) {
  const cs = ctx.character;
  if (!cs || open.has('hunts') || huntOf(cs) || Array.from(open).some((id) => ctx.wm.row(id) && ctx.wm.row(id).modal)) return '';
  const lv = levelOf(cs);
  if (!lv || lv.xp > 0) return '';
  const card = HUNT_TUTORIAL[0];
  return '<p class="hs-pointer" role="note"><b>' + esc(card.title) + '</b> ' + esc(card.text) + '</p>';
}

/** The `launchers` widget body: one button per window row that has a launcher. */
export function renderLaunchers(ctx) {
  const open = new Set(ctx.wm.openIds());
  const buttons = ctx.wm.rows().filter((r) => r.launcher !== false).map((r) => {
    const on = open.has(r.id);
    const key = keyLabel(r.key);
    return '<button type="button" class="hs-launch' + (on ? ' is-open' : '') + '" data-hs-open="' + esc(r.id) + '"'
      + ' aria-pressed="' + on + '" aria-label="' + esc(r.label) + ' (' + esc(key) + ')"'
      + ' data-tip="' + esc(r.label) + '" data-key="' + esc(key) + '">' + glyphSvg(ctx.glyphs, r.glyph) + '</button>';
  });
  return '<nav class="hs-launchers" aria-label="Windows">' + buttons.join('') + pointerFor(ctx, open) + '</nav>';
}
