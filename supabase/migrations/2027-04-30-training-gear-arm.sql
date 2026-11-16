-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-30-training-gear-arm.sql — THE TRAINING ITEMS ON FOR EVERYONE: the server switch `training_gear` moves from off to everyone
--   (lane/c-training-gear-arm, backend-architect, 2026-11-16; the designer's career run, lane/d-training-career-run c6e8b66e6: 31 careers,
--   6,685 training hours on the real engine, "switch ON as is, no number change").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §2. MONEY SURFACE OPENED (a gold sink and a skill-XP rate become reachable): ON THE EA SECURITY LIST with its parent,
-- 2027-04-23-training-gear.sql, whose contract, concurrency and exploit notes are unchanged by this file.
-- ORDER: after 2027-04-23-training-gear.sql (which seeds the row off, `on conflict do nothing`, so its re-apply never reverts this flip).
-- EDGE: none (the engine reads train_boost_ms from hr_hunt_member_read, which already asks the switch). CLIENT: none (the Training window
--   already reads the `training` section's shop.on and offers; the `features` section lists the switch from the next envelope).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- ONE ROW: hr_feature_switches.training_gear: scope off -> everyone, accounts '{}', updated_at now(). The house pattern for moving a switch
--   (2027-03-21-feature-switches.sql "HOW A SWITCH MOVES"). No table, function, grant, policy, catalogue row or number moves: the rate
--   (30,000 skill XP an hour, 200% while an item's hours last), the prices (250,000 / 450,000 gold), the day's clamp (10 an account) and
--   the Level gate stay the catalogue's (src/data/training.js, 2027-04-23-training-gear-hunt-sessions-catalogue.generated.sql).
-- FROM THE NEXT CALL, for every account: hr_training_gear_buy / _open / _switch stop refusing feature_off; the `training` section's
--   shop.on is true (its offers were always sent); hr_training_gear_budget answers the hero's bank plus its sealed bag hours, so a training
--   window may claim that item time at 200% (re-proved by hr_training_window against the server's bank, exactly as before).
--
-- ── CONCURRENCY AND IDEMPOTENCY ───────────────────────────────────────────────
-- One UPDATE on one primary key. A verb or settle in flight reads the switch once per call (hr_feature_on, STABLE): it sees off or on,
--   never half. The UPDATE matches only a row not already at everyone / '{}', so a second apply writes nothing (updated_at kept): the
--   replay's second apply is byte-identical. §1 compares every OTHER switch row before and after in the same block and refuses if one moved.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- The three client verbs of 2027-04-23-training-gear.sql become reachable past their feature_off check. Their own checks (catalogue price,
--   quote_changed, the per-account day clamp from the append-only ledger, the hero's lock, the idempotency key, bound rows unsold) and the
--   settle's exact time bound are unchanged and were proved by that file's §6 and tests/training-gear-db.mjs with the switch on.
--
-- ── COST (100x players) ──────────────────────────────────────────────────────
-- No row is added. What the parent's COST note priced for the switch on now runs: per envelope, the `training` section's day count (one
--   index range read of the account's gold rows today); per training settle, the budget read and one bank row update while boosted.
--
-- REVERSIBILITY: a later dated file sets the scope back to 'off' (this shape). Held items and banked hours stay where they are, unspent:
-- with the switch off the verbs refuse feature_off again and every training window pays the plain rate. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_feature_switches') is null or to_regprocedure('public.hr_feature_on(text,uuid)') is null
     or to_regprocedure('public.hr_features_view(uuid,integer)') is null then
    raise exception 'PRECONDITION: the feature switches (2027-03-21-feature-switches.sql) first'; end if;
  if not exists (select 1 from public.hr_feature_switches where switch_id = 'training_gear') then
    raise exception 'PRECONDITION: no `training_gear` switch row: apply 2027-04-23-training-gear.sql first'; end if;
  if to_regprocedure('public.hr_training_gear_buy(integer,text,bigint,uuid)') is null
     or to_regprocedure('public.hr_training_gear_open(integer,text,uuid)') is null
     or to_regprocedure('public.hr_training_gear_switch(integer,text,boolean,uuid)') is null
     or to_regprocedure('public.hr_training_gear_budget(uuid,integer,text)') is null
     or to_regprocedure('public.hr_training_section(uuid,integer)') is null then
    raise exception 'PRECONDITION: the training items (2027-04-23-training-gear.sql) are not installed'; end if;
end $mig$;

-- ── §1 THE FLIP (one row; every other switch row compared before and after) ─────
do $mig$
declare v_before text; v_after text; v_n int;
begin
  select md5(coalesce(string_agg(concat_ws('|', f.switch_id, f.scope, f.accounts::text, f.note, f.updated_at::text), ',' order by f.switch_id), ''))
    into v_before from public.hr_feature_switches f where f.switch_id <> 'training_gear';
  update public.hr_feature_switches set scope = 'everyone', accounts = '{}', updated_at = now()
   where switch_id = 'training_gear' and (scope <> 'everyone' or cardinality(accounts) <> 0);
  get diagnostics v_n = row_count;
  select md5(coalesce(string_agg(concat_ws('|', f.switch_id, f.scope, f.accounts::text, f.note, f.updated_at::text), ',' order by f.switch_id), ''))
    into v_after from public.hr_feature_switches f where f.switch_id <> 'training_gear';
  if v_after is distinct from v_before then raise exception 'training-gear-arm §1: another switch row moved'; end if;
  raise notice 'training-gear-arm §1: % row moved (0 on a second apply)', v_n;
end $mig$;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, read-only ────────────────────────
-- (a) the row: everyone, no account list
-- (b) on for any account, a stranger on no list included; a null account still reads off (the fail-safe read is untouched)
-- (c) the stranger's `features` section names training_gear and its `training` section's shop is on, with the Arms Master's offers
-- (d) nothing else: no client or service_role privilege on the table, no policy on it; the three verbs still reach authenticated only;
--     the grant hygiene baseline holds
do $chk$
declare
  c_stranger constant uuid := '000000c0-0000-4000-a000-00007a1e0a01';   -- never inserted anywhere: `everyone` asks no list
  v_scope text; v_accounts uuid[]; v_sec jsonb; v_role text; v_sig text;
begin
  -- (a)
  select scope, accounts into v_scope, v_accounts from public.hr_feature_switches where switch_id = 'training_gear';
  if v_scope is distinct from 'everyone' or cardinality(v_accounts) <> 0 then
    raise exception 'training-gear-arm §2(a): the switch reads % %', v_scope, v_accounts; end if;
  -- (b)
  if not public.hr_feature_on('training_gear', c_stranger) then raise exception 'training-gear-arm §2(b): off for a stranger'; end if;
  if public.hr_feature_on('training_gear', null) then raise exception 'training-gear-arm §2(b): on for a null account'; end if;
  -- (c)
  if not (public.hr_features_view(c_stranger, 0) ? 'training_gear') then
    raise exception 'training-gear-arm §2(c): the features section reads %', public.hr_features_view(c_stranger, 0); end if;
  v_sec := public.hr_training_section(c_stranger, 0);
  if v_sec is null or (v_sec->'shop'->>'on')::boolean is not true or jsonb_array_length(coalesce(v_sec->'offers', '[]'::jsonb)) = 0 then
    raise exception 'training-gear-arm §2(c): the training section''s shop reads % with % offers', v_sec->'shop', jsonb_array_length(coalesce(v_sec->'offers', '[]'::jsonb)); end if;
  -- (d)
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'public.hr_feature_switches', 'select,insert,update,delete,truncate,references,trigger') then
      raise exception 'training-gear-arm §2(d): % holds a privilege on hr_feature_switches', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_feature_switches') then
    raise exception 'training-gear-arm §2(d): hr_feature_switches carries a policy'; end if;
  foreach v_sig in array array['public.hr_training_gear_buy(integer,text,bigint,uuid)', 'public.hr_training_gear_open(integer,text,uuid)',
                               'public.hr_training_gear_switch(integer,text,boolean,uuid)'] loop
    if has_function_privilege('anon', v_sig::regprocedure, 'execute') or not has_function_privilege('authenticated', v_sig::regprocedure, 'execute') then
      raise exception 'training-gear-arm §2(d): % is not authenticated-only', v_sig; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'training-gear-arm §2 OK: training_gear on for everyone, the section''s shop open, nothing else moved';
end $chk$;
