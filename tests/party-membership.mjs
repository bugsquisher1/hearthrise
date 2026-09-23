#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// tests/party-membership.mjs — THE PARTY IS A SERVER OBJECT, AND ONLY THE
//                              VERBS CAN CHANGE IT.
//
//   node tests/party-membership.mjs            the guard
//   node tests/party-membership.mjs --mutate   flip S-13's single refusal to
//                                              distinguishable strings and
//                                              require this guard to go RED
//
// M8 slice 1 (docs/planning/WORLD_TICK_DESIGN.md §18 and §18-SEC), built by
// lane/m8-parties-s1 as three migrations. This is the node half: two planted
// users on the PGlite chain replay run the whole membership journey as real
// `auth.uid()` values — create → invite → accept → leave → kick — and every
// refusal code the design names is asserted by EXIT CODE, not by expectation.
//
// ── WHY THIS EXISTS BESIDE THE MIGRATIONS' OWN §4 BLOCKS ────────────────────
// The §4 blocks run ONCE, at apply time, on the machine doing the apply. They
// are the thing that refuses to install a broken batch, and they are right to
// be there. They are not a standing guard: nothing re-runs them when someone
// edits hr_party_accept six weeks from now, and nothing re-runs them when S2
// gives hr_party_hunt_live a real body. This file runs on every push.
//
// It also asserts three properties a §4 block structurally cannot:
//
//   P-IDEM   the three files RE-APPLY byte-identically. tools/apply-migration
//            .mjs is run by hand, at speed, on a file that may already be in;
//            "additive and idempotent" is a claim in three headers and nothing
//            in the repo checked it. Measured here as a full schema inventory
//            before and after a second apply of all three.
//   P-S11    the S-11 refusal under a hr_party_hunt_live that returns TRUE.
//            The migration proves it with an in-transaction stub; this proves
//            it by PATCHING THE MIGRATION TEXT on the replay, which is the
//            shape S2 will actually ship.
//   P-POL    the SELECT policies do not recurse and do not reach a predicate
//            the caller cannot execute — read as `authenticated`, both ways.
//
// ── THE MUTATION PROOF (CLAUDE.md §4) ──────────────────────────────────────
// `--mutate` rewrites hr_party_invite's single-refusal line so that each cause
// answers its own string — exactly the oracle §18-SEC.1 S-13 exists to close —
// and REQUIRES arm S13a to go red. A guard that has never been red is not a
// guard, and S-13 is the one finding in this slice whose failure is silent:
// distinguishable refusals look like better error messages.
//
// Exit: 0 green · 1 a failed arm · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.slice(2).includes('--mutate');

const F1 = '2026-09-23-m8-parties-s1-1-tables.sql';
const F2 = '2026-09-23-m8-parties-s1-2-verbs.sql';
const F3 = '2026-09-23-m8-parties-s1-3-client-surface.sql';

const A = '00000000-0000-4000-8000-0000b8010021';
const B = '00000000-0000-4000-8000-0000b8010022';
const C = '00000000-0000-4000-8000-0000b8010023';

const problems = [];
const judge = (id, pass, good, bad) => {
  if (pass) console.log(`  ✓ ${id} — ${good}`);
  else { console.log(`  ✗ ${id} — ${bad}`); problems.push(id); }
};
const group = (t) => console.log(`\n${t}`);
const harness = (msg) => { const e = new Error(msg); e.harness = true; return e; };

// ── THE MUTATION ───────────────────────────────────────────────────────────
// S-13's whole content is that `c_one` is returned for every cause. Replacing
// it with the cause itself is the pre-S-13 design, and it is what a reviewer
// would write if they had never read the finding — which is exactly why the
// guard has to be able to tell the two apart.
const MUTANT = [
  "      'invite_' || v_why, jsonb_build_object('why', v_why));\n"
  + "    return jsonb_build_object('ok', false, 'error', c_one);",
  "      'invite_' || v_why, jsonb_build_object('why', v_why));\n"
  + "    return jsonb_build_object('ok', false, 'error', v_why);",
];

// The SECOND half of the mutation proof. With only MUTANT planted, file 2's
// OWN §8(c) gate refuses the apply — which is the strongest possible answer and
// is asserted as stage 1. To then show that THIS file's S13a arm bites too
// (rather than riding on the migration's gate forever), stage 2 neuters that
// one assertion as well, so the mutant reaches the node arms.
// It disables file 2's WHOLE §8 self-check with one anchor rather than
// neutering gate after gate — the mutant trips §8(c) AND §8(d), and a proof
// that has to chip away at four assertions is a demolition, not a detection.
const NEUTER_SELFCHECK = [
  "begin\n  -- (y) NOT A MONEY SURFACE, PROVED BY READING THE FIVE BODIES.",
  "begin\n  return;   -- tests/party-membership.mjs --mutate stage 2\n  -- (y) NOT A MONEY SURFACE, PROVED BY READING THE FIVE BODIES.",
];

// The S-11 patch: give hr_party_hunt_live the body S2 will give it, minus the
// table — `select true`. It is planted in a COPY of the chain text (the patches
// option), never in the tracked file.
const HUNT_LIVE_TRUE = [
  "create or replace function public.hr_party_hunt_live(p_party uuid)\n"
  + "returns boolean language sql stable security definer\n"
  + "set search_path = public, pg_catalog as $$\n  select false\n$$;",
  "create or replace function public.hr_party_hunt_live(p_party uuid)\n"
  + "returns boolean language sql stable security definer\n"
  + "set search_path = public, pg_catalog as $$\n  select true\n$$;",
];

console.log('party-membership: M8 slice 1 membership, played as two real auth.uid() values'
  + (MUTATE ? '  [--mutate: S-13 made distinguishable, S13a required to go RED]' : ''));

// ── STAGE 1 OF THE MUTATION PROOF ──────────────────────────────────────────
// Planted alone, the mutant must be refused BY THE APPLY, because file 2's own
// §8(c) executes the three causes and compares the strings. A batch that
// installs the oracle is the failure; a batch that refuses to install is the
// fence working at the earliest possible moment.
if (MUTATE) {
  group('M1  the mutant is refused by the APPLY (file 2 §8(c))');
  let failed = null;
  try {
    const r = await bootReplay({ patches: new Map([[F2, [MUTANT]]]) });
    failed = r.failures[0] || null;
    await r.db.close();
  } catch (e) {
    failed = { file: F2, error: String(e.message).split('\n').find((l) => l.includes('GATE(')) || String(e.message).split('\n')[0] };
  }
  judge('M1', !!failed && failed.file === F2 && /GATE\(c\).*S-13/.test(failed.error || ''),
    'distinguishable refusals in hr_party_invite make the MIGRATION refuse to install — '
    + `"${String(failed?.error || '').slice(0, 90)}…"`,
    `the mutated batch applied, or failed for another reason: ${JSON.stringify(failed)}`);
}

// STAGE 2: with file 2's whole §8 self-check disabled, the mutant reaches this
// file's arms and S13a must be what catches it — otherwise S13a is riding on
// the migration's gate and is not a guard of its own. A standing guard has to
// be able to fail on its own the day someone edits the verb without re-running
// the apply, which is every day after this batch lands.
const patches = new Map();
if (MUTATE) patches.set(F2, [MUTANT, NEUTER_SELFCHECK]);

const { db, failures } = await bootReplay({ patches });
if (failures.length) {
  console.error('the schema replay did not complete:', failures);
  process.exit(2);
}

const q = async (sql, params) => (await db.query(sql, params)).rows;
const as = async (uid) => db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
const call = async (sql) => (await q(`select ${sql} as r`))[0].r;
const uuid = async () => (await q('select gen_random_uuid() as u'))[0].u;

// ── THE RATE BUCKET, AND WHY THIS FILE CLEARS IT ───────────────────────────
// The `party` bucket is 12 calls per USER per MINUTE (file 1 §5d) and this
// guard makes far more than that in far less than a minute, so without a reset
// every arm past the twelfth would grade `rate_limited` instead of the refusal
// it is written for — a guard that passes for the wrong reason, which is worse
// than one that fails.
//
// ⚠ CLEARING IT IS NOT DUCKING IT. Arm GATE below proves the bucket is real
//   and BITES before anything clears it, so the reset can never be the thing
//   hiding a missing gate. hr_rate_counters is operational bookkeeping
//   (tests/restore-census.baseline.json classifies it so) and this is a
//   throwaway in-process database.
const ungate = () => db.exec('delete from public.hr_rate_counters;');

try {
  // ── SEED: three real characters with claimed display names ───────────────
  // hr_create_character and claim_display_name, not hand-written rows: the
  // question throughout is what the VERBS do, and a hand-seeded character has
  // no skills, no profile and no name to be invited by.
  for (const [uid, name] of [[A, 'Kaya Test'], [B, 'Bram Test'], [C, 'Ilse Test']]) {
    await db.exec(`insert into auth.users (id) values ('${uid}') on conflict do nothing;`);
    await as(uid);
    const made = await call('public.hr_create_character(0)');
    if (made?.ok !== true) throw harness(`could not create a character for ${name}: ${JSON.stringify(made)}`);
    const named = await call(`public.claim_display_name('${name}')`);
    if (named?.ok !== true) throw harness(`could not claim "${name}": ${JSON.stringify(named)}`);
  }

  // ══ GATE — THE BUCKET IS REAL AND IT BITES ══════════════════════════════
  // Run FIRST, on a clean counter, so every later ungate() is a convenience
  // rather than a hiding place. 12/min: the thirteenth call in the same minute
  // must be refused whatever else it would have answered.
  group('GATE  the `party` rate bucket exists and refuses the 13th call in a minute');
  {
    await as(A);
    const seen = [];
    for (let i = 0; i < 13; i++) {
      // A refusal the verb answers BEFORE the gate would prove nothing, so the
      // call is one the gate is reached by: an unresolvable invite.
      seen.push((await call(`public.hr_party_invite(0, 'Nobody Here At All', '${await uuid()}'::uuid)`))?.error);
    }
    judge('GATE', seen[0] !== 'rate_limited' && seen[12] === 'rate_limited',
      'the first call is answered by the verb and the thirteenth is refused rate_limited — the '
      + '`party` bucket is admitted by hr_rpc_gate (an UNKNOWN bucket fails CLOSED, so a verb '
      + 'whose bucket was lost in a restatement ships green and dead)',
      `call 1 answered ${seen[0]}, call 13 answered ${seen[12]}`);
    await ungate();
  }

  // ══ P-IDEM ═══════════════════════════════════════════════════════════════
  group('P-IDEM  the three migrations re-apply byte-identically');
  {
    const before = await inventory(db);
    let err = null;
    for (const f of [F1, F2, F3]) {
      const sql = (await readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8'))
        .replace(/\r\n/g, '\n');
      let text = sql;
      if (MUTATE && f === F2) {
        text = text.split(MUTANT[0]).join(MUTANT[1])
          .split(NEUTER_SELFCHECK[0]).join(NEUTER_SELFCHECK[1]);
      }
      try { await db.exec(text); }
      catch (e) { err = `${f}: ${String(e.message).split('\n')[0]}`; break; }
    }
    const after = err ? null : await inventory(db);
    const same = after && JSON.stringify(before) === JSON.stringify(after);
    judge('P-IDEM', !err && same,
      'all three re-applied cleanly — every §4 self-check passed a SECOND time against a '
      + 'database that already holds the objects, and the schema inventory is byte-identical '
      + 'before and after',
      err
        ? `a re-apply FAILED: ${err}. tools/apply-migration.mjs is run by hand on a file that may `
          + 'already be in; "additive and idempotent" has to be a measurement, not a header.'
        : 'the re-apply changed the schema inventory — the second run is not a no-op');
  }

  // ══ THE JOURNEY ══════════════════════════════════════════════════════════
  await ungate();
  group('J  create → invite → accept → leave → kick, as two players');
  let party = null;
  {
    await as(A);
    const r = await call(`public.hr_party_create(0, '${await uuid()}'::uuid)`);
    party = r?.party_id ?? null;
    judge('J1', r?.ok === true && !!party && r.role === 'leader',
      `hr_party_create made one party with its caller as leader (${String(party).slice(0, 8)}…)`,
      `create answered ${JSON.stringify(r)}`);

    const dup = await call(`public.hr_party_create(0, '${await uuid()}'::uuid)`);
    judge('J2', dup?.error === 'already_in_party',
      'a second create on the same character is already_in_party — invariant 1, and the partial '
      + 'unique index is the authority behind it',
      `a second create answered ${JSON.stringify(dup)}`);

    const inv = await call(`public.hr_party_invite(0, 'Bram Test', '${await uuid()}'::uuid)`);
    judge('J3', inv?.ok === true && inv.sent === true
      && !('user_id' in inv) && !('slot' in inv) && !('invite_id' in inv),
      'an honest invite answers {ok, sent} and names NOTHING about the target — not their user '
      + 'id, not their slot, not the invite id, which is the receiver\'s row to hold',
      `invite answered ${JSON.stringify(inv)}`);

    const [card] = await q(
      `select id from public.party_invite where party_id = $1 and user_id = $2
         and accepted_at is null and revoked_at is null`, [party, B]);
    await as(B);
    const acc = card ? await call(`public.hr_party_accept(0, '${card.id}'::uuid, '${await uuid()}'::uuid)`) : null;
    judge('J4', acc?.ok === true && acc.party_id === party && acc.role === 'member',
      'hr_party_accept put the invitee in the party as a member',
      `accept answered ${JSON.stringify(acc)}`);

    // Ilse joins too, so leadership has somewhere to go.
    await ungate();
    await as(A);
    await call(`public.hr_party_invite(0, 'Ilse Test', '${await uuid()}'::uuid)`);
    const [card2] = await q(
      `select id from public.party_invite where party_id = $1 and user_id = $2
         and accepted_at is null and revoked_at is null`, [party, C]);
    await as(C);
    await call(`public.hr_party_accept(0, '${card2.id}'::uuid, '${await uuid()}'::uuid)`);
    const live = Number((await q(
      'select count(*) as n from public.party_member where party_id = $1 and left_at is null',
      [party]))[0].n);
    judge('J5', live === 3, 'the party holds three live members',
      `the party holds ${live} live member(s), expected 3`);
  }

  // ── INVARIANT 3 — leadership transfers deterministically ─────────────────
  await ungate();
  group('I3  the leader leaving transfers leadership by tenure, in the same transaction');
  {
    await as(A);
    const left = await call(`public.hr_party_leave(0, '${await uuid()}'::uuid)`);
    const [p] = await q('select leader_user, leader_slot from public.party where id = $1', [party]);
    const [m] = await q(
      `select role from public.party_member
        where party_id = $1 and user_id = $2 and left_at is null`, [party, B]);
    judge('I3', left?.ok === true && left.dissolved === false
      && p?.leader_user === B && m?.role === 'leader',
      'the longest-tenured live member (order by joined_at, user_id) is the new leader, on the '
      + 'party row AND on their own member row — deterministic, no election, and no window in '
      + 'which the party has no leader',
      `leave answered ${JSON.stringify(left)}; leader is now ${p?.leader_user} `
      + `(expected ${B}), their member role is ${m?.role}`);

    // A non-leader may not kick.
    await as(C);
    const nope = await call(`public.hr_party_kick(0, 'Bram Test', '${await uuid()}'::uuid)`);
    judge('I3b', nope?.error === 'not_party_leader',
      'a non-leader is refused not_party_leader',
      `a non-leader kick answered ${JSON.stringify(nope)}`);
  }

  // ── KICK ─────────────────────────────────────────────────────────────────
  await ungate();
  group('K  the leader removes a member by the name the panel shows');
  {
    await as(B);
    const self = await call(`public.hr_party_kick(0, 'Bram Test', '${await uuid()}'::uuid)`);
    judge('K0', self?.error === 'bad_party',
      'kicking yourself is bad_party — the panel does not render Kick on your own row, and '
      + 'leaving is hr_party_leave, which also transfers leadership properly',
      `a self-kick answered ${JSON.stringify(self)}`);

    const ghost = await call(`public.hr_party_kick(0, 'Nobody Here At All', '${await uuid()}'::uuid)`);
    judge('K0b', ghost?.error === 'not_in_party',
      'a name that is not in this party resolves to nothing — and it is no oracle either, since '
      + 'the only names this can match are the ones hr_party_view already showed the caller',
      `an unresolvable kick answered ${JSON.stringify(ghost)}`);

    const kick = await call(`public.hr_party_kick(0, 'Ilse Test', '${await uuid()}'::uuid)`);
    const [row] = await q(
      'select left_at, removed_by from public.party_member where party_id = $1 and user_id = $2',
      [party, C]);
    judge('K1', kick?.ok === true && !!row?.left_at && row.removed_by === B,
      'the removed member carries left_at AND removed_by — the audit of who removed whom, and '
      + 'the only thing that makes §18.3\'s "20 per PARTY per day" clamp spellable at all',
      `kick answered ${JSON.stringify(kick)}; the member row is ${JSON.stringify(row)}`);

    // Invariant 4: the last one out dissolves it and revokes the cards.
    const gone = await call(`public.hr_party_leave(0, '${await uuid()}'::uuid)`);
    const [p] = await q('select dissolved_at from public.party where id = $1', [party]);
    const liveCards = Number((await q(
      `select count(*) as n from public.party_invite
        where party_id = $1 and accepted_at is null and revoked_at is null`, [party]))[0].n);
    judge('I4', gone?.dissolved === true && !!p?.dissolved_at && liveCards === 0,
      'the last live member out stamps dissolved_at and revokes every live invite — no card '
      + 'outlives the party it names',
      `leave answered ${JSON.stringify(gone)}; dissolved_at=${p?.dissolved_at}, `
      + `${liveCards} live card(s) left behind`);
  }

  // ══ S-13 — THE SINGLE REFUSAL. THIS IS THE MUTATED ARM. ══════════════════
  await ungate();
  group('S13  three causes, one string (§18-SEC.1 S-13)');
  {
    // Fresh parties: A leads one, B leads another, so "already in a party" is
    // a live cause rather than a contrivance.
    await as(A);
    await call(`public.hr_party_create(0, '${await uuid()}'::uuid)`);
    await as(B);
    await call(`public.hr_party_create(0, '${await uuid()}'::uuid)`);
    await as(A);
    const causes = [
      ['no such name', await call(`public.hr_party_invite(0, 'Nobody Here At All', '${await uuid()}'::uuid)`)],
      ['that is you', await call(`public.hr_party_invite(0, 'Kaya Test', '${await uuid()}'::uuid)`)],
      ['already in a party', await call(`public.hr_party_invite(0, 'Bram Test', '${await uuid()}'::uuid)`)],
    ];
    const codes = causes.map(([, r]) => r?.error);
    const one = codes.every((c) => c === 'invite_target_unavailable');
    judge(MUTATE ? 'S13a (mutate)' : 'S13a', MUTATE ? !one : one,
      MUTATE
        ? `the mutant's distinguishable refusals were CAUGHT — ${JSON.stringify(codes)} instead of `
          + 'one repeated string, so this arm can still tell S-13 from the oracle it replaced'
        : `all three causes answered invite_target_unavailable — the verb does not tell a sender `
          + 'whether a name exists or whether that player is currently in a party, twenty times a '
          + 'day per account',
      MUTATE
        ? 'the mutant SLIPPED: the three causes still answered one string, so this arm is not '
          + 'measuring S-13 and a green run here means nothing'
        : `the three causes answered ${JSON.stringify(codes)} — distinguishable refusals ARE the `
          + 'oracle S-13 exists to close, however much better the error messages read');

    // The operator half. One string to the sender, three rows to the journal:
    // hr_rejections aggregates on (user, slot, day, CODE), so one code for
    // every cause would collapse them and reproduce CLAUDE.md §3.4's blindness
    // inside a single verb.
    const seen = (await q(
      `select code from public.hr_rejections where user_id = $1
        and code in ('invite_no_such_name','invite_that_is_you','invite_already_in_party')`, [A]))
      .map((r) => r.code).sort();
    judge('S13b', seen.length === 3,
      'and the three real causes reached hr_rejections under three DISTINCT codes — S-13 buys '
      + 'privacy from the sender, not blindness for the operator',
      `the journal carries ${seen.length} of the 3 distinct cause codes (${JSON.stringify(seen)})`);
  }

  // ── THE INBOX CLAMP ──────────────────────────────────────────────────────
  await ungate();
  group('S13c  the receiver clamp at the sixth live card');
  {
    await as(B);
    await call(`public.hr_party_leave(0, '${await uuid()}'::uuid)`);   // B invitable again
    await as(A);
    // Five live cards from five different parties: party_invite_live permits
    // only one per party per character, so one party cannot reach five.
    for (let i = 0; i < 5; i++) {
      await db.exec(`
        with p as (insert into public.party (leader_user, leader_slot)
                   values ('${A}'::uuid, 0) returning id)
        insert into public.party_invite (party_id, user_id, slot, invited_by_user)
        select p.id, '${B}'::uuid, 0, '${A}'::uuid from p;`);
    }
    await ungate();
    const live = Number((await q(
      `select count(*) as n from public.party_invite where user_id = $1 and slot = 0
         and accepted_at is null and revoked_at is null and expires_at > now()`, [B]))[0].n);
    const sixth = await call(`public.hr_party_invite(0, 'Bram Test', '${await uuid()}'::uuid)`);
    const journalled = Number((await q(
      "select count(*) as n from public.hr_rejections where user_id = $1 and code = 'invite_inbox_full'",
      [A]))[0].n);
    // Under --mutate the same flip reaches this arm too — the inbox clamp is
    // the fifth cause of the one string — so its expectation moves with it.
    // S13a is the arm the proof is GRADED on; this one is a second reading of
    // the same property and must not be scored as collateral damage.
    const want = MUTATE ? 'inbox_full' : 'invite_target_unavailable';
    judge(MUTATE ? 'S13c (mutate)' : 'S13c',
      live === 5 && sixth?.error === want && journalled === 1,
      'the sixth live card is refused, with the SAME string as every other cause, and the clamp '
      + 'is journalled under its own code — twenty accounts can no longer hand one player four '
      + 'hundred invite cards a day, or learn from the refusal that they tried',
      `inbox held ${live} live card(s); the sixth answered ${JSON.stringify(sixth)} `
      + `(wanted ${want}); ${journalled} invite_inbox_full journal row(s)`);
  }

  // ══ S-12 — THE SPREAD, RE-CHECKED ON ACCEPT ══════════════════════════════
  await ungate();
  group('S12  the ten-level spread is re-checked on every accept');
  {
    await as(A);
    // Clear B's planted inbox so the card under test is one the verb issued.
    await db.exec(`update public.party_invite set revoked_at = now()
                    where user_id = '${B}'::uuid and accepted_at is null and revoked_at is null;`);
    const mine = await q(
      'select public.hr_party_of($1::uuid, 0) as p', [A]);
    const p2 = mine[0].p;
    await call(`public.hr_party_invite(0, 'Bram Test', '${await uuid()}'::uuid)`);
    const [card] = await q(
      `select id from public.party_invite where party_id = $1 and user_id = $2
         and accepted_at is null and revoked_at is null`, [p2, B]);

    await db.exec(`
      insert into public.player_skills (user_id, slot, skill_id, xp)
      select '${A}'::uuid, 0, s, 14000000
        from unnest(array['attack','strength','defense','hitpoints']) s
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;`);
    const [gap] = await q(
      'select public.hr_party_level($1::uuid,0) - public.hr_party_level($2::uuid,0) as g', [A, B]);
    await as(B);
    const r = await call(`public.hr_party_accept(0, '${card.id}'::uuid, '${await uuid()}'::uuid)`);
    const joined = (await q('select public.hr_party_of($1::uuid, 0) as p', [B]))[0].p;
    judge('S12', Number(gap.g) > 10 && r?.error === 'party_level_spread' && joined === null,
      `a character ${gap.g} levels below the party is refused party_level_spread on ACCEPT and no `
      + 'membership row is written — §18.1\'s "checked at hunt start only" covers LEVELLING, not '
      + 'JOINING, and without this a party starts inside the spread and then accepts a level-1 alt',
      `the planted gap was ${gap.g} level(s); accept answered ${JSON.stringify(r)}; `
      + `hr_party_of now returns ${joined}`);
    // Put the levels back: P-S11 below needs the SAME pair to be inside the
    // spread, or its control arm would be refused by S-12 and this guard could
    // no longer tell S-11's refusal from S-12's.
    await db.exec(`update public.player_skills set xp = 0 where user_id = '${A}'::uuid;`);
  }

  // ══ P-POL — the policies, read as `authenticated` ════════════════════════
  await ungate();
  group('P-POL  the SELECT policies do not recurse and do not need a predicate grant');
  {
    const [p2] = await q('select public.hr_party_of($1::uuid, 0) as p', [A]);
    const read = async (uid) => {
      await as(uid);
      await db.exec('begin'); await db.exec('set local role authenticated');
      let rows = null; let err = null;
      try {
        rows = Number((await db.query(
          'select count(*) as n from public.party_member where party_id = $1', [p2.p])).rows[0].n);
      } catch (e) { err = `${e.code || ''} ${String(e.message).split('\n')[0]}`.trim(); }
      await db.exec('rollback');
      return { rows, err };
    };
    const member = await read(A);
    const outsider = await read(C);
    judge('P-POL', !member.err && member.rows >= 1 && !outsider.err && outsider.rows === 0,
      'a live member reads their own membership row and an outsider reads zero, neither raising '
      + '— 42P17 (a USING clause reading its own table) and 42501 (a USING clause reaching a '
      + 'predicate the caller cannot execute) both land here, and §18.2.2\'s policy as written '
      + 'produces one or the other',
      `member: ${member.err || `${member.rows} row(s)`}; outsider: `
      + `${outsider.err || `${outsider.rows} row(s)`}`);

    await as(A);
    const view = await call(`public.hr_party_view('${p2.p}'::uuid)`);
    await as(C);
    const denied = await call(`public.hr_party_view('${p2.p}'::uuid)`);
    const keys = view?.members?.[0] ? Object.keys(view.members[0]).sort() : [];
    const FROZEN = ['combat_level', 'gold', 'hp', 'hp_max', 'name',
      'recovering_until', 'share_bp', 'xp'];
    judge('P-VIEW', view?.ok === true
      && JSON.stringify(keys) === JSON.stringify(FROZEN)
      && denied?.error === 'not_in_party' && !('members' in (denied || {})),
      'hr_party_view answers a member with the FROZEN eight-key shape and refuses a non-member '
      + 'with not_in_party carrying no roster — the one cross-user read M8 adds, and the one '
      + 'place a column would have to be argued for',
      `member shape ${JSON.stringify(keys)} (want ${JSON.stringify(FROZEN)}); `
      + `non-member answered ${JSON.stringify(denied)}`);
  }

  // ══ P-S11 — the refusal under a hunt that is really live ═════════════════
  // hr_party_hunt_live is given the body S2 will give it — the real-row
  // existence test, minus the table that does not exist yet — and PUT BACK
  // immediately, so nothing after this arm is graded on a stub.
  //
  // ⚠ IT IS DONE HERE AND NOT AS A CHAIN PATCH, AND THAT IS ITSELF A RESULT.
  //   Patching file 1's definition makes FILE 1'S OWN §7(f) refuse the apply —
  //   it asserts the predicate is FALSE in S1, which is correct for the slice
  //   as shipped. So the day S2 gives the predicate a real body it must also
  //   move that gate, and this comment is where the next lane finds that out
  //   instead of discovering it against production.
  await ungate();
  group('P-S11  party_accept is refused while a hunt is live (§18-SEC.1 S-11)');
  {
    await as(B);
    await call(`public.hr_party_leave(0, '${await uuid()}'::uuid)`);
    await as(A);
    const p3 = (await q('select public.hr_party_of($1::uuid, 0) as p', [A]))[0].p;
    await db.exec(`update public.party_invite set revoked_at = now()
                    where user_id = '${B}'::uuid and accepted_at is null and revoked_at is null;`);
    const sent = await call(`public.hr_party_invite(0, 'Bram Test', '${await uuid()}'::uuid)`);
    const [card] = await q(
      `select id from public.party_invite where party_id = $1 and user_id = $2
         and accepted_at is null and revoked_at is null`, [p3, B]);

    await db.exec(`create or replace function public.hr_party_hunt_live(p_party uuid)
      returns boolean language sql stable security definer
      set search_path = public, pg_catalog as $x$ select true $x$;`);
    await as(B);
    let acc = null; let err = null;
    try { acc = await call(`public.hr_party_accept(0, '${card?.id}'::uuid, '${await uuid()}'::uuid)`); }
    catch (e) { err = String(e.message).split('\n')[0]; }
    await db.exec(`create or replace function public.hr_party_hunt_live(p_party uuid)
      returns boolean language sql stable security definer
      set search_path = public, pg_catalog as $x$ select false $x$;`);

    const joined = (await q('select public.hr_party_of($1::uuid, 0) as p', [B]))[0].p;
    judge('P-S11', sent?.ok === true && !err
      && acc?.error === 'party_hunt_running' && joined === null,
      'with hr_party_hunt_live answering TRUE — the body S2 will ship — an accept is refused '
      + 'party_hunt_running and writes no membership row. Without it the joiner is inside the '
      + 'next party window with their own accrued_to days back, and the settle either wedges on '
      + 'them forever or confiscates that player\'s entire away window',
      `invite ${JSON.stringify(sent)}; accept ${err || JSON.stringify(acc)}; `
      + `hr_party_of now returns ${joined}`);
    // AND THE CONTROL: with the predicate back to FALSE the same card goes in,
    // or this arm proved only that something was broken.
    acc = await call(`public.hr_party_accept(0, '${card?.id}'::uuid, '${await uuid()}'::uuid)`);
    judge('P-S11b', acc?.ok === true,
      'and with the predicate back to FALSE the same card is accepted — so P-S11 measured the '
      + 'refusal, not a card that was never usable',
      `the control accept answered ${JSON.stringify(acc)}`);
  }
} finally {
  await db.close();
}

console.log('');
if (MUTATE) {
  // The mutation proof grades ONE arm. Everything else is expected to stay
  // green on the mutant: a mutant that broke the whole file would "pass" by
  // demolition rather than by detection (guard-hygiene R3's floor).
  // S13a is judged INVERTED under --mutate (it passes when it detects the
  // mutant), so "it bit" is its ABSENCE from problems. Getting this backwards
  // is how a proof harness reports green over its own corpse.
  const bit = !problems.includes('S13a (mutate)');
  const collateral = problems.filter((p) => p !== 'S13a (mutate)' && p !== 'M1');
  if (problems.includes('M1')) {
    console.log('party-membership --mutate: STAGE 1 did not bite — the mutated batch APPLIED. '
      + 'File 2 §8(c) is supposed to execute the three causes and refuse to install the oracle.');
    process.exitCode = 1;
  }
  if (!bit) {
    console.log('party-membership --mutate: the S-13 mutant SLIPPED — distinguishable refusals '
      + 'were planted in hr_party_invite and S13a stayed green, so that arm is measuring nothing.');
    process.exitCode = 1;
  } else if (collateral.length) {
    console.log('party-membership --mutate: S13a bit, but the mutant also broke '
      + `${collateral.length} unrelated arm(s) — ${collateral.join(', ')}. `
      + 'A mutant that demolishes the file passes by destruction rather than by detection.');
    process.exitCode = 1;
  } else if (!problems.includes('M1')) {
    console.log('party-membership --mutate: green — S-13 was flipped to a distinguishable string '
      + 'per cause; the APPLY refused it (stage 1), and with the migration\'s own gate neutered '
      + 'too, S13a went RED on its own (stage 2) and nothing else moved.');
  }
} else if (problems.length) {
  console.log(`party-membership: ${problems.length} failure(s) — ${problems.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('party-membership: green — the three migrations re-apply byte-identically; the '
    + 'journey plays end to end through the verbs; leadership transfers by tenure and the last '
    + 'member out dissolves the party and its cards; S-13 answers one string to the sender and '
    + 'three codes to the journal, and the receiver clamp bites at the sixth card; the ten-level '
    + 'spread is re-checked on accept; the policies neither recurse nor need a predicate grant; '
    + 'hr_party_view is frozen at eight keys and refuses a non-member; and S-11 refuses an accept '
    + 'the day hr_party_hunt_live starts answering TRUE.');
}
