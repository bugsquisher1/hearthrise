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

/* ── THE CHAIN, 2026-08-16 ─────────────────────────────────────────────
   The detector now has TWO derived links, not one, and they are declared as a
   list rather than as a base/target pair so that adding a third is a data
   change. Each link's base is its predecessor's TARGET FILE — i.e. the body
   that is actually installed when the chain has been applied in order — so the
   entries a previous link recorded can never be silently dropped by the next
   one. tests/run-sql-tests.mjs PART 1f-ii grades the same sequence.

   ⚠ BASE_FILE / TARGET_FILE ABOVE STILL NAME LINK 1, because they are the
     names this module has exported since it was written and other callers read
     them. Link 1's derivation is byte-for-byte what it was; nothing about it
     moves here. */
export const LINKS = [
  { base: BASE_FILE, target: TARGET_FILE, patchIds: ['claim_perks'] },
  {
    base: TARGET_FILE,
    target: '2026-08-16-unlock-buy.sql',
    patchIds: ['unlock_buy'],
  },
  /* Link 3 is the FIRST patch in this chain that REPLACES lines rather than
     inserting them, so it is also the first with a non-empty declared-removals
     list in tests/run-sql-tests.mjs PART 1f-ii. It widens check (4): see the
     patch body for what it now catches and why the old four lines had to go
     rather than being added to. */
  {
    base: '2026-08-16-unlock-buy.sql',
    target: '2026-08-16-client-write-grant-sweep.sql',
    patchIds: ['client_write_no_policy'],
  },
];

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
    id: 'claim_perks',
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
  {
    id: 'unlock_buy',
    name: 'the c_engine_allow array head (link 2)',
    find: '  c_engine_allow constant text[] := array[\n',
    add: `    -- ── ADDED 2026-08-16 — THE FIRST WRITER ADDED SINCE hr_apply ────────
    -- At the HEAD again, and for the same reason as the link above: an
    -- insertion removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with \`<> all (...)\`.
    --
    -- ⚠ NOT READ-ONLY, and the claim is made on the OTHER clause. It writes
    -- one player_progress unlock row, one player_state gold/version update and
    -- one player_ledger row. SELF-VALIDATING is what admits it, and concretely:
    -- its whole caller-supplied surface is ONE OFFER ID (a primary key in the
    -- generated, client-unwritable hr_unlock_offers) — no price, no quantity,
    -- no item, no rung, no timestamp; every number it writes comes from that
    -- table or from the character's own row read under the SAME advisory lock
    -- hr_apply takes; the row it writes is independently policed by the
    -- player_progress_unlock_guard trigger, which refuses an off-ladder rung, a
    -- regression and a mis-filed kind whatever this function proposes; and it
    -- is clamped per call (one rung) and per DAY (20 unlocks, counted from the
    -- append-only ledger), which is the dimension a rate limit does not bound.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT: hr_apply structurally
    -- cannot write a level ('unlock' is deliberately absent from its delta
    -- allowlist), so without this the only writer of a permanent capability is
    -- the client.
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)',
`,
    where: 'after',
  },
  {
    id: 'client_write_no_policy',
    name: "check (4)'s grant query",
    /* A REPLACEMENT, and the only one in this chain. The old query could not be
       widened by insertion: it is a single SELECT whose WHERE clause IS the
       rule, and the new rule is a UNION of two different populations. Its four
       lines are therefore declared removals in PART 1f-ii — the first non-empty
       list this chain has had, which is precisely why it is spelled out. */
    find: `  select coalesce(jsonb_agg(distinct table_name), '[]'::jsonb) into v_client_trunc
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon','authenticated','PUBLIC')
     and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER');
`,
    add: `  --     b354 (Security C3) — WIDENED, and the second half is the interesting
  --     one. A client WRITE grant on a table that has RLS ON and NO WRITE
  --     POLICY AT ALL is a grant nothing intends to use: the only thing between
  --     it and the table is row-level security, and one \`create policy\` — or
  --     one \`alter table ... disable row level security\` typed during an
  --     incident — turns it into a client-writable table. Security found six of
  --     them live (hr_castle_*, hr_hunt_*): pure content catalogues carrying
  --     anon/authenticated INSERT/UPDATE/DELETE.
  --     WHY IT IS A BASELINE AND NOT A BAN: 21 further tables were in this class
  --     when the check was written (clan_*, world_event_*, raid_*, maintenance_*,
  --     display_names, leaderboard_meta) — all written only by SECURITY DEFINER
  --     RPCs, all dead grants, and none of them safe to sweep in the same change
  --     that introduced the detector. They are RECORDED in
  --     hr_client_write_baseline, which makes each one a claim somebody has to
  --     justify, and makes anything NEW fatal.
  --     service_role is deliberately NOT in the grantee list: Supabase's platform
  --     default grants it every privilege on every table in public, so including
  --     it would report all 40-odd tables and the check could never be strict.
  --     That is a platform posture and a separate program; stated here so its
  --     absence is a decision rather than an oversight.
  select coalesce(jsonb_agg(distinct x.g order by x.g), '[]'::jsonb) into v_client_trunc from (
    select table_name as g
      from information_schema.role_table_grants
     where table_schema = 'public' and grantee in ('anon','authenticated','PUBLIC')
       and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')
    union all
    select g.table_name || ':' || g.grantee || ':' || g.privilege_type
      from information_schema.role_table_grants g
      join pg_class c on c.relname = g.table_name
                     and c.relnamespace = 'public'::regnamespace
     where g.table_schema = 'public' and g.grantee in ('anon','authenticated','PUBLIC')
       and g.privilege_type in ('INSERT','UPDATE','DELETE')
       and c.relrowsecurity
       and not exists (select 1 from pg_policies p
                        where p.schemaname = 'public' and p.tablename = g.table_name
                          and p.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       and not exists (select 1 from public.hr_client_write_baseline b
                        where b.table_name = g.table_name and b.grantee = g.grantee)
  ) x;
`,
    where: 'replace',
  },
];

const patchById = (id) => {
  const p = PATCHES.find((x) => x.id === id);
  if (!p) throw new Error(`derive-grant-hygiene: no patch with id "${id}"`);
  return p;
};

/**
 * Apply `patchIds` to the detector block extracted from `baseSql`.
 * `patchIds` defaults to link 1's, so the historical one-argument call — which
 * other modules make — behaves exactly as it did.
 */
export function derive(baseSql, patchIds = LINKS[0].patchIds, baseName = BASE_FILE) {
  const block = extractBlock(baseSql);
  if (!block) throw new Error(`could not extract hr_assert_grant_hygiene from ${baseName}`);
  let out = block;
  for (const id of patchIds) {
    const p = patchById(id);
    const n = out.split(p.find).length - 1;
    if (n !== 1) {
      throw new Error(
        `anchor "${p.name}" matched ${n} times in ${baseName}'s hr_assert_grant_hygiene (need exactly 1).\n`
        + '  The base body moved. Fix the anchor rather than letting the derivation\n'
        + '  silently no-op — a patch that did not apply is a fix that did not land.');
    }
    out = out.replace(
      p.find,
      p.where === 'after' ? p.find + p.add
        : p.where === 'replace' ? p.add
          : p.add + p.find);
  }
  return out;
}

/**
 * The derived body for one link, taking its base from the base file's COMMITTED
 * derived block when that base is itself a derived target. Link 2's base is
 * link 1's output, so the chain cannot drop what link 1 recorded.
 */
export async function derivedFor(link) {
  const sql = await readFile(MIG(link.base), 'utf8');
  const isDerivedBase = LINKS.some((l) => l.target === link.base);
  const baseBlock = isDerivedBase ? committedBlock(sql) : null;
  if (isDerivedBase && baseBlock === null) {
    throw new Error(`${link.base} has no ⟦DERIVED hr_assert_grant_hygiene⟧ block, so ${link.target} `
      + 'cannot be derived from it. Re-derive the earlier link first.');
  }
  return derive(isDerivedBase ? baseBlock : sql, link.patchIds, link.base);
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
  /* ⚠ THE LINKS ARE WALKED IN ORDER and each one's base is read from disk, so a
     hand edit to link 1's committed block is reported BY LINK 1 and then again
     as a mismatch in link 2 — loudly, twice, rather than silently absorbed. */
  for (const link of LINKS) {
    let want;
    try { want = await derivedFor(link); }
    catch (e) { problems.push(e.message); continue; }
    let targetSql;
    try { targetSql = await readFile(MIG(link.target), 'utf8'); }
    catch { problems.push(`${link.target} is missing — the derivation has nothing to grade.`); continue; }
    const have = committedBlock(targetSql);
    if (have === null) {
      problems.push(`${link.target} has no ⟦DERIVED hr_assert_grant_hygiene⟧ block — the derivation `
        + `markers are gone, so nothing is checking that its restated detector came from ${link.base}'s.`);
      continue;
    }
    if (norm(have) !== norm(want)) {
      problems.push(
        `${link.target}'s hr_assert_grant_hygiene is NOT ${link.base}'s body + the declared patch.\n`
        + `    committed md5 ${md5(norm(have))}\n`
        + `    derived   md5 ${md5(norm(want))}\n`
        + '    Either the base moved (re-derive: node tools/derive-grant-hygiene.mjs --write) or the\n'
        + '    committed block was hand-edited — which, on THE DETECTOR, means a check may have been\n'
        + '    deleted while every self-check in the file still passed.');
    }
  }
  return problems;
}

if (isMain) {
  if (argv.includes('--report')) {
    for (const link of LINKS) {
      const want = await derivedFor(link);
      console.log(`${link.base}  →  ${link.target}`);
      console.log(`  derived block   ${want.length} bytes  md5 ${md5(norm(want))}`);
      console.log(`  derived prosrc  ${innerBody(want).length} bytes  md5 ${md5(innerBody(want))}`);
      for (const id of link.patchIds) console.log(`  + ${patchById(id).name}`);
    }
    process.exit(0);
  }
  if (argv.includes('--write')) {
    /* IN ORDER, because link 2's base is link 1's committed block: writing them
       out of order would derive link 2 from a stale link 1. */
    for (const link of LINKS) {
      const want = await derivedFor(link);
      const path = MIG(link.target);
      const targetSql = norm(await readFile(path, 'utf8'));
      const i = targetSql.indexOf(BEGIN_MARK);
      const j = targetSql.indexOf(END_MARK);
      if (i < 0 || j < 0) {
        console.error(`${link.target} has no ⟦DERIVED hr_assert_grant_hygiene⟧ / ⟦/DERIVED …⟧ markers`);
        process.exit(1);
      }
      const next = targetSql.slice(0, i + BEGIN_MARK.length + 1) + want + targetSql.slice(j);
      await writeFile(path, next, 'utf8');
      console.log(`spliced hr_assert_grant_hygiene into ${link.target} (md5 ${md5(norm(want))})`);
    }
    process.exit(0);
  }
  const ps = await checkDerivation();
  if (ps.length) { for (const p of ps) console.error('  x ' + p); process.exit(1); }
  console.log(`hr_assert_grant_hygiene derivation in sync (${LINKS.length} links, `
    + `${PATCHES.length} patches)`);
}
