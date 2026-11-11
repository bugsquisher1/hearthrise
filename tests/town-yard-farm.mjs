#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// tests/town-yard-farm.mjs — THE TOWN IMPORT OF 2026-11-09: THE TRAINING YARD STILL SERVES ITS DUMMIES, THE FARM SHOWS WHAT THE SERVER SAYS, THE FIRES BURN.
//   src/data/world/stations.js DUMMIES, src/data/world/town/sites.js (the yard kit), src/world/town-farm.js, art/world/yard, the four in-place flames.
//
//   node tests/town-yard-farm.mjs             the guard
//   node tests/town-yard-farm.mjs --selftest  every planted defect must turn its arm red
//
// mutant-anchors: none — --selftest plants its own values
//
//   YF-DUMMIES  the training_yard station has 8 dummy props, each a ty_straw_dummy variant whose sprite is in the atlas with a `hit` clip, three stands to each
//   YF-CROPS    every crop of data/gathering.js has its four stages in the atlas, and the stage a plot shows is the server's: ready = ripe, else the share of the
//               growing time gone (thirds); an extra plot, an unknown crop and a plot past the town's twelve draw nothing; one answer, one list
//   YF-FIRES    the forge, the candle, the cauldron and the oven loop an idle clip at 8 fps in their own sets
//   YF-SAND     the sand pair is in the atlas and the blend, and the ground has sand cells
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { STATIONS, FARM_PLOTS } from '../src/data/world/stations.js';
import { CROPS } from '../src/data/gathering.js';
import { WEST } from '../src/data/world/town/plan.js';
import { BLEND } from '../src/data/world/town/sites.js';
import { GROUND_ROWS } from '../src/data/world/town/ground.js';
import { cropStage, farmCropProps } from '../src/world/town-farm.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const atlas = (set) => JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.json'), 'utf8'));

/** Every problem the town import has, from the given implementation and data (a mutant passes its own). */
export function problems(env) {
  const out = [];
  const bad = (arm, msg) => out.push(arm + ' ' + msg);
  const yard = env.yard;
  /* YF-DUMMIES */
  const station = env.stations.find((s) => s.id === 'training_yard');
  const dummies = station ? station.props.filter((p) => /^ty_straw_dummy/.test(p.id)) : [];
  if (!station || station.props.length !== 8 || dummies.length !== 8) bad('YF-DUMMIES', 'the training yard must have 8 dummy props, has ' + (station ? dummies.length + ' of ' + station.props.length : 'no station'));
  if (station && station.stands.length !== 24) bad('YF-DUMMIES', 'three fighters to a dummy: 24 stands, has ' + station.stands.length);
  for (const id of new Set(dummies.map((p) => p.id))) {
    const s = yard.sprites[id];
    if (!s) bad('YF-DUMMIES', id + ' is not in the yard atlas');
    else if (!s.anims.hit || !s.anims.hit.dirs.s || s.anims.hit.dirs.s.length < 4) bad('YF-DUMMIES', id + ' has no hit clip');
  }
  if (new Set(dummies.map((p) => p.id)).size < 3) bad('YF-DUMMIES', 'the yard must show the straw, helm and split dummies');
  /* YF-CROPS */
  for (const c of Object.keys(env.crops)) for (let k = 0; k < 4; k++) if (!yard.sprites['crop_' + c + '_' + k]) bad('YF-CROPS', 'crop_' + c + '_' + k + ' is not in the yard atlas');
  const hours = env.crops.tomato.hours * 3600;
  const stage = (o) => env.cropStage(Object.assign({ crop: 'tomato', ready: false, readyInS: hours, extra: false }, o));
  const want = [[{ ready: true, readyInS: 0 }, 3], [{ readyInS: hours }, 0], [{ readyInS: hours * 0.5 }, 1], [{ readyInS: hours * 0.1 }, 2], [{ readyInS: hours * 0.8 }, 0], [{ readyInS: hours * 0.4 }, 1], [{ crop: 'nope' }, null]];
  for (const [o, w] of want) if (stage(o) !== w) bad('YF-CROPS', 'a plot ' + JSON.stringify(o) + ' must show stage ' + w + ', shows ' + stage(o));
  const field = { plots: new Map([[0, { crop: 'tomato', ready: true, readyInS: 0, extra: false }], [1, { crop: 'turnip', ready: false, readyInS: 1, extra: true }], [2, { crop: 'wheat', ready: false, readyInS: 28800, extra: false }],
    [99, { crop: 'carrot', ready: true, readyInS: 0, extra: false }]]) };
  const props = env.farmCropProps(field);
  const [x0, y0, w0] = FARM_PLOTS[0];
  const first = props.filter((p) => p.id === 'crop_tomato_3');
  if (first.length !== w0 * 2) bad('YF-CROPS', 'plot 0 is ' + w0 + ' wide and 2 deep: ' + w0 * 2 + ' tomato tiles, has ' + first.length);
  if (!first.every((p) => p.x >= x0 + WEST && p.x < x0 + WEST + w0 && p.y >= y0 && p.y < y0 + 2)) bad('YF-CROPS', 'plot 0 tiles must lie on its plan rect shifted by WEST');
  if (props.some((p) => /turnip|carrot/.test(p.id))) bad('YF-CROPS', 'an extra plot or one past the town\'s plots must draw nothing');
  if (!props.some((p) => p.id === 'crop_wheat_0')) bad('YF-CROPS', 'a wheat plot at its full time left shows a sprout');
  if (env.farmCropProps(field) !== props) bad('YF-CROPS', 'one answer must give one list (the frame must not rebuild it)');
  if (env.farmCropProps(null).length !== 0) bad('YF-CROPS', 'no field draws no crop');
  /* YF-FIRES */
  for (const [set, id] of [['cottage', 'forge'], ['mill', 'candle'], ['havora', 'havora_cook_cauldron'], ['havora', 'havora_bread_oven']]) {
    const a = env.sets[set].sprites[id] && env.sets[set].sprites[id].anims.idle;
    if (!a || a.fps !== 8 || !a.loop || a.dirs.s.length < 4) bad('YF-FIRES', set + '/' + id + ' must loop an idle clip at 8 fps');
  }
  /* YF-SAND */
  if (!yard.terrain.havora_earth_sand) bad('YF-SAND', 'havora_earth_sand is not in the yard atlas');
  if (!BLEND.pairs.includes('havora_earth_sand')) bad('YF-SAND', 'the blend must list havora_earth_sand');
  if (!env.ground.some((r) => r.includes('S'))) bad('YF-SAND', 'the ground has no sand cell');
  return out;
}

const real = () => ({ yard: atlas('yard'), sets: { cottage: atlas('cottage'), mill: atlas('mill'), havora: atlas('havora') }, stations: STATIONS, crops: CROPS, cropStage, farmCropProps, ground: GROUND_ROWS });

function selftest() {
  const ok = problems(real());
  if (ok.length) { console.error('selftest: the clean control is red:\n  ' + ok.join('\n  ')); return 1; }
  const base = real();
  const mutants = {
    'a dummy goes missing': { stations: STATIONS.map((s) => (s.id === 'training_yard' ? Object.assign({}, s, { props: s.props.slice(1) }) : s)) },
    'every dummy is the one old sprite': { stations: STATIONS.map((s) => (s.id === 'training_yard' ? Object.assign({}, s, { props: s.props.map((p) => Object.assign({}, p, { id: 'ty_straw_dummy' })) }) : s)) },
    'a crop stage is lost': { yard: Object.assign({}, base.yard, { sprites: Object.fromEntries(Object.entries(base.yard.sprites).filter(([k]) => k !== 'crop_moonbloom_3')) }) },
    'the stage ignores the server ready flag': { cropStage: (p) => (p ? 2 : null) },
    'a ripe plot is drawn young': { cropStage: (p) => (p && p.ready ? 1 : cropStage(p)) },
    'the crops ignore WEST': { farmCropProps: (f) => farmCropProps(f).map((p) => Object.assign({}, p, { x: p.x - WEST })) },
    'an extra plot draws': { farmCropProps: (f) => !f ? farmCropProps(f) : farmCropProps({ plots: new Map(Array.from(f.plots, ([i, p]) => [i, Object.assign({}, p, { extra: false })])) }) },
    'the forge goes still': { sets: Object.assign({}, base.sets, { cottage: { sprites: Object.assign({}, base.sets.cottage.sprites, { forge: { anims: { idle: { fps: 0, loop: false, dirs: { s: [[0, 0]] } } } } }) } }) },
    'no sand in the ground': { ground: GROUND_ROWS.map((r) => r.replace(/S/g, '=')) },
  };
  let missed = 0;
  for (const [name, m] of Object.entries(mutants)) {
    const found = problems(Object.assign({}, base, m));
    if (found.length) console.log('  caught  ' + name + ' [' + found[0].split(' ')[0] + ']'); else { console.error('  MISSED  ' + name); missed++; }
  }
  if (missed) { console.error('town-yard-farm --selftest: ' + missed + ' planted defect(s) missed'); return 1; }
  console.log('town-yard-farm --selftest: all ' + Object.keys(mutants).length + ' planted defects caught; the clean control is silent');
  return 0;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  const found = problems(real());
  if (found.length) { console.error('town-yard-farm: RED\n  ' + found.join('\n  ')); process.exit(1); }
  console.log('town-yard-farm: green — 8 dummies (3 variants, each with a hit clip, 24 stands), 9 crops x 4 stages shown by the server\'s own plot data, 4 fires looping, the sand ring in the blend');
}
