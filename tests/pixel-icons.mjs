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
//   wiring    bits.js no longer sends a basic supply id to SUPPLY_DIR, an ability in ABILITY_ART has no
//             32x32 tile, or an ability has no tile at all (it would show a grey glyph beside framed
//             tiles in Configure action, the art audit's gap 3)
//   longbow   items/longbow.png is not what tools/world-art/longbow-icon.mjs draws: the old file was a
//             thick limb over a grey stock and read as a crossbow (player note a43, 2026-10-24); the
//             script is the source, so a hand edit or an old copy of the file is a finding
//   heads     a HEAD_ART id (src/data/monster-art.js) with no creature row, or an id in both head lists; the heads folder also runs
//             the missing, orphan, size, palette, alpha and empty rules (32x32 busts, one file per listed id)
//   drawn     the same for the icons tools/world-art/twin-icons.mjs and ability-tiles.mjs draw
//
// The SAME rules (missing, orphan, size, palette, alpha, empty) also hold for the shop's
// basic supplies: one icon per row of src/data/supply-basics.js BASIC_SUPPLIES (salted
// food, thin drinks, plain ammo; they are not items) at assets/icons-bundle/pixel/supplies/.
//
// --selftest plants each defect into a copy of real shipped icons and requires it
// to be caught BY ITS NAMED RULE; the clean copy must stay silent.
//
// mutant-anchors: assets/icons-bundle/pixel/items/ assets/icons-bundle/pixel/heads/ src/data/monster-art.js assets/icons-bundle/pixel/supplies/ assets/icons-bundle/pixel/abilities/ src/data/item-art.js art/world/palette.json tools/world-art/longbow-icon.mjs tools/world-art/twin-icons.mjs tools/world-art/ability-tiles.mjs
//
// Exit: 0 green · 1 a finding or a mutant escaped · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePNG, encodePNG, createImage } from '../tools/world-art/png.mjs';
import { inPalette } from '../tools/world-art/lock.mjs';
import { drawGrid, toImage } from '../tools/world-art/longbow-icon.mjs';
import { DRAW as TWIN_ICONS, toImage as twinImage } from '../tools/world-art/twin-icons.mjs';
import { DRAW as ABILITY_TILES, toImage as tileImage } from '../tools/world-art/ability-tiles.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'assets/icons-bundle/pixel/items';
const SUPPLY = 'assets/icons-bundle/pixel/supplies';
const HEADS = 'assets/icons-bundle/pixel/heads';
const ABILITY = 'assets/icons-bundle/pixel/abilities';
/** Pairs of items that share one icon. The second of each is a later or cut item no hero can reach today, so the two never
    share a shelf (src/data/catalogue-coherence.js reachableSources); it gets its own when it opens. A new pair is a finding. */
const KNOWN_TWINS = [
  ['graypelt_cloak', 'woolen_cloak'], ['skulkers_shiv', 'bronze_knife'],
  ['rat_kings_crown', 'crown_of_the_fallen_king'], ['torn_company_badge', 'warlord_badge']];

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

/** The Longbow's icon is drawn by tools/world-art/longbow-icon.mjs (a tall stave and a string, no stock); `file` must hold exactly those pixels. */
export function checkLongbow(file) {
  let img;
  try { img = decodePNG(readFileSync(file)); } catch (e) { return [{ rule: 'longbow', id: 'longbow', detail: 'not a decodable PNG: ' + e.message }]; }
  const want = toImage(drawGrid());
  const same = img.width === want.width && img.height === want.height && Buffer.from(img.data).equals(Buffer.from(want.data));
  return same ? [] : [{ rule: 'longbow', id: 'longbow', detail: 'longbow.png differs from what tools/world-art/longbow-icon.mjs draws (edit the script and rerun it, never the PNG)' }];
}

/** Icons a script draws (`draw`: id -> grid, `image`: grid -> image): `dir/<id>.png` must hold exactly those pixels. */
export function checkDrawn(dir, draw, image) {
  const out = [];
  for (const [id, fn] of Object.entries(draw)) {
    let img;
    try { img = decodePNG(readFileSync(join(dir, id + '.png'))); } catch (e) { out.push({ rule: 'drawn', id, detail: 'not a decodable PNG: ' + e.message }); continue; }
    const want = image(fn());
    const same = img.width === want.width && img.height === want.height && Buffer.from(img.data).equals(Buffer.from(want.data));
    if (!same) out.push({ rule: 'drawn', id, detail: id + '.png differs from what its script draws (edit the script and rerun it, never the PNG)' });
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

/** The render seam and the ability art, from source: a supply id reaches its own folder, every ability (`abilityIds`) has art, and all art has its file. */
export async function checkWiring(root, abilityIds) {
  const out = [];
  const bits = readFileSync(join(root, 'src/shell/widgets/bits.js'), 'utf8');
  if (!/hasSupplyArt\(id\)[\s\S]{0,120}SUPPLY_DIR \+ id/.test(bits)) out.push({ rule: 'wiring', id: 'bits.js', detail: 'itemIconHtml no longer maps a basic supply id to SUPPLY_DIR (its icon would fall back to a chest glyph)' });
  const art = await import(pathToFileURL(join(root, 'src/data/item-art.js')).href);
  if (art.SUPPLY_DIR !== 'assets/icons-bundle/pixel/supplies/') out.push({ rule: 'wiring', id: 'item-art.js', detail: 'SUPPLY_DIR is not assets/icons-bundle/pixel/supplies/' });
  for (const id of abilityIds) if (!art.ABILITY_ART.includes(id)) out.push({ rule: 'wiring', id, detail: 'this ability has no tile in ABILITY_ART: Configure action would show a grey glyph beside framed tiles' });
  for (const id of art.ABILITY_ART) {
    let img;
    try { img = decodePNG(readFileSync(join(root, art.ABILITY_DIR, id + '.png'))); } catch (e) { out.push({ rule: 'wiring', id, detail: 'ability art listed with no decodable ' + id + '.png' }); continue; }
    if (img.width !== 32 || img.height !== 32) out.push({ rule: 'wiring', id, detail: 'ability tile is ' + img.width + 'x' + img.height + ', want 32x32' });
  }
  return out;
}

async function loadIds() {
  const { ITEMS } = await import(pathToFileURL(join(ROOT, 'src/data/items.js')).href);
  const { ITEM_ART_AHEAD } = await import(pathToFileURL(join(ROOT, 'src/data/item-art.js')).href);
  // icons drawn ahead of their row must exist too; once the row lands the id is in ITEMS and counted once
  return [...new Set([...Object.keys(ITEMS), ...ITEM_ART_AHEAD])];
}

/** The head lists against the creature rows (`monsterIds`): a live head belongs to a creature, and no id sits in both lists (an AHEAD id whose row has landed may stay until moved). */
export function checkHeads(art, monsterIds) {
  const out = [];
  for (const id of art.HEAD_ART) if (!monsterIds.has(id)) out.push({ rule: 'heads', id, detail: 'in HEAD_ART but no creature has this id (a rename that left the head behind, or a head listed before its row: HEAD_ART_AHEAD)' });
  for (const id of art.HEAD_ART_AHEAD) if (art.HEAD_ART.includes(id)) out.push({ rule: 'heads', id, detail: 'in both HEAD_ART and HEAD_ART_AHEAD' });
  return out;
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
    const clean2 = (await checkWiring(wroot, ABILITY_ART)).length === 0;
    const noArt = (await checkWiring(wroot, [...ABILITY_ART, 'an_untiled_ability'])).some((f) => f.rule === 'wiring' && f.id === 'an_untiled_ability');
    rmSync(join(wroot, 'assets/icons-bundle/pixel/abilities', ABILITY_ART[0] + '.png'));
    const noTile = (await checkWiring(wroot, ABILITY_ART)).some((f) => f.rule === 'wiring' && f.id === ABILITY_ART[0]);
    writeFileSync(join(wroot, 'src/shell/widgets/bits.js'), readFileSync(join(wroot, 'src/shell/widgets/bits.js'), 'utf8').replace('SUPPLY_DIR + id', 'PIXEL_DIR + id'));
    const noSeam = (await checkWiring(wroot, ABILITY_ART)).some((f) => f.rule === 'wiring' && f.id === 'bits.js');
    console.log(`  ${clean2 && noArt && noTile && noSeam ? 'caught ' : 'ESCAPED'} wiring`);
    if (!(clean2 && noArt && noTile && noSeam)) escaped++; }
  // drawn: the shipped files are silent; a one-pixel edit to a script's icon and an old file under its name each trip it
  { const clean4 = checkDrawn(real, TWIN_ICONS, twinImage).length === 0 && checkDrawn(join(ROOT, ABILITY), ABILITY_TILES, tileImage).length === 0;
    const d = mkdtempSync(join(tmp, 'dr-')), id = Object.keys(TWIN_ICONS)[0];
    for (const k of Object.keys(TWIN_ICONS)) copyFileSync(join(real, k + '.png'), join(d, k + '.png'));
    rewrite(d, id, (img) => { const i = firstOpaque(img); img.data[i] = img.data[i] ^ 8; });
    const onepx = checkDrawn(d, TWIN_ICONS, twinImage).some((f) => f.rule === 'drawn' && f.id === id);
    copyFileSync(join(real, id + '.png'), join(d, id + '.png'));
    const other = Object.keys(TWIN_ICONS)[1];
    copyFileSync(join(real, 'practice_shield.png'), join(d, other + '.png'));
    const swapped = checkDrawn(d, TWIN_ICONS, twinImage).some((f) => f.rule === 'drawn' && f.id === other);
    console.log(`  ${clean4 && onepx && swapped ? 'caught ' : 'ESCAPED'} drawn`);
    if (!(clean4 && onepx && swapped)) escaped++; }
  // longbow: the shipped file is silent; the old crossbow-looking art (a different image) and a one-pixel edit each trip it
  { const clean3 = checkLongbow(join(real, 'longbow.png')).length === 0;
    const d = mkdtempSync(join(tmp, 'lb-'));
    copyFileSync(join(real, 'longbow.png'), join(d, 'edited.png'));
    rewrite(d, 'edited', (img) => { const i = firstOpaque(img); img.data[i] = img.data[i] ^ 8; });
    const onepx = checkLongbow(join(d, 'edited.png')).some((f) => f.rule === 'longbow');
    const other = join(d, 'other.png');
    copyFileSync(join(real, 'shortbow.png'), other);
    const swapped = checkLongbow(other).some((f) => f.rule === 'longbow');
    console.log(`  ${clean3 && onepx && swapped ? 'caught ' : 'ESCAPED'} longbow`);
    if (!(clean3 && onepx && swapped)) escaped++; }
  // the switch: a source with no ITEM_ART_SET must trip 'switch'
  const sroot = mkdtempSync(join(tmp, 's-'));
  mkdirSync(join(sroot, 'src/data'), { recursive: true });
  writeFileSync(join(sroot, 'src/data/item-art.js'), 'export const OTHER = 1;');
  const sw = checkSwitch(sroot).some((f) => f.rule === 'switch');
  console.log(`  ${sw ? 'caught ' : 'ESCAPED'} switch`);
  if (!sw) escaped++;
  // heads: an id in HEAD_ART that is no monster, an id in both lists, and the folder rules (a file with no list entry is an orphan)
  { const art = { HEAD_ART: ['rat', 'no_such_beast'], HEAD_ART_AHEAD: ['farmhand', 'rat'] };
    const found = checkHeads(art, new Set(['rat'])).map((f) => f.id + ':' + f.rule).join();
    const hit = found.includes('no_such_beast:heads') && found.includes('rat:heads');
    const quiet = checkHeads({ HEAD_ART: ['rat'], HEAD_ART_AHEAD: ['farmhand'] }, new Set(['rat'])).length === 0;
    const dir = mkdtempSync(join(tmp, 'h-'));
    copyFileSync(join(real, pick[0] + '.png'), join(dir, 'rat.png'));
    copyFileSync(join(real, pick[1] + '.png'), join(dir, 'stray.png'));
    const orphan = checkIcons(dir, ['rat']).some((f) => f.rule === 'orphan' && f.id === 'stray');
    console.log(`  ${hit && quiet && orphan ? 'caught ' : 'ESCAPED'} heads`);
    if (!(hit && quiet && orphan)) escaped++; }
  rmSync(tmp, { recursive: true, force: true });
  console.log(escaped ? `pixel-icons --selftest: RED — ${escaped} planted defect(s) escaped` : 'pixel-icons --selftest: all 13 planted defects caught; clean control silent');
  process.exit(escaped ? 1 : 0);
}

async function loadAbilityIds() {
  const { ABILITIES } = await import(pathToFileURL(join(ROOT, 'src/data/abilities.js')).href);
  return Object.keys(ABILITIES);
}

const ids = await loadIds();
const supplyIds = await loadSupplyIds();
const abilityIds = await loadAbilityIds();
if (process.argv.includes('--selftest')) await selftest(ids);
const headArt = await import(pathToFileURL(join(ROOT, 'src/data/monster-art.js')).href);
const { MONSTERS } = await import(pathToFileURL(join(ROOT, 'src/data/monsters.js')).href);
const headIds = headArt.HEAD_ART.concat(headArt.HEAD_ART_AHEAD);
const findings = [...checkIcons(join(ROOT, HEADS), headIds), ...checkDuplicates(join(ROOT, HEADS), headIds, []), ...checkHeads(headArt, new Set(Object.keys(MONSTERS))),
  ...checkIcons(join(ROOT, DIR), ids), ...checkDuplicates(join(ROOT, DIR), ids), ...checkSupplies(join(ROOT, SUPPLY), supplyIds), ...(await checkWiring(ROOT, abilityIds)), ...checkSwitch(ROOT), ...checkLongbow(join(ROOT, DIR, 'longbow.png')),
  ...checkDrawn(join(ROOT, DIR), TWIN_ICONS, twinImage), ...checkDrawn(join(ROOT, ABILITY), ABILITY_TILES, tileImage)];
report(`pixel-icons: ${ids.length} items + ${supplyIds.length} supplies + ${headIds.length} heads`, findings);
process.exit(findings.length ? 1 : 0);
