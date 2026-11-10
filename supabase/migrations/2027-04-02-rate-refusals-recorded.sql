-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-02-rate-refusals-recorded.sql — EVERY RATE-LIMITED REFUSAL LEAVES A TRACE
--   (lane/c-server-debt, backend-architect, 2026-11-10; .claude/coordination/DISCOVERIES.md 2026-11-10 row 2, P3 server:
--   "a rate-limited call returns rate_limited and writes no hr_rejections row (C2), so vitals --refusals cannot see chat
--   spam, scraping or a hammered gold sink").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit).
-- Pre-EA: applies on its passing §3. ON THE EA SECURITY LIST (it restates three gold verbs: hr_crier_send, hr_hearth_burn,
-- hr_town_works_give, and hr_town_show; no price, clamp, lock or ledger line of theirs moves, §3(c) proves it).
-- ORDER: after 2027-03-26-signout-presence.sql (§0 pins every body it restates). BEFORE 2027-04-02-town-walk-mask.sql, which
-- restates hr_town_move from this file's image. It reads and writes nothing of 2027-03-27 / -28 / -29 / -30 / -31: none of
-- hr_apply, hr_state_of, hr_load or the settle path is touched. DB-ONLY: no hr-accrue change, no client change.
--
-- ── WHAT WAS WRONG ───────────────────────────────────────────────────────────
-- hr_rpc_gate and hr_rate_gate record a sampled hr_rejections row when they refuse (C2, S6). The verbs written since
-- 2026-10-25 call hr_rate_ok themselves and return {ok:false, error:'rate_limited'} with no row: 29 refusals in
-- 25 functions at the chain's end (chat, whispers, friends, inspect, the town's walk and views, the Hearth, the
-- Crier, Town Works, a town show, the colours and the players-online read). Sustained rate limiting is the loudest
-- automation signal the server has, and for these verbs it was discarded.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_rate_refused(user, slot, bucket, limit, window) NEW, server-only. THE ONE RECORDER for a direct hr_rate_ok refusal:
--       the sampled write hr_apply makes (2026-10-27-core-bodies.sql "(1) Rate limit"): hr_rate_sample_weight of how far the
--       bucket is over, so the 1st, 10th, 50th and every 1000th refusal in a window write and the rest do not, each
--       carrying the gap it stands for (the day's n and the 50-a-day incident escalation count real refusals). The journal
--       row is hr_rejections' (user, slot, day, 'rate_limited'): `intent` and `verbs` name the bucket, as the gates do. The
--       slot is the caller's own 0..5, else -1 (a client number never becomes a new row key).
--   25 functions RESTATED WHOLE from the body the chain ends with (pg_get_functiondef on the replayed chain, not retyped):
--       each refusal gains ONE line, marked `-- RATE-JOURNAL`, that calls the recorder with the same user, bucket, limit and
--       window hr_rate_ok was just asked. Nothing else: a one-line refusal is the same statement over three lines, and
--       hr_crier_send's one compound refusal (`not A or not B or not C`) is its three buckets asked in the same order (the
--       expression short-circuited left to right already, so the same counters move; a bucket that was never asked is never
--       recorded from a stale counter). §3(c) takes this file's lines back out of every installed body and requires the
--       pre-image §0 pinned, by md5: the diff is only those lines.
--   NOT TOUCHED: hr_gm_stop_result's bare `return` (the bound on the Game Master journal write itself: recording that the
--       record was not written is the write it bounds); the Game Master verbs (hr_gm_close journals them); every
--       refusal that records already.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- No new door: hr_rate_refused is revoked from every client role and runs only inside these definer bodies. A caller
-- cannot choose what is written: the bucket and limit are the body's literals or catalogue values, the user is auth.uid(),
-- the slot is clamped. A refused caller cannot grow the journal: one row a (user, slot, day), at most four writes a window
-- however hard it hammers (S6). ACLs do not move (`create or replace` keeps them; §3(c) asserts each).
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- The refusal path gains one PK read of hr_rate_counters (unlogged) and, at a sample point, one upsert of the caller's own
-- hr_rejections row. It runs before any lock these verbs take and holds none. hr_record_rejection swallows its own
-- failures, so a refusal stays a clean refusal. The accepted path is byte-for-byte what it was. A second apply: §0 accepts
-- this file's own images and every statement is `create or replace` (byte-identical).
--
-- ── COST AT 100x ────────────────────────────────────────────────────────────
-- Nothing on an accepted call. On a refused one: a PK read, and a row write at the 1st / 10th / 50th / 1000th refusal of a
-- window. Rows: at most 7 an account a day in hr_rejections (slots 0..5 and -1), where the gates' row already lives;
-- pruned by hr-rejections-prune as before. No table, index or column.
--
-- REVERSIBILITY: re-apply each pre-image (the files §0's pins came from; the md5s name them) and drop hr_rate_refused. No
-- data moves. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regprocedure('public.hr_rate_ok(uuid,text,integer,interval)') is null or to_regprocedure('public.hr_rate_over(uuid,text)') is null
     or to_regprocedure('public.hr_rate_sample_weight(bigint)') is null
     or to_regprocedure('public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)') is null then
    raise exception 'PRECONDITION: hr_rate_ok / hr_rate_over / hr_rate_sample_weight / hr_record_rejection are absent'; end if;
  -- each body is EXACTLY the image this file was generated from (normalised md5) or this file's own, so a second apply after
  -- a later file moved one refuses, never undoes it
  for v_r in select * from (values
    ('public.hr_block_set(text,boolean)', '7a97684270ce8b9e5ea22d22a8900be3', '8169660fb7c28e5c9781d3280b303b18', true),
    ('public.hr_chat_recent(integer)', '18f8c572d31b07a561c212556e6a5877', '07e34dd1cd774e77c149c5a8af1cba8f', true),
    ('public.hr_chat_send(integer,text,text)', 'bb01f726ababc0d970db3a80741a39ef', 'e9ea89272a2143bd91ea09e2245af85e', true),
    ('public.hr_crier_send(integer,text,bigint,uuid)', '3a010fa6a973d1c4427a818d3850e2e5', 'c1811f9611b9e2d411eb7fd766703bde', true),
    ('public.hr_friend_answer(text,boolean)', 'f1792d70cb6240b6390e58f4ba620944', '51a65a3ab1659041e34aedd62e9d6523', true),
    ('public.hr_friend_remove(text)', '714391ffe3f87c159ba990ce975a7ecc', 'ade20e9a7422b5a82d815b941fe27baa', true),
    ('public.hr_friend_request(text)', 'b8cda3b2fe38a9ae76e16081db2fb7c0', 'ebdca47ef94de4af4f04143263145aed', true),
    ('public.hr_hearth_burn(integer,text,uuid)', '9e9070575ccacf50749d1c1819cdec6d', '0f2a8fe869bfe16eaebdcd3311a84125', true),
    ('public.hr_hero_colors_view(integer)', 'b13c71b0165a6298684bcd61f42d51de', '98aaacc11450c76d5e693e905611c89f', true),
    ('public.hr_inspect(text,integer)', 'e6e7a2ed39684391fe09df64ccd43661', 'f3d199be01882fe43a7438569100593a', true),
    ('public.hr_players_online(integer[])', 'f9d636dfab258bef48a945f97e8992c7', '778981c3ca5bd40d962e69666b7af9aa', false),
    ('public.hr_presence_leave()', '976945a3aba14dea44504318ba896707', '7b8c8c28a2cdd36692b6c2a76e0c5cb2', true),
    ('public.hr_social_poll(integer,integer[])', '2e2a0c71e61d4915a73d2c3a5b58d450', '2b96844b06f8b7b164938711de660ceb', true),
    ('public.hr_social_state(integer)', '4d2a240da1924993d3d2bacec788e3fc', '2a805d8e2c73fc50932a5aafc810b6f1', true),
    ('public.hr_town_go(integer,text)', '6ce84eb9eac49ba20e672a2b0397aa3d', '5da07d94754ccf91d892df2dccac4e1e', true),
    ('public.hr_town_here(integer,text)', 'deed37c82824e886b591cb1632e18c4b', '43a0bedd60126547e816a4a51c425314', true),
    ('public.hr_town_move(integer,text,integer,integer,integer,integer,text)', 'cdccab31182f0b4dda24ad1e91aea05f', 'f17722883f848431992cc8634fcb5ece', true),
    ('public.hr_town_show(integer,text,bigint,uuid)', '4389bbcd1c0d8913370e09c187142a61', '7cb9b88b6f5e29dca0564c7167fcdd02', true),
    ('public.hr_town_sinks_view(integer)', '8630e0215dc0fdf8970c883924f0dbd5', '54f0a768e3870837ec616de749c61cba', true),
    ('public.hr_town_view(integer,text,integer,integer,bigint,integer,integer)', 'ff2cc25fc03f8009684d5a7e6feea55e', '3f995a172d04b8c58f117f6de70a120f', true),
    ('public.hr_town_walkers(text)', 'bf82dd4d596f135e83a7af34e1dc8483', 'e23c3969fe6b77c7888e21d7a00df285', true),
    ('public.hr_town_works_give(integer,text,bigint,uuid)', '7a2945e24dc54d6dcd232746291e97c5', 'f43baa65298f6c66b601d74ce9ebb51e', true),
    ('public.hr_town_works_view(integer)', 'dd647a1e46d8b3f7cfd1b636ca5465e0', '4166597ddec99e1ca9f58cd52efdd02c', true),
    ('public.hr_whisper_send(integer,text,text)', 'dab619b519fe70419dd022f9c6b11d11', '39208d295cf559515442c6e263ea8723', true),
    ('public.hr_whispers_recent()', 'ee501e88913a1ed1185be58dbadeda81', '8521604f978f7eb0bcd318ee4b22997c', true)
    ) t(fn, pre, own, client) loop
    if to_regprocedure(v_r.fn) is null then raise exception 'PIN: % is absent', v_r.fn; end if;
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.own then
      raise exception 'PIN: % is neither its expected image (%) nor this file''s: md5 % - another file moved it', v_r.fn, v_r.pre, v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE ONE RECORDER ──────────────────────────────────────────────────────
-- Called on the line after a refused hr_rate_ok, with the same four values. hr_rate_ok has just counted this call, so
-- hr_rate_over reads how far over the bucket now is and the sample weight is exact.
create or replace function public.hr_rate_refused(p_user uuid, p_slot integer, p_bucket text, p_limit integer, p_window interval)
returns void language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare v_weight bigint;
begin
  if p_user is null or p_bucket is null then return; end if;
  v_weight := public.hr_rate_sample_weight(public.hr_rate_over(p_user, p_bucket) - greatest(1, coalesce(p_limit, 1)));
  if v_weight > 0 then
    perform public.hr_record_rejection(p_user, case when p_slot between 0 and 5 then p_slot else -1 end, p_bucket, 'rate_limited',
      jsonb_build_object('limit', p_limit, 'per', p_window::text), v_weight);
  end if;
end $fn$;
revoke all on function public.hr_rate_refused(uuid, integer, text, integer, interval) from public, anon, authenticated, service_role;
comment on function public.hr_rate_refused(uuid, integer, text, integer, interval) is
  '2027-04-02-rate-refusals-recorded.sql: the one recorder for a direct hr_rate_ok refusal. Sampled (hr_rate_sample_weight of how far over the bucket is: the 1st, 10th, 50th and every 1000th write, each carrying its gap), one hr_rejections row a (user, slot, day). Call it on the line after the refused hr_rate_ok with the same user, bucket, limit and window. Server-only.';

-- ── §2 THE 25 BODIES, RESTATED WHOLE (each `-- RATE-JOURNAL` line is this file's; nothing else differs) ──

-- hr_block_set(text,boolean): social:write
CREATE OR REPLACE FUNCTION public.hr_block_set(p_target text, p_on boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_t uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_on is null then return jsonb_build_object('ok', false, 'error', 'bad_intent'); end if;
  if not public.hr_rate_ok(v_uid, 'social:write', 20, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, null, 'social:write', 20, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_t := public.hr_social_resolve(p_target);
  if v_t is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if v_t = v_uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if p_on then
    if (select count(*) from public.chat_blocks where blocker_id = v_uid) >= 500 then
      return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
    insert into public.chat_blocks (blocker_id, blocked_id) values (v_uid, v_t) on conflict do nothing;
    delete from public.friend_links where user_lo = least(v_uid, v_t) and user_hi = greatest(v_uid, v_t);
    delete from public.friend_requests where (from_id = v_uid and to_id = v_t) or (from_id = v_t and to_id = v_uid);
  else
    delete from public.chat_blocks where blocker_id = v_uid and blocked_id = v_t;
  end if;
  return jsonb_build_object('ok', true, 'blocked', p_on, 'person', public.hr_social_person(v_t));
end $function$;

-- hr_chat_recent(integer): chat:read
CREATE OR REPLACE FUNCTION public.hr_chat_recent(p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
-- CHAT-STREAM-SAFE (2026-11-19): lines at or after hr_chat_history_floor(), every body masked.
declare v_uid uuid := auth.uid(); v_zone text; v_pid uuid; v_party text; v_floor timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'chat:read', 30, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, p_slot, 'chat:read', 30, interval '1 minute');  -- RATE-JOURNAL
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
end $function$;

-- hr_chat_send(integer,text,text): chat:burst, chat:send
CREATE OR REPLACE FUNCTION public.hr_chat_send(p_slot integer, p_kind text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid(); v_body text; v_fault text; v_channel text; v_pid uuid; v_aud uuid[];
  v_row public.chat_messages%rowtype; v_until timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  -- GM-TOOLS (2027-03-13-gm-tools.sql): a mute says so; hr_chat_zgm_gate is the second lock.
  v_until := public.hr_chat_muted_until(v_uid);
  if v_until is not null then return jsonb_build_object('ok', false, 'error', 'muted', 'until', v_until); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_kind is null or p_kind not in ('global', 'local', 'party') then return jsonb_build_object('ok', false, 'error', 'bad_channel'); end if;
  v_body := public.hr_chat_clean(p_body);
  v_fault := public.hr_chat_body_fault(v_body);
  if v_fault is not null then return jsonb_build_object('ok', false, 'error', v_fault); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if not public.hr_rate_ok(v_uid, 'chat:burst', 5, interval '10 seconds') then
    perform public.hr_rate_refused(v_uid, p_slot, 'chat:burst', 5, interval '10 seconds');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_rate_ok(v_uid, 'chat:send', 20, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, p_slot, 'chat:send', 20, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_kind = 'global' then
    v_channel := 'global';
  elsif p_kind = 'local' then
    v_channel := public.hr_chat_zone_of(v_uid, p_slot);
  else
    v_pid := public.hr_hunt_party_of(v_uid, p_slot);
    if v_pid is null then return jsonb_build_object('ok', false, 'error', 'not_in_party'); end if;
    v_channel := 'party:' || v_pid::text;
    select array_agg(distinct m.user_id) into v_aud from public.hunt_party_members m where m.party_id = v_pid;
  end if;
  -- from_id and from_name are overwritten by hr_chat_name_authority from the session and profiles.
  insert into public.chat_messages (channel, from_id, from_name, body, from_slot, from_level, from_weapon, from_role, audience)
  values (v_channel, v_uid, 'Adventurer', v_body, p_slot,
          public.hr_level_of(v_uid, p_slot), public.hr_hunt_weapon_of(v_uid, p_slot),
          public.hr_chat_role_pick(v_uid, p_slot), v_aud)
  returning * into v_row;
  return jsonb_build_object('ok', true, 'line', public.hr_chat_row(v_row));
end $function$;

-- hr_crier_send(integer,text,bigint,uuid): crier, chat:burst, chat:send
CREATE OR REPLACE FUNCTION public.hr_crier_send(p_slot integer, p_body text, p_price bigint, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
  -- CRIER-MUTED (2027-03-16-crier-muted.sql): a mute is said before the rule, the words or the charge; the row's lock stays the second one
  if public.hr_chat_muted_until(v_uid) is not null then
    return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'muted', 'until', public.hr_chat_muted_until(v_uid))); end if;
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
  if not public.hr_rate_ok(v_uid, 'crier', v_rule.per_minute, interval '1 minute') then  -- RATE-JOURNAL: one of the compound refusal's buckets, in its order
    perform public.hr_rate_refused(v_uid, p_slot, 'crier', v_rule.per_minute, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;  -- RATE-JOURNAL
  if not public.hr_rate_ok(v_uid, 'chat:burst', 5, interval '10 seconds') then  -- RATE-JOURNAL: one of the compound refusal's buckets, in its order
    perform public.hr_rate_refused(v_uid, p_slot, 'chat:burst', 5, interval '10 seconds');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;  -- RATE-JOURNAL
  if not public.hr_rate_ok(v_uid, 'chat:send', 20, interval '1 minute') then  -- RATE-JOURNAL: one of the compound refusal's buckets, in its order
    perform public.hr_rate_refused(v_uid, p_slot, 'chat:send', 20, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;  -- RATE-JOURNAL
  -- THE HERO: its lock, its row, its Level
  perform public.hr_hunt_lock(v_uid, p_slot);
  -- A SECOND PRESS OF ONE KEY that waited on that lock answers the first one's decision
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('crier', p_slot, v_r); end if;
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
end $function$;

-- hr_friend_answer(text,boolean): social:write
CREATE OR REPLACE FUNCTION public.hr_friend_answer(p_target text, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_t uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_accept is null then return jsonb_build_object('ok', false, 'error', 'bad_intent'); end if;
  if not public.hr_rate_ok(v_uid, 'social:write', 20, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, null, 'social:write', 20, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_t := public.hr_social_resolve(p_target);
  if v_t is null or not exists (select 1 from public.friend_requests where from_id = v_t and to_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'no_request'); end if;
  delete from public.friend_requests where (from_id = v_t and to_id = v_uid) or (from_id = v_uid and to_id = v_t);
  if p_accept then
    if public.hr_social_blocked(v_uid, v_t) then return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
    if (select count(*) from public.friend_links where user_lo = v_uid or user_hi = v_uid) >= 200 then
      return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
    insert into public.friend_links (user_lo, user_hi) values (least(v_uid, v_t), greatest(v_uid, v_t)) on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true, 'state', case when p_accept then 'friends' else 'declined' end,
                            'person', public.hr_social_person(v_t));
end $function$;

-- hr_friend_remove(text): social:write
CREATE OR REPLACE FUNCTION public.hr_friend_remove(p_target text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_t uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'social:write', 20, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, null, 'social:write', 20, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_t := public.hr_social_resolve(p_target);
  if v_t is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  delete from public.friend_links where user_lo = least(v_uid, v_t) and user_hi = greatest(v_uid, v_t);
  delete from public.friend_requests where (from_id = v_t and to_id = v_uid) or (from_id = v_uid and to_id = v_t);
  return jsonb_build_object('ok', true, 'state', 'none', 'person', public.hr_social_person(v_t));
end $function$;

-- hr_friend_request(text): social:write
CREATE OR REPLACE FUNCTION public.hr_friend_request(p_target text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_t uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'social:write', 20, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, null, 'social:write', 20, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_t := public.hr_social_resolve(p_target);
  if v_t is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if v_t = v_uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if public.hr_social_blocked(v_uid, v_t) or not public.hr_admitted(v_t) then
    return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  if public.hr_social_friends(v_uid, v_t) then return jsonb_build_object('ok', false, 'error', 'already_friends'); end if;
  if exists (select 1 from public.friend_requests where from_id = v_t and to_id = v_uid) then
    if (select count(*) from public.friend_links where user_lo = v_uid or user_hi = v_uid) >= 200 then
      return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
    delete from public.friend_requests where (from_id = v_t and to_id = v_uid) or (from_id = v_uid and to_id = v_t);
    insert into public.friend_links (user_lo, user_hi) values (least(v_uid, v_t), greatest(v_uid, v_t)) on conflict do nothing;
    return jsonb_build_object('ok', true, 'state', 'friends', 'person', public.hr_social_person(v_t));
  end if;
  if (select count(*) from public.friend_requests where from_id = v_uid) >= 50 then
    return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  insert into public.friend_requests (from_id, to_id) values (v_uid, v_t) on conflict do nothing;
  return jsonb_build_object('ok', true, 'state', 'requested', 'person', public.hr_social_person(v_t));
end $function$;

-- hr_hearth_burn(integer,text,uuid): hearth_burn
CREATE OR REPLACE FUNCTION public.hr_hearth_burn(p_slot integer, p_item text, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_per_min constant int := 10;
  v_uid   uuid := auth.uid();
  v_verb  text;
  v_r     jsonb;
  v_ver   bigint;
  v_hunt  text;
  v_fuel  public.hr_hearth_named%rowtype;
  v_rule  public.hr_hearth_rule%rowtype;
  v_have  bigint; v_lv int; v_n int;
  v_map   text;
  v_start timestamptz; v_end timestamptz;
  v_a     jsonb; v_quiet boolean; v_msg uuid; v_place jsonb; v_me jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_item is null or p_item !~ '^[a-z0-9_]{1,64}$' then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'not_a_fuel')); end if;
  v_verb := 'hearth_burn:' || p_item;
  -- A RETRY of a decided key answers that decision (a burn already made answers ok and burns nothing again)
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hearth_burn', p_slot, v_r); end if;
  if not public.hr_rate_ok(v_uid, 'hearth_burn', c_per_min, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, p_slot, 'hearth_burn', c_per_min, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- THE HERO: its lock, its row, its open hunt (the Hearth is in town)
  perform public.hr_hunt_lock(v_uid, p_slot);
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select h.hunt_id into v_hunt from public.hunt_sessions h where h.user_id = v_uid and h.slot = p_slot and h.ended_at is null;
  if v_hunt is not null then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'hunting', 'hunt', v_hunt)); end if;
  -- THE CATALOGUE: a named fuel, and the rule
  select * into v_fuel from public.hr_hearth_named where item_id = p_item;
  if not found then return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'not_a_fuel')); end if;
  select * into v_rule from public.hr_hearth_rule where id;
  v_map := (select m.map_id from public.hr_town_maps m where m.main);
  if not found or v_rule.id is null or v_map is null then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  -- THE HERO HOLDS ONE, IN ITS BAG (the item menu is the bag's)
  select qty into v_have from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = p_item;
  if coalesce(v_have, 0) < 1 then return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'no_item')); end if;
  -- ITS INNER FLAME, as the server holds it
  v_lv := public.hr_skill_level('inner_flame', coalesce((select s.xp from public.player_skills s
                                                          where s.user_id = v_uid and s.slot = p_slot and s.skill_id = 'inner_flame'), 0));
  if v_lv < v_fuel.req_lv then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'flame_too_low', 'need', v_fuel.req_lv, 'have', v_lv)); end if;
  -- THE HERO'S DAY (the server's UTC day)
  select count(*) into v_n from public.hearth_flames f
   where f.user_id = v_uid and f.slot = p_slot and f.created_at >= public.hr_utc_day_start(now());
  if v_n >= v_rule.per_day then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'hearth_limit', 'per_day', v_rule.per_day)); end if;
  -- THE TOWN'S HEARTH, READ BEFORE THE BURN so the usual refusal moves nothing: one burn at a time per town; a colour queues behind the last one, up to queue_s ahead
  v_start := greatest(now(), coalesce((select max(f.ends_at) from public.hearth_flames f where f.map_id = v_map), now()));
  if v_start > now() + make_interval(secs => v_rule.queue_s) then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'hearth_busy',
      'wait_s', ceil(extract(epoch from (v_start - now())) - v_rule.queue_s)::int)); end if;
  begin
    -- THE BURN: the item and the XP, journalled, exactly once on this key
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'items', jsonb_build_object(p_item, -1),
             'xp', jsonb_build_object('inner_flame', v_fuel.xp),
             'journal', jsonb_build_object('kind', 'craft', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'hearth_named', 'flame', v_fuel.flame, 'secs', v_fuel.secs,
                                                                      'from', v_start, 'map', v_map))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      return public.hr_note_rejection('hearth_burn', p_slot, v_a || jsonb_build_object('ok', false)); end if;
    -- THE HEARTH'S KEY, LAST, as hr_town_show takes it: held over hr_apply it deadlocked a burn against the same account's powder (tests/town-shows-race.mjs R4).
    -- A queue that filled while this waited raises and rolls the burn back whole: the item and the XP stay where they were.
    perform pg_advisory_xact_lock(hashtextextended('hr:hearth:' || v_map, 0));
    v_start := greatest(now(), coalesce((select max(f.ends_at) from public.hearth_flames f where f.map_id = v_map), now()));
    if v_start > now() + make_interval(secs => v_rule.queue_s) then raise exception using errcode = 'HR942', message = 'hearth_busy'; end if;
    v_end := v_start + make_interval(secs => v_fuel.secs);
    -- THE SQUARE: a system line naming the burner (never a quiet hero), then the colour
    select coalesce(ps.presence_quiet, false) into v_quiet from public.player_state ps where ps.user_id = v_uid and ps.slot = p_slot;
    if not v_quiet then
      v_msg := gen_random_uuid();
      -- from_name is stamped by hr_chat_name_authority (the character's name); the placeholder never shows
      insert into public.chat_messages (id, channel, from_id, from_name, from_slot, body)
      values (v_msg, 'system', v_uid, 'Adventurer', p_slot, 'fed the Great Hearth a [[item:' || p_item || ']].');
    end if;
    insert into public.hearth_flames (map_id, item_id, flame, user_id, slot, starts_at, ends_at, message_id)
    values (v_map, p_item, v_fuel.flame, v_uid, p_slot, v_start, v_end, v_msg);
    -- A NAMED FUEL NEVER WAITS: bought flames move out of its way, each still burning for every second paid for
    perform public.hr_town_show_push(v_map, v_start, v_end);
  exception when sqlstate 'HR942' then
    return public.hr_note_rejection('hearth_burn', p_slot, jsonb_build_object('ok', false, 'error', 'hearth_busy',
      'wait_s', greatest(1, ceil(extract(epoch from (v_start - now())) - v_rule.queue_s))::int));
  end;
  -- THE HERO WALKS TO THE FIRE: a free fuel stand (display presence; no output waits on it)
  if public.hr_flag_on('town_presence') then
    insert into public.town_seen as ts (user_id, slot, seen_at) values (v_uid, p_slot, now())
      on conflict (user_id, slot) do update set seen_at = excluded.seen_at;
    v_place := public.hr_town_place(v_uid, p_slot, v_map, 'hearth', 'visit');
    if v_place->>'ok' = 'true' then v_me := v_place->'me'; end if;
  end if;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'item', p_item, 'xp', v_fuel.xp,
    'flame', jsonb_build_object('flame', v_fuel.flame, 'from_ms', floor(extract(epoch from v_start) * 1000)::bigint,
                                'until_ms', floor(extract(epoch from v_end) * 1000)::bigint),
    'me', v_me);
end $function$;

-- hr_hero_colors_view(integer): hero_colors
CREATE OR REPLACE FUNCTION public.hr_hero_colors_view(p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_price bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'hero_colors', 60, interval '1 minute') then  -- RATE-JOURNAL: was one line
    perform public.hr_rate_refused(v_uid, p_slot, 'hero_colors', 60, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;  -- RATE-JOURNAL
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  v_price := public.hr_hero_colors_price(v_uid, p_slot);
  if v_price is null then return jsonb_build_object('ok', false, 'error', 'catalogue_missing'); end if;
  return jsonb_build_object('ok', true, 'price', v_price);
end $function$;

-- hr_inspect(text,integer): inspect
CREATE OR REPLACE FUNCTION public.hr_inspect(p_target text, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_t uuid; v_slot int;
begin
  -- SOCIAL-PASS: the 2026-10-27 body; a typed name opens THAT character, an id the slot asked else the current one.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'inspect', 30, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, p_slot, 'inspect', 30, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select t.target_user, t.target_slot into v_t, v_slot from public.hr_social_target(p_target) t;
  if v_t is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if v_t <> v_uid and (public.hr_social_blocked(v_uid, v_t) or not public.hr_admitted(v_t)) then
    return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  if p_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_slot := coalesce((select ps.slot from public.player_state ps where ps.user_id = v_t and ps.slot = p_slot), v_slot);
  end if;
  if v_slot is null or not exists (select 1 from public.player_state ps where ps.user_id = v_t and ps.slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  return jsonb_build_object('ok', true, 'id', v_t, 'name', left(public.hr_character_name(v_t, v_slot), 24), 'slot', v_slot,
    -- TITLES (2027-02-28-titles.sql): the worn title, a catalogue's words, or null.
    'title', left(public.hr_title_of(v_t, v_slot), 40),
    'level', public.hr_level_of(v_t, v_slot), 'weapon', public.hr_hunt_weapon_of(v_t, v_slot),
    'role', public.hr_chat_role_pick(v_t, v_slot),
    'gear', coalesce((select jsonb_agg(jsonb_build_object('slot', e.equip_slot, 'item', e.item_id) order by e.equip_slot)
                        from public.player_equipment e where e.user_id = v_t and e.slot = v_slot), '[]'::jsonb));
end $function$;

-- hr_players_online(integer[]): online
CREATE OR REPLACE FUNCTION public.hr_players_online(p_slots integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- PLAYERS-ONLINE (2026-11-07-players-online.sql)
  c_floor  constant interval := interval '20 seconds';   -- one stamp per character per floor
  c_online constant interval := interval '75 seconds';   -- online = seen within (hr_social_state's window)
  c_fresh  constant interval := interval '15 seconds';   -- how old the shared count may be
  v_uid uuid := auth.uid();
  v_n   integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slots is not null and (cardinality(p_slots) > 8 or exists (select 1 from unnest(p_slots) s where s is null or s < 0 or s > 32)) then
    return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'online', 6, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, null, 'online', 6, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- The caller's OWN characters only (a player_state row), never a slot it does not hold.
  if p_slots is not null and cardinality(p_slots) > 0 then
    insert into public.character_presence as cp (user_id, slot, seen_at)
      select ps.user_id, ps.slot, now() from public.player_state ps where ps.user_id = v_uid and ps.slot = any (p_slots)
    on conflict (user_id, slot) do update set seen_at = excluded.seen_at
      where cp.seen_at < now() - c_floor or cp.seen_at > now() + interval '60 seconds';
  end if;
  -- One ask per c_fresh recounts for everyone; a concurrent ask waits on the row, then finds it fresh.
  update public.hr_players_online_cache c
     set n = (select count(*) from public.character_presence cp
               where cp.seen_at > now() - c_online and cp.seen_at <= now() + interval '60 seconds'
                 and not exists (select 1 from public.player_state ps
                                  where ps.user_id = cp.user_id and ps.slot = cp.slot and ps.presence_quiet)),
         at = now()
   where c.id and c.at < now() - c_fresh
  returning c.n into v_n;
  if v_n is null then select c.n into v_n from public.hr_players_online_cache c where c.id; end if;
  return jsonb_build_object('ok', true, 'online', coalesce(v_n, 0));
end $function$;

-- hr_presence_leave(): presence:leave
CREATE OR REPLACE FUNCTION public.hr_presence_leave()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_edge timestamptz := now() - public.hr_party_away_after();   -- a stamp at or before this reads "not online" everywhere
begin
  -- SIGNOUT-PRESENCE (2027-03-26-signout-presence.sql): the caller's own rows, the server's clock, no argument.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'presence:leave', 6, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, null, 'presence:leave', 6, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- The account's row first and always locked, as the poll takes them (hr_social_state, then hr_players_online): one lock
  -- order, so a poll and a leave of one account queue here and never deadlock on its heroes' rows.
  perform 1 from public.social_presence sp where sp.user_id = v_uid for update;
  -- KEPT (hr_social_slot, hr_party_last_seen read it), moved back only while it still reads online: a second call writes nothing.
  update public.social_presence sp set seen_at = v_edge where sp.user_id = v_uid and sp.seen_at > v_edge;
  -- No client has this account's heroes open: every one of its rows, hunting or not (hr_playing reads none of them).
  delete from public.character_presence cp where cp.user_id = v_uid;
  return jsonb_build_object('ok', true);
end $function$;

-- hr_social_poll(integer,integer[]): social:poll
CREATE OR REPLACE FUNCTION public.hr_social_poll(p_slot integer, p_slots integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_state jsonb; v_count jsonb;
begin
  -- SOCIAL-POLL (2027-02-17-social-poll.sql): both answers, one request; a refused read asks no count.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'social:poll', 10, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, p_slot, 'social:poll', 10, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_state := public.hr_social_state(p_slot);
  if v_state->>'ok' is distinct from 'true' then return v_state; end if;
  v_count := public.hr_players_online(p_slots);
  return v_state || jsonb_build_object('online', case when v_count->>'ok' = 'true' then v_count->'online' end);
end $function$;

-- hr_social_state(integer): social:read
CREATE OR REPLACE FUNCTION public.hr_social_state(p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_floor constant interval := interval '20 seconds';
  c_online constant interval := interval '75 seconds';
  v_uid uuid := auth.uid();
begin
  -- SOCIAL-PASS: the 2026-10-25 body; a friend's quiet flag is read on hr_social_slot, the character its row names.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'social:read', 20, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, p_slot, 'social:read', 20, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    insert into public.social_presence as sp (user_id, slot, seen_at) values (v_uid, p_slot, now())
    on conflict (user_id) do update set slot = excluded.slot, seen_at = excluded.seen_at
      where sp.seen_at < now() - c_floor or sp.slot <> excluded.slot;
  end if;
  return jsonb_build_object('ok', true, 'me', v_uid,
    'friends', coalesce((
      select jsonb_agg(public.hr_social_person(f.other)
               || case when q.quiet then jsonb_build_object('online', false, 'doing', null)
                       else jsonb_build_object('online', coalesce(sp.seen_at > now() - c_online, false),
                                               'doing', public.hr_social_doing(f.other)) end
             order by public.hr_social_name(f.other), f.other)
        from (select case when l.user_lo = v_uid then l.user_hi else l.user_lo end as other
                from public.friend_links l where l.user_lo = v_uid or l.user_hi = v_uid) f
        left join public.social_presence sp on sp.user_id = f.other
        cross join lateral (select coalesce((select ps.presence_quiet from public.player_state ps
                                              where ps.user_id = f.other and ps.slot = public.hr_social_slot(f.other)), false) as quiet) q), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(public.hr_social_person(r.from_id) order by r.created_at)
                            from public.friend_requests r where r.to_id = v_uid), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(public.hr_social_person(r.to_id) order by r.created_at)
                            from public.friend_requests r where r.from_id = v_uid), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(public.hr_social_person(b.blocked_id) order by b.created_at)
                          from public.chat_blocks b where b.blocker_id = v_uid), '[]'::jsonb));
end $function$;

-- hr_town_go(integer,text): town_go
CREATE OR REPLACE FUNCTION public.hr_town_go(p_slot integer, p_station text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_per_min constant int := 20;
  v_uid  uuid := auth.uid();
  v_slot int := coalesce(p_slot, -1);
  v_map  text;
  v_r    jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_flag_on('town_presence') then return jsonb_build_object('ok', true, 'off', true); end if;
  if not public.hr_rate_ok(v_uid, 'town_go', c_per_min, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, p_slot, 'town_go', c_per_min, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if exists (select 1 from public.hunt_sessions h where h.user_id = v_uid and h.slot = v_slot and h.ended_at is null) then
    return jsonb_build_object('ok', false, 'error', 'hunting'); end if;
  v_map := coalesce((select b.map_id from public.town_bodies b where b.user_id = v_uid and b.slot = v_slot),
                    (select m.map_id from public.hr_town_maps m where m.main));
  if p_station is not null and not exists (select 1 from public.hr_town_stations s
                                           where s.map_id = v_map and s.station_id = p_station and s.role in ('visit', 'idle', 'bench')) then
    return jsonb_build_object('ok', false, 'error', 'unknown_station'); end if;
  perform public.hr_town_moves_settle(v_map, 4, v_uid, v_slot);
  insert into public.town_seen as ts (user_id, slot, seen_at) values (v_uid, v_slot, now())
    on conflict (user_id, slot) do update set seen_at = excluded.seen_at;
  if p_station is null then
    v_r := public.hr_town_place_pointer(v_uid, v_slot, v_map);
  else
    v_r := public.hr_town_place(v_uid, v_slot, v_map, p_station, 'visit');
  end if;
  if v_r->>'ok' is distinct from 'true' then return v_r; end if;
  return jsonb_build_object('ok', true, 'me', public.hr_town_me(v_uid, v_slot));
end $function$;

-- hr_town_here(integer,text): town_here
CREATE OR REPLACE FUNCTION public.hr_town_here(p_slot integer, p_map text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_per_min constant int := 30;
  v_uid  uuid := auth.uid();
  v_slot int := coalesce(p_slot, -1);
  v_r    jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_flag_on('town_presence') then return jsonb_build_object('ok', true, 'off', true); end if;
  if not public.hr_rate_ok(v_uid, 'town_here', c_per_min, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, p_slot, 'town_here', c_per_min, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if not exists (select 1 from public.hr_town_maps where map_id = p_map) then
    return jsonb_build_object('ok', false, 'error', 'bad_map'); end if;
  if exists (select 1 from public.hunt_sessions h where h.user_id = v_uid and h.slot = v_slot and h.ended_at is null) then
    return jsonb_build_object('ok', false, 'error', 'hunting'); end if;
  -- its own pending changes first (its hunt just ended), so it is placed where they say
  perform public.hr_town_moves_settle(p_map, 4, v_uid, v_slot);
  insert into public.town_seen as ts (user_id, slot, seen_at) values (v_uid, v_slot, now())
    on conflict (user_id, slot) do update set seen_at = excluded.seen_at;
  -- a steered tile stays where the hero was left (a switch is not a move)
  update public.town_positions set at = now() where user_id = v_uid and slot = v_slot and map_id = p_map;
  if not exists (select 1 from public.town_bodies b where b.user_id = v_uid and b.slot = v_slot and b.map_id = p_map and b.station_id is not null) then
    v_r := public.hr_town_place_pointer(v_uid, v_slot, p_map);
    if v_r->>'ok' is distinct from 'true' then return v_r; end if;
  else
    perform public.hr_town_merge_party(v_uid, p_map);
  end if;
  perform public.hr_town_moves_settle(p_map, 8);
  return jsonb_build_object('ok', true, 'me', public.hr_town_me(v_uid, v_slot));
end $function$;

-- hr_town_move(integer,text,integer,integer,integer,integer,text): town_move
CREATE OR REPLACE FUNCTION public.hr_town_move(p_slot integer, p_map text, p_x integer, p_y integer, p_gx integer, p_gy integer, p_dir text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- The floor: a write inside this of the last is answered and not made. The
  -- client publishes at most once a second (src/data/town-presence.js).
  c_floor   constant interval := interval '250 milliseconds';
  c_per_min constant int := 90;
  v_uid  uuid := auth.uid();
  v_slot int := coalesce(p_slot, -1);
  v_map  public.hr_town_maps%rowtype;
  v_last timestamptz;
begin
  -- TOWN-STANDS (2027-01-28-town-stands.sql): a body is placed on the first publish; moved_at is a real move only.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_flag_on('town_presence') then return jsonb_build_object('ok', true, 'off', true); end if;
  if not public.hr_rate_ok(v_uid, 'town_move', c_per_min, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, p_slot, 'town_move', c_per_min, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  -- LEAVING: this character's body goes (another character of the account keeps its own); a hero working a town
  -- activity stays at its station (the server plays it, viewed or not).
  if p_map is null then
    delete from public.town_positions where user_id = v_uid and slot = v_slot;
    delete from public.town_seen where user_id = v_uid and slot = v_slot;
    if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = v_slot and public.hr_town_work_kind(ps.active_kind)) then
      perform public.hr_town_release(v_uid, v_slot);
    end if;
    return jsonb_build_object('ok', true, 'left', true);
  end if;
  select * into v_map from public.hr_town_maps where map_id = p_map;
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_map'); end if;
  if p_x is null or p_y is null or p_gx is null or p_gy is null
     or p_x < 0 or p_x >= v_map.w or p_y < 0 or p_y >= v_map.h
     or p_gx < 0 or p_gx >= v_map.w or p_gy < 0 or p_gy >= v_map.h
     or p_dir is null or p_dir not in ('n', 's', 'e', 'w') then
    return jsonb_build_object('ok', false, 'error', 'bad_position'); end if;
  -- A HUNTER IS NOT IN TOWN: an open hunt session refuses, and takes the body out.
  if exists (select 1 from public.hunt_sessions h where h.user_id = v_uid and h.slot = v_slot and h.ended_at is null) then
    delete from public.town_positions where user_id = v_uid and slot = v_slot;
    return jsonb_build_object('ok', false, 'error', 'hunting'); end if;
  select at into v_last from public.town_positions where user_id = v_uid and slot = v_slot;
  if v_last is not null and now() - v_last < c_floor then
    return jsonb_build_object('ok', true, 'stamped', false); end if;
  insert into public.town_positions as tp (user_id, slot, map_id, x, y, gx, gy, dir, at, moved_at)
    values (v_uid, v_slot, p_map, p_x, p_y, p_gx, p_gy, p_dir, now(), now())
  on conflict (user_id, slot) do update
    set map_id = excluded.map_id, x = excluded.x, y = excluded.y,
        gx = excluded.gx, gy = excluded.gy, dir = excluded.dir, at = excluded.at,
        moved_at = case when (tp.map_id, tp.x, tp.y, tp.gx, tp.gy, tp.dir)
                             is distinct from (excluded.map_id, excluded.x, excluded.y, excluded.gx, excluded.gy, excluded.dir)
                        then excluded.at else tp.moved_at end;
  -- the first publish stands the body on the server's stand (a walk then starts from there)
  if not exists (select 1 from public.town_bodies b where b.user_id = v_uid and b.slot = v_slot and b.map_id = p_map and b.station_id is not null) then
    perform public.hr_town_place_pointer(v_uid, v_slot, p_map);
  end if;
  return jsonb_build_object('ok', true, 'stamped', true);
end $function$;

-- hr_town_show(integer,text,bigint,uuid): town_show
CREATE OR REPLACE FUNCTION public.hr_town_show(p_slot integer, p_show text, p_price bigint, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_rule  public.hr_sink_rules%rowtype;
  v_verb  text; v_r jsonb; v_ver bigint; v_hunt text; v_map text; v_n int; v_price bigint;
  v_free  timestamptz; v_end timestamptz; v_a jsonb; v_quiet boolean; v_msg uuid; v_place jsonb; v_me jsonb; v_behind text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('town_show', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('town_show', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 1 or p_price > 1000000000 then
    return public.hr_note_rejection('town_show', p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  if p_show is null or p_show !~ '^[a-z0-9_]{1,32}$' then
    return public.hr_note_rejection('town_show', p_slot, jsonb_build_object('ok', false, 'error', 'not_a_show')); end if;
  v_verb := 'town_show:' || p_show || ':' || p_price;
  -- A RETRY of a decided key answers that decision and charges nothing again
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('town_show', p_slot, v_r); end if;
  -- THE CATALOGUE: a show row names this offer
  select * into v_rule from public.hr_sink_rules r where p_show = any (r.offers) and r.seconds is not null;
  if not found then return public.hr_note_rejection('town_show', p_slot, jsonb_build_object('ok', false, 'error', 'not_a_show')); end if;
  v_map := (select m.map_id from public.hr_town_maps m where m.main);
  if v_map is null then return public.hr_note_rejection('town_show', p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  if not public.hr_rate_ok(v_uid, 'town_show', v_rule.per_minute, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, p_slot, 'town_show', v_rule.per_minute, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- THE HERO: its lock, its row, its open hunt (the shows are in town)
  perform public.hr_hunt_lock(v_uid, p_slot);
  -- A SECOND PRESS OF ONE KEY that waited on that lock answers the first one's decision
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('town_show', p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('town_show', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select h.hunt_id into v_hunt from public.hunt_sessions h where h.user_id = v_uid and h.slot = p_slot and h.ended_at is null;
  if v_hunt is not null then
    return public.hr_note_rejection('town_show', p_slot, jsonb_build_object('ok', false, 'error', 'hunting', 'hunt', v_hunt, 'sink', v_rule.sink_id)); end if;
  -- THE ACCOUNT'S DAY, under its key: two heroes pressing together pay the climb in order
  perform public.hr_sink_lock(v_uid);
  v_n := public.hr_sink_bought_today(v_uid, 'town_show', v_rule.offers);
  -- past the ladder's top is the day's cap: tools/gen-gold-sinks.mjs holds per_day to the ladder's length
  v_price := public.hr_sink_price(v_rule.sink_id, v_n);
  if v_price is null then
    return public.hr_note_rejection('town_show', p_slot, jsonb_build_object('ok', false, 'error', 'show_limit', 'sink', v_rule.sink_id, 'per_day', v_rule.per_day)); end if;
  if v_price <> p_price then
    return public.hr_note_rejection('town_show', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'sink', v_rule.sink_id, 'price', v_price, 'n', v_n, 'per_day', v_rule.per_day)); end if;
  -- THE TOWN'S QUEUE, read before the charge so the usual refusal charges nothing at all
  v_free := public.hr_town_show_free_at(v_map, v_rule.sink_id);
  if v_free > now() + make_interval(secs => v_rule.book_s) then
    return public.hr_note_rejection('town_show', p_slot, jsonb_build_object('ok', false, 'error', 'show_busy', 'sink', v_rule.sink_id,
      'wait_s', ceil(extract(epoch from (v_free - now())) - v_rule.book_s)::int, 'booked_s', ceil(extract(epoch from (v_free - now())))::int)); end if;
  begin
    -- THE CHARGE: gold only, never an xp key and never an item. Exactly one journal row.
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'gold', -v_price,
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'town_show', 'sink', v_rule.sink_id, 'n', v_n + 1, 'map', v_map))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      return public.hr_note_rejection('town_show', p_slot, v_a || jsonb_build_object('ok', false)); end if;
    -- THE TOWN'S KEY, LAST. A queue that filled while this waited raises and rolls back whole: nobody pays for a refused show.
    perform pg_advisory_xact_lock(hashtextextended(case when v_rule.sink_id = 'powder' then 'hr:hearth:' else 'hr:round:' end || v_map, 0));
    v_free := public.hr_town_show_free_at(v_map, v_rule.sink_id);
    if v_free > now() + make_interval(secs => v_rule.book_s) then raise exception using errcode = 'HR938', message = 'show_busy'; end if;
    v_end := v_free + make_interval(secs => v_rule.seconds);
    -- THE LINE: the server's sentence and the stamped name, no player text. A quiet hero pays and shows with no name and no line.
    select coalesce(ps.presence_quiet, false) into v_quiet from public.player_state ps where ps.user_id = v_uid and ps.slot = p_slot;
    if not v_quiet then
      v_msg := gen_random_uuid();
      -- from_name is stamped by hr_chat_name_authority; the placeholder never shows. A notice has no Level, which no player's line ever lacks.
      if v_rule.sink_id = 'powder' then
        insert into public.chat_messages (id, channel, from_id, from_name, from_slot, from_role, body)
        values (v_msg, public.hr_chat_zone_of(v_uid, p_slot), v_uid, 'Adventurer', p_slot, 'notice', 'threw ' || initcap(p_show) || ' on the Great Hearth.');
      else
        insert into public.chat_messages (id, channel, from_id, from_name, from_slot, body)
        values (v_msg, 'system', v_uid, 'Adventurer', p_slot, 'stood a round at the Tavern.');
      end if;
    end if;
    insert into public.town_shows (map_id, sink_id, show_id, user_id, slot, price, starts_at, ends_at, message_id)
    values (v_map, v_rule.sink_id, p_show, v_uid, p_slot, v_price, v_free, v_end, v_msg);
    perform public.hr_gold_given_add(v_uid, p_slot, v_price);
    delete from public.town_shows s where s.map_id = v_map and s.sink_id = v_rule.sink_id and s.ends_at < now() - interval '30 days';
  exception when sqlstate 'HR938' then
    return public.hr_note_rejection('town_show', p_slot, jsonb_build_object('ok', false, 'error', 'show_busy', 'sink', v_rule.sink_id,
      'wait_s', greatest(1, ceil(extract(epoch from (v_free - now())) - v_rule.book_s))::int, 'booked_s', ceil(extract(epoch from (v_free - now())))::int));
  end;
  -- A POWDER: THE HERO WALKS TO THE FIRE, a free fuel stand (display presence; nothing waits on it)
  if v_rule.sink_id = 'powder' then
    select f.item_id into v_behind from public.hearth_flames f where f.map_id = v_map and f.ends_at > now() order by f.ends_at desc limit 1;
    if public.hr_flag_on('town_presence') then
      insert into public.town_seen as ts (user_id, slot, seen_at) values (v_uid, p_slot, now())
        on conflict (user_id, slot) do update set seen_at = excluded.seen_at;
      v_place := public.hr_town_place(v_uid, p_slot, v_map, 'hearth', 'visit');
      if v_place->>'ok' = 'true' then v_me := v_place->'me'; end if;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'sink', v_rule.sink_id, 'show', p_show, 'price', v_price, 'n', v_n + 1, 'per_day', v_rule.per_day,
    'from_ms', floor(extract(epoch from v_free) * 1000)::bigint, 'until_ms', floor(extract(epoch from v_end) * 1000)::bigint, 'behind', v_behind, 'me', v_me);
end $function$;

-- hr_town_sinks_view(integer): town_sinks
CREATE OR REPLACE FUNCTION public.hr_town_sinks_view(p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_map text; v_mine jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'town_sinks', 60, interval '1 minute') then  -- RATE-JOURNAL: was one line
    perform public.hr_rate_refused(v_uid, p_slot, 'town_sinks', 60, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;  -- RATE-JOURNAL
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  v_map := (select m.map_id from public.hr_town_maps m where m.main);
  if v_map is null then return jsonb_build_object('ok', false, 'error', 'catalogue_missing'); end if;
  -- THIS ACCOUNT'S POWDER still to burn, and the named flame it burns behind ("Your powder burns after the Rat King's Knot.")
  select jsonb_build_object('show', s.show_id, 'from_ms', floor(extract(epoch from s.starts_at) * 1000)::bigint, 'until_ms', floor(extract(epoch from s.ends_at) * 1000)::bigint,
           'behind', (select f.item_id from public.hearth_flames f where f.map_id = s.map_id and f.ends_at > now() and f.starts_at < s.ends_at order by f.ends_at desc limit 1))
    into v_mine
    from public.town_shows s
   where s.user_id = v_uid and s.sink_id = 'powder' and s.ends_at > now()
   order by s.ends_at desc
   limit 1;
  return jsonb_build_object('ok', true, 'now_ms', floor(extract(epoch from now()) * 1000)::bigint,
    'hunting', exists (select 1 from public.hunt_sessions h where h.user_id = v_uid and h.slot = p_slot and h.ended_at is null),
    'level', public.hr_level_of(v_uid, p_slot),
    'powder', public.hr_town_sink_quote(v_uid, v_map, 'powder') || jsonb_build_object('mine', v_mine),
    'round', public.hr_town_sink_quote(v_uid, v_map, 'round'),
    'crier', public.hr_town_crier_quote(v_uid));
end $function$;

-- hr_town_view(integer,text,integer,integer,bigint,integer,integer): town_view
CREATE OR REPLACE FUNCTION public.hr_town_view(p_slot integer, p_map text, p_cx integer, p_cy integer, p_cursor bigint, p_pcx integer, p_pcy integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_slack      constant interval := interval '5 seconds';    -- commit order: a write stamped before this read's start
  c_full_after constant interval := interval '60 seconds';   -- an older cursor is answered whole
  c_per_min    constant int := 45;
  c_gone_max   constant int := 240;
  v_uid  uuid := auth.uid();
  v_slot int := coalesce(p_slot, -1);
  v_map  public.hr_town_maps%rowtype;
  v_now  timestamptz := now();
  v_me   jsonb; v_inst int;
  v_cur  timestamptz; v_since timestamptz; v_full boolean;
  v_hw int; v_hh int; v_cx int; v_cy int; v_px int; v_py int;
  v_mates uuid[]; v_friends uuid[]; v_blocked uuid[];
  v_pick jsonb; v_n int; v_walkers jsonb; v_gone jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_flag_on('town_presence') then return jsonb_build_object('ok', true, 'off', true); end if;
  if not public.hr_rate_ok(v_uid, 'town_view', c_per_min, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, p_slot, 'town_view', c_per_min, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select * into v_map from public.hr_town_maps where map_id = p_map;
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_map'); end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if exists (select 1 from public.hunt_sessions h where h.user_id = v_uid and h.slot = v_slot and h.ended_at is null) then
    return jsonb_build_object('ok', false, 'error', 'hunting'); end if;
  -- THE VIEWER STANDS IN THE TOWN IT VIEWS: present (a read is a keepalive), its own pending changes, then a stand
  -- when it has none (rare: the map lock)
  insert into public.town_seen as ts (user_id, slot, seen_at) values (v_uid, v_slot, now())
    on conflict (user_id, slot) do update set seen_at = excluded.seen_at;
  perform public.hr_town_moves_settle(p_map, 4, v_uid, v_slot);
  if not exists (select 1 from public.town_bodies b where b.user_id = v_uid and b.slot = v_slot and b.map_id = p_map and b.station_id is not null) then
    perform public.hr_town_place_pointer(v_uid, v_slot, p_map);
  else
    perform public.hr_town_merge_party(v_uid, p_map);   -- a party stands together (a viewer joins its leader too)
  end if;
  v_me := public.hr_town_me(v_uid, v_slot);
  v_inst := (v_me->>'inst')::int;
  -- THE WINDOW: the view around the centre the client names (its own tile when it names none), plus the margin
  v_hw := ceil(v_map.view_w / 2.0)::int + v_map.margin;
  v_hh := ceil(v_map.view_h / 2.0)::int + v_map.margin;
  v_cx := least(greatest(coalesce(p_cx, (v_me->>'x')::int, v_map.w / 2), 0), v_map.w - 1);
  v_cy := least(greatest(coalesce(p_cy, (v_me->>'y')::int, v_map.h / 2), 0), v_map.h - 1);
  v_px := case when p_pcx is not null and p_pcy is not null then least(greatest(p_pcx, 0), v_map.w - 1) end;
  v_py := case when p_pcx is not null and p_pcy is not null then least(greatest(p_pcy, 0), v_map.h - 1) end;
  -- THE CURSOR: the last answer's server time; none, an old one or a future one is answered whole
  v_cur := case when p_cursor is null then null else to_timestamp(p_cursor / 1000000.0) end;
  v_full := v_cur is null or v_cur < v_now - c_full_after or v_cur > v_now + interval '1 second';
  v_since := case when v_full then null else v_cur - c_slack end;
  v_mates := array(select distinct m2.user_id from public.hunt_party_members m1
                     join public.hunt_parties p on p.id = m1.party_id and p.closed_at is null
                     join public.hunt_party_members m2 on m2.party_id = m1.party_id
                    where m1.user_id = v_uid and m2.user_id <> v_uid);
  v_friends := array(select case when f.user_lo = v_uid then f.user_hi else f.user_lo end
                       from public.friend_links f where f.user_lo = v_uid or f.user_hi = v_uid);
  -- blocked either way (hr_social_blocked's rule), once for the whole read
  v_blocked := array(select b.blocked_id from public.chat_blocks b where b.blocker_id = v_uid
                     union select b.blocker_id from public.chat_blocks b where b.blocked_id = v_uid);
  if v_inst is not null then
    -- ONE STATEMENT A PASS: the instance's bodies once (t: cheap columns), the CANDIDATES (c: in a whole answer all of
    -- them; in a delta those that changed, entered the area or whose presence ran out since the cursor), whether each
    -- candidate is SHOWN (s: holds its stand, not quiet, not blocked either way, admitted, live), then how many are shown
    -- in the area, the walkers to send (<= cap, own account, party, friends, then nearest) and the gone. A delta with
    -- more than the cap is answered WHOLE (a second pass): nothing is ever dropped from a delta.
    loop
      with t as materialized (
        select b.*,
               -- in the area: where it is OR where it walks to (a body walking in is read before it arrives)
               (b.x between v_cx - v_hw and v_cx + v_hw and b.y between v_cy - v_hh and v_cy + v_hh)
                 or (b.gx between v_cx - v_hw and v_cx + v_hw and b.gy between v_cy - v_hh and v_cy + v_hh) as inside,
               v_px is not null and ((b.x between v_px - v_hw and v_px + v_hw and b.y between v_py - v_hh and v_py + v_hh)
                 or (b.gx between v_px - v_hw and v_px + v_hw and b.gy between v_py - v_hh and v_py + v_hh)) as was_inside,
               case when b.user_id = v_uid then 0 when b.user_id = any (v_mates) then 1 when b.user_id = any (v_friends) then 2 else 3 end as rnk,
               (b.x - v_cx) * (b.x - v_cx) + (b.y - v_cy) * (b.y - v_cy) as d2
          from public.hr_town_bodies_at(p_map, v_inst, v_since) b
         where not (b.user_id = v_uid and b.slot = v_slot)
      ), s as materialized (
        select t.*,
               t.held and not t.quiet and not (t.user_id = any (v_blocked)) and public.hr_admitted(t.user_id)
                 and public.hr_town_live_of(t.kind, t.seen,
                       exists (select 1 from public.hunt_sessions h where h.user_id = t.user_id and h.slot = t.slot and h.ended_at is null)) as shown
          from t
         where v_since is null or t.changed > v_since or (t.inside and not t.was_inside)
            or (t.seen_until > v_since and t.seen_until <= v_now)
      )
      select (select count(*)::int from s where s.shown and s.inside),
             (select jsonb_agg(jsonb_build_object('id', w.user_id, 'slot', w.slot, 'x', w.x, 'y', w.y, 'gx', w.gx, 'gy', w.gy, 'dir', w.dir,
                                 'age_ms', greatest(0, floor(extract(epoch from (v_now - w.changed)) * 1000))::int,
                                 'station', w.station_id, 'work', w.why = 'work', 'ord', w.n))
                from (select s.*, row_number() over (order by s.rnk, s.d2, s.user_id, s.slot) n from s
                       where s.shown and s.inside order by s.rnk, s.d2, s.user_id, s.slot limit v_map.view_cap) w),
             (select jsonb_agg(jsonb_build_object('id', g.user_id, 'slot', g.slot) order by g.user_id, g.slot)
                from (select s.user_id, s.slot from s
                       where v_since is not null and not (s.shown and s.inside)
                         and (s.changed > v_since or (s.seen_until > v_since and s.seen_until <= v_now))
                       order by s.user_id, s.slot limit c_gone_max) g)
        into v_n, v_pick, v_gone;
      exit when v_since is null or v_n <= v_map.view_cap;
      v_full := true; v_since := null;
    end loop;
  end if;
  -- the others' pending changes, AFTER the read (the map lock is never held across it): seen on the next read
  perform public.hr_town_moves_settle(p_map, 20);
  -- THE LOOKS of the bodies this answer carries, re-read when older than 60 s (the helpers run for those rows only),
  -- then the walkers. Last: body rows are locked after the map lock, never before (§ CONCURRENCY).
  if v_pick is not null then
    -- SKIP LOCKED: two readers refreshing one look never wait on (or deadlock with) each other; the one that skipped
    -- sends the minute-old look, or reads it fresh when it has none
    update public.town_bodies b set look = public.hr_town_look(b.user_id, b.slot), look_at = v_now
     where (b.user_id, b.slot) in (
       select t.user_id, t.slot from public.town_bodies t
         join jsonb_to_recordset(v_pick) p(id uuid, slot int) on t.user_id = p.id and t.slot = p.slot
        where t.look is null or t.look_at < v_now - interval '60 seconds'
        order by t.user_id, t.slot
        for update of t skip locked);
    select jsonb_agg(jsonb_build_object('id', p.id, 'slot', p.slot) || coalesce(b.look, public.hr_town_look(p.id, p.slot))
                     || jsonb_build_object('x', p.x, 'y', p.y, 'gx', p.gx, 'gy', p.gy, 'dir', p.dir,
                                           'age_ms', p.age_ms, 'station', p.station, 'work', p.work) order by p.ord)
      into v_walkers
      from jsonb_to_recordset(v_pick) p(id uuid, slot int, x int, y int, gx int, gy int, dir text, age_ms int, station text, work boolean, ord int)
      join public.town_bodies b on b.user_id = p.id and b.slot = p.slot;
  end if;
  return jsonb_build_object('ok', true, 'map', p_map, 'inst', v_inst, 'cap', v_map.view_cap, 'full', v_full,
    'cursor', floor(extract(epoch from v_now) * 1000000)::bigint,
    'area', jsonb_build_array(greatest(v_cx - v_hw, 0), greatest(v_cy - v_hh, 0), least(v_cx + v_hw, v_map.w - 1), least(v_cy + v_hh, v_map.h - 1)),
    'walkers', coalesce(v_walkers, '[]'::jsonb), 'gone', coalesce(v_gone, '[]'::jsonb), 'me', v_me,
    'hearth', public.hr_hearth_flame_of(p_map),
    'shows', public.hr_town_shows_of(p_map),
    'extras', public.hr_town_extras(p_map));
end $function$;

-- hr_town_walkers(text): town_walk
CREATE OR REPLACE FUNCTION public.hr_town_walkers(p_map text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- Fresh: the client re-publishes a standing body every 10 s, so three missed
  -- keepalives is gone (a closed tab leaves within this without a goodbye).
  c_fresh   constant interval := interval '30 seconds';
  c_cap     constant int := 40;
  c_scan    constant int := 80;    -- the index rows one read may visit (2 × cap)
  c_per_min constant int := 45;
  v_uid uuid := auth.uid();
begin
  -- WALKER-NAMES (2026-11-04-town-walker-names.sql): each walker is named as its CHARACTER (user and slot).
  -- WALKER-ROLE (2026-12-10-town-walker-role.sql): its role is its worn weapon's, as its own `role` section says.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_flag_on('town_presence') then return jsonb_build_object('ok', true, 'off', true); end if;
  if not public.hr_rate_ok(v_uid, 'town_walk', c_per_min, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, null, 'town_walk', c_per_min, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.hr_town_maps where map_id = p_map) then
    return jsonb_build_object('ok', false, 'error', 'bad_map'); end if;
  return jsonb_build_object('ok', true, 'map', p_map, 'cap', c_cap, 'walkers', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', w.user_id, 'slot', w.slot,
             'name', left(public.hr_character_name(w.user_id, w.slot), 24),
             'level', public.hr_level_of(w.user_id, w.slot),
             'role', public.hr_role_view(w.user_id, w.slot)->>'id',
             -- THE OUTFIT the character chose (player_outfits, written only by hr_outfit_set),
             -- null when none or no longer owned (a lapsed premium outfit), as hr_outfit_view reads it.
             'outfit', case when po.outfit_id is not null and po.outfit_id = any (public.hr_outfit_owned(w.user_id, w.slot))
                            then jsonb_build_object('id', po.outfit_id, 'colors', coalesce(po.colors, '{}'::jsonb)) end,
             'x', w.x, 'y', w.y, 'gx', w.gx, 'gy', w.gy, 'dir', w.dir,
             'age_ms', greatest(0, floor(extract(epoch from (now() - w.at)) * 1000))::int
           ) order by w.at desc)
      from (select c.*
              from (select tp.* from public.town_positions tp
                     where tp.map_id = p_map and tp.at > now() - c_fresh
                     order by tp.at desc limit c_scan) c
              join public.player_state ps on ps.user_id = c.user_id and ps.slot = c.slot
             where not coalesce(ps.presence_quiet, false)
               and not exists (select 1 from public.hunt_sessions h
                                where h.user_id = c.user_id and h.slot = c.slot and h.ended_at is null)
               and not public.hr_social_blocked(v_uid, c.user_id)
               and public.hr_admitted(c.user_id)
             order by c.at desc limit c_cap) w
      left join public.player_outfits po on po.user_id = w.user_id and po.slot = w.slot), '[]'::jsonb));
end $function$;

-- hr_town_works_give(integer,text,bigint,uuid): town_works
CREATE OR REPLACE FUNCTION public.hr_town_works_give(p_slot integer, p_project text, p_amount bigint, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_p     public.hr_town_works%rowtype;
  v_verb  text; v_r jsonb; v_ver bigint; v_a jsonb; v_fault jsonb;
  v_goal  bigint; v_total bigint; v_after bigint; v_given bigint; v_k int;
  v_day   date := (now() at time zone 'utc')::date;
  v_by    bigint[] := array[0, 0, 0, 0, 0, 0]::bigint[];
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('town_works', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('town_works', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000000 then
    return public.hr_note_rejection('town_works', p_slot, jsonb_build_object('ok', false, 'error', 'bad_amount')); end if;
  if p_project is null or p_project !~ '^[a-z0-9_]{1,32}$' then
    return public.hr_note_rejection('town_works', p_slot, jsonb_build_object('ok', false, 'error', 'not_a_project')); end if;
  v_verb := 'town_works:' || p_project || ':' || p_amount;
  -- A RETRY of a decided key answers that decision and charges nothing again
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('town_works', p_slot, v_r); end if;
  -- THE CATALOGUE
  select * into v_p from public.hr_town_works w where w.project_id = p_project;
  if not found then return public.hr_note_rejection('town_works', p_slot, jsonb_build_object('ok', false, 'error', 'not_a_project')); end if;
  if not public.hr_rate_ok(v_uid, 'town_works', v_p.per_minute, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, p_slot, 'town_works', v_p.per_minute, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- THE HERO: its lock, its row
  perform public.hr_hunt_lock(v_uid, p_slot);
  -- A SECOND PRESS OF ONE KEY that waited on that lock answers the first one's decision
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('town_works', p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('town_works', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- THE ACCOUNT'S DAY, under its key: two heroes pressing together read what's left in order
  perform public.hr_sink_lock(v_uid);
  v_given := public.hr_town_works_given_today(v_uid);
  v_goal := v_p.stage_at[cardinality(v_p.stage_at)];
  v_total := coalesce((select t.total from public.town_works_totals t where t.project_id = p_project), 0);
  -- THE RULE, read before the charge, so the usual refusal charges nothing at all
  v_fault := public.hr_town_works_fault(v_p.min_gift, v_p.per_day, v_goal - v_total, v_given, p_amount);
  if v_fault is not null then
    return public.hr_note_rejection('town_works', p_slot, v_fault || jsonb_build_object('ok', false, 'project', p_project)); end if;
  begin
    -- THE CHARGE: gold only, never an xp key and never an item. Exactly one journal row.
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'gold', -p_amount,
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'town_works', 'project', p_project, 'map', v_p.map_id))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      return public.hr_note_rejection('town_works', p_slot, v_a || jsonb_build_object('ok', false)); end if;
    -- THE PROJECT'S KEY, LAST. A gift that no longer fits raises and rolls back whole: nobody pays for what the Works refused.
    perform pg_advisory_xact_lock(hashtextextended('hr:works:' || p_project, 0));
    v_total := coalesce((select t.total from public.town_works_totals t where t.project_id = p_project), 0);
    v_fault := public.hr_town_works_fault(v_p.min_gift, v_p.per_day, v_goal - v_total, v_given, p_amount);
    if v_fault is not null then raise exception using errcode = 'HR943', message = 'town_works lost the race'; end if;
    v_after := v_total + p_amount;
    insert into public.town_works_totals as t (project_id, total, finished_at, updated_at)
    values (p_project, v_after, case when v_after >= v_goal then now() end, now())
    on conflict (project_id) do update set total = excluded.total, finished_at = excluded.finished_at, updated_at = excluded.updated_at;
    v_by[p_slot + 1] := p_amount;
    insert into public.town_works_gifts as g (project_id, user_id, gold, by_slot, day, day_gold, last_gift, last_at)
    values (p_project, v_uid, p_amount, v_by, v_day, p_amount, p_amount, now())
    on conflict (project_id, user_id) do update
      set gold = g.gold + excluded.gold,
          by_slot[p_slot + 1] = g.by_slot[p_slot + 1] + p_amount,
          day_gold = case when g.day = v_day then g.day_gold + p_amount else p_amount end,
          day = v_day, last_gift = p_amount, last_at = now();
    perform public.hr_gold_given_add(v_uid, p_slot, p_amount);
    -- EACH STAGE THIS GIFT CROSSED says so, once: only the key's holder moves the total
    for v_k in 2 .. cardinality(v_p.stage_at) loop
      if v_total < v_p.stage_at[v_k] and v_after >= v_p.stage_at[v_k] then
        perform public.hr_town_notice(v_p.name, v_p.stage_lines[v_k]);
      end if;
    end loop;
  exception when sqlstate 'HR943' then
    return public.hr_note_rejection('town_works', p_slot, v_fault || jsonb_build_object('ok', false, 'project', p_project));
  end;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'project', p_project, 'amount', p_amount, 'total', v_after, 'goal', v_goal,
    'stage', public.hr_town_works_stage(v_p.stage_at, v_after), 'given_today', v_given + p_amount, 'left_today', v_p.per_day - v_given - p_amount);
end $function$;

-- hr_town_works_view(integer): town_works_view
CREATE OR REPLACE FUNCTION public.hr_town_works_view(p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_p   public.hr_town_works%rowtype;
  v_g   public.town_works_gifts%rowtype;
  v_total bigint; v_finished timestamptz; v_goal bigint; v_given bigint; v_left bigint; v_day_left bigint; v_floor bigint; v_place int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'town_works_view', 60, interval '1 minute') then  -- RATE-JOURNAL: was one line
    perform public.hr_rate_refused(v_uid, p_slot, 'town_works_view', 60, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;  -- RATE-JOURNAL
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  -- THE PROJECT ON SHOW: the first still being built, else the last that finished
  select w.* into v_p from public.hr_town_works w
    left join public.town_works_totals t on t.project_id = w.project_id
   order by coalesce(t.total, 0) >= w.stage_at[cardinality(w.stage_at)],
            case when coalesce(t.total, 0) >= w.stage_at[cardinality(w.stage_at)] then -w.ord else w.ord end
   limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'catalogue_missing'); end if;
  select t.total, t.finished_at into v_total, v_finished from public.town_works_totals t where t.project_id = v_p.project_id;
  v_total := coalesce(v_total, 0);
  v_goal := v_p.stage_at[cardinality(v_p.stage_at)];
  v_left := greatest(v_goal - v_total, 0);
  v_given := public.hr_town_works_given_today(v_uid);
  v_day_left := greatest(v_p.per_day - v_given, 0);
  v_floor := least(v_p.min_gift, greatest(v_left, 1));
  select * into v_g from public.town_works_gifts g where g.project_id = v_p.project_id and g.user_id = v_uid;
  -- THIS ACCOUNT'S PLACE: an account with no hero left to show holds none
  if v_g.user_id is not null and public.hr_town_works_lead(v_uid, v_g.by_slot) is not null then
    select 1 + count(*)::int into v_place from public.town_works_gifts o
     where o.project_id = v_p.project_id
       and (o.gold > v_g.gold or (o.gold = v_g.gold and (o.last_at, o.user_id) < (v_g.last_at, v_g.user_id)))
       and public.hr_town_works_lead(o.user_id, o.by_slot) is not null;
  end if;
  return jsonb_build_object('ok', true, 'project', v_p.project_id, 'name', v_p.name, 'total', v_total, 'goal', v_goal, 'left', v_left, 'stage_at', to_jsonb(v_p.stage_at),
    'stage', public.hr_town_works_stage(v_p.stage_at, v_total), 'finished', v_left = 0,
    'min_gift', v_floor, 'per_day', v_p.per_day, 'given_today', v_given, 'left_today', v_day_left,
    -- the most this account can give right now, 0 when what's left today is under the smallest gift
    'max_gift', case when v_left > 0 and least(v_day_left, v_left) >= v_floor then least(v_day_left, v_left) else 0 end,
    'last_gift', v_g.last_gift, 'gold', coalesce(v_g.gold, 0), 'place', v_place,
    'plaque', public.hr_town_works_plaque(v_p.project_id, v_uid, v_p.plaque_top));
end $function$;

-- hr_whisper_send(integer,text,text): whisper:burst, whisper:send
CREATE OR REPLACE FUNCTION public.hr_whisper_send(p_slot integer, p_target text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_to uuid; v_to_slot int; v_body text; v_fault text; v_row public.chat_whispers%rowtype; v_until timestamptz;
begin
  -- SOCIAL-PASS: the 2026-10-27 body; the line is stamped with the sending hero and the hero the target names.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  -- GM-TOOLS (2027-03-13-gm-tools.sql): a mute says so; hr_whisper_zgm_gate is the second lock. The Game Master reads as unavailable.
  v_until := public.hr_chat_muted_until(v_uid);
  if v_until is not null then return jsonb_build_object('ok', false, 'error', 'muted', 'until', v_until); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  v_body := public.hr_chat_clean(p_body);
  v_fault := public.hr_chat_body_fault(v_body);
  if v_fault is not null then return jsonb_build_object('ok', false, 'error', v_fault); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if not public.hr_rate_ok(v_uid, 'whisper:burst', 5, interval '10 seconds') then
    perform public.hr_rate_refused(v_uid, p_slot, 'whisper:burst', 5, interval '10 seconds');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_rate_ok(v_uid, 'whisper:send', 20, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, p_slot, 'whisper:send', 20, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select t.target_user, t.target_slot into v_to, v_to_slot from public.hr_social_target(p_target) t;
  if v_to is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if v_to = v_uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if public.hr_social_blocked(v_uid, v_to) or not public.hr_admitted(v_to) or public.hr_gm_walled(v_to) then
    return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  insert into public.chat_whispers (from_id, from_slot, from_name, from_level, from_weapon, from_role, to_id, to_name, body)
  values (v_uid, p_slot, left(public.hr_character_name(v_uid, p_slot), 24), public.hr_level_of(v_uid, p_slot),
          public.hr_hunt_weapon_of(v_uid, p_slot), public.hr_chat_role_pick(v_uid, p_slot),
          v_to, left(public.hr_character_name(v_to, coalesce(v_to_slot, 0)), 24), v_body)
  returning * into v_row;
  return jsonb_build_object('ok', true, 'line', public.hr_whisper_row(v_row));
end $function$;

-- hr_whispers_recent(): social:read
CREATE OR REPLACE FUNCTION public.hr_whispers_recent()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
-- CHAT-STREAM-SAFE (2026-11-19): lines at or after hr_chat_history_floor(), every body masked.
declare v_uid uuid := auth.uid(); v_floor timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'social:read', 20, interval '1 minute') then
    perform public.hr_rate_refused(v_uid, null, 'social:read', 20, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_floor := public.hr_chat_history_floor();
  return jsonb_build_object('ok', true, 'lines', coalesce((
    select jsonb_agg(public.hr_whisper_row(x) || jsonb_build_object('body', public.hr_chat_mask(x.body))
                     order by x.created_at, x.id) from (
      select * from public.chat_whispers w
       where (w.to_id = v_uid or w.from_id = v_uid) and w.created_at >= v_floor
         and not exists (select 1 from public.chat_blocks b where b.blocker_id = v_uid and b.blocked_id = w.from_id)
       order by w.created_at desc limit 100) x), '[]'::jsonb));
end $function$;

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
do $chk$
declare
  c_u constant uuid := '000000c0-0000-4000-a000-0000402a0001';
  c_helper constant text := 'public.hr_rate_refused(uuid,integer,text,integer,interval)';
  -- hr_crier_send's compound refusal, as this file states it and as it was (the only edit that is not whole inserted lines)
  c_compound_now constant text := $rj$  if not public.hr_rate_ok(v_uid, 'crier', v_rule.per_minute, interval '1 minute') then  -- RATE-JOURNAL: one of the compound refusal's buckets, in its order
    perform public.hr_rate_refused(v_uid, p_slot, 'crier', v_rule.per_minute, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;  -- RATE-JOURNAL
  if not public.hr_rate_ok(v_uid, 'chat:burst', 5, interval '10 seconds') then  -- RATE-JOURNAL: one of the compound refusal's buckets, in its order
    perform public.hr_rate_refused(v_uid, p_slot, 'chat:burst', 5, interval '10 seconds');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;  -- RATE-JOURNAL
  if not public.hr_rate_ok(v_uid, 'chat:send', 20, interval '1 minute') then  -- RATE-JOURNAL: one of the compound refusal's buckets, in its order
    perform public.hr_rate_refused(v_uid, p_slot, 'chat:send', 20, interval '1 minute');  -- RATE-JOURNAL
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;  -- RATE-JOURNAL$rj$;
  c_compound_was constant text := $rj$  if not public.hr_rate_ok(v_uid, 'crier', v_rule.per_minute, interval '1 minute')
     or not public.hr_rate_ok(v_uid, 'chat:burst', 5, interval '10 seconds')
     or not public.hr_rate_ok(v_uid, 'chat:send', 20, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;$rj$;
  v_r record; v_def text; v_md5 text; v jsonb; r text; v_n bigint; v_row public.hr_rejections%rowtype; v_m text; v_src text;
begin
  -- (a) THE RECORDER'S SHAPE: server-only, definer, search_path pinned.
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(r, c_helper, 'execute') then raise exception 'rate-refusals §3(a): % can execute hr_rate_refused', r; end if;
  end loop;
  if not exists (select 1 from pg_proc p where p.oid = c_helper::regprocedure and p.prosecdef
                  and p.proconfig @> array['search_path=public, pg_catalog']) then
    raise exception 'rate-refusals §3(a): hr_rate_refused is not a security definer with a pinned search_path'; end if;

  -- (b) ★ THE CLASS IS CLOSED, over every function this database holds (not a list): no `if not hr_rate_ok(...) ... end if;`
  --     answers without the recorder, hr_record_rejection or the Game Master journal. The one bare `return` is
  --     hr_gm_stop_result's bound on its own journal write.
  for v_r in
    select p.proname::text as fn, m[1] as blk
      from pg_proc p, lateral regexp_matches(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '(if\s+?not\s+?public\.hr_rate_ok\(.*?end if;)', 'g') m
     where p.pronamespace = 'public'::regnamespace loop
    if v_r.blk ~ 'hr_rate_refused\(' or v_r.blk ~ 'hr_record_rejection' or v_r.blk ~ 'hr_gm_close\(' then continue; end if;
    if v_r.fn = 'hr_gm_stop_result' and v_r.blk ~ '^if\s+not\s+public\.hr_rate_ok\([^;]*\)\s*then\s+return;\s*end if;$' then continue; end if;
    raise exception 'rate-refusals §3(b): %() still refuses a rate limit without a record: %', v_r.fn, left(regexp_replace(v_r.blk, '\s+', ' ', 'g'), 160);
  end loop;
  -- ... and every recorder call names the bucket and the limit its hr_rate_ok was asked (a copy under another bucket would
  --     sample from a counter that did not move).
  for v_r in
    select p.proname::text as fn, m[1] as asked, m[2] as told
      from pg_proc p, lateral regexp_matches(replace(p.prosrc, E'\r', ''),
        'if not public\.hr_rate_ok\(([^\n]*)\) then[^\n]*\n\s*perform public\.hr_rate_refused\(([^\n]*)\);', 'g') m
     where p.pronamespace = 'public'::regnamespace loop
    -- told = user, slot, bucket, limit, window ; asked = user, bucket, limit, window
    if regexp_replace(regexp_replace(v_r.told, '^\s*([a-z_]+)\s*,\s*[a-z_]+\s*,', '\1,'), '\s+', '', 'g')
       is distinct from regexp_replace(v_r.asked, '\s+', '', 'g') then
      raise exception 'rate-refusals §3(b): %() records (%) for a refusal of (%)', v_r.fn, v_r.told, v_r.asked; end if;
    v_n := coalesce(v_n, 0) + 1;
  end loop;
  if coalesce(v_n, 0) < 29 then raise exception 'rate-refusals §3(b): % recorder calls stand, wanted at least 29', coalesce(v_n, 0); end if;

  -- (c) EVERY RESTATED VERB is this file's image and keeps the grants it had (client true: a signed-in client asks;
  --     hr_players_online is asked only by hr_social_poll) ...
  for v_r in select * from (values
    ('public.hr_block_set(text,boolean)', '7a97684270ce8b9e5ea22d22a8900be3', '8169660fb7c28e5c9781d3280b303b18', true),
    ('public.hr_chat_recent(integer)', '18f8c572d31b07a561c212556e6a5877', '07e34dd1cd774e77c149c5a8af1cba8f', true),
    ('public.hr_chat_send(integer,text,text)', 'bb01f726ababc0d970db3a80741a39ef', 'e9ea89272a2143bd91ea09e2245af85e', true),
    ('public.hr_crier_send(integer,text,bigint,uuid)', '3a010fa6a973d1c4427a818d3850e2e5', 'c1811f9611b9e2d411eb7fd766703bde', true),
    ('public.hr_friend_answer(text,boolean)', 'f1792d70cb6240b6390e58f4ba620944', '51a65a3ab1659041e34aedd62e9d6523', true),
    ('public.hr_friend_remove(text)', '714391ffe3f87c159ba990ce975a7ecc', 'ade20e9a7422b5a82d815b941fe27baa', true),
    ('public.hr_friend_request(text)', 'b8cda3b2fe38a9ae76e16081db2fb7c0', 'ebdca47ef94de4af4f04143263145aed', true),
    ('public.hr_hearth_burn(integer,text,uuid)', '9e9070575ccacf50749d1c1819cdec6d', '0f2a8fe869bfe16eaebdcd3311a84125', true),
    ('public.hr_hero_colors_view(integer)', 'b13c71b0165a6298684bcd61f42d51de', '98aaacc11450c76d5e693e905611c89f', true),
    ('public.hr_inspect(text,integer)', 'e6e7a2ed39684391fe09df64ccd43661', 'f3d199be01882fe43a7438569100593a', true),
    ('public.hr_players_online(integer[])', 'f9d636dfab258bef48a945f97e8992c7', '778981c3ca5bd40d962e69666b7af9aa', false),
    ('public.hr_presence_leave()', '976945a3aba14dea44504318ba896707', '7b8c8c28a2cdd36692b6c2a76e0c5cb2', true),
    ('public.hr_social_poll(integer,integer[])', '2e2a0c71e61d4915a73d2c3a5b58d450', '2b96844b06f8b7b164938711de660ceb', true),
    ('public.hr_social_state(integer)', '4d2a240da1924993d3d2bacec788e3fc', '2a805d8e2c73fc50932a5aafc810b6f1', true),
    ('public.hr_town_go(integer,text)', '6ce84eb9eac49ba20e672a2b0397aa3d', '5da07d94754ccf91d892df2dccac4e1e', true),
    ('public.hr_town_here(integer,text)', 'deed37c82824e886b591cb1632e18c4b', '43a0bedd60126547e816a4a51c425314', true),
    ('public.hr_town_move(integer,text,integer,integer,integer,integer,text)', 'cdccab31182f0b4dda24ad1e91aea05f', 'f17722883f848431992cc8634fcb5ece', true),
    ('public.hr_town_show(integer,text,bigint,uuid)', '4389bbcd1c0d8913370e09c187142a61', '7cb9b88b6f5e29dca0564c7167fcdd02', true),
    ('public.hr_town_sinks_view(integer)', '8630e0215dc0fdf8970c883924f0dbd5', '54f0a768e3870837ec616de749c61cba', true),
    ('public.hr_town_view(integer,text,integer,integer,bigint,integer,integer)', 'ff2cc25fc03f8009684d5a7e6feea55e', '3f995a172d04b8c58f117f6de70a120f', true),
    ('public.hr_town_walkers(text)', 'bf82dd4d596f135e83a7af34e1dc8483', 'e23c3969fe6b77c7888e21d7a00df285', true),
    ('public.hr_town_works_give(integer,text,bigint,uuid)', '7a2945e24dc54d6dcd232746291e97c5', 'f43baa65298f6c66b601d74ce9ebb51e', true),
    ('public.hr_town_works_view(integer)', 'dd647a1e46d8b3f7cfd1b636ca5465e0', '4166597ddec99e1ca9f58cd52efdd02c', true),
    ('public.hr_whisper_send(integer,text,text)', 'dab619b519fe70419dd022f9c6b11d11', '39208d295cf559515442c6e263ea8723', true),
    ('public.hr_whispers_recent()', 'ee501e88913a1ed1185be58dbadeda81', '8521604f978f7eb0bcd318ee4b22997c', true)
    ) t(fn, pre, own, client) loop
    v_def := pg_get_functiondef(v_r.fn::regprocedure);
    v_md5 := md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.own then raise exception 'rate-refusals §3(c): % is not this file''s image (md5 %)', v_r.fn, v_md5; end if;
    if has_function_privilege('authenticated', v_r.fn, 'execute') is distinct from v_r.client or has_function_privilege('anon', v_r.fn, 'execute')
       or has_function_privilege('service_role', v_r.fn, 'execute') or has_function_privilege('hr_engine', v_r.fn, 'execute') then
      raise exception 'rate-refusals §3(c): the grants of % moved', v_r.fn; end if;
    if not exists (select 1 from pg_proc p where p.oid = v_r.fn::regprocedure and p.prosecdef) then
      raise exception 'rate-refusals §3(c): % is no longer a security definer', v_r.fn; end if;
    -- ... ★ AND THE DIFF IS ONLY THIS FILE'S LINES: take them back out and the pre-image §0 pinned is what is left.
    v_def := replace(replace(v_def, E'\r', ''), replace(c_compound_now, E'\r', ''), replace(c_compound_was, E'\r', ''));
    v_def := regexp_replace(v_def,
      '(if not public\.hr_rate_ok\([^\n]*\) then)  -- RATE-JOURNAL: was one line\n[^\n]*-- RATE-JOURNAL\n\s*(return [^\n]*end if;)  -- RATE-JOURNAL',
      '\1 \2', 'g');
    v_def := regexp_replace(v_def, '\n[^\n]*-- RATE-JOURNAL(?=\n)', '', 'g');
    if position('RATE-JOURNAL' in v_def) > 0 or position('hr_rate_refused' in v_def) > 0 then
      raise exception 'rate-refusals §3(c): % keeps a line of this file after the reverse edit', v_r.fn; end if;
    v_md5 := md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre then
      raise exception 'rate-refusals §3(c): % differs from its pre-image by more than this file''s marked lines (md5 % after the reverse edit, wanted %)', v_r.fn, v_md5, v_r.pre; end if;
  end loop;

  -- (d) BEHAVIOUR, as a signed-in caller, rolled back.
  begin
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (c_u, 'Probe Rate Journal') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'rate-refusals §3 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    delete from public.hr_rate_counters where user_id = c_u;
    delete from public.hr_rejections where user_id = c_u;

    -- A verb with no slot (20 a minute): 20 answered and nothing journalled; the 21st refused and ONE row, n 1, slot -1,
    -- naming the bucket; the 22nd to 29th refused and NOT written (S6); the 30th (10 over) written with its gap, n 10.
    for i in 1 .. 20 loop v := public.hr_whispers_recent(); end loop;
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'rate-refusals §3-harness: the 20th whisper read answered %', v; end if;
    if exists (select 1 from public.hr_rejections where user_id = c_u) then raise exception 'rate-refusals §3(d): an accepted call wrote a rejection'; end if;
    v := public.hr_whispers_recent();
    if v is distinct from jsonb_build_object('ok', false, 'error', 'rate_limited') then raise exception 'rate-refusals §3(d): the 21st read answered % (the refusal''s words moved)', v; end if;
    select * into v_row from public.hr_rejections where user_id = c_u and code = 'rate_limited';
    if not found or v_row.n <> 1 or v_row.slot <> -1 or v_row.intent is distinct from 'social:read' or v_row.severity <> 'normal'
       or not (v_row.verbs ? 'social:read') or (v_row.last_detail->>'limit')::int <> 20 then
      raise exception 'rate-refusals §3(d): the first refusal is not journalled as one normal row naming its bucket: %', to_jsonb(v_row); end if;
    for i in 22 .. 29 loop v := public.hr_whispers_recent(); end loop;
    if (select n from public.hr_rejections where user_id = c_u and code = 'rate_limited' and slot = -1) <> 1 then
      raise exception 'rate-refusals §3(d): refusals 2 to 9 over wrote the journal (unsampled, S6)'; end if;
    v := public.hr_whispers_recent();
    if (select n from public.hr_rejections where user_id = c_u and code = 'rate_limited' and slot = -1) <> 10 then
      raise exception 'rate-refusals §3(d): the 10th refusal did not carry its gap (n %, wanted 10)',
        (select n from public.hr_rejections where user_id = c_u and code = 'rate_limited' and slot = -1); end if;
    if (select count(*) from public.hr_rejections where user_id = c_u) <> 1 then raise exception 'rate-refusals §3(d): more than one journal row for one bucket'; end if;

    -- A verb with a slot (30 a minute): the row is the hero's slot.
    for i in 1 .. 31 loop v := public.hr_chat_recent(0); end loop;
    if v->>'error' is distinct from 'rate_limited' then raise exception 'rate-refusals §3-harness: the 31st chat read answered %', v; end if;
    if not exists (select 1 from public.hr_rejections where user_id = c_u and slot = 0 and code = 'rate_limited' and n = 1 and verbs ? 'chat:read') then
      raise exception 'rate-refusals §3(d): a slotted refusal is not journalled on its slot: %',
        (select jsonb_agg(to_jsonb(x)) from public.hr_rejections x where x.user_id = c_u); end if;

    -- The recorder itself: a client slot outside 0..5 never becomes a row key; under the limit it writes nothing.
    delete from public.hr_rejections where user_id = c_u;
    delete from public.hr_rate_counters where user_id = c_u;
    insert into public.hr_rate_counters (user_id, bucket, window_start, n) values (c_u, 'probe:x', now(), 4);
    perform public.hr_rate_refused(c_u, 999, 'probe:x', 3, interval '1 minute');
    if (select array_agg(slot) from public.hr_rejections where user_id = c_u) is distinct from array[-1] then
      raise exception 'rate-refusals §3(d): a slot of 999 was journalled as %', (select array_agg(slot) from public.hr_rejections where user_id = c_u); end if;
    delete from public.hr_rejections where user_id = c_u;
    perform public.hr_rate_refused(c_u, 0, 'probe:x', 4, interval '1 minute');
    perform public.hr_rate_refused(c_u, 0, 'probe:none', 4, interval '1 minute');
    perform public.hr_rate_refused(null, 0, 'probe:x', 3, interval '1 minute');
    if exists (select 1 from public.hr_rejections where user_id = c_u) then raise exception 'rate-refusals §3(d): a bucket at or under its limit was journalled'; end if;

    -- THE CRIER'S THREE BUCKETS, in order: with chat's burst bucket full, a line is refused; its own bucket was asked and
    -- counted first, the burst bucket is the one journalled, and the third was never asked (short-circuit, as before).
    insert into public.hr_flags (key, enabled, note) values ('town_crier', true, 'rate-refusals §3 probe')
      on conflict (key) do update set enabled = true;
    if exists (select 1 from public.hr_sink_rules where sink_id = 'crier') then
      delete from public.hr_rate_counters where user_id = c_u;
      insert into public.hr_rate_counters (user_id, bucket, window_start, n) values (c_u, 'chat:burst', now(), 5);
      v := public.hr_crier_send(0, 'Fresh pies by the gate', 1, '000000c0-0000-4000-a000-0000402a00c1'::uuid);
      if v is distinct from jsonb_build_object('ok', false, 'error', 'rate_limited') then raise exception 'rate-refusals §3(d): a Crier line over chat''s burst answered %', v; end if;
      if (select n from public.hr_rate_counters where user_id = c_u and bucket = 'crier') is distinct from 1
         or (select n from public.hr_rate_counters where user_id = c_u and bucket = 'chat:burst') is distinct from 6
         or exists (select 1 from public.hr_rate_counters where user_id = c_u and bucket = 'chat:send') then
        raise exception 'rate-refusals §3(d): the Crier''s buckets were not asked in order with a short-circuit: %',
          (select jsonb_object_agg(bucket, n) from public.hr_rate_counters where user_id = c_u); end if;
      select * into v_row from public.hr_rejections where user_id = c_u and code = 'rate_limited' and slot = 0;
      if not found or v_row.n <> 1 or not (v_row.verbs ? 'chat:burst') or v_row.verbs ? 'crier' then
        raise exception 'rate-refusals §3(d): the Crier''s refusal is not journalled under the bucket that refused: %', to_jsonb(v_row); end if;
    else
      raise exception 'rate-refusals §3-harness: the Crier''s rule row is absent';
    end if;

    raise exception using errcode = 'HRJ42', message = 'rate-refusals §3 complete - rolling back';
  exception when sqlstate 'HRJ42' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = c_u) or exists (select 1 from public.hr_rejections where user_id = c_u)
     or exists (select 1 from public.hr_rate_counters where user_id = c_u) or exists (select 1 from public.hr_access_allowlist where user_id = c_u) then
    raise exception 'rate-refusals §3: LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'rate-refusals: 29 refusals in 25 verbs are journalled and sampled, each body is its pre-image plus the marked lines, no unrecorded rate refusal stands in the database; all green';
end $chk$;
