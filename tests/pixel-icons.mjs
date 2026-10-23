#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/pixel-icons.mjs — EVERY ITEM HAS A PIXEL-WORLD ICON, AND IT IS A LEGAL ONE
//
//   node tests/pixel-icons.mjs             the shipped set obeys the contract
//   node tests/pixel-icons.mjs --selftest  planted defects each trip their named rule
//
// The item icons are the pixel-world set (Tyler, 2026-10-14): one 32x32 PNG per
// ITEMS key at assets/icons-bundle/pixel/items/<id>.png, snapped to the locked
// world palette (art/world/palette.json), binary alpha, shown at x2 with
// image-rendering: pixelated. The filename is derived from the id, so this guard
// is the whole manifest:
//   missing   an ITEMS key with no icon file (the shelf would fall back to a glyph)
//   orphan    an icon file for no ITEMS key (a rename that left the art behind)
//   size      a PNG that is not 32x32
//   palette   an opaque pixel outside the locked palette
//   alpha     a partially transparent pixel (the world's art has none)
//   empty     an icon with no pixels at all
//   switch    src/data/item-art.js lost its one switch (the client that wired it was
//             deleted 2026-10-17; the new screens wire it again)
//   duplicate two ids whose icon files are byte-identical: a different item wearing
//             another's art (seven practice-kit weapons shared tier-1 art until 2026-10-21).
//             KNOWN_TWINS lists the pairs still waiting for their own art.
//   wiring    bits.js no longer sends a basic supply id to SUPPLY_DIR, or an ability in
//             ABILITY_ART has no 32x32 tile
//
// The SAME rules (missing, orphan, size, palette, alpha, empty) also hold for the shop's
// basic supplies: one icon per row of src/data/supply-basics.js BASIC_SUPPLIES (salted
// food, thin drinks, plain ammo; they are not items) at assets/icons-bundle/pixel/supplies/.
//
// --selftest plants each defect into a copy of real shipped icons and requires it
// to be caught BY ITS NAMED RULE; the clean copy must stay silent.
//
// mutant-anchors: assets/icons-bundle/pixel/items/ assets/icons-bundle/pixel/supplies/ src/data/item-art.js art/world/palette.json
//
// Exit: 0 green · 1 a finding or a mutant escaped · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePNG, encodePNG, createImage } from '../tools/world-art/png.mjs';
import { inPalette } from '../tools/world-art/lock.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'assets/icons-bundle/pixel/items';
const SUPPLY = 'assets/icons-bundle/pixel/supplies';
/** Pairs of items that still share one icon, waiting for art of their own (Art Director). A new pair is a finding. */
const KNOWN_TWINS = [['crown_of_the_fallen_king', 'crown_shard'],
  /* The style ladder's two new tier-2 weapons (lane c-style-gear) wear their practice pair's icon until the Asset
     Director draws iron heads and an oak stock (no generated art in that lane). Mosslight Glade's items have their own
     icons since lane b-mosslight-art. */
  ['iron_hatchets', 'practice_hatchets'], ['oak_crossbow', 'practice_crossbow'],
  /* Grayjaw's Ruff (the loot bands' Thicket sample, lane b-loot-bands) wears the Houndskin Cloak's fur cape until the
     Asset Director draws Grayjaw's gray neck ruff (no generated art in that lane). */
  ['grayjaws_ruff', 'houndskin_cloak'],
  /* The Warrens' two new tier-3 Rares (loot bands batch 4) wear their tier-2 rung's icon until steel heads and a willow stock are drawn. */
  ['steel_hatchets', 'iron_hatchets'], ['steel_hatchets', 'practice_hatchets'], ['willow_crossbow', 'oak_crossbow'], ['willow_crossbow', 'practice_crossbow'],
  /* The Cellar's and the Warrens' imbuement items and the two boss Trophies (loot bands phase C) wear a near item's
     icon until their own are drawn: a hide, a stinger, a copper fleck, a shiv, a pot, a lash, tallow, two crowns. */
  ['giant_rat_hide', 'wolf_pelt'], ['hive_wasp_stinger', 'venom_sac'], ['glowing_copper_fleck', 'copper_ore'], ['skulkers_shiv', 'bronze_knife'],
  ['dented_copper_pot', 'copper_bar'], ['foremans_lash', 'snare_wire'], ['coppercaps_tallow', 'slime_gel'],
  ['rat_kings_crown', 'crown_of_the_fallen_king'], ['rat_kings_crown', 'crown_shard'], ['coppercaps_cauldron', 'war_crown'],
  /* The five shields (src/data/shields.js, lane b-spell-roles) wear the Practice Shield's icon until the Asset Director
     draws each: a bronze rim, iron bands on oak, the Rat King's drain grate, a copper cap on steel, a steel grate. */
  ...['practice_shield', 'bronze_rimmed_shield', 'ironbound_shield', 'kingsgrate', 'coppercap_shield', 'steelgrate']
    .flatMap((a, i, l) => l.slice(i + 1).map((b) => [a, b]))];

/** Byte-identical icon files under two ids, except the listed twins. */
export function checkDuplicates(dir, ids, twins = KNOWN_TWINS) {
  const out = [], seen = new Map();
  const allowed = (a, b) => twins.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  for (const id of ids) {
    let bytes;
    try { bytes = readFileSync(join(dir, id + '.png')).toString('base64'); } catch { continue; }
    if (seen.has(bytes) && !allowed(seen.get(bytes), id)) out.push({ rule: 'duplicate', id, detail: id + '.png is byte-identical to ' + seen.get(bytes) + '.png' });
    else if (!seen.has(bytes)) seen.set(bytes, id);
  }
  return out;
}

/** The supply icons in `dir` against BASIC_SUPPLIES' ids `sids`: the item rules, plus no shared art. */
export function checkSupplies(dir, sids) {
  return [...checkIcons(dir, sids), ...checkDuplicates(dir, sids)];
}

/** Findings for the icon folder `dir`, against the item ids `ids`. */
export function checkIcons(dir, ids) {
  const out = [];
  const files = new Set(readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)));
  for (const id of ids) if (!files.has(id)) out.push({ rule: 'missing', id, detail: 'no ' + id + '.png' });
  const known = new Set(ids);
  for (const f of files) if (!known.has(f)) out.push({ rule: 'orphan', id: f, detail: f + '.png belongs to no item' });
  for (const id of ids) {
    if (!files.has(id)) continue;
    let img;
    try { img = decodePNG(readFileSync(join(dir, id + '.png'))); } catch (e) { out.push({ rule: 'size', id, detail: 'not a decodable PNG: ' + e.message }); continue; }
    if (img.width !== 32 || img.height !== 32) { out.push({ rule: 'size', id, detail: `${img.width}x${img.height}, want 32x32` }); continue; }
    let opaque = 0, partial = 0, off = 0, first = '';
    for (let i = 0; i < img.data.length; i += 4) {
      const a = img.data[i + 3];
      if (a === 0) continue;
      if (a !== 255) { partial++; continue; }
      opaque++;
      if (!inPalette(img.data[i], img.data[i + 1], img.data[i + 2])) {
        off++;
        if (!first) first = '#' + [0, 1, 2].map((k) => img.data[i + k].toString(16).padStart(2, '0')).join('') + ' at ' + ((i / 4) % 32) + ',' + Math.floor(i / 128);
      }
    }
    if (!opaque) out.push({ rule: 'empty', id, detail: 'no opaque pixels' });
    if (partial) out.push({ rule: 'alpha', id, detail: partial + ' partially transparent pixels' });
    if (off) out.push({ rule: 'palette', id, detail: off + ' pixels off the palette (first ' + first + ')' });
  }
  return out;
}

/** The one switch and its wiring, read from source. */
export function checkSwitch(root) {
  const out = [];
  const art = readFileSync(join(root, 'src/data/item-art.js'), 'utf8');
  if (!/export const ITEM_ART_SET = '(pixel|painted)';/.test(art)) out.push({ rule: 'switch', id: 'item-art.js', detail: "ITEM_ART_SET must be exactly 'pixel' or 'painted'" });
  return out;
}

/** The render seam and the ability art, from source: a supply id reaches its own folder, every ability with art has its file. */
export async function checkWiring(root) {
  const out = [];
  const bits = readFileSync(join(root, 'src/shell/widgets/bits.js'), 'utf8');
  if (!/hasSupplyArt\(id\)[\s\S]{0,120}SUPPLY_DIR \+ id/.test(bits)) out.push({ rule: 'wiring', id: 'bits.js', detail: 'itemIconHtml no longer maps a basic supply id to SUPPLY_DIR (its icon would fall back to a chest glyph)' });
  const art = await import(pathToFileURL(join(root, 'src/data/item-art.js')).href);
  if (art.SUPPLY_DIR !== 'assets/icons-bundle/pixel/supplies/') out.push({ rule: 'wiring', id: 'item-art.js', detail: 'SUPPLY_DIR is not assets/icons-bundle/pixel/supplies/' });
  for (const id of art.ABILITY_ART) {
    let img;
    try { img = decodePNG(readFileSync(join(root, art.ABILITY_DIR, id + '.png'))); } catch (e) { out.push({ rule: 'wiring', id, detail: 'ability art listed with no decodable ' + id + '.png' }); continue; }
    if (img.width !== 32 || img.height !== 32) out.push({ rule: 'wiring', id, detail: 'ability tile is ' + img.width + 'x' + img.height + ', want 32x32' });
  }
  return out;
}

async function loadIds() {
  const { ITEMS } = await import(pathToFileURL(join(ROOT, 'src/data/items.js')).href);
  return Object.keys(ITEMS);
}

async function loadSupplyIds() {
  const { BASIC_SUPPLIES } = await import(pathToFileURL(join(ROOT, 'src/data/supply-basics.js')).href);
  const { SUPPLY_ART_AHEAD } = await import(pathToFileURL(join(ROOT, 'src/data/item-art.js')).href);
  // icons drawn ahead of their row must exist too; once the row lands the id is in BASIC_SUPPLIES and counted once
  return [...new Set([...BASIC_SUPPLIES.map((b) => b.id), ...SUPPLY_ART_AHEAD])];
}

function report(label, findings) {
  for (const f of findings.slice(0, 40)) console.error(`  [${f.rule}] ${f.id}: ${f.detail}`);
  if (findings.length > 40) console.error(`  ... and ${findings.length - 40} more`);
  console.log(`${label}: ${findings.length ? 'RED — ' + findings.length + ' finding(s)' : 'green'}`);
}

async function selftest(ids) {
  const real = join(ROOT, DIR);
  const pick = ids.slice(0, 6);
  const tmp = mkdtempSync(join(tmpdir(), 'pixel-icons-'));
  const fresh = () => { const d = mkdtempSync(join(tmp, 'd-')); for (const id of pick) copyFileSync(join(real, id + '.png'), join(d, id + '.png')); return d; };
  const rewrite = (d, id, fn) => { const img = decodePNG(readFileSync(join(d, id + '.png'))); fn(img); writeFileSync(join(d, id + '.png'), encodePNG(img)); };
  const firstOpaque = (img) => { for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] === 255) return i; return -1; };
  const cases = [
    ['missing', (d) => rmSync(join(d, pick[0] + '.png'))],
    ['orphan', (d) => copyFileSync(join(d, pick[0] + '.png'), join(d, 'not_an_item.png'))],
    ['size', (d) => writeFileSync(join(d, pick[1] + '.png'), encodePNG(createImage(16, 16)))],
    ['palette', (d) => rewrite(d, pick[2], (img) => { const i = firstOpaque(img); img.data[i] = 1; img.data[i + 1] = 2; img.data[i + 2] = 254; })],
    ['alpha', (d) => rewrite(d, pick[3], (img) => { img.data[firstOpaque(img) + 3] = 128; })],
    ['empty', (d) => rewrite(d, pick[4], (img) => { img.data.fill(0); })],
  ];
  let escaped = 0;
  const clean = checkIcons(fresh(), pick);
  if (clean.length) { console.error('pixel-icons --selftest: harness — the clean control is not clean: ' + JSON.stringify(clean)); process.exit(2); }
  for (const [rule, mutate] of cases) {
    const d = fresh(); mutate(d);
    const hit = checkIcons(d, pick).some((f) => f.rule === rule);
    console.log(`  ${hit ? 'caught ' : 'ESCAPED'} ${rule}`);
    if (!hit) escaped++;
  }
  // duplicate: one id wearing another's file, through the same call the real run makes
  { const d = fresh(); copyFileSync(join(d, pick[0] + '.png'), join(d, pick[5] + '.png'));
    const hit = checkDuplicates(d, pick, []).some((f) => f.rule === 'duplicate');
    const allowedPair = checkDuplicates(d, pick, [[pick[0], pick[5]]]).length === 0;   // a listed twin stays silent
    console.log(`  ${hit && allowedPair ? 'caught ' : 'ESCAPED'} duplicate`);
    if (!(hit && allowedPair)) escaped++; }
  // supplies: the supply folder runs the item rules (a missing file) and the duplicate rule
  { const sids = ['sup_a', 'sup_b'];
    const d = mkdtempSync(join(tmp, 'sup-'));
    copyFileSync(join(real, pick[0] + '.png'), join(d, 'sup_a.png'));
    const miss = checkSupplies(d, sids).some((f) => f.rule === 'missing' && f.id === 'sup_b');
    copyFileSync(join(real, pick[0] + '.png'), join(d, 'sup_b.png'));
    const dup = checkSupplies(d, sids).some((f) => f.rule === 'duplicate');
    console.log(`  ${miss && dup ? 'caught ' : 'ESCAPED'} supplies`);
    if (!(miss && dup)) escaped++; }
  // wiring: a bits.js that lost the supply branch, and an ability listed with no tile, must each trip it
  { const wroot = mkdtempSync(join(tmp, 'w-'));
    for (const f of ['src/shell/widgets/bits.js', 'src/data/item-art.js']) { mkdirSync(join(wroot, f.replace(/\/[^/]+$/, '')), { recursive: true }); copyFileSync(join(ROOT, f), join(wroot, f)); }
    mkdirSync(join(wroot, 'assets/icons-bundle/pixel/abilities'), { recursive: true });
    const { ABILITY_ART } = await import(pathToFileURL(join(ROOT, 'src/data/item-art.js')).href);
    for (const id of ABILITY_ART) copyFileSync(join(ROOT, 'assets/icons-bundle/pixel/abilities', id + '.png'), join(wroot, 'assets/icons-bundle/pixel/abilities', id + '.png'));
    const clean2 = (await checkWiring(wroot)).length === 0;
    rmSync(join(wroot, 'assets/icons-bundle/pixel/abilities', ABILITY_ART[0] + '.png'));
    const noTile = (await checkWiring(wroot)).some((f) => f.rule === 'wiring' && f.id === ABILITY_ART[0]);
    writeFileSync(join(wroot, 'src/shell/widgets/bits.js'), readFileSync(join(wroot, 'src/shell/widgets/bits.js'), 'utf8').replace('SUPPLY_DIR + id', 'PIXEL_DIR + id'));
    const noSeam = (await checkWiring(wroot)).some((f) => f.rule === 'wiring' && f.id === 'bits.js');
    console.log(`  ${clean2 && noTile && noSeam ? 'caught ' : 'ESCAPED'} wiring`);
    if (!(clean2 && noTile && noSeam)) escaped++; }
  // the switch: a source with no ITEM_ART_SET must trip 'switch'
  const sroot = mkdtempSync(join(tmp, 's-'));
  mkdirSync(join(sroot, 'src/data'), { recursive: true });
  writeFileSync(join(sroot, 'src/data/item-art.js'), 'export const OTHER = 1;');
  const sw = checkSwitch(sroot).some((f) => f.rule === 'switch');
  console.log(`  ${sw ? 'caught ' : 'ESCAPED'} switch`);
  if (!sw) escaped++;
  rmSync(tmp, { recursive: true, force: true });
  console.log(escaped ? `pixel-icons --selftest: RED — ${escaped} planted defect(s) escaped` : 'pixel-icons --selftest: all 10 planted defects caught; clean control silent');
  process.exit(escaped ? 1 : 0);
}

const ids = await loadIds();
const supplyIds = await loadSupplyIds();
if (process.argv.includes('--selftest')) await selftest(ids);
const findings = [...checkIcons(join(ROOT, DIR), ids), ...checkDuplicates(join(ROOT, DIR), ids), ...checkSupplies(join(ROOT, SUPPLY), supplyIds), ...(await checkWiring(ROOT)), ...checkSwitch(ROOT)];
report(`pixel-icons: ${ids.length} items + ${supplyIds.length} supplies`, findings);
process.exit(findings.length ? 1 : 0);
