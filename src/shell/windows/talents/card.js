// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/talents/card.js — THE ROADS' NODE CARD: WHAT A STONE IS, ITS ROUTE AND ITS COST, AND THE ONE PRESS THAT BUYS IT.
//
// docs/design/redesign/18-roads-review-ux.md section 5: Cost · You have · Reach at Level N · On the way · Requires, then the options of
// a choice. Desktop: a column beside the map. Phone: a 300 px sheet over the map's right edge (roads.css), closed by its X or a tap on
// empty map. Every number is the server's (`talents` section) or the catalogue's: the route is read from the server's build
// (src/core/talent-route.js). A Take is ONE intent (src/session/talent-intents.js spendTalent), ON only while the server's build lets
// this node be bought now (src/core/talents.js spendProblem on the server's nodes, points and Level, the very questions
// hr_talent_spend asks), and OFF while a press is in flight; the line beside it says why it is off (tests/say-why.mjs SW-2).
// What changes after a Take is only what the answer's envelope says.
// ════════════════════════════════════════════════════════════════════════
import { NODE_INDEX, PICK_KINDS, TALENT_RULES } from '../../../data/talents.js';
import { ABILITIES } from '../../../data/abilities.js';
import { optionsOf, spendProblem, borrowBand } from '../../../core/talents.js';
import { rows, text, prop, cls, attr, element } from '../../../render/paint.js';
import { whole } from '../../../render/format.js';
import { REFUSAL_WORDS } from '../../../data/refusal-words.js';
import { t } from '../../../render/player-text.js';
import { planFor, patchPlanNone, patchPlanPick } from './road-plan.js';

/** The card's skeleton. */
export function cardHtml() {
  return '<aside class="rdw-card" aria-live="polite">'
    + '<div class="rdw-none"><p class="rdw-row"><span></span><b class="rdw-none-points"></b></p><p class="rdw-row"><span></span><b class="rdw-none-fork"></b></p>'
    + '<button type="button" class="hh-tool is-link rdw-none-show" data-hs-act="rd-show"></button>'
    /* the plan (./road-plan.js): the server's saved build for the hero's hunt */
    + '<div class="rdw-plan"><p class="rdw-row"><span></span><b></b></p><p class="rdw-row"><span></span><b></b></p>'
    + '<div class="rdw-do"><button type="button" class="hh-tool" data-hs-act="rd-plan-pay"></button>'
    + '<button type="button" class="hh-tool is-link" data-hs-act="rd-plan-clear"></button><p class="hs-note rdw-plan-why"></p></div></div></div>'
    + '<div class="rdw-sel">'
    + '<div class="rdw-card-head"><p class="rdw-kind"></p><button type="button" class="hh-tool is-link rdw-x" data-hs-act="rd-clear"></button></div>'
    + '<h3 class="rdw-name"></h3><p class="rdw-tip"></p><p class="rdw-state"></p><p class="rdw-state rdw-planned"></p>'
    + '<ul class="rdw-opts"></ul>'
    + '<div class="rdw-route"><h4 class="hs-sub rdw-route-h"></h4>'
    + '<p class="rdw-row" data-row="cost"><span></span><b></b></p><p class="rdw-row" data-row="have"><span></span><b></b></p>'
    + '<p class="rdw-row" data-row="reach"><span></span><b></b></p><p class="rdw-row" data-row="way"><span></span><b></b></p>'
    + '<p class="rdw-row" data-row="needs"><span></span><b></b></p></div>'
    + '<div class="rdw-do"><button type="button" class="hh-tool rdw-take" data-hs-act="rd-take"></button><p class="hs-note rdw-why"></p></div>'
    + '<div class="rdw-do"><button type="button" class="hh-tool rdw-plan-go" data-hs-act="rd-plan"></button><p class="hs-note rdw-plan-off"></p></div>'
    + '<button type="button" class="hh-tool is-link rdw-step" data-hs-act="rd-step"></button>'
    + '</div><p class="hh-intent-msg" role="status" aria-live="polite"></p></aside>';
}

const COUNTRY = (c) => t('talents.country_' + c);
/* a stone's name as the card says it: a rank stone by its move ("Greater Mend +1 rank"), any other by its own */
const nameOf = (n) => (n.kind === 'rank' && n.move && ABILITIES[n.move] ? t('talents.rank_name', { move: ABILITIES[n.move].n }) : n.n);
const kindWords = (n) => {
  const k = t('talents.kind_' + n.kind);
  if (n.move && ABILITIES[n.move]) return t('talents.kind_of', { kind: k, of: ABILITIES[n.move].n });
  if (n.countries) return t('talents.kind_of', { kind: k, of: n.countries.map(COUNTRY).join(' · ') });
  if (n.kind === 'vow' && n.country) return t('talents.kind_of', { kind: k, of: COUNTRY(n.country) });
  return k;
};
/* the server's words for a spend problem (src/data/refusal-words.js, the same the press's refusal reads) */
const why = (code) => (!code ? '' : Object.prototype.hasOwnProperty.call(REFUSAL_WORDS, code) ? REFUSAL_WORDS[code] : t('talents.locked'));
const row = (root, k, label, value, on = true) => {
  const el = root.querySelector('[data-row="' + k + '"]');
  attr(el, 'hidden', on ? null : '');
  text(el.querySelector('span'), label); text(el.querySelector('b'), value);
  return el;
};

/**
 * Patch the card. `v`: { tl (the section), sel (node id | null), route (talent-route routeTo | null), states, fork (the next suggested
 * node id | null), pending, msg, plan (./road-plan.js planOf: the server's saved build for the hero's hunt), suggest (the plan word a
 * choice on a planned route takes its suggested option for) }.
 */
export function patchCard(root, ctx, v) {
  const { tl, sel, pending } = v;
  const n = sel && NODE_INDEX[sel] ? NODE_INDEX[sel] : null;
  cls(root, 'is-open', !!n);
  const none = root.querySelector('.rdw-none'), box = root.querySelector('.rdw-sel');
  attr(none, 'hidden', n ? '' : null); attr(box, 'hidden', n ? null : '');
  text(root.querySelector('.hh-intent-msg'), v.msg || '');
  if (!n) {
    const ps = none.querySelectorAll('.rdw-row');
    text(ps[0].querySelector('span'), t('talents.points_label')); text(ps[0].querySelector('b'), whole(tl ? tl.left : 0));
    const f = v.fork && NODE_INDEX[v.fork];
    text(ps[1].querySelector('span'), t('talents.next_label')); text(ps[1].querySelector('b'), f ? nameOf(f) : '');
    attr(ps[1], 'hidden', f ? null : '');
    const show = none.querySelector('.rdw-none-show');
    text(show, t('talents.show')); attr(show, 'hidden', f ? null : '');
    patchPlanNone(none.querySelector('.rdw-plan'), tl, v.plan, pending);
    return;
  }
  text(root.querySelector('.rdw-x'), t('talents.close'));
  text(root.querySelector('.rdw-kind'), kindWords(n));
  text(root.querySelector('.rdw-name'), nameOf(n));
  /* a rank stone's name says it all ("Greater Mend +1 rank"); every other stone's tip is its rule */
  text(root.querySelector('.rdw-tip'), n.kind === 'rank' ? '' : n.tip || '');
  const st = v.states[sel] || 'locked';
  const owned = st === 'owned';
  const held = tl && tl.nodes ? tl.nodes[sel] : undefined;
  text(root.querySelector('.rdw-state'), owned ? (n.kind === 'open' && Number.isInteger(held) ? t('talents.owned_n', { count: whole(held) }) : t('talents.owned')) : '');
  const level = tl ? tl.level : 1;
  const nodes = tl ? tl.nodes : {};
  const live = !!tl;
  /* the gate reads the server's own numbers: its nodes and Level through the rules hr_talent_spend asks, and its points left, so a press
     is never on while the server's section says there is no point to spend (CLAUDE.md §6: fail safe to off) */
  const problemOf = (pick) => (!live ? 'talents_closed' : !(tl.left > 0) ? 'no_points' : spendProblem(nodes, sel, pick, level));
  /* the options of a choice: each its own Take, on only when the server's build lets this one be bought now */
  const isPick = PICK_KINDS.includes(n.kind);
  rows(root.querySelector('.rdw-opts'), isPick ? optionsOf(n) : [], {
    key: (o) => sel + ':' + o.id,
    build: (o) => element(ctx.doc, '<li class="rdw-opt"><span class="rdw-opt-name"><b></b><small></small><small class="rdw-opt-at"></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="rd-take" data-pick="' + o.id + '"></button>'
      + '<button type="button" class="hh-tool rdw-opt-plan" data-hs-act="rd-plan" data-pick="' + o.id + '"></button></li>'),
    patch: (li, o) => {
      const picked = held === o.id;
      cls(li, 'is-current', picked);
      cls(li, 'is-passed', !!held && !picked);
      text(li.querySelector('b'), picked ? t('talents.picked', { name: o.n }) : o.n);
      text(li.querySelector('small'), o.tip);
      /* a lent move opens at a Level (17 section 3: by value): the card says which */
      const lend = o.effects.find((e) => e.kind === 'borrow');
      const band = lend ? borrowBand(lend.move, n.kind === 'crossing' ? 'havora' : 'border') : null;
      text(li.querySelector('.rdw-opt-at'), band && band.opensAt > level ? t('talents.opens_at', { level: whole(band.opensAt) }) : '');
      const b = li.querySelector('[data-hs-act="rd-take"]');
      const now = !held && problemOf(o.id) === null;
      text(b, t('talents.take'));
      prop(b, 'hidden', !now);
      prop(b, 'disabled', pending);
      /* a choice the next point cannot buy is planned on its own row (./road-plan.js): shown only when the server's catalogue twin takes it */
      const p = !held && !now ? planFor(tl, v.plan, sel, o.id, v.suggest) : { nodes: null, why: '' };
      const pb = li.querySelector('[data-hs-act="rd-plan"]');
      text(pb, t('talents.plan'));
      prop(pb, 'hidden', !p.nodes || !!p.why);
      prop(pb, 'disabled', pending);
    },
  });
  /* the route (18 section 5): what it costs to get here from the server's build */
  const r = v.route;
  const routeBox = root.querySelector('.rdw-route');
  const showRoute = !!r && !(owned && n.kind !== 'open');
  attr(routeBox, 'hidden', showRoute ? null : '');
  if (showRoute) {
    text(root.querySelector('.rdw-route-h'), t('talents.route'));
    row(routeBox, 'cost', t('talents.cost'), t('talents.n_points', { count: r.cost }));
    row(routeBox, 'have', t('talents.have'), t('talents.n_points', { count: tl ? tl.left : 0 }));
    row(routeBox, 'reach', t('talents.reach'), r.gate ? why(r.gate) : t('talents.level', { level: whole(r.reachAt) }));
    const way = [];
    if (r.ranks) way.push(t('talents.way_ranks', { count: r.ranks }));
    if (r.picks) way.push(t('talents.way_picks', { count: r.picks }));
    if (r.ways) way.push(t('talents.way_ways', { count: r.ways }));
    row(routeBox, 'way', t('talents.on_way'), way.join(' · '), way.length > 0);
    const needs = r.needs.map((x) => t('talents.need', { country: COUNTRY(x.country), state: x.owned ? t('talents.owned') : t('talents.away', { count: x.cost }) }));
    if (n.kind === 'vow') needs.unshift(t('talents.vow_need', { level: whole(TALENT_RULES.vowSlots[0]) }));
    row(routeBox, 'needs', t('talents.requires'), needs.join(' · '), needs.length > 0);
  }
  /* ONE press for a plain stone (a rank, a waystone, a vow, an open road's next point), on only when the server's build lets it be bought
     now; a choice is taken on its option's own row */
  const take = root.querySelector('.rdw-take');
  const problem = problemOf(null);
  const plain = !isPick && n.kind !== 'start';
  const can = plain && problem === null && (!owned || n.kind === 'open');
  text(take, n.kind === 'open' && owned ? t('talents.take_more') : t('talents.take'));
  /* shown for the stone the next point could buy (a farther one shows its route and Next step), off with its words beside it */
  prop(take, 'hidden', !plain || (owned && n.kind !== 'open') || (!owned && !!r && r.cost > 1));
  prop(take, 'disabled', !can || pending);
  /* why it is off, from the server's numbers, for the stone the next point could buy (a farther one has its route and Next step instead;
     a choice says it under its options, whose Take rows are gone) */
  const next = !owned && r && r.cost === 1;
  const off = !next ? '' : plain ? (can ? '' : why(problem))
    : (!optionsOf(n).some((o) => problemOf(o.id) === null) ? why(problemOf((optionsOf(n)[0] || {}).id || null)) : '');
  text(root.querySelector('.rdw-why'), off);
  /* the next stone on the way, when this one is farther than one point */
  const step = root.querySelector('.rdw-step');
  const first = r && r.path.length > 1 ? NODE_INDEX[r.path[0]] : null;
  attr(step, 'data-node', first ? first.id : null);
  attr(step, 'hidden', first ? null : '');
  text(step, first ? t('talents.next_step', { name: nameOf(first) }) : '');
  /* Plan route (./road-plan.js), for a stone the next point cannot take here */
  patchPlanPick(root, tl, v.plan, sel, pending, v.suggest, can);
}
