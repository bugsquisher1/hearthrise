#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/spine.mjs — THE POINTER BAR CAN ONLY POINT AT DOORS THAT ARE OPEN
//
//   node tests/spine.mjs             the guard
//   node tests/spine.mjs --selftest  every planted defect must be caught
//
// The pointer (src/data/spine-pointer.js, src/core/spine-pointer.js) tells a
// player the one thing to do next. A wrong row is a dead end the player meets
// in the first hour, so the table is checked against the game's own data:
//   SP1  every Go route is a real pane, open (src/data/reveals.js) at that step,
//        and a skill it opens is revealed by then; the door is one the step
//        is played through (src/data/spine.js `via`) or one opened earlier
//   SP2  every quest link is a real QUEST_DEFS row, linked once; a server-paid
//        one (QUEST_REWARDS) is graded on a counter the step itself reads
//   SP3  no step needs something only made later: every item a step counts has
//        a producer (node, monster, recipe or shop) behind doors open at that
//        step, recursively through recipe inputs; a property rung needs the
//        rung below it on an earlier step; a hand needs a house first
//   SP4  every step has an unlock line, and a step the next door opens behind
//        is not followed by a bar that promises nothing
//   SP5  the predicate: a fresh character is on step 1, a maxed one is done,
//        and growing a fact never moves the pointer back
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = '?v=' + (/cache:\s*'?(\d+)/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const imp = (p) => import(new URL('../' + p + V, import.meta.url).href);

const SP = await imp('src/data/spine-pointer.js');
const { REVEALS } = await imp('src/data/reveals.js');
const { QUEST_REWARDS } = await imp('src/data/goal-catalogue.js');
const { TREES, ROCKS, FISH_SPOTS, CROPS } = await imp('src/data/gathering.js');
const { MONSTERS } = await imp('src/data/monsters.js');
const { ARTISAN_RECIPES } = await imp('src/data/recipes.js');
const { SHOP_OFFERS } = await imp('src/data/shops.js');
const core = await imp('src/core/spine-pointer.js');

function hubPanes() {
  const t = readFileSync(join(ROOT, 'src/nav-consolidation.js'), 'utf8');
  const a = t.indexOf('var HUBS = [');
  return [...t.slice(a, t.indexOf('];', a)).matchAll(/tab:\s*'([A-Za-z]+)'/g)].map((m) => m[1]);
}

/** The QUEST_DEFS ids legacy.js authors (a classic script: read as text). */
function questDefIds() {
  const t = readFileSync(join(ROOT, 'src/legacy.js'), 'utf8');
  const a = t.indexOf('const QUEST_DEFS=[');
  return [...t.slice(a, t.indexOf('\n];', a)).matchAll(/\{id:'([a-z_]+)'/g)].map((m) => m[1]);
}

/** item id → [{ door: reveal row id, inputs: {id: qty} }] */
function producers() {
  const out = {};
  const add = (id, door, inputs) => { (out[id] = out[id] || []).push({ door, inputs: inputs || {} }); };
  [[TREES, 'woodcutting'], [ROCKS, 'mining'], [FISH_SPOTS, 'fishing']].forEach(([list, skill]) =>
    list.forEach((n) => add(n.prod, 'skill:' + skill)));
  Object.values(CROPS).forEach((c) => add(c.prod, 'pane:farming', { [c.seed]: 1 }));
  Object.values(MONSTERS).forEach((m) => (m.drops || []).forEach((d) => add(d.id, 'pane:combat')));
  Object.entries(ARTISAN_RECIPES).forEach(([skill, list]) => (list || []).forEach((r) => {
    if (r.output) add(r.output, 'skill:' + skill, r.inputs || (r.input ? { [r.input]: 1 } : {}));
  }));
  SHOP_OFFERS.forEach((o) => (o.grant || []).forEach((g) => {
    if (g.kind === 'item' && o.cost.every((c) => c.kind === 'currency' && c.id === 'gold')) add(g.id, 'pane:shop');
  }));
  return out;
}

export function world() {
  return {
    rows: SP.POINTER_STEPS.map((r) => Object.assign({}, r, { parts: r.parts.slice() })),
    routes: Object.assign({}, SP.ROUTES), itemRoute: Object.assign({}, SP.ITEM_ROUTE),
    reveals: REVEALS.slice(), quests: Object.assign({}, QUEST_REWARDS), panes: hubPanes(), producers: producers(), questIds: questDefIds(),
  };
}

/* A gathering skill's own lifetime counter is a part of ev:gather (each log
   chopped is one resource gathered), so a chop step may pay a gather quest. */
const PART_OF = { chopped: 'ev:gather', fished: 'ev:gather', mined: 'ev:gather' };

export function check(w) {
  const fails = [];
  const fail = (code, msg) => fails.push(code + ': ' + msg);
  const stepOf = (id) => { const r = w.reveals.find((x) => x.id === id); return r ? r.step : Infinity; };
  const open = (id, s) => stepOf(id) <= s;

  // SP1 — routes
  w.rows.forEach((row) => row.parts.forEach((p) => {
    const r = w.routes[p.go];
    if (!r) { fail('SP1', `step ${row.step} part routes to "${p.go}", which is not a route`); return; }
    if (w.panes.indexOf(r.tab) < 0) fail('SP1', `route ${p.go} opens "${r.tab}", which is not a pane`);
    else if (!open('pane:' + r.tab, row.step)) fail('SP1', `step ${row.step} sends the player to ${r.tab}, which opens at step ${stepOf('pane:' + r.tab)}`);
    if (r.skill && !open('skill:' + r.skill, row.step)) fail('SP1', `step ${row.step} opens ${r.skill}, which is revealed at step ${stepOf('skill:' + r.skill)}`);
    const door = r.skill ? 'skill:' + r.skill : 'pane:' + r.tab;
    if ((row.via || []).indexOf(door) < 0 && !(stepOf(door) < row.step)) fail('SP1', `step ${row.step} routes through ${door}, neither its via nor a door opened before it`);
  }));

  // SP2 — quest links
  const linked = {};
  w.rows.forEach((row) => {
    if (!row.quest) return;
    if (w.questIds.indexOf(row.quest) < 0) fail('SP2', `step ${row.step} links quest "${row.quest}", which is not a QUEST_DEFS row`);
    const q = w.quests[row.quest];
    if (q && !row.need.concat(row.parts.map((p) => p.need)).some((n) => n.fact === 'count' && (n.key === q.checkKey || PART_OF[n.key] === q.checkKey)))
      fail('SP2', `step ${row.step} links ${row.quest}, graded on ${q.checkKey}, a counter the step never reads`);
    if (linked[row.quest]) fail('SP2', `quest ${row.quest} is linked by steps ${linked[row.quest]} and ${row.step}`);
    linked[row.quest] = row.step;
  });

  // SP3 — nothing needed before it can be made
  const reach = (item, s, seen) => {
    if (seen.has(item)) return false;
    const next = new Set(seen).add(item);
    return (w.producers[item] || []).some((p) => open(p.door, s)
      && Object.keys(p.inputs).every((i) => reach(i, s, next)));
  };
  const rungAt = {};
  w.rows.forEach((row) => row.need.forEach((n) => { if (n.fact === 'property' && !(rungAt[n.min] <= row.step)) rungAt[n.min] = row.step; }));
  w.rows.forEach((row) => row.parts.forEach((p) => {
    const n = p.need;
    if (n.fact === 'item') {
      if (!reach(n.id, row.step, new Set())) fail('SP3', `step ${row.step} needs ${n.id}, which nothing behind an open door makes by then`);
      const r = w.routes[w.itemRoute[n.id]];
      if (!r) fail('SP3', `${n.id} has no route in ITEM_ROUTE`);
    }
    if (n.fact === 'level' && !open('skill:' + n.skill, row.step)) fail('SP3', `step ${row.step} needs ${n.skill} levels before ${n.skill} opens`);
    if (n.fact === 'property' && n.min > 1 && !(rungAt[n.min - 1] < row.step)) fail('SP3', `step ${row.step} builds rung ${n.min} before rung ${n.min - 1} is built`);
    if (n.fact === 'workers' && !(rungAt[1] < row.step)) fail('SP3', `step ${row.step} hires a hand before there is a house to keep one`);
  }));
  w.rows.forEach((row, i) => {
    if (i && row.step !== w.rows[i - 1].step + 1) fail('SP3', `steps jump from ${w.rows[i - 1].step} to ${row.step}`);
    const last = row.parts[row.parts.length - 1];
    if (!row.parts.length || row.parts.slice(0, -1).some((p) => p.act)) fail('SP3', `step ${row.step}: only the last part may be the act`);
    else if (row.need.some((n) => n.fact === 'property') && !(last.act && last.need.fact === 'property')) fail('SP3', `step ${row.step} builds without a Build button`);
  });

  // SP4 — unlock lines
  w.rows.forEach((row) => {
    if (!row.opens || !row.opens.title || !row.opens.line) fail('SP4', `step ${row.step} has no unlock line`);
  });

  // SP5 — the predicate on the real rows
  const model = (f) => core.pointerModel(f, w.rows, w.quests, SP.CHAPTER_END);
  const FRESH = { counts: {}, countsComplete: true, skills: {}, property: 0, workers: 0, bag: {}, gold: 0, equipment: {}, claimed: {} };
  const m0 = model(FRESH);
  if (m0.step !== 1) fail('SP5', `a fresh character is on step ${m0.step}, not 1`);
  const big = Object.fromEntries(w.rows.flatMap((r) => r.parts.concat(r.need.map((need) => ({ need }))))
    .filter((p) => p.need.fact === 'count').map((p) => [p.need.key, 1e9]).concat(Object.values(w.quests).map((q) => [q.checkKey, 1e9])));
  const FULL = { counts: big, countsComplete: true, skills: { crafting: 2e7, attack: 2e7, strength: 2e7, defense: 2e7, hitpoints: 2e7 },
    property: 5, workers: 6, bag: {}, gold: 1e9, equipment: { boots: 'leather_boots' }, claimed: Object.fromEntries(Object.keys(w.quests).map((q) => [q, true])) };
  if (!model(FULL).finished) fail('SP5', `a maxed character is still on step ${model(FULL).step}`);
  let prev = 1, f = JSON.parse(JSON.stringify(FRESH));
  for (const row of w.rows) {
    for (const n of row.need) {
      if (n.fact === 'count') f.counts[n.key] = Math.max(f.counts[n.key] || 0, n.min);
      if (n.fact === 'property') f.property = Math.max(f.property, n.min);
      if (n.fact === 'workers') f.workers = Math.max(f.workers, n.min);
      if (n.fact === 'combat') f.skills = Object.assign({}, f.skills, { attack: 2e6, strength: 2e6, defense: 2e6, hitpoints: 2e6 });
      if (n.fact === 'wears') f.equipment = { boots: 'leather_boots' };
      if (n.fact === 'item') f.bag = Object.assign({}, f.bag, { [n.id]: n.min });
      if (n.fact === 'cleared') f.counts['dungeon_clear:' + n.dungeon] = 1;
    }
    if (row.quest) f.claimed[row.quest] = true;
    const m = model(f);
    const at = m.finished ? Infinity : m.step;
    if (at < prev) fail('SP5', `finishing step ${row.step} moved the pointer back to ${at}`);
    if (!(at > row.step)) fail('SP5', `finishing step ${row.step} left the pointer on ${at}`);
    prev = at;
  }
  const soft = JSON.parse(JSON.stringify(f));
  soft.equipment = {};
  if (!model(soft).finished) fail('SP5', 'taking the boots off sent a finished character back to step ' + model(soft).step);
  return fails;
}

const MUTANTS = {
  closedDoor: ['SP1', (w) => { w.rows[0].parts[0] = Object.assign({}, w.rows[0].parts[0], { go: 'fight' }); }],
  hiddenSkill: ['SP1', (w) => { w.rows[0].parts[0] = Object.assign({}, w.rows[0].parts[0], { go: 'smith' }); }],
  ghostQuest: ['SP2', (w) => { w.rows[3] = Object.assign({}, w.rows[3], { quest: 'no_such_quest' }); }],
  wrongCounter: ['SP2', (w) => { w.rows[2] = Object.assign({}, w.rows[2], { need: [{ fact: 'count', key: 'kills', min: 5 }], parts: [Object.assign({}, w.rows[2].parts[0], { need: { fact: 'count', key: 'kills', min: 5 } })] }); }],
  offViaDoor: ['SP1', (w) => { w.rows[4] = Object.assign({}, w.rows[4], { via: ['pane:house'] }); w.rows[4].parts.splice(1, 0, { need: { fact: 'item', id: 'iron_ore', min: 1 }, go: 'mine', act: false }); w.reveals = w.reveals.map((r) => (r.id === 'skill:mining' ? Object.assign({}, r, { step: 5 }) : r)); w.rows[4].via = []; }],
  doubleLink: ['SP2', (w) => { w.rows[1] = Object.assign({}, w.rows[1], { quest: 'gatherer' }); }],
  madeLater: ['SP3', (w) => { w.itemRoute.normal_plank = 'craft'; w.rows[4].parts.unshift({ need: { fact: 'item', id: 'normal_plank', min: 1 }, go: 'mine', act: false }); }],
  rungSkipped: ['SP3', (w) => { w.rows[4] = Object.assign({}, w.rows[4], { need: [{ fact: 'property', min: 2 }] }); w.rows[9] = Object.assign({}, w.rows[9], { need: [{ fact: 'property', min: 1 }] }); }],
  noUnlock: ['SP4', (w) => { w.rows[0] = Object.assign({}, w.rows[0], { opens: null }); }],
  neverDone: ['SP5', (w) => { w.rows[3] = Object.assign({}, w.rows[3], { need: [] }); }],
};

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  const clean = check(world());
  let bad = clean.length ? 1 : 0;
  console.log(clean.length ? '  FAIL  clean arm red: ' + clean[0] : '  clean arm green');
  for (const [name, [code, plant]] of Object.entries(MUTANTS)) {
    const w = world(); plant(w);
    const got = check(w);
    const hit = got.some((f) => f.startsWith(code + ':'));
    console.log(`  ${hit ? 'caught' : 'MISSED'}  ${name} -> ${code}${hit ? '' : ' (got ' + (got[0] || 'nothing') + ')'}`);
    if (!hit) bad = 1;
  }
  console.log(bad ? 'spine selftest: FAILED' : `spine selftest: clean arm green, ${Object.keys(MUTANTS).length} mutations caught`);
  process.exit(bad);
}
const fails = check(world());
fails.forEach((f) => console.log('  FAIL  ' + f));
console.log(fails.length ? `spine: ${fails.length} failure(s)` : `✓ spine: ${SP.POINTER_STEPS.length} steps — every route opens an open door, every quest link is real, nothing is needed before it can be made`);
process.exit(fails.length ? 1 : 0);
