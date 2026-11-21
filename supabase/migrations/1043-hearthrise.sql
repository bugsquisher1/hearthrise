-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1043-hearthrise.sql — THE HEARTHRISE: THE XP WEEKEND SIZED BY THE GREAT HEARTH'S FIRE, ON THE 28 DAY CALENDAR
--   (lane/c-social, backend-architect, FB-12; the designer's ruling D-7, docs/design/overhaul/review/06-designer-rulings-w1.md section 1).
--
-- STATUS: supabase/migration-notes/1043-hearthrise.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1042-hearthrise-live-events-catalogue.generated.sql (the rows, the
--   fire rule and the shape this file reads) and 1014-works-goal-sized.sql (hr_weekly_actives_count, the one definition of a weekly active
--   account). Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
-- EDGE: none. The engine is handed the dial per window (hr_hunt_instance_read's live_xp) and multiplies at each kill's own combat time,
--   unchanged; only where the dial comes from is new. ON THE EA SECURITY LIST: an XP multiplier on a ranked board.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- THE FIRE (hr_hearth_fire, one row): the fuel counted since the last lighting, the boss marks earned since then, when the count reset,
--   how far the journal is folded, and the goal the next lighting will read (fuel per active day x weekly active accounts x the days since
--   the reset, at most the rule's max_days). hr_hearth_fire_day: one account's counted fuel in one UTC day (the day cap).
-- THE FOLD (hr_hearth_fire_fold): the journal's fuel rows (player_ledger kind 'craft': an artisan settle on a fuel_<item> recipe of
--   inner_flame counts the items it burnt, 1 each; a named burn, intent hearth_burn:<item>, counts the rule's named_fuel) in
--   (folded_to, upto], each account's UTC day capped at day_cap_shares x per_active_day. At most once an hour, by one statement under a
--   try-lock (hr_hearthrise_tick, pg_cron each minute). NEVER on the settle path. Gold never moves it (only fuel rows are read).
-- THE LIGHTING (hr_hearthrise_light): a fire-sized window (hr_live_events.sized_by = 'fire') is lit once, by the first tick at or after a
--   minute before its start: the fold runs to that instant, the size is read (fuel marks = floor(marks x fuel / goal), at most `marks`;
--   marks = the smaller of `marks` and fuel marks + boss marks; pm = floor_pm + step_pm x marks) and written to hr_hearthrise_lit, then the
--   fire resets (fuel burned from that instant counts toward the next fire). A window is never lit twice (its key).
-- THE BOSS MARK (hr_hearth_fire_boss_mark): when the server drives the world boss off, the fire gains one mark, once a window (FB-13's
--   fall calls it; owner-only).
-- hr_live_xp_windows RESTATED WHOLE: a fire-sized row pays its window's lit pm (hr_hearthrise_pm); an unlit window pays the floor. Every
--   other rule (switches, scope, add then cap at the type's top) unchanged.
-- hr_live_events_view RESTATED WHOLE: one cycle ahead (28 days, so the Week card can say what comes next), the next window of each event,
--   a fire row's pm the lit size or, before it lights, the size it would light at now; `sized`, `lit` and `boss` added; a type with no dial
--   says dial null. Shape otherwise unchanged.
-- hr_live_events_announce RESTATED WHOLE: a fire row's {pct} is its window's lit size.
-- hr_hearth_fire_view (the section `hearth_fire`): the fire as the Great Hearth shows it. Null while the XP switch is off for the account.
-- THE SWITCHES: event_world_boss seeded OFF (FB-13 arms it with its boss). event_open_halls deleted: its type is retired (D-7).
--
-- ── THE RULES IT HOLDS (D-7, binding) ───────────────────────────────────────
-- No event over +25% and never two at once (27-5): the type's range [1100, 1250] and the catalogue's own check. The calendar says when it
--   lights and the fire says how big (CE-8). The size is read ONCE, at the lighting, and holds for the whole window. Fuel moves the fire and
--   gold never does (2026-11-04). One account adds at most four shares a UTC day. The boss mark is one a window.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- Every write to the fire runs under its row lock (select ... for update), so the fold, a lighting and a boss mark serialise. The tick
--   takes a transaction try-lock first, so two ticks never queue. A lighting is keyed (event, window start): a second is a no-op. A boss mark
--   is keyed by its window: a second call answers false and moves nothing. The fold advances folded_to in the same statement as the fuel, so
--   a journal row is counted once. A second apply of this file is byte-identical: create if not exists, the seed row on conflict do nothing,
--   the bodies restated whole, the cron row ensured by name.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- No client verb is added. +1 section (counts only). The XP dial's input is server rows only (the journal, the clock, the boss's fall). A
--   player moves the fire only by burning fuel, which the journal already records; buying fuel on the market and burning it is bounded by
--   the day cap and gives the buyer no edge (everyone gets the same weekend). Known and accepted by the designer (D-7 section 1.3).
--
-- ── COST (100x players) ──────────────────────────────────────────────────────
-- Each minute: one try-lock, one PK read of the fire, one window read. Each hour: one range scan of player_ledger's (at, id) primary key
--   over the hour (craft rows filtered), one upsert per account that burned fuel that day; the weekly actives count once a UTC day.
--   Rows: hr_hearth_fire_day one per account per day it burned (pruned past 35 days by the tick); hr_hearthrise_lit 13 a year;
--   hr_hearth_fire_boss 13 a year. The settle reads one PK row a lit window.
--
-- REVERSIBLE: re-apply 2027-03-22-live-events.sql's three bodies (hr_live_xp_windows, hr_live_events_view, hr_live_events_announce),
--   hr_cron_drop('hr-hearthrise'), drop the five functions, the section row and the four tables. Nothing is a player's value.
-- WIPE: hr_hearth_fire_day is per account (cascades on the account); the fire itself is the server's.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_def text;
begin
  if to_regclass('public.hr_hearth_fire_rule') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_live_events' and column_name = 'sized_by') then
    raise exception 'PRECONDITION: apply 1042-hearthrise-live-events-catalogue.generated.sql first'; end if;
  if to_regprocedure('public.hr_weekly_actives_count(uuid[])') is null then
    raise exception 'PRECONDITION: apply 1014-works-goal-sized.sql first (hr_weekly_actives_count)'; end if;
  if to_regprocedure('public.hr_live_event_windows(text,timestamp with time zone,timestamp with time zone)') is null
     or to_regclass('public.hr_live_event_notices') is null or to_regclass('public.player_ledger') is null then
    raise exception 'PRECONDITION: 2027-03-22-live-events.sql first'; end if;
  -- each body is EXACTLY the image this file was written against (normalised md5) or this file's (its marker), so a second apply after a
  -- later file moved one refuses, never undoes it
  for v_r in select * from (values
    ('public.hr_live_xp_windows(uuid,text,timestamp with time zone,timestamp with time zone)', '79d22c279b275b99d8c630e4ba9f0858'),
    ('public.hr_live_events_view(uuid,integer)', '979dca775f9dc1f2b826564cabec1bd2'),
    ('public.hr_live_events_announce(timestamp with time zone)', '0b3512bf3d7a2962ad1a6b3e08ef4150')) t(fn, pre) loop
    v_def := pg_get_functiondef(v_r.fn::regprocedure);
    if md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')) is distinct from v_r.pre and strpos(v_def, 'HEARTHRISE (1043-hearthrise.sql)') = 0 then
      raise exception 'PIN: % is neither its expected image (%) nor this file''s: md5 % - another file moved it', v_r.fn, v_r.pre,
        md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')); end if;
  end loop;
end $mig$;

-- ── §1 THE SWITCHES ──────────────────────────────────────────────────────────
insert into public.hr_feature_switches (switch_id, scope, note) values
  ('event_world_boss', 'off', '1043-hearthrise.sql: who a world_boss event (Mossback at the Mill Pond, D-6) is live for. Off until FB-13 ships the boss.')
  on conflict (switch_id) do nothing;
-- Open Halls is retired (D-7): Call out costs no gold since 2026-11-20, so its type waived nothing. No catalogue row reads the switch now.
delete from public.hr_feature_switches where switch_id = 'event_open_halls';

-- ── §2 THE FIRE ──────────────────────────────────────────────────────────────
create table if not exists public.hr_hearth_fire (
  id          boolean     primary key default true check (id),
  since       timestamptz not null,                                  -- the count last reset (the last lighting, or this file's apply)
  fuel        bigint      not null default 0 check (fuel >= 0),      -- fuel counted since `since`, each account-day capped
  boss_marks  int         not null default 0 check (boss_marks between 0 and 10),
  folded_to   timestamptz not null,                                  -- the journal is counted up to here
  actives     int         not null default 0 check (actives between 0 and 1000000),
  actives_day date,                                                  -- the UTC day the weekly actives were counted
  goal        bigint      not null default 1 check (goal >= 1),      -- what the next lighting reads the fuel against
  folded_at   timestamptz
);
create table if not exists public.hr_hearth_fire_day (
  user_id uuid   not null references auth.users (id) on delete cascade,
  day     date   not null,
  fuel    bigint not null check (fuel >= 0),
  primary key (user_id, day)
);
create table if not exists public.hr_hearthrise_lit (
  event_id   text        not null check (event_id ~ '^[a-z0-9_]{1,64}$'),
  starts     timestamptz not null,
  ends       timestamptz not null,
  pm         int         not null check (pm between 1000 and 1250),
  marks      int         not null check (marks between 0 and 10),
  fuel_marks int         not null check (fuel_marks between 0 and 10),
  boss_marks int         not null check (boss_marks between 0 and 10),
  fuel       bigint      not null check (fuel >= 0),
  goal       bigint      not null check (goal >= 1),
  actives    int         not null check (actives >= 0),
  lit_at     timestamptz not null default now(),
  primary key (event_id, starts),
  check (ends > starts)
);
create table if not exists public.hr_hearth_fire_boss (
  window_start timestamptz primary key,
  boss         text        not null check (boss ~ '^[a-z0-9_]{1,64}$'),
  at           timestamptz not null default now()
);
comment on table public.hr_hearth_fire is
  '1043-hearthrise.sql: the Great Hearth''s fire (D-7), one row: fuel and boss marks since the last lighting, the fold''s watermark, the goal the next lighting reads. Written only by the fold, the lighting and the boss mark, under its row lock.';
comment on table public.hr_hearth_fire_day is
  '1043-hearthrise.sql: one account''s fuel counted into the fire in one UTC day, held to day_cap_shares x per_active_day (D-7). Written only by hr_hearth_fire_fold.';
comment on table public.hr_hearthrise_lit is
  '1043-hearthrise.sql: one Hearthrise window''s size, read ONCE from the fire at its lighting (D-7). hr_live_xp_windows pays it for the whole window.';
comment on table public.hr_hearth_fire_boss is
  '1043-hearthrise.sql: the world boss falls that gave the fire a mark, one a window (D-7, FB-13 calls hr_hearth_fire_boss_mark).';
alter table public.hr_hearth_fire enable row level security;
alter table public.hr_hearth_fire_day enable row level security;
alter table public.hr_hearthrise_lit enable row level security;
alter table public.hr_hearth_fire_boss enable row level security;
revoke all on public.hr_hearth_fire from public, anon, authenticated, service_role;
revoke all on public.hr_hearth_fire_day from public, anon, authenticated, service_role;
revoke all on public.hr_hearthrise_lit from public, anon, authenticated, service_role;
revoke all on public.hr_hearth_fire_boss from public, anon, authenticated, service_role;
insert into public.hr_hearth_fire (id, since, folded_to) values (true, now(), now()) on conflict (id) do nothing;

-- ── §3 THE HELPERS ───────────────────────────────────────────────────────────
-- The next fire-sized window that starts at or after p_at (one cycle and more ahead), or no row.
create or replace function public.hr_hearthrise_next(p_at timestamptz)
returns table (event_id text, starts timestamptz, ends timestamptz)
language sql stable security definer set search_path = public, pg_catalog as $fn$
  select e.event_id, w.starts, w.ends
    from public.hr_live_events e
   cross join lateral public.hr_live_event_windows(e.event_id, p_at, p_at + interval '91 days') w
   where e.sized_by = 'fire' and w.starts >= p_at
   order by w.starts, e.event_id
   limit 1
$fn$;

-- The goal a lighting at p_at reads: per_active_day x weekly actives (at least 1) x the whole days since the reset (1 to max_days).
create or replace function public.hr_hearth_fire_goal(p_since timestamptz, p_at timestamptz, p_actives int)
returns bigint language sql stable security definer set search_path = public, pg_catalog as $fn$
  select greatest(1, r.per_active_day * greatest(1, coalesce(p_actives, 0))
           * least(r.max_days, greatest(1, ceil(extract(epoch from (p_at - p_since)) / 86400.0)::int)))::bigint
    from public.hr_hearth_fire_rule r where r.id
$fn$;

-- The size a fire reads at: { fuel_marks, marks, pm } (pm = floor + step x marks).
create or replace function public.hr_hearth_fire_size(p_fuel bigint, p_goal bigint, p_boss int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $fn$
  select jsonb_build_object('fuel_marks', x.fm, 'marks', x.m, 'pm', r.floor_pm + r.step_pm * x.m)
    from public.hr_hearth_fire_rule r
   cross join lateral (select least(r.marks, floor(r.marks::numeric * greatest(0, coalesce(p_fuel, 0)) / greatest(1, coalesce(p_goal, 1))))::int as fm) f
   cross join lateral (select f.fm, least(r.marks, f.fm + greatest(0, coalesce(p_boss, 0)))::int as m) x
   where r.id
$fn$;

-- A window's paid size: its lighting's, or the floor before it lights (the tick lights it a minute before its start).
create or replace function public.hr_hearthrise_pm(p_event text, p_starts timestamptz)
returns int language sql stable security definer set search_path = public, pg_catalog as $fn$
  select coalesce((select l.pm from public.hr_hearthrise_lit l where l.event_id = p_event and l.starts = p_starts),
                  (select r.floor_pm from public.hr_hearth_fire_rule r where r.id), 1000)
$fn$;

-- THE FOLD: the journal's fuel rows in (folded_to, p_upto] into the fire, each account's UTC day capped; returns the fuel added.
-- Takes the fire's row lock itself (a caller already holding it re-enters).
create or replace function public.hr_hearth_fire_fold(p_upto timestamptz)
returns bigint language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  r public.hr_hearth_fire_rule%rowtype; f public.hr_hearth_fire%rowtype; v_to timestamptz; v_cap bigint;
  b record; v_old bigint; v_new bigint; v_added bigint := 0; v_next record;
begin
  -- HEARTHRISE (1043-hearthrise.sql): the one fold. Fuel only: an artisan settle of a fuel_<item> recipe on inner_flame (the items it
  -- burnt) and a named burn (the rule's named_fuel). Never gold, never a client number.
  select * into r from public.hr_hearth_fire_rule where id;
  select * into f from public.hr_hearth_fire where id for update;
  if r.id is null or f.id is null then return 0; end if;
  v_to := least(coalesce(p_upto, now()), now());
  v_cap := r.day_cap_shares::bigint * r.per_active_day;
  if v_to > f.folded_to then
    for b in
      select l.user_id, (l.at at time zone 'UTC')::date as day,
             sum(case when l.intent like 'hearth\_burn:%' then r.named_fuel::bigint
                      else greatest(0, -coalesce((l.meta->'delta'->'i'->>substr(l.meta->>'recipe', 6))::bigint, 0)) end)::bigint as fuel
        from public.player_ledger l
       where l.at > f.folded_to and l.at <= v_to and l.kind = 'craft' and l.user_id is not null
         and ((l.intent = 'accrue' and l.meta->>'skill' = 'inner_flame' and l.meta->>'recipe' like 'fuel\_%')
              or l.intent like 'hearth\_burn:%')
       group by 1, 2
       order by 1, 2
    loop
      continue when b.fuel <= 0;
      select d.fuel into v_old from public.hr_hearth_fire_day d where d.user_id = b.user_id and d.day = b.day;
      v_old := coalesce(v_old, 0);
      v_new := least(v_cap, v_old + b.fuel);
      if v_new > v_old then
        insert into public.hr_hearth_fire_day as d (user_id, day, fuel) values (b.user_id, b.day, v_new)
          on conflict (user_id, day) do update set fuel = excluded.fuel;
        v_added := v_added + (v_new - v_old);
      end if;
    end loop;
  end if;
  -- the weekly actives, once a UTC day (1014's one definition); the goal the next lighting reads
  if f.actives_day is distinct from (now() at time zone 'UTC')::date then
    f.actives := least(public.hr_weekly_actives_count(null), 1000000);
    f.actives_day := (now() at time zone 'UTC')::date;
  end if;
  select * into v_next from public.hr_hearthrise_next(now());
  update public.hr_hearth_fire
     set fuel = fuel + v_added, folded_to = greatest(folded_to, v_to), folded_at = now(),
         actives = f.actives, actives_day = f.actives_day,
         goal = public.hr_hearth_fire_goal(since, coalesce(v_next.starts, now()), f.actives)
   where id;
  return v_added;
end $fn$;

-- THE LIGHTING: each fire-sized window due by p_at (its start at most a minute away, not yet over) and not yet lit is lit now: the fold
-- runs to this instant, the size is read once and written, and the fire resets. Returns the windows lit.
create or replace function public.hr_hearthrise_light(p_at timestamptz)
returns int language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_lead constant interval := interval '1 minute';
  v_at timestamptz := least(coalesce(p_at, now()), now());
  w record; f public.hr_hearth_fire%rowtype; v_size jsonb; v_goal bigint; v_n int := 0; v_ins int;
begin
  -- HEARTHRISE (1043-hearthrise.sql): a minute's lead so a settle never reads the window before its size is written.
  for w in
    select e.event_id, x.starts, x.ends
      from public.hr_live_events e
     cross join lateral public.hr_live_event_windows(e.event_id, v_at - interval '7 days', v_at + c_lead + interval '1 millisecond') x
     where e.sized_by = 'fire' and x.starts <= v_at + c_lead and x.ends > v_at
       and not exists (select 1 from public.hr_hearthrise_lit l where l.event_id = e.event_id and l.starts = x.starts)
     order by x.starts, e.event_id
  loop
    perform public.hr_hearth_fire_fold(v_at);
    select * into f from public.hr_hearth_fire where id for update;
    v_goal := public.hr_hearth_fire_goal(f.since, v_at, f.actives);
    v_size := public.hr_hearth_fire_size(f.fuel, v_goal, f.boss_marks);
    insert into public.hr_hearthrise_lit (event_id, starts, ends, pm, marks, fuel_marks, boss_marks, fuel, goal, actives, lit_at)
    values (w.event_id, w.starts, w.ends, (v_size->>'pm')::int, (v_size->>'marks')::int, (v_size->>'fuel_marks')::int,
            least(f.boss_marks, 10), f.fuel, v_goal, f.actives, v_at)
    on conflict (event_id, starts) do nothing;
    get diagnostics v_ins = row_count;
    continue when v_ins = 0;
    -- THE RESET: fuel from this instant counts toward the next fire.
    update public.hr_hearth_fire set fuel = 0, boss_marks = 0, since = v_at, folded_to = greatest(folded_to, v_at) where id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $fn$;

-- THE BOSS MARK: the fire gains one mark when the server drives a world boss off, once for each of his windows. True when this call gave it.
create or replace function public.hr_hearth_fire_boss_mark(p_window_start timestamptz, p_boss text)
returns boolean language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_ins int;
begin
  -- HEARTHRISE (1043-hearthrise.sql): FB-13's fall calls this; nobody else.
  if p_window_start is null or p_boss is null or p_boss !~ '^[a-z0-9_]{1,64}$' then return false; end if;
  perform 1 from public.hr_hearth_fire where id for update;
  insert into public.hr_hearth_fire_boss (window_start, boss) values (p_window_start, p_boss) on conflict (window_start) do nothing;
  get diagnostics v_ins = row_count;
  if v_ins = 0 then return false; end if;
  update public.hr_hearth_fire set boss_marks = least(10, boss_marks + 1) where id;
  return true;
end $fn$;

-- THE TICK (pg_cron, each minute): light what is due; fold the journal when the last fold is an hour old; prune old day rows.
create or replace function public.hr_hearthrise_tick()
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_lit int := 0; v_added bigint := null; v_last timestamptz;
begin
  -- HEARTHRISE (1043-hearthrise.sql): one tick at a time; a busy tick skips, the next minute catches up.
  if not pg_try_advisory_xact_lock(hashtext('hr_hearthrise_tick')) then return jsonb_build_object('ok', false, 'busy', true); end if;
  v_lit := public.hr_hearthrise_light(now());
  select folded_at into v_last from public.hr_hearth_fire where id;
  if v_last is null or v_last <= now() - interval '1 hour' then
    v_added := public.hr_hearth_fire_fold(now());
    delete from public.hr_hearth_fire_day where day < (now() at time zone 'UTC')::date - 35;
  end if;
  return jsonb_build_object('ok', true, 'lit', v_lit, 'added', v_added);
end $fn$;

-- ── §4 THE XP WINDOWS, THE SECTION AND THE ANNOUNCER ─────────────────────────
create or replace function public.hr_live_xp_windows(p_user uuid, p_ground text, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_out jsonb;
begin
  -- HEARTHRISE (1043-hearthrise.sql): a fire-sized row pays its window's lit size (hr_hearthrise_pm); every other rule is 2027-03-22's.
  if p_user is null or p_ground is null or p_from is null or p_to is null or p_to <= p_from then return '[]'::jsonb; end if;
  -- the early out: no XP type switched on for this account, nothing to read
  if not exists (select 1 from public.hr_live_event_types t where t.dial = 'xpPm' and public.hr_feature_on(t.switch_id, p_user)) then
    return '[]'::jsonb; end if;
  with ev as (
    select e.event_id, e.pm, e.sized_by, t.hi
      from public.hr_live_events e join public.hr_live_event_types t on t.type_id = e.type_id
     where t.dial = 'xpPm' and (e.scope @> array['world'] or e.scope @> array[p_ground]) and public.hr_feature_on(t.switch_id, p_user)),
  w as (
    select case when ev.sized_by = 'fire' then public.hr_hearthrise_pm(ev.event_id, x.starts) else ev.pm end as pm, ev.hi,
           greatest(x.starts, p_from) as a, least(x.ends, p_to) as b
      from ev cross join lateral public.hr_live_event_windows(ev.event_id, p_from, p_to) x),
  pts as (select a as p from w union select b from w),
  seg as (select p as a, lead(p) over (order by p) as b from pts),
  dial as (
    select s.a, s.b, least(min(w.hi), 1000 + sum(w.pm - 1000))::int as pm
      from seg s join w on w.a <= s.a and w.b >= s.b
     where s.b is not null and s.b > s.a
     group by s.a, s.b)
  select coalesce(jsonb_agg(jsonb_build_array(floor(extract(epoch from d.a) * 1000)::bigint, floor(extract(epoch from d.b) * 1000)::bigint, d.pm)
                            order by d.a), '[]'::jsonb)
    into v_out from dial d where d.pm <> 1000;
  return v_out;
end $fn$;

create or replace function public.hr_live_events_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_out jsonb; v_fire public.hr_hearth_fire%rowtype; v_proj int;
begin
  -- HEARTHRISE (1043-hearthrise.sql): one cycle ahead, the next window of each event; a fire row's pm is its lit size, or the size it would
  -- light at now; a type with no dial says dial null and names its boss.
  if p_user is null or not exists (select 1 from public.hr_live_event_types t where public.hr_feature_on(t.switch_id, p_user)) then return null; end if;
  select * into v_fire from public.hr_hearth_fire where id;
  v_proj := coalesce((public.hr_hearth_fire_size(v_fire.fuel, v_fire.goal, v_fire.boss_marks)->>'pm')::int,
                     (select r.floor_pm from public.hr_hearth_fire_rule r where r.id));
  select jsonb_agg(jsonb_build_object('id', x.event_id, 'type', x.type_id, 'dial', x.dial,
                                      'pm', case when x.sized_by = 'fire' then coalesce(x.lit_pm, v_proj) else x.pm end,
                                      'scope', to_jsonb(x.scope), 'starts', x.starts, 'ends', x.ends, 'live', x.starts <= now(),
                                      'sized', x.sized_by, 'lit', x.lit_pm is not null, 'boss', x.boss)
                   order by x.starts, x.event_id)
    into v_out
    from (select e.event_id, e.type_id, t.dial, e.pm, e.sized_by, e.boss, e.scope, w.starts, w.ends,
                 (select l.pm from public.hr_hearthrise_lit l where l.event_id = e.event_id and l.starts = w.starts) as lit_pm
            from public.hr_live_events e
            join public.hr_live_event_types t on t.type_id = e.type_id
           cross join lateral (select y.starts, y.ends from public.hr_live_event_windows(e.event_id, now(), now() + interval '28 days') y
                                order by y.starts limit 1) w
           where public.hr_feature_on(t.switch_id, p_user)) x;
  return v_out;
end $fn$;

create or replace function public.hr_live_events_announce(p_at timestamptz default now())
returns int language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_claims text := current_setting('request.jwt.claims', true);
  r record; w record; v_edge text; v_at timestamptz; v_on boolean; v_body text; v_next timestamptz; v_n int := 0; v_ins int; v_pm int;
  utc constant text := 'FMDay at HH24:MI "UTC"';
begin
  -- HEARTHRISE (1043-hearthrise.sql): a fire row's {pct} is its window's lit size; everything else is 2027-03-22's.
  for r in select e.*, t.switch_id, t.dial from public.hr_live_events e join public.hr_live_event_types t on t.type_id = e.type_id order by e.event_id loop
    for w in select * from public.hr_live_event_windows(r.event_id, p_at - interval '1 hour' - make_interval(hours => r.hours), p_at + interval '1 millisecond') loop
      foreach v_edge in array array['start', 'end'] loop
        v_at := case v_edge when 'start' then w.starts else w.ends end;
        continue when v_at > p_at or v_at <= p_at - interval '1 hour';
        v_on := exists (select 1 from public.hr_feature_switches f where f.switch_id = r.switch_id and f.scope = 'everyone');
        insert into public.hr_live_event_notices (event_id, window_start, edge, lines) values (r.event_id, w.starts, v_edge, case when v_on then 1 else 0 end)
          on conflict do nothing;
        get diagnostics v_ins = row_count;
        continue when v_ins = 0 or not v_on;
        v_pm := case when r.sized_by = 'fire' then public.hr_hearthrise_pm(r.event_id, w.starts) else r.pm end;
        v_body := case v_edge when 'start' then r.start_words else r.end_words end;
        v_body := replace(v_body, '{pct}', ((v_pm - 1000) / 10)::text);
        v_body := replace(v_body, '{end}', to_char(w.ends at time zone 'UTC', utc));
        select y.starts into v_next from public.hr_live_event_windows(r.event_id, w.ends, w.ends + make_interval(days => coalesce(r.every_days, 0) + 1)) y
         where y.starts >= w.ends order by y.starts limit 1;
        v_body := case when v_next is null then regexp_replace(v_body, '\s*[^.]*\{next\}[^.]*\.', '')
                       else replace(v_body, '{next}', to_char(v_next at time zone 'UTC', 'FMDay DD FMMonth at HH24:MI "UTC"')) end;
        perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
        insert into public.chat_messages (id, channel, from_id, from_name, body) values (gen_random_uuid(), 'system', null, 'Havora', left(v_body, 240));
        perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true), set_config('request.jwt.claims', coalesce(v_claims, ''), true);
        v_n := v_n + 1;
      end loop;
    end loop;
  end loop;
  return v_n;
end $fn$;

-- THE SECTION `hearth_fire`: the fire as the Great Hearth shows it, or null while the XP switch is off for the account.
create or replace function public.hr_hearth_fire_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare f public.hr_hearth_fire%rowtype; r public.hr_hearth_fire_rule%rowtype; v_size jsonb; v_next record; v_lit public.hr_hearthrise_lit%rowtype;
        v_fm int; v_need bigint;
begin
  -- HEARTHRISE (1043-hearthrise.sql): counts only. `need` is the fuel to the next fuel mark (null when the fire is full).
  if p_user is null or not exists (select 1 from public.hr_live_event_types t where t.dial = 'xpPm' and public.hr_feature_on(t.switch_id, p_user)) then
    return null; end if;
  select * into f from public.hr_hearth_fire where id;
  select * into r from public.hr_hearth_fire_rule where id;
  if f.id is null or r.id is null then return null; end if;
  v_size := public.hr_hearth_fire_size(f.fuel, f.goal, f.boss_marks);
  v_fm := (v_size->>'fuel_marks')::int;
  v_need := case when (v_size->>'marks')::int >= r.marks or v_fm >= r.marks then null
                 else greatest(1, ceil((v_fm + 1)::numeric * f.goal / r.marks)::bigint - f.fuel) end;
  select * into v_next from public.hr_hearthrise_next(now());
  select * into v_lit from public.hr_hearthrise_lit l where l.starts <= now() and l.ends > now() order by l.starts desc limit 1;
  return jsonb_build_object('marks', (v_size->>'marks')::int, 'of', r.marks, 'fuel_marks', v_fm, 'boss_marks', f.boss_marks,
    'fuel', f.fuel, 'goal', f.goal, 'need', v_need, 'pm', (v_size->>'pm')::int, 'full', (v_size->>'marks')::int >= r.marks,
    'next', case when v_next.event_id is not null then jsonb_build_object('id', v_next.event_id, 'starts', v_next.starts, 'ends', v_next.ends) end,
    'lit', case when v_lit.event_id is not null then jsonb_build_object('id', v_lit.event_id, 'pm', v_lit.pm, 'starts', v_lit.starts, 'ends', v_lit.ends) end);
end $fn$;
insert into public.hr_state_sections (key, fn, note) values
  ('hearth_fire', 'hr_hearth_fire_view', '1043-hearthrise.sql: the Great Hearth''s fire (D-7): marks, fuel, goal, the fuel to the next mark, the next lighting, a lit weekend; null while the XP switch is off')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §5 THE CRON ROW AND THE GRANTS ───────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null or to_regprocedure('public.hr_cron_ensure(text,text,text)') is null then
    raise notice 'hearthrise §5: pg_cron absent here; hr-hearthrise is not scheduled'; return; end if;
  perform public.hr_cron_ensure('hr-hearthrise', '* * * * *', 'select public.hr_hearthrise_tick()');
end $mig$;

do $grants$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_hearthrise_next(timestamp with time zone)',
                               'public.hr_hearth_fire_goal(timestamp with time zone,timestamp with time zone,integer)',
                               'public.hr_hearth_fire_size(bigint,bigint,integer)', 'public.hr_hearthrise_pm(text,timestamp with time zone)',
                               'public.hr_hearth_fire_fold(timestamp with time zone)', 'public.hr_hearthrise_light(timestamp with time zone)',
                               'public.hr_hearth_fire_boss_mark(timestamp with time zone,text)', 'public.hr_hearthrise_tick()',
                               'public.hr_hearth_fire_view(uuid,integer)',
                               'public.hr_live_xp_windows(uuid,text,timestamp with time zone,timestamp with time zone)',
                               'public.hr_live_events_view(uuid,integer)', 'public.hr_live_events_announce(timestamp with time zone)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $grants$;


-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ───────
-- (a) no client role reaches a function or a table here; the switch rows; the cron row; the section row
-- (b) THE FOLD: an artisan fuel settle counts the items it burnt, a named burn counts an hour of bones, a craft that is not fuel counts
--     nothing; one account's UTC day is held to its cap; a second fold over the same span adds nothing. The probe's rows sit in a past
--     span no real row is in, and the fire is moved past the real journal before the lighting, so a live server's burns never enter it.
-- (c) THE LIGHTING reads the size ONCE: the marks from the fuel against the goal plus the boss mark, the pm floor + step x marks; the fire
--     resets; a second lighting of the window changes nothing; fuel after the lighting counts toward the next fire. The size helper holds
--     floor .. floor + step x marks.
-- (d) THE BOSS MARK is one a window
-- (e) THE WEEKEND ON A CLOSED HUNT BY THE SERVER CLOCK: hr_live_xp_windows (what hr_hunt_instance_read hands the settle, browser or no
--     browser) pays the lit pm over the window and nothing outside it; an unlit window pays the floor; a row past +25% is refused; a switch
--     off pays nothing
-- (f) the view and the section read the lit size and the switch
do $$
declare
  c_a   constant uuid := '000000c0-0000-4000-a000-0000f12e0001';
  c_b   constant uuid := '000000c0-0000-4000-a000-0000f12e0002';
  c_day constant timestamptz := '2020-01-06 00:00:00+00';   -- a span before every real row
  v_role text; v_sig text; v jsonb; v_b bigint; v_cap bigint; r public.hr_hearth_fire_rule%rowtype;
  v_now timestamptz := date_trunc('second', now()); v_at timestamptz; v_start timestamptz; v_lit public.hr_hearthrise_lit%rowtype;
  v_f public.hr_hearth_fire%rowtype; v_switch text;
begin
  -- (a)
  foreach v_sig in array array['public.hr_hearthrise_next(timestamp with time zone)', 'public.hr_hearth_fire_fold(timestamp with time zone)',
                               'public.hr_hearthrise_light(timestamp with time zone)', 'public.hr_hearth_fire_boss_mark(timestamp with time zone,text)',
                               'public.hr_hearthrise_tick()', 'public.hr_hearth_fire_view(uuid,integer)', 'public.hr_hearthrise_pm(text,timestamp with time zone)',
                               'public.hr_live_xp_windows(uuid,text,timestamp with time zone,timestamp with time zone)',
                               'public.hr_live_events_view(uuid,integer)', 'public.hr_live_events_announce(timestamp with time zone)'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(v_role, v_sig::regprocedure, 'execute') then raise exception 'hearthrise §6(a): % reaches %', v_role, v_sig; end if;
    end loop;
  end loop;
  foreach v_sig in array array['hr_hearth_fire', 'hr_hearth_fire_day', 'hr_hearthrise_lit', 'hr_hearth_fire_boss', 'hr_hearth_fire_rule'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, ('public.' || v_sig)::regclass, 'select,insert,update,delete') then
        raise exception 'hearthrise §6(a): % reaches %', v_role, v_sig; end if;
    end loop;
  end loop;
  if not exists (select 1 from public.hr_feature_switches where switch_id = 'event_world_boss')
     or exists (select 1 from public.hr_feature_switches where switch_id = 'event_open_halls')
     or exists (select 1 from public.hr_live_event_types where type_id = 'open_halls') then
    raise exception 'hearthrise §6(a): the switches are not event_world_boss in and event_open_halls out'; end if;
  if (select fn from public.hr_state_sections where key = 'hearth_fire') is distinct from 'hr_hearth_fire_view' then
    raise exception 'hearthrise §6(a): the hearth_fire section is not registered'; end if;
  if to_regclass('cron.job') is not null and not exists (select 1 from cron.job where jobname = 'hr-hearthrise' and command = 'select public.hr_hearthrise_tick()') then
    raise exception 'hearthrise §6(a): the hr-hearthrise cron row is missing'; end if;
  select * into r from public.hr_hearth_fire_rule where id;
  v_cap := r.day_cap_shares::bigint * r.per_active_day;
  select t.switch_id into v_switch from public.hr_live_event_types t where t.type_id = 'xp_bonus';
  if (public.hr_hearth_fire_size(0, 1000, 0)->>'pm')::int <> r.floor_pm
     or (public.hr_hearth_fire_size(1000000, 1, 0)->>'pm')::int <> r.floor_pm + r.step_pm * r.marks
     or (public.hr_hearth_fire_size(0, 1000, 99)->>'marks')::int <> r.marks
     or r.floor_pm + r.step_pm * r.marks > 1250 then
    raise exception 'hearthrise §6(c): the size is not floor .. floor + step x marks, at most +25%%'; end if;

  begin
    insert into auth.users (id) values (c_a), (c_b) on conflict (id) do nothing;
    update public.hr_hearth_fire set fuel = 0, boss_marks = 0, since = c_day, folded_to = c_day,
                                     actives = 1, actives_day = (now() at time zone 'UTC')::date, folded_at = null where id;
    -- (b) THE FOLD
    insert into public.player_ledger (user_id, slot, kind, intent, at, meta) values
      (c_a, 0, 'craft', 'accrue', c_day + interval '1 minute', jsonb_build_object('delta', jsonb_build_object('i', jsonb_build_object('bones', -40)), 'recipe', 'fuel_bones', 'skill', 'inner_flame')),
      (c_a, 1, 'craft', 'accrue', c_day + interval '2 minutes', jsonb_build_object('delta', jsonb_build_object('i', jsonb_build_object('lamp_jelly', -10)), 'recipe', 'fuel_lamp_jelly', 'skill', 'inner_flame')),
      (c_a, 0, 'craft', 'hearth_burn:queens_comb', c_day + interval '3 minutes', jsonb_build_object('delta', jsonb_build_object('i', jsonb_build_object('queens_comb', -1)), 'reason', 'hearth_named')),
      (c_a, 0, 'craft', 'accrue', c_day + interval '4 minutes', jsonb_build_object('delta', jsonb_build_object('i', jsonb_build_object('iron_ore', -500)), 'recipe', 'smelt_iron', 'skill', 'smithing')),
      (c_b, 0, 'craft', 'accrue', c_day + interval '5 minutes', jsonb_build_object('delta', jsonb_build_object('i', jsonb_build_object('bones', -(v_cap + 900))), 'recipe', 'fuel_bones', 'skill', 'inner_flame'));
    v_b := public.hr_hearth_fire_fold(c_day + interval '1 hour');
    if v_b is distinct from 40 + 10 + r.named_fuel + v_cap then
      raise exception 'hearthrise §6(b): the fold added %, want % (fuel 50, a named %, the capped account %)', v_b, 50 + r.named_fuel + v_cap, r.named_fuel, v_cap; end if;
    if (select fuel from public.hr_hearth_fire_day where user_id = c_b) is distinct from v_cap then
      raise exception 'hearthrise §6(b): the day cap did not hold'; end if;
    if public.hr_hearth_fire_fold(c_day + interval '1 hour') <> 0 or (select fuel from public.hr_hearth_fire where id) <> v_b then
      raise exception 'hearthrise §6(b): a second fold over the same span counted again'; end if;
    -- (d) THE BOSS MARK, once a window
    if not public.hr_hearth_fire_boss_mark(c_day + interval '7 days', 'mossback') then
      raise exception 'hearthrise §6(d): the first fall of a window gave no mark'; end if;
    if public.hr_hearth_fire_boss_mark(c_day + interval '7 days', 'mossback') or (select boss_marks from public.hr_hearth_fire where id) <> 1 then
      raise exception 'hearthrise §6(d): the boss mark is not one a window'; end if;
    -- (c) THE LIGHTING, in the probe's past span, of a window that starts thirty seconds later
    v_at := c_day + interval '2 hours';
    v_start := v_at + interval '30 seconds';
    update public.hr_live_events set first_at = v_start where event_id = 'hearthrise';
    if public.hr_hearthrise_light(v_at) <> 1 then raise exception 'hearthrise §6(c): the due window was not lit'; end if;
    select * into v_lit from public.hr_hearthrise_lit where event_id = 'hearthrise' and starts = v_start;
    v := public.hr_hearth_fire_size(v_b, public.hr_hearth_fire_goal(c_day, v_at, 1), 1);
    if v_lit.pm is distinct from (v->>'pm')::int or v_lit.marks is distinct from (v->>'marks')::int or v_lit.boss_marks <> 1
       or v_lit.pm <> r.floor_pm + r.step_pm * v_lit.marks or v_lit.fuel <> v_b or v_lit.lit_at <> v_at then
      raise exception 'hearthrise §6(c): lit % but the fire reads %', row_to_json(v_lit), v; end if;
    select * into v_f from public.hr_hearth_fire where id;
    if v_f.fuel <> 0 or v_f.boss_marks <> 0 or v_f.since <> v_at then raise exception 'hearthrise §6(c): the fire did not reset: %', row_to_json(v_f); end if;
    if public.hr_hearthrise_light(v_at) <> 0 or (select count(*) from public.hr_hearthrise_lit where event_id = 'hearthrise' and starts = v_start) <> 1 then
      raise exception 'hearthrise §6(c): a window was lit twice'; end if;
    insert into public.player_ledger (user_id, slot, kind, intent, at, meta) values
      (c_a, 0, 'craft', 'accrue', v_at + interval '5 seconds', jsonb_build_object('delta', jsonb_build_object('i', jsonb_build_object('bones', -7)), 'recipe', 'fuel_bones', 'skill', 'inner_flame'));
    perform public.hr_hearth_fire_fold(v_at + interval '1 hour');
    if (select fuel from public.hr_hearth_fire where id) <> 7 then raise exception 'hearthrise §6(c): fuel after the lighting did not count toward the next fire'; end if;
    -- (e) THE WEEKEND ON A CLOSED HUNT, by the server clock (the switch armed for the probe account only)
    update public.hr_feature_switches set scope = 'accounts', accounts = array[c_a] where switch_id = v_switch;
    v := public.hr_live_xp_windows(c_a, 'mill_cellar', v_start - interval '1 hour', v_start + interval '2 hours');
    if jsonb_array_length(v) <> 1 or (v->0->>0)::bigint <> floor(extract(epoch from v_start) * 1000)::bigint or (v->0->>2)::int <> v_lit.pm then
      raise exception 'hearthrise §6(e): the closed hunt reads % over the lit window (pm %)', v, v_lit.pm; end if;
    if public.hr_live_xp_windows(c_b, 'mill_cellar', v_start - interval '1 hour', v_start + interval '2 hours') <> '[]'::jsonb then
      raise exception 'hearthrise §6(e): a switch off for the account still paid'; end if;
    if (public.hr_live_xp_windows(c_a, 'mill_cellar', v_start + interval '28 days', v_start + interval '28 days 1 hour')->0->>2)::int <> r.floor_pm then
      raise exception 'hearthrise §6(e): an unlit window does not pay the floor'; end if;
    begin
      update public.hr_live_events set pm = 1251 where event_id = 'hearthrise';
      raise exception 'hearthrise §6(e): a row past +25%% was stored';
    exception when check_violation then null;
    end;
    -- (f) the view: the next window, unlit, reads the size the fire would light at now; lit, its lit size. The section reads the fire.
    select x.starts, x.ends into v_start, v_at from public.hr_live_event_windows('hearthrise', now(), now() + interval '28 days') x order by x.starts limit 1;
    v := public.hr_live_events_view(c_a, 0);
    if v is null or not exists (select 1 from jsonb_array_elements(v) e where e->>'id' = 'hearthrise' and e->>'sized' = 'fire' and not (e->>'lit')::boolean
                                  and (e->>'pm')::int = (public.hr_hearth_fire_size(7, (select goal from public.hr_hearth_fire where id), 0)->>'pm')::int) then
      raise exception 'hearthrise §6(f): the view reads % before the lighting', v; end if;
    insert into public.hr_hearthrise_lit (event_id, starts, ends, pm, marks, fuel_marks, boss_marks, fuel, goal, actives)
      values ('hearthrise', v_start, v_at, r.floor_pm + r.step_pm * 3, 3, 3, 0, 1, 1, 1);
    v := public.hr_live_events_view(c_a, 0);
    if not exists (select 1 from jsonb_array_elements(v) e where e->>'id' = 'hearthrise' and (e->>'lit')::boolean and (e->>'pm')::int = r.floor_pm + r.step_pm * 3) then
      raise exception 'hearthrise §6(f): the view reads % for a window lit at %', v, r.floor_pm + r.step_pm * 3; end if;
    if public.hr_hearth_fire_view(c_b, 0) is not null or (public.hr_hearth_fire_view(c_a, 0)->>'fuel')::bigint <> 7 then
      raise exception 'hearthrise §6(f): the section reads % and %', public.hr_hearth_fire_view(c_b, 0), public.hr_hearth_fire_view(c_a, 0); end if;
    raise exception using errcode = 'HR924', message = 'hearthrise §6 complete - rolling back';
  exception when sqlstate 'HR924' then null;
  end;
  if exists (select 1 from public.player_ledger where user_id in (c_a, c_b))
     or exists (select 1 from public.hr_hearth_fire_day where user_id in (c_a, c_b))
     or exists (select 1 from public.hr_hearth_fire_boss where window_start = c_day + interval '7 days') then
    raise exception 'hearthrise §6: LEAKED a probe row'; end if;
  raise notice 'hearthrise: the fire folds fuel only and caps an account-day; a window lights once at its size and resets the fire; a closed hunt pays it';
end $$;
