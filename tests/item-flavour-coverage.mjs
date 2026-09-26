#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/item-flavour-coverage.mjs — EVERY ITEM EXPLAINS ITSELF
//
// Content pack 4 (2026-09-26) closed the gap between 538 catalogued items and
// 419 flavour lines: the four Hearthfind trophies, every dungeon unique, the
// Reed & Tide catch, both jewellery rings and the whole leather/cloth armour
// ladders had no "what is it" line. This guard is the floor that keeps the
// count at 538/538 — any future item that ships without a line in the base
// ITEM_DESC literal (src/data/item-descriptions.js) is now caught here,
// never silently blank on the item detail flyout.
//
//   node tests/item-flavour-coverage.mjs             gate: every id covered
//   node tests/item-flavour-coverage.mjs --selftest  mutation proof
//
// ── WHY THE BASE LITERAL, NEVER A *_DESC SPREAD ────────────────────────────
// ITEM_DESC = { ...WAVE3_DESC, ...SLOT_DESC, ...LIB2_DESC, <base literal> }.
// The three spread maps live in wave3-uniques.js / slot-ladders.js /
// library2-items.js, which are three of the 19 files hr-accrue vendors into
// its edge bundle. Adding a line there changes the edge payload hash and
// forces a deploy for a client-only tooltip string — so FLV-1's failure
// message says exactly where a missing line belongs.
//
// ── WHAT check() DOES NOT NEED A DATABASE OR A NETWORK FOR ─────────────────
// Every property here is asserted over three in-memory values: the item
// catalogue, the merged description map, and the raw source text of
// item-descriptions.js (parsed only to see the base literal's own keys,
// which the merged map cannot — JS silently keeps the LAST of a duplicate
// key, so a shadowed or twice-authored key is invisible in ITEM_DESC itself
// and only visible in the text that produced it). Credential-free,
// database-free, milliseconds.
//
// Exit: 0 green · 1 red · 2 harness error.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, normalize } from 'node:path';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const DESC_PATH = join(ROOT, 'src', 'data', 'item-descriptions.js');

/* The 14 WAVE3 uniques whose lines were authored, and approved, ending in a
   full stop before this guard existed. Nothing NEW may end in one; these 14
   are grandfathered and must STAY grandfathered — an allowlisted id whose
   line no longer ends in '.' is a stale entry (FLV-8) just as much as a new
   line that gained one is a violation. */
export const FULL_STOP_ALLOWLIST = new Set([
  'dragonrend_greatblade', 'crown_of_the_fallen_king', 'emberfang_blade', 'demoncaller_staff',
  'panthers_eye_pendant', 'wraithsilk_shroud', 'widows_fang', 'plaguewarden_greaves',
  'hollow_sigil_ring', 'fangdart_recurve', 'alphaheart_longbow', 'nightstalker_pelt',
  'warband_bulwark', 'chitinweave_cloak',
]);

const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const KEY_LINE_RE = /^\s*'([A-Za-z0-9_]+)'\s*:/;
const SPREAD_LINE_RE = /^\s*\.\.\./;

/**
 * Base-literal keys as the SOURCE TEXT states them — a key appearing twice
 * collapses to one entry in the imported object (JS keeps the last), so this
 * is the only way to see a duplicate or a key that shadows a spread map.
 * Returns { counts: Map<key, occurrences>, keys: string[] } over ONLY the
 * literal's own lines, never the three `...MAP,` spread lines.
 */
export function baseLiteralKeys(srcText) {
  const start = srcText.indexOf('export const ITEM_DESC');
  if (start < 0) throw Object.assign(new Error('ITEM_DESC literal not found in source text'), { harness: true });
  const openBrace = srcText.indexOf('{', start);
  const region = srcText.slice(openBrace);
  const counts = new Map();
  const keys = [];
  for (const line of region.split('\n')) {
    if (SPREAD_LINE_RE.test(line)) continue;
    const m = line.match(KEY_LINE_RE);
    if (!m) continue;
    const k = m[1];
    keys.push(k);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return { counts, keys };
}

/**
 * Pure. `spreadKeys` is the union of the three spread maps' own keys — needed
 * only for the "shadows a spread map" half of FLV-9, since the merged `desc`
 * object cannot tell a base key from a spread-provided one once merged.
 * @param {Record<string,object>} items
 * @param {Record<string,string>} desc
 * @param {string} srcText
 * @param {Set<string>} [spreadKeys]
 * @returns {{id:string, msg:string}[]}
 */
export function check(items, desc, srcText, spreadKeys = new Set()) {
  const problems = [];
  const add = (id, msg) => problems.push({ id, msg });

  // FLV-1 — every ITEMS id has a non-empty line.
  for (const id of Object.keys(items)) {
    const line = desc[id];
    if (!line || !line.trim()) {
      add('FLV-1', `"${id}" has no ITEM_DESC line — add it to the base ITEM_DESC in `
        + 'src/data/item-descriptions.js; never a *_DESC in an edge-bundled file');
    }
  }

  // FLV-2 — every ITEM_DESC key is a real ITEMS id.
  for (const key of Object.keys(desc)) {
    if (!items[key]) add('FLV-2', `ITEM_DESC has "${key}", which is not a real ITEMS id (typo?)`);
  }

  // FLV-3 .. FLV-6 — per-line shape.
  for (const [id, line] of Object.entries(desc)) {
    if (typeof line !== 'string') continue;
    if (line.length < 40 || line.length > 132) {
      add('FLV-3', `"${id}" line is ${line.length} characters (want 40-132): ${JSON.stringify(line)}`);
    }
    if (EXTENDED_PICTOGRAPHIC.test(line)) add('FLV-4', `"${id}" line contains an emoji: ${JSON.stringify(line)}`);
    if (/[0-9]/.test(line)) add('FLV-5', `"${id}" line contains a digit: ${JSON.stringify(line)}`);
    if (/[<>&]/.test(line)) add('FLV-6', `"${id}" line contains < > or &: ${JSON.stringify(line)}`);
  }

  // FLV-7 — no two lines identical.
  const byLine = new Map();
  for (const [id, line] of Object.entries(desc)) {
    if (byLine.has(line)) {
      const other = byLine.get(line);
      add('FLV-7', `"${id}" and "${other}" share the exact same line: ${JSON.stringify(line)}`);
    } else byLine.set(line, id);
  }

  // FLV-8 — trailing full stop, in both directions.
  for (const [id, line] of Object.entries(desc)) {
    if (typeof line !== 'string') continue;
    const endsPeriod = line.endsWith('.');
    const allowed = FULL_STOP_ALLOWLIST.has(id);
    if (endsPeriod && !allowed) {
      add('FLV-8', `"${id}" line ends in a full stop and is not one of the 14 grandfathered `
        + `WAVE3 ids: ${JSON.stringify(line)}`);
    } else if (!endsPeriod && allowed) {
      add('FLV-8', `"${id}" is on the full-stop allowlist but its line no longer ends in '.' `
        + `— stale allowlist entry: ${JSON.stringify(line)}`);
    }
  }

  // FLV-9 — no duplicate base key, no base key shadowing a spread key.
  const { counts } = baseLiteralKeys(srcText);
  for (const [key, n] of counts) {
    if (n > 1) add('FLV-9', `"${key}" appears ${n} times in the base ITEM_DESC literal (JS keeps only the last)`);
    if (spreadKeys.has(key)) add('FLV-9', `"${key}" is authored in the base literal AND in a spread map — the `
      + 'base entry silently shadows the spread one');
  }

  return problems;
}

async function loadReal() {
  const { ITEMS } = await import('../src/data/items.js');
  const { ITEM_DESC } = await import('../src/data/item-descriptions.js');
  const { WAVE3_DESC } = await import('../src/data/wave3-uniques.js');
  const { SLOT_DESC } = await import('../src/data/slot-ladders.js');
  const { LIB2_DESC } = await import('../src/data/library2-items.js');
  const srcText = readFileSync(DESC_PATH, 'utf8');
  const spreadKeys = new Set([...Object.keys(WAVE3_DESC), ...Object.keys(SLOT_DESC), ...Object.keys(LIB2_DESC)]);
  return { items: ITEMS, desc: ITEM_DESC, srcText, spreadKeys };
}

function run() {
  return loadReal().then(({ items, desc, srcText, spreadKeys }) => {
    const problems = check(items, desc, srcText, spreadKeys);
    const total = Object.keys(items).length;
    const covered = total - problems.filter((p) => p.id === 'FLV-1').length;
    if (problems.length) {
      console.error(`  ✗ item-flavour-coverage: ${problems.length} problem(s), ${covered}/${total} covered`);
      for (const p of problems) console.error(`      ${p.id}  ${p.msg}`);
      return 1;
    }
    console.log(`✓ item-flavour-coverage: ${covered}/${total} items have a flavour line`);
    return 0;
  });
}

/* ── MUTATION PROOF (CLAUDE.md §4) ──────────────────────────────────────────
   A synthetic fixture, not the real 538 items — the real tree is what this
   guard protects; the proof is that the CHECKER bites, on a small dataset
   where every arm's effect is exact and legible. A clean arm first (the
   false-positive floor), then the nine mutations the brief names, each
   required to be caught by its OWN named FLV id. */
function fixture() {
  const items = {
    emberheart: { n: 'Emberheart' },
    bronze_axe: { n: 'Bronze Axe' },
    iron_sword: { n: 'Iron Sword' },
    dragonrend_greatblade: { n: 'Dragonrend Greatblade' },
    goblin_seal: { n: 'Goblin Seal' },
  };
  const desc = {
    emberheart: 'A coal that has burned since before the first hearth was laid, and will outlast the last',
    bronze_axe: 'Cast-bronze felling axe, a woodcutter\'s first honest tool',
    iron_sword: 'Honest iron blade, the balanced workhorse of any young fighter',
    dragonrend_greatblade: 'A greatblade that tears the sky itself, forged to slay the oldest dragon.',
    goblin_seal: 'A stamped seal that grants passage into the Goblin Warcamp',
  };
  const srcText = [
    'export const ITEM_DESC = {',
    '  ...WAVE3_DESC,',
    '  ...SLOT_DESC,',
    '  ...LIB2_DESC,',
    "  'emberheart': 'A coal that has burned since before the first hearth was laid, and will outlast the last',",
    "  'bronze_axe': 'Cast-bronze felling axe, a woodcutter\\'s first honest tool',",
    "  'iron_sword': 'Honest iron blade, the balanced workhorse of any young fighter',",
    "  'dragonrend_greatblade': 'A greatblade that tears the sky itself, forged to slay the oldest dragon.',",
    "  'goblin_seal': 'A stamped seal that grants passage into the Goblin Warcamp',",
    '};',
  ].join('\n');
  const spreadKeys = new Set(['some_spread_only_item']);
  return { items, desc, srcText, spreadKeys };
}

function selftest() {
  let bad = 0;
  const say = (ok, label, extra = '') => {
    if (ok) console.log(`  ok       ${label}${extra}`);
    else { bad++; console.log(`  WRONG    ${label}${extra}`); }
  };

  console.log('item-flavour-coverage --selftest\n  ── the clean arm ──');
  {
    const { items, desc, srcText, spreadKeys } = fixture();
    const problems = check(items, desc, srcText, spreadKeys);
    say(problems.length === 0, 'the unmutated fixture reports 0 problems',
      problems.length ? `  → ${problems.map((p) => `${p.id}: ${p.msg}`).join('; ')}` : '');
  }

  console.log('\n  ── the nine mutations ──');
  const arms = [
    ['delete emberheart\'s line', 'FLV-1', ({ desc }) => { delete desc.emberheart; }],
    ['append an emoji to one line', 'FLV-4', ({ desc }) => { desc.iron_sword += ' ⚔️'; }],
    ['add a digit to one line', 'FLV-5', ({ desc }) => { desc.iron_sword += ' mk2'; }],
    ['add "<b>" to one line', 'FLV-6', ({ desc }) => { desc.iron_sword = '<b>' + desc.iron_sword; }],
    ['duplicate a line onto another id', 'FLV-7', ({ desc }) => { desc.iron_sword = desc.bronze_axe; }],
    ['pad a line to 140 characters', 'FLV-3', ({ desc }) => { desc.iron_sword = desc.iron_sword.padEnd(140, ' x'); }],
    ['add an orphan key (not a real ITEMS id)', 'FLV-2', ({ desc, srcText }) => ({
      desc: { ...desc, phantom_item: 'A thing that was never catalogued, invented only for this test to catch' },
      srcText: srcText.replace("  'goblin_seal':",
        "  'phantom_item': 'A thing that was never catalogued, invented only for this test to catch',\n  'goblin_seal':"),
    })],
    ['end a NEW line with a full stop', 'FLV-8', ({ desc }) => { desc.iron_sword += '.'; }],
    ['add a duplicate base key', 'FLV-9', ({ srcText }) => ({
      srcText: srcText.replace("  'goblin_seal':",
        "  'goblin_seal': 'A second, conflicting line for the same key that must never be authored',\n  'goblin_seal':"),
    })],
  ];

  for (const [label, wantId, mutate] of arms) {
    const f = fixture();
    const patch = mutate(f) || {};
    const items = patch.items || f.items;
    const desc = patch.desc || f.desc;
    const srcText = patch.srcText || f.srcText;
    const spreadKeys = patch.spreadKeys || f.spreadKeys;
    const problems = check(items, desc, srcText, spreadKeys);
    const hit = problems.filter((p) => p.id === wantId);
    if (hit.length) console.log(`  CAUGHT   ${label} — ${wantId}: ${hit[0].msg.split(': ')[0]}`);
    else {
      bad++;
      console.log(`  MISSED   ${label} — ${wantId} never fired`
        + (problems.length ? ` (only: ${problems.map((p) => p.id).join(', ')})` : ' (no problem at all)'));
    }
  }

  console.log(`\n  ${bad ? `${bad} arm(s) FAILED` : 'clean arm green, all 9 mutations caught by their named FLV id'}`);
  return bad ? 1 : 0;
}

const invoked = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/item-flavour-coverage.mjs');
if (invoked) {
  if (process.argv.includes('--selftest')) {
    process.exit(selftest());
  } else {
    run().then((code) => process.exit(code)).catch((e) => {
      console.error(`ERROR: ${e && e.message || e}`);
      process.exit(2);
    });
  }
}
