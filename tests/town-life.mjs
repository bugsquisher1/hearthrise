#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// tests/town-life.mjs — HAVORA BREATHES: SMOKE FROM ITS CHIMNEYS, SPARKS FROM THE HEARTH, DAYLIGHT ON ITS WATER (display only).
//   src/data/world/ambient-life.js (what), src/world/core/ambient.js (where and when), compose.js (in which layer),
//   tools/world-art/town-life.mjs -> assets/world/atlas-townlife (the art). Tyler 2026-11-16: "it doesn't feel 'alive' what so ever."
//
//   node tests/town-life.mjs             the guard
//   node tests/town-life.mjs --selftest  every planted defect must turn its arm red
//
// mutant-anchors: none — --selftest plants its own values
//
//   TL-SMOKE  every placed sprite with emitters gives exactly its loops, each at the sprite's own placement plus its point, and
//             that point is on the sprite's art (an opaque pixel at or just under it: a chimney's mouth, not the sky beside it)
//   TL-WATER  the town's glints lie only where a cell and its eight neighbours are water, never under anything placed, never two
//             touching, at a density a player reads as light on water (8-22% of the open water's cells); a map that does not
//             name the surface lays none; the same row lays the same life twice
//   TL-BEAT   every clip it names is in the townlife atlas with an idle loop whose rate divides LIFE_BEAT_FPS, the Hearth fire's
//             own (frames that turn together are one paint: tests/perf-budget.mjs town paints)
//   TL-DRAW   a frame of the town draws them where they belong: the water light first among the standing (under every unit),
//             smoke and sparks last among the raised (over the roofs, under the light), never with the effects (an effect is
//             named for a phone's first view even off screen: client-boot B-21); nothing past compose's margin;
//             each loop advances one frame per beat from its own phase, so the chimneys never puff in step
//   TL-FOLK   the townsfolk (src/data/world/town/folk.js, src/world/town-folk.js): each in a body of its own from art/world/townsfolk
//             (never a hero's outfit: the Quarry Brute in six dyes read as one man in six shirts), never shared, never dyed (a dye
//             pulls the colour masks into the town), with idle and walk in all eight facings (a walker paths in eight);
//             every stop open, reached from the town's start, never a station stand or an exit; a path between stops; over a
//             whole loop each changes only on FOLK_TICK_HZ and stands on whole art px (a walker costs that many paints a
//             second, never the frame rate), reaches every stop, walks at most 40% of its loop (work in bursts, not pacing),
//             carries no name plate and is never a player; only a map with townsfolk gets them
//   TL-TURN   a turning piece (the mill's waterwheel) is its building's own pixels: frame 0 is the art, every frame its outline
//   TL-SWAY   a banner or an awning is drawn as its twin: the same class, frame, anchor and footprint, frame 0 its art exactly,
//             no pixel more than 2 px from where the art had it, on the half beat, each placed one from its own frame
//             A still twin (P02 with its hens and goat cut out): its stirring pieces at rest over it are the art exactly
//   TL-STIR   each stirring piece moves, and never draws a colour the art has nowhere within 2 px
//   TL-BUMP   the Hearth Chest jolts now and then (Tyler 2026-11-17, "like something is trying to get out"): the chest, its light and its
//             smoke each have a bump clip and loop in step on one seat; bumps fall 8-21 s apart on the page's own seed (two pages never
//             in step, none with no seed), play their whole clip from a loop's start, and draw on every layer at once, never with the
//             player's Idle animations off
//   TL-GLANCE a keeper standing at her work (Tamsin at her board, the smith) looks about: every face her idle clip has, turning
//             on the beat, and the frame drawn is the face of the moment
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { decodePNG } from '../tools/world-art/png.mjs';
import { createBook } from '../src/world/core/book.js';
import { compileMap } from '../src/world/core/map-compile.js';
import { composeFrame } from '../src/world/core/compose.js';
import { lifeOf, lifeDraws, glanceOf, swayOf, bumpAt } from '../src/world/core/ambient.js';
import { CHEST_LAYERS } from '../src/data/world/town/sites.js';
import { WORLD_MAPS } from '../src/data/world/maps/index.js';
import { MATERIALS, OPEN_CLASSES, LIGHTS } from '../src/data/world/terrain.js';
import { ATLAS_SETS } from '../src/data/world/atlas-sets.js';
import { EMITTERS, SURFACES, LIFE_BEAT_FPS, GLANCES, SWAYS } from '../src/data/world/ambient-life.js';
import { FOLK, FOLK_TICK_HZ } from '../src/data/world/town/folk.js';
import { createTownFolk, folkExtras } from '../src/world/town-folk.js';
import { STATIONS } from '../src/data/world/stations.js';
import { reachFrom } from '../src/world/core/path.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = (set) => JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.json'), 'utf8'));
const MANIFESTS = Object.fromEntries(ATLAS_SETS.map((s) => [s, manifest(s)]));
const sheets = new Map();
const sheet = (set) => { if (!sheets.has(set)) sheets.set(set, decodePNG(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.png')))); return sheets.get(set); };
const TOWN = WORLD_MAPS.find((m) => m.id === 'town_common');
/* the harbour (open sea, the fishing pier) and Hearth Square's north side (the flue, the fire): two views a player stands in */
const VIEWS = Object.freeze({ harbour: [149, 86], hearth: [141, 41] });
/* a 24 x 24 meadow round a 16 x 16 pond, as a map row (map-compile.js ROW SHAPE) */
const POND = Object.freeze({ id: 'pond', name: 'Pond', kind: 'town', hunts: [], outdoor: true, light: 'day', ground: null, legend: { '.': 'grass', '~': 'water' },
  rows: Array.from({ length: 24 }, (_, y) => Array.from({ length: 24 }, (_, x) => (x >= 4 && x < 20 && y >= 4 && y < 20 ? '~' : '.')).join('')), objects: [], start: [1, 1] });

/** Every problem the town's life has, from the given implementation and data (a mutant passes its own). */
export function problems(env) {
  const out = [];
  const bad = (arm, msg) => out.push(arm + ' ' + msg);
  const book = createBook(env.manifests);
  const tables = { materials: MATERIALS, sprites: book.sprites, openClasses: OPEN_CLASSES, lights: LIGHTS };
  const compile = (row) => { const m = compileMap(row, tables); m.life = env.lifeOf(row, m.objects, m.ground, book.sprites, m.w, m.h, m.T); return m; };
  const town = compile(env.town);
  const T = town.T;

  /* TL-SMOKE */
  const loops = town.life.filter((a) => !/^water_/.test(a.id));
  let want = 0;
  for (const o of town.objects) {
    const list = env.emitters[o.id];
    if (!list) continue;
    const s = book.sprite(o.id);
    const bx = o.x * T + Math.floor((o.fw * T) / 2) - s.anchor[0], by = o.y * T + o.fh * T - 1 - s.anchor[1];
    const f = book.frame(o.id, Object.keys(s.anims)[0], 's', 0);
    const img = sheet(f.set);
    const opaque = (x, y) => x >= 0 && y >= 0 && x < f.w && y < f.h && img.data[((f.sy + y) * img.width + f.sx + x) * 4 + 3] >= 128;
    for (const e of list) {
      want++;
      const px = bx + e.at[0], py = by + e.at[1];
      if (!loops.some((a) => a.id === e.clip && a.px === px && a.py === py)) bad('TL-SMOKE', o.id + ' at ' + o.x + ',' + o.y + ': its ' + e.clip + ' is not at its point (' + px + ',' + py + ')');
      /* smoke and sparks rise from the art itself (a turning or stirring piece is held to its pixels by TL-TURN, TL-SWAY) */
      let on = !['plume', 'vfx'].includes(book.sprite(e.clip).class);
      for (let dy = -1; dy <= 4 && !on; dy++) on = opaque(e.at[0], e.at[1] + dy);
      if (!on) bad('TL-SMOKE', o.id + ': the ' + e.clip + ' point ' + e.at.join(',') + ' is not on the sprite\'s art (no opaque pixel at or under it)');
    }
  }
  if (loops.length !== want) bad('TL-SMOKE', 'the town lays ' + loops.length + ' smoke and spark loops, its placed emitters name ' + want);
  for (const id of ['hearth_smoke', 'hearth_embers']) if (!loops.some((a) => a.id === id)) bad('TL-SMOKE', 'the Great Hearth gives off no ' + id);

  /* TL-WATER */
  const glints = town.life.filter((a) => /^water_glint/.test(a.id));
  const flowIds = new Set(env.surfaces.water.flows.map(([id]) => id));
  const flows = town.life.filter((a) => flowIds.has(a.id));
  const water = (x, y) => x >= 0 && y >= 0 && x < town.w && y < town.h && town.ground[y * town.w + x] === 'water';
  const covered = new Uint8Array(town.w * town.h);
  for (const o of town.objects) {
    const s = book.sprite(o.id);
    if (!s.anchor || !s.frame) continue;
    const bx = o.x * T + Math.floor((o.fw * T) / 2) - s.anchor[0], by = o.y * T + o.fh * T - 1 - s.anchor[1];
    for (let y = Math.max(0, Math.floor(by / T)); y <= Math.min(town.h - 1, Math.floor((by + s.frame[1] - 1) / T)); y++) {
      for (let x = Math.max(0, Math.floor(bx / T)); x <= Math.min(town.w - 1, Math.floor((bx + s.frame[0] - 1) / T)); x++) covered[y * town.w + x] = 1;
    }
  }
  let open = 0;
  for (let y = 0; y < town.h; y++) for (let x = 0; x < town.w; x++) {
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) ok = water(x + dx, y + dy);
    if (ok) open++;
  }
  const cells = new Set();
  for (const g of glints) {
    const x = Math.floor(g.px / T), y = Math.floor(g.py / T);
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) ok = water(x + dx, y + dy);
    if (!ok) { bad('TL-WATER', 'a glint at cell ' + x + ',' + y + ' is not in open water (a bank, a quay or dry ground beside it)'); continue; }
    if (covered[y * town.w + x]) bad('TL-WATER', 'a glint at cell ' + x + ',' + y + ' lies under something placed over the water');
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (cells.has((x + dx) + ',' + (y + dy))) bad('TL-WATER', 'two glints touch at ' + x + ',' + y);
    cells.add(x + ',' + y);
  }
  /* the ripples: one on every open cell not under anything placed, all in step, at the cell's corner */
  let openUncovered = 0;
  for (let y = 0; y < town.h; y++) for (let x = 0; x < town.w; x++) {
    let ok = !covered[y * town.w + x];
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) ok = water(x + dx, y + dy);
    if (ok) openUncovered++;
  }
  const rippled = new Map();
  for (const a of flows) {
    const n = book.sprite(a.id).frame[0] / T, x0 = a.px / T, y0 = a.py / T;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) rippled.set((x0 + i) + ',' + (y0 + j), (rippled.get((x0 + i) + ',' + (y0 + j)) || 0) + 1);
  }
  let off = 0, twice = 0;
  for (const [k, c] of rippled) {
    const [x, y] = k.split(',').map(Number);
    if (c > 1) twice++;
    if (!Number.isInteger(x) || !Number.isInteger(y) || covered[y * town.w + x] || ![-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => water(x + dx, y + dy)))) off++;
  }
  if (off) bad('TL-WATER', off + ' ripple cell(s) off open water (a bank, a quay, under something placed)');
  if (twice) bad('TL-WATER', twice + ' cell(s) rippled twice');
  if (rippled.size !== openUncovered) bad('TL-WATER', rippled.size + ' rippled cells for ' + openUncovered + ' open water cells');
  /* the draws: the open sea takes the big tile */
  if (flows.length > openUncovered / 2) bad('TL-WATER', flows.length + ' ripple tiles for ' + openUncovered + ' cells: the open water is drawn a cell at a time');
  if (flows.some((a) => a.phase !== flows[0].phase)) bad('TL-WATER', 'the ripples are not in step (the surface would tear at cell edges)');
  const share = open ? glints.length / open : 0;
  if (!(share >= 0.08 && share <= 0.22)) bad('TL-WATER', 'glints on ' + (share * 100).toFixed(1) + '% of the open water (want 8-22%: sparse reads as dead, dense as noise)');
  if (JSON.stringify(compile(env.town).life) !== JSON.stringify(town.life)) bad('TL-WATER', 'the same row laid different life twice');
  /* no shipped map but the town has 'water' ground (the grounds' brooks and the sewer's sewage are their own), so a pond stands in: lit when it asks, dark when not */
  const pondLit = compile(Object.assign({}, POND, { life: ['water'] })).life.length, pondDark = compile(POND).life.length;
  if (!pondLit) bad('TL-WATER', 'a pond that names water lays no glints');
  if (pondDark) bad('TL-WATER', 'a pond that names no surface lays ' + pondDark + ' glints');

  /* TL-BEAT */
  const ids = new Set([...Object.values(env.emitters).flatMap((l) => l.map((e) => e.clip)), ...Object.values(env.surfaces).flatMap((s) => s.clips)]);
  const life = env.manifests.townlife || { sprites: {} };
  for (const id of ids) {
    const s = life.sprites[id];
    const fps = s && s.anims && s.anims.idle && s.anims.idle.fps;
    if (!s) { bad('TL-BEAT', id + ' is not in the townlife atlas'); continue; }
    if (!fps || !s.anims.idle.loop || LIFE_BEAT_FPS % fps !== 0) bad('TL-BEAT', id + ' turns at ' + fps + ' fps, off the ' + LIFE_BEAT_FPS + ' fps beat');
  }
  const fire = env.manifests.hearth.sprites.hearth_fire;   /* the Great Hearth's own set (2026-11-17) */
  if (!fire || fire.anims.idle.fps !== LIFE_BEAT_FPS) bad('TL-BEAT', 'the Great Hearth fire is no longer on the beat (' + (fire && fire.anims.idle.fps) + ' fps): LIFE_BEAT_FPS follows it');

  /* TL-DRAW */
  const t0 = 5_000_000;
  for (const [name, [hx, hy]] of Object.entries(VIEWS)) {
    const view = { ox: (hx + 0.5) * T - 480, oy: (hy + 0.5) * T - 270, w: 960, h: 540 };
    const list = env.composeFrame(town, book, { t: t0, hero: { x: hx, y: hy } }, view, tables, T);
    /* kept as compose.js keeps the standing and the raised: two tiles round the view */
    const inView = town.life.filter((a) => { const s = book.sprite(a.id); const m = 2 * T; const x = a.px - s.anchor[0], y = a.py - s.anchor[1]; return x < view.ox + view.w + m && y < view.oy + view.h + m && x + s.frame[0] > view.ox - m && y + s.frame[1] > view.oy - m; });
    const drawn = [...list.sprites, ...list.raised].filter((d) => d.kind === 'life').length;
    if (drawn !== inView.length) bad('TL-DRAW', name + ': ' + drawn + ' life loops drawn, ' + inView.length + ' in view');
    const firstOther = list.sprites.findIndex((d) => d.kind !== 'life');
    const lastGlint = list.sprites.map((d) => d.kind === 'life').lastIndexOf(true);
    if (lastGlint > firstOther && firstOther >= 0) bad('TL-DRAW', name + ': water light drawn over something standing (sprite ' + lastGlint + ' after ' + firstOther + ')');
    if (list.sprites.some((d) => d.kind === 'life' && !/^water_/.test(d.id))) bad('TL-DRAW', name + ': smoke or sparks drawn among the standing');
    const lastRoof = list.raised.map((d) => d.kind !== 'life').lastIndexOf(true);
    const firstSmoke = list.raised.findIndex((d) => d.kind === 'life');
    if (firstSmoke >= 0 && firstSmoke < lastRoof) bad('TL-DRAW', name + ': smoke drawn under a roof or a rock top');
    if (list.raised.some((d) => d.kind === 'life' && /^water_/.test(d.id))) bad('TL-DRAW', name + ': water light drawn in the air');
    /* an effect is named for the first view wherever compose drew it, the overscan included (tests/client-boot.mjs B-21): life never is one */
    if (list.fx.some((e) => ids.has(e.id))) bad('TL-DRAW', name + ': life drawn with the effects (after the light, and holding a first view for its sheet off screen)');
    if (name === 'hearth' && !list.raised.some((d) => d.id === 'hearth_embers')) bad('TL-DRAW', 'hearth: the sparks are not drawn in the air');
  }
  /* one frame per beat from its own phase */
  const view = { ox: 0, oy: 0, w: town.w * T, h: town.h * T };
  const at = (t) => env.lifeDraws(town, book, t, view, T);
  const a = at(t0), b = at(t0 + 1000 / LIFE_BEAT_FPS);
  const key = (d) => d.sx + ',' + d.sy;
  const chimneys = (l) => l.air.filter((d) => d.id === 'chimney_smoke').map(key);
  const smokeA = chimneys(a), smokeB = chimneys(b);
  if (!smokeA.length) bad('TL-DRAW', 'no smoke drawn over the whole town');
  if (smokeA.some((k, i) => k === smokeB[i])) bad('TL-DRAW', 'a chimney\'s smoke did not turn in one beat');
  if (new Set(smokeA).size < Math.min(4, smokeA.length)) bad('TL-DRAW', 'the chimneys puff in step (' + new Set(smokeA).size + ' different frames across ' + smokeA.length + ')');

  /* TL-FOLK */
  const rows = env.folk[town.id] || [];
  if (rows.length < 2) bad('TL-FOLK', 'the town has ' + rows.length + ' townsfolk');
  const stands = new Set(STATIONS.flatMap((s) => (s.stands || []).map(([x, y]) => x + ',' + y)));
  const exits = new Set(town.exits.map((e) => e.x + ',' + e.y));
  const reach = reachFrom(town.mask, town.w, town.h, town.start);
  const FACES = ['s', 'e', 'n', 'w', 'se', 'sw', 'ne', 'nw'], wornBy = new Map();
  for (const r of rows) {
    const s = book.sprite(r.body);
    if (!s.anims || !s.anims.idle || !s.anims.walk) bad('TL-FOLK', r.id + ': its body ' + r.body + ' has no idle and walk clips');
    else {
      const short = FACES.filter((d) => !(s.anims.idle.dirs || {})[d] || !(s.anims.walk.dirs || {})[d]);
      if (short.length) bad('TL-FOLK', r.id + ': its body ' + r.body + ' has no idle or walk facing ' + short.join(', ') + ' (a walker paths in eight directions)');
    }
    if (book.frame(r.body).set !== 'townsfolk') bad('TL-FOLK', r.id + ': its body ' + r.body + ' is not a townsperson of its own (art/world/townsfolk)');
    if (r.dye !== undefined) bad('TL-FOLK', r.id + ': its body ' + r.body + ' is dyed ' + r.dye + ' (a dye pulls the colour masks into the town)');
    if (wornBy.has(r.body)) bad('TL-FOLK', r.id + ' wears the body of ' + wornBy.get(r.body) + ', ' + r.body);
    wornBy.set(r.body, r.id);
    for (const [x, y] of r.route) {
      const k = x + ',' + y, i = y * town.w + x;
      if (town.mask[i] || !reach[i]) bad('TL-FOLK', r.id + ': its stop ' + k + ' is not an open tile the town reaches');
      if (stands.has(k)) bad('TL-FOLK', r.id + ': its stop ' + k + ' is a station stand (a hero is set down there)');
      if (exits.has(k)) bad('TL-FOLK', r.id + ': its stop ' + k + ' is a way out of town');
    }
  }
  const folk = env.createTownFolk(town, book.sprites, rows);
  const TICK = 1000 / FOLK_TICK_HZ;
  for (const [n, l] of folk.loops().entries()) {
    const r = rows[n];
    const walked = l.legs.filter((g) => g.walk).reduce((a, g) => a + g.ms, 0);
    if (walked / l.loop > 0.4) bad('TL-FOLK', r.id + ' walks ' + Math.round((100 * walked) / l.loop) + '% of its loop (work in bursts: at most 40%)');
    for (const g of l.legs) if (g.walk && (g.pts.length < 2 || Math.hypot(g.pts[g.pts.length - 1][0] - g.pts[0][0], g.pts[g.pts.length - 1][1] - g.pts[0][1]) === 0)) bad('TL-FOLK', r.id + ': a walk with no path');
  }
  const loopMs = Math.max(...folk.loops().map((l) => l.loop));
  let last = null, changes = 0, offTick = 0;
  const seen = rows.map(() => new Set());
  for (let t = t0; t < t0 + loopMs + 1000; t += 1000 / 60) {
    const units = folk.frame(t);
    const sig = JSON.stringify(units);
    if (last !== null && sig !== last) { changes++; const q = Math.floor(t / TICK) * TICK; if (t - q >= 1000 / 60) offTick++; }
    last = sig;
    units.forEach((u, i) => {
      seen[i].add(Math.round(u.x) + ',' + Math.round(u.y));
      if (Math.abs(u.x * T - Math.round(u.x * T)) > 1e-6 || Math.abs(u.y * T - Math.round(u.y * T)) > 1e-6) bad('TL-FOLK', rows[i].id + ' off the art px grid at ' + u.x + ',' + u.y);
      if (u.plate) bad('TL-FOLK', rows[i].id + ' carries a name plate');
      if (u.ref && u.ref.player) bad('TL-FOLK', rows[i].id + ' is drawn as a player');
    });
  }
  if (offTick) bad('TL-FOLK', 'the townsfolk changed between ticks ' + offTick + ' time(s): a walker would cost the frame rate');
  if (changes / ((loopMs + 1000) / 1000) > FOLK_TICK_HZ) bad('TL-FOLK', 'the townsfolk changed ' + changes + ' times in ' + Math.round(loopMs / 1000) + ' s, over ' + FOLK_TICK_HZ + ' a second');
  rows.forEach((r, i) => { for (const [x, y] of r.route) if (!seen[i].has(x + ',' + y)) bad('TL-FOLK', r.id + ' never reaches its stop ' + x + ',' + y); });
  if (!env.folkExtras(town, book.sprites).units) bad('TL-FOLK', 'the walk scene of the town gets no townsfolk');
  const cellar = compile(WORLD_MAPS.find((m) => m.id === 'mill_cellar'));
  if (env.folkExtras(cellar, book.sprites).units) bad('TL-FOLK', 'a map with no townsfolk gets them');

  /* TL-TURN: a turning piece is its building's own pixels: frame 0 is the art exactly, every frame keeps the art's outline, and it turns */
  for (const [host, list] of Object.entries(env.emitters)) for (const e of list) {
    const s = book.sprite(e.clip);
    if (s.class !== 'turning') continue;
    const hf = book.frame(host, Object.keys(book.sprite(host).anims)[0], 's', 0), himg = sheet(hf.set);
    const hp = (x, y) => { const i = ((hf.sy + y) * himg.width + hf.sx + x) * 4; return himg.data[i + 3] >= 128 ? himg.data[i] + ',' + himg.data[i + 1] + ',' + himg.data[i + 2] : null; };
    const n = book.frames(e.clip, 'idle', 's');
    const keys = new Set();
    for (let i = 0; i < n; i++) {
      const f = book.frame(e.clip, 'idle', 's', i), img = sheet(f.set);
      let outline = 0, art = 0, key = '';
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
        const k = ((f.sy + y) * img.width + f.sx + x) * 4, mine = img.data[k + 3] >= 128 ? img.data[k] + ',' + img.data[k + 1] + ',' + img.data[k + 2] : null;
        const theirs = hp(e.at[0] + x, e.at[1] + y);
        if (!!mine !== !!theirs) outline++;
        if (i === 0 && mine !== theirs) art++;
        key += mine || '.';
      }
      keys.add(key);
      if (outline) bad('TL-TURN', e.clip + ' frame ' + i + ' leaves its ' + host + ' outline at ' + outline + ' px');
      if (art) bad('TL-TURN', e.clip + ' frame 0 is not the ' + host + ' art at its point (' + art + ' px differ)');
    }
    if (keys.size < 2) bad('TL-TURN', e.clip + ' never turns');
  }

  /* TL-SWAY */
  const px = (id, i) => { const f = book.frame(id, Object.keys(book.sprite(id).anims)[0], 's', i), img = sheet(f.set);
    return (x, y) => { const k = ((f.sy + y) * img.width + f.sx + x) * 4; return img.data[k + 3] >= 128 ? img.data[k] + ',' + img.data[k + 1] + ',' + img.data[k + 2] : null; }; };
  for (const [orig, twin] of Object.entries(env.sways)) {
    const a = book.sprite(orig), b = book.sprite(twin);
    if (!book.has(twin)) { bad('TL-SWAY', twin + ' is not in the atlas'); continue; }
    if (a.class !== b.class || String(a.frame) !== String(b.frame) || String(a.anchor) !== String(b.anchor) || String(a.footprint) !== String(b.footprint)) bad('TL-SWAY', twin + ' is not drawn like ' + orig + ' (class, frame, anchor or footprint)');
    const fps = b.anims && b.anims.idle && b.anims.idle.fps;
    if (!fps || LIFE_BEAT_FPS % fps !== 0) bad('TL-SWAY', twin + ' turns off the beat (' + fps + ' fps)');
    const art = px(orig, 0), n = book.frames(twin, 'idle', 's');
    if (n === 1) {
      /* A STILL TWIN (its animals cut out): its pieces at frame 0 laid over it are the art exactly, and it lacks every piece pixel */
      const pieces = (env.emitters[orig] || []).filter((e) => book.has(e.clip) && book.sprite(e.clip).class === 'stir');
      if (!pieces.length) bad('TL-SWAY', twin + ' is still but nothing stirs over it');
      const tw = px(twin, 0), over = new Map();
      for (const e of pieces) {
        const f = book.frame(e.clip, 'idle', 's', 0), fp = px(e.clip, 0);
        for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const c = fp(x, y); if (c) over.set((e.at[0] + x) + ',' + (e.at[1] + y), c); }
      }
      let miss = 0, kept = 0;
      for (let y = 0; y < a.frame[1]; y++) for (let x = 0; x < a.frame[0]; x++) {
        const k = x + ',' + y, c = over.has(k) ? over.get(k) : tw(x, y);
        if (c !== art(x, y)) miss++;
        if (over.has(k) && tw(x, y)) kept++;
      }
      if (miss) bad('TL-SWAY', twin + ' with its pieces at rest is not the art of ' + orig + ' (' + miss + ' px)');
      if (kept) bad('TL-SWAY', twin + ' keeps ' + kept + ' px of a piece that moves (it would show twice)');
      for (const e of pieces) {
        const m = book.frames(e.clip, 'idle', 's'), seen = new Set();
        for (let i = 0; i < m; i++) {
          const f = book.frame(e.clip, 'idle', 's', i), fp = px(e.clip, i);
          let key = '', far = 0;
          for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const c = fp(x, y); key += c || '.'; if (c && ![-2, -1, 0, 1, 2].some((dy) => [-2, -1, 0, 1, 2].some((dx) => art(e.at[0] + x + dx, e.at[1] + y + dy) === c))) far++; }
          seen.add(key);
          if (far) bad('TL-STIR', e.clip + ' frame ' + i + ' has ' + far + ' px the art has nowhere near');
        }
        if (seen.size < 2) bad('TL-STIR', e.clip + ' never stirs');
      }
      continue;
    }
    const keys = new Set();
    for (let i = 0; i < n; i++) {
      const fr = px(twin, i);
      let diff = 0, far = 0, key = '';
      for (let y = 0; y < a.frame[1]; y++) for (let x = 0; x < a.frame[0]; x++) {
        const c = fr(x, y);
        key += c || '.';
        if (c !== art(x, y)) diff++;
        if (c && ![-2, -1, 0, 1, 2].some((dy) => [-2, -1, 0, 1, 2].some((dx) => art(x + dx, y + dy) === c))) far++;
      }
      keys.add(key);
      if (i === 0 && diff) bad('TL-SWAY', twin + ' frame 0 is not the art of ' + orig + ' (' + diff + ' px)');
      if (far) bad('TL-SWAY', twin + ' frame ' + i + ' has ' + far + ' px the art has nowhere near');
    }
    if (keys.size < 2) bad('TL-SWAY', twin + ' never moves');
    const placed = town.objects.filter((o) => o.id === orig);
    if (!placed.length) bad('TL-SWAY', orig + ' is not placed in the town');
    const starts = new Set(placed.map((o) => (env.swayOf(book, o.id, o.x, o.y, t0) || {}).i));
    if (placed.length > 2 && starts.size < 2) bad('TL-SWAY', 'every ' + orig + ' sways in step');
    for (const o of placed.slice(0, 1)) {
      const view = { ox: o.x * T - 200, oy: o.y * T - 200, w: 400, h: 400 };
      const d = env.composeFrame(town, book, { t: t0 }, view, tables, T).sprites.find((x) => x.tx === o.x && x.ty === o.y && (x.id === twin || x.id === orig));
      const want = env.swayOf(book, o.id, o.x, o.y, t0);
      if (!d || d.id !== twin) bad('TL-SWAY', orig + ' at ' + o.x + ',' + o.y + ' is drawn still');
      else if (want) { const f = book.frame(twin, 'idle', 's', want.i); if (f.sx !== d.sx || f.sy !== d.sy) bad('TL-SWAY', orig + ' drawn at another frame than its sway'); }
      const still = env.composeFrame(town, book, { t: t0, stillIdle: true }, view, tables, T).sprites.find((x) => x.tx === o.x && x.ty === o.y && x.id === twin);
      const f0 = book.frame(twin, 'idle', 's', 0);
      if (still && (still.sx !== f0.sx || still.sy !== f0.sy)) bad('TL-SWAY', orig + ' sways with the Idle animations switch off');
    }
  }

  /* TL-GLANCE */
  const beat = 1000 / LIFE_BEAT_FPS;
  for (const [id, g] of Object.entries(GLANCES)) {
    const o = town.objects.find((m) => m.id === id);
    if (!o) { bad('TL-GLANCE', id + ' is not placed in the town'); continue; }
    const dirs = (book.sprite(id).anims.idle || { dirs: {} }).dirs;
    for (const f of g.faces) if (!dirs[f]) bad('TL-GLANCE', id + ' looks ' + f + ', a face its idle clip does not have');
    const seenFaces = new Set();
    let was = null;
    for (let t = t0; t < t0 + g.holdMs * g.faces.length * 2; t += beat / 5) {
      const f = env.glanceOf(id, o.x, o.y, t);
      seenFaces.add(f);
      /* t walks a fifth of a beat at a time from a beat: a turn first seen here fell on the beat only if t is one */
      if (was !== null && f !== was && t % beat !== 0) bad('TL-GLANCE', id + ' turned off the beat at ' + t);
      was = f;
    }
    if (seenFaces.size < 2) bad('TL-GLANCE', id + ' never looks about (' + [...seenFaces].join() + ')');
    if (id === 'npc_crier' && !seenFaces.has('w')) bad('TL-GLANCE', 'Tamsin never looks to her board (west of her)');
    /* the frame compose draws is the face of the moment */
    for (const t of [t0, t0 + g.holdMs, t0 + 2 * g.holdMs]) {
      const view = { ox: o.x * T - 200, oy: o.y * T - 200, w: 400, h: 400 };
      const d = env.composeFrame(town, book, { t }, view, tables, T).sprites.find((x) => x.id === id);
      const face = env.glanceOf(id, o.x, o.y, t), clip = book.sprite(id).anims.idle;
      const want = book.frame(id, 'idle', face, Math.floor((t * clip.fps) / 1000) % book.frames(id, 'idle', face));
      if (!d || d.sx !== want.sx || d.sy !== want.sy) bad('TL-GLANCE', id + ' drawn facing other than its glance at t+' + (t - t0));
    }
  }

  /* TL-BUMP */
  const jolts = town.ambient.filter((a) => book.sprite(a.id).anims && book.sprite(a.id).anims.bump);
  const chest = jolts.find((a) => a.id === 'hearth_chest');
  if (!chest || jolts.length !== CHEST_LAYERS.length || !CHEST_LAYERS.every((id) => jolts.some((a) => a.id === id))) {
    bad('TL-BUMP', 'the Hearth Chest, its light and its smoke must each have a bump clip on the town map (have ' + jolts.map((a) => a.id).join() + ')');
  } else {
    const clip = (id) => book.sprite(id).anims.idle, n = (id) => book.frames(id, 'idle', 's'), nb = (id) => book.frames(id, 'bump', 's');
    for (const a of jolts) {
      if (clip(a.id).fps !== clip(chest.id).fps || n(a.id) !== n(chest.id) || a.x !== chest.x || a.y !== chest.y || a.lift !== chest.lift || a.dx !== chest.dx)
        bad('TL-BUMP', a.id + ' must loop in step with the chest (same rate and length) on its seat');
      if (!nb(a.id) || nb(a.id) > n(a.id)) bad('TL-BUMP', a.id + '\'s bump must stand for at most one idle loop');
    }
    const fps = clip(chest.id).fps, N = n(chest.id), NB = nb(chest.id), loopMs = (1000 * N) / fps;
    const loopsOf = (seed) => Array.from({ length: 300 }, (_, k) => k).filter((k) => env.bumpAt(k * loopMs + 1, fps, N, NB, seed) === 0);
    const seen = new Set();
    for (const seed of [1, 7, 4242, 0x5eed1]) {
      const at = loopsOf(seed), gaps = at.slice(1).map((k, i) => k - at[i]);
      seen.add(at.slice(0, 12).join());
      /* "about every 8-20 s": 3 to 7 loops of 3 s */
      if (at.length < 40 || gaps.some((g) => g * loopMs < 8000 || g * loopMs > 21000)) bad('TL-BUMP', 'seed ' + seed + ': bumps ' + gaps.slice(0, 8).join(',') + ' loops apart, want 8-21 s');
      /* a bump plays its whole clip from its loop's start and nothing after it */
      const k = at[0], frames = Array.from({ length: N }, (_, f) => env.bumpAt(k * loopMs + (f * 1000) / fps + 1, fps, N, NB, seed));
      if (frames.join() !== Array.from({ length: N }, (_, f) => (f < NB ? f : -1)).join()) bad('TL-BUMP', 'seed ' + seed + ': a bump loop shows ' + frames.join());
    }
    if (seen.size < 3) bad('TL-BUMP', 'two pages bump in step: the bumps must fall on the page\'s own seed');
    if ([0, 3000, 9000, 60000].some((t) => env.bumpAt(t, fps, N, NB, null) !== -1)) bad('TL-BUMP', 'a page with no seed bumps');
    /* drawn: at a bump's peak every layer shows its bump frame, in step; with the Idle animations off, or no seed, the idle loop */
    const seed = 7, t = loopsOf(seed)[0] * loopMs + (1 * 1000) / fps + 1;
    const view = { ox: (chest.x - 6) * T, oy: (chest.y - 6) * T, w: 12 * T, h: 8 * T };
    const drawn = (st) => env.composeFrame(town, book, Object.assign({ t }, st), view, tables, T).fx || [];
    for (const [st, want, why] of [[{ bumpSeed: seed }, 'bump', 'at a bump'], [{ bumpSeed: seed, stillIdle: true }, 'idle', 'with the Idle animations off'], [{}, 'idle', 'with no seed']]) {
      const fx = drawn(st);
      for (const a of jolts) {
        const e = fx.find((x) => x.id === a.id), f = want === 'bump' ? book.frame(a.id, 'bump', 's', 1) : book.frame(a.id, 'idle', 's', Math.floor((t * fps) / 1000) % N);
        if (!e || e.sx !== f.sx || e.sy !== f.sy) bad('TL-BUMP', a.id + ' ' + why + ' must draw its ' + want + ' frame');
      }
    }
  }
  return out;
}

const real = () => ({ manifests: MANIFESTS, town: TOWN, emitters: EMITTERS, surfaces: SURFACES, lifeOf, lifeDraws, composeFrame, folk: FOLK, createTownFolk, folkExtras, glanceOf, swayOf, sways: SWAYS, bumpAt });

function selftest() {
  const ok = problems(real());
  if (ok.length) { console.error('selftest: the clean control is red:\n  ' + ok.join('\n  ')); return 1; }
  const base = real();
  const sprites = (set, edit) => Object.assign({}, MANIFESTS, { [set]: Object.assign({}, MANIFESTS[set], { sprites: edit(Object.assign({}, MANIFESTS[set].sprites)) }) });
  const withLife = (fn) => (row, objects, ground, sp, w, h, T) => fn(lifeOf(row, objects, ground, sp, w, h, T), { row, objects, ground, w, h, T });
  const firstGlint = (l) => l.find((a) => /^water_glint/.test(a.id));
  /* a copy of the town's townsfolk with person i edited; a stand tile of a station */
  const folkWith = (i, edit) => ({ [TOWN.id]: FOLK[TOWN.id].map((r, j) => (j === i ? Object.assign({}, r, edit(r)) : r)) });
  const stand = (id) => { const st = STATIONS.find((x) => x.id === id || x.kind === id); return [st.stands[0][0], st.stands[0][1], 9000, 's']; };
  const mutants = {
    'a chimney point in the sky beside it': { emitters: Object.assign({}, EMITTERS, { havora_home_p09: [{ clip: 'chimney_smoke', at: [3, 2] }] }) },
    'the smoke ignores the sprite anchor': { lifeOf: withLife((l) => l.map((a) => (/smoke/.test(a.id) ? Object.assign({}, a, { px: a.px + 16 }) : a))) },
    'a home loses its smoke': { lifeOf: withLife((l) => { const i = l.findIndex((a) => a.id === 'chimney_smoke'); return l.filter((_, j) => j !== i); }) },
    'the Hearth gives off no sparks': { emitters: Object.assign({}, EMITTERS, { great_hearth: EMITTERS.great_hearth.filter((e) => e.clip !== 'hearth_embers') }) },
    'a glint on the bank': { lifeOf: withLife((l, m) => {
      for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) if (m.ground[y * m.w + x] === 'water' && m.ground[y * m.w + x + 1] !== 'water') return l.concat({ id: 'water_glint_a', px: x * m.T + 16, py: y * m.T + 16, phase: 0 });
      return l;
    }) },
    'two glints touch': { lifeOf: withLife((l, m) => { const g = firstGlint(l); return !g ? l : l.concat(Object.assign({}, g, { px: g.px + m.T })); }) },
    'a glint under the fishing pier': { lifeOf: withLife((l, m) => {
      const b = m.objects.find((o) => o.id === 'fishing_pier');
      if (!b) return l;
      const open = (x, y) => [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => m.ground[(y + dy) * m.w + x + dx] === 'water'));
      for (let y = b.y - 4; y < b.y + b.fh; y++) for (let x = b.x - 1; x < b.x + b.fw + 1; x++) if (open(x, y)) return l.concat({ id: 'water_glint_b', px: x * m.T + 16, py: y * m.T + 16, phase: 0 });
      return l;
    }) },
    'the water glitters on every other cell': { lifeOf: withLife((l, m) => {
      const out = l.filter((x) => !/^water_glint/.test(x.id)), taken = new Set();
      const open = (x, y) => m.ground[y * m.w + x] === 'water';
      for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
        let ok = true;
        for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) ok = open(x + dx, y + dy) && !taken.has((x + dx) + ',' + (y + dy));
        if (ok) { taken.add(x + ',' + y); out.push({ id: 'water_glint_a', px: x * m.T + 16, py: y * m.T + 16, phase: 0 }); }
      }
      return out;
    }) },
    'the ripples miss a cell': { lifeOf: withLife((l) => { const i = l.findIndex((a) => /^water_flow/.test(a.id)); return i < 0 ? l : l.filter((_, j) => j !== i); }) },
    'a ripple on the bank': { lifeOf: withLife((l, m) => { const f = l.find((a) => /^water_flow/.test(a.id)); return !f ? l : l.concat(Object.assign({}, f, { px: f.px, py: f.py - 64 * m.T })); }) },
    'the open sea drawn a cell at a time': { lifeOf: withLife((l, m) => l.flatMap((a) => (a.id !== 'water_flow_2' ? [a] : [[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => Object.assign({}, a, { id: 'water_flow', px: a.px + i * m.T, py: a.py + j * m.T }))))) },
    'the ripples out of step': { lifeOf: withLife((l) => l.map((a, i) => (/^water_flow/.test(a.id) && i % 7 === 0 ? Object.assign({}, a, { phase: 3 }) : a))) },
    'the water barely glints': { lifeOf: withLife((l) => l.filter((a, i) => !/^water_glint/.test(a.id) || i % 3 === 0)) },
    'a ground that never asked gets glints': { lifeOf: (row, ...rest) => lifeOf(Object.assign({}, row, { life: ['water'] }), ...rest) },
    'the glints differ between two compiles': { lifeOf: (() => { let n = 0; return withLife((l) => (++n % 2 ? l : l.map((a) => (/^water_glint/.test(a.id) ? Object.assign({}, a, { phase: a.phase + 1 }) : a)))); })() },
    'the smoke turns off the beat': { manifests: sprites('townlife', (s) => Object.assign(s, { chimney_smoke: Object.assign({}, s.chimney_smoke, { anims: { idle: Object.assign({}, s.chimney_smoke.anims.idle, { fps: 6 }) } }) })) },
    'a clip missing from the atlas': { manifests: sprites('townlife', (s) => { delete s.water_glint_b; return s; }) },
    'the Hearth fire moves off the beat': { manifests: sprites('hearth', (s) => Object.assign(s, { hearth_fire: Object.assign({}, s.hearth_fire, { anims: { idle: Object.assign({}, s.hearth_fire.anims.idle, { fps: 10 }) } }) })) },
    'compose drops the water light': { composeFrame: (...a) => { const l = composeFrame(...a); return Object.assign({}, l, { sprites: l.sprites.filter((d) => d.kind !== 'life') }); } },
    'the water light drawn over the standing': { composeFrame: (...a) => { const l = composeFrame(...a); const g = l.sprites.filter((d) => d.kind === 'life'); return Object.assign({}, l, { sprites: l.sprites.filter((d) => d.kind !== 'life').concat(g) }); } },
    'smoke drawn among the standing': { composeFrame: (...a) => { const l = composeFrame(...a); const s = l.raised.filter((d) => d.kind === 'life'); return Object.assign({}, l, { raised: l.raised.filter((d) => d.kind !== 'life'), sprites: l.sprites.concat(s) }); } },
    'smoke drawn after the light': { composeFrame: (...a) => { const l = composeFrame(...a); const s = l.raised.filter((d) => d.kind === 'life'); return Object.assign({}, l, { raised: l.raised.filter((d) => d.kind !== 'life'), fx: l.fx.concat(s) }); } },
    'every chimney in step': { lifeOf: withLife((l) => l.map((a) => (a.id === 'chimney_smoke' ? Object.assign({}, a, { phase: 0 }) : a))) },
    'the smoke never turns': { lifeDraws: (map, book, t, ...r) => lifeDraws(map, book, 5_000_000, ...r) },
    /* TL-FOLK */
    'a townsperson rests on a station stand': { folk: folkWith(0, (r) => ({ route: [stand('idle')].concat(r.route.slice(1)) })) },
    'a townsperson rests in a wall': { folk: folkWith(1, (r) => ({ route: [[0, 0, 9000, 's']].concat(r.route.slice(1)) })) },
    'a townsperson paces (rests a second)': { folk: folkWith(0, (r) => ({ route: r.route.map(([x, y, , f]) => [x, y, 1000, f]) })) },
    'a townsperson with no walk clip': { folk: folkWith(1, () => ({ body: 'npc_crier' })) },
    'a townsperson back in the Quarry Brute': { folk: folkWith(0, () => ({ body: 'outfit_brute', dye: '3.1.0.0' })) },
    'a body that cannot walk a diagonal': { manifests: sprites('townsfolk', (s) => {
      const b = s.folk_carter, dirs = Object.fromEntries(Object.entries(b.anims.walk.dirs).filter(([d]) => d !== 'ne'));
      return Object.assign(s, { folk_carter: Object.assign({}, b, { anims: Object.assign({}, b.anims, { walk: Object.assign({}, b.anims.walk, { dirs }) }) }) });
    }) },
    'a townsperson of its own body dyed': { folk: folkWith(3, () => ({ dye: '2.5.0.0' })) },
    'two townsfolk in one body': { folk: folkWith(1, () => ({ body: 'folk_market_woman', dye: undefined })) },
    'a walker moves every frame': { createTownFolk: (...a) => { const f = createTownFolk(...a); return Object.assign({}, f, { frame: (now) => f.frame(now).map((u) => (u.anim === 'walk' ? Object.assign({}, u, { x: u.x + (now % 62.5) / 32 / 62.5 }) : u)) }); } },
    'a townsperson with a name plate': { createTownFolk: (...a) => { const f = createTownFolk(...a); return Object.assign({}, f, { frame: (now) => f.frame(now).map((u) => Object.assign({}, u, { plate: { text: 'Hob', kind: 'peer' } })) }); } },
    'a townsperson drawn as a player': { createTownFolk: (...a) => { const f = createTownFolk(...a); return Object.assign({}, f, { frame: (now) => f.frame(now).map((u) => Object.assign({}, u, { ref: { player: { id: 'x', name: 'Hob' } } })) }); } },
    'a townsperson never leaves its first stop': { createTownFolk: (...a) => { const f = createTownFolk(...a); return Object.assign({}, f, { frame: (now) => f.frame(now).map((u, i) => Object.assign({}, u, { x: a[2][i].route[0][0], y: a[2][i].route[0][1] })) }); } },
    'the cellar gets townsfolk': { folkExtras: () => ({ units: () => [] }) },
    'the town gets none': { folkExtras: () => ({}) },
    /* TL-SWAY */
    'the stalls sway in step': { swayOf: (book, id, x, y, t) => { const r = swayOf(book, id, x, y, t); return r && Object.assign({}, r, { i: 0 }); } },
    'a banner swayed by its own art (never moves)': { sways: Object.assign({}, SWAYS, { ty_banner: 'ty_banner' }) },
    'an awning twin of another sprite': { sways: Object.assign({}, SWAYS, { square_market_stall: 'ty_banner_sway' }) },
    'a twin missing from the atlas': { manifests: sprites('townlife', (s) => { delete s.ty_banner_sway; return s; }) },
    'a hen laid a pixel off': { emitters: Object.assign({}, EMITTERS, { havora_home_p02: EMITTERS.havora_home_p02.map((e) => (e.clip === 'p02_hen_white' ? { clip: e.clip, at: [e.at[0], e.at[1] + 1] } : e)) }) },
    'the yard drawn whole under its hens': { sways: Object.assign({}, SWAYS, { havora_home_p02: 'havora_home_p02' }), manifests: sprites('havora', (s) => Object.assign(s, { havora_home_p02: Object.assign({}, s.havora_home_p02, { anims: { idle: Object.assign({}, s.havora_home_p02.anims.idle, { fps: 4 }) } }) })) },
    'a hen that never stirs': { manifests: sprites('townlife', (s) => Object.assign(s, { p02_hen_white: Object.assign({}, s.p02_hen_white, { anims: { idle: Object.assign({}, s.p02_hen_white.anims.idle, { dirs: { s: s.p02_hen_white.anims.idle.dirs.s.map(() => s.p02_hen_white.anims.idle.dirs.s[0]) } }) } }) })) },
    /* TL-TURN */
    'the wheel drawn from other pixels': { manifests: sprites('townlife', (s) => Object.assign(s, { mill_wheel: Object.assign({}, s.mill_wheel, { anims: { idle: Object.assign({}, s.mill_wheel.anims.idle, { dirs: s.water_flow.anims.idle.dirs }) } }) })) },
    'the wheel laid a pixel off': { emitters: Object.assign({}, EMITTERS, { mill: EMITTERS.mill.map((e) => (e.clip === 'mill_wheel' ? { clip: e.clip, at: [e.at[0] + 1, e.at[1]] } : e)) }) },
    /* TL-GLANCE */
    'Tamsin stares south': { glanceOf: () => 's' },
    'Tamsin turns off the beat': { glanceOf: (id, x, y, t) => glanceOf(id, x, y, t + 37) },
    'Tamsin looks where she has no face': { glanceOf: (id, x, y, t) => (glanceOf(id, x, y, t) === 'w' ? 'nw' : glanceOf(id, x, y, t)) },
    /* TL-BUMP */
    'the chest never bumps': { bumpAt: () => -1 },
    'every screen bumps in step': { bumpAt: (t, fps, n, nb, seed) => bumpAt(t, fps, n, nb, seed == null ? seed : 1) },
    'the chest bumps every loop': { bumpAt: (t, fps, n, nb, seed) => { const step = Math.floor((t * fps) / 1000) % n; return seed == null || step >= nb ? -1 : step; } },
    'a bump with the Idle animations off': { composeFrame: (m, b, st, ...r) => composeFrame(m, b, st.bumpSeed == null ? st : Object.assign({}, st, { stillIdle: false }), ...r) },
    'the light out of step with the chest': { manifests: sprites('townlife', (s) => Object.assign(s, { hearth_chest_glow: Object.assign({}, s.hearth_chest_glow, { anims: Object.assign({}, s.hearth_chest_glow.anims, { idle: Object.assign({}, s.hearth_chest_glow.anims.idle, { dirs: { s: s.hearth_chest_glow.anims.idle.dirs.s.slice(0, 23) } }) }) }) })) },
  };
  let missed = 0;
  for (const [name, m] of Object.entries(mutants)) {
    const found = problems(Object.assign({}, base, m));
    if (found.length) console.log('  caught  ' + name + ' [' + found[0].split(' ')[0] + ']'); else { console.error('  MISSED  ' + name); missed++; }
  }
  if (missed) { console.error('town-life --selftest: ' + missed + ' planted defect(s) missed'); return 1; }
  console.log('town-life --selftest: all ' + Object.keys(mutants).length + ' planted defects caught; the clean control is silent');
  return 0;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  const found = problems(real());
  if (found.length) { console.error('town-life: RED\n  ' + found.join('\n  ')); process.exit(1); }
  console.log('town-life: green — every chimney smokes from its mouth, the Hearth smokes and sparks, glints only on open water, every loop on the 8 fps beat and in its layer');
}
