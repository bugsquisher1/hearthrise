#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/item-identity.mjs — AN ITEM ID IS A SAVE KEY: NEVER DELETED, NEVER
// REPURPOSED.
//
// A player's bag, bank, equipment and market listings name items by id. If an
// id disappears, every stack of it becomes an orphan row the catalogue no
// longer knows; if an id changes TIER or SLOT, every stack silently becomes a
// different item (the content-holes draft shifted five whetstone ids one tier
// down, which is exactly that). Display names, values, stats and sources may
// change; identity may not.
//
//   ID-1  every id in the baseline still exists in src/data ITEMS
//   ID-2  its `tier` is unchanged
//   ID-3  its `slot` is unchanged
//
// The baseline (tests/item-identity.baseline.json) is the catalogue as of
// origin/main when the guard was cut, and it only GROWS:
//   node tests/item-identity.mjs              gate
//   node tests/item-identity.mjs --write      add NEW ids (refuses while red)
//   node tests/item-identity.mjs --selftest   mutation proof
// A deliberate retirement keeps the row (`retired: true`, no source); it never
// deletes it. NO ?v= on the imports (tests/**, b332).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, normalize } from 'node:path';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const BASE = join(ROOT, 'tests', 'item-identity.baseline.json');
const identity = (it) => ({ tier: it && it.tier != null ? it.tier : null, slot: it && it.slot ? it.slot : null });

export function check(items, baseline) {
  const P = [];
  for (const [id, want] of Object.entries(baseline)) {
    const it = items[id];
    if (!it) { P.push(`ID-1 "${id}" was removed — a player holding it now holds a row nothing knows. Retire it (retired:true), never delete.`); continue; }
    const got = identity(it);
    if (got.tier !== want.tier) P.push(`ID-2 "${id}" changed tier ${want.tier} → ${got.tier} — every held stack silently became a different item`);
    if (got.slot !== want.slot) P.push(`ID-3 "${id}" changed slot ${want.slot} → ${got.slot} — every worn copy is now in a slot it cannot occupy`);
  }
  return P;
}

async function itemsFrom(root) {
  return (await import(pathToFileURL(join(root, 'src', 'data', 'items.js')).href)).ITEMS;
}
function readBase() {
  return JSON.parse(readFileSync(BASE, 'utf8')).items;
}
function writeBase(items, note) {
  const out = {};
  Object.keys(items).sort().forEach((id) => { out[id] = identity(items[id]); });
  writeFileSync(BASE, JSON.stringify({
    _readme: 'Item identity baseline for tests/item-identity.mjs. Cut from origin/main @ e6a12d3a (b564, 538 ids) on 2026-10-08; grows only (--write adds new ids). ' + note,
    items: out,
  }, null, 1) + '\n');
  return Object.keys(out).length;
}

const argv = process.argv.slice(2);
const from = argv.includes('--from') ? argv[argv.indexOf('--from') + 1] : null;
const ITEMS = await itemsFrom(from || ROOT);

if (argv.includes('--write')) {
  if (from) {
    const n = writeBase(ITEMS, 'Cut from ' + from + '.');
    console.log(`item-identity: baseline cut from ${from} (${n} ids)`);
  } else {
    const base = readBase();
    const p = check(ITEMS, base);
    if (p.length) { console.error('✗ item-identity: refusing to --write over a red tree:\n  ' + p.join('\n  ')); process.exit(1); }
    const merged = { ...base };
    Object.keys(ITEMS).forEach((id) => { if (!merged[id]) merged[id] = identity(ITEMS[id]); });
    const n = writeBase(merged, 'Grown by --write.');
    console.log(`item-identity: baseline now ${n} ids (${n - Object.keys(base).length} added)`);
  }
} else if (argv.includes('--selftest')) {
  const base = readBase();
  if (check(ITEMS, base).length) { console.error('SELFTEST: the real tree is not green'); process.exit(1); }
  const anyTier = Object.keys(base).find((id) => base[id].tier != null);
  const anySlot = Object.keys(base).find((id) => base[id].slot != null);
  const M = [
    ['ID-1', 'copper_whetstone deleted', (I) => { delete I.copper_whetstone; }],
    ['ID-2', 'iron_whetstone shifted from tier 3 to tier 2', (I) => { I.iron_whetstone = { ...I.iron_whetstone, tier: 2 }; }],
    ['ID-3', 'warband_bulwark moved from cape to shield', (I) => { I.warband_bulwark = { ...I.warband_bulwark, slot: 'shield' }; }],
    ['ID-2', `${anyTier} loses its tier`, (I) => { I[anyTier] = { ...I[anyTier] }; delete I[anyTier].tier; }],
    ['ID-3', `${anySlot} loses its slot`, (I) => { I[anySlot] = { ...I[anySlot] }; delete I[anySlot].slot; }],
  ];
  let missed = 0;
  for (const [code, name, mut] of M) {
    const I = { ...ITEMS }; mut(I);
    const hit = check(I, base).some((p) => p.startsWith(code + ' '));
    console.log(`  ${hit ? 'caught' : 'MISSED'}  ${code}  ${name}`);
    if (!hit) missed++;
  }
  const grown = { ...ITEMS, brand_new_item: { n: 'x' } };
  if (check(grown, base).length) { console.error('SELFTEST: a NEW id must be allowed'); process.exit(1); }
  console.log('  allowed  a brand-new id is not a violation');
  if (missed) { console.error(`SELFTEST FAILED: ${missed} mutation(s) not caught`); process.exit(1); }
  console.log(`SELFTEST PASS item-identity: all ${M.length} mutations caught; growth allowed.`);
} else {
  const base = readBase();
  const p = check(ITEMS, base);
  if (p.length) { console.error('✗ item-identity: ' + p.length + ' violation(s)\n  ' + p.join('\n  ')); process.exit(1); }
  console.log(`✓ item-identity: ${Object.keys(base).length} baseline ids present with their tier and slot unchanged (${Object.keys(ITEMS).length} in the catalogue)`);
}
