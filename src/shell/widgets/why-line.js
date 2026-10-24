// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/why-line.js — A CONTROL'S OWN WORDS, ON ITS LINE, IN VIEW.
//
// The words beside a control: why it is off (what the server's sections already
// say), or what the server answered its last press. A press's answer that
// changes the line is scrolled into view within its window (Tyler 2026-10-24:
// an Equip refused below the fold of the Inventory read as "nothing happened");
// a reason that is simply there when the window opens never moves the scroll.
// ════════════════════════════════════════════════════════════════════════
import { text } from '../../render/paint.js?v=0.2.42';

/** Write `words` into the line `el`; when they are a press's answer (`pressed`) and changed, bring the line into view. */
export function whyLine(el, words, pressed) {
  if (text(el, words) && words && pressed && el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
}
