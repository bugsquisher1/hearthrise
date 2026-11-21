// tests/hunt-core/spell-rule.mjs — EVERY CAST IS A SHARE OF ITS CASTER'S OWN BLOW, PLAYED (balance program plan lane L17, engine batch 2;
// Tyler 2026-11-21: 21-5 every cast a share of the caster's blow, 21-6 the bar budget, 32-2 Cleave merges into Turning Cut, 32-3 the axes
// lose Power Strike, 32-4 Mend heals 11% of max HP, 32-5 the hammer's Earth rune strike, 32-8 sized at Level 10 and Level 60). Run by
// run-all.mjs. The rule is TYPED here, never asked of the engine, so the engine can't agree with itself:
//   top = floor(maxHit x share / 1000); a hit rolls ceil(top / 2)..top, loses the monster's defence, then x step / 1000;
//   a heal or a shell is floor(top x step / 1000); Mend is floor(floor(maxHp x 110 / 1000) x 1); step = 1000 + 100 a rune tier above I.
//
//   hits-share-the-blow       every live row that lands a blow (but the bow's, which needs shots: rows-are-shares holds them to the rule's
//                             form), fired through the real castAbilities on its own graven rune from a hero of max hit 20 and 80 at a
//                             neutral, defence-0 dummy: every hit inside the typed band, and the bigger blow lands about four times the cast
//   heals-and-shells          Greater Mend, Circle of Renewal and Protective Ward from a Healer of max hit 20 and 80, and Mend from heroes of
//                             max hit 5 and 80 at 1000 max HP: each lands the typed number (Mend the same 110 at either blow)
//   bleed-shares-the-blow     Rend's bleed stack, landed by the engine at each rune tier from axes of max hit 30 and 90, ticks
//                             round(maxHit x 66 x tier / 1e6) (statuses.js bleed blowPm), never the old 1-3 a tick
//   rows-are-shares           the data: no row carries a fixed number (dmg, heal, shield, lvPm), every damage row a hitPm, the steps
//                             1000..1400, Cleave gone, Power Strike off the axes, Quarry Blow the club's Earth rune strike, Mend 110 of max HP
//   power-strike-beats-a-swing  the plan's test: on the career kit at Levels 10, 60 and 110 (tools/balance-sim gear and skill lines, the
//                             unit's own max hit and its real to-hit on a same-Level regular), Power Strike lands more than a plain swing
//   bar-budget                G23: every family's offense rows fill at most its cap (0.85, the tank 0.6, the Healer 0.3) of the 2 s lane
//   both-paths                BOTH PATHS (CLAUDE.md §4): a lone axes hero on its default bar (Turning Cut, Rend and its bleed, whose stacks
//                             ride the world between settles) for an hour of the world tick, watched (10 s settles) and with the browser
//                             closed (10 min settles): the same kills, Level XP, damage taken, deaths, Rend casts and store bill, to the unit
//
// mutant-anchors: src/core/hunt/abilities.js src/core/hunt/status.js src/data/abilities.js src/data/statuses.js src/data/runes.js src/core/hunt/world-state.js
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCore, plant, makeReport, ROOT, hero, mon, world, instOf, subStep } from './fixtures/h1.js';
import { supplySession, loadData, rngOf } from './fixtures/h4.js';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';

const { loadCellRunner } = await import(pathToFileURL(join(ROOT, 'tools/balance-sim/cell.mjs')).href);
const { PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);

/* THE RULE, typed (lane/c-spell-rule, 2026-11-21) */
const STEP = [1000, 1100, 1200, 1300, 1400];
const topOf = (maxHit, share) => Math.max(1, Math.floor((maxHit * share) / 1000));
const ROLE = { shield: 'tank', sword: 'melee_dps', dual_axe: 'melee_dps', club: 'melee_dps', destruction: 'mage', restoration: 'healer' };

/* `id` cast once a sub-step for 40 sub-steps (its cooldown and lane allowing) by a hero of max hit `maxHit` holding 50 of its family's
   tier-5 rune and level 60 in the row's skill, beside a neutral defence-0 dummy (and a second one for a shape). Answers the cast events and
   the amounts each landed (dmg / heal / shield), and the version the engine cast. */
function play(M, id, maxHit, o) {
  const row = M.AD.ABILITIES[id], x = o || {};
  const skill = M.AD.abilitySkill(row);
  const fam = row.rune ? row.rune.replace(/^chalked_|_rune$/g, '') : null;
  const rune = fam ? M.runes.runeId(fam, x.tier || 5) : null;
  const hs = supplySession(M, { bag: rune ? { [rune]: { loaded: 50 } } : {}, purse: 100000 });
  const h = hero(M, 1, 12, 3, { hp: x.hp ?? 50, maxHp: x.maxHp ?? 1000, mana: 5000, maxMana: 5000, maxHit, role: ROLE[row.disciplines[0]] || 'melee_dps' });
  const units = [h, mon(M, 10, 0, 13, 3, { kind: 'yard_dummy', hp: 100000, maxHp: 100000, target: 1 }), mon(M, 11, 0, 13, 4, { kind: 'yard_dummy', hp: 100000, maxHp: 100000, target: 1 })];
  if (x.ally) units.push(hero(M, 2, 11, 3, { hp: 50, maxHp: 1000, role: 'tank' }));
  const inst = instOf(M, world(M, units));
  const slot = { action: { type: 'ability', id }, conditions: [], join: 'and' };
  inst.heroes = { 1: { hs, actionSet: 'hunt', range: row.disciplines.includes('destruction') || row.disciplines.includes('restoration') ? 6 : 1,
    skills: { [skill]: M.XP.skillXpForLevel(skill, 60) }, slots: M.conditions.heroSlots([slot], null) } };
  const sc = subStep(0);
  sc.rng = rngOf(M, 17);
  for (let i = 0; i < (x.steps || 40); i++) {
    sc.atMs = i * 100;
    /* every hero stays wounded and unshelled, so each heal lands whole and each shell recasts over nothing */
    for (const u of units) if (u.side === 'hero') { u.hp = Math.min(u.hp, 50); u.shield = 0; }
    M.abilities.castAbilities(inst, sc);
    M.status.tickStatuses(inst, sc);
  }
  const casts = sc.events.filter((e) => e.type === 'cast' && e.ability === id);
  return { row, casts, dmg: sc.events.filter((e) => e.type === 'dmg' && e.ability === id).map((e) => e.amount),
    heal: sc.events.filter((e) => e.type === 'heal' && e.u === 1).map((e) => e.amount), shield: sc.events.filter((e) => e.type === 'shield' && e.u === 1).map((e) => e.amount), sc, inst };
}

const cases = {
  'hits-share-the-blow': (M) => {
    const rows = Object.values(M.AD.ABILITIES).filter((r) => M.AD.landsBlow(r) && !(r.ammo > 0) && ROLE[r.disciplines[0]]);
    if (rows.length < 8) return 'fixture: only ' + rows.length + ' damage rows to cast';
    for (const row of rows) {
      const avg = [];
      for (const maxHit of [20, 80]) {
        const got = play(M, row.id, maxHit);
        if (!got.casts.length || !got.dmg.length) return row.id + ' at max hit ' + maxHit + ': no cast landed (' + JSON.stringify(got.casts.slice(0, 1)) + ')';
        const step = row.rune ? STEP[4] : 1000;
        if (got.casts.some((c) => (row.rune ? c.version !== 5 || c.power !== step : false))) return row.id + ': cast ' + JSON.stringify(got.casts[0]) + ', want version V at ' + step;
        const top = topOf(maxHit, row.hitPm), lo = Math.floor((Math.ceil(top / 2) * step) / 1000), hi = Math.floor((top * step) / 1000);
        const out = got.dmg.filter((n) => n < Math.max(1, lo) || n > hi);
        if (out.length) return row.id + ' at max hit ' + maxHit + ': hits ' + JSON.stringify(out.slice(0, 5)) + ' outside the rule\'s ' + lo + '..' + hi;
        avg.push(got.dmg.reduce((a, n) => a + n, 0) / got.dmg.length);
      }
      const k = avg[1] / avg[0];
      if (!(k > 3.3 && k < 4.7)) return row.id + ': four times the blow landed ' + k.toFixed(2) + ' times the cast (' + avg.map((n) => n.toFixed(1)) + ')';
    }
    return null;
  },
  'heals-and-shells': (M) => {
    for (const [id, field, maxHit] of [['greater_mend', 'healPm', 20], ['greater_mend', 'healPm', 80], ['circle_of_renewal', 'healPm', 80], ['protective_ward', 'shieldPm', 20], ['protective_ward', 'shieldPm', 80], ['arcane_barrier', 'shieldPm', 80]]) {
      const got = play(M, id, maxHit, { ally: id !== 'arcane_barrier' });
      const want = Math.floor((topOf(maxHit, got.row[field]) * STEP[4]) / 1000);
      const seen = field === 'healPm' ? got.heal : got.shield;
      if (!seen.length) return id + ' at max hit ' + maxHit + ': landed nothing (' + JSON.stringify(got.casts.slice(0, 1)) + ')';
      if (seen.some((n) => n !== want && !(field === 'healPm' && n < want))) return id + ' at max hit ' + maxHit + ': landed ' + JSON.stringify(seen.slice(0, 4)) + ', the rule ' + want;
      if (field === 'healPm' && !seen.includes(want)) return id + ' at max hit ' + maxHit + ': never healed the rule\'s ' + want + ' (' + JSON.stringify(seen.slice(0, 4)) + ')';
    }
    /* MEND: 11% of the caster's own max HP, whatever its blow (Tyler 32-4) */
    for (const maxHit of [5, 80]) {
      const got = play(M, 'mend', maxHit, { maxHp: 1000, hp: 400 });
      if (!got.heal.length || got.heal.some((n) => n !== 110)) return 'Mend at max hit ' + maxHit + ' and 1000 max HP healed ' + JSON.stringify(got.heal.slice(0, 4)) + ', the rule 110';
    }
    return null;
  },
  'bleed-shares-the-blow': (M) => {
    const s = M.ST.STATUSES.bleed;
    for (const maxHit of [30, 90]) for (const tier of [1, 3, 5]) {
      const got = play(M, 'rend', maxHit, { tier, steps: 30 });
      const ticks = got.sc.events.filter((e) => e.type === 'status_tick' && e.status === 'bleed').map((e) => e.amount);
      const want = Math.max(1, Math.floor((Math.max(1000, Math.floor((maxHit * 66 * STEP[tier - 1]) / 1000)) + 500) / 1000));
      if (s.blowPm !== 66) return 'the bleed\'s blowPm is ' + s.blowPm + ', the rule 66';
      if (!ticks.length || ticks.some((n) => n !== want)) return 'a tier-' + tier + ' bleed from max hit ' + maxHit + ' ticked ' + JSON.stringify(ticks.slice(0, 6)) + ', the rule ' + want;
    }
    return null;
  },
  'rows-are-shares': (M) => {
    const A = M.AD;
    if (A.validate().length) return 'validate: ' + A.validate().join('; ');
    for (const r of Object.values(A.ABILITIES)) {
      for (const k of ['dmg', 'heal', 'shield', 'lvPm']) if (r[k] !== undefined) return r.id + ' carries a fixed number (' + k + ')';
      if (['enemy', 'area', 'line', 'ring'].includes(r.target) && !A.landsBlow(r) && !r.status) return r.id + ' strikes with no share of the blow';
    }
    if (JSON.stringify(M.runes.RUNE_TIERS.map((t) => t.stepPm)) !== JSON.stringify(STEP)) return 'the version steps are ' + M.runes.RUNE_TIERS.map((t) => t.stepPm);
    if (A.ABILITIES.cleave) return 'Cleave is still a row (32-2: merged into Turning Cut)';
    if (A.ABILITIES.power_strike.disciplines.includes('dual_axe')) return 'the two axes still hold Power Strike (32-3)';
    const tc = A.suggestedTrigger(A.ABILITIES.turning_cut);
    if (JSON.stringify(tc) !== JSON.stringify([{ metric: 'enemies_in_aoe', op: 'gte', value: 2 }])) return 'a new Turning Cut slot starts ' + JSON.stringify(tc) + ', want 2 in its ring';
    const q = A.ABILITIES.quarry_blow;
    if (!q || JSON.stringify(q.disciplines) !== '["club"]' || q.rune !== 'chalked_earth_rune' || !A.landsBlow(q) || q.unlock) return 'Quarry Blow is no club-only Earth rune strike from Level 1: ' + JSON.stringify(q);
    if (A.ABILITIES.mend.healHpPm !== 110 || !A.ABILITIES.mend.universal) return 'Mend does not heal 11% of max HP: ' + JSON.stringify(A.ABILITIES.mend);
    return null;
  },
  'power-strike-beats-a-swing': async (M) => {
    /* the kit and the career skills are the tree's tools (a planted root holds src only); the share under test is M's */
    const { loadGear } = await import(pathToFileURL(join(ROOT, 'tools/balance-sim/gear.mjs')).href);
    const { loadLines, skillsAt } = await import(pathToFileURL(join(ROOT, 'tools/balance-sim/skill-lines.mjs')).href);
    const BS = await import(pathToFileURL(join(M.root, 'src/data/balance-sheet.js')).href + sourceQuery(ROOT));
    const gear = await loadGear(ROOT), lines = loadLines();
    const ps = M.AD.ABILITIES.power_strike;
    for (const way of ['tank', 'sword', 'hammer']) for (const L of [10, 60, 110]) {
      const kit = gear.kitOf(way, L, {}), eq = M.C.equipmentStats(kit.equipment || kit, gear.ITEMS);
      const sk = skillsAt(lines, 'alone', way, Math.min(L, lines.top)).melee;
      const ctx = { equipment: kit.equipment || kit, items: gear.ITEMS, eq, skills: { melee: M.XP.skillXpForLevel('melee', sk) } };
      const tier = L < 15 ? 1 : L < 30 ? 2 : L < 45 ? 3 : L < 60 ? 4 : L < 75 ? 5 : 6;
      const f = BS.formulaStats({ level: L, role: 'regular', tier, floor: Math.max(16, L - 8), fit: 'both' });
      const maxHit = M.C.playerCombatRolls({}, ctx).maxHit, acc = M.C.playerCombatRolls({ ...f, tier, level: L }, ctx).accuracy;
      const red = Math.floor((f.def || 0) * 0.03);
      let swing = 0; for (let r = 1; r <= maxHit; r++) swing += Math.max(1, r - red); swing = (acc * swing) / maxHit;
      const top = topOf(maxHit, ps.hitPm), lo = Math.ceil(top / 2);
      let strike = 0; for (let r = lo; r <= top; r++) strike += Math.max(1, r - red); strike /= top - lo + 1;
      if (!(strike > swing)) return way + ' at Level ' + L + ': Power Strike lands ' + strike.toFixed(1) + ', a plain swing ' + swing.toFixed(1);
    }
    return null;
  },
  'bar-budget': (M) => {
    const CAP = { '*': 0.85, shield: 0.6, restoration: 0.3 };
    for (const d of M.AD.DISCIPLINE_IDS) {
      const fill = Object.values(M.AD.ABILITIES).filter((r) => r.lane === 'offense' && !r.replaces && r.disciplines.includes(d)).reduce((s, r) => s + M.AD.ABILITY_LANES.offense / r.cdMs, 0);
      if (fill > (CAP[d] ?? CAP['*']) + 1e-9) return d + ' fills ' + fill.toFixed(2) + ' of its offense lane, its cap ' + (CAP[d] ?? CAP['*']);
    }
    return null;
  },
  'both-paths': async (M) => {
    const R = await loadCellRunner(M.root);
    const cell = { ground: 'mosslight_glade', party: ['axes'], level: 30, hours: 1, seeds: 1 };
    const viewed = R.runCell({ ...cell, id: 'sr:viewed', windowMs: 10000 }), closed = R.runCell({ ...cell, id: 'sr:closed', windowMs: 600000 });
    const v = viewed.heroes[0], c = closed.heroes[0];
    if (!(viewed.party.killsPerH > 30)) return 'the fixture killed ' + viewed.party.killsPerH + ' an hour';
    if (viewed.party.killsPerH !== closed.party.killsPerH) return 'kills: viewed ' + viewed.party.killsPerH + ', browser closed ' + closed.party.killsPerH;
    for (const k of ['levelXpPerH', 'takenPerH', 'deaths', 'storePerH']) if (v[k] !== c[k]) return k + ': viewed ' + v[k] + ', browser closed ' + c[k];
    const rend = (h) => (h.casts && h.casts.rend) || 0;
    if (!(rend(v) > 100)) return 'the axes cast Rend ' + rend(v) + ' times an hour on their default bar (' + JSON.stringify(v.casts) + ')';
    if (rend(v) !== rend(c)) return 'Rend casts: viewed ' + rend(v) + ', browser closed ' + rend(c);
    return null;
  },
};

const AB = 'src/core/hunt/abilities.js', AD = 'src/data/abilities.js';
const mutants = [
  { name: 'the version step is never read (every rune casts its share at 1000)', case: 'hits-share-the-blow',
    edits: [[AB, '    const pm = Math.floor((v.outPm * s.pm) / 1000);', '    const pm = s.pm;']] },
  { name: 'a hit reads a fixed blow of 20, not the caster\'s', case: 'hits-share-the-blow',
    edits: [[AB, '  const dmg = () => roll(sc, blowShare(u.maxHit, row));', '  const dmg = () => roll(sc, blowShare(20, row));']] },
  { name: 'a heal reads the caster\'s max HP in place of its blow', case: 'heals-and-shells',
    edits: [[AD, '  if (Number.isInteger(row.healPm)) return { heal: at(of(maxHit, row.healPm)) };', '  if (Number.isInteger(row.healPm)) return { heal: at(of(maxHp, row.healPm)) };']] },
  { name: 'Mend is a share of the blow (the 32-4 exception lost)', case: 'heals-and-shells',
    edits: [[AD, '  if (Number.isInteger(row.healHpPm)) return { heal: at(of(maxHp, row.healHpPm)) };', '  if (Number.isInteger(row.healHpPm)) return { heal: at(of(maxHit, row.healHpPm * 10)) };']] },
  { name: 'the bleed stack is landed with no blow (its tick back to a fixed point)', case: 'bleed-shares-the-blow',
    edits: [[AB, '    applyStatus(inst, m, statusRow(row.status), { u: u.id, maxHit: hit, runeTier: (v && v.version) || 1 }, sc);', '    applyStatus(inst, m, statusRow(row.status), { u: u.id, runeTier: (v && v.version) || 1 }, sc);']] },
  { name: 'the bleed ignores its rune tier', case: 'bleed-shares-the-blow',
    edits: [['src/core/hunt/status.js', '  return Math.max(1000, Math.floor((hit * row.blowPm * row.tierPermille[tier - 1]) / 1000));', '  return Math.max(1000, hit * row.blowPm);']] },
  { name: 'Power Strike at half its share (half a swing again, as before the rule)', case: 'power-strike-beats-a-swing',
    edits: [[AD, "    target: 'enemy', hitPm: 700 }),", "    target: 'enemy', hitPm: 350 }),"]] },
  { name: 'the axes keep Power Strike (32-3 undone: the axes over the bar budget)', case: 'bar-budget',
    edits: [[AD, "disciplines: ['shield', 'sword', 'club', ...(FIST_LINE.live", "disciplines: ['shield', 'sword', 'dual_axe', 'club', ...(FIST_LINE.live"]] },
  { name: 'the deepest rune steps x1.6 (the B5 proposal, which cut the first hours\' casts)', case: 'rows-are-shares',
    edits: [['src/data/runes.js', "name: 'Graven', level: 60, stepPm: 1400 }", "name: 'Graven', level: 60, stepPm: 1600 }"]] },
  { name: 'a unit\'s bleed stacks are not kept between settles (a watched hunt bleeds on a different beat)', case: 'both-paths',
    edits: [['src/core/hunt/status.js', "export const PERSISTED = Object.freeze({ unit: Object.freeze([['statuses', 'json']]), world: Object.freeze([]), pack: Object.freeze([]) });",
      "export const PERSISTED = Object.freeze({ unit: Object.freeze([]), world: Object.freeze([]), pack: Object.freeze([]) });"]] },
];

const REPORT = makeReport('hunt-core/spell-rule');
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const load = async (root) => { const M = await loadCore(root); return Object.assign(M, await loadData(M)); };
const REAL = await load(ROOT);
for (const [cn, fn] of Object.entries(cases).filter(([k]) => !ONLY || ONLY.includes(k))) {
  let why = null;
  try { why = await fn(REAL); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  REPORT.ok(!why, cn + ': ' + why);
}
const PICKED = mutants.filter((m) => !ONLY || ONLY.includes(m.case));
for (const mu of PICKED) {
  /* the planted engine under this tree's simulator (cell.mjs reads the engine from the root it is handed): to-hit-ratio.mjs's way */
  const p = plant(mu.edits, [...PLAY_TREES, 'tests/hunt-core/fixtures']);
  try {
    let why = null;
    try { why = await cases[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    /* a throw is the harness failing, never the case catching the defect */
    REPORT.ok(!!why && !why.startsWith('threw '), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + (why ? ' (' + why.slice(0, 200) + ')' : ''));
    if (why && process.argv.includes('--verbose')) console.log('  caught: ' + mu.name + ' -> ' + why);
  } finally { p.done(); }
}
if (!REPORT.fails.length) console.log('  ' + (ONLY ? ONLY.length : Object.keys(cases).length) + ' cases, ' + PICKED.length + ' mutants caught');
REPORT.finish();
