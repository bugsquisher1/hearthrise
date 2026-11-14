-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-22-faction-standing.sql — THE TWO FACTIONS ON THE SERVER: JOIN AFTER KRELL, STANDING FROM SETTLED HUNTING TIME, A SWAP THAT
--   COSTS TEN HOURS, PIECES THAT STANDING BUYS (lane/c-faction-standing, backend-architect, 2026-11-14; Tyler 2026-11-14: the First Flame
--   and the Last Ember, neither evil, Havora neutral, no stat buff, standing buys looks only, a swap "like 10 hours of hunting something
--   with a week cooldown"; the board's "2026-11-14 The Morrow Hills" §6; src/data/factions.js).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §7. ON THE EA SECURITY LIST (a ranked surface later: the weekly banner reads standing). HIDDEN: no client calls a verb yet, no
-- state section is registered, and nothing can move: joining needs a Krell kill and his hall is staged; no open ground pays standing.
-- ORDER: right after 2027-04-22-faction-catalogue.generated.sql (§0 refuses without it). EDGE: none. The engine sends nothing new; the
-- credit reads the server's own window. The hr-accrue bundle moves only by data bytes (the hunt rows' `region`), no engine code.
--
-- ── THE CONTRACT ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Every verb: (p_slot int, ..., p_idem uuid) -> jsonb, authenticated, rate bucket `outfit`, the hero's lock (hr_hunt_lock, the settle's own),
-- the key read before the lock AND after it, the answer stored under the key on success. A refusal moves nothing and is noted.
--   hr_faction_join(p_slot, p_faction, p_idem)       refuses unknown_faction, already_joined, join_locked { monster, kills }.
--   hr_faction_swap_start(p_slot, p_faction, p_idem) refuses not_member, unknown_faction, same_faction, swap_open, swap_cooldown { ready_at }.
--   hr_faction_swap_finish(p_slot, p_idem)           refuses not_member, no_swap, swap_short { need_ms, have_ms }.
--   hr_faction_outfit_claim(p_slot, p_piece, p_idem) refuses unknown_piece, piece_owned, standing_short { need_ms, have_ms }.
--   Common refusals: not_signed_in, bad_slot, bad_idem, rate_limited, no_character, catalogue_missing.
--   ok: { ok, faction: hr_faction_view } (the hero's side, its open swap, its standing per side, today's credited time, the pieces).
-- hr_faction_credit(user, slot, hunt, from, to): no client role. Called ONCE per hr_hunt_settle_session (§5, one splice before the session
--   clock moves), on the window the settle itself proved: [settled_to, the end or `to`]. One primary-key probe of hr_faction_grounds; a
--   ground that pays nobody (every ground built today) returns there. Else: a member on its own side's ground gains standing, a member with
--   an open swap on the new side's ground gains swap time (capped at the swap's need), anything else nothing. Split at UTC midnights, each
--   day's part clamped so a hero's standing and swap time together never pass hr_faction_rule.day_cap_ms in a UTC day.
--
-- ── TABLES ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
--   hr_faction_members   (user, slot) -> faction, joined_at, changed_at (the cooldown's anchor), swap_to, swap_at, swap_ms.
--   hr_faction_standing  (user, slot, faction) -> ms. RAISE-ONLY (trigger): never lowered, never re-keyed. Kept across a swap.
--   hr_faction_days      (user, slot, UTC day, faction) -> ms, swap_ms. RAISE-ONLY. The day's clamp reads it, and it is the journal of
--                        every standing and swap credit: ONE row per hero per day per side, never one per settle (the 10 s settle would
--                        write 8,640 a day; game_events reached 1.6M rows from six players by journalling per tick).
--   hr_faction_claims    (user, slot, piece) -> faction, standing_ms at the claim, claimed_at.
--   hr_faction_ledger    APPEND-ONLY (trigger: no update, no delete): every join, swap start, swap finish and claim, with the key.
--                        Bounded by the verbs (one join, a swap a week, a claim a piece), so it needs no prune.
-- All five: RLS on, no policy, no client grant. Per hero by construction: only these SECURITY DEFINER functions touch them, each on the
-- caller's own (auth.uid(), slot) under its lock. The read a page will use is hr_faction_view, registered as a section by the client lane.
--
-- ── CONCURRENCY AND IDEMPOTENCY ───────────────────────────────────────────────────────────────────────────────────────────────
-- One lock orders everything a hero's factions do: hr_hunt_lock(user, slot), which every verb takes and the settle already holds when it
-- credits. So a join, a swap step or a claim and a settle of the same hero are serial: a swap finished between two settles moves the next
-- window's credit to the new side, never half of one. The key is read before the lock (the cheap replay) and again after it, so a second
-- press of one key that waited on the first answers the first's receipt and moves nothing (2027-04-19-key-under-lock.sql's lesson).
-- The ledger's (user, idem) is unique: one journal row per key, whatever happens above it.
--
-- ── EXPLOIT SURFACE DELTA ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Four client verbs that move no gold, no item, no XP and no power (no stat buff, by ruling): a side, a swap clock, a cosmetic claim. No
-- verb takes a number: the join reads the hero's server-counted kills (player_progress ev:kill_monster:<join monster>, written only by
-- hr_apply from the engine's settle); a claim reads standing; a finish reads swap time; the cooldown reads changed_at; every clock is now().
-- Standing is credited only inside the settle, from the window the settle itself validated, on a catalogue row a migration wrote: the engine
-- can't name a number, a side or a ground for it. The day's clamp bounds even a window counted twice. What crosses to another player later
-- (the weekly banner's totals) reads these server rows, never a client value. KNOWN: a GM test hero (hr_gm_*) can earn standing like any
-- hero; the weekly event, when it is built, must read through the GM wall like the boards (EA Security list).
--
-- ── COST (100x players: 600 heroes) ───────────────────────────────────────────────────────────────────────────────────────────
-- Per settle of ANY hunt: one primary-key probe of hr_faction_grounds (empty today). On a paying ground: one member read under the held
-- lock, one day-row sum (one or two days), one upsert of the day row and one of the standing (or the member's swap time). Rows: members and
-- standing at most 600 and 1,200; days one per hero per hunting day per side, about 600 a day, 219k a year (~25 MB with its index), the
-- only table that grows with time; ledger a few rows per hero a week. No row per settle anywhere.
--
-- REVERSIBILITY: re-apply hr_hunt_settle_session's pre-image (§5's anchor out: 2027-04-20-boss-hall.sql §2 is the last body), drop the four
-- verbs and their baseline rows, hr_faction_view, hr_faction_credit, the triggers and their functions, then the five tables. No player value
-- moves with them (standing buys looks only). No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
-- hr_hunt_settle_session is exactly the image it was written against (production's, tests/live-hash-drift.baseline.json, equal to the
-- replay's: 2027-04-20-boss-hall.sql's post image), or this file's own (a second apply): md5 of pg_get_functiondef, whitespace runs as one.
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hr_faction_rule') is null or to_regclass('public.hr_factions') is null or to_regclass('public.hr_faction_grounds') is null
     or to_regclass('public.hr_faction_outfits') is null then
    raise exception 'PRECONDITION: apply 2027-04-22-faction-catalogue.generated.sql first'; end if;
  if to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_title_kills(uuid,integer,text[])') is null or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null
     or to_regclass('public.hr_client_rpc_baseline') is null or to_regclass('public.player_intents') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 is distinct from 'ddb5c049e8eeec6788f63561ca08a664' and v_md5 is distinct from '959b4a30a0617ae08033a632bdd5c6b7' then
    raise exception 'PIN: hr_hunt_settle_session is neither its live pre-image nor this file''s image: md5 % - another file moved it', v_md5; end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.hr_faction_members (
  user_id    uuid not null,
  slot       int  not null,
  faction    text not null references public.hr_factions (faction_id),
  joined_at  timestamptz not null default now(),
  changed_at timestamptz not null default now(),
  swap_to    text references public.hr_factions (faction_id),
  swap_at    timestamptz,
  swap_ms    bigint not null default 0 check (swap_ms >= 0),
  primary key (user_id, slot),
  constraint hr_faction_members_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade,
  constraint hr_faction_members_swap_ck check ((swap_to is null) = (swap_at is null) and swap_to is distinct from faction
                                               and (swap_to is not null or swap_ms = 0))
);
create table if not exists public.hr_faction_standing (
  user_id    uuid not null,
  slot       int  not null,
  faction    text not null references public.hr_factions (faction_id),
  ms         bigint not null default 0 check (ms >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot, faction),
  constraint hr_faction_standing_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
create table if not exists public.hr_faction_days (
  user_id uuid not null,
  slot    int  not null,
  day     date not null,
  faction text not null references public.hr_factions (faction_id),
  ms      bigint not null default 0 check (ms >= 0),
  swap_ms bigint not null default 0 check (swap_ms >= 0),
  primary key (user_id, slot, day, faction),
  constraint hr_faction_days_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
create table if not exists public.hr_faction_claims (
  user_id     uuid not null,
  slot        int  not null,
  piece_id    text not null check (piece_id ~ '^[a-z0-9_]{1,32}$'),
  faction     text not null,
  standing_ms bigint not null check (standing_ms >= 0),
  claimed_at  timestamptz not null default now(),
  primary key (user_id, slot, piece_id),
  constraint hr_faction_claims_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
-- No key to player_state, like player_ledger: history outlives nothing it could be cascaded away with.
create table if not exists public.hr_faction_ledger (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  slot        int  not null,
  at          timestamptz not null default now(),
  kind        text not null check (kind in ('join', 'swap_start', 'swap_finish', 'claim')),
  faction     text not null,
  piece_id    text,
  standing_ms bigint,
  swap_ms     bigint,
  idem        uuid not null
);
create unique index if not exists hr_faction_ledger_once on public.hr_faction_ledger (user_id, idem);
create index if not exists hr_faction_ledger_hero on public.hr_faction_ledger (user_id, slot, at);

do $$
declare t text;
begin
  foreach t in array array['hr_faction_members', 'hr_faction_standing', 'hr_faction_days', 'hr_faction_claims', 'hr_faction_ledger'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;
comment on table public.hr_faction_members is '2027-04-22-faction-standing.sql: a hero''s side and its open swap. Written only by the faction verbs and the settle''s credit (swap time). RLS on, no policy, no client grant.';
comment on table public.hr_faction_standing is '2027-04-22-faction-standing.sql: a hero''s standing per side, in ms of settled hunting time. RAISE-ONLY. Written only by hr_faction_credit.';
comment on table public.hr_faction_days is '2027-04-22-faction-standing.sql: the standing and swap time credited per hero per UTC day per side: the day''s clamp and the credit''s journal. RAISE-ONLY.';
comment on table public.hr_faction_claims is '2027-04-22-faction-standing.sql: the pieces a hero claimed with its standing. Written only by hr_faction_outfit_claim.';
comment on table public.hr_faction_ledger is '2027-04-22-faction-standing.sql: APPEND-ONLY journal of every join, swap step and claim, one row per key.';

-- RAISE-ONLY: a standing or a day row is never lowered and never re-keyed. Deletes are the hero's own cascade (and the declared wipe).
create or replace function public.hr_faction_raise_only()
returns trigger language plpgsql set search_path = public, pg_catalog as $fn$
declare n jsonb := to_jsonb(new); o jsonb := to_jsonb(old); c_counts constant text[] := array['ms', 'swap_ms', 'updated_at'];
begin
  -- One function for both tables: every column but the counts (and the stamp) is the row's key.
  if (n - c_counts) is distinct from (o - c_counts) then
    raise exception '% is keyed for good (attempted to move a row)', tg_table_name using errcode = 'check_violation'; end if;
  if (n->>'ms')::bigint < (o->>'ms')::bigint or coalesce((n->>'swap_ms')::bigint, 0) < coalesce((o->>'swap_ms')::bigint, 0) then
    raise exception '% only rises (attempted to lower a row)', tg_table_name using errcode = 'check_violation'; end if;
  return new;
end $fn$;
drop trigger if exists hr_faction_standing_raise_only on public.hr_faction_standing;
create trigger hr_faction_standing_raise_only before update on public.hr_faction_standing for each row execute function public.hr_faction_raise_only();
drop trigger if exists hr_faction_days_raise_only on public.hr_faction_days;
create trigger hr_faction_days_raise_only before update on public.hr_faction_days for each row execute function public.hr_faction_raise_only();

-- APPEND-ONLY: no row of the journal is edited or removed. (TRUNCATE is the owner's alone: no client role holds it, and the declared wipe
-- empties every hero table with it.)
create or replace function public.hr_faction_ledger_immutable()
returns trigger language plpgsql set search_path = public, pg_catalog as $fn$
begin
  raise exception 'hr_faction_ledger is append-only (attempted %)', tg_op using errcode = 'check_violation';
end $fn$;
drop trigger if exists hr_faction_ledger_immutable on public.hr_faction_ledger;
create trigger hr_faction_ledger_immutable before update or delete on public.hr_faction_ledger for each row execute function public.hr_faction_ledger_immutable();
revoke execute on function public.hr_faction_raise_only() from public, anon, authenticated, service_role;
revoke execute on function public.hr_faction_ledger_immutable() from public, anon, authenticated, service_role;

-- ── §2 THE READ ──────────────────────────────────────────────────────────────
create or replace function public.hr_faction_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare r public.hr_faction_rule%rowtype; m public.hr_faction_members%rowtype; v_day date := (now() at time zone 'UTC')::date;
begin
  select * into r from public.hr_faction_rule where id;
  if not found then return null; end if;
  select * into m from public.hr_faction_members x where x.user_id = p_user and x.slot = p_slot;
  return jsonb_build_object(
    'faction', m.faction,
    'can_join', m.faction is null and public.hr_title_kills(p_user, p_slot, array[r.join_monster]) > 0,
    'joined_at', m.joined_at,
    'swap', case when m.swap_to is null then null else jsonb_build_object('to', m.swap_to, 'started_at', m.swap_at, 'ms', m.swap_ms, 'need_ms', r.swap_ms) end,
    'swap_ready_at', case when m.faction is null then null else m.changed_at + make_interval(secs => r.cooldown_ms / 1000.0) end,
    'standing', (select coalesce(jsonb_object_agg(f.faction_id, coalesce(s.ms, 0) order by f.ord), '{}'::jsonb)
                   from public.hr_factions f left join public.hr_faction_standing s on s.user_id = p_user and s.slot = p_slot and s.faction = f.faction_id),
    'today_ms', (select coalesce(sum(d.ms + d.swap_ms), 0) from public.hr_faction_days d where d.user_id = p_user and d.slot = p_slot and d.day = v_day),
    'day_cap_ms', r.day_cap_ms,
    'pieces', (select coalesce(jsonb_agg(jsonb_build_object('id', o.piece_id, 'faction', o.faction, 'need_ms', o.need_ms,
                                                            'held', exists (select 1 from public.hr_faction_claims c
                                                                             where c.user_id = p_user and c.slot = p_slot and c.piece_id = o.piece_id))
                                         order by o.ord), '[]'::jsonb)
                 from public.hr_faction_outfits o));
end $fn$;
revoke execute on function public.hr_faction_view(uuid, int) from public, anon, authenticated, service_role;

-- ── §3 THE CREDIT (the settle's, never a client's) ───────────────────────────
create or replace function public.hr_faction_credit(p_user uuid, p_slot int, p_hunt text, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_side text; m public.hr_faction_members%rowtype; r public.hr_faction_rule%rowtype; v_swap boolean;
  v_a timestamptz; v_b timestamptz; v_day date; v_ms bigint; v_used bigint; v_take bigint; v_room bigint; v_total bigint := 0;
begin
  -- THE COMMON CASE, ONE PRIMARY-KEY PROBE: a ground that pays nobody.
  select g.faction into v_side from public.hr_faction_grounds g where g.hunt_id = p_hunt;
  if v_side is null or p_from is null or p_to is null or p_to <= p_from then return null; end if;
  select * into m from public.hr_faction_members x where x.user_id = p_user and x.slot = p_slot for update;
  if not found then return null; end if;
  if m.faction = v_side then v_swap := false;
  elsif m.swap_to = v_side then v_swap := true;
  else return null; end if;
  select * into r from public.hr_faction_rule where id;
  if not found then return null; end if;
  v_room := case when v_swap then greatest(0, r.swap_ms - m.swap_ms) else null end;
  v_a := p_from;
  while v_a < p_to and (v_room is null or v_total < v_room) loop
    v_day := (v_a at time zone 'UTC')::date;
    v_b := least(p_to, (v_day + 1)::timestamp at time zone 'UTC');
    v_ms := floor(extract(epoch from (v_b - v_a)) * 1000)::bigint;
    select coalesce(sum(d.ms + d.swap_ms), 0) into v_used from public.hr_faction_days d
     where d.user_id = p_user and d.slot = p_slot and d.day = v_day;
    v_take := greatest(0, least(v_ms, r.day_cap_ms - v_used, coalesce(v_room - v_total, v_ms)));
    if v_take > 0 then
      insert into public.hr_faction_days as d (user_id, slot, day, faction, ms, swap_ms)
        values (p_user, p_slot, v_day, v_side, case when v_swap then 0 else v_take end, case when v_swap then v_take else 0 end)
        on conflict (user_id, slot, day, faction) do update set ms = d.ms + excluded.ms, swap_ms = d.swap_ms + excluded.swap_ms;
      v_total := v_total + v_take;
    end if;
    v_a := v_b;
  end loop;
  if v_total = 0 then return jsonb_build_object('side', v_side, 'swap', v_swap, 'ms', 0); end if;
  if v_swap then
    update public.hr_faction_members set swap_ms = swap_ms + v_total where user_id = p_user and slot = p_slot;
  else
    insert into public.hr_faction_standing as s (user_id, slot, faction, ms, updated_at) values (p_user, p_slot, v_side, v_total, now())
      on conflict (user_id, slot, faction) do update set ms = s.ms + excluded.ms, updated_at = excluded.updated_at;
  end if;
  return jsonb_build_object('side', v_side, 'swap', v_swap, 'ms', v_total);
end $fn$;
revoke execute on function public.hr_faction_credit(uuid, int, text, timestamptz, timestamptz) from public, anon, authenticated, service_role;

-- ── §4 THE VERBS ─────────────────────────────────────────────────────────────
-- Each verb opens the same way, in its own body (the A9 lint reads each client verb for its gate): who, which hero, which key, the replay,
-- the gate. Then this, the shared half: the hero's lock, the key again under it, the hero, the catalogue. Answers a refusal or null (go on).
create or replace function public.hr_faction_locked(p_verb text, p_uid uuid, p_slot int, p_idem uuid, p_intent text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_r jsonb;
begin
  perform public.hr_hunt_lock(p_uid, p_slot);
  -- THE KEY UNDER THE LOCK: a second press of one key that waited here answers the first's receipt.
  v_r := public.hr_intent_replay(p_uid, p_slot, p_idem, p_intent);
  if v_r is not null then return public.hr_note_rejection(p_verb, p_slot, v_r); end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = p_uid and ps.slot = p_slot) then
    return public.hr_note_rejection(p_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if not exists (select 1 from public.hr_faction_rule where id) then
    return public.hr_note_rejection(p_verb, p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  return null;
end $fn$;

-- The shared close: the journal row, the receipt under the key, the answer.
create or replace function public.hr_faction_done(p_uid uuid, p_slot int, p_idem uuid, p_intent text, p_kind text, p_faction text, p_piece text,
                                                 p_standing bigint, p_swap bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_r jsonb;
begin
  insert into public.hr_faction_ledger (user_id, slot, kind, faction, piece_id, standing_ms, swap_ms, idem)
    values (p_uid, p_slot, p_kind, p_faction, p_piece, p_standing, p_swap, p_idem);
  v_r := jsonb_build_object('ok', true, 'faction', public.hr_faction_view(p_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at) values (p_uid, p_idem, p_slot, p_intent, v_r, now());
  return v_r;
end $fn$;
revoke execute on function public.hr_faction_locked(text, uuid, int, uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_faction_done(uuid, int, uuid, text, text, text, text, bigint, bigint) from public, anon, authenticated, service_role;

create or replace function public.hr_faction_join(p_slot int, p_faction text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'faction_join';
  v_uid uuid := auth.uid(); v_intent text := c_verb || ':' || coalesce(left(p_faction, 32), '-'); v_r jsonb; v_monster text; v_kills bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_intent);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_r := public.hr_faction_locked(c_verb, v_uid, p_slot, p_idem, v_intent);
  if v_r is not null then return v_r; end if;
  if p_faction is null or not exists (select 1 from public.hr_factions f where f.faction_id = p_faction) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_faction')); end if;
  if exists (select 1 from public.hr_faction_members m where m.user_id = v_uid and m.slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'already_joined')); end if;
  -- KRELL FIRST: the hero's own server-counted kills of the rule's monster, never a number the caller sends.
  select join_monster into v_monster from public.hr_faction_rule where id;
  v_kills := public.hr_title_kills(v_uid, p_slot, array[v_monster]);
  if v_kills < 1 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'join_locked', 'monster', v_monster, 'kills', v_kills)); end if;
  insert into public.hr_faction_members (user_id, slot, faction, joined_at, changed_at) values (v_uid, p_slot, p_faction, now(), now());
  return public.hr_faction_done(v_uid, p_slot, p_idem, v_intent, 'join', p_faction, null,
    coalesce((select s.ms from public.hr_faction_standing s where s.user_id = v_uid and s.slot = p_slot and s.faction = p_faction), 0), null);
end $fn$;

create or replace function public.hr_faction_swap_start(p_slot int, p_faction text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'faction_swap_start';
  v_uid uuid := auth.uid(); v_intent text := c_verb || ':' || coalesce(left(p_faction, 32), '-'); v_r jsonb; m public.hr_faction_members%rowtype;
  v_ready timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_intent);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_r := public.hr_faction_locked(c_verb, v_uid, p_slot, p_idem, v_intent);
  if v_r is not null then return v_r; end if;
  select * into m from public.hr_faction_members x where x.user_id = v_uid and x.slot = p_slot;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_member')); end if;
  if p_faction is null or not exists (select 1 from public.hr_factions f where f.faction_id = p_faction) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_faction')); end if;
  if p_faction = m.faction then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'same_faction')); end if;
  if m.swap_to is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'swap_open', 'to', m.swap_to)); end if;
  -- THE WEEK: from the hero's last change of side (its join or its last finished swap), on the server's clock.
  select m.changed_at + make_interval(secs => r.cooldown_ms / 1000.0) into v_ready from public.hr_faction_rule r where r.id;
  if now() < v_ready then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'swap_cooldown', 'ready_at', v_ready)); end if;
  update public.hr_faction_members set swap_to = p_faction, swap_at = now(), swap_ms = 0 where user_id = v_uid and slot = p_slot;
  return public.hr_faction_done(v_uid, p_slot, p_idem, v_intent, 'swap_start', p_faction, null, null, 0);
end $fn$;

create or replace function public.hr_faction_swap_finish(p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'faction_swap_finish';
  v_uid uuid := auth.uid(); v_r jsonb; m public.hr_faction_members%rowtype; v_need bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_r := public.hr_faction_locked(c_verb, v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return v_r; end if;
  select * into m from public.hr_faction_members x where x.user_id = v_uid and x.slot = p_slot;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_member')); end if;
  if m.swap_to is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_swap')); end if;
  select swap_ms into v_need from public.hr_faction_rule where id;
  if m.swap_ms < v_need then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'swap_short', 'need_ms', v_need, 'have_ms', m.swap_ms)); end if;
  update public.hr_faction_members set faction = m.swap_to, changed_at = now(), swap_to = null, swap_at = null, swap_ms = 0
   where user_id = v_uid and slot = p_slot;
  return public.hr_faction_done(v_uid, p_slot, p_idem, c_verb, 'swap_finish', m.swap_to, null, null, m.swap_ms);
end $fn$;

create or replace function public.hr_faction_outfit_claim(p_slot int, p_piece text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'faction_outfit_claim';
  v_uid uuid := auth.uid(); v_intent text := c_verb || ':' || coalesce(left(p_piece, 32), '-'); v_r jsonb; o public.hr_faction_outfits%rowtype;
  v_have bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_intent);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_r := public.hr_faction_locked(c_verb, v_uid, p_slot, p_idem, v_intent);
  if v_r is not null then return v_r; end if;
  select * into o from public.hr_faction_outfits x where x.piece_id = p_piece;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_piece')); end if;
  if exists (select 1 from public.hr_faction_claims c where c.user_id = v_uid and c.slot = p_slot and c.piece_id = p_piece) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'piece_owned', 'piece', p_piece)); end if;
  -- THE SERVER'S STANDING on the piece's own side, kept across swaps: a hero who earned both sides may own both.
  v_have := coalesce((select s.ms from public.hr_faction_standing s where s.user_id = v_uid and s.slot = p_slot and s.faction = o.faction), 0);
  if v_have < o.need_ms then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'standing_short', 'piece', p_piece,
      'need_ms', o.need_ms, 'have_ms', v_have)); end if;
  insert into public.hr_faction_claims (user_id, slot, piece_id, faction, standing_ms) values (v_uid, p_slot, p_piece, o.faction, v_have);
  return public.hr_faction_done(v_uid, p_slot, p_idem, v_intent, 'claim', o.faction, p_piece, v_have, null);
end $fn$;

revoke execute on function public.hr_faction_join(int, text, uuid) from public, anon, service_role;
revoke execute on function public.hr_faction_swap_start(int, text, uuid) from public, anon, service_role;
revoke execute on function public.hr_faction_swap_finish(int, uuid) from public, anon, service_role;
revoke execute on function public.hr_faction_outfit_claim(int, text, uuid) from public, anon, service_role;
grant  execute on function public.hr_faction_join(int, text, uuid) to authenticated;
grant  execute on function public.hr_faction_swap_start(int, text, uuid) to authenticated;
grant  execute on function public.hr_faction_swap_finish(int, uuid) to authenticated;
grant  execute on function public.hr_faction_outfit_claim(int, text, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated'
   and proname in ('hr_faction_join', 'hr_faction_swap_start', 'hr_faction_swap_finish', 'hr_faction_outfit_claim');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_faction_join', 'p_slot integer, p_faction text, p_idem uuid', 'authenticated',
   'added 2027-04-22 (lane/c-faction-standing): this hero joins a side once, after its server-counted Krell kill; refuses join_locked, already_joined; moves no value'),
  ('hr_faction_swap_start', 'p_slot integer, p_faction text, p_idem uuid', 'authenticated',
   'added 2027-04-22 (lane/c-faction-standing): this hero starts a swap to the other side, a week after its last change; refuses swap_cooldown, swap_open; moves no value'),
  ('hr_faction_swap_finish', 'p_slot integer, p_idem uuid', 'authenticated',
   'added 2027-04-22 (lane/c-faction-standing): this hero finishes its swap once the settle credited its hunting time on the new side; refuses swap_short; moves no value'),
  ('hr_faction_outfit_claim', 'p_slot integer, p_piece text, p_idem uuid', 'authenticated',
   'added 2027-04-22 (lane/c-faction-standing): this hero claims a cosmetic piece its server standing on the piece''s side has earned; refuses standing_short, piece_owned; moves no value');

-- ── §5 THE SETTLE'S CREDIT (hr_hunt_settle_session, one splice before the session clock; a second apply finds the post image) ─
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'FACTION-STANDING') = 0 then
    v_old := $a$  -- (4) THE SESSION CLOCK.
$a$;
    v_new := $a$  -- FACTION-STANDING (2027-04-22-faction-standing.sql): this window's hunting time, as this settle proved it, to the hero's standing
  -- or its open swap when the ground pays a side. The server's window and catalogue; no number the engine sent.
  perform public.hr_faction_credit(p_user, p_slot, v_s.hunt_id, v_s.settled_to, coalesce(v_end_at, v_to));

$a$ || v_old;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_settle_session: the FACTION-STANDING anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §6 THE WORDS ARE THE CLIENT'S: this file answers codes and numbers. The client lane adds them to src/data/refusal-words.js. ─

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- Every number is read from the catalogue: a need, a cap or a cooldown moved in the data must still pass.
do $chk$
declare
  v_u  constant uuid := '000000c0-0000-4000-a000-0000fac70001';
  k1   constant uuid := '000000c0-0000-4000-a000-0000fac70011';
  c_g  constant text := 'zz_faction_probe';
  r public.hr_faction_rule%rowtype; v_a text; v_b text; o public.hr_faction_outfits%rowtype;
  v jsonb; v_t0 timestamptz := (date_trunc('day', now() at time zone 'UTC') - interval '3 days') at time zone 'UTC'; v_n bigint; f text; v_role text;
begin
  select * into r from public.hr_faction_rule where id;
  select faction_id into v_a from public.hr_factions order by ord limit 1;
  select faction_id into v_b from public.hr_factions where faction_id <> v_a order by ord limit 1;
  select * into o from public.hr_faction_outfits where faction = v_a order by need_ms desc limit 1;
  if r.id is null or v_b is null or o.piece_id is null then raise exception 'faction §7: the catalogue is not there to probe with'; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'faction §7 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'faction §7: hr_create_character refused: %', v; end if;
    insert into public.hr_faction_grounds (hunt_id, faction) values (c_g, v_a), (c_g || '_b', v_b);
    -- (a) UNAFFILIATED: no standing on a paying ground; KRELL FIRST: refused with the server's count, nothing written.
    if public.hr_faction_credit(v_u, 0, c_g, v_t0, v_t0 + interval '1 hour') is not null then raise exception 'faction §7(a): a hero of no side was credited'; end if;
    v := public.hr_faction_join(0, v_a, gen_random_uuid());
    if v->>'error' is distinct from 'join_locked' or (v->>'kills')::int <> 0 or v->>'monster' is distinct from r.join_monster then
      raise exception 'faction §7(a): a join before Krell answered %', v; end if;
    if exists (select 1 from public.hr_faction_members where user_id = v_u) or exists (select 1 from public.hr_faction_ledger where user_id = v_u) then
      raise exception 'faction §7(a): a refused join wrote a row'; end if;
    -- (b) THE JOIN, its replay, a second one, a side that is none.
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at) values (v_u, 0, 'stat', 'ev:kill_monster:' || r.join_monster, '', 1, now());
    v := public.hr_faction_join(0, 'zz_nobody', gen_random_uuid());
    if v->>'error' is distinct from 'unknown_faction' then raise exception 'faction §7(b): a side that is none answered %', v; end if;
    v := public.hr_faction_join(0, v_a, k1);
    if coalesce(v->>'ok', '') <> 'true' or v->'faction'->>'faction' is distinct from v_a then raise exception 'faction §7(b): the join answered %', v; end if;
    v := public.hr_faction_join(0, v_a, k1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'faction §7(b): the replay answered %', v; end if;
    if (select count(*) from public.hr_faction_ledger where user_id = v_u and kind = 'join') <> 1 then raise exception 'faction §7(b): one key journalled twice'; end if;
    v := public.hr_faction_join(0, v_b, gen_random_uuid());
    if v->>'error' is distinct from 'already_joined' then raise exception 'faction §7(b): a second join answered %', v; end if;
    -- (c) THE CREDIT: its own side's ground pays, the other side's doesn't, a window across midnight is split, the day is clamped.
    v := public.hr_faction_credit(v_u, 0, c_g, v_t0 + interval '23 hours 50 minutes', v_t0 + interval '24 hours 20 minutes');
    if (v->>'ms')::bigint <> 1800000 or (select count(*) from public.hr_faction_days where user_id = v_u and ms > 0) <> 2 then
      raise exception 'faction §7(c): 30 minutes across midnight credited % in % day rows', v, (select count(*) from public.hr_faction_days where user_id = v_u); end if;
    if public.hr_faction_credit(v_u, 0, c_g || '_b', v_t0, v_t0 + interval '1 hour') is not null then raise exception 'faction §7(c): the other side''s ground paid'; end if;
    if public.hr_faction_credit(v_u, 0, 'zz_pays_nobody', v_t0, v_t0 + interval '1 hour') is not null then raise exception 'faction §7(c): a ground of no side paid'; end if;
    -- THE DAY'S CEILING holds even if a window were counted twice: 20 h, then 20 h overlapping it, on one UTC day.
    perform public.hr_faction_credit(v_u, 0, c_g, v_t0 - interval '2 days', v_t0 - interval '2 days' + interval '20 hours');
    perform public.hr_faction_credit(v_u, 0, c_g, v_t0 - interval '2 days' + interval '4 hours', v_t0 - interval '1 day' - interval '1 second');
    if (select sum(ms + swap_ms) from public.hr_faction_days where user_id = v_u and day = ((v_t0 - interval '2 days') at time zone 'UTC')::date)
       is distinct from r.day_cap_ms then
      raise exception 'faction §7(c): a day twice counted credited %, its ceiling %',
        (select sum(ms + swap_ms) from public.hr_faction_days where user_id = v_u and day = ((v_t0 - interval '2 days') at time zone 'UTC')::date), r.day_cap_ms; end if;
    v_n := (select ms from public.hr_faction_standing where user_id = v_u and faction = v_a);
    if v_n <> (select sum(ms) from public.hr_faction_days where user_id = v_u and faction = v_a) then raise exception 'faction §7(c): the standing is not its days'' sum'; end if;
    -- (d) RAISE-ONLY and APPEND-ONLY.
    begin
      update public.hr_faction_standing set ms = ms - 1 where user_id = v_u;
      raise exception 'faction §7(d): a standing was lowered';
    exception when check_violation then null; end;
    begin
      delete from public.hr_faction_ledger where user_id = v_u;
      raise exception 'faction §7(d): a journal row was deleted';
    exception when check_violation then null; end;
    -- (e) THE SWAP: inside the week refused; past it, the new side's ground fills the swap and not the standing; short refused; finished.
    v := public.hr_faction_swap_start(0, v_b, gen_random_uuid());
    if v->>'error' is distinct from 'swap_cooldown' then raise exception 'faction §7(e): a swap inside the week answered %', v; end if;
    update public.hr_faction_members set changed_at = changed_at - make_interval(secs => r.cooldown_ms / 1000.0 + 1) where user_id = v_u;
    v := public.hr_faction_swap_start(0, v_a, gen_random_uuid());
    if v->>'error' is distinct from 'same_faction' then raise exception 'faction §7(e): a swap to its own side answered %', v; end if;
    v := public.hr_faction_swap_start(0, v_b, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'faction §7(e): the swap start answered %', v; end if;
    v := public.hr_faction_swap_finish(0, gen_random_uuid());
    if v->>'error' is distinct from 'swap_short' or (v->>'need_ms')::bigint <> r.swap_ms then raise exception 'faction §7(e): a finish with no time answered %', v; end if;
    v := public.hr_faction_credit(v_u, 0, c_g || '_b', v_t0 - interval '1 day', v_t0 - interval '1 day' + make_interval(secs => r.swap_ms / 1000.0 + 600));
    if (v->>'ms')::bigint <> r.swap_ms or (select swap_ms from public.hr_faction_members where user_id = v_u) <> r.swap_ms
       or exists (select 1 from public.hr_faction_standing where user_id = v_u and faction = v_b) then
      raise exception 'faction §7(e): the swap''s hunting answered % (capped at its need, no standing on the new side)', v; end if;
    v := public.hr_faction_swap_finish(0, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or v->'faction'->>'faction' is distinct from v_b or v->'faction'->'swap' is distinct from 'null'::jsonb then
      raise exception 'faction §7(e): the finish answered %', v; end if;
    -- (f) THE CLAIM: standing on the piece's own side, kept across the swap; short refused; once.
    update public.hr_faction_standing set ms = greatest(ms, o.need_ms - 1) where user_id = v_u and faction = v_a;
    v := public.hr_faction_outfit_claim(0, o.piece_id, gen_random_uuid());
    if v->>'error' is distinct from 'standing_short' or (v->>'need_ms')::bigint <> o.need_ms then raise exception 'faction §7(f): one ms short answered %', v; end if;
    update public.hr_faction_standing set ms = o.need_ms where user_id = v_u and faction = v_a;
    v := public.hr_faction_outfit_claim(0, o.piece_id, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'faction §7(f): the claim answered %', v; end if;
    v := public.hr_faction_outfit_claim(0, o.piece_id, gen_random_uuid());
    if v->>'error' is distinct from 'piece_owned' then raise exception 'faction §7(f): a second claim answered %', v; end if;
    v := public.hr_faction_outfit_claim(0, 'zz_nothing', gen_random_uuid());
    if v->>'error' is distinct from 'unknown_piece' then raise exception 'faction §7(f): a piece that is none answered %', v; end if;
    if (select count(*) from public.hr_faction_ledger where user_id = v_u) <> 4 then raise exception 'faction §7(f): the journal holds % rows, want 4', (select count(*) from public.hr_faction_ledger where user_id = v_u); end if;
    raise exception using errcode = 'HR947', message = 'faction §7 complete - rolling back';
  exception when sqlstate 'HR947' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from auth.users where id = v_u)
     or exists (select 1 from public.hr_faction_grounds where hunt_id like 'zz\_faction\_probe%') then
    raise exception 'faction §7: LEAKED a probe row'; end if;
  -- (g) THE SETTLE CREDITS: the splice is there, once.
  if (select count(*) from regexp_matches(pg_get_functiondef('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure),
                                          'perform public\.hr_faction_credit\(', 'g')) <> 1 then
    raise exception 'faction §7(g): the settle does not credit standing exactly once'; end if;
  -- (h) GRANTS: the four verbs are the client's and baselined; nothing else here is; no client role reaches a table; no policy opens one.
  foreach f in array array['public.hr_faction_credit(uuid,integer,text,timestamp with time zone,timestamp with time zone)', 'public.hr_faction_view(uuid,integer)',
                           'public.hr_faction_locked(text,uuid,integer,uuid,text)', 'public.hr_faction_done(uuid,integer,uuid,text,text,text,text,bigint,bigint)',
                           'public.hr_faction_raise_only()', 'public.hr_faction_ledger_immutable()'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, f, 'execute') then raise exception 'faction §7(h): % reaches %', v_role, f; end if;
    end loop;
  end loop;
  foreach f in array array['public.hr_faction_join(integer,text,uuid)', 'public.hr_faction_swap_start(integer,text,uuid)',
                           'public.hr_faction_swap_finish(integer,uuid)', 'public.hr_faction_outfit_claim(integer,text,uuid)'] loop
    if has_function_privilege('anon', f, 'execute') or not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'faction §7(h): the grants on % are wrong', f; end if;
    if not exists (select 1 from public.hr_client_rpc_baseline b where b.grantee = 'authenticated' and b.proname = split_part(substr(f, 8), '(', 1)) then
      raise exception 'faction §7(h): % is not on the client baseline', f; end if;
  end loop;
  foreach f in array array['hr_faction_members', 'hr_faction_standing', 'hr_faction_days', 'hr_faction_claims', 'hr_faction_ledger'] loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = f) then raise exception 'faction §7(h): a policy opens %', f; end if;
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, 'public.' || f, 'select') or has_table_privilege(v_role, 'public.' || f, 'insert,update,delete,truncate') then
        raise exception 'faction §7(h): % reaches %', v_role, f; end if;
    end loop;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'faction standing: joins after Krell, credits standing only from the settle''s own window on a paying ground, clamps the day, swaps after a week and ten hours, claims on server standing; all green';
end $chk$;
