#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hearth-fuel-rate.mjs — A BONE BURNT IN THE GREAT HEARTH PAYS EXACTLY ITS INNER FLAME XP.
// (Was tests/bury-rate.mjs: Tyler 2026-10-25, Inner Flame replaces Prayer and its burying.)
//
// Live evidence (prod ledger 34807, 2026-10-19 06:37 UTC): an artisan
// bury_bones accrue took 3 bones and credited +5, while recipes.js said
// 4.5 a bone (13.5). Root cause: the pacing dial (src/core/pacing.js PACE.xp
// 0.39) scales every bench grant, so 13.5 x 0.39 = 5.27 paid 5 and carried 0.27
// (correct arithmetic on a rate authored before the dial was understood). The
// core rebuild sets the bone's PAID XP from the curve (src/data/core-model.js
// FLAME_FUEL) and authors the row pre-dial. Claims:
//   B1  the constant is the curve's: skillXp(inner_flame, refFlame) / (bonesPerHour x
//       hours to refLevel at LEVEL_GUARD's rate), to the tenth; and the row's
//       authored XP x PACE.xp is exactly that
//   B2  fuelling the Hearth with N bones through the real edge accrual (computeAccrual,
//       artisan) pays Inner Flame XP = N x xpPerBone EXACTLY: whole XP in delta.xp, the
//       rest in delta.xp_frac, carried across windows (a 0.5 carried in makes 3 bones
//       pay 47.3 -> 47 r 0.3, not 46)
//   B3  THE HEARTH KEEPS UP WITH A HUNT (Andy live 10-21: "700 bones after a few
//       hours, burying takes forever"; designer 2026-10-21: 400 ms authored):
//       700 bones burn in one 8-minute window of the real accrual, all of them
//   B4  A BONELESS CREATURE'S FUEL IS ITS BONES (Tyler 2026-10-25): Lamp Jelly, Dry Husk
//       and Pithwood each pay exactly what a bone pays, through the same accrual
//
//   node tests/hearth-fuel-rate.mjs            run
//   node tests/hearth-fuel-rate.mjs --mutate   each planted defect must turn a claim red
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
    /* the family fuels (a boneless body's bones), from the data so a new family is checked as it lands */
    FAMILY: (await import(u('src/data/hearth.js'))).FAMILY_FUELS,
  };
}

/* One artisan window fuelling the Hearth with `n` of `item` (the bag holds n; the window is an hour, or `ms`). */
function fuel(M, n, frac, ms = 3600000, item = 'bones') {
  return M.AC.computeAccrual({
    userId: UID, slot: 0, nowMs: FROM + ms, accruedToMs: FROM, activeSinceMs: FROM,
    activeKind: 'artisan', activeId: 'fuel_' + item, capMs: 12 * 3600000, seed: 7,
    hp: 150, maxHp: 150, gold: 0, skills: { inner_flame: 0 }, xpFrac: frac === undefined ? {} : { inner_flame: frac },
    equipment: {}, inventory: { [item]: n }, toolCarry: {}, perks: null, unlockedRecipes: {},
    items: M.ITEMS, monsters: M.MONSTERS, nodes: M.CAT.GATHER_NODES, recipes: M.CAT.ARTISAN_RECIPES_ALL,
  });
}

/* What a window of `n` paid ({ paid } or a problem string). */
function paidOf(M, n, f0, item) {
  const r = fuel(M, n, f0, undefined, item);
  const d = r && r.delta;
  if (!d || !d.items || d.items[item] !== -n) return `${n} ${item}: the window burnt ${d && d.items && -d.items[item]} (${r && (r.reason || r.skip)})`;
  const whole = (d.xp && d.xp.inner_flame) || 0;
  const frac = d.xp_frac && d.xp_frac.inner_flame !== undefined ? d.xp_frac.inner_flame : (f0 || 0);
  return { paid: whole + frac - (f0 || 0), whole, frac };
}

const CLAIMS = {
  B1: (M) => {
    const B = M.CM.FLAME_FUEL; const G = M.CM.LEVEL_GUARD;
    let h = 0;
    for (let l = 1; l < B.refLevel; l++) h += (M.XP.charXpForLevel(l + 1) - M.XP.charXpForLevel(l)) / (G.xpPerHourPerLevel * l);
    const want = Math.round((M.XP.skillXpForLevel('inner_flame', B.refFlame) / (B.bonesPerHour * h)) * 10) / 10;
    if (B.xpPerBone !== want) return [`xpPerBone is ${B.xpPerBone}; the Inner Flame curve says ${want}`];
    if (Math.round(B.recipeXp * M.PACE.xp * 1e6) !== Math.round(B.xpPerBone * 1e6)) {
      return [`the authored ${B.recipeXp} x the dial ${M.PACE.xp} pays ${B.recipeXp * M.PACE.xp}, not ${B.xpPerBone}`];
    }
    const row = M.R.ARTISAN_RECIPES.inner_flame.find((r) => r.id === 'fuel_bones');
    if (!row || row.xp !== B.recipeXp) return [`fuel_bones authors ${row && row.xp}, FLAME_FUEL says ${B.recipeXp}`];
    return [];
  },
  B2: (M) => {
    const out = [];
    const rate = M.CM.FLAME_FUEL.xpPerBone;
    for (const [n, f0] of [[1], [2], [3], [7], [3, 0.5]]) {
      const p = paidOf(M, n, f0, 'bones');
      if (typeof p === 'string') { out.push(p); continue; }
      if (Math.round(p.paid * 1e6) !== Math.round(n * rate * 1e6)) out.push(`${n} bones${f0 ? ' (carrying ' + f0 + ')' : ''} paid ${p.whole} XP + ${p.frac} carried = ${p.paid}, not ${n} x ${rate} = ${n * rate}`);
    }
    return out;
  },
  B3: (M) => {
    const r = fuel(M, 700, undefined, 8 * 60000);
    const got = r && r.delta && r.delta.items ? -(r.delta.items.bones || 0) : 0;
    return got === 700 ? [] : [`an 8-minute window burnt ${got} of 700 bones (${r && (r.reason || r.skip)}): the Hearth cannot keep up with a hunt's bones`];
  },
  B4: (M) => {
    const out = M.FAMILY.length ? [] : ['no family fuels in src/data/hearth.js FAMILY_FUELS'];
    for (const item of M.FAMILY) {
      const bone = paidOf(M, 7, undefined, 'bones');
      const fam = paidOf(M, 7, undefined, item);
      if (typeof fam === 'string') { out.push(fam); continue; }
      if (typeof bone === 'string' || Math.round(fam.paid * 1e6) !== Math.round(bone.paid * 1e6)) out.push(`7 ${item} paid ${fam.paid}, 7 bones ${bone.paid}: a family fuel is a bone`);
    }
    return out;
  },
};

const MUTANTS = [
  { claim: 'B3', name: 'a bone back at 1,200 ms (700 bones in 22 minutes)', file: 'src/data/hearth.js',
    from: "fuel('bones', FLAME_FUEL.recipeXp, 1, 400, 'fuel_bone'),", to: "fuel('bones', FLAME_FUEL.recipeXp, 1, 1200, 'fuel_bone')," },
  { claim: 'B2', name: 'Inner Flame leaves the dial (a bone pays 40, the authored pre-dial value)', file: 'src/core/pacing.js',
    from: "'magic', 'defense'];", to: "'magic', 'defense', 'inner_flame'];" },
  { claim: 'B2', name: 'the remainder is dropped (per-grant floor)', file: 'src/core/progression.js',
    from: '  if (state.xpFrac && typeof state.xpFrac === \'object\') {', to: '  if (false) {' },
  { claim: 'B1', name: 'the bone authors the old 4.5', file: 'src/data/hearth.js',
    from: "fuel('bones', FLAME_FUEL.recipeXp,", to: "fuel('bones', 4.5," },
  { claim: 'B1', name: 'the paid rate drifts off the curve', file: 'src/data/core-model.js',
    from: 'xpPerBone: 15.6,', to: 'xpPerBone: 15.5,' },
  { claim: 'B4', name: 'Lamp Jelly pays less than a bone', file: 'src/data/hearth.js',
    from: "FAMILY_FUELS.map((item) => fuel(item, FLAME_FUEL.recipeXp,", to: "FAMILY_FUELS.map((item) => fuel(item, item === 'lamp_jelly' ? 20 : FLAME_FUEL.recipeXp," },
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
      const dir = mkdtempSync(join(tmpdir(), 'hr-hearth-fuel-'));
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
    console.log(bad ? `hearth-fuel-rate --mutate: ${bad} mutant(s) survived` : `hearth-fuel-rate --mutate: all ${MUTANTS.length} mutants killed`);
    process.exit(bad ? 1 : 0);
  }
  const res = await runAll(ROOT);
  let bad = 0;
  for (const [k, p] of Object.entries(res)) {
    if (p.length) { bad++; for (const x of p) console.error(`✗ ${k}: ${x}`); } else console.log(`✓ ${k}`);
  }
  console.log(bad ? `hearth-fuel-rate: ${bad} claim(s) red` : `hearth-fuel-rate: all ${Object.keys(res).length} claims green`);
  process.exit(bad ? 1 : 0);
}

if (isMain(import.meta.url)) main();
