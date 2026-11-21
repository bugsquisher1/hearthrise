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
// THE PROJECTED GEAR LINE. "A gear line that adds one band every 20 Levels inside E1." The band's weapon and armor are the staged lines'
// own formula (tools/balance-sim/staged/weapon-line.js lineWeapon, armor-line.js lineArmor: the Dawnsteel row x reqLv / 110), worn as the
// Dawnsteel row with its numbers moved to the line at the band's Level, again as a what-if. Whether a band step lands inside E1 is what
// the grid measures, never what this file assumes. Shields, spellbooks and jewelry stay what the state wears at 185.
//
// PURE but for what it is handed. Staged here, never in src/ (50-standards 5.2).
// ════════════════════════════════════════════════════════════════════════

export const PROJECTED = Object.freeze({ template: 'unmarked_catacombs', from: 185, floorEvery: 9, groundsARegion: 6, bandEvery: 20, label: 'PROJECTED' });

/** The placeholder's floor a hero of Level L hunts (past PROJECTED.from): the highest floor at or under L, one every 9 Levels. */
export const projectedFloor = (L) => PROJECTED.from + PROJECTED.floorEvery * Math.floor((Math.max(L, PROJECTED.from) - PROJECTED.from) / PROJECTED.floorEvery);
/** The projected gear band a hero of Level L wears (one every 20 Levels from 185); `back` bands under it (LOW wears one back). */
export const projectedBand = (L, back = 0) => PROJECTED.from + PROJECTED.bandEvery * (Math.floor((Math.max(L, PROJECTED.from) - PROJECTED.from) / PROJECTED.bandEvery) - back);

/**
 * The placeholder ground at floor F as a worker what-if: { monsters: { id: stat fields }, tiers: { template: { tier id: row } } }.
 * D: { MONSTERS, GROUND_ROSTER, formulaStats, tierRowFor, tiersOf, floorOf(ground), fitOf(ground) }.
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
  const tiers = {};
  for (const t of D.tiersOf(g).filter((x) => x !== 'normal')) {
    const r = D.tierRowFor(F, t, { ground: g, fit });
    tiers[t] = { id: t, pull: [...r.pull], dmgPm: r.dmgPm, hpPm: r.hpPm, xpPm: r.xpPm };
  }
  return { monsters, tiers: { [g]: tiers } };
}

/** The template's own rows against the formula at its own floor: [] when they agree (the projection starts where the staged ground ends). */
export function selfCheck(D) {
  const g = PROJECTED.template, w = placeholderWhatIf(D, D.floorOf(g)), out = [];
  for (const [id, s] of Object.entries(w.monsters)) for (const k of ['hp', 'atk', 'def', 'xp']) if (D.MONSTERS[id][k] !== s[k]) out.push(id + '.' + k + ' ' + D.MONSTERS[id][k] + ' is not the formula\'s ' + s[k]);
  return out;
}

/**
 * The projected band's worn set for a style: { kit overrides (slot -> Dawnsteel row id), items what-if (row id -> the line's numbers at R) }.
 * L: { WEAPON_LINE_BASE, lineWeapon, LINE_BASE, lineArmor }; style: tools/balance-sim/styles.mjs STYLES row.
 */
export function lineKit(Ln, style, R) {
  const family = String(style.weapon).replace(/^weapon:/, '');
  const wb = Ln.WEAPON_LINE_BASE[family];
  if (!wb) throw new Error('grid-project: no weapon line for ' + style.weapon);
  const set = { weapon: wb.id }, items = { [wb.id]: { ...Ln.lineWeapon(family, R), reqLv: R } };
  const ab = Ln.LINE_BASE[style.line];
  if (!ab) throw new Error('grid-project: no armor line for ' + style.line);
  for (const [slot, id] of Object.entries(ab.ids)) { set[slot] = id; items[id] = { defB: Ln.lineArmor(slot, style.line, R), reqLv: R }; }
  return { set, items };
}
