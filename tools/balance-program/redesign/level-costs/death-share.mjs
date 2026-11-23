#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/level-costs/death-share.mjs — WHAT BOLD'S DEATHS COST AS A SHARE OF A DAY'S LEVEL XP
//   (lane/level-costs, backend-architect, 2026-11-22; the measurement behind 04-math-strategy.md section 5 "Built").
//
//   node tools/balance-program/redesign/v1-climb.mjs --seeds 6 --hours 10 --only base,high --risks steady,bold \
//     --start-from tools/balance-program/redesign/econ/l10-after-muster.json --json <report.json> --raw <raw.json>
//   node tools/balance-program/redesign/level-costs/death-share.mjs <raw.json>
//
// Reads v1-climb's --raw dump (each seed's heroes: Level, deaths, hunted hours, Level XP gained, Level XP a death took) and prints, per
// cell, the deaths a party-day, the Level XP the day's deaths took as a share of the four's gross Level XP, a death's cost in the hours
// table's hours at the Level (src/core/action-rules.js levelHourXp), and Bold's day against Steady's: gross, unblessed and blessed at the
// one Blessing's cut (src/data/blessings.js BLESSING.cutPm). The raw dump is the measurement; this file only reads it.
// Exit 0 printed · 2 a bad argument.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const file = process.argv[2];
if (!file) { console.error('death-share: give the v1-climb --raw dump'); process.exit(2); }
const raw = JSON.parse(readFileSync(file, 'utf8'));
const { levelHourXp } = await import(pathToFileURL(join(ROOT, 'src/core/action-rules.js')).href);
const { BLESSING } = await import(pathToFileURL(join(ROOT, 'src/data/blessings.js')).href);
const keep = 1 - BLESSING.cutPm / 1000;

const cells = {};
for (const [id, o] of Object.entries(raw)) (cells[id.split('#')[0]] = cells[id.split('#')[0]] || []).push(o);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const se = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1) / a.length) : 0; };
const read = {};
for (const [c, seeds] of Object.entries(cells)) {
  const rows = seeds.map((o) => {
    const xp = o.heroes.reduce((s, h) => s + h.levelXp, 0), lost = o.heroes.reduce((s, h) => s + h.xpLostLevel, 0);
    const deaths = o.heroes.reduce((s, h) => s + h.deaths, 0), L = o.heroes[0].level;
    return { xp, lost, deaths, L, hunted: o.heroes.reduce((s, h) => s + h.hours, 0) / o.heroes.length, perDeathH: deaths ? lost / deaths / levelHourXp(L) : null };
  });
  read[c] = rows;
  const share = rows.map((r) => r.lost / r.xp);
  console.log(c.padEnd(13) + ' L' + rows[0].L + '  deaths a party-day ' + mean(rows.map((r) => r.deaths)).toFixed(2) + '  hunted h a hero ' + mean(rows.map((r) => r.hunted)).toFixed(2)
    + '  deaths take ' + (100 * mean(rows.map((r) => r.lost)) / mean(rows.map((r) => r.xp))).toFixed(1) + '% of the day\'s Level XP (per seed ' + (100 * mean(share)).toFixed(1) + '% +- ' + (100 * se(share)).toFixed(1) + ' se)'
    + '  a death ' + rows.filter((r) => r.perDeathH !== null).map((r) => r.perDeathH.toFixed(2)).join(' / ') + ' h');
}
for (const v of new Set(Object.keys(cells).map((c) => c.split(':')[0]))) {
  const st = read[v + ':steady'], bo = read[v + ':bold'];
  if (!st || !bo) continue;
  const sx = mean(st.map((r) => r.xp)), bx = mean(bo.map((r) => r.xp)), bl = mean(bo.map((r) => r.lost));
  console.log(v.padEnd(6) + ' Bold over Steady, a 10 h day: gross ' + (bx / sx).toFixed(2) + ', unblessed ' + ((bx - bl) / sx).toFixed(2) + ', blessed at ' + BLESSING.cutPm / 10 + '% ' + ((bx - keep * bl) / sx).toFixed(2));
}
