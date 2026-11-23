-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1063-level-costs.sql — PER-HERO COSTS BY LEVEL: THE DEATH IN HOURS, ONE BLESSING AT AN HOUR'S WAGE, AND THE
--   TALENT RESET'S VERB (DARK) (lane/level-costs, backend-architect, 2026-11-22; Tyler 2026-11-22: "per-hero costs read the wage at the
--   hero's LEVEL": bought blocks (built, 1058), Talent resets, the death cost and Blessings; only Bold can die (RD-Q3 a); the redesign's
--   "one price that grows with Level" replaces the Blessing ladder, its numbers the designer's call).
--
-- STATUS: supabase/migration-notes/1063-level-costs.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12), after 1063-level-costs-catalogue.generated.sql (hr_level_costs, the
--   death's bound hr_death_xp_mode_max, hr_blessing_price, hr_talent_reset_price). Applied as ONE transaction by the apply tool; never
--   begin/commit here. Ends with its §4 self-check.
-- EDGE: the death's price moved in the engine (src/core/action-rules.js levelDeathLoss: the lesser of the share and the hours), so the
--   hr-accrue that carries it deploys WITH this release. Either order is safe: an old engine proposes the share, which the new bound
--   refuses past Level 61 (`death_xp_over`, the settle retried next tick by the new engine once deployed); a new engine proposes the
--   lesser, inside the old bound (the share). Apply this file and the catalogue first, then deploy, to keep that window empty.
--
-- ── THE DESIGN (docs/design/redesign/02-architecture.md sections 1b and 6, 04-math-strategy.md sections 5 and 11) ──────────────
--   THE DEATH. A death takes the LESSER of the share (6% of the total Level XP, as before) and the hours (DEATH_HOURS = 7.5 reference
--     hours of progress at the hero's Level: the hours table's Level XP an hour there). Past Level 61 the hours bind, so a death weighs
--     the same 7.5 hours at Level 62 and at Level 4,000 (the share alone was 62 hours at 200 and 887 at 1,000); under it the share binds,
--     so a young hero never falls back to Level 1. It can take a Level, never below Level 1. Skills keep the share of their progress.
--     Engine: src/core/action-rules.js levelDeathLoss. Server bound: hr_death_xp_mode_max (the catalogue file), the hours rounded up.
--   THE BLESSING. ONE Blessing replaces the three tiers. Held, it cuts what one death takes (Level and skills) by bless_cut_pm (50%);
--     it costs bless_hours_pm (1.0) hours of the wage at the hero's Level, free under Level 30, and the death uses it up.
--   THE TALENT RESET. resetHours (0.5) x wage(L) x resetGrowth (2) ^ the resets PAID that server day; a new hero's first reset is free,
--     and with Premium each hero's first of the server day is free and not counted. DARK: the verb exists, priced, keyed and journalled,
--     and NO client role may run it until the Talents lane gives a reset something to move and grants it (§4 (f) asserts the dark).
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
--   player_blessings     COLLAPSED to one row a hero (tier 1): a hero holding any tier holds the Blessing (bought at its earliest tier's
--                        instant, paid summed); CHECK (tier = 1). The tier column stays as the PK's third key (always 1).
--   hr_blessings_view(user, slot) -> jsonb     RESTATED (the `blessings` section): { held: [1] | [], permille (the cut while held, else
--                        0), free_until, cut, price, level, tiers: [{ tier: 1, permille, price, held }] } (`tiers` keeps the client's shape).
--   hr_blessing_buy(p_slot, p_tier, p_price, p_idem) -> jsonb   RESTATED, MONEY, authenticated (unchanged signature and grant):
--                        p_tier must be 1 (`unknown_tier`); keyed BEFORE and UNDER hr_hunt_lock (2027-04-19-key-under-lock.sql); held ->
--                        `already_blessed`; priced by hr_blessing_price(1, Level) (hr_level_of); `quote_changed` carrying the section when
--                        p_price is not it; paid: ONE hr_apply {gold: -price} journalled kind shop, intent blessing_buy:1; free: a 0-gold
--                        shop row and the intent row; the row's bought_at is hr_hunt_lever_at (1005: never a death the seeds showed).
--   hr_blessing_take(user, slot, session, dx, from) -> jsonb    RESTATED, owner-only (the settle's hook): the first death of the window
--                        keeps loss - floor(loss x bless_cut_pm / 1000) per key when a Blessing was held since before the window began;
--                        the Blessing is deleted (used up) and journalled kind hunt, intent blessing_used {tiers [1], permille, saved}.
--   hr_talent_reset_quote(user, slot) -> jsonb  NEW, owner-only: { available, why, level, free ('first' | 'premium' | null), price,
--                        paid_today, per_day, resets }. Paid today: this hero's shop rows of today, intent talent_reset:paid:%.
--                        Premium's free used today: a row of today, intent talent_reset:free, meta.free 'premium'. First: resets = 0.
--   hr_talent_reset(p_slot, p_price, p_idem) -> jsonb           NEW, MONEY, DARK (no client role): keyed before and under the hero's
--                        lock, rate-gated ('hunt'), re-quoted under the lock: `reset_limit` past the day's cap, `quote_changed` (carrying
--                        the quote) when p_price is not the price (0 for a free one); paid: ONE hr_apply {gold: -price} journalled kind
--                        shop, intent talent_reset:paid:<price>; free: a 0-gold shop row, intent talent_reset:free {free}; then the hero's
--                        player_talent_resets row counts it. -> { ok, gold, free, talent_reset: the next quote }
--   player_talent_resets (user, slot, resets, last_at)          NEW, RLS on, no policy, no client privilege: the lifetime count (a
--                        hero's first reset is free once ever; the ledger keeps 90 days, so the lifetime fact lives here).
--   ERRORS: not_signed_in, bad_slot, bad_idem, bad_intent, rate_limited, unknown_tier, no_character, already_blessed, catalogue_missing,
--     quote_changed, reset_limit, insufficient_gold (hr_apply's), intent_mismatch (hr_intent_replay's). The settle's: death_xp_over.
--   DROPPED: hr_blessing_tiers and hr_blessing_rule (every reader restated here or in the catalogue file; §4 (g) proves none is left).
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
--   Both verbs take hr_hunt_lock (the settle's own per-hero lock), so a purchase, a reset and a settle's death are one order per hero.
--   A key is read before the lock (a replay answers at once) and again under it (a press that waited answers the first one's decision);
--   hr_apply's own replay ends a paid call; a free one writes its intent row in the same transaction as its ledger row. A second press
--   with a NEW key re-quotes: a Blessing already held is `already_blessed`, a reset's price has grown (`quote_changed`), never charged a
--   sum the player never saw. The Blessing's bought_at is the seed horizon, so a death the browser already saw is never cut (1005).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
--   Gold sinks only: no path returns gold. No client number prices anything (a price is compared, never used, past the equality). A
--   Blessing never adds XP: it shrinks a debit the settle already bounds, once, for a death after its purchase. The death bound only
--   ever shrinks (the lesser of two rules), so a forged engine proposal can take no more than before at any Level and less past 61.
--   The reset verb is unreachable by any request role (§4 (f)); when the Talents lane opens it, it is a gold sink with the day's clamp,
--   a durable first-free fact and a ledger-read Premium grant. ON THE PRE-EA SECURITY LIST (13-security-list.md S-8).
--
-- ── COST (rows and bytes at 100x players) ────────────────────────────────────
--   The section adds no scan (one primary-key probe of player_blessings and the one-row catalogue). A Blessing: one shop row, one
--   intent row, one player_blessings row; at Bold's measured 1 death a party-day, under one purchase a hero-day: at 100x (8,000
--   heroes) under 8,000 rows a day, ~4 MB before the ledger's retention prune. A reset (once open): at most 16 + 2 rows a hero a day,
--   realistically one a day on a plan that switches builds: ~8,000 rows a day. player_talent_resets: one ~60-byte row a hero.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Drop hr_talent_reset, hr_talent_reset_quote and player_talent_resets (no client reaches them). The Blessing: re-create the two tier
--   tables from 1009's last image, drop the CHECK, restate the three bodies from 2026-10-27-core-bodies.sql + 1005's splice,
--   2026-10-25-blessings.sql and 2027-02-10-settle-plan-cache.generated.sql, and the catalogue file's two from their own history.
--   Collapsed tiers are not split again (no player paid more than a few thousand gold for tiers 2 and 3).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hr_level_costs') is null or to_regprocedure('public.hr_talent_reset_price(integer,integer)') is null
     or to_regprocedure('public.hr_death_hours_xp(integer,integer)') is null then
    raise exception 'PRECONDITION: the per-hero cost catalogue first (1063-level-costs-catalogue.generated.sql)'; end if;
  if to_regclass('public.player_blessings') is null or to_regclass('public.player_ledger') is null or to_regclass('public.player_intents') is null
     or to_regclass('public.hr_client_rpc_baseline') is null or to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: a table this file reads is missing'; end if;
  if to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null or to_regprocedure('public.hr_level_of(uuid,integer)') is null
     or to_regprocedure('public.hr_utc_day_start(timestamp with time zone)') is null or to_regprocedure('public.hr_hunt_lever_at(uuid,integer)') is null
     or to_regprocedure('public.hr_premium_active(uuid,integer,timestamp with time zone)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
  -- Each restated body is the image this file was written against (the replayed chain on set/v0.2.144) or this file's own (a second
  -- apply): md5 of prosrc with carriage returns removed. Another file that moved one must be re-derived here first.
  for v_r in select * from (values
    ('public.hr_blessing_buy(integer,integer,bigint,uuid)', 'd4db88287ce20e6351f1804da90e9ebc', '5cd6fcd20f0a1a0198a0607fb5198036'),
    ('public.hr_blessing_take(uuid,integer,uuid,jsonb,timestamp with time zone)', 'bca3e0802cc5368a607625af6d76b8a3', '93f9f44ec7cf477aa969cc9442be2c28'),
    ('public.hr_blessings_view(uuid,integer)', 'e672ab17056929ed17bfdf445ac93a82', '31a618b8231fceb98dca04bbd51730c9')) t(fn, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither the image this file was written against (%) nor its own (%): md5 % - another file moved it; re-derive', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE BLESSING: ONE A HERO ──────────────────────────────────────────────
-- A hero holding any tier holds the one Blessing: from its earliest tier's instant (it was protected since then), its gold summed.
insert into public.player_blessings as pb (user_id, slot, tier, paid, bought_at)
  select b.user_id, b.slot, 1, sum(b.paid), min(b.bought_at) from public.player_blessings b group by b.user_id, b.slot
  on conflict (user_id, slot, tier) do update set paid = excluded.paid, bought_at = excluded.bought_at
  where pb.paid is distinct from excluded.paid or pb.bought_at is distinct from excluded.bought_at;
delete from public.player_blessings where tier <> 1;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_blessings_one_blessing' and conrelid = 'public.player_blessings'::regclass) then
    alter table public.player_blessings add constraint player_blessings_one_blessing check (tier = 1);
  end if;
end $mig$;
comment on table public.player_blessings is
  '2026-10-25 (lane S2); 1063-level-costs.sql: the ONE Blessing a hero holds (tier is always 1). Written by hr_blessing_buy, deleted (used up) by hr_blessing_take at a death.';

create or replace function public.hr_blessings_view(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare c public.hr_level_costs%rowtype; v_lv int; v_held boolean; v_price bigint;
begin
  -- LEVEL-COSTS (1063-level-costs.sql): THE SECTION `blessings`, the ONE Blessing: held or not, its cut and its price at the hero's
  -- Level (hr_blessing_price: hours of the wage, free under free_until). `tiers` keeps the client's one-row shape.
  if not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  select * into c from public.hr_level_costs where id;
  if not found then return null; end if;
  v_lv := greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1));
  v_held := exists (select 1 from public.player_blessings b where b.user_id = p_user and b.slot = p_slot);
  v_price := public.hr_blessing_price(1, v_lv);
  return jsonb_build_object('held', case when v_held then '[1]'::jsonb else '[]'::jsonb end,
                            'permille', case when v_held then c.bless_cut_pm else 0 end,
                            'free_until', c.bless_free_until, 'cut', c.bless_cut_pm, 'price', v_price, 'level', v_lv,
                            'tiers', jsonb_build_array(jsonb_build_object('tier', 1, 'permille', c.bless_cut_pm, 'price', v_price, 'held', v_held)));
end $fn$;
revoke execute on function public.hr_blessings_view(uuid, integer) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('blessings', 'hr_blessings_view', '1063-level-costs.sql: the one Blessing, held or not, its cut and its price at the hero''s Level')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

create or replace function public.hr_blessing_buy(p_slot integer, p_tier integer, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_lv int; v_price bigint; v_a jsonb;
begin
  -- LEVEL-COSTS (1063-level-costs.sql): the ONE Blessing, priced in hours of the wage at the hero's Level (hr_blessing_price).
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_tier is null or p_price is null or p_price < 0 or p_price > 1000000000000000 then
    return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  v_verb := 'blessing_buy:' || p_tier;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('blessing_buy', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_tier <> 1 then
    return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_tier')); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  -- A SECOND PRESS OF ONE KEY that waited on that lock answers the first one's decision (2027-04-19-key-under-lock.sql).
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('blessing_buy', p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if exists (select 1 from public.player_blessings b where b.user_id = v_uid and b.slot = p_slot) then
    return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'already_blessed')); end if;
  v_lv := greatest(1, coalesce(public.hr_level_of(v_uid, p_slot), 1));
  v_price := public.hr_blessing_price(1, v_lv);
  if v_price is null then return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  if v_price is distinct from p_price then
    return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed',
      'blessings', public.hr_blessings_view(v_uid, p_slot))); end if;
  if v_price > 0 then
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object('gold', -v_price,
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'blessing_buy', 'tier', 1, 'level', v_lv))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      return public.hr_note_rejection('blessing_buy', p_slot, v_a || jsonb_build_object('ok', false)); end if;
    if coalesce(v_a->>'replayed', 'false') = 'true' then return jsonb_build_object('ok', true, 'replayed', true); end if;
  else
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
      values (v_uid, p_slot, 'shop', v_verb, 0, jsonb_build_object('reason', 'blessing_buy', 'tier', 1, 'level', v_lv, 'free', true));
  end if;
  -- LEVER-HORIZON (1005-lever-horizon.sql): with a hunt open the Blessing counts from its seed horizon (hr_hunt_lever_at), so no death
  -- the browser's seeds already showed is cut (hr_blessing_take counts bought_at <= the window's start); in town, from now.
  insert into public.player_blessings (user_id, slot, tier, paid, bought_at) values (v_uid, p_slot, 1, v_price, public.hr_hunt_lever_at(v_uid, p_slot));
  v_r := jsonb_build_object('ok', true, 'gold', -v_price, 'blessings', public.hr_blessings_view(v_uid, p_slot));
  if v_price = 0 then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  end if;
  return v_r;
end $fn$;
revoke execute on function public.hr_blessing_buy(integer, integer, bigint, uuid) from public;
revoke execute on function public.hr_blessing_buy(integer, integer, bigint, uuid) from anon, service_role;
grant  execute on function public.hr_blessing_buy(integer, integer, bigint, uuid) to authenticated;
update public.hr_client_rpc_baseline
   set note = 'added 2026-10-25 (lane S2); 1063-level-costs.sql: MONEY (a gold sink) - buy the ONE Blessing (tier 1) at the server''s price, hours of the wage at the hero''s Level (free under its Level); refuses quote_changed; used up by a death'
 where proname = 'hr_blessing_buy' and grantee = 'authenticated';

create or replace function public.hr_blessing_take(p_user uuid, p_slot integer, p_session uuid, p_dx jsonb, p_from timestamp with time zone)
returns jsonb language plpgsql set search_path = public, pg_catalog as $fn$
declare
  v_pm int; v_tiers int[]; v_first jsonb := '{}'::jsonb; v_saved jsonb := '{}'::jsonb; v_k text; v_v jsonb; v_n bigint; v_keep bigint;
  v_dx jsonb; v_lost jsonb := '{}'::jsonb; v_el jsonb;
begin
  -- LEVEL-COSTS (1063-level-costs.sql): the ONE Blessing, held since before the window began, cuts the window's first death by
  -- hr_level_costs.bless_cut_pm (Level XP and every combat skill alike) and is used up; later deaths in the window are whole.
  if p_dx is null or jsonb_typeof(p_dx) <> 'array' or jsonb_array_length(p_dx) = 0 then return null; end if;
  select array_agg(b.tier order by b.tier) into v_tiers
    from public.player_blessings b
   where b.user_id = p_user and b.slot = p_slot and b.bought_at <= p_from;
  if v_tiers is null then return null; end if;
  select c.bless_cut_pm into v_pm from public.hr_level_costs c where c.id;
  if v_pm is null then return null; end if;
  for v_k, v_v in select key, value from jsonb_each(p_dx->0) loop
    v_n := (v_v #>> '{}')::bigint;
    v_keep := v_n - floor(v_n * v_pm / 1000.0)::bigint;
    v_first := v_first || jsonb_build_object(v_k, v_keep);
    if v_n - v_keep > 0 then v_saved := v_saved || jsonb_build_object(v_k, v_n - v_keep); end if;
  end loop;
  v_dx := jsonb_set(p_dx, '{0}', v_first);
  for v_el in select value from jsonb_array_elements(v_dx) loop
    for v_k, v_v in select key, value from jsonb_each(v_el) loop
      if (v_v #>> '{}')::bigint > 0 then
        v_lost := v_lost || jsonb_build_object(v_k, coalesce((v_lost->>v_k)::bigint, 0) + (v_v #>> '{}')::bigint);
      end if;
    end loop;
  end loop;
  delete from public.player_blessings where user_id = p_user and slot = p_slot and tier = any (v_tiers);
  insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
    values (p_user, p_slot, 'hunt', 'blessing_used',
            jsonb_build_object('reason', 'blessing_used', 'tiers', to_jsonb(v_tiers), 'permille', v_pm, 'saved', v_saved), p_session);
  return jsonb_build_object('dx', v_dx, 'lost', v_lost);
end $fn$;
revoke execute on function public.hr_blessing_take(uuid, integer, uuid, jsonb, timestamp with time zone) from public, anon, authenticated, service_role;

-- The tier tables leave: no body reads them now (§4 (g)).
drop table if exists public.hr_blessing_tiers;
drop table if exists public.hr_blessing_rule;

-- ── §2 THE TALENT RESET (DARK) ───────────────────────────────────────────────
create table if not exists public.player_talent_resets (
  user_id uuid   not null,
  slot    int    not null,
  resets  bigint not null default 0 check (resets >= 0),
  last_at timestamptz,
  primary key (user_id, slot),
  constraint player_talent_resets_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
alter table public.player_talent_resets enable row level security;
revoke all on public.player_talent_resets from public, anon, authenticated, service_role;
comment on table public.player_talent_resets is
  '1063-level-costs.sql: a hero''s lifetime count of Talent resets (its first is free once ever). Written only by hr_talent_reset.';

create or replace function public.hr_talent_reset_quote(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare c public.hr_level_costs%rowtype; v_lv int; v_ever bigint; v_paid int; v_prem_used boolean; v_free text; v_price bigint; v_why text;
begin
  -- LEVEL-COSTS (1063-level-costs.sql): the next Talent reset as the server prices it (src/core/wage.js resetPrice). Free: a hero's
  -- first ever, then with Premium its first of the server day (not counted); else reset_hours x wage(L) x growth ^ (paid today).
  if not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  select * into c from public.hr_level_costs where id;
  if not found then return null; end if;
  v_lv := greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1));
  v_ever := coalesce((select r.resets from public.player_talent_resets r where r.user_id = p_user and r.slot = p_slot), 0);
  v_paid := (select count(*) from public.player_ledger l
              where l.user_id = p_user and l.slot = p_slot and l.kind = 'shop' and l.intent like 'talent\_reset:paid:%'
                and l.at >= public.hr_utc_day_start(now()))::int;
  v_prem_used := exists (select 1 from public.player_ledger l
                          where l.user_id = p_user and l.slot = p_slot and l.kind = 'shop' and l.intent = 'talent_reset:free'
                            and l.meta->>'free' = 'premium' and l.at >= public.hr_utc_day_start(now()));
  v_free := case when v_ever = 0 then 'first'
                 when public.hr_premium_active(p_user, p_slot, now()) and not v_prem_used then 'premium' end;
  if v_free is not null then v_price := 0;
  else
    v_price := public.hr_talent_reset_price(v_lv, v_paid);
    if v_price is null then v_why := 'reset_limit'; end if;
  end if;
  return jsonb_build_object('available', v_why is null, 'why', v_why, 'level', v_lv, 'free', v_free, 'price', v_price,
                            'paid_today', v_paid, 'per_day', c.reset_per_day, 'resets', v_ever);
end $fn$;

create or replace function public.hr_talent_reset(p_slot integer, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_q jsonb; v_ver bigint; v_a jsonb; v_price bigint; v_free text;
begin
  -- LEVEL-COSTS (1063-level-costs.sql): DARK until Talents exist (no client role may run it). A reset is priced by the server's quote
  -- under the hero's lock and charged once; what it moves (the Talent points) joins in the Talents lane's change that opens it.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('talent_reset', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('talent_reset', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 0 or p_price > 1000000000000000 then
    return public.hr_note_rejection('talent_reset', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  v_verb := case when p_price = 0 then 'talent_reset:free' else 'talent_reset:paid:' || p_price end;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('talent_reset', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('talent_reset', p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('talent_reset', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_q := public.hr_talent_reset_quote(v_uid, p_slot);
  if v_q is null then return public.hr_note_rejection('talent_reset', p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  if not (v_q->>'available')::boolean then
    return public.hr_note_rejection('talent_reset', p_slot, jsonb_build_object('ok', false, 'error', v_q->>'why', 'talent_reset', v_q)); end if;
  v_price := (v_q->>'price')::bigint;
  v_free := v_q->>'free';
  if v_price <> p_price then
    return public.hr_note_rejection('talent_reset', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'talent_reset', v_q)); end if;
  if v_price > 0 then
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object('gold', -v_price,
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'talent_reset', 'n', (v_q->>'paid_today')::int + 1,
                                                                      'level', (v_q->>'level')::int))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      return public.hr_note_rejection('talent_reset', p_slot, v_a || jsonb_build_object('ok', false)); end if;
    if coalesce(v_a->>'replayed', 'false') = 'true' then return jsonb_build_object('ok', true, 'replayed', true); end if;
  else
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
      values (v_uid, p_slot, 'shop', v_verb, 0, jsonb_build_object('reason', 'talent_reset', 'free', v_free, 'level', (v_q->>'level')::int));
  end if;
  insert into public.player_talent_resets as r (user_id, slot, resets, last_at) values (v_uid, p_slot, 1, now())
    on conflict (user_id, slot) do update set resets = r.resets + 1, last_at = excluded.last_at;
  v_r := jsonb_build_object('ok', true, 'gold', -v_price, 'free', v_free, 'talent_reset', public.hr_talent_reset_quote(v_uid, p_slot));
  if v_price = 0 then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  end if;
  return v_r;
end $fn$;
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_talent_reset(integer,bigint,uuid)', 'public.hr_talent_reset_quote(uuid,integer)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $mig$;
delete from public.hr_client_rpc_baseline where proname in ('hr_talent_reset', 'hr_talent_reset_quote');

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) THE BLESSING, FREE: a new hero's section is the one Blessing at 0 gold; a second tier is unknown_tier; a wrong price is
--     quote_changed; the free buy holds it (one 0-gold shop row); a second is already_blessed.
-- (b) THE BLESSING, PAID: at Level 40 the price is bless_hours_pm of an hour of hr_wage(40) and the twin's; a short purse moves
--     nothing; the right price is charged exactly once (one shop row blessing_buy:1), and a replay of the key charges nothing.
-- (c) THE DEATH USES IT UP: a Blessing held since before the window cuts the first death's keys by the cut, leaves later deaths whole,
--     is deleted, and journals blessing_used {tiers [1], permille, saved}; one bought inside the window does not cover it.
-- (d) THE DEATH'S PRICE: at Level 20 the bound is the share; at Level 200 the hours (the lesser), the same as hr_death_hours_xp; in a
--     mode that prices nothing, 0.
-- (e) THE RESET: a new hero's first is free (a 0-gold row, its count 1); the next is the twin's price at the hero's Level for 0 paid;
--     a wrong price is quote_changed; a short purse moves nothing; paid once (one row talent_reset:paid:<price>), a replay charges
--     nothing; the next costs the twin's at 1 paid; with Premium the day's first is free and not counted (the next still at 1 paid).
-- (f) DARK AND CLEAN: no client role runs the reset or its quote, neither is in the client baseline; anon cannot buy a Blessing and a
--     signed-in client can; the Blessing's section is the view; grant hygiene is quiet.
-- (g) THE TIERS ARE GONE: both tier tables dropped, no function names them, every player_blessings row is tier 1.
do $$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000001c0063';
  v jsonb; q jsonb; v_role text; v_p bigint; v_p1 bigint; v_g bigint; v_cut int; v_lv int; v_x bigint;
begin
  select bless_cut_pm into v_cut from public.hr_level_costs where id;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'level-costs §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    update public.hr_flags set enabled = false where key = 'beta_premium';
    update public.player_state set premium_until = null where user_id = v_u and slot = 0;
    insert into public.account_wallet as w (user_id, gold) values (v_u, 0)
      on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now();
    -- (a) free under the Level
    q := public.hr_state_of(v_u, 0)->'blessings';
    if q is distinct from public.hr_blessings_view(v_u, 0) or q->'held' <> '[]'::jsonb or (q->>'price')::bigint <> 0 or (q->>'cut')::int <> v_cut
       or jsonb_array_length(q->'tiers') <> 1 or (q->'tiers'->0->>'tier')::int <> 1 then
      raise exception 'VERIFY(a): a new hero''s Blessing section is %', q; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_blessing_buy(0, 2, 0, '000000c0-0000-4000-a000-0000001c0101');
    if v->>'error' is distinct from 'unknown_tier' then raise exception 'VERIFY(a): a second tier answered %', v; end if;
    v := public.hr_blessing_buy(0, 1, 5, '000000c0-0000-4000-a000-0000001c0102');
    if v->>'error' is distinct from 'quote_changed' then raise exception 'VERIFY(a): a priced free Blessing answered %', v; end if;
    v := public.hr_blessing_buy(0, 1, 0, '000000c0-0000-4000-a000-0000001c0103');
    if coalesce(v->>'ok', '') <> 'true' or (v->'blessings'->>'permille')::int <> v_cut
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'blessing_buy:1' and gold = 0) <> 1 then
      raise exception 'VERIFY(a): the free Blessing answered %', v; end if;
    v := public.hr_blessing_buy(0, 1, 0, '000000c0-0000-4000-a000-0000001c0104');
    if v->>'error' is distinct from 'already_blessed' then raise exception 'VERIFY(a): a second Blessing answered %', v; end if;
    -- (b) paid at Level 40
    delete from public.player_blessings where user_id = v_u;
    update public.player_state set level_xp = public.hr_char_xp_for_level(40) where user_id = v_u and slot = 0;
    v_lv := public.hr_level_of(v_u, 0);
    v_p := public.hr_blessing_price(1, v_lv);
    if v_lv <> 40 or v_p is distinct from div((select bless_hours_pm from public.hr_level_costs where id)::numeric * public.hr_wage(40) + 999, 1000)::bigint
       or (public.hr_blessings_view(v_u, 0)->>'price')::bigint <> v_p or v_p <= 0 then
      raise exception 'VERIFY(b): a Level % Blessing costs % (view %)', v_lv, v_p, public.hr_blessings_view(v_u, 0); end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_blessing_buy(0, 1, v_p, '000000c0-0000-4000-a000-0000001c0105');
    if v->>'error' is distinct from 'insufficient_gold' or exists (select 1 from public.player_blessings where user_id = v_u) then
      raise exception 'VERIFY(b): a short purse answered %', v; end if;
    update public.account_wallet set gold = v_p + 7 where user_id = v_u;
    v := public.hr_blessing_buy(0, 1, v_p, '000000c0-0000-4000-a000-0000001c0106');
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.account_wallet where user_id = v_u) <> 7
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'blessing_buy:1' and gold = -v_p) <> 1 then
      raise exception 'VERIFY(b): the paid Blessing answered %', v; end if;
    v := public.hr_blessing_buy(0, 1, v_p, '000000c0-0000-4000-a000-0000001c0106');
    if (select gold from public.account_wallet where user_id = v_u) <> 7
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'blessing_buy:1' and gold = -v_p) <> 1 then
      raise exception 'VERIFY(b): a replay of the key charged again: %', v; end if;
    -- (c) the death uses it up
    update public.player_blessings set bought_at = now() - interval '1 hour' where user_id = v_u;
    v := public.hr_blessing_take(v_u, 0, null, '[{"level": 1000, "melee": 41}, {"level": 1000}]'::jsonb, now() - interval '1 minute');
    if (v->'dx'->0->>'level')::bigint <> 1000 - floor(1000 * v_cut / 1000.0) or (v->'dx'->0->>'melee')::bigint <> 41 - floor(41 * v_cut / 1000.0)
       or (v->'dx'->1->>'level')::bigint <> 1000 or (v->'lost'->>'level')::bigint <> (v->'dx'->0->>'level')::bigint + 1000
       or exists (select 1 from public.player_blessings where user_id = v_u)
       or (select meta->'tiers' from public.player_ledger where user_id = v_u and intent = 'blessing_used') <> '[1]'::jsonb
       or (select (meta->'saved'->>'level')::bigint from public.player_ledger where user_id = v_u and intent = 'blessing_used') <> floor(1000 * v_cut / 1000.0) then
      raise exception 'VERIFY(c): a blessed death answered %', v; end if;
    insert into public.player_blessings (user_id, slot, tier, paid, bought_at) values (v_u, 0, 1, 0, now());
    v := public.hr_blessing_take(v_u, 0, null, '[{"level": 100}]'::jsonb, now() - interval '1 minute');
    if v is not null or not exists (select 1 from public.player_blessings where user_id = v_u) then
      raise exception 'VERIFY(c): a Blessing bought inside the window covered it: %', v; end if;
    -- (d) the death's price
    v_x := public.hr_char_xp_for_level(20) + 5;
    if public.hr_death_xp_mode_max('level', v_x, 1000) <> floor(v_x * public.hr_hunt_limit('death_xp_permille') / 1000.0) then
      raise exception 'VERIFY(d): a Level 20 death is bounded at %, not the share', public.hr_death_xp_mode_max('level', v_x, 1000); end if;
    v_x := public.hr_char_xp_for_level(200) + 5;
    if public.hr_death_xp_mode_max('level', v_x, 1000) <> public.hr_death_hours_xp(200, 1000)
       or public.hr_death_hours_xp(200, 1000) >= floor(v_x * public.hr_hunt_limit('death_xp_permille') / 1000.0)
       or public.hr_death_xp_mode_max('level', v_x, 0) <> 0 then
      raise exception 'VERIFY(d): a Level 200 death is bounded at % (hours %)', public.hr_death_xp_mode_max('level', v_x, 1000), public.hr_death_hours_xp(200, 1000); end if;
    -- (e) the reset
    update public.player_state set level_xp = public.hr_char_xp_for_level(40) where user_id = v_u and slot = 0;
    update public.account_wallet set gold = 0 where user_id = v_u;
    q := public.hr_talent_reset_quote(v_u, 0);
    if q->>'free' is distinct from 'first' or (q->>'price')::bigint <> 0 or not (q->>'available')::boolean then
      raise exception 'VERIFY(e): a new hero''s first reset quotes %', q; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_talent_reset(0, 1, '000000c0-0000-4000-a000-0000001c0201');
    if v->>'error' is distinct from 'quote_changed' then raise exception 'VERIFY(e): a priced first reset answered %', v; end if;
    v := public.hr_talent_reset(0, 0, '000000c0-0000-4000-a000-0000001c0202');
    if coalesce(v->>'ok', '') <> 'true' or v->>'free' is distinct from 'first'
       or (select resets from public.player_talent_resets where user_id = v_u and slot = 0) <> 1
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'talent_reset:free' and gold = 0) <> 1 then
      raise exception 'VERIFY(e): the first reset answered %', v; end if;
    v := public.hr_talent_reset(0, 0, '000000c0-0000-4000-a000-0000001c0202');
    if (select resets from public.player_talent_resets where user_id = v_u and slot = 0) <> 1 then raise exception 'VERIFY(e): a replayed free reset counted again: %', v; end if;
    v_p := public.hr_talent_reset_price(40, 0);
    q := public.hr_talent_reset_quote(v_u, 0);
    if q->>'free' is not null or (q->>'price')::bigint <> v_p or (q->>'paid_today')::int <> 0
       or v_p <> div((select reset_hours_pm from public.hr_level_costs where id)::numeric * public.hr_wage(40) + 999, 1000)::bigint then
      raise exception 'VERIFY(e): the first paid reset quotes % (want %)', q, v_p; end if;
    v := public.hr_talent_reset(0, v_p, '000000c0-0000-4000-a000-0000001c0203');
    if v->>'error' is distinct from 'insufficient_gold' or (select resets from public.player_talent_resets where user_id = v_u and slot = 0) <> 1 then
      raise exception 'VERIFY(e): a short purse answered %', v; end if;
    update public.account_wallet set gold = v_p where user_id = v_u;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_talent_reset(0, v_p, '000000c0-0000-4000-a000-0000001c0204');
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.account_wallet where user_id = v_u) <> 0
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'talent_reset:paid:' || v_p and gold = -v_p) <> 1
       or (select resets from public.player_talent_resets where user_id = v_u and slot = 0) <> 2 then
      raise exception 'VERIFY(e): the paid reset answered %', v; end if;
    v := public.hr_talent_reset(0, v_p, '000000c0-0000-4000-a000-0000001c0204');
    if (select count(*) from public.player_ledger where user_id = v_u and intent like 'talent\_reset:paid:%') <> 1
       or (select resets from public.player_talent_resets where user_id = v_u and slot = 0) <> 2 then
      raise exception 'VERIFY(e): a replayed paid reset charged again: %', v; end if;
    v_p1 := public.hr_talent_reset_price(40, 1);
    q := public.hr_talent_reset_quote(v_u, 0);
    if (q->>'price')::bigint <> v_p1 or (q->>'paid_today')::int <> 1 or v_p1 <= v_p then
      raise exception 'VERIFY(e): the second paid reset quotes % (want %)', q, v_p1; end if;
    update public.hr_flags set enabled = true where key = 'beta_premium';
    q := public.hr_talent_reset_quote(v_u, 0);
    if q->>'free' is distinct from 'premium' or (q->>'price')::bigint <> 0 then raise exception 'VERIFY(e): a Premium hero''s day quotes %', q; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_talent_reset(0, 0, '000000c0-0000-4000-a000-0000001c0205');
    q := public.hr_talent_reset_quote(v_u, 0);
    if coalesce(v->>'ok', '') <> 'true' or v->>'free' is distinct from 'premium' or q->>'free' is not null
       or (q->>'price')::bigint <> v_p1 or (q->>'paid_today')::int <> 1 then
      raise exception 'VERIFY(e): Premium''s free reset answered % and left %', v, q; end if;
    update public.hr_flags set enabled = false where key = 'beta_premium';
    raise exception using errcode = 'HR863', message = 'level-costs §4 complete - rolling back';
  exception when sqlstate 'HR863' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) then raise exception 'VERIFY(f): §4 LEAKED a probe row'; end if;
  -- (f) dark and clean
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_talent_reset(integer,bigint,uuid)', 'execute')
       or has_function_privilege(v_role, 'public.hr_talent_reset_quote(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_blessing_take(uuid,integer,uuid,jsonb,timestamp with time zone)', 'execute')
       or has_function_privilege(v_role, 'public.hr_blessings_view(uuid,integer)', 'execute')
       or has_table_privilege(v_role, 'public.player_talent_resets', 'select,insert,update,delete') then
      raise exception 'VERIFY(f): % reaches the dark reset, its quote, the take or the view', v_role; end if;
  end loop;
  if exists (select 1 from public.hr_client_rpc_baseline where proname in ('hr_talent_reset', 'hr_talent_reset_quote')) then
    raise exception 'VERIFY(f): the dark reset is in the client baseline'; end if;
  if has_function_privilege('anon', 'public.hr_blessing_buy(integer,integer,bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_blessing_buy(integer,integer,bigint,uuid)', 'execute')
     or not exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_blessing_buy' and grantee = 'authenticated') then
    raise exception 'VERIFY(f): hr_blessing_buy is not exactly the signed-in client''s'; end if;
  if (select fn from public.hr_state_sections where key = 'blessings') is distinct from 'hr_blessings_view' then
    raise exception 'VERIFY(f): the blessings section is not the view'; end if;
  perform public.hr_assert_grant_hygiene(true);
  -- (g) the tiers are gone
  if to_regclass('public.hr_blessing_tiers') is not null or to_regclass('public.hr_blessing_rule') is not null then
    raise exception 'VERIFY(g): a Blessing tier table still stands'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and (p.prosrc like '%hr\_blessing\_tiers%' or p.prosrc like '%hr\_blessing\_rule%')) then
    raise exception 'VERIFY(g): a function still reads a Blessing tier table'; end if;
  if exists (select 1 from public.player_blessings where tier <> 1) then raise exception 'VERIFY(g): a hero holds a second Blessing'; end if;
  raise notice 'level-costs: the death the lesser of the share and % h, one Blessing (% permille) at the wage, the reset priced and dark; all green',
    (select death_hours_pm / 1000.0 from public.hr_level_costs where id), v_cut;
end $$;
