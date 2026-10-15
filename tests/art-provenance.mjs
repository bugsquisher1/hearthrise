#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/art-provenance.mjs — EVERY PIECE OF ART SAYS HOW IT WAS MADE, AND THE
// ART BIBLE DESCRIBES THE STYLE THE CODE ENFORCES
//
//   node tests/art-provenance.mjs             the repo obeys the contract
//   node tests/art-provenance.mjs --selftest  planted defects each trip their named rule
//
// Tyler, 2026-10-15: the current style and how each asset was made are kept from
// now on, so anyone (Claude or Tyler by hand in PixelLab) can reproduce it.
//   source   a world sidecar (art/world/<set>/<id>.json) with neither a pixellab
//            block carrying a request nor a hand-made note (made_by, or pixellab.drawn)
//   seed     a world sidecar or item icon made after 2026-10-15 (not in the frozen
//            baseline) whose record has no "seed" key (use "seed": null plus
//            "seed_note" when the tool did not show one)
//   icon     an item icon (assets/icons-bundle/pixel/items/<id>.png) not in the
//            baseline with no art/items/<id>.json record (tool, prompt, seed)
//   stale    a baseline entry that is gone or now carries a seed: shrink the list
//   inbox    a PNG in art/inbox/ with no .txt log beside it
//   bible    docs/HEARTHRISE_ART_BIBLE.md does not name the current palette id or
//            a size class of src/data/world/art-budget.js
//
// mutant-anchors: art/world/ art/items/ art/inbox/ assets/icons-bundle/pixel/items/ docs/HEARTHRISE_ART_BIBLE.md src/data/world/art-budget.js tests/art-provenance.baseline.json
//
// Exit: 0 green · 1 a finding or a mutant escaped · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, existsSync, statSync, mkdtempSync, cpSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { CLASSES } from '../src/data/world/art-budget.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIBLE = 'docs/HEARTHRISE_ART_BIBLE.md';
const BASELINE = 'tests/art-provenance.baseline.json';
const ICONS = 'assets/icons-bundle/pixel/items';

const ls = (d, ext) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(ext)) : []);
// Does `o` hold key `k` at any depth?
const holds = (o, k) => !!o && typeof o === 'object' && (k in o || Object.values(o).some((v) => holds(v, k)));

/** Findings for the tree at `root`; `classes` = the art-budget size classes. */
export function check(root, classes = CLASSES) {
  const out = [];
  const base = JSON.parse(readFileSync(join(root, BASELINE), 'utf8'));
  const legacyWorld = new Set(base.world_no_seed), legacyIcons = new Set(base.icons_no_record);
  const seenWorld = new Set();
  const worldDir = join(root, 'art/world');
  for (const set of readdirSync(worldDir)) {
    const d = join(worldDir, set);
    if (!statSync(d).isDirectory()) continue;
    for (const f of ls(d, '.json')) {
      const key = `${set}/${f.slice(0, -5)}`;
      const j = JSON.parse(readFileSync(join(d, f), 'utf8'));
      const drawn = !!(j.pixellab && j.pixellab.drawn) || (typeof j.made_by === 'string' && !!j.made_by);
      const generated = !!j.pixellab && !drawn;
      if (!(generated && holds(j.pixellab, 'request')) && !drawn) out.push({ rule: 'source', id: key, detail: 'no pixellab request and no made_by note' });
      if (generated && !holds(j.pixellab, 'seed')) { if (legacyWorld.has(key)) seenWorld.add(key); else out.push({ rule: 'seed', id: key, detail: 'pixellab block records no "seed" (null + seed_note if the tool showed none)' }); }
    }
  }
  for (const k of legacyWorld) if (!seenWorld.has(k)) out.push({ rule: 'stale', id: k, detail: 'baseline lists it but it is gone or now records a seed: remove it from ' + BASELINE });
  const records = new Set(ls(join(root, 'art/items'), '.json').map((f) => f.slice(0, -5)));
  const icons = new Set(ls(join(root, ICONS), '.png').map((f) => f.slice(0, -4)));
  for (const id of icons) {
    if (legacyIcons.has(id)) continue;
    if (!records.has(id)) { out.push({ rule: 'icon', id, detail: `no art/items/${id}.json (tool, prompt, reference, seed)` }); continue; }
    const r = JSON.parse(readFileSync(join(root, 'art/items', id + '.json'), 'utf8'));
    if (!('seed' in r)) out.push({ rule: 'seed', id: 'items/' + id, detail: 'record has no "seed" key' });
  }
  for (const id of legacyIcons) if (!icons.has(id) || records.has(id)) out.push({ rule: 'stale', id: 'items/' + id, detail: 'baseline icon is gone or now has a record: remove it from ' + BASELINE });
  const inbox = join(root, 'art/inbox');
  for (const f of ls(inbox, '.png')) if (!existsSync(join(inbox, f.slice(0, -4) + '.txt'))) out.push({ rule: 'inbox', id: f, detail: 'no ' + f.slice(0, -4) + '.txt log beside it' });
  const bible = readFileSync(join(root, BIBLE), 'utf8');
  const pal = JSON.parse(readFileSync(join(root, 'art/world/palette.json'), 'utf8')).id;
  if (!bible.includes(pal)) out.push({ rule: 'bible', id: 'palette', detail: `the bible does not name the current palette ${pal}` });
  for (const c of Object.keys(classes)) if (!bible.includes('`' + c + '`')) out.push({ rule: 'bible', id: c, detail: `size class \`${c}\` is missing from the bible's class table` });
  return out;
}

function selftest() {
  const tmp = mkdtempSync(join(tmpdir(), 'art-prov-'));
  try {
    for (const p of ['art/world', 'art/inbox', ICONS, BIBLE, BASELINE]) cpSync(join(ROOT, p), join(tmp, p), { recursive: true });
    const clean = check(tmp);
    if (clean.length) { console.error('art-provenance --selftest: harness — clean copy not silent: ' + clean.map((f) => f.rule + ' ' + f.id).join('; ')); process.exit(2); }
    const base = JSON.parse(readFileSync(join(tmp, BASELINE), 'utf8'));
    const [legacySet, legacyId] = base.world_no_seed[0].split('/');
    const sidecar = join(tmp, 'art/world', legacySet, legacyId + '.json');
    const orig = readFileSync(sidecar, 'utf8');
    const mutants = [
      ['source', () => { const j = JSON.parse(orig); delete j.pixellab; delete j.made_by; writeFileSync(sidecar, JSON.stringify(j)); }, () => writeFileSync(sidecar, orig)],
      ['seed', () => writeFileSync(join(tmp, 'art/world', legacySet, 'zz_new.json'), JSON.stringify({ id: 'zz_new', pixellab: { tool: 't', request: { description: 'x' } } })), () => unlinkSync(join(tmp, 'art/world', legacySet, 'zz_new.json'))],
      ['stale', () => { const j = JSON.parse(orig); j.pixellab.seed = 1; writeFileSync(sidecar, JSON.stringify(j)); }, () => writeFileSync(sidecar, orig)],
      ['icon', () => cpSync(join(tmp, ICONS, base.icons_no_record[0] + '.png'), join(tmp, ICONS, 'zz_new.png')), () => unlinkSync(join(tmp, ICONS, 'zz_new.png'))],
      ['inbox', () => writeFileSync(join(tmp, 'art/inbox/town__zz.png'), ''), () => unlinkSync(join(tmp, 'art/inbox/town__zz.png'))],
      ['bible', () => writeFileSync(join(tmp, BIBLE), readFileSync(join(ROOT, BIBLE), 'utf8').split('`sapling`').join('sapling')), () => cpSync(join(ROOT, BIBLE), join(tmp, BIBLE))],
    ];
    let escaped = 0;
    for (const [rule, plant, undo] of mutants) {
      plant();
      const hit = check(tmp).some((f) => f.rule === rule);
      undo();
      if (!hit) { escaped++; console.error(`art-provenance --selftest: mutant "${rule}" escaped`); }
    }
    // A new size class with no bible row must trip the bible rule.
    if (!check(tmp, { ...CLASSES, zz_boss: {} }).some((f) => f.rule === 'bible' && f.id === 'zz_boss')) { escaped++; console.error('art-provenance --selftest: mutant "new class" escaped'); }
    console.log(escaped ? `art-provenance --selftest: RED — ${escaped} mutant(s) escaped` : `art-provenance --selftest: all ${mutants.length + 1} planted defects caught; clean copy silent`);
    process.exit(escaped ? 1 : 0);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest();
  const f = check(ROOT);
  for (const x of f) console.error(`art-provenance: [${x.rule}] ${x.id}: ${x.detail}`);
  console.log(f.length ? `art-provenance: RED — ${f.length} finding(s)` : 'art-provenance: green');
  process.exit(f.length ? 1 : 0);
}
