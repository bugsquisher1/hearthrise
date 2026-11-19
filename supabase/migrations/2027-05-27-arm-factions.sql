-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-27-arm-factions.sql — THE FACTIONS ON FOR EVERYONE: the server switch `factions` moves to everyone
--   (lane/b-factions-open, systems-engineer, 2026-11-19; the First Flame and the Last Ember open once a live ground pays standing).
--
-- STATUS: STAGED, NOT APPLIED, HELD until the Morrow Hills open (the faction QA 2026-11-19, finding 1: no live ground pays standing; the
-- Morrow Hills' three paying grounds are all staged at Level ~112+). Not with v0.2.142: the Coordinator applies (tools/apply-migration.mjs,
-- one file, never inside begin/commit) in the patch that opens the first Morrow pair. Pre-EA: applies on its passing §2. A COSMETIC SURFACE OTHERS SEE OPENED (a side's standing, the pieces it buys and the looks they
-- dress, worn in town and in parties): ON THE EA SECURITY LIST with its parents, 2027-04-22-faction-standing.sql,
-- 2027-04-23-faction-section.sql and 2027-05-19-faction-outfit-path.sql, whose contracts, concurrency and exploit notes are unchanged by
-- this file. No gold, item, XP or power moves through any faction verb.
-- ORDER: LAST. After every faction file (2027-04-22-faction-catalogue.generated.sql, 2027-04-22-faction-standing.sql,
--   2027-04-23-faction-section.sql, 2027-05-19-faction-outfit-path.sql, 2027-05-19-faction-outfit-path-outfits-catalogue.generated.sql,
--   2027-05-28-faction-swap-cancel.sql).
--   2027-04-23-faction-section.sql seeds the row off with `on conflict do nothing`, so its re-apply never reverts this flip, and its §4
--   (like 2027-05-19-faction-outfit-path.sql's) puts the switch back as its probe found it.
-- EDGE: none moves with this file, and none must be live first: the engine reads no switch for the factions (the settle's standing
--   credit moves only for a member, and only the verbs make one).
-- CLIENT: none needed (the Faction tab, the join prompt and the Outfit tab's faction cards read the `factions` and `features`
--   sections; each appears from the next envelope). v0.2.142 loads the faction looks' art only when a hero in view wears one.
-- SUPERSEDES 2027-05-26-faction-switch-qa.sql (excluded from the replay): a production row at `accounts` (the QA account alone) moves to
--   everyone with its account list emptied.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- ONE ROW: hr_feature_switches.factions: scope -> everyone, accounts '{}', updated_at now(). The house pattern for moving a switch
--   (2027-03-21-feature-switches.sql "HOW A SWITCH MOVES"; 2027-05-03-tower-arm.sql). No table, function, grant, policy, catalogue
--   row or number moves.
-- FROM THE NEXT CALL, for every account: hr_faction_join, hr_faction_swap_start, hr_faction_swap_finish and hr_faction_outfit_claim stop
--   refusing feature_off (hr_faction_locked's door); the `factions` section stops answering NULL for a hero, and the `features` section
--   names factions.
--
-- ── CONCURRENCY AND IDEMPOTENCY ───────────────────────────────────────────────
-- One UPDATE on one primary key. A verb, settle or envelope in flight reads the switch once per call (hr_feature_on, STABLE): off or on,
--   never half. The UPDATE matches only a row not already at everyone / '{}', so a second apply writes nothing (updated_at kept): the second
--   apply is byte-identical. §1 compares every OTHER switch row before and after in the same block and refuses if one moved.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- The four client verbs above become reachable past their feature_off check for every signed-in account. Their own checks (Krell first
--   from the hero's own server-counted kills, one side a hero, the week's cooldown and the swap's hunting time on the server's clock,
--   standing credited only by the settle on the side's own grounds and clamped by the day row, a piece claimed once from the standing its
--   row names, every verb under the hero's lock with its key replayed, hr_faction_ledger append-only) are unchanged and were proved with
--   the switch on by those files' self-checks and tests/faction-standing-db.mjs and tests/faction-outfit-db.mjs.
--
-- ── COST (100x players) ──────────────────────────────────────────────────────
-- No row is added by this file. What the parents priced for the switch on now runs for every account: per envelope, the `factions`
--   section (hr_faction_view: a rule read, a member read, the Krell count, two small aggregates over at most 2 standing rows, a day row and
--   the pieces, plus one rule read); per join, swap or claim, one member, claim or standing row and one journal row.
--
-- REVERSIBILITY: a later dated file sets the scope back to 'off' (this shape). Members, standing, claims and the looks they own stay
-- where they are: with the switch off the verbs refuse feature_off again and the section reads NULL; a look already worn stays worn (the
-- switch closes doors, never a look a hero holds). No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_feature_switches') is null or to_regprocedure('public.hr_feature_on(text,uuid)') is null
     or to_regprocedure('public.hr_features_view(uuid,integer)') is null then
    raise exception 'PRECONDITION: the feature switches (2027-03-21-feature-switches.sql) first'; end if;
  if not exists (select 1 from public.hr_feature_switches where switch_id = 'factions') then
    raise exception 'PRECONDITION: no `factions` switch row: apply 2027-04-23-faction-section.sql first'; end if;
  if to_regprocedure('public.hr_faction_join(integer,text,uuid)') is null
     or to_regprocedure('public.hr_faction_swap_start(integer,text,uuid)') is null
     or to_regprocedure('public.hr_faction_swap_finish(integer,uuid)') is null
     or to_regprocedure('public.hr_faction_outfit_claim(integer,text,uuid)') is null
     or to_regprocedure('public.hr_faction_section(uuid,integer)') is null
     or strpos(pg_get_functiondef('public.hr_faction_locked(text,uuid,integer,uuid,text)'::regprocedure), 'hr_feature_on(''factions'', p_uid)') = 0 then
    raise exception 'PRECONDITION: the factions (faction-standing, faction-section and its switch door) are not installed'; end if;
  if not exists (select 1 from public.hr_faction_rule where id) or (select count(*) from public.hr_factions) <> 2
     or not exists (select 1 from public.hr_faction_outfits) then
    raise exception 'PRECONDITION: the factions'' catalogues (the rule, the two sides, the pieces) are empty'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_outfits' and column_name = 'pieces') then
    raise exception 'PRECONDITION: apply 2027-05-19-faction-outfit-path.sql first (a faction look worn through the one outfit path)'; end if;
  if not exists (select 1 from public.hr_outfits where pieces is not null) then
    raise exception 'PRECONDITION: apply 2027-05-19-faction-outfit-path-outfits-catalogue.generated.sql first (the faction looks)'; end if;
end $mig$;

-- ── §1 THE FLIP (one row; every other switch row compared before and after) ─────
do $mig$
declare v_before text; v_after text; v_n int;
begin
  select md5(coalesce(string_agg(concat_ws('|', f.switch_id, f.scope, f.accounts::text, f.note, f.updated_at::text), ',' order by f.switch_id), ''))
    into v_before from public.hr_feature_switches f where f.switch_id <> 'factions';
  update public.hr_feature_switches set scope = 'everyone', accounts = '{}', updated_at = now()
   where switch_id = 'factions' and (scope <> 'everyone' or cardinality(accounts) <> 0);
  get diagnostics v_n = row_count;
  select md5(coalesce(string_agg(concat_ws('|', f.switch_id, f.scope, f.accounts::text, f.note, f.updated_at::text), ',' order by f.switch_id), ''))
    into v_after from public.hr_feature_switches f where f.switch_id <> 'factions';
  if v_after is distinct from v_before then raise exception 'arm-factions §1: another switch row moved'; end if;
  raise notice 'arm-factions §1: % row moved (0 on a second apply)', v_n;
end $mig$;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, the probe hero rolled back ─────────
-- (a) the row: everyone, no account list
-- (b) on for any account, a stranger on no list included; a null account still reads off (the fail-safe read is untouched)
-- (c) a STRANGER'S HERO (on no switch list and not on the access allowlist): its `features` section names factions, its `factions`
--     section is no longer NULL (no side yet, can't join before Krell, the rule's swap and cooldown) on the section and in the envelope;
--     admitted to the game as any player is, the door is open: a join before Krell is join_locked (not feature_off), and after a Krell kill
--     (a fixture) the join lands and the section names its side
-- (d) nothing else: no client or service_role privilege on the table, no policy on it; the four verbs still reach authenticated only and
--     the section no client role; the grant hygiene baseline holds
do $chk$
declare
  c_stranger constant uuid := '000000c0-0000-4000-a000-0000fac7a300';   -- never inserted anywhere: `everyone` asks no list
  v_u        constant uuid := '000000c0-0000-4000-a000-0000fac7a301';   -- the probe hero, rolled back
  v_scope text; v_accounts uuid[]; v jsonb; s jsonb; v_role text; v_sig text; v_side text; r public.hr_faction_rule%rowtype;
begin
  -- (a)
  select scope, accounts into v_scope, v_accounts from public.hr_feature_switches where switch_id = 'factions';
  if v_scope is distinct from 'everyone' or cardinality(v_accounts) <> 0 then
    raise exception 'arm-factions §2(a): the switch reads % %', v_scope, v_accounts; end if;
  -- (b)
  if not public.hr_feature_on('factions', c_stranger) then raise exception 'arm-factions §2(b): off for a stranger'; end if;
  if public.hr_feature_on('factions', null) then raise exception 'arm-factions §2(b): on for a null account'; end if;
  if not (public.hr_features_view(c_stranger, 0) ? 'factions') then
    raise exception 'arm-factions §2(b): the features section reads %', public.hr_features_view(c_stranger, 0); end if;
  -- (c)
  select * into r from public.hr_faction_rule where id;
  select faction_id into v_side from public.hr_factions order by ord limit 1;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Sides') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'arm-factions §2 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'arm-factions §2(c): hr_create_character refused: %', v; end if;
    delete from public.hr_access_allowlist where user_id = v_u;   -- a stranger: on no list at all
    if not (public.hr_features_view(v_u, 0) ? 'factions') then
      raise exception 'arm-factions §2(c): the hero''s features section reads %', public.hr_features_view(v_u, 0); end if;
    s := public.hr_faction_section(v_u, 0);
    if s is null or s->'faction' <> 'null'::jsonb or (s->>'can_join')::boolean is not false
       or (s->>'swap_need_ms')::bigint is distinct from r.swap_ms or (s->>'cooldown_ms')::bigint is distinct from r.cooldown_ms then
      raise exception 'arm-factions §2(c): a stranger''s factions section reads %', s; end if;
    if public.hr_state_of(v_u, 0)->'factions' is null or public.hr_state_of(v_u, 0)->'factions' = 'null'::jsonb then
      raise exception 'arm-factions §2(c): a stranger''s envelope carries no factions'; end if;
    -- admitted, as every player is once the game is open (the allowlist is the closed game's door, not the switch's)
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'arm-factions §2 probe') on conflict (user_id) do nothing;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_join(0, v_side, gen_random_uuid());
    if v->>'error' is distinct from 'join_locked' then raise exception 'arm-factions §2(c): a join before Krell answered %', v; end if;
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at)
      values (v_u, 0, 'stat', 'ev:kill_monster:' || r.join_monster, '', 1, now());
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_join(0, v_side, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'arm-factions §2(c): a join past Krell answered %', v; end if;
    s := public.hr_state_of(v_u, 0)->'factions';
    if s is null or s->>'faction' is distinct from v_side or (s->>'can_join')::boolean is not false then
      raise exception 'arm-factions §2(c): after the join the envelope''s factions reads %', s; end if;
    raise exception using errcode = 'HRF27', message = 'arm-factions §2 complete - rolling back';
  exception when sqlstate 'HRF27' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.profiles where id = v_u)
     or exists (select 1 from auth.users where id = v_u) or exists (select 1 from public.hr_access_allowlist where user_id = v_u)
     or exists (select 1 from public.hr_faction_members where user_id = v_u) or exists (select 1 from public.hr_faction_ledger where user_id = v_u)
     or (select scope from public.hr_feature_switches where switch_id = 'factions') is distinct from 'everyone' then
    raise exception 'arm-factions §2(c): the probe leaked a row'; end if;
  -- (d)
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'public.hr_feature_switches', 'select,insert,update,delete,truncate,references,trigger') then
      raise exception 'arm-factions §2(d): % holds a privilege on hr_feature_switches', v_role; end if;
    if has_function_privilege(v_role, 'public.hr_faction_section(uuid,integer)', 'execute') then
      raise exception 'arm-factions §2(d): % can execute hr_faction_section', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_feature_switches') then
    raise exception 'arm-factions §2(d): hr_feature_switches carries a policy'; end if;
  foreach v_sig in array array['public.hr_faction_join(integer,text,uuid)', 'public.hr_faction_swap_start(integer,text,uuid)',
                               'public.hr_faction_swap_finish(integer,uuid)', 'public.hr_faction_outfit_claim(integer,text,uuid)'] loop
    if has_function_privilege('anon', v_sig::regprocedure, 'execute') or not has_function_privilege('authenticated', v_sig::regprocedure, 'execute') then
      raise exception 'arm-factions §2(d): % is not authenticated-only', v_sig; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'arm-factions §2 OK: factions on for everyone, a stranger''s hero sees its section and may join past Krell, nothing else moved';
end $chk$;
