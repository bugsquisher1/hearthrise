#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/prep-defaults.mjs — A BASIC SETUP PER WEAPON TYPE, AND THE NEW SPELL PROMPT (Tyler 2026-11-16).
//
//   node tests/prep-defaults.mjs           the rules
//   node tests/prep-defaults.mjs --mutate  every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/basic-setup.js src/data/basic-setups.js src/shell/windows/hunt-prep/builder.js src/shell/spell-news.js src/shell/alerts.js src/shell/bar-assign.js
//
// Pure, over the real modules: a fake hero whose record is a projection-shaped envelope, and a fake server whose
// hr_action_set_options stores the sent bar and projects it back as hunt_settings (what the next read shows).
// Every expected bar is worked out from the raw rows (ROLE_RULES, ABILITIES, CONSUMABLES), never through the module.
//   PD-1  THE TABLE: src/data/basic-setups.js validates, one row per ability discipline
//   PD-2  BASIC, PER WEAPON TYPE: for every discipline at Level 1 and at 99, twenty slots the server's slot rule takes
//         (conditions.js barProblem); moves first, only the discipline's own (or every list's) and none still waiting
//         for its level; at 99 every move of its role rule set it holds, in order, with that set's own trigger, then
//         Mend unless it is the Healer; then the food the hero carries most of, the store food, the drink it carries
//         most of, the store drink; nothing it does not carry
//   PD-3  THE BUILDER'S PRESS: Basic setup fills the copy's bar with that bar and sends nothing; Save sends ONE
//         hr_action_set_options with it, and the server's bar read back is it; the fight options stay; with no
//         weapon type from the server the press changes nothing
//   PD-4  ONE PROMPT ON A LEVEL-UP: a load raises nothing (the baseline is the first read); a skill crossing a move's
//         unlock raises ONE line "<hero>: New spell <Name>" (a label) with Add to bar, once; a move of another weapon, or one the bar
//         holds already, raises nothing; a read with no skills judges nothing
//   PD-5  ADD TO BAR: ONE intent with the move in the first empty slot as the basic setup writes it, every other slot
//         as it was; the line goes once the server's bar holds it; a full bar sends nothing and opens Hunt prep
//   PD-6  NO REPEAT: a reload (a new page over the same residue) raises nothing for the move it showed, nor does the
//         level dropping and coming back; a line that stood for several moves keeps each one seen
//   PD-7  THE PRESS IS FOUND (Tyler 2026-11-17): it names the weapon type it loads under its name, from the server's discipline, for
//         every one (bare hands on the club's list say Bare hands); before the read it is the feature's name and off; with no
//         weapon type it says so and is off; it leads (the window's gold press) only while the copy's bar is empty
// Exit: 0 green · 1 a rule red · 2 harness error.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { harnessFail, judge, report, exitOf, cleanControl } from './_mutant-verdict.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const clone = (o) => JSON.parse(JSON.stringify(o));
const ids = (bar) => bar.map((s) => (s ? s.action.id : '-')).join(' ');
const tick = () => new Promise((ok) => setTimeout(ok, 5));

/** A hero as the server projects it: skills, bag, the setup in use. `setHuntOptions` plays the server: the sent bar is stored and
    projected back whole (empty slots as null), and every intent is recorded. */
function hero(o = {}) {
  const lv = (n) => ({ xp: 0, level: n });
  const env = {
    name: 'Basil',
    skills: o.skills === undefined ? { melee: lv(9), ranged: lv(1), magic: lv(1), defense: lv(5) } : o.skills,
    inventory: o.inventory || { cooked_shrimp: 20 },
    hunt_settings: { preset: 0, role: o.role || 'melee_dps', discipline: o.discipline === undefined ? 'sword' : o.discipline, target_mode: 'nearest', stance: 'balanced',
      distance: 1, chase: true, gold_floor: 250, store: [], slots: o.slots || [{ action: { type: 'ability', id: 'power_strike' }, conditions: [], join: 'and' }, null,
        { action: { type: 'consume', id: 'cooked_shrimp' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 60 }], join: 'and' }] },
  };
  const subs = new Set(), calls = [];
  const h = { slot: 0, env, calls, status: 'open', record: { residue: o.residue ? clone(o.residue) : {} }, timeline: null,
    read: (k) => (Object.prototype.hasOwnProperty.call(env, k) ? env[k] : undefined), serverNow: () => 1_800_000_000_000, flushResidue: () => Promise.resolve(),
    setResidue(f, v) { this.record = { residue: Object.assign({}, this.record.residue, { [f]: v }) }; return true; },
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    tell() { for (const fn of Array.from(subs)) fn(h, 'changed'); },
    async setHuntOptions(preset, opts) {
      calls.push(['hr_action_set_options', preset, clone(opts)]);
      if (opts.slots) env.hunt_settings = Object.assign({}, env.hunt_settings, { slots: clone(opts.slots) });
      for (const k of ['stance', 'target_mode', 'distance', 'chase', 'gold_floor']) if (k in opts) env.hunt_settings[k] = opts[k];
      return { ok: true };
    },
    async applyPreset(p) { calls.push(['hr_hunt_preset_apply', p]); return { ok: true }; },
  };
  return h;
}
const accountOf = (h) => ({ viewed: 0, character: () => h, characters: () => [h], subscribe: () => () => {} });

export async function rules(base) {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  const t = async (id, fn) => { try { const r = await fn(); if (r !== true) fails.push(id + ' ' + r); } catch (e) { fails.push(harnessFail(id, e)); } };
  const DATA = await imp('src/data/basic-setups.js');
  const BS = await imp('src/shell/basic-setup.js');
  const B = await imp('src/shell/windows/hunt-prep/builder.js');
  const D = await imp('src/shell/prep-draft.js');
  const H = await imp('src/session/hunt-sections.js');
  const AL = await imp('src/shell/alerts.js');
  const BA = await imp('src/shell/bar-assign.js');
  const { ABILITIES, DISCIPLINE_IDS, abilitySkill } = await imp('src/data/abilities.js');
  const { ROLE_RULES, ACTION_SET_LIMITS } = await imp('src/data/rule-subjects.js');
  const { CONSUMABLES } = await imp('src/data/consumables.js');
  const { barProblem } = await imp('src/core/hunt/conditions.js');
  const serverBar = (h) => { const s = H.settingsOf(h); return Array.from({ length: 20 }, (_, i) => H.wireSlot(s.slots[i])); };

  await t('PD-1', () => {
    const v = DATA.validate();
    if (v.length) return 'the table reads ' + v.join('; ');
    const missing = DISCIPLINE_IDS.filter((d) => !DATA.BASIC_SETUPS[d]);
    return missing.length ? 'no basic setup for ' + missing.join(', ') : true;
  });

  await t('PD-2', () => {
    const carried = [{ id: 'cooked_trout', qty: 3 }, { id: 'cooked_shrimp', qty: 20 }, { id: 'turnip_juice', qty: 5 }, { id: 'iron_sword', qty: 1 }];
    for (const d of DISCIPLINE_IDS) {
      const row = DATA.BASIC_SETUPS[d];
      const ruled = ROLE_RULES[row.role].filter((s) => ABILITIES[s.action.id].disciplines.includes(d));
      for (const [lv, skills] of [[1, null], [1, { melee: { level: 1 }, ranged: { level: 1 }, magic: { level: 1 } }], [99, { melee: { level: 99 }, ranged: { level: 99 }, magic: { level: 99 } }]]) {
        const bar = BS.basicBar({ discipline: d, skills, carried });
        const at = d + ' at ' + lv + (skills ? '' : ' (no skills sent)');
        if (!Array.isArray(bar) || bar.length !== ACTION_SET_LIMITS.slots) return at + ': ' + (bar ? bar.length : bar) + ' slots';
        const p = barProblem(bar, ACTION_SET_LIMITS.slots);
        if (p) return at + ': the server would refuse slot ' + p.slot + ' (' + p.error + '): ' + ids(bar);
        const filled = bar.filter(Boolean);
        const moves = filled.filter((s) => s.action.type === 'ability').map((s) => s.action.id);
        const firstSupply = filled.findIndex((s) => s.action.type !== 'ability');
        if (filled.slice(firstSupply).some((s) => s.action.type === 'ability')) return at + ': a move after the food and drink: ' + ids(bar);
        if (bar.indexOf(null) >= 0 && bar.slice(bar.indexOf(null)).some(Boolean)) return at + ': a gap inside the bar: ' + ids(bar);
        for (const id of moves) {
          const r = ABILITIES[id];
          if (!r.universal && !r.disciplines.includes(d)) return at + ': ' + id + ' is another weapon\'s move';
          if (r.unlock && lv < r.unlock) return at + ': ' + id + ' waits for ' + abilitySkill(r) + ' ' + r.unlock;
        }
        const want = ruled.filter((s) => !ABILITIES[s.action.id].unlock || lv >= ABILITIES[s.action.id].unlock).map((s) => s.action.id).concat(row.heal ? [row.heal] : []);
        if (moves.join() !== want.join()) return at + ': moves ' + moves.join() + ', want ' + want.join();
        if (d === 'restoration' ? moves.includes('mend') : !moves.includes('mend')) return at + ': Mend ' + (d === 'restoration' ? 'on the Healer\'s bar' : 'missing');
        /* each move as its rule set writes it: the measured trigger and the Plain store rune */
        for (const s of ruled) {
          const got = filled.find((x) => x.action.id === s.action.id);
          if (got && (JSON.stringify(got.conditions) !== JSON.stringify(s.conditions) || got.action.store !== s.action.store)) return at + ': ' + s.action.id + ' is not its rule set\'s slot: ' + JSON.stringify(got);
        }
        const supplies = filled.filter((s) => s.action.type === 'consume').map((s) => s.action.id);
        if (supplies.join() !== ['cooked_shrimp', row.food, 'turnip_juice', row.drink].join()) return at + ': supplies ' + supplies.join();
        if (filled.some((s) => s.action.type === 'consume' && CONSUMABLES[s.action.id].source === 'own' && !carried.some((c) => c.id === s.action.id))) return at + ': an own supply the hero does not carry';
      }
      /* nothing carried: only the store's */
      const bare = BS.basicBar({ discipline: d, skills: null, carried: [] }).filter((s) => s && s.action.type === 'consume').map((s) => s.action.id);
      if (bare.join() !== [row.food, row.drink].join()) return d + ' carrying nothing: supplies ' + bare.join();
    }
    if (BS.basicBar({ discipline: null, skills: null, carried: [] }) !== null || BS.basicBar({ discipline: 'shovel', skills: null, carried: [] }) !== null) return 'a setup with no weapon type from the server got a bar';
    return true;
  });

  await t('PD-3', async () => {
    const h = hero({ skills: { melee: { xp: 0, level: 20 }, magic: { xp: 0, level: 1 } }, inventory: { cooked_shrimp: 12, turnip_juice: 4 } });
    const view = H.settingsOf(h);
    const sc = { pending: false, msg: '', picked: 0, draft: D.draftFrom(view), draftFor: 0, base: '', read: null, stale: false, sorted: false, cleared: false, basic: false, view };
    sc.base = D.draftKey(sc.draft);
    const ctx = { character: h, account: {} };
    const el = { getAttribute: () => null, closest: () => null, blur() {} };
    B.actBuilder(ctx, {}, sc, () => {}, 'basic', { type: 'click' }, el);
    const want = BS.basicBar({ discipline: 'sword', skills: { melee: { level: 20 } }, carried: [{ id: 'cooked_shrimp', qty: 12 }, { id: 'turnip_juice', qty: 4 }] });
    if (JSON.stringify(sc.draft.slots) !== JSON.stringify(want) || !sc.basic) return 'the press left the copy at ' + ids(sc.draft.slots) + ', want ' + ids(want);
    if (!ids(want).startsWith('power_strike turning_cut mend cooked_shrimp salted_shrimp turnip_juice thin_turnip_juice')) return 'a Melee 20 sword\'s basic bar reads ' + ids(want);
    if (h.calls.length) return 'the press sent ' + JSON.stringify(h.calls);
    B.saveDraft(ctx, sc, () => {}, false);
    await tick();
    const sent = h.calls.filter((c) => c[0] === 'hr_action_set_options');
    if (sent.length !== 1 || JSON.stringify(sent[0][2].slots) !== JSON.stringify(want)) return 'Save sent ' + JSON.stringify(sent.map((c) => ids(c[2].slots || [])));
    if (sent[0][2].stance !== 'balanced' || sent[0][2].distance !== 1 || sent[0][2].chase !== true || sent[0][2].gold_floor !== 250) return 'the fight options moved: ' + JSON.stringify(sent[0][2]);
    if (JSON.stringify(serverBar(h)) !== JSON.stringify(want)) return 'the server\'s bar read back is ' + ids(serverBar(h));
    /* no weapon type from the server: the press changes nothing */
    const h2 = hero({ discipline: null });
    const v2 = H.settingsOf(h2);
    const sc2 = { pending: false, msg: '', picked: 0, draft: D.draftFrom(v2), draftFor: 0, base: '', view: v2, basic: false };
    const before = JSON.stringify(sc2.draft.slots);
    B.actBuilder({ character: h2, account: {} }, {}, sc2, () => {}, 'basic', { type: 'click' }, el);
    return JSON.stringify(sc2.draft.slots) === before && !sc2.basic ? true : 'with no weapon type the press made ' + ids(sc2.draft.slots);
  });

  /* PD-7 THE PRESS IS FOUND (Tyler 2026-11-17: "i thought we were adding some defaults to this page?"; it was a small word beside Sort) */
  await t('PD-7', () => {
    const WORDS = { shield: 'Sword and shield', sword: 'Sword', dual_axe: 'Axes', club: 'Club or hammer', ranged: 'Bow or crossbow', destruction: 'Wand', restoration: 'Staff' };
    const filled = { slots: [{ action: { type: 'ability', id: 'power_strike' }, conditions: [], join: 'and' }].concat(Array(19).fill(null)) };
    const empty = { slots: Array(20).fill(null) };
    for (const d of DISCIPLINE_IDS) {
      const p = B.basicPress({ discipline: d }, filled, { weapon: 'practice_sword' });
      if (p.weapon !== WORDS[d] || p.words !== 'Basic setup: ' + WORDS[d] || p.off || p.lead) return d + ' on a filled bar reads ' + JSON.stringify(p) + ', want ' + WORDS[d] + ' ("Basic setup: ' + WORDS[d] + '"), on, not leading';
      const e = B.basicPress({ discipline: d }, empty, { weapon: 'practice_sword' });
      if (!e.lead || e.off) return d + ' on an empty bar is not the next step: ' + JSON.stringify(e);
    }
    const bare = B.basicPress({ discipline: 'club' }, filled, {});
    if (bare.weapon !== 'Bare hands' || bare.words !== 'Basic setup: Bare hands') return 'bare hands read ' + JSON.stringify(bare);
    const reading = B.basicPress(null, null, {});
    if (reading.weapon !== '' || reading.words !== 'Basic setup' || !reading.off || reading.lead) return 'before the setup is read: ' + JSON.stringify(reading);
    const unknown = B.basicPress({ discipline: null }, empty, {});
    if (unknown.weapon !== 'Weapon type unknown' || unknown.words !== 'Basic setup: Weapon type unknown' || !unknown.off || unknown.lead) return 'with no weapon type from the server: ' + JSON.stringify(unknown);
    return true;
  });

  const spellLines = (centre) => centre.list().filter((a) => a.kind === 'spell');
  await t('PD-4', () => {
    const h = hero();
    const centre = AL.createAlertCenter(accountOf(h), { track: () => {}, clock: () => 0 });
    h.tell(); h.tell();
    if (spellLines(centre).length) return 'a load raised ' + JSON.stringify(spellLines(centre).map((a) => a.text));
    h.env.skills = Object.assign({}, h.env.skills, { melee: { xp: 0, level: 10 } });
    h.tell();
    const one = spellLines(centre);
    if (one.length !== 1 || one[0].text !== 'Basil: New spell Turning Cut' || one[0].button !== 'Add to bar' || JSON.stringify(one[0].spells) !== '["turning_cut"]') return 'Melee 10 raised ' + JSON.stringify(one.map((a) => [a.text, a.button, a.spells]));
    h.tell(); h.env.skills = Object.assign({}, h.env.skills, { melee: { xp: 0, level: 11 } }); h.tell();
    if (spellLines(centre).length !== 1) return 'the prompt repeated: ' + spellLines(centre).length + ' lines';
    /* another weapon's move: a wand crossing Melee 10 is told nothing */
    const w = hero({ discipline: 'destruction', role: 'mage' });
    const cw = AL.createAlertCenter(accountOf(w), { track: () => {}, clock: () => 0 });
    w.env.skills = Object.assign({}, w.env.skills, { melee: { xp: 0, level: 10 } }); w.tell();
    if (spellLines(cw).length) return 'a wand was told of a sword\'s move';
    /* the bar holds it already (set up early, it waits): nothing */
    const held = hero({ slots: [{ action: { type: 'ability', id: 'turning_cut' }, conditions: [], join: 'and' }] });
    const ch = AL.createAlertCenter(accountOf(held), { track: () => {}, clock: () => 0 });
    held.env.skills = Object.assign({}, held.env.skills, { melee: { xp: 0, level: 10 } }); held.tell();
    /* never raised at all: not on screen, and not kept as shown (a line raised and retired in the same read still went out) */
    if (spellLines(ch).length || ((held.record.residue.alerts || {}).seen || []).includes('spell:turning_cut')) return 'a move already on the bar was announced';
    /* a first read with no skills is no baseline: the first read that has them is */
    const late = hero({ skills: null });
    const cl = AL.createAlertCenter(accountOf(late), { track: () => {}, clock: () => 0 });
    late.tell(); late.env.skills = { melee: { xp: 0, level: 12 } }; late.tell(); late.tell();
    return spellLines(cl).length ? 'a load whose first read had no skills raised ' + spellLines(cl)[0].text : true;
  });

  await t('PD-5', async () => {
    const h = hero();
    const centre = AL.createAlertCenter(accountOf(h), { track: () => {}, clock: () => 0 });
    const before = serverBar(h);
    h.env.skills = Object.assign({}, h.env.skills, { melee: { xp: 0, level: 10 } }); h.tell();
    const line = spellLines(centre)[0];
    if (!line) return 'no prompt to answer';
    let opened = 0;
    const r = await BA.addMovesOrOpen(h, line.spells, () => { opened++; });
    const sent = h.calls.filter((c) => c[0] === 'hr_action_set_options');
    if (!r.ok || sent.length !== 1 || opened) return 'Add answered ' + JSON.stringify(r) + ' after ' + sent.length + ' intent(s), Hunt prep opened ' + opened + 'x';
    const want = before.slice();
    want[1] = BS.moveSlot('turning_cut', 'sword');
    if (JSON.stringify(sent[0][2].slots) !== JSON.stringify(want)) return 'Add sent ' + ids(sent[0][2].slots) + ', want ' + ids(want);
    if (JSON.stringify(serverBar(h)) !== JSON.stringify(want)) return 'the server\'s bar reads ' + ids(serverBar(h));
    h.tell();
    if (spellLines(centre).length) return 'the line stayed once the server\'s bar held the move';
    /* a full bar: nothing sent, Hunt prep opens */
    const full = hero({ slots: Array.from({ length: 20 }, () => ({ action: { type: 'ability', id: 'power_strike' }, conditions: [], join: 'and' })) });
    full.env.skills = Object.assign({}, full.env.skills, { melee: { xp: 0, level: 10 } });
    let opened2 = 0;
    const r2 = await BA.addMovesOrOpen(full, ['turning_cut'], () => { opened2++; });
    if (!r2.ok || full.calls.length || opened2 !== 1) return 'a full bar answered ' + JSON.stringify(r2) + ', sent ' + full.calls.length + ', opened Hunt prep ' + opened2 + 'x';
    return true;
  });

  await t('PD-6', async () => {
    const h = hero();
    const centre = AL.createAlertCenter(accountOf(h), { track: () => {}, clock: () => 0 });
    h.env.skills = Object.assign({}, h.env.skills, { melee: { xp: 0, level: 10 } }); h.tell();
    if (spellLines(centre).length !== 1) return 'no prompt to carry over';
    /* a reload: a new page over the same server record and residue; the prompt was never answered */
    const again = hero({ residue: h.record.residue });
    again.env.skills = clone(h.env.skills);
    const c2 = AL.createAlertCenter(accountOf(again), { track: () => {}, clock: () => 0 });
    again.tell(); again.tell();
    if (spellLines(c2).length) return 'a reload raised ' + spellLines(c2)[0].text;
    /* the level drops (a death) and comes back: still nothing */
    again.env.skills = Object.assign({}, again.env.skills, { melee: { xp: 0, level: 9 } }); again.tell();
    again.env.skills = Object.assign({}, again.env.skills, { melee: { xp: 0, level: 10 } }); again.tell();
    if (spellLines(c2).length) return 'the level coming back raised it again';
    /* the next page opens at Melee 9 (it fell since) and the level comes back: the residue still holds it as shown */
    const third = hero({ residue: again.record.residue });
    const c3 = AL.createAlertCenter(accountOf(third), { track: () => {}, clock: () => 0 });
    third.env.skills = Object.assign({}, third.env.skills, { melee: { xp: 0, level: 10 } }); third.tell();
    if (spellLines(c3).length) return 'a later page raised a move an earlier one showed';
    /* a line standing for several moves keeps each one seen */
    const m = hero({ discipline: 'ranged', role: 'ranger' });
    const cm = AL.createAlertCenter(accountOf(m), { track: () => {}, clock: () => 0 });
    cm.say(m, { id: 'spell:hoarfrost', also: ['spell:raking_shot'], kind: 'spell', session: null, spells: ['hoarfrost', 'raking_shot'], text: 'Basil: New spells Hoarfrost, Raking Shot' });
    m.env.skills = Object.assign({}, m.env.skills, { ranged: { xp: 0, level: 10 } }); m.tell();
    if (spellLines(cm).length !== 1) return 'a move shown inside another line was raised again: ' + JSON.stringify(spellLines(cm).map((a) => a.text));
    const kept = (m.record.residue.alerts || {}).seen || [];
    return kept.includes('spell:hoarfrost') && kept.includes('spell:raking_shot') ? true : 'the residue keeps ' + JSON.stringify(kept);
  });
  return fails;
}

const M = (name, file, from, to) => [name, file, from, to];
const MUTANTS = [
  M('a move waits for no level', 'src/shell/basic-setup.js', '  return !r.unlock || levelIn(skills, abilitySkill(r)) >= r.unlock;', '  return true;'),
  M('another weapon\'s move goes on the bar', 'src/shell/basic-setup.js', '  if (!r || r.active === false || !(r.universal || r.disciplines.includes(d))) return false;', '  if (!r || r.active === false) return false;'),
  M('the hero\'s own food is left off', 'src/shell/basic-setup.js', "[ownMost(o.carried, 'food'), row.food,", '[row.food,'),
  M('a move loses its rule set\'s trigger', 'src/shell/basic-setup.js', 'conditions: ruled ? copy(ruled.conditions) : suggestedConditions(action)', 'conditions: suggestedConditions(action)'),
  M('the Healer gets Mend too', 'src/data/basic-setups.js', "  restoration: setup('healer', null),", "  restoration: setup('healer', 'mend'),"),
  M('a weapon type has no row', 'src/data/basic-setups.js', "  club: setup('melee_dps', 'mend'),\n", ''),
  M('the press leaves the bar', 'src/shell/windows/hunt-prep/builder.js', '  sc.draft.slots = bar;\n', ''),
  M('the press names no weapon type', 'src/shell/windows/hunt-prep/builder.js', ": t('prep.basic_weapon_' + (d === 'club' && !(gear && gear.weapon) ? 'bare' : d));", ": '';"),
  M('an empty bar does not lead to the press', 'src/shell/windows/hunt-prep/builder.js', 'lead: known && empty, off: !draft || !known };', 'lead: false, off: !draft || !known };'),
  M('bare hands read as a club', 'src/shell/windows/hunt-prep/builder.js', "(d === 'club' && !(gear && gear.weapon) ? 'bare' : d)", '(d)'),
  M('a load prompts for what the hero had', 'src/shell/spell-news.js', '      if (!was) { base.set(cs.slot, now); return null; }', "      if (!was) { base.set(cs.slot, Object.fromEntries(Object.keys(now).map((k) => [k, { level: 1 }]))); return null; }"),
  M('the prompt ignores the weapon worn', 'src/shell/spell-news.js', '    if (!r.unlock || r.active === false || !(r.universal || r.disciplines.includes(d))) return false;', '    if (!r.unlock || r.active === false) return false;'),
  M('a move already on the bar is announced', 'src/shell/spell-news.js', '.filter((id) => !held.has(id) && !seen(spellNewsId(id)));', '.filter((id) => !seen(spellNewsId(id)));'),
  M('a line for several moves keeps only its first seen', 'src/shell/alerts.js', '    const ids = [c.id].concat(Array.isArray(c.also) ? c.also : []);', '    const ids = [c.id];'),
  M('a shown spell is not kept for the next page', 'src/shell/alerts.js', "seen: (Array.isArray(stored) ? stored : []).concat(ids).slice(-ALERTS_SEEN_MAX) });", 'seen: Array.isArray(stored) ? stored : [] });'),
  M('the line stays once the move is on the bar', 'src/shell/alerts.js', '      if (stale || seenEnd || added ||', '      if (stale || seenEnd ||'),
  M('Add writes over the first slot', 'src/shell/bar-assign.js', "  const free = wire.map((w, i) => (w ? -1 : i)).filter((i) => i >= 0);", "  const free = wire.map((w, i) => i);"),
  M('a full bar opens nothing', 'src/shell/bar-assign.js', '  openPrep();\n', ''),
];

/* A mutant runs the rules from a temp copy of src with the planted file written in: the working tree is never touched. */
async function planted(file, text) {
  const tmp = mkdtempSync(join(tmpdir(), 'hr-prep-defaults-'));
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
    console.log(fails.length ? 'prep-defaults: ' + fails.length + ' rule(s) RED' : 'prep-defaults: a basic setup per weapon type, saved as one intent; one new spell prompt per level-up, Add to bar, no repeat');
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
  console.log(exitOf(counts) ? 'prep-defaults --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)' : 'prep-defaults --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught, each by a named rule');
  process.exit(exitOf(counts));
}

main();
