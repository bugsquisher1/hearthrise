#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bury-rate.mjs — A BURIED BONE PAYS EXACTLY ITS PRAYER XP.
//
// Live evidence (prod ledger 34807, 2026-10-19 06:37 UTC): an artisan
// bury_bones accrue took 3 bones and credited Prayer +5, while recipes.js says
// 4.5 a bone (13.5). Root cause: the pacing dial (src/core/pacing.js PACE.xp
// 0.39) scaled every earned grant but farming, so 13.5 x 0.39 = 5.27 paid 5 and
// carried 0.27. The core rebuild makes Prayer a combat skill, exempt from the
// dial, and sets the bone's XP from the Prayer curve (src/data/core-model.js
// PRAYER_BURY). Claims:
//   B1  the constant is the curve's: skillXp(prayer, refPrayer) / (bonesPerHour x
//       hours to refLevel at LEVEL_GUARD's rate), to the half
//   B2  burying N bones through the real edge accrual (computeAccrual, artisan)
//       pays Prayer XP = N x xpPerBone EXACTLY: whole XP in delta.xp, the rest in
//       delta.xp_frac, carried across windows (a 0.5 carried in makes 3 bones
//       pay 47, not 46)
//   B3  no rite pays less than the rite below it (the ladder keeps its order)
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
    XP: await import(u('src/core/xp.js')),
    R: await import(u('src/data/recipes.js')),
    ITEMS: (await import(u('src/data/items.js'))).ITEMS,
    MONSTERS: (await import(u('src/data/monsters.js'))).MONSTERS,
  };
}

/* One artisan window burying `n` bones (the window is long enough for exactly n, the bag holds n). */
function bury(M, n, frac) {
  const ms = 3600000;
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
    const B = M.CM.PRAYER_BURY; const G = M.CM.LEVEL_GUARD;
    let h = 0;
    for (let l = 1; l < B.refLevel; l++) h += (M.XP.charXpForLevel(l + 1) - M.XP.charXpForLevel(l)) / (G.xpPerHourPerLevel * l);
    const want = Math.round((M.XP.skillXpForLevel('prayer', B.refPrayer) / (B.bonesPerHour * h)) * 2) / 2;
    if (B.xpPerBone !== want) return [`xpPerBone is ${B.xpPerBone}; the Prayer curve says ${want}`];
    const row = M.R.ARTISAN_RECIPES.prayer.find((r) => r.id === 'bury_bones');
    if (!row || row.xp !== B.xpPerBone) return [`bury_bones pays ${row && row.xp}, PRAYER_BURY says ${B.xpPerBone}`];
    return [];
  },
  B2: (M) => {
    const out = [];
    const rate = M.CM.PRAYER_BURY.xpPerBone;
    for (const [n, f0] of [[1], [2], [3], [7], [3, 0.5]]) {
      const r = bury(M, n, f0);
      const d = r && r.delta;
      if (!d || !d.items || d.items.bones !== -n) { out.push(`${n} bones: the window buried ${d && d.items && -d.items.bones} (${r && (r.reason || r.skip)})`); continue; }
      const whole = (d.xp && d.xp.prayer) || 0;
      const frac = d.xp_frac && d.xp_frac.prayer !== undefined ? d.xp_frac.prayer : (f0 || 0);
      const paid = whole + frac - (f0 || 0);
      if (Math.abs(paid - n * rate) > 1e-9) out.push(`${n} bones${f0 ? ' (carrying ' + f0 + ')' : ''} paid ${whole} XP + ${frac} carried = ${paid}, not ${n} x ${rate} = ${n * rate}`);
    }
    return out;
  },
  B3: (M) => {
    const rows = M.R.ARTISAN_RECIPES.prayer.slice().sort((a, b) => a.req - b.req);
    const out = [];
    for (let i = 1; i < rows.length; i++) if (rows[i].xp < rows[i - 1].xp) out.push(`${rows[i].id} pays ${rows[i].xp}, below ${rows[i - 1].id}'s ${rows[i - 1].xp}`);
    return out;
  },
};

const MUTANTS = [
  { claim: 'B2', name: 'the pacing dial scales Prayer again (the live 5-for-13.5 bug)', file: 'src/core/pacing.js',
    from: "'defense', 'prayer']", to: "'defense']" },
  { claim: 'B2', name: 'the remainder is dropped (per-grant floor)', file: 'src/core/progression.js',
    from: '  if (state.xpFrac && typeof state.xpFrac === \'object\') {', to: '  if (false) {' },
  { claim: 'B1', name: 'the bone pays the old 4.5', file: 'src/data/core-model.js',
    from: 'xpPerBone: 15.5,', to: 'xpPerBone: 4.5,' },
  { claim: 'B3', name: 'a rite loses its ladder ratio', file: 'src/data/recipes.js',
    from: 'xp:riteXp(15),', to: 'xp:riteXp(1),' },
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
