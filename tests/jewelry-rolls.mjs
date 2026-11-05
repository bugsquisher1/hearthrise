#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/jewelry-rolls.mjs — CRAFTED JEWELRY'S ROLL, ON THE BENCH THE SERVER RUNS (src/data/jewelry.js; src/core/artisan.js rollJewel).
//
//   J1  THE ODDS ARE THE DESIGNER'S TABLE: at Crafting 15, 30, 60 and 99 a base job rolls Fine 5 / 6.5 / 9.5 / 12% and Hallmarked
//       0 / 0.04 / 0.07 / 0.10%; a gem roll is Hallmarked 10 / 13 / 19 / 25% and NEVER plain; between the levels the odds only climb.
//   J2  THE DICE MATCH THE ODDS: 40,000 rolls a level land inside four standard deviations of the table, every perk the piece can
//       roll comes up, a Hallmarked piece never carries one perk twice, and every made id is one of its job's outcomes.
//   J3  BOTH PATHS ON THE SERVER'S ENGINE (computeAccrual, the hr-accrue settle): a bench WATCHED (the town poll's short settles) and
//       one left with the BROWSER CLOSED (one long settle) both pay only the job's outcomes, one piece per 14 Bronze Bars spent, the
//       XP, and NO gold: a roll pays no bench tax. Each window rolls on its own server seed, so the same window rolls the same twice.
//   J4  A JOB THAT DOESN'T ROLL DRAWS WHAT IT ALWAYS DREW: the plain Crafting rows leave the stream untouched.
//   J5  THE MACHINERY IS SIZED BY FORMULA: each piece has a Fine row per perk, a Hallmarked row per pair, a Hallmark offer per
//       (Fine, other perk), and the server's bench-tax rows hold no rolled job (tools/gen-bench-tax.mjs rowsOf).
//
//   node tests/jewelry-rolls.mjs            the guard
//   node tests/jewelry-rolls.mjs --mutate   each claim driven red by a planted defect in a copy of the tree
//
// mutant-anchors: src/core/artisan.js src/data/jewelry.js src/data/bench-tax.js
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { ROOT, plant } from './hunt-core/fixtures/h1.js';
import { isMain } from './_is-main.mjs';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];

async function load(root) {
  const imp = (p, v = V) => import(pathToFileURL(join(root, p)).href + v);
  return {
    J: await imp('src/data/jewelry.js'), A: await imp('src/core/artisan.js'), R: await imp('src/core/rng.js'),
    XP: await imp('src/core/xp.js'), RC: await imp('src/data/recipes.js'), ITEMS: (await imp('src/data/items.js')).ITEMS,
    /* the edge's own modules, as the settle imports them (no ?v=: supabase/functions has none) */
    AC: await imp('supabase/functions/hr-accrue/accrual.js', ''), CAT: await imp('supabase/functions/hr-accrue/catalogue.js', ''),
    BT: await imp('tools/gen-bench-tax.mjs', ''),
  };
}

const TABLE = { base: { 15: [500, 0], 30: [650, 4], 60: [950, 7], 99: [1200, 10] }, gem: { 15: [9000, 1000], 30: [8700, 1300], 60: [8100, 1900], 99: [7500, 2500] } };

const claims = {
  J1(M) {
    for (const [kind, rows] of Object.entries(TABLE)) {
      for (const [lv, [fine, hall]] of Object.entries(rows)) {
        const o = M.J.rollOdds(kind, Number(lv));
        if (o.fine !== fine || o.hallmarked !== hall) return `${kind} at Crafting ${lv} reads Fine ${o.fine}, Hallmarked ${o.hallmarked} per 10,000, not ${fine}, ${hall}`;
        if (kind === 'gem' && o.plain !== 0) return `a gem roll at Crafting ${lv} can make a plain piece (${o.plain} per 10,000)`;
      }
      let last = null;
      for (let lv = 15; lv <= 99; lv++) {
        const o = M.J.rollOdds(kind, lv);
        if (last && (o.hallmarked < last.hallmarked || (kind === 'base' && o.fine < last.fine))) return `${kind}: the odds fall from Crafting ${lv - 1} to ${lv}`;
        last = o;
      }
    }
    return null;
  },
  J2(M) {
    const jobs = M.RC.ARTISAN_RECIPES.crafting.filter((r) => r.roll);
    if (jobs.length < 2) return 'no rolled Crafting jobs';
    for (const r of jobs) {
      for (const lv of [15, 30, 60, 99]) {
        const rng = M.R.createRng(0x1e3e1 + lv), n = 40000, got = { plain: 0, fine: 0, hallmarked: 0 }, perks = new Set();
        for (let i = 0; i < n; i++) {
          const o = M.A.rollJewel(r, lv, rng);
          got[o.grade]++;
          o.perks.forEach((p) => perks.add(p));
          if (new Set(o.perks).size !== o.perks.length) return `${r.id}: a Hallmarked piece carries one perk twice (${o.id})`;
          if (!r.outcomes.includes(o.id)) return `${r.id}: made ${o.id}, which is not one of its outcomes`;
        }
        const odds = M.J.rollOdds(r.roll, lv);
        for (const g of ['fine', 'hallmarked', 'plain']) {
          const p = odds[g] / M.J.ODDS_SCALE, sd = Math.sqrt(n * p * (1 - p)), want = n * p;
          if (Math.abs(got[g] - want) > 4 * sd + 1) return `${r.id} at Crafting ${lv}: ${got[g]} ${g} of ${n}, the table says ${Math.round(want)} (sd ${sd.toFixed(1)})`;
        }
        const can = M.J.perksFor(r.output);
        if (lv >= 30 && can.some((p) => !perks.has(p))) return `${r.id} at Crafting ${lv}: never rolled ${can.filter((p) => !perks.has(p)).join(', ')}`;
      }
    }
    return null;
  },
  J3(M) {
    const job = M.RC.ARTISAN_RECIPES.crafting.find((r) => r.roll === 'base');
    const per = job.inputs.bronze_bar;
    const T0 = Date.UTC(2026, 10, 5, 12, 0, 0);
    const skills = { crafting: M.XP.skillXpForLevel('crafting', 60) };
    const call = (fromMs, toMs, inventory, seed) => M.AC.computeAccrual({
      userId: '00000000-0000-4000-8000-00000000e301', slot: 0, nowMs: toMs, accruedToMs: fromMs, activeSinceMs: T0,
      activeKind: 'artisan', activeId: job.id, capMs: 12 * 3600000, seed, hp: 60, maxHp: 60, gold: 0,
      skills, equipment: {}, inventory, autoEatEnabled: false, autoEatFood: null, autoEatPct: 0, toolCarry: {}, perks: null,
      unlockedRecipes: {}, items: M.ITEMS, monsters: {}, nodes: M.CAT.GATHER_NODES, recipes: M.CAT.ARTISAN_RECIPES_ALL,
    });
    /* THE DELTA'S SHAPE: what one settle pays. */
    const read = (out) => {
      const d = out && out.delta;
      if (!d) return { items: {}, gold: 0, xp: 0, taxed: false };
      return { items: d.items || {}, gold: d.gold || 0, xp: (d.xp || {}).crafting || 0, taxed: Object.prototype.hasOwnProperty.call(d, 'bench_tax') };
    };
    const tally = (acc, r) => { for (const [id, q] of Object.entries(r.items)) acc.items[id] = (acc.items[id] || 0) + q; acc.gold += r.gold; acc.xp += r.xp; acc.taxed = acc.taxed || r.taxed; return acc; };
    const zero = () => ({ items: {}, gold: 0, xp: 0, taxed: false });
    const bars = per * 300;
    /* CLOSED: one settle across two hours. */
    const closed = read(call(T0, T0 + 2 * 3600000, { bronze_bar: bars }, 0x7a11));
    /* WATCHED: the town poll's settles, each on its own seed, the bag carried between them. */
    let bag = { bronze_bar: bars }, watched = zero();
    for (let t = T0, i = 0; t < T0 + 2 * 3600000; t += 60000, i++) {
      const r = read(call(t, t + 60000, bag, 0x5000 + i));
      watched = tally(watched, r);
      bag = Object.assign({}, bag);
      for (const [id, q] of Object.entries(r.items)) { bag[id] = (bag[id] || 0) + q; if (bag[id] <= 0) delete bag[id]; }
    }
    for (const [why, r] of [['closed', closed], ['watched', watched]]) {
      const spent = -(r.items.bronze_bar || 0);
      const made = Object.entries(r.items).filter(([id]) => id !== 'bronze_bar');
      const pieces = made.reduce((a, [, q]) => a + q, 0);
      if (!(spent > 0) || spent % per !== 0) return `${why}: spent ${spent} Bronze Bars, not a whole number of jobs`;
      if (pieces !== spent / per) return `${why}: ${pieces} pieces for ${spent / per} jobs`;
      const stray = made.find(([id]) => !job.outcomes.includes(id));
      if (stray) return `${why}: paid ${stray[0]}, which the job can't make`;
      if (r.gold !== 0 || r.taxed) return `${why}: a rolled job moved gold (${r.gold}) or carried a bench tax`;
      if (!(r.xp > 0)) return `${why}: no Crafting XP`;
    }
    if (process.argv.includes('--verbose')) console.log('  J3 closed', JSON.stringify(closed.items), closed.xp, '| watched', JSON.stringify(watched.items), watched.xp);
    /* THE SAME WINDOW ROLLS THE SAME: a retried settle is the settle. */
    const again = read(call(T0, T0 + 2 * 3600000, { bronze_bar: bars }, 0x7a11));
    if (JSON.stringify(again.items) !== JSON.stringify(closed.items)) return 'the same window on the same seed rolled two different benches';
    return null;
  },
  J4(M) {
    for (const r of M.RC.ARTISAN_RECIPES.crafting.filter((x) => !x.roll && x.output && M.ITEMS[x.output] && M.ITEMS[x.output].type)) {
      const rng = M.R.createRng(99), fresh = M.R.createRng(99);
      const inv = {};
      for (const [id, q] of Object.entries(M.A.recipeInputs(r))) inv[id] = q;
      M.A.resolveArtisanAction(r, { skillId: 'crafting', inventory: inv, items: M.ITEMS, skillLevel: 99, rng });
      if (rng.next() !== fresh.next()) return `${r.id}, which does not roll, drew from the bench's stream`;
    }
    return null;
  },
  J5(M) {
    for (const plain of Object.keys(M.J.JEWEL_PIECES)) {
      const n = M.J.perksFor(plain).length;
      if (n < 2) return `${plain} can roll ${n} perk(s): a Hallmark needs two`;
      const fine = M.J.gradeRows(plain, 'fine').length, hall = M.J.gradeRows(plain, 'hallmarked').length;
      if (fine !== n || hall !== (n * (n - 1)) / 2) return `${plain}: ${fine} Fine and ${hall} Hallmarked rows for ${n} perks`;
      if (M.J.HALLMARK_OFFERS.filter((o) => M.ITEMS[o.from].jewelBase === plain).length !== n * (n - 1)) return `${plain}: the Hallmark offers are not one per Fine row and other perk`;
    }
    const taxed = M.BT.rowsOf().filter((row) => M.RC.ARTISAN_RECIPES.crafting.some((r) => r.id === row.recipe && r.roll));
    if (taxed.length) return 'the bench tax charges a rolled job: ' + taxed.map((r) => r.recipe).join(', ');
    return null;
  },
};

const MUTANTS = [
  { claim: 'J1', name: 'a gem roll can come out plain', edits: [['src/data/jewelry.js', "const fine = kind === 'gem' ? ODDS_SCALE - hallmarked : at('fine');", "const fine = kind === 'gem' ? ODDS_SCALE - hallmarked - 100 : at('fine');"]] },
  { claim: 'J1', name: 'the base Fine odds at Crafting 30 read 7%', edits: [['src/data/jewelry.js', 'fine: Object.freeze([500, 650, 950, 1200])', 'fine: Object.freeze([500, 700, 950, 1200])']] },
  { claim: 'J2', name: 'the grade ignores the odds\' Hallmarked band', edits: [['src/core/artisan.js', "const grade = u < odds.hallmarked ? 'hallmarked' :", "const grade = u < 2 * odds.hallmarked ? 'hallmarked' :"]] },
  { claim: 'J2', name: 'a Hallmarked piece may carry its first perk twice', edits: [['src/core/artisan.js', "const perks = [pool.splice(rng.int(0, pool.length - 1), 1)[0]];", "const perks = [pool[rng.int(0, pool.length - 1)]];"]] },
  { claim: 'J3', name: 'the roll reads the wall clock, so the same window rolls twice', edits: [['src/core/artisan.js', 'const u = rng.next() * ODDS_SCALE;', 'const u = Math.random() * ODDS_SCALE;']] },
  { claim: 'J3', name: 'a roll makes a grade from another piece', edits: [['src/core/artisan.js', "  if (grade === 'plain') return { id: plain, grade, perks: [] };", "  if (grade === 'plain') return { id: 'ruby_signet', grade, perks: [] };"]] },
  { claim: 'J4', name: 'every Crafting job rolls a draw', edits: [['src/core/artisan.js', 'const rolled = recipe.roll ? rollJewel(recipe, c.skillLevel, rng) : null;', 'rng.next(); const rolled = recipe.roll ? rollJewel(recipe, c.skillLevel, rng) : null;']] },
  { claim: 'J5', name: 'a rolled job pays the bench tax', edits: [['src/data/bench-tax.js', 'export const benchTaxed = (recipe) => !!(recipe && recipe.output && !recipe.roll);', 'export const benchTaxed = (recipe) => !!(recipe && recipe.output);']] },
];

async function run(M) {
  const fails = [];
  for (const [k, fn] of Object.entries(claims)) {
    let why;
    try { why = fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
    if (why) fails.push(k + ' ' + why);
  }
  return fails;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--mutate')) {
    let missed = 0;
    for (const mu of MUTANTS) {
      const p = plant(mu.edits, ['supabase/functions/hr-accrue', 'tools/gen-bench-tax.mjs', 'tests/_is-main.mjs']);
      try {
        /* A planted tree that can't load is the harness's failure, never a catch. */
        let M;
        try { M = await load(p.root); } catch (e) { console.error('jewelry-rolls --mutate: HARNESS ' + mu.name + ': ' + e.message); process.exit(2); }
        let why;
        try { why = claims[mu.claim](M); } catch (e) { why = 'threw ' + e.message; }
        if (why) console.log('  CAUGHT  ' + mu.name + ' -> ' + mu.claim + ': ' + why);
        else { console.error('  MISSED  ' + mu.name + ' (' + mu.claim + ')'); missed++; }
      } finally { p.done(); }
    }
    if (missed) { console.error(`jewelry-rolls --mutate: ${missed} of ${MUTANTS.length} missed`); process.exit(1); }
    console.log(`jewelry-rolls --mutate: ${MUTANTS.length} mutants, 0 missed`);
  } else {
    const fails = await run(await load(ROOT));
    if (fails.length) { console.error('jewelry-rolls: RED\n' + fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1); }
    console.log('jewelry-rolls: OK — the designer\'s odds, dice that match them, both bench paths on the server\'s settle with no gold moved, no draw on an unrolled job, the rows by formula');
  }
}
