// ════════════════════════════════════════════════════════════════════════
// src/shell/bench-output.js — WHAT A BENCH ROW MAKES, AGAINST WHAT THE HERO WEARS, AND THE LADDER ABOVE IT.
//
// Itemization audit 2026-11-18 #1: a recipe row named its output and never said what it was, so a player could not tell a
// Forge Bronze Gauntlets from a better pair, nor why to raise Smithing past the rows in sight.
//   outputVsWorn(out, worn)  the piece's stats, each with its change against the piece worn in its slot ("+16 Melee damage (+13)"),
//                            a stat only the worn piece has as its loss, then which piece that is or that the slot is bare: the item
//                            card's own numbers (bag-model.js statLines and compare, the catalogue the server's engine reads); a tool
//                            says what it does; anything nobody wears says nothing
//   ladderOf(locked)         every recipe above the level the rows show, one rung a Level ("Lv 30": what it opens)
// PURE over the catalogue and the worn set the server sends (item-sections.js equipmentOf); gates nothing, spends nothing.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=0.2.142';
import { EQUIP_SLOT_META } from '../data/gathering.js?v=0.2.142';
import { statLines, compare, equipSlotFor } from './bag-model.js?v=0.2.142';
import { toolEffect } from './item-lore.js?v=0.2.142';

/**
 * What `out` is against the worn set, or null for an output no hero wears and no tool.
 * `stats`: each stat as the card words it, with its change against the worn piece when there is one ({ text, gain }), and a stat only
 * the worn piece has as a change alone (`stat` ''). `worn`: the piece in its slot now, or null. `slot`: the slot's label when it is bare.
 * `same`: it IS the piece worn.
 * @param {string|null} out
 * @param {Record<string, string>|null} worn  the server's worn set { equip_slot: item }
 * @returns {{stats: {stat: string, change: {text: string, gain: boolean}|null}[], worn: string|null, slot: string|null, same: boolean}|null}
 */
export function outputVsWorn(out, worn) {
  const it = out ? ITEMS[out] : null;
  if (!it) return null;
  if (it.type === 'tool') {
    const words = toolEffect(out);
    return words ? { stats: [{ stat: words, change: null }], worn: null, slot: null, same: false } : null;
  }
  if (typeof it.slot !== 'string') return null;
  const eq = worn || {};
  const slot = equipSlotFor(out, eq);
  const on = slot && eq[slot] ? eq[slot] : null;
  const deltas = on && on !== out ? compare(out, on) : [];
  const change = (label) => { const d = deltas.find((x) => x.label === label); return d ? { text: d.text, gain: d.delta > 0 } : null; };
  const mine = statLines(out);
  /* a stat below zero reads with the minus sign the change carries ("−1 Melee accuracy (−2)"), never a hyphen */
  const stats = mine.map((s) => ({ stat: s.text.replace(/^-/, '−') + ' ' + s.label, change: change(s.label) }))
    .concat(deltas.filter((d) => !mine.some((s) => s.label === d.label)).map((d) => ({ stat: '', change: { text: d.text + ' ' + d.label, gain: d.delta > 0 } })));
  return { stats, worn: on, slot: on ? null : ((EQUIP_SLOT_META[slot] || {}).label || slot || '').toLowerCase(), same: on === out };
}

/**
 * THE WHOLE LADDER: the locked rows past the ones a station shows in full, one rung a Level, lowest first. `locked`: the work rows
 * above the hero's level ({ row: { req } }), in any order. Pure. `items` is what a rung SHOWS: one row a thing it opens, so a piece that
 * three jobs make (a crafted jewel from its metal, with its gem, with a boss drop) reads once (post-140 audit C11: "Banded Signet" twice).
 * @template {{row: {req?: number, output?: string|null}}} W
 * @param {W[]} locked
 * @returns {{level: number, rows: W[], items: W[]}[]}
 */
export function ladderOf(locked) {
  const by = new Map();
  for (const w of locked) {
    const lv = w.row.req || 1;
    if (!by.has(lv)) by.set(lv, []);
    by.get(lv).push(w);
  }
  return Array.from(by.entries()).sort((a, b) => a[0] - b[0]).map(([level, rows]) => ({ level, rows, items: onePerItem(rows) }));
}

/* The first row that makes each thing; a row that makes nothing (a rite) stands for itself. */
function onePerItem(rows) {
  const seen = new Set();
  return rows.filter((w) => {
    const out = w.row.output;
    if (!out) return true;
    if (seen.has(out)) return false;
    seen.add(out);
    return true;
  });
}
