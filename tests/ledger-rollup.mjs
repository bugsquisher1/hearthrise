// ════════════════════════════════════════════════════════════════════════
// tests/ledger-rollup.mjs — THE 90-DAY LEDGER PRUNE, PROVEN BY EXECUTING IT.
//
// Run:  node tests/ledger-rollup.mjs            (the guard)
//       node tests/ledger-rollup.mjs --mutate   (prove it can go red)
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// `hr_ledger_prune` is scheduled hourly (2026-08-11-player-state.sql §9,
// `select public.hr_ledger_prune(20000)`) and HAS NEVER DELETED A ROW. Measured
// read-only on production 2026-09-18: public.player_ledger_rollup = 0 rows, and
// the oldest player_ledger row is 27 days old against a 90-day retention, so
// the first row can only age out around 2026-11-21.
//
// That is the exact shape of the game_events incident. `trim-game-events` was
// scheduled too, and the table still reached 1,598,269 rows / 229 MB from six
// players in four days — 94% of a 244 MB database — because a job being
// SCHEDULED is not the same fact as a job WORKING, and nothing here could tell
// the two apart. docs/design/restore-runbook.md marked this retention
// "covered" on the strength of the cron row alone. A retention path whose first
// real execution happens in production, against the only copy of every player's
// value movement, is an untested restore by another name.
//
// So this guard does the thing nobody has done: replays the whole migration
// chain into a real PostgreSQL (PGlite), MANUFACTURES the aged rows that
// production will not have for two more months, runs the prune EXACTLY as cron
// calls it, and asserts what must be true afterwards. It is the fire drill.
//
// ── THE FOUR PROPERTIES ─────────────────────────────────────────────────────
//  (1) CONSERVATION. Every per-(user, slot, month, kind) total that the rollup
//      claims to carry survives the prune to the unit. The rollup is the ONLY
//      thing that outlives the detail rows, so an arithmetic error here is a
//      silent, permanent falsification of the record the ledger exists to be.
//  (2) THE BOUNDARY IS EXACT. The rows deleted are exactly the rows older than
//      retain_days, no more and no fewer. One day either way is either a
//      retention that does not retain or a journal that eats live history.
//  (3) A SECOND RUN IS A NO-OP. The job runs hourly, forever. If a re-run can
//      re-roll rows it already rolled, the rollup inflates every hour and the
//      long-term record becomes fiction. `on conflict … set n = r.n + excluded.n`
//      is an ACCUMULATOR, which is correct only because the detail rows are
//      deleted in the same statement — this asserts that coupling.
//  (4) NO READER MOVES. **This is the dangerous one.** Fourteen RPC bodies
//      compute a per-day ceiling by summing public.player_ledger with a date
//      predicate (hr_day_budget_used, the market list/escrow/spend/proceeds
//      clamps, the unlock-buy namespace cap, the companion cap). If any of them
//      reads a window wide enough to contain a prunable row, then a player's
//      spending limit silently CHANGES the hour the prune first fires — the
//      ceiling would be computed from detail rows that no longer exist, and the
//      failure lands on a live economy at 03:00 with no error anywhere.
//      MEASURED HERE, on the real bodies: every one of those predicates is
//      scoped to the CURRENT UTC DAY (`hr_utc_day_key(at) = hr_utc_day_key(now())`
//      or `at >= hr_utc_day_start(…) and at < … + 1 day`), so a 90-day prune
//      cannot reach them. That is a good result, and it is asserted rather than
//      assumed BECAUSE it is one careless `interval '90 days'` away from being
//      false, and nothing else in the repo would notice.
//
// ── WHAT THIS GUARD FOUND ───────────────────────────────────────────────────
// As shipped on production, public.player_ledger_rollup carries (user_id, slot,
// month, kind, n, gold_in, gold_out). public.player_ledger carries value in FOUR
// currencies — gold, xp, qty (items) and gems_in — and the rollup carried ONE.
// The hour the prune first fires, every pruned row's XP, item quantity and gem
// movement would be gone with no aggregate behind it, while gold survives. XP is
// a RANKED surface and gems are a PAID one.
//
// The fix is supabase/migrations/2026-09-18-ledger-rollup-currencies.sql, which
// adds the four missing columns and restates hr_ledger_prune to carry them. It
// is STAGED, NOT APPLIED — so a green run of this file proves the REPO conserves
// all seven totals, and says nothing about production until that migration lands.
// The closing banner says so on every run rather than letting green read as safe.
//
// ROLLUP_SUMS below is the list of currencies the rollup promises to carry, and
// it is DATA rather than code on purpose: adding a column to player_ledger_rollup
// without conserving it is then a one-line red instead of a silent hole.
//
// ── THE MUTATION PROOF ──────────────────────────────────────────────────────
// Three defects planted in the REAL migration text, one per property that can
// realistically break, each required to be caught by the arm it is aimed at
// (`match` is narrow on purpose — "some assertion failed" would let a broken
// arm pass on a neighbour's evidence). Exit 1 if a defect slips, 2 if an anchor
// no longer matches, because a defect that was never planted is the same
// failure as a probe that is always null.
//
// ⚠ EVERY MUTATION ALSO DISABLES THE MIGRATION'S OWN §3 SELF-CHECK, and that is
//   deliberate rather than a weakening. 2026-09-18-ledger-rollup-currencies.sql
//   asserts conservation and idempotency in an executing block, so it catches
//   all three of these defects AT APPLY TIME — which is the correct first line
//   of defence and it stays. But a defect that some OTHER guard catches proves
//   nothing about THIS one: run without the skip, the patched chain simply fails
//   to apply and --mutate reports a harness error for every arm, leaving this
//   file's own assertions with no live proof at all. (restore-census.mjs plants
//   in the last file of the chain for the same reason, and records the split.)
//   So the skip makes the mutation reach this guard, and what this guard adds
//   over the §3 block is the part §3 cannot see: the whole replayed chain rather
//   than one file, the aged/live boundary across twelve kinds and two
//   characters, and property (4) — that no per-day ceiling in any RPC moves.
// ════════════════════════════════════════════════════════════════════════

import { bootReplay } from './schema-replay.mjs';

const argv = process.argv.slice(2);

/**
 * THE FILE THE MUTATIONS PATCH — and it must be the LAST file in the apply order
 * that replaces public.hr_ledger_prune, not the file that first created it.
 *
 * This bit me and is worth the comment. The mutations originally patched
 * 2026-08-11-player-state.sql, which is where hr_ledger_prune is born. The
 * moment 2026-09-18-ledger-rollup-currencies.sql entered the chain and restated
 * the body, all three planted defects were silently overwritten by the later
 * `create or replace` and --mutate reported "nothing at all" for every arm — a
 * guard that could no longer go red, with a green plain run still passing next
 * to it. If a NEWER migration ever takes over hr_ledger_prune again, this
 * constant and the anchors below move to it, or the proof quietly dies the same
 * way. tests/schema-apply-order.json's note for that file records the takeover.
 */
const PRUNE_OWNER = '2026-09-18-ledger-rollup-currencies.sql';

/**
 * The rollup's declared value columns -> how the prune must derive each.
 * DATA, NOT CODE, on purpose: this is the one place that says which currencies
 * the rollup promises to carry, so adding a column to player_ledger_rollup and
 * forgetting to conserve it is a one-line red rather than a silent hole.
 * Grew from {n, gold_in, gold_out} when 2026-09-18-ledger-rollup-currencies.sql
 * entered the chain.
 */
const ROLLUP_SUMS = {
  n: 'count(*)',
  gold_in: 'sum(greatest(coalesce(gold, 0), 0))',
  gold_out: 'sum(greatest(-coalesce(gold, 0), 0))',
  xp_in: 'sum(greatest(coalesce(xp, 0), 0))',
  qty_in: 'sum(greatest(coalesce(qty, 0), 0))',
  qty_out: 'sum(greatest(-coalesce(qty, 0), 0))',
  gems_in: 'sum(greatest(coalesce(gems_in, 0), 0))',
};

// Two characters, every ledger `kind` that carries value, spread across the
// aged band AND the live band. Ages are chosen to straddle the boundary.
const U1 = '00000000-0000-4000-b000-00000000ab01';
const U2 = '00000000-0000-4000-b000-00000000ab02';

// Every currency is non-zero somewhere, in BOTH directions where the column is
// signed (gold and qty), and the values are mutually distinct so a prune that
// summed the wrong column into the wrong slot cannot coincidentally agree.
/** Rows the prune MUST take: older than 90 days. */
const AGED = [
  // user, slot, kind, intent, ageDays, gold, xp, qty, gems
  [U1, 0, 'combat', 'xp_credit', 200, 1400, 9100, 0, 0],
  [U1, 0, 'combat', 'accrue', 150, -260, 4400, 3, 0],
  [U1, 0, 'gather', 'accrue', 120, 0, 2200, 41, 0],
  [U1, 0, 'shop', 'shop_buy:axe', 95, -5300, 0, 1, 0],
  [U1, 0, 'farm', 'farm_harvest', 91, 77, 130, 9, 0],
  [U1, 1, 'craft', 'accrue', 140, 0, 1700, 12, 0],
  [U2, 0, 'trade', 'market_sold:ore', 175, 22000, 0, -40, 0],
  [U2, 0, 'trade', 'market_buy:ore', 99, -18000, 0, 40, 0],
  [U2, 0, 'quest', 'claim', 93, 500, 250, 2, 13],
  [U2, 0, 'clan', 'deposit', 91, -900, 0, 7, 0],
  [U2, 0, 'raid', 'raid_claim', 92, 3100, 880, 1, 27],
  [U2, 0, 'iap', 'iap_grant', 185, 0, 0, 1, 500],
];

/** Rows the prune MUST LEAVE ALONE: inside the retention window. */
const LIVE = [
  [U1, 0, 'combat', 'xp_credit', 89.5, 120, 400, 0, 0],   // just inside the boundary
  [U1, 0, 'gather', 'accrue', 30, 0, 900, 15, 0],
  [U2, 0, 'trade', 'market_list:ore', 0, 0, 0, -12, 0],   // today — feeds property (4)
  [U2, 0, 'shop', 'unlock_buy:bank.3', 0, -2500, 0, 0, 0],// today
  [U1, 0, 'combat', 'accrue', 0, 640, 1200, 4, 9],        // today
];

/** Seed the ledger. INSERT is the one verb hr_ledger_immutable permits. */
async function seed(db) {
  const rows = [
    ...AGED.map((r) => [...r, true]),
    ...LIVE.map((r) => [...r, false]),
  ];
  for (const [u, slot, kind, intent, age, gold, xp, qty, gems] of rows) {
    await db.query(
      `insert into public.player_ledger
         (user_id, slot, kind, intent, gold, xp, qty, gems_in,
          gold_in, xp_in, qty_in, at)
       values ($1::uuid, $2::int, $3::text, $4::text, $5::bigint, $6::bigint, $7::bigint, $8::bigint,
               greatest($5::bigint, 0), greatest($6::bigint, 0), greatest($7::bigint, 0),
               now() - make_interval(secs => $9::int))`,
      [u, slot, kind, intent, gold, xp, qty, gems, Math.round(age * 86400)],
    );
  }
}

/** The per-(user,slot,month,kind) truth for the AGED rows, before the prune. */
async function expectedRollup(db) {
  const sel = Object.entries(ROLLUP_SUMS)
    .map(([col, expr]) => `${expr} as ${col}`).join(', ');
  return (await db.query(
    `select user_id::text, slot, date_trunc('month', at)::date::text as month, kind, ${sel}
       from public.player_ledger
      where at < now() - interval '90 days' - interval '1 second'
      group by 1,2,3,4 order by 1,2,3,4`)).rows;
}

async function actualRollup(db) {
  const cols = Object.keys(ROLLUP_SUMS).join(', ');
  return (await db.query(
    `select user_id::text, slot, month::text as month, kind, ${cols}
       from public.player_ledger_rollup order by 1,2,3,4`)).rows;
}

/** Every surviving detail row, as a comparable key set. */
async function detailKeys(db) {
  return (await db.query(
    `select id::text as id, kind, intent,
            round(extract(epoch from (now() - at)) / 86400)::int as age_days
       from public.player_ledger order by id`)).rows
    .map((r) => `${r.id}|${r.kind}|${r.intent}|${r.age_days}`);
}

/**
 * Property (4)'s inputs: the per-day ceilings, read with the SAME predicates the
 * live RPC bodies use. Anything that moves across the prune is the incident.
 */
async function dayCeilings(db) {
  const out = {};
  for (const [label, u] of [['u1', U1], ['u2', U2]]) {
    // hr_day_budget_used — 2026-08-15-gem-daily-budget.sql §3, the gold/xp/qty/
    // gems ceiling every value-minting apply is checked against.
    out[`${label}.day_budget`] = JSON.stringify(
      (await db.query('select public.hr_day_budget_used($1::uuid, 0) as v', [u])).rows[0].v);
    // The market clamps — 2026-08-17-market-v2.sql §(b), §(b2), §(6).
    out[`${label}.market_lists`] = (await db.query(
      `select count(*)::int as v from public.player_ledger
        where user_id = $1 and slot = 0 and kind = 'trade'
          and intent like 'market\\_list:%'
          and public.hr_utc_day_key(at) = public.hr_utc_day_key(now())`, [u])).rows[0].v;
    out[`${label}.market_escrow`] = (await db.query(
      `select coalesce(sum(-qty), 0)::int as v from public.player_ledger
        where user_id = $1 and slot = 0 and kind = 'trade'
          and intent like 'market\\_list:%'
          and public.hr_utc_day_key(at) = public.hr_utc_day_key(now())`, [u])).rows[0].v;
    out[`${label}.market_spend`] = (await db.query(
      `select coalesce(sum(-gold), 0)::int as v from public.player_ledger
        where user_id = $1 and slot = 0 and kind = 'trade'
          and intent like 'market\\_buy:%'
          and public.hr_utc_day_key(at) = public.hr_utc_day_key(now())`, [u])).rows[0].v;
    // The unlock-buy namespace cap — 2026-08-16-unlock-buy.sql §(b354.1).
    out[`${label}.unlock_buys`] = (await db.query(
      `select count(*)::int as v from public.player_ledger
        where user_id = $1 and slot = 0 and kind = 'shop'
          and intent like 'unlock\\_buy:%'
          and public.hr_utc_day_key(at) = public.hr_utc_day_key(now())`, [u])).rows[0].v;
  }
  return out;
}

/** Run the prune the way cron does — verbatim from the scheduled command. */
async function runPrune(db) {
  return (await db.query('select public.hr_ledger_prune(20000) as n')).rows[0].n;
}

// ── The assertions ─────────────────────────────────────────────────────────
/** @returns {string[]} problems — empty means the prune holds. */
async function check(db) {
  const problems = [];
  const P = (m) => problems.push(m);

  await seed(db);

  const want = await expectedRollup(db);
  const agedKeys = new Set((await db.query(
    `select id::text as id from public.player_ledger
      where at < now() - interval '90 days' - interval '1 second'`)).rows.map((r) => r.id));
  const before = await detailKeys(db);
  const ceilBefore = await dayCeilings(db);

  if (!agedKeys.size) {
    const e = new Error('the fixture seeded NO prunable rows, so every assertion below is vacuous');
    e.harness = true; throw e;
  }

  // ── the prune, exactly as cron calls it ──────────────────────────────────
  const deleted = await runPrune(db);

  // (1) CONSERVATION.
  const got = await actualRollup(db);
  if (!got.length) {
    P('ROLLUP IS EMPTY after a prune that had aged rows to take. Nothing survives the\n'
      + '      deletion, so the prune is a DESTRUCTIVE retention with no aggregate behind it.');
  }
  const key = (r) => `${r.user_id}|${r.slot}|${r.month}|${r.kind}`;
  const gotBy = new Map(got.map((r) => [key(r), r]));
  for (const w of want) {
    const g = gotBy.get(key(w));
    if (!g) {
      P(`ROLLUP ROW MISSING: ${key(w)} was pruned from the detail and has no rollup row.\n`
        + '      Those rows are gone and nothing records that they existed.');
      continue;
    }
    for (const col of Object.keys(ROLLUP_SUMS)) {
      if (String(g[col]) !== String(w[col])) {
        P(`CONSERVATION BROKEN: ${key(w)}.${col} — the detail totalled ${w[col]},\n`
          + `      the rollup carries ${g[col]}. The rollup is the only surviving record.`);
      }
    }
    gotBy.delete(key(w));
  }
  for (const k of gotBy.keys()) {
    P(`ROLLUP ROW INVENTED: ${k} has no corresponding pruned detail rows.`);
  }

  // (2) THE BOUNDARY IS EXACT.
  const after = await detailKeys(db);
  const survived = new Set(after);
  const removed = before.filter((b) => !survived.has(b));
  if (removed.length !== agedKeys.size) {
    P(`BOUNDARY WRONG: ${agedKeys.size} row(s) were older than the 90-day retention and\n`
      + `      ${removed.length} row(s) were deleted. The prune must take exactly the aged rows —\n`
      + '      fewer means retention does not retain, more means it ate live history.');
  }
  if (deleted !== agedKeys.size) {
    P(`hr_ledger_prune reported ${deleted} deleted, ${agedKeys.size} row(s) were prunable.`);
  }
  for (const r of after) {
    const age = Number(r.split('|').pop());
    if (age > 90) {
      P(`AGED ROW SURVIVED: ${r} is ${age} days old and outlived a 90-day prune.`);
    }
  }

  // (3) A SECOND RUN IS A NO-OP.
  const rollupAfterFirst = JSON.stringify(await actualRollup(db));
  const detailAfterFirst = JSON.stringify(await detailKeys(db));
  const second = await runPrune(db);
  if (second !== 0) {
    P(`SECOND RUN DELETED ${second} MORE ROW(S). The job runs hourly; a prune that is not\n`
      + '      idempotent once the aged rows are gone is deleting live history every hour.');
  }
  if (JSON.stringify(await actualRollup(db)) !== rollupAfterFirst) {
    P('DOUBLE COUNT: a second prune MOVED THE ROLLUP. `on conflict … set n = r.n + excluded.n`\n'
      + '      is an accumulator, and it is only correct because the detail rows are deleted in\n'
      + '      the same statement. If a row can be rolled twice, every total inflates hourly and\n'
      + '      the long-term record becomes fiction.');
  }
  if (JSON.stringify(await detailKeys(db)) !== detailAfterFirst) {
    P('SECOND RUN CHANGED THE SURVIVING DETAIL ROWS.');
  }

  // (4) NO DAY-CEILING READER MOVES. The dangerous one.
  const ceilAfter = await dayCeilings(db);
  for (const k of Object.keys(ceilBefore)) {
    if (String(ceilBefore[k]) !== String(ceilAfter[k])) {
      P(`A PER-DAY CEILING MOVED ACROSS THE PRUNE: ${k}\n`
        + `      before ${ceilBefore[k]}\n      after  ${ceilAfter[k]}\n`
        + '      A live RPC computes a player spending/minting limit from player_ledger over a\n'
        + '      window wide enough to contain a pruned row. The hour the prune first fires,\n'
        + "      that player's ceiling changes with no error anywhere. Scope the predicate to\n"
        + '      the current UTC day, or read the rollup.');
    }
  }

  return problems;
}

/**
 * Short-circuits §3 of the migration so its executing self-check cannot be the
 * thing that catches a planted defect. `HR918_ROLLBACK_OK` is the sentinel §3
 * already raises on success and already swallows, so this turns the whole block
 * into a no-op without touching its exception handling. See the header note.
 */
const SKIP_SELFCHECK = [
  '  begin\n    -- (a) the four columns exist',
  "  begin\n    raise exception 'HR918_ROLLBACK_OK';\n    -- (a) the four columns exist",
];

// ── The mutation catalogue ─────────────────────────────────────────────────
const MUTATIONS = {
  drop_a_kind_from_the_rollup: {
    what: "the rollup's aggregate skips kind='combat', so combat gold is deleted from the "
      + 'detail with nothing recording it — the single most valuable thing the ledger holds, '
      + 'gone with a green build',
    match: /ROLLUP ROW MISSING|CONSERVATION BROKEN/,
    patches: [[PRUNE_OWNER, [[
      '        from public.player_ledger l join doomed d on d.id = l.id and d.at = l.at\n'
      + '       group by 1,2,3,4',
      '        from public.player_ledger l join doomed d on d.id = l.id and d.at = l.at\n'
      + "       where l.kind <> 'combat'\n"
      + '       group by 1,2,3,4',
    ], SKIP_SELFCHECK]]],
  },
  boundary_off_by_one: {
    what: 'the retention cut is computed 30 days too early, so rows the policy says to prune '
      + 'are silently retained — the failure mode that looks like nothing at all until the '
      + 'disk fills, which is exactly how game_events reached 94% of the database',
    match: /BOUNDARY WRONG|AGED ROW SURVIVED/,
    patches: [[PRUNE_OWNER, [[
      "  v_cut := now() - make_interval(days => coalesce(v_keep, 90)) - interval '1 second';",
      "  v_cut := now() - make_interval(days => coalesce(v_keep, 90)) - interval '30 days';",
    ], SKIP_SELFCHECK]]],
  },
  double_count_on_second_run: {
    what: 'the detail delete is neutered while the rollup insert still accumulates, so every '
      + 'hourly run re-rolls the same rows and every long-term total inflates forever — the '
      + 'record the ledger exists to be becomes fiction, silently',
    match: /DOUBLE COUNT|SECOND RUN DELETED/,
    patches: [[PRUNE_OWNER, [[
      '  delete from public.player_ledger l\n'
      + '   using doomed d where l.id = d.id and l.at = d.at;',
      '  delete from public.player_ledger l\n'
      + '   using doomed d where l.id = d.id and l.at = d.at and false;',
    ], SKIP_SELFCHECK]]],
  },
};

async function main() {
  if (argv.includes('--mutate')) {
    let slipped = 0;
    for (const [name, mut] of Object.entries(MUTATIONS)) {
      let problems;
      try {
        const { db } = await bootReplay({ patches: new Map(mut.patches) });
        problems = await check(db);
      } catch (e) {
        if (e.harness) { console.error(`HARNESS  ${name}: ${e.message}`); process.exit(2); }
        // A defect that makes the CHAIN throw proves nothing about this guard.
        console.error(`HARNESS  ${name}: the patched chain did not apply — the anchor has moved.\n`
          + `           ${String(e.message).split('\n')[0]}`);
        process.exit(2);
      }
      const hit = problems.find((p) => mut.match.test(p));
      if (!hit) {
        console.error(`SLIPPED  ${name}\n           ${mut.what}\n`
          + `           Expected a problem matching ${mut.match}; got:\n`
          + (problems.length
            ? problems.map((p) => `             ${p.split('\n')[0]}`).join('\n')
            : '             (nothing at all)'));
        slipped++;
      } else {
        console.log(`caught   ${name.padEnd(28)}\n           ${mut.what}\n           -> ${hit.split('\n')[0]}`);
      }
    }
    if (slipped) {
      console.error(`\n${slipped} planted defect(s) slipped past the guard.`);
      process.exit(1);
    }
    console.log(`\nall ${Object.keys(MUTATIONS).length} planted defects caught`);
    return;
  }

  const { db } = await bootReplay({});
  const problems = await check(db);
  if (problems.length) {
    console.error('\nLEDGER PRUNE FAILED — the 90-day retention does not hold.\n');
    for (const p of problems) console.error(`  · ${p}`);
    console.error(`\n${problems.length} problem(s).`);
    process.exit(1);
  }

  const rollup = await actualRollup(db);
  const left = (await db.query('select count(*)::int as n from public.player_ledger')).rows[0].n;
  console.log(`ledger-rollup: OK — ${AGED.length} aged row(s) pruned into ${rollup.length} rollup row(s), `
    + `${left} live row(s) untouched, second run a no-op, `
    + `${Object.keys(await dayCeilings(db)).length} per-day ceiling(s) unmoved.`);
  console.log(`  conserved columns: ${Object.keys(ROLLUP_SUMS).join(', ')}`);
  console.log('\n  ⚠ GREEN HERE IS THE REPO, NOT PRODUCTION. xp_in/qty_in/qty_out/gems_in exist');
  console.log('    because supabase/migrations/2026-09-18-ledger-rollup-currencies.sql is in the');
  console.log('    apply order — and that file is STAGED, NOT APPLIED. On production today the');
  console.log('    rollup still declares gold only, so a prune there would destroy every pruned');
  console.log("    row's XP, item quantity and gem movement. XP is a ranked surface.");
  console.log('    That is survivable ONLY because the prune has never fired: measured read-only');
  console.log('    2026-09-18, player_ledger_rollup = 0 rows and the oldest ledger row is 27 days');
  console.log('    old against a 90-day retention, so the first real fire is ~2026-11-21.');
  console.log('    APPLY BEFORE THAT DATE. After it, the detail this file would have summarised');
  console.log('    is already gone and the fix cannot recover it.');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(e.harness ? 2 : 1);
});
