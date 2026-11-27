// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/talents/road-plan.js — THE ROADS' PLAN: "PLAN ROUTE" AS A SAVED BUILD THE SERVER HOLDS, AND ITS STEPS PAID ONE SPEND
// AT A TIME (lane/r-ui-roads-2, 2026-11-26; docs/design/redesign/18-roads-review-ux.md section 5 item 3, 17-talent-tree.md section 11).
//
// The plan is NEVER client state: it is the saved build the server holds for the hero's ground (hr_talent_build_save, the `talents`
// section's `builds`), the ground its share code carries too (src/session/plan-share.js planGroundOf). So it is what every reload shows,
// and no gate reads anything the client holds (CLAUDE.md §6).
//   Plan route        ONE saveBuild: the draft with the path to the picked stone added (src/core/talent-route.js planRoute). On only
//                     while the server's catalogue twin (buildProblems) has nothing against it; the marks change only from the answer
//   Spend on plan     the plan's next step, as ONE ordinary spend (spendTalent), then the next from the answer's envelope, while the
//                     server's section has points left (at most what the plan needed); it stops at the first refusal and says it.
//                     Each point is the server's check
//   Clear plan        ONE saveBuild(null)
// "PAYS AS POINTS ARRIVE" with the browser closed needs the server's standing rule to walk the plan (HANDOFFS, lane/r-ui-roads-2):
// until then the standing rule walks the suggested road, and Spend on plan pays what the player sees.
// ════════════════════════════════════════════════════════════════════════
import { NODE_INDEX, PICK_KINDS } from '../../../data/talents.js';
import { HUNT_INDEX } from '../../../data/hunts.js';
import { buildProblems } from '../../../core/talents.js';
import { planRoute, planLeft, plannedOf, nextPlanStep } from '../../../core/talent-route.js';
import { planGroundOf } from '../../../session/company-sections.js';
import { saveBuild, spendTalent } from '../../../session/talent-intents.js';
import { REFUSAL_WORDS } from '../../../data/refusal-words.js';
import { text, prop, attr } from '../../../render/paint.js';
import { whole } from '../../../render/format.js';
import { runIntent } from '../../intent-words.js';
import { t } from '../../../render/player-text.js';

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const words = (code) => (!code ? '' : own(REFUSAL_WORDS, code) ? REFUSAL_WORDS[code] : t('talents.locked'));
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

/** The card's plan rows when no stone is picked: the plan's ground, what it still needs, Spend on plan and Clear plan. */
export function patchPlanNone(box, tl, plan, pending) {
  const has = !!plan.draft && plan.left > 0;
  attr(box, 'hidden', plan.draft ? null : '');
  if (!plan.draft) return;
  const r = box.querySelectorAll('.rdw-row');
  text(r[0].querySelector('span'), t('talents.plan_label'));
  text(r[0].querySelector('b'), plan.ground && own(HUNT_INDEX, plan.ground) ? HUNT_INDEX[plan.ground].name : '');
  text(r[1].querySelector('span'), t('talents.plan_to_go'));
  text(r[1].querySelector('b'), has ? t('talents.n_points', { count: plan.left }) : t('talents.plan_done'));
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
    runIntent(sc, repaint, () => payPlan(ctx, tlOf), t('talents.spending'),
      (r) => (r.spent === 1 ? t('talents.spent_one') : t('talents.spent_many', { count: whole(r.spent || 0) })), cs);
    return true;
  }
  return false;
}

/* THE PLAN'S STEPS, each ONE spend read off the server's latest section (the answer's envelope), only while that section says a point is
   left, and never more than the plan needed when the press began; the first refusal ends it and is said (the points already spent are
   the server's) */
async function payPlan(ctx, tlOf) {
  const cs = ctx.character;
  const first = tlOf();
  const most = first ? roadPlanOf(cs, first).left : 0;
  let spent = 0;
  while (spent < most) {
    const tl = tlOf();
    if (!tl || !(tl.left > 0)) break;
    const step = roadPlanOf(cs, tl).step;
    if (!step) break;
    const r = await spendTalent(ctx.account, cs, step.id, step.pick);
    if (!r.ok) return spent ? { ...r, spent } : r;
    spent++;
  }
  return spent ? { ok: true, spent } : { ok: false, error: 'no_points' };
}
