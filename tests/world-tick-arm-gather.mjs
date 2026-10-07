// ============================================================================
// tests/world-tick-arm-gather.mjs — THE M2 GATHER ARM FILE ARMS ONLY WHEN THE
//                                   ARMED GATHER CHANNEL WILL BE WATCHED
//
//   node tests/world-tick-arm-gather.mjs            the guard
//   node tests/world-tick-arm-gather.mjs --mutate   every mutant must go RED
//
// supabase/migrations/2026-10-07-world-tick-arm-gather.sql is EXCLUDED from the
// replay chain (arming is earned on live evidence), so nothing re-measured it:
// on 2026-10-07 16:34 UTC it raised ARM-S2 on prod because its P3 demanded a
// real return inside 15 min while F2b (2026-10-08-world-tick-party-fences.sql)
// unseats any armed sentinel with such a return inside the judged 2 h — no
// state could pass both. This guard replays the whole chain on PGlite, builds a
// live-shaped fixture (pinned-payload probes, 2 h of cron fires and shadow rows,
// one owned combat sentinel, 1..2 owned gatherers) and EXECUTES the arm file
// inside a transaction that is always rolled back.
//
//   A0  ★ the AS-FOUND P3 (15 min) with a return 5 min ago: arms, then ARM-S2
//          (the prod refusal, reproduced)
//   A1  ★ the AS-FOUND P3 with a return 2 h 05 min ago: ARM-P3 — so the old
//          file had NO arming state (the contradiction, executed)
//   N1  ★ return 5 min ago: ARM-P3 sentinel, BEFORE the write, naming a time
//   N2  return 90 min ago: ARM-P3 sentinel (the window is F2b's 2 h, not less)
//   N3  ★ return 2 h 05 min ago, quiet: ARMS, reads back {gather}
//   N4  return 4 h 05 min ago: ARM-P3 freshness (4 h bound)
//   N5  two gatherers, one online (5 min) one quiet (2 h 05): ARMS
//   N6  quiet, but a CRAFT client row 30 min ago: ARMS (only gather unseats)
//   N7  quiet, but gather restarted 1 h ago (active_since): ARM-P3 sentinel
//   N8  quiet, gather shadow under the floor: ARM-S2 (armed_stalled binds)
//   N9  quiet, combat sentinel restarted 1 h ago: ARM-S2 (combat unwatched)
//   N10 three owned gatherers: ARM-P3 cohort
//   N11 frame_push on: ARM-P1
//   N12 five probes: ARM-P2
//   N13 an off-pin probe opened in the last 24 h: ARM-P2
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const ARM = '2026-10-07-world-tick-arm-gather.sql';
const ARM_SQL = (await readFile(join(ROOT, 'supabase', 'migrations', ARM), 'utf8')).replace(/\r\n/g, '\n');
const PIN = '6205e4e03090aa64c8ad000a9efea43a249722207970b390715382e59fded362';
const OFFPIN = 'e545713b'.padEnd(64, '0');

const P3_AT = ARM_SQL.indexOf('  -- (P3)');
const P4_AT = ARM_SQL.indexOf('  -- (P4)');
if (P3_AT < 0 || P4_AT < P3_AT) { console.error('harness: arm file has no (P3)..(P4) block'); process.exit(2); }
/** The P3 block exactly as applied (and refused) at 2026-10-07 16:34 UTC, @4847d7b0. */
const AS_FOUND_P3 = `  -- (P3) as found @4847d7b0
  select count(*) into v_n from public.hr_tick_ownership o where o.owned and o.channel = 'gather';
  if v_n < 1 or v_n > 2 then
    raise exception 'ARM-P3: % owned gather rows (M2 stage allows 1..2; widening needs its own Security GO)', v_n;
  end if;
  if exists (select 1 from public.hr_tick_ownership o
               join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
              where o.owned and o.channel = 'gather' and ps.active_kind = 'gather'
                and (ps.accrued_to is null or ps.accrued_to < now() - interval '15 minutes')) then
    raise exception 'ARM-P3: an owned gatherer''s raw accrued_to is older than 15 min — do the fresh real return first';
  end if;

`;
const AS_FOUND_SQL = ARM_SQL.slice(0, P3_AT) + AS_FOUND_P3 + ARM_SQL.slice(P4_AT);

const UG = '00000000-0000-4000-8000-0000000a6101';
const UG2 = '00000000-0000-4000-8000-0000000a6102';
const UG3 = '00000000-0000-4000-8000-0000000a6103';
const UC = '00000000-0000-4000-8000-0000000a6104';

/**
 * One arm attempt on a fresh fixture, always rolled back.
 * @returns {Promise<string>} 'ARMED' or the first line of the refusal.
 */
async function attempt(db, sql, f) {
  const q = (s, p) => db.query(s, p);
  await db.exec('begin;');
  try {
    const gact = (await q("select activity_id from public.hr_activities where kind = 'gather' order by activity_id limit 1")).rows[0]?.activity_id;
    const cact = (await q("select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 1")).rows[0]?.activity_id;
    if (!gact || !cact) throw Object.assign(new Error('no gather/combat activity'), { harness: true });
    await db.exec(`update public.hr_tick_config set enabled = true, channels = array['combat','gather'],
                     armed_channels = '{}', flush_seconds = 90, cadence_seconds = 10,
                     frame_push = ${f.framePush ? 'true' : 'false'} where id;`);
    // Evidence: closed 4 h probes on the pin, opened > 24 h ago.
    await q(`insert into public.hr_tick_probe (user_id, slot, channel, holder, status, span_from, span_to,
                                               base_version, version_close, payload_open, payload_close,
                                               input, result, opened_at, closed_at)
             select $1::uuid, 0, 'gather', 'arm-guard', 'closed',
                    now() - make_interval(hours => 30 + g * 4), now() - make_interval(hours => 26 + g * 4),
                    1, 1, $2, $2, null, '{}'::jsonb,
                    now() - make_interval(hours => 30 + g * 4), now() - make_interval(hours => 26 + g * 4)
               from generate_series(1, $3::int) g`, [UG, PIN, f.probes ?? 7]);
    if (f.offPin) {
      await q(`insert into public.hr_tick_probe (user_id, slot, channel, holder, status, span_from, base_version,
                                                 payload_open, input, opened_at)
               values ($1::uuid, 0, 'gather', 'arm-guard', 'open', now() - interval '1 hour', 1, $2, '{}'::jsonb,
                       now() - interval '1 hour')`, [UG2, OFFPIN]);
    }
    const gatherers = f.gatherers ?? [{ u: UG, ret: f.ret }];
    for (const u of [UG, UG2, UG3, UC]) await db.exec(`insert into auth.users (id) values ('${u}') on conflict do nothing;`);
    for (const g of gatherers) {
      await q(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                                active_kind, active_id, active_since)
               values ($1, 0, 0, 0, 10, 10, 1, now() - $2::interval, 'gather', $3, now() - $4::interval)`,
        [g.u, g.ret, gact, g.since ?? '3 days']);
      await q("insert into public.hr_tick_ownership (user_id, slot, channel, owned) values ($1, 0, 'gather', true)", [g.u]);
      // The real return: a CLIENT accrue settle (no meta.src) at accrued_to.
      await q(`insert into public.player_ledger (user_id, slot, kind, intent, meta, at)
               values ($1, 0, 'gather', 'accrue', '{"qty":1}'::jsonb, now() - $2::interval)`, [g.u, g.ret]);
      if (f.craftRow) {
        await q(`insert into public.player_ledger (user_id, slot, kind, intent, meta, at)
                 values ($1, 0, 'craft', 'accrue', '{"qty":1}'::jsonb, now() - interval '30 minutes')`, [g.u]);
      }
    }
    await q(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                              active_kind, active_id, active_since)
             values ($1, 0, 0, 0, 10, 10, 1, now() - interval '5 minutes', 'combat', $2, now() - $3::interval)`,
      [UC, cact, f.combatSince ?? '3 days']);
    await q("insert into public.hr_tick_ownership (user_id, slot, channel, owned) values ($1, 0, 'combat', true)", [UC]);
    // 2 h of rostered fires, one per 10 s.
    await db.exec(`insert into public.hr_tick_cron_log (at, outcome, ms, rostered, effective_cadence_seconds)
                   select now() - make_interval(secs => g * 10), 'posted', 5, 2, 10 from generate_series(1, 719) g;`);
    const shadow = (u, ch, step) => q(`insert into public.hr_tick_shadow (at, user_id, slot, channel, holder,
                                         window_from, window_to, version, intent_id, delta)
             select now() - make_interval(secs => g * $3::int), $1::uuid, 0, $2, 'arm-guard',
                    now() - make_interval(secs => g * $3::int + 90), now() - make_interval(secs => g * $3::int),
                    1, gen_random_uuid(), '{}'::jsonb
               from generate_series(1, (7190 / $3::int)) g`, [u, ch, step]);
    await shadow(UC, 'combat', 90);
    await shadow(gatherers[0].u, 'gather', f.thinGather ? 700 : 90);

    try {
      await db.exec(sql);
      const back = (await q('select armed_channels from public.hr_tick_config where id')).rows[0].armed_channels;
      return JSON.stringify(back) === '["gather"]' ? 'ARMED' : `ARMED-WRONG ${JSON.stringify(back)}`;
    } catch (e) {
      if (e.harness) throw e;
      return String(e.message).split('\n')[0];
    }
  } finally {
    await db.exec('rollback;');
  }
}

const CASES = [
  { id: 'A0', sql: 'old', f: { ret: '5 minutes' }, want: /^ARM-S2: armed gather would go unjudged/,
    what: 'AS FOUND, return 5 min ago: passes P3, arms, refused at S2 (the prod refusal)' },
  { id: 'A1', sql: 'old', f: { ret: '2 hours 5 minutes' }, want: /^ARM-P3: .*older than 15 min/,
    what: 'AS FOUND, return 2 h 05 ago: refused at P3 — the old file could arm in NO state' },
  { id: 'N1', sql: 'new', f: { ret: '5 minutes' }, want: /^ARM-P3: no owned gatherer can be the armed sentinel.*earliest arm \d{4}-/,
    what: 'return 5 min ago: refused at P3c before the write, earliest arm time named' },
  { id: 'N2', sql: 'new', f: { ret: '90 minutes' }, want: /^ARM-P3: no owned gatherer can be the armed sentinel/,
    what: 'return 90 min ago: still inside F2b\'s 2 h window, refused at P3c' },
  { id: 'N3', sql: 'new', f: { ret: '2 hours 5 minutes' }, want: /^ARMED$/,
    what: 'return 2 h 05 ago, offline since: ARMS, reads back {gather}' },
  { id: 'N4', sql: 'new', f: { ret: '4 hours 5 minutes' }, want: /^ARM-P3: .*older than 4 h/,
    what: 'return 4 h 05 ago: refused at P3b (4 h stage bound)' },
  { id: 'N5', sql: 'new', f: { gatherers: [{ u: UG2, ret: '2 hours 5 minutes' }, { u: UG, ret: '5 minutes' }] }, want: /^ARMED$/,
    what: 'two gatherers, one online (5 min), one quiet (2 h 05): ARMS on the quiet sentinel' },
  { id: 'N6', sql: 'new', f: { ret: '2 hours 5 minutes', craftRow: true }, want: /^ARMED$/,
    what: 'quiet on gather, a CRAFT client row 30 min ago: ARMS (F2b keys on the channel kind)' },
  { id: 'N7', sql: 'new', f: { gatherers: [{ u: UG, ret: '2 hours 5 minutes', since: '1 hour' }] }, want: /^ARM-P3: no owned gatherer can be the armed sentinel/,
    what: 'quiet, but gather restarted 1 h ago: refused at P3c' },
  { id: 'N8', sql: 'new', f: { ret: '2 hours 5 minutes', thinGather: true }, want: /^ARM-S2: combat shadow unwatched, or a stall .*"armed_stalled": true/,
    what: 'quiet, gather shadow under the floor: refused at S2 (armed_stalled still binds)' },
  { id: 'N9', sql: 'new', f: { ret: '2 hours 5 minutes', combatSince: '1 hour' }, want: /^ARM-S2: combat shadow unwatched/,
    what: 'quiet, combat sentinel restarted 1 h ago: refused at S2 (combat unwatched)' },
  { id: 'N10', sql: 'new', f: { gatherers: [UG, UG2, UG3].map((u) => ({ u, ret: '2 hours 5 minutes' })) }, want: /^ARM-P3: 3 owned gather rows/,
    what: 'three owned gatherers: refused at P3a (cohort)' },
  { id: 'N11', sql: 'new', f: { ret: '2 hours 5 minutes', framePush: true }, want: /^ARM-P1: frame_push is on/,
    what: 'frame_push on: refused at P1' },
  { id: 'N12', sql: 'new', f: { ret: '2 hours 5 minutes', probes: 5 }, want: /^ARM-P2: 5 closed gather probes/,
    what: 'five probes: refused at P2' },
  { id: 'N13', sql: 'new', f: { ret: '2 hours 5 minutes', offPin: true }, want: /^ARM-P2: a probe in the last 24 h ran on another payload/,
    what: 'an off-pin probe opened 1 h ago: refused at P2' },
];

async function arms(db, newSql, { log = true } = {}) {
  const red = [];
  for (const c of CASES) {
    const got = await attempt(db, c.sql === 'old' ? AS_FOUND_SQL : newSql, c.f);
    const pass = c.want.test(got);
    if (!pass) red.push(c.id);
    if (log) console.log(`  ${pass ? '✓' : '✗'} ${c.id} — ${c.what}${pass ? '' : `: got ${got}`}`);
  }
  return red;
}

let db;
try { ({ db } = await bootReplay({})); } catch (e) {
  console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2);
}

if (!MUTATE) {
  console.log('\nworld-tick-arm-gather: the gather arm arms only when the armed channel will be judged');
  let red;
  try { red = await arms(db, ARM_SQL); } catch (e) {
    if (e.harness) { console.error(`harness: ${e.message}`); process.exit(2); }
    throw e;
  }
  console.log(red.length ? `\nRED: ${red.join(', ')}` : '\nGREEN: the arm file has an arming state, refuses the old contradictory one at P3c, and keeps every P/S refusal');
  process.exit(red.length ? 1 : 0);
}

// ── --mutate: the arm file's own text with one control broken.
const MUTANTS = [
  { name: 'noSentinelPrecheck', why: 'P3c removed: a fresh return reaches the write and only S2 refuses', expect: /N1|N2|N7/,
    find: /  if not exists \(\n    select 1\n      from public\.hr_tick_ownership o[\s\S]*?\n  end if;\n/, repl: '' },
  { name: 'freshness15min', why: 'P3b reverted to 15 min: the contradiction is back, no state arms', expect: /N3/,
    find: "ps.accrued_to < now() - interval '4 hours'", repl: "ps.accrued_to < now() - interval '15 minutes'" },
  { name: 'noFreshnessBound', why: 'P3b unbounded: a stale cohort arms', expect: /N4/,
    find: "ps.accrued_to < now() - interval '4 hours'", repl: "ps.accrued_to < now() - interval '400 hours'" },
  { name: 'sentinelWindow1h', why: 'P3c judges 1 h, F2b judges 2 h: S2 refuses after the write', expect: /N2/,
    find: "pl.at >= now() - interval '2 hours' and pl.at < now()", repl: "pl.at >= now() - interval '1 hour' and pl.at < now()" },
  { name: 'sentinelAnyKind', why: 'P3c unseated by a client row of any kind', expect: /N6/,
    find: "                and pl.kind = 'gather'\n", repl: '' },
  { name: 'sentinelIgnoresRestart', why: 'P3c ignores active_since', expect: /N7/,
    find: "       and ps.active_since <= now() - interval '2 hours'\n", repl: '' },
  { name: 's2NoArmedVerdict', why: 'P3c AND the S2 armed-verdict check removed: an unwatched gather arms (S2 is the backstop)', expect: /N1/,
    find: /  if not exists \(\n    select 1\n      from public\.hr_tick_ownership o[\s\S]*?\n  end if;\n/, repl: '',
    then: ["  if coalesce((v_stall->>'armed_judged')::boolean, false) is not true\n     or coalesce((v_stall->>'armed_stalled')::boolean, true) is not false then",
      '  if false then'] },
  { name: 's2NoStall', why: 'S2 no longer reads the union stall verdict (armed_stalled reaches only the union)', expect: /N8/,
    find: "     or coalesce((v_stall->>'stalled')::boolean, true) is not false then\n    raise exception 'ARM-S2: combat",
    repl: "     then\n    raise exception 'ARM-S2: combat",
    then: ["  if coalesce((v_stall->>'armed_judged')::boolean, false) is not true\n     or coalesce((v_stall->>'armed_stalled')::boolean, true) is not false then",
      "  if coalesce((v_stall->>'armed_judged')::boolean, false) is not true then"] },
  { name: 'noCohortCap', why: 'P3a widened silently', expect: /N10/,
    find: 'if v_n < 1 or v_n > 2 then', repl: 'if v_n < 1 or v_n > 20 then' },
];
console.log('\nworld-tick-arm-gather --mutate: every mutant must go RED on its named arm');
let survived = 0;
for (const m of MUTANTS) {
  const n = typeof m.find === 'string' ? ARM_SQL.split(m.find).length - 1 : (ARM_SQL.match(new RegExp(m.find.source, 'g')) || []).length;
  if (n !== 1) { console.error(`harness: ${m.name}: anchor matched ${n}x`); process.exit(2); }
  let sql = ARM_SQL.replace(m.find, () => m.repl);
  if (m.then) {
    if (sql.split(m.then[0]).length !== 2) { console.error(`harness: ${m.name}: second anchor`); process.exit(2); }
    sql = sql.replace(m.then[0], () => m.then[1]);
  }
  let red;
  try { red = await arms(db, sql, { log: false }); } catch (e) {
    if (e.harness) { console.error(`harness: ${m.name}: ${e.message}`); process.exit(2); }
    red = [`threw: ${e.message}`];
  }
  const hit = red.some((id) => m.expect.test(id));
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via ${red.join(', ')}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: ${red.length ? `red only via ${red.join(', ')}` : 'SURVIVED'}`); }
}
console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length} mutants red on their named arm`);
process.exit(survived ? 1 : 0);
