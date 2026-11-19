#!/usr/bin/env node
// tools/balance-sim/yard-table.mjs — TRAINING PAYS ONE FIXED RATE, ON THE REAL SETTLE (the gate before ship; src/data/training.js).
//
// TYLER'S RULING (2026-11-14, final): "Training should also be the same RATE for every skill/level, not comparative to hunting grounds.
// The rate should be the same regardless of the characters skill or level", "i do not want it to cost stamina", "training with the
// weapon should be 2:1". The designer's numbers (PRIORITY_BOARD "2026-11-14 Training: one fixed rate, training items at 200%"): 30,000
// skill XP an hour, 60,000 with a training item, labelled 200%. This replaces the 0.40x-of-a-fitting-hunt gate the 11-13 spec had: the
// rate no longer reads hunting at all, so the gate is that the rate IS the rate, everywhere.
//
//   node tools/balance-sim/yard-table.mjs              the gate: every row, exit 1 if any reads off the rate
//   node tools/balance-sim/yard-table.mjs --table      also print the hunting comparison (each skill's best fitting hunt an hour against
//                                                      the two rates: where training crosses hunting; printed, never gated)
//   node tools/balance-sim/yard-table.mjs --selftest   the gate bites: a planted rate of 31,000, a per-blow pay and an item's extra paid to
//                                                      another skill each read red
//
// THE ROW: for each trained skill (Melee, Ranged, Magic, Defense), place (the yard, the house dummy) and point (Level 10 at skill 10, Level
// 30 at 30, Level 56 at 56, Level 110 at 80: the hammer career's main skill, PRIORITY_BOARD), ONE settled hour on the real engine
// (accrual.js accrueHunt, the measured kit, the server's xp carry: tests/hunt-core/fixtures/play-ground.mjs xpFrac) pays EXACTLY xpPerHour
// to the trained skill, and EXACTLY the item's rate with an hour of item time; nothing to any other skill, no Level XP, no coin, no item;
// and one long window pays what many short ones do (checked at the Level 30 point).
//
// Exit: 0 every row on the rate · 1 a row off it · 2 harness.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { isMain } from '../../tests/_is-main.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const HOUR = 3600000;
/** [Level, the trained skill's level]: the designer's four points. */
export const POINTS = Object.freeze([[10, 10], [30, 30], [56, 56], [110, 80]]);
export const ROLES = Object.freeze({ melee: 'melee_dps', ranged: 'ranger', magic: 'mage', defense: 'tank' });
const COMBAT = ['melee', 'ranged', 'magic', 'defense'];
/* THE RULING'S NUMBERS, held HERE and not read from the data: the gate checks that the data and the engine pay what Tyler ruled, so a
   change to the rate changes this line in the same commit, on purpose (the designer's 30,000; Tyler's "2:1" with the item). */
export const RATE = 30000;
export const ITEM_RATE = 60000;

/** The gate's rows on the tree at `root`: [{ skill, place, level, skillLevel, item, xp, want, other, levelXp, coin, items, cut }]. */
export async function yardTable(root, o = {}) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const { loadPlay } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
  const { run, memberKey } = await loadPlay(root);
  const G = await import(u('src/data/hunt-grounds.js'));
  const T = await import(u('src/data/training.js'));
  const XP = await import(u('src/core/xp.js'));
  const rows = [];
  for (const [level, sk] of o.points || POINTS) {
    for (const skill of o.skills || T.TRAINING_SKILLS) {
      for (const place of o.places || Object.keys(T.TRAINING_PLACES)) {
        for (const item of [false, true]) {
          const role = ROLES[skill];
          const id = T.trainingHuntId(place, skill);
          /* every combat skill at the Level, the trained one at its point (a career's main skill runs behind the Level past 56) */
          const start = () => ({ skills: Object.fromEntries(COMBAT.map((k) => [k, XP.skillXpForLevel(k, k === skill ? sk : level)])) });
          const play = (windowMs) => run(id, level, [role], { ground: G.TRAINING_GROUNDS[id], spanMs: HOUR, windowMs, xpFrac: true, start,
            session: { trainBoostMs: item ? HOUR : 0 } });
          const r = play(10 * 60000);
          const xp = r.heroXp[memberKey(role, 0)] || {};
          /* one long window against the ten-minute cut: at the Level 30 point (the cut is the same arithmetic at every point) */
          const cut = (o.cut !== false && level === 30) ? (play(HOUR).heroXp[memberKey(role, 0)] || {})[skill] : xp[skill];
          rows.push({ skill, place, level, skillLevel: sk, item, xp: xp[skill] || 0, want: item ? ITEM_RATE : RATE, playedMs: r.playedMs,
            other: Object.entries(xp).filter(([k, v]) => k !== skill && v > 0).map(([k, v]) => k + ' ' + v),
            levelXp: r.levelXp, coin: r.coin, items: Object.keys(r.items).length, cut });
        }
      }
    }
  }
  return rows;
}

const off = (rows) => rows.filter((r) => r.xp !== r.want || r.playedMs !== HOUR || r.other.length || r.levelXp || r.coin || r.items || r.cut !== r.xp);

function print(rows) {
  console.log('  skill    place  Level skill  item   XP an hour   want   one window   off');
  for (const r of rows) {
    const bad = off([r]).length;
    console.log('  ' + r.skill.padEnd(8) + r.place.padEnd(7) + String(r.level).padStart(5) + String(r.skillLevel).padStart(6) + (r.item ? '  200%' : '      ')
      + String(r.xp).padStart(12) + String(r.want).padStart(8) + String(r.cut).padStart(13) + (bad ? '   OFF ' + JSON.stringify({ other: r.other, levelXp: r.levelXp, coin: r.coin, items: r.items, played: r.playedMs }) : ''));
  }
}

/* THE HUNTING COMPARISON (printed only): each skill's best fitting hunt an hour, a lone hero at skill = Level, against the two rates. */
async function huntTable(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const { loadPlay } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
  const { run, memberKey } = await loadPlay(root);
  const G = await import(u('src/data/hunt-grounds.js'));
  const H = await import(u('src/data/hunts.js'));
  const T = await import(u('src/data/training.js'));
  const open = Object.keys(G.HUNT_GROUNDS).filter((g) => H.HUNT_INDEX[g] && H.HUNT_INDEX[g].staged !== true);
  const top = Math.max(...open.map((g) => H.HUNT_INDEX[g].band[1]));
  console.log('\n  THE HUNTING COMPARISON (printed, never gated): a lone hero\'s best fitting hunt an hour, skill = Level');
  console.log('  skill    Level   best hunt XP an hour            vs ' + T.trainingXpPerHour(false) + '   vs ' + T.trainingXpPerHour(true));
  for (const [level] of POINTS) {
    let fit = open.filter((g) => level >= H.HUNT_INDEX[g].band[0] && level <= H.HUNT_INDEX[g].band[1]);
    if (!fit.length) fit = open.filter((g) => H.HUNT_INDEX[g].band[1] === top);
    for (const skill of T.TRAINING_SKILLS) {
      const role = ROLES[skill];
      let best = 0, ground = null;
      for (const g of fit) {
        const x = run(g, level, [role], { spanMs: HOUR, xpFrac: true });
        const h = ((x.heroXp[memberKey(role, 0)] || {})[skill] || 0) * HOUR / Math.max(1, x.playedMs);
        if (h > best) { best = h; ground = g; }
      }
      const vs = (n) => (best >= n ? 'hunting ahead' : 'training ahead');
      console.log('  ' + skill.padEnd(8) + String(level).padStart(5) + '   ' + (String(Math.round(best)) + ' ' + ground).padEnd(32) + vs(T.trainingXpPerHour(false)).padEnd(16) + vs(T.trainingXpPerHour(true)));
    }
  }
}

async function selftest() {
  const { plant } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/h1.js')).href);
  const { PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
  const cases = [
    ['the clean tree reads green', [], false],
    ['a planted rate of 31,000 reads red', [['src/data/training.js', '  xpPerHour: 30000,', '  xpPerHour: 31000,']], true],
    ['a per-blow pay reads red', [['src/core/hunt-rewards.js', '  if (ctx.train) return trainingSwing(members, events, unitOf);\n', '']], true],
    ['an item\'s extra paid to another skill reads red', [['src/core/hunt/training.js', "  if (units > 0) call(m.fx, 'addFixedXp', train.skill, units / XP_FRAC_SCALE);",
      "  if (units > 0) call(m.fx, 'addFixedXp', hs.tally.boostMs > 0 && train.skill !== 'defense' ? 'defense' : train.skill, units / XP_FRAC_SCALE);"]], true],
  ];
  let bad = 0;
  for (const [name, edits, wantRed] of cases) {
    const { root, done } = plant(edits, PLAY_TREES);
    let rows;
    try { rows = await yardTable(root, { points: [[30, 30]], skills: ['melee', 'defense'], places: ['yard'], cut: false }); } finally { done(); }
    const red = off(rows).length > 0;
    console.log('  ' + (red === wantRed ? 'ok  ' : 'BAD ') + name + ': ' + rows.map((r) => r.skill + (r.item ? ' 200% ' : ' ') + r.xp + (r.other.length ? ' +' + r.other.join(',') : '')).join(', '));
    if (red !== wantRed) bad++;
  }
  console.log(bad ? 'yard-table --selftest: ' + bad + ' case(s) wrong' : 'yard-table --selftest: the gate reads green on the rate and red off it');
  process.exit(bad ? 1 : 0);
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const rows = await yardTable(ROOT);
  print(rows);
  if (process.argv.includes('--table')) await huntTable(ROOT);
  const o = off(rows);
  console.log(o.length ? 'yard-table: ' + o.length + ' of ' + rows.length + ' rows OFF the fixed rate (src/data/training.js xpPerHour, TRAINING_GEAR.boostPermille)'
    : 'yard-table: green, all ' + rows.length + ' rows pay exactly the fixed rate (and the item\'s), one skill, one window or many');
  process.exit(o.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
