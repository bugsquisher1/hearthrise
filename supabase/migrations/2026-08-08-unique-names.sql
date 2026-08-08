-- ============================================================
-- Hearthrise — migration 2026-08-08 · UNIQUE DISPLAY NAMES + AVATARS
--                                     (backlog #9, Wave 2b)
--
-- Run ONCE in the Supabase SQL editor (Dashboard → SQL → New query).
-- Idempotent: safe to re-run. ADDITIVE ONLY — no existing table, policy or
-- function belonging to another system is dropped or altered. The one
-- pre-existing table it writes to is public.profiles, and only its
-- display_name column, which already exists and is already player-owned.
--
-- WHAT THIS IS
--   A name in a social game is not a preference, it is an ADDRESS. Chat,
--   whispers, the market seller line and the leaderboard all point at a
--   player by name, and every one of those is a lie if two players can
--   share one. Uniqueness is therefore the feature; the modal is just how
--   the player reaches it.
--
-- WHY IT CANNOT LIVE ON THE CLIENT
--   Uniqueness is a claim about EVERY OTHER PLAYER. No client can make it.
--   The only honest enforcement is a unique index, and the only race-free
--   claim is one the database arbitrates. Two players typing "Ironvale" at
--   the same instant is not a rare edge case at launch — it is the normal
--   case for every desirable name — so the winner is decided by a primary
--   key, not by application logic that "checks then inserts".
--
-- THE RACE, EXPLICITLY
--   public.display_names.canonical IS the primary key. Two concurrent
--   claims for the same canonical name become two concurrent INSERTs into
--   one unique index: Postgres blocks the second until the first commits,
--   then raises unique_violation. Exactly one wins, always, with no
--   advisory locks, no retries and no "check first" window to lose.
--
-- RENAME, AND WHY THE OLD NAME IS NOT FREED FIRST
--   A rename is a single UPDATE that MOVES the primary key. If the new
--   canonical is taken the statement raises and the subtransaction rolls
--   back with the old row untouched — so a failed rename cannot leave a
--   player nameless, and cannot release a name to a squatter watching for
--   exactly that gap. Delete-then-insert would have both bugs.
--
-- CASE- AND SEPARATOR-INSENSITIVE
--   `canonical` is lowercased, with _ - . folded to spaces, apostrophes
--   dropped and whitespace runs collapsed. So "Sir_Bob", "sir bob" and
--   "SIR   BOB" are ONE name. That is the OSRS precedent and it is the
--   point: impersonation by punctuation is the cheapest attack on a
--   name system, and it costs nothing to close here.
--   ⚠ public.hr_canon_display_name() below MUST stay byte-compatible with
--   canon() in src/features/identity.js. The self-check at the bottom
--   asserts the shared cases.
--
-- COMPATIBILITY — read before running:
--   • Every object created here is NEW except public.profiles.display_name,
--     which is only ever written with a value that already passed the same
--     validation the column's own CHECK (length 2..24) allows.
--   • The b221 client FEATURE-DETECTS claim_display_name /
--     hr_display_name_available (404 / PGRST202 → the name modal still
--     works, but the name is marked PROVISIONAL and silently re-claimed
--     once this file has been run). → THE CLIENT MAY SHIP FIRST.
--   • Section 6 (Storage) touches storage.buckets / storage.objects. On a
--     managed Supabase project the SQL editor has the rights; if it does
--     not, that section raises a NOTICE with the manual dashboard steps
--     instead of failing the migration. Names do not depend on avatars.
-- ============================================================

-- ── 1. Canonical form (the uniqueness key) ────────────────────
-- IMMUTABLE so it can be used in an index expression later if ever needed,
-- and so the planner can fold it. Kept deliberately boring: every
-- transformation here has to be reproduced exactly in JavaScript.
create or replace function public.hr_canon_display_name(p_name text)
returns text language sql immutable as $$
  select btrim(
           regexp_replace(
             regexp_replace(
               translate(lower(coalesce(p_name, '')), '_-.', '   '),
               '[''’]', '', 'g'),
             '\s+', ' ', 'g'))
$$;

-- ── 2. Validation (server-authoritative; the client mirrors it for UX) ──
-- Rules, in the order a player meets them:
--   • 3–20 characters after leading/trailing/duplicate whitespace is normalised
--   • letters, numbers, spaces and _ ' . - only; must START and END alphanumeric
--   • a small reserved list, matched on the CANONICAL form so "Adm_in" is
--     refused for the same reason "admin" is
-- Profanity is NOT checked here. The client's ChatFilter is the profanity
-- guard (src/chat-filter.js), and duplicating a curated word list in SQL
-- would guarantee the two drift. Documented as a known limitation rather
-- than half-enforced in two places.
create or replace function public.hr_validate_display_name(p_name text)
returns jsonb language plpgsql immutable as $$
declare
  v_name  text;
  v_canon text;
  c_reserved constant text[] := array[
    'admin','administrator','moderator','moderators','mod','gm','game master',
    'hearthrise','system','server','support','staff','dev','developer',
    'null','undefined','anonymous','adventurer'
  ];
begin
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(v_name) < 3  then return jsonb_build_object('ok', false, 'reason', 'short');   end if;
  if length(v_name) > 20 then return jsonb_build_object('ok', false, 'reason', 'long');    end if;
  -- Hyphen is LAST in the bracket expression so it is a literal, not a range.
  if v_name !~ '^[A-Za-z0-9][A-Za-z0-9 _''’.-]*[A-Za-z0-9]$' then
    return jsonb_build_object('ok', false, 'reason', 'charset');
  end if;
  v_canon := public.hr_canon_display_name(v_name);
  -- "..." canonicalises to nothing; a name must survive canonicalisation or
  -- it is not addressable.
  if length(v_canon) < 3 then return jsonb_build_object('ok', false, 'reason', 'short'); end if;
  -- Reserved names are matched with separators REMOVED, not merely folded.
  -- hr_canon_display_name() turns "_" into a space, so "Adm_in" canonicalises
  -- to "adm in" and would otherwise sail straight past a plain lookup — as
  -- would "A d m i n". This stricter fold applies ONLY to the reserved list:
  -- the uniqueness key itself keeps spaces, because "Iron Vale" and "Ironvale"
  -- are two players' names, not one impersonation attempt.
  if regexp_replace(v_canon, '\s+', '', 'g') = any (
       select regexp_replace(r, '\s+', '', 'g') from unnest(c_reserved) as r)
  then
    return jsonb_build_object('ok', false, 'reason', 'reserved');
  end if;
  return jsonb_build_object('ok', true, 'name', v_name, 'canonical', v_canon);
end $$;

-- ── 3. The namespace ──────────────────────────────────────────
-- One row per claimed name. `canonical` is the primary key (that IS the
-- case-insensitive unique index); `user_id` is UNIQUE so an account holds
-- at most one name and a rename is an UPDATE rather than a leak.
create table if not exists public.display_names (
  canonical  text primary key,
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  name       text not null,
  claimed_at timestamptz not null default now()
);

alter table public.display_names enable row level security;
drop policy if exists "display names readable" on public.display_names;
-- Public by design: a name only works as an address if it can be looked up.
create policy "display names readable" on public.display_names for select using (true);
-- No insert/update/delete policy ON PURPOSE — claim_display_name() is the
-- only writer, which is what makes the namespace real.
grant select on public.display_names to anon, authenticated;

-- ── 4. Backfill: existing players keep the name they already have ─────
-- Earliest account wins a collision, so nobody who has been calling
-- themselves something for weeks is quietly renamed by a newcomer's login
-- order. Names that no longer validate are simply not claimed — those
-- players get the modal, which is the intended path anyway.
insert into public.display_names (canonical, user_id, name, claimed_at)
select distinct on (public.hr_canon_display_name(p.display_name))
       public.hr_canon_display_name(p.display_name),
       p.id,
       btrim(regexp_replace(p.display_name, '\s+', ' ', 'g')),
       p.created_at
  from public.profiles p
 where p.display_name is not null
   and (public.hr_validate_display_name(p.display_name)->>'ok')::boolean
 order by public.hr_canon_display_name(p.display_name), p.created_at asc, p.id asc
on conflict do nothing;

-- ── 5a. Availability probe (UX only — never the authority) ────
-- Returns available=true for a name the CALLER already holds, so the modal
-- does not tell a player their own name is taken when they reopen it.
create or replace function public.hr_display_name_available(p_name text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_val   jsonb;
  v_canon text;
  v_owner uuid;
begin
  v_val := public.hr_validate_display_name(p_name);
  if not (v_val->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'reason', v_val->>'reason');
  end if;
  v_canon := v_val->>'canonical';
  select user_id into v_owner from public.display_names where canonical = v_canon;
  return jsonb_build_object(
    'ok', true,
    'available', (v_owner is null or v_owner = auth.uid()),
    'mine', (v_owner is not null and v_owner = auth.uid()),
    'name', v_val->>'name', 'canonical', v_canon);
end $$;
grant execute on function public.hr_display_name_available(text) to anon, authenticated;

-- ── 5b. claim_display_name — the only writer ──────────────────
-- Atomic, race-safe, idempotent for the caller's own name, and it keeps
-- public.profiles.display_name (which the leaderboard view reads) in step.
create or replace function public.claim_display_name(p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_val   jsonb;
  v_name  text;
  v_canon text;
  v_rows  int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  v_val := public.hr_validate_display_name(p_name);
  if not (v_val->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'reason', v_val->>'reason');
  end if;
  v_name  := v_val->>'name';
  v_canon := v_val->>'canonical';

  -- A profile row normally exists (handle_new_user trigger), but a claim
  -- must never fail because of someone else's trigger.
  insert into public.profiles (id) values (v_uid) on conflict do nothing;

  -- (a) IDEMPOTENT RE-CLAIM. The caller already holds this canonical name —
  -- refresh the display spelling and succeed. This is the path a client
  -- takes when it lost its local record (new device, cleared storage) or
  -- when it re-claims a name that was provisional before this migration
  -- existed. Without it, every such client would collide with itself.
  update public.display_names
     set name = v_name
   where user_id = v_uid and canonical = v_canon;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    update public.profiles set display_name = v_name where id = v_uid;
    return jsonb_build_object('ok', true, 'name', v_name, 'canonical', v_canon,
                              'renamed', false);
  end if;

  -- (b) CLAIM or RENAME. Both are one statement against the primary key, so
  -- the unique index — not this function — decides who wins.
  begin
    if exists (select 1 from public.display_names where user_id = v_uid) then
      update public.display_names
         set canonical = v_canon, name = v_name, claimed_at = now()
       where user_id = v_uid;
    else
      insert into public.display_names (canonical, user_id, name)
        values (v_canon, v_uid, v_name);
    end if;
  exception when unique_violation then
    -- Somebody else holds it. On the rename path the old row is intact
    -- because this subtransaction rolled back — the old name is freed only
    -- on success, never in anticipation of one.
    return jsonb_build_object('ok', false, 'error', 'taken', 'canonical', v_canon);
  end;

  update public.profiles set display_name = v_name where id = v_uid;
  return jsonb_build_object('ok', true, 'name', v_name, 'canonical', v_canon,
                            'renamed', true);
end $$;
grant execute on function public.claim_display_name(text) to authenticated;

-- ── 6. Avatar storage ─────────────────────────────────────────
-- Path is derived, never stored: avatars/<user_id>/avatar.webp. Deriving it
-- means no DB column, no migration when a player re-uploads, and no way for
-- the path to disagree with who owns it — the folder name IS the owner check.
--
-- Enforced HERE: who may write (owner only, by folder), object size
-- (512 KB), and MIME type. Enforced on the CLIENT before upload: square
-- 256x256, re-encoded from pixels so the original file's bytes (and any
-- metadata riding in them) never leave the device. NOT enforced anywhere:
-- what the image depicts. That is moderation, and it is out of scope.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'AVATARS: storage schema not present — skipping bucket setup.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 524288,
          array['image/webp', 'image/png', 'image/jpeg'])
  on conflict (id) do update
    set public             = true,
        file_size_limit    = 524288,
        allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg'];

  -- Public read; owner-only write, keyed on the first path segment.
  execute $p$drop policy if exists "hr avatars public read" on storage.objects$p$;
  execute $p$create policy "hr avatars public read" on storage.objects
             for select using (bucket_id = 'avatars')$p$;

  execute $p$drop policy if exists "hr avatars owner insert" on storage.objects$p$;
  execute $p$create policy "hr avatars owner insert" on storage.objects
             for insert to authenticated with check (
               bucket_id = 'avatars'
               and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  execute $p$drop policy if exists "hr avatars owner update" on storage.objects$p$;
  execute $p$create policy "hr avatars owner update" on storage.objects
             for update to authenticated using (
               bucket_id = 'avatars'
               and (storage.foldername(name))[1] = auth.uid()::text)
             with check (
               bucket_id = 'avatars'
               and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  execute $p$drop policy if exists "hr avatars owner delete" on storage.objects$p$;
  execute $p$create policy "hr avatars owner delete" on storage.objects
             for delete to authenticated using (
               bucket_id = 'avatars'
               and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  raise notice 'AVATARS: bucket + owner-write policies ready.';
exception when insufficient_privilege or undefined_table then
  -- Some projects lock storage.objects down to the dashboard. Names are the
  -- P1 half of this migration and must not be blocked by avatars.
  raise notice 'AVATARS: could not configure storage from SQL (%). Create a PUBLIC bucket named "avatars" in Dashboard -> Storage, set the file size limit to 512 KB and allowed MIME types to image/webp,image/png,image/jpeg, then add owner-write policies on (storage.foldername(name))[1] = auth.uid()::text. Display names are unaffected.', sqlerrm;
end $$;

-- ── 7. Self-check ─────────────────────────────────────────────
-- Asserts the migration took AND that this file's canonicalisation still
-- agrees with the client's. A silent drift here would hand two players the
-- same name, which is the one outcome the whole file exists to prevent.
do $$
declare v text; j jsonb;
begin
  if to_regclass('public.display_names') is null then
    raise exception 'display_names missing';
  end if;

  -- Canonical form — these exact pairs are asserted in the b221 smoke suite.
  if public.hr_canon_display_name('Sir_Bob')   <> 'sir bob' then raise exception 'canon: underscore fold drifted'; end if;
  if public.hr_canon_display_name('  SIR   BOB  ') <> 'sir bob' then raise exception 'canon: whitespace fold drifted'; end if;
  if public.hr_canon_display_name('O''Malley')  <> 'omalley'  then raise exception 'canon: apostrophe fold drifted'; end if;
  if public.hr_canon_display_name('Iron-Vale')  <> 'iron vale' then raise exception 'canon: hyphen fold drifted'; end if;
  if public.hr_canon_display_name('Iron.Vale')  <> 'iron vale' then raise exception 'canon: dot fold drifted'; end if;

  -- Validation boundaries.
  if (public.hr_validate_display_name('ab')->>'reason')        <> 'short'   then raise exception 'validate: 2 chars must be short'; end if;
  if (public.hr_validate_display_name('abc')->>'ok')           <> 'true'    then raise exception 'validate: 3 chars must pass'; end if;
  if (public.hr_validate_display_name(repeat('a',20))->>'ok')  <> 'true'    then raise exception 'validate: 20 chars must pass'; end if;
  if (public.hr_validate_display_name(repeat('a',21))->>'reason') <> 'long' then raise exception 'validate: 21 chars must be long'; end if;
  if (public.hr_validate_display_name('bad<script>')->>'reason')  <> 'charset' then raise exception 'validate: angle brackets must be refused'; end if;
  if (public.hr_validate_display_name(' Bob ')->>'name')       <> 'Bob'     then raise exception 'validate: must strip leading/trailing spaces'; end if;
  if (public.hr_validate_display_name('Bob  Ross')->>'name')   <> 'Bob Ross' then raise exception 'validate: must collapse inner runs'; end if;
  if (public.hr_validate_display_name('Bob ')->>'ok')          <> 'true'    then raise exception 'validate: trailing space must normalise, not reject'; end if;
  if (public.hr_validate_display_name('Adm_in')->>'reason')    <> 'reserved' then raise exception 'validate: reserved list must survive separator folding'; end if;
  if (public.hr_validate_display_name('A d m i n')->>'reason') <> 'reserved' then raise exception 'validate: reserved list must survive letter spacing'; end if;
  if (public.hr_validate_display_name('Iron Vale')->>'ok')     <> 'true'     then raise exception 'validate: the tight reserved fold must not eat ordinary names'; end if;
  if (public.hr_validate_display_name(' -- ')->>'ok')          <> 'false'   then raise exception 'validate: punctuation-only must be refused'; end if;

  -- The namespace really is unique on the canonical form.
  begin
    select canonical into v from public.display_names limit 1;
    if v is not null then
      begin
        insert into public.display_names (canonical, user_id, name)
          values (v, '00000000-0000-0000-0000-000000000000'::uuid, 'dup');
        raise exception 'display_names accepted a duplicate canonical name';
      exception
        when unique_violation      then null;   -- correct
        when foreign_key_violation then null;   -- also fine: never got that far
      end;
    end if;
  end;

  raise notice 'UNIQUE NAMES migration OK — canonical form, validation and the namespace verified.';
end $$;
