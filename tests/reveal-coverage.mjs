#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/reveal-coverage.mjs — EVERY DOOR, WAR CARD AND SKILL HAS A REVEAL ROW
//
//   node tests/reveal-coverage.mjs             the guard
//   node tests/reveal-coverage.mjs --selftest  every planted defect must be caught
//
// The progressive reveal (src/features/spine-reveal.js) hides what it has no
// row for, so a pane, war card or skill added without a row in
// src/data/reveals.js would vanish for every player. This guard reads the
// owners of each surface and checks, in both directions:
//   R1  every pane in src/nav-consolidation.js HUBS has a `pane:` row
//   R2  every war card pushed by combat-screens.js destinations() carries a
//       `rid` with a `war:` row
//   R3  every src/data/skills.js skill has a `skill:` row
//   R4  every `card:` id named under src/ has a row, and every card row is named
//   R5  every row and step uses a known step number and fact kind
//   R6  no deadlock: every reveal id a step is played through (its `via`)
//       opens no later than that step becomes current, and is not held
//       behind an unreleased product
// and the reveal's own contract, on the real predicate and data:
//   S1  a fresh character sees 3–5 doors
//   S2  a fully progressed character sees every row
//   S3  no facts at all (unknown) shows only step-1 rows
//   S4  one confirmed `uses` fact shows its row, whatever else is unknown
//   S5  growing a fact never hides a row (reveals are monotonic)
//   S6  a row opens when its step becomes CURRENT (every earlier step done),
//       never because a later step happened to be done out of order
//   S7  a product row stays shut until its product is live, whatever else
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = '?v=' + (/cache:\s*'?(\d+)/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const imp = (p) => import(new URL('../' + p + V, import.meta.url).href);

const { REVEALS } = await imp('src/data/reveals.js');
const { SPINE_STEPS } = await imp('src/data/spine.js');
const { SKILLS_DEF } = await imp('src/data/skills.js');
const { START_SKILL_XP, START_INVENTORY } = await imp('src/data/start-kit.js');
const core = await imp('src/core/spine-progress.js');

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function srcFiles(dir, out = []) {
  for (const n of readdirSync(join(ROOT, dir))) {
    const p = dir + '/' + n;
    if (statSync(join(ROOT, p)).isDirectory()) { if (!/smoke$|vendor$/.test(p)) srcFiles(p, out); }
    else if (p.endsWith('.js') && p !== 'src/data/reveals.js') out.push(p);
  }
  return out;
}

function hubPanes(navText) {
  const a = navText.indexOf('var HUBS = [');
  const b = navText.indexOf('];', a);
  return [...navText.slice(a, b).matchAll(/tab:\s*'([A-Za-z]+)'/g)].map((m) => m[1]);
}

function warPushes(combatText) {
  const a = combatText.indexOf('function destinations()');
  const b = combatText.indexOf('\nfunction ', a + 10);
  const block = combatText.slice(a, b);
  return block.split('out.push({').slice(1).map((chunk) => {
    const m = /rid:\s*'([^']+)'/.exec(chunk.slice(0, 200));
    return m ? m[1] : null;
  });
}

function cardLiterals(texts) {
  const out = new Map();
  for (const [file, t] of texts) for (const m of t.matchAll(/'(card:[A-Za-z-]+)'/g)) {
    if (!out.has(m[1])) out.set(m[1], file);
  }
  return out;
}

export function inputs() {
  return {
    rows: REVEALS, steps: SPINE_STEPS, skills: Object.keys(SKILLS_DEF), core,
    panes: hubPanes(read('src/nav-consolidation.js')),
    wars: warPushes(read('src/features/combat-screens.js')),
    cards: cardLiterals(srcFiles('src').map((p) => [p, read(p)])),
  };
}

const FRESH = { counts: {}, countsComplete: true, skills: START_SKILL_XP, property: 0, workers: 0, bag: START_INVENTORY };
const CTX = { startXp: START_SKILL_XP };

function fullFacts(inp) {
  const counts = {};
  const add = (n) => { if (n.fact === 'count') counts[n.key] = 1e9; };
  inp.steps.forEach((s) => s.need.forEach(add));
  inp.rows.forEach((r) => r.uses.forEach(add));
  const bag = {};
  inp.rows.forEach((r) => r.uses.forEach((n) => { if (n.fact === 'holds') n.ids.forEach((id) => { bag[id] = 1; }); }));
  const products = Object.fromEntries(inp.rows.filter((r) => r.product).map((r) => [r.product, true]));
  return { counts, countsComplete: true, skills: Object.fromEntries(inp.skills.map((s) => [s, 13034431])), property: 99, workers: 99, companions: 99, bag, products };
}

/** A fact made true on its own, for S4. */
function confirm(n) {
  switch (n.fact) {
    case 'count': return { counts: { [n.key]: n.min } };
    case 'skill': return { skills: { [n.id]: (START_SKILL_XP[n.id] || 0) + 1 } };
    case 'property': return { property: n.min };
    case 'workers': return { workers: n.min };
    case 'companions': return { companions: n.min };
    case 'holds': return { bag: { [n.ids[0]]: 1 } };
    case 'combat': return null;
    default: return null;
  }
}

export function check(inp) {
  const problems = [];
  const ids = new Set(inp.rows.map((r) => r.id));
  const kinds = new Set(Object.keys(inp.core.FACTS));
  const nSteps = inp.steps.length;
  inp.panes.forEach((t) => { if (!ids.has('pane:' + t)) problems.push(`R1 pane '${t}' (nav-consolidation HUBS) has no pane:${t} row`); });
  if (!inp.panes.length) problems.push('R1 read no panes from HUBS — the parser no longer matches nav-consolidation.js');
  inp.wars.forEach((rid, i) => {
    if (!rid) problems.push(`R2 war card #${i + 1} in destinations() carries no rid`);
    else if (!ids.has(rid)) problems.push(`R2 war card rid '${rid}' has no row`);
  });
  if (!inp.wars.length) problems.push('R2 read no war cards from destinations()');
  inp.skills.forEach((s) => { if (!ids.has('skill:' + s)) problems.push(`R3 skill '${s}' has no skill:${s} row`); });
  for (const [id, file] of inp.cards) if (!ids.has(id)) problems.push(`R4 '${id}' named in ${file} has no row`);
  inp.rows.filter((r) => r.id.startsWith('card:') && !inp.cards.has(r.id))
    .forEach((r) => problems.push(`R4 row '${r.id}' is named by no surface under src/ (dead row)`));
  inp.rows.forEach((r) => {
    if (!Number.isInteger(r.step) || r.step < 0 || r.step > nSteps) problems.push(`R5 row '${r.id}' step ${r.step} is not 0..${nSteps}`);
    r.uses.forEach((n) => { if (!kinds.has(n.fact)) problems.push(`R5 row '${r.id}' uses unknown fact '${n.fact}'`); });
  });
  inp.steps.forEach((s, i) => {
    if (s.step !== i + 1) problems.push(`R5 spine step #${i + 1} is numbered ${s.step}`);
    if (!s.need.length) problems.push(`R5 spine step ${s.step} has no need`);
    s.need.forEach((n) => { if (!kinds.has(n.fact)) problems.push(`R5 spine step ${s.step} needs unknown fact '${n.fact}'`); });
    (s.via || []).forEach((id) => {
      const r = inp.rows.find((x) => x.id === id);
      if (!r) problems.push(`R6 spine step ${s.step} is played through '${id}', which has no row`);
      else if (r.step > s.step) problems.push(`R6 DEADLOCK: step ${s.step} is played through '${id}', which opens only at step ${r.step}`);
      else if (r.product) problems.push(`R6 DEADLOCK: step ${s.step} is played through '${id}', shut behind product '${r.product}'`);
    });
    if (!(s.via || []).length) problems.push(`R6 spine step ${s.step} names no door it is played through (via)`);
    if (typeof s.whenDone !== 'string' || !s.whenDone) problems.push(`R6 spine step ${s.step} has no whenDone wording for the tour`);
  });

  const R = (f) => inp.core.reveal(f, inp.steps, inp.rows, CTX);
  const hubs = (shown) => new Set(inp.panes.filter((t) => shown.has('pane:' + t)));
  const fresh = R(FRESH);
  const freshPanes = hubs(fresh.shown).size;
  if (freshPanes < 3 || freshPanes > 6) problems.push(`S1 a fresh character sees ${freshPanes} panes (want ~4)`);
  const full = R(fullFacts(inp));
  const missing = inp.rows.filter((r) => !full.shows(r.id)).map((r) => r.id);
  if (missing.length) problems.push(`S2 a full account does not see: ${missing.join(', ')}`);
  const none = R({});
  const leak = [...none.shown].filter((id) => (inp.rows.find((r) => r.id === id) || {}).step > 1);
  if (leak.length) problems.push(`S3 unknown facts revealed: ${leak.join(', ')}`);
  inp.rows.forEach((r) => r.uses.forEach((n) => {
    const f = confirm(n);
    if (f && !R(f).shows(r.id)) problems.push(`S4 '${r.id}' stays hidden although the server confirms ${JSON.stringify(n)}`);
  }));
  const ladder = [FRESH];
  inp.steps.forEach((s) => {
    const prev = ladder[ladder.length - 1];
    const next = JSON.parse(JSON.stringify(prev));
    s.need.forEach((n) => {
      if (n.fact === 'count') next.counts[n.key] = Math.max(next.counts[n.key] || 0, n.min);
      if (n.fact === 'property') next.property = Math.max(next.property, n.min);
      if (n.fact === 'workers') next.workers = Math.max(next.workers, n.min);
      if (n.fact === 'combat') next.skills = Object.assign({}, next.skills, { attack: 1e6, strength: 1e6, defense: 1e6 });
      if (n.fact === 'item') next.bag = Object.assign({}, next.bag, { [n.id]: Math.max((next.bag || {})[n.id] || 0, n.min) });
      if (n.fact === 'cleared') next.counts['dungeon_clear:' + n.dungeon] = n.min;
    });
    ladder.push(next);
  });
  let was = new Set();
  ladder.forEach((f, i) => {
    const now = R(f).shown;
    const lost = [...was].filter((id) => !now.has(id));
    if (lost.length) problems.push(`S5 rung ${i} hid ${lost.join(', ')}`);
    was = now;
  });
  /* S6: every step's needs met EXCEPT step 2 — only rows of steps 0..2 (or a use) may open. */
  const skip = JSON.parse(JSON.stringify(ladder[ladder.length - 1]));
  inp.steps[1].need.forEach((n) => { if (n.fact === 'count') skip.counts[n.key] = 0; });
  const early = R(skip);
  const jumped = inp.rows.filter((r) => r.step > 2 && !r.uses.length && !r.product && early.shows(r.id)).map((r) => r.id);
  if (early.progress.current !== 2) problems.push(`S6 with step 2 open the current step is ${early.progress.current}`);
  if (jumped.length) problems.push(`S6 rows opened before their step was current: ${jumped.join(', ')}`);
  /* S7 */
  const full2 = fullFacts(inp); full2.products = {};
  const leaked = inp.rows.filter((r) => r.product && R(full2).shows(r.id)).map((r) => r.id);
  if (leaked.length) problems.push(`S7 unreleased product rows show: ${leaked.join(', ')}`);
  if (R(ladder[ladder.length - 1]).progress.reachedThrough !== nSteps + 1) {
    problems.push(`S5 walking every step's needs does not finish the spine (reachedThrough ${R(ladder[ladder.length - 1]).progress.reachedThrough})`);
  }
  return problems;
}

function mutants(base) {
  const clone = () => Object.assign({}, base, { cards: new Map(base.cards) });
  const coreWith = (over) => Object.assign({}, base.core, over);
  return [
    ['a skill loses its row', () => Object.assign(clone(), { rows: base.rows.filter((r) => r.id !== 'skill:mining') })],
    ['a new pane is added to HUBS', () => Object.assign(clone(), { panes: base.panes.concat('vault') })],
    ['a war card is pushed with no rid', () => Object.assign(clone(), { wars: base.wars.concat(null) })],
    ['a surface names an unknown card', () => { const c = clone(); c.cards.set('card:ghost', 'src/x.js'); return c; }],
    ['a card row loses its surface', () => { const c = clone(); c.cards.delete('card:upkeep'); return c; }],
    ['a row uses an unknown fact kind', () => Object.assign(clone(), { rows: base.rows.concat({ id: 'skill:zz', step: 1, uses: [{ fact: 'clientFlag' }] }) })],
    ['the reveal ignores `uses`', () => Object.assign(clone(), { core: coreWith({ reveal: (f, s, rows, ctx) => base.core.reveal(f, s, rows.map((r) => Object.assign({}, r, { uses: [] })), ctx) }) })],
    ['unknown counts as zero-complete', () => Object.assign(clone(), { core: coreWith({ reveal: (f, s, rows, ctx) => base.core.reveal(Object.keys(f).length ? f : { countsComplete: true, counts: { chopped: 1e9, fished: 1e9, cooked: 1e9 } }, s, rows, ctx) }) })],
    ['every row shows from step 1', () => Object.assign(clone(), { rows: base.rows.map((r) => Object.assign({}, r, { step: 1 })) })],
    ['the window ignores the step order', () => Object.assign(clone(), { steps: base.steps.slice().reverse() })],
    ['a bench opens only after its own step (step-7 deadlock)', () => Object.assign(clone(), { rows: base.rows.map((r) => r.id === 'skill:crafting' ? Object.assign({}, r, { step: 8 }) : r) })],
    ['arrival counts the highest done step', () => Object.assign(clone(), { core: coreWith({ reveal: (f, s, rows, ctx) => {
      const p = base.core.spineProgress(f, s, ctx);
      const reach = p.highestDone + 1;
      const shown = new Set();
      rows.forEach((r) => {
        if (r.product && !(f.products || {})[r.product]) return;
        if (r.step <= reach || r.uses.some((n) => base.core.factHolds(f, n, ctx) === true)) shown.add(r.id);
      });
      return { progress: Object.assign({}, p, { reachedThrough: reach }), shown, shows: (id) => shown.has(id) };
    } }) })],
    ['the reveal ignores the product gate', () => Object.assign(clone(), { core: coreWith({ reveal: (f, s, rows, ctx) =>
      base.core.reveal(Object.assign({}, f, { products: new Proxy({}, { get: () => true }) }), s, rows, ctx) }) })],
  ];
}

const base = inputs();
if (process.argv.includes('--selftest')) {
  const clean = check(base);
  if (clean.length) { console.log('✗ reveal-coverage --selftest: the clean tree is red, nothing to prove:\n  ' + clean.join('\n  ')); process.exit(1); }
  let escaped = 0;
  for (const [name, make] of mutants(base)) {
    const p = check(make());
    console.log((p.length ? '  ✓ caught  ' : '  ✗ ESCAPED ') + name + (p.length ? ' — ' + p[0] : ''));
    if (!p.length) escaped++;
  }
  if (escaped) { console.log(`✗ reveal-coverage --selftest: ${escaped} mutation(s) escaped`); process.exit(1); }
  console.log('✓ reveal-coverage --selftest: every planted defect caught, clean control green');
  process.exit(0);
}
const problems = check(base);
if (problems.length) {
  console.log('✗ reveal-coverage: ' + problems.length + ' problem(s)\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`✓ reveal-coverage: ${base.panes.length} panes, ${base.wars.length} war cards, ${base.skills.length} skills, ${base.cards.size} cards — every one has a reveal row; fresh/full/unknown/monotonic hold`);
