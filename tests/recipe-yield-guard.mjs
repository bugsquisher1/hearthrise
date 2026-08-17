// ============================================================================
// tests/recipe-yield-guard.mjs — THE RECIPE FAUCET GUARD.
//
// WHY THIS EXISTS (2026-08-18, reported by Xarnathos as "when you create
// ammunition you get 500-ish arrows per action instead of 1").
//
// The 500 was RIGHT. The investigation found something else underneath it.
//
// `iron_arrows` predates the b343 ammo ladder and its book value was never
// rebased when that ladder priced every arrow at v 1-12. It sat at v:60 — five
// times the tier-7 mythic arrow, on a rung gating at level 20. And
// `vendorPriceOf` (supabase/functions/hr-accrue/catalogue.js) pays FULL BOOK
// VALUE for a non-raw item, so `craft_iron_arrows` turned 180 g of input into
// 3,000 g every 3.5 s:
//
//     16.7x input value  ·  ~2.9 MILLION gold/hour  ·  one player exhausts the
//     25,000,000/day server-wide gross-inflow budget (hr_day_budget_check) in
//     8.6 hours — through the SERVER-AUTHORITATIVE `vendor_sell` verb, with no
//     client forgery involved at all.
//
// ── THE GUARD THAT WAS ASKED FOR IS NOT THE GUARD THAT CATCHES THIS ─────────
// The brief asked for "no recipe output quantity may exceed a sane cap (50)".
// Stated plainly, because it is the load-bearing finding of this file: THAT
// CAP WOULD HAVE MISSED THIS BUG AND FAILED EIGHT CORRECT RECIPES.
//   · it misses it, because the faucet was at outputQty **50** — inside the cap;
//   · it false-fires on all seven `fletch_*` rungs and the fixed
//     `craft_iron_arrows`, whose 500/1000 batches are DERIVED from a measured
//     burn rate (~1,705 arrows/hour; 20,455 for a 12-hour F2P night — see the
//     fletching header in src/data/slot-ladders.js). A x15 batch would be 1,364
//     crafting actions to arm one night of ranged play.
// A quantity is not a faucet. **Quantity x unit value / input value** is. So
// this file ships BOTH checks and the second one is the one with teeth.
//
// ── CHECK 1: THE QUANTITY CAP (typo class) ─────────────────────────────────
// Catches a stray zero. Allowlisted batches must state a REASON, so the list
// stays a set of decisions rather than a place failures go to be silenced.
//
// ── CHECK 2: THE BATCH FAUCET RATIO (exploit class) ────────────────────────
// Scoped to outputQty > 1 DELIBERATELY. Measured across all 339 recipes, gear
// ratios reach 700x (`craft_voidweave_body`: 108 g of silk and essence into a
// 75,600 g robe) because gear is priced on POWER, not on materials. A global
// ratio guard is therefore a false-positive machine that everyone learns to
// ignore. Batch commodities are the class where the ratio MULTIPLIES, and they
// are the class the vendor turns into gold at scale.
//
// Both sides are measured with `vendorPriceOf`, not with raw `.v`, because the
// exploit is gather -> craft -> vendor and the vendor pays raw materials only
// 40%. This is the FAUCET measure, and it deliberately differs from the "book
// margin" the b222 castle-margin test in smoke-test.js asserts.
//
// ── CHECK 3: THE AMMO LADDER (the specific regression) ─────────────────────
// Every ammo-slot item's book value must sit inside the ladder's band, and the
// two copies of `iron_arrows` (src/data/items.js and the inline table in
// src/legacy.js) must agree — this repo has been burned by data double-copies.
//
//   node tests/recipe-yield-guard.mjs            → run standalone
//   node tests/recipe-yield-guard.mjs --mutate   → prove the guard sees failure
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

/* ── THE QUANTITY CAP ────────────────────────────────────────────────────── */
export const QTY_CAP = 50;

/* An allowlisted batch states WHY. A bare id list would let the next stray
   zero be waved through by whoever is unblocking a build at the time.

   ⚠ ADDING A ROW HERE IS NOT SUFFICIENT TO SHIP A BIG BATCH, and this cost was
     paid on 2026-08-18: raising `craft_iron_arrows` to 500 satisfied THIS file
     and was caught by tests/accrual-engine.mjs, because a 15-hour absence then
     moves 4,821,000 units of one item against the server's
     `c_max_item_delta = 1,000,000` — a clamp HONEST PLAY would trip, costing
     the player part of an absence through index.ts's degrade ladder. The seven
     `fletch_*` rungs clear it only via a named Security amnesty
     (`AMMO_CLAMP_BASELINE`, ruled 2026-08-16). So a new large batch needs BOTH
     a row here AND a Security ruling on that baseline. Two guards, two
     different questions: this one asks "is it a faucet", that one asks "does
     the server's own limiter survive it". */
export const QTY_ALLOW = Object.freeze({
  fletch_bronze_arrows:    'arrows: ~1,705/hr burn; 500 = ~41 actions per 12-hour night',
  fletch_barbed_arrows:    'arrows: as above',
  fletch_steel_arrows:     'arrows: as above',
  fletch_mithril_arrows:   'arrows: as above',
  fletch_rune_arrows:      'arrows: as above',
  fletch_emberhead_arrows: 'arrows: as above',
  fletch_dawnpoint_arrows: 'arrows: as above, x1000 at tier 7',
  bind_air_runes:          'runes: one cast per swing, same per-swing burn seam as ammo',
  bind_earth_runes:        'runes: as above',
  deepbind_earth:          'runes: as above',
  bind_water_runes:        'runes: as above',
  deepbind_water:          'runes: as above',
  bind_fire_runes:         'runes: as above',
  bind_chaos_runes:        'runes: as above',
  deepbind_chaos:          'runes: as above',
  bind_death_runes:        'runes: as above',
  bind_blood_runes:        'runes: as above',
  deepbind_blood:          'runes: as above',
});

/* ── THE BATCH FAUCET RATIO ──────────────────────────────────────────────── */
/* 5.0, not 3.0. The measured batch population runs 1.14x - 2.79x with a tail of
   stonemason dressing steps at 9.6-11x (below). 5.0 sits clear of every
   legitimate row and an order of magnitude under the 16.7x this guard was
   written for, so it fails loudly without needing constant retuning. */
export const RATIO_CAP = 5.0;

/* ⚠ NOT "known good" — KNOWN, AND FLAGGED. These pass the guard so the build is
   not held hostage to a balance decision that is the Game Designer's to make,
   but they are listed here rather than silently excluded so the next person to
   read this file sees them. Raised to the Game Designer 2026-08-18 alongside a
   larger finding this guard deliberately does not police: single-output GEAR
   recipes reach 700x (see the header). */
export const RATIO_ALLOW = Object.freeze({
  quarry_rubble:  'gathering step: no inputs, so the ratio is infinite by construction',
  quarry_granite: 'gathering step: as above',
  quarry_basalt:  'gathering step: as above',
  dress_rubble:   'REVIEW (game-designer): 11.0x, ~60k g/hr — stonemason dressing margin',
  dress_granite:  'REVIEW (game-designer): 10.6x, ~163k g/hr — as above',
  dress_basalt:   'REVIEW (game-designer): 9.6x, ~322k g/hr — as above',
});

/** Inputs, normalised across the two authored recipe shapes. */
export function inputsOf(r) {
  if (r.inputs && typeof r.inputs === 'object') return r.inputs;
  if (r.input) return { [r.input]: 1, ...(r.secondary || {}) };
  return {};
}

export async function recipeYieldGuard(overrides) {
  const { ITEMS } = overrides?.ITEMS ? { ITEMS: overrides.ITEMS } : await imp('src/data/items.js');
  const { ARTISAN_RECIPES } = overrides?.ARTISAN_RECIPES
    ? { ARTISAN_RECIPES: overrides.ARTISAN_RECIPES } : await imp('src/data/recipes.js');
  const { vendorPriceOf } = await imp('supabase/functions/hr-accrue/catalogue.js');

  const problems = [];
  let batches = 0;
  let n = 0;

  for (const [skill, list] of Object.entries(ARTISAN_RECIPES || {})) {
    for (const r of list || []) {
      if (!r || !r.id) continue;
      n++;
      const qty = Number(r.outputQty) || 1;

      // ── CHECK 1: the quantity cap.
      if (qty > QTY_CAP && !Object.prototype.hasOwnProperty.call(QTY_ALLOW, r.id)) {
        problems.push(`${skill}/${r.id}: outputQty ${qty} exceeds the cap of ${QTY_CAP} `
          + `and is not in QTY_ALLOW. If the batch is deliberate, add it WITH A REASON.`);
      }

      // ── CHECK 2: the batch faucet ratio.
      if (qty > 1) {
        batches++;
        if (Object.prototype.hasOwnProperty.call(RATIO_ALLOW, r.id)) continue;
        const cost = Object.entries(inputsOf(r))
          .reduce((s, [k, c]) => s + vendorPriceOf(ITEMS, k) * (Number(c) || 0), 0);
        const gross = vendorPriceOf(ITEMS, r.output) * qty;
        if (!(cost > 0)) {
          if (gross > 0) {
            problems.push(`${skill}/${r.id}: a batch of ${qty} with NO input value vendors for `
              + `${gross} g — an unbounded faucet. Allowlist it if it is a gathering step.`);
          }
          continue;
        }
        const ratio = gross / cost;
        if (ratio > RATIO_CAP) {
          const perHr = Math.round((gross - cost) * (3600000 / (Number(r.ms) || 3000)));
          problems.push(`${skill}/${r.id}: batch faucet ratio ${ratio.toFixed(2)}x exceeds `
            + `${RATIO_CAP}x (${cost} g of input -> ${gross} g at the vendor, `
            + `~${perHr.toLocaleString()} g/hour). Either the output's book value is wrong `
            + `or the batch is. This is the check that would have caught iron_arrows at 16.7x.`);
        }
      }
    }
  }

  // ── CHECK 3: the ammo ladder, measured in GOLD PER SWING.
  /* The first draft of this check compared BOOK VALUE against the top arrow
     (v:12) and went red on nine whetstones. That draft was wrong, and the way
     it was wrong is worth keeping: the `ammo` slot holds THREE ladders — arrows
     and runes at `ammoPerShot: 1`, whetstones at 0.02 (one honing per fifty
     swings) — so a whetstone is legitimately ~50x an arrow's unit price and a
     flat price ceiling cannot express the invariant.

     What is actually comparable is what the slot costs to RUN. Measured across
     all 31 ammo items, `v x ammoPerShot` is monotonic and tight:

         0.00 (the free tier-1 rungs)  ...  19.80 (dawn_whetstone, tier 7)

     and the shipped defect stands out immediately at **60.00 g/swing** — three
     times the most expensive consumable in the game, on a rung gating at level
     20. One number, all three ladders, no per-family special case. */
  const MAX_GOLD_PER_SWING = 20;   // dawn_whetstone, the tier-7 ceiling, at 19.80
  for (const [id, def] of Object.entries(ITEMS)) {
    if (!def || def.slot !== 'ammo') continue;
    if (!('ammoPerShot' in def)) {
      /* ammo.js treats a missing field as inert, which is the safe direction
         for COMBAT. It is not safe for the ECONOMY: an ammo item with no burn
         is an infinite stack, and if a batch recipe makes it and the vendor
         buys it, that is the faucet this file exists for. All 31 declare it
         today, so this stays an assertion rather than a warning. */
      problems.push(`${id}: an ammo-slot item that does not declare \`ammoPerShot\`. `
        + `Declare it (0 is a valid, deliberate value for a free tier-1 rung).`);
      continue;
    }
    const perSwing = (Number(def.v) || 0) * (Number(def.ammoPerShot) || 0);
    if (perSwing > MAX_GOLD_PER_SWING) {
      problems.push(`${id}: ${perSwing.toFixed(2)} g/swing (v ${def.v} x ammoPerShot `
        + `${def.ammoPerShot}) exceeds the ladder ceiling of ${MAX_GOLD_PER_SWING} `
        + `(dawn_whetstone, 19.80). The vendor pays non-raw items FULL book value, so an `
        + `off-ladder consumable is a gold faucet the moment a batch recipe makes it.`);
    }
  }

  // ── CHECK 3b: the double copy. src/legacy.js carries an inline ITEMS table.
  const legacy = await readFile(join(ROOT, 'src', 'legacy.js'), 'utf8');
  const m = legacy.match(/\n\s*iron_arrows:\s*\{([^}]*)\}/);
  if (!m) {
    problems.push('src/legacy.js no longer defines an inline `iron_arrows` — if the inline '
      + 'ITEMS table was removed on purpose, delete this check with it.');
  } else {
    const lv = m[1].match(/\bv:\s*([0-9.]+)/);
    const dv = Number(ITEMS.iron_arrows?.v);
    if (!lv || Number(lv[1]) !== dv) {
      problems.push(`iron_arrows book value has DIVERGED between its two copies: `
        + `src/legacy.js says ${lv ? lv[1] : '(none)'}, src/data/items.js says ${dv}. `
        + `Fix both or delete one.`);
    }
  }

  return {
    problems,
    note: `${n} recipes (${batches} batched) · qty cap ${QTY_CAP} · batch faucet cap ${RATIO_CAP}x`,
  };
}

/* ── THE GUARD, GRADED ──────────────────────────────────────────────────────
   The repo's rule (tests/rpc-resolution.mjs, tests/items-catalogue.mjs): a
   probe that cannot demonstrate it sees failure is treated as BROKEN, not as a
   pass. Each mutation below is the real shipped defect, replanted. */
export async function recipeYieldMutationGuard() {
  const { ITEMS } = await imp('src/data/items.js');
  const { ARTISAN_RECIPES } = await imp('src/data/recipes.js');
  const problems = [];

  const clone = () => JSON.parse(JSON.stringify(ARTISAN_RECIPES));
  const cloneI = () => JSON.parse(JSON.stringify(ITEMS));

  const control = await recipeYieldGuard();
  if (control.problems.length) {
    return { problems: [`the guard is RED before any mutation: ${control.problems[0]}`], note: '' };
  }

  const mutations = [
    ['the real b371 defect: iron_arrows back at v:60 (16.7x, ~2.9M g/hr)', async () => {
      const I = cloneI(); I.iron_arrows.v = 60;
      return recipeYieldGuard({ ITEMS: I });
    }],
    ['a stray zero: fletch_steel_arrows at outputQty 5000 is still allowlisted, so the RATIO must catch it', async () => {
      const R = clone();
      R.crafting.find((r) => r.id === 'fletch_steel_arrows').outputQty = 5000;
      return recipeYieldGuard({ ARTISAN_RECIPES: R });
    }],
    ['a NEW batch recipe over the qty cap with no allowlist entry', async () => {
      const R = clone();
      R.crafting.push({ id: '__mutant', inputs: { iron_bar: 1 }, output: 'iron_bar', outputQty: 999, ms: 3000 });
      return recipeYieldGuard({ ARTISAN_RECIPES: R });
    }],
    ['an off-ladder ammo item (the class, not the instance)', async () => {
      const I = cloneI(); I.steel_arrows.v = 400;
      return recipeYieldGuard({ ITEMS: I });
    }],
  ];

  for (const [label, run] of mutations) {
    const res = await run();
    if (!res.problems.length) problems.push(`MUTATION NOT DETECTED — ${label}`);
  }

  return { problems, note: `${mutations.length} mutations, each detected` };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const mutate = process.argv.includes('--mutate');
  const { problems, note } = mutate ? await recipeYieldMutationGuard() : await recipeYieldGuard();
  if (problems.length) {
    console.error(`\nrecipe-yield-guard FAILED:\n  · ${problems.join('\n  · ')}\n`);
    process.exit(1);
  }
  console.log(`recipe-yield-guard: OK — ${note}`);
}
