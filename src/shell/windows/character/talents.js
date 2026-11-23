// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/character/talents.js — THE TALENTS TAB, THE SAMPLE'S CARD (lane/roads-sample, 2026-11-23).
//
// docs/design/redesign/18-roads-review-ux.md (R12: on a phone the default is a road card, the map the planning view). This is that card
// and nothing more: the points the hero has to spend, the next fork on its suggested road with its three options, and "Spend as
// suggested". The map, the route preview and the zoom levels are a later lane (R-UI). Every number is the server's (the `talents`
// section): the tab is hidden while the server sends none (the switch off). One press is ONE intent (src/session/talent-intents.js);
// what changes is only what the answer's envelope says.
// ════════════════════════════════════════════════════════════════════════
import { talentsOf, spendSuggested, spendTalent } from '../../../session/talent-intents.js';
import { equipmentOf } from '../../../session/item-sections.js';
import { wornRoleKey } from '../../../data/hunt-roles.js';
import { ITEMS } from '../../../data/items.js';
import { ABILITIES } from '../../../data/abilities.js';
import { rows, text, prop, cls, element } from '../../../render/paint.js';
import { whole } from '../../../render/format.js';
import { runIntent } from '../../intent-words.js';

export const TALENTS_TAB = 'Talents';

/* the worn set's role key (the same the server's hr_hunt_weapon_of reads), for the fork on its weapon's road */
const roleKeyOf = (cs) => { const eq = equipmentOf(cs); return eq && eq.weapon && ITEMS[eq.weapon] ? wornRoleKey(eq, ITEMS) : null; };
/* the plan the card suggests for: a party (the company joins at Level 5, 17 section 13) */
const PLAN = 'party';

/** Is the tab offered: the server sends the section only while the switch is on. */
export const talentsShown = (cs) => talentsOf(cs, roleKeyOf(cs), PLAN) !== null;

/** The tab's skeleton. */
export function talentsHtml() {
  return '<section class="hw-cs-talents">'
    + '<p class="hw-tl-points"></p>'
    + '<h3 class="hw-tl-fork"></h3><p class="hs-note hw-tl-cost"></p>'
    + '<ul class="hw-ledger hw-tl-options"></ul>'
    + '<button type="button" class="hh-tool" data-hs-act="tl-suggested">Spend as suggested</button>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></section>';
}

/** Patch the tab. */
export function patchTalents(body, ctx, sc) {
  const cs = ctx.character;
  const root = body.querySelector('.hw-cs-talents');
  const tl = talentsOf(cs, roleKeyOf(cs), PLAN);
  text(root.querySelector('.hw-tl-points'), !tl ? '' : tl.left ? whole(tl.left) + (tl.left === 1 ? ' point to spend' : ' points to spend') : 'All points spent');
  const f = tl && tl.fork;
  /* the road's move names the fork ("Mend, Crossroads I"): every move's road has a Crossroads I */
  text(root.querySelector('.hw-tl-fork'), f ? 'Next fork: ' + (f.move && ABILITIES[f.move] ? ABILITIES[f.move].n + ', ' : '') + f.n : '');
  text(root.querySelector('.hw-tl-cost'), f ? (f.cost === 1 ? 'Your next point' : whole(f.cost) + ' points away') : '');
  /* the fork is the hero's very next point: each option can be taken here (one intent), else the card only reads ahead */
  const now = !!f && f.cost === 1 && tl.left > 0;
  rows(root.querySelector('.hw-tl-options'), f ? f.options : [], {
    key: (o) => f.id + ':' + o.id,
    build: (o) => element(ctx.doc, '<li class="hw-line"><span class="hw-line-name"><b></b><small></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="tl-take" data-node="' + f.id + '" data-pick="' + o.id + '">Take</button></li>'),
    patch: (li, o) => {
      cls(li, 'is-current', o.suggested);
      text(li.querySelector('b'), o.suggested ? o.n + ' (Suggested)' : o.n);
      text(li.querySelector('small'), o.tip);
      const b = li.querySelector('button');
      prop(b, 'hidden', !now);
      prop(b, 'disabled', sc.pending);
    },
  });
  prop(root.querySelector('[data-hs-act="tl-suggested"]'), 'disabled', !tl || !tl.left || sc.pending);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
}

/** One press on the tab; true when it was the tab's. */
export function actTalents(ctx, sc, action, ev, el, repaint) {
  if (ev.type !== 'click') return false;
  if (action === 'tl-suggested') {
    runIntent(sc, repaint, () => spendSuggested(ctx.account, ctx.character, PLAN), 'Spending…',
      (r) => (r.spent === 1 ? '1 point spent' : whole(r.spent || 0) + ' points spent'), ctx.character);
    return true;
  }
  if (action === 'tl-take') {
    const node = el.getAttribute('data-node'), pick = el.getAttribute('data-pick');
    runIntent(sc, repaint, () => spendTalent(ctx.account, ctx.character, node, pick), 'Taking…', () => 'Taken', ctx.character);
    return true;
  }
  return false;
}
