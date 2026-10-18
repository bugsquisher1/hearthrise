#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/world-assets.mjs — THE WORLD'S ART KEEPS ONE SCALE AND STANDS ON THE FLOOR
//
//   node tests/world-assets.mjs             every committed world atlas obeys the budget
//   node tests/world-assets.mjs --selftest  planted defects each trip their named rule
//
// ── WHY ─────────────────────────────────────────────────────────────────────
// The v3 world mockups were liked and then picked apart by the first two people
// who looked closely: a chest and an NPC floated above the floor, shadows came in
// three styles, characters looked huge next to the furniture, the trees looked
// small, and two props were drawn corner-on (isometric) beside a top-down hero.
// Every one of those is a property of the PIXELS, and every one of them was
// invisible in review until a human squinted at a finished scene.
//
// So the rules live in data (src/data/world/art-budget.js, palette.js) and this
// guard measures the atlases that SHIP — not the sources, not a belief about
// them — against those rules: the body size of every class (±10%), the locked
// palette, no partial alpha, the shared 64×64 character anchor, the contact row
// (a solid prop rests ≥ 40% of its width within 2 px of its anchor; legged
// furniture on 2+ spans over 60%), nothing below the anchor beyond a declared
// overhang (a baked shadow is exactly that), no isometric corner, atlas ≤ 2048².
// It also rebuilds every set from art/world/** in memory and fails on drift, so
// an atlas cannot be hand-edited past the pipeline (tools/world-art/build.mjs).
//
// The content contract the world renderer builds against is pinned too: the hunt
// outfits (the hero everywhere, src/world/hero-look.js), the Rat King and every
// monster of the two hunting grounds idle and walk in all eight facings; the town
// has its stations, its crier and its two buildings, the house one piece per room,
// and each reachable map its painted ground.
//
// ONE STYLE (Tyler 2026-10-18, tools/world-art/style1.mjs): every sidecar of a set
// the renderer loads is style 1 with a style-1 source, no retired pre-style-1 set
// (hero, cellar, town, home) is loaded or left in the tree, no art sits in a set
// nobody loads, and everything a player can reach names a sprite or ground some
// loaded style-1 set carries. --selftest plants each kind of old asset.
//
// --selftest plants the five defects the feedback named into REAL shipped sprites
// — a floated chest, a 50 px hero, an off-palette pixel, a baked shadow, an
// isometric-corner chest — plus an edited atlas pixel (drift), and requires each
// to be caught BY ITS NAMED RULE (and an all-blank effect by [empty]: an effect may
// fade through blank frames, never be blank in all of them); the clean sprites and a palette-preserving
// recolour must stay silent (a guard red on clean art proves nothing).
//
// mutant-anchors: assets/world/ art/world/ tools/world-art/ src/data/world/ src/data/hunt-outfits.js
//
// Exit: 0 green · 1 a finding, drift, or a mutant escaped · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { decodePNG, encodePNG, pixelHash, cloneImage, createImage, blit, scaleNearest } from '../tools/world-art/png.mjs';
import { validateSprite, validateTerrain, validateAtlasSize, referenceFrames, bodyOf } from '../tools/world-art/validate.mjs';
import { measureFrame } from '../tools/world-art/measure.mjs';
import { ROOT, ART_DIR, OUT_DIR, checkAll, spriteFromAtlas, terrainFromAtlas } from '../tools/world-art/build.mjs';
import { CLASSES, MANIFEST_VERSION, FACINGS } from '../src/data/world/art-budget.js';
import { PALETTE_ID } from '../tools/world-art/palette.mjs';
import { style1Findings, reachableRefs, codeSets, RETIRED_SETS } from '../tools/world-art/style1.mjs';
import { readSidecars, listSets } from '../tools/world-art/build.mjs';
import { ATLAS_SETS } from '../src/data/world/atlas-sets.js';
import { WORLD_MAPS } from '../src/data/world/maps/index.js';
import { ROOM_LAYOUTS, TROPHY_MOUNT_SPRITES } from '../src/data/world/house-layouts.js';
import { PEER_LOOKS, CRIER_SPRITE } from '../src/data/world/stations.js';
import { OUTFITS } from '../src/data/hunt-outfits.js';
import { HUNT_INDEX } from '../src/data/hunts.js';
import { HUNT_GROUNDS } from '../src/data/hunt-grounds.js';

/* ONE STYLE (tools/world-art/style1.mjs): what the renderer loads, what is in the tree, and
   everything a player can reach, read from the shipped data. */
/* every client source that could load an atlas on its own */
function walkJs(dir, out = []) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) { if (f.name !== 'vendor') walkJs(p, out); } else if (/\.(m?js|html)$/.test(f.name)) out.push(p);
  }
  return out;
}
function codeRefs(root) {
  return walkJs(join(root, 'src')).map((f) => ({ file: f.slice(root.length + 1).split(sep).join('/'), sets: codeSets(readFileSync(f, 'utf8')) })).filter((c) => c.sets.length);
}
function style1Input(root = ROOT, over = {}) {
  const built = existsSync(join(root, OUT_DIR)) ? readdirSync(join(root, OUT_DIR)).map((f) => (f.match(/^atlas-(.+)\.json$/) || [])[1]).filter(Boolean) : [];
  const atlasSets = over.atlasSets || ATLAS_SETS;
  const sidecars = {};
  for (const set of listSets(root)) sidecars[set] = readSidecars(root, set);
  return {
    atlasSets, artSets: listSets(root), builtSets: built, sidecars, code: over.code || codeRefs(root),
    refs: reachableRefs({ maps: over.maps || WORLD_MAPS, layouts: ROOM_LAYOUTS, trophySprites: TROPHY_MOUNT_SPRITES, peerLooks: PEER_LOOKS,
      crier: CRIER_SPRITE, outfits: Object.values(OUTFITS), huntIndex: HUNT_INDEX, grounds: HUNT_GROUNDS }),
  };
}

// What the hunt (W3) and the town/home scenes (W4) are built against. A prop needs
// its one idle frame; a unit every listed clip in all four facings.
const UNIT = ['s', 'e', 'n', 'w'], PROP = ['s'];
const REQUIRED = {
  // the Mill Cellar's three: rat and slime wear the Sewer's style-1 art, the hive wasp is its own
  rat: { set: 'hunt', class: 'vermin', anims: ['idle', 'walk'], dirs: FACINGS },
  slime: { set: 'hunt', class: 'vermin', anims: ['idle', 'walk'], dirs: FACINGS },
  hive_wasp: { set: 'mill', class: 'vermin_flier', anims: ['idle', 'walk'], dirs: FACINGS },
  loot_bag: { set: 'mill', class: 'clutter', anims: ['idle'], dirs: PROP },
  // town stations: combat at the mill hatch, gather at the woodpile, artisan at the anvil;
  // the crier speaks from the notice board
  hatch: { set: 'common', class: 'decal', anims: ['idle'], dirs: PROP },
  woodpile: { set: 'common', class: 'fixture', anims: ['idle'], dirs: PROP },
  anvil: { set: 'common', class: 'bulky', anims: ['idle'], dirs: PROP },
  noticeboard: { set: 'common', class: 'fixture', anims: ['idle'], dirs: PROP },
  npc_crier: { set: 'common', class: 'character', anims: ['idle'], dirs: UNIT },
  smithy: { set: 'common', class: 'building', anims: ['idle'], dirs: PROP },
  mill: { set: 'common', class: 'building', anims: ['idle'], dirs: PROP },
  // one piece per house room (kitchen, forge, library, trophy, workshop, shrine) + the bed
  hearth: { set: 'cottage', class: 'fixture', anims: ['idle'], dirs: PROP },
  forge: { set: 'cottage', class: 'fixture', anims: ['idle'], dirs: PROP },
  bookshelf: { set: 'cottage', class: 'fixture', anims: ['idle'], dirs: PROP },
  display_case: { set: 'cottage', class: 'station', anims: ['idle'], dirs: PROP },
  workbench: { set: 'cottage', class: 'station', anims: ['idle'], dirs: PROP },
  altar: { set: 'cottage', class: 'fixture', anims: ['idle'], dirs: PROP },
  bed: { set: 'cottage', class: 'bed', anims: ['idle'], dirs: PROP },
  // the live hunt (src/hunt-view/scene.js) and every walked map's hero (src/world/hero-look.js):
  // every outfit and the Rat King walk in all eight facings
  ...Object.fromEntries(['outfit_knight', 'outfit_berserker', 'outfit_brute', 'outfit_ranger', 'outfit_sorcerer', 'outfit_witch', 'outfit_dawnward', 'outfit_druid']
    .map((id) => [id, { set: 'hunt', class: 'character', anims: ['idle', 'walk'], dirs: FACINGS }])),
  rat_king: { set: 'hunt', class: 'beast', anims: ['idle', 'walk'], dirs: FACINGS },
  // the Millrace Sewer's six (src/data/monsters.js: the sprite id is the monster id)
  ...Object.fromEntries(['drain_rat', 'sump_slime', 'cistern_spider'].map((id) => [id, { set: 'hunt', class: 'vermin', anims: ['idle', 'walk'], dirs: FACINGS }])),
  culvert_bat: { set: 'hunt', class: 'vermin_flier', anims: ['idle', 'walk'], dirs: FACINGS },
  kobold_tosher: { set: 'hunt', class: 'character', anims: ['idle', 'walk'], dirs: FACINGS },
};
// every reachable map's ground: one painted style-1 ground each (tools/world-art/port-pixellab.mjs)
const REQUIRED_TERRAIN = { sewer_ground: 'sewer', cellar_ground: 'mill', common_ground: 'common', cottage_ground: 'cottage' };

function loadAtlases(root = ROOT) {
  const dir = join(root, OUT_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^atlas-.+\.json$/.test(f)).sort().map((f) => {
    const manifest = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const atlas = decodePNG(readFileSync(join(dir, manifest.image)));
    return { file: `${OUT_DIR}/${f}`, manifest, atlas };
  });
}

function guard() {
  const fails = [];
  const atlases = loadAtlases();
  if (!atlases.length) fails.push(`no atlases under ${OUT_DIR}/`);
  const seen = {};
  for (const { file, manifest: m, atlas } of atlases) {
    if (m.version !== MANIFEST_VERSION) fails.push(`${file}: manifest version ${m.version}, expected ${MANIFEST_VERSION}`);
    if (m.palette !== PALETTE_ID) fails.push(`${file}: locked to palette ${m.palette}, the world palette is ${PALETTE_ID}`);
    if (atlas.width !== m.size[0] || atlas.height !== m.size[1]) fails.push(`${file}: size ${m.size} but the PNG is ${atlas.width}x${atlas.height}`);
    if (pixelHash(atlas) !== m.pixels) fails.push(`${file}: atlas pixels do not match the manifest hash`);
    for (const f of validateAtlasSize(m.set, atlas.width, atlas.height)) fails.push(`${file}: [${f.rule}] ${f.detail}`);
    for (const id of Object.keys(m.sprites)) {
      seen[id] = { set: m.set, sprite: m.sprites[id] };
      for (const f of validateSprite(spriteFromAtlas(m, atlas, id))) fails.push(`${file}: [${f.rule}] ${f.id}: ${f.detail}`);
    }
    for (const id of Object.keys(m.terrain)) for (const f of validateTerrain(terrainFromAtlas(m, atlas, id))) fails.push(`${file}: [${f.rule}] ${f.id}: ${f.detail}`);
  }
  for (const [id, want] of Object.entries(REQUIRED)) {
    const got = seen[id];
    if (!got) { fails.push(`content: no sprite "${id}" in set ${want.set}`); continue; }
    if (got.set !== want.set) fails.push(`content: "${id}" is in set ${got.set}, the renderer loads it from ${want.set}`);
    if (got.sprite.class !== want.class) fails.push(`content: "${id}" is class ${got.sprite.class}, expected ${want.class}`);
    for (const a of want.anims) for (const d of want.dirs) if (!got.sprite.anims[a] || !(got.sprite.anims[a].dirs[d] || []).length) fails.push(`content: "${id}" has no ${a} facing ${d}`);
  }
  for (const [id, set] of Object.entries(REQUIRED_TERRAIN)) {
    const m = atlases.find((a) => a.manifest.set === set);
    if (!m || !m.manifest.terrain[id]) fails.push(`content: no terrain "${id}" in set ${set}`);
  }
  for (const f of style1Findings(style1Input())) fails.push(`style-1: [${f.rule}] ${f.detail}`);
  const { findings, drift } = checkAll(ROOT);
  for (const f of findings) fails.push(`source: [${f.rule}] ${f.id}: ${f.detail}`);
  for (const d of drift) fails.push(`drift: ${d}`);
  return { fails, atlases };
}

// ── mutants ────────────────────────────────────────────────────────────────
const mapFrames = (sp, fn) => ({ ...sp, frames: sp.frames.map((f) => ({ ...f, img: fn(f.img, f) })) });
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function shiftUp(img, dy) {
  const out = createImage(img.width, img.height);
  blit(out, img, 0, 0, img.width, img.height, 0, -dy);
  return out;
}
function firstOpaque(img) {
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] === 255) return i;
  return -1;
}
function recolourOne(img, rgb) {
  const out = cloneImage(img);
  const i = firstOpaque(out);
  out.data[i] = rgb[0]; out.data[i + 1] = rgb[1]; out.data[i + 2] = rgb[2];
  return out;
}
function bakeShadow(img, anchorY) {
  /* A style-1 prop's frame ends on its contact row: grow it 4 rows, as an exporter would to fit the shadow. */
  const out = createImage(img.width, Math.max(img.height, anchorY + 5));
  blit(out, img, 0, 0, img.width, img.height, 0, 0);
  const m = measureFrame(img);
  const cx = (m.box.x0 + m.box.x1) / 2 + 2, cy = anchorY + 1, rx = m.box.w / 2 + 1, ry = 3;
  const [r, g, b] = hex('#17141a');
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
    const i = (y * out.width + x) * 4;
    if (out.data[i + 3]) continue;
    out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = 255;
  }
  return out;
}
// Corner-on: each column rises by half its distance from the centre, so the
// underside becomes the V of a box seen from its corner.
function isoCorner(img) {
  const m = measureFrame(img);
  const cx = (m.box.x0 + m.box.x1) / 2;
  const out = createImage(img.width, img.height);
  for (let x = 0; x < img.width; x++) {
    const up = Math.round(Math.abs(x - cx) * 0.5);
    for (let y = 0; y < img.height; y++) {
      const s = (y * img.width + x) * 4, ty = y - up;
      if (ty >= 0) out.data.set(img.data.subarray(s, s + 4), (ty * img.width + x) * 4);
    }
  }
  return out;
}
// Grow the character until its body measures `target` px, feet kept on the anchor.
function growTo(sp, target) {
  const cls = CLASSES[sp.class];
  const ref = referenceFrames(sp.frames)[0];
  const k = target / bodyOf(cls, measureFrame(ref.img));
  const [ax, ay] = sp.anchor;
  return mapFrames(sp, (img) => {
    const big = scaleNearest(img, k);
    const out = createImage(img.width, img.height);
    blit(out, big, 0, 0, big.width, big.height, Math.round(ax - ax * k), Math.round(ay - ay * k));
    return out;
  });
}

function selftest(atlases) {
  const find = (cls, only) => {
    for (const { manifest: m, atlas } of atlases) for (const [id, s] of Object.entries(m.sprites)) if (s.class === cls && (!only || id === only)) return spriteFromAtlas(m, atlas, id);
    return null;
  };
  const chest = find('box'), hero = find('character'), fx = find('vfx'), vermin = find('vermin', 'sump_slime') || find('vermin');
  if (!chest || !hero || !fx || !vermin) { console.error('world-assets --selftest: harness — needs a shipped box-class sprite, a character, a vermin and a vfx'); process.exit(2); }
  const ay = chest.anchor[1];
  const controls = [['clean chest', chest], ['clean hero', hero], ['clean vermin', vermin], ['clean effect (blank frames allowed)', mapFrames(fx, (img, f) => (f.i === 0 ? createImage(img.width, img.height) : img))],
    ['palette-preserving recolour', mapFrames(chest, (img) => recolourOne(img, hex('#0b0a0c')))]];
  for (const [name, sp] of controls) {
    const f = validateSprite(sp);
    if (f.length) { console.error(`world-assets --selftest: harness — the ${name} control is not clean: ${f.map((x) => `[${x.rule}] ${x.detail}`).join('; ')}`); process.exit(2); }
  }
  const mutants = [
    ['floated chest (6 px above its anchor)', 'contact', mapFrames(chest, (img) => shiftUp(img, 6))],
    ['50 px hero', 'budget', growTo(hero, 50)],
    ['48 px vermin (the class tops out at 40 +10%)', 'budget', growTo(vermin, 48)],
    ['18 px vermin (a cellar critter is not a sewer monster)', 'budget', growTo(vermin, 18)],
    ['off-palette pixel', 'palette', mapFrames(chest, (img) => recolourOne(img, hex('#ff00ff')))],
    ['baked shadow under the chest', 'below-anchor', mapFrames(chest, (img) => bakeShadow(img, ay))],
    ['isometric-corner chest', 'iso-corner', mapFrames(chest, (img) => isoCorner(img))],
    ['an effect with every frame blank', 'empty', mapFrames(fx, (img) => createImage(img.width, img.height))],
  ];
  let escaped = 0;
  for (const [name, rule, sp] of mutants) {
    const rules = new Set(validateSprite(sp).map((f) => f.rule));
    if (rules.has(rule)) console.log(`  ✓ ${name}: caught by [${rule}]`);
    else { escaped++; console.log(`  ✗ ${name}: NOT caught by [${rule}] (rules hit: ${[...rules].join(', ') || 'none'})`); }
  }
  // ONE STYLE: each planted old asset must be caught by its own rule; the shipped input stays silent.
  const clean = style1Findings(style1Input());
  if (clean.length) { console.error('world-assets --selftest: harness — the shipped world is not clean style 1: ' + clean.map((f) => f.detail).join('; ')); process.exit(2); }
  const s1 = (name, rule, input) => {
    const rules = new Set(style1Findings(input).map((f) => f.rule));
    if (rules.has(rule)) console.log(`  ✓ ${name}: caught by [${rule}]`);
    else { escaped++; console.log(`  ✗ ${name}: NOT caught by [${rule}] (rules hit: ${[...rules].join(', ') || 'none'})`); }
  };
  const oldSidecar = (inp) => { const set = inp.atlasSets.find((x) => (inp.sidecars[x] || []).length); const sc = inp.sidecars[set][0];
    inp.sidecars[set] = inp.sidecars[set].concat([{ id: 'barrel_old', class: 'barrel', material: 'wood', source: 'barrel_old.png', pixellab: { tool: 'create_1_direction_object', id: 'b90e189e' } }]);
    return sc; };
  { const inp = style1Input(); oldSidecar(inp); s1('a pre-style-1 sidecar (no style mark) in a loaded set', 's1-source', inp); }
  { const inp = style1Input(); const set = inp.atlasSets[0]; inp.sidecars[set] = inp.sidecars[set].map((sc, i) => (i ? sc : Object.assign({}, sc, { style: 's1', pixellab: undefined, notes: 'hand' }))); s1('a style mark with no style-1 source', 's1-source', inp); }
  { const maps = WORLD_MAPS.map((m) => (m.id === 'mill_cellar' ? Object.assign({}, m, { objects: m.objects.concat([{ id: 'barrel_old', x: 10, y: 6 }]) }) : m));
    s1('an old sprite id placed on a reachable map', 's1-ref', style1Input(ROOT, { maps })); }
  { const maps = WORLD_MAPS.map((m) => (m.id === 'town_common' ? Object.assign({}, m, { ground: 'town_ground' }) : m)); s1('a map on the old town ground', 's1-ref', style1Input(ROOT, { maps })); }
  { const maps = WORLD_MAPS.map((m) => (m.id === 'home_cottage' ? Object.assign({}, m, { buildings: m.buildings.map((b) => Object.assign({}, b, { painted: false, roof: { rect: b.rect, kind: 'roof_wood' } })) }) : m));
    s1('a building drawn with the old wall kit', 's1-ref', style1Input(ROOT, { maps })); }
  s1('the retired hero set loaded again', 's1-retired', style1Input(ROOT, { atlasSets: ATLAS_SETS.concat(['hero']) }));
  { const inp = style1Input(); inp.artSets = inp.artSets.concat(['oldkit']); s1('old art parked in a set nobody loads', 's1-orphan', inp); }
  { const inp = style1Input(); inp.builtSets = inp.builtSets.concat([RETIRED_SETS[0]]); s1('a retired atlas left in assets/world', 's1-retired', inp); }
  s1('a window loading the retired hero atlas itself', 's1-code', style1Input(ROOT, { code: codeRefs(ROOT).concat([{ file: 'src/shell/windows/gear.js', sets: codeSets("const p = atlasPaths('hero');") }]) }));
  s1('a literal path to a retired atlas', 's1-code', style1Input(ROOT, { code: [{ file: 'src/x.js', sets: codeSets("fetch('assets/world/atlas-town.json')") }] }));

  // Drift, end to end: a copy of the tree with one atlas pixel edited by hand must
  // fail the rebuild comparison the plain run makes (checkAll), not just a hash.
  const tmp = mkdtempSync(join(tmpdir(), 'world-assets-'));
  try {
    cpSync(join(ROOT, ART_DIR), join(tmp, ART_DIR), { recursive: true });
    cpSync(join(ROOT, OUT_DIR), join(tmp, OUT_DIR), { recursive: true });
    const set = atlases[0].manifest.set, png = join(tmp, OUT_DIR, `atlas-${set}.png`);
    const edited = decodePNG(readFileSync(png));
    edited.data[firstOpaque(edited)] ^= 1;
    writeFileSync(png, encodePNG(edited));
    const clean = checkAll(tmp);
    if (clean.drift.some((d) => d.startsWith(`${set}:`) && d.includes('pixels differ'))) console.log('  ✓ a hand-edited atlas pixel: caught by [drift]');
    else { escaped++; console.log(`  ✗ a hand-edited atlas pixel: NOT caught by [drift] (${clean.drift.join('; ') || 'no drift'})`); }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(escaped ? `world-assets --selftest: RED — ${escaped} planted defect(s) escaped` : `world-assets --selftest: all ${mutants.length + 11} planted defects caught; ${controls.length + 1} clean controls silent`);
  process.exit(escaped ? 1 : 0);
}

try {
  if (process.argv.includes('--selftest')) {
    selftest(loadAtlases());
  } else {
    const { fails, atlases } = guard();
    for (const f of fails) console.log('  ✗ ' + f);
    const n = atlases.reduce((s, a) => s + Object.keys(a.manifest.sprites).length, 0);
    console.log(fails.length ? `world-assets: RED — ${fails.length} finding(s)` : `world-assets: green — ${atlases.length} atlases, ${n} sprites on budget, on palette, on the floor, matching their sources`);
    process.exit(fails.length ? 1 : 0);
  }
} catch (e) {
  console.error('world-assets: harness error:', e && e.stack || e);
  process.exit(2);
}
