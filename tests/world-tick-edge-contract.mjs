#!/usr/bin/env node
// ============================================================================
// tests/world-tick-edge-contract.mjs — THE op:'tick' ENTRY AGAINST A REAL
// POSTGRES, NOT AGAINST A STUB.
//
// Security, OP:TICK REVIEW 2026-09-21 (docs/planning/SEC_WORLD_TICK_M1_2026-09-21.md).
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// `tests/edge-tick-gate.mjs` is a good guard and it is GREEN. It drives
// `runTick` through a hand-written `exec` stub, and that stub answers
// `select now()` with an ISO **string** (`edge-tick-gate.mjs:118`) and
// `hr_state_of` with `now: NOW_ISO`. The real driver — `postgres` in the edge,
// PGlite here, both of them — parses OID 1184 into a JS **Date**. The entry
// then does `String(<Date>)` and hands the result BACK to Postgres as a
// `$::timestamptz` bind parameter, which is a spelling Postgres refuses.
//
// The stub is more forgiving than the transport, so the guard cannot see it.
// That is the lesson `supabase/functions/hr-accrue/cors.js` is already written
// around: **a check that does not use the transport the caller uses is checking
// a different system.** So this file uses the transport.
//
// The same class covers the SEED LABEL. The accrue path labels a window
// `'accrue:' + String(st.accrued_to)` where `st` is the `hr_state_of` JSONB
// envelope (index.ts:699, :790) — Postgres's JSON rendering of a timestamptz.
// The tick labels it `'accrue:' + new Date(ms).toISOString()` (tick.js
// `planSeedLabels`) and the roster labels it with `to_char(... 'MS"Z"')`.
// Those are three spellings of one instant and only two of them agree.
// `hr_seed` hashes the LABEL, so a different spelling is a different stream —
// which is the one thing the 48 h shadow parity run must not have.
//
// RED ON PURPOSE. Arms marked (control) are green and localise the defect.
// Run: node tests/world-tick-edge-contract.mjs
// ============================================================================

import { bootReplay } from './schema-replay.mjs';

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
  group('EC-1  `select now()` -> String() -> back to Postgres (the entry\'s own round trip)');
  {
    const v = (await db.query('select now()::timestamptz as now')).rows[0].now;
    judge('EC-1a', v instanceof Date,
      'the driver parses timestamptz into a JS Date, as `postgres` does in the edge '
      + `(got ${Object.prototype.toString.call(v)})`,
      `the driver did NOT return a Date (${Object.prototype.toString.call(v)}) — re-read this file`);

    const asTickSpellsIt = String(v);
    let accepted = false; let why = '';
    try {
      await db.query('select $1::timestamptz as t', [asTickSpellsIt]);
      accepted = true;
    } catch (e) { why = String(e.message).slice(0, 90); }
    judge('EC-1b', accepted,
      '`String(now)` is a timestamptz literal Postgres accepts',
      `\`String(now)\` is NOT a timestamptz Postgres accepts — tick.js tickOne binds exactly this `
      + `value as p_window_to and as delta.accrued_to.\n           value : ${asTickSpellsIt}`
      + `\n           error : ${why}`);

    let ok2 = false;
    try { await db.query('select $1::timestamptz as t', [new Date(v).toISOString()]); ok2 = true; } catch { /* */ }
    judge('EC-1c (control)', ok2,
      'the ISO spelling of the SAME instant round-trips — the defect is the spelling, one line, '
      + 'in tick.js tickOne',
      'even the ISO spelling was refused — the defect is not the spelling');
  }

  // ── EC-2 ── THE SAME THING THROUGH THE REAL FENCE ───────────────────────
  // probeWatermark is how the entry learns every character's watermark. It is
  // called once per character per fire and it is the FIRST engine statement of
  // the fire, so if it throws, the fire settles nothing at all.
  group('EC-2  probeWatermark() against the real hr_tick_settle');
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

    const v = (await db.query('select now()::timestamptz as now')).rows[0].now;
    const asTick = await probe(String(v));
    judge('EC-2a', !asTick.RAISED,
      `the probe returned a verdict (${asTick.error || 'ok'}) rather than throwing`,
      'the probe THREW instead of returning a refusal code. runTick catches it per character and '
      + 'counts `refused: error:…`, so EVERY character of EVERY fire is refused and the 48 h '
      + `shadow parity run journals ZERO rows.\n           ${asTick.RAISED}`);

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

  // ── EC-3 ── THE SEED LABEL, THREE SPELLINGS OF ONE INSTANT ──────────────
  group('EC-3  the per-window seed label: accrue path vs tick vs roster');
  {
    const r = (await db.query(`
      select to_jsonb(ts) #>> '{}'                                   as accrue_spelling,
             to_char(ts at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as roster_spelling,
             ts                                                      as raw
        from (select '2026-09-21 17:55:55.739123+00'::timestamptz as ts) q`)).rows[0];

    // index.ts:699/:790 — `st` IS the hr_state_of JSONB envelope, so
    // `String(st.accrued_to)` is Postgres's JSON rendering of the column.
    const accrueLabel = 'accrue:' + r.accrue_spelling;
    // tick.js planSeedLabels — 'accrue:' + new Date(ms).toISOString()
    const tickLabel   = 'accrue:' + new Date(r.raw).toISOString();
    // roster §4 `seed` column
    const rosterLabel = 'accrue:' + r.roster_spelling;

    judge('EC-3a', tickLabel === accrueLabel,
      'the tick labels a window exactly as the accrue path labels it',
      'the tick and the accrue path label the SAME instant differently, so hr_seed returns a '
      + 'DIFFERENT STREAM for the same window and the 48 h parity number measures the PRNG, not '
      + `the tick.\n           accrue path : ${accrueLabel}\n           tick        : ${tickLabel}`);

    judge('EC-3b', rosterLabel === accrueLabel,
      'the roster\'s `seed` column labels a window exactly as the accrue path does',
      '2026-09-20-world-tick-roster.sql derives the label "EXACTLY as hr-accrue/index.ts derives '
      + `it". It does not.\n           accrue path : ${accrueLabel}\n           roster      : ${rosterLabel}`);

    const seeds = (await db.query(
      `select public.hr_seed($1::uuid, 0, $2) as a, public.hr_seed($1::uuid, 0, $3) as b`,
      [U(1), accrueLabel, tickLabel])).rows[0];
    judge('EC-3c', String(seeds.a) === String(seeds.b),
      'the two spellings hash to the same seed, so the divergence would be cosmetic',
      `the two spellings draw DIFFERENT streams (hr_seed ${seeds.a} vs ${seeds.b}) — every RNG `
      + 'outcome in the shadow journal (drops, rare drops, crits) diverges from what accrual paid '
      + 'BY CONSTRUCTION, which is the measurement milestone 1 exists to take');

    judge('EC-3d (control)', accrueLabel.endsWith('+00:00') && tickLabel.endsWith('Z'),
      'the difference is `+00:00` vs `Z` (and microseconds vs milliseconds) — one spelling, fixable '
      + 'in tick.js planSeedLabels and the roster\'s to_char together',
      'the difference is not the one this arm describes — re-read before fixing');
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
