-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — PER-CHARACTER NAMES AND "WHERE IS MY ITEM?" ACROSS THE ACCOUNT
-- (lane S2; CONFLICTS.md 2026-10-18 "PARTY UI" item 2 and "ALPHA WINDOWS"
-- item 2 hr_account_items). STAGED. Game CLOSED: applies on its passing §4;
-- Security reviews it with every S2 surface in the reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- character_names (user, slot): a character's own name, unique case- and
--   separator-insensitively (hr_canon_display_name) across every character,
--   validated by the display-name rules (hr_validate_display_name: length,
--   charset, reserved, content), and never another ACCOUNT's display name (an
--   invite by name must find one character, not two).
-- hr_character_name(user, slot): the name players see — the character's own;
--   else the account's display name (slot 0) or "<display name> (<n>)" (a later
--   slot), so two characters of one account never read alike in a party.
-- hr_character_by_name(name): the character a name means — a character name
--   first, else the account display name's first character (slot 0).
-- hr_character_name_set(p_slot, p_name, p_idem): claim / change it
--   (authenticated, rate bucket `party`, idempotent; `name_taken`).
-- THE SECTION `name`: the string above (src/session/item-sections.js nameOf).
-- The party panel, the party finder and the hunt hero read the same function
-- (S1's three views restated whole in 2026-10-25-settle-hooks.sql), so a name
-- is per character everywhere it crosses to another player.
-- hr_account_items(p_query 2..40): where items whose catalogue name or id
--   matches are, across THIS account's characters: bag, bank, worn
--   [{slot, name, item, qty, where}] (<= 200 rows; rate bucket `hunt_read`).
--   A read of the caller's own rows only (auth.uid()); no other account.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Moves no value. A name crosses to other players, so it is the server's,
-- validated by the same rules as a display name, and unique. The search is
-- self-only and its pattern is escaped (no LIKE wildcard reaches the query).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Drop the two verbs (+ baseline rows), the section row + view, the two name
-- functions, the table, AFTER reverting 2026-10-25-settle-hooks.sql (it names
-- characters with them). ORDER: after 2026-10-25-hunt-presets.sql.
-- No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_validate_display_name(text)') is null or to_regprocedure('public.hr_canon_display_name(text)') is null
     or to_regprocedure('public.hr_hunt_party_view(uuid,integer)') is null or to_regprocedure('public.hr_hunt_section_view(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_party_finder(integer,text,text)') is null or to_regclass('public.player_bank') is null then
    raise exception 'PRECONDITION: the display-name rules, the S1 party / hunt views or player_bank are absent'; end if;
end $mig$;

-- ── §1 THE NAMES ─────────────────────────────────────────────────────────────
create table if not exists public.character_names (
  user_id    uuid not null,
  slot       int  not null,
  name       text not null check (length(name) between 3 and 20),
  canonical  text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot),
  constraint character_names_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
create unique index if not exists character_names_canonical on public.character_names (canonical);
alter table public.character_names enable row level security;
revoke all on public.character_names from public, anon, authenticated, service_role;
comment on table public.character_names is
  '2026-10-25 (lane S2). A character''s own name, unique by hr_canon_display_name. Written only by hr_character_name_set; read through hr_character_name.';

create or replace function public.hr_character_name(p_user uuid, p_slot int)
returns text language sql stable set search_path = public, pg_catalog as $$
  select coalesce(
    (select n.name from public.character_names n where n.user_id = p_user and n.slot = p_slot),
    (select case when p_slot = 0 then pr.display_name else pr.display_name || ' (' || (p_slot + 1) || ')' end
       from public.profiles pr where pr.id = p_user and pr.display_name is not null),
    'Adventurer')
$$;
revoke execute on function public.hr_character_name(uuid, int) from public, anon, authenticated, service_role;

-- The character a name means: a character name, else an account's first character.
create or replace function public.hr_character_by_name(p_name text, out user_id uuid, out slot int)
language plpgsql stable set search_path = public, pg_catalog as $$
declare v_canon text := public.hr_canon_display_name(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')));
begin
  if v_canon is null or length(v_canon) < 3 then return; end if;
  select n.user_id, n.slot into user_id, slot from public.character_names n where n.canonical = v_canon;
  if found then return; end if;
  select ps.user_id, ps.slot into user_id, slot
    from public.profiles pr join public.player_state ps on ps.user_id = pr.id and ps.slot = 0
   where pr.display_name is not null and public.hr_canon_display_name(pr.display_name) = v_canon
   order by pr.created_at, pr.id limit 1;
end $$;
revoke execute on function public.hr_character_by_name(text) from public, anon, authenticated, service_role;

create or replace function public.hr_character_name_view(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select to_jsonb(public.hr_character_name(p_user, p_slot))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$$;
revoke execute on function public.hr_character_name_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('name', 'hr_character_name_view', '2026-10-25-account-items.sql: the character''s own name (else the account display name, numbered after slot 0)')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

create or replace function public.hr_character_name_set(p_slot int, p_name text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ok jsonb; v_name text; v_canon text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('character_name_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('character_name_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_ok := public.hr_validate_display_name(p_name);
  if coalesce(v_ok->>'ok', '') <> 'true' then
    return public.hr_note_rejection('character_name_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_name', 'reason', v_ok->>'reason')); end if;
  v_name := v_ok->>'name'; v_canon := v_ok->>'canonical';
  v_verb := 'character_name_set:' || v_canon;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('character_name_set', p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('character_name_set', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- Unique among characters, and never ANOTHER account's display name.
  if exists (select 1 from public.character_names n where n.canonical = v_canon and not (n.user_id = v_uid and n.slot = p_slot))
     or exists (select 1 from public.profiles pr where pr.id <> v_uid and pr.display_name is not null
                  and public.hr_canon_display_name(pr.display_name) = v_canon) then
    return public.hr_note_rejection('character_name_set', p_slot, jsonb_build_object('ok', false, 'error', 'name_taken')); end if;
  begin
    insert into public.character_names as n (user_id, slot, name, canonical, updated_at) values (v_uid, p_slot, v_name, v_canon, now())
      on conflict (user_id, slot) do update set name = excluded.name, canonical = excluded.canonical, updated_at = now();
  exception when unique_violation then
    return public.hr_note_rejection('character_name_set', p_slot, jsonb_build_object('ok', false, 'error', 'name_taken'));
  end;
  v_r := jsonb_build_object('ok', true, 'name', v_name);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_character_name_set(int, text, uuid) from public;
revoke execute on function public.hr_character_name_set(int, text, uuid) from anon, service_role;
grant  execute on function public.hr_character_name_set(int, text, uuid) to authenticated;

-- ── §2 WHERE IS MY ITEM ──────────────────────────────────────────────────────
create or replace function public.hr_account_items(p_query text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_q text; v_pat text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('hunt_read') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_q := lower(btrim(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g')));
  if length(v_q) not between 2 and 40 then return jsonb_build_object('ok', false, 'error', 'bad_query'); end if;
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('slot', r.slot, 'name', public.hr_character_name(v_uid, r.slot),
                                        'item', r.item_id, 'qty', r.qty, 'where', r.loc)
                     order by r.slot, r.ord, i.name, r.item_id)
      from (select x.* from (
              select pi.slot, pi.item_id, pi.qty, 'bag'::text as loc, 0 as ord from public.player_inventory pi
               where pi.user_id = v_uid and pi.qty > 0
              union all
              select pb.slot, pb.item_id, pb.qty, 'bank', 1 from public.player_bank pb
               where pb.user_id = v_uid and pb.qty > 0
              union all
              select pe.slot, pe.item_id, count(*)::bigint, 'worn', 2 from public.player_equipment pe
               where pe.user_id = v_uid group by pe.slot, pe.item_id) x
             join public.hr_items it on it.item_id = x.item_id
            where lower(it.name) like v_pat escape '\' or it.item_id like v_pat escape '\'
            order by x.slot, x.ord, x.item_id
            limit 200) r
      join public.hr_items i on i.item_id = r.item_id), '[]'::jsonb));
end $$;
revoke execute on function public.hr_account_items(text) from public;
revoke execute on function public.hr_account_items(text) from anon, service_role;
grant  execute on function public.hr_account_items(text) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_character_name_set', 'hr_account_items');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_character_name_set', 'p_slot integer, p_name text, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane S2): claim a character''s own name (display-name rules, unique, never another account''s display name); moves no value'),
  ('hr_account_items', 'p_query text', 'authenticated',
   'added 2026-10-25 (lane S2): read-only - where matching items are across the CALLER''s own characters (bag, bank, worn), <= 200 rows');

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_a constant uuid := '000000c0-0000-0000-0000-00005e2d0001';
  v_b constant uuid := '000000c0-0000-0000-0000-00005e2d0002';
  v jsonb; v_role text; v_item text; v_r record;
begin
  begin
    insert into auth.users (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_a, 'Probe Alpha'), (v_b, 'Probe Bravo')
      on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'account-items §3 probe'), (v_b, 'account-items §3 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    -- (a) the fallback name, then a claimed one; the section follows; a reused key for another name is refused.
    if public.hr_state_of(v_a, 0)->>'name' is distinct from 'Probe Alpha' then raise exception 'VERIFY(a): the fallback name is %', public.hr_state_of(v_a, 0)->'name'; end if;
    v := public.hr_character_name_set(0, 'Mira', '000000c0-0000-4000-a000-00005e2d0101');
    if coalesce(v->>'ok', '') <> 'true' or public.hr_state_of(v_a, 0)->>'name' is distinct from 'Mira' then raise exception 'VERIFY(a): naming answered %', v; end if;
    v := public.hr_character_name_set(0, 'admin', '000000c0-0000-4000-a000-00005e2d0102');
    if v->>'error' is distinct from 'bad_name' then raise exception 'VERIFY(a): a reserved name answered %', v; end if;
    -- (b) another account may not take it, nor this account's neighbour's display name.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_create_character(0);
    v := public.hr_character_name_set(0, 'MIRA', '000000c0-0000-4000-a000-00005e2d0103');
    if v->>'error' is distinct from 'name_taken' then raise exception 'VERIFY(b): a taken name answered %', v; end if;
    v := public.hr_character_name_set(0, 'probe alpha', '000000c0-0000-4000-a000-00005e2d0104');
    if v->>'error' is distinct from 'name_taken' then raise exception 'VERIFY(b): another account''s display name answered %', v; end if;
    -- (c) a name means one character: the character name first, else the account's first character.
    select * into v_r from public.hr_character_by_name('mira');
    if v_r.user_id is distinct from v_a or v_r.slot is distinct from 0 then raise exception 'VERIFY(c): mira resolves to %', v_r; end if;
    select * into v_r from public.hr_character_by_name('Probe  Bravo');
    if v_r.user_id is distinct from v_b then raise exception 'VERIFY(c): Probe Bravo resolves to %', v_r; end if;
    select * into v_r from public.hr_character_by_name('nobody here');
    if v_r.user_id is not null then raise exception 'VERIFY(c): an unknown name resolved'; end if;
    -- (d) where is my item: the caller's own bag / worn, matched by catalogue name, wildcards inert.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_item := (select i.item_id from public.hr_items i where length(i.name) >= 4 order by i.item_id limit 1);
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_a, 0, v_item, 7)
      on conflict (user_id, slot, item_id) do update set qty = 7;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_b, 0, v_item, 9)
      on conflict (user_id, slot, item_id) do update set qty = 9;
    v := public.hr_account_items(lower((select name from public.hr_items where item_id = v_item)));
    if coalesce(v->>'ok', '') <> 'true' or not exists (select 1 from jsonb_array_elements(v->'rows') r
         where r->>'item' = v_item and (r->>'qty')::int = 7 and r->>'where' = 'bag' and r->>'name' = 'Mira')
       or exists (select 1 from jsonb_array_elements(v->'rows') r where (r->>'qty')::int = 9) then
      raise exception 'VERIFY(d): hr_account_items answered %', v; end if;
    v := public.hr_account_items('%%');
    if jsonb_array_length(v->'rows') <> 0 then raise exception 'VERIFY(d): a wildcard query matched rows'; end if;
    v := public.hr_account_items('x');
    if v->>'error' is distinct from 'bad_query' then raise exception 'VERIFY(d): a one-letter query answered %', v; end if;
    raise exception using errcode = 'HR874', message = 'account-items §3 complete - rolling back';
  exception when sqlstate 'HR874' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b)) or exists (select 1 from public.character_names where user_id in (v_a, v_b)) then
    raise exception 'VERIFY(e): §3 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.character_names', 'select,insert,update,delete')
       or has_function_privilege(v_role, 'public.hr_character_name(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_character_by_name(text)', 'execute')
       or has_function_privilege(v_role, 'public.hr_character_name_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(e): % reaches a name table or internal', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'account-items: per-character names (unique, validated, everywhere a name crosses), self-only item search; all green';
end $$;
