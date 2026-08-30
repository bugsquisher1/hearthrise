#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/auto-eat-at-creation.mjs — b497, BEHAVIOURALLY.
//
// THE RULING (Game Designer, final authority): every new character starts
// owning Auto-Eat I. `auto_eat_2` (100 Marks, the settable threshold) stays the
// paid upgrade, so no sink is lost.
//
// A static regex over the migration would be the thirteenth instance of the
// assertion-that-asserts-nothing family — and it would be blind to the thing
// that actually matters here, which is that the grant reaches the SAME two
// readers a purchase reaches: hr_auto_eat_tier (the entitlement) and
// player_state.auto_eat_* (the switch the away engine prices a night with). So
// this boots a real PostgreSQL (PGlite / PG18, in process), applies the REAL
// migration chain verbatim, and CALLS hr_create_character as a real signed-in
// player.
//
//   A1  a created character owns `trait:auto_eat` in the exact row shape
//       hr_trait_buy writes — kind='flag', period_key='', value 1 — and
//       hr_auto_eat_tier reads it back as tier 1.
//   A2  auto-eat is ON at the TIER-I CLAMP: auto_eat_enabled = true and
//       auto_eat_pct = hr_auto_eat_max_pct(1) — asserted against the FUNCTION,
//       never the literal 25, so a hard-coded ceiling fails the day the tier
//       table moves.
//   A2b/A2c  …and the bootstrap still leaves `version` at 0 and EXACTLY ONE
//       ledger row. This is the sharpest edge in the whole change and it was
//       found by REPLAYING, not by reading: the first draft routed the switch
//       through hr_set_auto_eat (the tidier-looking choice), which bumps the
//       version and journals a row — and 2026-08-17-cutover-import.sql §(e)
//       reads BOTH as "this character has already played", so every one of
//       tests/cutover-import.mjs's six snapshots went red with
//       `character_already_played`. See also A9.
//   A3  hr_trait_buy('auto_eat') answers `already_owned` and charges NOTHING.
//       A grant that let the shop sell it again would be a Marks sink pointed
//       at a thing the player already has.
//   A4  the PAID upgrade is unchanged: auto_eat_2 is refused for insufficient
//       Marks (NOT for a missing prerequisite — the grant satisfies it), and
//       succeeds at its catalogued price, lifting the tier to 2.
//   A5  creation is still an ENSURE: a second call grants no second flag row,
//       no second character and no second bootstrap ledger row.
//   A6  hr_state_of projects the granted trait, which is the ONLY reason the
//       client needs no change to own it (accrue.js reconcileTraits unions it).
//   A7  §grant-existing: gated OFF by default, and when its GUC is set it
//       restores the flag for a character that lacks one — twice, with no error.
//   A8  the ACL did not move: authenticated may create, hr_engine may NOT
//       (server-authority §2a-iv — the engine must never mint starting kits),
//       anon may not; and player_progress still has no client write policy.
//   A10 the DOCUMENTED ROLLBACK, extracted from the migration header and
//       EXECUTED. A comment is not a control. Three characters: granted (must be
//       revoked), purchased-with-a-live-ledger-row (must survive), and
//       purchased-but-PRUNED — evidence living only in player_ledger_rollup,
//       which keeps `kind` and drops `intent` (must survive). The last is
//       Security F6: without it the rollback revokes a PAID entitlement from
//       every player who bought Auto-Eat more than retain_days (90) ago, and the
//       row that proved they paid is the row that is gone.
//   A9  a cutover-import DRY RUN of an empty plan still succeeds. The bootstrap
//       now writes one player_progress row and hr_import_apply verified its work
//       by comparing the envelope's progress count against a counter of rows THE
//       PLAN wrote — off by exactly one, for every player, at a ceremony that
//       happens once. §1b of the migration reconciles it; this is the assertion
//       that keeps it reconciled.
//
// ── WHAT IS NOT PROVEN ──────────────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend; the advisory lock is exercised
//     and contended by nothing.
//   · The CLIENT half. This asserts the server grants and enables; it says
//     nothing about G.autoActions.eat.enabled. That switch is not written by the
//     migration, but a fresh character still ends up `owned + ON`, because
//     ensureShape() flips it the moment G.foodSlot is set and the fresh-G
//     literal carries foodSlot:'cooked_shrimp' (b495). ⚠ An earlier version of
//     this line said the change "deliberately does NOT flip" it and pointed at a
//     handoff. There is no handoff and none was needed: the server debits
//     attended meals at every visible settle. See the migration header, and
//     tests/accrual-engine.mjs `attendedSettleAutoEatGuard` on 2087eba3.
//
// ── FALSIFIABILITY ─────────────────────────────────────────────────────
//   node tests/auto-eat-at-creation.mjs             clean run
//   node tests/auto-eat-at-creation.mjs --list      the mutation catalogue
//   node tests/auto-eat-at-creation.mjs --selftest  every mutation must be caught
//   node tests/auto-eat-at-creation.mjs --mutate=<id>
// Five of the eight mutations additionally BLIND the migration's own §2
// self-check, so the guard alone has to see them — a defect that only the file
// under test reports is not evidence that the guard works.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bootReplay } from './schema-replay.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = '2026-09-04-auto-eat-at-creation.sql';
const MIG_PATH = join(ROOT, 'supabase', 'migrations', MIG);

/* Blinding the migration's own §2 assertions, so a mutation is graded by THIS
   guard rather than by the file it is testing. */
const BLIND_GRANT = ["  if position('''trait:auto_eat''' in v_src) = 0 then", '  if false then'];
const BLIND_ENABLE = ["  if position('set auto_eat_enabled = true' in v_src) = 0 then",
  '  if false then'];
const BLIND_ORDER = ["  if position('''trait:auto_eat''' in v_src) > position('set auto_eat_enabled = true' in v_src) then",
  '  if false then'];
const BLIND_NOT_SINGLE_WRITER = ["  if position('hr_set_auto_eat(v_slot' in v_src) > 0 then",
  '  if false then'];

const MUTATIONS = {
  no_grant: {
    why: 'the flag row is never written, so the character owns nothing, hr_auto_eat_tier reads 0 '
       + 'and the away engine still lets a 10-HP character die on the first goblin of the night',
    pairs: [
      ["    || '  insert into public.player_progress as pp' || chr(10)",
        "    || '  -- (grant removed)' || chr(10)"],
      ["    || '    (user_id, slot, kind, key, value, period_key, state, updated_at)' || chr(10)", "    || '' || chr(10)"],
      ["    || '  values (v_uid, v_slot, ''flag'', ''trait:auto_eat'', 1, '''', null, now())' || chr(10)", "    || '' || chr(10)"],
      ["    || '  on conflict (user_id, slot, kind, key, period_key)' || chr(10)", "    || '' || chr(10)"],
      ["    || '    do update set value = greatest(pp.value, excluded.value), updated_at = now();' || chr(10)", "    || '' || chr(10)"],
      BLIND_GRANT,
      BLIND_ORDER,
    ],
  },
  enable_skipped: {
    why: 'the trait is granted but never switched on, so the ruling ships as a Settings row nobody '
       + 'was told about and the away night — the P0 half — still dies at the first death',
    pairs: [
      ["    || '     set auto_eat_enabled = true,' || chr(10)",
        "    || '     set auto_eat_enabled = false,' || chr(10)"],
      BLIND_ENABLE,
      BLIND_ORDER,
    ],
  },
  enable_via_set_auto_eat: {
    why: 'THE DEFECT THIS FILE WAS BUILT AROUND, planted deliberately. Routing the switch through '
       + 'hr_set_auto_eat looks like the tidier choice and breaks the CUTOVER: it bumps `version` '
       + 'and writes a set_auto_eat ledger row, and 2026-08-17-cutover-import.sql §(e) reads BOTH '
       + 'as "this character has already played", so hr_import_apply refuses every player at the '
       + 'ceremony. Caught here by the version baseline and the ledger residue',
    pairs: [
      ["    || '  update public.player_state' || chr(10)\n    || '     set auto_eat_enabled = true,' || chr(10)\n    || '         auto_eat_pct     = public.hr_auto_eat_max_pct(' || chr(10)\n    || '                              public.hr_auto_eat_tier(v_uid, v_slot))' || chr(10)\n    || '   where user_id = v_uid and slot = v_slot;' || chr(10)",
        "    || '  perform public.hr_set_auto_eat(v_slot, true, null, null, false);' || chr(10)"],
      BLIND_ENABLE,
      BLIND_ORDER,
      BLIND_NOT_SINGLE_WRITER,
      ["  if position('public.hr_auto_eat_max_pct(' in v_src) = 0\n     or position('public.hr_auto_eat_tier(v_uid, v_slot)' in v_src) = 0 then",
        '  if false then'],
    ],
  },
  enable_before_grant: {
    why: 'hr_set_auto_eat is called BEFORE the flag row exists, so its entitlement gate answers '
       + 'trait_not_owned and auto-eat stays off — silently, because the call is non-fatal',
    pairs: [
      ["  values (v_uid, v_slot, ''flag'', ''trait:auto_eat'', 1, '''', null, now())' || chr(10)",
        "  values (v_uid, v_slot, ''flag'', ''trait:auto_eat_LATER'', 1, '''', null, now())' || chr(10)"],
      BLIND_GRANT,
      BLIND_ORDER,
    ],
  },
  grant_existing_not_idempotent: {
    why: 'the ON CONFLICT is dropped from §grant-existing, so re-running the file against a cohort '
       + 'that already owns the trait raises a unique violation mid-apply',
    pairs: [['  on conflict (user_id, slot, kind, key, period_key) do nothing;',
      '  ;'], BLIND_GRANT],
  },
  import_verify_unreconciled: {
    why: '§1b is skipped, so hr_import_apply still verifies the progress count against a counter '
       + 'of rows THE PLAN wrote while the bootstrap now writes one of its own — every player '
       + 'fails the cutover with verify_mismatch, at a ceremony that happens once',
    pairs: [
      ["  if position('progress env %s <> table %s' in v_src) > 0 then\n    raise notice 'hr_import_apply already compares the envelope against the table — patch skipped';\n    return;\n  end if;",
        '  if true then return; end if;'],
      ["  if to_regprocedure('public.hr_import_apply(uuid,int,jsonb,jsonb,boolean)') is not null\n     and position('progress env %s <> table %s' in",
        "  if false\n     and position('progress env %s <> table %s' in"],
    ],
  },
  rollback_ignores_rollup: {
    why: 'the documented rollback loses its second not-exists clause, so it revokes a PURCHASED '
       + 'Auto-Eat from every player whose trait_buy ledger row has aged past retain_days into '
       + 'player_ledger_rollup (which keeps `kind` and drops `intent`) — an irreversible revoke '
       + 'of a paid entitlement, undiagnosable afterwards because the proof is the pruned row',
    pairs: [[
      "--        and not exists (select 1 from public.player_ledger_rollup r\n"
      + "--                         where r.user_id = pp.user_id and r.slot = pp.slot\n"
      + "--                           and r.kind = 'trait' and r.n > 0);",
      '--        ;']],
  },
  sink_precondition_removed: {
    why: 'the file stops refusing to run when the PAID upgrade is gone. Making tier I free is '
       + '"remove the entry tax" only while auto_eat_2 still exists, costs Marks and requires '
       + 'tier I; without that check it silently becomes "give the whole feature away"',
    pairs: [["  if not exists (select 1 from public.hr_traits\n                  where trait_id = 'auto_eat_2' and req_trait = 'auto_eat' and cost > 0) then\n    raise exception 'hr_traits.auto_eat_2 is missing, free, or no longer requires auto_eat",
      "  if false then\n    raise exception 'unused"]],
  },
};

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

async function run(mutate) {
  const mut = mutate ? MUTATIONS[mutate] : null;
  const patches = mut ? new Map([[MIG, mut.pairs]]) : undefined;
  const { db } = await bootReplay({ patches });

  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const asUser = async (uid, sql, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; } finally { await db.query('reset role').catch(() => {}); }
  };
  const gate = () => q('delete from public.hr_rate_counters');

  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q("insert into auth.users (id, instance_id, aud, role, email) "
    + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
  [uid, 'autoeat@probe.invalid']);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await gate();

  const created = await asUser(uid, 'select public.hr_create_character(0) as r');
  const flags = await q("select kind, key, value::text v, period_key pk from public.player_progress "
    + "where user_id=$1 and slot=0 and kind='flag' order by key", [uid]);
  const tier = Number((await q('select public.hr_auto_eat_tier($1,0)::text t', [uid]))[0].t);
  const st = (await q('select auto_eat_enabled e, auto_eat_pct::text p, marks::text m, gold::text g, '
    + 'version::text v from public.player_state where user_id=$1 and slot=0', [uid]))[0];
  const tierIMax = Number((await q('select public.hr_auto_eat_max_pct(1)::text p'))[0].p);
  const tierIIMax = Number((await q('select public.hr_auto_eat_max_pct(2)::text p'))[0].p);
  const ledger = (await q("select intent from public.player_ledger where user_id=$1 and slot=0 "
    + 'order by at', [uid])).map((r) => r.intent);

  // A5 — the ENSURE.
  await gate();
  const ensured = await asUser(uid, 'select public.hr_create_character(0) as r');
  const flagsAfter = await q("select count(*)::text c from public.player_progress "
    + "where user_id=$1 and slot=0 and kind='flag' and key='trait:auto_eat'", [uid]);
  const bootLedger = (await q("select count(*)::text c from public.player_ledger "
    + "where user_id=$1 and slot=0 and intent='create_character'", [uid]))[0].c;

  // A3 — the shop must not re-sell it.
  await q('update public.player_state set marks = 500 where user_id=$1 and slot=0', [uid]);
  await gate();
  const rebuy = await asUser(uid, 'select public.hr_trait_buy($1,0,null) as r', ['auto_eat']);
  const marksAfterRebuy = (await q('select marks::text m from public.player_state where user_id=$1 and slot=0', [uid]))[0].m;

  // A4 — the PAID upgrade, both halves.
  const cost2 = Number((await q("select cost::text c from public.hr_traits where trait_id='auto_eat_2'"))[0].c);
  await q('update public.player_state set marks = $2 where user_id=$1 and slot=0', [uid, cost2 - 1]);
  await gate();
  const shortBuy = await asUser(uid, 'select public.hr_trait_buy($1,0,null) as r', ['auto_eat_2']);
  await q('update public.player_state set marks = $2 where user_id=$1 and slot=0', [uid, cost2]);
  await gate();
  const buy2 = await asUser(uid, 'select public.hr_trait_buy($1,0,null) as r', ['auto_eat_2']);
  const tier2 = Number((await q('select public.hr_auto_eat_tier($1,0)::text t', [uid]))[0].t);
  const marksAfter2 = (await q('select marks::text m from public.player_state where user_id=$1 and slot=0', [uid]))[0].m;

  // A6 — the envelope projection the client hydrates from.
  await gate();
  const traitsProj = (await q("select public.hr_state_of($1,0)->'traits' as r", [uid]))[0].r;

  // A7 — §grant-existing, run against a character whose flag has been removed.
  //      The migration file is re-executed (with the same mutation applied, so a
  //      mutation cannot hide behind a pristine second copy).
  //      A SECOND, CLEAN CHARACTER: the first one now owns auto_eat_2 as well,
  //      so hr_auto_eat_tier would read 2 whatever this probe did — the
  //      always-non-zero-probe family.
  let migText = (await readFile(MIG_PATH, 'utf8')).replace(/\r\n/g, '\n');
  if (mut) for (const [f, r] of mut.pairs) migText = migText.replace(f, r);
  const uid2 = (await q('select gen_random_uuid() as i'))[0].i;
  await q("insert into auth.users (id, instance_id, aud, role, email) "
    + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
  [uid2, 'autoeat2@probe.invalid']);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid2]);
  await gate();
  await asUser(uid2, 'select public.hr_create_character(0) as r');
  await q("delete from public.player_progress where user_id=$1 and slot=0 and key like 'trait:%'", [uid2]);
  const tierWithout = Number((await q('select public.hr_auto_eat_tier($1,0)::text t', [uid2]))[0].t);
  const tierOf2 = async () => Number((await q('select public.hr_auto_eat_tier($1,0)::text t', [uid2]))[0].t);
  let grantGatedOff = null; let grantOn = null; let grantTwice = null;
  try { await db.exec(migText); grantGatedOff = await tierOf2(); }
  catch (e) { grantGatedOff = `threw: ${e.message}`; }
  await q("select set_config('hearthrise.grant_auto_eat_existing','yes',false)");
  try { await db.exec(migText); grantOn = await tierOf2(); } catch (e) { grantOn = `threw: ${e.message}`; }
  try { await db.exec(migText); grantTwice = 'ok'; } catch (e) { grantTwice = `threw: ${e.message}`; }
  await q("select set_config('hearthrise.grant_auto_eat_existing','',false)");

  /* A9 — THE CUTOVER STILL IMPORTS. The bootstrap now writes one
     player_progress row, and hr_import_apply verified its work by comparing the
     envelope's permanent-progress count against a counter of rows THE PLAN
     wrote — an equality that only held while creation wrote none. A dry-run
     import of an EMPTY plan is the smallest thing that exercises it: the RPC
     creates the character, applies nothing, verifies, and rolls back. If §1b is
     missing this answers verify_mismatch, which is what every player would get
     at a ceremony that happens once. (tests/cutover-import.mjs drives the six
     real snapshots; this is the coupling assertion, here, next to its cause.) */
  const uid3 = (await q('select gen_random_uuid() as i'))[0].i;
  await q("insert into auth.users (id, instance_id, aud, role, email) "
    + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
  [uid3, 'autoeat3@probe.invalid']);
  let importDry = null;
  try {
    importDry = (await q('select public.hr_import_apply($1::uuid, 0, $2::jsonb, $3::jsonb, false) as r',
      [uid3, '{}', '{}']))[0].r;
  } catch (e) { importDry = { ok: false, error: `threw: ${e.message}` }; }

  // A8 — the ACL and the policy posture.
  const acl = (await q(`select
      has_function_privilege('authenticated','public.hr_create_character(integer)','execute') a,
      has_function_privilege('anon','public.hr_create_character(integer)','execute') n,
      (select exists (select 1 from pg_roles where rolname='hr_engine')) has_engine,
      (select case when exists (select 1 from pg_roles where rolname='hr_engine')
        then has_function_privilege('hr_engine','public.hr_create_character(integer)','execute')
        else false end) e,
      (select count(*)::text from pg_policies where schemaname='public'
        and tablename='player_progress' and cmd in ('INSERT','UPDATE','DELETE','ALL')) wp`))[0];

  /* A10 — THE DOCUMENTED ROLLBACK, EXECUTED (Security F6). The revoke query
     lives in the migration's header, and a comment is not a control. This
     EXTRACTS the exact text (never a copy — a copy is how the two drift) and
     runs it against three characters:
       G  granted at creation, no purchase evidence           → must be DELETED
       P  granted, with a LIVE trait_buy ledger row           → must SURVIVE
       R  granted, whose ledger row has been PRUNED and now
          exists only as a player_ledger_rollup row           → must SURVIVE
     R is the whole finding. hr_ledger_prune deletes rows older than
     hr_ledger_config.retain_days (default 90) and rolls them into the rollup,
     which keeps `kind` and DROPS `intent` — so a rollback trusting the live
     journal alone revokes a PAID entitlement from every long-tenured player,
     and the row that proved they paid is exactly the row that is gone.
     RUNS LAST: the delete is deliberately unscoped, so every read above is
     already captured. */
  const rbLines = migText.split('\n');
  const rbStart = rbLines.findIndex((l) => /^--\s+delete from public\.player_progress pp$/.test(l));
  let rollbackSql = null;
  if (rbStart >= 0) {
    const body = [];
    for (let i = rbStart; i < rbLines.length; i++) {
      const line = rbLines[i].replace(/^--\s?/, '');
      body.push(line);
      if (/;\s*$/.test(line)) break;
    }
    rollbackSql = body.join('\n');
  }
  const rb = { extracted: !!rollbackSql };
  if (rollbackSql) {
    const mkChar = async (email) => {
      const u = (await q('select gen_random_uuid() as i'))[0].i;
      await q("insert into auth.users (id, instance_id, aud, role, email) "
        + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
      [u, email]);
      await q('insert into public.profiles (id) values ($1) on conflict do nothing', [u]);
      await gate();
      await asUser(u, 'select public.hr_create_character(0) as r');
      return u;
    };
    const uG = await mkChar('rbg@probe.invalid');
    const uP = await mkChar('rbp@probe.invalid');
    const uR = await mkChar('rbr@probe.invalid');
    await q("insert into public.player_ledger (user_id, slot, kind, intent, meta) "
      + "values ($1, 0, 'trait', 'trait_buy:auto_eat', '{}'::jsonb)", [uP]);
    await q("insert into public.player_ledger_rollup (user_id, slot, month, kind, n, gold_in, gold_out) "
      + "values ($1, 0, date_trunc('month', now() - interval '200 days')::date, 'trait', 1, 0, 0)", [uR]);
    const owns = async (u) => Number((await q("select count(*)::text c from public.player_progress "
      + "where user_id=$1 and slot=0 and kind='flag' and key='trait:auto_eat'", [u]))[0].c);
    rb.before = { G: await owns(uG), P: await owns(uP), R: await owns(uR) };
    try { await db.exec(rollbackSql); rb.ran = true; } catch (e) { rb.ran = `threw: ${e.message}`; }
    rb.after = { G: await owns(uG), P: await owns(uP), R: await owns(uR) };
  }

  return { created, flags, tier, st, tierIMax, tierIIMax, ledger, ensured, flagsAfter, bootLedger,
    rebuy, marksAfterRebuy, cost2, shortBuy, buy2, tier2, marksAfter2, traitsProj,
    tierWithout, grantGatedOff, grantOn, grantTwice, acl, migText, importDry, rb };
}

function grade(o) {
  ok(o.created?.ok === true && o.created?.created === true,
    `FIXTURE: hr_create_character refused: ${JSON.stringify(o.created)}`);

  // ── A1 ────────────────────────────────────────────────────────────────
  const row = o.flags.find((f) => f.key === 'trait:auto_eat');
  ok(!!row, 'A1: a created character does not own trait:auto_eat. This IS the ruling: the last '
    + 'new-player death loop was "the death sheet teaches Auto-Eat, Auto-Eat costs Marks, and the '
    + 'cheapest Mark is 80 kills away".');
  ok(row && row.kind === 'flag' && row.pk === '' && row.v === '1',
    `A1: the ownership row is not the shape hr_trait_buy writes and hr_auto_eat_tier reads `
    + `(${JSON.stringify(row)}). A different shape is an entitlement nothing can see.`);
  ok(o.tier === 1, `A1: hr_auto_eat_tier reads ${o.tier}, expected 1.`);

  // ── A2 ────────────────────────────────────────────────────────────────
  ok(o.st?.e === true,
    'A2: auto_eat_enabled is false on a fresh character. The AWAY half is the P0 — simulateSpan '
    + 'BREAKS on the first death, so an unswitched new player is credited ~30 seconds of a '
    + 'twelve-hour night.');
  ok(Number(o.st?.p) === o.tierIMax,
    `A2: auto_eat_pct is ${o.st?.p}, expected the tier-I ceiling hr_auto_eat_max_pct(1) = `
    + `${o.tierIMax}. Compared against the FUNCTION, not the literal, so a hard-coded 25 at the `
    + 'call site fails here the day the ceiling moves.');
  ok(o.tierIMax < o.tierIIMax,
    `A2 CONTROL: the two tiers no longer differ (I=${o.tierIMax}, II=${o.tierIIMax}), so "enabled `
    + 'at the tier-I clamp" asserts nothing.');
  /* A2b — THE VERSION BASELINE, and it is the sharpest edge in this change.
     hr_set_auto_eat bumps `version` (correctly: those columns price an absence).
     A bootstrapped character must nonetheless leave hr_create_character at 0,
     because 2026-08-17-cutover-import.sql §(e) reads version > 0 as "this
     character has already played" and refuses `character_already_played`. Found
     on a full PGlite replay, not by reading: the first draft of this migration
     turned every cutover-import snapshot red. */
  ok(o.st?.v === '0',
    `A2b: a freshly created character is at version ${o.st?.v}, not 0. `
    + '2026-08-14-character-bootstrap.sql §B asserts that baseline and '
    + '2026-08-17-cutover-import.sql §(e) READS it — a non-zero bootstrap version makes the '
    + 'cutover ceremony refuse character_already_played for EVERY player.');
  /* A2c — THE JOURNAL RESIDUE, the other half of the same trap. The switch must
     leave NO ledger row beyond the bootstrap's own: 2026-08-17-cutover-import.sql
     §(e) refuses `character_already_played` on ANY non-create_character row dated
     at/after created_at, so one extra row at creation refuses every player at the
     cutover ceremony just as surely as a bumped version does. (Restoring the
     version alone fixed half of it; this assertion is the other half.) */
  ok(o.ledger.length === 1 && o.ledger[0] === 'create_character',
    `A2c: creation journalled ${JSON.stringify(o.ledger)}. A bootstrapped character must carry `
    + 'EXACTLY the one create_character row — hr_import_apply reads any other row since '
    + 'created_at as "this character has already played" and would refuse the whole cutover.');

  // ── A3 ────────────────────────────────────────────────────────────────
  ok(o.rebuy?.ok === false && o.rebuy?.error === 'already_owned',
    `A3: hr_trait_buy('auto_eat') answered ${JSON.stringify(o.rebuy)}; a granted trait must be `
    + 'refused as already_owned, not sold again.');
  ok(o.marksAfterRebuy === '500',
    `A3: the refused re-buy still moved Marks (500 -> ${o.marksAfterRebuy}). A charge for something `
    + 'the player already owns is a refund ticket.');

  // ── A4 ────────────────────────────────────────────────────────────────
  ok(o.cost2 > 0, `A4 CONTROL: auto_eat_2 costs ${o.cost2} — the sink the ruling preserves is gone.`);
  ok(o.shortBuy?.error === 'insufficient_marks',
    `A4: one Mark short of auto_eat_2 answered ${JSON.stringify(o.shortBuy)}. It must be `
    + 'insufficient_marks — and specifically NOT "requires:auto_eat", which would mean the grant '
    + 'did not satisfy the prerequisite the paid tier is priced as an upgrade to.');
  ok(o.buy2?.ok === true && o.tier2 === 2,
    `A4: the paid upgrade path changed — ${JSON.stringify(o.buy2)} / tier ${o.tier2}.`);
  ok(o.marksAfter2 === String(o.cost2 - o.cost2),
    `A4: auto_eat_2 debited the wrong amount (left ${o.marksAfter2} of ${o.cost2}).`);

  // ── A5 ────────────────────────────────────────────────────────────────
  ok(o.ensured?.ok === true && o.ensured?.created === false,
    `A5: the second hr_create_character is no longer an idempotent ensure: ${JSON.stringify(o.ensured)}`);
  ok(o.flagsAfter[0].c === '1', `A5: ${o.flagsAfter[0].c} trait:auto_eat rows after two creates.`);
  ok(o.bootLedger === '1', `A5: ${o.bootLedger} create_character ledger rows after two creates.`);

  // ── A6 ────────────────────────────────────────────────────────────────
  ok(Array.isArray(o.traitsProj) && o.traitsProj.includes('auto_eat'),
    `A6: hr_state_of does not project the granted trait (${JSON.stringify(o.traitsProj)}). That `
    + 'projection is the ONLY reason the client needs no change — accrue.js reconcileTraits unions '
    + 'it into G.traits, which is what Settings, the death sheet and the Bounty Shop all read.');

  // ── A7 ────────────────────────────────────────────────────────────────
  ok(o.tierWithout === 0, 'A7 FIXTURE: removing the flag row did not remove the entitlement, so the '
    + 'grant-existing probe would pass without granting anything.');
  ok(o.grantGatedOff === 0,
    `A7: §grant-existing ran without its GUC (tier ${o.grantGatedOff}). It must fail CLOSED — the `
    + 'Coordinator decides whether the current cohort is included.');
  ok(o.grantOn === 1,
    `A7: with hearthrise.grant_auto_eat_existing = 'yes' the existing character still reads tier `
    + `${o.grantOn}.`);
  ok(o.grantTwice === 'ok',
    `A7: re-running the file with the GUC set is not idempotent — ${o.grantTwice}`);

  // ── A9 ────────────────────────────────────────────────────────────────
  ok(o.importDry && o.importDry.ok === true,
    `A9: the cutover import refused a dry run of an EMPTY plan: ${JSON.stringify(o.importDry)}. `
    + 'The bootstrap now writes one player_progress row, and hr_import_apply used to verify the '
    + 'progress count against a counter of rows THE PLAN wrote — off by exactly one, for every '
    + 'player, at a ceremony that happens once. See §1b of the migration.');

  // ── A10 ───────────────────────────────────────────────────────────────
  ok(o.rb.extracted === true,
    'A10: the documented rollback query could not be extracted from the migration header. It is '
    + 'the only revoke instruction anyone will follow; if it cannot be read it cannot be tested, '
    + 'and an untested delete against player entitlements is how a paid trait disappears.');
  if (o.rb.extracted) {
    ok(o.rb.ran === true, `A10: the documented rollback does not execute — ${o.rb.ran}`);
    ok(o.rb.before && o.rb.before.G === 1 && o.rb.before.P === 1 && o.rb.before.R === 1,
      `A10 FIXTURE: not all three probe characters owned the trait before the rollback `
      + `(${JSON.stringify(o.rb.before)}) — the assertions below would pass vacuously.`);
    ok(o.rb.after && o.rb.after.G === 0,
      `A10: the rollback did not revoke a GRANTED trait (${JSON.stringify(o.rb.after)}) — it does `
      + 'not do the one thing it is documented to do.');
    ok(o.rb.after && o.rb.after.P === 1,
      'A10: the rollback deleted a PURCHASED trait whose ledger row is still live. Clause (1) is '
      + 'missing or wrong.');
    ok(o.rb.after && o.rb.after.R === 1,
      'A10 (F6): the rollback deleted a PURCHASED trait whose ledger row had been PRUNED into '
      + 'player_ledger_rollup. hr_ledger_prune drops `intent` at retain_days (default 90), so '
      + 'clause (1) alone silently stops protecting every long-tenured buyer — and the row that '
      + 'proved they paid is the row that is gone, so the mistake is undiagnosable afterwards. '
      + 'Clause (2) (the rollup, kind=\'trait\') is missing.');
  }

  // ── A8 ────────────────────────────────────────────────────────────────
  ok(o.acl.a === true, 'A8: authenticated lost EXECUTE on hr_create_character — nobody can make a character.');
  ok(o.acl.n === false, 'A8: anon can execute hr_create_character.');
  ok(o.acl.has_engine !== true || o.acl.e === false,
    'A8: hr_engine can execute hr_create_character. server-authority §2a-iv: the engine has the '
    + 'largest attack surface in the system and must never be promoted from "propose a delta" to '
    + '"mint characters", i.e. mint starting kits.');
  ok(o.acl.wp === '0',
    `A8: player_progress has ${o.acl.wp} client write policy(ies). This file now writes trait rows `
    + 'from a definer body; a client write policy there would let a browser grant itself every '
    + 'trait in the catalogue, including the paid one.');

  // ── The sink precondition, statically — it cannot be exercised without
  //     breaking the catalogue, so it is asserted as text.
  //     BOTH ends must carry it — §0 refuses to APPLY without the sink, §2
  //     re-reads it afterwards. Counting is what makes this assertion real: a
  //     single-occurrence regex kept passing off §2's copy while §0's had been
  //     deleted (measured, by planting exactly that mutation).
  const sinkChecks = (o.migText.match(
    /trait_id = 'auto_eat_2' and req_trait = 'auto_eat' and cost > 0/g) || []).length;
  ok(sinkChecks === 2,
    `the migration carries ${sinkChecks} of the 2 sink checks (§0 refuses to apply without the paid `
    + 'upgrade; §2 re-reads it after). Granting tier I free is "remove the entry tax" only while '
    + 'auto_eat_2 still exists, costs Marks and requires tier I — without both checks it silently '
    + 'becomes "give the whole feature away".');
}

/** The guard, as a function, so tests/run-smoke.mjs can call it. */
export async function autoEatAtCreationGuard() {
  problems.length = 0;
  grade(await run());
  return [...problems];
}

const argv = process.argv.slice(2);
const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/auto-eat-at-creation.mjs');
if (RUN_DIRECTLY) {
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(30)} ${m.why}`);
    process.exit(0);
  }
  const mutateArg = argv.find((a) => a.startsWith('--mutate='));
  if (argv.includes('--selftest')) {
    let bad = 0;
    for (const id of Object.keys(MUTATIONS)) {
      problems.length = 0;
      let caught = false;
      try { grade(await run(id)); caught = problems.length > 0; } catch (e) { caught = true; }
      console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${id}`);
      if (!caught) { bad++; console.log(`         ${MUTATIONS[id].why}`); }
    }
    console.log(bad ? `\n${bad} mutation(s) NOT caught — the guard is blind to them.`
      : `\nall ${Object.keys(MUTATIONS).length} mutations caught.`);
    process.exit(bad ? 1 : 0);
  }
  grade(await run(mutateArg ? mutateArg.split('=')[1] : undefined));
  if (problems.length) {
    console.error(`auto-eat-at-creation: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(mutateArg ? 0 : 1);
  }
  console.log('auto-eat-at-creation: green — a created character owns Auto-Eat I in the shape '
    + 'hr_auto_eat_tier reads, is switched on at a DERIVED tier-I clamp, leaves version 0 and one '
    + 'ledger row so the cutover still imports, the shop refuses to re-sell it, the paid upgrade is '
    + 'unchanged, creation is still an ensure, the envelope projects it, §grant-existing is gated '
    + 'and idempotent, and no ACL or policy moved.');
  if (mutateArg) { console.error('the mutation was NOT caught'); process.exit(1); }
}
