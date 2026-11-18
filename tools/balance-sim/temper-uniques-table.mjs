#!/usr/bin/env node
// tools/balance-sim/temper-uniques-table.mjs — TEMPERING PAST DAWNSTEEL, sized on the real engine before it is built (designer,
// lane/d-temper-uniques; Tyler 2026-11-15: a pure gold sink on the unique armor past Dawnsteel with a small cap, about +2-3% at most,
// sized with the simulator; the design is docs/planning/PRIORITY_BOARD.md "2026-11-15 Tempering past Dawnsteel").
// A measuring tool: it grades nothing and writes nothing to src/. The ladders are src/data/temper.js TEMPER_UNIQUE_BANDS (shut until
// a piece is real); the pieces are the armor line's (tools/balance-sim/staged/armor-line.js), added to the engine's ITEMS in memory as armor-line-table does.
//
//   node tools/balance-sim/temper-uniques-table.mjs gold [--hours 2] [--seeds 4] [--food salted_shark]
//        THE GOLD CURVE PAST 110: a lone sword-and-shield tank (the career's hero, as lane/d-audit-balance-2 priced tiers 4 to 6) on Normal
//        at the floor and middle of every drafted ground past Dawnsteel, on the line at that Level with Krell's Tollgate, the ground's guide
//        food: Level XP an hour and net gold an hour (coin and sold loot with rares, less the store). A band's hours and gold are the sum over
//        its Levels of (XP to the next Level / XP an hour) and that times net gold an hour, read between the measured Levels.
//
//   node tools/balance-sim/temper-uniques-table.mjs next
//        THE NEXT BAND STILL WINS (no fights; mitigation.js and temper.js themselves, as tests/hunt-core/temper-play.mjs reads tiers 2 to 6):
//        each weight's full set of one band on the line, fully tempered, against the next band's bare set, on every drafted ground the
//        next band's pieces are worn on or past; and what a full ladder takes off on its own band's ground.
//
//   node tools/balance-sim/temper-uniques-table.mjs bars [--ground unmarked_catacombs|wyvern_roost] [--seeds 3] [--hours 2] [--only 0,2] [--food 0]
//        A FULLY TEMPERED UNIQUE SET DOESN'T MOVE A GROUND'S BARS: the line's set untempered and fully tempered, and one band behind
//        untempered and fully tempered, on the sheet's cells (Normal lone low point, Dangerous and Deadly deaths per 16 hero-hours).
//
// Exit 0 when every cell ran; 1 otherwise.
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const mode = process.argv[2];
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const SLOTS = ['helmet', 'body', 'pants', 'boots', 'gloves', 'belt'];
const WEIGHTS = ['plate', 'leather', 'cloth'];
const LINE_OF = { tank: 'plate', sword: 'plate', hammer: 'plate', axes: 'plate', bow: 'leather', crossbow: 'leather', mage: 'cloth', healer: 'cloth' };
const head = (title, cols) => { console.log('\n' + title); console.log('| ' + cols.join(' | ') + ' |'); console.log('|' + cols.map(() => '---').join('|') + '|'); };
const line = (cells) => console.log('| ' + cells.join(' | ') + ' |');
const k = (n) => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.round(n / 1000) + 'k');

/* The drafted grounds past Dawnsteel and the Levels each is read at (each pack's `band`), and the grounds its staged packs open with. */
const GROUNDS = [
  { ground: 'carters_rest', band: [110, 125], levels: [110, 117, 124], open: ['carters_rest', 'ox_road'] },
  { ground: 'ox_road', band: [112, 128], levels: [112, 120, 127], open: ['carters_rest', 'ox_road'] },
  { ground: 'wyvern_roost', band: [125, 142], levels: [125, 133, 141], open: ['wyvern_roost', 'carters_rest', 'ox_road'] },
  { ground: 'unmarked_catacombs', band: [165, 185], levels: [165, 175, 184], open: ['unmarked_catacombs', 'carters_rest', 'ox_road', 'wyvern_roost'] },
];

/* In-memory rows: each weight's line set worn from Level `r` ('tu_<r>_<weight>_<slot>', armor Dawnsteel's x max(1, r / 110), reqLv r),
   and Krell's Tollgate. Every other number is the Dawnsteel piece's, as the line rules. */
async function rowsFor(levels) {
  const AL = await import(u('tools/balance-sim/staged/armor-line.js'));
  const { SPECIAL_SAMPLE } = await import(u('src/data/special-attributes.js'));
  const { ITEMS } = await import(u('src/data/items.js'));
  const out = { tu_tollgate: SPECIAL_SAMPLE.krells_tollgate.row };
  for (const r of levels) for (const cls of WEIGHTS) for (const s of SLOTS) {
    const base = ITEMS[AL.LINE_BASE[cls].ids[s]];
    out['tu_' + r + '_' + cls + '_' + s] = { ...base, defB: AL.lineArmor(s, cls, r), reqLv: r, rarity: 'unique', n: 'what-if' };
  }
  return { rows: out, AL };
}
const setOf = (r, cls) => Object.fromEntries(SLOTS.map((s) => [s, 'tu_' + r + '_' + cls + '_' + s]));

/* The engine with extra rows in both ITEMS instances, and a cell runner on it. */
async function engine(extra) {
  const { loadCellRunner } = await import(u('tools/balance-sim/cell.mjs'));
  const R = await loadCellRunner(ROOT);
  const { BUILD } = await import(u('src/build-info.js'));
  const tables = [(await import(u('src/data/items.js') + '?v=' + BUILD.version)).ITEMS, (await import(u('src/data/items.js'))).ITEMS];
  for (const t of tables) for (const [id, row] of Object.entries(extra)) { if (t[id]) throw new Error('temper-uniques-table: ' + id + ' is already an item'); t[id] = JSON.parse(JSON.stringify(row)); }
  return { R, ITEMS: tables[0], BUILD };
}

/* ── THE GOLD CURVE ── */
async function gold() {
  const HOURS = Number(arg('hours', 2)), SEEDS = Number(arg('seeds', 4));
  const levels = [...new Set(GROUNDS.flatMap((g) => g.levels))];
  const { rows } = await rowsFor(levels);
  const { R } = await engine(rows);
  const TD = await import(u('src/data/temper.js'));
  head('THE GOLD CURVE PAST DAWNSTEEL: a lone tank on Normal, on the line at its Level with the Tollgate, the guide food. ' + SEEDS + ' seeds x ' + HOURS + ' h a cell.',
    ['Ground', 'Level', 'Level XP/h', 'coin+loot g/h', 'rares g/h', 'store g/h', 'net g/h (with rares)', 'deaths', 'low %']);
  const pts = [];
  for (const g of GROUNDS) for (const L of g.levels) {
    const also = { ...setOf(L, 'plate'), shield: 'tu_tollgate' };
    /* `--food salted_shark`: every cell on that store food instead of the guide's (the armor line's handoff 1: the guide names Salted Lobster past 110) */
    const food = arg('food', null);
    const m = R.runCell({ id: 'TU:' + g.ground + ':' + L, ground: g.ground, party: ['tank'], level: L, hours: HOURS, seeds: SEEDS, gear: { openAlso: g.open, also },
      ...(food ? { bar: { storeFood: food } } : {}) });
    const h = m.heroes[0];
    pts.push({ ground: g.ground, L, xp: h.levelXpPerH, net: h.netWithRaresPerH });
    line([g.ground, L, h.levelXpPerH, h.incomePerH, h.raresPerH, h.storePerH, h.netWithRaresPerH, h.deaths, Math.round(h.encMinHpPct.p50)]);
  }
  /* A Level's XP an hour and net gold an hour, where the game sends the hero (hunt-list.js recommends a ground whose band holds its Level):
     the drafted grounds whose band holds L, the one paying the most XP; with none (143 to 164: the Bellows is not drafted), the drafted ground
     with the highest floor under L, held at its last measured Level. Read straight between a ground's measured Levels. */
  const at = (L, key) => {
    const inBand = GROUNDS.filter((g) => g.band[0] <= L && L <= g.band[1]);
    const pool = inBand.length ? inBand : [GROUNDS.filter((g) => g.band[0] <= L).sort((x, y) => y.band[0] - x.band[0])[0]];
    const byGround = pool.map((g) => {
      const ms = g.levels.map((x) => pts.find((p) => p.ground === g.ground && p.L === x));
      let i = 0;
      while (i < ms.length - 2 && L > ms[i + 1].L) i++;
      const a = ms[i], b = ms[i + 1], f = Math.min(1, Math.max(0, (L - a.L) / (b.L - a.L)));
      return { xp: a.xp + f * (b.xp - a.xp), net: a.net + f * (b.net - a.net), ground: g.ground };
    });
    return byGround.sort((x, y) => y.xp - x.xp)[0][key];
  };
  const bands = Object.keys(TD.TEMPER_UNIQUE_BANDS).map(Number).sort((a, b) => a - b);
  head('A BAND\'S HOURS AND GOLD, and what its ladder asks (TEMPER_UNIQUE_BANDS). The ground a Level is read on is the drafted one paying the most XP at or under it.',
    ['Band', 'Levels', 'Read on', 'hours', 'gold banked', 'ladder gold', 'share', 'salts', 'salts at book', 'share with salts']);
  const book = (await import(u('src/data/items.js'))).ITEMS[TD.TEMPER_UNIQUE_ITEM].v;
  for (const [i, b] of bands.entries()) {
    const to = bands[i + 1] || b + 20;
    let hours = 0, banked = 0;
    for (let L = b; L < to; L++) {
      const need = R.XP.charXpForLevel(L + 1) - R.XP.charXpForLevel(L), xp = at(L, 'xp'), net = at(L, 'net');
      hours += need / xp; banked += (need / xp) * net;
    }
    const row = TD.TEMPER_UNIQUE_BANDS[b], ask = row.gold.reduce((s, n) => s + n, 0), salts = row.qty.reduce((s, n) => s + n, 0);
    const read = [...new Set(Array.from({ length: to - b }, (_, j) => at(b + j, 'ground')))].join(', ');
    line([b, b + ' to ' + to, read, Math.round(hours), k(banked), k(ask),
      Math.round((100 * ask) / banked) + '%', salts, k(salts * book), Math.round((100 * (ask + salts * book)) / banked) + '%']);
  }
}

/* ── THE NEXT BAND STILL WINS (no fights) ── */
async function next() {
  const { BUILD } = await import(u('src/build-info.js'));
  const v = '?v=' + BUILD.version;
  const AL = await import(u('tools/balance-sim/staged/armor-line.js'));
  const TD = await import(u('src/data/temper.js') + v);
  const T = await import(u('src/core/temper.js') + v);
  const { mitigationOf, mitigate, armourValues } = await import(u('src/core/mitigation.js') + v);
  const { MONSTERS, monsterLevelOf } = await import(u('src/data/monsters.js') + v);
  const { monsterMaxHit } = await import(u('src/core/combat.js') + v);
  const { HUNT_GROUNDS } = await import(u('src/data/hunt-grounds.js'));
  const { ITEMS } = await import(u('src/data/items.js') + v);
  const bands = Object.keys(TD.TEMPER_UNIQUE_BANDS).map(Number).sort((a, b) => a - b);
  for (const b of bands) for (const cls of WEIGHTS) for (const s of SLOTS) ITEMS['tu_' + b + '_' + cls + '_' + s] = { ...ITEMS[AL.LINE_BASE[cls].ids[s]], defB: AL.lineArmor(s, cls, b), reqLv: b, rarity: 'unique', tier: 7 };
  const monstersOf = (g) => [...new Set(HUNT_GROUNDS[g].pockets.flatMap((p) => p.spawns.map((x) => x.monster)))];
  /* What one swing lets through on average over a ground's monsters (each at its own Level and max hit, the dodge counted), the
     temper-play reading: the rung's part of a point at its exact mean. */
  const swing = (set, armorPm, mons) => {
    let sum = 0;
    for (const id of mons) {
      const row = MONSTERS[id], L = monsterLevelOf(row), mit = mitigationOf(armourValues(set, ITEMS), L), blow = Math.max(1, Math.floor(monsterMaxHit(row)));
      let p = 0;
      const lo = mitigate(blow, 1000, mit, armorPm, { chance: (c) => { p = c; return false; } }), hi = mitigate(blow, 1000, mit, armorPm, { chance: () => true });
      sum += (1 - mit.dodgePm / 1000) * (lo + p * (hi - lo));
    }
    return sum / mons.length;
  };
  const FLOORS = { carters_rest: 110, ox_road: 112, wyvern_roost: 125, unmarked_catacombs: 165 };
  const full = (b) => ({ ['temper:armor:' + b]: TD.TEMPER_UNIQUE_BANDS[b].gold.length });
  head('WHAT A FULL LADDER DOES ON ITS OWN BAND\'S GROUNDS: a whole set on the line, bare and fully tempered. Plate on the line sits near the 60% cap against the ground top monsters, so there the cap takes part of the ladder.',
    ['Band', 'Weight', 'Ground', 'pm read', 'bare: a swing lets through', 'fully tempered', 'taken off']);
  for (const b of bands) for (const cls of WEIGHTS) for (const [g, fl] of Object.entries(FLOORS)) {
    if (fl < b || fl >= (bands[bands.indexOf(b) + 1] || 999)) continue;
    const set = setOf(b, cls), pm = T.armorPmOf(set, ITEMS, full(b)), mons = monstersOf(g);
    const bare = swing(set, 0, mons), tempered = swing(set, pm, mons);
    line([b, cls, g, pm, bare.toFixed(2), tempered.toFixed(2), (100 * (1 - tempered / bare)).toFixed(2) + '%']);
  }
  head('THE NEXT BAND STILL WINS: a band\'s set fully tempered against the next band\'s bare set, on each drafted ground at or past the next band\'s Level. Positive margin = the next set lets less through.',
    ['Band, tempered', 'Next band, bare', 'Weight', 'Ground', 'tempered lets through', 'next bare lets through', 'margin', 'margin at a 2% ladder', 'at 3%', 'at 4%']);
  let thinnest = Infinity;
  for (const [i, b] of bands.entries()) {
    const nb = bands[i + 1];
    if (!nb) continue;
    for (const cls of WEIGHTS) for (const [g, fl] of Object.entries(FLOORS)) {
      if (fl < nb) continue;
      const set = setOf(b, cls), up = setOf(nb, cls), mons = monstersOf(g);
      const t = swing(set, T.armorPmOf(set, ITEMS, full(b)), mons), n = swing(up, 0, mons), margin = 100 * (1 - n / t);
      thinnest = Math.min(thinnest, margin);
      /* the sizing question: the same pair at a whole ladder of 2%, 3% and 4% (the pm the full set reads, scaled) */
      const alt = (pm) => (100 * (1 - n / swing(set, pm, mons))).toFixed(2) + '%';
      line([b, nb, cls, g, t.toFixed(2), n.toFixed(2), margin.toFixed(2) + '%', alt(20), alt(30), alt(40)]);
    }
  }
  console.log('\nthinnest margin: ' + thinnest.toFixed(2) + '%');
}

/* ── THE BARS ── */
async function bars() {
  const SPEC = {
    unmarked_catacombs: { level: 165, band: 165, behind: 145, seeds: 3, hours: 2, open: GROUNDS[3].open },
    wyvern_roost: { level: 125, band: 125, behind: 110, seeds: 3, hours: 2, open: GROUNDS[2].open },
  }[arg('ground', 'unmarked_catacombs')];
  if (!SPEC) throw new Error('--ground unmarked_catacombs|wyvern_roost');
  const g = arg('ground', 'unmarked_catacombs'), SEEDS = Number(arg('seeds', SPEC.seeds)), HOURS = Number(arg('hours', SPEC.hours));
  const { rows } = await rowsFor([SPEC.band, SPEC.behind]);
  const { R } = await engine(rows);
  const TD = await import(u('src/data/temper.js'));
  const T = await import(u('src/data/hunt-tiers.js'));
  const full = (b) => ({ ['temper:armor:' + b]: TD.TEMPER_UNIQUE_BANDS[b].gold.length });
  const VARIANTS = [
    { label: 'On the line (worn from ' + SPEC.band + '), bare', r: SPEC.band, temper: null },
    { label: 'On the line, fully tempered', r: SPEC.band, temper: full(SPEC.band) },
    { label: 'A band behind (worn from ' + SPEC.behind + '), bare', r: SPEC.behind, temper: null },
    { label: 'A band behind, fully tempered', r: SPEC.behind, temper: full(SPEC.behind) },
  ];
  const FOODS = [{ id: null, label: 'the guide\'s' }, { id: 'salted_shark', label: 'Salted Shark' }];
  const CELLS = [{ label: 'Normal, tank alone', party: ['tank'], tier: 'normal' }, { label: 'Normal, hammer alone', party: ['hammer'], tier: 'normal' },
    { label: 'Normal, bow alone', party: ['bow'], tier: 'normal' }, { label: 'Normal, Mage alone', party: ['mage'], tier: 'normal' },
    { label: 'Dangerous, tank and Healer', party: ['tank', 'healer'], tier: 'dangerous', show: 'deaths' },
    { label: 'Deadly, a four', party: ['tank', 'healer', 'bow', 'mage'], tier: 'deadly', show: 'deaths' }];
  head(g + ' at Level ' + SPEC.level + ', ' + SEEDS + ' seeds x ' + HOURS + ' h a cell, the same dice in every row. Normal: the typical low point (the sheet: at least 60%). Dangerous and Deadly: deaths per 16 hero-hours (the sheet: a Deadly four at most 9).',
    ['Kit', 'Food', ...CELLS.map((c) => c.label)]);
  const only = arg('only', null) ? arg('only', '').split(',').map(Number) : null, foodOnly = arg('food', null) === null ? null : Number(arg('food'));
  for (const [fi, food] of FOODS.entries()) for (const [vi, v] of VARIANTS.entries()) {
    if ((only && !only.includes(vi)) || (foodOnly !== null && foodOnly !== fi)) continue;
    const out = [v.label, food.label];
    for (const c of CELLS) {
      const cell = { id: 'TUB:' + g + ':' + c.party.join('+') + ':' + vi + ':' + food.id, ground: g, party: c.party, level: SPEC.level, hours: HOURS, seeds: SEEDS,
        gearBySeat: c.party.map((s) => ({ openAlso: SPEC.open, also: { ...setOf(v.r, LINE_OF[s]), ...(s === 'tank' ? { shield: 'tu_tollgate' } : {}) } })),
        ...(c.tier !== 'normal' ? { options: { tier: c.tier }, density: T.tierRowOf(g, c.tier).pull[c.party.length - 1] } : {}),
        ...(food.id ? { bar: { storeFood: food.id } } : {}), ...(v.temper ? { temper: v.temper } : {}) };
      const res = R.runCell(cell);
      const hh = res.heroes.reduce((s, h) => s + h.hours, 0), d = res.heroes.reduce((s, h) => s + h.deaths, 0);
      const h0 = res.heroes[0];
      out.push(c.show === 'deaths' ? Math.round((160 * d) / Math.max(hh, 1e-9)) / 10 + ' (tank low ' + Math.round(h0.encMinHpPct.p50) + '%)'
        : Math.round(h0.encMinHpPct.p50) + '% (taken ' + h0.takenPerH + '/h)');
    }
    line(out);
  }
}

const MODES = { gold, next, bars };
if (!MODES[mode]) { console.error('usage: node tools/balance-sim/temper-uniques-table.mjs ' + Object.keys(MODES).join('|')); process.exit(1); }
const t0 = Date.now();
try { await MODES[mode](); } catch (e) { console.error('temper-uniques-table: ' + (e && e.stack || e)); process.exit(1); }
console.log('\n(' + mode + ': ' + Math.round((Date.now() - t0) / 1000) + ' s)');
