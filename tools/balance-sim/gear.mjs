// tools/balance-sim/gear.mjs — WHAT A MEASURED HERO WEARS, read from the game's data (never a hand list).
//
// A STYLE is a way to fight (Tyler 2026-10-16/23: the worn set makes the role): its hunt role, the weapon ladder
// it climbs (src/data/gear-tiers.js GEAR_LADDERS 'weapon:<family>'), its off-hand (a shield ladder from
// src/data/shields.js, the spellbook ladder) and its armour line (plate / leather / cloth). At Level L a hero
// wears, per slot, the highest-tier piece that (a) its Level may wear (`reqLv`, LEVEL_REQ: gear is worn by Level,
// Tyler 2026-10-24) and (b) a player can actually get today (src/data/catalogue-coherence.js reachableSources:
// a drop on an open ground, a listed Shop row, a recipe, the start kit). A rung the practice kit holds (a null
// ladder id, or a ladder row nobody can obtain at tier 1) falls back to the start kit's piece of the same family.
//
// `tierOffset` (-1 = one tier behind on that slot group) and `only` (which slot group the offset moves:
// 'weapon' | 'armour' | 'body' | 'shield' | 'all') let a cell measure one upgrade step with everything else equal
// (the ruling's weapon and armour targets, §8-§9).
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

/* The styles the simulator plays. `role` is the src/data/hunt-roles.js id the party is built with. */
export const STYLES = Object.freeze({
  tank: Object.freeze({ role: 'tank', weapon: 'weapon:sword', offhand: 'shield', line: 'plate', label: 'Sword + shield (tank)' }),
  sword: Object.freeze({ role: 'melee_dps', weapon: 'weapon:sword', offhand: null, line: 'plate', label: 'Sword alone (Melee)' }),
  hammer: Object.freeze({ role: 'melee_dps', weapon: 'weapon:warhammer', offhand: null, line: 'plate', label: 'Two-hand hammer (Melee)' }),
  axes: Object.freeze({ role: 'melee_dps', weapon: 'weapon:hatchets', offhand: null, line: 'plate', label: 'Dual axes (Melee)' }),
  bow: Object.freeze({ role: 'ranger', weapon: 'weapon:bow', offhand: null, line: 'leather', label: 'Bow (Ranger)' }),
  crossbow: Object.freeze({ role: 'ranger', weapon: 'weapon:crossbow', offhand: 'shield', line: 'leather', label: 'Crossbow + shield (Ranger)' }),
  mage: Object.freeze({ role: 'mage', weapon: 'weapon:wand', offhand: 'spellbook', line: 'cloth', label: 'Wand + spellbook (Mage)' }),
  healer: Object.freeze({ role: 'healer', weapon: 'weapon:staff', offhand: null, line: 'cloth', label: 'Staff (Healer)' }),
});

const ARMOUR_SLOT_KEYS = Object.freeze(['helmet', 'body', 'pants', 'boots', 'gloves', 'belt']);

export async function loadGear(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const { BUILD } = await import(u('src/build-info.js'));
  const v = '?v=' + BUILD.version;
  /* the engine's own module instances (src/core imports src/data with ?v=): the same ITEMS the fight reads */
  const { ITEMS } = await import(u('src/data/items.js') + v);
  const GT = await import(u('src/data/gear-tiers.js') + v);
  const { SHIELD_ITEMS } = await import(u('src/data/shields.js') + v);
  const { STARTER_SETS, START_EQUIPMENT } = await import(u('src/data/start-kit.js') + v);
  const CC = await import(u('src/data/catalogue-coherence.js') + v);
  const reach = CC.reachableSources();
  const ladder = Object.fromEntries(GT.GEAR_LADDERS.map((l) => [l.key, l.ids]));
  const starters = new Set([...Object.values(STARTER_SETS).flat(), ...Object.values(START_EQUIPMENT)]);
  const tierOf = (id) => (ITEMS[id] && Number(ITEMS[id].tier)) || 1;
  const lvOf = (id) => (ITEMS[id] && Number(ITEMS[id].reqLv)) || 1;
  const can = (id, L) => !!id && !!ITEMS[id] && reach.has(id) && lvOf(id) <= L;
  /* the practice piece that plays a ladder's family at tier 1 (same weaponType and discipline, or the spellbook) */
  const practiceFor = (key) => {
    const ids = ladder[key] || [];
    const ref = ITEMS[ids.find((x) => x && ITEMS[x])];
    if (!ref) return null;
    return [...starters].find((id) => {
      const it = ITEMS[id];
      return it && it.slot === ref.slot && it.weaponType === ref.weaponType && (it.discipline || null) === (ref.discipline || null)
        && (it.offhand || null) === (ref.offhand || null) && !!it.twoHanded === !!ref.twoHanded;
    }) || null;
  };
  /* the best piece of a ladder at Level L, `off` tiers behind the best (never below tier 1) */
  const pick = (ids, L, off, fallback) => {
    const ok = ids.filter((id) => can(id, L)).sort((a, b) => tierOf(a) - tierOf(b));
    if (fallback && can(fallback, L) && !ok.some((id) => tierOf(id) === tierOf(fallback))) ok.unshift(fallback);
    if (!ok.length) return null;
    return ok[Math.max(0, ok.length - 1 + (off || 0))];
  };
  /* THE SHIELD LADDER: the light shields (no attack penalty) by default; `heavy` the guards with one */
  const shieldIds = (heavy) => Object.keys(SHIELD_ITEMS).filter((id) => ITEMS[id] && !!heavy === Object.keys(ITEMS[id]).some((k) => /AtkB$/.test(k) && ITEMS[id][k] < 0));
  const armourLadder = (line, slot) => ladder[line + ':' + slot] || [];

  /**
   * The worn set of `style` at Level `L`. opts: { tierOffset, only, heavyShield, line (another armour line),
   * armourSlots (default all six; the reachable ones are filled), noArmour, ammo (an item for the ammo slot) }.
   */
  function kitOf(style, L, opts = {}) {
    const S = STYLES[style];
    if (!S) throw new Error('balance-sim: unknown style ' + style);
    const off = (group) => (opts.only === group || opts.only === 'all' ? (opts.tierOffset || 0) : 0);
    const set = {};
    set.weapon = pick(ladder[S.weapon] || [], L, off('weapon'), practiceFor(S.weapon));
    if (S.offhand === 'shield') {
      const ids = shieldIds(opts.heavyShield === true);
      set.shield = pick(ids, L, off('shield'), ITEMS.practice_shield ? 'practice_shield' : null);
    } else if (S.offhand === 'spellbook') {
      set.shield = pick(ladder.spellbook || [], L, off('weapon'), practiceFor('spellbook'));
    }
    if (opts.noArmour !== true) {
      const line = opts.line || S.line;
      for (const slot of opts.armourSlots || ARMOUR_SLOT_KEYS) {
        const o = slot === 'body' ? off('body') || off('armour') : off('armour');
        const id = pick(armourLadder(line, slot), L, o, null);
        if (id) set[slot] = id;
      }
    }
    if (S.role === 'ranger') set.ammo = opts.ammo || 'bronze_arrows';
    else if (opts.ammo) set.ammo = opts.ammo;
    for (const k of Object.keys(set)) if (!set[k]) delete set[k];
    return set;
  }

  /** Every gear row and why a player can or cannot wear it at its Level (the audit's dead-gear list). */
  function gearCensus() {
    const rows = [];
    for (const [id, it] of Object.entries(ITEMS)) {
      if (!it || !it.slot || it.slot === 'ammo' || !(it.type === 'armor' || it.type === 'weapon' || it.slot === 'shield')) continue;
      rows.push({ id, slot: it.slot, tier: it.tier || null, reqLv: it.reqLv || null, reqSkill: it.reqSkill || null,
        weaponType: it.weaponType || null, armourClass: it.armourClass || null, twoHanded: !!it.twoHanded, source: reach.get(id) || null });
    }
    return rows;
  }
  return { kitOf, gearCensus, ITEMS, reach, ladder };
}
