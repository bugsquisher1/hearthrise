// ════════════════════════════════════════════════════════════════════════
// src/session/talent-sections.js — THE ROADS: THE SERVER'S BUILD, READ SAFELY (lane/roads-sample, 2026-11-23).
//
// supabase/migrations/1064-roads-sample.sql hr_talents_view, the `talents` section. A reader, never an intent: the presses are
// src/session/talent-intents.js.
//   talentsOf(cs, roleKey, plan)   the section through src/core/talents.js talentsSectionOf, plus the next fork on the suggested road
//                                  (display only), or null while the switch is off (the server projects null) or for no hero
// ════════════════════════════════════════════════════════════════════════
import { talentsSectionOf, nextFork } from '../core/talents.js';
import { disciplineOf } from '../data/hunt-roles.js';

const PLANS = new Set(['party', 'solo']);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const read = (cs, key) => (cs && typeof cs.read === 'function' ? cs.read(key) : undefined);

/* One parse per envelope: the section object is replaced whole by each envelope. */
const PARSED = new WeakMap();

/**
 * The hero's Roads as the server holds them, or null (switch off, no hero). `roleKey` is the worn set's role key (hunt-roles.js
 * ROLE_KEYS) the next fork is read for; `plan` 'party' (the default: the company joins at Level 5) or 'solo'.
 * @returns {null | { live: boolean, level: number, points: number, spent: number, left: number, nodes: object, borrowed: string[],
 *   vowSlots: number, fork: null | { id: string, n: string, move: string|null, cost: number, options: object[] } }}
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
