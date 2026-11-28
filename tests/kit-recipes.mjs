#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/kit-recipes.mjs — THE KIT TRADES' BANDS HOLD THEIR RULE (lane/k1-kit-trades-sample, game designer, 2026-11-26;
//   docs/design/redesign/09-crafting.md section 4.9). src/data/trades.js KIT_RECIPES (the five named rows and the band's faces),
//   src/core/trades.js (bandRung, and the catalogue that resolves them as named), src/data/catalogue-coherence.js (the live doors).
//
//   node tests/kit-recipes.mjs            the guard (pure, Node)
//   node tests/kit-recipes.mjs --mutate   every planted defect must turn its named arm red (each on a temp copy of src/)
//
// mutant-anchors: src/core/trades.js src/data/trades.js src/data/job-faces.js
//   (the mutants patch a temp copy of src/; no tracked file is patched)
// ci-step: economy-selftests | Kit trades bands 0 to 8 - each band whole, its chains closed on jobs alone, a batch of 20 or fewer, rung by band, every face sourced and used, each band's binder dropped there, the store the fallback
// ci-run: node tests/kit-recipes.mjs
// ci-run: node tools/mutant-gate.mjs node tests/kit-recipes.mjs --mutate
//
//   KR-ROWS    band 0 is the first day whole (09 4.11 row 1b, 4.13): the sample's five, batch 2 (the gather rows, the refine rows, the
//              honing stone and the drink) and every rune family; band 1 (iron, 09 4.13) is the same kinds at iron and oak, the first bolt
//              and the Temper kit, with no stone of its own; bands 2 to 4 (steel, mithril and rune, 09 4.14, 4.15) are band 1's kinds but
//              the bolt; bands 5 and 6 (Emberforged and Dawnsteel, 09 4.15, 4.16) are band 4's but the runes, whose ladder ends at Graven;
//              bands 7 and 8 (Cobalt and Wolfram, 09 4.16) are the rock, the bar, the Temper kit and the fish and meal; one row a kind,
//              every v0.3.0 gathering and making trade with a job at each band (Runecutting while a rune tier is left, Woodcutting,
//              Woodcrafting and Farming while an arrow rung is); nothing past band 8 (band 9 has no gear tier and no ground); one good,
//              one recipe; a row holds only its kind, band, derived id and a short label (no time, count, XP or price); validate() is clean
//   KR-BATCH   a batch of 20 or fewer, each batch on its own (09 4.13): two batches of 15 pass, one of 21 is refused, and KIT_RECIPES is
//              the batches end to end, so a band past 0 lands as its own batch
//   KR-BINDER  each band's binder drops on a ground of that band (09 4.16): every band with a ground, open or staged, names its Remains
//              (job-faces.js STREAM_FACES) and a monster on a ground of that band drops it; no band without a ground names one
//   KR-CLOSED  ONE TOWN WORK (09 4.11): every town input of every job at a whole band (0 to 8) is made by a job at that band or below
//              (never only by the live bench, the store or the start kit), and every hunted input is its stream's face a monster on an open ground
//              of that band drops, so the cut leaves no gap and a company hunting its band can make its band's goods
//   KR-RUNG    a band's recipe opens at the band's rung (band b at rung b + 1, the last rung for every band past it, never before the
//              kind's own rung), swept over every kind and bands 0 to 12; every band 0 row opens at trade Level 1, so the first day can
//              make it
//   KR-SOURCE  every input of every row names a face at the row's band that another row makes or that is a live item with a door
//              (catalogue-coherence itemSources); every hunted input names its stream's face with a door; every output is used by
//              another row or is a live item with a use (itemUses); a NEW face is no ITEMS row, is made by a row and is used by a row
//              or a declared use (the Temper kit's rank)
//   KR-STORE   the store is the fallback and never the best buy: at every band 0 to 8, for a hero at the band's first and last step, the
//              store's good stands one band behind (band 0: none behind) and costs more per hour of effect than the crafted good at the
//              hero's band and one band behind, and at most storeCeiling times the crafted good's (it is a fallback, not a fine)
//   KR-HOURS   a finished kit good is one hunted hour of its line (effect 1); its work is the catalogue's; the job at the row's own
//              Level takes its own work over the speed; under the band's rung the job is refused (rung_locked)
// Exit: 0 green · 1 red (or a mutant escaped) · 2 harness.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
// No verb reads these rows yet: the job slice (HANDOFFS 2026-11-26, K1) adds the server's copy, the face items and the bundle unit, and
// its own guard plays a job viewed and closed (CLAUDE.md section 4, both paths).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { harnessFail, verdict } from './_mutant-verdict.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const HOUR = 3600000;
/* the bands whose kit batches have landed whole (09 4.13): KR-ROWS holds their kinds, KR-CLOSED their chains */
const WHOLE_BANDS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8]);

async function load(root) {
  const imp = (p) => import(pathToFileURL(join(root, p)).href);
  const [T, D, CC, IT, SK, HG, MO, DG, RU] = await Promise.all([imp('src/core/trades.js'), imp('src/data/trades.js'), imp('src/data/catalogue-coherence.js'), imp('src/data/items.js'), imp('src/data/store-kit.js'),
    imp('src/data/hunt-grounds.js'), imp('src/data/monsters.js'), imp('src/data/danger.js'), imp('src/data/runes.js')]);
  /* the arrow ladder's rungs (slot-ladders.js: the Ranged ammo's tiers, Bronze to Dawnpoint): band b fletches rung b + 1, so Woodcutting and
     Woodcrafting have a job at every band an arrow rung is left for, as Runecutting has at every band a rune tier is left for */
  const arrowRungs = Math.max(...Object.values(IT.ITEMS).filter((i) => i && i.slot === 'ammo' && i.reqSkill === 'ranged' && Number.isInteger(i.tier)).map((i) => i.tier));
  return { T, D, KR: D, ITEMS: IT.ITEMS, sources: CC.itemSources(), uses: CC.itemUses(), STORE_KIT: SK.STORE_KIT, runeTiers: RU.RUNE_TIERS.length, arrowRungs,
    bandDrops: bandDropsOf(HG, MO, DG, HG.OPEN_GROUNDS), anyBandDrops: bandDropsOf(HG, MO, DG, HG.HUNT_GROUNDS), ...catalogueOf(T) };
}

/* What the grounds of each band drop: band -> Set(item ids), read over `grounds` (the open ones for KR-CLOSED, every one, staged too, for
   KR-BINDER). A ground's band is its gear Level over tierSteps (the server's hr_trade_ground_bands, the band a depth record there opens);
   its bodies are its pockets' packs, spawns and adds (catalogue-coherence OPEN_BODY_DROPS reads the same shape) */
function bandDropsOf(HG, MO, DG, grounds) {
  const out = new Map();
  for (const [id, g] of Object.entries(grounds)) {
    const dg = DG.DANGER_GROUNDS[id];
    if (!dg || !Number.isInteger(dg.gearLevel)) continue;
    const band = Math.floor(dg.gearLevel / DG.GEAR_STEPS.tierSteps);
    if (!out.has(band)) out.set(band, new Set());
    for (const pk of g.pockets || []) for (const sp of [...(pk.pack || []), ...(pk.spawns || []), ...(pk.adds || [])]) {
      for (const d of ((MO.MONSTERS[sp.monster] || {}).drops || [])) out.get(band).add(d.id);
    }
  }
  return out;
}

/* The catalogue is the rows' consumer: a row it refuses is KR-ROWS's red (the arm reads the refusal), never a load that throws */
function catalogueOf(T) {
  try { return { cat: T.tradeCatalogue(), refused: null }; } catch (e) { return { cat: null, refused: String((e && e.message) || e) }; }
}

/* catalogue-coherence's doors: id -> [labels] (a Map) */
const has = (m, id) => (m.get(id) || []).length > 0;

const ARMS = {
  'KR-ROWS'({ KR, cat, refused, runeTiers, arrowRungs }) {
    const out = [];
    if (refused) return ['KR-ROWS the catalogue refuses the rows: ' + refused];
    for (const p of KR.validateKitRecipes()) out.push('KR-ROWS ' + p);
    for (const p of KR.validate()) out.push('KR-ROWS trades: ' + p);
    const all = KR.KIT_RECIPES;
    const runes = Object.keys(KR.KINDS).filter((k) => KR.KINDS[k].family);
    /* BAND 0 WHOLE (09 4.11 row 1b, 4.13): exactly the first day's kinds, one row each: the sample's five, then the gather rows (logs,
       shrimp, rune essence, the crop), the refine rows (bars, planks, blank runes), the honing stone, the drink and every rune family.
       BAND 1, IRON (09 4.13): the same kinds at iron and oak, the first bolt and the Temper kit, and no stone of its own (the rune's stone
       has no metal). BANDS 2 TO 4, STEEL, MITHRIL AND RUNE (09 4.14, 4.15): band 1's kinds but the bolt (past iron a crossbow shoots its
       band's arrows). BAND 5, EMBERFORGED (09 4.15, 4.16): band 4's but the runes (the ladder ends at Graven). BAND 6, DAWNSTEEL (09
       4.16): band 5's kinds, every ladder's last rung but the runes'. BANDS 7 AND 8, COBALT AND WOLFRAM (09 4.16): the rock, the bar, the
       Temper kit and the fish and meal; their charge goods, wood, crop and drink wait for the ladders' next rung. Nothing past band 8: band
       9 has no gear tier and no ground */
    const later3 = ['ore', 'arrowhead', 'arrow', 'meal', 'log', 'fish', 'grain', 'bar', 'shaft', 'honing_stone', 'drink', 'temper_kit', ...runes];
    const noRune = ['ore', 'arrowhead', 'arrow', 'meal', 'log', 'fish', 'grain', 'bar', 'shaft', 'honing_stone', 'drink', 'temper_kit'];
    const metal = ['ore', 'bar', 'temper_kit', 'fish', 'meal'];
    const want = {
      0: ['ore', 'arrowhead', 'arrow', 'meal', 'log', 'fish', 'rune_stone', 'grain', 'bar', 'shaft', 'cut_stone', 'honing_stone', 'drink', ...runes],
      1: ['ore', 'arrowhead', 'arrow', 'bolt', 'meal', 'log', 'fish', 'grain', 'bar', 'shaft', 'honing_stone', 'drink', 'temper_kit', ...runes],
      2: later3,
      3: later3,
      4: later3,
      5: noRune,
      6: noRune,
      7: metal,
      8: metal,
    };
    for (const b of WHOLE_BANDS) {
      const rows = all.filter((r) => r.band === b), kinds = rows.map((r) => r.kind);
      if (kinds.slice().sort().join() !== want[b].slice().sort().join()) out.push('KR-ROWS band ' + b + ' is ' + kinds.join(', ') + ', not its whole (' + want[b].join(', ') + ')');
      /* Runecutting has a job at every band a rune tier is left for (runes.js RUNE_TIERS: band b cuts tier b + 1), Woodcutting and
         Woodcrafting at every band an arrow rung is left for, and Farming (whose crop is a drink's) with them: the farm's crops end at
         Moonbloom, band 6's (09 4.16) */
      const wood = b < arrowRungs ? ['woodcutting', 'woodcrafting', 'farming'] : [];
      for (const t of ['mining', 'fishing', 'cooking', 'smithing', ...wood, ...(b < runeTiers ? ['runecutting'] : [])]) {
        if (!rows.some((r) => cat.kinds[r.kind] && cat.kinds[r.kind].trade === t)) out.push('KR-ROWS band ' + b + ' has no ' + t + ' row: the trade has no job at the band');
      }
    }
    const later = all.filter((r) => r.band > 8);
    if (later.length) out.push('KR-ROWS past band 8 is ' + later.map((r) => r.id).join(', ') + ': band 9 has no gear tier and no ground');
    for (const r of all) {
      const extra = Object.keys(r).filter((k) => !['id', 'kind', 'band', 'name'].includes(k));
      if (extra.length) out.push('KR-ROWS ' + r.id + ' types ' + extra.join(', '));
      if (r.id !== KR.recipeId(r.kind, r.band)) out.push('KR-ROWS ' + r.id + ' is not its derived id');
    }
    return out;
  },
  /* A BATCH OF 20 OR FEWER, EACH ON ITS OWN (CLAUDE.md section 10; 09 4.13): the cap reads a batch, never the whole list, so a band
     past 0 can land as its own batch; KIT_RECIPES is the batches end to end. Read on synthetic faces (one kind, thirty bands), so the
     proof does not wait for the shipped list to pass twenty */
  'KR-BATCH'({ KR }) {
    const out = [];
    const flat = KR.KIT_BATCHES.flatMap((b) => b.rows.map((r) => r.id)).join();
    if (flat !== KR.KIT_RECIPES.map((r) => r.id).join()) out.push('KR-BATCH KIT_RECIPES is not the batches end to end');
    const faces = { ore: Array.from({ length: 30 }, (_, b) => 'test_ore_' + b) };
    const rows = (from, n) => Array.from({ length: n }, (_, i) => Object.freeze({ id: KR.recipeId('ore', from + i), kind: 'ore', band: from + i, name: 'Mine Test Ore' }));
    const two = [{ id: 'test-a', rows: rows(0, 15) }, { id: 'test-b', rows: rows(15, 15) }];
    const twoP = KR.validateKitRecipes(two, KR.KINDS, KR.TRADES, faces, {});
    if (twoP.length) out.push('KR-BATCH two batches of 15 (30 rows) are refused: ' + twoP.join('; '));
    const big = KR.validateKitRecipes([{ id: 'test-big', rows: rows(0, 21) }], KR.KINDS, KR.TRADES, faces, {});
    if (!big.some((p) => /past a batch of 20/.test(p))) out.push('KR-BATCH a batch of 21 is not refused');
    for (const b of KR.KIT_BATCHES) if (b.rows.length > 20) out.push('KR-BATCH batch ' + b.id + ' has ' + b.rows.length + ' rows');
    return out;
  },
  'KR-RUNG'({ T, KR, cat }) {
    const out = [];
    const n = T.TRADE_PM.rungCount;
    for (const k of Object.values(cat.kinds)) {
      let prev = 0;
      for (let b = 0; b <= 12; b++) {
        const want = Math.max(k.opens, Math.min(n, b + 1));
        const got = T.bandRung(k, b);
        if (got !== want) { out.push(`KR-RUNG ${k.id} band ${b} opens at rung ${got}, not ${want}`); break; }
        if (got < prev || got > n) { out.push(`KR-RUNG ${k.id} band ${b}: rung ${got} is off the ladder`); break; }
        prev = got;
      }
    }
    /* the catalogue's named rows: every shipped row, each at its band's rung, and the sample's all at trade Level 1 */
    if (cat.named.length !== KR.KIT_RECIPES.length) out.push(`KR-RUNG the catalogue names ${cat.named.length} recipes, not the ${KR.KIT_RECIPES.length} rows`);
    for (const r of cat.named) {
      const k = cat.kinds[r.kind];
      const want = Math.max(k.opens, Math.min(n, r.band + 1));
      if (r.rung !== want || r.R !== T.rungLevel(want)) out.push(`KR-RUNG ${r.id}: the catalogue opens it at rung ${r.rung} (Level ${r.R}), not ${want} (Level ${T.rungLevel(want)})`);
      if (r.band === 0 && r.R !== 1) out.push(`KR-RUNG ${r.id} opens at trade Level ${r.R}: the first day cannot make it`);
    }
    return out;
  },
  'KR-SOURCE'({ KR, cat, ITEMS, sources, uses }) {
    const out = [];
    const made = new Map(cat.named.map((r) => [r.face, r.id]));
    const used = new Set();
    const live = (id) => !!ITEMS[id];
    for (const r of cat.named) {
      for (const i of r.inputs) {
        const f = i.face;
        if (f !== KR.faceOf(i.kind, r.band)) out.push(`KR-SOURCE ${r.id}: its ${i.kind} reads ${f}, not band ${r.band}'s ${KR.faceOf(i.kind, r.band)}`);
        if (!f) { out.push(`KR-SOURCE ${r.id}: its ${i.kind} has no face at band ${r.band}`); continue; }
        used.add(f);
        if (!made.has(f) && !(live(f) && has(sources, f))) out.push(`KR-SOURCE ${r.id}: input ${f} is made by no row and has no door`);
      }
      for (const h of r.hunted) {
        const f = h.face;
        if (!f) out.push(`KR-SOURCE ${r.id}: its ${h.stream} has no face at band ${r.band}`);
        else if (!(live(f) && has(sources, f))) out.push(`KR-SOURCE ${r.id}: hunted input ${f} has no door`);
      }
    }
    for (const [f, id] of made) {
      if (!f) continue;
      if (!used.has(f) && !((live(f) || KR.NEW_FACES[f]) && has(uses, f))) out.push(`KR-SOURCE ${id}: output ${f} is used by no row and has no use`);
    }
    for (const id of Object.keys(KR.NEW_FACES)) {
      /* the job slice (lane/k1-job-slice) is the door: a new face is an item exactly when its trade makes it (catalogue-coherence's
         'made by <trade>', the hr_trade_job_start door), never before (W0) */
      if (ITEMS[id] && !(sources.get(id) || []).some((l) => /^made by /.test(l))) out.push(`KR-SOURCE new face ${id} is an ITEMS row before its door exists`);
      if (!made.has(id) || !(used.has(id) || has(uses, id))) out.push(`KR-SOURCE new face ${id} is not made by a row and used by a row or a declared use`);
    }
    for (const f of made.keys()) if (f && !live(f) && !KR.NEW_FACES[f]) out.push(`KR-SOURCE ${f} is neither a live item nor a new face`);
    return out;
  },
  /* ONE TOWN WORK (09 4.11 rows 1 and 1b): the live bench is cut in the release that lights the jobs, so band 0's chains must close on the
     job list alone. Every town input of a band 0 job is made by another band 0 job (no bench, no store, no start kit: a door that
     outlives the kit), and every hunted input is its stream's face that a monster drops */
  'KR-CLOSED'({ T, cat, sources, bandDrops }) {
    const out = [];
    /* every band's chains close on jobs at that band or below (band 1's runes cut band 0's Blank Runes, 09 4.13): a band is whole only
       when every town input of every job at it is made by a job, never only by the bench, the store or the kit */
    const all = T.jobRecipes(cat).filter((r) => !r.imbue);
    /* the bands whose batches have landed (0 to 8, 09 4.16) */
    for (const b of WHOLE_BANDS) {
      const jobs = all.filter((r) => r.band === b);
      const made = new Map(all.filter((r) => r.band <= b).map((r) => [r.face, r.id]));
      const hunted = new Set(cat.named.filter((r) => r.band === b).flatMap((r) => r.hunted.map((h) => h.face)));
      for (const r of jobs) {
        for (const item of Object.keys(r.inputs)) {
          if (made.has(item)) continue;
          /* a hunted input is its stream's face that a ground OF THIS BAND drops (09 4.14: a company whose deepest record is band b cuts
             band b's runes; Razor Claw dropped only on the Pyre Field, band 4, so a Muster company could never bind a Carved rune) */
          if (hunted.has(item) && (sources.get(item) || []).includes('monster drop')) {
            if (!(bandDrops.get(b) || new Set()).has(item)) out.push(`KR-CLOSED ${r.id}: hunted input ${item} drops on no open ground of band ${b}: a company hunting its band cannot make it`);
            continue;
          }
          out.push(`KR-CLOSED ${r.id}: input ${item} is made by no job at band ${b} or below (only the bench, the store or the kit): the band breaks when the bench is cut`);
        }
      }
    }
    const ids = new Set(all.map((r) => r.id));
    for (const id of ['ore_b0', 'arrowhead_b0', 'arrow_b0', 'meal_b0', 'rune_fire_b0', 'arrow_b1', 'bolt_b1', 'rune_fire_b1', 'meal_b1', 'arrow_b2', 'rune_fire_b2', 'meal_b2', 'arrow_b3', 'rune_fire_b3', 'meal_b3', 'arrow_b4', 'rune_fire_b4', 'meal_b4', 'arrow_b5', 'meal_b5', 'drink_b5',
      'honing_stone_b5', 'arrow_b6', 'honing_stone_b6', 'meal_b6', 'drink_b6', 'temper_kit_b6', 'temper_kit_b7', 'meal_b7', 'temper_kit_b8', 'meal_b8']) if (!ids.has(id)) out.push(`KR-CLOSED ${id} is not a job`);
    return out;
  },
  /* EACH BAND'S BINDER DROPS ON A GROUND OF THAT BAND (09 4.14, 4.16): every band with a ground (open or staged) names its Remains, and a
     monster on a ground of that band drops it, so the day a rune tier or an imbuement lands at a band its binder is already hunted there.
     KR-CLOSED holds the same for the bands whose jobs spend it now, on open grounds */
  'KR-BINDER'({ KR, anyBandDrops }) {
    const out = [];
    for (const [b, drops] of [...anyBandDrops.entries()].sort((x, y) => x[0] - y[0])) {
      const face = KR.streamFaceOf('remains', b);
      if (!face) out.push(`KR-BINDER band ${b} has a ground and names no Remains`);
      else if (!drops.has(face)) out.push(`KR-BINDER band ${b}'s Remains ${face} drops on no ground of band ${b}`);
    }
    for (let b = 0; b < KR.STREAM_FACES.remains.length; b++) if (!anyBandDrops.has(b)) out.push(`KR-BINDER band ${b} names a Remains but has no ground`);
    return out;
  },
  'KR-STORE'({ T, KR, cat, STORE_KIT }) {
    const out = [];
    const ts = T.TRADE_PM.tierSteps;
    for (const r of KR.KIT_RECIPES) {
      const k = cat.kinds[r.kind];
      if (!k || (k.line !== 'meal' && k.line !== 'charge')) continue;
      for (let b = 0; b <= 8; b++) {
        for (const s of [b * ts, b * ts + ts - 1]) {
          const ask = T.storeAsk(k, s), storeStep = T.storeStep(s);
          const wantStep = Math.max(0, (b - 1) * ts);
          if (storeStep !== wantStep) { out.push(`KR-STORE ${r.id} band ${b} step ${s}: the store's good stands at step ${storeStep}, not ${wantStep} (one band behind)`); continue; }
          const strength = (step) => T.behindPm(s - step) / 1000;
          const storePer = ask / strength(storeStep);
          const here = T.value(k, b, 0) / strength(T.bandStep(b));
          const back = b > 0 ? T.value(k, b - 1, 0) / strength(T.bandStep(b - 1)) : here;
          if (!(storePer > here)) out.push(`KR-STORE ${r.id} band ${b} step ${s}: the store (${storePer.toFixed(0)} an hour of effect) is no dearer than crafted at the band (${here.toFixed(0)})`);
          if (!(storePer > back)) out.push(`KR-STORE ${r.id} band ${b} step ${s}: the store (${storePer.toFixed(0)}) is no dearer than crafted one band behind (${back.toFixed(0)})`);
          /* the ask rounds up once, so a whole gold of slack */
          if (storePer > STORE_KIT.storeCeiling * here + 1 / strength(storeStep)) out.push(`KR-STORE ${r.id} band ${b} step ${s}: the store is ${(storePer / here).toFixed(3)}x the crafted good, past the ceiling ${STORE_KIT.storeCeiling}`);
        }
      }
    }
    return out;
  },
  'KR-HOURS'({ T, D, KR, cat }) {
    const out = [];
    for (const r of KR.KIT_RECIPES) {
      const k = cat.kinds[r.kind];
      if (!k) continue;
      if (k.line && D.KINDS[r.kind].effect !== 1) out.push(`KR-HOURS ${r.id}: one good is ${D.KINDS[r.kind].effect} hunted hours of its line, not one`);
      const rung = T.bandRung(k, r.band), L = T.rungLevel(rung);
      const b = T.jobBound(k, rung, L, { count: 1, elapsedMs: 10 * HOUR });
      if (!b || b.attempts !== 1) { out.push(`KR-HOURS ${r.id}: one attempt is refused at its own Level ${L}`); continue; }
      const want = Math.ceil((k.ownUh * HOUR) / T.speedPm(L) / 1000);
      if (Math.abs(b.spentMs - want) > 1) out.push(`KR-HOURS ${r.id}: one attempt takes ${b.spentMs} ms, not its own work over the speed (${want})`);
      /* the rung lock, read at band 3 (rung 4, Level 31): one Level under it is refused */
      const r3 = T.bandRung(k, 3), L3 = T.rungLevel(r3);
      if (L3 > 1 && T.jobBound(k, r3, L3 - 1, { count: 1, elapsedMs: HOUR }) !== null) out.push(`KR-HOURS ${r.id}: band 3 works at trade Level ${L3 - 1}, under its rung's ${L3}`);
    }
    return out;
  },
};

async function runPure(X, only = null) {
  const fails = [];
  for (const [id, arm] of Object.entries(ARMS)) {
    if (only && id !== only) continue;
    try { fails.push(...arm(X)); } catch (e) { fails.push(harnessFail(id, e)); }
  }
  return fails;
}

/* each row: name, the arm that must name it, the file (a literal, so tools/guard-anchors.mjs reads it), the anchor, its replacement */
const MUTANTS = [
  ['band 0 carries a kind the first day does not hold (the bolt)', 'KR-ROWS', 'src/data/trades.js',
    "  kitRow('drink', 0, 'Press Turnip Juice'),\n", "  kitRow('drink', 0, 'Press Turnip Juice'),\n  kitRow('bolt', 0, 'Fletch Bronze Bolts'),\n"],
  ['band 0 without its planks (the arrow has no shaft once the bench is cut)', 'KR-CLOSED', 'src/data/trades.js',
    "  kitRow('shaft', 0, 'Saw Normal Planks'),\n", ''],
  ['band 0 without its blank runes', 'KR-CLOSED', 'src/data/trades.js', "  kitRow('cut_stone', 0, 'Cut Blank Runes'),\n", ''],
  ['band 0 without its bars (the arrowhead and the whetstone have no metal)', 'KR-CLOSED', 'src/data/trades.js',
    "  kitRow('bar', 0, 'Smelt Bronze Bars'),\n", ''],
  ['a row past band 8 (band 9 has no gear tier and no ground)', 'KR-ROWS', 'src/data/trades.js',
    "    kitRow('meal', 8, 'Cook Moonfish'),\n", "    kitRow('meal', 8, 'Cook Moonfish'),\n    kitRow('fish', 9, 'Catch Moonfish Again'),\n"],
  ['band 5 without its stone (the Emberforged Whetstone has no job)', 'KR-ROWS', 'src/data/trades.js', "    kitRow('honing_stone', 5, 'Grind Emberforged Whetstones'),\n", ''],
  ['band 6 without its dawnsteel bars (its head, stone and Temper kit have no metal)', 'KR-CLOSED', 'src/data/trades.js', "    kitRow('bar', 6, 'Smelt Dawnsteel Bars'),\n", ''],
  ['band 6 without its duskwood planks (Dawnpoint Arrows have no shaft)', 'KR-CLOSED', 'src/data/trades.js', "    kitRow('shaft', 6, 'Saw Duskwood Planks'),\n", ''],
  ['band 6 without its crop (Moonbloom Wine has no moonbloom from a job)', 'KR-CLOSED', 'src/data/trades.js', "    kitRow('grain', 6, 'Pull Moonbloom'),\n", ''],
  ['band 6 cuts a rune past the last tier', 'KR-ROWS', 'src/data/trades.js',
    "    kitRow('arrow', 6, 'Fletch Dawnpoint Arrows'),\n", "    kitRow('arrow', 6, 'Fletch Dawnpoint Arrows'),\n    kitRow('rune_fire', 6, 'Cut Dawn Fire Runes'),\n"],
  ['band 7 without its rock (Cobalt Bars have no ore)', 'KR-CLOSED', 'src/data/trades.js', "    kitRow('ore', 7, 'Mine Cobalt Ore'),\n", ''],
  ['band 8 without its bars (the Wolfram Temper kit has no metal)', 'KR-CLOSED', 'src/data/trades.js', "    kitRow('bar', 8, 'Smelt Wolfram Bars'),\n", ''],
  ['band 8 without its Temper kit (a rank on Catacomb gear is owed a kit)', 'KR-ROWS', 'src/data/trades.js', "    kitRow('temper_kit', 8, 'Mix Wolfram Tempering Salts'),\n", ''],
  ['band 7 fletches past the arrow ladder (no cobalt arrow is an item)', 'KR-ROWS', 'src/data/trades.js',
    "    kitRow('meal', 7, 'Cook Shark'),\n", "    kitRow('meal', 7, 'Cook Shark'),\n    kitRow('arrow', 7, 'Fletch Cobalt Arrows'),\n"],
  ['band 7\'s binder is a good the Wyvern Roost never drops (Big Bones)', 'KR-BINDER', 'src/data/job-faces.js', "'dragon_bones', 'big_bones']", "'big_bones', 'big_bones']"],
  ['band 8 names no binder', 'KR-BINDER', 'src/data/job-faces.js', "'dragon_bones', 'big_bones']", "'dragon_bones']"],
  ['a binder named for a band with no ground (band 9)', 'KR-BINDER', 'src/data/job-faces.js', "'dragon_bones', 'big_bones']", "'dragon_bones', 'big_bones', 'big_bones']"],
  ['band 5 without its runewood planks (Emberhead Arrows have no shaft)', 'KR-CLOSED', 'src/data/trades.js', "    kitRow('shaft', 5, 'Saw Runewood Planks'),\n", ''],
  ['band 5 without its emberstone (Emberforged Bars have no ore)', 'KR-CLOSED', 'src/data/trades.js', "    kitRow('ore', 5, 'Mine Emberstone Ore'),\n", ''],
  ['band 5 cuts a rune past the last tier', 'KR-ROWS', 'src/data/trades.js',
    "    kitRow('arrow', 5, 'Fletch Emberhead Arrows'),\n", "    kitRow('arrow', 5, 'Fletch Emberhead Arrows'),\n    kitRow('rune_fire', 5, 'Cut Ember Fire Runes'),\n"],
  ['band 2 without its coal (Steel Bars have no ore once the bench is cut)', 'KR-CLOSED', 'src/data/trades.js', "    kitRow('ore', 2, 'Mine Coal'),\n", ''],
  ['band 2 carries a bolt (no steel bolt is an item)', 'KR-ROWS', 'src/data/trades.js',
    "    kitRow('arrow', 2, 'Fletch Steel Arrows'),\n", "    kitRow('arrow', 2, 'Fletch Steel Arrows'),\n    kitRow('bolt', 2, 'Fletch Steel Bolts'),\n"],
  ['band 3 without its planks (Mithril Arrows have no shaft)', 'KR-CLOSED', 'src/data/trades.js', "    kitRow('shaft', 3, 'Saw Maple Planks'),\n", ''],
  ['band 3 without its arrowheads', 'KR-CLOSED', 'src/data/trades.js', "    kitRow('arrowhead', 3, 'Forge Mithril Arrowheads'),\n", ''],
  ['band 3\'s runes bind with a Remains its grounds do not drop (Razor Claw, the Pyre Field\'s)', 'KR-CLOSED', 'src/data/job-faces.js', "'bones', 'grave_dust', 'big_bones',", "'bones', 'razor_claw', 'big_bones',"],
  ['band 4 without its rock (Rune Bars have no ore once the bench is cut)', 'KR-CLOSED', 'src/data/trades.js', "    kitRow('ore', 4, 'Mine Rune Ore'),\n", ''],
  ['band 4 without its yew planks (Rune Arrows have no shaft)', 'KR-CLOSED', 'src/data/trades.js', "    kitRow('shaft', 4, 'Saw Yew Planks'),\n", ''],
  ['band 4 carries a bolt (no rune bolt is an item)', 'KR-ROWS', 'src/data/trades.js',
    "    kitRow('arrow', 4, 'Fletch Rune Arrows'),\n", "    kitRow('arrow', 4, 'Fletch Rune Arrows'),\n    kitRow('bolt', 4, 'Fletch Rune Bolts'),\n"],
  ['band 4\'s runes bind with a good only a band-5 ground drops (Troll Hide, Carter\'s Rest)', 'KR-CLOSED', 'src/data/job-faces.js', "'grave_dust', 'big_bones',", "'grave_dust', 'troll_hide',"],
  ['band 1 without its arrowheads (its arrows and bolts have no head once the bench is cut)', 'KR-CLOSED', 'src/data/trades.js',
    "    kitRow('arrowhead', 1, 'Forge Iron Arrowheads'),\n", ''],
  ['band 1 without its bars (the iron arrowhead, the whetstone and the Iron Temper kit have no metal)', 'KR-CLOSED', 'src/data/trades.js',
    "    kitRow('bar', 1, 'Smelt Iron Bars'),\n", ''],
  ['band 1 cuts its own Blank Runes (one good, two recipes)', 'KR-ROWS', 'src/data/trades.js',
    "    kitRow('shaft', 1, 'Saw Oak Planks'),\n", "    kitRow('shaft', 1, 'Saw Oak Planks'),\n    kitRow('cut_stone', 1, 'Cut Blank Runes'),\n"],
  ['band 1 without its crop (Carrot Juice has no carrot from a job)', 'KR-CLOSED', 'src/data/trades.js', "    kitRow('grain', 1, 'Pull Carrots'),\n", ''],
  ['band 1\'s runes have no binder', 'KR-SOURCE', 'src/data/job-faces.js', "remains: Object.freeze(['bones', 'bones', 'bones'", "remains: Object.freeze(['bones', null, 'bones'"],
  ['a recipe row types its own time', 'KR-ROWS', 'src/data/trades.js',
    'Object.freeze({ id: recipeId(kind, band), kind, band, name })', 'Object.freeze({ id: recipeId(kind, band), kind, band, name, ms: 3000 })'],
  ['the catalogue opens a named recipe a rung late', 'KR-RUNG', 'src/core/trades.js', 'const k = out[r.kind], rung = bandRung(k, r.band);', 'const k = out[r.kind], rung = bandRung(k, r.band) + 1;'],
  ['the catalogue names an input from another band', 'KR-SOURCE', 'src/core/trades.js', 'face: faceOf(i.kind, r.band), n: i.n', 'face: faceOf(i.kind, r.band + 1), n: i.n'],
  ['every band opens at the first rung', 'KR-RUNG', 'src/core/trades.js',
    'Math.min(TRADE_PM.rungCount, Math.max(0, Math.floor(Number(band) || 0)) + 1)', '1'],
  ['a band ignores the kind\'s own rung', 'KR-RUNG', 'src/core/trades.js', 'Math.max(kind.opens, Math.min(', 'Math.max(1, Math.min('],
  ['a band past the ladder opens past the last rung', 'KR-RUNG', 'src/core/trades.js', 'Math.min(TRADE_PM.rungCount, Math.max(0,', 'Math.min(99, Math.max(0,'],
  ['an input face with no door', 'KR-SOURCE', 'src/data/trades.js', "shaft: Object.freeze(['normal_plank', 'oak_plank',", "shaft: Object.freeze(['normal_shaft', 'oak_plank',"],
  ['a hunted input face with no door', 'KR-SOURCE', 'src/data/job-faces.js', "remains: Object.freeze(['bones', 'bones'", "remains: Object.freeze(['cellar_dust', 'bones'"],
  ['the store sells at the hero\'s own band', 'KR-STORE', 'src/core/trades.js', 'bandStep(bandOf(heroStep)) - TRADE_PM.storeLag', 'bandStep(bandOf(heroStep))'],
  ['the store sells at the crafted price', 'KR-STORE', 'src/core/trades.js',
    'BigInt(TRADE_PM.storeCeiling) * big(kind.workUh) * BigInt(TRADE_PM.townWageShare) * BigInt(wage(storeStep(heroStep))) * 1000n',
    '1000n * big(kind.workUh) * BigInt(TRADE_PM.townWageShare) * BigInt(wage(storeStep(heroStep))) * 1000n'],
  ['a meal is two hunted hours', 'KR-HOURS', 'src/data/trades.js', "line: 'meal', split: 0.5, effect: 1, opens: 1, from: [share('fish', 1)]", "line: 'meal', split: 0.5, effect: 2, opens: 1, from: [share('fish', 1)]"],
  ['the cap counts the whole list, not a batch (band 1 could never land)', 'KR-BATCH', 'src/data/trades.js',
    'if (b.rows.length > KIT_BATCH_MAX)', 'if (batches.flatMap((x) => x.rows || []).length > KIT_BATCH_MAX)'],
  ['a batch has no cap', 'KR-BATCH', 'src/data/trades.js', "if (b.rows.length > KIT_BATCH_MAX) out.push('batch '", "if (b.rows.length > 999) out.push('batch '"],
  ['the job ignores the trade Level', 'KR-HOURS', 'src/core/trades.js', 'if (rung < kind.opens || rung > TRADE_PM.rungCount || lv(level) < R) return null;', 'if (rung < kind.opens || rung > TRADE_PM.rungCount) return null;'],
];

async function main() {
  const X = await load(ROOT);
  if (!MUTATE) {
    const fails = await runPure(X);
    for (const f of fails) console.log('✗ ' + f);
    console.log(fails.length ? `kit-recipes: ${fails.length} RED` : `kit-recipes: green (${Object.keys(ARMS).join(', ')})`);
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await runPure(X);
  if (clean.length) { console.error('kit-recipes --mutate: the clean tree is red: ' + clean.join(' | ')); process.exit(2); }
  let escaped = 0, harness = 0;
  for (const [name, arm, file, find, repl] of MUTANTS) {
    const dir = mkdtempSync(join(tmpdir(), 'kit-recipes-'));
    try {
      cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true, filter: (s) => !/\.(png|webp|jpg|ogg|mp3|wav)$/i.test(s) });
      const f = join(dir, file);
      const src = readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
      if (src.split(find).length !== 2) { console.error(`HARNESS: ${file} has no single ${JSON.stringify(find.slice(0, 70))}`); process.exit(2); }
      writeFileSync(f, src.replace(find, () => repl));
      let fails;
      try { fails = await runPure(await load(dir), arm); } catch (e) { fails = [harnessFail(arm + ' load', e)]; }
      const v = verdict(fails);
      if (v.kind === 'caught') console.log(`  caught  ${name} (${v.rule}): ${v.line.slice(0, 150)}`);
      else if (v.kind === 'harness') { console.log(`  HARNESS ${name} (${arm}): ${v.why.slice(0, 150)}`); harness++; }
      else { console.log(`  ESCAPED ${name} (${arm})`); escaped++; }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  console.log(escaped || harness ? `kit-recipes --mutate: ${escaped} ESCAPED, ${harness} HARNESS of ${MUTANTS.length}`
    : `kit-recipes --mutate: ${MUTANTS.length}/${MUTANTS.length} caught, each by its named arm`);
  process.exit(escaped ? 1 : harness ? 2 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
