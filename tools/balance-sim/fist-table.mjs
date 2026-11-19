#!/usr/bin/env node
// tools/balance-sim/fist-table.mjs — THE FIST LINE'S SAMPLE, MEASURED ON THE REAL ENGINE (itemization plan §7 and §11 phase 1; lane/d-fists-phase1).
//
// The sample is HIDDEN (src/data/fists.js FIST_LINE.live false): this tool plays a planted copy of src/core, src/data and the edge settle
// with the switch on (tests/hunt-core/fixtures/h1.js plant), so it measures the rows as written, through the settle the world tick runs
// (cell.mjs), and leaves the tree untouched. A proposed number can be tried without editing the tree (each a plant edit on the copy):
//   --heal N        the wraps' own heal, permille of max HP a second while hurt (FIST_LINE.selfHealPm, 8)
//   --hands N       Charged Hands' mana (8)        --palm N   the Palm's version-I mana (12; the later versions keep their steps)
//
// WHAT EACH WAY HOLDS: the combat skills a hunting-only hero of that way would have at the Level (each skill's XP per Level XP, measured
// in a one-hour pass with every skill at the Level, times the Level's total XP; the prototype's "equal training time"). The fist wears
// the wraps of its tier (tier 1 under 15, tier 2 from 15: the only rows) in `--line` armor (plate by default); every other way its own
// ladder (gear.mjs STYLES).
// THE FIST'S BAR: Charged Hands of the ground's best element (the spawn-weighted weakness: its choice), Power Strike, Mend; `dear` adds the
// Palm of that element on the store rune of the tier its Magic casts (the stronger, optional cast). Every heal and drink is bought (cell.mjs
// supply 'store'), so the store bill is the whole supply cost.
//
//   node tools/balance-sim/fist-table.mjs solo [--hours 3] [--seeds 3] [--grounds thicket,wickstead,sewer,glade,warrens] [--heal N] ...
//   node tools/balance-sim/fist-table.mjs four [--hours 2] [--seeds 3]            a Dangerous and a Deadly four at the Glade (Level 24)
//   node tools/balance-sim/fist-table.mjs heal [--hours 2] [--seeds 2]            the own heal's dial alone at the Sewer and the Glade
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadCellRunner } from './cell.mjs';
import { sourceQuery } from '../lib/version-stamp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const mode = process.argv[2];
const hours = Number(arg('hours', mode === 'solo' ? 3 : 2)), seeds = Number(arg('seeds', mode === 'solo' ? 3 : mode === 'heal' ? 2 : 3));

const { plant } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/h1.js')).href);
const { PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);

/* THE PLANTED COPY: the sample live, and any proposed number the flags try. */
function plantedEdits(o = {}) {
  const edits = [['src/data/fists.js', 'live: false,', 'live: true,']];
  if (o.heal !== undefined) edits.push(['src/data/fists.js', 'selfHealPm: 8,', 'selfHealPm: ' + o.heal + ',']);
  if (o.hands !== undefined || o.handsCd !== undefined) edits.push(['src/data/abilities.js', "cdMs: 6000, mana: 8,\n      target: 'enemy', dmg: [8, 14]",
    'cdMs: ' + (o.handsCd ?? 6000) + ', mana: ' + (o.hands ?? 8) + ",\n      target: 'enemy', dmg: [8, 14]"]);
  if (o.palm !== undefined) edits.push(['src/data/abilities.js', 'cdMs: 8000, mana: 12,', 'cdMs: 8000, mana: ' + o.palm + ','],
    ['src/data/abilities.js', 'versions: [[12, 1000], [14, 1740]', 'versions: [[' + o.palm + ', 1000], [' + Math.max(o.palm, 14) + ', 1740]']);
  /* --proxies: TIER 3 AND 4 STAND-INS, measuring only (the sample has tiers 1 and 2; phase 12 builds the rest): the tier's sword
     (Steel 12/10, Mithril 18/15) with its strength x1.45, the rule tiers 1 and 2 were drawn by (4/3 -> 4/4, 7/6 -> 7/9). Never shipped. */
  if (o.proxies) edits.push(['src/data/fists.js', "tier: 2, rarity: 'uncommon', reqSkill: 'level', reqLv: 15 }),\n",
    "tier: 2, rarity: 'uncommon', reqSkill: 'level', reqLv: 15 }),\n"
    + "  proxy_wraps_t3: Object.freeze({ n: 'Proxy Wraps 3', v: 0, type: 'weapon', slot: 'weapon', weaponType: FIST_LINE.family, twoHanded: true, atkB: 12, strB: 15, selfHealPm: FIST_LINE.selfHealPm, tier: 3, rarity: 'rare', reqSkill: 'level', reqLv: 30 }),\n"
    + "  proxy_wraps_t4: Object.freeze({ n: 'Proxy Wraps 4', v: 0, type: 'weapon', slot: 'weapon', weaponType: FIST_LINE.family, twoHanded: true, atkB: 18, strB: 22, selfHealPm: FIST_LINE.selfHealPm, tier: 4, rarity: 'epic', reqSkill: 'level', reqLv: 45 }),\n"]);
  return edits;
}
const flags = () => ({ ...(arg('heal') ? { heal: Number(arg('heal')) } : {}), ...(arg('hands') ? { hands: Number(arg('hands')) } : {}), ...(arg('palm') ? { palm: Number(arg('palm')) } : {}),
  /* --hands-cd N: a WHAT-IF only (a cooldown is not a cost the lane tunes): Charged Hands' cooldown in ms (6000) */
  ...(arg('hands-cd') ? { handsCd: Number(arg('hands-cd')) } : {}),
  ...(process.argv.includes('--proxies') ? { proxies: true } : {}) });

async function withSample(o, fn) {
  const p = plant(plantedEdits(o), [...PLAY_TREES, 'tests/hunt-core/fixtures']);
  try {
    const imp = async (f) => import(pathToFileURL(join(p.root, f)).href + sourceQuery(p.root));
    const R = await loadCellRunner(p.root);
    const M = { AD: await imp('src/data/abilities.js'), FISTS: await imp('src/data/fists.js'), XP: await imp('src/core/xp.js'), EL: await imp('src/core/elements.js'),
      MON: await imp('src/data/monsters.js'), G: await imp('src/data/hunt-grounds.js'), SB: await imp('src/data/supply-basics.js'), RUNES: await imp('src/data/runes.js'),
      T: await imp('src/data/hunt-tiers.js') };
    return await fn(R, M);
  } finally { p.done(); }
}

const GROUNDS = { thicket: ['meadowbrook_thicket', 10], wickstead: ['wickstead', 13], sewer: ['millrace_sewer', 18], glade: ['mosslight_glade', 24],
  warrens: ['coppercap_warrens', 42], ford: ['hasks_ford', 52], slake: ['the_slake', 57] };
const COMBAT = ['melee', 'ranged', 'magic', 'defense'];
/* the wraps a Level wears: tier 1 under 15, tier 2 from 15 (the only rows the sample has) */
const PROXIES = process.argv.includes('--proxies');
const wrapsAt = (L) => (PROXIES && L >= 45 ? 'proxy_wraps_t4' : PROXIES && L >= 30 ? 'proxy_wraps_t3' : L >= 15 ? 'sluicers_knuckles' : 'practice_wraps');
/* --line plate | leather | cloth: the armor the fist wears (any weight, plan §7; plate by default, the line every other Melee way wears) */
const LINE = String(arg('line', 'plate'));
const FIST_GEAR = (L) => ({ line: LINE, also: { weapon: wrapsAt(L) } });

/* THE ELEMENT A FIST PICKS on a ground: the one its spawns take most from, weighted by how many stand in the pockets (none weak: fire). */
function bestElement(M, ground) {
  const g = M.G.HUNT_GROUNDS[ground];
  const count = {};
  for (const p of g.pockets) for (const s of (p.spawns || [])) count[s.monster] = (count[s.monster] || 0) + (s.n || 1);
  let best = null;
  for (const [family, element] of M.FISTS.FIST_ELEMENTS) {
    let w = 0, n = 0;
    for (const [mon, c] of Object.entries(count)) { w += c * M.EL.elementPermille(M.MON.MONSTERS[mon], element); n += c; }
    const avg = n ? w / n : 1000;
    if (!best || avg > best.avg) best = { family, element, avg: Math.round(avg) };
  }
  return best;
}

const slot = (M, id, store) => ({ id: 'd_' + id, action: Object.assign({ type: 'ability', id }, store ? { store } : {}),
  conditions: M.AD.suggestedTrigger(M.AD.ABILITIES[id]).map((c) => ({ ...c })), join: 'and' });
/* the store rune of the tier a Magic level casts (versions at 1 / 15 / 30 / 45 / 60) */
const runeTier = (lv) => (lv >= 60 ? 5 : lv >= 45 ? 4 : lv >= 30 ? 3 : lv >= 15 ? 2 : 1);
const storeRuneOf = (M, family, magic) => { const t = runeTier(magic); return t === 1 ? 'plain_' + family + '_rune' : 'plain_' + M.RUNES.runeId(family, t); };
function fistBar(M, el, magic, dear) {
  const out = [];
  if (dear) out.push(slot(M, el.family + '_palm', storeRuneOf(M, el.family, magic)));
  return out.concat([slot(M, el.family + '_hands'), slot(M, 'power_strike'), slot(M, 'mend')]);
}

const WAYS = { fist: { style: 'sword', fist: true }, hammer: { style: 'hammer' }, sword: { style: 'sword' }, axes: { style: 'axes' }, tank: { style: 'tank' },
  bow: { style: 'bow' }, mage: { style: 'mage' } };
const MELEE = ['hammer', 'sword', 'axes', 'tank'];

/* the skills a hunting-only hero of this way holds at Level L (each skill's XP per Level XP, measured at even skills, times L's total) */
function skillsFor(R, M, key, ground, L, bar) {
  const w = WAYS[key];
  const even = Object.fromEntries(COMBAT.map((k) => [k, L]));
  const h = R.runCell({ id: 'ft0:' + key + ground + L, ground, party: [w.style], level: L, hours: 1, seeds: 2, skillsBySeat: [even],
    ...(w.fist ? { gear: FIST_GEAR(L), slotsByRole: { melee_dps: bar(L) } } : {}) }).heroes[0];
  const total = M.XP.charXpForLevel(L);
  const out = {};
  for (const k of COMBAT) out[k] = Math.max(1, M.XP.skillLevelFromXp(k, Math.floor((((h.skillXpPerH || {})[k] || 0) / Math.max(1, h.levelXpPerH)) * total)));
  return out;
}

const eats = (h) => +(h.eatsPerH.own + h.eatsPerH.store).toFixed(1);
const drinks = (h) => +(h.drinksPerH.own + h.drinksPerH.store).toFixed(1);
const pct = (a, b) => (b ? ((a / b - 1) * 100).toFixed(1) + '%' : 'n/a');

async function solo(o) {
  const pick = String(arg('grounds', 'thicket,wickstead,sewer,glade,warrens')).split(',');
  await withSample(o, async (R, M) => {
    console.log('fist sample: heal ' + (o.heal ?? M.FISTS.FIST_LINE.selfHealPm) + ' permille/s, Hands mana ' + M.AD.ABILITIES.fire_hands.mana + ', Palm mana ' + M.AD.ABILITIES.fire_palm.mana
      + '; alone on Normal, ' + seeds + ' seeds x ' + hours + ' h');
    console.log('ground | L | way | skills M/R/Mg/D | Level XP/h | vs best lone | store g/h | net g/h | low HP p10 % | deaths | food/h | drinks/h | Magic XP/h | casts/h');
    for (const name of pick) {
      const [ground, L] = GROUNDS[name];
      const el = bestElement(M, ground);
      const rows = [];
      /* --ways fist,fist_dear: only those (a dial scan: the other ways read no fist row, so their numbers stand from a full run) */
      const ways = arg('ways') ? String(arg('ways')).split(',') : Object.keys(WAYS).concat(['fist_dear']);
      for (const key of ways) {
        const way = key === 'fist_dear' ? 'fist' : key, w = WAYS[way];
        let sk, h;
        try {
          const bar = (lv, magic) => fistBar(M, el, magic === undefined ? lv : magic, key === 'fist_dear');
          sk = skillsFor(R, M, way, ground, L, (lv) => bar(lv));
          h = R.runCell({ id: ['ft', key, ground, L].join(':'), ground, party: [w.style], level: L, hours, seeds, skillsBySeat: [sk],
            ...(w.fist ? { gear: FIST_GEAR(L), slotsByRole: { melee_dps: bar(L, sk.magic) } } : {}) }).heroes[0];
        } catch (e) { console.log([name, L, key, 'ERROR ' + (e && e.stack || e)].join(' | ')); continue; }
        rows.push({ key, sk, h });
      }
      const best = Math.max(...rows.filter((r) => r.key !== 'fist_dear').map((r) => r.h.levelXpPerH));
      for (const r of rows) {
        const h = r.h;
        console.log([name + (r.key.startsWith('fist') ? ' (' + el.family + ' ' + el.avg + ')' : ''), L, r.key, [r.sk.melee, r.sk.ranged, r.sk.magic, r.sk.defense].join('/'), h.levelXpPerH,
          pct(h.levelXpPerH, best), h.storePerH, h.profitPerH, h.encMinHpPct.p10, h.deaths, eats(h), drinks(h), (h.skillXpPerH || {}).magic || 0,
          Object.entries(h.castsPerH || {}).map(([k, n]) => k + ' ' + n).join(', ')].join(' | '));
      }
      const fist = rows.find((r) => r.key === 'fist'), melee = rows.filter((r) => MELEE.includes(r.key));
      if (fist && melee.length && rows.some((r) => r.key === 'hammer')) {
        const bestNet = melee.reduce((a, r) => (r.h.profitPerH > a.h.profitPerH ? r : a));
        const hammer = rows.find((r) => r.key === 'hammer');
        console.log('  VERDICT ' + name + ': XP ' + pct(fist.h.levelXpPerH, best) + ' of the best lone (promise >= -15%); net ' + fist.h.profitPerH + ' vs best lone melee '
          + bestNet.key + ' ' + bestNet.h.profitPerH + ' (promise: best); low HP p10 ' + fist.h.encMinHpPct.p10 + '% vs hammer ' + hammer.h.encMinHpPct.p10
          + '%; food/h ' + eats(fist.h) + ' vs hammer ' + eats(hammer.h) + '; deaths ' + fist.h.deaths);
      }
    }
  });
}

/* the own heal's dial alone: the same fist at the Sewer and the Glade with the heal at each size (each its own planted copy) */
async function heal() {
  const sizes = String(arg('sizes', '0,4,8,12')).split(',').map(Number);
  console.log('heal permille/s | ground | Level XP/h | store g/h | net g/h | low HP p10 % | deaths | food/h   (skills at the Level, cheap bar)');
  for (const s of sizes) {
    await withSample({ ...flags(), heal: s }, async (R, M) => {
      for (const name of String(arg('grounds', 'sewer,glade')).split(',')) {
        const [ground, L] = GROUNDS[name];
        const el = bestElement(M, ground);
        const h = R.runCell({ id: ['fth', s, ground].join(':'), ground, party: ['sword'], level: L, hours, seeds,
          gear: FIST_GEAR(L), slotsByRole: { melee_dps: fistBar(M, el, L, false) } }).heroes[0];
        console.log([s, name, h.levelXpPerH, h.storePerH, h.profitPerH, h.encMinHpPct.p10, h.deaths, eats(h)].join(' | '));
      }
    });
  }
}

/* A FOUR (fill and specialists-still-win): Dangerous and Deadly at the Glade, the fist in each seat it could take */
async function four(o) {
  await withSample(o, async (R, M) => {
    const F = 'FIST';
    const LINEUPS = [
      ['specialists: tank, healer, mage, hammer', ['tank', 'healer', 'mage', 'hammer']],
      ['specialists: tank, healer, mage, bow', ['tank', 'healer', 'mage', 'bow']],
      ['fist as the fourth: tank, healer, mage, FIST', ['tank', 'healer', 'mage', F]],
      ['fist for the tank: FIST, healer, mage, bow', [F, 'healer', 'mage', 'bow']],
      ['fist for the healer: tank, FIST, mage, bow', ['tank', F, 'mage', 'bow']],
      /* the controls: a hammer in the same two seats, so a seat's own effect (no shield, no heals) is told from the fist's */
      ['hammer for the tank: hammer, healer, mage, bow', ['hammer', 'healer', 'mage', 'bow']],
      ['hammer for the healer: tank, hammer, mage, bow', ['tank', 'hammer', 'mage', 'bow']],
      ['no fourth: tank, healer, mage', ['tank', 'healer', 'mage']],
    ];
    console.log('ground, Level, tier | lineup | Level XP/h a hero | vs first row | deaths (all seats) | store g/h a hero | the fist seat: dealt/h, deaths, low HP p10 %');
    /* the Slake (57) only with the tier-4 stand-in (--proxies) */
    for (const [name, tiers] of [['glade', ['dangerous', 'deadly']], ...(PROXIES ? [['slake', ['dangerous', 'deadly']]] : [])]) for (const tier of tiers) {
      const [ground, L] = GROUNDS[name];
      const el = bestElement(M, ground);
      let first = null;
      for (const [label, seats] of LINEUPS) {
        const party = seats.map((s) => (s === F ? 'sword' : s));
        const fi = seats.indexOf(F);
        const pull = M.T.pullOfTier(M.T.tierRowOf(ground, tier), party.length);
        const cell = { id: ['ft4', ground, tier, label].join(':'), ground, party, level: L, hours, seeds, segmentH: 1, options: { tier }, ...(pull ? { density: pull } : {}),
          ...(fi >= 0 ? { gearBySeat: seats.map((s) => (s === F ? FIST_GEAR(L) : {})), slotsByRole: { melee_dps: fistBar(M, el, L, false) } } : {}) };
        let m;
        try { m = R.runCell(cell); } catch (e) { console.log([name + ' ' + L + ' ' + tier, label, 'ERROR ' + e.message].join(' | ')); continue; }
        const xp = m.party.levelXpPerHeroPerH;
        if (first === null) first = xp;
        const deaths = m.heroes.reduce((s, h) => s + h.deaths, 0), store = Math.round(m.heroes.reduce((s, h) => s + h.storePerH, 0) / m.heroes.length);
        const fh = fi >= 0 ? m.heroes[fi] : null;
        console.log([name + ' ' + L + ' ' + tier, label, xp, pct(xp, first), deaths, store, fh ? fh.dealtPerH + ', ' + fh.deaths + ', ' + fh.encMinHpPct.p10 : ''].join(' | '));
      }
    }
  });
}

if (mode === 'solo') await solo(flags());
else if (mode === 'four') await four(flags());
else if (mode === 'heal') await heal();
else console.log('usage: node tools/balance-sim/fist-table.mjs solo|four|heal [--hours N] [--seeds N] [--heal N] [--hands N] [--palm N]');
