// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/talents/road-plan.js — THE ROADS' PLAN: "PLAN ROUTE" AS A SAVED BUILD THE SERVER HOLDS, AND "SPEND ON PLAN" AS ONE
// PRESS THE SERVER WALKS (lane/r-ui-roads-2, 2026-11-26; lane/talents-plan-server, 2026-11-27; docs/design/redesign/18-roads-review-ux.md
// section 5 item 3, 17-talent-tree.md sections 11 and 14).
//
// The plan is NEVER client state: it is the saved build the server holds for the hero's ground (hr_talent_build_save, the `talents`
// section's `builds`), the ground the server names (the section's `plan_hunt`, read by src/session/company-sections.js planGroundOf, the
// ground its share code carries too). So it is what every reload shows, and no gate reads anything the client holds (CLAUDE.md §6).
//   Plan route        ONE saveBuild: the draft with the path to the picked stone added (src/core/talent-route.js planRoute). On only
//                     while the server's catalogue twin (buildProblems) has nothing against it; the marks change only from the answer
//   Spend on plan     ONE spendPlan (hr_talent_spend_plan, 1073-talents-plan-server.sql): the server pays every point the plan can take
//                     now, in map order (nextPlanStep is its twin, so the map's next step is the server's), each step its own spend
//                     check; off while the answer is out, the marks change only from its envelope
//   Clear plan        ONE saveBuild(null)
// The plan also pays as points arrive with the browser closed: the server's standing rule walks it first (1073), when the band's
// Spend as suggested is on.
// ════════════════════════════════════════════════════════════════════════
import { NODE_INDEX, PICK_KINDS } from '../../../data/talents.js';
import { HUNT_INDEX } from '../../../data/hunts.js';
import { buildProblems } from '../../../core/talents.js';
import { planRoute, planLeft, plannedOf, nextPlanStep } from '../../../core/talent-route.js';
import { planGroundOf } from '../../../session/company-sections.js';
import { saveBuild, spendPlan } from '../../../session/talent-intents.js';
import { REFUSAL_WORDS, REFUSAL_VERB_WORDS } from '../../../data/refusal-words.js';
import { text, prop, attr } from '../../../render/paint.js';
import { whole } from '../../../render/format.js';
import { runIntent, refusalWords } from '../../intent-words.js';
import { t } from '../../../render/player-text.js';

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
/** A spend problem's words, as the press's refusal says them (the Talents verb's own line first: a town pick's not_offered is not the shop's) */
export const talentWords = (code) => (!code ? '' : own(REFUSAL_VERB_WORDS.talent_spend, code) || own(REFUSAL_WORDS, code) ? refusalWords(code, 'talent_spend') : t('talents.locked'));
const words = talentWords;
const NONE = Object.freeze(new Set());

/**
 * THE PLAN AS THE SERVER HOLDS IT for `tl` (the section): { ground, draft (the saved build, or null), left (points it still needs),
 * planned (its stones the hero does not hold), step (the next one a point buys, or null) }. One read per section and ground.
 */
const MEMO = new WeakMap();
export function roadPlanOf(cs, tl) {
  const ground = planGroundOf(cs);
  const hit = tl && MEMO.get(tl);
  if (hit && hit.ground === ground) return hit;
  const draft = tl && ground && own(tl.builds, ground) ? tl.builds[ground] : null;
  const p = { ground, draft, left: tl && draft ? planLeft(tl.nodes, draft) : 0, planned: tl && draft ? plannedOf(tl.nodes, draft) : NONE,
    step: tl && draft ? nextPlanStep(tl.nodes, draft, tl.level) : null };
  if (tl) MEMO.set(tl, p);
  return p;
}

/**
 * WHAT A PLAN ROUTE TO `id` (at option `pick`) WOULD SAVE, and why it is off: { nodes, why } (why '' when the press is on). Off with no
 * ground to save it on, when it adds nothing (owned, or planned already), and when the server's catalogue would refuse the build.
 */
export function planFor(tl, plan, id, pick, suggestPlan) {
  if (!tl) return { nodes: null, why: words('talents_closed') };
  if (!plan.ground) return { nodes: null, why: t('talents.plan_no_ground') };
  const nodes = planRoute(tl.nodes, plan.draft, id, pick, suggestPlan);
  if (!nodes) return { nodes: null, why: '' };
  const bad = buildProblems(nodes);
  return { nodes, why: bad.length ? words(bad[0].why) : '' };
}

/**
 * The card's plan rows when no stone is picked: the plan's ground (or None), what it still needs, its next step (`stepName`, the
 * card's name for plan.step), Spend on plan and Clear plan.
 */
export function patchPlanNone(box, tl, plan, pending, stepName = '') {
  const has = !!plan.draft && plan.left > 0;
  attr(box, 'hidden', tl ? null : '');
  const r = box.querySelectorAll('.rdw-row');
  text(r[0].querySelector('span'), t('talents.plan_label'));
  /* no plan saved: the row says so (a far stone's Plan route makes one), or that the hero has no planned hunt to keep one for */
  text(r[0].querySelector('b'), !plan.ground ? t('talents.plan_no_ground') : !plan.draft ? t('talents.plan_none')
    : own(HUNT_INDEX, plan.ground) ? HUNT_INDEX[plan.ground].name : '');
  attr(r[1], 'hidden', plan.draft ? null : '');
  attr(r[2], 'hidden', has && stepName ? null : '');
  attr(box.querySelector('.rdw-do'), 'hidden', plan.draft ? null : '');
  if (!plan.draft) return;
  text(r[1].querySelector('span'), t('talents.plan_to_go'));
  text(r[1].querySelector('b'), has ? t('talents.n_points', { count: plan.left }) : t('talents.plan_done'));
  text(r[2].querySelector('span'), t('talents.plan_next'));
  text(r[2].querySelector('b'), has ? stepName : '');
  const pay = box.querySelector('[data-hs-act="rd-plan-pay"]');
  text(pay, t('talents.plan_spend'));
  prop(pay, 'hidden', !has);
  /* off with no point left, or with the plan waiting on a Level (a vow slot), its line beside it saying which */
  const off = !tl || !(tl.left > 0) ? words('no_points') : !plan.step ? t('talents.plan_waiting') : '';
  prop(pay, 'disabled', !!off || pending);
  text(box.querySelector('.rdw-plan-why'), has ? off : '');
  const clear = box.querySelector('[data-hs-act="rd-plan-clear"]');
  text(clear, t('talents.plan_clear'));
  prop(clear, 'disabled', pending);
}

/** The picked stone's Plan route: shown for a stone the plan would add (a plain one: a choice plans on its option's row) that the
    next point cannot take here (`takeOn`: its Take is on). */
export function patchPlanPick(root, tl, plan, sel, pending, suggestPlan, takeOn) {
  const n = NODE_INDEX[sel];
  const btn = root.querySelector('.rdw-plan-go');
  const state = root.querySelector('.rdw-planned');
  const planned = plan.planned.has(sel);
  text(state, planned ? t('talents.planned') : '');
  const pick = PICK_KINDS.includes(n.kind);
  const held = !!tl && own(tl.nodes, sel) && n.kind !== 'open';
  const p = planFor(tl, plan, sel, null, suggestPlan);
  /* a plain stone plans here; a choice plans on its options' rows, and this line says why none can when the hunt is missing */
  const show = !pick && !held && !takeOn && (!!p.nodes || (!!p.why && !planned));
  text(btn, t('talents.plan_route'));
  prop(btn, 'hidden', !show);
  prop(btn, 'disabled', !p.nodes || !!p.why || pending);
  text(root.querySelector('.rdw-plan-off'), show || (pick && !held && !plan.ground) ? p.why : '');
}

/** One press of the plan's; true when it was the plan's. */
export function actPlan(ctx, sc, action, el, repaint, tlOf, suggestPlan) {
  const cs = ctx.character;
  if (action === 'rd-plan' && sc.sel) {
    const tl = tlOf(), plan = roadPlanOf(cs, tl), pick = el.getAttribute('data-pick');
    const p = planFor(tl, plan, sc.sel, pick || null, suggestPlan);
    if (!p.nodes || p.why) return true;
    runIntent(sc, repaint, () => saveBuild(ctx.account, cs, plan.ground, p.nodes), t('talents.planning'), () => t('talents.plan_saved'), cs);
    return true;
  }
  if (action === 'rd-plan-clear') {
    const plan = roadPlanOf(cs, tlOf());
    if (!plan.ground || !plan.draft) return true;
    runIntent(sc, repaint, () => saveBuild(ctx.account, cs, plan.ground, null), t('talents.planning'), () => t('talents.plan_cleared'), cs);
    return true;
  }
  if (action === 'rd-plan-pay') {
    /* ONE press for the ground the plan is drawn for; the server walks it and refuses (and says why) when nothing is left to pay */
    const plan = roadPlanOf(cs, tlOf());
    if (!plan.ground || !plan.draft) return true;
    runIntent(sc, repaint, () => spendPlan(ctx.account, cs, plan.ground), t('talents.spending'),
      (r) => (r.spent === 1 ? t('talents.spent_one') : t('talents.spent_many', { count: whole(r.spent || 0) })), cs);
    return true;
  }
  return false;
}
