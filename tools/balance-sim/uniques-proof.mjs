// tools/balance-sim/uniques-proof.mjs — A UNIQUE'S ARMOR AND ATTRIBUTE REACH THE ENGINE (lane/a-grader-uniques, brought onto v0.2.139 by
// lane/d-late-items-rescue; run by `node tools/balance-sim/grade.mjs --selftest`, which CI runs).
//
// The grader's `uniques` kit (gear.mjs) dresses a hero in the best piece it can get per slot, the staged gear catalogues' hidden rows
// included, and puts those rows into the engine's ITEMS as they would ship. This proves, on the Unmarked Catacombs at its floor (165) with
// the Morrow's three packs open, the ground the armor line was measured on:
//   U1  the kit wears a staged plate piece (one the ladder has no row for) in each slot the Catacombs sample fills;
//   U2  the live settle's own member builder (src/core/member.js memberSide, the hr-accrue settle's) carries each worn piece's armor
//       onto the hero: heavy armour is the sum of the worn plate rows, and more than the ladder kit's;
//   U3  each worn attribute reported applied reaches the hero's unit: the engine's view moves when it is taken off, and a resistance
//       is on the unit at its row's size (`resistPm`);
//   U4  an attribute with no hook yet is reported `hooked: false` and the engine's view does not move without it (the grader never
//       plays what the game would not: no sim-only shortcut). The armor line carries only hooked attributes (tests/armor-line.mjs AL6)
//       and physical resistance is hooked since lane/c-krell-uniques, so U4 is proven on the Slake at 50, where a lone bow wears the
//       Mudlark's Mitts (special-attributes.js: + Ranged as `skillB`, which the engine does not read; its hook is owed).
// Each mutant plants one defect where the rows meet the engine and must turn the proof red:
//   ladder       the kit ignores `uniques` (dressed off the ladder alone)
//   edgeMissing  the staged rows are in src/core's ITEMS only, not the edge's (the settle's)
//   attrStripped a worn row reaches the engine without its attribute
//   baseArmor    a worn row reaches the engine with its Dawnsteel twin's armor (the line not applied)
//   fakeHook     the report calls an unhooked attribute applied
// Answers a list of failures (empty: proven).

const GROUND = 'unmarked_catacombs';
const LEVEL = 165;
const OPEN = Object.freeze(['unmarked_catacombs', 'carters_rest', 'ox_road', 'wyvern_roost']);
/* where U4 is proven: a staged row whose attribute the engine does not read, worn by the uniques kit */
const U4_AT = Object.freeze({ style: 'bow', level: 50, ground: 'the_slake' });
export const UNIQUES_MUTANTS = Object.freeze(['ladder', 'edgeMissing', 'attrStripped', 'baseArmor', 'fakeHook']);
/* a staged row's attribute field (special-attributes.js SPECIAL_ATTRIBUTES[kind].field) */
const FIELD = Object.freeze({ resist_element: 'resistPm', resist_physical: 'resistPm', defense: 'skillB', skill: 'skillB', crit: 'critB', bane: 'bane' });

/** `items` with the staged row `id`'s attribute taken off (a copy: the table given is not touched), or null when it names none. */
function without(items, id, attr) {
  const [kind, key] = attr || [null, null];
  const field = kind ? FIELD[kind] : null;
  const row = items[id];
  if (!field || !row || !Object.prototype.hasOwnProperty.call(row, field)) return null;
  const cut = JSON.parse(JSON.stringify(row));
  if (key && cut[field] && typeof cut[field] === 'object' && field !== 'bane') { delete cut[field][key]; if (!Object.keys(cut[field]).length) delete cut[field]; }
  else delete cut[field];
  return { ...items, [id]: cut };
}

export function proveUniques(gear, plant = null) {
  const bad = [];
  const opts = { ground: GROUND, openAlso: [...OPEN] };
  const kit = gear.kitOf('tank', LEVEL, { ...opts, uniques: plant !== 'ladder' });
  const ladderKit = gear.kitOf('tank', LEVEL, opts);
  /* the sample this proves on: every staged plate row that drops on the Catacombs and is worn by 165, best armor per slot */
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

  /* U3 and U4: what the report says each worn attribute does, against the engine's view with and without it */
  const kit2 = gear.kitOf(U4_AT.style, U4_AT.level, { ground: U4_AT.ground, uniques: plant !== 'ladder' });
  const sets = [[kit, LEVEL, gear.uniquesIn(kit, LEVEL).filter((p) => p.staged)], [kit2, U4_AT.level, gear.uniquesIn(kit2, U4_AT.level).filter((p) => p.staged)]];
  let hooked = 0, unhooked = 0;
  for (const [k, L, report] of sets) {
    if (plant === 'fakeHook') for (const p of report) if (p.hooked === false) p.hooked = true;
    const v = gear.engineView(k, L, items);
    for (const p of report) {
      const s = gear.staged.get(p.id);
      if (!s.attr) continue;
      /* the engine's view without the attribute (a table that has lost it already reads the same: nothing moves) */
      const off = without(items, p.id, s.attr);
      const moves = !!off && JSON.stringify(gear.engineView(k, L, off)) !== JSON.stringify(v);
      if (p.hooked === true) {
        hooked++;
        if (!moves) bad.push('U3 ' + p.id + '\'s ' + p.attr + ' is reported applied and the engine reads nothing of it');
        for (const [key, pm] of Object.entries(s.row.resistPm || {})) if (!(v.resistPm && v.resistPm[key] >= pm)) bad.push('U3 ' + p.id + '\'s ' + key + ' resistance (' + pm + ') is reported applied and is not on the hero\'s unit (' + JSON.stringify(v.resistPm) + ')');
      }
      if (p.hooked === false) { unhooked++; if (moves) bad.push('U4 ' + p.id + '\'s ' + p.attr + ' is reported unhooked and the engine reads it'); }
    }
  }
  if (!hooked) bad.push('U3 no worn attribute reached the engine (nothing proven)');
  if (!unhooked) bad.push('U4 no worn attribute waits on a hook, so the report\'s honesty about one is not proven (re-aim the proof: ' + JSON.stringify(U4_AT) + ')');
  return bad;
}
