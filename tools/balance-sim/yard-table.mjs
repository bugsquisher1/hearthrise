#!/usr/bin/env node
// tools/balance-sim/yard-table.mjs — THE TRAINING YARD AGAINST A FITTING HUNT, ON THE REAL SETTLE (the designer's gate before ship,
// PRIORITY_BOARD "2026-11-13 Combat training spec"; src/data/training.js).
//
//   node tools/balance-sim/yard-table.mjs              the gate: every row, exit 1 if any reads over the line
//   node tools/balance-sim/yard-table.mjs --quick      20-minute plays instead of an hour (a look, never the gate's record)
//   node tools/balance-sim/yard-table.mjs --selftest   the gate bites: a planted share far under the line reads green, one over it red
//
// THE ROW: for each trained skill (Melee, Ranged, Magic, Defense) at skill 10, 30 and 56 (a hero of that Level with every combat skill at
// it, the measured ladder kit: tests/hunt-core/fixtures/play-ground.mjs), the yard's skill XP an hour against the SAME hero's best skill XP
// an hour on a fitting ground (every open ground whose band holds its Level; past every band, the top one). The gate: the yard never pays
// more than LINE (0.40) of that hunt. Each line prints the ratio, and the largest share (permille) that skill's xpPermille could take and
// still hold the line at that row: the designer's dial.
//
// Exit: 0 every row under the line · 1 a row over it · 2 harness.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { isMain } from '../../tests/_is-main.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
export const LINE = 0.40;
export const LEVELS = Object.freeze([10, 30, 56]);
export const ROLES = Object.freeze({ melee: 'melee_dps', ranged: 'ranger', magic: 'mage', defense: 'tank' });

/** The table on the tree at `root`: [{ skill, level, yard, hunt, ground, ratio, pm, maxPm }]. */
export async function yardTable(root, o = {}) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const { loadPlay } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
  const { run } = await loadPlay(root);
  const G = await import(u('src/data/hunt-grounds.js'));
  const H = await import(u('src/data/hunts.js'));
  const T = await import(u('src/data/training.js'));
  const span = o.spanMs || 3600000;
  const open = Object.keys(G.HUNT_GROUNDS).filter((g) => H.HUNT_INDEX[g] && H.HUNT_INDEX[g].staged !== true);
  const top = Math.max(...open.map((g) => H.HUNT_INDEX[g].band[1]));
  const rows = [];
  for (const level of o.levels || LEVELS) {
    let fit = open.filter((g) => level >= H.HUNT_INDEX[g].band[0] && level <= H.HUNT_INDEX[g].band[1]);
    if (!fit.length) fit = open.filter((g) => H.HUNT_INDEX[g].band[1] === top);
    for (const skill of o.skills || T.TRAINING_SKILLS) {
      const role = ROLES[skill];
      const id = T.trainingHuntId('yard', skill);
      const y = run(id, level, [role], { ground: G.TRAINING_GROUNDS[id], spanMs: span, windowMs: 600000 });
      const yard = ((y.heroXp[role + '0'] || {})[skill] || 0) * 3600000 / Math.max(1, y.playedMs);
      let best = 0, ground = null;
      for (const g of fit) {
        const x = run(g, level, [role], { spanMs: span });
        const h = ((x.heroXp[role + '0'] || {})[skill] || 0) * 3600000 / Math.max(1, x.playedMs);
        if (h > best) { best = h; ground = g; }
      }
      const pm = T.TRAINING_RULES.xpPermille[skill];
      const ratio = best > 0 ? yard / best : Infinity;
      rows.push({ skill, level, yard: Math.round(yard), hunt: Math.round(best), ground, ratio, pm, maxPm: ratio > 0 && Number.isFinite(ratio) ? Math.floor(pm * LINE / ratio) : null });
    }
  }
  return rows;
}

const over = (rows) => rows.filter((r) => !(r.ratio <= LINE));

function print(rows) {
  console.log('  skill    skill  yard XP/h  best fitting hunt          ratio  share (pm)  most it could take');
  for (const r of rows) {
    console.log('  ' + r.skill.padEnd(8) + String(r.level).padStart(5) + String(r.yard).padStart(11) + '  ' + (String(r.hunt) + ' ' + r.ground).padEnd(26)
      + r.ratio.toFixed(3).padStart(6) + (r.ratio > LINE ? ' OVER' : '     ') + String(r.pm).padStart(7) + String(r.maxPm).padStart(16));
  }
}

async function selftest() {
  const { plant } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/h1.js')).href);
  const { PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
  const SHARE = 'xpPermille: Object.freeze({ melee: 350, ranged: 350, magic: 350, defense: 350 }),';
  const cases = [
    ['a share far under the line reads green', SHARE.replace(/350/g, '60'), false],
    ['a share far over the line reads red', SHARE.replace(/350/g, '1000'), true],
  ];
  let bad = 0;
  for (const [name, to, wantRed] of cases) {
    const { root, done } = plant([['src/data/training.js', SHARE, to]], PLAY_TREES);
    let rows;
    try { rows = await yardTable(root, { levels: [30], skills: ['melee', 'defense'], spanMs: 20 * 60000 }); } finally { done(); }
    const red = over(rows).length > 0;
    console.log('  ' + (red === wantRed ? 'ok  ' : 'BAD ') + name + ': ' + rows.map((r) => r.skill + ' ' + r.ratio.toFixed(3)).join(', '));
    if (red !== wantRed) bad++;
  }
  console.log(bad ? 'yard-table --selftest: ' + bad + ' case(s) wrong' : 'yard-table --selftest: the gate reads green under the line and red over it');
  process.exit(bad ? 1 : 0);
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const rows = await yardTable(ROOT, process.argv.includes('--quick') ? { spanMs: 20 * 60000 } : {});
  print(rows);
  const o = over(rows);
  console.log(o.length ? 'yard-table: ' + o.length + ' of ' + rows.length + ' rows OVER ' + LINE + 'x a fitting hunt (the designer\'s dial: src/data/training.js xpPermille)'
    : 'yard-table: green, every row at or under ' + LINE + 'x a fitting hunt');
  process.exit(o.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
