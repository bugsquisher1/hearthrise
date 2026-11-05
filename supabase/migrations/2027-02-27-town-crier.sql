-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-27-town-crier.sql — THE TOWN CRIER: A PAID, HIGHLIGHTED LINE IN GLOBAL
--   (lane/c-town-shows, backend-architect, 2026-11-04; Tyler the same day: a paid highlighted server line whose price climbs per use per day;
--   the designer's board section "2026-11-04 Gold sinks").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on its
-- passing §4; ON THE EA SECURITY LIST: money, and a paid line that reaches every player. NO CHAT MUTE EXISTS ANYWHERE: the only stop for an abusive
-- line is a block, one player at a time, so the flag `town_crier` is the server-wide stop, and a per-account mute is on the EA Security list.
-- EDGE: no deploy. CLIENT: the Town Crier button rides the next release AFTER this applies.
-- APPLY ORDER: after 2027-02-27-gold-given.sql (the counter); before 2027-02-27-town-shows.sql (its window read calls the quote).
--
-- ── THE VERB ─────────────────────────────────────────────────────────────────
-- hr_crier_send(p_slot int, p_body text, p_price bigint, p_idem uuid): the player's line, through every gate chat has, then these. All of them answer
--   BEFORE the charge, and each refusal charges nothing:
--     bad_quote, bad_slot, bad_idem      a malformed call
--     crier_off                          the flag town_crier is off
--     hr_chat_body_fault's               empty, too_long, too_many_links, bad_link
--     crier_long {n}                     more than 120 letters
--     crier_links                        more than one item link
--     crier_link                         a web address
--     crier_word                         a word hr_chat_mask would change: masked stars aren't what anyone paid for
--     rate_limited                       its own bucket (3 a minute), and chat's two (the Crier counts against both)
--     crier_level {level, need}          under Level 10, so a throwaway account can't shout
--     crier_limit {per_day}              five a UTC day per ACCOUNT, across every hero (hr:sink:<uid>)
--     quote_changed {price, n}           the price the player saw isn't the one the server quotes now
--     crier_busy {wait_s}                the server's one line per 30 s
--     insufficient_gold                  hr_apply's
--   THE CHARGE: ONE hr_apply {gold: -price}, journalled kind shop, intent crier:line:<price>. Then the town's key: a line that lost the 30 s race RAISES and
--   the whole purchase rolls back, so nobody pays for a line nobody heard. Then the row (crier = true), and hr_gold_given_add, in the charge's transaction.
-- LOCK ORDER: hero, hr:sink:<uid>, hr_apply (the purse), hr:crier. One account's settle can't hold the Crier.
--
-- A hunting hero may cry: chat works in a hunt. The line is written by this verb, name and title stamped by hr_chat_name_authority, the body masked again
-- on write and on read by the chat's own triggers, and hidden from anyone who blocked the sender (chat_blocks on read, chat-store.js on push).
-- No client role can insert a chat row (§4 asserts it), so `crier = true` has no other path.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- A row at most every 30 s server-wide: 2,880 a day at the very most, however many players. Two partial indexes hold only those rows.
--
-- REVERSIBILITY: update public.hr_flags set enabled = false where key = 'town_crier' stops it at once. To remove: drop the verb and its baseline row, the
-- quote, the two indexes and the flag row. Gold spent stays spent.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_gold_given_add(uuid,integer,bigint)') is null then raise exception 'PRECONDITION: apply 2027-02-27-gold-given.sql first'; end if;
  if to_regprocedure('public.hr_sink_price(text,integer,integer)') is null or to_regprocedure('public.hr_sink_lock(uuid)') is null
     or to_regprocedure('public.hr_sink_bought_today(uuid,text,text[])') is null
     or not exists (select 1 from pg_attribute where attrelid = 'public.chat_messages'::regclass and attname = 'crier' and not attisdropped) then
    raise exception 'PRECONDITION: apply 2027-02-27-gold-sinks-seams.sql first'; end if;
  if not exists (select 1 from public.hr_sink_rules where sink_id = 'crier') then raise exception 'PRECONDITION: hr_sink_rules has no crier row'; end if;
  if to_regprocedure('public.hr_chat_mask(text)') is null or to_regprocedure('public.hr_chat_clean(text)') is null or to_regprocedure('public.hr_chat_body_fault(text)') is null
     or to_regprocedure('public.hr_rate_ok(uuid,text,integer,interval)') is null or to_regprocedure('public.hr_hunt_weapon_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: the chat''s gates are absent'; end if;
end $mig$;

-- ── §1 THE STOP, AND THE INDEXES ─────────────────────────────────────────────
insert into public.hr_flags (key, enabled, note) values
  ('town_crier', true, 'The Town Crier''s server-wide stop (2027-02-27-town-crier.sql): off, hr_crier_send answers crier_off and charges nothing. No per-account mute exists yet.')
  on conflict (key) do nothing;
create index if not exists chat_messages_crier_at on public.chat_messages (created_at desc) where crier;
create index if not exists chat_messages_crier_from on public.chat_messages (from_id, created_at desc) where crier;

-- A web address, in any of the shapes a line can carry one: a scheme, www, a known domain ending, or one spelled out ("discord dot gg").
create or replace function public.hr_crier_has_link(p_body text)
returns boolean language sql immutable set search_path = public, pg_catalog as $fn$
  select lower(regexp_replace(coalesce(p_body, ''), '\[\[(item|hunt):[a-z0-9_]{1,64}\]\]', ' ', 'g'))
         ~ '([a-z][a-z0-9+.-]*://|(^|[^a-z0-9])www[.]|[a-z0-9-][.](com|net|org|gg|io|tv|co|me|ly|app|xyz|info|ru|de|uk|us|ca|shop|link|site|online|club|fun|live|stream)([^a-z0-9]|$)|(^|[^a-z0-9])dot[[:space:]]+(com|net|org|gg|io|tv)([^a-z0-9]|$))'
$fn$;

-- ── §2 THE QUOTE (the window's read; the verb re-quotes under its lock) ──────
create or replace function public.hr_town_crier_quote(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare r public.hr_sink_rules%rowtype; v_n int; v_last timestamptz;
begin
  select * into r from public.hr_sink_rules where sink_id = 'crier';
  if not found then return null; end if;
  v_n := public.hr_sink_bought_today(p_user, 'crier');
  select max(m.created_at) into v_last from public.chat_messages m where m.crier;
  return jsonb_build_object('n', v_n, 'per_day', r.per_day, 'price', public.hr_sink_price('crier', v_n),
    'min_level', r.min_level, 'max_letters', r.max_letters, 'gap_s', r.gap_s, 'on', public.hr_flag_on('town_crier'),
    'wait_s', greatest(0, ceil(r.gap_s - extract(epoch from (now() - coalesce(v_last, now() - interval '1 day')))))::int,
    -- the last line this account paid for: one press to cry it again
    'last_line', (select m.body from public.chat_messages m where m.from_id = p_user and m.crier order by m.created_at desc limit 1));
end $fn$;

-- ── §3 THE VERB ──────────────────────────────────────────────────────────────
create or replace function public.hr_crier_send(p_slot int, p_body text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid   uuid := auth.uid();
  v_rule  public.hr_sink_rules%rowtype;
  v_verb  text; v_r jsonb; v_body text; v_fault text; v_ver bigint; v_n int; v_price bigint; v_lv int;
  v_last  timestamptz; v_wait int; v_a jsonb; v_row public.chat_messages%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 1 or p_price > 1000000000 then
    return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  v_verb := 'crier:line:' || p_price;
  -- A RETRY of a decided key answers that decision and charges nothing again
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('crier', p_slot, v_r); end if;
  if not public.hr_flag_on('town_crier') then
    return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'crier_off')); end if;
  select * into v_rule from public.hr_sink_rules where sink_id = 'crier';
  if not found then return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  -- THE WORDS, before anything else moves
  v_body := public.hr_chat_clean(p_body);
  v_fault := public.hr_chat_body_fault(v_body);
  if v_fault is not null then return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', v_fault)); end if;
  if length(v_body) > v_rule.max_letters then
    return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'crier_long', 'n', length(v_body), 'max', v_rule.max_letters)); end if;
  if (select count(*) from regexp_matches(v_body, '\[\[item:[a-z0-9_]{1,64}\]\]', 'g')) > 1 then
    return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'crier_links')); end if;
  if public.hr_crier_has_link(v_body) then
    return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'crier_link')); end if;
  if public.hr_chat_mask(v_body) is distinct from v_body then
    return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'crier_word')); end if;
  -- ITS OWN BUCKET, AND CHAT'S TWO
  if not public.hr_rate_ok(v_uid, 'crier', v_rule.per_minute, interval '1 minute')
     or not public.hr_rate_ok(v_uid, 'chat:burst', 5, interval '10 seconds')
     or not public.hr_rate_ok(v_uid, 'chat:send', 20, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- THE HERO: its lock, its row, its Level
  perform public.hr_hunt_lock(v_uid, p_slot);
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_lv := public.hr_level_of(v_uid, p_slot);
  if v_lv < v_rule.min_level then
    return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'crier_level', 'level', v_lv, 'need', v_rule.min_level)); end if;
  -- THE ACCOUNT'S DAY, under its key: two heroes pressing together pay the climb in order
  perform public.hr_sink_lock(v_uid);
  v_n := public.hr_sink_bought_today(v_uid, 'crier');
  -- past the ladder's top is the day's cap: tools/gen-gold-sinks.mjs holds per_day to the ladder's length
  v_price := public.hr_sink_price('crier', v_n);
  if v_price is null then
    return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'crier_limit', 'per_day', v_rule.per_day)); end if;
  if v_price <> p_price then
    return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'price', v_price, 'n', v_n)); end if;
  -- THE SERVER'S ONE LINE AT A TIME, read before the charge so the usual refusal charges nothing at all
  select max(m.created_at) into v_last from public.chat_messages m where m.crier;
  v_wait := ceil(v_rule.gap_s - extract(epoch from (now() - coalesce(v_last, now() - interval '1 day'))))::int;
  if v_wait > 0 then
    return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'crier_busy', 'wait_s', v_wait)); end if;
  begin
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'gold', -v_price,
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'town_crier', 'n', v_n + 1))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      return public.hr_note_rejection('crier', p_slot, v_a || jsonb_build_object('ok', false)); end if;
    -- THE TOWN'S KEY, LAST: a line that lost the race rolls back whole, charge and journal
    perform pg_advisory_xact_lock(hashtextextended('hr:crier', 0));
    select max(m.created_at) into v_last from public.chat_messages m where m.crier;
    v_wait := ceil(v_rule.gap_s - extract(epoch from (now() - coalesce(v_last, now() - interval '1 day'))))::int;
    if v_wait > 0 then raise exception using errcode = 'HR939', message = 'crier_busy'; end if;
    -- from_name and from_title are stamped by hr_chat_name_authority; the placeholder never shows
    insert into public.chat_messages (channel, from_id, from_name, body, from_slot, from_level, from_weapon, from_role, crier)
    values ('global', v_uid, 'Adventurer', v_body, p_slot, v_lv, public.hr_hunt_weapon_of(v_uid, p_slot), public.hr_chat_role_pick(v_uid, p_slot), true)
    returning * into v_row;
    perform public.hr_gold_given_add(v_uid, p_slot, v_price);
  exception when sqlstate 'HR939' then
    return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'crier_busy', 'wait_s', greatest(v_wait, 1)));
  end;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'price', v_price, 'n', v_n + 1, 'per_day', v_rule.per_day, 'line', public.hr_chat_row(v_row));
end $fn$;

do $mig$
declare f text;
begin
  foreach f in array array['public.hr_crier_has_link(text)', 'public.hr_town_crier_quote(uuid)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
  end loop;
  revoke execute on function public.hr_crier_send(integer, text, bigint, uuid) from public, anon, service_role;
  grant  execute on function public.hr_crier_send(integer, text, bigint, uuid) to authenticated;
end $mig$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_crier_send';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_crier_send', 'p_slot integer, p_body text, p_price bigint, p_idem uuid', 'authenticated',
   'added 2027-02-27 (town-crier): MONEY, and a shared surface: a paid highlighted line in Global, priced by the server from hr_sink_rules, climbing per account per UTC day; refuses quote_changed; every word and rate gate answers before the charge; one line per 30 s server-wide');

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000901d6c01';
  v jsonb; v_q jsonb; v_role text; v_gold bigint; v_rows int;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'town-crier §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'town-crier §4: hr_create_character refused: %', v; end if;
    update public.account_wallet set gold = 1000000 where user_id = v_u;
    -- (a) a low hero is refused, in order, before any charge
    v := public.hr_crier_send(0, 'selling rat tails', 1000, '000000c0-0000-4000-a000-0000901d6c11');
    if v->>'error' is distinct from 'crier_level' then raise exception 'town-crier §4(a): a Level 1 hero answered %', v; end if;
    -- (b) the words, before the charge: a web address, and a word the mask changes; a line long past 120 letters
    update public.player_state set level_xp = public.hr_char_xp_for_level(10) where user_id = v_u and slot = 0;
    v := public.hr_crier_send(0, 'join discord.gg/x now', 1000, '000000c0-0000-4000-a000-0000901d6c12');
    if v->>'error' is distinct from 'crier_link' then raise exception 'town-crier §4(b): a web address answered %', v; end if;
    v := public.hr_crier_send(0, repeat('a', 121), 1000, '000000c0-0000-4000-a000-0000901d6c13');
    if v->>'error' is distinct from 'crier_long' or (v->>'n')::int <> 121 then raise exception 'town-crier §4(b): a long line answered %', v; end if;
    v := public.hr_crier_send(0, 'selling rat tails', 999, '000000c0-0000-4000-a000-0000901d6c14');
    if v->>'error' is distinct from 'quote_changed' or (v->>'price')::bigint <> 1000 then raise exception 'town-crier §4(b): a forged price answered %', v; end if;
    if (select gold from public.account_wallet where user_id = v_u) <> 1000000 then raise exception 'town-crier §4(b): a refusal charged'; end if;
    -- (c) a clean line pays once, journals once, reaches Global as a Crier line, and counts once on the board
    v := public.hr_crier_send(0, 'selling rat tails', 1000, '000000c0-0000-4000-a000-0000901d6c15');
    if coalesce(v->>'ok', '') <> 'true' or (v->'line'->>'crier')::boolean is not true or v->'line'->>'channel' <> 'global' then raise exception 'town-crier §4(c): a clean line answered %', v; end if;
    select gold into v_gold from public.account_wallet where user_id = v_u;
    if v_gold <> 999000 then raise exception 'town-crier §4(c): the purse reads %', v_gold; end if;
    select count(*) into v_rows from public.player_ledger where user_id = v_u and kind = 'shop' and intent = 'crier:line:1000';
    if v_rows <> 1 then raise exception 'town-crier §4(c): % ledger rows', v_rows; end if;
    if (select sum(gold) from public.account_gold_given where user_id = v_u) <> 1000 then raise exception 'town-crier §4(c): Gold Given did not count it'; end if;
    -- (d) a replay charges nothing; the server's gap refuses the next line, charging nothing
    v := public.hr_crier_send(0, 'selling rat tails', 1000, '000000c0-0000-4000-a000-0000901d6c15');
    if (select gold from public.account_wallet where user_id = v_u) <> 999000 then raise exception 'town-crier §4(d): a replay charged again'; end if;
    v_q := public.hr_town_crier_quote(v_u);
    if (v_q->>'price')::bigint <> 2000 or (v_q->>'n')::int <> 1 or v_q->>'last_line' <> 'selling rat tails' then raise exception 'town-crier §4(d): the quote reads %', v_q; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_crier_send(0, 'more rat tails', 2000, '000000c0-0000-4000-a000-0000901d6c16');
    if v->>'error' is distinct from 'crier_busy' then raise exception 'town-crier §4(d): the second line inside the gap answered %', v; end if;
    if (select gold from public.account_wallet where user_id = v_u) <> 999000 then raise exception 'town-crier §4(d): the gap charged'; end if;
    -- (e) the flag stops it
    update public.hr_flags set enabled = false where key = 'town_crier';
    v := public.hr_crier_send(0, 'more rat tails', 2000, '000000c0-0000-4000-a000-0000901d6c17');
    if v->>'error' is distinct from 'crier_off' then raise exception 'town-crier §4(e): the flag off answered %', v; end if;
    raise exception using errcode = 'HR940', message = 'town-crier §4 complete - rolling back';
  exception when sqlstate 'HR940' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from auth.users where id = v_u) then
    raise exception 'town-crier §4: LEAKED a probe row'; end if;
  -- (f) GRANTS: only the verb is the client's, and no client role can write a chat row, so `crier = true` has no other path
  if not has_function_privilege('authenticated', 'public.hr_crier_send(integer,text,bigint,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_crier_send(integer,text,bigint,uuid)', 'execute') then
    raise exception 'town-crier §4(f): the verb''s grants are wrong'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_town_crier_quote(uuid)', 'execute') or has_function_privilege(v_role, 'public.hr_crier_has_link(text)', 'execute')
       or has_table_privilege(v_role, 'public.chat_messages', 'insert') or has_table_privilege(v_role, 'public.chat_messages', 'update') then
      raise exception 'town-crier §4(f): % reaches a helper or can write a chat row', v_role; end if;
  end loop;
  if not coalesce((select enabled from public.hr_flags where key = 'town_crier'), false) then raise exception 'town-crier §4(f): the flag is not on'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'town-crier: every word gate before the charge, one line per 30 s, the flag stops it; all green';
end $chk$;
