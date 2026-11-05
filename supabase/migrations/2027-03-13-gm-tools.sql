-- ════════════════════════════════════════════════════════════════════════
-- 2027-03-13-gm-tools.sql — A GAME MASTER ACCOUNT FOR THE OWNER: POWERS OVER THE WORLD, AND A WALL AROUND ITS OWN HEROES
--   (lane/c-gm-tools, backend-architect, 2026-11-05). Tyler: "I think we should build some admin tools kind of like a game master
--   character like tibia has specifically for me"; a walled-off test hero that can be given gold and levels: "yes".
--
-- STATUS: STAGED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on its
-- passing §9; ON THE EA SECURITY LIST (§3.7). ORDER: last, then edge deploy (`gm_stop`, the Hearthfind gate), then the client.
-- After apply nobody is a GM until tools/gm-allow.mjs generates and the Coordinator applies one row.
--
-- ── THE CONTRACT (docs/planning/PRIORITY_BOARD.md "2026-11-05 Game Master tools") ──────────────────────────────────────
-- ONE ROW IS BOTH THE POWERS AND THE WALL: public.hr_gm_accounts. No client role can write it. It refuses an account that already has a
-- hero and cannot be deleted while a hero stands, so a real hero never becomes grantable and a granted hero never walks out.
-- EVERY hr_gm_* asks hr_gm_open first: anyone else hears {ok:false, error:'refused'}, whatever they sent, before any argument is read.
-- THE WALL HAS TWO LOCKS. The door: hr_access_check refuses a walled account any request not on hr_gm_wall_allow (default deny, so a surface
-- written next month is refused until someone decides). The row: hr_gm_wall_guard on every shared table, whatever path wrote it (the
-- engine does not pass the door). A hunt settle must never fail for a wall: a server line about a walled hero is dropped, not refused.
-- GRANTS NAME NO ACCOUNT: the signature has no uuid. auth.uid() has passed hr_gm_open, so the target is a walled account by construction.
-- THE STOP IS THE PLAYER'S OWN PATH: hr_hunt_leave_pending is the statement hr_hunt_leave runs; a town job goes through the engine's
-- runSetActivity (collect, then switch) via `gm_stop`. No write to player_state here.
-- THE CAPS: a walled hero has no network (hr_play_net_of answers NULL, the cap's existing "not counted per network"): its output can reach
-- nobody, so that cap has nothing to protect, and it must never block a real check. The account's own four still hold. QA is not exempt.
--
-- ── CONCURRENCY AND IDEMPOTENCY ─────────────────────────────────────────────────────────────────────────────────────────
-- hr_gm_open takes one advisory lock per GM, then the character locks: nothing that holds a character lock ever waits on it. The log's
-- (actor, idem) is the intent key: a replay answers the stored result and moves nothing.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────────────────────────────────────────────────
-- +10 client RPCs, each refusing everyone but a row only a migration writes. +2 engine functions. Two tables gain a client read of the
-- caller's OWN row, one column (the invoker-rights hook reads them), and the door's list is readable (RPC names the client already ships).
-- Refused outsiders are logged at most 10 a minute. Every other change makes something stricter.
--
-- ── COST ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Per REST request, every player: two more primary-key probes (hr_bans in hr_admitted, hr_gm_accounts in the hook). Per chat line: two.
-- Per party seat, listing, sale, friend ask: one to two. The log is one person's presses. Nothing per tick.
--
-- REVERSIBILITY: drop the triggers named hr_gm_*, the hr_gm_* functions and the five tables; re-apply the pre-images of the restated bodies
-- (§0 names them). Grants made to the walled account stay on the walled account.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ───────────────────────────────────────────────────────────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hr_lb_hidden') is null or to_regclass('public.hr_access_allowlist') is null
     or to_regclass('public.character_names') is null or to_regclass('public.hr_rejections') is null then
    raise exception 'PRECONDITION: the boards'' hidden list, the allowlist, the names or the refusal journal is absent'; end if;
  for v_r in select * from (values
    ('public.hr_access_check()', 'f272a1de5dd20c1f65467a3b205ca2c1', '67c2ce9fff695ddc443ca2dbb131d999'),
    ('public.hr_admitted(uuid)', 'ec1d3f7be2565cb903a06fcb44591db8', '611b4a5d34b0fe4cebbfe7d9a3e3221e'),
    ('public.hr_hunt_leave(integer,uuid)', '3f6444929e66e94f8466d5059d9716ad', 'c43e031e107e90fba07d821714f86121'),
    ('public.hr_chat_send(integer,text,text)', 'b93f11e5a5b3df6d46be40fce7ed9129', 'b29e38537f5f2bda81686573e7be659d'),
    ('public.hr_whisper_send(integer,text,text)', 'bc8ffff1602be02c21909fe0dd5077dd', 'd7156f6faed96272978df3defd72fd77'),
    ('public.hr_play_net_of(uuid)', '04bcd1888e8cd8036a3b61f863676aa2', '2ee60b2cb3bd39bbb930da3f2e99b5a4'),
    ('public.hr_play_net_note(uuid)', '8869b0d9bd153f1ab6a56075b72d36be', '29cbb5a276da72e97536f55d406c8820'),
    ('public.hr_hunt_member_state(uuid,integer)', 'c7ef9f64c1e7d78b187c186e0b81f1c8', 'dbf76435dbcc51ce93798fad7dfc1ebd'),
    ('public.hr_validate_display_name(text)', '7f58e189f607cefa87ddbdbcc6443991', '0713882732efee683e1990e883357c1a')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its pre-image (%) nor this file''s image (%): md5 % - another file moved it, re-derive', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE TABLES ───────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.hr_gm_accounts (
  user_id  uuid        primary key references auth.users (id) on delete cascade,
  note     text        not null check (length(note) between 1 and 120),
  added_at timestamptz not null default now()
);
create table if not exists public.hr_bans (
  user_id   uuid        primary key references auth.users (id) on delete cascade,
  banned_at timestamptz not null default now()
);
create table if not exists public.hr_chat_mutes (
  user_id uuid        primary key references auth.users (id) on delete cascade,
  until   timestamptz not null,
  at      timestamptz not null default now()
);
create table if not exists public.hr_gm_wall_allow (
  rpc text primary key check (rpc ~ '^hr_[a-z0-9_]+$'),
  why text not null check (length(why) between 1 and 120)
);
-- No foreign key on purpose: an account deleted later leaves its row in the journal.
create table if not exists public.hr_gm_log (
  id          bigint      generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid        not null,
  verb        text        not null check (verb ~ '^[a-z_]{1,32}$'),
  target_user uuid,
  target_slot int,
  reason      text        check (reason is null or length(reason) <= 200),
  outcome     text        not null check (outcome in ('ok', 'refused')),
  idem        uuid,
  result      jsonb
);
create unique index if not exists hr_gm_log_idem on public.hr_gm_log (actor, idem) where idem is not null;
create index if not exists hr_gm_log_day on public.hr_gm_log (actor, verb, at desc);

comment on table public.hr_gm_accounts is '2027-03-13-gm-tools.sql: the Game Master account. One row is both its powers and its wall. Written only by a migration (tools/gm-allow.mjs).';
comment on table public.hr_bans is '2027-03-13-gm-tools.sql: banned accounts, read by hr_admitted. Written only by hr_gm_ban / hr_gm_unban. The reason is in hr_gm_log.';
comment on table public.hr_chat_mutes is '2027-03-13-gm-tools.sql: muted accounts, enforced by hr_chat_send, hr_whisper_send and the row locks. Written only by hr_gm_mute / hr_gm_unmute.';
comment on table public.hr_gm_wall_allow is '2027-03-13-gm-tools.sql: the only RPCs a walled account may reach. Default deny: a row here is a decision that the RPC touches no other player.';
comment on table public.hr_gm_log is '2027-03-13-gm-tools.sql: every Game Master action, refused ones too. Append-only.';

alter table public.hr_gm_accounts enable row level security;
alter table public.hr_bans enable row level security;
alter table public.hr_chat_mutes enable row level security;
alter table public.hr_gm_wall_allow enable row level security;
alter table public.hr_gm_log enable row level security;

do $mig$
declare t text; r text;
begin
  foreach t in array array['hr_gm_accounts', 'hr_bans', 'hr_chat_mutes', 'hr_gm_wall_allow', 'hr_gm_log'] loop
    execute format('revoke all on public.%I from public', t);
    foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = r) then execute format('revoke all on public.%I from %I', t, r); end if;
    end loop;
  end loop;
end $mig$;
-- The hook and hr_admitted run with the CALLER's rights (2026-10-21-closed-mode.sql §3): each reads its own row, and nothing of it but that it exists.
grant select (user_id) on public.hr_gm_accounts to authenticated;
grant select (user_id) on public.hr_bans to authenticated;
grant select on public.hr_gm_wall_allow to authenticated;
drop policy if exists hr_gm_accounts_own on public.hr_gm_accounts;
create policy hr_gm_accounts_own on public.hr_gm_accounts for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists hr_bans_own on public.hr_bans;
create policy hr_bans_own on public.hr_bans for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists hr_gm_wall_allow_read on public.hr_gm_wall_allow;
create policy hr_gm_wall_allow_read on public.hr_gm_wall_allow for select to authenticated using (true);

-- THE DOOR'S LIST. Each row is a decision: it reaches no other player, or it only reads.
insert into public.hr_gm_wall_allow (rpc, why) values
  ('hr_load', 'its own hero'), ('hr_server_now', 'the clock'), ('hr_heartbeat', 'its own presence'), ('hr_put_client_state', 'its own residue'),
  ('hr_create_character', 'its own hero'), ('hr_create_hero', 'its own hero'), ('hr_buy_hero_slot', 'its own purse'),
  ('hr_display_name_available', 'a read'), ('hr_character_name_set', 'its own hero'), ('hr_hero_rename', 'its own purse'),
  ('hr_outfit_set', 'its own hero'), ('hr_set_presence_quiet', 'its own presence'), ('hr_account_items', 'its own Storage'),
  ('hr_bank_move', 'its own Storage'), ('hr_storage_chest_build', 'its own purse'), ('hr_item_lock', 'its own bag'),
  ('hr_loot_dispatch', 'the shop, its own bag'), ('hr_loot_rule_set', 'its own bag'), ('hr_stamina_refill', 'its own purse'),
  ('hr_blessing_buy', 'its own purse'), ('hr_trait_buy', 'its own hero'), ('hr_recipe_learn', 'its own hero'), ('hr_login_claim', 'its own hero'),
  ('hr_companion_equip', 'its own hero'), ('hr_action_set_copy', 'its own bar'), ('hr_action_set_delete', 'its own bar'),
  ('hr_action_set_options', 'its own bar'), ('hr_action_set_put', 'its own bar'), ('hr_action_set_rename', 'its own bar'),
  ('hr_farm_harvest', 'its own land'), ('hr_farm_harvest_clear', 'its own land'), ('hr_farm_harvest_replant', 'its own land'),
  ('hr_farm_plant', 'its own land'), ('hr_farm_upgrade_plot', 'its own land'), ('hr_farm_water', 'its own land'),
  ('hr_hunt_enter', 'its own hunt'), ('hr_hunt_leave', 'its own hunt'), ('hr_hunt_change', 'its own hunt'), ('hr_hunt_restart', 'its own hunt'),
  ('hr_hunt_restock', 'its own hunt'), ('hr_hunt_analyzer', 'a read'), ('hr_hunt_density_set', 'its own hunt'), ('hr_hunt_set_preset', 'its own hunt'),
  ('hr_hunt_preset_apply', 'its own bar'), ('hr_hunt_preset_delete', 'its own bar'), ('hr_hunt_preset_rename', 'its own bar'),
  ('hr_hunt_preset_save', 'its own bar'), ('hr_mark_seen', 'its own hunt'), ('hr_tally_accept', 'its own hero'), ('hr_tally_collect', 'its own hero'),
  ('hr_tally_drop', 'its own hero'), ('hr_tally_set', 'its own hero'), ('hr_tally_view', 'a read'),
  ('hr_hunt_party_accept', 'row lock: walled parties only'), ('hr_hunt_party_decline', 'its own invite'), ('hr_hunt_party_disband', 'its own party'),
  ('hr_hunt_party_finder', 'a read'), ('hr_hunt_party_invite_own', 'its own heroes'), ('hr_hunt_party_kick', 'its own party'),
  ('hr_hunt_party_leave', 'its own party'), ('hr_hunt_party_start', 'its own party'), ('hr_hunt_party_warn', 'a read'),
  ('hr_party_hold_set', 'its own party'), ('hr_party_leave_together_set', 'its own hero'),
  ('hr_chat_history_floor', 'a read'), ('hr_chat_recent', 'a read'), ('hr_whispers_recent', 'a read'), ('hr_social_poll', 'a read'),
  ('hr_social_state', 'a read'), ('hr_inspect', 'a read'), ('hr_leaderboard', 'a read'), ('hr_world_finds_of', 'a read'),
  ('hr_town_go', 'seen in town, badged'), ('hr_town_here', 'seen in town, badged'), ('hr_town_move', 'seen in town, badged'),
  ('hr_town_of', 'a read'), ('hr_town_view', 'a read'), ('hr_town_walkers', 'a read'),
  ('hr_gm_online', 'the powers'), ('hr_gm_hero', 'the powers'), ('hr_gm_mute', 'the powers'), ('hr_gm_unmute', 'the powers'), ('hr_gm_ban', 'the powers'),
  ('hr_gm_unban', 'the powers'), ('hr_gm_say', 'the powers'), ('hr_gm_grant_gold', 'the powers'), ('hr_gm_grant_item', 'the powers'),
  ('hr_gm_grant_level', 'the powers')
on conflict (rpc) do update set why = excluded.why;

-- ── §2 THE ONE QUESTION ─────────────────────────────────────────────────────────────────────────────────────────────────
-- PL/pgSQL on purpose: these sit on the settle's read (hr_hunt_member_state), per member per window. PostgreSQL 17 replans a non-inlined SQL
-- function's statement on every call (tools/pg-replay.mjs's header, measured 1 ms and up); a PL/pgSQL statement is planned once per backend.
create or replace function public.hr_gm_walled(p_user uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  return exists (select 1 from public.hr_gm_accounts g where g.user_id = p_user);
end $fn$;

-- The state section: true on a walled account's envelope, else null. The window's only reason to load.
create or replace function public.hr_gm_section(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  return case when exists (select 1 from public.hr_gm_accounts g where g.user_id = p_user) then to_jsonb(true) end;
end $fn$;
insert into public.hr_state_sections (key, fn, note) values
  ('gm', 'hr_gm_section', '2027-03-13-gm-tools.sql: this account is the Game Master (the window loads; the engine rolls no Hearthfind)')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

create or replace function public.hr_chat_muted_until(p_user uuid)
returns timestamptz language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  return (select m.until from public.hr_chat_mutes m where m.user_id = p_user and m.until > now());
end $fn$;

-- A short reason as the log keeps it: cleaned like a chat line, 3..200 characters, else null.
create or replace function public.hr_gm_reason(p_reason text)
returns text language sql immutable set search_path = public, pg_catalog as $fn$
  select case when length(public.hr_chat_clean(p_reason)) between 3 and 200 then public.hr_chat_clean(p_reason) end
$fn$;

-- THE AUTHORITY. Every power's first statement. NULL: this is the GM, go on. Anything else is the answer to return.
create or replace function public.hr_gm_open(p_actor uuid, p_verb text, p_target uuid, p_slot int, p_reason text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_result jsonb; v_found boolean;
begin
  if p_actor is null then return jsonb_build_object('ok', false, 'error', 'refused'); end if;
  perform public.hr_access_check();
  if not exists (select 1 from public.hr_gm_accounts g where g.user_id = p_actor) then
    -- Bounded, so a stranger cannot fill the journal. The answer never changes.
    if public.hr_rate_ok(p_actor, 'gm:refused', 10, interval '1 minute') then
      insert into public.hr_gm_log (actor, verb, target_user, target_slot, reason, outcome)
      values (p_actor, p_verb, p_target, p_slot, public.hr_gm_reason(p_reason), 'refused');
    end if;
    return jsonb_build_object('ok', false, 'error', 'refused');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hr:gm:' || p_actor::text, 0));
  if p_idem is not null then
    select l.result, true into v_result, v_found from public.hr_gm_log l where l.actor = p_actor and l.idem = p_idem;
    if v_found then return coalesce(v_result, jsonb_build_object('ok', false, 'error', 'refused')); end if;
  end if;
  return null;
end $fn$;

-- Every outcome leaves here: one journal row, then the answer. A key's answer is kept for its replay.
create or replace function public.hr_gm_close(p_actor uuid, p_verb text, p_target uuid, p_slot int, p_reason text, p_idem uuid, p_answer jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
begin
  insert into public.hr_gm_log (actor, verb, target_user, target_slot, reason, outcome, idem, result)
  values (p_actor, p_verb, p_target, p_slot, p_reason,
          case when p_answer->>'ok' = 'true' then 'ok' else 'refused' end, p_idem,
          case when p_idem is not null then p_answer end);
  return p_answer;
end $fn$;

-- ── §3 THE ROW LOCKS ────────────────────────────────────────────────────────────────────────────────────────────────────
-- One guard, each table naming its person columns. hr_reject: the market's protected block answers it {ok:false, error:'gm_walled'}.
create or replace function public.hr_gm_wall_guard()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare j jsonb := to_jsonb(new); c text; v_u uuid;
begin
  foreach c in array tg_argv loop
    v_u := nullif(j->>c, '')::uuid;
    if v_u is not null and exists (select 1 from public.hr_gm_accounts g where g.user_id = v_u) then
      perform public.hr_reject('gm_walled');
    end if;
  end loop;
  return new;
end $fn$;

-- A party holds walled heroes or real ones, never both: an invite across the wall, a seat beside the other side.
create or replace function public.hr_gm_party_guard()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_w boolean;
begin
  if tg_table_name = 'hunt_party_invites' then
    if public.hr_gm_walled(new.from_user) <> public.hr_gm_walled(new.to_user) then perform public.hr_reject('gm_walled'); end if;
    return new;
  end if;
  v_w := public.hr_gm_walled(new.user_id);
  if exists (select 1 from public.hunt_party_members m where m.party_id = new.party_id and public.hr_gm_walled(m.user_id) <> v_w) then
    perform public.hr_reject('gm_walled');
  end if;
  return new;
end $fn$;

-- THE SERVER'S OWN LINES about a walled hero go nowhere, and quietly: these writers are inside a hunt settle, which must not fail.
create or replace function public.hr_gm_wall_quiet()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
begin
  if not public.hr_gm_walled(new.user_id) then return new; end if;
  if tg_table_name = 'hr_world_notices' then
    new.status := 'quiet'; new.message_id := null;
    return new;
  end if;
  return null;
end $fn$;

-- Fires after hr_chat_name_authority and hr_chat_word_filter (triggers fire by name), so from_id is the session's.
create or replace function public.hr_chat_zgm_gate()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
begin
  if new.from_id is null then return new; end if;
  if public.hr_gm_walled(new.from_id) then
    if new.channel <> 'system' then perform public.hr_reject('gm_walled'); end if;
    if coalesce(current_setting('hr.gm_say', true), '') <> '1' then return null; end if;
    -- Only hr_gm_say sets that, for this one statement; no client path reaches set_config. The mark is from_role on the system
    -- channel: no client writes that channel, and hr_chat_row re-reads a name from from_id, so a name alone could not carry it.
    new.from_slot := null; new.from_name := 'Game Master'; new.from_role := 'game_master'; new.from_level := null; new.from_weapon := null;
    return new;
  end if;
  if new.channel <> 'system' and public.hr_chat_muted_until(new.from_id) is not null then
    perform public.hr_reject('muted');
  end if;
  return new;
end $fn$;

create or replace function public.hr_whisper_zgm_gate()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
begin
  if public.hr_gm_walled(new.from_id) or public.hr_gm_walled(new.to_id) then perform public.hr_reject('gm_walled'); end if;
  if public.hr_chat_muted_until(new.from_id) is not null then perform public.hr_reject('muted'); end if;
  return new;
end $fn$;

-- THE BADGE. The server stamps a walled hero's look; the client only draws it.
create or replace function public.hr_gm_look_stamp()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
begin
  if new.look is not null and public.hr_gm_walled(new.user_id) then new.look := new.look || jsonb_build_object('gm', true); end if;
  return new;
end $fn$;

-- THE ROW ITSELF. A fresh account only, never lifted while a hero stands (a cascade from a deleted account passes: its heroes go too), and hidden from the boards.
create or replace function public.hr_gm_account_guard()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.player_state ps where ps.user_id = new.user_id) then
      raise exception 'hr_gm_accounts: this account already has a hero. A Game Master account starts empty (CLAUDE.md §2).' using errcode = 'check_violation'; end if;
    return new;
  end if;
  if exists (select 1 from auth.users u where u.id = old.user_id) and exists (select 1 from public.player_state ps where ps.user_id = old.user_id) then
    raise exception 'hr_gm_accounts: heroes stand on this account. Lifting the wall would release what was granted to them.' using errcode = 'check_violation'; end if;
  return old;
end $fn$;
create or replace function public.hr_gm_account_hide()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
begin
  insert into public.hr_lb_hidden (user_id, slot, reason, note)
    select new.user_id, null, 'test', 'Game Master account'
     where not exists (select 1 from public.hr_lb_hidden h where h.user_id = new.user_id and h.slot is null);
  return null;
end $fn$;
create or replace function public.hr_gm_log_immutable()
returns trigger language plpgsql set search_path = public, pg_catalog as $fn$
begin
  raise exception 'hr_gm_log is append-only (attempted %)', tg_op using errcode = 'check_violation';
end $fn$;

create or replace trigger hr_gm_account_guard before insert or delete on public.hr_gm_accounts for each row execute function public.hr_gm_account_guard();
create or replace trigger hr_gm_account_hide after insert on public.hr_gm_accounts for each row execute function public.hr_gm_account_hide();
create or replace trigger hr_gm_log_immutable before update or delete on public.hr_gm_log for each row execute function public.hr_gm_log_immutable();
drop trigger if exists hr_gm_log_no_truncate on public.hr_gm_log;
create trigger hr_gm_log_no_truncate before truncate on public.hr_gm_log for each statement execute function public.hr_gm_log_immutable();

create or replace trigger hr_gm_wall before insert on public.market_listings for each row execute function public.hr_gm_wall_guard('user_id');
create or replace trigger hr_gm_wall before insert on public.market_sales for each row execute function public.hr_gm_wall_guard('seller_user_id', 'buyer_user_id');
create or replace trigger hr_gm_wall before insert on public.friend_requests for each row execute function public.hr_gm_wall_guard('from_id', 'to_id');
create or replace trigger hr_gm_wall before insert on public.friend_links for each row execute function public.hr_gm_wall_guard('user_lo', 'user_hi');
create or replace trigger hr_gm_wall before insert on public.party_seekers for each row execute function public.hr_gm_wall_guard('user_id');
create or replace trigger hr_gm_wall before insert on public.hearth_flames for each row execute function public.hr_gm_wall_guard('user_id');
create or replace trigger hr_gm_wall before insert on public.clan_members for each row execute function public.hr_gm_wall_guard('user_id');
create or replace trigger hr_gm_wall before insert on public.hr_discord_gift_claims for each row execute function public.hr_gm_wall_guard('user_id');
create or replace trigger hr_gm_wall_list before insert on public.hunt_parties for each row when (new.listed) execute function public.hr_gm_wall_guard('leader_user');
create or replace trigger hr_gm_wall_relist before update of listed on public.hunt_parties for each row when (new.listed) execute function public.hr_gm_wall_guard('leader_user');
create or replace trigger hr_gm_wall before insert on public.hunt_party_invites for each row execute function public.hr_gm_party_guard();
create or replace trigger hr_gm_wall before insert on public.hunt_party_members for each row execute function public.hr_gm_party_guard();
create or replace trigger hr_gm_wall before insert on public.world_finds for each row execute function public.hr_gm_wall_quiet();
create or replace trigger hr_gm_wall before insert on public.hr_world_notices for each row execute function public.hr_gm_wall_quiet();
create or replace trigger hr_chat_zgm_gate before insert on public.chat_messages for each row execute function public.hr_chat_zgm_gate();
create or replace trigger hr_whisper_zgm_gate before insert on public.chat_whispers for each row execute function public.hr_whisper_zgm_gate();
create or replace trigger hr_gm_look_stamp before insert or update of look on public.town_bodies for each row execute function public.hr_gm_look_stamp();

-- THE SINK LANES' SHARED TABLES (lane/c-town-shows). Whichever lands first: this file locks a table already here; a table landed after it reddens
-- tests/gm-tools.mjs GM-W-FUTURE until it carries the lock (and the door refuses its verbs meanwhile). Gold Given is written from inside a purchase,
-- so a walled purchase is left off the board, quietly; a show is a press on a shared surface, so it is refused.
do $mig$
begin
  if to_regclass('public.account_gold_given') is not null then
    create or replace trigger hr_gm_wall before insert on public.account_gold_given for each row execute function public.hr_gm_wall_quiet();
  end if;
  if to_regclass('public.town_shows') is not null then
    create or replace trigger hr_gm_wall before insert on public.town_shows for each row execute function public.hr_gm_wall_guard('user_id');
  end if;
end $mig$;

-- ── §4 THE DOOR ─────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.hr_admitted(p_user uuid)
 returns boolean
 language sql
 volatile
 security invoker
 set search_path to 'public', 'pg_catalog'
as $fn$
  -- GM-TOOLS (2027-03-13-gm-tools.sql): a banned account is admitted nowhere: REST, the engine, realtime, another player's look-up.
  select p_user is not null
     and not exists (select 1 from public.hr_bans b where b.user_id = p_user)
     and (coalesce((select not f.enabled from public.hr_flags f where f.key = 'closed_mode'), false)
          or exists (select 1 from public.hr_access_allowlist a where a.user_id = p_user));
$fn$;

create or replace function public.hr_access_check()
 returns void
 language plpgsql
 volatile
 security invoker
 set search_path to 'public', 'pg_catalog'
as $fn$
declare
  v_uid uuid := auth.uid();
  v_rpc text;
begin
  -- Two statements, not `is null OR hr_admitted(…)`: SQL does not promise to
  -- short-circuit, and anon / service_role hold no EXECUTE on hr_admitted.
  if v_uid is null then return; end if;
  if public.hr_admitted(v_uid) then
    -- GM-TOOLS (2027-03-13-gm-tools.sql): THE WALL'S DOOR. Default deny: a walled account reaches only the RPCs on the list. A table
    -- request, a name nobody has decided on, or no path at all is refused.
    if exists (select 1 from public.hr_gm_accounts g where g.user_id = v_uid) then
      v_rpc := substring(coalesce(current_setting('request.path', true), '') from '/rpc/([a-z0-9_]+)$');
      if v_rpc is null or not exists (select 1 from public.hr_gm_wall_allow a where a.rpc = v_rpc) then
        raise sqlstate 'PGRST' using
          message = '{"code":"hr_gm_walled","message":"A Game Master account can''t do that.","details":null,"hint":null}',
          detail  = '{"status":403,"headers":{}}';
      end if;
    end if;
    return;
  end if;
  if exists (select 1 from public.hr_bans b where b.user_id = v_uid) then
    raise sqlstate 'PGRST' using
      message = '{"code":"hr_banned","message":"This account has been banned from Hearthrise.","details":null,"hint":null}',
      detail  = '{"status":403,"headers":{}}';
  end if;
  raise sqlstate 'PGRST' using
    message = '{"code":"hr_closed","message":"Hearthrise is closed while we rebuild it.","details":null,"hint":null}',
    detail  = '{"status":403,"headers":{}}';
end $fn$;

-- ── §5 THE RESTATED PLAYER PATHS ────────────────────────────────────────────────────────────────────────────────────────
-- THE STATEMENT A LEAVE RUNS, spelled once: the player's verb and the GM's stop both end a hunt here, at the same horizon.
create or replace function public.hr_hunt_leave_pending(p_user uuid, p_slot int)
returns public.hunt_sessions language plpgsql set search_path = public, pg_catalog as $fn$
declare v_s public.hunt_sessions%rowtype;
begin
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null then return v_s; end if;
  -- ALWAYS PENDING (live-horizon, 2026-10-31): never at once. The settle walks to leave_at, no earlier
  -- than the last combat swing the viewer was shown (hr_hunt_live_horizon_at), so a death the browser
  -- foresaw in its seeds cannot be stepped around: the hunt ends `left` only after it, or `died` at it.
  if v_s.leave_at is null and v_s.change_at is null then
    update public.hunt_sessions set leave_at = public.hr_hunt_live_horizon_at(v_s.settled_to), version = version + 1 where id = v_s.id;
  end if;
  return v_s;
end $fn$;

create or replace function public.hr_hunt_leave(p_slot integer, p_idem uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_catalog'
as $function$
declare
  c_verb constant text := 'hunt_leave';
  v_uid uuid := auth.uid();
  v_r   jsonb;
  v_s   public.hunt_sessions%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;

  v_s := public.hr_hunt_leave_pending(v_uid, p_slot);
  if v_s.id is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_hunt')); end if;
  v_r := jsonb_build_object('ok', true, 'pending', true, 'session', public.hr_hunt_view(v_s.id));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $function$;

create or replace function public.hr_chat_send(p_slot integer, p_kind text, p_body text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_catalog'
as $function$
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
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_rate_ok(v_uid, 'chat:send', 20, interval '1 minute') then
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

create or replace function public.hr_whisper_send(p_slot integer, p_target text, p_body text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_catalog'
as $function$
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
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_rate_ok(v_uid, 'whisper:send', 20, interval '1 minute') then
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

-- THE CAP: a walled account has no network. NULL is the cap's existing "not counted per network"; the account's own four still hold.
create or replace function public.hr_play_net_of(p_uid uuid)
 returns bytea
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_catalog'
as $function$
-- PLAY-CAP (2027-01-19-play-cap.sql). The network p_uid plays from NOW: this request's own address when the request
-- is p_uid's own PostgREST call (hr_request_ip: cf-connecting-ip, which Cloudflare overwrites), else the last one
-- p_uid's own calls showed (account_play_net), else NULL (never seen: that start is counted per account only).
declare v bytea;
begin
  if p_uid is null then return null; end if;
  if public.hr_gm_walled(p_uid) then return null; end if;   -- GM-TOOLS (2027-03-13-gm-tools.sql)
  if auth.uid() is not distinct from p_uid then
    v := public.hr_play_net_hash(public.hr_request_ip());
    if v is not null then return v; end if;
  end if;
  return (select n.net from public.account_play_net n where n.user_id = p_uid);
end $function$;

create or replace function public.hr_play_net_note(p_uid uuid)
 returns bytea
 language plpgsql
 volatile security definer
 set search_path to 'public', 'pg_catalog'
as $function$
-- PLAY-CAP (2027-01-19-play-cap.sql). hr_play_net_of, and when it is this request's own address and differs from the
-- stored one, store it. One PK read per call; a write only on a change.
declare v bytea;
begin
  if public.hr_gm_walled(p_uid) then return null; end if;   -- GM-TOOLS (2027-03-13-gm-tools.sql)
  if p_uid is null or auth.uid() is distinct from p_uid then return public.hr_play_net_of(p_uid); end if;
  v := public.hr_play_net_hash(public.hr_request_ip());
  if v is null then return public.hr_play_net_of(p_uid); end if;
  if not exists (select 1 from public.account_play_net n where n.user_id = p_uid and n.net = v) then
    insert into public.account_play_net as n (user_id, net, seen_at) values (p_uid, v, now())
      on conflict (user_id) do update set net = excluded.net, seen_at = excluded.seen_at;
  end if;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.hr_hunt_member_state(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
-- 2027-02-02-settle-cost.sql: one hunt member's ENGINE INPUTS, in hr_state_of's shape and by its expressions (each
-- key below is the hr_state_of key of the same name, copied, not re-derived): what hunt-settle.js memberInput reads
-- through envelope.js engineInputsFromEnvelope, and nothing else. A key added to that reader is added HERE, and
-- tests/hunt-sessions-settle.mjs MEMBER-STATE (the engine input built from this and from hr_state_of, compared)
-- goes red until it is.
declare v_st  public.player_state%rowtype;
        v_vit jsonb;
begin
  select * into v_st from public.player_state where user_id = p_user and slot = coalesce(p_slot, 0);
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  -- hr_state_of's `state.hp` is the stored HP held under the DERIVED max (Level and armour): the same call.
  v_vit := public.hr_vitals_of(p_user, v_st.slot);
  return jsonb_build_object(
    'ok', true,
    'version', v_st.version,
    -- GM-TOOLS (2027-03-13-gm-tools.sql): the engine rolls no Hearthfind for a walled hero (envelope.js).
    'gm', public.hr_gm_section(p_user, v_st.slot),
    'buffs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', e.v->>'type',
               'magnitude', (e.v->>'magnitude')::numeric,
               'until', e.v->>'until',
               'from', e.v->>'from',
               'scale', coalesce((e.v->>'scale')::numeric, 1),
               'remaining_ms', greatest(0, floor(
                 extract(epoch from ((e.v->>'until')::timestamptz - now())) * 1000))::bigint)
               order by (e.v->>'until')::timestamptz)
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
    ), '[]'::jsonb),
    'state', jsonb_build_object(
      -- ACCOUNT GOLD (2026-12-15-account-gold.sql): ONE purse per account, every slot reads it.
      'gold', coalesce((select w.gold from public.account_wallet w where w.user_id = p_user), 0),
      'hp', least(v_st.hp, (v_vit->>'max_hp')::int),
      'level_xp', v_st.level_xp,
      'hearthfind_ready', true,
      'deaths_lifetime', coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = ''), 0),
      'deaths_today',    coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = public.hr_utc_day_key(now())), 0)),
    -- the raw XP and the carried remainder (envelope.js reads .xp and .frac); the Level is the engine's own derivation
    'skills', coalesce((
      select jsonb_object_agg(skill_id, jsonb_build_object('xp', xp, 'frac', xp_frac))
        from public.player_skills where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'inventory', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.player_inventory where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'equipment', coalesce((
      select jsonb_object_agg(equip_slot, item_id)
        from public.player_equipment where user_id = p_user and slot = v_st.slot), '{}'::jsonb));
end $function$;

-- A name that reads as staff: "GM Bob", "Bob_GM", "G.M. Bob", anything with "Game Master" in it. Plain "GM" was already reserved.
create or replace function public.hr_validate_display_name(p_name text)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public', 'pg_catalog'
as $function$
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
  if length(v_canon) < 3 then return jsonb_build_object('ok', false, 'reason', 'short'); end if;
  -- Reserved names are matched with separators REMOVED (see the original file).
  if regexp_replace(v_canon, '\s+', '', 'g') = any (
       select regexp_replace(r, '\s+', '', 'g') from unnest(c_reserved) as r)
  then
    return jsonb_build_object('ok', false, 'reason', 'reserved');
  end if;
  -- GM-TOOLS (2027-03-13-gm-tools.sql): the Game Master's plate reads "GM Name"; nobody else's may.
  if regexp_replace(v_canon, '\s+', '', 'g') ~ 'gamemaster' or v_canon ~ '(^| )g ?m( |$)' then
    return jsonb_build_object('ok', false, 'reason', 'reserved');
  end if;
  -- (2026-10-11) THE PLACEHOLDER SHAPE IS THE MODERATOR'S. `Adventurer-1234` is
  -- what hr_mod_force_rename assigns; a player wearing one by choice would read
  -- as moderated, and a player keeping theirs would never leave the rename.
  if regexp_replace(v_canon, '\s+', '', 'g') ~ '^adventurer[0-9]+$' then
    return jsonb_build_object('ok', false, 'reason', 'reserved');
  end if;
  -- (2026-10-11) CONTENT. No stem, no name, no canonical in the answer.
  if public.hr_name_blocked(v_name) then
    return jsonb_build_object('ok', false, 'reason', 'blocked');
  end if;
  return jsonb_build_object('ok', true, 'name', v_name, 'canonical', v_canon);
end $function$;

-- ── §6 THE POWERS ───────────────────────────────────────────────────────────────────────────────────────────────────────
-- SEE: who is online or playing. Never an email, an address or a network hash. The account id is what Act needs, and what the closed notice already shows its owner.
create or replace function public.hr_gm_online()
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_online constant interval := interval '75 seconds';
  v_uid uuid := auth.uid(); v_no jsonb; v_rows jsonb;
begin
  v_no := public.hr_gm_open(v_uid, 'online', null, null, null, null);
  if v_no is not null then return v_no; end if;
  if not public.hr_rate_ok(v_uid, 'gm:read', 120, interval '1 minute') then
    return public.hr_gm_close(v_uid, 'online', null, null, null, null, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;
  select coalesce(jsonb_agg(x.j order by x.name), '[]'::jsonb) into v_rows from (
    select public.hr_character_name(ps.user_id, ps.slot) as name, jsonb_build_object(
             'id', ps.user_id, 'slot', ps.slot, 'name', public.hr_character_name(ps.user_id, ps.slot),
             'level', public.hr_char_level(ps.level_xp),
             'hunt', h.hunt_id, 'leaving', h.leave_at is not null,
             'job', case when h.id is null and ps.active_kind <> 'idle' then ps.active_kind end,
             'job_id', case when h.id is null and ps.active_kind <> 'idle' then ps.active_id end,
             'online', coalesce(cp.seen_at > now() - c_online, false),
             'gm', public.hr_gm_walled(ps.user_id),
             'banned', exists (select 1 from public.hr_bans b where b.user_id = ps.user_id),
             'muted', public.hr_chat_muted_until(ps.user_id) is not null) as j
      from public.player_state ps
      left join public.hunt_sessions h on h.user_id = ps.user_id and h.slot = ps.slot and h.ended_at is null
      left join public.character_presence cp on cp.user_id = ps.user_id and cp.slot = ps.slot
     where h.id is not null or ps.active_kind <> 'idle' or cp.seen_at > now() - c_online
     order by 1 limit 200) x;
  return public.hr_gm_close(v_uid, 'online', null, null, null, null, jsonb_build_object('ok', true, 'heroes', v_rows));
end $fn$;

-- SEE: one hero, what tools/char-state.local.mjs shows. p_target: a hero's name, or an account id with p_slot.
create or replace function public.hr_gm_hero(p_target text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_no jsonb; v_u uuid; v_s int; ps public.player_state%rowtype; v_h public.hunt_sessions%rowtype; v_pid uuid; v_sheet jsonb;
begin
  v_no := public.hr_gm_open(v_uid, 'hero', null, p_slot, left(p_target, 200), null);
  if v_no is not null then return v_no; end if;
  if not public.hr_rate_ok(v_uid, 'gm:read', 120, interval '1 minute') then
    return public.hr_gm_close(v_uid, 'hero', null, p_slot, null, null, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;
  if p_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_u := p_target::uuid; v_s := p_slot;
  else
    select c.user_id, c.slot into v_u, v_s from public.hr_character_by_name(p_target) c;
  end if;
  select * into ps from public.player_state s where s.user_id = v_u and s.slot = v_s;
  if not found then
    return public.hr_gm_close(v_uid, 'hero', v_u, v_s, null, null, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select * into v_h from public.hunt_sessions h where h.user_id = v_u and h.slot = v_s and h.ended_at is null;
  v_pid := public.hr_hunt_party_of(v_u, v_s);
  select c.sheet into v_sheet from public.hr_character_sheets c where c.user_id = v_u and c.slot = v_s;
  return public.hr_gm_close(v_uid, 'hero', v_u, v_s, null, null, jsonb_build_object('ok', true, 'hero', jsonb_build_object(
    'id', v_u, 'slot', v_s, 'name', public.hr_character_name(v_u, v_s), 'level', public.hr_char_level(ps.level_xp), 'level_xp', ps.level_xp,
    'hp', ps.hp, 'gold', coalesce((select w.gold from public.account_wallet w where w.user_id = v_u), 0),
    'stamina_ms', public.hr_stamina_of(v_u, v_s, now()), 'job', case when v_h.id is null and ps.active_kind <> 'idle' then ps.active_kind end,
    'job_id', case when v_h.id is null and ps.active_kind <> 'idle' then ps.active_id end, 'last_seen_at', ps.last_seen_at,
    'gm', public.hr_gm_walled(v_u), 'banned', exists (select 1 from public.hr_bans b where b.user_id = v_u),
    'muted_until', public.hr_chat_muted_until(v_u),
    'sheet', case when v_sheet is not null then jsonb_build_object('role', v_sheet->>'role', 'weapon', v_sheet->>'weapon_type', 'max_hp', v_sheet->'max_hp', 'max_mana', v_sheet->'max_mana') end,
    'hunt', case when v_h.id is not null then jsonb_build_object('id', v_h.hunt_id, 'seat', v_h.seat, 'entered_at', v_h.entered_at, 'leaving', v_h.leave_at is not null,
              'lag_s', round(extract(epoch from now() - coalesce((select i.settled_to from public.hunt_instances i where i.id = v_h.instance_id), v_h.settled_to)))) end,
    'hunts', coalesce((select jsonb_agg(jsonb_build_object('id', r.hunt_id, 'entered_at', r.entered_at, 'ended_at', r.ended_at, 'end_reason', r.end_reason) order by r.entered_at desc)
                         from (select * from public.hunt_sessions h where h.user_id = v_u and h.slot = v_s and h.ended_at is not null order by h.entered_at desc limit 3) r), '[]'::jsonb),
    'party', case when v_pid is not null then coalesce((select jsonb_agg(jsonb_build_object('seat', m.seat, 'name', public.hr_character_name(m.user_id, m.slot)) order by m.seat)
                                                          from public.hunt_party_members m where m.party_id = v_pid), '[]'::jsonb) end,
    'refusals', coalesce((select jsonb_agg(jsonb_build_object('intent', r.intent, 'code', r.code, 'n', r.n) order by r.last_at desc)
                            from (select * from public.hr_rejections j where j.user_id = v_u and j.slot = v_s and j.day = current_date order by j.last_at desc limit 5) r), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(jsonb_build_object('at', r.at, 'kind', r.kind, 'intent', r.intent, 'gold', r.gold, 'item', r.item_id, 'qty', r.qty) order by r.id desc)
                          from (select * from public.player_ledger l where l.user_id = v_u and l.slot = v_s and l.at >= now() - interval '7 days' order by l.id desc limit 5) r), '[]'::jsonb)
  )));
end $fn$;

-- ACT: mute an account's chat for a set time.
create or replace function public.hr_gm_mute(p_target uuid, p_minutes int, p_reason text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare c_max_min constant int := 43200; v_uid uuid := auth.uid(); v_no jsonb; v_reason text := public.hr_gm_reason(p_reason); v_until timestamptz;
begin
  v_no := public.hr_gm_open(v_uid, 'mute', p_target, null, p_reason, p_idem);
  if v_no is not null then return v_no; end if;
  if p_idem is null then return jsonb_build_object('ok', false, 'error', 'bad_idem'); end if;
  if not public.hr_rate_ok(v_uid, 'gm:act', 60, interval '1 minute') then
    return public.hr_gm_close(v_uid, 'mute', p_target, null, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;
  if v_reason is null then return public.hr_gm_close(v_uid, 'mute', p_target, null, null, p_idem, jsonb_build_object('ok', false, 'error', 'needs_reason')); end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > c_max_min then
    return public.hr_gm_close(v_uid, 'mute', p_target, null, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'bad_minutes', 'max', c_max_min)); end if;
  if not exists (select 1 from auth.users u where u.id = p_target) then
    return public.hr_gm_close(v_uid, 'mute', p_target, null, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'no_player')); end if;
  if public.hr_gm_walled(p_target) then
    return public.hr_gm_close(v_uid, 'mute', p_target, null, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'target_is_gm')); end if;
  v_until := now() + make_interval(mins => p_minutes);
  insert into public.hr_chat_mutes as m (user_id, until, at) values (p_target, v_until, now())
    on conflict (user_id) do update set until = excluded.until, at = excluded.at;
  return public.hr_gm_close(v_uid, 'mute', p_target, null, v_reason, p_idem, jsonb_build_object('ok', true, 'until', v_until));
end $fn$;

create or replace function public.hr_gm_unmute(p_target uuid, p_reason text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_uid uuid := auth.uid(); v_no jsonb; v_reason text := public.hr_gm_reason(p_reason);
begin
  v_no := public.hr_gm_open(v_uid, 'unmute', p_target, null, p_reason, p_idem);
  if v_no is not null then return v_no; end if;
  if p_idem is null then return jsonb_build_object('ok', false, 'error', 'bad_idem'); end if;
  if not public.hr_rate_ok(v_uid, 'gm:act', 60, interval '1 minute') then
    return public.hr_gm_close(v_uid, 'unmute', p_target, null, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;
  if v_reason is null then return public.hr_gm_close(v_uid, 'unmute', p_target, null, null, p_idem, jsonb_build_object('ok', false, 'error', 'needs_reason')); end if;
  delete from public.hr_chat_mutes where user_id = p_target;
  return public.hr_gm_close(v_uid, 'unmute', p_target, null, v_reason, p_idem, jsonb_build_object('ok', true));
end $fn$;

-- ACT: ban. hr_admitted reads it, so every door shuts at once. Open hunts leave through the player's own statement (they settle and keep what they
-- earned). A town job needs the engine: `jobs` names them, and the window stops each with gm_stop. The boards hide the account until an unban.
create or replace function public.hr_gm_ban(p_target uuid, p_reason text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_uid uuid := auth.uid(); v_no jsonb; v_reason text := public.hr_gm_reason(p_reason); v_r record; v_hunts int := 0; v_jobs jsonb := '[]'::jsonb; v_s public.hunt_sessions%rowtype;
begin
  v_no := public.hr_gm_open(v_uid, 'ban', p_target, null, p_reason, p_idem);
  if v_no is not null then return v_no; end if;
  if p_idem is null then return jsonb_build_object('ok', false, 'error', 'bad_idem'); end if;
  if not public.hr_rate_ok(v_uid, 'gm:act', 60, interval '1 minute') then
    return public.hr_gm_close(v_uid, 'ban', p_target, null, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;
  if v_reason is null then return public.hr_gm_close(v_uid, 'ban', p_target, null, null, p_idem, jsonb_build_object('ok', false, 'error', 'needs_reason')); end if;
  if not exists (select 1 from auth.users u where u.id = p_target) then
    return public.hr_gm_close(v_uid, 'ban', p_target, null, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'no_player')); end if;
  if public.hr_gm_walled(p_target) then
    return public.hr_gm_close(v_uid, 'ban', p_target, null, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'target_is_gm')); end if;
  insert into public.hr_bans (user_id, banned_at) values (p_target, now()) on conflict (user_id) do nothing;
  insert into public.hr_lb_hidden (user_id, slot, reason, note)
    select p_target, null, 'banned', 'Banned by the Game Master'
     where not exists (select 1 from public.hr_lb_hidden h where h.user_id = p_target and h.slot is null);
  for v_r in select ps.slot, ps.active_kind from public.player_state ps where ps.user_id = p_target order by ps.slot loop
    v_s := public.hr_hunt_leave_pending(p_target, v_r.slot);
    if v_s.id is not null then v_hunts := v_hunts + 1;
    elsif v_r.active_kind <> 'idle' then v_jobs := v_jobs || jsonb_build_array(jsonb_build_object('slot', v_r.slot, 'name', public.hr_character_name(p_target, v_r.slot)));
    end if;
  end loop;
  return public.hr_gm_close(v_uid, 'ban', p_target, null, v_reason, p_idem, jsonb_build_object('ok', true, 'hunts', v_hunts, 'jobs', v_jobs));
end $fn$;

create or replace function public.hr_gm_unban(p_target uuid, p_reason text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_uid uuid := auth.uid(); v_no jsonb; v_reason text := public.hr_gm_reason(p_reason);
begin
  v_no := public.hr_gm_open(v_uid, 'unban', p_target, null, p_reason, p_idem);
  if v_no is not null then return v_no; end if;
  if p_idem is null then return jsonb_build_object('ok', false, 'error', 'bad_idem'); end if;
  if not public.hr_rate_ok(v_uid, 'gm:act', 60, interval '1 minute') then
    return public.hr_gm_close(v_uid, 'unban', p_target, null, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;
  if v_reason is null then return public.hr_gm_close(v_uid, 'unban', p_target, null, null, p_idem, jsonb_build_object('ok', false, 'error', 'needs_reason')); end if;
  delete from public.hr_bans where user_id = p_target;
  delete from public.hr_lb_hidden where user_id = p_target and slot is null and reason = 'banned';
  return public.hr_gm_close(v_uid, 'unban', p_target, null, v_reason, p_idem, jsonb_build_object('ok', true));
end $fn$;

-- SAY: one server-wide line on the system channel, cleaned and masked like any line, stamped Game Master by hr_chat_zgm_gate.
create or replace function public.hr_gm_say(p_body text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_per_day constant int := 20; v_uid uuid := auth.uid(); v_no jsonb; v_body text := public.hr_chat_clean(p_body); v_fault text; v_row public.chat_messages%rowtype;
begin
  v_no := public.hr_gm_open(v_uid, 'say', null, null, null, p_idem);
  if v_no is not null then return v_no; end if;
  if p_idem is null then return jsonb_build_object('ok', false, 'error', 'bad_idem'); end if;
  v_fault := public.hr_chat_body_fault(v_body);
  if v_fault is not null then return public.hr_gm_close(v_uid, 'say', null, null, left(v_body, 200), p_idem, jsonb_build_object('ok', false, 'error', v_fault)); end if;
  if not public.hr_rate_ok(v_uid, 'gm:say', 1, interval '30 seconds') then
    return public.hr_gm_close(v_uid, 'say', null, null, left(v_body, 200), p_idem, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;
  if (select count(*) from public.hr_gm_log l where l.actor = v_uid and l.verb = 'say' and l.outcome = 'ok' and l.at >= public.hr_utc_day_start(now())) >= c_per_day then
    return public.hr_gm_close(v_uid, 'say', null, null, left(v_body, 200), p_idem, jsonb_build_object('ok', false, 'error', 'day_limit', 'per_day', c_per_day)); end if;
  perform set_config('hr.gm_say', '1', true);
  insert into public.chat_messages (channel, from_id, from_name, body) values ('system', v_uid, 'Game Master', v_body) returning * into v_row;
  perform set_config('hr.gm_say', '', true);
  return public.hr_gm_close(v_uid, 'say', null, null, left(v_body, 200), p_idem, jsonb_build_object('ok', true, 'line', public.hr_chat_row(v_row)));
end $fn$;

-- GRANT: the caller's OWN account only. There is no account argument, and hr_gm_open has proved the caller walled.
-- A hero on a hunt or a town job is refused: a grant never races a settle, and hr_apply never meets an unpaid window.
create or replace function public.hr_gm_hero_idle(p_user uuid, p_slot int)
returns text language plpgsql set search_path = public, pg_catalog as $fn$
begin
  if p_slot is null or p_slot < 0 or p_slot > 5 then return 'bad_slot'; end if;
  perform public.hr_hunt_lock(p_user, p_slot);
  if not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return 'no_character'; end if;
  if public.hr_playing(p_user, p_slot) then return 'hero_busy'; end if;
  return null;
end $fn$;

create or replace function public.hr_gm_grant_gold(p_slot int, p_amount bigint, p_reason text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_call constant bigint := 1000000; c_day constant bigint := 10000000;
  v_uid uuid := auth.uid(); v_no jsonb; v_reason text := public.hr_gm_reason(p_reason); v_err text; v_ver bigint; v_used bigint; v_a jsonb;
begin
  v_no := public.hr_gm_open(v_uid, 'grant_gold', null, p_slot, p_reason, p_idem);
  if v_no is not null then return v_no; end if;
  if p_idem is null then return jsonb_build_object('ok', false, 'error', 'bad_idem'); end if;
  if not public.hr_rate_ok(v_uid, 'gm:act', 60, interval '1 minute') then
    return public.hr_gm_close(v_uid, 'grant_gold', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;
  if v_reason is null then return public.hr_gm_close(v_uid, 'grant_gold', v_uid, p_slot, null, p_idem, jsonb_build_object('ok', false, 'error', 'needs_reason')); end if;
  if p_amount is null or p_amount < 1 or p_amount > c_call then
    return public.hr_gm_close(v_uid, 'grant_gold', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'bad_amount', 'max', c_call)); end if;
  v_err := public.hr_gm_hero_idle(v_uid, p_slot);
  if v_err is not null then return public.hr_gm_close(v_uid, 'grant_gold', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', v_err)); end if;
  select coalesce(sum(l.gold), 0) into v_used from public.player_ledger l
   where l.user_id = v_uid and l.kind = 'admin' and l.intent = 'gm_grant:gold' and l.at >= public.hr_utc_day_start(now());
  if v_used + p_amount > c_day then
    return public.hr_gm_close(v_uid, 'grant_gold', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'day_limit', 'left', greatest(0, c_day - v_used))); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object('gold', p_amount,
           'journal', jsonb_build_object('kind', 'admin', 'intent', 'gm_grant:gold', 'meta', jsonb_build_object('reason', v_reason))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_gm_close(v_uid, 'grant_gold', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', coalesce(v_a->>'error', 'refused'))); end if;
  return public.hr_gm_close(v_uid, 'grant_gold', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', true, 'gold', p_amount, 'version', v_a->'version'));
end $fn$;

create or replace function public.hr_gm_grant_item(p_slot int, p_item text, p_qty bigint, p_reason text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_call constant bigint := 1000; c_day constant bigint := 10000;
  v_uid uuid := auth.uid(); v_no jsonb; v_reason text := public.hr_gm_reason(p_reason); v_err text; v_ver bigint; v_used bigint; v_a jsonb;
begin
  v_no := public.hr_gm_open(v_uid, 'grant_item', null, p_slot, p_reason, p_idem);
  if v_no is not null then return v_no; end if;
  if p_idem is null then return jsonb_build_object('ok', false, 'error', 'bad_idem'); end if;
  if not public.hr_rate_ok(v_uid, 'gm:act', 60, interval '1 minute') then
    return public.hr_gm_close(v_uid, 'grant_item', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;
  if v_reason is null then return public.hr_gm_close(v_uid, 'grant_item', v_uid, p_slot, null, p_idem, jsonb_build_object('ok', false, 'error', 'needs_reason')); end if;
  if p_item is null or not exists (select 1 from public.hr_items i where i.item_id = p_item) then
    return public.hr_gm_close(v_uid, 'grant_item', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'bad_item')); end if;
  if p_qty is null or p_qty < 1 or p_qty > c_call then
    return public.hr_gm_close(v_uid, 'grant_item', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'bad_amount', 'max', c_call)); end if;
  v_err := public.hr_gm_hero_idle(v_uid, p_slot);
  if v_err is not null then return public.hr_gm_close(v_uid, 'grant_item', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', v_err)); end if;
  select coalesce(sum(l.qty_in), 0) into v_used from public.player_ledger l
   where l.user_id = v_uid and l.kind = 'admin' and l.intent like 'gm\_grant:item:%' and l.at >= public.hr_utc_day_start(now());
  if v_used + p_qty > c_day then
    return public.hr_gm_close(v_uid, 'grant_item', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'day_limit', 'left', greatest(0, c_day - v_used))); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object('items', jsonb_build_object(p_item, p_qty),
           'journal', jsonb_build_object('kind', 'admin', 'intent', 'gm_grant:item:' || p_item, 'meta', jsonb_build_object('reason', v_reason))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_gm_close(v_uid, 'grant_item', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', coalesce(v_a->>'error', 'refused'))); end if;
  return public.hr_gm_close(v_uid, 'grant_item', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', true, 'item', p_item, 'qty', p_qty, 'version', v_a->'version'));
end $fn$;

-- Raise-only, and the one writer of level_xp outside a settle: hr_apply takes level_xp from a hunt alone, and it should.
create or replace function public.hr_gm_grant_level(p_slot int, p_level int, p_reason text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_max constant int := 500; c_per_day constant int := 50;
  v_uid uuid := auth.uid(); v_no jsonb; v_reason text := public.hr_gm_reason(p_reason); v_err text; v_have bigint; v_xp bigint;
begin
  v_no := public.hr_gm_open(v_uid, 'grant_level', null, p_slot, p_reason, p_idem);
  if v_no is not null then return v_no; end if;
  if p_idem is null then return jsonb_build_object('ok', false, 'error', 'bad_idem'); end if;
  if not public.hr_rate_ok(v_uid, 'gm:act', 60, interval '1 minute') then
    return public.hr_gm_close(v_uid, 'grant_level', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;
  if v_reason is null then return public.hr_gm_close(v_uid, 'grant_level', v_uid, p_slot, null, p_idem, jsonb_build_object('ok', false, 'error', 'needs_reason')); end if;
  if p_level is null or p_level < 2 or p_level > c_max then
    return public.hr_gm_close(v_uid, 'grant_level', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'bad_level', 'max', c_max)); end if;
  v_err := public.hr_gm_hero_idle(v_uid, p_slot);
  if v_err is not null then return public.hr_gm_close(v_uid, 'grant_level', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', v_err)); end if;
  if (select count(*) from public.player_ledger l where l.user_id = v_uid and l.kind = 'admin' and l.intent = 'gm_grant:level'
        and l.at >= public.hr_utc_day_start(now())) >= c_per_day then
    return public.hr_gm_close(v_uid, 'grant_level', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'day_limit', 'per_day', c_per_day)); end if;
  select ps.level_xp into v_have from public.player_state ps where ps.user_id = v_uid and ps.slot = p_slot;
  v_xp := public.hr_char_xp_for_level(p_level);
  if v_xp <= v_have then
    return public.hr_gm_close(v_uid, 'grant_level', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'already_there', 'level', public.hr_char_level(v_have))); end if;
  update public.player_state set level_xp = v_xp, version = version + 1 where user_id = v_uid and slot = p_slot;
  insert into public.player_ledger (user_id, slot, kind, intent, meta)
    values (v_uid, p_slot, 'admin', 'gm_grant:level', jsonb_build_object('reason', v_reason, 'level', p_level, 'from_xp', v_have, 'to_xp', v_xp));
  return public.hr_gm_close(v_uid, 'grant_level', v_uid, p_slot, v_reason, p_idem, jsonb_build_object('ok', true, 'level', p_level,
           'version', (select version from public.player_state where user_id = v_uid and slot = p_slot)));
end $fn$;

-- ── §7 THE STOP, THE ENGINE'S SIDE ──────────────────────────────────────────────────────────────────────────────────────
-- p_gm is the engine's VERIFIED JWT subject, never a body field. A hunt: the player's own statement, here. A job: {kind:'job'}, and the engine runs the
-- player's own collect-then-switch on that hero. Nothing else: no write to player_state.
create or replace function public.hr_gm_stop_gate(p_gm uuid, p_user uuid, p_slot int, p_reason text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_no jsonb; v_reason text := public.hr_gm_reason(p_reason); v_s public.hunt_sessions%rowtype; v_kind text; v_id text;
begin
  v_no := public.hr_gm_open(p_gm, 'stop', p_user, p_slot, p_reason, p_idem);
  if v_no is not null then return v_no; end if;
  if p_idem is null then return jsonb_build_object('ok', false, 'error', 'bad_idem'); end if;
  if not public.hr_rate_ok(p_gm, 'gm:act', 60, interval '1 minute') then
    return public.hr_gm_close(p_gm, 'stop', p_user, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;
  if v_reason is null then return public.hr_gm_close(p_gm, 'stop', p_user, p_slot, null, p_idem, jsonb_build_object('ok', false, 'error', 'needs_reason')); end if;
  if p_user is null or p_slot is null or not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then
    return public.hr_gm_close(p_gm, 'stop', p_user, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_s := public.hr_hunt_leave_pending(p_user, p_slot);
  if v_s.id is not null then
    return public.hr_gm_close(p_gm, 'stop', p_user, p_slot, v_reason, p_idem, jsonb_build_object('ok', true, 'kind', 'hunt', 'pending', true, 'hunt', v_s.hunt_id)); end if;
  select ps.active_kind, ps.active_id into v_kind, v_id from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  if v_kind = 'idle' then
    return public.hr_gm_close(p_gm, 'stop', p_user, p_slot, v_reason, p_idem, jsonb_build_object('ok', false, 'error', 'nothing_to_stop')); end if;
  return public.hr_gm_close(p_gm, 'stop', p_user, p_slot, v_reason, p_idem, jsonb_build_object('ok', true, 'kind', 'job', 'job', v_kind, 'job_id', v_id));
end $fn$;

-- What the engine's switch answered, for the journal. It runs in the engine's next statement, so it cannot share the gate's row.
create or replace function public.hr_gm_stop_result(p_gm uuid, p_user uuid, p_slot int, p_error text)
returns void language plpgsql security definer set search_path = public, pg_catalog as $fn$
begin
  if not exists (select 1 from public.hr_gm_accounts g where g.user_id = p_gm) then return; end if;
  if not public.hr_rate_ok(p_gm, 'gm:act', 60, interval '1 minute') then return; end if;
  insert into public.hr_gm_log (actor, verb, target_user, target_slot, reason, outcome)
  values (p_gm, 'stop_job', p_user, p_slot, left(p_error, 200), case when p_error is null then 'ok' else 'refused' end);
end $fn$;

-- ── §7b THE ENGINE ALLOWLIST: link 23 of HR_GRANT_HYGIENE_CHAIN, DERIVED ────────────────────────────────────────────────
-- tools/derive-grant-hygiene.mjs extracts 2027-02-10-settle-reads.sql's detector and INSERTS the two engine functions at the head of
-- c_engine_allow (declared-removals list EMPTY). Without it the nightly detector reads them as engine_execute_outside_allowlist.
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ⟦DERIVED hr_assert_grant_hygiene — tools/derive-grant-hygiene.mjs, do not hand-edit⟧
create or replace function public.hr_assert_grant_hygiene(p_strict boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_public_exec   jsonb;   -- D1 + D3: PUBLIC holds EXECUTE (functions AND procedures)
  v_unapproved    jsonb;   -- D2: client-executable but not in the baseline
  v_lost          jsonb;   -- baseline rows whose function is gone (reported)
  v_client_trunc  jsonb;   -- TRUNCATE/REFERENCES/TRIGGER on any relation
  v_defacl_open   jsonb;   -- D4: owners with no fail-closed GLOBAL default ACL
  v_platform      jsonb;   -- residual, reported only
  v_engine_extra  jsonb;   -- S9: hr_engine EXECUTE outside its allowlist
  v_engine_tables jsonb;   -- S9: hr_engine holding any table privilege
  v_ungated       jsonb;   -- A9: client-callable SECURITY DEFINER with no rate gate
  v_ops_reach     jsonb;   -- T-5: the pg_net sink hr_ops reachable by a client/engine role
  v_report jsonb;

  -- ══════════════════════════════════════════════════════════════════════
  -- S9 — THE hr_engine CAPABILITY PIN, MOVED HERE (Security, 2026-08-11)
  -- ──────────────────────────────────────────────────────────────────────
  -- It used to live in 2026-08-11-market-v2.sql §9(i), which is three defects
  -- at once and the reason it is now here:
  --
  --   1. IT DOES NOT RUN. market-v2 is UNAPPLIED and cannot be applied until
  --      the server owns gold and inventory. A pin inside an unapplied
  --      migration is a comment. hr_assert_grant_hygiene runs at every apply
  --      AND nightly via pg_cron, and its failures surface as maintenance_alerts.
  --   2. IT MATCHED ON `proname`. `p.proname <> all (array[...])` accepts ANY
  --      overload of an approved name — `hr_seed(text)` added next to
  --      `hr_seed(uuid,int,text)` would pass silently. Keyed on
  --      `p.oid::regprocedure::text` an overload is a different string and is
  --      therefore a finding, which is the correct answer.
  --   3. IT FILTERED `prokind = 'f'`. A PROCEDURE was invisible to it — exactly
  --      defect D1 that this file's own rewrite was written to fix, reproduced
  --      one section later.
  --
  -- ⚠ EVERY ENTRY CARRIES A ONE-LINE JUSTIFICATION. In the old list only entry
  --   8 did, which meant the first seven were "bounded and fine" by tradition.
  --   Adding an entry is a CLAIM: read-only or self-validating, and it accepts
  --   no target the caller is not already authorised for. Re-derive that for
  --   the whole list every time it changes.
  c_engine_allow constant text[] := array[
    -- ── ADDED 2027-03-05 — THE GAME MASTER'S STOP (lane/c-gm-tools) ───────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list.
    --
    -- SELF-VALIDATING: p_gm is the engine's VERIFIED subject, and both refuse unless
    -- it holds a row of hr_gm_accounts, which only a migration writes. The gate ends a
    -- hunt by the statement hr_hunt_leave runs and journals; it moves no value. The
    -- result journals one row. A town job's stop is then the player's own
    -- runSetActivity on that hero: collect, then switch.
    'hr_gm_stop_gate(uuid,uuid,integer,text,uuid)',
    'hr_gm_stop_result(uuid,uuid,integer,text)',
    -- ── ADDED 2027-02-10 — THE ACCRUE READ (lane/c-settle-cost-2) ─────────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list.
    --
    -- READ-ONLY: index.ts's accrue read for the VERIFIED subject's own hero (the
    -- slot is a row the caller owns). With no open hunt it is hr_state_of, the
    -- envelope the engine already reads; with one, seven of that envelope's own
    -- scalars (the pointer, the version, the clock, the rested bank). It writes
    -- nothing, takes no value, names no other player.
    'hr_accrue_read(uuid,integer)',
    -- ── ADDED 2027-01-12 — THE ACCOUNT MARKET (lane c-market-account) ────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. The v2 entries below keep their
    -- stale TEXT (their functions are dropped). Each claim re-derived:
    --
    -- SELF-VALIDATING, the v2 claim on the account: the caller names a slot, a
    -- key, a version, a source (bag|storage), an item, a count and an ASK about
    -- its OWN goods. Listable comes from the generated catalogues (hr_market_items),
    -- the floor is the shop's bid, the ceiling the config's; the fee, the TTL and
    -- every cap are server config; the per-account caps are read under the
    -- account's Storage lock. Moves the account's own goods into escrow and burns
    -- a fee through hr_purse_move. Target (p_user, p_slot), the hr_apply pair.
    'hr_market_list(uuid,integer,bigint,uuid,text,text,bigint,bigint)',
    -- SELF-VALIDATING: a listing id of the caller's OWN account (refused
    -- not_yours otherwise); the delete is the arbiter and the units return to the
    -- account's Storage. No price, no count, no target beyond (p_user, p_slot).
    'hr_market_cancel(uuid,integer,uuid,uuid)',
    -- SELF-VALIDATING, the one cross-account transfer: a listing id, a count, a
    -- MAX price and a destination. The price comes off the LOCKED row; the same
    -- account (any hero) is refused; both purses lock in user order, LAST; the
    -- buyer's spend and the seller's proceeds are capped per ACCOUNT per day under
    -- those locks; conserved (buyer -gross, seller +net, cut burned), journalled
    -- with no counterparty in any client-readable row (market_sales holds both).
    -- A compromised engine names both sides only inside those caps.
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint,bigint,text)',
    -- read-only in value (it spends a rate counter): per-item summaries of open
    -- asks and sales, no account id or name; <= 50 items a call; switch-gated.
    'hr_market_browse(uuid,integer,text[],text,integer)',
    -- read-only in value: one item's cheapest 50 asks (listing ids only; "mine"
    -- marks the caller's own account), its daily line and its last 10 sales.
    'hr_market_item(uuid,integer,text)',
    -- read-only in value: the caller's OWN account's listings, 30-day market
    -- history from its own ledger rows and today's cap usage.
    'hr_market_mine(uuid,integer)',
    -- ── ADDED 2026-10-25 — THE CHARACTER SHEET (lane character-window) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Each claim re-derived:
    --
    -- read-only (STABLE): the md5 of the character's skill levels, worn set,
    -- combat style, active buffs and hr_perks_of — values hr_state_of and
    -- hr_perks_of already answer the engine. Target (p_user, p_slot), the
    -- hr_state_of pair.
    'hr_character_sheet_inputs(uuid,integer)',
    -- SELF-VALIDATING: writes ONE display row (hr_character_sheets) for the
    -- (p_user, p_slot) the engine already reads, only when the fingerprint it
    -- is handed equals the current one, stamped with the calling engine's
    -- payload hash, bounded (an object, <= 2 KB). No fight,
    -- price, gate or other player reads the row; it moves no value. Answers
    -- hr_state_of, which the engine already holds.
    'hr_character_sheet_put(uuid,integer,text,text,jsonb)',
    -- ── ADDED 2026-10-23 — THE INSTANCE SETTLE (lane S1, HUNT_SCREEN_SPEC §1.3) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Each claim re-derived:
    --
    -- read-only (STABLE): the instance the caller's OPEN session hunts in — its
    -- clock, world, the keyed-seed secret hr_seed(null, 0, 'hunt:' || instance)
    -- — and every OPEN member's session and hr_state_of. Its target argument is
    -- (p_user, p_slot), the hr_state_of pair; the members it adds are characters
    -- the engine already reads and settles (it holds hr_state_of / hr_apply).
    'hr_hunt_instance_read(uuid,integer)',
    -- SELF-VALIDATING, the hr_apply claim: under the instance lock and its
    -- world_swing CAS, with the member set held to the instance's open sessions,
    -- it CALLS hr_apply (every invariant of each member's value half, under that
    -- member's character lock) and the session applier (swing CAS, window, bag,
    -- per-lane use caps, falls journalled, every end re-proved), plus the kill
    -- bound, the value bound, the store's catalogue prices, the stamina bound
    -- and the world's shape and byte bound — in ONE subtransaction; a refusal
    -- anywhere rolls every member back. It pays nothing hr_apply would refuse.
    'hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
    -- ── ADDED 2026-10-22 — THE HUNT SETTLE (ruling HR-2026-10-14, lane C2) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Each claim re-derived:
    --
    -- read-only: the id of the character's OPEN session or null. Same target
    -- argument as hr_state_of (p_user, p_slot), one indexed row.
    'hr_hunt_open_of(uuid,integer)',
    -- read-only (STABLE): one open session — clock, bag, action bar — and the
    -- session secret hr_seed(user, slot, 'hunt:' || id), i.e. a value the
    -- engine could already ask hr_seed for. Accepts no target the engine is
    -- not already authorised for (the hr_apply/hr_state_of pair).
    'hr_hunt_engine_read(uuid,integer)',
    -- SELF-VALIDATING, the hr_apply claim: it CALLS hr_apply (which re-checks
    -- every invariant of the value half under its own version CAS) and
    -- hr_hunt_settle_session (swing CAS, window, bag, use caps, presses only
    -- shrink, falls journalled, every end re-proved), in ONE subtransaction —
    -- a refusal in either half rolls both back. Its own writes are the press
    -- (validated as hr_hunt_use validates one) and a buff queue admitted only
    -- when this window's bag uses paid for every new segment. It pays nothing
    -- hr_apply would refuse.
    'hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    -- NOT READ-ONLY, bounded: the CLOSED-MODE answer for a refused edge call
    -- (Security, closed-mode review item 4). Asked only after hr_rate_gate
    -- refused (p_user, p_slot) — the pair the engine already passes it. It
    -- reads hr_admitted for that user and, when not admitted, writes ONE
    -- hr_rejections aggregate upsert (code 'closed') for that user; it moves
    -- no value and names no other target.
    'hr_engine_closed(uuid,integer,text)',
    -- ── ADDED 2026-10-10 — THE PRESENCE HORIZON (Game Designer ruling on B1) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list.
    --
    -- NOT READ-ONLY, and the claim rests on SELF-VALIDATING: the caller names
    -- only (p_user, p_slot), the pair it already passes to hr_state_of. The
    -- answer is hr_offline_cap_ms bounded by the character's own
    -- hr_return_anchor; its ONE write is a forfeit of an absence whose horizon
    -- is spent and past, made THROUGH hr_apply (version CAS, journalled
    -- intent horizon_forfeit, key derived from the anchor) and moving only
    -- accrued_to forward to now(). It can pay nothing: no gold, no item, no XP.
    'hr_accrue_cap_ms(uuid,integer)',
    -- ── ADDED 2026-10-06 — THE SHADOW PARITY PROBE (Security ruling 1) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- READ-ONLY (STABLE): the fetch returns ONE open probe row of ONE
    -- character, and only to the holder the ROSTER leased that character to,
    -- inside the lease. Its payload is a snapshot the engine itself built from
    -- hr_state_of, which hr_engine already reads for any character it names.
    -- NO NEW TARGET: (p_user, p_slot) is the pair the engine already passes to
    -- hr_state_of and hr_tick_settle.
    'hr_tick_probe_fetch(text,uuid,integer,text)',
    -- NOT READ-ONLY, and the claim rests on its WRITE TARGET: its only write
    -- is the operator table the probe owns (RLS forced, no policy, no client
    -- or engine grant, classified operational + player_value_exempt). It
    -- writes no player_state, no ledger, no inventory, no hr_tick_ownership
    -- (it takes no row lock either), no shadow row and no frame — proved by
    -- execution over EVERY user table's transaction tuple counters in its
    -- migration's p3. SELF-VALIDATING: the caller names a holder, a character
    -- and a window, and the window must be the character's journalled SHADOW
    -- CHAIN HEAD under a lease the roster stamped — so it can only measure a
    -- span the fence actually tiled, never invent one, and an armed channel
    -- cannot reach it at all. Nothing reads its rows to decide a number a
    -- player can spend, rank or trade. NO NEW TARGET.
    'hr_tick_probe_commit(text,uuid,integer,text,timestamp with time zone,timestamp with time zone,text,bigint,jsonb,jsonb)',
    -- ── ADDED 2026-09-23 — THE PARTY FENCE AND ITS PREDICATE (M8 S2) ────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- ⚠ hr_party_tick_settle IS NOT READ-ONLY, and the claim rests on
    -- SELF-VALIDATING, re-derived rather than carried across from
    -- hr_tick_settle's entry. It is the world tick's ONE door to player value
    -- for a PARTY, and its whole caller-supplied surface is a holder name, a
    -- party id, a window [from,to), an idempotency uuid and an array of 1..4
    -- member objects — every one of which is CHECKED AGAINST THE DATABASE
    -- before a value moves:
    --   * THE LEASE, at party grain. The caller must name a party the ROSTER
    --     handed it, in its own holder name, inside the lease window.
    --     hr_party_roster is executable by `hr_tick` and by NOTHING ELSE, and
    --     hr_engine is asserted NOT to hold it, so a settling role
    --     structurally cannot stamp its own lease.
    --   * THE PARTY LOCK, taken FIRST, which is what serialises a settle
    --     against a join, a leave and a kick.
    --   * THE WATERMARK CAS, the PARTY's, computed once under that lock and
    --     byte-identical in every term to hr_tick_settle's own.
    --   * INVARIANT 8, PER MEMBER: `player_state.accrued_to` must EQUAL the
    --     party watermark. An inequality either way is a broken invariant and
    --     the whole call is refused — there is no branch that reconciles.
    --   * THE LIVE MEMBER SET, re-counted UNDER THE LOCK and asserted equal to
    --     the declared set with no member named twice. A subset is a partial
    --     settle, which pays some members a split computed from all of them —
    --     a mint, and the one defect that cannot be recovered after the fact.
    --   * THE DECLARED WINDOW IS BOUND TO THE PAID ONE per member
    --     (`delta->>'accrued_to' = p_window_to`), and the delta's top-level
    --     key set is asserted to be a solo combat settle's, so attribution
    --     cannot ride in the delta and no unknown key can reach hr_apply.
    --   * AND THEN hr_apply RE-VALIDATES EVERY INVARIANT regardless of caller.
    --     It is the only money writer; this function computes and fences and
    --     never moves a value except through it, once per member, inside ONE
    --     transaction whose savepoint rolls the whole fan-out back if any
    --     member cannot be paid.
    -- NO NEW TARGET: the members it names are (user, slot) pairs the engine
    -- already passes to hr_apply and hr_state_of. The holder of hr_apply can
    -- already WRITE any character it names; this is strictly NARROWER.
    --
    -- ⚠ hr_partied IS READ-ONLY, which is the strongest form an entry here can
    -- take: `stable sql`, one EXISTS over party_member joined to party_hunt,
    -- no row written, so it cannot be replayed into a gain. NO NEW TARGET —
    -- (p_user, p_slot), the same pair again. WHY THE ENGINE NEEDS IT: it is
    -- invariant 8's fence at the intent door. A partied character's own
    -- `accrue` is refused `party_settle_required` and every other
    -- collectsFirst verb `party_hunt_running`, because the timing of an
    -- ordinary client intent would otherwise re-price a window three other
    -- players are paid from — CLAUDE.md §1's target property failing by timing
    -- rather than by number. No client role holds it: a client-callable
    -- membership predicate is an oracle it can sweep.
    'hr_party_tick_settle(text,uuid,timestamp with time zone,timestamp with time zone,uuid,jsonb)',
    'hr_partied(uuid,integer)',
    -- ── ADDED 2026-09-22 — THE HUNT'S TWO READS (M6) ───────────────────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- ⚠ BOTH ARE READ-ONLY, WHICH IS THE WHOLE CLAIM, and it is the strongest
    -- form an entry on this list can take: neither writes a row, so neither can
    -- be replayed into a gain, and a forged call returns another shape of data
    -- the caller can already reach. Both are asserted STABLE and both are
    -- asserted free of INSERT/UPDATE/DELETE by their own migrations' section-4
    -- gates, which run at apply time and refuse to install a body that grew a
    -- write.
    --
    -- NO NEW TARGET. Each takes (p_user, p_slot) — the SAME pair the engine
    -- already passes to hr_state_of and hr_apply, both of which it already
    -- holds. The holder of hr_apply can already WRITE any character it names;
    -- these are strictly NARROWER than what it already has, and they exist so
    -- the ONE envelope the client renders carries the hunt readout rather than
    -- the browser growing a second read of its own (HUNT_ANALYZER_UI.md §6).
    --
    -- WHY THE ENGINE NEEDS THEM: hr_state_of calls both, and hr_state_of is
    -- itself engine-only. They are granted to hr_engine ONLY — no client role
    -- holds either, which tests/hunt-analyzer.mjs A5 and the vigour guard both
    -- assert by executing has_function_privilege rather than by reading a grant
    -- line.
    'hr_hunt_analyzer(uuid,integer)',
    'hr_vigour_of(uuid,integer)',
    -- ── ADDED 2026-09-22 — THE BESTIARY TROPHY PAIR ─────────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- read-only (STABLE) projection of the CLAIMED trophy rows for ONE
    -- character: kind='collection', period_key='', key like 'trophy:%'. It
    -- writes nothing and calls nothing that writes. SELF-VALIDATING: the row
    -- set is bounded STRUCTURALLY by the key prefix and by (user, slot) — there
    -- is no parameter through which a caller can widen it. WHY THE ENGINE NEEDS
    -- IT: 2026-09-22-state-of-trophy-prefix.sql removed the trophy population
    -- from hr_state_of's generic envelope (it would breach the 1000-row cap and
    -- silently truncate a player's quest state), so this is now the ONLY door
    -- to it — the same position hr_bestiary_of and hr_collection_of are in.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of.
    'hr_trophy_of(uuid,integer)',
    -- NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a MONSTER ID
    -- (validated against hr_activities kind='combat', the generated,
    -- client-unwritable catalogue), a STAGE (bounded 1..4 against the server's
    -- own ladder) and an idempotency uuid. THERE IS NO KILL-COUNT PARAMETER —
    -- the threshold is judged against a counter the function reads itself from
    -- player_progress, under the SAME advisory lock hr_apply takes — so a
    -- forged count is not refused, it is unrepresentable.
    -- ⚠ AND IT MINTS NOTHING: no gold, no gems, no items, no XP, no multiplier.
    -- It writes ONE flag row (value 1, on conflict do nothing, so a replay is a
    -- refusal) and ONE zero-valued ledger row. The trophy's power is DERIVED
    -- from the kill counters on every read (src/core/trophies.js) and is
    -- already on before this is called, so there is no value here for a forged
    -- or replayed call to move — which is why the CLAUDE.md §1 target property
    -- holds by construction rather than by a clamp. Measured, not asserted:
    -- the migration's §5(e) compares gold/gems/xp/inventory AND accrued_to
    -- across a real claim. NO NEW TARGET: p_user again.
    'hr_trophy_claim(uuid,integer,text,integer,text)',
    -- ── ADDED 2026-09-21 — THE WORLD TICK'S ONE DOOR ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived.
    -- hr_tick_settle is the FENCE in front of hr_apply for the world tick, and
    -- it is the ONLY route the tick has to player value: the roster WITHDREW
    -- the tick's raw hr_apply grant and this function replaced it. Its whole
    -- caller-supplied surface is a holder name, a (user, slot, channel), a
    -- version, a window [from,to), an idempotency uuid and a delta — and every
    -- one of those is CHECKED AGAINST THE DATABASE before a value moves:
    --   * THE LEASE. The caller must name a character the ROSTER handed it, in
    --     its own holder name, inside the lease window. hr_tick_roster is
    --     executable by `hr_tick` and by NOTHING ELSE, and hr_engine is
    --     asserted NOT to hold it (fence e19), so a settling role structurally
    --     cannot stamp its own lease. "Choose whose world ticks" is closed one
    --     level deeper than a grant.
    --   * THE WATERMARK CAS, under `select ... for update` on player_state
    --     taken BEFORE any comparison: a window at or after the settled mark is
    --     accepted, a window behind it is refused whatever its version and
    --     whatever its key. This holds against a client accrue, a client
    --     collect, a second tick process and a replay of the same call.
    --   * THE DECLARED WINDOW IS BOUND TO THE PAID ONE
    --     (`p_delta->>'accrued_to' = p_window_to`), so a caller cannot name
    --     ten seconds and hand over an hour.
    --   * THE VERSION, and then hr_apply re-validates every invariant regardless
    --     of caller — ONE call site, after every check, no tick-specific clamp
    --     and no fast path.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this is strictly NARROWER than what it already has.
    -- WHY THE ENGINE NEEDS IT: hr_apply's impersonation seam tests
    -- `v_role = 'hr_engine'` literally, so the tick cannot reach hr_apply as
    -- `hr_tick` at all (S-1, proved by execution); the edge arrives as
    -- hr_engine and this is the door it knocks on. Granted to hr_engine ONLY —
    -- fence e18c asserts `hr_tick` does NOT hold it, because that would be
    -- a door that cannot open and would journal a forgery alert every fire.
    -- ── RESTATED 2026-09-23 — THE TENTH ARGUMENT (M3 shadow-state chain) ─
    -- A REPLACEMENT, not an insertion: this chain's first, and the removed
    -- line is declared in tests/run-sql-tests.mjs PART 1f-ii. The entry is
    -- keyed on `regprocedure`, so a signature change is a DIFFERENT string
    -- and the old one now names a function that does not exist — reported
    -- under `lost` while the real door raises
    -- `engine_execute_outside_allowlist` on the nightly cron every night.
    --
    -- ⚠ THE CLAIM IS UNCHANGED, AND IT IS RE-DERIVED RATHER THAN CARRIED.
    -- The tenth argument is `p_shadow_state jsonb`, and it is the ONLY
    -- caller-supplied value on this function that is neither checked against
    -- the database nor handed to hr_apply. It does not need to be, because it
    -- cannot reach player value at all:
    --   * IT IS WRITTEN ONLY ON THE SHADOW BRANCH, the branch with no
    --     hr_apply call in it, under the same row lock as the watermark it
    --     chains. On the ARMED branch a non-null one is REFUSED
    --     (`shadow_state_while_armed`) before hr_apply is reached — never
    --     ignored, because a carrier silently dropped on the branch that pays
    --     is how a stale proposal would be believed.
    --   * IT IS STORED VERBATIM AND READ BACK BY THE SAME ROLE that wrote it,
    --     into `hr_tick_ownership.shadow_state` — a column on an operator
    --     table that no client role can read or write, bounded by its own
    --     CHECK constraint, and CLEARED together with `shadow_accrued_to`
    --     the moment an armed settle succeeds.
    --   * NOTHING READS IT TO DECIDE A NUMBER A PLAYER CAN SPEND. Its only
    --     consumer is the next SHADOW window, whose entire output is
    --     `hr_tick_shadow` — classified `operational` +
    --     `player_value_exempt` in tests/restore-census.baseline.json on
    --     exactly the basis that losing every row of it costs a measurement
    --     and not a progression.
    -- NO NEW TARGET: p_user is still the parameter the engine already passes
    -- to hr_apply and hr_state_of, and every other check of the fence — the
    -- lease, the watermark CAS under `for update`, the declared-window
    -- binding, the version — is untouched and runs in the same order.
    'hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb,jsonb)',
    -- ── ADDED 2026-09-11 — THE QUARTERMASTER SPEND WRITER ───────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, and an OFFER ID (a primary key in the generated,
    -- client-unwritable hr_qm_offers). No item, no qty, no price and no scrip
    -- amount cross. The PRICE and the ITEM come from hr_qm_offers; the scrip
    -- balance is the character's OWN player_state row read under the SAME advisory
    -- lock hr_apply takes; the debit is bounded by that balance
    -- (insufficient_scrip). NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip is server-of-record and its SPEND (the Quartermaster) must be
    -- one server transaction with the item grant, or the b372 half-undo returns —
    -- and NO other RPC debits player_state.dungeon_scrip, so without this the only
    -- writer of the spend is the client.
    'hr_quartermaster_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-09-10 — THE DUNGEON SETTLE WRITER ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, a DUNGEON ID (a primary key in the generated,
    -- client-unwritable hr_dungeons), a MODE (auto|manual|scavenger), and a
    -- p_quality CLAMPED server-side to [0,1] that scales SELF-ONLY scrip and
    -- touches NO loot. No item, no qty, no chance, no price and no timestamp
    -- cross. Every number it writes comes from hr_dungeons / hr_dungeon_loot or
    -- the character's OWN row read under the SAME advisory lock hr_apply takes;
    -- loot is rolled by the server hr_seed PRNG (never a client value); the entry
    -- KEY is debited from the caller's own player_inventory (the load-bearing
    -- gate); the cooldown and the per-day scrip cap read now() and the
    -- append-only ledger. NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip + run loot are server-of-record (dungeon-settlement.md
    -- §1/§2) and NO other RPC writes player_state.dungeon_scrip, so without this
    -- the only writer of the currency is the client.
    'hr_dungeon_settle(uuid,integer,bigint,uuid,text,text,numeric)',
    -- ── ADDED 2026-09-10 — THE ATTENDED KILL LEDGER PROJECTION ──────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2, 5 and
    -- 6: it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- READ-ONLY: `language sql`, `stable` — three CTEs over hr_kill_credit_log
    -- and player_state and a jsonb_build_object. No PL/pgSQL body through which a
    -- later edit could smuggle a write without the language keyword changing,
    -- which is the same strongest-available shape the three link-6 projections
    -- carry. The authoring migration's GATE(b) asserts that shape rather than
    -- describing it.
    -- SELF-VALIDATING: fixed output, its own per-target and per-key ceilings, and
    -- it sums `credit` (what hr_bounty_kill_cap allowed) and never `claimed`
    -- (what the client sent). GATE(e2) executes that distinction.
    -- NO NEW TARGET: (p_user, p_slot) — the exact pair the engine already hands
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this lets it READ one integer per monster for one of
    -- them, out of a table hr_engine holds no privilege on (GATE(c)). The third
    -- argument, p_upto, is the engine's own hr_state_of now() and is CLAMPED with
    -- least(p_upto, now()), so it can only ever SHRINK the projected window —
    -- Security condition C6, executed by that migration's GATE(e6).
    -- WHY THE ENGINE NEEDS IT: the settle is the ONE writer of loot and gold, and
    -- it priced attended windows by re-simulating them as unattended — measured
    -- 9 kills against 15 the server had already accepted, i.e. 38% of a session's
    -- drops confiscated. See docs/design/attended-loot-credit.md.
    'hr_attended_kills(uuid,integer,timestamp with time zone)',
    -- ── ADDED 2026-08-20 — THE THREE LIVE-PROGRESS READ PROJECTIONS ─────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2 and 5:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- All three are READ-ONLY (`stable sql`) dedicated projections for ONE
    -- character, added by 2026-08-20-bestiary.sql / 2026-08-21-collection.sql /
    -- 2026-08-20-renown.sql. hr_state_of stopped serving the ev:kill_monster:%
    -- and ev:loot:% populations (2026-08-21-streak-state.sql) because together
    -- they approach its 1000-row envelope cap, so the engine reads them through
    -- these instead. SELF-VALIDATING and NO NEW TARGET, the same claim
    -- hr_state_of / hr_perks_of make: each takes (p_user, p_slot) — the exact
    -- pair the engine already passes to hr_apply and hr_state_of — reads a
    -- STRICT SUBSET of what hr_state_of's envelope used to carry, writes nothing,
    -- calls nothing that writes, and exposes no target the holder of hr_apply
    -- could not already reach.
    'hr_bestiary_of(uuid,integer)',
    'hr_collection_of(uuid,integer)',
    'hr_renown_of(uuid,integer)',
    -- ── ADDED 2026-08-17 — THE THREE MARKET WRITERS ─────────────────────
    -- At the HEAD, an insertion, for the same reason as links 1 and 2: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ THE LARGEST SINGLE WIDENING SINCE hr_apply: three writers at once, and
    -- ONE OF THEM MOVES VALUE BETWEEN TWO PLAYERS. The c_engine_allow claim is
    -- "read-only or SELF-VALIDATING, and it accepts no target the caller is not
    -- already authorised for". None of these is read-only, so the whole claim
    -- rests on the other two clauses, re-derived rather than asserted:
    --
    --   SELF-VALIDATING. The entire caller-supplied surface of the three is a
    --   character slot, an idempotency uuid, a version, and then: an ITEM ID +
    --   COUNT + ASK (list), a LISTING ID (cancel), a LISTING ID + COUNT (buy).
    --   No price crosses on a buy — ask_each is read off the listing row under
    --   its own lock — no timestamp, no name, no fee rate, no counterparty. The
    --   item must be `tradeable` in the generated, client-unwritable hr_items;
    --   the tax rate and every ceiling come from hr_market_config; the seller
    --   name is derived from profiles; every clock is now(). Each function
    --   re-reads its listing FOR UPDATE and re-validates under hr_apply's own
    --   advisory lock, refuses a stale version, and is clamped per call (a gross
    --   ceiling) AND per DAY (list churn; gold sent; gold received) from the
    --   append-only ledger — the dimension a rate limit does not bound.
    --
    --   THE TARGET CLAUSE, STATED HONESTLY (Security M2). The earlier draft
    --   claimed "the engine cannot select a victim". That is FALSE and is the
    --   correction: the engine holds hr_market_list(p_user, …) for ANY user, so a
    --   compromised engine can open a listing FOR a victim it names and then
    --   settle it to itself with hr_market_buy — it can choose both sides of a
    --   trade. What admits these three is therefore NOT "no victim" but BOUNDED
    --   BLAST RADIUS: every path is a CONSERVED transfer of TRADEABLE items
    --   (buyer -gross, seller +net, tax burned — nothing minted, nothing an
    --   honest player did not already own), the item must be `tradeable` in the
    --   client-unwritable hr_items, BOTH SIDES ARE JOURNALLED (transfer +
    --   self_trade in meta), and the flows are CLAMPED PER DAY off the
    --   append-only ledger on three dimensions the engine cannot widen: escrowed
    --   item quantity (list), gold sent (buy) and gold received (buy).
    --   ⚠ THOSE CLAMPS ARE THE MARKET'S OWN, NOT hr_day_budget_check. A market
    --   transfer is conserved, so it is deliberately absent from the mint
    --   budget's qty dimension — charging a sale to the seller's daily inflow
    --   would let a stranger drain their accrual (the griefing vector in
    --   hr_market_buy's header). So the item-drain and gold-move ceilings live
    --   here and only here. p_user is the parameter the engine already passes to
    --   hr_apply.
    --
    --   WHY THE ENGINE NEEDS THEM: hr_apply is single-character by construction
    --   — one lock, one version, one journal target — so a delta shape that
    --   could move a second player's gold would be the most dangerous key in the
    --   engine's vocabulary. Without these three, the only writer of a
    --   cross-player transfer is the client, which is the hole this whole
    --   program was opened to close.
    'hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)',
    'hr_market_cancel(uuid,integer,bigint,uuid,uuid)',
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)',
    -- ── ADDED 2026-08-16 — THE FIRST WRITER ADDED SINCE hr_apply ────────
    -- At the HEAD again, and for the same reason as the link above: an
    -- insertion removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim is made on the OTHER clause. It writes
    -- one player_progress unlock row, one player_state gold/version update and
    -- one player_ledger row. SELF-VALIDATING is what admits it, and concretely:
    -- its whole caller-supplied surface is ONE OFFER ID (a primary key in the
    -- generated, client-unwritable hr_unlock_offers) — no price, no quantity,
    -- no item, no rung, no timestamp; every number it writes comes from that
    -- table or from the character's own row read under the SAME advisory lock
    -- hr_apply takes; the row it writes is independently policed by the
    -- player_progress_unlock_guard trigger, which refuses an off-ladder rung, a
    -- regression and a mis-filed kind whatever this function proposes; and it
    -- is clamped per call (one rung) and per DAY (20 unlocks, counted from the
    -- append-only ledger), which is the dimension a rate limit does not bound.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT: hr_apply structurally
    -- cannot write a level ('unlock' is deliberately absent from its delta
    -- allowlist), so without this the only writer of a permanent capability is
    -- the client.
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-08-16 — TWO REVIEWED ENGINE READS ────────────────────
    -- At the HEAD, not appended: this array is DERIVED from
    -- 2026-08-11-grant-hygiene.sql by tools/derive-grant-hygiene.mjs, and an
    -- append would have to rewrite the previous last entry to add a comma —
    -- a MODIFIED line. An insertion removes nothing, which is why this chain's
    -- declared-removals list in PART 1f-ii is empty. Position carries no
    -- meaning here: check (7) tests membership with `<> all (...)`.
    --
    -- read-only (STABLE, and 2026-08-16-claim-reward.sql §4 asserts the
    -- declaration rather than trusting it) claim lookup for ONE character.
    -- SELF-VALIDATING in the dimension that matters: the period keys it reads
    -- are the server's own hr_utc_day_key(now()), never an argument, so the
    -- row set is structurally bounded to '' + today + yesterday and no call
    -- can widen it into a history scan. It adds NO TARGET the engine could
    -- not already reach — the engine already holds hr_apply(uuid,…) and
    -- hr_state_of(uuid,int), both of which take the same p_user — so this is
    -- strictly a narrower read of data hr_state_of's envelope is the peer of.
    'hr_claim_lookup(uuid,integer,text,text)',
    -- read-only permanent-capability read for one character: rooms, plots,
    -- property tier and unlocked recipes. Writes nothing and calls nothing
    -- that writes. On the list for the same reason hr_offline_cap_ms is —
    -- a perk multiplies a whole night's grant, so the engine must be TOLD its
    -- capabilities rather than compute them. Same target argument as above:
    -- p_user is a parameter the engine already passes to hr_apply.
    'hr_perks_of(uuid,integer)',
    -- the only writer; bounded by its own re-validation, which is the design
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    -- returns the post-write envelope for one character the engine was told to act for
    'hr_state_of(uuid,integer)',
    -- the accrual PRNG seed; returns a hash, never the 256-bit server secret
    'hr_seed(uuid,integer,text)',
    -- derived leaderboard value; read-only, one character
    'hr_total_level(uuid,integer)',
    -- pure function of its argument
    'hr_level_from_xp(bigint)',
    -- pure function of its argument
    'hr_xp_for_level(integer)',
    -- read-only, one integer, bounded at 24h by its own ceiling; on the list because
    -- capMs multiplies a whole night's grant, so the engine must not own its own cap
    'hr_offline_cap_ms(uuid,integer)',
    -- writes one UNLOGGED counter row for the user it was handed; on the list because
    -- the alternative, granting hr_rate_ok, lets the caller name its own limit
    'hr_rate_gate(uuid,integer,text)'
  ];
begin
  -- (1) PUBLIC=EXECUTE, asked directly.
  --     `proacl is null` is NOT "no grants" — it means the ACL is the hardwired
  --     acldefault('f', owner), which contains PUBLIC=X. That is the exact
  --     state a `create function` with no revoke lands in, so it is the single
  --     most important row of this whole function.
  select coalesce(jsonb_agg(format('%s(%s)', p.proname,
                                   pg_get_function_identity_arguments(p.oid))
                            order by p.proname), '[]'::jsonb)
    into v_public_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p')
     and (p.proacl is null or p.proacl::text ~ '(\{|,)=[a-zA-Z*]*X');

  -- (2) Client-executable and NOT approved. Covers anon and authenticated, and
  --     covers procedures, and covers a new overload of an approved name.
  select coalesce(jsonb_agg(format('%s(%s) → %s', x.proname, x.identity_args, x.grantee)
                            order by x.proname, x.grantee), '[]'::jsonb)
    into v_unapproved
    from (
      select p.proname, pg_get_function_identity_arguments(p.oid) as identity_args, g.grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated')) g(grantee)
       where n.nspname = 'public' and p.prokind in ('f','p')
         and has_function_privilege(g.grantee, p.oid, 'execute')
    ) x
   where not exists (select 1 from public.hr_client_rpc_baseline b
                      where b.proname = x.proname and b.identity_args = x.identity_args
                        and b.grantee = x.grantee);

  -- (3) An approved RPC that is no longer reachable. Not a security failure —
  --     a BROKEN FEATURE — so it is reported, loudly, and never fatal.
  select coalesce(jsonb_agg(format('%s(%s) → %s', b.proname, b.identity_args, b.grantee)
                            order by b.proname), '[]'::jsonb)
    into v_lost
    from public.hr_client_rpc_baseline b
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = b.proname
        and pg_get_function_identity_arguments(p.oid) = b.identity_args
        and has_function_privilege(b.grantee, p.oid, 'execute'));

  -- (4) TRUNCATE bypasses row-level security entirely, so RLS is not a backstop
  --     for it. No client ever needs TRUNCATE, REFERENCES or TRIGGER.
  --     b354 (Security C3) — WIDENED, and the second half is the interesting
  --     one. A client WRITE grant on a table that has RLS ON and NO WRITE
  --     POLICY AT ALL is a grant nothing intends to use: the only thing between
  --     it and the table is row-level security, and one `create policy` — or
  --     one `alter table ... disable row level security` typed during an
  --     incident — turns it into a client-writable table. Security found six of
  --     them live (hr_castle_*, hr_hunt_*): pure content catalogues carrying
  --     anon/authenticated INSERT/UPDATE/DELETE.
  --     WHY IT IS A BASELINE AND NOT A BAN: 21 further tables were in this class
  --     when the check was written (clan_*, world_event_*, raid_*, maintenance_*,
  --     display_names, leaderboard_meta) — all written only by SECURITY DEFINER
  --     RPCs, all dead grants, and none of them safe to sweep in the same change
  --     that introduced the detector. They are RECORDED in
  --     hr_client_write_baseline, which makes each one a claim somebody has to
  --     justify, and makes anything NEW fatal.
  --     service_role is deliberately NOT in the grantee list: Supabase's platform
  --     default grants it every privilege on every table in public, so including
  --     it would report all 40-odd tables and the check could never be strict.
  --     That is a platform posture and a separate program; stated here so its
  --     absence is a decision rather than an oversight.
  --     b350 (Security batch 5) — THE DETECTOR TAKEOVER. This query no longer
  --     reads information_schema.role_table_grants, which reports SQL-standard
  --     privileges ONLY: it cannot see MAINTAIN (the PG17 VACUUM/ANALYZE/CLUSTER/
  --     REINDEX/REFRESH privilege) and it OMITS materialized views entirely. Both
  --     are exactly where dead client write grants hid — 28 MAINTAIN pairs and the
  --     leaderboard_ranked matview were invisible to every nightly run.
  --     has_table_privilege over pg_class sees the full PG17 vocabulary AND every
  --     relkind. Two arms, the same meaning check (4) has always had:
  --       ARM 1 — a verb NO CLIENT EVER NEEDS, on ANY relation (table, partition
  --               or MATVIEW): TRUNCATE, REFERENCES, TRIGGER, and now MAINTAIN. A
  --               write policy is no defence against any of these, so the grant is
  --               a finding wherever it lives.
  --       ARM 2 — INSERT/UPDATE/DELETE on a table with RLS ON and NO write policy,
  --               minus hr_client_write_baseline. Unchanged. Matviews carry no RLS
  --               and cannot be written through any path, so an i/u/d bit on one is
  --               inert and deliberately NOT arm 2's business.
  --     PUBLIC is not enumerated separately: a grant to PUBLIC makes
  --     has_table_privilege true for anon AND authenticated, so it surfaces under
  --     both without a third grantee.
  select coalesce(jsonb_agg(distinct x.g order by x.g), '[]'::jsonb) into v_client_trunc from (
    select c.relname || ':' || gg || ':' || pv as g
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')
       and has_table_privilege(gg, c.oid, pv)
    union all
    select c.relname || ':' || gg || ':' || pv
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
       and c.relrowsecurity
       and has_table_privilege(gg, c.oid, pv)
       and not exists (select 1 from pg_policies pp
                        where pp.schemaname = 'public' and pp.tablename = c.relname
                          and pp.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       and not exists (select 1 from public.hr_client_write_baseline bl
                        where bl.table_name = c.relname and bl.grantee = gg)
  ) x;

  -- (5) D4 — THE POSITIVE ASSERTION. For every role that owns a function in
  --     public there must be a GLOBAL default-ACL row (defaclnamespace = 0)
  --     for functions, and it must grant EXECUTE to none of PUBLIC / anon /
  --     authenticated. Only a GLOBAL row replaces acldefault(); a schema-scoped
  --     one can only ADD to it, which is why the 2026-08-10 attempt at this
  --     changed nothing. Absence of the row IS the finding.
  select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb)
    into v_defacl_open
    from (select distinct p.proowner from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind in ('f','p')) o
    join pg_roles r on r.oid = o.proowner
   where not exists (
     select 1 from pg_default_acl d
      where d.defaclrole = o.proowner
        and d.defaclnamespace = 0
        and d.defaclobjtype = 'f'
        and not exists (
          select 1 from aclexplode(d.defaclacl) a
          left join pg_roles rr on rr.oid = a.grantee   -- grantee 0 = PUBLIC
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or rr.rolname in ('anon','authenticated'))));

  -- (6) Residual: platform-owned SCHEMA default ACLs we genuinely cannot edit
  --     (supabase_admin). Reported so the residual stays visible. This is the
  --     check revision 1 mistook for the real one — kept, demoted, labelled.
  select coalesce(jsonb_agg(d.defaclrole::regrole::text || ':' || n.nspname
                            order by d.defaclrole::regrole::text), '[]'::jsonb)
    into v_platform
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'f'
     and d.defaclacl::text ~ '(anon|authenticated)=[a-zA-Z*]*X';

  -- (7) S9 — hr_engine's EXECUTE surface, keyed on the FULL SIGNATURE and with
  --     no prokind filter, so an overload and a procedure are both visible.
  --     Skipped silently if the role does not exist: this file must stand alone
  --     on a database that has not had the server-authority bundle applied.
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
      into v_engine_extra
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and has_function_privilege('hr_engine', p.oid, 'execute')
       and p.oid::regprocedure::text <> all (c_engine_allow);
    -- "Zero table privileges" is the other half of the capability claim, and
    -- column grants are invisible to role_table_grants, so both are asked.
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_engine_tables from (
      select table_name || ':' || privilege_type as g
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'hr_engine'
      union all
      select table_name || '.' || column_name || ':' || privilege_type
        from information_schema.role_column_grants
       where table_schema = 'public' and grantee = 'hr_engine') x;
  else
    v_engine_extra  := '[]'::jsonb;
    v_engine_tables := '[]'::jsonb;
  end if;

  -- (8) A9 — every client-callable SECURITY DEFINER function must reference a
  --     rate gate. This is the RUNTIME twin of the static lint in
  --     tests/run-sql-tests.mjs, and it exists for one specific reason: the A9
  --     retrofit in 2026-08-11-authenticated-surface-lockdown.sql installs thin
  --     wrappers over renamed `__ungated` bodies, so RE-APPLYING an older
  --     migration that `create or replace`s a wrapped name would silently
  --     replace the wrapper with the ungated body and delete the gate. A repo
  --     lint cannot see that; this can, within a day.
  --     Matching on prosrc is deliberately crude — it proves the gate is
  --     MENTIONED, not that it is reached. It catches the whole class this is
  --     written for (a body that has never heard of a gate) and nothing subtler.
  select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
    into v_ungated
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p') and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.prosrc !~ 'hr_rpc_gate|hr_rate_gate|hr_rate_ok';

  -- (9) T-5 — hr_ops STAYS A SINK (2026-09-28). hr_ops holds the operator-only
  --     routines that read net._http_response, a table PUBLIC can read and our
  --     roles cannot revoke. Keeping hr_ops out of PostgREST's exposed list is
  --     half the property; the other half is that no client or engine role can
  --     USE the schema, CREATE in it, or EXECUTE anything in it — reachability
  --     is the arming condition. tests/pg-net-queue-unreachable.mjs Q-5 guards
  --     the repo; this asks the CATALOGUE, so a grant typed in the dashboard, by
  --     support or by a platform migration is a finding by the next nightly run.
  --     The roles are the six the sink was built against — PUBLIC, anon,
  --     authenticated, service_role, hr_engine, hr_tick — and the two LOGIN
  --     roles those are reached through before SET ROLE: authenticator
  --     (PostgREST) and hr_engine_login (the edge); both are NOINHERIT, so only
  --     a DIRECT grant to them reads here (Security, 2026-09-28). Superusers
  --     and pg_read_all_data (USAGE on every schema, no EXECUTE) are the owner
  --     class and are out of scope by construction. A role that does not
  --     exist is skipped (this file must stand alone), and so is a database
  --     with no hr_ops at all: no sink, nothing to reach. prokind is NOT
  --     filtered — a procedure or an aggregate in hr_ops is reachable too.
  if exists (select 1 from pg_namespace where nspname = 'hr_ops') then
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_ops_reach from (
      select 'schema:' || r.role || ':' || pv as g
        from (values ('public'),('anon'),('authenticated'),('service_role'),('hr_engine'),('hr_tick'),
                     ('authenticator'),('hr_engine_login')) r(role)
        cross join unnest(array['USAGE','CREATE']) pv
       where (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_schema_privilege(r.role, 'hr_ops', pv)
      union all
      select p.oid::regprocedure::text || ':' || r.role
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('public'),('anon'),('authenticated'),('service_role'),('hr_engine'),('hr_tick'),
                     ('authenticator'),('hr_engine_login')) r(role)
       where n.nspname = 'hr_ops'
         and (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_function_privilege(r.role, p.oid, 'execute')) x;
  else
    v_ops_reach := '[]'::jsonb;
  end if;

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform,
    'engine_execute_outside_allowlist',v_engine_extra,
    'engine_table_privileges',         v_engine_tables,
    'hr_ops_reachable',                v_ops_reach,
    'ungated_client_rpcs',             v_ungated);

  if jsonb_array_length(v_lost) > 0 then
    raise warning 'GRANT HYGIENE: % approved client RPC(s) are no longer reachable — %',
      jsonb_array_length(v_lost), v_lost::text;
  end if;

  if p_strict and (jsonb_array_length(v_public_exec) > 0
                or jsonb_array_length(v_unapproved) > 0
                or jsonb_array_length(v_client_trunc) > 0
                or jsonb_array_length(v_defacl_open) > 0
                or jsonb_array_length(v_engine_extra) > 0
                or jsonb_array_length(v_engine_tables) > 0
                or jsonb_array_length(v_ops_reach) > 0
                or jsonb_array_length(v_ungated) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
-- ⟦/DERIVED hr_assert_grant_hygiene⟧
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ── §8 GRANTS AND THE BASELINE ──────────────────────────────────────────────────────────────────────────────────────────
do $grants$
declare f text; r text;
begin
  foreach f in array array[
      'public.hr_gm_walled(uuid)', 'public.hr_gm_section(uuid,integer)', 'public.hr_chat_muted_until(uuid)', 'public.hr_gm_reason(text)',
      'public.hr_gm_open(uuid,text,uuid,integer,text,uuid)', 'public.hr_gm_close(uuid,text,uuid,integer,text,uuid,jsonb)',
      'public.hr_gm_wall_guard()', 'public.hr_gm_party_guard()', 'public.hr_gm_wall_quiet()', 'public.hr_chat_zgm_gate()', 'public.hr_whisper_zgm_gate()',
      'public.hr_gm_look_stamp()', 'public.hr_gm_account_guard()', 'public.hr_gm_account_hide()', 'public.hr_gm_log_immutable()',
      'public.hr_hunt_leave_pending(uuid,integer)', 'public.hr_gm_hero_idle(uuid,integer)',
      'public.hr_gm_online()', 'public.hr_gm_hero(text,integer)', 'public.hr_gm_mute(uuid,integer,text,uuid)', 'public.hr_gm_unmute(uuid,text,uuid)',
      'public.hr_gm_ban(uuid,text,uuid)', 'public.hr_gm_unban(uuid,text,uuid)', 'public.hr_gm_say(text,uuid)',
      'public.hr_gm_grant_gold(integer,bigint,text,uuid)', 'public.hr_gm_grant_item(integer,text,bigint,text,uuid)', 'public.hr_gm_grant_level(integer,integer,text,uuid)',
      'public.hr_gm_stop_gate(uuid,uuid,integer,text,uuid)', 'public.hr_gm_stop_result(uuid,uuid,integer,text)'] loop
    execute format('revoke all on function %s from public', f);
    foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = r) then execute format('revoke all on function %s from %I', f, r); end if;
    end loop;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    grant execute on function public.hr_gm_stop_gate(uuid, uuid, integer, text, uuid) to hr_engine;
    grant execute on function public.hr_gm_stop_result(uuid, uuid, integer, text) to hr_engine;
  end if;
end $grants$;
-- The one line per file tests/run-sql-tests.mjs reads for each function the do block above covers by name.
revoke execute on function public.hr_hunt_leave_pending(uuid, integer) from public;
-- The restated bodies keep their grants (CREATE OR REPLACE); none was ever reachable by PUBLIC, and these say so in this file too.
revoke execute on function public.hr_access_check() from public;
revoke execute on function public.hr_admitted(uuid) from public;
revoke execute on function public.hr_hunt_leave(integer, uuid) from public;
revoke execute on function public.hr_chat_send(integer, text, text) from public;
revoke execute on function public.hr_whisper_send(integer, text, text) from public;
revoke execute on function public.hr_play_net_of(uuid) from public;
revoke execute on function public.hr_play_net_note(uuid) from public;
revoke execute on function public.hr_hunt_member_state(uuid, integer) from public;
revoke execute on function public.hr_validate_display_name(text) from public;
revoke execute on function public.hr_gm_hero_idle(uuid, integer) from public;
revoke execute on function public.hr_gm_walled(uuid) from public;
revoke execute on function public.hr_gm_section(uuid, integer) from public;
revoke execute on function public.hr_chat_muted_until(uuid) from public;
revoke execute on function public.hr_gm_reason(text) from public;
revoke execute on function public.hr_gm_open(uuid, text, uuid, integer, text, uuid) from public;
revoke execute on function public.hr_gm_close(uuid, text, uuid, integer, text, uuid, jsonb) from public;
revoke execute on function public.hr_gm_wall_guard() from public;
revoke execute on function public.hr_gm_party_guard() from public;
revoke execute on function public.hr_gm_wall_quiet() from public;
revoke execute on function public.hr_chat_zgm_gate() from public;
revoke execute on function public.hr_whisper_zgm_gate() from public;
revoke execute on function public.hr_gm_look_stamp() from public;
revoke execute on function public.hr_gm_account_guard() from public;
revoke execute on function public.hr_gm_account_hide() from public;
revoke execute on function public.hr_gm_log_immutable() from public;
revoke execute on function public.hr_gm_stop_gate(uuid, uuid, integer, text, uuid) from public;
revoke execute on function public.hr_gm_stop_result(uuid, uuid, integer, text) from public;

revoke execute on function public.hr_gm_online() from public, anon, service_role;
grant execute on function public.hr_gm_online() to authenticated;
revoke execute on function public.hr_gm_hero(text, integer) from public, anon, service_role;
grant execute on function public.hr_gm_hero(text, integer) to authenticated;
revoke execute on function public.hr_gm_mute(uuid, integer, text, uuid) from public, anon, service_role;
grant execute on function public.hr_gm_mute(uuid, integer, text, uuid) to authenticated;
revoke execute on function public.hr_gm_unmute(uuid, text, uuid) from public, anon, service_role;
grant execute on function public.hr_gm_unmute(uuid, text, uuid) to authenticated;
revoke execute on function public.hr_gm_ban(uuid, text, uuid) from public, anon, service_role;
grant execute on function public.hr_gm_ban(uuid, text, uuid) to authenticated;
revoke execute on function public.hr_gm_unban(uuid, text, uuid) from public, anon, service_role;
grant execute on function public.hr_gm_unban(uuid, text, uuid) to authenticated;
revoke execute on function public.hr_gm_say(text, uuid) from public, anon, service_role;
grant execute on function public.hr_gm_say(text, uuid) to authenticated;
revoke execute on function public.hr_gm_grant_gold(integer, bigint, text, uuid) from public, anon, service_role;
grant execute on function public.hr_gm_grant_gold(integer, bigint, text, uuid) to authenticated;
revoke execute on function public.hr_gm_grant_item(integer, text, bigint, text, uuid) from public, anon, service_role;
grant execute on function public.hr_gm_grant_item(integer, text, bigint, text, uuid) to authenticated;
revoke execute on function public.hr_gm_grant_level(integer, integer, text, uuid) from public, anon, service_role;
grant execute on function public.hr_gm_grant_level(integer, integer, text, uuid) to authenticated;

delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname like 'hr\_gm\_%';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_gm_online', '', 'authenticated', 'added 2027-03-05 (gm-tools): who plays; refuses anyone but a walled GM account'),
  ('hr_gm_hero', 'p_target text, p_slot integer', 'authenticated', 'added 2027-03-05 (gm-tools): one hero, no email, address or network hash; refuses anyone but a walled GM account'),
  ('hr_gm_mute', 'p_target uuid, p_minutes integer, p_reason text, p_idem uuid', 'authenticated', 'added 2027-03-05 (gm-tools): mutes an account''s chat; refuses anyone but a walled GM account; journalled'),
  ('hr_gm_unmute', 'p_target uuid, p_reason text, p_idem uuid', 'authenticated', 'added 2027-03-05 (gm-tools): lifts a mute; refuses anyone but a walled GM account; journalled'),
  ('hr_gm_ban', 'p_target uuid, p_reason text, p_idem uuid', 'authenticated', 'added 2027-03-05 (gm-tools): bans an account through hr_admitted; refuses anyone but a walled GM account; journalled'),
  ('hr_gm_unban', 'p_target uuid, p_reason text, p_idem uuid', 'authenticated', 'added 2027-03-05 (gm-tools): lifts a ban; refuses anyone but a walled GM account; journalled'),
  ('hr_gm_say', 'p_body text, p_idem uuid', 'authenticated', 'added 2027-03-05 (gm-tools): one server-wide line, stamped Game Master; refuses anyone but a walled GM account; journalled'),
  ('hr_gm_grant_gold', 'p_slot integer, p_amount bigint, p_reason text, p_idem uuid', 'authenticated', 'added 2027-03-05 (gm-tools): MONEY, the caller''s own walled account only (no account argument); clamped; refuses everyone else'),
  ('hr_gm_grant_item', 'p_slot integer, p_item text, p_qty bigint, p_reason text, p_idem uuid', 'authenticated', 'added 2027-03-05 (gm-tools): MONEY, the caller''s own walled account only (no account argument); clamped; refuses everyone else'),
  ('hr_gm_grant_level', 'p_slot integer, p_level integer, p_reason text, p_idem uuid', 'authenticated', 'added 2027-03-05 (gm-tools): XP, the caller''s own walled account only (no account argument); raise-only, clamped; refuses everyone else');

-- ── §9 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ─────────────────────────────────────────────────────
do $mig$
declare
  c_gm   constant uuid := '000000c9-0000-4000-a000-00000000e001';
  c_real constant uuid := '000000c9-0000-4000-a000-00000000e002';
  c_gms constant text[] := array['hr_gm_online()', 'hr_gm_hero(text,integer)', 'hr_gm_mute(uuid,integer,text,uuid)', 'hr_gm_unmute(uuid,text,uuid)',
    'hr_gm_ban(uuid,text,uuid)', 'hr_gm_unban(uuid,text,uuid)', 'hr_gm_say(text,uuid)', 'hr_gm_grant_gold(integer,bigint,text,uuid)',
    'hr_gm_grant_item(integer,text,bigint,text,uuid)', 'hr_gm_grant_level(integer,integer,text,uuid)'];
  c_deny constant text[] := array['hr_chat_send', 'hr_whisper_send', 'hr_friend_request', 'hr_friend_answer', 'hr_friend_remove', 'hr_block_set',
    'hr_hunt_party_invite', 'hr_hunt_party_invite_player', 'hr_hunt_party_join', 'hr_hunt_party_list', 'hr_party_seek', 'hr_hearth_burn',
    'hr_claim_discord_gift', 'hr_companion_grant', 'hr_buy_gem_unlock'];
  c_auth constant text[] := array['hr_gm_walled(uuid)', 'hr_gm_open(uuid,text,uuid,integer,text,uuid)', 'hr_gm_close(uuid,text,uuid,integer,text,uuid,jsonb)',
    'hr_gm_stop_gate(uuid,uuid,integer,text,uuid)', 'hr_gm_stop_result(uuid,uuid,integer,text)', 'hr_hunt_leave_pending(uuid,integer)'];
  t text; v jsonb; v_n int; v_err text; v_ok boolean; v_before bigint; v_colors jsonb;
begin
  -- k1 no client or engine role writes a table here; RLS is on; the log has no policy; the two engine functions are the engine's alone.
  foreach t in array array['hr_gm_accounts', 'hr_bans', 'hr_chat_mutes', 'hr_gm_wall_allow', 'hr_gm_log'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then raise exception 'gm-tools §9 k1: RLS is off on %', t; end if;
    if has_table_privilege('authenticated', 'public.' || t, 'insert,update,delete,truncate') or has_table_privilege('anon', 'public.' || t, 'select,insert,update,delete,truncate')
       or (exists (select 1 from pg_roles where rolname = 'hr_engine') and has_table_privilege('hr_engine', 'public.' || t, 'select,insert,update,delete,truncate')) then
      raise exception 'gm-tools §9 k1: a client or engine role can touch %', t; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('hr_gm_log', 'hr_chat_mutes')) then
    raise exception 'gm-tools §9 k1: the log or the mutes carry a policy'; end if;
  if has_table_privilege('authenticated', 'public.hr_gm_log', 'select') or has_table_privilege('authenticated', 'public.hr_chat_mutes', 'select') then
    raise exception 'gm-tools §9 k1: a client can read the log or the mutes'; end if;
  if has_column_privilege('authenticated', 'public.hr_gm_accounts', 'note', 'select') then raise exception 'gm-tools §9 k1: a client can read the GM note'; end if;

  -- k2 the grants are exact.
  foreach t in array c_gms loop
    if not has_function_privilege('authenticated', 'public.' || t, 'execute') or has_function_privilege('anon', 'public.' || t, 'execute')
       or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = ('public.' || t)::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'gm-tools §9 k2: % is not exactly authenticated', t; end if;
  end loop;
  foreach t in array c_auth loop
    if has_function_privilege('authenticated', 'public.' || t, 'execute') or has_function_privilege('anon', 'public.' || t, 'execute') then
      raise exception 'gm-tools §9 k2: % is client-executable', t; end if;
  end loop;

  -- k3 the door's list decides: every named shared verb is off it.
  select string_agg(a.rpc, ', ') into v_err from public.hr_gm_wall_allow a where a.rpc = any (c_deny);
  if v_err is not null then raise exception 'gm-tools §9 k3: a shared verb is on the walled account''s list: %', v_err; end if;

  -- k4 BEHAVIOUR, as the role PostgREST uses, every row rolled back.
  begin
    insert into auth.users (id) values (c_gm), (c_real) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_gm, 'gm-tools §9'), (c_real, 'gm-tools §9') on conflict (user_id) do nothing;
    insert into public.hr_gm_accounts (user_id, note) values (c_gm, 'gm-tools §9');
    if not exists (select 1 from public.hr_lb_hidden h where h.user_id = c_gm and h.slot is null) then raise exception 'gm-tools §9 k4: the GM row did not hide the account from the boards'; end if;
    select jsonb_build_object('head', min(d.idx), 'body', min(d.idx), 'legs', min(d.idx), 'feet', min(d.idx)) into v_colors from public.hr_outfit_dyes d;

    -- a stranger: one answer, whatever it sends, and a journal row.
    perform set_config('request.headers', '{"cf-connecting-ip":"198.51.100.91"}', true);
    perform set_config('request.jwt.claim.sub', c_real::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_real, 'role', 'authenticated')::text, true);
    perform set_config('request.path', '/rpc/hr_create_hero', true);
    set local role authenticated;
    v := public.hr_create_hero(0, 'Selfcheckreal', v_colors, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'gm-tools §9 k4: a real hero was refused: %', v; end if;
    if public.hr_gm_online() is distinct from '{"ok":false,"error":"refused"}'::jsonb
       or public.hr_gm_ban(c_gm, 'a forged reason', gen_random_uuid()) is distinct from '{"ok":false,"error":"refused"}'::jsonb
       or public.hr_gm_grant_gold(0, 1, 'a forged reason', gen_random_uuid()) is distinct from '{"ok":false,"error":"refused"}'::jsonb then
      raise exception 'gm-tools §9 k4: a stranger was answered something else'; end if;
    reset role;
    if (select count(*) from public.hr_gm_log l where l.actor = c_real and l.outcome = 'refused') <> 3 then raise exception 'gm-tools §9 k4: a refused stranger left no journal row'; end if;
    if public.hr_gm_stop_gate(c_real, c_real, 0, 'a forged reason', gen_random_uuid()) is distinct from '{"ok":false,"error":"refused"}'::jsonb then
      raise exception 'gm-tools §9 k4: the engine gate let a stranger through'; end if;

    -- the GM: the door refuses a shared verb, an unlisted name and a table; the list passes.
    perform set_config('request.jwt.claim.sub', c_gm::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_gm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    foreach t in array array['/rpc/hr_chat_send', '/rpc/hr_friend_request', '/rpc/hr_nothing_decided', '/chat_messages', ''] loop
      perform set_config('request.path', t, true);
      v_ok := false;
      begin
        perform public.hr_access_check();
      exception when sqlstate 'PGRST' then v_ok := position('hr_gm_walled' in sqlerrm) > 0;
      end;
      if not v_ok then raise exception 'gm-tools §9 k4: the door let a walled account reach "%"', t; end if;
    end loop;
    perform set_config('request.path', '/rpc/hr_create_hero', true);
    perform public.hr_access_check();
    v := public.hr_create_hero(0, 'Selfcheckgm', v_colors, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'gm-tools §9 k4: a walled hero was refused: %', v; end if;

    -- a grant lands in the ledger and the log; a replay moves nothing.
    perform set_config('request.path', '/rpc/hr_gm_grant_gold', true);
    v := public.hr_gm_grant_gold(0, 500, 'self-check', '000000c9-0000-4000-a000-00000000e101');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'gm-tools §9 k4: a grant was refused: %', v; end if;
    reset role;
    select w.gold into v_before from public.account_wallet w where w.user_id = c_gm;
    if not exists (select 1 from public.player_ledger l where l.user_id = c_gm and l.intent = 'gm_grant:gold' and l.gold = 500) then raise exception 'gm-tools §9 k4: the grant left no ledger row'; end if;
    set local role authenticated;
    v := public.hr_gm_grant_gold(0, 500, 'self-check', '000000c9-0000-4000-a000-00000000e101');
    reset role;
    if (select w.gold from public.account_wallet w where w.user_id = c_gm) <> v_before then raise exception 'gm-tools §9 k4: a replay paid twice'; end if;

    -- past the door, the row lock: as if the hook were lost.
    perform set_config('request.path', '/rpc/hr_chat_send', true);
    v_ok := false;
    begin
      insert into public.friend_requests (from_id, to_id) values (c_real, c_gm);
    exception when sqlstate 'HR000' then v_ok := sqlerrm = 'gm_walled';
    end;
    if not v_ok then raise exception 'gm-tools §9 k4: a friend ask crossed the wall'; end if;

    -- a ban shuts hr_admitted, and the notice says so.
    perform set_config('request.path', '/rpc/hr_gm_ban', true);
    set local role authenticated;
    v := public.hr_gm_ban(c_real, 'self-check', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'gm-tools §9 k4: a ban was refused: %', v; end if;
    perform set_config('request.jwt.claim.sub', c_real::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_real, 'role', 'authenticated')::text, true);
    v_err := null;
    begin
      perform public.hr_access_check();
    exception when sqlstate 'PGRST' then v_err := sqlerrm;
    end;
    reset role;
    if v_err is null or position('hr_banned' in v_err) = 0 then raise exception 'gm-tools §9 k4: a banned account was not told (%)', v_err; end if;
    if public.hr_rate_gate(c_real, 0, 'accrue') then raise exception 'gm-tools §9 k4: the engine door let a banned account in'; end if;

    -- the walled heroes have no network, and the log refuses a rewrite.
    if public.hr_play_net_of(c_gm) is not null then raise exception 'gm-tools §9 k4: a walled hero has a network'; end if;
    v_ok := false;
    begin
      delete from public.hr_gm_log where actor = c_gm;
    exception when check_violation then v_ok := true;
    end;
    if not v_ok then raise exception 'gm-tools §9 k4: the log took a delete'; end if;

    raise exception using errcode = 'HR979', message = 'gm-tools §9 complete - rolling back';
  exception when sqlstate 'HR979' then
    null;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.headers', '', true);
  perform set_config('request.path', '', true);

  -- k5 the probes are gone; grant hygiene holds with the new client and engine functions.
  if exists (select 1 from auth.users where id in (c_gm, c_real)) or exists (select 1 from public.hr_gm_log where actor in (c_gm, c_real)) then
    raise exception 'gm-tools §9 k5: a probe row leaked'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'gm-tools: one row is the powers and the wall; a stranger hears one answer; the door and the row both refuse; all green';
end $mig$;
