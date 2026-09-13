#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/world-finds-projection.mjs — THE FINDER'S NAME IS MINTED IN EXACTLY
//                   ONE PLACE, AND THE KEY IT WAS DERIVED FROM NO LONGER
//                   CROSSES THE WIRE.
//                   GRADED AGAINST REAL POSTGRESQL.
//
//   node tests/world-finds-projection.mjs             the guard
//   node tests/world-finds-projection.mjs --selftest   plant real defects, require RED
//
// Ships with: supabase/migrations/2026-09-13-world-finds-projection.sql
//
// ── WHAT THIS EXISTS TO STOP GOING BACK ─────────────────────────────────────
// Named pre-launch P2 (Security, 2026-09-13; PRIORITY_BOARD §10). As shipped,
// 2026-09-08-hearthfind.sql granted SELECT on ALL of public.world_finds —
// `user_id` and `slot` included — to anon AND authenticated, while
// public.profiles and public.display_names are public-read. So naming every
// finder in the realm was one join, and the SHIPPED CLIENT performed it:
// src/features/hearthfind.js selected `user_id` off the board and resolved it
// through `display_names` into the global chat line. When
// 2026-09-13-town-presence.sql added `presence_quiet` and filtered quiet
// characters out of the town crier, its own header recorded that the filter
// "buys nothing today" — because the board still named them.
//
// ── WHY A NODE GUARD AS WELL AS THE MIGRATION'S §6 ──────────────────────────
// §6 asserts all of this at APPLY time and it does bite (measured: every arm
// below fails the apply by name when the gate is left armed). That is the second
// layer, and it is exactly the layer a later file can quietly remove — a
// restatement of hr_rpc_gate, a `grant select on world_finds` in a convenience
// sweep, a re-created wrapper without the quiet rule. So this replays the REAL
// ordered chain (tests/schema-replay.mjs bootReplay — supabase/schema.sql plus
// every migration in tests/schema-apply-order.json, on PGlite in process) with
// §6 DISARMED, and proves the properties BY EXECUTION from CHAIN END:
//
//   1. the objects exist with the only volatility/security pair that can work
//      (STABLE+DEFINER inner, VOLATILE+DEFINER wrapper: the rate gate is an
//      UPSERT, which Postgres refuses inside a STABLE function);
//   2. the projection is EXACTLY the 8-key allowlist by jsonb_object_keys, with
//      no user_id, no slot and no account uuid in any VALUE;
//   3. a LOUD finder IS named (the control) and a QUIET finder is NAMELESS;
//   4. a quiet finder's ROW SURVIVES — quiet nulls the name, it does not delete
//      history, because the board is where "the 3rd ever found" comes from and
//      one player's privacy must not renumber everybody else's records;
//   5. `nth` is a REALM ordinal over the whole table, not a position in the
//      returned window (driven with a find that is deliberately OUTSIDE the
//      window, which is the only way to tell the two apart);
//   6. anon AND authenticated can no longer SELECT world_finds.user_id or .slot
//      — measured with has_column_privilege per role per column AND, where the
//      fixture allows it, by THREE real statements under `set role` that must
//      each raise 42501: the column in the target list, the column in a WHERE
//      clause (THE MEMBERSHIP ORACLE — Security's review named it as the real
//      attack, and it puts no user_id in the result set at all) and the column in
//      ORDER BY — while every anonymous board column still reads and no write
//      privilege was created;
//   7. the inner is owner-only, the wrapper is callable by `authenticated` and
//      by nobody else, and anon cannot reach either;
//   8. the wrapper carries the rate gate BEFORE exactly one hr_note_rejection
//      seam, the 6/min bucket bites, and the anchored hr_rpc_gate patch deleted
//      no pre-existing bucket;
//   9. the verb is declared in hr_client_rpc_baseline and
//      hr_assert_grant_hygiene reports nothing against it;
//  10. an unauthenticated call is refused and carries NO rows;
//  11. a board read writes nothing — no ledger row, no intent row, no board row
//      (a poll per player per 90 s that journals is the game_events 1.6M-row
//      mistake at ledger scale);
//  12. and the CLIENT half actually moved: src/features/hearthfind.js asks for
//      no identity column and no longer joins display_names.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────────
//   · PRODUCTION's ACL. PGlite is a fresh database; the live grants are what
//     tools/apply-migration.mjs plus §6 produce, and only a post-apply read-only
//     verification can confirm them there.
//   · PostgREST's behaviour on a column-level grant (it builds `select=` lists
//     from the request, so an explicit list of granted columns is fine and a
//     `select=*` would now fail). No reader does `select=*` — enumerated in the
//     migration header — but that is a grep, not a measurement.
//   · Cardinality at 100× players. The bound is structural (the board is capped
//     by hr_world_finds_prune at 20 000 rows and the window at 200).
//
// Exit: 0 green · 1 an assertion failed · 2 the harness is not measurable.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { runMutationProof } from './mutation-proof.mjs';

const MIG = '2026-09-13-world-finds-projection.sql';

/* ── THE MIGRATION'S OWN GATE, DISARMED ─────────────────────────────────────
   Every arm carries this. Deliberately: §6 refuses most of these defects at
   APPLY time (which is the second layer and stays in the file), but a proof in
   which every arm is "the migration refused to install" never exercises THIS
   guard's assertions — the shape tests/mutation-proof.mjs exists to stop. With
   the gate disarmed the mutated migration installs happily and the RED has to
   come from a measurement taken here. */
const DISARM = [
  '  -- (a) THE OBJECTS EXIST WITH THE INTENDED VOLATILITY AND SECURITY.',
  '  return;  -- §6 commit gate disarmed by the mutation proof '
  + '(tests/world-finds-projection.mjs)\n'
  + '  -- (a) THE OBJECTS EXIST WITH THE INTENDED VOLATILITY AND SECURITY.',
];
/* §4a(ii) — the restatement's OWN bucket census — is disarmed for the same reason
   and with the same reluctance. It is a second layer over the hr_rpc_gate
   restatement and it DOES bite (leave it armed and the two bucket arms below fail
   the APPLY by name, which the driver correctly scores as a harness error, not as
   this guard's tick). Disarmed, the mutated chain installs and the RED has to
   come from a measurement taken here — which is the only way to know that a
   dropped bucket is visible to something that runs on every CI build and not only
   to the one migration that happened to be applying at the time. */
const DISARM_4A = [
  "  v_after := replace(pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure), chr(13), '');",
  '  return;  -- §4a(ii) bucket census disarmed by the mutation proof '
  + '(tests/world-finds-projection.mjs)\n'
  + "  v_after := replace(pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure), chr(13), '');",
];

/* ── THE MUTATION CATALOGUE — one real defect each ──────────────────────── */
const MUTATIONS = {
  name_not_minted: {
    why: 'the projection emits the finder\'s user_id instead of a server-minted name, which is the '
       + 'shipped defect verbatim: profiles and display_names are public-read, so the key IS the name',
    pairs: [["             'name', case\n"
             + "                       when coalesce(q.presence_quiet, false) then null\n"
             + "                       else coalesce(pr.display_name, 'Adventurer')\n"
             + '                     end,',
             "             'user_id', w.user_id,"]],
  },
  quiet_ignored: {
    why: 'the presence_quiet rule leaves the projection, so a character who asked not to be tracked '
       + 'is named on the public board anyway — the opt-out becomes a promise the schema cannot keep, '
       + 'which is the exact state 2026-09-13-town-presence.sql filed as this P2',
    pairs: [["             'name', case\n"
             + "                       when coalesce(q.presence_quiet, false) then null\n"
             + "                       else coalesce(pr.display_name, 'Adventurer')\n"
             + '                     end,',
             "             'name', coalesce(pr.display_name, 'Adventurer'),"]],
  },
  quiet_drops_the_row: {
    why: 'quiet DELETES the find from the board instead of nulling the name, so one player\'s privacy '
       + "setting silently renumbers every later finder's ordinal — the board is the realm's record",
    pairs: [['      from public.world_finds f\n     order by f.id desc',
             '      from public.world_finds f\n'
             + '     where not exists (select 1 from public.player_state q2\n'
             + '                        where q2.user_id = f.user_id and q2.slot = f.slot\n'
             + '                          and q2.presence_quiet)\n'
             + '     order by f.id desc']],
  },
  ordinal_is_a_window_artefact: {
    why: 'nth counts only the rows the caller was sent, so the "1 042nd ever found in Hearthrise" a '
       + 'player screenshots is really "the 3rd row in your page" and every reader sees a different '
       + 'number for the same find',
    pairs: [["             'nth', (select count(*) from public.world_finds c\n"
             + '                      where c.item_id = w.item_id and c.id <= w.id)',
             "             'nth', (select count(*) from win c\n"
             + '                      where c.item_id = w.item_id and c.id <= w.id)']],
  },
  revoke_is_a_silent_noop: {
    why: 'the revoke is written in the column-level form the brief asked for — which PostgreSQL '
       + 'CANNOT use to carve an exception out of a table-level grant: it finds no column grant to '
       + 'remove, succeeds with a warning, and leaves user_id readable by every client. The whole '
       + 'file becomes decorative and nothing else in the repo would notice',
    pairs: [['  revoke select on public.world_finds from anon, authenticated;\n'
             + '  grant  select (id, item_id, source_kind, source_id, one_in, found_at)\n'
             + '    on public.world_finds to anon, authenticated;',
             '  revoke select (user_id, slot) on public.world_finds from anon, authenticated;']],
  },
  regrant_includes_user_id: {
    why: 'the re-grant hands user_id back explicitly, so the projection stays perfectly clean and the '
       + 'MEMBERSHIP ORACLE is wide open — `select id from world_finds where user_id = $1` answers '
       + '"does this account hold a rare find?" about any uuid from any public roster, and every '
       + 'projection assertion in this guard still passes. Security named this as the real attack',
    pairs: [['  grant  select (id, item_id, source_kind, source_id, one_in, found_at)',
             '  grant  select (id, user_id, item_id, source_kind, source_id, one_in, found_at)']],
  },
  regrant_includes_slot: {
    why: 'the re-grant hands `slot` back, so the character key crosses — with user_id gone it is the '
       + 'remaining half of the (user_id, slot) key every other player table is keyed on, and it makes '
       + 'a board row joinable to a character once any other leak supplies the account',
    pairs: [['  grant  select (id, item_id, source_kind, source_id, one_in, found_at)',
             '  grant  select (id, slot, item_id, source_kind, source_id, one_in, found_at)']],
  },
  revoke_takes_the_whole_board: {
    why: 'the re-grant is dropped, so the client roles lose SELECT on the board entirely — the '
       + 'opposite failure, and the one a one-sided privacy check would wave through while breaking '
       + 'every reader of a deliberately shareable surface',
    pairs: [['  grant  select (id, item_id, source_kind, source_id, one_in, found_at)\n'
             + '    on public.world_finds to anon, authenticated;',
             '  -- re-grant removed by the mutation proof']],
  },
  inner_is_client_executable: {
    why: 'the privileged inner is granted to authenticated, so a browser calls the SECURITY DEFINER '
       + 'read directly and the rate gate, the refusal seam and the auth check are all one POST away '
       + 'from irrelevant',
    pairs: [['grant  execute on function public.hr_world_finds_of(int) to authenticated;',
             'grant  execute on function public.hr_world_finds_of(int) to authenticated;\n'
             + 'grant  execute on function public.hr_world_finds_of__ungated(int) to authenticated;']],
  },
  anon_can_call_the_verb: {
    why: 'the verb is opened to anon, so the board (and every display name on it) is readable with '
       + 'nothing but the public anon key, from outside the invite wall, at scraper speed',
    pairs: [['grant  execute on function public.hr_world_finds_of(int) to authenticated;',
             'grant  execute on function public.hr_world_finds_of(int) to authenticated, anon;']],
  },
  rate_gate_removed: {
    why: 'the wrapper stops calling hr_rpc_gate, so a client-callable read that aggregates the whole '
       + 'board is uncapped — free CPU for anyone with the anon key and a session',
    pairs: [["  if not public.hr_rpc_gate('hr_world_finds_of') then\n"
             + "    return jsonb_build_object('ok', false, 'error', 'rate_limited');\n"
             + '  end if;\n', '']],
  },
  bucket_not_registered: {
    why: 'the hr_rpc_gate bucket is never added, and an UNKNOWN bucket fails CLOSED — so the feature '
       + 'installs green and answers rate_limited forever, which is a board that silently stops '
       + 'working rather than an error anybody sees',
    pairs: [["    when 'hr_world_finds_of' then v_limit := 6;\n", '']],
  },
  restatement_drops_a_bucket: {
    why: 'the hr_rpc_gate RESTATEMENT loses a bucket another file added — the one failure mode a '
       + 'restatement has, and a silent one: that verb then answers rate_limited forever for every '
       + 'player, because an unknown bucket fails CLOSED',
    pairs: [["    when 'hr_town_of' then v_limit := 30;\n", '']],
  },
  seam_removed: {
    why: 'the hr_note_rejection seam goes, so every refusal of this verb is invisible to '
       + 'tools/vitals.mjs — the blindness 2026-09-12-hr-rejections-journal.sql was written to end, '
       + 'reintroduced one verb at a time',
    pairs: [["  return public.hr_note_rejection('hr_world_finds_of', 0,\n    case",
             '  return (\n    case']],
  },
  baseline_not_declared: {
    why: 'the new client verb is not declared in hr_client_rpc_baseline, so hr_assert_grant_hygiene '
       + 'raises a finding against it every night forever and the nightly monitor becomes noise that '
       + 'nobody reads — which is how the next real one is missed',
    pairs: [["    ('hr_world_finds_of', 'p_limit integer', 'authenticated',", "    ('hr_world_finds_of__NOT_THE_VERB', 'p_limit integer', 'authenticated',"]],
  },
};

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  FAIL  ${msg}`); } };

async function boot(mutate) {
  const patches = new Map([[MIG, [DISARM, DISARM_4A]]]);
  if (mutate) {
    const m = MUTATIONS[mutate];
    patches.set(MIG, [...patches.get(MIG), ...m.pairs]);
  }
  const { db } = await bootReplay({ patches });
  return db;
}

const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];

/** Call as that user — PostgREST's shape: auth.uid() comes from the JWT claim. */
async function asUser(db, uid, sql, params) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return (await db.query(sql, params)).rows[0]; }
  finally { await db.exec(`select set_config('request.jwt.claim.sub', '', false);`); }
}
const boardOf = (db, uid, limit) =>
  asUser(db, uid, 'select public.hr_world_finds_of($1) as r', [limit]).then((r) => r.r);

const LOUD = '000000bf-0000-0000-0000-0000000000b1';
const HUSH = '000000bf-0000-0000-0000-0000000000b2';
const ITEM = 'emberheart';

async function seed(db, uid, name, quiet) {
  await db.exec(`insert into auth.users (id) values ('${uid}') on conflict (id) do nothing;`);
  await db.exec(`insert into public.profiles (id, display_name) values ('${uid}', '${name}')
                 on conflict (id) do update set display_name = excluded.display_name;`);
  await db.exec(`insert into public.player_state (user_id, slot, gold, gems, presence_quiet)
                 values ('${uid}', 0, 0, 0, ${quiet})
                 on conflict (user_id, slot) do update set presence_quiet = ${quiet};`);
}

const ROW_KEYS = ['found_at', 'id', 'item_id', 'name', 'nth', 'one_in', 'source_id', 'source_kind']
  .sort().join(',');

async function runAll(db) {
  await seed(db, LOUD, 'LoudFinder', false);
  await seed(db, HUSH, 'HushFinder', true);

  /* THREE finds of the SAME item, oldest first. The oldest is deliberately
     pushed OUT of the window below — it is the only way to tell a realm ordinal
     from a position in the page, and without it the ordinal_is_a_window_artefact
     arm stays green (the failure mode this whole family of guards keeps hitting). */
  await db.exec(`insert into public.world_finds (user_id, slot, item_id, source_kind, source_id, one_in)
                 values ('${LOUD}', 0, '${ITEM}', 'monster', 'dragon', 26000),
                        ('${LOUD}', 0, '${ITEM}', 'monster', 'dragon', 26000),
                        ('${HUSH}', 0, '${ITEM}', 'monster', 'dragon', 26000);`);
  const ids = (await db.query(
    `select id from public.world_finds where item_id = '${ITEM}' order by id`)).rows.map((r) => Number(r.id));
  ok(ids.length === 3, `the fixture seeded three finds (got ${ids.length}) — every ordinal assertion `
    + 'below is vacuous without them');

  // ── (1) VOLATILITY AND SECURITY ─────────────────────────────────────────
  const vol = await one(db,
    `select p.proname, p.provolatile::text as v, p.prosecdef as d
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'hr_world_finds_of__ungated'`);
  ok(vol && vol.v === 's' && vol.d === true,
    `hr_world_finds_of__ungated is STABLE + SECURITY DEFINER (got ${vol && vol.v}/${vol && vol.d}) — `
    + 'an INVOKER read could not see profiles at all');
  const volw = await one(db,
    `select p.provolatile::text as v, p.prosecdef as d from pg_proc p
      where p.oid = 'public.hr_world_finds_of(int)'::regprocedure`);
  ok(volw && volw.v === 'v' && volw.d === true,
    `hr_world_finds_of is VOLATILE + SECURITY DEFINER (got ${volw && volw.v}/${volw && volw.d}) — the `
    + 'rate gate is an UPSERT and Postgres refuses a write inside a STABLE function');

  // ── (2) THE ALLOWLIST ───────────────────────────────────────────────────
  const res = await boardOf(db, LOUD, 200);
  ok(res && res.ok === true && Array.isArray(res.rows),
    `an authenticated board read succeeds (got ${JSON.stringify(res).slice(0, 200)})`);
  const rows = (res && res.rows) || [];
  ok(rows.length >= 3,
    `the three probe finds are in the projection (got ${rows.length}) — every assertion below would `
    + 'pass on an empty board');
  const keys = rows.length ? Object.keys(rows[0]).sort().join(',') : '';
  ok(keys === ROW_KEYS,
    `the projected row key set is "${keys}" — expected exactly "${ROW_KEYS}". A literal allowlist is `
    + 'what stops a column added to world_finds tomorrow reaching another player by accident');
  const blob = JSON.stringify(rows);
  ok(!/user_id/.test(blob) && !/"slot"/.test(blob),
    'the projection names user_id or slot');
  ok(blob.indexOf(LOUD) === -1 && blob.indexOf(HUSH) === -1,
    'an account uuid appears in a projected VALUE — the key crossed the wire as data');
  const envKeys = Object.keys(res).sort().join(',');
  ok(envKeys === 'counts,now,ok,rows',
    `the envelope keys are "${envKeys}" — expected counts,now,ok,rows`);

  // ── (3)+(4) THE NAME, BOTH SIDES, AND THE SURVIVING ROW ─────────────────
  const mine = rows.filter((r) => r.item_id === ITEM);
  ok(mine.length === 3,
    `${mine.length} of the 3 probe finds survived the quiet rule — dropping a row would renumber `
    + "every later finder's ordinal as a side effect of one player's privacy setting");
  ok(mine.some((r) => r.name === 'LoudFinder'),
    'THE CONTROL FAILED: the loud finder was not named, so "a quiet finder is nameless" proves '
    + 'nothing — a projection that named nobody would pass');
  ok(!mine.some((r) => r.name === 'HushFinder'),
    'a presence_quiet finder was NAMED on the public board — the opt-out is not honoured at the one '
    + 'place the name is minted, which is the entire purpose of this migration');
  ok(mine.filter((r) => r.name === null).length === 1,
    `${mine.filter((r) => r.name === null).length} nameless rows, expected exactly 1 (the quiet find)`);

  // ── (5) THE ORDINAL IS A REALM ORDINAL ──────────────────────────────────
  ok(mine.map((r) => Number(r.nth)).join(',') === '1,2,3',
    `the full-window ordinals are ${mine.map((r) => r.nth).join(',')}, expected 1,2,3`);
  const narrow = await boardOf(db, LOUD, 2);
  const nrows = ((narrow && narrow.rows) || []).filter((r) => r.item_id === ITEM);
  ok(nrows.length === 2, `a p_limit of 2 returns the NEWEST two finds (got ${nrows.length})`);
  ok(nrows.map((r) => Number(r.id)).join(',') === `${ids[1]},${ids[2]}`,
    `the narrow window holds ${nrows.map((r) => r.id).join(',')}, expected the newest two `
    + `(${ids[1]},${ids[2]}) — the old read took the OLDEST rows, which freezes the board`);
  ok(nrows.map((r) => Number(r.nth)).join(',') === '2,3',
    `inside a 2-row window the ordinals are ${nrows.map((r) => r.nth).join(',')}, expected 2,3. `
    + 'Counting only the rows the caller was sent makes "the Nth ever found" a different number for '
    + 'every reader of the same find');
  ok(Number((narrow && narrow.counts && narrow.counts[ITEM]) || 0) === 3,
    `the per-item total is ${narrow && narrow.counts && narrow.counts[ITEM]}, expected 3 — it is the `
    + 'count over the BOARD, not over the page');

  // ── (6) THE REVOKE IS IN EFFECT, FROM BOTH SIDES ────────────────────────
  for (const role of ['anon', 'authenticated']) {
    const p = await one(db,
      `select has_column_privilege($1, 'public.world_finds', 'user_id', 'select') as uid,
              has_column_privilege($1, 'public.world_finds', 'slot',    'select') as slot,
              has_any_column_privilege($1, 'public.world_finds', 'select')        as any_sel,
              has_column_privilege($1, 'public.world_finds', 'id',          'select')
                and has_column_privilege($1, 'public.world_finds', 'item_id',     'select')
                and has_column_privilege($1, 'public.world_finds', 'source_kind', 'select')
                and has_column_privilege($1, 'public.world_finds', 'source_id',   'select')
                and has_column_privilege($1, 'public.world_finds', 'one_in',      'select')
                and has_column_privilege($1, 'public.world_finds', 'found_at',    'select') as board,
              has_any_column_privilege($1, 'public.world_finds', 'insert')
                or has_any_column_privilege($1, 'public.world_finds', 'update')
                or has_table_privilege($1, 'public.world_finds', 'delete')        as writes`,
      [role]);
    ok(p.uid === false,
      `${role} can still SELECT world_finds.user_id — profiles and display_names are public-read, so `
      + 'the de-anonymising join still has a left-hand side and this migration changed nothing');
    ok(p.slot === false, `${role} can still SELECT world_finds.slot — the character key crosses`);
    ok(p.any_sel === true,
      `${role} lost SELECT on world_finds entirely — the board is the deliberately shareable `
      + 'surface; only the identity columns were meant to go');
    ok(p.board === true, `${role} lost SELECT on an anonymous board column — the re-grant did not land`);
    ok(p.writes === false, `${role} holds a WRITE privilege on the public board`);
  }
  /* AND THE SAME THING AS REAL STATEMENTS. has_column_privilege reads the ACL;
     these read the planner's answer. If the fixture cannot switch roles the
     probes SAY SO rather than passing — an always-skipped probe is the
     always-null-probe family.

     ⚠ PROJECTING user_id IS THE SMALL HALF. Security's review (2026-09-13)
       named the real attack, which the first draft of this guard did not cover:
       a MEMBERSHIP ORACLE. `select id from world_finds where user_id = $1` never
       puts the column in a result set at all — it asks a yes/no question about a
       uuid the attacker already has (from a leaderboard, a clan roster, a chat
       name lookup), and the answer "this account has a rare find" is exactly the
       fact presence_quiet exists to withhold. `order by user_id` is the same
       leak by a slower road: the ORDER of an otherwise-anonymous board is a
       total order over account ids, so repeated reads with rows appearing and
       vanishing sort the realm by uuid. PostgreSQL charges SELECT on a column
       referenced ANYWHERE in the query — target list, WHERE or ORDER BY — so all
       three must raise 42501, and all three are now asserted. A revoke that
       covered only the target list would have left the oracle wide open while
       every projection assertion above stayed green. */
  const asAuthenticated = async (sql, params) => {
    try {
      await db.exec('set role authenticated;');
    } catch (e) {
      await db.exec('reset role;').catch(() => {});
      return 'NO_SET_ROLE';
    }
    let verdict;
    try {
      await db.query(sql, params);
      verdict = 'ALLOWED';
    } catch (e) { verdict = String(e && e.code) === '42501' ? '42501' : `OTHER:${e && e.code}`; }
    await db.exec('reset role;').catch(() => {});
    return verdict;
  };
  const ORACLES = [
    ['select user_id from public.world_finds limit 1', [],
      'the column in the TARGET LIST — the projection leak'],
    ['select id from public.world_finds where user_id = $1 limit 1', [HUSH],
      'the column in a WHERE clause — THE MEMBERSHIP ORACLE: it returns no user_id at all and still '
      + 'answers "does this account hold a rare find?" about a uuid taken from any public roster'],
    ['select id from public.world_finds order by user_id limit 1', [],
      'the column in ORDER BY — the same leak by a slower road: the row order of an anonymous board '
      + 'is a total order over account ids'],
  ];
  let skipped = 0;
  for (const [sql, params, why] of ORACLES) {
    const v = await asAuthenticated(sql, params);
    if (v === 'NO_SET_ROLE') { skipped++; continue; }
    ok(v === '42501',
      `as \`authenticated\`, ${sql} returned "${v}" — expected 42501 (insufficient_privilege). This is `
      + `${why}.`);
  }
  if (skipped) {
    console.log(`  note  this fixture cannot \`set role\` (${skipped}/${ORACLES.length} statement `
      + 'probes skipped); the column revoke is proven by has_column_privilege alone, both roles, both '
      + 'columns, both directions');
  }

  // ── (7) WHO MAY CALL WHAT ───────────────────────────────────────────────
  const acl = await one(db,
    `select coalesce(string_agg(p.proname || ':' || coalesce(r.rolname, 'PUBLIC'), ', '
                                order by p.proname, coalesce(r.rolname, 'PUBLIC')), '') as g
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       left join pg_roles r on r.oid = a.grantee
      where n.nspname = 'public'
        and p.proname in ('hr_world_finds_of', 'hr_world_finds_of__ungated', 'hr_world_finds_prune')
        and a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role', 'hr_engine'))`);
  ok(acl.g === 'hr_world_finds_of:authenticated',
    `the client-reachable EXECUTE set is "${acl.g}" — expected exactly `
    + '"hr_world_finds_of:authenticated". The inner is the gate and the seam bypassed in one call, '
    + 'and anon is outside the invite wall');

  // ── (8) THE GATE, THE SEAM, AND THE BUCKETS ─────────────────────────────
  const src = (await one(db,
    `select p.prosrc as s from pg_proc p
      where p.oid = 'public.hr_world_finds_of(int)'::regprocedure`)).s;
  const seams = (src.match(/hr_note_rejection\(/g) || []).length;
  ok(seams === 1,
    `the wrapper carries ${seams} hr_note_rejection seam(s), expected exactly 1 — zero is a refusal `
    + "nothing records (the blindness tools/vitals.mjs was blind with), two is a double count");
  ok(src.indexOf('hr_rpc_gate') !== -1
    && src.indexOf('hr_rpc_gate') < src.indexOf('hr_note_rejection'),
    'the rate gate is missing from the wrapper or sits AFTER the seam — a refused call would be a '
    + 'free unlimited one');
  const gateDef = (await one(db,
    "select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) as d")).d;
  ok(gateDef.indexOf("'hr_world_finds_of'") !== -1,
    'hr_rpc_gate does not admit hr_world_finds_of — an unknown bucket fails CLOSED, so the verb '
    + 'would answer rate_limited forever and ship green and dead');
  /* THE RESTATEMENT TOOK NOTHING AWAY. One bucket per limit tier, so a dropped
     `when` line anywhere in the case is visible here and not only where this
     lane happened to look. The migration's own 4a(ii) compares against a census
     of the body it replaced, which is stronger; this is the independent floor. */
  const lost = ['hr_town_of', 'hr_heartbeat', 'hr_set_presence_quiet', 'hr_claim_daily',
    'clan_deposit', 'hr_buy_hero_slot', 'hr_credit_kills', 'client_state_put', 'farm_plant',
    'hr_set_style', 'beta_invite_check'].filter((b) => gateDef.indexOf(`'${b}'`) === -1);
  ok(lost.length === 0,
    `the hr_rpc_gate RESTATEMENT DELETED the ${lost.join(', ')} bucket(s) — an unknown bucket fails `
    + 'CLOSED, so that verb now answers rate_limited forever for every player');
  let limited = null;
  for (let i = 0; i < 40; i++) {
    const r = await boardOf(db, LOUD, 50);
    if (r && r.error === 'rate_limited') { limited = i; break; }
  }
  ok(limited !== null, 'a 40-call storm was never rate_limited — the 6/min bucket is not wired');

  // ── (9) THE BASELINE AND GRANT HYGIENE ──────────────────────────────────
  const base = await one(db,
    `select count(*)::int as n from public.hr_client_rpc_baseline
      where proname = 'hr_world_finds_of' and grantee = 'authenticated'`);
  ok(base.n === 1,
    `hr_world_finds_of appears ${base.n} time(s) in hr_client_rpc_baseline, expected 1 — an `
    + 'undeclared client grant is a standing nightly hr_assert_grant_hygiene finding, and a monitor '
    + 'that is always red is a monitor nobody reads');
  const hyg = await one(db, 'select public.hr_assert_grant_hygiene(false)::text as r');
  ok(hyg.r.indexOf('hr_world_finds_of') === -1,
    `hr_assert_grant_hygiene reports a finding against this verb: ${hyg.r.slice(0, 300)}`);

  // ── (10) THE UNAUTHENTICATED REFUSAL ────────────────────────────────────
  await db.exec("select set_config('request.jwt.claim.sub', '', false);");
  const anonRes = (await one(db, 'select public.hr_world_finds_of(200) as r')).r;
  ok(anonRes && anonRes.error === 'unauthenticated',
    `a call with no JWT subject was not refused unauthenticated (got ${JSON.stringify(anonRes)})`);
  ok(anonRes && anonRes.rows === undefined,
    'the refusal carries a rows key — it is closed, not empty');

  // ── (11) A READ WRITES NOTHING ──────────────────────────────────────────
  const wrote = await one(db,
    `select (select count(*) from public.player_ledger where user_id = $1)::int as led,
            (select count(*) from public.player_intents where user_id = $1)::int as ints,
            (select count(*) from public.world_finds where item_id = $2)::int as board`,
    [LOUD, ITEM]);
  ok(wrote.led === 0 && wrote.ints === 0,
    `a board READ journalled ${wrote.led} ledger / ${wrote.ints} intent row(s) — at one poll per `
    + 'player per 90 s that is the game_events 1.6M-row mistake at ledger scale');
  ok(wrote.board === 3, `the board gained or lost rows during a read (${wrote.board}, expected 3)`);
  const idx = await one(db,
    `select count(*)::int as n from pg_indexes
      where schemaname = 'public' and indexname = 'world_finds_item_idx'`);
  ok(idx.n === 1,
    'world_finds_item_idx is missing — both ordinal counts would seq-scan the board on every poll');

  // ── (12) THE CLIENT HALF ACTUALLY MOVED ─────────────────────────────────
  //    Text, not execution, and it is the only thing here that is: the defect
  //    was a line of JavaScript, so the absence of that line is the property. A
  //    server that is correct while the shipped client still joins display_names
  //    off the board has closed nothing.
  const hf = readFileSync(join(ROOT, 'src', 'features', 'hearthfind.js'), 'utf8');
  /* Comments stripped PROPERLY (block comments first, then line comments). A
     line-prefix filter is not enough: this file documents the defect it fixed in
     a multi-line block, and a naive strip left the quoted old request behind and
     failed the clean baseline. Measured. */
  const code = hf.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ok(code.indexOf('hr_world_finds_of') !== -1,
    'src/features/hearthfind.js does not call hr_world_finds_of — the client half did not move');
  ok(!/select=[^'"]*user_id/.test(code),
    'src/features/hearthfind.js still asks world_finds for user_id');
  ok(code.indexOf('display_names?select') === -1,
    'src/features/hearthfind.js still resolves names through the public display_names table — that '
    + 'request IS the de-anonymisation');
}

// ── CLI ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--list')) {
  for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id}\n    ${m.why}\n`);
  process.exit(0);
} else if (argv.includes('--selftest')) {
  /* Scored by tests/mutation-proof.mjs: the CLEAN baseline runs FIRST and must be
     green, and an undeclared throw is a HARNESS error (exit 2) rather than a free
     "caught". Every arm disarms the migration's §6 gate, so the RED is this
     guard's own measurement and not the migration refusing to install. */
  process.exit(await runMutationProof({
    label: 'world-finds-projection',
    cases: Object.entries(MUTATIONS).map(([id, m]) => ({ id, why: m.why })),
    baseline: async () => { await runAll(await boot(null)); },
    arm: async (id) => { await runAll(await boot(id)); },
    failures: () => failed,
    reset: () => { failed = 0; },
  }));
} else {
  await runAll(await boot(null));
  if (failed) {
    console.error(`\nworld-finds-projection: ${failed} assertion(s) FAILED.`);
    process.exit(1);
  }
  console.log('world-finds-projection: all assertions passed (the finder\'s name is minted only '
    + 'inside hr_world_finds_of, from profiles.display_name, and is NULL for a presence_quiet '
    + 'finder while the ROW survives so no ordinal is renumbered; the projection is exactly the '
    + '8-key allowlist with no user_id, no slot and no account uuid in any value; nth is a realm '
    + 'ordinal proven against a find OUTSIDE the window and counts is the board total; anon and '
    + 'authenticated can no longer read world_finds.user_id or .slot in a target list, in a WHERE clause (the membership oracle) or in ORDER BY, while every anonymous column '
    + 'still reads and no write privilege exists; the inner is owner-only and only authenticated '
    + 'may call the verb; the rate gate sits before exactly one seam, the 6/min bucket bites and '
    + 'eleven pre-existing buckets survived the restatement; the verb is declared in the client '
    + 'baseline and grant hygiene is quiet about it; an unauthenticated call is refused with no '
    + 'rows; a read journals nothing and moves no board row; and the shipped client reads the RPC '
    + 'and no longer joins display_names).');
  process.exit(0);
}
