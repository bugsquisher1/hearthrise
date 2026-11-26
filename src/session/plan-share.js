// ════════════════════════════════════════════════════════════════════════
// src/session/plan-share.js — A HERO'S PLAN AS A SHARE CODE, AND A PASTED CODE AS THAT PLAYER'S OWN INTENTS (lane/wn-sh SH, 2026-11-26).
//
// The code itself is src/core/plan-code.js (made and read with no authority). This module is the hero's side:
//   heroPlanOf(cs)              the plan the SERVER holds for this hero, read from its envelope: the plan's ground (or the ground its next
//                               Start repeats), the stance, the company's two lines, and the Roads build for that ground (its saved build,
//                               else the nodes it holds; none while the Talents switch is off). Display only
//   shareCodeOf(cs)             that plan as a code, or null (nothing to share yet)
//   planChanges(cs, plan)       THE EDITOR: what a decoded plan would change on THIS hero, one row a part:
//                               { part, to, from, state } with state 'same' (nothing to send), 'send', or why it cannot be sent ('closed':
//                               the Talents switch is off, 'no_ground': a build with no ground to save it on, 'unread': the server's section
//                               has not come)
//   usePlan(account, cs, plan)  THE PRESS: each 'send' row as the player's own existing intent, one after another, stopping at the first
//                               refusal (the server's word is said). { ok, sent, error?, part? }
//
// Nothing here writes another player's state or any value that crosses to one: every send names this hero's slot and a catalogue word,
// and the server checks each one (company-intents.js, danger-intents.js, carry-on-intents.js, talent-intents.js). Every screen number
// changes only from the envelope each answer carries.
// ════════════════════════════════════════════════════════════════════════
import { encodePlanCode } from '../core/plan-code.js';
import { normalize, pointsSpent } from '../core/talents.js';
import { companyPlanOf } from './company-sections.js';
import { dangerOf } from './danger-sections.js';
import { huntOf } from './hunt-sections.js';
import { setHeroPlan } from './company-intents.js';
import { setRisk } from './danger-intents.js';
import { setCompanyLine } from './carry-on-intents.js';
import { saveBuild } from './talent-intents.js';

const ID = /^[a-z0-9_]{1,64}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const read = (cs, key) => (cs && typeof cs.read === 'function' ? cs.read(key) : undefined);
const sameBuild = (a, b) => { const x = normalize(a), y = normalize(b); const k = Object.keys(x); return k.length === Object.keys(y).length && k.every((id) => x[id] === y[id]); };

/** The order the editor lists and the press sends the parts in: the ground first (the build is saved on it), the build last. */
const PLAN_PARTS = Object.freeze(['ground', 'risk', 'wear_upgrades', 'if_one_falls', 'build']);

/* The `talents` section while the switch is on: { nodes, builds: { hunt: nodes } }, else null. */
function roadsOf(cs) {
  const sec = read(cs, 'talents');
  if (!isObj(sec) || sec.live !== true) return null;
  const builds = {};
  if (isObj(sec.builds)) for (const [h, n] of Object.entries(sec.builds)) if (ID.test(h) && isObj(n)) builds[h] = normalize(n);
  return { nodes: normalize(sec.nodes), builds, points: Number.isSafeInteger(sec.points) ? sec.points : null };
}

/* The ground the hero's next Start goes to: the plan's, else the one it hunted last (the Start repeats it). */
function groundOf(cs, co) {
  if (co && co.planHunt) return co.planHunt;
  const h = huntOf(cs);
  return h && h.huntId && ID.test(h.huntId) ? h.huntId : null;
}

/** The plan the server holds for this hero ({ ground, risk, lines, nodes }, each null when unknown). Display only. */
function heroPlanOf(cs) {
  const co = companyPlanOf(cs), d = dangerOf(cs), roads = roadsOf(cs);
  const ground = groundOf(cs, co);
  const nodes = roads ? (ground && roads.builds[ground]) || roads.nodes : null;
  return {
    ground,
    risk: d ? d.risk : null,
    lines: { wear_upgrades: co ? (co.wearOn ? 'on' : 'off') : null, if_one_falls: co && co.falls !== 'mixed' ? co.falls : null },
    nodes: nodes && Object.keys(nodes).length ? nodes : null,
  };
}

/** This hero's plan as a share code, or null. */
export const shareCodeOf = (cs) => encodePlanCode(heroPlanOf(cs));

/**
 * What a decoded `plan` (core/plan-code.js decodePlanCode's) would change on this hero: one row a part the code carries, in PLAN_PARTS
 * order. `to` and `from` are catalogue words (a build row's are { nodes, spent } and the hero's points); `state` says whether it is sent.
 */
export function planChanges(cs, plan) {
  if (!plan) return [];
  const co = companyPlanOf(cs), d = dangerOf(cs), roads = roadsOf(cs);
  const rows = [];
  if (plan.ground) {
    const from = co ? groundOf(cs, co) : null;
    rows.push({ part: 'ground', to: plan.ground, from, state: !co ? 'unread' : from === plan.ground ? 'same' : 'send' });
  }
  if (plan.risk) rows.push({ part: 'risk', to: plan.risk, from: d ? d.risk : null, state: !d ? 'unread' : d.risk === plan.risk ? 'same' : 'send' });
  for (const line of ['wear_upgrades', 'if_one_falls']) {
    const to = plan.lines && plan.lines[line];
    if (!to) continue;
    const from = co ? (line === 'wear_upgrades' ? (co.wearOn ? 'on' : 'off') : co.falls) : null;
    rows.push({ part: line, to, from, state: !co ? 'unread' : from === to ? 'same' : 'send' });
  }
  if (plan.nodes) {
    const hunt = plan.ground || groundOf(cs, co);
    const to = { nodes: plan.nodes, spent: pointsSpent(plan.nodes), hunt };
    const have = roads && hunt ? roads.builds[hunt] || null : null;
    rows.push({ part: 'build', to, from: roads ? roads.points : null,
      state: !roads ? 'closed' : !hunt ? 'no_ground' : have && sameBuild(have, plan.nodes) ? 'same' : 'send' });
  }
  return rows;
}

/* One part as the hero's own intent. */
function sendPart(account, cs, row) {
  if (row.part === 'ground') return setHeroPlan(account, cs, row.to);
  if (row.part === 'risk') return setRisk(account, cs, row.to);
  if (row.part === 'build') return saveBuild(account, cs, row.to.hunt, row.to.nodes);
  return setCompanyLine(account, cs, row.part, row.to);
}

/** USE THIS PLAN: every row planChanges marks 'send', as this hero's own intents in order; the first refusal stops the rest. */
export async function usePlan(account, cs, plan) {
  let sent = 0;
  for (const part of PLAN_PARTS) {
    /* read again before each part: the answer before it may have moved what the next one compares with */
    const row = planChanges(cs, plan).find((r) => r.part === part);
    if (!row || row.state !== 'send') continue;
    const r = await sendPart(account, cs, row);
    if (!r || r.ok !== true) return { ok: false, sent, part, error: (r && r.error) || 'refused' };
    sent++;
  }
  return { ok: true, sent };
}
