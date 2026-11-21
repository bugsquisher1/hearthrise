// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/atlas/kits.mjs — WHAT A HERO WEARS AT LOW, MID AND BiS, by the rules of 50-standards 1.4 (no hand-typed kit).
//
//   loadKits(root) -> { kitFor(level, state, style) -> { slots: { slot: item }, upgrades: [id...], notes: [text] }, staged, stagedGrounds(level) }
//
// The pieces come from tools/balance-sim/gear.mjs kitOf (the grader's own dresser). When the sibling lane's kit builder lands
// (tools/balance-program/grid-kit.mjs loadKits -> kitFor(level, state, style) -> a PLAN { kit, temper }), that one is read instead (one kit
// builder, never two) through fromGridPlan below. The rules layered here are the standards' own words:
//   LOW   under Level 15 the start kit; then the ladder one tier under in every slot (tierOffset -1, only 'all'). No jewelry, no rungs
//   MID   the ladder's tier, past tier 7 what a ground or boss drops (uniques), plain jewelry and cloak (accessories), Tempering rung 2 of 5 on
//         both tracks of the worn tier
//   BIS   as MID with the Hearth Chest's pieces (chest), each jewel Hallmarked (the jeweler's step from its plain piece), rungs 5 of 5.
//         Linings, perks on 12 seats, worn in, Necrotic and Storm and faction skills are RULED, NOT BUILT: named in notes, never priced
// A staged ground (Morrow Hills, the Catacombs) is open to the kit from its band's floor (50-standards 1.2, stretch B: staged rows opened).
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadGear } from '../../balance-sim/gear.mjs';

const SLOTS = Object.freeze(['weapon', 'shield', 'helmet', 'body', 'pants', 'boots', 'gloves', 'belt', 'ring1', 'ring2', 'earrings', 'necklace', 'cape']);
export const GEAR_SLOTS = SLOTS;
const PROJECTED_NOTES = Object.freeze(['linings (every socket, to the 40% cap)', 'perks on 12 seats', 'worn in', 'Necrotic and Storm', 'faction skills']);

/** The grid lane's kit PLAN ({ kit: { slot: id }, temper: { 'temper:<track>:<tier>': rung } | null, projectedAdds }) in this file's shape. Pure. */
export function fromGridPlan(plan) {
  const slots = {};
  for (const s of SLOTS) if (plan && plan.kit && plan.kit[s]) slots[s] = plan.kit[s];
  const upgrades = [];
  for (const [k, rung] of Object.entries((plan && plan.temper) || {})) for (let r = 1; r <= rung; r++) upgrades.push(k + ':' + r);
  return { slots, upgrades, notes: ((plan && plan.projectedAdds) || []).map((a) => a.id + ' (ruled, not built)') };
}

export async function loadKits(root, D) {
  const G = await loadGear(root);
  G.registerStaged();
  let external = null;
  const gridFile = join(root, 'tools', 'balance-program', 'grid-kit.mjs');
  if (existsSync(gridFile)) {
    const m = await import(pathToFileURL(gridFile).href);
    if (typeof m.loadKits === 'function') { const K = await m.loadKits(root); external = (level, state, style) => fromGridPlan(K.kitFor(level, state, style)); }
  }
  const stagedGrounds = (level) => Object.keys(D.HUNT_GROUNDS).filter((g) => !D.OPEN_GROUNDS[g] && D.HUNT_INDEX[g] && D.HUNT_INDEX[g].band[0] <= level);
  /* the jeweler's Hallmarked row a plain piece becomes (its base's first Hallmark offer), or the piece itself when none exists */
  const hallmarkOf = new Map();
  for (const o of D.HALLMARK_OFFERS) {
    const base = (D.ITEMS[o.from] || D.JEWELRY_ITEMS[o.from] || {}).jewelBase;
    if (base && !hallmarkOf.has(base)) hallmarkOf.set(base, o.to);
  }
  const temperTier = (slots) => {
    const t = Math.max(0, ...['weapon', 'body', 'helmet'].map((s) => Number((D.ITEMS[slots[s]] || {}).tier) || 0));
    return Math.min(7, t);
  };
  const rungs = (tier, n) => (tier >= 2 ? ['blows', 'armor'].flatMap((tr) => Array.from({ length: n }, (_, i) => 'temper:' + tr + ':' + tier + ':' + (i + 1))) : []);
  const memo = new Map();
  function kitFor(level, state, style) {
    const k = level + '|' + state + '|' + style;
    if (memo.has(k)) return memo.get(k);
    let out;
    if (external) out = external(level, state, style);
    else {
      const openAlso = stagedGrounds(level);
      const base = openAlso.length ? { openAlso } : {};
      let slots, upgrades = [], notes = [];
      if (state === 'low') {
        slots = level < 15 ? G.kitOf(style, level, { starter: true }) : G.kitOf(style, level, { tierOffset: -1, only: 'all', ...base });
      } else if (state === 'mid') {
        slots = G.kitOf(style, level, { uniques: true, accessories: true, ...base });
        if (level >= 15) upgrades = rungs(temperTier(slots), 2);
      } else {
        slots = G.kitOf(style, level, { uniques: true, chest: true, accessories: true, ...base });
        for (const s of ['ring1', 'ring2', 'earrings', 'necklace', 'cape']) {
          const it = D.ITEMS[slots[s]] || {};
          const h = it.jewelBase ? hallmarkOf.get(it.jewelBase) : hallmarkOf.get(slots[s]);
          if (h && (Number((D.ITEMS[h] || D.JEWELRY_ITEMS[h] || {}).reqLv) || 1) <= level) slots[s] = h;
        }
        if (level >= 15) upgrades = rungs(temperTier(slots), 5);
        notes = PROJECTED_NOTES.slice();
      }
      const clean = {};
      for (const s of SLOTS) if (slots[s]) clean[s] = slots[s];
      out = { slots: clean, upgrades, notes };
    }
    memo.set(k, out);
    return out;
  }
  return { kitFor, staged: G.staged, stagedGrounds, ITEMS_WITH_STAGED: G.ITEMS, external: !!external };
}
