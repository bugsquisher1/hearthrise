-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — player_state.bank_cap TRACKS THE PURCHASED BANK RUNGS (SA-010 / Q-4)
--
-- ⚠⚠⚠ STAGED — REVIEW ONLY, NOT AUTO-APPLIED. This touches a TRADEABLE-ITEM
--     surface (the bank_full gate every item-crediting apply passes through),
--     so the Coordinator applies it only after a Security GO, with
--     `node tools/apply-migration.mjs supabase/migrations/2026-09-06-bank-cap-tracks-rungs.sql`.
--
-- ── THE BUG, MEASURED IN SOURCE ─────────────────────────────────────────────
-- Bank space is SOLD by public.hr_unlock_buy as a 30-rung MAX ladder
-- (2026-08-19-gold-spend-slices-2-3.sql: offers bank.0 … bank.29, +20 stacks a
-- rung). The purchase files a permanent player_progress row
-- (kind='unlock', key='bank', value=<rungs owned>) — and nothing else.
--
-- public.player_state.bank_cap, meanwhile, has exactly two writers:
-- hr_create_character (from hr_start_kit.bank_cap = 100) and the cutover
-- importer. No rung has ever moved it.
--
-- hr_apply's `bank_full` check counts DISTINCT stacks against v_st.bank_cap —
-- player_state.bank_cap, read under the row lock. So a player who has PAID for
-- ten rungs has a client cap of 300 and a SERVER cap of 100: past 100 stacks
-- every item-touching apply (a kill's loot, a gather, a craft, a shop buy, a
-- settle) is refused server-side, whatever they paid. The gold left the
-- account; the capability never arrived.
--
-- ── THE FIX, AND WHY THIS SHAPE ─────────────────────────────────────────────
-- Two shapes were considered:
--
--   (a) DERIVE AT READ. Make every bank_full enforcer compute
--       greatest(player_state.bank_cap, cap_from_rungs(user, slot)). Cannot
--       drift by construction — but the enforcer is hr_apply (the 86KB
--       SECURITY DEFINER authority engine, on a multi-link derivation chain),
--       plus every future one. That is a non-additive edit to the single most
--       dangerous body in the repo, it adds a per-apply join to
--       player_progress on the hottest path in the game, and it leaves
--       hr_state_of's PROJECTED bank_cap — still player_state.bank_cap, and
--       what the client mirrors — reporting the wrong (lower) number. Two
--       caps: one enforced, one shown.
--
--   (b) KEEP ONE STORED CAP AND MAINTAIN IT AT THE WRITE.  ← CHOSEN
--       player_state.bank_cap stays the single enforced number, and a trigger
--       on the ONE row that can change the entitlement — player_progress
--       (kind='unlock', key='bank') — raises it to the rung-derived cap. So:
--         · hr_apply is not touched. Not one byte of the authority engine, not
--           one link of any derivation chain, no hash pin moved.
--         · hr_unlock_buy is not touched either — it builds its return
--           envelope with hr_state_of AFTER the progress write, so the buyer's
--           very first response already carries the new cap. No round trip, no
--           reload, no second writer to keep in step.
--         · hr_state_of's projected bank_cap IS the enforced bank_cap, by
--           identity rather than by agreement. The Q-4 client fix mirrors it.
--         · The enforcement read stays one column of a row already locked.
--       The cost of a stored derived value is DRIFT, and it is paid three
--       ways: the trigger is on the TABLE, so every writer of the rung (the
--       RPC, the importer, a future gem-priced path) is covered rather than
--       just the one we know about; §4 backfills every existing row; and
--       tests/bank-cap-rungs.mjs fails if any character's stored cap is below
--       its rung-derived cap.
--
-- RAISE-ONLY, DELIBERATELY. Every write here is `where bank_cap < derived`. A
-- cap may legitimately sit ABOVE the ladder — the b227 grandfather and the
-- cutover importer both mint one — and a "correcting" lower would strand real
-- items behind a cap the player never lost. Nothing in this file can reduce a
-- bank cap.
--
-- ── THE LADDER NUMBERS ARE NOT A SECOND HAND-TYPED COPY ─────────────────────
--   BASE      read from public.hr_start_kit.bank_cap — the generated catalogue
--             row (tools/gen-catalogues.mjs ← src/data/start-kit.js bankCap),
--             which is where the server's 100 already lives.
--   CEILING   read from public.hr_unlocks.max_value for unlock_id='bank' — the
--             generated ladder (tools/gen-gold-ladders.mjs ← src/data/
--             gold-ladders.js BANK_RUNGS), so a 31st rung needs no edit here.
--   PER RUNG  20, the ONE magnitude typed in this file, because no server
--             catalogue carries it: src/data/gold-ladders.js says outright that
--             BANK_STACKS_PER_RUNG is "client-read magnitude; NOT sent to SQL".
--             tests/bank-cap-rungs.mjs closes that by MEASURING the installed
--             function — hr_bank_cap_for_rungs(1) - (0) must equal
--             BANK_STACKS_PER_RUNG, and (0) must equal both
--             START_CURRENCY.bankCap and legacy.js BANK_SPACE.BASE_CAP — so
--             the constant cannot drift from the data without a red build.
--
-- ── WHAT IS ADDED ───────────────────────────────────────────────────────────
--   §1  hr_bank_cap_for_rungs(int) -> int   the ladder, stated once
--   §2  hr_bank_cap_sync()                  AFTER trigger fn on player_progress
--   §3  grants (revoke-first; nothing outside the definer path may execute)
--   §4  the one-time, idempotent, raise-only backfill
--   §5  structural assertions
--   §6  self-verifying gate — a real ladder climb, rolled back to zero effect
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   drop trigger if exists player_progress_bank_cap_sync on public.player_progress;
--   drop function if exists public.hr_bank_cap_sync();
--   drop function if exists public.hr_bank_cap_for_rungs(int);
--   The caps §4 raised STAY raised (they are the caps the players paid for, and
--   lowering them would strand items); the revert restores the old behaviour
--   for FUTURE purchases only. No table is altered, no policy is written, NO
--   existing function body is replaced — nothing joins a derivation chain and
--   no hash pin moves.
--
-- SAFE TO RE-RUN. Every step is create-or-replace / guarded / raise-only, and
-- §6's probe rolls itself back.
-- ════════════════════════════════════════════════════════════════════════
-- The apply harness owns the transaction (no top-level begin/commit here, per
-- the repo S5 convention — see 2026-08-27-bank-store.sql / 2026-08-25-workers.sql).
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
declare v_src text; v_base int; v_max bigint;
begin
  if to_regclass('public.player_state')    is null then raise exception 'player_state missing — apply 2026-08-11-player-state.sql first'; end if;
  if to_regclass('public.player_progress') is null then raise exception 'player_progress missing'; end if;
  if to_regclass('public.hr_start_kit')    is null then raise exception 'hr_start_kit missing — apply the generated catalogue first'; end if;
  if to_regclass('public.hr_unlocks')      is null then raise exception 'hr_unlocks missing — apply 2026-08-16-unlocks.generated.sql first'; end if;

  select bank_cap into v_base from public.hr_start_kit where only_row;
  if v_base is null or v_base < 1 then
    raise exception 'hr_start_kit has no usable bank_cap (%) — the ladder BASE would be invented here '
                    'instead of read from the generated catalogue', v_base;
  end if;

  select max_value into v_max from public.hr_unlocks where unlock_id = 'bank';
  if v_max is null or v_max < 1 then
    raise exception 'hr_unlocks has no bank ladder (max_value %) — apply '
                    '2026-08-19-gold-spend-slices-2-3.sql first. Without the ceiling this file would '
                    'clamp a purchased rung to a number it made up', v_max;
  end if;

  -- THE ENFORCER PIN. This file is only worth applying because hr_apply refuses
  -- on player_state.bank_cap. If a later build moved that check to another
  -- source, raising this column would be decoration and the bug would stay live
  -- behind a green migration.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply' limit 1;
  if v_src is null then raise exception 'hr_apply does not exist — apply the engine chain first'; end if;
  if position('bank_full' in v_src) = 0 or position('bank_cap' in v_src) = 0 then
    raise exception 'the live hr_apply does not enforce bank_full against bank_cap — this file would '
                    'raise a column nothing reads. Re-read the enforcer before applying.';
  end if;
  -- Negative control: a sentinel that appears in no hr_apply body. If the scan
  -- above were blind it would "pass" on anything.
  if position('bank_cap_sentinel_that_must_not_match' in v_src) > 0 then
    raise exception 'THE hr_apply SOURCE SCAN IS BLIND (negative control matched)';
  end if;

  -- The same pin for the PROJECTION: the client mirrors what hr_state_of sends,
  -- and "projected == enforced" is half this file's contract.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of' limit 1;
  if v_src is null or position('bank_cap' in v_src) = 0 then
    raise exception 'hr_state_of does not project bank_cap — the client could not mirror the enforced cap';
  end if;
end $$;

-- ── 1. THE LADDER, STATED ONCE ─────────────────────────────────────────────
-- cap(rungs) = hr_start_kit.bank_cap + least(rungs, catalogue ceiling) * 20,
-- clamped to the player_state.bank_cap CHECK ceiling so this function can never
-- propose a value the column refuses.
--
-- STABLE, not IMMUTABLE: it reads two catalogue tables. SECURITY INVOKER — it
-- touches no player data, so a definer here would be a privilege for nothing.
create or replace function public.hr_bank_cap_for_rungs(p_rungs int)
returns int
language sql
stable
set search_path = public, pg_temp
as $body$
  select least(
           100000,
           (select bank_cap from public.hr_start_kit where only_row)
           + least(
               greatest(coalesce(p_rungs, 0), 0),
               coalesce((select max_value from public.hr_unlocks where unlock_id = 'bank'), 0)
             )::int
             /* BANK_STACKS_PER_RUNG — src/data/gold-ladders.js. The one
                magnitude this file types; tests/bank-cap-rungs.mjs measures it
                back against the data on every CI run. */
             * 20
         )::int
$body$;

-- ── 2. THE WRITE-SIDE MAINTAINER ───────────────────────────────────────────
-- AFTER INSERT OR UPDATE, on the bank rung row only. Raise-only.
--
-- Why a trigger and not a line inside hr_unlock_buy: the entitlement IS the
-- row, so the guarantee belongs to the row. hr_unlock_buy is one writer of it
-- today; hr_import_apply is another; a gem-priced bank path would be a third. A
-- trigger cannot be forgotten by the next writer, and it is the shape
-- player_progress already uses for its unlock invariants (hr_unlock_guard).
--
-- SECURITY INVOKER, exactly like hr_unlock_guard: every legitimate writer of
-- player_progress is a SECURITY DEFINER RPC running as the owner (the table has
-- no client write policy at all), so the trigger inherits the privilege it
-- needs and holds none of its own.
--
-- LOCKING: the update targets the player_state row the calling RPC already
-- holds FOR UPDATE (hr_unlock_buy takes the per-character advisory lock and the
-- row lock before it writes the rung), so this adds no new lock and no new
-- ordering.
create or replace function public.hr_bank_cap_sync()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_cap int;
begin
  v_cap := public.hr_bank_cap_for_rungs(greatest(0, least(new.value, 2147483647))::int);
  update public.player_state ps
     set bank_cap = v_cap
   where ps.user_id = new.user_id
     and ps.slot    = new.slot
     and ps.bank_cap < v_cap;   -- RAISE-ONLY: a grandfathered/imported higher cap survives.
  return null;                  -- AFTER trigger: the return value is ignored.
end $$;

-- ── 3. GRANTS — revoke, and grant to NOBODY ────────────────────────────────
-- Neither function is an RPC. hr_bank_cap_sync is reachable only as a trigger
-- (fired inside the definer RPCs that write the row) and hr_bank_cap_for_rungs
-- is called only by it, by this file and by the guard's verification query —
-- all of which run as the owner. A grant to `authenticated` would be a read of
-- another character's entitlement shape for no caller that needs it. §5 asserts
-- the empty ACL, including for hr_engine.
revoke execute on function public.hr_bank_cap_sync()
  from public, anon, authenticated, service_role;
revoke execute on function public.hr_bank_cap_for_rungs(int)
  from public, anon, authenticated, service_role;

-- WHEN(...) narrows this to ONE key of the PERMANENT population. The unbounded
-- periodic population (period_key <> '') never evaluates it, and neither does
-- any other unlock, stat, quest or flag row.
drop trigger if exists player_progress_bank_cap_sync on public.player_progress;
create trigger player_progress_bank_cap_sync
  after insert or update on public.player_progress
  for each row when (new.period_key = '' and new.kind = 'unlock' and new.key = 'bank')
  execute function public.hr_bank_cap_sync();

-- ── 4. THE BACKFILL — ONE TIME, IDEMPOTENT, RAISE-ONLY ─────────────────────
-- Every character who already bought rungs is walking around with the base cap.
-- After this statement no row is below its rung-derived cap; re-running it is a
-- no-op (the `<` predicate matches nothing).
do $$
declare v_n int;
begin
  update public.player_state ps
     set bank_cap = public.hr_bank_cap_for_rungs(greatest(0, least(pp.value, 2147483647))::int)
    from public.player_progress pp
   where pp.user_id = ps.user_id
     and pp.slot    = ps.slot
     and pp.kind    = 'unlock'
     and pp.key     = 'bank'
     and pp.period_key = ''
     and ps.bank_cap < public.hr_bank_cap_for_rungs(greatest(0, least(pp.value, 2147483647))::int);
  get diagnostics v_n = row_count;
  raise notice 'bank-cap-tracks-rungs §4: % character row(s) raised to the cap they paid for', v_n;
end $$;

-- ── 5. STRUCTURAL ASSERTIONS ───────────────────────────────────────────────
do $$
declare v_p oid; v_bad text; v_left int;
begin
  v_p := to_regprocedure('public.hr_bank_cap_for_rungs(integer)');
  if v_p is null then raise exception 'hr_bank_cap_for_rungs did not install'; end if;
  if not exists (select 1 from unnest(coalesce((select proconfig from pg_proc where oid = v_p),
                                               array[]::text[])) c where c like 'search_path=%') then
    raise exception 'hr_bank_cap_for_rungs has no pinned search_path';
  end if;
  foreach v_bad in array array['public','anon','authenticated','service_role','hr_engine'] loop
    if has_function_privilege(v_bad, v_p, 'execute') then
      raise exception 'hr_bank_cap_for_rungs is EXECUTABLE BY % — it is a trigger helper, not an RPC', v_bad;
    end if;
  end loop;

  v_p := to_regprocedure('public.hr_bank_cap_sync()');
  if v_p is null then raise exception 'hr_bank_cap_sync did not install'; end if;
  if (select prosecdef from pg_proc where oid = v_p) is not false then
    raise exception 'hr_bank_cap_sync is SECURITY DEFINER — a trigger fn that writes player_state must '
                    'inherit its caller''s privilege, never carry its own';
  end if;
  foreach v_bad in array array['public','anon','authenticated','service_role','hr_engine'] loop
    if has_function_privilege(v_bad, v_p, 'execute') then
      raise exception 'hr_bank_cap_sync is EXECUTABLE BY %', v_bad;
    end if;
  end loop;

  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'player_progress'
                    and t.tgname = 'player_progress_bank_cap_sync' and not t.tgisinternal) then
    raise exception 'the player_progress_bank_cap_sync trigger did not install — a purchased rung would '
                    'still leave the authority enforcing the base cap';
  end if;

  -- The ladder answers the numbers the client charges for.
  if public.hr_bank_cap_for_rungs(0) <> (select bank_cap from public.hr_start_kit where only_row) then
    raise exception 'hr_bank_cap_for_rungs(0) is not the start-kit cap';
  end if;
  if public.hr_bank_cap_for_rungs(1) - public.hr_bank_cap_for_rungs(0) <> 20 then
    raise exception 'a rung is not worth 20 stacks — the server ladder and BANK_SPACE.gold.slots disagree';
  end if;
  if public.hr_bank_cap_for_rungs(10) <> public.hr_bank_cap_for_rungs(0) + 200 then
    raise exception 'the ladder is not linear in rungs';
  end if;
  -- A forged / overflowing rung count cannot mint an unbounded cap: the ceiling
  -- comes from the catalogue and the column CHECK is respected.
  if public.hr_bank_cap_for_rungs(2147483647) <> public.hr_bank_cap_for_rungs(
       (select max_value from public.hr_unlocks where unlock_id = 'bank')::int) then
    raise exception 'the rung count is not clamped to the catalogue ceiling';
  end if;
  if public.hr_bank_cap_for_rungs(-5) <> public.hr_bank_cap_for_rungs(0) then
    raise exception 'a negative rung count does not floor at the base cap';
  end if;

  -- §4 left nothing behind.
  select count(*) into v_left
    from public.player_state ps
    join public.player_progress pp
      on pp.user_id = ps.user_id and pp.slot = ps.slot
     and pp.kind = 'unlock' and pp.key = 'bank' and pp.period_key = ''
   where ps.bank_cap < public.hr_bank_cap_for_rungs(greatest(0, least(pp.value, 2147483647))::int);
  if v_left > 0 then
    raise exception 'the backfill left % character(s) below the cap they paid for', v_left;
  end if;

  raise notice 'bank-cap-tracks-rungs §5 PASSED: ladder derived from the catalogues, clamped both ends, '
               'trigger installed, helpers executable by nobody, backfill complete.';
end $$;

-- ── 6. SELF-VERIFYING GATE — a real ladder climb, ROLLED BACK ──────────────
-- Proves the property end to end on the INSTALLED objects, then raises to roll
-- the probe back to zero effect. hr_unlock_buy itself is driven by
-- tests/bank-cap-rungs.mjs (it needs the Edge seam and the rate counters); what
-- is proven here is the invariant every writer of the row inherits.
do $$
declare
  v_uid uuid := '00000000-0000-0000-0000-0000000bca01'::uuid;
  v_base int;
  v_cap  int;
  v_env  jsonb;
begin
  begin
    select bank_cap into v_base from public.hr_start_kit where only_row;

    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, bank_cap, version)
      values (v_uid, 0, v_base, 1)
      on conflict (user_id, slot) do update set bank_cap = v_base, version = 1;

    -- (a) CONTROL — the probe starts at the base cap, so (b) is measuring the
    --     trigger and not a cap that was already high.
    select bank_cap into v_cap from public.player_state where user_id = v_uid and slot = 0;
    if v_cap <> v_base then
      raise exception 'GATE(a): the probe did not start at the start-kit cap (% vs %)', v_cap, v_base; end if;

    -- (b) BUYING RUNGS RAISES THE ENFORCED CAP. The row is written the way every
    --     writer writes it; the trigger does the rest.
    insert into public.player_progress (user_id, slot, kind, key, period_key, value)
      values (v_uid, 0, 'unlock', 'bank', '', 3)
      on conflict (user_id, slot, kind, key, period_key)
      do update set value = greatest(player_progress.value, excluded.value);
    select bank_cap into v_cap from public.player_state where user_id = v_uid and slot = 0;
    if v_cap <> v_base + 60 then
      raise exception 'GATE(b): three purchased rungs left the enforced cap at % (expected %)',
                      v_cap, v_base + 60; end if;

    -- (c) THE PROJECTION IS THE ENFORCEMENT. hr_state_of must send the same
    --     number hr_apply refuses on, or the client mirrors a lie.
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_env := public.hr_state_of(v_uid, 0);
    if (v_env->'state'->>'bank_cap')::int is distinct from v_cap then
      raise exception 'GATE(c): hr_state_of projects bank_cap % while the authority enforces %',
                      v_env->'state'->>'bank_cap', v_cap; end if;

    -- (d) CLIMBING FURTHER KEEPS TRACKING.
    update public.player_progress set value = 10
     where user_id = v_uid and slot = 0 and kind = 'unlock' and key = 'bank' and period_key = '';
    select bank_cap into v_cap from public.player_state where user_id = v_uid and slot = 0;
    if v_cap <> v_base + 200 then
      raise exception 'GATE(d): rung 10 left the cap at % (expected %)', v_cap, v_base + 200; end if;

    -- (e) RAISE-ONLY. A cap already ABOVE the ladder (grandfather / import) is
    --     never pulled down by a later rung write.
    update public.player_state set bank_cap = 5000 where user_id = v_uid and slot = 0;
    update public.player_progress set value = 11
     where user_id = v_uid and slot = 0 and kind = 'unlock' and key = 'bank' and period_key = '';
    select bank_cap into v_cap from public.player_state where user_id = v_uid and slot = 0;
    if v_cap <> 5000 then
      raise exception 'GATE(e): a rung write LOWERED a grandfathered cap 5000 -> %, which strands items '
                      'the player legitimately holds', v_cap; end if;

    -- (f) BLAST RADIUS. An unrelated unlock row must not touch the cap at all.
    update public.player_state set bank_cap = v_base where user_id = v_uid and slot = 0;
    insert into public.player_progress (user_id, slot, kind, key, period_key, value)
    select v_uid, 0, 'unlock', u.unlock_id, '', u.rungs[1]
      from public.hr_unlocks u
     where u.unlock_id <> 'bank' and u.progress_kind = 'unlock' and u.rungs is not null
     order by u.unlock_id
     limit 1
    on conflict do nothing;
    select bank_cap into v_cap from public.player_state where user_id = v_uid and slot = 0;
    if v_cap <> v_base then
      raise exception 'GATE(f): an unrelated unlock moved bank_cap to % — the WHEN clause is too wide', v_cap; end if;

    raise exception using errcode = 'HR820', message = 'bank-cap-tracks-rungs §6 complete — rolling back';
  exception when sqlstate 'HR820' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state      where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from auth.users             where id = v_uid) then
    raise exception 'GATE: §6 LEAKED a probe row';
  end if;

  raise notice 'bank-cap-tracks-rungs: purchased rungs raise the ENFORCED cap, hr_state_of projects the '
               'same number, a grandfathered cap is never lowered, unrelated unlocks are untouched — all green';
end $$;
