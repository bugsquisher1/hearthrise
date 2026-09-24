#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// tests/party-hunt.mjs — THE HUNT INTENTS, AND THE SETTLE BOUNDARY IS PRICED.
//
//   node tests/party-hunt.mjs            the guard
//   node tests/party-hunt.mjs --mutate   seven mutants, each required to go RED
//
// M8 slice 4 (docs/planning/WORLD_TICK_DESIGN.md §18.1 / §18.3 / §18.4 T-3 and
// T-3b, §18-SEC.3's S4 list, §18-SEC-2.2's B-A1 and B-A6), built by
// lane/m8-parties-s4 as three migrations. This is the node half: a FOUR-MEMBER
// party formed through the REAL membership verbs on the PGlite chain replay
// starts a hunt, is settled once in SHADOW through S2's own
// `hr_party_tick_settle`, and is then kicked, left and stopped — with every
// refusal the design names asserted by EXIT CODE.
//
// ── WHY THIS EXISTS BESIDE THE MIGRATIONS' OWN §4 BLOCKS ────────────────────
// The §4 blocks run ONCE, at apply time, on the machine doing the apply. They
// refuse to install a broken batch and they are right to be there. They are not
// a standing guard: nothing re-runs them when someone edits the start six weeks
// from now, and nothing re-runs them when S5 flips `shadow`. This file runs on
// every push.
//
// It also asserts three properties a §4 block structurally cannot:
//
//   P-IDEM  the three files RE-APPLY byte-identically. tools/apply-migration
//           .mjs is run by hand, at speed, on a file that may already be in,
//           and file 2 PATCHES two existing bodies — "additive and idempotent"
//           has to be a measurement, not a header.
//   P-SETTLE the stop's last window goes through S2's `hr_party_tick_settle`
//           and NOTHING else: four `hr_tick_shadow` rows, the attribution key
//           set as an EQUALITY, not one coin moved, and the party watermark
//           moved by the settle rather than by the verb. §18.2.3 invariant 8
//           says the settle is the only writer of either watermark; a second
//           settle path on the stop is S-3 and `AWAY-12` in one move.
//   P-B-A1  the eight-boundary budget across ALL FOUR doors, which no single
//           migration arm can walk end to end because it is a property of the
//           four verbs together.
//
// ── THE MUTATION PROOF (CLAUDE.md §4) ──────────────────────────────────────
// Seven mutants, each breaking one load-bearing line and naming the arm that
// must go red. A guard that has never been red is not a guard.
//
//   budgetNotCounted    B-A1 — a start stops counting against the eight
//   partialStart        B-A6 — the start writes ONE member's pointer, not all
//   leftAtWritten       T-3  — the kick closes the row although the settle
//                              could not run
//   secondSettlePath    S-3  — the stop calls hr_party_tick_settle itself
//   refusalLeaksWatermark      the party_settle_required refusal starts
//                              distinguishing a cause it must not, by carrying
//                              the watermark no caller may read
//   unlockedInvariant8  E1   — the start asserts invariant 8 against UNLOCKED
//                              player_state rows, so a member's own solo settle
//                              can break the equality before it commits
//   refusalNamesAccount E2   — a refusal hands the client another account's
//                              auth.users id and slot, outside hr_party_view's
//                              frozen column set
//
// Five of the seven are also run as STAGE 2, with file 2's whole §6 block
// neutered, so the node arms have to catch them on their own rather than
// riding the migration's gate forever — which is every day after this batch
// lands.
//
// Exit: 0 green · 1 a failed arm · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { bootReplay, inventory, ROOT } from './schema-replay.mjs';
import { PARTY_JOURNAL_KEYS } from '../src/core/party-split.js';

const MUTATE = process.argv.slice(2).includes('--mutate');

const F1 = '2026-09-24-m8-parties-s4-1-boundary-budget.sql';
const F2 = '2026-09-24-m8-parties-s4-2-hunt-intents.sql';
const F3 = '2026-09-24-m8-parties-s4-3-client-surface.sql';

/* Four accounts, not two accounts on two slots: invariant 2 forbids one user
   filling a party with its own characters, and four accounts is the only shape
   a real party can take. U[4] is the joiner S-11 refuses. */
const U = [
  '00000000-0000-4000-8000-0000b8040101',
  '00000000-0000-4000-8000-0000b8040102',
  '00000000-0000-4000-8000-0000b8040103',
  '00000000-0000-4000-8000-0000b8040104',
];
const JOINER = '00000000-0000-4000-8000-0000b8040105';
const NAME = (u) => `Hunt Probe ${u.slice(-3)}`;

const problems = [];
const judge = (id, pass, good, bad) => {
  if (pass) console.log(`  ✓ ${id} — ${good}`);
  else { console.log(`  ✗ ${id} — ${bad}`); problems.push(id); }
};
const group = (t) => console.log(`\n${t}`);
const harness = (msg) => { const e = new Error(msg); e.harness = true; return e; };

// ── THE MUTANTS ────────────────────────────────────────────────────────────
const MUTANTS = {
  /* B-A1. §18.1 prices the BOUNDARY and not the VERB, and a start closes FOUR
     characters' windows at an instant the leader chooses. A start that never
     counts re-opens S-6's re-roll lever through a door S-6's wording did not
     cover — which is the whole of the question §18-SEC-2.2 asked S4 to rule. */
  budgetNotCounted: { file: F2, arm: 'B-A1', pair: [
    '  if not public.hr_party_boundary_room(v_pid) then\n'
    + "    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'party_settle_churn',",
    '  if false then\n'
    + "    perform public.hr_record_rejection(v_uid, v_slot, 'party_hunt_start', 'party_settle_churn',"] },
  /* B-A6. The start is the FIRST cross-user write in the architecture, and its
     failure mode is a party whose hunt is live while three of its four members
     are still pointed somewhere else: the settle then refuses `channel_moved`
     for them forever and the party wedges with its window growing against the
     24 h cap. All-or-nothing is not tidiness. */
  partialStart: { file: F2, arm: 'B-A6', pair: [
    '      from public.party_member m\n'
    + '     where m.party_id = v_pid and m.left_at is null\n'
    + '       and ps.user_id = m.user_id and ps.slot = m.slot;',
    '      from public.party_member m\n'
    + '     where m.party_id = v_pid and m.left_at is null\n'
    + '       and ps.user_id = m.user_id and ps.slot = m.slot\n'
    + '       and ps.user_id = v_uid;   /* --mutate partialStart */'] },
  /* T-3. The leader kicks at minute 59 of a sixty-minute window and the
     removed member loses the fellowship bonus and the XP floor for all of it.
     §18.4: "the kick is never the cheaper path." */
  leftAtWritten: { file: F2, arm: 'T-3', pair: [
    '    if not public.hr_party_settle_current(v_pid) then\n'
    + '      -- The key is RELEASED so an honest retry works, exactly as',
    '    if false then\n'
    + '      -- The key is RELEASED so an honest retry works, exactly as'] },
  /* S-3 and AWAY-12. A client verb that runs the settle is a SECOND settler,
     and it would run it with deltas no simulation produced, for a window three
     other players are paid from. */
  secondSettlePath: { file: F2, arm: 'S-3', pair: [
    '  update public.party_hunt\n'
    + "     set ended_at = now(), stopped_by = 'leader', version = version + 1\n"
    + '   where id = v_hunt.id and ended_at is null;',
    "  perform public.hr_party_tick_settle('stop', v_pid, v_hunt.accrued_to, now(),\n"
    + "                                     p_idem, '[]'::jsonb);\n"
    + '  update public.party_hunt\n'
    + "     set ended_at = now(), stopped_by = 'leader', version = version + 1\n"
    + '   where id = v_hunt.id and ended_at is null;'] },
  /* `party_tick_lease` is readable by NO role and `hr_party_mark` is granted to
     nobody, precisely so that "the server picks whose world ticks, and from
     when" is a claim about a row somebody else wrote rather than about a
     request. A refusal that hands the leader the watermark is that fence open,
     wearing a better error message — which is exactly how S-13's invite oracle
     would have shipped. */
  /* Security E1. The `party` row lock serialises the start against an accept,
     a leave, a kick and another start — it does NOT serialise it against a
     member's OWN solo settle, which takes nothing on `party`. Until the hunt
     row commits hr_partied is FALSE for all four, so hr_tick_settle may move
     any member's accrued_to between the assertion and the commit, and the start
     then commits invariant 8 BROKEN. hr_party_tick_settle catches it — and
     refuses with `party_window_already_settled`, the same string a benign CAS
     refusal returns, so the hunt wedges for its whole life invisibly. */
  unlockedInvariant8: { file: F2, arm: 'E1', pair: [
    '   order by ps.user_id, ps.slot\n'
    + '     for update of ps;',
    '   order by ps.user_id, ps.slot;   /* --mutate unlockedInvariant8 */'] },
  /* Security E2. hr_party_view's column set is FROZEN without user_id and
     without slot, and S1 resolves a kick by name "and not by user id" for that
     reason. An auth.users id in a refusal is that column set widened without
     the review its own comment demands — a stable cross-account handle that
     survives a rename and carries the slot with it (S-13). */
  refusalNamesAccount: { file: F2, arm: 'E2', pair: [
    "      'detail', jsonb_build_object('member', v_m.who, 'why', 'window_open')); end if;",
    "      'detail', jsonb_build_object('user', v_m.user_id, 'slot', v_m.slot,\n"
    + "                                  'why', 'window_open')); end if;"] },
  refusalLeaksWatermark: { file: F2, arm: 'MARK', pair: [
    "      return jsonb_build_object('ok', false, 'error', 'party_settle_required');",
    "      return jsonb_build_object('ok', false, 'error', 'party_settle_required',\n"
    + "        'mark', public.hr_party_mark(v_pid));"] },
};

/* STAGE 2. With file 2's whole §6 self-check disabled the mutant reaches this
   file's arms, and the named arm must be what catches it. One anchor rather
   than neutering gate after gate: a proof that has to chip away at six
   assertions is a demolition, not a detection. */
const NEUTER_SELFCHECK = [
  'begin\n  -- (y) NOT A PAYER, PROVED BY READING THE INSTALLED BODIES.',
  'begin\n  return;   -- tests/party-hunt.mjs --mutate stage 2\n'
  + '  -- (y) NOT A PAYER, PROVED BY READING THE INSTALLED BODIES.',
];
const STAGE2 = ['budgetNotCounted', 'partialStart', 'leftAtWritten',
  'unlockedInvariant8', 'refusalNamesAccount'];

console.log('party-hunt: M8 slice 4, four members through the hunt intents and one fenced settle'
  + (MUTATE ? '  [--mutate: seven apply-time mutants, five of them re-run against THIS file]' : ''));

// ── STAGE 1 OF THE MUTATION PROOF ──────────────────────────────────────────
// Planted alone, EVERY one of these must be refused BY THE APPLY, because the
// migrations' own §4 blocks execute each property. A batch that installs the
// defect is the failure; a batch that refuses to install is the fence working
// at the earliest possible moment.
if (MUTATE) {
  group('M  each mutant is refused by the APPLY (the migrations\' own §4 blocks)');
  for (const [name, m] of Object.entries(MUTANTS)) {
    let failed = null;
    try {
      const r = await bootReplay({ upTo: F3, patches: new Map([[m.file, [m.pair]]]) });
      failed = r.failures[0] || null;
      await r.db.close();
    } catch (e) {
      failed = (e.failures && e.failures[0])
        || { file: m.file, error: String(e.message).split('\n').find((l) => l.includes('GATE(')) || String(e.message).split('\n')[0] };
    }
    judge(`M-${name}`, !!failed && /GATE\(/.test(String(failed.error || '')),
      `${m.arm} — the apply REFUSED it: "${String(failed?.error || '').slice(0, 100)}…"`,
      `the mutated batch APPLIED, or failed for another reason: ${JSON.stringify(failed)}`);
  }
  console.log('\n(the base run below then proves the unmutated batch is green — a mutation\n'
    + ' proof whose base run is red proves only that something is broken)');
}

const { db, failures } = await bootReplay({ upTo: F3 });
if (failures.length) {
  console.error('the schema replay did not complete:', failures);
  process.exit(2);
}

const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const as = async (uid) => db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
const call = async (sql, params) => (await q(`select ${sql} as r`, params))[0].r;
const uuid = async () => (await one('select gen_random_uuid() as u')).u;
const asRole = async (role, fn) => {
  await db.exec(`set role ${role};`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
};
/* The `party` bucket is 12 calls per USER per MINUTE and this guard makes far
   more than that in far less than a minute. Arm GATE proves the bucket is real
   and BITES before anything clears it, so the reset can never be the thing
   hiding a missing gate (guard-hygiene R3). */
const ungate = () => db.exec('delete from public.hr_rate_counters;');

const HOLDER = 'guard:party-hunt';
let party = null;
let hunt = null;
let at = null;

try {
  for (const uid of [...U, JOINER]) {
    await db.exec(`insert into auth.users (id) values ('${uid}') on conflict do nothing;`);
    await as(uid);
    const made = await call('public.hr_create_character(0)');
    if (made?.ok !== true) throw harness(`could not create a character for ${uid}: ${JSON.stringify(made)}`);
    const named = await call('public.claim_display_name($1)', [NAME(uid)]);
    if (named?.ok !== true) throw harness(`could not claim a name for ${uid}: ${JSON.stringify(named)}`);
  }
  await as('');
  await db.exec("update public.hr_tick_config set enabled = true, shadow = true,"
    + " channels = array['combat','gather']::text[] where id;");

  // ══ P-IDEM ═══════════════════════════════════════════════════════════════
  // Run BEFORE the party is planted: file 1 §7(z) and file 2 §6(z) both assert
  // the S4 tables hold ZERO rows after an apply, so a re-apply over this
  // guard's own fixture would fail those gates for the right reason and be
  // graded as a broken migration.
  group('P-IDEM  the three migrations re-apply byte-identically');
  {
    const before = await inventory(db);
    let err = null;
    for (const f of [F1, F2, F3]) {
      const sql = (await readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8')).replace(/\r\n/g, '\n');
      try { await db.exec(sql); } catch (e) { err = `${f}: ${String(e.message).split('\n')[0]}`; break; }
    }
    const after = err ? null : await inventory(db);
    judge('P-IDEM', !err && after && JSON.stringify(before) === JSON.stringify(after),
      'all three re-applied cleanly — every §4 self-check passed a SECOND time against a database '
      + 'that already holds the objects, and the schema inventory is byte-identical. File 2 PATCHES '
      + 'two existing bodies, so this is also the proof that the patch is skipped rather than '
      + 'applied twice',
      err
        ? `a re-apply FAILED: ${err}. tools/apply-migration.mjs is run by hand on a file that may `
          + 'already be in; "additive and idempotent" has to be a measurement, not a header.'
        : 'the re-apply changed the schema inventory — the second run is not a no-op');
    const twice = await one("select (length(p.prosrc) - length(replace(p.prosrc, 'M8 S4 T-3', '')))"
      + " / length('M8 S4 T-3') as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace"
      + " where ns.nspname = 'public' and p.proname = 'hr_party_kick'");
    judge('P-IDEM2', Number(twice?.n) === 1,
      'hr_party_kick carries T-3 exactly ONCE after two applies — the patch is guarded by its own '
      + 'sentinel, so a second apply cannot staple a second copy of the fence into the body',
      `the T-3 sentinel appears ${twice?.n} time(s) in hr_party_kick after the re-apply`);
  }

  // ══ GATE — THE BUCKET IS REAL AND IT BITES ═══════════════════════════════
  group('GATE  the `party` bucket admits the hunt verbs and refuses the 13th call in a minute');
  {
    await as(U[0]);
    const seen = [];
    for (let i = 0; i < 13; i++) {
      seen.push((await call('public.hr_party_hunt_stop(0, $1::uuid)', [await uuid()]))?.error);
    }
    judge('GATE', seen[0] === 'not_in_party' && seen[12] === 'rate_limited',
      'the first call is answered by the verb and the thirteenth is refused rate_limited — the '
      + 'hunt verbs are admitted by hr_rpc_gate on the `party` bucket (an UNKNOWN bucket fails '
      + 'CLOSED, so a verb whose bucket was lost in a restatement ships green and dead)',
      `call 1 answered ${seen[0]}, call 13 answered ${seen[12]}`);
    await ungate();
  }

  // ══ THE PARTY, FORMED THROUGH THE REAL VERBS ═════════════════════════════
  await as(U[0]);
  party = (await call('public.hr_party_create(0, $1::uuid)', [await uuid()]))?.party_id ?? null;
  if (!party) throw harness('could not form the probe party');
  for (const uid of U.slice(1)) {
    await as(U[0]);
    const sent = await call('public.hr_party_invite(0, $1, $2::uuid)', [NAME(uid), await uuid()]);
    if (sent?.ok !== true) throw harness(`invite refused: ${JSON.stringify(sent)}`);
    const inv = await one('select id from public.party_invite where party_id = $1 and user_id = $2'
      + ' and slot = 0 and accepted_at is null and revoked_at is null', [party, uid]);
    await as(uid);
    const got = await call('public.hr_party_accept(0, $1::uuid, $2::uuid)', [inv.id, await uuid()]);
    if (got?.ok !== true) throw harness(`accept refused: ${JSON.stringify(got)}`);
    await ungate();
    /* ★ THE JOINER'S CARD IS ISSUED WHILE THERE IS STILL ROOM, and held.
       hr_party_invite refuses party_full on the LIVE MEMBER count, so a card
       for a party that later fills is exactly the card S-11 is about: a live
       invite, accepted after the hunt started. Accepting it must answer
       party_hunt_running and NOT party_full — the accept tests the live hunt
       BEFORE the size, which is the order that makes S-11 reachable at all. */
    if (uid === U[1]) {
      await as(U[0]);
      const toJoiner = await call('public.hr_party_invite(0, $1, $2::uuid)', [NAME(JOINER), await uuid()]);
      if (toJoiner?.ok !== true) throw harness(`joiner invite refused: ${JSON.stringify(toJoiner)}`);
      await ungate();
    }
  }
  /* ONE COMMON WATERMARK, WHICH IS WHAT A COLLECT-FIRST HALF LEAVES BEHIND.
     Far enough back that the window walked below still ends before now(): the
     settle refuses `window_in_future` past 60 s of skew, and a fixture that
     drifts forward grades every later arm as that refusal instead of as the
     property it was written for. */
  at = (await one("select date_trunc('second', now()) - interval '300 seconds' as t")).t;
  await q('update public.player_state set accrued_to = $2 where user_id = any($1::uuid[]) and slot = 0', [U, at]);
  await as(U[0]);

  // ══ S  THE REFUSALS AT THE START DOOR ════════════════════════════════════
  group('S  the start refuses what §18.1 says it refuses, and writes nothing when it does');
  {
    await as(U[1]);
    const notLeader = await call('public.hr_party_hunt_start(0, $1, $2, $3::jsonb, $4::uuid)',
      ['slime', 'steady', '{}', await uuid()]);
    judge('S1', notLeader?.error === 'not_party_leader',
      'only the leader may start — §18.1, and the button is not rendered for anybody else',
      `a non-leader start answered ${JSON.stringify(notLeader)}`);
    await as(U[0]);

    /* THE SPREAD, RAISED THROUGH THE SERVER'S OWN SKILL ROWS. hr_party_level
       reads player_skills, so a level asserted any other way would be grading
       this arm's arithmetic rather than the server's. */
    await q("insert into public.player_skills (user_id, slot, skill_id, xp)"
      + " values ($1,0,'attack',5000000),($1,0,'strength',5000000),($1,0,'defense',5000000),"
      + "($1,0,'hitpoints',5000000)"
      + ' on conflict (user_id, slot, skill_id) do update set xp = excluded.xp', [U[3]]);
    const spread = await call('public.hr_party_hunt_start(0, $1, $2, $3::jsonb, $4::uuid)',
      ['slime', 'steady', '{}', await uuid()]);
    judge('S2', spread?.error === 'party_level_spread',
      'a party spanning more than TEN combat levels cannot start — §18.1 writes the number once '
      + 'and S-12 checks it at start AND on accept, never continuously',
      `a 90-level spread answered ${JSON.stringify(spread)}`);
    await q("delete from public.player_skills where user_id = $1 and slot = 0"
      + " and skill_id in ('attack','strength','defense','hitpoints')", [U[3]]);

    await q("update public.player_state set recovering_until = now() + interval '5 minutes'"
      + ' where user_id = $1 and slot = 0', [U[2]]);
    const rec = await call('public.hr_party_hunt_start(0, $1, $2, $3::jsonb, $4::uuid)',
      ['slime', 'steady', '{}', await uuid()]);
    judge('S3', rec?.error === 'party_member_recovering'
      && rec?.detail?.member === NAME(U[2]) && Number(rec?.detail?.remaining_ms) > 0,
      'a party with a knocked-out member cannot start, and the refusal carries the member and '
      + '`remaining_ms` so the client renders a COUNTDOWN rather than a retry loop (§18.3: it is '
      + 'STATEFUL, so it is not on STATELESS_REFUSALS)',
      `a recovering member answered ${JSON.stringify(rec)}`);
    /* ★ Security E2 — AND IT NAMES THE MEMBER, NEVER THE ACCOUNT. hr_party_view's
       column set is FROZEN at name, combat_level, hp, hp_max, recovering_until,
       share_bp, xp, gold — no user_id, no slot — and S1 resolves a kick by name
       "and not by user id" for that reason. An auth.users id handed to a client
       is a stable cross-account handle: it survives a rename, carries the slot
       with it, and is the ready-made argument for every (user, slot) predicate
       S1 refuses to grant (S-13). §18.3's own copy is "Ilse is recovering". */
    judge('S3b', !('user' in (rec?.detail ?? {})) && !('slot' in (rec?.detail ?? {}))
      && !JSON.stringify(rec).includes(U[2]),
      'and it names the member the way the panel does — by NAME — handing back no account id and '
      + 'no slot: hr_party_view\'s column set is frozen without them, and "a column added here is '
      + 'a code change with a review"',
      `the refusal carried an account identifier: ${JSON.stringify(rec)}`);
    await q('update public.player_state set recovering_until = null where user_id = $1 and slot = 0', [U[2]]);
    await ungate();

    // ★ B-A6 — THE FOUR-MEMBER ALL-OR-NOTHING, AND THE ASSERTION IS ZERO ROWS
    await q("update public.player_state set accrued_to = $2::timestamptz - interval '4 minutes'"
      + ' where user_id = $1 and slot = 0', [U[3], at]);
    const unc = await call('public.hr_party_hunt_start(0, $1, $2, $3::jsonb, $4::uuid)',
      ['slime', 'careful', '{"hours": 6}', await uuid()]);
    judge('S4', unc?.error === 'member_uncollectable'
      && unc?.detail?.member === NAME(U[3]) && unc?.detail?.why === 'window_open',
      'a start with ONE of four members\' windows still open is refused member_uncollectable, '
      + 'naming that member — the equality invariant 8 needs has to be ESTABLISHED, and admitting '
      + 'them would stamp three other players forward without collecting them',
      `the fourth member's open window answered ${JSON.stringify(unc)}`);
    /* Security E2 again, and one field further: not the WATERMARK either.
       hr_party_mark is granted to nobody precisely so that "the server picks
       whose world ticks, and from when" is a claim about a row somebody else
       wrote rather than about a request a leader can make. */
    judge('S4b', !JSON.stringify(unc).includes(U[3])
      && !('accrued_to' in (unc?.detail ?? {})) && !('party_at' in (unc?.detail ?? {})),
      'and it carries no account id, no slot and no watermark — §18.3\'s copy is a NAME '
      + '("Couldn\'t price Bram\'s last session"), and the ids stay in hr_rejections where an '
      + 'operator reads them',
      `member_uncollectable leaked: ${JSON.stringify(unc)}`);

    const wrote = await one('select (select count(*) from public.party_hunt where party_id = $1) as hunts,'
      + ' (select count(*) from public.party_settle_boundary where party_id = $1) as boundaries,'
      + " (select count(*) from public.player_state where user_id = any($2::uuid[]) and slot = 0"
      + "   and (active_kind is distinct from 'idle' or active_id is not null)) as pointers,"
      + ' (select count(*) from public.party_member where party_id = $1 and left_at is not null) as closed',
      [party, U]);
    judge('S5', Number(wrote.hunts) === 0 && Number(wrote.boundaries) === 0
      && Number(wrote.pointers) === 0 && Number(wrote.closed) === 0,
      'and it wrote ZERO ROWS ANYWHERE — no party_hunt row, no boundary spent, no pointer moved, '
      + 'no membership closed (B-A6: "a member_uncollectable on any one member leaves all four '
      + 'windows intact and no left_at, no pointer and no watermark written")',
      `the refused start left hunts=${wrote.hunts} boundaries=${wrote.boundaries} `
      + `pointers=${wrote.pointers} closed=${wrote.closed}`);

    const marks = await q('select accrued_to from public.player_state where user_id = any($1::uuid[])'
      + ' and slot = 0 order by user_id', [U]);
    judge('S6', marks.slice(0, 3).every((m) => new Date(m.accrued_to).getTime() === new Date(at).getTime())
      && new Date(marks[3].accrued_to).getTime() === new Date(at).getTime() - 240000,
      'all four windows are INTACT — the three that were ready and the one that was not, each '
      + 'still exactly where it was',
      `the member watermarks are ${marks.map((m) => m.accrued_to).join(', ')}`);
    await q('update public.player_state set accrued_to = $2 where user_id = $1 and slot = 0', [U[3], at]);
    await ungate();
  }

  // ══ H  THE HAPPY PATH, AND INVARIANT 8 AT THE COMMIT BOUNDARY ════════════
  group('H  the hunt starts, and the party watermark IS every member\'s watermark');
  {
    const r = await call('public.hr_party_hunt_start(0, $1, $2, $3::jsonb, $4::uuid)',
      ['slime', 'careful', '{"hours": 6}', await uuid()]);
    hunt = r?.hunt_id ?? null;
    judge('H1', r?.ok === true && !!hunt && r.stance === 'careful',
      'the leader started with team: one party_hunt row carrying the monster, the stance and the '
      + 'stop rules as data — the M6 vocabulary reused, never forked',
      `the start answered ${JSON.stringify(r)}`);

    const row = await one('select active_id, stance, stop, accrued_to, ended_at from public.party_hunt'
      + ' where party_id = $1', [party]);
    judge('H2', row && row.active_id === 'slime' && row.stance === 'careful'
      && JSON.stringify(row.stop) === '{"hours":6}' && row.ended_at === null
      && new Date(row.accrued_to).getTime() === new Date(at).getTime(),
      'the party watermark is the members\' own common watermark — the start ESTABLISHED '
      + 'invariant 8 by assertion and moved nobody, so hr_party_tick_settle is still the only '
      + 'writer of either side of it',
      `the hunt row is ${JSON.stringify(row)}, wanted accrued_to ${at}`);

    const ptr = await q('select user_id, active_kind, active_id, accrued_to from public.player_state'
      + ' where user_id = any($1::uuid[]) and slot = 0 order by user_id', [U]);
    judge('H3', ptr.length === 4 && ptr.every((p) => p.active_kind === 'combat'
      && p.active_id === 'slime'
      && new Date(p.accrued_to).getTime() === new Date(at).getTime()),
      'all four pointers moved in ONE transaction and all four watermarks are unchanged — the '
      + 'cross-user write B-A6 names is the POINTER ONLY, because stamping a watermark forward '
      + 'without collecting confiscates three other players\' minutes',
      `the member rows are ${JSON.stringify(ptr)}`);

    const partied = await one('select count(*)::int as n from unnest($1::uuid[]) x'
      + ' where public.hr_partied(x, 0)', [U]);
    const solo = await asRole('hr_tick', () => q(
      "select user_id from public.hr_tick_roster(array['combat']::text[], 0, 50, $1)"
      + ' where user_id = any($2::uuid[])', [HOLDER, U]));
    judge('H4', Number(partied.n) === 4 && solo.length === 0,
      'hr_partied is true for all four and the PER-CHARACTER roster offers none of them — '
      + 'invariant 7 is what stops the solo settle paying one member the whole party stream and '
      + 'the party settle then failing its CAS and wedging',
      `hr_partied is true for ${partied.n} of 4 and the solo roster offered ${solo.length}`);

    const again = await call('public.hr_party_hunt_start(0, $1, $2, $3::jsonb, $4::uuid)',
      ['slime', 'steady', '{}', await uuid()]);
    judge('H5', again?.error === 'party_hunt_running'
      && Number((await one('select count(*) as n from public.party_hunt where party_id = $1', [party])).n) === 1,
      'a second start is refused party_hunt_running and leaves no second hunt row — the partial '
      + 'unique index is the authority for the race, and this read is what turns a 23505 into a '
      + 'string the client can map',
      `a second start answered ${JSON.stringify(again)}`);

    const spent = await one('select public.hr_party_boundaries_today($1) as n', [party]);
    judge('H6', Number(spent.n) === 1,
      'the start spent exactly ONE of §18.1\'s eight boundaries — B-A1\'s ruling: a start closes '
      + 'four characters\' windows at an instant the leader chooses, so it IS a boundary, and '
      + '§18.1 prices the BOUNDARY rather than the VERB',
      `the start spent ${spent.n} boundaries`);

    /* ★ H7 — Security E1. Invariant 8 is asserted against LOCKED rows. The
       `party` row lock serialises the start against an accept, a leave, a kick
       and another start; it takes NOTHING that a member's own solo settle
       takes, and until the hunt row commits `hr_partied` is FALSE for all four
       — so hr_tick_settle may move any member's accrued_to between the
       assertion and the commit. The start would then commit with
       party_hunt.accrued_to behind one member, and hr_party_tick_settle would
       refuse that party for the life of its hunt under
       `party_window_already_settled` — the same string a benign CAS refusal
       returns, which is how it would sit at zero for days with nobody able to
       see it (CLAUDE.md §3.4). Read off the INSTALLED body, and by POSITION:
       a lock taken after the read it protects locks nothing. */
    const startSrc = (await one("select p.prosrc as src from pg_proc p"
      + " join pg_namespace n on n.oid = p.pronamespace"
      + " where n.nspname = 'public' and p.proname = 'hr_party_hunt_start'")).src;
    const lockAt = startSrc.indexOf('for update of ps');
    const readAt = startSrc.indexOf('max(ps.accrued_to)');
    judge('H7', lockAt >= 0 && readAt >= 0 && lockAt < readAt,
      'the start locks every live member\'s player_state row, in (user_id, slot) order, BEFORE it '
      + 'reads the common watermark — hr_party_tick_settle\'s own lock order, so the two can only '
      + 'wait on each other and never circularly, and a member\'s own solo settle cannot break '
      + 'invariant 8 between the assertion and the commit',
      `for update of ps at ${lockAt}, max(ps.accrued_to) at ${readAt} — the equality is asserted `
      + 'against rows this transaction does not hold');
    await ungate();
  }

  // ══ S-11  AN ACCEPT INTO A LIVE HUNT, AGAINST THE NOW-REAL PREDICATE ═════
  group('S-11  hr_party_accept is refused party_hunt_running by a hunt that really exists');
  {
    const inv = await one('select id from public.party_invite where party_id = $1 and user_id = $2'
      + ' and slot = 0 and accepted_at is null and revoked_at is null', [party, JOINER]);
    if (!inv) throw harness('the joiner has no live card — the fixture issued it while there was room');
    await as(JOINER);
    const got = await call('public.hr_party_accept(0, $1::uuid, $2::uuid)', [inv.id, await uuid()]);
    judge('S11', got?.error === 'party_hunt_running',
      'S-11 now fires against a REAL live party_hunt rather than S1\'s `select false` stub: a '
      + 'joiner mid-hunt is otherwise inside the next party window with their own accrued_to days '
      + 'back, and the settle either wedges on them forever or confiscates their entire away window',
      `an accept into a live hunt answered ${JSON.stringify(got)}`);
    judge('S11b', (await one('select public.hr_party_of($1, 0) as p', [JOINER])).p === null,
      'and the refused accept wrote no membership row',
      'the refused accept added the joiner to the party anyway');
    await as(U[0]);
    await ungate();
  }

  // ══ P-SETTLE  THE WINDOW GOES THROUGH S2's SETTLE AND NOTHING ELSE ═══════
  group('P-SETTLE  one window, settled once, in shadow — four rows and not one coin');
  /* THE WINDOW ENDS AT THE SERVER'S OWN NOW, not at a fixed offset from `at`.
     Two bounds squeeze it from both sides and a fixed offset satisfies only
     one of them: the settle refuses `window_in_future` past 60 s of skew, and
     hr_party_settle_current — the fence T-3 rests on — reads the mark against
     the SAME 60 s. A window that closed five minutes ago is a settle that
     really has gone stale, so PS5 below would be grading the fixture's clock
     rather than the fence. */
  const to = (await one("select date_trunc('second', now()) - interval '5 seconds' as t")).t;
  {
    const units = await asRole('hr_tick', () => q(
      "select party_id, member_count from public.hr_party_roster(array['combat']::text[], 50, $1)"
      + ' where party_id = $2', [HOLDER, party]));
    judge('PS1', units.length === 1 && Number(units[0].member_count) === 4,
      'the PARTY roster offers the hunt the verb started, as ONE unit with four members — the '
      + 'lease row is seeded by the roster, so a hunt started by S4 is servable on the next fire '
      + 'without S4 writing a lease',
      `the party roster returned ${units.length} row(s) for this party`);

    const ledgerBefore = Number((await one('select count(*)::int as n from public.player_ledger')).n);
    const rows = await q('select user_id, slot, version from public.player_state'
      + ' where user_id = any($1::uuid[]) and slot = 0 order by user_id', [U]);
    const members = rows.map((r, i) => ({
      user: r.user_id, slot: r.slot, version: Number(r.version),
      delta: {
        gold: 4 + i, accrued_to: to,
        journal: {
          kind: 'combat', intent: 'accrue',
          meta: {
            ms: 90000, ticks: 9, kills: 2, capped: false, ate: 0, from: at, to, src: 'tick',
            party: { id: party, hunt, dmg_bp: 2500, xp_bp: 2500, floor: 0, fellow_bp: 1500, roll: 4242 },
          },
        },
      },
    }));
    const res = await asRole('hr_engine', async () => (await one(
      'select public.hr_party_tick_settle($1::text, $2::uuid, $3::timestamptz, $4::timestamptz,'
      + ' gen_random_uuid(), $5::text::jsonb) as r',
      [HOLDER, party, at, to, JSON.stringify(members)])).r);
    judge('PS2', res?.ok === true && res.mode === 'shadow' && Number(res.journalled) === 4,
      'ONE call settled all four members of the hunt the VERB started and journalled four rows',
      `the settle answered ${JSON.stringify(res)}`);

    const shadow = await q('select user_id, delta, party from public.hr_tick_shadow'
      + ' where party is not null order by user_id');
    const want = [...PARTY_JOURNAL_KEYS].sort().join(',');
    judge('PS3', shadow.length === 4
      && shadow.every((r) => Object.keys(r.party).sort().join(',') === want)
      && shadow.every((r) => r.delta?.journal?.meta?.party === undefined),
      `four shadow rows carry the attribution as EXACTLY the frozen seven (${want}), and the `
      + 'stored delta carries no party key at any level — so it is byte-for-byte what a SOLO '
      + 'settle stores (S-1, and what makes (P-a) a byte comparison rather than an argument)',
      `${shadow.length} shadow row(s); key sets `
      + `${JSON.stringify([...new Set(shadow.map((r) => Object.keys(r.party).sort().join(',')))])}`);

    const ledgerAfter = Number((await one('select count(*)::int as n from public.player_ledger')).n);
    const hm = await one('select accrued_to from public.party_hunt where id = $1', [hunt]);
    const lease = await one('select shadow_accrued_to from public.party_tick_lease where party_id = $1', [party]);
    judge('PS4', ledgerAfter === ledgerBefore
      && new Date(hm.accrued_to).getTime() === new Date(at).getTime()
      && new Date(lease.shadow_accrued_to).getTime() === new Date(to).getTime(),
      'SHADOW PAID NOTHING: zero ledger rows, the party watermark unmoved, and the chain carried '
      + 'on the party\'s OWN shadow mark — §15c\'s rule at party grain, so windows cannot overlap '
      + 'while nothing is being paid',
      `ledger ${ledgerBefore} -> ${ledgerAfter}; party mark ${hm.accrued_to}; shadow mark ${lease?.shadow_accrued_to}`);

    judge('PS5', (await one('select public.hr_party_settle_current($1) as c', [party])).c === true,
      'and the party now reads as SETTLED — which is the whole of what T-3 asks before a '
      + 'membership row may close, and the only thing a client verb can ever assert about a '
      + 'settle it is structurally unable to run',
      'a party settled to the top of its window does not read as settled, so every kick would be '
      + 'refused party_settle_required forever');
  }

  // ══ T-3  KICK-BEFORE-SPLIT, IN BOTH DIRECTIONS ═══════════════════════════
  group('T-3  the settle runs, THEN the membership row closes');
  {
    /* Put the party back behind its window so the settle is no longer current:
       this is the party whose collect-first half could not run, which is the
       case T-3 was written for. */
    await q('update public.party_tick_lease set shadow_accrued_to = null where party_id = $1', [party]);
    await q("update public.party_hunt set accrued_to = now() - interval '45 minutes' where id = $1", [hunt]);
    judge('T3a', (await one('select public.hr_party_settle_current($1) as c', [party])).c === false,
      'a party forty-five minutes behind its window does not read as settled',
      'a party forty-five minutes behind its window reads as settled — the fence is open');

    await as(U[0]);
    const refused = await call('public.hr_party_kick(0, $1, $2::uuid)', [NAME(U[3]), await uuid()]);
    judge('T3b', refused?.error === 'party_settle_required',
      'a kick during a live hunt whose window CANNOT be settled is REFUSED — §18.4: "the kick is '
      + 'never the cheaper path", and a refusal here holds nobody, because the member stays in '
      + 'the party they are already in',
      `the kick answered ${JSON.stringify(refused)}`);
    judge('T3c', Object.keys(refused || {}).sort().join(',') === 'error,ok',
      'and the refusal says ONLY that — no watermark, no lease, no mode. party_tick_lease is '
      + 'readable by no role and hr_party_mark is granted to nobody precisely so that "the server '
      + 'picks whose world ticks, and from when" is a claim about a row somebody else wrote '
      + 'rather than about a request a leader can make',
      `the refusal carried ${JSON.stringify(refused)} — a refusal that hands back the watermark `
      + 'is the S2 fence open, wearing a better error message');

    const live = await one('select left_at from public.party_member where party_id = $1'
      + ' and user_id = $2 and slot = 0', [party, U[3]]);
    judge('T3d', live?.left_at === null,
      '★ and left_at is UNWRITTEN — the membership is still live. §18-SEC.3\'s S4 list asks for '
      + 'exactly this: a refusal that removed the member anyway would be the kick succeeding with '
      + 'an error message stapled to it',
      `the refused kick wrote left_at = ${live?.left_at}`);
    judge('T3e', (await one("select count(*)::int as n from public.player_intents"
      + " where user_id = $1 and intent = 'party_kick'", [U[0]])).n === 0
      && Number((await one('select public.hr_party_boundaries_today($1) as n', [party])).n) === 1,
      'the refused kick released its idempotency key and spent no boundary — an honest retry '
      + 'works and a refusal cannot eat the party\'s own budget',
      'the refused kick kept its key or spent a boundary');

    /* …and once the settle HAS run, the same kick lands. A fence that only ever
       refuses is not a fence. */
    await q('update public.party_tick_lease set shadow_accrued_to = now() where party_id = $1', [party]);
    const ok = await call('public.hr_party_kick(0, $1, $2::uuid)', [NAME(U[3]), await uuid()]);
    judge('T3f', ok?.ok === true
      && (await one('select left_at from public.party_member where party_id = $1 and user_id = $2'
        + ' and slot = 0', [party, U[3]]))?.left_at !== null
      && Number((await one('select public.hr_party_boundaries_today($1) as n', [party])).n) === 2,
      'and once the settle has run the same kick LANDS, closing the row and spending the second '
      + 'boundary of the day',
      `the kick after a settle answered ${JSON.stringify(ok)}`);
    await ungate();
  }

  // ══ P-B-A1  THE EIGHT, ACROSS ALL FOUR DOORS ═════════════════════════════
  group('P-B-A1  eight boundaries a day, counted at every door, and never a held player');
  {
    await q("insert into public.party_settle_boundary (party_id, day_key, verb, user_id, slot)"
      + " select $1, public.hr_utc_day_key(now()), 'party_leave', $2, 0 from generate_series(1, 6)",
      [party, U[0]]);
    judge('B1', (await one('select public.hr_party_boundary_room($1) as r', [party])).r === false
      && Number((await one('select public.hr_party_boundaries_today($1) as n', [party])).n) === 8,
      'the party is at the ceiling: eight chosen boundaries on the server\'s UTC day',
      'the party is not at the ceiling after eight journalled boundaries');

    await as(U[2]);
    const left = await call('public.hr_party_leave(0, $1::uuid)', [await uuid()]);
    judge('B2', left?.ok === true && left?.notice === 'party_settle_churn'
      && (await one('select public.hr_party_of($1, 0) as p', [U[2]])).p === null,
      'a LEAVE past the eighth still lands, immediately, carrying notice=party_settle_churn — '
      + '§18.1 states it twice and unconditionally: "no refusal can ever hold a player in a '
      + 'party", and the leaver loses nothing because their own accrued_to is still the party '
      + 'watermark and their own roster prices the residual',
      `a leave past the ceiling answered ${JSON.stringify(left)}`);

    await as(U[0]);
    const stopped = await call('public.hr_party_hunt_stop(0, $1::uuid)', [await uuid()]);
    judge('B3', stopped?.ok === true && stopped?.notice === 'party_settle_churn'
      && stopped?.boundary_forced === false
      && (await one('select public.hr_party_hunt_live($1) as l', [party])).l === false,
      'a STOP past the eighth still ends the hunt, carrying the same notice — a refusal here '
      + 'would hold FOUR players in a hunt, which §18.1 forbids as unconditionally as it forbids '
      + 'holding one in a party',
      `a stop past the ceiling answered ${JSON.stringify(stopped)}`);

    judge('B4', Number((await one('select public.hr_party_boundaries_today($1) as n', [party])).n) === 8,
      'and neither of them spent a NINTH — past the ceiling the payment rides the tick\'s own '
      + 'cadence instead of forcing a boundary, which is the whole of S-6\'s clamp',
      `the party is at ${(await one('select public.hr_party_boundaries_today($1) as n', [party])).n} boundaries`);

    const ptr = await q("select count(*)::int as n from public.player_state"
      + " where user_id = any($1::uuid[]) and slot = 0 and active_kind = 'combat'", [[U[0], U[1]]]);
    judge('B5', Number(ptr[0].n) === 2,
      'the stop left every member pointer alone: active_kind is an input the open window is '
      + 'priced from, so idling a member here would confiscate the residual this verb cannot '
      + 'collect (CLAUDE.md §3 rule 3)',
      'the stop rewrote a member pointer without collecting the window it was priced from');

    await q('delete from public.party_settle_boundary where party_id = $1', [party]);
    await as(U[1]);
    await call('public.hr_party_leave(0, $1::uuid)', [await uuid()]);
    await as(U[0]);
    const tooSmall = await call('public.hr_party_hunt_start(0, $1, $2, $3::jsonb, $4::uuid)',
      ['slime', 'steady', '{}', await uuid()]);
    judge('B6', tooSmall?.error === 'party_too_small',
      'a party of ONE may not start — §18.1 fixes party size at 2..4, and a party whose friends '
      + 'have left is an ordinary state rather than a bug to file',
      `a party of one answered ${JSON.stringify(tooSmall)}`);
  }
} catch (e) {
  if (e.harness) { console.error(`\nharness: ${e.message}`); process.exit(2); }
  console.error('\nunexpected:', e);
  process.exit(2);
} finally {
  await db.close();
}

// ── STAGE 2 OF THE MUTATION PROOF ──────────────────────────────────────────
// With file 2's whole §6 self-check disabled, the mutant INSTALLS and this
// file's own arms have to catch it. An arm that only ever rides the migration's
// gate is not a standing guard the day someone edits the verb without
// re-running the apply — which is every day after this batch lands.
if (MUTATE) {
  group('M2  with the migration\'s §6 gate disabled, THIS file catches it');
  for (const name of STAGE2) {
    const m = MUTANTS[name];
    let verdict = null;
    try {
      const r = await bootReplay({ upTo: F3, patches: new Map([[m.file, [m.pair, NEUTER_SELFCHECK]]]) });
      if (r.failures.length) { verdict = { installed: false, why: r.failures[0]?.error }; }
      else { verdict = await stage2(r.db, name); await r.db.close(); }
    } catch (e) {
      verdict = { installed: false, why: String(e.message).split('\n')[0] };
    }
    judge(`M2-${name}`, verdict?.caught === true,
      `${m.arm} — the mutant INSTALLED and this guard went red on it: ${verdict?.saw}`,
      verdict?.installed === false
        ? `the mutant could not be installed for stage 2 (${verdict.why}), so this arm proved nothing`
        : `the mutant installed and this guard stayed GREEN: ${JSON.stringify(verdict)}`);
  }
}

if (problems.length) {
  console.error(`\nparty-hunt: ${problems.length} failed arm(s): ${problems.join(', ')}`);
  process.exit(1);
}
console.log('\nparty-hunt: green'
  + (MUTATE ? ' — and every mutant was caught, by the apply and, for five of them, by this file'
    : ''));

// ── stage 2 ────────────────────────────────────────────────────────────────
/** Replay the minimum fixture the named arm needs, on a database that holds the
    mutant, and report whether this guard's own property is violated. */
async function stage2(mdb, name) {
  const mq = async (sql, params) => (await mdb.query(sql, params)).rows;
  const m1 = async (sql, params) => (await mq(sql, params))[0];
  const mas = async (uid) => mdb.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  const mcall = async (sql, params) => (await mq(`select ${sql} as r`, params))[0].r;
  const mid = async () => (await m1('select gen_random_uuid() as u')).u;
  const mungate = () => mdb.exec('delete from public.hr_rate_counters;');

  for (const uid of U) {
    await mdb.exec(`insert into auth.users (id) values ('${uid}') on conflict do nothing;`);
    await mas(uid);
    await mcall('public.hr_create_character(0)');
    await mcall('public.claim_display_name($1)', [NAME(uid)]);
  }
  await mdb.exec("update public.hr_tick_config set enabled = true, shadow = true,"
    + " channels = array['combat','gather']::text[] where id;");
  await mas(U[0]);
  const p = (await mcall('public.hr_party_create(0, $1::uuid)', [await mid()]))?.party_id;
  for (const uid of U.slice(1)) {
    await mas(U[0]);
    await mcall('public.hr_party_invite(0, $1, $2::uuid)', [NAME(uid), await mid()]);
    const inv = await m1('select id from public.party_invite where party_id = $1 and user_id = $2'
      + ' and slot = 0 and accepted_at is null and revoked_at is null', [p, uid]);
    await mas(uid);
    await mcall('public.hr_party_accept(0, $1::uuid, $2::uuid)', [inv.id, await mid()]);
    await mungate();
  }
  const t0 = (await m1("select date_trunc('second', now()) - interval '300 seconds' as t")).t;
  await mq('update public.player_state set accrued_to = $2 where user_id = any($1::uuid[]) and slot = 0', [U, t0]);
  await mas(U[0]);

  if (name === 'budgetNotCounted') {
    await mq("insert into public.party_settle_boundary (party_id, day_key, verb, user_id, slot)"
      + " select $1, public.hr_utc_day_key(now()), 'party_leave', $2, 0 from generate_series(1, 8)",
      [p, U[0]]);
    const r = await mcall('public.hr_party_hunt_start(0, $1, $2, $3::jsonb, $4::uuid)',
      ['slime', 'steady', '{}', await mid()]);
    return { caught: r?.error !== 'party_settle_churn', saw: `the start past the eighth answered ${JSON.stringify(r)}` };
  }

  if (name === 'partialStart') {
    const r = await mcall('public.hr_party_hunt_start(0, $1, $2, $3::jsonb, $4::uuid)',
      ['slime', 'steady', '{}', await mid()]);
    if (r?.ok !== true) return { caught: false, saw: `the start itself failed: ${JSON.stringify(r)}` };
    const n = Number((await m1("select count(*)::int as n from public.player_state"
      + " where user_id = any($1::uuid[]) and slot = 0 and active_kind = 'combat'", [U])).n);
    return { caught: n !== 4, saw: `${n} of 4 members carry the party pointer` };
  }

  if (name === 'leftAtWritten') {
    const r = await mcall('public.hr_party_hunt_start(0, $1, $2, $3::jsonb, $4::uuid)',
      ['slime', 'steady', '{}', await mid()]);
    if (r?.ok !== true) return { caught: false, saw: `the start itself failed: ${JSON.stringify(r)}` };
    await mungate();
    const cur = (await m1('select public.hr_party_settle_current($1) as c', [p])).c;
    if (cur !== false) return { caught: false, saw: 'the fixture already reads as settled' };
    await mcall('public.hr_party_kick(0, $1, $2::uuid)', [NAME(U[3]), await mid()]);
    const row = await m1('select left_at from public.party_member where party_id = $1'
      + ' and user_id = $2 and slot = 0', [p, U[3]]);
    return { caught: row?.left_at !== null, saw: `the kick with no settle wrote left_at = ${row?.left_at}` };
  }

  if (name === 'unlockedInvariant8') {
    /* Two sessions racing on one PGlite connection is not something this
       harness can stage, and a flaky race is worse than no arm. The property
       that SURVIVES an edit is structural and it is read off the INSTALLED
       body: the lock exists, and it is taken BEFORE the read it protects. A
       lock taken after that read locks nothing. */
    const src = (await m1("select p.prosrc as src from pg_proc p"
      + " join pg_namespace n on n.oid = p.pronamespace"
      + " where n.nspname = 'public' and p.proname = 'hr_party_hunt_start'")).src;
    const lock = src.indexOf('for update of ps');
    const read = src.indexOf('max(ps.accrued_to)');
    return { caught: !(lock >= 0 && read >= 0 && lock < read),
      saw: `for update of ps at ${lock}, max(ps.accrued_to) at ${read}` };
  }

  if (name === 'refusalNamesAccount') {
    await mq("update public.player_state set accrued_to = $2::timestamptz - interval '4 minutes'"
      + ' where user_id = $1 and slot = 0', [U[3], t0]);
    const r = await mcall('public.hr_party_hunt_start(0, $1, $2, $3::jsonb, $4::uuid)',
      ['slime', 'steady', '{}', await mid()]);
    return { caught: r?.error === 'member_uncollectable' && JSON.stringify(r).includes(U[3]),
      saw: `member_uncollectable answered ${JSON.stringify(r)}` };
  }

  return { caught: false, saw: 'no stage-2 fixture for this mutant' };
}
