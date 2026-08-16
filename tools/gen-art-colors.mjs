#!/usr/bin/env node
// ============================================================
// tools/gen-art-colors.mjs — derive per-item `controls.colors` palettes from
// the colour words already written into the prompt sheets.
//
//   node tools/gen-art-colors.mjs docs/design/item-art-prompts.md \
//        --out assets/art-pilot/item-colors.json
//   node tools/gen-art-colors.mjs docs/design/item-art-prompts.md --report
//   node tools/gen-art-colors.mjs docs/design/item-art-prompts.md \
//        --only bronze_sword,iron_sword --manifest ladder.json --out ladder-colors.json
//
// WHY IT EXISTS. art-direction-picker.md §0.10c: `controls.colors` is the only
// lever that overrides the custom style anchor's palette, and it is what fixed
// salmon-pink iron and polychrome `iron_ore`. The batch cannot be funded until
// all 512 items have a palette, and 512 hand-authored palettes would drift the
// moment a subject line changed. The subject lines ALREADY name their colours in
// a controlled vocabulary; this reads them through tools/lib/art-palette.mjs.
//
// IT FAILS LOUDLY, BY DESIGN. A silent skip would ship an item to a $0.04
// generation with the anchor's own (wrong) palette and nobody would know until
// the contact sheet. So: any line that yields ZERO colours, or that still
// contains a colour word after every table phrase has been consumed, is listed
// and the process exits non-zero. Coverage is therefore PROVEN by running it
// over all 512 lines, not asserted.
//
// OUTPUT is exactly what gen-art.mjs --colors takes: an object keyed by the
// manifest's output path, valued with 2-4 [r,g,b] triples.
//   { "weapons/iron_sword.png": [[150,156,162],[132,88,48],[26,28,32]] }
// --manifest additionally writes the matching [{file,prompt}] JSON manifest
// with the §0.1 wrapper assembled, so the two files are guaranteed to join on
// the same keys. (Keys that do not join are silently ignored by gen-art.mjs —
// which is the one way this whole mechanism can fail invisibly.)
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { PALETTE, MATERIALS, CONTOUR, COLOUR_TOKENS, COLOUR_TOKEN_EXEMPT } from './lib/art-palette.mjs';

// CLI-only when run directly; importable as a library so tests/art-palette.mjs
// can prove coverage without shelling out.
const IS_CLI = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/gen-art-colors.mjs');
const argv = IS_CLI ? process.argv.slice(2) : [];
const flag = (n, d = '') => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const sheet = argv.find((a) => !a.startsWith('--') && a.endsWith('.md'));
if (IS_CLI && !sheet) {
  console.error('usage: node tools/gen-art-colors.mjs <prompt-sheet.md> [--out colors.json] [--manifest m.json] [--only id,id] [--report]');
  process.exit(2);
}
const OUT = flag('out', '');
const MANIFEST = flag('manifest', '');
const ONLY = flag('only', '') ? new Set(flag('only').split(',').map((s) => s.trim())) : null;
const REPORT = argv.includes('--report');
const MAX = Number(flag('max', '4'));

// ── the §0.1 wrapper, byte-for-byte from art-direction-picker.md §0.3-0.9 ──
// Do NOT re-cut these. Two experiments (§0.10b, §0.10c EXPERIMENT B) proved
// that rewording the wrapper changes nothing about the output; the only thing
// re-cutting achieves is invalidating the character-budget measurement.
const P_ITEM = 'Game icon, ONE object, three-quarter top-down loot angle, centred, filling the frame, chunky-heroic exaggerated proportions, one oversized specimen — never a pile, handful or serving, never on a board, dish or cloth unless the object is the vessel,';
const P_WEAPON = 'Game icon, ONE weapon flat to the screen in full profile on a diagonal, blade or head upper-left, grip lower-right, no foreshortening or tilt, centred, filling the frame, chunky-heroic exaggerated proportions, never a bundle, rack or pair,';
// P-SHAFT — the bladeless weapons. See the b360 diagnosis in the Art Director
// log: P-WEAPON's "blade or head upper-left" is a FEATURE-SUMMONING clause, the
// third proven instance in this programme. Measured against the delivered batch,
// objects that HAVE a blade or head (sword/axe/pickaxe/warhammer/knife) failed
// 1/33 = 3%; objects that have NEITHER (staff, rod, arrow, needle) failed
// 28/28 = 100%, every one of them by growing the blade the wrapper named.
// So this variant names NO anatomy the object does not have: "tip" and "foot"
// are true of a staff, a rod, an arrow and a needle alike, and of a bow's two
// limbs. Nothing here is a re-wording for taste — §0.10b/§0.10c both proved
// re-wording alone changes nothing. This removes a noun that was being drawn.
const P_SHAFT = 'Game icon, ONE slender shafted object flat to the screen in full profile on a long diagonal, tip upper-left, foot lower-right, no foreshortening or tilt, centred, filling the frame, chunky-heroic exaggerated proportions, a single specimen, never a bundle, sheaf, rack or pair,';
const C_METAL = 'iron, steel, mithril and dawnsteel read cold grey to silver-blue with no warm tint; bronze, copper and gold stay warm,';
const C_ENCHANT = 'blade, point, arrowhead and fletching carry no elemental colour unless named above,';
// Same reason as P-SHAFT: the bladed form of this clause says "blade" to objects
// that have none. The property it enforces is identical.
const C_ENCHANT_SHAFT = 'point, tip and fletching carry no elemental colour unless named above,';
const SUFFIX = 'colour comes from the light, not the material — grey, black, bone and stone stay neutral, and only colours named above appear as local colour; silhouette-first, readable at 40px, no detail finer than a sixteenth of the frame; fully transparent background, no backdrop, vignette, scenery, ground, shadow, frame, text, watermark or UI.';
const CAP = 1000;

// ── sheet parsing ───────────────────────────────────────────────────────────
// Both sheets are markdown tables under `###` section headings. Items carry a
// File column; monsters do not (their id IS the filename stem).
function parseSheet(p) {
  const raw = fs.readFileSync(p, 'utf8').replace(/\r/g, '');
  const rows = [];
  let sec = '';
  for (const line of raw.split('\n')) {
    const h = line.match(/^#{2,3}\s+(.*)$/);
    if (h) { sec = h[1]; continue; }
    const item = line.match(/^\|\s*([A-Za-z][A-Za-z0-9_-]*)\s*\|([^|]*)\|([^|]*)\|\s*`([a-z0-9_]+\.png)`\s*\|\s*$/);
    if (item) { rows.push({ id: item[1], name: item[2].trim(), subject: item[3].trim(), file: item[4], sec }); continue; }
    const mon = line.match(/^\|\s*((?:MON|DNG)-[A-Z]+-\d+)\s*\|([^|]*)\|(.*?)\|\s*$/);
    if (mon) rows.push({ id: mon[1], name: mon[2].trim(), subject: mon[3].trim(), file: null, sec, monster: true });
  }
  if (!rows.length) throw new Error(`${p} parsed to zero rows — wrong file or the table shape changed`);
  return rows;
}

// ── folder + wrapper category, derived from the section heading ────────────
// gen-art.mjs's own markdown parser uses items/weapons/armour/food/monsters, so
// these are the same four buckets and nothing new is invented.
const WEAPON_SEC = /weapon|sword|bow|staff|staves|ammo|arrow|dagger|axe|mace|warhammer|spear|wand|tool|bane|scimitar/i;
const ARMOUR_SEC = /armour|armor|shield|helm/i;
const FOOD_SEC = /food|fish|cooked|meal|meat|roast|feast|dish|crop|pie|brew|potion|consumable/i;
const TOOL_WORDS = /\b(axe|pickaxe|fishing rod|rod|harpoon|sickle|chisel|hammer)\b/i;
// The "uniques" sections mix weapons, armour and trinkets, so the section
// heading alone puts a staff in items/. Fall back to the object noun: §0.4's
// fixed weapon orientation is a per-OBJECT rule, and getting it wrong is the
// difference between an armoury that reads as one shelf and one that does not.
const WEAPON_NOUN = /\b(sword|blade|dagger|scimitar|axe|maul|mace|warhammer|hammer|spear|halberd|glaive|staff|staves|wand|rod|bow|crossbow|arrow|bolt|sling|scythe|whip|flail|cleaver|knife|pick|pickaxe|harpoon|sickle|chisel|censer|stick|club)\b/i;
// The bladeless subset of WEAPON_NOUN — same folder, different prefix.
// Deliberately EXCLUDES maul/mace/warhammer/hammer/club/censer: those DO carry a
// head, P-WEAPON is true of them, and they shipped (stone_maul, lazlos_maul and
// every warhammer are in SHIPPED). Only nouns with neither blade nor head.
const SHAFT_NOUN = /\b(staff|staves|rod|wand|arrow|arrows|bolt|bolts|needle|bow|bows|crossbow|longbow|shortbow|recurve|sling|dart|darts)\b/i;

function categorise(row) {
  if (row.monster) return { folder: 'monsters', prefix: null };
  const s = row.sec;
  if (WEAPON_SEC.test(s) || TOOL_WORDS.test(row.name) || WEAPON_NOUN.test(row.name)) {
    return { folder: 'weapons', prefix: SHAFT_NOUN.test(row.name) ? 'shaft' : 'weapon' };
  }
  // A shafted object can also land OUTSIDE the weapons sections — the "uniques"
  // tables put `demoncaller_staff`, `blight_arrows` and `frost_arrows` in items/,
  // and all three failed exactly like their weapons/ siblings. The FOLDER is a
  // filesystem fact and stays as it was (moving it would orphan the delivered
  // raws); the PREFIX follows the object, which is what §0.4 actually rules on.
  if (SHAFT_NOUN.test(row.name)) {
    if (ARMOUR_SEC.test(s)) return { folder: 'armour', prefix: 'shaft' };
    if (FOOD_SEC.test(s)) return { folder: 'food', prefix: 'shaft' };
    return { folder: 'items', prefix: 'shaft' };
  }
  if (ARMOUR_SEC.test(s)) return { folder: 'armour', prefix: 'item' };
  if (FOOD_SEC.test(s)) return { folder: 'food', prefix: 'item' };
  return { folder: 'items', prefix: 'item' };
}

const METAL_WORDS = /\b(bronze|iron|steel|mithril|rune|silvered|dawnsteel|heat-blued|brass|copper|gold|silver|metal|blade|plate|nail|bar|ingot)\b/i;

function assemble(row) {
  const { prefix } = categorise(row);
  const PRE = { weapon: P_WEAPON, shaft: P_SHAFT, item: P_ITEM };
  const parts = [PRE[prefix] || P_ITEM, row.subject];
  const clauses = [];
  if (METAL_WORDS.test(row.subject)) clauses.push(C_METAL);
  if (prefix === 'weapon') clauses.push(C_ENCHANT);
  else if (prefix === 'shaft') clauses.push(C_ENCHANT_SHAFT);
  return [parts.join(' '), ...clauses, SUFFIX].join(', ').replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
}

// ── the derivation ─────────────────────────────────────────────────────────
// Longest-phrase-first over a normalised subject line. Every matched span is
// blanked out so (a) a phrase is never counted twice and (b) whatever is LEFT
// can be swept for unmapped colour words.
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

const PHRASES = [];
for (const [name, def] of Object.entries(PALETTE)) {
  for (const m of def.match) PHRASES.push({ name, phrase: norm(m) });
}
PHRASES.sort((a, b) => b.phrase.length - a.phrase.length);

const MATERIAL_PHRASES = [];
for (const [name, words] of Object.entries(MATERIALS)) {
  if (!PALETTE[name]) throw new Error(`MATERIALS points at unknown colour name "${name}"`);
  for (const w of words) MATERIAL_PHRASES.push({ name, phrase: norm(w) });
}
MATERIAL_PHRASES.sort((a, b) => b.phrase.length - a.phrase.length);

// Hyphens become spaces EVERYWHERE — in the text and in the table's phrases
// alike. The sheet writes the same colour both ways ("blue-silver" vs "pale
// blue silver", "gold-and-enamel", "hound-pelt", "corpse-forged death-steel"),
// and treating a hyphenated compound as one opaque token both missed matches
// AND hid colour words from the residual sweep — a silent failure, which is the
// one outcome this tool exists to prevent.
function normalise(s) {
  return s.toLowerCase()
    .replace(/\*\*/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function derive(subject, MAX = 4) {
  let text = ` ${normalise(subject)} `;
  const hits = [];
  for (const { name, phrase } of PHRASES) {
    const needle = ` ${phrase} `;
    let at;
    while ((at = text.indexOf(needle)) !== -1) {
      hits.push({ name, at });
      // keep the surrounding spaces so adjacent phrases still match
      text = text.slice(0, at + 1) + ' '.repeat(phrase.length) + text.slice(at + 1 + phrase.length);
    }
  }
  hits.sort((a, b) => a.at - b.at);
  const names = [];
  for (const h of hits) if (!names.includes(h.name)) names.push(h.name);

  // residual colour words = the fail-loudly signal. Swept BEFORE the material
  // fallback runs, so a material never masks an unmapped colour word.
  const residual = text
    .split(/[\s ]+/)
    .filter(Boolean)
    .filter((w) => COLOUR_TOKENS.has(w) && !COLOUR_TOKEN_EXEMPT.has(w));

  // Material fallback — only ever ADDS to the tail, so a written colour always
  // takes the dominant first slot.
  // It fires ONLY when the line named no colour at all. Using it as a filler on
  // a line that DID name a colour actively corrupts the palette: `bronze_sword`
  // says "soft warm metal", the generic word for its own bronze, and the
  // fallback was reading that as a third triple of IRON GREY — handing the
  // ladder's warmest rung a cold hue. A material is a substitute for a missing
  // colour, never a supplement to a stated one.
  const fromMaterial = [];
  if (!names.length) {
    for (const { name, phrase } of MATERIAL_PHRASES) {
      if (names.includes(name) || fromMaterial.includes(name)) continue;
      if (text.includes(` ${phrase} `) || text.includes(` ${phrase}s `)) {
        fromMaterial.push(name);
        if (names.length + fromMaterial.length >= MAX - 1) break;
      }
    }
  }
  names.push(...fromMaterial);

  // Palette shape: primary material first (the anchor spends the first triple
  // as the dominant local colour), then up to two accents, then the shared
  // near-black contour — the exact shape of the one verified-good §0.10c call.
  const picked = names.slice(0, MAX - 1);
  if (!picked.includes(CONTOUR) && picked.length < MAX) picked.push(CONTOUR);
  return { names, picked, residual: [...new Set(residual)], viaMaterial: fromMaterial.length };
}

// ── the analysis, as a library call ─────────────────────────────────────────
export function analyse(sheetPath, { only = null, max = 4, onRow = null } = {}) {
const rows = parseSheet(sheetPath).filter((r) => !only || only.has(r.id) || only.has((r.file || '').replace('.png', '')));
if (only && !rows.length) throw new Error(`--only matched no rows in ${sheetPath}`);

const colors = {};
const manifest = [];
const failures = [];
const unmapped = new Map();
const histogram = new Map();
let tooLong = 0;

for (const row of rows) {
  const { folder } = categorise(row);
  const file = `${folder}/${row.file || `${row.id.toLowerCase()}.png`}`;
  const d = derive(row.subject, max);

  // Recraft's controls.colors takes 2-4 triples (§0.10c). One triple is not a
  // palette — it hands the anchor a single hue and lets it invent the rest,
  // which is the failure mode this whole mechanism exists to close.
  if (!d.names.length) failures.push(`${row.id} (${file}) — NO colour phrase matched: "${row.subject.slice(0, 90)}"`);
  else if (d.picked.length < 2) failures.push(`${row.id} (${file}) — only ONE colour (${d.picked[0]}); controls.colors needs 2-4`);
  for (const w of d.residual) {
    failures.push(`${row.id} (${file}) — UNMAPPED colour word "${w}" in: "${row.subject.slice(0, 90)}"`);
    unmapped.set(w, (unmapped.get(w) || 0) + 1);
  }
  for (const n of d.names) histogram.set(n, (histogram.get(n) || 0) + 1);

  colors[file] = d.picked.map((n) => PALETTE[n].rgb);
  if (!row.monster) {
    const prompt = assemble(row);
    if (prompt.length > CAP) { tooLong++; failures.push(`${row.id} — assembled prompt ${prompt.length} chars, over the ${CAP} cap`); }
    manifest.push({ file, prompt });
  }
  if (onRow) onRow(file, d);
}

const bad = new Set(failures.map((f) => f.split(' ')[0]));
const covered = rows.length - bad.size;
return { rows, colors, manifest, failures, unmapped, histogram, tooLong, covered, bad };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (!IS_CLI) { /* imported as a library — nothing below runs */ } else {
const { rows, colors, manifest, failures, unmapped, histogram, tooLong, covered, bad } =
  analyse(sheet, { only: ONLY, max: MAX, onRow: REPORT ? (file, d) => console.log(`${file.padEnd(46)} ${d.picked.join(' + ')}`) : null });
console.log('');
console.log(`sheet:      ${path.basename(sheet)}`);
console.log(`rows:       ${rows.length}`);
console.log(`table:      ${Object.keys(PALETTE).length} canonical colour names, ${PHRASES.length} match phrases`);
console.log(`coverage:   ${covered}/${rows.length} (${((100 * covered) / rows.length).toFixed(1)}%)`);
const sizes = Object.values(colors).map((c) => c.length);
console.log(`palettes:   ${Object.keys(colors).length} written, ${Math.min(...sizes)}-${Math.max(...sizes)} triples each`);
if (manifest.length) console.log(`prompts:    max ${Math.max(...manifest.map((m) => m.prompt.length))} chars (cap ${CAP}), ${tooLong} over`);

if (REPORT) {
  console.log('\ncolour-name usage across the sheet:');
  for (const [n, c] of [...histogram].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(4)}  ${n}`);
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} problem(s) across ${bad.size} row(s) — NOTHING WAS WRITTEN.`);
  console.error('  Every one is either a line with no colour at all or a colour word the table');
  console.error('  does not know. Add the name to tools/lib/art-palette.mjs, or fix the line.');
  for (const f of failures.slice(0, 60)) console.error(`  · ${f}`);
  if (failures.length > 60) console.error(`  · …and ${failures.length - 60} more`);
  if (unmapped.size) {
    console.error('\n  unmapped words by frequency:');
    for (const [w, c] of [...unmapped].sort((a, b) => b[1] - a[1])) console.error(`    ${String(c).padStart(4)}  ${w}`);
  }
  process.exit(1);
}

// One line per file — a palette is read by a human comparing rungs of a ladder,
// and JSON.stringify's default pretty-printer puts every colour CHANNEL on its
// own line, which makes that impossible.
const compactColors = (o) =>
  '{\n' + Object.entries(o).map(([k, v]) => `  ${JSON.stringify(k)}: [${v.map((c) => `[${c.join(',')}]`).join(', ')}]`).join(',\n') + '\n}\n';
const compactManifest = (a) =>
  '[\n' + a.map((r) => `  { "file": ${JSON.stringify(r.file)}, "prompt": ${JSON.stringify(r.prompt)} }`).join(',\n') + '\n]\n';

if (OUT) { fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true }); fs.writeFileSync(OUT, compactColors(colors)); console.log(`\nwrote ${OUT}`); }
if (MANIFEST) { fs.mkdirSync(path.dirname(path.resolve(MANIFEST)), { recursive: true }); fs.writeFileSync(MANIFEST, compactManifest(manifest)); console.log(`wrote ${MANIFEST}`); }
if (!OUT && !MANIFEST) console.log('\n(dry run — pass --out and/or --manifest to write)');
console.log('✓ every row mapped');
}
