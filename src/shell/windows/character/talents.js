// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/character/talents.js — THE TALENTS TAB, THE SAMPLE'S CARD (lane/roads-sample, 2026-11-23).
//
// docs/design/redesign/18-roads-review-ux.md (R12: on a phone the default is a road card, the map the planning view). This is that card
// and nothing more: the points the hero has to spend, the next fork on its suggested road with its three options, and "Spend as
// suggested". The map, the route preview and the zoom levels are a later lane (R-UI). Every number is the server's (the `talents`
// section): the tab is hidden while the server sends none (the switch off). One press is ONE intent (src/session/talent-intents.js);
// what changes is only what the answer's envelope says. The words are src/data/text/talents.js's.
// ════════════════════════════════════════════════════════════════════════
import { talentsOf } from '../../../session/talent-sections.js';
import { spendSuggested, spendTalent } from '../../../session/talent-intents.js';
import { equipmentOf } from '../../../session/item-sections.js';
import { wornRoleKey } from '../../../data/hunt-roles.js';
import { ITEMS } from '../../../data/items.js';
import { ABILITIES } from '../../../data/abilities.js';
import { rows, text, prop, cls, element } from '../../../render/paint.js';
import { whole } from '../../../render/format.js';
import { runIntent } from '../../intent-words.js';
import { t } from '../../../render/player-text.js';

export const TALENTS_TAB = t('talents.tab');

/* the worn set's role key (the same the server's hr_hunt_weapon_of reads), for the fork on its weapon's road */
const roleKeyOf = (cs) => { const eq = /** @type {{ weapon?: string }} */ (equipmentOf(cs) || {}); return eq && eq.weapon && ITEMS[eq.weapon] ? wornRoleKey(eq, ITEMS) : null; };
/* the plan the card suggests for: a party (the company joins at Level 5, 17 section 13) */
const PLAN = 'party';
/* the hero's Roads as the server holds them (null: the switch off, so the tab is hidden) */
const roadsOf = (cs) => talentsOf(cs, roleKeyOf(cs), PLAN);

/** Is the tab offered: the server sends the section only while the switch is on. */
export const talentsShown = (cs) => roadsOf(cs) !== null;

/** The tab's skeleton. */
export function talentsHtml() {
  return '<section class="hw-cs-talents">'
    + '<p class="hw-tl-points"></p>'
    + '<h3 class="hw-tl-fork"></h3><p class="hs-note hw-tl-cost"></p>'
    + '<ul class="hw-ledger hw-tl-options"></ul>'
    + '<button type="button" class="hh-tool" data-hs-act="tl-suggested"></button><p class="hs-note hw-tl-why"></p>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></section>';
}

/** Patch the tab. */
export function patchTalents(body, ctx, sc) {
  const cs = ctx.character;
  const root = body.querySelector('.hw-cs-talents');
  const tl = roadsOf(cs);
  const left = tl ? tl.left : 0;
  text(root.querySelector('.hw-tl-points'), left ? t('talents.points', { count: whole(left) }) : t('talents.points_none'));
  const f = tl && tl.fork;
  /* the road's move names the fork ("Mend, Crossroads I"): every move's road has a Crossroads I */
  const move = f && f.move && ABILITIES[f.move] ? t('talents.fork_move', { move: ABILITIES[f.move].n }) : '';
  text(root.querySelector('.hw-tl-fork'), f ? t('talents.fork', { move, node: f.n }) : '');
  text(root.querySelector('.hw-tl-cost'), f ? (f.cost === 1 ? t('talents.fork_next') : t('talents.fork_away', { count: whole(f.cost) })) : '');
  /* the fork is the hero's very next point: each option can be taken here (one intent), else the card only reads ahead */
  const now = !!f && f.cost === 1 && left > 0;
  rows(root.querySelector('.hw-tl-options'), f ? f.options : [], {
    key: (o) => f.id + ':' + o.id,
    build: (o) => element(ctx.doc, '<li class="hw-line"><span class="hw-line-name"><b></b><small></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="tl-take" data-node="' + f.id + '" data-pick="' + o.id + '"></button></li>'),
    patch: (li, o) => {
      cls(li, 'is-current', o.suggested);
      text(li.querySelector('b'), o.suggested ? t('talents.suggested', { name: o.n }) : o.n);
      text(li.querySelector('small'), o.tip);
      const b = li.querySelector('button');
      text(b, t('talents.take'));
      prop(b, 'hidden', !now);
      prop(b, 'disabled', sc.pending);
    },
  });
  const go = root.querySelector('[data-hs-act="tl-suggested"]');
  text(go, t('talents.spend_suggested'));
  /* off with no point to spend, and the line beside it says so (tests/say-why.mjs SW-2) */
  const noPoints = !tl || !left;
  prop(go, 'disabled', noPoints || sc.pending);
  text(root.querySelector('.hw-tl-why'), noPoints ? t('talents.no_points') : '');
  text(root.querySelector('.hh-intent-msg'), sc.msg);
}

/** One press on the tab; true when it was the tab's. */
export function actTalents(ctx, sc, action, ev, el, repaint) {
  if (ev.type !== 'click') return false;
  if (action === 'tl-suggested') {
    runIntent(sc, repaint, () => spendSuggested(ctx.account, ctx.character, PLAN), t('talents.spending'),
      (r) => (r.spent === 1 ? t('talents.spent_one') : t('talents.spent_many', { count: whole(r.spent || 0) })), ctx.character);
    return true;
  }
  if (action === 'tl-take') {
    const node = el.getAttribute('data-node'), pick = el.getAttribute('data-pick');
    runIntent(sc, repaint, () => spendTalent(ctx.account, ctx.character, node, pick), t('talents.taking'), () => t('talents.taken'), ctx.character);
    return true;
  }
  return false;
}
