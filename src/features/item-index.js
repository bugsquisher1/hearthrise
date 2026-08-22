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

import { MONSTERS } from '../data/monsters.js?v=433';
import { ARTISAN_RECIPES } from '../data/recipes.js?v=433';
import { TREES, ROCKS, FISH_SPOTS, CROPS } from '../data/gathering.js?v=433';
import { ITEM_DESC } from '../data/item-descriptions.js?v=433';
import { SHOP_OFFERS } from '../data/shops.js?v=433';

const SKILL_LABEL = {
  smithing: 'Smithing', crafting: 'Crafting', cooking: 'Cooking', prayer: 'Prayer',
  runecrafting: 'Runecrafting', stonemason: 'Stonemason',
};

/* b372 — WHICH COUNTER SELLS IT. The index answered "where's this from?" from
   drops, recipes, nodes, crops and (b355) dungeons — but NOT from the shops,
   which is how a player gets every seed, the starter weapons, the companions
   and the bounty-shop stock. So the flyout for a Wheat Seed, opened from the
   farm's own requirement, said nothing at all.

   SHOP_OFFERS is the generated price catalogue (tools/gen-shops.mjs, guarded
   by a preflight), so this is data in / sentence out like the rest of the
   index: a new offer describes itself, and a price change is never restated
   here. `table` is the offer's origin table and names the counter. */
const SHOP_LABEL = {
  equip: 'the Store', seed: 'the Seed shop', bounty: 'the Bounty shop',
  trait: 'the Store', cosmetic: 'the Store', companion: 'the Store',
  dungeon: 'the Quartermaster', iap: 'the Hearth Shop',
};
const CURRENCY_LABEL = {
  gold: 'g', gems: ' Gems', marks: ' Bounty Marks', bounty_marks: ' Bounty Marks',
  scrip: ' Dungeon Scrip', dungeon_scrip: ' Dungeon Scrip', hearth_token: ' Hearth Tokens',
};
function priceText(cost) {
  const cur = (cost || []).find((c) => c && c.kind === 'currency');
  if (!cur) return '';
  const suffix = CURRENCY_LABEL[cur.id];
  /* An unknown currency is NAMED rather than dropped or guessed at — a price
     the index cannot label is still a price the player has to pay. */
  return (cur.amount || 0).toLocaleString() + (suffix != null ? suffix : ' ' + cur.id);
}

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
  const S = (id) => (src[id] = src[id] || { monsters: new Set(), dungeons: new Set() });

  const M = window.MONSTERS || MONSTERS;
  Object.values(M || {}).forEach((m) => {
    (m.drops || []).forEach((d) => { if (d && d.id) S(d.id).monsters.add(m.name || 'a foe'); });
  });

  const gtab = [[window.TREES || TREES, 'Woodcutting'], [window.ROCKS || ROCKS, 'Mining'], [window.FISH_SPOTS || FISH_SPOTS, 'Fishing']];
  gtab.forEach(([arr, label]) => { (arr || []).forEach((a) => { if (a && a.prod) S(a.prod).gather = label; }); });

  /* b372: name the CROP, not just the skill. "Farming" told a player looking
     at a Pumpkin requirement nothing they did not already suspect; "Farming ·
     grow Pumpkin" tells them which seed to buy, and the seed's own flyout now
     names the Seed shop. Two taps, no wiki. */
  const C = window.CROPS || CROPS || {};
  Object.keys(C).forEach((k) => {
    const c = C[k] || {};
    const p = c.prod || c.produce || k;
    const s = S(p);
    s.farm = true;
    s.farmCrop = c.name || k;
  });

  const R = window.ARTISAN_RECIPES || ARTISAN_RECIPES || {};
  Object.entries(R).forEach(([skill, list]) => {
    (list || []).forEach((r) => {
      /* b372: carry the INPUTS. "Crafted · Crafting Lv 45" is a wall for a
         player who does not already know a Maple Plank is sawn from a Maple
         Log — the exact wall KD420 hit. Naming the inputs turns the flyout
         into one step of a chain the player can walk. Capped at three so a
         five-ingredient stew does not bury the line. */
      if (r.output) {
        const from = Object.keys(inputsOf(r));
        S(r.output).craft = { skill, req: r.req || 1, from: from.length <= 3 ? from.map(nameOf) : [] };
      }
      const outName = nameOf(r.output);
      Object.keys(inputsOf(r)).forEach((iid) => { (used[iid] = used[iid] || new Set()).add(outName); });
    });
  });

  /* b355 — DUNGEON LOOT AND THE QUARTERMASTER ARE SOURCES TOO.
     The index answered "where's this from?" from monsters, recipes, nodes and
     crops only, so every dungeon-only item — the eight housing blueprints, the
     farm deeds, the signature boss weapons — returned an EMPTY source line.
     That emptiness is what forced the room modal's blueprint gate to carry
     hardcoded prose ("they drop from dungeons"), which is the thing this index
     exists to make unnecessary. Data in, sentence out: a blueprint moved to a
     new dungeon, or added to the scrip shop, now re-describes itself. */
  const D = window.DUNGEONS || null;
  if (D) {
    Object.values(D).forEach((d) => {
      (d.loot || []).forEach((L) => { if (L && L.id) S(L.id).dungeons.add(d.name || 'a dungeon'); });
    });
  }
  (window.QM_STOCK || []).forEach((q) => { if (q && q.id) S(q.id).scrip = q.scrip; });

  /* b372 — the shop counters. Only offers that GRANT an item are sources; an
     offer that SPENDS one (a dungeon key buying entry) is a use, not a route,
     and belongs to the used-in index rather than here. First offer wins so a
     one-off starter bundle cannot rename the counter a repeatable sells at. */
  ((window.SHOP_OFFERS && window.SHOP_OFFERS.length) ? window.SHOP_OFFERS : SHOP_OFFERS || [])
    .forEach((o) => {
      (o.grant || []).forEach((g) => {
        if (!g || g.kind !== 'item' || !g.id) return;
        const s = S(g.id);
        if (s.shop) return;
        s.shop = { where: SHOP_LABEL[o.table] || 'a shop', price: priceText(o.cost) };
      });
    });

  _idx = { src, used };
  /* Do NOT memoise a half-built index. dungeons.js is a classic script and the
     first sourceLine() call can legitimately land before it has run; caching
     that answer would leave every dungeon item sourceless for the session. */
  _full = !!D;
  return _idx;
}
let _full = false;
function idx() { return (_idx && _full) ? _idx : build(); }

function sourceLine(id) {
  const s = idx().src[id];
  if (!s) return '';
  const parts = [];
  if (s.craft) {
    parts.push('Crafted · ' + (SKILL_LABEL[s.craft.skill] || s.craft.skill) + ' Lv ' + s.craft.req
      + ((s.craft.from && s.craft.from.length) ? ' from ' + s.craft.from.join(' + ') : ''));
  }
  if (s.gather) parts.push(s.gather);
  if (s.farm) parts.push('Farming' + (s.farmCrop ? ' · grow ' + s.farmCrop : ''));
  if (s.monsters && s.monsters.size) {
    const list = [...s.monsters];
    parts.push('Dropped by ' + list.slice(0, 2).join(', ') + (list.length > 2 ? ' +' + (list.length - 2) : ''));
  }
  if (s.dungeons && s.dungeons.size) {
    const list = [...s.dungeons];
    parts.push('Drops in ' + list.slice(0, 2).join(', ') + (list.length > 2 ? ' +' + (list.length - 2) : ''));
  }
  if (s.scrip) parts.push('Quartermaster · ' + s.scrip + ' Dungeon Scrip');
  if (s.shop) parts.push('Bought at ' + s.shop.where + (s.shop.price ? ' · ' + s.shop.price : ''));
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
