// tests/hunt-core/elements.mjs — ONE element vocabulary (src/data/elements.js, contract §1.5)
// and the resist it carries into the one hurt(). Run by run-all.mjs.
//
// The 2026-10-21 bug: abilities said 'fire' / 'nature' while every monster row said
// 'ember' / 'frost' / 'poison', so no spell ever met a weakness or a resistance
// (Fireball ignored the Rat King's ember resist). Every element-bearing table now
// validates against the one list; a name outside it is a red here, not a silent 1x.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCore, plant, makeReport, ROOT } from './fixtures/h1.js';
import { oneHero, rngOf, loadData, supplySession } from './fixtures/h4.js';

async function load(root) {
  const M = await loadCore(root);
  Object.assign(M, await loadData(M));
  const v = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(root, 'src/build-info.js'), 'utf8')) || [, ''])[1];
  const imp = (p) => import(pathToFileURL(join(root, p)).href + v);
  M.EL = await imp('src/data/elements.js');
  M.AD = await imp('src/data/abilities.js');
  M.MC = await imp('src/data/monster-classes.js');
  M.ST = await imp('src/data/statuses.js');
  M.VX = await imp('src/data/hunt-vfx.js');
  M.CE = await imp('src/core/elements.js');
  return M;
}

const cases = {
  /* Every element-bearing table names only elements.js ids; the list has one copy. */
  'one-vocabulary': (M) => {
    const bad = [...M.EL.validate(), ...M.AD.validate(), ...M.MC.auditRoster(M.MONSTERS), ...M.ST.validate()];
    for (const k of Object.keys(M.VX.HIT_FX.element)) if (!M.EL.isElement(k)) bad.push('hunt-vfx HIT_FX.element names ' + k);
    if (M.CE.ELEMENTS !== M.EL.ELEMENTS || M.MC.ELEMENTS !== M.EL.ELEMENTS) bad.push('a second ELEMENTS list exists');
    const spells = Object.values(M.AD.ABILITIES).filter((r) => r.element);
    if (spells.length < 4) bad.push('only ' + spells.length + ' elemental abilities');
    return bad.length ? bad.join('; ') : null;
  },
  /* A name outside the vocabulary is refused by the monster audit and the status validator. */
  'unknown-element-refused': (M) => {
    const rk = M.MONSTERS.rat_king;
    /* the whole roster (the audit also checks class coverage), the Rat King's problems only */
    const roster = (o) => M.MC.auditRoster(Object.assign({}, M.MONSTERS, { rat_king: Object.assign({}, rk, o) }))
      .filter((p) => p.startsWith('rat_king:') && p.includes('is not an element'));
    if (roster({}).length) return 'the Rat King fixture itself is refused: ' + roster({}).join('; ');
    if (!roster({ elementResist: ['fire'] }).length) return 'a monster resisting "fire" passed the audit';
    if (!roster({ elementImmune: ['nature'] }).length) return 'a monster immune to "nature" passed the audit';
    if (!roster({ elementWeak: 'fire', elementResist: [] }).length) return 'a monster weak to "fire" passed the audit';
    const bleed = M.ST.STATUSES.bleed;
    if (!M.ST.validateStatus(Object.assign({}, bleed, { damageType: 'fire' })).length) return 'a status dealing "fire" passed';
    return M.ST.validateStatus(Object.assign({}, bleed, { damageType: 'ember' })).length ? 'a status dealing ember was refused' : null;
  },
  /* THE BUG: Fireball is ember, the Rat King resists ember, so a cast lands at ELEMENT_PERMILLE.resist. */
  'fireball-resisted-by-rat-king': (M) => {
    const fb = M.AD.ABILITIES.fireball, rk = M.MONSTERS.rat_king;
    if (fb.element !== 'ember' || !rk.elementResist.includes('ember')) return 'fixture: Fireball ' + fb.element + ', Rat King resists ' + rk.elementResist;
    const pm = M.C.elementPermille(rk, fb.element);
    if (pm !== M.EL.ELEMENT_PERMILLE.resist || pm >= 1000) return 'Fireball into the Rat King pays ' + pm + ' permille';
    const red = M.C.defenceReduction(rk);
    const hits = [];
    for (let seed = 1; seed <= 12; seed++) {
      const y = oneHero(M, {}, { bar: ['fireball'], range: 7, hs: supplySession(M, { bag: { chalked_fire_rune: { loaded: 1 } } }) },
        [{ kind: 'rat_king', x: 14, y: 3, hp: 5000, maxHp: 5000 }, { kind: 'rat_king', x: 15, y: 3, hp: 5000, maxHp: 5000 }]);
      y.sc.rng = rngOf(M, seed);
      M.abilities.castAbilities(y.inst, y.sc);
      hits.push(...y.sc.events.filter((e) => e.type === 'dmg' && e.ability === 'fireball'));
    }
    if (hits.length < 12) return 'Fireball landed ' + hits.length + ' hits in 12 casts';
    if (hits.some((e) => e.element !== 'ember')) return 'a Fireball hit is not ember: ' + JSON.stringify(hits.find((e) => e.element !== 'ember'));
    const most = Math.max(1, Math.floor((fb.dmg[1] * pm) / 1000) - red), least = Math.max(1, Math.floor((fb.dmg[0] * pm) / 1000) - red);
    const out = hits.filter((e) => e.amount > most || e.amount < least);
    if (out.length) return 'Fireball hits outside the resisted ' + least + '..' + most + ': ' + out.map((e) => e.amount).join(',');
    const full = Math.max(1, fb.dmg[1] - red);
    return Math.max(...hits.map((e) => e.amount)) < full ? null : 'a Fireball hit reached the unresisted ' + full;
  },
  /* A resisted blow in the one hurt(): 100 ember into the Rat King is 75 less its defence. */
  'resist-in-hurt': (M) => {
    const rk = M.MONSTERS.rat_king, red = M.C.defenceReduction(rk);
    const x = oneHero(M, {}, {}, [{ kind: 'rat_king', x: 13, y: 3, hp: 5000, maxHp: 5000 }]);
    const t = x.w.units.find((u) => u.side === 'mon');
    const ember = M.damage.hurt(x.inst, t, 100, x.h, 'ember', null).dmg;
    const frost = M.damage.hurt(x.inst, t, 100, x.h, 'frost', null).dmg;
    const want = Math.floor((100 * M.EL.ELEMENT_PERMILLE.resist) / 1000) - red;
    if (ember !== want) return '100 ember into the Rat King dealt ' + ember + ', expected ' + want;
    /* vermin are frost-weak: the weakness still pays */
    return frost === Math.floor((100 * M.EL.ELEMENT_PERMILLE.weak) / 1000) - red ? null : '100 frost into the frost-weak Rat King dealt ' + frost;
  },
};

const mutants = [
  { name: 'Fireball named fire again (the bug)', case: 'one-vocabulary',
    edits: [['src/data/abilities.js', "target: 'area', dmg: [7, 12], element: 'ember',", "target: 'area', dmg: [7, 12], element: 'fire',"]] },
  { name: 'a cast drops its element', case: 'fireball-resisted-by-rat-king',
    edits: [['src/core/hunt/abilities.js', '  const el = row.element || null;', '  const el = null;']] },
  { name: 'the monster audit stops checking resists', case: 'unknown-element-refused',
    edits: [['src/data/monster-classes.js', "      for (const e of p[k]) if (!isElement(e)) problems.push(", "      for (const e of p[k]) if (false) problems.push("]] },
  { name: 'a status may deal any word', case: 'unknown-element-refused',
    edits: [['src/data/statuses.js', 'if (row.damageType !== PHYSICAL && !isElement(row.damageType))', 'if (typeof row.damageType !== \'string\')']] },
  { name: 'a hit effect keyed by an old name', case: 'one-vocabulary',
    edits: [['src/data/hunt-vfx.js', "element: Object.freeze({ ember: 'fx_flame_volley_puff',", "element: Object.freeze({ fire: 'fx_flame_volley_puff',"]] },
  { name: 'a second ELEMENTS list', case: 'one-vocabulary',
    edits: [['src/data/monster-classes.js', "import { ELEMENTS, isElement } from './elements.js?v=", "const ELEMENTS = Object.freeze(['ember', 'frost', 'poison']);\nimport { isElement } from './elements.js?v="]] },
  { name: 'resist pays nothing', case: 'resist-in-hurt',
    edits: [['src/core/combat.js', '  if (Array.isArray(monster.elementResist) && monster.elementResist.includes(element)) return ELEMENT_PERMILLE.resist;\n', '']] },
  { name: 'the hunt hurt() skips the element table', case: 'fireball-resisted-by-rat-king',
    edits: [['src/core/hunt/damage.js', '    ? elementWithFloor(elementOn(target, element), source.role, partySize(inst)) : elementOn(target, element);', '    ? 1000 : 1000;']] },
];

const R = makeReport('hunt-core/elements');
const M = await load(ROOT);
for (const [cn, fn] of Object.entries(cases)) {
  let why = null;
  try { why = fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
for (const mu of mutants) {
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits);
  try {
    let why = null;
    try { why = cases[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    if (process.env.H2_WHY) console.log('  mutant "' + mu.name + '" -> ' + why);
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + mutants.length + ' mutants caught');
R.finish();
