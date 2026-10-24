// ════════════════════════════════════════════════════════════════════════
// src/shell/coach.js — THE COACH'S GOLD RING: THE REAL CONTROL A CARD NAMES.
//
// The designer's playtest (2026-10-24, 5/10 desktop, 4/10 phone): no card rang a
// real control, and a card that pointed into a window vanished the moment that
// window opened. Huntera's quick start (memory `huntera-tutorial-model`, mechanics
// only) rings the very control the card names and keeps the card beside it. Here:
//   - the window a card's controls live in (hunt-tutorial.js TUTORIAL_ANCHORS `window`,
//     coachWindow): while it is open the card shows INSIDE it, at its top
//     (src/shell/shell.js; the launcher row's line hides while any window is open,
//     so it never covers a title);
//   - ONE control on screen carries `data-coach-ring` (src/styles/shell.css draws a
//     pixel gold ring, no glow): the deepest step of the card's way that is on
//     screen now (ringPlan, pure), e.g. Hunts' icon -> the Mill Cellar's line -> Enter.
//     The icon row draws its own ring (launcher.js renderLaunchers, coachIcon) so its
//     HTML never differs from what it renders.
// The card is launcher.js heldCard (the server's card, held long enough to read).
// Display only: nothing here gates, spends or stores anything (CLAUDE.md §6).
// ════════════════════════════════════════════════════════════════════════
import { coachIcon } from '../data/hunt-tutorial.js?v=0.2.42';
import { draftOf } from './bar-draft.js?v=0.2.42';
import { tallyOf } from '../session/tally-sections.js?v=0.2.42';

const inWin = (id, q) => '[data-hs-win="' + id + '"] ' + q;

/**
 * THE RING'S WAY: the selectors of the controls `card` names, deepest first (the first one on screen is ringed).
 * `at`: { open(id) the window is open, configuring: the bar slot Configure action has open (or null), weight: the
 * armor weight Tamsin pays in is chosen (the server's), or null when unknown }. Pure. [] = nothing to ring.
 */
export function ringPlan(card, at) {
  if (!card) return [];
  const g = card.ring || {};
  const open = (id) => !!at && typeof at.open === 'function' && at.open(id);
  const icon = coachIcon(card, open);
  if (icon) return ['.hs-launchers [data-hs-open="' + icon + '"]'];
  switch (card.anchor) {
    case 'hunt_picker': {
      const hunt = card.done && card.done.hunt;
      /* Enter while the ground is the picked one and on screen; else its line (a phone shows the list first); on a
         phone showing ANOTHER ground's page, the way back to the list */
      return [inWin('hunts', '.hw-hunt-enter[data-hunt="' + hunt + '"]:not([disabled])'),
        inWin('hunts', '.hw-hunt[data-hunt="' + hunt + '"]'), '[data-hs-win="hunts"]:not(:has(.hw-hunt-enter[data-hunt="' + hunt + '"])) .hw-hd-back'];
    }
    case 'hunt_topbar': return ['[data-hs-widget="hunt-topbar"] [data-hs-act="leave"]:not([disabled])'];
    case 'action_bar': {
      if (!Number.isInteger(card.barSlot)) return [];
      return open('configure-action') && at.configuring === card.barSlot ? [inWin('configure-action', '[data-x="save"]:not([disabled])')]
        : ['[data-hs-widget="action-bar"] .hb-slot[data-slot="' + card.barSlot + '"]'];
    }
    case 'farm':
      return [inWin('farm', '.hw-seeds .hw-line[data-crop="' + g.crop + '"] [data-hs-act="sow"]:not([disabled])'),
        inWin('farm', '.hw-plot.is-empty [data-hs-act="plant"]')];
    case 'crafting':
      /* its Start (once it runs, nothing: the card moves on with the first XP); the skill in the ledger; from ANOTHER
         skill's page, the way back to the ledger */
      return [inWin('skills-trade', '.hw-work.is-on .hw-work-row[data-id="' + g.work + '"] [data-hs-act="work-go"]:not([disabled])'),
        inWin('skills-trade', '.hw-skill[data-key="' + g.skill + '"]'),
        inWin('skills-trade', '.hw-work.is-on:not(:has(.hw-work-row[data-id="' + g.work + '"])) [data-hs-act="work-back"]')];
    case 'tally':
      return at.weight === false ? [inWin('tally', '.ht-weights')]
        : [inWin('tally', '[data-hs-act="take"][data-task="' + g.task + '"]:not([disabled])')];
    default: return [];
  }
}

/* On screen: laid out, and not inside anything hidden. */
const shown = (el) => el.getClientRects().length > 0 && !el.closest('[hidden]');

/* A ring that lands below a window's fold (Tamsin's Take under her weight row, a ground low in the list) is scrolled
   into view inside its window, once, as it lands: only the window's own scroll box moves, never the page or the World. */
function reveal(el) {
  for (let p = el.parentElement; p && !p.hasAttribute('data-hs-win'); p = p.parentElement) {
    if (p.scrollHeight <= p.clientHeight + 1) continue;
    const oy = p.ownerDocument.defaultView.getComputedStyle(p).overflowY;
    if (oy !== 'auto' && oy !== 'scroll') continue;
    const r = el.getBoundingClientRect(), b = p.getBoundingClientRect();
    if (r.top < b.top) p.scrollTop -= b.top - r.top + 8;
    else if (r.bottom > b.bottom) p.scrollTop += r.bottom - b.bottom + 8;
    return;
  }
}

/**
 * Ring `card`'s control in `roots` (the shell's boxes: the World shell and the screen layer): the first selector of its
 * way that is on screen gets `data-coach-ring`, and every other element loses it. Answers the ringed element or null.
 */
export function ringCoach(ctx, card, roots) {
  const cs = ctx.character;
  const t = cs && tallyOf(cs);
  const plan = ringPlan(card, { open: (id) => ctx.wm.isOpen(id), configuring: cs ? draftOf(cs).open : null, weight: t ? !!t.weight : null });
  let target = null;
  for (const q of plan) {
    for (const r of roots) { const el = r.querySelector(q); if (el && shown(el)) { target = el; break; } }
    if (target) break;
  }
  for (const r of roots) for (const el of r.querySelectorAll('[data-coach-ring]')) if (el !== target) el.removeAttribute('data-coach-ring');
  if (target && !target.hasAttribute('data-coach-ring')) { target.setAttribute('data-coach-ring', ''); reveal(target); }
  return target;
}
