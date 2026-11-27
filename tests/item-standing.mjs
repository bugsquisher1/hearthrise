#!/usr/bin/env node
// mutant-rule-functions: pure
// ════════════════════════════════════════════════════════════════════════
// tests/item-standing.mjs — A RARE OR SIGNATURE PIECE STANDS OUT, AND THE SAME WAY ON EVERY SURFACE (art director, lane/a1-rare-frame,
// 2026-11-26; docs/design/redesign/20-v030-the-roads.md A1 and gate 12: "Every Rare and Signature has a standout icon or the Rare frame").
//
//   node tests/item-standing.mjs            the rules
//   node tests/item-standing.mjs --mutate   every planted defect must turn a rule RED
//
// ci-step: client-guards | Presentation floor - the Rare and Signature frame
// ci-run: node tests/item-standing.mjs
// ci-run: node tools/mutant-gate.mjs node tests/item-standing.mjs --mutate
//
// mutant-anchors: src/shell/item-standing.js src/shell/widgets/bits.js src/shell/windows/inventory/pockets.js src/shell/item-lore.js src/shell/share-card.js src/shell/windows/hunt-summary.js src/styles/hunt.css src/styles/summary.css
// mutant-writes-tree: no — every mutant is planted into a temp copy of src (tests/_pure-guard.mjs planted)
//
// Plain gear is the floor; a Rare carries a Trait, a Signature is a named piece (06-comparison.md 2c). The step is the PIECE's (the
// trait_pieces row: src/core/carry-over.js), never the catalogue's `rarity`, which is a metal's rung (a steel sword reads "rare" there).
//   IS-1  STANDING (src/shell/item-standing.js): a plain id stands for nothing, whatever its catalogue rung; every Signature id stands as
//         a Signature; a piece is Rare by its rarity or a Trait, Very Rare by its rarity, a Signature only by a Signature that exists (a
//         forged name is its plain base)
//   IS-2  ONE FRAME: bits.js itemIconHtml draws a Rare and a Signature inside .hh-std (one icon, the piece's own art) and a plain row
//         with none; the bag and Storage pocket (pockets.js) gets it for a Signature and paints a plain steel piece by nothing (no
//         rarity class, no pips); the tooltip's kind line names Rare only for a Rare; the share card frames and inks a Signature, not a
//         plain find
//   IS-3  EVERY SURFACE GOES THROUGH IT: the bag and Storage pocket, the worn slots, the picked item and loot rows, the hunt summary's
//         drop lines, the return card and the Tower chest's haul each call itemIconHtml; no other src/shell file writes an item's art
//         path (PIXEL_DIR) into a page but the ones listed with why; nothing in src/shell or src/styles paints by the catalogue's rung
//   IS-4  THE FRAME'S CSS (hunt.css .hh-std): one art px outside the icon, under it (the icon positioned above), each frame's slice the
//         slice its PNG is drawn at (tools/make-ui-steel-art.mjs), and a framed pocket's rim steps aside (windows.css)
// ════════════════════════════════════════════════════════════════════════
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { runPureGuard, ROOT } from './_pure-guard.mjs';
import { decodePNG } from '../tools/world-art/png.mjs';

const G = { uiLock: 'M0 0', uiChest: 'M1 1', uiPotion: 'M2 2' };
const RARE = { base: 'iron_sword', slot: 'weapon', rarity: 'rare', traits: [{ id: 'file_breaker', rank: 1 }] };
const TRAITED = { base: 'iron_sword', traits: [{ id: 'file_breaker', rank: 1 }] };

/* The surfaces of A1's brief and the one helper each draws through. */
const SURFACES = Object.freeze({
  'src/shell/windows/inventory/pockets.js': 'the bag and Storage pocket',
  'src/shell/windows/inventory/doll.js': 'the worn slots',
  'src/shell/windows/inventory/grid.js': 'the picked item and the loot rows',
  'src/shell/windows/hunt-summary.js': 'the hunt summary drop lines',
  'src/shell/windows/away.js': 'the return card',
  'src/shell/windows/tower-chest.js': 'the Tower chest haul',
});
/* Files that still write an item's art path themselves, and how many times, with why. A new one is red; a count that falls is a stale row. */
const OWN_ART = Object.freeze({
  'src/shell/widgets/bits.js': [1, 'the one item icon (itemIconHtml), the frame with it'],
  'src/shell/share-card.js': [1, 'a canvas: it draws the same frame PNG itself (STD_FRAMES), IS-2 holds it'],
  'src/shell/windows/tower-chest.js': [2, 'the key picks (a key is never gear) and the reveal sprite rising from the chest'],
  'src/shell/windows/tower.js': [1, 'the picked key'],
  'src/shell/windows/tower-catacombs.js': [3, 'the Catacomb keys'],
  'src/shell/tower-end-card.js': [1, 'the keys a climb ended with'],
});

const filesUnder = (dir, ext) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? filesUnder(p, ext) : p.endsWith(ext) ? [p] : [];
});
const rel = (base, p) => p.slice(base.length + 1).split('\\').join('/');

async function pure(base) {
  const imp = (p) => import(pathToFileURL(join(base, p)).href + '?t=' + Date.now());
  const [S, B, P, L, C, SG] = await Promise.all([imp('src/shell/item-standing.js'), imp('src/shell/widgets/bits.js'), imp('src/shell/windows/inventory/pockets.js'),
    imp('src/shell/item-lore.js'), imp('src/shell/share-card.js'), imp('src/data/signatures.js')]);
  const out = [];
  const sigIds = Object.keys(SG.SIGNATURES);
  if (sigIds.length < 5) out.push('IS-1 fixture: the Signature sample has ' + sigIds.length + ' rows');
  const sig = sigIds[0];

  /* IS-1 */
  for (const id of ['steel_sword', 'iron_sword', 'krells_tollgate', 'wyrmgilt_mantle', 'copper_ore', '']) {
    if (S.standingOf(id) !== null) out.push('IS-1 the plain id ' + JSON.stringify(id) + ' stands as ' + S.standingOf(id));
  }
  for (const id of sigIds) if (S.standingOf(id) !== 'signature') out.push('IS-1 the Signature ' + id + ' stands as ' + S.standingOf(id));
  const cases = [
    [RARE, 'rare', 'iron_sword'], [TRAITED, 'rare', 'iron_sword'], [{ base: 'iron_sword', rarity: 'very_rare' }, 'very_rare', 'iron_sword'],
    [{ base: 'iron_sword', signature: sig }, 'signature', sig], [{ base: 'iron_sword' }, null, 'iron_sword'],
    [{ base: 'iron_sword', rarity: 'epic' }, null, 'iron_sword'], [{ base: 'iron_sword', signature: 'forged_blade' }, null, 'iron_sword'],
    [{ base: 'iron_sword', traits: [] }, null, 'iron_sword'], [null, null, ''],
  ];
  for (const [piece, want, id] of cases) {
    if (S.standingOf(piece) !== want) out.push('IS-1 the piece ' + JSON.stringify(piece) + ' stands as ' + S.standingOf(piece) + ', not ' + want);
    if (S.itemIdOf(piece) !== id) out.push('IS-1 the piece ' + JSON.stringify(piece) + ' shows the item ' + JSON.stringify(S.itemIdOf(piece)) + ', not ' + id);
  }

  /* IS-2 */
  const framed = (h, std) => new RegExp('class="hh-icon hh-std is-' + std + '[" ]').test(h) && (h.match(/<img /g) || []).length <= 1;
  const rareIcon = B.itemIconHtml(G, RARE), sigIcon = B.itemIconHtml(G, sig), plainIcon = B.itemIconHtml(G, 'steel_sword');
  if (!framed(rareIcon, 'rare') || !rareIcon.includes('items/iron_sword.png')) out.push('IS-2 a Rare piece\'s icon is ' + rareIcon);
  if (!framed(sigIcon, 'signature')) out.push('IS-2 a Signature\'s icon is ' + sigIcon);
  if (/hh-std/.test(plainIcon) || !plainIcon.includes('items/steel_sword.png')) out.push('IS-2 a plain piece\'s icon is ' + plainIcon);
  const sigPocket = P.pocketHtml(sig, G), plainPocket = P.pocketHtml('steel_sword', G);
  if (!framed(sigPocket, 'signature')) out.push('IS-2 the bag pocket of a Signature has no frame: ' + sigPocket);
  if (/hh-std|rar-|hw-pips/.test(plainPocket)) out.push('IS-2 the bag pocket of a plain steel piece is painted: ' + plainPocket);
  if (/Rare|Epic|Legendary|Mythic|Unique/.test(L.kindWords('steel_sword')) || /Rare|Mythic/.test(L.kindWords('krells_tollgate'))) {
    out.push('IS-2 a plain piece\'s kind line names a rung: ' + L.kindWords('steel_sword') + ' / ' + L.kindWords('krells_tollgate'));
  }
  if (!/, Rare$/.test(L.kindWords('iron_sword', RARE))) out.push('IS-2 a Rare piece\'s kind line is ' + L.kindWords('iron_sword', RARE));
  /* a Signature has no catalogue row: its name is its own and its kind line names it (visual read 2026-11-26: the bag read
     "Barrow knights blade" with no kind line) */
  for (const id of sigIds) {
    if (B.itemName(id) !== SG.SIGNATURES[id].name) out.push('IS-2 the Signature ' + id + ' is named ' + JSON.stringify(B.itemName(id)) + ', not its own name');
    if (!/^(Weapon|Armor|Jewelry), Signature$/.test(L.kindWords(id))) out.push('IS-2 the Signature ' + id + '\'s kind line is ' + JSON.stringify(L.kindWords(id)));
  }
  const sigCard = C.cardLayout(Object.assign(C.cardFacts({ kind: 'rare', item: sig }), { icon: 'assets/icons-bundle/pixel/items/' + sig + '.png' }));
  const plainCard = C.cardLayout(C.cardFacts({ kind: 'rare', item: 'steel_sword' }));
  const nine = sigCard.steps.find((s) => s.op === 'nine'), icon = sigCard.steps.find((s) => s.op === 'icon');
  if (!nine || !/std-frame-signature\.png$/.test(nine.src) || !icon || sigCard.steps.indexOf(nine) > sigCard.steps.indexOf(icon)
    || nine.x !== icon.x - nine.px || nine.size !== icon.size + 2 * nine.px) out.push('IS-2 the share card does not frame a Signature under its icon: ' + JSON.stringify(nine));
  if (!sigCard.steps.some((s) => s.op === 'text' && s.fill === '--rar-unique')) out.push('IS-2 the share card does not ink a Signature\'s name');
  if (plainCard.steps.some((s) => s.op === 'nine') || plainCard.steps.some((s) => s.fill && /^--rar-/.test(s.fill))) out.push('IS-2 the share card paints a plain find');

  /* IS-3 */
  const read = (f) => readFileSync(join(base, f), 'utf8');
  for (const [f, what] of Object.entries(SURFACES)) if (!/\bitemIconHtml\(/.test(read(f))) out.push('IS-3 ' + what + ' (' + f + ') does not draw its icon through itemIconHtml');
  const shell = filesUnder(join(base, 'src', 'shell'), '.js');
  for (const p of shell) {
    const f = rel(base, p), text = readFileSync(p, 'utf8');
    const uses = (text.match(/PIXEL_DIR\s*\+/g) || []).length;
    const allowed = OWN_ART[f] ? OWN_ART[f][0] : 0;
    if (uses !== allowed) out.push('IS-3 ' + f + ' writes an item\'s art path ' + uses + ' time(s), listed ' + allowed + (uses > allowed ? ': draw it with itemIconHtml' : ': a stale OWN_ART row'));
    if (/'rar-'\s*\+|\brarityOf\(/.test(text)) out.push('IS-3 ' + f + ' paints by the catalogue\'s rung');
  }
  for (const p of filesUnder(join(base, 'src', 'styles'), '.css')) if (/\.rar-[a-z]|\[class\*="rar-"\]|--pocket-rar/.test(readFileSync(p, 'utf8'))) out.push('IS-3 ' + rel(base, p) + ' paints by the catalogue\'s rung');

  /* IS-4 */
  const hunt = read('src/styles/hunt.css'), win = read('src/styles/windows.css');
  const rule = (css, sel) => { const i = css.indexOf(sel + ' {'); return i < 0 ? '' : css.slice(i, css.indexOf('}', i)); };
  const before = rule(hunt, '.hh-std::before');
  if (!/inset:\s*calc\(-1 \* var\(--art-px\)\)/.test(before)) out.push('IS-4 the frame is not one art px outside the icon: ' + before);
  for (const [sel, png, src] of [['.hh-std::before', 'std-frame-rare.png', before], ['.hh-std.is-signature::before', 'std-frame-signature.png', rule(hunt, '.hh-std.is-signature::before')]]) {
    const im = decodePNG(readFileSync(join(ROOT, 'assets', 'ui', png)));
    const n = (im.width - 1) / 2;
    const re = new RegExp("url\\('\\.\\./\\.\\./assets/ui/" + png.replace('.', '\\.') + "'\\)\\s+" + n + '\\s*/\\s*var\\(--art-' + n + '\\)');
    if (!re.test(src)) out.push('IS-4 ' + sel + ' does not draw ' + png + ' at its slice ' + n + ' (' + n + ' art px): ' + src);
  }
  if (!/position:\s*relative/.test(rule(hunt, '.hh-std > .hh-std-art, .hh-std > .hs-glyph'))) out.push('IS-4 the icon is not positioned above its frame');
  if (!/border-color:\s*transparent/.test(rule(win, '.hw-pocket:has(.hh-std), .hw-slot:has(.hh-std)'))) out.push('IS-4 a framed pocket keeps its rim beside the frame');
  /* the summary's drop lines keep a find's whole name (a half-width cell wraps it), so a Signature is never "Barrow Knight's Bl..." */
  if (!/white-space:\s*normal/.test(rule(read('src/styles/summary.css'), '.hsum-loot .hsum-name b'))) out.push('IS-4 the summary cuts a long find\'s name');
  return out;
}

const MUTANTS = [
  ['every plain id stands as Rare', 'src/shell/item-standing.js', "if (typeof item === 'string') return own(SIGNATURES, item) ? 'signature' : null;", "if (typeof item === 'string') return own(SIGNATURES, item) ? 'signature' : 'rare';"],
  ['a Trait does not make a Rare', 'src/shell/item-standing.js', '(Array.isArray(item.traits) && item.traits.length > 0)', 'false'],
  ['a forged Signature name stands', 'src/shell/item-standing.js', "if (typeof item.signature === 'string' && own(SIGNATURES, item.signature)) return 'signature';", "if (typeof item.signature === 'string') return 'signature';"],
  ['the icon drops its frame', 'src/shell/widgets/bits.js', '  if (std) return ', '  if (false) return '],
  ['the pocket paints the old rung', 'src/shell/windows/inventory/pockets.js', "'<li class=\"hw-pocket is-' + kindOf(id) + '\"", "'<li class=\"hw-pocket is-' + kindOf(id) + ' rar-rare\""],
  ['a plain piece is called Rare', 'src/shell/item-lore.js', "if (std) parts.push(t('item.rarity_' + std));", "parts.push(t('item.rarity_' + (std || 'rare')));"],
  ['a Signature reads its id spelled out', 'src/shell/widgets/bits.js', 'return Object.hasOwn(SIGNATURES, id) ? SIGNATURES[id].name : spelled(id);', 'return spelled(id);'],
  ['a Signature has no kind line', 'src/shell/item-lore.js', "  if (!it && Object.hasOwn(SIGNATURES, id)) return ", "  if (false) return "],
  ['the share card inks every find gold', 'src/shell/share-card.js', "fill: std ? std.ink : '--gold-2' }", "fill: '--gold-2' }"],
  ['the summary draws its own icon', 'src/shell/windows/hunt-summary.js', "'<li class=\"hsum-item\"><span class=\"hsum-ico\">' + itemIconHtml(ctx.glyphs, x.it) + '</span>'", "'<li class=\"hsum-item\"><span class=\"hsum-ico\"><img src=\"' + PIXEL_DIR + x.it + '.png\"></span>'"],
  ['the frame sits inside the icon', 'src/styles/hunt.css', 'inset: calc(-1 * var(--art-px));', 'inset: 0;'],
  ['the Signature frame at the Rare slice', 'src/styles/hunt.css', "std-frame-signature.png') 4 / var(--art-4)", "std-frame-signature.png') 3 / var(--art-3)"],
  ['the summary cuts a find\'s name again', 'src/styles/summary.css', '.hsum-loot .hsum-name b { white-space: normal; line-height: 1.2; }', ''],
  ['the frame is drawn over the icon', 'src/styles/hunt.css', '.hh-std > .hh-std-art, .hh-std > .hs-glyph { position: relative; }', '.hh-std > .hh-std-art, .hh-std > .hs-glyph { position: static; }'],
];

process.exitCode = await runPureGuard({ mutate: process.argv.includes('--mutate'), guard: 'tests/item-standing.mjs', pure, mutants: MUTANTS,
  green: 'Rare and Signature pieces stand out in one frame on every surface; plain gear paints by nothing' });
