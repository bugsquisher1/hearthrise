// ════════════════════════════════════════════════════════════════════════
// src/shell/launcher.js — THE ICON ROW AT THE TOP RIGHT (WORLD_SHELL.md §1).
//
// Icons only. Hover or focus shows a tooltip with the label and the shortcut;
// the open window's icon is lit gold with an underline (aria-pressed mirrors it).
// The row is drawn from the window catalogue, so it lists only windows that
// exist, and it is the `launchers` HUD widget, which can never be hidden.
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.30';
import { pointerCardOf } from '../session/tutorial-sections.js?v=0.2.30';

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
 * THE TUTORIAL POINTER (Tyler 10-18: "I'm confused right away"). One line under the icon row: the
 * hunt tutorial card the character is on (src/data/hunt-tutorial.js), read from what the server
 * projects (src/session/tutorial-sections.js), so it advances as the server reports each step done
 * and is the same after a reload. Once the guide is done it names the next goal instead ("What next":
 * the next ground and the weapon skill's next unlock, designer 2026-10-22), so a hero is never left
 * with nothing to aim at. It is drawn only while NO window is open (it would cover the
 * window's title), and not here during a hunt: the hunt top bar draws it under itself
 * (src/shell/widgets/hunt-topbar.js), so it never covers Leave hunt or the analyzer. Display only.
 */
export function pointerFor(ctx) {
  const cs = ctx.character;
  if (!cs || ctx.wm.openIds().length > 0) return '';
  const card = pointerCardOf(cs);
  if (!card) return '';
  return '<p class="hs-pointer" role="note" data-tutorial="' + esc(card.id) + '"><b>' + esc(card.title) + '</b> ' + esc(card.text) + '</p>';
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
  return '<nav class="hs-launchers" aria-label="Windows">' + buttons.join('') + (ctx.hud && ctx.hud.isShown('hunt-topbar') ? '' : pointerFor(ctx)) + '</nav>';
}
