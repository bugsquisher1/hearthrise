// ============================================================================
// tests/world-tick-arm-combat.mjs — THE M4 COMBAT ARM FILE ARMS ONLY ON ITS
//                                   EVIDENCE, ITS COHORT AND A WATCHED SENTINEL
//
//   node tests/world-tick-arm-combat.mjs            the guard
//   node tests/world-tick-arm-combat.mjs --mutate   every mutant must go RED
//
// supabase/migrations/2026-10-14-world-tick-arm-combat.sql is EXCLUDED from the
// replay chain (arming is earned on live evidence), so nothing else executes
// it. This guard replays the whole chain on PGlite (2026-10-14-world-tick-m4-
// party-horizon.sql and the hunts catalogue included), builds a live-shaped
// fixture — gather ARMED with its tick rows, 4 closed combat probes on a pin
// with stored input + seed (one on a named hunt, two that ate, two that died),
// 2 h of cron fires and combat shadow rows, one owned combat sentinel with a
// real return — and EXECUTES the arm file inside a transaction that is always
// rolled back. The committed file carries the placeholder pin and replayed
// set; every case but C1/C1b runs it with a test pin and the fixture's own
// attested `id:digest` pairs substituted (REPLAY_DIGEST_SQL from
// tests/world-tick-combat-replay.mjs), exactly the GO commit's one edit.
//
// P2 is Security's R4 (GO-WITH-CHANGES 2026-10-14): >= 4 replayed probes on the
// pin with stored input, >= 2 ate, >= 2 deaths, >= 1 named hunt; the 12-probe /
// 48 h floor is gone.
//
//   C0  ★ 4 probes meeting every minimum, return 2 h 05 ago, quiet: ARMS
//   C1  ★ the file AS COMMITTED (placeholder pin + set): ARM-P0
//   C1b the pin filled, the replayed set still the placeholder: ARM-P0
//   C2  ★ return 5 min ago: ARM-P3 sentinel, BEFORE the write, naming a time
//   C3  return 90 min ago: ARM-P3 sentinel (F2b's 2 h, not less)
//   C4  return 4 h 05 ago: ARM-P3 freshness
//   C5  3 probes: ARM-P2 on the count
//   C19 only 1 probe ate: ARM-P2
//   C22 only 1 probe died: ARM-P2
//   C23 no probe on a named hunt: ARM-P2
//   C24 an unattested probe (not replayed by the guard) is not counted: ARM-P2
//   C25 an attested probe changed after the replay: ARM-P2 (present and unchanged)
//   C26 no hunt catalogue installed: ARM-P2
//   C20 the frac-keys party settle (no cohort, no party 8d): ARM-P4
//   C21 the start-gate hunt start (no cohort gate): ARM-P4
//   The committed file may carry the placeholders OR the Security-filled
//   lines; C1/C1b always run with the placeholders put back.
//   C6  the newest probe CLOSED on another payload (a deploy mid-probe): 3
//       counted, ARM-P2
//   C7  a gather probe on another payload opened inside the evidence: ARM-P2
//   C8  a probe without stored input is not counted (3 left): ARM-P2
//   C9  two owned combat characters: ARM-P3 cohort
//   C10 a live party hunt: ARM-P3
//   C11 combat already armed: ARM-P1
//   C12 frame_push on: ARM-P1
//   C13 quiet, but a CRAFT client row 30 min ago: ARMS (F2b keys on the kind)
//   C14 quiet, but < 1 h of presence horizon left: ARM-P3 sentinel
//   C15 hr_accrue_cap_ms still short-circuits partied: ARM-P4
//   C16 quiet, but combat restarted 1 h ago (active_since): ARM-P3 sentinel
//   C17 quiet, combat shadow under the floor: ARM-P4 (not watched healthy)
//   C18 the newest combat probe is on another payload: ARM-P2
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { REPLAY_DIGEST_SQL } from './world-tick-combat-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const ARM = '2026-10-14-world-tick-arm-combat.sql';
const ARM_SQL = (await readFile(join(ROOT, 'supabase', 'migrations', ARM), 'utf8')).replace(/\r\n/g, '\n');
const HORIZON_SQL = (await readFile(join(ROOT, 'supabase', 'migrations', '2026-10-10-world-tick-presence-horizon.sql'), 'utf8')).replace(/\r\n/g, '\n');
const DROP_SQL = (await readFile(join(ROOT, 'supabase', 'migrations', '2026-10-08-world-tick-party-drop.sql'), 'utf8')).replace(/\r\n/g, '\n');
const GATE_SQL = (await readFile(join(ROOT, 'supabase', 'migrations', '2026-10-09-party-hunt-start-gate.sql'), 'utf8')).replace(/\r\n/g, '\n');
const PLACEHOLDER = "c_pin   constant text := 'SET-AT-SECURITY-GO';";
const REPLAYED_PLACEHOLDER = "c_replayed constant text[] := array['SET-AT-SECURITY-GO']::text[];";
const PIN = 'c0b4a7'.padEnd(64, 'e');
const OFFPIN = 'bb1c64e2'.padEnd(64, '0');
/* The committed file carries EITHER the placeholders (staged) OR the real pin
   and replayed set (the Security GO commit fills them — Security #2: the guard
   must stay green on that commit). Every case runs with the test pin and the
   fixture's own attested set; C1/C1b run with placeholders put back, so "an
   unfilled file never arms" is proven either way. */
const PIN_LINE = /c_pin   constant text := '(SET-AT-SECURITY-GO|[0-9a-f]{64})';/g;
const REPLAYED_LINE = /c_replayed constant text\[\] := array\[[^\]]*\]::text\[\];/g;
if ((ARM_SQL.match(PIN_LINE) || []).length !== 1 || (ARM_SQL.match(REPLAYED_LINE) || []).length !== 1) {
  console.error('harness: the arm file does not carry exactly one c_pin line and one c_replayed line'); process.exit(2);
}
const withPin = (sql) => sql.replace(PIN_LINE, () => `c_pin   constant text := '${PIN}';`);
const withReplayed = (sql, pairs) => sql.replace(REPLAYED_LINE,
  () => `c_replayed constant text[] := array[${pairs.map((x) => `'${x}'`).join(', ')}]::text[];`);
const asCommittedUnfilled = (sql) => sql.replace(PIN_LINE, () => PLACEHOLDER).replace(REPLAYED_LINE, () => REPLAYED_PLACEHOLDER);
const replayedUnfilled = (sql) => sql.replace(REPLAYED_LINE, () => REPLAYED_PLACEHOLDER);

/* The fixture's evidence, newest first (each 4 h, back to back, the newest
   closing 1 h ago): the minimum R4 asks for and nothing more. */
const PROBES = Object.freeze([
  Object.freeze({ act: 'mill_cellar', ate: 3, deaths: 1 }),   // named hunt, ate, died
  Object.freeze({ act: 'slime', ate: 2, deaths: 0 }),         // ate
  Object.freeze({ act: 'slime', ate: 0, deaths: 2 }),         // died
  Object.freeze({ act: 'slime', ate: 0, deaths: 0 }),         // the fourth
]);
const probesWith = (i, over) => PROBES.map((p, k) => (k === i ? Object.assign({}, p, over) : p));

/** A whole `create or replace function public.<name>(` statement out of a migration, any dollar tag. */
function fnStatement(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const tag = start < 0 ? null : sql.slice(start).match(/\sas (\$[a-z_]*\$)/i);
  if (!tag) throw Object.assign(new Error(`${name} not found`), { harness: true });
  const bodyAt = start + tag.index + tag[0].length;
  const end = sql.indexOf(`${tag[1]};`, bodyAt);
  if (end < 0) throw Object.assign(new Error(`${name}: no closing ${tag[1]}`), { harness: true });
  return sql.slice(start, end + tag[1].length + 1);
}
/** The presence-horizon body of hr_accrue_cap_ms (with the partied short-circuit) — C15. */
const capWithShortCircuit = () => fnStatement(HORIZON_SQL, 'hr_accrue_cap_ms');
/** The frac-keys party settle (party-drop's body + the two remainder keys): no cohort, no (8d) — C20. */
function settleWithoutCohort() {
  const anchor = "    'consec_falls','deaths','progress','hearthfind','tool_carry','journal'];";
  const s = fnStatement(DROP_SQL, 'hr_party_tick_settle');
  if (s.split(anchor).length !== 2) throw Object.assign(new Error('party-drop c_delta_ok anchor'), { harness: true });
  return s.replace(anchor, () => "    'consec_falls','deaths','progress','hearthfind','tool_carry','journal','xp_frac','companion_xp_frac'];");
}
/** The live start-gate hr_party_hunt_start: armed gate, no cohort gate — C21. */
const startWithoutCohort = () => fnStatement(GATE_SQL, 'hr_party_hunt_start');

const UC = '00000000-0000-4000-8000-0000000c4101';
const UC2 = '00000000-0000-4000-8000-0000000c4102';
const UG = '00000000-0000-4000-8000-0000000c4103';

/** One arm attempt on a fresh fixture, always rolled back. Returns 'ARMED' or the first refusal line. */
async function attempt(db, sql, f) {
  const q = (s, p) => db.query(s, p);
  await db.exec('begin;');
  try {
    const gact = (await q("select activity_id from public.hr_activities where kind = 'gather' order by activity_id limit 1")).rows[0]?.activity_id;
    const cact = (await q("select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 1")).rows[0]?.activity_id;
    if (!gact || !cact) throw Object.assign(new Error('no gather/combat activity'), { harness: true });
    await db.exec(`update public.hr_tick_config set enabled = true, channels = array['combat','gather'],
                     armed_channels = ${f.combatArmed ? "array['gather','combat']" : "array['gather']"},
                     flush_seconds = 90, cadence_seconds = 10,
                     frame_push = ${f.framePush ? 'true' : 'false'} where id;`);
    for (const u of [UC, UC2, UG]) await db.exec(`insert into auth.users (id) values ('${u}') on conflict do nothing;`);
    // Evidence: closed combat probes back to back on the pin, the newest (index 0)
    // closing 1 h ago, then the one open now (the live payload).
    const probes = f.probes || PROBES;
    const ids = [];
    for (let g = 0; g < probes.length; g++) {
      const p = probes[g];
      const r = (await q(`insert into public.hr_tick_probe (user_id, slot, channel, holder, status, span_from, span_to,
                                               base_version, version_close, payload_open, payload_close,
                                               input, seed, result, opened_at, closed_at)
             values ($1::uuid, 0, 'combat', 'arm-guard', 'closed',
                     now() - interval '1 hour' - make_interval(hours => 4 * ($3::int + 1)),
                     now() - interval '1 hour' - make_interval(hours => 4 * $3::int),
                     1, 1, $2, $4, $5::jsonb, case when $5::jsonb is null then null else 7 end, $6::jsonb,
                     now() - interval '1 hour' - make_interval(hours => 4 * ($3::int + 1)),
                     now() - interval '1 hour' - make_interval(hours => 4 * $3::int))
             returning id`,
      [UC, PIN, g, p.closeOffPin ? OFFPIN : PIN, p.noInput ? null : JSON.stringify({ activeId: p.act }),
        JSON.stringify({ ate: p.ate, deaths: p.deaths, gold: 100 })])).rows[0].id;
      ids.push(Number(r));
    }
    await q(`insert into public.hr_tick_probe (user_id, slot, channel, holder, status, span_from, base_version,
                                               payload_open, input, opened_at)
             values ($1::uuid, 0, 'combat', 'arm-guard', 'open', now() - interval '1 hour', 1, $2, '{}'::jsonb,
                     now() - interval '1 hour')`, [UC2, f.newestOffPin ? OFFPIN : PIN]);
    if (f.offPin) {
      await q(`insert into public.hr_tick_probe (user_id, slot, channel, holder, status, span_from, span_to,
                                                 base_version, version_close, payload_open, payload_close,
                                                 input, result, opened_at, closed_at)
               values ($1::uuid, 0, 'gather', 'arm-guard', 'closed', now() - interval '10 hours', now() - interval '6 hours',
                       1, 1, $2, $2, null, '{}'::jsonb, now() - interval '10 hours', now() - interval '6 hours')`, [UG, OFFPIN]);
    }
    // What tests/world-tick-combat-replay.mjs --live --attest would print for these
    // rows: every closed combat probe's id:digest, minus the ones it did not replay.
    const unattested = (f.unattest || []).map((g) => ids[g]);
    const pairs = (await q(`select coalesce(array_agg(p.id::text || ':' || ${REPLAY_DIGEST_SQL} order by p.id), '{}') as a
                              from public.hr_tick_probe p
                             where p.channel = 'combat' and p.status = 'closed' and not (p.id = any ($1::bigint[]))`,
    [unattested])).rows[0].a;
    if (f.changeAfter != null) {
      await q("update public.hr_tick_probe set result = result || '{\"gold\": 101}'::jsonb where id = $1", [ids[f.changeAfter]]);
    }
    if (f.noHunts) await db.exec('drop table public.hr_hunt_spawns, public.hr_hunts cascade;');
    sql = f.replayedUnfilled ? sql : withReplayed(sql, pairs);
    // The combat sentinel (QA slot 1's shape): on combat for days, a real return `ret` ago.
    const combat = [{ u: UC, ret: f.ret, since: f.combatSince ?? '3 days' }];
    if (f.twoCombat) combat.push({ u: UC2, ret: f.ret, since: '3 days' });
    for (const c of combat) {
      await q(`insert into public.player_state (user_id, slot, gold, hp, max_hp, version, accrued_to,
                                                active_kind, active_id, active_since)
               values ($1, 0, 0, 10, 10, 1, now() - $2::interval, 'combat', $3, now() - $4::interval)`,
        [c.u, c.ret, cact, c.since]);
      await q("insert into public.hr_tick_ownership (user_id, slot, channel, owned) values ($1, 0, 'combat', true)", [c.u]);
      await q(`insert into public.player_ledger (user_id, slot, kind, intent, meta, at)
               values ($1, 0, 'combat', 'accrue', '{"ticks":1}'::jsonb, now() - $2::interval)`, [c.u, c.ret]);
      if (f.craftRow) {
        await q(`insert into public.player_ledger (user_id, slot, kind, intent, meta, at)
                 values ($1, 0, 'craft', 'accrue', '{"qty":1}'::jsonb, now() - interval '30 minutes')`, [c.u]);
      }
    }
    if (f.anchorAge) {
      await q('update public.hr_return_anchor set real_return_at = now() - $2::interval where user_id = $1 and slot = 0',
        [UC, f.anchorAge]);
    }
    // The ARMED gatherer (QA slot 2's shape): quiet, paid by the tick every 90 s.
    await q(`insert into public.player_state (user_id, slot, gold, hp, max_hp, version, accrued_to,
                                              active_kind, active_id, active_since)
             values ($1, 0, 0, 10, 10, 1, now() - interval '1 minute', 'gather', $2, now() - interval '3 days')`, [UG, gact]);
    await q("insert into public.hr_tick_ownership (user_id, slot, channel, owned) values ($1, 0, 'gather', true)", [UG]);
    await q(`insert into public.player_ledger (user_id, slot, kind, intent, meta, at)
             select $1::uuid, 0, 'gather', 'accrue', '{"src":"tick","qty":1}'::jsonb, now() - make_interval(secs => g * 90)
               from generate_series(1, 80) g`, [UG]);
    if (f.partyHunt) {
      const p = (await q('insert into public.party (leader_user, leader_slot) values ($1, 0) returning id', [UG])).rows[0].id;
      await q('insert into public.party_hunt (party_id, active_id, accrued_to) values ($1, $2, now() - interval \'1 minute\')', [p, cact]);
    }
    if (f.capShort) await db.exec(capWithShortCircuit());
    if (f.settleNoCohort) await db.exec(settleWithoutCohort());
    if (f.startNoCohort) await db.exec(startWithoutCohort());
    // 2 h of rostered fires, one per 10 s, and the combat shadow every 90 s (thin: every 700 s).
    await db.exec(`insert into public.hr_tick_cron_log (at, outcome, ms, rostered, effective_cadence_seconds)
                   select now() - make_interval(secs => g * 10), 'posted', 5, 2, 10 from generate_series(1, 719) g;`);
    const step = f.thinCombat ? 700 : 90;
    await q(`insert into public.hr_tick_shadow (at, user_id, slot, channel, holder, window_from, window_to,
                                                version, intent_id, delta)
             select now() - make_interval(secs => g * $2::int), $1::uuid, 0, 'combat', 'arm-guard',
                    now() - make_interval(secs => g * $2::int + 90), now() - make_interval(secs => g * $2::int),
                    1, gen_random_uuid(), '{}'::jsonb
               from generate_series(1, (7190 / $2::int)) g`, [UC, step]);

    try {
      await db.exec(sql);
      const back = (await q('select armed_channels from public.hr_tick_config where id')).rows[0].armed_channels;
      return JSON.stringify(back) === '["gather","combat"]' ? 'ARMED' : `ARMED-WRONG ${JSON.stringify(back)}`;
    } catch (e) {
      if (e.harness) throw e;
      return String(e.message).split('\n')[0];
    }
  } finally {
    await db.exec('rollback;');
  }
}

const QUIET = '2 hours 5 minutes';
const CASES = [
  { id: 'C0', f: { ret: QUIET }, want: /^ARMED$/,
    what: '4 replayed probes (2 ate, 2 died, 1 named hunt), return 2 h 05 ago, offline since: ARMS, reads back {gather,combat}' },
  { id: 'C1', committed: true, f: { ret: QUIET }, want: /^ARM-P0: c_pin is not a 64-hex/, what: 'the file AS COMMITTED (placeholder pin + set): refused at P0' },
  { id: 'C1b', f: { ret: QUIET, replayedUnfilled: true }, want: /^ARM-P0: c_replayed is not a list of/,
    what: 'the pin filled but the replayed set still the placeholder: refused at P0' },
  { id: 'C2', f: { ret: '5 minutes' }, want: /^ARM-P3: the owned combat character cannot be the armed sentinel.*earliest arm \d{4}-/,
    what: 'return 5 min ago: refused at P3c before the write, earliest arm time named' },
  { id: 'C3', f: { ret: '90 minutes' }, want: /^ARM-P3: the owned combat character cannot be the armed sentinel/,
    what: 'return 90 min ago: still inside F2b\'s 2 h window, refused at P3c' },
  { id: 'C4', f: { ret: '4 hours 5 minutes' }, want: /^ARM-P3: .*older than 4 h/, what: 'return 4 h 05 ago: refused at P3b (4 h bound)' },
  { id: 'C5', f: { ret: QUIET, probes: PROBES.slice(0, 3) }, want: /^ARM-P2: 3 replayed closed combat probes with stored input on the pin \(2 ate, 2 with a death, 1 on a named hunt\)/,
    what: '3 probes (every other minimum met): refused at P2 on the COUNT' },
  { id: 'C19', f: { ret: QUIET, probes: probesWith(1, { ate: 0 }) }, want: /^ARM-P2: 4 replayed .*\(1 ate, 2 with a death, 1 on a named hunt\)/,
    what: 'only 1 probe ate: refused at P2' },
  { id: 'C22', f: { ret: QUIET, probes: probesWith(2, { deaths: 0 }) }, want: /^ARM-P2: 4 replayed .*\(2 ate, 1 with a death, 1 on a named hunt\)/,
    what: 'only 1 probe died: refused at P2' },
  { id: 'C23', f: { ret: QUIET, probes: probesWith(0, { act: 'slime' }) }, want: /^ARM-P2: 4 replayed .*\(2 ate, 2 with a death, 0 on a named hunt\)/,
    what: 'no probe on a named hunt: refused at P2' },
  { id: 'C24', f: { ret: QUIET, unattest: [3] }, want: /^ARM-P2: 3 replayed closed combat probes/,
    what: 'a probe the replay guard did not attest is not counted (3 left): refused at P2' },
  { id: 'C25', f: { ret: QUIET, probes: [...PROBES, { act: 'slime', ate: 0, deaths: 0 }], changeAfter: 4 },
    want: /^ARM-P2: 4 of 5 replayed probes are present and unchanged/,
    what: '5 attested probes, one changed after the replay (4 would still count): refused at P2 integrity' },
  { id: 'C26', f: { ret: QUIET, noHunts: true }, want: /^ARM-P2: no hunt catalogue/,
    what: 'no hunt catalogue installed: refused at P2' },
  { id: 'C20', f: { ret: QUIET, settleNoCohort: true }, want: /^ARM-P4: hr_party_tick_settle lacks the M4 cohort\/horizon fences/,
    what: 'the frac-keys party settle (no cohort, no party 8d) is installed: refused at P4 (Security #3)' },
  { id: 'C21', f: { ret: QUIET, startNoCohort: true }, want: /^ARM-P4: hr_party_hunt_start lacks the armed gate or the cohort gate/,
    what: 'the start-gate hr_party_hunt_start (no cohort gate) is installed: refused at P4 (Security #3)' },
  { id: 'C6', f: { ret: QUIET, probes: probesWith(3, { closeOffPin: true }) }, want: /^ARM-P2: 3 replayed closed combat probes/,
    what: 'one probe opened on the pin but CLOSED on another payload: 3 counted, refused at P2' },
  { id: 'C7', f: { ret: QUIET, offPin: true }, want: /^ARM-P2: a probe opened since .* ran on another payload/,
    what: 'a gather probe on another payload inside the evidence: refused at P2' },
  { id: 'C8', f: { ret: QUIET, probes: probesWith(3, { noInput: true }) }, want: /^ARM-P2: 3 replayed closed combat probes/,
    what: 'a probe without stored input (attested anyway) is not counted (3 left): refused at P2' },
  { id: 'C9', f: { ret: QUIET, twoCombat: true }, want: /^ARM-P3: 2 owned combat rows/, what: 'two owned combat characters: refused at P3a' },
  { id: 'C10', f: { ret: QUIET, partyHunt: true }, want: /^ARM-P3: a party hunt is live/, what: 'a live party hunt: refused at P3a' },
  { id: 'C11', f: { ret: QUIET, combatArmed: true }, want: /^ARM-P1: armed_channels is \{gather,combat\}/, what: 'combat already armed: refused at P1' },
  { id: 'C12', f: { ret: QUIET, framePush: true }, want: /^ARM-P1: frame_push is on/, what: 'frame_push on: refused at P1' },
  { id: 'C13', f: { ret: QUIET, craftRow: true }, want: /^ARMED$/, what: 'quiet on combat, a CRAFT client row 30 min ago: ARMS (F2b keys on the kind)' },
  { id: 'C14', f: { ret: QUIET, anchorAge: '11 hours 30 minutes' }, want: /^ARM-P3: the owned combat character cannot be the armed sentinel/,
    what: 'quiet, but its presence horizon is 30 min away: refused at P3c' },
  { id: 'C15', f: { ret: QUIET, capShort: true }, want: /^ARM-P4: hr_accrue_cap_ms still short-circuits/, what: 'the partied cap short-circuit is back: refused at P4' },
  { id: 'C16', f: { ret: QUIET, combatSince: '1 hour' }, want: /^ARM-P3: the owned combat character cannot be the armed sentinel/,
    what: 'quiet, but combat restarted 1 h ago: refused at P3c' },
  { id: 'C17', f: { ret: QUIET, thinCombat: true }, want: /^ARM-P4: the combat shadow is not watched, not judging, or stalled/,
    what: 'quiet, combat shadow under the floor: refused at P4' },
  { id: 'C18', f: { ret: QUIET, newestOffPin: true }, want: /^ARM-P2: a probe opened since .* ran on another payload|^ARM-P2: the newest combat probe is not on the pin/,
    what: 'the newest combat probe is on another payload: refused at P2' },
];

async function arms(db, sql, { log = true } = {}) {
  const red = [];
  for (const c of CASES) {
    const got = c.committed
      ? await attempt(db, asCommittedUnfilled(sql), Object.assign({}, c.f, { replayedUnfilled: true }))
      : await attempt(db, withPin(c.f.replayedUnfilled ? replayedUnfilled(sql) : sql), c.f);
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
  console.log('\nworld-tick-arm-combat: the combat arm arms only on its evidence, its cohort and a watched sentinel');
  let red;
  try { red = await arms(db, ARM_SQL); } catch (e) {
    if (e.harness) { console.error(`harness: ${e.message}`); process.exit(2); }
    throw e;
  }
  await db.close();
  console.log(red.length ? `\nRED: ${red.join(', ')}`
    : '\nGREEN: the arm file arms 2-4 h after a real return on 4 replayed probes meeting R4, refuses an unfilled pin or set, and keeps every P/S refusal');
  process.exit(red.length ? 1 : 0);
}

// ── --mutate: the arm file's own text with one control broken.
const P3C = /  if not exists \(\n    select 1\n      from public\.hr_tick_ownership o\n      join public\.player_state ps[\s\S]*?earliest arm %',[\s\S]*?\n  end if;\n/;
const MUTANTS = [
  { name: 'noPinGuard', why: 'P0 removed: the placeholder reaches P2 (an unfilled file is one edit from arming on a guess)', expect: /C1/,
    find: "  if c_pin !~ '^[0-9a-f]{64}$' then\n", repl: '  if false then\n' },
  { name: 'noSentinelPrecheck', why: 'P3c removed: a fresh return reaches the write and only S2 refuses', expect: /C2|C3|C16/,
    find: P3C, repl: '' },
  { name: 'freshness15min', why: 'P3b at 15 min: the gather contradiction, no state arms', expect: /C0/,
    find: "ps.accrued_to < now() - interval '4 hours'", repl: "ps.accrued_to < now() - interval '15 minutes'" },
  { name: 'noFreshnessBound', why: 'P3b unbounded: a stale sentinel arms (a 24 h catch-up)', expect: /C4/,
    find: "ps.accrued_to < now() - interval '4 hours'", repl: "ps.accrued_to < now() - interval '400 hours'" },
  { name: 'sentinelWindow1h', why: 'P3c judges 1 h, F2b judges 2 h: S2 refuses after the write', expect: /C3/,
    find: "pl.at >= now() - interval '2 hours' and pl.at < now()", repl: "pl.at >= now() - interval '1 hour' and pl.at < now()" },
  { name: 'sentinelAnyKind', why: 'P3c unseated by a client row of any kind', expect: /C13/,
    find: "                and pl.kind = 'combat'\n                and pl.meta", repl: '                and pl.meta' },
  { name: 'sentinelIgnoresRestart', why: 'P3c ignores active_since', expect: /C16/,
    find: "       and ps.active_since <= now() - interval '2 hours'\n", repl: '' },
  { name: 'sentinelIgnoresHorizon', why: 'P3c arms a sentinel about to park at its presence horizon', expect: /C14/,
    find: "           > now() + interval '1 hour'\n", repl: "           > now() - interval '100 hours'\n" },
  { name: 's2NoArmedVerdict', why: 'P3c AND the S2 armed-combat verdict removed: an unwatched combat arms (S2 is the backstop)', expect: /C2/,
    find: P3C, repl: '',
    then: ["  if v_ent is null\n     or coalesce((v_ent->>'judged')::boolean, false) is not true\n     or coalesce((v_ent->>'stalled')::boolean, true) is not false then",
      '  if false then'] },
  { name: 'noCohortCap', why: 'P3a widened silently', expect: /C9/, find: '  if v_n <> 1 then\n', repl: '  if v_n < 1 or v_n > 20 then\n' },
  { name: 'noPartyCheck', why: 'P3a ignores a live party hunt', expect: /C10/,
    find: '  if exists (select 1 from public.party_hunt h where h.ended_at is null) then\n', repl: '  if false then\n' },
  { name: 'probeFloor3', why: 'P2 floor at 3 probes (R4 says 4)', expect: /^C5$/,
    find: '  if v_n < 4 or v_ate < 2 or v_dead < 2 or v_hunt < 1 then\n', repl: '  if v_n < 3 or v_ate < 2 or v_dead < 2 or v_hunt < 1 then\n' },
  { name: 'ateFloor1', why: 'P2 accepts one eating probe (R4 says 2)', expect: /^C19$/,
    find: '  if v_n < 4 or v_ate < 2 or v_dead < 2 or v_hunt < 1 then\n', repl: '  if v_n < 4 or v_ate < 1 or v_dead < 2 or v_hunt < 1 then\n' },
  { name: 'deathFloor1', why: 'P2 accepts one dying probe (R4 says 2)', expect: /^C22$/,
    find: '  if v_n < 4 or v_ate < 2 or v_dead < 2 or v_hunt < 1 then\n', repl: '  if v_n < 4 or v_ate < 2 or v_dead < 1 or v_hunt < 1 then\n' },
  { name: 'huntFloor0', why: 'P2 accepts no named-hunt probe (R4 says 1)', expect: /^C23$/,
    find: '  if v_n < 4 or v_ate < 2 or v_dead < 2 or v_hunt < 1 then\n', repl: '  if v_n < 4 or v_ate < 2 or v_dead < 2 or v_hunt < 0 then\n' },
  { name: 'noAttestFilter', why: 'P2 counts a probe the replay guard never attested', expect: /^C24$/,
    find: `     and p.input is not null and p.seed is not null\n     and p.id::text || ':' || ${REPLAY_DIGEST_SQL}\n         = any (c_replayed);\n`,
    repl: '     and p.input is not null and p.seed is not null;\n' },
  { name: 'noIntegrityCheck', why: 'P2 ignores an attested probe that changed after the replay', expect: /^C25$/,
    find: '  if v_n <> cardinality(c_replayed) then\n', repl: '  if false then\n' },
  { name: 'noReplayedP0', why: 'P0 accepts the placeholder replayed set', expect: /^C1b$/,
    find: "  if coalesce(cardinality(c_replayed), 0) < 1\n     or exists (select 1 from unnest(c_replayed) e where e !~ '^[0-9]+:[0-9a-f]{64}$') then\n",
    repl: '  if false then\n' },
  { name: 'noHuntCatalogueCheck', why: 'P2 reads a hunt catalogue that is not installed', expect: /^C26$/,
    find: "  if to_regclass('public.hr_hunts') is null then\n", repl: '  if false then\n' },
  { name: 'countsOpenPinOnly', why: 'P2 counts a probe that OPENED on the pin but closed on another payload', expect: /^C6$/,
    find: '     and p.payload_open = c_pin and p.payload_close = c_pin\n', repl: '     and p.payload_open = c_pin\n' },
  { name: 'noOffPinCheck', why: 'P2 ignores a deploy inside the evidence', expect: /^C7$/,
    find: '                and (payload_open <> c_pin or coalesce(payload_close, c_pin) <> c_pin)) then\n',
    repl: '                and false) then\n' },
  { name: 'noInputCheck', why: 'P2 counts a probe whose input (and seed) was not retained (no replay possible)', expect: /^C8$/,
    find: '     and p.input is not null and p.seed is not null\n', repl: '' },
  { name: 'noCapBodyCheck', why: 'P4 accepts the partied short-circuit', expect: /C15/,
    find: "         and position('hr_partied(p_user, p_slot) then return v_cap' in p.prosrc) = 0\n         and position('or public.hr_partied(p_user, p_slot) then' in p.prosrc) > 0) <> 1 then",
    repl: '         ) <> 1 then' },
  { name: 'noPreStall', why: 'P4 arms over an unwatched/stalled combat shadow', expect: /C17/,
    find: "  if coalesce((v_stall->>'judged')::boolean, false) is not true\n     or coalesce((v_stall->>'stalled')::boolean, true) is not false\n     or not coalesce((v_stall->'watched_channels') ? 'combat', false) then",
    repl: '  if false then',
    then: ["  if v_ent is null\n     or coalesce((v_ent->>'judged')::boolean, false) is not true\n     or coalesce((v_ent->>'stalled')::boolean, true) is not false then",
      '  if false then'] },
  { name: 'noPartySettleBodyCheck', why: 'P4 accepts a party settle without the cohort / party 8d (Security #3: `<> 1` -> `< 0`)', expect: /C20/,
    find: "             > position($q$then 'no_return_anchor' else 'past_horizon' end$q$ in p.prosrc)) <> 1 then",
    repl: "             > position($q$then 'no_return_anchor' else 'past_horizon' end$q$ in p.prosrc)) < 0 then" },
  { name: 'noStartBodyCheck', why: 'P4 accepts a hunt start without the cohort gate (Security #3: `<> 1` -> `< 0`)', expect: /C21/,
    find: "         and position('hunt_not_in_cohort' in p.prosrc) > 0) <> 1 then",
    repl: "         and position('hunt_not_in_cohort' in p.prosrc) > 0) < 0 then" },
  { name: 'noFramePushCheck', why: 'P1 arms with frame_push on', expect: /C12/,
    find: "  if v_cfg.frame_push then raise exception 'ARM-P1: frame_push is on'; end if;\n", repl: '' },
];

console.log('\nworld-tick-arm-combat --mutate: every mutant must go RED on its named arm');
const control = await arms(db, ARM_SQL, { log: false });
if (control.length) { console.error(`harness: the unmutated control is red (${control.join(', ')})`); process.exit(2); }
console.log(`[mutants] ${MUTANTS.length}`);
let survived = 0;
for (const m of MUTANTS) {
  const n = typeof m.find === 'string' ? ARM_SQL.split(m.find).length - 1 : (ARM_SQL.match(new RegExp(m.find.source, 'g')) || []).length;
  if (n !== 1) { console.error(`harness: ${m.name}: anchor matched ${n}x`); process.exit(2); }
  let sql = ARM_SQL.replace(m.find, () => m.repl);
  if (m.then) {
    if (sql.split(m.then[0]).length !== 2) { console.error(`harness: ${m.name}: second anchor`); process.exit(2); }
    sql = sql.replace(m.then[0], () => m.then[1]);
  }
  if (CONTROL) sql = ARM_SQL;
  let red;
  try { red = await arms(db, sql, { log: false }); } catch (e) {
    if (e.harness) { console.error(`harness: ${m.name}: ${e.message}`); process.exit(2); }
    red = [`threw: ${e.message}`];
  }
  const hit = red.some((id) => m.expect.test(id));
  console.log(`[mutant] ${m.name} ${hit ? 'caught' : 'survived'}`);
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via ${red.join(', ')}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: ${red.length ? `red only via ${red.join(', ')}` : 'SURVIVED'}`); }
}
await db.close();
if (CONTROL) {
  console.log(`\nHR_MUTANT_CONTROL: nothing planted; ${MUTANTS.length - survived} arm(s) read caught`);
  process.exit(survived === MUTANTS.length ? 0 : 1);
}
console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length} mutants red on their named arm`);
process.exit(survived ? 1 : 0);
