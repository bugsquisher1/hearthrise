#!/usr/bin/env node
// tools/balance-sim/tower-table.mjs — THE BURNING TOWER'S SAMPLE, measured on the real engine (designer, lane/d-burning-tower;
// the design is docs/planning/PRIORITY_BOARD.md "2026-11-14 The Burning Tower"). A what-if tool: it writes nothing to src/.
//
//   node tools/balance-sim/tower-table.mjs floors [--level 45] [--floors 35,45,55,65,75] [--pull 0|5|8] [--seeds 2] [--hours 0.5]
//        A FLOOR is the stat formula (src/data/balance-sheet.js formulaStats) read at the floor's number: every monster of the
//        room at Level F, its own role and art tier, fit 'both', no coin, no drops. The room is the Glade's layout and roster
//        (the stand-in until the Tower has its own map). Each cell is a hero or a four HOLDING that floor: a death ends the life
//        and the next starts at once at full HP, so XP an hour past a hero's reach is the die-and-retry rate, an upper bound.
//   node tools/balance-sim/tower-table.mjs death [--level 45] [--floor 70]
//        THE NO-DEATH-LOSS SWITCH, as a planted copy of the engine (tests/hunt-core/fixtures/h1.js plant): combat-sim.js die()
//        reads a fraction the session's mode gives it. The same dice with the switch off and on: the deaths, the kills and the XP
//        earned must match, and only the XP a death takes may differ (6% off, nothing on).
//   node tools/balance-sim/tower-table.mjs bow [--level 45]
//        A TOWER BOW against the standard bow of its rank on the Warrens' Normal: the same dice, the worn bow's row moved.
// Exit 0 when every cell ran (and, for `death`, when the rule held); 1 otherwise.
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { loadCellRunner } from './cell.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const mode = process.argv[2];
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const LEVEL = Number(arg('level', 45)), SEEDS = Number(arg('seeds', 2)), HOURS = Number(arg('hours', 0.5)), PULL = Number(arg('pull', 0));
const ROOM = arg('room', 'mosslight_glade');
const FOUR = ['tank', 'healer', 'bow', 'mage'];
const k = (n) => (n === null || n === undefined ? '-' : Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));

/* The engine's own rows (the ?v= instances src/core reads) and the runner's, as tools/balance-sim/worker.mjs holds them. */
async function engineRows(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const { BUILD } = await import(u('src/build-info.js'));
  const v = '?v=' + BUILD.version;
  return {
    monsters: [(await import(u('src/data/monsters.js') + v)).MONSTERS, (await import(u('src/data/monsters.js'))).MONSTERS],
    items: [(await import(u('src/data/items.js') + v)).ITEMS, (await import(u('src/data/items.js'))).ITEMS],
    sheet: await import(u('src/data/balance-sheet.js')),
  };
}
function setRows(tables, id, fields, undo) {
  for (const t of tables) if (t[id]) for (const [f, val] of Object.entries(fields)) {
    undo.push([t[id], f, Object.prototype.hasOwnProperty.call(t[id], f), t[id][f]]);
    t[id][f] = val;
  }
}
const restore = (undo) => { for (let i = undo.length - 1; i >= 0; i--) { const [row, f, had, val] = undo[i]; if (had) row[f] = val; else delete row[f]; } };

/* A floor's room: every roster monster of the stand-in ground on the formula at Level F. No coin and no drops. */
function floorRows(E, F) {
  const undo = [];
  for (const [id, role] of Object.entries(E.sheet.GROUND_ROSTER[ROOM])) {
    const row = E.monsters[0][id];
    const s = E.sheet.formulaStats({ level: F, role, tier: row.tier, floor: F, fit: 'both', ground: 'burning_tower' });
    setRows(E.monsters, id, { level: F, hp: s.hp, atk: s.atk, baseAcc: s.baseAcc, def: s.def, xp: s.xp, gp: [0, 0], drops: [] }, undo);
  }
  return undo;
}
const cellOf = (party, level, extra = {}) => ({ id: party.join('+') + '@' + level, ground: ROOM, party, level, hours: HOURS, seeds: SEEDS, segmentH: HOURS,
  ...(PULL ? { density: PULL } : {}), ...extra });
const read = (res) => {
  const hs = res.heroes, deaths = hs.reduce((a, h) => a + h.deaths, 0), hours = res.party.hours;
  return { deaths, perH: deaths / (hours || 1e-9), lifeMin: deaths ? (60 * hours) / (res.party.segments || 1) : null,
    minHp: Math.min(...hs.map((h) => (h.encMinHpPct.p50 === null ? 100 : h.encMinHpPct.p50))), kills: res.party.killsPerH, xp: res.party.levelXpPerHeroPerH,
    store: Math.round(hs.reduce((a, h) => a + h.storePerH, 0) / hs.length), ttk: res.party.ttkS.p50, lost: hs.reduce((a, h) => a + h.raw.xpLostLevel, 0),
    gained: hs.reduce((a, h) => a + h.raw.levelXp, 0), skill: hs.reduce((a, h) => a + Object.values(h.raw.skillXp).reduce((x, y) => x + y, 0), 0) };
};

async function floors() {
  const R = await loadCellRunner(ROOT), E = await engineRows(ROOT);
  const pace = JSON.parse(readFileSync(join(HERE, 'level-pace.json'), 'utf8'));
  const hunting = pace.rate[String(LEVEL)] || Math.round(E.sheet.contractXpPerH(LEVEL));
  const list = arg('floors', '35,45,55,65,75').split(',').map(Number);
  const parties = arg('who', 'tank,hammer,bow,mage,four').split(',').map((w) => (w === 'four' ? FOUR : [w]));
  console.log('THE BURNING TOWER, floors as the formula at Level F. Heroes at Level ' + LEVEL + ' in the kit their Level wears. Room: ' + ROOM
    + ', pull ' + (PULL || 'as built') + '. ' + SEEDS + ' seeds x ' + HOURS + ' h a cell. Hunting pace at ' + LEVEL + ': ' + k(hunting) + ' Level XP an hour (level-pace.json).');
  console.log('| Floor | Who | Deaths | Deaths an hour | Minutes a life | Typical low HP % | Kills an hour | Seconds a kill | Level XP an hour, raw | x hunting | Supplies g an hour |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  const reach = {};
  for (const F of list) {
    const undo = floorRows(E, F);
    try {
      for (const party of parties) {
        const r = read(R.runCell(cellOf(party, LEVEL)));
        const who = party.length > 1 ? 'four (' + party.join(', ') + ')' : party[0];
        if (r.deaths === 0) reach[who] = Math.max(reach[who] || 0, F);
        console.log('| ' + F + ' | ' + who + ' | ' + r.deaths + ' | ' + r.perH.toFixed(1) + ' | ' + (r.lifeMin === null ? 'held' : r.lifeMin.toFixed(1)) + ' | ' + Math.round(r.minHp)
          + ' | ' + k(r.kills) + ' | ' + (r.ttk ?? '-') + ' | ' + k(r.xp) + ' | ' + (r.xp / hunting).toFixed(2) + ' | ' + k(r.store) + ' |');
      }
    } finally { restore(undo); }
  }
  console.log('\nHIGHEST FLOOR HELD WITH NO DEATH (of the floors played): ' + Object.entries(reach).map(([w, f]) => w + ' ' + f).join(', '));
}

async function death() {
  const { plant } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/h1.js')).href);
  const P = plant([['src/core/combat-sim.js', 'const xpLost = deathXpLoss(m.state);',
    'const xpLost = deathXpLoss(m.state, globalThis.__MODE_DEATH_LOSS_PM === undefined ? undefined : (0.06 * globalThis.__MODE_DEATH_LOSS_PM) / 1000);']],
  ['supabase/functions/hr-accrue', 'tests/hunt-core/fixtures', 'tools/balance-sim', 'src/shell']);
  let ok = true;
  try {
    const { loadCellRunner: load } = await import(pathToFileURL(join(P.root, 'tools/balance-sim/cell.mjs')).href);
    const R = await load(P.root), E = await engineRows(P.root);
    const F = Number(arg('floor', 70));
    const undo = floorRows(E, F);
    const rows = [];
    try {
      for (const party of [['hammer'], FOUR]) for (const pm of [undefined, 0]) {
        globalThis.__MODE_DEATH_LOSS_PM = pm;
        rows.push({ who: party.length > 1 ? 'four' : party[0], pm, r: read(R.runCell(cellOf(party, LEVEL))) });
      }
    } finally { restore(undo); delete globalThis.__MODE_DEATH_LOSS_PM; }
    console.log('THE NO-DEATH-LOSS SWITCH on a planted engine, floor ' + F + ', Level ' + LEVEL + ', the same dice. ' + SEEDS + ' seeds x ' + HOURS + ' h.');
    console.log('| Who | Session mode | Deaths | Kills an hour | Level XP earned | Skill XP earned | Level XP the deaths took |');
    console.log('|---|---|---|---|---|---|---|');
    for (const x of rows) console.log('| ' + x.who + ' | ' + (x.pm === undefined ? 'a hunt (6%)' : 'no death loss') + ' | ' + x.r.deaths + ' | ' + k(x.r.kills) + ' | ' + x.r.gained + ' | ' + x.r.skill + ' | ' + x.r.lost + ' |');
    for (let i = 0; i < rows.length; i += 2) {
      const a = rows[i].r, b = rows[i + 1].r;
      /* the rule: a hunt's deaths cost XP; a mode's never do; and (a lone hero: one life is one fixed fight) the fight itself is the same */
      if (!(a.deaths > 0 && a.lost > 0)) { ok = false; console.log('RED ' + rows[i].who + ': the hunt row had no priced death, so it proves nothing (pick a harder floor)'); }
      if (!(b.deaths > 0 && b.lost === 0)) { ok = false; console.log('RED ' + rows[i].who + ': the mode row lost ' + b.lost + ' XP over ' + b.deaths + ' deaths'); }
    }
  } finally { P.done(); }
  console.log(ok ? 'RULE HELD: a hunt\'s deaths took Level XP, a mode session\'s took none.' : 'RULE BROKEN');
  return ok;
}

async function bow() {
  const R = await loadCellRunner(ROOT), E = await engineRows(ROOT);
  const base = R.runCell({ id: 'bow', ground: 'coppercap_warrens', party: ['bow'], level: LEVEL, hours: 2, seeds: SEEDS, segmentH: 2 });
  const worn = base.heroes[0].kit.weapon, row = E.items[0][worn];
  console.log('A TOWER BOW against the ' + (row.name || worn) + ' (accuracy ' + row.rangeAtkB + ', damage ' + row.rangeStrB + ', crit ' + (row.critB || 0) + ') on the Warrens\' Normal, a bow alone at Level ' + LEVEL
    + ', ' + SEEDS + ' seeds x 2 h, the same dice.');
  console.log('| Bow | Level XP an hour | x standard | Damage a second | Deaths |');
  console.log('|---|---|---|---|---|');
  const line = (name, res) => { const h = res.heroes[0]; console.log('| ' + name + ' | ' + k(h.levelXpPerH) + ' | ' + (h.levelXpPerH / base.heroes[0].levelXpPerH).toFixed(3) + ' | ' + h.dps + ' | ' + h.deaths + ' |'); };
  line('Standard', base);
  const variants = [['same numbers, +6% crit', 0, 0.06], ['1 less damage, +6% crit', -1, 0.06], ['1 less damage, +9% crit', -1, 0.09], ['1 less damage, +12% crit', -1, 0.12], ['2 less damage, +12% crit', -2, 0.12]];
  for (const [name, dStr, crit] of variants) {
    const undo = [];
    setRows(E.items, worn, { rangeStrB: row.rangeStrB + dStr, critB: (row.critB || 0) + crit }, undo);
    try { line(name, R.runCell({ id: 'bow', ground: 'coppercap_warrens', party: ['bow'], level: LEVEL, hours: 2, seeds: SEEDS, segmentH: 2 })); } finally { restore(undo); }
  }
}

const run = { floors, death, bow }[mode];
if (!run) { console.error('usage: node tools/balance-sim/tower-table.mjs floors|death|bow [--level N] ...'); process.exit(1); }
try { const ok = await run(); process.exit(ok === false ? 1 : 0); } catch (e) { console.error(String((e && e.stack) || e)); process.exit(1); }
