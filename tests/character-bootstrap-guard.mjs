#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/character-bootstrap-guard.mjs — b338, BEHAVIOURALLY.
//
// THE INVARIANTS:
//   1. `hr_create_character` is an ENSURE. Calling it twice yields one
//      character, one ledger row, and a truthful `created` flag.
//   2. The starting kit it grants is EXACTLY `src/data/start-kit.js` — the
//      same data the client's fresh `G` is built from. A server that mints a
//      character its own game rules would never produce is a content bug with
//      no client-side symptom.
//   3. A lost race returns a VERDICT, never an uncaught 23505 (a PostgREST
//      500 that is indistinguishable from the server being down, while the
//      player's character actually exists).
//   4. The RPC is the ONLY way a player row is written, and the accrual
//      engine cannot call it.
//
// A static regex over the migration would be the twelfth instance of the
// assertion-that-asserts-nothing family. So this boots a real PostgreSQL
// (PGlite / PG18, in process), applies the real migration chain verbatim
// — including the regenerated catalogue and the new file — and then CALLS the
// RPC as a real signed-in caller and reads the tables.
//
// ── THE PART THAT MATTERS MOST, AND WHY IT IS HERE AND NOT IN THE SQL ───
// C6 reads `src/data/start-kit.js` IN NODE and compares it to what actually
// landed in `player_state` / `player_inventory` / `player_equipment` after a
// real RPC call. The migration's own self-check cannot do this: it only ever
// sees the SQL side of the boundary, so it would happily pass on a catalogue
// that was generated from a stale copy of the data. This assertion is the only
// place in the program where the JavaScript source of truth and the row a
// player actually receives are compared to each other.
//
// ── WHAT IS PROVEN, AND WHAT IS NOT ─────────────────────────────────────
//   PROVEN  · create / ensure / bad-slot / anonymous, each with a control;
//           · the kit that lands equals src/data/start-kit.js, field by field;
//           · the bootstrap is atomic with its journal row (rollback proof);
//           · a starting item is never in BOTH equipment and the bag;
//           · the two-bucket rate split — an ensure of an EXISTING character
//             survives an exhausted CREATION budget;
//           · a lost race (injected deterministically) returns a verdict;
//           · no client write policy or grant on any player table, and
//             hr_engine cannot execute the RPC.
//   NOT PROVEN · TRUE CONCURRENCY. PGlite is one backend. C8 INJECTS the
//             23505 a race would produce, at the point it would produce it;
//             it does not run two sessions. Whether the advisory lock actually
//             serialises two connections is unproven here and cannot be — the
//             same standing limitation the clan guard records.
//   NOT PROVEN · the PostgREST request path. The RPC is called as SQL with
//             `request.jwt.claim.sub` set, which is how PostgREST sets it, but
//             the gateway itself is not exercised.
//
// ── FALSIFIABILITY ─────────────────────────────────────────────────────
//   node tests/character-bootstrap-guard.mjs             clean run
//   node tests/character-bootstrap-guard.mjs --list      the mutation catalogue
//   node tests/character-bootstrap-guard.mjs --selftest  every mutation must be caught
//   node tests/character-bootstrap-guard.mjs --mutate=<id>
// A mutation that nothing catches is reported as SLIPPED and exits 1: a guard
// that cannot demonstrate it sees failure is treated as broken, not as a pass.
// ════════════════════════════════════════════════════════════════════════

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootChain, ROOT } from './pglite-chain.mjs';

const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit === undefined ? d : hit.slice(n.length + 3);
};

const MIG = (f) => join(ROOT, 'supabase', 'migrations', f);
// Appended to the shared chain rather than added to it — see bootChain's
// `extra` docs. The catalogue is a hard dependency of the file under test.
const EXTRA = [
  ['catalogue', MIG('2026-08-11-catalogue.generated.sql')],
  ['character-bootstrap', MIG('2026-08-14-character-bootstrap.sql')],
];

// THE JS SIDE OF THE BOUNDARY. Imported, never restated — a test that retypes
// the constants cannot detect the constants being wrong.
const KIT = await import(pathToFileURL(join(ROOT, 'src', 'data', 'start-kit.js')).href);

const UID = '00000000-0000-4000-b338-000000000001';
const UID2 = '00000000-0000-4000-b338-000000000002';

// Two real identities. No profile, no clan — nothing this file asserts needs one.
const FIXTURE_SQL = `
insert into auth.users (id) values ('${UID}'), ('${UID2}') on conflict (id) do nothing;

-- Run one RPC call as a given user. LOCAL set_config, so the identity does not
-- leak between probes.
create or replace function public.__b338_as(p_uid uuid, p_slot int)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  v := public.hr_create_character(p_slot);
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
end $$;

-- What a character actually OWNS, read back out of the real tables.
create or replace function public.__b338_owned(p_uid uuid, p_slot int)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'state', (select to_jsonb(s) - 'created_at' - 'updated_at' - 'accrued_to'
                from public.player_state s where s.user_id = p_uid and s.slot = p_slot),
    'skills', coalesce((select jsonb_object_agg(skill_id, xp) from public.player_skills
                         where user_id = p_uid and slot = p_slot), '{}'::jsonb),
    'inventory', coalesce((select jsonb_object_agg(item_id, qty) from public.player_inventory
                            where user_id = p_uid and slot = p_slot), '{}'::jsonb),
    'equipment', coalesce((select jsonb_object_agg(equip_slot, item_id) from public.player_equipment
                            where user_id = p_uid and slot = p_slot), '{}'::jsonb),
    'plots', (select count(*) from public.player_farm where user_id = p_uid and slot = p_slot),
    'ledger', (select count(*) from public.player_ledger
                where user_id = p_uid and slot = p_slot and intent = 'create_character'),
    'ledger_gold', (select gold from public.player_ledger
                     where user_id = p_uid and slot = p_slot and intent = 'create_character' limit 1)
  )
$$;

-- ATOMICITY. The bootstrap and its journal row must live or die together, so
-- the call is made inside a subtransaction that is then discarded. A journal
-- written out of band — or a character written without one — survives.
create or replace function public.__b338_rollback_probe()
returns jsonb language plpgsql as $$
declare v_r jsonb; v_in int; v_after int; v_led int;
begin
  begin
    v_r := public.__b338_as('${UID2}'::uuid, 0);
    select count(*) into v_in from public.player_state where user_id = '${UID2}';
    select count(*) into v_led from public.player_ledger where user_id = '${UID2}';
    raise exception using errcode = 'HR339';
  exception when sqlstate 'HR339' then null;
  end;
  select count(*) into v_after from public.player_state where user_id = '${UID2}';
  return jsonb_build_object('created', v_r->>'created', 'inside', v_in,
                            'ledger_inside', v_led, 'after_rollback', v_after,
                            'ledger_after', (select count(*) from public.player_ledger where user_id = '${UID2}'));
end $$;

-- THE RACE, injected deterministically. A BEFORE INSERT trigger drops the
-- conflicting row in between the function's re-check and its own INSERT —
-- exactly what a second session that committed first would do.
create or replace function public.__b338_race_probe() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('hearthrise.b338g', true), '') <> 'arm' then return new; end if;
  perform set_config('hearthrise.b338g', 'fired', true);
  insert into public.player_state (user_id, slot, hp, max_hp) values (new.user_id, new.slot, 10, 10);
  return new;
end $$;

create or replace function public.__b338_race(p_uid uuid, p_slot int)
returns jsonb language plpgsql as $$
declare v_r jsonb; v_ctl text; v_state text;
begin
  execute 'create trigger __b338_race_t before insert on public.player_state '
          'for each row execute function public.__b338_race_probe()';

  -- CONTROL: the injector must genuinely produce a 23505. Without this, a
  -- trigger that quietly did nothing would make the result below "pass".
  begin
    perform set_config('hearthrise.b338g', 'arm', true);
    insert into public.player_state (user_id, slot, hp, max_hp) values (p_uid, p_slot, 10, 10);
    v_ctl := 'no error';
  exception when others then v_ctl := sqlstate;
  end;

  perform set_config('hearthrise.b338g', 'arm', true);
  begin
    v_r := public.__b338_as(p_uid, p_slot);
    v_state := 'verdict';
  exception when others then v_state := sqlstate; v_r := null;
  end;
  perform set_config('hearthrise.b338g', '', true);
  execute 'drop trigger __b338_race_t on public.player_state';

  return jsonb_build_object('control_sqlstate', v_ctl, 'outcome', v_state, 'verdict', v_r,
    'rows', (select count(*) from public.player_state where user_id = p_uid and slot = p_slot));
end $$;

-- THE ADVISORY LOCK, OBSERVED RATHER THAN GREPPED.
-- A source-text regex for 'pg_advisory_xact_lock' would be the twelfth
-- assertion-that-asserts-nothing (a regex cannot tell a live call from one
-- inside a comment or a dead branch). pg_locks can: the lock is
-- TRANSACTION-scoped, so it is still held when the function returns and this
-- probe — running in the same transaction, one statement — can see it.
-- The CONTROL is the fast path: ensuring an EXISTING character must take no
-- lock at all, so a green result cannot come from a lock left over from
-- something else, and the contention cost of the common call is pinned too.
create or replace function public.__b338_lock_probe(p_uid uuid, p_free int, p_taken int)
returns jsonb language plpgsql as $$
declare v_before int; v_create int; v_ensure int;
begin
  select count(*) into v_before from pg_locks
   where locktype = 'advisory' and pid = pg_backend_pid() and objsubid = 1 and granted;
  perform public.__b338_as(p_uid, p_free);          -- the CREATE path
  select count(*) into v_create from pg_locks
   where locktype = 'advisory' and pid = pg_backend_pid() and objsubid = 1 and granted;
  perform public.__b338_as(p_uid, p_taken);         -- the FAST path (already exists)
  select count(*) into v_ensure from pg_locks
   where locktype = 'advisory' and pid = pg_backend_pid() and objsubid = 1 and granted;
  return jsonb_build_object('before', v_before, 'after_create', v_create, 'after_ensure', v_ensure);
end $$;

-- A raw client write, attempted as the real 'authenticated' role. If this
-- succeeds, every clamp downstream of the bootstrap is advisory.
create or replace function public.__b338_client_write()
returns jsonb language plpgsql as $$
declare v_ins text; v_upd text;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', '${UID}', true);
    insert into public.player_state (user_id, slot, gold, hp, max_hp)
      values ('${UID}'::uuid, 4, 999999999, 10, 10);
    v_ins := 'ALLOWED';
  exception when others then v_ins := sqlstate;
  end;
  begin
    set local role authenticated;
    update public.player_state set gold = 999999999 where user_id = '${UID}'::uuid;
    v_upd := 'ALLOWED';
  exception when others then v_upd := sqlstate;
  end;
  reset role;
  return jsonb_build_object('insert', v_ins, 'update', v_upd);
end $$;
`;

// ════════════════════════════════════════════════════════════════════════
// THE MUTATION CATALOGUE. `where` records whether the migration's own
// self-check refuses the mutation (`gate` — stronger; the bug cannot even be
// installed) or whether only the probes below see it (`runtime`).
// ════════════════════════════════════════════════════════════════════════
const F = 'character-bootstrap';

// Short-circuits the MIGRATION's own behavioural self-check so that exactly one
// runtime probe in this file has to carry the weight. It models the one failure
// CLAUDE.md names by name — "don't disable a failing test to unblock a push" —
// and it is what makes an `_unguarded` variant prove a probe here rather than
// re-proving the migration's commit gate. HR338 is the code the self-check's own
// handler swallows, so the block ends immediately and passes trivially.
const SKIP_SELFCHECK = [
  `    -- (A) CONTROL — the probe starts with nothing. If this were already`,
  `    raise exception using errcode = 'HR338', message = 'MUTATED: self-check short-circuited';
    -- (A) CONTROL — the probe starts with nothing. If this were already`,
];
const MUTATIONS = {
  slot_taken_regression: {
    what: 'the ensure reverts to `ok:false, slot_taken` — a client whose success response was lost can no longer tell "mine" from "broken"',
    where: 'gate',
    patches: [[F, [[
      `  if exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    return jsonb_build_object('ok', true, 'slot', v_slot, 'created', false);
  end if;`,
      `  if exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'slot_taken');  -- MUTATED slot_taken_regression
  end if;`,
    ]]]],
  },

  no_race_handler: {
    what: 'the unique_violation handler is removed — a lost race escapes as an uncaught 23505, i.e. a PostgREST 500, while the character exists (D1 exactly as found)',
    where: 'gate',
    patches: [[F, [[
      `  exception when unique_violation then
    return jsonb_build_object('ok', true, 'slot', v_slot, 'created', false, 'raced', true);
  end;`,
      `  end;  -- MUTATED no_race_handler`,
    ]]]],
  },

  no_advisory_lock: {
    what: 'the advisory lock is removed — check-then-insert with nothing serialising it. Caught by observing pg_locks, NOT by grepping the source: a regex cannot tell a live call from a commented-out one.',
    where: 'runtime',
    patches: [[F, [[
      `  perform pg_advisory_xact_lock(
    hashtextextended('hr_create_character:' || v_uid::text || ':' || v_slot::text, 0));`,
      `  -- MUTATED no_advisory_lock`,
    ]]]],
  },

  kit_gold_ignored: {
    what: 'the starting gold is hard-coded to 0 instead of read from the catalogue — D3, the drift exactly as found in production',
    where: 'gate',
    patches: [[F, [[`      values (v_uid, v_slot, v_kit.gold, v_kit.gems,`,
                    `      values (v_uid, v_slot, 0, v_kit.gems,  -- MUTATED kit_gold_ignored`]]]],
  },

  no_equipment: {
    what: 'the starting equipment is not granted — the character walks into server-side combat accrual unarmed, which is exactly what production did',
    where: 'gate',
    patches: [[F, [[
      `  insert into public.player_equipment (user_id, slot, equip_slot, item_id)
    select v_uid, v_slot, e.equip_slot, e.item_id from public.hr_start_equipment e;`,
      `  -- MUTATED no_equipment`,
    ]]]],
  },

  equipment_also_in_bag: {
    what: 'the equipped sword is ALSO placed in the inventory — unequipping it then yields two, because hr_apply conserves the pair',
    where: 'gate',
    patches: [[F, [[
      `  if v_kit.farm_plots > 0 then`,
      `  insert into public.player_inventory (user_id, slot, item_id, qty)   -- MUTATED equipment_also_in_bag
    select v_uid, v_slot, e.item_id, 1 from public.hr_start_equipment e
    on conflict (user_id, slot, item_id) do update set qty = public.player_inventory.qty + 1;
  if v_kit.farm_plots > 0 then`,
    ]]]],
  },

  creation_budget_on_ensure: {
    what: 'the strict 6/hour CREATION budget is charged on every call again — a player who reloads seven times is told their character cannot be confirmed',
    where: 'gate',
    patches: [[F, [[
      `  -- FAST PATH. The overwhelmingly common call is "yes, it is already there".`,
      `  if not public.hr_rate_ok(v_uid, 'create_character', 6, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');   -- MUTATED creation_budget_on_ensure
  end if;
  -- FAST PATH. The overwhelmingly common call is "yes, it is already there".`,
    ]]]],
  },

  // ── THE SECOND TIER ────────────────────────────────────────────────────
  // The four above are refused by the migration's OWN self-check, which is the
  // stronger result — the bug cannot even be installed. But it also means this
  // file's runtime probes for them were never exercised, and an unexercised
  // probe is decoration. Each variant below plants the SAME bug AND deletes the
  // self-check assertion that would have refused it, modelling the one failure
  // CLAUDE.md names by name: "don't disable a failing test to unblock a push".
  // Only the guard can see these.
  creation_budget_on_ensure_unguarded: {
    what: 'the ensure is charged the creation budget AND the migration self-check is short-circuited — only C13/C14 can see it',
    where: 'runtime',
    patches: [[F, [
      [`  -- FAST PATH. The overwhelmingly common call is "yes, it is already there".`,
       `  if not public.hr_rate_ok(v_uid, 'create_character', 6, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');   -- MUTATED
  end if;
  -- FAST PATH. The overwhelmingly common call is "yes, it is already there".`],
      SKIP_SELFCHECK,
    ]]],
  },

  no_equipment_unguarded: {
    what: 'no starting equipment AND the migration self-check for it is deleted — only the JS-side parity probe can see it',
    where: 'runtime',
    patches: [[F, [
      [`  insert into public.player_equipment (user_id, slot, equip_slot, item_id)
    select v_uid, v_slot, e.equip_slot, e.item_id from public.hr_start_equipment e;`,
       `  -- MUTATED no_equipment_unguarded`],
      [`    if v_n <> (select count(*) from public.hr_start_equipment)
       or v_n <> (select count(*) from public.player_equipment where user_id = v_uid and slot = 0) then
      raise exception 'B: equipment does not match hr_start_equipment';
    end if;`,
       `    -- MUTATED: the self-check assertion is gone`],
    ]]],
  },

  hearth_tokens_minted_unguarded: {
    what: 'a Hearth Token is minted per character AND the self-check for it is deleted — the IAP bond, free in PvE',
    where: 'runtime',
    patches: [[F, [
      [`v_kit.gems, v_kit.hearth_tokens,`, `v_kit.gems, 1,  -- MUTATED`],
      [`        and gold = v_kit.gold and gems = v_kit.gems and hearth_tokens = 0`,
       `        and gold = v_kit.gold and gems = v_kit.gems  -- MUTATED`],
    ]]],
  },

  no_journal: {
    what: 'the bootstrap writes 500 gold and a sword into the economy and journals nothing',
    where: 'gate',
    patches: [[F, [[`  insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)`,
                    `  insert into public.player_ledger (user_id, slot, kind, intent, gold, meta) select * from (values (null::uuid,null::int,null::text,null::text,null::bigint,null::jsonb)) v where false; -- MUTATED no_journal
  perform (select 1) from (values (`]]]],
  },

  hearth_tokens_minted: {
    what: 'the bootstrap grants a Hearth Token — the IAP bond, minted free once per character slot',
    where: 'gate',
    patches: [[F, [[`v_kit.gems, v_kit.hearth_tokens,`, `v_kit.gems, 1,  -- MUTATED hearth_tokens_minted`]]]],
  },

  engine_can_mint: {
    what: 'hr_engine is granted EXECUTE — the accrual Edge Function, the largest attack surface in the system, gains the ability to mint starting kits',
    where: 'gate',
    patches: [[F, [[
      `revoke execute on function public.hr_create_character(int) from public, anon, service_role, hr_engine;`,
      `grant execute on function public.hr_create_character(int) to hr_engine;  -- MUTATED engine_can_mint`,
    ]]]],
  },

  // ── b339 · §5(K), THE GUARD THAT ASSERTED NOTHING ──────────────────────
  // The original (K) counted `pg_depend` edges. A PL/pgSQL body is opaque to
  // the dependency tracker, so it read 0 on every database forever — including
  // the day the non-VOLATILE caller it exists to catch is added. Measured on
  // production: pg_depend callers of hr_rate_ok = 0, text-scan callers = 6.
  // Both arms of the replacement are mutation-proven here:
  //   · a planted non-VOLATILE caller must go RED (the bug it exists for);
  //   · a deliberately-BLINDED scan must also go RED (the failure it replaced).
  // Neither is catchable by any probe in this file — only the migration's own
  // commit gate can see them, which is the strongest place for them to fail.
  nonvolatile_caller_planted: {
    what: 'a STABLE in-database caller of hr_create_character is planted — the exact A11 shape (a write beneath a non-volatile call tree, 25006 for every player). The pg_depend version of §5(K) counted this as ZERO.',
    where: 'gate',
    patches: [[F, [[
      `-- ── 5. STRUCTURAL ASSERTIONS ─────────────────────────────────────────────`,
      `-- MUTATED nonvolatile_caller_planted
create function public.hr_b339_planted_caller() returns void
language plpgsql stable as $planted$
begin
  perform public.hr_create_character(0);
end $planted$;

-- ── 5. STRUCTURAL ASSERTIONS ─────────────────────────────────────────────`,
    ]]]],
  },

  caller_scan_blinded: {
    what: 'the prosrc caller scan is blinded (its schema filter is narrowed to a namespace that does not exist) so it reports 0 for the same reason pg_depend did. The planted-probe control is the ONLY thing that can tell this from a clean pass.',
    where: 'gate',
    patches: [[F, [[
      `    ' where n.nspname = ''public'' and p.oid <> $1'`,
      `    ' where n.nspname = ''public_MUTATED'' and p.oid <> $1'   -- MUTATED caller_scan_blinded`,
    ]]]],
  },

  caller_scan_pattern_blinded: {
    what: 'the scan keeps its schema filter but its PATTERN is broken (a stray escape that matches no body) — the second, subtler way to swap one blind assertion for another.',
    where: 'gate',
    patches: [[F, [[
      `    '   and p.prosrc ~ ''\\yhr_create_character\\y''';`,
      `    '   and p.prosrc ~ ''\\yhr_create_character_MUTATED\\y''';`,
    ]]]],
  },

  // The kit's JS↔SQL boundary. Mutating the CATALOGUE (not the function) is the
  // only way to model "someone regenerated from stale data / hand-edited the
  // generated file", which is the failure C6 exists for.
  // ── THE JS↔SQL BOUNDARY ────────────────────────────────────────────────
  // These mutate the GENERATED CATALOGUE, not the function — modelling a hand
  // edit of a generated file, or a regenerate from a stale checkout. The
  // migration's own self-check compares SQL to SQL and passes happily; only
  // C2/C3, which read src/data/start-kit.js in Node, can see them. This is the
  // whole reason the guard exists in addition to the migration.
  catalogue_gold_drift: {
    what: 'the catalogue grants different starting gold than src/data/start-kit.js',
    where: 'runtime',
    patches: [['catalogue', [[
      `  values (true, ${KIT.START_CURRENCY.gold}, `,
      `  values (true, ${KIT.START_CURRENCY.gold + 1}, `,
    ]]]],
  },

  catalogue_inventory_drift: {
    what: 'the catalogue grants a different starting quantity than src/data/start-kit.js',
    where: 'runtime',
    patches: [['catalogue', [[
      `  ('turnip_seed',${KIT.START_INVENTORY.turnip_seed});`,
      `  ('turnip_seed',${KIT.START_INVENTORY.turnip_seed + 1});`,
    ]]]],
  },
};

async function run(mutationId) {
  const patches = new Map();
  if (mutationId) {
    const m = MUTATIONS[mutationId];
    if (!m) { const e = new Error(`unknown mutation "${mutationId}"`); e.harness = true; throw e; }
    for (const [file, list] of m.patches) patches.set(file, list);
  }

  let db;
  try {
    ({ db } = await bootChain({ extra: EXTRA, patches: patches.size ? patches : undefined }));
  } catch (e) {
    if (e.harness) throw e;
    return [{ name: 'migration commit gate', ok: false, detail: String(e.message).slice(0, 300) }];
  }
  await db.exec(FIXTURE_SQL);

  const out = [];
  const check = (name, ok, detail) => out.push({ name, ok: !!ok, detail });
  const one = async (sql) => {
    try { return (await db.query(sql)).rows[0]; }
    catch (e) {
      check(`probe threw: ${sql.replace(/\s+/g, ' ').slice(0, 60)}`, false, String(e.message).slice(0, 300));
      return {};
    }
  };
  const R = (v) => (v && typeof v === 'object' ? v : {});

  // ── C1 · CONTROL + create ─────────────────────────────────────────────
  const r1 = R((await one(`select public.__b338_as('${UID}', 0) as r`)).r);
  check('C1  CONTROL · a first create succeeds and says so',
    r1.ok === true && r1.created === true && r1.slot === 0, JSON.stringify(r1));

  const owned = R((await one(`select public.__b338_owned('${UID}', 0) as r`)).r);
  const st = R(owned.state);

  // ── C2 · the kit that landed is the kit in src/data/start-kit.js ──────
  const K = KIT.START_CURRENCY;
  check('C2  the character owns exactly the currencies+vitals in start-kit.js',
    Number(st.gold) === K.gold && Number(st.gems) === K.gems
    && Number(st.hearth_tokens) === 0
    && Number(st.max_hp) === K.maxHp && Number(st.hp) === Math.min(K.hp, K.maxHp)
    && Number(st.bank_cap) === K.bankCap && Number(st.version) === 0
    && st.active_kind === 'idle' && st.active_id === null,
    JSON.stringify({ got: st, want: K }));

  check('C3  the starting inventory is exactly START_INVENTORY',
    JSON.stringify(Object.fromEntries(Object.entries(R(owned.inventory))
      .map(([k, v]) => [k, Number(v)]).sort()))
    === JSON.stringify(Object.fromEntries(Object.entries(KIT.START_INVENTORY).sort())),
    JSON.stringify({ got: owned.inventory, want: KIT.START_INVENTORY }));

  check('C4  the starting equipment is exactly START_EQUIPMENT',
    JSON.stringify(Object.fromEntries(Object.entries(R(owned.equipment)).sort()))
    === JSON.stringify(Object.fromEntries(Object.entries(KIT.START_EQUIPMENT).sort())),
    JSON.stringify({ got: owned.equipment, want: KIT.START_EQUIPMENT }));

  // CONSERVATION. An item that is both worn and in the bag becomes two the
  // moment it is unequipped, because hr_apply conserves the pair.
  check('C5  no starting item is in BOTH equipment and the bag',
    Object.values(KIT.START_EQUIPMENT).every(
      (id) => KIT.START_INVENTORY[id] !== undefined || R(owned.inventory)[id] === undefined),
    JSON.stringify({ equipment: owned.equipment, inventory: owned.inventory }));

  const skills = R(owned.skills);
  const nSkills = Number((await one('select count(*) n from public.hr_skills')).n);
  check('C6  a row per CATALOGUE skill, with START_SKILL_XP applied and the rest at 0',
    Object.keys(skills).length === nSkills
    && Object.entries(KIT.START_SKILL_XP).every(([k, v]) => Number(skills[k]) === v)
    && Object.entries(skills).every(([k, v]) =>
      Number(v) === (KIT.START_SKILL_XP[k] ?? 0)),
    JSON.stringify({ n: Object.keys(skills).length, want: nSkills, skills }));

  // The identity that stops the client's render-time derivation from silently
  // rewriting a server value on the very first refresh.
  const lvl = Number((await one(
    `select public.hr_level_from_xp(${KIT.START_SKILL_XP.hitpoints || 0}) n`)).n);
  check('C7  max_hp equals the level the granted hitpoints XP buys (client derives it)',
    lvl === K.maxHp, JSON.stringify({ hitpoints_level: lvl, max_hp: K.maxHp }));

  check('C8  the plots and ONE journal row carrying the starting gold',
    Number(owned.plots) === K.farmPlots && Number(owned.ledger) === 1
    && Number(owned.ledger_gold) === K.gold,
    JSON.stringify({ plots: owned.plots, ledger: owned.ledger, gold: owned.ledger_gold }));

  // ── C9 · IDEMPOTENCE, with its control ────────────────────────────────
  const r2 = R((await one(`select public.__b338_as('${UID}', 0) as r`)).r);
  const owned2 = R((await one(`select public.__b338_owned('${UID}', 0) as r`)).r);
  const nChars = Number((await one(
    `select count(*) n from public.player_state where user_id = '${UID}'`)).n);
  check('C9  a second identical call creates nothing and says created:false',
    r2.ok === true && r2.created === false && nChars === 1
    && Number(owned2.ledger) === 1 && Number(R(owned2.state).gold) === K.gold,
    JSON.stringify({ verdict: r2, characters: nChars, ledger: owned2.ledger }));

  const r3 = R((await one(`select public.__b338_as('${UID}', 1) as r`)).r);
  check('C10 CONTROL · a DIFFERENT slot still creates — C9 is about the slot, not a dead function',
    r3.ok === true && r3.created === true, JSON.stringify(r3));

  // ── C11 · slot bounds + identity, each with a control ─────────────────
  const bad6 = R((await one(`select public.__b338_as('${UID}', 6) as r`)).r);
  const badN = R((await one(`select public.__b338_as('${UID}', -1) as r`)).r);
  const ok5 = R((await one(`select public.__b338_as('${UID}', 5) as r`)).r);
  check('C11 slot 6 and -1 are refused, and CONTROL slot 5 is not',
    bad6.error === 'bad_slot' && badN.error === 'bad_slot' && ok5.created === true,
    JSON.stringify({ six: bad6, neg: badN, five: ok5 }));

  const anon = R((await one('select public.hr_create_character(3) as r')).r);
  const signed = R((await one(`select public.__b338_as('${UID}', 3) as r`)).r);
  check('C12 an anonymous call is refused, and CONTROL the same call signed in is not',
    anon.error === 'not_signed_in' && signed.created === true,
    JSON.stringify({ anon, signed }));

  // ── C21 · the advisory lock, observed ─────────────────────────────────
  // Slot 4 is free, slot 0 exists. This is the 5th creation of the six allowed.
  const lk = R((await one(`select public.__b338_lock_probe('${UID}', 4, 0) as r`)).r);
  check('C21 the CREATE path takes an advisory lock, and CONTROL the ensure path takes none',
    Number(lk.before) === 0 && Number(lk.after_create) === 1 && Number(lk.after_ensure) === 1,
    JSON.stringify(lk));

  // ── C13 · the two-bucket rate split ───────────────────────────────────
  // Slots 0,1,5,3,4 taken = 5 creations. One more exhausts the 6/hour budget;
  // the slot is then freed so the BUDGET is what refuses the 7th, not the
  // slot range (all six would otherwise be occupied).
  await one(`select public.__b338_as('${UID}', 2) as r`);
  await one(`delete from public.player_state where user_id = '${UID}' and slot = 2`);
  const seventh = R((await one(`select public.__b338_as('${UID}', 2) as r`)).r);
  const ensureAfter = R((await one(`select public.__b338_as('${UID}', 0) as r`)).r);
  check('C13 the 7th CREATION in an hour is refused',
    seventh.error === 'rate_limited', JSON.stringify(seventh));
  check('C14 ...but ENSURING an existing character still works with the creation budget spent',
    ensureAfter.ok === true && ensureAfter.created === false, JSON.stringify(ensureAfter));

  // ── C15 · atomicity ───────────────────────────────────────────────────
  const rb = R((await one('select public.__b338_rollback_probe() as r')).r);
  check('C15 the character and its journal row are written in ONE transaction',
    rb.created === 'true' && Number(rb.inside) === 1 && Number(rb.ledger_inside) === 1
    && Number(rb.after_rollback) === 0 && Number(rb.ledger_after) === 0,
    JSON.stringify(rb));

  // ── C16 · the injected race ───────────────────────────────────────────
  await one(`select public.__b338_as('${UID2}', 1) as r`);           // burn nothing; keeps slot 0 free
  await one(`delete from public.player_state where user_id = '${UID2}'`);
  const race = R((await one(`select public.__b338_race('${UID2}', 0) as r`)).r);
  check('C16 CONTROL · the race injector really produces a 23505',
    race.control_sqlstate === '23505', JSON.stringify(race));
  // `rows === 0` is correct and is an artifact of fault injection, not a bug:
  // catching the 23505 opens a subtransaction whose rollback also discards the
  // row the injector planted inside it. In a real race the winner's row belongs
  // to a different transaction and survives — `created:false` is the truth
  // either way. What this rules out is a handler that swallowed the error and
  // carried on, which would leave a row AND claim `created:true`.
  check('C17 a lost race returns a VERDICT, not an uncaught 23505 (a PostgREST 500)',
    race.outcome === 'verdict' && R(race.verdict).ok === true
    && R(race.verdict).created === false && R(race.verdict).raced === true
    && Number(race.rows) === 0,
    JSON.stringify(race));

  // ── C18 · the RPC is the only door ────────────────────────────────────
  const cw = R((await one('select public.__b338_client_write() as r')).r);
  check('C18 `authenticated` cannot INSERT or UPDATE player_state directly',
    cw.insert !== 'ALLOWED' && cw.update !== 'ALLOWED', JSON.stringify(cw));

  const priv = R(await one(`select
      has_function_privilege('authenticated','public.hr_create_character(int)','execute') a,
      has_function_privilege('anon','public.hr_create_character(int)','execute') n,
      (select exists(select 1 from pg_roles where rolname='hr_engine')
        and has_function_privilege('hr_engine','public.hr_create_character(int)','execute')) e,
      (select provolatile from pg_proc where oid='public.hr_create_character(int)'::regprocedure) v`));
  check('C19 authenticated may call it; anon and hr_engine may not',
    priv.a === true && priv.n === false && priv.e === false, JSON.stringify(priv));
  check('C20 it is VOLATILE — it writes, and PostgREST runs a non-volatile function read-only (25006)',
    priv.v === 'v', JSON.stringify(priv));

  await db.close?.();
  return out;
}

function report(results) {
  let bad = 0;
  for (const r of results) {
    if (!r.ok) bad++;
    process.stdout.write(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}\n`);
    if (!r.ok) process.stdout.write(`        ${r.detail}\n`);
  }
  return bad;
}

async function main() {
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) {
      process.stdout.write(`${id.padEnd(30)} [${m.where}] ${m.what}\n`);
    }
    return 0;
  }

  const only = argOf('mutate', null);
  if (only) {
    process.stdout.write(`MUTATION ${only} — ${MUTATIONS[only]?.what}\n`);
    const bad = report(await run(only));
    if (bad === 0) {
      process.stdout.write('\nSLIPPED: the mutation was not caught. The guard is decoration.\n');
      return 1;
    }
    process.stdout.write(`\nCAUGHT (${bad} assertion(s) red).\n`);
    return 0;
  }

  process.stdout.write('CLEAN RUN\n');
  const bad = report(await run(null));
  if (bad) { process.stdout.write(`\n${bad} assertion(s) FAILED.\n`); return 1; }
  process.stdout.write('\nall green.\n');

  if (!argv.includes('--selftest')) return 0;

  process.stdout.write('\nSELFTEST — every mutation must be caught\n');
  let slipped = 0;
  for (const [id, m] of Object.entries(MUTATIONS)) {
    const res = await run(id);
    const n = res.filter((r) => !r.ok).length;
    const gated = res.length === 1 && res[0].name === 'migration commit gate';
    if (n === 0) { slipped++; process.stdout.write(`  SLIPPED  ${id}\n`); }
    else process.stdout.write(`  caught   ${id.padEnd(30)} ${gated ? 'by the migration commit gate' : `by ${n} runtime assertion(s)`}\n`);
    if (!gated && m.where === 'gate') process.stdout.write('           (note: catalogued as gate, caught at runtime)\n');
    if (gated && m.where === 'runtime') {
      slipped++;
      process.stdout.write('           MISLABELLED: the migration refused it, so the runtime probe is unproven\n');
    }
  }
  if (slipped) { process.stdout.write(`\n${slipped} mutation(s) slipped or mislabelled.\n`); return 1; }
  process.stdout.write('\nevery mutation caught.\n');
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => {
  process.stderr.write(`${e.harness ? 'HARNESS' : 'ERROR'}: ${e.message}\n`);
  process.exit(2);
});
