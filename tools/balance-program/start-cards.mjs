#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/start-cards.mjs — CHECK C1, THE WEAPON CARDS' MEASURED TAGS (08-player-experience.md section 6; 13-build-plan.md
// D-1, FB-3).
//
// Each card of the hero's first choice (standards.mjs START_CARDS: one card a STARTER_SETS row of src/data/start-kit.js) plays its way as a new
// player does it: one hero, the start kit and the start bar, the Mill Cellar on Normal until its hunt ends at Level 5, every supply bought at
// the store (tools/balance-sim/life.mjs playLife, policy `new`, the life tests/start-kit-pace.mjs plays). Each way plays `--seeds` lives on
// other dice. The reading: hunted minutes to Level 5, deaths, net gold at Level 5, against C1's band (Level 5 in 15 to 20 minutes, no
// death, net gold at or over zero). A way inside reads "Good alone"; outside, the card's tag is the designer's call (D-1). A READING, never
// a gate: it prints and exits 0, and the designer writes the tag into the data row FB-5 fills.
//
//   node tools/balance-program/start-cards.mjs [--base proposed|today] [--seeds 4] [--json <file>]
//   node tools/balance-program/start-cards.mjs --selftest     the band rule on planted lives (no play)
//
// Exit: 0 ran · 1 a selftest proof failed · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';
import { START_CARDS } from './standards.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/** One way's reading against C1 from its lives [{ minutes, deaths, net }] (minutes null: never reached the Level). */
export function readWay(lives, band = START_CARDS) {
  const reached = lives.filter((l) => Number.isFinite(l.minutes));
  const min = median(reached.map((l) => l.minutes)), deaths = lives.reduce((a, l) => a + l.deaths, 0), net = median(lives.map((l) => l.net));
  const why = [];
  if (reached.length < lives.length) why.push((lives.length - reached.length) + ' of ' + lives.length + ' lives never reached Level ' + band.toLevel);
  if (min !== null && min > band.minutes[1]) why.push('slower than ' + band.minutes[1] + ' minutes');
  if (min !== null && min < band.minutes[0]) why.push('faster than ' + band.minutes[0] + ' minutes');
  if (deaths > band.deaths) why.push(deaths + ' death(s)');
  if (net !== null && net < band.netGold) why.push('net gold under zero');
  const slow = reached.length < lives.length || (min !== null && min > band.minutes[1]);
  return { minutes: min === null ? null : Math.round(min * 10) / 10, minutesRange: reached.length ? [Math.min(...reached.map((l) => l.minutes)), Math.max(...reached.map((l) => l.minutes))].map((x) => Math.round(x * 10) / 10) : null,
    deaths, net: net === null ? null : Math.round(net), inBand: !why.length, reads: !why.length ? 'Good alone' : slow ? 'Slow alone' : 'outside the band: ' + why.join(', '), why };
}

/** Every card's ways played on `root` (a tree or a scratch copy): [{ card, label, way, lives, ...readWay }]. */
export async function playCards({ root = ROOT, seeds = 4 } = {}) {
  const { playLife } = await import('../balance-sim/life.mjs');
  const out = [];
  for (const [card, label, ways] of START_CARDS.cards) for (const way of ways) {
    const lives = [];
    for (let s = 0; s < seeds; s++) {
      const life = await playLife({ party: [way], policy: 'new', to: START_CARDS.toLevel, maxHours: 3, root, seedBase: 7000 + 100 * s });
      const at = life.miles['0:' + START_CARDS.toLevel], bank = at ? at.bank : life.bank[0];
      lives.push({ minutes: at ? Math.round(at.h * 600) / 10 : null, deaths: bank.deaths, net: Math.round(bank.coin + bank.loot - bank.store), ground: at ? at.ground : null });
    }
    out.push({ card, label, way, lives, ...readWay(lives) });
  }
  return out;
}

function selftest() {
  const fails = [];
  const check = (name, ok, why = '') => { console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ': ' + why)); if (!ok) fails.push(name); };
  const L = (minutes, deaths = 0, net = 100) => ({ minutes, deaths, net });
  check('inside the band reads Good alone', readWay([L(16), L(18), L(17), L(19)]).reads === 'Good alone');
  check('slower than 20 minutes reads Slow alone', readWay([L(24), L(26), L(25), L(23)]).reads === 'Slow alone');
  check('a life that never reaches Level 5 reads Slow alone', readWay([L(null), L(17), L(18), L(16)]).reads === 'Slow alone');
  check('a death or net gold under zero is outside the band, said by name', /death/.test(readWay([L(17, 1)]).reads) && /net gold/.test(readWay([L(17, 0, -5)]).reads));
  check('faster than 15 minutes is outside the band, not slow', /faster/.test(readWay([L(9), L(10)]).reads));
  check('every card names a STARTER_SETS row', START_CARDS.cards.length === 6 && START_CARDS.cards.every(([id, label, ways]) => id && label && ways.length));
  console.log('start-cards selftest: ' + (fails.length ? fails.length + ' FAILED' : 'green'));
  return fails.length ? 1 : 0;
}

async function main() {
  if (argv.includes('--selftest')) return selftest();
  const seeds = Number(arg('seeds', 4));
  if (!(Number.isInteger(seeds) && seeds > 0 && seeds <= 20)) { console.error('start-cards: --seeds is 1 to 20'); return 2; }
  const spec = arg('base', 'proposed');
  let root = ROOT, done = () => {}, name = 'today';
  if (spec !== 'today') {
    const { baseOf } = await import('./balance-matrix.mjs');
    const { plantScratch } = await import('./matrix-scratch.mjs');
    const base = await baseOf(spec, []);
    const s = await plantScratch(base.patch);
    root = s.root; done = s.done; name = base.name + ' (' + base.ids.join(', ') + ')';
  }
  let rows;
  try { rows = await playCards({ root, seeds }); } finally { done(); }
  console.log('CHECK C1, THE WEAPON CARDS (' + START_CARDS.source + ', ' + START_CARDS.status + '): one hero, start kit and start bar, the Mill Cellar on Normal, Level 1 to '
    + START_CARDS.toLevel + ', ' + seeds + ' lives a way, on ' + name + '. Band: Level ' + START_CARDS.toLevel + ' in ' + START_CARDS.minutes.join(' to ') + ' hunted minutes, no death, net gold at or over zero');
  console.log('  card                 way        minutes (median, range)   deaths  net gold  reads');
  for (const x of rows) console.log('  ' + x.label.padEnd(21) + x.way.padEnd(11) + ((x.minutes === null ? 'never' : String(x.minutes)) + (x.minutesRange ? ' (' + x.minutesRange.join(' to ') + ')' : '')).padEnd(26)
    + String(x.deaths).padStart(6) + String(x.net === null ? '-' : x.net).padStart(10) + '  ' + x.reads);
  if (arg('json')) writeFileSync(resolve(arg('json')), JSON.stringify({ check: 'C1', base: name, seeds, band: START_CARDS, rows }, null, 1) + '\n');
  return 0;
}

if (isMain(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
