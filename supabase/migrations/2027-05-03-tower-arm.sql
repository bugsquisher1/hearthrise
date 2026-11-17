-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-03-tower-arm.sql — THE BURNING TOWER ON FOR EVERYONE: the server switch `burning_tower` moves to everyone
--   (set/v0.2.135, backend-architect, 2026-11-17; the Tower passed its QA gate on the release set and opens in v0.2.135).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §2. MONEY AND RANKED SURFACES OPENED (a climb's floors rank on the board, its landings mint keys, the Hearth Chest pays items
-- that trade, the Key Ring is sold for gold): ON THE EA SECURITY LIST with its parents, 2027-04-24-tower-climb.sql, 2027-04-27-tower-chest.sql,
-- 2027-04-28-tower-section.sql and 2027-04-30-tower-board.sql, whose contracts, concurrency and exploit notes are unchanged by this file.
-- ORDER: LAST. After every Tower file (2027-05-02-tower-items-catalogue.generated.sql .. 2027-04-30-tower-board.sql) and the four after
--   them (loot-plan-copy, house-top-unlock-offers, v0135-bench-tax-rates, v0135-temper-catalogue). 2027-04-24-tower-climb.sql seeds the row
--   off with `on conflict do nothing`, so its re-apply never reverts this flip.
-- EDGE: none moves with this file, BUT the hr-accrue engine that carries the climb (the v0.2.135 deploy) must be LIVE before it applies: an
--   older engine never meets a climb only while the switch is off (2027-04-24-tower-climb.sql's EDGE note).
-- CLIENT: none (the Havora window's Tower door, the Tower window and the bag's Key Ring already read the `tower`, `key_ring` and `features`
--   sections; each appears from the next envelope).
-- SUPERSEDES 2027-04-29-tower-switch-qa.sql (excluded from the replay): a production row at `accounts` (the QA account alone) moves to
--   everyone with its account list emptied.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- ONE ROW: hr_feature_switches.burning_tower: scope -> everyone, accounts '{}', updated_at now(). The house pattern for moving a switch
--   (2027-03-21-feature-switches.sql "HOW A SWITCH MOVES"; 2027-04-30-training-gear-arm.sql). No table, function, grant, policy, catalogue
--   row or number moves.
-- FROM THE NEXT CALL, for every account: hr_tower_start, hr_chest_open, hr_chest_stoke_default and hr_key_ring_store stop refusing
--   feature_off; the Key Ring's ownership row stops being refused (hr_key_ring_gate), so hr_unlock_buy sells key_ring.0; the `tower` and
--   `key_ring` sections stop answering NULL for a hero, and the `features` section names burning_tower.
--
-- ── CONCURRENCY AND IDEMPOTENCY ───────────────────────────────────────────────
-- One UPDATE on one primary key. A verb, settle or envelope in flight reads the switch once per call (hr_feature_on, STABLE): off or on,
--   never half. The UPDATE matches only a row not already at everyone / '{}', so a second apply writes nothing (updated_at kept): the second
--   apply is byte-identical. §1 compares every OTHER switch row before and after in the same block and refuses if one moved.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- The four client verbs above become reachable past their feature_off check for every signed-in account. Their own checks (the one door's
--   lock and key re-read, the checkpoint list from the server's record, every floor re-proved by hr_tower_check / hr_tower_write against the
--   run, the mode paying no coin, item or Bestiary count; the chest's server roll on hr_seed, the family's weekly opens, the held-key limit,
--   the stokes priced by the catalogue; the ring's price from hr_unlock_offers, the purse debit and its ledger row) are unchanged and were
--   proved with the switch on by those files' self-checks and tests/tower-climb.mjs, tests/tower-chest.mjs, tests/tower-board.mjs.
--
-- ── COST (100x players) ──────────────────────────────────────────────────────
-- No row is added by this file. What the parents priced for the switch on now runs for every account: per envelope, the `tower` section
--   (a few PK and index reads: rules, the hero's best, its open and last run, the board's place) and the `key_ring` section (one PK read and
--   the ring's rows); per climb settle, the floors' re-proof and one run row update; per landing, one key mint and its ledger row.
--
-- REVERSIBILITY: a later dated file sets the scope back to 'off' (this shape). Runs, bests, keys, rings and chest opens stay where they
-- are: with the switch off the verbs refuse feature_off again and both sections read NULL. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_feature_switches') is null or to_regprocedure('public.hr_feature_on(text,uuid)') is null
     or to_regprocedure('public.hr_features_view(uuid,integer)') is null then
    raise exception 'PRECONDITION: the feature switches (2027-03-21-feature-switches.sql) first'; end if;
  if not exists (select 1 from public.hr_feature_switches where switch_id = 'burning_tower') then
    raise exception 'PRECONDITION: no `burning_tower` switch row: apply 2027-04-24-tower-climb.sql first'; end if;
  if to_regprocedure('public.hr_tower_start(integer,integer,uuid)') is null
     or to_regprocedure('public.hr_chest_open(integer,text,text,integer,integer,uuid)') is null
     or to_regprocedure('public.hr_chest_stoke_default(integer,text,integer,uuid)') is null
     or to_regprocedure('public.hr_key_ring_store(integer,text,integer,uuid)') is null
     or to_regprocedure('public.hr_key_ring_section(uuid,integer)') is null
     or to_regprocedure('public.hr_tower_section(uuid,integer)') is null
     or to_regclass('public.hr_mode_board') is null then
    raise exception 'PRECONDITION: the Burning Tower (tower-climb, tower-chest, tower-section, tower-board) is not installed'; end if;
  if not exists (select 1 from public.hr_tower_rules where id) or not exists (select 1 from public.hr_chest_keys where key_family = 'tower') then
    raise exception 'PRECONDITION: the Tower''s catalogues (rules, chest keys) are empty'; end if;
end $mig$;

-- ── §1 THE FLIP (one row; every other switch row compared before and after) ─────
do $mig$
declare v_before text; v_after text; v_n int;
begin
  select md5(coalesce(string_agg(concat_ws('|', f.switch_id, f.scope, f.accounts::text, f.note, f.updated_at::text), ',' order by f.switch_id), ''))
    into v_before from public.hr_feature_switches f where f.switch_id <> 'burning_tower';
  update public.hr_feature_switches set scope = 'everyone', accounts = '{}', updated_at = now()
   where switch_id = 'burning_tower' and (scope <> 'everyone' or cardinality(accounts) <> 0);
  get diagnostics v_n = row_count;
  select md5(coalesce(string_agg(concat_ws('|', f.switch_id, f.scope, f.accounts::text, f.note, f.updated_at::text), ',' order by f.switch_id), ''))
    into v_after from public.hr_feature_switches f where f.switch_id <> 'burning_tower';
  if v_after is distinct from v_before then raise exception 'tower-arm §1: another switch row moved'; end if;
  raise notice 'tower-arm §1: % row moved (0 on a second apply)', v_n;
end $mig$;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, the probe hero rolled back ─────────
-- (a) the row: everyone, no account list
-- (b) on for any account, a stranger on no list included; a null account still reads off (the fail-safe read is untouched)
-- (c) a STRANGER'S HERO (on no switch list and not on the access allowlist): its `features` section names burning_tower, its `tower`
--     section is no longer NULL (the Tower's hunt, checkpoint 0 the one start) on the section and in the envelope, its `key_ring` section
--     offers the ring
-- (d) nothing else: no client or service_role privilege on the table, no policy on it; the four verbs still reach authenticated only and
--     the two sections no client role; the grant hygiene baseline holds
do $chk$
declare
  c_stranger constant uuid := '000000c0-0000-4000-a000-00007a3e0a01';   -- never inserted anywhere: `everyone` asks no list
  v_u        constant uuid := '000000c0-0000-4000-a000-00007a3e0a02';   -- the probe hero, rolled back
  v_scope text; v_accounts uuid[]; v jsonb; s jsonb; v_role text; v_sig text; v_hunt text;
begin
  -- (a)
  select scope, accounts into v_scope, v_accounts from public.hr_feature_switches where switch_id = 'burning_tower';
  if v_scope is distinct from 'everyone' or cardinality(v_accounts) <> 0 then
    raise exception 'tower-arm §2(a): the switch reads % %', v_scope, v_accounts; end if;
  -- (b)
  if not public.hr_feature_on('burning_tower', c_stranger) then raise exception 'tower-arm §2(b): off for a stranger'; end if;
  if public.hr_feature_on('burning_tower', null) then raise exception 'tower-arm §2(b): on for a null account'; end if;
  if not (public.hr_features_view(c_stranger, 0) ? 'burning_tower') then
    raise exception 'tower-arm §2(b): the features section reads %', public.hr_features_view(c_stranger, 0); end if;
  -- (c)
  select hunt_id into v_hunt from public.hr_tower_rules where id;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Arm') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'tower-arm §2 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'tower-arm §2(c): hr_create_character refused: %', v; end if;
    delete from public.hr_access_allowlist where user_id = v_u;   -- a stranger: on no list at all
    if not (public.hr_features_view(v_u, 0) ? 'burning_tower') then
      raise exception 'tower-arm §2(c): the hero''s features section reads %', public.hr_features_view(v_u, 0); end if;
    s := public.hr_tower_section(v_u, 0);
    if s is null or s->>'hunt' is distinct from v_hunt or s->'checkpoints' <> '[0]'::jsonb then
      raise exception 'tower-arm §2(c): a stranger''s tower section reads %', s; end if;
    if public.hr_state_of(v_u, 0)->'tower' is null or public.hr_state_of(v_u, 0)->'tower' = 'null'::jsonb then
      raise exception 'tower-arm §2(c): a stranger''s envelope carries no tower'; end if;
    s := public.hr_key_ring_section(v_u, 0);
    if s is null or (s->>'unlocked')::boolean is not false then
      raise exception 'tower-arm §2(c): a stranger''s key_ring section reads %', s; end if;
    raise exception using errcode = 'HRT01', message = 'tower-arm §2 complete - rolling back';
  exception when sqlstate 'HRT01' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.profiles where id = v_u)
     or exists (select 1 from auth.users where id = v_u) or exists (select 1 from public.hr_access_allowlist where user_id = v_u)
     or (select scope from public.hr_feature_switches where switch_id = 'burning_tower') is distinct from 'everyone' then
    raise exception 'tower-arm §2(c): the probe leaked a row'; end if;
  -- (d)
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'public.hr_feature_switches', 'select,insert,update,delete,truncate,references,trigger') then
      raise exception 'tower-arm §2(d): % holds a privilege on hr_feature_switches', v_role; end if;
    foreach v_sig in array array['public.hr_tower_section(uuid,integer)', 'public.hr_key_ring_section(uuid,integer)'] loop
      if has_function_privilege(v_role, v_sig::regprocedure, 'execute') then
        raise exception 'tower-arm §2(d): % can execute %', v_role, v_sig; end if;
    end loop;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_feature_switches') then
    raise exception 'tower-arm §2(d): hr_feature_switches carries a policy'; end if;
  foreach v_sig in array array['public.hr_tower_start(integer,integer,uuid)', 'public.hr_chest_open(integer,text,text,integer,integer,uuid)',
                               'public.hr_chest_stoke_default(integer,text,integer,uuid)', 'public.hr_key_ring_store(integer,text,integer,uuid)'] loop
    if has_function_privilege('anon', v_sig::regprocedure, 'execute') or not has_function_privilege('authenticated', v_sig::regprocedure, 'execute') then
      raise exception 'tower-arm §2(d): % is not authenticated-only', v_sig; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'tower-arm §2 OK: burning_tower on for everyone, a stranger''s hero sees the Tower and the Key Ring, nothing else moved';
end $chk$;
