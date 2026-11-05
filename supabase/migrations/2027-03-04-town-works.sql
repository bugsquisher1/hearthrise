-- ════════════════════════════════════════════════════════════════════════
-- 2027-03-04-town-works.sql — THE TOWN WORKS: THE WHOLE SERVER GIVES GOLD, AND HAVORA RAISES THE WEIGHHOUSE
--   (lane/c-town-works-code, systems-engineer, 2026-11-05; Tyler 2026-11-04: a server-wide donation project that changes the town, with a plaque;
--   the designer's board section "2026-11-04 Gold sinks").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on its passing §7;
-- ON THE EA SECURITY LIST: money, and a shared surface. EDGE: this file needs none, but the map rows it goes with (sites.js, greenery.js) are in the hr-accrue bundle, so the
-- set deploys for the hash; no engine reads the lot, and an old engine runs on this database unchanged. CLIENT: the Works tab rides the next release AFTER this applies.
-- APPLY ORDER: after 2027-03-04-town-works-catalogue.generated.sql, and after every 2027-02-27-* file.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- hr_town_works_give(p_slot int, p_project text, p_amount bigint, p_idem uuid): the gift is the one client number, and the verb refuses it under its own clock, before any charge.
--   Refusals, each charging nothing: bad_slot, bad_idem, bad_amount, not_a_project, rate_limited (its own bucket), no_character, insufficient_gold (hr_apply's),
--   works_done, works_limit {per_day}, works_small {min}, works_short {left, name}, works_over {left}. A hunting hero may give: the purse is the account's and nothing walks.
--   The answer: {ok, version, project, amount, total, goal, stage, given_today, left_today}.
-- hr_town_works_view(p_slot): the Works tab's read, while it's on show, never in the envelope. The project, its total and stages, today's allowance, the last gift, this
--   account's total and place, and the plaque.
-- hr_town_extras(p_map): the map's read, on every hr_town_view: {works: {<project>: <stage>}}. A town building stands on its stage for everyone.
--
-- ── WHAT MUST STAY TRUE ──────────────────────────────────────────────────────
-- VISUAL ONLY, NO BUFF: a gold-funded power effect is on Tyler's avoid list. Nothing in the engine, XP, drops or prices reads a project's total or gifts. tests/town-works.mjs
--   TW-NO-BUFF is the standing guard: only the functions named here may read the tables, only hr_town_view reads hr_town_extras, and no edge or core file names them.
-- ONLY hr_town_works_give WRITES THE TOTALS. One journal row per gift, kind shop, intent town_works:<project>:<amount>. A replayed key charges once.
-- THE DAILY CAP IS THE ACCOUNT'S, across all its heroes, under hr:sink:<uid>, or two heroes pressing together both read what's left. It's read from town_works_gifts, not the
--   ledger: a gift's amount is the number that matters, and the row is one indexed probe.
-- NOBODY OVERFILLS THE PROJECT, AND A LOST RACE CHARGES NOTHING. What's left is read before the charge, and again under the project's key after it. A gift that no longer fits
--   RAISES inside the charge's block and rolls back whole: purse, journal, intent, gold given, totals, gifts, line.
-- EACH STAGE'S LINE FIRES ONCE PER CROSSING: only the holder of the project's key moves the total, and a line fires when old total < stage <= new total. A gift that crosses two stages says both.
-- THE LAST COINS CAN BE GIVEN: a gift that exactly finishes the project may be under the smallest gift, or 50 gp left would refuse every gift forever.
-- LOCK ORDER: hero, hr:sink:<uid>, hr_apply (the purse), then the project's key, so one account's settle can't hold the Works.
-- THE STAGE LINE IS THE TOWN'S: it names no giver, a blocked or quiet giver changes nothing, and no player's text is in it. hr_chat_name_authority stamps every insert made under a
--   session as that session's hero, so hr_town_notice makes its one insert with the session's claims cleared.
-- THE PLAQUE: top accounts by gold given to the project, each as its lead hero (whichever gave most, lowest slot on a tie), the boards' hiding: hr_lb_hidden takes a hero out, an
--   account with no hero left to show holds no place, hr_name_blocked reads "Name hidden". No account id leaves: only the viewer's own row is marked.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- hr_town_view (every 2 s per viewer) gains one primary-key probe of the totals beside a catalogue of one row per project, stage computed from an array of five.
-- town_works_gifts: one row per account per project, about 120 bytes: 100x (2,000 accounts) is under 1 MB. A plaque read walks the index for 10 rows; the viewer's place walks the
-- accounts ahead of it, while the tab is on show, at most every 15 s per viewer.
--
-- REVERSIBILITY: re-create the stub hr_town_extras (2027-02-27-gold-sinks-seams.sql §2); drop the verb and the read with their baseline rows, the helpers and the two tables. Gold given stays spent.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_town_works') is null then raise exception 'PRECONDITION: apply 2027-03-04-town-works-catalogue.generated.sql first'; end if;
  if to_regprocedure('public.hr_gold_given_add(uuid,integer,bigint)') is null then raise exception 'PRECONDITION: apply 2027-02-27-gold-given.sql first'; end if;
  if to_regprocedure('public.hr_sink_lock(uuid)') is null or to_regprocedure('public.hr_town_extras(text)') is null then raise exception 'PRECONDITION: apply 2027-02-27-gold-sinks-seams.sql first'; end if;
  if to_regclass('public.hr_lb_hidden') is null or to_regprocedure('public.hr_name_blocked(text)') is null then raise exception 'PRECONDITION: the boards and the name rules are absent'; end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
-- No row reads as 0, so the wipe's truncate needs no reseed.
create table if not exists public.town_works_totals (
  project_id  text        primary key references public.hr_town_works (project_id),
  total       bigint      not null check (total >= 1),
  finished_at timestamptz,
  updated_at  timestamptz not null default now()
);
comment on table public.town_works_totals is
  '2027-03-04-town-works.sql: one row per project that has a gift: its total and when it finished. Written only by hr_town_works_give, under the project''s key. '
  'NEVER read by the engine, XP, drops or prices: a gold-funded power effect is on the avoid list (tests/town-works.mjs TW-NO-BUFF).';
alter table public.town_works_totals enable row level security;
revoke all on table public.town_works_totals from public, anon, authenticated, service_role;

-- by_slot: what each hero of the account gave, index slot + 1, so the plaque can name the lead hero from this one row. day and day_gold: today's count, stale until the next gift.
create table if not exists public.town_works_gifts (
  project_id text        not null references public.hr_town_works (project_id),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  gold       bigint      not null check (gold >= 1),
  by_slot    bigint[]    not null check (cardinality(by_slot) = 6),
  day        date        not null,
  day_gold   bigint      not null check (day_gold >= 1),
  last_gift  bigint      not null check (last_gift >= 1),
  last_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists town_works_gifts_plaque on public.town_works_gifts (project_id, gold desc, last_at, user_id);
create index if not exists town_works_gifts_account on public.town_works_gifts (user_id, day);
comment on table public.town_works_gifts is
  '2027-03-04-town-works.sql: per account, per project: gold given, what each hero gave, today''s count, the last gift. Written only by hr_town_works_give; the plaque and the window read it. '
  'NEVER read by the engine, XP, drops or prices (tests/town-works.mjs TW-NO-BUFF).';
alter table public.town_works_gifts enable row level security;
revoke all on table public.town_works_gifts from public, anon, authenticated, service_role;

-- THE TOWN HAS NO HERO. Every chat row named a sender until now; hr_chat_name_authority, hr_chat_row and the client's lineOf have each carried a no-sender path all along, and a read's
-- block filter passes a null. Only a System row may go without one, and no client role can insert a chat row at all.
alter table public.chat_messages alter column from_id drop not null;
alter table public.chat_messages drop constraint if exists chat_messages_sender_or_system;
alter table public.chat_messages add constraint chat_messages_sender_or_system check (from_id is not null or channel = 'system');

-- ── §2 THE HELPERS ───────────────────────────────────────────────────────────
-- Which stage a total stands at: 0 at the start, the last index at the goal.
create or replace function public.hr_town_works_stage(p_at bigint[], p_total bigint)
returns int language sql immutable set search_path = public, pg_catalog as $fn$
  select count(*)::int - 1 from unnest(p_at) a where a <= greatest(coalesce(p_total, 0), 0)
$fn$;

-- THE ONE RULE, read before the charge and again after it: why this gift can't be taken, or null. p_left is what the project still needs; a gift that finishes it may be small.
create or replace function public.hr_town_works_fault(p_min bigint, p_per_day bigint, p_left bigint, p_given bigint, p_amount bigint)
returns jsonb language sql immutable set search_path = public, pg_catalog as $fn$
  select case
    when p_left <= 0 then jsonb_build_object('error', 'works_done')
    when p_per_day - p_given < least(p_min, p_left) then jsonb_build_object('error', 'works_limit', 'per_day', p_per_day)
    when p_amount < least(p_min, p_left) then jsonb_build_object('error', 'works_small', 'min', least(p_min, p_left))
    when p_amount > p_left and p_left <= p_per_day - p_given then jsonb_build_object('error', 'works_short', 'left', p_left)
    when p_amount > p_per_day - p_given then jsonb_build_object('error', 'works_over', 'left', p_per_day - p_given)
  end
$fn$;

-- What this account has given today, across every hero and project. Read it AFTER hr_sink_lock.
create or replace function public.hr_town_works_given_today(p_user uuid)
returns bigint language sql stable security definer set search_path = public, pg_catalog as $fn$
  select coalesce(sum(g.day_gold), 0)::bigint from public.town_works_gifts g
   where g.user_id = p_user and g.day = (now() at time zone 'utc')::date
$fn$;

-- THE ACCOUNT'S LEAD HERO: whichever gave most, lowest slot on a tie; a hidden hero can't lead and neither can a deleted one. Null: no hero left to show.
create or replace function public.hr_town_works_lead(p_user uuid, p_by bigint[])
returns int language sql stable security definer set search_path = public, pg_catalog as $fn$
  select h.slot from public.player_state h
   where h.user_id = p_user and p_by[h.slot + 1] > 0
     and not exists (select 1 from public.hr_lb_hidden x where x.user_id = h.user_id and (x.slot is null or x.slot = h.slot))
   order by p_by[h.slot + 1] desc, h.slot
   limit 1
$fn$;

-- THE PLAQUE: the top accounts, each as its lead hero. No account id leaves: the viewer's own row is marked and nobody else's.
create or replace function public.hr_town_works_plaque(p_project text, p_viewer uuid, p_top int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('place', r.place,
           'name', case when public.hr_name_blocked(r.name) then 'Name hidden' else r.name end, 'gold', r.gold)
           || case when r.user_id = p_viewer then jsonb_build_object('mine', true) else '{}'::jsonb end order by r.place), '[]'::jsonb)
    from (select row_number() over (order by s.gold desc, s.last_at, s.user_id)::int as place, s.user_id, s.gold,
                 left(public.hr_character_name(s.user_id, s.slot), 24) as name
            from (select g.user_id, g.gold, g.last_at, public.hr_town_works_lead(g.user_id, g.by_slot) as slot
                    from public.town_works_gifts g
                   where g.project_id = p_project and public.hr_town_works_lead(g.user_id, g.by_slot) is not null
                   order by g.gold desc, g.last_at, g.user_id
                   limit p_top) s) r
$fn$;

-- THE TOWN SPEAKS (a System line, "<from> <body>"). The name trigger stamps every insert under a session as that session's hero, so this one insert runs with no session: both claims
-- are put back straight after it, and a raise rolls them back with it. Not a function SET clause: on Supabase the migration role isn't a superuser, and Postgres refuses it a SET on a
-- custom parameter. Owner only. Two strings from the server's catalogue, never a client's.
create or replace function public.hr_town_notice(p_from text, p_body text)
returns uuid language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  v_sub    text := current_setting('request.jwt.claim.sub', true);
  v_claims text := current_setting('request.jwt.claims', true);
  v_id     uuid;
begin
  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
  insert into public.chat_messages (id, channel, from_id, from_name, body)
  values (gen_random_uuid(), 'system', null, p_from, p_body)
  returning id into v_id;
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true), set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  return v_id;
end $fn$;

-- ── §3 THE VERB ──────────────────────────────────────────────────────────────
create or replace function public.hr_town_works_give(p_slot int, p_project text, p_amount bigint, p_idem uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
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
end $fn$;

-- ── §4 THE WINDOW'S READ ─────────────────────────────────────────────────────
create or replace function public.hr_town_works_view(p_slot int)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid();
  v_p   public.hr_town_works%rowtype;
  v_g   public.town_works_gifts%rowtype;
  v_total bigint; v_finished timestamptz; v_goal bigint; v_given bigint; v_left bigint; v_day_left bigint; v_floor bigint; v_place int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'town_works_view', 60, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
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
end $fn$;

-- ── §5 THE MAP'S READ (the body of the seam's stub) ──────────────────────────
create or replace function public.hr_town_extras(p_map text)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $fn$
  select coalesce(
    (select jsonb_build_object('works', jsonb_object_agg(w.project_id, public.hr_town_works_stage(w.stage_at, t.total)))
       from public.hr_town_works w
       left join public.town_works_totals t on t.project_id = w.project_id
      where w.map_id = p_map
     having count(*) > 0),
    '{}'::jsonb)
$fn$;

-- ── §6 GRANTS AND THE BASELINE ───────────────────────────────────────────────
do $mig$
declare f text;
begin
  foreach f in array array['public.hr_town_works_stage(bigint[],bigint)', 'public.hr_town_works_fault(bigint,bigint,bigint,bigint,bigint)', 'public.hr_town_works_given_today(uuid)',
                           'public.hr_town_works_lead(uuid,bigint[])', 'public.hr_town_works_plaque(text,uuid,integer)', 'public.hr_town_notice(text,text)', 'public.hr_town_extras(text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
  end loop;
  foreach f in array array['public.hr_town_works_give(integer,text,bigint,uuid)', 'public.hr_town_works_view(integer)'] loop
    execute format('revoke execute on function %s from public, anon, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $mig$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_town_works_give', 'hr_town_works_view');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_town_works_give', 'p_slot integer, p_project text, p_amount bigint, p_idem uuid', 'authenticated',
   'added 2027-03-04 (town-works): MONEY, and a shared surface: a gift to a Town Works project, the one client number, refused by the server under its clock before any charge; capped per account per UTC day; pays no XP; a gift that loses the race rolls back whole'),
  ('hr_town_works_view', 'p_slot integer', 'authenticated',
   'added 2027-03-04 (town-works): the Works tab''s read of the project, today''s allowance, this account''s place and the plaque; reads only, 60/min');

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- On its own probe project, so a re-apply over a real total reads what it planted.
do $chk$
declare
  v_a constant uuid := '000000c0-0000-4000-a000-0000901d6c01';
  v_b constant uuid := '000000c0-0000-4000-a000-0000901d6c02';
  c_p constant text := 'zz_probe_works';
  v jsonb; v_map text; v_xp bigint; f text; v_role text; v_ledger bigint;
begin
  v_map := (select m.map_id from public.hr_town_maps m where m.main);
  if v_map is null then raise exception 'town-works §7: no main town'; end if;
  begin
    insert into public.hr_town_works (project_id, map_id, ord, name, min_gift, per_day, per_minute, stage_at, stage_lines, plaque_top)
    values (c_p, v_map, 90001, 'The Probe', 100, 25000, 60, array[0, 1000, 2000, 30000]::bigint[], array[null, 'has its first.', 'has its second.', 'is finished.']::text[], 10);
    insert into auth.users (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'town-works §7 probe'), (v_b, 'town-works §7 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'town-works §7: the other hero was not made: %', v; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'town-works §7: hr_create_character refused: %', v; end if;
    update public.account_wallet set gold = 1000000 where user_id in (v_a, v_b);
    select coalesce(sum(xp), 0) into v_xp from public.player_skills where user_id = v_a and slot = 0;
    -- (a) anything the rule refuses charges nothing
    v := public.hr_town_works_give(0, c_p, 99, '000000c0-0000-4000-a000-0000901d6c11');
    if v->>'error' is distinct from 'works_small' or (v->>'min')::bigint <> 100 then raise exception 'town-works §7(a): 99 gp answered %', v; end if;
    v := public.hr_town_works_give(0, c_p, 25001, '000000c0-0000-4000-a000-0000901d6c12');
    if v->>'error' is distinct from 'works_over' or (v->>'left')::bigint <> 25000 then raise exception 'town-works §7(a): 25,001 gp answered %', v; end if;
    v := public.hr_town_works_give(0, 'no_such_works', 500, '000000c0-0000-4000-a000-0000901d6c13');
    if v->>'error' is distinct from 'not_a_project' then raise exception 'town-works §7(a): an unknown project answered %', v; end if;
    if (select gold from public.account_wallet where user_id = v_a) <> 1000000 then raise exception 'town-works §7(a): a refusal charged'; end if;
    -- (b) a gift: one journal row, no XP, Gold Given in the same transaction, its total; a replay charges nothing and says no second line
    v := public.hr_town_works_give(0, c_p, 1000, '000000c0-0000-4000-a000-0000901d6c14');
    if coalesce(v->>'ok', '') <> 'true' or (v->>'total')::bigint <> 1000 or (v->>'stage')::int <> 1 then raise exception 'town-works §7(b): a gift answered %', v; end if;
    v := public.hr_town_works_give(0, c_p, 1000, '000000c0-0000-4000-a000-0000901d6c14');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'town-works §7(b): a replay answered %', v; end if;
    if (select gold from public.account_wallet where user_id = v_a) <> 999000 then raise exception 'town-works §7(b): a replay charged twice'; end if;
    select count(*) into v_ledger from public.player_ledger where user_id = v_a and kind = 'shop' and intent = 'town_works:' || c_p || ':1000';
    if v_ledger <> 1 then raise exception 'town-works §7(b): % ledger rows', v_ledger; end if;
    if (select coalesce(sum(xp), 0) from public.player_skills where user_id = v_a and slot = 0) <> v_xp then raise exception 'town-works §7(b): a gift paid XP'; end if;
    if (select sum(gold) from public.account_gold_given where user_id = v_a) <> 1000 then raise exception 'town-works §7(b): Gold Given did not count it once'; end if;
    -- (c) the town says each stage once, as the town: no name of the giver
    if (select count(*) from public.chat_messages where channel = 'system' and from_id is null and from_name = 'The Probe' and body = 'has its first.') <> 1 then
      raise exception 'town-works §7(c): the first stage did not speak once as the town'; end if;
    if (select count(*) from public.chat_messages where from_id = v_a) <> 0 then raise exception 'town-works §7(c): the town spoke as the giver'; end if;
    if auth.uid() is distinct from v_a then raise exception 'town-works §7(c): the notice lost the session'; end if;
    -- (d) another account's gift crosses the next stage; the plaque names both, marks only the viewer, and the map reads the stage
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_town_works_give(0, c_p, 1000, '000000c0-0000-4000-a000-0000901d6c15');
    if coalesce(v->>'ok', '') <> 'true' or (v->>'stage')::int <> 2 then raise exception 'town-works §7(d): the second gift answered %', v; end if;
    if (select count(*) from public.chat_messages where from_name = 'The Probe' and body = 'has its second.') <> 1 then raise exception 'town-works §7(d): the second stage did not speak once'; end if;
    if jsonb_array_length(public.hr_town_works_plaque(c_p, v_b, 10)) <> 2 or public.hr_town_works_plaque(c_p, v_b, 10)->1->>'mine' is distinct from 'true' then
      raise exception 'town-works §7(d): the plaque reads %', public.hr_town_works_plaque(c_p, v_b, 10); end if;
    if (public.hr_town_extras(v_map)->'works'->>c_p)::int <> 2 then raise exception 'town-works §7(d): the map reads %', public.hr_town_extras(v_map); end if;
    -- (e) what's left refuses, and the last coins finish it: the finish stands and takes no more
    update public.town_works_totals set total = 29950 where project_id = c_p;
    v := public.hr_town_works_give(0, c_p, 100, '000000c0-0000-4000-a000-0000901d6c16');
    if v->>'error' is distinct from 'works_short' or (v->>'left')::bigint <> 50 then raise exception 'town-works §7(e): over what is left answered %', v; end if;
    v := public.hr_town_works_give(0, c_p, 50, '000000c0-0000-4000-a000-0000901d6c17');
    if coalesce(v->>'ok', '') <> 'true' or (v->>'total')::bigint <> 30000 then raise exception 'town-works §7(e): the last coins answered %', v; end if;
    if (select finished_at from public.town_works_totals where project_id = c_p) is null then raise exception 'town-works §7(e): the finish was not stamped'; end if;
    v := public.hr_town_works_give(0, c_p, 100, '000000c0-0000-4000-a000-0000901d6c18');
    if v->>'error' is distinct from 'works_done' then raise exception 'town-works §7(e): past the finish answered %', v; end if;
    -- (f) the window's read answers, read only
    v := public.hr_town_works_view(0);
    if coalesce(v->>'ok', '') <> 'true' or not (v ? 'plaque') or not (v ? 'left_today') then raise exception 'town-works §7(f): the read answered %', v; end if;
    raise exception using errcode = 'HR944', message = 'town-works §7 complete - rolling back';
  exception when sqlstate 'HR944' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b)) or exists (select 1 from auth.users where id in (v_a, v_b))
     or exists (select 1 from public.hr_town_works where project_id = c_p) or exists (select 1 from public.town_works_totals where project_id = c_p) then
    raise exception 'town-works §7: LEAKED a probe row'; end if;
  -- (g) GRANTS: only the verb and the read are the client's; the tables are no one's
  foreach f in array array['public.hr_town_works_give(integer,text,bigint,uuid)', 'public.hr_town_works_view(integer)'] loop
    if not has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') then raise exception 'town-works §7(g): the grants on % are wrong', f; end if;
  end loop;
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach f in array array['public.hr_town_works_stage(bigint[],bigint)', 'public.hr_town_works_fault(bigint,bigint,bigint,bigint,bigint)', 'public.hr_town_works_given_today(uuid)',
                             'public.hr_town_works_lead(uuid,bigint[])', 'public.hr_town_works_plaque(text,uuid,integer)', 'public.hr_town_notice(text,text)', 'public.hr_town_extras(text)'] loop
      if has_function_privilege(v_role, f, 'execute') then raise exception 'town-works §7(g): % reaches %', v_role, f; end if;
    end loop;
    foreach f in array array['public.town_works_totals', 'public.town_works_gifts'] loop
      if has_table_privilege(v_role, f, 'select') or has_table_privilege(v_role, f, 'insert,update,delete') then raise exception 'town-works §7(g): % reaches %', v_role, f; end if;
    end loop;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('town_works_totals', 'town_works_gifts')) then raise exception 'town-works §7(g): a policy opens a table'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'town-works: one charge per gift, the cap per account, the project never overfills, each stage speaks once; all green';
end $chk$;
