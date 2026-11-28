// ============================================================================
// tests/recipe-yield-guard.mjs — THE AMMO LADDER'S FAUCET GUARD (was the recipe faucet guard).
//
// WHY THIS EXISTS (2026-08-18, reported by Xarnathos as "when you create
// ammunition you get 500-ish arrows per action instead of 1").
//
// The 500 was RIGHT. The investigation found something else underneath it.
//
// `iron_arrows` predates the b343 ammo ladder and its book value was never
// rebased when that ladder priced every arrow at v 1-12. It sat at v:60 — five
// times the tier-7 mythic arrow, on a rung gating at level 20. And the vendor
// paid FULL BOOK VALUE for a non-raw item, so a batch of fifty turned 180 g of
// input into 3,000 g every 3.5 s: 16.7x input value, ~2.9 MILLION gold/hour.
//
// ── CHECKS 1 AND 2 RETIRED WITH THE BENCH (lane/bench-cut-data, 2026-11-28; 09-crafting.md 4.17) ──
// The quantity cap and the batch faucet ratio read the bench's recipe rows (ARTISAN_RECIPES outputQty, the
// fletch_* batches of fifty). The bench is cut: the one artisan row left is the hearth's fuel run, which makes
// no item, and a job makes at most one good an attempt (two on a gather at a yield past 1, src/core/trades.js
// settleJob). A job good's sale is capped at its inputs' sale plus the floor's pay for its work
// (src/core/trades.js jobSaleBounds, the edge's vendorPriceOf; S-33), held by tests/vendor-shop-arbitrage.mjs,
// so the faucet these two checks guarded has no row left to open it. Their subject was the bench, so they
// retire (CLAUDE.md 3.6). CHECK 3 is a unique catch and stays: it reads the items, not the recipes.
//
// ── CHECK 3: THE AMMO LADDER (the specific regression) ─────────────────────
// Every ammo-slot item's book value must sit inside the ladder's band, measured
// as what the slot costs to run (gold per swing).
//
// ── CHECK 4: NOTHING MADE IS FREE TO SPEND (lane/bench-cut-data-guards, 2026-11-28) ──
// Every ammo item burns more than nothing a shot (`ammoPerShot` > 0) but the ruled free rungs (FREE_RUNGS), and
// every family and tier of rune is on the table to be judged. Until the bench cut tests/w0e's R1 held this over
// every made rune. The cut left one rune checked (Chalked Fire), so a free Rupture ladder passed every guard.
//
//   node tests/recipe-yield-guard.mjs            → run standalone
//   node tests/recipe-yield-guard.mjs --mutate   → prove the guard sees failure
// ============================================================================

import { join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

/* THE FREE RUNGS: an ammo item a shot may spend nothing of, each with its ruling. A new one is the designer's, never a default. */
export const FREE_RUNGS = Object.freeze({
  bronze_arrows: 'designer 2026-10-31 (PRIORITY_BOARD Decisions, src/data/slot-ladders.js): a basic attack costs nothing you can run out of',
});

/* What the slot costs to run at the ladder's top: dawn_whetstone, the tier-7 ceiling, at 19.80 g a swing. */
export const MAX_GOLD_PER_SWING = 20;

export async function recipeYieldGuard(overrides) {
  const { ITEMS } = overrides?.ITEMS ? { ITEMS: overrides.ITEMS } : await imp('src/data/items.js');
  const { RUNE_TIERS, runeId } = await imp('src/data/runes.js');
  const { CRAFTED_RUNE_FAMILIES } = await imp('src/data/stonecraft.js');
  const problems = [];
  let ammo = 0, runes = 0;

  // ── CHECK 4: every family and tier of rune is an ammo item, so the loop below judges it.
  for (const family of CRAFTED_RUNE_FAMILIES) for (const t of RUNE_TIERS) {
    const id = runeId(family, t.tier), def = ITEMS[id];
    if (!def || def.slot !== 'ammo') problems.push(`${id}: no ammo item carries this rune (${family}, tier ${t.tier}), so nothing judges what a cast spends of it.`);
    else runes++;
  }

  // ── CHECK 3: the ammo ladder, measured in GOLD PER SWING.
  /* The first draft of this check compared BOOK VALUE against the top arrow
     (v:12) and went red on nine whetstones. That draft was wrong, and the way
     it was wrong is worth keeping: the `ammo` slot holds THREE ladders — arrows
     and runes at `ammoPerShot: 1`, whetstones at 0.02 (one honing per fifty
     swings) — so a whetstone is legitimately ~50x an arrow's unit price and a
     flat price ceiling cannot express the invariant.

     What is actually comparable is what the slot costs to RUN: `v x ammoPerShot`
     is monotonic and tight, 0.00 (the free tier-1 rungs) to 19.80 (dawn_whetstone,
     tier 7), and the shipped defect stood out at **60.00 g/swing**, three times
     the most expensive consumable in the game. One number, all three ladders. */
  for (const [id, def] of Object.entries(ITEMS)) {
    if (!def || def.slot !== 'ammo') continue;
    ammo++;
    if (!('ammoPerShot' in def)) {
      /* ammo.js treats a missing field as inert, which is the safe direction for COMBAT. It is not safe for the ECONOMY: an
         ammo item with no burn is an infinite stack. Every ammo row declares it, so this stays an assertion. */
      problems.push(`${id}: an ammo-slot item that does not declare \`ammoPerShot\`. `
        + `Declare it (0 is the ruled free rungs' alone: FREE_RUNGS).`);
      continue;
    }
    /* CHECK 4: free to spend is an infinite stack, so only a ruled rung is */
    const free = Object.prototype.hasOwnProperty.call(FREE_RUNGS, id);
    if (!free && !(Number(def.ammoPerShot) > 0)) problems.push(`${id}: spends ${def.ammoPerShot} a shot: one would last forever, and no ruling frees it (FREE_RUNGS).`);
    if (free && Number(def.ammoPerShot) !== 0) problems.push(`${id}: a ruled free rung that spends ${def.ammoPerShot} a shot: delete its FREE_RUNGS row.`);
    const perSwing = (Number(def.v) || 0) * (Number(def.ammoPerShot) || 0);
    if (perSwing > MAX_GOLD_PER_SWING) {
      problems.push(`${id}: ${perSwing.toFixed(2)} g/swing (v ${def.v} x ammoPerShot `
        + `${def.ammoPerShot}) exceeds the ladder ceiling of ${MAX_GOLD_PER_SWING} `
        + `(dawn_whetstone, 19.80): an off-ladder consumable is a gold faucet the moment a job makes it.`);
    }
  }

  if (!runes) problems.push('no rune on the table: the rune check judged nothing.');
  for (const id of Object.keys(FREE_RUNGS)) if (!ITEMS[id]) problems.push(`${id}: a FREE_RUNGS row for an item that left ITEMS.`);

  return { problems, note: `${ammo} ammo rows, ${runes} runes · ladder ceiling ${MAX_GOLD_PER_SWING} g a swing` };
}

/* ── THE GUARD, GRADED ──────────────────────────────────────────────────────
   A probe that cannot demonstrate it sees failure is treated as BROKEN, not as a pass. Each mutation below is a real defect class,
   replanted. */
export async function recipeYieldMutationGuard() {
  const { ITEMS } = await imp('src/data/items.js');
  const problems = [];
  const cloneI = () => JSON.parse(JSON.stringify(ITEMS));

  const control = await recipeYieldGuard();
  if (control.problems.length) {
    return { problems: [`the guard is RED before any mutation: ${control.problems[0]}`], note: '' };
  }

  const mutations = [
    ['the real b371 defect: iron_arrows back at v:60 (60 g a swing)', async () => {
      const I = cloneI(); I.iron_arrows.v = 60;
      return recipeYieldGuard({ ITEMS: I });
    }],
    ['an off-ladder ammo item (the class, not the instance)', async () => {
      const I = cloneI(); I.steel_arrows.v = 400;
      return recipeYieldGuard({ ITEMS: I });
    }],
    ['an ammo item with no burn (an infinite stack)', async () => {
      const I = cloneI(); delete I.rune_whetstone.ammoPerShot;
      return recipeYieldGuard({ ITEMS: I });
    }],
  ];

  /* CHECK 4's mutants: every family and tier of rune made free in turn, then one lost from the table (each names its own item) */
  const { RUNE_TIERS, runeId } = await imp('src/data/runes.js');
  const { CRAFTED_RUNE_FAMILIES } = await imp('src/data/stonecraft.js');
  const named = [];
  for (const family of CRAFTED_RUNE_FAMILIES) {
    for (const t of RUNE_TIERS) named.push([`a free ${t.name} ${family} rune`, runeId(family, t.tier), (I, id) => { I[id].ammoPerShot = 0; }]);
    named.push([`a ${family} rune with no row`, runeId(family, 1), (I, id) => { delete I[id]; }]);
  }
  named.push(['a rune off the ammo slot (nothing judges it)', 'graven_ice_rune', (I, id) => { delete I[id].slot; }],
    ['a rune that pays back a shot', 'carved_water_rune', (I, id) => { I[id].ammoPerShot = -1; }],
    ['a free arrow no ruling frees', 'iron_arrows', (I, id) => { I[id].ammoPerShot = 0; }],
    ['a free whetstone no ruling frees', 'coarse_whetstone', (I, id) => { I[id].ammoPerShot = 0; }],
    ['the ruled free rung charges a shot and stays listed', 'bronze_arrows', (I, id) => { I[id].ammoPerShot = 1; }]);
  for (const [label, id, plant] of named) mutations.push([label, async () => {
    const I = cloneI(); plant(I, id);
    const r = await recipeYieldGuard({ ITEMS: I });
    return { problems: r.problems.filter((p) => p.startsWith(id + ':')) };
  }]);
  if (CRAFTED_RUNE_FAMILIES.length < 6) problems.push(`only ${CRAFTED_RUNE_FAMILIES.length} rune families to mutate: the family mutants went hollow`);

  for (const [label, run] of mutations) {
    const res = await run();
    if (!res.problems.length) problems.push(`MUTATION NOT DETECTED — ${label}`);
  }

  return { problems, note: `${mutations.length} mutations, each detected` };
}

if (isMain(import.meta.url)) {
  const mutate = process.argv.includes('--mutate');
  const { problems, note } = mutate ? await recipeYieldMutationGuard() : await recipeYieldGuard();
  if (problems.length) {
    console.error(`\nrecipe-yield-guard FAILED:\n  · ${problems.join('\n  · ')}\n`);
    process.exit(1);
  }
  console.log(`recipe-yield-guard: OK — ${note}`);
}
