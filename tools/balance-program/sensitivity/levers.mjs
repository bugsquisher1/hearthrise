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
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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
/* a weapon profile's line in src/data/gear-profiles.js (its numbers are permille of the offense budget; the formula sizes every tier) */
const WEAPON_PROFILE = (l) => /^\s*(sword|warhammer|hatchets|fists|bow|crossbow|staff|wand|spellbook): Object\.freeze\(\{ curve: 'offense'/.test(l);
const after = (re) => (line) => [...line.matchAll(re)].map((m) => ({ index: m.index + m[0].length - m[1].length, value: m[1] }));
const listAfter = (re) => (line) => {
  const m = re.exec(line);
  if (!m) return [];
  const start = m.index + m[0].indexOf('[') + 1;
  return [...m[1].matchAll(/\d+(?:\.\d+)?/g)].map((n) => ({ index: start + n.index, value: n[0] }));
};
const lastArg = (line) => { const m = /, (\d+)\),\s*$/.exec(line.replace(/\r$/, '')); return m ? [{ index: m.index + 2, value: m[1] }] : []; };
const both = (...fs) => (line) => fs.flatMap((f) => f(line));

/* THE FAMILIES. `lines`: which lines of `file` belong to the family; `pick`: the numbers on a line; `round`: the grid a scaled number
   must sit on (the engine's 100 ms sub-step for a clock); `min`: the least value the data's own validator takes. */
export const FAMILIES = Object.freeze([
  { id: 'respawn', group: 'Spawns', label: 'Respawn time', what: 'How long a cleared pack takes to come back, every ground row with a written respawnMs (src/data/hunt-grounds.js and each ground pack, src/data/grounds/*/pack.js). Kill throughput where a party clears faster than packs return',
    file: 'src/data/hunt-grounds.js', lines: (l) => /^\s*(route: .*)?respawnMs: \d+, pullDist/.test(l), pick: after(/respawnMs: (\d+)/g), round: 100, min: 100, steps: WIDE, intends: ['killsPerH', 'pullsPerH'],
    /* a ground pack writes its respawn twice (the hunt row and the ground row): both move, so the pack never disagrees with itself */
    also: [{ files: (root) => readdirSync(join(root, 'src/data/grounds')).filter((d) => existsSync(join(root, 'src/data/grounds', d, 'pack.js'))).sort().map((d) => 'src/data/grounds/' + d + '/pack.js'),
      lines: (l) => /\brespawnMs: \d+/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l) }] },
  { id: 'spellCost', group: 'Spells', label: 'Spell mana cost', what: 'The mana of every ability row, each rune version included (src/data/abilities.js mana and versions). Casts before a drink, and the drink bill',
    file: 'src/data/abilities.js', lines: (l) => (/\bmana: \d+/.test(l) || /\bversions: \[/.test(l)) && !/^\s*(\/\/|\*|\/\*)/.test(l), pick: both(after(/\bmana: (\d+)/g), listAfter(/\bversions: \[([\d, ]+)\]/)), min: 1, steps: WIDE, intends: ['manaSpentPerH', 'manaPotionsPerH', 'castsPerH'] },
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
  /* THE STORE'S PRICES ARE DERIVED (lane/econ-levers, src/data/store-kit.js): the ids stay (the kept matrix reads them), the numbers moved are
     the derivation's. foodPrice moves the share of the wage every store price is written in, drinkPrice the reference hour's restore it is
     divided by (a price goes as its inverse); the crafted partners' floors hold under both */
  { id: 'foodPrice', group: 'Supplies', label: 'Store price ceiling', what: 'How much dearer the store is than the crafted good (src/data/store-kit.js storeCeiling): every derived store price where the wage\'s share binds',
    file: 'src/data/store-kit.js', lines: (l) => /^\s*storeCeiling: [\d.]+,/.test(l), pick: after(/storeCeiling: ([\d.]+)/g), float: true, steps: WIDE, intends: ['storePerH', 'netPerH'] },
  { id: 'drinkPrice', group: 'Supplies', label: 'Store reference restore', what: 'HP and mana a reference hero restores from the store an hour (src/data/store-kit.js refRestore): a meal or drink\'s derived price goes as its inverse',
    file: 'src/data/store-kit.js', lines: (l) => /^\s*refRestore: \d+,/.test(l), pick: after(/refRestore: (\d+)/g), min: 1, steps: WIDE, intends: ['storePerH', 'netPerH'] },
  /* THE SECOND PASS: gear tables, the rune price, what gear sells for, the wait between pulls and the Blessings' cut */
  { id: 'weaponDamage', group: 'Equipment', label: 'Weapon damage by tier', what: 'The damage bonus of every weapon family (src/data/gear-profiles.js: each weapon profile\'s damage, every tier through the gear formula). The gear term of a blow, apart from skill',
    file: 'src/data/gear-profiles.js', lines: WEAPON_PROFILE, pick: after(/\b(?:strB|rangeStrB|magicStrB): (\d+)/g), min: 1, steps: WIDE, intends: ['dps', 'killsPerH'] },
  { id: 'weaponAccuracy', group: 'Equipment', label: 'Weapon accuracy by tier', what: 'The accuracy bonus of every weapon family (src/data/gear-profiles.js: each weapon profile\'s accuracy, every tier through the gear formula). How often a blow lands',
    file: 'src/data/gear-profiles.js', lines: WEAPON_PROFILE, pick: after(/\b(?:atkB|rangeAtkB|magicAtkB): (\d+)/g), min: 1, steps: WIDE, intends: ['dps', 'killsPerH'] },
  { id: 'armorValue', group: 'Equipment', label: 'Armor points by slot and tier', what: 'The armor points of every slot at every tier (src/data/gear-profiles.js GEAR_CURVES defense: the whole kit\'s armor budget the formula splits by slot and weight). What the mitigation curve is fed',
    file: 'src/data/gear-profiles.js', lines: (l) => /^\s*defense: Object\.freeze\(\{ c0: /.test(l), pick: after(/\bc\d: ([\d.]+)/g), float: true, steps: WIDE, intends: ['takenPerH'] },
  { id: 'runePrice', group: 'Supplies', label: 'Store charge floor', what: 'A store shot or cast costs at least this x its crafted partner\'s book (src/data/supply-basics.js BASIC_AMMO_PREMIUM): the floor that sets the derived rune and arrow prices at the reference',
    file: 'src/data/supply-basics.js', lines: (l) => /^export const BASIC_AMMO_PREMIUM = [\d.]+;/.test(l), pick: after(/BASIC_AMMO_PREMIUM = ([\d.]+)(?=;)/g), float: true, steps: WIDE, intends: ['storePerH', 'netPerH'] },
  { id: 'gearSaleRate', group: 'Rewards', label: 'What dropped gear sells for', what: 'The share of book value a dropped piece sells for, by tier (src/data/loot-bands.js VENDOR_GEAR_RATES). Gold in from loot',
    file: 'src/data/loot-bands.js', lines: (l) => /^export const VENDOR_GEAR_RATES = /.test(l), pick: listAfter(/freeze\(\[([\d., ]+)\]\)/), float: true, max: 1, steps: [0.5, 0.75, 1.25, 1.5, 2], intends: ['incomePerH', 'netPerH'] },
  { id: 'regroup', group: 'Spawns', label: 'Wait between pulls', what: 'The least time a party regroups before the next pull (src/data/hunt-tuning.js regroupMs). The dead time a kill cannot shorten',
    file: 'src/data/hunt-tuning.js', lines: (l) => /^\s*regroupMs: \d+,/.test(l), pick: after(/regroupMs: (\d+)/g), round: 100, min: 100, steps: [0.2, 0.5, 2, 4], intends: ['killsPerH', 'pullsPerH'] },
  { id: 'blessingCut', group: 'Progression', label: 'The Blessing\'s cut of a death', what: 'The share of a death\'s loss the one Blessing takes off (src/data/blessings.js BLESSING.cutPm; lane/level-costs)',
    file: 'src/data/blessings.js', lines: (l) => /^\s*cutPm: \d+,/.test(l), pick: after(/cutPm: (\d+)/g), min: 1, max: 1000, steps: [0.5, 0.75, 1.25], intends: ['deathTax', 'netLevelXpPerH'] },
  /* NOT A LEVER OF THE PASS (`experimentOnly`): the Tower's and the Catacombs' stair clock. The engine refuses an attack interval over
     half of it (src/core/hunt/tower.js: "stairMs is under two engine swings"), so the attack clock cannot be slowed alone. The `clock`
     experiment moves the two together. No cell of the pass plays a run ground, so the stair alone moves nothing here. */
  { id: 'stairClock', group: 'Spawns', label: 'Run stair clock', what: 'The time between a cleared floor and the next (src/data/tower.js stairMs, the Tower and the Catacombs)', experimentOnly: true,
    file: 'src/data/tower.js', lines: (l) => /^\s*stairMs: \d+,/.test(l), pick: after(/stairMs: (\d+)/g), round: 100, min: 100, steps: [2], intends: [] },
]);

/** Every lever of the pass: { id, kind, group, label, what, steps, intends }. */
export function leverList(root) {
  const knobs = readKnobs(root);
  const out = [];
  for (const k of knobs.knobs) {
    const [steps, intends] = KNOB_PLAN[k.id] || [WIDE, []];
    out.push({ id: k.id, kind: 'knob', group: k.group, label: k.label, what: k.what, steps: [...steps], intends, planned: !!KNOB_PLAN[k.id] });
  }
  for (const f of FAMILIES.filter((x) => !x.experimentOnly)) out.push({ id: f.id, kind: 'family', group: f.group, label: f.label, what: f.what, steps: [...f.steps], intends: f.intends, planned: true });
  return out;
}

const scale = (value, m, f) => {
  if (Number(value) === 0) return String(value);
  let v = Number(value) * m;
  v = f.float ? Number(v.toPrecision(6)) : f.round ? Math.round(v / f.round) * f.round : Math.round(v);
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

/** The files a family writes in: its own, then every file of `also` (a ground pack keeps its own respawn beside hunt-grounds.js). */
export function familyParts(root, f) {
  const out = [f];
  for (const a of f.also || []) for (const file of a.files(root)) out.push({ ...f, file, lines: a.lines, pick: a.pick || f.pick });
  return out;
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
    sites[id] = [];
    for (const part of familyParts(root, f)) {
      const text = texts.has(part.file) ? texts.get(part.file) : readFileSync(join(root, part.file), 'utf8');
      const r = familyEdits(part, m, text);
      texts.set(part.file, r.text);
      patch.edits.push(...r.edits);
      sites[id].push(...r.sites.map((s) => ({ file: part.file, ...s })));
    }
  }
  return { patch, sites };
}

/* THE REGISTRY (tools/balance-program/levers.json, lane/bl-levers): which of its levers each lever of this pass moves. A knob moves the
   registry levers that name it (`perturb.knob`, `perturb.also`); a family is mapped by hand to the registry row its numbers sit in. */
export const FAMILY_REGISTRY = Object.freeze({ respawn: ['spawn.respawn'], spellCost: ['spell.mana-cost'], spellCooldown: ['spell.cooldowns'], spellPower: ['spell.shares'],
  healPower: ['heal.shares'], shieldPower: ['heal.shares'], spellLeech: ['leech.rows'], foodPrice: ['econ.store-kit'], drinkPrice: ['econ.store-kit'],
  weaponDamage: ['weapon.family-tables'], weaponAccuracy: ['weapon.family-tables'], armorValue: ['gear.armor-table'], runePrice: ['econ.ammo-floor'], gearSaleRate: ['econ.sale-rates'],
  regroup: ['spawn.between-pulls'], blessingCut: ['level.blessing-cut'] });
/** Coverage of the registry by this pass: { rows: [{ id, category, kind, sweptBy: [lever ids] }], counts }. Null when the registry is not on this tree. */
export function registryCoverage(root) {
  let doc;
  try { doc = JSON.parse(readFileSync(join(root, 'tools/balance-program/levers.json'), 'utf8')); } catch { return null; }
  const mine = leverList(root).map((l) => l.id);
  const rows = doc.levers.map((l) => {
    const p = l.perturb || {};
    const by = mine.filter((id) => p.knob === id || (p.also || []).includes(id) || (FAMILY_REGISTRY[id] || []).includes(l.id));
    return { id: l.id, category: l.category, name: l.name, kind: p.kind, gap: p.gap || null, sweptBy: by };
  });
  const playable = rows.filter((r) => r.kind !== 'not-playable');
  return { rows, counts: { registry: rows.length, playable: playable.length, swept: rows.filter((r) => r.sweptBy.length).length, playableSwept: playable.filter((r) => r.sweptBy.length).length,
    notPlayable: rows.length - playable.length, passLevers: mine.length } };
}
