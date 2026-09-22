#!/usr/bin/env node
// ============================================================================
// tests/world-tick-edge-contract.mjs — THE op:'tick' ENTRY AGAINST A REAL
// POSTGRES, NOT AGAINST A STUB.
//
// Security, OP:TICK REVIEW 2026-09-21 (docs/planning/SEC_WORLD_TICK_M1_2026-09-21.md).
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// `tests/edge-tick-gate.mjs` is a good guard and it was GREEN through both of
// the P0s below. It drives `runTick` through a hand-written `exec` stub, and
// that stub answered `select now()` with an ISO **string** and `hr_state_of`
// with `now: <string>`. The real driver — `postgres` in the edge, PGlite here,
// both of them — parses OID 1184 into a JS **Date**. The entry then did
// `String(<Date>)` and handed the result BACK to Postgres as a `$::timestamptz`
// bind parameter, which is a spelling Postgres refuses (22P02), so
// `probeWatermark` — the FIRST engine statement of every character of every
// fire — threw, `runTick` counted a refusal per character, the fire returned
// HTTP 200 with `processed:0`, and the 48 h shadow parity run would have
// journalled ZERO rows with every dashboard green.
//
// The stub was more forgiving than the transport, so the guard could not see
// it. That is the lesson `supabase/functions/hr-accrue/cors.js` is already
// written around: **a check that does not use the transport the caller uses is
// checking a different system.** So this file uses the transport. (T-3 taught
// the stub to return Dates and to refuse an unparseable bound — `edge-tick-gate`
// arm `T-T1`, mutation `M7` — but a stub that models the driver is not a
// substitute for a guard that uses one, which is why this file stands.)
//
// The same class covers the SEED LABEL. The accrue path labels a window
// `'accrue:' + String(st.accrued_to)` where `st` is the `hr_state_of` JSONB
// envelope (index.ts:699, :785) — Postgres's JSON rendering of a timestamptz,
// microseconds and `+00:00` included. The tick used to label it
// `'accrue:' + new Date(ms).toISOString()` and the roster used a
// `to_char(... 'MS"Z"')` template: three spellings of one instant, and the
// only two that agreed were the two that had never paid a player. `hr_seed`
// hashes the LABEL, so a different spelling is a different stream — which is
// the one thing the 48 h shadow parity run must not have. Both now let
// POSTGRES render the label (`tick.js` SEED_LABEL_EXPR, roster
// `to_jsonb(l.mark) #>> '{}'`), so the spelling cannot drift from `hr_state_of`
// again without this file going red.
//
// ── HOW THE ARMS ARE BUILT ─────────────────────────────────────────────────
// The arms that carry the verdict DRIVE the shipped thing rather than restating
// it: EC-2a calls `runTick` — the function index.ts calls — through a real
// connection and lets it do its own round trips; EC-3a executes tick.js's own
// exported `SEED_LABEL_EXPR`; EC-3b calls `hr_tick_roster` itself and reads the
// `seed` column the driver ships. An arm that quoted the source back at itself
// would go green the moment somebody edited the quote, which is the failure
// mode this whole review is about, and it is why EC-2a drives the ENTRY rather
// than `probeWatermark`: the value Postgres refused was computed inside
// `tickOne`, which is not exported, so nothing smaller than the entry can see
// it. (EC-1a/b/c are the unit statement of the same fact — what the driver
// returns, what the entry's spelling does with it, what the old spelling still
// does — and EC-1b does restate one expression. It is the localiser, not the
// verdict: EC-2a is the arm that goes red when tickOne changes.)
//
// The arms marked (control) are the negatives: they pin the OLD spellings as
// still wrong, so a revert is still caught.
//
// MUTATION PROOF (run by hand 2026-09-22, each revert applied to the real
// source): tick.js `String(read0[0].now)` -> EC-2a red; tick.js
// `SEED_LABEL_EXPR` back to the `to_char`/`toISOString` spelling -> EC-3a and
// EC-3c red; the roster's `seed` column back to `to_char` -> EC-3b red.
// `tick.js:438`'s `String(row.now)` is the one change with no arm behind it and
// that is not an oversight: JS parses what Postgres refuses, so there is no
// observable defect to catch there — Security says as much in T-1. It is fixed
// because the next reader should not have to rediscover why one of two
// identical-looking expressions was safe.
//
// Run: node tests/world-tick-edge-contract.mjs
// ============================================================================

import { bootReplay } from './schema-replay.mjs';
import { runTick, SEED_LABEL_EXPR } from '../supabase/functions/hr-accrue/tick.js';

const problems = [];
function judge(id, pass, good, bad) {
  if (pass) console.log(`  ✓ ${id} — ${good}`);
  else { console.log(`  ✗ ${id} — ${bad}`); problems.push(id); }
}
const group = (t) => console.log(`\n${t}`);

const U = (n) => `00000000-0000-4000-8000-0000000e${String(n).padStart(4, '0')}`;
const KEY0 = '00000000-0000-0000-0000-000000000000';

console.log('world-tick-edge-contract: the op:\'tick\' entry against the transport it deploys on');

const { db, failures } = await bootReplay({});
if (failures.length) {
  console.error('the schema replay did not complete:', failures);
  process.exit(2);
}

let ACT;
try {
  ACT = (await db.query("select activity_id from public.hr_activities where kind = 'gather' limit 1"))
    .rows[0]?.activity_id;
  if (!ACT) { console.error('no gather activity — nothing to point a probe character at'); process.exit(2); }

  // ── EC-1 ── THE DRIVER CONTRACT ─────────────────────────────────────────
  // tick.js tickOne:
  //     const read0 = await exec('select now()::timestamptz as now', []);
  //     const nowIso = String(read0[0].now);
  // and `nowIso` is then bound as `$7::timestamptz` AND written into
  // `delta.accrued_to`, which the fence compares with `= p_window_to`.
  group('EC-1  `select now()` -> the entry\'s spelling -> back to Postgres');
  {
    const v = (await db.query('select now()::timestamptz as now')).rows[0].now;
    judge('EC-1a', v instanceof Date,
      'the driver parses timestamptz into a JS Date, as `postgres` does in the edge '
      + `(got ${Object.prototype.toString.call(v)})`,
      `the driver did NOT return a Date (${Object.prototype.toString.call(v)}) — re-read this file`);

    // tick.js tickOne step (1), verbatim: `new Date(read0[0].now).toISOString()`.
    // This is the value bound as p_window_to AND written into delta.accrued_to.
    const asTheEntryBindsIt = new Date(v).toISOString();
    let accepted = false; let why = '';
    try {
      await db.query('select $1::timestamptz as t', [asTheEntryBindsIt]);
      accepted = true;
    } catch (e) { why = String(e.message).slice(0, 90); }
    judge('EC-1b', accepted,
      `the spelling tickOne binds round-trips as a timestamptz (${asTheEntryBindsIt})`,
      `the spelling tickOne binds is NOT a timestamptz Postgres accepts — it is bound as `
      + `p_window_to and as delta.accrued_to.\n           value : ${asTheEntryBindsIt}`
      + `\n           error : ${why}`);

    /* THE NEGATIVE. `String(<Date>)` is what tickOne bound before T-1 was
       fixed, and it is what a future edit reaches for first. It must stay
       refused, or this arm has stopped saying anything. */
    let stringAccepted = false; let stringWhy = '';
    try { await db.query('select $1::timestamptz as t', [String(v)]); stringAccepted = true; }
    catch (e) { stringWhy = String(e.message).slice(0, 60); }
    judge('EC-1c (control)', !stringAccepted,
      `\`String(now)\` is still refused (${stringWhy}) — the defect was the spelling, and an `
      + 'entry that reaches for it again is still caught here',
      `\`String(now)\` was ACCEPTED (${String(v)}). Either this engine is not Postgres or this `
      + 'arm has stopped being a control — read it before trusting EC-1b');
  }

  // ── EC-2 ── THE SAME THING THROUGH THE REAL FENCE ───────────────────────
  // probeWatermark is how the entry learns every character's watermark. It is
  // called once per character per fire and it is the FIRST engine statement of
  // the fire, so if it throws, the fire settles nothing at all.
  group('EC-2  the shipped runTick against the real hr_tick_settle');
  {
    const u = U(1);
    await db.exec(`insert into auth.users (id) values ('${u}') on conflict do nothing;`);
    await db.exec(`
      insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                       active_kind, active_id, active_since)
      values ('${u}', 0, 0, 0, 10, 10, 1, now() - interval '10 minutes',
              'gather', '${ACT}', now() - interval '2 hours')
      on conflict (user_id, slot) do update set version = 1, gold = 0,
        accrued_to = now() - interval '10 minutes', active_kind = 'gather', active_id = '${ACT}';`);
    await db.exec(`delete from public.hr_tick_ownership where user_id = '${u}';`);
    await db.exec(`
      insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
      values ('${u}', 0, 'gather', true, 'proofs', now() + interval '5 minutes');`);
    await db.exec('update public.hr_tick_config set enabled = true, shadow = true where id;');

    const probe = async (nowSpelling) => {
      await db.exec('begin'); await db.exec('set local role hr_engine');
      let out;
      try {
        out = (await db.query(
          `select public.hr_tick_settle('proofs', $1::uuid, 0, 'gather', null::bigint,
             '1970-01-01T00:00:00.000Z'::timestamptz, $2::timestamptz, $3::uuid,
             jsonb_build_object('accrued_to', $2::text)) as r`,
          [u, nowSpelling, KEY0])).rows[0].r;
      } catch (e) { out = { RAISED: String(e.message).slice(0, 90) }; }
      await db.exec('commit');
      return out;
    };

    /* THE SHIPPED ENTRY, ON A REAL CONNECTION. Not `probeWatermark` lifted out
       of it and not a re-implementation of `tickOne`: `runTick` — the function
       index.ts calls — handed the same one-statement `exec` seam index.ts gives
       it, doing its own round trips against this database. That is the only
       shape in which T-1 is visible, because the value Postgres refused was
       computed INSIDE tickOne, which is not exported and never will be.

       A second character, because EC-2c below asserts that the watermark probe
       wrote NOTHING and a real fire settles a real shadow row. */
    const u2 = U(2);
    const holder = (await db.query(
      "select left('cron:' || coalesce(current_database(), 'db'), 64) as h")).rows[0].h;
    await db.exec(`insert into auth.users (id) values ('${u2}') on conflict do nothing;`);
    await db.exec(`
      insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                       active_kind, active_id, active_since)
      values ('${u2}', 0, 0, 0, 10, 10, 1, now() - interval '10 minutes',
              'gather', '${ACT}', now() - interval '2 hours')
      on conflict (user_id, slot) do update set version = 1, gold = 0,
        accrued_to = now() - interval '10 minutes', active_kind = 'gather', active_id = '${ACT}';`);
    await db.exec(`delete from public.hr_tick_ownership where user_id = '${u2}';`);
    await db.exec(`
      insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
      values ('${u2}', 0, 'gather', true, '${holder}', now() + interval '5 minutes');`);

    const execSeam = async (text, params) => {
      await db.exec('begin'); await db.exec('set local role hr_engine');
      try { return (await db.query(text, params)).rows; }
      finally { await db.exec('commit'); }
    };

    let fire; let raised = '';
    try {
      fire = (await runTick({
        exec: execSeam,
        body: { op: 'tick', roster: [{ user_id: u2, slot: 0 }],
          cadence_ms: 10000, flush_ms: 90000 },
      })).body;
    } catch (e) { raised = String(e.message).slice(0, 120); }
    /* `error:<pg message>` is the reason runTick records when a statement
       THREW — which is what every character of every fire recorded while the
       entry bound `String(<Date>)`. A fire that names one has not run. */
    const reasons = Object.keys((fire && fire.reasons) || {});
    const threw = reasons.filter((r) => r.startsWith('error:'));
    judge('EC-2a', !raised && fire && fire.ok === true && threw.length === 0
        && (fire.shadowed + fire.processed + fire.skipped) === 1,
      'tick.js runTick drove its own round trips against the real hr_tick_settle and came back '
      + 'with a verdict per character: '
      + JSON.stringify(fire && { processed: fire.processed, shadowed: fire.shadowed,
        skipped: fire.skipped, refused: fire.refused, reasons: fire.reasons }),
      raised
        ? `the fire THREW: ${raised}`
        : 'the entry bound a value the database refused, so the statement threw. runTick catches '
          + 'it per character and counts `refused: error:…`, which means EVERY character of EVERY '
          + 'fire is refused and the 48 h shadow parity run journals ZERO rows while the fire '
          + `still answers HTTP 200.\n           ${JSON.stringify(fire)}`);

    const v = (await db.query('select now()::timestamptz as now')).rows[0].now;
    const asIso = await probe(new Date(v).toISOString());
    judge('EC-2b (control)', asIso.error === 'window_already_settled',
      `the ISO spelling reaches the fence and is answered \`${asIso.error}\` carrying `
      + `accrued_to=${asIso.accrued_to} — the probe design is sound; only the spelling is not`,
      `the ISO spelling was answered ${JSON.stringify(asIso)} rather than window_already_settled`);

    // The probe is WRITE-CAPABLE (hr_tick_settle is the money door) and is used
    // as a read. Nothing structural stops it at step (8)/(9) — what stops it is
    // that `p_version` is null and step (7) refuses a null version. That is
    // load-bearing and nothing asserts it, so assert it.
    const after = (await db.query(
      `select gold, version, accrued_to from public.player_state where user_id = '${u}'`)).rows[0];
    const shadowRows = Number((await db.query(
      `select count(*) as n from public.hr_tick_shadow where user_id = '${u}'`)).rows[0].n);
    judge('EC-2c (control)', Number(after.gold) === 0 && Number(after.version) === 1 && shadowRows === 0,
      'the watermark probe wrote nothing — gold, version and accrued_to are unmoved and no shadow '
      + 'row was journalled (it is step (7)\'s null-version refusal that stops it, which is why '
      + 'this arm should stand)',
      `THE PROBE WROTE: gold=${after.gold} version=${after.version} shadow_rows=${shadowRows}`);
  }

  // ── EC-3 ── THE SEED LABEL: ONE INSTANT, ONE STREAM ─────────────────────
  // hr_seed hashes the LABEL. Three places name a window and all three must
  // spell the instant identically or the tick draws a different stream than the
  // accrue path would have, and the 48 h parity number measures the PRNG.
  // The accrue path is the incumbent — 200 days of live seeds — and does not
  // move; the other two derive from it.
  group('EC-3  the per-window seed label: accrue path vs tick vs roster');
  {
    const u = U(1);

    /* THE ACCRUE PATH'S LABEL, FROM THE ENVELOPE IT ACTUALLY READS.
       index.ts:785 is `'accrue:' + String(st.accrued_to)` where `st` is
       `hr_state_of(...)->'state'` — so this is not a restatement of the
       spelling, it IS the spelling, read out of the same projection. */
    const env = (await db.query(
      'select public.hr_state_of($1::uuid, $2::int) as state', [u, 0])).rows[0].state;
    const st = env.state || {};
    const accrueLabel = 'accrue:' + String(st.accrued_to);

    /* THE TICK'S LABEL, FROM tick.js's OWN EXPRESSION. `SEED_LABEL_EXPR` is the
       literal seedLadder() hands Postgres; the instant it is given is the one
       probeWatermark carried out of the fence (`markText`), which is what
       planSeedLabels puts at the head of the ladder. Nothing here re-spells
       anything — the server renders the label, in both paths. */
    const mark = (await db.query(
      `select to_jsonb(accrued_to) #>> '{}' as t from public.player_state
        where user_id = $1::uuid and slot = 0`, [u])).rows[0].t;
    const tickLabel = (await db.query(
      `select ${SEED_LABEL_EXPR} as label from (select $1::text as ts) l`, [mark])).rows[0].label;

    judge('EC-3a', tickLabel === accrueLabel,
      `the tick labels a window exactly as the accrue path labels it (${tickLabel})`,
      'the tick and the accrue path label the SAME instant differently, so hr_seed returns a '
      + 'DIFFERENT STREAM for the same window and the 48 h parity number measures the PRNG, not '
      + `the tick.\n           accrue path : ${accrueLabel}\n           tick        : ${tickLabel}`);

    /* THE ROSTER'S LABEL, FROM hr_tick_roster ITSELF. The function is called,
       not quoted: its `seed` column is the number the driver ships, and it must
       be hr_seed over the accrue path's label for the same character. */
    await db.exec(`update public.hr_tick_ownership set lease_until = now() - interval '1 minute'
                    where user_id = '${u}';`);
    const rosterSeed = (await db.query(
      `select r.seed from public.hr_tick_roster(array['gather']::text[], 0, 200, 'proofs', 30000,
                 null::timestamptz, null::uuid, null::int) r
        where r.user_id = $1::uuid and r.slot = 0`, [u])).rows[0]?.seed;
    const accrueSeed = (await db.query(
      'select public.hr_seed($1::uuid, 0, $2) as s', [u, accrueLabel])).rows[0].s;
    judge('EC-3b', rosterSeed !== undefined && String(rosterSeed) === String(accrueSeed),
      'hr_tick_roster\'s `seed` column is hr_seed over the accrue path\'s label — the driver '
      + `ships the stream an accrue would have drawn (${rosterSeed})`,
      '2026-09-20-world-tick-roster.sql derives the label "EXACTLY as hr-accrue/index.ts derives '
      + `it". It does not.\n           roster seed : ${rosterSeed}`
      + `\n           accrue seed : ${accrueSeed}  (label ${accrueLabel})`);

    const seeds = (await db.query(
      'select public.hr_seed($1::uuid, 0, $2) as a, public.hr_seed($1::uuid, 0, $3) as b',
      [u, accrueLabel, tickLabel])).rows[0];
    judge('EC-3c', String(seeds.a) === String(seeds.b),
      'the accrue label and the tick label hash to the same seed, so one window is one stream',
      `the two spellings draw DIFFERENT streams (hr_seed ${seeds.a} vs ${seeds.b}) — every RNG `
      + 'outcome in the shadow journal (drops, rare drops, crits) diverges from what accrual paid '
      + 'BY CONSTRUCTION, which is the measurement milestone 1 exists to take');

    /* THE NEGATIVE. Both defects were a spelling, and a spelling is exactly
       what a later edit restores without noticing. These are the two that were
       shipped — `new Date(ms).toISOString()` in planSeedLabels and the roster's
       `to_char(... 'MS"Z"')` — and they must both still be WRONG, or the three
       arms above have stopped distinguishing anything. */
    const r = (await db.query(`
      select to_jsonb(ts) #>> '{}'                                            as accrue_spelling,
             to_char(ts at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')   as roster_to_char,
             ts                                                               as raw
        from (select '2026-09-21 17:55:55.739123+00'::timestamptz as ts) q`)).rows[0];
    const oldTick = 'accrue:' + new Date(r.raw).toISOString();
    const oldRoster = 'accrue:' + r.roster_to_char;
    const nowCorrect = 'accrue:' + r.accrue_spelling;
    judge('EC-3d (control)', oldTick !== nowCorrect && oldRoster !== nowCorrect
        && nowCorrect.endsWith('+00:00') && oldTick.endsWith('Z'),
      'the two PREVIOUS spellings are still wrong for the same instant — `+00:00` vs `Z`, '
      + `microseconds vs milliseconds (${nowCorrect} vs ${oldTick}) — so a revert in either `
      + 'tick.js or the roster is still caught by EC-3a/EC-3b',
      'a previous spelling now AGREES with the accrue path, so EC-3a/EC-3b can no longer tell '
      + `the fix from the defect.\n           accrue : ${nowCorrect}\n           old tick   : `
      + `${oldTick}\n           old roster : ${oldRoster}`);
  }
} finally {
  await db.close();
}

console.log('');
if (problems.length) {
  console.log(`world-tick-edge-contract: ${problems.length} failure(s) — ${problems.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('world-tick-edge-contract: green — the entry speaks the transport it deploys on, and '
    + 'one instant has one seed label.');
}
