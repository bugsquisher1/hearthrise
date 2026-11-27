// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/grid-project.mjs — THE PROJECTOR (balance program 50-standards.md section 5.2, builder 2): what the game's own
// formulas do past the last staged ground (Level 185 to 400, stretch C, every number labelled PROJECTED).
//
// PLACEHOLDER GROUNDS. "A floor every 9 Levels, six to a region, monsters from STAT_FORMULA, pay from the contract." A placeholder is the
// last staged ground (TEMPLATE, the Unmarked Catacombs: its map, pockets, roster roles and drop rows) with every roster monster re-statted
// by src/data/balance-sheet.js formulaStats at the placeholder's floor (each monster keeps its Level offset from the template's floor, its
// role and its art tier; the Catacombs' own rows ARE the formula's at 165, checked by `selfCheck`), and its Dangerous and Deadly rows by
// tierRowFor at that floor. Nothing is written anywhere: the answer is a worker what-if (tools/balance-sim/worker.mjs applyWhatIf), so the
// engine plays it for one cell and the rows are restored after.
//
// THE PROJECTED GEAR. "A gear line that adds one band every 20 Levels inside E1." On 8.3 that band is a tier: every 20 item Levels is one
// tier, worn from its item Level less wearAhead, and a tier past the last named metal is the same formula at its item Level (the designer's
// 12-targets.md 8.3 a and 8.8: "a ground's gear ceiling is its base tier's formula piece"; the staged lines past Dawnsteel, Dawnsteel x
// Level / 110, retired with that ruling). So the band's weapon and armor are the top named rung of each family and slot (the Wolfram rows)
// with every stat the one gear formula's at the band's item Level (src/core/gear-stats.js statsOfRow), again as a what-if. Whether a band
// step lands inside E1 is what the grid measures, never what this file assumes. Shields, spellbooks and jewelry stay what the state wears
// at 185.
//
// PURE but for what it is handed. Staged here, never in src/ (50-standards 5.2).
// ════════════════════════════════════════════════════════════════════════

export const PROJECTED = Object.freeze({ template: 'unmarked_catacombs', from: 185, floorEvery: 9, groundsARegion: 6, bandEvery: 20, label: 'PROJECTED' });

/** The placeholder's floor a hero of Level L hunts (past PROJECTED.from): the highest floor at or under L, one every 9 Levels. */
export const projectedFloor = (L) => PROJECTED.from + PROJECTED.floorEvery * Math.floor((Math.max(L, PROJECTED.from) - PROJECTED.from) / PROJECTED.floorEvery);
/** The item Level of the tier a hero of Level L wears past 185 (one tier every `tierSteps` item Levels, worn from it less `wearAhead`:
    gear-steps.js GEAR_STEPS), `back` tiers under it (LOW wears one back). */
export const projectedTier = (L, steps, back = 0) => steps.tierSteps * (Math.floor((Math.max(L, PROJECTED.from) + steps.wearAhead) / steps.tierSteps) - back);

/**
 * The placeholder ground at floor F as a worker what-if: { monsters: { id: stat fields } } (its tier rows retired with the tiers,
 * lane/retire-tier-chain). D: { MONSTERS, GROUND_ROSTER, formulaStats, floorOf(ground), fitOf(ground) }.
 */
export function placeholderWhatIf(D, F) {
  const g = PROJECTED.template, floor0 = D.floorOf(g), fit = D.fitOf(g);
  const monsters = {};
  for (const [id, role] of Object.entries(D.GROUND_ROSTER[g] || {})) {
    const m = D.MONSTERS[id];
    if (!m || !Number.isInteger(m.level)) throw new Error('grid-project: the template roster names ' + id + ', which has no Level');
    const level = m.level - floor0 + F;
    const s = D.formulaStats({ level, role, floor: F, tier: m.tier, fit, ground: g });
    monsters[id] = { level, hp: s.hp, atk: s.atk, aim: s.aim, evasion: s.evasion, def: s.def, xp: s.xp, gp: [...s.gp] };
  }
  return { monsters };
}

/** The template's own rows against the formula at its own floor: [] when they agree (the projection starts where the staged ground ends). */
export function selfCheck(D) {
  const g = PROJECTED.template, w = placeholderWhatIf(D, D.floorOf(g)), out = [];
  for (const [id, s] of Object.entries(w.monsters)) for (const k of ['hp', 'atk', 'def', 'xp']) if (D.MONSTERS[id][k] !== s[k]) out.push(id + '.' + k + ' ' + D.MONSTERS[id][k] + ' is not the formula\'s ' + s[k]);
  return out;
}

export const ARMOR_SLOTS = Object.freeze(['helmet', 'body', 'pants', 'boots', 'gloves', 'belt']);
/**
 * The worn set of the formula piece at item Level iL for a style: { set (slot -> the top named rung of its ladder), items (that row id ->
 * every stat field the formula gives it at iL, zeroing a field it no longer carries, with its item Level and wear) }.
 * T: { ladder (GEAR_LADDERS key -> ids), ITEMS, statsAt(id, iL) (src/core/gear-stats.js statsOfRow), fields (GEAR_STAT_FIELDS), wearAhead };
 * style: tools/balance-sim/styles.mjs STYLES row.
 */
export function tierKit(T, style, iL) {
  const top = (key) => { const ids = (T.ladder[key] || []).filter((id) => id && T.ITEMS[id]); return ids[ids.length - 1] || null; };
  const at = (id) => {
    const s = T.statsAt(id, iL);
    if (!s) throw new Error('grid-project: ' + id + ' has no gear profile');
    const row = { iL, reqLv: Math.max(1, iL - T.wearAhead) };
    for (const k of T.fields) if (s[k] || T.ITEMS[id][k]) row[k] = s[k] || 0;
    return row;
  };
  const weapon = top(style.weapon);
  if (!weapon) throw new Error('grid-project: no weapon ladder for ' + style.weapon);
  const set = { weapon }, items = { [weapon]: at(weapon) };
  for (const slot of ARMOR_SLOTS) {
    const id = top(style.line + ':' + slot);
    if (!id) throw new Error('grid-project: no ' + style.line + ' ' + slot + ' ladder');
    set[slot] = id; items[id] = at(id);
  }
  return { set, items };
}
