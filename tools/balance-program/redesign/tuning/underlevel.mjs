#!/usr/bin/env node
// tools/balance-program/redesign/tuning/underlevel.mjs — A LONE UNDER-LEVEL HERO ON A FORMULA GROUND (lane/monster-roles-ford-wings, 2026-11-23;
// CONFLICTS 2026-11-23 "a money risk"): the play fixture's lone hero in its full own-tier set, Steady from step 0, against its own Level's
// tier ground, 2 hunted hours a cell: coin, Level XP and the store bill an hour.
//   node tools/balance-program/redesign/tuning/underlevel.mjs
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, resolve, dirname } from 'node:path';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const { loadPlay } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const P = await loadPlay(ROOT);
const H = 3600000;
const show = (name, x) => console.log(name.padEnd(36), 'kills', x.kills, 'coin/h', Math.round(x.totals.coin / (x.playedMs / H)), 'levelXp/h', Math.round(x.totals.levelXp / (x.playedMs / H)), 'store/h', Math.round(x.totals.store / (x.playedMs / H)), 'falls', x.totals.falls, 'ended', JSON.stringify(x.totals.ended), 'played h', (x.playedMs / H).toFixed(2));
for (const [hunt, L, plan] of [['hasks_ford', 12, { risk: 'steady', danger: 0 }], ['muster_barrows', 12, { risk: 'steady', danger: 0 }], ['meadowbrook_thicket', 12, null], ['mosslight_glade', 16, null], ['hasks_ford', 52, { risk: 'steady', danger: 570 }]]) {
  for (const role of ['melee_dps', 'ranger']) {
    const x = P.run(hunt, L, [role], { spanMs: 2 * H, fullSet: true, ...(plan ? { plan } : {}) });
    show(hunt + ' L' + L + ' ' + role + (plan ? ' scale' : ' tier'), x);
  }
}
