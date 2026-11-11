#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bar-sort.mjs — SORT AUTOMATICALLY LAYS THE BAR OUT THE WAY THE ENGINE READS IT (src/shell/bar-sort.js).
//
//   node tests/bar-sort.mjs           the rules
//   node tests/bar-sort.mjs --mutate  every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/bar-sort.js
//
// The Hunt prep builder's Sort (lane/b-hunt-prep-builder, Tyler 2026-11-11) is pure: it reorders a
// bar in the wire shape and sends nothing. Its rule is the engine's own (conditions.js LANE_OF,
// attackOrder), so every expected order here is worked out from the raw slots, never through the module:
//   BS-1  LANES LEFT TO RIGHT: every move, then every food and drink, then every ammo slot
//   BS-2  A RULED SLOT BEFORE A PLAIN ONE in each lane (a plain slot ahead of a ruled one of its lane would starve it)
//   BS-3  STABLE: slots of one kind in one lane keep the order the player had
//   BS-4  SWITCHED OFF GOES LAST IN ITS LANE, after that lane's plain slots, still in order
//   BS-5  EMPTIES LAST, THE LENGTH KEPT, THE INPUT UNTOUCHED: twenty in, twenty out, the nulls at the end, the input as it was
//   BS-6  THE AMMO LANE IS attackOrder'S: ruled, then plain, exactly as a shot walks them
//   BS-7  NOTHING LOST: every filled slot of the input is in the output once, the same object, an unknown type too
// Exit: 0 green · 1 a rule red · 2 harness error.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { judge, report, exitOf, cleanControl } from './_mutant-verdict.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = 'src/shell/bar-sort.js';

const slot = (type, id, conditions = [], extra = {}) => Object.assign({ action: { type, id }, conditions, join: 'and' }, extra);
const HP = [{ metric: 'self_hp_pct', op: 'lt', value: 50 }];
const BOSS = [{ metric: 'target_is_boss', op: 'eq', value: true }];
const names = (bar) => bar.map((s) => (s ? s.action.id + (s.enabled === false ? '!' : '') : '-')).join(' ');

/* The bar a player might have after a week of dragging: every lane mixed, ruled and plain, one off, an unknown type, holes. */
function messyBar() {
  const b = Array.from({ length: 20 }, () => null);
  b[0] = slot('consume', 'wheat_bread', HP);          // food, ruled
  b[1] = slot('attack_with_item', 'barbed_arrows');   // ammo, plain
  b[3] = slot('ability', 'power_strike');             // move, plain
  b[4] = slot('ability', 'cleave', [{ metric: 'enemies_in_aoe', op: 'gte', value: 2 }]);   // move, ruled
  b[5] = slot('consume', 'goldenroot_tea');           // drink, plain
  b[6] = slot('ability', 'fireball', [], { enabled: false });   // move, off, plain
  b[8] = slot('attack_with_item', 'loaded', BOSS);    // ammo, ruled
  b[9] = slot('ability', 'challenge', BOSS, { enabled: false }); // move, off, ruled
  b[11] = slot('consume', 'cooked_shrimp', HP);       // food, ruled, after the first
  b[12] = slot('ability', 'mend');                    // move, plain, after power_strike
  b[14] = slot('attack_with_item', 'iron_bolts');     // ammo, plain, after barbed
  b[15] = slot('consume', 'turnip_juice', [], { enabled: false });   // drink, off
  b[17] = slot('summon', 'ghost');                    // an unknown type: kept, never lost
  return b;
}

export async function rules(base) {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  const { sortBar } = await imp(MODULE);
  const { LANE_OF, attackOrder } = await imp('src/core/hunt/conditions.js');
  const input = messyBar();
  const before = JSON.stringify(input);
  const out = sortBar(input);
  const got = names(out);
  const filled = out.filter(Boolean);
  const lane = (s) => LANE_OF[s.action.type];
  // BS-1
  const lanes = filled.filter((s) => lane(s)).map(lane);
  const rank = { ability: 0, consume: 1, attack: 2 };
  if (lanes.some((l, i) => i && rank[l] < rank[lanes[i - 1]])) fails.push('BS-1 the lanes do not run moves, food and drink, ammo: ' + got);
  // BS-2 and BS-4, per lane: the on slots first (ruled, then plain), then the off ones
  for (const l of ['ability', 'consume', 'attack']) {
    const mine = filled.filter((s) => lane(s) === l);
    const kind = (s) => (s.enabled === false ? 2 : s.conditions.length ? 0 : 1);
    const kinds = mine.map(kind);
    if (kinds.some((k, i) => i && k < kinds[i - 1])) fails.push((kinds.includes(2) && kinds.indexOf(2) < kinds.length - 1 && kinds.slice(kinds.indexOf(2)).some((k) => k !== 2) ? 'BS-4 a switched-off slot is not last in its lane: ' : 'BS-2 a plain slot stands before a ruled one in its lane: ') + l + ' reads ' + mine.map((s) => s.action.id + (s.enabled === false ? '!' : '')).join(' '));
    // BS-3: within one kind, the player's order (the input's index order) holds
    for (const k of [0, 1, 2]) {
      const same = mine.filter((s) => kind(s) === k);
      const at = same.map((s) => input.indexOf(s));
      if (at.some((a, i) => i && a < at[i - 1])) fails.push('BS-3 the order the player had is lost in the ' + l + ' lane: ' + same.map((s) => s.action.id).join(' '));
    }
  }
  // BS-5
  if (out.length !== 20) fails.push('BS-5 twenty in, ' + out.length + ' out');
  const firstHole = out.indexOf(null);
  if (firstHole >= 0 && out.slice(firstHole).some(Boolean)) fails.push('BS-5 an empty slot stands before a filled one: ' + got);
  if (JSON.stringify(input) !== before) fails.push('BS-5 the input was changed');
  // BS-6: the ammo lane's on slots are exactly attackOrder over the input's ammo rows (each its own index, so none is the worn default)
  const ammoIn = input.map((s, i) => ({ rule: 'b' + i, slot: s })).filter((r) => r.slot && lane(r.slot) === 'attack' && r.slot.enabled !== false);
  const want = attackOrder(ammoIn).map((r) => r.slot.action.id).join(' ');
  const have = filled.filter((s) => lane(s) === 'attack' && s.enabled !== false).map((s) => s.action.id).join(' ');
  if (want !== have) fails.push('BS-6 the ammo lane reads ' + have + ', attackOrder says ' + want);
  // BS-7
  const inFilled = input.filter(Boolean);
  if (filled.length !== inFilled.length || inFilled.some((s) => filled.indexOf(s) < 0) || new Set(filled).size !== filled.length) fails.push('BS-7 a slot was lost or doubled: ' + got);
  if (!filled.includes(input[17])) fails.push('BS-7 the slot of an unknown type was dropped');
  // the whole picture, so a reader sees it: moves (ruled cleave, then power_strike, mend; off challenge, fireball), food and drink
  // (ruled wheat_bread, cooked_shrimp; plain goldenroot_tea; off turnip_juice), ammo (ruled loaded; plain barbed_arrows, iron_bolts), the unknown, then holes.
  // The off ones keep the order they had: fireball (slot 7) before challenge (slot 10), ruled or not.
  const whole = 'cleave power_strike mend fireball! challenge! wheat_bread cooked_shrimp goldenroot_tea turnip_juice! loaded barbed_arrows iron_bolts ghost - - - - - - -';
  if (got !== whole && !fails.length) fails.push('BS-1 the whole bar reads ' + got + ' (want ' + whole + ')');
  return fails;
}

const MUTANTS = [
  ['the lanes run ammo first', MODULE, "export const LANES = Object.freeze(['ability', 'consume', 'attack']);", "export const LANES = Object.freeze(['attack', 'consume', 'ability']);"],
  ['a ruled slot no longer goes first', MODULE, '  return xs.filter((x) => ruled(x.s)).concat(xs.filter((x) => !ruled(x.s)));', '  return xs;'],
  ['the plain slots come back reversed', MODULE, '  return xs.filter((x) => ruled(x.s)).concat(xs.filter((x) => !ruled(x.s)));', '  return xs.filter((x) => ruled(x.s)).concat(xs.filter((x) => !ruled(x.s)).reverse());'],
  ['a switched-off slot keeps its place among the on ones', MODULE, 'out.push(...laneOrder(lane, mine.filter((x) => x.s.enabled !== false)), ...mine.filter((x) => x.s.enabled === false));', 'out.push(...laneOrder(lane, mine));'],
  ['the bar comes back short', MODULE, '  while (sorted.length < n) sorted.push(null);\n', ''],
  ['the ammo lane ignores the engine', MODULE, "  if (lane === 'attack') return attackOrder(xs.map((x) => ({ rule: 'b' + x.i, slot: x.s, x }))).map((r) => r.x);", "  if (lane === 'attack') return attackOrder(xs.map((x) => ({ rule: 'b' + x.i, slot: x.s, x }))).map((r) => r.x).reverse();"],
  ['a slot of an unknown type is dropped', MODULE, '  for (const x of filled) if (!LANE_OF[x.s.action.type]) out.push(x);\n', ''],
];

/* A mutant runs the rules from a temp copy of src with the planted file written in: the working tree is never touched. */
async function planted(file, text) {
  const tmp = mkdtempSync(join(tmpdir(), 'hr-bar-sort-'));
  try {
    cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true, filter: (p) => !/[\\/]vendor([\\/]|$)/.test(p.slice(ROOT.length)) });
    writeFileSync(join(tmp, file), text);
    return await rules(tmp);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await rules(ROOT);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'bar-sort: ' + fails.length + ' rule(s) RED' : 'bar-sort: lanes left to right, ruled before plain, stable, off last in its lane, empties last, the ammo lane the engine\'s, nothing lost');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await cleanControl(() => rules(ROOT));
  console.log(clean.line);
  if (clean.code) process.exit(clean.code);
  const counts = { caught: 0, harness: 0, escaped: 0 };
  for (const [name, file, from, to] of MUTANTS) {
    const text = await readFile(join(ROOT, file), 'utf8');
    if (!text.includes(from)) { console.log('  ✗ ' + name + ' — HARNESS: anchor not found in ' + file); counts.harness++; continue; }
    console.log(report(name, await judge(() => planted(file, text.replace(from, to))), counts));
  }
  console.log(exitOf(counts) ? 'bar-sort --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)' : 'bar-sort --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught, each by a named rule');
  process.exit(exitOf(counts));
}

main();
