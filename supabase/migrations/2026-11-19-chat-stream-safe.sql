-- ════════════════════════════════════════════════════════════════════════
-- 2026-11-19-chat-stream-safe.sql — THE CHAT A PLAYER SEES IS STREAM-SAFE:
--   HISTORY STARTS AT A SERVER-HELD EPOCH, AND A LISTED WORD IS MASKED.
--
-- STATUS: STAGED, NOT APPLIED. Lane lane/a-chat-stream-safe (systems-engineer,
-- 2026-10-22). The 2026-10-22 fresh-hero playtest opened Global and read weeks
-- of dev/test chat, profanity included, on the first screen; Tyler streams the
-- game. The game is CLOSED: this applies on its passing §7 (tools/apply-
-- migration.mjs, one file, never inside begin/commit, never 00:00–00:10 UTC);
-- Security reviews it with every closed-mode surface at the reopen gate. ORDER:
-- after 2026-11-07-players-online.sql (no object in common). No edge deploy.
-- No row anyone wrote is deleted or rewritten (CLAUDE.md §2): old lines stay in
-- chat_messages until the existing 60-day trim; they are simply never READ.
--
-- ── WHAT CHANGES ────────────────────────────────────────────────────────────
-- §1 hr_chat_config, ONE row (operator_tunable): history_epoch (no chat line
--    written before it is ever read again) and history_hours (how far back a
--    reader sees, 24). Seeded `on conflict do nothing` with the epoch = the
--    APPLY time, so every line written before this file is hidden at once. The
--    epoch only moves FORWARD and never into the future (a trigger refuses
--    both): moving it is the launch-day "start chat clean" switch —
--      update public.hr_chat_config set history_epoch = now() where id;
--    RLS on; readable by every role (the floor runs with the reader's rights),
--    writable by none but the owner.
-- §2 hr_chat_history_floor() = greatest(epoch, now() - history_hours); now()
--    when the row is missing (fail safe: no history, never all of it).
-- §3 RESTRICTIVE select policies hr_chat_history_floor on chat_messages and
--    chat_whispers: a direct PostgREST read (anon or signed in) and every
--    Realtime push (Realtime evaluates the subscriber's RLS) see nothing older
--    than the floor. The floor function is EXECUTE for anon + authenticated
--    because a policy runs with the reader's rights (the hr_admitted pattern);
--    it is SECURITY INVOKER, takes no argument and answers one timestamp.
-- §4 THE WORD FILTER. hr_chat_mask(body) masks every space-separated word that
--    hr_name_blocked() refuses as a name — the existing server-only
--    hr_name_blocklist (slurs + strong obscenity, folded for leet, homoglyphs,
--    repeats and separators; the Scunthorpe set stays clean) plus held names —
--    with one `*` per character, so the length and the item-link markers
--    (`[[item:<id>]]`, never masked) are kept. A one-regex prefilter over the
--    whole body's folds skips the per-word pass for a clean line.
--    MASKED, NOT DROPPED: the line still arrives, the word is stars.
-- §5 ON WRITE: a BEFORE INSERT trigger hr_chat_word_filter on chat_messages and
--    chat_whispers runs every body through hr_chat_mask, whatever path wrote it
--    (hr_chat_send, hr_whisper_send, a server notice). The client's text never
--    reaches the table unfiltered, and hr_chat_send / hr_whisper_send answer the
--    stored (masked) line.
-- §6 ON READ: hr_chat_recent (restated whole from 2026-10-25-chat-channels.sql)
--    and hr_whispers_recent (restated whole from 2026-10-25-social.sql) read
--    only lines at or after the floor and mask every body again, so a word added
--    to the list later is masked in history too.
-- §7 SELF-CHECK, EXECUTED, every probe rolled back.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- +1 client-callable function (hr_chat_history_floor: invoker, no argument, one
-- timestamp) and +1 world-readable one-row table (the window's two numbers).
-- Neither reads anything a player wrote. Reads only narrow. No value moves;
-- nothing here touches gold, items, XP or a ranking.
--
-- ── KNOWN LIMITS ────────────────────────────────────────────────────────────
-- A word added to hr_name_blocklist later is masked by the two history reads,
-- but a hand-made PostgREST select of a line written before the addition shows
-- it unmasked (RLS filters rows, it cannot rewrite a column); moving the epoch
-- forward hides those lines too. Spaced-out letters ("f u c k") are separate
-- words and pass, as they do for names.
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
-- Write: one string_agg over the ~90-row list and six regex tests per line; the
-- per-word pass runs only when the prefilter hits. Read: the same per returned
-- line (≤ 170 chat, ≤ 100 whispers), behind the existing 30/min and 20/min
-- read gates. The floor is one initplan per query (the one-row config).
--
-- REVERSIBILITY: drop the two triggers and the two policies; restate
-- hr_chat_recent / hr_whispers_recent from their 2026-10-25 files; drop
-- hr_chat_mask, hr_chat_history_floor, hr_chat_epoch_forward, hr_chat_config.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.chat_messages') is null or to_regclass('public.chat_whispers') is null
     or to_regclass('public.hr_name_blocklist') is null or to_regclass('public.hr_name_holds') is null
     or to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'chat-stream-safe §0: chat_messages / chat_whispers / hr_name_blocklist / hr_name_holds / hr_client_rpc_baseline absent';
  end if;
  if to_regprocedure('public.hr_name_blocked(text)') is null or to_regprocedure('public.hr_name_fold(text)') is null
     or to_regprocedure('public.hr_chat_row(public.chat_messages)') is null
     or to_regprocedure('public.hr_whisper_row(public.chat_whispers)') is null
     or to_regprocedure('public.hr_chat_recent(integer)') is null or to_regprocedure('public.hr_whispers_recent()') is null then
    raise exception 'chat-stream-safe §0: a function this file calls or restates is absent';
  end if;
  -- The two restated readers must still be the 2026-10-25 bodies (or this file's): a later
  -- restatement this file does not know would be silently overwritten.
  if position('CHAT-STREAM-SAFE' in pg_get_functiondef('public.hr_chat_recent(integer)'::regprocedure)) = 0
     and position('order by m.created_at desc limit 50' in pg_get_functiondef('public.hr_chat_recent(integer)'::regprocedure)) = 0 then
    raise exception 'chat-stream-safe §0: hr_chat_recent is not the 2026-10-25-chat-channels.sql body — re-measure before restating';
  end if;
  if position('CHAT-STREAM-SAFE' in pg_get_functiondef('public.hr_whispers_recent()'::regprocedure)) = 0
     and position('order by w.created_at desc limit 100' in pg_get_functiondef('public.hr_whispers_recent()'::regprocedure)) = 0 then
    raise exception 'chat-stream-safe §0: hr_whispers_recent is not the 2026-10-25-social.sql body — re-measure before restating';
  end if;
end $mig$;

-- ── §1 THE HISTORY EPOCH AND HORIZON ─────────────────────────────────────────
create table if not exists public.hr_chat_config (
  id            boolean primary key default true check (id),
  history_epoch timestamptz not null,
  history_hours int not null check (history_hours between 1 and 720),
  note          text
);
alter table public.hr_chat_config enable row level security;
revoke all on public.hr_chat_config from public, anon, authenticated;
-- READABLE, NOT WRITABLE: the floor is computed with the READER's rights inside an RLS policy
-- (a client-callable SECURITY DEFINER must carry a rate gate, A9), so the window itself is
-- public: two numbers, nothing a player wrote. No insert/update/delete grant, no write policy.
grant select (id, history_epoch, history_hours) on public.hr_chat_config to anon, authenticated;
drop policy if exists "chat window readable" on public.hr_chat_config;
create policy "chat window readable" on public.hr_chat_config for select using (true);
comment on table public.hr_chat_config is
  '2026-11-19-chat-stream-safe.sql: the chat history window. No chat or whisper line older than '
  'greatest(history_epoch, now() - history_hours) is ever read (RLS + hr_chat_recent / hr_whispers_recent). '
  'The epoch only moves forward. Start chat clean: update public.hr_chat_config set history_epoch = now() where id;';
-- ON CONFLICT DO NOTHING is load-bearing: a re-apply never moves an operator's epoch or horizon.
insert into public.hr_chat_config (id, history_epoch, history_hours, note)
values (true, now(), 24, 'seeded at apply: every line written before this file is hidden')
on conflict (id) do nothing;

create or replace function public.hr_chat_epoch_forward()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if new.history_epoch > now() then
    raise exception 'hr_chat_config: the history epoch cannot be in the future (%)', new.history_epoch
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.history_epoch < old.history_epoch then
    raise exception 'hr_chat_config: the history epoch only moves forward (% -> %)', old.history_epoch, new.history_epoch
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.hr_chat_epoch_forward() from public, anon, authenticated, service_role;
drop trigger if exists hr_chat_epoch_forward on public.hr_chat_config;
create trigger hr_chat_epoch_forward before insert or update on public.hr_chat_config
  for each row execute function public.hr_chat_epoch_forward();

-- ── §2 THE FLOOR ─────────────────────────────────────────────────────────────
create or replace function public.hr_chat_history_floor()
returns timestamptz language sql stable security invoker set search_path = public, pg_catalog as $$
  select coalesce((select greatest(c.history_epoch, now() - make_interval(hours => c.history_hours))
                     from public.hr_chat_config c where c.id), now())
$$;
revoke execute on function public.hr_chat_history_floor() from public, service_role;
grant execute on function public.hr_chat_history_floor() to anon, authenticated;

-- ── §3 NO READ BELOW THE FLOOR (PostgREST and Realtime) ──────────────────────
drop policy if exists hr_chat_history_floor on public.chat_messages;
create policy hr_chat_history_floor on public.chat_messages as restrictive
  for select using (created_at >= (select public.hr_chat_history_floor()));
drop policy if exists hr_chat_history_floor on public.chat_whispers;
create policy hr_chat_history_floor on public.chat_whispers as restrictive
  for select using (created_at >= (select public.hr_chat_history_floor()));

-- ── §4 THE WORD FILTER ───────────────────────────────────────────────────────
create or replace function public.hr_chat_mask(p_body text)
returns text language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_re  text;
  v_a   text;
  v_b   text;
  v_c   text;
  v_out text[] := '{}';
  v_tok text;
begin
  if p_body is null or p_body = '' then return p_body; end if;
  -- Prefilter: the body's folds (as typed, `1` read as l, `l` read as i, each with `q` read as g)
  -- against every stem at once. A word hr_name_blocked refuses is a fold of a piece of the body,
  -- and every stem pattern is `x+` per letter, so a word hit is always a body hit.
  v_a := public.hr_name_fold(p_body);
  v_b := public.hr_name_fold(translate(p_body, '1', 'l'));
  v_c := translate(v_a, 'l', 'i');
  select string_agg(w.pattern, '|' order by w.stem) into v_re from public.hr_name_blocklist w;
  if not ((v_re is not null and exists (
             select 1 from unnest(array[v_a, v_b, v_c, translate(v_a, 'q', 'g'), translate(v_b, 'q', 'g'),
                                        translate(v_c, 'q', 'g')]) v where v ~ v_re))
          or exists (select 1 from public.hr_name_holds h
                      where strpos(v_a, h.fold) > 0 or strpos(v_b, h.fold) > 0 or strpos(v_c, h.fold) > 0)) then
    return p_body;
  end if;
  foreach v_tok in array string_to_array(p_body, ' ') loop
    v_out := v_out || case
      when v_tok ~ '^\[\[item:[a-z0-9_]{1,64}\]\]$' or not public.hr_name_blocked(v_tok) then v_tok
      else repeat('*', length(v_tok)) end;
  end loop;
  return array_to_string(v_out, ' ');
end $$;
revoke execute on function public.hr_chat_mask(text) from public, anon, authenticated, service_role;
comment on function public.hr_chat_mask(text) is
  'Masks (one * per character) every space-separated word hr_name_blocked() refuses; item-link markers kept. '
  'Run on every chat/whisper insert and on every history read (2026-11-19-chat-stream-safe.sql).';

-- ── §5 ON WRITE ──────────────────────────────────────────────────────────────
create or replace function public.hr_chat_word_filter()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  new.body := public.hr_chat_mask(new.body);
  return new;
end $$;
revoke execute on function public.hr_chat_word_filter() from public, anon, authenticated, service_role;
drop trigger if exists hr_chat_word_filter on public.chat_messages;
create trigger hr_chat_word_filter before insert on public.chat_messages
  for each row execute function public.hr_chat_word_filter();
drop trigger if exists hr_chat_word_filter on public.chat_whispers;
create trigger hr_chat_word_filter before insert on public.chat_whispers
  for each row execute function public.hr_chat_word_filter();

-- ── §6 ON READ: THE TWO HISTORY READERS ──────────────────────────────────────
create or replace function public.hr_chat_recent(p_slot int)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
-- CHAT-STREAM-SAFE (2026-11-19): lines at or after hr_chat_history_floor(), every body masked.
declare v_uid uuid := auth.uid(); v_zone text; v_pid uuid; v_party text; v_floor timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'chat:read', 30, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  v_zone := public.hr_chat_zone_of(v_uid, p_slot);
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  v_party := case when v_pid is null then null else 'party:' || v_pid::text end;
  v_floor := public.hr_chat_history_floor();
  return jsonb_build_object('ok', true, 'zone', v_zone, 'party', v_party, 'lines', coalesce((
    select jsonb_agg(public.hr_chat_row(x) || jsonb_build_object('body', public.hr_chat_mask(x.body))
                     order by x.created_at, x.id) from (
      (select * from public.chat_messages m where m.channel = 'global' and m.created_at >= v_floor
        order by m.created_at desc limit 50)
      union all (select * from public.chat_messages m where m.channel = v_zone and m.created_at >= v_floor
        order by m.created_at desc limit 50)
      union all (select * from public.chat_messages m where v_party is not null and m.channel = v_party
                   and v_uid = any (m.audience) and m.created_at >= v_floor order by m.created_at desc limit 50)
      union all (select * from public.chat_messages m where m.channel = 'system' and m.created_at >= v_floor
        order by m.created_at desc limit 20)
    ) x
    where not exists (select 1 from public.chat_blocks b where b.blocker_id = v_uid and b.blocked_id = x.from_id)), '[]'::jsonb));
end $$;
revoke execute on function public.hr_chat_recent(int) from public, anon, service_role;
grant execute on function public.hr_chat_recent(int) to authenticated;

create or replace function public.hr_whispers_recent()
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
-- CHAT-STREAM-SAFE (2026-11-19): lines at or after hr_chat_history_floor(), every body masked.
declare v_uid uuid := auth.uid(); v_floor timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'social:read', 20, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_floor := public.hr_chat_history_floor();
  return jsonb_build_object('ok', true, 'lines', coalesce((
    select jsonb_agg(public.hr_whisper_row(x) || jsonb_build_object('body', public.hr_chat_mask(x.body))
                     order by x.created_at, x.id) from (
      select * from public.chat_whispers w
       where (w.to_id = v_uid or w.from_id = v_uid) and w.created_at >= v_floor
         and not exists (select 1 from public.chat_blocks b where b.blocker_id = v_uid and b.blocked_id = w.from_id)
       order by w.created_at desc limit 100) x), '[]'::jsonb));
end $$;
revoke execute on function public.hr_whispers_recent() from public, anon, service_role;
grant execute on function public.hr_whispers_recent() to authenticated;

-- ── §6b THE CLIENT SURFACE ───────────────────────────────────────────────────
delete from public.hr_client_rpc_baseline where proname = 'hr_chat_history_floor';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_chat_history_floor', '', 'anon',
   'added 2026-11-19 (chat-stream-safe): read by the hr_chat_history_floor RLS policies; no argument, one timestamp'),
  ('hr_chat_history_floor', '', 'authenticated',
   'added 2026-11-19 (chat-stream-safe): read by the hr_chat_history_floor RLS policies; no argument, one timestamp');

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $mig$
declare
  v_a constant uuid := '000000c0-0000-0000-0000-00000c5a7e01';   -- sender
  v_b constant uuid := '000000c0-0000-0000-0000-00000c5a7e02';   -- a new player reading
  v_item text := (select item_id from public.hr_items where item_id ~ '^[a-z0-9_]{1,64}$' order by item_id limit 1);
  v jsonb; v_n int; v_err text; v_u uuid; v_old uuid; v_hz uuid; v_body text;
begin
  begin
    insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'chat-stream-safe §7')
      on conflict (key) do update set enabled = true;
    foreach v_u in array array[v_a, v_b] loop
      insert into auth.users (id) values (v_u) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u, 'Probe' || right(v_u::text, 1))
        on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_u, 'chat-stream-safe §7 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_u::text, true);
      if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then
        raise exception 'chat-stream-safe §7: probe character % was not made', v_u; end if;
    end loop;

    -- (a) THE HORIZON: a line older than history_hours is never read, whatever the epoch.
    if public.hr_chat_history_floor() is distinct from
       (select greatest(c.history_epoch, now() - make_interval(hours => c.history_hours)) from public.hr_chat_config c where c.id) then
      raise exception 'chat-stream-safe §7(a): the floor is not greatest(epoch, now() - hours)'; end if;
    insert into public.chat_messages (channel, from_id, from_name, body, created_at)
      values ('global', v_a, 'x', 'from two days ago', now() - interval '2 days') returning id into v_hz;

    -- (b) THE EPOCH: moved forward to now, a line from an hour ago is never read; a new one is.
    update public.hr_chat_config set history_epoch = now() where id;
    insert into public.chat_messages (channel, from_id, from_name, body, created_at)
      values ('global', v_a, 'x', 'omg this is all broken', now() - interval '1 hour') returning id into v_old;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_chat_send(0, 'global', 'hello after the epoch');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'chat-stream-safe §7(b): a clean line was refused: %', v; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_chat_recent(0);
    if exists (select 1 from jsonb_array_elements(v->'lines') l where (l->>'id')::uuid in (v_old, v_hz)) then
      raise exception 'chat-stream-safe §7(b): the history returned a line from before the floor: %', v; end if;
    if not exists (select 1 from jsonb_array_elements(v->'lines') l where l->>'body' = 'hello after the epoch') then
      raise exception 'chat-stream-safe §7(b) CONTROL: the history lost a line after the epoch: %', v; end if;

    -- (c) A CLIENT CANNOT READ PAST THE FLOOR: direct selects as authenticated and anon, and the config.
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from public.chat_messages where id in (v_old, v_hz);
    reset role;
    if v_n <> 0 then raise exception 'chat-stream-safe §7(c): a signed-in client read % line(s) from before the floor', v_n; end if;
    set local role authenticated;
    select count(*) into v_n from public.chat_messages where body = 'hello after the epoch';
    reset role;
    if v_n <> 1 then raise exception 'chat-stream-safe §7(c) CONTROL: a signed-in client cannot read a fresh line (%)', v_n; end if;
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    set local role anon;
    select count(*) into v_n from public.chat_messages where id in (v_old, v_hz);
    reset role;
    if v_n <> 0 then raise exception 'chat-stream-safe §7(c): anon read % line(s) from before the floor', v_n; end if;
    v_err := 'moved';
    begin
      set local role authenticated;
      update public.hr_chat_config set history_epoch = '2000-01-01' where id;
      get diagnostics v_n = row_count;
      if v_n = 0 then v_err := 'refused'; end if;
    exception when insufficient_privilege then v_err := 'refused';
    end;
    reset role;
    if v_err <> 'refused' then raise exception 'chat-stream-safe §7(c): a signed-in client moved the epoch'; end if;

    -- (d) THE EPOCH ONLY MOVES FORWARD, AND NEVER INTO THE FUTURE.
    v_err := null;
    begin update public.hr_chat_config set history_epoch = now() - interval '1 day' where id;
    exception when check_violation then v_err := 'refused'; end;
    if v_err is null then raise exception 'chat-stream-safe §7(d): the epoch moved backward'; end if;
    v_err := null;
    begin update public.hr_chat_config set history_epoch = now() + interval '1 day' where id;
    exception when check_violation then v_err := 'refused'; end;
    if v_err is null then raise exception 'chat-stream-safe §7(d): the epoch moved into the future'; end if;

    -- (e) A LISTED WORD IS MASKED ON WRITE (chat and whisper), link kept, clean words untouched.
    delete from public.hr_rate_counters where user_id in (v_a, v_b);
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_body := 'what the FUCK, Sh1t. Scunthorpe classic' || coalesce(' [[item:' || v_item || ']]', '');
    v := public.hr_chat_send(0, 'global', v_body);
    if v->'line'->>'body' is distinct from
       'what the ***** ***** Scunthorpe classic' || coalesce(' [[item:' || v_item || ']]', '') then
      raise exception 'chat-stream-safe §7(e): a listed word was not masked on write: %', v; end if;
    if exists (select 1 from public.chat_messages where from_id = v_a and body ~* 'fuck|sh1t') then
      raise exception 'chat-stream-safe §7(e): the stored line keeps the listed word'; end if;
    v := public.hr_whisper_send(0, v_b::text, 'you are a bitch');
    if coalesce(v->>'ok', '') <> 'true' or v->'line'->>'body' is distinct from 'you are a *****' then
      raise exception 'chat-stream-safe §7(e): a whisper kept a listed word: %', v; end if;
    if exists (select 1 from public.chat_whispers where from_id = v_a and body ~* 'bitch') then
      raise exception 'chat-stream-safe §7(e): the stored whisper keeps the listed word'; end if;
    if public.hr_chat_mask('Peacock and Hancock met in Essex') <> 'Peacock and Hancock met in Essex' then
      raise exception 'chat-stream-safe §7(e) CONTROL: a clean line was masked'; end if;

    -- (f) ON READ: a word listed AFTER the line was written is masked in the history.
    v := public.hr_chat_send(0, 'global', 'zqxprobe is a new word');
    if v->'line'->>'body' is distinct from 'zqxprobe is a new word' then
      raise exception 'chat-stream-safe §7(f) CONTROL: an unlisted word was masked: %', v; end if;
    insert into public.hr_name_blocklist (stem, kind, match) values ('zqxprobe', 'obscene', 'substring');
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    delete from public.hr_rate_counters where user_id = v_b;
    v := public.hr_chat_recent(0);
    if not exists (select 1 from jsonb_array_elements(v->'lines') l where l->>'body' = '******** is a new word')
       or exists (select 1 from jsonb_array_elements(v->'lines') l where l->>'body' ~ 'zqxprobe') then
      raise exception 'chat-stream-safe §7(f): the history did not mask a newly listed word: %', v; end if;

    -- (g) a client cannot run the mask or the filter, or write the config.
    if has_function_privilege('authenticated', 'public.hr_chat_mask(text)', 'execute')
       or has_function_privilege('anon', 'public.hr_chat_mask(text)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_chat_word_filter()', 'execute')
       or has_table_privilege('authenticated', 'public.hr_chat_config', 'insert,update,delete,truncate')
       or has_table_privilege('anon', 'public.hr_chat_config', 'insert,update,delete,truncate')
       or has_column_privilege('anon', 'public.hr_chat_config', 'note', 'select')
       or not has_function_privilege('authenticated', 'public.hr_chat_history_floor()', 'execute')
       or not has_function_privilege('anon', 'public.hr_chat_history_floor()', 'execute') then
      raise exception 'chat-stream-safe §7(g): the grants are not exact'; end if;
    raise exception using errcode = 'HR871', message = 'chat-stream-safe §7 complete - rolling back';
  exception when sqlstate 'HR871' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  -- (h) nothing leaked; the row, the triggers and the policies are in place.
  if exists (select 1 from public.chat_messages where from_id in (v_a, v_b))
     or exists (select 1 from public.chat_whispers where from_id in (v_a, v_b))
     or exists (select 1 from public.player_state where user_id in (v_a, v_b))
     or exists (select 1 from public.hr_name_blocklist where stem = 'zqxprobe') then
    raise exception 'chat-stream-safe §7(h): a probe row leaked'; end if;
  if (select count(*) from public.hr_chat_config) <> 1 then
    raise exception 'chat-stream-safe §7(h): hr_chat_config is not one row'; end if;
  if (select count(*) from pg_trigger where tgname = 'hr_chat_word_filter' and not tgisinternal
        and tgrelid in ('public.chat_messages'::regclass, 'public.chat_whispers'::regclass)) <> 2
     or (select count(*) from pg_policy where polname = 'hr_chat_history_floor' and not polpermissive
        and polrelid in ('public.chat_messages'::regclass, 'public.chat_whispers'::regclass)) <> 2 then
    raise exception 'chat-stream-safe §7(h): a filter trigger or a floor policy is missing'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'chat-stream-safe: history from the epoch and the horizon only, listed words masked on write and on read, no client bypass; all green';
end $mig$;
