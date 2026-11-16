// tools/balance-sim/uniques-proof.mjs — A UNIQUE'S ARMOR AND ATTRIBUTE REACH THE ENGINE (lane/a-grader-uniques; run by
// `node tools/balance-sim/grade.mjs --selftest`, which CI runs).
//
// The grader's `uniques` kit (gear.mjs) dresses a hero in the best piece it can get per slot, the staged gear catalogues'
// hidden rows included, and puts those rows into the engine's ITEMS as they would ship. This proves, on the Pauper Vaults at
// its floor (165) with the Morrow's three packs open, the ground the armor line was measured on:
//   U1  the kit wears a staged plate piece (one the ladder has no row for) in each slot the Vaults sample fills;
//   U2  the live settle's own member builder (src/core/member.js memberSide, the hr-accrue settle's) carries each worn piece's
//       armor onto the hero: heavy armour is the sum of the worn plate rows, and more than the ladder kit's;
//   U3  each worn attribute the engine has a hook for reaches the hero's unit at its row's size (a resistance in `resistPm`);
//   U4  an attribute with no hook yet is reported `hooked: false` and is not on the unit (proven on Krell's Hold at 88 too, where the
//       Banded Legguards are worn: the armor line carries only hooked attributes since lane/d-armor-line-v2) (the grader never plays what the
//       game would not: no sim-only shortcut).
// Each mutant plants one defect where the rows meet the engine and must turn the proof red:
//   ladder       the kit ignores `uniques` (dressed off the ladder alone)
//   edgeMissing  the staged rows are in src/core's ITEMS only, not the edge's (the settle's)
//   attrStripped a worn row reaches the engine without its attribute
//   baseArmor    a worn row reaches the engine with its Dawnsteel twin's armor (the line not applied)
//   fakeHook     the report calls an unhooked attribute applied
// Answers a list of failures (empty: proven).

const GROUND = 'pauper_vaults';
const LEVEL = 165;
const OPEN = Object.freeze(['pauper_vaults', 'carters_rest', 'ox_road', 'wyvern_roost']);
export const UNIQUES_MUTANTS = Object.freeze(['ladder', 'edgeMissing', 'attrStripped', 'baseArmor', 'fakeHook']);

export function proveUniques(gear, plant = null) {
  const bad = [];
  const opts = { ground: GROUND, openAlso: [...OPEN] };
  const kit = gear.kitOf('tank', LEVEL, { ...opts, uniques: plant !== 'ladder' });
  const ladderKit = gear.kitOf('tank', LEVEL, opts);
  /* the sample this proves on: every staged plate row that drops on the Vaults and is worn by 165, best armor per slot */
  const sample = {};
  for (const [id, s] of gear.staged) {
    const r = s.row;
    if (s.ground !== GROUND || r.armourClass !== 'plate' || !(Number(r.reqLv) <= LEVEL)) continue;
    if (!sample[r.slot] || r.defB > gear.staged.get(sample[r.slot]).row.defB) sample[r.slot] = id;
  }
  if (!Object.keys(sample).length) return ['U1 no staged plate row drops on ' + GROUND + ' by Level ' + LEVEL + ': the proof has nothing to prove on (re-aim it)'];
  for (const [slot, id] of Object.entries(sample)) if (kit[slot] !== id) bad.push('U1 the ' + slot + ' is ' + kit[slot] + ', not the staged ' + id);

  /* the table the engine reads, with the planted defect */
  let items = gear.EDGE_ITEMS;
  const worn = Object.values(sample).filter((id) => kit[Object.keys(sample).find((k) => sample[k] === id)] === id);
  const copy = () => (items === gear.EDGE_ITEMS ? { ...gear.EDGE_ITEMS } : items);
  if (plant === 'edgeMissing') { items = copy(); for (const id of gear.staged.keys()) delete items[id]; }
  if (plant === 'attrStripped') { items = copy(); for (const id of worn) { const r = JSON.parse(JSON.stringify(items[id])); delete r.resistPm; items[id] = r; } }
  if (plant === 'baseArmor') {
    items = copy();
    for (const id of worn) { const base = gear.ITEMS[gear.ladder['plate:' + items[id].slot].find((x) => gear.ITEMS[x] && gear.ITEMS[x].tier === items[id].tier)]; items[id] = { ...items[id], defB: base.defB }; }
  }
  const view = gear.engineView(kit, LEVEL, items), was = gear.engineView(ladderKit, LEVEL);

  /* U2: heavy armour is the worn plate rows' sum, past the ladder's */
  const plate = Object.entries(kit).filter(([k]) => k !== 'weapon' && k !== 'ammo').map(([, id]) => gear.staged.has(id) ? gear.staged.get(id).row : gear.ITEMS[id])
    .filter((r) => r && r.armourClass === 'plate').reduce((s, r) => s + (r.defB || 0), 0);
  if (view.armour.heavy !== plate) bad.push('U2 the engine\'s heavy armour is ' + view.armour.heavy + ', the worn plate rows say ' + plate);
  if (!(view.armour.heavy > was.armour.heavy)) bad.push('U2 the engine\'s heavy armour (' + view.armour.heavy + ') is not past the ladder kit\'s (' + was.armour.heavy + ')');

  /* U3 and U4: what the report says each worn attribute does, against the unit */
  /* U4 needs a worn attribute with no hook. Since lane/d-armor-line-v2 the armor line carries only attributes the engine reads
     (tests/armor-line.mjs AL6), so the Vaults kit wears none: U4 is proven on Krell's Hold at 88 as well, where the Banded
     Legguards (physical resistance, its hook owed) are worn by the same rank. */
  const kit2 = gear.kitOf('tank', 88, { ground: 'krells_hold', uniques: plant !== 'ladder' });
  const sets = [[gear.uniquesIn(kit, LEVEL).filter((p) => p.staged), view], [gear.uniquesIn(kit2, 88).filter((p) => p.staged), gear.engineView(kit2, 88, items)]];
  let hooked = 0, unhooked = 0;
  for (const [report, v] of sets) {
    if (plant === 'fakeHook') for (const p of report) if (p.hooked === false) p.hooked = true;
    for (const p of report) {
      const row = gear.staged.get(p.id).row;
      for (const [k, pm] of Object.entries(row.resistPm || {})) {
        const on = !!(v.resistPm && v.resistPm[k] >= pm);
        if (p.hooked === true) { hooked++; if (!on) bad.push('U3 ' + p.id + '\'s ' + k + ' resistance (' + pm + ') is reported applied and is not on the hero\'s unit (' + JSON.stringify(v.resistPm) + ')'); }
        if (p.hooked === false) { unhooked++; if (v.resistPm && k in v.resistPm) bad.push('U4 ' + p.id + '\'s ' + k + ' is reported unhooked but is on the unit'); }
      }
    }
  }
  if (!hooked) bad.push('U3 no worn attribute reached the engine (nothing proven)');
  if (!unhooked) bad.push('U4 no worn attribute waits on a hook, so the report\'s honesty about one is not proven (re-aim the proof)');
  return bad;
}
