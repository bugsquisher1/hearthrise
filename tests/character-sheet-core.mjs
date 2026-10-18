#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/character-sheet-core.mjs — THE CHARACTER SHEET'S ENGINE HALF, PURE.
//
//   node tests/character-sheet-core.mjs           the rules
//   node tests/character-sheet-core.mjs --mutate  every planted defect must turn a rule RED
//
// mutant-anchors: src/core/progression.js supabase/functions/hr-accrue/character-sheet.js supabase/migrations/2026-10-25-character-sheet.sql
//
//   CS-X1 ONE XP FORMULA: grantXp pays exactly base × (1 + all + gear + combat
//         on a combat skill) with the parts xpMultiplierParts answers, and the
//         sheet's experience bonuses are those same parts (gear, the lasting
//         perks, the buff layer, combat)
//   CS-I1 THE SHEET READS ONLY WHAT ITS FINGERPRINT COVERS: every envelope path
//         characterSheetOf reads is a SHEET_INPUTS path, and SHEET_INPUTS names
//         exactly the parts hr_character_sheet_inputs fingerprints
//   CS-V1 THE ENGINE VERSION RIDES EVERY PUT: runSheet hands the put the
//         deployed payload hash (payload-hash.js), and the stamp the server
//         keeps is md5(inputs || ':' || engine) (hr_character_sheet_stamp)
// Mutants are planted into a temp copy of src/ and supabase/ (never the tree).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { ROOT } from './_client-harness.mjs';

const SHEET = 'supabase/functions/hr-accrue/character-sheet.js';
const MIG = 'supabase/migrations/2026-10-25-character-sheet.sql';

/* Every envelope path read through `o`, recorded as dotted paths. */
function recorder(o, seen, path = '') {
  return new Proxy(o, {
    get(t, k) {
      if (typeof k !== 'string') return t[k];
      const p = path ? path + '.' + k : k;
      if (path === '' || path === 'state') seen.add(p);
      const v = t[k];
      return v && typeof v === 'object' && path === '' && k === 'state' ? recorder(v, seen, p) : v;
    },
    has(t, k) { if (typeof k === 'string' && (path === '' || path === 'state')) seen.add(path ? path + '.' + k : k); return k in t; },
  });
}

async function rules(root) {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(root, p)).href);
  const P = await imp('src/core/progression.js');
  const S = await imp(SHEET);
  const AC = await imp('supabase/functions/hr-accrue/accrual.js');
  const H = await imp('supabase/functions/hr-accrue/payload-hash.js');
  // CS-X1
  const cases = [{ allXP: 0, combatXP: 0, xpB: 0 }, { allXP: 0.05, combatXP: 0.1, xpB: 0.02 }, { allXP: 0.31, combatXP: 0, xpB: 0.15 }, { allXP: 0, combatXP: 0.25, xpB: 0 }];
  for (const c of cases) {
    const bonus = (k) => (k === 'allXP' ? c.allXP : k === 'combatXP' ? c.combatXP : 0);
    const parts = P.xpMultiplierParts(c.xpB, bonus);
    if (parts.gear !== c.xpB || parts.all !== c.allXP || parts.combat !== c.combatXP) fails.push('CS-X1 xpMultiplierParts answered ' + JSON.stringify(parts) + ' for ' + JSON.stringify(c));
    for (const skill of ['attack', 'woodcutting']) {
      const st = { skills: {}, xpFrac: {} };
      const r = P.grantXp(st, skill, 1000, { bonus, xpB: c.xpB, authored: true });
      const want = Math.floor(1000 * (1 + parts.all + parts.gear + (skill === 'attack' ? parts.combat : 0)) + 1e-9);
      if (r.gain !== want) fails.push('CS-X1 grantXp paid ' + r.gain + ' ' + skill + ' XP, the parts say ' + want + ' (' + JSON.stringify(c) + ')');
    }
  }
  const perks = { ok: true, rooms: {}, plots: {}, propertyTier: 0, unlockedRecipes: {}, renownAllXp: 0.03, clanPerks: {}, castle: null };
  const env = { ok: true, state: { combat_style: {} }, skills: { attack: { xp: 4700, level: 20 } }, equipment: { cape: 'chitinweave_cloak' }, buffs: [] };
  const sh = S.characterSheetOf(env, perks, Date.now());
  const lasting = P.xpMultiplierParts(0.01, AC.bonusFor(perks, null));
  if (Math.abs(sh.xp.perks - lasting.all) > 1e-4 || sh.xp.buffs !== 0 || Math.abs(sh.xp.gear - lasting.gear) > 1e-4 || !(sh.xp.gear > 0)) fails.push('CS-X1 the sheet\'s XP parts ' + JSON.stringify(sh.xp) + ' are not grantXp\'s (' + JSON.stringify(lasting) + ')');
  // CS-I1
  const seen = new Set();
  S.characterSheetOf(recorder(JSON.parse(JSON.stringify(env)), seen), perks, Date.now());
  const allowed = new Set(Object.values(S.SHEET_INPUTS).filter(Boolean));
  for (const p of allowed) if (p.includes('.')) allowed.add(p.split('.')[0]);
  for (const p of seen) if (!allowed.has(p)) fails.push('CS-I1 characterSheetOf reads `' + p + '`, which hr_character_sheet_inputs does not fingerprint');
  const sql = readFileSync(join(root, MIG), 'utf8').replace(/\r\n/g, '\n');
  const body = sql.slice(sql.indexOf('create or replace function public.hr_character_sheet_inputs'), sql.indexOf('$$;', sql.indexOf('create or replace function public.hr_character_sheet_inputs')));
  const parts = [...body.matchAll(/^ {4}'([a-z_]+)', /gm)].map((m) => m[1]).sort();
  if (parts.join() !== Object.keys(S.SHEET_INPUTS).sort().join()) fails.push('CS-I1 hr_character_sheet_inputs fingerprints [' + parts.join(', ') + '], SHEET_INPUTS names [' + Object.keys(S.SHEET_INPUTS).sort().join(', ') + ']');
  // CS-V1
  const calls = [];
  const exec = async (text, params) => {
    calls.push({ text, params });
    if (/hr_rate_gate/.test(text)) return [{ allowed: true, state: env, perks, fp: 'f'.repeat(32), now: new Date().toISOString() }];
    return [{ state: env }];
  };
  await S.runSheet({ exec, user: '00000000-0000-4000-8000-000000000001', slot: 0, bucket: 'accrue' });
  const put = calls.find((c) => /hr_character_sheet_put/.test(c.text));
  if (!put || put.params[3] !== H.PAYLOAD_SHA256 || put.params[2] !== 'f'.repeat(32)) fails.push('CS-V1 the put was handed ' + JSON.stringify(put && put.params.slice(0, 4)) + ', not the fingerprint and the payload hash ' + H.PAYLOAD_SHA256);
  if (!/create or replace function public\.hr_character_sheet_stamp[\s\S]*?md5\(coalesce\(p_inputs, ''\) \|\| ':' \|\| coalesce\(p_version, ''\)\)/.test(sql)
      || !/public\.hr_character_sheet_stamp\(p_inputs, p_version\)/.test(sql)
      || !/v_cs\.engine_version = v_engine/.test(sql)) fails.push('CS-V1 the server stamp is not md5(inputs:engine), or the view does not hold the sheet to the latest engine');
  return fails;
}

const MUTANTS = [
  ['grantXp drops the combat part', 'src/core/progression.js', 'const combat = COMBAT_XP_SKILLS.indexOf(skillId) >= 0 ? parts.combat : 0;', 'const combat = 0;'],
  ['the sheet prices its own XP split', SHEET, "perks: round(lasting.all, 4)", "perks: round(lasting.all + now.gear, 4)"],
  ['the sheet reads a key its fingerprint misses', SHEET, "  const equipment = isObj(env.equipment) ? env.equipment : {};", "  const equipment = isObj(env.equipment) ? env.equipment : {}; void env.enchant;"],
  ['the fingerprint stops covering the buffs', MIG, "    'buffs', coalesce((select jsonb_agg(", "    'bufs', coalesce((select jsonb_agg("],
  ['the put is handed a fixed engine version', SHEET, "const version = o.version || PAYLOAD_SHA256;", "const version = o.version || 'unpacked0';"],
  ['the view ignores the engine', MIG, "    v_fresh := v_cs.engine_version = v_engine\n      and", "    v_fresh := true\n      and"],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await rules(ROOT);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'character-sheet-core: ' + fails.length + ' rule(s) RED' : 'character-sheet-core: one XP formula; the sheet reads only what its fingerprint covers; every put carries the engine version');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await rules(ROOT);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  let bad = 0;
  for (const [name, file, from, to] of MUTANTS) {
    const dir = mkdtempSync(join(tmpdir(), 'cs-core-'));
    try {
      for (const d of ['src/core', 'src/data', 'supabase/functions', 'supabase/migrations']) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
      cpSync(join(ROOT, 'src/build-info.js'), join(dir, 'src/build-info.js'));
      const text = readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n');
      if (!text.includes(from)) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
      writeFileSync(join(dir, file), text.replace(from, to));
      const fails = await rules(dir);
      if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
      else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  console.log(bad ? 'character-sheet-core --mutate: ' + bad + ' escaped' : 'character-sheet-core --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
