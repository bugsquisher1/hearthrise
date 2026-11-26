-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1071-work-blocks.sql — BOUGHT TOWN-WORK BLOCKS, AND THE STANDING "BUY UP TO N A DAY" RULE FOR BOTH KINDS
--   (lane/b1-work-blocks, backend-architect, 2026-11-26; v0.3.0 lane B1, 20-v030-the-roads.md sections 3.3 and 4; Tyler's rulings of
--   2026-11-22; 04-math-strategy.md section 11; the designer's ruling on the rule, 12-targets.md section 9.3, lane/sn-sinks 2026-11-26).
--
-- STATUS: supabase/migration-notes/1071-work-blocks.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1058-hunting-blocks.sql (hr_time_quote and hr_time_buy, PINNED in
--   §0) and 1059-company-trades.sql (hr_work_extra_ms, PINNED). BEFORE 1072-work-blocks-catalogue.generated.sql, which writes the `work`
--   row and the rule's catalogue row and refuses to run before this file: 1058's hr_time_buy adds stamina for every row, so a `work`
--   row landing first would sell 2 h of stamina at a quarter of a hunting block's price until this file applied. Between this file and
--   1072 nothing new is reachable: the work branch answers bad_kind (no row) and the rule has no catalogue row (the sweep buys nothing,
--   the offer is null). Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §9 self-check.
-- EDGE: none. The engine already reads the work day's `extra_ms` (hr_work_state) and the hunt's pool; a bought block raises them.
-- CLIENT: the Work window's block and rule, the Services hunting rule, the offer card's state (H1 paints the card). An old client reads
--   the `time_blocks` section's `hunt` quote as before and ignores the rest.
--
-- ── RULINGS ─────────────────────────────────────────────────────────────────
--   Tyler 2026-11-22: town work is bought in 2 h blocks, pricey, each block dearer that day (x1.5), at most 4 a day; hunting at most 2.
--     The price is hours of the wage at the hero's Level (04 section 11: 0.5 hours of wage a work-block hour, the day's four 1.0, 1.5,
--     2.25 and 3.375 hours of wage). Server-priced, clamped and journalled; a money surface for the pre-EA Security review.
--   The designer, 2026-11-26 (12-targets 9.3): the "buy up to N a day" rule is NEVER on by default. It is offered once, when the
--     company's purse first holds 3 days of its pay: [Up to 1 a day] [Up to 2 a day] [Not now] for hunting blocks. The pick becomes the
--     plan's standing rule. The ledger that measured it (sinks/ledger.mjs) buys "while the purse keeps 20 hours of wage": the reserve.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- §1 player_ledger_time_buy_idx: a partial index on the bought-time rows (kind shop, intent time_buy:%). hr_time_bought(user, slot,
--    kind) -> int, INTERNAL: that kind's blocks bought this UTC day (the press and the rule, one count; every quote and the work cap).
-- §2 hr_work_extra_ms (1059's hook) RESTATED: today's bought town work = blocks x block_ms, the count read through the index.
-- §3 THE QUOTES. hr_time_quote(user, slot, kind) RESTATED: `work` is hr_work_block_quote; `hunt` is 1058's quote (pool, cap, ceiling)
--    plus `auto` (the hero's rule: up_to, max_price, bought today by it); any other kind null.
--    hr_work_block_quote(user, slot) -> { kind, available, why, at, block_ms, price, n, bought, per_day, level, cap_ms, used_ms,
--      left_ms, room_ms, auto }, INTERNAL:
--      why  'block_limit'  bought >= per_day (4)
--           'day_ending'   what is left of today's work plus one block would not fit in the ms left before the server's midnight
--                          (room_ms): a block is today's (1059: the cap counts today's blocks on today only), so it is sold only while
--                          today can still use it whole
--    THE SECTION `time_blocks` (hr_time_blocks_view RESTATED): { hunt, work, offer } where `offer` is hr_time_offer_of (below).
-- §4 hr_time_buy(p_kind, p_slot, p_price, p_idem) RESTATED, MONEY, authenticated (same signature, same refusals): `work` buys a town
--    block (ONE hr_apply {gold: -price} journalled shop, intent time_buy:work:<price>; the shop row IS the block: hr_work_extra_ms counts
--    it); `hunt` is 1058's (the pool written at the instant). Any kind without a branch is bad_kind, whatever hr_time_blocks holds.
--    Both answer `envelope` (rule 11): the hero as the purchase left it.
-- §5 THE RULE. public.hero_time_rules (user_id, slot, kind, up_to, max_price, set_at): one row a hero and kind; NO ROW = OFF (the
--    default, always). RLS on, no policy, no client grant: projected as each quote's `auto`.
--    hr_time_auto_set(p_kind, p_slot, p_up_to, p_max_price, p_idem) -> jsonb, authenticated: one hero's rule. p_up_to null or 0 turns it
--    off; 1..per_day sets it; p_max_price null (no ceiling) or 1..10^12 (never a block dearer). Keyed before and under hr_hunt_lock,
--    rate-gated, journalled (player_ledger kind shop, gold 0, intent time_auto:<kind>:<up_to|off>, meta was/now). Answers { ok, kind,
--    auto, time_blocks } and `envelope`.
-- §6 THE OFFER (12-targets 9.3). public.account_time_offers (user_id, kind, up_to, answered_at): the account's answer to the card, ONE
--    row ever a kind. hr_time_offer_of(user) -> { kind, choices, threshold, purse } or null, INTERNAL: shown while unanswered and the
--    purse holds offer_days of the company's pay (offer_days x the free hunting day x the sum of wage(Level) over the account's heroes).
--    hr_time_offer_answer(p_slot, p_up_to, p_idem) -> jsonb, authenticated: p_up_to one of the card's choices sets the offer kind's
--    rule on EVERY hero of the account (each under its own lock, slot order); null or 0 is Not now. Either way the offer is answered
--    and never shown again; each hero's rule stays changeable by hr_time_auto_set. Refuses offer_answered on a second answer.
-- §7 THE SWEEP (the rule buys without a press). hr_time_auto_buy(user, slot, kind) -> jsonb, INTERNAL: one attempt for one hero:
--    the rule's row; the hero busy-checked without waiting; hunting only while a hunt is open and its pool is under lead_min, town
--    work only while a town job runs and today's bought work left is at most lead_min; the quote available (the press's own rule: the
--    cap, the ceiling, day_ending); bought today < up_to; price <= max_price; the purse keeps reserve_hours of the hero's wage after
--    it. Then exactly the press's write (hr_apply journalled time_buy:<kind>:<price>, meta.auto true; the hunting pool at its instant)
--    under a key derived from (hero, kind, UTC day, n), so no block n is ever bought twice.
--    hr_time_auto_sweep(p_limit) -> { seen, bought, busy, errors }, cron 'hr-time-auto' every minute: every hero with a rule that is
--    hunting or working, one hero at a time, each in its own subtransaction (one fault never stops the rest).
-- ERRORS (new words): day_ending (a work block today cannot use whole), offer_answered, offer_closed (no offer kind in the catalogue).
--   Existing: not_signed_in, bad_slot, bad_idem, bad_kind, bad_quote, bad_intent, rate_limited, no_character, catalogue_missing,
--   block_limit, stamina_full, quote_changed, stamina_ahead, insufficient_gold, intent_mismatch.
--   The sweep's words (its answer and hr_rejections 'time_auto'): no_rule, not_hunting, not_working, not_yet, rule_limit, rule_price,
--   rule_reserve, busy, and the quote's why.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
--   Every write to a hero's bought time and rule holds that hero's lock (hr_hunt_lock: the settle's advisory key, the hero row, its
--   open hunt row), so a press, a rule change and the sweep's purchase are one order per hero and the day's count is read under it.
--   THE SWEEP NEVER WAITS. It first reads (no lock) whether a block is due; only then it takes the hero's key and rows and the account
--   purse with try / SKIP LOCKED, and a hero whose settle, party settle or sibling holds any of them is skipped until the next minute
--   ('busy'). So it can never be part of a deadlock (a party settle locks several heroes and the purse). It re-quotes under the lock.
--   Its key is md5(time_auto, hero, kind, UTC day, n) as a uuid: two sweeps that overlap reach hr_apply with the same key for block n
--   and the second answers the first (hr_intent_replay under the lock, then hr_apply's own claim). The press keeps 1058's keys.
--   THE ANSWER locks every hero of the account in slot order (the order every multi-hero locker uses).
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
--   One more kind on the money verb: a gold sink, priced only by the server (the client's price is checked, never used), capped at 4
--   a UTC day, refused when today cannot use it, journalled. Two new client verbs, both SETTINGS: a hero's own rule (a count and an
--   optional ceiling) and the account's one answer to the offer. Neither moves gold; they authorise the server to spend the account's
--   own gold on its own heroes' own time, only inside the press's rules, the rule's count, its ceiling and the reserve. Nothing a client
--   sends reaches another player. Crowns reach bought time only as gold bought from players. ON THE PRE-EA SECURITY LIST (S-22).
--
-- ── COST (rows and bytes at 100x players: 2,000 accounts x 4 heroes) ─────────
--   A block is one ledger row and one intent row (~600 B): at most 6 a hero-day (2 hunting, 4 work), 48,000 rows a day at the extreme,
--   ~10 MB before the prune. A rule change is one ledger row. The index holds only bought-time rows. The quotes now read the day's count
--   through it (a few rows) where 1058/1059 read the hero's whole day of ledger rows. The sweep each minute reads the rules of heroes
--   hunting or working (at most 8,000 small rows) and quotes at most 2,000 of them (a fresh order each minute past that, so at 100x
--   every hero with a rule is reached within a few minutes, inside a block's lead); it locks only a hero it buys for. A refusal the
--   sweep keeps meeting (the reserve, the day's end) is one hr_rejections row a hero, code and day (aggregated). No per-tick journal row.
--   APPLY: the partial index is built inside the apply's transaction (no CONCURRENTLY there), one pass over player_ledger, holding its
--   writes for that pass (seconds on production's ledger; the big release's apply window).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Drop the cron 'hr-time-auto', hr_time_auto_sweep, hr_time_auto_buy, hr_time_offer_answer, hr_time_offer_of, hr_time_auto_set
--   (+ their baseline and GM wall rows), hero_time_rules, account_time_offers, hr_time_standing, hr_work_block_quote, hr_time_bought
--   and the index; restate hr_time_quote, hr_time_blocks_view and hr_time_buy from 1058 and hr_work_extra_ms from 1059 (after the
--   `work` row leaves hr_time_blocks: re-apply 1058's catalogue). Bought blocks stay bought (the ledger is history).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ───────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hr_time_blocks') is null or to_regprocedure('public.hr_time_block_price(text,integer,integer)') is null
     or to_regprocedure('public.hr_wage(integer)') is null then
    raise exception 'PRECONDITION: the bought-time catalogue first (1058-hunting-blocks-catalogue.generated.sql)'; end if;
  if to_regprocedure('public.hr_work_base_ms(uuid,integer)') is null or to_regprocedure('public.hr_work_kinds()') is null
     or to_regprocedure('public.hr_work_day_view(uuid,integer)') is null then
    raise exception 'PRECONDITION: the work day first (1059-company-trades.sql)'; end if;
  if to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null or to_regprocedure('public.hr_level_of(uuid,integer)') is null
     or to_regprocedure('public.hr_utc_day_start(timestamp with time zone)') is null or to_regprocedure('public.hr_purse_of(uuid)') is null
     or to_regprocedure('public.hr_stamina_view(uuid,integer)') is null or to_regprocedure('public.hr_hunt_limit(text)') is null
     or to_regprocedure('public.hr_cron_ensure(text,text,text)') is null or to_regprocedure('public.hr_state_of(uuid,integer)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
  -- THE PINS: each body this file restates is the image its file wrote, or this file's own (a second apply)
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_time_quote(uuid,integer,text)'::regprocedure;
  if v_md5 <> 'e8cc96089f3ab1dd4cbf4f6b4a7de6d7' and strpos((select prosrc from pg_proc where oid = 'public.hr_time_quote(uuid,integer,text)'::regprocedure), 'WORK-BLOCKS (1071') = 0 then
    raise exception 'PIN: hr_time_quote is neither 1058''s image nor this file''s (md5 %): another file moved it; re-derive', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_time_buy(text,integer,bigint,uuid)'::regprocedure;
  if v_md5 <> '028e903ec779aa0dd1fe144539504b97' and strpos((select prosrc from pg_proc where oid = 'public.hr_time_buy(text,integer,bigint,uuid)'::regprocedure), 'WORK-BLOCKS (1071') = 0 then
    raise exception 'PIN: hr_time_buy is neither 1058''s image nor this file''s (md5 %): another file moved it; re-derive', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_work_extra_ms(uuid,integer)'::regprocedure;
  if v_md5 <> 'cc7a79440f4b56ad2625d937b46f112c' and strpos((select prosrc from pg_proc where oid = 'public.hr_work_extra_ms(uuid,integer)'::regprocedure), 'WORK-BLOCKS (1071') = 0 then
    raise exception 'PIN: hr_work_extra_ms is neither 1059''s image nor this file''s (md5 %): another file moved it; re-derive', v_md5; end if;
end $mig$;

-- ── §1 THE DAY'S COUNT, THROUGH ITS OWN INDEX ────────────────────────────────
-- The quotes and the work cap used to read the hero's whole day of ledger rows (a town hero writes one a flush) to find a few shop rows.
create index if not exists player_ledger_time_buy_idx on public.player_ledger (user_id, slot, at desc)
  where kind = 'shop' and intent like 'time\_buy:%';

create or replace function public.hr_time_bought(p_user uuid, p_slot integer, p_kind text)
returns integer language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- WORK-BLOCKS (1071-work-blocks.sql): blocks of p_kind bought this server (UTC) day, by the press and by the standing rule (one count).
  -- The first `like` is the index's own predicate (player_ledger_time_buy_idx), so the planner reads that index and nothing else.
  return (select count(*) from public.player_ledger l
           where l.user_id = p_user and l.slot = p_slot and l.kind = 'shop' and l.intent like 'time\_buy:%'
             and l.intent like 'time\_buy:' || p_kind || ':%' and l.at >= public.hr_utc_day_start(now()))::int;
end $fn$;

-- ── §1b THE RULE'S CATALOGUE (its row is 1072's, generated from src/data/time-blocks.js) ──
alter table public.hr_time_blocks add column if not exists lead_min int;
create table if not exists public.hr_time_standing (
  id               boolean primary key default true check (id),
  reserve_hours_pm int     not null check (reserve_hours_pm >= 0),
  offer_kind       text    not null check (offer_kind ~ '^[a-z]{1,16}$'),
  offer_days_pm    int     not null check (offer_days_pm >= 1),
  offer_choices    int[]   not null
);
alter table public.hr_time_standing enable row level security;
revoke all on public.hr_time_standing from public, anon, authenticated, service_role;
comment on table public.hr_time_standing is
  '1071-work-blocks.sql: the standing rule''s numbers (the reserve, the offer), one row, written only by 1072-work-blocks-catalogue.generated.sql.';

-- ── §2 THE WORK CAP'S HOOK, READ THROUGH THE INDEX (1059's hr_work_extra_ms) ──
create or replace function public.hr_work_extra_ms(p_user uuid, p_slot integer)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare v_block bigint;
begin
  -- WORK-BLOCKS (1071-work-blocks.sql; 1059's hook): today's bought town work, the work blocks bought this UTC day (the press and the
  -- standing rule, hr_time_bought) times the kind's block. Until hr_time_blocks has a `work` row the ledger is not read and this is 0.
  select b.block_min::bigint * 60000 into v_block from public.hr_time_blocks b where b.kind = 'work';
  if v_block is null then return 0; end if;
  return v_block * public.hr_time_bought(p_user, p_slot, 'work');
end $fn$;

-- ── §5a THE RULE'S TABLE (before the quotes that read it) ───────────────────
create table if not exists public.hero_time_rules (
  user_id   uuid        not null,
  slot      int         not null,
  kind      text        not null check (kind ~ '^[a-z]{1,16}$'),
  up_to     int         not null check (up_to between 1 and 24),
  max_price bigint      check (max_price is null or max_price between 1 and 1000000000000),
  set_at    timestamptz not null default now(),
  primary key (user_id, slot, kind),
  constraint hero_time_rules_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
alter table public.hero_time_rules enable row level security;
revoke all on public.hero_time_rules from public, anon, authenticated, service_role;
comment on table public.hero_time_rules is
  '1071-work-blocks.sql: a hero''s standing "buy up to N blocks a day" rule, one row a kind; no row = off (the default). Written only by hr_time_rule_write.';

create table if not exists public.account_time_offers (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  kind        text        not null check (kind ~ '^[a-z]{1,16}$'),
  up_to       int         not null check (up_to between 0 and 24),
  answered_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.account_time_offers enable row level security;
revoke all on public.account_time_offers from public, anon, authenticated, service_role;
comment on table public.account_time_offers is
  '1071-work-blocks.sql: the account''s one answer to the block-rule offer (12-targets 9.3); up_to 0 = Not now. Written only by hr_time_offer_answer.';

-- ── §3 THE QUOTES AND THE SECTION ────────────────────────────────────────────
create or replace function public.hr_work_block_quote(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  v_block bigint; v_per int; v_day date; v_ms bigint; v_today date := (now() at time zone 'utc')::date;
  v_used bigint; v_base bigint; v_bought int; v_auto int; v_cap bigint; v_room bigint; v_lv int; v_why text; v_up int; v_max bigint;
begin
  -- WORK-BLOCKS (1071-work-blocks.sql): THE NEXT BOUGHT BLOCK OF TOWN WORK, as the server prices it, or why there is none. A block raises
  -- TODAY's cap (1059: hr_work_extra_ms counts today's blocks on today only), so it is sold only while today can use it whole: what is
  -- left of today's work plus the block must fit before the server's midnight (`day_ending`).
  select b.block_min::bigint * 60000, b.per_day into v_block, v_per from public.hr_time_blocks b where b.kind = 'work';
  if v_block is null then return null; end if;
  select ps.work_day, ps.work_ms into v_day, v_ms from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  if not found then return null; end if;
  v_used := case when v_day = v_today then coalesce(v_ms, 0) else 0 end;
  v_base := public.hr_work_base_ms(p_user, p_slot);
  select count(*)::int, (count(*) filter (where l.meta->>'auto' = 'true'))::int into v_bought, v_auto
    from public.player_ledger l
   where l.user_id = p_user and l.slot = p_slot and l.kind = 'shop' and l.intent like 'time\_buy:%'
     and l.intent like 'time\_buy:work:%' and l.at >= public.hr_utc_day_start(now());
  v_cap := v_base + v_bought * v_block;
  v_room := floor(extract(epoch from (public.hr_utc_day_start(now()) + interval '1 day' - now())) * 1000)::bigint;
  v_lv := greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1));
  v_why := case when v_bought >= v_per then 'block_limit'
                when greatest(0, v_cap - v_used) + v_block > v_room then 'day_ending' end;
  select r.up_to, r.max_price into v_up, v_max from public.hero_time_rules r where r.user_id = p_user and r.slot = p_slot and r.kind = 'work';
  return jsonb_build_object('kind', 'work', 'available', v_why is null, 'why', v_why, 'at', now(), 'block_ms', v_block,
                            'n', least(v_bought + 1, v_per), 'bought', v_bought, 'per_day', v_per, 'level', v_lv,
                            'cap_ms', v_cap, 'used_ms', v_used, 'left_ms', greatest(0, v_cap - v_used), 'room_ms', v_room,
                            'price', case when v_why is null then public.hr_time_block_price('work', v_lv, v_bought + 1) end,
                            'auto', case when v_up is not null then jsonb_build_object('up_to', v_up, 'max_price', v_max, 'bought', v_auto) end);
end $fn$;

create or replace function public.hr_time_quote(p_user uuid, p_slot int, p_kind text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  r record; v_s public.hunt_sessions%rowtype;
  v_at timestamptz; v_cur bigint; v_cap bigint; v_ceil bigint; v_block bigint; v_bought int; v_auto int; v_lv int; v_why text;
  v_up int; v_max bigint;
begin
  -- WORK-BLOCKS (1071-work-blocks.sql): one quote a kind. Town work is its own (hr_work_block_quote); hunting is 1058's below, with the
  -- hero's standing rule beside it (`auto`). A kind with no branch here has no quote, whatever hr_time_blocks holds.
  if p_kind = 'work' then return public.hr_work_block_quote(p_user, p_slot); end if;
  if p_kind is distinct from 'hunt' then return null; end if;
  select b.kind, b.block_min, b.per_day into r from public.hr_time_blocks b where b.kind = p_kind;
  if r.kind is null or not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  -- THE POOL'S OWN INSTANT: a hunting hero's pool lives at its session's settled_to (2026-10-23-character-premium.sql).
  select * into v_s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null;
  v_at := coalesce(v_s.settled_to, now());
  v_cur := public.hr_stamina_of(p_user, p_slot, v_at);
  v_cap := public.hr_stamina_cap(p_user, p_slot, v_at);
  if v_cur is null or v_cap is null then return null; end if;
  v_block := r.block_min::bigint * 60000;
  v_ceil := v_cap + r.per_day::bigint * v_block;
  select count(*)::int, (count(*) filter (where l.meta->>'auto' = 'true'))::int into v_bought, v_auto
    from public.player_ledger l
   where l.user_id = p_user and l.slot = p_slot and l.kind = 'shop' and l.intent like 'time\_buy:%'
     and l.intent like 'time\_buy:' || r.kind || ':%' and l.at >= public.hr_utc_day_start(now());
  v_lv := greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1));
  v_why := case when v_bought >= r.per_day then 'block_limit' when v_cur + v_block > v_ceil then 'stamina_full' end;
  select t.up_to, t.max_price into v_up, v_max from public.hero_time_rules t where t.user_id = p_user and t.slot = p_slot and t.kind = r.kind;
  return jsonb_build_object('kind', r.kind, 'available', v_why is null, 'why', v_why, 'at', v_at, 'ms', v_cur, 'max_ms', v_cap,
                            'ceiling_ms', v_ceil, 'block_ms', v_block, 'n', least(v_bought + 1, r.per_day), 'bought', v_bought, 'per_day', r.per_day,
                            'level', v_lv, 'price', case when v_why is null then public.hr_time_block_price(r.kind, v_lv, v_bought + 1) end)
         || jsonb_build_object('auto', case when v_up is not null then jsonb_build_object('up_to', v_up, 'max_price', v_max, 'bought', v_auto) end);
end $fn$;

create or replace function public.hr_time_offer_of(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare s public.hr_time_standing%rowtype; v_pay numeric; v_need bigint; v_purse bigint;
begin
  -- WORK-BLOCKS (1071-work-blocks.sql; 12-targets 9.3): THE OFFER the coach card reads. Shown while the account has not answered it and
  -- its purse holds offer_days of the company's pay: offer_days x the free hunting day (hr_hunt_limit stamina_free_min) x the sum of
  -- wage(Level) over the account's heroes. Null otherwise (and before 1072 writes the rule's row).
  select * into s from public.hr_time_standing where id;
  if not found then return null; end if;
  if exists (select 1 from public.account_time_offers o where o.user_id = p_user and o.kind = s.offer_kind) then return null; end if;
  select sum(public.hr_wage(greatest(1, coalesce(public.hr_level_of(ps.user_id, ps.slot), 1)))) into v_pay
    from public.player_state ps where ps.user_id = p_user;
  if v_pay is null then return null; end if;
  v_need := ceil(v_pay * coalesce(public.hr_hunt_limit('stamina_free_min'), 600) / 60 * s.offer_days_pm / 1000)::bigint;
  v_purse := public.hr_purse_of(p_user);
  if v_purse < v_need then return null; end if;
  return jsonb_build_object('kind', s.offer_kind, 'choices', to_jsonb(s.offer_choices), 'threshold', v_need, 'purse', v_purse);
end $fn$;

create or replace function public.hr_time_blocks_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v jsonb := '{}'::jsonb; k text; q jsonb;
begin
  -- THE SECTION `time_blocks` (1058-hunting-blocks.sql; WORK-BLOCKS, 1071-work-blocks.sql): the next block of every kind as the server
  -- prices it (or why there is none), each with the hero's standing rule; and `offer`, the account's block-rule offer while it stands.
  for k in select kind from public.hr_time_blocks order by kind loop
    q := public.hr_time_quote(p_user, p_slot, k);
    if q is not null then v := v || jsonb_build_object(k, q); end if;
  end loop;
  q := public.hr_time_offer_of(p_user);
  if q is not null then v := v || jsonb_build_object('offer', q); end if;
  return case when v = '{}'::jsonb then null else v end;
end $fn$;

-- ── §4 THE PURCHASE (the press) ──────────────────────────────────────────────
create or replace function public.hr_time_buy(p_kind text, p_slot int, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_q jsonb; v_ver bigint; v_a jsonb; v_sat timestamptz; v_at timestamptz;
begin
  -- WORK-BLOCKS (1071-work-blocks.sql): one press, one block of `hunt` (stamina, 1058) or `work` (today's town work). The quote is the
  -- rule (hr_time_quote); the client's price is only compared with it.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_kind is null or p_kind not in ('hunt', 'work') or not exists (select 1 from public.hr_time_blocks b where b.kind = p_kind) then
    return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', 'bad_kind')); end if;
  if p_price is null or p_price < 1 or p_price > 1000000000000 then
    return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  v_verb := 'time_buy:' || p_kind || ':' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('time_buy', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  -- A SECOND PRESS OF ONE KEY that waited on that lock answers the first one's decision (2027-04-19-key-under-lock.sql): the read above
  -- ran before the first press committed, and past this point hr_apply answers a decided key ok and replayed, charging nothing.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('time_buy', p_slot, v_r); end if;
  select version, stamina_at into v_ver, v_sat from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_q := public.hr_time_quote(v_uid, p_slot, p_kind);
  if v_q is null then return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  if not (v_q->>'available')::boolean then
    return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', v_q->>'why', 'time_blocks', jsonb_build_object(p_kind, v_q))); end if;
  if (v_q->>'price')::bigint <> p_price then
    return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'time_blocks', jsonb_build_object(p_kind, v_q))); end if;
  v_at := (v_q->>'at')::timestamptz;
  if p_kind = 'hunt' and v_sat is not null and v_sat > v_at then
    return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', 'stamina_ahead')); end if;
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'gold', -p_price,
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', 'time_buy', 'kind', p_kind, 'n', (v_q->>'bought')::int + 1,
                                                                    'block_ms', (v_q->>'block_ms')::bigint, 'from_ms', coalesce((v_q->>'ms')::bigint, (v_q->>'left_ms')::bigint),
                                                                    'level', (v_q->>'level')::int, 'at', v_at))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_note_rejection('time_buy', p_slot, v_a || jsonb_build_object('ok', false)); end if;
  -- A KEY THIS CALL DID NOT DECIDE moves nothing more (never reached while the read above holds under the lock).
  if coalesce(v_a->>'replayed', 'false') = 'true' then return jsonb_build_object('ok', true, 'replayed', true); end if;
  if p_kind = 'work' then
    -- THE SHOP ROW IS THE BLOCK (hr_work_extra_ms counts it): nothing else is written, so hr_apply's answer is the hero as it stands.
    return jsonb_build_object('ok', true, 'version', v_a->'version', 'kind', p_kind, 'gold', -p_price,
                              'added_ms', (v_q->>'block_ms')::bigint, 'time_blocks', public.hr_time_blocks_view(v_uid, p_slot), 'envelope', v_a);
  end if;
  update public.player_state
     set stamina_ms = (v_q->>'ms')::bigint + (v_q->>'block_ms')::bigint, stamina_at = v_at
   where user_id = v_uid and slot = p_slot;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'kind', p_kind, 'gold', -p_price,
                            'added_ms', (v_q->>'block_ms')::bigint, 'stamina', public.hr_stamina_view(v_uid, p_slot),
                            'time_blocks', public.hr_time_blocks_view(v_uid, p_slot),
                            -- rule 11 (CLAUDE.md §6): the hero as the purchase left it (the pool is written after hr_apply's projection)
                            'envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

-- ── §5 THE RULE: ONE WRITER, AND THE PLAYER'S SETTING ────────────────────────
create or replace function public.hr_time_rule_write(p_user uuid, p_slot integer, p_kind text, p_up_to integer, p_max_price bigint, p_why text)
returns jsonb language plpgsql set search_path = public, pg_catalog as $fn$
declare v_was jsonb; v_now jsonb;
begin
  -- WORK-BLOCKS (1071-work-blocks.sql): THE ONE WRITER of a hero's standing rule. The CALLER holds the hero's lock (hr_hunt_lock) and has
  -- checked the kind and the numbers. No row is off. One ledger row a change (kind shop, gold 0), so a dispute reads who set what, when.
  select jsonb_build_object('up_to', r.up_to, 'max_price', r.max_price) into v_was
    from public.hero_time_rules r where r.user_id = p_user and r.slot = p_slot and r.kind = p_kind;
  if coalesce(p_up_to, 0) = 0 then
    delete from public.hero_time_rules where user_id = p_user and slot = p_slot and kind = p_kind;
    v_now := null;
  else
    insert into public.hero_time_rules as r (user_id, slot, kind, up_to, max_price, set_at)
      values (p_user, p_slot, p_kind, p_up_to, p_max_price, now())
      on conflict (user_id, slot, kind) do update set up_to = excluded.up_to, max_price = excluded.max_price, set_at = excluded.set_at;
    v_now := jsonb_build_object('up_to', p_up_to, 'max_price', p_max_price);
  end if;
  insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
    values (p_user, p_slot, 'shop', 'time_auto:' || p_kind || ':' || coalesce(nullif(p_up_to, 0)::text, 'off'), 0,
            jsonb_build_object('reason', 'time_auto', 'kind', p_kind, 'was', v_was, 'now', v_now, 'why', p_why));
  return v_now;
end $fn$;

create or replace function public.hr_time_auto_set(p_kind text, p_slot integer, p_up_to integer, p_max_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_per int; v_now jsonb;
begin
  -- WORK-BLOCKS (1071-work-blocks.sql): THE HERO'S STANDING RULE: buy up to p_up_to blocks of p_kind a UTC day (null or 0: off), never one
  -- dearer than p_max_price (null: no ceiling). The server buys them as they come due (hr_time_auto_sweep); this only sets the rule.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection('time_auto', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('time_auto', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  select b.per_day into v_per from public.hr_time_blocks b where b.kind = p_kind and p_kind in ('hunt', 'work');
  if v_per is null then return public.hr_note_rejection('time_auto', p_slot, jsonb_build_object('ok', false, 'error', 'bad_kind')); end if;
  if p_up_to is not null and (p_up_to < 0 or p_up_to > v_per) then
    return public.hr_note_rejection('time_auto', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent', 'per_day', v_per)); end if;
  if p_max_price is not null and (p_max_price < 1 or p_max_price > 1000000000000) then
    return public.hr_note_rejection('time_auto', p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  v_verb := 'time_auto:' || p_kind || ':' || coalesce(nullif(p_up_to, 0)::text, 'off') || ':' || coalesce(p_max_price::text, 'any');
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return v_r; end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return v_r; end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('time_auto', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_now := public.hr_time_rule_write(v_uid, p_slot, p_kind, p_up_to, case when coalesce(p_up_to, 0) = 0 then null else p_max_price end, 'set');
  v_r := jsonb_build_object('ok', true, 'kind', p_kind, 'auto', v_now);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  -- the answer carries the hero as the setting left it (rule 11, tests/write-answers-state.mjs); the stored receipt a retry answers carries none
  return v_r || jsonb_build_object('time_blocks', public.hr_time_blocks_view(v_uid, p_slot), 'envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

-- ── §6 THE OFFER'S ANSWER (12-targets 9.3) ───────────────────────────────────
create or replace function public.hr_time_offer_answer(p_slot integer, p_up_to integer, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_uid uuid := auth.uid(); v_r jsonb; v_verb text; s public.hr_time_standing%rowtype; h record; v_n int := 0;
begin
  -- WORK-BLOCKS (1071-work-blocks.sql): THE ACCOUNT'S ONE ANSWER to the block-rule card: [Up to 1 a day] [Up to 2 a day] set the offer
  -- kind's rule on every hero of the account; [Not now] (null or 0) sets nothing. Either way the card is never shown again.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection('time_offer', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('time_offer', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  select * into s from public.hr_time_standing where id;
  if not found then return public.hr_note_rejection('time_offer', p_slot, jsonb_build_object('ok', false, 'error', 'offer_closed')); end if;
  if coalesce(p_up_to, 0) <> 0 and not (p_up_to = any (s.offer_choices)) then
    return public.hr_note_rejection('time_offer', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent', 'choices', to_jsonb(s.offer_choices))); end if;
  v_verb := 'time_offer:' || s.offer_kind || ':' || coalesce(nullif(p_up_to, 0)::text, 'off');
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return v_r; end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('time_offer', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- EVERY HERO'S LOCK, IN SLOT ORDER (the order every multi-hero locker takes), then the key read again under them
  for h in select ps.slot from public.player_state ps where ps.user_id = v_uid order by ps.slot loop
    perform public.hr_hunt_lock(v_uid, h.slot);
  end loop;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return v_r; end if;
  if exists (select 1 from public.account_time_offers o where o.user_id = v_uid and o.kind = s.offer_kind) then
    return public.hr_note_rejection('time_offer', p_slot, jsonb_build_object('ok', false, 'error', 'offer_answered')); end if;
  insert into public.account_time_offers (user_id, kind, up_to) values (v_uid, s.offer_kind, coalesce(p_up_to, 0));
  if coalesce(p_up_to, 0) <> 0 then
    for h in select ps.slot from public.player_state ps where ps.user_id = v_uid order by ps.slot loop
      perform public.hr_time_rule_write(v_uid, h.slot, s.offer_kind, p_up_to, null, 'offer');
      v_n := v_n + 1;
    end loop;
  else
    -- Not now: the answer is journalled on the hero that saw the card (gold 0), so "why was I never asked again" reads in the ledger
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
      values (v_uid, p_slot, 'shop', 'time_offer:' || s.offer_kind || ':off', 0, jsonb_build_object('reason', 'time_offer', 'kind', s.offer_kind));
  end if;
  v_r := jsonb_build_object('ok', true, 'kind', s.offer_kind, 'up_to', coalesce(p_up_to, 0), 'heroes', v_n);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r || jsonb_build_object('time_blocks', public.hr_time_blocks_view(v_uid, p_slot), 'envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

-- ── §7 THE SWEEP: THE RULE BUYS WITHOUT A PRESS ──────────────────────────────
create or replace function public.hr_time_auto_buy(p_user uuid, p_slot integer, p_kind text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_up int; v_max bigint; v_lead bigint; v_q jsonb; v_price bigint; v_lv int; v_res bigint; v_purse bigint; v_ver bigint;
  v_sat timestamptz; v_at timestamptz; v_idem uuid; v_verb text; v_r jsonb; v_a jsonb; v_due boolean; v_n int;
begin
  -- WORK-BLOCKS (1071-work-blocks.sql): ONE ATTEMPT OF ONE HERO'S STANDING RULE (header §7). auth.uid() must be p_user: the sweep names
  -- the hero it acts for (request.jwt.claim.sub), so hr_apply journals it as that hero's own purchase.
  if auth.uid() is distinct from p_user then return jsonb_build_object('ok', false, 'why', 'not_signed_in'); end if;
  select b.lead_min::bigint * 60000 into v_lead from public.hr_time_blocks b where b.kind = p_kind and p_kind in ('hunt', 'work');
  if v_lead is null then return jsonb_build_object('ok', false, 'why', 'bad_kind'); end if;
  -- (1) DUE? read without a lock: nothing is locked for a hero whose block is not due
  select r.up_to, r.max_price into v_up, v_max from public.hero_time_rules r where r.user_id = p_user and r.slot = p_slot and r.kind = p_kind;
  if v_up is null then return jsonb_build_object('ok', false, 'why', 'no_rule'); end if;
  for v_n in 1 .. 2 loop
    if p_kind = 'hunt' and not exists (select 1 from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null) then
      return jsonb_build_object('ok', false, 'why', 'not_hunting'); end if;
    if p_kind = 'work' and not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot
                                          and ps.active_kind = any (public.hr_work_kinds())) then
      return jsonb_build_object('ok', false, 'why', 'not_working'); end if;
    v_q := public.hr_time_quote(p_user, p_slot, p_kind);
    if v_q is null then return jsonb_build_object('ok', false, 'why', 'catalogue_missing'); end if;
    if (v_q->>'bought')::int >= v_up then return jsonb_build_object('ok', false, 'why', 'rule_limit'); end if;
    v_due := case when p_kind = 'hunt' then (v_q->>'ms')::bigint < v_lead else (v_q->>'left_ms')::bigint <= v_lead end;
    if not v_due then return jsonb_build_object('ok', false, 'why', 'not_yet'); end if;
    if not (v_q->>'available')::boolean then return jsonb_build_object('ok', false, 'why', v_q->>'why'); end if;
    v_price := (v_q->>'price')::bigint;
    if v_max is not null and v_price > v_max then return jsonb_build_object('ok', false, 'why', 'rule_price', 'price', v_price); end if;
    v_lv := greatest(1, coalesce((v_q->>'level')::int, 1));
    v_res := coalesce((select ceil(s.reserve_hours_pm::numeric * public.hr_wage(v_lv) / 1000)::bigint from public.hr_time_standing s where s.id), -1);
    if v_res < 0 then return jsonb_build_object('ok', false, 'why', 'catalogue_missing'); end if;
    if public.hr_purse_of(p_user) - v_price < v_res then return jsonb_build_object('ok', false, 'why', 'rule_reserve', 'price', v_price, 'reserve', v_res); end if;
    exit when v_n = 2;
    -- (2) DUE: the hero's key and rows and the purse, never waited on (header CONCURRENCY), then (1) again under them
    if not pg_try_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_slot::text, 0)) then return jsonb_build_object('ok', false, 'why', 'busy'); end if;
    perform 1 from public.player_state where user_id = p_user and slot = p_slot for update skip locked;
    if not found then return jsonb_build_object('ok', false, 'why', 'busy'); end if;
    if exists (select 1 from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null) then
      perform 1 from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null for update skip locked;
      if not found then return jsonb_build_object('ok', false, 'why', 'busy'); end if;
    end if;
    perform 1 from public.account_wallet w where w.user_id = p_user for update skip locked;
    if not found then
      return jsonb_build_object('ok', false, 'why', case when exists (select 1 from public.account_wallet w where w.user_id = p_user) then 'busy' else 'rule_reserve' end); end if;
    select r.up_to, r.max_price into v_up, v_max from public.hero_time_rules r where r.user_id = p_user and r.slot = p_slot and r.kind = p_kind;
    if v_up is null then return jsonb_build_object('ok', false, 'why', 'no_rule'); end if;
  end loop;
  -- (3) THE PRESS'S OWN WRITE, under a key no second sweep can reuse for another block (hero, kind, UTC day, n)
  v_idem := md5('time_auto:' || p_user::text || ':' || p_slot::text || ':' || p_kind || ':' || ((now() at time zone 'utc')::date)::text
                || ':' || ((v_q->>'bought')::int + 1)::text)::uuid;
  v_verb := 'time_buy:' || p_kind || ':' || v_price;
  v_r := public.hr_intent_replay(p_user, p_slot, v_idem, v_verb);
  if v_r is not null then return jsonb_build_object('ok', false, 'why', 'replayed'); end if;
  select version, stamina_at into v_ver, v_sat from public.player_state where user_id = p_user and slot = p_slot;
  v_at := (v_q->>'at')::timestamptz;
  if p_kind = 'hunt' and v_sat is not null and v_sat > v_at then return jsonb_build_object('ok', false, 'why', 'stamina_ahead'); end if;
  v_a := public.hr_apply(p_user, p_slot, v_ver, v_idem, jsonb_build_object(
           'gold', -v_price,
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', 'time_buy', 'kind', p_kind, 'n', (v_q->>'bought')::int + 1,
                                                                    'block_ms', (v_q->>'block_ms')::bigint, 'from_ms', coalesce((v_q->>'ms')::bigint, (v_q->>'left_ms')::bigint),
                                                                    'level', (v_q->>'level')::int, 'at', v_at, 'auto', true, 'up_to', v_up))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then return jsonb_build_object('ok', false, 'why', coalesce(v_a->>'error', 'refused')); end if;
  if coalesce(v_a->>'replayed', 'false') = 'true' then return jsonb_build_object('ok', false, 'why', 'replayed'); end if;
  if p_kind = 'hunt' then
    update public.player_state set stamina_ms = (v_q->>'ms')::bigint + (v_q->>'block_ms')::bigint, stamina_at = v_at
     where user_id = p_user and slot = p_slot;
  end if;
  return jsonb_build_object('ok', true, 'kind', p_kind, 'price', v_price, 'n', (v_q->>'bought')::int + 1);
end $fn$;

create or replace function public.hr_time_auto_sweep(p_limit integer default 2000)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare c record; v jsonb; v_seen int := 0; v_bought int := 0; v_busy int := 0; v_err int := 0; v_msg text;
begin
  -- WORK-BLOCKS (1071-work-blocks.sql): THE STANDING RULE, EVERY MINUTE (cron 'hr-time-auto'): each hero with a rule that is hunting or
  -- doing town work gets one attempt (hr_time_auto_buy), in its own subtransaction, acting as that hero. Past p_limit candidates the
  -- order is a fresh permutation each minute (md5 with the minute), so no hero waits behind the same others every minute; a block is
  -- due for minutes on end (a hunting pool under a block, a work day's last 10 minutes), so a hero is reached long before it runs out.
  for c in select r.user_id, r.slot, r.kind from public.hero_time_rules r
             join public.player_state ps on ps.user_id = r.user_id and ps.slot = r.slot
            where (r.kind = 'hunt' and exists (select 1 from public.hunt_sessions h where h.user_id = r.user_id and h.slot = r.slot and h.ended_at is null))
               or (r.kind = 'work' and ps.active_kind = any (public.hr_work_kinds()))
            order by md5(r.user_id::text || ':' || r.slot::text || ':' || r.kind || ':' || date_trunc('minute', now())::text)
            limit greatest(1, least(coalesce(p_limit, 2000), 5000)) loop
    v_seen := v_seen + 1;
    begin
      perform set_config('request.jwt.claim.sub', c.user_id::text, true);
      v := public.hr_time_auto_buy(c.user_id, c.slot, c.kind);
      if coalesce(v->>'ok', '') = 'true' then v_bought := v_bought + 1;
      elsif v->>'why' = 'busy' then v_busy := v_busy + 1;
      elsif v->>'why' not in ('no_rule', 'not_hunting', 'not_working', 'not_yet', 'rule_limit', 'block_limit', 'replayed') then
        perform public.hr_record_rejection(c.user_id, c.slot, 'time_auto', coalesce(v->>'why', 'refused'), v, 1);
      end if;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_err := v_err + 1;
      perform public.hr_record_rejection(c.user_id, c.slot, 'time_auto', 'sweep_fault', jsonb_build_object('error', left(v_msg, 200)), 1);
    end;
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
  return jsonb_build_object('seen', v_seen, 'bought', v_bought, 'busy', v_busy, 'errors', v_err);
end $fn$;

-- ── §8 GRANTS (revoke before grant), THE BASELINE, THE GM WALL, THE CRON ────
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_time_bought(uuid,integer,text)', 'public.hr_work_extra_ms(uuid,integer)',
                               'public.hr_work_block_quote(uuid,integer)', 'public.hr_time_quote(uuid,integer,text)',
                               'public.hr_time_offer_of(uuid)', 'public.hr_time_blocks_view(uuid,integer)',
                               'public.hr_time_rule_write(uuid,integer,text,integer,bigint,text)',
                               'public.hr_time_auto_buy(uuid,integer,text)', 'public.hr_time_auto_sweep(integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
  foreach v_sig in array array['public.hr_time_buy(text,integer,bigint,uuid)', 'public.hr_time_auto_set(text,integer,integer,bigint,uuid)',
                               'public.hr_time_offer_answer(integer,integer,uuid)'] loop
    execute format('revoke execute on function %s from public, anon, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
  if to_regclass('public.hr_gm_wall_allow') is not null then
    insert into public.hr_gm_wall_allow (rpc, why) values ('hr_time_auto_set', 'its own hero''s plan'), ('hr_time_offer_answer', 'its own account''s plan')
      on conflict (rpc) do update set why = excluded.why;
  end if;
end $mig$;
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_time_buy', 'p_kind text, p_slot integer, p_price bigint, p_idem uuid', 'authenticated',
   'added 1058-hunting-blocks.sql (lane/r8-hunting-day), work kind 1071-work-blocks.sql (lane B1): MONEY (a gold sink) - a 2 h hunting block (2 a day) or town-work block (4 a day, refused day_ending), x1.5 each that UTC day, priced by the server; refuses quote_changed'),
  ('hr_time_auto_set', 'p_kind text, p_slot integer, p_up_to integer, p_max_price bigint, p_idem uuid', 'authenticated',
   'added 1071-work-blocks.sql (lane B1): a SETTING - the hero''s standing rule, buy up to N blocks of a kind a UTC day at most P gold each (off by default); the server buys them (hr_time_auto_sweep); keyed, journalled; pre-EA Security list S-22'),
  ('hr_time_offer_answer', 'p_slot integer, p_up_to integer, p_idem uuid', 'authenticated',
   'added 1071-work-blocks.sql (lane B1): a SETTING - the account''s one answer to the block-rule card (12-targets 9.3): a choice sets every hero''s rule, Not now sets none; offer_answered on a second; pre-EA Security list S-22')
  on conflict (proname, identity_args, grantee) do update set note = excluded.note;
do $mig$ begin perform public.hr_cron_ensure('hr-time-auto', '* * * * *', 'select public.hr_time_auto_sweep(2000)'); end $mig$;

-- ── §9 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- The catalogue's rows are 1072's (after this file): on a first apply the probe plants a `work` row, the leads and the rule's row inside
-- its rolled-back block (they read back as whatever it planted; no lever is asserted here, the generated file pins those).
-- (a) THE PRESS, TOWN WORK: a hero whose day's work is used up buys four work blocks at the twin's price, each raising today's cap by
--     a block and writing ONE shop row; the fifth is quoted block_limit and a forged press of it is refused and moves nothing; a wrong
--     price is quote_changed; a replayed key moves nothing; a kind with no branch is bad_kind. Late in the UTC day (less than a block
--     before midnight: now() is one instant in the apply) the first block is quoted day_ending instead, and its press is refused.
-- (b) THE RULE: off by default (no row, `auto` null); a working hero with a rule of 1 and its day's bought work under the lead is bought
--     ONE block by hr_time_auto_buy (meta.auto), and the next attempt is rule_limit; a purse that would fall under the reserve is
--     rule_reserve; a hero not working is not_working; the setting off deletes the row; a forged count is bad_intent.
-- (c) THE OFFER: a purse under 3 days of the company's pay shows none; over it shows the offer; [Up to 2] sets the rule on both heroes
--     of the account and the offer is gone; a second answer is offer_answered.
-- (d) THE SURFACE: no client role reaches the internal functions or the tables; the three verbs are exactly the signed-in client's;
--     the baseline names them; the cron is scheduled; grant hygiene is quiet.
do $$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-000000b10071';
  v jsonb; q jsonb; v_g bigint; v_p bigint; v_base bigint; v_block bigint; v_per int; v_room bigint; v_lv int; v_i int; v_role text;
  v_node text; v_ver bigint;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u, 'role', 'authenticated')::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'work-blocks §9 probe') on conflict (user_id) do nothing;
    update public.hr_flags set enabled = false where key = 'beta_premium';
    -- the catalogue's rows, planted only if 1072 has not written them (a first apply)
    if not exists (select 1 from public.hr_time_blocks where kind = 'work') then
      insert into public.hr_time_blocks (kind, block_min, per_day, growth_num, growth_den, price_hour_pm, lead_min)
        select 'work', h.block_min, 4, h.growth_num, h.growth_den, h.price_hour_pm, 10 from public.hr_time_blocks h where h.kind = 'hunt';
    end if;
    update public.hr_time_blocks set lead_min = coalesce(lead_min, block_min);
    if not exists (select 1 from public.hr_time_standing) then
      insert into public.hr_time_standing (id, reserve_hours_pm, offer_kind, offer_days_pm, offer_choices) values (true, 20000, 'hunt', 3000, array[1, 2]);
    end if;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): the second hero refused: %', v; end if;
    update public.player_state set premium_until = null where user_id = v_u;
    insert into public.account_wallet as w (user_id, gold) values (v_u, 1000000000)
      on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now();
    select b.block_min::bigint * 60000, b.per_day into v_block, v_per from public.hr_time_blocks b where b.kind = 'work';
    v_base := public.hr_work_base_ms(v_u, 0);
    v_lv := greatest(1, coalesce(public.hr_level_of(v_u, 0), 1));
    v_room := floor(extract(epoch from (public.hr_utc_day_start(now()) + interval '1 day' - now())) * 1000)::bigint;
    -- (a) the press: the day's work used up, then each block worked through before the next is bought
    update public.player_state set work_day = (now() at time zone 'utc')::date, work_ms = v_base where user_id = v_u and slot = 0;
    q := public.hr_state_of(v_u, 0)->'time_blocks'->'work';
    if q is distinct from public.hr_work_block_quote(v_u, 0) then raise exception 'VERIFY(a): the section reads % not the quote', q; end if;
    if q->'auto' <> 'null'::jsonb then raise exception 'VERIFY(b): a new hero''s rule is not off: %', q; end if;
    if v_room < v_block then
      if q->>'why' is distinct from 'day_ending' then raise exception 'VERIFY(a): % ms before midnight the block quotes %', v_room, q; end if;
      v := public.hr_time_buy('work', 0, public.hr_time_block_price('work', v_lv, 1), '000000c0-0000-4000-a000-000000b17101');
      if v->>'error' is distinct from 'day_ending' then raise exception 'VERIFY(a): a block today cannot use answered %', v; end if;
    else
      v_g := public.hr_purse_of(v_u);
      for v_i in 1 .. v_per loop
        delete from public.hr_rate_counters where user_id = v_u;
        q := public.hr_work_block_quote(v_u, 0);
        v_p := public.hr_time_block_price('work', v_lv, v_i);
        if not (q->>'available')::boolean or (q->>'price')::bigint <> v_p or (q->>'n')::int <> v_i or (q->>'cap_ms')::bigint <> v_base + (v_i - 1) * v_block then
          raise exception 'VERIFY(a): work block % quotes % (want % at cap %)', v_i, q, v_p, v_base + (v_i - 1) * v_block; end if;
        if v_i = 1 then
          v := public.hr_time_buy('work', 0, v_p + 1, '000000c0-0000-4000-a000-000000b17102');
          if v->>'error' is distinct from 'quote_changed' or public.hr_purse_of(v_u) <> v_g then raise exception 'VERIFY(a): a wrong price answered %', v; end if;
        end if;
        v := public.hr_time_buy('work', 0, v_p, ('000000c0-0000-4000-a000-0000b171' || lpad(v_i::text, 4, '0'))::uuid);
        if coalesce(v->>'ok', '') <> 'true' or v->'envelope'->'time_blocks'->'work' is null then raise exception 'VERIFY(a): work block % answered %', v_i, v; end if;
        v_g := v_g - v_p;
        if public.hr_purse_of(v_u) <> v_g or public.hr_work_extra_ms(v_u, 0) <> v_i * v_block
           or (select count(*) from public.player_ledger where user_id = v_u and kind = 'shop' and intent = 'time_buy:work:' || v_p) <> 1 then
          raise exception 'VERIFY(a): after work block % the purse is % (want %), the extra % ms', v_i, public.hr_purse_of(v_u), v_g, public.hr_work_extra_ms(v_u, 0); end if;
        if v_i = 1 then
          v := public.hr_time_buy('work', 0, v_p, ('000000c0-0000-4000-a000-0000b171' || lpad(v_i::text, 4, '0'))::uuid);
          if public.hr_purse_of(v_u) <> v_g or (select count(*) from public.player_ledger where user_id = v_u and intent like 'time\_buy:work:%') <> 1 then
            raise exception 'VERIFY(a): a replayed key charged again: %', v; end if;
        end if;
        -- the hero works the block it bought
        update public.player_state set work_ms = v_base + v_i * v_block where user_id = v_u and slot = 0;
      end loop;
      q := public.hr_work_block_quote(v_u, 0);
      if (q->>'available')::boolean or q->>'why' is distinct from 'block_limit' or (q->>'bought')::int <> v_per then
        raise exception 'VERIFY(a): past the day''s work blocks quotes %', q; end if;
      delete from public.hr_rate_counters where user_id = v_u;
      v := public.hr_time_buy('work', 0, v_p, '000000c0-0000-4000-a000-000000b17103');
      if v->>'error' is distinct from 'block_limit' or public.hr_purse_of(v_u) <> v_g then raise exception 'VERIFY(a): a fifth work block answered %', v; end if;
    end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_time_buy('rest', 0, 100, '000000c0-0000-4000-a000-000000b17104');
    if v->>'error' is distinct from 'bad_kind' then raise exception 'VERIFY(a): a kind with no branch answered %', v; end if;

    -- (b) the rule, on hero 1 (a fresh day): off by default; a forged count; on at 1; due only while working and under the lead
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_time_auto_set('work', 1, v_per + 1, null, '000000c0-0000-4000-a000-000000b17110');
    if v->>'error' is distinct from 'bad_intent' then raise exception 'VERIFY(b): a forged count answered %', v; end if;
    v := public.hr_time_auto_set('work', 1, 1, null, '000000c0-0000-4000-a000-000000b17111');
    if coalesce(v->>'ok', '') <> 'true' or (v->'envelope'->'time_blocks'->'work'->'auto'->>'up_to')::int <> 1 then raise exception 'VERIFY(b): the rule set answered %', v; end if;
    v := public.hr_time_auto_buy(v_u, 1, 'work');
    if v->>'why' is distinct from 'not_working' then raise exception 'VERIFY(b): a hero not working answered %', v; end if;
    select a.activity_id into v_node from public.hr_activities a where a.kind = 'gather' and a.req_skill = 'mining' and coalesce(a.req_lv, 1) <= 1
     order by a.activity_id limit 1;
    select version into v_ver from public.player_state where user_id = v_u and slot = 1;
    v := public.hr_apply(v_u, 1, v_ver, '000000c0-0000-4000-a000-000000b17112', jsonb_build_object('activity',
           jsonb_build_object('kind', 'gather', 'id', v_node, 'restart', true, 'count', 100000, 'next', 'wait')));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the probe hero''s job was refused: %', v; end if;
    update public.player_state set work_day = (now() at time zone 'utc')::date, work_ms = 0 where user_id = v_u and slot = 1;
    v := public.hr_time_auto_buy(v_u, 1, 'work');
    if v->>'why' is distinct from 'not_yet' then raise exception 'VERIFY(b): a full day''s work left answered %', v; end if;
    update public.player_state set work_ms = v_base - 60000 where user_id = v_u and slot = 1;
    v_g := public.hr_purse_of(v_u);
    v_p := public.hr_time_block_price('work', v_lv, 1);
    update public.account_wallet set gold = v_p + (select ceil(s.reserve_hours_pm::numeric * public.hr_wage(v_lv) / 1000)::bigint from public.hr_time_standing s) - 1
     where user_id = v_u;
    v := public.hr_time_auto_buy(v_u, 1, 'work');
    if v_room >= v_block + 60000 and v->>'why' is distinct from 'rule_reserve' then raise exception 'VERIFY(b): a purse under the reserve answered %', v; end if;
    update public.account_wallet set gold = v_g where user_id = v_u;
    v := public.hr_time_auto_buy(v_u, 1, 'work');
    if v_room >= v_block + 60000 then
      if coalesce(v->>'ok', '') <> 'true' or public.hr_purse_of(v_u) <> v_g - v_p
         or not exists (select 1 from public.player_ledger where user_id = v_u and slot = 1 and intent = 'time_buy:work:' || v_p and meta->>'auto' = 'true') then
        raise exception 'VERIFY(b): the due block answered % (purse % want %)', v, public.hr_purse_of(v_u), v_g - v_p; end if;
      v := public.hr_time_auto_buy(v_u, 1, 'work');
      if v->>'why' is distinct from 'rule_limit' then raise exception 'VERIFY(b): a second block past a rule of 1 answered %', v; end if;
    elsif v->>'why' is distinct from 'day_ending' then raise exception 'VERIFY(b): late in the day the rule answered %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_time_auto_set('work', 1, 0, null, '000000c0-0000-4000-a000-000000b17113');
    if coalesce(v->>'ok', '') <> 'true' or exists (select 1 from public.hero_time_rules where user_id = v_u and slot = 1) then raise exception 'VERIFY(b): the rule off answered %', v; end if;

    -- (c) the offer: under 3 days of the company's pay none, over it one; the answer sets both heroes' rule, once
    update public.account_wallet set gold = 0 where user_id = v_u;
    if public.hr_time_offer_of(v_u) is not null then raise exception 'VERIFY(c): an empty purse is offered %', public.hr_time_offer_of(v_u); end if;
    update public.account_wallet set gold = 1000000000 where user_id = v_u;
    q := public.hr_state_of(v_u, 0)->'time_blocks'->'offer';
    if q is null or q->>'kind' is distinct from (select offer_kind from public.hr_time_standing) then raise exception 'VERIFY(c): a full purse is offered %', q; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v_i := (q->'choices'->>(jsonb_array_length(q->'choices') - 1))::int;
    v := public.hr_time_offer_answer(0, v_i, '000000c0-0000-4000-a000-000000b17120');
    if coalesce(v->>'ok', '') <> 'true' or (v->>'heroes')::int <> 2
       or (select count(*) from public.hero_time_rules where user_id = v_u and kind = q->>'kind' and up_to = v_i) <> 2
       or public.hr_time_offer_of(v_u) is not null then
      raise exception 'VERIFY(c): the answer answered % and the rules read %', v, (select jsonb_agg(r) from public.hero_time_rules r where r.user_id = v_u); end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_time_offer_answer(0, 0, '000000c0-0000-4000-a000-000000b17121');
    if v->>'error' is distinct from 'offer_answered' then raise exception 'VERIFY(c): a second answer answered %', v; end if;
    raise exception using errcode = 'HR871', message = 'work-blocks §9 complete - rolling back';
  exception when sqlstate 'HR871' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.account_time_offers where user_id = v_u) then
    raise exception 'VERIFY(d): §9 LEAKED a probe row'; end if;
  -- (d) the surface
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hero_time_rules', 'select') or has_table_privilege(v_role, 'public.hero_time_rules', 'insert')
       or has_table_privilege(v_role, 'public.account_time_offers', 'select') or has_table_privilege(v_role, 'public.hr_time_standing', 'select')
       or has_function_privilege(v_role, 'public.hr_time_auto_buy(uuid,integer,text)', 'execute')
       or has_function_privilege(v_role, 'public.hr_time_auto_sweep(integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_time_rule_write(uuid,integer,text,integer,bigint,text)', 'execute')
       or has_function_privilege(v_role, 'public.hr_work_block_quote(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_time_offer_of(uuid)', 'execute')
       or has_function_privilege(v_role, 'public.hr_time_bought(uuid,integer,text)', 'execute') then
      raise exception 'VERIFY(d): % reaches the rule''s tables or an internal function', v_role; end if;
  end loop;
  foreach v_role in array array['public.hr_time_buy(text,integer,bigint,uuid)', 'public.hr_time_auto_set(text,integer,integer,bigint,uuid)',
                                 'public.hr_time_offer_answer(integer,integer,uuid)'] loop
    if has_function_privilege('anon', v_role, 'execute') or not has_function_privilege('authenticated', v_role, 'execute') then
      raise exception 'VERIFY(d): % is not exactly the signed-in client''s', v_role; end if;
  end loop;
  if (select count(*) from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_time_buy', 'hr_time_auto_set', 'hr_time_offer_answer')) <> 3 then
    raise exception 'VERIFY(d): the client baseline does not name the three verbs'; end if;
  if to_regclass('cron.job') is not null and not exists (select 1 from cron.job where jobname = 'hr-time-auto') then
    raise exception 'VERIFY(d): the sweep is not scheduled'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'work-blocks: town work bought in blocks (4 a day, x1.5, refused when today cannot use one), the standing rule off by default and bought by the sweep inside the press''s rules, the offer once; all green';
end $$;
