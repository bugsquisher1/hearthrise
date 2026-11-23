#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-drop-hours.mjs — EVERY SCALE GROUND'S DROP ROWS AUTHORED IN HUNTED HOURS (systems, lane/drop-formula, 2026-11-22).
//
// src/data/drop-hours.js: a row says `everyHours: N` ("one in about N hunted hours, a hero of the reference party at the reference step")
// and its `ch` is DERIVED: 1 / (N x the ground's reference kills a head an hour x the monster's share of those kills), held to
// DROP_HOURS.chDigits (src/core/drop-rate.js rowChance). This tool writes that derived `ch` beside the hours on each pack row, so every
// reader of a row (the settle, the catalogues, the browser's preview) keeps reading `ch` and nothing types one. A re-measured kill rate
// (danger.js DANGER_GROUNDS refKillsHead, a band re-cut, a pocket redrawn) is one `--write`, and the drops keep their hours.
// The rows it owns: every monster row of a pack whose ground is on the Danger scale (DANGER_GROUNDS), except a certainty (`ch: 1`, a body's
// own bones: a certainty is not a rate). A Catacomb wing's ground rows derive at load (src/data/catacomb-wings.js ARMOR_EVERY_HOURS), not here.
//
//   node tools/gen-drop-hours.mjs                 check: exit 1 on a scale row with a typed chance, or a `ch` its hours no longer give
//   node tools/gen-drop-hours.mjs --write         re-derive every owned `ch` from its hours (after a kill-rate change)
//   node tools/gen-drop-hours.mjs --convert [g]   one time per ground: give every owned row with no hours the hours its `ch` gives today,
//                                                 the fewest significant digits that derive the same `ch` back (today's rates kept exactly)
//   node tools/gen-drop-hours.mjs --report        the hours of every owned row against its loot band's hours (loot-bands.js BAND_TARGETS):
//                                                 REVIEW rows sit outside it. Balance values are the designer's: this lists, never moves
//
// Exported for tests/drop-formula.mjs: ownedRows(), problems(), convertText(), writeText().
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUND_PACKS } from '../src/data/grounds/index.js';
import { HUNT_GROUNDS } from '../src/data/hunt-grounds.js';
import { DANGER_GROUNDS } from '../src/data/danger.js';
import { BAND_TARGETS } from '../src/data/loot-bands.js';
import { roundChance } from '../src/data/drop-hours.js';
import { rowChance, hoursOf } from '../src/core/drop-rate.js';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const packFile = (id) => join(ROOT, 'src', 'data', 'grounds', id, 'pack.js');

/** Every row this tool owns: { ground, monster, row, index } for each scale ground with a pack, its own monsters' rows under certainty. */
export function ownedRows(packs = GROUND_PACKS, grounds = HUNT_GROUNDS, scale = DANGER_GROUNDS) {
  const out = [];
  for (const p of packs) {
    if (!Object.prototype.hasOwnProperty.call(scale, p.id) || !grounds[p.id]) continue;
    for (const [m, row] of Object.entries(p.monsters || {})) {
      (row.drops || []).forEach((r, index) => { if (!(r.ch >= 1)) out.push({ ground: p.id, monster: m, row: r, index }); });
    }
  }
  return out;
}

/** The rule's reds: a scale row with no hours (a typed chance), or a `ch` that is not its hours' (stale after a kill-rate change). */
export function problems(rows = ownedRows(), grounds = HUNT_GROUNDS) {
  const out = [];
  for (const { ground, monster, row } of rows) {
    const at = ground + ' ' + monster + ' ' + row.id + ': ';
    if (!(Number(row.everyHours) > 0)) { out.push(at + 'a typed chance ' + row.ch + ' on a scale ground (author it as everyHours)'); continue; }
    const want = rowChance(row, monster, grounds[ground]);
    if (want !== row.ch) out.push(at + 'ch ' + row.ch + ' is not what ' + row.everyHours + ' h gives (' + want + '): run --write');
  }
  return out;
}

/* the fewest significant digits (2 to 5) of `h` whose derived chance rounds back to `ch` (else 3 digits: today's rate within 0.5%) */
function niceHours(h, ch, monster, g) {
  for (let d = 2; d <= 5; d++) {
    const n = Number(h.toPrecision(d));
    if (rowChance({ everyHours: n }, monster, g) === ch) return n;
  }
  return Number(h.toPrecision(3));
}

/* the text of monster `m`'s block in a pack's source: from its key line to the next monster's (or the monsters' end) */
function blockOf(text, monsters, m) {
  const keys = Object.keys(monsters);
  const at = (k) => text.search(new RegExp('\\n {4}' + k + ': \\{'));
  const start = at(m);
  if (start < 0) throw new Error('gen-drop-hours: no block for ' + m);
  const next = keys.slice(keys.indexOf(m) + 1).map(at).filter((i) => i > start);
  const end = next.length ? Math.min(...next) : text.indexOf('\n  roster:', start) > 0 ? text.indexOf('\n  roster:', start) : text.length;
  return [start, end];
}

/* rewrite one row of `id` (its first occurrence in the block at or after `from`) to carry `hours` and `ch` */
function rewriteRow(block, id, hours, ch) {
  const re = new RegExp("\\{ id: '" + id + "', (?:everyHours: [0-9.e-]+, )?ch: [0-9.e-]+,");
  if (!re.test(block)) throw new Error('gen-drop-hours: row ' + id + ' not in the form { id, [everyHours,] ch, ... }');
  return block.replace(re, "{ id: '" + id + "', everyHours: " + hours + ', ch: ' + ch + ',');
}

/** A pack's source with every owned row given `hoursFor(row)` and its derived `ch`. Rows of one item on one monster are rewritten in order. */
function rewritePack(text, pack, ground, hoursFor) {
  let out = text;
  for (const [m, row] of Object.entries(pack.monsters || {})) {
    const [s, e] = blockOf(out, pack.monsters, m);
    let block = out.slice(s, e);
    let cursor = 0;
    for (const r of row.drops || []) {
      if (r.ch >= 1) continue;
      const hours = hoursFor(r, m);
      const ch = rowChance({ everyHours: hours }, m, ground);
      const head = block.slice(0, cursor), tail = rewriteRow(block.slice(cursor), r.id, hours, ch);
      block = head + tail;
      cursor = block.indexOf("{ id: '" + r.id + "'", cursor) + 1;
    }
    out = out.slice(0, s) + block + out.slice(e);
  }
  return out;
}

/** --convert's text: rows with no hours get the hours today's `ch` gives; rows with hours keep theirs. */
export function convertText(text, pack, ground) {
  return rewritePack(text, pack, ground, (r, m) => (Number(r.everyHours) > 0 ? r.everyHours : niceHours(hoursOf(r.ch, m, ground), roundChance(r.ch), m, ground)));
}

/** --write's text: every owned row's `ch` re-derived from its hours. */
export function writeText(text, pack, ground) {
  return rewritePack(text, pack, ground, (r) => {
    if (!(Number(r.everyHours) > 0)) throw new Error('gen-drop-hours: ' + pack.id + ' ' + r.id + ' has no hours: --convert it first');
    return r.everyHours;
  });
}

/** --report's rows: hours against the row's band's hours, or null for a band in odds (Common, Uncommon). */
export function report(rows = ownedRows(), grounds = HUNT_GROUNDS) {
  return rows.map(({ ground, monster, row }) => {
    const h = Number(row.everyHours) > 0 ? row.everyHours : hoursOf(row.ch, monster, grounds[ground]);
    const band = BAND_TARGETS[row.band] && BAND_TARGETS[row.band].hours;
    return { ground, monster, id: row.id, band: row.band, hours: h, want: band || null, review: !!band && (h < band[0] || h > band[1]) };
  });
}

const runAsMain = isMain(import.meta.url);
if (runAsMain) {
  const args = process.argv.slice(2);
  const scalePacks = GROUND_PACKS.filter((p) => Object.prototype.hasOwnProperty.call(DANGER_GROUNDS, p.id) && HUNT_GROUNDS[p.id]);
  if (args[0] === '--convert' || args[0] === '--write') {
    const only = args[1] || null;
    for (const p of scalePacks) {
      if (only && p.id !== only) continue;
      const f = packFile(p.id);
      const text = readFileSync(f, 'utf8');
      const next = args[0] === '--convert' ? convertText(text, p, HUNT_GROUNDS[p.id]) : writeText(text, p, HUNT_GROUNDS[p.id]);
      if (next !== text) { writeFileSync(f, next); console.log('gen-drop-hours ' + args[0] + ': wrote ' + f.slice(ROOT.length + 1)); }
      else console.log('gen-drop-hours ' + args[0] + ': ' + p.id + ' unchanged');
    }
  } else if (args[0] === '--report') {
    for (const r of report()) {
      console.log((r.review ? 'REVIEW ' : '       ') + r.ground.padEnd(16) + r.monster.padEnd(18) + r.id.padEnd(22) + r.band.padEnd(10)
        + r.hours.toFixed(3).padStart(9) + ' h' + (r.want ? '   band ' + r.want[0] + '-' + r.want[1] + ' h' : ''));
    }
  } else {
    const p = problems();
    for (const line of p) console.log('  ✗ ' + line);
    console.log('gen-drop-hours: ' + ownedRows().length + ' scale rows, ' + p.length + ' problem(s)');
    process.exit(p.length ? 1 : 0);
  }
}
