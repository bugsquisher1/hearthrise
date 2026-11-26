// tests/hunt-core/steady-cut.mjs — THE STEADY CUT: a cape's steadyPm and a steady meal, the last step of the armor chain (src/core/mitigation.js
// steadyPmOf and mitigate, its hook in the one hurt() and the snapshot). Run by run-all.mjs. The old Tempering rungs that once shared this
// hook left with lane/tp-im-steps (2026-11-26); these are the cases of tests/hunt-core/temper.mjs that held the cut, kept whole (a unique
// catch is never removed, CLAUDE.md section 2). Temper on steps is item Levels in the gear part (tests/temper-steps.mjs).
//
// mutant-anchors: src/core/mitigation.js src/core/hunt/damage.js src/core/member.js
import { suite, H, E, inst2, world, rngOf } from './fixtures/h2.js';

const D = 'src/core/hunt/damage.js';
const MI = 'src/core/mitigation.js';
const MB = 'src/core/member.js';
const fight = (M, units) => inst2(M, world(M, units, { phase: 'fight', leader: 1 }));
const IRON = Object.freeze({ weapon: 'iron_sword', helmet: 'iron_helm', body: 'iron_platebody', pants: 'iron_platelegs', boots: 'iron_boots' });
/* What `n` swings of a blow land, on the hunt's own rng, in all. */
const landed = (n, one) => { let all = 0; for (let i = 0; i < n; i++) all += one(); return all; };

const cases = {
  /* A cut of any size on a blow of any size: two whole answers at most, one draw at most, and a mean exact to the point. */
  'the-mean-is-exact': (M) => {
    const { mitigate, NO_MITIGATION } = M.mitigation;
    for (const pm of [10, 20, 30, 40, 50, 70]) {
      for (let n = 1; n <= 1500; n++) {
        const seen = [];
        const lo = mitigate(n, 1000, NO_MITIGATION, pm, { chance: (p) => { seen.push(p); return false; } });
        const hi = mitigate(n, 1000, NO_MITIGATION, pm, { chance: (p) => { seen.push(p); return true; } });
        const p = seen.length ? seen[0] : 0;
        if (seen.length > 2 || !Number.isInteger(lo) || !Number.isInteger(hi) || hi - lo > 1) return n + ' at ' + pm + ' pm: ' + lo + ' or ' + hi + ' on ' + seen.length + ' draws';
        const want = Math.max(1, (n * (1000 - pm)) / 1000), mean = lo + p * (hi - lo);
        if (want > 1 && Math.abs(mean - want) > 1e-9) return n + ' at ' + pm + ' pm averages ' + mean + ', the cut says ' + want;
      }
    }
    return null;
  },
  'no-cut-draws-nothing': (M) => {
    let drew = 0;
    const broke = { chance: () => { drew++; return false; } };
    const plate = M.mitigation.mitigationOf({ heavy: 29, medium: 0, light: 0 }, 20);
    for (const pm of [0, undefined, null]) if (M.mitigation.mitigate(100, 1000, plate, pm, broke) !== M.mitigation.mitigate(100, 1000, plate)) return 'no cut moved a blow, pm ' + pm;
    return drew ? 'no cut still drew from the rng (' + drew + ' draws)' : null;
  },
  'a-cut-lowers-what-reaches-the-hero': (M) => {
    const inst = fight(M, []);
    const mon = () => E(M, 9, 0, 13, 3, 1, { kind: 'carrion_crow' });
    for (const armour of [{ heavy: 29, medium: 0, light: 0 }, { heavy: 0, medium: 16, light: 0 }, { heavy: 0, medium: 0, light: 9 }, null]) {
      for (const swing of [30, 200]) {
        const rng = rngOf(M, 11);
        const one = (pm, r) => {
          const t = H(M, 2, 12, 3, 'tank', { hp: 1e6, maxHp: 1e6 });
          t.armour = armour;
          if (pm) t.armorPm = pm;
          return M.damage.hurt(inst, t, swing, mon(), null, null, r).dmg;
        };
        const base = one(0, null), n = 40000, got = landed(n, () => one(50, rng)) / n;
        if (Math.abs(got / (base * 0.95) - 1) > 0.004) return JSON.stringify(armour) + ': a blow of ' + swing + ' reaches the hero as ' + base + ' uncut and averages ' + got + ' at a 5% cut, want ' + base * 0.95;
      }
    }
    return null;
  },
  /* Tyler 2026-10-18, the total mitigation cap: the cut is the chain's last step, so it can't take a blow under the keep floor. */
  'a-cut-never-passes-the-cap': (M) => {
    const { mitigationOf, mitigate, NO_MITIGATION } = M.mitigation;
    const maxed = mitigationOf({ heavy: 5000, medium: 0, light: 0 }, 1);
    if (!(maxed.keepPm > 0)) return 'fixture: the plate does not reach the cap';
    const rng = rngOf(M, 3);
    for (const blow of [100, 1000, 12345]) for (let i = 0; i < 200; i++) {
      if (mitigate(blow, 1000, maxed, 335, rng) < Math.floor((blow * maxed.keepPm) / 1000)) return 'armor and a cut took a blow of ' + blow + ' past the cap';
      if (mitigate(blow, 1000, NO_MITIGATION, 900, rng) < Math.floor((blow * 400) / 1000)) return 'a cut alone took a blow of ' + blow + ' past the cap';
    }
    return null;
  },
  /* THE CAPE (2026-11-05): a cape's steadyPm is a linear cut on this hook, armored or not, and never the to-hit roll (a shield's alone). */
  'the-cape-cuts-and-never-guards': (M) => {
    const { mitigate, NO_MITIGATION } = M.mitigation;
    const snapOf = (worn) => { const { eq, setBonus, profile } = M.member.loadoutOf(worn, M.ITEMS);
      return M.member.heroSnapshot({ skills: { melee: 0, defense: 0 }, levelXp: 0 }, { eq, equipment: worn, items: M.ITEMS, bonus: () => 0, setBonus, profile }); };
    const CAPED = { ...IRON, cape: 'houndskin_cloak' };
    if (snapOf(CAPED).armorPm !== 70) return 'a Houndskin Cloak snaps to ' + snapOf(CAPED).armorPm;
    if (snapOf(CAPED).def !== snapOf(IRON).def) return 'a cape moved the to-hit roll: ' + snapOf(CAPED).def + ' against ' + snapOf(IRON).def;
    if (snapOf({ ...IRON, shield: 'ironbound_shield' }).def !== snapOf(IRON).def + M.ITEMS.ironbound_shield.defB || !(M.ITEMS.ironbound_shield.defB > 0)) return 'the Ironbound Shield no longer guards';
    if ('armorPm' in snapOf(IRON) || 'blowsPm' in snapOf(CAPED)) return 'a hero with no cape carries a cut, or a caped one a blow raise';
    const rng = rngOf(M, 5);
    const mean = landed(4000, () => mitigate(1000, 1000, NO_MITIGATION, 70, rng)) / 4000;
    if (Math.abs(mean - 930) > 1) return 'a 1000 blow through 7% lands ' + mean;
    return null;
  },
  /* A food's buff is the same cut, sized like a cape's step, and never the to-hit roll: a +4 food was -40% at the Warrens. What the row pays, the words say. */
  'a-food-cuts-and-never-guards': (M) => {
    const { eq, setBonus, profile } = M.member.loadoutOf(IRON, M.ITEMS);
    const snap = (bonus) => M.member.heroSnapshot({ skills: { melee: 0, defense: 0 }, levelXp: 0 }, { eq, equipment: IRON, items: M.ITEMS, bonus, setBonus, profile });
    const pays = M.buffs.buffBonuses([{ type: 'defense', magnitude: 5, remainingMs: 60000 }], {});
    if (pays.steady !== 0.05 || pays.defense) return 'a Defense-type food pays ' + JSON.stringify(pays);
    const fed = snap((k) => pays[k] || 0), bare = snap(() => 0);
    if (fed.armorPm !== 50) return 'a 5% food snaps to ' + fed.armorPm;
    if (fed.def !== bare.def) return 'a food moved the to-hit roll: ' + fed.def + ' against ' + bare.def;
    const rows = Object.entries(M.ITEMS).filter(([, it]) => it.buff && it.buff.type === 'defense');
    if (rows.length < 2) return 'the cut foods are gone';
    for (const [id, it] of rows) {
      if (it.buff.magnitude < 3 || it.buff.magnitude > 7) return id + ' cuts ' + it.buff.magnitude + '%, outside a cape step';
      const words = M.descriptions[id] || '';
      if (!words.includes('less damage from every hit') || /guard/i.test(words)) return id + ' says: ' + words;
    }
    return null;
  },
  'guard-is-a-shields-alone': (M) => {
    const bad = Object.keys(M.ITEMS).filter((id) => { const it = M.ITEMS[id]; if (!it.slot || it.slot === 'shield' || !(Number(it.defB) > 0)) return false;
      const v = M.mitigation.armourValues({ x: id }, M.ITEMS); return !(v.heavy || v.medium || v.light); });
    return bad.length ? 'to-hit guard outside a shield: ' + bad.join(', ') : null;
  },
  /* A cape steps as an armor piece steps (balance ruling section 9, 3-5% less actual damage): each tier's best keeps 95-97% of what the tier below lets through. */
  'a-cape-steps-like-armor': (M) => {
    const capes = Object.values(M.ITEMS).filter((it) => it.slot === 'cape');
    const none = capes.filter((it) => !(it.steadyPm > 0)).map((it) => it.n);
    if (none.length) return 'no reason to wear: ' + none.join(', ');
    const best = {};
    for (const it of capes) if (it.tier) best[it.tier] = Math.max(best[it.tier] || 0, it.steadyPm);
    const tiers = Object.keys(best).map(Number).sort((a, b) => a - b);
    if (tiers.length < 8) return 'the ladder has ' + tiers.length + ' tiers';
    for (let i = 1; i < tiers.length; i++) {
      const keeps = (1000 - best[tiers[i]]) / (1000 - best[tiers[i - 1]]);
      if (keeps < 0.95 || keeps > 0.97) return 'tier ' + tiers[i] + ' keeps ' + (keeps * 100).toFixed(1) + '% of tier ' + tiers[i - 1] + '\'s damage, outside 95-97%';
    }
    return null;
  },
};

const mutants = [
  { name: 'a draw even when the blow has no part', case: 'the-mean-is-exact', edits: [[MI, '(part > 0 && rng.chance(part / 1000) ? 1 : 0)', '(rng.chance(0.5) ? 1 : 0)']] },
  { name: 'no cut still draws', case: 'no-cut-draws-nothing', edits: [[MI, '  if (armorPm) x = cutAmount(x, armorPm, rng);\n', '  if (rng) rng.chance(0);\n  if (armorPm) x = cutAmount(x, armorPm, rng);\n']] },
  { name: 'hurt() never hands the cut to the chain', case: 'a-cut-lowers-what-reaches-the-hero', edits: [[D, 'mitigate(n, el, armourVs(inst, target, source), target.armorPm, rng)', 'mitigate(n, el, armourVs(inst, target, source))']] },
  { name: 'the cut before the chain: ward makes it worth nothing or double', case: 'a-cut-lowers-what-reaches-the-hero',
    edits: [[MI, '  if (armorPm) x = cutAmount(x, armorPm, rng);\n', ''], [MI, '  let x = raw - Math.floor((raw * (m.absorbPm || 0)) / 1000);\n', '  let x = cutAmount(raw, armorPm || 0, rng);\n  x = x - Math.floor((x * (m.absorbPm || 0)) / 1000);\n']] },
  { name: 'the cut after the cap', case: 'a-cut-never-passes-the-cap',
    edits: [[MI, '  if (armorPm) x = cutAmount(x, armorPm, rng);\n', ''], [MI, '  return Math.max(1, floor, x);\n', '  return Math.max(1, armorPm ? cutAmount(Math.max(floor, x), armorPm, rng) : Math.max(floor, x));\n']] },
  { name: 'a cut alone has no cap', case: 'a-cut-never-passes-the-cap', edits: [[MI, 'const keep = m.keepPm || (armorPm ? 1000 - ARMOUR_MITIGATION.capPm : 0);', 'const keep = m.keepPm;']] },
  { name: 'a cape reads nothing on the hook', case: 'the-cape-cuts-and-never-guards', edits: [[MB, '  const armorPm = steadyPmOf(c.eq, c.bonus);', '  const armorPm = 0;']] },
  { name: 'a food pays the to-hit roll again', case: 'a-food-cuts-and-never-guards', edits: [[MB, " + (Number(c.eq.guardB) || 0));", " + (Number(c.eq.guardB) || 0) + (Number(c.bonus('steady')) || 0) * 80);"]] },
  { name: 'a food reads nothing on the hook', case: 'a-food-cuts-and-never-guards', edits: [[MI, " + Math.round((Number(bonus && bonus('steady')) || 0) * 1000);", ";"]] },
  { name: 'the buff back on its old flat key', case: 'a-food-cuts-and-never-guards', edits: [['src/core/buffs.js', "defense: { label: 'Damage cut', bonusKey: 'steady', isPercent: true, glyph: 'uiShield' },", "defense: { label: 'Defense', bonusKey: 'defense', isPercent: false, isFlat: true, glyph: 'uiShield' },"]] },
  { name: 'a Frostfin Supper past a cape step', case: 'a-food-cuts-and-never-guards', edits: [['src/data/items.js', "buff:{type:'defense', magnitude:5,", "buff:{type:'defense', magnitude:12,"]] },
  { name: 'the words still promise guard', case: 'a-food-cuts-and-never-guards', edits: [['src/data/item-descriptions.js', "'A thick chowder of silverfin, potato and carrot. For five minutes, you take a little less damage from every hit'", "'A thick chowder of silverfin, potato and carrot, a hearty pot that stiffens your guard'"]] },
  { name: 'a cape guards again', case: 'guard-is-a-shields-alone', edits: [['src/data/slot-ladders.js', 'reqLv: 22, steadyPm: 70 }', 'reqLv: 22 }'], ['src/data/gear-stats.generated.js', '"houndskin_cloak": f({', '"houndskin_cloak": f({ defB: 4, strB: 1 }), "houndskin_cloak~shipped": f({']] },
  /* a piece's stats are the generated table's (src/data/gear-stats.generated.js, lane/gear-catalogue-steps): a planted guard edits it */
  { name: 'a stud guards again', case: 'guard-is-a-shields-alone', edits: [['src/data/gear-stats.generated.js', '"copper_studs": f({', '"copper_studs": f({ defB: 1, atkB: 1, strB: 1, rangeAtkB: 1, rangeStrB: 1, magicAtkB: 1, magicStrB: 1 }), "copper_studs~shipped": f({']] },
  { name: 'a Houndskin Cloak past the step', case: 'a-cape-steps-like-armor', edits: [['src/data/slot-ladders.js', 'reqLv: 22, steadyPm: 70 }', 'reqLv: 22, steadyPm: 120 }']] },
  { name: 'a cape with nothing on it', case: 'a-cape-steps-like-armor', edits: [['src/data/slot-ladders.js', 'reqLv: 22, steadyPm: 70 }', 'reqLv: 22 }']] },
];

await suite('hunt-core/steady-cut', cases, mutants);
