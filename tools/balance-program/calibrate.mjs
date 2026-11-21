#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/calibrate.mjs — WHAT MAKES THE SIMULATOR CORRECT (14-the-rest.md section 2, FB-3; Tyler 2026-11-21: "we can control
// the true simulation by doing it correctly").
//
// C-1, THE HEROES THE TOOL PLAYS. What the live heroes wear and know, by Level band, beside what the matrix's three gear states (standards.mjs
// GEAR_STATES, built by grid-kit.mjs kitFor) and its skill line (skill-lines.json, the four's) give a hero of the same way at the same Level:
// the worn weapon's tier, the armor pieces worn and their mean tier, the jewelry and cloak slots filled, the main skill and Defense against the
// line. Passes when each assumed input sits inside the spread of real heroes at its band (14 section 2). A band with no real hero stays
// calibrated by the engine alone, and says so.
//
// THE DATA. tools/balance-program/real-players.local.mjs reads production (SELECT only, every statement inside `begin read only`, the token
// read as file bytes and never printed) and keeps the raw rows on this machine (.scratch/real-players/raw.json, gitignored). This file reads
// those rows and writes ONLY aggregates: per band, counts and min / median / max, never an account, a hero, a name or a clock time
// (anonymityProblems is run before anything is written). Real heroes only (real-players.local.mjs classify: QA and game-master accounts out).
//
//   node tools/balance-program/real-players.local.mjs            (first: the read)
//   node tools/balance-program/calibrate.mjs --c1 [--json tools/balance-program/calibration/c1.json]
//   node tools/balance-program/calibrate.mjs --selftest           planted heroes: the band reading, the pass rule, the anonymity check
//
// Exit: 0 ran · 1 a selftest proof failed, or an aggregate that names a player · 2 harness (no raw read).
// mutant-anchors: none — the selftest plants heroes and kits in memory; no tracked file is patched
// ci-step: economy-selftests | Calibration C-1 reads real heroes' kits and skills by band, the pass rule bites, and nothing names a player
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/calibrate.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const RAW = join(ROOT, '.scratch', 'real-players', 'raw.json');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

export const BANDS = Object.freeze([[1, 15], [16, 30], [31, 44], [45, 64], [65, 84], [85, 110], [111, 185]]);
export const ARMOR_SLOTS = Object.freeze(['helmet', 'body', 'pants', 'boots', 'gloves', 'belt']);
export const JEWEL_SLOTS = Object.freeze(['ring1', 'ring2', 'earrings', 'necklace', 'cape']);
export const STATES = Object.freeze(['low', 'mid', 'bis']);
/* the fewest real heroes a band shows numbers for */
export const MIN_HEROES = 3;
const MAIN = Object.freeze({ hammer: 'melee', tank: 'melee', sword: 'melee', axes: 'melee', mage: 'magic', healer: 'magic', bow: 'ranged', crossbow: 'ranged' });

/** The matrix's way of a worn set: its weapon family, a shield beside a sword, a crossbow or a staff by name. */
export function styleOf(worn, ITEMS) {
  const w = ITEMS[worn.weapon], t = w && w.weaponType;
  if (!t) return null;
  if (t === 'sword') return worn.shield && ITEMS[worn.shield] && ITEMS[worn.shield].type === 'shield' ? 'tank' : 'sword';
  if (t === 'hammer') return 'hammer';
  if (t === 'axe') return 'axes';
  if (t === 'ranged') return /crossbow/.test(worn.weapon) ? 'crossbow' : 'bow';
  if (t === 'magic') return /staff|rod/.test(worn.weapon) ? 'healer' : 'mage';
  return null;
}
/** A worn set's numbers: the weapon's tier, armor pieces and their mean tier, jewelry and cloak slots filled. */
export function kitNumbers(set, ITEMS) {
  const tier = (id) => (id && ITEMS[id] && Number.isFinite(ITEMS[id].tier) ? ITEMS[id].tier : id && ITEMS[id] ? 0 : null);
  const armor = ARMOR_SLOTS.map((s) => tier(set[s])).filter((x) => x !== null);
  return { weaponTier: tier(set.weapon), armorPieces: armor.length, armorTier: armor.length ? armor.reduce((a, b) => a + b, 0) / armor.length : 0, jewels: JEWEL_SLOTS.filter((s) => set[s]).length };
}
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const spread = (xs) => (xs.length ? [r1(Math.min(...xs)), r1(median(xs)), r1(Math.max(...xs))] : null);
export const FIELDS = Object.freeze(['weaponTier', 'armorPieces', 'armorTier', 'jewels', 'mainVsLine', 'defenseVsLine']);

/**
 * C-1 from real heroes [{ L, style, kit: kitNumbers, main, defense }] and a model `model(L, style, state)` -> { kit, main, defense } (the matrix's
 * kit and skills for that state). Answers { bands: [{ band, heroes, real: { field: [min, median, max] }, states: { state: { field: value } },
 * inside: { state: { field: bool } } }] }: every field read against the MID kit at the same Level and way (real minus MID), so heroes
 * of other ways and Levels in one band compare.
 */
export function readC1(heroes, model) {
  const out = [];
  for (const [a, b] of BANDS) {
    const hs0 = heroes.filter((h) => h.L >= a && h.L <= b && h.style);
    /* a band of one or two heroes would show one person's numbers: it is counted, never shown */
    if (hs0.length > 0 && hs0.length < MIN_HEROES) { out.push({ band: a + '-' + b, heroes: 0, reading: hs0.length + ' real hero(es), under ' + MIN_HEROES + ': not shown' }); continue; }
    const hs = hs0;
    const rel = (h, num) => { const m = model(h.L, h.style, 'mid'); return { weaponTier: num.kit.weaponTier - m.kit.weaponTier, armorPieces: num.kit.armorPieces - m.kit.armorPieces,
      armorTier: num.kit.armorTier - m.kit.armorTier, jewels: num.kit.jewels - m.kit.jewels, mainVsLine: num.main - m.main, defenseVsLine: num.defense - m.defense }; };
    const realRel = hs.map((h) => rel(h, { kit: h.kit, main: h.main, defense: h.defense }));
    const real = Object.fromEntries(FIELDS.map((f) => [f, spread(realRel.map((x) => x[f]).filter(Number.isFinite))]));
    /* each state at the band's real heroes (their Levels and ways), relative to MID the same way */
    const states = {}, inside = {};
    for (const st of STATES) {
      const rs = hs.map((h) => rel(h, model(h.L, h.style, st)));
      states[st] = Object.fromEntries(FIELDS.map((f) => [f, r1(median(rs.map((x) => x[f]).filter(Number.isFinite)))]));
      inside[st] = Object.fromEntries(FIELDS.map((f) => [f, !!real[f] && states[st][f] !== null && states[st][f] >= real[f][0] && states[st][f] <= real[f][2]]));
    }
    out.push({ band: a + '-' + b, heroes: hs.length, ...(hs.length ? { real, states, inside } : { reading: 'no real hero: calibrated by the engine alone' }) });
  }
  return { bands: out };
}
/** Why an aggregate is not anonymous: any raw id it repeats, or a key that names a player. */
export function anonymityProblems(agg, rawIds) {
  const text = JSON.stringify(agg), out = [];
  for (const id of rawIds) if (id && text.includes(String(id))) out.push('an account id');
  if (/"(u|user_id|name|note|account)"\s*:/.test(text)) out.push('a field that names a player');
  return out;
}

async function loadModel() {
  const { loadGridData, MAIN: GM } = await import('./progression-grid.mjs');
  const { loadKits } = await import('./grid-kit.mjs');
  const D = await loadGridData(ROOT), K = await loadKits(ROOT);
  const cache = new Map();
  const model = (L, style, state) => {
    const key = L + '|' + style + '|' + state;
    if (cache.has(key)) return cache.get(key);
    const line = D.skillsAt(D.lines, 'party', style, L), d = K.skillDeltaOf(state, L), m = (GM || MAIN)[style] || 'melee';
    const p = K.kitFor(L, state, style, { ground: D.groundAt(L, 1), mainSkill: (line[m] || L) + d });
    const v = { kit: kitNumbers(p.kit, K.ITEMS), main: (line[m] || 0) + d, defense: (line.defense || 0) + d };
    cache.set(key, v);
    return v;
  };
  return { model, ITEMS: K.ITEMS, XP: D.XP };
}

async function c1() {
  if (!existsSync(RAW)) { console.error('calibrate: no raw read on this machine: run node tools/balance-program/real-players.local.mjs first'); return 2; }
  const raw = JSON.parse(readFileSync(RAW, 'utf8'));
  const { classify } = await import('./real-players.local.mjs');
  const cls = new Map(classify(raw.accounts).map((a) => [a.u, a.cls]));
  const { model, ITEMS, XP } = await loadModel();
  const heroes = raw.heroes.filter((h) => cls.get(h.u) === 'real').map((h) => {
    const worn = h.worn || {}, L = XP.charLevelFromXp(Number(h.level_xp) || 0), style = styleOf(worn, ITEMS), sk = h.skills || {};
    const lv = (k) => XP.skillLevelFromXp(k, Number(sk[k]) || 0);
    return { L, style, kit: kitNumbers(worn, ITEMS), main: style ? lv(MAIN[style]) : null, defense: lv('defense') };
  }).filter((h) => h.style && h.L >= 1);
  /* by seat as well (14 section 2: fit the skill line by seat): the front ways take the blows and train Defense, the back ways do not */
  const FRONT = new Set(['tank', 'hammer', 'sword', 'axes']);
  const J = { check: 'C-1', source: '14-the-rest.md section 2', read_day: raw.meta && raw.meta[0] ? String(raw.meta[0].read_at).slice(0, 10) : null, real_heroes: heroes.length,
    rule: 'each field is real minus the MID kit at the same Level and way; a state passes a field when its value sits inside the real spread',
    all: readC1(heroes, model), front: readC1(heroes.filter((h) => FRONT.has(h.style)), model), back: readC1(heroes.filter((h) => !FRONT.has(h.style)), model) };
  const leaks = anonymityProblems(J, raw.accounts.map((a) => a.u));
  if (leaks.length) { console.error('calibrate: the aggregate is not anonymous (' + leaks.join(', ') + '): nothing written'); return 1; }
  console.log('C-1, THE HEROES THE TOOL PLAYS (' + J.real_heroes + ' real heroes, read ' + J.read_day + '): each field real minus the MID kit at the same Level and way; [min / median / max]');
  for (const [seat, fields] of [['all', FIELDS.slice(0, 4)], ['front', FIELDS.slice(4)], ['back', FIELDS.slice(4)]]) {
    console.log((seat === 'all' ? ' GEAR, every way' : ' SKILLS, the ' + seat + ' ways'));
    for (const b of J[seat].bands) {
      if (!b.heroes) { console.log('  Level ' + b.band + ': ' + b.reading); continue; }
      console.log('  Level ' + b.band + ' (' + b.heroes + ' heroes)');
      for (const f of fields) console.log('    ' + f.padEnd(15) + ('real ' + b.real[f].join(' / ')).padEnd(26) + STATES.map((st) => st.toUpperCase() + ' ' + b.states[st][f] + (b.inside[st][f] ? '' : ' OUT')).join('   '));
    }
  }
  if (arg('json')) { const f = resolve(arg('json')); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(J, null, 1) + '\n'); console.log('wrote ' + f); }
  return 0;
}

function selftest() {
  const fails = [];
  const check = (name, ok, why = '') => { console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ': ' + why)); if (!ok) fails.push(name); };
  const ITEMS = { s: { weaponType: 'sword', tier: 2 }, sh: { type: 'shield', tier: 1 }, h1: { slot: 'helmet', tier: 1 }, b3: { slot: 'body', tier: 3 }, r: { type: 'jewelry', tier: 1 }, st: { weaponType: 'magic', tier: 1 } };
  check('a sword beside a shield is the tank, a staff the healer', styleOf({ weapon: 's', shield: 'sh' }, ITEMS) === 'tank' && styleOf({ weapon: 's' }, ITEMS) === 'sword' && styleOf({ weapon: 'st' }, { st: { weaponType: 'magic' } }) === 'mage');
  const k = kitNumbers({ weapon: 's', helmet: 'h1', body: 'b3', ring1: 'r' }, ITEMS);
  check('a worn set reads its weapon tier, armor pieces and mean tier, and jewelry (' + JSON.stringify(k) + ')', k.weaponTier === 2 && k.armorPieces === 2 && k.armorTier === 2 && k.jewels === 1);
  /* the model: MID wears tier L/10, LOW one under, BiS one over; skills on the line, LOW 8 under */
  const model = (L, style, st) => ({ kit: { weaponTier: Math.floor(L / 10) + (st === 'low' ? -1 : st === 'bis' ? 1 : 0), armorPieces: 6, armorTier: 2, jewels: st === 'low' ? 0 : 5 }, main: L + (st === 'low' ? -8 : 0), defense: L });
  const heroes = [20, 22, 25, 28].map((L, i) => ({ L, style: 'hammer', kit: { weaponTier: Math.floor(L / 10) - (i % 2), armorPieces: 6, armorTier: 2, jewels: i }, main: L - 2 * i, defense: L - 10 }));
  const J = readC1(heroes, model), b = J.bands.find((x) => x.band === '16-30');
  check('C-1 reads a band\'s real spread against MID and places each state in it (' + JSON.stringify(b && b.real.weaponTier) + ', LOW ' + JSON.stringify(b && b.states.low) + ')',
    b && b.heroes === 4 && b.real.weaponTier[0] === -1 && b.real.weaponTier[2] === 0 && b.inside.low.weaponTier && b.inside.mid.weaponTier && !b.inside.bis.weaponTier && !b.inside.mid.defenseVsLine
    && J.bands.find((x) => x.band === '85-110').reading);
  const two = readC1(heroes.slice(0, 2).map((h) => ({ ...h, L: 50 })), model).bands.find((x) => x.band === '45-64');
  check('a band of fewer than ' + MIN_HEROES + ' real heroes is counted and never shown (' + (two && two.reading) + ')', two && !two.real && /not shown/.test(two.reading));
  check('an aggregate that repeats an account id or names a player is refused', anonymityProblems({ a: 'x-123' }, ['x-123']).length === 1 && anonymityProblems({ u: 'H1' }, []).length === 1 && anonymityProblems(J, ['x-123']).length === 0);
  console.log('calibrate selftest: ' + (fails.length ? fails.length + ' FAILED' : 'green'));
  return fails.length ? 1 : 0;
}

async function main() {
  if (argv.includes('--selftest')) return selftest();
  if (argv.includes('--c1')) return c1();
  console.error('calibrate: --c1 [--json <file>] | --selftest');
  return 2;
}
if (isMain(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
