// ============================================================================
// tests/world-tick-double-pay.mjs — THE WORLD TICK CANNOT PAY A WINDOW TWICE,
// CANNOT BE LEFT RUNNING, AND CANNOT PAY AT ALL IN SHADOW.
//
//   node tests/world-tick-double-pay.mjs            the guard
//   node tests/world-tick-double-pay.mjs --mutate   bypass the fence; every arm must go RED
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// The world tick makes a SECOND server-side caller of the function that writes
// all player value. The lane that staged it claimed two defences against paying
// one window twice and had one: Security executed the "belt and braces"
// watermark claim and found that `hr_apply` clamps the TIMESTAMP and applies
// the VALUE regardless (SEC_WORLD_TICK_GATHER_2026-09-19.md, S-3). A replayed
// window carrying a fresh version paid again and moved `accrued_to` zero
// milliseconds.
//
// `hr_tick_settle` (2026-09-21-world-tick-settle-fence.sql) supplies the
// missing defence — a COMPARE-AND-SET ON THE SETTLED WATERMARK, taken after
// `select … for update` on `player_state` and independent of both the
// idempotency key and the version. This guard is that claim's exit code, plus
// the two rollout controls the milestone is armed behind.
//
// ── THE MUTATION PROOF, AND WHY IT IS THE RIGHT ONE ─────────────────────────
// `--mutate` re-runs every arm against RAW `hr_apply` — the exact path the tick
// held before the fence — and requires each one to FAIL. That is not a
// synthetic defect: it is the production behaviour of the money function, which
// this lane deliberately does not touch. So the mutation proves the arms
// measure THE FENCE and not some property `hr_apply` already had, and it will
// keep proving it for as long as the fence is what stands between the two.
//
// It writes NOTHING to production. Every arm runs against a PGlite database
// rebuilt from supabase/migrations in tests/schema-apply-order.json order, and
// every row is written by this file under synthetic uuids that
// `gen_random_uuid()` cannot mint (CLAUDE.md §2 — player state is never
// fabricated). No live credential is read and no live query is issued.
//
// ⚠ WHAT THIS GUARD CANNOT SEE. PGlite is ONE backend, so two SQL sessions
//   cannot genuinely interleave here (tools/race-test.mjs records the same
//   limitation and the four attempts that failed on it). Every arm below is
//   therefore a proof about the MECHANISM — the lock is taken before the read,
//   the comparison is against the locked row, the UPDATE is in the same
//   transaction — and an INTERLEAVING is simulated by ordering the calls, which
//   is what a lost race looks like to the loser. The concurrency claim is
//   re-confirmed read-only against production before the tick is armed; see
//   the Coordinator steps in docs/planning/WORLD_TICK_DESIGN.md.
// ============================================================================

import { bootReplay } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate');

/* Synthetic uuids: v-nibble 4 but a fixed body, so they are not values
   gen_random_uuid() produces and cannot collide with a real character. */
const U = (n) => `00000000-0000-4000-8000-00000000d${String(n).padStart(3, '0')}`;
const KEY = (n) => `0000dddd-0000-4000-8000-${String(n).padStart(12, '0')}`;

const problems = [];
const bad = (id, msg) => { problems.push(`${id}: ${msg}`); console.log(`  ✗ ${id} — ${msg}`); };
const good = (id, msg) => console.log(`  ✓ ${id} — ${msg}`);

/* ── WHICH ARMS INVERT UNDER --mutate, AND WHICH MUST NOT ──────────────────
   `judge` is for a property THE FENCE SUPPLIES: bypassing the fence must break
   it, so its verdict inverts. `judgeBoth` is for a property `hr_apply` ALREADY
   HAD before the tick existed — the version compare-and-set under its own row
   lock, which Security executed and found sound (S-2). Inverting those would
   be demanding that the money function get worse when the fence is removed,
   which is false, and an arm written that way would report a green mutation
   for a defence that is simply shared. They are asserted identically in both
   modes and exist as REGRESSION arms: neither path may quietly lose the CAS. */
function judgeBoth(id, ok, okMsg, badMsg) {
  if (ok) good(id, `${okMsg}${MUTATE ? ' (shared with raw hr_apply — this arm does not invert)' : ''}`);
  else bad(id, badMsg);
}

/* An arm's verdict, inverted under --mutate. A mutated arm that still passes is
   an arm that was not measuring the fence. */
function judge(id, ok, okMsg, badMsg) {
  if (MUTATE) {
    if (ok) bad(`${id}!`, `MUTATION SURVIVED — ${okMsg}. With the fence bypassed this arm must go `
      + 'red; it is not measuring hr_tick_settle.');
    else good(`${id}!`, `mutation caught: ${badMsg}`);
    return;
  }
  if (ok) good(id, okMsg); else bad(id, badMsg);
}

// ── fixtures ────────────────────────────────────────────────────────────────
let ACT = null;

async function makeChar(db, u, { accruedMinutesAgo = 10 } = {}) {
  await db.exec(`insert into auth.users (id) values ('${u}') on conflict do nothing;`);
  await db.exec(`
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                     active_kind, active_id, active_since)
    values ('${u}', 0, 0, 0, 10, 10, 1, now() - interval '${accruedMinutesAgo} minutes',
            'gather', '${ACT}', now() - interval '2 hours')
    on conflict (user_id, slot) do update
      set version = 1, gold = 0, accrued_to = now() - interval '${accruedMinutesAgo} minutes',
          active_kind = 'gather', active_id = '${ACT}';`);
}

async function own(db, u, { holder = 'proofs', leaseMinutes = 5, owned = true } = {}) {
  await db.exec(`delete from public.hr_tick_ownership where user_id = '${u}';`);
  await db.exec(`
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
    values ('${u}', 0, 'gather', ${owned}, '${holder}', now() + interval '${leaseMinutes} minutes');`);
}

const config = (db, sets) => db.exec(`update public.hr_tick_config set ${sets} where id;`);

const stateOf = async (db, u) => (await db.query(
  `select version, gold, accrued_to from public.player_state
    where user_id = '${u}' and slot = 0`)).rows[0];

const shadowRows = async (db, u) => Number((await db.query(
  `select count(*)::int as n from public.hr_tick_shadow where user_id = '${u}'`)).rows[0].n);

/* ONE SETTLE. Through the fence normally; through RAW hr_apply under --mutate,
   which is precisely the pre-fence path and precisely what must fail. */
async function settle(db, u, { holder = 'proofs', ver, key, gold = 100, from, to }) {
  const delta = `jsonb_build_object('gold', ${gold}, 'accrued_to', to_jsonb(${to}),
      'journal', jsonb_build_object('kind','gather','intent','accrue',
        'meta', jsonb_build_object('src','tick','qty',7,'ticks',3)))`;
  const sql = MUTATE
    ? `select public.hr_apply('${u}'::uuid, 0, ${ver}::bigint, '${key}'::uuid, ${delta}) as r`
    : `select public.hr_tick_settle('${holder}', '${u}'::uuid, 0, 'gather', ${ver}::bigint,
          ${from}, ${to}, '${key}'::uuid, ${delta}) as r`;
  await db.exec('begin');
  await db.exec('set local role hr_engine');
  let out;
  try { out = (await db.query(sql)).rows[0].r; }
  catch (e) { out = { ok: false, error: 'RAISED: ' + e.message }; }
  await db.exec('commit');
  return out;
}

/* THE CLIENT HALF of a race: an ordinary player-driven apply through raw
   hr_apply, exactly as the Edge Function makes it for a `collect` or an
   `accrue`. It is deliberately NOT routed through the fence under any flag —
   the client path is not fenced and must not be, and the question this guard
   asks is whether the TICK can double-pay ON TOP OF it. */
async function clientApply(db, u, { ver, key, gold = 100, toSql }) {
  await db.exec('begin');
  await db.exec('set local role hr_engine');
  let out;
  try {
    out = (await db.query(
      `select public.hr_apply('${u}'::uuid, 0, ${ver}::bigint, '${key}'::uuid,
          jsonb_build_object('gold', ${gold}, 'accrued_to', to_jsonb(${toSql}),
            'journal', jsonb_build_object('kind','gather','intent','collect'))) as r`)).rows[0].r;
  } catch (e) { out = { ok: false, error: 'RAISED: ' + e.message }; }
  await db.exec('commit');
  return out;
}

const FROM = `(now() - interval '10 minutes')::timestamptz`;
const TO = `(now() - interval '5 minutes')::timestamptz`;

// ── D1. THE RACE, BOTH WAYS ROUND ───────────────────────────────────────────
// Two writers hold the same hydration and each tries to settle the same window.
// Whichever lands first, the other must be refused and the window must be paid
// exactly once. The interleaving is simulated by ordering (see the header's
// note on PGlite), which is what the loser of a real race experiences.
async function d1(db) {
  console.log('\nD1  a tick and a client collect settling the SAME window from the SAME version');
  /* Both arms here are `judgeBoth`: the defence is hr_apply's own version
     compare-and-set, taken after `select … for update` on player_state, and it
     holds for the fenced and the raw path alike. D2 is where the FENCE earns
     its keep — the case the version CAS cannot see. */

  // (a) the client lands first; the tick's in-flight settle must lose.
  const a = U(1); await makeChar(db, a); await own(db, a); await config(db, 'enabled = true, shadow = false');
  await clientApply(db, a, { ver: 1, key: KEY(101), toSql: TO });
  const midA = await stateOf(db, a);
  const tickA = await settle(db, a, { ver: 1, key: KEY(102), from: FROM, to: TO });
  const endA = await stateOf(db, a);
  judgeBoth('D1a', Number(endA.gold) === Number(midA.gold) && tickA.ok !== true,
    `the client paid 100 and the tick's stale settle was refused (${tickA.error}); gold stayed at ${endA.gold}`,
    `THE WINDOW WAS PAID TWICE: gold ${midA.gold} -> ${endA.gold} after a tick settle holding the `
    + `pre-client version (result ${JSON.stringify(tickA)})`);

  // (b) the tick lands first; the client's in-flight collect must lose.
  const b = U(2); await makeChar(db, b); await own(db, b); await config(db, 'enabled = true, shadow = false');
  const tickB = await settle(db, b, { ver: 1, key: KEY(103), from: FROM, to: TO });
  const midB = await stateOf(db, b);
  const cliB = await clientApply(db, b, { ver: 1, key: KEY(104), toSql: TO });
  const endB = await stateOf(db, b);
  judgeBoth('D1b', tickB.ok === true && Number(endB.gold) === Number(midB.gold) && cliB.ok !== true,
    `the tick paid 100 and the client's stale collect was refused (${cliB.error}); gold stayed at ${endB.gold}`,
    `the tick settle returned ${JSON.stringify(tickB)} and the client's stale collect then moved `
    + `gold ${midB.gold} -> ${endB.gold} (${JSON.stringify(cliB)})`);
}

// ── D2. THE REPLAY, WITH EVERY EXCUSE THE ATTACKER COULD WANT ───────────────
// A fresh version (the one hr_apply just stamped) and a fresh idempotency key,
// naming a window already settled. Neither of the two defences the lane
// believed in can refuse this — only the watermark compare-and-set can.
async function d2(db) {
  console.log('\nD2  a replayed window carrying a FRESH version and a FRESH idempotency key');
  const u = U(3); await makeChar(db, u); await own(db, u); await config(db, 'enabled = true, shadow = false');
  const first = await settle(db, u, { ver: 1, key: KEY(201), from: FROM, to: TO });
  const before = await stateOf(db, u);
  const replay = await settle(db, u,
    { ver: Number(before.version), key: KEY(202), from: FROM, to: TO });
  const after = await stateOf(db, u);
  judge('D2', first.ok === true && Number(after.gold) === Number(before.gold)
      && replay.error === 'window_already_settled',
    `refused \`window_already_settled\` by the watermark compare-and-set; gold stayed at ${after.gold} `
    + 'and the refusal cited neither the key nor the version',
    `first=${JSON.stringify(first)} replay=${JSON.stringify(replay)}; gold ${before.gold} -> `
    + `${after.gold}. A replayed window paid again — the watermark CAS is not holding.`);

  // ...and the boundary is INCLUSIVE of an honest deferral: a window starting
  // exactly AT the watermark is the shape settledWatermarkMs produces and must
  // be accepted, or the fence would refuse every correct second window.
  const next = await settle(db, u,
    { ver: Number(after.version), key: KEY(203),
      from: TO, to: `(now() - interval '1 minute')::timestamptz` });
  judge('D2b', MUTATE ? next.ok !== true : next.ok === true,
    'a window starting exactly AT the watermark is accepted — the CAS refuses overlaps, not '
    + 'deferrals (settledWatermarkMs stamps the next `from` at the previous watermark)',
    `the next honest window was refused (${JSON.stringify(next)}) — the CAS is off by one and the `
    + 'tick would stall after its first window');
}

// ── D3. THE KILL SWITCH ─────────────────────────────────────────────────────
// One UPDATE, no deploy, effective on the next call — the rollback path for the
// whole milestone.
async function d3(db) {
  console.log('\nD3  the kill switch');
  const u = U(4); await makeChar(db, u); await own(db, u);
  await config(db, 'enabled = false, shadow = false');
  const off = await settle(db, u, { ver: 1, key: KEY(301), from: FROM, to: TO });
  const s1 = await stateOf(db, u);
  judge('D3a', off.ok !== true && Number(s1.gold) === 0,
    `with hr_tick_config.enabled = false the settle was refused (${off.error}) and paid nothing`,
    `the tick paid ${s1.gold} gold while the kill switch was off (${JSON.stringify(off)})`);

  await config(db, 'enabled = true, shadow = false');
  const on = await settle(db, u, { ver: 1, key: KEY(302), from: FROM, to: TO });
  const s2 = await stateOf(db, u);
  judge('D3b', MUTATE ? false : (on.ok === true && Number(s2.gold) === 100),
    'flipping `enabled` back on resumes settling with no deploy and no schema change',
    MUTATE ? 'raw hr_apply never consulted the kill switch at all — it pays whatever the switch says'
      : `the tick did not resume after the switch was turned on (${JSON.stringify(on)}, gold=${s2.gold})`);

  await config(db, 'enabled = false');
  const again = await settle(db, u, { ver: Number(s2.version), key: KEY(303),
    from: TO, to: `(now() - interval '1 minute')::timestamptz` });
  const s3 = await stateOf(db, u);
  judge('D3c', again.ok !== true && Number(s3.gold) === Number(s2.gold),
    'flipping it off again stops an ARMED tick dead, mid-flight',
    `the tick kept paying after the switch was flipped off (gold ${s2.gold} -> ${s3.gold}, `
    + `${JSON.stringify(again)})`);
}

// ── D4. SHADOW PAYS NOTHING ─────────────────────────────────────────────────
// The 48 h production parity window: compute, journal what WOULD have been
// paid, move no player value at all.
async function d4(db) {
  console.log('\nD4  SHADOW mode writes a journal row and pays nothing');
  const u = U(5); await makeChar(db, u); await own(db, u);
  await config(db, 'enabled = true, shadow = true');
  const before = await stateOf(db, u);
  const r = await settle(db, u, { ver: 1, key: KEY(401), from: FROM, to: TO });
  const after = await stateOf(db, u);
  const rows = await shadowRows(db, u);

  const unmoved = Number(after.gold) === Number(before.gold)
    && Number(after.version) === Number(before.version)
    && after.accrued_to.toISOString() === before.accrued_to.toISOString();
  judge('D4a', unmoved && r.ok === true && r.mode === 'shadow' && r.paid === false,
    `gold, version and accrued_to are all exactly where they were (gold=${after.gold}, `
    + `version=${after.version}) and the call reported mode=shadow paid=false`,
    `SHADOW MODE MOVED PLAYER STATE: gold ${before.gold} -> ${after.gold}, version `
    + `${before.version} -> ${after.version}, accrued_to ${before.accrued_to.toISOString()} -> `
    + `${after.accrued_to.toISOString()} (${JSON.stringify(r)})`);
  judge('D4b', rows === 1,
    'exactly one hr_tick_shadow row was written — the parity measurement exists',
    `hr_tick_shadow holds ${rows} row(s) for this character; a shadow run that journals nothing `
    + 'measures nothing, and one that journals twice reports a parity number that is a lie');

  // Replay-safe: the same intent twice is still one row, or the 48 h parity
  // number double-counts silently.
  await settle(db, u, { ver: 1, key: KEY(401), from: FROM, to: TO });
  const rows2 = await shadowRows(db, u);
  judge('D4c', rows2 === 1,
    'a replayed shadow settle is deduped on (user, slot, intent_id) — the parity number cannot '
    + 'double-count',
    `a replayed shadow settle took hr_tick_shadow from ${rows} to ${rows2} rows`);

  // And nothing it wrote is payable: the shadow table is not read by anything
  // that decides a number, and the character is still where it started.
  const end = await stateOf(db, u);
  judge('D4d', Number(end.gold) === 0,
    'after two shadow settles the character still holds 0 gold — shadow is not a slow faucet',
    `the character holds ${end.gold} gold after two SHADOW settles`);
}

// ── D5. THE BATCH CAP AND THE CURSOR ────────────────────────────────────────
// A roster larger than one tick's batch must be WALKED, not re-served: without
// the keyset cursor the same head is handed out every fire and the tail of the
// roster starves.
async function d5(db) {
  console.log('\nD5  the per-tick batch cap and the keyset cursor walk the whole roster');
  const users = [];
  for (let i = 0; i < 5; i++) {
    const u = U(10 + i);
    users.push(u);
    await makeChar(db, u, { accruedMinutesAgo: 30 - i });   // distinct accrued_to ordering
    await own(db, u, { holder: 'cursor-proof', leaseMinutes: 0 });
  }
  await db.exec(`update public.hr_tick_ownership set lease_holder = null, lease_until = null
                  where user_id in (${users.map((u) => `'${u}'`).join(',')});`);

  const seen = [];
  let cursorAt = null; let cursorUser = null; let cursorSlot = null;
  for (let pass = 0; pass < 4; pass++) {
    const args = cursorAt
      ? `array['gather'], 0, 2, 'cursor-proof', 0, '${cursorAt}'::timestamptz, '${cursorUser}'::uuid, ${cursorSlot}`
      : "array['gather'], 0, 2, 'cursor-proof', 0, null, null, null";
    const r = await db.query(`select user_id, slot, accrued_to
                                from public.hr_tick_roster(${args})
                               order by accrued_to, user_id, slot`);
    if (!r.rows.length) break;
    for (const row of r.rows) seen.push(String(row.user_id));
    const last = r.rows[r.rows.length - 1];
    cursorAt = last.accrued_to.toISOString(); cursorUser = String(last.user_id);
    cursorSlot = Number(last.slot);
    // The lease is released between passes so the ONLY thing preventing a
    // re-serve is the cursor. Without it this loop returns the same two rows
    // four times.
    await db.exec(`update public.hr_tick_ownership set lease_holder = null, lease_until = null
                    where user_id in (${users.map((u) => `'${u}'`).join(',')});`);
  }
  const unique = new Set(seen);
  const ok = unique.size === 5 && seen.length === 5;
  judge('D5', ok,
    `three passes of a 2-row batch walked all 5 rostered characters exactly once (${seen.length} rows, `
    + `${unique.size} distinct)`,
    `the cursor did not walk the roster: ${seen.length} row(s) over ${unique.size} distinct `
    + 'character(s). Without a keyset the same head is served every fire and the tail starves.');
}

// ── D6. THE LEASE IS THE ANSWER TO "WHOSE WORLD TICKS" ──────────────────────
async function d6(db) {
  console.log('\nD6  a settle for a character this holder was never handed');
  await config(db, 'enabled = true, shadow = false');
  /* A FRESH character per sub-arm. Under --mutate the raw path actually pays,
     so a shared character would fail the next sub-arm on `version_conflict` —
     red for the wrong reason, which is a mutation proof that proves nothing. */
  const u = U(6); await makeChar(db, u); await own(db, u, { holder: 'process-A' });
  const foreign = await settle(db, u, { holder: 'process-B', ver: 1, key: KEY(501), from: FROM, to: TO });
  const s1 = await stateOf(db, u);
  judge('D6a', foreign.ok !== true && Number(s1.gold) === 0,
    `a settle in a holder name the lease does not carry was refused (${foreign.error})`,
    `process-B settled a character leased to process-A (gold=${s1.gold}, ${JSON.stringify(foreign)})`);

  const u2 = U(7); await makeChar(db, u2); await own(db, u2, { holder: 'process-A' });
  await db.exec(`update public.hr_tick_ownership set lease_until = now() - interval '1 second'
                  where user_id = '${u2}';`);
  const expired = await settle(db, u2, { holder: 'process-A', ver: 1, key: KEY(502), from: FROM, to: TO });
  const s2 = await stateOf(db, u2);
  judge('D6b', expired.ok !== true && Number(s2.gold) === 0,
    `an expired lease was refused (${expired.error}) — a dead tick process cannot settle on wake-up`,
    `an expired lease still settled (gold=${s2.gold}, ${JSON.stringify(expired)})`);

  const u3 = U(8); await makeChar(db, u3); await own(db, u3, { holder: 'process-A', owned: false });
  const unowned = await settle(db, u3, { holder: 'process-A', ver: 1, key: KEY(503), from: FROM, to: TO });
  const s3 = await stateOf(db, u3);
  judge('D6c', unowned.ok !== true && Number(s3.gold) === 0,
    `a character flagged NOT OWNED was refused (${unowned.error}) — the rollout switch is real`,
    `an unowned character was settled (gold=${s3.gold}, ${JSON.stringify(unowned)})`);
}

// ── main ────────────────────────────────────────────────────────────────────
console.log(`world-tick-double-pay${MUTATE ? ' --mutate (fence bypassed: every arm must go RED)' : ''}`);

const { db, failures } = await bootReplay({});
if (failures.length) {
  console.error('the schema replay did not complete:', failures);
  process.exit(2);
}
try {
  ACT = (await db.query("select activity_id from public.hr_activities where kind = 'gather' limit 1"))
    .rows[0]?.activity_id;
  if (!ACT) {
    console.error('no gather activity in hr_activities — nothing to point a probe character at');
    process.exit(2);
  }
  await d1(db);
  await d2(db);
  await d3(db);
  await d4(db);
  if (!MUTATE) await d5(db);   // the roster is not on the mutated path
  await d6(db);
} finally {
  await db.close();
}

console.log('');
if (problems.length) {
  console.log(`world-tick-double-pay: ${problems.length} failure(s)`);
  process.exitCode = 1;
} else {
  console.log(MUTATE
    ? 'world-tick-double-pay --mutate: green — every arm went red with the fence bypassed, so every '
      + 'arm is measuring hr_tick_settle and not something hr_apply already did.'
    : 'world-tick-double-pay: green — one window is paid once, the kill switch stops it, SHADOW '
      + 'pays nothing, and the lease decides whose world ticks.');
}
