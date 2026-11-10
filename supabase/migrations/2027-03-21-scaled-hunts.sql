-- ════════════════════════════════════════════════════════════════════════
-- 2027-03-21-scaled-hunts.sql — SCALED HUNTS: AN EARLY GROUND FOUGHT AT THE PARTY LEADER'S LEVEL, BOUGHT BY THE HOUR WITH GOLD
--   (lane/c-scaled-hunts, backend-architect, 2026-11-07; Tyler 2026-11-07 "an option to 'scale' early game hunts up with gold", "party would
--   scale to the leader", "make it a per hour slider", "up to 24 hours", "the time only ticks down while in the spawn"; the designer's rules
--   and numbers: src/data/scaled-hunts.js and docs/planning/PRIORITY_BOARD.md "2026-11-07 Scaled hunts").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on its
-- passing §8. ON THE EA SECURITY LIST: a gold purchase (§1 money surface) and a value bound's input (a scaled window pays more a kill).
-- THE SWITCH (2027-03-21-feature-switches.sql): the feature is the server switch `scaled_hunts`, seeded OFF here (on conflict do nothing, so a
-- re-apply never reverts the Coordinator's flip). While it is off for an account: its purchase and its switch refuse `feature_off`, the
-- section is null, and a hunt it leads plays the ground's own rows and spends nothing (hr_scaled_hunt_of). Turning it on is a
-- Coordinator migration (testers first), no release.
-- ORDER: after 2027-03-21-feature-switches.sql and 2027-03-21-scaled-hunts-catalogue.generated.sql. EDGE: either order. The engine reads
-- the instance read's `scale` and plays the ground's own rows without it, and an unscaled settle sends no `scale` key, so an edge before this
-- file, or this file before the edge, settles every hunt exactly as before; the hr-accrue deploy carrying combat-sim.js huntPlayOf turns it on.
-- CLIENT: none (the slider is a follow-up lane). Nothing here is reachable from today's client except the `scaled_hunts` section.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   player_scaled_hours (NEW, per hero and ground): banked_ms (the hours held), use_on (the "use my scaled hours here" switch, on by default
--     and after a purchase), bought_ms / spent_ms (lifetime totals: banked_ms = bought_ms - spent_ms, a CHECK), bought_at, updated_at.
--     RLS on, own rows readable, written only by the two verbs below and the settle. No client write grant or policy.
--   hr_scaled_level(hunt, level)        the Level a ground plays at for a leader of `level` (scaled-hunts.js scaleLevelFor), or null
--   hr_scaled_hunt_of(instance)         the server's scale of an instance's next window: { level, banked_ms, user, slot } of its leader (the
--                                       party's leader hunting in it, or a solo instance's one hunter) when the switch is on, at least one
--                                       swing is banked and the leader's Level scales the ground; else null. Engine-side only.
--   hr_scaled_hunts_view(user, slot)    the section `scaled_hunts`: the slider's clamps, the bank cap, hours bought today and the day's clamp,
--                                       per scalable ground { level (null: not yet), from_level, price (an hour, null: not yet), banked_ms, on },
--                                       and `playing` { hunt, level } when the hero's open hunt last settled scaled.
--   hr_scaled_hunt_buy(p_slot, p_hunt, p_hours, p_price, p_idem)   MONEY (a gold sink). The stamina-refill shape.
--   hr_scaled_hunt_switch(p_slot, p_hunt, p_on, p_idem)             the switch. Moves no value.
--   hunt_instances.scale_level (NEW): the Level the stored world was built on (null: the ground's own). Written only by the commit.
--   hr_hunt_instance_read   ONE anchored splice: the instance carries `scale` (hr_scaled_hunt_of) and `scale_level`.
--   hr_hunt_apply_instance  FOUR anchored splices: `scale` is an allowed settle key; the claim is re-proved before any member lands (a claim
--                           of a Level the server doesn't hold is `scale_moved`, more swings than the bank holds is `scale_over`, a malformed
--                           one `bad_scale`) and written to hunt_instances.scale_level; after every member landed, the window's world
--                           swings x the swing come off the leader's bank, under the locks taken above.
--   hr_hunt_apply_member    TWO anchored splices: on a window the commit proved scaled, the value bound (gold, XP) and the Defense bound's
--                           Level read the scaled roster's own (hr_scaled_kill_bounds) beside the ground's.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
--   hr_scaled_hunt_buy(p_slot int, p_hunt text, p_hours int, p_price bigint, p_idem uuid) -> jsonb
--     ok:     { ok, version, gold: -price, hours, scaled_hunts }        (a replay of the key answers its stored receipt, charging nothing)
--     errors: not_signed_in, bad_slot, bad_idem, bad_quote (price not 1..1e9), rate_limited, feature_off, no_character, catalogue_missing,
--             not_scalable (no such scalable ground), scale_level { level, need } (the hero still fits it), bad_hours { min, max },
--             quote_changed { scaled_hunts } (p_price is not the server's price now), scaled_bank_full { banked_ms, max_ms },
--             scaled_day_limit { today, max }, insufficient_gold (hr_apply's), intent_mismatch (the key names another verb)
--   hr_scaled_hunt_switch(p_slot int, p_hunt text, p_on boolean, p_idem uuid) -> jsonb
--     ok:     { ok, hunt, on, scaled_hunts }
--     errors: not_signed_in, bad_slot, bad_idem, bad_switch, rate_limited, feature_off, not_scalable, no_character, intent_mismatch
--   The settle (hr_hunt_apply_instance): settle.scale = { level } or absent. New refusals: bad_scale, scale_moved (the edge re-reads at once:
--   hunt-settle.js RETRYABLE), scale_over.
--
-- ── CONCURRENCY AND IDEMPOTENCY ─────────────────────────────────────────────
-- A purchase takes its hero's lock (hr_hunt_lock), re-quotes under it, pays through hr_apply (the account purse, its own lock; the key is
-- hr_apply's player_intents row, so a retry or a double press is one charge), THEN writes the bank row. Two purchases of one hero queue
-- on the lock and the second sees the first's bank and ledger row. The settle takes every member's lock, then every member's purse, and
-- writes the bank row last: the same order, so the two never hold each other's next lock. The claim is re-proved from a read made under
-- the instance lock (only this instance's settle moves its leader's Level or debits its bank; a purchase only raises it); the debit itself
-- is a guarded update (banked_ms >= the hours), refused, never clamped.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- No client value prices a purchase: the Level is hr_level_of, the price the catalogue's, the hours a whole number inside the slider and
-- under the bank and day clamps, all under the hero's lock; a stale or forged p_price is quote_changed with nothing charged. Gold only
-- leaves (a sink). Hours are spent only by the server's own count of the window's world swings (never an edge or client number) and only
-- from the bank of the leader the server names. A forged scale claim can't raise a bound past a real scaled window's: the claim must equal
-- the server's own Level and fit the bank, and the bound it opens is the generated catalogue's for that ground and Level. An unscaled
-- claim spends nothing and plays the ground's own rows (free, as today).
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
-- player_scaled_hours: at most 5 rows a hero (one per scalable ground): 400 heroes x 5 = 2,000 rows, ~150 KB. A purchase is ONE ledger row
-- (an aggregate of whole hours); spending writes no row at all (the bank row's spent_ms and hunt_instances.scale_level are aggregates), so
-- a scaled hunt adds no ledger volume to the settle's one combat row a member. Per settle: one PK read of the bank row in the instance read
-- and in the commit, one PK update when scaled, one PK join in each member's bound. Per envelope: the rule row, the hero's Level, <= 5 PK
-- rows, and the day's ledger sum only when the hero bought today.
--
-- REVERSIBILITY: re-apply the three pre-images (the md5s §0 pins, from tests/live-hash-drift.baseline.json), drop the section row, the verbs,
-- the helpers, the baseline rows, hunt_instances.scale_level and player_scaled_hours (its rows go with the character wipe).
-- No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_def text;
begin
  if to_regclass('public.hr_scaled_hunt_rule') is null or to_regclass('public.hr_scaled_grounds') is null
     or to_regclass('public.hr_scaled_kill_bounds') is null then
    raise exception 'PRECONDITION: apply 2027-03-21-scaled-hunts-catalogue.generated.sql first (the catalogues this file reads)'; end if;
  if to_regprocedure('public.hr_feature_on(text,uuid)') is null or to_regclass('public.hr_feature_switches') is null then
    raise exception 'PRECONDITION: apply 2027-03-21-feature-switches.sql first (the switch this feature sits behind)'; end if;
  if to_regprocedure('public.hr_purse_of(uuid)') is null or to_regclass('public.hr_state_sections') is null
     or to_regprocedure('public.hr_char_xp_for_level(integer)') is null then
    raise exception 'PRECONDITION: the account purse (2026-12-15-account-gold.sql), the section registry and the level curve first'; end if;
  -- each body is EXACTLY its live image (tests/live-hash-drift.baseline.json, measured 2026-11-07) or this file's: the spliced read by its
  -- marker, each body restated whole by its own image (normalised md5), so a second apply after a later file moved one refuses, never undoes it
  for v_r in select * from (values
    ('public.hr_hunt_instance_read(uuid,integer)', 'c2294c624d856c0e5f6a00e270473b21', null),
    ('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', 'a661a6690f46dc7f1a2fdb666dea7ae1', 'e4f0aad7409b17f2d51f178ab89c00db'),
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', '48f088fc64c779dd58c8b2a9f939b2b0', 'd12e2b39cd6c1afa8b73e79e70758d0e')) t(fn, pre, own) loop
    v_def := pg_get_functiondef(v_r.fn::regprocedure);
    if md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')) is distinct from v_r.pre
       and (case when v_r.own is null then strpos(v_def, 'SCALED-HUNTS (2027-03-21-scaled-hunts.sql)') = 0
                 else md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')) is distinct from v_r.own end) then
      raise exception 'PIN: % is neither its live image (%) nor this file''s: md5 % - another file moved it', v_r.fn, v_r.pre,
        md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')); end if;
  end loop;
end $mig$;

-- ── §1 THE BANK ──────────────────────────────────────────────────────────────
create table if not exists public.player_scaled_hours (
  user_id    uuid   not null,
  slot       int    not null,
  hunt_id    text   not null check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  banked_ms  bigint not null default 0 check (banked_ms >= 0),
  use_on     boolean not null default true,
  bought_ms  bigint not null default 0 check (bought_ms >= 0),
  spent_ms   bigint not null default 0 check (spent_ms >= 0),
  bought_at  timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot, hunt_id),
  constraint player_scaled_hours_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade,
  -- THE BOOKS: every banked millisecond was bought and not yet spent; an hour paid for is never lost and never made.
  constraint player_scaled_hours_books check (banked_ms = bought_ms - spent_ms)
);
alter table public.player_scaled_hours enable row level security;
revoke all on public.player_scaled_hours from public, anon, authenticated, service_role;
grant select on public.player_scaled_hours to authenticated;
drop policy if exists "player_scaled_hours own read" on public.player_scaled_hours;
create policy "player_scaled_hours own read" on public.player_scaled_hours for select to authenticated using ((select auth.uid()) = user_id);
comment on table public.player_scaled_hours is
  '2027-03-21-scaled-hunts.sql: a hero''s banked scaled-hunt hours per ground and its "use my scaled hours here" switch. Written only by hr_scaled_hunt_buy, hr_scaled_hunt_switch and the settle (hr_hunt_apply_instance). RLS: own rows readable, no client write.';

-- THE SWITCH, seeded OFF once (2027-03-21-feature-switches.sql): a re-apply never reverts the Coordinator's flip.
insert into public.hr_feature_switches (switch_id, scope, note) values
  ('scaled_hunts', 'off', '2027-03-21-scaled-hunts.sql: buying scaled-hunt hours, the switch, and a scaled settle. Off: refused, and every hunt plays the ground''s own rows.')
  on conflict (switch_id) do nothing;

alter table public.hunt_instances add column if not exists scale_level int;
comment on column public.hunt_instances.scale_level is
  '2027-03-21-scaled-hunts.sql: the Level the stored world was built on (null: the ground''s own), written only by hr_hunt_apply_instance from the claim it re-proved.';

-- ── §2 THE RULE ──────────────────────────────────────────────────────────────
-- The Level a ground plays at for a leader of p_level (src/data/scaled-hunts.js scaleLevelFor): past the band's top only, held at top_level.
create or replace function public.hr_scaled_level(p_hunt text, p_level int)
returns int language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_top int; v_max int;
begin
  select g.top into v_top from public.hr_scaled_grounds g where g.hunt_id = p_hunt;
  select r.top_level into v_max from public.hr_scaled_hunt_rule r where r.id;
  if v_top is null or v_max is null or p_level is null or p_level <= v_top then return null; end if;
  return least(p_level, v_max);
end $fn$;

-- Whole hours this hero bought this UTC day, every ground together, read from the append-only ledger (the per-day clamp's one source).
create or replace function public.hr_scaled_hours_today(p_user uuid, p_slot int)
returns int language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  return coalesce((select sum((l.meta->>'hours')::int) from public.player_ledger l
                    where l.user_id = p_user and l.slot = p_slot and l.kind = 'shop' and l.intent like 'scaled\_hunt\_buy:%'
                      and l.at >= public.hr_utc_day_start(now())), 0)::int;
end $fn$;

-- THE SCALE OF AN INSTANCE'S NEXT WINDOW: its leader's bank on its ground, when it scales. The leader is the party's (hunting in this
-- instance), or a solo instance's one hunter; a party whose leader isn't in it, or a closed party, plays the ground's own.
create or replace function public.hr_scaled_hunt_of(p_instance uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  v_i  public.hunt_instances%rowtype;
  v_lu uuid; v_ls int; v_n int;
  v_h  public.player_scaled_hours%rowtype;
  v_to int;
begin
  select * into v_i from public.hunt_instances where id = p_instance;
  if not found or not exists (select 1 from public.hr_scaled_grounds g where g.hunt_id = v_i.hunt_id) then return null; end if;
  if exists (select 1 from public.hunt_parties p where p.id = p_instance) then
    select p.leader_user, p.leader_slot into v_lu, v_ls from public.hunt_parties p where p.id = p_instance and p.closed_at is null;
    if v_lu is null or not exists (select 1 from public.hunt_sessions h where h.instance_id = p_instance and h.ended_at is null
                                                                        and h.user_id = v_lu and h.slot = v_ls) then
      return null; end if;
  else
    select count(*)::int, min(h.user_id::text)::uuid, min(h.slot) into v_n, v_lu, v_ls
      from public.hunt_sessions h where h.instance_id = p_instance and h.ended_at is null;
    if v_n <> 1 then return null; end if;
  end if;
  -- THE SWITCH (2027-03-21-feature-switches.sql): off for the leader's account, its banked hours are not read.
  if not public.hr_feature_on('scaled_hunts', v_lu) then return null; end if;
  select * into v_h from public.player_scaled_hours h where h.user_id = v_lu and h.slot = v_ls and h.hunt_id = v_i.hunt_id;
  if not found or not v_h.use_on or v_h.banked_ms < coalesce(public.hr_hunt_limit('swing_interval_ms'), 2000) then return null; end if;
  v_to := public.hr_scaled_level(v_i.hunt_id, public.hr_level_of(v_lu, v_ls));
  if v_to is null then return null; end if;
  return jsonb_build_object('level', v_to, 'banked_ms', v_h.banked_ms, 'user', v_lu, 'slot', v_ls);
end $fn$;

-- ── §3 THE SECTION ───────────────────────────────────────────────────────────
create or replace function public.hr_scaled_hunts_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare r public.hr_scaled_hunt_rule%rowtype; v_lv int; v_today int := 0; v_play jsonb;
begin
  select * into r from public.hr_scaled_hunt_rule where id;
  if not found or not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  if not public.hr_feature_on('scaled_hunts', p_user) then return null; end if;   -- the switch off: nothing to show
  v_lv := public.hr_level_of(p_user, p_slot);
  if exists (select 1 from public.player_scaled_hours h where h.user_id = p_user and h.slot = p_slot and h.bought_at >= public.hr_utc_day_start(now())) then
    v_today := public.hr_scaled_hours_today(p_user, p_slot);
  end if;
  -- what the hero's open hunt last settled at (the commit's own proved Level), for the hunt's top bar
  select jsonb_build_object('hunt', i.hunt_id, 'level', i.scale_level) into v_play
    from public.hunt_sessions s join public.hunt_instances i on i.id = s.instance_id
   where s.user_id = p_user and s.slot = p_slot and s.ended_at is null and i.scale_level is not null limit 1;
  return jsonb_build_object(
    'min_hours', r.min_hours, 'max_hours', r.max_hours, 'bank_max_ms', r.bank_max_hours::bigint * 3600000,
    'day_max_hours', r.day_max_hours, 'today_hours', v_today, 'playing', v_play,
    'grounds', coalesce((select jsonb_object_agg(g.hunt_id, jsonb_build_object(
                 'level', x.lv, 'from_level', g.top + 1,
                 'price', case when x.lv is not null then r.price_per_level::bigint * x.lv end,
                 'banked_ms', coalesce(h.banked_ms, 0), 'on', coalesce(h.use_on, true)) order by g.hunt_id)
                from public.hr_scaled_grounds g
                cross join lateral (select public.hr_scaled_level(g.hunt_id, v_lv) as lv) x
                left join public.player_scaled_hours h on h.user_id = p_user and h.slot = p_slot and h.hunt_id = g.hunt_id), '{}'::jsonb));
end $fn$;
insert into public.hr_state_sections (key, fn, note) values
  ('scaled_hunts', 'hr_scaled_hunts_view', '2027-03-21-scaled-hunts.sql: the scaled-hunt slider''s clamps, the price an hour per ground for this hero, the hours banked and the switch')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §4 THE PURCHASE ──────────────────────────────────────────────────────────
create or replace function public.hr_scaled_hunt_buy(p_slot int, p_hunt text, p_hours int, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'scaled_hunt_buy';
  c_hour constant bigint := 3600000;
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_a jsonb;
  r public.hr_scaled_hunt_rule%rowtype; v_top int; v_lv int; v_to int; v_price bigint; v_bank bigint; v_today int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 1 or p_price > 1000000000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  if p_hunt is null or p_hunt !~ '^[a-z0-9_]{1,64}$' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_scalable')); end if;
  if p_hours is null or p_hours < 1 or p_hours > 1000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_hours')); end if;
  -- The key names the whole purchase (ground, hours, price): a replay answers its own receipt, another purchase under it is intent_mismatch.
  v_verb := c_verb || ':' || p_hunt || ':' || p_hours || ':' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_feature_on('scaled_hunts', v_uid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'feature_off')); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- THE QUOTE, under the lock, from the server's own rows: never the client's number.
  select * into r from public.hr_scaled_hunt_rule where id;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  select g.top into v_top from public.hr_scaled_grounds g where g.hunt_id = p_hunt;
  if v_top is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_scalable')); end if;
  v_lv := public.hr_level_of(v_uid, p_slot);
  v_to := public.hr_scaled_level(p_hunt, v_lv);
  if v_to is null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'scale_level', 'level', v_lv, 'need', v_top + 1)); end if;
  if p_hours < r.min_hours or p_hours > r.max_hours then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_hours', 'min', r.min_hours, 'max', r.max_hours)); end if;
  v_price := r.price_per_level::bigint * v_to * p_hours;
  if v_price <> p_price then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed',
      'scaled_hunts', public.hr_scaled_hunts_view(v_uid, p_slot))); end if;
  -- THE BANK: never past the cap (a price change never leaves a big stock bought at the old price).
  v_bank := coalesce((select h.banked_ms from public.player_scaled_hours h where h.user_id = v_uid and h.slot = p_slot and h.hunt_id = p_hunt), 0);
  if v_bank + p_hours * c_hour > r.bank_max_hours::bigint * c_hour then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'scaled_bank_full',
      'banked_ms', v_bank, 'max_ms', r.bank_max_hours::bigint * c_hour)); end if;
  -- THE DAY: every ground together, counted from the append-only ledger.
  v_today := public.hr_scaled_hours_today(v_uid, p_slot);
  if v_today + p_hours > r.day_max_hours then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'scaled_day_limit', 'today', v_today, 'max', r.day_max_hours)); end if;
  -- THE GOLD, then the bank (the lock order the settle keeps: hero, purse, bank row).
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'gold', -v_price,
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', c_verb, 'hunt', p_hunt, 'hours', p_hours, 'level', v_to,
                                                                    'hero_level', v_lv, 'price_per_hour', r.price_per_level::bigint * v_to,
                                                                    'banked_ms', v_bank))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_note_rejection(c_verb, p_slot, v_a || jsonb_build_object('ok', false)); end if;
  insert into public.player_scaled_hours as h (user_id, slot, hunt_id, banked_ms, use_on, bought_ms, spent_ms, bought_at, updated_at)
    values (v_uid, p_slot, p_hunt, p_hours * c_hour, true, p_hours * c_hour, 0, now(), now())
    on conflict (user_id, slot, hunt_id) do update
      set banked_ms = h.banked_ms + excluded.banked_ms, bought_ms = h.bought_ms + excluded.bought_ms, use_on = true,
          bought_at = now(), updated_at = now();
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -v_price, 'hours', p_hours,
                            'scaled_hunts', public.hr_scaled_hunts_view(v_uid, p_slot));
end $fn$;

-- ── §5 THE SWITCH ────────────────────────────────────────────────────────────
create or replace function public.hr_scaled_hunt_switch(p_slot int, p_hunt text, p_on boolean, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'scaled_hunt_switch';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_on is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_switch')); end if;
  if p_hunt is null or p_hunt !~ '^[a-z0-9_]{1,64}$' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_scalable')); end if;
  v_verb := c_verb || ':' || p_hunt || ':' || p_on;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_feature_on('scaled_hunts', v_uid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'feature_off')); end if;
  if not exists (select 1 from public.hr_scaled_grounds g where g.hunt_id = p_hunt) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_scalable')); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  insert into public.player_scaled_hours as h (user_id, slot, hunt_id, use_on, updated_at)
    values (v_uid, p_slot, p_hunt, p_on, now())
    on conflict (user_id, slot, hunt_id) do update set use_on = excluded.use_on, updated_at = now();
  v_r := jsonb_build_object('ok', true, 'hunt', p_hunt, 'on', p_on);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r || jsonb_build_object('scaled_hunts', public.hr_scaled_hunts_view(v_uid, p_slot));
end $fn$;

-- ── §6 THE SETTLE: THREE BODIES (the read an anchored splice that fails closed if its anchor moved and skips on a second apply; the two
--    commit bodies restated whole) ──
-- (a) hr_hunt_instance_read: the server's scale of the next window, and the Level the stored world was built on.
do $mig$
declare
  a1 constant text := $a$      'tier', v_i.tier,
$a$;
  r1 constant text := $a$      'tier', v_i.tier,
      -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): the server's own scale of the next window (hr_scaled_hunt_of: { level, banked_ms,
      -- user, slot } of the leader, or null) and the Level the stored world was built on (the engine restarts a world built on another).
      'scale', public.hr_scaled_hunt_of(v_i.id), 'scale_level', v_i.scale_level,
$a$;
  v_def text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_instance_read(uuid,integer)'::regprocedure), chr(13), '');
  if position('SCALED-HUNTS (2027-03-21-scaled-hunts.sql)' in v_def) > 0 then
    raise notice 'scaled-hunts §6(a): hr_hunt_instance_read already carries the scale - skipped'; return; end if;
  v_n := (length(v_def) - length(replace(v_def, a1, ''))) / length(a1);
  if v_n <> 1 then raise exception 'scaled-hunts §6(a): the hr_hunt_instance_read anchor matched % times (need 1): the body moved', v_n; end if;
  execute replace(v_def, a1, r1);
end $mig$;

-- (b) hr_hunt_apply_instance RESTATED WHOLE (tests/patch-chain-guard.mjs: its chain was 2 deep since 2026-12-23-tally-tasks.sql). The
--     body is the 2026-12-23 text with every later edit folded in, plus this file's: the claim allowed, re-proved before any member
--     lands, the hours spent after every member landed (each marked SCALED-HUNTS). §0 pinned its pre-image.
CREATE OR REPLACE FUNCTION public.hr_hunt_apply_instance(p_instance uuid, p_world_from bigint, p_settle jsonb, p_members jsonb, p_project_user uuid DEFAULT NULL::uuid, p_project_slot integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_skew constant interval := interval '60 seconds';
  -- A fuse on the deploy gap, not a balance figure: the catalogue and the edge land seconds to minutes apart.
  c_shape_grace constant interval := interval '30 minutes';
  v_role  text;
  v_i     public.hunt_instances%rowtype;
  v_to    timestamptz;
  v_win   bigint; v_tick bigint;
  v_wsw   bigint;
  v_world text; v_wj jsonb;
  v_shape public.hr_hunt_world_shape%rowtype;
  v_move  public.hunt_world_shape_move%rowtype;
  v_ground text;
  v_m     jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_h     jsonb;
  v_n     int;
  v_code  text; v_detail text;
  v_first jsonb;
  v_pend  jsonb := '[]'::jsonb;   -- ACCOUNT GOLD: every member's store bill, paid after every member
  v_p     jsonb; v_u uuid; v_f bigint; v_g bigint;
  v_proj  jsonb;   -- FRAME-PUSH (2026-12-25-frame-push-revive.sql): the caller's projection, for its frame and its answer
  v_cur   jsonb;   -- PARTY-ISOLATION (2027-01-22-party-settle-isolation.sql): the member whose own half is being proved
  v_scale int;            -- SCALED-HUNTS: the Level this window played (null: the ground's own), proved before any member lands
  v_sc    jsonb;          -- SCALED-HUNTS: the server's own scale of the instance (hr_scaled_hunt_of)
  v_sms   bigint := 0;    -- SCALED-HUNTS: the hours this window spends, in ms: its world swings x the swing
begin
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): a refusal after the lock is counted; the sixth in a row forfeits.
  -- DEPLOY-NO-FORFEIT (2026-12-11-hunt-deploy-no-forfeit.sql): a world of the shape the catalogue just replaced is held, not counted.
  -- TALLY (2026-12-23-tally-tasks.sql): step (4c) counts every member's kills onto its held kill tasks and pays a member
  -- whose hunt this settle ended (back in town).
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_apply_instance: not callable by %', v_role using errcode = '42501';
  end if;
  if p_instance is null or p_world_from is null or p_settle is null or jsonb_typeof(p_settle) <> 'object'
     or p_members is null or jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) = 0
     or jsonb_array_length(p_members) > coalesce(public.hr_hunt_limit('party_max'), 1) then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments');
  end if;
  -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): `scale` { level } is the Level the edge says the window played, a CLAIM (4) re-proves.
  if exists (select 1 from jsonb_object_keys(p_settle) k where k not in ('to', 'world_swing', 'world', 'scale'))
     or exists (select 1 from jsonb_array_elements(p_members) e
                 where jsonb_typeof(e.value) <> 'object'
                    or exists (select 1 from jsonb_object_keys(e.value) k
                                where k not in ('user', 'slot', 'session', 'version', 'intent', 'delta', 'hunt', 'analyzer'))) then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments', 'why', 'keys');
  end if;
  v_first := p_members->0;

  -- (1) THE INSTANCE LOCK and its world CAS.
  select * into v_i from public.hunt_instances where id = p_instance for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_instance'); end if;
  if v_i.world_swing <> p_world_from then
    -- A settle that already landed under these keys is a replay; anything else lost the race (not counted).
    if not exists (select 1 from jsonb_array_elements(p_members) e
                    where not exists (select 1 from public.player_intents i
                                       where i.user_id = (e.value->>'user')::uuid and i.intent_id = (e.value->>'intent')::uuid)) then
      return jsonb_build_object('ok', true, 'stage', 'replayed', 'replayed', true,
        'state', case when p_project_user is not null then public.hr_state_of(p_project_user, p_project_slot) end);
    end if;
    return jsonb_build_object('ok', false, 'error', 'session_moved', 'world_swing', v_i.world_swing);
  end if;

  -- (2) THE WINDOW and THE WORLD.
  begin v_to := date_trunc('milliseconds', (p_settle->>'to')::timestamptz);
  exception when others then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_window')); end;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  v_win := floor(extract(epoch from (v_to - v_i.settled_to)) * 1000)::bigint;
  if v_to is null or v_i.settled_to is null or v_win <= 0 or v_win % v_tick <> 0 then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', 'bad_window', 'settled_to', v_i.settled_to, 'window_ms', v_win)); end if;
  if v_to > now() + c_skew then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'window_in_future')); end if;
  if jsonb_typeof(p_settle->'world_swing') is distinct from 'number' or (p_settle->>'world_swing') !~ '^[0-9]{1,15}$' then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world_swing')); end if;
  v_wsw := (p_settle->>'world_swing')::bigint;
  if v_wsw < v_i.world_swing or v_wsw > v_i.world_swing + v_win / v_tick then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', 'bad_world_swing', 'from', v_i.world_swing, 'to', v_wsw)); end if;
  if jsonb_typeof(p_settle->'world') = 'string' then
    v_world := p_settle->>'world';
    if octet_length(v_world) > public.hr_hunt_limit('world_max_bytes') then
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
        jsonb_build_object('ok', false, 'error', 'world_too_big', 'bytes', octet_length(v_world))); end if;
    begin v_wj := v_world::jsonb;
    exception when others then
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'json')); end;
    select * into v_shape from public.hr_hunt_world_shape where id;
    select g.ground_id into v_ground from public.hr_hunt_grounds g where g.hunt_id = v_i.hunt_id;
    -- The encoded world (world-state.js): { v, s, w: [ground, swing, …], u: [...], p: [...] }.
    if jsonb_typeof(v_wj) <> 'object' or (v_wj->>'v')::int is distinct from v_shape.version
       or (v_wj->>'s')::bigint is distinct from v_shape.shape
       or jsonb_typeof(v_wj->'w') <> 'array' or jsonb_typeof(v_wj->'u') <> 'array' or jsonb_typeof(v_wj->'p') <> 'array'
       or v_wj->'w'->>0 is distinct from v_ground or (v_wj->'w'->>1)::bigint is distinct from v_wsw then
      -- THE SERVER'S OWN DEPLOY GAP: a well-formed world of THIS instance written under exactly the field list the
      -- catalogue replaced less than c_shape_grace ago (hunt_world_shape_move, written only by the catalogue's own
      -- trigger) is held: nothing moves, nothing is counted. Every other shape still counts toward the forfeit.
      select * into v_move from public.hunt_world_shape_move where id;
      if v_move.prev_shape is not null and v_move.moved_at > now() - c_shape_grace
         and v_move.version = v_shape.version and v_move.shape = v_shape.shape
         and jsonb_typeof(v_wj) = 'object'
         and v_wj->'v' = to_jsonb(v_move.prev_version) and v_wj->'s' = to_jsonb(v_move.prev_shape)
         and jsonb_typeof(v_wj->'w') = 'array' and jsonb_typeof(v_wj->'u') = 'array' and jsonb_typeof(v_wj->'p') = 'array'
         and v_wj->'w'->>0 is not distinct from v_ground and v_wj->'w'->1 = to_jsonb(v_wsw) then
        return public.hr_hunt_settle_held(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'world_shape_moved',
          'detail', jsonb_build_object('from', jsonb_build_object('v', v_move.prev_version, 's', v_move.prev_shape),
                                       'to', jsonb_build_object('v', v_shape.version, 's', v_shape.shape), 'moved_at', v_move.moved_at)));
      end if;
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'shape')); end if;
  elsif jsonb_typeof(p_settle->'world') is distinct from 'null' and p_settle ? 'world' then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'type'));
  end if;

  -- (3) THE MEMBER SET: exactly the instance's open sessions that arrived before `to`.
  if (select count(*) from jsonb_array_elements(p_members)) <> (select count(distinct (e.value->>'session')) from jsonb_array_elements(p_members) e)
     or exists (select 1 from public.hunt_sessions h
                 where h.instance_id = p_instance and h.ended_at is null and h.hunt_from < v_to
                   and not exists (select 1 from jsonb_array_elements(p_members) e
                                    where (e.value->>'session')::uuid = h.id and (e.value->>'user')::uuid = h.user_id
                                      and (e.value->>'slot')::int = h.slot))
     or exists (select 1 from jsonb_array_elements(p_members) e
                 where not exists (select 1 from public.hunt_sessions h
                                    where h.id = (e.value->>'session')::uuid and h.instance_id = p_instance
                                      and h.user_id = (e.value->>'user')::uuid and h.slot = (e.value->>'slot')::int
                                      and h.ended_at is null and h.hunt_from < v_to)) then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'member_set'));
  end if;

  -- (4) EVERY MEMBER, IN (user_id, slot) ORDER, IN ONE SUBTRANSACTION.
  for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
    perform public.hr_hunt_lock((v_m->>'user')::uuid, (v_m->>'slot')::int);
  end loop;
  -- ACCOUNT GOLD (2026-12-15-account-gold.sql): every member's ACCOUNT PURSE, locked in user order right
  -- after the character locks and before any other shared row (a hearthfind ordinal, a tally), so two
  -- settles that share an account queue on its purse and can never hold each other's next lock.
  for v_u in select distinct (e.value->>'user')::uuid from jsonb_array_elements(p_members) e order by 1 loop
    perform public.hr_purse_lock(v_u);
  end loop;
  -- FRAME-PUSH (2026-12-25-frame-push-revive.sql): hr_apply's own frame call is DEFERRED while the members land
  -- (hr_frame_send reads hr.frame_defer); the frames go out below, once, from the committed state.
  perform set_config('hr.frame_defer', 'instance', true);
  begin
    -- SCALED-HUNTS: THE SCALE THIS WINDOW PLAYED, re-proved against the server's own rule before any member lands (each member's kill
    --   bound reads it): a claim stands only if the instance's leader has the switch on, hours banked and a Level that scales the ground
    --   to exactly that Level (hr_scaled_hunt_of), and the window's world swings fit in those hours. No claim is the ground's own rows,
    --   which spend nothing. The Level the stored world is built on is written here.
    v_scale := null;
    if p_settle ? 'scale' and jsonb_typeof(p_settle->'scale') <> 'null' then
      if jsonb_typeof(p_settle->'scale') <> 'object' or exists (select 1 from jsonb_object_keys(p_settle->'scale') k where k <> 'level')
         or jsonb_typeof(p_settle->'scale'->'level') is distinct from 'number' or (p_settle->'scale'->>'level') !~ '^[0-9]{1,4}$' then
        perform public.hr_reject('bad_scale'); end if;
      v_sc := public.hr_scaled_hunt_of(p_instance);
      if v_sc is null or (v_sc->>'level')::int <> (p_settle->'scale'->>'level')::int then
        perform public.hr_reject('scale_moved', jsonb_build_object('claim', p_settle->'scale', 'level', v_sc->'level')); end if;
      v_scale := (v_sc->>'level')::int;
      v_sms := (v_wsw - v_i.world_swing) * v_tick;
      if v_sms > (v_sc->>'banked_ms')::bigint then
        perform public.hr_reject('scale_over', jsonb_build_object('ms', v_sms, 'banked_ms', (v_sc->>'banked_ms')::bigint)); end if;
    end if;
    update public.hunt_instances set scale_level = v_scale where id = p_instance and scale_level is distinct from v_scale;
    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      v_cur := jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot', 'session', v_m->'session');
      v_h := public.hr_hunt_apply_member(p_instance, (v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid,
        (v_m->>'intent')::uuid, v_m->'delta', v_m->'hunt', v_m->'analyzer');
      if v_h ? '_purse' then
        v_pend := v_pend || jsonb_build_array((v_h->'_purse')
                  || jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot', 'session', v_m->'session'));
        v_h := v_h - '_purse';
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot',
        'hunt_settle', v_h, 'session', public.hr_hunt_view((v_m->>'session')::uuid)));
    end loop;
    -- (4b) THE STORE BILLS, PAID FROM THE ACCOUNT PURSES (2026-12-15-account-gold.sql), after EVERY member's
    --      coins, cover and sales have landed: the engine spends one purse per account in time order, so
    --      with every credit in first no bill can take a purse below 0 (the window's whole bill is what
    --      that order kept payable). A bill the purse cannot pay means another hero of the account spent
    --      it since this window was read: gold_short, nothing lands, and the edge re-reads at once.
    for v_p in select e.value from jsonb_array_elements(v_pend) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      v_cur := jsonb_build_object('user', v_p->'user', 'slot', v_p->'slot', 'session', v_p->'session');
      v_g := public.hr_purse_move((v_p->>'user')::uuid, -(v_p->>'cost')::bigint, 0);
      if v_g is null then
        perform public.hr_reject('gold_short', jsonb_build_object('why', 'purse', 'gold', public.hr_purse_of((v_p->>'user')::uuid),
          'cost', (v_p->>'cost')::bigint, 'floor', (v_p->>'floor')::bigint));
      end if;
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id, purse)
        values ((v_p->>'user')::uuid, (v_p->>'slot')::int, 'hunt', 'supply_buy', -(v_p->>'cost')::bigint, -(v_p->>'units')::bigint,
                jsonb_build_object('reason', 'supply_buy', 'source', 'store', 'items', v_p->'items', 'gold', (v_p->>'cost')::bigint),
                (v_p->>'session')::uuid, v_g);
    end loop;
    -- THE FLOOR, per account: after the window, the purse may not sit below the lowest "Keep at least" of
    -- its heroes that bought (one hero: its own floor, the pre-account-gold rule exactly).
    for v_u, v_f in select (e.value->>'user')::uuid, min((e.value->>'floor')::bigint)
                      from jsonb_array_elements(v_pend) e group by 1 order by 1 loop
      if public.hr_purse_of(v_u) < v_f then
        select jsonb_build_object('user', e.value->'user', 'slot', e.value->'slot', 'session', e.value->'session') into v_cur
          from jsonb_array_elements(v_pend) e where (e.value->>'user')::uuid = v_u
         order by (e.value->>'floor')::bigint, (e.value->>'slot')::int limit 1;
        perform public.hr_reject('gold_short', jsonb_build_object('why', 'floor', 'gold', public.hr_purse_of(v_u), 'floor', v_f));
      end if;
    end loop;
    v_cur := null;
    if exists (select 1 from jsonb_array_elements(v_out) o where coalesce((o.value->'hunt_settle'->>'replayed')::boolean, false)) then
      -- A member whose key already landed under a moved instance is a defect (the CAS above passed).
      perform public.hr_reject('session_moved', jsonb_build_object('why', 'partial_replay'));
    end if;
    -- (4c) TAMSIN'S TALLY (2026-12-23-tally-tasks.sql), EVERY member, in (user_id, slot) order, under the character
    --      locks and purses taken above: its own kills by monster (the combat journal hr_apply just wrote, held by the
    --      kill bound) onto its held tasks on this ground; then, for a member whose hunt this settle ended, the
    --      payment of what is done (hr_tally_claim: the per-day cap, the bag, the purse, one session-stamped row).
    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      v_cur := jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot', 'session', v_m->'session');
      perform public.hr_tally_count((v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid, v_m->'delta'->'journal'->'meta');
      if exists (select 1 from public.hunt_sessions h where h.id = (v_m->>'session')::uuid and h.ended_at is not null) then
        perform public.hr_tally_claim((v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid);
      end if;
    end loop;
    -- SCALED-HUNTS: THE HOURS SPENT, from the leader's bank, under every member's lock and purse taken above (a purchase takes its
    --   hero's lock, then the purse, then this row: the same order). They tick down only while the party is in the spawn: the window's
    --   world swings, never town or travel. Refused, never clamped, if the bank no longer holds them.
    if v_scale is not null and v_sms > 0 then
      update public.player_scaled_hours h
         set banked_ms = h.banked_ms - v_sms, spent_ms = h.spent_ms + v_sms, updated_at = now()
       where h.user_id = (v_sc->>'user')::uuid and h.slot = (v_sc->>'slot')::int and h.hunt_id = v_i.hunt_id and h.banked_ms >= v_sms;
      if not found then perform public.hr_reject('scale_over', jsonb_build_object('ms', v_sms)); end if;
    end if;
    -- PARTY-ISOLATION (2027-01-22-party-settle-isolation.sql): every member's half landed, so each committed seat's
    --      own count starts over too (the fuse counts consecutive refusals only).
    v_cur := null;
    update public.hunt_sessions set refusals = 0
     where id in (select (e.value->>'session')::uuid from jsonb_array_elements(p_members) e) and refusals > 0;
    -- THE INSTANCE: its world (none once no session of it is open), swing counter and clock; the count starts over.
    select count(*) into v_n from public.hunt_sessions h where h.instance_id = p_instance and h.ended_at is null;
    update public.hunt_instances
       set world = case when v_n > 0 then v_world end, world_swing = v_wsw,
           settled_to = v_to, next_swing_at = v_to, refusals = 0, version = version + 1
     where id = p_instance;
  exception when sqlstate 'HR000' then
    get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
    perform set_config('hr.hunt_session', '', true);
    perform set_config('hr.frame_defer', '', true);   -- FRAME-PUSH: a refused settle sends nothing
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', v_code, 'stage', 'instance',
        'detail', case when v_detail ~ '^\{.*\}$' then v_detail::jsonb end)
      -- PARTY-ISOLATION: the member whose own half raised it; hr_hunt_settle_refused counts it on that seat alone.
      || case when v_cur is not null then jsonb_build_object('member', v_cur) else '{}'::jsonb end);
  end;
  -- FRAME-PUSH (2026-12-25-frame-push-revive.sql): THE COMMIT POINT. Every member's rows, the purse bills and the
  -- instance row have landed: ONE frame per member, in lock order, of the state the database now holds (hr_frame_send:
  -- only to a character open in a client, never the requester's own echo, a fresh projection only for a watched one).
  -- A push failure never fails the settle: hr_frame_send swallows its own errors, and this handler stands behind it.
  perform set_config('hr.frame_defer', '', true);
  v_proj := case when p_project_user is not null then public.hr_state_of(p_project_user, p_project_slot) end;
  begin
    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      perform public.hr_frame_send((v_m->>'user')::uuid, (v_m->>'slot')::int,
        case when (v_m->>'user')::uuid = p_project_user and (v_m->>'slot')::int = p_project_slot then v_proj end);
    end loop;
  exception when others then
    raise warning 'hr_hunt_apply_instance: frames for % not sent (%) — the settle is committed anyway', p_instance, sqlerrm;
  end;
  return jsonb_build_object('ok', true, 'members', v_out,
    'instance', jsonb_build_object('id', p_instance, 'world_swing', v_wsw, 'settled_to', v_to),
    'state', v_proj);
end $function$;

-- (c) hr_hunt_apply_member RESTATED WHOLE (its chain was 3 deep since 2027-01-31-inner-flame.sql): a window proved scaled is bounded
--     by its scaled roster's own most a kill pays, and its Defense by their Level (marked SCALED-HUNTS). §0 pinned its pre-image.
CREATE OR REPLACE FUNCTION public.hr_hunt_apply_member(p_instance uuid, p_user uuid, p_slot integer, p_session uuid, p_intent uuid, p_delta jsonb, p_hunt jsonb, p_analyzer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- The combat skills a death costs (src/data/skills.js COMBAT_SKILLS: the catalogue's `combat` rows, so a renamed or new
  -- combat skill is priced with no body edit; 2027-01-31-inner-flame.sql); the Level is priced as `level`.
  c_xp_skills constant text[] := array(select k.skill_id from public.hr_skills k where k.cat = 'combat' order by k.skill_id);
  c_day_ms    constant bigint := 86400000;
  v_s     public.hunt_sessions%rowtype;
  v_ver   bigint;
  v_a     jsonb;
  v_h     jsonb;
  v_hunt  jsonb;
  v_to    timestamptz;
  v_dx    jsonb; v_nd int; v_el jsonb; v_k text; v_v jsonb;
  v_lost  jsonb := '{}'::jsonb; v_rate int;
  v_xp0   jsonb := '{}'::jsonb; v_ev0 bigint := 0;
  v_n bigint; v_cur bigint; v_lv int; v_lv0 int; v_fin int; v_fi int; v_r record;
  v_stam  jsonb; v_cap bigint; v_sat timestamptz; v_s0 bigint; v_e bigint;
  v_win bigint; v_paid bigint; v_nsw bigint; v_tick bigint;
  v_lx0 bigint; v_lxb bigint; v_base int; v_lvl int; v_xfloor bigint; v_vit jsonb; v_mana bigint; v_def bigint;
  v_buys jsonb; v_cost bigint := 0; v_units bigint := 0; v_items jsonb := '{}'::jsonb;
  v_price bigint; v_kind text; v_bk jsonb := '{}'::jsonb; v_day jsonb := '{}'::jsonb; v_ukind jsonb := '{}'::jsonb;
  v_cons int; v_off int; v_ammo_max int;
  v_gold_now bigint; v_cover jsonb; v_cgold bigint := 0; v_cunits bigint := 0; v_citems jsonb := '{}'::jsonb;
  v_unit bigint; v_avail bigint; v_supply jsonb; v_floor bigint;
  v_kills bigint; v_ground public.hr_hunt_grounds%rowtype; v_kmax bigint;
  v_dmax bigint; v_pass bigint;  -- DENSITY-BOUNDS: the catalogue's ceiling on any pick; what the ground presents at once
  v_vb_gold bigint; v_vb_xp bigint; v_vb_h bigint; v_vb_item text; v_magic bigint;
  v_unit_id int;
  v_bless jsonb;  -- the blessing hook's answer (hr_blessing_take, 2026-10-25-blessings.sql)
  v_loot  jsonb;  -- the loot filter's answer (hr_hunt_loot_rules, 2026-10-25-bag-rules.sql)
  v_end text; v_lk text; v_li text; v_home timestamptz; v_ok boolean;
begin
  if p_user is null or p_slot is null or p_session is null or p_intent is null
     or p_delta is null or jsonb_typeof(p_delta) <> 'object' or p_hunt is null or jsonb_typeof(p_hunt) <> 'object' then
    perform public.hr_reject('bad_arguments'); end if;
  -- (1) THE CHARACTER LOCK (hr_apply's key) and the session — of THIS instance.
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session or v_s.instance_id <> p_instance then
    perform public.hr_reject('no_hunt', jsonb_build_object('session', p_session)); end if;
  -- (2a) THE STORED INDEX (a key that already landed falls through: hr_apply replays it).
  if jsonb_typeof(p_hunt->'swing_from') is distinct from 'number' or (p_hunt->>'swing_from') !~ '^[0-9]{1,15}$' then
    perform public.hr_reject('bad_swing'); end if;
  if (p_hunt->>'swing_from')::bigint <> v_s.swing_index
     and not exists (select 1 from public.player_intents i where i.user_id = p_user and i.intent_id = p_intent) then
    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;
  select version into v_ver from public.player_state where user_id = p_user and slot = p_slot;
  if v_ver is null then perform public.hr_reject('no_character'); end if;
  begin v_to := (p_hunt->>'to')::timestamptz;
  exception when others then perform public.hr_reject('bad_window'); end;
  if v_to is null then perform public.hr_reject('bad_window'); end if;

  -- (2b) THE PRICE OF THE DEATH, shape only: at most one death a settle (it ends the hunt),
  --      priced as `level` and the combat skills.
  v_dx := p_hunt->'death_xp';
  v_hunt := p_hunt - 'death_xp' - 'stamina' - 'buys' - 'cover' - 'unit_id' - 'tick_ms';
  v_nd := case when jsonb_typeof(p_delta->'deaths') = 'array' then jsonb_array_length(p_delta->'deaths') else 0 end;
  if v_dx is null and v_nd = 0 then v_dx := '[]'::jsonb; end if;
  if v_dx is null or jsonb_typeof(v_dx) <> 'array' or jsonb_array_length(v_dx) <> v_nd or v_nd > 1 then
    perform public.hr_reject('bad_death_xp'); end if;
  for v_el in select value from jsonb_array_elements(v_dx) loop
    if jsonb_typeof(v_el) <> 'object' then perform public.hr_reject('bad_death_xp'); end if;
    for v_k, v_v in select key, value from jsonb_each(v_el) loop
      if (v_k <> 'level' and v_k <> all (c_xp_skills)) or jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,12}$' then
        perform public.hr_reject('bad_death_xp'); end if;
      if (v_v #>> '{}')::bigint > 0 then
        v_lost := v_lost || jsonb_build_object(v_k, coalesce((v_lost->>v_k)::bigint, 0) + (v_v #>> '{}')::bigint);
      end if;
    end loop;
  end loop;
  if v_lost <> '{}'::jsonb then
    v_rate := public.hr_hunt_limit('death_xp_permille');
    v_base := public.hr_hunt_limit('death_xp_base');
    if v_rate is null or v_base is null then perform public.hr_reject('catalogue_missing'); end if;
  end if;
  -- (2c) THE STAMINA POOL, shape only; the start value is the DATABASE's.
  v_stam := p_hunt->'stamina';
  if v_stam is null or jsonb_typeof(v_stam) <> 'number' or (v_stam #>> '{}') !~ '^[0-9]{1,12}$' then
    perform public.hr_reject('bad_stamina'); end if;
  -- The cap over the window: premium_until only ever rises, so it is the
  -- larger of the caps at its two ends.
  v_cap := greatest(public.hr_stamina_cap(p_user, p_slot, v_s.settled_to), public.hr_stamina_cap(p_user, p_slot, v_to));
  if v_cap is null then perform public.hr_reject('catalogue_missing'); end if;
  select stamina_at, level_xp into v_sat, v_lx0 from public.player_state where user_id = p_user and slot = p_slot;
  if v_sat is not null and v_sat > v_s.settled_to then perform public.hr_reject('stamina_ahead'); end if;
  v_s0 := public.hr_stamina_of(p_user, p_slot, v_s.settled_to);
  -- (2d) THE STORE, shape only (re-priced and debited below).
  v_buys := coalesce(p_hunt->'buys', '{}'::jsonb);
  if jsonb_typeof(v_buys) <> 'object' or (select count(*) from jsonb_object_keys(v_buys)) > 20
     or exists (select 1 from jsonb_each(v_buys) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_buys'); end if;
  v_cover := coalesce(p_hunt->'cover', '{}'::jsonb);
  if jsonb_typeof(v_cover) <> 'object' or (select count(*) from jsonb_object_keys(v_cover)) > 64
     or exists (select 1 from jsonb_each(v_cover) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_cover'); end if;
  -- (2e) THE HERO'S UNIT and the analyzer tally, shape only.
  if p_hunt ? 'unit_id' and jsonb_typeof(p_hunt->'unit_id') <> 'null'
     and (jsonb_typeof(p_hunt->'unit_id') <> 'number' or (p_hunt->>'unit_id') !~ '^[0-9]{1,6}$') then
    perform public.hr_reject('bad_unit'); end if;
  v_unit_id := case when jsonb_typeof(p_hunt->'unit_id') = 'number' then (p_hunt->>'unit_id')::int end;
  if p_analyzer is not null and jsonb_typeof(p_analyzer) <> 'null'
     and (jsonb_typeof(p_analyzer) <> 'object'
          or exists (select 1 from jsonb_object_keys(p_analyzer) k where k not in ('dealt', 'taken', 'healed', 'fight'))
          or (p_analyzer ? 'fight' and not public.hr_boss_fight_ok(p_analyzer->'fight', v_s.hunt_id)) -- CALL-OUT: one room's record
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'dealt', '{}'::jsonb), array['byAbility', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'taken', '{}'::jsonb), array['byMonster', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'healed', '{}'::jsonb), array['bySource'])) then
    perform public.hr_reject('bad_analyzer'); end if;
  select * into v_ground from public.hr_hunt_grounds g where g.hunt_id = v_s.hunt_id;
  if not found then perform public.hr_reject('no_ground', jsonb_build_object('hunt', v_s.hunt_id)); end if;
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): what the ground can present at once is its as-built
  -- rows plus every pocket's pull at the density the SERVER froze for this instance when it opened
  -- (hunt_instances.density, hr_hunt_density_freeze; the engine plays exactly it, hr_hunt_instance_read).
  -- An instance opened before the freeze existed reads the catalogue's ceiling (density_max). Never a
  -- client or edge number, never today's action-set row.
  v_dmax := coalesce((select i.density from public.hunt_instances i where i.id = p_instance)::bigint,
                     public.hr_hunt_limit('density_max'));
  if v_dmax is null or v_dmax < 0 then perform public.hr_reject('catalogue_missing', jsonb_build_object('limit', 'density_max')); end if;
  v_pass := v_ground.spawns::bigint + v_ground.pockets::bigint * v_dmax;
  select coalesce(jsonb_object_agg(skill_id, xp), '{}'::jsonb) into v_xp0
    from public.player_skills where user_id = p_user and slot = p_slot and skill_id = any (c_xp_skills);
  select coalesce(max(id), 0) into v_ev0 from public.hunt_session_events where session_id = p_session;

  -- CALL-OUT (2027-03-12-boss-call.sql): A CALLED ROOM PAYS NOTHING, by any route: refused whole, before hr_apply writes a thing.
  if exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id and public.hr_boss_call_pays(p_delta, c.monster_id) is not null) then
    perform public.hr_reject('called_pays', jsonb_build_object('hunt', v_s.hunt_id)); end if;

  -- (3) THE VALUE HALF: hr_apply, every row it writes stamped with the session.
  perform set_config('hr.hunt_session', p_session::text, true);
  v_a := public.hr_apply(p_user, p_slot, v_ver, p_intent, p_delta);
  perform set_config('hr.hunt_session', '', true);
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    perform public.hr_reject(coalesce(v_a->>'error', 'apply_failed'), v_a);
  end if;
  if coalesce(v_a->>'replayed', 'false') = 'true' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;

  -- (4) THE KILL BOUND: the kills THIS settle's stamped rows journal, held to
  --     what the ground presents at once (v_pass) times the respawns the window's time admits.
  v_win := floor(extract(epoch from (v_to - v_s.settled_to)) * 1000)::bigint;
  select coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then (l.meta->>'kills')::numeric else 0 end), 0)::bigint
    into v_kills
    from public.player_ledger l
   where l.session_id = p_session and l.kind <> 'hunt'
     and l.id > coalesce((select t.ledger_hwm from public.hunt_session_tally t where t.session_id = p_session), 0)
     and l.at >= now() - interval '25 hours';
  v_kmax := v_pass * (greatest(v_win, 0) / v_ground.respawn_ms + 2);
  if v_kills > v_kmax then
    perform public.hr_reject('kills_over', jsonb_build_object('kills', v_kills, 'max', v_kmax, 'window_ms', v_win, 'pass', v_pass));
  end if;
  -- (4c) THE VALUE BOUND, against the ground's own monsters.
  v_vb_h := public.hr_hunt_limit('value_headroom');
  select coalesce(max(b.gold_max), 0), coalesce(max(b.xp_max), 0) into v_vb_gold, v_vb_xp
    from public.hr_hunt_kill_bounds b
   where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id);
  -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): a window the commit proved scaled (hunt_instances.scale_level, written by
  -- hr_hunt_apply_instance before any member lands) is bounded by its scaled roster's most a kill pays as well (hr_scaled_kill_bounds).
  select greatest(v_vb_gold, coalesce(max(b.gold_max), 0)), greatest(v_vb_xp, coalesce(max(b.xp_max), 0)) into v_vb_gold, v_vb_xp
    from public.hunt_instances i join public.hr_scaled_kill_bounds b on b.hunt_id = i.hunt_id and b.level = i.scale_level
   where i.id = p_instance;
  -- THE MAGIC BOUND reads the hero's OWN max mana (hr_vitals_of): a full pool, then its regen at the
  -- Inner Flame rate plus the most a drink every lane restores, every minute; x the largest ability
  -- multiplier (hr_hunt_abilities) on top of the per-mana rate.
  v_vit := public.hr_vitals_of(p_user, p_slot);
  v_mana := (v_vit->>'max_mana')::bigint;
  v_magic := ceil((v_mana + (greatest(v_win, 0) / 60000 + 1)
                   * (ceil(v_mana * public.hr_hunt_limit('mana_regen_pct_min') * (v_vit->>'regen_pm')::int / 100000.0)
                      + public.hr_hunt_limit('drink_mana_per_min_max')))
                  * public.hr_hunt_limit('magic_xp_permille') / 1000.0
                  * greatest(1000, coalesce(public.hr_hunt_limit('magic_xp_mult_max'), 1000)) / 1000.0)::bigint;
  -- THE DEFENSE BOUND: every swing interval of the window, every foe the ground can engage at once
  -- (what it presents at once, at most a full box twice over or the density ceiling), at the highest level it spawns, the block multiple.
  v_def := ceil((greatest(v_win, 0) / public.hr_hunt_limit('swing_interval_ms') + 1)
                * least(v_pass, greatest(v_dmax, 16))
                * greatest(coalesce((select max(public.hr_monster_level(sp.monster_id)) from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id), 0),
                           coalesce((select b.level_max from public.hunt_instances i join public.hr_scaled_kill_bounds b
                                       on b.hunt_id = i.hunt_id and b.level = i.scale_level where i.id = p_instance), 0))
                * public.hr_hunt_limit('defense_xp_level_permille') / 1000.0 * public.hr_hunt_limit('block_mult'))::bigint;
  if jsonb_typeof(p_delta->'gold') = 'number' and (p_delta->>'gold')::numeric > v_kills * v_vb_gold * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'gold', 'gold', p_delta->'gold', 'kills', v_kills,
      'max', v_kills * v_vb_gold * v_vb_h)); end if;
  if jsonb_typeof(p_delta->'xp') = 'object'
     and (select coalesce(sum(greatest(0, (e.value #>> '{}')::numeric)), 0) from jsonb_each(p_delta->'xp') e
           where jsonb_typeof(e.value) = 'number') > ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'xp', 'kills', v_kills, 'pass', v_pass,
      'max', ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h)); end if;
  -- THE LEVEL XP BOUND (kills only): the journalled kills x the most one kill of the ground pays.
  if jsonb_typeof(p_delta->'level_xp') = 'number' and (p_delta->>'level_xp')::numeric > v_kills * v_vb_xp * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'level_xp', 'level_xp', p_delta->'level_xp', 'kills', v_kills,
      'max', v_kills * v_vb_xp * v_vb_h)); end if;
  if jsonb_typeof(p_delta->'items') = 'object' then
    select e.key into v_vb_item from jsonb_each(p_delta->'items') e
     where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric > 0
       and (e.value #>> '{}')::numeric > v_kills * coalesce((
             select max(coalesce((b.drops->>e.key)::numeric, 0)) from public.hr_hunt_kill_bounds b
              where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id)), 0)
     limit 1;
    if v_vb_item is not null then
      perform public.hr_reject('value_over', jsonb_build_object('what', 'item', 'item', left(v_vb_item, 64),
        'qty', p_delta->'items'->v_vb_item, 'kills', v_kills)); end if;
  end if;

  -- (5a) THE STAMINA POOL, RE-PROVED AND WRITTEN (before the session half,
  --      whose `stamina` end proof reads this row). Every swing of a hunt drains
  --      (there is no knockout to rest in): P = swings x interval, the window is
  --      P to the millisecond, and E = max(0, S0 − P) exactly; an empty pool walks
  --      no swing.
  if jsonb_typeof(p_hunt->'paid_ms') is distinct from 'number'
     or jsonb_typeof(p_hunt->'swing_to') is distinct from 'number'
     or (p_hunt->>'paid_ms')::numeric not between 0 and 1e12
     or (p_hunt->>'swing_to')::numeric not between 0 and 1e15 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'shape')); end if;
  v_e    := (v_stam #>> '{}')::bigint;
  v_paid := (p_hunt->>'paid_ms')::numeric::bigint;
  v_nsw  := (p_hunt->>'swing_to')::numeric::bigint - v_s.swing_index;
  if v_win < 0 or v_nsw < 0 or v_paid > v_win or v_paid < v_win - 1 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'window', 'window_ms', v_win, 'paid_ms', v_paid)); end if;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  if v_tick is null or v_tick <= 0 or v_paid <> v_nsw * v_tick then
    perform public.hr_reject('bad_clock', jsonb_build_object('paid_ms', v_paid, 'swings', v_nsw, 'interval_ms', v_tick)); end if;
  if v_e <> greatest(0, v_s0 - v_paid) then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'bound', 'from_ms', v_s0, 'ms', v_e, 'paid_ms', v_paid)); end if;
  if v_s0 <= 0 and v_nsw > 0 then perform public.hr_reject('end_missing', jsonb_build_object('reason', 'stamina')); end if;
  update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;

  -- (5b) THE STORE: sell-to-cover first, then every store use, priced by the
  --      catalogue, under the hero's own setting, capped, debited, journalled.
  v_supply := public.hr_hunt_supply_of(p_user, p_slot, v_s.preset);
  v_floor := (v_supply->>'gold_floor')::bigint;
  if v_cover <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_cover) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select c.unit into v_unit from public.hr_hunt_cover_items c where c.item_id = v_k;
      if v_unit is null then perform public.hr_reject('not_coverable', jsonb_build_object('item', v_k)); end if;
      -- NOTHING SELLS A LOCKED ITEM (hook: hr_item_locked; hr_hunt_member_read never offers one).
      if public.hr_item_locked(p_user, p_slot, v_k) then perform public.hr_reject('item_locked', jsonb_build_object('item', v_k)); end if;
      select least(
               coalesce((select pi.qty from public.player_inventory pi where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_k), 0),
               coalesce((select (t.loot->>v_k)::numeric from public.hunt_session_tally t where t.session_id = p_session), 0)::bigint
               + greatest(0, coalesce(case when jsonb_typeof(p_delta->'items'->v_k) = 'number' then (p_delta->'items'->>v_k)::numeric end, 0))::bigint
               - coalesce((select (t.covered->>v_k)::bigint from public.hunt_session_tally t where t.session_id = p_session), 0))
        into v_avail;
      if v_n > coalesce(v_avail, 0) then
        perform public.hr_reject('cover_over', jsonb_build_object('item', v_k, 'units', v_n, 'avail', v_avail)); end if;
      delete from public.player_inventory where user_id = p_user and slot = p_slot and item_id = v_k and qty = v_n;
      update public.player_inventory set qty = qty - v_n where user_id = p_user and slot = p_slot and item_id = v_k;
      v_citems := v_citems || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'unit', v_unit));
      v_cgold := v_cgold + v_n * v_unit;
      v_cunits := v_cunits + v_n;
      v_unit := null; v_avail := null;
    end loop;
    if v_cgold > 0 then
      -- THE ACCOUNT PURSE (2026-12-15-account-gold.sql), locked by hr_hunt_apply_instance.
      v_gold_now := public.hr_purse_move(p_user, v_cgold, 0);
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id, purse)
        values (p_user, p_slot, 'hunt', 'vendor_cover', v_cgold, -v_cunits,
                jsonb_build_object('reason', 'vendor_cover', 'items', v_citems, 'gold', v_cgold), p_session, v_gold_now);
      update public.hunt_session_tally t
         set covered = public.hr_jsonb_add(t.covered, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                          from jsonb_each(v_citems) i)),
             cover_gold = t.cover_gold + v_cgold
       where t.session_id = p_session;
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'cover', v_to, jsonb_build_object('n', v_cunits, 'gold', v_cgold));
    end if;
    -- Loot is sold only to pay the store: a window that sold and bought nothing is refused.
    if v_buys = '{}'::jsonb then perform public.hr_reject('cover_unspent'); end if;
  end if;
  -- THE LOOT FILTER (hook: hr_hunt_loot_rules): sell / ignore on pickup, online or not, after cover.
  v_loot := public.hr_hunt_loot_rules(p_user, p_slot, p_session, p_intent, p_delta->'items', v_to);
  perform set_config('hr.hunt_session', '', true);
  v_cons := (select l.ms from public.hr_hunt_lanes l where l.lane = 'consumable' and l.active);
  v_off  := (select l.ms from public.hr_hunt_lanes l where l.lane = 'offense' and l.active);
  v_ammo_max := public.hr_hunt_limit('ability_ammo_max');
  if v_cons is null or v_off is null or v_ammo_max is null then perform public.hr_reject('catalogue_missing'); end if;
  -- Own uses per kind (the bag lines the session half will debit).
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_ukind from (
    select q.kind as k, sum((u.value #>> '{}')::bigint) as n
      from jsonb_each(case when jsonb_typeof(p_hunt->'uses') = 'object' then p_hunt->'uses' else '{}'::jsonb end) u
      join public.hr_hunt_supplies q on q.item_id = u.key
     where jsonb_typeof(u.value) = 'number' group by q.kind) a;
  if v_buys <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_buys) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select q.price, q.kind into v_price, v_kind from public.hr_hunt_basic_supplies q where q.basic_id = v_k;
      if v_price is null then perform public.hr_reject('not_for_sale', jsonb_build_object('item', v_k)); end if;
      -- THE STORE IS USED ONLY ON THE HERO'S OWN SETTING (spec §3.4 #5-7).
      if not (v_supply->>'supply_source' = 'store' or v_supply->>'on_empty' = 'switch') then
        perform public.hr_reject('store_off', jsonb_build_object('item', v_k)); end if;
      v_bk := v_bk || jsonb_build_object(v_kind, coalesce((v_bk->>v_kind)::bigint, 0) + v_n);
      v_items := v_items || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'price', v_price));
      v_cost := v_cost + v_n * v_price;
      v_units := v_units + v_n;
      v_price := null; v_kind := null;
    end loop;
    select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_day from (
      select q.kind as k, sum((x.value->>'qty')::bigint) as n
        from public.player_ledger l, jsonb_each(case when jsonb_typeof(l.meta->'items') = 'object' then l.meta->'items' else '{}'::jsonb end) x
        join public.hr_hunt_basic_supplies q on q.basic_id = x.key
       where l.user_id = p_user and l.slot = p_slot and l.kind = 'hunt' and l.intent = 'supply_buy'
         and l.at >= public.hr_utc_day_start(now()) group by q.kind) a;
    -- PER UTC DAY: the food-and-drink lane's buys, and the shots, over 24 h.
    if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_day->>'heal')::bigint, 0)
         + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_day->>'mana')::bigint, 0) > c_day_ms / v_cons + 1
       or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_day->>'ammo')::bigint, 0)
            > c_day_ms / v_tick + 1 + (c_day_ms / v_off + 1) * (v_ammo_max + 1) then
      perform public.hr_reject('too_many_buys', jsonb_build_object('why', 'day', 'bought', v_bk, 'today', v_day)); end if;
    -- THE STORE BILL IS PAID FROM THE ACCOUNT PURSE AFTER EVERY MEMBER'S CREDITS
    -- (2026-12-15-account-gold.sql). This member's bill rides back to hr_hunt_apply_instance
    -- (`_purse`, stripped there): once every member of the instance has applied, it debits
    -- each bill under the account's row lock (never below 0), journals its supply_buy row
    -- and holds each account to the lowest floor of its heroes that bought. Heroes of one
    -- account in one instance spend the ONE purse in time order (the engine shares it), so
    -- only that whole-window order can be re-proved; any member-by-member order could dip.
    if v_cost > 0 then
      update public.hunt_session_tally t
         set bought = public.hr_jsonb_add(t.bought, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                        from jsonb_each(v_items) i)),
             supply_gold = t.supply_gold + v_cost
       where t.session_id = p_session;
    end if;
  end if;
  -- PER WINDOW, OWN + STORE TOGETHER: food and drink share ONE lane (consumable,
  -- consumables.js laneMs); a shot or a rune is at most one a swing (the ranged
  -- basic) plus every ability cast's on the offense lane.
  if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_ukind->>'heal')::bigint, 0)
       + coalesce((v_ukind->>'mana')::bigint, 0) > v_win / v_cons + 1
     or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_ukind->>'ammo')::bigint, 0)
       > v_nsw + 1 + (v_win / v_off + 1) * (v_ammo_max + 1) then
    perform public.hr_reject('too_many_uses', jsonb_build_object('bought', v_bk, 'used', v_ukind, 'window_ms', v_win));
  end if;

  -- (5) THE SESSION HALF (2026-10-23-hunt-supply-ledger.sql).
  -- The session half's gold_out proof reads the purse less this window's own bill (paid later).
  perform set_config('hr.purse_pending', v_cost::text, true);
  v_h := public.hr_hunt_settle_session(p_user, p_slot, p_session, v_hunt);
  perform set_config('hr.purse_pending', '', true);
  if coalesce(v_h->>'ok', 'true') = 'false' then perform public.hr_reject(coalesce(v_h->>'error', 'hunt_settle_refused'), v_h); end if;
  -- STAMINA LOW: once per hunt, when the pool this window left is at or under the limits row.
  if v_e <= coalesce(public.hr_hunt_limit('stamina_low_min'), 0)::bigint * 60000
     and not exists (select 1 from public.hunt_session_events e where e.session_id = p_session and e.type = 'stamina_low') then
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'stamina_low', v_to, jsonb_build_object('n', v_e / 60000));
  end if;

  -- BLESSINGS (hook: hr_blessing_take): the death keeps only the unprotected share of its
  -- loss (Level and skills); the tiers it used (held since before the window began) are used up.
  if v_nd > 0 then
    v_bless := public.hr_blessing_take(p_user, p_slot, p_session, v_dx, v_s.settled_to);
    if v_bless is not null then v_dx := v_bless->'dx'; v_lost := v_bless->'lost'; end if;
  end if;
  -- (6) THE PRICE OF THE DEATH, RE-CHECKED AND DEBITED (Tyler 2026-10-19, CORE_MODEL.md §6):
  --     the LEVEL loses at most death_xp_permille of its total XP (death_xp_base 0) or of
  --     its current Level's span (1), the debit never below the current Level's start;
  --     each combat skill loses at most the permille of its progress into its level.
  --     Bounds are read on the CURRENT values, which only grew since the death.
  if v_lost <> '{}'::jsonb then
    for v_k, v_n in select key, (value #>> '{}')::bigint from jsonb_each(v_lost) order by key loop
      if v_k = 'level' then
        select level_xp into v_cur from public.player_state where user_id = p_user and slot = p_slot for update;
        v_lvl := public.hr_char_level(v_cur);
        v_xfloor := public.hr_char_xp_for_level(v_lvl);
        v_lxb := case when v_base = 1 then public.hr_char_xp_for_level(v_lvl + 1) - v_xfloor else v_cur end;
        if v_n > floor(v_lxb * v_rate / 1000.0) or v_cur - v_n < v_xfloor then
          perform public.hr_reject('death_xp_over', jsonb_build_object('skill', 'level', 'level', v_lvl)); end if;
        update public.player_state set level_xp = level_xp - v_n where user_id = p_user and slot = p_slot;
        continue;
      end if;
      select xp into v_cur from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_k for update;
      if v_cur is null then perform public.hr_reject('bad_death_xp', jsonb_build_object('skill', v_k)); end if;
      v_lv := public.hr_skill_level(v_k, v_cur);
      v_xfloor := public.hr_skill_xp_for_level(v_k, v_lv);
      if v_n > floor((v_cur - v_xfloor) * v_rate / 1000.0) or v_cur - v_n < v_xfloor then
        perform public.hr_reject('death_xp_over', jsonb_build_object('skill', v_k, 'level', v_lv)); end if;
      update public.player_skills set xp = xp - v_n where user_id = p_user and slot = p_slot and skill_id = v_k;
    end loop;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'death_xp',
              jsonb_build_object('reason', 'death_xp', 'xp', v_lost, 'deaths', v_nd, 'permille', v_rate, 'base', v_base), p_session);
    for v_r in select e.id, e.data->>'skill' as sk, (e.data->>'level')::int as lv
                 from public.hunt_session_events e
                where e.session_id = p_session and e.id > v_ev0 and e.type = 'level_up' and v_lost ? (e.data->>'skill') loop
      if v_r.sk = 'level' then
        v_fin := public.hr_char_level((select level_xp from public.player_state where user_id = p_user and slot = p_slot));
        v_lv0 := public.hr_char_level(coalesce(v_lx0, 0));
      else
        v_fin := public.hr_skill_level(v_r.sk, (select xp from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_r.sk));
        v_lv0 := public.hr_skill_level(v_r.sk, coalesce((v_xp0->>v_r.sk)::bigint, 0));
      end if;
      if v_r.lv > v_fin then
        if v_fin > v_lv0 then update public.hunt_session_events set data = data || jsonb_build_object('level', v_fin) where id = v_r.id;
        else delete from public.hunt_session_events where id = v_r.id; end if;
      end if;
    end loop;
  end if;
  v_fi := 0;
  for v_r in select e.id from public.hunt_session_events e
              where e.session_id = p_session and e.id > v_ev0 and e.type = 'death' order by e.id loop
    v_el := coalesce(v_dx->v_fi, '{}'::jsonb);
    update public.hunt_session_events
       set data = data || jsonb_build_object('xp_lost', v_el, 'xp', (select coalesce(sum((x.value #>> '{}')::bigint), 0) from jsonb_each(v_el) x))
     where id = v_r.id;
    v_fi := v_fi + 1;
  end loop;

  -- (7) AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING (after the walk home).
  v_end := v_h->>'ended';
  if v_end is not null and coalesce((select r.resumes from public.hr_hunt_end_reasons r where r.reason = v_end), false) then
    select ps.last_activity_kind, ps.last_activity_id into v_lk, v_li from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
    select h.ended_at + make_interval(secs => coalesce((select t.travel_s from public.hr_hunt_travel t where t.hunt_id = h.hunt_id), 0))
      into v_home from public.hunt_sessions h where h.id = p_session;
    v_ok := v_lk is not null and v_home is not null
      and exists (select 1 from public.hr_activities a where a.kind = v_lk and a.activity_id = v_li)
      and not exists (select 1 from public.hr_activities a
                       where a.kind = v_lk and a.activity_id = v_li and a.req_skill is not null and a.req_lv is not null
                         and coalesce((select public.hr_skill_level(a.req_skill, sk.xp) from public.player_skills sk
                                        where sk.user_id = p_user and sk.slot = p_slot and sk.skill_id = a.req_skill), 1) < a.req_lv)
      -- TUTORIAL-FACTS (2027-01-20-tutorial-facts.sql): a bench resumes only with the inputs for one action; else idle.
      and public.hr_resume_has_inputs(p_user, p_slot, v_lk, v_li);
    if v_ok then
      update public.player_state
         set active_kind = v_lk, active_id = v_li, active_since = v_home, accrued_to = v_home,
             fight = '{}'::jsonb, version = version + 1, updated_at = now()
       where user_id = p_user and slot = p_slot;
      insert into public.hr_return_anchor (user_id, slot, real_return_at, updated_at)
        values (p_user, p_slot, v_home, now())
        on conflict (user_id, slot) do update
          set real_return_at = greatest(public.hr_return_anchor.real_return_at, excluded.real_return_at), updated_at = now();
    end if;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'resume',
              jsonb_build_object('reason', v_end, 'resumed', v_ok, 'kind', v_lk, 'id', v_li, 'at', v_home), p_session);
    update public.hunt_session_events e
       set data = e.data || jsonb_build_object('resume', case when v_ok then jsonb_build_object('kind', v_lk, 'id', v_li, 'at', v_home) else null end)
     where e.session_id = p_session and e.id > v_ev0 and e.type = 'ended';
  end if;
  -- THE ANALYZER TALLY (display) and THE HERO'S UNIT (null once it has left).
  if p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' then
    update public.hunt_session_tally t
       set dealt = public.hr_hunt_tally_add(t.dealt, coalesce(p_analyzer->'dealt', '{}'::jsonb)),
           taken = public.hr_hunt_tally_add(t.taken, coalesce(p_analyzer->'taken', '{}'::jsonb)),
           healed = public.hr_hunt_tally_add(t.healed, coalesce(p_analyzer->'healed', '{}'::jsonb)),
           fight = case when p_analyzer ? 'fight' then jsonb_build_object('boss_pm', p_analyzer->'fight'->'boss_pm',
             'fired', public.hr_jsonb_add(coalesce(t.fight->'fired', '{}'::jsonb), coalesce(p_analyzer->'fight'->'fired', '{}'::jsonb))) else t.fight end
     where t.session_id = p_session;
  end if;
  update public.hunt_sessions set unit_id = case when ended_at is null then v_unit_id end where id = p_session;
  -- The debited (blessed) loss of the death travels back with the answer.
  return coalesce(v_h, '{}'::jsonb) || case when v_nd > 0 then jsonb_build_object('death_xp', v_dx) else '{}'::jsonb end
    -- THE BILL hr_hunt_apply_instance pays (and strips before any answer leaves it).
    || case when v_cost > 0 then jsonb_build_object('_purse', jsonb_build_object('cost', v_cost, 'units', v_units,
                                   'items', v_items, 'floor', v_floor)) else '{}'::jsonb end;
end $function$;

-- ── §7 GRANTS: revoke from everyone first, then the two client verbs only ─────
do $grants$
declare v_sig text;
begin
  foreach v_sig in array array['public.hr_scaled_level(text,integer)', 'public.hr_scaled_hours_today(uuid,integer)',
                               'public.hr_scaled_hunt_of(uuid)', 'public.hr_scaled_hunts_view(uuid,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    if exists (select 1 from pg_roles where rolname = 'hr_engine') then execute format('revoke all on function %s from hr_engine', v_sig); end if;
    if exists (select 1 from pg_roles where rolname = 'hr_tick') then execute format('revoke all on function %s from hr_tick', v_sig); end if;
  end loop;
  -- the spliced bodies keep their ACL through `create or replace`; restated anyway (2027-01-22-party-settle-isolation.sql's rule)
  revoke all on function public.hr_hunt_instance_read(uuid, integer) from public, anon, authenticated, service_role;
  revoke all on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, integer) from public, anon, authenticated, service_role;
  revoke all on function public.hr_hunt_apply_member(uuid, uuid, integer, uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    grant execute on function public.hr_hunt_instance_read(uuid, integer) to hr_engine;
    grant execute on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, integer) to hr_engine;
  end if;
  revoke all on function public.hr_scaled_hunt_buy(integer, text, integer, bigint, uuid) from public, anon, service_role;
  revoke all on function public.hr_scaled_hunt_switch(integer, text, boolean, uuid) from public, anon, service_role;
  grant execute on function public.hr_scaled_hunt_buy(integer, text, integer, bigint, uuid) to authenticated;
  grant execute on function public.hr_scaled_hunt_switch(integer, text, boolean, uuid) to authenticated;
end $grants$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_scaled_hunt_buy', 'hr_scaled_hunt_switch');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_scaled_hunt_buy', 'p_slot integer, p_hunt text, p_hours integer, p_price bigint, p_idem uuid', 'authenticated',
   'added 2027-03-21 (lane/c-scaled-hunts): MONEY (a gold sink) - whole banked hours of a scaled early ground, priced by the server (40 x the scaled Level an hour), capped by the bank and the day, refuses quote_changed'),
  ('hr_scaled_hunt_switch', 'p_slot integer, p_hunt text, p_on boolean, p_idem uuid', 'authenticated',
   'added 2027-03-21 (lane/c-scaled-hunts): the "use my scaled hours here" switch, the caller''s own row; moves no value');

-- ── §8 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) the splices: each body carries its marker and its anchors' new text exactly once; the client surface is the two verbs alone
-- (s) THE SWITCH: while `scaled_hunts` is off for the account the section is null and both verbs refuse feature_off, nothing moved;
--     then it is turned on for the probe account alone (rolled back with the rest)
-- (b) the quote: a Level 1 hero scales nothing; at Level 20 the Cellar, the Thicket and Wickstead price 40 x 20 an hour, the Sewer and the Glade not yet
-- (c) refused, nothing moved: a wrong price, hours outside the slider, a ground that never scales, a ground the hero still fits
-- (d) a purchase: the purse pays exactly the server's price, ONE ledger row carries it, the bank holds the hours, the switch is on
-- (e) a replay of the key charges nothing; the bank cap and the day's clamp refuse; a short purse moves nothing; the books can't be forged
-- (f) the switch; the settle's read: hr_scaled_hunt_of and the instance read name the leader's Level and hours, the switch off names none
-- (g) the commit refuses a claim of another Level (scale_moved), more swings than the bank holds (scale_over), and a malformed claim (bad_scale)
do $$
declare
  v_u   constant uuid := '000000c0-0000-4000-a000-00005ca1e001';
  k     constant text := '000000c0-0000-4000-a000-00005ca1';
  v jsonb; v_src text; v_iid uuid; v_sid uuid; v_g0 bigint; v_role text; v_sig text; v_to timestamptz;
begin
  -- (a)
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure;
  if (length(v_src) - length(replace(v_src, 'v_sc := public.hr_scaled_hunt_of(p_instance);', ''))) / length('v_sc := public.hr_scaled_hunt_of(p_instance);') <> 1
     or strpos(v_src, 'k not in (''to'', ''world_swing'', ''world'', ''scale'')') = 0
     or strpos(v_src, 'set banked_ms = h.banked_ms - v_sms, spent_ms = h.spent_ms + v_sms') = 0
     or strpos(v_src, 'update public.hunt_instances set scale_level = v_scale') = 0 then
    raise exception 'scaled-hunts §8(a): hr_hunt_apply_instance does not re-prove, record and spend the scale exactly once'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure;
  if (length(v_src) - length(replace(v_src, 'join public.hr_scaled_kill_bounds b', ''))) / length('join public.hr_scaled_kill_bounds b') <> 2 then
    raise exception 'scaled-hunts §8(a): hr_hunt_apply_member does not read the scaled bounds in its value and Defense bounds'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure;
  if strpos(v_src, '''scale'', public.hr_scaled_hunt_of(v_i.id), ''scale_level'', v_i.scale_level') = 0 then
    raise exception 'scaled-hunts §8(a): the instance read does not carry the scale'; end if;
  foreach v_sig in array array['public.hr_scaled_level(text,integer)', 'public.hr_scaled_hours_today(uuid,integer)', 'public.hr_scaled_hunt_of(uuid)',
                               'public.hr_scaled_hunts_view(uuid,integer)', 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
                               'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', 'public.hr_hunt_instance_read(uuid,integer)'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, v_sig::regprocedure, 'execute') then raise exception 'scaled-hunts §8(a): % reaches %', v_role, v_sig; end if;
    end loop;
  end loop;
  if has_function_privilege('anon', 'public.hr_scaled_hunt_buy(integer,text,integer,bigint,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_scaled_hunt_switch(integer,text,boolean,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_scaled_hunt_buy(integer,text,integer,bigint,uuid)', 'execute') then
    raise exception 'scaled-hunts §8(a): the verbs are not exactly the signed-in client''s'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.player_scaled_hours', 'insert,update,delete,truncate') then
      raise exception 'scaled-hunts §8(a): % may write player_scaled_hours', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_scaled_hours' and cmd <> 'SELECT') then
    raise exception 'scaled-hunts §8(a): player_scaled_hours carries a write policy'; end if;

  begin
    update public.hr_hunt_config set enabled = true where id;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'scaled-hunts §8 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'scaled-hunts §8-harness: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    insert into public.account_wallet as w (user_id, gold) values (v_u, 1000000)
      on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now();
    -- (s) (off for the probe whatever the Coordinator has flipped on live: the block rolls back, so the live row stands)
    update public.hr_feature_switches set scope = 'off', accounts = '{}' where switch_id = 'scaled_hunts';
    update public.player_state set level_xp = public.hr_char_xp_for_level(20) where user_id = v_u and slot = 0;
    if public.hr_feature_on('scaled_hunts', v_u) then raise exception 'scaled-hunts §8(s): the switch is not off for a probe account'; end if;
    if public.hr_scaled_hunts_view(v_u, 0) is not null then raise exception 'scaled-hunts §8(s): the switch off still projects the section'; end if;
    v := public.hr_scaled_hunt_buy(0, 'mill_cellar', 1, 800, (k || '0015')::uuid);
    if v->>'error' is distinct from 'feature_off' then raise exception 'scaled-hunts §8(s): the switch off answered the purchase %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_scaled_hunt_switch(0, 'mill_cellar', false, (k || '0016')::uuid);
    if v->>'error' is distinct from 'feature_off' or exists (select 1 from public.player_scaled_hours where user_id = v_u)
       or public.hr_purse_of(v_u) <> 1000000 then raise exception 'scaled-hunts §8(s): the switch off answered the switch % or moved something', v; end if;
    update public.hr_feature_switches set scope = 'accounts', accounts = array[v_u] where switch_id = 'scaled_hunts';
    update public.player_state set level_xp = 0 where user_id = v_u and slot = 0;
    delete from public.hr_rate_counters where user_id = v_u;
    -- (b)
    v := public.hr_scaled_hunts_view(v_u, 0);
    if v is null or exists (select 1 from jsonb_each(v->'grounds') g where g.value->'level' <> 'null'::jsonb or g.value->'price' <> 'null'::jsonb) then
      raise exception 'scaled-hunts §8(b): a Level 1 hero is offered %', v; end if;
    update public.player_state set level_xp = public.hr_char_xp_for_level(20) where user_id = v_u and slot = 0;
    v := public.hr_state_of(v_u, 0)->'scaled_hunts';
    if (v->'grounds'->'mill_cellar'->>'price')::bigint is distinct from (select price_per_level * 20 from public.hr_scaled_hunt_rule)::bigint
       or (v->'grounds'->'meadowbrook_thicket'->>'level')::int is distinct from 20 or (v->'grounds'->'wickstead'->>'level')::int is distinct from 20
       or v->'grounds'->'millrace_sewer'->'price' <> 'null'::jsonb or v->'grounds'->'mosslight_glade'->'level' <> 'null'::jsonb
       or (v->>'today_hours')::int <> 0 or (v->'grounds'->'mill_cellar'->>'banked_ms')::bigint <> 0 then
      raise exception 'scaled-hunts §8(b): the section of a Level 20 hero reads %', v; end if;
    -- (c)
    v := public.hr_scaled_hunt_buy(0, 'mill_cellar', 6, 801 * 6, (k || '0001')::uuid);
    if v->>'error' is distinct from 'quote_changed' then raise exception 'scaled-hunts §8(c): a wrong price answered %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_scaled_hunt_buy(0, 'mill_cellar', 25, 800 * 25, (k || '0002')::uuid);
    if v->>'error' is distinct from 'bad_hours' then raise exception 'scaled-hunts §8(c): 25 hours answered %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_scaled_hunt_buy(0, 'coppercap_warrens', 1, 800, (k || '0003')::uuid);
    if v->>'error' is distinct from 'not_scalable' then raise exception 'scaled-hunts §8(c): the Warrens answered %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_scaled_hunt_buy(0, 'millrace_sewer', 1, 800, (k || '0004')::uuid);
    if v->>'error' is distinct from 'scale_level' or (v->>'need')::int <> 26 then raise exception 'scaled-hunts §8(c): a ground the hero fits answered %', v; end if;
    if exists (select 1 from public.player_scaled_hours where user_id = v_u) or public.hr_purse_of(v_u) <> 1000000
       or exists (select 1 from public.player_ledger where user_id = v_u and intent like 'scaled\_hunt%') then
      raise exception 'scaled-hunts §8(c): a refused purchase moved something'; end if;
    -- (d)
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_scaled_hunt_buy(0, 'mill_cellar', 6, 800 * 6, (k || '0005')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_purse_of(v_u) <> 1000000 - 4800
       or (select count(*) from public.player_ledger l where l.user_id = v_u and l.kind = 'shop' and l.intent = 'scaled_hunt_buy:mill_cellar:6:4800'
             and l.gold = -4800 and (l.meta->>'hours')::int = 6 and (l.meta->>'level')::int = 20) <> 1
       or (select banked_ms from public.player_scaled_hours where user_id = v_u and slot = 0 and hunt_id = 'mill_cellar') <> 6 * 3600000
       or not (select use_on from public.player_scaled_hours where user_id = v_u and slot = 0 and hunt_id = 'mill_cellar') then
      raise exception 'scaled-hunts §8(d): the purchase answered % (purse %)', v, public.hr_purse_of(v_u); end if;
    -- (e)
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_scaled_hunt_buy(0, 'mill_cellar', 6, 800 * 6, (k || '0005')::uuid);
    if public.hr_purse_of(v_u) <> 1000000 - 4800 or (select banked_ms from public.player_scaled_hours where user_id = v_u and hunt_id = 'mill_cellar') <> 6 * 3600000 then
      raise exception 'scaled-hunts §8(e): a replay charged again: %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_scaled_hunt_buy(0, 'mill_cellar', 19, 800 * 19, (k || '0006')::uuid);
    if v->>'error' is distinct from 'scaled_bank_full' then raise exception 'scaled-hunts §8(e): past the bank answered %', v; end if;
    update public.account_wallet set gold = 10, version = version + 1 where user_id = v_u;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_scaled_hunt_buy(0, 'wickstead', 1, 800, (k || '0010')::uuid);
    if v->>'error' is distinct from 'insufficient_gold' or exists (select 1 from public.player_scaled_hours where user_id = v_u and hunt_id = 'wickstead') then
      raise exception 'scaled-hunts §8(e): a short purse answered %', v; end if;
    update public.account_wallet set gold = 1000000, version = version + 1 where user_id = v_u;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_scaled_hunt_buy(0, 'mill_cellar', 18, 800 * 18, (k || '0007')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'scaled-hunts §8(e): filling the bank answered %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_scaled_hunt_buy(0, 'meadowbrook_thicket', 24, 800 * 24, (k || '0008')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (public.hr_scaled_hunts_view(v_u, 0)->>'today_hours')::int <> 48 then
      raise exception 'scaled-hunts §8(e): a second ground''s bank answered %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_scaled_hunt_buy(0, 'wickstead', 1, 800, (k || '0009')::uuid);
    if v->>'error' is distinct from 'scaled_day_limit' or (v->>'today')::int <> 48 then raise exception 'scaled-hunts §8(e): past the day answered %', v; end if;
    begin
      update public.player_scaled_hours set banked_ms = banked_ms + 3600000 where user_id = v_u and hunt_id = 'mill_cellar';
      raise exception 'scaled-hunts §8(e): an hour nobody bought was stored';
    exception when check_violation then null;
    end;
    -- (f)
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_enter(0, 'mill_cellar', '[]'::jsonb, 0, null, (k || '0011')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'scaled-hunts §8-harness: entering answered %', v; end if;
    select h.instance_id, h.id into v_iid, v_sid from public.hunt_sessions h where h.user_id = v_u and h.slot = 0 and h.ended_at is null;
    v := public.hr_scaled_hunt_of(v_iid);
    if v is null or (v->>'level')::int <> 20 or (v->>'banked_ms')::bigint <> 24 * 3600000 or (v->>'user')::uuid <> v_u then
      raise exception 'scaled-hunts §8(f): the instance''s scale reads %', v; end if;
    if (public.hr_hunt_instance_read(v_u, 0)->'instance'->'scale'->>'level')::int is distinct from 20 then
      raise exception 'scaled-hunts §8(f): the engine''s read carries %', public.hr_hunt_instance_read(v_u, 0)->'instance'->'scale'; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_scaled_hunt_switch(0, 'mill_cellar', false, (k || '0012')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_scaled_hunt_of(v_iid) is not null
       or (v->'scaled_hunts'->'grounds'->'mill_cellar'->>'on')::boolean then
      raise exception 'scaled-hunts §8(f): the switch off answered % and the scale reads %', v, public.hr_scaled_hunt_of(v_iid); end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_scaled_hunt_switch(0, 'mill_cellar', true, (k || '0013')::uuid);
    -- (g) a two-swing window on a bank of one swing, through the commit's own door (no member half runs: the claim is judged first)
    update public.player_scaled_hours set banked_ms = 2000, spent_ms = bought_ms - 2000 where user_id = v_u and hunt_id = 'mill_cellar';
    update public.hunt_instances set settled_to = date_trunc('milliseconds', now()) - interval '10 seconds', next_swing_at = date_trunc('milliseconds', now()) - interval '10 seconds' where id = v_iid;
    update public.hunt_sessions set entered_at = date_trunc('milliseconds', now()) - interval '11 seconds', hunt_from = date_trunc('milliseconds', now()) - interval '10 seconds', settled_to = date_trunc('milliseconds', now()) - interval '10 seconds',
                                   next_swing_at = date_trunc('milliseconds', now()) - interval '10 seconds' where id = v_sid;
    select settled_to + interval '4 seconds' into v_to from public.hunt_instances where id = v_iid;
    foreach v_sig in array array['{"level": 21}', '{"level": 20}', '{"level": "20"}'] loop
      v := public.hr_hunt_apply_instance(v_iid, 0,
             jsonb_build_object('to', v_to, 'world_swing', 2, 'world', null, 'scale', v_sig::jsonb),
             jsonb_build_array(jsonb_build_object('user', v_u, 'slot', 0, 'session', v_sid, 'version', 1, 'intent', (k || '0014')::uuid,
                                                  'delta', '{}'::jsonb, 'hunt', '{}'::jsonb, 'analyzer', null)), null, null);
      if v->>'error' is distinct from (case v_sig when '{"level": 21}' then 'scale_moved' when '{"level": 20}' then 'scale_over' else 'bad_scale' end) then
        raise exception 'scaled-hunts §8(g): the claim % answered %', v_sig, v; end if;
    end loop;
    if (select banked_ms from public.player_scaled_hours where user_id = v_u and hunt_id = 'mill_cellar') <> 2000
       or (select scale_level from public.hunt_instances where id = v_iid) is not null then
      raise exception 'scaled-hunts §8(g): a refused claim moved the bank or the instance'; end if;
    raise exception using errcode = 'HR921', message = 'scaled-hunts §8 complete - rolling back';
  exception when sqlstate 'HR921' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.player_scaled_hours where user_id = v_u) then
    raise exception 'scaled-hunts §8: LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'scaled-hunts: priced by the server, capped by the bank and the day, paid once with one ledger row, switched, read by the engine, and every forged claim refused; all green';
end $$;
