// tests/hunt-core/fixtures/h4.js — lane H4's fixtures: a hero with a supply session, a fight to cast into,
// and a sub-step driver for consumables.js / abilities.js. Built on fixtures/h1.js (spec §1.6).
import { hero, mon, world, instOf, subStep, loadCore, plant, makeReport, ROOT } from './h1.js';

export const STORE_FOOD = 'salted_shrimp';
export const STORE_DRINK = 'thin_turnip_juice';

/** A member's hunt session: `bag` lines, the tier-1 store rows, a purse and the supplies choice. */
export function supplySession(M, o) {
  const x = o || {};
  return M.AR.newHuntSession({
    id: 'h4', huntFromMs: 0, bag: x.bag || {},
    basics: {
      [STORE_FOOD]: { kind: 'heal', price: 15, heals: 6, mana: 0, partner: 'cooked_shrimp' },
      [STORE_DRINK]: { kind: 'mana', price: 15, heals: 0, mana: 6, partner: 'turnip_juice' },
      ...(x.shot ? { [x.shot]: { kind: 'ammo', price: 2, heals: 0, mana: 0, partner: x.ammo } } : {}),
      /* `runes`: every store rune (one a family, supply-basics.js), for a bar whose rune spells name theirs */
      ...(x.runes ? Object.fromEntries(M.SB.BASIC_SUPPLIES.filter((b) => b.kind === 'ammo' && /_rune$/.test(b.id))
        .map((b) => [b.id, { kind: 'ammo', price: b.price, heals: 0, mana: 0, partner: b.partner }])) : {}),
    },
    purse: x.purse ?? 100000, goldFloor: x.goldFloor ?? 0,
    supplySource: x.supplySource || 'mine', onEmpty: x.onEmpty || 'switch',
  });
}

/** The fixture's supply slots for a session's bag: own foods, the store food, own drinks, the store drink, each
    with the conditions a new slot starts with (eat under 50% HP, drink under 30% mana), WRITTEN on it: a slot
    with none fires whenever it is ready (Tyler 2026-10-23). */
export function supplyBar(M, hs) {
  const own = (kind) => Object.keys((hs && hs.bag) || {}).sort().filter((id) => M.CD.CONSUMABLES[id] && M.CD.CONSUMABLES[id].source === 'own' && M.CD.CONSUMABLES[id].kind === kind);
  const slot = (id) => ({ action: { type: 'consume', id }, conditions: M.conditions.suggestedConditions({ type: 'consume', id }), join: 'and' });
  return own('food').map(slot).concat([slot(STORE_FOOD)], own('drink').map(slot), [slot(STORE_DRINK)]);
}

/** A one-hero world (plus `mons`), its inst with the hero's injected context, and a recording sub-step. */
export function oneHero(M, heroOver, ctx, mons) {
  const h = hero(M, 1, 12, 3, Object.assign({ hp: 100, maxHp: 100, mana: 100, maxMana: 100 }, heroOver || {}));
  const w = world(M, [h, ...(mons || []).map((m, i) => mon(M, 10 + i, 0, m.x, m.y, Object.assign({ target: 1 }, m)))]);
  const inst = instOf(M, w);
  /* THE BAR SHORTHAND (fixtures only): `bar` (ability ids, or slots) becomes the hero's slots through the engine's
     heroSlots. A bar with no food or drink slot gets the fixture's SUPPLY BAR (supplyBar): a slot names ONE item
     (Tyler 2026-10-21), so the fixture names each own food in the bag, then the store food, then each own drink,
     then the store drink, all on the hero's eat-at / drink-at (no conditions of their own). */
  const row = Object.assign({ hs: supplySession(M), actionSet: 'hunt', range: 1 }, ctx || {});
  if (!row.slots) {
    const bar = row.bar || [];
    const eats = bar.some((s) => s && typeof s === 'object' && s.action && s.action.type === 'consume');
    row.slots = M.conditions.heroSlots(eats ? bar : bar.concat(supplyBar(M, row.hs)), null);
  }
  delete row.bar;
  inst.heroes = { 1: row };
  return { h, w, inst, sc: subStep(0) };
}

/** Run `hook` for n sub-steps of 100 ms from `from`. */
export function steps(inst, sc, hook, n, from) {
  for (let i = 0; i < n; i++) { sc.atMs = (from || 0) + i * 100; hook(inst, sc); }
}

/** A seeded swing stream for casts that roll. */
export const rngOf = (M, seed) => M.rng.createRng(M.rng.hashSeed('h4', seed));

/** The data modules this lane owns, imported as the SAME instances the core reads (the build's ?v=). */
export async function loadData(M) {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const v = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(M.root, 'src/build-info.js'), 'utf8')) || [, ''])[1];
  const imp = (p) => import(pathToFileURL(join(M.root, p)).href + v);
  /* THE BAR'S SHELL (bar-draft, action-facts), when the tree holds it: the repo, or a mutant planted with `also: ['src']`. */
  const shell = existsSync(join(M.root, 'src/shell/bar-draft.js')) ? { draft: await imp('src/shell/bar-draft.js'), facts: await imp('src/shell/action-facts.js') } : null;
  return { CD: await imp('src/data/consumables.js'), AD: await imp('src/data/abilities.js'), SB: await imp('src/data/supply-basics.js'), kit: await imp('src/data/start-kit.js'), XP: await imp('src/core/xp.js'), runes: await imp('src/data/runes.js'), SC: await imp('src/data/stonecraft.js'), shell };
}

/** fixtures/h1.js `suite`, with this lane's data modules on M (M.CD, M.AD). */
export async function suiteH4(name, cases, mutants) {
  const R = makeReport(name);
  const load = async (root) => { const M = await loadCore(root); return Object.assign(M, await loadData(M)); };
  const M = await load(ROOT);
  for (const [cn, fn] of Object.entries(cases)) {
    let why = null;
    try { why = fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
    R.ok(!why, cn + ': ' + why);
  }
  for (const mu of mutants || []) {
    if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
    /* `also`: more trees the mutant needs (a shell mutant plants the whole src: fixtures/h1.js plant) */
    const p = plant(mu.edits, mu.also || []);
    try {
      let why = null;
      try { why = cases[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
      R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
    } finally { p.done(); }
  }
  if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + (mutants || []).length + ' mutants caught');
  R.finish();
}
