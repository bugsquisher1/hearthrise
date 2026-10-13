#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/coach-rows.mjs — FIRST STEPS IS DOABLE, SERVER-JUDGED AND HONEST (b573)
//
//   node tests/coach-rows.mjs             gate over src/data/coach.js
//   node tests/coach-rows.mjs --selftest  mutation proof: one planted defect per rule
//
// THE RULES
//   C1  every `done` fact is a kind with a named server source (COACH_FACT_SOURCES);
//       an 'act' row has at least one, an 'info' row has none
//   C2  no fact reads a client-written field: a `count` key is a server stat the
//       spine or the lifetime tally already reads (each guarded as server-written
//       by its own gate), a `kills` monster is a real monster, an `xp` skill a skill
//   C3  every id a selector names exists in the data it claims (the tree, the
//       fishing spot, the recipe, the monster, the crop), and every loot id is an
//       item the vendor buys that the Giant Rat really drops
//   C4  only an 'info' row has buttons (no Next on an act card), and each row has
//       a short title and a body of one or two sentences
//   C5  THE WALK-THROUGH (game-designer.md #4): from the real start kit, every act
//       row's path only crosses doors the reveal shows once the rows before it are
//       done, and no act row is already done on a fresh hero
//   C6  the in-page suite carries the DOM half (COACH-6: every hop resolves a
//       laid-out element at the running viewport) — asserted present here
//
// Exit: 0 green · 1 a rule broke · 2 harness error.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const mod = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

async function load() {
  const [coach, spine, reveals, progress, kit, gathering, recipes, monsters, items, skills, tally] = await Promise.all([
    mod('src/data/coach.js'), mod('src/data/spine.js'), mod('src/data/reveals.js'), mod('src/core/spine-progress.js'),
    mod('src/data/start-kit.js'), mod('src/data/gathering.js'), mod('src/data/recipes.js'), mod('src/data/monsters.js'),
    mod('src/data/items.js'), mod('src/data/skills.js'), mod('src/data/lifetime-tally.js'),
  ]);
  return { coach, spine, reveals, progress, kit, gathering, recipes, monsters, items, skills, tally };
}

/** The ids a hop's selector names, by the attribute it matches on. */
function idsIn(sel) {
  const out = [];
  const re = /\[(onclick|data-monster|data-hub-pane|data-tab)[*^]?="([^"]*)"\]/g;
  let m;
  while ((m = re.exec(sel))) {
    const v = m[2];
    const q = /'([a-z0-9_{}]+)'/g;
    let n, any = false;
    while ((n = q.exec(v))) { out.push({ attr: m[1], id: n[1] }); any = true; }
    if (!any && m[1] !== 'onclick') out.push({ attr: m[1], id: v });
  }
  return out;
}

export function check(D, rows) {
  const fails = [];
  const fail = (rule, msg) => fails.push(rule + ': ' + msg);
  const { COACH_FACT_SOURCES, COACH_LOOT, COACH_FOE } = D.coach;
  const SPINE_KEYS = new Set();
  D.spine.SPINE_STEPS.forEach((s) => s.need.forEach((n) => { if (n.fact === 'count') SPINE_KEYS.add(n.key); }));
  D.tally.LIFETIME_KEYS.forEach((k) => SPINE_KEYS.add(k));
  const MON = D.monsters.MONSTERS, ITEMS = D.items.ITEMS, SK = D.skills.SKILLS_DEF;

  // C1 + C2
  for (const r of rows) {
    if (r.kind !== 'info' && r.kind !== 'act') fail('C1', `${r.id}: kind "${r.kind}" is neither info nor act`);
    if (r.kind === 'act' && !r.done.length) fail('C1', `${r.id}: an act row with no server fact would never finish`);
    if (r.kind === 'info' && r.done.length) fail('C1', `${r.id}: an info row is read and closed, it waits on no fact`);
    for (const n of r.done) {
      if (!Object.prototype.hasOwnProperty.call(COACH_FACT_SOURCES, n.fact)) { fail('C1', `${r.id}: fact kind "${n.fact}" has no server source`); continue; }
      if (n.fact === 'count' && !SPINE_KEYS.has(n.key)) fail('C2', `${r.id}: count "${n.key}" is not a server stat the spine or the tally reads`);
      if (n.fact === 'kills' && !MON[n.monster]) fail('C2', `${r.id}: kills of unknown monster "${n.monster}"`);
      if (n.fact === 'xp' && !SK[n.skill]) fail('C2', `${r.id}: xp of unknown skill "${n.skill}"`);
    }
  }

  // C3
  const trees = new Set(D.gathering.TREES.map((t) => t.id));
  const spots = new Set(D.gathering.FISH_SPOTS.map((t) => t.id));
  const recipes = new Set(Object.values(D.recipes.ARTISAN_RECIPES).flat().map((x) => x && x.id));
  const crops = new Set(Object.keys(D.gathering.CROPS));
  const known = (attr, id) => {
    if (id === '{loot}') return true;
    if (attr === 'data-monster') return !!MON[id];
    if (attr === 'data-tab' || attr === 'data-hub-pane') return true;   // DOM doors: COACH-6 resolves them
    return trees.has(id) || spots.has(id) || recipes.has(id) || crops.has(id) || !!SK[id] || !!MON[id];
  };
  for (const r of rows) for (const hop of r.path) for (const { attr, id } of idsIn(hop.sel)) {
    if (!known(attr, id)) fail('C3', `${r.id}: selector names "${id}", which no tree, spot, recipe, crop, skill or monster is`);
  }
  if (!MON[COACH_FOE]) fail('C3', `the coach foe "${COACH_FOE}" is not a monster`);
  const drops = new Set(((MON[COACH_FOE] || {}).drops || []).map((d) => d.id));
  for (const id of COACH_LOOT) {
    if (!ITEMS[id] || !(Number(ITEMS[id].v) > 0)) fail('C3', `loot "${id}" is not an item the vendor buys`);
    if (!drops.has(id)) fail('C3', `loot "${id}" is not on the ${COACH_FOE} drop table`);
  }

  // C4
  for (const r of rows) {
    if (r.kind !== 'info' && (r.primary || r.secondary)) fail('C4', `${r.id}: an act card carries a button ("${r.primary || r.secondary}") — it must finish on the server fact`);
    if (!r.title || r.title.length > 32) fail('C4', `${r.id}: title must be short (got ${JSON.stringify(r.title)})`);
    const sentences = String(r.body || '').split(/(?<=[.!?])\s+/).filter(Boolean).length;
    if (sentences < 1 || sentences > 2) fail('C4', `${r.id}: body has ${sentences} sentences; one or two`);
  }

  // C5 — the walk-through
  const { reveal } = D.progress;
  const kit = D.kit;
  const facts = { counts: {}, countsComplete: true, skills: Object.assign({}, kit.START_SKILL_XP), property: 0, workers: 0, companions: 0,
    bag: Object.assign({}, kit.START_INVENTORY), products: {}, gold: kit.START_CURRENCY.gold, equipment: Object.assign({}, kit.START_EQUIPMENT), claimed: {} };
  const holdsFresh = (n) => {
    if (n.fact === 'count') return (facts.counts[n.key] || 0) >= n.min;
    if (n.fact === 'xp') return (facts.skills[n.skill] || 0) >= n.min;
    return false;   // kills, sold, activity: nothing on a fresh hero
  };
  for (const r of rows) if (r.kind === 'act' && r.done.every(holdsFresh)) fail('C5', `${r.id}: already done on a fresh hero from the start kit alone`);
  for (const r of rows) {
    const st = reveal(facts, D.spine.SPINE_STEPS, D.reveals.REVEALS, { startXp: kit.START_SKILL_XP });
    for (const hop of r.path) if (hop.reveal && !st.shows(hop.reveal)) fail('C5', `${r.id}: points through "${hop.reveal}", which is still shut when the steps before it are done`);
    for (const n of r.done) {          // do the row: its facts become true for every row after it
      if (n.fact === 'count') facts.counts[n.key] = Math.max(facts.counts[n.key] || 0, n.min);
      if (n.fact === 'xp') facts.skills[n.skill] = Math.max(facts.skills[n.skill] || 0, n.min);
    }
  }

  // C6
  const smoke = readFileSync(join(ROOT, 'src', 'features', 'smoke', 'coach.js'), 'utf8');
  if (!/COACH-6/.test(smoke)) fail('C6', 'the in-page COACH-6 anchor walk is missing from src/features/smoke/coach.js');
  return fails;
}

async function run() {
  const D = await load();
  const fails = check(D, D.coach.COACH_STEPS);
  if (fails.length) { fails.forEach((f) => console.error('  ✗ ' + f)); console.error(`coach-rows: ${fails.length} failure(s)`); return 1; }
  console.log(`✓ coach-rows: C1-C6 hold over ${D.coach.COACH_STEPS.length} First Steps rows (walk-through from the start kit green)`);
  return 0;
}

async function selftest() {
  const D = await load();
  const base = D.coach.COACH_STEPS.map((r) => JSON.parse(JSON.stringify(r)));
  const clean = check(D, base);
  const out = [];
  if (clean.length) out.push('SELFTEST: the clean rows are not green: ' + clean[0]);
  const by = (rows, id) => rows.find((r) => r.id === id);
  const cases = [
    ['C1', 'a client-side fact kind', (rows) => { by(rows, 'chop').done.push({ fact: 'gField', key: 'activeSkill' }); }],
    ['C1', 'an act row with no fact', (rows) => { by(rows, 'plant').done = []; }],
    ['C2', 'a count key no server writes', (rows) => { by(rows, 'fish').done[0].key = 'fishedLocally'; }],
    ['C3', 'a misspelt tree', (rows) => { const h = by(rows, 'chop').path; h[h.length - 1].sel = h[h.length - 1].sel.replace('normal_tree', 'normal_treee'); }],
    ['C3', 'a loot id the rat never drops', () => { D.coach = Object.assign({}, D.coach, { COACH_LOOT: ['wolf_pelt'] }); }],
    ['C4', 'a Next button on an act card', (rows) => { by(rows, 'cook').primary = 'Next'; }],
    ['C4', 'a three-sentence body', (rows) => { by(rows, 'sell').body += ' Then do it again.'; }],
    ['C5', 'chopping one log, then pointing at Fishing', (rows) => { by(rows, 'chop').done[0].min = 1; }],
    ['C5', 'a step the start kit already satisfies', (rows) => { by(rows, 'cook').done = [{ fact: 'xp', skill: 'hitpoints', min: 1 }]; }],
  ];
  const coach0 = D.coach;
  for (const [rule, label, plant] of cases) {
    const rows = base.map((r) => JSON.parse(JSON.stringify(r)));
    plant(rows);
    const got = check(D, rows);
    D.coach = coach0;
    if (!got.some((f) => f.startsWith(rule + ':'))) out.push(`SELFTEST: ${rule} missed ${label} (got: ${got.join(' | ') || 'green'})`);
  }
  if (out.length) { out.forEach((l) => console.error('  ✗ ' + l)); return 1; }
  console.log(`✓ coach-rows --selftest: clean rows green; ${cases.length} planted defects each caught by their rule (C1-C5)`);
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  (process.argv.includes('--selftest') ? selftest() : run())
    .then((c) => process.exit(c), (e) => { console.error(e && e.stack || e); process.exit(2); });
}
