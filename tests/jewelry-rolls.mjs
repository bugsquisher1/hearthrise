#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/jewelry-rolls.mjs — CRAFTED JEWELRY'S ROLL, ON THE BENCH THE SERVER RUNS (src/data/jewelry.js; src/core/artisan.js rollJewel).
//
//   J1  THE ODDS ARE THE DESIGNER'S TABLE: at bench level 15, 30, 60 and 99 a base job rolls Fine 5 / 6.5 / 9.5 / 12% and Hallmarked
//       0 / 0.04 / 0.07 / 0.10%; a gem roll is Hallmarked 10 / 13 / 19 / 25% and NEVER plain; between the levels the odds only climb.
//   J2  THE DICE MATCH THE ODDS: 40,000 rolls a level land inside four standard deviations of the table, every perk the piece can
//       roll comes up, a Hallmarked piece never carries one perk twice, and every made id is one of its job's outcomes.
//   J3  BOTH PATHS ON THE SERVER'S ENGINE (computeAccrual, the hr-accrue settle): a bench WATCHED (the town poll's short settles) and
//       one left with the BROWSER CLOSED (one long settle) both pay only the job's outcomes, one piece per 14 Bronze Bars spent, the
//       XP, and NO gold: a roll pays no bench tax. Each window rolls on its own server seed, so the same window rolls the same twice
//       (the long window and every watched one, retried).
//   J4  A JOB THAT DOESN'T ROLL DRAWS WHAT IT ALWAYS DREW: the plain rows of every jeweler's bench (Smithing, Crafting) leave the stream untouched.
//   J6  THE END LINE SAYS WHAT THE DICE MADE: a watched run stops on "41 Banded Signet, 3 Fine (2 Keen, 1 Surge), 1 Hallmarked (...)".
//   J7  THE BROWSER NEVER GUESSES A GRADE: the town ticker counts a rolled job's actions as unsure, in no stack, until the server pays.
//   J8  A JEWEL'S GEM IS NAMED APART: no other item's name holds its word (the Road Garnet beside the mined Heartgarnet).
//   J9  THE LORE NAMES THE JOB: an input to a gem roll or the Hallmark reads the job's name, never the grades it may make.
//   J5  THE MACHINERY IS SIZED BY FORMULA: each rolling piece has a Fine row per perk, a Hallmarked row per pair, a Hallmark offer per
//       (Fine, other perk); a piece that ships plain has none; and the server's bench-tax rows hold no rolled job (tools/gen-bench-tax.mjs rowsOf).
//   The jobs sit on each piece's own bench (Tyler 2026-11-18: all jewelry is Smithing): the claims read the Banded Signet's on Smithing.
//   THE GUARANTEE LAYER (Tyler 2026-11-14, "with some items that can guarantee some things"; board 2026-11-15 (d)), dark behind jewel_guarantees:
//   J10 A GUARANTEE GUARANTEES: a perk gem's piece always carries its perk and a grade item's roll is always Hallmarked, at every level,
//       40,000 rolls each; the item sets in place of the tier's gem, on the piece's own bench; the sample holds a perk job, a grade job and both.
//   J3G BOTH PATHS FOR A GUARANTEE JOB: watched and closed on the server's settle, only its outcomes, each with its perk and grade, no gold.
//   J12 THE SWITCH IS THE SERVER'S: hr-accrue set_activity refuses a dark job (activity_unsupported, naming the switch) unless the envelope's
//       `features` (beside `state`) lists it, before anything settles; an open job never asks.
//   J13 DARK ROWS STAY DARK: no switched job in ARTISAN_RECIPES (item tips, skill unlocks, the bag, the bench tax); the bench offers one only
//       where the server's `features` list its switch.
//   J14 A JOB'S NAME SAYS ITS ITEM: a guarantee's words end in the item's catalogue name, and the jobs read as the sample's three.
//   J15 THE BENCH SAYS THE GUARANTEE AND THE ODDS at the hero's server level in the piece's skill: "Always Follow-through", "always Hallmarked".
//   J16 THE PLAIN CARD NAMES WHAT A GEM CAN ADD (post-140 audit C11): a plain crafted piece's card lists its bench's perks.
//   J17 A BOSS DROP'S CARD NAMES ITS GUARANTEE as a label ("Guarantees Follow-through (Banded Signet)"), only where the switch is on.
//   J18 PLAIN STATS HELP ALL THREE STYLES: every plain crafted jewel and the Shop's first jewelry carry Melee, Ranged and Magic attack, no crit.
//
//   node tests/jewelry-rolls.mjs            the guard
//   node tests/jewelry-rolls.mjs --mutate   each claim driven red by a planted defect in a copy of the tree
//
// mutant-anchors: src/core/artisan.js src/data/jewelry.js src/data/bench-tax.js src/shell/town-work.js src/shell/town-ticker.js src/shell/item-lore.js src/data/items.js src/data/slot-ladders.js src/data/recipes.js src/session/jewelry-sections.js src/shell/windows/work.js supabase/functions/hr-accrue/set-activity.js supabase/functions/hr-accrue/catalogue.js
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { ROOT, plant } from './hunt-core/fixtures/h1.js';
import { isMain } from './_is-main.mjs';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';

const V = sourceQuery(ROOT);

async function load(root) {
  const imp = (p, v = V) => import(pathToFileURL(join(root, p)).href + v);
  return {
    J: await imp('src/data/jewelry.js'), A: await imp('src/core/artisan.js'), R: await imp('src/core/rng.js'),
    XP: await imp('src/core/xp.js'), RC: await imp('src/data/recipes.js'), ITEMS: (await imp('src/data/items.js')).ITEMS,
    /* the edge's own modules, as the settle imports them (no ?v=: supabase/functions has none) */
    AC: await imp('supabase/functions/hr-accrue/accrual.js', ''), CAT: await imp('supabase/functions/hr-accrue/catalogue.js', ''),
    BT: await imp('tools/gen-bench-tax.mjs', ''), TW: await imp('src/shell/town-work.js'), TT: await imp('src/shell/town-ticker.js'), IL: await imp('src/shell/item-lore.js'),
    SA: await imp('supabase/functions/hr-accrue/set-activity.js', ''), JS: await imp('src/session/jewelry-sections.js'), WK: await imp('src/shell/windows/work.js'),
    PT: await imp('src/render/player-text.js'),
  };
}

const TABLE = { base: { 15: [500, 0], 30: [650, 4], 60: [950, 7], 99: [1200, 10] }, gem: { 15: [9000, 1000], 30: [8700, 1300], 60: [8100, 1900], 99: [7500, 2500] } };

const claims = {
  J1(M) {
    for (const [kind, rows] of Object.entries(TABLE)) {
      for (const [lv, [fine, hall]] of Object.entries(rows)) {
        const o = M.J.rollOdds(kind, Number(lv));
        if (o.fine !== fine || o.hallmarked !== hall) return `${kind} at level ${lv} reads Fine ${o.fine}, Hallmarked ${o.hallmarked} per 10,000, not ${fine}, ${hall}`;
        if (kind === 'gem' && o.plain !== 0) return `a gem roll at level ${lv} can make a plain piece (${o.plain} per 10,000)`;
      }
      let last = null;
      for (let lv = 15; lv <= 99; lv++) {
        const o = M.J.rollOdds(kind, lv);
        if (last && (o.hallmarked < last.hallmarked || (kind === 'base' && o.fine < last.fine))) return `${kind}: the odds fall from level ${lv - 1} to ${lv}`;
        last = o;
      }
    }
    return null;
  },
  J2(M) {
    /* every rolled job, the dark guarantee jobs too */
    const jobs = Object.values(M.RC.ARTISAN_RECIPES_EVERY).flat().filter((r) => r && r.roll);
    if (jobs.length < 2) return 'no rolled jobs';
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
          if (Math.abs(got[g] - want) > 4 * sd + 1) return `${r.id} at level ${lv}: ${got[g]} ${g} of ${n}, the table says ${Math.round(want)} (sd ${sd.toFixed(1)})`;
        }
        const can = M.J.perksFor(r.output);
        if (lv >= 30 && can.some((p) => !perks.has(p))) return `${r.id} at level ${lv}: never rolled ${can.filter((p) => !perks.has(p)).join(', ')}`;
      }
    }
    return null;
  },
  J3(M) {
    const job = M.RC.ARTISAN_RECIPES.smithing.find((r) => r.id === 'craft_banded_signet');
    if (!job || job.roll !== 'base') return 'the Banded Signet\'s rolled job is not on Smithing';
    const per = job.inputs.bronze_bar;
    const T0 = Date.UTC(2026, 10, 5, 12, 0, 0);
    const skills = { smithing: M.XP.skillXpForLevel('smithing', 60) };
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
      return { items: d.items || {}, gold: d.gold || 0, xp: (d.xp || {}).smithing || 0, taxed: Object.prototype.hasOwnProperty.call(d, 'bench_tax') };
    };
    const tally = (acc, r) => { for (const [id, q] of Object.entries(r.items)) acc.items[id] = (acc.items[id] || 0) + q; acc.gold += r.gold; acc.xp += r.xp; acc.taxed = acc.taxed || r.taxed; return acc; };
    const zero = () => ({ items: {}, gold: 0, xp: 0, taxed: false });
    const bars = per * 300;
    /* CLOSED: one settle across two hours. */
    const closed = read(call(T0, T0 + 2 * 3600000, { bronze_bar: bars }, 0x7a11));
    /* WATCHED: the town poll's settles, each on its own seed, the bag carried between them. */
    let bag = { bronze_bar: bars }, watched = zero();
    const windows = [];
    for (let t = T0, i = 0; t < T0 + 2 * 3600000; t += 60000, i++) {
      const held = Object.assign({}, bag);
      const r = read(call(t, t + 60000, bag, 0x5000 + i));
      windows.push([t, held, 0x5000 + i, JSON.stringify(r.items)]);
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
      if (!(r.xp > 0)) return `${why}: no Smithing XP`;
    }
    if (process.argv.includes('--verbose')) console.log('  J3 closed', JSON.stringify(closed.items), closed.xp, '| watched', JSON.stringify(watched.items), watched.xp);
    /* THE SAME WINDOW ROLLS THE SAME: a retried settle is the settle. The long window alone is not enough: a grade drawn off
       the bench's seed (Math.random) still takes its perks from the seeded stream, so two runs with the same Fine count pay the
       same bag: that mutant passed the long window alone in 5 runs of 300 (release run 42519810819 missed it). Every watched
       window is retried too, 120 of ~2.5 jobs each: the two together missed it in 0 runs of 300. */
    const again = read(call(T0, T0 + 2 * 3600000, { bronze_bar: bars }, 0x7a11));
    if (JSON.stringify(again.items) !== JSON.stringify(closed.items)) return 'the same window on the same seed rolled two different benches';
    for (const [t, held, seed, items] of windows) {
      const twice = JSON.stringify(read(call(t, t + 60000, Object.assign({}, held), seed)).items);
      if (twice !== items) return `the watched window at +${(t - T0) / 60000} min on the same seed rolled ${items}, then ${twice}`;
    }
    return null;
  },
  J4(M) {
    for (const skill of M.J.JEWEL_SKILLS) {
      for (const r of M.RC.ARTISAN_RECIPES[skill].filter((x) => !x.roll && x.output && M.ITEMS[x.output] && M.ITEMS[x.output].type)) {
        const rng = M.R.createRng(99), fresh = M.R.createRng(99);
        const inv = {};
        for (const [id, q] of Object.entries(M.A.recipeInputs(r))) inv[id] = q;
        M.A.resolveArtisanAction(r, { skillId: skill, inventory: inv, items: M.ITEMS, skillLevel: 99, rng });
        if (rng.next() !== fresh.next()) return `${r.id}, which does not roll, drew from the bench's stream`;
      }
    }
    return null;
  },
  J6(M) {
    /* THE END LINE SAYS WHAT THE DICE MADE (the spec's bulk report), from two envelopes' bags. */
    const outs = { banded_signet: 2, banded_signet_keen: 0, banded_signet_surge: 0, banded_signet_follow: 0, banded_signet_keen_surge: 0, banded_signet_keen_follow: 1, banded_signet_surge_follow: 0 };
    const got = M.TW.rolledWords(outs, { banded_signet: 43, banded_signet_keen: 2, banded_signet_surge: 1, banded_signet_keen_follow: 2 }).join(', ');
    const want = '41 Banded Signet, 3 Fine (2 Keen, 1 Surge), 1 Hallmarked (Keen and Follow-through)';
    return got === want ? null : 'a rolled run ends "' + got + '", not "' + want + '"';
  },
  J7(M) {
    /* THE BROWSER NEVER GUESSES A GRADE: the town ticker counts a rolled job's actions as unsure, in no stack, until the server pays. */
    const row = M.RC.ARTISAN_RECIPES.smithing.find((r) => r.id === 'set_banded_signet');
    const t0 = Date.UTC(2026, 10, 5, 12, 0, 0), at = new Date(t0).toISOString();
    const tick = M.TT.predictTown({ w: { kind: 'artisan', id: row.id, skill: 'smithing', row },
      state: { active_kind: 'artisan', active_id: row.id, accrued_to: at, active_since: at }, nowMs: t0 + 20000,
      skills: { smithing: { xp: M.XP.skillXpForLevel('smithing', 30) } }, inventory: { banded_signet: 5, road_carnelian: 5 }, equipment: {} });
    if (!tick || !(tick.unsure > 0)) return '20 s of a gem roll predicted ' + JSON.stringify(tick);
    const guessed = row.outcomes.concat([row.output]).filter((id) => (tick.items[id] || 0) > 0);
    return guessed.length ? 'the ticker put a guessed grade in the bag: ' + guessed.join(', ') : null;
  },
  J8(M) {
    /* A JEWEL'S GEM IS NAMED APART (designer 2026-11-05): the Road Garnet beside the mined Heartgarnet, both red, read as one gem, and a
       player holding both would set the wrong one. No other item's name holds a tier gem's own word. */
    for (const t of Object.values(M.J.JEWEL_TIERS)) {
      const gem = M.ITEMS[t.gem];
      if (!gem) continue;
      const word = gem.n.split(' ').pop().toLowerCase();
      /* a WORN piece is never set as a gem, so the ring the gem is named into (the Seam Jasper Band, the plan's name) can't be mistaken for it */
      const twin = Object.entries(M.ITEMS).find(([id, it]) => id !== t.gem && it && typeof it.n === 'string' && !it.slot && it.n.toLowerCase().includes(word));
      if (twin) return t.gem + ' (' + gem.n + ') shares "' + word + '" with ' + twin[0] + ' (' + twin[1].n + ')';
    }
    return null;
  },
  J9(M) {
    /* AN INPUT TO A GEM ROLL OR THE HALLMARK NAMES THE JOB, NEVER THE GRADES IT MAY MAKE (designer 2026-11-05, the three lines as ruled). */
    const want = {
      road_carnelian: 'Used in Smithing: Set a Road Carnelian in a Banded Signet, Set a Road Carnelian in Fang Studs, and the Hallmark',
      banded_signet: 'Used in Smithing: Set a Road Carnelian in a Banded Signet',
      banded_signet_keen: 'Used in Smithing: the Hallmark',
      banded_signet_keen_follow: 'Used in Smithing: the reforge',
    };
    for (const [id, line] of Object.entries(want)) {
      const got = M.IL.usesOf(id).find((l) => /^Used in Smithing/.test(l)) || '';
      if (got !== line) return id + ' reads "' + got + '", not "' + line + '"';
    }
    return null;
  },
  J5(M) {
    for (const plain of Object.keys(M.J.JEWEL_PIECES)) {
      const n = M.J.perksFor(plain).length;
      if (n === 0) {
        if (M.J.gradeRows(plain, 'fine').length || M.J.gradeRows(plain, 'hallmarked').length) return `${plain} ships plain but has graded rows`;
        continue;
      }
      if (n < 2) return `${plain} can roll ${n} perk(s): a Hallmark needs two`;
      const fine = M.J.gradeRows(plain, 'fine').length, hall = M.J.gradeRows(plain, 'hallmarked').length;
      if (fine !== n || hall !== (n * (n - 1)) / 2) return `${plain}: ${fine} Fine and ${hall} Hallmarked rows for ${n} perks`;
      if (M.J.HALLMARK_OFFERS.filter((o) => M.ITEMS[o.from].jewelBase === plain).length !== n * (n - 1)) return `${plain}: the Hallmark offers are not one per Fine row and other perk`;
    }
    const taxed = M.BT.rowsOf().filter((row) => Object.values(M.RC.ARTISAN_RECIPES).flat().some((r) => r && r.id === row.recipe && r.roll));
    if (taxed.length) return 'the bench tax charges a rolled job: ' + taxed.map((r) => r.recipe).join(', ');
    return null;
  },
  J10(M) {
    /* A GUARANTEE GUARANTEES (Tyler 2026-11-14): a perk gem's piece ALWAYS carries its perk and a grade item's roll is ALWAYS Hallmarked, at
       every level, 40,000 rolls each; the item sets in place of the tier's gem, on the piece's own bench; the sample holds a perk job, a
       grade job and both; and a guarantee on a piece that ships plain, or naming a perk its piece can't roll, is refused at load. */
    const jobs = guaranteeJobs(M);
    const kinds = new Set(jobs.map((r) => (r.perk ? 'perk' : '') + (r.roll === 'seal' ? 'seal' : '')));
    if (!['perk', 'seal', 'perkseal'].every((k) => kinds.has(k))) return 'the guarantee jobs are not a perk job, a grade job and both: ' + [...kinds].join(', ');
    for (const r of jobs) {
      const g = Object.entries(M.J.JEWEL_GUARANTEES).filter(([id]) => r.inputs[id]).map(([, x]) => x);
      if (r.perk && !g.some((x) => x.perk === r.perk)) return `${r.id} guarantees ${r.perk}, which none of its items names`;
      if ((r.roll === 'seal') !== g.some((x) => x.grade === 'hallmarked')) return `${r.id} is a ${r.roll} roll, but its items say otherwise`;
      if (r.inputs[M.J.JEWEL_TIERS[M.ITEMS[r.output].tier].gem]) return `${r.id} still takes the tier's gem: a guarantee sets in its place`;
      /* IT COSTS THE SAME AS THE GEM JOB (designer 2026-11-18: the shard in place of the gem it would cut into): the gem job's inputs with the
         gem swapped for the boss drop(s), and the gem job's time, XP and level */
      const gemJob = Object.values(M.RC.ARTISAN_RECIPES_EVERY).flat().find((x) => x.roll === 'gem' && !x.switch && x.output === r.output);
      const tierGem = M.J.JEWEL_TIERS[M.ITEMS[r.output].tier].gem;
      const want = Object.assign({}, gemJob.inputs); delete want[tierGem];
      for (const id of Object.keys(r.inputs)) if (M.J.JEWEL_GUARANTEES[id]) want[id] = gemJob.inputs[tierGem];
      if (JSON.stringify(Object.entries(r.inputs).sort()) !== JSON.stringify(Object.entries(want).sort()) || r.ms !== gemJob.ms || r.xp !== gemJob.xp || r.req !== gemJob.req)
        return `${r.id} does not cost what ${gemJob.id} costs with its gem swapped: ${JSON.stringify([r.inputs, r.ms, r.xp, r.req])} vs ${JSON.stringify([want, gemJob.ms, gemJob.xp, gemJob.req])}`;
      const bench = Object.keys(M.RC.ARTISAN_RECIPES_EVERY).find((s) => M.RC.ARTISAN_RECIPES_EVERY[s].includes(r));
      if (bench !== M.J.JEWEL_PIECES[r.output].skill) return `${r.id} sits on ${bench}, not ${r.output}'s own bench (${M.J.JEWEL_PIECES[r.output].skill})`;
      for (const lv of [1, 15, 30, 60, 99]) {
        const rng = M.R.createRng(0x6a7e + lv);
        for (let i = 0; i < 40000; i++) {
          const o = M.A.rollJewel(r, lv, rng);
          if (r.perk && !o.perks.includes(r.perk)) return `${r.id} at level ${lv} made ${o.id}, without its guaranteed ${r.perk}`;
          if (r.roll === 'seal' && o.grade !== 'hallmarked') return `${r.id} at level ${lv} made a ${o.grade} ${o.id}`;
          if (o.grade === 'plain' || !r.outcomes.includes(o.id)) return `${r.id} at level ${lv} made ${o.id}, not one of its outcomes`;
        }
      }
    }
    return null;
  },
  J3G(M) {
    /* BOTH PATHS FOR A GUARANTEE JOB on the server's settle: one long window (the browser closed) and the town poll's minute windows (watched)
       pay only its outcomes, each with its perk and grade, one piece per job's inputs, XP in the piece's bench skill, and no gold. */
    const T0 = Date.UTC(2026, 10, 5, 12, 0, 0);
    for (const job of guaranteeJobs(M)) {
      const skill = M.J.JEWEL_PIECES[job.output].skill, per = M.A.recipeInputs(job);
      const call = (fromMs, toMs, inventory, seed) => M.AC.computeAccrual({
        userId: '00000000-0000-4000-8000-00000000e302', slot: 0, nowMs: toMs, accruedToMs: fromMs, activeSinceMs: T0,
        activeKind: 'artisan', activeId: job.id, capMs: 12 * 3600000, seed, hp: 60, maxHp: 60, gold: 0,
        skills: { [skill]: M.XP.skillXpForLevel(skill, 60) }, equipment: {}, inventory, autoEatEnabled: false, autoEatFood: null, autoEatPct: 0,
        toolCarry: {}, perks: null, unlockedRecipes: {}, items: M.ITEMS, monsters: {}, nodes: M.CAT.GATHER_NODES, recipes: M.CAT.ARTISAN_RECIPES_ALL,
      });
      const stock = () => Object.fromEntries(Object.entries(per).map(([id, q]) => [id, q * 200]));
      const judge = (why, d) => {
        if (!d) return `${job.id} ${why}: the settle paid nothing`;
        const items = d.items || {}, made = Object.entries(items).filter(([, q]) => q > 0);
        const jobs = -(items[job.output] || 0) / per[job.output];
        if (!(jobs > 0) || Object.keys(per).some((id) => -(items[id] || 0) !== per[id] * jobs)) return `${job.id} ${why}: spent ${JSON.stringify(items)}`;
        if (made.reduce((a, [, q]) => a + q, 0) !== jobs) return `${job.id} ${why}: ${JSON.stringify(made)} for ${jobs} jobs`;
        for (const [id] of made) {
          const it = M.ITEMS[id];
          if (!job.outcomes.includes(id)) return `${job.id} ${why}: paid ${id}, not one of its outcomes`;
          if (job.perk && !(it.jewelPerks && job.perk in it.jewelPerks)) return `${job.id} ${why}: paid ${id}, without the guaranteed ${job.perk}`;
          if (job.roll === 'seal' && it.jewelGrade !== 'hallmarked') return `${job.id} ${why}: paid ${id}, not Hallmarked`;
        }
        if (d.gold || Object.prototype.hasOwnProperty.call(d, 'bench_tax')) return `${job.id} ${why}: moved gold or carried a bench tax`;
        if (!((d.xp || {})[skill] > 0)) return `${job.id} ${why}: no ${skill} XP`;
        return null;
      };
      const closed = judge('closed', call(T0, T0 + 2 * 3600000, stock(), 0x7a12).delta);
      if (closed) return closed;
      let bag = stock();
      const sum = { items: {}, gold: 0, xp: {} };
      for (let t = T0, i = 0; t < T0 + 3600000; t += 60000, i++) {
        const d = (call(t, t + 60000, bag, 0x5100 + i) || {}).delta;
        if (!d) continue;
        for (const [id, q] of Object.entries(d.items || {})) { sum.items[id] = (sum.items[id] || 0) + q; bag = Object.assign({}, bag, { [id]: (bag[id] || 0) + q }); }
        sum.gold += d.gold || 0;
        for (const [k, x] of Object.entries(d.xp || {})) sum.xp[k] = (sum.xp[k] || 0) + x;
      }
      const watched = judge('watched', sum);
      if (watched) return watched;
    }
    return null;
  },
  async J12(M) {
    /* THE SWITCH IS THE SERVER'S: hr-accrue's set_activity refuses a dark job for an account its switch is off for (the envelope's `features`,
       which sits BESIDE `state`), before anything settles; with the switch on the verb goes on. A job with no switch never asks. */
    const jobs = Object.values(M.RC.ARTISAN_RECIPES_EVERY).flat().filter((r) => r.roll);
    const dark = jobs.find((r) => r.switch === M.J.JEWEL_SWITCH), open = jobs.find((r) => !r.switch);
    const ask = async (job, features) => {
      let calls = 0;
      const exec = async () => {
        calls++;
        if (calls === 1) return [{ allowed: true, state: { ok: true, state: { active_kind: 'idle', active_id: null }, features }, cap_ms: 0, now: new Date().toISOString() }];
        throw Object.assign(new Error('PAST_THE_GATE'), { past: true });
      };
      try {
        return await M.SA.runSetActivity({ exec, user: '00000000-0000-4000-8000-00000000e312', slot: 0, intentId: '00000000-0000-4000-8000-0000000e3120',
          activity: { kind: 'artisan', id: job.id } });
      } catch (e) { if (e && e.past) return { past: true, calls }; throw e; }
    };
    for (const features of [[], ['scaled_hunts'], null]) {
      const out = await ask(dark, features);
      if (out.past || out.status !== 409 || out.body.error !== 'activity_unsupported' || out.body.switch !== M.J.JEWEL_SWITCH)
        return `${dark.id} with features ${JSON.stringify(features)} answered ${JSON.stringify(out)}, not a refusal naming its switch`;
    }
    const on = await ask(dark, [M.J.JEWEL_SWITCH]);
    if (!on.past) return `${dark.id} with its switch on was refused: ${JSON.stringify(on)}`;
    const plain = await ask(open, []);
    if (!plain.past) return `${open.id}, which has no switch, was refused: ${JSON.stringify(plain)}`;
    return null;
  },
  J13(M) {
    /* DARK ROWS STAY DARK: a switched job is in no catalogue a client reads without asking the server (ARTISAN_RECIPES: the bench tax, item
       tips, skill unlocks, the bag), it is in the server's index, and the bench offers it only where the server's `features` list its switch. */
    for (const [skill, list] of Object.entries(M.RC.ARTISAN_RECIPES)) {
      const leak = list.find((r) => r.switch);
      if (leak) return `${leak.id} (behind ${leak.switch}) is in ARTISAN_RECIPES.${skill}, where every client reads it`;
    }
    const jobs = guaranteeJobs(M);
    if (jobs.some((r) => !M.CAT.ARTISAN_RECIPES_ALL[r.id])) return 'a guarantee job is not in the server\'s recipe index';
    for (const id of Object.keys(M.J.JEWEL_GUARANTEES)) {
      const lines = M.IL.usesOf(id).join(' | ');
      if (jobs.some((r) => lines.includes(r.name))) return `${id}'s card names a dark job: ${lines}`;
    }
    const r = jobs[0], open = Object.values(M.RC.ARTISAN_RECIPES).flat().find((x) => x.roll);
    if (M.JS.jobShown(fakeCs({}), r)) return `${r.id} shows before the server sends features`;
    if (M.JS.jobShown(fakeCs({ features: ['scaled_hunts'] }), r)) return `${r.id} shows though the server's features leave its switch out`;
    if (!M.JS.jobShown(fakeCs({ features: [M.J.JEWEL_SWITCH] }), r)) return `${r.id} hides though the server's features list its switch`;
    if (!M.JS.jobShown(fakeCs({}), open)) return 'an open job hides before the server sends features';
    return null;
  },
  J14(M) {
    /* A JOB'S NAME SAYS THE ITEM: a guarantee's words end in its catalogue name, and each piece it sets in is a crafted piece. */
    for (const [id, g] of Object.entries(M.J.JEWEL_GUARANTEES)) {
      if (!M.ITEMS[id] || !g.words.endsWith(M.ITEMS[id].n)) return `${id}: "${g.words}" does not name ${M.ITEMS[id] ? M.ITEMS[id].n : 'a catalogue item'}`;
      for (const p of g.pieces) if (!M.J.JEWEL_PIECES[p]) return `${id} sets in ${p}, which is not a crafted piece`;
    }
    const names = guaranteeJobs(M).map((r) => r.name).sort().join(' | ');
    const want = ['Set a Crown Shard and the Rat King\'s Crown in a Banded Signet', 'Set a Crown Shard in a Banded Signet', 'Set the Rat King\'s Crown in a Banded Signet'].join(' | ');
    return names === want ? null : `the guarantee jobs read "${names}"`;
  },
  J15(M) {
    /* THE BENCH SAYS THE GUARANTEE AND THE ODDS before the roll, at the hero's server level in the piece's own skill (the catalogue's table, the
       one the engine rolls with): the perk a boss gem fixes, "always Hallmarked" for a minimum quality, the perks the roll may still draw. */
    const lv = 41, cs = fakeCs({ skills: { smithing: { xp: M.XP.skillXpForLevel('smithing', lv), level: lv } }, features: [M.J.JEWEL_SWITCH] });
    const jobs = guaranteeJobs(M), both = jobs.find((x) => x.perk && x.roll === 'seal'), shard = jobs.find((x) => x.perk && x.roll === 'gem');
    const seal = jobs.find((x) => !x.perk && x.roll === 'seal'), base = M.RC.ARTISAN_RECIPES.smithing.find((x) => x.id === 'craft_banded_signet');
    const pct = (kind, g) => M.JS.oddsPct(M.J.rollOdds(kind, lv)[g]);
    /* the words are the text home's (src/data/text/work.js), read, never pasted; which row says each job, the skill, the level, the perks
       and the odds are this claim's */
    const T = M.PT.t, at = (grade, perks) => T('work.odds_at', { skill: 'Smithing', level: lv, grade, perks });
    const always = (rest) => T('work.odds_always', { perk: 'Follow-through', rest });
    const second = T('work.odds_second', { perks: T('work.odds_or', { list: 'Keen', last: 'Surge' }) });
    const all = T('work.odds_perks', { perks: T('work.odds_or', { list: 'Keen, Surge', last: 'Follow-through' }) });
    const want = [
      [both, always(at(T('work.odds_sealed'), second))],
      [shard, always(at(T('work.odds_fine', { hallmarked: pct('gem', 'hallmarked') }), second))],
      [seal, at(T('work.odds_sealed'), all)],
      [base, at(T('work.odds_plain', { fine: pct('base', 'fine'), hallmarked: pct('base', 'hallmarked') }), all)],
    ];
    for (const [job, line] of want) {
      const got = M.WK.oddsWords(cs, { row: job });
      if (got !== line) return `${job.id} says "${got}", not "${line}"`;
    }
    if (M.WK.oddsWords(fakeCs({}), { row: both }) !== '') return 'odds show before the server sends the level';
    return null;
  },
  J16(M) {
    /* THE PLAIN CARD NAMES WHAT A GEM CAN ADD (post-140 audit C11: the notes said Fang Studs help swings land or give mana back, the plain
       piece's card said only its crit): every plain crafted piece that rolls lists its bench's perks, from the table the bench rolls; a
       piece that ships plain, a graded piece and any other item list none. */
    for (const plain of Object.keys(M.J.JEWEL_PIECES)) {
      const want = M.J.perksFor(plain).map((p) => M.J.JEWEL_PERKS[p].name).join(', ');
      if (M.IL.possiblePerksOf(plain).join(', ') !== want) return `${plain}'s card lists "${M.IL.possiblePerksOf(plain).join(', ')}", not "${want}"`;
    }
    if (M.IL.possiblePerksOf('fang_studs').join(', ') !== 'Steady, Focus') return 'Fang Studs\' card does not list Steady and Focus';
    for (const id of ['fang_studs_steady', 'banded_signet_keen_follow', 'bronze_bar', 'nope']) if (M.IL.possiblePerksOf(id).length) return `${id} lists possible perks`;
    return null;
  },
  J17(M) {
    /* A BOSS DROP'S CARD NAMES ITS GUARANTEE AS A LABEL (designer 2026-11-18: the Crown Shard keeps both uses), and only where the switch is on
       for the account: dark, the card names no guarantee. */
    const on = [M.J.JEWEL_SWITCH];
    const want = { crown_shard: 'Guarantees Follow-through (Banded Signet)', rat_kings_crown: 'Guarantees Hallmarked (Banded Signet)' };
    for (const [id, line] of Object.entries(want)) {
      if (!M.IL.usesOf(id, on).includes(line)) return `${id}'s uses read ${JSON.stringify(M.IL.usesOf(id, on))}, without "${line}"`;
      if (M.IL.usesOf(id, []).some((l) => /^Guarantees/.test(l)) || M.IL.usesOf(id).some((l) => /^Guarantees/.test(l))) return `${id}'s card names its guarantee with the switch off`;
    }
    if (M.IL.usesOf('road_carnelian', on).some((l) => /^Guarantees/.test(l))) return 'a gem that guarantees nothing names a guarantee';
    return null;
  },
  J18(M) {
    /* PLAIN STATS HELP ALL THREE STYLES (itemization plan §4, designer 2026-11-18): every plain crafted jewel and the Shop's first jewelry
       carry an attack bonus for Melee, Ranged and Magic, and none carries a crit chance (the ring's Keen perk is the crit). */
    const plainJewels = Object.keys(M.J.JEWEL_PIECES).filter((id) => M.J.JEWEL_SHOP_SLOTS.includes(M.ITEMS[id].slot))
      .concat(['copper_studs', 'copper_ring', 'hunter_necklace']);
    for (const id of plainJewels) {
      const it = M.ITEMS[id];
      if (!it || !(it.atkB > 0 && it.rangeAtkB > 0 && it.magicAtkB > 0)) return `${id} does not help all three styles: ${JSON.stringify(it && { atkB: it.atkB, rangeAtkB: it.rangeAtkB, magicAtkB: it.magicAtkB })}`;
      if (it.critB) return `${id} carries a crit chance (${it.critB})`;
    }
    return null;
  },
};

/* Every rolled job's guarantee jobs (the dark ones, behind the switch), on every bench. */
function guaranteeJobs(M) { return Object.values(M.RC.ARTISAN_RECIPES_EVERY).flat().filter((r) => r.switch === M.J.JEWEL_SWITCH); }
/* A CharacterSession's read() over one envelope's sections. */
function fakeCs(sections) { return { read: (k) => sections[k] }; }

const MUTANTS = [
  { claim: 'J1', name: 'a gem roll can come out plain', edits: [['src/data/jewelry.js', "const fine = !t.fine ? ODDS_SCALE - hallmarked : at('fine');", "const fine = !t.fine ? ODDS_SCALE - hallmarked - 100 : at('fine');"]] },
  { claim: 'J1', name: 'the base Fine odds at level 30 read 7%', edits: [['src/data/jewelry.js', 'fine: Object.freeze([500, 650, 950, 1200])', 'fine: Object.freeze([500, 700, 950, 1200])']] },
  { claim: 'J2', name: 'the grade ignores the odds\' Hallmarked band', edits: [['src/core/artisan.js', "const grade = u < odds.hallmarked ? 'hallmarked' :", "const grade = u < 2 * odds.hallmarked ? 'hallmarked' :"]] },
  { claim: 'J2', name: 'a Hallmarked piece may carry its first perk twice', edits: [['src/core/artisan.js', "[pool.splice(rng.int(0, pool.length - 1), 1)[0]];", "[pool[rng.int(0, pool.length - 1)]];"]] },
  { claim: 'J3', name: 'the roll reads the wall clock, so the same window rolls twice', edits: [['src/core/artisan.js', 'const u = rng.next() * ODDS_SCALE;', 'const u = Math.random() * ODDS_SCALE;']] },
  { claim: 'J3', name: 'a roll makes a grade from another piece', edits: [['src/core/artisan.js', "  if (grade === 'plain') return { id: plain, grade, perks: [] };", "  if (grade === 'plain') return { id: 'ruby_signet', grade, perks: [] };"]] },
  { claim: 'J4', name: 'every bench job rolls a draw', edits: [['src/core/artisan.js', 'const rolled = recipe.roll ? rollJewel(recipe, c.skillLevel, rng) : null;', 'rng.next(); const rolled = recipe.roll ? rollJewel(recipe, c.skillLevel, rng) : null;']] },
  { claim: 'J6', name: 'the end line reads every grade as a plain piece', edits: [['src/shell/town-work.js', '    const it = JEWELRY_ITEMS[id];', '    const it = null;']] },
  { claim: 'J7', name: 'the ticker predicts a rolled job\'s grade', edits: [['src/shell/town-ticker.js', '  const rolled = !gather && !!w.row.roll;', '  const rolled = false;']] },
  { claim: 'J8', name: 'the T2 gem is a garnet again', edits: [['src/data/items.js', "road_carnelian:{n:'Road Carnelian'", "road_carnelian:{n:'Road Garnet'"]] },
  { claim: 'J9', name: "a gem roll's inputs name the grades it makes", edits: [['src/shell/item-lore.js', "r.roll === 'gem' ? r.name : null", 'null']] },
  { claim: 'J3', name: 'the Banded Signet\'s jobs stay on the Crafting bench', edits: [['src/data/jewelry.js', "    skill: 'smithing', next: 'seam_jasper_band',", "    skill: 'crafting', next: 'seam_jasper_band',"]] },
  { claim: 'J9', name: 'the reforge is not a use of the piece it takes', edits: [['src/shell/item-lore.js', 'for (const id of [o.from, o.metal, o.gem]) at(id).inputOf.push', 'for (const id of [o.metal, o.gem]) at(id).inputOf.push']] },
  { claim: 'J5', name: 'a rolled job pays the bench tax', edits: [['src/data/bench-tax.js', 'export const benchTaxed = (recipe) => !!(recipe && recipe.output && !recipe.roll);', 'export const benchTaxed = (recipe) => !!(recipe && recipe.output);']] },
  /* THE GUARANTEE LAYER (Tyler 2026-11-14), dark behind jewel_guarantees */
  { claim: 'J10', name: 'a boss gem\'s perk is rolled like any other', edits: [['src/core/artisan.js', 'const fixed = recipe.perk || null;', 'const fixed = null;']] },
  { claim: 'J10', name: 'the minimum quality is only usually Hallmarked', edits: [['src/data/jewelry.js', 'hallmarked: Object.freeze([10000, 10000, 10000, 10000])', 'hallmarked: Object.freeze([10000, 9000, 10000, 10000])']] },
  { claim: 'J10', name: 'a guarantee job also takes the tier\'s gem', edits: [['src/data/jewelry.js', 'inputs: Object.freeze(Object.assign({ [plain]: 1 }, ', 'inputs: Object.freeze(Object.assign({ [plain]: 1, [JEWEL_TIERS[plainOf(plain).tier].gem]: 1 }, ']] },
  { claim: 'J10', name: 'the guarantee jobs sit on the Crafting bench', edits: [['src/data/jewelry.js', '.flatMap(([plain, p]) => jobsOfPiece(plain, p).concat(guaranteeJobs(plain, p))))])));',
    ".flatMap(([plain, p]) => jobsOfPiece(plain, p).concat(skill === 'crafting' ? Object.entries(JEWEL_PIECES).flatMap(([q, x]) => guaranteeJobs(q, x)) : [])))])));"]] },
  { claim: 'J3G', name: 'the server\'s settle has no guarantee job to pay', edits: [['supabase/functions/hr-accrue/catalogue.js', "import { ARTISAN_RECIPES_EVERY as ARTISAN_RECIPES } from '../../../src/data/recipes.js';", "import { ARTISAN_RECIPES } from '../../../src/data/recipes.js';"]] },
  { claim: 'J12', name: 'set_activity never asks the switch', edits: [['supabase/functions/hr-accrue/set-activity.js', '  if (!sw) return true;\n  const on', '  return true;\n  const on']] },
  { claim: 'J12', name: 'set_activity reads the switch inside `state`', edits: [['supabase/functions/hr-accrue/set-activity.js', 'const on = env && env.features;', 'const on = env && env.state && env.state.features;']] },
  { claim: 'J13', name: 'the dark jobs join the catalogue every client reads', edits: [['src/data/recipes.js', 'function openJobs(list) { return list.filter((r) => !r.switch); }', 'function openJobs(list) { return list; }']] },
  { claim: 'J13', name: 'the bench offers a dark job without the server', edits: [['src/session/jewelry-sections.js', 'return !recipe || !recipe.switch || featureOn(cs, recipe.switch);', 'return true;']] },
  { claim: 'J14', name: 'a job names an item that is not its own', edits: [['src/data/jewelry.js', "words: 'a Crown Shard'", "words: 'a Crown Gem'"]] },
  { claim: 'J15', name: 'a minimum-quality job reads "otherwise Fine"', edits: [['src/shell/windows/work.js', "    : o.fine === '0%' ? t('work.odds_sealed') : ", '    : ']] },
  { claim: 'J15', name: 'the bench says no guarantee', edits: [['src/session/jewelry-sections.js', 'perk: recipe.perk && JEWEL_PERKS[recipe.perk] ? JEWEL_PERKS[recipe.perk].name : null,', 'perk: null,']] },
  { claim: 'J15', name: 'the guarantee\'s perk is offered as a second roll', edits: [['src/session/jewelry-sections.js', 'perks: jobRolls(recipe).map(', 'perks: jobRolls({ roll: recipe.roll, output: recipe.output }).map(']] },
  { claim: 'J16', name: 'the plain card names no perk a gem can add', edits: [['src/shell/item-lore.js', '? perksFor(id).map((p) => JEWEL_PERKS[p].name) : [];', '? [] : [];']] },
  { claim: 'J10', name: 'a guarantee job takes longer than the gem job it replaces', edits: [['src/data/jewelry.js', 'icon: p.gem.icon, xp: p.gem.xp, req: p.gem.req, ms: p.gem.ms,', 'icon: p.gem.icon, xp: p.gem.xp, req: p.gem.req, ms: p.gem.ms + 1000,']] },
  { claim: 'J17', name: 'the card names a dark guarantee', edits: [['src/shell/item-lore.js', 'if (g && Array.isArray(features) && features.includes(JEWEL_SWITCH)) {', 'if (g) {']] },
  { claim: 'J17', name: 'the card names no guarantee', edits: [['src/shell/item-lore.js', "    out.push(t('jewel.guarantees', {", "    if (false) out.push(t('jewel.guarantees', {"]] },
  { claim: 'J18', name: 'Fang Studs crit again', edits: [['src/data/slot-ladders.js', "slot: 'earrings', tier: 2, rarity: 'uncommon',  reqSkill: 'level', reqLv: 15, atkB: 2, strB: 2, rangeAtkB: 2, rangeStrB: 2, magicAtkB: 2, magicStrB: 2 },",
    "slot: 'earrings', tier: 2, rarity: 'uncommon',  reqSkill: 'level', reqLv: 15, critB: 0.01 },"]] },
  { claim: 'J18', name: 'the Hunter Necklace helps Melee only', edits: [['src/data/items.js', "slot:'necklace',atkB:2,rangeAtkB:2,magicAtkB:2,", "slot:'necklace',atkB:2,"]] },
];

async function run(M) {
  const fails = [];
  for (const [k, fn] of Object.entries(claims)) {
    let why;
    try { why = await fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
    if (why) fails.push(k + ' ' + why);
  }
  return fails;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--mutate')) {
    let missed = 0;
    for (const mu of MUTANTS) {
      const p = plant(mu.edits, ['src', 'supabase/functions/hr-accrue', 'tools/gen-bench-tax.mjs', 'tests/_is-main.mjs']);
      try {
        /* A planted tree that can't load is the harness's failure, never a catch. */
        let M;
        try { M = await load(p.root); } catch (e) { console.error('jewelry-rolls --mutate: HARNESS ' + mu.name + ': ' + e.message); process.exit(2); }
        let why;
        try { why = await claims[mu.claim](M); } catch (e) { why = 'threw ' + e.message; }
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
