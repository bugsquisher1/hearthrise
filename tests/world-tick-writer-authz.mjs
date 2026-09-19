// ============================================================================
// tests/world-tick-writer-authz.mjs — SECURITY PROOF TESTS for
// lane/world-tick-gather (supabase/migrations/2026-09-20-world-tick-roster.sql
// + services/world-tick/gather.js).
//
// ⚠ THIS GUARD IS RED ON THE LANE AS STAGED, ON PURPOSE. It is the executed
//   half of the security verdict in docs/planning/SEC_WORLD_TICK_GATHER_2026-09-19.md
//   and it exists so that "the tick cannot write" and "the watermark is belt
//   and braces" stop being assertions and become exit codes. It turns green
//   when the lane closes S-1, S-3 and S-4; it is deliberately NOT registered in
//   .github/workflows/smoke.yml, because a red guard on a shared workflow makes
//   the CI gate unreachable for every other lane (CLAUDE.md §4) and this one is
//   owned by a review, not by the release.
//
// It writes NOTHING to production. Every arm runs against a PGlite database
// rebuilt from supabase/migrations in tests/schema-apply-order.json order, and
// the probe character is a synthetic uuid that gen_random_uuid() cannot mint
// (not a v4). No live credential is read and no live query is issued.
//
// Run:  node tests/world-tick-writer-authz.mjs
// ============================================================================

import { bootReplay } from './schema-replay.mjs';
import { gatherDryRun, analyzeRows } from '../services/world-tick/replay.js';
import { settledWatermarkMs } from '../supabase/functions/hr-accrue/accrual.js';

/* A synthetic uuid, v-nibble 4 but a fixed body: it is not a value
   gen_random_uuid() produces, so it cannot collide with a real character
   (CLAUDE.md §2 — player state is never fabricated). */
const U = '00000000-0000-4000-8000-0000000abcde';

const problems = [];
const bad = (id, msg) => { problems.push(`${id}: ${msg}`); console.log(`  ✗ ${id} — ${msg}`); };
const good = (id, msg) => console.log(`  ✓ ${id} — ${msg}`);

// ── ARM S-5. Offline, no database: the dry run's OVERLAP metric ─────────────
// `tools/world-tick-replay.mjs --gather` prints "an OVERLAP would be a double
// pay" over a count computed as `from < prevTo`. Since settledWatermarkMs
// landed (2026-09-16) that is the shape of EVERY honest deferred window, so the
// metric cannot distinguish the two — and replay.js's own replayStream, on the
// identical rows, proves the same boundary correct.
function armOverlapMetric() {
  console.log('\nS-5  the gather dry run\'s "overlap" count vs. a textbook deferral');
  const T0 = Date.parse('2026-09-18T00:00:00.000Z');
  const TICK = 3000; const TICKS = 3; const SPAN = 10000;
  const w1 = settledWatermarkMs({ nowMs: T0 + SPAN, grantMs: SPAN, capped: false },
    { ticks: TICKS, recoverMs: 0, idleMs: 0 }, TICK, {});
  const row = (fromMs, toMs) => ({
    user_id: U, slot: 0, kind: 'gather', at: new Date(toMs).toISOString(),
    meta: {
      from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(),
      ms: toMs - fromMs, ticks: TICKS, qty: TICKS, capped: false,
      delta: { g: 0, i: {}, x: {} },
    },
  });
  const rows = [row(T0, T0 + SPAN), row(w1, w1 + SPAN)];
  const overlap = gatherDryRun(rows, { flushMs: 90000 }).total.overlap;
  const bucket = analyzeRows(rows).byBucket;

  if (bucket.watermark_exact !== 1) {
    bad('S-5a', `replayStream did not call the honest pair watermark_exact (${JSON.stringify(bucket)})`);
  } else {
    good('S-5a', 'replayStream classifies the deferred boundary watermark_exact — it is CORRECT');
  }
  if (overlap !== 0) {
    bad('S-5b', `gatherDryRun reports overlap=${overlap} for a boundary settledWatermarkMs itself `
      + `produced (deferral ${T0 + SPAN - w1} ms). The tool's legend calls an overlap "a double pay", `
      + 'so every deferred window reads as one. Classify with settledWatermarkMs, as replayStream does, '
      + 'or drop the claim.');
  } else {
    good('S-5b', 'gatherDryRun no longer counts a deferral as an overlap');
  }
}

// ── The database arms ───────────────────────────────────────────────────────
async function seed(db) {
  await db.exec(`insert into auth.users (id) values ('${U}') on conflict do nothing;`);
  await db.exec(`
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                     active_kind, active_id, active_since)
    values ('${U}', 0, 0, 0, 10, 10, 1, now() - interval '10 minutes',
            'gather', (select activity_id from public.hr_activities where kind='gather' limit 1),
            now() - interval '1 hour')
    on conflict (user_id, slot) do update set version = 1, gold = 0,
          accrued_to = now() - interval '10 minutes', active_kind = 'gather';
  `);
}

const state = async (db) => (await db.query(
  `select version, gold, accrued_to from public.player_state
    where user_id = '${U}' and slot = 0`)).rows[0];

/* One hr_apply call, made AS a named role — the transition PostgREST performs
   from `authenticator` on the JWT's `role` claim, and the only way either
   engine role is ever reached (both are `nologin`). */
async function applyAs(db, role, ver, key, gold, accruedSql) {
  await db.exec('begin');
  await db.exec(`set local role ${role}`);
  let out;
  try {
    out = (await db.query(
      `select public.hr_apply('${U}'::uuid, 0, ${ver}::bigint, '${key}'::uuid,
          jsonb_build_object('gold', ${gold}, 'accrued_to', ${accruedSql},
            'journal', jsonb_build_object('kind','gather','intent','accrue',
              'meta', jsonb_build_object('src','tick')))) as r`)).rows[0].r;
  } catch (e) { out = { ok: false, error: 'RAISED: ' + e.message }; }
  await db.exec('commit');
  return out;
}

// S-1. The grant this migration adds does not reach the writer.
async function armWriterReachable(db) {
  console.log('\nS-1  can `hr_tick` — the role §5 grants hr_apply to — actually settle a rostered user?');
  await seed(db);
  const W = `to_jsonb((now() - interval '5 minutes')::timestamptz)`;
  const tick = await applyAs(db, 'hr_tick', 1, '22222222-2222-4222-8222-222222222222', 100, W);
  const engine = await applyAs(db, 'hr_engine', 1, '11111111-1111-4111-8111-111111111111', 100, W);

  if (tick.ok !== true) {
    bad('S-1', `hr_tick calling hr_apply for a rostered user is refused: ${tick.error}. `
      + 'hr_apply\'s impersonation seam tests `v_role = \'hr_engine\'` literally '
      + '(2026-09-14-hr-apply-restatement.sql:699); every other role falls to `v_uid := auth.uid()`, '
      + 'which is NULL for a nologin engine role. The tick can settle nothing, and each attempt '
      + 'journals a forbidden_impersonation rejection — the highest-signal anti-cheat alert in the '
      + 'system — once per flush per character.');
  } else {
    good('S-1', 'hr_tick can settle a rostered character');
  }
  if (engine.ok !== true) {
    bad('S-1b', `the hr_engine control arm did not settle either (${engine.error}) — this arm is not `
      + 'measuring what it claims to measure');
  } else {
    good('S-1b', 'control: hr_engine settles the same delta, so the refusal above is about the ROLE');
  }
}

// S-2. The property concern (b) asks about, and it HOLDS.
async function armDoublePayVersion(db) {
  console.log('\nS-2  a tick and a client accrue settling the SAME window, both holding the same version');
  await seed(db);
  const W = `to_jsonb((now() - interval '5 minutes')::timestamptz)`;
  await applyAs(db, 'hr_engine', 1, 'dddddddd-0000-4000-8000-000000000001', 100, W);
  const after1 = await state(db);
  const second = await applyAs(db, 'hr_engine', 1, 'dddddddd-0000-4000-8000-000000000002', 100, W);
  const after2 = await state(db);

  if (second.error !== 'version_conflict' || Number(after2.gold) !== Number(after1.gold)) {
    bad('S-2', `the second settle on the same version was not refused (err=${second.error}, `
      + `gold ${after1.gold} -> ${after2.gold}) — the compare-and-set is not holding`);
  } else {
    good('S-2', 'refused version_conflict under the row lock; the window is paid exactly once. '
      + 'The prevention is in SQL (select … for update, then p_version <> v_st.version), '
      + 'not only in the edge code.');
  }
}

// S-3. The claim the lane calls "belt and braces", tested rather than read.
async function armReplayedWindow(db) {
  console.log('\nS-3  a FRESH version carrying an ALREADY-SETTLED window — the "second defence"');
  await seed(db);
  const W = `to_jsonb((now() - interval '5 minutes')::timestamptz)`;
  await applyAs(db, 'hr_engine', 1, 'eeeeeeee-0000-4000-8000-000000000001', 100, W);
  const before = await state(db);
  await applyAs(db, 'hr_engine', Number(before.version), 'eeeeeeee-0000-4000-8000-000000000002', 100,
    `to_jsonb(('${before.accrued_to.toISOString()}'::timestamptz - interval '3 minutes'))`);
  const after = await state(db);

  const moved = after.accrued_to.toISOString() !== before.accrued_to.toISOString();
  if (Number(after.gold) > Number(before.gold)) {
    bad('S-3', `the replayed window paid again (gold ${before.gold} -> ${after.gold}) while `
      + `accrued_to ${moved ? 'moved' : 'did NOT move'}. hr_apply clamps the watermark `
      + '(least(now(), greatest(old, proposed)) — :2288) but applies the VALUE regardless, so the '
      + 'watermark is a defence of the timestamp, not of the payment. gather.js:283 and the '
      + 'migration header both claim otherwise. The idempotency key and the version CAS are the '
      + 'ONLY defences — and tickIntentId(gather.js:287) omits `version`, which the accrual '
      + 'engine\'s key includes (hr-apply restatement :393).');
  } else {
    good('S-3', 'a replayed window moves no value');
  }
}

// S-4. The lease, and what one roster call touches.
async function armLease(db) {
  console.log('\nS-4  one GATHER roster call, on a character that also carries a COMBAT ownership row');
  await seed(db);
  await db.exec(`delete from public.hr_tick_ownership where user_id = '${U}';`);
  await db.exec(`
    insert into public.hr_tick_ownership (user_id, slot, channel, owned) values
      ('${U}', 0, 'gather', true),
      ('${U}', 0, 'combat', false);
  `);
  const roster = await db.query(
    `select user_id, slot from public.hr_tick_roster(array['gather'], 0, 200, 'proc-A', 30000)`);
  const own = (await db.query(
    `select channel, lease_holder from public.hr_tick_ownership
      where user_id = '${U}' order by channel`)).rows;

  if (roster.rows.length !== 1) {
    bad('S-4a', `the roster returned ${roster.rows.length} rows for ONE character. The \`leased\` CTE `
      + 'joins on (user_id, slot) but the primary key is (user_id, slot, channel) '
      + '(2026-09-20-world-tick-roster.sql:316-321), so RETURNING yields one row per ownership row '
      + 'and the tick builds N sessions for the same character — N-1 of which burn a flush on a '
      + 'version_conflict or replay a claimed idempotency key.');
  } else {
    good('S-4a', 'one roster row per character');
  }
  const stomped = own.find((r) => r.channel === 'combat' && r.lease_holder !== null);
  if (stomped) {
    bad('S-4b', `a gather-only roster call stamped lease_holder="${stomped.lease_holder}" on the `
      + 'COMBAT row, which is neither owned nor the active kind, and which the `for update of o` '
      + 'in the claim CTE never locked. When the combat channel lands, the two channels\' tick '
      + 'processes will steal each other\'s leases and starve characters. Add `channel` to the '
      + 'claim projection and to the UPDATE\'s WHERE.');
  } else {
    good('S-4b', 'the roster leases only the channel it claimed');
  }
}

// ── main ────────────────────────────────────────────────────────────────────
console.log('world-tick-writer-authz: security proof arms for lane/world-tick-gather');
armOverlapMetric();

const { db, failures } = await bootReplay({});
if (failures.length) {
  console.error('the schema replay did not complete:', failures);
  process.exit(2);
}
try {
  await armWriterReachable(db);
  await armDoublePayVersion(db);
  await armReplayedWindow(db);
  await armLease(db);
} finally {
  await db.close();
}

console.log('');
if (problems.length) {
  console.log(`world-tick-writer-authz: ${problems.length} open finding(s) — see`);
  console.log('docs/planning/SEC_WORLD_TICK_GATHER_2026-09-19.md for the verdict and the required changes.');
  process.exitCode = 1;
} else {
  console.log('world-tick-writer-authz: green — every arm of the security verdict is closed.');
}
