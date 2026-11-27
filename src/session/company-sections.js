// ════════════════════════════════════════════════════════════════════════
// src/session/company-sections.js — THE COMPANY'S PLAN AS THE SERVER PROJECTS IT (the `company` section; 1051-company-start.sql hr_company_view).
//
//   companyPlanOf(cs)   the account's standing lines (wearOn: "Wear upgrades"; falls: "If one falls", 'hunt_on' | 'all_home' | 'mixed'),
//                       this hero's plan ground (planHunt, when set after its last hunt), the own hero it joins once both are free (joins),
//                       whether its party's leader is pinned (leadPinned), and how many heroes the company holds; null when the server sent none
//
//   planGroundOf(cs)    the ground this hero's plan is for: the plan's ground, else the one its next Start repeats (the hunt it hunted
//                       last); null for none. The ground a saved Roads build is kept for (share codes, the Roads map's Plan route). While
//                       the Talents switch is on the SERVER says it (the `talents` section's plan_hunt, 1073-talents-plan-server.sql
//                       hr_hero_ground_of), so the build the screen draws and saves is the one the server's standing rule and Spend on
//                       plan walk (a training yard hunted last never moves it)
//
// A read of the envelope only: nothing here is a gate the server trusts, and a missing section reads as unknown (null), never a default.
// ════════════════════════════════════════════════════════════════════════
import { huntOf } from './hunt-sections.js';

const ITEM = /^[a-z0-9_]{1,64}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** THE SETUP A GROUND POINTS AT for this hero (`hunt_setup`, 2026-12-05-hunt-setup-per-ground.sql: { hunt_id: preset }, only Setups that still
    exist): its number, or null when the ground has none or the server sent no section. Enter's Go as starts on it; the Start uses it. */
export function groundSetupOf(cs, hunt) {
  const m = cs && typeof cs.read === 'function' ? cs.read('hunt_setup') : null;
  if (!isObj(m) || typeof hunt !== 'string' || !Object.prototype.hasOwnProperty.call(m, hunt)) return null;
  const n = m[hunt];
  return Number.isInteger(n) && n >= 0 && n <= 7 ? n : null;
}

/** The `company` section, bounded; null when the server sent none. */
export function companyPlanOf(cs) {
  const c = cs && typeof cs.read === 'function' ? cs.read('company') : null;
  if (!isObj(c) || typeof c.wear_upgrades !== 'boolean') return null;
  return {
    wearOn: c.wear_upgrades,
    falls: c.if_one_falls === 'hunt_on' || c.if_one_falls === 'all_home' || c.if_one_falls === 'mixed' ? c.if_one_falls : null,
    planHunt: typeof c.plan_hunt === 'string' && ITEM.test(c.plan_hunt) ? c.plan_hunt : null,
    joins: isObj(c.joins) && Number.isInteger(c.joins.slot) && typeof c.joins.name === 'string' ? { slot: c.joins.slot, name: c.joins.name.slice(0, 40) } : null,
    leadPinned: c.lead_pinned === true,
    heroes: Number.isSafeInteger(c.heroes) && c.heroes >= 0 ? c.heroes : 0,
  };
}

/** The ground this hero's plan is for (`co`: the companyPlanOf reading, read here when not given): the server's own word while the Talents
    section carries one, else the plan's ground, else the one its next Start repeats (the hunt it hunted last); null for none. */
export function planGroundOf(cs, co = companyPlanOf(cs)) {
  const tl = cs && typeof cs.read === 'function' ? cs.read('talents') : null;
  if (isObj(tl) && tl.live === true && Object.prototype.hasOwnProperty.call(tl, 'plan_hunt')) {
    return typeof tl.plan_hunt === 'string' && ITEM.test(tl.plan_hunt) ? tl.plan_hunt : null;
  }
  if (co && co.planHunt) return co.planHunt;
  const h = huntOf(cs);
  return h && h.huntId && ITEM.test(h.huntId) ? h.huntId : null;
}
