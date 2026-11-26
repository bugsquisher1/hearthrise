#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/weapon-line.mjs — PAST DAWNSTEEL, A UNIQUE WEAPON SPENDS THE LINE'S BUDGET ITS OWN WAY, NEVER OVER IT, AND THE SAMPLE IS
// HIDDEN (designer, lane/d-weapon-line; PRIORITY_BOARD "2026-11-16 The weapon line past Dawnsteel"; Tyler 2026-11-16 "yes" to a
// weapon line, the armor line's pattern; Tyler 2026-11-14 "after tier 7 we start getting unique with the itemization and it goes
// away from being just standard upgrades, more like tibia").
//
//   WL1  THE BASE IS DAWNSTEEL: weapon-line.js WEAPON_LINE_BASE names each family's generated tier-7 weapon (the top of its
//        GEAR_LADDERS rung), with the numbers the line scales.
//   WL2  HIDDEN: no src/ file imports weapon-line.js, no sample id is an item, and no item (or other staged sample) has its name.
//   WL3  NEVER OVER THE LINE: on every ground from the line's anchor up, at the piece's own Level, its pace and its safety (the engine's rolls,
//        tools/balance-sim/weapon-power.mjs) is at or under the line's weapon of its family.
//   WL4  A BUDGET, NOT A TEMPLATE: each piece wins somewhere (on some late ground, at its Level, it beats every other piece of its
//        family a hero of that Level can wear, fully tempered Dawnsteel included: x1.02), and where two pieces of a family are worn from the same Level
//        neither wins everywhere. A piece whose attack and damage are the line's own is a template, not a unique. WL4 binds the
//        uniques past 110 only: at tier 7 and below Tyler's 11-14 rule stands, a special piece is the standard piece plus one
//        attribute (the Banded Legguards, Krell's five; tests/special-attributes.mjs SA2), so a tier-7 arm here was taken back out
//        (the designer 2026-11-18, row 3b, reversing row 1a).
//   WL5  THE ROW: everything but its own numbers is its Dawnsteel base's (type, slot, weapon kind, hands, tier); it is worn from its
//        home's floor (staged/morrow-grid.js homeOf), or from its family's first Level if the floor is under it; its book is the
//        base's times the line, so it never sells under Dawnsteel.
//   WL6  ONE ATTRIBUTE, AT TIER 7's SIZE: one weapon attribute from special-attributes.js (a critical chance or a bane), at its
//        tier-7 size; a bane names a class that lives on the piece's own ground (so a piece on a place not built yet carries none).
//   WL7  A HOME AND A USE: the source monster is placed on the named ground, the band is Rare, a daily kill or a trophy, a kill's
//        chance is under 5%, a monster gives at most one weapon, and the use is to be worn. A Morrow piece sits on its place's
//        weapon cell on the region grid (the designer 2026-11-18 row 1b: "the grid wins"); on a place not built yet it says
//        `planned` and names no monster, and the day the place is built it must name one.
//   WL8  WORDS: no banned filler word, no semicolon or em dash, the first sentence carries the number.
//   WL9  THE MAGE BAR HOLDS ON THE LINE: at every Level the line names and at each sample warhammer's, a Mage with the wand on
//        the line, the Duskwood Codex and full Duskweave hits at most 1.3 times the warhammer (style-gear SG-8's bar,
//        lane/d-mage-110), so the line can't re-open the Mage gap.
//   WL10 THE FIRST LEVEL IS MEASURED: WEAPON_FIRST_LEVEL is what weapon-power.mjs firstLevel measures for each family.
//
//   node tests/weapon-line.mjs            the guard
//   node tests/weapon-line.mjs --mutate   each rule driven red by a defect planted on a copy of the data
//
// mutant-anchors: none — every mutant edits an in-memory copy of the sample (structuredClone), never a file
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { ITEMS, MONSTERS } from '../src/data/catalogue-coherence.js';
import { HUNT_GROUNDS } from '../src/data/hunt-grounds.js';
import { HUNT_INDEX } from '../src/data/hunts.js';
import { GEAR_LADDERS } from '../src/data/gear-tiers.js';
import { SPECIAL_ATTRIBUTES, SPECIAL_SAMPLE } from '../src/data/special-attributes.js';
import { LINE_SAMPLE } from '../tools/balance-sim/staged/armor-line.js';
import * as LINE from '../tools/balance-sim/staged/weapon-line.js';
import { MORROW_GRID, homeOf } from '../tools/balance-sim/staged/morrow-grid.js';
import * as combat from '../src/core/combat.js';
import { classOfMonster } from '../src/core/bane.js';
import { deriveProfile } from '../src/core/member.js';
import { skillXpForLevel } from '../src/core/xp.js';
import { weaponPower } from '../tools/balance-sim/weapon-power.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BANNED = /\b(shadow|void|ancient|eternal|dark|forgotten)\b|of doom|of the abyss/i;
/* the fields a sample row may differ from its base in: its words, its numbers, Level, value, rarity and its one attribute */
/* (and its base's grid step is the ladder's alone, 12-targets 8.3: a sample is its own item Level and carries none, below) */
const OWN = new Set(['n', 'icon', 'v', 'reqLv', 'iL', 'rarity', ...LINE.LINE_FIELDS, 'critB', 'bane', 'effects', 'step']);
const ATTR_TIER = 7;
const MAGE_BAR = 1.3;
/* the Levels the line is read at for the Mage bar: the late grounds' floors, the next region and Level 200 */
const LINE_LEVELS = Object.freeze([110, 112, 125, 145, 165, 185, 200]);
const DUSKWEAVE = Object.freeze(['duskweave_helmet', 'duskweave_body', 'duskweave_pants', 'duskweave_boots', 'duskweave_gloves', 'duskweave_belt']);
const round5 = (n) => Math.max(1, Math.round(n / 5) * 5);

function srcFiles(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) srcFiles(p, out); else if (/\.(js|mjs|ts|html)$/.test(f)) out.push(p);
  }
  return out;
}
const importers = () => srcFiles(join(ROOT, 'src')).filter((p) => !p.endsWith('weapon-line.js') && /weapon-line\.js/.test(readFileSync(p, 'utf8')));
/* every monster a ground places (packs, spawns, adds), open or staged: Map monster -> Set of grounds */
function homes() {
  const m = new Map();
  for (const [gid, g] of Object.entries(HUNT_GROUNDS)) for (const p of g.pockets || []) for (const s of [...(p.spawns || []), ...(p.pack || []), ...(p.adds || [])]) {
    if (!m.has(s.monster)) m.set(s.monster, new Set());
    m.get(s.monster).add(gid);
  }
  return m;
}
/* the family's tier-7 rung, the top of the seven-tier ladder the line starts from (past it the ladder runs on steps, gear-tiers.js STEP_TIERS) */
const ladderTop = (fam) => { const l = GEAR_LADDERS.find((x) => x.key === 'weapon:' + fam); return l ? l.ids[7 - 1] : null; };
const powerOf = (line) => weaponPower({ ITEMS, MONSTERS, HUNT_GROUNDS, HUNT_INDEX, combat, deriveProfile, skillXpForLevel, line });
/* the attributes a weapon row carries, from the catalogue's weapon kinds */
function attributesOf(row) {
  const out = [];
  if (row.critB) out.push({ kind: 'crit', key: null, value: row.critB });
  if (row.bane) for (const b of [].concat(row.bane)) out.push({ kind: 'bane', key: b && b.class, value: b && b.mult });
  return out;
}
const maxHitOf = (equipment, items, L) => combat.playerCombatRolls({ def: 0, tier: 1 }, { items, equipment,
  skills: { melee: skillXpForLevel('melee', L), magic: skillXpForLevel('magic', L) }, profile: deriveProfile(items[equipment.weapon].weaponType) }).maxHit;

/** Every broken rule, as strings. Empty = sound. `open`: what importers() and homes() answer, and the region grid (`grid`). */
export function problems(line = LINE, A = SPECIAL_ATTRIBUTES, open = {}) {
  open = { importers: importers(), homes: homes(), grid: MORROW_GRID, ...open };
  const out = [];
  const S = line.WEAPON_SAMPLE, B = line.WEAPON_LINE_BASE;
  const homeFor = (src) => homeOf(src, { HUNT_GROUNDS, HUNT_INDEX, MONSTERS }, open.grid);
  /* WL1 */
  for (const [fam, b] of Object.entries(B)) {
    const it = ITEMS[b.id], top = ladderTop(fam);
    if (!it) { out.push('WL1 ' + fam + ': ' + b.id + ' is not an item'); continue; }
    if (top !== b.id || it.tier !== 7) out.push('WL1 ' + fam + ': ' + b.id + ' is not the tier-7 top of its ladder (' + top + ', tier ' + it.tier + ')');
    for (const k of line.LINE_FIELDS) if ((b[k] === undefined ? undefined : b[k]) !== (it[k] === undefined ? undefined : it[k])) out.push('WL1 ' + fam + '.' + k + ': the line says ' + b[k] + ', ' + b.id + ' has ' + it[k]);
  }
  /* WL2 */
  for (const p of open.importers) out.push('WL2 ' + p.replace(ROOT, '') + ' imports weapon-line.js: the sample is hidden until it is approved');
  const otherNames = new Map([...Object.entries(LINE_SAMPLE), ...Object.entries(SPECIAL_SAMPLE)].map(([id, s]) => [s.row.n, id]));
  const P = powerOf(line);
  const G = P.lateGrounds();
  if (G.length < 2) out.push('WL3 the line answers to ' + G.length + ' late ground(s): the measure has nothing to hold it to');
  const perMonster = new Map();
  for (const [id, s] of Object.entries(S)) {
    const row = s.row, b = B[s.family], base = b && ITEMS[b.id];
    if (ITEMS[id]) out.push('WL2 ' + id + ' is already an item a catalogue can serve');
    for (const [other, it] of Object.entries(ITEMS)) if (it && it.n === row.n) out.push('WL2 ' + id + ': ' + other + ' is already named ' + row.n);
    if (otherNames.has(row.n)) out.push('WL2 ' + id + ': the staged ' + otherNames.get(row.n) + ' is already named ' + row.n);
    if (!base) { out.push('WL5 ' + id + ': family ' + s.family + ' has no Dawnsteel base'); continue; }
    /* WL3 */
    for (const r of P.againstLine(row, s.family, row.reqLv, G)) {
      if (r.ratio === null) out.push('WL3 ' + id + ': no power on ' + r.ground);
      else if (r.ratio > 1 + 1e-9) out.push('WL3 ' + id + ': ' + (r.ratio * 100).toFixed(1) + '% of the line on ' + r.ground + ' at Level ' + row.reqLv + ' (pace ' + r.pace.toFixed(3) + ', safety ' + r.safety.toFixed(3) + ')');
    }
    /* WL4: a template is the line's own numbers */
    const ln = line.lineWeapon(s.family, row.reqLv);
    if (ln && line.LINE_FIELDS.every((k) => (ln[k] === undefined) === (row[k] === undefined) && (ln[k] === undefined || ln[k] === row[k]))) out.push('WL4 ' + id + ': its attack and damage are the line\'s own, a template and not a unique');
    /* WL5 */
    if (row.step !== undefined) out.push('WL5 ' + id + ' carries the grid step ' + row.step + ': a unique is its own item Level, never a ladder tier');
    for (const k of new Set([...Object.keys(base), ...Object.keys(row)])) {
      if (OWN.has(k)) continue;
      if (JSON.stringify(base[k]) !== JSON.stringify(row[k])) out.push('WL5 ' + id + '.' + k + ' = ' + JSON.stringify(row[k]) + ', its base ' + b.id + ' has ' + JSON.stringify(base[k]));
    }
    const src = s.source || {}, home = homeFor(src);
    /* worn from its home's floor, or from its family's first Level when the floor is under it (at the anchor the line is Dawnsteel itself) */
    const first = (line.WEAPON_FIRST_LEVEL || {})[s.family];
    const wornFrom = home.floor === null ? null : Math.max(home.floor, Number(first) || 0);
    if (wornFrom === null) out.push('WL5 ' + id + ': ' + (src.place || src.ground) + ' has no band');
    else if (row.reqLv !== wornFrom) out.push('WL5 ' + id + ': worn from ' + row.reqLv + ', its home ' + (src.place || src.ground) + ' opens at ' + home.floor + ' and the ' + s.family + ' line\'s first Level is ' + first + ', so ' + wornFrom);
    if (!(row.reqLv > line.WEAPON_LINE_ANCHOR)) out.push('WL5 ' + id + ': worn from ' + row.reqLv + ', the line starts past ' + line.WEAPON_LINE_ANCHOR);
    if (row.v !== round5(base.v * line.weaponLineScale(row.reqLv))) out.push('WL5 ' + id + ': book ' + row.v + ', its base\'s times the line is ' + round5(base.v * line.weaponLineScale(row.reqLv)));
    /* WL6 */
    const found = attributesOf(row), want = s.attr || [], def = A[want[0]];
    if (found.length !== 1) out.push('WL6 ' + id + ' carries ' + found.length + ' attributes, a unique carries one');
    if (!def) out.push('WL6 ' + id + ': ' + want[0] + ' is not in the attribute catalogue');
    else if (found.length === 1) {
      const f = found[0];
      if (f.kind !== want[0] || (f.key || null) !== (want[1] || null)) out.push('WL6 ' + id + ': the row carries ' + f.kind + ' ' + f.key + ', the sample says ' + want[0] + ' ' + want[1]);
      if (!def.slots.includes(row.slot)) out.push('WL6 ' + id + ': ' + want[0] + ' is not carried on the ' + row.slot + ' slot');
      if (def.at[ATTR_TIER] === undefined || Math.abs(def.at[ATTR_TIER] - f.value) > 1e-9) out.push('WL6 ' + id + ': ' + f.value + ', the catalogue says ' + def.at[ATTR_TIER] + ' at tier ' + ATTR_TIER);
      if (f.kind === 'bane') {
        /* the engine's class (bane.js classOfMonster), on the built ground it drops on: a place not built yet has nobody to bane */
        const lives = !!home.ground && [...open.homes].some(([mon, gs]) => gs.has(home.ground) && MONSTERS[mon] && classOfMonster(MONSTERS[mon]) === f.key);
        if (!lives) out.push('WL6 ' + id + ': a bane of ' + f.key + ' on ' + (home.ground || (src.place + ' (not built)')) + ', where no ' + f.key + ' lives');
        if (!(row.effects || []).includes('bane')) out.push('WL6 ' + id + ': a bane row names it in `effects` (the card reads it)');
      }
    }
    /* WL7: the home, and the grid cell */
    for (const p of home.problems) out.push('WL7 ' + id + ': ' + p);
    if (!home.planned) {
      const gs = open.homes.get(src.monster);
      if (!MONSTERS[src.monster]) out.push('WL7 ' + id + ': source ' + src.monster + ' is not a monster');
      else if (!gs || !gs.has(src.ground)) out.push('WL7 ' + id + ': ' + src.monster + ' is not placed on ' + src.ground);
      if (src.how === 'rare' && !(src.ch > 0 && src.ch < 0.05)) out.push('WL7 ' + id + ': a Rare\'s chance a kill is over 0 and under 5% (got ' + src.ch + ')');
    }
    if (home.place && !(home.place.weapons || []).includes(s.family)) out.push('WL7 ' + id + ': a ' + s.family + ' on ' + src.place + ', whose grid weapons are ' + (home.place.weapons || []).join(', ') + ' (the grid wins)');
    if (!['rare', 'trophy', 'daily'].includes(src.how)) out.push('WL7 ' + id + ': a unique drops in the Rare band, as a trophy or on a daily kill');
    if (s.use !== 'worn') out.push('WL7 ' + id + ': its use is to be worn');
    if (src.monster) perMonster.set(src.monster, (perMonster.get(src.monster) || 0) + 1);
    /* WL8 */
    if (BANNED.test(row.n) || BANNED.test(s.text)) out.push('WL8 ' + id + ': a banned filler word (DESIGN_STANDARDS §2)');
    if (/[;—]/.test(s.text)) out.push('WL8 ' + id + ': no semicolon or em dash in item text');
    if (!/\d/.test(String(s.text).split('. ')[0])) out.push('WL8 ' + id + ': the first sentence says what the piece does, with its number');
  }
  for (const [mon, n] of perMonster) if (n > 1) out.push('WL7 ' + mon + ' gives ' + n + ' weapons, at most one a monster (loot redesign 10-23)');
  /* WL10 */
  for (const fam of Object.keys(B)) {
    const f = P.firstLevel(fam, G);
    if (f !== (line.WEAPON_FIRST_LEVEL || {})[fam]) out.push('WL10 ' + fam + ': WEAPON_FIRST_LEVEL says ' + (line.WEAPON_FIRST_LEVEL || {})[fam] + ', the measure says ' + f);
  }
  /* WL4: each piece wins somewhere, at its own Level, on the score (pace and safety's mean), against its family's pieces a hero of that Level
     can wear and fully tempered Dawnsteel (line.TEMPERED_DAWNSTEEL, lane/d-temper-dawnsteel) */
  const ids = Object.keys(S).filter((id) => B[S[id].family] && ITEMS[B[S[id].family].id]);
  for (const id of ids) {
    const s = S[id], L = s.row.reqLv;
    const rivals = ids.filter((o) => o !== id && S[o].family === s.family && S[o].row.reqLv <= L).map((o) => [S[o].row, 1]).concat([[ITEMS[B[s.family].id], line.TEMPERED_DAWNSTEEL]]);
    const wins = G.filter((g) => { const p = P.score(s.row, g, L); return rivals.every(([r, k]) => p > P.score(r, g, L) * k); });
    if (!wins.length) out.push('WL4 ' + id + ': at Level ' + L + ' it wins on no late ground against its family (' + rivals.map(([r, k]) => (k > 1 ? 'tempered ' : '') + r.n).join(', ') + ')');
    const peers = ids.filter((o) => o !== id && S[o].family === s.family && S[o].row.reqLv === L);
    if (peers.length && wins.length === G.length) out.push('WL4 ' + id + ': at Level ' + L + ' it wins on every late ground over ' + peers.join(', ') + ': one piece dominates its slot');
  }
  /* WL9 */
  const mage = (L, items) => maxHitOf({ weapon: '__wand', shield: 'duskwood_codex', ...Object.fromEntries(DUSKWEAVE.map((d) => [ITEMS[d] ? ITEMS[d].slot : d, d])) }, items, L);
  const hammers = LINE_LEVELS.map((L) => [L, P.lineRow('warhammer', L), 'the line\'s warhammer'])
    .concat(ids.filter((id) => S[id].family === 'warhammer').map((id) => [S[id].row.reqLv, S[id].row, S[id].row.n]));
  for (const [L, hammer, what] of hammers) {
    const items = { ...ITEMS, __wand: P.lineRow('wand', L), __hammer: hammer };
    if (!items.__wand || !hammer) { out.push('WL9 no wand or warhammer on the line at Level ' + L); continue; }
    const m = mage(L, items), h = maxHitOf({ weapon: '__hammer' }, items, L);
    if (!(m <= MAGE_BAR * h)) out.push('WL9 Level ' + L + ': a Mage on the line hits ' + m + ', ' + (m / h).toFixed(2) + ' times ' + what + ' (' + h + '; at most ' + MAGE_BAR + ')');
  }
  return out;
}

/* a copy of the line module with its tables swapped for copies a mutant may edit (the functions read the copied base) */
function lineCopy() {
  const WEAPON_LINE_BASE = structuredClone(LINE.WEAPON_LINE_BASE), WEAPON_SAMPLE = structuredClone(LINE.WEAPON_SAMPLE);
  const c = { ...LINE, WEAPON_LINE_BASE, WEAPON_SAMPLE };
  c.lineWeapon = (family, reqLv) => {
    const b = c.WEAPON_LINE_BASE[family];
    if (!b) return null;
    const out = {};
    for (const k of c.LINE_FIELDS) if (Object.prototype.hasOwnProperty.call(b, k)) out[k] = Math.round(b[k] * c.weaponLineScale(reqLv));
    return out;
  };
  return c;
}

const MUTANTS = [
  ['the base drifts from Dawnsteel', 'WL1', (L) => { L.WEAPON_LINE_BASE.sword.strB = 36; }],
  ['the base names a tier-6 weapon', 'WL1', (L) => { L.WEAPON_LINE_BASE.warhammer.id = 'ember_warhammer'; }],
  ['an importer appears', 'WL2', (L, A, o) => { o.importers = ['/src/data/items.js']; }],
  ['a sample takes an item\'s name', 'WL2', (L) => { L.WEAPON_SAMPLE.watchmans_sword.row.n = 'Dawnsteel Sword'; }],
  ['a sample takes the armor line\'s name', 'WL2', (L) => { L.WEAPON_SAMPLE.watchmans_sword.row.n = 'Watchman\'s Helm'; }],
  ['the mallet hits over the line', 'WL3', (L) => { L.WEAPON_SAMPLE.dunns_mallet.row.strB = 139; }],  // (restated on 8.3, 12-targets 8.4: every staged number x 120 / 88)
  ['the Carter\'s Rest sword over the line', 'WL3', (L) => { L.WEAPON_SAMPLE.wagon_guards_sword.row.strB = 52; }],
  ['the line read at a lower Level (the scale lies)', 'WL3', (L) => { L.weaponLineScale = () => 1; }],
  ['a template: the line\'s own numbers', 'WL4', (L) => { Object.assign(L.WEAPON_SAMPLE.limewashed_sword.row, { atkB: 86, strB: 72, critB: 0.1 }); }],
  ['one sword wins everywhere (the other gave up too much)', 'WL4', (L) => { Object.assign(L.WEAPON_SAMPLE.limewashed_sword.row, { atkB: 55, strB: 49 }); }],
  ['the Carter\'s Rest sword under tempered Dawnsteel everywhere', 'WL4', (L) => { Object.assign(L.WEAPON_SAMPLE.wagon_guards_sword.row, { atkB: 41, strB: 30 }); }],
  ['tempered Dawnsteel out-hits the Carter\'s Rest sword (the tempering read as x1.1)', 'WL4', (L) => { L.TEMPERED_DAWNSTEEL = 1.1; }],
  /* row 1a's tier-7 arm and its three mutants (Krell's sword, a named wand, a special weapon on Dawnsteel's numbers) were retired with it: at
     tier 7 and below the standard piece plus one attribute is the rule (Tyler 11-14; the designer 2026-11-18 row 3b), so none is a defect */
  ['the hooks lose a hand', 'WL5', (L) => { delete L.WEAPON_SAMPLE.hoist_hooks.row.twoHanded; }],
  ['the sword becomes a hammer', 'WL5', (L) => { L.WEAPON_SAMPLE.limewashed_sword.row.weaponType = 'hammer'; }],
  ['worn under its ground\'s floor', 'WL5', (L) => { L.WEAPON_SAMPLE.hoist_hooks.row.reqLv = 150; }],
  ['worn from Carter\'s Rest\'s floor, the anchor, where the line is Dawnsteel itself', 'WL5', (L) => { L.WEAPON_SAMPLE.wagon_guards_sword.row.reqLv = 110; }],
  ['a unique on the ladder grid', 'WL5', (L) => { L.WEAPON_SAMPLE.hoist_hooks.row.step = 6; }],
  ['a book under the base', 'WL5', (L) => { L.WEAPON_SAMPLE.dunns_mallet.row.v = 39600; }],
  ['a second attribute', 'WL6', (L) => { L.WEAPON_SAMPLE.watchmans_sword.row.critB = 0.1; }],
  ['the bane at 1.2', 'WL6', (L) => { L.WEAPON_SAMPLE.watchmans_sword.row.bane = { class: 'human', mult: 1.2 }; }],
  ['the critical chance at 0.15', 'WL6', (L) => { L.WEAPON_SAMPLE.hoist_hooks.row.critB = 0.15; }],
  ['a bane of what isn\'t there (the Roost\'s Dragon bane kept at the inn)', 'WL6', (L) => { const s = L.WEAPON_SAMPLE.wagon_guards_sword; delete s.row.critB; s.row.bane = { class: 'dragon', mult: 1.1 }; s.row.effects = ['bane']; s.attr = ['bane', 'dragon']; }],
  ['a bane the card can\'t read', 'WL6', (L) => { delete L.WEAPON_SAMPLE.dunns_mallet.row.effects; }],
  ['a home that is not there', 'WL7', (L) => { L.WEAPON_SAMPLE.hoist_hooks.source.monster = 'troll_picker'; }],
  ['a common drop', 'WL7', (L) => { L.WEAPON_SAMPLE.limewashed_sword.source.ch = 0.08; }],
  ['two weapons off one monster', 'WL7', (L) => { L.WEAPON_SAMPLE.limewashed_sword.source.monster = 'shrouded_pauper'; }],
  /* row 1b: the grid wins */
  ['the sword back on the Roost (the bow and staff\'s cells, the 11-16 placement)', 'WL7', (L) => { L.WEAPON_SAMPLE.wagon_guards_sword.source = { place: 'wyvern_roost', monster: 'brood_wyvern', ground: 'wyvern_roost', how: 'rare', ch: 0.0093 }; }],
  ['a place not built named as if it were (a monster on the Night Shift)', 'WL7', (L) => { L.WEAPON_SAMPLE.wagon_guards_sword.source = { place: 'night_shift', monster: 'troll_picker', how: 'rare', ch: 0.0093 }; }],
  ['the grid still calls a built ground planned', 'WL7', (L, A, o) => { o.grid = { ...MORROW_GRID, carters_rest: { ...MORROW_GRID.carters_rest, ground: null, planned: { band: [110, 125] } } }; }],
  ['a banned word', 'WL8', (L) => { L.WEAPON_SAMPLE.dunns_mallet.text = 'It hits Constructs 10% harder. Forged in the Void.'; }],
  ['text that leads with flavour', 'WL8', (L) => { L.WEAPON_SAMPLE.hoist_hooks.text = 'The Carters dragged the dead on these. They hurt the dead.'; }],
  ['the wand line carries the Mage past the bar', 'WL9', (L) => { L.WEAPON_LINE_BASE.wand.magicStrB = 90; }],
  ['the first Level written, not measured', 'WL10', (L) => { L.WEAPON_FIRST_LEVEL = { ...LINE.WEAPON_FIRST_LEVEL, hatchets: 112 }; }],
];

function mutate() {
  const clean = problems();
  if (clean.length) { console.error('weapon-line --mutate: the clean arm is RED, so no mutant proves anything:\n  ' + clean.join('\n  ')); return 1; }
  let escaped = 0;
  for (const [name, rule, plant] of MUTANTS) {
    const L = lineCopy(), A = structuredClone(SPECIAL_ATTRIBUTES), o = { importers: importers(), homes: homes() };
    plant(L, A, o);
    const got = problems(L, A, o);
    const caught = got.some((p) => p.startsWith(rule + ' '));
    console.log((caught ? '  caught  ' : '  ESCAPED ') + rule + '  ' + name + (caught ? '' : '  (got: ' + (got[0] || 'nothing') + ')'));
    if (!caught) escaped++;
  }
  console.log(escaped ? 'weapon-line --mutate: ' + escaped + ' of ' + MUTANTS.length + ' ESCAPED' : 'weapon-line --mutate: ' + MUTANTS.length + ' of ' + MUTANTS.length + ' caught');
  return escaped ? 1 : 0;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--mutate')) process.exit(mutate());
  const bad = problems();
  if (bad.length) { console.error('weapon-line: RED\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('weapon-line: ' + Object.keys(LINE.WEAPON_SAMPLE).length + ' sample weapons under the line past Dawnsteel on every late ground, each winning somewhere, one attribute each, '
    + 'on its grid cell, hidden, the Mage bar held, the first Levels measured');
}
