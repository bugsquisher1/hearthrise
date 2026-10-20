-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — ONE NAME REGISTRY: A DISPLAY NAME AND A CHARACTER NAME SHARE
-- ONE NAMESPACE (lane/c-name-registry, backend-architect, 2026-10-20; MED from
-- the pre-reopen Security review). STAGED. Game CLOSED: applies on its passing
-- §4; part of the reopen gate's Security review.
--
-- ── THE FINDING ─────────────────────────────────────────────────────────────
-- 2026-10-25-account-items.sql made hr_character_name_set refuse ANOTHER
-- account's display name, but claim_display_name never looked at
-- character_names. Mallory could claim the display name "Bob" while Bob's
-- character is named "Bob": party, chat and inspect then showed two "Bob"s, and
-- hr_character_by_name (invites, whispers) resolved "Bob" to Bob's character.
-- One direction checked, the other not: two namespaces, kept apart by a check
-- in one writer.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 hr_name_registry(canonical PRIMARY KEY, user_id): THE one unique index over
--    the canonical name (hr_canon_display_name — the key both writers already
--    compute through hr_validate_display_name). A canonical name belongs to ONE
--    account. That account may wear it as its display name AND as one of its
--    characters' names (slot 0 shows the display name by default); no other
--    account may wear it anywhere.
-- §2 display_names(canonical, user_id) and character_names(canonical, user_id)
--    each REFERENCE hr_name_registry(canonical, user_id): the database, not a
--    writer, holds the invariant — a row naming a canonical owned by another
--    account cannot exist, whatever path writes it.
-- §3 The claim (BEFORE trigger on both tables): registers the canonical for the
--    writer's account, or raises unique_violation (23505) when another account
--    owns it — which every existing writer already maps to its existing refusal:
--    claim_display_name -> 'taken', hr_character_name_set -> 'name_taken',
--    hr_mod_force_rename -> tries the next placeholder. It also refuses
--    (23514) a row whose canonical is not hr_canon_display_name(name): one
--    normalisation in both directions. character_names gains the display-name
--    backstop trigger (hr_name_guard: charset + blocklist) display_names has.
--    The release (AFTER trigger): a canonical neither table still wears goes
--    back to the pool (a rename frees the old name, as it did before).
-- §3b hr_display_name_available__ungated (the UX probe) reads the registry, so
--    it no longer says "available" for another account's character name.
--    Restated from its LATEST body (2026-10-11-name-moderation.sql §6, md5
--    pinned in §0); the delta is the one marked line.
-- No RPC signature, grant or error code changes. claim_display_name__ungated,
-- hr_character_name_set and hr_mod_force_rename are NOT restated: their
-- existing `exception when unique_violation` blocks are the refusal path.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- Two claims of one canonical serialise on the registry's primary key (insert
-- ... on conflict do nothing waits for the other's commit, then sees its owner).
-- The claim holds FOR KEY SHARE on the registry row to its commit, so a
-- concurrent release by the same account cannot delete a row a new claim is
-- about to reference; a release that loses that race gets foreign_key_violation
-- from the NO ACTION FK and leaves the row in place (caught, no error surfaces).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Smaller: the cross-namespace impersonation is closed in both directions and
-- for any future writer. The registry is server-only (RLS on, no policy, every
-- client and service_role privilege revoked); the two trigger functions are
-- nobody's to EXECUTE. Moves no value.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- One row per distinct worn name (<= 1 display + 4 characters per account):
-- ~5 rows x ~80 B per account; 100x today's accounts is well under 1 MB. One
-- PK probe per name write; renames are rare.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Drop the four triggers (hr_display_names_name_registry_claim / _release,
-- hr_character_names_name_registry_claim / _release, hr_character_names_name_guard),
-- the two FKs (display_names_name_registry_fk, character_names_name_registry_fk),
-- the two trigger functions and the table; re-apply hr_display_name_available__ungated
-- from 2026-10-11-name-moderation.sql. A future wipe lists hr_name_registry next
-- to display_names / character_names (its user_id column makes the wipe's
-- unknown-table guard ask).
-- ORDER: after 2026-10-29-party-security.sql (needs 2026-10-25-account-items.sql
-- and 2026-10-11-name-moderation.sql). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if to_regclass('public.character_names') is null or to_regclass('public.display_names') is null
     or to_regprocedure('public.hr_canon_display_name(text)') is null or to_regprocedure('public.hr_name_guard()') is null
     or to_regprocedure('public.hr_character_name_set(integer,text,uuid)') is null
     or to_regprocedure('public.claim_display_name__ungated(text)') is null then
    raise exception 'PRECONDITION: apply 2026-10-11-name-moderation.sql and 2026-10-25-account-items.sql first'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_display_name_available__ungated(text)'::regprocedure;
  if md5(v_src) <> '3e96f492176ad0934480b415860442bd' and strpos(v_src, 'NAME-REGISTRY') = 0 then
    raise exception 'PIN: hr_display_name_available__ungated moved (md5 %) - restate from its latest body', md5(v_src); end if;
end $mig$;

-- ── §1 THE REGISTRY ─────────────────────────────────────────────────────────
create table if not exists public.hr_name_registry (
  canonical  text primary key check (length(canonical) >= 3),
  user_id    uuid not null,
  claimed_at timestamptz not null default now(),
  constraint hr_name_registry_owner_key unique (canonical, user_id)
);
alter table public.hr_name_registry enable row level security;
revoke all on public.hr_name_registry from public, anon, authenticated, service_role;
comment on table public.hr_name_registry is
  '2026-10-30-name-registry.sql: ONE namespace for display and character names. canonical = hr_canon_display_name; '
  'one owning account; display_names and character_names reference (canonical, user_id). Written only by the '
  'hr_name_registry_claim / _release triggers. Server-only.';

-- Backfill what is worn today. display_names first (the older namespace, and a
-- display name is the account's own); then character names not already owned.
insert into public.hr_name_registry (canonical, user_id, claimed_at)
select d.canonical, d.user_id, d.claimed_at from public.display_names d
on conflict (canonical) do nothing;
insert into public.hr_name_registry (canonical, user_id, claimed_at)
select c.canonical, c.user_id, c.updated_at from public.character_names c
on conflict (canonical) do nothing;

-- ── §2 THE INVARIANT, HELD BY THE DATABASE ──────────────────────────────────
-- Added NOT VALID, then VALIDATED when every existing row complies. A row that
-- already collides across accounts (the finding, if anyone exercised it) keeps
-- the FK unvalidated and is reported by count only (no names); every NEW write
-- is checked either way.
do $mig$
declare v_bad bigint;
begin
  if not exists (select 1 from pg_constraint where conname = 'display_names_name_registry_fk'
                   and conrelid = 'public.display_names'::regclass) then
    alter table public.display_names add constraint display_names_name_registry_fk
      foreign key (canonical, user_id) references public.hr_name_registry (canonical, user_id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'character_names_name_registry_fk'
                   and conrelid = 'public.character_names'::regclass) then
    alter table public.character_names add constraint character_names_name_registry_fk
      foreign key (canonical, user_id) references public.hr_name_registry (canonical, user_id) not valid;
  end if;
  select count(*) into v_bad from public.display_names d
   where not exists (select 1 from public.hr_name_registry r where r.canonical = d.canonical and r.user_id = d.user_id);
  if v_bad = 0 and not (select convalidated from pg_constraint where conname = 'display_names_name_registry_fk'
                          and conrelid = 'public.display_names'::regclass) then
    alter table public.display_names validate constraint display_names_name_registry_fk;
  end if;
  select count(*) into v_bad from public.character_names c
   where not exists (select 1 from public.hr_name_registry r where r.canonical = c.canonical and r.user_id = c.user_id);
  if v_bad = 0 and not (select convalidated from pg_constraint where conname = 'character_names_name_registry_fk'
                          and conrelid = 'public.character_names'::regclass) then
    alter table public.character_names validate constraint character_names_name_registry_fk;
  elsif v_bad > 0 then
    raise notice 'name-registry: % character name(s) already wear another account''s name; FK left NOT VALID, new writes checked', v_bad;
  end if;
end $mig$;

-- ── §3 THE CLAIM AND THE RELEASE ────────────────────────────────────────────
create or replace function public.hr_name_registry_claim()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_owner uuid;
  v_try   int := 0;
begin
  -- One normalisation in both namespaces: the stored key IS the name's canonical form.
  if new.canonical is distinct from public.hr_canon_display_name(new.name) then
    raise exception 'name_canonical' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.canonical = old.canonical and new.user_id = old.user_id then return new; end if;
  loop
    insert into public.hr_name_registry (canonical, user_id) values (new.canonical, new.user_id)
      on conflict (canonical) do nothing;
    -- KEY SHARE to commit: a concurrent release cannot delete what this row will reference.
    select r.user_id into v_owner from public.hr_name_registry r where r.canonical = new.canonical for key share;
    exit when found;
    v_try := v_try + 1;   -- released between the two statements: claim again
    if v_try >= 3 then raise exception 'name_registry_contended' using errcode = '40001'; end if;
  end loop;
  if v_owner <> new.user_id then
    -- Another account wears it. Every writer maps unique_violation to its refusal.
    raise exception 'name_taken' using errcode = '23505', constraint = 'hr_name_registry_pkey';
  end if;
  return new;
end $$;
revoke execute on function public.hr_name_registry_claim() from public;
revoke execute on function public.hr_name_registry_claim() from anon, authenticated, service_role;

create or replace function public.hr_name_registry_release()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if tg_op = 'UPDATE' and new.canonical = old.canonical and new.user_id = old.user_id then return null; end if;
  begin
    delete from public.hr_name_registry r
     where r.canonical = old.canonical and r.user_id = old.user_id
       and not exists (select 1 from public.display_names d where d.canonical = old.canonical)
       and not exists (select 1 from public.character_names c where c.canonical = old.canonical);
  exception when foreign_key_violation then
    null;   -- the owner wears it again in a concurrent transaction: it stays theirs
  end;
  return null;
end $$;
revoke execute on function public.hr_name_registry_release() from public;
revoke execute on function public.hr_name_registry_release() from anon, authenticated, service_role;

drop trigger if exists hr_display_names_name_registry_claim on public.display_names;
create trigger hr_display_names_name_registry_claim
  before insert or update of canonical, user_id, name on public.display_names
  for each row execute function public.hr_name_registry_claim();
drop trigger if exists hr_display_names_name_registry_release on public.display_names;
create trigger hr_display_names_name_registry_release
  after update of canonical, user_id or delete on public.display_names
  for each row execute function public.hr_name_registry_release();
drop trigger if exists hr_character_names_name_registry_claim on public.character_names;
create trigger hr_character_names_name_registry_claim
  before insert or update of canonical, user_id, name on public.character_names
  for each row execute function public.hr_name_registry_claim();
drop trigger if exists hr_character_names_name_registry_release on public.character_names;
create trigger hr_character_names_name_registry_release
  after update of canonical, user_id or delete on public.character_names
  for each row execute function public.hr_name_registry_release();
-- The display-name backstop (charset, blocklist; 2026-10-11-name-moderation.sql §7) for characters too.
drop trigger if exists hr_character_names_name_guard on public.character_names;
create trigger hr_character_names_name_guard
  before insert or update of name on public.character_names
  for each row execute function public.hr_name_guard();

-- ── §3b THE AVAILABILITY PROBE READS THE ONE REGISTRY ───────────────────────
-- Restated from 2026-10-11-name-moderation.sql §6 (md5 pinned in §0).
create or replace function public.hr_display_name_available__ungated(p_name text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_val   jsonb;
  v_canon text;
  v_owner uuid;
begin
  v_val := public.hr_validate_display_name(p_name);
  if not (v_val->>'ok')::boolean then
    if v_val->>'reason' = 'blocked' then
      return jsonb_build_object('ok', false, 'error', 'name_blocked');   -- (2026-10-11)
    end if;
    return jsonb_build_object('ok', false, 'error', 'invalid', 'reason', v_val->>'reason');
  end if;
  v_canon := v_val->>'canonical';
  -- NAME-REGISTRY (2026-10-30): display AND character names, one owner.
  select user_id into v_owner from public.hr_name_registry where canonical = v_canon;
  return jsonb_build_object(
    'ok', true,
    'available', (v_owner is null or v_owner = auth.uid()),
    'mine', (v_owner is not null and v_owner = auth.uid()),
    'name', v_val->>'name', 'canonical', v_canon);
end $$;
revoke execute on function public.hr_display_name_available__ungated(text) from public;
revoke execute on function public.hr_display_name_available__ungated(text) from anon, authenticated, service_role;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ─────────
do $mig$
declare
  v_a constant uuid := '000000c0-0000-4000-8000-0000000e1001';   -- "Bob": names a character first
  v_c constant uuid := '000000c0-0000-4000-8000-0000000e1002';   -- "Cara": claims a display name first
  v_m constant uuid := '000000c0-0000-4000-8000-0000000e1003';   -- "Mallory"
  v jsonb;
  v_role text;
  v_n int;
begin
  begin
    insert into auth.users (id) values (v_a), (v_c), (v_m) on conflict (id) do nothing;
    insert into public.profiles (id) values (v_a), (v_c), (v_m) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values
      (v_a, 'name-registry §4 probe'), (v_c, 'name-registry §4 probe'), (v_m, 'name-registry §4 probe')
      on conflict (user_id) do nothing;
    delete from public.hr_rate_counters where user_id in (v_a, v_c, v_m);

    -- (a) THE FINDING: Bob's character wears "Registry Bob"; Mallory may not claim it as a display name,
    --     in any case or separator spelling.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    v := public.hr_character_name_set(0, 'Registry Bob', '000000c0-0000-4000-a000-0000000e0101');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): naming Bob''s character answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_m::text, true);
    v := public.claim_display_name('registry_BOB');
    if v->>'error' is distinct from 'taken' then
      raise exception 'VERIFY(a) DISPLAY->CHARACTER: a display name equal to another account''s character name answered %', v; end if;
    if exists (select 1 from public.display_names where user_id = v_m)
       or (select display_name from public.profiles where id = v_m) is not null then
      raise exception 'VERIFY(a): the refused display claim left a name behind'; end if;
    v := public.hr_display_name_available('Registry Bob');
    if (v->>'available')::boolean is distinct from false then
      raise exception 'VERIFY(a): the availability probe offers another account''s character name: %', v; end if;

    -- (b) THE REVERSE: Cara's display name; Mallory's character may not wear it.
    perform set_config('request.jwt.claim.sub', v_c::text, true);
    v := public.claim_display_name('Registry Cara');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): Cara''s claim answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_m::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character refused: %', v; end if;
    v := public.hr_character_name_set(0, 'registry.cara', '000000c0-0000-4000-a000-0000000e0201');
    if v->>'error' is distinct from 'name_taken' then
      raise exception 'VERIFY(b) CHARACTER->DISPLAY: a character name equal to another account''s display name answered %', v; end if;
    if exists (select 1 from public.character_names where user_id = v_m) then
      raise exception 'VERIFY(b): the refused character name was written'; end if;

    -- (c) ONE ACCOUNT MAY WEAR ITS OWN NAME TWICE (display + its character).
    delete from public.hr_rate_counters where user_id in (v_a, v_c, v_m);
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.claim_display_name('Registry Bob');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): Bob could not wear his character''s name: %', v; end if;
    if (select count(*) from public.hr_name_registry where canonical = 'registry bob' and user_id = v_a) <> 1 then
      raise exception 'VERIFY(c): the shared name is not one registry row owned by Bob'; end if;

    -- (d) THE RELEASE: the name goes back to the pool only when NEITHER table wears it.
    v := public.hr_character_name_set(0, 'Registry Abe', '000000c0-0000-4000-a000-0000000e0102');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): renaming Bob''s character answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_m::text, true);
    v := public.claim_display_name('Registry Bob');
    if v->>'error' is distinct from 'taken' then raise exception 'VERIFY(d): a name still worn as a display name was released: %', v; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.claim_display_name('Registry Al');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): Bob''s display rename answered %', v; end if;
    if exists (select 1 from public.hr_name_registry where canonical = 'registry bob') then
      raise exception 'VERIFY(d): a name nobody wears stayed registered'; end if;
    delete from public.hr_rate_counters where user_id in (v_a, v_c, v_m);
    perform set_config('request.jwt.claim.sub', v_m::text, true);
    v := public.claim_display_name('Registry Bob');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): a released name could not be claimed: %', v; end if;
    v := public.hr_character_name_set(0, 'Registry Abe', '000000c0-0000-4000-a000-0000000e0202');
    if v->>'error' is distinct from 'name_taken' then raise exception 'VERIFY(d): another account''s character name answered %', v; end if;

    -- (e) WHATEVER PATH WRITES: a direct definer-side row is held to the same registry and normalisation.
    begin
      insert into public.character_names (user_id, slot, name, canonical) values (v_m, 0, 'Registry Cara', 'registry cara');
      raise exception 'VERIFY(e): a direct character row took another account''s display name';
    exception when unique_violation then null;
    end;
    begin
      update public.display_names set canonical = 'registry abe', name = 'Registry Abe' where user_id = v_m;
      raise exception 'VERIFY(e): a direct display rename took another account''s character name';
    exception when unique_violation then null;
    end;
    begin
      insert into public.character_names (user_id, slot, name, canonical) values (v_m, 0, 'Registry Zed', 'registry zz');
      raise exception 'VERIFY(e): a row whose canonical is not its name''s was written';
    exception when check_violation then null;
    end;

    -- (f) PARITY: every worn name has its owner's registry row; no probe row is unworn.
    select count(*) into v_n from (
      select canonical, user_id from public.display_names where user_id in (v_a, v_c, v_m)
      union all select canonical, user_id from public.character_names where user_id in (v_a, v_c, v_m)) w
     where not exists (select 1 from public.hr_name_registry r where r.canonical = w.canonical and r.user_id = w.user_id);
    if v_n <> 0 then raise exception 'VERIFY(f): % worn name(s) without their owner''s registry row', v_n; end if;
    select count(*) into v_n from public.hr_name_registry r where r.user_id in (v_a, v_c, v_m)
       and not exists (select 1 from public.display_names d where d.canonical = r.canonical)
       and not exists (select 1 from public.character_names c where c.canonical = r.canonical);
    if v_n <> 0 then raise exception 'VERIFY(f): % registry row(s) nobody wears', v_n; end if;

    raise exception using errcode = 'HR930', message = 'name-registry §4 complete - rolling back';
  exception when sqlstate 'HR930' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.hr_name_registry where user_id in (v_a, v_c, v_m))
     or exists (select 1 from public.player_state where user_id in (v_a, v_c, v_m))
     or exists (select 1 from public.display_names where user_id in (v_a, v_c, v_m)) then
    raise exception 'VERIFY(g): §4 LEAKED a probe row'; end if;

  -- (g) THE SHAPE: the FKs, the triggers, server-only.
  if (select count(*) from pg_constraint where conname in ('display_names_name_registry_fk', 'character_names_name_registry_fk')
        and confrelid = 'public.hr_name_registry'::regclass) <> 2 then
    raise exception 'VERIFY(g): a name table does not reference the registry'; end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O' and tgname in (
        'hr_display_names_name_registry_claim', 'hr_display_names_name_registry_release',
        'hr_character_names_name_registry_claim', 'hr_character_names_name_registry_release',
        'hr_character_names_name_guard')) <> 5 then
    raise exception 'VERIFY(g): a registry or name-guard trigger is missing or disabled'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.hr_name_registry'::regclass)
     or exists (select 1 from pg_policy where polrelid = 'public.hr_name_registry'::regclass) then
    raise exception 'VERIFY(g): the registry is not RLS-on with no policy'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'public.hr_name_registry', 'select,insert,update,delete,truncate,references')
       or has_function_privilege(v_role, 'public.hr_name_registry_claim()', 'execute')
       or has_function_privilege(v_role, 'public.hr_name_registry_release()', 'execute')
       or has_function_privilege(v_role, 'public.hr_display_name_available__ungated(text)', 'execute') then
      raise exception 'VERIFY(g): % reaches the registry or an internal', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'name-registry: one namespace for display and character names, refused both ways; all green';
end $mig$;
