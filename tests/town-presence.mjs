// ════════════════════════════════════════════════════════════════════════
// tests/town-presence.mjs — PRESENCE IS A SERVER FACT, AND THE PLAZA LEAKS
//                           EXACTLY SEVEN KEYS.
//
//   node tests/town-presence.mjs             the guard
//   node tests/town-presence.mjs --selftest  plant real defects, require RED
//
// ── WHAT IS UNDER TEST ──────────────────────────────────────────────────────
// 2026-09-13-town-presence.sql is Week 1 of the live system the pre-launch gate
// names (PRIORITY_BOARD §10): hr_heartbeat stamps `now()` on the caller's own
// player_state row, a pg_cron job builds ONE town_snapshot row per zone every
// 25 s, and hr_town_of projects that row through an ALLOWLIST. It is the first
// cross-player read surface in the game that is not a leaderboard, so the
// failure modes are not economic — they are a forged presence, a leaked column
// and an ignored opt-out.
//
// The migration's own §13 gate asserts all of this at APPLY time. This guard
// exists because text is not behaviour and an apply-time gate can be disarmed
// by the next file that restates a body: it boots the REAL ordered migration
// chain (tests/schema-replay.mjs bootReplay — supabase/schema.sql + every
// migration in tests/schema-apply-order.json, on PGlite in process) and proves,
// BY EXECUTION, with the migration's own gate DISARMED so that what turns red is
// THIS file's measurement:
//
//   1. the flag is OFF at apply: hr_town_of answers {off:true} carrying no data,
//      and the cron body writes no real snapshot;
//   2. a heartbeat stamps the SERVER clock on the caller's own row, bumps no
//      version, and journals NOTHING (no player_ledger, no player_intents — at
//      one call per 25 s a journal row is the game_events mistake at ledger
//      scale);
//   3. a second heartbeat inside 20 s writes nothing, and says so;
//   4. presence CANNOT BE FORGED FOR ANOTHER PLAYER: the signature carries no
//      uuid and no time type, user A's heartbeat never moves user B's stamp, and
//      an unowned slot is refused no_character without creating a character;
//   5. the projection carries EXACTLY the 7-key peer / 6-key crier allowlist —
//      asserted with jsonb_object_keys, so a new internal field cannot arrive by
//      accident — and never gold, gems, HP, inventory, slot or user_id;
//   6. a QUIET character is absent from the peer list AND from the named crier
//      feed, the toggle journals exactly one ledger row per CHANGE, and the
//      opt-out is IMMEDIATE — proven on a control that requires the character to
//      be in the snapshot first, then read WITHOUT a refresh in between, because
//      the reader cannot re-check quiet (the snapshot stores no user_id) and an
//      eventually-consistent privacy control fails in the wrong direction;
//   7. `away` and `seen_ago_s` are computed at READ time, so a stale snapshot
//      still tells the truth, and a snapshot the refresher stopped updating shows
//      NOBODY rather than a room full of ghosts;
//   8. the level is COARSE: a band, never the exact total level;
//   9. an uncatalogued active_id projects as NULL — a tampered client cannot put
//      a chosen string on every other player's screen;
//  10. an account's several characters are ONE body in the plaza (a four-slot
//      account cannot flood it);
//  11. town_snapshot is reachable by NO client role (a readable cache is the rate
//      gate and the allowlist bypassed in one SELECT), and every privileged inner
//      and helper is owner-only;
//  12. the envelope gained an own-`place` block and carries NO peers.
//
// Exit: 0 green · 1 an assertion failed · 2 the harness is not measurable.
// ════════════════════════════════════════════════════════════════════════

import { bootReplay } from './schema-replay.mjs';
import { runMutationProof } from './mutation-proof.mjs';

const MIG = '2026-09-13-town-presence.sql';
/* The follow-up that RESTATES the three gated wrappers to add the
   hr_note_rejection seam (2026-09-12-hr-rejections-journal.sql P6 went red on
   their absence). It is the LAST toucher of those three bodies, so an arm that
   plants a defect in a WRAPPER has to plant it HERE — planted in MIG it is
   overwritten at chain end and the mutation silently no-ops, which is how a
   mutation proof goes vacuous. Measured: moving flag_ignored was not a choice,
   the arm STAYED GREEN until it moved. */
const MIG_JOURNAL = '2026-09-13-town-presence-journal.sql';
const ZONE = 'the_common';

const uidFor = (n) => `000000ac-0000-0000-0000-0000000000${n}`;

/* ── THE MIGRATION'S OWN GATE, DISARMED ─────────────────────────────────────
   Every arm carries this. Deliberately: §13 refuses most of these defects at
   APPLY time (which is the second layer and stays in the file), but a proof in
   which every arm is "the migration refused to install" never exercises THIS
   guard's assertions — the shape tests/mutation-proof.mjs was written to stop.
   With the gate disarmed the mutated migration installs happily and the RED has
   to come from a measurement. */
const DISARM_GATE = [
  '  -- (a) THE OBJECTS EXIST, and the flag defaults OFF.',
  '  return;  -- §13 commit gate disarmed by the mutation proof (tests/town-presence.mjs)\n'
  + '  -- (a) THE OBJECTS EXIST, and the flag defaults OFF.',
];

/* ── THE MUTATION CATALOGUE — one real defect each ──────────────────────── */
const MUTATIONS = {
  quiet_ignored: {
    why: 'the opt-out filter leaves the snapshot query, so a player who asked not to be tracked is '
       + 'tracked anyway — the one Security review the study named',
    pairs: [['       and not coalesce(ps.presence_quiet, false)', '       and true']],
  },
  quiet_not_immediate: {
    why: 'the writer stops rebuilding the cache when a player opts out, so the opt-out waits for the '
       + 'next cron tick (≤25 s, ≤60 s on the fallback) and NEVER lands if cron is down — an '
       + 'eventually-consistent privacy control (Security P3, 2026-09-12)',
    pairs: [['      perform public.hr_town_refresh();\n      v_refreshed := true;',
             '      v_refreshed := false;']],
  },
  floor_removed: {
    why: 'the 20-second floor is disarmed, so a 240/min heartbeat storm becomes 240 writes/min on the '
       + 'hottest table in the database instead of three',
    pairs: [['  if v_last is not null and v_now - v_last < c_floor then',
             '  if false then']],
  },
  heartbeat_hits_any_row: {
    why: 'the heartbeat update loses its user predicate, so ONE player marks the WHOLE realm present — '
       + 'a forged presence for every other account at once',
    pairs: [['  update public.player_state\n     set last_seen_at = v_now\n   where user_id = v_uid and slot = v_slot;',
             '  update public.player_state\n     set last_seen_at = v_now\n   where slot = v_slot;']],
  },
  heartbeat_bumps_version: {
    why: 'the presence stamp bumps player_state.version, so every 25-second poll collides with the '
       + "player's own in-flight apply and the game becomes a version_conflict storm",
    pairs: [['  update public.player_state\n     set last_seen_at = v_now\n   where user_id = v_uid and slot = v_slot;',
             '  update public.player_state\n     set last_seen_at = v_now, version = version + 1\n'
             + '   where user_id = v_uid and slot = v_slot;']],
  },
  allowlist_passthrough: {
    why: 'the peer projection merges the RAW snapshot object over the allowlist, so every internal '
       + 'field (today an absolute seen_at, tomorrow whatever is added) crosses to other players',
    pairs: [["             'away',           ((p->>'seen_at')::timestamptz < now() - interval '90 seconds')\n"
             + '           ) order by',
             "             'away',           ((p->>'seen_at')::timestamptz < now() - interval '90 seconds')\n"
             + '           ) || p order by']],
  },
  read_window_off: {
    why: 'the reader stops re-applying the 15-minute window, so a snapshot the cron job stopped '
       + 'refreshing leaves ghosts standing in the plaza forever',
    pairs: [["     where (p->>'seen_at')::timestamptz > now() - interval '15 minutes'",
             '     where true']],
  },
  away_never: {
    why: 'the away line moves to 90 DAYS, so a player who walked away an hour ago still reads as '
       + 'actively here — the plaza becomes a list of people who are not there',
    pairs: [["             'away',           ((p->>'seen_at')::timestamptz < now() - interval '90 seconds')",
             "             'away',           ((p->>'seen_at')::timestamptz < now() - interval '90 days')"]],
  },
  label_unvalidated: {
    why: 'the activity label stops being looked up in the catalogue, so a tampered client can put any '
       + "string it likes on every other player's screen by writing its own active_id",
    pairs: [["  select initcap(replace(a.activity_id, '_', ' '))\n    from public.hr_activities a\n"
             + '   where a.kind = p_kind and a.activity_id = p_id',
             "  select initcap(replace(p_id, '_', ' '))"]],
  },
  flag_ignored: {
    // In the FOLLOW-UP file: it restates hr_town_of's wrapper last.
    file: MIG_JOURNAL,
    why: 'the read surface stops honouring the server flag, so the feature is OPEN the moment it is '
       + 'applied — there is no kill switch and no staged rollout',
    pairs: [["  if not public.hr_flag_on('town_presence') then\n"
             + "    return jsonb_build_object('ok', true, 'off', true);\n  end if;",
             '  if false then\n'
             + "    return jsonb_build_object('ok', true, 'off', true);\n  end if;"]],
  },
  snapshot_client_readable: {
    why: 'the cache is granted to `authenticated`, so a browser reads the internal shape directly and '
       + 'the rate gate AND the allowlist are one SELECT away from irrelevant',
    pairs: [['  revoke all on public.town_snapshot from public, anon, authenticated, service_role;',
             '  revoke all on public.town_snapshot from public, anon, authenticated, service_role;\n'
             + '  grant select on public.town_snapshot to authenticated;']],
  },
  level_is_exact: {
    why: 'the level BAND becomes the exact total level, which is the finest-grained progression number '
       + 'in the game and was deliberately coarsened before it crossed to another player',
    pairs: [["             'level_band', ((coalesce(public.hr_total_level(c.user_id, c.slot), 0) / 10) * 10),",
             "             'level_band', coalesce(public.hr_total_level(c.user_id, c.slot), 0),"]],
  },
  one_body_per_account_off: {
    why: 'DISTINCT ON goes, so every character of an account is its own body in the plaza and a '
       + 'four-slot account fills a sixty-person square with itself',
    pairs: [['    select distinct on (ps.user_id)\n', '    select\n']],
  },
};

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  FAIL  ${msg}`); } };

async function boot(mutate) {
  // MIG's own §13 gate is ALWAYS disarmed (see DISARM_GATE); the arm's defect goes
  // into whichever file is the LAST toucher of the body it targets.
  const patches = new Map([[MIG, [DISARM_GATE]]]);
  if (mutate) {
    const m = MUTATIONS[mutate];
    const target = m.file || MIG;
    patches.set(target, [...(patches.get(target) || []), ...m.pairs]);
  }
  const { db } = await bootReplay({ patches });
  return db;
}

const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];

/** A character with a profile name, a heartbeat-able row, and no history. */
async function seed(db, uid, name, { slot = 0, xp = null } = {}) {
  await db.exec(`insert into auth.users (id) values ('${uid}') on conflict (id) do nothing;`);
  await db.exec(`insert into public.profiles (id, display_name) values ('${uid}', '${name}')
                 on conflict (id) do update set display_name = excluded.display_name;`);
  await db.exec(`insert into public.player_state (user_id, slot, gold, gems, version)
                 values ('${uid}', ${slot}, 0, 0, 5)
                 on conflict (user_id, slot) do update set version = 5, last_seen_at = null,
                     presence_quiet = false;`);
  if (xp !== null) {
    await db.exec(`insert into public.player_skills (user_id, slot, skill_id, xp)
                   select '${uid}', ${slot}, s, ${xp}
                     from unnest(array['attack','strength','defense']) s
                   on conflict (user_id, slot, skill_id) do update set xp = ${xp};`);
  }
}

/** Call a client verb AS THAT USER (PostgREST's shape: auth.uid() from the JWT). */
async function asUser(db, uid, sql, params) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return (await db.query(sql, params)).rows[0]; }
  finally { await db.exec(`select set_config('request.jwt.claim.sub', '', false);`); }
}

const heartbeat = (db, uid, slot = 0) =>
  asUser(db, uid, 'select public.hr_heartbeat($1) as r', [slot]).then((r) => r.r);
const setQuiet = (db, uid, quiet, slot = 0) =>
  asUser(db, uid, 'select public.hr_set_presence_quiet($1, $2) as r', [slot, quiet]).then((r) => r.r);
const townOf = (db, uid, zone = ZONE) =>
  asUser(db, uid, 'select public.hr_town_of($1) as r', [zone]).then((r) => r.r);

const keysOf = (o) => Object.keys(o).sort().join(', ');
const PEER_KEYS = ['activity_id', 'activity_kind', 'activity_label', 'away',
  'level_band', 'name', 'seen_ago_s'].sort().join(', ');
const CRIER_KEYS = ['found_ago_s', 'item_id', 'name', 'one_in', 'source_id',
  'source_kind'].sort().join(', ');

async function runAll(db) {
  const A = uidFor('a1');   // loud, gathering
  const B = uidFor('b2');   // loud, will be aged out
  const Q = uidFor('c3');   // opts out
  const S = uidFor('d4');   // the rate-limit storm's own account
  await seed(db, A, 'PlazaAnn', { xp: 40000 });   // 3 skills, a real total level
  // ...and make sure that total level is NOT a multiple of ten. Load-bearing, not
  // tidiness: with a total of exactly 30 the band and the level are the same
  // number, `level_band === level` is true for the right reason and for the wrong
  // one, and the level_is_exact mutation STAYS GREEN (measured 2026-09-12 — that
  // is why this loop exists). Extra skills are added at xp 0 (level 1 each) until
  // the total is off the band boundary, then it is asserted below as a control.
  {
    const pool = (await db.query(
      `select s.skill_id from public.hr_skills s
        where s.skill_id not in ('attack','strength','defense')
        order by s.skill_id`)).rows.map((r) => r.skill_id);
    let lv = Number((await one(db, 'select public.hr_total_level($1, 0) as lv', [A])).lv);
    for (const s of pool) {
      if (lv % 10 !== 0) break;
      await db.exec(`insert into public.player_skills (user_id, slot, skill_id, xp)
                     values ('${A}', 0, '${s}', 0)
                     on conflict (user_id, slot, skill_id) do update set xp = 0;`);
      lv = Number((await one(db, 'select public.hr_total_level($1, 0) as lv', [A])).lv);
    }
    ok(lv % 10 !== 0,
      `the probe character's total level (${lv}) is OFF a band boundary — otherwise "band" and `
      + '"exact level" are the same number and the coarsening cannot be proven');
  }
  await seed(db, B, 'PlazaBob');
  await seed(db, Q, 'PlazaHush');
  await seed(db, S, 'PlazaStorm');
  await seed(db, A, 'PlazaAnn', { slot: 1 });     // a SECOND character of A's account

  // ── (1) THE FLAG IS OFF AT APPLY ─────────────────────────────────────────
  const offAnswer = await townOf(db, A);
  ok(offAnswer && offAnswer.off === true,
    `with the town_presence flag OFF hr_town_of answers {off:true} (got ${JSON.stringify(offAnswer)})`);
  ok(offAnswer && offAnswer.peers === undefined,
    'the OFF answer carries no peers key at all — it is closed, not empty');
  await db.exec('select public.hr_town_refresh();');
  const offSnap = await one(db,
    `select count(*)::int as n from public.town_snapshot
      where zone_id = $1 and coalesce(payload->>'off','') <> 'true'`, [ZONE]);
  ok(offSnap.n === 0, 'the cron body built no real snapshot while the flag was OFF');

  await db.exec(`update public.hr_flags set enabled = true where key = 'town_presence';`);

  // ── (2) A HEARTBEAT IS A SERVER STAMP, AND COSTS ONE UPDATE ─────────────
  const h1 = await heartbeat(db, A);
  ok(h1 && h1.ok === true && h1.stamped === true,
    `the first heartbeat stamps (got ${JSON.stringify(h1)})`);
  const afterA = await one(db,
    'select last_seen_at, version from public.player_state where user_id = $1 and slot = 0', [A]);
  ok(afterA.last_seen_at !== null, 'last_seen_at was written by the server');
  ok(Number(afterA.version) === 5,
    `the heartbeat did NOT bump player_state.version (read ${afterA.version}, seeded 5) — a bump would `
    + "collide with the player's own in-flight apply every 25 seconds");
  const journal = await one(db,
    `select (select count(*) from public.player_ledger where user_id = $1)::int as led,
            (select count(*) from public.player_intents where user_id = $1)::int as ints`, [A]);
  ok(journal.led === 0 && journal.ints === 0,
    `a heartbeat journals NOTHING (ledger ${journal.led}, intents ${journal.ints}) — at one call per `
    + '25 s a journal row is the game_events 1.6M-row mistake at ledger scale');

  // ── (3) THE 20-SECOND FLOOR ─────────────────────────────────────────────
  const h2 = await heartbeat(db, A);
  ok(h2 && h2.ok === true && h2.stamped === false && h2.throttled === true,
    `a second heartbeat inside 20 s is throttled, not an error (got ${JSON.stringify(h2)})`);
  const stillA = await one(db,
    'select last_seen_at from public.player_state where user_id = $1 and slot = 0', [A]);
  ok(String(stillA.last_seen_at) === String(afterA.last_seen_at),
    'the throttled heartbeat wrote nothing — the floor is enforced by the column, not by hope');

  // ── (4) PRESENCE CANNOT BE FORGED FOR ANOTHER PLAYER ────────────────────
  const args = await one(db,
    `select pg_get_function_identity_arguments(p.oid) as a from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'hr_heartbeat'`);
  ok(!/uuid|timestamp|date/.test(args.a),
    `hr_heartbeat's signature names no user and no clock (${args.a}) — there is nothing to forge`);
  const bBefore = await one(db,
    'select last_seen_at from public.player_state where user_id = $1 and slot = 0', [B]);
  ok(bBefore.last_seen_at === null, 'the control: B has never been seen');
  const hBad = await heartbeat(db, A, 9);
  ok(hBad && hBad.error === 'no_character',
    `a heartbeat for a slot the caller does not own is refused no_character (got ${JSON.stringify(hBad)})`);
  const madeUp = await one(db,
    'select count(*)::int as n from public.player_state where user_id = $1 and slot = 9', [A]);
  ok(madeUp.n === 0, 'the refused heartbeat created no character — a presence ping is not a factory');
  const bAfter = await one(db,
    'select last_seen_at from public.player_state where user_id = $1 and slot = 0', [B]);
  ok(bAfter.last_seen_at === null,
    "A's heartbeats never moved B's last_seen_at — one player cannot mark the realm present");

  // ── (6a) THE OPT-OUT ────────────────────────────────────────────────────
  await heartbeat(db, B);
  await heartbeat(db, Q);

  // THE OPT-OUT IS IMMEDIATE, not eventually consistent (Security P3, 2026-09-12).
  // hr_town_of re-applies the 15-minute window at read time but CANNOT re-check
  // quiet — the snapshot deliberately stores no user_id — so without a writer-side
  // rebuild a player who has just asked to be invisible keeps being served from
  // the cached payload for up to one refresh interval, and forever if cron is
  // down. Proven with a CONTROL first: build a snapshot while Q is still LOUD and
  // require them IN it, otherwise the probe below passes on an empty plaza.
  await db.exec('select public.hr_town_refresh();');
  const loudFirst = await townOf(db, A);
  ok(loudFirst.peers.some((p) => p.name === 'PlazaHush'),
    'the control: a LOUD character IS in the snapshot, so the immediacy probe is not vacuous');
  const q1 = await setQuiet(db, Q, true);
  ok(q1 && q1.ok === true && q1.quiet === true && q1.changed === true,
    `the quiet toggle takes (got ${JSON.stringify(q1)})`);
  ok(q1 && q1.snapshot_refreshed === true,
    `the quiet toggle rebuilt the snapshot itself (got ${JSON.stringify(q1 && q1.snapshot_refreshed)})`);
  const noRefresh = await townOf(db, A);   // NO hr_town_refresh() in between
  ok(!noRefresh.peers.some((p) => p.name === 'PlazaHush'),
    'a character who JUST opted out is gone from the very next read, with NO refresh in between — '
    + 'an eventually-consistent privacy control is the wrong failure direction');
  const q2 = await setQuiet(db, Q, true);
  ok(q2 && q2.changed === false,
    `a repeated quiet set reports no change (got ${JSON.stringify(q2)}) — it is idempotent by naming `
    + 'an absolute value, which is why it needs no idempotency key');
  const qLedger = await one(db,
    `select count(*)::int as n, max(intent) as intent from public.player_ledger
      where user_id = $1 and kind = 'presence'`, [Q]);
  ok(qLedger.n === 1,
    `the quiet CHANGE is journalled exactly once (${qLedger.n} row(s)) — per change, never per click`);
  ok(String(qLedger.intent) === 'presence_quiet:true',
    `the ledger row names the transition (got ${qLedger.intent})`);
  const qVer = await one(db,
    'select version from public.player_state where user_id = $1 and slot = 0', [Q]);
  ok(Number(qVer.version) === 5, `the quiet toggle bumped no version (read ${qVer.version})`);

  // ── A CRIER LINE, from the EXISTING public board (reused, never duplicated)
  await db.exec(
    `insert into public.world_finds (user_id, slot, item_id, source_kind, source_id, one_in)
     values ('${A}', 0, 'wyrmgilt_mantle', 'monster', 'ancient_wyrm', 30000),
            ('${Q}', 0, 'hearthstone_signet', 'node', 'oak_tree', 200000);`);

  // ── (9) AN UNCATALOGUED ACTIVITY IS NOT BROADCASTABLE ───────────────────
  const act = await one(db,
    `select activity_id from public.hr_activities where kind = 'gather'
      order by activity_id limit 1`);
  ok(!!act, 'the catalogue has a gather activity (the label arm is not vacuous)');
  const lab = await one(db,
    'select public.hr_activity_label($1, $2) as good, public.hr_activity_label($1, $3) as forged',
    ['gather', act.activity_id, `FORGED_${act.activity_id}`]);
  ok(!!lab.good, 'a catalogued activity has a label');
  ok(lab.forged === null,
    `an UNCATALOGUED activity_id has no label (got ${JSON.stringify(lab.forged)}) — a tampered client `
    + "cannot put a chosen string on every other player's screen");

  await db.exec(`update public.player_state
                    set active_kind = 'gather', active_id = '${act.activity_id}'
                  where user_id = '${A}' and slot = 0;`);
  await db.exec('select public.hr_town_refresh();');

  // ── (5) THE ALLOWLIST, AND NOTHING ELSE ─────────────────────────────────
  const town = await townOf(db, A);
  ok(town && town.ok === true && town.off === undefined,
    `hr_town_of is open with the flag ON (got ${JSON.stringify(town && town.error)})`);
  ok(Array.isArray(town.peers) && town.peers.length === 2,
    `the plaza shows the 2 loud characters (got ${town.peers && town.peers.length})`);
  ok(Number(town.here) === 2, `\`here\` counts the loud characters only (got ${town.here})`);
  ok(Number(town.shown) === 2, `\`shown\` reports what the answer carries (got ${town.shown})`);
  ok(town.stale_s !== null && town.stale_s !== undefined,
    'the answer carries stale_s — the client is told how old the photograph is');
  ok(!!town.now, 'the answer carries the server clock');
  for (const p of town.peers) {
    ok(keysOf(p) === PEER_KEYS,
      `a peer carries exactly the allowlist [${PEER_KEYS}] (got [${keysOf(p)}])`);
  }
  ok(Array.isArray(town.crier) && town.crier.length >= 1,
    `the crier feed carries the last 24 h of world_finds (got ${town.crier && town.crier.length})`);
  for (const c of town.crier) {
    ok(keysOf(c) === CRIER_KEYS,
      `a crier line carries exactly the allowlist [${CRIER_KEYS}] (got [${keysOf(c)}])`);
  }
  const blob = JSON.stringify(town);
  const forbidden = ['gold', 'gems', 'hearth_tokens', 'inventory', 'equipment', 'hp', 'max_hp',
    'bounty', 'user_id', 'slot', 'email', 'version', 'dungeon_scrip', 'marks', 'renown', 'xp',
    'skills'];
  const leaked = forbidden.filter((k) => blob.includes(`"${k}":`));
  ok(leaked.length === 0,
    `the projection carries no economy or identity key (leaked: ${leaked.join(', ')})`);

  // ── (6b) QUIET IS HONOURED IN BOTH HALVES ───────────────────────────────
  ok(!blob.includes('PlazaHush'),
    'the QUIET character is absent from the peer list — the opt-out is not decoration');
  ok(!town.crier.some((c) => c.item_id === 'hearthstone_signet'),
    "the QUIET character's find is absent from the NAMED crier feed (the anonymous public board row "
    + 'is untouched)');
  ok(town.crier.some((c) => c.item_id === 'wyrmgilt_mantle' && c.name === 'PlazaAnn'),
    'a loud find IS cried, with the name derived from profiles');

  // ── (8) THE LEVEL IS COARSE ─────────────────────────────────────────────
  const exact = await one(db, 'select public.hr_total_level($1, 0) as lv', [A]);
  const ann = town.peers.find((p) => p.name === 'PlazaAnn');
  ok(!!ann, 'the gathering character is in the plaza');
  ok(Number(exact.lv) > 0, `the control: the character has a real total level (${exact.lv})`);
  ok(Number(ann.level_band) % 10 === 0,
    `level_band is a band (got ${ann.level_band}) — not the exact total level`);
  ok(Number(ann.level_band) === Math.floor(Number(exact.lv) / 10) * 10,
    `level_band ${ann.level_band} is floor(${exact.lv}/10)*10`);
  ok(Number(ann.level_band) !== Number(exact.lv),
    `the exact total level ${exact.lv} is NOT what crossed to other players (band ${ann.level_band})`);
  ok(ann.activity_kind === 'gather' && ann.activity_id === act.activity_id && !!ann.activity_label,
    `the activity projects kind + catalogued id + label (got ${JSON.stringify(ann)})`);
  ok(ann.away === false && Number(ann.seen_ago_s) < 90,
    `a character seen seconds ago is not away (got away=${ann.away}, ${ann.seen_ago_s}s)`);

  // ── (10) ONE BODY PER ACCOUNT ───────────────────────────────────────────
  //    A's SECOND character heartbeats too. The plaza must still show ONE PlazaAnn.
  await heartbeat(db, A, 1);
  await db.exec('select public.hr_town_refresh();');
  const town2 = await townOf(db, A);
  ok(town2.peers.filter((p) => p.name === 'PlazaAnn').length === 1,
    `a two-character account is ONE body in the plaza (got `
    + `${town2.peers.filter((p) => p.name === 'PlazaAnn').length})`);
  ok(Number(town2.here) === 2,
    `\`here\` counts accounts, not characters (got ${town2.here})`);

  // ── (7) AWAY AND seen_ago_s ARE COMPUTED AT READ TIME ───────────────────
  await db.exec(`update public.player_state set last_seen_at = now() - interval '200 seconds'
                  where user_id = '${B}' and slot = 0;`);
  await db.exec('select public.hr_town_refresh();');
  const town3 = await townOf(db, A);
  const bob = town3.peers.find((p) => p.name === 'PlazaBob');
  ok(!!bob, 'a character last seen 200 s ago is still in town (the window is 15 minutes)');
  ok(bob && bob.away === true,
    `a character last seen 200 s ago is marked away (got ${bob && bob.away})`);
  ok(bob && Number(bob.seen_ago_s) >= 190,
    `seen_ago_s is derived at read time (got ${bob && bob.seen_ago_s} for a 200 s stamp)`);

  // ...and A SNAPSHOT NOBODY IS REFRESHING SHOWS NOBODY. Aged in the SNAPSHOT,
  // which is exactly the state the row is in when the cron job stops.
  await db.exec(`update public.town_snapshot
                    set payload = jsonb_set(payload, '{peers}',
                          (select coalesce(jsonb_agg(jsonb_set(e.p, '{seen_at}',
                                    to_jsonb(now() - interval '20 minutes'))), '[]'::jsonb)
                             from jsonb_array_elements(payload->'peers') as e(p)))
                  where zone_id = '${ZONE}';`);
  const stale = await townOf(db, A);
  ok(stale.peers.length === 0 && Number(stale.shown) === 0,
    `a stale snapshot shows NOBODY rather than ghosts (got ${stale.peers.length} peer(s))`);

  // ── (11) THE CACHE AND THE HELPERS ARE NOT CLIENT-REACHABLE ─────────────
  const tGrants = await one(db,
    `select coalesce(string_agg(table_name || ':' || grantee || ':' || privilege_type, ', '), '') as g
       from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'town_snapshot'
        and grantee in ('anon', 'authenticated', 'PUBLIC', 'service_role')`);
  ok(tGrants.g === '',
    `no client role holds any privilege on town_snapshot (got "${tGrants.g}") — a readable cache is `
    + 'the rate gate and the allowlist bypassed in one SELECT');
  const tPol = await one(db,
    `select count(*)::int as n from pg_policy p join pg_class c on c.oid = p.polrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'town_snapshot'`);
  ok(tPol.n === 0, `town_snapshot has no RLS policy at all (got ${tPol.n})`);
  const fGrants = await one(db,
    `select coalesce(string_agg(table_name || ':' || grantee || ':' || privilege_type, ', '), '') as g
       from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'hr_flags'
        and grantee in ('anon', 'authenticated', 'PUBLIC', 'service_role')
        and privilege_type <> 'SELECT'`);
  ok(fGrants.g === '',
    `hr_flags is SELECT-only to clients (got "${fGrants.g}") — a player-flippable flag is no flag`);
  // From pg_proc.proacl via aclexplode, NOT information_schema.role_routine_grants:
  // that view only shows grants involving a currently ENABLED role, so a PUBLIC
  // EXECUTE grant — the default on every new function — is invisible in it.
  const hg = await one(db,
    `select coalesce(string_agg(p.proname || ':' || coalesce(r.rolname,'PUBLIC'), ', '), '') as g
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       left join pg_roles r on r.oid = a.grantee
      where n.nspname = 'public'
        and p.proname in ('hr_heartbeat__ungated','hr_set_presence_quiet__ungated',
                          'hr_town_of__ungated','hr_town_refresh','hr_flag_on','hr_activity_label',
                          'hr_town_zone')
        and a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or r.rolname in ('anon','authenticated','service_role','hr_engine'))`);
  ok(hg.g === '', `every privileged inner and helper is owner-only (got "${hg.g}")`);
  const wrappers = await one(db,
    `select coalesce(string_agg(x, ', '), '') as missing from unnest(array[
              'public.hr_heartbeat(integer)',
              'public.hr_set_presence_quiet(integer,boolean)',
              'public.hr_town_of(text)']) x
      where not has_function_privilege('authenticated', x, 'execute')`);
  ok(wrappers.missing === '',
    `every client verb is callable by authenticated (missing: ${wrappers.missing})`);
  const baseline = await one(db,
    `select coalesce(string_agg(x, ', '), '') as missing from unnest(array[
              'hr_heartbeat','hr_set_presence_quiet','hr_town_of']) x
      where not exists (select 1 from public.hr_client_rpc_baseline b
                         where b.proname = x and b.grantee = 'authenticated')`);
  ok(baseline.missing === '',
    `every new client verb is declared in hr_client_rpc_baseline (missing: ${baseline.missing})`);
  const idx = await one(db,
    `select count(*)::int as n from pg_indexes
      where schemaname = 'public' and indexname = 'player_state_last_seen_idx'`);
  ok(idx.n === 1, 'the presence index exists — the cron job never seq-scans player_state');

  // ── (12) THE ENVELOPE: OWN PLACE, NEVER PEERS ──────────────────────────
  const env = (await one(db, 'select public.hr_state_of($1, 0) as e', [A])).e;
  ok(env && env.place && env.place.zone === ZONE,
    `the envelope carries an own-place block (got ${JSON.stringify(env && env.place)})`);
  ok(env.place.quiet === false, `place.quiet mirrors the server column (got ${env.place.quiet})`);
  ok(env.peers === undefined && env.town === undefined,
    'the envelope carries NO peers — it is version-gated, and peer motion in it would be a '
    + 'version_conflict storm');
  ok(env.renown_high !== undefined && env.dungeon_cooldowns !== undefined,
    'the splice did not drop the projections that landed just before it (renown_high, '
    + 'dungeon_cooldowns)');
  const envQ = (await one(db, 'select public.hr_state_of($1, 0) as e', [Q])).e;
  ok(envQ.place.quiet === true, 'a quiet character reads quiet=true in its own envelope');

  // ── THE RATE GATE REFUSES A STORM (its own account, so nothing above is
  //    poisoned by a spent bucket) ─────────────────────────────────────────
  const bad = await townOf(db, S, 'somewhere_else');
  ok(bad && bad.error === 'bad_zone',
    `an unknown zone is refused bad_zone (got ${JSON.stringify(bad)}) — an empty answer is `
    + 'indistinguishable from "nobody is here", and a free-text zone is snapshot enumeration');
  let limited = null;
  for (let i = 0; i < 60; i++) {
    const r = await townOf(db, S);
    if (r && r.error === 'rate_limited') { limited = i; break; }
  }
  ok(limited !== null, 'a 60-call hr_town_of storm is rate_limited (the 30/min bucket is wired)');
}

// ── CLI ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  // Scored by tests/mutation-proof.mjs: the CLEAN baseline runs FIRST and must be
  // green, and an undeclared throw is a HARNESS error (exit 2) rather than a free
  // "caught". Every arm here also DISARMS the migration's §13 gate, so the RED is
  // this guard's own measurement and not the migration refusing to install — the
  // gate is the second layer and stays in the file.
  await runMutationProof({
    label: 'town-presence',
    cases: Object.entries(MUTATIONS).map(([id, m]) => ({ id, why: m.why })),
    baseline: async () => { await runAll(await boot(null)); },
    arm: async (id) => { await runAll(await boot(id)); },
    failures: () => failed,
    reset: () => { failed = 0; },
  });
} else {
  await runAll(await boot(null));
  if (failed) { console.error(`\ntown-presence: ${failed} assertion(s) FAILED.`); process.exit(1); }
  console.log('town-presence: all assertions passed (flag OFF closes the surface and the cron body; '
    + 'the heartbeat stamps the server clock on the caller\'s own row only, bumps no version and '
    + 'journals nothing; a second beat inside 20 s writes nothing; no uuid/clock in the signature and '
    + 'A never moves B; the projection is exactly the 7-key peer / 6-key crier allowlist with no '
    + 'economy or identity key; quiet is honoured in peers AND crier and journalled once per change; '
    + 'away/seen_ago_s at read time and a stale snapshot shows nobody; the level is a band; an '
    + 'uncatalogued activity_id has no label; one body per account; town_snapshot reachable by no '
    + 'client role; the envelope gained place and carries no peers; bad_zone and the storm refused; '
    + 'an opt-out is gone from the VERY NEXT read with no refresh in between).');
  process.exit(0);
}
