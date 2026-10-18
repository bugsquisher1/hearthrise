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
// The content contract the world renderer builds against is pinned too: the hero
// idles, walks and attacks in four directions; the hunt outfits and the Rat King
// idle and walk in all eight; rat, slime and hive wasp walk,
// attack, flinch and leave a corpse in four; the town has its four stations and
// its crier, the house one piece per room, and each set its floor.
//
// --selftest plants the five defects the feedback named into REAL shipped sprites
// — a floated chest, a 50 px hero, an off-palette pixel, a baked shadow, an
// isometric-corner chest — plus an edited atlas pixel (drift), and requires each
// to be caught BY ITS NAMED RULE (and an all-blank effect by [empty]: an effect may
// fade through blank frames, never be blank in all of them); the clean sprites and a palette-preserving
// recolour must stay silent (a guard red on clean art proves nothing).
//
// mutant-anchors: assets/world/ art/world/ tools/world-art/ src/data/world/
//
// Exit: 0 green · 1 a finding, drift, or a mutant escaped · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { decodePNG, encodePNG, pixelHash, cloneImage, createImage, blit, scaleNearest } from '../tools/world-art/png.mjs';
import { validateSprite, validateTerrain, validateAtlasSize, referenceFrames, bodyOf } from '../tools/world-art/validate.mjs';
import { measureFrame } from '../tools/world-art/measure.mjs';
import { ROOT, ART_DIR, OUT_DIR, checkAll, spriteFromAtlas, terrainFromAtlas } from '../tools/world-art/build.mjs';
import { CLASSES, MANIFEST_VERSION, FACINGS } from '../src/data/world/art-budget.js';
import { PALETTE_ID } from '../tools/world-art/palette.mjs';

// What the hunt (W3) and the town/home scenes (W4) are built against. A prop needs
// its one idle frame; a unit every listed clip in all four facings.
const UNIT = ['s', 'e', 'n', 'w'], PROP = ['s'];
const REQUIRED = {
  hero: { set: 'hero', class: 'character', anims: ['idle', 'walk', 'attack'], dirs: UNIT },
  rat: { set: 'cellar', class: 'critter', anims: ['walk', 'attack', 'hit', 'corpse'], dirs: UNIT },
  slime: { set: 'cellar', class: 'critter', anims: ['walk', 'attack', 'hit', 'corpse'], dirs: UNIT },
  hive_wasp: { set: 'cellar', class: 'flier', anims: ['walk', 'attack', 'hit', 'corpse'], dirs: UNIT },
  // town stations: combat at the mill hatch, gather at the woodpile, artisan at the anvil,
  // away/idle on benches; the crier speaks from the notice board
  hatch: { set: 'town', class: 'decal', anims: ['idle'], dirs: PROP },
  woodpile: { set: 'town', class: 'fixture', anims: ['idle'], dirs: PROP },
  anvil: { set: 'town', class: 'bulky', anims: ['idle'], dirs: PROP },
  bench: { set: 'town', class: 'bench', anims: ['idle'], dirs: PROP },
  noticeboard: { set: 'town', class: 'fixture', anims: ['idle'], dirs: PROP },
  npc_crier: { set: 'town', class: 'character', anims: ['idle'], dirs: UNIT },
  // one piece per house room (kitchen, forge, library, trophy, workshop, shrine) + the bed
  hearth: { set: 'home', class: 'fixture', anims: ['idle'], dirs: PROP },
  forge: { set: 'home', class: 'fixture', anims: ['idle'], dirs: PROP },
  bookshelf: { set: 'home', class: 'fixture', anims: ['idle'], dirs: PROP },
  display_case: { set: 'home', class: 'fixture', anims: ['idle'], dirs: PROP },
  workbench: { set: 'home', class: 'station', anims: ['idle'], dirs: PROP },
  altar: { set: 'home', class: 'fixture', anims: ['idle'], dirs: PROP },
  bed: { set: 'home', class: 'bed', anims: ['idle'], dirs: PROP },
  // the live hunt (src/hunt-view/scene.js): every outfit and the Rat King walk in all eight facings
  ...Object.fromEntries(['outfit_knight', 'outfit_berserker', 'outfit_brute', 'outfit_ranger', 'outfit_sorcerer', 'outfit_witch', 'outfit_dawnward']
    .map((id) => [id, { set: 'hunt', class: 'character', anims: ['idle', 'walk'], dirs: FACINGS }])),
  rat_king: { set: 'hunt', class: 'beast', anims: ['idle', 'walk'], dirs: FACINGS },
};
const REQUIRED_TERRAIN = { cellar_earth: 'cellar', town_ground: 'town', plank_floor: 'home' };

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
  const out = cloneImage(img);
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
  const find = (cls) => {
    for (const { manifest: m, atlas } of atlases) for (const [id, s] of Object.entries(m.sprites)) if (s.class === cls) return spriteFromAtlas(m, atlas, id);
    return null;
  };
  const chest = find('box'), hero = find('character'), fx = find('vfx');
  if (!chest || !hero || !fx) { console.error('world-assets --selftest: harness — needs a shipped box-class sprite, a character and a vfx'); process.exit(2); }
  const ay = chest.anchor[1];
  const controls = [['clean chest', chest], ['clean hero', hero], ['clean effect (blank frames allowed)', mapFrames(fx, (img, f) => (f.i === 0 ? createImage(img.width, img.height) : img))],
    ['palette-preserving recolour', mapFrames(chest, (img) => recolourOne(img, hex('#0b0a0c')))]];
  for (const [name, sp] of controls) {
    const f = validateSprite(sp);
    if (f.length) { console.error(`world-assets --selftest: harness — the ${name} control is not clean: ${f.map((x) => `[${x.rule}] ${x.detail}`).join('; ')}`); process.exit(2); }
  }
  const mutants = [
    ['floated chest (6 px above its anchor)', 'contact', mapFrames(chest, (img) => shiftUp(img, 6))],
    ['50 px hero', 'budget', growTo(hero, 50)],
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
  console.log(escaped ? `world-assets --selftest: RED — ${escaped} planted defect(s) escaped` : `world-assets --selftest: all ${mutants.length + 1} planted defects caught; ${controls.length} clean controls silent`);
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
