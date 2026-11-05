-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-27-gold-sinks-seams.sql — THE SEAMS THE GOLD SINK LANES SHARE, SO NO LANE TOUCHES ANOTHER'S FILES
--   (lane/c-town-shows, backend-architect, 2026-11-04; Tyler the same day: "I want all of those that you said other than the avoid
--   ones"; the designer's board section "2026-11-04 Gold sinks", "How the lanes stay apart").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies
-- on its passing §7; ON THE EA SECURITY LIST (a chat row carries a server-stamped title; the Crier's flag has no writer until
-- 2027-02-27-town-crier.sql). EDGE: no deploy. CLIENT: none has to land first: a client that doesn't read a new key ignores it.
-- APPLY ORDER: after 2027-02-27-gold-sinks-catalogue.generated.sql, which hr_sink_price reads.
--
-- ── WHAT IT SHIPS, AND WHO REPLACES WHAT ─────────────────────────────────────
--   hr_sink_price(sink, bought, level)  ONE price rule for every sink: the (bought+1)th rung, or base + per level x Level; null past the top.
--   hr_sink_lock(user)                  the advisory key hr:sink:<uid>, spelled once. Lock order: hero, THIS, hr_apply, then a town key.
--   hr_sink_bought_today(user, verb, offers)  how many this ACCOUNT bought today on a ladder, across every hero, read off the ledger under that key.
--   hr_title_of(user, slot)    STUB, null. lane/c-hero-sinks replaces ONLY the body. Answers the worn title's words from the catalogue
--                              ("the Wolfer"), or null. Never a client's text. chat_messages.from_title and hr_town_look's `title` read it.
--   hr_town_look               + `title`, + `colors` (player_outfits.base_colors). The look is re-read at most every 60 s per body.
--   chat_messages.from_title   stamped by hr_chat_name_authority on every insert, whatever the insert said.
--   chat_messages.crier        the Crier's highlight. False on every row until hr_crier_send; no client role can write this table.
--   hr_chat_row                + from_title, + crier: the one row shape every chat answer and Realtime push carries.
--   hr_town_extras(map)        STUB, {}. lane/c-town-works replaces ONLY the body. hr_town_view carries it as `extras`.
--   hr_town_shows_of(map)      STUB, null. 2027-02-27-town-shows.sql replaces ONLY the body. hr_town_view carries it as `shows`.
--   hr_town_view               RESTATED ONCE HERE for both, so no later file in this project has to restate its 9 KB body.
--
-- A stub is created only when absent, so a second apply never overwrites the body a later lane put there.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- No value moves. No new client RPC: every function here is owner-only (§7 asserts it). A forged from_title or crier in an insert has no
-- path: a client role holds no insert or update on chat_messages, and the trigger overwrites from_title on the service path too.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- hr_town_view is the hottest read in town (every 2 s per viewer): two stub calls here; a later body must stay one indexed probe.
-- chat_messages grows by 1 boolean byte and a null bitmap bit per row. hr_town_look reads one more primary key per body per 60 s.
--
-- REVERSIBILITY: re-apply the pre-images (2027-01-31-inner-flame.sql's hr_town_view, 2027-01-28-town-stands.sql's hr_town_look,
-- 2026-10-29-character-names-everywhere.sql's hr_chat_row and hr_chat_name_authority); drop the helpers and the two columns.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hr_sink_rules') is null then
    raise exception 'PRECONDITION: apply 2027-02-27-gold-sinks-catalogue.generated.sql first'; end if;
  if to_regclass('public.chat_messages') is null or to_regclass('public.player_outfits') is null or to_regclass('public.town_bodies') is null
     or to_regprocedure('public.hr_hearth_flame_of(text)') is null or to_regprocedure('public.hr_character_name(uuid,integer)') is null then
    raise exception 'PRECONDITION: chat, the outfits, the town stands and the Hearth must exist'; end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.player_outfits'::regclass and attname = 'base_colors' and not attisdropped) then
    raise exception 'PRECONDITION: player_outfits.base_colors is absent (2026-11-02-hero-creation.sql)'; end if;
  -- each restated body is EXACTLY its live image (tests/live-hash-drift.baseline.json, measured 2026-11-05) or this file's own (a second apply)
  for v_r in select * from (values
    ('public.hr_chat_name_authority()', 'f5161ee3fe11a620229d934728483be5', 'b7fdf70fec505d0094c80c69aae210dd'),
    ('public.hr_chat_row(public.chat_messages)', '566694d0b3f85abe9ae1ba8a22b86868', 'c5525121e60cdff03bf94eb8d4ea83a9'),
    ('public.hr_town_look(uuid,integer)', '1a6ceebe218f985e63f182e3fa9515f2', '4e2d78833019b7001758dd04a1fb60cb'),
    ('public.hr_town_view(integer,text,integer,integer,bigint,integer,integer)', '14d611dfb9a44b5f6862498e4ade701e', 'ff2cc25fc03f8009684d5a7e6feea55e')) t(fn, pre, post) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its live pre-image (%) nor this file''s image (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE SHARED HELPERS ────────────────────────────────────────────────────
-- THE PRICE. p_bought: how many this scope has already bought on this ladder (today, or ever, as the verb's own rule says).
-- Null: an unknown sink, or a ladder with no rung left. A verb that gets null refuses; it never charges.
create or replace function public.hr_sink_price(p_sink text, p_bought int, p_level int default null)
returns bigint language sql stable security definer set search_path = public, pg_catalog as $fn$
  select case when cardinality(r.prices) > 0 then r.prices[greatest(coalesce(p_bought, 0), 0) + 1]
              else r.price_base + r.price_per_level * greatest(coalesce(p_level, 1), 1) end
    from public.hr_sink_rules r where r.sink_id = p_sink
$fn$;
-- THE ACCOUNT'S SINK KEY. Taken AFTER the hero's lock and BEFORE hr_apply, in every verb whose count is per account: without it two
-- heroes pressing together both read the same count and both pay the first price.
create or replace function public.hr_sink_lock(p_user uuid)
returns void language sql volatile security definer set search_path = public, pg_catalog as $fn$
  select pg_advisory_xact_lock(hashtextextended('hr:sink:' || p_user::text, 0))
$fn$;

-- THE ACCOUNT'S COUNT TODAY, read off the append-only ledger. A purchase journals kind shop, intent <verb>:<id>:<price>. slot = any bounds the read to the
-- ledger's own index (user_id, slot, at desc), so it costs the day's rows, not the account's whole journal. Read it AFTER hr_sink_lock.
create or replace function public.hr_sink_bought_today(p_user uuid, p_verb text, p_offers text[] default null)
returns int language sql stable security definer set search_path = public, pg_catalog as $fn$
  select count(*)::int from public.player_ledger l
   where l.user_id = p_user and l.slot = any (array[0, 1, 2, 3, 4, 5]) and l.at >= public.hr_utc_day_start(now()) and l.kind = 'shop'
     and split_part(l.intent, ':', 1) = p_verb
     and (p_offers is null or split_part(l.intent, ':', 2) = any (p_offers))
$fn$;

-- ── §2 THE STUBS, CREATED ONLY WHEN ABSENT ───────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_title_of(uuid,integer)') is null then
    create function public.hr_title_of(p_user uuid, p_slot int)
    returns text language sql stable security definer set search_path = public, pg_catalog as $fn$
      select null::text
    $fn$;
  end if;
  if to_regprocedure('public.hr_town_extras(text)') is null then
    create function public.hr_town_extras(p_map text)
    returns jsonb language sql stable security definer set search_path = public, pg_catalog as $fn$
      select '{}'::jsonb
    $fn$;
  end if;
  if to_regprocedure('public.hr_town_shows_of(text)') is null then
    create function public.hr_town_shows_of(p_map text)
    returns jsonb language sql stable security definer set search_path = public, pg_catalog as $fn$
      select null::jsonb
    $fn$;
  end if;
end $mig$;

-- ── §3 THE CHAT ROW ──────────────────────────────────────────────────────────
alter table public.chat_messages add column if not exists from_title text;
alter table public.chat_messages add column if not exists crier boolean not null default false;
comment on column public.chat_messages.from_title is
  '2027-02-27-gold-sinks-seams.sql: the sender''s worn title as hr_title_of read it when the line was written, stamped by hr_chat_name_authority. A catalogue''s words, never a client''s.';
comment on column public.chat_messages.crier is
  '2027-02-27-gold-sinks-seams.sql: a paid Town Crier line. Written only by hr_crier_send; no client role can insert or update this table.';

create or replace function public.hr_chat_name_authority()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The sender is who the session says they are (a service-role insert keeps its own from_id).
  if auth.uid() is not null then
    new.from_id := auth.uid();
  end if;
  -- Its name is the character's current name (character_names, else the profile, else 'Adventurer'),
  -- never the client's string.
  new.from_name := left(case when new.from_id is null then coalesce(nullif(btrim(new.from_name), ''), 'Adventurer')
                             else public.hr_character_name(new.from_id, coalesce(new.from_slot, 0)) end, 24);
  -- Its title is the one the hero wears (a catalogue's words), never the client's string.
  new.from_title := case when new.from_id is null then null
                         else left(public.hr_title_of(new.from_id, coalesce(new.from_slot, 0)), 40) end;
  return new;
end $$;
revoke execute on function public.hr_chat_name_authority() from public, anon, authenticated, service_role;

create or replace function public.hr_chat_row(m public.chat_messages)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select jsonb_build_object('id', m.id, 'channel', m.channel, 'from_id', m.from_id,
    'from_name', case when m.from_id is not null then left(public.hr_character_name(m.from_id, coalesce(m.from_slot, 0)), 24) else m.from_name end,
    'from_slot', m.from_slot, 'from_level', m.from_level, 'from_weapon', m.from_weapon, 'from_role', m.from_role,
    'from_title', m.from_title, 'crier', m.crier,
    'body', m.body, 'created_at', m.created_at)
$$;
revoke execute on function public.hr_chat_row(public.chat_messages) from public, anon, authenticated, service_role;

-- ── §4 THE LOOK ──────────────────────────────────────────────────────────────
create or replace function public.hr_town_look(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $fn$
  select jsonb_build_object(
           'name', left(public.hr_character_name(p_user, p_slot), 24),
           'level', public.hr_level_of(p_user, p_slot),
           'role', public.hr_role_view(p_user, p_slot)->>'id',
           -- THE TITLE the hero wears (a catalogue's words, hr_title_of), null when none
           'title', left(public.hr_title_of(p_user, p_slot), 40),
           -- THE OUTFIT the character chose (player_outfits, written only by hr_outfit_set), null when none or no longer owned
           'outfit', (select case when po.outfit_id is not null and po.outfit_id = any (public.hr_outfit_owned(p_user, p_slot))
                                  then jsonb_build_object('id', po.outfit_id, 'colors', coalesce(po.colors, '{}'::jsonb)) end
                        from public.player_outfits po where po.user_id = p_user and po.slot = p_slot),
           -- THE HERO'S OWN COLORS, across every outfit (player_outfits.base_colors), null when none were chosen
           'colors', (select nullif(po.base_colors, '{}'::jsonb) from public.player_outfits po where po.user_id = p_user and po.slot = p_slot))
$fn$;

-- ── §5 THE TOWN READ, RESTATED WHOLE (§0 pins its image): + `shows`, + `extras` ──
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

-- ── §6 GRANTS: every function here is the owner's ────────────────────────────
do $mig$
declare f text;
begin
  foreach f in array array['public.hr_sink_price(text,integer,integer)', 'public.hr_sink_lock(uuid)', 'public.hr_sink_bought_today(uuid,text,text[])',
                           'public.hr_title_of(uuid,integer)', 'public.hr_town_extras(text)', 'public.hr_town_shows_of(text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
  end loop;
end $mig$;

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  v_u   constant uuid := '000000c0-0000-4000-a000-0000901d5e01';
  v     jsonb; v_row public.chat_messages%rowtype; v_map text; f text; v_role text; v_worn text;
begin
  -- (a) one price rule: the ladder climbs, ends, and a Level price reads the Level; an unknown sink has no price.
  if public.hr_sink_price('powder', 0) <> (select prices[1] from public.hr_sink_rules where sink_id = 'powder')
     or public.hr_sink_price('powder', 1) <> (select prices[2] from public.hr_sink_rules where sink_id = 'powder')
     or public.hr_sink_price('powder', (select cardinality(prices) from public.hr_sink_rules where sink_id = 'powder')) is not null then
    raise exception 'seams §7(a): the powder ladder is not read in order'; end if;
  if public.hr_sink_price('hero_colors', 0, 18) <> (select price_base + 18 * price_per_level from public.hr_sink_rules where sink_id = 'hero_colors')
     or public.hr_sink_price('no_such_sink', 0) is not null then
    raise exception 'seams §7(a): the Level price or the unknown sink is wrong'; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'gold-sinks-seams §7 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'seams §7(b): hr_create_character refused: %', v; end if;
    -- (b) a forged title on an insert: the title is whatever hr_title_of answers (a later lane may have replaced the stub), and the row carries both keys.
    v_worn := left(public.hr_title_of(v_u, 0), 40);
    insert into public.chat_messages (channel, from_id, from_slot, from_name, from_title, body)
      values ('global', v_u, 0, 'Forged', 'the Forged', 'seams probe') returning * into v_row;
    if v_row.from_title is distinct from v_worn then raise exception 'seams §7(b): a forged from_title survived: %', v_row.from_title; end if;
    if v_row.crier is distinct from false then raise exception 'seams §7(b): a new line is a Crier line by default'; end if;
    v := public.hr_chat_row(v_row);
    if not (v ? 'from_title') or not (v ? 'crier') or v->>'from_title' is distinct from v_worn or (v->>'crier')::boolean then
      raise exception 'seams §7(b): the row shape is wrong: %', v; end if;
    -- (c) the look carries the seams, with no colors chosen.
    delete from public.player_outfits where user_id = v_u and slot = 0;
    v := public.hr_town_look(v_u, 0);
    if not (v ? 'title') or not (v ? 'colors') or v->>'title' is distinct from v_worn or v->'colors' is distinct from 'null'::jsonb then
      raise exception 'seams §7(c): the look is wrong: %', v; end if;
    -- (d) the town read carries both seams, and still everything it did.
    select map_id into v_map from public.hr_town_maps order by map_id limit 1;
    v := public.hr_town_view(0, v_map, null, null, null, null, null);
    if coalesce(v->>'ok', '') <> 'true' or not (v ? 'extras') or not (v ? 'shows') or not (v ? 'hearth') or not (v ? 'walkers') then
      raise exception 'seams §7(d): the town read answered %', v; end if;
    raise exception using errcode = 'HR932', message = 'gold-sinks-seams §7 complete - rolling back';
  exception when sqlstate 'HR932' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from auth.users where id = v_u) then
    raise exception 'seams §7: LEAKED a probe row'; end if;
  -- (e) GRANTS: nothing here is a client's, and no client role can write a chat row, so `crier` has no client path.
  foreach f in array array['public.hr_sink_price(text,integer,integer)', 'public.hr_sink_lock(uuid)', 'public.hr_sink_bought_today(uuid,text,text[])',
                           'public.hr_title_of(uuid,integer)', 'public.hr_town_extras(text)', 'public.hr_town_shows_of(text)', 'public.hr_chat_row(public.chat_messages)',
                           'public.hr_town_look(uuid,integer)'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, f, 'execute') then raise exception 'seams §7(e): % reaches %', v_role, f; end if;
    end loop;
  end loop;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.chat_messages', 'insert') or has_table_privilege(v_role, 'public.chat_messages', 'update')
       or has_column_privilege(v_role, 'public.chat_messages', 'crier', 'insert') or has_column_privilege(v_role, 'public.chat_messages', 'crier', 'update')
       or has_column_privilege(v_role, 'public.chat_messages', 'from_title', 'insert') or has_column_privilege(v_role, 'public.chat_messages', 'from_title', 'update') then
      raise exception 'seams §7(e): % can write a chat row', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'gold-sinks-seams: one price rule, one sink key, a server-stamped title, town extras and shows; all green';
end $chk$;
