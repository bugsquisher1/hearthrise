// ============================================================================
// tests/world-tick-writer-authz.mjs — SECURITY PROOF TESTS for
// lane/world-tick-gather (supabase/migrations/2026-09-20-world-tick-roster.sql
// + services/world-tick/gather.js).
//
// ── 2026-09-21: TWO ARMS WERE RE-POINTED, AND WHY ──────────────────────────
// S-1 and S-3 originally asked their questions of RAW `hr_apply` called as
// `hr_tick`, because that is what 2026-09-20-world-tick-roster.sql §5 granted.
// `lane/world-tick-m1` took the verdict's own preferred route (§3 condition 1,
// "prefer the alternative that needs no splice") one step further and WITHDREW
// that grant: the tick reaches the writer only through `hr_tick_settle`, a
// lease-checked SECURITY DEFINER fence, and holds raw hr_apply and raw hr_seed
// no longer. So the original arms' premise — "the role §5 grants hr_apply to" —
// is no longer true of §5, and asking them unchanged would test a door that was
// deliberately welded shut.
//
// The arms were therefore re-pointed at the fence, and NOTHING WAS WEAKENED:
// each kept its original question, and S-1c / S-1d were ADDED to assert the
// withdrawal itself (hr_tick must reach neither raw hr_apply nor the fence).
// Coverage went up, not down. The raw-hr_apply replay measurement Security
// made is retained verbatim as an informational line under S-3, so that the
// reason the fence is load-bearing stays on the record.
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

/* Arm the tick for a probe character: owned, leased to `holder`, config on.
   Every row is one this function inserted, under the synthetic uuid U. */
async function arm(db, { holder = 'proofs', shadow = false } = {}) {
  await seed(db);
  await db.exec(`delete from public.hr_tick_ownership where user_id = '${U}';`);
  await db.exec(`
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
    values ('${U}', 0, 'gather', true, '${holder}', now() + interval '5 minutes');`);
  await db.exec(`update public.hr_tick_config
                    set enabled = true, shadow = ${shadow ? 'true' : 'false'} where id;`);
}

/* One settle through the FENCE, made AS a named role — the same `set local
   role` transition PostgREST performs, and the one the Edge Function performs
   before every apply it has made since 2026-08-11. */
async function settleAs(db, role, { holder = 'proofs', ver, key, gold = 100, fromSql, toSql }) {
  await db.exec('begin');
  await db.exec(`set local role ${role}`);
  let out;
  try {
    out = (await db.query(
      `select public.hr_tick_settle('${holder}', '${U}'::uuid, 0, 'gather', ${ver}::bigint,
          ${fromSql}, ${toSql}, '${key}'::uuid,
          jsonb_build_object('gold', ${gold}, 'accrued_to', to_jsonb(${toSql}),
            'journal', jsonb_build_object('kind','gather','intent','accrue',
              'meta', jsonb_build_object('src','tick')))) as r`)).rows[0].r;
  } catch (e) { out = { ok: false, error: 'RAISED: ' + e.message }; }
  await db.exec('commit');
  return out;
}

// S-1. Can the tick settle a rostered user at all — and is the raw door shut?
async function armWriterReachable(db) {
  console.log('\nS-1  can the world tick settle a rostered user, through the fence and only through it?');
  await arm(db);
  const W_FROM = `(now() - interval '10 minutes')::timestamptz`;
  const W_TO = `(now() - interval '5 minutes')::timestamptz`;
  const settled = await settleAs(db, 'hr_engine',
    { ver: 1, key: '22222222-2222-4222-8222-222222222222', fromSql: W_FROM, toSql: W_TO });
  const after = await state(db);

  if (settled.ok !== true || Number(after.gold) !== 100) {
    bad('S-1', `the tick could not settle through hr_tick_settle: ${JSON.stringify(settled)} `
      + `(gold=${after.gold}). The whole milestone rests on this arm: hr_apply's impersonation seam `
      + "tests `v_role = 'hr_engine'` literally, so the fence only works because the `role` GUC "
      + 'survives a SECURITY DEFINER boundary and the caller is the role the Edge Function already '
      + 'carries. If this is red, S-1 is NOT closed and the tick settles nothing.');
  } else {
    good('S-1', 'hr_engine settles a leased character through hr_tick_settle — the fence reaches '
      + "hr_apply as `hr_engine`, so the money function's seam is untouched and no live hash moves");
  }

  // S-1b. Control: the same delta through raw hr_apply as hr_engine still works,
  // so a red S-1 above would be about the FENCE and not about the delta.
  await seed(db);
  const engine = await applyAs(db, 'hr_engine', 1, '11111111-1111-4111-8111-111111111111', 100,
    `to_jsonb((now() - interval '5 minutes')::timestamptz)`);
  if (engine.ok !== true) {
    bad('S-1b', `the hr_engine control arm did not settle either (${engine.error}) — this arm is not `
      + 'measuring what it claims to measure');
  } else {
    good('S-1b', 'control: hr_engine settles the same delta through raw hr_apply, so S-1 is about '
      + 'the fence and not about the delta');
  }

  // S-1c / S-1d. THE WITHDRAWAL, asserted. `hr_tick` must reach neither the
  // money function nor the fence: raw hr_apply because it is raw, and the fence
  // because hr_apply's untouched seam would refuse `role = hr_tick` anyway and
  // journal a forbidden_impersonation alert on every flush.
  await arm(db);
  const tickRaw = await applyAs(db, 'hr_tick', 1, '33333333-3333-4333-8333-333333333333', 100,
    `to_jsonb((now() - interval '5 minutes')::timestamptz)`);
  if (tickRaw.ok === true) {
    bad('S-1c', 'hr_tick still holds raw hr_apply. The tick must reach the writer only through '
      + 'hr_tick_settle, which checks the lease and compare-and-sets the watermark; a raw grant '
      + 'is a second door with neither check (SEC_WORLD_TICK_GATHER_2026-09-19.md S-1/S-7).');
  } else {
    good('S-1c', `hr_tick cannot call raw hr_apply (${tickRaw.error}) — the grant is withdrawn`);
  }
  const tickFence = await settleAs(db, 'hr_tick',
    { ver: 1, key: '44444444-4444-4444-8444-444444444444', fromSql: W_FROM, toSql: W_TO });
  if (tickFence.ok === true) {
    bad('S-1d', 'hr_tick executed hr_tick_settle. That door cannot open — hr_apply would refuse '
      + '`role = hr_tick` and journal a forbidden_impersonation on every flush — so granting it '
      + 'installs an alarm generator, not a capability.');
  } else {
    good('S-1d', 'hr_tick cannot execute hr_tick_settle either — the selector and the settler are '
      + 'different roles, and neither is the tick host');
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

// S-3. The "second defence" — which did not exist, and now does.
async function armReplayedWindow(db) {
  console.log('\nS-3  a FRESH version carrying an ALREADY-SETTLED window — the "second defence"');

  // (a) THE MEASUREMENT SECURITY MADE, kept on the record. Raw hr_apply clamps
  //     the watermark and applies the value anyway, so a replayed window with a
  //     fresh version pays twice and moves accrued_to zero milliseconds. This is
  //     reported, not asserted: it is a property of the money function, which
  //     this lane deliberately does not touch, and it is the REASON the fence
  //     below has to exist.
  await seed(db);
  const W = `to_jsonb((now() - interval '5 minutes')::timestamptz)`;
  await applyAs(db, 'hr_engine', 1, 'eeeeeeee-0000-4000-8000-000000000001', 100, W);
  const rawBefore = await state(db);
  await applyAs(db, 'hr_engine', Number(rawBefore.version), 'eeeeeeee-0000-4000-8000-000000000002',
    100, `to_jsonb(('${rawBefore.accrued_to.toISOString()}'::timestamptz - interval '3 minutes'))`);
  const rawAfter = await state(db);
  console.log(`  ℹ raw hr_apply, replayed window, fresh version+key: gold ${rawBefore.gold} -> `
    + `${rawAfter.gold}, accrued_to ${rawAfter.accrued_to.toISOString() === rawBefore.accrued_to.toISOString()
      ? 'did NOT move' : 'moved'}. hr_apply clamps the TIMESTAMP (least(now(), greatest(old, `
    + 'proposed))) and applies the VALUE regardless — which is why the watermark was never the '
    + '"belt and braces" the lane claimed, and why hr_tick_settle supplies it.');

  // (b) THE DEFENCE, THROUGH THE FENCE. Same shape — a fresh version, a fresh
  //     idempotency key, a window already settled — and it must be refused on
  //     the watermark alone, under the row lock.
  await arm(db);
  const W_FROM = `(now() - interval '10 minutes')::timestamptz`;
  const W_TO = `(now() - interval '5 minutes')::timestamptz`;
  const first = await settleAs(db, 'hr_engine',
    { ver: 1, key: 'eeeeeeee-0000-4000-8000-00000000000a', fromSql: W_FROM, toSql: W_TO });
  const before = await state(db);
  if (first.ok !== true) {
    bad('S-3', `the first settle through the fence was refused (${JSON.stringify(first)}) — the `
      + 'replay arm cannot measure anything');
    return;
  }
  const replay = await settleAs(db, 'hr_engine',
    { ver: Number(before.version), key: 'eeeeeeee-0000-4000-8000-00000000000b',
      fromSql: W_FROM, toSql: W_TO });
  const after = await state(db);

  if (Number(after.gold) > Number(before.gold) || replay.ok === true) {
    bad('S-3', `the replayed window paid again through the fence (gold ${before.gold} -> `
      + `${after.gold}, result ${JSON.stringify(replay)}). The watermark compare-and-set in `
      + 'hr_tick_settle (2026-09-21-world-tick-settle-fence.sql §3 (6)) is not holding.');
  } else if (replay.error !== 'window_already_settled') {
    bad('S-3', `the replay was refused, but by "${replay.error}" rather than by the watermark `
      + 'compare-and-set. The defence must be the WATERMARK — independent of the key and of the '
      + 'version — or it is the same single defence Security found, wearing a new name.');
  } else {
    good('S-3', 'refused `window_already_settled` by a compare-and-set on the settled watermark, '
      + 'taken under `select … for update` on player_state. Independent of the idempotency key '
      + 'and of the version: three defences now, where the lane claimed two and had one.');
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
