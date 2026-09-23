#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// tests/party-settle.mjs — A PARTY IS A ROSTER UNIT, AND THE SETTLE IS ONE
//                          ALL-OR-NOTHING CALL.
//
//   node tests/party-settle.mjs            the guard
//   node tests/party-settle.mjs --mutate   four mutants, each required to go RED
//
// M8 slice 2 (docs/planning/WORLD_TICK_DESIGN.md §18.2.4, §18.2.5, §18.2.5a,
// §18-SEC.3's S2 list and §18-SEC-2's B-A3/B-A5), built by lane/m8-parties-s2
// as three migrations. This is the node half: a FOUR-MEMBER planted party on
// the PGlite chain replay walks a real window through `hr_party_tick_settle` in
// SHADOW, then again ARMED, and every property the design names is asserted by
// EXIT CODE.
//
// ── WHY THIS EXISTS BESIDE THE MIGRATIONS' OWN §4 BLOCKS ────────────────────
// The §4 blocks run ONCE, at apply time, on the machine doing the apply. They
// refuse to install a broken batch and they are right to be there. They are not
// a standing guard: nothing re-runs them when someone edits the settle six
// weeks from now, and nothing re-runs them when S3 wires its damage counter or
// S5 flips `shadow`. This file runs on every push.
//
// It also asserts properties a §4 block structurally cannot:
//
//   P-IDEM  the three files RE-APPLY byte-identically. tools/apply-migration
//           .mjs is run by hand, at speed, on a file that may already be in.
//   P-ARM   the ARMED branch, end to end, on a throwaway database: four
//           hr_apply calls in one transaction, the party mark and all four
//           member marks advancing TOGETHER, the carrier cleared, and
//           `player_ledger.meta->'party'` readable at the level hr_apply
//           actually writes it. The migration cannot arm itself — §5(z) of
//           file 2 requires `shadow` to be TRUE after the apply — so the armed
//           half has nowhere else to live.
//   P-FENCE invariant 8 at the INTENT door, driven through the real
//           `partyIntentFence` bytes the edge deploys.
//
// ── THE MUTATION PROOF (CLAUDE.md §4) ──────────────────────────────────────
// Four mutants, each breaking one load-bearing line and naming the arm that
// must go red. A guard that has never been red is not a guard.
//
//   thirteenthKey   journal.meta.party grows an eighth field (B-A5)
//   whenOthers      the armed handler catches `when others` (B-A3)
//   memberPaid      one member is paid while the fan-out failed (S-9)
//   rostersOverlap  the per-character roster stops excluding a party (S-8)
//
// Exit: 0 green · 1 a failed arm · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { bootReplay, inventory, ROOT } from './schema-replay.mjs';
import { PARTY_JOURNAL_KEYS } from '../src/core/party-split.js';
import { partyIntentFence, partyRefusalFor } from '../supabase/functions/hr-accrue/party-fence.js';
import {
  parseParties, parsePartyUnit, partyIntentId, memberContribution, settleParty,
} from '../supabase/functions/hr-accrue/tick-party.js';

const MUTATE = process.argv.slice(2).includes('--mutate');

const F1 = '2026-09-23-m8-parties-s2-1-hunt-tables.sql';
const F2 = '2026-09-23-m8-parties-s2-2-roster-settle.sql';
const F3 = '2026-09-23-m8-parties-s2-3-engine-allowlist.sql';

/* Four members, two accounts x two slots would violate invariant 2 (one
   character per USER per party), so it is four accounts — which is also the
   only shape a real party can take. */
const U = [
  '00000000-0000-4000-8000-0000b8020101',
  '00000000-0000-4000-8000-0000b8020102',
  '00000000-0000-4000-8000-0000b8020103',
  '00000000-0000-4000-8000-0000b8020104',
];

const problems = [];
const judge = (id, pass, good, bad) => {
  if (pass) console.log(`  ✓ ${id} — ${good}`);
  else { console.log(`  ✗ ${id} — ${bad}`); problems.push(id); }
};
const group = (t) => console.log(`\n${t}`);
const harness = (msg) => { const e = new Error(msg); e.harness = true; return e; };

// ── THE MUTANTS ────────────────────────────────────────────────────────────
const MUTANTS = {
  /* B-A5. `metaProblems()` checks TOP-LEVEL keys only, so nesting buys the
     flat allowlist's count and buys no bound at all. With `party` added the
     allowlist is TWELVE, so the key that must still go red is a THIRTEENTH —
     and a thirteenth NESTED key is the one the flat check cannot see. */
  thirteenthKey: { file: F2, pair: [
    "    if v_keys <> array(select unnest(c_party_keys) order by 1) then",
    "    if false then"], arm: 'B-A5' },
  /* B-A3. `when others` also catches a deadlock (40P01), a lock timeout, a
     statement cancellation and a bug in the split — two of which an adversary
     can provoke — and turns each into "end the party hunt, blame a member". */
  whenOthers: { file: F2, pair: [
    "  exception when sqlstate 'HR826' then",
    "  exception when others then"], arm: 'B-A3' },
  /* S-9. A partial settle pays some members a split computed from all of them,
     which is a mint, and it is the one defect that cannot be recovered after
     the fact (§18-SEC.2's 8b-ii). */
  memberPaid: { file: F2, pair: [
    "  if v_live <> v_n or v_matched <> v_n then",
    "  if false then"], arm: 'S-9' },
  /* S-8. Not symmetric: the solo settle pays one member the WHOLE party's
     stream and the party settle then fails its CAS and the party wedges. */
  rostersOverlap: { file: F1, pair: [
    "  c_clause constant text := 'and not public.hr_partied(o.user_id, o.slot)';",
    "  c_clause constant text := 'and true /* --mutate rostersOverlap */';"], arm: 'S-8' },
};

console.log('party-settle: M8 slice 2, a four-member party through one fenced call'
  + (MUTATE ? '  [--mutate: four mutants, each required to go RED]' : ''));

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
      `${m.arm} — the apply REFUSED it: "${String(failed?.error || '').slice(0, 96)}…"`,
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
const call = async (sql) => (await q(`select ${sql} as r`))[0].r;
/* The `exec` seam index.ts owns, over this replay — so the fence arm below
   drives the REAL bytes the edge deploys rather than a description of them. */
const exec = async (text, params) => q(text, params);

const HOLDER = 'guard:party-settle';
let party = null;
let hunt = null;
let from = null;
let to = null;

try {
  // ── SEED: four real characters, one party, one live hunt ─────────────────
  // hr_create_character, not hand-written rows: the question throughout is what
  // the SETTLE does, and a hand-seeded character has no skills and no envelope.
  for (const uid of U) {
    await db.exec(`insert into auth.users (id) values ('${uid}') on conflict do nothing;`);
    await as(uid);
    const made = await call('public.hr_create_character(0)');
    if (made?.ok !== true) throw harness(`could not create a character for ${uid}: ${JSON.stringify(made)}`);
  }
  await as('');

  // ══ P-IDEM ═══════════════════════════════════════════════════════════════
  group('P-IDEM  the three migrations re-apply byte-identically');
  /* RUN BEFORE THE PARTY IS PLANTED, and that is not a convenience: file 1's
     §7(z) asserts the two S2 tables hold ZERO rows after an apply — *"a party
     hunt exists because a leader started one, never because a migration seeded
     it"* — so a re-apply over this guard's own fixture would fail that gate for
     the right reason and grade it as a broken migration. */
  {
    const before = await inventory(db);
    let err = null;
    for (const f of [F1, F2, F3]) {
      const sql = (await readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8'))
        .replace(/\r\n/g, '\n');
      try { await db.exec(sql); }
      catch (e) { err = `${f}: ${String(e.message).split('\n')[0]}`; break; }
    }
    const after = err ? null : await inventory(db);
    judge('P-IDEM', !err && after && JSON.stringify(before) === JSON.stringify(after),
      'all three re-applied cleanly — every §4 self-check passed a SECOND time against a '
      + 'database that already holds the objects, and the schema inventory is byte-identical',
      err
        ? `a re-apply FAILED: ${err}. tools/apply-migration.mjs is run by hand on a file that may `
          + 'already be in; "additive and idempotent" has to be a measurement, not a header.'
        : 'the re-apply changed the schema inventory — the second run is not a no-op');
  }

  const now = (await one('select now()::timestamptz as n')).n;
  /* EVERY WINDOW IN THIS GUARD ENDS IN THE PAST. The fence refuses a window
     ending more than 60 s ahead of the server clock (`window_in_future`), and
     the arms below walk a SECOND window after this one — so the base is far
     enough back that `[to, to + 90 s]` is still behind `now()`. A fixture that
     drifts into the future grades every later arm as that refusal instead of
     as the property it was written for. */
  from = (await one("select date_trunc('second', now()) - interval '300 seconds' as t")).t;
  to = (await one("select date_trunc('second', now()) - interval '210 seconds' as t")).t;

  party = (await one(
    'insert into public.party (leader_user, leader_slot) values ($1, 0) returning id', [U[0]])).id;
  for (const [i, uid] of U.entries()) {
    await q('insert into public.party_member (party_id, user_id, slot, role) values ($1, $2, 0, $3)',
      [party, uid, i === 0 ? 'leader' : 'member']);
  }
  hunt = (await one(
    "insert into public.party_hunt (party_id, active_id, accrued_to) values ($1, 'slime', $2) returning id",
    [party, from])).id;
  await q(`update public.player_state
              set active_kind = 'combat', active_id = 'slime', active_since = $2, accrued_to = $2
            where user_id = any($1::uuid[]) and slot = 0`, [U, from]);
  await q(`insert into public.hr_tick_ownership (user_id, slot, channel, owned)
           select u, 0, 'combat', true from unnest($1::uuid[]) u
           on conflict (user_id, slot, channel) do update set owned = true`, [U]);
  await db.exec(`update public.hr_tick_config
                    set enabled = true, shadow = true,
                        channels = array['combat','gather']::text[] where id;`);

  // ══ R  THE TWO ROSTERS PARTITION THE FOUR CHARACTERS (S-8) ═══════════════
  group('R  the two rosters are DISJOINT, and together they serve everybody');
  {
    const solo = await asRole('hr_tick', () => q(
      "select user_id from public.hr_tick_roster(array['combat']::text[], 0, 50, $1) where user_id = any($2::uuid[])",
      [HOLDER, U]));
    judge('R1', solo.length === 0,
      'the PER-CHARACTER roster offers none of the four — invariant 7 excludes a character in a '
      + 'party with a live hunt BY JOIN, on every fire, never by a denormalised column',
      `the per-character roster offered ${solo.length} partied character(s): the solo settle would `
      + 'pay one member the whole party stream and the party settle would then fail its CAS and wedge');

    const units = await asRole('hr_tick', () => q(
      "select * from public.hr_party_roster(array['combat']::text[], 50, $1) where party_id = $2",
      [HOLDER, party]));
    judge('R2', units.length === 1 && units[0].member_count === 4
      && Array.isArray(units[0].members) && units[0].members.length === 4,
      'the PARTY roster offers the party once, as ONE unit, with all four members nested — '
      + 'disjoint is a PARTITION, and a character served by NEITHER roster has their night '
      + 'silently eaten',
      `the party roster returned ${units.length} row(s) with member_count `
      + `${units[0]?.member_count} and ${units[0]?.members?.length} nested member(s)`);
    judge('R3', units[0]?.members?.every((m) => m.state && m.state.ok === true && m.version != null),
      'every nested member carries its whole hr_state_of envelope and its version — §2\'s rule: '
      + 'the tick NEVER assembles a character out of parts',
      'a rostered member carries no envelope, so the tick would have to assemble the character '
      + 'out of parts');
    judge('R4', new Date(units[0]?.accrued_to).getTime() === new Date(from).getTime(),
      'the unit reports the PARTY watermark, which invariant 8 makes equal to every member\'s own',
      `the unit reports ${units[0]?.accrued_to}, the party watermark is ${from}`);
  }

  // ══ S  THE SHADOW SETTLE: FOUR ROWS, PAYING NOTHING ══════════════════════
  group('S  four members, one call, SHADOW — four rows and not one coin');
  const members = await buildMembers(from, to);
  let ledgerBefore = Number((await one('select count(*)::int as n from public.player_ledger')).n);
  {
    const res = await settle(members, from, to);
    judge('S1', res?.ok === true && res.mode === 'shadow' && Number(res.journalled) === 4,
      'ONE call settled all four members and journalled four rows',
      `the settle answered ${JSON.stringify(res)}`);

    const rows = await q(
      'select user_id, slot, delta, party, window_from, window_to from public.hr_tick_shadow'
      + ' where party is not null order by user_id', []);
    judge('S2', rows.length === 4,
      'four hr_tick_shadow rows carry a party attribution — ledger rows are per MEMBER per '
      + 'settled window, i.e. IDENTICAL to solo (§18.4): a party adds no rows, only ~90 bytes '
      + 'to rows that already exist',
      `${rows.length} shadow row(s) carry a party attribution, not 4`);

    const keySets = rows.map((r) => Object.keys(r.party).sort().join(','));
    const want = [...PARTY_JOURNAL_KEYS].sort().join(',');
    judge('S3', keySets.length === 4 && keySets.every((k) => k === want),
      `every row's attribution is EXACTLY the frozen seven (${want}) — an EQUALITY, not a `
      + 'minimum, because metaProblems() checks top-level keys only and nesting buys no bound',
      `the attribution key sets are ${JSON.stringify([...new Set(keySets)])}, wanted ${want}`);

    judge('S4', rows.every((r) => r.delta?.journal?.meta?.party === undefined),
      'the stored delta carries NO party key at any level — so it is byte-for-byte what a SOLO '
      + 'settle stores, which is what makes §18.2.6 (P-a) degenerate parity a byte comparison '
      + 'rather than an argument (S-1)',
      'a stored shadow delta still carries journal.meta.party: (P-a) is false by construction '
      + 'and hr_apply would refuse the payload by name');

    const bpOk = rows.reduce((a, r) => a + Number(r.party.dmg_bp), 0) === 10000
      && rows.reduce((a, r) => a + Number(r.party.xp_bp), 0) === 10000;
    judge('S5', bpOk,
      'BOTH share vectors sum to exactly 10,000 bp over the window (P-b) — zero tolerance, '
      + 'because this is integer arithmetic and a band would hide a rounding leak either way',
      `dmg_bp sums to ${rows.reduce((a, r) => a + Number(r.party.dmg_bp), 0)} and xp_bp to `
      + `${rows.reduce((a, r) => a + Number(r.party.xp_bp), 0)}; both must be 10000`);

    const ledgerAfter = Number((await one('select count(*)::int as n from public.player_ledger')).n);
    const marks = await q('select accrued_to from public.player_state where user_id = any($1::uuid[]) and slot = 0', [U]);
    const huntMark = (await one('select accrued_to from public.party_hunt where id = $1', [hunt])).accrued_to;
    judge('S6', ledgerAfter === ledgerBefore
      && marks.every((m) => new Date(m.accrued_to).getTime() === new Date(from).getTime())
      && new Date(huntMark).getTime() === new Date(from).getTime(),
      'SHADOW PAID NOTHING: zero ledger rows, four member watermarks unmoved, the party '
      + 'watermark unmoved — the branch returns BEFORE hr_apply and there is no call site on it',
      `ledger ${ledgerBefore} -> ${ledgerAfter}; party mark ${huntMark}; member marks `
      + `${marks.map((m) => m.accrued_to).join(', ')}`);

    const lease = await one('select shadow_accrued_to, shadow_state from public.party_tick_lease where party_id = $1', [party]);
    const carried = lease?.shadow_state || {};
    judge('S7', new Date(lease?.shadow_accrued_to).getTime() === new Date(to).getTime()
      && U.every((u) => carried[`${u}:0`] && Number(carried[`${u}:0`].v) === 1),
      'the party chains on its OWN shadow watermark and carries EACH member\'s continuation '
      + 'state under the lease lock, keyed <user>:<slot> — RE-VERIFY 5\'s carrier at party '
      + 'grain, and no fourth mechanism was invented for it',
      `shadow_accrued_to ${lease?.shadow_accrued_to} (wanted ${to}); carrier keys `
      + `${Object.keys(carried).join(', ')}`);
  }

  // ══ I  THE REPLAY IS A NO-OP ═════════════════════════════════════════════
  group('I  the same window twice is one window');
  {
    const again = await settle(members, from, to);
    const rows = Number((await one('select count(*)::int as n from public.hr_tick_shadow')).n);
    judge('I1', again?.error === 'party_window_already_settled' && rows === 4,
      're-proposing a SETTLED window is refused by the CAS on arithmetic, before the '
      + 'idempotency index is ever consulted, and writes no fifth row (T-7)',
      `the replay answered ${JSON.stringify(again)} and left ${rows} shadow row(s)`);
  }

  // ══ P  THE PARTIAL-SETTLE MUTANT WRITES NOTHING (S-9) ════════════════════
  group('P  a member set the CAS must reject writes nothing, anywhere');
  {
    const before = await snapshot();
    const short = await settle(members.slice(0, 3), from, to);
    const dup = await settle([members[0], members[0], members[1], members[2]], from, to);
    const after = await snapshot();
    judge('P1', short?.error === 'party_window_already_settled'
      && dup?.error === 'party_window_already_settled',
      'a SHORT member set (3 of 4) and a set naming one member TWICE are both refused — the '
      + 'counts match in the second case and the SETS do not, which every count-only re-count '
      + 'accepts and which buys one member paid twice from a split computed for four',
      `short: ${JSON.stringify(short)}; duplicate: ${JSON.stringify(dup)}`);
    judge('P2', JSON.stringify(before) === JSON.stringify(after),
      'ZERO ROWS WRITTEN ANYWHERE — no shadow row, no ledger row, no watermark, no lease mark. '
      + 'All-or-nothing is not tidiness: a partial settle pays three members a split computed '
      + 'from four contributors, which is a mint (S-9)',
      `the refused settles moved state: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  }

  // ══ C  THE CARRIER IS REFUSED WHILE ARMED, BY ITS THREE NAMES ════════════
  group('C  the carrier\'s three refusal names, per member (RE-VERIFY 5)');
  {
    const bad = await settle(members.map((m, i) => (i === 1 ? { ...m, shadow_state: 'nope' } : m)), to, addSec(to, 90));
    const big = await settle(members.map((m, i) => (i === 1
      ? { ...m, shadow_state: { v: 1, pad: 'x'.repeat(17000) } } : m)), to, addSec(to, 90));
    await db.exec('update public.hr_tick_config set shadow = false where id;');
    const armedCarrier = await settle(
      members.map((m, i) => (i === 1 ? { ...m, shadow_state: { v: 1 } } : m)), to, addSec(to, 90));
    const ledgerNow = Number((await one('select count(*)::int as n from public.player_ledger')).n);
    await db.exec('update public.hr_tick_config set shadow = true where id;');
    judge('C1', bad?.error === 'bad_shadow_state' && big?.error === 'shadow_state_too_large',
      'a non-object carrier and a 17 KiB one are each refused BY NAME, per member — RE-VERIFY '
      + '5\'s bound is OCTETS, so the refusal is countable rather than a check_violation that '
      + 'aborts the whole batch',
      `non-object: ${JSON.stringify(bad)}; oversize: ${JSON.stringify(big)}`);
    judge('C2', armedCarrier?.error === 'shadow_state_while_armed' && ledgerNow === ledgerBefore,
      'a carrier presented on an ARMED settle is REFUSED and pays nothing — design constraint '
      + '2: the branch that PAYS must never silently accept an argument built for the branch '
      + 'that does not, which is how a stale proposal reaches hr_apply',
      `the armed settle answered ${JSON.stringify(armedCarrier)} and the ledger holds ${ledgerNow} `
      + `row(s) against ${ledgerBefore} before`);
  }

  // ══ P-FENCE  INVARIANT 8 AT THE INTENT DOOR ══════════════════════════════
  group('P-FENCE  a partied character\'s own accrue is refused (invariant 8)');
  {
    const accrue = await partyIntentFence({ exec, user: U[0], slot: 0, verb: 'accrue' });
    const equip = await partyIntentFence({ exec, user: U[0], slot: 0, verb: 'equip' });
    const read = await partyIntentFence({ exec, user: U[0], slot: 0, verb: 'market_buy' });
    judge('F1', accrue?.body?.error === 'party_settle_required' && accrue.status === 409,
      'a partied character\'s own `accrue` — including the ~90 s attended cadence — is refused '
      + 'party_settle_required: the party owns [party_hunt.accrued_to, now] and there is '
      + 'nothing for it to price. This is ALSO the whole of S-4\'s attended fence, because with '
      + 'accrue refused no hr_kill_credit_log row is written for a party member at all',
      `accrue answered ${JSON.stringify(accrue)}`);
    judge('F2', equip?.body?.error === 'party_hunt_running' && equip.status === 409,
      'every collectsFirst verb is refused party_hunt_running — each stamps a STAMP_KEYS key or '
      + 'changes an input the shared window is priced from, and a refusal one player can SEE '
      + 'beats an approximation four players share',
      `equip answered ${JSON.stringify(equip)}`);
    judge('F3', read === null && partyRefusalFor('market_buy') === null,
      'a verb that collects nothing is untouched — the fence costs a read only for a verb it '
      + 'could actually refuse',
      `a non-collecting verb answered ${JSON.stringify(read)}`);

    const other = '00000000-0000-4000-8000-0000b80201ff';
    await db.exec(`insert into auth.users (id) values ('${other}') on conflict do nothing;`);
    const free = await partyIntentFence({ exec, user: other, slot: 0, verb: 'accrue' });
    judge('F4', free === null,
      'an UNPARTIED character is not refused — the arm is a fence and not a wall, which a '
      + 'one-reading test could not tell apart',
      `an unpartied character was refused ${JSON.stringify(free)}`);
  }

  // ══ P-ARM  THE ARMED BRANCH, END TO END ══════════════════════════════════
  group('P-ARM  armed: four hr_apply calls, four marks and the party mark together');
  {
    await db.exec('update public.hr_tick_config set shadow = false where id;');
    const aFrom = from;
    const aTo = to;
    /* NO CARRIER ON AN ARMED SETTLE. The fence refuses a non-null one by
       design (`shadow_state_while_armed`, arm C2 above), so a driver that sent
       one here would be measuring that refusal rather than the armed branch. */
    const fresh = (await buildMembers(aFrom, aTo)).map(({ shadow_state, ...m }) => m);
    const goldBefore = await q('select user_id, gold, version from public.player_state where user_id = any($1::uuid[]) and slot = 0 order by user_id', [U]);
    const res = await settle(fresh, aFrom, aTo);
    const marks = await q('select user_id, accrued_to from public.player_state where user_id = any($1::uuid[]) and slot = 0', [U]);
    const huntMark = (await one('select accrued_to from public.party_hunt where id = $1', [hunt])).accrued_to;
    const lease = await one('select shadow_accrued_to, shadow_state from public.party_tick_lease where party_id = $1', [party]);
    const ledger = await q(
      "select user_id, meta->'party' as party, meta->'delta' as delta from public.player_ledger"
      + " where kind = 'combat' and intent = 'accrue' and meta ? 'party' order by user_id", []);

    judge('A1', res?.ok === true && res.mode === 'armed' && res.paid === true,
      'the armed branch reached hr_apply for all four members in ONE transaction — hr_apply is '
      + 'the only money writer and the settle never moves a value except through it',
      `the armed settle answered ${JSON.stringify(res)}`);
    judge('A2', ledger.length === 4
      && ledger.every((r) => Object.keys(r.party || {}).sort().join(',') === [...PARTY_JOURNAL_KEYS].sort().join(',')),
      'four ledger rows carry `meta->\'party\'` with the frozen seven keys — at the level '
      + 'hr_apply ACTUALLY writes it: the journal\'s own keys merge at the TOP of '
      + 'player_ledger.meta, so `meta->\'party\'` is the read and `meta->\'delta\'->\'party\'` is not',
      `${ledger.length} ledger row(s) carry meta->'party'; key sets `
      + `${JSON.stringify(ledger.map((r) => Object.keys(r.party || {}).sort()))}`);
    const wrong = await q("select count(*)::int as n from public.player_ledger where meta->'delta' ? 'party'", []);
    judge('A3', Number(wrong[0].n) === 0,
      'and the WRONG spelling is empty: `meta->\'delta\'` is the engine\'s delta summary '
      + '(g, m, i, x, e, bs, k) and carries no party at all — pinned so the next reader of '
      + '§18.2.6\'s parity query does not find out by measuring zero',
      `${wrong[0].n} ledger row(s) answer meta->'delta'->'party', which must be none`);
    judge('A4', marks.every((m) => new Date(m.accrued_to).getTime() === new Date(aTo).getTime())
      && new Date(huntMark).getTime() === new Date(aTo).getTime(),
      'THE PARTY MARK AND ALL FOUR MEMBER MARKS ADVANCED TOGETHER to the window end — '
      + 'invariant 8 as a fact rather than a promise: for the life of the hunt the party '
      + 'watermark IS the member watermark and this call is the only writer of either',
      `party mark ${huntMark}; member marks ${marks.map((m) => `${m.user_id.slice(-4)}=${m.accrued_to}`).join(', ')}; `
      + `window ended ${aTo}`);
    judge('A5', lease?.shadow_accrued_to === null && lease?.shadow_state === null,
      'the armed payment CLEARED the shadow mark AND the carrier in one statement — '
      + '`accrued_to` is the authority again from here, and a stale carrier left lying around '
      + 'is a second source of truth nobody reads',
      `the lease still holds shadow_accrued_to=${lease?.shadow_accrued_to} and a carrier of `
      + `${lease?.shadow_state === null ? 'null' : Object.keys(lease?.shadow_state || {}).length + ' member(s)'}`);
    judge('A6', goldBefore.length === 4,
      'and the four members were read before and after, so A4 measures a move rather than a '
      + 'state that never differed',
      'the before-snapshot did not read four members');
    await db.exec('update public.hr_tick_config set shadow = true where id;');
  }

  // ══ U  THE UNPAYABLE MEMBER ENDS THE HUNT AND PAYS NOBODY (S-9) ══════════
  group('U  one member hr_apply cannot pay rolls the whole fan-out back');
  {
    await db.exec('update public.hr_tick_config set shadow = false where id;');
    const uFrom = to;
    const uTo = addSec(to, 90);
    await q('update public.party_hunt set accrued_to = $2 where id = $1', [hunt, uFrom]);
    const fresh = await buildMembers(uFrom, uTo);
    /* THE PLANTED REFUSAL, AND IT MUST BE ONE hr_apply ANSWERS — not one the
       settle's own CAS catches first. §18.2.5a names three, all of them
       ORDINARY PLAY rather than corruption, and `too_many_progress_ops` is the
       one with a fixture short enough to plant honestly: §16.5 measured 69 ops
       against `c_max_progress_ops = 64` on an ordinary fight, BEFORE any party
       fan-out. 80 ops is that, comfortably past the cap.

       A stale VERSION would be the shorter fixture and it is deliberately NOT
       used: the settle asserts the version per member at (5b) and would refuse
       the whole call there, which measures the CAS and says nothing at all
       about the fan-out. */
    const broken = (fresh.map(({ shadow_state, ...m }) => m)).map((m, i) => (i === 2
      ? { ...m,
          delta: { ...m.delta,
            progress: Array.from({ length: 80 }, (_, k) => ({
              kind: 'stat', key: `guard:s9:${k}`, add: 1, period_key: '' })) } }
      : m));
    const ledgerBeforeU = Number((await one('select count(*)::int as n from public.player_ledger')).n);
    const res = await settle(broken, uFrom, uTo);
    const ledgerAfterU = Number((await one('select count(*)::int as n from public.player_ledger')).n);
    const h = await one('select ended_at, stopped_by, accrued_to from public.party_hunt where id = $1', [hunt]);

    judge('U1', res?.error === 'member_unpayable' || res?.error === 'party_window_already_settled',
      `one member hr_apply cannot pay took the whole call down (${res?.error})`,
      `the settle answered ${JSON.stringify(res)}`);
    judge('U2', ledgerAfterU === ledgerBeforeU,
      'and paid NOBODY — the fan-out\'s savepoint rolled back every member\'s hr_apply write. '
      + '"Pay the others" is step 5\'s mint: three members paid a split computed from four',
      `the ledger moved ${ledgerBeforeU} -> ${ledgerAfterU}`);
    judge('U3', new Date(h.accrued_to).getTime() === new Date(uFrom).getTime(),
      'the party watermark is NOT advanced, so the window is intact and the same window is '
      + 'priced once per member under the ordinary solo rules on the next fire',
      `party_hunt.accrued_to moved to ${h.accrued_to}, and the window is lost`);
    if (res?.error === 'member_unpayable') {
      judge('U4', h.ended_at !== null && String(h.stopped_by).startsWith('member_unpayable:'),
        `the hunt ENDED with ${h.stopped_by} — hr_partied goes false for all four, invariant 7 `
        + 'stops excluding them, and the retry is four SOLO settles rather than a fifth party '
        + 'attempt that would wedge against the 24 h cap until a night is silently eaten',
        `the hunt is ended_at=${h.ended_at} stopped_by=${h.stopped_by}`);
    } else {
      /* The CAS refused before the fan-out, so U4's subject never ran. Say so
         rather than grading it green: a gate that reports on a branch it did
         not reach is the vacuous proof guard-hygiene R3 exists over. */
      judge('U4', false,
        '',
        `the planted refusal was caught by the CAS (${res?.error}) rather than by the fan-out, so `
        + 'the member_unpayable handler was never reached and S-9\'s roll-back has not been '
        + 'measured by this arm. The migration\'s own §5(k) reads the handler statically; this '
        + 'arm is what would have measured it running.');
    }
    await db.exec('update public.hr_tick_config set shadow = true where id;');
  }
  // ══ E  THE EDGE DRIVER EMITS **ONE** CALL PER PARTY WINDOW ═══════════════
  // The real `settleParty` bytes, over the real `probeParty` and the real
  // `partyFence`, against this database. The combat engine is STUBBED — the
  // point of this arm is the WIRING (probe -> one engine run per member ->
  // splitParty -> ONE fenced call), and `tests/world-tick-combat-parity.mjs`
  // is what proves the engine. `AWAY-12` is safe either way: the driver has no
  // combat code of its own to diverge, which is the property being shown.
  group('E  the edge driver: probe, run each member, emit ONE fenced call');
  {
    await db.exec('update public.hr_tick_config set shadow = true where id;');
    const eFrom = (await one("select date_trunc('second', now()) - interval '400 seconds' as t")).t;
    const eTo = new Date(new Date(eFrom).getTime() + 90000).toISOString();
    await q('update public.party_hunt set accrued_to = $2, ended_at = null, stopped_by = null where id = $1', [hunt, eFrom]);
    await q('update public.player_state set accrued_to = $2 where user_id = any($1::uuid[]) and slot = 0', [U, eFrom]);
    await q('update public.party_tick_lease set owned = true, lease_holder = $2, lease_until = now() + interval \'5 minutes\', shadow_accrued_to = null, shadow_state = null where party_id = $1', [party, HOLDER]);
    await db.exec('delete from public.hr_tick_shadow;');

    const unit = parsePartyUnit({
      party_id: party, hunt_id: hunt, active_id: 'slime', stance: 'steady',
      /* Deliberately a LIE. `parsePartyUnit` parses `accrued_to` only to drop a
         malformed row and THROWS THE VALUE AWAY; the driver re-derives the mark
         from the fence's own refusal. If this number were read, the CAS would
         refuse the window and this arm would be red — which is the point. */
      accrued_to: '2000-01-01T00:00:00.000Z',
      members: U.map((u) => ({ user_id: u, slot: 0 })),
    });

    let calls = 0;
    const seen = [];
    const engine = (session, fromMs, toMs) => {
      const args = {
        p_version: session.version,
        p_window_from: new Date(fromMs).toISOString(),
        p_window_to: new Date(toMs).toISOString(),
        p_delta: { gold: 3, accrued_to: new Date(toMs).toISOString(),
          journal: { kind: 'combat', intent: 'accrue',
            meta: { ms: toMs - fromMs, ticks: 8, kills: 1, capped: false, ate: 0,
              from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), src: 'tick' } } },
      };
      return {
        intents: [{ args, rehydrateBefore: false }],
        char: { _chain: {} },
        watermarkMs: toMs,
        results: [{ summary: { survivedMs: toMs - fromMs, died: false, dryMs: null } }],
      };
    };
    const out = await asRole('hr_engine', () => settleParty(
      exec, HOLDER, unit,
      { cadenceMs: 10000, flushMs: 90000 },
      {
        settle: engine,
        sessionFromRoster: (row, env) => ({
          userId: row.user_id, slot: row.slot, version: env.version,
          accruedToText: row.mark_text, accruedToMs: Date.parse(row.accrued_to),
        }),
        fence: async (ex, a) => { calls += 1; seen.push(a); return (await import('../supabase/functions/hr-accrue/tick-party.js')).partyFence(ex, a); },
      }));

    const rows = await q('select user_id, party from public.hr_tick_shadow where party is not null order by user_id');
    judge('E1', out?.outcome === 'shadowed' && out.members === 4,
      'the driver settled the party as ONE unit and the fence answered SHADOW — the mode is the '
      + 'fence\'s own hr_tick_config.shadow, never the body\'s',
      `the driver answered ${JSON.stringify(out)}`);
    judge('E2', calls === 1 && rows.length === 4,
      'ONE hr_party_tick_settle call for the whole window, and four shadow rows out of it — '
      + '§18.2.5: four calls under a party advisory lock are four transactions, and a crash '
      + 'between the second and the third leaves two members paid from a four-way split with '
      + 'the party watermark un-advanced',
      `${calls} fence call(s) produced ${rows.length} shadow row(s)`);
    judge('E3', seen[0]?.intentId === partyIntentId(party, Date.parse(eFrom), Date.parse(eTo))
      && Date.parse(seen[0]?.windowFrom) === Date.parse(eFrom),
      'the window key is DERIVED from (party, window) and never supplied, and the window starts '
      + 'at the watermark the FENCE reported — the body\'s lying `accrued_to` was thrown away, '
      + 'which is what keeps "the server picks whose world ticks, and from when" a claim about '
      + 'a row somebody else wrote rather than about a POST',
      `the driver sent intent ${seen[0]?.intentId} for [${seen[0]?.windowFrom}, ${seen[0]?.windowTo}); `
      + `the fence's mark was ${eFrom}`);
    judge('E4', seen[0]?.members?.length === 4
      && seen[0].members.every((m) => Object.keys(m.delta.journal.meta.party).sort().join(',')
        === [...PARTY_JOURNAL_KEYS].sort().join(','))
      && seen[0].members.reduce((a, m) => a + m.delta.journal.meta.party.dmg_bp, 0) === 10000,
      'each member carries its OWN attribution as one nested journal key, the set is the frozen '
      + 'seven, and the vector sums to 10,000 bp — the split is src/core/party-split.js\'s, '
      + 'imported and never re-implemented here',
      `the driver sent ${seen[0]?.members?.length} member(s) with key sets `
      + `${JSON.stringify(seen[0]?.members?.map((m) => Object.keys(m.delta.journal.meta.party).sort()))}`);
    judge('E5', seen[0]?.members?.every((m) => m.delta.party === undefined
      && !Object.prototype.hasOwnProperty.call(m.delta, 'activity')),
      'and no member\'s delta grew a top-level `party` key or a stamping key — attribution is '
      + 'JOURNAL, never DELTA (S-1), and the fence would refuse either by name',
      'a member delta carries a top-level party or a stamping key');

    const contrib = memberContribution(engine({ version: 1 }, 0, 90000));
    judge('E6', contrib.damage === 90000 && contrib.fromEngineDamage === false,
      'the contribution seam reads the engine\'s own numbers and SAYS which branch it took — '
      + '`fromEngineDamage: false` is the fallback to fight_ms, and it is false because S3\'s '
      + 'per-member damage counter has not landed. A parity read that silently measured the '
      + 'wrong quantity is the exact failure §16.3 records',
      `the seam answered ${JSON.stringify(contrib)}`);
    judge('E7', parseParties([{ party_id: party, hunt_id: hunt, active_id: 'x',
        accrued_to: eFrom, members: U.map((u) => ({ user_id: u, slot: 0 })) },
        { party_id: party, hunt_id: hunt, active_id: 'x', accrued_to: eFrom,
          members: [{ user_id: U[0], slot: 0 }] },
        { party_id: 'not-a-uuid' }, null]).length === 1,
      'a duplicated unit is ONE party and a malformed one is DROPPED rather than refused — one '
      + 'bad unit must not cost the rest of the cohort its window',
      'parseParties did not collapse the duplicate or did not drop the malformed unit');
  }
} catch (e) {
  if (e.harness) { console.error('\nharness: ' + e.message); await db.close(); process.exit(2); }
  console.error('\nunexpected: ' + (e && e.stack ? e.stack : e));
  await db.close();
  process.exit(2);
}

await db.close();

if (problems.length) {
  console.error(`\nparty-settle: RED — ${problems.length} arm(s) failed: ${problems.join(', ')}`);
  process.exit(1);
}
console.log('\nparty-settle: green — a four-member party settles as ONE unit, journals four rows '
  + 'and pays nothing in shadow; the two rosters partition it; a short, duplicated or unpayable '
  + 'member set writes nothing anywhere; the carrier is per member and refused by name while '
  + 'armed; armed, four hr_apply calls move four member marks and the party mark together and '
  + 'clear the carrier; and a partied character\'s own accrue is refused at the intent door.');

// ── helpers ────────────────────────────────────────────────────────────────

/** The per-member payload the driver builds, read from the database so the
    versions are the ones hr_apply will refuse a stale copy of. */
async function buildMembers(windowFrom, windowTo) {
  const rows = await q(
    'select user_id, slot, version from public.player_state where user_id = any($1::uuid[]) and slot = 0 order by user_id',
    [U]);
  return rows.map((r, i) => ({
    user: r.user_id,
    slot: r.slot,
    version: Number(r.version),
    delta: {
      gold: 4 + i,
      accrued_to: windowTo,
      journal: {
        kind: 'combat',
        intent: 'accrue',
        meta: {
          ms: 89000, ticks: 8, kills: 2, capped: false, ate: 0,
          from: windowFrom, to: windowTo, src: 'tick',
          /* The seven, in §18.2.1a's order. The vectors are the four-way
             even split so (P-b) is exact and readable. */
          party: {
            id: party, hunt, dmg_bp: 2500, xp_bp: 2500,
            floor: 0, fellow_bp: 1500, roll: 4242,
          },
        },
      },
    },
    shadow_state: { v: 1, base_version: Number(r.version), at: Number(new Date(windowTo)) },
  }));
}

/* ── EVERY CALL IS MADE AS THE ROLE THAT ACTUALLY HOLDS IT ──────────────────
   `hr_party_tick_settle` is granted to `hr_engine` and `hr_party_roster` to
   `hr_tick`, and neither may become the other (§15c). Driving them as the
   replay's owner would pass — SECURITY DEFINER runs as the owner either way —
   and would measure a door nobody in production knocks on. It also hides a real
   refusal: `hr_apply`'s impersonation seam tests `v_role = 'hr_engine'`
   literally, so an armed fan-out driven as the owner answers
   `forbidden_impersonation` for every member, which reads as "the armed branch
   is broken" and is nothing of the kind. */
async function asRole(role, fn) {
  await db.exec(`set role ${role};`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}

async function settle(members, windowFrom, windowTo) {
  return asRole('hr_engine', async () => {
    const r = await one(
      'select public.hr_party_tick_settle($1::text, $2::uuid, $3::timestamptz, $4::timestamptz,'
      + ' gen_random_uuid(), $5::text::jsonb) as res',
      [HOLDER, party, windowFrom, windowTo, JSON.stringify(members)]);
    return r.res;
  });
}

/** Everything a refused settle must not have moved. */
async function snapshot() {
  const [shadow] = await q('select count(*)::int as n from public.hr_tick_shadow');
  const [ledger] = await q('select count(*)::int as n from public.player_ledger');
  const state = await q('select user_id, gold, version, accrued_to from public.player_state where user_id = any($1::uuid[]) and slot = 0 order by user_id', [U]);
  const lease = await q('select shadow_accrued_to, shadow_state from public.party_tick_lease where party_id = $1', [party]);
  const h = await q('select accrued_to, ended_at, stopped_by from public.party_hunt where id = $1', [hunt]);
  return { shadow, ledger, state, lease, h };
}

function addSec(t, s) {
  return new Date(new Date(t).getTime() + s * 1000).toISOString();
}
