// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/sensitivity/levers.mjs — THE LEVERS THE SENSITIVITY PASS MOVES, AND HOW (lane/bl-sensitivity, Tyler 2026-11-21,
// the balance baseline request, Phase 4 "perturb the parameter within a reasonable range" and Phase 5).
//
// TWO KINDS, both played only on a scratch copy (matrix-scratch.mjs plantScratch): the game's data is never written.
//   knob      a live knob of tools/balance-program/formulas/knobs.json (the audited list), moved through the patch's `knobs`
//   family    a family of written numbers no knob covers yet (every ground's respawn, every spell's mana, every store heal's price),
//             moved as the patch's `edits`: one edit a line, each number scaled by the same multiplier. NOT new knobs for the game:
//             they are the simulator's way to move parameters that already exist. The lever registry (tools/balance-program/levers.json,
//             lane/bl-levers) is the record of what each parameter is. This list only says how this pass perturbs it.
//
// STEPS are multipliers on today's value. The default ladder is wide on purpose (x0.5 to x2: a local slope does not hold for a large
// change). A lever whose value is a chance, a cap or an exponent takes the narrow ladder: doubling it leaves the range the formula
// can read. A step the game's own validators or the plant refuse is recorded as REFUSED, never skipped silently.
//
// `intends` is the outcome the lever is meant to move, read from the knob's own description (JUDGMENT, this lane's reading). The
// analysis uses it for two questions only: does the lever move what it is for, and what else does it move.
//
// PURE ESM. Reads files. Plays nothing.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readKnobs, PATCH_SCHEMA } from '../matrix-scratch.mjs';

export const WIDE = Object.freeze([0.5, 0.75, 0.9, 1.1, 1.25, 1.5, 2]);
export const NARROW = Object.freeze([0.8, 0.9, 0.95, 1.05, 1.1, 1.2]);

/* knob id -> [ladder, intended outcomes] (outcome ids of tools/balance-program/baseline/outcomes.mjs) */
const KNOB_PLAN = Object.freeze({
  playerAttack: [WIDE, ['dps', 'killsPerH']], critMult: [WIDE, ['dps']], weaknessDamage: [WIDE, ['dps']], toHitBase: [NARROW, ['dps', 'takenPerH']],
  heroAccuracy: [NARROW, ['dps']], attackInterval: [WIDE, ['dps', 'takenPerH']], spellRollLow: [WIDE, ['dps']], manaRegen: [WIDE, ['castsPerH', 'manaPotionsPerH']],
  storeSupplyShare: [WIDE, ['storePerH', 'suppliesPerH']], monsterDamage: [WIDE, ['takenPerH', 'deathsPer1000h']], monsterHp: [WIDE, ['ttkS', 'killsPerH']],
  monsterAccuracy: [NARROW, ['takenPerH']], monsterDefense: [WIDE, ['dps']], monsterDefenseCut: [WIDE, ['dps']], partyGroundHp: [WIDE, ['ttkS']],
  partyGroundBlow: [WIDE, ['takenPerH']], tierDanger: [WIDE, ['takenPerH', 'deathsPer1000h']], tierHp: [WIDE, ['ttkS']], tierXp: [WIDE, ['levelXpPerH']],
  tierPull: [[0.5, 0.75, 1.25, 1.5, 2], ['killsPerH']], heroHp: [WIDE, ['deathsPer1000h', 'lowHpP10']], heroMana: [WIDE, ['castsPerH', 'manaPotionsPerH']],
  armorMitigation: [WIDE, ['takenPerH']], armorCurve: [[0.5, 0.75, 0.9, 1.1, 1.25, 1.5, 2, 2.4], ['takenPerH']], mitigationCap: [[0.5, 0.75, 0.9, 1.1, 1.25, 1.5], ['takenPerH']],
  regen: [WIDE, ['regenPerH', 'foodPerH']], xpPerKill: [WIDE, ['levelXpPerH']], xpByLevel: [NARROW, ['levelXpPerH']], coinPerKill: [WIDE, ['coinPerH', 'netPerH']],
  soloXp: [WIDE, ['levelXpPerH']], partyXp: [WIDE, ['levelXpPerH']], levelCurve: [WIDE, ['hoursPerLevel']], deathLoss: [WIDE, ['deathTax', 'netLevelXpPerH']],
  necroticCut: [WIDE, ['healInPerH']], stormDrain: [WIDE, ['manaSpentPerH', 'manaPotionsPerH']],
});

/* the number-picking helpers of a family: (line) -> [{ index, value }] of the numbers the family scales on that line */
const after = (re) => (line) => [...line.matchAll(re)].map((m) => ({ index: m.index + m[0].length - m[1].length, value: m[1] }));
const listAfter = (re) => (line) => {
  const m = re.exec(line);
  if (!m) return [];
  const start = m.index + m[0].indexOf('[') + 1;
  return [...m[1].matchAll(/\d+/g)].map((n) => ({ index: start + n.index, value: n[0] }));
};
const lastArg = (line) => { const m = /, (\d+)\),\s*$/.exec(line.replace(/\r$/, '')); return m ? [{ index: m.index + 2, value: m[1] }] : []; };
const both = (...fs) => (line) => fs.flatMap((f) => f(line));

/* THE FAMILIES. `lines`: which lines of `file` belong to the family; `pick`: the numbers on a line; `round`: the grid a scaled number
   must sit on (the engine's 100 ms sub-step for a clock); `min`: the least value the data's own validator takes. */
export const FAMILIES = Object.freeze([
  { id: 'respawn', group: 'Spawns', label: 'Respawn time', what: 'How long a cleared pack takes to come back, every ground row with a written respawnMs (src/data/hunt-grounds.js). Kill throughput where a party clears faster than packs return',
    file: 'src/data/hunt-grounds.js', lines: (l) => /^\s*(route: .*)?respawnMs: \d+, pullDist/.test(l), pick: after(/respawnMs: (\d+)/g), round: 100, min: 100, steps: WIDE, intends: ['killsPerH', 'pullsPerH'] },
  { id: 'spellCost', group: 'Spells', label: 'Spell mana cost', what: 'The mana of every ability row, each rune version included (src/data/abilities.js mana and versions). Casts before a drink, and the drink bill',
    file: 'src/data/abilities.js', lines: (l) => /^\s*ab\(\{ id: /.test(l) || /^\s+.*\bversions: \[/.test(l), pick: both(after(/\bmana: (\d+)/g), listAfter(/\bversions: \[([\d, ]+)\]/)), min: 1, steps: WIDE, intends: ['manaSpentPerH', 'manaPotionsPerH', 'castsPerH'] },
  { id: 'spellCooldown', group: 'Spells', label: 'Spell cooldown', what: 'The cooldown of every ability row (src/data/abilities.js cdMs). Casts an hour, so spell damage, healing and mana spent',
    file: 'src/data/abilities.js', lines: (l) => /\bcdMs: \d+/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l), pick: after(/\bcdMs: (\d+)/g), round: 100, min: 100, steps: WIDE, intends: ['castsPerH', 'dps'] },
  { id: 'spellPower', group: 'Spells', label: 'Spell damage share', what: 'The share of the hero\'s blow every damaging ability lands (src/data/abilities.js hitPm). Spell damage, apart from basic attacks',
    file: 'src/data/abilities.js', lines: (l) => /\bhitPm: \d+/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l), pick: after(/\bhitPm: (\d+)/g), min: 1, steps: WIDE, intends: ['dps'] },
  { id: 'healPower', group: 'Spells', label: 'Heal spell size', what: 'What every healing ability restores (src/data/abilities.js healPm and healHpPm). Healing received, food eaten, deaths',
    file: 'src/data/abilities.js', lines: (l) => /\b(healPm|healHpPm): \d+/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l), pick: after(/\b(?:healPm|healHpPm): (\d+)/g), min: 1, steps: WIDE, intends: ['healInPerH', 'foodPerH'] },
  { id: 'shieldPower', group: 'Spells', label: 'Shield spell size', what: 'What every shield ability absorbs (src/data/abilities.js shieldPm). Damage that never reaches HP',
    file: 'src/data/abilities.js', lines: (l) => /\bshieldPm: \d+/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l), pick: after(/\bshieldPm: (\d+)/g), min: 1, steps: WIDE, intends: ['shieldInPerH', 'takenPerH'] },
  { id: 'spellLeech', group: 'Spells', label: 'Life leech (spells)', what: 'The share of a spell blow that returns to the caster as a heal (src/data/abilities.js leechPm, the Necrotic drain). The only life leech the engine reads',
    file: 'src/data/abilities.js', lines: (l) => /\bleechPm: \d+/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l), pick: after(/\bleechPm: (\d+)/g), min: 1, max: 1000, steps: [0.25, 0.5, 2, 3], intends: ['healInPerH', 'foodPerH'] },
  { id: 'foodPrice', group: 'Supplies', label: 'Store food price', what: 'Gold a use of every store heal (src/data/supply-basics.js heal rows). The cost of healing: the supply bill and the gold left after it',
    file: 'src/data/supply-basics.js', lines: (l) => /^\s*heal\('/.test(l), pick: lastArg, min: 1, steps: WIDE, intends: ['storePerH', 'netPerH'] },
  { id: 'drinkPrice', group: 'Supplies', label: 'Store mana drink price', what: 'Gold a use of every store mana drink (src/data/supply-basics.js mana rows). The cost of casting',
    file: 'src/data/supply-basics.js', lines: (l) => /^\s*mana\('/.test(l), pick: lastArg, min: 1, steps: WIDE, intends: ['storePerH', 'netPerH'] },
]);

/** Every lever of the pass: { id, kind, group, label, what, steps, intends }. */
export function leverList(root) {
  const knobs = readKnobs(root);
  const out = [];
  for (const k of knobs.knobs) {
    const [steps, intends] = KNOB_PLAN[k.id] || [WIDE, []];
    out.push({ id: k.id, kind: 'knob', group: k.group, label: k.label, what: k.what, steps: [...steps], intends, planned: !!KNOB_PLAN[k.id] });
  }
  for (const f of FAMILIES) out.push({ id: f.id, kind: 'family', group: f.group, label: f.label, what: f.what, steps: [...f.steps], intends: f.intends, planned: true });
  return out;
}

const scale = (value, m, f) => {
  if (Number(value) === 0) return String(value);
  let v = Number(value) * m;
  v = f.round ? Math.round(v / f.round) * f.round : Math.round(v);
  if (f.min !== undefined) v = Math.max(f.min, v);
  if (f.max !== undefined) v = Math.min(f.max, v);
  return String(v);
};

/**
 * A family's line edits at multiplier `m`, on `text` (the file as it stands, earlier edits of the same patch applied): answers
 * { edits: [{ file, from, to }], sites: [{ line, from, to }], text }. An anchor is the line itself, grown upward a line at a time
 * until it is the only copy in the file (two grounds write the same respawn line).
 */
export function familyEdits(f, m, text) {
  const edits = [], sites = [];
  let cur = text;
  const n0 = text.split('\n').length;
  for (let i = 0; i < n0; i++) {
    const lines = cur.split('\n');
    const line = lines[i];
    if (!f.lines(line)) continue;
    const picks = f.pick(line).sort((a, b) => b.index - a.index);
    if (!picks.length) continue;
    let to = line;
    const moved = [];
    for (const p of picks) { const v = scale(p.value, m, f); moved.unshift([p.value, v]); to = to.slice(0, p.index) + v + to.slice(p.index + p.value.length); }
    if (to === line) continue;
    let k = 0, from = line, repl = to;
    while (cur.split(from).length - 1 !== 1) {
      k++;
      if (i - k < 0) throw new Error('sensitivity: family ' + f.id + ' cannot anchor line ' + (i + 1) + ' of ' + f.file);
      from = lines.slice(i - k, i + 1).join('\n');
      repl = [...lines.slice(i - k, i), to].join('\n');
    }
    edits.push({ file: f.file, from, to: repl });
    sites.push({ line: i + 1, from: moved.map((x) => x[0]), to: moved.map((x) => x[1]) });
    cur = cur.replace(from, () => repl);
  }
  if (!sites.length) throw new Error('sensitivity: family ' + f.id + ' moved no number in ' + f.file + ' at x' + m);
  return { edits, sites, text: cur };
}

/**
 * The patch of one POINT: `levers` { id: multiplier } (one lever for a one-at-a-time step, several for an experiment's point).
 * Answers { patch (hearthrise.balance-patch/1), sites: { family id: [{ line, from, to }] } }.
 */
export function pointPatch(root, levers, name) {
  const knobs = readKnobs(root);
  const patch = { schema: PATCH_SCHEMA, name: name || Object.entries(levers).map(([k, m]) => k + ' x' + m).join(' + '), knobs: {}, edits: [], targets: [] };
  const texts = new Map(), sites = {};
  for (const [id, m] of Object.entries(levers)) {
    if (!(Number.isFinite(m) && m > 0)) throw new Error('sensitivity: lever ' + id + ' needs a positive multiplier, got ' + m);
    if (m === 1) continue;
    if (knobs.byId.has(id)) { patch.knobs[id] = m; continue; }
    const f = FAMILIES.find((x) => x.id === id);
    if (!f) throw new Error('sensitivity: no lever ' + id + ' (a knob of knobs.json or a family of sensitivity/levers.mjs)');
    const text = texts.has(f.file) ? texts.get(f.file) : readFileSync(join(root, f.file), 'utf8');
    const r = familyEdits(f, m, text);
    texts.set(f.file, r.text);
    patch.edits.push(...r.edits);
    sites[id] = r.sites;
  }
  return { patch, sites };
}
