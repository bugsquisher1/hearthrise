#!/usr/bin/env node
// tools/balance-lab/parity.mjs — THE BALANCE LAB PLAYS THE GAME tools/balance-sim PLAYS, digit for digit.
//
//   node tools/balance-lab/parity.mjs            build the bundle into a temp folder, then the checks below (exit 1 on any red)
//   node tools/balance-lab/parity.mjs --mutate   every check's planted wrong twin must go red (the proof the checks bite)
//
//   seeds     the browser HMAC-SHA256 (shims/node-crypto.mjs) answers node:crypto's bytes for the edge seeder's labels
//   parity    a lone hero on Normal and a mixed four on the Glade's Dangerous (a pull of 5, four gear presets), played by
//             dist/engine.js and by tools/balance-sim/cell.mjs on the same cell: the whole measured answer is equal
//             (every field cell.mjs reports; the lab's own extra reads aside)
//   split     the same cell played seed by seed (the worker pool's road) and merged equals it played whole
//   dials     today's dials move nothing; a harder dial moves the fight; a written tier row is the row the engine reads;
//             after every run the rows are put back (the next baseline is today's again)
//   protocol  the worker's own message handler (play, then summary) answers what runCell answers
//   scaled    a scaled hunt in the Lab is the game's (src/data/scaled-hunts.js): on three grounds at three leader Levels each, every
//             roster row the engine reads equals scaledMonsters, every other monster is untouched, the tier row equals scaledTierRow
//             on Normal and Dangerous, a scaled Deadly and a leader who has not outgrown the ground are refused, and all is put back
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';
import { build } from './build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const MUTATE = process.argv.includes('--mutate');

const out = mkdtempSync(join(tmpdir(), 'balance-lab-'));
let E, R, shim;
try {
  const b = build(out);
  E = await import(pathToFileURL(join(out, 'engine.js')).href);
  shim = await import(pathToFileURL(join(HERE, 'shims', 'node-crypto.mjs')).href);
  console.log('balance-lab parity: bundle v' + b.version + ', ' + b.modules + ' modules');
} finally {
  /* the module is loaded; the folder is scratch */
  rmSync(out, { recursive: true, force: true });
}
const { loadCellRunner } = await import(pathToFileURL(join(ROOT, 'tools/balance-sim/cell.mjs')).href);
R = await loadCellRunner(ROOT);
/* THE GAME'S SCALED HUNTS, read straight from src (pristine rows, the module's own functions) */
const GAME = {
  MONSTERS: (await import(pathToFileURL(join(ROOT, 'src/data/monsters.js')).href)).MONSTERS,
  scaled: existsSync(join(ROOT, 'src/data/scaled-hunts.js')) ? await import(pathToFileURL(join(ROOT, 'src/data/scaled-hunts.js')).href) : null,
};
/* three grounds (a capped-danger ground, a party ground, a solo ground) at three leader Levels each, past the band's top, the last over the cap */
const SCALED_CASES = [['meadowbrook_thicket', [20, 35, 60]], ['millrace_sewer', [30, 41, 60]], ['mosslight_glade', [32, 45, 60]]];

/* every field cell.mjs reports (the lab's `lab` block is its own) */
const shape = (r) => JSON.stringify({ party: r.party, heroes: r.heroes.map((h) => { const { lab, ...rest } = h; return rest; }) });
const SOLO = { ground: 'meadowbrook_thicket', party: ['tank'], level: 10, hours: 0.25, seeds: 1 };
const FOUR = { ground: 'mosslight_glade', party: ['tank', 'healer', 'bow', 'mage'], level: 24, density: 5, options: { tier: 'dangerous' }, windowMs: 120000,
  hours: 0.25, seeds: 2, gearBySeat: [{}, { tierOffset: -1, only: 'all' }, { starter: true }, { armourSlots: ['helmet', 'body'] }] };
const GLADE_MONSTERS = () => E.grounds().find((g) => g.id === 'mosslight_glade').monsters.map((m) => m.id);
/* the four played whole on today's rows, once (every check below compares against it) */
let fourWhole = null;
const four = () => fourWhole || (fourWhole = shape(E.runCell(FOUR)));

/* Each check answers null (green) or why it is red. A mutant is the same check with one planted fault. */
const CHECKS = {
  seeds(m) {
    const labels = ['hunt:00000000-0000-4000-8000-0000000c5f01:s:0', 'hunt:x:r:123456', '', 'z'.repeat(130)];
    for (const l of labels) {
      const key = 'hearthrise:hunt-swing:v1:' + (m ? '-1' : '-4611686018427387904');
      const a = Buffer.from(shim.createHmac('sha256', key).update(l, 'utf8').digest()).toString('hex');
      const b = createHmac('sha256', 'hearthrise:hunt-swing:v1:-4611686018427387904').update(l, 'utf8').digest('hex');
      if (a !== b) return 'the shim\'s HMAC differs from node:crypto on "' + l.slice(0, 40) + '"';
    }
    return null;
  },
  parity(m) {
    for (const cell of [SOLO, FOUR]) {
      /* the mutant plays the lab with a monster dial the reference never saw */
      const restore = m ? E.applyDials({ monsters: { dmgPm: 1010 } }, { groundId: cell.ground, tier: 'normal', monsterIds: [] }) : () => {};
      let lab;
      try { lab = E.runCell(cell); } finally { restore(); }
      const ref = R.runCell(cell);
      if (shape(lab) !== shape(ref)) return cell.ground + ' ' + cell.party.join('+') + ': the lab and tools/balance-sim answer different numbers';
    }
    return null;
  },
  split(m) {
    const parts = [E.playCell(FOUR, [0]), E.playCell(FOUR, [1])];
    if (m) parts.pop();
    const joined = E.summarise(FOUR, E.mergeTotals(parts));
    return shape(joined) === four() ? null : 'seed by seed, merged, differs from the cell played whole';
  },
  dials(m) {
    const ids = GLADE_MONSTERS();
    const ref = four();
    const same = E.applyDials(E.defaultDials('mosslight_glade'), { groundId: 'mosslight_glade', tier: 'dangerous', monsterIds: ids });
    let a;
    try { a = shape(E.runCell(FOUR)); } finally { same(); }
    if (a !== ref) return 'today\'s dials moved the fight';
    const d = E.defaultDials('mosslight_glade');
    d.monsters.dmgPm = 1500;
    d.tiers.dangerous = { ...d.tiers.dangerous, xpPm: 1300, hpPm: 1100 };
    const hard = E.applyDials(d, { groundId: 'mosslight_glade', tier: 'dangerous', monsterIds: ids });
    let b, read;
    try {
      read = E.tierDefaults('mosslight_glade').tiers.dangerous;
      b = E.runCell(FOUR);
    } finally { if (!m) hard(); }
    if (read.xpPm !== 1300) return 'the written Dangerous row is not the row the engine reads (xpPm ' + read.xpPm + ')';
    const base = JSON.parse(ref);
    const taken = (r) => r.heroes.reduce((s, h) => s + h.takenPerH, 0);
    if (!(taken(b) > taken(base))) return 'monster damage at 150% did not raise the damage the four took';
    if (b.heroes[0].levelXpPerH === base.heroes[0].levelXpPerH) return 'Level XP at 130% did not move';
    const after = shape(E.runCell(FOUR));
    if (m) hard();
    return after === ref ? null : 'a run after the dials is not today\'s game again (a row was not put back)';
  },
  protocol(m) {
    const page = { ground: FOUR.ground, heroes: FOUR.party.map((s, i) => ({ style: s, level: 24, gear: ['level', 'behind', 'starter', 'light'][i] })),
      density: 5, tier: 'dangerous', hours: 0.25, seeds: 2, windowMs: 120000 };
    const got = [];
    const post = (x) => got.push(x);
    E.handle({ type: 'play', id: 1, cell: page, seeds: [0], dials: null }, post);
    E.handle({ type: 'play', id: 2, cell: page, seeds: m ? [0] : [1], dials: null }, post);
    const parts = got.filter((x) => x.type === 'played').map((x) => x.totals);
    if (parts.length !== 2) return 'the handler did not answer two plays: ' + JSON.stringify(got.find((x) => x.type === 'error') || {}).slice(0, 300);
    E.handle({ type: 'summary', id: 3, cell: page, parts, ctx: { band: [16, 31], tier: 'dangerous' } }, post);
    const s = got.find((x) => x.type === 'summary');
    if (!s) return 'no summary: ' + JSON.stringify(got.find((x) => x.type === 'error') || {}).slice(0, 300);
    return shape(s.run) === four() ? null : 'the page\'s road (play, play, summary) differs from runCell';
  },
  scaled(m) {
    /* the game's own answer, computed here from src/data/scaled-hunts.js on today's rows (no lab code in the way) */
    if (!GAME.scaled) return 'src/data/scaled-hunts.js is not in this tree: the Lab has no scaled hunt to check';
    if (!E.hasScaled()) return 'the bundle did not pick up src/data/scaled-hunts.js';
    const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v));
    for (const [ground, levels] of SCALED_CASES) for (const leader of levels) {
      const want = GAME.scaled.scaledMonsters(GAME.MONSTERS, ground, leader);
      if (!Object.keys(want).length) return ground + ' at ' + leader + ': the game scales nothing (the case list is wrong)';
      for (const tier of ['normal', 'dangerous']) {
        /* the mutant asks the Lab for a leader one Level off */
        const undo = E.applyDials({ scale: { leaderLevel: m ? leader + 1 : leader } }, { groundId: ground, tier });
        try {
          for (const [id, row] of Object.entries(want)) if (canon(E.liveMonster(id)) !== canon(row)) return ground + ' at ' + leader + ': the Lab\'s ' + id + ' is not the game\'s scaledMonsters row';
          for (const g of E.grounds().find((x) => x.id === ground).monsters) if (!want[g.id] && canon(E.liveMonster(g.id)) !== canon(GAME.MONSTERS[g.id])) return ground + ': ' + g.id + ' (on no roster) moved';
          const row = E.tierDefaults(ground).tiers[tier], game = E.tierDialOf(GAME.scaled.scaledTierRow(ground, tier, leader));
          if (canon(row) !== canon(game)) return ground + ' at ' + leader + ': the engine reads ' + canon(row) + ' for ' + tier + ', the game\'s scaledTierRow is ' + canon(game);
        } finally { undo(); }
      }
      for (const id of Object.keys(want)) if (canon(E.liveMonster(id)) !== canon(GAME.MONSTERS[id])) return ground + ': ' + id + ' was not put back after the scaled run';
      /* the game offers no Deadly scaled: the Lab refuses it rather than playing the ground's own row */
      let refused = false;
      try { E.applyDials({ scale: { leaderLevel: leader } }, { groundId: ground, tier: 'deadly' })(); } catch (e) { refused = true; }
      if (!refused) return ground + ' at ' + leader + ': the Lab played a scaled Deadly the game does not offer';
    }
    /* a leader who has not outgrown the ground: the game refuses, so does the Lab */
    let refused = false;
    try { E.applyDials({ scale: { leaderLevel: 20 } }, { groundId: 'mosslight_glade', tier: 'normal' })(); } catch (e) { refused = /outgrown/.test(e.message); }
    return refused ? null : 'a Level 20 leader scaled the Glade (band top 31)';
  },
};

let red = 0;
for (const [name, check] of Object.entries(CHECKS)) {
  const t = Date.now();
  const why = check(MUTATE);
  const ms = Date.now() - t;
  if (MUTATE) {
    if (why) console.log('  ' + name + ': mutant caught (' + why + ') ' + ms + ' ms');
    else { red++; console.error('  ' + name + ': MUTANT SURVIVED: the check cannot go red'); }
  } else if (why) { red++; console.error('  ' + name + ': RED, ' + why); } else console.log('  ' + name + ': green (' + ms + ' ms)');
}
if (red) { console.error('balance-lab parity' + (MUTATE ? ' --mutate' : '') + ': RED (' + red + ')'); process.exit(1); }
console.log('balance-lab parity' + (MUTATE ? ' --mutate: every mutant caught' : ': green, the lab plays the game tools/balance-sim plays'));
