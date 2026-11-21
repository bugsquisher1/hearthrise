-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1039-account-coach.sql — THE TUTORIAL IS TAUGHT ONCE AN ACCOUNT, NOT ONCE A HERO
--   (lane/c-first-hour, FB-5, backend-architect, 2026-11-21; chapter 08 section 2.6: "An account lesson is taught once. A card seen
--   on one hero is seen for the account"; review/02-four-hero-hour.md quit point 3: "The same tips restart for each hero").
--
-- STATUS: supabase/migration-notes/1039-account-coach.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check. Not a money surface.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- What the coach has taught lived per HERO, in each hero's client residue (player_state.client_state -> 'coach' -> 'read'). With
--   four heroes from the start every hero walked the first hour's cards again. The tutorial's PROGRESS stays the server's facts, per
--   hero (src/session/tutorial-sections.js); what is TAUGHT moves to the account:
--     read     the cards a player pressed Got it on or had on screen long enough (they finish a card that teaches)
--     taught   the cards a hero of this account moved past: every other hero of the account passes them by, except a card
--              about a weapon's own first move (the client's rule, src/session/account-coach.js)
--   Display state: it finishes a card that teaches and gates, spends and ranks nothing. The fold, the visit's hides and the return
--   mark stay each hero's display residue (they say where one hero's screen is, not what the account has learnt).
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- §1 public.account_coach (user_id pk, read text[], taught text[], version, updated_at). Each array holds card ids
--    (^[a-z0-9_]{1,64}$), oldest first, at most 256. RLS on, no policy, no client grant: the RPC below is the only door.
-- §2 L-03, LIVE ACCOUNTS: 21 of 22 heroes hold coach state (COUNTED, production, 2026-11-21). An account counts as taught a card if
--    any of its heroes read it: read and taught are seeded with the union of its heroes' client_state.coach.read. The hero rows are
--    not written.
-- §3 hr_account_coach(p_read text[] default '{}', p_taught text[] default '{}', p_idem uuid default null) -> { ok, read, taught, v }.
--    SECURITY DEFINER, the caller's own row only (auth.uid()), bucket 'client_state_put' (60 a minute). Empty arrays read the state
--    and write nothing. Otherwise the ids are a UNION into the stored arrays: an id already there is not moved, a new one is added at
--    the end and the oldest past 256 drop; version rises by one when anything changed. A union is idempotent, so a replayed key, a
--    stale tab or two tabs at once can only add what they saw, never take a taught card back. A write needs p_idem (bad_idem).
-- REFUSAL CODES: not_signed_in, rate_limited, bad_idem, bad_card (an id of the wrong shape, or more than 64 in one call).
--
-- ── CONCURRENCY ────────────────────────────────────────────────────────────
-- One row an account, written under its row lock (insert ... on conflict do update reads the row it updates), so two tabs that add
--   at once both land. No read-modify-write crosses a network hop: the client sends ids, never a whole array to replace.
-- ── EXPLOIT SURFACE ────────────────────────────────────────────────────────
-- One client RPC that writes the caller's own display row, bounded (64 ids a call, 256 kept, 60 calls a minute). Nothing it holds
--   is read by a gate, a price, a grant or a ranking.
-- COST AT 100x: one row an account, at most 512 short ids (under 20 KB); about 3,500 rows and 70 MB at the very worst at 700 accounts,
--   in practice a few KB each. No journal row: display state (law 6).
-- REVERSIBILITY: drop the function and the table; the heroes' residue was never written, so the old per-hero reads still stand.
-- EDGE: none.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ───────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.player_state') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state'
                     and column_name = 'client_state') then
    raise exception 'PRECONDITION: player_state.client_state, hr_client_rpc_baseline or hr_rpc_gate is absent';
  end if;
end $mig$;

-- ── §1 THE ACCOUNT'S TAUGHT CARDS ──────────────────────────────────────────
create or replace function public.hr_coach_ids_ok(p text[])
returns boolean language sql immutable parallel safe set search_path = public, pg_catalog as $$
  select coalesce(cardinality(p), 0) <= 256
     and not exists (select 1 from unnest(coalesce(p, '{}'::text[])) x where x is null or x !~ '^[a-z0-9_]{1,64}$')
$$;
revoke all on function public.hr_coach_ids_ok(text[]) from public, anon, authenticated;

create table if not exists public.account_coach (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  read       text[]      not null default '{}' check (public.hr_coach_ids_ok(read)),
  taught     text[]      not null default '{}' check (public.hr_coach_ids_ok(taught)),
  version    bigint      not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);
alter table public.account_coach enable row level security;
revoke all on public.account_coach from public, anon, authenticated;
comment on table public.account_coach is
  '1039-account-coach.sql: the tutorial cards an ACCOUNT has read and taught (display state). Written only by hr_account_coach; server-only.';

-- The union: `have` in its order, then each id of `add` not yet in it, in its order; the newest 256 kept. Pure.
create or replace function public.hr_coach_union(have text[], add text[])
returns text[] language sql immutable parallel safe set search_path = public, pg_catalog as $$
  select coalesce((select array_agg(u.id order by u.n) from (
    select z.id, z.n from (
      select x.id, min(x.n) as n from (
        select h.id, h.n from unnest(coalesce(have, '{}'::text[])) with ordinality as h(id, n)
        union all
        select a.id, 1000000 + a.n from unnest(coalesce(add, '{}'::text[])) with ordinality as a(id, n)
      ) x group by x.id
    ) z order by z.n desc limit 256
  ) u), '{}'::text[])
$$;
revoke all on function public.hr_coach_union(text[], text[]) from public, anon, authenticated;

-- ── §2 L-03: AN ACCOUNT IS TAUGHT WHAT ANY OF ITS HEROES WAS ──────────────────
insert into public.account_coach (user_id, read, taught)
select s.user_id, s.ids, s.ids
  from (
    select ps.user_id,
           (select coalesce(array_agg(x.id order by x.id), '{}'::text[]) from (
              select distinct r.id from public.player_state p2,
                     jsonb_array_elements_text(case when jsonb_typeof(p2.client_state->'coach'->'read') = 'array'
                                                    then p2.client_state->'coach'->'read' else '[]'::jsonb end) as r(id)
               where p2.user_id = ps.user_id and r.id ~ '^[a-z0-9_]{1,64}$'
               order by r.id limit 256) x) as ids
      from (select distinct user_id from public.player_state) ps
  ) s
 where cardinality(s.ids) > 0
on conflict (user_id) do nothing;

do $mig$
declare v_bad bigint;
begin
  -- every card any hero read is taught for its account (up to the 256 kept)
  select count(*) into v_bad
    from public.player_state p,
         jsonb_array_elements_text(case when jsonb_typeof(p.client_state->'coach'->'read') = 'array'
                                        then p.client_state->'coach'->'read' else '[]'::jsonb end) as r(id)
   where r.id ~ '^[a-z0-9_]{1,64}$'
     and not exists (select 1 from public.account_coach c where c.user_id = p.user_id and r.id = any (c.taught) and r.id = any (c.read))
     and (select count(distinct r2.id) from public.player_state p3,
                 jsonb_array_elements_text(case when jsonb_typeof(p3.client_state->'coach'->'read') = 'array'
                                                then p3.client_state->'coach'->'read' else '[]'::jsonb end) as r2(id)
           where p3.user_id = p.user_id) <= 256;
  if v_bad > 0 then
    raise exception 'account-coach §2: % card(s) a hero read are not taught for its account', v_bad;
  end if;
end $mig$;

-- ── §3 THE ONE DOOR ────────────────────────────────────────────────────────
create or replace function public.hr_account_coach(p_read text[] default '{}', p_taught text[] default '{}', p_idem uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.account_coach%rowtype;
  v_r   text[];
  v_t   text[];
begin
  if not public.hr_rpc_gate('client_state_put') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if coalesce(cardinality(p_read), 0) > 64 or coalesce(cardinality(p_taught), 0) > 64
     or not public.hr_coach_ids_ok(p_read) or not public.hr_coach_ids_ok(p_taught) then
    return public.hr_note_rejection('hr_account_coach', 0, jsonb_build_object('ok', false, 'error', 'bad_card'));
  end if;

  if coalesce(cardinality(p_read), 0) + coalesce(cardinality(p_taught), 0) > 0 then
    if p_idem is null then
      return public.hr_note_rejection('hr_account_coach', 0, jsonb_build_object('ok', false, 'error', 'bad_idem'));
    end if;
    insert into public.account_coach as c (user_id, read, taught, version, updated_at)
      values (v_uid, public.hr_coach_union('{}', p_read), public.hr_coach_union('{}', p_taught), 1, now())
    on conflict (user_id) do update
      set read = public.hr_coach_union(c.read, excluded.read),
          taught = public.hr_coach_union(c.taught, excluded.taught),
          version = c.version + 1,
          updated_at = now()
      where public.hr_coach_union(c.read, excluded.read) is distinct from c.read
         or public.hr_coach_union(c.taught, excluded.taught) is distinct from c.taught;
  end if;

  select * into v_row from public.account_coach where user_id = v_uid;
  v_r := coalesce(v_row.read, '{}'); v_t := coalesce(v_row.taught, '{}');
  return jsonb_build_object('ok', true, 'read', to_jsonb(v_r), 'taught', to_jsonb(v_t), 'v', coalesce(v_row.version, 0));
end $function$;

revoke all on function public.hr_account_coach(text[], text[], uuid) from public, anon;
grant execute on function public.hr_account_coach(text[], text[], uuid) to authenticated;
delete from public.hr_client_rpc_baseline where proname = 'hr_account_coach';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note)
values ('hr_account_coach', 'p_read text[], p_taught text[], p_idem uuid', 'authenticated',
        'added 2026-11-21 (1039-account-coach.sql): the caller''s own tutorial cards read and taught, a bounded union of card ids into one account row (display state, gates nothing)');

-- ── §4 SELF-CHECK (CLAUDE.md §4): properties asserted by EXECUTING ─────────
do $check$
declare
  c_a  uuid := gen_random_uuid();
  c_b  uuid := gen_random_uuid();
  v    jsonb;
  v_role text;
  i    int;
  big  text[];
begin
  begin
    insert into auth.users (id) values (c_a), (c_b) on conflict (id) do nothing;
    insert into public.profiles (id) values (c_a), (c_b) on conflict do nothing;
    insert into public.hr_access_allowlist (user_id, note)
      values (c_a, 'account-coach §4 probe'), (c_b, 'account-coach §4 probe') on conflict (user_id) do nothing;

    -- (a) an account with nothing reads empty at version 0 and writes nothing for it
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_account_coach();
    if v is distinct from '{"ok": true, "read": [], "taught": [], "v": 0}'::jsonb
       or exists (select 1 from public.account_coach where user_id = c_a) then
      raise exception 'VERIFY(a): an empty read answered % or wrote a row', v; end if;

    -- (b) a write needs its key; ids are a union in order; a repeat changes nothing and keeps the version
    v := public.hr_account_coach(array['first_kill'], '{}', null);
    if v->>'error' is distinct from 'bad_idem' then raise exception 'VERIFY(b): a write with no key answered %', v; end if;
    v := public.hr_account_coach(array['first_kill', 'bar_intro'], array['enter_cellar'], gen_random_uuid());
    v := public.hr_account_coach(array['bar_intro', 'leave_cellar'], array['enter_cellar'], gen_random_uuid());
    if v->'read' is distinct from '["first_kill", "bar_intro", "leave_cellar"]'::jsonb or v->'taught' is distinct from '["enter_cellar"]'::jsonb
       or (v->>'v')::int <> 2 then
      raise exception 'VERIFY(b): the union reads %', v; end if;
    v := public.hr_account_coach(array['first_kill'], array['enter_cellar'], gen_random_uuid());
    if (v->>'v')::int <> 2 then raise exception 'VERIFY(b): a repeat moved the version to %', v->'v'; end if;

    -- (c) a bad id, or too many in one call, is refused and nothing moves
    v := public.hr_account_coach(array['Bad Card'], '{}', gen_random_uuid());
    if v->>'error' is distinct from 'bad_card' then raise exception 'VERIFY(c): a bad id answered %', v; end if;
    select array_agg('c' || g) into big from generate_series(1, 65) g;
    v := public.hr_account_coach(big, '{}', gen_random_uuid());
    if v->>'error' is distinct from 'bad_card' then raise exception 'VERIFY(c): 65 ids answered %', v; end if;

    -- (d) at most 256 kept: the oldest drop
    for i in 0..4 loop
      select array_agg('k' || (i * 64 + g)) into big from generate_series(1, 64) g;
      v := public.hr_account_coach(big, '{}', gen_random_uuid());
    end loop;
    if jsonb_array_length(v->'read') <> 256 or v->'read'->>0 = 'first_kill' or v->'read'->>255 <> 'k320' then
      raise exception 'VERIFY(d): the cap kept % ids, first %, last %', jsonb_array_length(v->'read'), v->'read'->>0, v->'read'->>255; end if;

    -- (e) the caller's own row only: another account reads its own empty state
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_account_coach();
    if (v->>'v')::int <> 0 or jsonb_array_length(v->'read') <> 0 then raise exception 'VERIFY(e): another account reads %', v; end if;

    raise exception using errcode = 'HR946', message = 'account-coach §4 complete - rolling back';
  exception when sqlstate 'HR946' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (f) ZERO LEAK; the table is the RPC's alone
  if exists (select 1 from public.account_coach where user_id in (c_a, c_b)) or exists (select 1 from auth.users where id in (c_a, c_b)) then
    raise exception 'VERIFY(f): §4 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.account_coach', 'select,insert,update,delete')
       or has_function_privilege(v_role, 'public.hr_coach_union(text[],text[])', 'execute') then
      raise exception 'VERIFY(f): % can reach account_coach or its union', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_account_coach(text[],text[],uuid)', 'execute') then
    raise exception 'VERIFY(f): anon can reach hr_account_coach'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'account-coach: a bounded union of card ids an account, its own row only, every live hero''s reads taught for its account; zero leak.';
end $check$;
