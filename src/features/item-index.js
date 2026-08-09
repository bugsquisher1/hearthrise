// Item reverse-index (b242, Wave 2 clarity) — answers "where's this from?" and
// "what's it used in?" for any item, so the item detail can explain itself.
//
// Built once from static data (monster drops, recipes, gather nodes, crops) and
// memoised. Data-only: a new drop/recipe/node adds itself to the index for free
// (the "safe to extend" pillar). Publishes:
//   window.itemDesc(id)        → the flavour line (from item-descriptions.js)
//   window.itemSourceLine(id)  → "Crafted · Smithing Lv 40 · Dropped by Goblin"
//   window.itemUsedInLine(id)  → "Steel Sword, Steel Platebody +3 more"
//
// Exports: setupItemIndex().

import { MONSTERS } from '../data/monsters.js?v=262';
import { ARTISAN_RECIPES } from '../data/recipes.js?v=262';
import { TREES, ROCKS, FISH_SPOTS, CROPS } from '../data/gathering.js?v=262';
import { ITEM_DESC } from '../data/item-descriptions.js?v=262';

const SKILL_LABEL = { smithing: 'Smithing', crafting: 'Crafting', cooking: 'Cooking', prayer: 'Prayer' };

function inputsOf(r) {
  if (r.inputs) return r.inputs;
  const i = {};
  if (r.input) i[r.input] = r.inputQty || 1;
  if (r.secondary) Object.entries(r.secondary).forEach(([k, v]) => { i[k] = v; });
  return i;
}
const nameOf = (id) => { const d = window.ITEMS && window.ITEMS[id]; return (d && d.n) || id; };

let _idx = null;
function build() {
  const src = {};   // id -> { craft:{skill,req}, gather:label, farm:bool, monsters:Set }
  const used = {};  // id -> Set of output item names
  const S = (id) => (src[id] = src[id] || { monsters: new Set() });

  const M = window.MONSTERS || MONSTERS;
  Object.values(M || {}).forEach((m) => {
    (m.drops || []).forEach((d) => { if (d && d.id) S(d.id).monsters.add(m.name || 'a foe'); });
  });

  const gtab = [[window.TREES || TREES, 'Woodcutting'], [window.ROCKS || ROCKS, 'Mining'], [window.FISH_SPOTS || FISH_SPOTS, 'Fishing']];
  gtab.forEach(([arr, label]) => { (arr || []).forEach((a) => { if (a && a.prod) S(a.prod).gather = label; }); });

  const C = window.CROPS || CROPS || {};
  Object.keys(C).forEach((k) => { S(k).farm = true; const p = C[k] && (C[k].prod || C[k].produce); if (p) S(p).farm = true; });

  const R = window.ARTISAN_RECIPES || ARTISAN_RECIPES || {};
  Object.entries(R).forEach(([skill, list]) => {
    (list || []).forEach((r) => {
      if (r.output) S(r.output).craft = { skill, req: r.req || 1 };
      const outName = nameOf(r.output);
      Object.keys(inputsOf(r)).forEach((iid) => { (used[iid] = used[iid] || new Set()).add(outName); });
    });
  });

  _idx = { src, used };
  return _idx;
}
function idx() { return _idx || build(); }

function sourceLine(id) {
  const s = idx().src[id];
  if (!s) return '';
  const parts = [];
  if (s.craft) parts.push('Crafted · ' + (SKILL_LABEL[s.craft.skill] || s.craft.skill) + ' Lv ' + s.craft.req);
  if (s.gather) parts.push(s.gather);
  if (s.farm) parts.push('Farming');
  if (s.monsters && s.monsters.size) {
    const list = [...s.monsters];
    parts.push('Dropped by ' + list.slice(0, 2).join(', ') + (list.length > 2 ? ' +' + (list.length - 2) : ''));
  }
  return parts.join(' · ');
}
function usedInLine(id) {
  const u = idx().used[id];
  if (!u || !u.size) return '';
  const list = [...u];
  return list.slice(0, 4).join(', ') + (list.length > 4 ? ' +' + (list.length - 4) + ' more' : '');
}
function desc(id) { return (window.ITEM_DESC && window.ITEM_DESC[id]) || ITEM_DESC[id] || ''; }

export function setupItemIndex() {
  window.ITEM_DESC = window.ITEM_DESC || ITEM_DESC;
  window.itemDesc = desc;
  window.itemSourceLine = sourceLine;
  window.itemUsedInLine = usedInLine;
  window.HearthriseItemIndex = { sourceLine, usedInLine, desc, rebuild: build };
  console.log('[Item Index ESM] loaded — item→source + item→used-in');
}
