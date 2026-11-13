-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-16-combat-training.sql — COMBAT TRAINING: THE YARD BY THE HOUR, THE HOUSE DUMMY BOUGHT ONCE, ON THE ONE ENGINE
--   (lane/c-combat-training, backend-architect, 2026-11-12; Tyler 2026-11-08: "a public yard paid by the hour", "Wildly expensive gold
--   sink is going to be a personal training dummy for houses. It'll probably have multiple unlocks for each combat skill"; Tyler
--   2026-10-14: skill XP only, costs gold; the designer's spec, PRIORITY_BOARD "2026-11-13 Combat training spec"; src/data/training.js).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §6. MONEY SURFACE (an hourly gold sink and a one-time one): ON THE EA SECURITY LIST (§3.7).
-- ORDER: LAST of four. 2027-04-16-combat-training-hunts-catalogue.generated.sql (the eight training hunts in hr_hunts), then
--   2027-04-16-combat-training-hunt-sessions-catalogue.generated.sql (their grounds, the dummy's kill bound, hr_training_rules,
--   hr_training_grounds), then 2027-04-16-combat-training-gold-sinks-catalogue.generated.sql (hr_sink_rules house_dummy), then this file.
--   §0 refuses without them. EDGE: the hr-accrue carrying src/core/hunt/training.js (and its one call each in combat-sim.js,
--   hunt-rewards.js, damage.js, and hunt-settle.js's window cut) deploys RIGHT AFTER this file: an old engine knows no training ground
--   (no_ground). No player can open one before the client half calls hr_training_start, which ships after both.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- A TRAINING SESSION IS A HUNT SESSION (CLAUDE.md §6: one engine) on a training ground, hr_training_grounds (place yard | house, skill
--   melee | ranged | magic | defense), opened by ONE door and settled by the ONE instance settle, viewed or not.
-- hr_training_start(p_slot, p_skill, p_where, p_fee_seen, p_idem) -> jsonb. Client verb (authenticated). Refusals, each charging nothing
--   and opening nothing: not_signed_in, bad_slot, bad_idem, bad_quote, bad_skill (no such skill or place), rate_limited, in_party (a hero
--   in a party: training is solo), no_home (the house dummy wants the account's home at hr_training_rules.house_tier), not_owned (the
--   skill is not unlocked on the account's dummy), dummy_busy (another hero of the account is on it; `busy` names it), quote_changed (the
--   price the player saw is not the server's; `fee` is the server's), every refusal of the start a hunt runs (hr_hunt_enter_for:
--   hunt_open, activity_running, the play cap, ...), and hr_apply's insufficient_gold (with `fee` and `purse`). THE PRICE is re-quoted
--   on the server clock: the yard, hr_training_fee(the trained skill's level now); the house, 0.
--   The yard opens the session with hours_limit 1 (the hour it just paid); the house with hr_training_rules.max_hours. The first hour's
--   fee is ONE hr_apply on the caller's key, journalled kind `shop`, intent training_start:<hunt>:<price>, meta.reason training_fee: a
--   replay answers once and charges once. Training opens on an EMPTY stamina pool (it spends none).
-- hr_house_dummy_unlock(p_slot, p_skill, p_price, p_idem) -> jsonb. Client verb (authenticated). The account's ladder (hr_sink_rules
--   house_dummy, the n-th unlock costs prices[n], 150k/250k/400k/600k), skills in the order the player picks them, one rung a skill, once.
--   Refusals: the shape ones, bad_skill, rate_limited, no_character, no_home, already_owned, dummy_max, quote_changed (`price` the server's),
--   insufficient_gold (with `price` and `purse`). ONE hr_apply on the caller's key (kind shop, intent house_dummy:<skill>:<price>,
--   meta.reason house_dummy), then ONE account_house_dummy row.
-- THE `training` SECTION of every envelope (hr_state_sections: hr_training_section, owner-only; its reader is src/session/training-sections.js):
--   { skills: [the yard's skills, in the data's order], max_hours, quotes: [{ skill, level, fee_h, xp_h, hours_to_next }] (the yard's fee at
--   the hero's level; xp_h and hours_to_next are the hero's OWN pace on its last session of that skill, null until one ran 10 minutes),
--   run: { skill, where, since, fee_h, paid } | null (the open training session: `paid` the gold its fee rows took), last_stop: { reason,
--   skill, at } | null (its last ended one), dummy: { needs (the property tier id), has_home, owned: [skill, in the order bought], ladder:
--   [gold], next_price, busy (the name of the hero on it, or null) } }. Every envelope replaces it.
-- THE SETTLE (hr_hunt_apply_member RESTATED, TRAINING arms only): a training window proposes no stamina (JSON null) and none is drained or
--   stamped: the pool rests while the hero trains (hr_stamina_of from its last stamp). Before hr_apply writes a thing, hr_training_window
--   refuses `training_pays` for anything a training window may not carry (an allowlist of delta keys; XP of the trained skill only; no
--   Level XP, coin, item, kill, death, Hearthfind or progress op) and `value_over` past its time bound (each swing interval at most the
--   dummy's whole health taught once, at the skill's share, x value_headroom). After the session half, hr_training_hour: a yard window that
--   lands EXACTLY on its next hour's first instant (the edge cuts it there: src/core/hunt/training.js trainingStopMs) pays that hour,
--   hr_training_fee(the skill's level at that instant), from the account purse, out of what the window's own store bill and the hero's
--   floor leave (so hr_hunt_apply_instance's bill and floor still hold), journalled kind shop, intent training_fee:<hunt>:<hour>, the
--   session named in meta (never session_id: no coin the hero earned), gold_kind shop, and raises hours_limit by one; or, the purse short, ends the session `gold_out` at that instant,
--   nothing owed. At hours_limit = max_hours nothing is bought: the engine ends it `hours` there.
-- hr_hunt_admit RESTATED: a training ground's ONE door is hr_training_start (the GUC hr.training names the ground for that transaction
--   only; no client role can set a GUC); every other way in (enter, party start, Hunt again, a move mid-hunt) answers `training_only`.
--   It asks no Level gate: a dummy keeps pace with its hero.
-- hr_hunt_enter_check SPLICED once: an empty stamina pool refuses a hunt, never a training session opened by its door.
-- account_house_dummy (user_id, skill, price, bought_slot, bought_at), pk (user_id, skill): RLS on, the owner reads its own rows, no client
--   writes (only hr_house_dummy_unlock, SECURITY DEFINER). The house dummy is ONE per account: hr_training_quote refuses a second hero
--   (dummy_busy) under the account key hr:train:<uid>, which every training start takes first.
--
-- ── CONCURRENCY AND IDEMPOTENCY ───────────────────────────────────────────────
-- hr_training_start: hr:train:<uid> (only this verb takes it), then inside hr_hunt_enter_for the character, its bag's stock rows, the
--   play locks; then hr_apply takes the account purse. The settle takes the character then the purse: the same order, no cycle. Two starts
--   on two heroes of one account serialise on hr:train and the second sees the first (dummy_busy). The key: hr_intent_replay first, the
--   charge's hr_apply journals it (the free house start too: a journal-only apply), so a replay answers once and charges once.
-- hr_house_dummy_unlock: the character (hr_hunt_lock), then hr:sink:<uid> (every account-scoped sink verb's key), then hr_apply: two heroes
--   buying together read one count. Lock order hero -> hr:sink -> purse, as every sink verb.
-- The hourly charge runs inside hr_hunt_apply_instance under the character's lock and the account purse's lock it took first: no new
--   lock. Its idempotency is the window's: the settle's own key (a replayed window answers before any member lands) and the CAS on
--   hours_limit (a window lands on T_k at most once: the next window starts at T_k).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- Three client verbs, one a read. No client value prices anything: p_fee_seen / p_price are only compared with the server's quote. A
--   training window can only CREDIT the trained skill's XP (allowlist, before hr_apply) and only DEBIT gold (the fees here, the store bill
--   as any hunt's): no Level XP, coin, item, kill or Bestiary credit reaches it on any route, so it is not a farm. A compromised engine is
--   bounded per window by the time bound and the general value bound. The house dummy is a pure sink (an unlock, no power: it trains at
--   the yard's rate). Party starts are refused. Nothing crosses to another player.
--
-- ── COST ─────────────────────────────────────────────────────────────────────
-- Per settle of ANY hunt: one primary-key probe of hr_training_grounds (8 rows) in hr_hunt_admit and hr_hunt_apply_member; nothing else
-- for a hunting ground. Per training settle: one more probe (the window check) and, once an hour, one purse move and one ledger row.
-- Rows at 100x players: one shop row an hour of yard training (12 a session at most), one per dummy unlock (4 an account, ever).
--
-- REVERSIBILITY: restate hr_hunt_admit, hr_hunt_apply_member and hr_hunt_enter_check from their pre-images (§0's md5s: production's,
-- 2027-03-12-boss-call.sql's admit, 2027-04-12-tick-enrol-restated.sql's member, 2026-12-05-hunt-setup-per-ground.sql's enter check);
-- drop the three verbs, the four helpers, account_house_dummy and its three baseline rows. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each restated body is exactly the image this file was written against (production's, tests/live-hash-drift.baseline.json measured
-- 2026-11-12), or this file's own (a second apply): md5 of pg_get_functiondef with every run of whitespace one space.
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hr_training_rules') is null or not exists (select 1 from public.hr_training_rules)
     or to_regclass('public.hr_training_grounds') is null or (select count(*) from public.hr_training_grounds) = 0 then
    raise exception 'PRECONDITION: apply 2027-04-16-combat-training-hunt-sessions-catalogue.generated.sql first (hr_training_rules, hr_training_grounds)'; end if;
  if exists (select 1 from public.hr_training_grounds t where not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = t.hunt_id)
                                                          or not exists (select 1 from public.hr_hunts h where h.hunt_id = t.hunt_id)) then
    raise exception 'PRECONDITION: a training ground is not in hr_hunt_grounds / hr_hunts (the two 2027-04-16 catalogues first)'; end if;
  if not exists (select 1 from public.hr_sink_rules where sink_id = 'house_dummy') then
    raise exception 'PRECONDITION: apply 2027-04-16-combat-training-gold-sinks-catalogue.generated.sql first (hr_sink_rules house_dummy)'; end if;
  if to_regprocedure('public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)') is null
     or to_regprocedure('public.hr_hunt_saved_bag(uuid,integer)') is null or to_regprocedure('public.hr_hunt_active_set(uuid,integer)') is null
     or to_regprocedure('public.hr_account_property_tier(uuid)') is null or to_regprocedure('public.hr_sink_price(text,integer,integer)') is null
     or to_regprocedure('public.hr_sink_lock(uuid)') is null or to_regprocedure('public.hr_purse_of(uuid)') is null
     or to_regprocedure('public.hr_purse_move(uuid,bigint,bigint)') is null or to_regprocedure('public.hr_skill_level(text,bigint)') is null
     or to_regprocedure('public.hr_hunt_close(uuid,text,timestamp with time zone,boolean)') is null
     or to_regprocedure('public.hr_character_name(uuid,integer)') is null or to_regprocedure('public.hr_skill_xp_for_level(text,integer)') is null
     or to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_admit(uuid,integer,text)', '3e9d29fe7ec468b037e0e98878afdb61', 'c6cff5f013d8a549567fd65413339052'),
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', '5186f2e9d3865eebe43718626b34b0e2', '5786ead704f7d4230d49aff8921ed288'),
    ('public.hr_hunt_enter_check(uuid,integer,text,jsonb,integer,integer,boolean)', '8f1a4752c011160580903909c36e5026', 'ecca3617edc072f103bfb14c36891f8d')) t(fn, pre, post) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its live pre-image (%) nor this file''s image (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE ACCOUNT'S DUMMY ───────────────────────────────────────────────────
create table if not exists public.account_house_dummy (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  skill       text        not null check (skill ~ '^[a-z0-9_]{1,32}$'),
  price       bigint      not null check (price between 1 and 1000000000),
  bought_slot integer     not null check (bought_slot between 0 and 5),
  bought_at   timestamptz not null default now(),
  primary key (user_id, skill)
);
comment on table public.account_house_dummy is
  '2027-04-16-combat-training.sql (Tyler 2026-11-08): the combat skills an ACCOUNT has unlocked on its house training dummy, once each, in the '
  'order its heroes bought them (hr_sink_rules house_dummy). Written ONLY by hr_house_dummy_unlock under the account sink key; character wipe: the account''s rows go with it.';
alter table public.account_house_dummy enable row level security;
revoke all on public.account_house_dummy from public, anon, authenticated, service_role;
grant select on public.account_house_dummy to authenticated;
drop policy if exists "account_house_dummy own read" on public.account_house_dummy;
create policy "account_house_dummy own read" on public.account_house_dummy for select
  using ((select auth.uid()) = user_id);

-- ── §2 THE HELPERS (owner-only) ──────────────────────────────────────────────
-- THE YARD'S FEE for one hour at trained-skill level p_level: fee_base + fee_per_level x the level (src/data/training.js trainingFee).
create or replace function public.hr_training_fee(p_level int)
returns bigint language sql stable security definer set search_path = public, pg_catalog as $fn$
  select (r.fee_base + r.fee_per_level * greatest(1, coalesce(p_level, 1)))::bigint from public.hr_training_rules r where r.id
$fn$;

-- THE QUOTE: training p_skill at p_place for this hero, as the server prices it now, or null for no such ground. `why` is the first
-- refusal (in_party, no_home, not_owned, dummy_busy) or null; `busy` the name of the hero on the dummy. Read under hr:train by the verb.
create or replace function public.hr_training_quote(p_user uuid, p_slot int, p_skill text, p_place text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_t public.hr_training_grounds%rowtype; v_r public.hr_training_rules%rowtype; v_lv int; v_price bigint; v_why text;
  v_owned boolean := false; v_busy text;
begin
  select * into v_t from public.hr_training_grounds where place = p_place and skill = p_skill;
  if not found then return null; end if;
  select * into v_r from public.hr_training_rules where id;
  v_lv := public.hr_skill_level(v_t.skill, coalesce((select ps.xp from public.player_skills ps
                                                      where ps.user_id = p_user and ps.slot = p_slot and ps.skill_id = v_t.skill), 0));
  v_price := case when v_t.fee then public.hr_training_fee(v_lv) else 0 end;
  if v_t.place = 'house' then
    v_owned := exists (select 1 from public.account_house_dummy d where d.user_id = p_user and d.skill = v_t.skill);
    -- ONE HERO ON THE DUMMY: another hero of the account training on any house ground holds it (this hero's own open session is
    -- hr_hunt_enter_for's hunt_open, said there).
    select coalesce(public.hr_character_name(h.user_id, h.slot), 'slot ' || h.slot) into v_busy
      from public.hunt_sessions h join public.hr_training_grounds g on g.hunt_id = h.hunt_id and g.place = 'house'
     where h.user_id = p_user and h.slot <> p_slot and h.ended_at is null
     order by h.slot limit 1;
  end if;
  v_why := case when public.hr_hunt_party_of(p_user, p_slot) is not null then 'in_party'
                when v_t.place = 'house' and public.hr_account_property_tier(p_user) < v_r.house_tier then 'no_home'
                when v_t.place = 'house' and not v_owned then 'not_owned'
                when v_t.place = 'house' and v_busy is not null then 'dummy_busy' end;
  return jsonb_build_object('hunt', v_t.hunt_id, 'place', v_t.place, 'skill', v_t.skill, 'level', v_lv, 'price', v_price,
                            'per_hour', v_t.fee, 'max_hours', v_r.max_hours, 'xp_permille', v_t.xp_permille,
                            'available', v_why is null, 'why', v_why, 'busy', v_busy);
end $fn$;

-- WHAT A TRAINING WINDOW MAY SAY, before hr_apply writes a thing (hr_hunt_apply_member). An allowlist, so a new payout route is refused
-- until someone decides it belongs here: the clock, the hero's HP, its journal row with no kill, and the TRAINED skill's XP and its carry.
-- Raises (hr_reject): training_pays (a key, a skill, a kill, a progress op it may not carry), value_over (past the time bound: each swing
-- interval of the window at most the dummy's whole health taught once at the skill's share, x value_headroom). A non-training hunt: nothing.
create or replace function public.hr_training_window(p_user uuid, p_slot int, p_hunt text, p_from timestamptz, p_to timestamptz, p_delta jsonb)
returns void language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_t public.hr_training_grounds%rowtype; v_k text; v_win bigint; v_per bigint; v_cap numeric; v_xp numeric;
begin
  select * into v_t from public.hr_training_grounds where hunt_id = p_hunt;
  if not found then return; end if;
  select k into v_k from jsonb_object_keys(p_delta) k where k not in ('accrued_to', 'hp', 'journal', 'xp', 'xp_frac', 'progress') order by 1 limit 1;
  if v_k is not null then perform public.hr_reject('training_pays', jsonb_build_object('hunt', p_hunt, 'what', v_k)); end if;
  if (p_delta ? 'xp' and jsonb_typeof(p_delta->'xp') <> 'object') or (p_delta ? 'xp_frac' and jsonb_typeof(p_delta->'xp_frac') <> 'object') then
    perform public.hr_reject('training_pays', jsonb_build_object('hunt', p_hunt, 'what', 'xp_shape')); end if;
  select e.key into v_k from jsonb_each(coalesce(p_delta->'xp', '{}'::jsonb)) e
   where e.key <> v_t.skill or jsonb_typeof(e.value) <> 'number' or (e.value #>> '{}')::numeric < 0 order by 1 limit 1;
  if v_k is null then
    select e.key into v_k from jsonb_each(coalesce(p_delta->'xp_frac', '{}'::jsonb)) e where e.key <> v_t.skill order by 1 limit 1;
  end if;
  if v_k is not null then perform public.hr_reject('training_pays', jsonb_build_object('hunt', p_hunt, 'what', 'xp:' || left(v_k, 48))); end if;
  if jsonb_typeof(p_delta->'journal') is distinct from 'object'
     or coalesce(case when jsonb_typeof(p_delta->'journal'->'meta'->'kills') = 'number' then (p_delta->'journal'->'meta'->>'kills')::numeric end, -1) <> 0
     or (p_delta->'journal'->'meta') ? 'km' then
    perform public.hr_reject('training_pays', jsonb_build_object('hunt', p_hunt, 'what', 'kills')); end if;
  if p_delta ? 'progress' and (jsonb_typeof(p_delta->'progress') <> 'array' or jsonb_array_length(p_delta->'progress') > 0) then
    perform public.hr_reject('training_pays', jsonb_build_object('hunt', p_hunt, 'what', 'progress')); end if;
  v_win := greatest(0, floor(extract(epoch from (p_to - p_from)) * 1000)::bigint);
  select max(b.xp_max) into v_per from public.hr_hunt_kill_bounds b
   where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = p_hunt);
  v_cap := (v_win / public.hr_hunt_limit('swing_interval_ms') + 1) * coalesce(v_per, 0) * v_t.xp_permille / 1000.0
           * public.hr_hunt_limit('value_headroom');
  v_xp := coalesce((p_delta->'xp'->>v_t.skill)::numeric, 0);
  if v_cap is null or v_xp > v_cap then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'training', 'skill', v_t.skill, 'xp', v_xp, 'max', v_cap, 'window_ms', v_win)); end if;
end $fn$;

-- THE YARD'S NEXT HOUR, at its first instant (hr_hunt_apply_member, after the session half, under the character's lock and the account
-- purse's, both taken by hr_hunt_apply_instance first). p_to is this window's end, p_cost its own store bill (paid after every member),
-- p_floor the hero's "Keep at least". Answers the session half's answer p_h, with `ended` when it ended the session here.
create or replace function public.hr_training_hour(p_user uuid, p_slot int, p_session uuid, p_to timestamptz, p_cost bigint, p_floor bigint, p_h jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_s public.hunt_sessions%rowtype; v_t public.hr_training_grounds%rowtype; v_max int; v_lv int; v_fee bigint; v_g bigint; v_hour int;
begin
  select * into v_s from public.hunt_sessions where id = p_session;
  select * into v_t from public.hr_training_grounds where hunt_id = v_s.hunt_id;
  if not found or v_s.ended_at is not null or not v_t.fee or v_s.hours_limit is null then return p_h; end if;
  select r.max_hours into v_max from public.hr_training_rules r where r.id;
  -- Only the window that lands EXACTLY on the next hour's first instant buys it, and never past the longest session.
  if v_s.hours_limit >= v_max or p_to is distinct from v_s.hunt_from + make_interval(hours => v_s.hours_limit) then return p_h; end if;
  v_hour := v_s.hours_limit + 1;
  v_lv := public.hr_skill_level(v_t.skill, coalesce((select ps.xp from public.player_skills ps
                                                      where ps.user_id = p_user and ps.slot = p_slot and ps.skill_id = v_t.skill), 0));
  v_fee := public.hr_training_fee(v_lv);
  -- THE PURSE PAYS IT ONLY OUT OF WHAT THE WINDOW'S OWN BILL AND FLOOR LEAVE: hr_hunt_apply_instance debits the bill after every member
  -- and holds a hero that bought to its floor, so neither may be the one left short.
  if public.hr_purse_of(p_user) - greatest(0, coalesce(p_cost, 0)) - (case when coalesce(p_cost, 0) > 0 then greatest(0, coalesce(p_floor, 0)) else 0 end) < v_fee then
    perform public.hr_hunt_close(p_session, 'gold_out', p_to, true);
    return coalesce(p_h, '{}'::jsonb) || jsonb_build_object('ended', 'gold_out', 'training', jsonb_build_object('hour', v_hour, 'fee', v_fee, 'paid', false));
  end if;
  v_g := public.hr_purse_move(p_user, -v_fee, 0);
  if v_g is null then perform public.hr_reject('gold_short', jsonb_build_object('why', 'training', 'fee', v_fee)); end if;
  -- A PURCHASE, journalled as the first hour's is (kind shop, the session in meta, never in session_id: a session-stamped row folds into
  -- the hunt's own coins, hr_hunt_settle_session's tally, and the yard's fee is no coin the hero earned).
  insert into public.player_ledger (user_id, slot, kind, intent, gold, meta, purse, gold_kind)
    values (p_user, p_slot, 'shop', 'training_fee:' || v_s.hunt_id || ':' || v_hour, -v_fee,
            jsonb_build_object('reason', 'training_fee', 'hunt', v_s.hunt_id, 'skill', v_t.skill, 'level', v_lv, 'hour', v_hour, 'fee', v_fee,
                               'session', p_session),
            v_g, 'shop');
  update public.hunt_sessions set hours_limit = v_hour, version = version + 1 where id = p_session and hours_limit = v_hour - 1;
  if not found then perform public.hr_reject('session_moved', jsonb_build_object('why', 'training_hour')); end if;
  return coalesce(p_h, '{}'::jsonb) || jsonb_build_object('training', jsonb_build_object('hour', v_hour, 'fee', v_fee, 'paid', true));
end $fn$;

revoke execute on function public.hr_training_fee(int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_training_quote(uuid, int, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_training_window(uuid, int, text, timestamptz, timestamptz, jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.hr_training_hour(uuid, int, uuid, timestamptz, bigint, bigint, jsonb) from public, anon, authenticated, service_role;

-- ── §3 THE VERBS ─────────────────────────────────────────────────────────────
create or replace function public.hr_training_start(p_slot int, p_skill text, p_where text, p_fee_seen bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'training_start';
  v_uid uuid := auth.uid(); v_t public.hr_training_grounds%rowtype; v_r jsonb; v_verb text; v_q jsonb; v_no jsonb; v_ver bigint; v_a jsonb;
  v_price bigint; v_sid uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_fee_seen is null or p_fee_seen < 0 or p_fee_seen > 1000000000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  select * into v_t from public.hr_training_grounds where place = p_where and skill = p_skill;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_skill')); end if;
  v_verb := c_verb || ':' || v_t.hunt_id || ':' || p_fee_seen;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- THE ACCOUNT'S TRAINING KEY, first: a second start on any hero of this account waits here, then counts this one (dummy_busy).
  perform pg_advisory_xact_lock(hashtextextended('hr:train:' || v_uid::text, 0));
  v_q := public.hr_training_quote(v_uid, p_slot, p_skill, p_where);
  v_price := (v_q->>'price')::bigint;
  if not (v_q->>'available')::boolean then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', v_q->>'why', 'fee', v_price, 'busy', v_q->'busy')); end if;
  if v_price <> p_fee_seen then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'fee', v_price)); end if;
  -- THE SESSION AND THE CHARGE TOGETHER: a start that can't pay rolls the session back out.
  begin
    perform set_config('hr.training', v_t.hunt_id, true);
    v_r := public.hr_hunt_enter_for(v_uid, p_slot, v_t.hunt_id, public.hr_hunt_saved_bag(v_uid, p_slot), public.hr_hunt_active_set(v_uid, p_slot),
                                    case when v_t.fee then 1 else (v_q->>'max_hours')::int end);
    perform set_config('hr.training', '', true);
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      v_no := v_r; raise exception using errcode = 'HR879', message = 'training_refused'; end if;
    v_sid := (v_r->>'session_id')::uuid;
    select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
    -- ONE apply on the caller's key: the first hour's fee (the house: no gold, the row still journals the key).
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, (case when v_price > 0 then jsonb_build_object('gold', -v_price) else '{}'::jsonb end) || jsonb_build_object(
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', case when v_t.fee then 'training_fee' else 'training_start' end,
                                                                      'hunt', v_t.hunt_id, 'skill', v_t.skill, 'place', v_t.place,
                                                                      'level', (v_q->>'level')::int, 'hour', 1, 'fee', v_price, 'session', v_sid))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      v_no := v_a || jsonb_build_object('ok', false, 'fee', v_price, 'purse', public.hr_purse_of(v_uid)); raise exception using errcode = 'HR879', message = 'training_refused'; end if;
  exception when sqlstate 'HR879' then
    perform set_config('hr.training', '', true);
    return public.hr_note_rejection(c_verb, p_slot, v_no);
  end;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -v_price, 'session_id', v_sid, 'session', v_r->'session');
end $fn$;
revoke execute on function public.hr_training_start(int, text, text, bigint, uuid) from public;
revoke execute on function public.hr_training_start(int, text, text, bigint, uuid) from anon, service_role;
grant  execute on function public.hr_training_start(int, text, text, bigint, uuid) to authenticated;

create or replace function public.hr_house_dummy_unlock(p_slot int, p_skill text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'house_dummy_unlock';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_bought int; v_price bigint; v_a jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 1 or p_price > 1000000000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  if not exists (select 1 from public.hr_training_grounds where place = 'house' and skill = p_skill) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_skill')); end if;
  -- The rungs climb (tools/gen-gold-sinks.mjs refuses a ladder that doesn't), so the price names the rung, and a key can't buy two.
  v_verb := 'house_dummy:' || p_skill || ':' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- THE ACCOUNT'S SINK KEY, after the hero's lock and before hr_apply (2027-02-27-gold-sinks-seams.sql): two heroes read one count.
  perform public.hr_sink_lock(v_uid);
  if public.hr_account_property_tier(v_uid) < (select r.house_tier from public.hr_training_rules r where r.id) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_home')); end if;
  if exists (select 1 from public.account_house_dummy d where d.user_id = v_uid and d.skill = p_skill) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'already_owned')); end if;
  -- THE QUOTE, under the locks, from the server's row: never the client's number.
  v_bought := (select count(*) from public.account_house_dummy d where d.user_id = v_uid)::int;
  v_price := public.hr_sink_price('house_dummy', v_bought);
  if v_price is null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'dummy_max')); end if;
  if v_price <> p_price then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'price', v_price)); end if;
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'gold', -p_price,
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', 'house_dummy', 'skill', p_skill, 'rung', v_bought + 1))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_note_rejection(c_verb, p_slot, v_a || jsonb_build_object('ok', false, 'price', v_price, 'purse', public.hr_purse_of(v_uid))); end if;
  insert into public.account_house_dummy (user_id, skill, price, bought_slot, bought_at) values (v_uid, p_skill, p_price, p_slot, now());
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -p_price);
end $fn$;
revoke execute on function public.hr_house_dummy_unlock(int, text, bigint, uuid) from public;
revoke execute on function public.hr_house_dummy_unlock(int, text, bigint, uuid) from anon, service_role;
grant  execute on function public.hr_house_dummy_unlock(int, text, bigint, uuid) to authenticated;

-- ── §3b THE `training` SECTION (every envelope; src/session/training-sections.js reads it field by field) ──
-- Owner-only: hr_state_sections_of calls it with the character's own (user, slot). Reads only: a few indexed rows of this hero and account.
create or replace function public.hr_training_section(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_r public.hr_training_rules%rowtype; v_run jsonb; v_last jsonb; v_quotes jsonb; v_skills jsonb; v_dummy jsonb; v_busy text; v_bought int;
  v_s record;
begin
  select * into v_r from public.hr_training_rules where id;
  if not found then return null; end if;
  -- THE YARD'S QUOTES, in the data's order: the fee at the hero's level now, and the hero's OWN pace on its last session of that skill
  -- (yard or house: the same rate), once that session ran ten minutes (the analyzer's rate window); else null.
  select coalesce(jsonb_agg(q.skill order by q.ord), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('skill', q.skill, 'level', q.lv, 'fee_h', public.hr_training_fee(q.lv), 'xp_h', q.xp_h,
                     'hours_to_next', case when q.xp_h > 0 then ceil(greatest(0, public.hr_skill_xp_for_level(q.skill, q.lv + 1) - q.xp)::numeric / q.xp_h)::int end)
                   order by q.ord), '[]'::jsonb)
    into v_skills, v_quotes
    from (select g.skill, g.ord, x.xp, public.hr_skill_level(g.skill, x.xp) as lv,
                 (select case when t.paid_ms >= 600000 then floor(coalesce((t.xp->>g.skill)::numeric, 0) * 3600000 / t.paid_ms)::bigint end
                    from public.hunt_sessions h
                    join public.hr_training_grounds tg on tg.hunt_id = h.hunt_id and tg.skill = g.skill
                    join public.hunt_session_tally t on t.session_id = h.id
                   where h.user_id = p_user and h.slot = p_slot
                   order by h.entered_at desc limit 1) as xp_h
            from public.hr_training_grounds g
            cross join lateral (select coalesce((select ps.xp from public.player_skills ps
                                                  where ps.user_id = p_user and ps.slot = p_slot and ps.skill_id = g.skill), 0) as xp) x
           where g.place = 'yard') q;
  -- THE RUN: this hero's open training session, its hourly price now and the gold its fee rows took (the session named in their meta).
  select h.id, h.entered_at, h.hunt_from, g.skill, g.place, g.fee into v_s
    from public.hunt_sessions h join public.hr_training_grounds g on g.hunt_id = h.hunt_id
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is null;
  if found then
    v_run := jsonb_build_object('skill', v_s.skill, 'where', v_s.place, 'since', v_s.hunt_from,
      'fee_h', case when v_s.fee then (select (q->>'fee_h')::bigint from jsonb_array_elements(v_quotes) q where q->>'skill' = v_s.skill) else 0 end,
      'paid', coalesce((select -sum(l.gold) from public.player_ledger l
                         where l.user_id = p_user and l.slot = p_slot and l.at >= v_s.entered_at and l.kind = 'shop'
                           and l.intent like 'training\_%' and l.meta->>'session' = v_s.id::text), 0));
  end if;
  -- THE LAST STOP: its last ended training session, why and when.
  select jsonb_build_object('reason', h.end_reason, 'skill', g.skill, 'at', h.ended_at) into v_last
    from public.hunt_sessions h join public.hr_training_grounds g on g.hunt_id = h.hunt_id
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is not null
   order by h.ended_at desc limit 1;
  -- THE ACCOUNT'S DUMMY: the home it needs, the skills bought in order, the ladder and the next rung, and the hero on it now, by name.
  select coalesce(public.hr_character_name(h.user_id, h.slot), 'slot ' || h.slot) into v_busy
    from public.hunt_sessions h join public.hr_training_grounds g on g.hunt_id = h.hunt_id and g.place = 'house'
   where h.user_id = p_user and h.ended_at is null order by h.slot limit 1;
  v_bought := (select count(*) from public.account_house_dummy d where d.user_id = p_user)::int;
  v_dummy := jsonb_build_object('needs', v_r.house_tier_id,
    'has_home', public.hr_account_property_tier(p_user) >= v_r.house_tier,
    'owned', coalesce((select jsonb_agg(d.skill order by d.bought_at, d.price) from public.account_house_dummy d where d.user_id = p_user), '[]'::jsonb),
    'ladder', coalesce(to_jsonb((select s.prices from public.hr_sink_rules s where s.sink_id = 'house_dummy')), '[]'::jsonb),
    'next_price', public.hr_sink_price('house_dummy', v_bought),
    'busy', v_busy);
  return jsonb_build_object('skills', v_skills, 'max_hours', v_r.max_hours, 'quotes', v_quotes, 'run', v_run, 'last_stop', v_last, 'dummy', v_dummy);
end $fn$;
revoke execute on function public.hr_training_section(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('training', 'hr_training_section', '2027-04-16-combat-training.sql: combat training for this hero: the yard''s skills, fee and own pace, the open session and its paid gold, the last stop, the account''s house dummy (src/session/training-sections.js)')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §4 THE ONE DOOR (hr_hunt_admit, RESTATED: 2027-03-12-boss-call.sql's image with the TRAINING arm, every other line verbatim) ─
CREATE OR REPLACE FUNCTION public.hr_hunt_admit(p_user uuid, p_slot integer, p_hunt text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_training boolean;
begin
  -- CALL-OUT (2027-03-12-boss-call.sql): a called room has one door, hr_boss_call, which names the room for its own transaction.
  if exists (select 1 from public.hr_boss_calls c where c.hunt_id = p_hunt)
     and current_setting('hr.boss_call', true) is distinct from p_hunt then
    return jsonb_build_object('ok', false, 'error', 'call_only', 'hunt', p_hunt); end if;
  -- TRAINING (2027-04-16-combat-training.sql): a training ground has one door, hr_training_start, which names the ground for its own
  -- transaction. It asks no Level gate: a dummy keeps pace with its hero.
  if exists (select 1 from public.hr_training_grounds t where t.hunt_id = p_hunt) then
    if current_setting('hr.training', true) is distinct from p_hunt then
      return jsonb_build_object('ok', false, 'error', 'training_only', 'hunt', p_hunt); end if;
    return null;
  end if;
  select training into v_training from public.hr_hunt_travel where hunt_id = p_hunt;
  if v_training is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_hunt', 'hunt', p_hunt); end if;
  if not v_training then
    begin
      perform public.hr_hunt_gate(p_user, p_slot, p_hunt);
    exception when sqlstate 'HR000' then
      return jsonb_build_object('ok', false, 'error', sqlerrm, 'hunt', p_hunt);
    end;
    return null;
  end if;
  if exists (select 1 from public.hr_activities a
              where a.kind = 'combat' and a.activity_id = p_hunt
                and (a.is_boss
                     or (a.req_skill is not null and a.req_lv is not null
                         and coalesce((select public.hr_level_from_xp(ps.xp) from public.player_skills ps
                                        where ps.user_id = p_user and ps.slot = p_slot
                                          and ps.skill_id = a.req_skill), 1) < a.req_lv)))
     or not exists (select 1 from public.hr_activities a where a.kind = 'combat' and a.activity_id = p_hunt) then
    return jsonb_build_object('ok', false, 'error', 'activity_locked', 'hunt', p_hunt);
  end if;
  return null;
end $function$;

-- ── §4b TRAINING OPENS ON AN EMPTY POOL (hr_hunt_enter_check, ONE splice; a second apply finds the post image) ─
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_enter_check(uuid,integer,text,jsonb,integer,integer,boolean)'::regprocedure), chr(13), '');
  if strpos(v_def, 'TRAINING (2027-04-16') = 0 then
    v_old := $a$  -- STAMINA: an empty pool cannot start a hunt.
  if coalesce(public.hr_stamina_of(p_uid, p_slot, now()), 0) <= 0 then$a$;
    v_new := $a$  -- STAMINA: an empty pool cannot start a hunt. TRAINING (2027-04-16-combat-training.sql): a training session spends none, so the
  -- start its one door runs (hr_training_start names the ground in hr.training for its own transaction) opens on an empty pool.
  if coalesce(public.hr_stamina_of(p_uid, p_slot, now()), 0) <= 0
     and not (v_ground and current_setting('hr.training', true) is not distinct from p_hunt
              and exists (select 1 from public.hr_training_grounds t where t.hunt_id = p_hunt)) then$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_enter_check: TRAINING anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §5 THE SETTLE (hr_hunt_apply_member, RESTATED: 2027-04-12-tick-enrol-restated.sql's image, pg_get_functiondef's own text, with the
--    TRAINING arms only, each marked; every other line verbatim) ─────────────────────────────────────────────────────────────────────
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
  v_n bigint; v_cur bigint; v_lv0 int; v_fin int; v_fi int; v_r record;
  v_stam  jsonb; v_cap bigint; v_sat timestamptz; v_s0 bigint; v_e bigint;
  v_win bigint; v_paid bigint; v_nsw bigint; v_tick bigint;
  v_lx0 bigint; v_vit jsonb; v_mana bigint; v_def bigint;
  v_lfrom int; v_lto int;  -- DEATH-SHARE (2027-03-25-death-share.sql): the hero's Level before and after the death's debit
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
  v_train boolean;  -- TRAINING (2027-04-16-combat-training.sql): this session trains on a training ground (hr_training_grounds)
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
  -- LIVE-EVENTS (2027-03-22-live-events.sql): `xp_event` is this member's own (kept on the tally below), never the session half's.
  v_hunt := p_hunt - 'death_xp' - 'stamina' - 'buys' - 'cover' - 'unit_id' - 'tick_ms' - 'xp_event';
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
    -- DEATH-SHARE: one formula, a share of the TOTAL Level XP (no alternative base row).
    v_rate := public.hr_hunt_limit('death_xp_permille');
    if v_rate is null then perform public.hr_reject('catalogue_missing'); end if;
  end if;
  -- (2c) THE STAMINA POOL, shape only; the start value is the DATABASE's.
  v_stam := p_hunt->'stamina';
  -- TRAINING (2027-04-16-combat-training.sql): a training session spends no stamina and proposes none (a JSON null, src/core/combat-sim.js);
  -- the pool is never written here, so it rests while the hero trains (hr_stamina_of from its last stamp).
  v_train := exists (select 1 from public.hr_training_grounds t where t.hunt_id = v_s.hunt_id);
  if v_train then
    if v_stam is null or jsonb_typeof(v_stam) <> 'null' then perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'training')); end if;
  elsif v_stam is null or jsonb_typeof(v_stam) <> 'number' or (v_stam #>> '{}') !~ '^[0-9]{1,12}$' then
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
  -- TRAINING (2027-04-16-combat-training.sql): A TRAINING WINDOW PAYS ITS SKILL AND NOTHING ELSE, refused whole before hr_apply writes a thing
  -- (hr_training_window: an allowlist, the trained skill's key only, no Level XP, no coin, no item, no kill, no death, a time bound).
  if v_train then perform public.hr_training_window(p_user, p_slot, v_s.hunt_id, v_s.settled_to, v_to, p_delta); end if;

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
  -- LIVE-EVENTS: the Level XP bound grows by this account's own live dial over this window's span, and by nothing else.
  if jsonb_typeof(p_delta->'level_xp') = 'number' and (p_delta->>'level_xp')::numeric
       > v_kills * v_vb_xp * v_vb_h * public.hr_live_xp_max_pm(p_user, v_s.hunt_id, v_s.settled_to, v_to) / 1000.0 then
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
  -- TRAINING (2027-04-16-combat-training.sql): a training window drains nothing and stamps nothing (the clock above is still re-proved).
  if not v_train then
    if v_e <> greatest(0, v_s0 - v_paid) then
      perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'bound', 'from_ms', v_s0, 'ms', v_e, 'paid_ms', v_paid)); end if;
    if v_s0 <= 0 and v_nsw > 0 then perform public.hr_reject('end_missing', jsonb_build_object('reason', 'stamina')); end if;
    update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;
  end if;

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
    -- MEMBER-WRITE-ONCE (2027-04-08-member-write-once.sql): the bill's tally increments (bought, supply_gold) are written
    -- with the analyzer's, in the one tally write after the session half (THE ANALYZER TALLY below). Nothing reads them between.
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
  -- TRAINING (2027-04-16-combat-training.sql): THE YARD'S NEXT HOUR, at its first instant (the edge cuts a yard window there, src/core/hunt/training.js
  -- trainingStopMs): paid from the account purse out of what this window's own store bill and the hero's floor leave, or the session ends gold_out
  -- right there (hr_training_hour). Its end, if any, rides the answer, so the resume below and the edge read it as any end.
  if v_train then v_h := public.hr_training_hour(p_user, p_slot, p_session, v_to, v_cost, v_floor, v_h); end if;
  -- LIVE-EVENTS: THE EVENT'S PART of this window's Level XP, apart on the tally (a best leaves it out). Never more than the window's Level XP,
  --   nor more than the account's own dial could add to it (a floor a kill, so the window's kills on top), and none with no event live.
  if p_hunt ? 'xp_event' then
    if jsonb_typeof(p_hunt->'xp_event') is distinct from 'number' or (p_hunt->>'xp_event') !~ '^[0-9]{1,15}$'
       or (p_hunt->>'xp_event')::numeric > coalesce(case when jsonb_typeof(p_delta->'level_xp') = 'number' then (p_delta->>'level_xp')::numeric end, 0)
       or (p_hunt->>'xp_event')::numeric > (select case when q.m = 1000 then 0
              else coalesce(case when jsonb_typeof(p_delta->'level_xp') = 'number' then (p_delta->>'level_xp')::numeric end, 0) * (q.m - 1000) / q.m + v_kills end
            from (select public.hr_live_xp_max_pm(p_user, v_s.hunt_id, v_s.settled_to, v_to) as m) q) then
      perform public.hr_reject('bad_xp_event', jsonb_build_object('xp_event', p_hunt->'xp_event', 'level_xp', p_delta->'level_xp')); end if;
  end if;
  -- STAMINA LOW: once per hunt, when the pool this window left is at or under the limits row.
  if not v_train and v_e <= coalesce(public.hr_hunt_limit('stamina_low_min'), 0)::bigint * 60000
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
  -- (6) THE PRICE OF THE DEATH, RE-CHECKED AND DEBITED (Tyler 2026-11-09, CORE_MODEL.md §6):
  --     DEATH-SHARE: every bound is hr_death_xp_max, the one rule: the LEVEL loses at most
  --     death_xp_permille of its TOTAL XP, and that may take a Level (never below 0 XP, Level 1);
  --     each combat skill loses at most the permille of its progress into its level, never a level.
  --     Bounds are read on the CURRENT values, which only grew since the death.
  if v_lost <> '{}'::jsonb then
    for v_k, v_n in select key, (value #>> '{}')::bigint from jsonb_each(v_lost) order by key loop
      if v_k = 'level' then
        select level_xp into v_cur from public.player_state where user_id = p_user and slot = p_slot for update;
        if v_n > public.hr_death_xp_max('level', v_cur) then
          perform public.hr_reject('death_xp_over', jsonb_build_object('skill', 'level', 'level', public.hr_char_level(v_cur))); end if;
        update public.player_state set level_xp = level_xp - v_n where user_id = p_user and slot = p_slot;
        continue;
      end if;
      select xp into v_cur from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_k for update;
      if v_cur is null then perform public.hr_reject('bad_death_xp', jsonb_build_object('skill', v_k)); end if;
      if v_n > public.hr_death_xp_max(v_k, v_cur) then
        perform public.hr_reject('death_xp_over', jsonb_build_object('skill', v_k, 'level', public.hr_skill_level(v_k, v_cur))); end if;
      update public.player_skills set xp = xp - v_n where user_id = p_user and slot = p_slot and skill_id = v_k;
    end loop;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'death_xp',
              jsonb_build_object('reason', 'death_xp', 'xp', v_lost, 'deaths', v_nd, 'permille', v_rate), p_session);
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
  -- DEATH-SHARE: the death names the Level it took the hero from and to (equal when it took none), off the debited Level XP.
  if v_nd > 0 then
    select level_xp into v_cur from public.player_state where user_id = p_user and slot = p_slot;
    v_lto := public.hr_char_level(v_cur);
    v_lfrom := public.hr_char_level(v_cur + coalesce((v_lost->>'level')::bigint, 0));
  end if;
  v_fi := 0;
  for v_r in select e.id from public.hunt_session_events e
              where e.session_id = p_session and e.id > v_ev0 and e.type = 'death' order by e.id loop
    v_el := coalesce(v_dx->v_fi, '{}'::jsonb);
    update public.hunt_session_events
       set data = data || jsonb_build_object('xp_lost', v_el, 'xp', (select coalesce(sum((x.value #>> '{}')::bigint), 0) from jsonb_each(v_el) x),
                                             'level_from', v_lfrom, 'level_to', v_lto)
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
  -- LIVE-EVENTS: the tally's one update also keeps the event's part (bounded above), analyzer or not.
  -- MEMBER-WRITE-ONCE: the store bill (v_cost > 0) rides this one write; each column keeps its own condition.
  if (p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object') or p_hunt ? 'xp_event' or v_cost > 0 then
    update public.hunt_session_tally t
       set bought = case when v_cost > 0 then public.hr_jsonb_add(t.bought, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                                                from jsonb_each(v_items) i)) else t.bought end,
           supply_gold = t.supply_gold + v_cost,
           xp_event = t.xp_event + coalesce((p_hunt->>'xp_event')::bigint, 0),
           dealt = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                        then public.hr_hunt_tally_add(t.dealt, coalesce(p_analyzer->'dealt', '{}'::jsonb)) else t.dealt end,
           taken = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                        then public.hr_hunt_tally_add(t.taken, coalesce(p_analyzer->'taken', '{}'::jsonb)) else t.taken end,
           healed = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                         then public.hr_hunt_tally_add(t.healed, coalesce(p_analyzer->'healed', '{}'::jsonb)) else t.healed end,
           fight = case when p_analyzer ? 'fight' then jsonb_build_object('boss_pm', p_analyzer->'fight'->'boss_pm',
             'fired', public.hr_jsonb_add(coalesce(t.fight->'fired', '{}'::jsonb), coalesce(p_analyzer->'fight'->'fired', '{}'::jsonb))) else t.fight end
     where t.session_id = p_session;
  end if;
  -- MEMBER-WRITE-ONCE: written only when it moves (the session half already took this row's version forward).
  update public.hunt_sessions set unit_id = case when ended_at is null then v_unit_id end
   where id = p_session and unit_id is distinct from (case when ended_at is null then v_unit_id end);
  -- The debited (blessed) loss of the death travels back with the answer.
  return coalesce(v_h, '{}'::jsonb) || case when v_nd > 0 then jsonb_build_object('death_xp', v_dx) else '{}'::jsonb end
    -- THE BILL hr_hunt_apply_instance pays (and strips before any answer leaves it).
    || case when v_cost > 0 then jsonb_build_object('_purse', jsonb_build_object('cost', v_cost, 'units', v_units,
                                   'items', v_items, 'floor', v_floor)) else '{}'::jsonb end;
end $function$;

-- ── §6 THE CLIENT BASELINE ───────────────────────────────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_training_start', 'hr_house_dummy_unlock');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_training_start', 'p_slot integer, p_skill text, p_where text, p_fee_seen bigint, p_idem uuid', 'authenticated',
   'added 2027-04-16 (lane/c-combat-training): MONEY (an hourly gold sink) - opens a training session on the one engine; the yard re-quotes its first hour on the server clock and charges it, refuses quote_changed; the house dummy needs its unlock and holds one hero an account; pre-EA Security list'),
  ('hr_house_dummy_unlock', 'p_slot integer, p_skill text, p_price bigint, p_idem uuid', 'authenticated',
   'added 2027-04-16 (lane/c-combat-training): MONEY (a one-time gold sink) - unlocks one combat skill on the account''s house dummy at the next rung of hr_sink_rules house_dummy; refuses quote_changed; pre-EA Security list')
  on conflict (proname, identity_args, grantee) do update set note = excluded.note;

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  c_a constant uuid := '000000c0-0000-4000-a000-00007a1e0001';
  c_b constant uuid := '000000c0-0000-4000-a000-00007a1e0002';
  k   constant text := '000000c0-0000-4000-b000-7a1e';
  v jsonb; v_s text; v_q jsonb; v_r public.hr_training_rules%rowtype; v_lv int; v_fee bigint; v_sid uuid; v_from timestamptz;
  v_hunt text; v_g bigint; v_ladder bigint[]; v_i int; v_role text;
begin
  -- (a) THE SHAPE: a signed-in client calls the two verbs, nobody else; the helpers and the section are owner-only; the section is
  --     registered; the restated bodies carry their arms; the account table is read-own, written by nobody; hygiene STRICT is green.
  foreach v_s in array array['public.hr_training_start(integer,text,text,bigint,uuid)', 'public.hr_house_dummy_unlock(integer,text,bigint,uuid)'] loop
    if has_function_privilege('anon', v_s, 'execute') or has_function_privilege('service_role', v_s, 'execute') or not has_function_privilege('authenticated', v_s, 'execute') then
      raise exception 'combat-training §7(a): the grants on % are wrong', v_s; end if;
  end loop;
  if not exists (select 1 from public.hr_state_sections where key = 'training' and fn = 'hr_training_section') then
    raise exception 'combat-training §7(a): the training section is not registered'; end if;
  foreach v_s in array array['public.hr_training_fee(integer)', 'public.hr_training_quote(uuid,integer,text,text)', 'public.hr_training_section(uuid,integer)',
                             'public.hr_training_window(uuid,integer,text,timestamp with time zone,timestamp with time zone,jsonb)',
                             'public.hr_training_hour(uuid,integer,uuid,timestamp with time zone,bigint,bigint,jsonb)'] loop
    if has_function_privilege('authenticated', v_s, 'execute') or has_function_privilege('anon', v_s, 'execute') then
      raise exception 'combat-training §7(a): a client can execute %', v_s; end if;
  end loop;
  foreach v_s in array array['public.hr_hunt_admit(uuid,integer,text)', 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)',
                             'public.hr_hunt_enter_check(uuid,integer,text,jsonb,integer,integer,boolean)'] loop
    if strpos((select prosrc from pg_proc where oid = v_s::regprocedure), 'TRAINING (2027-04-16') = 0 then raise exception 'combat-training §7(a): % has no TRAINING arm', v_s; end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid = 'public.account_house_dummy'::regclass)
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'account_house_dummy' and cmd = 'SELECT')
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'account_house_dummy' and cmd <> 'SELECT') then
    raise exception 'combat-training §7(a): account_house_dummy is not RLS read-own'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.account_house_dummy', 'insert,update,delete,truncate') then
      raise exception 'combat-training §7(a): % can write account_house_dummy', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  select * into v_r from public.hr_training_rules where id;
  -- (b) THE LADDER is 150,000 / 250,000 / 400,000 / 600,000, an account's (Tyler 2026-11-08; the designer's rungs).
  select s.prices into v_ladder from public.hr_sink_rules s where s.sink_id = 'house_dummy' and s.scope = 'account';
  if v_ladder is distinct from array[150000, 250000, 400000, 600000]::bigint[] then
    raise exception 'combat-training §7(b): the house dummy ladder is %, not 150000/250000/400000/600000', v_ladder; end if;
  -- (c) THE WINDOW CHECK: a clean training window passes; Level XP, coin, an item, another skill, a kill, a death, a Hearthfind, a progress
  --     op and an XP past the time bound are each refused, by name.
  perform public.hr_training_window(c_a, 0, 'training_yard_melee', now() - interval '10 seconds', now(),
    '{"accrued_to":"x","hp":5,"journal":{"kind":"combat","meta":{"kills":0,"ms":10000}},"xp":{"melee":12},"xp_frac":{"melee":0.5}}'::jsonb);
  foreach v_s in array array['{"journal":{"meta":{"kills":0}},"level_xp":1}', '{"journal":{"meta":{"kills":0}},"gold":1}',
                             '{"journal":{"meta":{"kills":0}},"items":{"bones":1}}', '{"journal":{"meta":{"kills":0}},"xp":{"defense":1}}',
                             '{"journal":{"meta":{"kills":1}}}', '{"journal":{"meta":{"kills":0}},"deaths":[{}]}', '{"journal":{"meta":{"kills":0}},"hearthfind":{}}',
                             '{"journal":{"meta":{"kills":0}},"progress":[{"kind":"stat","key":"kills"}]}', '{"journal":{"meta":{"kills":0}},"xp_frac":{"level":0.5}}',
                             '{"hp":5}', '{"journal":{"meta":{"kills":0}},"xp":{"melee":100000000}}'] loop
    begin
      perform public.hr_training_window(c_a, 0, 'training_yard_melee', now() - interval '10 seconds', now(), v_s::jsonb);
      raise exception 'combat-training §7(c): % passed the window check', v_s;
    exception when sqlstate 'HR000' then
      if sqlerrm not in ('training_pays', 'value_over') then raise; end if;
    end;
  end loop;
  begin
    update public.hr_hunt_config set enabled = true where id;
    foreach v_s in array array[c_a::text, c_b::text] loop
      insert into auth.users (id) values (v_s::uuid) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_s::uuid, 'combat-training §7 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_s, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'combat-training §7-harness: hr_create_character refused: %', v; end if;
    end loop;
    -- the account's second hero, in the slot it buys (2027-03-25-hero-slots-one.sql: a new account owns slot 0 alone)
    update public.account_wallet set gold = 2000000 where user_id = c_a;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_buy_hero_slot__ungated(1, 0, (k || '00000000')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'combat-training §7-harness: slot 1 refused: %', v; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'combat-training §7-harness: a second hero refused: %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    update public.account_wallet set gold = 100000 where user_id = c_a;
    -- (d) THE PRICE IS THE CATALOGUE'S: fee_base + fee_per_level x the trained skill's level now.
    v_lv := public.hr_skill_level('melee', coalesce((select xp from public.player_skills where user_id = c_a and slot = 0 and skill_id = 'melee'), 0));
    v_fee := v_r.fee_base + v_r.fee_per_level * greatest(1, v_lv);
    v_q := public.hr_training_quote(c_a, 0, 'melee', 'yard');
    if (v_q->>'price')::bigint <> v_fee or (v_q->>'level')::int <> v_lv or not (v_q->>'available')::boolean then
      raise exception 'combat-training §7(d): the yard quote % is not the catalogue''s % at level %', v_q, v_fee, v_lv; end if;
    -- (e) A FORGED PRICE is quote_changed: nothing charged, nothing opened.
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_training_start(0, 'melee', 'yard', v_fee - 1, (k || '00000001')::uuid);
    if v->>'error' is distinct from 'quote_changed' then raise exception 'combat-training §7(e): a forged price answered %', v; end if;
    if (select gold from public.account_wallet where user_id = c_a) <> 100000
       or exists (select 1 from public.hunt_sessions where user_id = c_a and ended_at is null) then
      raise exception 'combat-training §7(e): a forged price moved something'; end if;
    -- (f) ONE DOOR: an enter on a training ground answers training_only and opens nothing.
    v := public.hr_hunt_enter(0, 'training_yard_melee', '[]'::jsonb, 0, null, (k || '00000002')::uuid);
    if coalesce(v->>'ok', '') = 'true' or v::text not like '%training_only%' then raise exception 'combat-training §7(f): an enter answered %', v; end if;
    -- (g) THE START, ON AN EMPTY POOL: the fee from the purse, one shop row, the session on training_yard_melee with its paid hour; a replay charges
    --     nothing again. A hunt's enter on the same empty pool is still refused no_stamina.
    perform set_config('request.jwt.claim.sub', '', true);
    update public.player_state set stamina_ms = 0, stamina_at = now() where user_id = c_a and slot = 0;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_hunt_enter(0, 'mill_cellar', '[]'::jsonb, 0, null, (k || '00000003')::uuid);
    if v->>'error' is distinct from 'no_stamina' then raise exception 'combat-training §7(g): a hunt on an empty pool answered %', v; end if;
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_training_start(0, 'melee', 'yard', v_fee, (k || '00000004')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'combat-training §7(g): the start answered %', v; end if;
    v_sid := (v->>'session_id')::uuid;
    if (select gold from public.account_wallet where user_id = c_a) <> 100000 - v_fee then
      raise exception 'combat-training §7(g): the purse reads %, not %', (select gold from public.account_wallet where user_id = c_a), 100000 - v_fee; end if;
    if (select count(*) from public.player_ledger where user_id = c_a and kind = 'shop' and intent = 'training_start:training_yard_melee:' || v_fee
          and gold = -v_fee and meta->>'reason' = 'training_fee' and gold_kind = 'shop') <> 1 then
      raise exception 'combat-training §7(g): not one first-hour fee row'; end if;
    if not exists (select 1 from public.hunt_sessions where id = v_sid and user_id = c_a and slot = 0 and hunt_id = 'training_yard_melee' and ended_at is null and hours_limit = 1) then
      raise exception 'combat-training §7(g): no training_yard_melee session with its one paid hour'; end if;
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_training_start(0, 'melee', 'yard', v_fee, (k || '00000004')::uuid);
    if (select gold from public.account_wallet where user_id = c_a) <> 100000 - v_fee
       or (select count(*) from public.player_ledger where user_id = c_a and intent like 'training\_%') <> 1 then
      raise exception 'combat-training §7(g): a replay charged again: %', v; end if;
    -- (h) THE HOURLY CHARGE lands in the ledger at the hour's first instant, the session named; a window that lands elsewhere buys nothing.
    perform set_config('request.jwt.claim.sub', '', true);
    select hunt_from into v_from from public.hunt_sessions where id = v_sid;
    v := public.hr_training_hour(c_a, 0, v_sid, v_from + interval '59 minutes', 0, 0, '{}'::jsonb);
    if v <> '{}'::jsonb or (select hours_limit from public.hunt_sessions where id = v_sid) <> 1 then raise exception 'combat-training §7(h): a mid-hour window bought: %', v; end if;
    v := public.hr_training_hour(c_a, 0, v_sid, v_from + interval '1 hour', 0, 0, '{}'::jsonb);
    if coalesce((v->'training'->>'paid')::boolean, false) is not true or (select hours_limit from public.hunt_sessions where id = v_sid) <> 2
       or (select gold from public.account_wallet where user_id = c_a) <> 100000 - 2 * v_fee then
      raise exception 'combat-training §7(h): the second hour answered %, hours %, purse %', v, (select hours_limit from public.hunt_sessions where id = v_sid),
        (select gold from public.account_wallet where user_id = c_a); end if;
    if (select count(*) from public.player_ledger where user_id = c_a and kind = 'shop' and intent = 'training_fee:training_yard_melee:2' and gold = -v_fee
          and session_id is null and meta->>'session' = v_sid::text and gold_kind = 'shop' and meta->>'reason' = 'training_fee' and (meta->>'hour')::int = 2) <> 1 then
      raise exception 'combat-training §7(h): not one hourly fee row'; end if;
    -- (h2) THE SECTION, in the envelope: the yard's quote at the catalogue's price, the run on the yard with both hours' gold, no stop yet.
    v := (public.hr_state_of(c_a, 0))->'training';
    if v->'skills' <> '["melee", "ranged", "magic", "defense"]'::jsonb or (v->>'max_hours')::int <> v_r.max_hours
       or (select (q->>'fee_h')::bigint from jsonb_array_elements(v->'quotes') q where q->>'skill' = 'melee') <> v_fee
       or v->'run'->>'skill' <> 'melee' or v->'run'->>'where' <> 'yard' or (v->'run'->>'paid')::bigint <> 2 * v_fee or (v->'run'->>'fee_h')::bigint <> v_fee
       or jsonb_typeof(v->'last_stop') <> 'null' or v->'dummy'->>'needs' is null or (v->'dummy'->>'has_home')::boolean
       or (v->'dummy'->>'next_price')::bigint <> 150000 or v->'dummy'->'ladder' <> to_jsonb(v_ladder) then
      raise exception 'combat-training §7(h2): the section reads %', v; end if;
    -- (i) A PURSE THAT CAN'T PAY THE NEXT HOUR ends the session gold_out at that hour's first instant, nothing charged. A window's own store
    --     bill and floor come off first: a purse that pays the fee alone but not the bill and the floor with it ends too.
    update public.account_wallet set gold = v_fee + 20 where user_id = c_a;
    v := public.hr_training_hour(c_a, 0, v_sid, v_from + interval '2 hours', 10, 300, '{}'::jsonb);
    if v->>'ended' is distinct from 'gold_out' then raise exception 'combat-training §7(i): a short purse answered %', v; end if;
    if not exists (select 1 from public.hunt_sessions where id = v_sid and end_reason = 'gold_out' and ended_at = v_from + interval '2 hours')
       or (select gold from public.account_wallet where user_id = c_a) <> v_fee + 20
       or exists (select 1 from public.player_ledger where user_id = c_a and intent = 'training_fee:training_yard_melee:3') then
      raise exception 'combat-training §7(i): the session did not end gold_out at the hour, or something was charged'; end if;
    -- (j) THE HOUSE: no home is no_home; with the home, the ladder in the order bought; the dummy holds one hero of the account at a time,
    --     costs nothing an hour, and runs the longest session from the start; a party is refused.
    update public.account_wallet set gold = 2000000 where user_id = c_a;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_house_dummy_unlock(0, 'melee', 150000, (k || '00000010')::uuid);
    if v->>'error' is distinct from 'no_home' then raise exception 'combat-training §7(j): a homeless buy answered %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at)
      select c_a, 0, u.progress_kind, u.unlock_id, '', v_r.house_tier, now() from public.hr_unlocks u
       where u.namespace = 'property' and v_r.house_tier = any (u.rungs) order by u.unlock_id limit 1
      on conflict do nothing;
    if public.hr_account_property_tier(c_a) < v_r.house_tier then raise exception 'combat-training §7-harness: the probe home did not take'; end if;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v_g := 2000000;
    for v_i in 1 .. 4 loop
      delete from public.hr_rate_counters where user_id = c_a;
      v := public.hr_house_dummy_unlock(0, (array['ranged', 'melee', 'defense', 'magic'])[v_i], v_ladder[v_i] + 1, (k || '0000002' || v_i)::uuid);
      if v->>'error' is distinct from 'quote_changed' then raise exception 'combat-training §7(j): a forged rung % answered %', v_i, v; end if;
      delete from public.hr_rate_counters where user_id = c_a;
      v := public.hr_house_dummy_unlock(0, (array['ranged', 'melee', 'defense', 'magic'])[v_i], v_ladder[v_i], (k || '0000003' || v_i)::uuid);
      v_g := v_g - v_ladder[v_i];
      if coalesce(v->>'ok', '') <> 'true' or (select gold from public.account_wallet where user_id = c_a) <> v_g then
        raise exception 'combat-training §7(j): rung % answered %, purse %', v_i, v, (select gold from public.account_wallet where user_id = c_a); end if;
    end loop;
    if (select count(*) from public.player_ledger where user_id = c_a and kind = 'shop' and intent like 'house\_dummy:%' and meta->>'reason' = 'house_dummy') <> 4
       or (select count(*) from public.account_house_dummy where user_id = c_a) <> 4 then
      raise exception 'combat-training §7(j): not four unlock rows'; end if;
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_house_dummy_unlock(0, 'melee', 150000, (k || '00000040')::uuid);
    if v->>'error' is distinct from 'already_owned' then raise exception 'combat-training §7(j): a second melee unlock answered %', v; end if;
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_training_start(1, 'ranged', 'house', 0, (k || '00000041')::uuid);
    if coalesce(v->>'ok', '') <> 'true'
       or not exists (select 1 from public.hunt_sessions where user_id = c_a and slot = 1 and hunt_id = 'training_house_ranged' and ended_at is null and hours_limit = v_r.max_hours)
       or (select gold from public.account_wallet where user_id = c_a) <> v_g then
      raise exception 'combat-training §7(j): the house start answered %', v; end if;
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_training_start(0, 'melee', 'house', 0, (k || '00000042')::uuid);
    if v->>'error' is distinct from 'dummy_busy' or v->>'busy' is null then raise exception 'combat-training §7(j): a second hero on the dummy answered %', v; end if;
    -- (j2) THE SECTION's dummy: owned in the order bought, nothing left to buy, the hero on it named; the first hero's last stop is its gold_out.
    v := (public.hr_state_of(c_a, 0))->'training';
    if v->'dummy'->'owned' <> '["ranged", "melee", "defense", "magic"]'::jsonb or jsonb_typeof(v->'dummy'->'next_price') <> 'null'
       or not (v->'dummy'->>'has_home')::boolean or v->'dummy'->>'busy' is null or jsonb_typeof(v->'run') <> 'null'
       or v->'last_stop'->>'reason' <> 'gold_out' or v->'last_stop'->>'skill' <> 'melee' then
      raise exception 'combat-training §7(j2): the section reads %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    perform public.hr_party_open(c_b, 0);
    update public.account_wallet set gold = 100000 where user_id = c_b;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    delete from public.hr_rate_counters where user_id = c_b;
    v := public.hr_training_start(0, 'melee', 'yard', public.hr_training_fee(public.hr_skill_level('melee', coalesce((select xp from public.player_skills where user_id = c_b and slot = 0 and skill_id = 'melee'), 0))), (k || '00000050')::uuid);
    if v->>'error' is distinct from 'in_party' then raise exception 'combat-training §7(j): a hero in a party answered %', v; end if;
    -- (k) NO LEVEL XP: a training window's whole delta reaches the trained skill only (the settle's own check, once more through the verb's ground).
    begin
      perform public.hr_training_window(c_a, 1, 'training_house_ranged', now() - interval '10 seconds', now(), '{"journal":{"meta":{"kills":0}},"level_xp":5,"xp":{"ranged":3}}'::jsonb);
      raise exception 'combat-training §7(k): Level XP passed';
    exception when sqlstate 'HR000' then
      if sqlerrm <> 'training_pays' then raise; end if;
    end;
    raise exception using errcode = 'HRL27', message = 'combat-training §7 complete - rolling back';
  exception when sqlstate 'HRL27' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id in (c_a, c_b)) or exists (select 1 from public.account_house_dummy where user_id in (c_a, c_b)) then
    raise exception 'combat-training §7: LEAKED a probe row'; end if;
  raise notice 'combat-training: one door, the catalogue''s price, an hourly charge on the ledger, gold_out at the hour, one hero on the dummy, no Level XP; all green';
end $$;
