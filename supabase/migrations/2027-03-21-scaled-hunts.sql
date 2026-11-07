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
  -- each spliced body is EXACTLY its live image (tests/live-hash-drift.baseline.json, measured 2026-11-07) or carries this file's splices
  for v_r in select * from (values
    ('public.hr_hunt_instance_read(uuid,integer)', 'c2294c624d856c0e5f6a00e270473b21'),
    ('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', 'a661a6690f46dc7f1a2fdb666dea7ae1'),
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', '48f088fc64c779dd58c8b2a9f939b2b0')) t(fn, pre) loop
    v_def := pg_get_functiondef(v_r.fn::regprocedure);
    if md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')) is distinct from v_r.pre
       and strpos(v_def, 'SCALED-HUNTS (2027-03-21-scaled-hunts.sql)') = 0 then
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

-- ── §6 THE SETTLE: THREE BODIES, ANCHORED SPLICES (each fails closed if its anchor moved; a second apply finds its marker and skips) ──
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

-- (b) hr_hunt_apply_instance: the claim allowed, re-proved before any member lands, the hours spent after every member landed.
do $mig$
declare
  a1 constant text := $a$  if exists (select 1 from jsonb_object_keys(p_settle) k where k not in ('to', 'world_swing', 'world'))
$a$;
  r1 constant text := $a$  -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): `scale` { level } is the Level the edge says the window played, a CLAIM (4) re-proves.
  if exists (select 1 from jsonb_object_keys(p_settle) k where k not in ('to', 'world_swing', 'world', 'scale'))
$a$;
  a2 constant text := $a$  v_cur   jsonb;   -- PARTY-ISOLATION (2027-01-22-party-settle-isolation.sql): the member whose own half is being proved
$a$;
  r2 constant text := $a$  v_cur   jsonb;   -- PARTY-ISOLATION (2027-01-22-party-settle-isolation.sql): the member whose own half is being proved
  v_scale int;            -- SCALED-HUNTS: the Level this window played (null: the ground's own), proved before any member lands
  v_sc    jsonb;          -- SCALED-HUNTS: the server's own scale of the instance (hr_scaled_hunt_of)
  v_sms   bigint := 0;    -- SCALED-HUNTS: the hours this window spends, in ms: its world swings x the swing
$a$;
  a3 constant text := $a$  begin
    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      v_cur := jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot', 'session', v_m->'session');
      v_h := public.hr_hunt_apply_member($a$;
  r3 constant text := $a$  begin
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
      v_h := public.hr_hunt_apply_member($a$;
  a4 constant text := $a$    -- PARTY-ISOLATION (2027-01-22-party-settle-isolation.sql): every member's half landed, so each committed seat's
$a$;
  r4 constant text := $a$    -- SCALED-HUNTS: THE HOURS SPENT, from the leader's bank, under every member's lock and purse taken above (a purchase takes its
    --   hero's lock, then the purse, then this row: the same order). They tick down only while the party is in the spawn: the window's
    --   world swings, never town or travel. Refused, never clamped, if the bank no longer holds them.
    if v_scale is not null and v_sms > 0 then
      update public.player_scaled_hours h
         set banked_ms = h.banked_ms - v_sms, spent_ms = h.spent_ms + v_sms, updated_at = now()
       where h.user_id = (v_sc->>'user')::uuid and h.slot = (v_sc->>'slot')::int and h.hunt_id = v_i.hunt_id and h.banked_ms >= v_sms;
      if not found then perform public.hr_reject('scale_over', jsonb_build_object('ms', v_sms)); end if;
    end if;
    -- PARTY-ISOLATION (2027-01-22-party-settle-isolation.sql): every member's half landed, so each committed seat's
$a$;
  v_a text[] := array[a1, a2, a3, a4];
  v_b text[] := array[r1, r2, r3, r4];
  v_def text; v_n int; i int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure), chr(13), '');
  if position('SCALED-HUNTS (2027-03-21-scaled-hunts.sql)' in v_def) > 0 then
    raise notice 'scaled-hunts §6(b): hr_hunt_apply_instance already carries the scale - skipped'; return; end if;
  for i in 1 .. array_length(v_a, 1) loop
    v_n := (length(v_def) - length(replace(v_def, v_a[i], ''))) / length(v_a[i]);
    if v_n <> 1 then raise exception 'scaled-hunts §6(b): hr_hunt_apply_instance anchor % matched % times (need 1): the body moved', i, v_n; end if;
    v_def := replace(v_def, v_a[i], v_b[i]);
  end loop;
  execute v_def;
end $mig$;

-- (c) hr_hunt_apply_member: a window proved scaled is bounded by its scaled roster's own most a kill pays, and its Defense by their Level.
do $mig$
declare
  a1 constant text := $a$   where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id);
  -- THE MAGIC BOUND$a$;
  r1 constant text := $a$   where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id);
  -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): a window the commit proved scaled (hunt_instances.scale_level, written by
  -- hr_hunt_apply_instance before any member lands) is bounded by its scaled roster's most a kill pays as well (hr_scaled_kill_bounds).
  select greatest(v_vb_gold, coalesce(max(b.gold_max), 0)), greatest(v_vb_xp, coalesce(max(b.xp_max), 0)) into v_vb_gold, v_vb_xp
    from public.hunt_instances i join public.hr_scaled_kill_bounds b on b.hunt_id = i.hunt_id and b.level = i.scale_level
   where i.id = p_instance;
  -- THE MAGIC BOUND$a$;
  a2 constant text := $a$                * coalesce((select max(public.hr_monster_level(sp.monster_id)) from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id), 0)
$a$;
  r2 constant text := $a$                * greatest(coalesce((select max(public.hr_monster_level(sp.monster_id)) from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id), 0),
                           coalesce((select b.level_max from public.hunt_instances i join public.hr_scaled_kill_bounds b
                                       on b.hunt_id = i.hunt_id and b.level = i.scale_level where i.id = p_instance), 0))
$a$;
  v_a text[] := array[a1, a2];
  v_b text[] := array[r1, r2];
  v_def text; v_n int; i int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), chr(13), '');
  if position('SCALED-HUNTS (2027-03-21-scaled-hunts.sql)' in v_def) > 0 then
    raise notice 'scaled-hunts §6(c): hr_hunt_apply_member already reads the scaled bounds - skipped'; return; end if;
  for i in 1 .. array_length(v_a, 1) loop
    v_n := (length(v_def) - length(replace(v_def, v_a[i], ''))) / length(v_a[i]);
    if v_n <> 1 then raise exception 'scaled-hunts §6(c): hr_hunt_apply_member anchor % matched % times (need 1): the body moved', i, v_n; end if;
    v_def := replace(v_def, v_a[i], v_b[i]);
  end loop;
  execute v_def;
end $mig$;

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
