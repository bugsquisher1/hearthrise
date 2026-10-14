#!/usr/bin/env node
// ============================================================
// tests/supplies-catalogue.mjs — THE HUNT BAG, THE ACTION BAR AND THE END CARD
// ARE WELL-FORMED DATA (Hunt Sessions, ruling HR-2026-10-14, lane D).
//
//   node tests/supplies-catalogue.mjs             the guard
//   node tests/supplies-catalogue.mjs --selftest  mutation proof (every arm bites)
//
//   S1 every supply row names an item that exists
//   S2 its kind is the kind the item's own data says (raw food is never one)
//   S3 it is crafted or sold: an artisan recipe or a shop offer makes it
//   S4 no id twice; S5 every item that IS a supply is listed (completeness)
//   S6 essential: heals yes, buffs no, ammo only where an empty slot hurts
//   S7 heal and buff values are the item's own, never a copy
//   S8 every buff type is sorted into COMBAT or IDLE, and only once
//   S9 HEAL_ORDER is every heal, cheapest first
//   R1 the rule vocabulary is exactly the ruling's, and frozen
//   R2 the default preset only uses that vocabulary, inside its ranges
//   H1 every hunt walks 10..300 s in whole ticks; every monster tier has a walk
//   G1 every hunt and every monster tier has a sensible-bag heal
//   L1 falls 3 (1–6), hours 1–24 (off by default), 10 bag lines
//   C1 the end order is the ruling's, and every reason and event has copy
//      that uses only known placeholders and never says "1 times"
//
// Exit 0 clean, 1 on any violation, 2 harness error.
// ============================================================

import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  SUPPLY_KINDS, COMBAT_BUFF_TYPES, IDLE_BUFF_TYPES, SUPPLY_ROWS, SUPPLIES, HEAL_ORDER,
  supplyKindOf, BAG_TARGET_HOURS, BAG_GUIDE_BY_HUNT, BAG_GUIDE_BY_TIER, bagGuideFor,
} from '../src/data/supplies.js';
import {
  RULE_SUBJECTS, RULE_OPERATORS, COOLDOWN_GROUPS, ACTION_SET_LIMITS, HEAL_ANY, DEFAULT_PRESET, parseSubject,
} from '../src/data/rule-subjects.js';
import {
  SESSION_LIMITS, END_ORDER, END_CARD_COPY, END_REASON_COPY, TIMELINE_COPY, EVENT_COPY,
} from '../src/data/hunt-sessions.js';
import { HUNTS, TRAINING_TRAVEL_S, trainingHunt } from '../src/data/hunts.js';
import { itemSources, ITEMS, MONSTERS } from '../src/data/catalogue-coherence.js';
import { BUFFS_DEF } from '../src/core/buffs.js';
import { styleNeedsAmmo } from '../src/core/ammo.js';

/* The ruling's own lists (§2), typed once here so the data can be held to them. */
const RULING_SUBJECTS = ['self_hp_pct', 'buff_left_s', 'buff_missing', 'bag_left', 'session_minutes'];
/* 'vigour' LEFT the end order (designer ruling, 2026-10-14 loop check: "no cap
   on combat"); a hunt ends on its bag, falls, optional hours, leave, change or
   the server only. */
const RULING_END_ORDER = ['falls', 'heals_out', 'ammo_out', 'hours', 'left', 'changed', 'server'];
const RULING_EVENTS = ['entered', 'level_up', 'rare_drop', 'fall', 'slot_dry', 'vigour_low', 'ended'];
const PLACEHOLDERS = new Set(['hunt', 'item', 'skill', 'level', 'n', 'have', 'need', 'monster', 'reason']);

const AMMO_FAMILY = { ranged: 'ranged', magic: 'magic' };

function deepFrozen(o) {
  if (o === null || typeof o !== 'object') return true;
  if (!Object.isFrozen(o)) return false;
  return Object.values(o).every(deepFrozen);
}

function crafted(sources, id) {
  return (sources.get(id) || []).some((l) => l === 'shop' || l.startsWith('made by '));
}

/** Validate one condition against the vocabulary. Returns an error string or null. */
function conditionError(c, supplies) {
  const { base, param } = parseSubject(c && c.subject);
  const sub = Object.prototype.hasOwnProperty.call(RULE_SUBJECTS, base) ? RULE_SUBJECTS[base] : null;
  if (!sub) return `subject '${c && c.subject}' is not in the allowed list`;
  if (sub.param === null && param !== null) return `subject '${base}' takes no parameter`;
  if (sub.param === 'buff' && !COMBAT_BUFF_TYPES.includes(param)) return `'${c.subject}' names no combat buff type`;
  if (sub.param === 'item' && !(param in supplies)) return `'${c.subject}' names no supply`;
  if (sub.range === null) return ('op' in c || 'value' in c) ? `'${base}' takes no operator or value` : null;
  if (!Object.prototype.hasOwnProperty.call(RULE_OPERATORS, c.op)) return `operator '${c.op}' is not <= or >=`;
  if (!Number.isInteger(c.value) || c.value < sub.range[0] || c.value > sub.range[1]) return `value ${c.value} is outside ${sub.range.join('..')}`;
  return null;
}

function templates(entry) {
  return Object.entries(entry || {});
}

export function check(d) {
  const fails = [];
  const f = (code, msg) => fails.push(`${code} ${msg}`);
  const sources = itemSources();
  const seen = new Set();
  const listed = Object.create(null);

  for (const [kind, id, essential] of d.rows) {
    const it = d.items[id];
    if (!it) { f('S1', `supply '${id}' is not an item in src/data/items.js`); continue; }
    if (seen.has(id)) f('S4', `supply '${id}' is listed twice`);
    seen.add(id);
    listed[id] = kind;
    if (!SUPPLY_KINDS.includes(kind)) f('S2', `supply '${id}' has unknown kind '${kind}'`);
    const real = supplyKindOf(it);
    if (real !== kind) f('S2', `supply '${id}' is listed as '${kind}' but its item data says '${real}'`);
    if (!crafted(sources, id)) f('S3', `supply '${id}' has no recipe and no shop offer (sources: ${(sources.get(id) || []).join(', ') || 'none'})`);
    const want = kind === 'heal' ? true : kind === 'buff' ? false
      : styleNeedsAmmo(AMMO_FAMILY[it.reqSkill] || 'sword');
    if (essential !== want) f('S6', `supply '${id}' essential=${essential}, the rule says ${want}`);
  }
  for (const id of Object.keys(d.items)) {
    if (supplyKindOf(d.items[id]) && !(id in listed)) f('S5', `'${id}' is a ${supplyKindOf(d.items[id])} item with no supply row`);
  }
  if (d.checkValues) {
    for (const id of Object.keys(SUPPLIES)) {
      const s = SUPPLIES[id]; const it = d.items[id] || {};
      if (s.kind === 'heal' && s.heals !== it.heals) f('S7', `'${id}' heals ${s.heals}, the item says ${it.heals}`);
      if (s.kind === 'buff' && JSON.stringify(s.buff) !== JSON.stringify(it.buff)) f('S7', `'${id}' buff differs from the item`);
    }
  }
  const types = [...d.combatBuffs, ...IDLE_BUFF_TYPES];
  if (new Set(types).size !== types.length) f('S8', 'a buff type is in both COMBAT and IDLE');
  for (const t of Object.keys(BUFFS_DEF)) if (!types.includes(t)) f('S8', `buff type '${t}' is in neither COMBAT_BUFF_TYPES nor IDLE_BUFF_TYPES`);
  for (const t of types) if (!(t in BUFFS_DEF)) f('S8', `'${t}' is not a buff type in src/core/buffs.js`);
  const heals = d.rows.filter((r) => r[0] === 'heal').map((r) => r[1]);
  if (JSON.stringify([...HEAL_ORDER].sort()) !== JSON.stringify([...heals].sort())) f('S9', 'HEAL_ORDER is not exactly the heal rows');
  for (let i = 1; i < HEAL_ORDER.length; i++) {
    if (ITEMS[HEAL_ORDER[i]].v < ITEMS[HEAL_ORDER[i - 1]].v) f('S9', `HEAL_ORDER puts '${HEAL_ORDER[i]}' after a dearer heal`);
  }

  if (JSON.stringify(Object.keys(d.subjects)) !== JSON.stringify(RULING_SUBJECTS)) f('R1', `subjects ${Object.keys(d.subjects).join(',')} are not the ruling's ${RULING_SUBJECTS.join(',')}`);
  if (JSON.stringify(Object.keys(RULE_OPERATORS)) !== '["<=",">="]') f('R1', 'operators are not exactly <= and >=');
  if (COOLDOWN_GROUPS.heal.ms !== 2000 || COOLDOWN_GROUPS.buff.ms !== 1000 || Object.keys(COOLDOWN_GROUPS).length !== 2) f('R1', 'cooldowns are not heal 2 s, buff 1 s');
  for (const [name, o] of Object.entries({ RULE_SUBJECTS: d.subjects, RULE_OPERATORS, COOLDOWN_GROUPS, ACTION_SET_LIMITS, DEFAULT_PRESET: d.preset })) {
    if (!deepFrozen(o)) f('R1', `${name} is not frozen all the way down`);
  }
  if (ACTION_SET_LIMITS.presets !== 5 || ACTION_SET_LIMITS.slots !== 10 || ACTION_SET_LIMITS.conditions !== 3) f('R1', 'action-set limits are not 5 presets, 10 slots, 3 conditions');

  const preset = d.preset;
  if (!preset.slots.length || preset.slots.length > ACTION_SET_LIMITS.slots) f('R2', 'default preset slot count out of range');
  preset.slots.forEach((slot, i) => {
    const target = slot.item === HEAL_ANY ? 'heal' : (SUPPLIES[slot.item] || {}).kind;
    if (target !== 'heal' && target !== 'buff') f('R2', `slot ${i} fires '${slot.item}', which is not a heal or buff supply`);
    if (slot.conditions.length > ACTION_SET_LIMITS.conditions) f('R2', `slot ${i} has more than ${ACTION_SET_LIMITS.conditions} conditions`);
    for (const c of slot.conditions) { const e = conditionError(c, SUPPLIES); if (e) f('R2', `slot ${i}: ${e}`); }
  });
  const first = preset.slots[0] || {}; const c0 = (first.conditions || [])[0] || {};
  if (first.item !== HEAL_ANY || c0.subject !== 'self_hp_pct' || c0.op !== '<=' || c0.value !== 50) f('R2', 'the default preset does not start with "cheapest heal at HP <= 50%"');

  for (const h of d.hunts) {
    if (!Number.isInteger(h.travelS) || h.travelS < 10 || h.travelS > 300 || h.travelS % 10) f('H1', `hunt '${h.id}' travelS ${h.travelS} is not 10..300 in whole 10 s ticks`);
  }
  const tiers = [...new Set(Object.values(MONSTERS).map((m) => m.tier).filter(Boolean))];
  for (const t of tiers) {
    const s = TRAINING_TRAVEL_S[t];
    if (!Number.isInteger(s) || s < 10 || s > 300 || s % 10) f('H1', `monster tier ${t} has no valid training walk`);
    if (trainingHunt('x', { tier: t }).travelS !== s) f('H1', `trainingHunt ignores TRAINING_TRAVEL_S for tier ${t}`);
  }

  const guideOk = (g, where) => {
    if (!g || (SUPPLIES[g.heal] || {}).kind !== 'heal') f('G1', `${where}: '${g && g.heal}' is not a heal supply`);
    else if (!Number.isInteger(g.qty) || g.qty < 1 || g.qty > 100000) f('G1', `${where}: qty ${g.qty} is not a whole bag line`);
  };
  for (const h of d.hunts) guideOk(BAG_GUIDE_BY_HUNT[h.id], `hunt '${h.id}'`);
  for (const id of Object.keys(BAG_GUIDE_BY_HUNT)) if (!d.hunts.some((h) => h.id === id)) f('G1', `bag guide for unknown hunt '${id}'`);
  for (const t of tiers) guideOk(BAG_GUIDE_BY_TIER[t], `tier ${t}`);
  if (bagGuideFor('mill_cellar', 6) !== BAG_GUIDE_BY_HUNT.mill_cellar || bagGuideFor('panther', 5) !== BAG_GUIDE_BY_TIER[5]) f('G1', 'bagGuideFor does not prefer the hunt row, then the tier');
  if (!(BAG_TARGET_HOURS >= 2 && BAG_TARGET_HOURS <= 6)) f('G1', `BAG_TARGET_HOURS ${BAG_TARGET_HOURS} is outside the ruling's 2–6 h`);

  const L = d.limits;
  if (L.falls.default !== 3 || L.falls.min !== 1 || L.falls.max !== 6) f('L1', 'falls is not 3 (1–6)');
  if (L.hours.min !== 1 || L.hours.max !== 24 || L.hours.default !== null) f('L1', 'hours is not 1–24, off by default');
  if (L.bagLines !== 10) f('L1', 'a bag is not 10 lines');

  if (JSON.stringify(d.endOrder) !== JSON.stringify(RULING_END_ORDER)) f('C1', `end order ${d.endOrder.join(',')} is not the ruling's`);
  for (const r of RULING_END_ORDER) if (!d.endCopy[r]) f('C1', `end reason '${r}' has no copy`);
  for (const e of RULING_EVENTS) if (!EVENT_COPY[e]) f('C1', `timeline event '${e}' has no copy`);
  const copyTables = { END_REASON_COPY: d.endCopy, EVENT_COPY, END_CARD_COPY, TIMELINE_COPY };
  for (const [tname, table] of Object.entries(copyTables)) {
    for (const [key, entry] of Object.entries(table)) {
      const forms = typeof entry === 'string' ? [['text', entry]] : templates(entry);
      if (typeof entry !== 'string' && !entry.one) f('C1', `${tname}.${key} has no 'one' form`);
      for (const [form, text] of forms) {
        for (const m of text.matchAll(/\{([a-z]+)\}/g)) if (!PLACEHOLDERS.has(m[1])) f('C1', `${tname}.${key}.${form} uses unknown placeholder {${m[1]}}`);
        if (/\(s\)|\b1 times\b|\{n\} time\b/.test(text)) f('C1', `${tname}.${key}.${form} has a plural slip: "${text}"`);
        if (form === 'other' && !text.includes('{n}')) f('C1', `${tname}.${key}.other never says the count`);
        if (form === 'one' && text.includes('{n}')) f('C1', `${tname}.${key}.one prints a count that can only be 1`);
      }
    }
  }
  return fails;
}

const REAL = () => ({
  rows: SUPPLY_ROWS, items: ITEMS, combatBuffs: COMBAT_BUFF_TYPES, subjects: RULE_SUBJECTS,
  preset: DEFAULT_PRESET, hunts: HUNTS, limits: SESSION_LIMITS, endOrder: END_ORDER, endCopy: END_REASON_COPY,
  checkValues: true,
});

function presetWith(cond) {
  return Object.freeze({ name: 'p', slots: Object.freeze([Object.freeze({ item: HEAL_ANY, on: true, conditions: Object.freeze([Object.freeze(cond)]) })]) });
}

function selftest() {
  const PLANT = '__supplies_plant_stew';
  const mutants = [
    ['S3', 'a supply with no source recipe or shop', (d) => {
      ITEMS[PLANT] = { n: 'Planted Stew', v: 1, heals: 5, foodClass: 'healing' };
      d.rows = [...d.rows, ['heal', PLANT, true]];
    }],
    ['S1', 'an unknown item id', (d) => { d.rows = [...d.rows, ['heal', 'not_an_item', true]]; }],
    ['R2', 'a rule subject outside the list', (d) => { d.preset = presetWith({ subject: 'enemy_hp_pct', op: '<=', value: 50 }); }],
    ['R1', 'an extra subject in the vocabulary', (d) => { d.subjects = Object.freeze({ ...RULE_SUBJECTS, enemy_hp_pct: RULE_SUBJECTS.self_hp_pct }); }],
    ['R2', 'a value outside the subject range', (d) => { d.preset = presetWith({ subject: 'self_hp_pct', op: '<=', value: 150 }); }],
    ['R2', 'a buff subject naming an idle buff', (d) => { d.preset = presetWith({ subject: 'buff_missing:gather_speed' }); }],
    ['S2', 'raw food listed as a heal', (d) => { d.rows = [...d.rows, ['heal', 'trout', true]]; }],
    ['S5', 'a supply item left off the list', (d) => { d.rows = d.rows.filter((r) => r[1] !== 'cooked_trout'); }],
    ['S6', 'whetstones made essential', (d) => { d.rows = d.rows.map((r) => (r[1] === 'iron_whetstone' ? ['ammo', r[1], true] : r)); }],
    ['S8', 'a buff type sorted nowhere', (d) => { d.combatBuffs = COMBAT_BUFF_TYPES.filter((t) => t !== 'damage'); }],
    ['H1', 'a walk that is not a whole tick', (d) => { d.hunts = d.hunts.map((h, i) => (i ? h : { ...h, travelS: 15 })); }],
    ['L1', 'falls defaulting to 4', (d) => { d.limits = { ...SESSION_LIMITS, falls: { min: 1, max: 6, default: 4 } }; }],
    ['C1', 'the end order shuffled', (d) => { d.endOrder = ['heals_out', 'falls', ...END_ORDER.slice(2)]; }],
    ['C1', 'Vigour ends a hunt again', (d) => { d.endOrder = [...END_ORDER.slice(0, 3), 'vigour', ...END_ORDER.slice(3)]; }],
    ['C1', 'a "(s)" plural hack in end copy', (d) => { d.endCopy = { ...END_REASON_COPY, falls: { one: 'You fell {n} time(s).' } }; }],
  ];
  let missed = 0;
  for (const [code, name, plant] of mutants) {
    const d = REAL();
    try {
      plant(d);
      const fails = check(d);
      const hit = fails.some((x) => x.startsWith(code + ' '));
      console.log(`  ${hit ? 'RED (good)' : 'MISSED    '} ${code} ${name}${hit ? '' : ' — fails: ' + fails.join(' | ')}`);
      if (!hit) missed++;
    } finally {
      delete ITEMS[PLANT];
    }
  }
  const after = check(REAL());
  if (after.length) { console.error('SELFTEST: a plant leaked:\n  ' + after.join('\n  ')); process.exit(2); }
  console.log(`supplies-catalogue --selftest: ${mutants.length} mutants, ${missed} missed`);
  process.exit(missed ? 1 : 0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1]);
if (isMain) {
  try {
    if (process.argv.includes('--selftest') || process.argv.includes('--mutate')) selftest();
    const fails = check(REAL());
    if (fails.length) {
      console.error('supplies-catalogue: RED');
      fails.forEach((x) => console.error('  ✗ ' + x));
      process.exit(1);
    }
    const n = (k) => SUPPLY_ROWS.filter((r) => r[0] === k).length;
    console.log(`supplies-catalogue: OK — ${SUPPLY_ROWS.length} supplies (${n('heal')} heal, ${n('buff')} buff, ${n('ammo')} ammo), `
      + `each crafted or sold; ${RULING_SUBJECTS.length} rule subjects; default preset valid; ${HUNTS.length} hunts with walks and bag guides; `
      + `${END_ORDER.length} end reasons and ${RULING_EVENTS.length} timeline events with copy`);
  } catch (e) {
    console.error('supplies-catalogue: HARNESS ERROR — ' + (e && e.stack || e));
    process.exit(2);
  }
}
