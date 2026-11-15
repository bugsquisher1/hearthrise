-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-23-training-gear.sql — TRAINING: ONE FIXED RATE, PAID BY THE SETTLED TIME, AND THE TRAINING ITEMS AT 200%
--   (lane/c-training-gear, backend-architect, 2026-11-14; Tyler 2026-11-14, final: "Training should also be the same RATE for every
--   skill/level, not comparative to hunting grounds. The rate should be the same regardless of the characters skill or level", "i do
--   not want it to cost stamina", "training with the weapon should be 2:1", "all training weapons should be the same gold price", "we
--   can offer a training weapon option in the crowns store", "yes store bought items other than crowns are non tradable"; the
--   designer's numbers, PRIORITY_BOARD "2026-11-14 Training: one fixed rate, training items at 200%"; src/data/training.js).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §6. MONEY SURFACE (a gold purchase, an item turned into hours, a skill-XP rate): ON THE EA SECURITY LIST (§3.7).
-- ORDER: LAST of three, back to back. 2027-04-23-training-gear-items-catalogue.generated.sql (the sixteen items in hr_items), then
--   2027-04-23-training-gear-hunt-sessions-catalogue.generated.sql (hr_training_rules' rate, gate and item rate; hr_training_gear; the
--   per-skill share dropped: until THIS file lands, the live hr_training_quote and hr_training_window read that dropped column, so a
--   training start or settle is refused for the seconds between the two), then this file. §0 refuses without them.
-- EDGE: the hr-accrue carrying src/core/hunt/training.js (the time pay and the item's hours), combat-sim.js, member.js, action-rules.js,
--   abilities.js, accrual.js (the window's boost_ms) and hunt-settle.js (train_boost_ms) deploys RIGHT AFTER this file. An old engine pays
--   by the blow and claims no item time: its training windows are held to the fixed rate here and refused value_over above it, so a
--   training settle waits for the deploy (nothing is lost: the session's clock waits with it). CLIENT: after both.
-- THE SWITCH: the items sit behind the server switch `training_gear` (2027-03-21-feature-switches.sql), seeded OFF here (on conflict do
--   nothing, so a re-apply never reverts the Coordinator's flip). While it is off for an account: its buy, open and switch refuse
--   `feature_off`, and its heroes train at the plain rate whatever they hold (hr_training_gear_budget is 0). The fixed rate and the Level
--   gate are NOT behind it: they are the training rules from this file on.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- THE RATE (hr_training_window, hr_hunt_member_read; the engine's src/core/hunt/training.js trainingTick): a training session pays its
--   skill hr_training_rules.xp_per_hour (30,000) skill XP an hour of SETTLED time, boost_pm (2,000 permille) of it for the time a
--   training item's hours cover, at every skill level and every Level, the yard and the house dummy alike; never per blow, never Level
--   XP, coin, loot, kill or task credit (the allowlist below, unchanged), never stamina (2027-04-16-combat-training.sql). A hero trains
--   from hr_training_rules.min_level (10): hr_training_quote refuses `low_level` (with `level` and `need`) under it.
-- player_training_gear (user_id, slot, skill), NEW: the hours a hero's opened items left for one skill, banked_ms (opened_ms - spent_ms,
--   a CHECK), the "Use the training item" switch use_on (on by default), opened_at, updated_at. RLS on, the owner reads its own rows, no
--   client writes: only hr_training_gear_open / hr_training_gear_switch and the settle (hr_training_window). The hours never expire,
--   carry across sessions and days, and stay with the hero (an item has no per-piece data, so a part-used one can't be traded).
-- hr_training_gear_buy(p_slot int, p_item text, p_price_seen bigint, p_idem uuid) -> jsonb. Client verb (authenticated). The Arms Master:
--   ONE sealed gold row into the hero's bag at the server's price (hr_training_gear.price), re-quoted under the hero's lock.
--   ok: { ok, version, gold: -price, item, training }. Refusals, each charging nothing: not_signed_in, bad_slot, bad_idem, bad_quote,
--   bad_item (no training item), not_for_sale (a bound row: the Crowns store's), rate_limited, feature_off, no_character, quote_changed
--   { price } (the price the player saw is not the server's), buy_limit { today, max } (the ACCOUNT's buys this UTC day, from the
--   append-only ledger, under the account's sink key), and hr_apply's insufficient_gold / bag_full / intent_mismatch. ONE hr_apply on
--   the caller's key: gold -price, the item +1, journalled kind shop, intent training_gear_buy:<item>:<price>.
-- hr_training_gear_open(p_slot int, p_item text, p_idem uuid) -> jsonb. Client verb (authenticated). One sealed item of a skill, gold or
--   bound, from the hero's bag (else the account's Storage, under the depot key), into the hero's bank for that skill.
--   ok: { ok, version, item, skill, banked_ms, training }. Refusals: the shape ones, bad_item, rate_limited, feature_off, no_character,
--   still_open { banked_ms } (that skill's bank still holds hours: one open item a skill), none_held (neither the bag nor Storage holds
--   one), intent_mismatch. Journalled kind shop, intent training_gear_open:<item>, qty -1, meta { reason, skill, hours, from, banked_ms }.
-- hr_training_gear_switch(p_slot int, p_skill text, p_on boolean, p_idem uuid) -> jsonb. Client verb (authenticated). The hero's "Use the
--   training item" switch for one skill. Moves no value. Refusals: the shape ones, bad_skill, bad_switch, rate_limited, feature_off,
--   no_character, intent_mismatch.
-- THE SETTLE (hr_training_window RESTATED; hr_hunt_apply_member calls it before hr_apply writes a thing, and is NOT touched): a training
--   window may claim, in journal.meta.boost_ms, the ms it played at the item's rate. The claim is re-proved against the SERVER's bank:
--   at most the window, at most hr_training_gear_budget (0 while the switch or the feature is off; else the bank plus the sealed items of
--   that skill in the bag), else `session_moved` (the edge re-reads at once: an open, a switch or a bag move landed between its read and
--   its commit). The window's XP of the trained skill is at most floor((xp_per_hour x window + xp_per_hour x (boost_pm - 1000) / 1000 x
--   claim) / 1 h) + 1 (the carry), else `value_over`: the exact time bound. Then the claim is SPENT: the bank falls by it, and while it
--   can't cover the claim the next sealed item of that skill in the bag opens itself (the bound copy first, the smaller first), one
--   ledger row each (intent training_gear_open:<item>, meta.auto true). A replayed or empty window (p_to <= p_from) is answered by
--   hr_apply or refused by hr_hunt_settle_session: nothing is checked or spent for it.
-- hr_hunt_member_read RESTATED: every member's session carries train_boost_ms (hr_training_gear_budget of its trained skill; null on a
--   hunting ground), which the engine reads as the item time this window may play.
-- THE `training` SECTION (hr_training_section RESTATED, every key it had kept): + rate { xp_h, xp_h_item, boost_pm, min_level, level },
--   quotes[].xp_h is the rate the hero trains that skill at now (the item's while its hours last and the switch is on), and
--   hours_to_next follows it; + gear: [{ skill, banked_ms, on, bag: [{ item, hours, bound, qty }], stored: [{ item, hours, bound, qty }] }]
--   (in the data's skill order); + offers: [{ item, skill, hours, price }] (the Arms Master's gold rows), + shop { on (the switch, for
--   this account), today, max } ; run gains boosted (its skill's item time is running) and boost_ms (that budget).
-- THE CROWNS PURCHASE, SPECIFIED, NOT BUILT (no Crowns ledger exists: no migration creates a Crowns balance or journal). When it lands:
--   hr_crown_store_buy(p_item text, p_price_seen bigint, p_idem uuid) -> jsonb, the stamina-refill shape: the price from a server catalogue
--   (hr_crown_store_items, generated from a data file, never the client), re-quoted, quote_changed { price } if it moved; the account's
--   Crowns debited in an append-only Crowns ledger row and the BOUND item credited to the account's Storage in the same transaction;
--   hr_apply-style idempotency on the key, a per-minute bucket and a per-day clamp (10 a day to start); refused `crowns_closed` while the
--   ledger isn't live. It sells only hr_training_gear rows with bound = true (and any later bound row): Tyler 2026-11-14, everything
--   bought with Crowns is bound to the account; Crowns alone trade. The price is Tyler's (the designer's floor: never under the gold
--   price at the market's Crown-for-gold rate).
-- BOUND NEVER TRADES (no new code, the rows' shape): a bound row is hr_items.tradeable false and value 0 (the items catalogue), so the
--   market's one listable rule (hr_market_items, 2027-01-12-market-account.sql) refuses it `not_tradeable` (why untradeable) on list, buy
--   and every read; it has no shop bid (hr_hunt_vendor_value: the vendor never buys it) and no Dispatch-loot sale. The market is the one
--   surface that moves an item between accounts today (no player trade, gift or cross-account dispatch exists); §6(d) proves it on the
--   rows and tests/training-gear-db.mjs TG-BOUND proves it through the market's own verbs.
--
-- ── CONCURRENCY AND IDEMPOTENCY ───────────────────────────────────────────────
-- buy: hr_intent_replay first; the hero (hr_hunt_lock), then the account's sink key (hr_sink_lock: two heroes buying together read one
--   day's count), then hr_apply (the purse, the bag, the key's player_intents row): hero -> sink -> purse, as every sink verb. A replay
--   answers its stored receipt and charges once.
-- open: hr_intent_replay first, again under the hero's lock (two presses on one key: the second finds the first's receipt); then, only
--   for Storage, the account's depot key (hr_bank_move's order: hero -> depot). The bank row, the bag or Storage row, the ledger row, the
--   version and the key's receipt move in one transaction.
-- switch: the scaled-hunts switch's shape (sets a value; the key's receipt).
-- the settle: inside hr_hunt_apply_member, under the hero's lock and the purses hr_hunt_apply_instance took: it writes this hero's bank
--   row, bag rows and ledger rows only (never the depot, never another hero), the same order as the verbs (hero, then its rows). The claim
--   is checked against a read made under that lock; a window lands at most once (the settle's own key and the session's CAS).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- Three client verbs. No client value prices or sizes anything: p_price_seen is only compared with the catalogue's price; the item is
--   a catalogue id; one item a call, ten an account a UTC day. Gold only leaves (a sink); a sealed gold item sells back to the shop for 1%
--   of its price and on the market for at most the Arms Master's own price (the ceiling); a bound item never sells or lists. The time
--   bound is exact: a compromised engine can't train faster than 30,000 an hour (60,000 for the item time the SERVER's bank covers, and
--   only that time is spent), nor pay any other key. The pay-to-rank note (skill boards rank partly by gold and Crowns spent) is the
--   designer's, accepted by Tyler (pay-to-win), flagged for the EA review.
--
-- ── COST (100x players) ──────────────────────────────────────────────────────
-- player_training_gear: at most 4 rows a hero (a skill each): 400 heroes x 4 = 1,600 rows, ~120 KB. A purchase or an open is ONE ledger row;
--   spending writes no row (the bank row's spent_ms is the aggregate), an automatic open one row per item (at most two a 24 h of
--   training). Per settle of ANY hunt: one primary-key probe of hr_training_grounds in hr_hunt_member_read (8 rows), nothing else for a
--   hunting ground. Per training settle: the budget (one bank row, the bag's few training rows, the switch row) in the read and again in
--   the commit, one bank update when boosted. Per envelope: the section reads the hero's 4 bank rows, its bag and the account's Storage
--   for the 16 training ids, and the day's buys only when the switch is on.
--
-- REVERSIBILITY: restate hr_training_quote, hr_training_window, hr_training_section and hr_hunt_member_read from their pre-images (§0's
-- md5s are production's, tests/live-hash-drift.baseline.json; the images are in 2027-04-16-combat-training.sql and
-- 2026-11-07-store-by-slot.sql), drop the three verbs, the three helpers, player_training_gear (its rows go with the character wipe),
-- the three baseline rows, the wall row and the switch row; the two catalogues' rows are replaced by the next generated files. No
-- begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each restated body is exactly the image this file was written against (production's, tests/live-hash-drift.baseline.json measured
-- 2026-11-14), or this file's own (a second apply): md5 of pg_get_functiondef with every run of whitespace one space.
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hr_training_gear') is null or (select count(*) from public.hr_training_gear) = 0
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_training_rules' and column_name = 'xp_per_hour')
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_training_grounds' and column_name = 'xp_permille') then
    raise exception 'PRECONDITION: apply 2027-04-23-training-gear-hunt-sessions-catalogue.generated.sql first (hr_training_gear, the rate, the share dropped)'; end if;
  if exists (select 1 from public.hr_training_gear g where not exists (select 1 from public.hr_items i where i.item_id = g.item_id)) then
    raise exception 'PRECONDITION: apply 2027-04-23-training-gear-items-catalogue.generated.sql first (the training items in hr_items)'; end if;
  if to_regprocedure('public.hr_feature_on(text,uuid)') is null or to_regclass('public.hr_feature_switches') is null
     or to_regprocedure('public.hr_level_of(uuid,integer)') is null or to_regprocedure('public.hr_sink_lock(uuid)') is null
     or to_regprocedure('public.hr_utc_day_start(timestamp with time zone)') is null or to_regprocedure('public.hr_training_fee(integer)') is null
     or to_regclass('public.account_bank') is null or to_regclass('public.hr_client_rpc_baseline') is null or to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: a helper or table this file calls is missing'; end if;
  for v_r in select * from (values
    ('public.hr_training_quote(uuid,integer,text,text)', '2bbfea96fad5c835318f5a257ced5d7e', '96f6ff5050f6b80466ca802da5f1ec7c'),
    ('public.hr_training_window(uuid,integer,text,timestamp with time zone,timestamp with time zone,jsonb)', 'a396047961d1fccbd116c392c8bbc3db', 'f946c6985e9d5ef43831489646ac9cc9'),
    ('public.hr_training_section(uuid,integer)', '24b243ffdf16736de5f987eced185a86', '6bc2a9f36cc4142dd6a8116020723d81'),
    ('public.hr_hunt_member_read(public.hunt_sessions)', '14cd77882a9bfba0be7624652017aaf6', 'a34a1041fb1d9762d4eaac94d9b91c48')) t(fn, pre, post) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its live pre-image (%) nor this file''s image (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE BANK AND THE SWITCH ───────────────────────────────────────────────
create table if not exists public.player_training_gear (
  user_id    uuid        not null,
  slot       int         not null,
  skill      text        not null check (skill ~ '^[a-z0-9_]{1,64}$'),
  banked_ms  bigint      not null default 0 check (banked_ms >= 0),
  opened_ms  bigint      not null default 0 check (opened_ms >= 0),
  spent_ms   bigint      not null default 0 check (spent_ms >= 0),
  use_on     boolean     not null default true,
  opened_at  timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot, skill),
  constraint player_training_gear_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade,
  constraint player_training_gear_books_ck check (banked_ms = opened_ms - spent_ms)
);
comment on table public.player_training_gear is
  '2027-04-23-training-gear.sql (Tyler 2026-11-14): the hours a hero''s opened training items left for one combat skill (banked = opened - spent) '
  'and its "Use the training item" switch. Written ONLY by hr_training_gear_open, hr_training_gear_switch and the settle (hr_training_window); character wipe: c_wipe.';
alter table public.player_training_gear enable row level security;
revoke all on public.player_training_gear from public, anon, authenticated, service_role;
grant select on public.player_training_gear to authenticated;
drop policy if exists "player_training_gear own read" on public.player_training_gear;
create policy "player_training_gear own read" on public.player_training_gear for select
  using ((select auth.uid()) = user_id);

insert into public.hr_feature_switches (switch_id, scope, note) values
  ('training_gear', 'off', '2027-04-23-training-gear.sql: the training items (buy, open, switch, and the item time a settle may claim); off = refused and plain-rate training')
  on conflict (switch_id) do nothing;

-- ── §2 THE HELPERS (owner-only) ──────────────────────────────────────────────
-- THE SEALED HOURS: the ms of every sealed item of p_skill in the hero's bag (Storage's never open by themselves).
create or replace function public.hr_training_gear_sealed_ms(p_user uuid, p_slot int, p_skill text)
returns bigint language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  return coalesce((select sum(i.qty * g.hours_ms) from public.hr_training_gear g
                     join public.player_inventory i on i.user_id = p_user and i.slot = p_slot and i.item_id = g.item_id
                    where g.skill = p_skill and i.qty > 0), 0)::bigint;
end $fn$;

-- THE ITEM TIME A WINDOW MAY PLAY: 0 while the account's switch `training_gear` or the hero's own switch for the skill is off; else the
-- bank plus the sealed hours in the bag (the settle opens the next as the bank runs dry). Read by hr_hunt_member_read and the settle.
create or replace function public.hr_training_gear_budget(p_user uuid, p_slot int, p_skill text)
returns bigint language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_g public.player_training_gear%rowtype;
begin
  if p_user is null or p_skill is null or not public.hr_feature_on('training_gear', p_user) then return 0; end if;
  select * into v_g from public.player_training_gear where user_id = p_user and slot = p_slot and skill = p_skill;
  if found and not v_g.use_on then return 0; end if;
  return coalesce(v_g.banked_ms, 0) + public.hr_training_gear_sealed_ms(p_user, p_slot, p_skill);
end $fn$;

-- ONE SEALED ITEM INTO THE BANK: p_item taken from the hero's bag ('bag') or the account's Storage ('storage'; the caller holds the
-- depot key), its hours credited to the hero's bank for its skill, one ledger row. Answers the bank after it, or null when the source
-- holds none. The caller holds the hero's lock (the verb) or runs inside the settle (which holds it).
create or replace function public.hr_training_gear_take(p_user uuid, p_slot int, p_item text, p_from text, p_auto boolean, p_session uuid)
returns bigint language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_g public.hr_training_gear%rowtype; v_bank bigint;
begin
  select * into v_g from public.hr_training_gear where item_id = p_item;
  if not found then return null; end if;
  if p_from = 'bag' then
    update public.player_inventory set qty = qty - 1 where user_id = p_user and slot = p_slot and item_id = p_item and qty > 1;
    if not found then
      delete from public.player_inventory where user_id = p_user and slot = p_slot and item_id = p_item and qty = 1;
      if not found then return null; end if;
    end if;
  elsif p_from = 'storage' then
    update public.account_bank set qty = qty - 1, updated_at = now() where user_id = p_user and item_id = p_item and qty > 1;
    if not found then
      delete from public.account_bank where user_id = p_user and item_id = p_item and qty = 1;
      if not found then return null; end if;
    end if;
  else
    return null;
  end if;
  insert into public.player_training_gear as t (user_id, slot, skill, banked_ms, opened_ms, spent_ms, use_on, opened_at, updated_at)
    values (p_user, p_slot, v_g.skill, v_g.hours_ms, v_g.hours_ms, 0, true, now(), now())
    on conflict (user_id, slot, skill) do update
      set banked_ms = t.banked_ms + excluded.banked_ms, opened_ms = t.opened_ms + excluded.opened_ms, opened_at = now(), updated_at = now()
    returning t.banked_ms into v_bank;
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
    values (p_user, p_slot, 'shop', 'training_gear_open:' || p_item, p_item, -1,
            jsonb_build_object('reason', 'training_gear_open', 'skill', v_g.skill, 'hours', v_g.hours_ms / 3600000, 'bound', v_g.bound,
                               'from', p_from, 'auto', coalesce(p_auto, false), 'banked_ms', v_bank)
            || case when p_session is null then '{}'::jsonb else jsonb_build_object('session', p_session) end);
  return v_bank;
end $fn$;

revoke execute on function public.hr_training_gear_sealed_ms(uuid, int, text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_training_gear_budget(uuid, int, text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_training_gear_take(uuid, int, text, text, boolean, uuid) from public, anon, authenticated, service_role;

-- ── §3 THE RESTATED BODIES ───────────────────────────────────────────────────
-- (a) THE QUOTE (2027-04-16-combat-training.sql's, with the Level gate first and the fixed rate where the share was).
create or replace function public.hr_training_quote(p_user uuid, p_slot int, p_skill text, p_place text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_t public.hr_training_grounds%rowtype; v_r public.hr_training_rules%rowtype; v_lv int; v_price bigint; v_why text;
  v_owned boolean := false; v_busy text; v_level int;
begin
  select * into v_t from public.hr_training_grounds where place = p_place and skill = p_skill;
  if not found then return null; end if;
  select * into v_r from public.hr_training_rules where id;
  v_lv := public.hr_skill_level(v_t.skill, coalesce((select ps.xp from public.player_skills ps
                                                      where ps.user_id = p_user and ps.slot = p_slot and ps.skill_id = v_t.skill), 0));
  v_price := case when v_t.fee then public.hr_training_fee(v_lv) else 0 end;
  -- TRAINING-GEAR (2027-04-23-training-gear.sql): a hero trains from the rules' Level (the first hour stays a hunting hour).
  v_level := coalesce(public.hr_level_of(p_user, p_slot), 1);
  if v_t.place = 'house' then
    v_owned := exists (select 1 from public.account_house_dummy d where d.user_id = p_user and d.skill = v_t.skill);
    -- ONE HERO ON THE DUMMY: another hero of the account training on any house ground holds it (this hero's own open session is
    -- hr_hunt_enter_for's hunt_open, said there).
    select coalesce(public.hr_character_name(h.user_id, h.slot), 'slot ' || h.slot) into v_busy
      from public.hunt_sessions h join public.hr_training_grounds g on g.hunt_id = h.hunt_id and g.place = 'house'
     where h.user_id = p_user and h.slot <> p_slot and h.ended_at is null
     order by h.slot limit 1;
  end if;
  v_why := case when v_level < v_r.min_level then 'low_level'
                when public.hr_hunt_party_of(p_user, p_slot) is not null then 'in_party'
                when v_t.place = 'house' and public.hr_account_property_tier(p_user) < v_r.house_tier then 'no_home'
                when v_t.place = 'house' and not v_owned then 'not_owned'
                when v_t.place = 'house' and v_busy is not null then 'dummy_busy' end;
  return jsonb_build_object('hunt', v_t.hunt_id, 'place', v_t.place, 'skill', v_t.skill, 'level', v_lv, 'price', v_price,
                            'per_hour', v_t.fee, 'max_hours', v_r.max_hours, 'xp_per_hour', v_r.xp_per_hour,
                            'hero_level', v_level, 'need', v_r.min_level,
                            'available', v_why is null, 'why', v_why, 'busy', v_busy);
end $fn$;

-- (b) THE WINDOW: what a training window may say (the allowlist, unchanged), the exact time bound with the item's rate read from the
--     SERVER's bank, and the item time it played SPENT (opening the next sealed item of that skill in the bag as the bank runs dry).
--     Raises (hr_reject): training_pays (a key, a skill, a kill, a progress op it may not carry, a malformed or over-long claim),
--     value_over (past the time bound), session_moved (the claim is over the item time the server holds now: the edge re-reads).
create or replace function public.hr_training_window(p_user uuid, p_slot int, p_hunt text, p_from timestamptz, p_to timestamptz, p_delta jsonb)
returns void language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_t public.hr_training_grounds%rowtype; v_r public.hr_training_rules%rowtype; v_k text; v_win bigint; v_cap numeric; v_xp numeric;
  v_claim bigint := 0; v_bank bigint; v_item text; v_sid uuid;
begin
  select * into v_t from public.hr_training_grounds where hunt_id = p_hunt;
  if not found then return; end if;
  -- A WINDOW THAT DOESN'T MOVE THE SESSION ON is a replay hr_apply answers, or one hr_hunt_settle_session refuses (bad_window, a raise that
  -- rolls hr_apply back): nothing to check or spend for it.
  if p_from is null or p_to is null or p_to <= p_from then return; end if;
  select * into v_r from public.hr_training_rules where id;
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
  -- TRAINING-GEAR (2027-04-23-training-gear.sql): THE ITEM TIME the window claims it played (journal.meta.boost_ms), a whole ms inside it.
  v_win := floor(extract(epoch from (p_to - p_from)) * 1000)::bigint;
  if (p_delta->'journal'->'meta') ? 'boost_ms' then
    if jsonb_typeof(p_delta->'journal'->'meta'->'boost_ms') <> 'number' or (p_delta->'journal'->'meta'->>'boost_ms') !~ '^[0-9]{1,12}$' then
      perform public.hr_reject('training_pays', jsonb_build_object('hunt', p_hunt, 'what', 'boost_shape')); end if;
    v_claim := (p_delta->'journal'->'meta'->>'boost_ms')::bigint;
  end if;
  if v_claim > v_win then
    perform public.hr_reject('training_pays', jsonb_build_object('hunt', p_hunt, 'what', 'boost_over', 'boost_ms', v_claim, 'window_ms', v_win)); end if;
  -- THE TIME BOUND, EXACT: the rate over the window, the item's extra over the claimed time, the floor, and one for the carry.
  v_cap := floor((v_r.xp_per_hour::numeric * v_win + v_r.xp_per_hour::numeric * (v_r.boost_pm - 1000) / 1000 * v_claim) / 3600000) + 1;
  v_xp := coalesce((p_delta->'xp'->>v_t.skill)::numeric, 0);
  if v_cap is null or v_xp > v_cap then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'training', 'skill', v_t.skill, 'xp', v_xp, 'max', v_cap, 'window_ms', v_win,
                                                              'boost_ms', v_claim)); end if;
  if v_claim = 0 then return; end if;
  -- THE CLAIM IS THE SERVER'S TO GIVE: at most the item time it holds now (the switches on, the bank and the sealed items in the bag).
  if v_claim > public.hr_training_gear_budget(p_user, p_slot, v_t.skill) then
    perform public.hr_reject('session_moved', jsonb_build_object('why', 'training_gear', 'boost_ms', v_claim)); end if;
  -- THE SPEND: the next sealed item opens itself while the bank can't cover the claim (the bound copy first, then the smaller).
  select id into v_sid from public.hunt_sessions where user_id = p_user and slot = p_slot and ended_at is null;
  select g.banked_ms into v_bank from public.player_training_gear g where g.user_id = p_user and g.slot = p_slot and g.skill = v_t.skill for update;
  v_bank := coalesce(v_bank, 0);
  while v_bank < v_claim loop
    select g.item_id into v_item from public.hr_training_gear g
      join public.player_inventory i on i.user_id = p_user and i.slot = p_slot and i.item_id = g.item_id and i.qty > 0
     where g.skill = v_t.skill order by g.bound desc, g.hours_ms, g.item_id limit 1;
    v_bank := case when v_item is null then null else public.hr_training_gear_take(p_user, p_slot, v_item, 'bag', true, v_sid) end;
    if v_bank is null then perform public.hr_reject('session_moved', jsonb_build_object('why', 'training_gear', 'boost_ms', v_claim)); end if;
    v_item := null;
  end loop;
  update public.player_training_gear set banked_ms = banked_ms - v_claim, spent_ms = spent_ms + v_claim, updated_at = now()
   where user_id = p_user and slot = p_slot and skill = v_t.skill;
end $fn$;

-- (c) THE ENGINE'S READ OF A MEMBER (2026-11-07-store-by-slot.sql's image, pg_get_functiondef's own text, with ONE key: train_boost_ms).
CREATE OR REPLACE FUNCTION public.hr_hunt_member_read(p_s hunt_sessions)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select jsonb_build_object(
    'id', p_s.id, 'hunt', p_s.hunt_id, 'preset', p_s.preset, 'version', p_s.version,
    'hunt_from_ms', ceil(extract(epoch from p_s.hunt_from) * 1000)::bigint,
    'settled_to_ms', ceil(extract(epoch from p_s.settled_to) * 1000)::bigint,
    'next_swing_at_ms', ceil(extract(epoch from p_s.next_swing_at) * 1000)::bigint,
    'swing_index', p_s.swing_index,
    'hours_limit', p_s.hours_limit,
    'leave_at_ms', case when p_s.leave_at is null then null else ceil(extract(epoch from p_s.leave_at) * 1000)::bigint end,
    'change_at_ms', case when p_s.change_at is null then null else ceil(extract(epoch from p_s.change_at) * 1000)::bigint end,
    'change_to', p_s.change_to,
    'bag', coalesce((select jsonb_object_agg(b.item_id, jsonb_build_object(
                       'loaded', b.qty_loaded, 'left', b.qty_left, 'essential', b.essential))
                     from public.hunt_bag b where b.session_id = p_s.id), '{}'::jsonb),
    'enabled', coalesce((select c.enabled from public.hr_hunt_config c where c.id), false),
    -- THE STAMINA POOL AT THE WINDOW START and the cap it rests to (premium).
    'stamina_ms', public.hr_stamina_of(p_s.user_id, p_s.slot, p_s.settled_to),
    'stamina_max_ms', public.hr_stamina_cap(p_s.user_id, p_s.slot, p_s.settled_to),
    -- TRAINING-GEAR (2027-04-23-training-gear.sql): on a training ground, the item time this window may play (hr_training_gear_budget of
    -- its trained skill); null on any other ground.
    'train_boost_ms', (select public.hr_training_gear_budget(p_s.user_id, p_s.slot, t.skill) from public.hr_training_grounds t where t.hunt_id = p_s.hunt_id),
    -- THE STORE (catalogue). STORE-BY-SLOT (2026-11-04): a bar slot names the ONE item a
    -- use spends (Tyler 2026-10-21); no hunt tier picks one.
    'basics', coalesce((select jsonb_object_agg(b.basic_id, jsonb_build_object('kind', b.kind, 'price', b.price,
                          'heals', b.heals, 'mana', b.mana, 'partner', b.partner))
                          from public.hr_hunt_basic_supplies b), '{}'::jsonb),
    -- THE HERO'S SETTINGS (options) and BAR, its supply setting and floor.
    'options', coalesce((select a.options from public.player_action_sets a
                          where a.user_id = p_s.user_id and a.slot = p_s.slot and a.preset = p_s.preset), '{}'::jsonb),
    'bar', coalesce((select a.slots from public.player_action_sets a
                      where a.user_id = p_s.user_id and a.slot = p_s.slot and a.preset = p_s.preset), '[]'::jsonb),
    'gold_floor', (public.hr_hunt_supply_of(p_s.user_id, p_s.slot, p_s.preset)->>'gold_floor')::bigint,
    'supply_source', public.hr_hunt_supply_of(p_s.user_id, p_s.slot, p_s.preset)->>'supply_source',
    'on_empty', public.hr_hunt_supply_of(p_s.user_id, p_s.slot, p_s.preset)->>'on_empty',
    -- WHAT SELL-TO-COVER MAY SELL: this session's own loot of the cover items, still in the bag.
    'cover', coalesce((select jsonb_object_agg(c.item_id, jsonb_build_object('unit', c.unit,
                 'avail', greatest(0, least(
                   coalesce((select pi.qty from public.player_inventory pi
                              where pi.user_id = p_s.user_id and pi.slot = p_s.slot and pi.item_id = c.item_id), 0),
                   coalesce((t.loot->>c.item_id)::numeric, 0)::bigint - coalesce((t.covered->>c.item_id)::bigint, 0)))))
                 from public.hr_hunt_cover_items c
                 left join public.hunt_session_tally t on t.session_id = p_s.id
                -- NEVER A LOCKED ITEM (hook: hr_item_locked, 2026-10-25-bag-rules.sql).
                where not public.hr_item_locked(p_s.user_id, p_s.slot, c.item_id)), '{}'::jsonb))
$function$;

-- (d) THE `training` SECTION (2027-04-16-combat-training.sql's, every key kept; the rate, the items and the hours left added).
create or replace function public.hr_training_section(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_r public.hr_training_rules%rowtype; v_run jsonb; v_last jsonb; v_quotes jsonb; v_skills jsonb; v_dummy jsonb; v_busy text; v_bought int;
  v_s record; v_on boolean; v_gear jsonb; v_rate jsonb; v_level int; v_today int;
begin
  select * into v_r from public.hr_training_rules where id;
  if not found then return null; end if;
  -- TRAINING-GEAR (2027-04-23-training-gear.sql): THE RATE, the same for every skill and Level; the item's while its hours last.
  v_on := public.hr_feature_on('training_gear', p_user);
  v_level := coalesce(public.hr_level_of(p_user, p_slot), 1);
  v_rate := jsonb_build_object('xp_h', v_r.xp_per_hour, 'xp_h_item', v_r.xp_per_hour::bigint * v_r.boost_pm / 1000, 'boost_pm', v_r.boost_pm,
                               'min_level', v_r.min_level, 'level', v_level);
  -- THE YARD'S QUOTES, in the data's order: the fee at the hero's level now, the rate it trains that skill at now (the item's while the
  -- item time this hero holds for it lasts) and the hours that rate takes to the skill's next level.
  select coalesce(jsonb_agg(q.skill order by q.ord), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('skill', q.skill, 'level', q.lv, 'fee_h', public.hr_training_fee(q.lv), 'xp_h', q.xp_h,
                     'hours_to_next', ceil(greatest(0, public.hr_skill_xp_for_level(q.skill, q.lv + 1) - q.xp)::numeric / q.xp_h)::int)
                   order by q.ord), '[]'::jsonb)
    into v_skills, v_quotes
    from (select g.skill, g.ord, x.xp, public.hr_skill_level(g.skill, x.xp) as lv,
                 case when public.hr_training_gear_budget(p_user, p_slot, g.skill) > 0 then v_r.xp_per_hour::bigint * v_r.boost_pm / 1000
                      else v_r.xp_per_hour::bigint end as xp_h
            from public.hr_training_grounds g
            cross join lateral (select coalesce((select ps.xp from public.player_skills ps
                                                  where ps.user_id = p_user and ps.slot = p_slot and ps.skill_id = g.skill), 0) as xp) x
           where g.place = 'yard') q;
  -- THE ITEMS THIS HERO HOLDS, a skill each in the data's order: its bank and switch, the sealed ones in its bag and in the account's Storage.
  select coalesce(jsonb_agg(jsonb_build_object('skill', g.skill, 'banked_ms', coalesce(b.banked_ms, 0), 'on', coalesce(b.use_on, true),
           'bag', coalesce((select jsonb_agg(jsonb_build_object('item', t.item_id, 'hours', t.hours_ms / 3600000, 'bound', t.bound, 'qty', i.qty)
                                             order by t.bound desc, t.hours_ms, t.item_id)
                              from public.hr_training_gear t join public.player_inventory i on i.user_id = p_user and i.slot = p_slot and i.item_id = t.item_id
                             where t.skill = g.skill and i.qty > 0), '[]'::jsonb),
           'stored', coalesce((select jsonb_agg(jsonb_build_object('item', t.item_id, 'hours', t.hours_ms / 3600000, 'bound', t.bound, 'qty', a.qty)
                                                order by t.bound desc, t.hours_ms, t.item_id)
                                 from public.hr_training_gear t join public.account_bank a on a.user_id = p_user and a.item_id = t.item_id
                                where t.skill = g.skill and a.qty > 0), '[]'::jsonb))
           order by g.ord), '[]'::jsonb)
    into v_gear
    from public.hr_training_grounds g
    left join public.player_training_gear b on b.user_id = p_user and b.slot = p_slot and b.skill = g.skill
   where g.place = 'yard';
  -- THE ARMS MASTER'S DAY: the account's buys since the UTC day began (only read while the switch is on). A buy moves gold, so the
  -- account's gold rows of today are the range read (player_ledger_gold_idx: user, at, where gold <> 0).
  v_today := case when v_on then (select count(*) from public.player_ledger l
                                   where l.user_id = p_user and l.gold <> 0 and l.at >= public.hr_utc_day_start(now())
                                     and l.kind = 'shop' and l.intent like 'training\_gear\_buy:%')::int else 0 end;
  -- THE RUN: this hero's open training session, its hourly price now and the gold its fee rows took (the session named in their meta).
  select h.id, h.entered_at, h.hunt_from, g.skill, g.place, g.fee into v_s
    from public.hunt_sessions h join public.hr_training_grounds g on g.hunt_id = h.hunt_id
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is null;
  if found then
    v_run := jsonb_build_object('skill', v_s.skill, 'where', v_s.place, 'since', v_s.hunt_from,
      'fee_h', case when v_s.fee then (select (q->>'fee_h')::bigint from jsonb_array_elements(v_quotes) q where q->>'skill' = v_s.skill) else 0 end,
      'paid', coalesce((select -sum(l.gold) from public.player_ledger l
                         where l.user_id = p_user and l.slot = p_slot and l.at >= v_s.entered_at and l.kind = 'shop'
                           and l.intent like 'training\_%' and l.meta->>'session' = v_s.id::text), 0),
      'boost_ms', public.hr_training_gear_budget(p_user, p_slot, v_s.skill),
      'boosted', public.hr_training_gear_budget(p_user, p_slot, v_s.skill) > 0);
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
  return jsonb_build_object('skills', v_skills, 'max_hours', v_r.max_hours, 'quotes', v_quotes, 'run', v_run, 'last_stop', v_last, 'dummy', v_dummy,
    'rate', v_rate, 'gear', v_gear,
    'offers', coalesce((select jsonb_agg(jsonb_build_object('item', t.item_id, 'skill', t.skill, 'hours', t.hours_ms / 3600000, 'price', t.price)
                                         order by g.ord, t.hours_ms)
                          from public.hr_training_gear t join public.hr_training_grounds g on g.skill = t.skill and g.place = 'yard'
                         where not t.bound), '[]'::jsonb),
    'shop', jsonb_build_object('on', v_on, 'today', v_today, 'max', v_r.buy_per_day));
end $fn$;
revoke execute on function public.hr_training_section(uuid, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_training_quote(uuid, int, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_training_window(uuid, int, text, timestamptz, timestamptz, jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.hr_hunt_member_read(public.hunt_sessions) from public, anon, authenticated, service_role;

-- ── §4 THE VERBS ─────────────────────────────────────────────────────────────
create or replace function public.hr_training_gear_buy(p_slot int, p_item text, p_price_seen bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'training_gear_buy';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_a jsonb; v_g public.hr_training_gear%rowtype; v_max int; v_today int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price_seen is null or p_price_seen < 1 or p_price_seen > 1000000000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  select * into v_g from public.hr_training_gear where item_id = p_item;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_item')); end if;
  -- THE CROWNS STORE'S COPY is never sold for gold (and the gold row never for Crowns).
  if v_g.bound or v_g.price is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_for_sale')); end if;
  -- The key names the whole purchase (item and price): a replay answers its own receipt, another purchase under it is intent_mismatch.
  v_verb := c_verb || ':' || p_item || ':' || p_price_seen;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_feature_on('training_gear', v_uid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'feature_off')); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  -- THE KEY AGAIN, UNDER THE LOCK (2027-04-19-key-under-lock.sql): a second press on one key waited here and answers the first's receipt.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- THE ACCOUNT'S SINK KEY, after the hero's lock and before hr_apply: two heroes of one account read one day's count.
  perform public.hr_sink_lock(v_uid);
  -- THE QUOTE, under the locks, from the server's own row: never the client's number.
  if v_g.price <> p_price_seen then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'price', v_g.price)); end if;
  -- THE DAY: every hero of the account together, counted from the append-only ledger.
  select r.buy_per_day into v_max from public.hr_training_rules r where r.id;
  -- (a buy moves gold: the account's gold rows of today are the range read, player_ledger_gold_idx)
  v_today := (select count(*) from public.player_ledger l
               where l.user_id = v_uid and l.gold <> 0 and l.at >= public.hr_utc_day_start(now())
                 and l.kind = 'shop' and l.intent like 'training\_gear\_buy:%')::int;
  if v_today >= v_max then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'buy_limit', 'today', v_today, 'max', v_max)); end if;
  -- THE GOLD AND THE ITEM, one apply on the caller's key (the purse and the bag; bag_full and insufficient_gold are hr_apply's).
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'gold', -v_g.price,
           'items', jsonb_build_object(p_item, 1),
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', c_verb, 'item', p_item, 'skill', v_g.skill,
                                                                    'hours', v_g.hours_ms / 3600000, 'price', v_g.price))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_note_rejection(c_verb, p_slot, v_a || jsonb_build_object('ok', false, 'price', v_g.price, 'purse', public.hr_purse_of(v_uid))); end if;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -v_g.price, 'item', p_item,
                            'training', public.hr_training_section(v_uid, p_slot));
end $fn$;

create or replace function public.hr_training_gear_open(p_slot int, p_item text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'training_gear_open';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_g public.hr_training_gear%rowtype; v_bank bigint; v_from text; v_ver bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  select * into v_g from public.hr_training_gear where item_id = p_item;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_item')); end if;
  v_verb := c_verb || ':' || p_item;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_feature_on('training_gear', v_uid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'feature_off')); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- THE KEY AGAIN, UNDER THE LOCK: a second press on one key waited here and finds the first's receipt.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  -- ONE OPEN ITEM A SKILL: hours still banked for it refuse a second (the next one opens itself as they run out).
  v_bank := coalesce((select g.banked_ms from public.player_training_gear g where g.user_id = v_uid and g.slot = p_slot and g.skill = v_g.skill), 0);
  if v_bank > 0 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'still_open', 'skill', v_g.skill, 'banked_ms', v_bank)); end if;
  -- THE BAG FIRST, THEN THE ACCOUNT'S STORAGE (under the depot key, after the hero's: hr_bank_move's order).
  v_from := 'bag';
  v_bank := public.hr_training_gear_take(v_uid, p_slot, p_item, 'bag', false, null);
  if v_bank is null then
    perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));
    v_from := 'storage';
    v_bank := public.hr_training_gear_take(v_uid, p_slot, p_item, 'storage', false, null);
  end if;
  if v_bank is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'none_held', 'item', p_item)); end if;
  update public.player_state set version = version + 1, updated_at = now() where user_id = v_uid and slot = p_slot returning version into v_ver;
  v_r := jsonb_build_object('ok', true, 'version', v_ver, 'item', p_item, 'skill', v_g.skill, 'from', v_from, 'banked_ms', v_bank);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r || jsonb_build_object('training', public.hr_training_section(v_uid, p_slot));
end $fn$;

create or replace function public.hr_training_gear_switch(p_slot int, p_skill text, p_on boolean, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'training_gear_switch';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_on is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_switch')); end if;
  if not exists (select 1 from public.hr_training_gear g where g.skill = p_skill) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_skill')); end if;
  v_verb := c_verb || ':' || p_skill || ':' || p_on;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_feature_on('training_gear', v_uid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'feature_off')); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  insert into public.player_training_gear as t (user_id, slot, skill, use_on, updated_at)
    values (v_uid, p_slot, p_skill, p_on, now())
    on conflict (user_id, slot, skill) do update set use_on = excluded.use_on, updated_at = now();
  v_r := jsonb_build_object('ok', true, 'skill', p_skill, 'on', p_on);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r || jsonb_build_object('training', public.hr_training_section(v_uid, p_slot));
end $fn$;

revoke execute on function public.hr_training_gear_buy(int, text, bigint, uuid) from public;
revoke execute on function public.hr_training_gear_buy(int, text, bigint, uuid) from anon, service_role;
grant  execute on function public.hr_training_gear_buy(int, text, bigint, uuid) to authenticated;
revoke execute on function public.hr_training_gear_open(int, text, uuid) from public;
revoke execute on function public.hr_training_gear_open(int, text, uuid) from anon, service_role;
grant  execute on function public.hr_training_gear_open(int, text, uuid) to authenticated;
revoke execute on function public.hr_training_gear_switch(int, text, boolean, uuid) from public;
revoke execute on function public.hr_training_gear_switch(int, text, boolean, uuid) from anon, service_role;
grant  execute on function public.hr_training_gear_switch(int, text, boolean, uuid) to authenticated;

-- ── §5 THE CLIENT BASELINE AND THE WALL ──────────────────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_training_gear_buy', 'hr_training_gear_open', 'hr_training_gear_switch');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_training_gear_buy', 'p_slot integer, p_item text, p_price_seen bigint, p_idem uuid', 'authenticated',
   'added 2027-04-23 (lane/c-training-gear): MONEY (a gold sink) - one sealed training item from the Arms Master at the server''s flat price into the bag; refuses quote_changed, a bound row, past the account''s day; pre-EA Security list'),
  ('hr_training_gear_open', 'p_slot integer, p_item text, p_idem uuid', 'authenticated',
   'added 2027-04-23 (lane/c-training-gear): MONEY (an item turned into training hours) - one sealed training item from the bag or Storage into the hero''s bank for its skill; refuses still_open; pre-EA Security list'),
  ('hr_training_gear_switch', 'p_slot integer, p_skill text, p_on boolean, p_idem uuid', 'authenticated',
   'added 2027-04-23 (lane/c-training-gear): the hero''s own "Use the training item" switch for one skill; moves no value');
do $mig$
begin
  if to_regclass('public.hr_gm_wall_allow') is not null then
    insert into public.hr_gm_wall_allow (rpc, why) values ('hr_training_gear_switch', 'its own hero')
      on conflict (rpc) do update set why = excluded.why; end if;
end $mig$;

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  c_a constant uuid := '000000c0-0000-4000-a000-00007a1e0a01';
  c_b constant uuid := '000000c0-0000-4000-a000-00007a1e0a02';
  k   constant text := '000000c0-0000-4000-b000-7a1e';
  v jsonb; v_s text; v_role text; v_r public.hr_training_rules%rowtype; v_sid uuid; v_g bigint; v_lv int; v_fee bigint;
begin
  -- (a) THE SHAPE: a signed-in client calls the three verbs, nobody else; the helpers and the restated bodies are owner-only; the bank is
  --     read-own, written by nobody; the switch row exists; hygiene STRICT is green.
  foreach v_s in array array['public.hr_training_gear_buy(integer,text,bigint,uuid)', 'public.hr_training_gear_open(integer,text,uuid)',
                             'public.hr_training_gear_switch(integer,text,boolean,uuid)'] loop
    if has_function_privilege('anon', v_s, 'execute') or has_function_privilege('service_role', v_s, 'execute') or not has_function_privilege('authenticated', v_s, 'execute') then
      raise exception 'training-gear §6(a): the grants on % are wrong', v_s; end if;
  end loop;
  foreach v_s in array array['public.hr_training_gear_sealed_ms(uuid,integer,text)', 'public.hr_training_gear_budget(uuid,integer,text)',
                             'public.hr_training_gear_take(uuid,integer,text,text,boolean,uuid)', 'public.hr_training_quote(uuid,integer,text,text)',
                             'public.hr_training_window(uuid,integer,text,timestamp with time zone,timestamp with time zone,jsonb)',
                             'public.hr_training_section(uuid,integer)', 'public.hr_hunt_member_read(public.hunt_sessions)'] loop
    if has_function_privilege('authenticated', v_s, 'execute') or has_function_privilege('anon', v_s, 'execute') then
      raise exception 'training-gear §6(a): a client can execute %', v_s; end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid = 'public.player_training_gear'::regclass)
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_training_gear' and cmd = 'SELECT')
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_training_gear' and cmd <> 'SELECT') then
    raise exception 'training-gear §6(a): player_training_gear is not RLS read-own'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.player_training_gear', 'insert,update,delete,truncate') then
      raise exception 'training-gear §6(a): % can write player_training_gear', v_role; end if;
  end loop;
  if not exists (select 1 from public.hr_feature_switches where switch_id = 'training_gear') then
    raise exception 'training-gear §6(a): the training_gear switch is missing'; end if;
  perform public.hr_assert_grant_hygiene(true);
  -- (b) THE RULES ARE THE DATA'S (Tyler 2026-11-14): 30,000 an hour, 200%, from Level 10; 250,000 for 12 hours and 450,000 for 24, one item a
  --     skill each, gold and bound.
  select * into v_r from public.hr_training_rules where id;
  if v_r.xp_per_hour <> 30000 or v_r.boost_pm <> 2000 or v_r.min_level <> 10 then
    raise exception 'training-gear §6(b): the rules read % an hour, % permille, Level %', v_r.xp_per_hour, v_r.boost_pm, v_r.min_level; end if;
  if (select count(*) from public.hr_training_gear) <> 16
     or exists (select 1 from public.hr_training_gear where not bound and price <> case hours_ms when 43200000 then 250000 when 86400000 then 450000 end)
     or (select count(distinct skill) from public.hr_training_gear) <> 4 then
    raise exception 'training-gear §6(b): the items are not one a skill at 250,000 for 12 hours and 450,000 for 24'; end if;
  -- (c) THE TIME BOUND, EXACT: ten seconds pay at most 83 and the carry (84); a claimed item time doubles only what it covers; a claim
  --     past the window, of the wrong shape, or over the item time the server holds is refused by name.
  begin
    perform public.hr_training_window(c_a, 0, 'training_yard_melee', now() - interval '10 seconds', now(),
      '{"journal":{"kind":"combat","meta":{"kills":0}},"xp":{"melee":84}}'::jsonb);
  exception when sqlstate 'HR000' then raise exception 'training-gear §6(c): ten seconds at the rate (84) were refused: %', sqlerrm; end;
  foreach v_s in array array['{"journal":{"meta":{"kills":0}},"xp":{"melee":85}}', '{"journal":{"meta":{"kills":0,"boost_ms":10001}},"xp":{"melee":1}}',
                             '{"journal":{"meta":{"kills":0,"boost_ms":"x"}},"xp":{"melee":1}}', '{"journal":{"meta":{"kills":0,"boost_ms":5000}},"xp":{"melee":125}}',
                             '{"journal":{"meta":{"kills":0,"boost_ms":5000}},"xp":{"melee":100}}'] loop
    begin
      perform public.hr_training_window(c_a, 0, 'training_yard_melee', now() - interval '10 seconds', now(), v_s::jsonb);
      raise exception 'training-gear §6(c): % passed the window check', v_s;
    exception when sqlstate 'HR000' then
      if sqlerrm not in ('training_pays', 'value_over', 'session_moved') then raise; end if;
    end;
  end loop;
  -- (d) BOUND NEVER TRADES: every bound row is untradeable and worthless, so the market's one listable rule refuses it; every gold row is
  --     listable, its ceiling the Arms Master's price.
  if exists (select 1 from public.hr_training_gear g join public.hr_market_items m on m.item_id = g.item_id
              where g.bound and (m.listable or m.why is distinct from 'untradeable'))
     or exists (select 1 from public.hr_training_gear g join public.hr_market_items m on m.item_id = g.item_id
                 where not g.bound and (not m.listable or m.ceiling_each > g.price)) then
    raise exception 'training-gear §6(d): a bound training item is listable, or a gold one is not (or lists above its price)'; end if;
  -- (e) THE VERBS, ON A PROBE HERO (rolled back): off refuses; on, a forged price is quote_changed and charges nothing; a bound row is not
  --     for sale; the buy charges the catalogue's price once on its key and lands one item; the open banks its hours once on its key and a
  --     second is still_open; the quote refuses under Level 10; the member read carries the item time; the switch zeroes it.
  begin
    update public.hr_hunt_config set enabled = true where id;
    insert into auth.users (id) values (c_a) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_a, 'training-gear §6 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'training-gear §6-harness: hr_create_character refused: %', v; end if;
    update public.account_wallet set gold = 1000000 where user_id = c_a;
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_training_gear_buy(0, 'training_sword_12h', 250000, (k || '00000a01')::uuid);
    if v->>'error' is distinct from 'feature_off' then raise exception 'training-gear §6(e): the buy with the switch off answered %', v; end if;
    update public.hr_feature_switches set scope = 'everyone' where switch_id = 'training_gear';
    v := public.hr_training_gear_buy(0, 'training_sword_12h', 249999, (k || '00000a02')::uuid);
    if v->>'error' is distinct from 'quote_changed' or (v->>'price')::bigint <> 250000 or (select gold from public.account_wallet where user_id = c_a) <> 1000000 then
      raise exception 'training-gear §6(e): a forged price answered %', v; end if;
    v := public.hr_training_gear_buy(0, 'training_sword_12h_bound', 250000, (k || '00000a03')::uuid);
    if v->>'error' is distinct from 'not_for_sale' then raise exception 'training-gear §6(e): a bound row for gold answered %', v; end if;
    v := public.hr_training_gear_buy(0, 'training_sword_12h', 250000, (k || '00000a04')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.account_wallet where user_id = c_a) <> 750000
       or (select qty from public.player_inventory where user_id = c_a and slot = 0 and item_id = 'training_sword_12h') <> 1 then
      raise exception 'training-gear §6(e): the buy answered %', v; end if;
    v := public.hr_training_gear_buy(0, 'training_sword_12h', 250000, (k || '00000a04')::uuid);
    if (select gold from public.account_wallet where user_id = c_a) <> 750000
       or (select count(*) from public.player_ledger where user_id = c_a and intent like 'training\_gear\_buy:%') <> 1 then
      raise exception 'training-gear §6(e): a replayed buy charged again: %', v; end if;
    -- the member read of a training session carries the item time: none banked, one sword in the bag (12 hours)
    update public.player_state set level_xp = public.hr_char_xp_for_level(5) where user_id = c_a and slot = 0;
    v := public.hr_training_quote(c_a, 0, 'melee', 'yard');
    if v->>'why' is distinct from 'low_level' or (v->>'need')::int <> 10 then raise exception 'training-gear §6(e): a Level 5 hero''s quote answered %', v; end if;
    update public.player_state set level_xp = public.hr_char_xp_for_level(20) where user_id = c_a and slot = 0;
    v_lv := public.hr_skill_level('melee', coalesce((select xp from public.player_skills where user_id = c_a and slot = 0 and skill_id = 'melee'), 0));
    v_fee := public.hr_training_fee(v_lv);
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_training_start(0, 'melee', 'yard', v_fee, (k || '00000a05')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'training-gear §6(e): a Level 20 start answered %', v; end if;
    v_sid := (v->>'session_id')::uuid;
    v := public.hr_hunt_member_read((select h from public.hunt_sessions h where h.id = v_sid));
    if (v->>'train_boost_ms')::bigint <> 43200000 then raise exception 'training-gear §6(e): the read carries % item ms, not one sword''s 12 hours', v->'train_boost_ms'; end if;
    -- the open: the sword's hours into the bank, the bag empty, once on its key; a second open is still_open
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_training_gear_open(0, 'training_sword_12h', (k || '00000a06')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select banked_ms from public.player_training_gear where user_id = c_a and slot = 0 and skill = 'melee') <> 43200000
       or exists (select 1 from public.player_inventory where user_id = c_a and slot = 0 and item_id = 'training_sword_12h') then
      raise exception 'training-gear §6(e): the open answered %', v; end if;
    v := public.hr_training_gear_open(0, 'training_sword_12h', (k || '00000a06')::uuid);
    if (select opened_ms from public.player_training_gear where user_id = c_a and slot = 0 and skill = 'melee') <> 43200000 then
      raise exception 'training-gear §6(e): a replayed open banked twice: %', v; end if;
    v := public.hr_training_gear_open(0, 'training_sword_12h', (k || '00000a07')::uuid);
    if v->>'error' is distinct from 'still_open' then raise exception 'training-gear §6(e): a second open answered %', v; end if;
    -- the settle spends the claim from the bank, exactly; the switch off zeroes the read and refuses a claim
    perform public.hr_training_window(c_a, 0, 'training_yard_melee', now() - interval '10 seconds', now(),
      '{"journal":{"kind":"combat","meta":{"kills":0,"boost_ms":10000}},"xp":{"melee":167}}'::jsonb);
    if (select banked_ms || '/' || spent_ms from public.player_training_gear where user_id = c_a and slot = 0 and skill = 'melee') <> '43190000/10000' then
      raise exception 'training-gear §6(e): ten boosted seconds left the books at %',
        (select banked_ms || '/' || spent_ms from public.player_training_gear where user_id = c_a and slot = 0 and skill = 'melee'); end if;
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_training_gear_switch(0, 'melee', false, (k || '00000a08')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (public.hr_hunt_member_read((select h from public.hunt_sessions h where h.id = v_sid))->>'train_boost_ms')::bigint <> 0 then
      raise exception 'training-gear §6(e): the switch off answered % and the read still carries item time', v; end if;
    begin
      perform public.hr_training_window(c_a, 0, 'training_yard_melee', now() - interval '10 seconds', now(),
        '{"journal":{"kind":"combat","meta":{"kills":0,"boost_ms":10000}},"xp":{"melee":167}}'::jsonb);
      raise exception 'training-gear §6(e): a claim with the switch off passed';
    exception when sqlstate 'HR000' then
      if sqlerrm <> 'session_moved' then raise; end if;
    end;
    -- the section says it all: the rate, the bank, the offers
    v := public.hr_training_section(c_a, 0);
    if (v->'rate'->>'xp_h')::int <> 30000 or (v->'rate'->>'xp_h_item')::int <> 60000 or jsonb_array_length(v->'offers') <> 8
       or (v->'gear'->0->>'banked_ms')::bigint <> 43190000 or (v->'gear'->0->>'on')::boolean or v->'run'->>'boosted' <> 'false' then
      raise exception 'training-gear §6(e): the section reads %', left(v::text, 600); end if;
    raise exception using errcode = 'HRL28', message = 'training-gear §6 complete - rolling back';
  exception when sqlstate 'HRL28' then null;
  end;
  if exists (select 1 from public.player_state where user_id = c_a) or exists (select 1 from public.player_training_gear where user_id = c_a)
     or exists (select 1 from public.player_ledger where user_id = c_a) then
    raise exception 'training-gear §6: LEAKED a probe row'; end if;
  raise notice 'training-gear: the fixed rate, the Level gate, the exact time bound, the bank spent, the buy, the open, the switch, bound never listed; all green';
end $$;
