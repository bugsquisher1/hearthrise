// tests/hunt-core/elements.mjs — ONE element vocabulary (src/data/elements.js, contract §1.5)
// and the percentage it carries into the one hurt(). Run by run-all.mjs.
//
// NO IMMUNITIES (Tyler 2026-11-06, after Andy: "slimes in the sewers are still immune to fire ... all of my aoe is
// fire on ranger and mage"): every element modifier is a percentage of damage taken (a monster's `elements`), bounded
// by ELEMENT_PCT, and a Fireball into the Sump Slime lands, at half what a monster with no modifier takes.
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
    if (!roster({ elements: { fire: 25 } }).length) return 'a monster resisting "fire" passed the audit';
    if (!roster({ elements: { nature: -15 } }).length) return 'a monster weak to "nature" passed the audit';
    const bleed = M.ST.STATUSES.bleed;
    if (!M.ST.validateStatus(Object.assign({}, bleed, { damageType: 'fire' })).length) return 'a status dealing "fire" passed';
    return M.ST.validateStatus(Object.assign({}, bleed, { damageType: 'ember' })).length ? 'a status dealing ember was refused' : null;
  },
  /* NO IMMUNITY IN DATA: an element is a percentage inside ELEMENT_PCT, never 100; the retired list fields are refused. */
  'no-immunity-in-data': (M) => {
    const rk = M.MONSTERS.rat_king;
    const roster = (o) => M.MC.auditRoster(Object.assign({}, M.MONSTERS, { rat_king: Object.assign({}, rk, o) }))
      .filter((p) => p.startsWith('rat_king:'));
    if (roster({}).length) return 'the Rat King fixture itself is refused: ' + roster({}).join('; ');
    if (M.EL.ELEMENT_PCT.max >= 100) return 'ELEMENT_PCT lets a monster shrug off a whole element (max ' + M.EL.ELEMENT_PCT.max + ')';
    if (!roster({ elements: { ember: 100 } }).length) return 'a monster immune to ember passed the audit';
    if (!roster({ elements: { ember: M.EL.ELEMENT_PCT.max + 1 } }).length) return 'a value over ELEMENT_PCT.max passed the audit';
    if (!roster({ elements: { frost: M.EL.ELEMENT_PCT.min - 1 } }).length) return 'a value under ELEMENT_PCT.min passed the audit';
    if (!roster({ elements: { ember: 12.5 } }).length) return 'a fractional percentage passed the audit';
    for (const k of ['elementImmune', 'elementResist', 'elementWeak']) {
      if (!roster({ [k]: k === 'elementWeak' ? 'ember' : ['ember'] }).length) return 'a row with the retired ' + k + ' passed the audit';
    }
    const big = Object.values(M.MONSTERS).flatMap((m) => Object.values(m.elements || {})).concat(
      Object.values(M.MC.MONSTER_CLASSES).flatMap((c) => Object.values(c.elements || {})));
    if (big.some((p) => p >= 100)) return 'a shipped profile is an immunity';
    if (M.EL.validate().length) return M.EL.validate().join('; ');
    /* the engine's own clamp: a forged row still lands at least ELEMENT_PCT.max's share */
    return M.CE.elementPermille({ elements: { ember: 100 } }, 'ember') === 1000 - M.EL.ELEMENT_PCT.max * 10 ? null : 'the reader let a 100% row through';
  },
  /* THE REGRESSION (Andy 2026-11-06): a fire AoE into the Sump Slime hurts it, at half what a monster with no
     ember modifier takes. The real cast (Fireball, the Mage's fire AoE) and the one hurt(). */
  'fire-aoe-hurts-sump-slime': (M) => {
    const fb = M.AD.ABILITIES.fireball, slime = M.MONSTERS.sump_slime, rat = M.MONSTERS.drain_rat;
    if (fb.target !== 'area' || fb.element !== 'ember') return 'fixture: Fireball is ' + fb.target + ' ' + fb.element;
    if (slime.elements.ember !== 50 || 'ember' in rat.elements) return 'fixture: slime ember ' + slime.elements.ember + ', rat ' + JSON.stringify(rat.elements);
    if (M.C.defenceReduction(slime) || M.C.defenceReduction(rat)) return 'fixture: a defence would blur the halving';
    const x = oneHero(M, {}, {}, [{ kind: 'sump_slime', x: 13, y: 3, hp: 50000, maxHp: 50000 }, { kind: 'drain_rat', x: 13, y: 4, hp: 50000, maxHp: 50000 }]);
    const [s, r] = x.w.units.filter((u) => u.side === 'mon');
    const onSlime = M.damage.hurt(x.inst, s, 1000, x.h, 'ember', null).dmg, onRat = M.damage.hurt(x.inst, r, 1000, x.h, 'ember', null).dmg;
    if (!(onSlime > 0) || Math.abs(onSlime * 2 - onRat) > 1) return '1000 ember dealt ' + onSlime + ' to the Sump Slime and ' + onRat + ' to the Drain Rat (want half)';
    const hits = [];
    for (let seed = 1; seed <= 12; seed++) {
      const y = oneHero(M, {}, { bar: ['fireball'], range: 7, hs: supplySession(M, { bag: { chalked_fire_rune: { loaded: 1 } } }) },
        [{ kind: 'sump_slime', x: 14, y: 3, hp: 5000, maxHp: 5000 }, { kind: 'sump_slime', x: 15, y: 3, hp: 5000, maxHp: 5000 }]);
      y.sc.rng = rngOf(M, seed);
      M.abilities.castAbilities(y.inst, y.sc);
      if (y.sc.events.some((e) => e.type === 'immune')) return 'a cast still says immune';
      hits.push(...y.sc.events.filter((e) => e.type === 'dmg' && e.ability === 'fireball'));
    }
    if (hits.length < 12) return 'Fireball landed ' + hits.length + ' hits on Sump Slimes in 12 casts';
    const least = Math.max(1, Math.floor(fb.dmg[0] / 2)), most = Math.floor(fb.dmg[1] / 2);
    const out = hits.filter((e) => e.amount < least || e.amount > most);
    return out.length ? 'Fireball on a Sump Slime outside ' + least + '..' + most + ': ' + out.map((e) => e.amount).join(',') : null;
  },
  /* THE BUG: Fireball is ember, the Rat King resists ember, so a cast lands at his profile's share. */
  'fireball-resisted-by-rat-king': (M) => {
    const fb = M.AD.ABILITIES.fireball, rk = M.MONSTERS.rat_king;
    if (fb.element !== 'ember' || !(rk.elements.ember > 0)) return 'fixture: Fireball ' + fb.element + ', Rat King ' + JSON.stringify(rk.elements);
    const pm = M.CE.elementPermille(rk, fb.element);
    if (pm !== 1000 - rk.elements.ember * 10 || pm >= 1000) return 'Fireball into the Rat King pays ' + pm + ' permille';
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
  /* A resisted blow in the one hurt(): 100 ember into the Rat King is his share less his defence. */
  'resist-in-hurt': (M) => {
    const rk = M.MONSTERS.rat_king, red = M.C.defenceReduction(rk);
    const x = oneHero(M, {}, {}, [{ kind: 'rat_king', x: 13, y: 3, hp: 5000, maxHp: 5000 }]);
    const t = x.w.units.find((u) => u.side === 'mon');
    const ember = M.damage.hurt(x.inst, t, 100, x.h, 'ember', null).dmg;
    const frost = M.damage.hurt(x.inst, t, 100, x.h, 'frost', null).dmg;
    const want = Math.floor((100 * (1000 - rk.elements.ember * 10)) / 1000) - red;
    if (ember !== want) return '100 ember into the Rat King dealt ' + ember + ', expected ' + want;
    /* vermin are frost-weak: the weakness still pays */
    if (!(rk.elements.frost < 0)) return 'fixture: the Rat King is not frost-weak: ' + JSON.stringify(rk.elements);
    return frost === Math.floor((100 * (1000 - rk.elements.frost * 10)) / 1000) - red ? null : '100 frost into the frost-weak Rat King dealt ' + frost;
  },
};

const mutants = [
  { name: 'Fireball named fire again (the bug)', case: 'one-vocabulary',
    edits: [['src/data/abilities.js', "target: 'area', dmg: [7, 12], element: 'ember',", "target: 'area', dmg: [7, 12], element: 'fire',"]] },
  { name: 'a cast drops its element', case: 'fireball-resisted-by-rat-king',
    edits: [['src/core/hunt/abilities.js', '  const el = row.element || null;', '  const el = null;']] },
  { name: 'the monster audit stops checking profiles', case: 'unknown-element-refused',
    edits: [['src/data/monster-classes.js', "    for (const why of elementProfileProblems(p.elements)) problems.push(id + ': ' + why);", '']] },
  { name: 'a profile may name any word', case: 'unknown-element-refused',
    edits: [['src/data/elements.js', "    if (!isElement(e)) out.push('elements \"' + e + '\" is not an element');", "    if (false) out.push('');"]] },
  { name: 'an immunity is allowed again (ELEMENT_PCT max 100)', case: 'no-immunity-in-data',
    edits: [['src/data/elements.js', 'export const ELEMENT_PCT = Object.freeze({ min: -100, max: 75 });', 'export const ELEMENT_PCT = Object.freeze({ min: -100, max: 100 });']] },
  { name: 'the profile values are not bounded', case: 'no-immunity-in-data',
    edits: [['src/data/elements.js', ' || pct < ELEMENT_PCT.min || pct > ELEMENT_PCT.max) {', ') {']] },
  { name: 'a fraction passes the profile check', case: 'no-immunity-in-data',
    edits: [['src/data/elements.js', 'else if (!Number.isInteger(pct) || pct === 0', 'else if (pct === 0']] },
  { name: 'the retired list fields pass unread', case: 'no-immunity-in-data',
    edits: [['src/data/monster-classes.js', "    for (const k of RETIRED_ELEMENT_FIELDS) if (has(m, k)) problems.push(", "    for (const k of []) if (has(m, k)) problems.push("]] },
  { name: 'the reader trusts a 100% row', case: 'no-immunity-in-data',
    edits: [['src/core/elements.js', '  return 1000 - Math.min(ELEMENT_PCT.max, Math.max(ELEMENT_PCT.min, pct)) * 10;', '  return 1000 - pct * 10;']] },
  /* the class table's own check: no dragon inherits the Dragon class's profile, so only it can see these */
  { name: 'a class profile may be an immunity', case: 'one-vocabulary',
    edits: [['src/data/monster-classes.js', '    elementPerMonster: true,\n    elements: {},\n  },\n  elemental: {', '    elementPerMonster: true,\n    elements: { ember: 100 },\n  },\n  elemental: {']] },
  { name: 'a class may keep a retired list', case: 'one-vocabulary',
    edits: [['src/data/monster-classes.js', '    elementPerMonster: true,\n    elements: {},\n  },\n  elemental: {', "    elementPerMonster: true,\n    elements: {}, elementImmune: ['ember'],\n  },\n  elemental: {"]] },
  { name: 'the slime is immune to ember again (the bug)', case: 'fire-aoe-hurts-sump-slime',
    edits: [['src/core/elements.js', '  if (!monster || !isElement(element)) return 1000;', "  if (monster && monster.elements && monster.elements[element] === 50) return 0;\n  if (!monster || !isElement(element)) return 1000;"]] },
  { name: 'a former immunity reads as a plain resist', case: 'fire-aoe-hurts-sump-slime',
    edits: [['src/data/monsters.js', '    /* one override (element): the sump shrugs off half of every element. */\n    elements: { ember: 50, frost: 50, poison: 50 },', '    /* one override (element): the sump shrugs off half of every element. */\n    elements: { ember: 25, frost: 50, poison: 50 },']] },
  { name: 'a status may deal any word', case: 'unknown-element-refused',
    edits: [['src/data/statuses.js', 'if (row.damageType !== PHYSICAL && !isElement(row.damageType))', 'if (typeof row.damageType !== \'string\')']] },
  { name: 'a hit effect keyed by an old name', case: 'one-vocabulary',
    edits: [['src/data/hunt-vfx.js', "element: Object.freeze({ ember: 'fx_flame_volley_puff',", "element: Object.freeze({ fire: 'fx_flame_volley_puff',"]] },
  { name: 'a second ELEMENTS list', case: 'one-vocabulary',
    edits: [['src/data/monster-classes.js', "import { ELEMENTS, elementProfileProblems } from './elements.js?v=", "const ELEMENTS = Object.freeze(['ember', 'frost', 'poison']);\nimport { elementProfileProblems } from './elements.js?v="]] },
  { name: 'resist pays nothing', case: 'resist-in-hurt',
    edits: [['src/core/elements.js', '  return 1000 - Math.min(ELEMENT_PCT.max, Math.max(ELEMENT_PCT.min, pct)) * 10;', '  return pct < 0 ? 1000 - pct * 10 : 1000;']] },
  { name: 'the hunt hurt() skips the element table', case: 'fireball-resisted-by-rat-king',
    edits: [['src/core/hunt/damage.js', '  const el = elementOn(target, element);', '  const el = 1000;']] },
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
/* BOTH PATHS (CLAUDE.md §4): the browser CLOSED, the hunt settled the way the world tick does (accrual.js accrueHunt,
   tests/hunt-core/fixtures/play-ground.mjs). A lone Mage in the Millrace Sewer burns its Sump Slimes with Fireball, at
   about half what the same Fireball deals its Drain Rats (no ember modifier, both defence 0). The viewed half runs this
   same engine from the server's start point (tests/hunt-live.mjs LV-D). */
const { loadPlay, PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
function settledFireballOnSlimes(P) {
  const hits = { sump_slime: [], drain_rat: [] };
  P.run('millrace_sewer', 30, ['mage'], { spanMs: 1200000, onWindow: (out) => {
    /* a killing blow is cut to the HP left, so only blows that left the unit standing are compared */
    const kills = new Set((out.events || []).filter((e) => e.type === 'kill').map((e) => e.atMs + ':' + e.t));
    for (const e of out.events || []) {
      const b = out.units && out.units[e.t];
      if (e.type === 'dmg' && e.ability === 'fireball' && b && hits[b[0]] && !kills.has(e.atMs + ':' + e.t)) hits[b[0]].push(e.amount);
    }
  } });
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  if (hits.sump_slime.length < 5 || hits.drain_rat.length < 5) return 'a lone Mage in the Sewer landed ' + hits.sump_slime.length + ' Fireball hits on Sump Slimes and ' + hits.drain_rat.length + ' on Drain Rats in 20 minutes';
  const ratio = mean(hits.sump_slime) / mean(hits.drain_rat);
  return ratio > 0.35 && ratio < 0.65 ? null : 'a settled Fireball dealt a Sump Slime ' + ratio.toFixed(2) + ' of a Drain Rat\'s (want about half): ' + JSON.stringify(hits);
}
{
  let why = null;
  try { why = settledFireballOnSlimes(await loadPlay(ROOT)); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, 'settled-fireball-burns-sump-slime: ' + why);
  const p = plant([['src/core/elements.js', '  if (!monster || !isElement(element)) return 1000;',
    "  if (monster && monster.elements && monster.elements[element] === 50) return 0;\n  if (!monster || !isElement(element)) return 1000;"]], PLAY_TREES);
  try {
    let w = null;
    try { w = settledFireballOnSlimes(await loadPlay(p.root)); } catch (e) { w = 'threw ' + e.message; }
    R.ok(!!w, 'mutant "the slime is immune to ember again, settled" was NOT caught by settled-fireball-burns-sump-slime');
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + (Object.keys(cases).length + 1) + ' cases, ' + (mutants.length + 1) + ' mutants caught');
R.finish();
