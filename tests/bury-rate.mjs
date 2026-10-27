#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bury-rate.mjs — A BURIED BONE PAYS EXACTLY ITS PRAYER XP.
//
// Live evidence (prod ledger 34807, 2026-10-19 06:37 UTC): an artisan
// bury_bones accrue took 3 bones and credited Prayer +5, while recipes.js says
// 4.5 a bone (13.5). Root cause: the pacing dial (src/core/pacing.js PACE.xp
// 0.39) scales every bench grant, so 13.5 x 0.39 = 5.27 paid 5 and carried 0.27
// (correct arithmetic on a rate authored before the dial was understood). The
// core rebuild sets the bone's PAID XP from the Prayer curve (src/data/core-model.js
// FLAME_FUEL) and authors the row pre-dial. Claims:
//   B1  the constant is the curve's: skillXp(prayer, refPrayer) / (bonesPerHour x
//       hours to refLevel at LEVEL_GUARD's rate), to the tenth; and the row's
//       authored XP x PACE.xp is exactly that
//   B2  burying N bones through the real edge accrual (computeAccrual, artisan)
//       pays Prayer XP = N x xpPerBone EXACTLY: whole XP in delta.xp, the rest in
//       delta.xp_frac, carried across windows (a 0.5 carried in makes 3 bones
//       pay 47.3 -> 47 r 0.3, not 46)
//
//   B3  BURYING KEEPS UP WITH A HUNT (Andy live 10-21: "700 bones after a few
//       hours, burying takes forever"; designer 2026-10-21: 400 ms authored):
//       700 bones bury in one 8-minute window of the real accrual, all of them
//
//   node tests/bury-rate.mjs            run
//   node tests/bury-rate.mjs --mutate   each planted defect must turn a claim red
// ════════════════════════════════════════════════════════════════════════
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FROM = Date.UTC(2026, 9, 19, 6, 0, 0);
const UID = '00000000-0000-4000-8000-0000000b0e01';

async function load(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  return {
    AC: await import(u('supabase/functions/hr-accrue/accrual.js')),
    CAT: await import(u('supabase/functions/hr-accrue/catalogue.js')),
    CM: await import(u('src/data/core-model.js')),
    PACE: (await import(u('src/core/pacing.js'))).PACE,
    XP: await import(u('src/core/xp.js')),
    R: await import(u('src/data/recipes.js')),
    ITEMS: (await import(u('src/data/items.js'))).ITEMS,
    MONSTERS: (await import(u('src/data/monsters.js'))).MONSTERS,
  };
}

/* One artisan window burying `n` bones (the bag holds n; the window is an hour, or `ms`). */
function bury(M, n, frac, ms = 3600000) {
  return M.AC.computeAccrual({
    userId: UID, slot: 0, nowMs: FROM + ms, accruedToMs: FROM, activeSinceMs: FROM,
    activeKind: 'artisan', activeId: 'bury_bones', capMs: 12 * 3600000, seed: 7,
    hp: 150, maxHp: 150, gold: 0, skills: { prayer: 0 }, xpFrac: frac === undefined ? {} : { prayer: frac },
    equipment: {}, inventory: { bones: n }, toolCarry: {}, perks: null, unlockedRecipes: {},
    items: M.ITEMS, monsters: M.MONSTERS, nodes: M.CAT.GATHER_NODES, recipes: M.CAT.ARTISAN_RECIPES_ALL,
  });
}

const CLAIMS = {
  B1: (M) => {
    const B = M.CM.FLAME_FUEL; const G = M.CM.LEVEL_GUARD;
    let h = 0;
    for (let l = 1; l < B.refLevel; l++) h += (M.XP.charXpForLevel(l + 1) - M.XP.charXpForLevel(l)) / (G.xpPerHourPerLevel * l);
    const want = Math.round((M.XP.skillXpForLevel('prayer', B.refPrayer) / (B.bonesPerHour * h)) * 10) / 10;
    if (B.xpPerBone !== want) return [`xpPerBone is ${B.xpPerBone}; the Prayer curve says ${want}`];
    if (Math.round(B.recipeXp * M.PACE.xp * 1e6) !== Math.round(B.xpPerBone * 1e6)) {
      return [`the authored ${B.recipeXp} x the dial ${M.PACE.xp} pays ${B.recipeXp * M.PACE.xp}, not ${B.xpPerBone}`];
    }
    const row = M.R.ARTISAN_RECIPES.prayer.find((r) => r.id === 'bury_bones');
    if (!row || row.xp !== B.recipeXp) return [`bury_bones authors ${row && row.xp}, FLAME_FUEL says ${B.recipeXp}`];
    return [];
  },
  B2: (M) => {
    const out = [];
    const rate = M.CM.FLAME_FUEL.xpPerBone;
    for (const [n, f0] of [[1], [2], [3], [7], [3, 0.5]]) {
      const r = bury(M, n, f0);
      const d = r && r.delta;
      if (!d || !d.items || d.items.bones !== -n) { out.push(`${n} bones: the window buried ${d && d.items && -d.items.bones} (${r && (r.reason || r.skip)})`); continue; }
      const whole = (d.xp && d.xp.prayer) || 0;
      const frac = d.xp_frac && d.xp_frac.prayer !== undefined ? d.xp_frac.prayer : (f0 || 0);
      const paid = whole + frac - (f0 || 0);
      if (Math.round(paid * 1e6) !== Math.round(n * rate * 1e6)) out.push(`${n} bones${f0 ? ' (carrying ' + f0 + ')' : ''} paid ${whole} XP + ${frac} carried = ${paid}, not ${n} x ${rate} = ${n * rate}`);
    }
    return out;
  },
  B3: (M) => {
    const r = bury(M, 700, undefined, 8 * 60000);
    const got = r && r.delta && r.delta.items ? -(r.delta.items.bones || 0) : 0;
    return got === 700 ? [] : [`an 8-minute window buried ${got} of 700 bones (${r && (r.reason || r.skip)}): burying cannot keep up with a hunt's bones`];
  },
};

const MUTANTS = [
  { claim: 'B3', name: 'Bury Bones back at 1,200 ms (700 bones in 22 minutes)', file: 'src/data/recipes.js',
    from: "output:null, xp:FLAME_FUEL.recipeXp, req:1,  ms:400},", to: "output:null, xp:FLAME_FUEL.recipeXp, req:1,  ms:1200}," },
  { claim: 'B2', name: 'Prayer leaves the dial (a bone pays 40, the authored pre-dial value)', file: 'src/core/pacing.js',
    from: "'magic', 'defense'];", to: "'magic', 'defense', 'prayer'];" },
  { claim: 'B2', name: 'the remainder is dropped (per-grant floor)', file: 'src/core/progression.js',
    from: '  if (state.xpFrac && typeof state.xpFrac === \'object\') {', to: '  if (false) {' },
  { claim: 'B1', name: 'the bone authors the old 4.5', file: 'src/data/recipes.js',
    from: 'xp:FLAME_FUEL.recipeXp,', to: 'xp:4.5,' },
  { claim: 'B1', name: 'the paid rate drifts off the curve', file: 'src/data/core-model.js',
    from: 'xpPerBone: 15.6,', to: 'xpPerBone: 15.5,' },
];

async function runAll(root, only) {
  const M = await load(root);
  const res = {};
  for (const [k, f] of Object.entries(CLAIMS)) if (!only || only.includes(k)) res[k] = f(M);
  return res;
}

async function main() {
  if (process.argv.includes('--mutate')) {
    let bad = 0;
    for (const m of MUTANTS) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-bury-'));
      try {
        for (const d of ['src/core', 'src/data', 'supabase/functions/hr-accrue']) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
        cpSync(join(ROOT, 'src/build-info.js'), join(dir, 'src/build-info.js'));
        const p = join(dir, m.file);
        const src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(m.from).length !== 2) { console.error(`✗ mutant "${m.name}": marker not found exactly once`); bad++; continue; }
        writeFileSync(p, src.replace(m.from, () => m.to));
        const r = await runAll(dir, [m.claim]);
        if (r[m.claim].length) console.log(`✓ ${m.claim} goes red on: ${m.name}`);
        else { console.error(`✗ ${m.claim} stayed GREEN on: ${m.name}`); bad++; }
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    console.log(bad ? `bury-rate --mutate: ${bad} mutant(s) survived` : `bury-rate --mutate: all ${MUTANTS.length} mutants killed`);
    process.exit(bad ? 1 : 0);
  }
  const res = await runAll(ROOT);
  let bad = 0;
  for (const [k, p] of Object.entries(res)) {
    if (p.length) { bad++; for (const x of p) console.error(`✗ ${k}: ${x}`); } else console.log(`✓ ${k}`);
  }
  console.log(bad ? `bury-rate: ${bad} claim(s) red` : `bury-rate: all ${Object.keys(res).length} claims green`);
  process.exit(bad ? 1 : 0);
}

if (isMain(import.meta.url)) main();
