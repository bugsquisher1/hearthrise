-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1053-recruits.sql — ONE HERO FIRST, THEN THREE RECRUITS IN ONE PRESS AT LEVEL 5 (A GRANT, ONCE AN ACCOUNT)
--   (lane/c-recruits, backend-architect, 2026-11-22; Tyler RD-Q6 a, 2026-11-22: "One hero, then three recruits in one press at Level 5,
--   near the first hero's Level"; docs/design/redesign/02-architecture.md package 8 "The first hour"; the numbers, jobs and names are
--   src/data/recruits.js through 1052-recruits-catalogue.generated.sql).
--
-- STATUS: supabase/migration-notes/1053-recruits.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1052-recruits-catalogue.generated.sql, whose tables §0 requires.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check. ON THE EA SECURITY LIST (A GRANT:
--   Level XP and the hero kit to three heroes, once an account).
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- A new account makes ONE hero and hunts within two minutes. At the first hero's Level `at_level` the company gets its recruits: one press,
--   three heroes, near that hero's Level, each in a job the company lacks. Until then the other slots are not on the first screen (the
--   client shows an empty slot only to an account with no hero, src/app/boot.js). The slots stay owned (1036): a hero made by hand in one
--   is not refused (fixtures and test accounts make them), it simply means the account has more than one hero and is not offered the press.
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- §1 public.account_kits takes grant_key 'recruits' (the press, once an account; slot = the first hero's). Written only by the press, by
--    `insert ... on conflict do nothing`: the press makes heroes exactly when that insert wrote its row.
-- §2 hr_recruit_offer(p_uid) -> jsonb | null, server-only. NULL unless the account holds EXACTLY ONE hero, has no 'recruits' mark and owns
--    at least recruit_count empty slots. Otherwise { ready, at, level, first, slots[], sets[] }:
--      ready   the first hero's Level (hr_level_of) is at least at_level
--      at      at_level (the Level the press opens at)
--      level   the Level the recruits arrive at: greatest(1, least(max_level, the first hero's Level - levels_under))
--      first   the first hero's slot
--      slots   the empty owned slots the recruits take, lowest first, recruit_count of them
--      sets    the STARTER_SETS id each wears, in slot order: hr_recruit_jobs by rank, the jobs whose role (the role of the set's worn
--              weapon, a shield arm turning a sword into a tank) the first hero's worn weapon does NOT play first
--    THE SECTION `recruits` (hr_recruits_view) is this offer for every hero of the account: what the client shows is what the press makes.
-- §3 hr_recruit_company(p_names text[] default null, p_idem uuid default null) -> jsonb. SECURITY DEFINER, authenticated (client baseline).
--    The client sends a key and, for each recruit in slot order, a name the player typed or null (the server names it). NOTHING ELSE: the
--    Level, the XP, the jobs, the slots, the kit and the colours are the server's. In order:
--      access check · not_signed_in · bad_idem · the names' shape (bad_names: more than recruit_count) and rules (bad_name + index +
--      reason, hr_validate_display_name; name_taken + index for two alike) · the replay (hr_intent_replay: a replayed key answers its
--      first receipt, with no envelope) · the budget (6 presses an hour) · THE ACCOUNT LOCK · the offer read again under it
--      (no_character with no hero; recruits_taken with more than one hero or the mark written; recruits_not_ready + at + level under
--      at_level) · then ALL OR NOTHING, in one subtransaction:
--        the mark ('recruits'), and for each recruit: hr_create_character__as(slot, set) (the slot gate, the (user, slot) lock, the
--        6/hour creation budget, the practice set of its job worn, the hero kit once a slot, its own ledger row), its name (the player's,
--        refused name_taken + index when another hero or another account's display name holds it; else the first free name of
--        hr_recruit_names in this account's order, single given names first; name_needed + index when none is free), the first hero's base
--        colours, its Level XP set to hr_char_xp_for_level(level) with the version bumped, its health set to its town max (hr_vitals_of),
--        and ONE player_ledger row (kind admin, intent recruit, meta: level, from_xp 0, to_xp, set, first, named, key).
--      Any refusal inside it unwinds every hero, name and the mark. The receipt { ok, level, heroes: [{ slot, name, set }] } is journalled
--      in player_intents under the key; the answer adds `envelope`, the first hero's hr_state_of (rule 11: its `recruits` section is now null).
-- REFUSAL CODES NEW: recruits_not_ready, recruits_taken, name_needed, bad_names (refusal-words.js). Reused: not_signed_in, bad_idem,
--   bad_name, name_taken, no_character, rate_limited, intent_mismatch.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- One press an account at a time: a transaction advisory lock on the account ('hr_recruit_company:' || uid), then the offer is read again
--   under it, so two presses (two tabs, a double click with two keys) make three heroes once: the second finds four heroes and the mark
--   (recruits_taken). The mark's primary key is the last word: two presses that somehow both passed would both insert it, and only one row
--   is written. A retried press with ITS key answers its stored receipt (player_intents) and makes nothing. A hand-made hero racing the press
--   takes the (user, slot) creation lock inside hr_create_character__as: whichever is second finds the slot taken, and a press that finds one
--   unwinds whole (recruits_taken). No read-modify-write crosses a network hop: the client sends names and a key, never a count or a Level.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- ONE new client verb, a GRANT: three heroes at most at max_level (10), once an account, written only by this press. It is bounded by:
--   the account's one-hero state (a company of 2 to 4 is never offered it), the 'recruits' mark (primary key), the hero slots the account owns
--   (four, 1036; a fifth is refused by the slot gate), max_level (a lone hero that waits to Level 60 still gets Level 10 recruits), and the
--   kits paid once a slot (account_kits 'hero:<slot>'). The client value that crosses to other players is a NAME, held to the rules every
--   hero name is (moderation, reserved words, never another account's display name, unique by canonical) or picked by the server. No gold,
--   item count or price is read from the client. A wiped account (EA) starts again at one hero, so the grant is once a life of an account.
-- COST AT 100x: one account_kits row an account (about 2,400 rows, under 0.2 MB); three ledger rows and one intents row an account, ever.
--   The section is computed with every envelope: for an account of more than one hero it is one count over its player_state rows (its
--   primary key, four rows at most); for a one-hero account a handful of primary-key reads and four tiny catalogue joins.
-- REVERSIBILITY: delete the section row, drop hr_recruit_company (and its baseline row), hr_recruits_view and hr_recruit_offer, put
--   account_kits' check back to '^(account|hero:[0-5])$' after deleting the 'recruits' rows. Heroes made stay made.
-- EDGE: none. BROWSER: src/session/recruit-sections.js (the section's reader), src/session/recruit-intents.js (the press),
--   src/shell/windows/recruits-pane.js (the press in All characters), src/shell/needs-you/recruits.js (the Needs you row),
--   src/shell/back-in-town.js (the end card's Recruit your party), src/app/slot-offer.js rowsShown (no empty slot past the first hero).
-- GUARDS: tests/recruits.mjs (the grant played on the replayed chain: one hero, Level 5, one press, four heroes, the press gone; a retried
--   press; mutants), tests/recruits-world.mjs (the same in the real game, by hand), and the §4 self-check below.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ───────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_recruit_rules') is null or to_regclass('public.hr_recruit_jobs') is null
     or to_regclass('public.hr_recruit_names') is null then
    raise exception 'PRECONDITION: the recruit catalogue is absent: apply 1052-recruits-catalogue.generated.sql first'; end if;
  if to_regclass('public.account_kits') is null or to_regclass('public.hr_state_sections') is null
     or to_regclass('public.hr_client_rpc_baseline') is null or to_regclass('public.character_names') is null
     or to_regclass('public.player_outfits') is null or to_regclass('public.player_intents') is null
     or to_regprocedure('public.hr_create_character__as(integer,text)') is null
     or to_regprocedure('public.hr_char_xp_for_level(integer)') is null
     or to_regprocedure('public.hr_vitals_of(uuid,integer)') is null
     or to_regprocedure('public.hr_level_of(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_weapon_of(uuid,integer)') is null
     or to_regprocedure('public.hr_hero_slots_of(uuid)') is null
     or to_regprocedure('public.hr_validate_display_name(text)') is null
     or to_regprocedure('public.hr_canon_display_name(text)') is null
     or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_state_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: a table or door this file reads is absent (account_kits is 1038-start-kits.sql''s)'; end if;
end $mig$;

-- ── §1 THE PRESS ONCE AN ACCOUNT ───────────────────────────────────────────
alter table public.account_kits drop constraint if exists account_kits_grant_key_check;
alter table public.account_kits add constraint account_kits_grant_key_check check (grant_key ~ '^(account|hero:[0-5]|recruits)$');
comment on table public.account_kits is
  '1038-start-kits.sql: which starting kits an account has been paid (account once, hero:<slot> once a slot); 1053-recruits.sql: recruits, the recruit press once an account. Written only by hr_create_character__as and hr_recruit_company (insert on conflict do nothing); server-only.';

-- ── §2 THE OFFER, AND THE SECTION THAT SHOWS IT ────────────────────────────
-- plpgsql, never LANGUAGE sql with a SET clause: the section runs with every envelope, and PostgreSQL 17 re-plans such a SQL body on every
-- call (tests/settle-budget.mjs SB-3). The role each job plays is read in the one statement that orders the jobs.
create or replace function public.hr_recruit_offer(p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  r       public.hr_recruit_rules%rowtype;
  v_n     int;
  v_first int;
  v_lv    int;
  v_roles text[];
  v_free  int[];
  v_sets  text[];
begin
  if p_uid is null then return null; end if;
  -- the common case first: a company of two or more is never offered recruits (one primary-key range read)
  select count(*), min(ps.slot) into v_n, v_first from public.player_state ps where ps.user_id = p_uid;
  if v_n <> 1 then return null; end if;
  if exists (select 1 from public.account_kits k where k.user_id = p_uid and k.grant_key = 'recruits') then return null; end if;
  select * into r from public.hr_recruit_rules;
  if not found then return null; end if;
  select coalesce(array_agg(s.v::int order by s.v::int), '{}'::int[]) into v_free
    from jsonb_array_elements_text(public.hr_hero_slots_of(p_uid)) as s(v)
   where s.v::int <> v_first;
  if cardinality(v_free) < r.recruit_count then return null; end if;
  v_lv := public.hr_level_of(p_uid, v_first);
  select w.roles into v_roles from public.hr_hunt_weapon_roles w where w.weapon_type = public.hr_hunt_weapon_of(p_uid, v_first);
  -- each job's role: the first role of the weapon its practice set wears, a weapon with a shield arm (the sword) read as that arm when the
  -- set wears a shield (hr_hunt_weapon_of's own rule, for a set instead of a hero); the jobs the first hero's weapon does not play first
  select array_agg(j.set_id order by coalesce(x.role = any (coalesce(v_roles, '{}'::text[])), false), j.rank)
    into v_sets
    from public.hr_recruit_jobs j
    left join lateral (
      select ro.roles[1] as role
        from public.hr_start_kit_lines l
        join public.hr_hunt_weapons w on w.item_id = l.item_id
        join public.hr_hunt_weapon_roles wr on wr.weapon_type = w.weapon_type
        join public.hr_hunt_weapon_roles ro on ro.weapon_type = case
               when wr.with_shield is not null and exists (
                 select 1 from public.hr_start_kit_lines s join public.hr_hunt_shields hs on hs.item_id = s.item_id
                  where s.kit = 'practice' and s.set_id = j.set_id and s.worn and s.equip_slot = 'shield')
               then wr.with_shield else w.weapon_type end
       where l.kit = 'practice' and l.set_id = j.set_id and l.worn and l.equip_slot = 'weapon'
       limit 1) x on true;
  return jsonb_build_object(
    'ready', v_lv >= r.at_level,
    'at', r.at_level,
    'level', greatest(1, least(r.max_level, v_lv - r.levels_under)),
    'first', v_first,
    'slots', to_jsonb(v_free[1:r.recruit_count]),
    'sets', to_jsonb(v_sets[1:r.recruit_count]));
end $fn$;

-- THE SECTION `recruits`: the offer, the same for every hero of the account (null for a company of two or more, or once pressed).
create or replace function public.hr_recruits_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  return public.hr_recruit_offer(p_user);
end $fn$;

revoke all on function public.hr_recruit_offer(uuid) from public, anon, authenticated, service_role;
revoke all on function public.hr_recruits_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('recruits', 'hr_recruits_view', '1053-recruits.sql: the recruit press as the server will make it (ready, the Level they arrive at, the jobs and slots), or null: a company of two or more, or the press already made')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §3 THE PRESS ───────────────────────────────────────────────────────────
create or replace function public.hr_recruit_company(p_names text[] default null, p_idem uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb   constant text := 'recruit_company';
  v_uid    uuid := auth.uid();
  r        public.hr_recruit_rules%rowtype;
  v_r      jsonb;
  v_ok     jsonb;
  v_offer  jsonb;
  v_first  int;
  v_level  int;
  v_xp     bigint;
  v_base   jsonb;
  v_slot   int;
  v_set    text;
  v_name   text;
  v_canon  text;
  v_names  text[] := '{}';
  v_canons text[] := '{}';
  v_heroes jsonb := '[]'::jsonb;
  v_i      int;
  v_n      int;
  v_msg    text;
  v_det    text;
begin
  perform public.hr_access_check();
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  select * into r from public.hr_recruit_rules;
  if not found then return jsonb_build_object('ok', false, 'error', 'recruits_taken'); end if;

  -- THE NAMES, before any budget or lock: a malformed request never costs the honest player's allowance.
  if p_names is not null and (coalesce(array_ndims(p_names), 1) <> 1 or cardinality(p_names) > r.recruit_count) then
    return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'bad_names', 'count', r.recruit_count)); end if;
  for v_i in 1 .. r.recruit_count loop
    v_name := nullif(btrim(coalesce(p_names[v_i], '')), '');
    if v_name is null then
      v_names := array_append(v_names, null::text); v_canons := array_append(v_canons, null::text); continue;
    end if;
    v_ok := public.hr_validate_display_name(v_name);
    if coalesce(v_ok->>'ok', '') <> 'true' then
      return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'bad_name', 'index', v_i - 1, 'reason', v_ok->>'reason')); end if;
    if (v_ok->>'canonical') = any (array_remove(v_canons, null)) then
      return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'name_taken', 'index', v_i - 1)); end if;
    v_names := array_append(v_names, v_ok->>'name'); v_canons := array_append(v_canons, v_ok->>'canonical');
  end loop;

  -- A REPLAYED KEY answers its first receipt (no envelope) and makes nothing.
  v_r := public.hr_intent_replay(v_uid, null, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, null, v_r); end if;

  -- THE BUDGET: a press is once an account; this bounds a client that loops on its refusals.
  if not public.hr_rate_ok(v_uid, 'recruit_company', 6, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;

  -- THE ACCOUNT LOCK, then the offer read again under it: what this press makes is what the locked rows say.
  perform pg_advisory_xact_lock(hashtextextended('hr_recruit_company:' || v_uid::text, 0));
  select count(*), min(ps.slot) into v_n, v_first from public.player_state ps where ps.user_id = v_uid;
  if v_n = 0 then return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_offer := public.hr_recruit_offer(v_uid);
  if v_offer is null then
    return public.hr_note_rejection(c_verb, v_first, jsonb_build_object('ok', false, 'error', 'recruits_taken')); end if;
  if not (v_offer->>'ready')::boolean then
    return public.hr_note_rejection(c_verb, v_first, jsonb_build_object('ok', false, 'error', 'recruits_not_ready',
      'at', (v_offer->>'at')::int, 'level', public.hr_level_of(v_uid, v_first))); end if;
  v_level := (v_offer->>'level')::int;
  v_xp := public.hr_char_xp_for_level(v_level);
  select o.base_colors into v_base from public.player_outfits o where o.user_id = v_uid and o.slot = v_first;

  -- ALL OR NOTHING: a refusal anywhere below unwinds every hero, name and the mark.
  begin
    insert into public.account_kits (user_id, grant_key, slot, set_id) values (v_uid, 'recruits', v_first, null)
    on conflict (user_id, grant_key) do nothing;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception using errcode = 'HRR01', message = 'recruits_taken'; end if;

    for v_i in 0 .. r.recruit_count - 1 loop
      v_slot := (v_offer->'slots'->>v_i)::int;
      v_set := v_offer->'sets'->>v_i;
      -- THE HERO: the slot gate, the (user, slot) lock, the creation budget, its job's practice set worn, the hero kit once a slot.
      v_r := public.hr_create_character__as(v_slot, v_set);
      if coalesce(v_r->>'ok', '') <> 'true' or coalesce(v_r->>'created', '') <> 'true' then
        raise exception using errcode = 'HRR01', message = case when v_r->>'ok' = 'true' then 'recruits_taken' else coalesce(v_r->>'error', 'refused') end;
      end if;
      -- ITS NAME: the player's, or the first free one of the catalogue in this account's order (single given names first).
      v_name := v_names[v_i + 1]; v_canon := v_canons[v_i + 1];
      if v_name is null then
        select x.nm, x.cn into v_name, v_canon
          from (select g.name as nm, public.hr_canon_display_name(g.name) as cn, 0 as two
                  from public.hr_recruit_names g where g.part = 'given'
                union all
                select g.name || ' ' || f.name, public.hr_canon_display_name(g.name || ' ' || f.name), 1
                  from public.hr_recruit_names g cross join public.hr_recruit_names f
                 where g.part = 'given' and f.part = 'family') x
         where not (x.cn = any (array_remove(v_canons, null)))
           and not exists (select 1 from public.character_names cn where cn.canonical = x.cn)
           and not exists (select 1 from public.profiles pr where pr.id <> v_uid and pr.display_name is not null
                             and public.hr_canon_display_name(pr.display_name) = x.cn)
         order by x.two, md5(v_uid::text || x.cn)
         limit 1;
        if v_name is null then raise exception using errcode = 'HRR01', message = 'name_needed', detail = v_i::text; end if;
        v_canons[v_i + 1] := v_canon;
      elsif exists (select 1 from public.character_names cn where cn.canonical = v_canon)
         or exists (select 1 from public.profiles pr where pr.id <> v_uid and pr.display_name is not null
                      and public.hr_canon_display_name(pr.display_name) = v_canon) then
        raise exception using errcode = 'HRR01', message = 'name_taken', detail = v_i::text;
      end if;
      insert into public.character_names (user_id, slot, name, canonical, updated_at) values (v_uid, v_slot, v_name, v_canon, now());
      -- ITS LOOK: the first hero's base colours (a company dressed alike; each changes its own later)
      insert into public.player_outfits (user_id, slot, outfit_id, colors, base_colors, updated_at)
        values (v_uid, v_slot, null, '{}'::jsonb, coalesce(v_base, '{}'::jsonb), now())
      on conflict (user_id, slot) do update set base_colors = excluded.base_colors, updated_at = now();
      -- THE GRANT: its Level, and the health that Level has in town.
      update public.player_state set level_xp = v_xp, version = version + 1 where user_id = v_uid and slot = v_slot;
      update public.player_state set hp = (public.hr_vitals_of(v_uid, v_slot)->>'max_hp')::int where user_id = v_uid and slot = v_slot;
      insert into public.player_ledger (user_id, slot, kind, intent, meta)
        values (v_uid, v_slot, 'admin', 'recruit', jsonb_build_object('level', v_level, 'from_xp', 0, 'to_xp', v_xp, 'set', v_set,
                'first', v_first, 'named', v_names[v_i + 1] is not null, 'key', p_idem));
      v_heroes := v_heroes || jsonb_build_array(jsonb_build_object('slot', v_slot, 'name', v_name, 'set', v_set));
    end loop;
  exception
    when sqlstate 'HRR01' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      v_r := jsonb_build_object('ok', false, 'error', v_msg);
      if v_det ~ '^[0-9]$' then v_r := v_r || jsonb_build_object('index', v_det::int); end if;
      return public.hr_note_rejection(c_verb, v_first, v_r);
    when unique_violation then
      -- a name another player claimed between the read and the write
      return public.hr_note_rejection(c_verb, v_first, jsonb_build_object('ok', false, 'error', 'name_taken'));
  end;

  v_r := jsonb_build_object('ok', true, 'level', v_level, 'heroes', v_heroes);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, v_first, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  -- RULE 11: the answer carries the first hero's envelope (its `recruits` section is now null); the recruits are read by the roster.
  return v_r || jsonb_build_object('envelope', public.hr_state_of(v_uid, v_first));
end $fn$;

revoke all on function public.hr_recruit_company(text[], uuid) from public, anon;
grant execute on function public.hr_recruit_company(text[], uuid) to authenticated;
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note)
values ('hr_recruit_company', 'p_names text[], p_idem uuid', 'authenticated',
        'added 2026-11-22 (1053-recruits.sql): the recruit press, once an account: the key and, for each recruit, a typed name or null; the Level, XP, jobs, slots, kit and colours are the server''s (a grant)')
on conflict (proname, identity_args, grantee) do update set note = excluded.note;

-- ── §4 SELF-CHECK (CLAUDE.md §4): properties asserted by EXECUTING ─────────
-- Every probe is its own account and rolled back. Nothing here reads or counts a real player's row.
do $check$
declare
  c_one   uuid := gen_random_uuid();   -- a new account: one Club hero, then Level 5
  c_late  uuid := gen_random_uuid();   -- a one-hero account at Level 40 (a shield hero): recruits at max_level
  c_two   uuid := gen_random_uuid();   -- an account of two heroes: never offered
  r       public.hr_recruit_rules%rowtype;
  k1      uuid := gen_random_uuid();
  v       jsonb;
  v2      jsonb;
  v_role  text;
  v_bag   jsonb;
  v_lv    int;
  v_n     int;
  c_dyes  constant jsonb := '{"head":2,"body":3,"legs":0,"feet":1}'::jsonb;
begin
  select * into r from public.hr_recruit_rules;
  begin
    insert into auth.users (id) values (c_one), (c_late), (c_two) on conflict (id) do nothing;
    insert into public.profiles (id) values (c_one), (c_late), (c_two) on conflict do nothing;
    insert into public.hr_access_allowlist (user_id, note)
      values (c_one, 'recruits §4 probe'), (c_late, 'recruits §4 probe'), (c_two, 'recruits §4 probe') on conflict (user_id) do nothing;

    -- (a) ONE HERO, LEVEL 1: the offer is there and not ready; the press refuses and makes nothing.
    perform set_config('request.jwt.claim.sub', c_one::text, true);
    v := public.hr_create_hero(0, 'Recruitprobe Ana', c_dyes, gen_random_uuid(), 'club');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): the first hero answered %', v; end if;
    v := public.hr_recruit_offer(c_one);
    if v is null or (v->>'ready')::boolean or (v->>'at')::int <> r.at_level or v->'slots' <> '[1,2,3]'::jsonb then
      raise exception 'VERIFY(a): a Level 1 one-hero account is offered %', v; end if;
    v := public.hr_recruit_company(null, gen_random_uuid());
    if v->>'error' is distinct from 'recruits_not_ready' or (select count(*) from public.player_state where user_id = c_one) <> 1 then
      raise exception 'VERIFY(a): a press under Level % answered %', r.at_level, v; end if;

    -- (b) LEVEL 5: ready, at that Level, a Club hero's company gets a shield, a healer and a bow; the section says the same.
    update public.player_state set level_xp = public.hr_char_xp_for_level(r.at_level) where user_id = c_one and slot = 0;
    v := public.hr_recruit_offer(c_one);
    if not (v->>'ready')::boolean or (v->>'level')::int <> r.at_level or v->'sets' <> '["tank","healer","ranger"]'::jsonb then
      raise exception 'VERIFY(b): a Level % Club hero is offered %', r.at_level, v; end if;
    if public.hr_state_of(c_one, 0)->'recruits' is distinct from v then
      raise exception 'VERIFY(b): the section reads %, the offer %', public.hr_state_of(c_one, 0)->'recruits', v; end if;

    -- (c) A BAD NAME refuses the whole press: nothing made, no mark.
    v := public.hr_recruit_company(array[null, 'admin', null], gen_random_uuid());
    if v->>'error' is distinct from 'bad_name' or (v->>'index')::int <> 1
       or exists (select 1 from public.account_kits where user_id = c_one and grant_key = 'recruits') then
      raise exception 'VERIFY(c): a reserved name answered %', v; end if;

    -- (d) THE PRESS: one typed name, two from the town; four heroes at Level 5, each wearing its job, the first hero's colours, the
    --     hero kit; one ledger row a recruit; the mark; the answer carries the first hero's envelope with the section gone.
    v := public.hr_recruit_company(array['Recruitprobe Bo', null, null], k1);
    if coalesce(v->>'ok', '') <> 'true' or jsonb_array_length(v->'heroes') <> 3 or (v->>'level')::int <> r.at_level then
      raise exception 'VERIFY(d): the press answered %', v; end if;
    if v->'envelope'->>'ok' is distinct from 'true' or v->'envelope'->'recruits' <> 'null'::jsonb then
      raise exception 'VERIFY(d): the answer''s envelope reads recruits %', v->'envelope'->'recruits'; end if;
    if (select count(*) from public.player_state where user_id = c_one) <> 4
       or exists (select 1 from public.player_state where user_id = c_one and slot > 0 and public.hr_level_of(user_id, slot) <> r.at_level) then
      raise exception 'VERIFY(d): the company holds % heroes', (select jsonb_agg(jsonb_build_object('slot', slot, 'level', public.hr_level_of(user_id, slot)))
        from public.player_state where user_id = c_one); end if;
    if (select name from public.character_names where user_id = c_one and slot = 1) <> 'Recruitprobe Bo'
       or (select count(*) from public.character_names where user_id = c_one) <> 4 then
      raise exception 'VERIFY(d): the recruits are named %', (select jsonb_agg(name) from public.character_names where user_id = c_one); end if;
    if (select item_id from public.player_equipment where user_id = c_one and slot = 1 and equip_slot = 'shield') is distinct from 'practice_shield'
       or (select item_id from public.player_equipment where user_id = c_one and slot = 2 and equip_slot = 'weapon') is distinct from 'practice_staff'
       or (select item_id from public.player_equipment where user_id = c_one and slot = 3 and equip_slot = 'weapon') is distinct from 'practice_bow' then
      raise exception 'VERIFY(d): the recruits do not wear their jobs'; end if;
    if exists (select 1 from public.player_outfits where user_id = c_one and slot > 0 and base_colors <> c_dyes) then
      raise exception 'VERIFY(d): a recruit does not wear the first hero''s colours'; end if;
    select jsonb_object_agg(item_id, qty) into v_bag from public.player_inventory i where i.user_id = c_one and i.slot = 2
       and exists (select 1 from public.hr_start_kit_lines l where l.kit = 'hero' and l.item_id = i.item_id);
    if v_bag is distinct from (select jsonb_object_agg(item_id, qty) from public.hr_start_kit_lines where kit = 'hero') then
      raise exception 'VERIFY(d): a recruit''s hero kit is %', v_bag; end if;
    if exists (select 1 from public.player_state ps where ps.user_id = c_one and ps.slot > 0
                and ps.hp <> (public.hr_vitals_of(ps.user_id, ps.slot)->>'max_hp')::int) then
      raise exception 'VERIFY(d): a recruit does not stand at its town health'; end if;
    if (select count(*) from public.player_ledger where user_id = c_one and kind = 'admin' and intent = 'recruit'
          and (meta->>'to_xp')::bigint = public.hr_char_xp_for_level(r.at_level)) <> 3
       or not exists (select 1 from public.account_kits where user_id = c_one and grant_key = 'recruits' and slot = 0) then
      raise exception 'VERIFY(d): the grant is not journalled or not marked'; end if;
    if public.hr_recruit_offer(c_one) is not null then raise exception 'VERIFY(d): the offer stands after the press'; end if;

    -- (e) ONCE: the same key answers its receipt and makes nothing; a new key is refused recruits_taken.
    v2 := public.hr_recruit_company(array['Recruitprobe Bo', null, null], k1);
    if v2->'heroes' is distinct from v->'heroes' or v2 ? 'envelope' or (select count(*) from public.player_state where user_id = c_one) <> 4 then
      raise exception 'VERIFY(e): a replayed key answered %', v2; end if;
    v2 := public.hr_recruit_company(null, gen_random_uuid());
    if v2->>'error' is distinct from 'recruits_taken' or (select count(*) from public.player_state where user_id = c_one) <> 4
       or (select count(*) from public.player_ledger where user_id = c_one and intent = 'recruit') <> 3 then
      raise exception 'VERIFY(e): a second press answered %', v2; end if;

    -- (f) LATE: a shield hero at Level 40 gets a healer, a bow and a club at max_level, never at its own Level.
    perform set_config('request.jwt.claim.sub', c_late::text, true);
    v := public.hr_create_hero(0, 'Recruitprobe Late', c_dyes, gen_random_uuid(), 'tank');
    update public.player_state set level_xp = public.hr_char_xp_for_level(40) where user_id = c_late and slot = 0;
    v := public.hr_recruit_offer(c_late);
    if (v->>'level')::int <> least(r.max_level, 40 - r.levels_under) or v->'sets' <> '["healer","ranger","club"]'::jsonb then
      raise exception 'VERIFY(f): a Level 40 shield hero is offered %', v; end if;
    v := public.hr_recruit_company(null, gen_random_uuid());
    select max(public.hr_level_of(user_id, slot)) into v_lv from public.player_state where user_id = c_late and slot > 0;
    if coalesce(v->>'ok', '') <> 'true' or v_lv <> least(r.max_level, 40 - r.levels_under) then
      raise exception 'VERIFY(f): the late press answered % at Level %', v, v_lv; end if;

    -- (g) TWO HEROES: never offered, the press refused, nothing made.
    perform set_config('request.jwt.claim.sub', c_two::text, true);
    v := public.hr_create_character(0);
    v := public.hr_create_character(2);
    update public.player_state set level_xp = public.hr_char_xp_for_level(r.at_level) where user_id = c_two;
    v := public.hr_recruit_company(null, gen_random_uuid());
    if public.hr_recruit_offer(c_two) is not null or v->>'error' is distinct from 'recruits_taken'
       or (select count(*) from public.player_state where user_id = c_two) <> 2 then
      raise exception 'VERIFY(g): a two-hero account answered % and offered %', v, public.hr_recruit_offer(c_two); end if;

    raise exception using errcode = 'HRR99', message = 'recruits §4 complete - rolling back';
  exception when sqlstate 'HRR99' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (h) ZERO LEAK; the press is the one client door, the helpers are the server's.
  if exists (select 1 from public.player_state where user_id in (c_one, c_late, c_two))
     or exists (select 1 from public.account_kits where user_id in (c_one, c_late, c_two))
     or exists (select 1 from public.player_ledger where user_id in (c_one, c_late, c_two))
     or exists (select 1 from auth.users where id in (c_one, c_late, c_two)) then
    raise exception 'VERIFY(h): §4 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_recruit_offer(uuid)', 'execute')
       or has_function_privilege(v_role, 'public.hr_recruits_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(h): % can reach a recruit helper', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_recruit_company(text[],uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_recruit_company(text[],uuid)', 'execute') then
    raise exception 'VERIFY(h): the press is not the one client door'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'recruits: one hero first; at Level % one press makes % heroes at that Level (never above %), each in a job the company lacks, '
               'named, kitted and journalled, once an account; a retried key replays its receipt; zero leak.', r.at_level, r.recruit_count, r.max_level;
end $check$;
