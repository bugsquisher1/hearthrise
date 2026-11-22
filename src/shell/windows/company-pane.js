// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/company-pane.js — THE COMPANY'S PLAN ON A GROUND'S PAGE (lane/c-company FB-6; 1051-company-start.sql; designer D-2).
//
// Two of the plan's lines live where a ground is chosen (the Hunts window's page, ./hunts.js), each ONE intent and off until the server
// answers (company-intents.js), the page changing only from the envelope the answer carries:
//   THE GROUND'S SETUP  Go as is the ground's Setup: a press on one of its rows points this ground at that Setup (hr_ground_setup_set), and the
//                       page opens on the ground's own (the server's `hunt_setup`), so the Start and Enter both go as it.
//   THE PLAN'S GROUND   "Go here at the next Start" (hr_hero_plan_set): the next Start sends this hero (or its own party) here instead of where
//                       it hunted last. Pressed again it is undone. The server's `company` section says which ground the plan holds.
//   planHtml()                        the press (built once, in the page's foot)
//   patchPlan(det, ctx, o)            { hunt, pending }: its words and whether it is on
//   actPlan(ctx, sc, repaint, action, el)  the page's presses for both lines; true when the action was this pane's
//   goAsOf(cs, hunt)                  the ground's own Setup (null: none), Go as's starting row
// ════════════════════════════════════════════════════════════════════════
import { text, prop, attr, cls } from '../../render/paint.js';
import { t } from '../../render/player-text.js';
import { runIntent } from '../intent-words.js';
import { huntOf } from '../../session/hunt-sections.js';
import { huntName } from '../../session/party-sections.js';
import { companyPlanOf, groundSetupOf } from '../../session/company-sections.js';
import { setHeroPlan, setGroundSetup } from '../../session/company-intents.js';

/** The ground's own Setup for Go as (the server's pointer), or null. */
export const goAsOf = (cs, hunt) => groundSetupOf(cs, hunt);

/** The press (built once). */
export function planHtml() {
  return '<button type="button" class="hh-tool hw-plan-here" data-hs-act="plan-here" aria-pressed="false"></button>';
}

/** Its words: "Go here at the next Start", or, once the plan holds this ground, "Next Start goes here" (pressed: undo). Off until the server's
    section has come, while a press is out, and while this hero hunts here already (its last hunt is what the Start repeats). */
export function patchPlan(det, ctx, o) {
  const b = det.querySelector('[data-hs-act="plan-here"]');
  if (!b) return;
  const cs = ctx.character, co = companyPlanOf(cs), h = huntOf(cs);
  const here = !!co && co.planHunt === o.hunt;
  const last = !!h && h.huntId === o.hunt;
  prop(b, 'hidden', !co || (last && !here));
  attr(b, 'data-hunt', o.hunt);
  attr(b, 'aria-pressed', here ? 'true' : 'false');
  cls(b, 'is-on', here);
  text(b, here ? t('hunts.plan_set') : t('hunts.plan_here'));
  prop(b, 'disabled', !co || o.pending);
}

/** The page's presses for the plan's two lines. */
export function actPlan(ctx, sc, repaint, action, el) {
  const cs = ctx.character;
  if (action === 'plan-here') {
    const hunt = el.getAttribute('data-hunt');
    const co = companyPlanOf(cs);
    if (!hunt || !co) return true;
    const undo = co.planHunt === hunt;
    runIntent(sc, repaint, () => setHeroPlan(ctx.account, cs, undo ? null : hunt), t('heroes.sending'),
      () => (undo ? t('hunts.plan_undone') : t('hunts.plan_saved', { ground: huntName(hunt) })), cs);
    return true;
  }
  if (action === 'go-as') {
    const preset = Number(el.getAttribute('data-preset')), hunt = sc.pick;
    if (sc.pending || !Number.isInteger(preset)) return true;
    sc.goAs = preset;
    /* the ground remembers it: ONE intent, the row off until the server answers */
    if (hunt && goAsOf(cs, hunt) !== preset) {
      runIntent(sc, repaint, () => setGroundSetup(ctx.account, cs, hunt, preset), t('heroes.sending'),
        () => t('hunts.setup_saved', { ground: huntName(hunt) }), cs);
    } else { sc.msg = ''; repaint(); }
    return true;
  }
  return false;
}
