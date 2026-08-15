#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/derive-perks-of.mjs — hr_perks_of's NEXT BODY, EXTRACTED not retyped.
//
//   node tools/derive-perks-of.mjs --check    (a preflight in run-smoke)
//   node tools/derive-perks-of.mjs --write    splice the derived block in
//   node tools/derive-perks-of.mjs --report   print the derivation + digests
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────
// `create or replace function` on a body you have not read is the single most
// destructive statement in this repo. Three migrations once each defined
// clan_members "join as self", filename order installed the shortest one, and
// every self-check still passed — because a self-check that tests only its own
// file's terms cannot detect a later file undoing an earlier one.
//
// 2026-08-16-artisan-progress-model.sql restates the WHOLE of hr_perks_of in
// order to add ONE key. So its body is EXTRACTED from 2026-08-15-perk-channel.sql
// programmatically and patched at four named anchors — never retyped. Each
// anchor must match exactly once; a moved anchor is a hard failure, not a
// silent no-op. tests/run-sql-tests.mjs PART 1f-ii then grades the result
// line-by-line: every line of perk-channel's body must survive, and this
// derivation adds four lines and removes none.
//
// The equivalent chains for hr_apply (four links) and hr_rate_gate (four) are
// graded by the same PART 1f-ii mechanism; this is the third object to join it.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG = (f) => join(ROOT, 'supabase', 'migrations', f);

export const BASE_FILE = '2026-08-15-perk-channel.sql';
export const TARGET_FILE = '2026-08-16-artisan-progress-model.sql';

const OPEN = 'create or replace function public.hr_perks_of(';
const CLOSE = '\nend $$;';

const BEGIN_MARK = '-- ⟦DERIVED hr_perks_of — tools/derive-perks-of.mjs, do not hand-edit⟧';
const END_MARK = '-- ⟦/DERIVED hr_perks_of⟧';

const md5 = (s) => createHash('md5').update(s).digest('hex');
const norm = (s) => s.replace(/\r\n/g, '\n');

/** The whole `create or replace … end $$;` block for hr_perks_of in `sql`. */
export function extractBlock(sql) {
  const i = norm(sql).indexOf(OPEN);
  if (i < 0) return null;
  const j = norm(sql).indexOf(CLOSE, i);
  if (j < 0) return null;
  return norm(sql).slice(i, j + CLOSE.length + 1);   // include the trailing ';'
}

/* ── THE FOUR PATCHES ───────────────────────────────────────────────────
   Insertions only. Nothing of perk-channel's body is removed, which is what
   lets PART 1f-ii grade this chain with an EMPTY declared-removals list — the
   strongest form of that check. */
export const PATCHES = [
  {
    name: 'declare v_recipes',
    find: '  v_tier  int;\n',
    add: '  v_recipes jsonb;\n',
    where: 'after',
  },
  {
    name: 'read the recipe unlock rows',
    find: '    from public.hr_unlock_levels(p_user, p_slot) u;\n',
    add: `
  -- ── THE ARTISAN GATE ──────────────────────────────────────────────────
  -- Recipe scrolls are kind='flag' rows (see hr_unlocks) rather than levels,
  -- because the ACCRUAL ENGINE has to be able to grant one it rolled itself and
  -- 'flag' is in hr_apply's progress allowlist while 'unlock' is deliberately
  -- not. The JOIN to the catalogue is what makes a mis-filed row invisible as
  -- well as refused: hr_unlock_guard rejects a recipe row stored under the wrong
  -- kind, and this read would not see it either.
  --
  -- The wire shape is the CLIENT'S OWN — { "<scroll_id>": true } — so
  -- src/core/artisan.js gateOk consumes the server's answer and G.unlockedRecipes
  -- with the same expression. An absent row is an absent key is a LOCKED recipe:
  -- the fail-closed default is the shape's default, not a branch somebody wrote.
  select coalesce(jsonb_object_agg(substring(pp.key from 8), true), '{}'::jsonb)
    into v_recipes
    from public.player_progress pp
    join public.hr_unlocks u
      on u.unlock_id = pp.key
     and u.namespace = 'recipe'
     and u.progress_kind = pp.kind
   where pp.user_id = p_user
     and pp.slot    = p_slot
     and pp.period_key = ''
     and pp.value  > 0;
`,
    where: 'after',
  },
  {
    name: 'carry unlockedRecipes in the envelope',
    find: "    'propertyTier', coalesce(v_tier, 0),\n",
    add: `    -- ⚠ THE JS FIELD NAME, camelCase, deliberately: this envelope is consumed
    --   by the accrual engine untranslated, and a mapping layer is where a field
    --   gets silently dropped and reads as "the player has unlocked nothing".
    'unlockedRecipes', coalesce(v_recipes, '{}'::jsonb),
`,
    where: 'after',
  },
  {
    name: 'declare the recipe source in the honesty census',
    find: "      'renown',     'blocked:no_server_renown_score',\n",
    add: "      'recipes',    'player_progress:flag:recipe:*',\n",
    where: 'before',
  },
];

export function derive(baseSql) {
  const block = extractBlock(baseSql);
  if (!block) throw new Error(`could not extract hr_perks_of from ${BASE_FILE}`);
  let out = block;
  for (const p of PATCHES) {
    const n = out.split(p.find).length - 1;
    if (n !== 1) {
      throw new Error(
        `anchor "${p.name}" matched ${n} times in ${BASE_FILE}'s hr_perks_of (need exactly 1).\n`
        + '  The base body moved. Fix the anchor rather than letting the derivation\n'
        + '  silently no-op — a patch that did not apply is a fix that did not land.');
    }
    out = out.replace(p.find, p.where === 'after' ? p.find + p.add : p.add + p.find);
  }
  return out;
}

export async function derived() {
  return derive(await readFile(MIG(BASE_FILE), 'utf8'));
}

/** The block currently committed inside the target migration, between markers. */
export function committedBlock(targetSql) {
  const s = norm(targetSql);
  const i = s.indexOf(BEGIN_MARK);
  const j = s.indexOf(END_MARK);
  if (i < 0 || j < 0) return null;
  return s.slice(i + BEGIN_MARK.length + 1, j);
}

// ── CLI ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const isMain = (process.argv[1] || '').endsWith('derive-perks-of.mjs');

export async function checkDerivation() {
  const problems = [];
  const baseSql = await readFile(MIG(BASE_FILE), 'utf8');
  const want = derive(baseSql);
  const targetSql = await readFile(MIG(TARGET_FILE), 'utf8');
  const have = committedBlock(targetSql);
  if (have === null) {
    problems.push(`${TARGET_FILE} has no ⟦DERIVED hr_perks_of⟧ block — the derivation markers are gone, `
      + 'so nothing is checking that its restated body came from perk-channel\'s.');
    return problems;
  }
  if (norm(have) !== norm(want)) {
    problems.push(
      `${TARGET_FILE}'s hr_perks_of is NOT ${BASE_FILE}'s body + the four declared patches.\n`
      + `    committed md5 ${md5(norm(have))}\n`
      + `    derived   md5 ${md5(norm(want))}\n`
      + '    Either the base moved (re-derive: node tools/derive-perks-of.mjs --write) or the\n'
      + '    committed block was hand-edited, which is how a fix that landed last week silently\n'
      + '    disappears.');
  }
  return problems;
}

if (isMain) {
  const baseSql = await readFile(MIG(BASE_FILE), 'utf8');
  const want = derive(baseSql);
  if (argv.includes('--report')) {
    const block = extractBlock(baseSql);
    console.log(`base   ${BASE_FILE}  hr_perks_of ${block.length} bytes  md5 ${md5(norm(block))}`);
    console.log(`derived                          ${want.length} bytes  md5 ${md5(norm(want))}`);
    for (const p of PATCHES) console.log(`  + ${p.name}`);
    process.exit(0);
  }
  if (argv.includes('--write')) {
    const path = MIG(TARGET_FILE);
    const targetSql = norm(await readFile(path, 'utf8'));
    const i = targetSql.indexOf(BEGIN_MARK);
    const j = targetSql.indexOf(END_MARK);
    if (i < 0 || j < 0) {
      console.error(`${TARGET_FILE} has no ⟦DERIVED hr_perks_of⟧ / ⟦/DERIVED hr_perks_of⟧ markers`);
      process.exit(1);
    }
    const next = targetSql.slice(0, i + BEGIN_MARK.length + 1) + want + targetSql.slice(j);
    await writeFile(path, next, 'utf8');
    console.log(`spliced hr_perks_of into ${TARGET_FILE} (md5 ${md5(norm(want))})`);
    process.exit(0);
  }
  const ps = await checkDerivation();
  if (ps.length) { for (const p of ps) console.error('  x ' + p); process.exit(1); }
  console.log(`hr_perks_of derivation in sync (${BASE_FILE} + ${PATCHES.length} patches, `
    + `md5 ${md5(norm(want)).slice(0, 12)}…)`);
}
