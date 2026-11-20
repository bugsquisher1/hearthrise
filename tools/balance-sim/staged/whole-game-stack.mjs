#!/usr/bin/env node
// tools/balance-sim/staged/whole-game-stack.mjs — THE WHOLE-GAME AUDIT'S NUMBERS (designer, lane/d-whole-game-audit, 2026-11-20).
// A measuring tool: it grades nothing and writes nothing under src/. Report: docs/design/whole-game-audit-2026-11-20.md.
//
//   node tools/balance-sim/staged/whole-game-stack.mjs curves
//        NO PLAY. The game's own formulas read at Levels 10..400 (balance-sheet.js formulaStats, combat.js playerCombatRolls and
//        monsterAccuracy, xp.js): a same-Level regular on a full ground against a lone hammer in the best kit its Level can get,
//        with its skills three ways: at the Level (the formula's reference hero), on the measured career line
//        (skill-lines.json, to its top) and, past the line's top, PROJECTED from the skill curve's own cost.
//        Prints where each clamp is reached (the monster's 85% to-hit, the hero's 95%), blows to kill, and the share of a hero's
//        HP a blow takes.
//   node tools/balance-sim/staged/whole-game-stack.mjs stack [--hours 1] [--seeds 2] [--at thicket,glade,slake,hold,rest]
//        PLAY, on the real settle (cell.mjs), paired dice. At each place a lone hammer and a lone mage on Normal: the plain kit,
//        then each power source alone, then all of them worn together; the product of the single steps against the measured
//        whole says whether the stack adds or multiplies. Then a played four on Deadly, a head.
//   node tools/balance-sim/staged/whole-game-stack.mjs fits
//        NO PLAY. Counts the hand dials a ground carries today (balance-sheet.js GROUND_XP_FIT, GROUND_GP_FIT, TIER_PULL_OVERRIDES,
//        FORMULA_EXCEPTIONS, each pack's xpFit / gpFit / tierOverride): the re-balancing a new ground costs.
//
// Exit 0 when it ran, 2 on a bad argument.
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadCellRunner } from '../cell.mjs';
import { loadGear } from '../gear.mjs';
import { loadLines, skillsAt } from '../skill-lines.mjs';
import { sourceQuery } from '../../lib/version-stamp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const mode = process.argv[2];
const pct = (a, b) => (b ? ((a / b - 1) * 100).toFixed(1) + '%' : 'n/a');
const LEVELS = [10, 30, 60, 110, 165, 240, 400];
/* the art tier a monster of that Level carries (the damage scale combat.js reads): the tier a hero of its Level wears */
const tierAt = (L) => (L < 15 ? 1 : L < 30 ? 2 : L < 45 ? 3 : L < 60 ? 4 : L < 75 ? 5 : 6);

async function curves() {
  const v = sourceQuery(ROOT);
  const BS = await import(u('src/data/balance-sheet.js') + v);
  const C = await import(u('src/core/combat.js') + v);
  const XP = await import(u('src/core/xp.js') + v);
  const { ITEMS } = await import(u('src/data/items.js') + v).catch(() => ({ ITEMS: null }));
  const gear = await loadGear(ROOT);
  const items = gear.ITEMS || ITEMS;
  const lines = loadLines();
  const top = lines.top;
  /* PROJECTED skill past the line's top: the hero keeps earning main-skill XP at the rate its last ten measured Levels cost it, an hour, for the
     hours the pace table gives (LEVEL_PACE.targets, straight lines), on the skill curve's own cost (xp.js skillXpForLevel). */
  const { LEVEL_PACE } = await import(u('src/data/core-model.js') + v);
  const hoursAt = (L) => { const t = LEVEL_PACE.targets; for (let i = 1; i < t.length; i++) if (L <= t[i][0]) return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * (L - t[i - 1][0]) / (t[i][0] - t[i - 1][0]); return t[t.length - 1][1]; };
  const lineAt = (k, L) => skillsAt(lines, 'alone', 'hammer', Math.min(L, top))[k];
  const project = (k, L) => {
    if (L <= top) return lineAt(k, L);
    const s1 = lineAt(k, top), s0 = lineAt(k, top - 10);
    const rate = (XP.skillXpForLevel(k, s1) - XP.skillXpForLevel(k, s0)) / (hoursAt(top) - hoursAt(top - 10));
    /* a hero's damage (so its skill XP an hour) is taken to grow with its Level's kill XP share: x (L / top)^0.5, a generous guess, labelled */
    const xp = XP.skillXpForLevel(k, s1) + rate * (hoursAt(L) - hoursAt(top)) * Math.sqrt(L / top);
    return XP.skillLevelFromXp(k, xp);
  };
  console.log('CURVES: a same-Level regular on a full ground (formulaStats) against a lone hammer in the best kit its Level can get (gear.mjs kitOf, uniques on).');
  console.log('Level | hero HP | monster HP | atk | def | blow max | blow % of hero HP | XP a kill | XP for the Level | kills a Level | skill: at Level / career line / projected (melee, defense) | hero to-hit: at Level / line-or-projected | hero max hit: at Level / line-or-projected | blows to kill: at Level / line-or-projected | monster to-hit: Defense at Level / line-or-projected');
  for (const L of LEVELS) {
    const tier = tierAt(L);
    const f = BS.formulaStats({ level: L, role: 'regular', tier, floor: Math.max(16, L - 8), fit: 'both' });
    const mon = { atk: f.atk, def: f.def, hp: f.hp, baseAcc: f.baseAcc, tier, level: L };
    let kit;
    try { kit = gear.kitOf('hammer', L, { uniques: true }); } catch { kit = gear.kitOf('hammer', L, {}); }
    const eq = C.equipmentStats(kit, items);
    const sk = (m, d) => ({ melee: XP.skillXpForLevel('melee', m), defense: XP.skillXpForLevel('defense', d) });
    const mLine = project('melee', L), dLine = project('defense', L);
    const rollsAt = C.playerCombatRolls(mon, { equipment: kit, items, eq, skills: sk(L, L) });
    const rollsLn = C.playerCombatRolls(mon, { equipment: kit, items, eq, skills: sk(mLine, dLine) });
    const blows = (r) => (f.hp / Math.max(0.01, r.accuracy * (r.maxHit + 1) / 2)).toFixed(1);
    const guard = (eq.guardB || 0) + (C.skillPlusOf ? C.skillPlusOf(eq, 'defense') : 0);
    const hitAt = C.monsterAccuracy(mon, L + guard), hitLn = C.monsterAccuracy(mon, dLine + guard);
    const hp = BS.STAT_FORMULA.refHp(L), blow = C.monsterMaxHit(mon);
    const need = XP.charXpForLevel(L + 1) - XP.charXpForLevel(L);
    console.log([L, hp, f.hp, f.atk, f.def, blow, (100 * blow / hp).toFixed(1) + '%', f.xp, need, Math.round(need / f.xp),
      L + ' / ' + (L <= top ? lineAt('melee', L) + ',' + lineAt('defense', L) : 'none past ' + top) + ' / ' + mLine + ',' + dLine + (L > top ? ' PROJECTED' : ''),
      (rollsAt.accuracy * 100).toFixed(0) + '% / ' + (rollsLn.accuracy * 100).toFixed(0) + '%', rollsAt.maxHit + ' / ' + rollsLn.maxHit,
      blows(rollsAt) + ' / ' + blows(rollsLn), (hitAt * 100).toFixed(0) + '% / ' + (hitLn * 100).toFixed(0) + '%'].join(' | '));
  }
  console.log('\nWHAT ONE POINT IS WORTH, at each Level (the same monster): +10 of the main skill on max hit, +10 Defense on the monster\'s to-hit (points of chance; 0 = clamped).');
  for (const L of LEVELS) {
    const tier = tierAt(L);
    const f = BS.formulaStats({ level: L, role: 'regular', tier, floor: Math.max(16, L - 8), fit: 'both' });
    const mon = { atk: f.atk, def: f.def, hp: f.hp, baseAcc: f.baseAcc, tier, level: L };
    let kit; try { kit = gear.kitOf('hammer', L, { uniques: true }); } catch { kit = gear.kitOf('hammer', L, {}); }
    const eq = C.equipmentStats(kit, items);
    const m = project('melee', L), d = project('defense', L);
    const sk = (a, b) => ({ melee: XP.skillXpForLevel('melee', a), defense: XP.skillXpForLevel('defense', b) });
    const r0 = C.playerCombatRolls(mon, { equipment: kit, items, eq, skills: sk(m, d) }), r1 = C.playerCombatRolls(mon, { equipment: kit, items, eq, skills: sk(m + 10, d) });
    const h0 = C.monsterAccuracy(mon, d + (eq.guardB || 0)), h1 = C.monsterAccuracy(mon, d + 10 + (eq.guardB || 0));
    const dps = (r) => r.accuracy * (r.maxHit + 1) / 2;
    console.log([L, 'melee ' + m + ' -> ' + (m + 10) + ': basic damage ' + pct(dps(r1), dps(r0)), 'Defense ' + d + ' -> ' + (d + 10) + ': monster to-hit ' + (h0 * 100).toFixed(0) + '% -> ' + (h1 * 100).toFixed(0) + '% (damage taken ' + pct(h1, h0) + ')',
      'skill XP for those 10 levels: ' + (XP.skillXpForLevel('melee', m + 10) - XP.skillXpForLevel('melee', m)).toLocaleString('en-US')].join(' | '));
  }
}

const PLACES = {
  thicket: { ground: 'meadowbrook_thicket', level: 10, tier: 1, tower: {} },
  glade: { ground: 'mosslight_glade', level: 30, tier: 3, tower: {} },
  /* a Tower weapon is measured where it is worn from, against the tier it is the chest's answer to: Silver at 45-59 (tier 4), Gold at 75-87 (tier 6) */
  ford: { ground: 'hasks_ford', level: 50, tier: 4, tower: { hammer: 'quarry_maul', mage: 'chandlers_wand' } },
  slake: { ground: 'the_slake', level: 60, tier: 5, tower: {} },
  pyre: { ground: 'pyre_field', level: 80, tier: 6, tower: { hammer: 'passing_bell_hammer', mage: 'sextons_wand' } },
  hold: { ground: 'krells_hold', level: 105, tier: 7, tower: {} },
  rest: { ground: 'carters_rest', level: 118, tier: 7, tower: {} },
};
const MAIN = { hammer: 'melee', mage: 'magic' };

async function stack() {
  const R = await loadCellRunner(ROOT);
  const hours = Number(arg('hours', 1)), seeds = Number(arg('seeds', 2));
  const wanted = String(arg('at', Object.keys(PLACES).join(','))).split(',');
  console.log('STACK: lone, Normal, store supplies, ' + seeds + ' seeds x ' + hours + ' h a cell, paired dice. "plain" = the Level\'s ladder kit, no accessories, skills on the career line.');
  console.log('place | way | what is worn | Level XP/h | vs plain | damage taken/h | vs plain | store g/h | net g/h | deaths | low HP p10 %');
  for (const key of wanted) {
    const a = PLACES[key];
    if (!a) { console.log('no such place ' + key); continue; }
    for (const s of ['hammer', 'mage']) {
      const L = a.level, main = MAIN[s];
      const base = { ground: a.ground, party: [s], level: L, hours, seeds, skillLine: 'alone', profile: 'played', gear: { accessories: false }, ...(a.ground === 'carters_rest' ? { gear: { accessories: false, openAlso: ['carters_rest'] } } : {}) };
      const g = (x) => ({ gear: { ...base.gear, ...x } });
      const temper = { ['temper:blows:' + a.tier]: 5, ['temper:armor:' + a.tier]: 5 };
      const line = R.skillsOf ? null : null;
      const rows = [
        ['plain', {}],
        ['+ accessories as players wear them (played kit)', g({ accessories: true })],
        ['+ Tempering, both tracks 5 of 5', { temper }],
        ['+ every skill 10 over the career line (yard, training items)', { skillBump: 10 }],
        ...(a.tower[s] ? [['+ the Tower weapon of the tier', g({ also: { weapon: a.tower[s] } })]] : []),
        ['ALL of the above together', { ...g({ accessories: true, ...(a.tower[s] ? { also: { weapon: a.tower[s] } } : {}) }), temper, skillBump: 10 }],
        ['weapon and armor one tier behind (the hero who skipped a tier)', g({ tierOffset: -1, only: 'all' })],
      ];
      let plain = null; const singles = [];
      for (const [label, patch0] of rows) {
        const patch = { ...patch0 };
        if (patch.skillBump) {
          const lv = skillsAt(loadLines(), 'alone', s, L);
          patch.skillsBySeat = [Object.fromEntries(['melee', 'ranged', 'magic', 'defense'].map((k) => [k, k === main || k === 'defense' ? lv[k] + patch.skillBump : lv[k]]))];
          delete patch.skillBump;
        }
        let m;
        try { m = R.runCell({ id: ['WG', key, s, label].join(':'), ...base, ...patch }); } catch (e) { console.log([key + ' L' + L, s, label, 'ERROR ' + e.message].join(' | ')); continue; }
        const h = m.heroes[0];
        if (!plain) plain = h;
        else if (label.startsWith('+')) singles.push([h.levelXpPerH / plain.levelXpPerH, h.takenPerH / plain.takenPerH]);
        console.log([key + ' L' + L, s, label, h.levelXpPerH, pct(h.levelXpPerH, plain.levelXpPerH), h.takenPerH, pct(h.takenPerH, plain.takenPerH), h.storePerH, h.profitPerH, h.deaths, h.encMinHpPct.p10].join(' | '));
        if (label.startsWith('ALL')) {
          const px = singles.reduce((p, x) => p * x[0], 1), pt = singles.reduce((p, x) => p * x[1], 1), sx = singles.reduce((p, x) => p + x[0] - 1, 1), st = singles.reduce((p, x) => p + x[1] - 1, 1);
          console.log([key + ' L' + L, s, '  the single steps multiplied / added', 'XP x' + px.toFixed(3) + ' / x' + sx.toFixed(3) + ', measured x' + (h.levelXpPerH / plain.levelXpPerH).toFixed(3), '', 'taken x' + pt.toFixed(3) + ' / x' + st.toFixed(3) + ', measured x' + (h.takenPerH / plain.takenPerH).toFixed(3)].join(' | '));
        }
      }
    }
    /* the party: a played four on each tier, a head */
    for (const tier of ['normal', 'deadly']) {
      try {
        if (tier !== 'normal' && !R.tiers.tiersOf(a.ground).includes(tier)) continue;
        const pull = tier === 'normal' ? null : R.tiers.pullOfTier(R.tiers.tierRowOf(a.ground, tier), 4);
        const m = R.runCell({ id: ['WG', key, 'four', tier].join(':'), ground: a.ground, party: ['tank', 'healer', 'bow', 'mage'], level: a.level, hours, seeds, profile: 'played', ...(tier === 'normal' ? {} : { options: { tier } }), ...(pull ? { density: pull } : {}), ...(a.ground === 'carters_rest' ? { gear: { openAlso: ['carters_rest'] } } : {}) });
        const xs = m.heroes.map((h) => h.levelXpPerH), d = m.heroes.reduce((n, h) => n + h.deaths, 0);
        console.log([key + ' L' + a.level, 'four (tank, healer, bow, mage), played', tier, Math.round(xs.reduce((p, x) => p + x, 0) / xs.length) + ' a head', '', '', '', Math.round(m.heroes.reduce((n, h) => n + h.storePerH, 0)) + ' store, the party', Math.round(m.heroes.reduce((n, h) => n + h.profitPerH, 0)) + ' net, the party', d, ''].join(' | '));
      } catch (e) { console.log([key, 'four', tier, 'ERROR ' + e.message].join(' | ')); }
    }
  }
}

/* DEEP: what the built engine does past today's content, with the gear and the skill line the harness can give a hero there (the best
   piece gettable, staged uniques on; skills on the career line carried on at its last slope, skill-lines.mjs). Two readings:
     a staged ground at its band's middle, a lone hammer, a lone mage and a played four on Normal (monsters' landed %, the hero's XP against the contract);
     the Tower's floor F for a Level-F four (floor F is the stat formula at Level F with nothing hand-fitted): floors cleared in 20 minutes. */
async function deep() {
  const R = await loadCellRunner(ROOT);
  const v = sourceQuery(ROOT);
  const BS = await import(u('src/data/balance-sheet.js') + v);
  const { TOWER_RULES } = await import(u('src/data/tower.js') + v);
  const hours = Number(arg('hours', 1)), seeds = Number(arg('seeds', 2));
  console.log('DEEP, staged grounds: ground L | who | Level XP/h a head | x the pace contract | monsters\' blows landed % | damage taken/h | store g/h | net g/h | deaths | low HP p10 %');
  for (const [ground, L] of [['krells_hold', 97], ['carters_rest', 118], ['wyvern_roost', 133], ['unmarked_catacombs', 175]]) {
    for (const party of [['hammer'], ['mage'], ['tank', 'healer', 'bow', 'mage']]) {
      try {
        const m = R.runCell({ id: ['WG-deep', ground, party.join('+')].join(':'), ground, party, level: L, hours, seeds, profile: 'played', gear: { uniques: true, openAlso: [ground] } });
        const x = m.heroes.reduce((n, h) => n + h.levelXpPerH, 0) / m.heroes.length, h0 = m.heroes[0];
        console.log([ground + ' L' + L, party.join('+'), Math.round(x), (x / BS.contractXpPerH(L)).toFixed(2), h0.landedPct, h0.takenPerH, Math.round(m.heroes.reduce((n, h) => n + h.storePerH, 0)), Math.round(m.heroes.reduce((n, h) => n + h.profitPerH, 0)), m.heroes.reduce((n, h) => n + h.deaths, 0), h0.encMinHpPct.p10].join(' | '));
      } catch (e) { console.log([ground, party.join('+'), 'ERROR ' + e.message].join(' | ')); }
    }
  }
  console.log('\nDEEP, the Tower at floor = Level (a played four, own stock, 20 minutes from that floor, 2 climbs): Level | top floor reached | floors cleared | ended | tank landed % (monsters on it) | XP/h a head | x contract');
  for (const L of [60, 110, 165, 240, 400]) {
    for (let s = 0; s < 2; s++) {
      try {
        const m = R.runCell({ id: 'WG-tower:' + L + ':' + s, ground: TOWER_RULES.hunt, tower: { floor: L }, hours: 20 / 60, seeds: 1, seedBase: s, windowMs: 30000, party: ['tank', 'healer', 'bow', 'mage'], level: L, profile: 'played', supply: 'own', gear: { uniques: true } });
        const t = m.party.tower || {}, x = m.heroes.reduce((n, h) => n + h.levelXpPerH, 0) / m.heroes.length;
        console.log([L, t.top, (t.cleared || []).length, JSON.stringify(m.heroes[0].ended), m.heroes[0].landedPct, Math.round(x), (x / BS.contractXpPerH(L)).toFixed(2)].join(' | '));
      } catch (e) { console.log([L, 'ERROR ' + e.message].join(' | ')); }
    }
  }
}

async function fits() {
  const v = sourceQuery(ROOT);
  const BS = await import(u('src/data/balance-sheet.js') + v);
  const { GROUND_PACKS } = await import(u('src/data/grounds/index.js') + v);
  const grounds = new Set([...Object.keys(BS.GROUND_ROSTER)]);
  console.log('ground | xp fit | gp fit | own tier rule | named exceptions on its monsters');
  let n = 0;
  for (const g of grounds) {
    const ex = Object.keys(BS.FORMULA_EXCEPTIONS).filter((m) => (BS.GROUND_ROSTER[g] || {})[m]);
    const o = BS.TIER_PULL_OVERRIDES[g];
    const dials = (BS.GROUND_XP_FIT[g] ? 1 : 0) + (BS.GROUND_GP_FIT[g] ? 1 : 0) + (o ? Object.keys(o).filter((k) => k !== 'why').length + Object.keys(o.dials || {}).length - (o.dials ? 1 : 0) : 0) + ex.length;
    n += dials;
    console.log([g, BS.GROUND_XP_FIT[g] || '-', BS.GROUND_GP_FIT[g] || '-', o ? JSON.stringify({ ...o, why: undefined }) : '-', ex.join(',') || '-', dials + ' hand dials'].join(' | '));
  }
  console.log('grounds ' + grounds.size + ', packs ' + (GROUND_PACKS || []).length + ', hand dials in all ' + n + ' (' + (n / grounds.size).toFixed(1) + ' a ground)');
}

const run = { curves, stack, fits, deep }[mode];
if (!run) { console.error('usage: whole-game-stack.mjs curves | stack | fits'); process.exit(2); }
run().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
