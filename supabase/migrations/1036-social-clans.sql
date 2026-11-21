-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1036-social-clans.sql — CLANS OPEN (ROSTER, BROWSER, CLAN CHAT) WITH THE CASTLE HIDDEN; ONE GLOBAL IN SMALL BATCHES
--   WITH A SLOW MODE; THE LOCAL TAB GONE (lane/c-social, backend-architect, FB-12; chapter 06 sections 2.4, 2.9 and 2.11; Tyler's rulings
--   25-3, 25-6, 25-7 of 2026-11-20, 28-6, 31-1 and GR-69 of 2026-11-21; Part C X-04, T-12).
--
-- STATUS: supabase/migration-notes/1036-social-clans.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base. It reads 1003-dead-client-writes.sql
--   (clan_members takes no client write: every clan door is a SECURITY DEFINER verb) and the 2026-08 clan chain as production holds it.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
-- EDGE: none. ON THE EA SECURITY LIST: gold (the founding price), names (a clan's name and tag), who hears a clan's lines.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- THE RULES are 1036-social-catalogue.generated.sql's (tools/gen-social-catalogue.mjs from src/data, --check): hr_clan_rules (25-6: the
--   founding price), hr_chat_global_rule (31-1: the batch), hr_chat_slow_mode (31-1: the slow mode). This file reads them.
-- clans.tag (NEW): 2 to 4 letters or digits, stored in capitals, unique; set at founding.
-- THE CLAN VERBS (client-executable, each on hr_client_rpc_baseline; hr_access_check first, rate-gated):
--   hr_clan_found(p_slot, p_name, p_tag, p_policy, p_price, p_idem)  MONEY. Found a clan at the server's price from the account's purse,
--        through hr_apply (journalled kind 'clan'), the founder its leader. Refuses quote_changed when p_price is not the rule's, and every
--        name refusal before any charge. A name or tag taken in a race unwinds the charge. A replayed key answers its first result.
--   hr_clan_browser(p_query, p_limit)   every clan, or those whose name holds p_query or whose tag starts with it; members first.
--   hr_clan_roster()                    the account's clan with its members (name, Level, rank, online and what they do, presence_quiet
--        honoured), or the invites waiting for an account in none.
--   hr_clan_invite(p_target)            a leader or officer invites a character by name (or an account by id). Refused across a block.
--   hr_clan_rank(p_target, p_rank)      the leader sets officer or member, or hands the clan on (the leader becomes an officer).
--   clan_join, clan_leave, clan_kick, clan_invite_revoke, clan_join_policy_set   the 2026-08 bodies, unchanged, now client-executable.
-- THE CASTLE, HIDDEN AND KEPT (X-04): every castle, feast, upkeep, vote, treasury, rations and work-order call, the free clan_create and the
--   display-name clan_invite and clan_invites_list stay on the server with no client grant (src/data/clans.js CLAN_HIDDEN_CALLS). §4
--   asserts each exists and that a request role calling one is refused. Chapter 14 builds the castle on them.
-- CHAT:
--   hr_chat_send RESTATED WHOLE: kinds global | party | clan. 'local' is refused bad_channel (GR-69: no Local tab). A clan line is channel
--        clan:<id>, for the account's clan. A Global line first passes the slow mode: the room's lines in the last minute pick the step,
--        and an account that sent a Global line inside the step's gap is refused slow_mode with wait_s.
--   hr_chat_recent RESTATED WHOLE: Global, the party, the clan and System; no zone. Answers `party` and `clan` (the channels to show).
--   hr_chat_broadcast RESTATED WHOLE: a Global line is no longer pushed one by one (hr_chat_global_flush sends it in a batch); a clan line
--        reaches each member's own inbox, never the sender's, never a member who blocked the sender; a party line as before.
--   hr_chat_topic RESTATED: chat:global and chat:system only. hr_realtime_policies RESTATED and run: the chat:local clause goes.
--   hr_chat_global_flush (NEW, pg_cron hr-chat-global each every_s seconds): the Global lines older than settle_s since the last batch,
--        at most max_lines, as ONE broadcast {t:'lines', lines:[...]} on chat:global; the cursor advances in the same statement.
--   hr_chat_flush (NEW): the cursor, one row.
--
-- ── REFUSAL CODES (new) ──────────────────────────────────────────────────────
-- hr_clan_found: bad_slot, bad_idem, bad_quote, bad_name, name_charset, name_blocked, bad_tag, tag_blocked, bad_policy, already_in_clan,
--   quote_changed, name_taken, tag_taken, no_character, (hr_apply's: insufficient_gold, ...). hr_clan_invite: not_member, not_permitted,
--   no_such_player, cannot_invite_self, unavailable (a block either way), already_member, target_in_clan, clan_full. hr_clan_rank:
--   not_member, not_leader, no_target, bad_rank, cannot_rank_self. hr_chat_send: slow_mode (wait_s), not_in_clan.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- hr_clan_found takes the ACCOUNT's clan key (pg_advisory_xact_lock) before reading membership, so two heroes of one account can't found
--   two clans; the charge and the clan rows are one sub-transaction, so a unique name or tag lost to another account's concurrent founding
--   unwinds the charge, its ledger row and the intent claim; a retry of the same key after the commit answers the first result
--   (hr_intent_replay before and after the hero's lock, as 2027-04-19-key-under-lock.sql). The member cap's trigger serialises joins to one
--   clan (2026-08-11-clan-member-cap.sql). hr_clan_rank locks both member rows. The flush runs under a try-lock and moves its cursor in
--   its own transaction. A second apply of this file is byte-identical: create if not exists, seeds rewritten whole, bodies restated,
--   grants and baseline rows re-made, the cron row ensured by name.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- +5 new client verbs, +5 2026-08 verbs opened (membership and admin only: none moves gold, an item or XP). One money verb: the price is
--   the server's row, the purse is hr_apply's, and a forged price is refused. Names and tags pass the clan charset and hr_name_blocked
--   (the name filter); a line passes the chat body rules, the mute and the word filter as before; a block holds on every clan fan-out and
--   read. A clan line is readable through the table only by a current member (2026-08's policy 'clan channel readable by members', on
--   profiles.clan_id, which the membership trigger keeps), through hr_chat_recent for a current member, and in each member's own inbox. −1 chat channel (Local). The castle's ~40 calls stay closed.
--
-- ── COST (100x players) ──────────────────────────────────────────────────────
-- Global: one realtime message a batch (at most one every every_s seconds, only when a line was sent) for every listener, in place of one
--   a line; the flush is one indexed read a tick when idle (chat_messages_channel_idx). The slow mode reads the last minute of Global on
--   the same index, bounded by the slow mode itself. A clan line: one inbox message a member (the member cap, 10 at the castle's tier 1).
--   Rows: clans and members as before; the rules tables a few rows; one cursor row.
--
-- REVERSIBLE: re-apply the restated bodies from 2027-03-13-gm-tools.sql (hr_chat_send), 2026-11-19-chat-stream-safe.sql (hr_chat_recent)
--   and 2026-12-26-chat-broadcast.sql (hr_chat_broadcast, hr_chat_topic, hr_realtime_policies); hr_cron_drop('hr-chat-global'); drop the
--   new functions and tables and clans.tag; revoke the opened 2026-08 verbs and delete their baseline rows. A founded clan is a player's
--   row and stays (its gold went to the sink).
-- LIVE STATE: L-07 closed (0 clans and 0 members on production, 2026-11-21). Release note: "The party finder and the Local tab are gone."
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_def text;
begin
  if to_regclass('public.hr_clan_rules') is null or to_regclass('public.hr_chat_slow_mode') is null or to_regclass('public.hr_chat_global_rule') is null then
    raise exception 'PRECONDITION: apply 1036-social-catalogue.generated.sql first (the rules this file reads)'; end if;
  if to_regclass('public.clans') is null or to_regclass('public.clan_members') is null or to_regclass('public.clan_invites') is null
     or to_regclass('public.clan_bans') is null or to_regclass('public.clan_ledger') is null or to_regclass('public.hr_castle_tiers') is null then
    raise exception 'PRECONDITION: the 2026-08 clan chain is missing'; end if;
  if has_table_privilege('authenticated', 'public.clan_members', 'insert,update,delete') then
    raise exception 'PRECONDITION: apply 1003-dead-client-writes.sql first (clan_members still takes a client write)'; end if;
  if to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_social_target(text)') is null or to_regprocedure('public.hr_social_blocked(uuid,uuid)') is null
     or to_regprocedure('public.hr_social_name(uuid)') is null or to_regprocedure('public.hr_chat_mask(text)') is null
     or to_regprocedure('public.hr_chat_inbox_topic(uuid)') is null or to_regprocedure('public.hr_name_blocked(text)') is null then
    raise exception 'PRECONDITION: hr_apply, the social helpers or the chat helpers are missing'; end if;
  for v_r in select * from (values
    ('public.hr_chat_send(integer,text,text)', 'bb01f726ababc0d970db3a80741a39ef'),
    ('public.hr_chat_recent(integer)', '18f8c572d31b07a561c212556e6a5877'),
    ('public.hr_chat_broadcast()', '7181202283c7e8ed0b29a8abcff8aa22'),
    ('public.hr_chat_topic(text)', '8b4ab32f504d3925150baddd8d4ddec5')) t(fn, pre) loop
    v_def := pg_get_functiondef(v_r.fn::regprocedure);
    if md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')) is distinct from v_r.pre and strpos(v_def, 'SOCIAL-CLANS (1036-social-clans.sql)') = 0 then
      raise exception 'PIN: % is neither its expected image (%) nor this file''s: md5 % - another file moved it', v_r.fn, v_r.pre,
        md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')); end if;
  end loop;
  v_def := (select prosrc from pg_proc where oid = to_regprocedure('public.hr_realtime_policies()'));
  if v_def is null or (md5(replace(v_def, chr(13), '')) is distinct from 'facea09281fe2085a0b0260958729309' and strpos(v_def, 'SOCIAL-CLANS (1036-social-clans.sql)') = 0) then
    raise exception 'PIN: hr_realtime_policies() is neither 2026-12-26''s image (facea092) nor this file''s'; end if;
end $mig$;

-- ── §1 THE CURSOR AND THE TAG ────────────────────────────────────────────────
create table if not exists public.hr_chat_flush (
  channel    text        primary key check (channel = 'global'),
  flushed_to timestamptz not null,
  flushed_at timestamptz
);
comment on table public.hr_chat_flush is '1036-social-clans.sql: Global''s batch cursor: lines up to flushed_to have been sent. Written only by hr_chat_global_flush.';
alter table public.hr_chat_flush enable row level security;
revoke all on public.hr_chat_flush from public, anon, authenticated, service_role;
insert into public.hr_chat_flush (channel, flushed_to) values ('global', now()) on conflict (channel) do nothing;

alter table public.clans add column if not exists tag text;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'clans_tag_shape') then
    alter table public.clans add constraint clans_tag_shape check (tag is null or tag ~ '^[A-Z0-9]{1,8}$'); end if;
end $mig$;
create unique index if not exists clans_tag_key on public.clans (tag) where tag is not null;
create unique index if not exists clans_name_lower_key on public.clans (lower(name));
comment on column public.clans.tag is '1036-social-clans.sql: the clan''s tag, letters and digits in capitals (hr_clan_rules tag_min..tag_max), unique, set at founding.';

-- ── §2 THE CLAN VERBS ────────────────────────────────────────────────────────
-- One account's clan key: hr_clan_found takes it before it reads the account's membership.
create or replace function public.hr_clan_account_lock(p_user uuid)
returns void language sql security definer set search_path = public, pg_catalog as $fn$
  select pg_advisory_xact_lock(hashtextextended('hr:clan:account:' || p_user::text, 0))
$fn$;

-- A clan's card, as every list shows it.
create or replace function public.hr_clan_card(p_clan uuid)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $fn$
  select jsonb_build_object('id', c.id, 'name', c.name, 'tag', c.tag, 'join_policy', c.join_policy,
           'members', (select count(*)::int from public.clan_members m where m.clan_id = c.id),
           'member_cap', coalesce((select t.member_cap from public.hr_castle_tiers t where t.tier = greatest(1, coalesce(c.castle_tier, 1))),
                                  (select min(t.member_cap) from public.hr_castle_tiers t), 10),
           'leader', (select public.hr_social_name(m.user_id) from public.clan_members m where m.clan_id = c.id and m.role = 'leader' limit 1),
           'founded_ms', floor(extract(epoch from c.created_at) * 1000)::bigint)
    from public.clans c where c.id = p_clan
$fn$;

create or replace function public.hr_clan_found(p_slot int, p_name text, p_tag text, p_policy text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'clan_found';
  v_uid uuid := auth.uid(); v_rule public.hr_clan_rules%rowtype; v_r jsonb; v_ver bigint; v_a jsonb; v_id uuid;
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_tag text := upper(btrim(coalesce(p_tag, '')));
  v_policy text := lower(btrim(coalesce(p_policy, 'open')));
  v_verb text;
begin
  -- SOCIAL-CLANS (1036-social-clans.sql): a clan for gold (25-6), from the account's purse, journalled; every refusal before the charge.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('clan_create') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 1 or p_price > 1000000000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  select * into v_rule from public.hr_clan_rules where id;
  if v_rule.id is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  if length(v_name) < v_rule.name_min or length(v_name) > v_rule.name_max then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_name')); end if;
  -- the display-name ASCII rule (2026-10-11, Security #2), as clan_create
  if v_name !~ '^[A-Za-z0-9][A-Za-z0-9 _''’.-]*[A-Za-z0-9]$' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'name_charset')); end if;
  if public.hr_name_blocked(v_name) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'name_blocked')); end if;
  if length(v_tag) < v_rule.tag_min or length(v_tag) > v_rule.tag_max or v_tag !~ '^[A-Z0-9]+$' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_tag')); end if;
  if public.hr_name_blocked(v_tag) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'tag_blocked')); end if;
  if v_policy not in ('open', 'invite') then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_policy')); end if;
  v_verb := c_verb || ':' || lower(v_name);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  -- THE ACCOUNT'S CLAN KEY, then THE HERO'S LOCK: one account founds one clan, and the purse moves under hr_apply's version.
  perform public.hr_clan_account_lock(v_uid);
  perform public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if exists (select 1 from public.clan_members m where m.user_id = v_uid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'already_in_clan')); end if;
  if p_price <> v_rule.found_gold then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'price', v_rule.found_gold)); end if;
  if exists (select 1 from public.clans c where lower(c.name) = lower(v_name)) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'name_taken')); end if;
  if exists (select 1 from public.clans c where c.tag = v_tag) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'tag_taken')); end if;
  -- THE CHARGE AND THE CLAN, ALL OR NOTHING: a name or tag another account took in the same instant unwinds the charge.
  begin
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'gold', -v_rule.found_gold,
             'journal', jsonb_build_object('kind', 'clan', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'clan_found', 'name', v_name, 'tag', v_tag, 'gold', v_rule.found_gold))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      return public.hr_note_rejection(c_verb, p_slot, v_a || jsonb_build_object('ok', false)); end if;
    if coalesce(v_a->>'replayed', 'false') = 'true' then
      return jsonb_build_object('ok', true, 'replayed', true, 'clan', public.hr_clan_card((select m.clan_id from public.clan_members m where m.user_id = v_uid)));
    end if;
    insert into public.clans (name, tag, created_by, join_policy) values (v_name, v_tag, v_uid, v_policy) returning id into v_id;
    insert into public.clan_members (clan_id, user_id, role) values (v_id, v_uid, 'leader');
    insert into public.clan_ledger (clan_id, user_id, kind, item_id, qty) values (v_id, v_uid, 'member', 'found', v_rule.found_gold);
  exception when unique_violation then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error',
      case when exists (select 1 from public.clans c where c.tag = v_tag) then 'tag_taken' else 'name_taken' end));
  end;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -v_rule.found_gold, 'clan', public.hr_clan_card(v_id));
end $fn$;

-- THE BROWSER: every clan (or those that match p_query), members first, at most browser_max; marks the caller's own and its invites.
drop function if exists public.hr_clan_browser(integer);
create or replace function public.hr_clan_browser(p_query text default null, p_limit int default 25)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_max int; v_lim int; v_q text; v_mine uuid; v_rows jsonb;
begin
  -- SOCIAL-CLANS (1036-social-clans.sql): the clan browser with search (25-3). Counts and names only.
  perform public.hr_access_check();
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rate_ok(v_uid, 'rpc:hr_clan_browser', 60, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_max := coalesce((select r.browser_max from public.hr_clan_rules r where r.id), 50);
  v_lim := least(greatest(coalesce(p_limit, 25), 1), v_max);
  v_q := nullif(left(btrim(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g')), 24), '');
  v_q := case when v_q is null then null else replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') end;
  select m.clan_id into v_mine from public.clan_members m where m.user_id = v_uid;
  select coalesce(jsonb_agg(public.hr_clan_card(x.id) || jsonb_build_object('mine', x.id = v_mine, 'invited', x.invited) order by x.rn), '[]'::jsonb)
    into v_rows
    from (select c.id,
                 exists (select 1 from public.clan_invites i where i.clan_id = c.id and i.user_id = v_uid and i.accepted_at is null
                           and i.revoked_at is null and i.expires_at > now()) as invited,
                 row_number() over (order by (select count(*) from public.clan_members m where m.clan_id = c.id) desc, c.created_at, c.id) as rn
            from public.clans c
           where v_q is null or c.name ilike '%' || v_q || '%' or c.tag ilike v_q || '%') x
   where x.rn <= v_lim;
  return jsonb_build_object('ok', true, 'clans', v_rows, 'mine', v_mine);
end $fn$;

-- THE ROSTER: the account's clan and its members; for an account in none, the invites waiting for it.
create or replace function public.hr_clan_roster()
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_online constant interval := interval '75 seconds';
  v_uid uuid := auth.uid(); v_me public.clan_members%rowtype;
begin
  -- SOCIAL-CLANS (1036-social-clans.sql): names, ranks and Levels the server holds; online and what each does only when not quiet.
  perform public.hr_access_check();
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rate_ok(v_uid, 'clan:read', 30, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select * into v_me from public.clan_members where user_id = v_uid;
  if v_me.user_id is null then
    return jsonb_build_object('ok', true, 'clan', null, 'price', (select r.found_gold from public.hr_clan_rules r where r.id),
      'invites', coalesce((select jsonb_agg(public.hr_clan_card(i.clan_id) || jsonb_build_object('invited_by', public.hr_social_name(i.invited_by),
                                                                                                  'expires_ms', floor(extract(epoch from i.expires_at) * 1000)::bigint)
                                            order by i.created_at desc)
                             from public.clan_invites i
                            where i.user_id = v_uid and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
                              and not public.hr_social_blocked(v_uid, i.invited_by)), '[]'::jsonb));
  end if;
  return jsonb_build_object('ok', true, 'clan', public.hr_clan_card(v_me.clan_id), 'me', v_uid, 'role', v_me.role,
    'members', coalesce((
      select jsonb_agg(public.hr_social_person(m.user_id)
               || jsonb_build_object('role', m.role, 'joined_ms', floor(extract(epoch from m.joined_at) * 1000)::bigint,
                                     'level', (select max(public.hr_level_of(ps.user_id, ps.slot)) from public.player_state ps where ps.user_id = m.user_id))
               || case when q.quiet then jsonb_build_object('online', false, 'doing', null)
                       else jsonb_build_object('online', coalesce(sp.seen_at > now() - c_online, false), 'doing', public.hr_social_doing(m.user_id)) end
             order by case m.role when 'leader' then 0 when 'officer' then 1 else 2 end, m.joined_at, m.user_id)
        from public.clan_members m
        left join public.social_presence sp on sp.user_id = m.user_id
        cross join lateral (select coalesce((select ps.presence_quiet from public.player_state ps
                                              where ps.user_id = m.user_id and ps.slot = public.hr_social_slot(m.user_id)), false) as quiet) q
       where m.clan_id = v_me.clan_id), '[]'::jsonb),
    'invited', case when v_me.role in ('leader', 'officer') then coalesce((
      select jsonb_agg(public.hr_social_person(i.user_id) || jsonb_build_object('expires_ms', floor(extract(epoch from i.expires_at) * 1000)::bigint)
                       order by i.created_at desc)
        from public.clan_invites i
       where i.clan_id = v_me.clan_id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()), '[]'::jsonb) end);
end $fn$;

-- THE INVITE: by a character's name (or an account id), from a leader or an officer; refused across a block either way.
create or replace function public.hr_clan_invite(p_target text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_clan uuid; v_role text; v_t record; v_theirs uuid; v_n int; v_cap int; v_id uuid; v_exp timestamptz; v_days int;
begin
  -- SOCIAL-CLANS (1036-social-clans.sql): one resolver for every social target (hr_social_target); nothing about the target crosses from the client.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('clan_invite') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select m.clan_id, m.role into v_clan, v_role from public.clan_members m where m.user_id = v_uid;
  if v_clan is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if v_role not in ('leader', 'officer') then return jsonb_build_object('ok', false, 'error', 'not_permitted'); end if;
  select * into v_t from public.hr_social_target(p_target);
  if v_t.target_user is null then return jsonb_build_object('ok', false, 'error', 'no_such_player'); end if;
  if v_t.target_user = v_uid then return jsonb_build_object('ok', false, 'error', 'cannot_invite_self'); end if;
  if public.hr_social_blocked(v_uid, v_t.target_user) then return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  select m.clan_id into v_theirs from public.clan_members m where m.user_id = v_t.target_user;
  if v_theirs is not null then
    return jsonb_build_object('ok', false, 'error', case when v_theirs = v_clan then 'already_member' else 'target_in_clan' end); end if;
  v_cap := ((public.hr_clan_card(v_clan))->>'member_cap')::int;
  select count(*)::int into v_n from public.clan_members where clan_id = v_clan;
  if v_n >= v_cap then return jsonb_build_object('ok', false, 'error', 'clan_full'); end if;
  delete from public.clan_bans where clan_id = v_clan and user_id = v_t.target_user;
  v_days := coalesce((select r.invite_days from public.hr_clan_rules r where r.id), 7);
  insert into public.clan_invites (clan_id, user_id, invited_by, expires_at)
    values (v_clan, v_t.target_user, v_uid, now() + make_interval(days => v_days))
    on conflict (clan_id, user_id) where accepted_at is null and revoked_at is null
    do update set invited_by = excluded.invited_by, created_at = now(), expires_at = excluded.expires_at
    returning id, expires_at into v_id, v_exp;
  insert into public.clan_ledger (clan_id, user_id, kind, item_id) values (v_clan, v_t.target_user, 'member', 'invite');
  return jsonb_build_object('ok', true, 'invite_id', v_id, 'person', public.hr_social_person(v_t.target_user),
                            'expires_ms', floor(extract(epoch from v_exp) * 1000)::bigint);
end $fn$;

-- THE RANKS: the leader alone sets officer or member, or hands the clan on (and becomes an officer).
create or replace function public.hr_clan_rank(p_target uuid, p_rank text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_uid uuid := auth.uid(); v_me public.clan_members%rowtype; v_them public.clan_members%rowtype; v_rank text := lower(btrim(coalesce(p_rank, '')));
begin
  -- SOCIAL-CLANS (1036-social-clans.sql): MM-8's ranks. Both rows locked, the caller's first.
  perform public.hr_access_check();
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rate_ok(v_uid, 'clan:rank', 12, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if v_rank not in ('leader', 'officer', 'member') then return jsonb_build_object('ok', false, 'error', 'bad_rank'); end if;
  if p_target is null then return jsonb_build_object('ok', false, 'error', 'no_target'); end if;
  if p_target = v_uid then return jsonb_build_object('ok', false, 'error', 'cannot_rank_self'); end if;
  select * into v_me from public.clan_members where user_id = v_uid for update;
  if v_me.user_id is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if v_me.role <> 'leader' then return jsonb_build_object('ok', false, 'error', 'not_leader'); end if;
  select * into v_them from public.clan_members where clan_id = v_me.clan_id and user_id = p_target for update;
  if v_them.user_id is null then return jsonb_build_object('ok', false, 'error', 'no_target'); end if;
  if v_rank = 'leader' then
    update public.clan_members set role = 'officer' where clan_id = v_me.clan_id and user_id = v_uid;
    update public.clan_members set role = 'leader' where clan_id = v_me.clan_id and user_id = p_target;
    insert into public.clan_ledger (clan_id, user_id, kind, item_id) values (v_me.clan_id, p_target, 'role', 'leader'), (v_me.clan_id, v_uid, 'role', 'officer');
  elsif v_them.role is distinct from v_rank then
    update public.clan_members set role = v_rank where clan_id = v_me.clan_id and user_id = p_target;
    insert into public.clan_ledger (clan_id, user_id, kind, item_id) values (v_me.clan_id, p_target, 'role', v_rank);
  end if;
  return jsonb_build_object('ok', true, 'user_id', p_target, 'role', v_rank);
end $fn$;

-- ── §3 THE GRANTS: the first build's clan calls open, the castle's hidden and kept ──
do $grants$
declare v_sig text; v_role text;
begin
  -- helpers: the owner only
  foreach v_sig in array array['public.hr_clan_account_lock(uuid)', 'public.hr_clan_card(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
  end loop;
  -- THE OPEN CALLS
  foreach v_sig in array array['public.hr_clan_found(integer,text,text,text,bigint,uuid)', 'public.hr_clan_browser(text,integer)',
                               'public.hr_clan_roster()', 'public.hr_clan_invite(text)', 'public.hr_clan_rank(uuid,text)',
                               'public.clan_join(uuid)', 'public.clan_leave()', 'public.clan_kick(uuid,integer)',
                               'public.clan_invite_revoke(uuid)', 'public.clan_join_policy_set(text)'] loop
    execute format('revoke all on function %s from public, anon, service_role', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
  -- THE HIDDEN CALLS (src/data/clans.js CLAN_HIDDEN_CALLS): no request role, every overload
  for v_sig in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = any (array[
                  'clan_contribute', 'clan_contribute__ungated', 'clan_create', 'clan_deposit', 'clan_deposit__ungated',
                  'clan_feast_call', 'clan_feast_call__ungated', 'clan_feast_deposit', 'clan_feast_deposit__ungated',
                  'clan_invite', 'clan_invites_list', 'clan_rested_grant', 'clan_rested_grant__ungated', 'clan_seat_read', 'clan_seat_read__ungated',
                  'clan_upkeep_settle', 'clan_vice_set', 'clan_vice_set__ungated',
                  'clan_vote_cast', 'clan_vote_cast__ungated', 'clan_vote_close', 'clan_vote_close__ungated',
                  'clan_vote_open', 'clan_vote_open__ungated', 'clan_vote_read', 'clan_vote_read__ungated',
                  'clan_work_labour', 'clan_work_labour__ungated', 'clan_work_post', 'clan_work_post__ungated',
                  'clan_work_supply', 'clan_work_supply__ungated']) loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
  end loop;
end $grants$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in
  ('hr_clan_found', 'hr_clan_browser', 'hr_clan_roster', 'hr_clan_invite', 'hr_clan_rank',
   'clan_join', 'clan_leave', 'clan_kick', 'clan_invite_revoke', 'clan_join_policy_set');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_clan_found', 'p_slot integer, p_name text, p_tag text, p_policy text, p_price bigint, p_idem uuid', 'authenticated',
   'added 1036-social-clans (FB-12): MONEY (a gold sink) - found a clan at the server''s price (hr_clan_rules, 25-6) from the account''s purse through hr_apply, journalled kind clan; the clan charset and name filter; refuses quote_changed'),
  ('hr_clan_browser', 'p_query text, p_limit integer', 'authenticated',
   'added 1036-social-clans (FB-12): the clan browser with search (25-3); cards only (name, tag, members, cap, policy, leader''s name); 60/min'),
  ('hr_clan_roster', '', 'authenticated',
   'added 1036-social-clans (FB-12): the account''s clan and members (name, Level, rank; online and doing only when not quiet), or its invites; 30/min'),
  ('hr_clan_invite', 'p_target text', 'authenticated',
   'added 1036-social-clans (FB-12): a leader or officer invites a character by name or an account by id; refused across a block; the member cap'),
  ('hr_clan_rank', 'p_target uuid, p_rank text', 'authenticated',
   'added 1036-social-clans (FB-12): the leader sets officer or member, or hands the clan on; journalled in clan_ledger'),
  ('clan_join', 'p_clan_id uuid', 'authenticated', 'opened 1036-social-clans (FB-12): the 2026-08-11 body; join an open clan or one that invited the account; bans and the member cap hold'),
  ('clan_leave', '', 'authenticated', 'opened 1036-social-clans (FB-12): the 2026-08-11 body; leave; a leader passes it on; the last one out disbands'),
  ('clan_kick', 'p_user_id uuid, p_ban_hours integer', 'authenticated', 'opened 1036-social-clans (FB-12): the 2026-08-11 body; a leader or officer removes a member (an officer only rank-and-file)'),
  ('clan_invite_revoke', 'p_user_id uuid', 'authenticated', 'opened 1036-social-clans (FB-12): the 2026-08-11 body; withdraw an invite'),
  ('clan_join_policy_set', 'p_policy text', 'authenticated', 'opened 1036-social-clans (FB-12): the 2026-08-11 body; open or invite only, a leader or officer');

-- ── §4 CHAT: CLAN LINES, NO LOCAL, GLOBAL IN BATCHES WITH A SLOW MODE ───────
create or replace function public.hr_chat_send(p_slot integer, p_kind text, p_body text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_body text; v_fault text; v_channel text; v_pid uuid; v_aud uuid[];
  v_row public.chat_messages%rowtype; v_until timestamptz; v_clan uuid; v_rate int; v_gap int; v_last timestamptz;
begin
  -- SOCIAL-CLANS (1036-social-clans.sql): global | party | clan; no Local (GR-69); Global's slow mode (31-1). The rest is 2027-03-13's.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  -- GM-TOOLS (2027-03-13-gm-tools.sql): a mute says so; hr_chat_zgm_gate is the second lock.
  v_until := public.hr_chat_muted_until(v_uid);
  if v_until is not null then return jsonb_build_object('ok', false, 'error', 'muted', 'until', v_until); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_kind is null or p_kind not in ('global', 'party', 'clan') then return jsonb_build_object('ok', false, 'error', 'bad_channel'); end if;
  v_body := public.hr_chat_clean(p_body);
  v_fault := public.hr_chat_body_fault(v_body);
  if v_fault is not null then return jsonb_build_object('ok', false, 'error', v_fault); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if not public.hr_rate_ok(v_uid, 'chat:burst', 5, interval '10 seconds') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_rate_ok(v_uid, 'chat:send', 20, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_kind = 'global' then
    v_channel := 'global';
    -- THE SLOW MODE: the room's lines in the last minute pick the step; an account inside its gap waits.
    select count(*)::int into v_rate from public.chat_messages m where m.channel = 'global' and m.created_at > now() - interval '1 minute';
    select s.gap_s into v_gap from public.hr_chat_slow_mode s where s.lines_per_min <= v_rate order by s.lines_per_min desc limit 1;
    if v_gap is not null then
      select max(m.created_at) into v_last from public.chat_messages m
       where m.channel = 'global' and m.created_at > now() - make_interval(secs => v_gap) and m.from_id = v_uid;
      if v_last is not null then
        return jsonb_build_object('ok', false, 'error', 'slow_mode',
          'wait_s', greatest(1, ceil(extract(epoch from (v_last + make_interval(secs => v_gap) - now()))))::int); end if;
    end if;
  elsif p_kind = 'clan' then
    select m.clan_id into v_clan from public.clan_members m where m.user_id = v_uid;
    if v_clan is null then return jsonb_build_object('ok', false, 'error', 'not_in_clan'); end if;
    v_channel := 'clan:' || v_clan::text;
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
end $fn$;

create or replace function public.hr_chat_recent(p_slot integer)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- CHAT-STREAM-SAFE (2026-11-19): lines at or after hr_chat_history_floor(), every body masked.
declare v_uid uuid := auth.uid(); v_pid uuid; v_party text; v_clan text; v_floor timestamptz;
begin
  -- SOCIAL-CLANS (1036-social-clans.sql): Global, the party, the account's clan (current members only) and System. No zone.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'chat:read', 30, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  v_party := case when v_pid is null then null else 'party:' || v_pid::text end;
  v_clan := (select 'clan:' || m.clan_id::text from public.clan_members m where m.user_id = v_uid);
  v_floor := public.hr_chat_history_floor();
  return jsonb_build_object('ok', true, 'party', v_party, 'clan', v_clan, 'lines', coalesce((
    select jsonb_agg(public.hr_chat_row(x) || jsonb_build_object('body', public.hr_chat_mask(x.body))
                     order by x.created_at, x.id) from (
      (select * from public.chat_messages m where m.channel = 'global' and m.created_at >= v_floor
        order by m.created_at desc limit 50)
      union all (select * from public.chat_messages m where v_party is not null and m.channel = v_party
                   and v_uid = any (m.audience) and m.created_at >= v_floor order by m.created_at desc limit 50)
      union all (select * from public.chat_messages m where v_clan is not null and m.channel = v_clan
                   and m.created_at >= v_floor order by m.created_at desc limit 50)
      union all (select * from public.chat_messages m where m.channel = 'system' and m.created_at >= v_floor
        order by m.created_at desc limit 20)
    ) x
    where not exists (select 1 from public.chat_blocks b where b.blocker_id = v_uid and b.blocked_id = x.from_id)), '[]'::jsonb));
end $fn$;

create or replace function public.hr_chat_topic(p_channel text)
returns text language sql immutable set search_path = public as $fn$
  -- SOCIAL-CLANS (1036-social-clans.sql): the public topics are Global and System; party and clan lines go to the members' inboxes.
  select case when p_channel in ('global', 'system') then 'chat:' || p_channel end
$fn$;

create or replace function public.hr_chat_broadcast()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_msg jsonb; v_topic text; v_u uuid;
begin
  -- CHAT-BROADCAST (2026-12-26-chat-broadcast.sql): the stored line, once, to everyone allowed to hear it.
  -- SOCIAL-CLANS (1036-social-clans.sql): Global goes in batches (hr_chat_global_flush); a clan line to each member's own inbox.
  begin
    if new.channel = 'global' then return null; end if;
    if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then return null; end if;
    v_msg := jsonb_build_object('t', 'line', 'line', public.hr_chat_row(new));
    if new.channel like 'party:%' then
      -- The party as it stood when the line was written (hr_chat_send's audience), each member's own inbox: never
      -- the sender's (its answer carries the line), never a member who blocked the sender.
      for v_u in select distinct a from unnest(coalesce(new.audience, '{}'::uuid[])) a
                  where a is not null and a is distinct from new.from_id
                    and not exists (select 1 from public.chat_blocks b where b.blocker_id = a and b.blocked_id = new.from_id)
                  order by 1 loop
        perform realtime.send(v_msg, 'line', public.hr_chat_inbox_topic(v_u), true);
      end loop;
    elsif new.channel like 'clan:%' then
      -- The clan's members at this instant, each one's own inbox: never the sender's, never a member who blocked the sender.
      for v_u in select m.user_id from public.clan_members m
                  where m.clan_id = substr(new.channel, 6)::uuid and m.user_id is distinct from new.from_id
                    and not exists (select 1 from public.chat_blocks b where b.blocker_id = m.user_id and b.blocked_id = new.from_id)
                  order by 1 loop
        perform realtime.send(v_msg, 'line', public.hr_chat_inbox_topic(v_u), true);
      end loop;
    else
      v_topic := public.hr_chat_topic(new.channel);
      if v_topic is not null then perform realtime.send(v_msg, 'line', v_topic, true); end if;
    end if;
  exception when others then
    raise warning 'hr_chat_broadcast: line % not pushed (%) — it is stored; the next read shows it', new.id, sqlerrm;
  end;
  return null;
end $fn$;

-- THE GLOBAL BATCH: the lines older than settle_s since the cursor, at most max_lines, as ONE message; the cursor moves either way.
create or replace function public.hr_chat_global_flush()
returns int language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare r public.hr_chat_global_rule%rowtype; v_from timestamptz; v_to timestamptz; v_lines jsonb; v_n int; v_max timestamptz;
begin
  -- SOCIAL-CLANS (1036-social-clans.sql): 31-1's small batches. A push failure never loses a line: it is stored, and a (re)join re-reads.
  if not pg_try_advisory_xact_lock(hashtext('hr_chat_global_flush')) then return 0; end if;
  select * into r from public.hr_chat_global_rule where id;
  select f.flushed_to into v_from from public.hr_chat_flush f where f.channel = 'global' for update;
  if r.id is null or v_from is null then return 0; end if;
  v_to := now() - make_interval(secs => r.settle_s);
  if v_to <= v_from then return 0; end if;
  select coalesce(jsonb_agg(public.hr_chat_row(x) || jsonb_build_object('body', public.hr_chat_mask(x.body)) order by x.created_at, x.id), '[]'::jsonb),
         count(*)::int, max(x.created_at)
    into v_lines, v_n, v_max
    from (select * from public.chat_messages m where m.channel = 'global' and m.created_at > v_from and m.created_at <= v_to
           order by m.created_at, m.id limit r.max_lines) x;
  if v_n > 0 and to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    begin
      perform realtime.send(jsonb_build_object('t', 'lines', 'lines', v_lines), 'lines', 'chat:global', true);
    exception when others then
      raise warning 'hr_chat_global_flush: % lines not pushed (%) — they are stored; the next read shows them', v_n, sqlerrm;
    end;
  end if;
  update public.hr_chat_flush set flushed_to = case when v_n >= r.max_lines then v_max else v_to end, flushed_at = now() where channel = 'global';
  return v_n;
end $fn$;

create or replace function public.hr_realtime_policies()
returns integer language plpgsql set search_path = public, pg_catalog as $fn$
begin
  -- SOCIAL-CLANS (1036-social-clans.sql): 2026-12-26's two policies, the chat:local clause gone (GR-69).
  if to_regclass('realtime.messages') is null then return 0; end if;
  -- THE CHARACTER'S FRAME TOPIC hr:<uid>:<slot> (2026-09-22-frame-push-channel.sql §6, verbatim): its owner only,
  -- slot 0-5, exactly three segments, broadcast only.
  execute 'drop policy if exists "hr_frame_receive_own_topic" on realtime.messages';
  execute $p$
    create policy "hr_frame_receive_own_topic"
      on realtime.messages
      for select
      to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and split_part((select realtime.topic()), ':', 1) = 'hr'
        and split_part((select realtime.topic()), ':', 2) = (select auth.uid())::text
        and split_part((select realtime.topic()), ':', 3) ~ '^[0-5]$'
        and array_length(string_to_array((select realtime.topic()), ':'), 1) = 3
      )
  $p$;
  -- An ADMITTED player hears Global, System and its own inbox (its whispers, its party's and its clan's lines). The inbox is
  -- pinned to auth.uid() by EQUALITY over the whole topic, so no prefix or extra segment widens it.
  execute 'drop policy if exists "hr_chat_receive" on realtime.messages';
  execute $p$
    create policy "hr_chat_receive"
      on realtime.messages
      for select
      to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and (select public.hr_admitted((select auth.uid())))
        and (   (select realtime.topic()) in ('chat:global', 'chat:system')
             or (select realtime.topic()) = 'chat:inbox:' || (select auth.uid())::text)
      )
  $p$;
  return 2;
end $fn$;
select public.hr_realtime_policies();

do $mig$
declare v_every int := (select r.every_s from public.hr_chat_global_rule r where r.id);
begin
  revoke all on function public.hr_chat_global_flush() from public, anon, authenticated, service_role;
  revoke all on function public.hr_realtime_policies() from public, anon, authenticated, service_role;
  if to_regprocedure('cron.schedule(text,text,text)') is null or to_regprocedure('public.hr_cron_ensure(text,text,text)') is null then
    raise notice 'social-clans §4: pg_cron absent here; hr-chat-global is not scheduled'; return; end if;
  perform public.hr_cron_ensure('hr-chat-global', v_every || ' seconds', 'select public.hr_chat_global_flush()');
end $mig$;
do $grants$
declare v_sig text;
begin
  foreach v_sig in array array['public.hr_chat_topic(text)', 'public.hr_chat_broadcast()'] loop
    execute format('revoke execute on function %s from public', v_sig);
    execute format('revoke execute on function %s from anon, authenticated, service_role', v_sig);
  end loop;
  revoke execute on function public.hr_chat_send(integer, text, text) from public, anon, service_role;
  grant execute on function public.hr_chat_send(integer, text, text) to authenticated;
  revoke execute on function public.hr_chat_recent(integer) from public, anon, service_role;
  grant execute on function public.hr_chat_recent(integer) to authenticated;
end $grants$;
update public.hr_client_rpc_baseline set note =
  'added 2026-10-25 (chat-channels): post a line to global / party / clan (1036-social-clans: Local gone, Global''s slow mode, the clan''s channel); name, level, weapon, role and audience are the server''s; 5/10 s, 20/min; item links checked against hr_items'
 where grantee = 'authenticated' and proname = 'hr_chat_send';
update public.hr_client_rpc_baseline set note =
  'added 2026-10-25 (chat-channels): the chat window''s history and the channels to show (1036-social-clans: Global, party, clan, System; no zone); blocked senders removed; 30/min'
 where grantee = 'authenticated' and proname = 'hr_chat_recent';

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ───────
-- (a) THE GRANTS: the open calls are authenticated's and not anon's; every hidden call EXISTS (never dropped) and no request role may run
--     it, and calling one as `authenticated` is refused (42501); the baseline names each open call; the detector passes strict
-- (b) FOUNDING: the purse falls by exactly the rule's price, one ledger row kind clan says so, the founder leads; the same key again
--     charges nothing; a second founding is refused already_in_clan; a forged price is refused quote_changed; a purse too thin moves
--     nothing and founds nothing
-- (c) THE BROWSER finds by name and by tag and nothing for a stranger's word; joining an open clan; the roster lists both, leader first
-- (d) INVITE ONLY: a stranger is refused; an invite by id lets it in; only the leader sets a rank; an officer removes a member
-- (e) CLAN CHAT: a clan line is channel clan:<id> and a member reads it (its RPC and the table); one who left neither sends nor reads it
--     (its RPC and the table, as the request role); 'local' is refused
-- (f) THE SLOW MODE: in a busy room one account's second Global line inside the gap is refused slow_mode with its wait
-- (g) THE BATCH: one flush sends what is settled since the cursor and moves it; a second sends nothing
do $$
declare
  c_a constant uuid := '000000c0-0000-4000-a000-0000c1a70001';
  c_b constant uuid := '000000c0-0000-4000-a000-0000c1a70002';
  c_c constant uuid := '000000c0-0000-4000-a000-0000c1a70003';
  k   constant text := '000000c0-0000-4000-b000-0000c1a7';
  v jsonb; v_clan uuid; v_sig text; v_role text; v_name text; v_price bigint; v_g0 bigint; v_g1 bigint; v_n int; v_i int;
  c_open constant text[] := array['public.hr_clan_found(integer,text,text,text,bigint,uuid)', 'public.hr_clan_browser(text,integer)',
                                  'public.hr_clan_roster()', 'public.hr_clan_invite(text)', 'public.hr_clan_rank(uuid,text)',
                                  'public.clan_join(uuid)', 'public.clan_leave()', 'public.clan_kick(uuid,integer)',
                                  'public.clan_invite_revoke(uuid)', 'public.clan_join_policy_set(text)'];
  c_hidden constant text[] := array[
    'clan_contribute', 'clan_contribute__ungated', 'clan_create', 'clan_deposit', 'clan_deposit__ungated',
    'clan_feast_call', 'clan_feast_call__ungated', 'clan_feast_deposit', 'clan_feast_deposit__ungated',
    'clan_invite', 'clan_invites_list', 'clan_rested_grant', 'clan_rested_grant__ungated', 'clan_seat_read', 'clan_seat_read__ungated',
    'clan_upkeep_settle', 'clan_vice_set', 'clan_vice_set__ungated',
    'clan_vote_cast', 'clan_vote_cast__ungated', 'clan_vote_close', 'clan_vote_close__ungated',
    'clan_vote_open', 'clan_vote_open__ungated', 'clan_vote_read', 'clan_vote_read__ungated',
    'clan_work_labour', 'clan_work_labour__ungated', 'clan_work_post', 'clan_work_post__ungated',
    'clan_work_supply', 'clan_work_supply__ungated'];
begin
  -- (a)
  foreach v_sig in array c_open loop
    if not has_function_privilege('authenticated', v_sig::regprocedure, 'execute') or has_function_privilege('anon', v_sig::regprocedure, 'execute') then
      raise exception 'social-clans §5(a): % is not authenticated''s alone', v_sig; end if;
    if not exists (select 1 from public.hr_client_rpc_baseline b where b.grantee = 'authenticated'
                    and b.proname = (v_sig::regprocedure)::oid::regproc::text and b.identity_args = pg_get_function_identity_arguments(v_sig::regprocedure)) then
      raise exception 'social-clans §5(a): % has no baseline row', v_sig; end if;
  end loop;
  foreach v_name in array c_hidden loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = v_name) then
      raise exception 'social-clans §5(a): the hidden castle call % was DROPPED (X-04: hide, never drop)', v_name; end if;
    for v_sig in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = v_name loop
      foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
        if has_function_privilege(v_role, v_sig::regprocedure, 'execute') then
          raise exception 'social-clans §5(a): % can run the hidden castle call %', v_role, v_sig; end if;
      end loop;
    end loop;
  end loop;
  perform set_config('request.jwt.claim.sub', c_a::text, true);
  set local role authenticated;
  begin
    perform public.clan_contribute(null::uuid, null::bigint, null::int);
    raise exception 'social-clans §5(a): authenticated ran clan_contribute';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.clan_vote_open(null::uuid, null::jsonb, null::int);
    raise exception 'social-clans §5(a): authenticated ran clan_vote_open';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform public.hr_assert_grant_hygiene(true);

  begin
    insert into auth.users (id) values (c_a), (c_b), (c_c) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (c_a, 'Probe Clanfounder'), (c_b, 'Probe Clanjoiner'), (c_c, 'Probe Clanguest')
      on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (c_a, 'social-clans §5'), (c_b, 'social-clans §5'), (c_c, 'social-clans §5')
      on conflict (user_id) do nothing;
    foreach v_sig in array array[c_a::text, c_b::text, c_c::text] loop
      perform set_config('request.jwt.claim.sub', v_sig, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'social-clans §5: hr_create_character refused: %', v; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', '', true);
    select r.found_gold into v_price from public.hr_clan_rules r where r.id;
    insert into public.account_wallet as w (user_id, gold) values (c_a, v_price * 2 + 7), (c_b, v_price * 2), (c_c, 10)
      on conflict (user_id) do update set gold = excluded.gold;
    delete from public.hr_rate_counters where user_id in (c_a, c_b, c_c);
    -- (b) FOUNDING
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    select gold into v_g0 from public.account_wallet where user_id = c_a;
    v := public.hr_clan_found(0, 'Zq Probe Hall', 'zqp', 'open', v_price, (k || '0001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'social-clans §5(b): the founding refused: %', v; end if;
    v_clan := (v->'clan'->>'id')::uuid;
    select gold into v_g1 from public.account_wallet where user_id = c_a;
    if v_g0 - v_g1 <> v_price then raise exception 'social-clans §5(b): the purse fell by %, want %', v_g0 - v_g1, v_price; end if;
    if (select count(*) from public.player_ledger l where l.user_id = c_a and l.kind = 'clan' and l.gold = -v_price and l.intent = 'clan_found:zq probe hall') <> 1 then
      raise exception 'social-clans §5(b): the charge is not one ledger row kind clan'; end if;
    if (select c.tag from public.clans c where c.id = v_clan) is distinct from 'ZQP'
       or (select m.role from public.clan_members m where m.user_id = c_a) is distinct from 'leader' then
      raise exception 'social-clans §5(b): the clan or its leader is not what was founded'; end if;
    v := public.hr_clan_found(0, 'Zq Probe Hall', 'zqp', 'open', v_price, (k || '0001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.account_wallet where user_id = c_a) <> v_g1 then
      raise exception 'social-clans §5(b): the same key charged again: %', v; end if;
    v := public.hr_clan_found(0, 'Zq Second Hall', 'zqs', 'open', v_price, (k || '0002')::uuid);
    if v->>'error' is distinct from 'already_in_clan' or (select gold from public.account_wallet where user_id = c_a) <> v_g1 then
      raise exception 'social-clans §5(b): a second founding read %', v; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_clan_found(0, 'Zq Forged Hall', 'zqf', 'open', 1, (k || '0003')::uuid);
    if v->>'error' is distinct from 'quote_changed' then raise exception 'social-clans §5(b): a forged price read %', v; end if;
    v := public.hr_clan_found(0, 'Zq Probe Hall', 'zqx', 'open', v_price, (k || '0004')::uuid);
    if v->>'error' is distinct from 'name_taken' then raise exception 'social-clans §5(b): a taken name read %', v; end if;
    perform set_config('request.jwt.claim.sub', c_c::text, true);
    v := public.hr_clan_found(0, 'Zq Poor Hall', 'zqq', 'open', v_price, (k || '0005')::uuid);
    if coalesce(v->>'ok', '') = 'true' or (select gold from public.account_wallet where user_id = c_c) <> 10
       or exists (select 1 from public.clans where name = 'Zq Poor Hall') then
      raise exception 'social-clans §5(b): a thin purse founded or moved: %', v; end if;
    -- (c) THE BROWSER, JOINING, THE ROSTER
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_clan_browser('probe hall', 10);
    if not exists (select 1 from jsonb_array_elements(v->'clans') e where (e->>'id')::uuid = v_clan) then raise exception 'social-clans §5(c): the browser by name read %', v; end if;
    v := public.hr_clan_browser('zq', 10);
    if not exists (select 1 from jsonb_array_elements(v->'clans') e where (e->>'id')::uuid = v_clan and e->>'tag' = 'ZQP') then raise exception 'social-clans §5(c): the browser by tag read %', v; end if;
    if jsonb_array_length(public.hr_clan_browser('xqxqxq%', 10)->'clans') <> 0 then raise exception 'social-clans §5(c): a stranger''s word found a clan'; end if;
    v := public.clan_join(v_clan);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'social-clans §5(c): joining an open clan read %', v; end if;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_clan_roster();
    if jsonb_array_length(v->'members') <> 2 or v->'members'->0->>'id' <> c_a::text or v->'members'->0->>'role' <> 'leader' or v->>'role' <> 'leader' then
      raise exception 'social-clans §5(c): the roster read %', v; end if;
    -- (d) INVITE ONLY, AN INVITE, RANKS, A KICK
    v := public.clan_join_policy_set('invite');
    perform set_config('request.jwt.claim.sub', c_c::text, true);
    if public.clan_join(v_clan)->>'error' is distinct from 'invite_only' then raise exception 'social-clans §5(d): a stranger joined an invite-only clan'; end if;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_clan_invite(c_c::text);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'social-clans §5(d): the invite read %', v; end if;
    perform set_config('request.jwt.claim.sub', c_c::text, true);
    v := public.hr_clan_roster();
    if v->'clan' <> 'null'::jsonb or not exists (select 1 from jsonb_array_elements(v->'invites') e where (e->>'id')::uuid = v_clan) then
      raise exception 'social-clans §5(d): the invited roster read %', v; end if;
    if coalesce(public.clan_join(v_clan)->>'ok', '') <> 'true' then raise exception 'social-clans §5(d): the invited account could not join'; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    if public.hr_clan_rank(c_c, 'officer')->>'error' is distinct from 'not_leader' then raise exception 'social-clans §5(d): a member set a rank'; end if;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_clan_rank(c_b, 'officer');
    if coalesce(v->>'ok', '') <> 'true' or (select m.role from public.clan_members m where m.user_id = c_b) <> 'officer' then
      raise exception 'social-clans §5(d): the leader could not make an officer: %', v; end if;
    -- (e) CLAN CHAT, while C is still in
    delete from public.hr_rate_counters where user_id in (c_a, c_b, c_c);
    v := public.hr_chat_send(0, 'clan', 'zq clan probe line');
    if coalesce(v->>'ok', '') <> 'true' or v->'line'->>'channel' <> 'clan:' || v_clan::text then raise exception 'social-clans §5(e): the clan line read %', v; end if;
    if public.hr_chat_send(0, 'local', 'zq local')->>'error' is distinct from 'bad_channel' then raise exception 'social-clans §5(e): Local still takes a line'; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.clan_kick(c_c, 0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'social-clans §5(d): the officer could not remove a member: %', v; end if;
    v := public.hr_chat_recent(0);
    if v->>'clan' <> 'clan:' || v_clan::text or not exists (select 1 from jsonb_array_elements(v->'lines') l where l->>'body' = 'zq clan probe line') then
      raise exception 'social-clans §5(e): a member does not read the clan''s line: %', v; end if;
    perform set_config('request.jwt.claim.sub', c_c::text, true);
    if public.hr_chat_send(0, 'clan', 'zq')->>'error' is distinct from 'not_in_clan' then raise exception 'social-clans §5(e): one who left still sends'; end if;
    v := public.hr_chat_recent(0);
    if v->'clan' <> 'null'::jsonb or exists (select 1 from jsonb_array_elements(v->'lines') l where l->>'body' = 'zq clan probe line') then
      raise exception 'social-clans §5(e): one who left still reads the clan''s line'; end if;
    -- through the table, as the request role: one who left reads none of it, a member reads it
    set local role authenticated;
    select count(*)::int into v_n from public.chat_messages m where m.channel = 'clan:' || v_clan::text;
    reset role;
    if v_n <> 0 then raise exception 'social-clans §5(e): one who left reads % clan lines from the table', v_n; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    set local role authenticated;
    select count(*)::int into v_n from public.chat_messages m where m.channel = 'clan:' || v_clan::text;
    reset role;
    if v_n <> 1 then raise exception 'social-clans §5(e): a member reads % clan lines from the table, want 1', v_n; end if;
    -- (f) THE SLOW MODE: a busy room (the first step's lines in the last minute, from C), then A twice
    for v_i in 1 .. (select min(s.lines_per_min) from public.hr_chat_slow_mode s) loop
      insert into public.chat_messages (channel, from_id, from_name, body, from_slot, created_at)
        values ('global', c_c, 'x', 'zq busy ' || v_i, 0, now() - interval '20 seconds');
    end loop;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_chat_send(0, 'global', 'zq first');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'social-clans §5(f): the first Global line read %', v; end if;
    v := public.hr_chat_send(0, 'global', 'zq second');
    if v->>'error' is distinct from 'slow_mode' or (v->>'wait_s')::int not between 1 and (select min(s.gap_s) from public.hr_chat_slow_mode s) then
      raise exception 'social-clans §5(f): the second Global line inside the gap read %', v; end if;
    -- (g) THE BATCH
    update public.hr_chat_flush set flushed_to = now() - interval '1 hour' where channel = 'global';
    select count(*)::int into v_n from public.chat_messages m where m.channel = 'global' and m.created_at > now() - interval '1 hour'
       and m.created_at <= now() - make_interval(secs => (select r.settle_s from public.hr_chat_global_rule r where r.id));
    v_i := public.hr_chat_global_flush();
    if v_n < 12 or v_i <> least(v_n, (select r.max_lines from public.hr_chat_global_rule r where r.id)) then
      raise exception 'social-clans §5(g): the batch sent % of the % settled lines', v_i, v_n; end if;
    v_i := public.hr_chat_global_flush();
    if v_i <> 0 and v_n < (select r.max_lines from public.hr_chat_global_rule r where r.id) then
      raise exception 'social-clans §5(g): a second batch sent % again', v_i; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    raise exception using errcode = 'HR925', message = 'social-clans §5 complete - rolling back';
  exception when sqlstate 'HR925' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.clans where name like 'Zq %') or exists (select 1 from public.player_ledger where user_id in (c_a, c_b, c_c))
     or exists (select 1 from public.chat_messages where from_id in (c_a, c_b, c_c)) then
    raise exception 'social-clans §5: LEAKED a probe row'; end if;
  raise notice 'social-clans: clans open on the roster, browser and chat with the castle hidden and kept; Local gone; Global in batches with a slow mode';
end $$;
