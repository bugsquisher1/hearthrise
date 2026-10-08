// ============================================================================
// tests/world-tick-m4-party-horizon.mjs — THE PARTY PATH IS HORIZON-FENCED AND
//                                         COHORT-BOUND BEFORE COMBAT ARMS
//
//   node tests/world-tick-m4-party-horizon.mjs            the guard
//   node tests/world-tick-m4-party-horizon.mjs --mutate   every mutant must go RED
//
// supabase/migrations/2026-10-14-world-tick-m4-party-horizon.sql. The chain is
// replayed up to the file BEFORE it, then the file is executed here, inside a
// transaction that is always rolled back, so a red self-check is a RED arm
// (with the self-check's own message) rather than a harness failure.
//
//   P-APPLY  the file applies; its §7 self-check (k0 kg m1-m9) passes
//   P-IDEM   a second apply is byte-identical (inventory + the three bodies)
//   P-BASE   ★ the frac-keys hr_party_tick_settle (1d7153c1) is an ordered line
//            subsequence of the RESTATED body with the additions in exactly
//            six runs (five insertions; (3c)'s is two: the anchor read before
//            the case, the two arms inside it), and the live
//            hr_party_hunt_start (7b3a81ab) of the
//            patched one in one run: insertions only, nothing edited or removed
//
// --mutate plants a defect in the file's text, executes §0-§6, re-pins §7's
// md5 constants to whatever the mutant installed (so the BEHAVIOUR arms are
// reached rather than k0's pin), and requires §7 to refuse on the named arm.
// One mutant (bodyDrift) keeps the stale pins and must be refused by k0.
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const MIG = '2026-10-14-world-tick-m4-party-horizon.sql';
const PREV = '2026-10-13-party-settle-frac-keys.sql';
const SQL = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
const SIG = {
  settle: 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)',
  start: 'public.hr_party_hunt_start(integer,text,text,jsonb,uuid)',
  cap: 'public.hr_accrue_cap_ms(uuid,integer)',
};
const BASE = { settle: '1d7153c183b87144003003861f24dbd1', start: '7b3a81ab264a7c440afa18064141904b' };
/** Five insertions; (3c)'s lands as two runs (before the case, inside it). */
const SETTLE_RUNS = 6;
const SELF_AT = SQL.indexOf('-- ── §7 SELF-CHECK');
const S2_AT = SQL.indexOf('-- ── §2 hr_party_tick_settle');
const S3_AT = SQL.indexOf('-- ── §3 hr_party_hunt_start');
const S4_AT = SQL.indexOf('-- ── §4 hr_accrue_cap_ms');
if (SELF_AT < 0 || S2_AT < 0 || S3_AT < S2_AT || S4_AT < S3_AT) {
  console.error('harness: the migration has no §2/§3/§4/§7 markers'); process.exit(2);
}

const md5Of = async (db, sig) =>
  (await db.query(`select md5(replace(prosrc, chr(13), '')) as m from pg_proc where oid = '${sig}'::regprocedure`)).rows[0].m;
const srcOf = async (db, sig) =>
  (await db.query(`select replace(prosrc, chr(13), '') as s from pg_proc where oid = '${sig}'::regprocedure`)).rows[0].s;

/**
 * INSERTIONS ONLY: is every line of `base` present in `next`, in order (an
 * ordered subsequence), and in how many contiguous runs do the added lines sit?
 * Greedy matching decides subsequence membership exactly; the run count is
 * what a reviewer reads ("five blocks were added, nothing was removed or
 * edited").
 */
function insertionRuns(base, next) {
  const b = base.split('\n');
  const n = next.split('\n');
  let i = 0;
  let runs = 0;
  let inRun = false;
  let added = 0;
  for (const line of n) {
    if (i < b.length && line === b[i]) { i += 1; inRun = false; continue; }
    added += 1;
    if (!inRun) { runs += 1; inRun = true; }
  }
  return { subsequence: i === b.length, runs, added };
}
const bodies = async (db) => (await Promise.all(Object.values(SIG).map((s) => md5Of(db, s)))).join(',');

/** Apply `sql` in a rolled-back transaction; return null or the first error line. */
async function tryApply(db, sql, after) {
  await db.exec('begin;');
  try {
    await db.exec(sql);
    if (after) return await after();
    return null;
  } catch (e) {
    return String(e.message).split('\n')[0];
  } finally {
    await db.exec('rollback;');
  }
}

let db;
try { ({ db } = await bootReplay({ upTo: PREV })); } catch (e) {
  console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2);
}
if ((await md5Of(db, SIG.settle)) !== BASE.settle || (await md5Of(db, SIG.start)) !== BASE.start) {
  console.error('harness: the replayed chain before this file is not the base the file pins'); process.exit(2);
}
const BASE_SRC = { settle: await srcOf(db, SIG.settle), start: await srcOf(db, SIG.start) };

if (!MUTATE) {
  console.log('\nworld-tick-m4-party-horizon: the party path is horizon-fenced and cohort-bound before combat arms');
  const red = [];
  const err = await tryApply(db, SQL, async () => {
    const inv1 = JSON.stringify(await inventory(db));
    const b1 = await bodies(db);
    console.log('  ✓ P-APPLY — applied; §7 self-check passed (k0 kg m1-m9)');
    try { await db.exec(SQL); } catch (e) { return `P-IDEM: the second apply RAISED: ${String(e.message).split('\n')[0]}`; }
    if (JSON.stringify(await inventory(db)) !== inv1 || (await bodies(db)) !== b1) return 'P-IDEM: the second apply moved the schema or a body';
    console.log('  ✓ P-IDEM — a second apply is byte-identical (§0 accepted its own bodies, §2/§3 skipped, §7 passed twice)');
    // P-BASE: the base bodies (read before the apply) are ordered line
    // subsequences of the installed ones, the additions in 5 / 1 runs.
    const s = insertionRuns(BASE_SRC.settle, await srcOf(db, SIG.settle));
    const t = insertionRuns(BASE_SRC.start, await srcOf(db, SIG.start));
    if (!s.subsequence || s.runs !== SETTLE_RUNS) {
      return `P-BASE: the settle is not the frac-keys body plus ${SETTLE_RUNS} inserted runs (subsequence ${s.subsequence}, ${s.runs} runs) — something was edited or removed`;
    }
    if (!t.subsequence || t.runs !== 1) {
      return `P-BASE: the start is not the live body plus one inserted block (subsequence ${t.subsequence}, ${t.runs} runs)`;
    }
    console.log(`  ✓ P-BASE — 1d7153c1 / 7b3a81ab are ordered line subsequences of the installed bodies; ${s.added} lines added in ${SETTLE_RUNS} runs / ${t.added} in 1`);
    return null;
  });
  if (err) { red.push(err.split(':')[0].startsWith('P-') ? err.split(':')[0] : 'P-APPLY'); console.log(`  ✗ ${err}`); }
  await db.close();
  console.log(red.length ? `\nRED: ${red.join(', ')}`
    : '\nGREEN: past-horizon hunters drop, windows past a horizon are refused whole, the cohort binds the party path, the partied cap read is one budget');
  process.exit(red.length ? 1 : 0);
}

// ── --mutate ────────────────────────────────────────────────────────────────
const MUTANTS = [
  { name: 'dropNoHorizon', why: '(3c) never drops past_horizon: a hunter past R + cap keeps being paid', expect: /self-check m1/,
    find: "                    when now() > v_anchor + v_cap_ms * interval '1 millisecond' then 'past_horizon'\n",
    repl: "                    when false and now() > v_anchor + v_cap_ms * interval '1 millisecond' then 'past_horizon'\n" },
  { name: 'dropNoAnchorPays', why: '(3c) a hunter with no anchor is not dropped (fails open)', expect: /self-check m3/,
    find: "                    when v_anchor is null then 'no_return_anchor'\n", repl: '' },
  { name: 'noCohortEnd', why: '(3a) an un-owned hunter does not end the hunt (the cohort escapes)', expect: /self-check m5/,
    find: '    if jsonb_array_length(v_noown) > 0 then\n', repl: '    if false then\n' },
  { name: 'cohortInShadow', why: '(3a)/(3c) run in SHADOW too (a shadow fire ends or drops a hunt)', expect: /self-check m6/, skipBase: true,
    find: "  if not v_shadow then\n    -- ══ (3a) ★ THE M4 COHORT ★", repl: "  if true then\n    -- ══ (3a) ★ THE M4 COHORT ★" },
  { name: 'noBackstop', why: '(8d) a window ending past a member\'s horizon pays (the 60 s skew, a straddle)', expect: /self-check m4/,
    find: "       or p_window_to > v_anchor + v_cap_ms * interval '1 millisecond' then\n      return jsonb_build_object('ok', false,\n        'error', case",
    repl: "       or false then\n      return jsonb_build_object('ok', false,\n        'error', case" },
  { name: 'backstopJudgesStart', why: '(8d) judges the window START (Security #4: a straddling window pays past the line)', expect: /self-check m4/,
    find: "       or p_window_to > v_anchor + v_cap_ms * interval '1 millisecond' then\n      return jsonb_build_object('ok', false,\n        'error', case",
    repl: "       or p_window_from > v_anchor + v_cap_ms * interval '1 millisecond' then\n      return jsonb_build_object('ok', false,\n        'error', case" },
  { name: 'backstopOverRefuses', why: '(8d) refuses inside the horizon (a correct window is never paid)', expect: /self-check m4/,
    find: "       or p_window_to > v_anchor + v_cap_ms * interval '1 millisecond' then\n      return jsonb_build_object('ok', false,\n        'error', case",
    repl: "       or p_window_to > v_anchor + v_cap_ms * interval '1 millisecond' - interval '1 hour' then\n      return jsonb_build_object('ok', false,\n        'error', case" },
  { name: 'rejoinIgnoresHorizon', why: '(10) a horizon-dropped member rejoins without a real return', expect: /self-check m2/,
    find: "       or p_window_to + make_interval(secs => coalesce(v_cfg.flush_seconds, 90))\n          > v_anchor + v_cap_ms * interval '1 millisecond' then\n      continue;",
    repl: "       or false then\n      continue;" },
  { name: 'rejoinIgnoresCohort', why: '(10) an un-owned member rejoins the party path', expect: /self-check m2/,
    find: "                      and o.channel = c_channel and o.owned) then\n      continue;\n    end if;\n    --  (i)",
    repl: "                      and o.channel = c_channel and o.owned) and false then\n      continue;\n    end if;\n    --  (i)" },
  { name: 'capShortCircuit', why: 'hr_accrue_cap_ms answers a partied character the RAW cap again', expect: /self-check (k0|m7)/,
    find: "  select a.real_return_at into v_anchor from public.hr_return_anchor a\n   where a.user_id = p_user and a.slot = p_slot;\n  if v_anchor is null then return v_cap; end if;\n\n  -- What is left",
    repl: "  if public.hr_partied(p_user, p_slot) then return v_cap; end if;\n  select a.real_return_at into v_anchor from public.hr_return_anchor a\n   where a.user_id = p_user and a.slot = p_slot;\n  if v_anchor is null then return v_cap; end if;\n\n  -- What is left" },
  { name: 'capForfeitsPartied', why: 'hr_accrue_cap_ms forfeits a partied character (moves a mark that is the hunt\'s)', expect: /self-check m7/,
    find: '     or public.hr_partied(p_user, p_slot) then\n', repl: '     then\n' },
  { name: 'startNoCohort', why: 'hr_party_hunt_start admits a member outside the cohort', expect: /m8:/,
    find: "  if v_m.user_id is not null then\n    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'hunt_not_in_cohort',",
    repl: "  if false then\n    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'hunt_not_in_cohort'," },
  { name: 'noFrameCheck', why: 'combat armed can carry an inventory frame key (ruling 3.1 by convention only)', expect: /m9:/,
    find: "      coalesce(not ('combat' = any (armed_channels))\n               or not (frame_keys && array['inventory', 'bank', 'equipment']::text[]), false));",
    repl: '      true);' },
  { name: 'grantClient', why: 'the party settle is granted to authenticated', expect: /self-check kg/,
    find: '-- ── §7 SELF-CHECK', repl: 'grant execute on function public.hr_party_tick_settle(text, uuid, timestamptz, timestamptz, uuid, jsonb) to authenticated;\n-- ── §7 SELF-CHECK' },
  { name: 'horizonPausesHunt', why: 'ruling (a) broken: a horizon drop ENDS the hunt for everyone instead of dropping one member', expect: /self-check (m1|m10)/, skipBase: true,
    find: '      if v_hunters < 2 then\n', repl: '      if v_hunters < 3 then\n' },
  { name: 'rejoinHeals', why: 'ruling (a) broken: the rejoin heals the member (hp not carried over)', expect: /self-check m2/, skipBase: true,
    find: '       set accrued_to = p_window_to, version = version + 1, updated_at = now()\n',
    repl: '       set accrued_to = p_window_to, version = version + 1, updated_at = now(), hp = max_hp\n' },
  { name: 'rejoinIgnoresClamp', why: 'ruling (a) broken: the 3/day clamp no longer holds a member out', expect: /self-check m11/, skipBase: true,
    find: '           and l.day_key = public.hr_utc_day_key(now())) >= c_max_drops_day then\n',
    repl: '           and l.day_key = public.hr_utc_day_key(now())) >= c_max_drops_day + 100 then\n' },
  { name: 'baseEdited', why: 'the restatement quietly edits a base line (the drop clamp 3/day -> 30/day)', expect: /^P-BASE/,
    find: '  c_max_drops_day constant int := 3;\n', repl: '  c_max_drops_day constant int := 30;\n' },
  { name: 'bodyDrift', why: 'an unreviewed edit inside a patch (the pins are left as written)', expect: /self-check k0/, keepPins: true,
    find: '  v_noown    jsonb;\n', repl: '  v_noown    jsonb;\n  v_unused   int;\n' },
];

console.log('\nworld-tick-m4-party-horizon --mutate: every mutant must go RED on its named arm');
const control = await tryApply(db, SQL);
if (control) { console.error(`harness: the unmutated file is red (${control})`); process.exit(2); }
console.log(`[mutants] ${MUTANTS.length}`);
let survived = 0;
for (const m of MUTANTS) {
  const n = SQL.split(m.find).length - 1;
  if (n !== 1) { console.error(`harness: ${m.name}: anchor matched ${n}x`); process.exit(2); }
  const mutated = CONTROL ? SQL : SQL.replace(m.find, () => m.repl);
  const cut = mutated.indexOf('-- ── §7 SELF-CHECK');
  const got = await tryApply(db, mutated.slice(0, cut), async () => {
    const pb = insertionRuns(BASE_SRC.settle, await srcOf(db, SIG.settle));
    // A mutant that edits a BASE line is caught here by P-BASE; `skipBase`
    // lets the one that must reach its behaviour arm (m6) get there.
    if (!m.skipBase && (!pb.subsequence || pb.runs !== SETTLE_RUNS)) return `P-BASE: subsequence ${pb.subsequence}, ${pb.runs} runs`;
    let self = mutated.slice(cut);
    if (!m.keepPins && !CONTROL) {
      // Re-pin §7's md5 constants to the bodies the mutant installed.
      const pins = { settle: 'c9a30a9e70be9e98ab4b823a3b1f2084', start: 'a80439260c833f6aa6b4d771d896075a', cap: '626637b7892eb85eccf34862ba82013a' };
      for (const k of Object.keys(pins)) self = self.split(pins[k]).join(await md5Of(db, SIG[k]));
    }
    try { await db.exec(self); return null; } catch (e) { return String(e.message).split('\n')[0]; }
  });
  const hit = got !== null && m.expect.test(got);
  console.log(`[mutant] ${m.name} ${hit ? 'caught' : 'survived'}`);
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via ${got}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: ${got === null ? 'SURVIVED' : `red only via ${got}`}`); }
}
await db.close();
if (CONTROL) {
  console.log(`\nHR_MUTANT_CONTROL: nothing planted; ${MUTANTS.length - survived} arm(s) read caught`);
  process.exit(survived === MUTANTS.length ? 0 : 1);
}
console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length} mutants red on their named arm`);
process.exit(survived ? 1 : 0);
