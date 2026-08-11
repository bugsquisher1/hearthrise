-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — CHAT DISPLAY-NAME AUTHORITY  (standalone, ship immediately)
--
-- SHIPS ALONE, ON PURPOSE. This is not part of the server-authority
-- foundation and must not wait for it. It is a LIVE impersonation hole in
-- production today and the fix is a trigger.
--
-- THE HOLE
--   supabase/schema.sql:101 — chat_messages.from_name is client free text. The
--   INSERT policy (schema.sql:135) checks `auth.uid() = from_id` and nothing
--   else, so any signed-in player can post as any name they like:
--
--     supabase.from('chat_messages').insert({
--       channel:'global', from_id: myUid, from_name:'Tyler', body:'…' })
--
--   from_id is correct; the name every client actually RENDERS (src/chat.js
--   reads from_name) is whatever was typed. Moderator impersonation, scam
--   whispers "from" a clanmate, and a fake trade broker are all one PATCH away.
--
-- THE FIX
--   Derive the name server-side, exactly as CLAUDE.md's server-authority rule
--   requires ("never trust a client-supplied value that crosses to another
--   player — not gold, not quantity, not price, NOT A DISPLAY NAME"). A BEFORE
--   INSERT trigger overwrites from_name from profiles.display_name, which is
--   itself kept unique by 2026-08-08-unique-names.sql claim_display_name().
--   The column keeps its NOT NULL and its length CHECK, so nothing downstream
--   changes shape — the value simply stops being the client's opinion.
--
--   from_id is pinned to auth.uid() in the same trigger. The INSERT policy
--   already requires that, but a policy is a WITH CHECK on one code path and
--   the trigger is an invariant on every path, including future RPCs.
--
-- WHY A TRIGGER AND NOT A POLICY
--   A policy can only ACCEPT or REJECT; it cannot correct. Rejecting a mismatch
--   would break every existing client build the moment a player renames.
--   Overwriting is the compatible fix: old clients keep sending a name, and the
--   database keeps ignoring it.
--
-- SAFE TO RE-RUN. Additive. Touches no other table. No data is rewritten —
-- the 8 existing rows keep whatever name they were posted with; only new
-- messages are governed. (Backfilling would rewrite history to say something
-- it did not say at the time.)
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.chat_messages') is null then
    raise exception 'public.chat_messages is missing — run supabase/schema.sql first';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles is missing — run supabase/schema.sql first';
  end if;
end $$;

create or replace function public.hr_chat_name_authority()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  -- The sender is who the session says they are. auth.uid() is null for a
  -- service-role insert (a system/broadcast message), in which case from_id is
  -- left as supplied — service role is not a client.
  if auth.uid() is not null then
    new.from_id := auth.uid();
  end if;

  select display_name into v_name from public.profiles where id = new.from_id;

  -- Fall back to a neutral label rather than to the client's string. A missing
  -- profile must not re-open the hole it is standing in.
  v_name := nullif(btrim(coalesce(v_name, '')), '');
  new.from_name := left(coalesce(v_name, 'Adventurer'), 24);
  return new;
end $$;

revoke execute on function public.hr_chat_name_authority() from public, anon, authenticated, service_role;

drop trigger if exists hr_chat_name_authority on public.chat_messages;
create trigger hr_chat_name_authority
  before insert on public.chat_messages
  for each row execute function public.hr_chat_name_authority();

-- from_name must not be mutable after the fact either. There is no UPDATE
-- policy on chat_messages today, but "there is no policy" is a fact about the
-- current file, not an invariant — this makes it one.
create or replace function public.hr_chat_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'chat_messages is append-only (attempted %)', tg_op
    using errcode = 'check_violation';
end $$;
revoke execute on function public.hr_chat_immutable() from public, anon, authenticated, service_role;
drop trigger if exists hr_chat_immutable on public.chat_messages;
create trigger hr_chat_immutable
  before update on public.chat_messages
  for each row execute function public.hr_chat_immutable();

-- Supabase's default ACL grants anon/authenticated ALL on every table in
-- public, including UPDATE, DELETE and TRUNCATE. RLS is what actually stops
-- them today; take the grants away too so there are two locks, not one.
revoke update, delete, truncate, references, trigger on public.chat_messages
  from anon, authenticated;

-- ── Self-verification ────────────────────────────────────────────────────
do $$
declare v_n int;
begin
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.chat_messages'::regclass
                    and tgname = 'hr_chat_name_authority' and not tgisinternal) then
    raise exception 'hr_chat_name_authority trigger is not attached';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.chat_messages'::regclass
                    and tgname = 'hr_chat_immutable' and not tgisinternal) then
    raise exception 'hr_chat_immutable trigger is not attached';
  end if;

  -- No client role may UPDATE the table: from_name must not be PATCHable.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'chat_messages'
     and grantee in ('anon','authenticated','PUBLIC')
     and privilege_type in ('UPDATE','DELETE','TRUNCATE');
  if v_n > 0 then
    raise exception '% client write grants remain on chat_messages', v_n;
  end if;

  -- No UPDATE/ALL policy either.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'chat_messages'
     and cmd in ('UPDATE','DELETE','ALL');
  if v_n > 0 then raise exception '% mutating policies on chat_messages', v_n; end if;

  raise notice 'CHAT NAME AUTHORITY OK — from_name is derived from profiles, not accepted.';
end $$;
