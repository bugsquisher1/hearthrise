#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/unlock-catalogue-ownership.mjs — THE SAME INCIDENT, ON THE SIBLING
//   TABLE. public.hr_unlocks is refilled WHOLESALE, and the repair after that
//   refill must be DECLARED and PROVEN, not remembered.
//
//   node tests/unlock-catalogue-ownership.mjs             # the guard
//   node tests/unlock-catalogue-ownership.mjs --selftest  # the control must FAIL
//
// ── WHY THIS FILE EXISTS (production, measured 2026-08-30) ──────────────
// tests/unlock-offer-ownership.mjs was written after a regen of the shop offer
// catalogue silently deleted 48 gold-ladder offers in production. Its "what it
// cannot prove" section ends with:
//
//     "· Anything about hr_unlocks, whose merge rows are upserted rather than
//        refilled and were therefore never at risk."
//
// THAT SENTENCE IS FALSE, and the table it exempted then suffered the identical
// incident three days later. 2026-08-16-unlocks.generated.sql opens its seed
// block with an unscoped `delete from public.hr_unlocks;`. It was regenerated on
// 2026-08-23 (commit 59bfb31a, `trait:auto_eat_2` added, its self-check moved
// 61 -> 62) and re-applied, which destroyed every row three LATER migrations had
// added. Production ran 65 rows against a repo that rebuilds 82 for a week; the
// restore-census live-compare reported it on every run.
//
// The forensic proof is in the heap: production's hr_unlocks holds exactly THREE
// distinct xmin values, and the oldest of them — the wholesale refill — carries
// `trait:auto_eat_2`, an id that did not exist until 2026-08-23. So the refill
// ran AFTER 2026-08-22-companion-grant.sql, and no transaction ever put that
// file's seventeen rows back. Two of the three collateral victims were repaired
// by re-applying their files. The third was not, because nobody had written the
// list down.
//
// ── WHAT THIS GUARD ASSERTS ─────────────────────────────────────────────
// Not "the wholesale delete is a bug" — a guard that goes red when the defect is
// FIXED is a guard nobody can act on. The property is:
//
//     After the wholesale owner is re-applied ALONE, applying the DECLARED
//     repair list restores public.hr_unlocks byte-identically.
//
// That holds whether the delete stays unscoped (the repair does real work) or is
// one day scoped the way hr_unlock_offers.source scoped its siblings (the repair
// becomes a no-op and still restores). It cannot invert. What it CAN catch is
// the thing that actually happened: a new migration seeds hr_unlocks, nobody
// adds it to the repair list, and the next regen eats its rows in silence.
//
// The declared list is additionally cross-checked against the manifest, so it is
// DERIVED rather than remembered: every file in tests/schema-apply-order.json
// that writes hr_unlocks after the owner must appear, in manifest order.
//
// ── AND IT EXERCISES THE FIX ON PRODUCTION'S SHAPE (arm 5) ──────────────
// The chain always rebuilds the 17 rows, so replaying the chain only ever runs
// 2026-09-05-companion-unlock-catalogue-reseed.sql down its NO-OP path — which
// proves nothing about the apply that matters. Arm 5 deletes the 17 to
// reproduce production exactly (65 rows, the rest correct), measures that
// player_progress_unlock_guard then answers 23514 for companion:badger — the
// same refusal measured on production 2026-08-30 — applies the reseed ALONE,
// and requires the catalogue to land byte-identically on the chain's own
// rebuild with the guard now answering 23503 (the FK, i.e. it passed) while an
// uncatalogued id is still refused.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · That production has been repaired. Restoring the 17 rows is an APPLY
//     (supabase/migrations/2026-09-05-companion-unlock-catalogue-reseed.sql,
//     REVIEW-ONLY — the Coordinator applies). This guard proves the repo can
//     rebuild and repair the catalogue; tests/restore-census.mjs --live-compare
//     is what says whether production agrees.
//   · That the wholesale delete cannot happen again. The permanent fix is the
//     hr_unlock_offers one — an owner column, so each writer deletes only its
//     own rows — and it requires editing an already-applied generated file plus
//     a deliberate re-apply of the wholesale owner, which is the exact dangerous
//     operation. Handed over, not smuggled into a seed fix.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT, manifest } from './schema-replay.mjs';

/** The file that refills public.hr_unlocks wholesale. */
const OWNER = '2026-08-16-unlocks.generated.sql';

/** THE REPAIR LIST — every migration that must be re-applied, IN THIS ORDER,
 *  after OWNER has been re-applied. Cross-checked against the manifest below,
 *  so adding a new hr_unlocks seeder without adding it here fails this guard. */
const REPAIR_AFTER_WIPE = [
  '2026-08-19-gold-spend-slices-2-3.sql',              // bank · plot:farm_land · worker_hire
  '2026-08-19-companion-unlocks.sql',                  // the 4 SHOP companions, rung-shaped
  '2026-08-22-companion-grant.sql',                    // the 17 non-shop companions
  '2026-09-05-companion-unlock-catalogue-reseed.sql',  // the 17 again, derived from the allowlist
];

/** The seventeen ids the 2026-08-23 refill destroyed, pinned BY VALUE (b493:
 *  a cardinality is not a pin) with the exact shape they must carry. */
const GRANTABLE = [
  'companion:badger', 'companion:beaver', 'companion:bunny', 'companion:dragonling',
  'companion:forge_imp', 'companion:grave_wisp', 'companion:hawk', 'companion:heron',
  'companion:lichling', 'companion:phoenix_chick', 'companion:rock_golem', 'companion:scorpion',
  'companion:silkling', 'companion:squirrel', 'companion:tortoise', 'companion:whelp',
  'companion:wolf_pup',
];
/** The four SHOP companions. The wholesale owner lists them as flag/flag; the
 *  08-19 file upserts them to the rung ladder hr_unlock_buy actually sells. Both
 *  spellings are in the repo, and only apply order decides which one wins. */
const SHOP = ['companion:honeybee', 'companion:owl', 'companion:raccoon', 'companion:sparrow'];
const COMPANION_SHAPE = 'companion|max|unlock|1|{1}';

const FP_SQL = `select unlock_id,
       concat_ws('|', namespace, merge, coalesce(progress_kind,'~'),
                 coalesce(max_value::text,'~'), coalesce(rungs::text,'~')) fp
  from public.hr_unlocks order by unlock_id`;

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const mig = (f) => readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8');

const FIX = '2026-09-05-companion-unlock-catalogue-reseed.sql';

/**
 * @param control  false          the guard
 *                 'repair_list'  drop 2026-08-19-companion-unlocks.sql from the
 *                                repair list — one file away from the omission
 *                                actually made on 2026-08-23
 *                 'fix'          neutralise the reseed's §1 insert, so arm 5 is
 *                                asked to prove a fix that does not fix
 */
async function run({ control = false } = {}) {
  const repair = control === 'repair_list'
    ? REPAIR_AFTER_WIPE.filter((f) => f !== '2026-08-19-companion-unlocks.sql')
    : REPAIR_AFTER_WIPE;

  // ── (1) THE DECLARED LIST IS DERIVED, NOT REMEMBERED ────────────────────
  // Every manifest file that writes hr_unlocks after OWNER must be declared.
  // This is the arm that catches the real failure: a new seeder nobody listed.
  const m = await manifest();
  const order = m.order || m;
  const writers = [];
  for (const f of order) {
    let src = '';
    try { src = await mig(f); } catch { continue; }
    if (/insert\s+into\s+public\.hr_unlocks\b/i.test(src)) writers.push(f);
  }
  ok(writers[0] === OWNER,
    `the first migration to write hr_unlocks is ${writers[0]}, not ${OWNER}. A wholesale refill `
    + 'that is not first destroys whatever ran before it, every time it is applied.');
  const derived = writers.filter((f) => f !== OWNER);
  ok(JSON.stringify(derived) === JSON.stringify(REPAIR_AFTER_WIPE.filter((f) => f !== OWNER)),
    `REPAIR_AFTER_WIPE is stale. The manifest's hr_unlocks writers after ${OWNER} are\n`
    + `      [${derived.join(', ')}]\n    and this file declares\n      [${REPAIR_AFTER_WIPE.join(', ')}].\n`
    + '    A seeder that is not on the list is a seeder the next catalogue regen eats in silence — '
    + 'which is exactly how the 17 companion rows were lost on 2026-08-23.');

  // The hazard, stated as a fact rather than assumed: OWNER really does delete
  // rows it does not own. Reported, not asserted — if it is ever scoped, the
  // repair below becomes a no-op and this guard still passes.
  const ownerSrc = await mig(OWNER);
  const unscoped = /^\s*delete\s+from\s+public\.hr_unlocks\s*;/im.test(ownerSrc);

  // ── (2) THE CHAIN REBUILDS THE CATALOGUE ────────────────────────────────
  const { db } = await bootReplay();
  const q = async (s) => (await db.query(s)).rows;
  const before = await q(FP_SQL);
  const fpOf = (rows) => new Map(rows.map((r) => [r.unlock_id, r.fp]));
  const b = fpOf(before);

  for (const id of GRANTABLE) {
    ok(b.get(id) === COMPANION_SHAPE,
      `${id} rebuilds as ${b.get(id) ?? 'ABSENT'}, expected ${COMPANION_SHAPE}. Without this row `
      + 'player_progress_unlock_guard refuses the ownership write with unknown_unlock and '
      + 'hr_companion_grant raises instead of returning a machine code.');
  }
  for (const id of SHOP) {
    ok(b.get(id) === COMPANION_SHAPE,
      `${id} rebuilds as ${b.get(id) ?? 'ABSENT'}, expected ${COMPANION_SHAPE} — the rung ladder `
      + 'hr_unlock_buy sells. The wholesale owner spells it flag/flag; only apply order saves it.');
  }
  ok(before.filter((r) => r.fp.startsWith('companion|')).length === GRANTABLE.length + SHOP.length,
    `the rebuild produces ${before.filter((r) => r.fp.startsWith('companion|')).length} companion `
    + `rows, expected ${GRANTABLE.length + SHOP.length}`);

  // ── (3) THE INCIDENT, REPLAYED ──────────────────────────────────────────
  // Re-apply the wholesale owner ALONE — the exact operation performed on
  // production on 2026-08-23 — and measure the blast radius.
  let wipeFailed = null;
  try { await db.exec(ownerSrc); } catch (e) { wipeFailed = String(e.message || e); }
  ok(wipeFailed === null,
    `re-applying ${OWNER} alone failed: ${wipeFailed}. This guard cannot measure a hazard it `
    + 'cannot reproduce.');

  const mid = fpOf(await q(FP_SQL));
  const destroyed = [...b.keys()].filter((id) => !mid.has(id));
  const misshaped = [...b.keys()].filter((id) => mid.has(id) && mid.get(id) !== b.get(id));

  // ── (4) THE DECLARED REPAIR RESTORES IT EXACTLY ─────────────────────────
  const refused = [];
  for (const f of repair) {
    try { await db.exec(await mig(f)); }
    catch (e) { refused.push(`${f}: ${String(e.message || e).split('\n')[0]}`); }
  }
  const after = fpOf(await q(FP_SQL));
  const notRestored = [...b.keys()].filter((id) => after.get(id) !== b.get(id));
  const extra = [...after.keys()].filter((id) => !b.has(id));

  ok(notRestored.length === 0,
    `after the declared repair, ${notRestored.length} row(s) are still missing or mis-shaped: `
    + `${notRestored.join(', ')}.` + (refused.length ? `\n    A repair file REFUSED to apply: ${refused.join(' | ')}` : '')
    + '\n    The repair list is the only written record of how to recover from a catalogue regen; '
    + 'if it does not restore the catalogue it is worse than nothing.');
  ok(extra.length === 0,
    `the repair added rows the chain does not produce: ${extra.join(', ')}`);

  // ── (5) THE FIX, EXERCISED ON PRODUCTION'S ACTUAL SHAPE ─────────────────
  // Arms (2)-(4) only ever ran the reseed against a catalogue that ALREADY had
  // the 17 rows, i.e. its no-op path. Production's shape is the opposite: 65
  // rows, the 17 absent, everything else correct. Reproduce exactly that and
  // apply the reseed ALONE — this is the arm that says the staged migration
  // does what it claims before anyone applies it to a live database.
  await db.exec(`delete from public.hr_unlocks where unlock_id in (${
    GRANTABLE.map((id) => `'${id}'`).join(',')})`);
  const prodShape = await q('select count(*)::int n from public.hr_unlocks');
  ok(prodShape[0].n === before.length - GRANTABLE.length,
    `could not reproduce production's shape: ${prodShape[0].n} rows, expected `
    + `${before.length - GRANTABLE.length}`);

  // The guard must refuse an ownership write while the row is missing — the
  // 23514 measured on production. BEFORE INSERT, so it decides before the FK;
  // 23503 means the guard let it through. Rolled back either way (both raise).
  const probe = async (key) => (await q(
    `do $$ begin
       insert into public.player_progress(user_id, slot, kind, key, period_key, value)
         values ('00000000-0000-4000-8000-0000feed0002', 0, 'unlock', ${
           `'${key}'`}, '', 1);
       raise exception 'PROBE 00000';
     exception when others then raise exception 'PROBE %', sqlstate; end $$;`)
    .then(() => 'NO_RAISE', (e) => (String(e.message || e).match(/PROBE (\w+)/) || [, '?'])[1]));

  ok((await probe('companion:badger')) === '23514',
    'with companion:badger absent from hr_unlocks the storage guard did NOT refuse the ownership '
    + 'write. That refusal is the whole reason the missing rows are a player-visible bug rather '
    + 'than dormant data; if it stops firing, this guard is measuring nothing.');

  let fixSql = await mig(FIX);
  if (control === 'fix') {
    const anchor = '  from public.hr_companion_grants g\n';
    if (!fixSql.includes(anchor)) {
      problems.push(`the 'fix' control could not find its anchor in ${FIX} — a control that does `
        + 'not plant its defect reports a false green.');
    }
    fixSql = fixSql.replace(anchor, '  from public.hr_companion_grants g where false\n');
  }
  let fixFailed = null;
  try { await db.exec(fixSql); }
  catch (e) { fixFailed = String(e.message || e).split('\n')[0]; }
  ok(fixFailed === null, `the reseed migration failed against production's shape: ${fixFailed}`);

  const fixed = fpOf(await q(FP_SQL));
  const stillWrong = [...b.keys()].filter((id) => fixed.get(id) !== b.get(id));
  ok(stillWrong.length === 0,
    `after the reseed, ${stillWrong.length} row(s) still differ from the chain's own rebuild: `
    + `${stillWrong.join(', ')}. The fix must land production on exactly what the repo produces, `
    + 'or the divergence is only moved.');
  ok(fixed.size === before.length,
    `after the reseed the catalogue holds ${fixed.size} rows, the rebuild produces ${before.length}`);

  ok((await probe('companion:badger')) === '23503',
    'after the reseed the storage guard STILL refuses companion:badger — the fix did not take. '
    + '23503 (the foreign key) is what "the guard passed" looks like here.');
  ok((await probe('companion:__not_a_companion__')) === '23514',
    'NEGATIVE CONTROL: after the reseed an UNCATALOGUED companion id is accepted. The fix must '
    + 'open the gate for seventeen ids, not for the namespace.');

  await db.close?.();
  return { unscoped, destroyed, misshaped, refused };
}

/**
 * The guard, as a function, so tests/run-smoke.mjs can call it the way it calls
 * unlockOfferOwnershipGuard(). Returns the problem list; empty is green.
 */
export async function unlockCatalogueOwnershipGuard() {
  problems.length = 0;
  await run();
  return [...problems];
}

const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/unlock-catalogue-ownership.mjs');
if (RUN_DIRECTLY) {
  const selftest = process.argv.includes('--selftest');
  if (selftest) {
    /* TWO CONTROLS, because this guard makes two independent claims and a
       control for only one of them leaves the other free to be decoration.

       repair_list  drop 2026-08-19-companion-unlocks.sql from the repair list —
                    one file away from the omission actually made on 2026-08-23.
                    The shop companions stay flag-shaped, so the catalogue is NOT
                    restored, AND the 2026-09-05 reseed refuses to install on top
                    of a half-repaired catalogue rather than papering over it
                    with a green companion count.
       fix          neutralise the reseed's own §1 insert (`where false`), so
                    arm 5 is asked to prove a fix that does not fix. This is the
                    control for the arm that matters most before an apply. */
    const CONTROLS = ['repair_list', 'fix'];
    let missed = 0;
    for (const control of CONTROLS) {
      problems.length = 0;
      const r = await run({ control });
      if (problems.length) {
        console.log(`CAUGHT  ${control} — ${problems.length} assertion(s) fired:`);
        for (const p of problems) console.log(`          ${p.split('\n')[0]}`);
        if (r.refused.length) {
          console.log('        and a repair file failed CLOSED rather than half-applying:');
          for (const x of r.refused) console.log(`          ${x}`);
        }
      } else {
        console.error(`MISSED  ${control} — the guard is blind to it.`);
        missed += 1;
      }
    }
    if (missed) {
      console.error(`\n${missed} of ${CONTROLS.length} planted defects were NOT caught.`);
      process.exit(1);
    }
    console.log(`\nall ${CONTROLS.length} planted defects caught; the guard can see an unlisted `
      + 'seeder AND a reseed that does not reseed.');
    process.exit(0);
  }

  const r = await run();
  if (problems.length) {
    console.error(`unlock-catalogue-ownership: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log('unlock-catalogue-ownership: green — the chain rebuilds all 21 companion rows; '
    + `re-applying ${OWNER} alone ${r.unscoped ? 'destroys' : 'destroys'} `
    + `${r.destroyed.length} row(s) and mis-shapes ${r.misshaped.length}`
    + `${r.unscoped ? ' (its delete is unscoped)' : ''}; the declared repair list restores the `
    + 'catalogue byte-identically.');
  if (r.destroyed.length) {
    console.log(`  blast radius, measured: ${r.destroyed.join(', ')}`);
    console.log(`  mis-shaped:             ${r.misshaped.join(', ')}`);
  }
}
