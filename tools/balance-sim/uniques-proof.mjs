// tools/balance-sim/uniques-proof.mjs — WHAT THE UNIQUES KIT WEARS REACHES THE ENGINE, AND ITS REPORT SAYS SO HONESTLY (lane/a-grader-uniques,
// brought onto v0.2.139 by lane/d-late-items-rescue; run by `node tools/balance-sim/grade.mjs --selftest`, which CI runs).
//
// The grader's `uniques` kit (gear.mjs) dresses a hero in the best piece it can get per slot, the staged gear catalogues' hidden rows
// included, and puts those rows into the engine's ITEMS as they would ship. This proves:
//   U3  each worn attribute the report calls applied reaches the hero's unit: the engine's view moves when it is taken off;
//   U4  the report reads the ENGINE, never the catalogue (the grader never plays what the game would not: no sim-only shortcut). Re-aimed
//       on the built field (the designer's ruling 2026-11-18 row 1c): on the Slake at 50 a lone bow wears the Mudlark's Mitts, whose
//       + Ranged is the engine's own `rangedPlus` (combat.js SKILL_PLUS_FIELDS), so it is reported `hooked: true` and the hero's unit
//       carries it at its row's size (skillPlus.ranged); and the same piece with its + Ranged planted on a field the engine never
//       reads (`skillB`, where the catalogue had it until 11-18) is reported `hooked: false` and the engine's view does not move.
//   U5  GROUND AND BOSS DROPS ONLY (the designer's ruling 2026-11-18 row 1f): at Carter's Rest's floor (110) no way's kit wears a Hearth Chest
//       piece (the Tower's Platinum weapons were the kit's there before), and with `chest` (the printed what-if) at least one does, so the
//       what-if is not empty.
// RETIRED WITH THE LINES PAST DAWNSTEEL (the designer's 12-targets.md 8.8 and 28-named-pieces.md 2.7, lane/retire-dawnsteel-lines): U1 (the kit
// wears the staged Catacombs plate sample over the ladder) and U2 (that sample's armor reaches the member and is past the ladder kit's), with
// the `baseArmor` mutant (a worn row with its Dawnsteel twin's armor, the line not applied). Their subject was the armor line's sample: on 8.3
// a ground's ceiling is its base tier's formula piece, and a named piece is that piece plus its rule, so no staged plate row is "past the
// ladder" to prove. U3's half that read a staged resistance on the unit went with them (its only subject was that sample); a worn
// resistance reaching the unit is tests/hunt-core/monster-spells.mjs resist-takes-less, played on the settle. `edgeMissing` and
// `attrStripped` are re-aimed on the Mitts, the staged row left.
// Each mutant plants one defect where the rows meet the engine and must turn the proof red:
//   ladder       the kit ignores `uniques` (dressed off the ladder alone)
//   edgeMissing  the staged rows are in src/core's ITEMS only, not the edge's (the settle's)
//   attrStripped a worn staged row reaches the engine without its attribute
//   fakeHook     the report calls an unhooked attribute applied
//   chestIn      the graded kit lets the Hearth Chest's pieces in (the what-if graded as the floor)
// Answers a list of failures (empty: proven).

const OPEN = Object.freeze(['unmarked_catacombs', 'carters_rest', 'ox_road', 'wyvern_roost']);
/* where U3 and U4 are proven: a staged row with a + skill the uniques kit wears (the Mitts), and the field the engine never reads it from */
const U4_AT = Object.freeze({ style: 'bow', level: 50, ground: 'the_slake', id: 'mudlarks_mitts', skill: 'ranged', deadField: 'skillB' });
export const UNIQUES_MUTANTS = Object.freeze(['ladder', 'edgeMissing', 'attrStripped', 'fakeHook', 'chestIn']);
/* where U5 is proven: Carter's Rest's floor with the other Morrow packs open, every way the grader plays alone */
const U5_AT = Object.freeze({ ground: 'carters_rest', level: 110, ways: Object.freeze(['tank', 'sword', 'hammer', 'axes', 'bow', 'crossbow', 'mage', 'healer']) });

/** `items` with the staged row `id`'s attribute taken off (a copy: the table given is not touched), or null when it names none.
    fieldFor(kind, key): the row's field for it (gear.attrFieldOf, the catalogue's). */
function without(items, id, attr, fieldFor) {
  const [kind, key] = attr || [null, null];
  const field = kind ? fieldFor(kind, key) : null;
  const row = items[id];
  if (!field || !row || !Object.prototype.hasOwnProperty.call(row, field)) return null;
  const cut = JSON.parse(JSON.stringify(row));
  if (key && cut[field] && typeof cut[field] === 'object' && field !== 'bane') { delete cut[field][key]; if (!Object.keys(cut[field]).length) delete cut[field]; }
  else delete cut[field];
  return { ...items, [id]: cut };
}

export function proveUniques(gear, plant = null) {
  const bad = [];
  /* the kit the proof reads: the Slake bow, whose Mitts carry + Ranged on the engine's own field */
  const kit2 = gear.kitOf(U4_AT.style, U4_AT.level, { ground: U4_AT.ground, uniques: plant !== 'ladder' });
  const worn = gear.uniquesIn(kit2, U4_AT.level).filter((p) => p.staged).map((p) => p.id);

  /* the table the engine reads, with the planted defect */
  let items = gear.EDGE_ITEMS;
  const copy = () => (items === gear.EDGE_ITEMS ? { ...gear.EDGE_ITEMS } : items);
  if (plant === 'edgeMissing') { items = copy(); for (const id of gear.staged.keys()) delete items[id]; }
  if (plant === 'attrStripped') {
    items = copy();
    for (const id of worn) { const s = gear.staged.get(id), off = s && s.attr ? without(items, id, s.attr, gear.attrFieldOf) : null; if (off) items = off; }
  }

  /* U3 and U4: what the report says each worn attribute does, against the engine's view with and without it. Two reads: the Slake bow,
     whose Mitts carry + Ranged on the engine's own field; and that bow with the Mitts' + Ranged planted on a field the engine never reads
     (the catalogue's `skillB` until 11-18), its report and its engine both read from that table */
  const liveField = gear.attrFieldOf('skill', U4_AT.skill), mitts = items[U4_AT.id] || null;
  let deadItems = null;
  if (mitts && liveField && mitts[liveField] !== undefined) {
    const dead = { ...mitts, [U4_AT.deadField]: { [U4_AT.skill]: mitts[liveField] } };
    delete dead[liveField];
    deadItems = { ...items, [U4_AT.id]: dead };
  }
  const deadFieldOf = (kind, key) => (kind === 'skill' ? U4_AT.deadField : gear.attrFieldOf(kind, key));
  const sets = [[kit2, U4_AT.level, items, gear.attrFieldOf, gear.uniquesIn(kit2, U4_AT.level).filter((p) => p.staged)],
    ...(deadItems ? [[kit2, U4_AT.level, deadItems, deadFieldOf, gear.uniquesIn(kit2, U4_AT.level, { items: deadItems, fieldOf: deadFieldOf }).filter((p) => p.staged)]] : [])];
  let hooked = 0, unhooked = 0;
  for (const [k, L, table, fieldFor, report] of sets) {
    if (plant === 'fakeHook') for (const p of report) if (p.hooked === false) p.hooked = true;
    const v = gear.engineView(k, L, table);
    for (const p of report) {
      const s = gear.staged.get(p.id);
      if (!s.attr) continue;
      /* the engine's view without the attribute (a table that has lost it already reads the same: nothing moves) */
      const off = without(table, p.id, s.attr, fieldFor);
      const moves = !!off && JSON.stringify(gear.engineView(k, L, off)) !== JSON.stringify(v);
      if (p.hooked === true) { hooked++; if (!moves) bad.push('U3 ' + p.id + '\'s ' + p.attr + ' is reported applied and the engine reads nothing of it'); }
      if (p.hooked === false) { unhooked++; if (moves) bad.push('U4 ' + p.id + '\'s ' + p.attr + ' is reported unhooked and the engine reads it'); }
    }
  }
  /* U4 on the built field: the Mitts are worn, reported applied, and their + Ranged is on the hero's unit at the row's size */
  const live = sets[0][4].find((p) => p.id === U4_AT.id), unit = gear.engineView(kit2, U4_AT.level, items);
  const want = gear.staged.has(U4_AT.id) ? Number(gear.staged.get(U4_AT.id).row[liveField]) || 0 : 0;
  if (!live) bad.push('U4 the ' + U4_AT.style + ' on ' + U4_AT.ground + ' at ' + U4_AT.level + ' does not wear ' + U4_AT.id + ': nothing proves the built field (re-aim the proof: ' + JSON.stringify(U4_AT) + ')');
  else if (live.hooked !== true) bad.push('U4 ' + U4_AT.id + '\'s + ' + U4_AT.skill + ' on ' + liveField + ' is reported ' + live.hooked + ', and the engine reads that field');
  else if (!(want > 0 && unit.skillPlus && unit.skillPlus[U4_AT.skill] >= want)) bad.push('U4 ' + U4_AT.id + '\'s + ' + want + ' ' + U4_AT.skill + ' is not on the hero\'s unit (' + JSON.stringify(unit.skillPlus) + ')');
  /* U4 the honest half: the same + Ranged on a field the engine never reads is reported as nothing */
  const deadP = sets[1] ? sets[1][4].find((p) => p.id === U4_AT.id) : null;
  if (!deadP) bad.push('U4 the planted ' + U4_AT.deadField + ' Mitts are not in the report, so its honesty about a dead field is not proven');
  else if (deadP.hooked !== false) bad.push('U4 the Mitts\' + ' + U4_AT.skill + ' planted on ' + U4_AT.deadField + ' (which the engine never reads) is reported ' + deadP.hooked);
  if (!hooked) bad.push('U3 no worn attribute reached the engine (nothing proven)');
  if (!unhooked) bad.push('U4 no worn attribute is read as unhooked, so the report\'s honesty about one is not proven (re-aim the proof: ' + JSON.stringify(U4_AT) + ')');

  /* U5: the graded kit is ground and boss drops only; the chest's pieces only in the what-if */
  const o5 = { ground: U5_AT.ground, openAlso: [...OPEN], uniques: true };
  let whatIf = 0;
  for (const way of U5_AT.ways) {
    const graded = gear.kitOf(way, U5_AT.level, { ...o5, ...(plant === 'chestIn' ? { chest: true } : {}) });
    for (const [slot, id] of Object.entries(graded)) if (gear.CHEST_IDS.has(id)) bad.push('U5 the ' + way + ' at ' + U5_AT.ground + ' ' + U5_AT.level + ' is graded in ' + id + ' (' + slot + '), a Hearth Chest piece: ground and boss drops only');
    whatIf += Object.values(gear.kitOf(way, U5_AT.level, { ...o5, chest: true })).filter((id) => gear.CHEST_IDS.has(id)).length;
  }
  if (!whatIf) bad.push('U5 no way at ' + U5_AT.ground + ' ' + U5_AT.level + ' wears a Hearth Chest piece even with `chest`: the what-if row proves nothing (re-aim the proof)');
  return bad;
}
