-- ============================================================================
-- 2026-09-22-world-tick-combat-channel.sql
--
--   STAGED, NOT APPLIED — REVIEW ONLY.
--
-- MILESTONE 3 of the world tick (docs/planning/WORLD_TICK_DESIGN.md §16): the
-- COMBAT channel, in SHADOW. This file is the database half and it is
-- deliberately small, because the milestone's content is in the ENGINE INPUTS
-- and in the FOLD, not in new SQL:
--
--   §1  `hr_tick_config.channels` gains the CHECK it never had. It is the only
--       tunable on that row with no constraint, and it is the column that
--       decides which kinds the tick may be pointed at.
--   §2  `hr_tick_shadow` gains eight COMBAT columns, so a 48 h parity read can
--       be answered PER FIELD. "The tick paid 5% less" is not an actionable
--       sentence; "the tick paid 5% less and ate 0 meals" is.
--   §3  The §4 self-check, on PROBE ROWS ONLY.
--
-- ── WHAT THIS FILE DOES NOT DO, STATED SO A READER DOES NOT LOOK FOR IT ─────
--
-- * IT DOES NOT ARM COMBAT. `hr_tick_config.channels` keeps its `array['gather']`
--   default and the singleton row is not updated. Turning combat on is an
--   operator UPDATE with its own Security GO; a migration that widened the
--   default would arm a channel by applying a file.
--
-- * IT DOES NOT ADD 'combat' TO ANY CHANNEL ENUM, BECAUSE BOTH ALREADY HAVE IT.
--   `hr_tick_ownership_channel_ck` (2026-09-20-world-tick-roster.sql :249) and
--   `hr_tick_shadow_channel_ck` (2026-09-21-world-tick-settle-fence.sql :285)
--   both read `check (channel in ('combat','gather','artisan'))`. The enum half
--   of this milestone is a no-op and this file says so rather than restating a
--   constraint to look busy. §3 e1 asserts it rather than trusting the comment.
--
-- * IT DOES NOT RESTATE `hr_tick_settle`. The eight new columns are STORED
--   GENERATED over the `delta` the fence already stores verbatim, so there is
--   no new INSERT path, no ordering dependency on an unapplied function body,
--   NO LIVE HASH MOVED — and the columns cannot disagree with the delta they
--   are derived from, which a hand-written INSERT list eventually would.
--
-- * IT MOVES NO PLAYER VALUE AND TOUCHES NO PLAYER TABLE. `hr_tick_shadow` and
--   `hr_tick_config` are operational (tests/restore-census.baseline.json
--   classifies the shadow journal `operational` + `player_value_exempt`:
--   losing every row of it costs a MEASUREMENT, not a progression).
--
-- MUST APPLY AFTER 2026-09-21-world-tick-settle-fence.sql, which creates both
-- tables. §0 preflights on them rather than assuming.
--
-- ── OPERATOR PRE-FLIGHT, READ-ONLY, BEFORE THE APPLY (Security S-5) ─────────
-- The `channels` CHECK below is validated against the EXISTING row on apply,
-- and a NULL ELEMENT in the live array makes the predicate NULL — which
-- PASSES validation. §3 c2c only probes a temp table, so it never sees the
-- live row. Run this first and read the answer:
--
--   select channels,
--          array_position(channels, null) as has_null_element,
--          enabled, shadow
--     from public.hr_tick_config where id;
--   -- Expect: channels = {gather}, has_null_element NULL, enabled false,
--   --         shadow true.
--
-- If `has_null_element` is NOT NULL, STOP: clean the array before applying, or
-- the constraint validates a value the tick cannot settle.
--
-- RE-RUNNABLE. Every statement is `if not exists`-guarded, so a second apply is
-- byte-identical (tests/schema-drift.mjs replays the chain twice).
--
-- REVERSIBLE: `alter table public.hr_tick_shadow drop column would_kills, …;`
-- and `alter table public.hr_tick_config drop constraint
-- hr_tick_config_channels_ck;`. No player-visible effect either way.
-- ============================================================================

-- ── §0 PREFLIGHT ────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.hr_tick_config') is null then
    raise exception 'run 2026-09-21-world-tick-settle-fence.sql first — hr_tick_config is missing';
  end if;
  if to_regclass('public.hr_tick_shadow') is null then
    raise exception 'run 2026-09-21-world-tick-settle-fence.sql first — hr_tick_shadow is missing';
  end if;
  if to_regclass('public.hr_tick_ownership') is null then
    raise exception 'run 2026-09-20-world-tick-roster.sql first — hr_tick_ownership is missing';
  end if;
end $$;

-- ── §1 THE CHANNEL LIST IS CONSTRAINED ──────────────────────────────────────
-- `channels text[] not null default array['gather']` shipped with no CHECK,
-- while `cadence_seconds`, `flush_seconds`, `batch_limit`, `lease_ms` and
-- `edge_url` all carry one. It is not the most dangerous column on that row —
-- `edge_url` is, and Security M-5 constrained it — but it is the one that says
-- WHICH KINDS THE TICK MAY SETTLE, and an unconstrained one accepts 'farm',
-- 'fram', or ''. `hr_tick_settle` refuses a channel outside its own `c_payable`
-- anyway, so this is defence in depth: it turns a typo that would silently
-- roster nothing into a constraint violation at the moment it is typed.
--
-- ⚠ THE LITERAL IS NOW IN FOUR PLACES, all copies of accrual.js PAYABLE_KINDS,
--   because plpgsql cannot import it: hr_tick_roster's `c_payable`,
--   hr_tick_settle's `c_payable`, hr_tick_ownership's channel CHECK, and this.
--   The price of the fourth copy is a drift guard, and it is paid:
--   tests/world-tick-combat-parity.mjs C15 compares THIS constraint's literal
--   against PAYABLE_KINDS credential-free, exactly as world-tick-parity.mjs
--   P-G7/P-G7b do for the other three.
--
-- NOT VALIDATED SEPARATELY and not NOT VALID: the singleton is one row that
-- already satisfies it, so the table scan is a single tuple.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'hr_tick_config_channels_ck'
                    and conrelid = 'public.hr_tick_config'::regclass) then
    execute $ck$
      alter table public.hr_tick_config
        add constraint hr_tick_config_channels_ck check (
          channels <@ array['combat','gather','artisan']::text[]
          and coalesce(array_length(channels, 1), 0) between 1 and 3
        )
    $ck$;
  end if;
end $$;

-- ── §2 THE COMBAT COLUMNS ON THE SHADOW JOURNAL ─────────────────────────────
-- `hr_tick_shadow` denormalises `would_gold`, `would_qty`, `would_ticks` today.
-- That is the GATHER shape: one quantity, one skill, no deaths, no meals, no
-- drop table. A combat parity read asks different questions and a jsonb walk
-- over 48 h of rows is not the way to answer them.
--
-- ── WHY GENERATED AND NOT INSERTED ─────────────────────────────────────────
-- The three existing columns are computed in `hr_tick_settle`'s INSERT list.
-- Adding eight more there would mean restating an UNAPPLIED function body,
-- which creates an ordering dependency between two staged files and gives a
-- reviewer two copies of one arithmetic to compare. STORED GENERATED columns
-- are derived from `delta` — the object the fence stores verbatim and the one
-- `hr_apply` would have received — so they cannot disagree with it, and this
-- file restates nothing.
--
-- ── WHY EVERY EXPRESSION IS TYPE-GUARDED ───────────────────────────────────
-- A generated expression runs on EVERY insert, and a cast that throws would
-- fail the settle rather than the column. `jsonb_typeof(...) = 'number'` before
-- every numeric cast, and `= 'array'` before every length, so there is no throw
-- path: a malformed delta produces a 0 or a NULL and the row still lands with
-- the delta intact for a human to read.
--
-- ── WHY `would_recovering_until` IS text AND NOT timestamptz ────────────────
-- The cast `text -> timestamptz` is STABLE, not IMMUTABLE — it reads the
-- TimeZone GUC — so a generated column cannot use it (Postgres refuses the
-- ALTER). Storing the ISO string the engine actually proposed is the honest
-- value anyway: it is the byte `hr_apply` would have been handed, and a parity
-- read comparing a recovery line wants that string, not this session's idea of
-- what it means. Cast it in the query if you need an instant.
alter table public.hr_tick_shadow
  -- kills, straight off the journal meta the engine wrote.
  add column if not exists would_kills bigint
    generated always as (
      case when jsonb_typeof(delta #> '{journal,meta,kills}') = 'number'
           then (delta #>> '{journal,meta,kills}')::bigint else 0 end
    ) stored,
  -- ★ MEALS. The auto-eat parity number of §16.4: the tick shipped with the
  --   auto-eat keys absent paid -65.0% gold and ate ZERO, and no column in the
  --   gather shape would have shown which of those was the cause.
  add column if not exists would_ate bigint
    generated always as (
      case when jsonb_typeof(delta #> '{journal,meta,ate}') = 'number'
           then (delta #>> '{journal,meta,ate}')::bigint else 0 end
    ) stored,
  -- XP BY SKILL, not a sum: "which skill" is half the question.
  add column if not exists would_xp jsonb
    generated always as (
      case when jsonb_typeof(delta -> 'xp') = 'object' then delta -> 'xp'
           else '{}'::jsonb end
    ) stored,
  -- ITEMS BY ID, SIGNED. Drops are positive and the auto-eat debit is
  -- negative, in one map, because that is how the engine proposes it and how
  -- hr_apply's `have + delta >= 0` re-check reads it.
  add column if not exists would_items jsonb
    generated always as (
      case when jsonb_typeof(delta -> 'items') = 'object' then delta -> 'items'
           else '{}'::jsonb end
    ) stored,
  -- DEATHS, as a count. The rows themselves are in `delta.deaths` with their
  -- ladder rungs; the count is what a GROUP BY wants.
  add column if not exists would_deaths int
    generated always as (
      case when jsonb_typeof(delta -> 'deaths') = 'array'
           then jsonb_array_length(delta -> 'deaths') else 0 end
    ) stored,
  -- THE RECOVERY STATE, as the engine spelled it. NULL is "this character is
  -- up", which is a statement and not an absence — exactly as
  -- `delta.recovering_until = null` is a VOID and not a missing key.
  add column if not exists would_recovering_until text
    generated always as (delta ->> 'recovering_until') stored,
  -- THE RESULTING HP, and the retreat counter. Both ABSOLUTE checkpoints, so a
  -- parity read can see a knockout ladder walking without re-deriving it.
  add column if not exists would_hp int
    generated always as (
      case when jsonb_typeof(delta -> 'hp') = 'number'
           then (delta ->> 'hp')::int else null end
    ) stored,
  add column if not exists would_consec_falls int
    generated always as (
      case when jsonb_typeof(delta -> 'consec_falls') = 'number'
           then (delta ->> 'consec_falls')::int else null end
    ) stored;

-- The 48 h parity read groups by hour and channel; `would_*` are already on the
-- row so this is a covering read of one index range. No new index: `at` is
-- already indexed (hr_tick_shadow_at_idx) and the table's own 14-day retention
-- bounds it.
comment on column public.hr_tick_shadow.would_ate is
  'Meals the tick WOULD have eaten. Zero here beside a non-zero player_ledger '
  'meta.ate is the auto-eat input gap of WORLD_TICK_DESIGN.md §16.4.';

-- ── §3 SELF-CHECK — EXECUTED (CLAUDE.md §4) ─────────────────────────────────
-- PROBE ROWS ONLY. Every row this block touches is one it inserted itself,
-- under a uuid `gen_random_uuid()` cannot mint, and every predicate binds `v_u`
-- — a variable this block declared (tests/selfcheck-no-global-dml.mjs is the
-- standing detector; the 2026-09-20 production failure was a self-check that
-- DELETEd from every player's ledger). The config singleton is probed through a
-- TEMP `LIKE` copy rather than by UPDATEing the real row, for the same reason
-- the fence's e22 does. The whole block is rolled back regardless of outcome.
do $$
declare
  v_u    uuid := '00000000-0000-4000-8000-0000000c0bad';
  v_n    int;
  v_txt  text;
  v_d    jsonb;
  v_from timestamptz := now() - interval '10 minutes';
  v_to   timestamptz := now() - interval '5 minutes';
  v_k    bigint;
  v_a    bigint;
  v_dd   int;
  v_ru   text;
  v_hp   int;
  v_cf   int;
  v_xp   jsonb;
  v_it   jsonb;
begin
  begin
    -- ── c1: THE ENUM HALF IS ALREADY DONE. Asserted, not assumed: both channel
    --        CHECKs must already admit 'combat', or this milestone needs the
    --        constraint change its header says it does not.
    insert into public.hr_tick_ownership (user_id, slot, channel) values (v_u, 0, 'combat');
    select count(*) into v_n from public.hr_tick_ownership
     where user_id = v_u and slot = 0 and channel = 'combat';
    if v_n <> 1 then
      raise exception 'c1: hr_tick_ownership refused the combat channel — the enum half is NOT a no-op';
    end if;
    if exists (select 1 from public.hr_tick_ownership
                where user_id = v_u and slot = 0 and channel = 'combat' and owned) then
      raise exception 'c1b: a fresh ownership row shipped OWNED — the rollout switch fails open';
    end if;

    -- ── c2: THE channels CHECK BITES, on a TEMP copy so the singleton is never
    --        touched. `LIKE ... INCLUDING ALL` carries the constraints AND the
    --        defaults behind the NOT NULLs.
    create temp table hr_tick_config_probe
      (like public.hr_tick_config including constraints including defaults) on commit drop;
    -- the legal shapes
    insert into hr_tick_config_probe (id, channels) values (true, array['gather']::text[]);
    delete from hr_tick_config_probe where id;
    insert into hr_tick_config_probe (id, channels) values (true, array['combat','gather']::text[]);
    delete from hr_tick_config_probe where id;
    -- ...and the illegal ones, by execution
    foreach v_txt in array array['farm', 'fram', '', 'COMBAT'] loop
      begin
        insert into hr_tick_config_probe (id, channels) values (true, array[v_txt]::text[]);
        raise exception 'c2: hr_tick_config.channels accepted %, which the tick cannot settle',
          quote_literal(v_txt);
      exception when check_violation then
        delete from hr_tick_config_probe where id;
      end;
    end loop;
    -- an EMPTY list is refused too: a tick pointed at nothing is a config that
    -- reads as "off" while `enabled` says on, which is the ambiguity the kill
    -- switch exists to not have.
    begin
      insert into hr_tick_config_probe (id, channels) values (true, array[]::text[]);
      raise exception 'c2b: hr_tick_config.channels accepted an EMPTY list';
    exception when check_violation then
      delete from hr_tick_config_probe where id;
    end;
    -- ── c2c: A NULL ELEMENT IS REFUSED, AND THIS IS NOT A FORMALITY.
    --   `channels` is `not null`, which says nothing about its ELEMENTS, and a
    --   CHECK that evaluated to NULL would PASS — the classic three-valued
    --   hole. `<@` uses equality and NULL matches nothing, so containment is
    --   FALSE rather than NULL and the constraint bites; asserted by execution
    --   because "I believe `<@` returns false here" is exactly the kind of
    --   belief this repo writes exit codes for.
    foreach v_txt in array array['{NULL}', '{gather,NULL}'] loop
      begin
        insert into hr_tick_config_probe (id, channels) values (true, v_txt::text[]);
        raise exception 'c2c: hr_tick_config.channels accepted % — a NULL element made the '
                        'CHECK evaluate to NULL, which passes', v_txt;
      exception when check_violation then
        delete from hr_tick_config_probe where id;
      end;
    end loop;

    -- ── c3: THE REAL SINGLETON IS UNCHANGED AND STILL DISARMED. Applying this
    --        file must not arm a channel, and this is the assertion that says so.
    select count(*) into v_n from public.hr_tick_config where 'combat' = any (channels);
    if v_n <> 0 then
      raise exception 'c3: applying this file put combat in hr_tick_config.channels — '
                      'arming is an operator UPDATE with its own Security GO, not a migration';
    end if;
    if exists (select 1 from public.hr_tick_config where enabled or not shadow) then
      raise exception 'c3b: the tick config is no longer DISARMED + SHADOW';
    end if;

    -- ── c4: ★ THE GENERATED COLUMNS ARE THE DELTA, NOT A SECOND COPY OF IT ★
    --        A realistic combat delta goes in; every would_* column is read
    --        back and compared against the delta's own terms. Nothing here
    --        restates arithmetic — the point is that the column IS the value.
    v_d := jsonb_build_object(
      'gold', 872,
      'accrued_to', to_jsonb(v_to),
      'hp', 41,
      'consec_falls', 2,
      'recovering_until', '2026-09-22T20:14:00.000000+00:00',
      'xp', jsonb_build_object('attack', 4120, 'hitpoints', 1030),
      'items', jsonb_build_object('bones', 37, 'goblin_ear', 12, 'cooked_trout', -8),
      'deaths', jsonb_build_array(
        jsonb_build_object('monster','goblin','recovery_ms',120000,'deaths_today',7),
        jsonb_build_object('monster','goblin','recovery_ms',240000,'deaths_today',8)),
      'journal', jsonb_build_object('kind','combat','intent','accrue',
        'meta', jsonb_build_object('src','tick','ms',90000,'ticks',37,'kills',31,
                                   'capped',false,'ate',8)));
    insert into public.hr_tick_shadow
      (user_id, slot, channel, holder, window_from, window_to, version, intent_id, delta)
    values (v_u, 0, 'combat', 'selfcheck', v_from, v_to, 1,
            '00000000-0000-4000-8000-0000000000c4', v_d);

    select would_kills, would_ate, would_deaths, would_recovering_until,
           would_hp, would_consec_falls, would_xp, would_items
      into v_k, v_a, v_dd, v_ru, v_hp, v_cf, v_xp, v_it
      from public.hr_tick_shadow
     where user_id = v_u and intent_id = '00000000-0000-4000-8000-0000000000c4';

    if v_k <> 31 then raise exception 'c4: would_kills = %, expected 31', v_k; end if;
    if v_a <> 8  then raise exception 'c4b: would_ate = %, expected 8 — this is the auto-eat parity number', v_a; end if;
    if v_dd <> 2 then raise exception 'c4c: would_deaths = %, expected 2', v_dd; end if;
    if v_ru is distinct from '2026-09-22T20:14:00.000000+00:00' then
      raise exception 'c4d: would_recovering_until = %, expected the engine''s own string', v_ru;
    end if;
    if v_hp <> 41 then raise exception 'c4e: would_hp = %, expected 41', v_hp; end if;
    if v_cf <> 2  then raise exception 'c4f: would_consec_falls = %, expected 2', v_cf; end if;
    if v_xp <> jsonb_build_object('attack', 4120, 'hitpoints', 1030) then
      raise exception 'c4g: would_xp = %, expected the delta''s own xp map', v_xp;
    end if;
    -- ★ SIGNED. The food debit must survive as a NEGATIVE, because the whole
    --   point of the column is to show a meal that was eaten and paid for.
    if (v_it ->> 'cooked_trout')::bigint <> -8 then
      raise exception 'c4h: would_items lost the signed food debit (%)', v_it;
    end if;
    -- ── c4i: AND THE THREE GATHER-SHAPED COLUMNS ARE NOT GENERATED, which is
    --         the argument for the eight above. `would_gold`, `would_qty` and
    --         `would_ticks` are computed in hr_tick_settle's own INSERT list,
    --         so a row that reaches this table by any other route carries their
    --         DEFAULT 0 while the delta beside it says 872. That is not a
    --         defect in the fence — it is the cost of a hand-written list, and
    --         it is exactly the drift eight more entries on it would have
    --         doubled. Asserted, so the asymmetry is a measured fact a reviewer
    --         can weigh rather than a claim in this file's header.
    if (select would_gold from public.hr_tick_shadow
         where user_id = v_u and intent_id = '00000000-0000-4000-8000-0000000000c4') <> 0 then
      raise exception 'c4i: would_gold is populated on a directly-inserted row — it is no '
                      'longer hr_tick_settle''s INSERT list that fills it, and this file''s '
                      'reason for making the combat columns GENERATED has changed';
    end if;
    if (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'hr_tick_shadow'
           and column_name in ('would_gold','would_qty','would_ticks')
           and is_generated = 'ALWAYS') <> 0 then
      raise exception 'c4j: a gather-shaped would_* column became GENERATED — if that is '
                      'deliberate, hr_tick_settle''s INSERT list must drop it in the same file';
    end if;

    -- ── c5: NO THROW PATH. A malformed or absent term must produce a 0 or a
    --        NULL, never an error — a generated expression that raised would
    --        fail the SETTLE, which is a tick that stops on one bad row.
    insert into public.hr_tick_shadow
      (user_id, slot, channel, holder, window_from, window_to, version, intent_id, delta)
    values (v_u, 0, 'combat', 'selfcheck', v_from, v_to, 1,
            '00000000-0000-4000-8000-0000000000c5',
            jsonb_build_object(
              'journal', jsonb_build_object('meta',
                jsonb_build_object('kills', 'not-a-number', 'ate', jsonb_build_array(1))),
              'xp', 'not-an-object',
              'items', 7,
              'deaths', jsonb_build_object('not','an-array'),
              'hp', 'x',
              'consec_falls', null));
    select would_kills, would_ate, would_deaths, would_hp, would_consec_falls, would_xp, would_items
      into v_k, v_a, v_dd, v_hp, v_cf, v_xp, v_it
      from public.hr_tick_shadow
     where user_id = v_u and intent_id = '00000000-0000-4000-8000-0000000000c5';
    if v_k <> 0 or v_a <> 0 or v_dd <> 0 then
      raise exception 'c5: a malformed delta did not degrade to zero (kills=%, ate=%, deaths=%)', v_k, v_a, v_dd;
    end if;
    if v_hp is not null or v_cf is not null then
      raise exception 'c5b: a malformed hp/consec_falls did not degrade to NULL (%, %)', v_hp, v_cf;
    end if;
    if v_xp <> '{}'::jsonb or v_it <> '{}'::jsonb then
      raise exception 'c5c: a malformed xp/items did not degrade to an empty object (%, %)', v_xp, v_it;
    end if;

    -- ── c6: THE COLUMNS ARE GENERATED, NOT WRITABLE. A caller that could
    --        write one could make the parity read say anything, which is the
    --        one property this journal has to have.
    begin
      update public.hr_tick_shadow set would_kills = 99999
       where user_id = v_u and intent_id = '00000000-0000-4000-8000-0000000000c4';
      raise exception 'c6: would_kills is writable — a shadow row could be made to lie';
    exception when others then
      if sqlerrm = 'c6: would_kills is writable — a shadow row could be made to lie' then raise; end if;
    end;
    select count(*) into v_n from information_schema.columns
     where table_schema = 'public' and table_name = 'hr_tick_shadow'
       and column_name in ('would_kills','would_ate','would_xp','would_items',
                           'would_deaths','would_recovering_until','would_hp','would_consec_falls')
       and is_generated = 'ALWAYS';
    if v_n <> 8 then
      raise exception 'c6b: % of the 8 combat columns are GENERATED ALWAYS', v_n;
    end if;

    -- ── c7: THE JOURNAL IS STILL UNREACHABLE BY EVERY CLIENT AND ENGINE ROLE.
    --        Adding columns must not add a grant, and RLS must still be forced.
    if exists (select 1 from information_schema.role_table_grants
                where table_schema = 'public' and table_name = 'hr_tick_shadow'
                  and grantee in ('public','anon','authenticated','service_role','hr_engine','hr_tick')) then
      raise exception 'c7: hr_tick_shadow grew a grant for a client or engine role';
    end if;
    if not (select relrowsecurity and relforcerowsecurity
              from pg_class where oid = 'public.hr_tick_shadow'::regclass) then
      raise exception 'c7b: RLS is not enabled AND forced on hr_tick_shadow';
    end if;
    if exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = 'hr_tick_shadow') then
      raise exception 'c7c: hr_tick_shadow grew a policy — it must have none';
    end if;

    -- ── c8: THE REPLAY DEFENCE SURVIVES THE ALTER. A shadow run that
    --        double-counted would make the parity number it exists to produce
    --        a lie, and the unique index is the whole of that defence.
    insert into public.hr_tick_shadow
      (user_id, slot, channel, holder, window_from, window_to, version, intent_id, delta)
    values (v_u, 0, 'combat', 'selfcheck', v_from, v_to, 1,
            '00000000-0000-4000-8000-0000000000c4', v_d)
    on conflict (user_id, slot, intent_id) do nothing;
    select count(*) into v_n from public.hr_tick_shadow where user_id = v_u;
    if v_n <> 2 then
      raise exception 'c8: a replayed shadow intent wrote a row (% rows for the probe)', v_n;
    end if;

    raise exception 'HR922_ROLLBACK_OK';
  exception
    when others then
      if sqlerrm <> 'HR922_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'world-tick-combat-channel self-check PASSED (c1-c8); probe rows rolled back';
end $$;
