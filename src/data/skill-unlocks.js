// ════════════════════════════════════════════════════════════════════════
// src/data/skill-unlocks.js — WHAT EACH SKILL LEVEL OPENS, FROM THE CATALOGUES.
//
// Derived, never typed: every recipe (src/data/recipes.js), gathering node and
// crop (src/data/gathering.js) and item (src/data/items.js) that names a skill
// requirement is an unlock of that skill at that level, named as the
// catalogue names it, with its kind in words (src/data/item-uses.js). A new
// row unlocks itself. Read by the skill ledgers (src/shell/windows/skills.js).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { SKILLS_DEF } from './skills.js?v=0.2.5';
import { ARTISAN_RECIPES } from './recipes.js?v=0.2.5';
import { TREES, ROCKS, FISH_SPOTS, CROPS } from './gathering.js?v=0.2.5';
import { ITEMS } from './items.js?v=0.2.5';
import { DRINK_ITEMS } from './drinks.js?v=0.2.5';
import { itemUse, nodeUse } from './item-uses.js?v=0.2.5';

/* How many things one unlock line names before "and N more". */
const NAMED = 3;
const spelled = (id) => { const t = String(id).replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
const nameOf = (id) => { const it = ITEMS[id] || DRINK_ITEMS[id]; return it && it.n ? it.n : spelled(id); };

let UNLOCKS = null;
/* skill -> [[level, name, use]] ascending, built once. */
function unlocks() {
  if (UNLOCKS) return UNLOCKS;
  UNLOCKS = new Map();
  const add = (skill, lv, what, use) => { if (!(lv > 1) || !what) return; if (!UNLOCKS.has(skill)) UNLOCKS.set(skill, []); UNLOCKS.get(skill).push([lv, what, use || '']); };
  for (const [skill, list] of Object.entries(ARTISAN_RECIPES)) for (const r of list || []) add(skill, r.req, r.output ? nameOf(r.output) : r.name, r.output ? itemUse(r.output) : '');
  for (const [nodes, skill] of [[TREES, 'woodcutting'], [ROCKS, 'mining'], [FISH_SPOTS, 'fishing']]) for (const n of nodes) add(skill, n.req, n.name, nodeUse(skill));
  for (const c of Object.values(CROPS)) if (c) add('farming', c.req || c.lv, c.prod ? nameOf(c.prod) : c.name, nodeUse('farming'));
  for (const [id, it] of Object.entries(ITEMS)) if (it.reqSkill && SKILLS_DEF[it.reqSkill]) add(it.reqSkill, it.reqLv, it.n || id, itemUse(id));
  for (const l of UNLOCKS.values()) l.sort((a, b) => a[0] - b[0]);
  return UNLOCKS;
}

/** What this skill opens next above `level`: "Next at level 3: Bronze Axe (woodcutting tool), Bronze Pickaxe (mining tool)", or ''. */
export function nextUnlock(skill, level) {
  const list = unlocks().get(skill) || [];
  const next = list.find(([lv]) => lv > level);
  if (!next) return '';
  const seen = new Set();
  const at = list.filter(([lv, name]) => lv === next[0] && !seen.has(name) && seen.add(name));
  const named = at.slice(0, NAMED).map(([, name, use]) => (use ? name + ' (' + use + ')' : name));
  return 'Next at level ' + next[0] + ': ' + named.join(', ') + (at.length > NAMED ? ' and ' + (at.length - NAMED) + ' more' : '');
}
