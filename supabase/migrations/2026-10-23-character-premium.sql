-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — CHARACTER PREMIUM (lane S1; HUNT_SCREEN_SPEC §3.10 #5; Tyler
-- 2026-10-17). STAGED. Game CLOSED: applies on its passing §4 (CLAUDE.md §2,
-- Tyler 10-17); Security reviews it in the reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   §1 player_state.premium_until — premium is PER CHARACTER (user_id, slot)
--      and a SERVER column. No client role can write it (player_state has no
--      client write policy and no client UPDATE grant; asserted in §4). The one
--      writer is hr_premium_grant, OWNER-ONLY (no client, service, engine or
--      tick grant): raise-only, journalled (one `admin` ledger row
--      `premium_grant`). The shop that sells premium is a later reviewed lane;
--      nothing in this file is callable by a player.
--   §2 THE STAMINA CAP FOLLOWS PREMIUM (src/data/hunt-sessions.js
--      STAMINA_MAX_MS { free: 8 h, premium: 12 h }, the generated limits rows
--      stamina_free_min / stamina_premium_min). hr_stamina_cap(user, slot, at)
--      is the cap at an instant; hr_stamina_of rests the pool PIECEWISE —
--      to the premium cap while premium_until is ahead, to the free cap after —
--      and never LOWERS it: a lapse keeps banked stamina above 8 h and only
--      stops it resting further (spec §3.10 #5). hr_stamina_view's max follows.
--   §3 hr_premium_view(user, slot): { until, active, perks, stamina_max_ms }.
--   §4 THE ENVELOPE'S SECTION REGISTRY (architecture contracts X7): ONE
--      anchored splice of hr_state_of (depth 0 → 1) makes it fold
--      hr_state_sections_of(user, slot) — every row of hr_state_sections
--      (key → a (uuid, integer) → jsonb view) — under its hand-written keys,
--      so a new envelope section is a ROW, never another body edit. A section
--      key that collides with a hand-written key is refused at registration
--      (§4 self-check) and, if one ever slipped in, the hand key wins (it is
--      the right operand of `||`). This file registers `premium`.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- A premium flag a player could set would be 4 h of stamina and the analyzer.
-- Closed: no grant to any client or engine role on the writer, no write path
-- on the column. The stamina functions only ever answer a cap from the column
-- the server wrote, at the instant asked. Nothing here moves gold, items or XP.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_stamina_of / hr_stamina_view from 2026-10-22-hunt-sessions-
-- settle.sql §1b (they read stamina_max_min, which the S1 catalogue retired:
-- restore that limits row first); drop hr_premium_*, hr_stamina_cap,
-- hr_state_sections_of and hr_state_sections; re-apply hr_state_of from
-- 2026-10-22-hunt-sessions-delete-away.sql. The column may stay (inert).
--
-- ORDER: after 2026-10-23-hunt-sessions-catalogue.generated.sql (the two
-- stamina rows). No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if public.hr_hunt_limit('stamina_free_min') is null or public.hr_hunt_limit('stamina_premium_min') is null then
    raise exception 'PRECONDITION: no stamina_free_min / stamina_premium_min limits row — apply 2026-10-23-hunt-sessions-catalogue.generated.sql first';
  end if;
  if to_regprocedure('public.hr_state_of(uuid,integer)') is null
     or to_regprocedure('public.hr_stamina_of(uuid,integer,timestamp with time zone)') is null
     or to_regprocedure('public.hr_stamina_view(uuid,integer)') is null then
    raise exception 'PRECONDITION: hr_state_of / hr_stamina_of / hr_stamina_view is absent (2026-10-22-hunt-sessions-settle.sql)';
  end if;
end $mig$;

-- ── §1 THE COLUMN ────────────────────────────────────────────────────────────
alter table public.player_state add column if not exists premium_until timestamptz;
comment on column public.player_state.premium_until is
  '2026-10-23 (lane S1, Tyler 2026-10-17). Premium for THIS character until this instant; null = free. '
  'Server-written only (hr_premium_grant, owner-only, raise-only, journalled). Read by hr_stamina_cap, '
  'hr_premium_view and the analyzer gate.';

-- Is the character premium at `p_at`?
create or replace function public.hr_premium_active(p_user uuid, p_slot int, p_at timestamptz)
returns boolean language sql stable set search_path = public, pg_catalog as $$
  select coalesce((select ps.premium_until > coalesce(p_at, now()) from public.player_state ps
                    where ps.user_id = p_user and ps.slot = p_slot), false)
$$;
revoke execute on function public.hr_premium_active(uuid, int, timestamptz) from public, anon, authenticated, service_role;

-- THE ONE WRITER. Raise-only: a grant extends premium to `p_until` or leaves a
-- later instant alone; it never shortens it. One `admin` ledger row per grant.
create or replace function public.hr_premium_grant(p_user uuid, p_slot int, p_until timestamptz, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_was timestamptz; v_now timestamptz;
begin
  if p_user is null or p_slot is null or p_until is null then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_slot::text, 0));
  select premium_until into v_was from public.player_state where user_id = p_user and slot = p_slot for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  update public.player_state
     set premium_until = greatest(coalesce(premium_until, p_until), p_until), version = version + 1, updated_at = now()
   where user_id = p_user and slot = p_slot
   returning premium_until into v_now;
  insert into public.player_ledger (user_id, slot, kind, intent, meta)
    values (p_user, p_slot, 'admin', 'premium_grant',
            jsonb_build_object('was', v_was, 'until', v_now, 'reason', left(coalesce(p_reason, ''), 64)));
  return jsonb_build_object('ok', true, 'premium_until', v_now);
end $$;
revoke execute on function public.hr_premium_grant(uuid, int, timestamptz, text) from public;
revoke execute on function public.hr_premium_grant(uuid, int, timestamptz, text) from anon, authenticated, service_role;
do $mig$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    execute 'revoke execute on function public.hr_premium_grant(uuid, int, timestamptz, text) from hr_engine'; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    execute 'revoke execute on function public.hr_premium_grant(uuid, int, timestamptz, text) from hr_tick'; end if;
end $mig$;

-- ── §2 THE STAMINA CAP FOLLOWS PREMIUM ───────────────────────────────────────
-- The cap the pool rests to AT an instant, in ms.
create or replace function public.hr_stamina_cap(p_user uuid, p_slot int, p_at timestamptz)
returns bigint language sql stable set search_path = public, pg_catalog as $$
  select (case when public.hr_premium_active(p_user, p_slot, p_at)
               then public.hr_hunt_limit('stamina_premium_min') else public.hr_hunt_limit('stamina_free_min') end)::bigint * 60000
$$;
revoke execute on function public.hr_stamina_cap(uuid, int, timestamptz) from public, anon, authenticated, service_role;

-- The pool at `p_at`, given that nothing HUNTED between stamina_at and p_at
-- (true by construction: while a session is open stamina_at = its settled_to).
-- REST IS PIECEWISE: up to the premium cap while premium_until is ahead, then
-- up to the free cap. Rest never LOWERS a value: a pool above the free cap
-- when premium lapses is kept, and rests no further until it is below it.
-- Null when a cap row is missing — callers refuse.
create or replace function public.hr_stamina_of(p_user uuid, p_slot int, p_at timestamptz)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_ms   bigint; v_sat timestamptz; v_pu timestamptz;
  v_free bigint := public.hr_hunt_limit('stamina_free_min')::bigint * 60000;
  v_prem bigint := public.hr_hunt_limit('stamina_premium_min')::bigint * 60000;
  v_mid  timestamptz;
begin
  if v_free is null or v_prem is null then return null; end if;
  select ps.stamina_ms, ps.stamina_at, ps.premium_until into v_ms, v_sat, v_pu
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  if not found then return null; end if;
  if v_sat is null then return public.hr_stamina_cap(p_user, p_slot, p_at); end if;
  if p_at is null or p_at <= v_sat then return v_ms; end if;
  -- [stamina_at, min(p_at, premium_until)) rests to the premium cap.
  if v_pu is not null and v_pu > v_sat then
    v_mid := least(p_at, v_pu);
    v_ms := greatest(v_ms, least(v_prem, v_ms + floor(extract(epoch from (v_mid - v_sat)) * 1000)::bigint));
    v_sat := v_mid;
  end if;
  -- [.., p_at) rests to the free cap.
  if p_at > v_sat then
    v_ms := greatest(v_ms, least(v_free, v_ms + floor(extract(epoch from (p_at - v_sat)) * 1000)::bigint));
  end if;
  return v_ms;
end $$;
revoke execute on function public.hr_stamina_of(uuid, int, timestamptz) from public, anon, authenticated, service_role;

-- What the envelope shows (display = the server's value, CLAUDE.md §6). While
-- a session is HUNTING the value is the one its last settle wrote, at its
-- settled_to; otherwise the pool now. `max_ms` is the character's cap there.
create or replace function public.hr_stamina_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_s   public.hunt_sessions%rowtype;
  v_hunting boolean;
  v_at  timestamptz;
begin
  select * into v_s from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is null;
  v_hunting := found and now() >= v_s.hunt_from;
  v_at := case when v_hunting then v_s.settled_to else now() end;
  return jsonb_build_object(
    'ms', public.hr_stamina_of(p_user, p_slot, v_at),
    'at', v_at,
    'max_ms', public.hr_stamina_cap(p_user, p_slot, v_at),
    'hunting', v_hunting);
end $$;
revoke execute on function public.hr_stamina_view(uuid, int) from public, anon, authenticated, service_role;

-- ── §3 THE PREMIUM SECTION ───────────────────────────────────────────────────
create or replace function public.hr_premium_view(p_user uuid, p_slot int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    'until', ps.premium_until,
    'active', coalesce(ps.premium_until > now(), false),
    'stamina_max_ms', public.hr_stamina_cap(p_user, p_slot, now()),
    'perks', jsonb_build_object('analyzer', coalesce(ps.premium_until > now(), false),
                                'outfits', coalesce(ps.premium_until > now(), false),
                                'login', coalesce(ps.premium_until > now(), false)))
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot
$$;
revoke execute on function public.hr_premium_view(uuid, int) from public, anon, authenticated, service_role;

-- ── §4 THE ENVELOPE'S SECTION REGISTRY (architecture contracts X7) ──────────
create table if not exists public.hr_state_sections (
  key  text primary key check (key ~ '^[a-z_]{1,40}$'),
  fn   text not null check (fn ~ '^hr_[a-z0-9_]{1,60}$'),
  note text not null
);
alter table public.hr_state_sections enable row level security;
revoke all on public.hr_state_sections from public, anon, authenticated, service_role;
comment on table public.hr_state_sections is
  '2026-10-23 (lane S1, architecture contracts X7). One row per envelope section hr_state_of folds in: '
  'key -> a public.<fn>(uuid, integer) returning jsonb. A new section is a row, never a body edit.';

-- Every registered section of (user, slot), as one object. A section whose
-- view errors is a defect, not a default: it raises.
create or replace function public.hr_state_sections_of(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare v_out jsonb := '{}'::jsonb; v_r record; v_v jsonb;
begin
  for v_r in select key, fn from public.hr_state_sections order by key loop
    execute format('select public.%I($1, $2)', v_r.fn) into v_v using p_user, p_slot;
    v_out := v_out || jsonb_build_object(v_r.key, v_v);
  end loop;
  return v_out;
end $$;
revoke execute on function public.hr_state_sections_of(uuid, int) from public, anon, authenticated, service_role;

insert into public.hr_state_sections (key, fn, note) values
  ('premium', 'hr_premium_view', '2026-10-23-character-premium.sql: premium_until, active, the stamina cap and the perks')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ONE anchored splice: hr_state_of folds the registry under its own keys.
do $mig$
declare
  v_def text; v_n int;
  c_old constant text := $a$  return jsonb_build_object(
    'ok', true,
    'version', v_st.version,$a$;
  c_new constant text := $a$  -- ── THE SECTION REGISTRY (architecture contracts X7; 2026-10-23-character-premium.sql):
  --    every hr_state_sections row, folded UNDER the hand-written keys below.
  return public.hr_state_sections_of(p_user, v_st.slot) || jsonb_build_object(
    'ok', true,
    'version', v_st.version,$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,integer)'::regprocedure), chr(13), '');
  if strpos(v_def, 'hr_state_sections_of') > 0 then raise notice 'hr_state_of already folds the section registry — edit skipped'; return; end if;
  v_n := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
  if v_n <> 1 then raise exception 'hr_state_of: the envelope-root anchor matched % times (need 1) — the body moved', v_n; end if;
  execute replace(v_def, c_old, c_new);
end $mig$;
revoke execute on function public.hr_state_of(uuid, int) from public;
revoke execute on function public.hr_state_of(uuid, int) from anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_uid   constant uuid := '000000c0-0000-0000-0000-00005e1a0001';
  v       jsonb;
  v_free  bigint := public.hr_hunt_limit('stamina_free_min')::bigint * 60000;
  v_prem  bigint := public.hr_hunt_limit('stamina_premium_min')::bigint * 60000;
  v_t0    timestamptz := date_trunc('milliseconds', now()) - interval '30 hours';
  v_role  text;
  v_keys  text[];
begin
  if v_prem <> 12 * 3600000 or v_free <> 8 * 3600000 then
    raise exception 'VERIFY(a): the stamina caps are % / % ms, not hunt-sessions.js 8 h / 12 h', v_free, v_prem; end if;
  -- (b) NO CLIENT WRITE: no UPDATE grant on player_state, no client write policy,
  --     the writer reachable by no client, service, engine or tick role.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_column_privilege(v_role, 'public.player_state', 'premium_until', 'update')
       or has_table_privilege(v_role, 'public.player_state', 'update,insert') then
      raise exception 'VERIFY(b): % can write player_state.premium_until', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_state' and cmd in ('UPDATE', 'INSERT', 'ALL')) then
    raise exception 'VERIFY(b): player_state carries a client write policy'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role)
       and has_function_privilege(v_role, 'public.hr_premium_grant(uuid,integer,timestamp with time zone,text)', 'execute') then
      raise exception 'VERIFY(b): % can execute hr_premium_grant', v_role; end if;
  end loop;
  -- (c) EXECUTED: the cap follows premium, rest is piecewise, a lapse keeps banked stamina.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'character-premium §5 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): hr_create_character refused: %', v; end if;
    -- a free character: full = 8 h; rests to 8 h, never past it.
    if public.hr_stamina_of(v_uid, 0, now()) <> v_free then raise exception 'VERIFY(c): a fresh free pool is not 8 h'; end if;
    update public.player_state set stamina_ms = 0, stamina_at = v_t0 where user_id = v_uid and slot = 0;
    if public.hr_stamina_of(v_uid, 0, v_t0 + interval '10 hours') <> v_free then
      raise exception 'VERIFY(c): a free pool rested past 8 h'; end if;
    -- premium for the whole rest: up to 12 h.
    perform public.hr_premium_grant(v_uid, 0, v_t0 + interval '20 hours', 'probe');
    if public.hr_stamina_of(v_uid, 0, v_t0 + interval '13 hours') <> v_prem then
      raise exception 'VERIFY(c): a premium pool did not rest to 12 h'; end if;
    -- a lapse: rested 12 h by 12 h in, premium ends at 20 h; at 25 h the pool KEEPS 12 h.
    if public.hr_stamina_of(v_uid, 0, v_t0 + interval '25 hours') <> v_prem then
      raise exception 'VERIFY(c): a lapse removed banked stamina (% ms)', public.hr_stamina_of(v_uid, 0, v_t0 + interval '25 hours'); end if;
    -- piecewise: premium ending at 3 h from 0 -> 3 h banked, then free rest to 8 h at most.
    update public.player_state set premium_until = v_t0 + interval '3 hours' where user_id = v_uid and slot = 0;
    if public.hr_stamina_of(v_uid, 0, v_t0 + interval '5 hours') <> 5 * 3600000::bigint
       or public.hr_stamina_of(v_uid, 0, v_t0 + interval '29 hours') <> v_free then
      raise exception 'VERIFY(c): piecewise rest is wrong'; end if;
    -- the cap and the view follow the column at the instant.
    if public.hr_stamina_cap(v_uid, 0, v_t0 + interval '1 hour') <> v_prem
       or public.hr_stamina_cap(v_uid, 0, v_t0 + interval '4 hours') <> v_free then
      raise exception 'VERIFY(c): hr_stamina_cap does not follow premium_until'; end if;
    -- a grant is raise-only and journalled.
    perform public.hr_premium_grant(v_uid, 0, v_t0, 'probe-earlier');
    if (select premium_until from public.player_state where user_id = v_uid and slot = 0) <> v_t0 + interval '3 hours' then
      raise exception 'VERIFY(c): a grant shortened premium'; end if;
    if (select count(*) from public.player_ledger where user_id = v_uid and kind = 'admin' and intent = 'premium_grant') <> 2 then
      raise exception 'VERIFY(c): a premium grant was not journalled once'; end if;
    -- (d) the envelope carries `premium` from the registry, under the hand keys.
    perform public.hr_premium_grant(v_uid, 0, now() + interval '1 day', 'probe-now');
    v := public.hr_state_of(v_uid, 0);
    if v->'premium' is null or (v->'premium'->>'active')::boolean is distinct from true
       or (v->'premium'->>'stamina_max_ms')::bigint <> v_prem or (v->'stamina'->>'max_ms')::bigint <> v_prem then
      raise exception 'VERIFY(d): the envelope does not project premium / the premium cap: %', v->'premium'; end if;
    -- No hand-written key shadows a section: each section reads exactly its view's answer.
    select array_agg(s.key) into v_keys from public.hr_state_sections s
     where v->s.key is distinct from public.hr_state_sections_of(v_uid, 0)->s.key;
    if v_keys is not null then raise exception 'VERIFY(d): section(s) % are shadowed by a hand-written envelope key', v_keys; end if;
    raise exception using errcode = 'HR856', message = 'character-premium §5 complete - rolling back';
  exception when sqlstate 'HR856' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid) or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY(e): §5 LEAKED a probe row'; end if;
  -- (f) the registry: every section names a (uuid, integer) function.
  if exists (select 1 from public.hr_state_sections s where to_regprocedure('public.' || s.fn || '(uuid,integer)') is null) then
    raise exception 'VERIFY(f): a section names no (uuid, integer) view'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_state_sections_of(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_premium_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_stamina_cap(uuid,integer,timestamp with time zone)', 'execute') then
      raise exception 'VERIFY(f): % can execute a premium / section internal', v_role; end if;
    if has_table_privilege(v_role, 'public.hr_state_sections', 'select,insert,update,delete') then
      raise exception 'VERIFY(f): % reaches hr_state_sections', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'character-premium: premium per character, server-written only; stamina 8 h free / 12 h premium, piecewise, a lapse keeps banked stamina; premium section registered; all green';
end $$;
