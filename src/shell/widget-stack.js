// ════════════════════════════════════════════════════════════════════════
// src/shell/widget-stack.js — A WIDGET THAT STACKS SITS UNDER THE WIDGETS IT NAMES.
//
// Moved out of shell.js whole (no behaviour change). shell.js's placeWidgets runs it, before and after the
// step-downs. DOM reads and style writes only; it writes a top only when it changed.
// ════════════════════════════════════════════════════════════════════════
import { stackBelow } from './hud.js?v=0.2.130';
import { DOCK_EDGE } from './window-manager.js?v=0.2.130';

/* A widget that stacks (a row's `below`: the tally) sits under the widgets it names on its edge, wherever
   they are now (hud.js stackBelow); a hidden one is in nobody's way, and so is one waiting under the dock (v0.2.130 gate D1:
   the Tally stacked under an analyzer the bag hid, slid left of the bag and was squeezed to 51 px, its row cut, the observer
   looping as each pass moved it). Run again after a step-down. */
export function createWidgetStack({ hud, worldHud, screenHud }) {
  return function stackWidgets() {
    for (const row of hud.rows()) {
      if (!row.below || hud.isMoved(row.id)) continue;
      const box = row.layer === 'screen' ? screenHud : worldHud;
      const el = box.querySelector('[data-hs-widget="' + row.id + '"]');
      if (!el || !el.offsetWidth) continue;
      const b = box.getBoundingClientRect();
      const rel = (e) => { const q = e.getBoundingClientRect(); return { left: q.left - b.left, top: q.top - b.top, width: q.width, height: q.height }; };
      const above = row.below.map((id) => box.querySelector('[data-hs-widget="' + id + '"]')).filter((a) => a && !a.classList.contains('is-under-dock')).map(rel);
      const at = rel(el);
      const top = stackBelow(at, above, DOCK_EDGE);
      if (top !== Math.round(at.top)) el.style.top = top + 'px';
    }
  };
}
