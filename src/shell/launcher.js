// ════════════════════════════════════════════════════════════════════════
// src/shell/launcher.js — THE ICON ROW AT THE TOP RIGHT (WORLD_SHELL.md §1).
//
// Icons only. Hover or focus shows a tooltip with the label and the shortcut;
// the open window's icon is lit gold with an underline (aria-pressed mirrors it).
// The row is drawn from the window catalogue, so it lists only windows that
// exist, and it is the `launchers` HUD widget, which can never be hidden.
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.43';
import { pointerCardOf } from '../session/tutorial-sections.js?v=0.2.43';

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
  const { min, fresh } = coachFoldOf(cs, card);
  /* data-coach: what the box shows (the card, folded or not, marked or not); the hunt bar redraws when it changes. */
  const head = '<p class="hs-pointer' + (min ? ' is-min' : '') + '" role="note" data-tutorial="' + esc(card.id) + '" data-coach="'
    + esc(card.id + (min ? (fresh ? ':new' : ':min') : '')) + '">';
  if (min) {
    return head + '<button type="button" class="hs-coach-tab" data-hs-act="coach-open" aria-expanded="false" aria-label="'
      + esc(card.title + (fresh ? ', something new' : '') + ': show') + '">' + esc(card.title)
      + (fresh ? '<i class="hs-coach-new" aria-hidden="true"></i>' : '') + '</button></p>';
  }
  return head + '<button type="button" class="hs-coach-min" data-hs-act="coach-min" aria-expanded="true" aria-label="Minimize '
    + esc(card.title) + '" title="Minimize"></button><b>' + esc(card.title) + '</b> ' + esc(card.text) + '</p>';
}

/**
 * THE COACH FOLDS (Tyler 2026-10-24: "need an option to minimize"). The residue `coach` (a display preference,
 * per character: src/session/residue.js) holds { min, seen }: folded, the line is its title alone, a tab the player
 * presses to open it again; `seen` is the card the player last had in front of them, so a NEW card (the next
 * tutorial step, a new goal) marks the folded tab without opening it. Gates and spends nothing.
 */
export function coachFoldOf(cs, card) {
  const r = cs && cs.record && cs.record.residue ? cs.record.residue.coach : null;
  const min = !!r && r.min === true;
  return { min, fresh: min && !!card && r.seen !== card.id };
}

/**
 * The coach as a child of a built-once box (the hunt top bar): redrawn only when what it shows changes (data-coach
 * names the card AND its fold, so a fold, an open or a new card redraws it; a display tick never does).
 */
export function placeCoach(el, html) {
  const have = el.querySelector(':scope > .hs-pointer');
  const key = (/data-coach="([a-z0-9_:]+)"/.exec(html) || [])[1] || null;
  if (have && have.getAttribute('data-coach') !== key) have.remove();
  if (key && !(have && have.getAttribute('data-coach') === key)) el.insertAdjacentHTML('beforeend', html);
}

/** The coach's fold and open presses, from either place it is drawn (this row, the hunt top bar). True when handled. */
export function actCoach(ctx, el, action, ev) {
  if (action !== 'coach-min' && action !== 'coach-open') return false;
  if (ev.type !== 'click') return true;
  const cs = ctx.character;
  const card = cs && pointerCardOf(cs);
  if (!card || typeof cs.setResidue !== 'function') return true;
  const doc = el.ownerDocument;
  const hadFocus = !!doc && !!doc.activeElement && el.contains(doc.activeElement);
  /* Opening clears the mark: the card the player now sees is the one they have seen. */
  cs.setResidue('coach', action === 'coach-min' ? { min: true, seen: card.id } : { seen: card.id });
  /* The box is redrawn on the residue change (one repaint per task): keep the keyboard on the coach's control. */
  if (hadFocus) queueMicrotask(() => { const b = el.querySelector('[data-hs-act^="coach-"]'); if (b) b.focus(); });
  return true;
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

/* The row's own controls: the coach's fold and open (the icons are [data-hs-open], the shell's). */
renderLaunchers.act = function actLaunchers(ctx, el, action, ev) { actCoach(ctx, el, action, ev); };
