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
// ── EC-4, THE COMBAT DRIVER (Security S-8, added 2026-09-23) ────────────────
// Nothing in the edge settled combat until this build: `tick.js` imported one
// `CHANNEL` — gather's — and used it as the probe's `p_channel`, as the kind a
// pointer had to equal, and as the settle's `p_channel`. `settleCombatSession`
// had no production caller and `services/world-tick/combat.js` was not in the
// payload. EC-4a drives the shipped `runTick` over a level-61 fighter and
// requires a real `hr_tick_shadow` row with `would_kills`/`would_xp` > 0;
// EC-4b requires gather to still settle through the same dispatch; EC-4c pins
// the old spelling as still refused; EC-4d reads
// `hr_tick_config_channels_ck` out of the catalogue and requires every channel
// it admits to be DRIVEN or DECLARED-UNDRIVEN, so the roster can never lease
// what the edge cannot settle; EC-4e requires the SECOND window — the one
// whose shadow mark has displaced from `player_state.accrued_to` — to settle
// too, which is the arm that needs `mark_text`.
//
// MUTATION PROOF for EC-4, run 2026-09-23 with each revert applied to the real
// source and then restored (exit codes observed, not expected):
//   · tick.js dispatch -> today's shape (`CHANNELS[GATHER_CHANNEL]`, pointer
//     must equal gather): exit 1, EC-4a RED with
//     `reasons {"channel_moved":1}` and NO shadow row — S-8's own signature.
//     EC-4b/c/d stayed green, so the arm is specific.
//   · tick.js session build -> `mark_text` line deleted: exit 1, EC-4e RED
//     with `error:rosterWatermarkText: no server rendering of the watermark`
//     and 1 -> 1 shadow rows, while EC-4a stayed GREEN. The two arms isolate
//     different defects: the first window settles without `mark_text` and
//     every window after it throws.
//
// MUTATION PROOF (run by hand 2026-09-22, each revert applied to the real
// source): tick.js `String(read0[0].now)` -> EC-2a red; tick.js
// `SEED_LABEL_EXPR` back to the `to_char`/`toISOString` spelling -> EC-3a and
// EC-3c red; the roster's `seed` column back to `to_char` -> EC-3b red.
// EC-3d's proof is no longer by hand: `--selftest` plants four defects in the
// control's own verdict (a converged tick spelling, a converged roster
// spelling, a label hash that canonicalises its input, an accrue rendering that
// is no longer Postgres's) and two negative controls that must stay silent, one
// of them the off-UTC session that made this arm red on 2026-09-22 (below).
// `tick.js:438`'s `String(row.now)` is the one change with no arm behind it and
// that is not an oversight: JS parses what Postgres refuses, so there is no
// observable defect to catch there — Security says as much in T-1. It is fixed
// because the next reader should not have to rediscover why one of two
// identical-looking expressions was safe.
//
// 2026-09-22, EC-3d: the control was red on every machine whose clock is not
// UTC and green on GitHub, because it asserted the literal `+00:00` — a
// property of the replay's session TimeZone (PGlite takes that GUC from the
// host offset at initdb), not of the spellings it was built to separate. The
// claims it meant are now stated zone-independently and in the SEED as well as
// the string. Note for whoever reads this next: the replay's session zone is
// still the host's, so any guard that pins a rendered timestamptz literal is
// machine-dependent by construction.
//
// Run: node tests/world-tick-edge-contract.mjs
//      node tests/world-tick-edge-contract.mjs --selftest   (EC-3d's control, mutated)
// ============================================================================

import { bootReplay } from './schema-replay.mjs';
import {
  runTick, SEED_LABEL_EXPR, CHANNELS, UNDRIVEN_CHANNELS,
} from '../supabase/functions/hr-accrue/tick.js';

const problems = [];
function judge(id, pass, good, bad) {
  if (pass) console.log(`  ✓ ${id} — ${good}`);
  else { console.log(`  ✗ ${id} — ${bad}`); problems.push(id); }
}
const group = (t) => console.log(`\n${t}`);

const U = (n) => `00000000-0000-4000-8000-0000000e${String(n).padStart(4, '0')}`;
const KEY0 = '00000000-0000-0000-0000-000000000000';

// ── EC-3d's VERDICT, AS A FUNCTION, BECAUSE THE CONTROL ITSELF WAS WRONG ────
// EC-3d shipped as ONE boolean over four propositions, and the last two of them
// were not claims about the SPELLINGS at all but about the machine the guard
// ran on: `nowCorrect.endsWith('+00:00') && oldTick.endsWith('Z')`.
// `to_jsonb(ts) #>> '{}'` renders a timestamptz in the SESSION's TimeZone, and
// PGlite takes that GUC from the host's UTC offset at initdb — TZ=America/
// Chicago gives `Etc/GMT+6` and the fixture renders `...11:55:55.739123-06:00`.
// So the arm was red on every developer machine off UTC (a fresh replay on
// Tyler's PC; a cached snapshot hides it until the cache is rebuilt) while
// printing "a previous spelling now AGREES with the accrue path" over two
// strings that plainly differ, and green on GitHub, whose runners are UTC. A
// control that reports a collision which did not happen teaches the next reader
// to distrust the arm instead of the tree, which is how a real revert gets
// waved through.
//
// What EC-3d MEANS does not depend on the session's zone, and is now said that
// way: for one instant, each shipped spelling must render a DIFFERENT STRING
// and hash to a DIFFERENT SEED than the accrue path's rendering, and the two
// renderings must still differ in the documented way — Postgres's JSON
// rendering carries microseconds and a numeric offset in whatever zone the
// session holds, while `new Date(ms).toISOString()` (planSeedLabels) and the
// roster's `to_char(... 'MS"Z"')` carry milliseconds and a literal `Z`.
//
// The SEED claims are the ones the brief asks for and they are not a restating
// of the string claims: `seedOf` is the real `hr_seed` in the arm below, so a
// label hash that canonicalised its input — parsed the timestamp, or trimmed
// the offset — would be caught here even though the three strings still differ.
// Two spellings drawing one stream is the only shape in which the defect EC-3a
// guards could survive EC-3a.
const MICROS_AND_OFFSET = /T\d{2}:\d{2}:\d{2}\.\d{4,6}[+-]\d{2}:\d{2}$/;
const MILLIS_AND_Z = /T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** @returns {Promise<{pass:boolean, failed:string[], seeds:object}>} */
async function ec3dClaims({ accrueLabel, oldTick, oldRoster, seedOf }) {
  const failed = [];
  const claim = (key, ok) => { if (!ok) failed.push(key); };
  claim('tick_spelling_still_differs', oldTick !== accrueLabel);
  claim('roster_spelling_still_differs', oldRoster !== accrueLabel);
  // The fixture instant carries six significant fractional digits, so Postgres
  // renders six; {4,6} only tolerates a trailing zero being trimmed, and still
  // cannot be satisfied by the three-digit JS rendering.
  claim('accrue_rendering_is_postgres_json', MICROS_AND_OFFSET.test(accrueLabel));
  claim('old_renderings_are_js_millis_z',
    MILLIS_AND_Z.test(oldTick) && MILLIS_AND_Z.test(oldRoster));
  const a = String(await seedOf(accrueLabel));
  const t = String(await seedOf(oldTick));
  const r = String(await seedOf(oldRoster));
  claim('tick_seed_still_differs', t !== a);
  claim('roster_seed_still_differs', r !== a);
  return { pass: failed.length === 0, failed, seeds: { accrue: a, tick: t, roster: r } };
}

// ── THE MUTATION PROOF FOR THAT CONTROL ────────────────────────────────────
// A control is the one arm whose job is to be able to go red for the right
// reason, and this one went red for the wrong one for a day. So it now carries
// its own proof, and the proof runs without a database: the verdict is a pure
// function of three renderings and a label hash, which is exactly what can be
// mutated. The REAL renderings come from Postgres in the arm below — the plain
// run is the floor (guard-hygiene R3), and both halves are registered.
const SELFTEST_CASES = {
  utc_session_rendering: {
    what: 'THE FIRST NEGATIVE CONTROL. A UTC session: the tight case, and the one CI measures',
    expect: null,
    inputs: {
      accrueLabel: 'accrue:2026-09-21T17:55:55.739123+00:00',
      oldTick: 'accrue:2026-09-21T17:55:55.739Z',
      oldRoster: 'accrue:2026-09-21T17:55:55.739Z',
    },
  },
  off_utc_session_rendering: {
    what: 'THE SECOND NEGATIVE CONTROL, AND THE DEFECT THIS LANE FIXED. The same instant '
        + 'rendered by a session in America/Chicago. Nothing about the spellings changed, so '
        + 'the control must stay silent — it did not, before ec3dClaims',
    expect: null,
    inputs: {
      accrueLabel: 'accrue:2026-09-21T11:55:55.739123-06:00',
      oldTick: 'accrue:2026-09-21T17:55:55.739Z',
      oldRoster: 'accrue:2026-09-21T17:55:55.739Z',
    },
  },
  tick_spelling_came_back: {
    what: 'planSeedLabels re-spells the first window with `new Date(ms).toISOString()` and the '
        + 'projection renders the same — the T-2 revert, and the reason EC-3d exists',
    expect: 'tick_spelling_still_differs',
    inputs: {
      accrueLabel: 'accrue:2026-09-21T17:55:55.739Z',
      oldTick: 'accrue:2026-09-21T17:55:55.739Z',
      oldRoster: 'accrue:2026-09-21T17:55:55.739Z',
    },
  },
  roster_to_char_came_back: {
    what: 'the roster\'s `to_char(... \'MS"Z"\')` column agrees with the accrue rendering, so '
        + 'EC-3b could no longer tell the roster\'s label from the accrue path\'s',
    expect: 'roster_spelling_still_differs',
    inputs: {
      accrueLabel: 'accrue:2026-09-21T17:55:55.739123+00:00',
      oldTick: 'accrue:2026-09-21T17:55:55.739Z',
      oldRoster: 'accrue:2026-09-21T17:55:55.739123+00:00',
    },
  },
  label_hash_canonicalises: {
    what: 'THE ONE THE STRING CLAIMS CANNOT SEE. Three different strings, but hr_seed parses '
        + 'the instant out of the label, so the old spellings draw the SAME stream after all',
    expect: 'tick_seed_still_differs',
    inputs: {
      accrueLabel: 'accrue:2026-09-21T17:55:55.739123+00:00',
      oldTick: 'accrue:2026-09-21T17:55:55.739Z',
      oldRoster: 'accrue:2026-09-21T17:55:55.739Z',
    },
    seedOf: (label) => `by-instant:${Date.parse(label.slice('accrue:'.length))}`,
  },
  accrue_rendering_lost_its_microseconds: {
    what: 'the accrue path\'s label stops being Postgres\'s JSON rendering (milliseconds, and '
        + 'an offset pasted on), so "microseconds vs milliseconds" is no longer what these '
        + 'three strings differ by and the arm is describing a system that moved',
    expect: 'accrue_rendering_is_postgres_json',
    inputs: {
      accrueLabel: 'accrue:2026-09-21T17:55:55.739+00:00',
      oldTick: 'accrue:2026-09-21T17:55:55.739Z',
      oldRoster: 'accrue:2026-09-21T17:55:55.739Z',
    },
  },
};

// An honest stand-in for hr_seed: different label in, different number out.
// It is not a model of hr_seed and does not need to be — the arm below uses
// the real one; this only has to be injective over the planted strings.
const seedByString = (label) => {
  let h = 5381n;
  for (const ch of label) h = ((h * 33n) ^ BigInt(ch.codePointAt(0))) & 0xffffffffffffffffn;
  return h.toString();
};

async function selftest() {
  console.log('world-tick-edge-contract --selftest: EC-3d, the control, against planted defects\n');
  let bad = 0;
  for (const [id, c] of Object.entries(SELFTEST_CASES)) {
    let got;
    try {
      got = await ec3dClaims(Object.assign({ seedOf: c.seedOf || seedByString }, c.inputs));
    } catch (e) {
      console.error(`  x  ${id} — UNEXPECTED ERROR: ${String(e && e.message).split('\n')[0]}`
        + `\n     ${c.what}`);
      bad += 1; continue;
    }
    if (c.expect === null) {
      if (got.pass) { console.log(`  ok  ${id.padEnd(38)} silent, as it must be`); continue; }
      console.error(`  x  ${id} — expected NO finding; got: ${got.failed.join(', ')}`
        + `\n     ${c.what}`);
      bad += 1; continue;
    }
    if (got.failed.includes(c.expect)) {
      console.log(`  ok  ${id.padEnd(38)} ${got.failed.join(', ')}`);
    } else {
      console.error(`  x  ${id} — expected the claim "${c.expect}" to fail; got: `
        + `${got.failed.join(', ') || '(nothing — the control did not bite)'}\n     ${c.what}`);
      bad += 1;
    }
  }
  if (bad) {
    console.error(`\n${bad} planted case(s) did not behave as the assertion written for them requires.`);
    process.exit(1);
  }
  console.log(`\nall ${Object.keys(SELFTEST_CASES).length} planted cases behaved as their named `
    + 'assertion requires — EC-3d bites on a converged spelling and on a canonicalising label '
    + 'hash, and is silent about the session\'s time zone.');
}

if (process.argv.slice(2).includes('--selftest')) {
  await selftest();
  process.exit(process.exitCode || 0);
}

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
       `to_char(... 'MS"Z"')` — and they must both still be WRONG for the same
       instant, in the string AND in the seed, or the three arms above have
       stopped distinguishing anything. The renderings are Postgres's, in
       whatever zone this session holds; the claims are ec3dClaims', which is
       where the zone stops mattering (see its header) and which --selftest
       mutates. */
    const r = (await db.query(`
      select to_jsonb(ts) #>> '{}'                                            as accrue_spelling,
             to_char(ts at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')   as roster_to_char,
             ts                                                               as raw
        from (select '2026-09-21 17:55:55.739123+00'::timestamptz as ts) q`)).rows[0];
    const oldTick = 'accrue:' + new Date(r.raw).toISOString();
    const oldRoster = 'accrue:' + r.roster_to_char;
    const nowCorrect = 'accrue:' + r.accrue_spelling;
    const zone = (await db.query('select current_setting(\'TimeZone\') as z')).rows[0].z;
    const ctl = await ec3dClaims({
      accrueLabel: nowCorrect,
      oldTick,
      oldRoster,
      seedOf: async (label) => (await db.query(
        'select public.hr_seed($1::uuid, 0, $2) as s', [u, label])).rows[0].s,
    });
    judge('EC-3d (control)', ctl.pass,
      'the two PREVIOUS spellings are still wrong for the same instant — microseconds and a '
      + `numeric offset vs milliseconds and \`Z\` (${nowCorrect} vs ${oldTick}, session `
      + `TimeZone ${zone}) — and they hash to different seeds (${ctl.seeds.accrue} vs `
      + `${ctl.seeds.tick}/${ctl.seeds.roster}), so a revert in either tick.js or the roster is `
      + 'still caught by EC-3a/EC-3b',
      'a previous spelling is no longer distinguishable from the accrue path, so EC-3a/EC-3b can '
      + `no longer tell the fix from the defect.\n           failed claims : ${ctl.failed.join(', ')}`
      + `\n           accrue     : ${nowCorrect}  seed ${ctl.seeds.accrue}`
      + `\n           old tick   : ${oldTick}  seed ${ctl.seeds.tick}`
      + `\n           old roster : ${oldRoster}  seed ${ctl.seeds.roster}`
      + `\n           session TimeZone : ${zone}  (the renderings above are Postgres's, in that `
      + 'zone; none of the claims depend on it)');
  }

  // ── EC-4 ── THE COMBAT DRIVER (Security S-8) ────────────────────────────
  // Until 2026-09-23 NOTHING IN THE EDGE SETTLED COMBAT. `tick.js` imported a
  // single `CHANNEL` from `tick-gather.js`, fenced every character under
  // 'gather', and `settleCombatSession` had no production caller at all — its
  // only callers were three test files, and `services/` is not in the payload.
  // Arming `combat` would have leased combat characters under a stamped lease
  // and then asked the fence about them under the wrong channel, where the
  // lease lookup is `(user, slot, channel)` and finds nothing. Result: zero
  // `hr_tick_shadow` combat rows, one `batch_limit` slot burned per character
  // per fire out of the running gather cohort, and a 48 h parity read that is
  // empty BY CONSTRUCTION while every dashboard stays green.
  //
  // These arms drive the shipped `runTick` — not a re-implementation — against
  // the real fence, so reverting tick.js to the constant turns EC-4a red.
  group('EC-4  the combat driver: a combat character settles, a gather one still does');
  {
    const FIGHT_MONSTER = 'goblin';
    const XP_AT_61 = 302288;
    const holder = (await db.query(
      "select left('cron:' || coalesce(current_database(), 'db'), 64) as h")).rows[0].h;

    /* THE LEVEL-61 FIGHTER, the same shape world-tick-hydration seeds: armed,
       fed, auto-eat on, mid-fight, six deaths today and sixty in the ladder,
       an enchanted weapon and a chosen style. Nothing here is a round default
       — a character who cannot kill cannot prove that the settler ran. */
    const seedFighter = async (u, channel) => {
      await db.exec(`insert into auth.users (id) values ('${u}') on conflict do nothing;`);
      for (const t of ['player_skills', 'player_inventory', 'player_equipment', 'player_progress']) {
        await db.exec(`delete from public.${t} where user_id = '${u}';`);
      }
      await db.exec(`
        insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
          active_kind, active_id, active_since, auto_eat_enabled, auto_eat_food, auto_eat_pct,
          consec_falls, combat_style, tool_carry, combat_xp_accrued_to, recovering_until,
          fight, buffs, enchant)
        values ('${u}', 0, 1234, 0, 99, 99, 7, now() - interval '10 minutes',
          'combat', '${FIGHT_MONSTER}', now() - interval '2 hours',
          true, 'cooked_trout', 70,
          0, '{"sword":"aggressive"}'::jsonb, '{}'::jsonb,
          now() - interval '3 hours', now() - interval '3 hours',
          '{"id":"${FIGHT_MONSTER}","hp":11}'::jsonb, '[]'::jsonb, '{"weapon":"fire"}'::jsonb)
        on conflict (user_id, slot) do update set version = 7, hp = 99, max_hp = 99, gold = 1234,
          accrued_to = now() - interval '10 minutes',
          active_kind = 'combat', active_id = '${FIGHT_MONSTER}';`);
      await db.exec(`
        insert into public.player_skills (user_id, slot, skill_id, xp) values
          ('${u}', 0, 'attack',    ${XP_AT_61}),
          ('${u}', 0, 'strength',  ${XP_AT_61}),
          ('${u}', 0, 'defence',   150000),
          ('${u}', 0, 'hitpoints', ${XP_AT_61});`);
      await db.exec(`
        insert into public.player_inventory (user_id, slot, item_id, qty) values
          ('${u}', 0, 'cooked_trout', 40), ('${u}', 0, 'bones', 2);`);
      await db.exec(`
        insert into public.player_equipment (user_id, slot, equip_slot, item_id)
        values ('${u}', 0, 'weapon', 'mithril_sword');`);
      await db.exec(`
        insert into public.player_progress (user_id, slot, kind, key, period_key, value) values
          ('${u}', 0, 'stat', 'deaths', '', 60),
          ('${u}', 0, 'stat', 'deaths', public.hr_utc_day_key(now()), 6);`);
      await db.exec(`delete from public.hr_tick_ownership where user_id = '${u}';`);
      await db.exec(`
        insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
        values ('${u}', 0, '${channel}', true, '${holder}', now() + interval '5 minutes');`);
    };

    const execSeam = async (text, params) => {
      await db.exec('begin'); await db.exec('set local role hr_engine');
      try { return (await db.query(text, params)).rows; }
      finally { await db.exec('commit'); }
    };
    const fire = async (u) => {
      try {
        return (await runTick({
          exec: execSeam,
          body: { op: 'tick', roster: [{ user_id: u, slot: 0 }],
            cadence_ms: 10000, flush_ms: 90000 },
        })).body;
      } catch (e) { return { RAISED: String(e.message).slice(0, 160) }; }
    };

    /* THE CHANNEL IS ARMED FOR THIS GUARD ONLY. Production stays `{gather}`
       until Security lifts the ARM block; the point here is that the EDGE can
       settle what an armed roster would hand it, which is the precondition the
       arm is blocked on — not a recommendation to arm. */
    await db.exec("update public.hr_tick_config set channels = array['combat','gather']::text[],"
      + ' enabled = true, shadow = true where id;');

    const uc = U(10);
    await seedFighter(uc, 'combat');
    await db.exec(`delete from public.hr_tick_shadow where user_id = '${uc}';`);
    const combatFire = await fire(uc);
    const row = (await db.query(
      `select channel, would_kills, would_xp, would_gold, would_ate, delta
         from public.hr_tick_shadow where user_id = '${uc}' order by window_to desc limit 1`)).rows[0];
    const kills = row ? Number(row.would_kills) : 0;
    const xpKeys = row && row.would_xp ? Object.keys(row.would_xp) : [];
    const xpTotal = xpKeys.reduce((a, k) => a + Number(row.would_xp[k] || 0), 0);

    judge('EC-4a', !!row && row.channel === 'combat' && kills > 0 && xpTotal > 0,
      'a combat roster row reached settleCombatSession and journalled a SHADOW row: '
      + `would_kills=${kills}, would_xp=${JSON.stringify(row && row.would_xp)}, `
      + `would_gold=${row && row.would_gold}, would_ate=${row && row.would_ate} `
      + `(fire: ${JSON.stringify({ shadowed: combatFire.shadowed, skipped: combatFire.skipped, refused: combatFire.refused, reasons: combatFire.reasons })})`,
      'NOTHING IN THE EDGE SETTLED COMBAT (Security S-8). The fire answered '
      + `${JSON.stringify(combatFire)} and hr_tick_shadow holds `
      + `${row ? JSON.stringify({ kills, xp: row.would_xp }) : 'NO ROW'} for this character. `
      + 'A `channel_moved` or `channel_not_driven` reason means tickOne never dispatched to '
      + 'settleCombatSession; zero kills with a shadow row means the settler ran but the level-61 '
      + 'fighter reached the engine at level 0 (that is S-7, not S-8).');

    /* THE GATHER PATH IS UNTOUCHED. The dispatch table is the change; the
       channel that already worked must still work, or S-8's fix has traded one
       empty parity read for another. */
    const ug = U(11);
    await db.exec(`insert into auth.users (id) values ('${ug}') on conflict do nothing;`);
    await db.exec(`
      insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                       active_kind, active_id, active_since)
      values ('${ug}', 0, 0, 0, 10, 10, 1, now() - interval '10 minutes',
              'gather', '${ACT}', now() - interval '2 hours')
      on conflict (user_id, slot) do update set version = 1, gold = 0,
        accrued_to = now() - interval '10 minutes', active_kind = 'gather', active_id = '${ACT}';`);
    await db.exec(`delete from public.hr_tick_ownership where user_id = '${ug}';`);
    await db.exec(`
      insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
      values ('${ug}', 0, 'gather', true, '${holder}', now() + interval '5 minutes');`);
    await db.exec(`delete from public.hr_tick_shadow where user_id = '${ug}';`);
    const gatherFire = await fire(ug);
    const gRows = Number((await db.query(
      `select count(*) as n from public.hr_tick_shadow
        where user_id = '${ug}' and channel = 'gather'`)).rows[0].n);
    judge('EC-4b', gatherFire.ok === true && gatherFire.shadowed === 1 && gRows === 1,
      'and the gather path still reaches settleGatherSession through the same dispatch — '
      + `${gRows} shadow row, fire ${JSON.stringify({ shadowed: gatherFire.shadowed, skipped: gatherFire.skipped, reasons: gatherFire.reasons })}`,
      `the dispatch broke the channel that already worked: ${JSON.stringify(gatherFire)}, `
      + `${gRows} gather shadow rows`);

    /* ── EC-4c (control) — TODAY'S SHAPE, PINNED AS STILL WRONG ─────────────
       The defect was not "combat settled badly", it was "combat was asked
       about under gather's channel". Ask the fence the OLD question about the
       combat character and require it to be REFUSED: the lease lookup is
       `(user, slot, channel)` (2026-09-21-world-tick-settle-fence.sql step 4),
       so a combat character probed as 'gather' has no lease row at all. This
       is why the old code could not have settled one, and it stays red if
       anyone re-hardcodes the channel. */
    const probeAs = async (u, channel) => {
      await db.exec('begin'); await db.exec('set local role hr_engine');
      let out;
      try {
        out = (await db.query(
          `select public.hr_tick_settle($1::text, $2::uuid, 0, $3::text, null::bigint,
             '1970-01-01T00:00:00.000Z'::timestamptz, now()::timestamptz, $4::uuid,
             jsonb_build_object('accrued_to', now()::text)) as r`,
          [holder, u, channel, KEY0])).rows[0].r;
      } catch (e) { out = { RAISED: String(e.message).slice(0, 90) }; }
      await db.exec('commit');
      return out;
    };
    const asGather = await probeAs(uc, 'gather');
    const asCombat = await probeAs(uc, 'combat');
    judge('EC-4c (control)', asGather.ok !== true && asGather.error !== 'window_already_settled'
        && asCombat.error === 'window_already_settled',
      "the OLD spelling is still wrong: probing the combat character as 'gather' is refused "
      + `\`${asGather.error}\` (no lease row on that channel), while its OWN channel reads the `
      + `watermark back (\`${asCombat.error}\`, accrued_to=${asCombat.accrued_to}). That pair is `
      + 'exactly why a hard-coded channel journalled nothing',
      'the two spellings are no longer distinguishable, so EC-4a can no longer tell the fix from '
      + `the defect: as-gather=${JSON.stringify(asGather)} as-combat=${JSON.stringify(asCombat)}`);

    /* ── EC-4d — THE ROSTER MUST NEVER LEASE WHAT THE EDGE CANNOT SETTLE ────
       `hr_tick_config_channels_ck` is the set of values an operator can put in
       `channels`, and the roster hands out a lease for every one of them. Any
       value the edge neither DRIVES nor explicitly DECLARES UNDRIVEN is a
       channel that can be armed into silence — S-8 exactly. Read the CHECK
       from the catalogue rather than restating it, so widening the constraint
       without wiring or declaring the channel goes red HERE. */
    const ck = (await db.query(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conname = 'hr_tick_config_channels_ck'`)).rows[0];
    const admitted = ck ? [...new Set([...String(ck.def).matchAll(/'([a-z_]+)'::text/g)]
      .map((m) => m[1]))].sort() : [];
    const driven = Object.keys(CHANNELS).sort();
    const declaredUndriven = Object.keys(UNDRIVEN_CHANNELS).sort();
    const unaccounted = admitted.filter(
      (c) => !driven.includes(c) && !declaredUndriven.includes(c));
    const undrivenNotAdmitted = declaredUndriven.filter((c) => !admitted.includes(c));
    judge('EC-4d', admitted.length > 0 && unaccounted.length === 0
        && undrivenNotAdmitted.length === 0 && driven.includes('combat') && driven.includes('gather'),
      `every channel the CHECK admits is accounted for — admitted [${admitted.join(', ')}], `
      + `driven [${driven.join(', ')}], declared undriven [${declaredUndriven.join(', ')}] `
      + '(an undriven channel is refused by name as `channel_not_driven`, never fenced under '
      + 'another channel)',
      admitted.length === 0
        ? 'hr_tick_config_channels_ck was not found — the CHECK this arm reads is gone, so nothing '
          + 'bounds what an operator can arm'
        : `the roster can lease a channel the edge cannot settle: [${unaccounted.join(', ')}] is `
          + `admitted by the CHECK but neither in tick.js CHANNELS [${driven.join(', ')}] nor `
          + `declared in UNDRIVEN_CHANNELS [${declaredUndriven.join(', ')}]`
          + (undrivenNotAdmitted.length
            ? `; and [${undrivenNotAdmitted.join(', ')}] is declared undriven but the CHECK no `
              + 'longer admits it, so the declaration is stale' : ''));

    /* ── EC-4e — THE DISPLACED SHADOW WINDOW (Security S-8, second half) ────
       The FIRST combat window is easy: `player_state.accrued_to` still equals
       the fence's mark, so combat's `rosterWatermarkText` finds a server
       rendering of it on the envelope and the seed label can be spelled. From
       the SECOND window on they diverge — in shadow the fence chains on
       `hr_tick_ownership.shadow_accrued_to`, which has moved, while
       `accrued_to` has not — and the ONLY server rendering of the fence's mark
       is `probe.markText`. `tick.js` did not put it on the roster row, so
       `rosterWatermarkText` would have thrown on every window after the first:
       a combat cohort that settles exactly once and then goes silent, which
       reads as "the tick stalled" and not as a missing field.

       So: fire twice and require the SECOND window to journal too. This arm is
       red without `mark_text: probe.markText` in the session build. */
    const before = Number((await db.query(
      `select count(*) as n from public.hr_tick_shadow
        where user_id = '${uc}' and channel = 'combat'`)).rows[0].n);
    const mark1 = (await db.query(
      `select ps.accrued_to, o.shadow_accrued_to
         from public.hr_tick_ownership o
         join public.player_state ps using (user_id, slot)
        where o.user_id = '${uc}' and o.channel = 'combat'`)).rows[0];
    const fire2 = await fire(uc);
    const after = Number((await db.query(
      `select count(*) as n from public.hr_tick_shadow
        where user_id = '${uc}' and channel = 'combat'`)).rows[0].n);
    const displaced = mark1 && mark1.shadow_accrued_to != null
      && String(mark1.shadow_accrued_to) !== String(mark1.accrued_to);
    judge('EC-4e', displaced && after === before + 1 && fire2.shadowed === 1,
      'the SECOND combat window settles too — the shadow mark has displaced from '
      + `player_state.accrued_to (${mark1 && mark1.shadow_accrued_to} vs ${mark1 && mark1.accrued_to}) `
      + `and the fence's own rendering still spells the seed label: ${before} -> ${after} shadow rows`,
      !displaced
        ? 'the shadow mark never displaced, so this arm did not exercise what it is for — the '
          + `ownership row reads ${JSON.stringify(mark1)}`
        : 'THE DISPLACED WINDOW WAS REFUSED. Without `mark_text: probe.markText` on the roster row '
          + 'combat\'s rosterWatermarkText has no server rendering of the fence mark and throws, so '
          + `a combat character settles once and then stalls: ${JSON.stringify(fire2)} `
          + `(${before} -> ${after} shadow rows)`);

    /* Leave the singleton as production holds it. A guard that arms a channel
       and walks away is a guard that changed the thing it measures. */
    await db.exec("update public.hr_tick_config set channels = array['gather']::text[] where id;");
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
