// ════════════════════════════════════════════════════════════════════════
// src/data/skill-unlocks.js — WHAT EACH SKILL LEVEL OPENS, FROM THE CATALOGUES.
//
// Derived, never typed: every recipe (src/data/recipes.js), gathering node and
// crop (src/data/gathering.js) and item (src/data/items.js) that names a skill
// requirement is an unlock of that skill at that level, named as the
// catalogue names it, with its kind in words (src/data/item-uses.js). A new
// row unlocks itself. Read by the skill ledgers (src/shell/windows/skills.js).
// Gear names the hero's LEVEL (gear-tiers.js LEVEL_REQ, Tyler 2026-10-24), so
// `nextUnlock(LEVEL_REQ, level)` is the next gear by Level (the coach's line,
// src/data/hunt-tutorial.js nextGoal); a skill's list keeps its supplies.
// An ITEM unlock is listed only when a player can actually get it
// (catalogue-coherence.js reachableSources: the open grounds, the listed Shop,
// the kit, gathering, crafts from reachable inputs). A piece no door reaches is
// a promise the game can't keep (the 10-24 copy audit found the coach naming five).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { SKILLS_DEF } from './skills.js?v=0.2.51';
import { ARTISAN_RECIPES } from './recipes.js?v=0.2.51';
import { TREES, ROCKS, FISH_SPOTS, CROPS } from './gathering.js?v=0.2.51';
import { ITEMS } from './items.js?v=0.2.51';
import { DRINK_ITEMS } from './drinks.js?v=0.2.51';
import { LEVEL_REQ } from './gear-tiers.js?v=0.2.51';
import { reachableSources } from './catalogue-coherence.js?v=0.2.51';
import { itemUse, nodeUse } from './item-uses.js?v=0.2.51';

/* How many things one unlock line names before "and N more". */
const NAMED = 3;
const spelled = (id) => { const t = String(id).replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
const nameOf = (id) => { const it = ITEMS[id] || DRINK_ITEMS[id]; return it && it.n ? it.n : spelled(id); };

let UNLOCKS = null;
/* skill (or LEVEL_REQ) -> [[level, name, use, item id or null]] ascending, built once. */
function unlocks() {
  if (UNLOCKS) return UNLOCKS;
  UNLOCKS = new Map();
  const add = (skill, lv, what, use, id) => { if (!(lv > 1) || !what) return; if (!UNLOCKS.has(skill)) UNLOCKS.set(skill, []); UNLOCKS.get(skill).push([lv, what, use || '', id || null]); };
  for (const [skill, list] of Object.entries(ARTISAN_RECIPES)) for (const r of list || []) add(skill, r.req, r.output ? nameOf(r.output) : r.name, r.output ? itemUse(r.output) : '');
  for (const [nodes, skill] of [[TREES, 'woodcutting'], [ROCKS, 'mining'], [FISH_SPOTS, 'fishing']]) for (const n of nodes) add(skill, n.req, n.name, nodeUse(skill));
  for (const c of Object.values(CROPS)) if (c) add('farming', c.req || c.lv, c.prod ? nameOf(c.prod) : c.name, nodeUse('farming'));
  const reach = reachableSources();
  for (const [id, it] of Object.entries(ITEMS)) {
    if (it.reqSkill && (SKILLS_DEF[it.reqSkill] || it.reqSkill === LEVEL_REQ) && reach.has(id)) add(it.reqSkill, it.reqLv, it.n || id, itemUse(id), id);
  }
  /* By level; within a level the hands first (a weapon, then an off-hand: they set the style), the rest as listed. */
  const hands = (id) => { const s = id && ITEMS[id] ? ITEMS[id].slot : null; return s === 'weapon' ? 0 : s === 'shield' ? 1 : 2; };
  for (const l of UNLOCKS.values()) l.sort((a, b) => a[0] - b[0] || hands(a[3]) - hands(b[3]));
  return UNLOCKS;
}

/**
 * What this skill (or LEVEL_REQ: the hero's Level) opens next above `level`: "Next at level 3: Bronze Axe (woodcutting
 * tool), Bronze Pickaxe (mining tool)", or ''. `keep(id)`, when given, keeps only the item unlocks it answers true for
 * (the coach names the gear the hero's role wears); recipes and nodes always count.
 */
export function nextUnlock(skill, level, keep) {
  const list = (unlocks().get(skill) || []).filter(([, , , id]) => !keep || !id || keep(id));
  const next = list.find(([lv]) => lv > level);
  if (!next) return '';
  const seen = new Set();
  const at = list.filter(([lv, name]) => lv === next[0] && !seen.has(name) && seen.add(name));
  const named = at.slice(0, NAMED).map(([, name, use]) => (use ? name + ' (' + use + ')' : name));
  return 'Next at level ' + next[0] + ': ' + named.join(', ') + (at.length > NAMED ? ' and ' + (at.length - NAMED) + ' more' : '');
}
