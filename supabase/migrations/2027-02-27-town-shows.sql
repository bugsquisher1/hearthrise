-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-27-town-shows.sql — HEARTH POWDERS AND STANDING A ROUND: GOLD SAYS "LOOK AT ME" WHERE PEOPLE STAND
--   (lane/c-town-shows, backend-architect, 2026-11-04; Tyler the same day: colored Hearth fuels; Round for the Tavern, paid fireworks and a chat line;
--   the designer merged them: one verb, one table, one rule table, two offers. Board section "2026-11-04 Gold sinks").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on its passing §9;
-- ON THE EA SECURITY LIST: money, and a shared surface. EDGE: no deploy (src/data/gold-sinks.js reaches no edge import; bought flames stay out of src/data/hearth.js).
-- CLIENT: the Havora window rides the next release AFTER this applies; an older client reads a powder's flame as the plain fire, never a missing sprite.
-- APPLY ORDER: last of the lane's five: catalogue, seams, gold-given, town-crier, this.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- hr_town_show(p_slot int, p_show text, p_price bigint, p_idem uuid): p_show is an offer of a show row in hr_sink_rules: cinnabar, quicklime, borax, round.
--   Refusals, each charging nothing: bad_slot, bad_idem, bad_quote, not_a_show, rate_limited (its own bucket, 10 a minute), no_character,
--   hunting {hunt} (the shows are in town), show_limit {sink, per_day}, quote_changed {price, n, per_day}, show_busy {sink, wait_s, booked_s}, insufficient_gold.
--   The answer: {ok, version, sink, show, price, n, per_day, from_ms, until_ms, behind, me}.
-- hr_town_sinks_view(p_slot): the Havora window's read, while it's open, never in the envelope: every quote, the last powder, this account's powder and the
--   named flame it burns behind, the Crier's quote and last line.
-- hr_town_show_push(p_map, p_from, p_until): a named fuel pauses bought flames under the Hearth's key. Owner only. Its one caller is hr_hearth_burn.
--   hr_hearth_burn's own contract doesn't move: the same refusals, one journal row, the item and the XP; a burn that loses the queue race now answers hearth_busy and moves nothing.
-- hr_town_shows_of(p_map): the round burning now, the body of the seam's stub. hr_hearth_flame_of(p_map): a named flame first, else a bought one.
--
-- ── WHAT MUST STAY TRUE ──────────────────────────────────────────────────────
-- NO INNER FLAME XP: the delta has no xp key and no item is burned, so no path can pay it. Buying at the fire also means nothing to stock or trade.
-- A NAMED FUEL NEVER WAITS: hr_hearth_burn's queue and its per-hero count read only hearth_flames, so bought rows can't be seen by them; hr_hearth_flame_of answers
--   a named flame first; hr_town_show_push moves bought flames out of its way, so a paused powder still burns for every second paid for.
-- THE HEARTHRISE EVENT NEVER READS town_shows: gold into that meter is the gold-funded XP buff on the avoid list. tests/town-shows.mjs TS-NO-METER is the standing guard:
--   only the functions named here may read this table, and no edge or core file may name it.
-- EACH ACCOUNT ONE LADDER: the count reads the ledger by user_id across heroes, after hr:sink:<uid>, or two heroes pressing together both pay the first price.
-- NOBODY PAYS FOR A REFUSED SHOW: the queue is read before the charge, and again under the town's key after it. A queue that filled in between RAISES inside the
--   charge's block and rolls back whole: purse, journal, intent, row and line.
-- LOCK ORDER: hero, hr:sink:<uid>, hr_apply (the purse), then the town's key, so one account's settle can't hold the Hearth. hr_hearth_burn HELD THAT KEY OVER ITS hr_apply: on real
--   backends a burn deadlocked against the same account's powder (tests/town-shows-race.mjs R4), so §7 moves its key after its charge too, with the same read-again and rollback.
-- A QUIET HERO pays and shows with no name and no line, as a named fuel does today.
-- MODERATION: the lines hold no player text: only the server's sentence and the stamped hero name.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- hr_town_view (every 2 s per viewer) gains two indexed probes at most, both on the map's own queue. town_shows: at most 8 rows per account per day; about 120 bytes;
-- rows over 30 days old are pruned on each purchase. 100x, at the designer's estimated use: about 3,000 rows a day, under 12 MB at rest.
--
-- REVERSIBILITY: re-apply 2027-01-31-inner-flame.sql's hr_hearth_flame_of and hr_hearth_burn; re-create the stub hr_town_shows_of; drop the verb and read with their baseline
-- rows, the helpers and the table. Gold spent stays spent.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regprocedure('public.hr_town_crier_quote(uuid)') is null then raise exception 'PRECONDITION: apply 2027-02-27-town-crier.sql first'; end if;
  if to_regprocedure('public.hr_gold_given_add(uuid,integer,bigint)') is null then raise exception 'PRECONDITION: apply 2027-02-27-gold-given.sql first'; end if;
  if to_regprocedure('public.hr_sink_lock(uuid)') is null or to_regprocedure('public.hr_town_shows_of(text)') is null then raise exception 'PRECONDITION: apply 2027-02-27-gold-sinks-seams.sql first'; end if;
  if (select count(*) from public.hr_sink_rules where sink_id in ('powder', 'round') and seconds is not null and book_s is not null) <> 2 then
    raise exception 'PRECONDITION: hr_sink_rules has no powder and round rows'; end if;
  if to_regclass('public.hearth_flames') is null or to_regclass('public.hr_town_maps') is null then raise exception 'PRECONDITION: the Hearth and the town are absent'; end if;
  -- each restated body is EXACTLY its live image (tests/live-hash-drift.baseline.json, measured 2026-11-05), or this file's own (a second apply)
  for v_r in select * from (values
    ('public.hr_hearth_flame_of(text)', '499845440c7bfa6ea401669c9a14d5db', '6c841b157520be382feef27d277fda3b'),
    ('public.hr_hearth_burn(integer,text,uuid)', '2b2da8b5cc4a5b5cc4141b1b53a36036', '9e9070575ccacf50749d1c1819cdec6d'),
    -- the stub's image from 2027-02-27-gold-sinks-seams.sql
    ('public.hr_town_shows_of(text)', 'eddcb66db47765278bbec67417887c0d', '4c45955b31af7216c5072ba92d57bb14')) t(fn, pre, post) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its pre-image (%) nor this file''s image (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE TABLE ─────────────────────────────────────────────────────────────
create table if not exists public.town_shows (
  id         bigint generated always as identity primary key,
  map_id     text        not null check (map_id ~ '^[a-z0-9_]{1,40}$'),
  sink_id    text        not null check (sink_id in ('powder', 'round')),
  show_id    text        not null check (show_id ~ '^[a-z0-9_]{1,32}$'),
  user_id    uuid        not null,
  slot       int         not null check (slot between 0 and 5),
  price      bigint      not null check (price >= 1),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  message_id uuid,                        -- the chat line it posted (null for a quiet hero)
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
create index if not exists town_shows_queue on public.town_shows (map_id, sink_id, ends_at desc);
create index if not exists town_shows_buyer on public.town_shows (user_id, sink_id, id desc);
create index if not exists town_shows_hero on public.town_shows (user_id, slot);
comment on table public.town_shows is
  '2027-02-27-town-shows.sql: one row per bought flame or round: who, what, when it plays. Written only by hr_town_show and hr_town_show_push. '
  'NEVER read by a meter or event: gold into the Hearthrise meter is a gold-funded XP buff (tests/town-shows.mjs TS-NO-METER).';
alter table public.town_shows enable row level security;
revoke all on table public.town_shows from public, anon, authenticated, service_role;

-- ── §2 THE HELPERS ───────────────────────────────────────────────────────────
-- When the next show of a sink can start: after the last one booked and, for a powder, after every named flame. Never before now.
create or replace function public.hr_town_show_free_at(p_map text, p_sink text)
returns timestamptz language sql stable security definer set search_path = public, pg_catalog as $fn$
  select greatest(now(),
    (select max(s.ends_at) from public.town_shows s where s.map_id = p_map and s.sink_id = p_sink),
    case when p_sink = 'powder' then (select max(f.ends_at) from public.hearth_flames f where f.map_id = p_map) end)
$fn$;

-- A NAMED FUEL TAKES THE FIRE FOR [p_from, p_until): every bought flame still to burn moves out of its way. One burning now keeps its start and burns on after;
-- one waiting moves whole. hr_hearth_flame_of answers the named flame while they overlap, so each powder still shows for every second paid for.
-- The caller holds the Hearth's key.
create or replace function public.hr_town_show_push(p_map text, p_from timestamptz, p_until timestamptz)
returns void language sql volatile security definer set search_path = public, pg_catalog as $fn$
  update public.town_shows s
     set starts_at = case when s.starts_at >= p_from then s.starts_at + (p_until - p_from) else s.starts_at end,
         ends_at = s.ends_at + (p_until - p_from)
   where s.map_id = p_map and s.sink_id = 'powder' and s.ends_at > p_from
$fn$;

-- The window's quote for one show sink, for one account. The verb re-quotes under its lock.
create or replace function public.hr_town_sink_quote(p_user uuid, p_map text, p_sink text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare r public.hr_sink_rules%rowtype; v_n int; v_free timestamptz;
begin
  select * into r from public.hr_sink_rules where sink_id = p_sink;
  if not found then return null; end if;
  v_n := public.hr_sink_bought_today(p_user, 'town_show', r.offers);
  v_free := public.hr_town_show_free_at(p_map, p_sink);
  return jsonb_build_object('sink', p_sink, 'offers', to_jsonb(r.offers), 'n', v_n, 'per_day', r.per_day, 'price', public.hr_sink_price(p_sink, v_n),
    'seconds', r.seconds, 'book_s', r.book_s, 'booked_s', ceil(extract(epoch from (v_free - now())))::int,
    'last', (select s.show_id from public.town_shows s where s.user_id = p_user and s.sink_id = p_sink order by s.id desc limit 1));
end $fn$;

-- ── §3 THE FLAME THE SQUARE BURNS: a named one first, else a bought one ──────
create or replace function public.hr_hearth_flame_of(p_map text)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $fn$
  select coalesce(
    (select jsonb_build_object(
              'flame', f.flame, 'item', f.item_id,
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
              'flame', s.show_id, 'item', null, 'bought', true,
              'by', case when coalesce(ps.presence_quiet, false) then null else left(public.hr_character_name(s.user_id, s.slot), 24) end,
              'from_ms', floor(extract(epoch from s.starts_at) * 1000)::bigint,
              'until_ms', floor(extract(epoch from s.ends_at) * 1000)::bigint,
              'now_ms', floor(extract(epoch from now()) * 1000)::bigint,
              'queued', 0)
       from public.town_shows s
       left join public.player_state ps on ps.user_id = s.user_id and ps.slot = s.slot
      where s.map_id = p_map and s.sink_id = 'powder' and s.starts_at <= now() and s.ends_at > now()
      order by s.starts_at
      limit 1))
$fn$;

-- ── §4 THE ROUND GOING NOW (the body of the seam's stub) ─────────────────────
create or replace function public.hr_town_shows_of(p_map text)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $fn$
  select jsonb_build_object('round', jsonb_build_object(
           'by', case when coalesce(ps.presence_quiet, false) then null else left(public.hr_character_name(s.user_id, s.slot), 24) end,
           'from_ms', floor(extract(epoch from s.starts_at) * 1000)::bigint,
           'until_ms', floor(extract(epoch from s.ends_at) * 1000)::bigint,
           'now_ms', floor(extract(epoch from now()) * 1000)::bigint))
    from public.town_shows s
    left join public.player_state ps on ps.user_id = s.user_id and ps.slot = s.slot
   where s.map_id = p_map and s.sink_id = 'round' and s.starts_at <= now() and s.ends_at > now()
   order by s.starts_at
   limit 1
$fn$;

-- ── §5 THE VERB ──────────────────────────────────────────────────────────────
create or replace function public.hr_town_show(p_slot int, p_show text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
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
end $fn$;

-- ── §6 THE WINDOW'S READ ─────────────────────────────────────────────────────
create or replace function public.hr_town_sinks_view(p_slot int)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare v_uid uuid := auth.uid(); v_map text; v_mine jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'town_sinks', 60, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
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
end $fn$;

-- ── §7 hr_hearth_burn RESTATED WHOLE (§0 pins its image): + the push; the Hearth's key moved after the charge (the lock order, above) ──
create or replace function public.hr_hearth_burn(p_slot int, p_item text, p_idem uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
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
end $fn$;

-- ── §8 GRANTS AND THE BASELINE ───────────────────────────────────────────────
do $mig$
declare f text;
begin
  foreach f in array array['public.hr_town_show_free_at(text,text)', 'public.hr_town_show_push(text,timestamp with time zone,timestamp with time zone)',
                           'public.hr_town_sink_quote(uuid,text,text)', 'public.hr_hearth_flame_of(text)', 'public.hr_town_shows_of(text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
  end loop;
  foreach f in array array['public.hr_town_show(integer,text,bigint,uuid)', 'public.hr_town_sinks_view(integer)'] loop
    execute format('revoke execute on function %s from public, anon, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $mig$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_town_show', 'hr_town_sinks_view');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_town_show', 'p_slot integer, p_show text, p_price bigint, p_idem uuid', 'authenticated',
   'added 2027-02-27 (town-shows): MONEY, and a shared surface: a Hearth powder or a round, priced by the server from hr_sink_rules, climbing per account per UTC day; refuses quote_changed; pays no XP; a show that loses the queue race rolls back whole'),
  ('hr_town_sinks_view', 'p_slot integer', 'authenticated',
   'added 2027-02-27 (town-shows): the Havora window''s read of the caller''s quotes and last choices; reads only, 60/min');

-- ── §9 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  v_a constant uuid := '000000c0-0000-4000-a000-0000901d6b01';
  v_b constant uuid := '000000c0-0000-4000-a000-0000901d6b02';
  v jsonb; v_map text; v_xp bigint; v_gold bigint; v_from timestamptz; v_until timestamptz; f text; v_role text;
begin
  v_map := (select m.map_id from public.hr_town_maps m where m.main);
  if v_map is null then raise exception 'town-shows §9: no main town'; end if;
  begin
    insert into auth.users (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'town-shows §9 probe'), (v_b, 'town-shows §9 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'town-shows §9: the other hero was not made: %', v; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'town-shows §9: hr_create_character refused: %', v; end if;
    update public.account_wallet set gold = 1000000 where user_id = v_a;
    select coalesce(sum(xp), 0) into v_xp from public.player_skills where user_id = v_a and slot = 0;
    -- (a) a forged price and an unknown show charge nothing
    v := public.hr_town_show(0, 'cinnabar', 1, '000000c0-0000-4000-a000-0000901d6b11');
    if v->>'error' is distinct from 'quote_changed' or (v->>'price')::bigint <> 2000 then raise exception 'town-shows §9(a): a forged price answered %', v; end if;
    v := public.hr_town_show(0, 'honey', 2000, '000000c0-0000-4000-a000-0000901d6b12');
    if v->>'error' is distinct from 'not_a_show' then raise exception 'town-shows §9(a): a named flame answered %', v; end if;
    if (select gold from public.account_wallet where user_id = v_a) <> 1000000 then raise exception 'town-shows §9(a): a refusal charged'; end if;
    -- (b) a powder: the first price, one journal row, no XP, the square's color, counted once on the board; a replay charges nothing
    v := public.hr_town_show(0, 'cinnabar', 2000, '000000c0-0000-4000-a000-0000901d6b13');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'town-shows §9(b): a powder answered %', v; end if;
    v := public.hr_town_show(0, 'cinnabar', 2000, '000000c0-0000-4000-a000-0000901d6b13');
    select gold into v_gold from public.account_wallet where user_id = v_a;
    if v_gold <> 998000 then raise exception 'town-shows §9(b): the purse reads %', v_gold; end if;
    if (select count(*) from public.player_ledger where user_id = v_a and kind = 'shop' and intent = 'town_show:cinnabar:2000') <> 1 then raise exception 'town-shows §9(b): not one ledger row'; end if;
    if (select coalesce(sum(xp), 0) from public.player_skills where user_id = v_a and slot = 0) <> v_xp then raise exception 'town-shows §9(b): a powder paid XP'; end if;
    if (select sum(gold) from public.account_gold_given where user_id = v_a) <> 2000 then raise exception 'town-shows §9(b): Gold Given did not count it once'; end if;
    v := public.hr_hearth_flame_of(v_map);
    if v->>'flame' is distinct from 'cinnabar' or (v->>'bought')::boolean is not true then raise exception 'town-shows §9(b): the square reads %', v; end if;
    -- (c) A NAMED FUEL NEVER WAITS: it burns at once, the square answers it first, and the powder still has every second it paid for
    v_from := now(); v_until := v_from + interval '60 seconds';
    insert into public.hearth_flames (map_id, item_id, flame, user_id, slot, starts_at, ends_at) values (v_map, 'zz_probe', 'honey', v_b, 0, v_from, v_until);
    perform public.hr_town_show_push(v_map, v_from, v_until);
    v := public.hr_hearth_flame_of(v_map);
    if v->>'flame' is distinct from 'honey' then raise exception 'town-shows §9(c): the named flame did not come first: %', v; end if;
    if (select extract(epoch from (ends_at - v_until)) from public.town_shows where user_id = v_a) <> 30 then raise exception 'town-shows §9(c): the paused powder lost time'; end if;
    -- (d) the next powder climbs, and queues behind everything
    v := public.hr_town_show(0, 'borax', 4000, '000000c0-0000-4000-a000-0000901d6b14');
    if coalesce(v->>'ok', '') <> 'true' or (v->>'from_ms')::bigint <> floor(extract(epoch from (select max(ends_at) from public.town_shows where show_id = 'cinnabar' and user_id = v_a)) * 1000)::bigint then
      raise exception 'town-shows §9(d): the second powder answered %', v; end if;
    -- (e) a round is its own ladder, in System
    v := public.hr_town_show(0, 'round', 5000, '000000c0-0000-4000-a000-0000901d6b15');
    if coalesce(v->>'ok', '') <> 'true' or public.hr_town_shows_of(v_map)->'round' is null then raise exception 'town-shows §9(e): a round answered %', v; end if;
    -- (f) the other account's window reads its own quote
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_town_sinks_view(0);
    if coalesce(v->>'ok', '') <> 'true' or (v->'powder'->>'price')::bigint <> 2000 or v->'powder'->>'last' is not null then raise exception 'town-shows §9(f): the window read %', v; end if;
    raise exception using errcode = 'HR941', message = 'town-shows §9 complete - rolling back';
  exception when sqlstate 'HR941' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b)) or exists (select 1 from auth.users where id in (v_a, v_b)) or exists (select 1 from public.town_shows where user_id in (v_a, v_b)) then
    raise exception 'town-shows §9: LEAKED a probe row'; end if;
  -- (g) GRANTS: only the verb and the read are the client's; the table is no one's
  foreach f in array array['public.hr_town_show(integer,text,bigint,uuid)', 'public.hr_town_sinks_view(integer)'] loop
    if not has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') then raise exception 'town-shows §9(g): the grants on % are wrong', f; end if;
  end loop;
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach f in array array['public.hr_town_show_free_at(text,text)', 'public.hr_town_show_push(text,timestamp with time zone,timestamp with time zone)',
                             'public.hr_town_sink_quote(uuid,text,text)', 'public.hr_town_shows_of(text)', 'public.hr_hearth_flame_of(text)'] loop
      if has_function_privilege(v_role, f, 'execute') then raise exception 'town-shows §9(g): % reaches %', v_role, f; end if;
    end loop;
    if has_table_privilege(v_role, 'public.town_shows', 'select') or has_table_privilege(v_role, 'public.town_shows', 'insert,update,delete') then raise exception 'town-shows §9(g): % reaches the table', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'town_shows') then raise exception 'town-shows §9(g): a policy opens the table'; end if;
  -- (h) hr_hearth_burn pushes, and its queue still can't see a bought row
  if strpos((select prosrc from pg_proc where oid = 'public.hr_hearth_burn(integer,text,uuid)'::regprocedure), 'hr_town_show_push(v_map, v_start, v_end)') = 0 then
    raise exception 'town-shows §9(h): hr_hearth_burn does not push the bought flames'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'town-shows: no XP, the climb per account, a named fuel never waits, a refused show charges nothing; all green';
end $chk$;
