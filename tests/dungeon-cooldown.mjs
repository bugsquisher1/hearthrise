// ════════════════════════════════════════════════════════════════════════
// tests/dungeon-cooldown.mjs — THE DUNGEON RE-ENTRY COOLDOWN IS A SERVER FACT.
//
//   node tests/dungeon-cooldown.mjs             the guard
//   node tests/dungeon-cooldown.mjs --selftest  plant real defects, require RED
//
// ── THE FINDING (b536 residue-ahead census, item 5) ─────────────────────────
// `G.dungeons.lastRun[id]` was the cooldown: a CLIENT CLOCK stamp
// (src/dungeons.js:422 read, :469/:766 written with Date.now()) living in the
// RESIDUE, which is client-authored by definition. Worse, measured from the code:
// under the settle arm the client NEVER STAMPS IT — runDungeon() returns at the
// armed branch before line 469 and showSummary()'s stamp is in the dormant `else`
// — so canRun() always said "ready", while hr_dungeon_settle refused an AUTO
// re-entry (its own ledger-derived gate) and let a MANUAL one straight through.
// Dungeon loot is mostly ORDINARY TRADEABLE material, so an unlimited manual
// re-entry is a faucet on tradeable goods that needs no clock tampering at all.
//
// 2026-09-12-dungeon-cooldown.sql makes the window server-owned and readable:
// hr_dungeon_cooldowns() derives the ACTIVE windows from the append-only ledger's
// server-stamped `at` + hr_dungeons.cooldown_s; the settle refuses `on_cooldown`
// for every mode in hr_dungeon_cooldown_modes() (auto + manual; scavenger stays
// exempt as authored); hr_state_of projects them as top-level `dungeon_cooldowns`.
//
// This guard boots the REAL ordered migration chain (tests/schema-replay.mjs
// bootReplay — supabase/schema.sql + every migration in
// tests/schema-apply-order.json, on PGlite in process) and proves, BY EXECUTION:
//
//   1. a FRESH character has no cooldown — map {} and envelope {};
//   2. a SETTLE stamps the window from the SERVER CLOCK: next_entry_at equals the
//      ledger row's own `at` + the catalogue cooldown_s, to the microsecond;
//   3. an entry INSIDE the window is refused `on_cooldown` with
//      detail.next_entry_at (and the compat `ready_at`), for mode='auto' AND for
//      mode='manual' — the gap this migration closes;
//   4. a refusal MOVES NOTHING: no key spent, no scrip credited, no version bump,
//      and it is NOT cached in player_intents (a refusal stays retryable);
//   5. the refusal is JOURNALLED in hr_rejections with the detail;
//   6. an entry AFTER the window SUCCEEDS (the gate is a cooldown, not a wall),
//      and its own settle stamps the next window;
//   7. the window is PER (user, slot, dungeon) — another dungeon is unaffected,
//      and another CHARACTER of the same account is unaffected;
//   8. the projection carries ACTIVE windows only (an expired one is absent, so
//      the client cannot show a cooldown the server would allow);
//   9. mode='scavenger' is NOT refused inside an active window (the authored
//      exemption — src/dungeon-scavenger.js:556/584);
//  10. A CLIENT-SUPPLIED TIMESTAMP MOVES NOTHING: the intent has no time-typed
//      parameter at all, and a forged `meta.client_at` / `meta.next_entry_at`
//      planted on the stamping ledger row does not shorten the window;
//  11. a browser role cannot clear its own cooldown: no non-SELECT grant and no
//      non-SELECT RLS policy on player_ledger, and a DELETE attempted as
//      `authenticated` (with the right JWT sub) removes NOTHING;
//  12. the derivation helpers are not executable by anon / authenticated /
//      service_role / PUBLIC (Postgres grants EXECUTE to PUBLIC by default, so
//      the revoke is load-bearing).
//
// ── THE MUTATION PROOF (--selftest) ─────────────────────────────────────────
// Each entry plants a REAL defect in the REAL migration text and demands the run
// turns RED. Where the migration's own §6 commit gate would catch the defect at
// APPLY time, the mutation ALSO removes that assertion, so what goes red is THIS
// guard's own measurement and not the migration refusing to install. A guard that
// cannot be made to fail is not a guard.
//
// player_ledger is APPEND-ONLY (an immutability trigger), so every scenario uses
// its OWN user id and seeds history by INSERT with an explicit `at` rather than
// editing a row. NO ?v= on the imports (tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-09-12-dungeon-cooldown.sql';
const DUNGEON = 'crypt_of_bones';       // req_lv 25, cooldown_s 14400, bone_key
const OTHER = 'goblin_warcamp';         // req_lv 35, cooldown_s 21600, goblin_seal
const KEY = 'bone_key';
const OTHER_KEY = 'goblin_seal';
const CD_S = 14400;                     // crypt_of_bones cooldown, from the catalogue
const XP99 = 13034431;

const uidFor = (n) => `000000d9-0000-0000-0000-0000000000${n}`;

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   Each entry plants ONE real defect in the real migration text. Every arm ALSO
   carries DISARM_GATE, which makes the migration's own §6 commit gate return
   immediately — deliberately, so that what turns RED is THIS guard's runtime
   measurement and not the migration refusing to install. (The §6 gate does refuse
   them: measured 2026-09-12, `refusal_missing` without the disarm fails the apply
   at "GATE(f3): a refused entry consumed the entry key". Both layers bite; only
   one of them can be proven per run, and the guard proves itself.) */
const DISARM_GATE = [
  '  -- (a) THE HELPERS EXIST and are NOT executable by anything a browser can hold.',
  '  return;  -- §6 commit gate disarmed by the mutation proof (tests/dungeon-cooldown.mjs)\n'
  + '  -- (a) THE HELPERS EXIST and are NOT executable by anything a browser can hold.',
];
const MUTATIONS = {
  cooldown_not_stamped: {
    why: 'the window is the settle time itself instead of settle + cooldown_s, so a run never puts a '
       + 'dungeon on cooldown — the re-entry limit silently does not exist',
    pairs: [['             l.last_at + make_interval(secs => d.cooldown_s) as next_entry_at',
             '             l.last_at as next_entry_at']],
  },
  refusal_missing: {
    why: 'the gate computes the window and then never refuses — the cooldown is display-only again, '
       + 'which is the whole finding',
    pairs: [['        if v_next is not null then\n          perform public.hr_reject(',
             '        if false then\n          perform public.hr_reject(']],
  },
  manual_still_exempt: {
    why: 'the mode set goes back to auto-only, so a MANUAL run ignores the re-entry window — the exact '
       + 'production gap (the armed client stamps no cooldown of its own)',
    pairs: [["  select array['auto', 'manual']::text[]", "  select array['auto']::text[]"]],
  },
  projection_dropped: {
    why: 'hr_state_of stops projecting dungeon_cooldowns, so the client has no server cooldown to read '
       + 'and falls back to a client clock — residue-ahead restored',
    pairs: [["    'dungeon_cooldowns', public.hr_dungeon_cooldowns(p_user, v_st.slot),$new$)", '$new$)']],
  },
  window_from_client_value: {
    why: 'the window is derived from a timestamp carried in the ledger row\'s meta instead of the '
       + 'server-stamped `at` — i.e. from a value the payload could choose, which is the class this '
       + 'whole lane exists to kill',
    pairs: [["        from (select meta->>'dungeon' as dungeon_id, max(at) as last_at",
             "        from (select meta->>'dungeon' as dungeon_id,\n"
             + "                     max(coalesce((meta->>'client_at')::timestamptz, at)) as last_at"]],
  },
  projection_leaks_expired: {
    why: 'the projection stops filtering on now(), so an EXPIRED window is still shown — the client '
       + 'locks a player out of a dungeon the server would happily admit',
    pairs: [['   where x.next_entry_at > now()', '   where x.next_entry_at is not null']],
  },
  scavenger_swept_in: {
    why: 'scavenger joins the cooldown mode set — a payout change nobody ruled on (the data and both '
       + 'client paths say a scavenger run has NO cooldown)',
    pairs: [["  select array['auto', 'manual']::text[]", "  select array['auto', 'manual', 'scavenger']::text[]"]],
  },
  helper_client_executable: {
    // MEASURED 2026-09-12: merely DELETING the revoke does NOT open the function —
    // 2026-08-11-anon-execute-lockdown.sql's `alter default privileges … revoke
    // execute on functions from public` already means a new function is born
    // owner-only here, so that arm of the mutation was DECORATION and the guard
    // rightly stayed green. The revoke stays in the migration as defence in depth
    // (CLAUDE.md: revoke before grant), and the defect that can really happen is
    // the one planted here: somebody GRANTS it to a browser role.
    why: 'the derivation is granted to `authenticated`, so a browser can call it directly — a read '
       + 'surface on another player\'s ledger-derived state, and the seam every privileged helper in '
       + 'this repo is kept off',
    pairs: [['revoke execute on function public.hr_dungeon_cooldowns(uuid, int)\n'
             + '  from public, anon, authenticated, service_role;',
             'grant execute on function public.hr_dungeon_cooldowns(uuid, int) to authenticated;']],
  },
};

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  FAIL  ${msg}`); } };

async function boot(mutate) {
  const patches = mutate
    ? new Map([[MIG, [...MUTATIONS[mutate].pairs, DISARM_GATE]]])
    : undefined;
  const { db } = await bootReplay(patches ? { patches } : {});
  return db;
}

/** A fresh, max-combat character with entry keys. No ledger touch. */
async function seed(db, uid, { slot = 0, keys = 3 } = {}) {
  await db.exec(`insert into auth.users (id) values ('${uid}') on conflict (id) do nothing;`);
  await db.exec(`insert into public.player_state (user_id, slot, gold, gems, dungeon_scrip, version)
                 values ('${uid}', ${slot}, 0, 0, 0, 1)
                 on conflict (user_id, slot) do update set dungeon_scrip = 0, version = 1;`);
  await db.exec(`insert into public.player_skills (user_id, slot, skill_id, xp)
                 select '${uid}', ${slot}, s, ${XP99}
                   from unnest(array['attack','strength','defense','hitpoints','prayer','ranged','magic']) s
                 on conflict (user_id, slot, skill_id) do update set xp = ${XP99};`);
  for (const [id, q] of [[KEY, keys], [OTHER_KEY, keys]]) {
    await db.exec(`insert into public.player_inventory (user_id, slot, item_id, qty)
                   values ('${uid}', ${slot}, '${id}', ${q})
                   on conflict (user_id, slot, item_id) do update set qty = ${q};`);
  }
}

/** Seed ONE settle row, `agoS` seconds in the past, optionally with forged meta. */
async function seedSettle(db, uid, { slot = 0, dungeon = DUNGEON, mode = 'auto', agoS = 0, forge = false } = {}) {
  const forged = forge
    ? `, 'client_at', (now() - interval '10 days'), 'next_entry_at', (now() - interval '10 days')`
    : '';
  const r = await db.query(
    `insert into public.player_ledger
       (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta, at)
     values ($1, $2, 'dungeon', 'dungeon_settle:' || $3 || ':' || $4, 0,0,0,0,0,
             jsonb_build_object('op','settle','dungeon',$3,'mode',$4,'scrip',15${forged}),
             now() - make_interval(secs => $5))
     returning at`, [uid, slot, dungeon, mode, agoS]);
  return r.rows[0].at;
}

/** Call the settle AS THE ENGINE (the edge's set-role path). */
async function settle(db, uid, { slot = 0, version = 1, intent, mode = 'auto', quality = 1, dungeon = DUNGEON }) {
  await db.exec('set role hr_engine');
  try {
    const r = await db.query(
      'select public.hr_dungeon_settle($1::uuid,$2::int,$3::bigint,$4::uuid,$5::text,$6::text,$7::numeric) as res',
      [uid, slot, version, intent, dungeon, mode, quality]);
    return r.rows[0].res;
  } finally { await db.exec('reset role'); }
}

const cooldowns = async (db, uid, slot = 0) => (await db.query(
  'select public.hr_dungeon_cooldowns($1::uuid, $2::int) as m', [uid, slot])).rows[0].m;
const envelope = async (db, uid, slot = 0) => (await db.query(
  'select public.hr_state_of($1::uuid, $2::int) as env', [uid, slot])).rows[0].env;
const one = async (db, sql, args = []) => (await db.query(sql, args)).rows[0];
const invQty = async (db, uid, id, slot = 0) => {
  const r = await db.query('select qty from public.player_inventory where user_id=$1 and slot=$2 and item_id=$3',
    [uid, slot, id]);
  return r.rows.length ? Number(r.rows[0].qty) : 0;
};
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

async function runAll(db) {
  // ── (1) A FRESH CHARACTER HAS NO COOLDOWN ────────────────────────────────
  const A = uidFor('a1');
  await seed(db, A);
  ok(JSON.stringify(await cooldowns(db, A)) === '{}', 'a fresh character has an empty cooldown map');
  const env0 = await envelope(db, A);
  ok(env0.dungeon_cooldowns !== undefined, 'the envelope carries a dungeon_cooldowns key');
  ok(JSON.stringify(env0.dungeon_cooldowns || null) === '{}', 'a fresh character projects {}');
  ok(typeof env0.now === 'string', 'the envelope still carries the server clock `now` (the anchor survived)');

  // ── (2) A SETTLE STAMPS THE WINDOW FROM THE SERVER CLOCK ─────────────────
  const r1 = await settle(db, A, { version: 1, intent: uuid(), mode: 'auto' });
  ok(r1 && r1.ok === true, `the first run settles (got ${JSON.stringify(r1 && r1.error)})`);
  const stamped = await one(db,
    `select at, meta->>'mode' as mode from public.player_ledger
      where user_id=$1 and kind='dungeon' order by at desc limit 1`, [A]);
  const map1 = await cooldowns(db, A);
  ok(!!map1[DUNGEON], `the settle stamped the window (map ${JSON.stringify(map1)})`);
  const expect = await one(db, `select (($1::timestamptz + make_interval(secs => $2)) = $3::timestamptz) as eq`,
    [stamped.at, CD_S, map1[DUNGEON]]);
  ok(expect.eq === true,
    `next_entry_at = ledger.at + cooldown_s exactly (at ${stamped.at}, got ${map1[DUNGEON]})`);
  const env1 = await envelope(db, A);
  ok(JSON.stringify(env1.dungeon_cooldowns) === JSON.stringify(map1),
    'the envelope projection equals the gate derivation (one number, not two)');

  // ── (3)+(4)+(5) AN ENTRY INSIDE THE WINDOW IS REFUSED, MOVES NOTHING ─────
  const ver = Number((await one(db, 'select version from public.player_state where user_id=$1 and slot=0', [A])).version);
  const keysBefore = await invQty(db, A, KEY);
  const scripBefore = Number((await one(db, 'select dungeon_scrip from public.player_state where user_id=$1 and slot=0', [A])).dungeon_scrip);
  const iAuto = uuid();
  const rAuto = await settle(db, A, { version: ver, intent: iAuto, mode: 'auto' });
  ok(rAuto && rAuto.error === 'on_cooldown', `an AUTO re-entry inside the window is refused (got ${rAuto && rAuto.error})`);
  ok(rAuto && rAuto.next_entry_at && String(rAuto.next_entry_at).length > 0,
    `the refusal carries detail.next_entry_at (got ${rAuto && rAuto.next_entry_at})`);
  ok(rAuto && rAuto.ready_at, 'the refusal keeps the compat detail.ready_at');
  ok(rAuto && rAuto.dungeon === DUNGEON, 'the refusal names the dungeon');
  const eq2 = await one(db, 'select ($1::timestamptz = $2::timestamptz) as eq', [rAuto.next_entry_at, map1[DUNGEON]]);
  ok(eq2.eq === true, 'the refused next_entry_at is the projected next_entry_at');

  const rMan = await settle(db, A, { version: ver, intent: uuid(), mode: 'manual' });
  ok(rMan && rMan.error === 'on_cooldown',
    `a MANUAL re-entry inside the window is refused — THE GAP (got ${rMan && rMan.error})`);

  ok(await invQty(db, A, KEY) === keysBefore, 'a refused entry consumed no key');
  ok(Number((await one(db, 'select dungeon_scrip from public.player_state where user_id=$1 and slot=0', [A])).dungeon_scrip) === scripBefore,
    'a refused entry credited no scrip');
  ok(Number((await one(db, 'select version from public.player_state where user_id=$1 and slot=0', [A])).version) === ver,
    'a refused entry did not bump the version');
  const cached = await one(db, 'select count(*)::int as n from public.player_intents where user_id=$1 and intent_id=$2', [A, iAuto]);
  ok(cached.n === 0, 'a refusal is NOT cached as an intent result (it stays retryable)');
  const journal = await one(db,
    `select coalesce(sum(n),0)::int as n, max(last_detail->>'next_entry_at') as det
       from public.hr_rejections where user_id=$1 and code='on_cooldown'`, [A]);
  ok(journal.n >= 2, `both refusals are journalled in hr_rejections (n=${journal.n})`);
  ok(!!journal.det, 'the journalled rejection keeps next_entry_at in last_detail');

  // ── (9) SCAVENGER IS EXEMPT, inside the very same window ─────────────────
  const rScv = await settle(db, A, { version: ver, intent: uuid(), mode: 'scavenger' });
  ok(rScv && rScv.ok === true,
    `a SCAVENGER run inside the window is NOT refused — the authored exemption (got ${rScv && rScv.error})`);
  const mapScv = await cooldowns(db, A);
  const eqScv = await one(db, 'select ($1::timestamptz = $2::timestamptz) as eq', [mapScv[DUNGEON], map1[DUNGEON]]);
  ok(eqScv.eq === true, 'a scavenger settle did not move the window either (it neither pays nor respects it)');

  // ── (6)+(8) AFTER THE WINDOW: absent from the projection, and admitted ───
  const B = uidFor('b2');
  await seed(db, B);
  await seedSettle(db, B, { agoS: CD_S + 60 });
  ok(JSON.stringify(await cooldowns(db, B)) === '{}', 'an EXPIRED window is absent from the projection');
  const rAfter = await settle(db, B, { version: 1, intent: uuid(), mode: 'auto' });
  ok(rAfter && rAfter.ok === true, `an entry AFTER the window succeeds (got ${rAfter && rAfter.error})`);
  ok(!!(await cooldowns(db, B))[DUNGEON], 'the successful entry stamped the next window');

  // ── (7) PER (user, slot, dungeon) ────────────────────────────────────────
  const C = uidFor('c3');
  await seed(db, C);
  await seed(db, C, { slot: 1 });
  await seedSettle(db, C, { dungeon: DUNGEON, agoS: 60 });
  const mapC = await cooldowns(db, C);
  ok(!!mapC[DUNGEON] && !mapC[OTHER], `only the run dungeon is on cooldown (${JSON.stringify(mapC)})`);
  ok(JSON.stringify(await cooldowns(db, C, 1)) === '{}', 'a SECOND CHARACTER of the same account is not on cooldown');
  const rOther = await settle(db, C, { version: 1, intent: uuid(), mode: 'auto', dungeon: OTHER });
  ok(rOther && rOther.ok === true, `another dungeon is still enterable (got ${rOther && rOther.error})`);
  const rSlot1 = await settle(db, C, { slot: 1, version: 1, intent: uuid(), mode: 'auto' });
  ok(rSlot1 && rSlot1.ok === true, `slot 1 can run the dungeon slot 0 is cooling down (got ${rSlot1 && rSlot1.error})`);

  // ── (10) A CLIENT-SUPPLIED TIMESTAMP MOVES NOTHING ───────────────────────
  const args = (await one(db,
    `select pg_get_function_identity_arguments(p.oid) as a from pg_proc p
       join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='hr_dungeon_settle'`)).a;
  ok(!/timestamp|date/.test(args), `the settle intent has no time-typed parameter (${args})`);
  const D = uidFor('d4');
  await seed(db, D);
  const forgedAt = await seedSettle(db, D, { agoS: 60, forge: true });
  const mapD = await cooldowns(db, D);
  ok(!!mapD[DUNGEON], 'a forged meta.client_at / meta.next_entry_at 10 days in the past does not clear the window');
  const eqD = await one(db, 'select (($1::timestamptz + make_interval(secs => $2)) = $3::timestamptz) as eq',
    [forgedAt, CD_S, mapD[DUNGEON]]);
  ok(eqD.eq === true, 'the window is still ledger.at + cooldown_s, not the forged value');
  const rForge = await settle(db, D, { version: 1, intent: uuid(), mode: 'manual' });
  ok(rForge && rForge.error === 'on_cooldown', `the forged row still refuses the entry (got ${rForge && rForge.error})`);

  // ── (11) A BROWSER ROLE CANNOT CLEAR ITS OWN COOLDOWN ────────────────────
  const grants = await one(db,
    `select coalesce(string_agg(grantee || ':' || privilege_type, ', '), '') as g
       from information_schema.role_table_grants
      where table_schema='public' and table_name='player_ledger'
        and grantee in ('anon','authenticated','PUBLIC') and privilege_type <> 'SELECT'`);
  ok(grants.g === '', `no non-SELECT client grant on player_ledger (got "${grants.g}")`);
  const pol = await one(db,
    `select coalesce(string_agg(polname || ':' || polcmd::text, ', '), '') as p
       from pg_policy p join pg_class c on c.oid=p.polrelid
       join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='player_ledger' and p.polcmd <> 'r'
        and (p.polroles='{0}'::oid[]
             or p.polroles && (select coalesce(array_agg(oid),'{}'::oid[]) from pg_roles
                                 where rolname in ('anon','authenticated','public')))`);
  ok(pol.p === '', `no non-SELECT RLS policy reachable by a browser role on player_ledger (got "${pol.p}")`);
  const before = await cooldowns(db, D);
  await db.exec(`select set_config('request.jwt.claim.sub', '${D}', false);`);
  await db.exec('set role authenticated');
  let deleteErrored = false;
  try { await db.exec(`delete from public.player_ledger where user_id = '${D}';`); }
  catch { deleteErrored = true; }
  await db.exec('reset role');
  await db.exec(`select set_config('request.jwt.claim.sub', '', false);`);
  const after = await cooldowns(db, D);
  ok(JSON.stringify(after) === JSON.stringify(before),
    `a DELETE as authenticated left the cooldown intact (errored=${deleteErrored}, ${JSON.stringify(after)})`);

  // ── (12) THE HELPERS ARE NOT CLIENT-EXECUTABLE ───────────────────────────
  //    From pg_proc.proacl, NOT information_schema.role_routine_grants: that view
  //    only shows grants involving a currently ENABLED role, so a PUBLIC EXECUTE
  //    grant — the default on every new function — is invisible in it. The first
  //    draft of this assertion used the view and the helper_public_execute mutation
  //    STAYED GREEN with the revoke deleted. coalesce(proacl, acldefault) matters
  //    for the same reason: a NULL proacl IS "EXECUTE to PUBLIC".
  const hg = await one(db,
    `select coalesce(string_agg(p.proname || ':' || coalesce(r.rolname,'PUBLIC'), ', '), '') as g
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       left join pg_roles r on r.oid = a.grantee
      where n.nspname='public'
        and p.proname in ('hr_dungeon_cooldowns','hr_dungeon_cooldown_modes')
        and a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or r.rolname in ('anon','authenticated','service_role'))`);
  ok(hg.g === '', `the derivation helpers are not client-executable (got "${hg.g}")`);
  const idx = await one(db,
    `select count(*)::int as n from pg_indexes
      where schemaname='public' and indexname='player_ledger_dungeon_idx'`);
  ok(idx.n === 1, 'the partial index the derivation reads exists');
}

// ── CLI ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  console.log('dungeon-cooldown --selftest: each mutation must turn the guard RED');
  let bad = 0;
  for (const name of Object.keys(MUTATIONS)) {
    const saveFail = failed; failed = 0; let threw = false;
    try { await runAll(await boot(name)); }
    catch (e) {
      if (e && e.harness) { console.error(`  x ${name}: HARNESS ERROR — ${e.message.split('\n')[0]}`); bad++; failed = saveFail; continue; }
      threw = true;
      console.log(`  ${name}: RED (threw / failed to apply: ${String(e.message).split('\n')[0]})`);
    }
    const wentRed = failed > 0 || threw;
    failed = saveFail;
    if (wentRed) { if (!threw) console.log(`  ${name}: RED (assertions failed) — ${MUTATIONS[name].why}`); }
    else { bad++; console.error(`  x ${name}: STAYED GREEN — the guard does not catch: ${MUTATIONS[name].why}`); }
  }
  if (bad) { console.error(`\n${bad} mutation(s) not caught — the guard is not proving what it claims.`); process.exit(1); }
  console.log(`\nAll ${Object.keys(MUTATIONS).length} mutations caught. The guard is non-vacuous.`);
  process.exit(0);
} else {
  await runAll(await boot(null));
  if (failed) { console.error(`\ndungeon-cooldown: ${failed} assertion(s) FAILED.`); process.exit(1); }
  console.log('dungeon-cooldown: all assertions passed (fresh character clean, settle stamps from the '
    + 'server clock, auto AND manual refused inside the window with next_entry_at, refusal moves nothing '
    + 'and is journalled, scavenger exempt, expired window absent and admitted, per user/slot/dungeon, '
    + 'forged payload timestamp inert, no client write on the ledger, helpers owner-only).');
  process.exit(0);
}
