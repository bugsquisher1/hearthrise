// ════════════════════════════════════════════════════════════════════════
// tests/companion-promise-parity.mjs — A COMPANION'S CARD PROMISES ONLY WHAT
// THE ENGINE PAYS.
//
// src/render/companion-lines.js is the one source the Stable, the paper-doll
// and the getBonus layer read. This pins it to src/core/companion-perk.js (the
// engine's definition) and to the flat farm-yield rows hr_farm_harvest pays,
// and statically forbids the machinery that used to promise more: a proc read
// on the three companion surfaces, and a getEquipmentStats wrapper anywhere in
// src/** (the engine pays no companion combat stat).
//
//   node tests/companion-promise-parity.mjs             gate (exit 0 = green)
//   node tests/companion-promise-parity.mjs --selftest  plants c1..c3, each caught by name
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { companionPaidLines } from '../src/render/companion-lines.js';
import { COMPANION_KEYS, companionKeyBonus, companionXpToReach } from '../src/core/companion-perk.js';
import { COMPANIONS } from '../src/data/companions.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FARM_SQL = 'supabase/migrations/2026-08-22-farm-catalogues.generated.sql';
const NO_PROC_FILES = ['src/features/companions.js', 'src/render/equipment-doll.js', 'src/features/pet-session.js'];
const WRAPPER = /window\.getEquipmentStats\s*=\s*function/;

function srcFiles(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) srcFiles(rel, out);
    else if (name.endsWith('.js')) out.push(rel);
  }
  return out;
}

/** `companion:<id>` -> farm_yield, parsed from the generated catalogue. */
function farmRows(sqlText) {
  const rows = {};
  for (const m of sqlText.matchAll(/\('companion:([a-z_]+)',\s*(\d+)\)/g)) rows[m[1]] = Number(m[2]);
  return rows;
}

function loadReal() {
  const files = {};
  for (const rel of srcFiles('src')) files[relative(ROOT, join(ROOT, rel)).split('\\').join('/')] = readFileSync(join(ROOT, rel), 'utf8');
  return { lines: companionPaidLines, farm: farmRows(readFileSync(join(ROOT, FARM_SQL), 'utf8')), files };
}

/** Pure over its inputs. Returns [message], each prefixed by its assertion name. */
export function check({ lines, farm, files }) {
  const problems = [];
  const xp30 = companionXpToReach(30);
  if (!Object.keys(farm).length) problems.push(`CPR-0: no companion farm-yield row parsed from ${FARM_SQL}`);
  for (const [id, def] of Object.entries(COMPANIONS)) {
    for (const xp of [0, xp30]) {
      const got = lines(id, xp);
      for (const l of got) {
        if (!COMPANION_KEYS.includes(l.key)) {
          problems.push(`CPR-1 unpaid key: ${id}@${xp} renders "${l.key}", which the engine never pays`);
          continue;
        }
        const want = l.key === 'farmYield' ? `+${farm[id] || 0} crop` : `+${Math.round(companionKeyBonus(l.key, { id, xp }) * 100)}%`;
        if (l.text !== want) problems.push(`CPR-2 value: ${id}@${xp} ${l.key} renders "${l.text}", the engine pays "${want}"`);
        if (def.proc && def.proc.label && l.text.includes(def.proc.label)) {
          problems.push(`CPR-3 proc promise: ${id}@${xp} line "${l.text}" carries its proc label`);
        }
      }
      for (const key of COMPANION_KEYS) {
        const pays = key === 'farmYield' ? (farm[id] || 0) : companionKeyBonus(key, { id, xp });
        if (pays && !got.some((l) => l.key === key)) problems.push(`CPR-2 value: ${id}@${xp} pays ${key} but renders no line for it`);
      }
    }
  }
  for (const rel of NO_PROC_FILES) {
    if (/\.proc\b/.test(files[rel] || '')) problems.push(`CPR-4 proc read: ${rel} reads a companion .proc — no proc is paid`);
  }
  for (const [rel, text] of Object.entries(files)) {
    if (WRAPPER.test(text)) problems.push(`CPR-5 equipment wrapper: ${rel} wraps window.getEquipmentStats — the engine pays no companion combat stat`);
  }
  return problems;
}

function selftest() {
  const real = loadReal();
  const plants = {
    c1: [{ ...real, lines: (id, xp) => real.lines(id, xp).concat([{ key: 'strB', label: 'STR', text: '+1' }]) }, 'CPR-1'],
    c2: [{ ...real, files: { ...real.files, 'src/features/companions.js': real.files['src/features/companions.js'] + '\nconst l = def.proc.label;\n' } }, 'CPR-4'],
    c3: [{ ...real, files: { ...real.files, 'src/legacy.js': real.files['src/legacy.js'] + '\nwindow.getEquipmentStats = function(){ return {}; };\n' } }, 'CPR-5'],
  };
  let ok = check(real).length === 0;
  if (!ok) console.error('SELFTEST: the unplanted run is red');
  for (const [name, [input, tag]] of Object.entries(plants)) {
    const caught = check(input).some((p) => p.startsWith(tag));
    console.log(`  ${caught ? '✓' : '✗'} ${name} caught by ${tag}`);
    ok = ok && caught;
  }
  return ok;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1);
  const problems = check(loadReal());
  if (problems.length) {
    console.error('COMPANION-PROMISE-PARITY FAILED:\n' + problems.map((p) => '  ✗ ' + p).join('\n'));
    process.exit(1);
  }
  console.log(`companion-promise-parity: ${Object.keys(COMPANIONS).length} companions render only engine-paid lines at L1 and L30; no proc read, no equipment wrapper.`);
  process.exit(0);
}
