// ════════════════════════════════════════════════════════════════════════
// src/data/tally-tasks.js — TAMSIN'S TALLY: KILL TASKS ON THE HUNT GROUNDS
// (game-designer proposal 2026-10-23, approved by Tyler: "build it")
//
// Tamsin Reeve, the Common's tally-keeper, kept the mill's rats down for thirty
// years; when the rats got a king she started paying others to do it. She
// notches a split tally stick for every kill and pays when you bring your half
// back. One row per task: a monster on one hunt ground, how many to kill, and
// the gold she pays. Her PICK (a piece of gear) is not a row here: it is the next
// Scarce armour piece of that ground in the hero's chosen weight that she has
// not given that hero yet (derived from the loot bands by
// tools/gen-tally-tasks.mjs), skipping a slot the hero already WEARS at that
// piece's gear tier or better, any weight (the tier is gear-tiers.js's, emitted as
// hr_tally_tiers; 2027-04-08-tally-worn.sql, designer 2026-11-11), and once every
// piece is given or worn, the ground's crafting material below, in turn. A piece
// the hero only carries does not move it: her board's line is what she pays
// (2027-02-15-panel-truth.sql).
//
// THE RULES, server-owned (supabase/migrations/2026-12-23-tally-tasks.sql):
//   · taken at her board in town; at most TALLY_RULES.heldMax held per hero;
//     one task per ground + monster
//   · the SERVER counts kills inside the hunt settle, watched or browser closed,
//     for every hero in the instance; never the client
//   · paid in the settle that brings the hero back to town (or when the hero
//     visits her in town): gold into the account purse, the pick into the bag
//   · at most TALLY_RULES.paidPerDay paid per hero per server (UTC) day; one
//     finished over that pays the next day
//   · "Keep this task" takes it again the moment it pays
//
// The numbers are PROVISIONAL (the designer re-tunes them after combat balance):
// a count is about an hour at the ground's floor from measured kill rates, the
// gold about 35% of the ground's hourly coin for that hour. Postgres gets
// hr_tally_tasks / hr_tally_pieces / hr_tally_materials GENERATED from this file
// by `node tools/gen-tally-tasks.mjs` (`--check` fails the build on drift).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { TOWN_NAME } from './world/town/plan.js?v=0.2.122';

/** Who keeps the tally. What she says lives in src/data/text/tally.js (first person, one line per state). */
export const TALLY_KEEPER = Object.freeze({
  name: 'Tamsin Reeve',
  /* where her board stands (src/data/world/stations.js `tally`) */
  board: 'Hearth Square',
});

/** The server's limits (hr_tally_config). */
export const TALLY_RULES = Object.freeze({
  heldMax: 3,
  paidPerDay: 3,
  /* The armour weights a hero may ask her for (core-model.js ARMOUR_WEIGHT's values). */
  weights: Object.freeze(['heavy', 'medium', 'light']),
  /* Her default slot order: the next piece is the first slot in this order she has not given yet. */
  slotOrder: Object.freeze(['helmet', 'body', 'pants', 'boots', 'gloves', 'belt']),
});

/* A task row:
     id        [a-z0-9_], stable (held tasks and the ledger name it)
     hunt      a src/data/hunts.js id with a ground (src/data/hunt-grounds.js)
     monster   a monster that spawns on that ground
     label     the monster as the board counts it ("Gray Wolves 112/200")
     count     kills to finish
     gold      what she pays (into the account purse)
     party     true: the ground is built for a party (the board says so)
     piecesFrom (optional) a hunt id: her pieces on this task are that ground's Scarce set, not its own (the Glade: lane/b-rulings-1102)
     materials her pick once every Scarce piece of the ground is given, in turn: [{ item, qty }] */
const row = (r) => Object.freeze({ ...r, materials: Object.freeze(r.materials.map((m) => Object.freeze(m))) });

export const TALLY_TASKS = Object.freeze([
  /* THE FIRST TASK FINISHES INSIDE THE FIRST HUNT (designer 2026-11-10, lane/d-first-ten-minutes, played: 120 took 27 minutes of a ground the game
     sends a hero out of at 16). Three fresh heroes had 24 to 29 rats at hunt minute 5 to 6 (rats are 61% of the Cellar's kills). 25 gp for 25 rats is
     the old 100 for 120 per rat, and her three pays a day cap it. Her Cellar piece is a helmet in every weight, worn at Level 1. */
  row({ id: 'cellar_giant_rats', hunt: 'mill_cellar', monster: 'rat', label: 'Giant Rats', count: 25, gold: 25, party: false,
    materials: [{ item: 'slime_gel', qty: 4 }, { item: 'silk_thread', qty: 1 }] }),
  row({ id: 'thicket_gray_wolves', hunt: 'meadowbrook_thicket', monster: 'gray_wolf', label: 'Gray Wolves', count: 200, gold: 480, party: false,
    materials: [{ item: 'raw_wolf_meat', qty: 5 }, { item: 'bones', qty: 6 }] }),
  /* Wickstead, the solo 8-18 ground, had no task: from the Thicket to the Glade a lone hero had only the wolves (designer
     2026-10-31, lane/b-core-loop-20h). The deserters who burned the farm. Played at Levels 10-16: ~50 Turncoats of the
     ground's ~600 kills an hour and ~2,200 gp of coin an hour, so 50 is about an hour and 780 gp about 35% of it. Her
     first picks here are the Iron Platebody and Platelegs (its Scarce rows), worn at 15: a goal for Levels 8-14. */
  row({ id: 'wickstead_turncoats', hunt: 'wickstead', monster: 'turncoat', label: 'Turncoats', count: 50, gold: 780, party: false,
    materials: [{ item: 'silk_thread', qty: 4 }, { item: 'wolf_pelt', qty: 6 }] }),
  /* The designer's Sewer materials (2026-10-23). */
  row({ id: 'sewer_rat_king', hunt: 'millrace_sewer', monster: 'rat_king', label: 'the Rat King', count: 5, gold: 1020, party: true,
    materials: [{ item: 'silk_thread', qty: 3 }, { item: 'bat_wing', qty: 4 }, { item: 'bone_chips', qty: 3 }] }),
  /* THE LEVEL 18-30 GOAL (designer 2026-11-02, lane/b-rulings-1102): no ground offered a new piece from 18 to 30, and the Glade drops Iron about hourly, so her
     Iron here paid nothing a hero lacked. She pays the Steel set instead, once each, worn at 30: a set to finish before the Warrens. Steel bids 0.14 of book
     (10-23), so it is no faucet, and paid-per-day caps it. */
  row({ id: 'glade_poachers', hunt: 'mosslight_glade', monster: 'glade_poacher', label: 'Glade Poachers', count: 60, gold: 920, party: false, piecesFrom: 'coppercap_warrens',
    materials: [{ item: 'magic_essence', qty: 2 }, { item: 'bone_chips', qty: 4 }, { item: 'copper_ore', qty: 4 }] }),
  row({ id: 'warrens_goblin_diggers', hunt: 'coppercap_warrens', monster: 'goblin_digger', label: 'Goblin Diggers', count: 30, gold: 1090, party: true,
    materials: [{ item: 'copper_ore', qty: 8 }, { item: 'coal', qty: 4 }, { item: 'iron_ore', qty: 3 }] }),
]);

/** The task row of an id, or null. */
export function tallyTask(id) {
  return TALLY_TASKS.find((t) => t.id === id) || null;
}

/**
 * Every problem with the rows, as strings (empty = valid). The ground checks
 * (the hunt has a ground, the monster spawns on it, the pieces) are the
 * generator's, which reads the grounds and the loot bands.
 * @param {object} refs  { monsters, items, hunts: [{id}] }
 * @param {object[]} [rows]  the task rows (default TALLY_TASKS; the generator's selftest hands a patched copy)
 * @param {object} [rules]   the rules (default TALLY_RULES)
 */
export function validateTallyTasks(refs, rows = TALLY_TASKS, rules = TALLY_RULES) {
  const out = [];
  const ids = new Set();
  const pairs = new Set();
  const hunts = new Set((refs.hunts || []).map((h) => h.id));
  const known = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  if (!Number.isInteger(rules.heldMax) || rules.heldMax < 1 || rules.heldMax > 3) out.push('heldMax must be 1..3 (the place column)');
  if (!Number.isInteger(rules.paidPerDay) || rules.paidPerDay < 1 || rules.paidPerDay > 3) out.push('paidPerDay must be 1..3 (the claim ordinal)');
  if (new Set(rules.slotOrder).size !== rules.slotOrder.length) out.push('slotOrder repeats a slot');
  for (const t of rows) {
    const at = 'task ' + JSON.stringify(t.id);
    if (!/^[a-z0-9_]{1,40}$/.test(String(t.id))) out.push(at + ': bad id');
    if (ids.has(t.id)) out.push(at + ': duplicate id');
    ids.add(t.id);
    if (!hunts.has(t.hunt)) out.push(at + ': hunt ' + t.hunt + ' is no hunt');
    if (!known(refs.monsters, t.monster)) out.push(at + ': monster ' + t.monster + ' is no monster');
    if (pairs.has(t.hunt + '|' + t.monster)) out.push(at + ': a second task for the same ground and monster');
    pairs.add(t.hunt + '|' + t.monster);
    if (typeof t.label !== 'string' || t.label.length < 3 || t.label.length > 32) out.push(at + ': label must be 3..32 characters');
    if (!Number.isInteger(t.count) || t.count < 1 || t.count > 100000) out.push(at + ': count must be 1..100000');
    if (!Number.isInteger(t.gold) || t.gold < 1 || t.gold > 1000000) out.push(at + ': gold must be 1..1000000');
    if (typeof t.party !== 'boolean') out.push(at + ': party must be a boolean');
    if (!Array.isArray(t.materials) || !t.materials.length || t.materials.length > 6) out.push(at + ': 1..6 materials');
    for (const m of t.materials || []) {
      if (!known(refs.items, m.item)) out.push(at + ': material ' + m.item + ' is no item');
      if (!Number.isInteger(m.qty) || m.qty < 1 || m.qty > 100) out.push(at + ': material ' + m.item + ' qty must be 1..100');
    }
  }
  return out;
}
