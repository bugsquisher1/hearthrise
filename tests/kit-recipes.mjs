#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/kit-recipes.mjs — THE KIT TRADES' SAMPLE HOLDS ITS RULE (lane/k1-kit-trades-sample, game designer, 2026-11-26;
//   docs/design/redesign/09-crafting.md section 4.9). src/data/trades.js KIT_RECIPES (the five named rows and the band's faces),
//   src/core/trades.js (bandRung, and the catalogue that resolves them as named), src/data/catalogue-coherence.js (the live doors).
//
//   node tests/kit-recipes.mjs            the guard (pure, Node)
//   node tests/kit-recipes.mjs --mutate   every planted defect must turn its named arm red (each on a temp copy of src/)
//
// mutant-anchors: src/core/trades.js src/data/trades.js
//   (the mutants patch a temp copy of src/; no tracked file is patched)
// ci-step: economy-selftests | Kit trades sample - one recipe a trade at band 0, rung by band, every face sourced and used, the store the fallback
// ci-run: node tests/kit-recipes.mjs
// ci-run: node tools/mutant-gate.mjs node tests/kit-recipes.mjs --mutate
//
//   KR-ROWS    the sample is at most five rows, one a trade: Cooking, Smithing, Woodcrafting, Runecutting and one gathering trade; a row
//              holds only its kind, band, derived id and a short label (no time, count, XP or price); validate() is clean
//   KR-RUNG    a band's recipe opens at the band's rung (band b at rung b + 1, the last rung for every band past it, never before the
//              kind's own rung), swept over every kind and bands 0 to 12; every sample row opens at trade Level 1, so the first day can
//              make it
//   KR-SOURCE  every input of every row names a face at the row's band that another row makes or that is a live item with a door
//              (catalogue-coherence itemSources); every hunted input names its stream's face with a door; every output is used by
//              another row or is a live item with a use (itemUses); a NEW face is no ITEMS row and is made and used inside the sample
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

async function load(root) {
  const imp = (p) => import(pathToFileURL(join(root, p)).href);
  const [T, D, CC, IT, SK] = await Promise.all([imp('src/core/trades.js'), imp('src/data/trades.js'), imp('src/data/catalogue-coherence.js'), imp('src/data/items.js'), imp('src/data/store-kit.js')]);
  return { T, D, KR: D, ITEMS: IT.ITEMS, sources: CC.itemSources(), uses: CC.itemUses(), STORE_KIT: SK.STORE_KIT, ...catalogueOf(T) };
}

/* The catalogue is the rows' consumer: a row it refuses is KR-ROWS's red (the arm reads the refusal), never a load that throws */
function catalogueOf(T) {
  try { return { cat: T.tradeCatalogue(), refused: null }; } catch (e) { return { cat: null, refused: String((e && e.message) || e) }; }
}

/* catalogue-coherence's doors: id -> [labels] (a Map) */
const has = (m, id) => (m.get(id) || []).length > 0;

const ARMS = {
  'KR-ROWS'({ KR, cat, refused }) {
    const out = [];
    if (refused) return ['KR-ROWS the catalogue refuses the rows: ' + refused];
    for (const p of KR.validateKitRecipes()) out.push('KR-ROWS ' + p);
    for (const p of KR.validate()) out.push('KR-ROWS trades: ' + p);
    const rows = KR.KIT_RECIPES;
    if (rows.length !== 5) out.push('KR-ROWS the sample is ' + rows.length + ' rows, not five');
    const trades = rows.map((r) => cat.kinds[r.kind] && cat.kinds[r.kind].trade);
    for (const t of ['cooking', 'smithing', 'woodcrafting', 'runecutting']) if (trades.filter((x) => x === t).length !== 1) out.push('KR-ROWS ' + t + ' has ' + trades.filter((x) => x === t).length + ' rows, not one');
    const gather = rows.filter((r) => cat.kinds[r.kind] && cat.kinds[r.kind].stage === 'gather');
    if (gather.length !== 1) out.push('KR-ROWS ' + gather.length + ' gathering rows, not one');
    for (const r of rows) {
      const extra = Object.keys(r).filter((k) => !['id', 'kind', 'band', 'name'].includes(k));
      if (extra.length) out.push('KR-ROWS ' + r.id + ' types ' + extra.join(', '));
      if (r.id !== KR.recipeId(r.kind, r.band)) out.push('KR-ROWS ' + r.id + ' is not its derived id');
    }
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
      if (r.R !== 1) out.push(`KR-RUNG ${r.id} opens at trade Level ${r.R}: the first day cannot make it`);
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
      if (!used.has(f) && !(live(f) && has(uses, f))) out.push(`KR-SOURCE ${id}: output ${f} is used by no row and has no use`);
    }
    for (const id of Object.keys(KR.NEW_FACES)) {
      if (ITEMS[id]) out.push(`KR-SOURCE new face ${id} is an ITEMS row before its door exists`);
      if (!made.has(id) || !used.has(id)) out.push(`KR-SOURCE new face ${id} is not made and used inside the sample`);
    }
    for (const f of made.keys()) if (f && !live(f) && !KR.NEW_FACES[f]) out.push(`KR-SOURCE ${f} is neither a live item nor a new face`);
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
  ['a sixth recipe and a second Smithing row before the sample is read', 'KR-ROWS', 'src/data/trades.js',
    "  kitRow('rune_fire', 0, 'Cut Chalked Fire Runes'),\n", "  kitRow('rune_fire', 0, 'Cut Chalked Fire Runes'),\n  kitRow('honing_stone', 0, 'Grind Coarse Whetstones'),\n"],
  ['a recipe row types its own time', 'KR-ROWS', 'src/data/trades.js',
    'Object.freeze({ id: recipeId(kind, band), kind, band, name })', 'Object.freeze({ id: recipeId(kind, band), kind, band, name, ms: 3000 })'],
  ['the catalogue opens a named recipe a rung late', 'KR-RUNG', 'src/core/trades.js', 'const k = out[r.kind], rung = bandRung(k, r.band);', 'const k = out[r.kind], rung = bandRung(k, r.band) + 1;'],
  ['the catalogue names an input from another band', 'KR-SOURCE', 'src/core/trades.js', 'face: faceOf(i.kind, r.band), n: i.n', 'face: faceOf(i.kind, r.band + 1), n: i.n'],
  ['every band opens at the first rung', 'KR-RUNG', 'src/core/trades.js',
    'Math.min(TRADE_PM.rungCount, Math.max(0, Math.floor(Number(band) || 0)) + 1)', '1'],
  ['a band ignores the kind\'s own rung', 'KR-RUNG', 'src/core/trades.js', 'Math.max(kind.opens, Math.min(', 'Math.max(1, Math.min('],
  ['a band past the ladder opens past the last rung', 'KR-RUNG', 'src/core/trades.js', 'Math.min(TRADE_PM.rungCount, Math.max(0,', 'Math.min(99, Math.max(0,'],
  ['an input face with no door', 'KR-SOURCE', 'src/data/trades.js', "shaft: Object.freeze(['normal_plank'])", "shaft: Object.freeze(['normal_shaft'])"],
  ['a hunted input face with no door', 'KR-SOURCE', 'src/data/trades.js', "remains: Object.freeze(['bones'])", "remains: Object.freeze(['cellar_dust'])"],
  ['the store sells at the hero\'s own band', 'KR-STORE', 'src/core/trades.js', 'bandStep(bandOf(heroStep)) - TRADE_PM.storeLag', 'bandStep(bandOf(heroStep))'],
  ['the store sells at the crafted price', 'KR-STORE', 'src/core/trades.js',
    'BigInt(TRADE_PM.storeCeiling) * big(kind.workUh) * BigInt(TRADE_PM.townWageShare) * BigInt(wage(storeStep(heroStep))) * 1000n',
    '1000n * big(kind.workUh) * BigInt(TRADE_PM.townWageShare) * BigInt(wage(storeStep(heroStep))) * 1000n'],
  ['a meal is two hunted hours', 'KR-HOURS', 'src/data/trades.js', "line: 'meal', split: 0.5, effect: 1, opens: 1, from: [share('fish', 1)]", "line: 'meal', split: 0.5, effect: 2, opens: 1, from: [share('fish', 1)]"],
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
