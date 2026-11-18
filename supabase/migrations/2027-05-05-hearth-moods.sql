-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-05-hearth-moods.sql — THE GREAT HEARTH BURNS ONE THING AT A TIME: THE CHEST'S GREEN, A NAMED FLAME, A BOUGHT ONE, OR ITS
--   OWN FIRE, AND NOTHING ANYONE PAID FOR IS LOST UNDER ANOTHER (lane/c-hearth-moods, backend-architect, 2026-11-17).
--   Tyler 2026-11-18: "some smoke that comes out that possibly changes colors based on the flame color / events etc. When someone opens the
--   chest for example I think the fire should turn green and blow our dark green and black smoke. Just be sure to have a 'priority' if two
--   people are using the hearth for different things it doesn't break the game." The priority and the cap are the Coordinator's ruling.
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §9; ON THE EA SECURITY LIST (a shared surface: a chest press now writes the square's flame). EDGE: none (no file the edge
-- bundles moves; the chest's flame row and every smoke colour are client display data outside src/data/hearth.js). CLIENT: the smoke and
-- the chest's colour ride the next release AFTER this applies; an older client draws the chest's window as the plain fire (its FLAMES has
-- no `chest`), never a missing sprite, and ignores `kind`.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- ONE AUTHORITY, ONE PRIORITY. hr_hearth_flame_of(map) (the `hearth` key of hr_town_view, polled every 2 s a viewer) answers exactly one
--   winner, highest first, or null for the plain fire:
--     (a) THE CHEST'S WINDOW   a short green window the Hearth Chest's press writes (hearth_bursts): { flame 'chest', kind 'chest', item null,
--                              by, from_ms, until_ms, now_ms, queued 0 }
--     (b) A NAMED FLAME        unchanged: { flame, kind 'named', item, by, from_ms, until_ms, now_ms, queued }
--     (c) A BOUGHT POWDER      unchanged: { flame, kind 'bought', item null, bought true, by, from_ms, until_ms, now_ms, queued 0 }
--     (d) THE PLAIN FIRE       null (as before: the smallest answer on the hottest read, and an old client's own rule)
--   `kind` is the one field added; nothing was removed. The smoke colour is the client's display row for the winner's `flame` (the client
--   never picks the winner: it draws the one this answers).
-- THE CHEST'S WINDOW. hearth_bursts NEW: one row per town map (map_id PRIMARY KEY), the window on the square now or last: who opened it,
--   starts_at, ends_at, `credit` (the green the square may still burn in a row, as of ends_at), opens (presses in this window). Written only
--   by hr_hearth_chest_burst, under the Hearth's key. RLS on, every privilege revoked, no policy: no client reads or writes it.
--   hr_hearth_chest_burst() TRIGGER AFTER UPDATE OF opens ON chest_luck, WHEN the count rose: hr_chest_open's one luck update a press, made
--   AFTER its hr_apply and inside its protected block. It fires only when that press's chest_opens rows (n in (old, new]) name the Great
--   Hearth's own chest ('great_hearth'), only for a hero outside the Game Master's wall, and only on the main town.
--     GREEN NOW: the window EXTENDS (ends = the later of its end and the press + 10 s), never queues, as far as the credit goes.
--     NOT GREEN: the credit has refilled a second for every second the square was not green, up to 30 s; a new window needs a whole 10 s
--       of it (else the square rests and the press shows nothing: the chest itself is untouched).
--   THE NUMBERS, and why: 10 s a press (the chest's reveal: about as long as the haul takes to read), at most 30 s green in a row (the
--   credit's size: one powder's whole show, SINK_RULES.powder.seconds, so the longest run of keys never hides more than one powder at a
--   stretch, and three presses' worth), refilled 1:1 while not green (keys spammed back to back can't hold it green forever: past the first
--   30 s the square burns its own flame at least half the time, in rests of at least 10 s, since a new window needs a whole 10 s).
-- NOTHING PAID IS LOST. Every flame under the window is PAUSED, not eaten: hr_hearth_pause(map, from, until) moves every named flame still to
--   burn out of the window's way (one burning keeps its start and burns on after; one waiting moves whole) and every bought one by
--   hr_town_show_push, the very push a named fuel gives them (2027-02-27-town-shows.sql). Each extension pauses them by what it added. So a
--   powder or a named flame shows for every second it was booked for, before and after the green. No charge moves, nothing is refunded,
--   nothing is journalled as value.
--   A FLAME BOOKED DURING THE WINDOW STARTS WHEN IT ENDS: a named flame (hr_hearth_named_after_burst, BEFORE INSERT on hearth_flames: its
--   window slides to the green's end, whole) and a powder (hr_town_show_free_at RESTATED: + the window's end, as it already waited on named
--   flames). hr_hearth_burn and hr_town_show are NOT restated: their booking reads under the Hearth's key, as the window's write does.
-- RESTATED WHOLE, each pinned by §0 to its live image (tests/live-hash-drift.baseline.json, measured 2026-11-17) or this file's own:
--   hr_hearth_flame_of   + (a) and `kind`; now PL/pgSQL (planned once a backend: PostgreSQL 17 re-plans a LANGUAGE sql function with a SET
--                        clause on every call, on the read every viewer makes every 2 s). Its (b) and (c) lines are the image's own, verbatim.
--   hr_town_show_free_at + the chest window's end for a powder.
-- ERROR TAXONOMY: none new. No verb, no grant, no refusal: a press the square can't show is still the press it was.
--
-- ── CONCURRENCY AND IDEMPOTENCY ─────────────────────────────────────────────
-- THE LOCK ORDER IS UNCHANGED: hero, the account's key (hr:sink:<uid> for a sink, hr:depot:<uid> for the chest), the rows hr_apply writes,
--   THEN the Hearth's key, last. The window is written from the press's luck update, which hr_chest_open makes after its hr_apply, so the
--   chest takes the Hearth's key exactly where a burn and a powder do (2027-02-27-town-shows.sql §7: a burn holding it over its hr_apply
--   deadlocked once). After the key, only rows no one locks before it: the window's row, the map's named flames and its powders.
-- ONE WINNER: every writer of the three (the press's trigger, hr_hearth_burn, hr_town_show) books under the Hearth's key and reads the
--   others under it; the read is a pure function of the rows and the server clock (now()).
-- A REFUSED OR ROLLED-BACK PRESS WRITES NOTHING: the trigger is inside the press's own transaction and inside its protected block (an HR001
--   from hr_apply rolls the luck update, and so the window, back with the rest). A refusal before the press writes no luck row at all.
-- A REPLAYED KEY never reaches the luck update (hr_intent_replay answers first), so a press extends the window once.
-- TWO PRESSES AT ONCE serialise on the Hearth's key: the second reads the first's window and extends it. Proven on real backends:
--   tests/town-shows-race.mjs R11-R14 (chest + powder, chest + named fuel, two chests, chest + a feed errand).
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- No new client verb, grant, policy or delta key. The window is minted from the server's own chest_opens rows inside a press that spent a
-- key (six a family a hero a week): no client value names a time, a length, a colour or a map. A shared-surface write, so the Game Master's
-- hero is walled out (the function's own check, and hr_gm_wall on the table as the row lock). Worst case of abuse: every key a server holds
-- spent at the Hearth makes the square green at most half the time; a powder or named flame under it is paused, never shortened.
--
-- ── COST (rows and bytes at 100x players) ───────────────────────────────────
-- hearth_bursts: ONE row per town map, updated in place (~120 bytes). hr_town_view: one primary-key probe more (O(1) a map), on a read now
-- planned once a backend instead of every call. Per chest press: one indexed probe of the press's own chest_opens rows and, at the Hearth's
-- key, one row update and two indexed updates of the map's live flames (a handful of rows). Per named burn: one primary-key probe. Per
-- powder booking: one primary-key probe. No ledger row, no per-tick row.
--
-- REVERSIBILITY: drop the triggers hr_hearth_chest_burst (chest_luck) and hr_hearth_after_burst (hearth_flames), then re-apply
-- 2027-02-27-town-shows.sql's hr_hearth_flame_of and hr_town_show_free_at (§0 pins them), then drop hr_hearth_chest_burst(),
-- hr_hearth_named_after_burst(), hr_hearth_pause and hearth_bursts. No player row needs repair: a paused flame only burns later.
-- IDEMPOTENT: a second apply finds the table, restates every body byte-identical, re-creates the triggers, and §9 rolls back its probes.
-- ORDER: LAST, after 2027-05-04-setup-swap-mid-hunt.sql; no object in common with any staged file.
-- WIPE: hearth_bursts joins 2027-02-25-character-wipe.sql's c_wipe (it names a hero).
-- AFTER APPLY: live-hash-drift re-measures hr_hearth_flame_of and hr_town_show_free_at and tracks the four new bodies (Coordinator);
-- restore-census: hearth_bursts is operational, ships empty.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hearth_flames') is null or to_regclass('public.town_shows') is null or to_regclass('public.chest_luck') is null
     or to_regclass('public.chest_opens') is null or to_regclass('public.hr_town_maps') is null then
    raise exception 'PRECONDITION: the Hearth, the shows, the chest and the town must exist (2027-01-31-inner-flame.sql, 2027-02-27-town-shows.sql, 2027-04-27-tower-chest.sql)'; end if;
  if to_regprocedure('public.hr_town_show_push(text,timestamp with time zone,timestamp with time zone)') is null
     or to_regprocedure('public.hr_gm_walled(uuid)') is null or to_regprocedure('public.hr_gm_wall_quiet()') is null
     or to_regprocedure('public.hr_character_name(uuid,integer)') is null or to_regprocedure('public.hr_chest_open(integer,text,text,integer,integer,uuid)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
  if not exists (select 1 from public.hr_chests where chest_id = 'great_hearth') then
    raise exception 'PRECONDITION: no Hearth Chest (great_hearth) in hr_chests'; end if;
  -- each restated body is EXACTLY its live image (tests/live-hash-drift.baseline.json, measured 2026-11-17) or this file's own (a second apply)
  for v_r in select * from (values
    ('public.hr_hearth_flame_of(text)', '6c841b157520be382feef27d277fda3b', '4ff4ccd6ddf31c48de6dae774d332cfe'),
    ('public.hr_town_show_free_at(text,text)', '43736b0fc09745b9a5a416b86241fd22', '11959fd9670930beb0396d6f4fc4981c')) t(fn, pre, post) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its live pre-image (%) nor this file''s image (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE TABLE ─────────────────────────────────────────────────────────────
create table if not exists public.hearth_bursts (
  map_id     text        primary key check (map_id ~ '^[a-z0-9_]{1,40}$'),
  user_id    uuid        not null,
  slot       int         not null check (slot between 0 and 5),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  credit     interval    not null check (credit >= interval '0'),
  opens      int         not null check (opens >= 1),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
comment on table public.hearth_bursts is
  '2027-05-05-hearth-moods.sql: the Hearth Chest''s green window on each town''s square, one row a map, updated in place: who opened it, '
  'when it burns, the green the square may still burn in a row (credit) and the presses in it. Written only by hr_hearth_chest_burst under '
  'the Hearth''s key; read by the square''s flame (the town read). RLS on, no client privilege, no policy.';
alter table public.hearth_bursts enable row level security;
revoke all on table public.hearth_bursts from public, anon, authenticated, service_role;
-- THE ROW LOCK (2027-03-13-gm-tools.sql): a walled hero's write to a shared table goes nowhere, quietly
create or replace trigger hr_gm_wall before insert or update on public.hearth_bursts for each row execute function public.hr_gm_wall_quiet();

-- ── §2 THE PAUSE: the chest takes the fire for [from, until) ─────────────────
create or replace function public.hr_hearth_pause(p_map text, p_from timestamptz, p_until timestamptz)
returns void language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
begin
  -- HEARTH-MOODS (2027-05-05-hearth-moods.sql). The caller holds the Hearth's key. Every named flame still to burn moves out of the window's
  -- way: one burning keeps its start and burns on after, one waiting moves whole. The bought ones move by the push a named fuel gives them.
  update public.hearth_flames f
     set starts_at = case when f.starts_at >= p_from then f.starts_at + (p_until - p_from) else f.starts_at end,
         ends_at = f.ends_at + (p_until - p_from)
   where f.map_id = p_map and f.ends_at > p_from;
  perform public.hr_town_show_push(p_map, p_from, p_until);
end $fn$;

-- ── §3 THE CHEST'S WINDOW, written by the press's own luck update ────────────
create or replace function public.hr_hearth_chest_burst()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_secs constant interval := interval '10 seconds';   -- one press's window
  c_cap  constant interval := interval '30 seconds';   -- the most green the square burns in a row: the credit's size
  v_now  timestamptz := now();
  v_map  text;
  v_b    public.hearth_bursts%rowtype;
  v_credit interval;
  v_until timestamptz;
begin
  -- HEARTH-MOODS (2027-05-05-hearth-moods.sql)
  -- THE GREAT HEARTH'S OWN CHEST: this press's rows (n in (old, new]) name it, or the square has nothing to show
  if not exists (select 1 from public.chest_opens o where o.user_id = new.user_id and o.slot = new.slot
                  and o.n > old.opens and o.n <= new.opens and o.chest_id = 'great_hearth') then return null; end if;
  -- THE GAME MASTER'S HERO reaches no one (a shared surface)
  if public.hr_gm_walled(new.user_id) then return null; end if;
  v_map := (select m.map_id from public.hr_town_maps m where m.main);
  if v_map is null then return null; end if;
  -- THE HEARTH'S KEY, LAST: the press already holds its hero, its account's depot, its luck row and what its hr_apply wrote
  perform pg_advisory_xact_lock(hashtextextended('hr:hearth:' || v_map, 0));
  select * into v_b from public.hearth_bursts b where b.map_id = v_map for update;
  if found and v_b.ends_at > v_now then
    -- GREEN NOW: the window extends to ten seconds past this press (never queues), as far as the credit goes
    v_until := least(greatest(v_b.ends_at, v_now + c_secs), v_b.ends_at + v_b.credit);
    if v_until > v_b.ends_at then perform public.hr_hearth_pause(v_map, v_b.ends_at, v_until); end if;
    update public.hearth_bursts
       set ends_at = v_until, credit = v_b.credit - (v_until - v_b.ends_at), opens = v_b.opens + 1, updated_at = v_now
     where map_id = v_map;
    return null;
  end if;
  -- NOT GREEN: a second of credit back for every second the square was not green, up to the cap; a new window needs a whole one
  v_credit := case when found then least(c_cap, v_b.credit + (v_now - v_b.ends_at)) else c_cap end;
  if v_credit < c_secs then return null; end if;
  v_until := v_now + c_secs;
  perform public.hr_hearth_pause(v_map, v_now, v_until);
  insert into public.hearth_bursts as b (map_id, user_id, slot, starts_at, ends_at, credit, opens, updated_at)
  values (v_map, new.user_id, new.slot, v_now, v_until, v_credit - c_secs, 1, v_now)
  on conflict (map_id) do update
    set user_id = excluded.user_id, slot = excluded.slot, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
        credit = excluded.credit, opens = excluded.opens, updated_at = excluded.updated_at;
  return null;
end $fn$;
drop trigger if exists hr_hearth_chest_burst on public.chest_luck;
create trigger hr_hearth_chest_burst after update of opens on public.chest_luck for each row
  when (new.opens > old.opens)
  execute function public.hr_hearth_chest_burst();

-- ── §4 A NAMED FLAME BOOKED DURING THE WINDOW STARTS WHEN IT ENDS ────────────
create or replace function public.hr_hearth_named_after_burst()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_end timestamptz;
begin
  -- HEARTH-MOODS (2027-05-05-hearth-moods.sql). The burn holds the Hearth's key here, as the window's write does: its whole length slides
  -- past the green, so it shows for every second of it.
  select b.ends_at into v_end from public.hearth_bursts b where b.map_id = new.map_id;
  if v_end is not null and new.starts_at < v_end then
    new.ends_at := new.ends_at + (v_end - new.starts_at);
    new.starts_at := v_end;
  end if;
  return new;
end $fn$;
-- named after hr_gm_wall (PostgreSQL fires a table's triggers in name order): the wall refuses first
drop trigger if exists hr_hearth_after_burst on public.hearth_flames;
create trigger hr_hearth_after_burst before insert on public.hearth_flames for each row
  execute function public.hr_hearth_named_after_burst();

-- ── §5 A POWDER BOOKED DURING THE WINDOW STARTS WHEN IT ENDS (RESTATED: + the window) ──
create or replace function public.hr_town_show_free_at(p_map text, p_sink text)
returns timestamptz language sql stable security definer set search_path = public, pg_catalog as $fn$
  select greatest(now(),
    (select max(s.ends_at) from public.town_shows s where s.map_id = p_map and s.sink_id = p_sink),
    case when p_sink = 'powder' then (select max(f.ends_at) from public.hearth_flames f where f.map_id = p_map) end,
    case when p_sink = 'powder' then (select b.ends_at from public.hearth_bursts b where b.map_id = p_map) end)
$fn$;

-- ── §6 THE FLAME THE SQUARE BURNS: one winner (RESTATED: + the chest's window, + kind; PL/pgSQL) ──
create or replace function public.hr_hearth_flame_of(p_map text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  -- HEARTH-MOODS (2027-05-05-hearth-moods.sql): the chest's window, else a named flame, else a bought one; null is the plain fire.
  return coalesce(
    (select jsonb_build_object(
              'flame', 'chest', 'kind', 'chest', 'item', null,
              'by', case when coalesce(ps.presence_quiet, false) then null else left(public.hr_character_name(b.user_id, b.slot), 24) end,
              'from_ms', floor(extract(epoch from b.starts_at) * 1000)::bigint,
              'until_ms', floor(extract(epoch from b.ends_at) * 1000)::bigint,
              'now_ms', floor(extract(epoch from now()) * 1000)::bigint,
              'queued', 0)
       from public.hearth_bursts b
       left join public.player_state ps on ps.user_id = b.user_id and ps.slot = b.slot
      where b.map_id = p_map and b.starts_at <= now() and b.ends_at > now()),
    (select jsonb_build_object(
              'flame', f.flame, 'kind', 'named', 'item', f.item_id,
              'by', case when coalesce(ps.presence_quiet, false) then null else left(public.hr_character_name(f.user_id, f.slot), 24) end,
              'from_ms', floor(extract(epoch from f.starts_at) * 1000)::bigint,
              'until_ms', floor(extract(epoch from f.ends_at) * 1000)::bigint,
              'now_ms', floor(extract(epoch from now()) * 1000)::bigint,
              'queued', (select count(*)::int from public.hearth_flames q where q.map_id = p_map and q.starts_at > now()))
       from public.hearth_flames f
       left join public.player_state ps on ps.user_id = f.user_id and ps.slot = f.slot
      where f.map_id = p_map and f.starts_at <= now() and f.ends_at > now()
      order by f.starts_at desc
      limit 1),
    (select jsonb_build_object(
              'flame', s.show_id, 'kind', 'bought', 'item', null, 'bought', true,
              'by', case when coalesce(ps.presence_quiet, false) then null else left(public.hr_character_name(s.user_id, s.slot), 24) end,
              'from_ms', floor(extract(epoch from s.starts_at) * 1000)::bigint,
              'until_ms', floor(extract(epoch from s.ends_at) * 1000)::bigint,
              'now_ms', floor(extract(epoch from now()) * 1000)::bigint,
              'queued', 0)
       from public.town_shows s
       left join public.player_state ps on ps.user_id = s.user_id and ps.slot = s.slot
      where s.map_id = p_map and s.sink_id = 'powder' and s.starts_at <= now() and s.ends_at > now()
      order by s.starts_at
      limit 1));
end $fn$;

-- ── §8 GRANTS: every function here is the owner's ────────────────────────────
do $mig$
declare f text;
begin
  foreach f in array array['public.hr_hearth_pause(text,timestamp with time zone,timestamp with time zone)', 'public.hr_hearth_chest_burst()',
                           'public.hr_hearth_named_after_burst()', 'public.hr_town_show_free_at(text,text)', 'public.hr_hearth_flame_of(text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
  end loop;
end $mig$;

-- ── §9 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- The probe empties the square first (the map's windows, named flames and powders, rolled back with it), so its numbers are its own.
-- now() is one instant in a transaction, so "time passes" is every Hearth row of the map moved back by the same span (pg_temp.hm_age), and a
-- key used is the press's own two writes (pg_temp.hm_press: its chest_opens row, its luck count), once the real press has been proven (d).
-- PAID SECONDS: a named flame burning when the chest opened ends exactly 59 s after the green (it had shown 1 s of its 60), and the powder
-- queued behind it starts as it ends and lasts its 30 s, whatever the chest does.
do $chk$
declare
  v_a constant uuid := '000000c0-0000-4000-a000-0000901f6b01';
  v_b constant uuid := '000000c0-0000-4000-a000-0000901f6b02';
  k   constant text := '000000c0-0000-4000-a000-0000901f';
  v jsonb; v_map text; v_price bigint; v_row jsonb; f text; v_role text; i int; v_ne timestamptz;
  v_w public.hearth_bursts%rowtype; v_named public.hearth_flames%rowtype;
begin
  v_map := (select m.map_id from public.hr_town_maps m where m.main);
  if v_map is null then raise exception 'hearth-moods §9: no main town'; end if;
  begin
    create function pg_temp.hm_age(p_map text, p_by interval) returns void language sql as $f$
      update public.hearth_bursts set starts_at = starts_at - p_by, ends_at = ends_at - p_by where map_id = p_map;
      update public.hearth_flames set starts_at = starts_at - p_by, ends_at = ends_at - p_by where map_id = p_map;
      update public.town_shows set starts_at = starts_at - p_by, ends_at = ends_at - p_by where map_id = p_map;
    $f$;
    -- a key family no week counts ('zz_probe'), so the real presses below still fit under the Tower's six
    create function pg_temp.hm_press(p_user uuid, p_n bigint, p_chest text) returns void language sql as $f$
      insert into public.chest_opens (user_id, slot, n, chest_id, key_id, key_family, stokes, cinders_spent, dry, chance_ppm, roll, intent_id)
      values (p_user, 0, p_n, p_chest, 'bronze', 'zz_probe', 0, 0, 0, 0, 999999, gen_random_uuid());
      update public.chest_luck set opens = p_n where user_id = p_user and slot = 0;
    $f$;
    -- the paid seconds: [the green's end, the named flame's end) is 59 s, the powder [its start, its end) 30 s right behind it
    create function pg_temp.hm_paid(p_map text, p_a uuid, p_b uuid) returns boolean language sql as $f$
      select (select f.ends_at from public.hearth_flames f where f.user_id = p_b and f.item_id = 'zz_probe') - (select b.ends_at from public.hearth_bursts b where b.map_id = p_map) = interval '59 seconds'
         and (select s.starts_at from public.town_shows s where s.user_id = p_a) = (select f.ends_at from public.hearth_flames f where f.user_id = p_b and f.item_id = 'zz_probe')
         and (select s.ends_at - s.starts_at from public.town_shows s where s.user_id = p_a) = interval '30 seconds'
    $f$;
    delete from public.hearth_bursts where map_id = v_map;
    delete from public.hearth_flames where map_id = v_map;
    delete from public.town_shows where map_id = v_map;
    insert into auth.users (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'hearth-moods §9 probe'), (v_b, 'hearth-moods §9 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hearth-moods §9: the other hero was not made: %', v; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hearth-moods §9: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_a and slot = 0;
    update public.account_wallet set gold = 1000000 where user_id = v_a;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_a, 0, 'tower_key_bronze', 5)
      on conflict (user_id, slot, item_id) do update set qty = 5;
    if not public.hr_feature_on('burning_tower', v_a) then
      update public.hr_feature_switches set scope = 'accounts', accounts = array[v_a] where switch_id = 'burning_tower'; end if;
    -- (a) THE PLAIN FIRE: a clean square answers null
    if public.hr_hearth_flame_of(v_map) is not null then raise exception 'hearth-moods §9(a): a clean square burns %', public.hr_hearth_flame_of(v_map); end if;
    -- (b) A BOUGHT POWDER: the square burns it, kind bought
    v_price := (public.hr_town_sink_quote(v_a, v_map, 'powder')->>'price')::bigint;
    v := public.hr_town_show(0, 'cinnabar', v_price, (k || '0b01')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hearth-moods §9(b): a powder answered %', v; end if;
    v := public.hr_hearth_flame_of(v_map);
    if v->>'flame' is distinct from 'cinnabar' or v->>'kind' is distinct from 'bought' then raise exception 'hearth-moods §9(b): the square reads %', v; end if;
    -- (c) A NAMED FLAME over it (hr_hearth_burn's own two writes): kind named, the powder waiting behind it; then a second passes
    insert into public.hearth_flames (map_id, item_id, flame, user_id, slot, starts_at, ends_at) values (v_map, 'zz_probe', 'honey', v_b, 0, now(), now() + interval '60 seconds');
    perform public.hr_town_show_push(v_map, now(), now() + interval '60 seconds');
    v := public.hr_hearth_flame_of(v_map);
    if v->>'flame' is distinct from 'honey' or v->>'kind' is distinct from 'named' then raise exception 'hearth-moods §9(c): the named flame did not come first: %', v; end if;
    perform pg_temp.hm_age(v_map, interval '1 second');
    v_ne := (select ends_at from public.hearth_flames where item_id = 'zz_probe');
    -- (d) THE CHEST, through the real press: the window wins for 10 s from now; the burning named flame keeps its start and ends 10 s later,
    --     the powder behind it moves whole
    v := public.hr_chest_open(0, 'great_hearth', 'bronze', 1, 0, (k || '0d01')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hearth-moods §9(d): the press answered %', v; end if;
    v := public.hr_hearth_flame_of(v_map);
    if v->>'flame' is distinct from 'chest' or v->>'kind' is distinct from 'chest' or (v->>'until_ms')::bigint - (v->>'from_ms')::bigint <> 10000
       or (v->>'from_ms')::bigint <> floor(extract(epoch from now()) * 1000)::bigint then
      raise exception 'hearth-moods §9(d): the chest did not win the square: %', v; end if;
    -- (k) THE ANSWER'S SHAPE: the fields the client reads, and nothing it doesn't
    if (select array_agg(key order by key) from jsonb_object_keys(v) key) is distinct from array['by', 'flame', 'from_ms', 'item', 'kind', 'now_ms', 'queued', 'until_ms'] then
      raise exception 'hearth-moods §9(k): the chest''s answer has keys %', (select array_agg(key order by key) from jsonb_object_keys(v) key); end if;
    select * into v_w from public.hearth_bursts where map_id = v_map;
    if v_w.credit <> interval '20 seconds' or v_w.opens <> 1 or v_w.user_id <> v_a then raise exception 'hearth-moods §9(d): the window row reads %', to_jsonb(v_w); end if;
    if (select ends_at from public.hearth_flames where item_id = 'zz_probe') <> v_ne + interval '10 seconds' or not pg_temp.hm_paid(v_map, v_a, v_b) then
      raise exception 'hearth-moods §9(d): a flame under the chest lost or gained time'; end if;
    -- (e) EXTEND, NOT QUEUE: 4 s on, a second key stretches the one window to 10 s past it; one row; the flames paused by the 4 s it added
    perform pg_temp.hm_age(v_map, interval '4 seconds');
    perform pg_temp.hm_press(v_a, 2, 'great_hearth');
    select * into v_w from public.hearth_bursts where map_id = v_map;
    if (select count(*) from public.hearth_bursts where map_id = v_map) <> 1 or v_w.ends_at <> now() + interval '10 seconds'
       or v_w.starts_at <> now() - interval '4 seconds' or v_w.credit <> interval '16 seconds' or v_w.opens <> 2 or not pg_temp.hm_paid(v_map, v_a, v_b) then
      raise exception 'hearth-moods §9(e): a second key did not extend the window, or the flames lost time: %', to_jsonb(v_w); end if;
    -- (f) THE CAP: a key every 4 s never holds it green past 30 s in a row (credit 16, 12, 8, 4, 0, then nothing more)
    for i in 3 .. 8 loop
      perform pg_temp.hm_age(v_map, interval '4 seconds');
      perform pg_temp.hm_press(v_a, i, 'great_hearth');
    end loop;
    select * into v_w from public.hearth_bursts where map_id = v_map;
    if v_w.ends_at - v_w.starts_at <> interval '30 seconds' or v_w.credit <> interval '0' or v_w.opens <> 8 or v_w.ends_at <> now() + interval '2 seconds'
       or not pg_temp.hm_paid(v_map, v_a, v_b) then
      raise exception 'hearth-moods §9(f): spammed keys held it green for % (credit %), or the flames lost time', v_w.ends_at - v_w.starts_at, v_w.credit; end if;
    -- the window over with 6 s of credit back: a key shows nothing (the named flame burns on); 4 s more, a whole 10 s, and a new window opens
    perform pg_temp.hm_age(v_map, interval '8 seconds');
    perform pg_temp.hm_press(v_a, 9, 'great_hearth');
    v := public.hr_hearth_flame_of(v_map);
    if v->>'kind' is distinct from 'named' or (select ends_at from public.hearth_bursts where map_id = v_map) > now() then
      raise exception 'hearth-moods §9(f): a resting square went green again: %', v; end if;
    perform pg_temp.hm_age(v_map, interval '4 seconds');
    v_ne := (select ends_at from public.hearth_flames where item_id = 'zz_probe');
    perform pg_temp.hm_press(v_a, 10, 'great_hearth');
    select * into v_w from public.hearth_bursts where map_id = v_map;
    if v_w.starts_at <> now() or v_w.ends_at <> now() + interval '10 seconds' or v_w.credit <> interval '0' or v_w.opens <> 1
       or public.hr_hearth_flame_of(v_map)->>'kind' is distinct from 'chest' or (select ends_at from public.hearth_flames where item_id = 'zz_probe') <> v_ne + interval '10 seconds' then
      raise exception 'hearth-moods §9(f): a rested square did not open a new window (or did not pause the named flame for it): %', to_jsonb(v_w); end if;
    -- (g) A NAMED FLAME BOOKED IN THE WINDOW starts when it ends, every second of it
    insert into public.hearth_flames (map_id, item_id, flame, user_id, slot, starts_at, ends_at) values (v_map, 'zz_probe2', 'amber', v_b, 0, now(), now() + interval '60 seconds')
      returning * into v_named;
    if v_named.starts_at <> v_w.ends_at or v_named.ends_at - v_named.starts_at <> interval '60 seconds' then
      raise exception 'hearth-moods §9(g): a named flame booked in the window reads [%, %)', v_named.starts_at, v_named.ends_at; end if;
    delete from public.hearth_flames where item_id = 'zz_probe2';
    -- (h) A POWDER BOOKED IN THE WINDOW waits for its end (and behind every named flame, as before)
    if public.hr_town_show_free_at(v_map, 'powder') < v_w.ends_at then raise exception 'hearth-moods §9(h): a powder may start inside the window'; end if;
    -- (i) A REFUSED PRESS, A ROLLED-BACK PRESS AND ANOTHER CHEST write nothing
    perform pg_temp.hm_age(v_map, interval '2 seconds');
    v_row := (select to_jsonb(b) from public.hearth_bursts b where b.map_id = v_map);
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_chest_open(0, 'great_hearth', 'bronze', 5, 0, (k || '0d02')::uuid);
    if coalesce(v->>'ok', '') = 'true' or (select to_jsonb(b) from public.hearth_bursts b where b.map_id = v_map) is distinct from v_row then
      raise exception 'hearth-moods §9(i): five keys from four answered % (or moved the window)', v; end if;
    begin
      delete from public.hr_rate_counters where user_id = v_a;
      v := public.hr_chest_open(0, 'great_hearth', 'bronze', 1, 0, (k || '0d03')::uuid);
      if coalesce(v->>'ok', '') <> 'true' or (select opens from public.hearth_bursts where map_id = v_map) <> 2 then
        raise exception 'hearth-moods §9(i): the press inside the savepoint did not reach the window: %', v; end if;
      raise exception using errcode = 'HR944', message = 'roll the press back';
    exception when sqlstate 'HR944' then null;
    end;
    if (select to_jsonb(b) from public.hearth_bursts b where b.map_id = v_map) is distinct from v_row then
      raise exception 'hearth-moods §9(i): a rolled-back press left its window behind'; end if;
    perform pg_temp.hm_press(v_a, 50, 'zz_other_chest');
    if (select to_jsonb(b) from public.hearth_bursts b where b.map_id = v_map) is distinct from v_row then
      raise exception 'hearth-moods §9(i): another chest coloured the Hearth'; end if;
    raise exception using errcode = 'HR941', message = 'hearth-moods §9 complete - rolling back';
  exception when sqlstate 'HR941' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b)) or exists (select 1 from auth.users where id in (v_a, v_b))
     or exists (select 1 from public.hearth_bursts where user_id in (v_a, v_b)) or to_regprocedure('pg_temp.hm_age(text,interval)') is not null then
    raise exception 'hearth-moods §9: LEAKED a probe row'; end if;
  -- (j) GRANTS AND SHAPE: no client reaches a helper or the table; the triggers stand where the contract says; the window is one row a map
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    foreach f in array array['public.hr_hearth_pause(text,timestamp with time zone,timestamp with time zone)', 'public.hr_hearth_chest_burst()',
                             'public.hr_hearth_named_after_burst()', 'public.hr_town_show_free_at(text,text)', 'public.hr_hearth_flame_of(text)'] loop
      if has_function_privilege(v_role, f, 'execute') then raise exception 'hearth-moods §9(j): % reaches %', v_role, f; end if;
    end loop;
    if has_table_privilege(v_role, 'public.hearth_bursts', 'select') or has_table_privilege(v_role, 'public.hearth_bursts', 'insert,update,delete') then
      raise exception 'hearth-moods §9(j): % reaches the table', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hearth_bursts') then raise exception 'hearth-moods §9(j): a policy opens the table'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'hr_hearth_chest_burst' and tgrelid = 'public.chest_luck'::regclass and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgname = 'hr_hearth_after_burst' and tgrelid = 'public.hearth_flames'::regclass and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgname = 'hr_gm_wall' and tgrelid = 'public.hearth_bursts'::regclass and not tgisinternal) then
    raise exception 'hearth-moods §9(j): a trigger is missing'; end if;
  if strpos((select prosrc from pg_proc where oid = 'public.hr_town_view(integer,text,integer,integer,bigint,integer,integer)'::regprocedure), 'hr_hearth_flame_of(p_map)') = 0 then
    raise exception 'hearth-moods §9(j): the town read no longer carries the square''s flame'; end if;
  if (select array_agg(a.attname::text order by a.attname) from pg_index x join pg_attribute a on a.attrelid = x.indrelid and a.attnum = any (x.indkey)
       where x.indrelid = 'public.hearth_bursts'::regclass and x.indisprimary) is distinct from array['map_id'] then
    raise exception 'hearth-moods §9(j): the window is not one row a map'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hearth-moods: one winner (chest, named, bought, plain), a window extends and never queues, 30 s green at most in a row, every paused second kept; all green';
end $chk$;
