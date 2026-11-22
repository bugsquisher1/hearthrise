// ════════════════════════════════════════════════════════════════════════
// src/session/company-sections.js — THE COMPANY'S PLAN AS THE SERVER PROJECTS IT (the `company` section; 1051-company-start.sql hr_company_view).
//
//   companyPlanOf(cs)   the account's standing lines (wearOn: "Wear upgrades"; falls: "If one falls", 'hunt_on' | 'all_home' | 'mixed'),
//                       this hero's plan ground (planHunt, when set after its last hunt), the own hero it joins once both are free (joins),
//                       whether its party's leader is pinned (leadPinned), and how many heroes the company holds; null when the server sent none
//
// A read of the envelope only: nothing here is a gate the server trusts, and a missing section reads as unknown (null), never a default.
// ════════════════════════════════════════════════════════════════════════

const ITEM = /^[a-z0-9_]{1,64}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

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
