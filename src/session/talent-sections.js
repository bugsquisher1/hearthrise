// ════════════════════════════════════════════════════════════════════════
// src/session/talent-sections.js — THE ROADS: THE SERVER'S BUILD, READ SAFELY (lane/roads-sample, 2026-11-23).
//
// supabase/migrations/1064-roads-sample.sql hr_talents_view, the `talents` section, as 1069-talent-standing-rule.sql restates it. A
// reader, never an intent: the presses are src/session/talent-intents.js.
//   talentsSectionOf(sec)          the section normalized (the one reader of its shape), or null
//   talentsOf(cs, roleKey, plan)   the section through talentsSectionOf, plus the next fork on the suggested road (display only), or null
//                                  while the switch is off (the server projects null) or for no hero
// The section's shape (hr_talents_view): { live, level, points, spent, nodes, auto, plan_hunt, borrowed: [{ move, opens_at, open }],
// vow_slots, builds: { hunt_id: nodes }, reset }. `plan_hunt` (1073-talents-plan-server.sql) is read by company-sections.js planGroundOf,
// the one reading of the plan's ground. A client-only reader: the engine reads only `nodes` (hunt-settle.js memberInput), so this lives
// here and not in src/core (lane/r-ui-roads-2: it left the edge payload).
// ════════════════════════════════════════════════════════════════════════
import { nextFork, normalize, pointsAt, pointsSpent, vowSlotsAt } from '../core/talents.js';
import { disciplineOf } from '../data/hunt-roles.js';

const PLANS = new Set(['party', 'solo']);
const HUNT = /^[a-z0-9_]{1,64}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const read = (cs, key) => (cs && typeof cs.read === 'function' ? cs.read(key) : undefined);

/**
 * THE ENVELOPE SECTION `talents` as the client reads it, normalized; null for none. Display only: every spend is a server intent.
 *   borrowed  the moves the build lends, as the server says them: [{ move, opensAt (a Level, or null: not offered), open }]
 *   auto      the plan "Spend as suggested" spends new points for ('party' | 'solo'), or null (off; also while the server sends no word)
 *   builds    the saved builds, { hunt_id: nodes } (a plan per ground, past the hero's Level allowed)
 * @returns {null | { live: true, level: number, nodes: object, points: number, spent: number, vowSlots: number, auto: null | string,
 *   borrowed: { move: string, opensAt: number|null, open: boolean }[], builds: Record<string, object> }}
 */
export function talentsSectionOf(sec) {
  if (!isObj(sec) || sec.live !== true) return null;
  const nodes = normalize(sec.nodes);
  const level = Number.isInteger(sec.level) ? sec.level : 1;
  const builds = {};
  if (isObj(sec.builds)) for (const [h, b] of Object.entries(sec.builds)) if (HUNT.test(h) && isObj(b)) builds[h] = normalize(b);
  return {
    live: true, level, nodes,
    points: Number.isInteger(sec.points) ? sec.points : pointsAt(level),
    spent: Number.isInteger(sec.spent) ? sec.spent : pointsSpent(nodes),
    borrowed: Array.isArray(sec.borrowed)
      ? sec.borrowed.filter((b) => isObj(b) && typeof b.move === 'string')
        .map((b) => ({ move: b.move, opensAt: Number.isInteger(b.opens_at) ? b.opens_at : null, open: b.open === true }))
      : [],
    vowSlots: Number.isInteger(sec.vow_slots) ? sec.vow_slots : vowSlotsAt(level),
    auto: PLANS.has(sec.auto) ? sec.auto : null,
    builds,
  };
}

/* One parse per envelope: the section object is replaced whole by each envelope. */
const PARSED = new WeakMap();

/**
 * The hero's Roads as the server holds them, or null (switch off, no hero). `roleKey` is the worn set's role key (hunt-roles.js
 * ROLE_KEYS) the next fork is read for; `plan` 'party' (the default: the company joins at Level 5) or 'solo'.
 * @returns {null | ReturnType<typeof talentsSectionOf> & { left: number,
 *   fork: null | { id: string, n: string, move: string|null, cost: number, options: object[] } }}
 */
export function talentsOf(cs, roleKey, plan) {
  const sec = read(cs, 'talents');
  if (!isObj(sec)) return null;
  const p = PLANS.has(plan) ? plan : 'party';
  let byKey = PARSED.get(sec);
  if (!byKey) PARSED.set(sec, (byKey = new Map()));
  const k = String(roleKey) + '|' + p;
  if (byKey.has(k)) return byKey.get(k);
  const t = talentsSectionOf(sec);
  const disc = disciplineOf(roleKey);
  const out = t ? { ...t, left: Math.max(0, t.points - t.spent), fork: disc ? nextFork(t.nodes, disc, p) : null } : null;
  byKey.set(k, out);
  return out;
}
