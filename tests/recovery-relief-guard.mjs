#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/recovery-relief-guard.mjs — THE R10 STANDING RULE, AS A GUARD.
//
//   node tests/recovery-relief-guard.mjs             # the guard
//   node tests/recovery-relief-guard.mjs --selftest  # every mutation must be caught
//
// ── THE RULE (Designer, Recovery rev. 2 §9, 2026-09-06) ────────────────────
// NOTHING IN ANY CATALOGUE MAY SHORTEN, SKIP OR REFUND RECOVERY, AND NOTHING MAY
// TOUCH A DEATH COUNTER. Not a trait, not an unlock, not a gold-ladder rung, not
// a Quartermaster offer, not a clan bond, not a perk, not a renown rank, not a
// glyph, not a companion. Relief is bought with FOOD (`hr_rest` — see
// supabase/migrations/2026-09-06-recovering-until.sql §5) or it is not bought.
//
// ── WHY THIS IS A GUARD AND NOT A NOTE IN A DESIGN DOC ─────────────────────
// The Recovery ladder is the only mechanic in Hearthrise whose entire value is
// that it CANNOT be paid off. The moment a rung of it is purchasable — with
// gold, marks, gems, scrip, renown or a bond — the mechanic stops being a
// difficulty curve and becomes a toll, and the game acquires the one monetary
// shape nobody in this project has agreed to. The catalogues are DATA and grow
// by rows; a rule that lives only in a reviewer's memory is a rule that survives
// exactly as long as the reviewer reads every row of every new data file.
//
// So this file reads the catalogues themselves — the same `src/data/*.js` modules
// the game and the generated SQL are both built from — and refuses any row whose
// effect KEY, effect TARGET or stat NAME reaches the recovery/death surface.
// It is deliberately a STATIC guard (no database, no credentials, milliseconds):
// its job is to be cheap enough to sit in CI beside renown-kill-faucet and to
// fail on the DAY a row is written, not on the day it is noticed.
//
// ⚠ THE PROSE IS NOT SCANNED, ONLY THE MACHINERY. An item DESCRIPTION may say
//   "gets you back on your feet"; a `heals` value is exactly how food is supposed
//   to shorten a knockout (via hr_rest) and is not a bypass. What is forbidden is
//   a row that keys a MECHANICAL effect on recovery or on a death counter.
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'src', 'data');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

/* ── THE FORBIDDEN SURFACE ──────────────────────────────────────────────────
   A row may not key an effect on any of these. Matched against effect KEYS and
   against string effect TARGETS / stat names — never against prose. */
const FORBIDDEN = [
  /^recover/i, /recovery/i, /recovering/i,
  /knock(ed)?_?out/i, /knockout/i,
  /^deaths?$/i, /death_?count/i, /deaths_(today|lifetime)/i,
  /respawn/i, /revive/i,
];

/* Effect-bearing shapes across the catalogues. A value is examined when it is a
   KEY of one of these objects, or a string sitting in one of these fields. */
const EFFECT_FIELDS = ['effect', 'effects', 'stat', 'stats', 'grants', 'grant',
  'bonus', 'bonuses', 'modifies', 'modifier', 'modifiers', 'apply', 'applies',
  'target', 'progress_key', 'progressKey', 'key', 'counter'];

let failed = 0;
const bad = (msg) => { failed++; console.error(`  FAIL  ${msg}`); };

function hits(text) {
  const t = String(text);
  return FORBIDDEN.some((re) => re.test(t));
}

/** Walk any catalogue value, reporting a path for every mechanical hit. */
function scan(node, path, out, inEffect) {
  if (node == null) return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => scan(v, `${path}[${i}]`, out, inEffect));
    return;
  }
  if (typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const nowInEffect = inEffect || EFFECT_FIELDS.includes(k);
      /* A KEY inside an effect bag is a mechanical name. */
      if (nowInEffect && hits(k)) out.push(`${path}.${k} (effect key)`);
      scan(node[k], `${path}.${k}`, out, nowInEffect);
    }
    return;
  }
  /* A STRING inside an effect bag is a mechanical target. */
  if (inEffect && typeof node === 'string' && hits(node)) {
    out.push(`${path} = ${JSON.stringify(node)} (effect target)`);
  }
}

/** Every catalogue module under src/data. Imported, never regex'd. */
async function scanData(extra) {
  const out = [];
  const files = readdirSync(DATA).filter((f) => f.endsWith('.js')).sort();
  for (const f of files) {
    let mod;
    try {
      mod = await import(pathToFileURL(join(DATA, f)).href);
    } catch (e) {
      /* TWO CATALOGUES TOUCH `window` AT MODULE SCOPE (glyphs.js,
         glyphs-extra.js) and cannot be imported in Node. They are still
         catalogues and still have to obey R10, so they get a SOURCE scan
         instead of an object walk - narrower, because it can only see an object
         KEY (`recovery_mult:`) and never a nested effect target. That is a
         STATED LIMITATION of this guard, not an exemption: the day either file
         becomes importable it is covered properly, and until then a forbidden
         key still cannot be written in the ordinary way. */
      const src = readFileSync(join(DATA, f), 'utf8');
      const KEYISH = /(^|[{,\s])(recover\w*|recovering\w*|knock_?out\w*|deaths?|death_count\w*|respawn\w*|revive\w*)\s*:/gim;
      for (const m2 of src.matchAll(KEYISH)) {
        out.push(`${f}: object key \`${m2[2]}\` (source scan - this file does not import in Node)`);
      }
      continue;
    }
    for (const name of Object.keys(mod)) {
      if (name === 'default') continue;
      scan(mod[name], `${f}:${name}`, out, false);
    }
  }
  if (extra) scan(extra.value, extra.path, out, false);
  return out;
}

/* The GENERATED SQL catalogues, which are what production actually reads. The
   data scan above is the source; this is the copy, and a guard that only checked
   the source would miss a hand-edited generated file. */
const SQL_CATALOGUES = [
  '2026-08-16-unlocks.generated.sql',
  '2026-08-11-catalogue.generated.sql',
  '2026-09-10-dungeon-catalogue.generated.sql',
];

function scanSql(injected) {
  const out = [];
  for (const f of SQL_CATALOGUES) {
    let sql;
    try { sql = readFileSync(join(MIGRATIONS, f), 'utf8'); } catch (e) { continue; }
    if (injected && injected.file === f) sql += `\n${injected.text}\n`;
    /* Only the VALUES rows of the catalogue inserts — a comment explaining the
       Recovery rule is not a catalogue row, and treating it as one would make
       this guard unwritable. */
    for (const line of sql.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('(') && !t.startsWith("('")) continue;
      if (t.startsWith('(--')) continue;
      if (hits(t)) out.push(`${f}: ${t.slice(0, 140)}`);
    }
  }
  return out;
}

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────── */
const MUTATIONS = {
  trait_skips_recovery: {
    why: 'a shop TRAIT whose effect key is `recovery_mult` — the ladder made purchasable',
    data: { path: 'MUTATION:TRAITS', value: { hearthstone: { effect: { recovery_mult: 0.5 } } } },
  },
  unlock_clears_deaths: {
    why: 'an UNLOCK that writes the death counter, which re-arms the day\'s free fall on demand',
    data: { path: 'MUTATION:UNLOCKS', value: [{ id: 'x', grants: { progress_key: 'deaths_today' } }] },
  },
  bond_revives: {
    why: 'a clan BOND that keys an effect on revive/respawn — relief sold through the clan',
    data: { path: 'MUTATION:BONDS', value: [{ id: 'b', effects: [{ stat: 'respawn_speed', v: 2 }] }] },
  },
  qm_offer_row: {
    why: 'a Quartermaster catalogue ROW that sells a recovery skip for scrip',
    sql: { file: '2026-09-10-dungeon-catalogue.generated.sql',
           text: "  ('qm.recovery_token', 'recovery_token', 18, 'Skip your recovery');" },
  },
};

async function run(mutation) {
  const m = mutation ? MUTATIONS[mutation] : null;
  const found = [
    ...await scanData(m && m.data ? m.data : null),
    ...scanSql(m && m.sql ? m.sql : null),
  ];
  for (const f of found) {
    bad('R10: a catalogue row keys a mechanical effect on RECOVERY or a DEATH COUNTER — '
      + `${f}. Recovery is the one mechanic whose whole value is that it cannot be paid off; `
      + 'relief is bought with FOOD (hr_rest) or it is not bought. If the Designer has changed '
      + 'that ruling, change the ruling and this guard together — never the guard alone.');
  }
  return found.length;
}

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  console.log('recovery-relief-guard --selftest: each planted row must turn the guard RED');
  /* The clean run must be GREEN first, or "it went red" proves nothing. */
  const base = await run(null);
  if (base > 0) {
    console.error('  x the UNMUTATED catalogues are already red — fix that before reading the '
      + 'mutation results below');
    process.exit(1);
  }
  let missed = 0;
  for (const name of Object.keys(MUTATIONS)) {
    failed = 0;
    const n = await run(name);
    if (n > 0) console.log(`  ${name}: RED — ${MUTATIONS[name].why}`);
    else { missed++; console.error(`  x ${name}: STAYED GREEN — the guard does not catch: ${MUTATIONS[name].why}`); }
  }
  failed = 0;
  if (missed) {
    console.error(`\n${missed} planted row(s) not caught — the guard is not proving what it claims.`);
    process.exit(1);
  }
  console.log(`\nAll ${Object.keys(MUTATIONS).length} planted rows caught. The guard is non-vacuous.`);
  process.exit(0);
} else {
  await run(null);
  if (failed) { console.error(`\nrecovery-relief-guard: ${failed} violation(s).`); process.exit(1); }
  console.log('recovery-relief-guard: R10 holds — no trait, unlock, gold-ladder rung, Quartermaster '
    + 'offer, clan bond, perk, renown rank, glyph or companion keys an effect on recovery duration, '
    + 'a recovery skip, or a death counter. Relief is bought with food or not at all.');
  process.exit(0);
}
