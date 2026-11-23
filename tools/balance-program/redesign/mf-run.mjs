#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/mf-run.mjs — THE MONSTER FORMULA'S LAB RUN (lane/monster-formula; 04-math-strategy.md section 6).
//
//   node tools/balance-program/redesign/mf-run.mjs [--grounds muster,hasks,wing] [--seeds 6] [--hours 8] [--workers 6] [--only c0|mf]
//        [--lineups] [--parties] [--out tools/balance-program/redesign/mf]
//
// Plays the formula (the candidates mf-muster / mf-hasks / mf-wing: each ground's switch on, src/core/hunt/monster-formula.js) against
// today's monsters (C0, the tree) on the same dice, through tools/balance-program/redesign/v1-climb.mjs: the mixed four (hammer, bow,
// mage, healer) on Careful, Steady and Bold, held from the ground's band floor, at three Levels a ground:
//   muster   55 LOW kits (the fresh party at its entry: the band floor's reader), 60 and 70 MID
//   hasks    45 LOW, 52 and 60 MID
//   wing     165 LOW, 175 and 185 MID (the Bone Wing, staged)
// --lineups adds four lineups on Steady at the ground's reference Level (the w2 set: hammer-axes-bow-mage, hammer-bow-mage-healer,
// tank-bow-mage-healer, tank-hammer-bow-healer), so a mix that every lineup holds equally deep shows (04 section 6: it asks no question).
// Each run writes <out>/<label>.json and .txt; the summary is printed by tools/balance-program/redesign/mf-sum.mjs.
//
// Exit 0 ran · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const SEEDS = arg('seeds', '6'), HOURS = arg('hours', '8'), WORKERS = arg('workers', '6');
const OUT = resolve(ROOT, arg('out', 'tools/balance-program/redesign/mf'));
const ONLY = arg('only');
const GROUNDS = {
  muster: { ground: 'muster_barrows', cand: 'mf-muster', floor: 480, low: 55, mid: 60, top: 70 },
  hasks: { ground: 'hasks_ford', cand: 'mf-hasks', floor: 470, low: 45, mid: 52, top: 60 },
  wing: { ground: 'catacomb_bone_wing', cand: 'mf-wing', floor: 415, low: 165, mid: 175, top: 185 },
};
const LINEUPS = ['hammer,axes,bow,mage', 'hammer,bow,mage,healer', 'tank,bow,mage,healer', 'tank,hammer,bow,healer'];
const PARTIES = ['hammer', 'hammer,healer'];
const pick =(arg('grounds', 'muster,hasks,wing')).split(',');
mkdirSync(OUT, { recursive: true });

function run(label, args) {
  const json = join(OUT, label + '.json');
  process.stderr.write('mf-run: ' + label + '\n');
  const txt = execFileSync(process.execPath, [join(ROOT, 'tools/balance-program/redesign/v1-climb.mjs'), ...args, '--seeds', SEEDS, '--hours', HOURS, '--workers', WORKERS, '--json', json],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
  writeFileSync(join(OUT, label + '.txt'), txt);
}
for (const k of pick) {
  const g = GROUNDS[k];
  if (!g) { console.error('mf-run: no ground ' + k); process.exit(2); }
  for (const who of ['c0', 'mf']) {
    if (ONLY && ONLY !== who) continue;
    const cand = who === 'mf' ? ['--candidate', g.cand] : [];
    const base = ['--ground', g.ground, '--start', String(g.floor), ...cand];
    /* --skip-base: only the --parties / --lineups cells */
    if (!argv.includes('--skip-base')) {
      run(k + '-' + who + '-low', [...base, '--gear', 'low', '--level', String(g.low), '--only', 'base']);
      run(k + '-' + who + '-mid', [...base, '--gear', 'mid', '--level', String(g.mid), '--level2', String(g.top), '--only', 'base,high']);
    }
    /* --parties (04 section 8 encounterPerHero; 12-targets C-6, C-7): a lone hammer and a hammer with a healer on Steady at the reference
       Level, beside the four's base cell: a head's pay alone and in a pair against a head in the four */
    if (argv.includes('--parties')) for (const s of PARTIES) run(k + '-' + who + '-' + s.replace(/,/g, '-'), [...base, '--level', String(g.mid), '--styles', s, '--risks', 'steady', '--only', 'base']);
    if (argv.includes('--lineups')) for (const s of LINEUPS) run(k + '-' + who + '-' + s.replace(/,/g, '-'), [...base, '--level', String(g.mid), '--styles', s, '--risks', 'steady', '--only', 'base']);
  }
}
