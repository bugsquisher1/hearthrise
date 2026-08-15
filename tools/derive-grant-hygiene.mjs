#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/derive-grant-hygiene.mjs — hr_assert_grant_hygiene's NEXT BODY,
// EXTRACTED not retyped.
//
//   node tools/derive-grant-hygiene.mjs --check    (a preflight in run-smoke)
//   node tools/derive-grant-hygiene.mjs --write    splice the derived block in
//   node tools/derive-grant-hygiene.mjs --report   print the derivation + digests
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────
// `create or replace function` on a body you have not read is the single most
// destructive statement in this repo — and there is no body where that is
// truer than THE DETECTOR'S. hr_assert_grant_hygiene is nine checks long, it
// runs nightly on pg_cron, and its failures are the only automated signal that
// a privileged function has been born reachable. A migration that restated it
// from memory in order to add two allowlist entries could silently delete
// check (5), or (8), or the `prokind in ('f','p')` that makes a PROCEDURE
// visible — and every self-check in the file would still pass, because a
// self-check that tests only its own file's terms cannot detect a later file
// undoing an earlier one (the clan_members "join as self" defect).
//
// So 2026-08-16-engine-allowlist-claim-perks.sql's body is EXTRACTED from
// 2026-08-11-grant-hygiene.sql programmatically and patched at ONE named
// anchor. The patch is an INSERTION AT THE HEAD of the c_engine_allow array,
// deliberately: appending would have to rewrite the previous last entry to add
// a trailing comma, which is a MODIFIED line that PART 1f-ii would have to be
// told to expect. Inserting at the head removes nothing, so this chain's
// declared-removals list in tests/run-sql-tests.mjs is EMPTY — the strongest
// form that check can take. Order inside an allowlist carries no meaning:
// check (7) tests it with `<> all (...)`, which is a set test.
//
// The equivalent chains for hr_apply (four links), hr_rate_gate (four) and
// hr_perks_of (two) are graded by the same PART 1f-ii mechanism; the detector
// is the fourth object to join it.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG = (f) => join(ROOT, 'supabase', 'migrations', f);

export const BASE_FILE = '2026-08-11-grant-hygiene.sql';
export const TARGET_FILE = '2026-08-16-engine-allowlist-claim-perks.sql';

const OPEN = 'create or replace function public.hr_assert_grant_hygiene(';
const CLOSE = '\nend $$;';

const BEGIN_MARK = '-- ⟦DERIVED hr_assert_grant_hygiene — tools/derive-grant-hygiene.mjs, do not hand-edit⟧';
const END_MARK = '-- ⟦/DERIVED hr_assert_grant_hygiene⟧';

const md5 = (s) => createHash('md5').update(s).digest('hex');
const norm = (s) => s.replace(/\r\n/g, '\n');

/** The whole `create or replace … end $$;` block for the detector in `sql`. */
export function extractBlock(sql) {
  const s = norm(sql);
  const i = s.indexOf(OPEN);
  if (i < 0) return null;
  const j = s.indexOf(CLOSE, i);
  if (j < 0) return null;
  return s.slice(i, j + CLOSE.length + 1);   // include the trailing newline
}

/** The plpgsql body only — i.e. exactly what Postgres stores in pg_proc.prosrc. */
export function innerBody(block) {
  const k = block.indexOf('$$');
  return block.slice(k + 2, block.lastIndexOf('$$'));
}

/* ── THE TWO ENTRIES, AND THE CLAIM EACH ONE MAKES ─────────────────────
   The file's own comment on c_engine_allow says adding an entry is a CLAIM:
   "read-only or self-validating, and it accepts no target the caller is not
   already authorised for." Both justifications below re-derive that claim
   rather than asserting it — see the migration header for the long form. */
export const PATCHES = [
  {
    name: 'the c_engine_allow array head',
    find: '  c_engine_allow constant text[] := array[\n',
    add: `    -- ── ADDED 2026-08-16 — TWO REVIEWED ENGINE READS ────────────────────
    -- At the HEAD, not appended: this array is DERIVED from
    -- 2026-08-11-grant-hygiene.sql by tools/derive-grant-hygiene.mjs, and an
    -- append would have to rewrite the previous last entry to add a comma —
    -- a MODIFIED line. An insertion removes nothing, which is why this chain's
    -- declared-removals list in PART 1f-ii is empty. Position carries no
    -- meaning here: check (7) tests membership with \`<> all (...)\`.
    --
    -- read-only (STABLE, and 2026-08-16-claim-reward.sql §4 asserts the
    -- declaration rather than trusting it) claim lookup for ONE character.
    -- SELF-VALIDATING in the dimension that matters: the period keys it reads
    -- are the server's own hr_utc_day_key(now()), never an argument, so the
    -- row set is structurally bounded to '' + today + yesterday and no call
    -- can widen it into a history scan. It adds NO TARGET the engine could
    -- not already reach — the engine already holds hr_apply(uuid,…) and
    -- hr_state_of(uuid,int), both of which take the same p_user — so this is
    -- strictly a narrower read of data hr_state_of's envelope is the peer of.
    'hr_claim_lookup(uuid,integer,text,text)',
    -- read-only permanent-capability read for one character: rooms, plots,
    -- property tier and unlocked recipes. Writes nothing and calls nothing
    -- that writes. On the list for the same reason hr_offline_cap_ms is —
    -- a perk multiplies a whole night's grant, so the engine must be TOLD its
    -- capabilities rather than compute them. Same target argument as above:
    -- p_user is a parameter the engine already passes to hr_apply.
    'hr_perks_of(uuid,integer)',
`,
    where: 'after',
  },
];

export function derive(baseSql) {
  const block = extractBlock(baseSql);
  if (!block) throw new Error(`could not extract hr_assert_grant_hygiene from ${BASE_FILE}`);
  let out = block;
  for (const p of PATCHES) {
    const n = out.split(p.find).length - 1;
    if (n !== 1) {
      throw new Error(
        `anchor "${p.name}" matched ${n} times in ${BASE_FILE}'s hr_assert_grant_hygiene (need exactly 1).\n`
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
const isMain = (process.argv[1] || '').endsWith('derive-grant-hygiene.mjs');

export async function checkDerivation() {
  const problems = [];
  const baseSql = await readFile(MIG(BASE_FILE), 'utf8');
  const want = derive(baseSql);
  let targetSql;
  try { targetSql = await readFile(MIG(TARGET_FILE), 'utf8'); }
  catch { problems.push(`${TARGET_FILE} is missing — the derivation has nothing to grade.`); return problems; }
  const have = committedBlock(targetSql);
  if (have === null) {
    problems.push(`${TARGET_FILE} has no ⟦DERIVED hr_assert_grant_hygiene⟧ block — the derivation markers `
      + 'are gone, so nothing is checking that its restated detector came from grant-hygiene\'s.');
    return problems;
  }
  if (norm(have) !== norm(want)) {
    problems.push(
      `${TARGET_FILE}'s hr_assert_grant_hygiene is NOT ${BASE_FILE}'s body + the declared patch.\n`
      + `    committed md5 ${md5(norm(have))}\n`
      + `    derived   md5 ${md5(norm(want))}\n`
      + '    Either the base moved (re-derive: node tools/derive-grant-hygiene.mjs --write) or the\n'
      + '    committed block was hand-edited — which, on THE DETECTOR, means a check may have been\n'
      + '    deleted while every self-check in the file still passed.');
  }
  return problems;
}

if (isMain) {
  const baseSql = await readFile(MIG(BASE_FILE), 'utf8');
  const want = derive(baseSql);
  if (argv.includes('--report')) {
    const block = extractBlock(baseSql);
    console.log(`base    ${BASE_FILE}`);
    console.log(`  block   ${block.length} bytes  md5 ${md5(norm(block))}`);
    console.log(`  prosrc  ${innerBody(block).length} bytes  md5 ${md5(innerBody(block))}`);
    console.log('derived');
    console.log(`  block   ${want.length} bytes  md5 ${md5(norm(want))}`);
    console.log(`  prosrc  ${innerBody(want).length} bytes  md5 ${md5(innerBody(want))}`);
    for (const p of PATCHES) console.log(`  + ${p.name}`);
    process.exit(0);
  }
  if (argv.includes('--write')) {
    const path = MIG(TARGET_FILE);
    const targetSql = norm(await readFile(path, 'utf8'));
    const i = targetSql.indexOf(BEGIN_MARK);
    const j = targetSql.indexOf(END_MARK);
    if (i < 0 || j < 0) {
      console.error(`${TARGET_FILE} has no ⟦DERIVED hr_assert_grant_hygiene⟧ / ⟦/DERIVED …⟧ markers`);
      process.exit(1);
    }
    const next = targetSql.slice(0, i + BEGIN_MARK.length + 1) + want + targetSql.slice(j);
    await writeFile(path, next, 'utf8');
    console.log(`spliced hr_assert_grant_hygiene into ${TARGET_FILE} (md5 ${md5(norm(want))})`);
    process.exit(0);
  }
  const ps = await checkDerivation();
  if (ps.length) { for (const p of ps) console.error('  x ' + p); process.exit(1); }
  console.log(`hr_assert_grant_hygiene derivation in sync (${BASE_FILE} + ${PATCHES.length} patch, `
    + `md5 ${md5(norm(want)).slice(0, 12)}…)`);
}
