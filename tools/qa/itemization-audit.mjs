// tools/qa/itemization-audit.mjs — read-only dump for the 2026-11-18 itemization audit (lane/d-itemization-audit).
// Usage: node tools/qa/itemization-audit.mjs <section>
//   probe | grounds | gear | recipes | dead | shop
// Reads the data modules only. Changes nothing.
import { readFileSync } from 'node:fs';
import { sourceQuery } from '../lib/version-stamp.mjs';
/* the data modules at the build's own ?v= (src/build-info.js), so they are the same instances their own imports load (no version is written here) */
const V = sourceQuery();
const imp = (p) => import(new URL('../../src/data/' + p, import.meta.url).href + V);
const { ITEMS } = await imp('items.js');
const CC = await imp('catalogue-coherence.js');
const HG = await imp('hunt-grounds.js');
const { HUNT_INDEX } = await imp('hunts.js');

const { MONSTERS, ARTISAN_RECIPES, SHOP_OFFERS, SHOP_LISTED_OFFER_IDS } = CC;
const sec = process.argv[2] || 'probe';
const arg = process.argv[3] || '';

const monstersOf = (g) => {
  const s = new Set();
  for (const p of g.pockets || []) for (const x of (p.pack || []).concat(p.spawns || [], p.adds || [])) s.add(x.monster);
  for (const x of (HUNT_INDEX[g.hunt] || {}).spawns || []) s.add(x.monster);
  return [...s];
};
const allG = { ...HG.HUNT_GROUNDS, ...HG.HALL_GROUNDS, ...HG.CALLED_GROUNDS };
const openG = { ...HG.OPEN_GROUNDS, ...HG.OPEN_HALL_GROUNDS };
const openIds = new Set(Object.keys(openG));
for (const k of Object.keys(HG.CALLED_GROUNDS)) openIds.add(k);

/* monster -> grounds it stands on */
const homeOf = new Map();
for (const [gid, g] of Object.entries(allG)) for (const m of monstersOf(g)) { if (!homeOf.has(m)) homeOf.set(m, []); homeOf.get(m).push(gid); }
/* item -> drop rows */
const dropsOf = new Map();
for (const [mid, m] of Object.entries(MONSTERS)) for (const d of m.drops || []) {
  if (!dropsOf.has(d.id)) dropsOf.set(d.id, []);
  dropsOf.get(d.id).push({ mon: mid, ch: d.ch, band: d.band, grounds: homeOf.get(mid) || [] });
}
/* item -> recipes */
const madeBy = new Map();
const usedBy = new Map();
for (const [skill, list] of Object.entries(ARTISAN_RECIPES)) for (const r of list || []) {
  const ins = CC.recipeInputs(r);
  let outs = [];
  try { outs = (await imp('jewelry.js')).recipeOutcomes(r); } catch { outs = [r.output]; }
  for (const o of outs) if (o) { if (!madeBy.has(o)) madeBy.set(o, []); madeBy.get(o).push({ skill, req: r.req, ins, xp: r.xp, ms: r.ms, gated: r.gated, id: r.id }); }
  for (const i of Object.keys(ins)) { if (!usedBy.has(i)) usedBy.set(i, []); usedBy.get(i).push({ skill, req: r.req, out: r.output || r.id }); }
}
const shopOf = new Map();
for (const o of SHOP_OFFERS) for (const g of (o && o.grant) || []) if (g.kind === 'item') {
  if (!shopOf.has(g.id)) shopOf.set(g.id, []);
  shopOf.get(g.id).push({ offer: o.id, listed: SHOP_LISTED_OFFER_IDS.has(o.id), cost: (o.cost || []).map((c) => (c.amount || c.qty || c.n || '') + ' ' + (c.id || c.kind)).join('+'), qty: g.qty || g.amount });
}
const reach = CC.reachableSources();
const reachAll = CC.reachableSources({ grounds: allG, premium: true });
const srcs = CC.itemSources();
const uses = CC.itemUses();

const STAT_KEYS = ['atkB', 'strB', 'defB', 'rangeAtkB', 'rangeStrB', 'magicAtkB', 'magicStrB', 'critB', 'spdB', 'hpB', 'manaB', 'wardB', 'dodgeB', 'absorbB', 'blockB', 'def', 'atk', 'str'];
const statsOf = (it) => Object.entries(it).filter(([k, v]) => typeof v === 'number' && !['v', 'tier', 'reqLv', 'stack', 'ammoPerShot'].includes(k)).map(([k, v]) => k + ':' + v).join(' ');
const WEAR = new Set(['weapon', 'armor', 'offhand', 'jewelry', 'ammo']);
const isWorn = (it) => it && (WEAR.has(it.type) || it.slot);

const fmtDrop = (d) => `${d.mon}@${(d.ch * 100).toFixed(2)}%/${d.band || '-'}[${d.grounds.map((g) => g + (openIds.has(g) ? '' : '*')).join(',') || 'NO GROUND'}]`;
const fmtMade = (m) => `${m.skill}${m.req}:{${Object.entries(m.ins).map(([k, v]) => v + ' ' + k).join(', ')}}${m.gated ? ' gated:' + m.gated : ''}`;

if (sec === 'probe') {
  const g = Object.values(HG.HUNT_GROUNDS)[3];
  console.log(Object.keys(g), JSON.stringify(g, (k, v) => (k === 'pockets' || k === 'map') ? '[..]' : v).slice(0, 1500));
  console.log('HUNT', Object.keys(HG.HUNT_GROUNDS)); console.log('OPEN', Object.keys(HG.OPEN_GROUNDS)); console.log('HALL', Object.keys(HG.HALL_GROUNDS), 'OPENHALL', Object.keys(HG.OPEN_HALL_GROUNDS));
  console.log('CALLED', Object.keys(HG.CALLED_GROUNDS)); console.log('TOWER', Object.keys(HG.TOWER_GROUNDS || {})); console.log('TRAIN', Object.keys(HG.TRAINING_GROUNDS || {}));
  console.log(JSON.stringify(Object.values(HUNT_INDEX)[3]).slice(0, 800));
}

if (sec === 'grounds') {
  for (const [gid, g] of Object.entries(allG)) {
    const h = HUNT_INDEX[g.hunt] || {};
    console.log(`\n## ${gid} ${openIds.has(gid) ? 'OPEN' : 'STAGED'} hunt=${g.hunt} name=${h.name || g.name} lv=${JSON.stringify(h.band || h.levels || g.band || g.level || [h.minLv, h.maxLv])}`);
    for (const mid of monstersOf(g)) {
      const m = MONSTERS[mid]; if (!m) { console.log('  ?? ' + mid); continue; }
      console.log(`  ${mid} L${m.level} hp${m.hp} xp${m.xp} gp${JSON.stringify(m.gp)}`);
      for (const d of m.drops || []) {
        const it = ITEMS[d.id] || {};
        console.log(`     ${(d.band || '-').padEnd(8)} ${(d.ch * 100).toFixed(2).padStart(6)}%  ${d.id} [${it.type || '?'}${it.slot ? '/' + it.slot : ''}${it.tier ? ' t' + it.tier : ''}${it.weight ? ' ' + it.weight : ''}] v${it.v}`);
      }
    }
  }
}

if (sec === 'gear') {
  const rows = Object.entries(ITEMS).filter(([, it]) => isWorn(it));
  rows.sort((a, b) => String(a[1].slot).localeCompare(String(b[1].slot)) || (a[1].tier || 0) - (b[1].tier || 0) || (a[1].reqLv || 0) - (b[1].reqLv || 0));
  for (const [id, it] of rows) {
    if (arg && !(String(it.slot) + ' ' + it.type).includes(arg)) continue;
    const parts = [];
    for (const d of dropsOf.get(id) || []) parts.push('DROP ' + fmtDrop(d));
    for (const m of madeBy.get(id) || []) parts.push('MADE ' + fmtMade(m));
    for (const s of shopOf.get(id) || []) parts.push((s.listed ? 'SHOP ' : 'shop-unlisted ') + s.cost);
    const other = (srcs.get(id) || []).filter((l) => !/monster drop|made by|^shop$/.test(l));
    if (other.length) parts.push('OTHER ' + other.join('/'));
    const r = reach.has(id) ? 'LIVE' : (reachAll.has(id) ? 'staged' : 'NONE');
    console.log(`${String(it.slot || '-').padEnd(9)} t${it.tier || '-'} L${String(it.reqLv || '-').padEnd(3)} ${r.padEnd(6)} ${id.padEnd(26)} ${String(it.weight || it.weaponType || '').padEnd(8)} ${statsOf(it)} | v${it.v} | ${parts.join(' ; ') || 'NO SOURCE'}`);
  }
}

if (sec === 'recipes') {
  for (const [skill, list] of Object.entries(ARTISAN_RECIPES)) {
    console.log(`\n## ${skill} (${list.length})`);
    for (const r of list) {
      const ins = CC.recipeInputs(r);
      const out = ITEMS[r.output] || {};
      const insReach = Object.keys(ins).every((i) => reach.has(i));
      const outUses = (uses.get(r.output) || []).join('/');
      console.log(`  L${String(r.req).padEnd(3)} ${(r.output || r.id || '').padEnd(26)} [${out.type || ''}${out.slot ? '/' + out.slot : ''}${out.tier ? ' t' + out.tier : ''}] v${out.v} xp${r.xp} ms${r.ms} <= ${Object.entries(ins).map(([k, v]) => v + ' ' + k + '(v' + (ITEMS[k] || {}).v + ')').join(', ')}${r.gated ? ' gated:' + r.gated : ''}${r.qty ? ' x' + r.qty : ''} ${insReach ? '' : '!!INPUT-UNREACHABLE'} | uses: ${outUses}${(dropsOf.get(r.output) || []).length ? ' | ALSO DROPS ' + dropsOf.get(r.output).map(fmtDrop).join(' ') : ''}${(shopOf.get(r.output) || []).some((s) => s.listed) ? ' | ALSO SHOP' : ''}`);
    }
  }
}

if (sec === 'dead') {
  console.log('## items with a live source whose only use is vendor trash or none');
  for (const id of Object.keys(ITEMS)) {
    if (!reach.has(id)) continue;
    const u = (uses.get(id) || []);
    const real = u.filter((l) => l !== 'vendor trash');
    if (!real.length) console.log(`  ${id.padEnd(26)} ${ITEMS[id].type || ''} v${ITEMS[id].v} src=${reach.get(id)} uses=${u.join('/') || 'NONE'}`);
  }
  console.log('\n## materials: reachable, used by recipes, where from and who uses');
  for (const [id, list] of usedBy) {
    console.log(`  ${id.padEnd(22)} ${reach.has(id) ? 'LIVE  ' : (reachAll.has(id) ? 'staged' : 'NONE  ')} src=${reach.get(id) || reachAll.get(id) || '-'} -> ${list.length} recipes (${[...new Set(list.map((l) => l.skill))].join(',')})`);
  }
  console.log('\n## reachability counts');
  console.log('items', Object.keys(ITEMS).length, 'reachable live', reach.size, 'with staged doors', reachAll.size);
}

if (sec === 'shop') {
  for (const o of SHOP_OFFERS) {
    if (!SHOP_LISTED_OFFER_IDS.has(o.id)) continue;
    console.log(`${o.id.padEnd(30)} cost=${JSON.stringify(o.cost)} grant=${JSON.stringify(o.grant)} ${o.tab || o.shop || ''}`);
  }
}
