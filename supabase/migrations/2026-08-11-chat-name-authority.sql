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

-- ════════════════════════════════════════════════════════════════════════
-- THE OTHER HALF OF THE FIX — profiles.display_name  (review S1, P0)
--
-- Everything above derives from_name from public.profiles.display_name. That
-- is only an authority if the CLIENT CANNOT WRITE public.profiles.
--
-- IT COULD. Verified on production 2026-08-11: profiles carried both an
-- INSERT and an UPDATE policy for `auth.uid() = id`, plus the default-ACL
-- INSERT/UPDATE/DELETE/TRUNCATE grants. So the attack was two calls, not one:
--
--     supabase.from('profiles').update({ display_name: 'Tyler' }).eq('id', me)
--     supabase.from('chat_messages').insert({ channel:'global', body:'…' })
--
-- …and the trigger above would faithfully stamp `Tyler` on the message. The
-- trigger did not block the forgery, it LAUNDERED it: it turned a
-- client-asserted name into a server-asserted one. That is strictly worse than
-- no fix, because everything downstream now treats from_name as trusted.
--
-- claim_display_name() (2026-08-08-unique-names.sql) is the only legitimate
-- writer. It is SECURITY DEFINER, so it keeps working with zero client grants:
-- it enforces validation, the reserved-word list, and uniqueness through
-- public.display_names. Taking the direct write away costs the client nothing
-- and is what makes every name in the game an assertion by the server.
--
-- Applied to production 2026-08-11 ahead of this file; recorded here so the
-- repository matches the database. SAFE TO RE-RUN.
-- ════════════════════════════════════════════════════════════════════════
revoke insert, update, delete, truncate, references, trigger on public.profiles
  from anon, authenticated;
drop policy if exists "profiles self insert" on public.profiles;
drop policy if exists "profiles self update" on public.profiles;
-- Older schema revisions used different names for the same two policies; drop
-- ANY write policy on the table rather than a list of names that will drift.
do $$
declare r record;
begin
  for r in select polname from pg_policy
            where polrelid = 'public.profiles'::regclass and polcmd <> 'r'
  loop
    execute format('drop policy %I on public.profiles', r.polname);
    raise warning 'dropped client write policy %.% on public.profiles', 'profiles', r.polname;
  end loop;
end $$;

-- ── Chat retention — codifying a job that only ever existed on the box ───
-- (Review S10, schema drift.) `trim-chat-messages` has been running nightly on
-- production since the beta opened and appears in NO migration in this repo. It
-- was created by hand in a SQL console. That is drift in the direction people
-- forget to worry about: not "the database is missing something the repo has",
-- but "the database is DOING something the repo does not know about". Rebuild
-- production from these files and chat_messages grows forever; and a reviewer
-- reading the repo cannot see that a nightly DELETE runs against the table.
--
-- Codified exactly as it exists, so this is a no-op against production and a
-- correctness fix against every other environment. Verified live 2026-08-11:
--   jobname 'trim-chat-messages', schedule '15 3 * * *',
--   command "delete from public.chat_messages where created_at < now() - interval '60 days'"
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise warning 'pg_cron unavailable — chat retention is NOT scheduled here. By hand: '
                  'select cron.schedule(''trim-chat-messages'', ''15 3 * * *'', '
                  '''delete from public.chat_messages where created_at < now() - interval ''''60 days'''''');';
    return;
  end if;
  -- cron.schedule upserts by job name (pg_cron >= 1.4), so this is idempotent
  -- and also REPAIRS the schedule/command if someone edited it by hand.
  perform cron.schedule('trim-chat-messages', '15 3 * * *',
    'delete from public.chat_messages where created_at < now() - interval ''60 days''');
end $$;

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

  -- (S1) The source of truth must not be client-writable, or the trigger above
  -- is a laundering step rather than a control.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'profiles'
     and grantee in ('anon','authenticated','PUBLIC')
     and privilege_type <> 'SELECT';
  if v_n > 0 then
    raise exception '% client write grants remain on public.profiles — display_name is still PATCHable, which voids the chat name authority', v_n;
  end if;
  select count(*) into v_n from pg_policy
   where polrelid = 'public.profiles'::regclass and polcmd <> 'r';
  if v_n > 0 then
    raise exception '% client write policies remain on public.profiles', v_n;
  end if;
  -- …and the legitimate writer must still work.
  if not has_function_privilege('authenticated', 'public.claim_display_name(text)', 'execute') then
    raise exception 'claim_display_name lost its authenticated grant — players can no longer set a name at all';
  end if;

  raise notice 'CHAT NAME AUTHORITY OK — from_name is derived from profiles, profiles is server-written only.';
end $$;
