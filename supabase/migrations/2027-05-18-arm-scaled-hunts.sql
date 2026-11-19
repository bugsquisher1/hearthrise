-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-18-arm-scaled-hunts.sql — THE SCALED HUNTS ON FOR EVERYONE: the server switch `scaled_hunts` moves to everyone
--   (lane/c-arm-switches, systems-engineer, 2026-11-18; Tyler approved every feature built but OFF, master backlog 2026-11-18 item 4; the
--   11-18 lining ruling relies on them: "we already have a way to raise old spawns up"; split from 2027-05-14-arm-switches.sql by the
--   Coordinator the same day).
--
-- STATUS: STAGED, NOT APPLIED, AND HELD. Apply LAST, only once all of these are applied and live:
--   (1) LOOT SCALES (Tyler 2026-11-07, binding: "difficulty, XP and loot scale"; the designer's drops multiple, src/data/scaled-hunts.js
--       lootPmFor): 2027-05-17-scaled-loot-scaled-hunts-catalogue.generated.sql (hr_scaled_kill_bounds.loot_pm) and 2027-05-17-scaled-loot.sql
--       (the item bound at the rolls), AND the hr-accrue that rolls a scaled row's drops at its multiple (src/core/drops.js rollsOf) deployed.
--   (2) A SCALED RUN SETS NO BEST: 2027-05-17-scaled-best.sql.
--   §0 below refuses without the three server pieces; the edge deploy is the Coordinator's to order before this apply.
-- The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on its passing §2. MONEY
-- SURFACE OPENED (a gold purchase): ON THE EA SECURITY LIST with 2027-03-21-scaled-hunts.sql and 2027-04-19-key-under-lock.sql, whose
-- contracts, concurrency and exploit notes are unchanged by this file.
-- ORDER: LAST, after 2027-05-17-scaled-best.sql, 2027-05-17-scaled-loot-scaled-hunts-catalogue.generated.sql and 2027-05-17-scaled-loot.sql.
--   2027-03-21-scaled-hunts.sql seeds the row OFF with
--   `on conflict do nothing`, so a re-apply never reverts this flip.
-- EDGE: none in this file (the scaled-drops hr-accrue deploys before it, (1) above). CLIENT: none (a ground's page shows its Scaled hunt
--   section, the Hunts list its "Scalable" tag and the hunt bar "(Scaled: Level N)" from the `scaled_hunts` section's next envelope).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- ONE ROW: hr_feature_switches.scaled_hunts: scope -> everyone, accounts '{}', updated_at now() (the house pattern, 2027-05-03-tower-arm.sql).
--   FROM THE NEXT CALL, for every account: hr_scaled_hunt_buy and hr_scaled_hunt_switch stop refusing feature_off; the `scaled_hunts`
--   section stops answering null; hr_scaled_hunt_of reads a leader's banked hours.
--
-- ── CONCURRENCY AND IDEMPOTENCY ───────────────────────────────────────────────
-- One UPDATE on one primary key, read once per call by every verb and settle (hr_feature_on, STABLE). It matches only a row not already
--   at everyone / '{}', so a second apply writes nothing (updated_at kept). §1 compares every OTHER switch row before and after.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- The two verbs become reachable past feature_off for every signed-in account. Their own checks (the catalogue price at the server's
--   Level under the hero's lock, quote_changed, the bank and day clamps from the append-only ledger, the key read under the lock, hr_apply's
--   purse) and the settle's re-proof of every scale claim (scale_moved, scale_over, the scaled roster's own value bound) are unchanged and
--   proved with the switch on by 2027-03-21-scaled-hunts.sql §8, 2027-04-19-key-under-lock.sql §3 and tests/scaled-hunts-server.mjs.
--
-- ── COST (100x players) ──────────────────────────────────────────────────────
-- No row is added by this file. Per envelope, the `scaled_hunts` section (the rule row, the hero's Level, <= 10 PK rows); per settle read,
--   one PK read of the leader's bank; a purchase is ONE ledger row.
--
-- REVERSIBILITY: a later dated file sets the scope back to 'off'. Banked hours and purchases stay where they are: the verbs refuse
-- feature_off again, the section reads null and a leader's hunt plays the ground's own rows, spending nothing. No begin/commit (§2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_feature_switches') is null or to_regprocedure('public.hr_feature_on(text,uuid)') is null then
    raise exception 'PRECONDITION: the feature switches (2027-03-21-feature-switches.sql) first'; end if;
  if not exists (select 1 from public.hr_feature_switches where switch_id = 'scaled_hunts') then
    raise exception 'PRECONDITION: no `scaled_hunts` switch row: apply 2027-03-21-scaled-hunts.sql first'; end if;
  if to_regprocedure('public.hr_scaled_hunt_buy(integer,text,integer,bigint,uuid)') is null
     or to_regprocedure('public.hr_scaled_hunt_switch(integer,text,boolean,uuid)') is null
     or to_regprocedure('public.hr_scaled_hunts_view(uuid,integer)') is null
     or not exists (select 1 from public.hr_scaled_hunt_rule where id) or not exists (select 1 from public.hr_scaled_grounds) then
    raise exception 'PRECONDITION: the scaled hunts (2027-03-21-scaled-hunts.sql and a scaled-hunts catalogue) are not installed'; end if;
  if strpos(pg_get_functiondef('public.hr_hunt_best_fold(uuid)'::regprocedure), 'SCALED-BEST (2027-05-17-scaled-best.sql)') = 0 then
    raise exception 'PRECONDITION: a scaled run must set no best first: apply 2027-05-17-scaled-best.sql'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_scaled_kill_bounds' and column_name = 'loot_pm')
     -- the body's source text (pg_proc.prosrc): a READ, so tests/alpha-server.mjs staleAnchors never takes this file for one of the member's authors
     or strpos((select p.prosrc from pg_proc p where p.oid = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure),
               'SCALED-LOOT (2027-05-17-scaled-loot.sql)') = 0 then
    raise exception 'PRECONDITION: loot must scale first: apply 2027-05-17-scaled-loot-scaled-hunts-catalogue.generated.sql and 2027-05-17-scaled-loot.sql'; end if;
end $mig$;

-- ── §1 THE FLIP (one row; every other switch row compared before and after) ─────
do $mig$
declare v_before text; v_after text; v_n int;
begin
  select md5(coalesce(string_agg(concat_ws('|', f.switch_id, f.scope, f.accounts::text, f.note, f.updated_at::text), ',' order by f.switch_id), ''))
    into v_before from public.hr_feature_switches f where f.switch_id <> 'scaled_hunts';
  update public.hr_feature_switches set scope = 'everyone', accounts = '{}', updated_at = now()
   where switch_id = 'scaled_hunts' and (scope <> 'everyone' or cardinality(accounts) <> 0);
  get diagnostics v_n = row_count;
  select md5(coalesce(string_agg(concat_ws('|', f.switch_id, f.scope, f.accounts::text, f.note, f.updated_at::text), ',' order by f.switch_id), ''))
    into v_after from public.hr_feature_switches f where f.switch_id <> 'scaled_hunts';
  if v_after is distinct from v_before then raise exception 'arm-scaled-hunts §1: another switch row moved'; end if;
  raise notice 'arm-scaled-hunts §1: % row moved (0 on a second apply)', v_n;
end $mig$;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, the probe hero rolled back ─────────
-- (a) the row: everyone, no account list; on for a stranger on no list, off for a null account; the stranger's `features` names it
-- (b) A STRANGER'S HERO (the probe: Level 20, a purse, allowlisted only because the game is CLOSED and hr_rpc_gate reads the allowlist; no
--     switch names it): its `scaled_hunts` section is not null and prices the first ground it outgrew at the catalogue's price; ONE
--     hr_scaled_hunt_buy of the slider's least hours sells (ok, the purse down by exactly that price, one shop ledger row, the bank holding
--     the hours); the section then reads them banked and on
-- (c) nothing else: no client or service_role privilege on the table, no policy on it; the two verbs still reach authenticated only; the
--     grant hygiene baseline holds
do $chk$
declare
  c_stranger constant uuid := '000000c0-0000-4000-a000-0000a2e50b01';   -- never inserted anywhere: `everyone` asks no list
  c_u        constant uuid := '000000c0-0000-4000-a000-0000a2e50b02';   -- the probe hero, rolled back
  c_idem     constant uuid := '000000c0-0000-4000-a000-0000a2e50b03';
  v jsonb; s jsonb; v_role text; v_sig text; v_g text; v_p bigint; v_h int; v_scope text; v_accounts uuid[];
begin
  -- (a)
  select scope, accounts into v_scope, v_accounts from public.hr_feature_switches where switch_id = 'scaled_hunts';
  if v_scope is distinct from 'everyone' or cardinality(v_accounts) <> 0 then raise exception 'arm-scaled-hunts §2(a): the switch reads % %', v_scope, v_accounts; end if;
  if not public.hr_feature_on('scaled_hunts', c_stranger) then raise exception 'arm-scaled-hunts §2(a): off for a stranger'; end if;
  if public.hr_feature_on('scaled_hunts', null) then raise exception 'arm-scaled-hunts §2(a): on for a null account'; end if;
  if not (public.hr_features_view(c_stranger, 0) ? 'scaled_hunts') then
    raise exception 'arm-scaled-hunts §2(a): the features section reads %', public.hr_features_view(c_stranger, 0); end if;
  -- (b)
  begin
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (c_u, 'Probe Scaled') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'arm-scaled-hunts §2 probe (the game is closed)') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'arm-scaled-hunts §2(b)-harness: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null, presence_quiet = true, level_xp = public.hr_char_xp_for_level(20)
     where user_id = c_u and slot = 0;
    insert into public.account_wallet as w (user_id, gold) values (c_u, 1000000)
      on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now();
    s := public.hr_scaled_hunts_view(c_u, 0);
    if s is null then raise exception 'arm-scaled-hunts §2(b): a stranger''s hero reads no scaled_hunts section'; end if;
    select g.key, (g.value->>'price')::bigint into v_g, v_p from jsonb_each(s->'grounds') g where g.value->>'price' is not null order by g.key limit 1;
    if v_g is null then raise exception 'arm-scaled-hunts §2(b): no ground scales for a Level 20 hero: %', s; end if;
    if v_p <> (select r.price_per_level::bigint from public.hr_scaled_hunt_rule r where r.id) * public.hr_scaled_level(v_g, 20) then
      raise exception 'arm-scaled-hunts §2(b): % is priced % an hour, not the catalogue''s', v_g, v_p; end if;
    select r.min_hours into v_h from public.hr_scaled_hunt_rule r where r.id;
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_scaled_hunt_buy(0, v_g, v_h, v_p * v_h, c_idem);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_purse_of(c_u) <> 1000000 - v_p * v_h
       or (select h.banked_ms from public.player_scaled_hours h where h.user_id = c_u and h.slot = 0 and h.hunt_id = v_g) <> v_h * 3600000::bigint
       or (select count(*) from public.player_ledger l where l.user_id = c_u and l.intent like 'scaled\_hunt\_buy:%') <> 1 then
      raise exception 'arm-scaled-hunts §2(b): a stranger''s purchase of % h on % answered % (purse %)', v_h, v_g, v, public.hr_purse_of(c_u); end if;
    s := public.hr_scaled_hunts_view(c_u, 0)->'grounds'->v_g;
    if (s->>'banked_ms')::bigint <> v_h * 3600000::bigint or (s->>'on')::boolean is not true then
      raise exception 'arm-scaled-hunts §2(b): after the purchase the section reads %', s; end if;
    raise exception using errcode = 'HRA18', message = 'arm-scaled-hunts §2 complete - rolling back';
  exception when sqlstate 'HRA18' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.player_state where user_id = c_u) or exists (select 1 from public.profiles where id = c_u)
     or exists (select 1 from auth.users where id = c_u) or exists (select 1 from public.hr_access_allowlist where user_id = c_u)
     or exists (select 1 from public.player_ledger where user_id = c_u) or exists (select 1 from public.player_scaled_hours where user_id = c_u)
     or exists (select 1 from public.account_wallet where user_id = c_u) then
    raise exception 'arm-scaled-hunts §2(b): the probe leaked a row'; end if;
  -- (c)
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'public.hr_feature_switches', 'select,insert,update,delete,truncate,references,trigger') then
      raise exception 'arm-scaled-hunts §2(c): % holds a privilege on hr_feature_switches', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_feature_switches') then
    raise exception 'arm-scaled-hunts §2(c): hr_feature_switches carries a policy'; end if;
  foreach v_sig in array array['public.hr_scaled_hunt_buy(integer,text,integer,bigint,uuid)', 'public.hr_scaled_hunt_switch(integer,text,boolean,uuid)'] loop
    if has_function_privilege('anon', v_sig::regprocedure, 'execute') or not has_function_privilege('authenticated', v_sig::regprocedure, 'execute') then
      raise exception 'arm-scaled-hunts §2(c): % is not authenticated-only', v_sig; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'arm-scaled-hunts §2 OK: scaled_hunts on for everyone, a stranger''s hero buys scaled hours, nothing else moved';
end $chk$;
