-- ════════════════════════════════════════════════════════════════════════
-- 2027-03-21-feature-switches.sql — SERVER FEATURE SWITCHES: A FEATURE IS ON FOR NOBODY, SOME ACCOUNTS, THE TESTERS OR EVERYONE, AND THE
--   SERVER ALONE DECIDES (lane/c-scaled-hunts, backend-architect, 2026-11-07; Tyler 2026-11-07 approved "server feature switches"; the
--   Coordinator's brief the same day: their own system, scaled hunts the first user).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on its
-- passing §5. ON THE EA SECURITY LIST: it decides who reaches a feature (the first one a gold purchase). EDGE: none. CLIENT: none yet (the
-- `features` section is projected; a client reader comes with the first UI it hides).
-- ORDER: before 2027-03-21-scaled-hunts-catalogue.generated.sql and 2027-03-21-scaled-hunts.sql (scaled hunts seeds and reads its switch here).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_feature_switches (NEW): one row per switch: switch_id, scope (off | accounts | testers | everyone), accounts (the account ids `accounts`
--     names), note, updated_at. RLS on, NO policy and NO privilege for any client role or service_role: the owner is the only writer, so a
--     switch moves only through a migration the Coordinator applies. A missing row is OFF (the safe direction).
--   hr_feature_on(switch, account) -> boolean   THE ONE READ every RPC and the settle call: off -> false; accounts -> the account is listed;
--     testers -> the account is on the access allowlist (hr_access_allowlist); everyone -> true. Server-only.
--   hr_features_view(user, slot) -> jsonb       the section `features`: the ids of every switch on for this hero's account, sorted, so a client
--     can hide or show a door. The client decides nothing: every verb and the settle ask hr_feature_on themselves.
--
-- ── HOW A SWITCH MOVES (the Coordinator's, never an agent's or a client's) ───
-- A tiny dated migration per change, applied through tools/apply-migration.mjs, e.g.
--     update public.hr_feature_switches set scope = 'testers', accounts = '{}', updated_at = now() where switch_id = 'scaled_hunts';
-- with a one-line self-check that reads it back (do $$ begin if not public.hr_feature_on(...) ... end $$). No release, no deploy: the next
-- verb, settle and envelope read the row.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None reachable from a client: no grant, no policy, no verb writes the table; the section names only switches already on for the caller's own
-- account. A switch gates a door, never a number: a feature's own server checks still run when it is on.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- A PK read per hr_feature_on (plus one PK read of the allowlist for `testers`); the section is one scan of a table of a handful of rows.
--
-- REVERSIBILITY: drop the section row, hr_features_view, hr_feature_on and hr_feature_switches (every feature that reads it first).
-- No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_access_allowlist') is null or to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: the access allowlist (2026-10-21-closed-mode.sql) and the section registry first'; end if;
end $mig$;

-- ── §1 THE TABLE ─────────────────────────────────────────────────────────────
create table if not exists public.hr_feature_switches (
  switch_id  text        primary key check (switch_id ~ '^[a-z0-9_]{1,64}$'),
  scope      text        not null default 'off' check (scope in ('off', 'accounts', 'testers', 'everyone')),
  accounts   uuid[]      not null default '{}' check (cardinality(accounts) <= 200),
  note       text        check (note is null or length(note) <= 300),
  updated_at timestamptz not null default now()
);
alter table public.hr_feature_switches enable row level security;
revoke all on public.hr_feature_switches from public, anon, authenticated, service_role;
comment on table public.hr_feature_switches is
  '2027-03-21-feature-switches.sql: who a server feature is on for (off, accounts, testers = hr_access_allowlist, everyone). Read through hr_feature_on only. Written only by the owner, through a migration the Coordinator applies; no client or service_role privilege, no policy. A missing row is off.';

-- ── §2 THE READ ──────────────────────────────────────────────────────────────
create or replace function public.hr_feature_on(p_switch text, p_user uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_scope text; v_accounts uuid[];
begin
  if p_switch is null or p_user is null then return false; end if;
  select f.scope, f.accounts into v_scope, v_accounts from public.hr_feature_switches f where f.switch_id = p_switch;
  return case v_scope
    when 'everyone' then true
    when 'testers'  then exists (select 1 from public.hr_access_allowlist a where a.user_id = p_user)
    when 'accounts' then p_user = any (v_accounts)
    else false end;
end $fn$;

create or replace function public.hr_features_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  return coalesce((select jsonb_agg(f.switch_id order by f.switch_id) from public.hr_feature_switches f
                    where f.scope <> 'off' and public.hr_feature_on(f.switch_id, p_user)), '[]'::jsonb);
end $fn$;
insert into public.hr_state_sections (key, fn, note) values
  ('features', 'hr_features_view', '2027-03-21-feature-switches.sql: the server feature switches on for this account (ids), so a client can hide or show a door; the server still decides')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §3 GRANTS: nobody but the owner ──────────────────────────────────────────
do $grants$
declare v_sig text;
begin
  foreach v_sig in array array['public.hr_feature_on(text,uuid)', 'public.hr_features_view(uuid,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    if exists (select 1 from pg_roles where rolname = 'hr_engine') then execute format('revoke all on function %s from hr_engine', v_sig); end if;
    if exists (select 1 from pg_roles where rolname = 'hr_tick') then execute format('revoke all on function %s from hr_tick', v_sig); end if;
  end loop;
end $grants$;

-- ── §4 (no rows: each feature seeds its own switch, off, `on conflict do nothing`, so a re-apply never reverts the Coordinator's flip) ──

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) no client role and no service_role holds any privilege on the table or the two functions, and the table has no policy
-- (b) a missing switch and an `off` one are off for everyone; `accounts` is on for the listed account only; `testers` for an allowlisted
--     account only; `everyone` for any account, a stranger included
-- (c) the section lists exactly the switches on for the account, sorted, and nothing for one they're off for
do $$
declare
  c_in   constant uuid := '000000c0-0000-4000-a000-0000f5e70001';   -- on the allowlist
  c_out  constant uuid := '000000c0-0000-4000-a000-0000f5e70002';   -- a stranger
  v_role text; v_sig text;
begin
  -- (a)
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'public.hr_feature_switches', 'select,insert,update,delete,truncate,references,trigger') then
      raise exception 'feature-switches §5(a): % holds a privilege on hr_feature_switches', v_role; end if;
    foreach v_sig in array array['public.hr_feature_on(text,uuid)', 'public.hr_features_view(uuid,integer)'] loop
      if has_function_privilege(v_role, v_sig::regprocedure, 'execute') then raise exception 'feature-switches §5(a): % reaches %', v_role, v_sig; end if;
    end loop;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_feature_switches') then
    raise exception 'feature-switches §5(a): hr_feature_switches carries a policy'; end if;
  begin
    insert into auth.users (id) values (c_in), (c_out) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_in, 'feature-switches §5 probe') on conflict (user_id) do nothing;
    insert into public.hr_feature_switches (switch_id, scope) values ('zz_probe_a', 'off'), ('zz_probe_b', 'off');
    -- (b)
    if public.hr_feature_on('zz_probe_none', c_in) or public.hr_feature_on('zz_probe_a', c_in) or public.hr_feature_on(null, c_in)
       or public.hr_feature_on('zz_probe_a', null) then
      raise exception 'feature-switches §5(b): a missing or off switch reads on'; end if;
    update public.hr_feature_switches set scope = 'accounts', accounts = array[c_out] where switch_id = 'zz_probe_a';
    if not public.hr_feature_on('zz_probe_a', c_out) or public.hr_feature_on('zz_probe_a', c_in) then
      raise exception 'feature-switches §5(b): `accounts` is not the listed account alone'; end if;
    update public.hr_feature_switches set scope = 'testers', accounts = '{}' where switch_id = 'zz_probe_a';
    if not public.hr_feature_on('zz_probe_a', c_in) or public.hr_feature_on('zz_probe_a', c_out) then
      raise exception 'feature-switches §5(b): `testers` is not the allowlist alone'; end if;
    update public.hr_feature_switches set scope = 'everyone' where switch_id = 'zz_probe_b';
    if not public.hr_feature_on('zz_probe_b', c_out) or not public.hr_feature_on('zz_probe_b', c_in) then
      raise exception 'feature-switches §5(b): `everyone` is not on for everyone'; end if;
    -- (c)
    if (select jsonb_agg(x order by x) from jsonb_array_elements_text(public.hr_features_view(c_in, 0)) x where x like 'zz\_probe%')
         is distinct from '["zz_probe_a", "zz_probe_b"]'::jsonb
       or (select jsonb_agg(x order by x) from jsonb_array_elements_text(public.hr_features_view(c_out, 0)) x where x like 'zz\_probe%')
         is distinct from '["zz_probe_b"]'::jsonb then
      raise exception 'feature-switches §5(c): the section reads % and %', public.hr_features_view(c_in, 0), public.hr_features_view(c_out, 0); end if;
    raise exception using errcode = 'HR922', message = 'feature-switches §5 complete - rolling back';
  exception when sqlstate 'HR922' then
    null;
  end;
  if exists (select 1 from public.hr_feature_switches where switch_id like 'zz\_probe%') then
    raise exception 'feature-switches §5: LEAKED a probe switch'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'feature-switches: owner-written, off unless a scope says so, one read for every door; all green';
end $$;
